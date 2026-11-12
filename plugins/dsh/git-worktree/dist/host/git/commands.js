/**
 * Git 命令目录：本插件用到的**每一条** git 命令都定义在这里，别处只引用。
 *
 * 为什么集中：
 *
 *   1. 维护者想知道「这个插件到底调了哪些 git」时只看这一个文件；`GIT_COMMANDS`
 *      还给出每条命令的用途与写副作用，可以直接打印成文档。
 *   2. 参数拼装只有一处，`--end-of-options`、`-z`、`--porcelain=v1` 这类
 *      「机器可读」的约定不会在某个调用点被忘掉。
 *   3. 写副作用（`effect`）是显式声明：`none` 的命令可以在任何地方跑，
 *      `repository` 的那几条必须持有锁。
 *
 * 约定：`args` 里一律不放 `-c` / `--no-pager` 这类全局选项——它们由
 * `exec.ts` 的 `baseArgs()` 统一加在前面，这样「怎么调 git」只有一处。
 */
import { DomainError } from "../shared/errors.js";
/**
 * 命令清单。键即 `GitCommand.name`，构建器必须与之一一对应
 * （`build()` 的 `K extends keyof typeof SPECS` 保证拼错名字是编译错误）。
 */
const SPECS = {
    version: { purpose: '诊断用：git 版本', effect: 'none' },
    probeLayout: { purpose: '一次拿到顶层目录、公共目录与自己的 git 目录', effect: 'none' },
    superproject: { purpose: '判断这个检出是不是 submodule', effect: 'none' },
    currentBranch: { purpose: '当前分支名（detached 时无输出）', effect: 'none' },
    headOid: { purpose: '当前 HEAD 的提交 id', effect: 'none' },
    commitOf: { purpose: '把任意 ref 解析成提交 id', effect: 'none' },
    remoteHead: { purpose: '远端默认分支（origin/HEAD）', effect: 'none' },
    branchRef: { purpose: '某个本地分支是否存在', effect: 'none' },
    indexPath: { purpose: 'index 文件的绝对路径（快照前后要备份它）', effect: 'none' },
    checkRefFormat: { purpose: '分支名是否合法，由 git 判断', effect: 'none' },
    worktreeList: { purpose: 'Git 眼里的全部检出（事实来源）', effect: 'none' },
    status: { purpose: '未提交/未跟踪条目（NUL 分隔，机器可读）', effect: 'none' },
    statusText: { purpose: '失败时给人看的工作区快照（非 -z）', effect: 'none' },
    revListLeftRight: { purpose: '相对基线的领先 / 落后提交数', effect: 'none' },
    changedFiles: { purpose: '相对基线的净改动文件列表', effect: 'none' },
    numstat: { purpose: '每个文件的新增 / 删除行数', effect: 'none' },
    patch: { purpose: '给人看的统一 diff 文本', effect: 'none' },
    binaryPatch: { purpose: '搬回主仓用的二进制补丁（含 index 行，三方合并要用）', effect: 'none' },
    untracked: { purpose: '未跟踪文件列表', effect: 'none' },
    ignoredByInclude: { purpose: '.worktreeinclude 命中且被忽略的候选文件', effect: 'none' },
    checkIgnoredStdin: { purpose: '批量确认候选文件确实被仓库忽略', effect: 'none' },
    checkIgnored: { purpose: '某个相对路径是否已被忽略', effect: 'none' },
    readTree: { purpose: '把基线提交发布成 index', effect: 'index' },
    checkoutIndexAll: { purpose: '按 index 全量检出（--index 回写 stat 缓存）', effect: 'worktree' },
    addAll: { purpose: '把工作区（含未跟踪）放进 index，为了取快照树', effect: 'index' },
    writeTree: { purpose: '把 index 写成一个树对象', effect: 'none' },
    commitTree: { purpose: '造一个不挂在任何分支上的快照提交', effect: 'none' },
    updateRef: { purpose: '把快照钉成引用，git gc 不会回收', effect: 'refs' },
    forEachRefContaining: { purpose: '哪些本地/远端分支已经包含了这个提交', effect: 'none' },
    applyCheck: { purpose: '预演补丁：能不能干净地应用', effect: 'none' },
    apply: { purpose: '把补丁应用回主仓工作区', effect: 'worktree' },
    worktreeAdd: { purpose: '登记一个检出（--no-checkout 由后续两步填内容）', effect: 'registration' },
    worktreeRemove: { purpose: '删除检出（两个 --force：脏工作区 + lock）', effect: 'registration' },
    worktreePrune: { purpose: '收回目录已丢失的登记', effect: 'registration' },
    worktreeLock: { purpose: '操作期间挡住并发的删除 / 清理', effect: 'registration' },
    worktreeUnlock: { purpose: '释放自己加的锁', effect: 'registration' },
};
const OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
export function asOid(value) {
    if (typeof value !== 'string')
        return null;
    return OID.test(value) ? value : null;
}
/** 分支名、短 sha、`HEAD` 都不是 OID：拿到就说明上游某一步已经错了。 */
export function requireOid(value, what) {
    const oid = asOid(value.trim());
    if (oid === null) {
        throw new DomainError('git-failed', `${what} is not a commit id: ${JSON.stringify(value)}`);
    }
    return oid;
}
function build(name, args) {
    const spec = SPECS[name];
    return { name, purpose: spec.purpose, effect: spec.effect, args };
}
/**
 * 全部命令构建器。
 *
 * 命名按「做什么」而不是「哪个子命令」，这样调用点读起来是意图：
 * `runGit(Git.status(), options)`、`runGit(Git.worktreeRemove(target), options)`。
 */
