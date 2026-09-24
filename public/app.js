import {branchReviews,cleanBranchName,dashboardMetrics,ratingBands,reviewRows} from './model.js';

const $=selector=>document.querySelector(selector);
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const safeUrl=value=>/^https?:\/\//i.test(String(value??''))?esc(value):'#';
const displayAddress=value=>String(value??'').replace(/\bstc Kuwait\s*-?\s*/gi,'').replace(/\bstc\s*-?\s*/gi,'').trim();

const icons={
  overview:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  branches:'<path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  reviews:'<path d="M21 11a9 9 0 0 1-9 9H4l-2 2V11a9 9 0 0 1 19 0Z"/><path d="M7 9h10M7 13h6"/>',
  connection:'<path d="m9 15 6-6M8 16l-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0M16 8l2-2a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" transform="translate(2 0) scale(.85)"/>',
  users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M16 11h6"/>',
  refresh:'<path d="M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 14 6M4 12a8 8 0 0 0 14 6"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  alert:'<path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v5M12 17h.01"/>',
  export:'<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>',
  star:'<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'
};
const icon=name=>`<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]??icons.branches}</svg>`;

let data=null;
let status={};
let route='overview';
let ar=localStorage.getItem('ak-language')==='ar';
let signedUser='';
let sessionUser=null;
let managedUsers=[];
let requesting=false;
let requestError='';
let branchQuery='';
let branchStatus='all';
let issuesOnly=false;
let reviewBranch='all';
let reviewQuery='';
let reviewStars='all';

const t=(en,arabic)=>ar?arabic:en;
const formatDate=value=>value?new Date(value).toLocaleString(ar?'ar-KW':'en-GB',{timeZone:'Asia/Kuwait',dateStyle:'medium',timeStyle:'short'}):'—';
const number=value=>new Intl.NumberFormat(ar?'ar-KW':'en-GB').format(value??0);
const rating=value=>Number.isFinite(value)?value.toFixed(1):'—';
const attention=branch=>branch.status!=='Verified'||branch.closure!=='Not specified'||branch.duplicateCode==='Yes'||Boolean(branch.reviewError);
const statusLabels={Verified:'مُثبَت الملكية','Verification required':'يجب تأكيد البيانات',Duplicate:'تكرار',Published:'تم النشر','Temporarily closed':'مغلق مؤقتاً','Permanently closed':'مغلق نهائياً'};
const translatedStatus=value=>ar?(statusLabels[value]??value):value;
const allowed=permission=>Boolean(sessionUser?.permissions?.includes(permission)||sessionUser?.roles?.includes('super_admin'));
const routeTitles=()=>Object.fromEntries(Object.entries({
  overview:t('Overview','نظرة عامة'),
  branches:t('Branches','الفروع'),
  reviews:t('Ratings & reviews','التقييمات والمراجعات'),
  connection:t('Data source','مصدر البيانات'),
  users:t('User management','إدارة المستخدمين')
}).filter(([id])=>allowed(`screen:${id}`)));

function toast(message){
  const element=$('#toast');
  element.textContent=message;
  element.style.display='block';
  clearTimeout(toast.timer);
  toast.timer=setTimeout(()=>element.style.display='none',5000);
}

function pill(text,kind='neutral'){return `<span class="pill ${kind}">${esc(text)}</span>`}

function metricCard(label,value,detail,kind='overview'){
  return `<article class="metric-card"><div class="metric-top"><span>${label}</span><span class="metric-icon">${icon(kind)}</span></div><strong>${value}</strong><div class="metric-detail">${detail}</div></article>`;
}

function refreshStrip(){
  const finished=status.lastSuccess&&(!status.lastAttempt||Date.parse(status.lastSuccess)>=Date.parse(status.lastAttempt));
  const partial=finished&&data?.sync?.failed>0;
  const working=requesting||status.syncing;
  const kind=requestError?'bad':working?'neutral':finished?(partial?'warn':'ok'):status.lastAttempt?'bad':'neutral';
  const label=requestError?t('Request failed','فشل الطلب'):working?t('Refreshing','جارٍ التحديث'):finished?(partial?t('Partial refresh','تحديث جزئي'):t('Refresh complete','اكتمل التحديث')):t('Ready','جاهز');
  const message=requestError||(working?t('Collecting the latest available Google data.','جارٍ جمع أحدث بيانات جوجل المتاحة.'):status.message||t('Ready to refresh.','جاهز للتحديث.'));
  return `<section class="refresh-strip" aria-live="polite">
    <div class="refresh-summary"><span class="status-chip ${kind}">${label}</span><p>${esc(message)}</p></div>
    <div class="refresh-time"><span>${t('Last attempt','آخر محاولة')}</span><strong>${formatDate(status.lastAttempt)}</strong></div>
    <div class="refresh-time"><span>${t('Successful fetch','آخر جلب ناجح')}</span><strong>${formatDate(status.lastSuccess)}</strong></div>
    <div class="refresh-time"><span>${t('Displayed snapshot','البيانات المعروضة')}</span><strong>${formatDate(data?.generatedAt)}</strong></div>
  </section>`;
}

function pageIntro(title,description,side=''){
  return `<div class="page-intro"><div><h2>${title}</h2><p>${description}</p></div>${side}</div>`;
}

function branchStatusPill(branch){
  const kind=branch.status==='Verified'?'ok':branch.status==='Duplicate'?'bad':'warn';
  return pill(translatedStatus(branch.status),kind);
}

