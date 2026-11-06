import {readFileSync} from 'node:fs';
import {describe,it,expect,vi} from 'vitest';
import {AiModeNamespace} from '../../src/namespaces/ai-mode.js';
const captured=readFileSync(new URL('../fixtures/ai-mode/local-expanded-projection.html',import.meta.url),'utf8');
const sourceUrl='https://www.google.com/search?q=best+breakfast+restaurants+in+Austin+Texas&udm=50&hl=en&gl=us';
describe('AI Mode snapshot and explicit HTTP retrieval',()=>{
 it('extracts actual captured local places, image assets and sources without account chrome',()=>{
  const fetcher=vi.fn<typeof fetch>();const r=new AiModeNamespace(fetcher).parse(captured,{sourceUrl});
  expect(r.status).toBe('present');expect(r.turns).toHaveLength(1);expect(r.places).toHaveLength(6);expect(r.sources).toHaveLength(8);expect(r.images).toHaveLength(6);
  expect(r.places?.[0]).toMatchObject({title:'Paperboy East',index:1,rating:4.6,reviews:'2.0K',type:'Brunch',priceLevel:'$20–30',status:'Open',website:'https://www.eatpaperboy.com/',address:'1203 E 11th St, Austin, TX 78702'});
  expect(r.markdown).toContain('#### Trendy Patios & Elevated Comfort');expect(r.markdown).toContain('https://lh3.googleusercontent.com/');expect(r.markdown).not.toContain('Related results');expect(r.text).not.toContain('Google Account');expect(fetcher).not.toHaveBeenCalled();
 });
 it('preserves both actual captured conversation turns and exposes the vegetarian follow-up',()=>{
  const html=readFileSync(new URL('../fixtures/ai-mode/local-followup-projection.html',import.meta.url),'utf8');
  const r=new AiModeNamespace(fetch).parse(html,{sourceUrl});
  expect(r.turns).toHaveLength(2);expect(r.turns.map(t=>t.prompt)).toEqual(['best breakfast restaurants in Austin Texas','Which of these have vegetarian breakfast options?']);expect(r.turns[0]?.places).toHaveLength(6);expect(r.turns[0]?.sources).toHaveLength(8);
  expect(r.text).toContain('dedicated vegetarian breakfast options');expect(r.text).toBe(r.turns[1]?.text);expect(r.places).toHaveLength(6);expect(r.sources).toHaveLength(9);expect(r.images).toHaveLength(6);
  expect(r.turns[1]?.places?.map(p=>[p.title,p.type,p.priceLevel,p.status])).toEqual([['Paperboy East','Brunch','$20–30','Open'],['Citizen All Day','Restaurant','$20–30','Open'],['Magnolia Cafe','Cafe','$10–20','Open'],["Phoebe's Downtown",'Breakfast','$10–20','Open'],['The Omelettry','Breakfast','$10–20','Open'],['Bird Bird Biscuit','Sandwich','$10–20','Open']]);
  for(const turn of r.turns){
    expect(turn.markdown).not.toMatch(/Copied to clipboard|Failed to copy|Share public link|A copy of this chat|Thanks for letting us know|Google may use account|Privacy Policy/);
    expect(turn.text).not.toContain('A copy of this chat');
    expect(turn.markdown).toContain('[Directions](https://www.google.com/maps/dir/');
    expect(turn.markdown).toContain('[Website](');
    expect(turn.markdown).toContain('$20–30 · Brunch');
    expect(turn.markdown).toContain('Rated 4.6 out of 5, 2.0K reviews.');
    expect(turn.markdown).toMatch(/Open · (?:Austin, TX|Central East Austin)/);
    expect(turn.markdown).not.toMatch(/(?<!!)\[\]\(/);
    expect(turn.markdown).not.toMatch(/^#{1,6}\s*$/m);
  }
  for(const place of r.places??[]){expect(place).not.toHaveProperty('placeId');expect(place).not.toHaveProperty('phone');}
 });
 it('gives an access challenge precedence over stale answer markup',()=>{
  const r=new AiModeNamespace(fetch).parse(captured+'<p>Our systems have detected unusual traffic</p>',{sourceUrl});
  expect(r.status).toBe('blocked');expect(r.turns).toHaveLength(0);expect(r).not.toHaveProperty('text');
 });
 it('requires the actual Mode route and answer turn markers; AIO is not Mode',()=>{
  const client=new AiModeNamespace(fetch);expect(client.parse(captured,{sourceUrl:'https://www.google.com/search?q=test'}).status).toBe('unverified');expect(client.parse('<div data-container-id="main-col">unscoped</div>',{sourceUrl}).status).toBe('unverified');
 });
 it('keeps synthetic multi-turn snapshots ordered and exposes latest content',()=>{
  const fixture='<div data-scope-id="turn"><div data-container-id="main-col"><p>First answer.</p></div></div><div data-scope-id="turn"><div data-container-id="main-col"><p>Second answer.</p></div></div>';
  const r=new AiModeNamespace(fetch).parse(fixture,{sourceUrl,markdown:false});expect(r.turns.map(t=>t.text)).toEqual(['First answer.','Second answer.']);expect(r.text).toBe('Second answer.');expect(r).not.toHaveProperty('markdown');expect(r.turns[0]).not.toHaveProperty('prompt');expect(r.turns[1]).not.toHaveProperty('prompt');
 });
 it('requests udm=50 and retains an unverified response without falling back to AIO',async()=>{
  const fetcher=vi.fn<typeof fetch>().mockResolvedValue(new Response('<html>No answer</html>'));const r=await new AiModeNamespace(fetcher).get('test');
  expect(new URL(String(fetcher.mock.calls[0]?.[0])).searchParams.get('udm')).toBe('50');expect(r.status).toBe('unverified');expect(fetcher).toHaveBeenCalledTimes(1);
 });
 it('does not accept a blocked response as an answer, even when it includes old answer HTML',async()=>{
  const r=await new AiModeNamespace(vi.fn<typeof fetch>().mockResolvedValue(new Response(captured,{status:429}))).get('test');expect(r.status).toBe('blocked');expect(r.turns).toHaveLength(0);expect(r.sources).toHaveLength(0);expect(r).not.toHaveProperty('text');expect(r).not.toHaveProperty('places');
 });
 it('rejects empty queries and preserves caller cancellation',async()=>{
  const client=new AiModeNamespace(vi.fn());await expect(client.get('')).rejects.toMatchObject({kind:'validation'});const controller=new AbortController();const reason=new Error('stop');controller.abort(reason);await expect(client.get('test',{signal:controller.signal})).rejects.toBe(reason);
 });
});
