import { exec } from 'child_process'
import os from 'os'
import { clampNumber } from '../schema.js'
import { resolveLocalPath } from './fs.js'
const definition = {
  name: 'run_local_command',
  description:
    "Run a shell command on the user's local machine. Use for anything that needs OS interaction: running scripts, managing files, installing packages, starting servers, etc.",
  parameters: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'Shell command to execute.'
      },
      cwd: {
        type: 'string',
        description: 'Working directory (absolute or ~/). Defaults to home directory.'
      },
      timeoutMs: {
        type: 'integer',
        description: 'Timeout in milliseconds (default 120000, max 600000).'
      },
      maxOutputChars: {
        type: 'integer',
        description: 'Max output characters per stream (default 50000, max 200000).'
      }
    },
    required: ['command']
  }
}
async function runLocalCommand(args, { signal } = {}) {
  const command = String(args?.command || '').trim()
  if (!command) throw new Error('Command is required.')
  if (signal?.aborted) {
    return {
      command,
      cwd: '',
      exitCode: 1,
      timedOut: false,
      aborted: true,
      durationMs: 0,
      stdout: '',
      stderr: 'Aborted before execution'
    }
  }
  const cwd = args?.cwd ? resolveLocalPath(args.cwd) : os.homedir()
  const timeoutMs = clampNumber(args?.timeoutMs, 120000, 1000, 600000)
  const maxOutputChars = clampNumber(args?.maxOutputChars, 50000, 1000, 200000)
  const startedAt = Date.now()
  return new Promise((resolve) => {
    const child = exec(
      command,
      {
        cwd,
        timeout: timeoutMs,
        maxBuffer: 8 * 1024 * 1024
      },
      (error, stdout, stderr) => {
        if (signal) signal.removeEventListener('abort', onAbort)
        const durationMs = Date.now() - startedAt
        const stdoutFull = String(stdout || '')
        const stderrFull = String(stderr || '')
        const safeStdout = stdoutFull.slice(0, maxOutputChars)
        const safeStderr = stderrFull.slice(0, maxOutputChars)
        if (!error) {
          resolve({
            command,
            cwd,
            exitCode: 0,
            timedOut: false,
            durationMs,
            stdout: safeStdout,
            stderr: safeStderr,
            stdoutTruncated: stdoutFull.length > safeStdout.length,
            stderrTruncated: stderrFull.length > safeStderr.length
          })
          return
        }
        const wasAborted = signal?.aborted && error?.killed
        const timedOut =
          !wasAborted &&
          Boolean(
            error?.killed &&
            (error?.signal === 'SIGTERM' || /timeout/i.test(String(error?.message)))
          )
        resolve({
          command,
          cwd,
          exitCode: Number.isInteger(error?.code) ? error.code : 1,
          timedOut,
          aborted: wasAborted,
          durationMs,
          stdout: safeStdout,
          stderr: wasAborted
            ? 'Aborted by user'
            : safeStderr || String(error?.message || 'Command failed'),
          stdoutTruncated: stdoutFull.length > safeStdout.length,
          stderrTruncated: wasAborted ? false : stderrFull.length > safeStderr.length
        })
      }
    )
    const onAbort = () => {
      try {
        child.kill('SIGTERM')
      } catch {
        void 0
      }
    }
    if (signal)
      signal.addEventListener('abort', onAbort, {
        once: true
      })
  })
}
export const runLocalCommandTool = {
  definition,
  execute: () => runLocalCommand
}
export { definition as SHELL_TOOL_DEFINITION, runLocalCommand }
