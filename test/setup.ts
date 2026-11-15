// Lets monaco-editor's ESM build run under Node: stub its CSS imports and provide a DOM.
import { registerHooks } from 'node:module'
import { JSDOM } from 'jsdom'

registerHooks({
    load(url, context, nextLoad) {
        return url.endsWith('.css') ? { format: 'module', source: '', shortCircuit: true } : nextLoad(url, context)
    },
})

const { window } = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true })
window.matchMedia ??= (query: string) =>
    ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }) as never

// Only what monaco touches at import and editor creation; copying every window property confuses its platform detection.
const keys = [
    'window',
    'document',
    'navigator',
    'self',
    'location',
    'customElements',
    'getComputedStyle',
    'matchMedia',
    'requestAnimationFrame',
    'cancelAnimationFrame',
    'getSelection',
    'MutationObserver',
    'ResizeObserver',
    'DOMParser',
    'XMLSerializer',
    'NodeFilter',
    'Node',
    'Element',
    'HTMLElement',
    'HTMLDivElement',
    'HTMLSpanElement',
    'HTMLCanvasElement',
    'HTMLIFrameElement',
    'HTMLInputElement',
    'HTMLTextAreaElement',
    'SVGElement',
    'ShadowRoot',
    'DocumentFragment',
    'Text',
    'Range',
    'DOMRect',
    'Image',
    'Event',
    'UIEvent',
    'FocusEvent',
    'MouseEvent',
    'PointerEvent',
    'WheelEvent',
    'KeyboardEvent',
    'InputEvent',
    'DragEvent',
    'ClipboardEvent',
    'CustomEvent',
] as const
const globals = globalThis as Record<string, unknown>
globals.CSS ??= { escape: (value: string) => value.replace(/[^\w-]/g, (char) => `\\${char}`), supports: () => false }
const source = window as unknown as Record<string, unknown>
for (const key of keys) if (globals[key] === undefined && source[key] !== undefined) globals[key] = source[key]
