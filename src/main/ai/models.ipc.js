import { registerHandler, createHandler } from '../ipc/shared'
import {
  listModels,
  getActiveModelPath,
  setActiveModelPath,
  downloadModel,
  deleteModel,
  pickLocalModel,
  cancelDownload,
  getActiveDownloadProgress
} from './models'
import { getLlmStatus, reloadModel } from './llm.bridge'

export function registerModelsIpc() {
  registerHandler(
    'models:list',
    createHandler(() => listModels())
  )

  registerHandler(
    'models:is-ready',
    createHandler(() => getLlmStatus().ready)
  )

  registerHandler(
    'models:get-active',
    createHandler(() => getActiveModelPath())
  )

  registerHandler(
    'models:set-active',
    createHandler(async (_e, { path }) => {
      setActiveModelPath(path)
      await reloadModel(path)
      return { path }
    })
  )

  registerHandler(
    'models:pull',
    createHandler(async (_e, { hfRepo, hfFile }) => {
      downloadModel({ hfRepo, hfFile }).catch(() => {})
      return { started: true }
    })
  )

  registerHandler(
    'models:cancel-download',
    createHandler((_e, { path }) => {
      cancelDownload(path)
      return { cancelled: true }
    })
  )

  registerHandler(
    'models:delete',
    createHandler((_e, { path }) => {
      deleteModel(path)
      return { deleted: true }
    })
  )

  registerHandler(
    'models:pick-file',
    createHandler(() => pickLocalModel())
  )

  registerHandler(
    'models:get-downloads',
    createHandler(() => getActiveDownloadProgress())
  )

  registerHandler(
    'models:reload',
    createHandler(async () => {
      const path = getActiveModelPath()
      if (!path) throw Object.assign(new Error('No active model'), { code: 'NO_MODEL' })
      await reloadModel(path)
      return { path }
    })
  )
}
