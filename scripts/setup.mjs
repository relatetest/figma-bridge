#!/usr/bin/env node
// Turns a fresh copy of relatetest/template-plugin into your plugin: the repo name becomes the
// plugin name, you become the owner, generated files are rebuilt.
// Runs once by itself in GitHub Actions after "Use this template" (.github/workflows/setup.yml),
// or by hand:
//
//   npm run setup -- --repo relatetest/sticker-export --owner @login

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATE = 'relatetest/template-plugin';

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

const argv = process.argv.slice(2);
const opt = (k) => {
  const i = argv.indexOf(`--${k}`);
  return i === -1 ? undefined : argv[i + 1];
};

function repoFromGit() {
  try {
    const url = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: ROOT, encoding: 'utf8' }).trim();
    const m = url.match(/github\.com[:/]([^/]+\/[^/.]+)(\.git)?$/);
    return m ? m[1] : undefined;
  } catch {
    return undefined;
  }
}

const repo = opt('repo') || process.env.GITHUB_REPOSITORY || repoFromGit();
if (!repo || !/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(repo)) fail('pass --repo relatetest/<name> (could not read it from git)');
if (repo === TEMPLATE) fail('this is the template itself; run setup in a repo created from it');

const name = repo.split('/')[1].toLowerCase();
if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) || name.length > 64) {
  fail(`repo name "${name}" must be lowercase latin letters, digits and single hyphens: rename the repo first`);
}
if (/^(claude|anthropic)-/.test(name)) fail('plugin names must not start with claude- or anthropic-');

let owner = opt('owner') || (process.env.GITHUB_ACTOR ? `@${process.env.GITHUB_ACTOR}` : undefined);
if (owner && !owner.startsWith('@')) owner = `@${owner}`;
if (!owner || !/^@[A-Za-z0-9-]+$/.test(owner)) fail('pass --owner @login');

const configPath = path.join(ROOT, 'relate.config.json');
const config = JSON.parse(readFileSync(configPath, 'utf8'));
if (config.repo !== TEMPLATE) fail(`already set up for ${config.repo}`);
config.repo = repo;
config.maintainers = owner;
config.plugin.name = name;
config.plugin.homepage = `https://github.com/${repo}`;
writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');

const pkgPath = path.join(ROOT, 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
pkg.name = name;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

for (const file of ['README.md', 'AGENTS.md', 'CHANGELOG.md', '.claude/CLAUDE.md']) {
  const full = path.join(ROOT, file);
  if (!existsSync(full)) continue;
  const text = readFileSync(full, 'utf8').replace(/\{\{name\}\}/g, name).replace(/\{\{owner\}\}/g, owner);
  writeFileSync(full, text);
}

execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build.mjs')], { stdio: 'inherit' });

console.log(`
✓ ${repo} is set up: plugin "${name}", owner ${owner}.
Next:
  1. Fill every {{…}} in README.md and the description in relate.config.json (plugin.description).
  2. npm run new -- <skill> --type knowledge --owner ${owner} --category <category>
  3. npm run check, then release and publish: https://github.com/relatetest/hub/blob/main/docs/publishing.md`);
