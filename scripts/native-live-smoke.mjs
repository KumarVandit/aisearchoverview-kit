import {sdk} from '../dist/index.js';
import {createHash} from 'node:crypto';
import {appendFileSync} from 'node:fs';

// Explicit manual integration check; the default test suite never imports this file.
const queries = [
  'The Catherine',
  'apartments in Austin Texas',
  'apartments in austin texas for rent',
  'apartments in austin texas near the university',
  'apartments in austin texas downtown',
  'apartments in austin texas under $1000',
  'apartments in austin texas cheap',
];
const profile = {country:'US',language:'en',location:'Austin,Texas,United States',device:'desktop'};
const client = sdk({ipFamily:'ipv4',traffic:{maxConcurrent:1,minIntervalMs:15000,cooldownMs:60000}});
const summary = text => { if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY,text); };
const cell = value => String(value ?? '').replace(/[&<>|`\r\n]/g,character => ({'&':'&amp;','<':'&lt;','>':'&gt;','|':'&#124;','`':'&#96;','\r':' ','\n':' '})[character]);
const shortText = (value,max=100) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max);
function directPublisher(value) {
  try { const url = new URL(value); return url.protocol==='https:' && !/(^|\.)google\.[a-z.]+$/.test(url.hostname) ? url.hostname : undefined; }
  catch { return undefined; }
}
function sourceLocation(value) {
  try { const url = new URL(value); return {origin:url.origin,path:url.pathname}; }
  catch { return undefined; }
}
summary('## Native Linux live smoke\n\nSeven exact queries; US/en/Austin desktop; fresh native session per query; IPv4; no answer cache or publisher URL resolution. One attempt each, with 15-second spacing and at least 62 seconds after an access denial. No raw HTML, cookies, session URLs, or artifacts are retained.\n\n| Query | Overview | HTTP | Time (ms) | Text characters | Citations | Organic | Verified text + citations |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n');
let pause = 0, verified = 0;
for (const [index,query] of queries.entries()) {
  if (pause) await new Promise(resolve => setTimeout(resolve,pause));
  const started = performance.now(), startedAt = new Date().toISOString();
  let row;
  try {
    const data = await client.search.get(query,{...profile,resolveSources:false});
    const ai = data.result?.aioverview;
    const text = ai?.text?.trim() ?? '';
    const citations = ai?.sources ?? [];
    const validCitations = citations.filter(source => { try { return /^https?:$/.test(new URL(source.url).protocol); } catch { return false; } });
    const overviewStatus = data.metadata.aiOverview.status;
    const verifiedAnswer = overviewStatus==='present' && text.length>0 && validCitations.length>0;
    if (verifiedAnswer) verified++;
    row = {index:index+1,query,startedAt,elapsedMs:Math.round(performance.now()-started),httpStatus:data.metadata.httpStatus,searchStatus:data.metadata.searchStatus,overviewStatus,verifiedAnswer,textLength:text.length,textSha256:text?createHash('sha256').update(text).digest('hex'):undefined,textPrefix:shortText(text),citations:citations.length,validCitationUrls:validCitations.length,citationSample:citations.slice(0,3).map(source=>({title:shortText(source.label,80),publisher:directPublisher(source.url)})),organicCount:data.result?.organicResults?.length??0,sourceLocation:sourceLocation(data.metadata.sourceUrl),errorCode:data.error?.code,retryAfterMs:data.metadata.retryAfterMs};
    pause = overviewStatus==='blocked' ? Math.max(60000,data.metadata.retryAfterMs??0)+2000 : 15000;
  } catch (error) {
    // Error messages can contain URLs; record stable classification only.
    row = {index:index+1,query,startedAt,elapsedMs:Math.round(performance.now()-started),overviewStatus:'error',verifiedAnswer:false,errorKind:shortText(error?.kind??error?.name,40),errorCode:shortText(error?.code,50)};
    pause = 62000;
  }
  console.log(JSON.stringify(row));
  summary(`| ${cell(query)} | ${cell(row.overviewStatus)} | ${cell(row.httpStatus)} | ${row.elapsedMs} | ${row.textLength??0} | ${row.citations??0} | ${row.organicCount??0} | ${row.verifiedAnswer?'yes':'no'} |\n`);
}
summary(`\nVerified actual nonempty Overview text with citation URLs: **${verified}/${queries.length}**. Google can withhold an Overview or deny access; these outcomes remain explicit. This check is not an availability or latency guarantee.\n`);
console.log(JSON.stringify({type:'summary',verified,queries:queries.length,allVerified:verified===queries.length}));
if (verified!==queries.length) process.exitCode=1;