function branchTable(rows,{compact=false}={}){
  return `<div class="table-scroll"><table>
    <thead><tr><th>${t('Branch','الفرع')}</th><th>${t('Store code','رمز المتجر')}</th><th>${t('Profile','الملف')}</th>${compact?'':`<th>${t('Listing state','حالة الإدراج')}</th>`}<th class="num">${t('Rating','التقييم')}</th><th class="num">${t('Review count','عدد المراجعات')}</th></tr></thead>
    <tbody>${rows.map(branch=>`<tr>
      <td><button class="branch-link" data-branch="${esc(branch.id)}">${esc(cleanBranchName(branch.name))}</button><small>${esc(displayAddress(branch.address))}</small></td>
      <td><b>${esc(branch.storeCode)}</b>${branch.duplicateCode==='Yes'?'<small>Repeated code</small>':''}</td>
      <td>${branchStatusPill(branch)}</td>
      ${compact?'':`<td>${branch.reviewError?pill(t('Retained','محفوظ'),'warn'):pill(t('Current','حالي'),'ok')}<small>${branch.reviewError?esc(branch.reviewError):t('Latest fetch matched','تمت المطابقة في آخر جلب')}</small></td>`}
      <td class="num">${Number.isFinite(branch.rating)?`<span class="star-value">${rating(branch.rating)} <span class="stars">★</span></span>`:'—'}</td>
      <td class="num">${Number.isFinite(branch.reviewCount)?number(branch.reviewCount):'—'}</td>
    </tr>`).join('')}</tbody>
  </table>${rows.length?'':`<div class="empty-state"><h3>${t('No branches match','لا توجد فروع مطابقة')}</h3><p>${t('Adjust the search or filters and try again.','غيّر البحث أو عوامل التصفية وحاول مرة أخرى.')}</p></div>`}</div>
  <div class="table-foot"><span>${number(rows.length)} ${t('branches','فرعاً')}</span><span>${t('Select a branch for details','اختر فرعاً لعرض التفاصيل')}</span></div>`;
}

function overview(){
  const branches=data.queries.branches.rows;
  const metrics=dashboardMetrics(data);
  const bands=ratingBands(branches);
  const issueRows=branches.filter(attention);
  const best=[...branches].filter(branch=>Number.isFinite(branch.rating)).sort((a,b)=>(b.reviewCount??0)-(a.reviewCount??0)).slice(0,5);
  return `${refreshStrip()}
    ${pageIntro(t('Network at a glance','نظرة سريعة على الشبكة'),t('Current visibility, customer rating coverage and branch issues.','الرؤية الحالية وتغطية تقييمات العملاء ومشكلات الفروع.'),`<span class="coverage-note"><i></i>${t('Automatic refresh every 15 minutes','تحديث تلقائي كل 15 دقيقة')}</span>`)}
    <section class="metrics">
      ${metricCard(t('Registered branches','الفروع المسجلة'),number(metrics.branches),t('Monitored business group','مجموعة الأنشطة المراقبة'),'branches')}
      ${metricCard(t('Rated branches','الفروع المقيّمة'),`${number(metrics.rated)} <small>/ ${number(metrics.branches)}</small>`,`${Math.round(metrics.coverage*100)}% ${t('rating coverage','تغطية التقييم')}`,'star')}
      ${metricCard(t('Public review count','عدد المراجعات العامة'),number(metrics.totalReviews),t('Sum of available branch totals','مجموع الأعداد المتاحة للفروع'),'reviews')}
      ${metricCard(t('Weighted rating','التقييم المرجّح'),metrics.weightedRating?metrics.weightedRating.toFixed(2):'—',t('Weighted by available review counts','مرجّح حسب أعداد المراجعات المتاحة'),'check')}
    </section>
    <div class="layout-2">
      <section class="card"><div class="card-head"><div><h2>${t('Rating coverage','تغطية التقييم')}</h2><p>${t('How the 66 branches are distributed by current Google rating.','توزيع الفروع الـ66 حسب تقييم جوجل الحالي.')}</p></div>${pill(`${metrics.rated}/${metrics.branches}`,metrics.coverage>.8?'ok':'warn')}</div>
        <div class="card-body progress-list">${bands.map((band,index)=>`<div class="progress-row"><span>${esc(band.label)}</span><div class="progress-track"><div class="progress-fill" style="width:${metrics.branches?band.count/metrics.branches*100:0}%;background:${['#0f5960','#2d8a85','#ef8d32','#aab8bf'][index]}"></div></div><b>${band.count}</b></div>`).join('')}</div>
      </section>
      <section class="card"><div class="card-head"><div><h2>${t('Data completeness','اكتمال البيانات')}</h2><p>${t('Rating coverage across the saved registry.','تغطية التقييم في السجل المحفوظ.')}</p></div></div>
        <div class="card-body"><div class="coverage-ring" style="--value:${Math.round(metrics.coverage*100)}"><span><strong>${Math.round(metrics.coverage*100)}%</strong>${t('rated','مقيّم')}</span></div>
        <div class="mini-row"><span>${t('Review-body records','سجلات نصوص المراجعات')}</span><strong>${number(metrics.reviewBodies)}</strong></div>
        <div class="mini-row"><span>${t('Branches needing refresh attention','فروع تحتاج متابعة')}</span><strong>${number(branches.filter(branch=>branch.reviewError).length)}</strong></div></div>
      </section>
    </div>
    <div class="layout-even">
      <section class="card"><div class="card-head"><div><h2>${t('Highest review volume','أعلى حجم مراجعات')}</h2><p>${t('Branches with the largest available public review totals.','الفروع ذات أعلى إجمالي مراجعات عامة متاح.')}</p></div><a href="#reviews">${t('Explore ratings','استكشف التقييمات')} →</a></div>
        <div class="card-body mini-list">${best.map(branch=>`<button class="mini-row branch-link" data-branch="${esc(branch.id)}"><span><strong>${esc(cleanBranchName(branch.name))}</strong><small>${number(branch.reviewCount)} ${t('reviews','مراجعة')}</small></span><span class="star-value">${rating(branch.rating)} ★</span></button>`).join('')}</div>
      </section>
      <section class="card"><div class="card-head"><div><h2>${t('Operations queue','قائمة المتابعة')}</h2><p>${t('Profile, closure, duplicate-code or refresh exceptions.','استثناءات الملف أو الإغلاق أو الرمز المكرر أو التحديث.')}</p></div>${pill(number(issueRows.length),issueRows.length?'warn':'ok')}</div>
        <div class="card-body mini-list">${issueRows.slice(0,5).map(branch=>`<button class="mini-row branch-link" data-branch="${esc(branch.id)}"><span><strong>${esc(cleanBranchName(branch.name))}</strong><small>${esc(branch.reviewError||translatedStatus(branch.status))}</small></span><span>→</span></button>`).join('')||`<div class="empty-state"><h3>${t('No open issues','لا توجد مشكلات مفتوحة')}</h3></div>`}</div>
      </section>
    </div>
    <section class="card"><div class="card-head"><div><h2>${t('Branches requiring attention','الفروع التي تحتاج متابعة')}</h2><p>${t('Saved values remain visible when a refresh cannot verify a listing.','تبقى القيم المحفوظة ظاهرة عندما يتعذر التحقق من الإدراج.')}</p></div><a href="#branches?issues=1">${t('View directory','عرض الدليل')} →</a></div>${branchTable(issueRows.slice(0,8),{compact:true})}</section>`;
}

