#!/usr/bin/env node
// One command for anyone, nothing to decide:
//
//   npx -y --allow-git=root github:relatetest/figma-bridge                  bridge + skill for every agent + the rule in their global instructions
//   npx -y --allow-git=root github:relatetest/figma-bridge --project .      the same, plus the rule in this project's AGENTS.md / CLAUDE.md
//   npx -y --allow-git=root github:relatetest/figma-bridge --no-rule        skip the global instructions
//   npx -y --allow-git=root github:relatetest/figma-bridge --dry-run        show what would change
//
// It runs the skill's own installer (skills/relate-figma-bridge/scripts/install.mjs) with
// --skills --global, so the result is the same as when an agent installs the bridge itself.

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INSTALL = path.join(ROOT, 'skills', 'relate-figma-bridge', 'scripts', 'install.mjs');

const major = Number(process.versions.node.split('.')[0]);
if (major < 18) {
  console.error(`✗ Нужен Node.js 18 или новее, сейчас ${process.versions.node}. Поставь LTS с https://nodejs.org и запусти команду снова.`);
  process.exit(1);
}

const args = process.argv.slice(2);
const rule = !args.includes('--no-rule');
const pass = args.filter((a) => a !== '--no-rule');
const r = spawnSync(process.execPath, [INSTALL, '--skills', ...(rule ? ['--global'] : []), ...pass], { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' });
process.stdout.write(r.stdout || '');
if (r.status !== 0) process.exit(r.status ?? 1);

let out = {};
try { out = JSON.parse(r.stdout); } catch { /* the installer already said what went wrong */ }
if (out.dryRun) process.exit(0);

console.error(`
Готово. Осталось два шага:
  1. В настольной Figma, один раз: Plugins → Development → Import plugin from manifest…
     ${out.manifest || 'plugin/manifest.json в папке моста'}
  2. Открой новую сессию агента (Claude Code, Codex, Cursor), чтобы он увидел скилл relate-figma-bridge.
Дальше просто пиши агенту про Figma. Плагин запускай в файле: Plugins → Development → relate→←figma.`);
