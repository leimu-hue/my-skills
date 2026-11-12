/**
 * 子进程的终止语义。
 *
 * 两件事只做一次，因为两处执行器（git 与 setup 命令）都要：
 *
 *   1. **杀整棵树**。`child.kill()` 只杀一个进程；`shell: true` 或 `npm install`
 *      派生的孙进程会继续持有管道，父进程的 `close` 永远不触发。
 *      Windows 上只有 `taskkill /T` 有进程树语义。
 *   2. **同步地杀**。用 `spawnSync` 而不是 `spawn`：超时处理本来就发生在收尾路径上，
 *      让「进程树已经没了」成为函数返回时的事实，比之后某个时刻才消失可靠得多。
 *   3. **不要在 `exit` 之后无限等**。`exit` 早于 `close`，但正常情况下 `close`
 *      很快会来且带全量输出；只有管道被别处持有时才会缺席——所以 `exit` 之后留
 *      一个短宽限期，宽限期到了就用已收到的输出收尾。
 */
import { spawnSync } from 'node:child_process';
/** `exit` 之后等 `close` 的宽限期；超时就用已有输出收尾。 */
export const CLOSE_GRACE_MS = 500;
export function killTree(child) {
    const pid = child.pid;
    if (process.platform === 'win32' && typeof pid === 'number' && pid > 0) {
        const result = spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], {
            stdio: 'ignore',
            windowsHide: true,
            timeout: 5_000,
        });
        if (result.error !== undefined || result.status !== 0)
            child.kill('SIGKILL');
        return;
    }
    child.kill('SIGKILL');
}
