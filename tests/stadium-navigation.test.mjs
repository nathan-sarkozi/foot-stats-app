import assert from 'node:assert/strict'
import { test } from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { loadUiModule } from './helpers/load-ui-module.mjs'

// Offline UI contracts. No .env, Supabase, Auth, Storage or external request.
const component = value => ({__esModule:true,default:value})
const next = {
  'next/link': component(({children,...props})=>React.createElement('a',props,children)),
  'next/image': component(({src,alt})=>React.createElement('img',{src,alt})),
}
const brand = loadUiModule('src/components/FootStatsBrand.tsx',next).default
const frame = loadUiModule('src/components/AuthFrame.tsx',{'@/components/FootStatsBrand':component(brand),'./FootStatsBrand':component(brand)}).default
function nav(path='/dashboard', props={}) {
  const logout=async()=>{}
  const effects=[]
  const Nav=loadUiModule('src/app/dashboard/components/Navbar.tsx',{
    ...next, react:{...React,useId:()=> 'synthetic-menu',useRef:()=>({current:null}),useEffect:fn=>effects.push(fn)},
    'next/navigation':{usePathname:()=>path}, './logoutAction':{logout}, '@/components/FootStatsBrand':component(brand),
  }).default
  const tree=Nav(props)
  return {tree,html:renderToStaticMarkup(tree),effects,logout}
}
function elements(node, type) {
  if(!node||typeof node!=='object')return []
  return [...(node.type===type?[node]:[]),...React.Children.toArray(node.props?.children).flatMap(child=>elements(child,type))]
}

test('navigation keeps every destination and both logout forms use the unchanged action',()=>{
  const {tree,html,logout}=nav()
  for(const href of ['/dashboard','/dashboard/community','/dashboard/career','/dashboard/settings','/dashboard/add-match'])assert.ok(html.includes(`href="${href}"`))
  assert.equal(elements(tree,'form').length,2)
  for(const form of elements(tree,'form'))assert.equal(form.props.action,logout)
  assert.match(html,/aria-label="Navigation principale"/)
  assert.match(html,/aria-controls="synthetic-menu"/)
  assert.match(html,/<details[^>]*>/)
  assert.doesNotMatch(html,/<details[^>]* open/)
  assert.match(html,/Menu de navigation/)
})

test('active navigation identifies pages, nested edits and public profiles without marking other sections',()=>{
  for(const [path,active] of [
    ['/dashboard','/dashboard'],['/dashboard/add-match','/dashboard'],['/dashboard/edit-match/id','/dashboard'],
    ['/dashboard/community','/dashboard/community'],['/profile/id','/dashboard/community'],['/profile/id/career','/dashboard/community'],
    ['/dashboard/career','/dashboard/career'],['/dashboard/career/edit/id','/dashboard/career'],['/dashboard/settings','/dashboard/settings'],
  ]) {
    const {tree}=nav(path)
    const html=renderToStaticMarkup(tree)
    const activeLinks=[...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*aria-current="(?:page|location)"/g)].map(m=>m[1])
    assert.ok(activeLinks.length>0,path)
    assert.ok(activeLinks.every(href=>href===active),`${path}: ${activeLinks}`)
  }
})

test('navigation uses supplied avatars and gives a nonempty fallback without inventing player information',()=>{
  assert.match(nav('/dashboard',{initials:'AB',avatarUrl:null}).html,/>AB</)
  assert.match(nav('/dashboard',{initials:null,avatarUrl:null}).html,/>FS</)
  assert.match(nav('/dashboard',{avatarUrl:'/synthetic-avatar.png'}).html,/src="\/synthetic-avatar.png"/)
})

async function community(profiles=[],error=null) {
  const calls=[]
  const builder={select(value){calls.push(['select',value]);return builder},order(...args){calls.push(['order',...args]);return builder},limit(value){calls.push(['limit',value]);return Promise.resolve({data:profiles,error})}}
  const Page=loadUiModule('src/app/dashboard/community/page.tsx',{...next,'@/utils/supabase/server':{createClient:async()=>({from:table=>{calls.push(['from',table]);return builder}})}}).default
  return {html:renderToStaticMarkup(await Page()),calls}
}

test('community preserves exact projection, alphabetical ordering, limit and every public profile link',async()=>{
  const players=[{id:'a',display_name:'Synthetic Alpha',avatar_url:'/synthetic.png',club:'Synthetic club',category:'Senior',preferred_position:'MC'},
    {id:'b',display_name:'Synthetic Bravo',avatar_url:null,club:null,category:null,preferred_position:null}]
  const {html,calls}=await community(players)
  assert.deepEqual(JSON.parse(JSON.stringify(calls)),[['from','profiles'],['select','id, display_name, avatar_url, club, category, preferred_position'],['order','display_name',{ascending:true}],['limit',50]])
  for(const p of players)assert.ok(html.includes(`href="/profile/${p.id}"`))
  assert.ok(html.indexOf('Synthetic Alpha')<html.indexOf('Synthetic Bravo'))
  assert.match(html,/src="\/synthetic.png"/)
  assert.match(html,/>SY</)
  assert.match(html,/Club non renseigné/)
  assert.match(html,/Poste non renseigné/)
})

