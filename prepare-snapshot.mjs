import fs from 'node:fs';
import crypto from 'node:crypto';
const input = fs.readFileSync('C:/Users/thear/.codex/attachments/b3333d36-16fe-4e6b-a225-7a557930d867/Pasted text.txt','utf8');
const lines=input.split(/\r?\n/); const rows=[];
for(let i=0;i<lines.length;i++){
 const m=lines[i].match(/^([^\t]+)\t(stc Kuwait.*)$/); if(!m)continue;
 const code=m[1].trim(),name=m[2].trim(); const parts=[];
 while(++i<lines.length && !/\t(Verified|Verification required|Duplicate|Published)\b/.test(lines[i]))parts.push(lines[i]);
 if(i>=lines.length)throw Error('Missing status for '+name);
 const end=lines[i].split('\t'); parts.push(end[0]);
 const closure=parts.find(x=>/^(Temporarily|Permanently) closed$/.test(x.trim()))?.trim()??'Not specified';
 const address=parts.filter(x=>! /^(Temporarily|Permanently) closed$/.test(x.trim())).join(' ').trim();
 rows.push({id:crypto.createHash('sha256').update(name+'|'+address).digest('hex').slice(0,16),storeCode:code,name,address,status:end[1].trim(),closure,rating:null,reviewCount:null});
}
if(rows.length!==66)throw Error('Expected 66 rows, got '+rows.length);
for(const row of rows)row.duplicateCode=rows.filter(x=>x.storeCode===row.storeCode).length>1?'Yes':'No';
const source={label:'User-supplied Google Business Profile business list',files:['Pasted text.txt'],rowCount:66,period:'Snapshot date not provided',caveats:['Imported list, not live Google data. Source observation time is unknown.','Ratings, reviews, coordinates, phone numbers and hours were not supplied.','English names and addresses preserved exactly. Arabic source records are unavailable.','A browser access check showed 0 businesses for this group in the signed-in account; it did not validate or replace the supplied list.'],metricDefinitions:[{label:'Verified',definition:'Rows whose supplied status is exactly Verified. Verified / all rows gives the verification rate.'},{label:'Attention',definition:'Unique rows with status other than Verified, an explicit closure, or a repeated store code. Conditions may overlap.'}],evidenceFlow:[{title:'Source',detail:'User pasted 66 business records from Google Business Profile group 104765881644272532999.'},{title:'Import',detail:'Read each store code and name, preserve the address, separate closure labels from verification status. Keep store codes as strings including leading zeros.'},{title:'Availability',detail:'No ratings or reviews were supplied; null remains unavailable, never zero.'}]};
const snapshot={surface:'dashboard',title:'stc Kuwait · Branch intelligence',generatedAt:new Date().toISOString(),buildStatus:'creating',status:'imported',filters:[],queries:{branches:{rows,source,methods:[{language:'text',code:'Parse tab-separated store code and business name; collect address until status; separate explicit closure. Count repeated exact store codes without merging locations.'}]}}};
fs.writeFileSync('reviewed.json',JSON.stringify(snapshot,null,2));
fs.mkdirSync('source',{recursive:true}); fs.writeFileSync('source/businesses.txt',input);
console.log(JSON.stringify({rows:rows.length,statuses:rows.reduce((a,r)=>(a[r.status]=(a[r.status]||0)+1,a),{}),closures:rows.filter(r=>r.closure!=='Not specified').length,duplicateCodes:[...new Set(rows.filter(r=>r.duplicateCode==='Yes').map(r=>r.storeCode))]}));