export const Git = {
    version: () => build('version', ['--version']),
    probeLayout: () => build('probeLayout', [
        'rev-parse',
        '--path-format=absolute',
        '--show-toplevel',
        '--git-common-dir',
        '--absolute-git-dir',
    ]),
    superproject: () => build('superproject', ['rev-parse', '--show-superproject-working-tree']),
    currentBranch: () => build('currentBranch', ['symbolic-ref', '--short', '--quiet', 'HEAD']),
    headOid: () => build('headOid', ['rev-parse', '--verify', '--quiet', 'HEAD']),
    commitOf: (ref) => build('commitOf', ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`]),
    remoteHead: () => build('remoteHead', [
        'symbolic-ref',
        '--quiet',
        '--short',
        'refs/remotes/origin/HEAD',
    ]),
    branchRef: (branch) => build('branchRef', [
        'rev-parse',
        '--verify',
        '--quiet',
        '--end-of-options',
        `refs/heads/${branch}`,
    ]),
    indexPath: () => build('indexPath', [
        'rev-parse',
        '--path-format=absolute',
        '--git-path',
        'index',
    ]),
    /* `--branch` 自带取值语义，再塞 `--` 会被当成 refname（实测 exit 129）。 */
    checkRefFormat: (branch) => build('checkRefFormat', [
        'check-ref-format',
        '--branch',
        branch,
    ]),
    worktreeList: () => build('worktreeList', ['worktree', 'list', '--porcelain']),
    /** `normal` 已足够判断「有没有改动」，比 `all` 少展开整棵未跟踪目录。 */
    status: () => build('status', [
        'status',
        '--porcelain=v1',
        '-z',
        '--untracked-files=normal',
    ]),
    statusText: () => build('statusText', ['status', '--porcelain=v1', '--untracked-files=normal']),
    revListLeftRight: (base) => build('revListLeftRight', [
        'rev-list',
        '--left-right',
        '--count',
        `${base}...HEAD`,
    ]),
    changedFiles: (base) => build('changedFiles', ['diff', '--name-only', '-z', base, '--']),
    numstat: (base) => build('numstat', ['diff', '--numstat', '-z', base, '--']),
    patch: (base) => build('patch', [
        'diff',
        '--no-color',
        '--no-ext-diff',
        '--no-textconv',
        base,
        '--',
    ]),
    /**
     * 三点 diff：`base...head` 等价于 `diff $(merge-base base head) head`。
     * 两点 diff 在检出 rebase / `pull` 之后会把**上游的新提交**算成「这个检出删掉的东西」，
     * 应用回主仓就是把别人的工作反向撤销。
     */
    binaryPatch: (base, head) => build('binaryPatch', [
        'diff',
        '--binary',
        '--no-color',
        '--no-ext-diff',
        `${base}...${head}`,
        '--',
    ]),
    untracked: () => build('untracked', ['ls-files', '--others', '--exclude-standard', '-z']),
    ignoredByInclude: (includePath) => build('ignoredByInclude', [
        'ls-files',
        '--others',
        '--ignored',
        `--exclude-from=${includePath}`,
        '-z',
        '--',
    ]),
    checkIgnoredStdin: () => build('checkIgnoredStdin', ['check-ignore', '--stdin', '-z']),
    checkIgnored: (relative) => build('checkIgnored', ['check-ignore', '-q', '--', relative]),
    readTree: (base) => build('readTree', ['read-tree', base]),
    checkoutIndexAll: () => build('checkoutIndexAll', ['checkout-index', '--all', '--index']),
    addAll: () => build('addAll', ['add', '-A', '--', '.']),
    writeTree: () => build('writeTree', ['write-tree']),
    /**
     * 快照提交：`commit-tree` 直接造对象、**不移动任何分支**。
     *
     * 之前的实现是 `git commit`，在分支模式下一按「应用」就往用户分支上塞一个
     * `dsh worktree snapshot` 提交——用户 push 时会把它带上。快照本来就只该被
     * 引用（`refs/dsh/archive/*`）或被打成补丁，不该进分支历史。
     */
    commitTree: (tree, parent, message) => build('commitTree', [
        '-c', 'user.name=DSH Worktree',
        '-c', 'user.email=dsh-worktree@localhost',
        'commit-tree',
        tree,
        ...(parent === null ? [] : ['-p', parent]),
        '-m', message,
    ]),
    updateRef: (ref, oid) => build('updateRef', ['update-ref', ref, oid]),
    forEachRefContaining: (oid) => build('forEachRefContaining', [
        'for-each-ref',
        `--contains=${oid}`,
        '--format=%(refname)',
        'refs/heads',
        'refs/remotes',
    ]),
    applyCheck: (merge) => build('applyCheck', [
        'apply',
        '--check',
        ...(merge ? ['--3way'] : []),
        '--binary',
        '-',
    ]),
    apply: (merge) => build('apply', [
        'apply',
        ...(merge ? ['--3way'] : []),
        '--binary',
        '-',
    ]),
    worktreeAdd: (input) => build('worktreeAdd', [
        'worktree', 'add',
        '--no-checkout',
        ...(input.branch === null ? ['--detach'] : ['-b', input.branch]),
        '--lock',
        '--reason', input.reason,
        '--',
        input.target,
        input.base,
    ]),
    worktreeRemove: (target) => build('worktreeRemove', [
        'worktree', 'remove', '--force', '--force', '--',
        target,
    ]),
    worktreePrune: () => build('worktreePrune', ['worktree', 'prune']),
    worktreeLock: (target, reason) => build('worktreeLock', [
        'worktree', 'lock', '--reason', reason, '--',
        target,
    ]),
    worktreeUnlock: (target) => build('worktreeUnlock', ['worktree', 'unlock', '--', target]),
};
export const GIT_COMMANDS = Object.entries(SPECS).map(([name, spec]) => ({
    name,
    purpose: spec.purpose,
    effect: spec.effect,
}));
