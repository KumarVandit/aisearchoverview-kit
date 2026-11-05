import { ancestor, descendants, parseHtml, visibleText, type HtmlNode } from '../google-search/html.js';
import { overviewMarkdown } from '../google-search/markdown.js';
import type { AiModeTurn, AiModePlace } from './types.js';

function url(value: string | undefined, sourceUrl: string): string | undefined {
  if (!value) return undefined;
  try { const u = new URL(value,sourceUrl); return /^https?:$/.test(u.protocol) && !u.username && !u.password ? u.toString() : undefined; } catch { return undefined; }
}
function copy(node: HtmlNode, controls: Set<HtmlNode>, separated: Set<HtmlNode>): HtmlNode {
  const result: HtmlNode = {tag:node.tag,attrs:{...node.attrs},children:[]};
  if (controls.has(node)||node.tag==='button'||node.attrs['data-ignore-copy']!==undefined||['dialog','status','alert'].includes(node.attrs.role??'')||node.attrs['data-suuid']?.startsWith('nCd0md|')) return result;
  const children=node.children.filter(child=>typeof child==='string'||!['script','style','noscript','template'].includes(child.tag));
  for(const child of children){
    if(separated.has(node)&&result.children.length)result.children.push(' · ');
    result.children.push(typeof child==='string'?child:copy(child,controls,separated));
  }
  if(/^h[1-6]$/.test(node.tag)||node.attrs.role==='heading'){const heading=visibleText(result);if(!heading)return {tag:'div',attrs:{},children:[]};result.children=[heading];}
  if((node.tag==='a'||node.attrs.role==='img')&&node.attrs['aria-label']&&!visibleText(result))result.children=[node.attrs['aria-label']];
  return result;
}
export function parseAiModeTurns(html: string, sourceUrl: string, markdown = true): AiModeTurn[] {
  const root=parseHtml(html), nodes=descendants(root);
  const turns=nodes.filter(n=>n.attrs['data-scope-id']==='turn'&&!ancestor(n.parent??root,p=>p.attrs['data-scope-id']==='turn'));
  return turns.flatMap(turn=>{
    const all=descendants(turn), main=all.find(n=>n.attrs['data-container-id']==='main-col');
    if (!main) return [];
    if (!visibleText(main)) return [];
    const controls=new Set<HtmlNode>(), separated=new Set<HtmlNode>();
    for(const marker of descendants(main).filter(n=>n.attrs['data-ignore-copy']!==undefined&&descendants(n).some(c=>c.attrs.role==='status'))){
      const cluster=ancestor(marker,n=>{const controls=descendants(n);return controls.some(c=>c.attrs.role==='dialog')&&controls.some(c=>c.attrs.role==='region'&&c.attrs['aria-label']==='Feedback');},main);
      if(cluster)controls.add(cluster);
    }
    const rhs=all.find(n=>n.attrs['data-container-id']==='rhs-col');
    const sources: AiModeTurn['sources']=[];
    for (const card of rhs?descendants(rhs).filter(n=>n.attrs['data-src-id']!==undefined):[]) {
      const link=descendants(card).find(n=>n.tag==='a'&&n.attrs['data-link-behavior']==='cobrowse'), href=url(link?.attrs.href,sourceUrl);
      if (href&&!sources.some(s=>s.url===href)) sources.push({position:sources.length+1,title:link?.attrs['aria-label']??visibleText(link!),url:href});
    }
    const places: AiModePlace[]=[];
    for (const card of descendants(main).filter(n=>n.attrs.role==='listitem')) {
      const children=descendants(card), rating=children.find(n=>n.attrs.role==='img'&&/^Rated [\d.]+ out of 5,/.test(n.attrs['aria-label']??''));
      const directions=children.find(n=>n.tag==='a'&&n.attrs['aria-label']==='Directions');
      if (!rating||!directions||ancestor(rating,p=>p.attrs.role==='listitem')!==card) continue;
      const header=children.find(n=>n.attrs.role==='button');
      const name=header&&descendants(header).find(n=>n.tag==='div'&&n.children.some(c=>typeof c==='string'&&c.trim())&&!n.children.some(c=>typeof c==='object'));
      if (!name) continue;
      const score=/^Rated ([\d.]+) out of 5, (.+?) reviews?\.?$/.exec(rating.attrs['aria-label']!);
      const image=children.find(n=>n.tag==='img'&&url(n.attrs.src,sourceUrl));
      const website=children.find(n=>n.tag==='a'&&n.attrs['aria-label']==='Website');
      const detailContainer = name.parent?.children.find((n):n is HtmlNode=>typeof n==='object'&&n!==name);
      const rows=detailContainer?.children.filter((n):n is HtmlNode=>typeof n==='object')??[];
      const fields=(row:HtmlNode|undefined)=>{
        if(!row)return [];
        const container=descendants(row).find(n=>{const children=n.children.filter((c):c is HtmlNode=>typeof c==='object');return children.length>0&&children.every(c=>c.tag==='span');});
        if(container)separated.add(container);
        return container?.children.filter((n):n is HtmlNode=>typeof n==='object').map(visibleText)??[];
      };
      const headerRows=rows[0]&&descendants(rows[0]).includes(rating);
      const priceFields=headerRows?fields(rows[1]):[], statusFields=headerRows?fields(rows[2]):[];
      const priceLevel=priceFields.find(value=>/^[£$€¥₹]/.test(value));
      const type=priceFields.find(value=>value!==priceLevel);
      const status=statusFields.length>=2?statusFields[0]:undefined;
      const placeId=[card,...children].find(n=>n.attrs['data-place-id']?.trim())?.attrs['data-place-id'];
      const phone=children.find(n=>n.tag==='a'&&/^tel:[+\d][+\d(). -]*$/.test(n.attrs.href??''))?.attrs.href?.slice(4);
      const href=url(directions.attrs.href,sourceUrl)!;
      const address=/\/maps\/dir\/\/(.+?)\/data=/.exec(new URL(href).pathname)?.[1];
      places.push({title:visibleText(name),index:places.length+1,...(type?{type}:{}),...(priceLevel?{priceLevel}:{}),...(status?{status}:{}),...(placeId?{placeId}:{}),...(phone?{phone}:{}),...(score?{rating:Number(score[1]),reviews:score[2]}:{}),...(image?{thumbnail:url(image.attrs.src,sourceUrl)}:{}),...(website?{website:url(website.attrs.href,sourceUrl)}:{}),directions:href,...(address?{address:decodeURIComponent(address.replace(/\+/g,' '))}:{})});
    }
    const images=descendants(main).filter(n=>n.tag==='img').flatMap(n=>{const value=url(n.attrs.src,sourceUrl);return value?[{url:value,...(n.attrs.alt?{alt:n.attrs.alt}:{})}]:[]});
    const body=copy(main,controls,separated), text=visibleText(body);
    const promptHeading=all.find(n=>/^h[1-6]$/.test(n.tag)&&n.attrs['data-ignore-copy']!==undefined&&visibleText(n).startsWith('AI Mode reply for '));
    const prompt=promptHeading?visibleText(promptHeading).slice('AI Mode reply for '.length):undefined;
    return [{...(prompt?{prompt}:{}),text,...(markdown?{markdown:overviewMarkdown(body,sourceUrl)}:{}),sources,...(places.length?{places}:{}),...(images.length?{images}:{})}];
  });
}
