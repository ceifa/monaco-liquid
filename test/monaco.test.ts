import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import type * as Monaco from 'monaco-editor'
import { z } from 'zod'
import { registerLiquidLanguage, setModelLiquidValidation } from '../dist/index.js'
import { createCompletionProvider, createHoverProvider } from '../dist/providers.js'

let monaco: typeof Monaco
let registration: Monaco.IDisposable

const schemas = {
    product: z.object({ title: z.string().describe('Product title'), price: z.number(), tags: z.array(z.string()) }),
    cart: z.object({ items: z.array(z.object({ title: z.string(), quantity: z.number() })) }),
}

before(async () => {
    monaco = await import('monaco-editor')
    registration = registerLiquidLanguage(monaco)
    // Opening a liquid model makes Monaco load its own built-in liquid definition.
    monaco.editor.createModel('', 'liquid')
    await settle()
})

after(() => {
    registration.dispose()
    for (const model of monaco.editor.getModels()) model.dispose()
})

const settle = () => new Promise((resolve) => setTimeout(resolve, 50))

/** Tokens of a single line as `text=type` pairs, without the `.liquid` postfix. */
function tokens(line: string): Array<string> {
    const [lineTokens = []] = monaco.editor.tokenize(line, 'liquid')
    return lineTokens.map((token, index) => {
        const end = lineTokens[index + 1]?.offset ?? line.length
        return `${line.slice(token.offset, end)}=${token.type.replace(/\.liquid$/, '')}`
    })
}

const typeOf = (line: string, text: string) =>
    tokens(line)
        .find((token) => token.startsWith(`${text}=`))
        ?.split('=')[1]

test('tokenizes chained filters with arguments', () => {
    const line = '{{ product.price | divided_by: 100.0 | round: 2 }} after'
    assert.equal(typeOf(line, 'divided_by'), 'function')
    assert.equal(typeOf(line, 'round'), 'function')
    assert.equal(typeOf(line, '2'), 'number')
    assert.equal(typeOf(line, '}}'), 'delimiter.output')
    assert.equal(typeOf(line, ' after'), '')
    assert.equal(typeOf('{{ x | upcase | downcase }}', 'downcase'), 'function')
})

test('does not split identifiers that contain operator words', () => {
    assert.deepEqual(tokens('{{ customer.orders_count }}').slice(2, 5), ['customer=variable', '.=delimiter', 'orders_count=variable'])
    assert.equal(typeOf('{% if a and b %}', 'and'), 'keyword.operator')
})

test('recognizes whitespace control', () => {
    assert.deepEqual(tokens('{%- if x -%}').slice(0, 3), ['{%-=delimiter.tag', ' =', 'if=keyword.control'])
    assert.equal(typeOf('{%- if x -%}', '-%}'), 'delimiter.tag')
    assert.equal(typeOf('{{- x -}}', '-}}'), 'delimiter.output')
})

test('keeps Liquid highlighted inside HTML attributes', () => {
    const line = '<a href="{{ url }}">t</a>'
    assert.equal(typeOf(line, 'a'), 'tag.html')
    assert.equal(typeOf(line, 'href'), 'attribute.name')
    assert.equal(typeOf(line, 'url'), 'variable')
    assert.equal(typeOf(line, 't'), '')
})

test('keeps filter names across lines and whitespace control after identifiers', () => {
    const [, second = []] = monaco.editor.tokenize('{{ x |\n  upcase }}', 'liquid')
    assert.equal(second[1]?.type, 'function.liquid')
    assert.deepEqual(tokens('{{ a-}}x').slice(2, 4), ['a=variable', '-}}=delimiter.output'])
})

test('tokenizes the first statement of a single-line liquid tag', () => {
    assert.equal(typeOf('{%- liquid assign a = 1 -%}', 'assign'), 'keyword')
})

