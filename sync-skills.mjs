#!/usr/bin/env node
/**
 * sync-skills.mjs —— Skill 拉取 + 软连接管理
 *
 * 功能：
 *   1. pull  ：按配置文件从 GitHub 仓库拉取指定目录下的技能到本地 skills/
 *   2. link  ：把本地 skills/ 下的技能以软连接方式挂到各 Agent 的用户级 skills 目录
 *   3. unlink：移除由本工具创建的软连接
 *   4. status：查看当前拉取/连接状态
 *   5. agents：列出内置的 Agent 目录预设
 *   6. all   ：依次执行 pull + link
 *
 * 零依赖，仅使用 Node.js 内置模块；在 Windows 上自动使用 junction 目录软链。
 *
 * 用法：
 *   node sync-skills.mjs pull   [--config skills.config.json] [--force] [--dry-run]
 *   node sync-skills.mjs link   [技能...] [--agents claude,pi] [--target DIR]... [--skills a,b] [--force] [--dry-run]
 *   node sync-skills.mjs unlink [技能...] [--agents claude,pi] [--target DIR]... [--skills a,b] [--dry-run]
 *   node sync-skills.mjs status [技能...] [--agents claude,pi] [--target DIR]... [--skills a,b]
 *   node sync-skills.mjs agents
 *   node sync-skills.mjs all    [--agents claude,pi] [--target DIR]... [--force]
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IS_WINDOWS = process.platform === 'win32';
const LINK_TYPE = IS_WINDOWS ? 'junction' : 'dir';

// ---------- Agent 预设（全部为用户级目录，跨项目生效）----------
const AGENT_PRESETS = {
  claude:   '~/.claude/skills',
  codex:    '~/.codex/skills',
  pi:       '~/.pi/agent/skills',
  agents:   '~/.agents/skills',          // 通用 Agent Skills 约定
  opencode: '~/.config/opencode/skill',
  cursor:   '~/.cursor/skills',
  gemini:   '~/.gemini/skills',
  windsurf: '~/.codeium/windsurf/skills',
  copilot:  '~/.copilot/skills',
};

// ---------- 输出辅助 ----------
const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', cyan: '\x1b[36m',
};
const log = (m) => console.log(m);
const info = (m) => console.log(`${C.cyan}ℹ${C.reset} ${m}`);
const ok = (m) => console.log(`${C.green}✔${C.reset} ${m}`);
const warn = (m) => console.log(`${C.yellow}⚠${C.reset} ${m}`);
const fail = (m) => console.error(`${C.red}✖${C.reset} ${m}`);

// ---------- 通用工具 ----------
function expandTilde(p) {
  if (!p) return p;
  if (p === '~') return os.homedir();
  if (p.startsWith('~/') || p.startsWith('~\\')) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}

function resolvePath(p, base = process.cwd()) {
  return path.resolve(base, expandTilde(p));
}

const uniq = (arr) => [...new Set(arr)];

/** 把逗号分隔字符串 / 数组 / 单值统一成数组 */
function toList(v) {
  if (v == null || v === false) return [];
  const raw = Array.isArray(v) ? v : [v];
  return raw
    .flatMap((x) => (typeof x === 'string' ? x.split(',') : [x]))
    .map((s) => String(s).trim())
    .filter(Boolean);
}

function git(args, cwd) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function ensureGit() {
  try { git(['--version']); }
  catch { fail('未找到 git，请先安装 Git 并加入 PATH。'); process.exit(1); }
}

// ---------- 参数解析（重复的 flag 会累积成数组）----------
function parseArgs(argv) {
  const opts = { _: [] };
  const assign = (k, v) => {
    if (opts[k] === undefined) opts[k] = v;
    else if (Array.isArray(opts[k])) opts[k].push(v);
    else opts[k] = [opts[k], v];
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') { opts._.push(...argv.slice(i + 1)); break; }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq !== -1) assign(a.slice(2, eq), a.slice(eq + 1));
      else {
        const next = argv[i + 1];
        if (next && !next.startsWith('--')) { assign(a.slice(2), next); i++; }
        else assign(a.slice(2), true);
      }
    } else if (a.startsWith('-') && a.length > 1 && !/^\d/.test(a)) {
      for (const ch of a.slice(1)) assign(ch, true);
    } else {
      opts._.push(a);
    }
  }
  return opts;
}

