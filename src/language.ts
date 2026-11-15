import type * as monaco from 'monaco-editor'
import { BLOCK_TAGS } from './validation.js'

export const TAGS = [
    'assign',
    'break',
    'capture',
    'case',
    'comment',
    'continue',
    'cycle',
    'decrement',
    'doc',
    'echo',
    'else',
    'elsif',
    'for',
    'if',
    'ifchanged',
    'include',
    'increment',
    'liquid',
    'raw',
    'render',
    'tablerow',
    'unless',
    'when',
]

export const FILTERS = [
    'abs',
    'append',
    'at_least',
    'at_most',
    'base64_decode',
    'base64_encode',
    'base64_url_safe_decode',
    'base64_url_safe_encode',
    'capitalize',
    'ceil',
    'compact',
    'concat',
    'date',
    'default',
    'divided_by',
    'downcase',
    'escape',
    'escape_once',
    'find',
    'find_index',
    'first',
    'floor',
    'has',
    'join',
    'last',
    'lstrip',
    'map',
    'minus',
    'modulo',
    'newline_to_br',
    'plus',
    'prepend',
    'reject',
    'remove',
    'remove_first',
    'remove_last',
    'replace',
    'replace_first',
    'replace_last',
    'reverse',
    'round',
    'rstrip',
    'size',
    'slice',
    'sort',
    'sort_natural',
    'split',
    'squish',
    'strip',
    'strip_html',
    'strip_newlines',
    'sum',
    'times',
    'truncate',
    'truncatewords',
    'uniq',
    'upcase',
    'url_decode',
    'url_encode',
    'where',
]

export const EXPRESSION_KEYWORDS = ['and', 'or', 'contains', 'in', 'with', 'as', 'for', 'limit', 'offset', 'reversed', 'cols', 'range']

export const CONSTANTS = ['true', 'false', 'nil', 'null', 'empty', 'blank']

const CONTROL_TAGS = ['if', 'elsif', 'else', 'unless', 'case', 'when', 'for', 'tablerow', 'break', 'continue', 'ifchanged']

const blockPattern = BLOCK_TAGS.join('|')

const tagName = (next?: string) => ({
    cases: { '@controlTags': { token: 'keyword.control', next }, '@default': { token: 'keyword', next } },
})

