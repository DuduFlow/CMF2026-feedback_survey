const ratingItems=[
  [1,"整體而言，你對這趟 CMF 旅程的滿意度如何？","整體滿意度"],
  [2,"行程安排與節奏的滿意度？","行程安排與節奏"],
  [3,"交通與接駁安排的滿意度？","交通與接駁安排"],
  [4,"住宿安排的滿意度？","住宿安排"],
  [5,"餐食安排的滿意度？","餐食安排"],
  [6,"CMF 課程與會場體驗的滿意度？","CMF課程與會場體驗"]
];
const optionShort={"非常願意":"非常願意","有意願，視日期與費用而定":"有意願，視情況而定","還不確定":"還不確定","意願不高":"意願不高","不會參加":"不會參加"};
const STORAGE={submitted:"cmf-survey-submitted-id",pending:"cmf-survey-pending",courses:"cmf-survey-my-courses"};
const isLocalPreview=location.protocol==="file:"||["localhost","127.0.0.1"].includes(location.hostname);
const reducedMotion=matchMedia("(prefers-reduced-motion: reduce)").matches;
const wrap=document.querySelector("#ratingQuestions");

ratingItems.forEach(([number,title,name])=>{
  const section=document.createElement("section"); section.className="question"; section.dataset.question=number;
  section.innerHTML=`<div class="question-head"><span class="number">${String(number).padStart(2,"0")}</span><div><h2>${title}</h2><p>請選擇 1～5 星</p></div></div><div class="rating" role="radiogroup" aria-label="${title}">${[1,2,3,4,5].map(score=>`<label><input type="radio" name="${name}" value="${score}" ${score===1?"required":""}><span>★</span><small>${score}${score===1?" · 待改善":score===5?" · 非常滿意":""}</small></label>`).join("")}</div><p class="error" role="alert"></p>`;
  wrap.appendChild(section);
});

const form=document.querySelector("#surveyForm");
const questions=[...document.querySelectorAll("[data-question]")];
const tripFeedback=form.elements["旅程回饋"];
const publicMessage=form.elements["公開留言"];
const courseChecks=[...form.querySelectorAll('input[name="最有印象的三堂課"]')];
const progressBar=document.querySelector("#progressBar");
const progressText=document.querySelector("#progressText");
let currentSubmissionId="";
let lastPayload=null;
let showingAllCourses=false;

function updateProgress(){
  let answered=0;
  ratingItems.forEach(([, ,name])=>{if(form.elements[name].value)answered++;});
  if(courseChecks.filter(item=>item.checked).length===3)answered++;
  if(form.elements["2027長沙CMF意願"].value)answered++;
  if(publicMessage.value.trim())answered++;
  const percent=Math.round(answered/9*100);
  progressBar.style.width=`${percent}%`; progressText.textContent=`${percent}%`;
}

form.addEventListener("input",event=>{
  if(event.target.name==="最有印象的三堂課"){
    const selected=courseChecks.filter(item=>item.checked).length;
    document.querySelector("#pickCount").textContent=`${selected} / 3`;
    courseChecks.forEach(item=>item.disabled=!item.checked&&selected>=3);
  }
  updateProgress();
  document.querySelector("#charCount").textContent=tripFeedback.value.length;
  document.querySelector("#messageCount").textContent=publicMessage.value.length;
  event.target.closest(".question")?.classList.remove("invalid");
});