// ---------- 配置加载 ----------
const DEFAULT_CONFIG = 'skills.config.json';

function loadConfig(configPath) {
  const file = resolvePath(configPath, __dirname);
  if (!fs.existsSync(file)) {
    fail(`找不到配置文件：${file}`);
    process.exit(1);
  }
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    fail(`配置文件解析失败：${file}\n${e.message}`);
    process.exit(1);
  }
  cfg.__file = file;
  cfg.__dir = path.dirname(file);
  cfg.sources = (cfg.sources || []).filter((s) => s.enabled !== false);
  cfg.links = cfg.links || [];
  return cfg;
}

// ---------- pull ----------
/** 递归查找目录下所有含 SKILL.md 的技能目录（返回绝对路径，遇到技能即不再下钻） */
function findSkillDirs(absRoot) {
  const out = [];
  const walk = (dir) => {
    if (fs.existsSync(path.join(dir, 'SKILL.md'))) { out.push(dir); return; }
    let items;
    try { items = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const it of items) {
      if (!it.isDirectory()) continue;
      if (it.name === '.git' || it.name.startsWith('.')) continue;
      walk(path.join(dir, it.name));
    }
  };
  walk(absRoot);
  return out;
}

function pullSource(src, cfg, opts) {
  const label = src.name || src.repo;
  const destBase = resolvePath(src.dest || cfg.skillsDir || 'skills', cfg.__dir);
  const tmpBase = path.join(cfg.__dir, '.skills-cache');

  if (!src.repo) { warn(`[${label}] 缺少 repo，跳过`); return; }

  // paths 支持 "a/b/c" 或 { path: "a/b/c", as: "custom-name" }
  const entries = (src.paths || [])
    .map((p) => (typeof p === 'string'
      ? { path: p.replace(/\\/g, '/'), as: path.basename(p.replace(/\\/g, '/')) }
      : { path: String(p.path || '').replace(/\\/g, '/'), as: p.as || path.basename(String(p.path || '').replace(/\\/g, '/')) }))
    .filter((e) => e.path);
  if (!entries.length) { warn(`[${label}] 未配置 paths，跳过`); return; }

  const filter = uniq([...toList(opts.skills ?? opts.skill), ...opts._.slice(1)]);

  const safeName = label.replace(/[^\w.-]/g, '_');
  const workDir = path.join(tmpBase, safeName);

  if (opts['dry-run']) {
    info(`[${label}] (dry-run) 将从 ${src.repo}@${src.ref || 'HEAD'} 拉取：`);
    const cacheReady = fs.existsSync(workDir);
    for (const e of entries) {
      const srcPath = path.join(workDir, e.path);
      if (cacheReady && fs.existsSync(srcPath) && !fs.existsSync(path.join(srcPath, 'SKILL.md'))) {
        const found = findSkillDirs(srcPath);
        log(`    ${e.path}/  (目录，展开 ${found.length} 个技能)`);
        for (const dir of found) {
          const name = path.basename(dir);
          log(`      ${path.relative(workDir, dir).replace(/\\/g, '/')}  ->  ${path.join(destBase, name)}`);
        }
      } else {
        log(`    ${e.path}  ->  ${path.join(destBase, e.as || path.basename(e.path))}`);
      }
    }
    if (filter.length) log(`    (仅限: ${filter.join(', ')})`);
    return;
  }

  ensureGit();
  fs.mkdirSync(tmpBase, { recursive: true });
  if (!fs.existsSync(path.join(workDir, '.git'))) {
    fs.rmSync(workDir, { recursive: true, force: true });
    info(`[${label}] 克隆 ${src.repo} ...`);
    try {
      git(['clone', '--depth', '1', '--filter=blob:none', '--no-checkout', src.repo, workDir]);
    } catch {
      try {
        fs.rmSync(workDir, { recursive: true, force: true });
        git(['clone', '--depth', '1', '--no-checkout', src.repo, workDir]);
      } catch (e2) {
        fail(`[${label}] 克隆失败：${(e2.stderr || e2.message || '').trim()}`);
        return;
      }
    }
  }

  const ref = src.ref || 'HEAD';
  try { git(['-C', workDir, 'fetch', '--depth', '1', 'origin', ref]); } catch { /* ignore */ }
  let checkoutRef = ref;
  try {
    git(['-C', workDir, 'rev-parse', '--verify', '--quiet', `origin/${ref}`]);
    checkoutRef = `origin/${ref}`;
  } catch { /* 用原 ref */ }
  try {
    git(['-C', workDir, 'checkout', '-f', checkoutRef, '--', '.']);
  } catch {
    try { git(['-C', workDir, 'checkout', '-f', checkoutRef]); }
    catch (e2) {
      fail(`[${label}] 检出 ${ref} 失败：${(e2.stderr || e2.message || '').trim()}`);
      return;
    }
  }

  fs.mkdirSync(destBase, { recursive: true });

  // 解析每个 entry：本身是技能目录 -> 直接；是父目录 -> 自动发现其下所有技能
  const tasks = [];
  for (const e of entries) {
    const srcPath = path.join(workDir, e.path);
    if (!fs.existsSync(srcPath)) {
      warn(`[${label}] 仓库中不存在路径：${e.path}（跳过）`);
      continue;
    }
    if (fs.existsSync(path.join(srcPath, 'SKILL.md'))) {
      // 单个技能目录
      tasks.push({ from: srcPath, name: e.as || path.basename(e.path), fromLabel: e.path });
    } else {
      // 父目录：自动发现其下所有技能
      const found = findSkillDirs(srcPath);
      if (!found.length) {
        warn(`[${label}] 目录下没有找到技能（含 SKILL.md）：${e.path}（跳过）`);
        continue;
      }
      info(`[${label}] ${e.path} 为目录，发现 ${found.length} 个技能`);
      for (const dir of found) {
        tasks.push({
          from: dir,
          name: path.basename(dir),
          fromLabel: path.relative(workDir, dir).replace(/\\/g, '/'),
        });
      }
    }
  }

  // 技能过滤：--skills / 位置参数；未指定时全部同步
  const selected = filter.length ? tasks.filter((t) => filter.includes(t.name)) : tasks;
  if (filter.length) {
    const names = tasks.map((t) => t.name);
    for (const f of filter) if (!names.includes(f)) warn(`[${label}] 未找到技能：${f}`);
  }

  let pulled = 0;
  for (const t of selected) {
    const destPath = path.join(destBase, t.name);
    removeExisting(destPath, destPath, { force: true, quiet: true });
    fs.cpSync(t.from, destPath, {
      recursive: true,
      dereference: true,
      force: true,
      filter: (s) => !s.includes(`${path.sep}.git${path.sep}`) && path.basename(s) !== '.git',
    });
    ok(`[${label}] ${t.fromLabel} -> ${path.relative(cfg.__dir, destPath)}`);
    pulled++;
  }
  if (pulled === 0) warn(`[${label}] 没有拉取到任何技能`);
  else ok(`[${label}] 完成，共 ${pulled} 个技能`);
}

