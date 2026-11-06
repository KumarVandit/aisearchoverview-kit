import {describe,it,expect,vi} from 'vitest';
import {googleChallengeRedirect} from '../../../src/google-search/access.js';
import {coordinatedSearchFetch} from '../../../src/transport/coordinator.js';
import {sdk} from '../../../src/workers.js';
const source='https://www.google.com/search?q=apartments';
describe('Google access-denial redirects',()=>{
  it.each([301,302,303,307,308])('recognizes a same-origin challenge with status %s',status=>{
    expect(googleChallengeRedirect(source,status,'/sorry/index?continue=private')).toBe(true);
  });
  it.each(['https://evil.example/sorry/index','https://www.google.com.evil.example/sorry/index','https://user:pass@www.google.com/sorry/index','/search?q=other','/sorry-looking-page'])('does not infer a Google challenge from %s',location=>{
    expect(googleChallengeRedirect(source,302,location)).toBe(false);
  });
  it('does not mistake a non-redirect response or untrusted source for a challenge redirect',()=>{
    expect(googleChallengeRedirect(source,200,'/sorry/index')).toBe(false);
    expect(googleChallengeRedirect('https://evil.example/search',302,'/sorry/index')).toBe(false);
  });
  it('returns blocked with the actual 302 status and makes no CAPTCHA or retry requests',async()=>{
    const fetcher=vi.fn<typeof fetch>().mockResolvedValue(new Response('Moved',{status:302,headers:{Location:'https://www.google.com/sorry/index?private=value'}}));
    const result=await sdk({fetch:fetcher}).overview.get('apartments');
    expect(result.status).toBe('blocked');expect(result.sources).toEqual([]);
    expect(result.metadata.httpStatus).toBe(302);
    expect(JSON.stringify(result)).not.toContain('private=value');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]![1]!.redirect).toBe('manual');
  });
  it('pauses queued calls after a challenge redirect without retrying it',async()=>{
    const upstream=vi.fn<typeof fetch>().mockResolvedValue(new Response('Moved',{status:302,headers:{Location:'/sorry/index'}}));
    const fetcher=coordinatedSearchFetch(upstream,{maxConcurrent:1,minIntervalMs:0,cooldownMs:60000});
    const first=fetcher(source),second=fetcher(source);
    const rejected=expect(second).rejects.toMatchObject({kind:'http',status:302});
    expect((await first).status).toBe(302);await rejected;
    expect(upstream).toHaveBeenCalledTimes(1);
  });

});