test('tokenizes raw blocks inside HTML attributes', () => {
    assert.equal(typeOf('<a title="{% raw %}{{ x }}{% endraw %}">', '{{ x }}'), 'string.raw')
})

test('tokenizes comments and raw blocks', () => {
    assert.equal(typeOf('{%- comment -%} {{ x }} {%- endcomment -%}', ' {{ x }} '), 'comment')
    assert.equal(typeOf('{% raw %}{{ x }}{% endraw %}', '{{ x }}'), 'string.raw')
    assert.equal(typeOf('{% # note %}', '# note '), 'comment')
})

test('tokenizes the liquid tag one statement per line', () => {
    const [, second = []] = monaco.editor.tokenize('{% liquid\n  echo x | upcase\n  assign y = 1\n%}', 'liquid')
    const third = monaco.editor.tokenize('{% liquid\n  echo x | upcase\n  assign y = 1\n%}', 'liquid')[2] ?? []
    assert.ok(second.some((token) => token.type === 'function.liquid'))
    assert.equal(third[1]?.type, 'keyword.liquid')
})

test('our language configuration survives the built-in liquid definition', async () => {
    const container = document.createElement('div')
    const editor = monaco.editor.create(container, { value: '', language: 'liquid' })
    await settle()
    const type = (text: string) => {
        editor.setValue('Discount 50')
        editor.setPosition({ lineNumber: 1, column: 12 })
        editor.trigger('keyboard', 'type', { text })
        return editor.getValue()
    }
    assert.equal(type('%'), 'Discount 50%')
    editor.setValue('')
    editor.trigger('keyboard', 'type', { text: '{' })
    editor.trigger('keyboard', 'type', { text: '%' })
    assert.equal(editor.getValue(), '{%%}')
    editor.dispose()
})

function complete(marked: string, triggerCharacter?: string, mode: 'insert' | 'replace' = 'insert') {
    const model = monaco.editor.createModel(marked.replace('‸', ''), 'liquid')
    const position = model.getPositionAt(marked.indexOf('‸'))
    const provider = createCompletionProvider(monaco, () => schemas)
    const result = provider.provideCompletionItems(
        model,
        position,
        triggerCharacter
            ? { triggerKind: monaco.languages.CompletionTriggerKind.TriggerCharacter, triggerCharacter }
            : { triggerKind: monaco.languages.CompletionTriggerKind.Invoke },
        new monaco.CancellationTokenSource().token,
    ) as Monaco.languages.CompletionList | null
    const suggestions = result?.suggestions ?? []
    const accept = (label: string) => {
        const item = suggestions.find((suggestion) => suggestion.label === label)
        assert.ok(item, `no suggestion '${label}'`)
        const range = item.range as Monaco.languages.CompletionItemRanges
        model.applyEdits([{ range: mode === 'replace' ? range.replace : range.insert, text: item.insertText }])
        return model.getValue()
    }
    return { labels: suggestions.map((suggestion) => suggestion.label), suggestions, accept }
}

test('completes filters after a pipe and replaces the typed prefix', () => {
    const { labels, accept } = complete('{{ product.title | up‸ }}')
    assert.ok(labels.includes('upcase'))
    assert.ok(!labels.includes('product'))
    assert.equal(accept('upcase'), '{{ product.title | upcase }}')
})

test('completes tag names, including end tags for open blocks', () => {
    const { labels, accept } = complete('{% for x in y %}{% if a %}{% en‸ %}')
    assert.ok(labels.includes('assign'))
    assert.ok(labels.includes('endif') && labels.includes('endfor'))
    assert.equal(accept('endif'), '{% for x in y %}{% if a %}{% endif %}')
})

