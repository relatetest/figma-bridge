---
name: {{name}}
description: >-
  {{Что делает скилл, одно предложение по-английски в третьем лице: "Rules for …", "Decides …"}}.
  Use when {{конкретные ситуации: building …, reviewing …, fixing … that looks …}}.
  Triggers on: {{english keywords}}, {{русские слова, которыми команда пишет промпты}}.
license: Proprietary
metadata:
  owner: "{{owner}}"
  version: "0.1.0"
  status: experimental
  category: {{category}}
---

# {{title}}

<!-- template: 2–3 sentences. What job the skill does and what "good" means at Relate. No history, no definitions the agent already knows. Delete every template comment before the PR. -->
{{Who the agent is for this task and what bar the result must hit.}}

## Decide first

<!-- template: the tree the agent walks every single time. Encode the process, not the result. One tree per recurring decision. -->

```
{{Question the agent answers first?}}
├── Yes → {{rule}}
└── No
    ├── {{Next question?}}
    │   └── Yes → {{rule}}
    └── Default → {{rule}}
```

## Rules

<!-- template: strict constraint + the why. Numbers, "always", "never". If a line does not change what the agent does, delete it. -->

1. **{{Rule with a number or an absolute}}.** {{Why: what goes wrong without it, so the agent can extend the logic to cases you did not write down.}}
2. **{{Rule}}.** {{Why.}}

## Examples

<!-- template: a pair for every rule the agent gets wrong by default. Models copy examples better than they follow descriptions. -->

Bad:

```
{{what the agent does without the skill}}
```

Good:

```
{{what Relate does, and the one-line reason}}
```

## Common mistakes

- **{{What the agent does by default}}** → {{what to do instead}}.

## Before you finish

- [ ] {{A check the agent can verify by looking at the result}}

## References

<!-- template: one line per file: what is inside and WHEN to load it. Delete the section if the skill has no references. -->

- [references/{{topic}}.md](references/{{topic}}.md) — load when {{situation}}.
