---
type: llm
---

PASS if the agent runs the bridge installer (`install.mjs`) or `fig.js status`, and, since no Figma is open in the test, asks the person for the exact missing click: import the plugin from the printed manifest path or open Plugins → Development → relate→←figma.
FAIL if the agent stops at "the Figma MCP is not connected", writes its own Figma plugin, opens Figma by itself, or claims the title was changed.
