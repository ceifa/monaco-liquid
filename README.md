# Liquid Language for Monaco Editor

This package provides a seamless integration of the [Liquid templating language](https://liquidjs.com/index.html) into the [Monaco Editor](https://microsoft.github.io/monaco-editor/), offering syntax highlighting, validation, hover support, and autocompletion capabilities.

## Features

- **Language Registration:** Registers Liquid as a language within Monaco Editor with support for Liquid's syntax, including tags, filters, variables, and expressions.

- **Syntax Highlighting:** Differentiates between Liquid tags, output delimiters, comments, strings, variables, and HTML content.

- **Hover Support:** Displays type information for variables based on schemas defined using [Zod](https://github.com/colinhacks/zod).

- **Validation:** Checks for unmatched or improperly nested Liquid tags and output delimiters.

- **Autocomplete Suggestions:** Provides suggestions for Liquid syntax, variables, and properties based on the provided schemas.

---

## Installation

Install the package via npm:

```bash
npm install monaco-liquid
```

---

## Usage

### Register the Liquid Language

```typescript
import * as monaco from 'monaco-editor';
import { registerLiquidLanguage, setModelLiquidValidation } from 'monaco-liquid';
import { z } from 'zod';

// Initialize Monaco Editor
const editor = monaco.editor.create(document.getElementById('container'), {
    language: 'liquid',
    value: '{% if user %}\n  Hello, {{ user.name }}!\n{% endif %}',
    theme: 'vs-dark',
});

// Register Liquid language
registerLiquidLanguage(monaco);

// Define schemas using Zod
const schemas = {
    user: z.object({
        name: z.string(),
        age: z.number(),
        isAdmin: z.boolean(),
    }),
};

// Attach validation and schemas to the editor model
const model = editor.getModel();
if (model) {
    setModelLiquidValidation(monaco, model, schemas);
}
```

---

## API

### `registerLiquidLanguage(monacoInstance: typeof monaco): void`

Registers the Liquid language with the Monaco Editor, enabling syntax highlighting, hover support, and autocompletion.

### `setModelLiquidValidation(monacoInstance: typeof monaco, model: monaco.editor.ITextModel, schemas: Record<string, ZodSchema<unknown>>): void`

Associates schemas with the editor model and validates Liquid syntax.

- **Parameters:**
  - `monacoInstance`: The Monaco instance.
  - `model`: The Monaco text model where Liquid content is written.
  - `schemas`: A record of Zod schemas defining the structure of variables used in Liquid templates.

---

## Schema Integration

Schemas define the structure and types of variables in your Liquid templates. The package uses Zod schemas to enable detailed hover information and autocompletion for nested properties.

### Example

```typescript
const schemas = {
    product: z.object({
        name: z.string(),
        price: z.number(),
        tags: z.array(z.string()),
    }),
};
```

### Autocomplete
When typing `product.`, the editor will suggest `name`, `price`, and `tags`. For nested properties, suggestions are context-aware.

### Hover
Hovering over `product.price` will display the type as `Number`.