/** A `{{ … }}` or `{% … %}` region. Offsets are into the scanned text; `end` is exclusive. */
export interface LiquidNode {
    kind: 'output' | 'tag'
    start: number
    /** After the opening delimiter (and its `-`). */
    contentStart: number
    /** Before the closing delimiter (and its `-`), or where scanning stopped when unclosed. */
    contentEnd: number
    end: number
    closed: boolean
    /** Tag name (`if`, `endfor`, `#` for inline comments); empty for outputs and nameless tags. */
    name: string
    /** Raw text after the tag name. */
    markup: string
}

export interface RawBody {
    /** The tag that opened the body (`comment`, `raw` or `doc`). */
    name: string
    start: number
    end: number
    closed: boolean
}

export interface ScanResult {
    nodes: Array<LiquidNode>
    /** Bodies whose content is not Liquid code (`comment`, `raw`, `doc`). */
    rawBodies: Array<RawBody>
}

const OPENER = /\{\{|\{%/g
const RAW_BODY_TAGS = new Set(['comment', 'raw', 'doc'])

export function scan(text: string): ScanResult {
    const nodes: Array<LiquidNode> = []
    const rawBodies: Array<RawBody> = []
    let position = 0

    while (position < text.length) {
        OPENER.lastIndex = position
        const opener = OPENER.exec(text)
        if (!opener) break

        const node = readNode(text, opener.index)
        nodes.push(node)
        position = node.end

        if (node.kind === 'tag' && node.closed && RAW_BODY_TAGS.has(node.name)) {
            const closer = new RegExp(`\\{%-?\\s*end${node.name}\\s*-?%\\}`, 'g')
            closer.lastIndex = position
            const end = closer.exec(text)
            rawBodies.push({ name: node.name, start: position, end: end ? end.index : text.length, closed: end !== null })
            if (!end) break
            position = end.index
        }
    }

    return { nodes, rawBodies }
}

function readNode(text: string, start: number): LiquidNode {
    const kind = text[start + 1] === '{' ? 'output' : 'tag'
    const closer = kind === 'output' ? '}}' : '%}'
    let contentStart = start + 2
    if (text[contentStart] === '-') contentStart++

    // A new opener before the closer means this one was never closed.
    OPENER.lastIndex = contentStart
    const nextOpener = OPENER.exec(text)
    const limit = nextOpener ? nextOpener.index : text.length
    const closerIndex = text.indexOf(closer, contentStart)
    const closed = closerIndex !== -1 && closerIndex < limit

    const end = closed ? closerIndex + 2 : limit
    let contentEnd = closed ? closerIndex : limit
    if (closed && contentEnd > contentStart && text[contentEnd - 1] === '-') contentEnd--

    const content = text.slice(contentStart, contentEnd)
    const header = kind === 'tag' ? /^\s*(#|[A-Za-z_]\w*)/.exec(content) : null

    return {
        kind,
        start,
        contentStart,
        contentEnd,
        end,
        closed,
        name: header?.[1] ?? '',
        markup: header ? content.slice(header[0].length) : content,
    }
}
