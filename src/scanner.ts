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
// Quoted strings are matched (and skipped) so delimiters inside them don't count.
const OUTPUT_BOUNDARY = /"[^"\n]*"|'[^'\n]*'|\}\}|\{\{|\{%/g
const TAG_BOUNDARY = /"[^"\n]*"|'[^'\n]*'|%\}|\{\{|\{%/g
const INLINE_COMMENT_BOUNDARY = /%\}/g
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

    // Whichever comes first: our closer, or a new opener, which means this one was never closed.
    const inlineComment = kind === 'tag' && /\s*#/y.test(text.slice(contentStart, contentStart + 64))
    const boundary = kind === 'output' ? OUTPUT_BOUNDARY : inlineComment ? INLINE_COMMENT_BOUNDARY : TAG_BOUNDARY
    boundary.lastIndex = contentStart
    let next = boundary.exec(text)
    while (next && (next[0][0] === '"' || next[0][0] === "'")) next = boundary.exec(text)
    const stop = next ? next.index : text.length
    const closed = next?.[0] === closer

    const end = closed ? stop + 2 : stop
    let contentEnd = stop
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
