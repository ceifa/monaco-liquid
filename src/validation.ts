import { scan, type LiquidNode } from './scanner.js'

export interface Diagnostic {
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
    const { nodes } = scan(text)
    const diagnostics: Array<Diagnostic> = []
    const stack: Array<LiquidNode> = []
    // Open blocks per name, so an unmatched end tag doesn't search the whole stack.
    const openCount = new Map<string, number>()

    const blockTags = new Set(BLOCK_TAGS)
    for (const node of nodes) if (node.name.startsWith('end') && node.name.length > 3) blockTags.add(node.name.slice(3))

    const error = (message: string, start: number, end: number) => diagnostics.push({ message, start, end })

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
            if (!openCount.get(tag)) {
                error(`Unexpected '${name}', there is no open '${tag}'`, node.start, node.end)
                continue
            }
            const [, ...unclosed] = stack.splice(stack.findLastIndex((open) => open.name === tag))
            openCount.set(tag, openCount.get(tag)! - 1)
            for (const inner of unclosed.reverse()) {
                openCount.set(inner.name, openCount.get(inner.name)! - 1)
                error(`'${inner.name}' is not closed before '${name}'`, inner.start, inner.end)
            }
        } else if (blockTags.has(name)) {
            stack.push(node)
            openCount.set(name, (openCount.get(name) ?? 0) + 1)
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

    return diagnostics.sort((a, b) => a.start - b.start)
}
