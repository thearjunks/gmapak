import test from 'node:test';
import assert from 'node:assert/strict';
import {matchScore,parseMapResults,refreshPublicSnapshot} from './google-maps-public.mjs';

const listing=(name='stc Kuwait - Al-Anoud Mall, Fahaheel')=>{
 const row=[];row[2]=['Inside Al-Anoud Mall','Mecca Street'];row[4]=[];row[4][3]=['https://search.google.com/local/reviews?placeid=ChIJexample&q=stc'];row[4][7]=4;row[4][8]=26;row[9]=[null,null,29.08,48.13];row[10]='0xabc:0xdef';row[11]=name;return row;
};

test('public Maps parser extracts aggregate rating, count and stable identity',()=>{
 const rows=parseMapResults(`)]}'\n${JSON.stringify([null,[listing()]])}`);
 assert.deepEqual(rows,[{placeId:'ChIJexample',name:'stc Kuwait - Al-Anoud Mall, Fahaheel',address:'Inside Al-Anoud Mall, Mecca Street',rating:4,reviewCount:26,reviewUrl:'https://search.google.com/local/reviews?placeid=ChIJexample&q=stc',coordinates:{lat:29.08,lng:48.13},cid:'0xabc:0xdef'}]);
});

test('name matching accepts punctuation changes and rejects unrelated locations',()=>{
 assert.ok(matchScore('stc Kuwait - Al Kout Mall, Fahaheel','stc Kuwait Al Kout Mall Fahaheel')>.9);
 assert.ok(matchScore('stc Kuwait - Al Kout Mall, Fahaheel','Coffee shop Salmiya')<.3);
});

test('partial public refresh retains old values on failed branches',async()=>{
 const old={generatedAt:'old',queries:{branches:{rows:[{id:'1',name:'Branch One',rating:3,reviewCount:4},{id:'2',name:'Branch Two',rating:2,reviewCount:5}],source:{caveats:[],evidenceFlow:[]}},reviews:{rows:[]}}};
 const client={search:async row=>{if(row.id==='2')throw Error('blocked');return {...listing(row.name),placeId:'place',matchScore:1,rating:4.5,reviewCount:9,reviewUrl:'https://example.test/reviews'};}};
 const next=await refreshPublicSnapshot(old,client,{delayMs:0});
 assert.equal(next.queries.branches.rows[0].rating,4.5);assert.equal(next.queries.branches.rows[1].rating,2);assert.equal(next.queries.branches.rows[1].reviewError,'blocked');assert.deepEqual(next.sync.source,'Google Maps public listings');
});
