/**
 * Client UI 访问的插件自有 JSON 路由：每个方法一个处理器。
 *
 * 变更只回答「它改了什么」，整份状态由随后的 `state` 重新读取；写操作返回
 * 单个 worktree 的观察值，避免每次创建都让 Client 多等一轮列表。
 */
import { DomainError } from "../shared/errors.js";
function idOf(payload) {
    const id = payload.id;
    if (typeof id !== 'string' || id === '')
        throw new DomainError('bad-request', 'id is required');
    return id;
}
export function createHandlers(deps) {
    const { service } = deps;
    return {
        async state() {
            return service.state();
        },
        async select(payload) {
            return service.select(payload.repository);
        },
        /* 面板设置：目前只有分支前缀。 */
        async settings(payload) {
            return service.setBranchPrefix(payload.branchPrefix);
        },
        async create(payload) {
            return service.create({
                repository: payload.repository,
                name: payload.name,
                base: payload.base,
                mode: payload.mode,
                branch: payload.branch,
            });
        },
        async diff(payload) {
            return service.diff(idOf(payload));
        },
        async apply(payload) {
            return { result: await service.apply(idOf(payload)) };
        },
        async remove(payload) {
            return service.remove(idOf(payload), { force: payload.force === true });
        },
        /* 清理「登记了但目录已不存在」的残留；只动目录确实消失的记录。 */
        async prune() {
            return service.prune();
        },
        async open(payload) {
            return service.open(idOf(payload));
        },
        /* 注册成官方工作区：之后用户能在侧栏里打开这个目录、在其中新建会话。 */
        async register(payload) {
            return service.registerWorkspace(idOf(payload));
        },
        /* 在检出目录里新建会话：cwd 不可变，这是「进入检出」的等价实现。 */
        async session(payload) {
            return service.newSession(idOf(payload));
        },
    };
}
