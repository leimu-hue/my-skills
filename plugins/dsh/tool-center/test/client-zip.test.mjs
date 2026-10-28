import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { readZip } from '../dist/host/shared/zip.js'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

/**
 * 浏览器侧的 ZIP 写入器是手写的二进制格式，最怕「自己写的自己读得回、别人读不了」。
 * 这个测试把它单独打包出来，再用 **host 的零依赖读取器** 读回，并逐字节核对内容 ——
 * 也就是「导入技能时前端打的包，host 一定能解开」这条链路。
 */
async function loadWriter() {
  const esbuild = await import('esbuild')
  const work = await mkdtemp(join(tmpdir(), 'tc-zip-'))
  const entry = join(root, 'test', '.zip-entry.ts')
  await writeFile(entry, [
    "export { buildZip, base64Of, crc32 } from '../src/client/lib/core/zip.ts'",
    '',
  ].join('\n'))
  const outfile = join(work, 'zip.mjs')
  try {
    await esbuild.build({
      entryPoints: [entry],
      outfile,
      bundle: true,
      format: 'esm',
      platform: 'browser',
      target: 'es2020',
      logLevel: 'silent',
    })
    return await import(pathToFileURL(outfile).href)
  } finally {
    await rm(entry, { force: true })
    await rm(work, { recursive: true, force: true })
  }
}

test('the browser zip writer round-trips through the host reader', async () => {
  const writer = await loadWriter()
  const encoder = new TextEncoder()

  const files = [
    { name: 'my-skill/SKILL.md', data: encoder.encode('---\nname: my-skill\n---\nbody\n') },
    { name: 'my-skill/references/notes.md', data: encoder.encode('notes\n') },
    { name: '中文技能/SKILL.md', data: encoder.encode('---\nname: 中文技能\n---\n') },
    { name: 'flat.md', data: encoder.encode('flat\n') },
  ]

  const archive = writer.buildZip(files)
  const read = readZip(Buffer.from(archive))

  assert.deepEqual(read.map((entry) => entry.name), files.map((file) => file.name))
  for (const [index, entry] of read.entries()) {
    assert.equal(entry.data.toString('utf8'), new TextDecoder().decode(files[index].data))
  }
})

test('crc32 and base64 agree with the host side', async () => {
  const writer = await loadWriter()
  const bytes = new TextEncoder().encode('123456789')
  // 与 host 的 crc32 用同一个已知值互校。
  assert.equal(writer.crc32(bytes), 0xcbf43926)
  assert.equal(writer.base64Of(bytes), Buffer.from(bytes).toString('base64'))
})
