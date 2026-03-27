import { useCallback, useEffect, useRef } from 'react'

export function useIntersectionObserver(onIntersect, optionsOrFn = {}) {
  const cbRef = useRef(onIntersect)
  useEffect(() => {
    cbRef.current = onIntersect
  }, [onIntersect])

  const optsRef = useRef(optionsOrFn)
  useEffect(() => {
    optsRef.current = optionsOrFn
  }, [optionsOrFn])

  const obsRef = useRef(null)

  return useCallback((el) => {
    obsRef.current?.disconnect()
    obsRef.current = null
    if (!el) return
    const opts = typeof optsRef.current === 'function' ? optsRef.current() : optsRef.current
    obsRef.current = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) cbRef.current()
    }, opts)
    obsRef.current.observe(el)
  }, [])
}
