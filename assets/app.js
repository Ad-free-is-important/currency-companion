'use strict';
const $ = id => document.getElementById(id);
const FRANK = 'https://api.frankfurter.dev/v2';
const COMMON = ['USD','CNY','CAD','EUR','GBP','JPY','HKD','AUD','KRW','SGD','CHF','NZD','THB','TWD','MYR','AED','INR','MXN'];
const COUNTRY = {USD:['US','美国'],CNY:['CN','中国'],CAD:['CA','加拿大'],EUR:['EU','欧元区 欧洲 德国 法国 意大利 西班牙'],GBP:['GB','英国'],JPY:['JP','日本'],HKD:['HK','中国香港'],AUD:['AU','澳大利亚 澳洲'],KRW:['KR','韩国'],SGD:['SG','新加坡'],CHF:['CH','瑞士'],NZD:['NZ','新西兰'],THB:['TH','泰国'],TWD:['TW','中国台湾'],MYR:['MY','马来西亚'],AED:['AE','阿联酋 迪拜'],INR:['IN','印度'],MXN:['MX','墨西哥'],VND:['VN','越南'],IDR:['ID','印度尼西亚'],PHP:['PH','菲律宾'],RUB:['RU','俄罗斯'],TRY:['TR','土耳其'],BRL:['BR','巴西'],ZAR:['ZA','南非'],SAR:['SA','沙特阿拉伯'],SEK:['SE','瑞典'],NOK:['NO','挪威'],DKK:['DK','丹麦'],PLN:['PL','波兰'],CZK:['CZ','捷克']};
const LOCAL_NAMES = {CNY:'人民币',USD:'美元',CAD:'加元',EUR:'欧元',GBP:'英镑',JPY:'日元',HKD:'港币',AUD:'澳元',KRW:'韩元',SGD:'新加坡元',CHF:'瑞士法郎',NZD:'新西兰元',TWD:'新台币'};
const RANGE = {'1d':{label:'日',range:'1d',interval:'5m',detail:'5 分钟报价',days:1},'1w':{label:'周',range:'5d',interval:'30m',detail:'30 分钟报价',days:7},'1m':{label:'月',range:'1mo',interval:'1d',detail:'每日收盘',days:31},'1y':{label:'年',range:'1y',interval:'1d',detail:'每日收盘',days:366},'5y':{label:'五年',range:'5y',interval:'1wk',detail:'每周收盘',days:1827}};
let saved; try {saved = JSON.parse(localStorage.getItem('fx-settings')) || {};} catch (_) {saved = {};}
const validCode = c => /^[A-Z]{3}$/.test(c || '');
const state = {theme:document.documentElement.dataset.theme==='dark'?'dark':'light',base:validCode(saved.base)?saved.base:'USD',quote:validCode(saved.quote)?saved.quote:'CNY',amount:typeof saved.amount==='string'?saved.amount:'100',range:RANGE[saved.range]?saved.range:'1m',favorites:Array.isArray(saved.favorites)?saved.favorites.filter(validCode):['CNY','CAD','EUR','JPY','GBP','HKD'],auto:saved.auto!==false,decimals:saved.decimals===4?4:2,page:'convert',data:null,currencies:COMMON.map(code=>({code,name:code})),busy:false,cache:false};
let seq=0, pending=new Map(), inflight=new Map(), generation=0, pickerMode='quote', selectedPoint=-1, toastTimer, watchGeneration=0, watchRows=[];
let currencyNames; try {currencyNames=new Intl.DisplayNames(['zh-CN'],{type:'currency'});} catch (_) {}
function name(code){return LOCAL_NAMES[code] || (currencyNames?currencyNames.of(code):state.currencies.find(c=>c.code===code)?.name) || code;}
function flag(code){const cc=COUNTRY[code]?.[0] || code.slice(0,2);return cc==='XA'||cc==='XD'||cc==='XO'||cc==='XC'?'🌐':Array.from(cc).map(c=>String.fromCodePoint(c.charCodeAt(0)+127397)).join('');}
function persist(){const {base,quote,amount,range,favorites,auto,decimals,theme}=state;try{localStorage.setItem('fx-settings',JSON.stringify({base,quote,amount,range,favorites,auto,decimals,theme}));}catch(_) {}}
function applyTheme(theme, save=true){
 state.theme=theme==='dark'?'dark':'light';
 document.documentElement.dataset.theme=state.theme;
 const background=getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
 document.querySelector('meta[name="theme-color"]').setAttribute('content',background);
 document.querySelectorAll('[data-theme-choice]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.themeChoice===state.theme)));
 if(window.AndroidFX&&typeof window.AndroidFX.setAppearance==='function'){try{window.AndroidFX.setAppearance(state.theme);}catch(_){}}
 if(save)persist();
 drawChart();
}
function toast(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,2400);}
function precise(n){if(!Number.isFinite(n))return '—';if(n===0)return '0';return new Intl.NumberFormat('en-US',{maximumFractionDigits:Math.min(10,Math.max(4,5-Math.floor(Math.log10(Math.abs(n)))))}).format(n);}
function money(n){return Number.isFinite(n)?new Intl.NumberFormat('en-US',{minimumFractionDigits:state.decimals,maximumFractionDigits:state.decimals}).format(n):'—';}
function percent(n){return Number.isFinite(n)?`${n>0?'+':''}${n.toFixed(2)}%`:'—';}
function amount(){const s=state.amount.trim();return /^(\d+\.?\d*|\.\d+)$/.test(s)?Number(s):NaN;}
function dateString(date){return date.toISOString().slice(0,10);}
function dateTime(t, dateOnly=false){return new Date(t*1000).toLocaleString('zh-CN',dateOnly?{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'UTC'}:{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false});}
function cacheKey(){return `fx-data:${state.base}:${state.quote}:${state.range}`;}
function cacheRead(key){try{return JSON.parse(localStorage.getItem(key));}catch(_){return null;}}
function cacheWrite(key,data){try{localStorage.setItem(key,JSON.stringify({savedAt:Date.now(),data}));const keys=Object.keys(localStorage).filter(k=>k.startsWith('fx-data:'));if(keys.length>24){keys.sort((a,b)=>(cacheRead(a)?.savedAt||0)-(cacheRead(b)?.savedAt||0));keys.slice(0,keys.length-24).forEach(k=>localStorage.removeItem(k));}}catch(_){}}

