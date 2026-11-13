// Offline tests for the installer and the bridge. No Figma: a fake plugin talks to the server.
//   npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { execFile, spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INSTALL = path.join(ROOT, 'skills', 'relate-figma-bridge', 'scripts', 'install.mjs');
const PORT = '3099';

function tmp(name) {
  return mkdtempSync(path.join(os.tmpdir(), `figma-bridge-${name}-`));
}

function run(file, args, env = {}) {
  return new Promise((resolve) => {
    execFile(process.execPath, [file, ...args], { env: { ...process.env, ...env }, encoding: 'utf8' }, (err, stdout, stderr) => {
      resolve({ code: err ? err.code : 0, stdout, stderr });
    });
  });
}

test('installs the bridge into RELATE_FIGMA_BRIDGE and is idempotent', async (t) => {
  const home = path.join(tmp('home'), 'bridge with space');
  t.after(() => rmSync(path.dirname(home), { recursive: true, force: true }));
  const first = await run(INSTALL, [], { RELATE_FIGMA_BRIDGE: home });
  assert.equal(first.code, 0, first.stderr);
  const out = JSON.parse(first.stdout);
  assert.equal(out.home, home);
  assert.ok(out.changed.includes('plugin/manifest.json'));
  for (const f of ['server.js', 'fig.js', 'install.mjs', 'AGENTS.md', 'package.json', 'plugin-dev/code.js', 'plugin-dev/ui.html', 'Start Bridge.command', 'Start Bridge.bat']) {
    assert.ok(existsSync(path.join(home, f)), `${f} is missing`);
  }
  const ui = readFileSync(path.join(home, 'plugin', 'ui.html'), 'utf8');
  assert.ok(ui.includes(JSON.stringify(out.startServer)), 'the plugin window does not carry the start command');
  assert.equal(ui, readFileSync(path.join(home, 'plugin-dev', 'ui.html'), 'utf8'));
  assert.ok(!readFileSync(path.join(home, 'AGENTS.md'), 'utf8').includes('CLAUDE_SKILL_DIR'), 'AGENTS.md keeps a Claude-only variable');
  assert.ok(readFileSync(path.join(home, 'Start Bridge.bat'), 'utf8').includes('\r\n'), 'the .bat file needs CRLF');

  const second = await run(INSTALL, [], { RELATE_FIGMA_BRIDGE: home });
  assert.deepEqual(JSON.parse(second.stdout).changed, []);

  const where = await run(INSTALL, ['--where'], { RELATE_FIGMA_BRIDGE: home });
  assert.equal(JSON.parse(where.stdout).installed, true);
});

test('--dry-run writes nothing', async (t) => {
  const home = path.join(tmp('dry'), 'bridge');
  t.after(() => rmSync(path.dirname(home), { recursive: true, force: true }));
  const r = await run(INSTALL, ['--dry-run'], { RELATE_FIGMA_BRIDGE: home });
  assert.equal(r.code, 0, r.stderr);
  assert.ok(JSON.parse(r.stdout).changed.length > 5);
  assert.ok(!existsSync(home));
});

test('--project adds, updates in place and removes the rule', async (t) => {
  const home = path.join(tmp('proj-home'), 'bridge');
  const project = tmp('project');
  t.after(() => {
    rmSync(path.dirname(home), { recursive: true, force: true });
    rmSync(project, { recursive: true, force: true });
  });
  writeFileSync(path.join(project, 'AGENTS.md'), '# My project\n\nKeep this line.\n');
  const env = { RELATE_FIGMA_BRIDGE: home };

  const add = await run(INSTALL, ['--project', project], env);
  assert.equal(add.code, 0, add.stderr);
  const agents = readFileSync(path.join(project, 'AGENTS.md'), 'utf8');
  assert.ok(agents.startsWith('# My project\n\nKeep this line.\n\n<!-- relate-figma-bridge:start -->'));
  assert.equal(readFileSync(path.join(project, 'CLAUDE.md'), 'utf8'), '@AGENTS.md\n');

  await run(INSTALL, ['--project', project], env);
  const again = readFileSync(path.join(project, 'AGENTS.md'), 'utf8');
  assert.equal(again, agents, 'a second run must not duplicate or move the block');
  assert.equal(again.split('relate-figma-bridge:start').length, 2);

  const rm = await run(INSTALL, ['--project', project, '--remove'], env);
  assert.equal(rm.code, 0, rm.stderr);
  assert.equal(readFileSync(path.join(project, 'AGENTS.md'), 'utf8'), '# My project\n\nKeep this line.\n');
});

test('--project writes into an existing CLAUDE.md that does not import AGENTS.md', async (t) => {
  const home = path.join(tmp('claude-home'), 'bridge');
  const project = tmp('claude-project');
  t.after(() => {
    rmSync(path.dirname(home), { recursive: true, force: true });
    rmSync(project, { recursive: true, force: true });
  });
  writeFileSync(path.join(project, 'CLAUDE.md'), '# Rules\n');
  await run(INSTALL, ['--project', project], { RELATE_FIGMA_BRIDGE: home });
  assert.ok(readFileSync(path.join(project, 'CLAUDE.md'), 'utf8').includes('relate-figma-bridge:start'));
});

