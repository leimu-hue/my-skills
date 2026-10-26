/**
 * 插件日志：只追加、超限滚动，只在真的发生变更时写。
 *
 * 写失败绝不能弄坏一个 op，所以整条链路吞掉异常；队列保证追加顺序与「先滚动再写」
 * 不会互相穿插。
 */
import { appendFile, rename } from 'node:fs'
import { mkdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'

const LOG_MAX_BYTES = 512 * 1024

export interface PluginLogger {
  /** 记一条变更（`op` 用 op 名，`detail` 是给人看的一行）。 */
  write(event: string, detail: string): void
  /** 记一条宿主层面的问题（服务缺失、注册失败等）。 */
  system(message: string): void
}

export function createLogger(dshHome: string): PluginLogger {
  const dir = join(dshHome, 'tool-center')
  const file = join(dir, 'plugin.log')
  const appendFileAsync = promisify(appendFile)
  const renameAsync = promisify(rename)
  let queue: Promise<unknown> = Promise.resolve()

  const append = (event: string, detail: string): void => {
    queue = queue.then(async () => {
      try {
        const current = await stat(file).catch(() => null)
        if (current !== null && current.size >= LOG_MAX_BYTES) {
          await rm(`${file}.1`, { force: true }).catch(() => undefined)
          await renameAsync(file, `${file}.1`)
        }
        await mkdir(dir, { recursive: true })
        await appendFileAsync(file, JSON.stringify({ ts: new Date().toISOString(), event, detail }) + '\n', 'utf8')
      } catch {
        /* 记日志永远不能弄坏一个 op */
      }
    })
  }

  return {
    write: append,
    system: (message) => append('system', message),
  }
}