window.__nativeReply=(id,body,error)=>{const item=pending.get(id);if(!item)return;pending.delete(id);clearTimeout(item.timer);if(error)item.reject(new Error(error));else{try{item.resolve(JSON.parse(body));}catch(_){item.reject(new Error('数据格式异常'));}}};
function request(url){
 if(inflight.has(url))return inflight.get(url);
 const task=(async()=>{
  if(window.AndroidFX)return new Promise((resolve,reject)=>{const id='r'+(++seq),timer=setTimeout(()=>{pending.delete(id);reject(new Error('连接超时'));},30000);pending.set(id,{resolve,reject,timer});window.AndroidFX.request(id,url);});
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
  try{const res=await fetch(url,{signal:controller.signal});if(!res.ok)throw new Error(`数据源暂不可用 (${res.status})`);return await res.json();}finally{clearTimeout(timer);}
 })().finally(()=>inflight.delete(url));inflight.set(url,task);return task;
}
function cleanPoints(points){const seen=new Map();for(const p of points)if(Number.isFinite(p.t)&&Number.isFinite(p.v)&&p.v>0)seen.set(p.t,p);return Array.from(seen.values()).sort((a,b)=>a.t-b.t);}
async function yahoo(symbol,range){
 const spec=RANGE[range];let last;
 for(const host of ['query1.finance.yahoo.com','query2.finance.yahoo.com']){
  try{const d=await request(`https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${spec.interval}&range=${spec.range}`);const result=d.chart?.result?.[0];if(!result||d.chart?.error)throw new Error('该货币暂无日内行情');const closes=result.indicators?.quote?.[0]?.close||[];const points=cleanPoints((result.timestamp||[]).map((t,i)=>({t,v:closes[i]})));if(!points.length)throw new Error('该时间范围暂无行情');return {points,meta:result.meta};}catch(e){last=e;}
 }throw last;
}
function normalizeMarket(raw,range){const last=raw.points.at(-1);const rate=Number(raw.meta.regularMarketPrice);const time=Number(raw.meta.regularMarketTime);if(!(rate>0&&Number.isFinite(rate)&&time>0))throw new Error('报价无效');const previous=Number(raw.meta.chartPreviousClose ?? raw.meta.previousClose);return {points:raw.points,rate,time,source:'Yahoo Finance',kind:'market',interval:RANGE[range].detail,previous:previous>0?previous:null,range,asof:dateTime(time),fetchedAt:Date.now(),cross:false};}
async function market(base,quote,range){
 const symbol=base==='USD'?`${quote}=X`:`${base}${quote}=X`;
 try{const raw=await yahoo(symbol,range);if(raw.meta.currency!==quote)throw new Error('货币单位不匹配');return normalizeMarket(raw,range);}catch(directError){
  if(base==='USD')throw directError;
  const [a,b]=await Promise.all([yahoo(`${base}=X`,range),quote==='USD'?Promise.resolve(null):yahoo(`${quote}=X`,range)]);
  if(a.meta.currency!==base||(b&&b.meta.currency!==quote))throw new Error('交叉汇率货币不匹配');
  const bm=b?new Map(b.points.map(p=>[p.t,p.v])):null;
  const points=cleanPoints(a.points.map(p=>({t:p.t,v:(bm?bm.get(p.t):1)/p.v})));
  if(points.length<2)throw new Error('交叉汇率时间点不足');
  // Use only synchronized historical observations; do not combine differently timed latest quotes.
  const last=points.at(-1);return {points,rate:last.v,time:last.t,source:'Yahoo Finance',kind:'market',interval:RANGE[range].detail,previous:null,range,asof:dateTime(last.t),fetchedAt:Date.now(),cross:true};
 }
}
async function reference(base,quote,range){
 const currentPromise=request(`${FRANK}/rate/${base}/${quote}`);
 let historyPromise=Promise.resolve([]);
 if(range!=='1d'){
  const from=new Date();if(range==='5y')from.setUTCFullYear(from.getUTCFullYear()-5);else if(range==='1y')from.setUTCFullYear(from.getUTCFullYear()-1);else if(range==='1m')from.setUTCMonth(from.getUTCMonth()-1);else from.setUTCDate(from.getUTCDate()-7);
  historyPromise=request(`${FRANK}/rates?base=${base}&quotes=${quote}&from=${dateString(from)}${range==='5y'?'&group=week':''}`).catch(()=>null);
 }
 const [latest,rows]=await Promise.all([currentPromise,historyPromise]);
 if(!(Number(latest.rate)>0)||latest.base!==base||latest.quote!==quote)throw new Error('暂无有效参考汇率');
 const points=cleanPoints((rows||[]).filter(r=>r.base===base&&r.quote===quote).map(r=>({t:Date.parse(r.date+'T00:00:00Z')/1000,v:Number(r.rate)})));
 return {points,rate:Number(latest.rate),time:Date.parse(latest.date+'T00:00:00Z')/1000,source:'Frankfurter',kind:'daily',interval:range==='5y'?'每周参考价':'每日参考价',previous:null,range,asof:latest.date,fetchedAt:Date.now(),historyError:rows===null};
}
function sameCurrency(range){const t=Math.floor(Date.now()/1000);return {points:[{t:t-RANGE[range].days*86400,v:1},{t,v:1}],rate:1,time:t,source:'同币种',kind:'identity',interval:'固定比值',previous:null,range,asof:'1 : 1',fetchedAt:Date.now()};}
async function refresh(force=false){
 const ticket=++generation,base=state.base,quote=state.quote,range=state.range,key=cacheKey();
 state.busy=true;$('refresh').classList.add('loading');$('refresh').disabled=true;
 const cached=cacheRead(key);state.data=cached?.data?.range===range?cached.data:null;state.cache=!!state.data;render();
 try{
  const data=base===quote?sameCurrency(range):await market(base,quote,range).catch(()=>reference(base,quote,range));
  if(ticket!==generation)return;state.data=data;state.cache=false;cacheWrite(key,data);render();
 }catch(e){if(ticket!==generation)return;state.cache=!!state.data;render();$('status').textContent=state.data?`连接失败，显示本机缓存。报价时间：${state.data.asof}\n检查网络后点击右上角刷新。`:'暂时无法连接行情源。请检查网络，然后点击右上角刷新。';$('status').classList.add('warning');if(!state.data)$('chartEmpty').textContent='行情暂不可用\n请联网后刷新';}
 finally{if(ticket===generation){state.busy=false;$('refresh').classList.remove('loading');$('refresh').disabled=false;if(state.page==='watch')refreshWatch(force);}}
}
function render(){
 for(const side of ['base','quote']){$(side+'Code').textContent=state[side];$(side+'Name').textContent=name(state[side]);$(side+'Flag').textContent=flag(state[side]);}
 $('pairHeading').textContent=`${state.base} / ${state.quote}`;$('heroCaption').textContent=`1 ${name(state.base)}可兑换的${name(state.quote)}`;
 $('favorite').textContent=state.favorites.includes(state.quote)?'★':'☆';$('favorite').setAttribute('aria-label',state.favorites.includes(state.quote)?'取消收藏当前目标货币':'收藏当前目标货币');
 document.querySelectorAll('[data-range]').forEach(b=>{b.classList.toggle('active',b.dataset.range===state.range);b.setAttribute('aria-pressed',b.dataset.range===state.range);});
 const d=state.data;$('heroRate').textContent=d?precise(d.rate):'—';$('chartInterval').textContent=d?d.interval:'—';$('change').textContent='—';$('change').classList.remove('negative');$('status').classList.toggle('warning',state.cache);
 if(d){
  const change=d.points.length>1?(d.points.at(-1).v/d.points[0].v-1)*100:NaN;
  $('change').textContent=Number.isFinite(change)?`${RANGE[state.range].label} ${percent(change)}`:'参考报价';$('change').classList.toggle('negative',change<0);
  $('marketState').textContent=state.cache?'离线缓存 · 等待更新':d.kind==='market'?'最新行情 · 可能延迟':d.kind==='identity'?'同币种 · 固定 1 : 1':'每日参考价 · 非实时';
  $('status').textContent=d.kind==='identity'?'相同货币的兑换比例恒为 1 : 1。':`${state.cache?'本机缓存 · ':''}${d.source}${d.cross?' · 经美元交叉计算':''}\n报价时间：${d.asof}${d.kind==='daily'?'（按数据源日期）':'（手机本地时间）'}`;
  if(d.kind==='market'&&Date.now()/1000-d.time>21600){$('status').textContent+='\n报价距今超过 6 小时，可能处于休市或数据延迟。';$('status').classList.add('warning');}
  if(d.kind==='daily'&&Date.now()/1000-d.time>345600){$('status').textContent+='\n该参考价已超过 4 天，请留意报价日期。';$('status').classList.add('warning');}
  $('chartNote').textContent=d.kind==='daily'?'日内行情不可用，已切换为每日参考数据。':d.cross?'按相同时间点的美元报价计算交叉汇率。':'长按或拖动曲线查看报价；休市时显示最近交易日。';
  if(d.points.length){$('chartNote').textContent+=`\n实际覆盖 ${dateTime(d.points[0].t,d.kind==='daily')} — ${dateTime(d.points.at(-1).t,d.kind==='daily')} · ${d.points.length} 个点`;}
 }else{$('marketState').textContent='正在获取最新报价';$('status').textContent='正在连接行情源…';$('chartNote').textContent='曲线按原始报价绘制';}
 renderConversion();renderStats();selectedPoint=-1;drawChart();
}
function renderConversion(){const n=amount();$('converted').textContent=state.data?money(n*state.data.rate):'—';$('conversionNote').textContent=!Number.isFinite(n)?'请输入有效的非负金额':state.data?`1 ${state.quote} = ${precise(1/state.data.rate)} ${state.base} · ${state.data.kind==='daily'?'每日参考价':'参考汇率'}`:'等待最新可用汇率';}
function renderStats(){const pts=state.data?.points||[],values=pts.map(p=>p.v);$('low').textContent=pts.length?precise(Math.min(...values)):'—';$('high').textContent=pts.length?precise(Math.max(...values)):'—';const change=pts.length>1?(pts.at(-1).v/pts[0].v-1)*100:NaN;$('periodChange').textContent=percent(change);$('periodChange').style.color=change<0?'var(--negative)':'var(--mint)';}
function drawChart(){
 const styles=getComputedStyle(document.documentElement),color=key=>styles.getPropertyValue(key).trim();
 const canvas=$('chart'),w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;const ratio=Math.min(window.devicePixelRatio||1,3);canvas.width=w*ratio;canvas.height=h*ratio;const ctx=canvas.getContext('2d');ctx.scale(ratio,ratio);ctx.clearRect(0,0,w,h);
 const points=state.data?.points||[];$('chartEmpty').hidden=points.length>0;$('tooltip').hidden=selectedPoint<0;
 if(!points.length){$('chartEmpty').textContent=state.data?.kind==='daily'&&state.range==='1d'?'此货币暂无日内行情\n可切换到周、月、年或五年':state.data?'此范围暂无历史数据\n可尝试切换时间范围':'正在获取历史汇率…';return;}
 const L=7,R=62,T=22,B=28,cw=w-L-R,ch=h-T-B,min=Math.min(...points.map(p=>p.v)),max=Math.max(...points.map(p=>p.v)),pad=Math.max((max-min)*.15,Math.abs(max)*.00005),lo=min-pad,hi=max+pad;
 const start=points[0].t,end=points.at(-1).t,x=p=>L+(end===start?.5:(p.t-start)/(end-start))*cw,y=v=>T+(hi-v)/(hi-lo)*ch;
 ctx.font='10px system-ui';ctx.textBaseline='middle';for(let i=0;i<4;i++){const v=hi-(hi-lo)*i/3,yy=T+ch*i/3;ctx.strokeStyle=color('--chart-grid');ctx.lineWidth=1;ctx.setLineDash([2,5]);ctx.beginPath();ctx.moveTo(L,yy);ctx.lineTo(w-R+2,yy);ctx.stroke();ctx.fillStyle=color('--chart-text');ctx.fillText(precise(v),w-R+9,yy,52);}ctx.setLineDash([]);
 const gradient=ctx.createLinearGradient(0,T,0,h-B);gradient.addColorStop(0,color('--chart-fill-start'));gradient.addColorStop(1,color('--chart-fill-end'));ctx.beginPath();ctx.moveTo(x(points[0]),h-B);points.forEach(p=>ctx.lineTo(x(p),y(p.v)));ctx.lineTo(x(points.at(-1)),h-B);ctx.closePath();ctx.fillStyle=gradient;ctx.fill();
 ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(x(p),y(p.v)):ctx.moveTo(x(p),y(p.v)));ctx.strokeStyle=color('--mint');ctx.lineWidth=2;ctx.lineJoin='round';ctx.stroke();const last=points.at(-1);ctx.beginPath();ctx.arc(x(last),y(last.v),3,0,Math.PI*2);ctx.fillStyle=color('--mint');ctx.fill();
 ctx.fillStyle=color('--chart-text');ctx.font='10px system-ui';const label=t=>new Date(t*1000).toLocaleDateString('zh-CN',state.range==='5y'?{year:'numeric',month:'numeric'}:{month:'numeric',day:'numeric',...(state.data?.kind==='daily'?{timeZone:'UTC'}:{})});const timeLabel=t=>new Date(t*1000).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false});ctx.textAlign='left';ctx.fillText(state.range==='1d'?timeLabel(start):label(start),L,h-8);ctx.textAlign='right';ctx.fillText(state.range==='1d'?timeLabel(end):label(end),w-R,h-8);
 if(selectedPoint>=0&&points[selectedPoint]){const p=points[selectedPoint];ctx.setLineDash([3,3]);ctx.strokeStyle=color('--chart-cross');ctx.beginPath();ctx.moveTo(x(p),T);ctx.lineTo(x(p),h-B);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle=color('--chart-point');ctx.beginPath();ctx.arc(x(p),y(p.v),4,0,Math.PI*2);ctx.fill();$('tooltip').textContent=`${dateTime(p.t,state.data.kind==='daily')}\n1 ${state.base} = ${precise(p.v)} ${state.quote}`;$('tooltip').hidden=false;}
 canvas.setAttribute('aria-label',`${RANGE[state.range].label}汇率曲线，${points.length}个报价，最低${precise(min)}，最高${precise(max)}`);
}
function selectPoint(event){const pts=state.data?.points||[];if(!pts.length)return;const bounds=$('chart').getBoundingClientRect(),f=Math.max(0,Math.min(1,(event.clientX-bounds.left-7)/(bounds.width-69))),t=pts[0].t+f*(pts.at(-1).t-pts[0].t);let nearest=0;for(let i=1;i<pts.length;i++)if(Math.abs(pts[i].t-t)<Math.abs(pts[nearest].t-t))nearest=i;selectedPoint=nearest;drawChart();}
$('chart').addEventListener('pointerdown',e=>{selectPoint(e);$('chart').setPointerCapture(e.pointerId);});$('chart').addEventListener('pointermove',e=>{if(e.buttons||e.pointerType==='mouse')selectPoint(e);});$('chart').addEventListener('pointerleave',e=>{if(e.pointerType==='mouse'){selectedPoint=-1;drawChart();}});$('chart').addEventListener('pointercancel',()=>{selectedPoint=-1;drawChart();});
new ResizeObserver(()=>drawChart()).observe($('chartWrap'));

