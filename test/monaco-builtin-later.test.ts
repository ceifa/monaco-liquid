import assert from 'node:assert/strict'
import { test } from 'node:test'
import { registerLiquidLanguage } from '../dist/index.js'

// With the tree-shakeable entry, Monaco's own liquid definition can be registered after this library.
test('wins over the built-in liquid definition registered after us', async () => {
    const monaco = await import('monaco-editor/editor')
    registerLiquidLanguage(monaco)
    await import('monaco-editor/languages/definitions/liquid/register')

    const editor = monaco.editor.create(document.createElement('div'), { value: '', language: 'liquid' })
    await new Promise((resolve) => setTimeout(resolve, 100))
    editor.setValue('Discount 50')
    editor.setPosition({ lineNumber: 1, column: 12 })
    editor.trigger('keyboard', 'type', { text: '%' })
    assert.equal(editor.getValue(), 'Discount 50%')
    editor.dispose()
})
