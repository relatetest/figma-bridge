// Shared helpers for validate.mjs, build.mjs and new-skill.mjs.
// Zero dependencies on purpose: a designer must be able to run `node scripts/validate.mjs`
// right after cloning, without npm install.

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const CONFIG = JSON.parse(readFileSync(path.join(ROOT, 'relate.config.json'), 'utf8'));
export const SKILLS_DIR = path.join(ROOT, CONFIG.skillsDir);
export const EVALS_DIR = path.join(ROOT, CONFIG.evalsDir);

export function readText(file) {
  return readFileSync(file, 'utf8').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
}

export function rel(file) {
  return path.relative(ROOT, file).split(path.sep).join('/');
}

export function listDirs(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
    .map((d) => d.name)
    .sort();
}

export function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

export function isTextFile(file) {
  return /\.(md|txt|json|ya?ml|js|mjs|cjs|ts|py|sh|ps1|css|html|svg|toml|csv)$/i.test(file);
}

export function fileSize(file) {
  return statSync(file).size;
}

// ---------------------------------------------------------------------------
// Frontmatter
//
// Real YAML parsers accept far more than agents handle reliably, and they silently
// turn `version: 1.0` into a number or choke on `description: Use when: x`.
// We parse a strict subset and report anything outside it, so the file behaves the
// same in Claude Code, Codex, claude.ai uploads and `npx skills`.
// ---------------------------------------------------------------------------

export function splitFrontmatter(text) {
  const lines = text.split('\n');
  if (lines[0] !== '---') return { error: 'SKILL.md must start with a `---` line (frontmatter)' };
  const end = lines.indexOf('---', 1);
  if (end === -1) return { error: 'frontmatter is not closed with a `---` line' };
  return {
    yamlLines: lines.slice(1, end),
    body: lines.slice(end + 1).join('\n'),
    bodyStartLine: end + 2,
  };
}

