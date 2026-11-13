---
name: relate-figma-bridge
description: >-
  Drives the person's open Figma file live through the studio's local relate→←figma plugin and bridge
  (fig.js): read, create and edit frames, components, variables, text and images, export PNG, SVG, PDF.
  Use when a task touches a Figma file (Design, FigJam, Slides, Dev Mode) and the official Figma MCP
  (use_figma, figma-use) is missing, asks for authentication or fails, and whenever the person asks for the
  bridge, even if they only say "в фигме". Triggers on: Figma, FigJam, frame, layer, component, export from
  Figma, relate→←figma, figma-bridge, fig.js, фигма, в фигме, фрейм, слой, компонент, макет, борд, через мост.
license: Proprietary
compatibility: Needs Node 18+ and the Figma desktop app with the relate→←figma plugin imported. macOS and Windows.
metadata:
  owner: "@Piwqust"
  version: "0.1.0"
  status: experimental
  category: design
---

# relate→←figma bridge

The bridge lets an agent run Figma Plugin API code inside the file the person has open: a local server (`server.js`, `localhost:3055`), a development plugin in Figma desktop that polls it, and a CLI (`fig.js`). It works without the Figma MCP, on macOS and Windows. Done means the change is in the file and the person sees it (`h.focus`), not that a script ran.

## Decide first

```
Does the task read or change a Figma file?
├── No → this skill does not apply
└── Yes
    ├── The person asks for the bridge, relate→←figma, figma-bridge or fig.js? → bridge
    ├── Official Figma MCP tools (use_figma, get_design_context) connected and authenticated? → use them, stop here
    └── MCP missing, asks for authentication, or a call failed → bridge
```

Never answer "the Figma MCP is not connected" and stop: the bridge exists for exactly that case.

## Step 1: find or install the bridge

Run exactly this (it installs on first use, updates when the skill is newer, changes nothing otherwise):

```
node "${CLAUDE_SKILL_DIR}/scripts/install.mjs"
```

It prints JSON: `home` (the bridge folder, `$RELATE_FIGMA_BRIDGE` or `~/.relate/figma-bridge`), `fig`, `startServer`, `manifest`, `changed`. Use the absolute paths from it in every later command; `~` does not expand for `node` in PowerShell. `--where` prints the same without writing.

If `changed` contains `plugin/manifest.json`, the plugin is new on this computer. Ask the person to import it once: Figma desktop → Plugins → Development → Import plugin from manifest… → the `manifest` path. Development plugins never run in Figma in the browser. Dev Mode needs a second import of `devManifest`.

## Step 2: connect

1. `node "<fig>" status`. If it fails with "bridge server is not running", start `startServer` in the background and run `status` again.
2. `connected: false` means the plugin is closed. Ask the person to open Plugins → Development → relate→←figma in the file (in Dev Mode: relate→←figma · dev, Plugins tab of the Inspect panel). Opening a plugin is a click in their Figma: never do it yourself.
3. Go on only when `status` shows `connected: true` and `plugin` names the file, page, selection count, `editorType`, `readOnly`.

## Step 3: run code

```
node "<fig>" eval "<js>" --label "Что делаю"
node "<fig>" run job.js --label "Строю кадры" [--timeout ms] [--out dir] [--asset logo=/path/logo.png ...]
```

Code is the body of an async function with `figma` and `h` in scope; `return` sends JSON back (nodes become `{id,type,name}`). Exports land in `--out` (default `shots/` in the bridge folder) and come back as file paths: open them to check the result.

Always pass `--label` in the person's language, 2 to 5 words: the plugin window shows it on an arrow that flies to the frame being changed, and in a log of commands. A job without a label shows raw code to the person.

| helper | does |
|---|---|
| `h.sel()` / `h.node(id)` / `h.find(q)` / `h.tree(node, depth)` | read the file |
| `h.page(name)` | switch page (loads it) |
| `h.fonts(node)` | load every font used in a node; call before editing any text |
| `h.focus(nodes)` | select and zoom to nodes so the person sees the result |
| `h.css(node)` / `h.inspect(node)` | Inspect-panel CSS / CSS + annotations + dev resources (selection if no node) |
| `h.png(node, scale)` / `h.export(node, {format: 'PNG'\|'JPG'\|'SVG'\|'PDF', scale})` | export; files are saved to `--out` |
| `h.imageFill(ASSETS.logo, 'FILL')` | image paint from a `--asset` file |
| `h.progress('Кадр 3 из 8', 0.375)` | progress line and bar in the plugin window during long jobs |
| `h.checkpoint('before restyle')` | named version in the file's version history |

