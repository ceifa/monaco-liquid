import assert from 'node:assert/strict'
import { test } from 'node:test'
import { z } from 'zod'
import * as zm from 'zod/mini'
import { describe, element, keys, property, typeName } from '../dist/schema.js'

test('names types', () => {
    assert.equal(typeName(z.string()), 'String')
    assert.equal(typeName(z.number().int()), 'Number')
    assert.equal(typeName(z.array(z.object({}))), 'Array<Object>')
    assert.equal(typeName(z.string().optional()), 'String | undefined')
    assert.equal(typeName(z.number().nullable()), 'Number | null')
    assert.equal(typeName(z.number().default(1)), 'Number')
    assert.equal(typeName(z.literal(['a', 1])), '"a" | 1')
    assert.equal(typeName(z.enum(['active', 'disabled'])), '"active" | "disabled"')
    assert.equal(typeName(z.record(z.string(), z.boolean())), 'Record<String, Boolean>')
    assert.equal(typeName(z.tuple([z.string(), z.number()])), '[String, Number]')
    assert.equal(typeName(z.date()), 'Date')
})

test('describes the output side of pipes', () => {
    assert.equal(typeName(z.string().transform(Number)), 'String')
    assert.equal(typeName(z.preprocess(String, z.number())), 'Number')
    assert.equal(typeName(z.stringbool()), 'Boolean')
})

test('navigates objects, arrays, records, intersections and unions', () => {
    const user = z.object({ name: z.string(), tags: z.array(z.string()) })
    assert.equal(typeName(property(user, 'name')!), 'String')
    assert.equal(property(user, 'missing'), undefined)
    assert.equal(typeName(property(property(user, 'tags')!, '0')!), 'String')
    assert.equal(typeName(property(z.record(z.string(), user), 'any')!), 'Object')
    assert.equal(typeName(property(z.intersection(user, z.object({ age: z.number() })), 'age')!), 'Number')
    assert.equal(
        typeName(property(z.discriminatedUnion('kind', [z.object({ kind: z.literal('a') }), z.object({ kind: z.literal('b') })]), 'kind')!),
        '"a" | "b"',
    )
    assert.deepEqual(
        keys(user.optional()).map(([key]) => key),
        ['name', 'tags'],
    )
    assert.equal(typeName(element(z.array(user).nullable())!), 'Object')
})

test('follows recursive schemas lazily', () => {
    interface Category {
        name: string
        children: Array<Category>
    }
    const category: z.ZodType<Category> = z.lazy(() => z.object({ name: z.string(), children: z.array(category) }))
    const grandchild = property(property(property(property(category, 'children')!, '0')!, 'children')!, '0')!
    assert.equal(typeName(property(grandchild, 'name')!), 'String')
    assert.match(typeName(category), /Object/)
})

test('works with zod/mini schemas', () => {
    const user = zm.object({ name: zm.string(), tags: zm.optional(zm.array(zm.string())) })
    assert.equal(typeName(property(user, 'name')!), 'String')
    assert.equal(typeName(property(user, 'tags')!), 'Array<String> | undefined')
})

test('reads descriptions through wrappers', () => {
    assert.equal(describe(z.string().describe('Full name').optional()), 'Full name')
    assert.equal(describe(z.string().meta({ description: 'Meta' })), 'Meta')
    assert.equal(describe(z.string()), undefined)
})

test('resolves the built-in properties it offers', () => {
    const tags = z.array(z.string())
    for (const [key, schema] of keys(tags)) assert.equal(typeName(property(tags, key)!), typeName(schema))
    assert.equal(typeName(property(tags, 'size')!), 'Number')
    assert.equal(typeName(property(z.string(), 'size')!), 'Number')
    assert.equal(typeName(property(z.tuple([z.string(), z.number()]), 'last')!), 'Number')
})

test('does not overflow on self-referencing unions and intersections', () => {
    const union: z.ZodType = z.lazy(() => z.union([z.object({ a: z.string() }), union.optional()]))
    assert.equal(typeName(property(union, 'a')!), 'String')
    assert.deepEqual(
        keys(union).map(([key]) => key),
        ['a'],
    )
    assert.equal(element(union), undefined)
    const intersection: z.ZodType = z.lazy(() => z.intersection(z.object({ a: z.string() }), intersection))
    assert.equal(property(intersection, 'missing'), undefined)
})

test('does not invent properties on strict objects', () => {
    assert.equal(property(z.strictObject({ a: z.string() }), 'missing'), undefined)
    assert.equal(typeName(property(z.looseObject({}).catchall(z.number()), 'any')!), 'Number')
})

test('describes success as a boolean', () => {
    assert.equal(typeName(z.success(z.string())), 'Boolean')
})
