/**
 * Whistle Local Agent API 的最小类型面。
 *
 * `w2 root bin/api` 指向的是 whistle 自己的 CommonJS 运行时代码，没有任何类型
 * 声明，而且在快速演进。把整张 API 抄一遍只会变成维护负担，所以这里只声明本插件
 * 真正调用的方法，其余字段保留 `unknown` 交给各工具自己窄化。
 *
 * 参考：https://wproxy.org/docs/extensions/api.html （whistle >= 2.10.7）
 */
export {};