// ---------- 链接 / 目标解析 ----------
function isSymlink(p) {
  try { return fs.lstatSync(p).isSymbolicLink(); } catch { return false; }
}

function isManagedLink(p, localRoot) {
  let st;
  try { st = fs.lstatSync(p); } catch { return false; }
  if (!st.isSymbolicLink()) return false;
  try {
    const real = path.resolve(fs.realpathSync(p));
    return real.startsWith(path.resolve(localRoot));
  } catch {
    return true; // 失效链接，视为可清理
  }
}

function removeExisting(target, localRoot, opts = {}) {
  const { force = false, quiet = false } = opts;
  if (!fs.existsSync(target) && !isSymlink(target)) return false;
  if (isSymlink(target) || isManagedLink(target, localRoot) || force) {
    fs.rmSync(target, { recursive: true, force: true });
    if (!quiet) info(`已移除旧链接：${target}`);
    return true;
  }
  if (!quiet) warn(`目标已存在且不是本工具管理的链接，跳过：${target}`);
  return false;
}

function makeLink(target, linkPath) {
  fs.mkdirSync(path.dirname(linkPath), { recursive: true });
  fs.symlinkSync(path.resolve(target), path.resolve(linkPath), LINK_TYPE);
}

/** 列出本地技能（含 SKILL.md 的目录） */
function listLocalSkills(localRoot) {
  if (!fs.existsSync(localRoot)) return [];
  return fs.readdirSync(localRoot, { withFileTypes: true })
    .filter((d) => (d.isDirectory() || d.isSymbolicLink()) && !d.name.startsWith('.'))
    .map((d) => d.name)
    .filter((name) => fs.existsSync(path.join(localRoot, name, 'SKILL.md')))
    .sort();
}

