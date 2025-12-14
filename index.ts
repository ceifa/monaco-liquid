import type * as monaco from 'monaco-editor'
import {
    ZodArray,
    ZodBoolean,
    ZodDate,
    ZodDefault,
    ZodEnum,
    ZodLiteral,
    ZodNullable,
    ZodNumber,
    ZodObject,
    ZodOptional,
    type ZodType,
    ZodString,
    ZodUnion,
} from 'zod'

type ILiquidModel = monaco.editor.ITextModel & { schemas?: Record<string, ZodType<unknown>> }

export const registerLiquidLanguage = (monacoInstance: typeof monaco) => {
    monacoInstance.languages.register({ id: 'liquid' })
    monacoInstance.languages.registerHoverProvider('liquid', {
        provideHover: (model: ILiquidModel, position) => {
            if (!model.schemas) return null

            const variablePath = getVariablePathAtPosition(model, position)
            if (variablePath) {
                // Split the path by dots and brackets, filter out empty strings
                const pathSegments = variablePath.split(/\.|\[|\]/).filter((segment) => segment !== '')
                const variableName = pathSegments[0]

                if (Object.prototype.hasOwnProperty.call(model.schemas, variableName)) {
                    const schema = model.schemas[variableName]
                    const pathWithoutVariableName = pathSegments.slice(1)
                    const typeInfo = getTypeInfoFromSchema(schema, pathWithoutVariableName)
                    if (typeInfo) {
                        const word = model.getWordAtPosition(position)
                        return {
                            range: word
                                ? new monacoInstance.Range(
                                      position.lineNumber,
                                      word.startColumn,
                                      position.lineNumber,
                                      word.endColumn,
                                  )
                                : undefined,
                            contents: [{ value: `**Type:** \`${typeInfo}\`` }],
                        }
                    }
                }
            }
            return null
        },
    })

    monacoInstance.languages.setMonarchTokensProvider('liquid', {
        defaultToken: '',
        tokenPostfix: '.liquid',

        brackets: [
            { open: '{%', close: '%}', token: 'delimiter.tag' },
            { open: '{{', close: '}}', token: 'delimiter.output' },
            { open: '{', close: '}', token: 'delimiter.bracket' },
            { open: '(', close: ')', token: 'delimiter.parenthesis' },
            { open: '[', close: ']', token: 'delimiter.array' },
        ],

        tokenizer: {
            root: [
                // Comments
                [/{%\s*comment\s*%}/, { token: 'comment.block.start', next: '@commentBlock' }],
                // Raw blocks
                [/{%\s*raw\s*%}/, { token: 'string.raw.start', next: '@rawBlock' }],
                // Output tags
                [/\{\{/, { token: 'delimiter.output', next: '@output' }],
                // Control flow tags
                [/{%\s*(if|unless|elsif|else|case|when|for|tablerow|end\w+)\b/, { token: 'keyword.control', next: '@tag' }],
                // Other tags
                [/{%\s*(assign|capture|increment|decrement|include|render|cycle|break|continue)\b/, { token: 'keyword', next: '@tag' }],
                // Default tag handler
                [/{%/, { token: 'delimiter.tag', next: '@tag' }],
                // Text
                [/[^<{]+/, ''],
                // HTML tags
                [/<\/?[\w\-]+.*?>/, 'tag'],
                // Remaining characters
                [/[<{]/, ''],
            ],

            output: [[/\}\}/, { token: 'delimiter.output', next: '@pop' }], { include: '@liquidExpression' }],

            tag: [[/\%}/, { token: 'delimiter.tag', next: '@pop' }], { include: '@liquidExpression' }],

            commentBlock: [
                [/{%\s*endcomment\s*%}/, { token: 'comment.block.end', next: '@pop' }],
                [/./, 'comment.content'],
            ],

            rawBlock: [
                [/{%\s*endraw\s*%}/, { token: 'string.raw.end', next: '@pop' }],
                [/./, 'string.raw'],
            ],

            liquidExpression: [
                // Whitespace
                [/\s+/, 'white'],
                // Operators
                [/==|!=|<=|>=|<|>|and|or|contains/, 'operator'],
                // Numbers
                [/\b\d+(\.\d+)?\b/, 'number'],
                // Strings
                [/"(\\.|[^"\\])*"/, 'string'],
                [/'(\\.|[^'\\])*'/, 'string'],
                // Booleans and nil
                [/\b(true|false|nil)\b/, 'constant.language'],
                // Keywords
                [
                    /\b(assign|capture|endcapture|increment|decrement|if|endif|unless|endunless|case|endcase|when|else|elsif|for|endfor|include|with|break|continue|cycle|in|limit|offset|render|tablerow|endtablerow|comment|endcomment|raw|endraw|paginate|endpaginate|form|endform)\b/,
                    'keyword',
                ],
                // Filters
                [/\|/, { token: 'operator', next: '@filter' }],
                // Variables and properties
                [/[a-zA-Z_][\w\-]*/, 'variable'],
                // Punctuation
                [/[\[\]().,]/, 'delimiter'],
                // Other
                [/./, ''],
            ],

            filter: [
                // Filter name
                [/\s*(\w+)/, 'function'],
                // Parameters
                [/:/, 'operator', '@filterargs'],
                // Next filter or end
                [/\|/, 'operator', '@pop'],
                [/\%}|\}\}/, { token: '@rematch', next: '@pop' }],
            ],

            filterargs: [
                // Whitespace
                [/\s+/, 'white'],
                // String parameters
                [/"(\\.|[^"\\])*"/, 'string'],
                [/'(\\.|[^'\\])*'/, 'string'],
                // Numbers
                [/\b\d+(\.\d+)?\b/, 'number'],
                // Variables
                [/[a-zA-Z_][\w\-]*/, 'variable'],
                // Punctuation
                [/[,]/, 'delimiter'],
                // End of filter args
                [/\|/, 'operator', '@popall'],
                [/\%}|\}\}/, { token: '@rematch', next: '@popall' }],
            ],
        },
    })

    monacoInstance.languages.setLanguageConfiguration('liquid', {
        comments: {
            blockComment: ['{% comment %}', '{% endcomment %}'],
        },
        brackets: [
            ['{%', '%}'],
            ['{{', '}}'],
            ['{', '}'],
            ['[', ']'],
            ['(', ')'],
        ],
        autoClosingPairs: [
            { open: '{{', close: '}}' },
            { open: '{%', close: '%}' },
            { open: '"', close: '"' },
            { open: "'", close: "'" },
            { open: '[', close: ']' },
            { open: '(', close: ')' },
        ],
        surroundingPairs: [
            { open: '{%', close: '%}' },
            { open: '{{', close: '}}' },
            { open: '"', close: '"' },
            { open: "'", close: "'" },
            { open: '[', close: ']' },
            { open: '(', close: ')' },
        ],
        folding: {
            markers: {
                start: /{%-?\s*(comment|raw|if|unless|case|for|tablerow|form|paginate|capture|schema|stylesheet|javascript|layout|block|liquid)\b/,
                end: /{%-?\s*end(comment|raw|if|unless|case|for|tablerow|form|paginate|capture|schema|stylesheet|javascript|layout|block|liquid)\s*-?%}/,
            },
        },
    })

    monacoInstance.languages.registerCompletionItemProvider('liquid', {
        triggerCharacters: ['.', ' ', '{', '%', '|'],
        provideCompletionItems: (model: ILiquidModel, position) => {
            const suggestions = [
                ...getKeywordSuggestions(monacoInstance, position),
                ...(model.schemas ? getSchemaSuggestions(monacoInstance, model, position, model.schemas) : []),
            ]
            return { suggestions }
        },
    })
}

