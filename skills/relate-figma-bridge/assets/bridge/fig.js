'use strict';
// Claude's side of the bridge.
//   node fig.js status
//   node fig.js eval "return h.tree(figma.currentPage, 1)"
//   node fig.js run script.js [--out dir] [--timeout ms] [--label "what this does"] [--asset logo=logo.png ...]
// Code runs as the body of an async function with `figma` and `h` (helpers) in scope; `return` sends data back.
// Any { __png } / { __file } in the result (h.png, h.export) is saved to --out and replaced by its path.
// --asset files arrive as base64 strings in ASSETS.<name>, e.g. h.imageFill(ASSETS.logo).
const fs = require('fs');
const path = require('path');
const http = require('http');

const PORT = Number(process.env.FIGMA_BRIDGE_PORT || 3055);
const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  if (i < 0) return dflt;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const outDir = opt('--out', path.join(__dirname, 'shots'));
const timeout = opt('--timeout', '120000');
const label = opt('--label', null);
const assets = {};
for (let a = opt('--asset', null); a; a = opt('--asset', null)) {
  const eq = a.indexOf('=');
  if (eq < 1) throw new Error(`--asset wants name=path, got "${a}"`);
  assets[a.slice(0, eq)] = fs.readFileSync(a.slice(eq + 1)).toString('base64');
}
const [cmd, arg] = args;

function token() {
  try {
    return fs.readFileSync(path.join(__dirname, PORT === 3055 ? '.token' : `.token-${PORT}`), 'utf8').trim();
  } catch (e) {
    throw new Error(`bridge server is not running: start it with \`node "${path.join(__dirname, 'server.js')}"\``);
  }
}

function request(method, route, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1', port: PORT, method, path: route,
      headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'text/plain; charset=utf-8' },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        try { resolve(JSON.parse(text)); } catch (e) { reject(new Error(`bad response (${res.statusCode}): ${text.slice(0, 200)}`)); }
      });
    });
    req.on('error', (e) => reject(new Error(`cannot reach bridge on :${PORT} (${e.code || e.message})`)));
    if (body != null) req.write(body);
    req.end();
  });
}

let shot = 0;
function savePngs(v, stamp) {
  if (Array.isArray(v)) return v.map((x) => savePngs(x, stamp));
  if (v && typeof v === 'object') {
    const data = typeof v.__png === 'string' ? v.__png : v.__file;
    if (typeof data === 'string') {
      const ext = v.__png ? 'png' : String(v.ext || 'bin');
      fs.mkdirSync(outDir, { recursive: true });
      const safe = String(v.name || 'node').replace(/[^\w.-]+/g, '_').slice(0, 60);
      const file = path.join(outDir, `${stamp}-${++shot}-${safe}.${ext}`);
      fs.writeFileSync(file, Buffer.from(data, 'base64'));
      return { [ext]: file, name: v.name };
    }
    const out = {};
    for (const k of Object.keys(v)) out[k] = savePngs(v[k], stamp);
    return out;
  }
  return v;
}

async function main() {
  if (cmd === 'status') return console.log(JSON.stringify(await request('GET', '/status'), null, 2));
  let code;
  if (cmd === 'eval') code = arg;
  else if (cmd === 'run') code = fs.readFileSync(arg, 'utf8');
  else throw new Error('usage: node fig.js status | eval "<code>" | run <file.js> [--out dir] [--timeout ms] [--label text] [--asset name=path]');
  // Kept on the script's first line so error line numbers stay the same.
  if (Object.keys(assets).length) code = `const ASSETS = ${JSON.stringify(assets)}; ${code}`;
  // The plugin window shows this label while the job runs.
  const shown = label || (cmd === 'run' ? path.basename(arg) : String(arg).replace(/\s+/g, ' ').slice(0, 60));
  const res = await request('POST', `/run?timeout=${Number(timeout)}&label=${encodeURIComponent(shown)}`, code);
  if (res.ok) res.value = savePngs(res.value, Date.now());
  console.log(JSON.stringify(res, null, 2));
  if (!res.ok) process.exitCode = 1;
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; });
