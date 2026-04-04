# @vox-ai-app/scheduler

Cron-based job scheduler for Vox — schedule recurring agent runs, heartbeats, and timed tasks with timezone support, persistent storage, and automatic restore on restart.

## Install

```sh
npm install @vox-ai-app/scheduler
```

## Exports

| Export                        | Contents                              |
| ----------------------------- | ------------------------------------- |
| `@vox-ai-app/scheduler`       | All scheduler exports                 |
| `@vox-ai-app/scheduler/cron`  | Job scheduling, cancellation, listing |
| `@vox-ai-app/scheduler/store` | JSON file persistence for schedules   |

## Usage

```js
import { scheduleJob, cancelJob, listJobs, computeNextRun } from '@vox-ai-app/scheduler'

const job = scheduleJob(
  'daily-check',
  { expr: '0 9 * * *', tz: 'America/New_York' },
  (id, meta) => {
    console.log(`Job ${id} fired at ${meta.firedAt}`)
  }
)

console.log(listJobs()) // [{ id, expr, tz, nextRun }]
cancelJob('daily-check')
```

## Persistent store

```js
import { createStore } from '@vox-ai-app/scheduler/store'

const store = createStore('/path/to/data')
store.save({ id: 'job1', expr: '*/5 * * * *', prompt: 'Check status' })
store.list() // all saved schedules
store.get('job1')
store.remove('job1')
```

The store writes to `schedules.json` inside the given directory, creating it if needed.

## API

### Cron

| Function         | Description                                     |
| ---------------- | ----------------------------------------------- |
| `scheduleJob`    | Schedule a cron job with handler callback       |
| `cancelJob`      | Cancel a job by ID                              |
| `cancelAllJobs`  | Cancel all running jobs                         |
| `getJob`         | Get job details by ID                           |
| `listJobs`       | List all active jobs with next run times        |
| `computeNextRun` | Compute the next run time for a cron expression |

`scheduleJob` options:

```js
scheduleJob(
  id,
  {
    expr: '0 9 * * 1-5', // 5-field cron
    tz: 'America/New_York', // optional IANA timezone
    runImmediately: false, // fire once immediately on schedule
    onError: (err) => {} // error callback
  },
  handler
)
```

### Store

| Method   | Description                 |
| -------- | --------------------------- |
| `save`   | Save or update a schedule   |
| `remove` | Remove a schedule by ID     |
| `get`    | Get a single schedule by ID |
| `list`   | List all saved schedules    |

## Dependencies

- [croner](https://github.com/hexagon/croner) ^9.0.0

## License

MIT
