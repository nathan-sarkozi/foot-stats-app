'use client'

import { useEffect, useState } from 'react'

/** Hide the fixed bar only when an editable field and a substantially reduced
 * visual viewport indicate an on-screen keyboard. Browser chrome alone is not
 * enough. No field value is read. */
export default function useSoftKeyboard() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return
    let baseline = Math.max(window.innerHeight, viewport.height)
    const update = () => {
      const element = document.activeElement
      const editable = element instanceof HTMLElement && (element.isContentEditable || element.tagName === 'TEXTAREA' || (element instanceof HTMLInputElement && !['button', 'checkbox', 'radio', 'submit', 'reset', 'file', 'range', 'color', 'hidden'].includes(element.type)))
      if (!editable) baseline = Math.max(window.innerHeight, viewport.height)
      else baseline = Math.max(baseline, window.innerHeight)
      setOpen(Boolean(editable && baseline - viewport.height > 150))
    }
    const rotate = () => { baseline = Math.max(window.innerHeight, viewport.height); update() }
    viewport.addEventListener('resize', update)
    document.addEventListener('focusin', update)
    document.addEventListener('focusout', update)
    window.addEventListener('orientationchange', rotate)
    return () => {
      viewport.removeEventListener('resize', update)
      document.removeEventListener('focusin', update)
      document.removeEventListener('focusout', update)
      window.removeEventListener('orientationchange', rotate)
    }
  }, [])
  return open
}
