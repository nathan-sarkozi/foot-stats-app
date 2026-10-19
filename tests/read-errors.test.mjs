import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderServerPage } from './helpers/render-server-page.mjs'

// Offline rendering of the real public pages. Database failures and missing
// rows are separate synthetic responses; no network or environment loading.
const publicPages = [
  'src/app/profile/[userId]/layout.tsx',
  'src/app/profile/[userId]/page.tsx',
  'src/app/profile/[userId]/career/page.tsx',
]

async function expectReadFailure(t, page, options) {
  const logs = []
  t.mock.method(console, 'error', (...args) => logs.push(args))
  await assert.rejects(renderServerPage(page, options), error => {
    assert.notEqual(error.message, 'NOT_FOUND')
    assert.doesNotMatch(error.message, /synthetic database detail|42501|PGRST/)
    return true
  })
  assert.equal(logs.length, 1)
}

for (const page of publicPages) {
  test(`${page}: malformed resource identifiers are rejected before database access`, async t => {
    const logs = []
    t.mock.method(console, 'error', (...args) => logs.push(args))
    await assert.rejects(renderServerPage(page, {
      userId: 'not-a-uuid', profileError: { code: '22P02', message: 'synthetic database detail' },
    }), /NOT_FOUND/)
    assert.equal(logs.length, 0)
  })

  test(`${page}: a missing target profile is a real not-found response`, async () => {
    await assert.rejects(renderServerPage(page, { profile: null }), /NOT_FOUND/)
  })

  test(`${page}: profile read failures are reported as errors rather than missing profiles`, async t => {
    await expectReadFailure(t, page, {
      profile: null,
      profileError: { code: '42501', message: 'synthetic database detail' },
    })
  })

  test(`${page}: an existing profile uses optional single-row reads and stays visible without statistics`, async () => {
    const { html, queries } = await renderServerPage(page)
    const targetQueries = queries.filter(query => query.table === 'profiles'
      && query.select !== 'display_name, avatar_url')
    assert.equal(targetQueries.length, 1)
    assert.equal(targetQueries[0].singleRow, 'maybeSingle')
    assert.doesNotMatch(html, /NOT_FOUND|synthetic database detail/)
    if (page.endsWith('/layout.tsx')) assert.match(html, /Synthetic child content/)
    else if (page.endsWith('/career/page.tsx')) assert.match(html, /Synthetic club/)
    else assert.match(html, /Aucun match enregistré/)
  })
}

test('public profile statistics failures do not fabricate a missing player', async t => {
  await expectReadFailure(t, 'src/app/profile/[userId]/page.tsx', {
    statisticsError: { code: 'PGRST200', message: 'synthetic database detail' },
  })
})

test('public career list failures do not fabricate a missing player', async t => {
  await expectReadFailure(t, 'src/app/profile/[userId]/career/page.tsx', {
    careerError: { code: '42501', message: 'synthetic database detail' },
  })
})

test('public layout visitor-profile failures are not silently ignored', async t => {
  await expectReadFailure(t, 'src/app/profile/[userId]/layout.tsx', {
    visitorProfileError: { code: '42501', message: 'synthetic database detail' },
  })
})

test('an absent visitor profile does not hide an existing public profile', async () => {
  const { html } = await renderServerPage('src/app/profile/[userId]/layout.tsx', { visitorProfile: null })
  assert.match(html, /Synthetic player|Synthetic child content/)
})

test('an anonymous visitor can still render an existing public profile layout', async () => {
  const { html, queries } = await renderServerPage('src/app/profile/[userId]/layout.tsx', { user: null })
  assert.match(html, /Synthetic player/)
  assert.equal(queries.filter(query => query.table === 'profiles').length, 1)
})
