import { scan, type LiquidNode } from './scanner.js'
import { element, forloop, primitive, property, tablerowloop, type Schema, type Schemas } from './schema.js'

export type CursorContext =
    | { kind: 'text' }
    /** Right after `{%`, where a tag name goes. */
    | { kind: 'tag' }
    /** Right after `|`, where a filter name goes. */
    | { kind: 'filter' }
    /** Inside an expression. `path` holds the segments before the one being typed (`a.b.` → `['a', 'b']`). */
    | { kind: 'expression'; path: Array<string> | null; scope: Schemas }

const IDENTIFIER = String.raw`[A-Za-z_][\w-]*`
const PATH_SEGMENT = String.raw`(?:\.${IDENTIFIER}|\[\d+\]|\[(?:"[^"]*"|'[^']*')\])`
const TRAILING_PATH = new RegExp(String.raw`(${IDENTIFIER}${PATH_SEGMENT}*)(\.?)$`)
const PATH = new RegExp(String.raw`^${IDENTIFIER}${PATH_SEGMENT}*$`)

export function getCursorContext(text: string, offset: number, schemas: Schemas = {}): CursorContext {
    const { nodes, rawBodies } = scan(text)
    if (rawBodies.some((body) => offset > body.start && offset <= body.end)) return { kind: 'text' }

    const node = nodes.find((node) => offset >= node.contentStart && offset <= node.contentEnd)
    if (!node || node.name === '#') return { kind: 'text' }

    const before = text.slice(node.contentStart, offset)
    if (insideString(before)) return { kind: 'text' }
    if (node.kind === 'tag' && /^\s*\w*$/.test(before)) return { kind: 'tag' }
    if (/\|\s*\w*$/.test(before)) return { kind: 'filter' }

    const [, expression, dot] = TRAILING_PATH.exec(before) ?? []
    const segments = expression === undefined ? [] : splitPath(expression)
    const path = dot ? segments : segments.slice(0, -1)
    return { kind: 'expression', path: path.length > 0 ? path : null, scope: getScope(nodes, offset, schemas) }
}

/** Returns the full path under the cursor, cut after the segment that contains `offset`. */
export function getPathAt(text: string, offset: number): Array<string> | null {
    const { nodes } = scan(text)
    const node = nodes.find((node) => offset >= node.contentStart && offset < node.contentEnd)
    if (!node || node.name === '#') return null

    const content = text.slice(node.contentStart, node.contentEnd)
    const local = offset - node.contentStart
    const pattern = new RegExp(`${IDENTIFIER}${PATH_SEGMENT}*`, 'g')
    for (const match of content.matchAll(pattern)) {
        if (local < match.index || local >= match.index + match[0].length) continue
        if (insideString(content.slice(0, match.index))) return null
        // Keep segments up to the one under the cursor.
        const end = /^[\w-]*/.exec(content.slice(local))![0].length + local
        return splitPath(content.slice(match.index, end))
    }
    return null
}

/** Variables visible at `offset`: the given schemas plus loop variables and assignments made before it. */
export function getScope(nodes: Array<LiquidNode>, offset: number, schemas: Schemas): Schemas {
    const scope: Schemas = { ...schemas }
    // Loop variables are restored at the end of the loop; assignments made inside it stay, as in Liquid.
    const loops: Array<{ tag: string; saved: Record<string, Schema | undefined> }> = []

    for (const node of nodes) {
        if (node.end > offset) break
        if (node.kind !== 'tag' || !node.closed) continue

        if (node.name === 'for' || node.name === 'tablerow') {
            const loopName = node.name === 'for' ? 'forloop' : 'tablerowloop'
            const [, variable, collection] = /^\s*([A-Za-z_][\w-]*)\s+in\s+(\S+)/.exec(node.markup) ?? []
            const names = variable === undefined ? [loopName] : [loopName, variable]
            loops.push({ tag: node.name, saved: Object.fromEntries(names.map((name) => [name, scope[name]])) })
            if (variable !== undefined && collection !== undefined) {
                const schema = resolve(scope, collection)
                setVariable(scope, variable, schema && element(schema))
            }
            scope[loopName] = node.name === 'for' ? forloop : tablerowloop
        } else if ((node.name === 'endfor' || node.name === 'endtablerow') && loops.at(-1)?.tag === node.name.slice(3)) {
            for (const [name, schema] of Object.entries(loops.pop()!.saved)) setVariable(scope, name, schema)
        } else if (node.name === 'assign') {
            const [, variable, value, filters] = /^\s*([A-Za-z_][\w-]*)\s*=\s*([^|]*?)\s*(\|.*)?$/s.exec(node.markup) ?? []
            // Filters can change the type, so only a plain path assignment keeps it.
            if (variable !== undefined) setVariable(scope, variable, filters || value === undefined ? undefined : resolve(scope, value))
        } else if (node.name === 'capture') {
            const [, variable] = /^\s*([A-Za-z_][\w-]*)/.exec(node.markup) ?? []
            if (variable !== undefined) scope[variable] = primitive('string')
        }
    }

    return scope
}

function setVariable(scope: Schemas, name: string, schema: Schema | undefined) {
    if (schema) scope[name] = schema
    else delete scope[name]
}

/** Resolves a path expression (`cart.items[0]`) against the scope. */
export function resolve(scope: Schemas, expression: string): Schema | undefined {
    const trimmed = expression.trim()
    return PATH.test(trimmed) ? resolvePath(scope, splitPath(trimmed)) : undefined
}

export function resolvePath(scope: Schemas, [root, ...rest]: Array<string>): Schema | undefined {
    if (root === undefined || !Object.hasOwn(scope, root)) return undefined
    let schema: Schema | undefined = scope[root]
    for (const segment of rest) {
        if (!schema) return undefined
        schema = property(schema, segment)
    }
    return schema
}

export function splitPath(path: string): Array<string> {
    return [...path.matchAll(/[A-Za-z_][\w-]*|\[(\d+)\]|\[(?:"([^"]*)"|'([^']*)')\]/g)].map(
        (match) => match[1] ?? match[2] ?? match[3] ?? match[0],
    )
}

function insideString(text: string): boolean {
    let quote: string | null = null
    for (const char of text) {
        if (quote) {
            if (char === quote) quote = null
        } else if (char === '"' || char === "'") {
            quote = char
        }
    }
    return quote !== null
}
