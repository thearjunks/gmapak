const headers={
 'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36',
 'accept-language':'en-US,en;q=0.9'
};

const clean=value=>String(value??'').toLowerCase().replace(/\bstc\b/g,' stc ').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const tokens=value=>new Set(clean(value).split(' ').filter(word=>word.length>1));

export function matchScore(expected,candidate){
 const a=clean(expected),b=clean(candidate);
 if(!a||!b)return 0;
 if(a===b)return 1;
 const left=tokens(a),right=tokens(b),shared=[...left].filter(word=>right.has(word)).length;
 const overlap=shared/Math.max(left.size,right.size,1);
 return Math.min(.95,overlap+((a.includes(b)||b.includes(a)) ? .15 : 0));
}

const listingScore=(row,item)=>{
 const nameScore=matchScore(row.name,item.name),addressScore=matchScore(row.address,item.address);
 return Math.min(1,nameScore*.85+addressScore*.15);
};

export function parseMapResults(text){
 const payload=JSON.parse(text.replace(/^\)\]\}'\n/,'')),found=new Map();
 const visit=value=>{
  if(!Array.isArray(value))return;
  const review=value[4];
  if(Array.isArray(review)&&typeof value[11]==='string'&&typeof review[3]?.[0]==='string'&&review[3][0].includes('/local/reviews?')){
   const reviewUrl=review[3][0],placeId=new URL(reviewUrl).searchParams.get('placeid');
   if(placeId&&!found.has(placeId))found.set(placeId,{placeId,name:value[11],address:Array.isArray(value[2])?value[2].filter(Boolean).join(', '):null,rating:Number.isFinite(review[7])?review[7]:null,reviewCount:Number.isInteger(review[8])?review[8]:null,reviewUrl,coordinates:Array.isArray(value[9])?{lat:value[9][2],lng:value[9][3]}:null,cid:typeof value[10]==='string'?value[10]:null});
  }
  for(const child of value)if(Array.isArray(child))visit(child);
 };
 visit(payload);
 return [...found.values()];
}

export class GoogleMapsPublicClient{
 constructor(fetcher=fetch){this.fetcher=fetcher;}
 async text(url){
  const response=await this.fetcher(url,{headers,signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error(`Google Maps returned HTTP ${response.status}.`);
  const body=await response.text();
  if(/\/sorry\/|unusual traffic|captcha/i.test(`${response.url} ${body.slice(0,5000)}`))throw Error('Google Maps temporarily blocked automated requests.');
  return body;
 }
 async search(row){
  let candidates=[];
  for(const query of [row.name,`${row.name} ${row.address}`]){
   const landing=await this.text(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`);
   const raw=landing.match(/<link href="([^"]*\/search\?tbm=map[^\"]+)/)?.[1];
   if(!raw)continue;
   const endpoint=new URL(raw.replaceAll('&amp;','&'),'https://www.google.com');
   endpoint.searchParams.set('hl','en');endpoint.searchParams.set('gl','kw');
   candidates=parseMapResults(await this.text(endpoint));
   if(candidates.length)break;
  }
  const ranked=candidates.map(item=>({...item,matchScore:listingScore(row,item)})).sort((a,b)=>b.matchScore-a.matchScore);
  if(!ranked.length)throw Error('No public Google Maps listing was found.');
  if(ranked[0].matchScore<.8)throw Error(`No confident Google Maps match; closest result was “${ranked[0].name}”.`);
  if(ranked[1]&&ranked[0].matchScore-ranked[1].matchScore<.015)throw Error('Multiple equally likely Google Maps listings were found.');
  return ranked[0];
 }
}

const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function refreshPublicSnapshot(old,client,{delayMs=350}={}){
 const next=structuredClone(old),now=new Date().toISOString();let succeeded=0,failed=0;
 for(const row of next.queries.branches.rows){
  row.reviewAttemptAt=now;
  try{
   const result=await client.search(row);
   row.liveName=result.name;row.mapsPlaceId=result.placeId;row.mapsCid=result.cid;row.mapsAddress=result.address;row.mapsCoordinates=result.coordinates;row.mapsMatchScore=result.matchScore;row.rating=result.rating;row.reviewCount=result.reviewCount;row.reviewFetchedAt=now;row.reviewError=null;row.reviewsUrl=result.reviewUrl;succeeded++;
  }catch(error){failed++;row.reviewError=error.message||'Google Maps lookup failed; previous values retained.';}
  if(delayMs)await pause(delayMs);
 }
 if(!succeeded)throw Error(next.queries.branches.rows.find(row=>row.reviewError)?.reviewError||'No Google Maps lookup succeeded. Existing snapshot retained.');
 next.generatedAt=now;next.buildStatus='complete';next.status=failed?'partial':'public-maps-snapshot';
 next.sync={attemptedAt:now,succeeded,failed,source:'Google Maps public listings'};
 next.queries.branches.source.caveats=['Profile status and closure labels remain the dated Business Profile registry.','Ratings and review counts come from public Google Maps listings and use per-branch reviewFetchedAt. Failed or ambiguous matches retain previous values.','Public Maps responses can be throttled or change shape; refresh status reports every failure.'];
 next.queries.branches.source.evidenceFlow=next.queries.branches.source.evidenceFlow.filter(item=>!['API refresh','Public Maps refresh'].includes(item.title));
 next.queries.branches.source.evidenceFlow.push({title:'Public Maps refresh',detail:`Searched public Google Maps listings by branch name in Kuwait; ${succeeded} branches succeeded and ${failed} failed. Exact or high-confidence name matching only.`});
 next.queries.reviews={rows:old.queries.reviews?.rows??[],source:{label:'Google Maps public listing aggregates',executedAt:now,rowCount:old.queries.reviews?.rows?.length??0,caveats:['Refresh collects aggregate rating and review count. Google Maps does not expose a stable, supported feed of every review body through this public response.'],metricDefinitions:[{label:'Rating',definition:'Aggregate Google Maps rating for the matched public listing.'},{label:'Review count',definition:'Total public review count reported for the matched listing.'}]}};
 return next;
}
