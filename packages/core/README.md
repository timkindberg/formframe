# @formframe/core

FormFrame's schema-agnostic form-tree IR and recursive fold.

## Overview

Core is the neutral waist of FormFrame. Source-specific front-ends compile JSON
Schema, Zod, or another schema language into the same tree; framework,
validation, form-state, and presentation adapters consume that tree.

## Features

- Framework- and schema-language-neutral form-tree nodes
- Recursive traversal, queries, and continuation rendering primitive
- Neutral field facts, parts, presentation, and widget catalog
- Submission assembly and nested path utilities
- Shared validation boundary types

## Philosophy

Core imports no schema language, framework, form-state library, or DOM API. It
does not compile schemas or manage values. Use `@formframe/input-jsonschema` or
`@formframe/input-zod` to build a tree, then bind it with a consumer such as
`@formframe/renderer-react` or `@formframe/renderer-vanilla`.

## Status

🚧 **Under development** — public APIs may still change before v1.

