/**
 * `whistle_plugins`：装了哪些插件、哪些被关掉。
 *
 * 只读。插件规则的开关虽然也能通过 API 改，但那属于「动别人的插件」，
 * 交给抓包界面 —— 工具这边只负责回答「为什么某个插件规则没生效」。
 */
import { defineTool } from '@deepseek-ai/dsh-tools';
import { WhistleError, asToolFailure } from "../shared/errors.js";
import { jsonText } from "../whistle/format.js";
export const PLUGINS_TOOL = 'whistle_plugins';
export function createPluginsTool(client) {
    return defineTool({
        name: PLUGINS_TOOL,
        description: 'Inspect the Whistle plugins installed on this machine and whether each one is enabled. Read-only: '
            + 'enabling or disabling plugins stays in the capture UI, because a plugin rules override is somebody else\'s '
            + 'configuration. Use action="get" for one plugin\'s module name, version, homepage and rule snippets.',
        parameters: {
            action: { type: 'string', enum: ['list', 'get'], required: true, description: 'list | get' },
            name: { type: 'string', description: 'get: plugin name (e.g. "inspect").' },
        },
        output: {
            schema: { type: 'string' },
            render: (_args, value) => [{ type: 'text', text: value }],
        },
        isConcurrencySafe: () => true,
        async execute(args, exec) {
            const name = typeof args.name === 'string' ? args.name.trim() : '';
            try {
                return await client.call('whistle plugins: ' + args.action, async (api) => {
                    if (args.action === 'list') {
                        const plugins = await api.plugins.getList();
                        return renderList(plugins);
                    }
                    if (name === '') {
                        throw new WhistleError('invalid', 'action="get" needs the plugin "name".', 'Names come from whistle_plugins action="list".');
                    }
                    const plugin = await api.plugins.get(name);
                    if (plugin === undefined || plugin === null) {
                        throw new WhistleError('not-found', 'No Whistle plugin named "' + name + '".', 'Call whistle_plugins action="list".');
                    }
                    return renderOne(plugin);
                }, { signal: exec.signal });
            }
            catch (cause) {
                throw asToolFailure(cause);
            }
        },
    });
}
function renderList(plugins) {
    const lines = ['plugins: ' + plugins.length];
    if (plugins.length === 0) {
        lines.push('No Whistle plugins installed.');
        return lines.join('\n');
    }
    lines.push(['name'.padEnd(20), 'on', 'version'.padEnd(10), 'module'].join('  '));
    for (const plugin of plugins) {
        lines.push([
            String(plugin.name ?? '-').padEnd(20),
            plugin.selected === false ? '  ' : ' ✓',
            String(plugin.version ?? '-').padEnd(10),
            String(plugin.moduleName ?? '-'),
        ].join('  '));
    }
    return lines.join('\n');
}
function renderOne(plugin) {
    return jsonText({
        name: plugin.name,
        moduleName: plugin.moduleName,
        version: plugin.version,
        selected: plugin.selected !== false,
        description: plugin.description,
        rules: plugin.rules,
    });
}
