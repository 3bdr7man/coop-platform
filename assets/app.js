/* منصة التدريب التعاوني وشؤون الخريجين — الواجهة */
(function(){
"use strict";

const S = {
  settings:null, user:null, csrf:"", view:"", data:null, portal:null, loading:false,
  f:{q:"",dept:"",spec:"",entity:"",sector:"",st:"",sup:"",acc:"",mine:true},
  vf:{q:"",sup:""}, wf:{status:"submitted",q:""}, gf:{q:"",st:"",term:""}, af:{kind:""},
  openT:null, sup:{q:"",filter:"",data:null}, loginTab:"trainee", tMode:"login", grads:null, audit:null, weekly:null, wkSel:null, sel:{}
};

/* ---------- helpers ---------- */
const $ = s => document.querySelector(s);
const esc = v => String(v==null?"":v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const hijF = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura-nu-latn",{day:"numeric",month:"long",year:"numeric"});
const gregF = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn",{day:"numeric",month:"short",year:"numeric"});
const timeF = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura-nu-latn",{day:"numeric",month:"short",hour:"numeric",minute:"2-digit"});
const parseD = s => { const [y,m,d]=String(s).slice(0,10).split("-").map(Number); return new Date(y,(m||1)-1,d||1); };
const fmtH = s => { try{ return hijF.format(parseD(s)); }catch(e){ return s||""; } };
const fmtG = s => { try{ return gregF.format(parseD(s)); }catch(e){ return s||""; } };
const fmtT = s => { try{ return timeF.format(new Date(String(s).replace(" ","T"))); }catch(e){ return s||""; } };
const iso = d => d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
const today = () => iso(new Date());
const WEEKS = () => S.settings ? S.settings.weeks : 17;
const weekOf = s => Math.floor((parseD(s)-parseD(S.settings.start))/864e5/7)+1;
const curWeek = () => Math.min(WEEKS(), Math.max(0, weekOf(today())));
const digits = v => String(v||"").replace(/[٠-٩]/g,d=>String(d.charCodeAt(0)-1632)).replace(/[۰-۹]/g,d=>String(d.charCodeAt(0)-1776)).replace(/\D/g,"");
const uniq = a => [...new Set(a.filter(Boolean))].sort((x,y)=>String(x).localeCompare(String(y),"ar"));
const L = k => S.settings.lists[k];
const opt = (list,cur,all) => (all!=null?'<option value="">'+esc(all)+'</option>':'')+list.map(e=>'<option'+(String(cur)===String(e)?' selected':'')+'>'+esc(e)+'</option>').join("");
const fmtCode = c => c ? c.slice(0,4)+"-"+c.slice(4) : "";
const role = () => S.user ? S.user.role : "none";
const isAdmin = () => role()==="admin";
const isStaff = () => role()==="admin" || role()==="supervisor";
const staffName = id => { const s=S.data && S.data.staff.find(x=>Number(x.id)===Number(id)); return s ? s.name : ""; };
const tById = id => S.data.trainees.find(t=>Number(t.id)===Number(id));
const visitsOf = id => S.data.visits.filter(v=>Number(v.trainee_id)===Number(id)).sort((a,b)=>a.visit_date<b.visit_date?1:-1);
const isMine = t => Number(t.supervisor_id)===Number(S.user.id);
const canVisit = t => isAdmin() || (role()==="supervisor" && (isMine(t) || !t.supervisor_id));
const scopeT = () => isAdmin() ? S.data.trainees : S.data.trainees.filter(isMine);
const scopeV = () => isAdmin() ? S.data.visits : S.data.visits.filter(v=>Number(v.created_by)===Number(S.user.id) || (tById(v.trainee_id) && isMine(tById(v.trainee_id))));
const waLink = (phone,text) => { let p=digits(phone); if(/^05\d{8}$/.test(p)) p="966"+p.slice(1); else if(/^5\d{8}$/.test(p)) p="966"+p; return /^9665\d{8}$/.test(p) ? "https://wa.me/"+p+"?text="+encodeURIComponent(text) : ""; };

function toast(msg){ const t=$("#toast"); t.innerHTML='<div class="toast" role="status">'+esc(msg)+'</div>'; clearTimeout(toast._t); toast._t=setTimeout(()=>t.innerHTML="",3200); }
async function copyText(txt,okMsg){ try{ await navigator.clipboard.writeText(txt); toast(okMsg||"نُسخ"); return true; }catch(e){ toast("تعذّر النسخ تلقائياً. انسخ النص يدوياً."); return false; } }

/* ---------- API ---------- */
async function api(a, body, form, retried){
  const o={method:"POST",credentials:"same-origin",cache:"no-store",headers:{"X-CSRF":S.csrf}};
  if(form){ o.body=body; } else { o.headers["Content-Type"]="application/json"; o.body=JSON.stringify(body||{}); }
  let r, j;
  try{ r=await fetch("api.php?a="+encodeURIComponent(a),o); }catch(e){ throw new Error("تعذّر الاتصال بالخادم. تحقّق من الإنترنت وأعد المحاولة."); }
  try{ j=await r.json(); }catch(e){ throw new Error("استجابة غير متوقعة من الخادم (رمز "+r.status+"). حدّث الصفحة وأعد المحاولة."); }
  if(r.status===419 && !retried){ await loadSession(); if(S.user) return api(a, body, form, true); }
  if(r.status===401 || r.status===419){
    try{ await loadSession(); }catch(e){}
    if(!S.user && !["login","activate"].includes(a)){ S.data=null; S.portal=null; S.openT=null; closeModal(); $("#app").dataset.screen=""; paint(); setTimeout(()=>{ const e=$("#lerr"); if(e) e.textContent="انتهت جلستك. سجّل الدخول مرة أخرى."; },50); }
    throw new Error(j.error||"انتهت الجلسة.");
  }
  if(!j.ok) throw new Error(j.error||"تعذّر تنفيذ الطلب.");
  return j.data;
}
async function loadSession(){
  const r=await fetch("api.php?a=session",{credentials:"same-origin",cache:"no-store"}); const j=await r.json();
  if(!j.ok) throw new Error(j.error||"تعذّر فتح المنصة.");
  S.csrf=j.data.csrf; S.settings=j.data.settings; S.user=j.data.user||null;
}
async function loadData(){
  if(isStaff()){ S.data=await api("bootstrap"); }
  else if(role()==="trainee"){ S.portal=await api("portal"); }
}
async function refresh(){ try{ await loadData(); }catch(e){ toast(e.message); } paint(); }

/* ---------- boot ---------- */
async function boot(){
  try{ await loadSession(); }catch(e){ $("#app").innerHTML='<div class="panel empty"><h2>تعذّر فتح المنصة</h2><p>'+esc(e.message)+'</p></div>'; return; }
  brand();
  if(S.user && !S.user.must_change){ try{ await loadData(); }catch(e){ toast(e.message); } }
  const h=location.hash.replace("#",""); if(h) S.view=h;
  paint();
  if("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(()=>{});
  const net=()=>{ $("#net").hidden=navigator.onLine; }; addEventListener("online",()=>{ net(); if(S.user) refresh(); }); addEventListener("offline",net); net();
  document.addEventListener("visibilitychange",()=>{ if(document.visibilityState==="visible" && !S.dirty && !$("#modal").innerHTML && S.user && !S.user.must_change && Date.now()-(boot._last||0)>60000){ boot._last=Date.now(); refresh(); } });
}
function brand(){
  const st=S.settings, m=$("#brandMark");
  if(st.logo){ m.classList.remove("txt"); m.innerHTML='<img src="'+esc(st.logo)+'" alt="شعار '+esc(st.org)+'">'; } else { m.classList.add("txt"); m.textContent="TVTC"; }
  $("#brandSub").textContent=st.college+" – "+st.org;
}
function banner(title,sub){
  const st=S.settings;
  return '<div class="banner'+(st.banner?' img':'')+'"'+(st.banner?' style="background-image:linear-gradient(to top,rgba(6,42,36,.75),rgba(6,42,36,.1)),url('+esc(st.banner)+')"':'')+'><div><h1>'+esc(title)+'</h1>'+(sub?'<p>'+esc(sub)+'</p>':'')+'</div></div>';
}

/* ---------- paint ---------- */
let painting=false;
function keepFocus(fn){
  const a=document.activeElement, id=a&&a.id, pos=a&&a.selectionStart;
  fn();
  if(id){ const n=document.getElementById(id); if(n && n!==document.activeElement){ n.focus(); try{ if(pos!=null) n.setSelectionRange(pos,pos); }catch(e){} } }
}
function tabsFor(){
  const r=role();
  if(r==="trainee") return [["home","الرئيسية"],["weekly","تقاريري الأسبوعية"],["account","حسابي"]];
  const t=[["dash","لوحة المتابعة"],["trainees","المتدربون"],["visits","الزيارات"],["weekly","التقارير الأسبوعية"],["evals","تقييم الجهات"]];
  if(r==="admin") t.push(["access","حسابات المتدربين"],["support","دعم الدخول"],["grads","الخريجون"],["staff","المشرفون"],["notices","الإعلانات"],["log","السجل"],["settings","الإعدادات"]);
  else t.push(["account","حسابي"]);
  return t;
}
function paint(){
  if(painting) return; painting=true;
  if(paint._view!==S.view){ S.dirty=false; paint._view=S.view; }
  try{
    if(!S.user){ $("#who").innerHTML=""; $("#tabs").hidden=true; $("#drawer").innerHTML=""; if($("#app").dataset.screen!=="login:"+S.loginTab+":"+S.tMode){ $("#app").innerHTML=viewLogin(); $("#app").dataset.screen="login:"+S.loginTab+":"+S.tMode; bindLogin(); } return; }
    $("#app").dataset.screen="";
    const r=role();
    $("#who").innerHTML='<div style="text-align:end"><div>'+esc(S.user.name)+'</div><span class="role">'+(r==="admin"?"مسؤول التدريب التعاوني":r==="supervisor"?"مشرف الكلية":"متدرب")+' – <span class="num">'+esc(S.user.username)+'</span></span></div><button class="out" data-act="logout">خروج</button>';
    if(S.user.must_change){ $("#tabs").hidden=true; $("#app").innerHTML=viewForcePw(); return; }
    if((isStaff() && !S.data) || (r==="trainee" && !S.portal)){ $("#tabs").hidden=true; $("#app").innerHTML='<div class="empty">جارٍ تحميل البيانات…</div>'; return; }
    const tabs=tabsFor();
    if(!tabs.some(t=>t[0]===S.view)) S.view=tabs[0][0];
    $("#tabs").hidden=false;
    $("#tabsInner").innerHTML=tabs.map(t=>'<button data-nav="'+t[0]+'"'+(S.view===t[0]?' aria-current="page"':'')+'>'+t[1]+'</button>').join("");
    const V={dash:viewDash,trainees:viewTrainees,visits:viewVisits,weekly:r==="trainee"?viewTWeekly:viewWeekly,evals:viewEvals,access:viewAccess,grads:viewGrads,staff:viewStaff,notices:viewNotices,log:viewLog,support:viewSupport,settings:viewSettings,home:viewHome,account:viewAccount};
    keepFocus(()=>{ $("#app").innerHTML=(V[S.view]||viewDash)(); });
    if(isStaff()) paintDrawer(); else $("#drawer").innerHTML="";
  } finally { painting=false; }
}

/* ---------- login ---------- */
function viewLogin(){
  const st=S.settings, tr=S.loginTab==="trainee";
  let form;
  if(tr && S.tMode==="activate"){
    form='<h2>تفعيل حساب المتدرب</h2><p class="muted" style="margin:0">أدخل رقمك التدريبي ورمز التفعيل الذي وصلك، ثم اختر كلمة مرور خاصة بك.</p>'+seg()+
      '<form id="lform" novalidate autocomplete="off"><label class="lfield">الرقم التدريبي<input id="lacad" name="acad" inputmode="numeric" dir="ltr" required autocomplete="username"></label>'+
      '<label class="lfield">رمز التفعيل<input id="lcode" name="code" dir="ltr" required placeholder="xxxx-xxxx" autocomplete="one-time-code"></label>'+
      '<label class="lfield">كلمة المرور الجديدة<input id="lpw" name="pw" type="password" dir="ltr" required autocomplete="new-password"></label>'+
      '<label class="lfield">تأكيد كلمة المرور<input id="lpw2" name="pw2" type="password" dir="ltr" required autocomplete="new-password"><span class="note" style="font-weight:400">8 خانات على الأقل، وتجمع بين حروف إنجليزية وأرقام.</span></label>'+
      '<label class="showpw"><input type="checkbox" id="lshow"> إظهار كلمة المرور</label><div class="err" id="lerr" role="alert" style="min-height:1.4em;margin-bottom:6px"></div>'+
      '<button class="btn primary lbtn" id="lbtn" type="submit">تفعيل الحساب والدخول</button></form>'+
      '<p style="margin:14px 0 0;font-size:14px">لديك حساب مفعّل؟ <button class="linkbtn" data-tmode="login">سجّل الدخول</button></p>';
  } else {
    form='<h2>تسجيل الدخول</h2><p class="muted" style="margin:0">'+(tr?'ادخل برقمك التدريبي وكلمة المرور.':'ادخل برقمك الوظيفي وكلمة المرور.')+'</p>'+seg()+
      '<form id="lform" novalidate autocomplete="on"><label class="lfield">'+(tr?'الرقم التدريبي':'الرقم الوظيفي')+'<input id="luser" name="username" inputmode="numeric" dir="ltr" required autocomplete="username"></label>'+
      '<label class="lfield">كلمة المرور<input id="lpw" name="pw" type="password" dir="ltr" required autocomplete="current-password"></label>'+
      '<label class="showpw"><input type="checkbox" id="lshow"> إظهار كلمة المرور</label><div class="err" id="lerr" role="alert" style="min-height:1.4em;margin-bottom:6px"></div>'+
      '<button class="btn primary lbtn" id="lbtn" type="submit">دخول</button></form>'+
      (tr?'<p style="margin:14px 0 0;font-size:14px">أول مرة تدخل؟ <button class="linkbtn" data-tmode="activate">فعّل حسابك برمز التفعيل</button></p>':'');
  }
  return '<div class="login"><div class="media"'+(st.banner?' style="background-image:url('+esc(st.banner)+')"':'')+'>'+(st.logo?'<span class="chip"><img src="'+esc(st.logo)+'" alt="شعار '+esc(st.org)+'"></span>':'')+'<h1>منصة التدريب التعاوني وشؤون الخريجين</h1><p>'+esc(st.college)+' – '+esc(st.semester)+'</p></div>'+
    '<div class="side">'+form+'<div class="lfoot">'+(tr?'لم يصلك رمز التفعيل أو نسيت كلمة المرور؟ تواصل مع مسؤول التدريب التعاوني'+(st.contact?' <b>'+esc(st.contact)+'</b>':'')+'.':'نسيت كلمة المرور؟ يعيد مسؤول التدريب التعاوني تعيينها لك.')+'</div></div></div>';
}
function seg(){ const b=(k,l)=>'<button role="tab" type="button" data-ltab="'+k+'" aria-selected="'+(S.loginTab===k)+'">'+l+'</button>'; return '<div class="seg" role="tablist" aria-label="نوع المستخدم">'+b("trainee","المتدربون")+b("staff","منسوبو الكلية")+'</div>'; }
function bindLogin(){
  const form=$("#lform"); if(!form) return;
  $("#lshow").onchange=e=>form.querySelectorAll("input[type=password],input[data-pw]").forEach(i=>{ i.dataset.pw=1; i.type=e.target.checked?"text":"password"; });
  form.onsubmit=async ev=>{
    ev.preventDefault(); const err=$("#lerr"), btn=$("#lbtn"), E=n=>form.elements[n]; err.textContent="";
    const label=btn.textContent;
    try{
      btn.disabled=true; btn.textContent="جارٍ التحقق…";
      let res;
      if(S.loginTab==="trainee" && S.tMode==="activate"){
        if(E("pw").value!==E("pw2").value) throw new Error("كلمتا المرور غير متطابقتين.");
        res=await api("activate",{acad:E("acad").value,code:E("code").value,password:E("pw").value});
      } else {
        res=await api("login",{kind:S.loginTab==="trainee"?"trainee":"staff",username:E("username").value,password:E("pw").value});
      }
      S.user=res.user; S.csrf=res.csrf; S.view="";
      if(!S.user.must_change) await loadData();
      paint(); toast("مرحباً "+String(S.user.name).split(/\s+/)[0]);
    }catch(e){ err.textContent=e.message; btn.disabled=false; btn.textContent=label; }
  };
}
function viewForcePw(){
  return '<div class="panel" style="max-width:520px;margin:30px auto"><h2>غيّر كلمة المرور المؤقتة</h2><p class="muted">دخلت بكلمة مرور مؤقتة. اختر كلمة مرور خاصة بك لتكمل.</p>'+pwForm()+'</div>';
}
function pwForm(){
  return '<form class="form" id="pwform" style="grid-template-columns:1fr" novalidate><label>كلمة المرور الحالية<input name="current" type="password" dir="ltr" autocomplete="current-password"></label><label>كلمة المرور الجديدة<input name="new" type="password" dir="ltr" autocomplete="new-password"><span class="hint">8 خانات على الأقل، وتجمع بين حروف إنجليزية وأرقام.</span></label><label>تأكيد كلمة المرور<input name="new2" type="password" dir="ltr" autocomplete="new-password"></label><div class="err" id="pwerr" role="alert"></div><div class="actions" style="margin-top:0"><button class="btn primary" type="submit">حفظ كلمة المرور</button></div></form>';
}
async function submitPw(form){
  const E=n=>form.elements[n], err=$("#pwerr"); err.textContent="";
  if(E("new").value!==E("new2").value){ err.textContent="كلمتا المرور غير متطابقتين."; return; }
  try{ const r=await api("password",{current:E("current").value,new:E("new").value}); S.user=r.user; toast("حُفظت كلمة المرور"); await loadData(); paint(); }
  catch(e){ err.textContent=e.message; }
}

/* ---------- staff: dashboard ---------- */
function viewDash(){
  const ts=scopeT(), vs=scopeV(), cw=curWeek(), W=WEEKS(), st=S.settings;
  const perWeek=Array(W+1).fill(0); vs.forEach(v=>{ const w=weekOf(v.visit_date); if(w>=1&&w<=W) perWeek[w]++; });
  const max=Math.max(1,...perWeek);
  const active=ts.filter(t=>t.reg_status!=="خريج" && t.reg_status!=="مطوي قيده");
  const started=active.filter(t=>t.start_status==="مباشر").length;
  const ids=new Set(ts.map(t=>Number(t.id)));
  const wk=S.data.weekly.filter(w=>ids.has(Number(w.trainee_id)));
  const pendingW=wk.filter(w=>w.status==="submitted").length;
  const thisWeek=new Set(wk.filter(w=>Number(w.week)===cw).map(w=>Number(w.trainee_id)));
  const evs=S.data.evals.filter(e=>ids.has(Number(e.trainee_id)));
  const endS=iso(new Date(parseD(st.start).getTime()+(W*7-1)*864e5));
  let h=banner(isAdmin()?'لوحة متابعة التدريب التعاوني':'مرحباً '+String(S.user.name).split(/\s+/)[0], st.college+' – '+st.semester);
  h+='<section class="panel"><div class="hero"><div class="wk">'+(cw<1?'لم يبدأ الفصل التدريبي بعد':'الأسبوع التدريبي')+'<strong class="num">'+(cw<1?0:cw)+' / '+W+'</strong><span class="muted">'+esc(fmtH(st.start))+' – '+esc(fmtH(endS))+'</span></div><div><div class="ruler" style="grid-template-columns:repeat('+W+',1fr)" role="img" aria-label="عدد الزيارات في كل أسبوع">';
  for(let w=1;w<=W;w++){ const c=perWeek[w]; h+='<div class="col'+(w<cw?' past':'')+(w===cw?' now':'')+'" title="الأسبوع '+w+': '+c+' زيارة">'+(c?'<span class="c num">'+c+'</span>':'')+'<div class="bar" style="height:'+Math.round(c/max*78)+'%"></div><div class="base"></div><span class="n num">'+w+'</span></div>'; }
  h+='</div><div class="note" style="margin-top:6px">الأعمدة: عدد الزيارات المسجّلة في كل أسبوع'+(isAdmin()?'':' لمتدربيك')+'.</div></div></div>'+
    '<div class="figs"><div><b class="num">'+ts.length+'</b><span>'+(isAdmin()?'متدرباً في التدريب التعاوني':'متدرباً مسنداً إليك')+'</span></div><div><b class="num">'+started+'</b><span>باشروا التدريب</span></div><div><b class="num">'+vs.length+'</b><span>زيارة مسجّلة</span></div><div><b class="num">'+thisWeek.size+' / '+active.length+'</b><span>سلّموا تقرير هذا الأسبوع</span></div><div><b class="num">'+evs.length+'</b><span>تقييماً من جهات التدريب</span></div></div></section>';
  const cutoff=Math.max(1,cw-2);
  const due=active.map(t=>({t,last:visitsOf(t.id)[0]})).filter(x=>!x.last || weekOf(x.last.visit_date)<cutoff);
  h+='<div class="two" style="margin-top:18px"><section class="panel"><h3>يحتاجون زيارة <span class="muted" style="font-weight:400">('+due.length+')</span></h3><p class="note" style="margin-top:-6px">لم تُسجّل لهم زيارة خلال آخر ثلاثة أسابيع.</p>';
  if(!ts.length) h+='<div class="empty">'+(isAdmin()?'لا يوجد متدربون بعد. ابدأ باستيراد الكشف من صفحة «المتدربون».':'لا يوجد متدربون مسندون إليك. راجع مسؤول التدريب التعاوني.')+'</div>';
  else if(!due.length) h+='<div class="empty">جميع المتدربين زِيروا مؤخراً.</div>';
  else h+='<table class="list"><tbody>'+due.slice(0,10).map(x=>'<tr class="click" data-open="'+x.t.id+'" tabindex="0"><td class="tname"><b>'+esc(x.t.name)+'</b><small>'+esc(x.t.entity||"جهة غير محددة")+'</small></td><td style="text-align:end">'+(x.last?'<span class="tag warn">آخر زيارة '+esc(fmtG(x.last.visit_date))+'</span>':'<span class="tag bad">لا توجد زيارة</span>')+'</td></tr>').join("")+'</tbody></table>'+(due.length>10?'<p class="note" style="margin-bottom:0">و'+(due.length-10)+' آخرون.</p>':'');
  h+='</section><section class="panel"><h3>بانتظار المراجعة</h3>'+
    '<div class="kpi-row"><button class="kpi" style="text-align:start;cursor:pointer" data-nav="weekly"><b class="num">'+pendingW+'</b><span>تقريراً أسبوعياً لم يُراجَع</span></button><button class="kpi" style="text-align:start;cursor:pointer" data-nav="trainees" data-f-st="_none"><b class="num">'+(active.length-started)+'</b><span>لم تُسجَّل مباشرتهم</span></button></div>';
  if(isAdmin()){
    const depts=uniq(S.data.trainees.map(t=>t.dept));
    h+='<h3 style="margin-top:20px">حسب القسم</h3><div class="scroll"><table class="list"><thead><tr><th>القسم</th><th>متدربون</th><th>مباشر</th><th>زيارات</th></tr></thead><tbody>'+depts.map(d=>{ const t=S.data.trainees.filter(x=>x.dept===d), s=new Set(t.map(x=>Number(x.id))); return '<tr class="click" data-fdept="'+esc(d)+'"><td>'+esc(d)+'</td><td class="num">'+t.length+'</td><td class="num">'+t.filter(x=>x.start_status==="مباشر").length+'</td><td class="num">'+S.data.visits.filter(v=>s.has(Number(v.trainee_id))).length+'</td></tr>'; }).join("")+'</tbody></table></div>';
    const noSup=S.data.trainees.filter(t=>!t.supervisor_id).length;
    if(noSup) h+='<p class="note" style="margin-bottom:0"><span class="tag warn">'+noSup+' متدرباً بلا مشرف من الكلية</span> <button class="btn sm" data-nav="staff">التعيين</button></p>';
  }
  const nts=S.data.notices.filter(n=>n.audience!=="trainees").slice(0,3);
  if(nts.length) h+='<h3 style="margin-top:20px">إعلانات</h3>'+nts.map(n=>'<div class="notice"><b>'+esc(n.title)+'</b><span class="note">'+esc(fmtT(n.created_at))+'</span>'+(n.body?'<p>'+esc(n.body)+'</p>':'')+'</div>').join("");
  return h+'</section></div>';
}

/* ---------- staff: trainees ---------- */
function stTag(t){
  if(t.reg_status==="خريج") return '<span class="tag">خريج</span>';
  if(t.reg_status==="مطوي قيده") return '<span class="tag bad">مطوي قيده</span>';
  if(t.start_status==="مباشر") return '<span class="tag">مباشر</span>';
  if(t.start_status==="غير مباشر") return '<span class="tag bad">غير مباشر</span>';
  return '<span class="tag warn">لم تُحدَّد المباشرة</span>';
}
function miniRuler(id){
  const ws=new Set(visitsOf(id).map(v=>weekOf(v.visit_date))), cw=curWeek(), W=WEEKS();
  let h='<div class="mini" style="grid-template-columns:repeat('+W+',7px)" aria-hidden="true">';
  for(let w=1;w<=W;w++) h+='<i class="'+(ws.has(w)?'v':w<cw?'p':'')+(w===cw?' now':'')+'"></i>';
  return h+'</div>';
}
function filteredTrainees(){
  const f=S.f, q=f.q.trim(), base=(role()==="supervisor"&&f.mine)?scopeT():S.data.trainees;
  const list=base.filter(t=>(!q || [t.name,t.acad,t.entity,t.field_supervisor,t.phone].join(" ").includes(q))
    && (!f.dept||t.dept===f.dept) && (!f.spec||t.specialty===f.spec) && (!f.entity||t.entity===f.entity) && (!f.sector||t.sector===f.sector)
    && (!f.st || (f.st==="_none"?!t.start_status && t.reg_status!=="خريج":f.st==="خريج"?t.reg_status==="خريج":t.start_status===f.st))
    && (!f.sup || (f.sup==="_none"?!t.supervisor_id:String(t.supervisor_id)===f.sup)));
  return {base,list};
}
function viewTrainees(){
  const f=S.f, {base,list}=filteredTrainees(), sups=S.data.staff.filter(s=>s.role==="supervisor");
  const specs=uniq(S.data.trainees.filter(t=>!f.dept||t.dept===f.dept).map(t=>t.specialty));
  let h='<div class="sec-title"><div><h2>المتدربون</h2><div class="muted">'+list.length+' من '+base.length+' متدرباً</div></div>'+
    (isAdmin()?'<button class="btn" data-act="import">استيراد من Excel</button><a class="btn" href="api.php?a=export&kind=trainees">تصدير الكشف</a><button class="btn primary" data-act="addT">إضافة متدرب</button>':'')+'</div>'+
    '<div class="toolbar"><input type="search" id="fq" placeholder="ابحث بالاسم أو الرقم التدريبي أو الجهة أو الجوال" value="'+esc(f.q)+'" aria-label="بحث">'+
    '<select id="fdept" aria-label="القسم">'+opt(uniq(S.data.trainees.map(t=>t.dept)),f.dept,"كل الأقسام")+'</select>'+
    '<select id="fspec" aria-label="التخصص">'+opt(specs,f.spec,"كل التخصصات")+'</select>'+
    '<select id="fsector" aria-label="القطاع">'+opt(L("sectors"),f.sector,"كل القطاعات")+'</select>'+
    '<select id="fent" aria-label="الجهة">'+opt(uniq(S.data.trainees.filter(t=>!f.sector||t.sector===f.sector).map(t=>t.entity)),f.entity,"كل الجهات")+'</select>'+
    '<select id="fst" aria-label="الحالة"><option value="">كل الحالات</option>'+["مباشر","غير مباشر"].map(x=>'<option'+(f.st===x?' selected':'')+'>'+x+'</option>').join("")+'<option value="_none"'+(f.st==="_none"?' selected':'')+'>لم تُحدَّد المباشرة</option><option'+(f.st==="خريج"?' selected':'')+'>خريج</option></select>'+
    (isAdmin()?'<select id="fsup" aria-label="مشرف الكلية"><option value="">كل المشرفين</option><option value="_none"'+(f.sup==="_none"?' selected':'')+'>بلا مشرف</option>'+sups.map(s=>'<option value="'+s.id+'"'+(f.sup===String(s.id)?' selected':'')+'>'+esc(s.name)+'</option>').join("")+'</select>'
      :'<label class="chk"><input type="checkbox" id="fmine"'+(f.mine?' checked':'')+'> متدربيّ فقط</label>')+
    (f.q||f.dept||f.spec||f.entity||f.sector||f.st||f.sup?'<button class="btn sm" data-act="clearF">مسح الفلاتر</button>':'')+'</div>';
  if(!list.length) return h+'<div class="panel empty">'+(base.length?'لا توجد نتائج مطابقة. غيّر البحث أو الفلاتر.':(isAdmin()?'لا يوجد متدربون. استورد الكشف من ملف Excel أو أضف متدرباً.':'لم يُسنَد إليك متدربون بعد. ألغِ «متدربيّ فقط» لعرض الجميع.'))+'</div>';
  const selN=Object.keys(S.sel).filter(k=>S.sel[k]).length;
  if(isAdmin()) h+='<div class="toolbar" style="margin-top:-4px"><span class="note">'+(selN?'المحدَّد: '+selN:'حدّد متدربين لإجراء جماعي')+'</span>'+(selN?'<select id="bulkSup" aria-label="تعيين مشرف"><option value="">تعيين مشرف للمحدَّدين…</option><option value="_none">بلا مشرف</option>'+sups.map(s=>'<option value="'+s.id+'">'+esc(s.name)+'</option>').join("")+'</select><button class="btn sm" data-act="toGrad">نقل المحدَّدين إلى الخريجين</button><button class="btn sm" data-act="selNone">إلغاء التحديد</button>':'')+'</div>';
  h+='<div class="panel" style="padding:6px 8px"><div class="scroll"><table class="list resp"><thead><tr>'+(isAdmin()?'<th><input type="checkbox" id="selAll" aria-label="تحديد الكل"></th>':'')+'<th>المتدرب</th><th>جهة التدريب</th><th>المشرف الميداني</th><th>مشرف الكلية</th><th>الحالة</th><th>الزيارات</th></tr></thead><tbody>';
  h+=list.map(t=>'<tr class="click" data-open="'+t.id+'" tabindex="0">'+(isAdmin()?'<td class="hide-m"><input type="checkbox" data-sel="'+t.id+'"'+(S.sel[t.id]?' checked':'')+' aria-label="تحديد"></td>':'')+'<td class="tname"><b>'+esc(t.name)+'</b><small class="num">'+esc(t.acad)+'</small> <small>· '+esc(t.specialty||"")+'</small></td>'+
    '<td class="span">'+(t.entity?esc(t.entity)+(t.sector?' <span class="tag">'+esc(t.sector)+'</span>':''):'<span class="muted">غير محددة</span>')+'</td>'+
    '<td class="hide-m">'+(t.field_supervisor?esc(t.field_supervisor)+(t.field_supervisor_phone?'<br><small class="num muted">'+esc(t.field_supervisor_phone)+'</small>':''):'<span class="muted">—</span>')+'</td>'+
    '<td class="hide-m">'+(t.supervisor_id?esc(staffName(t.supervisor_id)):'<span class="tag warn">غير معيّن</span>')+'</td>'+
    '<td>'+stTag(t)+'</td><td style="white-space:nowrap">'+miniRuler(t.id)+' <small class="muted">'+visitsOf(t.id).length+'</small></td></tr>').join("");
  return h+'</tbody></table></div></div>';
}
function paintDrawer(){
  const box=$("#drawer"), t=S.openT && tById(S.openT);
  if(!t){ box.innerHTML=""; return; }
  const vs=visitsOf(t.id), wk=S.data.weekly.filter(w=>Number(w.trainee_id)===Number(t.id)).sort((a,b)=>b.week-a.week), ev=S.data.evals.filter(e=>Number(e.trainee_id)===Number(t.id));
  const dd=(l,v,ltr)=>'<dt>'+l+'</dt><dd'+(ltr?' class="num" style="text-align:right"':'')+'>'+(v?esc(v):'<span class="muted">—</span>')+'</dd>';
  const mine=isAdmin() || isMine(t);
  let h='<div class="scrim" data-close="drawer"><aside class="drawer" role="dialog" aria-modal="true" aria-label="بيانات المتدرب"><div class="head"><div><h2>'+esc(t.name)+'</h2><div class="muted">'+esc(t.entity||"جهة التدريب غير محددة")+'</div><div style="margin-top:6px">'+stTag(t)+'</div></div><button class="x" data-close="drawer" aria-label="إغلاق">×</button></div>'+
    '<dl class="kv">'+dd("الرقم التدريبي",t.acad,1)+dd("القسم",t.dept)+dd("التخصص",t.specialty)+dd("المعدل",t.gpa,1)+dd("جوال المتدرب",t.phone,1)+dd("قطاع الجهة",t.sector)+dd("اكتمال التسجيل",t.reg_status)+
    '<dt>المشرف الميداني</dt><dd>'+(t.field_supervisor?esc(t.field_supervisor)+(t.field_supervisor_phone?' · <span class="num">'+esc(t.field_supervisor_phone)+'</span>':''):'<span class="muted">غير مسجّل</span>')+'</dd>'+
    '<dt>مشرف الكلية</dt><dd>'+(t.supervisor_id?esc(staffName(t.supervisor_id)):'<span class="tag warn">غير معيّن</span>')+'</dd>'+
    (isAdmin()?dd("رقم الهوية",t.nid,1)+dd("رقم الخطاب",t.letter_no)+'<dt>حساب المتدرب</dt><dd>'+accTag(t)+'</dd>':'')+(t.notes?dd("ملاحظات",t.notes):'')+'</dl>'+
    '<div class="actions" style="margin:0 0 18px">'+(canVisit(t)?'<button class="btn primary" data-act="visit" data-id="'+t.id+'">تسجيل زيارة</button>':'')+
    (mine?'<button class="btn" data-act="startSt" data-id="'+t.id+'">تحديث المباشرة</button><button class="btn" data-act="evalLink" data-id="'+t.id+'">رابط تقييم الجهة</button>':'')+
    (isAdmin()?'<button class="btn" data-act="editT" data-id="'+t.id+'">تعديل البيانات</button>':'')+'</div>'+
    '<h3>الزيارات <span class="muted" style="font-weight:400">('+vs.length+')</span></h3><div style="margin-bottom:12px">'+miniRuler(t.id)+'</div>'+
    (vs.length?vs.map(v=>visitCard(v,false)).join(""):'<div class="empty" style="padding:18px">لا توجد زيارات مسجّلة لهذا المتدرب.</div>')+
    '<h3 style="margin-top:20px">التقارير الأسبوعية <span class="muted" style="font-weight:400">('+wk.length+' من '+Math.max(0,curWeek())+')</span></h3>'+
    (wk.length?'<div class="wk-grid">'+wk.map(w=>'<button data-act="openW" data-id="'+w.id+'" class="'+(w.status==="reviewed"?'done':w.status==="returned"?'ret':'')+'"><span class="num">'+w.week+'</span><small>'+(w.status==="reviewed"?'روجع':w.status==="returned"?'مُعاد':'جديد')+'</small></button>').join("")+'</div>':'<div class="empty" style="padding:14px">لم يسلّم تقارير بعد.</div>')+
    '<h3 style="margin-top:20px">تقييم جهة التدريب</h3>'+(ev.length?ev.map(e=>'<div class="visit" style="display:flex;gap:12px;align-items:center"><div class="ring" style="--p:'+Number(e.total)+'"><span class="num">'+Math.round(e.total)+'%</span></div><div style="flex:1"><b>'+esc(e.evaluator_name)+'</b><div class="note">'+esc(fmtT(e.submitted_at))+(e.recommend?' · '+esc(e.recommend):'')+'</div></div><button class="btn sm" data-act="openEval" data-id="'+e.id+'">عرض</button></div>').join(""):'<div class="empty" style="padding:14px">لم تُرسل الجهة تقييمها بعد.'+(mine?' أرسل لها «رابط تقييم الجهة».':'')+'</div>')+
    '</aside></div>';
  box.innerHTML=h;
}
function visitCard(v,withT){
  const t=tById(v.trainee_id)||{}, canDel=isAdmin() || Number(v.created_by)===Number(S.user.id);
  const stc=v.attendance==="متغيب"?"bad":v.attendance==="منتظم"?"":"warn";
  const rep=Number(v.has_file)?'<a class="btn sm" href="api.php?a=file&kind=visit&id='+v.id+'" target="_blank" rel="noopener">عرض التقرير</a>':v.report_url?'<a class="btn sm" href="'+esc(v.report_url)+'" target="_blank" rel="noopener">رابط التقرير</a>':'<span class="tag bad">بلا تقرير</span>';
  return '<div class="visit"><div class="top">'+(withT?'<b data-open="'+v.trainee_id+'" style="cursor:pointer">'+esc(t.name||"")+'</b>':'<b>'+esc(v.type)+'</b>')+'<span class="muted">'+esc(fmtH(v.visit_date))+' <span class="num">('+esc(fmtG(v.visit_date))+')</span></span><span class="tag">الأسبوع '+weekOf(v.visit_date)+'</span>'+
    '<span style="margin-inline-start:auto;display:flex;gap:6px">'+rep+(canDel?'<button class="btn sm danger" data-act="delV" data-id="'+v.id+'">حذف</button>':'')+'</span></div>'+
    (withT?'<div class="note">'+esc(t.entity||"")+' · '+esc(v.type)+'</div>':'')+
    '<div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">'+(v.attendance?'<span class="tag '+stc+'">الانتظام: '+esc(v.attendance)+'</span>':'')+(v.rating?'<span class="tag">الأداء: '+esc(v.rating)+'</span>':'')+(Number(v.met_field)?'<span class="tag">قابل المشرف الميداني</span>':'')+'<span class="note">بواسطة '+esc(staffName(v.created_by)||"—")+'</span></div>'+
    (v.notes?'<p>'+esc(v.notes)+'</p>':'')+'</div>';
}
function accTag(t){
  if(!t.user_id) return '<span class="tag warn">غير مفعّل</span>';
  if(!Number(t.account_active)) return '<span class="tag bad">موقوف</span>';
  if(Number(t.activated)) return '<span class="tag">مفعّل</span>'+(t.trainee_last_login?' <span class="note">آخر دخول '+esc(fmtT(t.trainee_last_login))+'</span>':'');
  return '<span class="tag warn">بانتظار التفعيل</span>';
}

/* ---------- staff: visits ---------- */
function viewVisits(){
  const f=S.vf, q=f.q.trim();
  const vs=scopeV().filter(v=>{ const t=tById(v.trainee_id)||{}; return (!q || [t.name,t.entity,t.acad,v.notes].join(" ").includes(q)) && (!f.sup||String(v.created_by)===f.sup); });
  let h='<div class="sec-title"><div><h2>'+(isAdmin()?'سجل الزيارات الميدانية':'زيارات متدربيّ')+'</h2><div class="muted">'+vs.length+' زيارة، منها '+vs.filter(v=>Number(v.has_file)||v.report_url).length+' بتقرير مرفق</div></div>'+(isAdmin()&&S.data.visits.length?'<a class="btn" href="api.php?a=export&kind=visits">تصدير السجل (CSV)</a>':'')+'</div>'+
    '<div class="toolbar"><input type="search" id="vq" placeholder="ابحث باسم المتدرب أو الجهة أو الملاحظات" value="'+esc(f.q)+'" aria-label="بحث">'+
    (isAdmin()?'<select id="vsup" aria-label="المشرف"><option value="">كل المشرفين</option>'+S.data.staff.map(s=>'<option value="'+s.id+'"'+(f.sup===String(s.id)?' selected':'')+'>'+esc(s.name)+'</option>').join("")+'</select>':'')+'</div>';
  if(!vs.length) return h+'<div class="panel empty">'+(q||f.sup?'لا توجد زيارات مطابقة.':'لا توجد زيارات بعد. افتح متدرباً من صفحة المتدربين واختر «تسجيل زيارة».')+'</div>';
  return h+vs.map(v=>visitCard(v,true)).join("");
}
function visitForm(id){
  const t=tById(id); if(!t) return;
  const n=visitsOf(id).length+1, req=!!S.settings.requireReport;
  openModal('<div class="head"><div><h2>تسجيل زيارة رقم '+n+'</h2><div class="muted">'+esc(t.name)+' · '+esc(t.entity||"")+'</div></div><button class="x" data-close="modal" aria-label="إغلاق">×</button></div>'+
    '<form class="form" id="vform" novalidate><input type="hidden" name="trainee_id" value="'+t.id+'">'+
    '<label>تاريخ الزيارة<input type="date" name="visit_date" required max="'+today()+'" value="'+today()+'"><span class="hint" id="dhint"></span></label>'+
    '<label>نوع الزيارة<select name="type">'+opt(L("visitTypes"),"")+'</select></label>'+
    '<label>انتظام المتدرب<select name="attendance">'+opt(L("attend"),"منتظم")+'</select></label>'+
    '<label>تقييم الأداء<select name="rating">'+opt(L("rating"),"جيد جداً")+'</select></label>'+
    '<label class="chk full" style="flex-direction:row"><input type="checkbox" name="met_field" value="1" checked> تم لقاء المشرف الميداني'+(t.field_supervisor?' ('+esc(t.field_supervisor)+')':'')+'</label>'+
    '<label class="full">ملاحظات الزيارة<textarea name="notes" placeholder="ما لاحظته على المتدرب، والمهام التي يؤديها، وأي توصيات"></textarea></label>'+
    '<div class="full"><div style="font-size:14px;font-weight:500;margin-bottom:5px">تقرير الزيارة</div><label class="drop" id="drop"><input type="file" name="file" accept=".pdf,image/*" style="display:none"><span id="fname">اختر ملف التقرير (PDF أو صورة، حتى '+S.settings.maxUpload+' ميجابايت)</span></label></div>'+
    '<label class="full">أو رابط التقرير<input type="url" name="report_url" placeholder="https://" dir="ltr"><span class="hint">إن كان التقرير محفوظاً في OneDrive أو Google Drive.</span></label>'+
    '<div class="full err" id="verr" role="alert"></div><div class="full actions" style="margin-top:0"><button class="btn primary" type="submit" id="vsave">حفظ الزيارة</button><button class="btn" type="button" data-close="modal">إلغاء</button></div></form>');
  const form=$("#vform");
  const dh=()=>{ const v=form.elements.visit_date.value, w=weekOf(v); $("#dhint").textContent=v?fmtH(v)+" · "+(w>=1&&w<=WEEKS()?"الأسبوع "+w:"خارج أسابيع الفصل"):""; };
  form.elements.visit_date.oninput=dh; dh();
  form.elements.file.onchange=()=>{ const f=form.elements.file.files[0]; $("#fname").textContent=f?f.name+" ("+(f.size/1048576).toFixed(1)+" م.ب)":"اختر ملف التقرير"; $("#drop").classList.toggle("has",!!f); };
  form.onsubmit=async ev=>{
    ev.preventDefault(); const err=$("#verr"), btn=$("#vsave"); err.textContent="";
    const f=form.elements.file.files[0];
    if(req && !f && !form.elements.report_url.value.trim()){ err.textContent="أرفق تقرير الزيارة أو ضع رابطه."; return; }
    if(f && f.size>S.settings.maxUpload*1048576){ err.textContent="حجم الملف أكبر من "+S.settings.maxUpload+" ميجابايت."; return; }
    btn.disabled=true; btn.textContent=f?"جارٍ رفع التقرير…":"جارٍ الحفظ…";
    try{ const fd=new FormData(form); if(!form.elements.met_field.checked) fd.set("met_field","0"); await api("visit.save",fd,true); closeModal(); toast("حُفظت الزيارة"); refresh(); }
    catch(e){ err.textContent=e.message; btn.disabled=false; btn.textContent="حفظ الزيارة"; }
  };
}

/* ---------- staff: weekly ---------- */
function viewWeekly(){
  if(!S.weekly){ loadWeekly(); return '<div class="empty">جارٍ تحميل التقارير…</div>'; }
  const f=S.wf, q=f.q.trim();
  const list=S.weekly.filter(w=>(!f.status||w.status===f.status) && (!q || [w.trainee_name,w.entity,w.tasks].join(" ").includes(q)));
  const cnt=k=>S.weekly.filter(w=>w.status===k).length;
  let h='<div class="sec-title"><div><h2>التقارير الأسبوعية</h2><div class="muted">يكتب المتدرب ما أنجزه كل أسبوع، ويراجعه مشرف الكلية.</div></div><button class="btn" data-act="reloadW">تحديث</button></div>'+
    '<div class="toolbar"><input type="search" id="wq" placeholder="ابحث باسم المتدرب أو الجهة أو المحتوى" value="'+esc(f.q)+'" aria-label="بحث"><select id="wst" aria-label="الحالة"><option value="">كل التقارير ('+S.weekly.length+')</option><option value="submitted"'+(f.status==="submitted"?' selected':'')+'>بانتظار المراجعة ('+cnt("submitted")+')</option><option value="reviewed"'+(f.status==="reviewed"?' selected':'')+'>روجعت ('+cnt("reviewed")+')</option><option value="returned"'+(f.status==="returned"?' selected':'')+'>أُعيدت للمتدرب ('+cnt("returned")+')</option></select></div>';
  const ts=scopeT().filter(t=>t.reg_status!=="خريج"&&t.reg_status!=="مطوي قيده"), cw=curWeek();
  if(cw>=1 && ts.length){ const got=new Set(S.data.weekly.filter(w=>Number(w.week)===cw).map(w=>Number(w.trainee_id))); const miss=ts.filter(t=>!got.has(Number(t.id)));
    h+='<div class="callout'+(miss.length?'':' ok')+'" style="margin-bottom:14px">الأسبوع '+cw+': سلّم '+(ts.length-miss.length)+' من '+ts.length+' متدرباً.'+(miss.length&&miss.length<=15?' لم يسلّم: '+miss.map(t=>esc(t.name.split(/\s+/).slice(0,2).join(" "))).join("، ")+'.':'')+'</div>'; }
  if(!list.length) return h+'<div class="panel empty">لا توجد تقارير مطابقة.</div>';
  return h+list.map(w=>'<div class="visit"><div class="top"><b data-open="'+w.trainee_id+'" style="cursor:pointer">'+esc(w.trainee_name)+'</b><span class="tag">الأسبوع '+w.week+'</span>'+wTag(w.status)+'<span class="muted">'+esc(fmtT(w.submitted_at))+'</span><span style="margin-inline-start:auto"><button class="btn sm primary" data-act="openW" data-id="'+w.id+'">'+(w.status==="submitted"?'مراجعة':'عرض')+'</button></span></div><div class="note">'+esc(w.entity||"")+(w.hours?' · '+esc(w.hours)+' ساعة':'')+'</div><p>'+esc(String(w.tasks).slice(0,220))+(String(w.tasks).length>220?'…':'')+'</p></div>').join("");
}
const wTag = s => s==="reviewed"?'<span class="tag">روجع</span>':s==="returned"?'<span class="tag bad">أُعيد للتعديل</span>':'<span class="tag warn">بانتظار المراجعة</span>';
async function loadWeekly(){ try{ S.weekly=await api("weekly.list",{}); }catch(e){ S.weekly=[]; toast(e.message); } paint(); }
async function openWeekly(id){
  let w=(S.weekly||[]).find(x=>Number(x.id)===Number(id));
  if(!w){ try{ const all=await api("weekly.list",{}); S.weekly=all; w=all.find(x=>Number(x.id)===Number(id)); }catch(e){ toast(e.message); return; } }
  if(!w){ toast("لا تملك صلاحية عرض هذا التقرير."); return; }
  const t=tById(w.trainee_id)||{}, can=isAdmin()||isMine(t);
  openModal('<div class="head"><div><h2>تقرير الأسبوع '+w.week+'</h2><div class="muted">'+esc(w.trainee_name)+' · '+esc(w.entity||"")+'</div><div style="margin-top:6px">'+wTag(w.status)+'</div></div><button class="x" data-close="modal" aria-label="إغلاق">×</button></div>'+
    '<h3>المهام المنجزة</h3><p style="white-space:pre-wrap;margin-top:0">'+esc(w.tasks)+'</p>'+(w.skills?'<h3>المهارات المكتسبة</h3><p style="white-space:pre-wrap;margin-top:0">'+esc(w.skills)+'</p>':'')+(w.challenges?'<h3>الصعوبات</h3><p style="white-space:pre-wrap;margin-top:0">'+esc(w.challenges)+'</p>':'')+
    '<p class="note">'+(w.hours?'عدد الساعات: '+esc(w.hours)+' · ':'')+'سُلّم '+esc(fmtT(w.submitted_at))+(Number(w.has_file)?' · <a href="api.php?a=file&kind=weekly&id='+w.id+'" target="_blank" rel="noopener">فتح المرفق</a>':'')+'</p>'+
    (can?'<form class="form" id="wform" style="grid-template-columns:1fr" novalidate><label>ملاحظة المشرف<textarea name="comment" placeholder="ملاحظتك للمتدرب (مطلوبة عند الإعادة)">'+esc(w.sup_comment||"")+'</textarea></label><div class="err" id="werr" role="alert"></div><div class="actions" style="margin-top:0"><button class="btn primary" type="button" data-act="reviewW" data-id="'+w.id+'" data-st="reviewed">اعتماد التقرير</button><button class="btn danger" type="button" data-act="reviewW" data-id="'+w.id+'" data-st="returned">إعادته للتعديل</button></div></form>':(w.sup_comment?'<div class="callout ok">'+esc(w.sup_comment)+'</div>':'')));
}

/* ---------- staff: field evaluations ---------- */
function viewEvals(){
  const ids=new Set(scopeT().map(t=>Number(t.id))), evs=S.data.evals.filter(e=>isAdmin()||ids.has(Number(e.trainee_id)));
  const ts=scopeT(), withEval=new Set(evs.map(e=>Number(e.trainee_id))), missing=ts.filter(t=>!withEval.has(Number(t.id)) && t.reg_status!=="مطوي قيده");
  const avg=evs.length?Math.round(evs.reduce((n,e)=>n+Number(e.total),0)/evs.length):0;
  let h='<div class="sec-title"><div><h2>تقييم جهات التدريب</h2><div class="muted">يعبّئ المشرف الميداني نموذج التقييم برابط خاص بكل متدرب، دون حساب في المنصة.</div></div>'+(isAdmin()&&evs.length?'<a class="btn" href="api.php?a=export&kind=evals">تصدير التقييمات (CSV)</a>':'')+'</div>'+
    '<div class="kpi-row" style="margin:14px 0"><div class="kpi"><b class="num">'+evs.length+'</b><span>تقييماً مستلماً</span></div><div class="kpi"><b class="num">'+missing.length+'</b><span>متدرباً بلا تقييم</span></div><div class="kpi"><b class="num">'+(evs.length?avg+'%':'—')+'</b><span>متوسط التقييم</span></div></div>';
  h+='<div class="split"><section class="panel"><h3>التقييمات المستلمة</h3>'+(evs.length?evs.map(e=>{ const t=tById(e.trainee_id)||{}; return '<div class="visit" style="display:flex;gap:12px;align-items:center"><div class="ring" style="--p:'+Number(e.total)+'"><span class="num">'+Math.round(e.total)+'%</span></div><div style="flex:1;min-width:0"><b data-open="'+e.trainee_id+'" style="cursor:pointer">'+esc(t.name||"")+'</b><div class="note">'+esc(t.entity||"")+' · '+esc(e.evaluator_name)+'</div></div><button class="btn sm" data-act="openEval" data-id="'+e.id+'">عرض</button></div>'; }).join(""):'<div class="empty">لم تصل تقييمات بعد.</div>')+'</section>'+
    '<section class="panel"><h3>بانتظار تقييم الجهة <span class="muted" style="font-weight:400">('+missing.length+')</span></h3><p class="note" style="margin-top:-6px">أرسل الرابط للمشرف الميداني عبر واتساب أو انسخه.</p>'+
    (missing.length?'<table class="list"><tbody>'+missing.slice(0,60).map(t=>'<tr><td class="tname"><b>'+esc(t.name)+'</b><small>'+esc(t.entity||"جهة غير محددة")+(t.field_supervisor?' · '+esc(t.field_supervisor):'')+'</small></td><td style="text-align:end;white-space:nowrap">'+(isAdmin()||isMine(t)?'<button class="btn sm" data-act="evalLink" data-id="'+t.id+'">إرسال الرابط</button>':'')+'</td></tr>').join("")+'</tbody></table>':'<div class="empty">جميع المتدربين قُيّموا.</div>')+'</section></div>';
  return h;
}
async function evalLink(id){
  const t=tById(id); if(!t) return;
  try{
    const r=await api("eval.link",{trainee_id:id});
    const msg="السلام عليكم "+(t.field_supervisor||"")+"\nنشكر لكم تدريب المتدرب "+t.name+" من "+S.settings.college+".\nنأمل تعبئة نموذج تقييمه (دقيقتان، دون تسجيل):\n"+r.url;
    const wa=waLink(t.field_supervisor_phone,msg);
    openModal('<div class="head"><div><h2>رابط تقييم جهة التدريب</h2><div class="muted">'+esc(t.name)+' · '+esc(t.entity||"")+'</div></div><button class="x" data-close="modal" aria-label="إغلاق">×</button></div>'+
      '<p>أرسل هذا الرابط للمشرف الميداني'+(t.field_supervisor?' <b>'+esc(t.field_supervisor)+'</b>':'')+'. يُقبل تقييم واحد لكل متدرب.</p>'+
      '<input readonly dir="ltr" value="'+esc(r.url)+'" style="width:100%;border:1px solid var(--line);background:var(--paper);border-radius:7px;padding:8px 10px" onclick="this.select()">'+
      '<div class="actions">'+(wa?'<a class="btn primary" href="'+esc(wa)+'" target="_blank" rel="noopener">إرسال عبر واتساب</a>':'<span class="note">أضف جوال المشرف الميداني في بيانات المتدرب لتفعيل الإرسال عبر واتساب.</span>')+'<button class="btn" data-act="copy" data-text="'+esc(msg)+'">نسخ الرسالة</button><button class="btn" data-act="copy" data-text="'+esc(r.url)+'">نسخ الرابط فقط</button><button class="btn sm danger" data-act="renewEval" data-id="'+id+'">استبدال الرابط</button></div>');
  }catch(e){ toast(e.message); }
}
async function openEval(id){
  try{
    const e=await api("eval.get",{id}), c=L("criteria");
    openModal('<div class="head"><div><h2>تقييم جهة التدريب</h2><div class="muted">'+esc(e.trainee_name)+'</div></div><button class="x" data-close="modal" aria-label="إغلاق">×</button></div>'+
      '<div style="display:flex;gap:14px;align-items:center;margin-bottom:12px"><div class="ring" style="--p:'+Number(e.total)+';width:78px;height:78px"><span class="num" style="width:62px;height:62px">'+Math.round(e.total)+'%</span></div><div><b>'+esc(e.evaluator_name)+'</b>'+(e.evaluator_title?'<div class="note">'+esc(e.evaluator_title)+'</div>':'')+(e.evaluator_phone?'<div class="note num">'+esc(e.evaluator_phone)+'</div>':'')+'<div class="note">'+esc(fmtT(e.submitted_at))+'</div></div></div>'+
      '<table class="list"><tbody>'+c.map((x,i)=>'<tr><td>'+esc(x)+'</td><td style="width:40%"><div class="bar-h"><i style="width:'+((e.scores[i]||0)*20)+'%"></i></div></td><td class="num" style="text-align:end">'+(e.scores[i]||"—")+' / 5</td></tr>').join("")+'</tbody></table>'+
      (e.recommend?'<p><b>التوصية:</b> '+esc(e.recommend)+'</p>':'')+(e.comments?'<p style="white-space:pre-wrap">'+esc(e.comments)+'</p>':'')+
      (isAdmin()?'<div class="actions"><button class="btn sm danger" data-act="delEval" data-id="'+e.id+'">حذف التقييم (يسمح بتقييم جديد)</button></div>':''));
  }catch(x){ toast(x.message); }
}

/* ---------- admin: trainee accounts ---------- */
function viewAccess(){
  const all=S.data.trainees, f=S.f, q=f.q.trim();
  const on=all.filter(t=>t.user_id), act=on.filter(t=>Number(t.activated)), off=all.filter(t=>!t.user_id);
  const list=all.filter(t=>(!q || [t.name,t.acad,t.phone].join(" ").includes(q)) && (!f.acc || (f.acc==="off"?!t.user_id:f.acc==="wait"?(t.user_id&&!Number(t.activated)):f.acc==="on"?Number(t.activated):false)));
  const msg=t=>"المتدرب "+t.name+"\nللدخول إلى منصة التدريب التعاوني – "+S.settings.college+":\nافتح الرابط: "+location.origin+location.pathname.replace(/[^/]*$/,"")+"\nاختر «فعّل حسابك برمز التفعيل».\nالرقم التدريبي: "+t.acad+"\nرمز التفعيل: "+fmtCode(t.activation_code)+"\nلا تشارك الرمز مع أحد.";
  let h='<div class="sec-title"><div><h2>حسابات المتدربين</h2><p class="muted" style="margin:0">يُولَّد لكل متدرب رمز تفعيل يُستخدم مرة واحدة، ثم يختار كلمة مرور خاصة به.</p></div>'+
    (off.length?'<button class="btn primary" data-act="issueAll">توليد رموز لـ '+off.length+' متدرباً</button>':'')+(on.length?'<a class="btn" href="api.php?a=export&kind=codes">تصدير الرموز (CSV)</a>':'')+'</div>'+
    '<div class="kpi-row" style="margin:14px 0"><div class="kpi"><b class="num">'+act.length+'</b><span>فعّلوا حساباتهم</span></div><div class="kpi"><b class="num">'+(on.length-act.length)+'</b><span>بانتظار التفعيل</span></div><div class="kpi"><b class="num">'+off.length+'</b><span>بلا رمز بعد</span></div></div>'+
    '<div class="toolbar"><input type="search" id="fq" placeholder="ابحث بالاسم أو الرقم التدريبي أو الجوال" value="'+esc(f.q)+'" aria-label="بحث"><select id="facc" aria-label="حالة الحساب"><option value="">كل المتدربين</option><option value="on"'+(f.acc==="on"?' selected':'')+'>مفعّل</option><option value="wait"'+(f.acc==="wait"?' selected':'')+'>بانتظار التفعيل</option><option value="off"'+(f.acc==="off"?' selected':'')+'>بلا رمز</option></select></div>';
  h+='<section class="panel" style="padding:6px 8px"><div class="scroll"><table class="list"><thead><tr><th>المتدرب</th><th>الجوال</th><th>الحساب</th><th>رمز التفعيل</th><th></th></tr></thead><tbody>'+
    (list.length?list.map(t=>{ const code=t.activation_code, wa=code?waLink(t.phone,msg(t)):"";
      return '<tr><td class="tname"><b>'+esc(t.name)+'</b><small class="num">'+esc(t.acad)+'</small></td><td class="num">'+esc(t.phone||"—")+'</td><td>'+accTag(t)+'</td><td>'+(code?'<span class="code">'+esc(fmtCode(code))+'</span>':'<span class="muted">—</span>')+'</td><td style="text-align:end;white-space:nowrap">'+
        (!t.user_id?'<button class="btn sm" data-act="issue" data-id="'+t.id+'">توليد رمز</button>':
          (code?(wa?'<a class="btn sm" href="'+esc(wa)+'" target="_blank" rel="noopener">واتساب</a> ':'')+'<button class="btn sm" data-act="copy" data-text="'+esc(msg(t))+'">نسخ الرسالة</button> ':'')+
          '<button class="btn sm" data-act="reissue" data-id="'+t.id+'">'+(Number(t.activated)?'إعادة تعيين':'رمز جديد')+'</button> <button class="btn sm'+(Number(t.account_active)?' danger':'')+'" data-act="accToggle" data-id="'+t.id+'">'+(Number(t.account_active)?'إيقاف':'تفعيل')+'</button>')+'</td></tr>'; }).join(""):'<tr><td colspan="5" class="empty">لا توجد نتائج.</td></tr>')+'</tbody></table></div></section>';
  return h;
}

/* ---------- admin: graduates ---------- */
function viewGrads(){
  if(!S.grads){ api("grad.list").then(g=>{ S.grads=g; paint(); }).catch(e=>{ S.grads=[]; toast(e.message); paint(); }); return '<div class="empty">جارٍ تحميل الخريجين…</div>'; }
  const f=S.gf, q=f.q.trim(), g=S.grads;
  const list=g.filter(x=>(!q||[x.name,x.acad,x.employer,x.phone].join(" ").includes(q)) && (!f.st||x.status===f.st) && (!f.term||x.grad_term===f.term));
  const by=k=>g.filter(x=>x.status===k).length, emp=by("يعمل"), known=g.length-by("غير معروف");
  let h='<div class="sec-title"><div><h2>شؤون الخريجين</h2><div class="muted">متابعة الخريجين بعد التخرج: التوظيف وجهات العمل والتواصل.</div></div><button class="btn" data-act="importG">استيراد من Excel</button>'+(g.length?'<a class="btn" href="api.php?a=export&kind=graduates">تصدير (CSV)</a>':'')+'<button class="btn primary" data-act="addG">إضافة خريج</button></div>'+
    '<div class="kpi-row" style="margin:14px 0"><div class="kpi"><b class="num">'+g.length+'</b><span>خريجاً مسجّلاً</span></div><div class="kpi"><b class="num">'+emp+'</b><span>يعملون</span></div><div class="kpi"><b class="num">'+by("يبحث عن عمل")+'</b><span>يبحثون عن عمل</span></div><div class="kpi"><b class="num">'+(known?Math.round(emp/known*100)+'%':'—')+'</b><span>نسبة التوظيف (من المعروفة حالتهم)</span></div></div>';
  const terms=uniq(g.map(x=>x.grad_term));
  h+='<div class="toolbar"><input type="search" id="gq" placeholder="ابحث بالاسم أو الرقم التدريبي أو جهة العمل" value="'+esc(f.q)+'" aria-label="بحث"><select id="gst" aria-label="الحالة">'+opt(L("grad"),f.st,"كل الحالات")+'</select><select id="gterm" aria-label="فصل التخرج">'+opt(terms,f.term,"كل الفصول")+'</select></div>';
  if(!list.length) return h+'<div class="panel empty">'+(g.length?'لا توجد نتائج مطابقة.':'لا يوجد خريجون بعد. أضفهم يدوياً، أو استوردهم من Excel، أو انقل المتدربين من صفحة «المتدربون» بتحديدهم ثم «نقل إلى الخريجين».')+'</div>';
  const cls={"يعمل":"","يبحث عن عمل":"warn","يكمل دراسته":"","غير معروف":"bad"};
  return h+'<section class="panel" style="padding:6px 8px"><div class="scroll"><table class="list resp"><thead><tr><th>الخريج</th><th>التخصص</th><th>فصل التخرج</th><th>الحالة</th><th>جهة العمل</th><th>آخر تواصل</th></tr></thead><tbody>'+
    list.map(x=>'<tr class="click" data-act="editG" data-id="'+x.id+'" tabindex="0"><td class="tname"><b>'+esc(x.name)+'</b><small class="num">'+esc(x.acad||"")+(x.phone?' · '+esc(x.phone):'')+'</small></td><td class="hide-m">'+esc(x.specialty||x.dept||"")+'</td><td class="hide-m">'+esc(x.grad_term||"")+'</td><td><span class="tag '+cls[x.status]+'">'+esc(x.status)+'</span></td><td class="span">'+esc(x.employer||"")+(x.job_title?' <small class="muted">· '+esc(x.job_title)+'</small>':'')+'</td><td class="hide-m">'+(x.last_contact?esc(fmtG(x.last_contact)):'<span class="muted">—</span>')+'</td></tr>').join("")+'</tbody></table></div></section>';
}
function gradForm(id){
  const x=id?S.grads.find(g=>Number(g.id)===Number(id)):{status:"غير معروف"};
  const F=(n,l,v,ex,full)=>'<label'+(full?' class="full"':'')+'>'+l+'<input name="'+n+'" value="'+esc(v||"")+'" '+(ex||"")+'></label>';
  openModal('<div class="head"><div><h2>'+(id?'بيانات الخريج':'إضافة خريج')+'</h2></div><button class="x" data-close="modal" aria-label="إغلاق">×</button></div><form class="form" id="gform" novalidate><input type="hidden" name="id" value="'+(id||"")+'">'+
    F("name","الاسم",x.name,"required",1)+F("acad","الرقم التدريبي",x.acad,'inputmode="numeric" dir="ltr"')+F("phone","الجوال",x.phone,'inputmode="tel" dir="ltr"')+F("email","البريد الإلكتروني",x.email,'type="email" dir="ltr"')+F("grad_term","فصل التخرج",x.grad_term,'placeholder="مثال: الفصل الأول 1448هـ"')+
    F("dept","القسم",x.dept)+F("specialty","التخصص",x.specialty)+F("gpa","المعدل",x.gpa,'dir="ltr"')+
    '<label>حالة التوظيف<select name="status">'+opt(L("grad"),x.status)+'</select></label>'+F("employer","جهة العمل",x.employer)+F("job_title","المسمى الوظيفي",x.job_title)+
    '<label>قطاع العمل<select name="sector">'+opt(L("sectors"),x.sector||"","غير محدد")+'</select></label>'+F("employed_on","تاريخ التوظيف",x.employed_on,'type="date"')+F("last_contact","آخر تواصل",x.last_contact,'type="date"')+
    '<label class="full">ملاحظات<textarea name="notes">'+esc(x.notes||"")+'</textarea></label><div class="full err" id="gerr" role="alert"></div>'+
    '<div class="full actions" style="margin-top:0"><button class="btn primary" type="submit">حفظ</button><button class="btn" type="button" data-close="modal">إلغاء</button>'+(id?'<button class="btn danger" type="button" data-act="delG" data-id="'+id+'" style="margin-inline-start:auto">حذف</button>':'')+'</div></form>');
  $("#gform").onsubmit=async ev=>{ ev.preventDefault(); try{ await api("grad.save",Object.fromEntries(new FormData(ev.target))); closeModal(); toast("حُفظت بيانات الخريج"); S.grads=await api("grad.list"); paint(); }catch(e){ $("#gerr").textContent=e.message; } };
}

/* ---------- admin: staff ---------- */
function viewStaff(){
  const staff=S.data.staff, ents=uniq(S.data.trainees.map(t=>t.entity)), sups=staff.filter(s=>s.role==="supervisor");
  let h='<div class="sec-title"><div><h2>المشرفون والتعيين</h2><p class="muted" style="margin:0">أضف مشرفي الكلية بأرقامهم الوظيفية. يدخل كل مشرف بكلمة مرور مؤقتة ثم يغيّرها.</p></div><button class="btn primary" data-act="addS">إضافة مشرف</button></div>'+
    '<section class="panel" style="margin-top:16px;padding:6px 8px"><div class="scroll"><table class="list"><thead><tr><th>الاسم</th><th>الرقم الوظيفي</th><th>الجوال</th><th>متدربون</th><th>آخر دخول</th><th></th></tr></thead><tbody>'+
    staff.map(s=>'<tr><td><b>'+esc(s.name)+'</b> '+(s.role==="admin"?'<span class="tag">المسؤول</span>':'')+(!Number(s.active)?' <span class="tag bad">موقوف</span>':'')+(Number(s.must_change)?' <span class="tag warn">لم يغيّر المؤقتة</span>':'')+'</td><td class="num">'+esc(s.username)+'</td><td class="num">'+esc(s.phone||"—")+'</td><td class="num">'+(s.role==="admin"?"—":S.data.trainees.filter(t=>Number(t.supervisor_id)===Number(s.id)).length)+'</td><td>'+(s.last_login?esc(fmtT(s.last_login)):'<span class="muted">لم يدخل</span>')+'</td>'+
      '<td style="text-align:end;white-space:nowrap"><button class="btn sm" data-act="editS" data-id="'+s.id+'">تعديل</button>'+(Number(s.id)!==Number(S.user.id)?' <button class="btn sm" data-act="resetS" data-id="'+s.id+'">كلمة مرور مؤقتة</button> <button class="btn sm" data-act="toggleS" data-id="'+s.id+'">'+(Number(s.active)?'إيقاف':'تفعيل')+'</button> <button class="btn sm danger" data-act="delS" data-id="'+s.id+'">حذف</button>':'')+'</td></tr>').join("")+'</tbody></table></div></section>'+
    '<div class="two" style="margin-top:18px"><section class="panel"><h3>تعيين حسب الجهة</h3><p class="note" style="margin-top:-6px">يُسند كل متدربي الجهة إلى المشرف المختار.</p><div class="form" style="grid-template-columns:1fr"><label>جهة التدريب<select id="asEnt"><option value="">اختر الجهة</option>'+ents.map(e=>'<option>'+esc(e)+'</option>').join("")+'</select></label><label>المشرف<select id="asSup"><option value="">بلا مشرف</option>'+sups.map(s=>'<option value="'+s.id+'">'+esc(s.name)+'</option>').join("")+'</select></label></div><div class="actions"><button class="btn primary" data-act="assign">تعيين لكل متدربي الجهة</button></div></section>'+
    '<section class="panel"><h3>الجهات ومشرفوها <span class="muted" style="font-weight:400">('+ents.length+')</span></h3><div class="scroll"><table class="list"><thead><tr><th>الجهة</th><th>متدربون</th><th>مشرف الكلية</th></tr></thead><tbody>'+
    ents.map(e=>{ const ts=S.data.trainees.filter(t=>t.entity===e), ss=uniq(ts.map(t=>staffName(t.supervisor_id))), un=ts.filter(t=>!t.supervisor_id).length; return '<tr class="click" data-fent="'+esc(e)+'"><td>'+esc(e)+'</td><td class="num">'+ts.length+'</td><td>'+ss.map(esc).join("، ")+(un?' <span class="tag warn">'+un+' بلا مشرف</span>':'')+'</td></tr>'; }).join("")+'</tbody></table></div></section></div>';
  return h;
}
function staffForm(id){
  const s=id?S.data.staff.find(x=>Number(x.id)===Number(id)):{};
  openModal('<div class="head"><div><h2>'+(id?'تعديل بيانات '+(s.role==="admin"?'المسؤول':'المشرف'):'إضافة مشرف')+'</h2></div><button class="x" data-close="modal" aria-label="إغلاق">×</button></div><form class="form" id="sform" novalidate><input type="hidden" name="id" value="'+(id||"")+'">'+
    '<label class="full">الاسم الكامل<input name="name" required value="'+esc(s.name||"")+'"></label><label>الرقم الوظيفي<input name="username" inputmode="numeric" dir="ltr" required value="'+esc(s.username||"")+'"></label><label>الجوال<input name="phone" inputmode="tel" dir="ltr" value="'+esc(s.phone||"")+'"></label>'+'<label class="full">الصلاحية<select name="role"'+(id&&Number(id)===Number(S.user.id)?' disabled':'')+'><option value="supervisor"'+(s.role!=="admin"?' selected':'')+'>مشرف الكلية</option><option value="admin"'+(s.role==="admin"?' selected':'')+'>مسؤول (كل الصلاحيات)</option></select></label>'+
    (!id?'<p class="full note" style="margin:0">تُولَّد كلمة مرور مؤقتة تظهر بعد الحفظ، ويُطلب من المشرف تغييرها عند أول دخول.</p>':'')+
    '<div class="full err" id="serr" role="alert"></div><div class="full actions" style="margin-top:0"><button class="btn primary" type="submit">'+(id?'حفظ':'إضافة المشرف')+'</button><button class="btn" type="button" data-close="modal">إلغاء</button></div></form>');
  $("#sform").onsubmit=async ev=>{ ev.preventDefault(); try{ const r=await api("staff.save",Object.fromEntries(new FormData(ev.target))); await loadData(); paint(); if(r.tempPassword) showTempPw(ev.target.elements.name.value,ev.target.elements.username.value,r.tempPassword); else { closeModal(); toast("حُفظت البيانات"); } }catch(e){ $("#serr").textContent=e.message; } };
}
function showTempPw(name,user,pw){
  const msg="الأستاذ "+name+"\nحسابك في منصة التدريب التعاوني – "+S.settings.college+":\n"+location.origin+location.pathname.replace(/[^/]*$/,"")+"\nالرقم الوظيفي: "+user+"\nكلمة المرور المؤقتة: "+pw+"\nاختر «منسوبو الكلية»، وستُطلب منك كلمة مرور جديدة عند أول دخول.";
  openModal('<div class="head"><div><h2>كلمة المرور المؤقتة</h2><div class="muted">'+esc(name)+'</div></div><button class="x" data-close="modal" aria-label="إغلاق">×</button></div><p>أرسلها للمشرف بطريقة خاصة. لن تظهر مرة أخرى.</p><p class="code" style="font-size:22px">'+esc(pw)+'</p><div class="actions"><button class="btn primary" data-act="copy" data-text="'+esc(msg)+'">نسخ رسالة الدخول</button><button class="btn" data-close="modal">تم</button></div>');
}

/* ---------- admin: notices ---------- */
function viewNotices(){
  const aud={all:"الجميع",trainees:"المتدربون",supervisors:"المشرفون"};
  return '<div class="sec-title"><div><h2>الإعلانات</h2><div class="muted">تظهر للمتدربين في صفحتهم الرئيسية، وللمشرفين في لوحة المتابعة.</div></div></div>'+
    '<div class="two" style="margin-top:16px"><section class="panel"><h3>إعلان جديد</h3><form class="form" id="nform" style="grid-template-columns:1fr" novalidate><label>العنوان<input id="ntitle" name="title" maxlength="150" placeholder="مثال: موعد تسليم تقرير التدريب النهائي"></label><label>النص<textarea id="nbody" name="body" maxlength="3000"></textarea></label><label>يظهر لـ<select name="audience"><option value="trainees">المتدربون</option><option value="supervisors">المشرفون</option><option value="all">الجميع</option></select></label><div class="err" id="nerr" role="alert"></div><div class="actions" style="margin-top:0"><button class="btn primary" type="submit">نشر الإعلان</button></div></form></section>'+
    '<section class="panel"><h3>الإعلانات المنشورة</h3>'+(S.data.notices.length?S.data.notices.map(n=>'<div class="notice"><div style="display:flex;gap:10px;align-items:flex-start"><div style="flex:1"><b>'+esc(n.title)+'</b><span class="note">'+esc(fmtT(n.created_at))+' · '+aud[n.audience]+'</span></div><button class="btn sm danger" data-act="delN" data-id="'+n.id+'">حذف</button></div>'+(n.body?'<p>'+esc(n.body)+'</p>':'')+'</div>').join(""):'<div class="empty">لا توجد إعلانات.</div>')+'</section></div>';
}

/* ---------- admin: login support ---------- */
async function loadSupport(){ try{ S.sup.data=await api("support.search",{q:S.sup.q,filter:S.sup.filter}); }catch(e){ S.sup.data={rows:[],unknown:[],stats:{},me:0}; toast(e.message); } paint(); }
function supStatus(r){
  if(Number(r.fails_recent)>=5) return '<span class="tag bad">مقفل مؤقتاً</span>';
  if(!Number(r.active)) return '<span class="tag bad">موقوف</span>';
  if(r.role==="trainee" && !Number(r.has_password)) return '<span class="tag warn">بانتظار التفعيل</span>';
  if(Number(r.must_change)) return '<span class="tag warn">لم يغيّر الكلمة المؤقتة</span>';
  return '<span class="tag">نشط</span>';
}
const ROLE_AR={admin:"مسؤول",supervisor:"مشرف",trainee:"متدرب"};
function viewSupport(){
  const d=S.sup.data;
  if(!d){ loadSupport(); return '<div class="empty">جارٍ تحميل الحسابات…</div>'; }
  const st=d.stats||{};
  let h='<div class="sec-title"><div><h2>دعم الدخول</h2><div class="muted">ابحث عن أي حساب لحل مشكلة دخوله: فك القفل، أو إعادة التعيين، أو الإيقاف، أو الحذف.</div></div><button class="btn" data-act="supReload">تحديث</button></div>'+
    '<div class="kpi-row" style="margin:14px 0"><button class="kpi" style="text-align:start;cursor:pointer" data-act="supF" data-f="locked"><b class="num">'+(st.locked||0)+'</b><span>مقفل مؤقتاً بسبب محاولات خاطئة</span></button><button class="kpi" style="text-align:start;cursor:pointer" data-act="supF" data-f="pending"><b class="num">'+(st.pending||0)+'</b><span>بانتظار التفعيل أو تغيير الكلمة المؤقتة</span></button><button class="kpi" style="text-align:start;cursor:pointer" data-act="supF" data-f="inactive"><b class="num">'+(st.inactive||0)+'</b><span>حساباً موقوفاً</span></button><div class="kpi"><b class="num">'+((Number(st.staff)||0)+(Number(st.trainees)||0))+'</b><span>حساباً ('+(st.staff||0)+' منسوب، '+(st.trainees||0)+' متدرب)</span></div></div>'+
    '<div class="toolbar"><input type="search" id="supq" placeholder="ابحث بالاسم أو الرقم الوظيفي أو التدريبي أو الجوال" value="'+esc(S.sup.q)+'" aria-label="بحث"><select id="supf" aria-label="تصفية"><option value="">كل الحسابات</option>'+[["staff","منسوبو الكلية"],["trainee","المتدربون"],["locked","المقفلون مؤقتاً"],["pending","بانتظار التفعيل"],["inactive","الموقوفون"]].map(([k,l])=>'<option value="'+k+'"'+(S.sup.filter===k?' selected':'')+'>'+l+'</option>').join("")+'</select></div>';
  h+='<section class="panel" style="padding:6px 8px"><div class="scroll"><table class="list resp"><thead><tr><th>الحساب</th><th>النوع</th><th>الحالة</th><th>آخر دخول</th><th>محاولات خاطئة (7 أيام)</th><th></th></tr></thead><tbody>'+
    (d.rows.length?d.rows.map(r=>'<tr class="click" data-act="supOpen" data-id="'+r.id+'" tabindex="0"><td class="tname"><b>'+esc(r.name)+(Number(r.id)===Number(d.me)?' <span class="tag">أنت</span>':'')+'</b><small class="num">'+esc(r.username)+'</small>'+(r.entity?' <small>· '+esc(r.entity)+'</small>':'')+'</td><td class="hide-m">'+ROLE_AR[r.role]+'</td><td>'+supStatus(r)+'</td><td class="hide-m">'+(r.last_login?esc(fmtT(r.last_login)):'<span class="muted">لم يدخل</span>')+'</td><td class="num hide-m">'+(Number(r.fails_week)?'<span class="tag '+(Number(r.fails_recent)>=5?'bad':'warn')+'">'+r.fails_week+'</span>':'0')+'</td><td style="text-align:end"><button class="btn sm" data-act="supOpen" data-id="'+r.id+'">إدارة</button></td></tr>').join(""):'<tr><td colspan="6" class="empty">لا توجد حسابات مطابقة.</td></tr>')+'</tbody></table></div></section>';
  if(d.unknown && d.unknown.length) h+='<section class="panel" style="margin-top:18px"><h3>محاولات دخول بأرقام غير مسجّلة <span class="muted" style="font-weight:400">(آخر 7 أيام)</span></h3><p class="note" style="margin-top:-6px">غالباً رقم كُتب خطأً، أو متدرب لم يُضف للمنصة بعد، أو مشرف لم يُنشأ حسابه.</p><table class="list"><tbody>'+
    d.unknown.map(u=>'<tr><td class="num"><b>'+esc(u.username)+'</b></td><td>'+u.n+' محاولة</td><td class="note">آخرها '+esc(fmtT(u.last))+'</td><td style="text-align:end"><button class="btn sm" data-act="supUnlockName" data-u="'+esc(u.username)+'">مسح المحاولات</button></td></tr>').join("")+'</tbody></table></section>';
  return h;
}
async function supportModal(id){
  const r=(S.sup.data&&S.sup.data.rows||[]).find(x=>Number(x.id)===Number(id)); if(!r) return;
  const self=Number(r.id)===Number(S.sup.data.me), tr=r.role==="trainee";
  const dd=(l,v,ltr)=>'<dt>'+l+'</dt><dd'+(ltr?' class="num" style="text-align:right"':'')+'>'+(v?esc(v):'<span class="muted">—</span>')+'</dd>';
  openModal('<div class="head"><div><h2>'+esc(r.name)+'</h2><div class="muted">'+ROLE_AR[r.role]+' · <span class="num">'+esc(r.username)+'</span></div><div style="margin-top:6px">'+supStatus(r)+'</div></div><button class="x" data-close="modal" aria-label="إغلاق">×</button></div>'+
    '<dl class="kv">'+dd(tr?"الرقم التدريبي":"الرقم الوظيفي",r.username,1)+dd("الجوال",r.phone,1)+(tr?dd("القسم",r.dept)+dd("جهة التدريب",r.entity)+dd("رمز التفعيل الحالي",r.activation_code?fmtCode(r.activation_code):"",1):"")+dd("آخر دخول",r.last_login?fmtT(r.last_login):"")+dd("آخر محاولة خاطئة",r.last_fail?fmtT(r.last_fail):"")+dd("أُنشئ الحساب",r.created_at?fmtT(r.created_at):"")+'</dl>'+
    (self?'<div class="callout">هذا حسابك. لتغيير كلمة مرورك استخدم «الإعدادات» ← «حسابي».</div>':
    '<h3>حلول سريعة</h3><div class="actions" style="margin-top:0">'+
      (Number(r.fails_week)?'<button class="btn" data-act="supUnlock" data-id="'+r.id+'">فك القفل ومسح المحاولات</button>':'')+
      '<button class="btn primary" data-act="supReset" data-id="'+r.id+'">'+(tr?'رمز تفعيل جديد':'كلمة مرور مؤقتة جديدة')+'</button>'+
      '<button class="btn" data-act="supLogout" data-id="'+r.id+'">إخراجه من كل الأجهزة</button>'+
      '<button class="btn'+(Number(r.active)?' danger':'')+'" data-act="supToggle" data-id="'+r.id+'">'+(Number(r.active)?'إيقاف الحساب':'تفعيل الحساب')+'</button></div>'+
    '<h3 style="margin-top:18px">الحذف</h3><div class="actions" style="margin-top:0"><button class="btn danger" data-act="supDel" data-id="'+r.id+'" data-mode="account">'+(tr?'حذف حساب الدخول فقط':'حذف الحساب')+'</button>'+(tr?'<button class="btn danger" data-act="supDel" data-id="'+r.id+'" data-mode="all">حذف المتدرب وكل بياناته</button>':'')+'</div>'+
    '<p class="note">'+(tr?'«حذف حساب الدخول فقط» يُبقي بيانات المتدرب وزياراته، ويمكن توليد رمز جديد له لاحقاً. «حذف المتدرب وكل بياناته» يحذف سجله وزياراته وتقاريره نهائياً.':'حذف المشرف لا يحذف زياراته، ويصبح متدربوه بلا مشرف.')+'</p>')+
    '<h3 style="margin-top:18px">آخر محاولات الدخول</h3><div id="supAtt" class="note">جارٍ التحميل…</div>');
  try{ const a=await api("support.attempts",{id}); const el=$("#supAtt"); if(el) el.innerHTML=a.length?'<table class="list"><tbody>'+a.map(x=>'<tr><td>'+(Number(x.success)?'<span class="tag">نجح</span>':'<span class="tag bad">فشل</span>')+'</td><td>'+esc(fmtT(x.created_at))+'</td><td class="num note">'+esc(x.ip)+'</td></tr>').join("")+'</tbody></table>':'لا توجد محاولات مسجّلة.'; }catch(e){ const el=$("#supAtt"); if(el) el.textContent=e.message; }
}
function supResult(r,res){
  const tr=r.role==="trainee", link=location.origin+location.pathname.replace(/[^/]*$/,"");
  const msg=tr?("المتدرب "+r.name+"\nأُعيد تعيين دخولك إلى منصة التدريب التعاوني – "+S.settings.college+":\n"+link+"\nاختر «فعّل حسابك برمز التفعيل».\nالرقم التدريبي: "+r.username+"\nرمز التفعيل: "+fmtCode(res.value)+"\nلا تشارك الرمز مع أحد.")
    :("الأستاذ "+r.name+"\nأُعيد تعيين دخولك إلى منصة التدريب التعاوني – "+S.settings.college+":\n"+link+"\nالرقم الوظيفي: "+r.username+"\nكلمة المرور المؤقتة: "+res.value+"\nاختر «منسوبو الكلية»، وستُطلب منك كلمة مرور جديدة عند الدخول.");
  const wa=waLink(r.phone,msg);
  openModal('<div class="head"><div><h2>'+(tr?'رمز التفعيل الجديد':'كلمة المرور المؤقتة')+'</h2><div class="muted">'+esc(r.name)+'</div></div><button class="x" data-close="modal" aria-label="إغلاق">×</button></div><p>أرسله له بطريقة خاصة. لن يظهر مرة أخرى، وأُخرج من كل الأجهزة وفُكّ قفله.</p><p class="code" style="font-size:22px">'+esc(tr?fmtCode(res.value):res.value)+'</p><div class="actions">'+(wa?'<a class="btn primary" href="'+esc(wa)+'" target="_blank" rel="noopener">إرسال عبر واتساب</a>':'')+'<button class="btn" data-act="copy" data-text="'+esc(msg)+'">نسخ الرسالة</button><button class="btn" data-close="modal">تم</button></div>');
}

/* ---------- admin: log ---------- */
const ACT={login:["تسجيل دخول",""],login_fail:["محاولة فاشلة","bad"],logout:["خروج","warn"],activate:["تفعيل حساب",""],create:["إضافة",""],update:["تعديل",""],delete:["حذف","bad"],import:["استيراد",""],assign:["تعيين",""],review:["مراجعة تقرير",""],submit:["تسليم تقرير",""],field_eval:["تقييم جهة",""],eval_link:["رابط تقييم",""],access_issue:["رموز تفعيل",""],access_toggle:["إيقاف/تفعيل حساب","warn"],reset_password:["كلمة مرور مؤقتة","warn"],password:["تغيير كلمة المرور",""],settings:["الإعدادات",""],brand:["الشعار",""],backup:["نسخة احتياطية",""],graduate:["نقل للخريجين",""],start_status:["المباشرة",""],toggle:["إيقاف/تفعيل","warn"],unlock:["فك قفل",""],force_logout:["إخراج من الأجهزة","warn"],reset_access:["رمز تفعيل جديد","warn"],deactivate:["إيقاف حساب","bad"],activate_account:["تفعيل حساب",""]};
const TGT={user:"مستخدم",trainee:"متدرب",visit:"زيارة",weekly:"تقرير أسبوعي",staff:"مشرف",graduate:"خريج",graduates:"خريجون",trainees:"متدربون",notice:"إعلان",eval:"تقييم",settings:"الإعدادات"};
function viewLog(){
  if(!S.audit){ loadAudit(); return '<div class="empty">جارٍ تحميل السجل…</div>'; }
  const a=S.audit, st=a.stats||{}, r=k=>(a.roles.find(x=>x.role===k)||{n:0,logged:0});
  return '<div class="sec-title"><div><h2>سجل الدخول والتعديلات</h2><div class="muted">آخر 300 حدث: من دخل، ومن أضاف أو عدّل أو حذف.</div></div><button class="btn" data-act="reloadLog">تحديث</button></div>'+
    '<div class="kpi-row" style="margin:14px 0"><div class="kpi"><b class="num">'+(st.today||0)+'</b><span>دخولاً اليوم</span></div><div class="kpi"><b class="num">'+(st.week||0)+'</b><span>دخولاً آخر 7 أيام</span></div><div class="kpi"><b class="num">'+(st.fails||0)+'</b><span>محاولة فاشلة آخر 7 أيام</span></div><div class="kpi"><b class="num">'+r("trainee").logged+' / '+r("trainee").n+'</b><span>متدرباً دخلوا المنصة</span></div><div class="kpi"><b class="num">'+r("supervisor").logged+' / '+r("supervisor").n+'</b><span>مشرفاً دخلوا المنصة</span></div></div>'+
    '<div class="toolbar"><select id="akind" aria-label="نوع الحدث"><option value="">كل الأحداث</option><option value="login"'+(S.af.kind==="login"?' selected':'')+'>الدخول والخروج</option><option value="changes"'+(S.af.kind==="changes"?' selected':'')+'>التعديلات</option></select></div>'+
    '<section class="panel" style="padding:6px 8px"><div class="scroll"><table class="list"><thead><tr><th>الوقت</th><th>المستخدم</th><th>الحدث</th><th>التفاصيل</th><th>عنوان IP</th></tr></thead><tbody>'+
    (a.rows.length?a.rows.map(e=>{ const k=ACT[e.action]||[e.action,""]; return '<tr><td style="white-space:nowrap">'+esc(fmtT(e.created_at))+'</td><td>'+esc(e.user_name||(e.action==="login_fail"?"رقم: "+(e.target_id||""):"—"))+'</td><td><span class="tag '+k[1]+'">'+esc(k[0])+'</span> <span class="note">'+esc(TGT[e.target]||"")+'</span></td><td class="note">'+esc(e.details||"")+'</td><td class="num note">'+esc(e.ip||"")+'</td></tr>'; }).join(""):'<tr><td colspan="5" class="empty">لا توجد أحداث.</td></tr>')+'</tbody></table></div></section>';
}
async function loadAudit(){ try{ S.audit=await api("audit.list",{kind:S.af.kind}); }catch(e){ S.audit={rows:[],stats:{},roles:[]}; toast(e.message); } paint(); }

/* ---------- admin: settings ---------- */
function viewSettings(){
  const st=S.settings;
  return '<div class="sec-title"><div><h2>الإعدادات</h2></div></div><div class="two" style="margin-top:16px"><section class="panel"><h3>الكلية والفصل التدريبي</h3><form class="form" id="setform" novalidate>'+
    '<label class="full">اسم الكلية<input name="college_name" value="'+esc(st.college)+'"></label><label class="full">اسم الفصل<input name="semester_label" value="'+esc(st.semester)+'"></label>'+
    '<label>بداية الفصل (ميلادي)<input type="date" name="semester_start" value="'+esc(st.start)+'"><span class="hint">'+esc(fmtH(st.start))+'</span></label><label>عدد الأسابيع<input name="semester_weeks" inputmode="numeric" value="'+st.weeks+'"></label>'+
    '<label class="full">جهة التواصل للمتدربين<input name="admin_contact" value="'+esc(st.contact)+'" placeholder="اسم المسؤول ورقم التواصل"></label>'+
    '<label>أقصى حجم للملف (ميجابايت)<input name="max_upload_mb" inputmode="numeric" value="'+st.maxUpload+'"></label><label class="chk" style="flex-direction:row;align-self:end"><input type="checkbox" name="require_visit_report" value="1"'+(st.requireReport?' checked':'')+'> التقرير مطلوب عند تسجيل الزيارة</label>'+
    '<div class="full err" id="seterr" role="alert"></div><div class="full actions" style="margin-top:0"><button class="btn primary" type="submit">حفظ الإعدادات</button></div></form></section>'+
    '<section class="panel stack"><div><h3>الهوية البصرية</h3><p class="note" style="margin-top:-6px">شعار المؤسسة (PNG بخلفية شفافة)، وصورة الواجهة (JPG عرضي).</p><div class="actions" style="margin-top:0"><label class="btn">رفع الشعار<input type="file" accept="image/png,image/jpeg,image/webp" data-brand="logo" hidden></label><label class="btn">رفع صورة الواجهة<input type="file" accept="image/jpeg,image/png,image/webp" data-brand="banner" hidden></label></div>'+(st.logo?'<img src="'+esc(st.logo)+'" alt="الشعار الحالي" style="max-height:70px;margin-top:10px">':'')+'</div>'+
    '<div><h3>النسخ الاحتياطي</h3><p class="note" style="margin-top:-6px">ملف واحد بكل بيانات المنصة (عدا الملفات المرفوعة). احفظه أسبوعياً على الأقل، إضافة إلى النسخ التلقائي في الخادم.</p><a class="btn" href="api.php?a=export&kind=backup">تنزيل نسخة احتياطية</a></div>'+
    '<div><h3>حسابي</h3>'+pwForm()+'</div></section></div>';
}

/* ---------- trainee ---------- */
function viewHome(){
  const P=S.portal, t=P.t, vs=P.visits, cw=curWeek(), W=WEEKS(), st=S.settings;
  const vw=new Set(vs.map(v=>weekOf(v.visit_date))), endS=iso(new Date(parseD(st.start).getTime()+(W*7-1)*864e5));
  const dd=(l,v,ltr)=>'<dt>'+l+'</dt><dd'+(ltr?' class="num" style="text-align:right"':'')+'>'+(v?esc(v):'<span class="muted">—</span>')+'</dd>';
  const thisW=P.weekly.find(w=>Number(w.week)===cw), returned=P.weekly.filter(w=>w.status==="returned");
  let h=banner('مرحباً '+String(t.name).split(/\s+/)[0], st.college+' – '+st.semester);
  if(cw>=1 && !thisW) h+='<div class="callout" style="margin-bottom:18px">لم تسلّم تقرير الأسبوع '+cw+' بعد. <button class="linkbtn" data-nav="weekly">اكتب التقرير الآن</button></div>';
  if(returned.length) h+='<div class="callout" style="margin-bottom:18px;border-color:var(--danger);background:var(--danger-soft)">أعاد المشرف تقرير الأسبوع '+returned.map(w=>w.week).join("، ")+' للتعديل. <button class="linkbtn" data-nav="weekly">راجع الملاحظات</button></div>';
  h+='<section class="panel"><div class="hero"><div class="wk">'+(cw<1?'لم يبدأ الفصل التدريبي بعد':'الأسبوع التدريبي')+'<strong class="num">'+(cw<1?0:cw)+' / '+W+'</strong><span class="muted">'+esc(fmtH(st.start))+' – '+esc(fmtH(endS))+'</span></div><div><div class="ruler" style="grid-template-columns:repeat('+W+',1fr)" role="img" aria-label="أسابيع الفصل">';
  const sub=new Set(P.weekly.map(w=>Number(w.week)));
  for(let w=1;w<=W;w++) h+='<div class="col'+(w<cw?' past':'')+(w===cw?' now':'')+'" title="الأسبوع '+w+'">'+(vw.has(w)?'<span class="c">زيارة</span>':'')+'<div class="bar'+(sub.has(w)?' full':'')+'" style="height:'+(sub.has(w)?55:0)+'%"></div><div class="base"></div><span class="n num">'+w+'</span></div>';
  h+='</div><div class="note" style="margin-top:6px">العمود الأخضر: أسبوع سلّمت تقريره. «زيارة»: أسبوع زارك فيه مشرف الكلية.</div></div></div>'+
    '<div class="figs"><div><b class="num">'+P.weekly.length+'</b><span>تقريراً أسبوعياً سلّمته</span></div><div><b class="num">'+vs.length+'</b><span>زيارة من مشرف الكلية</span></div><div><b style="font-size:19px;padding-top:6px">'+esc(t.start_status||"لم تُحدَّد")+'</b><span>المباشرة في جهة التدريب</span></div></div></section>';
  if(t.reg_status!=="خريج" && t.start_status!=="مباشر") h+='<div class="callout" style="margin-top:18px">لم تُسجَّل مباشرتك في جهة التدريب بعد. إن كنت باشرت، أبلغ مشرف الكلية.</div>';
  h+='<div class="two" style="margin-top:18px"><section class="panel"><h3>بيانات تدريبك</h3><dl class="kv">'+dd("الرقم التدريبي",t.acad,1)+dd("القسم",t.dept)+dd("التخصص",t.specialty)+dd("جهة التدريب",t.entity)+dd("قطاع الجهة",t.sector)+dd("المشرف الميداني",t.field_supervisor)+dd("جوال المشرف الميداني",t.field_supervisor_phone,1)+dd("مشرف الكلية",t.supervisor_name)+dd("جوال مشرف الكلية",t.supervisor_phone,1)+'</dl>'+
    '<p class="note" style="margin:0">إن وجدت خطأ في بياناتك، تواصل مع مسؤول التدريب التعاوني'+(st.contact?' <b>'+esc(st.contact)+'</b>':'')+'.</p></section>'+
    '<section class="panel"><h3>الإعلانات</h3>'+(P.notices.length?P.notices.map(n=>'<div class="notice"><b>'+esc(n.title)+'</b><span class="note">'+esc(fmtT(n.created_at))+'</span>'+(n.body?'<p>'+esc(n.body)+'</p>':'')+'</div>').join(""):'<div class="empty" style="padding:18px">لا توجد إعلانات حالياً.</div>')+'</section></div>';
  h+='<section class="panel" style="margin-top:18px"><h3>زيارات مشرف الكلية <span class="muted" style="font-weight:400">('+vs.length+')</span></h3>'+
    (vs.length?vs.map(v=>{ const c=v.attendance==="متغيب"?"bad":v.attendance==="منتظم"?"":"warn"; return '<div class="visit"><div class="top"><b>'+esc(v.type)+'</b><span class="muted">'+esc(fmtH(v.visit_date))+' <span class="num">('+esc(fmtG(v.visit_date))+')</span></span><span class="tag">الأسبوع '+weekOf(v.visit_date)+'</span></div><div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">'+(v.attendance?'<span class="tag '+c+'">الانتظام: '+esc(v.attendance)+'</span>':'')+(v.rating?'<span class="tag">الأداء: '+esc(v.rating)+'</span>':'')+(Number(v.met_field)?'<span class="tag">قابل المشرف الميداني</span>':'')+'</div></div>'; }).join(""):'<div class="empty" style="padding:18px">لم تُسجَّل زيارات لك بعد.</div>')+'</section>';
  return h;
}
function viewTWeekly(){
  const P=S.portal, cw=curWeek(), W=WEEKS(), by={}; P.weekly.forEach(w=>by[w.week]=w);
  if(S.wkSel==null) S.wkSel=Math.max(1,cw);
  const sel=S.wkSel, w=by[sel], locked=w&&w.status==="reviewed";
  let h='<div class="sec-title"><div><h2>تقاريري الأسبوعية</h2><div class="muted">اكتب كل أسبوع ما أنجزته في جهة التدريب. يراجعه مشرف الكلية ويضيف ملاحظاته.</div></div></div>'+
    '<section class="panel" style="margin-top:14px"><h3>اختر الأسبوع</h3><div class="wk-grid">';
  for(let i=1;i<=W;i++){ const x=by[i]; h+='<button data-wk="'+i+'" class="'+(x?(x.status==="reviewed"?'done':x.status==="returned"?'ret':'done'):'')+(i===cw?' now':'')+'"'+(i>Math.max(1,cw)?' disabled':'')+(i===sel?' aria-current="true" style="box-shadow:0 0 0 2px var(--ink)"':'')+'><span class="num">'+i+'</span><small>'+(x?(x.status==="reviewed"?'روجع':x.status==="returned"?'مُعاد':'سُلّم'):(i>cw?'':'—'))+'</small></button>'; }
  h+='</div></section><section class="panel" style="margin-top:18px"><div class="head" style="margin-bottom:6px"><div><h3 style="margin:0">تقرير الأسبوع '+sel+'</h3>'+(w?'<div style="margin-top:4px">'+wTag(w.status)+' <span class="note">'+esc(fmtT(w.submitted_at))+'</span></div>':'')+'</div></div>'+
    (w&&w.sup_comment?'<div class="callout'+(w.status==="reviewed"?' ok':'')+'" style="margin-bottom:14px"><b>ملاحظة المشرف:</b> '+esc(w.sup_comment)+'</div>':'');
  if(locked) h+='<h3>المهام المنجزة</h3><p style="white-space:pre-wrap">'+esc(w.tasks)+'</p>'+(w.skills?'<h3>المهارات المكتسبة</h3><p style="white-space:pre-wrap">'+esc(w.skills)+'</p>':'')+(w.challenges?'<h3>الصعوبات</h3><p style="white-space:pre-wrap">'+esc(w.challenges)+'</p>':'')+(Number(w.has_file)?'<a class="btn sm" href="api.php?a=file&kind=weekly&id='+w.id+'" target="_blank" rel="noopener">فتح المرفق</a>':'');
  else h+='<form class="form" id="twform" novalidate><input type="hidden" name="week" value="'+sel+'">'+
    '<label class="full">المهام التي أنجزتها هذا الأسبوع<textarea id="tw_tasks" name="tasks" required placeholder="مثال: تركيب وتهيئة 4 أجهزة حاسب في قسم الشؤون الإدارية، وتوصيلها بالشبكة…">'+esc(w?w.tasks:"")+'</textarea></label>'+
    '<label class="full">المهارات التي اكتسبتها<textarea id="tw_skills" name="skills">'+esc(w?w.skills||"":"")+'</textarea></label>'+
    '<label class="full">الصعوبات التي واجهتك (اختياري)<textarea id="tw_ch" name="challenges" style="min-height:60px">'+esc(w?w.challenges||"":"")+'</textarea></label>'+
    '<label>عدد ساعات التدريب هذا الأسبوع<input name="hours" inputmode="decimal" dir="ltr" value="'+esc(w&&w.hours!=null?w.hours:"")+'"></label>'+
    '<label>مرفق (اختياري)<input type="file" name="file" accept=".pdf,image/*"><span class="hint">'+(w&&Number(w.has_file)?'يوجد مرفق سابق: '+esc(w.file_name||"")+'. اختر ملفاً لاستبداله.':'صورة من العمل أو ملف PDF، حتى '+S.settings.maxUpload+' ميجابايت.')+'</span></label>'+
    '<div class="full err" id="twerr" role="alert"></div><div class="full actions" style="margin-top:0"><button class="btn primary" type="submit" id="twbtn">'+(w?'حفظ التعديلات':'تسليم التقرير')+'</button></div></form>';
  return h+'</section>';
}
function viewAccount(){
  return '<div class="sec-title"><div><h2>حسابي</h2></div></div><section class="panel" style="max-width:560px;margin-top:16px"><dl class="kv"><dt>الاسم</dt><dd>'+esc(S.user.name)+'</dd><dt>'+(role()==="trainee"?'الرقم التدريبي':'الرقم الوظيفي')+'</dt><dd class="num" style="text-align:right">'+esc(S.user.username)+'</dd></dl><h3>تغيير كلمة المرور</h3>'+pwForm()+'</section>';
}

/* ---------- admin forms ---------- */
function traineeForm(id){
  const t=id?tById(id):{}, sups=S.data.staff.filter(s=>s.role==="supervisor");
  const Lk=k=>uniq(S.data.trainees.map(x=>x[k]));
  const F=(n,l,v,ex,full)=>'<label'+(full?' class="full"':'')+'>'+l+'<input name="'+n+'" value="'+esc(v||"")+'" '+(ex||"")+'></label>';
  const SEL=(n,l,list,v)=>'<label>'+l+'<select name="'+n+'">'+opt(list,v||"","غير محدد")+'</select></label>';
  openModal('<div class="head"><div><h2>'+(id?'تعديل بيانات المتدرب':'إضافة متدرب')+'</h2></div><button class="x" data-close="modal" aria-label="إغلاق">×</button></div><form class="form" id="tform" novalidate><input type="hidden" name="id" value="'+(id||"")+'">'+
    F("name","اسم المتدرب",t.name,"required",1)+F("acad","الرقم التدريبي",t.acad,'required inputmode="numeric" dir="ltr"')+F("phone","جوال المتدرب",t.phone,'inputmode="tel" dir="ltr"')+
    F("dept","القسم",t.dept,'list="dldept"')+F("specialty","التخصص",t.specialty,'list="dlspec"')+F("gpa","المعدل",t.gpa,'dir="ltr"')+F("nid","رقم الهوية",t.nid,'inputmode="numeric" dir="ltr"')+
    F("entity","جهة التدريب",t.entity,'list="dlent"',1)+SEL("sector","قطاع الجهة",L("sectors"),t.sector)+
    '<label>مشرف الكلية<select name="supervisor_id"><option value="">غير معيّن</option>'+sups.map(s=>'<option value="'+s.id+'"'+(Number(t.supervisor_id)===Number(s.id)?' selected':'')+'>'+esc(s.name)+'</option>').join("")+'</select></label>'+
    F("field_supervisor","المشرف الميداني",t.field_supervisor)+F("field_supervisor_phone","جوال المشرف الميداني",t.field_supervisor_phone,'inputmode="tel" dir="ltr"')+
    SEL("reg_status","اكتمال التسجيل",L("reg"),t.reg_status)+SEL("start_status","المباشرة",L("start"),t.start_status)+F("letter_no","رقم الخطاب",t.letter_no)+
    '<label class="full">ملاحظات<textarea name="notes">'+esc(t.notes||"")+'</textarea></label>'+
    '<datalist id="dlent">'+Lk("entity").map(e=>'<option value="'+esc(e)+'">').join("")+'</datalist><datalist id="dlspec">'+Lk("specialty").map(e=>'<option value="'+esc(e)+'">').join("")+'</datalist><datalist id="dldept">'+Lk("dept").map(e=>'<option value="'+esc(e)+'">').join("")+'</datalist>'+
    '<div class="full err" id="terr" role="alert"></div><div class="full actions" style="margin-top:0"><button class="btn primary" type="submit">'+(id?'حفظ التعديلات':'إضافة المتدرب')+'</button><button class="btn" type="button" data-close="modal">إلغاء</button>'+(id?'<button class="btn danger" type="button" data-act="delT" data-id="'+id+'" style="margin-inline-start:auto">حذف المتدرب</button>':'')+'</div></form>');
  const form=$("#tform");
  form.elements.entity.addEventListener("change",()=>{ const m=S.data.trainees.find(x=>x.entity===form.elements.entity.value.trim()); if(m&&m.sector&&!form.elements.sector.value) form.elements.sector.value=m.sector; });
  form.onsubmit=async ev=>{ ev.preventDefault(); try{ await api("trainee.save",Object.fromEntries(new FormData(form))); closeModal(); toast(id?"حُفظت التعديلات":"أُضيف المتدرب"); refresh(); }catch(e){ $("#terr").textContent=e.message; } };
}
const FIELDS={trainees:[["acad","الرقم التدريبي *"],["name","اسم المتدرب *"],["nid","رقم الهوية"],["phone","الجوال"],["dept","القسم"],["specialty","التخصص"],["gpa","المعدل"],["entity","جهة التدريب"],["sector","القطاع"],["field_supervisor","المشرف الميداني"],["field_supervisor_phone","جوال المشرف الميداني"],["supervisor_name","مشرف الكلية (بالاسم)"],["letter_no","رقم الخطاب"]],
  graduates:[["acad","الرقم التدريبي *"],["name","الاسم *"],["phone","الجوال"],["dept","القسم"],["specialty","التخصص"],["gpa","المعدل"]]};
function importForm(target){
  openModal('<div class="head"><div><h2>'+(target==="graduates"?'استيراد الخريجين':'استيراد كشف المتدربين')+'</h2><div class="muted">من ملف Excel (xlsx) أو CSV، مثل الكشوف المستخرجة من نظام رايات.</div></div><button class="x" data-close="modal" aria-label="إغلاق">×</button></div>'+
    '<form id="iform" novalidate><label class="drop" id="idrop"><input type="file" name="file" accept=".xlsx,.csv" style="display:none"><span id="ifname">اختر ملف الكشف</span></label><div class="err" id="ierr" role="alert" style="margin-top:8px"></div><div class="actions"><button class="btn primary" type="submit" id="ibtn">قراءة الملف</button><button class="btn" type="button" data-close="modal">إلغاء</button></div></form><div id="imap"></div>');
  const form=$("#iform");
  form.elements.file.onchange=()=>{ const f=form.elements.file.files[0]; $("#ifname").textContent=f?f.name:"اختر ملف الكشف"; $("#idrop").classList.toggle("has",!!f); };
  form.onsubmit=async ev=>{
    ev.preventDefault(); const err=$("#ierr"), btn=$("#ibtn"); err.textContent="";
    if(!form.elements.file.files[0]){ err.textContent="اختر الملف أولاً."; return; }
    btn.disabled=true; btn.textContent="جارٍ القراءة…";
    try{
      const fd=new FormData(form), r=await api("import.preview",fd,true);
      form.hidden=true;
      const fl=FIELDS[target];
      $("#imap").innerHTML='<p>وُجد <b class="num">'+r.count+'</b> سطراً. طابِق أعمدة الملف مع حقول المنصة (خمّنتُ ما أمكن):</p><div class="map-grid">'+fl.map(([k,l])=>'<label>'+l+'<select data-map="'+k+'"><option value="">— لا يوجد —</option>'+r.headers.map((hd,i)=>'<option value="'+i+'"'+(r.mapping[k]===i?' selected':'')+'>'+esc(hd||("عمود "+(i+1)))+'</option>').join("")+'</select></label>').join("")+'</div>'+
        '<h3 style="margin-top:16px">معاينة أول الأسطر</h3><div class="scroll"><table class="list"><thead><tr>'+r.headers.map(hd=>'<th>'+esc(hd)+'</th>').join("")+'</tr></thead><tbody>'+r.sample.map(row=>'<tr>'+r.headers.map((_,i)=>'<td>'+esc(row[i]||"")+'</td>').join("")+'</tr>').join("")+'</tbody></table></div>'+
        '<p class="note">المتدرب الموجود مسبقاً (بنفس الرقم التدريبي) تُحدَّث بياناته، والجديد يُضاف. الحقول الفارغة في الملف لا تمسح البيانات الموجودة.</p><div class="err" id="icerr" role="alert"></div><div class="actions"><button class="btn primary" data-act="importGo" data-token="'+r.token+'" data-target="'+target+'">استيراد '+r.count+' سطراً</button><button class="btn" data-close="modal">إلغاء</button></div>';
    }catch(e){ err.textContent=e.message; btn.disabled=false; btn.textContent="قراءة الملف"; }
  };
}

/* ---------- modal ---------- */
function openModal(html){ $("#modal").innerHTML='<div class="modal-scrim" data-close="modal-bg"><div class="modal" role="dialog" aria-modal="true">'+html+'</div></div>'; const f=$("#modal").querySelector("input:not([type=hidden]):not([readonly]),select,textarea,button:not(.x)"); if(f) f.focus(); }
function closeModal(){ $("#modal").innerHTML=""; }
function confirmBox(title,body,label,onYes,danger){
  openModal('<div class="head"><div><h2>'+esc(title)+'</h2></div><button class="x" data-close="modal" aria-label="إغلاق">×</button></div><p>'+esc(body)+'</p><div class="err" id="cerr" role="alert"></div><div class="actions"><button class="btn '+(danger===false?'primary':'danger')+'" id="cyes">'+esc(label)+'</button><button class="btn" data-close="modal">إلغاء</button></div>');
  $("#cyes").onclick=async()=>{ $("#cyes").disabled=true; try{ await onYes(); }catch(e){ const c=$("#cerr"); if(c){ c.textContent=e.message; $("#cyes").disabled=false; } else toast(e.message); } };
}

/* ---------- events ---------- */
document.addEventListener("click",async ev=>{
  if(ev.target.closest("a[href]")) return;
  const el=ev.target.closest("[data-nav],[data-open],[data-act],[data-close],[data-ltab],[data-tmode],[data-fdept],[data-fent],[data-wk],[data-sel]");
  if(!el) return;
  if(el.dataset.sel!=null){ ev.stopPropagation(); S.sel[el.dataset.sel]=el.checked; paint(); return; }
  if(el.dataset.close){
    if(el.dataset.close==="modal-bg"){ if(ev.target===el) closeModal(); return; }
    if(el.dataset.close==="drawer" && ev.target!==el && !ev.target.closest(".x")) return;
    if(el.dataset.close==="drawer"){ S.openT=null; paintDrawer(); } else closeModal(); return;
  }
  if(el.dataset.ltab){ S.loginTab=el.dataset.ltab; S.tMode="login"; paint(); const f=$("#luser")||$("#lacad"); if(f) f.focus(); return; }
  if(el.dataset.tmode){ S.tMode=el.dataset.tmode; paint(); const f=$("#luser")||$("#lacad"); if(f) f.focus(); return; }
  if(el.dataset.nav){ S.view=el.dataset.nav; if(el.dataset.fSt!=null){ S.f=Object.assign({},S.f,{st:el.dataset.fSt,mine:true}); } S.openT=null; closeModal(); if(S.view==="weekly" && isStaff()) S.weekly=null; if(S.view==="log") S.audit=null; if(S.view==="support") S.sup.data=null; history.replaceState(null,"","#"+S.view); paint(); scrollTo(0,0); return; }
  if(el.dataset.open){ S.openT=Number(el.dataset.open); closeModal(); paintDrawer(); return; }
  if(el.dataset.fdept!=null){ S.f=Object.assign({},S.f,{dept:el.dataset.fdept,spec:"",entity:"",sector:"",st:"",sup:"",q:""}); S.view="trainees"; paint(); scrollTo(0,0); return; }
  if(el.dataset.fent!=null){ S.f=Object.assign({},S.f,{entity:el.dataset.fent,dept:"",spec:"",sector:"",st:"",sup:"",q:""}); S.view="trainees"; paint(); scrollTo(0,0); return; }
  if(el.dataset.wk){ S.wkSel=Number(el.dataset.wk); paint(); return; }
  const a=el.dataset.act, id=el.dataset.id;
  try{
    if(a==="logout"){ const r=await api("logout"); S.csrf=r.csrf; S.user=null; S.data=null; S.portal=null; S.weekly=null; S.grads=null; S.audit=null; S.openT=null; S.wkSel=null; closeModal(); $("#app").dataset.screen=""; paint(); }
    else if(a==="copy") copyText(el.dataset.text,"نُسخ");
    else if(a==="visit") visitForm(Number(id));
    else if(a==="addT") traineeForm(null);
    else if(a==="editT") traineeForm(Number(id));
    else if(a==="delT"){ const t=tById(id); confirmBox("حذف المتدرب","سيُحذف «"+(t?t.name:"")+"» مع زياراته وتقاريره وحسابه نهائياً.","حذف المتدرب",async()=>{ await api("trainee.delete",{id}); S.openT=null; closeModal(); toast("حُذف المتدرب"); refresh(); }); }
    else if(a==="clearF"){ S.f={q:"",dept:"",spec:"",entity:"",sector:"",st:"",sup:"",acc:"",mine:S.f.mine}; paint(); }
    else if(a==="delV"){ confirmBox("حذف الزيارة","ستُحذف الزيارة وتقريرها المرفق نهائياً.","حذف الزيارة",async()=>{ await api("visit.delete",{id}); closeModal(); toast("حُذفت الزيارة"); refresh(); }); }
    else if(a==="startSt"){ const t=tById(id); openModal('<div class="head"><div><h2>تحديث المباشرة</h2><div class="muted">'+esc(t.name)+'</div></div><button class="x" data-close="modal" aria-label="إغلاق">×</button></div><div class="actions" style="margin-top:0">'+L("start").map(s=>'<button class="btn'+(t.start_status===s?' primary':'')+'" data-act="setSt" data-id="'+id+'" data-st="'+esc(s)+'">'+esc(s)+'</button>').join("")+'</div>'); }
    else if(a==="setSt"){ await api("trainee.status",{id,start_status:el.dataset.st}); closeModal(); toast("حُدّثت المباشرة"); refresh(); }
    else if(a==="evalLink") evalLink(Number(id));
    else if(a==="renewEval"){ confirmBox("استبدال الرابط","سيتوقف الرابط القديم، ويلزم إرسال الرابط الجديد للمشرف الميداني.","استبدال الرابط",async()=>{ await api("eval.link",{trainee_id:id,renew:1}); await loadData(); evalLink(Number(id)); }); }
    else if(a==="openEval") openEval(Number(id));
    else if(a==="delEval"){ confirmBox("حذف التقييم","سيُحذف التقييم، ويمكن للجهة إرسال تقييم جديد بنفس الرابط.","حذف التقييم",async()=>{ await api("eval.delete",{id}); closeModal(); toast("حُذف التقييم"); refresh(); }); }
    else if(a==="openW") openWeekly(Number(id));
    else if(a==="reviewW"){ const c=$("#wform").elements.comment.value; await api("weekly.review",{id,status:el.dataset.st,comment:c}).catch(e=>{ $("#werr").textContent=e.message; throw null; }); closeModal(); toast(el.dataset.st==="reviewed"?"اعتُمد التقرير":"أُعيد التقرير للمتدرب"); S.weekly=null; await loadData(); paint(); }
    else if(a==="reloadW"){ S.weekly=null; paint(); }
    else if(a==="import") importForm("trainees");
    else if(a==="importG") importForm("graduates");
    else if(a==="importGo"){
      const map={}; document.querySelectorAll("[data-map]").forEach(s=>{ if(s.value!=="") map[s.dataset.map]=Number(s.value); });
      el.disabled=true; el.textContent="جارٍ الاستيراد…";
      try{ const r=await api("import.commit",{token:el.dataset.token,mapping:map,target:el.dataset.target});
        closeModal(); toast("أُضيف "+r.added+"، وحُدّث "+r.updated+(r.skipped?"، وتُجوهل "+r.skipped+" سطراً ناقصاً":""));
        if(r.unknownSupervisors && r.unknownSupervisors.length) setTimeout(()=>openModal('<div class="head"><div><h2>مشرفون غير مسجّلين</h2></div><button class="x" data-close="modal" aria-label="إغلاق">×</button></div><p>هذه الأسماء في عمود مشرف الكلية لا تطابق أي مشرف مسجّل، فلم يُعيَّن متدربوها:</p><p>'+r.unknownSupervisors.map(esc).join("، ")+'</p><p class="note">أضفهم من صفحة «المشرفون» بنفس الاسم ثم أعد الاستيراد، أو عيّنهم حسب الجهة.</p>'),300);
        if(el.dataset.target==="graduates"){ S.grads=null; } refresh();
      }catch(e){ $("#icerr").textContent=e.message; el.disabled=false; el.textContent="استيراد"; }
    }
    else if(a==="toGrad"){ const ids=Object.keys(S.sel).filter(k=>S.sel[k]).map(Number); confirmBox("نقل إلى الخريجين","سيُنسخ "+ids.length+" متدرباً إلى قائمة الخريجين، وتصبح حالتهم «خريج».","نقل إلى الخريجين",async()=>{ const r=await api("grad.fromTrainees",{ids}); S.sel={}; S.grads=null; closeModal(); toast("نُقل "+r.count+" إلى الخريجين"); refresh(); },false); }
    else if(a==="selNone"){ S.sel={}; paint(); }
    else if(a==="issueAll"){ confirmBox("توليد رموز التفعيل","سيُولَّد رمز تفعيل لكل متدرب ليس له حساب ("+S.data.trainees.filter(t=>!t.user_id).length+" متدرباً).","توليد الرموز",async()=>{ const r=await api("access.issue",{all:1}); closeModal(); toast("وُلّد "+r.count+" رمزاً"); refresh(); },false); }
    else if(a==="issue"){ await api("access.issue",{ids:[Number(id)]}); toast("وُلّد رمز التفعيل"); refresh(); }
    else if(a==="reissue"){ const t=tById(id); confirmBox("رمز تفعيل جديد","ستُلغى كلمة مرور «"+t.name+"» الحالية، ويلزمه التفعيل من جديد بالرمز الجديد.","توليد رمز جديد",async()=>{ await api("access.issue",{ids:[Number(id)],reset:1}); closeModal(); toast("وُلّد رمز جديد"); refresh(); }); }
    else if(a==="accToggle"){ await api("access.toggle",{id}); refresh(); }
    else if(a==="addG") gradForm(null);
    else if(a==="editG") gradForm(Number(id));
    else if(a==="delG"){ confirmBox("حذف الخريج","ستُحذف بيانات الخريج نهائياً.","حذف",async()=>{ await api("grad.delete",{id}); S.grads=await api("grad.list"); closeModal(); toast("حُذف"); paint(); }); }
    else if(a==="addS") staffForm(null);
    else if(a==="editS") staffForm(Number(id));
    else if(a==="resetS"){ const s=S.data.staff.find(x=>Number(x.id)===Number(id)); confirmBox("كلمة مرور مؤقتة","ستُلغى كلمة مرور «"+s.name+"» الحالية وتُولَّد كلمة مؤقتة.","توليد كلمة مؤقتة",async()=>{ const r=await api("staff.reset",{id}); await loadData(); paint(); showTempPw(s.name,s.username,r.tempPassword); }); }
    else if(a==="toggleS"){ await api("staff.toggle",{id}); refresh(); }
    else if(a==="delS"){ const s=S.data.staff.find(x=>Number(x.id)===Number(id)); confirmBox("حذف المشرف","سيُحذف حساب «"+s.name+"». تبقى زياراته، ويصبح متدربوه بلا مشرف.","حذف المشرف",async()=>{ await api("staff.delete",{id}); closeModal(); toast("حُذف المشرف"); refresh(); }); }
    else if(a==="assign"){ const e=$("#asEnt").value, v=$("#asSup").value; if(!e){ toast("اختر جهة التدريب أولاً"); return; } const r=await api("trainee.assign",{entity:e,supervisor_id:v}); toast("عُيّن "+r.count+" متدرباً"); refresh(); }
    else if(a==="delN"){ await api("notice.delete",{id}); toast("حُذف الإعلان"); refresh(); }
    else if(a==="reloadLog"){ S.audit=null; paint(); }
    else if(a==="supReload"){ S.sup.data=null; paint(); }
    else if(a==="supF"){ S.sup.filter=el.dataset.f; S.sup.data=null; paint(); }
    else if(a==="supOpen") supportModal(Number(id));
    else if(a==="supUnlock"){ const r=await api("support.unlock",{id}); toast("فُكّ القفل ومُسحت "+r.cleared+" محاولة"); await loadSupport(); supportModal(Number(id)); }
    else if(a==="supUnlockName"){ const r=await api("support.unlock",{username:el.dataset.u}); toast("مُسحت "+r.cleared+" محاولة"); loadSupport(); }
    else if(a==="supLogout"){ const r=await api("support.logout",{id}); toast(r.sessions?"أُخرج من "+r.sessions+" جهاز":"لا توجد جلسات مفتوحة له الآن"); }
    else if(a==="supReset"){ const r=S.sup.data.rows.find(x=>Number(x.id)===Number(id)); confirmBox(r.role==="trainee"?"رمز تفعيل جديد":"كلمة مرور مؤقتة جديدة","ستُلغى كلمة مرور «"+r.name+"» الحالية، ويُخرج من كل الأجهزة، ويُفك قفله.","متابعة",async()=>{ const res=await api("support.reset",{id}); await loadSupport(); supResult(r,res); },false); }
    else if(a==="supToggle"){ const r=S.sup.data.rows.find(x=>Number(x.id)===Number(id)); const res=await api("support.toggle",{id}); toast(res.active?"فُعّل الحساب":"أُوقف الحساب وأُخرج من كل الأجهزة"); await loadSupport(); supportModal(Number(id)); }
    else if(a==="supDel"){ const r=S.sup.data.rows.find(x=>Number(x.id)===Number(id)), all=el.dataset.mode==="all"; confirmBox(all?"حذف المتدرب وكل بياناته":"حذف الحساب",all?"سيُحذف «"+r.name+"» وزياراته وتقاريره الأسبوعية وتقييماته نهائياً، ولا يمكن التراجع.":(r.role==="trainee"?"سيُحذف حساب دخول «"+r.name+"» فقط، وتبقى بياناته. يمكنك توليد رمز جديد له لاحقاً من «حسابات المتدربين».":"سيُحذف حساب «"+r.name+"». تبقى زياراته، ويصبح متدربوه بلا مشرف."),"حذف نهائياً",async()=>{ await api("support.delete",{id,mode:el.dataset.mode}); closeModal(); toast("حُذف"); await loadSupport(); refresh(); }); }
  }catch(e){ if(e) toast(e.message); }
});
document.addEventListener("keydown",ev=>{
  if(ev.key==="Escape"){ if($("#modal").innerHTML) closeModal(); else if(S.openT){ S.openT=null; paintDrawer(); } }
  if(ev.key==="Enter" && ev.target.matches("tr[data-open],tr[data-act]")) ev.target.click();
});
document.addEventListener("input",ev=>{
  const id=ev.target.id, v=ev.target.value;
  if(ev.target.closest("form")) S.dirty=true;
  if(id==="supq"){ S.sup.q=v; clearTimeout(S.sup._t); S.sup._t=setTimeout(loadSupport,400); return; }
  if(id==="fq"){ S.f.q=v; paint(); } else if(id==="vq"){ S.vf.q=v; paint(); } else if(id==="wq"){ S.wf.q=v; paint(); } else if(id==="gq"){ S.gf.q=v; paint(); }
});
document.addEventListener("change",async ev=>{
  const el=ev.target, id=el.id, v=el.value;
  const map={fdept:"dept",fspec:"spec",fent:"entity",fsector:"sector",fst:"st",fsup:"sup",facc:"acc"};
  if(map[id]){ S.f[map[id]]=v; if(id==="fdept") S.f.spec=""; if(id==="fsector") S.f.entity=""; paint(); }
  else if(id==="fmine"){ S.f.mine=el.checked; paint(); }
  else if(id==="vsup"){ S.vf.sup=v; paint(); }
  else if(id==="wst"){ S.wf.status=v; paint(); }
  else if(id==="gst"){ S.gf.st=v; paint(); } else if(id==="gterm"){ S.gf.term=v; paint(); }
  else if(id==="supf"){ S.sup.filter=v; S.sup.data=null; paint(); }
  else if(id==="akind"){ S.af.kind=v; S.audit=null; paint(); }
  else if(id==="selAll"){ const {list}=filteredTrainees(); list.forEach(t=>S.sel[t.id]=el.checked); paint(); }
  else if(id==="bulkSup" && v){ const ids=Object.keys(S.sel).filter(k=>S.sel[k]).map(Number); try{ const r=await api("trainee.assign",{ids,supervisor_id:v==="_none"?"":v}); S.sel={}; toast("عُيّن "+r.count+" متدرباً"); refresh(); }catch(e){ toast(e.message); } }
  else if(el.dataset.brand){ const f=el.files[0]; if(!f) return; const fd=new FormData(); fd.append("file",f); fd.append("kind",el.dataset.brand); try{ S.settings=await api("brand.upload",fd,true); brand(); toast("حُفظت الصورة"); paint(); }catch(e){ toast(e.message); } }
});
document.addEventListener("submit",async ev=>{
  const f=ev.target;
  if(f.id==="pwform"){ ev.preventDefault(); submitPw(f); }
  else if(f.id==="nform"){ ev.preventDefault(); const err=$("#nerr"); err.textContent=""; try{ await api("notice.save",Object.fromEntries(new FormData(f))); f.reset(); toast("نُشر الإعلان"); refresh(); }catch(e){ err.textContent=e.message; } }
  else if(f.id==="setform"){ ev.preventDefault(); const err=$("#seterr"); err.textContent=""; const d=Object.fromEntries(new FormData(f)); if(!f.elements.require_visit_report.checked) d.require_visit_report=""; try{ await api("settings.save",d); await loadSession(); brand(); toast("حُفظت الإعدادات"); paint(); }catch(e){ err.textContent=e.message; } }
  else if(f.id==="twform"){ ev.preventDefault(); const err=$("#twerr"), btn=$("#twbtn"), file=f.elements.file.files[0]; err.textContent="";
    if(file && file.size>S.settings.maxUpload*1048576){ err.textContent="حجم الملف أكبر من "+S.settings.maxUpload+" ميجابايت."; return; }
    btn.disabled=true; btn.textContent="جارٍ الإرسال…";
    try{ await api("weekly.submit",new FormData(f),true); toast("سُلّم التقرير لمشرفك"); S.portal=await api("portal"); paint(); }catch(e){ err.textContent=e.message; btn.disabled=false; btn.textContent="تسليم التقرير"; } }
});

/* ---------- show/hide password eye ---------- */
const EYE='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 19c-7 0-11-7-11-7a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 7 11 7a18.5 18.5 0 0 1-2.16 3.19"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
function eyeify(){ document.querySelectorAll('input[type=password]:not([data-eye])').forEach(i=>{ i.dataset.eye="1"; const w=document.createElement("span"); w.className="pw-wrap"; i.parentNode.insertBefore(w,i); w.appendChild(i); const b=document.createElement("button"); b.type="button"; b.className="pw-eye"; b.title="إظهار كلمة المرور"; b.setAttribute("aria-label","إظهار كلمة المرور"); b.innerHTML=EYE; w.appendChild(b); }); }
new MutationObserver(eyeify).observe(document.body,{childList:true,subtree:true});
document.addEventListener("click",ev=>{ const b=ev.target.closest(".pw-eye"); if(!b) return; ev.preventDefault(); ev.stopPropagation(); const i=b.parentNode.querySelector("input"); const show=i.type==="password"; i.type=show?"text":"password"; b.innerHTML=show?EYE_OFF:EYE; const t=show?"إخفاء كلمة المرور":"إظهار كلمة المرور"; b.title=t; b.setAttribute("aria-label",t); i.focus(); },true);

boot();
})();
