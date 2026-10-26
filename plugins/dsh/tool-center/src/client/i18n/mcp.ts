/** MCP 域词条。 */

export const ZH_MCP: Record<string, string> = {
  'mcp.title': 'MCP 服务器',
  'mcp.subtitle': '读取 cordis.patch.yml 里的 MCP 服务器。启停写成文件末尾的覆盖行，不改你原来那条声明；任何写入前都先备份。',
  'mcp.noPatch': '还没有 cordis.patch.yml，先在 DSH 配置里加一台服务器。',
  'mcp.empty': '这个 patch 文件里没有 MCP 服务器行。',
  'mcp.enabled': '已启用',
  'mcp.disabled': '已停用',
  'mcp.patchPath': '补丁文件',
  'mcp.servers': '{n} 台',
  'mcp.backups': '备份 {n} 份',
  'mcp.args': '参数',
  'mcp.delete': '删除',
  'mcp.confirmDelete': '从 cordis.patch.yml 里删掉服务器「{name}」？会先备份。',
  'mcp.overridden': '由本插件覆盖',
  'mcp.toggled': '「{name}」已{state}',
}

export const EN_MCP: Record<string, string> = {
  'mcp.title': 'MCP servers',
  'mcp.subtitle': 'Reads the MCP servers in cordis.patch.yml. Switches are written as an override at the end of the file; your declaration is untouched and every write is backed up first.',
  'mcp.noPatch': 'No cordis.patch.yml yet — add a server in the DSH config first.',
  'mcp.empty': 'No MCP server rows in this patch file.',
  'mcp.enabled': 'enabled',
  'mcp.disabled': 'disabled',
  'mcp.patchPath': 'Patch file',
  'mcp.servers': '{n} servers',
  'mcp.backups': '{n} backups',
  'mcp.args': 'Args',
  'mcp.delete': 'Delete',
  'mcp.confirmDelete': 'Remove server "{name}" from cordis.patch.yml? A backup is written first.',
  'mcp.overridden': 'overridden by this plugin',
  'mcp.toggled': '"{name}" is now {state}',
}
