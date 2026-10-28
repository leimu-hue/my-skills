/**
 * Registry：持久化，以及「什么才算关联项目」的规则。
 *
 * 这一层不关心 Cordis、HTTP 或提示词，只是纯粹的
 * 文件系统 + 校验，因此可以单独推演（也便于单独测试）。
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { basename, defaultDataFile, isDirectory, isDriveRoot, isHome, normalizePath, workspaceKey } from '../shared/paths.js';
import { RegistryError } from '../shared/errors.js';
const MAX_PROJECTS = 10;
const NOTE_MAX = 200;
const NAME_MAX = 60;
const STORE_VERSION = 1;
function text(value, max) {
    return String(value ?? '').replace(/\r\n/g, '\n').slice(0, max);
}
/** 只接受真正的布尔值；其余（含缺失）一律视为「没提这件事」。 */
function booleanOf(value) {
    return typeof value === 'boolean' ? value : undefined;
}
function cleanName(value) {
    return text(value, NAME_MAX).replace(/[\u0000-\u001f]/g, ' ').trim();
}
function nameOf(path, name) {
    const fallback = basename(path);
    const cleaned = cleanName(name === undefined || name === '' ? fallback : name);
    return cleaned === '' ? fallback : cleaned;
}
/**
 * 本模块创建的每个 `Project` 都经由这一个构造函数——载入已存的行、
 * 新增一个、复制一个——这样默认值与清洗规则不会在这些路径之间
 * 各自跑偏。
 */
