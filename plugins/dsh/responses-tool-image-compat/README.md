# @local/dsh-responses-tool-image-compat

让 Responses API 会话不会因为「工具返回图片」而被网关锁死。

## 这个插件修的是什么

会话在某一轮之后彻底卡死，症状是**每一轮**（包括用户只回一句"继续"）都立刻失败：

```
OpenAI API error (400): {"message":"Invalid JSON data: Failed to deserialize the JSON body
into the target type: input: data did not match any variant of untagged enum ResponseInput
at line 1 column <N>","type":"invalid_request_error","code":"json_parse_error"}
```

### 根因

Responses 规范的适配器在**工具结果里带图片**时，发出的 item 是数组形态：

```json
{ "type": "function_call_output", "call_id": "call_…",
  "output": [ { "type": "input_text", "text": "…" },
              { "type": "input_image", "detail": "auto", "image_url": "data:image/png;base64,…" } ] }
```

这是 OpenAI 官方 Responses 规范允许的写法，但部分 OpenAI 兼容网关的反序列化
`input` 时使用 untagged enum，**只接受 `output: string`**，于是整个请求被拒。

触发它的就是任意一次「工具返回图片」的调用（看图工具、截图、图表/文档渲染导出等）。
因为这条 item 已经写进会话历史，之后每次请求都会重放它 → 会话永久失败。

判断依据：报错列号会随新增消息整体后移（说明被拒的是整段 `input`，而不是新加的那条），
因此"再发一句继续"救不回来——这正是"流程被暂停"的成因。

### 实测确认（不是推测）

对同一类网关做的最小复现：

| 载荷 | 结果 |
| --- | --- |
| `message` 里的 `input_image`（用户贴图） | **200** —— 一直可用 |
| `function_call_output.output` = 数组（含图片） | **400** 同一条错误 |
| `function_call_output.output` = 纯 `input_text` 数组 | **400** —— 连纯文本数组都拒 |
| `function_call_output.output` = 字符串 | **200** |

结论：问题与图片无关，**是 `output` 的数组形态本身**。所以任何"工具结果带图"的会话都会中招。

### 为什么只能在这一层修

宿主把会话组装出来的请求 deep-freeze——消息形状在服务层不可改。
而这次的不兼容在**线协议**上，所以唯一同时满足下面三点的落点是出站请求体：

1. 不改会话历史（append-only 不被破坏）；
2. 对**已经中毒**的历史会话立刻生效（重放时自动改写）；
3. 对所有走 Responses 的适配器/模型生效。

时序上也成立：适配器每次请求都新建 OpenAI SDK client，而该 SDK 在**构造时**读取全局 `fetch`，
因此包裹 `globalThis.fetch` 对后续每个请求都生效。

## 改写策略

| 策略 | 效果 | 适用 |
| --- | --- | --- |
| `hoist`（默认） | 文本压成字符串；图片/文件挪到**紧随其后的 user 消息**（带 call_id 说明） | 网关只拒数组、但接受消息里的图片 → **保留看图能力** |
| `flatten` | 只留文本，图片变占位说明 `[input_image omitted: …]` | 连图片输入都不稳的端点；最保守 |

两种策略都已用最小复现验证：同一份投毒负载，装插件前 400、装插件后 200，
且 `hoist` 输出的图片确实被模型收到（同批探针里 `message` 图片分支一直是 200）。

## 顺带测到的同类风险（不在本插件处理范围内）

同一类网关还有两处**同样的"中毒即永久失败"**形态，供以后排查参考：

| item 形态 | 网关反应 | 现状 |
| --- | --- | --- |
| `custom_tool_call` / `custom_tool_call_output` | `400 Unsupported input item type: custom_tool_call` | 只在适配器开启 grammar tools 时发出；默认配置下**不会触发** |
| `tool_search_call` / `tool_search_output` | 400 同一条 `untagged enum ResponseInput` | 只在适配器开启 tool search 时发出；同样**未启用** |

这两类不是"形状可以改写"的问题（网关是整类拒绝），要靠不开对应 compat 开关来规避。
如果以后给这类网关开了 grammar tools 或 tool search，会再次出现"一问就死"的会话。

## 安全边界

- 只处理 `POST` + URL 路径以 `/responses` 结尾的请求；`chat/completions` 一律不碰。
- 只处理 `function_call_output` / `custom_tool_call_output` 且 `output` 为**数组**的条目。
- **不需要改写的请求完全不重新序列化**（原字符串透传），保护 prompt cache 的字节稳定性。
- 规范化是纯函数、确定性：同一段历史永远生成同一份 body，缓存键稳定。
- 自身任何异常都回退到原始请求（兼容层绝不当新的故障点）。
- `ctx.effect` 注册卸载，插件 dispose 时恢复原始 `fetch`。

## 配置

`cordis.patch.yml`：

```yaml
- insert:
    - id: responses-tool-image-compat
      name: '@local/dsh-responses-tool-image-compat'
      config:
        enabled: true
        strategy: hoist        # hoist | flatten
        endpoints: ['*']       # 或 ['api.example.com']
        verbose: false         # true = 每次改写都记 warn
```

## 开发

```bash
npm run build   # src/host/*.ts -> dist/host/*.js（tsc，原生 ESM）
npm test        # node --test，覆盖真实投毒负载形态
```

## 验证与回滚

- 启用需要重启宿主进程（host 插件在进程启动时装载）；重启后日志里会出现
  `[responses-tool-image-compat] active: strategy=hoist, endpoints=*`。
- 出现改写时 `verbose: false` 下只在首次记一条 info，`verbose: true` 每次记 warn。
- 回滚：profile 的 `package.json` 去掉 `@local/dsh-responses-tool-image-compat` 的依赖和 bundles 项，
  或把 `enabled` 改 `false`。

## 许可与独立性

本插件是独立实现：不含任何第三方或组织的私有代码、内部地址、内部系统名称或会话数据；
仅引用公开的 OpenAI Responses 线协议字段名。可安全对外分发。
