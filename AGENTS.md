# Working in figma-bridge

This repo is a Claude Code plugin by @Piwqust in the Relate Studio org, also installable with `npx skills`. It reaches the team only through the studio catalog `relatetest/hub`, pinned to a release tag.

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
