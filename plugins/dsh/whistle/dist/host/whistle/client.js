/**
 * Whistle 的 Local Agent API 客户端。
 *
 * 三件事：
 *   1. 找到 `bin/api` —— 依次试 `config.apiPath`、`require.resolve('whistle/bin/api')`、
 *      `w2 root bin/api`（whistle 官方文档给的探测方式）；
 *   2. 用 `network.getStatus()` 确认服务在跑、版本 >= 2.10.7；
 *   3. 把每次调用套上超时与取消，并把底层异常翻译成「原因 + 怎么办」。
 *
 * 缓存的是 **API 模块**，不是连接：whistle 每次请求都会重读自己的配置，
 * 所以 `w2 restart` 换了端口也不必让本插件重载。探测失败不缓存，下一个工具
 * 调用会重新找一遍 —— 用户装好或启动 whistle 之后立刻就能用。
 */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { WhistleError, describeFailure, raceWithBudget, textOf } from "../shared/errors.js";
export const DEFAULT_COMMAND = 'w2';
export const DEFAULT_TIMEOUT_MS = 20000;
export const MIN_API_VERSION = '2.10.7';
const localRequire = createRequire(import.meta.url);
/** 语义化版本比较，只看数字段（预发布后缀忽略）。 */
export function compareVersions(left, right) {
    const a = partsOf(left);
    const b = partsOf(right);
    const shared = Math.max(a.length, b.length);
    for (let index = 0; index < shared; index += 1) {
        const x = a[index] ?? 0;
        const y = b[index] ?? 0;
        if (x !== y)
            return x > y ? 1 : -1;
    }
    return 0;
}
function partsOf(version) {
    return version
        .trim()
        .replace(/^v/i, '')
        .split('-')[0]
        .split('.')
        .map((part) => {
        const value = Number.parseInt(part, 10);
        return Number.isFinite(value) ? value : 0;
    });
}
function nonEmpty(value) {
    return typeof value === 'string' ? value.trim() : '';
}
function normaliseTimeout(value) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0)
        return DEFAULT_TIMEOUT_MS;
    return Math.floor(value);
}
/** 从 `w2 root bin/api` 的输出里挑出真正的模块路径（忽略 whistle 的提示行）。 */
function lastPathLine(stdout) {
    const lines = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line !== '');
    for (let index = lines.length - 1; index >= 0; index -= 1) {
        const line = lines[index];
        if (/bin[/\\]api$/i.test(line))
            return line;
    }
    return '';
}
function tryResolve(specifier) {
    try {
        return localRequire.resolve(specifier);
    }
    catch {
        return '';
    }
}
export class WhistleClient {
    timeoutMs;
    command;
    apiPath;
    minVersion;
    factory;
    pending;
    detected = '';
    constructor(options = {}) {
        this.timeoutMs = normaliseTimeout(options.timeoutMs);
        this.command = nonEmpty(options.command) || DEFAULT_COMMAND;
        this.apiPath = nonEmpty(options.apiPath);
        this.minVersion = options.minVersion === undefined ? MIN_API_VERSION : options.minVersion.trim();
        this.factory = options.apiFactory ?? (async () => this.loadFromDisk());
    }
    /** 探测到的 whistle 版本；首次成功连接后才有值。 */
    get version() {
        return this.detected;
    }
    /** 拿到（并缓存）API 模块。失败不缓存：用户刚装好或启动的 whistle 下一次就能连上。 */
    api() {
        const pending = this.pending ?? this.connect();
        this.pending = pending;
        /* 有人必须消费 rejection，否则每次探测失败都会留下一个 unhandled rejection。 */
        pending.catch(() => {
            if (this.pending === pending)
                this.pending = undefined;
        });
        return pending;
    }
    /** 跑一次带预算的调用；异常统一成 `WhistleError`。 */
    async call(label, work, options = {}) {
        const api = await this.api();
        try {
            return await raceWithBudget(Promise.resolve(work(api)), {
                label,
                timeoutMs: this.timeoutMs,
                signal: options.signal,
            });
        }
        catch (cause) {
            throw describeFailure(cause, label);
        }
    }
    /** 丢掉缓存的 API 模块（换版本、换安装位置后用）。 */
    reset() {
        this.pending = undefined;
        this.detected = '';
    }
    dispose() {
        this.reset();
    }
    /* ------------------------------- 内部 ------------------------------- */
    async connect() {
        const api = await this.load();
        let status;
        try {
            status = await raceWithBudget(Promise.resolve(api.network.getStatus()), {
                label: 'probe Whistle status',
                timeoutMs: this.timeoutMs,
            });
        }
        catch (cause) {
            throw describeFailure(cause, 'probe Whistle status');
        }
        const version = typeof status?.version === 'string' ? status.version.trim() : '';
        this.detected = version;
        api.version = version;
        this.assertVersion(version);
        return api;
    }
    async load() {
        try {
            return await this.factory();
        }
        catch (cause) {
            throw describeFailure(cause, 'load the Whistle Local Agent API');
        }
    }
    async loadFromDisk() {
        const file = this.apiPath !== '' ? this.apiPath : this.resolveApiPath();
        let loaded;
        try {
            loaded = localRequire(file);
        }
        catch (cause) {
            throw new WhistleError('load', 'Cannot load the Whistle Local Agent API from ' + file + '.', textOf(cause) + '\nSet config.apiPath to the right file, or reinstall: npm install -g whistle@latest');
        }
        const candidate = loaded?.default ?? loaded;
        if (candidate === null || typeof candidate !== 'object') {
            throw new WhistleError('load', 'whistle bin/api did not export an API object: ' + file);
        }
        const api = candidate;
        if (typeof api.network?.getStatus !== 'function') {
            throw new WhistleError('load', 'The file at ' + file + ' does not look like a Whistle >= ' + MIN_API_VERSION + ' API entry (no network.getStatus).', 'Set config.apiPath to the real bin/api file of your Whistle installation.');
        }
        return candidate;
    }
    resolveApiPath() {
        const resolved = tryResolve('whistle/bin/api');
        return resolved !== '' ? resolved : this.w2ApiPath();
    }
    /**
     * `w2 root bin/api`。Windows 上 `w2` 实际是 `w2.cmd`，CreateProcess 起不来，
     * 必须走 shell；POSIX 上 shell 也能正确解析 PATH 里的软链。
     */
    w2ApiPath() {
        const shell = process.platform === 'win32';
        const command = shell && /\s/.test(this.command) ? '"' + this.command + '"' : this.command;
        const result = spawnSync(command, ['root', 'bin/api'], {
            encoding: 'utf8',
            timeout: Math.max(this.timeoutMs, 5000),
            windowsHide: true,
            shell,
        });
        const file = lastPathLine(typeof result.stdout === 'string' ? result.stdout : '');
        if (file !== '')
            return file;
        if (result.error !== undefined && result.error !== null) {
            throw new WhistleError('missing', 'Cannot run the Whistle CLI (' + this.command + '): ' + textOf(result.error), 'Install it first: npm install -g whistle, then `w2 start`. Alternatively set config.command to the full path '
                + 'of the CLI (w2.cmd on Windows).');
        }
        const stderr = typeof result.stderr === 'string' ? result.stderr.trim() : '';
        throw new WhistleError('missing', '`' + this.command + ' root bin/api` returned no API path (exit ' + String(result.status) + ')'
            + (stderr === '' ? '' : ': ' + stderr), 'Make sure Whistle is installed globally: npm install -g whistle.');
    }
    assertVersion(version) {
        if (this.minVersion === '' || version === '')
            return;
        if (compareVersions(version, this.minVersion) >= 0)
            return;
        throw new WhistleError('version', 'Whistle ' + version + ' is older than the Local Agent API minimum ' + this.minVersion + '.', 'Upgrade, then retry: npm install -g whistle@latest && w2 restart. This plugin re-detects on every call, so the '
            + 'Harness does not need a restart.');
    }
}
