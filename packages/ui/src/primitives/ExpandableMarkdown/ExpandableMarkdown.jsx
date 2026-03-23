import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

function useOverflowState(expanded, text) {
  const ref = useRef(null)
  const [overflows, setOverflows] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const frame = requestAnimationFrame(() => {
      setOverflows(!expanded && element.scrollHeight > element.clientHeight + 2)
    })
    return () => cancelAnimationFrame(frame)
  }, [expanded, text])

  return { ref, overflows }
}

export default function ExpandableMarkdown({
  containerClassName,
  collapsedClassName,
  text,
  expandLabel = 'Read more',
  collapseLabel = 'Show less'
}) {
  const [expanded, setExpanded] = useState(false)
  const { ref, overflows } = useOverflowState(expanded, text)

  return (
    <div className={containerClassName}>
      <div ref={ref} className={expanded ? '' : collapsedClassName}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
      </div>
      {(overflows || expanded) && (
        <button
          className="activity-tool-expand"
          onClick={() => setExpanded((value) => !value)}
          type="button"
        >
          {expanded ? collapseLabel : expandLabel}
        </button>
      )}
    </div>
  )
}