/** 把 agent 名 / 路径 统一解析为绝对目标目录 */
function resolveAgentTargets(names, cfg) {
  const out = [];
  for (const n of names) {
    if (AGENT_PRESETS[n]) out.push(resolvePath(AGENT_PRESETS[n], cfg.__dir));
    else if (n.includes('/') || n.includes('\\') || n.startsWith('~') || n.startsWith('.')) {
      out.push(resolvePath(n, cfg.__dir)); // 允许直接写路径
    } else {
      warn(`未知 Agent 预设：${n}（可用：${Object.keys(AGENT_PRESETS).join(', ')}）`);
    }
  }
  return out;
}

/**
 * 构建链接任务列表。优先级：
 *   1) CLI 指定了 --agents / --target，则用 CLI 的目标与技能；
 *   2) 否则使用配置里的 links[]。
 * CLI 未指定技能时，默认取本地全部技能（有 SKILL.md 的目录）。
 */
function buildJobs(cfg, opts) {
  const localRoot = resolvePath(cfg.skillsDir || 'skills', cfg.__dir);
  const cliAgents = toList(opts.agents ?? opts.agent);
  const cliTargets = toList(opts.target ?? opts.targets);
  const cliSkills = uniq([
    ...toList(opts.skills ?? opts.skill),
    ...opts._.slice(1), // 位置参数：技能名
  ]);
  const fromCli = cliAgents.length > 0 || cliTargets.length > 0 || cliSkills.length > 0;

  const jobs = [];
  const pushJob = (skill, targetRoot) => {
    jobs.push({
      skill,
      targetRoot,
      src: path.join(localRoot, skill),
      dest: path.join(targetRoot, skill),
    });
  };

  if (fromCli) {
    const targets = uniq([
      ...resolveAgentTargets(cliAgents, cfg),
      ...cliTargets.map((t) => resolvePath(t, cfg.__dir)),
    ]);
    if (!targets.length) { fail('未解析到任何目标目录，请用 --agents 或 --target 指定。'); return { localRoot, jobs: [] }; }
    const skills = cliSkills.length ? cliSkills : listLocalSkills(localRoot);
    if (!skills.length) warn('本地没有可用技能（skillsDir 下未找到含 SKILL.md 的目录）。');
    for (const t of targets) for (const s of skills) pushJob(s, t);
    return { localRoot, jobs };
  }

  // 走配置
  for (const entry of cfg.links) {
    const skills = uniq(toList(entry.skills));
    const targets = uniq([
      ...resolveAgentTargets(toList(entry.agents), cfg),
      ...toList(entry.targets).map((t) => resolvePath(t, cfg.__dir)),
    ]);
    if (!targets.length) { warn('links 条目缺少 targets/agents，跳过'); continue; }
    for (const t of targets) for (const s of skills) pushJob(s, t);
  }
  return { localRoot, jobs };
}

// ---------- link ----------
function doLink(cfg, opts) {
  const { localRoot, jobs } = buildJobs(cfg, opts);
  if (!fs.existsSync(localRoot)) { fail(`本地技能目录不存在：${localRoot}`); process.exit(1); }
  if (!jobs.length) { warn('没有需要链接的任务。'); return; }

  let created = 0, skipped = 0, failed = 0;
  for (const { skill, src, dest, targetRoot } of jobs) {
    if (!fs.existsSync(src)) { warn(`本地技能不存在：${skill}（跳过 -> ${targetRoot}）`); skipped++; continue; }

    if (isSymlink(dest)) {
      let real = '';
      try { real = fs.realpathSync(dest); } catch { /* dangling */ }
      if (path.resolve(real) === path.resolve(src)) { skipped++; continue; }
    }

    if (opts['dry-run']) {
      log(`${C.dim}[dry-run]${C.reset} ${dest} -> ${src}`);
      created++;
      continue;
    }
    try {
      if (fs.existsSync(dest) || isSymlink(dest)) {
        if (!removeExisting(dest, localRoot, { force: !!opts.force })) { skipped++; continue; }
      }
      makeLink(src, dest);
      ok(`链接：${dest} -> ${src}`);
      created++;
    } catch (e) {
      fail(`创建链接失败：${dest}\n    ${e.message}`);
      if (IS_WINDOWS) {
        log(C.dim + '    提示：Windows 上 junction 一般无需权限；若使用 symlink 需开启「开发者模式」或以管理员运行。' + C.reset);
      }
      failed++;
    }
  }
  log('');
  info(`链接完成：新增/更新 ${created}，跳过 ${skipped}，失败 ${failed}`);
  if (failed > 0) process.exitCode = 1;
}