form.addEventListener("submit",async event=>{
  event.preventDefault();
  const missing=questions.filter(section=>{
    if(section.dataset.question==="7")return courseChecks.filter(item=>item.checked).length!==3;
    const required=section.querySelector("[required]"); return required&&!form.elements[required.name].value.trim();
  });
  questions.forEach(q=>q.classList.remove("invalid"));
  if(missing.length){
    missing.forEach(q=>{q.classList.add("invalid");q.querySelector(".error").textContent=sectionMessage(q);});
    missing[0].scrollIntoView({behavior:"smooth",block:"center"}); return;
  }
  const data=Object.fromEntries(new FormData(form).entries());
  const selectedCourses=courseChecks.filter(item=>item.checked).map(item=>item.value);
  data["最有印象的三堂課"]=selectedCourses.join("、");
  data.submissionId=createId();
  currentSubmissionId=data.submissionId; lastPayload=data;
  localStorage.setItem(STORAGE.pending,JSON.stringify(data));
  localStorage.setItem(STORAGE.courses,JSON.stringify(selectedCourses));
  setSubmitting(true,"正在安全送出…");
  if(isLocalPreview||!window.CMF_API_URL){
    localStorage.setItem(STORAGE.submitted,data.submissionId); localStorage.removeItem(STORAGE.pending);
    showThanksShell(); renderPayload(buildDemoPayload(data),true); return;
  }
  try{
    await transmit(data);
    setSubmitting(true,"正在確認寫入…");
    const saved=await waitForSaved(data.submissionId);
    if(!saved)throw new Error("confirmation pending");
    completeSubmission(data.submissionId);
  }catch(error){showConfirmationPending();}
});

function sectionMessage(section){return section.dataset.question==="7"?"請剛好選擇三堂課":"請完成這一題";}
function createId(){return globalThis.crypto?.randomUUID?.()||`cmf-${Date.now()}-${Math.random().toString(36).slice(2)}`;}
function setSubmitting(disabled,text){const button=form.querySelector('button[type="submit"]');button.disabled=disabled;button.querySelector("span").textContent=text;}

async function transmit(data){
  await fetch(window.CMF_API_URL,{method:"POST",mode:"no-cors",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({payload:JSON.stringify(data)})});
}

async function waitForSaved(id){
  for(let attempt=0;attempt<6;attempt++){
    try{const status=await jsonp({action:"status",id});if(status.saved)return true;}catch(error){}
    await delay(800+attempt*250);
  }
  return false;
}

function delay(ms){return new Promise(resolve=>setTimeout(resolve,ms));}

function showConfirmationPending(){
  form.querySelector('.submit-button').hidden=true;
  document.querySelector("#submitStatus").hidden=false;
  document.querySelector("#submitStatus").scrollIntoView({behavior:"smooth",block:"center"});
}

document.querySelector("#retryConfirm").addEventListener("click",async event=>{
  const pending=lastPayload||safeJSON(localStorage.getItem(STORAGE.pending));
  if(!pending)return;
  event.currentTarget.disabled=true; event.currentTarget.textContent="確認中…";
  try{
    await transmit(pending);
    if(await waitForSaved(pending.submissionId)){completeSubmission(pending.submissionId);return;}
  }catch(error){}
  event.currentTarget.disabled=false; event.currentTarget.textContent="重新確認";
});

function completeSubmission(id){
  localStorage.setItem(STORAGE.submitted,id); localStorage.removeItem(STORAGE.pending);
  document.querySelector("#submitStatus").hidden=true; showThanksShell(); loadAndRenderResults();
}

function showThanksShell(){
  form.hidden=true; document.querySelector(".progress-wrap").hidden=true;
  const thanks=document.querySelector("#thanks"); thanks.hidden=false; thanks.classList.add("thanks-enter");
  document.querySelector("#resultsLoading").hidden=false; document.querySelector("#resultsError").hidden=true; document.querySelector("#resultsContent").hidden=true;
  thanks.scrollIntoView({behavior:reducedMotion?"auto":"smooth",block:"start"});
}

async function loadAndRenderResults(){
  setResultsLoading(true);
  try{renderPayload(await jsonp({action:"results"}),false);}catch(error){setResultsLoading(false,true);}
}

