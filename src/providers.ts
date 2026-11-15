import type * as monaco from 'monaco-editor'
import { getCursorContext, getPathAt, getScope, resolvePath } from './context.js'
import { CONSTANTS, EXPRESSION_KEYWORDS, FILTERS, TAGS } from './language.js'
import { scan } from './scanner.js'
import { describe, keys, typeName, type Schema, type Schemas } from './schema.js'
import { BLOCK_TAGS } from './validation.js'

/** The parts of the Monaco API this package uses; satisfied by both `monaco-editor` and `monaco-editor/editor`. */
export type MonacoApi = Pick<typeof import('monaco-editor'), 'languages' | 'editor' | 'Range' | 'MarkerSeverity'>

export type SchemaLookup = (model: monaco.editor.ITextModel) => Schemas | undefined

export function createCompletionProvider(api: MonacoApi, getSchemas: SchemaLookup): monaco.languages.CompletionItemProvider {
    const { CompletionItemKind } = api.languages
    return {
        triggerCharacters: ['.', '|', '%', '{', ' '],
        provideCompletionItems(model, position, context) {
            const text = model.getValue()
            const offset = model.getOffsetAt(position)
            const cursor = getCursorContext(text, offset, getSchemas(model))
            // A space only opens suggestions right after `{%` or `|`; everywhere else it's just typing.
            if (context.triggerCharacter === ' ' && cursor.kind !== 'tag' && cursor.kind !== 'filter') return null

            const word = model.getWordUntilPosition(position)
            const range = new api.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn)
            const item = (label: string, kind: monaco.languages.CompletionItemKind, sort: number, detail?: string) => ({
                label,
                kind,
                insertText: label,
                range,
                sortText: `${sort}${label}`,
                detail,
            })

            switch (cursor.kind) {
                case 'tag':
                    return {
                        suggestions: [
                            ...TAGS.map((tag) => item(tag, CompletionItemKind.Keyword, 1)),
                            ...openBlocks(text, offset).map((tag) => item(`end${tag}`, CompletionItemKind.Keyword, 0)),
                        ],
                    }
                case 'filter':
                    return { suggestions: FILTERS.map((filter) => item(filter, CompletionItemKind.Function, 0)) }
                case 'expression': {
                    if (cursor.path) {
                        const parent = resolvePath(cursor.scope, cursor.path)
                        return {
                            suggestions: parent
                                ? keys(parent).map(([key, schema]) => schemaItem(key, schema, CompletionItemKind.Field))
                                : [],
                        }
                    }
                    return {
                        suggestions: [
                            ...Object.entries(cursor.scope).map(([name, schema]) => schemaItem(name, schema, CompletionItemKind.Variable)),
                            ...CONSTANTS.map((constant) => item(constant, CompletionItemKind.Constant, 2)),
                            ...EXPRESSION_KEYWORDS.map((keyword) => item(keyword, CompletionItemKind.Keyword, 3)),
                        ],
                    }
                }
                default:
                    return null
            }

            function schemaItem(label: string, schema: Schema, kind: monaco.languages.CompletionItemKind): monaco.languages.CompletionItem {
                const type = typeName(schema)
                return { ...item(label, kind, 0, type), documentation: hoverMarkdown(type, schema) }
            }
        },
    }
}

export function createHoverProvider(api: MonacoApi, getSchemas: SchemaLookup): monaco.languages.HoverProvider {
    return {
        provideHover(model, position) {
            const schemas = getSchemas(model)
            if (!schemas) return null
            const text = model.getValue()
            const offset = model.getOffsetAt(position)
            const path = getPathAt(text, offset)
            if (!path) return null

            const schema = resolvePath(getScope(scan(text).nodes, offset, schemas), path)
            if (!schema) return null

            const word = model.getWordAtPosition(position)
            return {
                range: word ? new api.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn) : undefined,
                contents: [hoverMarkdown(typeName(schema), schema)],
            }
        },
    }
}

function hoverMarkdown(type: string, schema: Schema): monaco.IMarkdownString {
    const description = describe(schema)
    return { value: ['```typescript', type, '```', ...(description ? [description] : [])].join('\n') }
}

/** Block tags still open at `offset`, innermost first. */
function openBlocks(text: string, offset: number): Array<string> {
    const stack: Array<string> = []
    for (const node of scan(text).nodes) {
        if (node.end > offset) break
        if (BLOCK_TAGS.includes(node.name)) stack.push(node.name)
        else if (node.name.startsWith('end') && stack.at(-1) === node.name.slice(3)) stack.pop()
    }
    return [...new Set(stack.reverse())]
}