function parseScalar(raw, where, problems) {
  const v = raw.trim();
  if (v === '') return '';
  if (v.startsWith('"')) {
    if (!v.endsWith('"') || v.length < 2) {
      problems.push(`${where}: unclosed double quote`);
      return v;
    }
    try {
      return JSON.parse(v);
    } catch {
      problems.push(`${where}: invalid escape inside double quotes`);
      return v.slice(1, -1);
    }
  }
  if (v.startsWith("'")) {
    if (!v.endsWith("'") || v.length < 2) {
      problems.push(`${where}: unclosed single quote`);
      return v;
    }
    return v.slice(1, -1).replace(/''/g, "'");
  }
  if (v.startsWith('[')) {
    if (!v.endsWith(']')) {
      problems.push(`${where}: unclosed [ list`);
      return [];
    }
    return v
      .slice(1, -1)
      .split(',')
      .map((s) => parseScalar(s, where, problems))
      .filter((s) => s !== '');
  }
  if (v === 'true' || v === 'false') return v === 'true';
  if (/:\s/.test(v) || /\s#/.test(v)) {
    problems.push(`${where}: plain value contains ": " or " #" — wrap it in quotes or use ">-"`);
  }
  if (/^[&*!|>%@`{]/.test(v)) {
    problems.push(`${where}: value starts with a YAML special character — wrap it in quotes`);
  }
  return v;
}

function looksNumeric(raw) {
  return /^[-+]?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?$/.test(raw.trim());
}

export function parseFrontmatter(yamlLines) {
  const data = {};
  const problems = [];
  const numericPlain = [];
  let i = 0;

  const indentOf = (s) => s.length - s.trimStart().length;

  while (i < yamlLines.length) {
    const line = yamlLines[i];
    const lineNo = i + 2;
    if (line.trim() === '' || line.trimStart().startsWith('#')) {
      i++;
      continue;
    }
    if (/^\s/.test(line)) {
      problems.push(`line ${lineNo}: unexpected indentation`);
      i++;
      continue;
    }
    const m = line.match(/^([A-Za-z0-9_-]+):(?:\s(.*)|)$/);
    if (!m) {
      problems.push(`line ${lineNo}: expected "key: value"`);
      i++;
      continue;
    }
    const key = m[1];
    const rest = (m[2] ?? '').trim();
    if (key in data) problems.push(`line ${lineNo}: duplicate key "${key}"`);
    i++;

    // Block scalar: > >- | |-
    if (/^[>|][-+]?$/.test(rest)) {
      const folded = rest.startsWith('>');
      const block = [];
      while (i < yamlLines.length && (yamlLines[i].trim() === '' || indentOf(yamlLines[i]) > 0)) {
        block.push(yamlLines[i]);
        i++;
      }
      const minIndent = Math.min(...block.filter((l) => l.trim()).map(indentOf));
      const stripped = block.map((l) => l.slice(Number.isFinite(minIndent) ? minIndent : 0));
      let value;
      if (folded) {
        value = stripped
          .join('\n')
          .split(/\n\s*\n/)
          .map((p) => p.split('\n').map((s) => s.trim()).filter(Boolean).join(' '))
          .join('\n');
      } else {
        value = stripped.join('\n');
      }
      data[key] = value.trim();
      continue;
    }

    // Nested map or block list
    if (rest === '') {
      const children = [];
      while (i < yamlLines.length && (yamlLines[i].trim() === '' || indentOf(yamlLines[i]) > 0)) {
        if (yamlLines[i].trim() !== '') children.push({ text: yamlLines[i], lineNo: i + 2 });
        i++;
      }
      if (children.length === 0) {
        data[key] = '';
      } else if (children[0].text.trim().startsWith('- ')) {
        data[key] = children.map((c) => {
          if (!c.text.trim().startsWith('- ')) {
            problems.push(`line ${c.lineNo}: mixed list and map under "${key}"`);
            return '';
          }
          return parseScalar(c.text.trim().slice(2), `line ${c.lineNo}`, problems);
        });
      } else {
        const map = {};
        for (const c of children) {
          const cm = c.text.trim().match(/^([A-Za-z0-9_.-]+):(?:\s(.*)|)$/);
          if (!cm) {
            problems.push(`line ${c.lineNo}: expected "key: value" inside "${key}" (one level of nesting only)`);
            continue;
          }
          const raw = cm[2] ?? '';
          if (looksNumeric(raw)) numericPlain.push(`${key}.${cm[1]}`);
          map[cm[1]] = parseScalar(raw, `line ${c.lineNo}`, problems);
        }
        data[key] = map;
      }
      continue;
    }

    // Plain scalar, possibly continued on indented lines
    let raw = rest;
    if (!/^["'[]/.test(raw)) {
      while (i < yamlLines.length && yamlLines[i].trim() !== '' && indentOf(yamlLines[i]) > 0) {
        raw += ' ' + yamlLines[i].trim();
        i++;
      }
    }
    if (looksNumeric(raw)) numericPlain.push(key);
    data[key] = parseScalar(raw, `line ${lineNo}`, problems);
  }

  return { data, problems, numericPlain };
}

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

export function loadSkill(dirName) {
  const dir = path.join(SKILLS_DIR, dirName);
  const file = path.join(dir, 'SKILL.md');
  const skill = { dirName, dir, file, exists: existsSync(file) };
  if (!skill.exists) return skill;
  const text = readText(file);
  const split = splitFrontmatter(text);
  if (split.error) return { ...skill, text, splitError: split.error };
  const fm = parseFrontmatter(split.yamlLines);
  return { ...skill, text, ...split, ...fm };
}

export function loadSkills() {
  return listDirs(SKILLS_DIR).map(loadSkill);
}

export function firstSentence(text) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  const m = s.match(/^(.+?[.!?])(\s|$)/);
  return (m ? m[1] : s).trim();
}

export function invocation(data) {
  if (data['disable-model-invocation'] === true) return 'manual';
  if (data['user-invocable'] === false) return 'agent only';
  return 'auto + manual';
}
