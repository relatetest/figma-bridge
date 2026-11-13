#!/usr/bin/env node
// Installs the relate→←figma bridge into one fixed folder on this computer and, on request, writes
// the routing rule ("Figma MCP unavailable or the bridge asked for → use the bridge") into a
// project's or an agent's instructions. Node built-ins only; Windows and macOS.
//
//   node install.mjs                   install or update the bridge, print where everything is (JSON)
//   node install.mjs --where           print the same JSON, change nothing
//   node install.mjs --project <dir>   also put the rule into <dir>/AGENTS.md (and CLAUDE.md)
//   node install.mjs --global          also put the rule into ~/.claude/CLAUDE.md and ~/.codex/AGENTS.md
//   node install.mjs --project . --remove   take the rule out again (same for --global)
//   node install.mjs --dry-run         say what would change, write nothing
//
// Why one fixed folder ($RELATE_FIGMA_BRIDGE, else ~/.relate/figma-bridge): Figma remembers the path
// of an imported manifest. A copy inside a versioned plugin cache would break the import on every update.
// Data goes to stdout as JSON, messages for people to stderr in Russian.
// Exit codes: 0 done, 1 failed, 2 usage.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, chmodSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.join(HERE, '..', 'assets', 'bridge');
const SKILL_MD = path.join(HERE, '..', 'SKILL.md');
const HOME = path.resolve(process.env.RELATE_FIGMA_BRIDGE || path.join(os.homedir(), '.relate', 'figma-bridge'));
const START = '<!-- relate-figma-bridge:start -->';
const END = '<!-- relate-figma-bridge:end -->';

const say = (msg) => process.stderr.write(msg + '\n');
function usage(msg) {
  say(`✗ ${msg}\nКоманды: node install.mjs [--where] [--project <папка>] [--global] [--remove] [--dry-run]`);
  process.exit(2);
}

// ---------- arguments ----------
const argv = process.argv.slice(2);
const opts = { where: false, global: false, remove: false, dryRun: false, project: null };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--where') opts.where = true;
  else if (a === '--global') opts.global = true;
  else if (a === '--remove') opts.remove = true;
  else if (a === '--dry-run') opts.dryRun = true;
  else if (a === '--project') {
    opts.project = argv[++i];
    if (!opts.project) usage('--project ждёт путь к папке проекта');
  } else if (a === '--help' || a === '-h') {
    say(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 17).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
    process.exit(0);
  } else usage(`неизвестный флаг ${a}`);
}
if (opts.remove && !opts.project && !opts.global) usage('--remove работает вместе с --project или --global');

