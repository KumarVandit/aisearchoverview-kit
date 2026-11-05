import { describe, expect, it } from 'vitest';
import { marked } from 'marked';
import { JSDOM } from 'jsdom';
import { loadNestedFixture } from '../../helpers/fixtures.js';
import { parseGoogleAiOverviewHtml } from '../../../src/google-search/parsers.js';
import { parseHtml } from '../../../src/google-search/html.js';
import { overviewMarkdown } from '../../../src/google-search/markdown.js';

const sourceUrl = 'https://www.google.com/search?q=captured+Overview';
const render = (markdown:string) => new JSDOM(marked.parse(markdown, {async:false})).window.document;

describe('GFM rendering preserves actual list ownership', () => {
  it.each([
    ['aio-induction-expanded-projection.html','Better Indoor Air Quality:','Produces no combustion byproducts','www.youtube.com/watch?v=nerZDE0d4_E'],
    ['aio-shoes-expanded-projection.html','HOKA Arahi','without feeling bulky','www.runweekly.com/best-running-shoes-for-flat-feet/'],
  ])('keeps the real item body and citation inside its rendered li: %s', (fixture, title, body, source) => {
    const result = parseGoogleAiOverviewHtml(loadNestedFixture('google-search',fixture),sourceUrl);
    const markdown = result.markdown!;
    const ast = marked.lexer(markdown);
    expect(ast.some(token => token.type === 'list' && token.raw.includes(title) && token.raw.includes(body))).toBe(true);
    const document = render(markdown);
    const item = [...document.querySelectorAll('li')].find(node => node.textContent?.includes(title));
    expect(item).toBeDefined();
    expect(item!.textContent).toContain(body);
    expect([...item!.querySelectorAll('a')].some(link => link.href.includes(source))).toBe(true);
    if (fixture.includes('shoes')) expect(item!.textContent).toContain('without feeling bulky');
  });

  it('keeps nested paragraphs, lists, quotes and code within a multi-digit ordered item', () => {
    const code='if ready:\n    run()  \n';
    const html='<ol start="12"><li><p>Parent</p><p>Continuation</p><ul><li>Nested</li></ul><blockquote><p>A quoted detail</p></blockquote><pre><code>'+code+'</code></pre></li><li>Next</li></ol><p>Outside the list.</p>';
    const markdown=overviewMarkdown(parseHtml(html),sourceUrl);
    const ast=marked.lexer(markdown);
    expect(ast[0]).toMatchObject({type:'list',ordered:true,start:12});
    const document=render(markdown), list=document.querySelector('ol')!;
    expect(list.children).toHaveLength(2);
    const first=list.children[0]!;
    expect(first.textContent).toContain('Continuation');
    expect(first.querySelector('ul li')?.textContent).toBe('Nested');
    expect(first.querySelector('blockquote')?.textContent).toContain('A quoted detail');
    expect(first.querySelector('pre code')?.textContent).toBe(code);
    expect(document.body.lastElementChild?.tagName).toBe('P');
    expect(document.body.lastElementChild?.textContent).toBe('Outside the list.');
  });
});
