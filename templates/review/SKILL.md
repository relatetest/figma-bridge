---
name: {{name}}
description: >-
  {{Что проверяет, по-английски в третьем лице: "Reviews … against Relate's … rules and returns a verdict with ranked findings"}}.
  Use when {{someone asks to check, review or approve …; before handing … to a client}}.
  Triggers on: review, check, audit, {{english keywords}}, проверь, ревью, {{русские слова}}.
license: Proprietary
metadata:
  owner: "{{owner}}"
  version: "0.1.0"
  status: experimental
  category: {{category}}
---

# {{title}}

<!-- template: what is reviewed and against which source of truth (a foundations file, a token set, a checklist). Delete every template comment before the PR. -->
{{Scope and source of truth.}}

The review changes nothing. Report first; fix only when the person asks.

## What to check

<!-- template: lanes in the order of cost of a mistake. Each lane = what to look at + the rule it is judged by. -->

1. **{{Lane}}** — {{what to look at}}. Rule: {{strict rule}}.
2. **{{Lane}}** — {{what to look at}}. Rule: {{strict rule}}.

## Severity

- **Blocker** — {{breaks the brand, the build or the client's trust; must be fixed before it leaves the studio}}.
- **Should fix** — {{visible to a careful client; fix in this round}}.
- **Nit** — {{polish; fix if it costs under a minute}}.

## Output

Start with the verdict, then findings ranked by severity. Every finding names the place, the problem and the fix. Never pad the list: if a lane is clean, say "clean".

```
**{{Ship it | Approve with changes | Blocked}}**

Blockers
- `{{file:line or frame name}}` {{problem}} → {{fix}}.

Should fix
- …

Nits
- …

Clean: {{lanes with no findings}}
Needs a human: {{what only a person can judge, e.g. on a real device or with the client}}
```

## Common mistakes

- **Flagging taste as a rule** → only report what breaks a written rule; mark everything else "Needs a human".
- **{{Mistake}}** → {{what to do instead}}.
