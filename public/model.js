export const cleanBranchName=name=>String(name??'').replace(/^stc Kuwait\s*-?\s*/i,'').trim();

export const reviewRows=(data,{branchId='all',stars='all',query=''}={})=>{
  const needle=String(query).trim().toLowerCase();
  return (data?.queries?.reviews?.rows??[]).filter(review=>{
    if(branchId!=='all'&&review.branchId!==branchId)return false;
    if(stars!=='all'&&Number(review.rating)!==Number(stars))return false;
    return !needle||[review.reviewer,review.comment,review.branchName,review.reply]
      .join(' ').toLowerCase().includes(needle);
  });
};

export const branchReviews=(data,branchId)=>reviewRows(data,{branchId});

export const dashboardMetrics=data=>{
  const branches=data?.queries?.branches?.rows??[];
  const rated=branches.filter(branch=>Number.isFinite(branch.rating));
  const reviewBodies=data?.queries?.reviews?.rows??[];
  const totalReviews=rated.reduce((sum,branch)=>sum+(Number.isFinite(branch.reviewCount)?branch.reviewCount:0),0);
  const weightedDenominator=rated.reduce((sum,branch)=>sum+(branch.reviewCount>0?branch.reviewCount:0),0);
  const weightedRating=weightedDenominator
    ?rated.reduce((sum,branch)=>sum+branch.rating*(branch.reviewCount>0?branch.reviewCount:0),0)/weightedDenominator
    :null;
  return {
    branches:branches.length,
    rated:rated.length,
    unrated:branches.length-rated.length,
    coverage:branches.length?rated.length/branches.length:0,
    totalReviews,
    weightedRating,
    reviewBodies:reviewBodies.length,
    branchesWithReviewBodies:new Set(reviewBodies.map(review=>review.branchId)).size
  };
};

export const ratingBands=branches=>[
  {id:'excellent',label:'4.5–5.0',count:branches.filter(b=>b.rating>=4.5).length},
  {id:'good',label:'4.0–4.4',count:branches.filter(b=>b.rating>=4&&b.rating<4.5).length},
  {id:'watch',label:'Below 4.0',count:branches.filter(b=>Number.isFinite(b.rating)&&b.rating<4).length},
  {id:'missing',label:'No rating',count:branches.filter(b=>!Number.isFinite(b.rating)).length}
];

export const selectedBranch=data=>{
  const branches=data?.queries?.branches?.rows??[];
  return branchId=>branches.find(branch=>branch.id===branchId)??null;
};
