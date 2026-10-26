/** 登记规则唯一会抛的错误类型；路由把 `code` 翻成 HTTP 失败。 */
import type { RegistryErrorCode } from './types.js'

export class RegistryError extends Error {
  readonly code: RegistryErrorCode

  constructor(code: RegistryErrorCode) {
    super(code)
    this.code = code
    this.name = 'RegistryError'
  }
}
