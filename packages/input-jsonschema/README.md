# @formframe/input-jsonschema

JSON Schema (draft-07) **front-end** for `@formframe/core` (ADR 033). Compiles a schema into the neutral form-tree IR, then runs the shipped default presentation.

## Usage

```typescript
import { jsonSchemaToTree } from '@formframe/input-jsonschema'

const tree = jsonSchemaToTree({
  type: 'object',
  properties: {
    name: { type: 'string', title: 'Name' },
  },
  required: ['name'],
})
```

## Support catalog

**[SUPPORT_CATALOG.md](./SUPPORT_CATALOG.md)** — evidence-backed matrix of schema shapes and keywords: what `jsonSchemaToTree` actually does today (supported, supported (qualified), degraded, ignored, rejected), with links to source, tests, and gap beads.

Update the catalog when compiler behavior changes.

## Pipeline

1. `resolveLocalRefs` — inline local `$ref`s
2. `compileRoot` — structural transcription (`compile.ts`)
3. `present(defaultPresentation)` — default widgets (`@formframe/core`)

See [ADR 033](../../architecture_records/033_core_is_schema_agnostic_input_packages.md).

## Exports

- `jsonSchemaToTree(schema)` → `GroupNode`
- `JSONSchema`, `JSONSchemaObject` types (draft-07)
