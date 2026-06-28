# 🌟 Token Optimization & Agent Guidelines

To minimize token usage and maximize efficiency, follow these rules strictly:

## 1. 📂 Codebase Context & Relationships
* Read [CODEBASE_MAP.md](file:///c:/Users/mande/.gemini/antigravity-ide/scratch/market-pulse/CODEBASE_MAP.md) before searching or performing extensive directory scans. It serves as our static knowledge graph.
* Do not scan entire folders or view files unless specifically required for an active edit. 
* Use `grep_search` with narrow parameters instead of running wide recursive checks.

## 2. 💬 Communication Rules (No Filler)
* **No conversational fluff:** Avoid phrases like "Sure, let me help you with that", "I will now edit this file", or "Done! Let me know if you need anything else".
* Jump straight to tool calls or output summaries.
* Keep explanations under 3 sentences unless explaining complex architectural shifts.

## 3. 📝 Code Modifying & Diff Rules
* **Strictly use partial replacements:** Never output or overwrite entire files when editing. Make surgical replacements using `replace_file_content` or `multi_replace_file_content`.
* Code snippets in conversations should highlight ONLY changed lines. Do not copy unchanged boilerplate code.

---
@AGENTS.md