function filteredBranches(){
  const needle=branchQuery.toLowerCase();
  return data.queries.branches.rows.filter(branch=>{
    const matches=!needle||[branch.name,branch.address,branch.storeCode,branch.profileId].join(' ').toLowerCase().includes(needle);
    return matches&&(branchStatus==='all'||branch.status===branchStatus)&&(!issuesOnly||attention(branch));
  });
}

function branchesPage(){
  const rows=filteredBranches();
  return `${refreshStrip()}${pageIntro(t('Branch directory','دليل الفروع'),t('Search, compare and inspect all registered locations.','ابحث وقارن وافحص جميع المواقع المسجلة.'),`<button class="button" id="export" type="button">${icon('export')}${t('Export CSV','تصدير CSV')}</button>`)}
    <section class="card">
      <div class="toolbar">
        <input id="branch-search" type="search" value="${esc(branchQuery)}" placeholder="${t('Search branch, address, code or profile ID…','ابحث عن فرع أو عنوان أو رمز أو معرف…')}" aria-label="${t('Search branches','البحث عن الفروع')}">
        <select id="branch-status" aria-label="${t('Profile status','حالة الملف')}"><option value="all">${t('All profile statuses','جميع حالات الملف')}</option>${['Verified','Verification required','Duplicate','Published'].map(value=>`<option value="${value}" ${branchStatus===value?'selected':''}>${esc(translatedStatus(value))}</option>`).join('')}</select>
        <label><input id="issues-only" type="checkbox" ${issuesOnly?'checked':''}> ${t('Needs attention','تحتاج متابعة')}</label>
        <button class="button" id="reset-branches" type="button">${t('Reset','إعادة تعيين')}</button>
      </div>
      <div id="branch-results">${branchTable(rows)}</div>
    </section>`;
}

function ratingLockup(branch){
  if(!branch)return '';
  if(!Number.isFinite(branch.rating))return `<div class="rating-missing">${t('Rating unavailable','التقييم غير متاح')}</div><small>${t('The latest lookup could not verify an aggregate rating.','تعذر على آخر جلب التحقق من التقييم الإجمالي.')}</small>`;
  return `<div class="rating-lockup"><span class="rating-score">${rating(branch.rating)}</span><span><span class="stars" aria-label="${branch.rating} stars">★★★★★</span><small>${number(branch.reviewCount)} ${t('Google reviews reported','مراجعة جوجل مُبلّغ عنها')}</small></span></div>`;
}

function branchHero(branch,metrics){
  if(!branch)return `<section class="branch-summary"><span class="overline">${t('Entire network','الشبكة كاملة')}</span><h2>${t('Ratings across all branches','التقييمات عبر جميع الفروع')}</h2><p>${t('Aggregate Google ratings remain visible even when individual review text is not available.','تبقى تقييمات جوجل الإجمالية ظاهرة حتى عند عدم توفر نصوص المراجعات الفردية.')}</p>
    <div class="rating-lockup"><span class="rating-score">${metrics.weightedRating?metrics.weightedRating.toFixed(2):'—'}</span><span><span class="stars">★★★★★</span><small>${number(metrics.totalReviews)} ${t('reported reviews across rated branches','مراجعة مُبلّغ عنها عبر الفروع المقيّمة')}</small></span></div>
    <div class="branch-meta"><span>${t('Rated branches','الفروع المقيّمة')}<strong>${metrics.rated}/${metrics.branches}</strong></span><span>${t('Review-body records','سجلات نصوص المراجعات')}<strong>${metrics.reviewBodies}</strong></span><span>${t('Latest snapshot','آخر لقطة')}<strong>${formatDate(data.generatedAt)}</strong></span></div></section>`;
  return `<section class="branch-summary"><span class="overline">${t('Selected branch','الفرع المحدد')}</span><h2>${esc(cleanBranchName(branch.name))}</h2><p>${esc(displayAddress(branch.address))}</p>${ratingLockup(branch)}
    <div class="branch-meta"><span>${t('Store code','رمز المتجر')}<strong>${esc(branch.storeCode)}</strong></span><span>${t('Rating fetched','تم جلب التقييم')}<strong>${formatDate(branch.reviewFetchedAt)}</strong></span><span>${t('Listing status','حالة الإدراج')}<strong>${branch.reviewError?t('Retained snapshot','لقطة محفوظة'):t('Current match','مطابقة حالية')}</strong></span></div></section>`;
}

function filteredReviewRows(){return reviewRows(data,{branchId:reviewBranch,stars:reviewStars,query:reviewQuery})}

function reviewCards(rows,selected){
  if(rows.length)return `<div class="review-feed">${rows.map(review=>`<article class="review-card">
    <div class="review-avatar">${esc((review.reviewer||'?').trim().charAt(0).toUpperCase())}</div>
    <div class="review-content"><div class="review-head"><div><strong>${esc(review.reviewer||t('Anonymous','مجهول'))}</strong><div class="review-meta">${esc(cleanBranchName(review.branchName))}</div></div><div class="review-score"><span class="stars" aria-label="${review.rating||0} stars">${'★'.repeat(review.rating||0)}${'☆'.repeat(Math.max(0,5-(review.rating||0)))}</span><small>${esc(review.relativeTime||formatDate(review.updateTime))}</small></div></div>
    <p class="review-text">${esc(review.comment||t('Rating only','تقييم فقط'))}</p>
    ${review.reply?`<div class="review-reply"><b>${t('Business response','رد النشاط التجاري')}</b><p>${esc(review.reply)}</p></div>`:''}
    <div class="review-foot"><span>${t('Collected','تم الجمع')} ${formatDate(review.fetchedAt)}</span>${review.reply?pill(t('Replied','تم الرد'),'ok'):pill(t('No visible reply','لا يوجد رد ظاهر'),'neutral')}</div></div>
  </article>`).join('')}</div>`;
  const reported=selected&&Number.isFinite(selected.reviewCount)?selected.reviewCount:0;
  return `<div class="empty-state"><div class="empty-icon">${icon('reviews')}</div><h3>${reported?t('Rating and review count are available','التقييم وعدد المراجعات متاحان'):t('No matching review text','لا توجد نصوص مراجعات مطابقة')}</h3><p>${reported?t(`${number(reported)} reviews are reported for this branch. Individual review text will populate automatically when Google enables the approved reviews API.`,`تم الإبلاغ عن ${number(reported)} مراجعة لهذا الفرع. ستظهر نصوص المراجعات تلقائياً عند تفعيل جوجل لواجهة المراجعات المعتمدة.`):t('Try another branch, star rating or search term.','جرّب فرعاً أو تقييماً أو عبارة بحث أخرى.')}</p>
    ${selected?.reviewsUrl?`<a class="button" href="${safeUrl(selected.reviewsUrl)}" target="_blank" rel="noreferrer">${t('Open current Google reviews','فتح مراجعات جوجل الحالية')} ↗</a>`:''}</div>`;
}

