/** 全局共享的词条：页签名、插件名、通用动作。 */

export const ZH_COMMON: Record<string, string> = {
  'nav.title': '工具中心',

  'tab.scenes': '场景',
  'tab.mcp': 'MCP',
  'tab.skills': '技能',
  'tab.prompts': '提示词',

  'error.title': '出错了',
  'error.pluginUnavailable': '工具中心已停用：宿主上没有这条接口。重新启用后会自动恢复。',

  'common.save': '保存',
  'common.cancel': '取消',
  'common.search': '搜索',
}

export const EN_COMMON: Record<string, string> = {
  'nav.title': 'Tool center',

  'tab.scenes': 'Scenes',
  'tab.mcp': 'MCP',
  'tab.skills': 'Skills',
  'tab.prompts': 'Prompts',

  'error.title': 'Something went wrong',
  'error.pluginUnavailable': 'Tool center is disabled: the host no longer serves this endpoint. It recovers by itself once re-enabled.',

  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.search': 'Search',
}
