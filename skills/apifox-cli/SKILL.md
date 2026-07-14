---
name: apifox-cli
description: Apifox CLI 工作流引导。用于 API 测试自动化、文档管理、CI/CD 集成。场景：自动化 API 测试、命令行管理 Apifox 项目、CI/CD 运行测试、编程交互 Apifox 资源。触发词：apifox、api testing automation、cli testing、CI/CD API testing。提到 apifox 相关操作时使用此技能。
---

# Apifox CLI 工作流指南

用 Apifox CLI 自动化 API 测试、管理文档、集成 CI/CD。

## 使用时机

- 命令行或 CI/CD 跑自动化 API 测试
- 编程管理 Apifox 项目、接口、测试用例
- 导入导出 API 文档（OpenAPI、Postman 等）
- 管理测试环境和变量

## 前置条件

1. 安装：`npm install -g apifox-cli` 或 `yarn global add apifox-cli`
2. 登录：用 access token 登录（见下方认证流程）
3. 项目权限：确保有目标项目权限

## 核心工作流

### 1. 认证

**场景**：首次设置或 CI/CD 环境配置。

**步骤**：
1. 获取 token：
   - 登录 Apifox 网页端
   - 进入 **Personal Settings → Access Tokens**
   - 创建新 token

2. CLI 登录：
   ```bash
   apifox login --with-token APS-xxxxxxxxxxxxxx
   ```

3. 验证：
   ```bash
   apifox whoami
   ```

4. 设默认项目（可选）：
   创建 `.apifox/settings.json`：
   ```json
   { "projectId": 123456 }
   ```

**实践**：
- CI/CD 用环境变量存 token：`$APIFOX_ACCESS_TOKEN`
- 定期轮换 token

### 2. 项目和资源查找

**场景**：找项目 ID、环境、测试资源。

```bash
apifox project list
apifox project get <projectId>
apifox environment list --project <projectId>
apifox environment get <envId> --project <projectId>
apifox test-scenario list --project <projectId>
```

常用 ID 存 `.apifox/settings.json` 或环境变量。

### 3. 运行自动化测试

**场景**：本地或 CI/CD 跑测试。

**基本运行**：
```bash
apifox run --access-token $APIFOX_ACCESS_TOKEN \
  -t <scenarioId> \
  -e <environmentId> \
  -r cli,html \
  --upload-report
```

**带变量运行**：
```bash
apifox run --access-token $APIFOX_ACCESS_TOKEN \
  -t <scenarioId> \
  -e <environmentId> \
  --global-var "apiKey=test123" \
  --env-var "baseUrl=https://api.example.com" \
  -r cli,html,junit \
  --out-dir ./test-reports \
  --upload-report
```

**跑测试套件**：
```bash
apifox run --access-token $APIFOX_ACCESS_TOKEN \
  --test-suite <suiteId> \
  -e <environmentId> \
  -r cli,html
```

**关键参数**：
- `-t`：场景 ID
- `-e`：环境 ID
- `-r`：报告格式（cli, html, json, junit）
- `--upload-report`：同步报告到云端
- `--global-var`：全局变量
- `--env-var`：环境变量
- `--out-dir`：报告输出目录

### 4. 管理接口

**场景**：创建、更新、查看 API 接口。

```bash
apifox endpoint list --project <projectId>
apifox endpoint get <endpointId> --project <projectId>
```

**从 JSON 创建接口**：
```bash
apifox cli-schema validate endpoint-create --file ./endpoint.json
apifox endpoint create --project <projectId> --file ./endpoint.json
```

**更新接口**：
```bash
apifox endpoint update <endpointId> --project <projectId> --file ./endpoint-update.json
```

**规范**：创建/更新资源前先校验 JSON：
```bash
apifox cli-schema get endpoint-create
apifox cli-schema validate endpoint-create --file ./endpoint.json
```

### 5. 导入导出文档

**场景**：从其他工具迁移或导出文档。

```bash
# 导入
apifox import --project <projectId> --format openapi --file ./openapi.json
apifox import --project <projectId> --format postman --file ./postman_collection.json

# 导出
apifox export --project <projectId> --format openapi --output ./openapi-export.json
```

**支持格式**：
- 导入：openapi, postman, har, insomnia, jmeter, wsdl, yapi, rap2, apidoc, hoppscotch, markdown, jsonschema, apifox
- 导出：openapi, markdown, html, postman

### 6. 环境变量管理

```bash
apifox variables list --project <projectId> --scope global
apifox variables set --project <projectId> --scope global --key apiKey --value "test123"
apifox variables import --project <projectId> --scope global --file ./variables.json
```

**变量范围**：`global`（项目级）、`environment`（环境级）、`team`（团队级）

## CI/CD 集成示例

### GitHub Actions
```yaml
- name: Run API Tests
  run: |
    apifox run --access-token ${{ secrets.APIFOX_ACCESS_TOKEN }} \
      -t ${{ env.SCENARIO_ID }} \
      -e ${{ env.ENV_ID }} \
      -r cli,junit \
      --out-dir ./test-results \
      --upload-report
```

### GitLab CI
```yaml
api_tests:
  script:
    - apifox run --access-token $APIFOX_ACCESS_TOKEN -t $SCENARIO_ID -e $ENV_ID -r cli,html --upload-report
  artifacts:
    paths:
      - ./apifox-reports/
```

### Jenkins Pipeline
```groovy
stage('API Tests') {
    steps {
        sh '''
            apifox run --access-token $APIFOX_ACCESS_TOKEN \
              -t $SCENARIO_ID \
              -e $ENV_ID \
              -r cli,junit \
              --out-dir ./test-reports
        '''
        junit 'test-reports/*.xml'
    }
}
```

## 排障

**认证错误**：`apifox whoami` 验证 token。检查权限和过期时间。

**Windows 路径问题**：路径用单引号 `--path '/api/users'`，或用 `--file` 传 JSON。

**数据库连接**：从 Apifox CI/CD 面板下载配置文件，用 `--database-connection ./database-connections.json`。

**文件上传**：确保文件在运行 CLI 的机器上存在。用绝对路径或环境变量。

**调试模式**：
```bash
apifox run --access-token $APIFOX_ACCESS_TOKEN -t <id> -e <id> -r cli --color on
```

## 速查

```bash
# 认证
apifox login --with-token <token>
apifox whoami

# 项目
apifox project list
apifox environment list --project <id>
apifox test-scenario list --project <id>

# 测试
apifox run --access-token <token> -t <scenarioId> -e <envId> -r cli,html

# 资源管理
apifox endpoint list --project <id>
apifox cli-schema get <schema-key>
apifox cli-schema validate <schema-key> --file <path>
```

**帮助**：
```bash
apifox --help
apifox <command> --help
apifox <command> <subcommand> --help
```

## 扩展

- 测试数据管理：`apifox test-data` 命令
- 分支管理：`apifox branch` 协作开发
- 定时任务：`apifox scheduled-task` 定时测试

完整命令参考：https://docs.apifox.com/cli-command-options