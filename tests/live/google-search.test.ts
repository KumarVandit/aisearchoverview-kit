import { describe, expect, it } from 'vitest';
import { googleSearch } from '../../src/google-search.js';

const enabled = process.env.GOOGLE_SEARCH_LIVE === '1' || process.env.AI_SEARCH_LIVE === '1';

describe.skipIf(!enabled)('Google Search anonymous public surfaces', () => {
  it('retrieves actual autocomplete suggestions without requesting Search', async () => {
    const response = await googleSearch().suggest('typescript');
    expect(response.query).toBe('typescript');
    expect(response.suggestions.length).toBeGreaterThan(0);
    expect(response.suggestions.every(item => typeof item === 'string')).toBe(true);
  }, 30_000);

  it('distinguishes actual result extraction from access challenges', async () => {
    const response = await googleSearch().search('what is typescript');
    console.info(JSON.stringify({ searchStatus: response.status, aiOverviewStatus: response.aiOverview.status, organicCount: response.organic.length }));
    expect(['results', 'empty', 'blocked', 'javascript-required', 'consent-required']).toContain(response.status);
    if (response.status === 'results') expect(response.organic.length > 0 || response.aiOverview.status === 'present').toBe(true);
    if (response.status === 'blocked') expect(response.aiOverview.status).toBe('blocked');
    if (response.status === 'javascript-required') expect(response.aiOverview.status).toBe('unverified');
  }, 30_000);
});
