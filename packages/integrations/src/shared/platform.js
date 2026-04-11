export const PLATFORM = process.platform

const unsupported = (label) => () => {
  throw new Error(`${label} tools are not available on ${PLATFORM}.`)
}

export const resolveExecutors = (implementations, label) => {
  const platformFns = implementations[PLATFORM] || {}
  const fallback = unsupported(label)
  const executors = {}
  const allNames = new Set(Object.values(implementations).flatMap(Object.keys))
  for (const name of allNames) {
    const fn = platformFns[name]
    executors[name] = (_ctx) => fn || fallback
  }
  return executors
}

export const makePlatformTools = (definitions, executors) =>
  definitions.map((def) => ({
    definition: def,
    execute: executors[def.name]
  }))
