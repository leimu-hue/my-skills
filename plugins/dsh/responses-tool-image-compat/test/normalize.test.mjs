/**
 * 规范化层单测：直接覆盖 2026-10-27 那次失败的真实负载形态。
 *
 * 运行：npm test
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  endpointMatches,
  isResponsesEndpoint,
  normalizeResponsesBody,
} from '../dist/host/normalize.js'
import { installFetchNormalizer, uninstallFetchNormalizer } from '../dist/host/intercept.js'

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

/** 失败会话里 read_image 之后那一条 item 的等价形态。 */
function poisonedBody() {
  return {
    model: 'test-model',
    store: false,
    input: [
      { type: 'message', role: 'user', content: [{ type: 'input_text', text: '看看图' }] },
      { type: 'function_call', call_id: 'call_test_1', name: 'read_image', arguments: '{"file_path":"a.png"}' },
      {
        type: 'function_call_output',
        call_id: 'call_test_1',
        output: [
          { type: 'input_text', text: '<path>a.png</path>\n<type>image</type>' },
          { type: 'input_image', detail: 'auto', image_url: `data:image/png;base64,${PNG}` },
        ],
      },
    ],
  }
}

test('hoist: 数组输出被压成字符串，图片挂到紧随其后的 user 消息', () => {
  const result = normalizeResponsesBody(poisonedBody(), { strategy: 'hoist' })
  assert.equal(result.changed, true)
  assert.equal(result.rewrittenItems, 1)
  assert.equal(result.hoistedParts, 1)

  const input = result.body.input
  assert.equal(input.length, 4)

  // 原来的 function_call_output 必须变成 string（网关唯一接受的形态）
  assert.deepEqual(Object.keys(input[2]).sort(), ['call_id', 'output', 'type'])
  assert.equal(typeof input[2].output, 'string')
  assert.match(input[2].output, /<path>a\.png<\/path>/)

  // 图片没有丢：跟着一条 user 消息
  assert.equal(input[3].role, 'user')
  const imagePart = input[3].content.find((part) => part.type === 'input_image')
  assert.ok(imagePart, 'image part should be hoisted into a user message')
  assert.equal(imagePart.image_url, `data:image/png;base64,${PNG}`)
  assert.match(input[3].content[0].text, /call_test_1/)
})

test('flatten: 只留文本，图片降级为占位说明', () => {
  const result = normalizeResponsesBody(poisonedBody(), { strategy: 'flatten' })
  assert.equal(result.changed, true)
  assert.equal(result.hoistedParts, 0)
  const input = result.body.input
  assert.equal(input.length, 3)
  assert.equal(typeof input[2].output, 'string')
  assert.match(input[2].output, /omitted/)
})

test('纯文本数组也被压成字符串（网关连 [{type:input_text}] 都拒绝）', () => {
  const body = {
    input: [
      { type: 'function_call_output', call_id: 'c1', output: [{ type: 'input_text', text: 'a' }, { type: 'input_text', text: 'b' }] },
    ],
  }
  const result = normalizeResponsesBody(body)
  assert.equal(result.changed, true)
  assert.equal(result.body.input[0].output, 'a\nb')
})

test('custom_tool_call_output 同样处理', () => {
  const body = {
    input: [{ type: 'custom_tool_call_output', call_id: 'c1', output: [{ type: 'input_text', text: 'x' }] }],
  }
  const result = normalizeResponsesBody(body)
  assert.equal(result.changed, true)
  assert.equal(result.body.input[0].output, 'x')
})

test('已经合规的请求体完全不动（保护 prompt cache，字节级不变）', () => {
  const body = {
    input: [
      { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hi' }] },
      { type: 'function_call_output', call_id: 'c1', output: 'plain string' },
    ],
  }
  const result = normalizeResponsesBody(body)
  assert.equal(result.changed, false)
  assert.equal(result.body, body, '应是同一个对象引用')
})

test('入参不被修改', () => {
  const body = poisonedBody()
  const snapshot = JSON.parse(JSON.stringify(body))
  normalizeResponsesBody(body)
  assert.deepEqual(body, snapshot)
})

test('空输出/未知分段不丢信息', () => {
  const empty = normalizeResponsesBody({ input: [{ type: 'function_call_output', call_id: 'c1', output: [] }] })
  assert.equal(empty.body.input[0].output, '(no tool output)')

  const weird = normalizeResponsesBody({
    input: [{ type: 'function_call_output', call_id: 'c1', output: [{ type: 'some_future_part', value: 42 }] }],
  })
  assert.match(weird.body.input[0].output, /some_future_part/)
})

test('端点判定：只认 /responses', () => {
  assert.equal(isResponsesEndpoint('https://gw.example.com/v1/responses'), true)
  assert.equal(isResponsesEndpoint('https://gw.example.com/v1/responses/'), true)
  assert.equal(isResponsesEndpoint('https://gw.example.com/v1/chat/completions'), false)
  assert.equal(endpointMatches('https://api.example.com/v1/responses', ['*']), true)
  assert.equal(endpointMatches('https://api.example.com/v1/responses', ['api.example.com']), true)
  assert.equal(endpointMatches('https://api.openai.com/v1/responses', ['api.example.com']), false)
})

test('fetch 包裹：只改 Responses 端点且只在需要时改，其余原样透传', async () => {
  const calls = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    calls.push({ input, init })
    return new Response('{}', { status: 200 })
  }
  try {
    const state = installFetchNormalizer({ strategy: 'hoist', endpoints: ['*'] })

    // 1) 投毒负载 → 被改写
    await globalThis.fetch('https://gw.example.com/v1/responses', {
      method: 'POST',
      body: JSON.stringify(poisonedBody()),
    })
    const rewritten = JSON.parse(calls.at(-1).init.body)
    assert.equal(rewritten.input.length, 4)
    assert.equal(typeof rewritten.input[2].output, 'string')
    assert.equal(state.requests, 1)

    // 2) 合规负载 → 字节级原样（同一个字符串引用）
    const clean = JSON.stringify({ input: [{ type: 'function_call_output', call_id: 'c', output: 'ok' }] })
    await globalThis.fetch('https://gw.example.com/v1/responses', { method: 'POST', body: clean })
    assert.equal(calls.at(-1).init.body, clean)
    assert.equal(state.requests, 1)

    // 3) 非 Responses 端点 → 不改
    const chatBody = JSON.stringify({ messages: [{ role: 'tool', content: 'x' }] })
    await globalThis.fetch('https://gw.example.com/v1/chat/completions', { method: 'POST', body: chatBody })
    assert.equal(calls.at(-1).init.body, chatBody)

    // 4) 不可解析的 body → 不改也不抛
    await globalThis.fetch('https://gw.example.com/v1/responses', { method: 'POST', body: 'not json' })
    assert.equal(calls.at(-1).init.body, 'not json')

    // 5) 幂等安装
    const again = installFetchNormalizer()
    assert.equal(again, state)
  } finally {
    uninstallFetchNormalizer()
    globalThis.fetch = originalFetch
  }
})
