---
name: {{name}}
description: >-
  {{Что получает человек в конце, по-английски в третьем лице: "Builds a case-study draft from …"}}.
  Use when {{человек просит …}}. Run it by name: /{{name}} {{что передать}}.
  Triggers on: {{english keywords}}, {{русские слова}}.
disable-model-invocation: true
argument-hint: "{{[что передать]}}"
license: Proprietary
metadata:
  owner: "{{owner}}"
  version: "0.1.0"
  status: experimental
  category: {{category}}
---

# {{title}}

<!-- template: one sentence — what the person holds in their hands when the skill is done. Delete every template comment before the PR. -->
{{Goal.}}

## Input

- `$ARGUMENTS` — {{what the person passes}}. If it is empty, ask for {{what is missing}} in one message and stop.
- {{Files, tools or access the skill needs, and the exact command that proves they are available.}}

## Steps

<!-- template: each step = a verb, the exact how, and a "done when" check. Steps that can fail get a fix-and-retry loop. -->

1. **{{Verb + object}}.** {{How, with exact commands or file names.}} Done when {{check}}.
2. **{{Verb + object}}.** {{How.}} Done when {{check}}.
3. **Check the result.** Run {{validator or checklist}}; fix what fails and run it again until it passes.

Stop and ask the person before {{paid, irreversible or outward-facing actions: sending, publishing, spending tokens}}.

## Output

{{Exact format: file names and where they go, the structure, the short message to the person at the end.}}

## Common mistakes

- **{{What the agent does by default}}** → {{what to do instead}}.

## References

- [references/{{topic}}.md](references/{{topic}}.md) — load at step {{N}}.
