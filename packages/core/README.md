# @jsonschema-form/core

**Headless foundation for JSON Schema form generation**

## Overview

The Core package provides the fundamental logic for interpreting JSON Schema and managing form state with zero framework dependencies.

## Features

- Schema traversal and parsing
- Widget/component type registry and mapping rules
- Form state management (values, touched, dirty state)
- Field metadata computation
- Schema resolution (`$ref`, `allOf`, `anyOf`, `oneOf`, conditionals)
- Default value computation
- Dependency tracking
- Abstract event system (onChange, onBlur, etc.)
- Data path utilities for nested access

## Philosophy

The Core knows *what* needs to be rendered and *when*, but has no knowledge of React, HTML, or CSS.

## Status

🚧 **Under Development** - This package is in early exploration phase.

