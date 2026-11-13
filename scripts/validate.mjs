#!/usr/bin/env node
// Checks every skill against docs/guideline.md. Rule codes (N1, D2…) match the
// "Что проверяет валидатор" table in docs/guideline.md, so an error message can be
// looked up there together with its reason.
//
//   node scripts/validate.mjs                 all skills
//   node scripts/validate.mjs relate-foo      one skill
//   node scripts/validate.mjs --strict        warnings fail too

import { existsSync } from 'node:fs';
import path from 'node:path';
import {
  CONFIG, ROOT, SKILLS_DIR, EVALS_DIR, readText, rel, listDirs, walk, isTextFile, fileSize,
  loadSkill, loadSkills, splitFrontmatter, parseFrontmatter,
} from './lib.mjs';

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const only = args.filter((a) => !a.startsWith('--'));

const PORTABLE_KEYS = ['name', 'description', 'license', 'compatibility', 'metadata', 'allowed-tools'];
// Accepted by Claude Code only; claude.ai uploads and the Skills API reject them.
const CLAUDE_CODE_KEYS = [
  'when_to_use', 'argument-hint', 'arguments', 'disable-model-invocation', 'user-invocable',
  'disallowed-tools', 'model', 'effort', 'context', 'agent', 'background', 'paths', 'shell',
];
const FORBIDDEN_KEYS = { hooks: 'hooks inside a skill run on every invocation for the whole session; ship them as a reviewed plugin hook instead (docs/guideline.md §9)' };
const REQUIRED_METADATA = ['owner', 'version', 'status', 'category'];

const HEDGES = [
  /\breasonabl[ey]\b/i, /\bappropriate(ly)?\b/i, /\bas needed\b/i,
  /\bif possible\b/i, /\btry to\b/i, /\btasteful(ly)?\b/i, /\bnice[- ]looking\b/i, /\bas much as possible\b/i,
  /\bconsider (using|adding)\b/i, /\bmight want to\b/i, /\bfeel free\b/i,
  /по возможности/i, /при необходимости/i, /желательно/i, /постарайся|стараться|старайся/i,
  /уместн/i, /по ситуации/i, /можно попробовать/i, /красиво/i,
];