function unwrapSchema(schema: unknown): unknown {
    if (schema instanceof ZodOptional || schema instanceof ZodNullable || schema instanceof ZodDefault) {
        return unwrapSchema(schema._zod.def.innerType)
    }
    return schema
}

function navigateSchema(schema: ZodType, path: Array<string>): unknown | null {
    let currentSchema: unknown = unwrapSchema(schema)

    for (const segment of path) {
        currentSchema = unwrapSchema(currentSchema)

        if (currentSchema instanceof ZodArray) {
            currentSchema = unwrapSchema(currentSchema.element)
        }

        if (/^\d+$/.test(segment)) {
            // Skip array indices
        } else if (currentSchema instanceof ZodObject) {
            const shape = currentSchema.shape
            if (Object.prototype.hasOwnProperty.call(shape, segment)) {
                currentSchema = shape[segment]
            } else {
                return null
            }
        } else {
            return null
        }
    }

    return unwrapSchema(currentSchema)
}

function getTypeString(schema: unknown): string {
    const unwrapped = unwrapSchema(schema)

    if (unwrapped instanceof ZodArray) {
        const elementType = getTypeString(unwrapped.element)
        return `Array<${elementType}>`
    } else if (unwrapped instanceof ZodObject) {
        return 'Object'
    } else if (unwrapped instanceof ZodString) {
        return 'String'
    } else if (unwrapped instanceof ZodNumber) {
        return 'Number'
    } else if (unwrapped instanceof ZodBoolean) {
        return 'Boolean'
    } else if (unwrapped instanceof ZodDate) {
        return 'Date'
    } else if (unwrapped instanceof ZodLiteral) {
        const values = unwrapped._zod.def.values
        const value = values[0]
        return typeof value === 'string' ? `"${value}"` : String(value)
    } else if (unwrapped instanceof ZodEnum) {
        const entries = unwrapped._zod.def.entries
        const values = Object.values(entries) as string[]
        return values.map((v) => `"${v}"`).join(' | ')
    } else if (unwrapped instanceof ZodUnion) {
        const options = unwrapped._zod.def.options as ZodType[]
        return options.map((opt) => getTypeString(opt)).join(' | ')
    } else {
        return 'Unknown'
    }
}