export const languageConfiguration: monaco.languages.LanguageConfiguration = {
    wordPattern: /-?\d*\.\d\w*|[A-Za-z_][\w-]*|[^\s`~!@#$%^&*()=+[{\]}\\|;:'",.<>/?-]+/,
    comments: {
        blockComment: ['{% comment %}', '{% endcomment %}'],
    },
    brackets: [
        ['{%', '%}'],
        ['{{', '}}'],
        ['[', ']'],
        ['(', ')'],
    ],
    autoClosingPairs: [
        { open: '{{', close: '}}' },
        { open: '{%', close: '%}' },
        { open: '[', close: ']' },
        { open: '(', close: ')' },
        { open: '"', close: '"', notIn: ['string'] },
        { open: "'", close: "'", notIn: ['string'] },
    ],
    surroundingPairs: [
        { open: '"', close: '"' },
        { open: "'", close: "'" },
        { open: '[', close: ']' },
        { open: '(', close: ')' },
    ],
    folding: {
        markers: {
            start: new RegExp(String.raw`\{%-?\s*(?:${blockPattern})\b`),
            end: new RegExp(String.raw`\{%-?\s*end(?:${blockPattern})\s*-?%\}`),
        },
    },
}

export const monarchLanguage: monaco.languages.IMonarchLanguage = {
    defaultToken: '',
    tokenPostfix: '.liquid',
    controlTags: [...CONTROL_TAGS, ...CONTROL_TAGS.map((tag) => `end${tag}`)],
    filters: FILTERS,
    expressionKeywords: EXPRESSION_KEYWORDS,
    constants: CONSTANTS,

    tokenizer: {
        root: [
            [/(\{%-?)(\s*)(comment)(\s*)(-?%\})/, ['delimiter.tag', '', 'keyword', '', { token: 'delimiter.tag', next: '@commentBody' }]],
            [/(\{%-?)(\s*)(doc)(\s*)(-?%\})/, ['delimiter.tag', '', 'keyword', '', { token: 'delimiter.tag', next: '@docBody' }]],
            [/(\{%-?)(\s*)(raw)(\s*)(-?%\})/, ['delimiter.tag', '', 'keyword', '', { token: 'delimiter.tag', next: '@rawBody' }]],
            { include: '@liquid' },
            [/<!--/, 'comment.html', '@htmlComment'],
            [/(<\/?)([\w:-]+)/, ['delimiter.html', { token: 'tag.html', next: '@htmlTag' }]],
            [/[^<{]+/, ''],
            [/[<{]/, ''],
        ],

        // Shared by every state where Liquid can start, including inside HTML tags and attribute values.
        liquid: [
            [/(\{%-?)(\s*)(#)/, ['delimiter.tag', '', { token: 'comment', next: '@inlineComment' }]],
            [/(\{%-?)(\s*)(liquid)\b/, ['delimiter.tag', '', { token: 'keyword', next: '@liquidTag' }]],
            [/(\{%-?)(\s*)([A-Za-z_]\w*)/, ['delimiter.tag', '', tagName('@tag')]],
            [/\{%-?/, 'delimiter.tag', '@tag'],
            [/\{\{-?/, 'delimiter.output', '@output'],
        ],

        output: [[/-?\}\}/, 'delimiter.output', '@pop'], { include: '@expression' }],

        tag: [[/-?%\}/, 'delimiter.tag', '@pop'], { include: '@expression' }],

        // `{% liquid %}`: one tag per line, no delimiters.
        liquidTag: [[/-?%\}/, 'delimiter.tag', '@pop'], [/^(\s*)([A-Za-z_]\w*)/, ['', tagName()]], { include: '@expression' }],

        expression: [
            [/\s+/, ''],
            [/\|/, 'delimiter', '@filter'],
            [/"[^"]*"|'[^']*'/, 'string'],
            [/-?\d+(?:\.\d+)?/, 'number'],
            [/==|!=|<>|<=|>=|<|>|=/, 'operator'],
            [/\.\./, 'operator'],
            [
                /[A-Za-z_][\w-]*\??/,
                {
                    cases: {
                        '@constants': 'constant',
                        '@expressionKeywords': 'keyword.operator',
                        '@default': 'variable',
                    },
                },
            ],
            [/[[\]().,:]/, 'delimiter'],
            [/./, ''],
        ],

        // After `|`: the filter name, then its arguments until the next `|` or the closing delimiter.
        filter: [
            [/^\s*[A-Za-z_]/, '@rematch', '@pop'],
            [/\s+/, ''],
            [/[A-Za-z_]\w*/, { token: 'function', switchTo: '@filterArgs' }],
            [/-?%\}|-?\}\}/, '@rematch', '@pop'],
            [/./, '', '@pop'],
        ],

        filterArgs: [
            [/\|/, { token: 'delimiter', switchTo: '@filter' }],
            [/-?%\}|-?\}\}/, '@rematch', '@pop'],
            [/^(\s*)([A-Za-z_]\w*)/, '@rematch', '@pop'],
            [/([A-Za-z_][\w-]*)(\s*)(:)/, ['attribute.name', '', 'delimiter']],
            { include: '@expression' },
        ],

        inlineComment: [
            [/-?%\}/, 'delimiter.tag', '@pop'],
            [/[^%-]+/, 'comment'],
            [/./, 'comment'],
        ],

        commentBody: [
            [/(\{%-?)(\s*)(endcomment)(\s*)(-?%\})/, ['delimiter.tag', '', 'keyword', '', { token: 'delimiter.tag', next: '@pop' }]],
            [/[^{]+/, 'comment'],
            [/./, 'comment'],
        ],

        docBody: [
            [/(\{%-?)(\s*)(enddoc)(\s*)(-?%\})/, ['delimiter.tag', '', 'keyword', '', { token: 'delimiter.tag', next: '@pop' }]],
            [/@\w+/, 'comment.doc.tag'],
            [/[^{@]+/, 'comment.doc'],
            [/./, 'comment.doc'],
        ],

        rawBody: [
            [/(\{%-?)(\s*)(endraw)(\s*)(-?%\})/, ['delimiter.tag', '', 'keyword', '', { token: 'delimiter.tag', next: '@pop' }]],
            [/[^{]+/, 'string.raw'],
            [/./, 'string.raw'],
        ],

        htmlComment: [[/-->/, 'comment.html', '@pop'], { include: '@liquid' }, [/[^-{]+/, 'comment.html'], [/./, 'comment.html']],

        htmlTag: [
            [/\/?>/, 'delimiter.html', '@pop'],
            { include: '@liquid' },
            [/"/, 'attribute.value', '@htmlDoubleQuoted'],
            [/'/, 'attribute.value', '@htmlSingleQuoted'],
            [/[\w:.-]+/, 'attribute.name'],
            [/=/, 'delimiter.html'],
            [/\s+/, ''],
            [/./, ''],
        ],

        htmlDoubleQuoted: [
            [/"/, 'attribute.value', '@pop'],
            { include: '@liquid' },
            [/[^"{]+/, 'attribute.value'],
            [/./, 'attribute.value'],
        ],

        htmlSingleQuoted: [
            [/'/, 'attribute.value', '@pop'],
            { include: '@liquid' },
            [/[^'{]+/, 'attribute.value'],
            [/./, 'attribute.value'],
        ],
    },
}
