import { registerHandler, createHandler } from './shared'
import { storeGet, storeSet, storeDelete } from '../storage/store'

export function registerStoreIpc() {
  registerHandler(
    'store:get',
    createHandler((_e, { key }) => ({ value: storeGet(key) }))
  )
  registerHandler(
    'store:set',
    createHandler((_e, { key, value }) => {
      storeSet(key, value)
      return { ok: true }
    })
  )
  registerHandler(
    'store:delete',
    createHandler((_e, { key }) => {
      storeDelete(key)
      return { ok: true }
    })
  )
}