function reviewsPage(){
  const branches=data.queries.branches.rows;
  const metrics=dashboardMetrics(data);
  const selected=reviewBranch==='all'?null:branches.find(branch=>branch.id===reviewBranch)??null;
  const rows=filteredReviewRows();
  const selectedBodies=selected?branchReviews(data,selected.id).length:metrics.reviewBodies;
  const directory=[...branches].sort((a,b)=>(b.reviewCount??-1)-(a.reviewCount??-1));
  const distribution=[5,4,3,2,1].map(star=>({star,count:(data.queries.reviews.rows||[]).filter(item=>Math.round(item.rating)===star).length}));
  const maxDistribution=Math.max(1,...distribution.map(item=>item.count));
  return `${refreshStrip()}${pageIntro(t('Ratings and customer reviews','التقييمات ومراجعات العملاء'),t('Monitor reputation, review coverage and customer feedback for every permitted branch.','راقب السمعة وتغطية المراجعات وآراء العملاء لكل فرع مسموح.'))}
    <section class="reviews-overview" aria-label="${t('Ratings overview','نظرة عامة على التقييمات')}">
      <div class="reviews-score-card"><span class="overline">${selected?t('Selected branch','الفرع المحدد'):t('Network reputation','سمعة الشبكة')}</span><div class="reviews-score-row"><strong>${selected?rating(selected.rating):(metrics.weightedRating?.toFixed(2)??'—')}</strong><div><span class="stars" aria-hidden="true">★★★★★</span><p>${selected?esc(cleanBranchName(selected.name)):t('Weighted by reported review volume','مرجّح حسب حجم المراجعات المُبلّغ عنها')}</p></div></div><div class="reviews-score-meta"><span>${number(selected?.reviewCount??metrics.totalReviews)} <small>${t('reported reviews','مراجعة مُبلّغ عنها')}</small></span><span>${selectedBodies} <small>${t('review bodies','نص مراجعة')}</small></span><span>${metrics.rated}/${metrics.branches} <small>${t('rated branches','فرعاً مقيّماً')}</small></span></div></div>
      <div class="reviews-distribution card"><div class="card-head"><div><h2>${t('Fetched review mix','مزيج المراجعات المجلوبة')}</h2><p>${t('Based on review bodies currently available.','بناءً على نصوص المراجعات المتاحة حالياً.')}</p></div>${pill(`${metrics.reviewBodies} ${t('records','سجلات')}`,'neutral')}</div><div class="rating-bars">${distribution.map(item=>`<div><span>${item.star} ★</span><i><b style="width:${Math.round(item.count/maxDistribution*100)}%"></b></i><strong>${item.count}</strong></div>`).join('')}</div></div>
    </section>
    <section class="review-kpis">
      ${metricCard(t('Rating coverage','تغطية التقييم'),`${Math.round(metrics.coverage*100)}%`,`${metrics.rated}/${metrics.branches} ${t('branches','فرعاً')}`,'star')}
      ${metricCard(t('Reported reviews','المراجعات المُبلّغ عنها'),number(metrics.totalReviews),t('Aggregate public totals','الإجماليات العامة'),'reviews')}
      ${metricCard(t('Fetched review bodies','نصوص المراجعات المجلوبة'),number(metrics.reviewBodies),`${metrics.branchesWithReviewBodies} ${t('branches represented','فروع ممثلة')}`,'overview')}
    </section>
    <section class="card review-workspace">
      <div class="review-workspace-head"><div><span class="eyebrow">${t('Customer voice','صوت العميل')}</span><h2>${t('Review feed','سجل المراجعات')}</h2><p>${t('Filter by branch, rating or keyword. Results update in place.','صفّ حسب الفرع أو التقييم أو الكلمة. تتحدث النتائج فوراً.')}</p></div>${pill(`${rows.length} ${t('shown','معروضة')}`,'neutral')}</div>
      <div class="review-toolbar">
        <label><span>${t('Branch','الفرع')}</span><select id="review-branch"><option value="all">${t('All 66 branches','جميع الفروع الـ66')}</option>${branches.map(branch=>`<option value="${esc(branch.id)}" ${branch.id===reviewBranch?'selected':''}>${esc(cleanBranchName(branch.name))}</option>`).join('')}</select></label>
        <label class="review-search"><span>${t('Search','البحث')}</span><input id="review-search" type="search" value="${esc(reviewQuery)}" placeholder="${t('Reviewer, comment or branch','مراجع أو تعليق أو فرع')}"></label>
        <label><span>${t('Rating','التقييم')}</span><select id="review-stars"><option value="all">${t('All ratings','جميع التقييمات')}</option>${[5,4,3,2,1].map(value=>`<option value="${value}" ${String(value)===String(reviewStars)?'selected':''}>${value} ★</option>`).join('')}</select></label>
      </div>
      <div class="review-workspace-grid"><div id="review-results">${reviewCards(rows,selected)}</div><aside class="rating-directory"><div class="directory-head"><h3>${t('Branch ratings','تقييمات الفروع')}</h3><span>${directory.length}</span></div><div class="rating-directory-list">${directory.map(branch=>`<button class="rating-branch ${branch.id===reviewBranch?'active':''}" data-review-branch="${esc(branch.id)}"><span><strong>${esc(cleanBranchName(branch.name))}</strong><small>${Number.isFinite(branch.reviewCount)?number(branch.reviewCount)+' '+t('reviews','مراجعة'):t('Count unavailable','العدد غير متاح')}</small></span><b>${Number.isFinite(branch.rating)?rating(branch.rating)+' ★':'—'}</b></button>`).join('')}</div></aside></div>
      ${!status.source?.startsWith('Google Business')?`<p class="data-message review-source-note">${t('Full review text will update automatically after Google enables the approved Business Profile quota. Current aggregate ratings and counts use the labelled fallback source.','ستتحدث نصوص المراجعات كاملة تلقائياً بعد تفعيل جوجل للحصة المعتمدة. تستخدم التقييمات والأعداد الحالية المصدر الاحتياطي الموضح.')}</p>`:''}
    </section>`;
}

