# @vox-ai-app/scheduler

Cron-based job scheduler for Vox — schedule recurring agent runs, heartbeats, and timed tasks with full timezone support, one-time triggers, and fixed-interval repeats.

## Install

```sh
npm install @vox-ai-app/scheduler
```

## Exports

| Export                       | Contents                                                    |
| ---------------------------- | ----------------------------------------------------------- |
| `@vox-ai-app/scheduler`      | All scheduler exports                                       |
| `@vox-ai-app/scheduler/cron` | `scheduleJob`, `scheduleAt`, `scheduleEvery`, and utilities |

## Usage

### Recurring cron job

```js
import { scheduleJob, cancelJob, listJobs } from '@vox-ai-app/scheduler'

const job = scheduleJob(
  'daily-report',
  {
    expr: '0 9 * * 1-5', // weekdays at 09:00
    tz: 'America/New_York',
    runImmediately: false,
    timeoutMs: 30_000,
    onError: (err) => console.error(err)
  },
  (id, ctx) => {
    console.log(`Job ${id} fired at ${ctx.scheduledAt}`)
  }
)

console.log(listJobs()) // [{ id, expr, timezone, nextRun, running, state }]
cancelJob('daily-report')
```

### One-time trigger

```js
import { scheduleAt, parseAbsoluteTimeMs } from '@vox-ai-app/scheduler'

const atMs = parseAbsoluteTimeMs('2026-12-25T09:00:00')

scheduleAt('xmas-alert', { at: atMs }, (id, ctx) => {
  console.log(`Fired once at ${ctx.scheduledAt}`)
  // job is automatically removed after firing
})
```

### Fixed interval

```js
import { scheduleEvery, cancelJob } from '@vox-ai-app/scheduler'

scheduleEvery(
  'heartbeat',
  { intervalMs: 60_000, timeoutMs: 5_000 },
  async (id, ctx) => {
    await sendHeartbeat()
  }
)

cancelJob('heartbeat')
```

## API

### `scheduleJob(id, config, handler)`

Schedule a recurring cron job. If a job with the same `id` already exists it is cancelled first.

Handler signature: `(id, ctx) => void | Promise<void>`

| Config option    | Type       | Description                                                    |
| ---------------- | ---------- | -------------------------------------------------------------- |
| `expr`           | `string`   | Cron expression (e.g. `'0 9 * * *'`, `'*/5 * * * *'`)         |
| `tz`             | `string`   | IANA timezone name. Defaults to the system timezone.           |
| `runImmediately` | `boolean`  | Fire the handler once immediately on registration.             |
| `timeoutMs`      | `number`   | Abort the handler after this many ms using `AbortSignal`.      |
| `onError`        | `function` | Called when the handler throws. Receives the `Error` instance. |

Handler context object:

```js
{
  scheduledAt: number,   // Unix ms timestamp of the fire time
  expr: string,          // cron expression
  timezone: string,      // resolved IANA timezone
  signal?: AbortSignal   // present when timeoutMs is set
}
```

### `scheduleAt(id, config, handler)`

Schedule a one-time trigger at an absolute timestamp. The job self-removes after firing. Returns `null` if `at` is already in the past.

| Config option | Type               | Description                           |
| ------------- | ------------------ | ------------------------------------- |
| `at`          | `number \| string` | Unix ms timestamp or ISO date string. |

### `scheduleEvery(id, config, handler)`

Schedule a fixed-interval repeating job. Minimum `intervalMs` is 1 000 ms. Returns `null` for invalid intervals.

| Config option | Type     | Description                                            |
| ------------- | -------- | ------------------------------------------------------ |
| `intervalMs`  | `number` | Milliseconds between handler calls.                    |
| `timeoutMs`   | `number` | Abort signal timeout for each individual handler call. |

### Utilities

| Function                     | Description                                                                                       |
| ---------------------------- | ------------------------------------------------------------------------------------------------- |
| `cancelJob(id)`              | Stop and remove a job by id. Returns `true` if found, `false` otherwise.                          |
| `cancelAllJobs()`            | Stop and remove all registered jobs.                                                              |
| `getJob(id)`                 | Return a job descriptor or `null` if not found.                                                   |
| `listJobs()`                 | Return all active job descriptors as an array.                                                    |
| `computeNextRun(expr, tz)`   | Return the next fire time in ms for a cron expression without scheduling.                         |
| `parseAbsoluteTimeMs(input)` | Parse an ISO date string or a numeric string into a Unix ms timestamp. Returns `null` on failure. |

### Job descriptor shape

```js
{
  id: string,
  expr: string,
  timezone: string,
  createdAt: number,
  nextRun: number | null,
  running: boolean,
  state: {
    runCount: number,
    lastError: Error | null,
    lastRunAtMs: number | null
  }
}
```

## Notes

- A minimum re-fire gap of 2 000 ms prevents accidental double-fires during DST transitions.
- Cron expression evaluation results are LRU-cached (up to 512 entries) for performance.
- Schedule persistence is the caller's responsibility — use [`@vox-ai-app/storage`](../storage) schedules repo.

## License

MIT
