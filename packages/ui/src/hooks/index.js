import { useEffect, useRef } from 'react'

export function useClickOutside(handler) {
  const ref = useRef(null)

  useEffect(() => {
    if (!handler) return

    const listener = (event) => {
      if (!ref.current?.contains(event.target)) handler(event)
    }

    window.addEventListener('mousedown', listener)
    return () => window.removeEventListener('mousedown', listener)
  }, [handler])

  return ref
}

export function useEscapeKey(handler) {
  useEffect(() => {
    if (!handler) return

    const onKeyDown = (e) => {
      if (e.key === 'Escape') handler(e)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handler])
}

export function useIntersectionObserver(callback, options) {
  const ref = useRef(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const observer = new IntersectionObserver(callback, options)
    observer.observe(element)
    return () => observer.disconnect()
  }, [callback, options])

  return ref
}
