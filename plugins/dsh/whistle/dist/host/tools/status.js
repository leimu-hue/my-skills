/**
 * `whistle_status`：一次看清代理的整体状态。
 *
 * 这是模型的第一站：其余 whistle_* 工具在 whistle 未安装 / 未启动 / 版本过低时
 * 都会失败，而这里能把三者区分开，并顺手给出抓包界面地址。
 *
 * 各子查询都走 `attempt`：某个接口在旧版本上不存在，不该让整次体检失败。
 */
import { defineTool } from '@deepseek-ai/dsh-tools';
import { asToolFailure, attempt } from "../shared/errors.js";
import { jsonText } from "../whistle/format.js";
import { summariseRules } from "../whistle/rules.js";
export const STATUS_TOOL = 'whistle_status';
export function createStatusTool(client) {
    return defineTool({
        name: STATUS_TOOL,
        description: 'Read the local Whistle proxy state through its Local Agent API: version and capture URL, whether the '
            + 'rules engine is globally off, which rule files are selected, HTTPS interception, and the installed plugins. '
            + 'Start here — when Whistle is missing, not running, or older than 2.10.7, every other whistle_* tool fails, and '
            + 'this is the tool that tells which of the three it is.',
        parameters: {
            rules: { type: 'boolean', description: 'List the configured rule files (default true).' },
            plugins: { type: 'boolean', description: 'List installed Whistle plugins (default true).' },
            values: { type: 'boolean', description: 'List the names of Whistle Values (default false).' },
        },
        output: {
            schema: { type: 'string' },
            render: (_args, value) => [{ type: 'text', text: value }],
        },
        isConcurrencySafe: () => true,
        async execute(args, exec) {
            try {
                return await client.call('read whistle status', async (api) => {
                    const status = await api.network.getStatus();
                    const rules = await attempt(async () => api.rules.getStatus());
                    const https = await attempt(async () => api.isEnabledHTTPS());
                    const captureUrl = await attempt(async () => api.createUrl());
                    const payload = {
                        whistle: {
                            version: typeof status?.version === 'string' ? status.version : client.version,
                            captureUrl: captureUrl.ok ? captureUrl.value : '(unavailable)',
                            httpsInterception: https.ok ? https.value : 'unknown',
                        },
                    };
                    if (rules.ok) {
                        payload.rules = summariseRules(rules.value);
                        if (args.rules !== false) {
                            payload.ruleFiles = (Array.isArray(rules.value.list) ? rules.value.list : []).map((item) => ({
                                name: item.name,
                                selected: item.selected === true,
                            }));
                        }
                    }
                    else {
                        payload.rules = { error: rules.reason };
                    }
                    if (args.plugins !== false) {
                        const plugins = await attempt(async () => api.plugins.getList());
                        payload.plugins = plugins.ok
                            ? {
                                total: plugins.value.length,
                                enabled: plugins.value.filter((item) => item.selected !== false).map((item) => item.name),
                                disabled: plugins.value.filter((item) => item.selected === false).map((item) => item.name),
                            }
                            : { error: plugins.reason };
                    }
                    if (args.values === true) {
                        const values = await attempt(async () => api.values.getList());
                        payload.values = values.ok
                            ? values.value.map((item) => item.name)
                            : { error: values.reason };
                    }
                    return jsonText(payload);
                }, { signal: exec.signal });
            }
            catch (cause) {
                throw asToolFailure(cause);
            }
        },
    });
}
