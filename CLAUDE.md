# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A modular JSON Schema form library designed as a better-architected alternative to React JSON Schema Form (RJSF). The core philosophy is **extreme modularity** with five decoupled layers: Core (headless) → Validation → Framework → Form Library → UI Library.

## Commands

```bash
# Root-level commands (run from repo root)
npm run build          # Build all packages
npm run test           # Test all packages
npm run lint           # ESLint check
npm run lint:fix       # ESLint fix
npm run format         # Prettier format
npm run format:check   # Prettier check

# Package-specific testing
npm test -w packages/core      # Core tests (Vitest, node environment)
npm test -w packages/react     # React tests (Vitest browser mode with Playwright)

# Run single test file
npx vitest packages/core/src/parser/parser.test.ts
npx vitest packages/react/src/useSchemaForm.test.tsx

# Example app
npm run dev -w examples/basic-react   # Start example app on localhost
```

## Architecture

### Monorepo Structure
- `packages/core` - Headless foundation, zero dependencies, no framework coupling
- `packages/react` - React adapter with hooks and default components
- `packages/validation-ajv` - AJV validation adapter (placeholder)
- `packages/react-hook-form` - React Hook Form integration (placeholder)
- `packages/ui-tailwind` - Tailwind UI components (placeholder)
- `examples/basic-react` - Example app demonstrating various usage patterns

### Core Layer (`@jsonschema-form/core`)
The core is **stateless** - it only interprets schema into structure. Key exports:
- `parseSchema(schema)` → Returns a `GroupNode` tree representing the form structure
- `FieldNode` - Leaf nodes representing inputs (widget, validation rules, parts)
- `GroupNode` - Branch nodes representing nested objects (children, query methods)
- `FieldParts`/`GroupParts` - Framework-agnostic render structure descriptors

Tree traversal: Nodes have `walk(handlers)` for recursive traversal with `field` and `group` handlers. Queries (`getField`, `getAllFields`) use **relative paths** from the calling group.

### React Layer (`@jsonschema-form/react`)
- `useSchemaForm(schema)` → Returns `{ form, Form }` where Form is a ready-to-render component
- `DefaultFieldTemplate`, `DefaultGroupTemplate`, `DefaultRootTemplate` - Default renderers

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

- **Core is stateless** - Form libraries (React Hook Form, etc.) handle state
- **Validation is side-loaded** - Pluggable, not baked into layers
- **No "kitchen sink" components** - We provide building blocks, not `<JsonSchemaForm />`
- **"label" not "title"** - Field nodes use `label` for clarity despite JSON Schema using `title`
- **Boolean schemas throw** - `true`/`false` as schema values are not supported

See `architecture_records/` for detailed design rationale. And add new ones when asked.

## Development Philosophy

**You are pairing with the developer, not driving.** The developer makes all major API decisions. Your role is to implement their vision, ask clarifying questions, and suggest alternatives when asked. Never vomit code without discussion.

Store AI planning documents in `history/` directory, not repo root.