// ---------- the bridge files ----------
const skillVersion = (() => {
  try { return (readFileSync(SKILL_MD, 'utf8').match(/version:\s*"([^"]+)"/) || [])[1] || null; } catch { return null; }
})();

function serverCommand(home) {
  const server = path.join(home, 'server.js');
  return process.platform === 'win32' ? `node "${server}"` : `node '${server.replace(/'/g, `'\\''`)}'`;
}

// The plugin window shows the command that starts the server; the iframe cannot know the path.
const patchUi = (html, home) => html.replace(/const COMMAND = .*;/, `const COMMAND = ${JSON.stringify(serverCommand(home))};`);

function walk(dir, base = dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full, base));
    else out.push(path.relative(base, full));
  }
  return out;
}

// For agents without skills (Cursor rules, plain AGENTS.md): the skill body with real paths.
function agentGuide(home) {
  const body = readFileSync(SKILL_MD, 'utf8').replace(/^---[\s\S]*?\n---\n/, '');
  return `<!-- Written by install.mjs from the relate-figma-bridge skill v${skillVersion}. Do not edit: the next install overwrites it. -->\n`
    + body.split('${CLAUDE_SKILL_DIR}/scripts/install.mjs').join(path.join(home, 'install.mjs'));
}

// Every file the home folder must hold, with its exact content.
function plannedFiles(home) {
  const files = new Map();
  for (const rel of walk(ASSETS)) {
    let data = readFileSync(path.join(ASSETS, rel));
    if (rel === path.join('plugin', 'ui.html')) data = Buffer.from(patchUi(data.toString('utf8'), home));
    files.set(rel, data);
  }
  // Dev Mode runs the same code: Figma forbids "dev" and "figjam" in one manifest.
  for (const f of ['code.js', 'ui.html']) files.set(path.join('plugin-dev', f), files.get(path.join('plugin', f)));
  files.set('install.mjs', readFileSync(fileURLToPath(import.meta.url)));
  files.set('AGENTS.md', Buffer.from(agentGuide(home)));
  files.set('VERSION', Buffer.from(`${skillVersion}\n`));
  files.set('Start Bridge.command', Buffer.from('#!/bin/bash\n# macOS: double-click to start the relate→←figma server. Keep the window open while you work.\ncd "$(dirname "$0")" || exit 1\nexport PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"\nnode server.js\nread -r -p "Сервер остановлен. Enter, чтобы закрыть"\n'));
  files.set('Start Bridge.bat', Buffer.from('@echo off\r\nrem Windows: double-click to start the relate-figma server. Keep the window open while you work.\r\nchcp 65001 >nul\r\ncd /d "%~dp0"\r\nnode server.js\r\npause\r\n'));
  return files;
}

function installBridge() {
  // A copy of install.mjs inside the home folder has no assets next to it: it only edits instructions.
  if (!existsSync(ASSETS)) return { changed: [], skipped: true };
  const changed = [];
  for (const [rel, data] of plannedFiles(HOME)) {
    const dst = path.join(HOME, rel);
    const same = existsSync(dst) && readFileSync(dst).equals(data);
    if (same) continue;
    changed.push(rel.split(path.sep).join('/'));
    if (opts.dryRun) continue;
    mkdirSync(path.dirname(dst), { recursive: true });
    writeFileSync(dst, data);
  }
  if (!opts.dryRun && process.platform !== 'win32' && existsSync(path.join(HOME, 'Start Bridge.command'))) {
    chmodSync(path.join(HOME, 'Start Bridge.command'), 0o755);
  }
  return { changed, skipped: false };
}

// ---------- the routing rule ----------
function ruleBlock(where) {
  const folder = where === 'project'
    ? '`$RELATE_FIGMA_BRIDGE`, else `~/.relate/figma-bridge` (Windows: `%USERPROFILE%\\.relate\\figma-bridge`)'
    : `\`${HOME}\``;
  return [
    START,
    '## Figma: the relate→←figma bridge',
    '',
    'For any work inside a Figma file (Design, FigJam, Slides, Dev Mode) pick the route before the first call:',
    '',
    '- The person asks for the bridge, relate→←figma, figma-bridge or fig.js: use the bridge.',
    '- The official Figma MCP (`use_figma`, `get_design_context`, skill `figma-use`) is connected and authenticated: use it.',
    '- That MCP is missing, asks for authentication, or fails: use the bridge. Never stop at "Figma MCP is not connected".',
    '',
    `Bridge: load the skill \`relate-figma-bridge\`; without skills, read \`AGENTS.md\` in the bridge folder ${folder} before the first command. If the folder is missing, tell the person to install it from https://github.com/relatetest/figma-bridge.`,
    END,
  ].join('\n');
}

function upsert(file, block, { create = true } = {}) {
  const exists = existsSync(file);
  const text = exists ? readFileSync(file, 'utf8') : '';
  const re = new RegExp(`\\n*${START}[\\s\\S]*?${END}\\n?`);
  let next;
  if (opts.remove) {
    if (!re.test(text)) return { file, action: 'absent' };
    next = text.replace(re, '\n').replace(/\n{3,}$/, '\n\n').replace(/^\n+/, '');
  } else {
    if (!exists && !create) return { file, action: 'skipped' };
    next = re.test(text) ? text.replace(re, `\n\n${block}\n`) : `${text.replace(/\s*$/, '')}${text.trim() ? '\n\n' : ''}${block}\n`;
    next = next.replace(/^\n+/, '');
  }
  if (next === text) return { file, action: 'unchanged' };
  if (!opts.dryRun) {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, next);
  }
  return { file, action: opts.remove ? 'removed' : exists ? 'updated' : 'created' };
}

