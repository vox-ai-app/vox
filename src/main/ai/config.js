import { getBaseUrl } from './server.js'

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

export const MAX_CONCURRENT_AGENTS = 2