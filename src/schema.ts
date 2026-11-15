import type * as z from 'zod/v4/core'

/** Any Zod 4 schema (classic `zod` or `zod/mini`). */
export type Schema = z.$ZodType

export type Schemas = Record<string, Schema>

type Def = z.$ZodTypes['_zod']['def']

// Read structurally instead of `instanceof`, so schemas from any copy of zod (or zod/mini) work.
const defOf = (schema: Schema) => schema._zod.def as Def

const WRAPPERS = new Set(['optional', 'nullable', 'default', 'prefault', 'nonoptional', 'catch', 'readonly'])

// Bounds recursion through self-referencing unions and intersections built with `z.lazy`.
const MAX_DEPTH = 16

export function unwrap(schema: Schema): Schema {
    const seen = new Set<Schema>()
    let current = schema
    for (let inner = innerOf(current); inner && !seen.has(inner); inner = innerOf(current)) {
        seen.add(current)
        current = inner
    }
    return current
}

/** The schema of `schema[key]`, or undefined if it can't be known. */
export function property(schema: Schema, key: string, depth = 0): Schema | undefined {
    if (depth > MAX_DEPTH) return undefined
    const def = defOf(unwrap(schema))
    switch (def.type) {
        case 'object':
            if (Object.hasOwn(def.shape, key)) return def.shape[key]
            return def.catchall && defOf(def.catchall).type !== 'never' ? def.catchall : undefined
        case 'record':
            return def.valueType
        case 'array':
            return /^\d+$/.test(key) ? def.element : builtin(schema, key)
        case 'tuple':
            return /^\d+$/.test(key) ? (def.items[Number(key)] ?? def.rest ?? undefined) : builtin(schema, key)
        case 'string':
            return builtin(schema, key)
        case 'intersection':
            return property(def.left, key, depth + 1) ?? property(def.right, key, depth + 1)
        case 'union':
            return unionOf(def.options.map((option) => property(option, key, depth + 1)))
        default:
            return undefined
    }
}

/** The schema of the items yielded by `{% for x in schema %}`. */
export function element(schema: Schema, depth = 0): Schema | undefined {
    if (depth > MAX_DEPTH) return undefined
    const def = defOf(unwrap(schema))
    switch (def.type) {
        case 'array':
            return def.element
        case 'tuple':
            return unionOf([...def.items, def.rest ?? undefined])
        case 'union':
            return unionOf(def.options.map((option) => element(option, depth + 1)))
        default:
            return undefined
    }
}

/** Keys offered by completion; each resolves through `property`. */
export function keys(schema: Schema, depth = 0): Array<[string, Schema]> {
    if (depth > MAX_DEPTH) return []
    const def = defOf(unwrap(schema))
    switch (def.type) {
        case 'object':
            return Object.entries(def.shape)
        case 'intersection':
            return mergeKeys([keys(def.left, depth + 1), keys(def.right, depth + 1)])
        case 'union':
            return mergeKeys(def.options.map((option) => keys(option, depth + 1)))
        case 'array':
        case 'tuple':
        case 'string':
            return ['size', 'first', 'last'].flatMap((key) => {
                const value = builtin(schema, key)
                return value ? [[key, value] as [string, Schema]] : []
            })
        default:
            return []
    }
}

/** Liquid's built-in properties of arrays and strings. */
function builtin(schema: Schema, key: string): Schema | undefined {
    const def = defOf(unwrap(schema))
    if (key === 'size') return primitive('number')
    if (def.type === 'tuple' && key === 'last' && !def.rest) return def.items.at(-1)
    return key === 'first' || key === 'last' ? element(schema) : undefined
}

function mergeKeys(groups: Array<Array<[string, Schema]>>): Array<[string, Schema]> {
    const merged = new Map<string, Schema>()
    for (const group of groups) for (const [key, value] of group) if (!merged.has(key)) merged.set(key, value)
    return [...merged]
}

type Registry = { get(schema: Schema): { description?: unknown } | undefined }

