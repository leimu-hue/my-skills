/**
 * 打包入口：Web 外壳加载的那一个文件。
 *
 * `__ModuleLoader__.load({ id, factory })` 这层外壳由 scripts/build.mjs 的
 * banner/footer 提供（与随附插件同形），所以这里只剩模块体本身：客户端插件
 * 契约就是具名导出 `inject` 与 `apply`。
 */
export { apply, inject } from './plugin.js'
