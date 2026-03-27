export function canParallelize(calls, definitions) {
  if (calls.length <= 1) return false
  return calls.every((c) => {
    const def = definitions.find((d) => d.name === c.name)
    return def?.readOnly === true
  })
}

export async function executeToolsParallel(calls, toolsFn, signal) {
  return Promise.all(
    calls.map(async (call) => {
      try {
        const output = await toolsFn(call.name, call.args, { signal })
        return { call, output, error: null }
      } catch (err) {
        return { call, output: { error: err.message }, error: err }
      }
    })
  )
}
