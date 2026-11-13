// relate→←figma: runs JS sent from the local relay against the open file. The UI iframe does the networking.
// The same file runs as "relate→←figma" (Design, FigJam, Slides) and as "relate→←figma · dev"
// (../plugin-dev, synced by server.js). Dev Mode is read-only: setters throw, the window lives in the Inspect panel.
const SIZE = { width: 300, full: 420, compact: 64 };
const READ_ONLY = figma.editorType === 'dev';
const READ_ONLY_HINT = 'Dev Mode is read-only: reads, exports, getCSSAsync and pluginData work; to edit, switch the file to Design mode (Shift+D) and run "relate→←figma" there.';
figma.showUI(__html__, { width: SIZE.width, height: SIZE.full, title: READ_ONLY ? 'relate→←figma · dev' : 'relate→←figma' });

function writable(what) {
  if (READ_ONLY) throw new Error(`${what} is not available in Dev Mode. ${READ_ONLY_HINT}`);
}

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

function isNode(v) {
  return v && typeof v === 'object' && typeof v.id === 'string' && typeof v.type === 'string' && 'name' in v && 'removed' in v;
}

function serialize(v, depth = 0) {
  if (v == null || typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') return v;
  if (typeof v === 'function' || typeof v === 'symbol') return undefined;
  if (v === figma.mixed) return '<mixed>';
  if (isNode(v)) return { id: v.id, type: v.type, name: v.name };
  if (v instanceof Uint8Array) return { __bytes: v.length };
  if (depth > 24) return '<deep>';
  if (Array.isArray(v)) return v.map((x) => serialize(x, depth + 1));
  const out = {};
  for (const k of Object.keys(v)) out[k] = serialize(v[k], depth + 1);
  return out;
}

const EXT = { PNG: 'png', JPG: 'jpg', SVG: 'svg', PDF: 'pdf' };

// ---------- the page map and the cursor ----------
// The window draws the current page as a map and flies the agent's arrow to whatever a job works on.

function topOf(n) {
  let c = n;
  while (c && c.parent && c.parent.type !== 'PAGE') c = c.parent;
  return c && c.parent && c.parent.type === 'PAGE' ? c : null;
}

function boxOf(n) {
  const b = n.absoluteBoundingBox;
  if (b) return { x: b.x, y: b.y, w: b.width, h: b.height };
  if ('x' in n && 'width' in n) return { x: n.x, y: n.y, w: n.width, h: n.height };
  return null;
}

const MAP_TYPES = new Set(['FRAME', 'SECTION', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE', 'GROUP']);
const MAP_MAX = 400;

function pageMap() {
  const out = [];
  try {
    for (const n of figma.currentPage.children) {
      if (out.length >= MAP_MAX) break;
      if (!MAP_TYPES.has(n.type) || n.visible === false) continue;
      const b = boxOf(n);
      if (!b || b.w < 1 || b.h < 1) continue;
      out.push({ id: n.id, name: n.name, x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) });
    }
  } catch (e) { /* a page that can't be read just has no map */ }
  return out;
}

function selectionBox() {
  try {
    const sel = figma.currentPage.selection;
    if (!sel.length) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const n of sel) {
      const b = boxOf(n);
      if (!b) continue;
      x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h);
    }
    if (!isFinite(x0)) return null;
    const top = topOf(sel[0]);
    return { id: top ? top.id : null, x: Math.round(x0), y: Math.round(y0), w: Math.round(x1 - x0), h: Math.round(y1 - y0) };
  } catch (e) { return null; }
}

// Nodes a job touches, at most one report per TOUCH_MS so the arrow can actually fly between them.
const TOUCH_MS = 350;
let touchJob = null;
let touchAt = 0;
let touchLast = null;
let touchPending = null;
let touchTimer = null;

function touchNode(n) {
  if (!touchJob || !isNode(n) || n.type === 'PAGE' || n.type === 'DOCUMENT' || n.id === touchLast) return;
  const wait = TOUCH_MS - (Date.now() - touchAt);
  if (wait > 0) {
    touchPending = n;
    if (!touchTimer) touchTimer = setTimeout(() => { touchTimer = null; const p = touchPending; touchPending = null; if (p) touchNode(p); }, wait);
    return;
  }
  let top, box;
  try {
    top = topOf(n);
    if (!top || top.parent !== figma.currentPage) return; // the map only shows the current page
    box = boxOf(n);
  } catch (e) { return; }
  if (!box) return;
  touchAt = Date.now();
  touchLast = n.id;
  figma.ui.postMessage({ type: 'touch', id: touchJob, ids: [top.id], names: [top.name], boxes: [{ x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.w), h: Math.round(box.h) }] });
}

