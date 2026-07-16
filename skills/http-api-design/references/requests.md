# 请求

URL 结构和请求格式规则。

## 请求体接受 JSON

`PUT`/`POST` 请求体接受序列化 JSON：

```bash
curl -X POST https://service.com/apps \
  -H "Content-Type: application/json" \
  -d '{"name": "demoapp"}'
```

与 JSON 响应体形成对称。

## 资源名

资源使用**复数名词**：

```
/users
/apps
/dynos
```

例外：单例资源用单数：

```
/status
```

## 支持非 ID 引用

方便时同时接受 ID 和名称：

```
/apps/{app_id_or_name}
/apps/97addcf0-c182
/apps/www-prod
```

不要只接受名称而排除 ID。

## 操作

优先不需要特殊操作的端点。需要时：

```
/resources/:resource/actions/:action
/runs/{run_id}/actions/stop
```

集合操作（避免命名冲突）：

```
/actions/:action/resources
/actions/restart/servers
```

## 路径和属性小写

路径：小写 + 连字符（与主机名对齐）：

```
service-api.com/users
service-api.com/app-setups
```

属性：小写 + 下划线（JS 中无需引号）：

```json
{
  "service_class": "first"
}
```

## 一致的路径格式

所有端点保持一致的结构。

## 最小化路径嵌套

优先根级资源访问。嵌套仅用于作用域集合。

**错误：**
```
/orgs/{org_id}/apps/{app_id}/dynos/{dyno_id}
```

**正确：**
```
/orgs/{org_id}
/orgs/{org_id}/apps
/apps/{app_id}
/apps/{app_id}/dynos
/dynos/{dyno_id}
```