## Rules

1. **Read before you write: `h.tree(node, 2)` or `h.sel()` first.** Names and structure in a real file never match a guess, and a wrong id edits the wrong frame.
2. **`h.checkpoint('<what>')` before any job that changes more than 10 nodes or deletes anything.** Jobs are not atomic: a script that throws keeps every change made before the error.
3. **One job per visible step, at most 60 s each.** Each job is its own undo step (Cmd+Z on macOS, Ctrl+Z on Windows) and its own row in the person's log; a 5-minute job freezes Figma and cannot be undone in parts.
4. **After a failed job, read the file again before retrying.** Part of it landed; running it twice duplicates nodes.
5. **Use the async API: `getNodeByIdAsync`, `getMainComponentAsync`, `setCurrentPageAsync`.** The plugin runs with `documentAccess: dynamic-page`; the sync getters throw.
6. **Keep a job, code plus `--asset` files, under 100 MB.** The server rejects bigger bodies.
7. **Return flat lists from big reads.** Objects deeper than 24 levels are cut.
8. **End every change with `h.focus(...)` and an export you look at.** The person reviews in Figma, you review the PNG.

`readOnly: true` in `status` means Dev Mode: reads, `h.tree`, exports, `h.css`, `h.inspect` and `pluginData` work, every edit throws. For edits the person switches the file to Design mode (Shift+D) and opens the regular relate→←figma.

The Plugin API itself is Figma's standard one: https://www.figma.com/plugin-docs/. If the `figma-use` skill is installed, its references are a good API guide; its `use_figma` limits do not apply here: `figma.notify`, `pluginData`, `figma.createImage` and `figma.teamLibrary` all work, and the current page persists between jobs.

## Common mistakes

- **Reporting "Figma MCP unavailable" and stopping** → run Step 1 and use the bridge.
- **Opening Figma, clicking menus or importing the plugin yourself** → ask the person; those are their clicks.
- **Editing text without `h.fonts(node)`** → the job throws "unloaded font" halfway through.
- **One giant job for a whole board** → one job per frame or per step, with `h.progress`.
- **Retrying a failed job as is** → read what landed first.

## Before you finish

- [ ] `status` was `connected: true` for the file the person meant.
- [ ] The changed nodes are focused (`h.focus`) and you looked at an export of them.
- [ ] You told the person what changed and which checkpoint to return to, if any.

## Putting the rule into a project or an agent

The skill loads by its description. To make the route above part of a project's always-on instructions (AGENTS.md, CLAUDE.md), run this when the person asks, from the project root:

```
node "${CLAUDE_SKILL_DIR}/scripts/install.mjs" --project .
```

`--global` writes the same rule into `~/.claude/CLAUDE.md` and `~/.codex/AGENTS.md`; `--remove` takes it out; `--dry-run` shows the plan. The rule sits between `relate-figma-bridge:start/end` markers, so running it again updates it in place.

## Bridge files

`scripts/install.mjs` copies all of them to the bridge folder; never edit the copies there, the next install overwrites them.

- `assets/bridge/server.js`: the relay on `127.0.0.1:3055`; writes a fresh token to `.token` on every start; agent calls need it, the plugin is recognised by its iframe origin.
- `assets/bridge/fig.js`: the CLI above.
- `assets/bridge/plugin/manifest.json`, `assets/bridge/plugin/code.js`, `assets/bridge/plugin/ui.html`: the relate→←figma plugin for Design, FigJam and Slides; network access only to `localhost:3055`.
- `assets/bridge/plugin-dev/manifest.json`: the Dev Mode twin; the installer copies the same `code.js` and `ui.html` next to it.
- `assets/bridge/package.json`: marks the bridge as CommonJS, so it runs inside any project.