function getTypeInfoFromSchema(schema: ZodType, path: Array<string>): string | null {
    const navigated = navigateSchema(schema, path)
    if (navigated === null) return null
    return getTypeString(navigated)
}

export const setModelLiquidValidation = (
    monacoInstance: typeof monaco,
    model: monaco.editor.ITextModel,
    schemas: Record<string, ZodType<unknown>>,
    options: { debounceMs?: number } = {},
): monaco.IDisposable => {
    const { debounceMs = 300 } = options
    ;(<ILiquidModel>model).schemas = schemas
    validateLiquidSyntax(monacoInstance, model)

    let validationTimeout: number | undefined

    const disposable = model.onDidChangeContent(() => {
        if (validationTimeout !== undefined) {
            window.clearTimeout(validationTimeout)
        }
        validationTimeout = window.setTimeout(() => {
            validateLiquidSyntax(monacoInstance, model)
            validationTimeout = undefined
        }, debounceMs)
    })

    return {
        dispose: () => {
            if (validationTimeout !== undefined) {
                window.clearTimeout(validationTimeout)
            }
            disposable.dispose()
            monacoInstance.editor.setModelMarkers(model, 'liquid', [])
        },
    }
}

function getKeywordSuggestions(monacoInstance: typeof monaco, position: monaco.Position): Array<monaco.languages.CompletionItem> {
    const keywords: Array<string> = [
        'assign',
        'capture',
        'endcapture',
        'increment',
        'decrement',
        'if',
        'endif',
        'unless',
        'endunless',
        'elsif',
        'else',
        'for',
        'endfor',
        'break',
        'continue',
        'limit',
        'offset',
        'range',
        'reversed',
        'cols',
        'case',
        'endcase',
        'when',
        'cycle',
        'tablerow',
        'endtablerow',
        'include',
        'render',
        'with',
        'comment',
        'endcomment',
        'raw',
        'endraw',
        'true',
        'false',
        'nil',
        'and',
        'or',
        'not',
        'in',
        'contains',
        'startswith',
        'endswith',
        'abs',
        'append',
        'at_least',
        'at_most',
        'capitalize',
        'ceil',
        'compact',
        'concat',
        'date',
        'default',
        'divided_by',
        'downcase',
        'escape',
        'escape_once',
        'first',
        'floor',
        'join',
        'last',
        'lstrip',
        'map',
        'minus',
        'modulo',
        'newline_to_br',
        'plus',
        'prepend',
        'remove',
        'remove_first',
        'replace',
        'replace_first',
        'reverse',
        'round',
        'rstrip',
        'size',
        'slice',
        'sort',
        'sort_natural',
        'split',
        'strip',
        'strip_html',
        'strip_newlines',
        'times',
        'truncate',
        'truncatewords',
        'uniq',
        'upcase',
        'url_decode',
        'url_encode',
    ]

    const range = new monacoInstance.Range(position.lineNumber, position.column, position.lineNumber, position.column)

    return keywords.map((keyword) => ({
        label: keyword,
        kind: monacoInstance.languages.CompletionItemKind.Keyword,
        insertText: keyword,
        range,
        sortText: `2${keyword}`, // Sort keywords after variables and properties
    }))
}