function jsonp(params){
  return new Promise((resolve,reject)=>{
    const callback=`cmfResults_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script=document.createElement("script");
    const timer=setTimeout(()=>{cleanup();reject(new Error("timeout"));},12000);
    function cleanup(){clearTimeout(timer);delete window[callback];script.remove();}
    window[callback]=data=>{cleanup();data?.ok?resolve(data):reject(new Error(data?.error||"invalid response"));};
    script.onerror=()=>{cleanup();reject(new Error("load failed"));};
    const query=new URLSearchParams({...params,prefix:callback,_:Date.now()});
    script.src=`${window.CMF_API_URL}?${query}`; document.head.appendChild(script);
  });
}

function setResultsLoading(loading,error=false){
  document.querySelector("#resultsLoading").hidden=!loading;
  document.querySelector("#resultsError").hidden=!error;
  if(loading)document.querySelector("#resultsContent").hidden=true;
}

document.querySelector("#retryResults").addEventListener("click",loadAndRenderResults);
document.querySelector("#refreshResults").addEventListener("click",async event=>{
  event.currentTarget.disabled=true; event.currentTarget.textContent="更新中…";
  await loadAndRenderResults(); event.currentTarget.disabled=false; event.currentTarget.textContent="更新結果";
});

function renderPayload(payload,isPreview){
  lastPayload=payload;
  setResultsLoading(false,false); document.querySelector("#resultsContent").hidden=false;
  renderSummary(payload); renderRatings(payload.stats?.ratings||{}); renderCourses(payload.stats?.courses||{},payload.total||sumValues(payload.results));
  renderFeedbacks(payload.stats?.feedbacks||[]); renderIntent(payload.results||{}); renderMessages(payload.messages||[],isPreview);
  document.querySelector("#lastUpdated").textContent=isPreview?"本機預覽資料":`最後更新：${formatUpdated(payload.updatedAt)}`;
  initResultInteractions();
}

function renderSummary(payload){
  const total=payload.total||sumValues(payload.results);
  const ratings=Object.values(payload.stats?.ratings||{});
  const overall=ratings.length?ratings.reduce((sum,item)=>sum+Number(item.avg||0),0)/ratings.length:0;
  const top=Object.entries(payload.stats?.courses||{}).sort((a,b)=>b[1]-a[1])[0]||["尚無資料",0];
  const positive=(payload.results?.["非常願意"]||0)+(payload.results?.["有意願，視日期與費用而定"]||0);
  const positiveRate=total?Math.round(positive/total*100):0;
  document.querySelector("#summaryCards").innerHTML=`
    <article><span>有效回覆</span><strong class="count-up" data-target="${total}">0</strong><small>份</small></article>
    <article><span>平均滿意度</span><strong class="count-up" data-target="${overall.toFixed(1)}" data-decimals="1">0</strong><small>★</small></article>
    <article class="wide"><span>最受歡迎課程</span><strong>${escapeHtml(top[0])}</strong><small>${top[1]} 票</small></article>
    <article><span>長沙正向意願</span><strong class="count-up" data-target="${positiveRate}">0</strong><small>%</small></article>`;
}

function renderRatings(ratings){
  document.querySelector("#ratingStats").innerHTML=Object.entries(ratings).map(([key,item],index)=>{
    const count=Number(item.count||0),dist=item.distribution||{};
    const segments=[1,2,3,4,5].map(score=>{const pct=count?(Number(dist[score]||0)/count*100):0;return `<i class="star-${score} grow-bar" data-width="${pct}" style="width:0" aria-hidden="true"></i>`;}).join("");
    const rows=[5,4,3,2,1].map(score=>{const value=Number(dist[score]||0),pct=count?Math.round(value/count*100):0;return `<div><span>${score} 星</span><b>${pct}%</b><small>${value} 人</small></div>`;}).join("");
    return `<article class="rating-stat reveal-result" style="--delay:${index*50}ms"><button class="rating-summary" type="button" aria-expanded="false"><span><b>${escapeHtml(item.label||key)}</b><small>共 ${count} 人評分 · 點擊看分布</small></span><strong><span class="count-up" data-target="${Number(item.avg||0).toFixed(1)}" data-decimals="1">0</span> ★</strong></button><div class="distribution-track" role="img" aria-label="${escapeHtml(item.label||key)}，平均 ${Number(item.avg||0).toFixed(1)} 星，共 ${count} 人評分">${segments}</div><div class="distribution-detail" hidden>${rows}</div></article>`;
  }).join("")||'<div class="empty-wall">尚無評分</div>';
}

function renderCourses(courses,total){
  const selected=new Set(safeJSON(localStorage.getItem(STORAGE.courses))||[]);
  const sorted=Object.entries(courses).sort((a,b)=>b[1]-a[1]); const max=Math.max(1,...sorted.map(([,count])=>count));
  document.querySelector("#courseStats").innerHTML=sorted.map(([name,count],index)=>{
    const rate=total?Math.round(count/total*100):0;
    return `<article class="course-stat reveal-result ${selected.has(name)?"is-yours":""} ${index>=5&&!showingAllCourses?"course-hidden":""}" style="--delay:${Math.min(index,8)*50}ms"><div><b><em>${index+1}</em>${escapeHtml(name)}</b>${selected.has(name)?'<small>你的選擇</small>':''}</div><span><strong class="count-up" data-target="${count}">0</strong> 票 · ${rate}% 選擇率</span><div class="mini-track" role="img" aria-label="${escapeHtml(name)}，${count} 票，${rate}% 的填答者選擇"><div class="mini-fill grow-bar" data-width="${count/max*100}" style="width:0"></div></div></article>`;
  }).join("")||'<div class="empty-wall">尚無課程票數</div>';
  const button=document.querySelector("#expandCourses");button.hidden=sorted.length<=5;button.textContent=showingAllCourses?"收合為前 5 名":`展開全部 ${sorted.length} 堂`;
}

document.querySelector("#expandCourses").addEventListener("click",()=>{
  showingAllCourses=!showingAllCourses;
  document.querySelectorAll(".course-stat").forEach((item,index)=>item.classList.toggle("course-hidden",!showingAllCourses&&index>=5));
  document.querySelector("#expandCourses").textContent=showingAllCourses?"收合為前 5 名":`展開全部 ${document.querySelectorAll(".course-stat").length} 堂`;
  initMotion();
});

function renderFeedbacks(items){document.querySelector("#feedbackList").innerHTML=items.map((item,index)=>`<article class="feedback-card reveal-result" style="--delay:${Math.min(index,8)*50}ms"><b>${escapeHtml(item.name||"匿名旅伴")} · ${escapeHtml(item.time||"")}</b><p>${escapeHtml(item.text)}</p></article>`).join("")||'<div class="empty-wall">目前沒有文字回饋</div>';}

function renderIntent(results){
  const total=sumValues(results); document.querySelector("#voteTotal").textContent="0"; document.querySelector("#voteTotal").dataset.target=total; document.querySelector("#voteTotal").classList.add("count-up");
  document.querySelector("#resultBars").innerHTML=Object.entries(optionShort).map(([value,label],index)=>{const count=results[value]||0,percent=total?Math.round(count/total*100):0;return `<div class="bar-row reveal-result" style="--delay:${index*50}ms"><div class="bar-label"><b>${label}</b><span>${percent}% · <strong class="count-up" data-target="${count}">0</strong> 人</span></div><div class="bar-track" role="img" aria-label="${label}，${percent}%，${count} 人"><div class="bar-fill grow-bar" data-width="${percent}" style="width:0"></div></div></div>`;}).join("");
  document.querySelector("#yourVote").textContent="每次更新都會取得目前最新統計";
}

function renderMessages(messages,isPreview){
  document.querySelector("#messageTotal").textContent=`${messages.length} 則${isPreview?" · 預覽":""}`;
  document.querySelector("#messageList").innerHTML=messages.map((item,index)=>`<article class="message-card reveal-result" style="--delay:${Math.min(index,10)*50}ms"><div class="message-meta"><span>${escapeHtml(item.name||"匿名旅伴")} → ${escapeHtml(item.to||"大家")}</span><time>${escapeHtml(item.time||"")}</time></div><p>${escapeHtml(item.message)}</p></article>`).join("")||'<div class="empty-wall">還沒有留言，成為第一位留言的旅伴吧！</div>';
}

function initResultInteractions(){
  document.querySelectorAll(".rating-summary").forEach(button=>button.addEventListener("click",()=>{const detail=button.parentElement.querySelector(".distribution-detail");const open=button.getAttribute("aria-expanded")==="true";button.setAttribute("aria-expanded",String(!open));detail.hidden=open;}));
  initMotion();
}

function initMotion(){
  const targets=[...document.querySelectorAll(".grow-bar,.count-up,.reveal-result")];
  if(reducedMotion){targets.forEach(animateTarget);return;}
  const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){animateTarget(entry.target);observer.unobserve(entry.target);}}),{threshold:.18});
  targets.forEach(target=>{if(!target.dataset.animated)observer.observe(target);});
}

function animateTarget(target){
  if(target.dataset.animated)return; target.dataset.animated="1";
  if(target.classList.contains("grow-bar"))target.style.width=`${target.dataset.width||0}%`;
  if(target.classList.contains("count-up"))countUp(target);
  if(target.classList.contains("reveal-result"))target.classList.add("is-visible");
}

function countUp(element){
  const target=Number(element.dataset.target||0),decimals=Number(element.dataset.decimals||0);
  if(reducedMotion){element.textContent=target.toFixed(decimals);return;}
  const start=performance.now(),duration=700;
  const tick=now=>{const p=Math.min(1,(now-start)/duration),eased=1-Math.pow(1-p,3);element.textContent=(target*eased).toFixed(decimals);if(p<1)requestAnimationFrame(tick);};requestAnimationFrame(tick);
}

function buildDemoPayload(data){
  const results={"非常願意":18,"有意願，視日期與費用而定":27,"還不確定":9,"意願不高":3,"不會參加":1};results[data["2027長沙CMF意願"]]++;
  const courses=Object.fromEntries(courseChecks.map((item,index)=>[item.value,Math.max(2,24-index)]));data["最有印象的三堂課"].split("、").forEach(course=>courses[course]++);
  const ratings={};ratingItems.forEach(([,title,name],index)=>{const base={1:1,2:2,3:5,4:18,5:33};base[Number(data[name])]++;const count=sumValues(base),sum=Object.entries(base).reduce((s,[score,n])=>s+Number(score)*n,0);ratings[name]={label:title.replace("？",""),avg:sum/count,count,distribution:base};});
  return {ok:true,total:59,updatedAt:new Date().toISOString(),results,stats:{ratings,courses,feedbacks:[...(data["旅程回饋"]?[{name:data["姓名"]||"匿名旅伴",text:data["旅程回饋"],time:"剛剛"}]:[]),{name:"匿名旅伴",text:"最喜歡泰山與課程交流，希望下次自由時間再多一點。",time:"5 分鐘前"}]},messages:[{name:data["姓名"]||"匿名旅伴",to:data["留言對象"]||"大家",message:data["公開留言"],time:"剛剛"},{name:"雅婷",to:"大家",message:"謝謝大家一路互相照顧，這趟真的很難忘！",time:"3 分鐘前"}]};
}

function sumValues(object={}){return Object.values(object).reduce((sum,value)=>sum+Number(value||0),0);}
function safeJSON(value){try{return JSON.parse(value);}catch(error){return null;}}
function escapeHtml(value){return String(value??"").replace(/[&<>'"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));}
function formatUpdated(value){const date=value?new Date(value):new Date();return new Intl.DateTimeFormat("zh-TW",{month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"}).format(date);}

async function restoreExistingSubmission(){
  const submitted=localStorage.getItem(STORAGE.submitted);
  if(!submitted||isLocalPreview)return;
  currentSubmissionId=submitted; showThanksShell(); await loadAndRenderResults();
}

updateProgress(); restoreExistingSubmission();
