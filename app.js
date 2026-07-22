const ratingItems = [
  [1,"整體而言，你對這趟 CMF 旅程的滿意度如何？","整體滿意度"],
  [2,"行程安排與節奏的滿意度？","行程安排與節奏"],
  [3,"交通與接駁安排的滿意度？","交通與接駁安排"],
  [4,"住宿安排的滿意度？","住宿安排"],
  [5,"餐食安排的滿意度？","餐食安排"],
  [6,"CMF 課程與會場體驗的滿意度？","CMF課程與會場體驗"]
];
const optionShort={"非常願意":"非常願意","有意願，視日期與費用而定":"有意願，視情況而定","還不確定":"還不確定","意願不高":"意願不高","不會參加":"不會參加"};
const wrap=document.querySelector("#ratingQuestions");

ratingItems.forEach(([number,title,name])=>{
  const section=document.createElement("section");
  section.className="question"; section.dataset.question=number;
  section.innerHTML=`<div class="question-head"><span class="number">${String(number).padStart(2,"0")}</span><div><h2>${title}</h2><p>請選擇 1～5 星</p></div></div><div class="rating" role="radiogroup" aria-label="${title}">${[1,2,3,4,5].map(score=>`<label><input type="radio" name="${name}" value="${score}" ${score===1?"required":""}><span>★</span><small>${score}${score===1?" · 待改善":score===5?" · 非常滿意":""}</small></label>`).join("")}</div><p class="error" role="alert"></p>`;
  wrap.appendChild(section);
});

const form=document.querySelector("#surveyForm");
const questions=[...document.querySelectorAll("[data-question]")];
const tripFeedback=form.elements["旅程回饋"];
const publicMessage=form.elements["公開留言"];
const progressBar=document.querySelector("#progressBar");
const progressText=document.querySelector("#progressText");
const courseChecks=[...form.querySelectorAll('input[name="最有印象的三堂課"]')];

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
    missing.forEach(q=>{q.classList.add("invalid");q.querySelector(".error").textContent="請完成這一題";});
    missing[0].scrollIntoView({behavior:"smooth",block:"center"}); return;
  }
  const data=Object.fromEntries(new FormData(form).entries());
  data["最有印象的三堂課"]=courseChecks.filter(item=>item.checked).map(item=>item.value).join("、");
  const button=form.querySelector("button[type=submit]");
  button.disabled=true; button.querySelector("span").textContent="正在送出…";
  try{
    if(!window.CMF_API_URL){
      localStorage.setItem("cmf-2026-survey-preview",JSON.stringify(data));
      const demoResults={"非常願意":18,"有意願，視日期與費用而定":27,"還不確定":9,"意願不高":3,"不會參加":1};
      demoResults[data["2027長沙CMF意願"]]++;
      const demoMessages=[
        {name:"雅婷",to:"大家",message:"謝謝大家一路互相照顧，這趟真的很難忘！",time:"剛剛"},
        {name:"匿名旅伴",to:"領隊",message:"辛苦了，行程安排很用心，期待明年長沙再見。",time:"3 分鐘前"},
        {name:"志明",to:"同桌夥伴",message:"認識大家是這趟旅程最大的收穫。",time:"8 分鐘前"}
      ];
      demoMessages.unshift({name:data["姓名"]||"匿名旅伴",to:data["留言對象"]||"大家",message:data["公開留言"],time:"剛剛",isNew:true});
      const demoCourses=Object.fromEntries(courseChecks.map((item,index)=>[item.value,Math.max(2,24-index)]));
      courseChecks.filter(item=>item.checked).forEach(item=>demoCourses[item.value]++);
      const demoStats={
        ratings:Object.fromEntries(ratingItems.map(([,title,name],index)=>[name,{label:title.replace("？",""),avg:Number((4.3+(index%3)*.15).toFixed(1)),count:59}])),
        courses:demoCourses,
        feedbacks:[...(data["旅程回饋"]?[{name:data["姓名"]||"匿名旅伴",text:data["旅程回饋"],time:"剛剛"}]:[]),{name:"匿名旅伴",text:"最喜歡泰山與課程交流，希望下次自由時間再多一點。",time:"5 分鐘前"}]
      };
      showThanks(demoResults,data["2027長沙CMF意願"],demoMessages,true,demoStats);
    }else{
      await fetch(window.CMF_API_URL,{method:"POST",mode:"no-cors",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({payload:JSON.stringify(data)})});
      const result=await loadPublicResults();
      showThanks(result.results,data["2027長沙CMF意願"],result.messages,false,result.stats);
    }
  }catch(error){
    button.disabled=false; button.querySelector("span").textContent="重新送出回饋";
    alert("目前無法送出，請確認網路或 Google Apps Script 設定後再試一次。");
  }
});

