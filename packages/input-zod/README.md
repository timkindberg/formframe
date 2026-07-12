# @jsonschema-form/input-zod

Zod v4 **front-end** for `@jsonschema-form/core` (ADR 034). Compiles a Zod schema into the neutral form-tree IR by direct introspection of `schema._zod.def` — no Zod → JSON Schema round-trip — then runs the shipped default presentation.

## Usage

```typescript
import { z } from 'zod'
import { zodToTree } from '@jsonschema-form/input-zod'

const tree = zodToTree(
  z.object({
    name: z.string().meta({ title: 'Name' }),
  })
)
```

Pair with `@jsonschema-form/react`'s `useFormTree(tree)` for rendering and submission (ADR 035).

## Support catalog

**[SUPPORT_CATALOG.md](./SUPPORT_CATALOG.md)** — evidence-backed matrix of Zod shapes, wrappers, and checks: what `zodToTree` actually does today (supported, qualified, degraded, ignored, rejected), plus validation-only semantics. Links to source, tests, and gap beads.

Update the catalog when compiler behavior changes.

## Pipeline

1. `compileRoot` — structural transcription via `zodInternals.ts` → `compile.ts`
2. `present(defaultPresentation)` — default widgets (`@jsonschema-form/core`)

See [ADR 034](../../architecture_records/034_zod_front_end_direct_introspection.md).

## Exports

- `zodToTree(schema)` → `GroupNode<ZodType>`

Internal modules (`compile.ts`, `zodInternals.ts`) are not public API.
