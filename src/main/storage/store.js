import { configGet, configSet, configDelete, configGetAll } from '@vox-ai-app/storage/config'
import { app } from 'electron'
import { join } from 'path'

const getStorePath = () => join(app.getPath('userData'), 'store.json')

export const storeGet = (key) => configGet(getStorePath(), key)
export const storeSet = (key, value) => configSet(getStorePath(), key, value)
export const storeDelete = (key) => configDelete(getStorePath(), key)
export const storeGetAll = () => configGetAll(getStorePath())
