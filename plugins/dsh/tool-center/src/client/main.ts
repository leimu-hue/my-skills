/**
 * 打包入口：Web 外壳加载的那一个文件。
 *
 * `__ModuleLoader__.load({ id, factory })` 这层外壳由 scripts/build.mjs 的 banner/footer
 * 提供（与 `@local/dsh-related-projects` 同形），所以这里只剩模块体本身：客户端插件契约
 * 就是具名导出 `inject` 与 `apply`。React 照常 `import` —— 它在平台模块表里，不在 bundle 里。
 */
export { apply, inject } from './plugin.ts'