function makeProject(input) {
    return {
        id: typeof input.id === 'string' && input.id !== '' ? input.id : randomUUID(),
        path: input.path,
        name: nameOf(input.path, input.name),
        note: text(input.note, NOTE_MAX),
        enabled: input.enabled === undefined ? true : input.enabled !== false,
        origin: input.origin === 'agent' ? 'agent' : 'user',
        createdAt: typeof input.createdAt === 'number' ? input.createdAt : Date.now(),
    };
}
function emptyDocument() {
    return { version: STORE_VERSION, settings: { alwaysShowDock: true }, groups: {} };
}
export class Registry {
    limits = { max: MAX_PROJECTS, noteMax: NOTE_MAX, nameMax: NAME_MAX };
    file;
    document = emptyDocument();
    loaded = false;
    constructor(file) {
        this.file = file !== undefined && file !== '' ? file : defaultDataFile();
    }
    load() {
        if (this.loaded)
            return this.document;
        this.loaded = true;
        if (!existsSync(this.file))
            return this.document;
        try {
            const raw = JSON.parse(readFileSync(this.file, 'utf8'));
            const document = emptyDocument();
            if (raw.settings !== undefined && typeof raw.settings.alwaysShowDock === 'boolean') {
                document.settings.alwaysShowDock = raw.settings.alwaysShowDock;
            }
            for (const [key, group] of Object.entries(raw.groups ?? {})) {
                if (group === null || typeof group !== 'object' || !Array.isArray(group.projects))
                    continue;
                const projects = [];
                for (const project of group.projects) {
                    if (project === null || typeof project !== 'object' || typeof project.path !== 'string')
                        continue;
                    projects.push(makeProject(project));
                }
                document.groups[key] = {
                    key,
                    path: typeof group.path === 'string' && group.path !== '' ? group.path : key,
                    updatedAt: typeof group.updatedAt === 'number' ? group.updatedAt : 0,
                    projects,
                };
            }
            this.document = document;
        }
        catch {
            /* 文档损坏也不能让插件彻底废掉：内存里保留一个空注册表，
               下一次写入时会替换掉该文件。 */
        }
        return this.document;
    }
    persist() {
        const directory = dirname(this.file);
        if (!existsSync(directory))
            mkdirSync(directory, { recursive: true });
        const temporary = this.file + '.tmp-' + String(process.pid);
        writeFileSync(temporary, JSON.stringify(this.document, null, 2), 'utf8');
        renameSync(temporary, this.file);
    }
    /* ------------------------------ 设置 ------------------------------ */
    getSettings() {
        return { ...this.load().settings };
    }
    setSettings(patch) {
        const document = this.load();
        const alwaysShowDock = patch !== null && typeof patch === 'object'
            ? booleanOf(patch.alwaysShowDock)
            : undefined;
        if (alwaysShowDock !== undefined)
            document.settings.alwaysShowDock = alwaysShowDock;
        this.persist();
        return this.getSettings();
    }
    /* ------------------------------- 分组 ------------------------------- */
    groupFor(workspace) {
        const key = workspaceKey(workspace);
        if (key === '')
            return null;
        return this.load().groups[key] ?? null;
    }
    groups() {
        return Object.values(this.load().groups)
            .map((group) => this.presentGroup(group))
            .sort((left, right) => right.updatedAt - left.updatedAt);
    }
    /** `path` 对应的分组；工作区还没有分组时就在内存里新建一个。 */
    groupOrCreate(path) {
        const document = this.load();
        const key = workspaceKey(path);
        let group = document.groups[key];
        if (group === undefined) {
            group = { key, path, updatedAt: Date.now(), projects: [] };
            document.groups[key] = group;
        }
        return group;
    }
    /* ------------------------------ 项目 ------------------------------ */
    assertCandidate(candidatePath, workspace) {
        if (candidatePath === '' || !isDirectory(candidatePath))
            throw new RegistryError('not-directory');
        if (isDriveRoot(candidatePath))
            throw new RegistryError('root');
        if (isHome(candidatePath))
            throw new RegistryError('home');
        if (workspaceKey(candidatePath) === workspaceKey(workspace))
            throw new RegistryError('self');
    }
    add(workspace, input) {
        const workspacePath = normalizePath(workspace);
        if (workspacePath === '' || !isDirectory(workspacePath))
            throw new RegistryError('workspace-missing');
        const candidatePath = normalizePath(input.path);
        this.assertCandidate(candidatePath, workspacePath);
        const group = this.groupOrCreate(workspacePath);
        /* 同一个目录重复添加是空操作，不是错误：界面和 Agent 都会
           重复提交同一意图。 */
        const duplicate = group.projects.find((project) => workspaceKey(project.path) === workspaceKey(candidatePath));
        if (duplicate !== undefined)
            return this.presentProject(duplicate);
        if (group.projects.length >= MAX_PROJECTS)
            throw new RegistryError('limit');
        const project = makeProject({ path: candidatePath, name: input.name, note: input.note, origin: input.origin });
        group.projects.push(project);
        group.updatedAt = Date.now();
        this.persist();
        return this.presentProject(project);
    }
    update(workspace, id, patch) {
        const group = this.groupFor(workspace);
        if (group === null)
            throw new RegistryError('no-group');
        const project = group.projects.find((entry) => entry.id === id);
        if (project === undefined)
            throw new RegistryError('no-project');
        const body = (patch ?? {});
        if (typeof body.name === 'string') {
            const name = cleanName(body.name);
            if (name !== '')
                project.name = name;
        }
        if (typeof body.note === 'string')
            project.note = text(body.note, NOTE_MAX);
        const enabled = booleanOf(body.enabled);
        if (enabled !== undefined)
            project.enabled = enabled;
        group.updatedAt = Date.now();
        this.persist();
        return this.presentProject(project);
    }
    /** 删除一个项目，并返回它的显示名。 */
    remove(workspace, id) {
        const document = this.load();
        const group = this.groupFor(workspace);
        if (group === null)
            throw new RegistryError('no-group');
        const index = group.projects.findIndex((entry) => entry.id === id);
        const removed = group.projects[index];
        if (removed === undefined)
            throw new RegistryError('no-project');
        group.projects.splice(index, 1);
        group.updatedAt = Date.now();
        if (group.projects.length === 0)
            delete document.groups[group.key];
        this.persist();
        return removed.name;
    }
    copy(from, to) {
        const source = this.groupFor(from);
        if (source === null)
            throw new RegistryError('no-group');
        const targetPath = normalizePath(to);
        if (targetPath === '' || !isDirectory(targetPath))
            throw new RegistryError('not-directory');
        const target = this.groupOrCreate(targetPath);
        let added = 0;
        let skipped = 0;
        for (const project of source.projects) {
            if (target.projects.some((entry) => workspaceKey(entry.path) === workspaceKey(project.path))) {
                skipped += 1;
                continue;
            }
            if (target.projects.length >= MAX_PROJECTS) {
                skipped += 1;
                continue;
            }
            target.projects.push(makeProject({
                path: project.path,
                name: project.name,
                note: project.note,
                enabled: project.enabled,
            }));
            added += 1;
        }
        target.updatedAt = Date.now();
        this.persist();
        return { added, skipped };
    }
    findProject(workspace, id) {
        const project = this.groupFor(workspace)?.projects.find((entry) => entry.id === id);
        return project === undefined ? undefined : this.presentProject(project);
    }
    /* -------------------------------- 视图 -------------------------------- */
    presentProject(project) {
        return {
            id: project.id,
            path: project.path,
            name: project.name,
            note: project.note,
            enabled: project.enabled !== false,
            origin: project.origin === 'agent' ? 'agent' : 'user',
            exists: isDirectory(project.path),
        };
    }
    presentGroup(group) {
        return {
            key: group.key,
            path: group.path,
            updatedAt: group.updatedAt,
            projects: group.projects.map((project) => this.presentProject(project)),
        };
    }
    snapshot(workspace) {
        const path = normalizePath(workspace);
        const group = path === '' ? null : this.groupFor(path);
        return {
            settings: this.getSettings(),
            /* 按请求传入的路径上报，而不是按分组：还没有任何项目的工作区
               同样需要自己的 `workspace` ref（面板的「添加第一个」状态
               就依赖它）。 */
            workspace: path === '' ? null : { key: workspaceKey(path), path },
            projects: group === null ? [] : group.projects.map((project) => this.presentProject(project)),
            limits: { ...this.limits },
        };
    }
    /**
     * 所有读取方共享的列表：只含已启用的行，并按目录是否还在拆分。
     * 缺失的路径会作为不可用上报给模型，
     * 而不是悄悄从列表里消失。
     */
    readable(workspace) {
        const present = [];
        const missing = [];
        for (const project of this.snapshot(workspace).projects) {
            if (!project.enabled)
                continue;
            if (project.exists)
                present.push(project);
            else
                missing.push(project);
        }
        return { present, missing };
    }
}
