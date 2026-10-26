/**
 * 浏览器侧的 ZIP 写入器（只用 store，不压缩）。
 *
 * 为什么需要它：`+` 选择文件夹只能拿到 `File` 对象，拿不到磁盘真实路径（Electron 早已
 * 不把 `File.path` 暴露给渲染进程），所以没法把磁盘路径交给 host。于是把选中的文件在前端
 * 原样打成一个 ZIP，再交给 host 的 `import-zip`（能处理嵌套 SKILL.md、references、平铺 .md）
 * —— host 侧一行都不用改。
 *
 * 不压缩是刻意的：技能是文本，压缩收益有限，而 `deflate` 在浏览器里没有同步 API，
 * 引一个压缩库只为省几 KB 不值得。格式上仍是标准 ZIP（method 0），host 的零依赖读取器
 * 和系统解压工具都能读。
 */

// CRC32 表与 host 的 src/host/shared/zip.ts 完全一致；两侧各自打包（浏览器 bundle 不能
// import Host 代码），改动时两处一起改。
const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) !== 0 ? (value >>> 1) ^ 0xedb88320 : value >>> 1
    }
    table[index] = value
  }
  return table
})()

export function crc32(data: Uint8Array): number {
  let crc = -1
  for (let index = 0; index < data.length; index += 1) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ data[index]) & 0xff]
  }
  return (crc ^ -1) >>> 0
}

export interface ZipInput {
  /** 压缩包内路径，正斜杠分隔。 */
  name: string
  data: Uint8Array
}

const LOCAL_SIGNATURE = 0x04034b50
const CENTRAL_SIGNATURE = 0x02014b50
const EOCD_SIGNATURE = 0x06054b50

/** 打一个 store-only ZIP。文件名按 UTF-8 写入（中文技能名靠这个）。 */
export function buildZip(files: ZipInput[]): Uint8Array {
  const encoder = new TextEncoder()
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0

  for (const file of files) {
    const nameBytes = encoder.encode(file.name)
    const checksum = crc32(file.data)
    const size = file.data.length

    const local = new Uint8Array(30 + nameBytes.length)
    const localView = new DataView(local.buffer)
    localView.setUint32(0, LOCAL_SIGNATURE, true)
    localView.setUint16(4, 20, true)          // version needed
    localView.setUint16(6, 0x0800, true)      // flags: UTF-8 names
    localView.setUint16(8, 0, true)           // method: store
    localView.setUint16(10, 0, true)          // time
    localView.setUint16(12, 0x5a21, true)     // date（固定值，输出可复现）
    localView.setUint32(14, checksum, true)
    localView.setUint32(18, size, true)
    localView.setUint32(22, size, true)
    localView.setUint16(26, nameBytes.length, true)
    localView.setUint16(28, 0, true)
    local.set(nameBytes, 30)
    locals.push(local, file.data)

    const central = new Uint8Array(46 + nameBytes.length)
    const centralView = new DataView(central.buffer)
    centralView.setUint32(0, CENTRAL_SIGNATURE, true)
    centralView.setUint16(4, 20, true)        // version made by
    centralView.setUint16(6, 20, true)        // version needed
    centralView.setUint16(8, 0x0800, true)
    centralView.setUint16(10, 0, true)
    centralView.setUint16(12, 0, true)
    centralView.setUint16(14, 0x5a21, true)
    centralView.setUint32(16, checksum, true)
    centralView.setUint32(20, size, true)
    centralView.setUint32(24, size, true)
    centralView.setUint16(28, nameBytes.length, true)
    centralView.setUint16(30, 0, true)        // extra
    centralView.setUint16(32, 0, true)        // comment
    centralView.setUint16(34, 0, true)        // disk
    centralView.setUint16(36, 0, true)        // internal attrs
    centralView.setUint32(38, 0, true)        // external attrs
    centralView.setUint32(42, offset, true)   // local header offset
    central.set(nameBytes, 46)
    centrals.push(central)

    offset += local.length + file.data.length
  }

  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0)
  const eocd = new Uint8Array(22)
  const eocdView = new DataView(eocd.buffer)
  eocdView.setUint32(0, EOCD_SIGNATURE, true)
  eocdView.setUint16(4, 0, true)
  eocdView.setUint16(6, 0, true)
  eocdView.setUint16(8, files.length, true)
  eocdView.setUint16(10, files.length, true)
  eocdView.setUint32(12, centralSize, true)
  eocdView.setUint32(16, offset, true)
  eocdView.setUint16(20, 0, true)

  return concat([...locals, ...centrals, eocd])
}

/** 字节 → base64（op 的传输格式）。 */
export function base64Of(bytes: Uint8Array): string {
  const chunk = 0x8000
  let binary = ''
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk))
  }
  return btoa(binary)
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(total)
  let cursor = 0
  for (const part of parts) {
    out.set(part, cursor)
    cursor += part.length
  }
  return out
}
