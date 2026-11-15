import { scan, type LiquidNode } from './scanner.js'

export interface Diagnostic {
    severity: 'error' | 'warning'
    message: string
    start: number
    end: number
}

/** Tags that need a matching `end<tag>`. Custom tags count too once an `end<tag>` for them appears. */
export const BLOCK_TAGS = [
    'if',
    'unless',
    'case',
    'for',
    'tablerow',
    'capture',
    'comment',
    'raw',
    'doc',
    'ifchanged',
    'form',
    'paginate',
    'schema',
    'style',
    'stylesheet',
    'javascript',
    'block',
]

const BRANCH_PARENTS = new Map([
    ['else', ['if', 'unless', 'case', 'for']],
    ['elsif', ['if', 'unless']],
    ['when', ['case']],
])

export function validate(text: string): Array<Diagnostic> {
    const { nodes, rawBodies } = scan(text)
    const diagnostics: Array<Diagnostic> = []
    const stack: Array<LiquidNode> = []

    const blockTags = new Set(BLOCK_TAGS)
    for (const node of nodes) if (node.name.startsWith('end') && node.name.length > 3) blockTags.add(node.name.slice(3))

    const error = (message: string, start: number, end: number, severity: Diagnostic['severity'] = 'error') =>
        diagnostics.push({ severity, message, start, end })

    for (const node of nodes) {
        if (!node.closed) {
            const [open, close] = node.kind === 'output' ? ['{{', '}}'] : ['{%', '%}']
            error(`'${open}' is not closed, expected '${close}'`, node.start, node.start + 2)
            continue
        }
        if (node.kind !== 'tag') continue

        const name = node.name
        if (name.startsWith('end') && blockTags.has(name.slice(3))) {
            const tag = name.slice(3)
            const index = stack.findLastIndex((open) => open.name === tag)
            if (index === -1) {
                error(`Unexpected '${name}', there is no open '${tag}'`, node.start, node.end)
                continue
            }
            for (const unclosed of stack.splice(index).slice(1).reverse()) {
                error(`'${unclosed.name}' is not closed before '${name}'`, unclosed.start, unclosed.end)
            }
        } else if (blockTags.has(name)) {
            stack.push(node)
        } else if (BRANCH_PARENTS.has(name)) {
            const parents = BRANCH_PARENTS.get(name)!
            const parent = stack.at(-1)?.name
            if (!parent || !parents.includes(parent)) {
                error(`'${name}' must be inside ${parents.map((tag) => `'${tag}'`).join(' or ')}`, node.start, node.end)
            }
        }
    }

    for (const unclosed of stack.reverse()) {
        error(`'${unclosed.name}' is not closed, expected 'end${unclosed.name}'`, unclosed.start, unclosed.end)
    }

    // Stray closers are plain text to Liquid, but usually a typo.
    const spans = [...nodes, ...rawBodies].sort((a, b) => a.start - b.start)
    let position = 0
    for (const span of [...spans, { start: text.length, end: text.length }]) {
        const gap = text.slice(position, span.start)
        for (const match of gap.matchAll(/\}\}|%\}/g)) {
            const start = position + match.index
            error(`'${match[0]}' has no matching opening delimiter`, start, start + 2, 'warning')
        }
        position = Math.max(position, span.end)
    }

    return diagnostics.sort((a, b) => a.start - b.start)
}
