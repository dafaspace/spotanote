const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
let mode='notes',level=0,running=false,locked=false,question=null,deadline=0,started=0,score=0,streak=0,attempts=0,tick,nextTimer;
// Answers are language-neutral keys (n:step:acc, i:id, c:step:acc:type) and become words only on screen, so statistics survive a language switch.
const semis=[0,2,4,5,7,9,11],NATURAL=[0,2,4,5,7,9,11];
const types=[{id:'maj',intervals:[0,4,7]},{id:'min',intervals:[0,3,7]},{id:'dim',intervals:[0,3,6]},{id:'aug',intervals:[0,4,8]},{id:'dom7',intervals:[0,4,7,10]},{id:'maj7',intervals:[0,4,7,11]},{id:'min7',intervals:[0,3,7,10]}];
const sevenths=[...types.slice(4),{id:'hdim7',intervals:[0,3,6,10]},{id:'dim7',intervals:[0,3,6,9]}],SEVENTH_IDS=new Set(sevenths.map(s=>s.id));
const intervals=[{id:'m2',steps:1,semitones:1},{id:'M2',steps:1,semitones:2},{id:'m3',steps:2,semitones:3},{id:'M3',steps:2,semitones:4},{id:'P4',steps:3,semitones:5},{id:'A4',steps:3,semitones:6},{id:'P5',steps:4,semitones:7},{id:'m6',steps:5,semitones:8},{id:'M6',steps:5,semitones:9},{id:'m7',steps:6,semitones:10},{id:'M7',steps:6,semitones:11},{id:'P8',steps:7,semitones:12}];
const pick=a=>a[Math.floor(Math.random()*a.length)],shuffle=a=>a.sort(()=>Math.random()-.5), pitch=d=>12*Math.floor(d/7)+semis[((d%7)+7)%7];
// German spells accidentals into the name (Cis, Es, B for H-flat); every other system writes the sign after the name.
const GERMAN_SHARP=['Cis','Dis','Eis','Fis','Gis','Ais','His'],GERMAN_FLAT=['Ces','Des','Es','Fes','Ges','As','B'];
function stepName(step,a){const s=((step%7)+7)%7;if(noteSystem==='german')return a===1?GERMAN_SHARP[s]:a===-1?GERMAN_FLAT[s]:NOTE_SYSTEMS.german.names[NATURAL[s]];return NOTE_SYSTEMS[noteSystem].names[NATURAL[s]]+(a===1?'♯':a===-1?'♭':'')}
function label(key){const [k,x,y,z]=key.split(':');if(k==='n')return stepName(+x,+y);if(k==='i')return t('iv_'+x);return stepName(+x,+y)+' · '+t('ch_'+z)}
function statLabel(key){return key[0]==='n'?t('tr_cat_note',{x:label(key)}):label(key)}
function staff(notes,clef='treble'){const base=clef==='treble'?30:18;let s=`<svg viewBox="0 0 360 160" role="img" aria-label="${t('tr_aria_staff')}"><g stroke="var(--staff)" stroke-width="1">`;for(let i=0;i<5;i++)s+=`<path d="M25 ${48+i*16}H335"/>`;s+='</g><g fill="var(--ink)" stroke="var(--ink)">';s+=clef==='treble'?'<text x="36" y="113" font-size="88" font-family="serif" stroke="none">𝄞</text>':'<text x="37" y="101" font-size="69" font-family="serif" stroke="none">𝄢</text>';notes.forEach((n,i)=>{const step=n.d-base,y=112-step*8,x=i>0&&n.d-notes[i-1].d===1?219:201;for(let st=-2;st>=step;st-=2)s+=`<path d="M186 ${112-st*8}h30"/>`;for(let st=10;st<=step;st+=2)s+=`<path d="M186 ${112-st*8}h30"/>`;if(n.a)s+=`<text x="${174-i*17}" y="${y+6}" font-family="serif" font-size="25" stroke="none">${n.a===2?'𝄪':n.a===-2?'𝄫':n.a===1?'♯':n.a===-1?'♭':'♮'}</text>`;s+=`<ellipse cx="${x}" cy="${y}" rx="9" ry="6.2" transform="rotate(-18 ${x} ${y})" stroke="none"/>`});const ys=notes.map(n=>112-(n.d-base)*8);s+=`<path d="M210 ${Math.max(...ys)}V${Math.min(...ys)-36}" stroke-width="2"/></g></svg>`;return s}
let history=[];try{history=JSON.parse(localStorage.getItem('notempo-v1')||'[]');if(!Array.isArray(history))history=[]}catch{}
// Until 10 Nov 2026 answers were saved as Russian words ("Интервал Малая терция"); turn them into neutral keys once.
const RU_NAMES=['До','Ре','Ми','Фа','Соль','Ля','Си'],RU_IV={'Малая секунда':'m2','Большая секунда':'M2','Малая терция':'m3','Большая терция':'M3','Чистая кварта':'P4','Увеличенная кварта':'A4','Чистая квинта':'P5','Малая секста':'m6','Большая секста':'M6','Малая септима':'m7','Большая септима':'M7','Чистая октава':'P8'},RU_CH={'мажор':'maj','минор':'min','уменьш.':'dim','увелич.':'aug','доминантсептаккорд':'dom7','большой мажорный септаккорд':'maj7','малый минорный септаккорд':'min7','полууменьшённый септаккорд':'hdim7','уменьшённый септаккорд':'dim7'};
function ruNote(s){const a=s.endsWith('♯')?1:s.endsWith('♭')?-1:0,base=a?s.slice(0,-1):s,i=RU_NAMES.indexOf(base);return i<0?null:i+':'+a}
function migrateKey(key){if(/^[nic]:/.test(key))return key;let m;if((m=key.match(/^Нота (.+)$/))){const n=ruNote(m[1]);return n&&'n:'+n}if((m=key.match(/^Интервал (.+)$/)))return RU_IV[m[1]]?'i:'+RU_IV[m[1]]:null;if((m=key.match(/^Аккорд (.+) · (.+)$/))){const n=ruNote(m[1]);return n&&RU_CH[m[2]]?'c:'+n+':'+RU_CH[m[2]]:null}return null}
{let changed=false;history=history.map(h=>{const k=migrateKey(h.key);if(k!==h.key)changed=true;return k?{...h,key:k}:null}).filter(Boolean);if(changed)try{localStorage.setItem('notempo-v1',JSON.stringify(history))}catch{}}
function makeQuestion(){
 const kind=mode,clef=level===2?pick(['treble','bass']):'treble',base=clef==='treble'?28:16;
 let root={d:base+Math.floor(Math.random()*(kind==='notes'?9:5)),a:kind==='notes'&&level?pick([-1,0,0,1]):0};
 let notes=[root],answer,pool;
 if(kind==='notes'){
  answer=`n:${root.d%7}:${root.a}`;pool=[0,1,2,3,4,5,6].flatMap(s=>level?[`n:${s}:0`,`n:${s}:1`,`n:${s}:-1`]:[`n:${s}:0`]);
 }else if(kind==='intervals'){
  const available=level===0?intervals.filter(i=>[4,5,7,12].includes(i.semitones)):level===1?intervals.filter(i=>i.semitones!==6):intervals;
  const interval=pick(available),d=root.d+interval.steps;
  notes=[root,{d,a:pitch(root.d)+interval.semitones-pitch(d)}];answer='i:'+interval.id;pool=available.map(i=>'i:'+i.id);
 }else{
  const available=kind==='chords'?types.slice(0,level===0?2:4):sevenths.slice(0,level===2?5:3),type=pick(available);
  notes=type.intervals.map((v,i)=>{const d=root.d+i*2;return{d,a:pitch(root.d)+v-pitch(d)}});
  answer=`c:${root.d%7}:0:${type.id}`;pool=available.flatMap(ty=>[0,1,2,3,4,5,6].map(s=>`c:${s}:0:${ty.id}`));
 }
 return{kind,clef,notes,answer,choices:shuffle([answer,...shuffle(pool.filter(n=>n!==answer)).slice(0,3)]),key:answer};
}
function previewMode(){
 $('#prompt').textContent=t('tr_q_'+mode);
 const samples={notes:[32],intervals:[28,32],chords:[28,30,32],sevenths:[28,30,32,34]};
 $('#notation').innerHTML=staff(samples[mode].map(d=>({d,a:0})));
 $('#feedback').textContent=t('tr_ready');
}
function showQuestion(){if(!running)return;locked=false;question=makeQuestion();$('#prompt').textContent=t('tr_q_'+question.kind);$('#notation').innerHTML=staff(question.notes,question.clef);$('#feedback').textContent=t(question.clef==='bass'?'tr_bass':'tr_treble');$('#answers').innerHTML=question.choices.map((c,i)=>`<button data-answer="${i}"><small>${i+1}</small><span>${label(c)}</span></button>`).join('');started=performance.now()}
function record(ok,ms){history.push({key:question.key,kind:question.kind,level,ok,ms,date:Date.now()});try{localStorage.setItem('notempo-v1',JSON.stringify(history))}catch{$('#hint').textContent=t('tr_save_fail')}}
function answer(index){if(!running||locked)return;if(Date.now()>=deadline){end();return}locked=true;const value=question.choices[index],ok=value===question.answer;record(ok,performance.now()-started);attempts++;score+=+ok;streak=ok?streak+1:0;$('#correct').textContent=score;$('#streak').textContent=streak;$('#feedback').textContent=ok?t('tr_good'):t('tr_answer_was',{a:label(question.answer)});$$('#answers button').forEach((b,i)=>{b.disabled=true;if(question.choices[i]===question.answer)b.classList.add('good');else if(i===index)b.classList.add('bad')});nextTimer=setTimeout(showQuestion,ok?450:1300)}
function end(){clearInterval(tick);clearTimeout(nextTimer);if(running&&!locked&&question){record(false,performance.now()-started);attempts++;}running=false;locked=true;$('#timer').textContent=0;$('#prompt').textContent=t('tr_end_title');$('#feedback').textContent=t('tr_end_text',{s:score,n:attempts});$('#answers').innerHTML='';$('#start').hidden=false;$('#startLabel').textContent=t('tr_again');$('#status').textContent=t('tr_status_end');$('#hint').textContent=t('tr_saved');setControls(false)}
function setControls(disabled){$$('#modes button,#levels button').forEach(b=>b.disabled=disabled)}
$('#start').onclick=()=>{running=true;locked=false;score=streak=attempts=0;$('#correct').textContent=0;$('#streak').textContent=0;deadline=Date.now()+60000;$('#timer').textContent=60;$('#status').textContent=t('tr_status_run');$('#start').hidden=true;$('#hint').textContent=t('tr_hint_run');setControls(true);showQuestion();tick=setInterval(()=>{let s=Math.max(0,Math.ceil((deadline-Date.now())/1000));$('#timer').textContent=s;if(!s)end()},100)};
$('#answers').onclick=e=>{const b=e.target.closest('[data-answer]');if(b)answer(+b.dataset.answer)};document.addEventListener('keydown',e=>{if(!e.repeat&&/^[1-4]$/.test(e.key)&&!$('#play').hidden)answer(+e.key-1)});
$$('[data-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;$$('[data-mode]').forEach(x=>x.classList.toggle('selected',x===b));previewMode()});$$('[data-level]').forEach(b=>b.onclick=()=>{level=+b.dataset.level;$$('[data-level]').forEach(x=>x.classList.toggle('selected',x===b))});
function page(name){$('#play').hidden=name!=='play';$('#stats').hidden=name!=='stats';$$('.nav').forEach(b=>b.classList.toggle('active',b.dataset.page===name));if(name==='stats')renderStats()};$$('[data-page]').forEach(b=>b.onclick=()=>page(b.dataset.page));$('#viewStats').onclick=()=>page('stats');$('#filter').onchange=renderStats;$('#modeFilter').onchange=renderStats;
function historyMode(h){return h.kind==='chords'&&SEVENTH_IDS.has(h.key.split(':')[3])?'sevenths':h.kind}
function renderStats(){let data=history.filter(h=>($('#filter').value==='all'||h.level===+$('#filter').value)&&($('#modeFilter').value==='all'||historyMode(h)===$('#modeFilter').value)),correct=data.filter(h=>h.ok),percent=data.length?Math.round(correct.length/data.length*100):0;$('#summary').innerHTML=[[data.length,t('tr_sum_total')],[data.length?percent+'%':'-',t('tr_sum_acc')],[correct.length?t('tr_sec_value',{v:(correct.reduce((s,h)=>s+h.ms,0)/correct.length/1000).toFixed(1)}):'-',t('tr_sum_time')],[new Set(data.map(h=>h.key)).size,t('tr_sum_items')]].map(([v,l])=>`<div><b>${v}</b><span>${l}</span></div>`).join('');let groups={};data.forEach(h=>{let g=groups[h.key]??={key:h.key,total:0,ok:0};g.total++;g.ok+=+h.ok});let rows=Object.values(groups).sort((a,b)=>a.ok/a.total-b.ok/b.total);$('#insight').hidden=!data.length;$('#insight').textContent=data.length?t('tr_insight',{w:statLabel(rows[0].key),wp:Math.round(rows[0].ok/rows[0].total*100),b:statLabel(rows.at(-1).key),bp:Math.round(rows.at(-1).ok/rows.at(-1).total*100)}):'';$('#statRows').innerHTML=rows.length?rows.map(r=>{let p=Math.round(r.ok/r.total*100);return`<div class="statrow"><span>${statLabel(r.key)}</span><div class="track"><div style="width:${p}%"></div></div><b>${p}%</b><small>${t('tr_row',{ok:r.ok,n:r.total})}</small></div>`}).join(''):`<div class="empty">${t('tr_empty1')}<br><br>${t('tr_empty2')}</div>`}
$('#reset').onclick=()=>{if(confirm(t('tr_reset_confirm'))){history=[];try{localStorage.removeItem('notempo-v1')}catch{}renderStats()}};
// Language: the same setting as the game (spotanote-lang); the trainer has its own picker so it can be changed here too.
function paintTrainer(){applyI18n();document.title=t('tr_title');$$('[data-i18n]').forEach(el=>{el.textContent=t(el.dataset.i18n)});$$('[data-i18n-aria]').forEach(el=>el.setAttribute('aria-label',t(el.dataset.i18nAria)));if(!running){previewMode();$('#startLabel').textContent=t(attempts?'tr_again':'tr_start');$('#status').textContent=t(attempts?'tr_status_end':'tr_status_idle')}if(!$('#stats').hidden)renderStats()}
function setTrainerLanguage(code){lang=code;store.set('spotanote-lang',code);if(!store.get('spotanote-notes'))noteSystem=DEFAULT_NOTES[code];paintTrainer()}
$('#langSel').innerHTML=Object.entries(LANGS).map(([c,n])=>`<option value="${c}">${n}</option>`).join('');$('#langSel').value=lang;$('#langSel').onchange=e=>setTrainerLanguage(e.target.value);
paintTrainer();$('#notation').innerHTML=staff([{d:32,a:0}]);
