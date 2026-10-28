/** 输入框下方条与它打开的弹层的文案。 */

export const ZH_DOCK = {
  'dock.label': '{n} 个关联项目',
  'dock.labelMissing': '{n} 个关联项目，其中 {m} 个路径不存在',
  'dock.empty': '+ 关联其它项目',
  'dock.applies': '本次会话会告诉模型这些路径',
}

export const EN_DOCK: Record<keyof typeof ZH_DOCK, string> = {
  'dock.label': '{n} related projects',
  'dock.labelMissing': '{n} related projects, {m} with a missing path',
  'dock.empty': '+ Add related project',
  'dock.applies': 'The agent is told these paths for this session',
}
