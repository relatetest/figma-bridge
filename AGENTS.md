# Working in figma-bridge

This repo is a Claude Code plugin by @Piwqust in the Relate Studio org, also installable with `npx skills`. It reaches the team only through the studio catalog `relatetest/hub`, pinned to a release tag.

It lets an agent work live in the person's open Figma file through the relate→←figma development plugin and a local relay. One skill (`relate-figma-bridge`, loads on its own) carries the bridge in `assets/bridge/` and an installer in `scripts/install.mjs` that copies it to one fixed folder per computer (`$RELATE_FIGMA_BRIDGE`, else `~/.relate/figma-bridge`): Figma remembers the manifest path, so the bridge must never run from a versioned plugin cache.

## Commands

```bash
npm test                     # offline: installer on a temp folder, project rules, server + fig.js with a fake plugin on port 3099
npm run check                # skill validator + generated files
claude plugin validate . --strict
node skills/relate-figma-bridge/scripts/install.mjs --help
```

## Layout

- `skills/relate-figma-bridge/SKILL.md`: the route (official Figma MCP first, bridge when it is missing, unauthenticated, failing, or asked for) and how to drive the bridge.
- `skills/relate-figma-bridge/assets/bridge/`: `server.js` (relay on 127.0.0.1:3055), `fig.js` (agent CLI), `plugin/` (Design, FigJam, Slides), `plugin-dev/manifest.json` (Dev Mode twin; `code.js` and `ui.html` are copied in by the installer and by `server.js`). CommonJS, Node built-ins only.
- `skills/relate-figma-bridge/scripts/install.mjs`: installs or updates the bridge folder, copies the skill to `~/.claude/skills` and `~/.agents/skills` with `--skills`, writes the routing rule with `--project` / `--global`.
- `scripts/quick-install.mjs`: the `bin` of `npx -y --allow-git=root github:relatetest/figma-bridge`, the one public install command; runs `install.mjs --skills --global` plus the person's flags. The README section "Для агента" describes it for agents: keep both in step.
- The repo is public: anyone may run the one-liner. Nothing in it may assume access to the studio org.
- `tests/`: `node:test` suites, no Figma.

## Bridge rules

- **Never drive the person's Figma from a test or a check.** They may be working in it; tests use `FIGMA_BRIDGE_PORT=3099`, a temp `RELATE_FIGMA_BRIDGE` and a fake plugin.
- **Edit the bridge only in `assets/bridge/plugin/`;** `plugin-dev/` gets copies. Figma forbids `dev` and `figjam` in one manifest, which is why there are two plugins.
- **Keep the manifest ids `claude-bridge-local` and `claude-bridge-local-dev`:** a new id makes Figma treat it as a different plugin and everyone re-imports.
- **The plugin reaches only `localhost:3055`; the server listens only on loopback and checks the token or the plugin origin.** Any change to that goes into "Как устроено" in README.md in the same commit.
- **The installer touches AGENTS.md / CLAUDE.md only with `--project` / `--global`,** only between the `relate-figma-bridge:start/end` markers.

## Rules

- **Before creating, editing or reviewing a skill, load `relate-writing-skills`** (from the `relate` plugin in `relatetest/hub`) and follow it. The full guideline is `relatetest/skills/docs/guideline.md`.
- **New skills start from `npm run new -- <name> --type <knowledge|workflow|review> --owner @login --category <category>`.**
- **Never edit generated files by hand:** `.claude-plugin/plugin.json`, `.github/CODEOWNERS`, the catalog between `<!-- catalog:start -->` and `<!-- catalog:end -->` in `README.md`. Run `npm run build`.
- **Finish every change with `npm run check` at 0 errors** and `claude plugin validate . --strict`.
- **Test prompts, notes and sources never go inside `skills/<name>/`.** Cases go to `evals/<name>/`.
- **Keep "Как устроено" in README.md true:** the hub reviewer reads it first. Any new network call, MCP server, hook or `allowed-tools` entry goes there in the same change.
- **No secrets, client data or personal paths** anywhere in the repo.
- **No top-level `bin/` directory:** Claude organization sync rejects such plugins. Executables live in `scripts/` and are referenced as `${CLAUDE_PLUGIN_ROOT}/scripts/<name>`.
- **No runtime downloads or self-updates:** the hub reviews one exact commit; code fetched later bypasses that review.
- **Paid commands need the person's OK:** `claude plugin eval` spends tokens.
- **Releases:** `npm version <major|minor|patch>`, `git push --follow-tags`, GitHub Release with the CHANGELOG section, then the publish form in `relatetest/hub`.
- **Commits:** Conventional Commits, e.g. `feat(relate-sticker-export): add WebM output`. Commit or push only when the person asks.
- **Docs for people are in Russian; skill bodies are in English.** Scripts use Node built-ins only and run on Windows and macOS.