const SECRETS = [
  [/ghp_[A-Za-z0-9]{30,}/, 'GitHub token'],
  [/github_pat_[A-Za-z0-9_]{30,}/, 'GitHub token'],
  [/\bsk-(ant-|proj-)?[A-Za-z0-9_-]{20,}/, 'API key'],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/, 'Slack token'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'AWS key'],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, 'JWT / install token'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key'],
  [/--token[= ]["']?[A-Za-z0-9._-]{20,}/, 'token in a command'],
];

const LOCAL_PATH = /(?:\b[A-Za-z]:[\\/](?:Users|Documents and Settings)[\\/][A-Za-z0-9._-]+[\\/]|\/Users\/[A-Za-z0-9._-]+\/|\/home\/[A-Za-z0-9._-]+\/)/;

let errorCount = 0;
let warnCount = 0;
const report = [];

function checker(scope) {
  const items = [];
  const push = (level, code, msg) => items.push({ level, code, msg });
  report.push({ scope, items });
  return {
    error: (code, msg) => push('error', code, msg),
    warn: (code, msg) => push('warn', code, msg),
    note: (code, msg) => push('note', code, msg),
  };
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

function scanLines(lines, offset, regexes, cb) {
  let inFence = false;
  lines.forEach((line, i) => {
    if (/^\s*```/.test(line)) inFence = !inFence;
    // Words quoted as `code` are being talked about, not used.
    const prose = line.replace(/`[^`]*`/g, '');
    for (const re of regexes) {
      const hit = prose.match(re);
      if (hit) cb(i + offset, hit[0], inFence);
    }
  });
}

function markdownLinks(text) {
  const links = [];
  const re = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let m;
  while ((m = re.exec(text))) links.push({ target: m[1], index: m.index });
  return links;
}

function isExternal(target) {
  return /^(https?:|mailto:|#|\$\{)/.test(target);
}

function validateSkill(skill) {
  const c = checker(`skills/${skill.dirName}`);
  if (!skill.exists) {
    c.error('S1', 'no SKILL.md in this folder');
    return;
  }
  if (skill.splitError) {
    c.error('S2', skill.splitError);
    return;
  }
  for (const p of skill.problems) c.error('S3', `frontmatter ${p}`);

  const d = skill.data;
  const prefix = CONFIG.prefix;

  // --- name -------------------------------------------------------------
  if (!d.name) c.error('N1', 'name is missing');
  else {
    if (d.name !== skill.dirName) c.error('N2', `name "${d.name}" must equal the folder name "${skill.dirName}"`);
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(d.name) || d.name.length > 64) {
      c.error('N3', 'name: lowercase latin letters, digits and single hyphens, up to 64 characters');
    }
    if (!d.name.startsWith(prefix)) c.error('N4', `name must start with "${prefix}"`);
    if (/(^|-)(anthropic|claude)(-|$)/.test(d.name)) c.error('N5', 'name must not contain the reserved words "anthropic" or "claude"');
  }

  // --- description --------------------------------------------------------
  const desc = typeof d.description === 'string' ? d.description : '';
  if (!desc.trim()) c.error('D1', 'description is missing or empty');
  else {
    if (desc.length > 1024) c.error('D2', `description is ${desc.length} characters, the limit is 1024`);
    if (/[<>]/.test(desc)) c.error('D3', 'description must not contain < or > (Claude Code refuses it, the Skills API rejects XML tags)');
    if (!/\buse (it )?when\b/i.test(desc)) c.warn('D4', 'description has no "Use when …" part, so the agent has to guess when to load it');
    if (/^(i|you|we)\b|\b(i can|you can|we can|i will|let me)\b/i.test(desc)) c.warn('D5', 'write the description in the third person ("Builds…", "Reviews…")');
    if (desc.length < 120) c.warn('D6', `description is only ${desc.length} characters; add the situations and trigger words`);
    if (!/[а-яё]/i.test(desc) && CONFIG.requireRussianTriggers) c.warn('D7', 'no Russian trigger words; the team writes prompts in Russian');
  }

  // --- fields -------------------------------------------------------------
  const ccUsed = [];
  for (const key of Object.keys(d)) {
    if (PORTABLE_KEYS.includes(key)) continue;
    if (FORBIDDEN_KEYS[key]) c.error('F2', `"${key}" is not allowed: ${FORBIDDEN_KEYS[key]}`);
    else if (CLAUDE_CODE_KEYS.includes(key)) ccUsed.push(key);
    else c.error('F1', `unknown frontmatter key "${key}" (Claude Code ignores unknown keys silently, so a typo changes behaviour without a warning)`);
  }
  if (ccUsed.length) c.note('F3', `Claude Code-only keys: ${ccUsed.join(', ')} — the skill cannot be uploaded to claude.ai as is`);
  if (d.model || d.effort) c.warn('F3', 'model/effort are pinned; model ids change, so the skill will silently fall back or fail later');
  if (d['disable-model-invocation'] !== undefined && typeof d['disable-model-invocation'] !== 'boolean') {
    c.error('F1', 'disable-model-invocation must be true or false');
  }
  if (d.compatibility && String(d.compatibility).length > 500) c.error('F4', 'compatibility is longer than 500 characters');
  if (d['allowed-tools'] !== undefined && typeof d['allowed-tools'] !== 'string') {
    c.error('F9', 'allowed-tools must be one space-separated string ("Read Grep Bash(git:*)"), not a list; gh skill and the spec reject lists');
  }
  if (d['disable-model-invocation'] === true) {
    const openai = path.join(skill.dir, 'agents', 'openai.yaml');
    const ok = existsSync(openai) && /allow_implicit_invocation:\s*false/.test(readText(openai));
    if (!ok) c.warn('F10', 'manual-only skill: add agents/openai.yaml with "policy: allow_implicit_invocation: false", or Codex will still load it on its own');
  }

  const meta = d.metadata;
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
    c.error('F5', `metadata is missing; required keys: ${REQUIRED_METADATA.join(', ')}`);
  } else {
    for (const k of REQUIRED_METADATA) if (!meta[k]) c.error('F5', `metadata.${k} is missing`);
    for (const [k, v] of Object.entries(meta)) if (typeof v !== 'string') c.error('F7', `metadata.${k} must be a string`);
    for (const k of skill.numericPlain || []) if (k.startsWith('metadata.')) c.error('F6', `${k} looks like a number; quote it ("1.0.0") — YAML parsers turn it into a float`);
    if (meta.owner && !/^@[A-Za-z0-9-]+(\/[A-Za-z0-9-]+)?$/.test(meta.owner)) c.error('F5', 'metadata.owner must be a GitHub handle like "@login" or "@org/team"');
    if (meta.version && !/^\d+\.\d+\.\d+$/.test(meta.version)) c.error('F5', 'metadata.version must be semver like "1.2.0"');
    if (meta.status && !CONFIG.statuses.includes(meta.status)) c.error('F5', `metadata.status must be one of: ${CONFIG.statuses.join(', ')}`);
    if (meta.category && !(meta.category in CONFIG.categories)) c.error('F5', `metadata.category must be one of: ${Object.keys(CONFIG.categories).join(', ')}`);
    if (meta.status === 'deprecated' && !meta['replaced-by']) c.warn('F8', 'deprecated skill: add metadata.replaced-by so people know where to go');
  }

  // --- body ---------------------------------------------------------------
  const bodyLines = skill.body.split('\n');
  const nonEmpty = bodyLines.filter((l) => l.trim()).length;
  const total = skill.text.split('\n').length;
  if (nonEmpty < 5) c.error('B8', 'the body is almost empty');
  if (total > CONFIG.limits.skillMdMaxLines) c.error('B1', `SKILL.md has ${total} lines, the limit is ${CONFIG.limits.skillMdMaxLines}; move details into references/`);
  else if (total > CONFIG.limits.skillMdWarnLines) c.warn('B1', `SKILL.md has ${total} lines; above ${CONFIG.limits.skillMdWarnLines} consider moving details into references/`);
  // Claude Code keeps only the first ~5,000 tokens of a skill after compaction (~20 KB).
  const bytes = Buffer.byteLength(skill.text, 'utf8');
  if (bytes > CONFIG.limits.skillMdMaxBytes) c.error('B12', `SKILL.md is ${bytes} bytes; after compaction the agent keeps only ~${CONFIG.limits.skillMdMaxBytes}, the rest is lost`);
  else if (bytes > CONFIG.limits.skillMdWarnBytes) c.warn('B12', `SKILL.md is ${bytes} bytes, close to the ${CONFIG.limits.skillMdMaxBytes}-byte compaction cut`);

  // --- every file in the skill folder ------------------------------------
  const files = walk(skill.dir);
  const linked = new Set();
  // A reference may point at a sibling only if SKILL.md links that sibling directly;
  // otherwise the agent has to follow a chain and often stops at the first file.
  const direct = new Set(
    markdownLinks(skill.text)
      .filter((l) => !isExternal(l.target))
      .map((l) => path.normalize(path.resolve(skill.dir, decodeURI(l.target.split('#')[0])))),
  );
  for (const file of files) {
    const r = rel(file);
    const base = path.basename(file);
    if (/^(\.env.*|.*\.pem|id_rsa.*)$/.test(base)) c.error('X2', `${r}: secrets-like file must not be in a skill`);
    if (/(^|[\\/])(node_modules|__pycache__|\.venv)([\\/]|$)/.test(path.relative(skill.dir, file))) {
      c.error('X2', `${r}: dependency/cache folders must not be committed`);
      continue;
    }
    if (base.toLowerCase() === 'readme.md') c.warn('X1', `${r}: a skill folder is read by agents; put human docs in the catalog, not README.md`);
    if (fileSize(file) > CONFIG.limits.fileWarnBytes) c.warn('X3', `${r} is ${(fileSize(file) / 1048576).toFixed(1)} MB; heavy assets slow every install`);
    if (!isTextFile(file)) continue;

    const text = readText(file);
    const isSkillMd = file === skill.file;
    const lines = text.split('\n');

    for (const [re, label] of SECRETS) {
      const m = text.match(re);
      if (m) c.error('B7', `${r}:${lineOf(text, m.index)} looks like a ${label}; never commit secrets, use an env variable`);
    }
    const lp = text.match(LOCAL_PATH);
    if (lp) c.error('B6', `${r}:${lineOf(text, lp.index)} hardcodes a personal path (${lp[0]}…); use \${CLAUDE_SKILL_DIR} or a path relative to the skill`);

    if (/\.md$/i.test(file)) {
      const ph = text.match(/\{\{[^}]*\}\}|<!--\s*template/i);
      if (ph) c.error('B2', `${r}:${lineOf(text, ph.index)} template placeholder left in the file (${ph[0].slice(0, 30)})`);

      if (isSkillMd || r.includes('/references/')) {
        scanLines(lines, 1, HEDGES, (ln, word, inFence) => {
          if (!inFence) c.warn('B3', `${r}:${ln} hedge word "${word}" — replace with a number, a rule or "always/never"`);
        });
      }

      for (const link of markdownLinks(text)) {
        if (isExternal(link.target)) continue;
        if (link.target.includes('\\')) c.warn('B5', `${r}:${lineOf(text, link.index)} use forward slashes in links`);
        const target = decodeURI(link.target.split('#')[0]);
        const resolved = path.resolve(path.dirname(file), target);
        if (!existsSync(resolved)) c.error('B4', `${r}:${lineOf(text, link.index)} broken link → ${link.target}`);
        else linked.add(path.normalize(resolved));
        if (!isSkillMd && /\.md$/i.test(target) && r.includes('/references/') && resolved.includes(`${path.sep}references${path.sep}`) && !direct.has(path.normalize(resolved))) {
          c.warn('B11', `${r} links to another reference (${link.target}); keep references one level deep from SKILL.md`);
        }
      }
      // Backticked paths count as references too: agents follow `references/x.md` mentions.
      for (const m of text.matchAll(/`((?:references|scripts|assets)\/[^`\s]+)`/g)) {
        const resolved = path.resolve(skill.dir, m[1].replace(/\$\{CLAUDE_SKILL_DIR\}\//, ''));
        if (existsSync(resolved)) linked.add(path.normalize(resolved));
        else if (isSkillMd && !/[*<]/.test(m[1])) c.error('B4', `${r}:${lineOf(text, m.index)} mentions ${m[1]}, which does not exist`);
      }

      if (r.includes('/references/') && lines.length > 100 && !/^##\s+(contents|содержание|оглавление)/im.test(text)) {
        c.warn('B10', `${r} has ${lines.length} lines and no "## Contents" list at the top; the agent may read only part of it`);
      }
    }
  }
  for (const file of files) {
    const inside = path.relative(skill.dir, file).split(path.sep);
    if (['references', 'scripts'].includes(inside[0]) && !linked.has(path.normalize(file))) {
      c.warn('B9', `${rel(file)} is never mentioned in SKILL.md or a reference, so the agent will not find it`);
    }
  }

  validateEvals(skill, c);
}

function validateEvals(skill, c) {
  const name = skill.dirName;
  const dir = path.join(EVALS_DIR, name);
  const manual = skill.data && skill.data['disable-model-invocation'] === true;
  if (!existsSync(dir)) {
    c.error('E1', `no eval suite: ${rel(dir)}/ (run "npm run new -- ${name} --evals-only" to create one)`);
    return;
  }
  const cases = walk(dir).filter((f) => path.basename(f) === 'prompt.md');
  if (cases.length < CONFIG.limits.minEvalCases) {
    c.error('E1', `${rel(dir)} has ${cases.length} case(s), at least ${CONFIG.limits.minEvalCases} are required`);
  }
  let positive = false;
  let negative = false;
  for (const prompt of cases) {
    const caseDir = path.dirname(prompt);
    const text = readText(prompt);
    const ph = text.match(/\{\{[^}]*\}\}|<!--\s*template/i);
    if (ph) c.error('E4', `${rel(prompt)} still has a template placeholder`);
    const graders = walk(path.join(caseDir, 'graders')).filter((f) => f.endsWith('.md'));
    if (graders.length === 0) c.error('E2', `${rel(caseDir)} has no graders/ — the case will not load`);
    for (const g of graders) {
      const gt = readText(g);
      const split = splitFrontmatter(gt);
      if (split.error) {
        c.error('E2', `${rel(g)}: ${split.error}`);
        continue;
      }
      const ph2 = gt.match(/\{\{[^}]*\}\}/);
      if (ph2) c.error('E4', `${rel(g)} still has a template placeholder`);
      const { data } = parseFrontmatter(split.yamlLines);
      if (data.type === 'tool_used' && data.tool === 'Skill') {
        const im = String(data.input_match || '');
        if (!im.includes(name)) c.error('E3', `${rel(g)}: input_match must name the skill "${name}"`);
        const max = data.max === undefined ? undefined : String(data.max);
        if (max === '0') negative = true;
        else positive = true;
      }
    }
  }
  if (!manual && !positive) c.error('E3', `no case checks that the agent loads ${name} on its own (tool_used: Skill grader)`);
  if (!negative) c.error('E3', `no near-miss case checks that ${name} stays quiet (tool_used: Skill with min: 0, max: 0)`);
}

function validateRepo(skills) {
  const c = checker('repo');
  const names = new Set(skills.map((s) => s.dirName));
  for (const dir of listDirs(EVALS_DIR)) {
    if (dir === 'results' || dir === 'mocks') continue;
    if (!names.has(dir)) c.error('E5', `evals/${dir}/ has no matching skill in ${CONFIG.skillsDir}/`);
  }
  if (!existsSync(path.join(ROOT, '.gitignore')) || !readText(path.join(ROOT, '.gitignore')).includes('evals/results')) {
    c.warn('G2', '.gitignore should contain evals/results/');
  }
}

// ---------------------------------------------------------------------------

const skills = only.length ? only.map(loadSkill) : loadSkills();
if (skills.length === 0) {
  console.log(`No skills in ${CONFIG.skillsDir}/ yet.`);
}
for (const s of skills) validateSkill(s);
if (!only.length) validateRepo(skills);

const icon = { error: '✗', warn: '!', note: '·' };
for (const { scope, items } of report) {
  if (items.length === 0) {
    console.log(`✓ ${scope}`);
    continue;
  }
  const errs = items.filter((i) => i.level === 'error').length;
  console.log(`${errs ? '✗' : '!'} ${scope}`);
  for (const it of items) {
    if (it.level === 'error') errorCount++;
    if (it.level === 'warn') warnCount++;
    console.log(`    ${icon[it.level]} ${it.code} ${it.msg}`);
  }
}
console.log(`\n${skills.length} skill(s), ${errorCount} error(s), ${warnCount} warning(s)`);
if (errorCount || (strict && warnCount)) process.exit(1);
