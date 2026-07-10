# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A schema-driven form library built as a better-architected alternative to React JSON Schema Form (RJSF). A schema generates the form automatically; you customize in JSX, not in more schema. **Core is the form-tree IR** (intermediate representation) plus the recursive fold over it — stateless, framework-agnostic, imports nothing. Front-ends (JSON Schema and Zod today) compile *into* the tree; consumers (validation, framework binding, form-state, presentation) fold *over* it as adapters filling capability slots. React binds behavior to any compiled tree through `useFormTree(tree)` (ADR 035). See `README.md` and `ARCHITECTURE.md` for the full model, and `architecture_records/006`–`011` for the decisions behind it. Don't describe this as "five layers" — that framing is superseded.

## Commands

```bash
# Root-level commands (run from repo root)
npm run build          # Build all packages
npm run test           # Test all packages
npm run lint           # ESLint check
npm run lint:fix       # ESLint fix
npm run format         # Prettier format
npm run format:check   # Prettier check
npm run gate           # typecheck + lint + test — the deterministic gate suite

# Package-specific testing
npm test -w packages/core      # Core tests (Vitest, node environment)
npm test -w packages/react     # React tests (Vitest browser mode with Playwright)

# Run single test file
npx vitest packages/core/src/parser/parser.test.ts
npx vitest packages/react/src/useFormTree.test.tsx

# Example app
npm run dev -w examples/basic-react   # Start example app on localhost
```

## Architecture

### Monorepo Structure
- `packages/core` - Headless form-tree IR, zero dependencies, no framework coupling
- `packages/react` - React adapter with hooks, default templates, and the continuation renderer
- `packages/validation-ajv` / `packages/validation-zod` - Validation adapters (maintained packages)
- `examples/basic-react` - Example app demonstrating various usage patterns
- UI/form-lib adapters (Tailwind, RHF, etc.) are reference recipes in `examples/`, not packages (ADR 024)

### Core Layer (`@jsonschema-form/core`)
Core is **stateless** — it only compiles a schema into the form-tree structure. Key exports:
- `jsonSchemaToTree(schema)` → Returns a `GroupNode` tree representing the form structure (the JSON Schema front-end; renamed from `parseSchema` per ADR 006)
- `FieldNode` - Leaf nodes representing inputs (widget, validation rules, parts)
- `GroupNode` - Branch nodes representing nested objects (children, query methods)
- `FieldParts`/`GroupParts` - Framework-agnostic render structure descriptors

Tree traversal: Nodes have `walk(handlers)` for recursive traversal with `field` and `group` handlers. Queries (`getField`, `getAllFields`) use **relative paths** from the calling group.

### React Layer (`@jsonschema-form/react`)
- `useFormTree(tree)` → Binds source-agnostic React behavior to a tree from `jsonSchemaToTree`, `zodToTree`, or another front-end; returns `{ form, SchemaFields, submit, … }` (content only — you own the `<form>` + submit, ADR 013/035)
- `SchemaFields` (batteries-included) / `createRenderer` (the public floor that takes a partial renderer set) / `defaultAdapter` + `diagnosticAdapter` (the two built-in renderer sets you spread over) — ADR 013
- Customization is the recursive continuation primitive (ADR 010), re-entered via stable JSX components (ADR 017): `renderNode(node, { Default, Children })` to hijack a node, `<Default of={node}/>` / `<Children of={node}/>` / `<Default of={node.children.x}/>` to re-enter the engine, `<Default of={node} parts={{…}}/>` to override individual field parts (a part is itself a handle: `<Default of={part}/>`). The callables (`node.Default()`) remain the low-level primitive the components delegate to (ADR 016). Fractal from `<SchemaFields>` down to a single part.

## Issue Tracking

This project uses **bd (beads)** for all issue tracking. Do NOT use markdown TODOs.

```bash
bd ready --json          # Check ready work
bd create "Title" -t feature -p 2 --json   # Create issue
bd update bd-42 --status in_progress --json
bd close bd-42 --reason "Done" --json
```

Always commit `.beads/issues.jsonl` with related code changes.

## Key Design Decisions

- **Core is stateless** - front-ends compile schemas in, consumers (form-state adapters, etc.) fold over the tree to manage values
- **Validation is side-loaded** - pluggable, framework-agnostic, not baked into any layer
- **Form-state is a shallow slot** (ADR 011) - native `<form>`+FormData is the default; RHF/TanStack are optional, justified only by reactivity or interop needs. Validation and UI are the primary swap axes.
- **No "kitchen sink" components** - We provide building blocks, not `<JsonSchemaForm />`
- **"label" not "title"** - Field nodes use `label` for clarity despite JSON Schema using `title`
- **Boolean schemas throw** - `true`/`false` as schema values are not supported

See `architecture_records/` for detailed design rationale. And add new ones when asked.

## Development Philosophy

This project runs as a **verification-gated autonomous loop** (ADR 009) — superseding the earlier strict-pairing philosophy. **Autonomy is bounded by verifiability**: decide alone on anything the gate suite (`npm run gate` = typecheck + lint + test) can catch you getting wrong; propose an ADR and proceed for a new abstraction/seam/public-API change (only once a second implementation forces it — ADR 008); stop and escalate for crossing the stubborn Core boundary, changing the golden-scenario set, adding a heavy dependency, anything that can't be made green, or deleting existing work. See `AGENTS.md` for the full tier breakdown.

**Budget posture:** built on a $20/mo Claude Pro plan. Favor a single agent working against the free gate; use cheaper models for grind; reserve tech-lead/subagent orchestration for large, well-specified chunks; avoid token-multiplying parallel orchestration (Dynamic Workflows / Sandcastle are parked).

Store AI planning documents in `history/` directory, not repo root.


<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:ca08a54f -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd dolt push
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
<!-- END BEADS INTEGRATION -->
