export const GROUP='104765881644272532999';
export const SCOPE='https://www.googleapis.com/auth/business.manage';
const stars={ONE:1,TWO:2,THREE:3,FOUR:4,FIVE:5};
export class GoogleClient {
 constructor(accessToken,fetcher=fetch){this.token=accessToken;this.fetcher=fetcher;}
 async get(url){
  const r=await this.fetcher(url,{headers:{Authorization:`Bearer ${this.token}`},signal:AbortSignal.timeout(30000)});
  if(!r.ok){const body=await r.json().catch(()=>({}));const details=body.error?.details??[];
   if(r.status===429&&details.some(d=>String(d.metadata?.quota_limit_value)==='0'))throw Error('Google Business Profile API approval required: project quota is 0 requests per minute. Request Basic API Access for project 293954845523. Existing snapshot retained.');
   const kind={401:'Google authorization expired. Reconnect Google.',403:'Google denied API access. Check project approval, enabled APIs and account permissions.',404:'Google location is unavailable to this account.',429:'Google API quota exceeded. Retry later.'};throw Error(kind[r.status]||`Google request failed (HTTP ${r.status}).`);}
  return r.json();
 }
 async pages(base,field){const result=[];const seen=new Set();let token='',first;
  do{const url=new URL(base);if(token)url.searchParams.set('pageToken',token);const page=await this.get(url);first??=page;if(page[field]!=null&&!Array.isArray(page[field]))throw Error('Unexpected Google response shape.');result.push(...(page[field]??[]));token=page.nextPageToken||'';if(token&&seen.has(token))throw Error('Google repeated a pagination token; incomplete response retained.');if(token)seen.add(token);if(seen.size>10000)throw Error('Pagination safety limit reached.');}while(token);
  return {items:result,first};
 }
 async locations(){const fields='name,title,storeCode,storefrontAddress,phoneNumbers,websiteUri,regularHours,specialHours,openInfo,metadata,latlng';const url=new URL(`https://mybusinessbusinessinformation.googleapis.com/v1/accounts/${GROUP}/locations`);url.searchParams.set('readMask',fields);url.searchParams.set('pageSize','100');return (await this.pages(url,'locations')).items;}
 async reviews(locationName){if(!/^locations\/\d+$/.test(locationName))throw Error('Invalid Google location identity.');const url=`https://mybusiness.googleapis.com/v4/accounts/${GROUP}/${locationName}/reviews?pageSize=50&orderBy=updateTime%20desc`;const {items,first}=await this.pages(url,'reviews');const unique=new Map();for(const r of items){if(!r.reviewId)throw Error('Google review is missing its ID.');unique.set(r.reviewId,r);}return {rating:Number.isFinite(first.averageRating)&&first.averageRating>=1&&first.averageRating<=5&&first.totalReviewCount!==0?first.averageRating:null,reviewCount:Number.isInteger(first.totalReviewCount)&&first.totalReviewCount>=0?first.totalReviewCount:null,items:[...unique.values()]};}
}
export function matchLocation(row,locations){
 const byId=locations.filter(x=>x.name===`locations/${row.profileId}`);if(byId.length===1)return byId[0];
 // A UI profile identifier is not assumed to be an API location ID. Fallback must be unambiguous.
 const byName=locations.filter(x=>x.title===row.name&&String(x.storeCode??'')===row.storeCode);return byName.length===1?byName[0]:null;
}
export async function refreshSnapshot(old,client){
 const locations=await client.locations();if(!locations.length)throw Error('Google returned no locations for this group. Existing snapshot retained.');
 const now=new Date().toISOString(),next=structuredClone(old),previousReviews=old.queries.reviews.rows,reviewRows=[];let succeeded=0,failed=0;
 for(const row of next.queries.branches.rows){
  const location=matchLocation(row,locations);row.reviewAttemptAt=now;
  if(!location){failed++;row.reviewError='No unambiguous API location match. Existing values retained.';reviewRows.push(...previousReviews.filter(r=>r.branchId===row.id));continue;}
  row.apiName=location.name;row.liveName=location.title;row.phone=location.phoneNumbers?.primaryPhone??null;row.websiteUri=location.websiteUri??null;row.mapsUri=location.metadata?.mapsUri??null;row.placeId=location.metadata?.placeId??null;row.regularHours=location.regularHours??null;row.specialHours=location.specialHours??null;row.liveOpenStatus=location.openInfo?.status??null;row.infoFetchedAt=now;
  try{const result=await client.reviews(location.name);row.rating=result.rating;row.reviewCount=result.reviewCount;row.reviewFetchedAt=now;row.reviewError=null;succeeded++;
   reviewRows.push(...result.items.map(r=>({id:`${row.id}:${r.reviewId}`,branchId:row.id,branchName:row.name,profileId:row.profileId,reviewer:r.reviewer?.displayName??'Anonymous',rating:stars[r.starRating]??null,comment:r.comment??'',createTime:r.createTime??null,updateTime:r.updateTime??null,reply:r.reviewReply?.comment??null,replyTime:r.reviewReply?.updateTime??null,fetchedAt:now})));
  }catch(e){failed++;row.reviewError=e.message;reviewRows.push(...previousReviews.filter(r=>r.branchId===row.id));}
 }
 if(!succeeded)throw Error(next.queries.branches.rows.find(r=>r.reviewError)?.reviewError||'No review fetch succeeded. Previous snapshot retained.');
 next.generatedAt=now;next.buildStatus='complete';next.status=failed?'partial':'api-snapshot';next.sync={attemptedAt:now,succeeded,failed,apiLocations:locations.length,unmatchedApiLocations:locations.filter(l=>!next.queries.branches.rows.some(r=>r.apiName===l.name)).length,source:'Google Business Profile APIs (read-only GET requests)'};
 next.queries.branches.source.caveats=['Profile status, name, address and closure labels remain the dated browser registry; current API details have separate live fields.','Ratings and review counts use per-branch reviewFetchedAt. Failed locations retain previous values, with reviewError.','Additional API locations are counted in sync metadata but are not silently added to the 66-branch registry.'];
 next.queries.branches.source.evidenceFlow=next.queries.branches.source.evidenceFlow.filter(x=>x.title!=='API refresh');next.queries.branches.source.evidenceFlow.push({title:'API refresh',detail:`Business information and reviews.list; all available pages; ${succeeded} branches succeeded, ${failed} failed. Review timestamps are per branch. Group: ${GROUP}.`});
 next.queries.reviews={rows:reviewRows,source:{label:'Google Business Profile reviews API',executedAt:now,period:'All returned review pages for matched registry locations',rowCount:reviewRows.length,caveats:[`${failed} branches failed; any previous reviews for those branches were retained with their original fetchedAt. Not a guarantee of all public reviews.`],evidenceFlow:[{title:'Read locations',detail:`GET mybusinessbusinessinformation.googleapis.com/v1/accounts/${GROUP}/locations; pageSize 100; match IDs, else unique exact name and store code.`},{title:'Read reviews',detail:`GET mybusiness.googleapis.com/v4/accounts/${GROUP}/locations/{locationId}/reviews; pageSize 50; orderBy updateTime desc; follow every nextPageToken. No writes.`}],metricDefinitions:[{label:'Rating',definition:'Google averageRating per location, not an average of this feed.'},{label:'Review count',definition:'Google totalReviewCount per location. Missing is null.'}]}};
 return next;
}
