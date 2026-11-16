/**
 * Whistle Local Agent API 的最小类型面。
 *
 * `w2 root bin/api` 指向的是 whistle 自己的 CommonJS 运行时代码，没有任何类型
 * 声明，而且在快速演进。把整张 API 抄一遍只会变成维护负担，所以这里只声明本插件
 * 真正调用的方法，其余字段保留 `unknown` 交给各工具自己窄化。
 *
 * 参考：https://wproxy.org/docs/extensions/api.html （whistle >= 2.10.7）
 */

/** 请求/响应头；同名多值在 whistle 里是数组。 */
export interface WhistleHeaders {
  [name: string]: string | string[] | undefined
}

/** 请求或响应消息：正文只以 base64 形式出现，解码交给 `utils`。 */
export interface WhistleMessage {
  method?: string
  statusCode?: number
  statusMessage?: string
  headers?: WhistleHeaders
  base64?: string
  /** 正文字节数；有些版本只在 `res` 上给。 */
  size?: number
  charset?: string
}

/** 一条抓包记录。字段随协议变化，未声明的部分按 `unknown` 处理。 */
export interface WhistleSession {
  id: string
  startTime?: number
  endTime?: number
  url?: string
  method?: string
  isHttps?: boolean
  req?: WhistleMessage
  res?: WhistleMessage
  rules?: unknown
  [key: string]: unknown
}

/** 一帧 WebSocket / Socket 数据。 */
export interface WhistleFrame {
  reqId?: string
  frameId?: string
  opcode?: number
  length?: number
  base64?: string
  /** 不同版本用不同字段表达方向，工具里按「任一命中」判断。 */
  fromClient?: boolean
  isClient?: boolean
  from?: string
  [key: string]: unknown
}

/** 规则引擎运行时状态。 */
export interface WhistleRulesStatus {
  /** 全局关闭所有（非插件）规则。 */
  disabled?: boolean
  /** 全局关闭所有插件规则。 */
  pluginsDisabled?: boolean
  multiSelect?: boolean
  laterRulesFirst?: boolean
  list?: Array<{ name: string; selected?: boolean }>
  [key: string]: unknown
}

/** `rules.getList()` 的一项。 */
export interface WhistleRuleFile {
  name: string
  value: string
  selected: boolean
}

/** `values.getList()` 的一项。 */
export interface WhistleValue {
  name: string
  value: string
}

/** `plugins.getList()` 的一项。 */
export interface WhistlePlugin {
  name: string
  moduleName?: string
  version?: string
  description?: string
  selected?: boolean
  [key: string]: unknown
}

/** `network.getStatus()`：目前只依赖 `version`，其余原样带出。 */
export interface WhistleStatus {
  version?: string
  [key: string]: unknown
}

/** 本插件用到的 API 子集。 */
export interface WhistleApi {
  /** 加载器探测到的版本号，由客户端写回。 */
  version?: string
  network: {
    getStatus(): Promise<WhistleStatus>
    getSessions(options: Record<string, unknown>): Promise<WhistleSession[]>
    getFrames(options: Record<string, unknown>): Promise<WhistleFrame[]>
  }
  rules: {
    getStatus(): Promise<WhistleRulesStatus>
    turnOn(): Promise<void>
    turnOff(): Promise<void>
    getList(): Promise<WhistleRuleFile[]>
    /** 只返回规则文本；不存在时返回空。 */
    get(name: string): Promise<string | null>
    add(
      name: string,
      value: string,
      selected?: boolean | { selected?: boolean; top?: boolean; addToTop?: boolean },
    ): Promise<void>
    select(name: string): Promise<boolean>
    unselect(name?: string): Promise<boolean>
    moveToTop(name: string): Promise<boolean>
    isMultiSelect(): Promise<boolean>
    setMultiSelect(enable: boolean): Promise<void>
    setLaterFirst(enable: boolean): Promise<void>
  }
  values: {
    getList(): Promise<WhistleValue[]>
    get(name: string): Promise<string | null>
    add(name: string, value: string): Promise<void>
  }
  plugins: {
    getStatus(): Promise<unknown>
    getList(): Promise<WhistlePlugin[]>
    get(name: string): Promise<WhistlePlugin | undefined>
  }
  utils: {
    getReqBody(session: unknown): string
    getResBody(session: unknown): string
    getText(frame: unknown): string
    getTimings(session: unknown): Record<string, number | null>
    getRules(session: unknown): string[]
  }
  /** 抓包界面地址（`http://host:port/`）。 */
  createUrl(sessions?: unknown): Promise<string>
  isEnabledHTTPS(): Promise<boolean>
  setEnableHTTPS(enable: boolean): Promise<void>
}

/** API 工厂：测试注入假实现，生产环境从磁盘加载 whistle 的 bin/api。 */
export type ApiFactory = () => Promise<WhistleApi>
