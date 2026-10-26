import test from 'node:test'
import assert from 'node:assert/strict'
import { parseSkillFile, patchFrontmatter, buildSkillFile, strictBoolean, encodeScalar } from '../dist/host/skills/frontmatter.js'

test('parses the keys the skill contract defines', () => {
  const parsed = parseSkillFile(`---
name: demo-skill
description: Does a thing
whenToUse: |
  When the thing
  is needed
disable-model-invocation: true
user-invocable: "no"
metadata:
  origin: local
---
Body line 1
Body line 2
`)
  assert.equal(parsed.hasFrontmatter, true)
  assert.equal(parsed.data.name, 'demo-skill')
  assert.equal(parsed.data.description, 'Does a thing')
  assert.equal(parsed.data.whenToUse, 'When the thing\nis needed')
  assert.equal(parsed.data['disable-model-invocation'], true)
  assert.equal(parsed.data['user-invocable'], 'no')
  assert.deepEqual(parsed.data.metadata, { origin: 'local' })
  assert.equal(parsed.body.trim(), 'Body line 1\nBody line 2')
})

test('flags a file without a fence instead of guessing', () => {
  const parsed = parseSkillFile('# just markdown\n')
  assert.equal(parsed.hasFrontmatter, false)
  assert.equal(parsed.problem, 'missing frontmatter fence')
})

test('flags an unterminated fence', () => {
  const parsed = parseSkillFile('---\nname: x\n')
  assert.equal(parsed.problem, 'unterminated frontmatter')
})

test('strictBoolean accepts the documented spellings and rejects typos', () => {
  for (const value of [true, 'true', 'TRUE', 'yes', 'on', '1', 1]) assert.equal(strictBoolean(value), true)
  for (const value of [false, 'false', 'no', 'off', '0', 0]) assert.equal(strictBoolean(value), false)
  for (const value of ['maybe', '', 2, null, undefined, {}]) assert.equal(strictBoolean(value), undefined)
})

test('patchFrontmatter preserves keys it does not own, byte for byte', () => {
  const original = `---
name: demo
description: old
# a comment banner
license: MIT
allowed-tools: [read, write]
metadata:
  keep: me
---
old body
`
  const parsed = parseSkillFile(original)
  const patched = patchFrontmatter(parsed, { description: 'new' })
  assert.match(patched, /license: MIT/)
  assert.match(patched, /allowed-tools: \[read, write\]/)
  assert.match(patched, /# a comment banner/)
  assert.match(patched, /metadata:\n {2}keep: me/)
  assert.match(patched, /description: new/)
  assert.doesNotMatch(patched, /description: old/)
  assert.match(patched, /old body/)
})

test('patchFrontmatter can replace the body and remove a key', () => {
  const parsed = parseSkillFile('---\nname: demo\ndescription: d\nwhenToUse: now\n---\nold\n')
  const patched = patchFrontmatter(parsed, { whenToUse: undefined }, 'new body\n')
  assert.doesNotMatch(patched, /whenToUse/)
  assert.match(patched, /new body/)
  assert.doesNotMatch(patched, /old\n?$/)
})

test('buildSkillFile round-trips through the parser', () => {
  const text = buildSkillFile({
    name: 'made-up',
    description: 'A description: with a colon',
    whenToUse: 'multi\nline',
    body: '# Title\n\ntext',
  })
  const parsed = parseSkillFile(text)
  assert.equal(parsed.data.name, 'made-up')
  assert.equal(parsed.data.description, 'A description: with a colon')
  assert.equal(parsed.data.whenToUse, 'multi\nline')
  assert.equal(parsed.body.trim(), '# Title\n\ntext')
})

test('encodeScalar quotes only what needs quoting', () => {
  assert.equal(encodeScalar('plain'), 'plain')
  assert.equal(encodeScalar('has: colon'), '"has: colon"')
  assert.equal(encodeScalar('true'), '"true"')
  assert.equal(encodeScalar('123'), '"123"')
  assert.equal(encodeScalar(true), 'true')
  assert.equal(encodeScalar(''), '""')
})