function touchAll(v) {
  if (Array.isArray(v)) v.forEach(touchNode);
  else touchNode(v);
  return v;
}

// Jobs get figma as is, except getNodeByIdAsync also tells the cursor where the job went.
// `figma` is frozen in the sandbox, and a Proxy over a frozen object must hand back the exact same
// values ("proxy: inconsistent get"). So the Proxy sits over an empty object and forwards to figma.
function figmaForJob() {
  try {
    return new Proxy({}, {
      get(_, k) {
        if (k === 'getNodeByIdAsync') return async (id) => touchAll(await figma.getNodeByIdAsync(id));
        const v = figma[k];
        return typeof v === 'function' ? v.bind(figma) : v;
      },
      set(_, k, v) { figma[k] = v; return true; },
      has(_, k) { return k in figma; },
    });
  } catch (e) {
    return figma;
  }
}

const h = {
  sel: () => touchAll(figma.currentPage.selection),
  node: async (id) => touchAll(await figma.getNodeByIdAsync(id)),
  find: (query, limit = 50) => touchAll(figma.currentPage.findAll((n) => n.name.toLowerCase().includes(String(query).toLowerCase())).slice(0, limit)),
  tree(node = figma.currentPage, depth = 2) {
    touchNode(node);
    const walk = (n, d) => {
      const s = { id: n.id, type: n.type, name: n.name };
      if ('x' in n && n.type !== 'PAGE') Object.assign(s, { x: Math.round(n.x), y: Math.round(n.y), w: Math.round(n.width), h: Math.round(n.height) });
      if (n.type === 'TEXT') s.text = n.characters.slice(0, 120);
      // dynamic-page makes the sync mainComponent getter throw; tree stays sync, so skip the name then.
      if (n.type === 'INSTANCE') { try { s.instanceOf = n.mainComponent ? n.mainComponent.name : null; } catch (e) { s.instanceOf = '?'; } }
      if ('children' in n) s.children = d > 0 ? n.children.map((c) => walk(c, d - 1)) : n.children.length;
      return s;
    };
    return walk(node, depth);
  },
  // fig.js saves { __file } results to disk; PNG keeps the old { __png } shape.
  async export(node, opts = {}) {
    const target = node || figma.currentPage.selection[0];
    if (!target) throw new Error('h.export: nothing to export (pass a node or select one)');
    touchNode(target);
    const format = String(opts.format || 'PNG').toUpperCase();
    if (!EXT[format]) throw new Error(`h.export: format must be one of ${Object.keys(EXT).join(', ')}`);
    const settings = { format };
    if (format === 'PNG' || format === 'JPG') settings.constraint = { type: 'SCALE', value: opts.scale || 1 };
    const bytes = await target.exportAsync(settings);
    return { __file: figma.base64Encode(bytes), ext: EXT[format], name: target.name };
  },
  async png(node, scale = 1) {
    const f = await h.export(node, { format: 'PNG', scale });
    return { __png: f.__file, name: f.name };
  },
  // Text edits need every font in the node loaded first.
  async fonts(node = figma.currentPage) {
    touchNode(node);
    const texts = node.type === 'TEXT' ? [node] : node.findAllWithCriteria({ types: ['TEXT'] });
    const seen = new Set();
    for (const t of texts) {
      for (const f of t.getRangeAllFontNames(0, t.characters.length)) {
        const key = `${f.family}/${f.style}`;
        if (!seen.has(key)) { seen.add(key); await figma.loadFontAsync(f); }
      }
    }
    return [...seen];
  },
  async page(name) {
    await figma.loadAllPagesAsync();
    const p = figma.root.children.find((x) => x.name === name);
    if (!p) throw new Error(`no page "${name}"`);
    await figma.setCurrentPageAsync(p);
    return p;
  },
  // Dev Mode may refuse to set the selection; zooming to the nodes still shows them.
  focus(nodes) {
    const list = Array.isArray(nodes) ? nodes : [nodes];
    touchAll(list);
    try { figma.currentPage.selection = list; } catch (e) { if (!READ_ONLY) throw e; }
    try { figma.viewport.scrollAndZoomIntoView(list); } catch (e) { if (!READ_ONLY) throw e; }
  },
  // CSS as Figma's Inspect panel shows it ({ property: value }); works in every mode.
  async css(node) {
    const target = node || figma.currentPage.selection[0];
    if (!target) throw new Error('h.css: pass a node or select one');
    touchNode(target);
    return target.getCSSAsync();
  },
  // What a developer sees for a node in Dev Mode: CSS, annotations, dev resources (links).
  async inspect(node) {
    const target = node || figma.currentPage.selection[0];
    if (!target) throw new Error('h.inspect: pass a node or select one');
    touchNode(target);
    const out = { id: target.id, type: target.type, name: target.name, css: await target.getCSSAsync() };
    if ('annotations' in target) out.annotations = target.annotations;
    if (typeof target.getDevResourcesAsync === 'function') {
      try { out.devResources = await target.getDevResourcesAsync(); } catch (e) { out.devResources = null; }
    }
    return out;
  },
  // Image paint from base64 (e.g. ASSETS.name from `fig.js --asset name=file.png`) or raw bytes.
  imageFill(data, scaleMode = 'FILL') {
    writable('h.imageFill');
    const bytes = typeof data === 'string' ? figma.base64Decode(data) : data;
    return { type: 'IMAGE', imageHash: figma.createImage(bytes).hash, scaleMode };
  },
  // Shows a line (and optional 0..1 bar) in the plugin window while a long job runs.
  progress(text, fraction) {
    figma.ui.postMessage({ type: 'progress', text: String(text), fraction: typeof fraction === 'number' ? fraction : null });
  },
  checkpoint(title) {
    writable('h.checkpoint');
    return figma.saveVersionHistoryAsync(title || 'Claude checkpoint');
  },
};

