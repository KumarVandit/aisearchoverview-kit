import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { sdk, runtimePaths } from '../src/index.js';
import { embeddedSearchFetch } from '../src/transport/embedded.js';
import { analyzeHtmlTransfers } from '../src/google-search/transfers.js';

const standardQueries = [
  ['science', 'why does the ocean look blue'],
  ['household-steps', 'how to descale an electric kettle'],
  ['coding-python', 'python list comprehension examples'],
  ['coding-typescript', 'typescript interface vs type differences'],
  ['product-comparison', 'induction vs gas stove pros and cons'],
  ['gardening', 'best indoor plants for low light rooms'],
  ['health-comparison', 'seasonal allergies vs common cold symptoms'],
  ['finance-explainer', 'how does a mortgage escrow account work'],
  ['legal-steps', 'how to register an LLC in California'],
  ['travel-itinerary', 'what to do in Kyoto in three days'],
  ['local-places', 'best breakfast restaurants in Austin Texas'],
  ['recipes', 'easy vegetarian high protein dinner recipes'],
  ['shopping', 'running shoes for flat feet'],
  ['math', 'what is compound interest with an example'],
  ['travel-season', 'best time to visit Yellowstone National Park'],
  ['repair', 'how to fix a dishwasher that is not draining'],
  ['gardening-diagnosis', 'why are my houseplant leaves turning yellow'],
  ['education', 'benefits of spaced repetition for learning'],
  ['science-diagram', 'how do solar panels work'],
  ['navigation-control', 'OpenAI'],
] as const;
const targetedQueries = [
  ['code-question', 'how do I sort a list of dictionaries by a key in Python'],
  ['code-sql', 'SQL inner join vs left join simple example'],
  ['nutrition-table', 'tofu vs lentils vs chickpeas protein per 100g'],
  ['comparison-table', 'California vs Texas population and area comparison table'],
] as const;
const queries = process.argv.includes('--targeted') ? targetedQueries : standardQueries;
if (!process.argv.includes('--live') && !process.argv.includes('--replay')) throw new Error('Choose --live for network requests or --replay DIRECTORY for offline analysis');
const outputFlag = process.argv.indexOf('--output');
if (outputFlag < 0 || !process.argv[outputFlag + 1]) throw new Error('Pass --output DIRECTORY for private raw captures and audit JSON');
const output = resolve(process.argv[outputFlag + 1]!);
await mkdir(output, { recursive: true });