function connectionPage(){
  const current=status.source||data.sync?.source||'—';
  const official=status.connected?t('Connected','متصل'):status.configured?t('Authorization required','التفويض مطلوب'):t('Not configured','غير مهيأ');
  return `${refreshStrip()}${pageIntro(t('Data source and refresh','مصدر البيانات والتحديث'),t('Connection status, refresh coverage and retained-data rules.','حالة الاتصال وتغطية التحديث وقواعد الاحتفاظ بالبيانات.'))}
    <div class="layout-even">
      <section class="card"><div class="card-head"><div><h2>${t('Live connection','الاتصال المباشر')}</h2><p>${t('The screen always labels the source currently supplying displayed data.','تعرض الشاشة دائماً اسم المصدر الذي يزوّد البيانات المعروضة.')}</p></div>${pill(official,status.connected?'ok':'warn')}</div>
        <div class="card-body connection-stack">
          <div class="connection-row"><span>${t('Official Business Profile OAuth','مصادقة ملف النشاط التجاري الرسمية')}</span><strong>${official}</strong></div>
          <div class="connection-row"><span>${t('Active displayed source','مصدر العرض النشط')}</span><strong>${esc(current)}</strong></div>
          <div class="connection-row"><span>${t('Business group','مجموعة الأنشطة')}</span><strong>104765881644272532999</strong></div>
          <div class="connection-row"><span>${t('Automatic schedule','الجدول التلقائي')}</span><strong>${t('Every 15 minutes','كل 15 دقيقة')}</strong></div>
          <div class="connection-row"><span>${t('Latest coverage','أحدث تغطية')}</span><strong>${number(data.sync?.succeeded??0)} ${t('updated','محدّث')} · ${number(data.sync?.failed??0)} ${t('retained','محفوظ')}</strong></div>
        </div>
        <p class="data-message">${esc(status.message||t('Ready to refresh.','جاهز للتحديث.'))}</p>
      </section>
      <section class="card"><div class="card-head"><div><h2>${t('Refresh sequence','تسلسل التحديث')}</h2><p>${t('How new values reach the dashboard.','كيفية وصول القيم الجديدة إلى لوحة المعلومات.')}</p></div></div>
        <div class="card-body timeline">
          <div class="timeline-item"><span class="timeline-step">1</span><b>${t('Authenticate with Google','المصادقة مع جوجل')}</b><p>${t('Use the stored OAuth connection and read-only application requests.','استخدام اتصال OAuth المحفوظ وطلبات التطبيق للقراءة فقط.')}</p></div>
          <div class="timeline-item"><span class="timeline-step">2</span><b>${t('Request official locations and reviews','طلب المواقع والمراجعات الرسمية')}</b><p>${t('When Google quota is enabled, every location and review page is collected.','عند تفعيل حصة جوجل يتم جمع كل موقع وكل صفحة مراجعات.')}</p></div>
          <div class="timeline-item"><span class="timeline-step">3</span><b>${t('Use labelled aggregate fallback','استخدام المصدر الإجمالي الاحتياطي المسمى')}</b><p>${t('While official approval is pending, current public ratings and review counts are refreshed.','أثناء انتظار الموافقة الرسمية يتم تحديث التقييمات العامة وأعداد المراجعات الحالية.')}</p></div>
          <div class="timeline-item"><span class="timeline-step">4</span><b>${t('Retain verified history','الاحتفاظ بالسجل المتحقق')}</b><p>${t('Missing or ambiguous matches never erase the last saved values.','لا تمسح المطابقات المفقودة أو الملتبسة آخر قيم محفوظة.')}</p></div>
        </div>
      </section>
    </div>`;
}

const permissionCatalog=()=>[
  {group:t('Screen access','صلاحيات الشاشات'),items:[['screen:overview',t('Overview','نظرة عامة')],['screen:branches',t('Branches','الفروع')],['screen:reviews',t('Ratings & reviews','التقييمات والمراجعات')],['screen:connection',t('Data source','مصدر البيانات')],['screen:users',t('User management','إدارة المستخدمين')]]},
  {group:t('Action access','صلاحيات الإجراءات'),items:[['data.refresh',t('Refresh branch data','تحديث بيانات الفروع')],['google.connect',t('Manage Google connection','إدارة اتصال جوجل')],['users.view',t('View users','عرض المستخدمين')],['users.manage',t('Create and manage users','إنشاء المستخدمين وإدارتهم')]]}
];

function roleLabel(role){return role==='super_admin'?t('Super Admin','مسؤول أعلى'):role==='admin'?t('Admin','مسؤول'):t('User','مستخدم')}