function getVariablePathAtPosition(model: monaco.editor.ITextModel, position: monaco.Position): string | null {
    const lineContent = model.getLineContent(position.lineNumber)
    const textUntilPosition = lineContent.substring(0, position.column - 1)
    // Regex to match variable paths (e.g., order.cart[0].product, my-variable)
    const variablePathRegex = /[a-zA-Z_][\w\-.\[\]]*$/
    const match = variablePathRegex.exec(textUntilPosition)
    if (match) {
        return match[0]
    }
    return null
}

function getSchemaSuggestions(
    monacoInstance: typeof monaco,
    model: monaco.editor.ITextModel,
    position: monaco.Position,
    schemas: Record<string, ZodType<unknown>>,
): Array<monaco.languages.CompletionItem> {
    const wordUntilPosition = model.getWordUntilPosition(position)
    const range = new monacoInstance.Range(
        position.lineNumber,
        wordUntilPosition.startColumn,
        position.lineNumber,
        wordUntilPosition.endColumn,
    )

    const variablePath = getVariablePathAtPosition(model, position)
    if (variablePath) {
        // Split the path by dots, brackets, and filter out empty strings
        const pathSegments = variablePath.split(/\.|\[|\]/).filter((segment) => segment !== '')
        const variableName = pathSegments[0]

        if (Object.prototype.hasOwnProperty.call(schemas, variableName)) {
            const schema = schemas[variableName]
            const pathWithoutVariableName = pathSegments.slice(1)
            return getSuggestionsFromSchema(monacoInstance, schema, pathWithoutVariableName, range)
        }
    } else {
        // If no variable path, suggest top-level schema variables
        return Object.keys(schemas).map((variableName) => ({
            label: variableName,
            kind: monacoInstance.languages.CompletionItemKind.Variable,
            insertText: variableName,
            sortText: `0${variableName}`, // Sort top-level variables first
            range,
        }))
    }

    return []
}

function getCompletionKindForSchema(monacoInstance: typeof monaco, schema: unknown): monaco.languages.CompletionItemKind {
    const unwrapped = unwrapSchema(schema)
    if (unwrapped instanceof ZodArray) {
        return monacoInstance.languages.CompletionItemKind.Variable
    } else if (unwrapped instanceof ZodObject) {
        return monacoInstance.languages.CompletionItemKind.Class
    } else {
        return monacoInstance.languages.CompletionItemKind.Property
    }
}

function getSuggestionsFromSchema(
    monacoInstance: typeof monaco,
    schema: ZodType,
    path: Array<string>,
    range: monaco.Range,
): Array<monaco.languages.CompletionItem> {
    const navigated = navigateSchema(schema, path)
    if (navigated === null) return []

    let currentSchema = unwrapSchema(navigated)

    if (currentSchema instanceof ZodArray) {
        currentSchema = unwrapSchema(currentSchema.element)
    }

    if (currentSchema instanceof ZodObject) {
        const suggestions: Array<monaco.languages.CompletionItem> = []
        const shape = currentSchema.shape
        for (const key in shape) {
            if (Object.prototype.hasOwnProperty.call(shape, key)) {
                const value = shape[key]
                const typeString = getTypeString(value)

                suggestions.push({
                    label: key,
                    kind: getCompletionKindForSchema(monacoInstance, value),
                    insertText: key,
                    detail: typeString,
                    documentation: { value: `**Type:** \`${typeString}\`` },
                    range,
                    sortText: `1${key}`,
                })
            }
        }
        return suggestions
    }

    return []
}

