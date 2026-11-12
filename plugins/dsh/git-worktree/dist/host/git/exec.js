/**
 * git 子进程执行器。命令本身在 `commands.ts` 里，这里只管「怎么跑」。
 *
 * 三条选择：
 *   * **不传 `--no-optional-locks`**：`status` 必须能把算好的 stat 缓存写回 index，
 *     否则每一次状态检查都要重新读取并哈希整个工作区（实测慢 8~17 倍）。
 *   * **不覆盖 `core.fsmonitor`**：用户仓库启用了 fsmonitor 时，强制关闭只会更慢。
 *   * 只在确实需要的地方禁用 hooks（快照提交改用 `commit-tree`，根本不触发 hooks）。
 *
 * 其余硬化：拒绝环境里的仓库路由变量、无终端提示、C locale、超时杀进程树、
 * 有上限的收集、Windows 长路径。
 */
import { spawn } from 'node:child_process';
import { DomainError } from "../shared/errors.js";
import { CLOSE_GRACE_MS, killTree } from "../shared/process.js";
import { requireOid } from "./commands.js";
const DEFAULT_MAX_BYTES = 1 << 20;
const ROUTING = /^GIT_(DIR|WORK_TREE|COMMON_DIR|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|NAMESPACE|CEILING_DIRECTORIES|DISCOVERY_ACROSS_FILESYSTEM|CONFIG_PARAMETERS|CONFIG_COUNT|CONFIG_KEY_.*|CONFIG_VALUE_.*)$/i;
/** 只保留 argv 意义上的 base 选项：不改变用户仓库的语义。 */
function baseArgs() {
    return [
        '--no-pager',
        ...(process.platform === 'win32' ? ['-c', 'core.longpaths=true'] : []),
        '-c', 'core.quotePath=false',
    ];
}
function cleanEnv(extra) {
    const env = { ...process.env };
    for (const key of Object.keys(env))
        if (ROUTING.test(key))
            delete env[key];
    env.GIT_TERMINAL_PROMPT = '0';
    env.LC_ALL = 'C';
    env.LANG = 'C';
    if (extra !== undefined) {
        for (const [key, value] of Object.entries(extra)) {
            if (value === undefined)
                delete env[key];
            else
                env[key] = value;
        }
    }
    return env;
}
/** 运行一条 git 命令；非零退出不是异常，由调用方决定含义。 */
export function runGit(command, options) {
    const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    return new Promise((resolve, reject) => {
        const child = spawn('git', [...baseArgs(), ...command.args], {
            cwd: options.cwd,
            env: cleanEnv(options.env),
            windowsHide: true,
            stdio: [options.input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
        });
        const out = [];
        const err = [];
        let outBytes = 0;
        let errBytes = 0;
        let truncated = false;
        const collect = (chunks, chunk, current) => {
            if (current >= maxBytes) {
                truncated = true;
                return current;
            }
            const remaining = maxBytes - current;
            if (chunk.length <= remaining) {
                chunks.push(chunk);
                return current + chunk.length;
            }
            chunks.push(chunk.subarray(0, remaining));
            truncated = true;
            return maxBytes;
        };
        child.stdout?.on('data', (chunk) => { outBytes = collect(out, chunk, outBytes); });
        child.stderr?.on('data', (chunk) => { errBytes = collect(err, chunk, errBytes); });
        let settled = false;
        let timedOut = false;
        let exitCode = null;
        let exitSignal = null;
        let grace;
        const finish = () => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            if (grace !== undefined)
                clearTimeout(grace);
            const stdout = Buffer.concat(out).toString('utf8');
            const stderr = Buffer.concat(err).toString('utf8');
            if (timedOut) {
                resolve({
                    code: -1,
                    stdout,
                    stderr: `${command.name}: git ${command.args.join(' ')} timed out after ${options.timeoutMs} ms`,
                    truncated,
                    timedOut: true,
                });
                return;
            }
            resolve({
                code: exitCode ?? -1,
                stdout,
                /* 保留 git 自己的 stderr：分类要看它（比如 "with conflicts"）。 */
                stderr: exitSignal === 'SIGKILL' ? `${stderr}\ngit ${command.name} was killed` : stderr,
                truncated,
                timedOut: false,
            });
        };
        const timer = setTimeout(() => {
            timedOut = true;
            killTree(child);
            /* 杀掉之后仍要收尾：管道可能被孙进程持有，`close` 不会来。 */
            grace = setTimeout(finish, CLOSE_GRACE_MS);
        }, options.timeoutMs);
        timer.unref?.();
        child.on('error', (error) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            reject(error.code === 'ENOENT'
                ? new DomainError('git-failed', 'git executable was not found on PATH')
                : error);
        });
        /*
         * `exit` 早于 `close`：先记下状态，再给 `close` 一个宽限期。
         * 正常情况 `close` 会立刻到并带全量输出；孙进程占着管道时它不会来，
         * 宽限期到了就用已收到的输出收尾——总比永久挂起好。
         */
        child.on('exit', (code, signal) => {
            exitCode = code;
            exitSignal = signal;
            grace = setTimeout(finish, CLOSE_GRACE_MS);
            grace.unref?.();
        });
        child.on('close', (code, signal) => {
            exitCode = code;
            exitSignal = signal;
            finish();
        });
        if (options.input !== undefined) {
            child.stdin?.on('error', () => { });
            child.stdin?.end(options.input);
        }
    });
}
/** 运行一条必须成功的 git 命令，返回去掉首尾空白的 stdout。 */
export async function gitText(command, options) {
    const result = await runGit(command, options);
    if (result.code !== 0) {
        throw new DomainError('git-failed', `${command.name} failed: ${result.stderr.trim() || `exit ${result.code}`}`);
    }
    return result.stdout.trim();
}
/** 运行一条必须成功的 git 命令，并把结果当作提交 id 收下。 */
export async function gitOid(command, options, what) {
    return requireOid(await gitText(command, options), what);
}
