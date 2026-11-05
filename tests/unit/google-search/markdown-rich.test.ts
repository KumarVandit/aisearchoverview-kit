import { describe, expect, it } from 'vitest';
import { decodeEntities, parseHtml, visibleText } from '../../../src/google-search/html.js';
import { overviewMarkdown } from '../../../src/google-search/markdown.js';
import { parseGoogleAiOverviewHtml } from '../../../src/google-search/parsers.js';

const SOURCE = 'https://www.google.com/search?q=synthetic+formatting+test';
const markdown = (html: string) => overviewMarkdown(parseHtml(html), SOURCE);
const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

describe('synthetic rich-content Markdown contracts', () => {
  it('preserves preformatted code indentation, blank lines, tabs and trailing spaces', () => {
    const code = 'if ready:\n    print("yes")  \n\n\n\tprint("tabbed")\nelse:\n    print("no")\n';
    const html = `<p>Example</p><pre><code class="language-python">${escapeHtml(code)}</code></pre><p>Afterwards</p>`;
    expect(markdown(html)).toBe(`Example\n\n\`\`\`python\n${code}\`\`\`\n\nAfterwards`);
  });

  it('chooses a fence longer than every backtick run in adversarial code', () => {
    const code = 'const example = "```";\n`````\n<script>alert("literal")</script>\n';
    const result = markdown(`<pre><code>${escapeHtml(code)}</code></pre>`);
    expect(result).toBe('``````\n' + code + '``````');
    expect(result.split('\n').filter(line => line === '``````')).toHaveLength(2);
  });

  it('keeps code markup inert and accepts only a simple language token', () => {
    const html = '<pre><code class="language-js`unsafe">&lt;b&gt;code&lt;/b&gt;<span hidden>Hidden</span><span>\n  safe()</span><br>end()</code></pre>';
    expect(markdown(html)).toBe('```\n<b>code</b>\n  safe()\nend()\n```');
  });

  it('uses safe inline code delimiters and retains meaningful interior spaces', () => {
    expect(markdown('<p>Use <code>a`b</code> or <code>`edge`</code>.</p>')).toBe('Use ``a`b`` or `` `edge` ``.');
    expect(markdown('<code>  spaced  </code>')).toBe('`   spaced   `');
    expect(markdown('<code>first\nsecond</code>')).toBe('`first second`');
  });

  it('retains basic table headers, cell boundaries, caption and irregular row widths', () => {
    const html = '<p>Comparison</p><table><caption>Prices</caption><thead><tr><th>Model</th><th>Price</th><th>Range</th></tr></thead><tbody><tr><td>A</td><td>$10</td><td>20 mi</td></tr><tr><td>B</td><td>$30</td></tr></tbody></table><p>End.</p>';
    expect(markdown(html)).toBe('Comparison\n\nPrices\n\n| Model | Price | Range |\n| --- | --- | --- |\n| A | $10 | 20 mi |\n| B | $30 |  |\n\nEnd.');
    expect(visibleText(parseHtml(html))).toBe('Comparison Prices Model Price Range A $10 20 mi B $30 End.');
  });

  it('escapes pipe characters and safely retains nested inline and block cell content', () => {
    const html = '<table><tr><th>A|B</th><th>Example</th></tr><tr><td><strong>Bold</strong><p>Next line</p><a href="https://example.com/a(b)">a link</a></td><td><code>x | y</code><br>&lt;script&gt;literal&lt;/script&gt;</td></tr></table>';
    const result = markdown(html);
    expect(result).toContain('| A\\|B | Example |');
    expect(result).toContain('**Bold**<br>Next line<br>[a link](https://example.com/a%28b%29)');
    expect(result).toContain('`x \\| y`<br>\\<script\\>literal\\</script\\>');
    expect(result).not.toContain('<script>literal');
  });

  it('keeps all headerless table rows and does not duplicate nested table rows', () => {
    expect(markdown('<table><tr><td>A</td><td>1</td></tr><tr><td>B</td><td>2</td></tr></table>')).toBe('|  |  |\n| --- | --- |\n| A | 1 |\n| B | 2 |');
    const nested = markdown('<table><tr><th>Outer</th></tr><tr><td>Before<table><tr><td>Inner A</td><td>Inner B</td></tr></table>After</td></tr></table>');
    expect(nested).toBe('| Outer |\n| --- |\n| Before Inner A Inner B After |');
  });

  it('excludes explicitly hidden table rows and cell content', () => {
    const html = '<table><tr><th>Visible</th></tr><tr hidden><td>Hidden row</td></tr><tr><td>A<span aria-hidden="true">Hidden span</span><span style="display:none">Hidden style</span></td></tr></table>';
    expect(markdown(html)).toBe('| Visible |\n| --- |\n| A |');
  });

  it('honors ordered starts, explicit item values and nested list counters', () => {
    const html = '<ol start="3"><li>Third</li><li value="9">Ninth<ul><li>A nested detail</li></ul><ol start="4"><li>Nested fourth</li><li>Nested fifth</li></ol></li><li>Tenth</li></ol>';
    const result = markdown(html);
    expect(result).toMatch(/^3\. Third$/m);
    expect(result).toMatch(/^9\. Ninth$/m);
    expect(result).toMatch(/^  - A nested detail$/m);
    expect(result).toMatch(/^  4\. Nested fourth$/m);
    expect(result).toMatch(/^  5\. Nested fifth$/m);
    expect(result).toMatch(/^10\. Tenth$/m);
  });

  it('handles reversed ordered lists and rejects malformed ordinal attributes', () => {
    expect(markdown('<ol reversed><li>Three</li><li>Two</li><li>One</li></ol>')).toMatch(/^3\. Three\n\n2\. Two\n\n1\. One$/);
    expect(markdown('<ol start="javascript:alert(1)"><li value="3x">First</li><li>Second</li></ol>')).toBe('1. First\n\n2. Second');
    expect(markdown('<ol start="0"><li>Zero</li><li>One</li></ol>')).toBe('0. Zero\n\n1. One');
  });

  it('emits HTTP image Markdown with escaped alt text and keeps captions', () => {
    const html = '<figure><img src="https://example.com/a(b).png" alt="A [diagram] &lt;unsafe&gt;"><figcaption>Actual caption</figcaption></figure>';
    expect(markdown(html)).toBe('![A \\[diagram\\] \\<unsafe\\>](https://example.com/a%28b%29.png)\n\nActual caption');
    expect(visibleText(parseHtml(html))).toBe('A [diagram] <unsafe> Actual caption');
    expect(markdown('<img src="/images/diagram.png" alt="Relative">')).toBe('![Relative](https://www.google.com/images/diagram.png)');
  });

  it.each(['javascript:alert(1)', 'data:image/svg+xml,<svg onload=alert(1)>', 'file:///tmp/private.png', 'https://name:password@example.com/image.png'])('does not emit an image for an unsafe URL: %s', src => {
    const html = `<img src="${escapeHtml(src)}" alt="A useful label">`;
    expect(markdown(html)).toBe('A useful label');
  });

  it('does not emit hidden media or invent a source for an empty src', () => {
    const html = '<div hidden><img src="https://example.com/a.png" alt="Hidden parent"></div><img aria-hidden="true" src="https://example.com/b.png" alt="Hidden image"><img style="visibility:hidden" src="https://example.com/c.png" alt="Hidden style"><img src="" alt="No URL">';
    expect(markdown(html)).toBe('No URL');
  });

  it('decodes common mathematical entities while leaving unsupported names unchanged', () => {
    const text = 'x &le; 5 &times; 2; &Delta; &delta;; &frac12; &rarr; &infin; &unknown;';
    expect(decodeEntities(text)).toBe('x ≤ 5 × 2; Δ δ; ½ → ∞ &unknown;');
    expect(markdown(`<p>${text}</p>`)).toBe('x ≤ 5 × 2; Δ δ; ½ → ∞ &unknown;');
  });

  it('carries synthetic table and code formatting through the Overview parser without merging plain-text cells', () => {
    const body = '<table><tr><th>A</th><th>B</th></tr><tr><td>10</td><td>20</td></tr></table><pre><code>if ready:\n    run()</code></pre>';
    const html = `<div id="m-x-content"><div jscontroller="pJyqm" jsmodel="FRbqE"><h2>AI Overview</h2><div data-container-id="main-col">${body}</div></div></div>`;
    const result = parseGoogleAiOverviewHtml(html, SOURCE);
    expect(result.status).toBe('present');
    expect(result.text).toBe('A B 10 20 if ready: run()');
    expect(result.markdown).toContain('| 10 | 20 |');
    expect(result.markdown).toContain('```\nif ready:\n    run()\n```');
  });
});
