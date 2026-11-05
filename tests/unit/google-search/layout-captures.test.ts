import { describe, expect, it } from 'vitest';
import { JSDOM } from 'jsdom';
import { sdk } from '../../../src/index.js';
import { loadNestedFixture } from '../../helpers/fixtures.js';

describe('real rendered Overview projections, captured 2026-11-05', () => {
  it('preserves every captured Python code block verbatim and the comparison table', () => {
    const html = loadNestedFixture('google-search', 'aio-python-expanded-projection.html');
    const dom = new JSDOM(html);
    const blocks = [...dom.window.document.querySelectorAll('pre')].map(node => node.textContent!);
    const result = sdk().overview.parse(html, { sourceUrl: 'https://www.google.com/search?q=python+list+comprehension+examples' });
    expect(result.status).toBe('present');
    if (result.status !== 'present') throw new Error('Expected captured Overview');
    expect(blocks).toHaveLength(5);
    for (const block of blocks) expect(result.markdown).toContain('```\n' + block + (block.endsWith('\n') ? '' : '\n') + '```');
    expect(result.markdown).toContain('| Goal | Syntax Structure | Example |\n| --- | --- | --- |');
    expect(result.markdown).toContain('| **Filtering items out** | `[expr for item in iterable if cond]` | `[x for x in nums if x > 5]` |');
    expect(result.sources).toHaveLength(8);
    expect(result.citationPills).toHaveLength(7);
    expect(result.markdown).not.toContain('Copy code');
    expect(result.text).not.toContain('Google Account');
    dom.window.close();
  });

  it('preserves comparison headings, lists and citation source positions without claiming video objects', () => {
    const html = loadNestedFixture('google-search', 'aio-induction-expanded-projection.html');
    const result = sdk().overview.parse(html, { sourceUrl: 'https://www.google.com/search?q=induction+vs+gas+stove+pros+and+cons' });
    expect(result.status).toBe('present');
    if (result.status !== 'present') throw new Error('Expected captured Overview');
    expect(result.markdown).toContain('### Induction Cooktops');
    expect(result.markdown).toContain('### Gas Cooktops');
    expect(result.markdown).toContain('- **Cookware Requirements:**');
    expect(result.sources).toHaveLength(14);
    expect(result.citationPills).toHaveLength(9);
    for (const pill of result.citationPills ?? []) expect(result.sources[pill.position - 1]?.url).toBe(pill.url);
    expect(result).not.toHaveProperty('videos');
  });
});
