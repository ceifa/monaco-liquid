import type * as monaco from 'monaco-editor'
import { languageConfiguration, monarchLanguage } from './language.js'
import { createCompletionProvider, createHoverProvider, type MonacoApi } from './providers.js'
import type { Schemas } from './schema.js'
import { validate } from './validation.js'

export type { MonacoApi } from './providers.js'
export type { Schema, Schemas } from './schema.js'

export const LANGUAGE_ID = 'liquid'

const MARKER_OWNER = 'liquid'

const modelSchemas = new WeakMap<monaco.editor.ITextModel, Schemas>()
const modelBindings = new WeakMap<monaco.editor.ITextModel, monaco.IDisposable>()
const registrations = new WeakMap<MonacoApi['languages'], { users: number; dispose(): void }>()

/**
 * Registers the Liquid language: syntax highlighting, language configuration, completion and hover.
 * Safe to call more than once; the providers are removed when every returned disposable has been disposed.
 */
export function registerLiquidLanguage(api: MonacoApi): monaco.IDisposable {
    // Keyed by `languages`, which is shared by the `monaco-editor` and `monaco-editor/editor` entry points.
    let registration = registrations.get(api.languages)
    if (!registration) {
        registration = register(api)
        registrations.set(api.languages, registration)
    }
    registration.users++

    let disposed = false
    return {
        dispose() {
            if (disposed) return
            disposed = true
            if (--registration.users === 0) {
                registrations.delete(api.languages)
                registration.dispose()
            }
        },
    }
}

function register(api: MonacoApi) {
    const { languages } = api
    if (!languages.getLanguages().some((language) => language.id === LANGUAGE_ID)) {
        languages.register({ id: LANGUAGE_ID, extensions: ['.liquid'], aliases: ['Liquid', 'liquid'] })
    }

    let syntax: Array<monaco.IDisposable> = []
    const applySyntax = () => {
        for (const disposable of syntax) disposable.dispose()
        syntax = [
            languages.setMonarchTokensProvider(LANGUAGE_ID, monarchLanguage),
            languages.setLanguageConfiguration(LANGUAGE_ID, languageConfiguration),
        ]
    }
    applySyntax()

    const getSchemas = (model: monaco.editor.ITextModel) => modelSchemas.get(model)
    const providers = [
        languages.registerCompletionItemProvider(LANGUAGE_ID, createCompletionProvider(api, getSchemas)),
        languages.registerHoverProvider(LANGUAGE_ID, createHoverProvider(api, getSchemas)),
    ]

    let disposed = false
    // The full `monaco-editor` bundle ships its own basic `liquid` definition. It loads lazily and, once loaded,
    // replaces our language configuration (and our tokenizer, if a model was already open). Its extension point
    // carries the `loader` it uses; re-apply ours once that has settled, now and whenever a liquid model first appears.
    const builtin = languages.getLanguages().find((language) => language.id === LANGUAGE_ID) as { loader?: () => Promise<unknown> }
    const reapplyAfterBuiltin = async () => {
        if (typeof builtin?.loader !== 'function') return
        try {
            await builtin.loader()
        } catch {
            return
        }
        await new Promise((resolve) => setTimeout(resolve))
        if (!disposed) applySyntax()
    }
    void reapplyAfterBuiltin()
    const encountered = languages.onLanguageEncountered(LANGUAGE_ID, () => void reapplyAfterBuiltin())

    return {
        users: 0,
        dispose() {
            disposed = true
            for (const disposable of [...syntax, ...providers, encountered]) disposable.dispose()
        },
    }
}

/**
 * Validates Liquid syntax in `model` as it changes and provides schema-aware completion and hover.
 * Calling it again for the same model replaces the previous binding. Dispose to stop and clear the markers.
 */
export function setModelLiquidValidation(
    api: MonacoApi,
    model: monaco.editor.ITextModel,
    schemas: Schemas = {},
    options: { debounceMs?: number } = {},
): monaco.IDisposable {
    const { debounceMs = 300 } = options
    modelBindings.get(model)?.dispose()
    modelSchemas.set(model, schemas)

    const runValidation = () => {
        const markers = validate(model.getValue()).map((diagnostic): monaco.editor.IMarkerData => {
            const start = model.getPositionAt(diagnostic.start)
            const end = model.getPositionAt(diagnostic.end)
            return {
                severity: diagnostic.severity === 'error' ? api.MarkerSeverity.Error : api.MarkerSeverity.Warning,
                message: diagnostic.message,
                startLineNumber: start.lineNumber,
                startColumn: start.column,
                endLineNumber: end.lineNumber,
                endColumn: end.column,
            }
        })
        api.editor.setModelMarkers(model, MARKER_OWNER, markers)
    }

    let timeout: ReturnType<typeof setTimeout> | undefined
    const cancel = () => clearTimeout(timeout)
    const listeners = [
        model.onDidChangeContent(() => {
            cancel()
            timeout = setTimeout(runValidation, debounceMs)
        }),
        model.onWillDispose(() => binding.dispose()),
    ]
    runValidation()

    const binding: monaco.IDisposable = {
        dispose() {
            if (modelBindings.get(model) !== binding) return
            modelBindings.delete(model)
            modelSchemas.delete(model)
            cancel()
            for (const listener of listeners) listener.dispose()
            api.editor.setModelMarkers(model, MARKER_OWNER, [])
        },
    }
    modelBindings.set(model, binding)
    return binding
}
