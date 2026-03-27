import { useCallback, useEffect, useRef } from 'react'

export function useTextareaAutosize(maxHeight) {
  const frameRef = useRef(null)

  const resizeNow = useCallback(
    (element) => {
      if (!element) return

      element.style.height = 'auto'

      const scrollHeight = element.scrollHeight
      const nextHeight = Math.min(scrollHeight, maxHeight)
      const nextOverflow = scrollHeight > maxHeight ? 'auto' : 'hidden'

      element.style.height = `${nextHeight}px`

      if (element.style.overflowY !== nextOverflow) {
        element.style.overflowY = nextOverflow
      }
    },
    [maxHeight]
  )

  const scheduleResize = useCallback(
    (element) => {
      if (!element) return

      if (frameRef.current) cancelAnimationFrame(frameRef.current)

      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null
        resizeNow(element)
      })
    },
    [resizeNow]
  )

  useEffect(() => {
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current)
    }
  }, [])

  return { resizeNow, scheduleResize }
}