test('completes schema properties from the parent path', () => {
    assert.deepEqual(complete('{{ product.‸ }}').labels, ['title', 'price', 'tags'])
    const partial = complete('{{ product.ti‸ }}')
    assert.ok(partial.labels.includes('title'))
    assert.equal(partial.accept('title'), '{{ product.title }}')
    assert.deepEqual(complete('{{ cart.items[0].‸ }}').labels, ['title', 'quantity'])
    assert.deepEqual(complete('{% for item in cart.items %}{{ item.‸ }}').labels, ['title', 'quantity'])
    const top = complete('{{ ‸ }}').labels
    assert.ok(top.includes('product') && top.includes('cart'))
    const detail = complete('{{ product.‸ }}').suggestions.find((suggestion) => suggestion.label === 'price')
    assert.equal(detail?.detail, 'Number')
})

test('replaces the whole word in replace mode', () => {
    assert.equal(complete('{{ product.ti‸tle }}', undefined, 'replace').accept('title'), '{{ product.title }}')
    assert.equal(complete('{{ product.title | up‸case }}', undefined, 'replace').accept('downcase'), '{{ product.title | downcase }}')
})

test('opens suggestions on space only where a tag or filter name goes', () => {
    assert.deepEqual(complete('{{ product ‸', ' ').labels, [])
    assert.ok(complete('{% ‸', ' ').labels.includes('if'))
    assert.ok(complete('{{ x | ‸', ' ').labels.includes('upcase'))
})

test('offers nothing in plain text or strings', () => {
    assert.deepEqual(complete('Hello wor‸').labels, [])
    assert.deepEqual(complete('{{ "prod‸" }}').labels, [])
})

function hover(marked: string) {
    const model = monaco.editor.createModel(marked.replace('‸', ''), 'liquid')
    const provider = createHoverProvider(monaco, () => schemas)
    const result = provider.provideHover(
        model,
        model.getPositionAt(marked.indexOf('‸')),
        new monaco.CancellationTokenSource().token,
    ) as Monaco.languages.Hover | null
    return result ? (result.contents as Array<Monaco.IMarkdownString>).map((content) => content.value).join('\n') : null
}

test('hovers the segment under the cursor', () => {
    assert.match(hover('{{ product.pr‸ice }}')!, /Number/)
    assert.match(hover('{{ pro‸duct.price }}')!, /Object/)
    assert.match(hover('{{ product.ti‸tle }}')!, /String\n```\nProduct title/)
    assert.match(hover('{% for item in cart.items %}{{ item.qua‸ntity }}{% endfor %}')!, /Number/)
    assert.equal(hover('{{ unknown.th‸ing }}'), null)
    assert.equal(hover('product.ti‸tle'), null)
})

test('validates models and cleans up on dispose', async () => {
    const model = monaco.editor.createModel('{% if a %}', 'liquid')
    const markers = () => monaco.editor.getModelMarkers({ resource: model.uri, owner: 'liquid' })
    const binding = setModelLiquidValidation(monaco, model, schemas, { debounceMs: 0 })
    assert.equal(markers()[0]?.message, "'if' is not closed, expected 'endif'")

    model.setValue('{% if a %}\n{% endif %}')
    await settle()
    assert.deepEqual(markers(), [])

    model.setValue('{%\n  if a %}{{ x')
    await settle()
    const marker = markers().find((candidate) => candidate.message.startsWith("'{{'"))
    assert.deepEqual([marker?.startLineNumber, marker?.startColumn, marker?.endColumn], [2, 10, 12])

    binding.dispose()
    assert.deepEqual(markers(), [])
    model.setValue('{% if a %}')
    await settle()
    assert.deepEqual(markers(), [])
})

test('re-binding a model replaces the previous binding', async () => {
    const model = monaco.editor.createModel('', 'liquid')
    const first = setModelLiquidValidation(monaco, model, schemas, { debounceMs: 0 })
    const second = setModelLiquidValidation(monaco, model, {}, { debounceMs: 0 })
    first.dispose()
    model.setValue('{% if a %}')
    await settle()
    assert.equal(monaco.editor.getModelMarkers({ resource: model.uri, owner: 'liquid' }).length, 1)
    second.dispose()
})