test('the one-liner installs bridge, skills for both agent folders and the global rule', async (t) => {
  const fakeHome = tmp('user');
  t.after(() => rmSync(fakeHome, { recursive: true, force: true }));
  // os.homedir() reads HOME on macOS/Linux and USERPROFILE on Windows; the person's real folders stay untouched.
  const env = { HOME: fakeHome, USERPROFILE: fakeHome, RELATE_FIGMA_BRIDGE: '' };
  const { mkdirSync } = await import('node:fs');
  mkdirSync(path.join(fakeHome, '.claude'));
  mkdirSync(path.join(fakeHome, '.codex'));
  writeFileSync(path.join(fakeHome, '.claude', 'CLAUDE.md'), '# Mine\n');

  const r = await run(path.join(ROOT, 'scripts', 'quick-install.mjs'), [], env);
  assert.equal(r.code, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.home, path.join(fakeHome, '.relate', 'figma-bridge'));
  assert.ok(existsSync(path.join(out.home, 'fig.js')));
  for (const base of [['.claude', 'skills'], ['.agents', 'skills']]) {
    const skill = path.join(fakeHome, ...base, 'relate-figma-bridge');
    assert.ok(existsSync(path.join(skill, 'SKILL.md')), `${skill} has no SKILL.md`);
    assert.ok(existsSync(path.join(skill, 'scripts', 'install.mjs')));
    assert.ok(existsSync(path.join(skill, 'assets', 'bridge', 'server.js')));
  }
  const claude = readFileSync(path.join(fakeHome, '.claude', 'CLAUDE.md'), 'utf8');
  assert.ok(claude.startsWith('# Mine\n') && claude.includes('relate-figma-bridge:start'));
  assert.ok(readFileSync(path.join(fakeHome, '.codex', 'AGENTS.md'), 'utf8').includes('relate-figma-bridge:start'));
  assert.ok(r.stderr.includes('Import plugin from manifest'));

  // A skill copied by the one-liner can install the bridge by itself, as an agent would.
  const copy = path.join(fakeHome, '.agents', 'skills', 'relate-figma-bridge', 'scripts', 'install.mjs');
  const again = await run(copy, [], { ...env, RELATE_FIGMA_BRIDGE: path.join(fakeHome, 'other') });
  assert.equal(again.code, 0, again.stderr);
  assert.ok(existsSync(path.join(fakeHome, 'other', 'server.js')));

  const second = await run(path.join(ROOT, 'scripts', 'quick-install.mjs'), ['--no-rule'], env);
  const s = JSON.parse(second.stdout);
  assert.deepEqual(s.changed, []);
  assert.deepEqual(s.instructions, []);
  assert.ok(s.skills.every((x) => x.action === 'unchanged'));
});

test('bad usage exits with 2', async () => {
  assert.equal((await run(INSTALL, ['--nope'])).code, 2);
  assert.equal((await run(INSTALL, ['--remove'])).code, 2);
});

test('server and fig.js work with a fake plugin; foreign origins get 403', async (t) => {
  const home = path.join(tmp('e2e'), 'bridge');
  await run(INSTALL, [], { RELATE_FIGMA_BRIDGE: home });
  const env = { ...process.env, FIGMA_BRIDGE_PORT: PORT };
  const server = spawn(process.execPath, [path.join(home, 'server.js')], { env });
  t.after(() => {
    server.kill();
    rmSync(path.dirname(home), { recursive: true, force: true });
  });
  await new Promise((resolve, reject) => {
    server.stdout.on('data', (d) => { if (String(d).includes('listening')) resolve(); });
    server.on('exit', (c) => reject(new Error(`server exited with ${c}`)));
  });
  const base = `http://127.0.0.1:${PORT}`;
  const plugin = { Origin: 'null' };
  await fetch(`${base}/result`, { method: 'POST', headers: plugin, body: JSON.stringify({ hello: { file: 'Test file', editorType: 'figma' } }) });

  // The fake plugin takes one job and echoes it back.
  const answered = (async () => {
    const job = await (await fetch(`${base}/next`, { headers: plugin })).json();
    await fetch(`${base}/result`, { method: 'POST', headers: plugin, body: JSON.stringify({ id: job.id, ok: true, value: { code: job.code, label: job.label } }) });
  })();
  await new Promise((r) => setTimeout(r, 100));

  const status = await run(path.join(home, 'fig.js'), ['status'], { FIGMA_BRIDGE_PORT: PORT });
  const s = JSON.parse(status.stdout);
  assert.equal(s.connected, true);
  assert.equal(s.plugin.file, 'Test file');

  const evalRes = await run(path.join(home, 'fig.js'), ['eval', 'return 1 + 1', '--label', 'Проверка'], { FIGMA_BRIDGE_PORT: PORT });
  await answered;
  const e = JSON.parse(evalRes.stdout);
  assert.equal(e.ok, true);
  assert.deepEqual(e.value, { code: 'return 1 + 1', label: 'Проверка' });

  assert.equal((await fetch(`${base}/next`, { headers: { Origin: 'https://example.com' } })).status, 403);
  assert.equal((await fetch(`${base}/status`)).status, 401);
});