function userManagementPage(){
  const active=managedUsers.filter(user=>user.active).length;
  const administrators=managedUsers.filter(user=>user.roles.includes('admin')||user.roles.includes('super_admin')).length;
  return `${pageIntro(t('User management','إدارة المستخدمين'),t('Create users and control access to each screen and administrative action.','أنشئ المستخدمين وتحكم في الوصول إلى كل شاشة وإجراء إداري.'),allowed('users.manage')?`<button class="button primary" id="create-user" type="button">${icon('users')}${t('Create user','إنشاء مستخدم')}</button>`:'')}
    <section class="user-summary"><div><span>${t('Total users','إجمالي المستخدمين')}</span><strong>${managedUsers.length}</strong></div><div><span>${t('Active users','المستخدمون النشطون')}</span><strong>${active}</strong></div><div><span>${t('Administrators','المسؤولون')}</span><strong>${administrators}</strong></div></section>
    <section class="card users-panel"><div class="card-head"><div><h2>${t('Workspace access','الوصول إلى مساحة العمل')}</h2><p>${t('Permissions are enforced by the server for screens and protected actions.','يفرض الخادم الصلاحيات على الشاشات والإجراءات المحمية.')}</p></div>${pill(`${active} ${t('active','نشط')}`,active?'ok':'neutral')}</div>
      <div class="users-table-wrap"><table class="users-table"><thead><tr><th>${t('User','المستخدم')}</th><th>${t('Roles','الأدوار')}</th><th>${t('Screen access','صلاحيات الشاشات')}</th><th>${t('Status','الحالة')}</th><th>${t('Last sign-in','آخر دخول')}</th><th><span class="sr-only">${t('Actions','الإجراءات')}</span></th></tr></thead><tbody>${managedUsers.map(user=>`<tr><td><div class="user-identity"><span>${esc((user.displayName||user.username).charAt(0).toUpperCase())}</span><div><strong>${esc(user.displayName||user.username)}</strong><small>${esc(user.username)}</small></div></div></td><td><div class="tag-list">${user.roles.map(role=>pill(roleLabel(role),role==='super_admin'?'ok':'neutral')).join('')}</div></td><td><div class="permission-summary">${user.permissions.filter(value=>value.startsWith('screen:')).map(value=>`<span>${esc(routeName(value.slice(7)))}</span>`).join('')||`<em>${t('No screens','لا شاشات')}</em>`}</div></td><td>${pill(user.active?t('Active','نشط'):t('Inactive','غير نشط'),user.active?'ok':'bad')}</td><td>${formatDate(user.lastLoginAt)}</td><td>${allowed('users.manage')?`<button class="button edit-user" data-user="${esc(user.id)}" type="button">${t('Manage','إدارة')}</button>`:''}</td></tr>`).join('')}</tbody></table></div>
      <div class="user-cards">${managedUsers.map(user=>`<article><div class="user-card-head"><div class="user-identity"><span>${esc((user.displayName||user.username).charAt(0).toUpperCase())}</span><div><strong>${esc(user.displayName||user.username)}</strong><small>${esc(user.username)}</small></div></div>${pill(user.active?t('Active','نشط'):t('Inactive','غير نشط'),user.active?'ok':'bad')}</div><div class="tag-list">${user.roles.map(role=>pill(roleLabel(role),role==='super_admin'?'ok':'neutral')).join('')}</div><dl><dt>${t('Screens','الشاشات')}</dt><dd>${user.permissions.filter(value=>value.startsWith('screen:')).map(value=>esc(routeName(value.slice(7)))).join(', ')||t('None','لا يوجد')}</dd><dt>${t('Last sign-in','آخر دخول')}</dt><dd>${formatDate(user.lastLoginAt)}</dd></dl>${allowed('users.manage')?`<button class="button edit-user" data-user="${esc(user.id)}" type="button">${t('Manage access','إدارة الوصول')}</button>`:''}</article>`).join('')}</div>
    </section>`;
}

function routeName(id){return ({overview:t('Overview','نظرة عامة'),branches:t('Branches','الفروع'),reviews:t('Ratings & reviews','التقييمات والمراجعات'),connection:t('Data source','مصدر البيانات'),users:t('User management','إدارة المستخدمين')})[id]||id}

function openUserEditor(user=null){
  const editing=Boolean(user),selectedRoles=user?.roles??['user'],selectedPermissions=user?.permissions??['screen:overview'];
  $('#user-dialog-body').innerHTML=`<form id="user-form" class="user-form"><span class="eyebrow">${editing?t('Manage access','إدارة الوصول'):t('New workspace user','مستخدم جديد')}</span><h2 id="user-dialog-title">${editing?esc(user.displayName||user.username):t('Create user','إنشاء مستخدم')}</h2><p>${t('Choose roles, screens and actions. Changes take effect on the user’s next request.','اختر الأدوار والشاشات والإجراءات. تسري التغييرات مع الطلب التالي للمستخدم.')}</p><div class="form-grid"><label>${t('Username','اسم المستخدم')}<input name="username" value="${esc(user?.username||'')}" ${editing?'disabled':''} autocomplete="off" required></label><label>${t('Display name','الاسم المعروض')}<input name="displayName" value="${esc(user?.displayName||'')}" required></label><label class="form-wide">${editing?t('New password (leave blank to keep current)','كلمة مرور جديدة (اتركها فارغة للاحتفاظ بالحالية)'):t('Temporary password','كلمة المرور المؤقتة')}<input name="password" type="password" minlength="10" ${editing?'':'required'} autocomplete="new-password"><small>${t('Minimum 10 characters.','10 أحرف على الأقل.')}</small></label></div><fieldset><legend>${t('Roles','الأدوار')}</legend><div class="choice-grid">${[['user',t('User','مستخدم')],['admin',t('Admin','مسؤول')],['super_admin',t('Super Admin','مسؤول أعلى')]].map(([value,label])=>`<label><input type="checkbox" name="roles" value="${value}" ${selectedRoles.includes(value)?'checked':''}> <span><b>${label}</b><small>${value==='super_admin'?t('Full control including Super Admin assignments','تحكم كامل بما في ذلك تعيين المسؤول الأعلى'):value==='admin'?t('Administrative role; permissions remain configurable','دور إداري مع صلاحيات قابلة للتخصيص'):t('Standard role with selected access','دور قياسي بالوصول المحدد')}</small></span></label>`).join('')}</div></fieldset>${permissionCatalog().map(group=>`<fieldset><legend>${group.group}</legend><div class="permission-grid">${group.items.map(([value,label])=>`<label><input type="checkbox" name="permissions" value="${value}" ${selectedPermissions.includes(value)?'checked':''}> <span>${label}</span></label>`).join('')}</div></fieldset>`).join('')}<label class="active-toggle"><input type="checkbox" name="active" ${user?.active!==false?'checked':''}> <span><b>${t('Active account','حساب نشط')}</b><small>${t('Inactive users cannot sign in and existing sessions stop working.','لا يستطيع المستخدم غير النشط تسجيل الدخول وتتوقف جلساته الحالية.')}</small></span></label><p class="form-error" id="user-form-error" role="alert"></p><div class="dialog-actions"><button class="button" type="button" id="cancel-user">${t('Cancel','إلغاء')}</button><button class="button primary" type="submit">${editing?t('Save changes','حفظ التغييرات'):t('Create user','إنشاء المستخدم')}</button></div></form>`;
  $('#user-dialog').showModal();
  $('#cancel-user').addEventListener('click',()=>$('#user-dialog').close());
  $('#user-form').addEventListener('submit',event=>saveUser(event,user));
}