function loadPublicResults(){
  return new Promise((resolve,reject)=>{
    const callback=`cmfResults_${Date.now()}`;
    const script=document.createElement("script");
    const timer=setTimeout(()=>{cleanup();reject(new Error("results timeout"));},12000);
    function cleanup(){clearTimeout(timer);delete window[callback];script.remove();}
    window[callback]=data=>{cleanup();data?.ok?resolve(data):reject(new Error("invalid results"));};
    script.onerror=()=>{cleanup();reject(new Error("results load failed"));};
    script.src=`${window.CMF_API_URL}?action=results&prefix=${encodeURIComponent(callback)}&_=${Date.now()}`;
    document.head.appendChild(script);
  });
}

function showThanks(results,selected,messages,isPreview,stats){
  form.hidden=true; document.querySelector(".progress-wrap").hidden=true;
  const thanks=document.querySelector("#thanks"); thanks.hidden=false;
  renderAllStats(stats); renderResults(results,selected,isPreview); renderMessages(messages,isPreview);
  thanks.scrollIntoView({behavior:"smooth",block:"start"});
}

function renderAllStats(stats={ratings:{},courses:{},feedbacks:[]}){
  document.querySelector("#ratingStats").innerHTML=Object.values(stats.ratings||{}).map(item=>`<div class="rating-stat"><b>${escapeHtml(item.label)}</b><strong>${Number(item.avg||0).toFixed(1)} ★</strong><div class="mini-track"><div class="mini-fill" style="width:${Math.min(100,Number(item.avg||0)/5*100)}%"></div></div></div>`).join("")||'<div class="empty-wall">尚無評分</div>';
  const courses=Object.entries(stats.courses||{}).sort((a,b)=>b[1]-a[1]);
  const maxCourse=Math.max(1,...courses.map(([,count])=>count));
  document.querySelector("#courseStats").innerHTML=courses.map(([name,count])=>`<div class="course-stat"><b>${escapeHtml(name)}</b><span>${count} 票</span><div class="mini-track"><div class="mini-fill" style="width:${count/maxCourse*100}%"></div></div></div>`).join("")||'<div class="empty-wall">尚無課程票數</div>';
  document.querySelector("#feedbackList").innerHTML=(stats.feedbacks||[]).map(item=>`<article class="feedback-card"><b>${escapeHtml(item.name||"匿名旅伴")} · ${escapeHtml(item.time||"")}</b><p>${escapeHtml(item.text)}</p></article>`).join("")||'<div class="empty-wall">目前沒有文字回饋</div>';
}

function renderResults(results,selected,isPreview){
  const total=Object.values(results).reduce((sum,count)=>sum+count,0);
  document.querySelector("#voteTotal").textContent=total;
  document.querySelector("#resultBars").innerHTML=Object.entries(optionShort).map(([value,label])=>{
    const count=results[value]||0,percent=total?Math.round(count/total*100):0;
    return `<div class="bar-row ${value===selected?"is-yours":""}"><div class="bar-label"><b>${label}</b><span>${percent}% · ${count} 人</span></div><div class="bar-track"><div class="bar-fill" data-width="${percent}"></div></div></div>`;
  }).join("");
  document.querySelector("#yourVote").textContent=isPreview?"目前為本機預覽票數；連接 Google 試算表後將顯示真實結果":"結果已更新，謝謝你投下這一票！";
  requestAnimationFrame(()=>requestAnimationFrame(()=>document.querySelectorAll(".bar-fill").forEach(bar=>bar.style.width=`${bar.dataset.width}%`)));
}

function renderMessages(messages,isPreview){
  document.querySelector("#messageTotal").textContent=`${messages.length} 則`;
  document.querySelector("#messageList").innerHTML=messages.length?messages.map(item=>`<article class="message-card ${item.isNew?"is-new":""}"><div class="message-meta"><span>${escapeHtml(item.name||"匿名旅伴")} → ${escapeHtml(item.to||"大家")}</span><time>${escapeHtml(item.time||"")}</time></div><p>${escapeHtml(item.message)}</p></article>`).join(""):'<div class="empty-wall">還沒有留言，成為第一位留言的旅伴吧！</div>';
  if(isPreview)document.querySelector("#messageTotal").textContent+=" · 預覽";
}

function escapeHtml(value){return String(value??"").replace(/[&<>'"]/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[char]));}

updateProgress();