/** The `.describe()`/`.meta()` description, looked up through wrappers like `.optional()`. */
export function describe(schema: Schema): string | undefined {
    // zod keeps descriptions in a registry shared across copies through this global, not on the schema.
    const registry = (globalThis as { __zod_globalRegistry?: Registry }).__zod_globalRegistry
    const seen = new Set<Schema>()
    for (let current: Schema | undefined = schema; current && !seen.has(current); current = innerOf(current)) {
        seen.add(current)
        // Before zod 4.2 there is no shared registry, but classic schemas still expose `.description`.
        const description = registry?.get(current)?.description ?? (current as { description?: unknown }).description
        if (typeof description === 'string') return description
    }
    return undefined
}

function innerOf(schema: Schema): Schema | undefined {
    const def = defOf(schema)
    if (WRAPPERS.has(def.type)) return (def as z.$ZodOptionalDef).innerType
    // `_zod.innerType` caches the getter's result, keeping recursive schemas referentially stable.
    if (def.type === 'lazy') return (schema._zod as { innerType?: Schema }).innerType ?? def.getter()
    if (def.type === 'pipe') return defOf(def.out).type === 'transform' ? def.in : def.out
    return undefined
}

export function typeName(schema: Schema, depth = 0): string {
    if (depth > 4) return '…'
    const def = defOf(schema)
    const next = (inner: Schema) => typeName(inner, depth + 1)
    switch (def.type) {
        case 'optional':
            return `${next(def.innerType)} | undefined`
        case 'nullable':
            return `${next(def.innerType)} | null`
        case 'default':
        case 'prefault':
        case 'nonoptional':
        case 'catch':
        case 'readonly':
        case 'lazy':
        case 'pipe':
            return next(unwrap(schema))
        case 'array':
            return `Array<${next(def.element)}>`
        case 'tuple':
            return `[${[...def.items.map(next), ...(def.rest ? [`...${next(def.rest)}[]`] : [])].join(', ')}]`
        case 'record':
            return `Record<${next(def.keyType)}, ${next(def.valueType)}>`
        case 'object':
            return 'Object'
        case 'union':
            return def.options.map(next).join(' | ')
        case 'intersection':
            return `${next(def.left)} & ${next(def.right)}`
        case 'literal':
            return def.values.map(formatLiteral).join(' | ')
        case 'enum':
            return Object.values(def.entries).map(formatLiteral).join(' | ')
        case 'string':
        case 'template_literal':
            return 'String'
        case 'number':
        case 'nan':
            return 'Number'
        case 'bigint':
            return 'BigInt'
        case 'boolean':
        case 'success':
            return 'Boolean'
        case 'date':
            return 'Date'
        case 'null':
            return 'null'
        case 'undefined':
        case 'void':
            return 'undefined'
        default:
            return 'Unknown'
    }
}

const formatLiteral = (value: unknown) => (typeof value === 'string' ? JSON.stringify(value) : String(value))

/** Builds a minimal schema-shaped value; enough for this module, which only reads `_zod.def`. */
const fake = (def: object) => ({ _zod: { def } }) as unknown as Schema

export const primitive = (type: 'string' | 'number' | 'boolean') => fake({ type })

export const objectOf = (shape: Record<string, Schema>) => fake({ type: 'object', shape })

/** A union of the known options, or the single option, or undefined when none is known. */
function unionOf(candidates: Array<Schema | undefined>): Schema | undefined {
    const options = [...new Set(candidates)].filter((option) => option !== undefined)
    return options.length > 1 ? fake({ type: 'union', options }) : options[0]
}

const loopShape = {
    index: primitive('number'),
    index0: primitive('number'),
    rindex: primitive('number'),
    rindex0: primitive('number'),
    first: primitive('boolean'),
    last: primitive('boolean'),
    length: primitive('number'),
}

export const forloop = objectOf({ ...loopShape, name: primitive('string') })

export const tablerowloop = objectOf({
    ...loopShape,
    col: primitive('number'),
    col0: primitive('number'),
    col_first: primitive('boolean'),
    col_last: primitive('boolean'),
    row: primitive('number'),
})