function showPage(page){state.page=page;document.querySelectorAll('.page').forEach(el=>el.hidden=el.id!==page+'Page');document.querySelectorAll('[data-page]').forEach(b=>b.classList.toggle('selected',b.dataset.page===page));window.scrollTo(0,0);if(page==='watch')refreshWatch();if(page==='convert')drawChart();}
function openPicker(mode){pickerMode=mode;$('pickerTitle').textContent=mode==='watch'?'添加常用货币':mode==='base'?'选择持有货币':'选择目标货币';$('search').value='';$('pickerOverlay').hidden=false;document.body.style.overflow='hidden';renderPicker();}
function closePicker(){$('pickerOverlay').hidden=true;document.body.style.overflow='';$('search').blur();}
function renderPicker(){const term=$('search').value.trim().toLowerCase(),rows=state.currencies.filter(c=>`${c.code} ${c.name} ${name(c.code)} ${COUNTRY[c.code]?.[1]||''}`.toLowerCase().includes(term)).sort((a,b)=>{const ai=COMMON.indexOf(a.code),bi=COMMON.indexOf(b.code);return (ai<0?999:ai)-(bi<0?999:bi)||a.code.localeCompare(b.code);});$('currencyCount').textContent=`${rows.length} 种货币 · 行情及历史覆盖因币种而异`;$('currencyList').replaceChildren();for(const c of rows){const button=document.createElement('button');button.className='currency-item';const f=document.createElement('span');f.className='flag';f.textContent=flag(c.code);const label=document.createElement('span');label.className='label';const b=document.createElement('b');b.textContent=c.code;const small=document.createElement('small');small.textContent=name(c.code);label.append(b,small);const mark=document.createElement('span');mark.className='check';mark.textContent=(pickerMode==='watch'?state.favorites.includes(c.code):state[pickerMode]===c.code)?'✓':'';button.append(f,label,mark);button.onclick=()=>{if(pickerMode==='watch'){if(!state.favorites.includes(c.code))state.favorites.push(c.code);persist();closePicker();refreshWatch();}else{state[pickerMode]=c.code;persist();closePicker();showPage('convert');refresh();}};$('currencyList').append(button);}if(!rows.length){const p=document.createElement('p');p.className='source-note';p.textContent='没有找到匹配的货币';$('currencyList').append(p);}}
async function refreshWatch(force=false){
 const ticket=++watchGeneration,base=state.base,key='fx-watch:'+base,cached=cacheRead(key);watchRows=cached?.data||[];renderWatch();$('watchStatus').textContent=watchRows.length?'缓存参考价 · 正在更新':'正在获取每日参考汇率…';
 try{const rows=await request(`${FRANK}/rates?base=${base}`);if(ticket!==watchGeneration)return;if(!Array.isArray(rows))throw new Error();watchRows=rows;cacheWrite(key,rows);renderWatch();$('watchStatus').textContent='Frankfurter 每日参考价 · 点击货币查看行情曲线';}catch(_){if(ticket!==watchGeneration)return;$('watchStatus').textContent=watchRows.length?'网络不可用 · 显示缓存参考价，请留意每项日期':'参考价获取失败，请点击右上角刷新';}
}
function renderWatch(){
 $('watchBase').textContent=`${money(amount())} ${state.base}`;$('watchList').replaceChildren();
 for(const code of state.favorites){const d=code===state.base?{rate:1,date:'同币种'}:watchRows.find(r=>r.quote===code&&r.base===state.base);const row=document.createElement('div');row.className='watch-row';const main=document.createElement('button');main.className='watch-main';const f=document.createElement('span');f.className='flag';f.textContent=flag(code);const label=document.createElement('span');const b=document.createElement('b');b.textContent=code;const sub=document.createElement('small');sub.textContent=name(code);label.append(b,sub);const value=document.createElement('span');value.className='watch-value';const strong=document.createElement('strong');strong.textContent=d?money(amount()*d.rate):'—';const date=document.createElement('small');date.textContent=d?d.date:'暂无报价';value.append(strong,date);main.append(f,label,value);main.onclick=()=>{state.quote=code;persist();showPage('convert');refresh();};const remove=document.createElement('button');remove.className='remove-watch';remove.textContent='×';remove.setAttribute('aria-label','移除 '+code);remove.onclick=()=>{state.favorites=state.favorites.filter(c=>c!==code);persist();renderWatch();};row.append(main,remove);$('watchList').append(row);}
 if(!state.favorites.length)$('watchList').textContent='还没有常用货币，点击右上角添加。';
}
document.querySelectorAll('[data-range]').forEach(b=>b.onclick=()=>{if(state.range===b.dataset.range)return;state.range=b.dataset.range;persist();refresh();});
document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>showPage(b.dataset.page));
$('baseBtn').onclick=()=>openPicker('base');$('quoteBtn').onclick=()=>openPicker('quote');$('addWatch').onclick=()=>openPicker('watch');$('browseAll').onclick=()=>openPicker('watch');$('closePicker').onclick=closePicker;$('pickerOverlay').onclick=e=>{if(e.target===$('pickerOverlay'))closePicker();};$('search').oninput=renderPicker;
$('swap').onclick=()=>{[state.base,state.quote]=[state.quote,state.base];persist();refresh();};
$('amount').value=state.amount;$('amount').oninput=e=>{state.amount=e.target.value.replace(/[,，]/g,'');persist();renderConversion();};
$('favorite').onclick=()=>{if(state.favorites.includes(state.quote)){state.favorites=state.favorites.filter(c=>c!==state.quote);toast('已移出常用货币');}else{state.favorites.push(state.quote);toast('已添加到常用货币');}persist();$('favorite').textContent=state.favorites.includes(state.quote)?'★':'☆';};
$('refresh').onclick=()=>{if(state.page==='watch')refreshWatch(true);else refresh(true);};
$('autoRefresh').checked=state.auto;$('autoRefresh').onchange=e=>{state.auto=e.target.checked;persist();};$('decimals').value=state.decimals;$('decimals').onchange=e=>{state.decimals=Number(e.target.value);persist();renderConversion();renderWatch();};
$('clearCache').onclick=()=>{Object.keys(localStorage).filter(k=>k.startsWith('fx-data:')||k.startsWith('fx-watch:')).forEach(k=>localStorage.removeItem(k));toast('已清除行情缓存，偏好设置已保留');};
window.handleBack=()=>{if(!$('pickerOverlay').hidden){closePicker();return true;}if(state.page!=='convert'){showPage('convert');return true;}return false;};
document.addEventListener('keydown',e=>{if(e.key==='Escape')window.handleBack();});
setInterval(()=>{if(state.auto&&!document.hidden&&!state.busy&&state.page==='convert'&&$('pickerOverlay').hidden)refresh();},60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.auto&&!state.busy&&(!state.data||Date.now()-state.data.fetchedAt>60000))refresh();});
async function loadCurrencies(){try{const local=await fetch('currencies.json').then(r=>r.json());if(Array.isArray(local)&&local.length)state.currencies=local;}catch(_){}try{const data=await request(FRANK+'/currencies');const rows=data.filter(c=>validCode(c.iso_code)).map(c=>({code:c.iso_code,name:c.name}));if(rows.length)state.currencies=rows;}catch(_){}if(!$('pickerOverlay').hidden)renderPicker();}
document.querySelectorAll('[data-theme-choice]').forEach(b=>b.onclick=()=>applyTheme(b.dataset.themeChoice));
applyTheme(state.theme);
loadCurrencies();refresh();