test('community distinguishes an empty directory from a read failure',async()=>{
  assert.match((await community()).html,/Aucun joueur à afficher/)
  const failure=await community(null,{message:'Synthetic read failure'})
  assert.match(failure.html,/role="alert"/)
  assert.match(failure.html,/Erreur lors du chargement des joueurs/)
  assert.doesNotMatch(failure.html,/Aucun joueur à afficher/)
})

test('login retains action, fields, required attributes, translated errors and registration link',async()=>{
  const login=async()=>{}
  const Page=loadUiModule('src/app/login/page.tsx',{
    ...next,'./actions':{login},'@/components/AuthFrame':component(frame),
    '@/app/dashboard/components/SubmitButton':component(({defaultLabel})=>React.createElement('button',{type:'submit'},defaultLabel)),
  }).default
  for(const [error,message] of [['Missing credentials','Identifiants manquants.'],['Could not authenticate user','Vérifie tes identifiants.'],['Synthetic error','Synthetic error']]) {
    const tree=await Page({searchParams:Promise.resolve({error})})
    assert.equal(elements(tree,'form')[0].props.action,login)
    const html=renderToStaticMarkup(tree)
    const inputs=elements(tree,'input')
    for(const key of ['email','password']) {
      const input=inputs.find(node=>node.props.name===key)
      assert.equal(input.props.id,key)
      assert.equal(input.props.type,key)
      assert.equal(input.props.required,true)
    }
    assert.ok(html.includes(message),error)
    assert.match(html,/role="alert"/)
    assert.match(html,/href="\/register"/)
  }
})

test('shared submit appearance keeps form pending behavior and default form styling',()=>{
  for(const pending of [false,true]) {
    const Button=loadUiModule('src/app/dashboard/components/SubmitButton.tsx',{
      'react-dom':{useFormStatus:()=>({pending})},'@/utils/cn':{cn:(...args)=>args.filter(Boolean).join(' ')},
    }).default
    const props={defaultLabel:'Continuer',loadingLabel:'Chargement...'}
    const legacy=renderToStaticMarkup(React.createElement(Button,props))
    const stade=renderToStaticMarkup(React.createElement(Button,{...props,appearance:'stade'}))
    assert.match(legacy,/bg-indigo-600/)
    assert.match(stade,/primaryButton/)
    for(const html of [legacy,stade]) {
      assert.ok(html.includes(pending?'Chargement...':'Continuer'))
      assert.equal(html.includes('disabled=""'),pending)
      assert.ok(html.includes(`aria-busy="${pending}"`))
    }
  }
})

test('mobile disclosure closes on Escape, outside events, route changes and desktop resize, with cleanup',()=>{
  const listeners=new Map(), mediaListeners=new Map(), effects=[]
  class FakeNode {}
  const child=new FakeNode(), outside=new FakeNode()
  const document={activeElement:child,addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)}
  const summary=new FakeNode();summary.focus=()=>{document.activeElement=summary}
  const desktopLink=new FakeNode();desktopLink.focus=()=>{document.activeElement=desktopLink}
  const details={open:false,contains:node=>node===child||node===summary,closest:()=>({querySelector:()=>desktopLink})}
  const media={matches:false,addEventListener:(name,fn)=>mediaListeners.set(name,fn),removeEventListener:name=>mediaListeners.delete(name)}
  const Nav=loadUiModule('src/app/dashboard/components/Navbar.tsx',{
    ...next,react:{...React,useId:()=> 'synthetic-menu',useRef:()=>({current:null}),useEffect:fn=>effects.push(fn)},
    'next/navigation':{usePathname:()=>'/dashboard'},'./logoutAction':{logout:async()=>{}},'@/components/FootStatsBrand':component(brand),
  },{document,window:{matchMedia:()=>media},Node:FakeNode}).default
  const tree=Nav({})
  elements(tree,'details')[0].props.ref.current=details
  elements(tree,'summary')[0].props.ref.current=summary
  const cleanup=effects[0]()
  assert.equal(listeners.size,3)
  details.open=true
  let prevented=false
  listeners.get('keydown')({key:'Escape',preventDefault(){prevented=true}})
  assert.equal(details.open,false)
  assert.equal(prevented,true)
  assert.equal(document.activeElement,summary)
  details.open=true
  listeners.get('pointerdown')({target:child})
  assert.equal(details.open,true,'inside interaction keeps the menu open')
  listeners.get('pointerdown')({target:outside})
  assert.equal(details.open,false)
  details.open=true
  listeners.get('focusin')({target:outside})
  assert.equal(details.open,false)
  details.open=true
  effects[1]()
  assert.equal(details.open,false,'route effect closes the disclosure')
  details.open=true;document.activeElement=child;media.matches=true
  mediaListeners.get('change')()
  assert.equal(details.open,false)
  assert.equal(document.activeElement,desktopLink,'focus moves to visible desktop navigation')
  cleanup()
  assert.equal(listeners.size,0)
  assert.equal(mediaListeners.size,0)
})
