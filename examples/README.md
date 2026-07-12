# Examples

This directory contains example applications demonstrating FormFrame.

## Purpose

These examples serve as:
- **Dogfooding playground** - We use our own library as we build it to feel the API
- **API exploration** - Test what the developer experience feels like
- **Living documentation** - Show how the library is meant to be used

## Examples

### basic-react

A minimal Vite + React + TypeScript app for exploring the Core and React layers.

**Run it:**
```bash
cd examples/basic-react
npm install
npm run dev
```

**What's in it:**
- Direct usage of `@formframe/core`
- Basic React integration patterns
- Exploration of the tree traversal API

## Adding More Examples

Future examples will include **reference recipes** you copy into your own app — not published packages (see [ADR 024](../architecture_records/024_adapters_are_patterns_not_packages.md)):

- `with-react-hook-form` — React Hook Form form-state adapter recipe
- `with-tailwind` — Tailwind presentation adapter recipe
- `with-validation` — AJV/Zod validation wiring (validation adapters *are* maintained packages; the example shows how to plug them in)