async function saveUser(event,user){
  event.preventDefault();const form=event.currentTarget,button=form.querySelector('[type=submit]'),error=$('#user-form-error');button.disabled=true;error.textContent='';
  const payload={displayName:form.displayName.value,roles:[...form.querySelectorAll('[name=roles]:checked')].map(item=>item.value),permissions:[...form.querySelectorAll('[name=permissions]:checked')].map(item=>item.value),active:form.active.checked};
  if(!user)payload.username=form.username.value;if(form.password.value)payload.password=form.password.value;
  try{const response=await fetch(user?`/api/admin/users/${user.id}`:'/api/admin/users',{method:user?'PATCH':'POST',headers:{'Content-Type':'application/json','X-Dashboard-Request':'1'},body:JSON.stringify(payload)});const result=await response.json().catch(()=>({}));if(!response.ok)throw Error(result.message||t('Could not save user.','تعذر حفظ المستخدم.'));await loadUsers();$('#user-dialog').close();render();toast(user?t('User access updated.','تم تحديث صلاحيات المستخدم.'):t('User created.','تم إنشاء المستخدم.'));}catch(reason){error.textContent=reason.message;button.disabled=false;}
}

async function loadUsers(){if(!allowed('users.view'))return;const response=await fetch('/api/admin/users',{cache:'no-store'});if(!response.ok)throw Error((await response.json().catch(()=>({}))).message||'User management is unavailable.');managedUsers=(await response.json()).users||[];}

function render(){
  if(!data)return;
  document.documentElement.lang=ar?'ar':'en';
  document.documentElement.dir=ar?'rtl':'ltr';
  const titles=routeTitles();
  $('#nav').innerHTML=Object.entries(titles).map(([id,label])=>`<a href="#${id}" class="${route===id?'active':''}" ${route===id?'aria-current="page"':''}>${icon(id)}<span>${label}</span>${id==='branches'?'<span class="nav-count">66</span>':''}</a>`).join('');
  $('#page-title').textContent=titles[route];
  $('#language').textContent=ar?'English':'العربية';
  $('#logout').textContent=t('Sign out','تسجيل الخروج');
  $('#signed-user').textContent=sessionUser?.displayName||signedUser||t('Branch administrator','مسؤول الفروع');
  $('#refresh').innerHTML=`${icon('refresh')}${requesting||status.syncing?t('Refreshing…','جارٍ التحديث…'):t('Refresh data','تحديث البيانات')}`;
  $('#refresh').disabled=Boolean(requesting||status.syncing);
  $('#refresh').hidden=!allowed('data.refresh');
  $('#source-label').textContent=status.source||data.sync?.source||t('Saved snapshot','لقطة محفوظة');
  $('#freshness').textContent=`${t('Displayed snapshot','البيانات المعروضة')}: ${formatDate(data.generatedAt)}`;
  $('#page').innerHTML=route==='overview'?overview():route==='branches'?branchesPage():route==='reviews'?reviewsPage():route==='connection'?connectionPage():userManagementPage();
  bindPage();
}

function bindPage(){
  document.querySelectorAll('.branch-link').forEach(button=>button.addEventListener('click',()=>openBranch(button.dataset.branch)));
  document.querySelectorAll('.rating-branch').forEach(button=>button.addEventListener('click',()=>{reviewBranch=button.dataset.reviewBranch;render()}));
  $('#branch-search')?.addEventListener('input',event=>{branchQuery=event.target.value;$('#branch-results').innerHTML=branchTable(filteredBranches());bindBranchLinks()});
  $('#branch-status')?.addEventListener('change',event=>{branchStatus=event.target.value;$('#branch-results').innerHTML=branchTable(filteredBranches());bindBranchLinks()});
  $('#issues-only')?.addEventListener('change',event=>{issuesOnly=event.target.checked;$('#branch-results').innerHTML=branchTable(filteredBranches());bindBranchLinks()});
  $('#reset-branches')?.addEventListener('click',()=>{branchQuery='';branchStatus='all';issuesOnly=false;render()});
  $('#export')?.addEventListener('click',exportCsv);
  $('#review-branch')?.addEventListener('change',event=>{reviewBranch=event.target.value;render()});
  $('#review-search')?.addEventListener('input',event=>{reviewQuery=event.target.value;updateReviewResults()});
  $('#review-stars')?.addEventListener('change',event=>{reviewStars=event.target.value;updateReviewResults()});
  $('#create-user')?.addEventListener('click',()=>openUserEditor());
  document.querySelectorAll('.edit-user').forEach(button=>button.addEventListener('click',()=>openUserEditor(managedUsers.find(user=>user.id===button.dataset.user))));
}

function bindBranchLinks(){
  document.querySelectorAll('.branch-link').forEach(button=>button.addEventListener('click',()=>openBranch(button.dataset.branch)));
}

function updateReviewResults(){
  const selected=reviewBranch==='all'?null:data.queries.branches.rows.find(branch=>branch.id===reviewBranch)??null;
  $('#review-results').innerHTML=reviewCards(filteredReviewRows(),selected);
}

function openBranch(id){
  const branch=data.queries.branches.rows.find(item=>item.id===id);
  if(!branch)return;
  const bodies=branchReviews(data,id);
  $('#detail-body').innerHTML=`<span class="eyebrow">${t('Branch details','تفاصيل الفرع')}</span><h2 id="detail-title">${esc(cleanBranchName(branch.name))}</h2><p class="sub">${esc(displayAddress(branch.address))}</p>
    ${ratingLockup(branch)}
    <dl class="detail-list">
      <dt>${t('Store code','رمز المتجر')}</dt><dd>${esc(branch.storeCode)}</dd>
      <dt>${t('Profile status','حالة الملف')}</dt><dd>${esc(translatedStatus(branch.status))}</dd>
      <dt>${t('Reported reviews','المراجعات المُبلّغ عنها')}</dt><dd>${Number.isFinite(branch.reviewCount)?number(branch.reviewCount):'—'}</dd>
      <dt>${t('Review-body records','سجلات نصوص المراجعات')}</dt><dd>${number(bodies.length)}</dd>
      <dt>${t('Last rating fetch','آخر جلب للتقييم')}</dt><dd>${formatDate(branch.reviewFetchedAt)}</dd>
      <dt>${t('Data status','حالة البيانات')}</dt><dd>${branch.reviewError?esc(branch.reviewError):t('Latest lookup matched','تمت المطابقة في آخر جلب')}</dd>
    </dl>
    <div class="top-actions"><a class="button primary" href="${safeUrl(branch.profileUrl)}" target="_blank" rel="noreferrer">${t('Open Google profile','فتح ملف جوجل')} ↗</a>${branch.reviewsUrl?`<a class="button" href="${safeUrl(branch.reviewsUrl)}" target="_blank" rel="noreferrer">${t('Open Google reviews','فتح مراجعات جوجل')} ↗</a>`:''}<button class="button view-branch-reviews" type="button">${t('View in dashboard','عرض في اللوحة')}</button></div>`;
  $('.view-branch-reviews').addEventListener('click',()=>{reviewBranch=id;location.hash='reviews';$('#detail').close()});
  $('#detail').showModal();
}