export function inspect(html: string, sourceUrl: string, text: string, markdown: string) {
  const dom = new JSDOM(html, { url: sourceUrl });
  const {document} = dom.window;
  const noscriptFallbacks = document.querySelectorAll('noscript').length;
  for (const fallback of document.querySelectorAll('noscript')) fallback.remove();
  let transferred = 0;
  for (const script of document.querySelectorAll('script:not([src])')) {
    for (const patch of analyzeHtmlTransfers(script.textContent ?? '').transfers) {
      const targets = [...document.querySelectorAll('[id]')].filter(node => node.id === patch.id);
      if (targets.length === 1 && patch.id.startsWith('accdef_') && targets[0]!.classList.contains('qxDOhb')) {
        targets[0]!.innerHTML = patch.html; transferred++;
        targets[0]!.closest('.xpc')?.classList.replace('xpc', 'xpx');
      }
    }
  }
  const simple = [...document.querySelectorAll('.Gx5Zad.xpd.pkphOe')].find(node => node.querySelector('.gqwIMe')?.textContent?.trim() === 'AI Overview');
  const rich = [...document.querySelectorAll('[data-container-id="main-col"]')].find(node => node.closest('#m-x-content,[jscontroller="pJyqm"],[jscontroller="EYwa3d"]'));
  const roots = simple ? [simple.querySelector('.frRrnc'),simple.querySelector('.qxDOhb')].filter((node): node is Element => !!node) : rich ? [rich] : [];
  const section = document.createElement('div'), cssSection = document.createElement('div');
  const removed = 'script,style,template,noscript,button,[role="button"],.RFbPWe,.CGJcbf,[hidden],[aria-hidden="true"],#NwHcK';
  const rootDisplay: Array<{ classes:string; display:string; visibility:string }> = [];
  for (const root of roots) {
    const clone = root.cloneNode(true) as Element, cssClone = root.cloneNode(true) as Element;
    section.append(clone);cssSection.append(cssClone);
    const originals = [root,...root.querySelectorAll('*')], copies = [cssClone,...cssClone.querySelectorAll('*')];
    const style = dom.window.getComputedStyle(root);
    rootDisplay.push({classes:root.className,display:style.display,visibility:style.visibility});
    for(let index=0;index<originals.length;index++) {
      const currentStyle=dom.window.getComputedStyle(originals[index]!);
      if(currentStyle.display==='none'||currentStyle.visibility==='hidden') copies[index]!.remove();
    }
  }
  for(const node of section.querySelectorAll(removed))node.remove();
  for(const node of cssSection.querySelectorAll(removed))node.remove();
  const tokens = (value: string) => value.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const expected = new Set(tokens(section.textContent ?? ''));
  const actual = new Set(tokens(text));
  const missing = [...expected].filter(token => !actual.has(token));
  const counts = { headings:section.querySelectorAll('h1,h2,h3,h4,[role="heading"]').length, lists:section.querySelectorAll('ul,ol').length, listItems:section.querySelectorAll('li').length, tables:section.querySelectorAll('table,[role="table"]').length, tableCells:section.querySelectorAll('td,th,[role="cell"],[role="columnheader"]').length, codeBlocks:section.querySelectorAll('pre').length, inlineCode:section.querySelectorAll('code').length, images:section.querySelectorAll('img').length, iframeMedia:section.querySelectorAll('iframe,video').length };
  const result = { family:simple?'simplified-http':rich?'rich-search':'unrecognized', inlineTransfers:transferred, ...counts, referenceModel:'Supplied answer DOM after literal transfers; source/control groups removed. Structure and token recall do not establish rendered pixels or generation completeness.', referenceTokenCount:expected.size, missingTokens:missing, textTokenRecall:expected.size?(expected.size-missing.length)/expected.size:null, cssModel:{noscriptFallbacksDiscarded:noscriptFallbacks,rootDisplay,referenceTokenCount:new Set(tokens(cssSection.textContent??'')).size,description:'JSDOM CSS model in original ancestor context after observed xpc-to-xpx expansion and discarding inert noscript fallback; scripts not executed.'}, markdownHasTable:/\|[^\n]+\|\s*\n\|?\s*:?-{3}/.test(markdown), markdownHasCodeFence:/^\s*`{3,}/m.test(markdown), scriptExecution:false };
  dom.window.close();
  return result;
}

const rows: unknown[] = [];
const replayFlag = process.argv.indexOf('--replay');
if (replayFlag >= 0) {
  if (!process.argv[replayFlag + 1]) throw new Error('Pass --replay DIRECTORY containing audit.json and raw captures');
  const input = resolve(process.argv[replayFlag + 1]!);
  const audit = JSON.parse(await readFile(join(input, 'audit.json'), 'utf8')) as { rows: Array<{ domain:string; query:string }> };
  for (const row of audit.rows) {
    const html = await readFile(join(input, row.domain + '.html'), 'utf8');
    const sourceUrl = 'https://www.google.com/search?' + new URLSearchParams({q:row.query,hl:'en',gl:'us'});
    const result = sdk().overview.parse(html, {sourceUrl});
    rows.push({...row,status:result.status,answerCharacters:result.text?.length??0,sourceCount:result.sources.length,layout:inspect(html,sourceUrl,result.text??'',result.markdown??'')});
  }
  await writeFile(join(output,'replay.json'),JSON.stringify({date:new Date().toISOString(),mode:'offline replay; no network',rows},null,2));
  console.log(JSON.stringify({mode:'offline replay',captures:rows.length,output:join(output,'replay.json')}));
} else for (const [domain, query] of queries) {
  const url = new URL('https://www.google.com/search');url.searchParams.set('q',query);url.searchParams.set('hl','en');url.searchParams.set('gl','us');
  const slug = domain;
  let html = '', status: number | undefined;
  const bridge = embeddedSearchFetch(runtimePaths());
  const fetcher: typeof fetch = async (input, init) => {const response=await bridge(input,init);html=await response.clone().text();status=response.status;return response;};
  const client = sdk({ transport:'embedded', fetch:fetcher });
  const started = performance.now();
  try {
    const result = await client.overview.get(query,{country:'US',language:'en'});
    const offline = html ? client.overview.parse(html,{sourceUrl:url.toString()}) : undefined;
    const row = { domain,query,status:result.status,httpStatus:status,elapsedMs:Math.round(performance.now()-started),answerCharacters:result.text?.length??0,sourceCount:result.sources.length,roundtripEqual:offline?JSON.stringify([result.status,result.text,result.markdown,result.sources])===JSON.stringify([offline.status,offline.text,offline.markdown,offline.sources]):false,layout:inspect(html,url.toString(),result.text??'',result.markdown??''),sha256:createHash('sha256').update(html).digest('hex') };
    rows.push(row);await writeFile(join(output,slug+'.result.json'),JSON.stringify(result,null,2));
    console.log(JSON.stringify({domain,status:row.status,chars:row.answerCharacters,sources:row.sourceCount,layout:row.layout.family,table:row.layout.tables,code:row.layout.codeBlocks,recall:row.layout.textTokenRecall,roundtrip:row.roundtripEqual}));
  } catch(error) {
    const row = {domain,query,status:'error',httpStatus:status,elapsedMs:Math.round(performance.now()-started),error:error instanceof Error?error.message:String(error),layout:html?inspect(html,url.toString(),'',''):undefined};rows.push(row);console.log(JSON.stringify({domain,status:'error',httpStatus:status,error:row.error}));
  }
  if(html) await writeFile(join(output,slug+'.html'),html);
  await writeFile(join(output,'audit.json'),JSON.stringify({date:'2026-11-05',country:'US',language:'en',transport:'HTTP plus embedded runtime; no browser application',rows},null,2));
  await new Promise(resolve=>setTimeout(resolve,300));
}
