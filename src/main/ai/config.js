import { getBaseUrl } from './llm/server.js'

export async function getContextSize() {
  try {
    const resp = await fetch(`${getBaseUrl()}/props`)
    if (!resp.ok) return 32768
    const props = await resp.json()
    return props.n_ctx ?? 32768
  } catch {
    return 32768
  }
}

const FALLBACK_CONTEXT_SIZE = 32768
export const CONTEXT_CHAR_THRESHOLD = Math.floor(FALLBACK_CONTEXT_SIZE * 3.5 * 0.6)
export const CONTEXT_KEEP_RECENT_CHARS = Math.floor(CONTEXT_CHAR_THRESHOLD * 0.5)

export const MAX_CONCURRENT_AGENTS = 2