function context() {
  return {
    file: figma.root.name,
    page: figma.currentPage.name,
    selection: figma.currentPage.selection.length,
    editorType: figma.editorType,
    mode: figma.mode,
    readOnly: READ_ONLY,
    user: figma.currentUser ? figma.currentUser.name : null,
    frames: pageMap(),
    selectionBox: selectionBox(),
  };
}

let jobs = 0;

figma.ui.onmessage = async (msg) => {
  if (!msg) return;
  if (msg.type === 'compact') {
    if (READ_ONLY) return;
    figma.ui.resize(SIZE.width, msg.on ? SIZE.compact : SIZE.full);
    figma.clientStorage.setAsync('compact', !!msg.on).catch(() => {});
    return;
  }
  if (msg.type !== 'job') return;
  const started = Date.now();
  figma.ui.postMessage({ type: 'start', id: msg.id, label: msg.label || null });
  touchJob = msg.id; touchAt = 0; touchLast = null;
  try {
    const fn = new AsyncFunction('figma', 'h', msg.code);
    const value = await fn(figmaForJob(), h);
    figma.ui.postMessage({ type: 'result', id: msg.id, ok: true, value: serialize(value), ms: Date.now() - started });
  } catch (e) {
    const failure = { type: 'result', id: msg.id, ok: false, error: String(e && e.message || e), stack: e && e.stack ? String(e.stack).slice(0, 2000) : null, ms: Date.now() - started };
    if (READ_ONLY) failure.hint = READ_ONLY_HINT;
    figma.ui.postMessage(failure);
  }
  touchJob = null; touchPending = null;
  // A plugin that stays open would otherwise fold every job into one giant undo step.
  // Dev Mode changes nothing, so there is nothing to commit.
  if (!READ_ONLY) figma.commitUndo();
  jobs += 1;
  figma.ui.postMessage({ type: 'count', jobs });
};

const sendContext = () => figma.ui.postMessage({ type: 'hello', info: context() });
figma.on('selectionchange', sendContext);
figma.on('currentpagechange', sendContext);
sendContext();

figma.clientStorage.getAsync('compact').then((on) => {
  if (!on || READ_ONLY) return;
  figma.ui.resize(SIZE.width, SIZE.compact);
  figma.ui.postMessage({ type: 'compact', on: true });
}, () => {});
