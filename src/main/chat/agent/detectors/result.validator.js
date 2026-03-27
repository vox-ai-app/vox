const ERROR_PATTERNS = [
  {
    pattern: /permission denied/i,
    hint: 'Check file permissions or run with elevated privileges.'
  },
  {
    pattern: /ENOENT|no such file|not found/i,
    hint: 'The file or path does not exist. Verify the path is correct.'
  },
  {
    pattern: /ECONNREFUSED|connection refused/i,
    hint: 'The service is not running or wrong port/host.'
  },
  {
    pattern: /timeout|timed out/i,
    hint: 'Operation took too long. Check network or reduce scope.'
  },
  {
    pattern: /ENOMEM|out of memory/i,
    hint: 'Not enough memory. Try processing in smaller batches.'
  },
  {
    pattern: /syntax error|unexpected token/i,
    hint: 'Code has syntax errors. Review the code carefully.'
  },
  {
    pattern: /module not found|cannot find module/i,
    hint: 'Missing dependency. Install the required package.'
  },
  { pattern: /401|unauthorized/i, hint: 'Authentication failed. Check credentials or tokens.' },
  { pattern: /403|forbidden/i, hint: 'Access denied. Check permissions or API limits.' },
  { pattern: /404/i, hint: 'Resource not found. Verify the URL or path exists.' },
  { pattern: /429|rate limit/i, hint: 'Rate limited. Add delays between requests.' },
  { pattern: /500|internal server error/i, hint: 'Server error. The external service may be down.' }
]

function detectErrorPattern(text) {
  if (!text || typeof text !== 'string') return null
  for (const { pattern, hint } of ERROR_PATTERNS) {
    if (pattern.test(text)) return hint
  }
  return null
}

export function validateToolResult(toolName, result) {
  const warnings = []

  if (result === null || result === undefined) {
    warnings.push('Result is null/undefined — the tool may have failed silently.')
  }

  if (result?.error) {
    warnings.push(`Tool returned error: ${result.error}`)
    const hint = detectErrorPattern(result.error)
    if (hint) warnings.push(`Hint: ${hint}`)
  }

  if (result?.exitCode !== undefined && result.exitCode !== 0) {
    warnings.push(`Command failed with exit code ${result.exitCode}.`)
  }

  const output = result?.output || result?.stdout || result?.content
  if (typeof output === 'string') {
    if (output.trim() === '') {
      warnings.push('Output is empty — this may indicate a problem or wrong target.')
    }
    const hint = detectErrorPattern(output)
    if (hint) warnings.push(`Detected issue in output: ${hint}`)
  }

  if (result?.stderr && result.stderr.trim()) {
    const hint = detectErrorPattern(result.stderr)
    if (hint) warnings.push(`Stderr warning: ${hint}`)
  }

  if (Array.isArray(result) && result.length === 0) {
    warnings.push('Result is an empty array — search/list found nothing.')
  }

  if (toolName === 'read_file' && (!output || output.trim() === '')) {
    warnings.push('File appears empty or unreadable.')
  }

  if (['search', 'grep', 'find'].includes(toolName)) {
    if (Array.isArray(result) && result.length === 0) {
      warnings.push('Search returned no results — try different terms or paths.')
    }
  }

  return warnings
}

export function buildValidationPrompt(toolName, warnings) {
  if (!warnings.length) return null
  return `⚠️ VALIDATION WARNING for ${toolName}:\n${warnings.map((w) => `- ${w}`).join('\n')}\n\nBefore proceeding:\n1. Acknowledge this issue in your thoughts\n2. Decide: retry with different approach, investigate further, or note as blocker\n3. Do NOT ignore this and continue as if it succeeded`
}
