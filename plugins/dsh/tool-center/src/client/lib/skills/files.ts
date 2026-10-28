/**
 * 浏览器侧的文件选择：选文件夹 / 选 ZIP / 把选中文件打成 ZIP。
 *
 * 为什么选文件夹要绕一圈：浏览器只能拿到 `File` 对象，拿不到磁盘真实路径（Electron 不再向
 * 渲染进程暴露 `File.path`），所以选中的文件在前端打成 store-only ZIP 再上传（见 zip.ts）。
 *
 * ⚠️ `FileList` 是**活的**：把 `input.value` 清空会让它同时变空。所以 `pickerProps` 里
 * 必须先 `Array.from(files)` 再清 value —— 反过来写会静默拿到空列表（症状是「选完没反应」）。
 */
import { base64Of, buildZip } from '../core/zip.ts'

/** 文件夹选择给的是 `webkitRelativePath`（如 `my-skill/SKILL.md`），普通选择只有 name。 */
export function relativeNameOf(file: File): string {
  const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath
  const name = typeof relative === 'string' && relative !== '' ? relative : file.name
  return name.split('\\').join('/')
}

/** 目录选择需要 `webkitdirectory`；不支持时把它藏起来，别给一个按了没反应的按钮。 */
export function folderPickSupported(): boolean {
  return typeof document !== 'undefined' && 'webkitdirectory' in document.createElement('input')
}

/** 文件输入控件的 change 事件：只有 `target` 这两样东西会被读到。 */
export interface PickEvent {
  target: { files?: FileList | null; value: string }
}

/**
 * 取出这次选中的文件。
 *
 * 顺序是契约：先拍成数组，再清 value（见文件头）。两个入口（文件夹 / ZIP）共用这一份。
 */
export function takeFiles(event: PickEvent): File[] {
  const picked = Array.from(event.target.files ?? [])
  event.target.value = ''
  return picked
}

export interface FolderArchive {
  /** 文件夹名（压缩包顶层目录），用作面板上的来源名。 */
  source: string
  base64: string
  bytes: number
}

/** 把选中的文件打成一个 store-only ZIP，并给出体积供调用方判上限。 */
export async function folderArchive(files: File[]): Promise<FolderArchive> {
  const entries = await Promise.all(files.map(async (file) => ({
    name: relativeNameOf(file),
    data: new Uint8Array(await file.arrayBuffer()),
  })))
  const bytes = entries.reduce((sum, entry) => sum + entry.data.length, 0)
  const first = files[0]
  const source = first === undefined ? '' : relativeNameOf(first).split('/')[0] ?? ''
  return { source, base64: base64Of(buildZip(entries)), bytes }
}

/** 单个 ZIP 文件：读成 base64 直接上传扫描。 */
export async function zipArchive(file: File): Promise<string> {
  return base64Of(new Uint8Array(await file.arrayBuffer()))
}