function exportCsv(){
  const fields=['name','storeCode','status','closure','rating','reviewCount','address','reviewFetchedAt','reviewError'];
  const encode=value=>`"${String(value??'').replaceAll('"','""')}"`;
  const csv=[fields.join(','),...filteredBranches().map(branch=>fields.map(field=>encode(branch[field])).join(','))].join('\r\n');
  const link=document.createElement('a');
  link.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  link.download='ak-branch-monitor.csv';
  link.click();
  URL.revokeObjectURL(link.href);
  toast(t('Branch CSV exported.','تم تصدير ملف الفروع.'));
}

async function refresh(){
  requesting=true;
  requestError='';
  render();
  try{
    const response=await fetch('/api/google/refresh',{method:'POST',headers:{'X-Dashboard-Request':'1'}});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(payload.message||t('Refresh request failed.','فشل طلب التحديث.'));
    toast(payload.message||t('Refresh started.','بدأ التحديث.'));
    await poll();
  }catch(error){
    requestError=error.message;
    requesting=false;
    render();
  }
}

async function connect(){
  try{
    const response=await fetch('/api/google/connect',{method:'POST',headers:{'X-Dashboard-Request':'1'}});
    const payload=await response.json();
    if(!response.ok)throw Error(payload.message||'Connection failed.');
    location.href=payload.url;
  }catch(error){toast(error.message)}
}

async function poll(){
  try{
    const response=await fetch('/api/google/status',{cache:'no-store'});
    if(!response.ok)throw Error('Status unavailable.');
    const next=await response.json();
    const snapshotChanged=route!=='users'&&next.snapshotVersion&&next.snapshotVersion!==data.generatedAt;
    status=next;
    requesting=Boolean(next.syncing);
    if(snapshotChanged){
      const snapshotResponse=await fetch(`/api/snapshot?screen=${encodeURIComponent(route)}`,{cache:'no-store'});
      if(snapshotResponse.ok)data=await snapshotResponse.json();
    }
    render();
  }catch{
    requestError=t('Connection service unavailable. Showing the last saved snapshot.','خدمة الاتصال غير متاحة. يتم عرض آخر لقطة محفوظة.');
    requesting=false;
    render();
  }
}

async function navigate(){
  if(location.hash==='#main'){document.querySelector('main').focus();return}
  const [candidate,params]=location.hash.slice(1).split('?');
  const titles=routeTitles(),fallback=Object.keys(titles)[0];
  route=Object.hasOwn(titles,candidate)?candidate:fallback;
  if(candidate!==route)history.replaceState(null,'',`#${route}`);
  if(params?.includes('issues=1'))issuesOnly=true;
  try{if(route==='users')await loadUsers();else{const response=await fetch(`/api/snapshot?screen=${encodeURIComponent(route)}`,{cache:'no-store'});if(!response.ok)throw Error((await response.json().catch(()=>({}))).message||'Dashboard data unavailable.');data=await response.json();}render();}catch(error){$('#page').innerHTML=`<section class="card empty-state"><div class="empty-icon">${icon('alert')}</div><h2>${t('Could not load this screen','تعذر تحميل هذه الشاشة')}</h2><p>${esc(error.message)}</p></section>`;}
}

$('#language').addEventListener('click',()=>{ar=!ar;localStorage.setItem('ak-language',ar?'ar':'en');render()});
$('#logout').addEventListener('click',async()=>{await fetch('/api/auth/logout',{method:'POST',headers:{'X-Dashboard-Request':'1'}}).catch(()=>{});location.replace('/sign-in')});
$('#refresh').addEventListener('click',refresh);
$('.dialog-close').addEventListener('click',()=>$('#detail').close());
$('#detail').addEventListener('click',event=>{if(event.target===$('#detail'))$('#detail').close()});
$('.user-dialog-close').addEventListener('click',()=>$('#user-dialog').close());
$('#user-dialog').addEventListener('click',event=>{if(event.target===$('#user-dialog'))$('#user-dialog').close()});
window.addEventListener('hashchange',()=>navigate());

try{
  const sessionResponse=await fetch('/api/auth/session',{cache:'no-store'});
  if(sessionResponse.status===401){location.replace('/sign-in');throw Error('Authentication required.');}
  if(!sessionResponse.ok)throw Error('Dashboard session unavailable.');
  sessionUser=await sessionResponse.json();signedUser=sessionUser.username||'';
  const titles=routeTitles();if(!Object.keys(titles).length)throw Error('No dashboard screens are assigned to this account.');
  const candidate=location.hash.slice(1).split('?')[0];route=Object.hasOwn(titles,candidate)?candidate:Object.keys(titles)[0];
  const [snapshotResponse,statusResponse]=await Promise.all([route==='users'?Promise.resolve(null):fetch(`/api/snapshot?screen=${encodeURIComponent(route)}`,{cache:'no-store'}),fetch('/api/google/status',{cache:'no-store'})]);
  if((snapshotResponse&&!snapshotResponse.ok)||!statusResponse.ok)throw Error('Dashboard data unavailable.');
  if(snapshotResponse)data=await snapshotResponse.json();else{data={generatedAt:null,sync:{},queries:{branches:{rows:[]},reviews:{rows:[]}}};await loadUsers();}
  status=await statusResponse.json();
  await navigate();
  setInterval(poll,3000);
}catch(error){
  $('#page').innerHTML=`<section class="card empty-state"><div class="empty-icon">${icon('alert')}</div><h2>${t('Could not load the dashboard','تعذر تحميل لوحة المعلومات')}</h2><p>${esc(error.message)} ${t('Check that the server is running, then reload.','تحقق من تشغيل الخادم ثم أعد التحميل.')}</p><button class="button primary" id="reload">${t('Reload','إعادة التحميل')}</button></section>`;
  $('#reload')?.addEventListener('click',()=>location.reload());
}
