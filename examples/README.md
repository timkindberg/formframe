# Examples

This directory contains example applications demonstrating the JSON Schema Form library.

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
- Direct usage of `@jsonschema-form/core`
- Basic React integration patterns
- Exploration of the tree traversal API

## Adding More Examples

As we build out more layers, we'll add:
- `with-react-hook-form` - Integration with React Hook Form
- `with-tailwind` - Using the Tailwind UI layer
- `with-validation` - Plugging in AJV validation

