---
type: llm
---

PASS if the agent checks the bridge with `fig.js status` (after `install.mjs` when the bridge folder is missing) and, with no plugin connected in the test, tells the person to open relate→←figma in Figma before it can list pages.
FAIL if the agent invents a page list, tries the official Figma MCP instead of the bridge, or asks for a Figma API token.
