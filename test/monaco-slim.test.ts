import assert from 'node:assert/strict'
import { test } from 'node:test'
import { registerLiquidLanguage } from '../dist/index.js'

test('works with the tree-shakeable monaco-editor/editor entry', async () => {
    const monaco = await import('monaco-editor/editor')
    const registration = registerLiquidLanguage(monaco)
    assert.ok(monaco.languages.getLanguages().some((language) => language.id === 'liquid'))

    const [line = []] = monaco.editor.tokenize('{{ x | upcase }}', 'liquid')
    assert.ok(line.some((token) => token.type === 'function.liquid'))

    const again = registerLiquidLanguage(monaco)
    registration.dispose()
    assert.ok(monaco.editor.tokenize('{{ x | upcase }}', 'liquid')[0]?.some((token) => token.type === 'function.liquid'))
    again.dispose()
})
