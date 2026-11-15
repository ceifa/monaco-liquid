import assert from 'node:assert/strict'
import { test } from 'node:test'
import { registerLiquidLanguage } from '../dist/index.js'

// The README creates the editor before registering, so Monaco's built-in liquid starts loading first.
test('wins over the built-in liquid definition when a model already exists', async () => {
    const monaco = await import('monaco-editor')
    const container = document.createElement('div')
    const editor = monaco.editor.create(container, { value: '{{ x | upcase }}', language: 'liquid' })
    registerLiquidLanguage(monaco)
    await new Promise((resolve) => setTimeout(resolve, 100))

    const [line = []] = monaco.editor.tokenize('{{ x | upcase }}', 'liquid')
    assert.ok(line.some((token) => token.type === 'function.liquid'))

    editor.setValue('Discount 50')
    editor.setPosition({ lineNumber: 1, column: 12 })
    editor.trigger('keyboard', 'type', { text: '%' })
    assert.equal(editor.getValue(), 'Discount 50%')
    editor.dispose()
})
