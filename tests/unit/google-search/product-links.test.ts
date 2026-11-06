import { describe, expect, it } from 'vitest';
import { loadNestedFixture } from '../../helpers/fixtures.js';
import { parseGoogleAiOverviewHtml } from '../../../src/google-search/parsers.js';
import { parseGoogleSearchMonitorHtml } from '../../../src/google-search/monitor.js';
import { overviewMarkdown } from '../../../src/google-search/markdown.js';
import { parseHtml } from '../../../src/google-search/html.js';
import { overviewProductLinks } from '../../../src/google-search/related-links.js';

const url = 'https://www.google.com/search?q=running+shoes+for+flat+feet';

describe('observed product-viewer links in the real shoes Overview projection', () => {
  it('keeps product references separate from citations and removes observed accessibility helper prose', () => {
    const html = loadNestedFixture('google-search', 'aio-shoes-expanded-projection.html');
    const result = parseGoogleAiOverviewHtml(html, url);
    expect(result.status).toBe('present');
    expect(result.productLinks).toHaveLength(11);
    expect(result.sources).toHaveLength(7);
    expect(result.citationPills).toHaveLength(10);
    expect(result.productLinks?.map(link => link.position)).toEqual(Array.from({length:11}, (_, index) => index + 1));
    expect(result.productLinks?.[0]).toMatchObject({title:'Brooks Adrenaline GTS',productDocid:'9353914783649511094'});
    expect(result.productLinks?.at(-1)?.title).toBe('ASICS Gel-Nimbus');
    for (const product of result.productLinks ?? []) {
      expect(result.sources.some(source => source.url === product.url)).toBe(false);
      expect(new URL(product.url).searchParams.get('prds')).toContain('productDocid:' + product.productDocid);
      expect(product).not.toHaveProperty('productResultToken');
      expect(product).not.toHaveProperty('price');
    }
    expect(result.text).toContain('Brooks Adrenaline GTS');
    expect(result.markdown).toContain('- **[Brooks Adrenaline GTS](');
    expect(result.markdown).toContain(' (e.g., GTS 25)**:');
    expect(result.markdown).not.toMatch(/\*\*\s*\n/);
    const envelope = parseGoogleSearchMonitorHtml(html, {query:'running shoes for flat feet',country:'US',include:{aioverview:{markdown:true}}}, {sourceUrl:url});
    expect(envelope.success).toBe(true);
    if (envelope.success) expect(envelope.result.aioverview?.productLinks).toEqual(result.productLinks);
    expect(result.text).not.toContain('Go to product viewer dialog');
    expect(result.markdown).not.toContain('Go to product viewer dialog');
    expect(result).not.toHaveProperty('relatedLinks');
    expect(result).not.toHaveProperty('videos');
  });
});

describe('synthetic product-viewer ownership boundaries', () => {
  const anchor = (href:string, cid='123') => `<a data-link-behavior="nocobrowse" data-cid="${cid}" href="${href}">Product<span>Go to product viewer dialog for this item.</span></a>`;
  it('keeps nested inline wrappers inside emphasis and links from breaking Markdown delimiters', () => {
    const html='<p><strong><div><span><a href="https://example.com/product"><div>Product</div></a></span></div><span> (e.g., <div>Variant</div>)</span></strong>: Details</p>';
    expect(overviewMarkdown(parseHtml(html),url)).toBe('**[Product](https://example.com/product) (e.g., Variant)**: Details');
  });
  it('requires the observed marker and matching product identity on a safe Google viewer URL', () => {
    expect(overviewProductLinks(parseHtml(anchor('/search?ibp=oshop&amp;prds=productDocid:123')),url)).toHaveLength(1);
    for (const href of ['https://example.com/search?ibp=oshop&amp;prds=productDocid:123','https://name:password@www.google.com/search?ibp=oshop&amp;prds=productDocid:123','javascript:alert(1)','/search?ibp=oshop&amp;prds=productDocid:999','/search?q=product']) {
      expect(overviewProductLinks(parseHtml(anchor(href)),url)).toEqual([]);
    }
    expect(overviewProductLinks(parseHtml('<a href="/search?ibp=oshop&amp;prds=productDocid:123">Generic link</a>'),url)).toEqual([]);
  });
  it('ignores explicitly hidden, ad-owned and ignored-copy references', () => {
    const product=anchor('/search?ibp=oshop&amp;prds=productDocid:123');
    for (const marker of ['hidden','data-ignore-copy','data-text-ad','data-ta-slot']) expect(overviewProductLinks(parseHtml(`<div ${marker}>${product}</div>`),url)).toEqual([]);
  });
});