// ---------- unlink ----------
function doUnlink(cfg, opts) {
  const { localRoot, jobs } = buildJobs(cfg, opts);
  let removed = 0, kept = 0;
  for (const { dest } of jobs) {
    if (!isSymlink(dest)) { if (fs.existsSync(dest)) kept++; continue; }
    if (opts['dry-run']) { log(`${C.dim}[dry-run]${C.reset} 删除 ${dest}`); removed++; continue; }
    try {
      fs.rmSync(dest, { recursive: true, force: true });
      ok(`已移除：${dest}`);
      removed++;
    } catch (e) {
      fail(`移除失败：${dest}\n    ${e.message}`);
    }
  }
  log('');
  info(`清理完成：移除 ${removed}，保留（非链接） ${kept}`);
}

// ---------- status ----------
function doStatus(cfg, opts) {
  const localRoot = resolvePath(cfg.skillsDir || 'skills', cfg.__dir);
  log(`${C.bold}配置：${C.reset}${cfg.__file}`);
  log(`${C.bold}本地技能目录：${C.reset}${localRoot}`);
  log('');

  log(`${C.bold}本地技能：${C.reset}`);
  const local = listLocalSkills(localRoot);
  log(local.length ? local.map((n) => `  • ${n}`).join('\n') : '  (无)');
  log('');

  const { jobs } = buildJobs(cfg, opts);
  log(`${C.bold}链接状态：${C.reset}`);
  if (!jobs.length) { log('  (无任务，可用 --agents/--target 指定目标)'); return; }

  const grouped = new Map();
  for (const j of jobs) {
    if (!grouped.has(j.targetRoot)) grouped.set(j.targetRoot, []);
    grouped.get(j.targetRoot).push(j);
  }
  for (const [targetRoot, list] of grouped) {
    log(`  ${C.cyan}${targetRoot}${C.reset}`);
    for (const { skill, dest } of list) {
      if (isSymlink(dest)) {
        let real = '?';
        try { real = fs.realpathSync(dest); } catch { real = '(失效)'; }
        log(`    ${C.green}✔${C.reset} ${skill} -> ${real}`);
      } else if (fs.existsSync(dest)) {
        log(`    ${C.yellow}●${C.reset} ${skill} （真实目录，未链接）`);
      } else {
        log(`    ${C.dim}○${C.reset} ${skill} （未链接）`);
      }
    }
  }
}

// ---------- agents ----------
function doAgents() {
  log(`${C.bold}内置 Agent 用户级目录预设：${C.reset}`);
  for (const [name, p] of Object.entries(AGENT_PRESETS)) {
    const resolved = resolvePath(p);
    const exists = fs.existsSync(resolved);
    log(`  ${C.cyan}${name.padEnd(10)}${C.reset} ${resolved} ${exists ? C.green + '(存在)' + C.reset : C.dim + '(不存在)' + C.reset}`);
  }
  log('');
  info('用法示例：node sync-skills.mjs link --agents claude,pi --skills grill-me');
  info('也可以直接用 --target 指定自定义目录（可多次）。');
}

// ---------- 入口 ----------
function main() {
  const argv = process.argv.slice(2);
  const opts = parseArgs(argv);
  const cmd = opts._[0] || 'all';
  const cfgPath = opts.config || opts.c || DEFAULT_CONFIG;
  const cfg = loadConfig(cfgPath);

  switch (cmd) {
    case 'pull':
      for (const src of cfg.sources) pullSource(src, cfg, opts);
      break;
    case 'link':
      doLink(cfg, opts);
      break;
    case 'unlink':
      doUnlink(cfg, opts);
      break;
    case 'status':
      doStatus(cfg, opts);
      break;
    case 'agents':
      doAgents();
      break;
    case 'all':
      for (const src of cfg.sources) pullSource(src, cfg, opts);
      doLink(cfg, opts);
      break;
    default:
      fail(`未知命令：${cmd}`);
      log('可用命令：pull | link | unlink | status | agents | all');
      process.exit(1);
  }
}

main();
