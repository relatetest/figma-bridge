'use strict';
// Local relay between Claude (CLI, via /run) and the "relate→←figma" Figma plugin (via /next + /result).
// Node built-ins only. Listens on 127.0.0.1 so nothing outside this machine can reach it.
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.FIGMA_BRIDGE_PORT || 3055);
// A second bridge on another port must not overwrite the token of the one on 3055.
const TOKEN_FILE = path.join(__dirname, PORT === 3055 ? '.token' : `.token-${PORT}`);
const MAX_BODY = 100 * 1024 * 1024; // a 198 MB job once took the whole server down
// On every start: write this folder's path into the plugin window, so the copy-command button
// starts the right server even after the folder moved (the plugin iframe cannot know the path),
// and copy plugin/ into plugin-dev/: Figma forbids "dev" and "figjam" in one manifest, so Dev Mode
// has its own plugin that runs the same code.
function syncPlugin() {
  const server = path.join(__dirname, 'server.js');
  const command = process.platform === 'win32' ? `node "${server}"` : `node '${server.replace(/'/g, `'\\''`)}'`;
  const ui = path.join(__dirname, 'plugin', 'ui.html');
  const html = fs.readFileSync(ui, 'utf8');
  const next = html.replace(/const COMMAND = .*;/, `const COMMAND = ${JSON.stringify(command)};`);
  if (next !== html) fs.writeFileSync(ui, next);
  for (const f of ['code.js', 'ui.html']) {
    fs.copyFileSync(path.join(__dirname, 'plugin', f), path.join(__dirname, 'plugin-dev', f));
  }
}
try {
  syncPlugin();
} catch (e) {
  console.warn(`could not sync the plugin (${e.message}); the Dev Mode plugin may run old code`);
}
// `node server.js --sync-only` refreshes plugin-dev without touching a running server's token.
if (process.argv.includes('--sync-only')) process.exit(0);

const token = crypto.randomBytes(18).toString('hex');
fs.writeFileSync(TOKEN_FILE, token);

const queue = [];
const waiting = new Map(); // job id → resolve(result)
let pollers = [];
let lastSeen = 0;
let lastClaude = 0;
let pluginInfo = null;

function send(res, status, body, extra = {}) {
  const data = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...extra });
  res.end(data);
}

// The plugin UI iframe has origin "null"; any other origin is a web page and must not drive Figma.
const pluginCors = { 'Access-Control-Allow-Origin': 'null', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
const isPlugin = (req) => req.headers.origin === 'null';

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { req.destroy(); return reject(new Error(`body over ${MAX_BODY / 1048576} MB: split the job or embed fewer assets`)); }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function dispatch() {
  while (queue.length && pollers.length) {
    const job = queue.shift();
    const poller = pollers.shift();
    clearTimeout(poller.timer);
    send(poller.res, 200, job, pluginCors);
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  try {
    if (req.method === 'OPTIONS') return send(res, 204, '', pluginCors);

    // ---- plugin side ----
    if (url.pathname === '/next' && req.method === 'GET') {
      if (!isPlugin(req)) return send(res, 403, { error: 'plugin origin only' });
      lastSeen = Date.now();
      const poller = { res, timer: setTimeout(() => {
        pollers = pollers.filter((p) => p !== poller);
        send(res, 204, '', pluginCors);
      }, 20000) };
      pollers.push(poller);
      req.on('close', () => { pollers = pollers.filter((p) => p !== poller); clearTimeout(poller.timer); });
      return dispatch();
    }
    if (url.pathname === '/ping' && req.method === 'GET') {
      if (!isPlugin(req)) return send(res, 403, { error: 'plugin origin only' });
      return send(res, 200, { claudeMsAgo: lastClaude ? Date.now() - lastClaude : null, queued: queue.length }, pluginCors);
    }
    if (url.pathname === '/result' && req.method === 'POST') {
      if (!isPlugin(req)) return send(res, 403, { error: 'plugin origin only' });
      lastSeen = Date.now();
      const msg = JSON.parse(await readBody(req));
      if (msg.hello) pluginInfo = msg.hello;
      const resolve = waiting.get(msg.id);
      if (resolve) { waiting.delete(msg.id); resolve(msg); }
      if (msg.id) lastClaude = Date.now();
      return send(res, 200, { ok: true }, pluginCors);
    }

    // ---- Claude side (token required: browsers can POST to localhost too) ----
    if (req.headers.authorization !== `Bearer ${token}`) return send(res, 401, { error: 'bad token' });
    lastClaude = Date.now();
    if (url.pathname === '/status') {
      return send(res, 200, { connected: Date.now() - lastSeen < 25000, lastSeenMsAgo: lastSeen ? Date.now() - lastSeen : null, plugin: pluginInfo, queued: queue.length });
    }
    if (url.pathname === '/run' && req.method === 'POST') {
      const code = await readBody(req);
      const timeoutMs = Number(url.searchParams.get('timeout') || 120000);
      const job = { id: crypto.randomUUID(), code, label: (url.searchParams.get('label') || '').slice(0, 80) || null };
      const result = await new Promise((resolve) => {
        waiting.set(job.id, resolve);
        queue.push(job);
        dispatch();
        setTimeout(() => {
          if (!waiting.has(job.id)) return;
          waiting.delete(job.id);
          const i = queue.indexOf(job);
          if (i >= 0) queue.splice(i, 1);
          resolve({ id: job.id, ok: false, error: Date.now() - lastSeen < 25000 ? 'timed out while the plugin was running the job' : 'plugin is not connected: open Plugins → Development → relate→←figma in Figma' });
        }, timeoutMs);
      });
      return send(res, 200, result);
    }
    send(res, 404, { error: 'not found' });
  } catch (e) {
    send(res, 500, { error: String(e && e.message || e) });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`relate→←figma bridge listening on http://localhost:${PORT} (token in ${TOKEN_FILE})`);
});
// The plugin asks for "localhost", which Windows and macOS may resolve to ::1 first.
const server6 = http.createServer((req, res) => server.emit('request', req, res));
server6.on('error', () => { /* no IPv6 loopback: IPv4 alone is fine */ });
server6.listen(PORT, '::1');

process.on('SIGINT', () => { try { fs.unlinkSync(TOKEN_FILE); } catch (e) { /* already gone */ } process.exit(0); });