function projectRules(dir) {
  const root = path.resolve(dir);
  if (!existsSync(root) || !statSync(root).isDirectory()) usage(`нет такой папки: ${root}`);
  const results = [upsert(path.join(root, 'AGENTS.md'), ruleBlock('project'))];
  // Claude Code reads CLAUDE.md, not AGENTS.md. One that imports @AGENTS.md already sees the rule.
  const claude = [path.join(root, 'CLAUDE.md'), path.join(root, '.claude', 'CLAUDE.md')].find(existsSync);
  if (!claude) {
    if (!opts.remove) {
      const file = path.join(root, 'CLAUDE.md');
      if (!opts.dryRun) writeFileSync(file, '@AGENTS.md\n');
      results.push({ file, action: 'created' });
    }
  } else if (/^@(\.\.\/)?AGENTS\.md\s*$/m.test(readFileSync(claude, 'utf8'))) {
    results.push({ file: claude, action: 'imports AGENTS.md' });
  } else {
    results.push(upsert(claude, ruleBlock('project')));
  }
  return results;
}

function globalRules() {
  const targets = [
    [path.join(os.homedir(), '.claude'), 'CLAUDE.md'],
    [path.join(os.homedir(), '.codex'), 'AGENTS.md'],
  ];
  const found = targets.filter(([dir]) => existsSync(dir));
  if (!found.length) say('Не нашёл ~/.claude и ~/.codex: глобальные инструкции некуда писать.');
  return found.map(([dir, name]) => upsert(path.join(dir, name), ruleBlock('global')));
}

// ---------- run ----------
try {
  const install = opts.where ? { changed: [], skipped: true } : installBridge();
  const instructions = [];
  if (opts.project) instructions.push(...projectRules(opts.project));
  if (opts.global) instructions.push(...globalRules());

  const installed = existsSync(path.join(HOME, 'fig.js'));
  const result = {
    home: HOME,
    installed: installed || (opts.dryRun && !install.skipped),
    version: (() => { try { return readFileSync(path.join(HOME, 'VERSION'), 'utf8').trim(); } catch { return null; } })(),
    fig: path.join(HOME, 'fig.js'),
    server: path.join(HOME, 'server.js'),
    startServer: serverCommand(HOME),
    manifest: path.join(HOME, 'plugin', 'manifest.json'),
    devManifest: path.join(HOME, 'plugin-dev', 'manifest.json'),
    changed: install.changed,
    instructions,
    dryRun: opts.dryRun,
  };
  console.log(JSON.stringify(result, null, 2));

  if (!install.skipped) {
    if (opts.dryRun) say(`Проверка без записи: изменится файлов ${install.changed.length}.`);
    else if (install.changed.length) {
      say(`Мост установлен в ${HOME}.`);
      if (install.changed.includes('plugin/manifest.json')) say(`Один раз в Figma: Plugins → Development → Import plugin from manifest… → ${result.manifest}`);
      if (install.changed.some((f) => f === 'server.js' || f === 'fig.js') && existsSync(path.join(HOME, '.token'))) {
        say('Сервер моста обновился: если он сейчас запущен, перезапусти его.');
      }
      if (install.changed.some((f) => f.startsWith('plugin'))) say('Код плагина обновился: закрой и открой плагин в Figma.');
    } else say(`Мост уже актуален: ${HOME}.`);
  }
  for (const r of instructions) say(`${r.file}: ${r.action}`);
} catch (e) {
  say(`✗ ${e.message}`);
  process.exit(1);
}