function validateLiquidSyntax(monacoInstance: typeof monaco, model: monaco.editor.ITextModel) {
    const text = model.getValue()
    const lines = text.split(/\r?\n/)

    const markers: Array<monaco.editor.IMarkerData> = []
    const stack: Array<{ tag: string; lineNumber: number; column: number; length: number }> = []

    const tagRegex = /{%-?\s*(\w+)(?:\s[^%]*)?-?%}/g
    const endTagRegex = /{%-?\s*end(\w+)\s*-?%}/g

    const outputStartRegex = /\{\{-?/g
    const outputEndRegex = /-?\}\}/g

    lines.forEach((lineContent, index) => {
        const lineNumber = index + 1

        tagRegex.lastIndex = 0
        endTagRegex.lastIndex = 0
        outputStartRegex.lastIndex = 0
        outputEndRegex.lastIndex = 0

        let match: RegExpExecArray | null

        const outputMatches: Array<{ type: 'start' | 'end'; index: number }> = []

        match = outputStartRegex.exec(lineContent)
        while (match !== null) {
            outputMatches.push({ type: 'start', index: match.index })
            match = outputStartRegex.exec(lineContent)
        }

        match = outputEndRegex.exec(lineContent)
        while (match !== null) {
            outputMatches.push({ type: 'end', index: match.index })
            match = outputEndRegex.exec(lineContent)
        }

        outputMatches.sort((a, b) => a.index - b.index)
        outputMatches.forEach((outputMatch) => {
            if (outputMatch.type === 'start') {
                stack.push({ tag: 'output', lineNumber, column: outputMatch.index + 1, length: 2 })
            } else {
                // outputMatch.type === 'end'
                // Only look for matching output tag, don't pop block tags
                const outputIndex = stack.findLastIndex((item) => item.tag === 'output')
                if (outputIndex === -1) {
                    // Unmatched closing output tag
                    markers.push({
                        severity: monacoInstance.MarkerSeverity.Error,
                        message: `Unmatched closing '}}'`,
                        startLineNumber: lineNumber,
                        startColumn: outputMatch.index + 1,
                        endLineNumber: lineNumber,
                        endColumn: outputMatch.index + 3,
                    })
                } else {
                    stack.splice(outputIndex, 1)
                }
            }
        })

        match = tagRegex.exec(lineContent)
        while (match !== null) {
            const tag = match[1]
            const position = match.index

            // Exclude end tags from opening tag regex matches
            if (!tag.startsWith('end') && isBlockTag(tag)) {
                stack.push({ tag, lineNumber, column: position + 1, length: match[0].length })
            }

            match = tagRegex.exec(lineContent)
        }

        match = endTagRegex.exec(lineContent)
        while (match !== null) {
            const endTag = match[1]
            const position = match.index

            if (stack.length === 0) {
                // Unmatched end tag
                markers.push({
                    severity: monacoInstance.MarkerSeverity.Error,
                    message: `Unmatched end tag 'end${endTag}'`,
                    startLineNumber: lineNumber,
                    startColumn: position + 1,
                    endLineNumber: lineNumber,
                    endColumn: position + match[0].length + 1,
                })
            } else {
                const last = stack.pop()
                if (last?.tag !== endTag) {
                    // Mismatched end tag
                    markers.push({
                        severity: monacoInstance.MarkerSeverity.Error,
                        message: `Expected 'end${last?.tag}' but found 'end${endTag}'`,
                        startLineNumber: lineNumber,
                        startColumn: position + 1,
                        endLineNumber: lineNumber,
                        endColumn: position + match[0].length + 1,
                    })
                }
            }

            match = endTagRegex.exec(lineContent)
        }
    })

    while (stack.length > 0) {
        const unmatchedTag = stack.pop()!
        const message =
            unmatchedTag.tag === 'output' ? `Unclosed output tag '{{'` : `Unclosed tag '${unmatchedTag.tag}'`
        markers.push({
            severity: monacoInstance.MarkerSeverity.Error,
            message,
            startLineNumber: unmatchedTag.lineNumber,
            startColumn: unmatchedTag.column,
            endLineNumber: unmatchedTag.lineNumber,
            endColumn: unmatchedTag.column + unmatchedTag.length,
        })
    }

    monacoInstance.editor.setModelMarkers(model, 'liquid', markers)
}

const blockTags: Array<string> = [
    'if',
    'unless',
    'case',
    'for',
    'tablerow',
    'comment',
    'raw',
    'capture',
    'form',
    'paginate',
    'layout',
    'block',
    'schema',
    'stylesheet',
    'javascript',
    'liquid',
]

function isBlockTag(tag: string): boolean {
    return blockTags.includes(tag)
}
