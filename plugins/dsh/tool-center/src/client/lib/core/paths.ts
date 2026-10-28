/**
 * 工作区路径是否同一个。
 *
 * 这是**宿主 `shared/paths.ts` 的 `samePath` 的镜像**，不是第二套规则：浏览器半侧不能 import
 * Host 代码（另一个 bundle、另一套运行时），所以只能照抄语义 —— 空串不等于任何路径、
 * 统一分隔符、盘符路径忽略大小写。改这里必须同时改宿主那一份，否则「界面里选中的工作区」
 * 与「宿主实际生效的工作区」会不是同一个。
 */
export function samePath(left: string, right: string): boolean {
  const norm = (value: string): string => {
    const slashed = value.trim().replace(/[\\/]+/g, '/').replace(/\/+$/, '')
    return /^[A-Za-z]:/.test(slashed) ? slashed.toLowerCase() : slashed
  }
  return left !== '' && right !== '' && norm(left) === norm(right)
}
