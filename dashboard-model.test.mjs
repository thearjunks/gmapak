import test from 'node:test';
import assert from 'node:assert/strict';
import {branchReviews,dashboardMetrics,ratingBands,reviewRows} from './public/model.js';

const data={queries:{branches:{rows:[
  {id:'a',rating:4.8,reviewCount:21},
  {id:'b',rating:4.2,reviewCount:9},
  {id:'c',rating:null,reviewCount:null}
]},reviews:{rows:[
  {id:'r1',branchId:'b',branchName:'B',reviewer:'Mona',rating:5,comment:'Helpful',reply:''},
  {id:'r2',branchId:'b',branchName:'B',reviewer:'Ali',rating:2,comment:'Slow',reply:'Sorry'}
]}}};

test('aggregate ratings remain visible when a branch has no review-body rows',()=>{
  const branch=data.queries.branches.rows[0];
  assert.equal(branch.rating,4.8);
  assert.equal(branch.reviewCount,21);
  assert.deepEqual(branchReviews(data,'a'),[]);
});

test('dashboard metrics reconcile rated coverage and weighted rating',()=>{
  const metrics=dashboardMetrics(data);
  assert.equal(metrics.branches,3);
  assert.equal(metrics.rated,2);
  assert.equal(metrics.totalReviews,30);
  assert.equal(metrics.coverage,2/3);
  assert.equal(Number(metrics.weightedRating.toFixed(2)),4.62);
});

test('review filters intersect branch, stars and search',()=>{
  assert.deepEqual(reviewRows(data,{branchId:'b',stars:'5',query:'help'}).map(r=>r.id),['r1']);
  assert.deepEqual(reviewRows(data,{branchId:'a'}),[]);
});

test('rating bands preserve unrated branches',()=>{
  assert.deepEqual(ratingBands(data.queries.branches.rows).map(b=>b.count),[1,1,0,1]);
});
