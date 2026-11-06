import {describe,it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {sdk} from '../../src/index.js';
import {locationHint} from '../../src/google-search/location.js';
const fixture=readFileSync(new URL('../fixtures/google-search/simplified-organic.html',import.meta.url),'utf8');
describe('simplified organic results and full response options',()=>{
  it('extracts captured organic headings, snippets and displayed links from main',()=>{
    const result=sdk().search.parse(fixture,{sourceUrl:'https://www.google.com/search?q=how+does+intermittent+fasting+work'});
    expect(result.success).toBe(true);if(!result.success)throw Error('Expected results');
    expect(result.result.organicResults).toHaveLength(2);
    expect(result.result.organicResults?.[0]).toMatchObject({position:1,title:'Intermittent Fasting: What Is It, And How Does It Work?',snippet:expect.any(String),displayedLink:expect.stringContaining('hopkinsmedicine.org'),redirectLink:expect.stringContaining('CAESsynthetic')});
    expect(result.result).not.toHaveProperty('aioverview');
  });
  it('encodes the Austin location hint and rejects unsupported profiles before fetching',async()=>{
    expect(locationHint('Austin, Texas, United States')).toBe('w+CAIQICIaQXVzdGluLFRleGFzLFVuaXRlZCBTdGF0ZXM=');
    const fetcher=vi.fn<typeof fetch>().mockResolvedValue(new Response(fixture));
    await sdk({fetch:fetcher}).search.get('query',{location:'Austin,Texas,United States',device:'desktop'});
    expect(new URL(String(fetcher.mock.calls[0]![0])).searchParams.get('uule')).toBe(locationHint('Austin,Texas,United States'));
    fetcher.mockClear();await expect(sdk({fetch:fetcher}).search.get('query',{device:'mobile' as 'desktop'})).rejects.toMatchObject({kind:'validation'});expect(fetcher).not.toHaveBeenCalled();
  });
  it('resolves organic links and includes URL-resolution time and counts in the response',async()=>{
    const fetcher=vi.fn<typeof fetch>(async input=>new URL(String(input)).pathname==='/search'?new Response(fixture):new Response('Moved',{status:302,headers:{Location:'https://example.com/'+new URL(String(input)).searchParams.get('q')}}));
    const result=await sdk({fetch:fetcher}).search.get('query',{resolveSources:true});if(!result.success)throw Error('Expected results');
    expect(result.result.organicResults?.every(item=>item.link.startsWith('https://example.com/'))).toBe(true);
    expect(result.metadata.resolution).toMatchObject({attempted:2,resolved:2,unresolved:0});
    expect(result.metadata.timing!.totalMs).toBeGreaterThanOrEqual(result.metadata.resolution!.durationMs);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it('does not count advertisement destinations or Overview headings as organic results',()=>{
    const html=fixture.replace('</div></body>','<div class="Gx5Zad xpd"><a href="https://www.googleadservices.com/pagead/aclk?adurl=https://ads.example/"><h3>Sponsored result</h3></a></div><section aria-label="AI Overview"><a href="https://citation.example/"><h3>Citation card</h3></a><p>Overview answer.</p></section></div></body>');
    const result=sdk().search.parse(html,{sourceUrl:'https://www.google.com/search?q=test'});if(!result.success)throw Error('Expected results');expect(result.result.organicResults).toHaveLength(2);
  });

});
