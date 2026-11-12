/**
 * 创建后执行的 setup / verify 命令。
 *
 * 命令来自插件配置（用户的 cordis 配置），不来自仓库内容，所以这里不做沙箱；
 * 但它必须在**新检出里**跑，因此清掉 Git 的仓库路由变量——否则从 worktree 里
 * 启动的脚本会被父进程的 `GIT_DIR` 指回主仓。
 *
 * 超时必须有终点：`npm install` 会派生一整个进程树，只杀 shell 的话孙进程继续
 * 持有 stdout/stderr 管道，`close` 永远不会来——`create` 就这样永久挂起。
 */
import { spawn } from 'node:child_process';
import { CLOSE_GRACE_MS, killTree } from "./process.js";
const OUTPUT_LIMIT = 4 * 1024;
const ROUTING = /^GIT_(DIR|WORK_TREE|COMMON_DIR|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|NAMESPACE)$/i;
export function runCommand(command, options) {
    return new Promise((resolve) => {
        const env = { ...process.env };
        for (const key of Object.keys(env))
            if (ROUTING.test(key))
                delete env[key];
        env.GIT_TERMINAL_PROMPT = '0';
        let child;
        try {
            child = spawn(command, {
                cwd: options.cwd,
                env,
                shell: true,
                windowsHide: true,
                stdio: ['ignore', 'pipe', 'pipe'],
            });
        }
        catch (error) {
            resolve({ ok: false, code: -1, output: error instanceof Error ? error.message : String(error), timedOut: false });
            return;
        }
        const chunks = [];
        let size = 0;
        const collect = (chunk) => {
            if (size >= OUTPUT_LIMIT)
                return;
            const remaining = OUTPUT_LIMIT - size;
            chunks.push(chunk.length <= remaining ? chunk : chunk.subarray(0, remaining));
            size += Math.min(chunk.length, remaining);
        };
        child.stdout?.on('data', collect);
        child.stderr?.on('data', collect);
        let settled = false;
        let timedOut = false;
        let exitCode = null;
        let grace;
        const finish = () => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            if (grace !== undefined)
                clearTimeout(grace);
            const output = Buffer.concat(chunks).toString('utf8').trim();
            const code = timedOut ? -1 : (exitCode ?? -1);
            resolve({
                ok: code === 0,
                code,
                output: timedOut ? `${output}\n(timed out after ${options.timeoutMs} ms)`.trim() : output,
                timedOut,
            });
        };
        const timer = setTimeout(() => {
            timedOut = true;
            killTree(child);
            grace = setTimeout(finish, CLOSE_GRACE_MS);
            grace.unref?.();
        }, options.timeoutMs);
        timer.unref?.();
        child.on('error', (error) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            resolve({ ok: false, code: -1, output: error.message, timedOut: false });
        });
        child.on('exit', (code) => {
            exitCode = code;
            grace = setTimeout(finish, CLOSE_GRACE_MS);
            grace.unref?.();
        });
        child.on('close', (code) => {
            exitCode = code;
            finish();
        });
    });
}
