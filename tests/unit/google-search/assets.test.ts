import { describe, expect, it } from 'vitest';
import { parseGoogleAiOverviewHtml } from '../../../src/google-search/parsers.js';
import { parseGoogleSearchMonitorHtml } from '../../../src/google-search/monitor.js';
import { loadNestedFixture } from '../../helpers/fixtures.js';
const url = 'https://www.google.com/search?q=induction+vs+gas';
const fixture = loadNestedFixture('google-search', 'aio-induction-expanded-projection.html');

describe('real rendered inline media and source-card capture', () => {
  it('extracts three displayed inline video cards, not every source-rail YouTube link', () => {
    const answer = parseGoogleAiOverviewHtml(fixture, url);
    expect(answer.videos).toHaveLength(3);
    expect(answer.videos?.[0]).toEqual({url:'https://www.youtube.com/watch?v=gbh3Y6e7p5g&t=9',title:"Induction vs. Gas 2026: Don't Decide Until You Watch This",source:'YouTube',platform:'youtube',channel:'Yale Appliance',duration:'5:59',segmentDurationSeconds:160,startTimeSeconds:9,date:'5 months ago'});
    expect(answer.videos?.[1]).toMatchObject({duration:'8:33',channel:'History of Simple Things',startTimeSeconds:169});
    expect(answer.videos?.[2]).toMatchObject({duration:'5:29',channel:'HS Design Studio',startTimeSeconds:22});
    expect(answer.videos?.every(video=>video.thumbnail===undefined)).toBe(true);
    expect(answer.sources[0]?.description).toBe('Induction vs. Gas Superiority: Induction cooktops are generally superior to gas for home use, with many users reporting advantages...');
    for(const pill of answer.citationPills??[]) expect(pill.description).toBe(answer.sources[pill.position-1]?.description);
  });
  it('forwards actual asset metadata through the monitoring adapter', () => {
    const result = parseGoogleSearchMonitorHtml(fixture,{query:'induction vs gas',country:'US',include:{aioverview:true}},{sourceUrl:url});
    expect(result.success).toBe(true);
    if (!result.success) throw new Error('Expected fixture response');
    expect(result.result.aioverview?.videos).toHaveLength(3);
    expect(result.result.aioverview?.sources[0]?.description).toContain('Induction vs. Gas Superiority');
  });
});

const card=(attributes='',href='https://www.youtube.com/watch?v=actual')=>`<div role="listitem" ${attributes}><div data-ignore-copy><div role="button" aria-label="A title by A channel on YouTube. Play on Google. - 1 minute 5 seconds"><img src="https://i.ytimg.com/actual.jpg"></div><a href="${href}"></a></div></div>`;
const overview=(body:string)=>`<div id="m-x-content"><h2>AI Overview</h2><div data-container-id="main-col"><p>A real answer.</p>${body}</div></div>`;
describe('synthetic boundaries for observed inline-video shape',()=>{
  it('only emits a safely addressed inline player card and its observed thumbnail',()=>{
    const result=parseGoogleAiOverviewHtml(overview(card()),url);
    expect(result.videos?.[0]).toMatchObject({duration:'1:05',thumbnail:'https://i.ytimg.com/actual.jpg'});
    expect(result.videos?.[0]).not.toHaveProperty('startTimeSeconds');
    expect(result.videos?.[0]).not.toHaveProperty('segmentDurationSeconds');
  });
  it.each(['data-text-ad','data-ta-slot','hidden','aria-hidden="true"'])('excludes sponsored or hidden video cards: %s',attributes=>{
    expect(parseGoogleAiOverviewHtml(overview(card(attributes)),url).videos).toBeUndefined();
  });
  it.each(['javascript:alert(1)','https://name:password@www.youtube.com/watch?v=x','https://example.com/watch?v=x'])('rejects unrecognized player URLs: %s',href=>{
    expect(parseGoogleAiOverviewHtml(overview(card('',href)),url).videos).toBeUndefined();
  });
  it('does not promote ordinary YouTube links or source-rail cards into inline videos',()=>{
    const html=overview('<p><a href="https://www.youtube.com/watch?v=reference">A citation</a></p>')+`<div data-container-id="rhs-col">${card()}</div>`;
    expect(parseGoogleAiOverviewHtml(html,url).videos).toBeUndefined();
  });
});
