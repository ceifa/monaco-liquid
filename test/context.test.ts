import assert from 'node:assert/strict'
import { test } from 'node:test'
import { z } from 'zod'
import { getCursorContext, getPathAt, getScope, resolve } from '../dist/context.js'
import { scan } from '../dist/scanner.js'
import { typeName } from '../dist/schema.js'

const schemas = {
    product: z.object({ title: z.string(), variants: z.array(z.object({ sku: z.string() })) }),
    cart: z.object({ items: z.array(z.object({ title: z.string(), quantity: z.number() })) }),
}

/** Splits `a‸b` into text and cursor offset. */
const at = (marked: string) => ({ text: marked.replace('‸', ''), offset: marked.indexOf('‸') })
const contextAt = (marked: string) => {
    const { text, offset } = at(marked)
    return getCursorContext(text, offset, schemas)
}
const kind = (marked: string) => contextAt(marked).kind
const path = (marked: string) => {
    const context = contextAt(marked)
    return context.kind === 'expression' ? context.path : undefined
}

test('classifies the cursor position', () => {
    assert.equal(kind('Hello ‸'), 'text')
    assert.equal(kind('{% ‸%}'), 'tag')
    assert.equal(kind('{%- i‸'), 'tag')
    assert.equal(kind('{% if ‸'), 'expression')
    assert.equal(kind('{{ ‸ }}'), 'expression')
    assert.equal(kind('{{ x | ‸}}'), 'filter')
    assert.equal(kind('{{ x | append: ‸}}'), 'expression')
    assert.equal(kind('{{ "a.‸" }}'), 'text')
    assert.equal(kind('{% comment %}{{ ‸{% endcomment %}'), 'text')
    assert.equal(kind('{% # note ‸%}'), 'text')
})

test('detects filter positions, including chained filters', () => {
    const text = '{{ x | upcase | do }}'
    assert.equal(getCursorContext(text, text.indexOf('do') + 2).kind, 'filter')
    assert.equal(getCursorContext(text, text.indexOf('upcase') + 3).kind, 'filter')
    assert.equal(getCursorContext('{{ x | ', 7).kind, 'filter')
})

test('separates the parent path from the segment being typed', () => {
    assert.equal(path('{{ pro‸'), null)
    assert.deepEqual(path('{{ product.‸'), ['product'])
    assert.deepEqual(path('{{ product.ti‸'), ['product'])
    assert.deepEqual(path('{{ cart.items[0].‸'), ['cart', 'items', '0'])
    assert.deepEqual(path('{{ product["variants"][1].s‸'), ['product', 'variants', '1'])
})

test('returns the path up to the hovered segment', () => {
    const text = '{{ product.title }}'
    assert.deepEqual(getPathAt(text, text.indexOf('product') + 2), ['product'])
    assert.deepEqual(getPathAt(text, text.indexOf('title') + 2), ['product', 'title'])
    assert.deepEqual(getPathAt(text, text.indexOf('title')), ['product', 'title'])
    assert.equal(getPathAt('{{ "product.title" }}', 6), null)
    assert.equal(getPathAt('product.title', 3), null)
})

test('scopes loop variables to their loop and keeps assignments', () => {
    const template = [
        '{% for item in cart.items %}',
        '  {% assign first_title = item.title %}',
        '  A',
        '{% endfor %}',
        'B',
        '{% assign variants = product.variants %}{% assign shout = product.title | upcase %}',
        'C',
    ].join('\n')
    const { nodes } = scan(template)
    const scopeAt = (marker: string) => getScope(nodes, template.indexOf(marker), schemas)

    const inside = scopeAt('A')
    assert.equal(typeName(resolve(inside, 'item.quantity')!), 'Number')
    assert.equal(typeName(resolve(inside, 'forloop.index')!), 'Number')

    const after = scopeAt('B')
    assert.equal(resolve(after, 'item'), undefined)
    assert.equal(resolve(after, 'forloop'), undefined)
    assert.equal(typeName(resolve(after, 'first_title')!), 'String')

    const end = scopeAt('C')
    assert.equal(typeName(resolve(end, 'variants[0].sku')!), 'String')
    assert.equal(resolve(end, 'shout'), undefined)
})

test('restores a variable shadowed by a loop', () => {
    const template = '{% for product in cart.items %}{% endfor %}X'
    const scope = getScope(scan(template).nodes, template.indexOf('X'), schemas)
    assert.equal(resolve(scope, 'product'), schemas.product)
})

test('resolves a loop collection against the scope before the loop variable is bound', () => {
    const template = '{% for product in product.variants %}X{% endfor %}'
    const scope = getScope(scan(template).nodes, template.indexOf('X'), schemas)
    assert.equal(typeName(resolve(scope, 'product.sku')!), 'String')
})
