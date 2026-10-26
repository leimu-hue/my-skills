import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * 浏览器半侧不能 import Host 的类型（模块系统不同），所以 `client/core/types.ts` 是
 * **手写的镜像**。这份镜像最容易悄悄漂移：Host 加字段没人管，面板就一直读不到。
 *
 * 这里只做一件便宜但有效的事：同名的镜像结构里，客户端声明的每个顶层字段都必须在
 * Host 侧存在。客户端可以少字段（它只读自己用的），但不能凭空多出 Host 没有的字段。
 * 嵌套形状（`scope` 之类）由各自的 typecheck 负责，这里比到顶层。
 */
const HOST_ROOT = join(import.meta.dirname, '..', 'src', 'host')
const CLIENT_TYPES = join(import.meta.dirname, '..', 'src', 'client', 'core', 'types.ts')

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else if (entry.name.endsWith('.ts')) out.push(full)
  }
  return out
}

function interfacesOf(text) {
  const result = new Map()
  const re = /export\s+interface\s+([A-Za-z_$][\w$]*)\s*\{([\s\S]*?)\n\}/g
  let match
  while ((match = re.exec(text)) !== null) {
    const fields = new Set()
    for (const line of match[2].split('\n')) {
      const field = /^\s{2}([A-Za-z_$][\w$]*)\??\s*:/.exec(line)
      if (field !== null) fields.add(field[1])
    }
    result.set(match[1], fields)
  }
  return result
}

test('the client type mirror never invents fields the host does not have', () => {
  const host = new Map()
  for (const file of walk(HOST_ROOT)) {
    for (const [name, fields] of interfacesOf(readFileSync(file, 'utf8'))) {
      if (!host.has(name)) host.set(name, new Set())
      for (const field of fields) host.get(name).add(field)
    }
  }
  const client = interfacesOf(readFileSync(CLIENT_TYPES, 'utf8'))
  // `SkillDetail` 在客户端是 **op 回执**（`{ row }` + Host 的 detail），比 Host 的
  // `SkillDetail` 多一个 `row`；这是唯一一处刻意多出来的字段。
  const extraFields = new Map([['SkillDetail', new Set(['row'])]])

  const compared = []
  for (const [name, fields] of client) {
    const hostFields = host.get(name)
    if (hostFields === undefined) continue
    compared.push(name)
    const extra = extraFields.get(name) ?? new Set()
    for (const field of fields) {
      assert.ok(
        hostFields.has(field) || extra.has(field),
        `${relative(process.cwd(), CLIENT_TYPES)}: ${name}.${field} is not on the host side (mirror drift)`,
      )
    }
  }
  // 至少要比到核心的几块；否则这条测试会因为改名而静默失效。
  for (const required of ['EntryPolicy', 'SkillRow', 'SkillRef', 'RootView', 'SkillStateView', 'TrashItem']) {
    assert.ok(compared.includes(required), `expected to compare the mirrored interface ${required}`)
  }
})
