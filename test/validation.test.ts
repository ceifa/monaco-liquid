import assert from 'node:assert/strict'
import { test } from 'node:test'
import { validate } from '../dist/validation.js'

const messages = (text: string) => validate(text).map((diagnostic) => diagnostic.message)

test('accepts well-formed templates', () => {
    const template = [
        '{%- if user -%}',
        '  {% for item in cart.items %}{{ item.title | upcase }}{% else %}empty{% endfor %}',
        '{% elsif guest %}',
        '  {% case status %}{% when "a" %}A{% else %}B{% endcase %}',
        '{%- endif -%}',
        '{% liquid',
        '  assign x = 1',
        '  echo x',
        '%}',
        '{% # inline comment %}',
    ].join('\n')
    assert.deepEqual(messages(template), [])
})

test('reports unclosed and unexpected block tags', () => {
    assert.deepEqual(messages('{% if a %}'), ["'if' is not closed, expected 'endif'"])
    assert.deepEqual(messages('{% endif %}'), ["Unexpected 'endif', there is no open 'if'"])
})

test('reports only the inner block when an end tag skips it', () => {
    assert.deepEqual(messages('{% if a %}{% for x in y %}{% endif %}'), ["'for' is not closed before 'endif'"])
})

test('handles tags spanning multiple lines', () => {
    assert.deepEqual(messages('{%\n  if a\n%}x{% endif %}'), [])
})

test('keeps open/close order within a line', () => {
    assert.deepEqual(messages('{% if a %}\n{% endif %}{% if b %}\n{% endif %}'), [])
    assert.deepEqual(messages('{% endif %}{% if b %}'), [
        "Unexpected 'endif', there is no open 'if'",
        "'if' is not closed, expected 'endif'",
    ])
})

test('ignores the content of comment and raw blocks', () => {
    assert.deepEqual(messages('{% comment %}{% if %}{{ {% endcomment %}'), [])
    assert.deepEqual(messages('{%- raw -%}{{ {% endif %}{%- endraw -%}'), [])
    assert.deepEqual(messages('{% raw %}{{'), ["'raw' is not closed, expected 'endraw'"])
})

test('does not treat liquid or layout as blocks', () => {
    assert.deepEqual(messages('{% liquid assign x = 1 %}{% layout "theme" %}'), [])
})

test('treats custom tags as blocks when their end tag appears', () => {
    assert.deepEqual(messages('{% highlight ruby %}x{% endhighlight %}'), [])
})

test('reports unclosed delimiters without corrupting the block stack', () => {
    assert.deepEqual(messages('{% if a %}{{ x {% endif %}'), ["'{{' is not closed, expected '}}'"])
    assert.deepEqual(messages('{% if a'), ["'{%' is not closed, expected '%}'"])
})

test('reports branches outside their block', () => {
    assert.deepEqual(messages('{% else %}'), ["'else' must be inside 'if' or 'unless' or 'case' or 'for'"])
    assert.deepEqual(messages('{% if a %}{% when 1 %}{% endif %}'), ["'when' must be inside 'case'"])
})

test('ignores closing delimiters in plain text, CSS and JSON', () => {
    assert.deepEqual(messages('<style>.a{width:100%}</style> {% schema %}{"a":{"b":{}}}{% endschema %} a }} b'), [])
})

test('ignores delimiters inside strings and inline comments', () => {
    assert.deepEqual(messages('{% assign open = "{{" %}{% if a %}{% endif %}'), [])
    assert.deepEqual(messages(`{{ "{%" | append: '}}' }}`), [])
    assert.deepEqual(messages('{% # this is {{ not liquid %}'), [])
})

test('handles many unmatched end tags without searching the whole stack', () => {
    const count = 20_000
    const started = performance.now()
    assert.equal(validate('{% if a %}'.repeat(count) + '{% endfor %}'.repeat(count)).length, count * 2)
    assert.ok(performance.now() - started < 1000)
})

test('does not crash on tag names that collide with object prototype keys', () => {
    assert.deepEqual(messages('{% constructor %}{% toString %}'), [])
})
