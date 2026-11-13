#!/usr/bin/env node
// Creates a skill folder and its eval suite from templates/.
//
//   npm run new -- brand-voice --type knowledge --owner @login --category brand
//   npm run new -- relate-case-study --type workflow --owner @login --category process
//   npm run new -- relate-brand-voice --evals-only      eval suite for an existing skill
//
// Types: knowledge (rules and decision trees, loads on its own),
//        workflow  (steps, run by name), review (verdict + ranked findings).

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { CONFIG, ROOT, SKILLS_DIR, EVALS_DIR, loadSkill } from './lib.mjs';

const TYPES = ['knowledge', 'workflow', 'review'];

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

const argv = process.argv.slice(2);
const opts = {};
const positional = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--evals-only') opts.evalsOnly = true;
  else if (a.startsWith('--')) opts[a.slice(2)] = argv[++i];
  else positional.push(a);
}

let name = (positional[0] || '').trim().toLowerCase();
if (!name) fail('usage: npm run new -- <name> --type knowledge|workflow|review --owner @login --category <category>');
if (!name.startsWith(CONFIG.prefix)) name = CONFIG.prefix + name;
if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) || name.length > 64) {
  fail(`"${name}": lowercase latin letters, digits and single hyphens, up to 64 characters`);
}

const type = opts.type || 'knowledge';
if (!TYPES.includes(type)) fail(`--type must be one of: ${TYPES.join(', ')}`);
if (opts.owner && !/^@[A-Za-z0-9-]+(\/[A-Za-z0-9-]+)?$/.test(opts.owner)) fail('--owner must be a GitHub handle like @login');
if (opts.category && !(opts.category in CONFIG.categories)) {
  fail(`--category must be one of: ${Object.keys(CONFIG.categories).join(', ')}`);
}

const title = name
  .slice(CONFIG.prefix.length)
  .replace(/-/g, ' ')
  .replace(/^./, (c) => c.toUpperCase());

const values = { name, title, plugin: CONFIG.plugin.name };
if (opts.owner) values.owner = opts.owner;
if (opts.category) values.category = opts.category;

function fill(text) {
  return text.replace(/\{\{(name|title|owner|category|plugin)\}\}/g, (m, key) => values[key] ?? m);
}

function copyDir(from, to) {
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(src, dst);
    else writeFileSync(dst, fill(readFileSync(src, 'utf8')));
  }
}

const skillDir = path.join(SKILLS_DIR, name);
const evalDir = path.join(EVALS_DIR, name);
const templates = path.join(ROOT, 'templates');

let manual = type === 'workflow';
if (opts.evalsOnly) {
  const skill = loadSkill(name);
  if (!skill.exists) fail(`skills/${name}/SKILL.md does not exist`);
  manual = skill.data && skill.data['disable-model-invocation'] === true;
} else {
  if (existsSync(skillDir)) fail(`skills/${name}/ already exists`);
  copyDir(path.join(templates, type), skillDir);
  console.log(`  created skills/${name}/ from templates/${type}/`);
}

if (existsSync(evalDir)) {
  console.log(`  evals/${name}/ already exists, left as is`);
} else {
  copyDir(path.join(templates, 'evals', manual ? 'manual' : 'auto'), evalDir);
  console.log(`  created evals/${name}/ (${manual ? 'manual' : 'auto'} skill cases)`);
}

try {
  execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'build.mjs')], { stdio: 'inherit' });
} catch {
  // build prints its own error; the skill folder is still usable
}

console.log(`
Next:
  1. Fill every {{…}} and delete every <!-- template … --> comment in skills/${name}/ and evals/${name}/.
${values.owner ? '' : '     Set metadata.owner to your GitHub handle (@login).\n'}${values.category ? '' : `     Set metadata.category: ${Object.keys(CONFIG.categories).join(' | ')}.\n`}  2. npm run check
  3. Try it: claude --plugin-dir .   then a real request, with and without the skill.
  4. Open a PR (docs/github.md).`);
