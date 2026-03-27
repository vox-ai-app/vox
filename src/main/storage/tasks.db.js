import {
  upsertTask as _upsertTask,
  getTask as _getTask,
  loadTasks as _loadTasks,
  appendTaskActivity as _appendTaskActivity,
  loadTaskActivity as _loadTaskActivity,
  loadAllTaskActivity as _loadAllTaskActivity
} from '@vox-ai-app/storage/tasks'
import { getDb } from './db.js'

export const upsertTask = (task) => _upsertTask(getDb(), task)
export const getTask = (taskId) => _getTask(getDb(), taskId)
export const loadTasks = () => _loadTasks(getDb())
export const appendTaskActivity = (activity) => _appendTaskActivity(getDb(), activity)
export const loadTaskActivity = (taskId) => _loadTaskActivity(getDb(), taskId)
export const loadAllTaskActivity = () => _loadAllTaskActivity(getDb())
