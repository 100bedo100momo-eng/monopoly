(() => {
'use strict';

const panel = document.getElementById('panel');
const board = document.getElementById('board');
const overlay = document.getElementById('overlay');
const SAVE_KEY = 'monopoly-save-v1';
const START_CASH = 1500;

const delay = ms => new Promise(r => setTimeout(r, ms));
const rand = n => Math.floor(Math.random() * n) + 1;
const money = n => Number(n).toLocaleString('en-US');
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const GROUPS = {
  brown:  {label:'بني',       color:'#8d5a3c', house:50},
  sky:    {label:'سماوي',     color:'#7ec8e3', house:50},
  pink:   {label:'وردي',      color:'#d96aa8', house:100},
  orange: {label:'برتقالي',   color:'#ec8b3c', house:100},
  red:    {label:'أحمر',      color:'#e14b45', house:150},
  yellow: {label:'أصفر',      color:'#e8c63f', house:150},
  green:  {label:'أخضر',      color:'#2f9e6b', house:200},
  navy:   {label:'كحلي',      color:'#345aa0', house:200}
};
const PCOLORS = ['#ffd166','#4cc9f0','#f4726c','#8bd450'];
const prop = (name, price, group, rent) => ({name, type:'prop', price, group, rent, color:GROUPS[group].color});
const rail = name => ({name, type:'rail', price:200, color:'#4a4a4a'});
const util = name => ({name, type:'util', price:150, color:'#8a8f98'});

const TILES = [
  {name:'البداية', type:'go', icon:'🏁'},
  prop('شارع المعز', 60, 'brown', [2,10,30,90,160,250]),
  {name:'صندوق المجتمع', type:'chest', icon:'🎁'},
  prop('خان الخليلي', 60, 'brown', [4,20,60,180,320,450]),
  {name:'ضريبة الدخل', type:'tax', amount:200, icon:'🧾'},
  rail('محطة رمسيس'),
  prop('شارع النيل', 100, 'sky', [6,30,90,270,400,550]),
  {name:'الفرصة', type:'chance', icon:'❓'},
  prop('ميدان التحرير', 100, 'sky', [6,30,90,270,400,550]),
  prop('شارع الهرم', 120, 'sky', [8,40,100,300,450,600]),
  {name:'السجن / زيارة', type:'jail', icon:'⛓️'},
  prop('شارع قصر النيل', 140, 'pink', [10,50,150,450,625,750]),
  util('شركة الكهرباء'),
  prop('ميدان طلعت حرب', 140, 'pink', [10,50,150,450,625,750]),
  prop('شارع 26 يوليو', 160, 'pink', [12,60,180,500,700,900]),
  rail('محطة الجيزة'),
  prop('شارع العباسية', 180, 'orange', [14,70,200,550,750,950]),
  {name:'صندوق المجتمع', type:'chest', icon:'🎁'},
  prop('ميدان رمسيس', 180, 'orange', [14,70,200,550,750,950]),
  prop('شارع صلاح سالم', 200, 'orange', [16,80,220,600,800,1000]),
  {name:'موقف مجاني', type:'parking', icon:'🅿️'},
  prop('شارع فيصل', 220, 'red', [18,90,250,700,875,1050]),
  {name:'الفرصة', type:'chance', icon:'❓'},
  prop('كوبري 6 أكتوبر', 220, 'red', [18,90,250,700,875,1050]),
  prop('شارع جامعة الدول', 240, 'red', [20,100,300,750,925,1100]),
  rail('محطة سيدي جابر'),
  prop('مدينة نصر', 260, 'yellow', [22,110,330,800,975,1150]),
  prop('مصر الجديدة', 260, 'yellow', [22,110,330,800,975,1150]),
  util('شركة المياه'),
  prop('شارع الميرغني', 280, 'yellow', [24,120,360,850,1025,1200]),
  {name:'اذهب إلى السجن', type:'gotojail', icon:'👮'},
  prop('الزمالك', 300, 'green', [26,130,390,900,1100,1275]),
  prop('شارع الجامعة', 300, 'green', [26,130,390,900,1100,1275]),
  {name:'صندوق المجتمع', type:'chest', icon:'🎁'},
  prop('المعادي', 320, 'green', [28,150,450,1000,1200,1400]),
  rail('محطة الأقصر'),
  {name:'الفرصة', type:'chance', icon:'❓'},
  prop('الكورنيش', 350, 'navy', [35,175,500,1100,1300,1500]),
  {name:'ضريبة الرفاهية', type:'tax', amount:100, icon:'💎'},
  prop('برج القاهرة', 350, 'navy', [50,200,600,1400,1700,2000])
];

const CHANCE = [
  {t:'تقدّم إلى البداية واقبض 200 جنيه', a:'goto', to:0},
  {t:'تقدّم إلى برج القاهرة', a:'goto', to:39},
  {t:'تقدّم إلى ميدان التحرير، واقبض 200 إذا مررت بالبداية', a:'goto', to:8},
  {t:'تقدّم إلى أقرب محطة وادفع ضعف الإيجار', a:'nearest', kind:'rail', mult:2},
  {t:'تقدّم إلى أقرب شركة مرافق وادفع عشرة أضعاف النرد', a:'nearest', kind:'util', mult:10},
  {t:'اذهب إلى السجن مباشرةً دون المرور بالبداية', a:'jail'},
  {t:'ارجع ثلاث خطوات إلى الوراء', a:'back', v:3},
  {t:'فزت بمسابقة: اقبض 100 جنيه', a:'cash', v:100},
  {t:'البنك يمنحك أرباحًا: اقبض 150 جنيهًا', a:'cash', v:150},
  {t:'غرامة مخالفة: ادفع 50 جنيهًا', a:'pay', v:50},
  {t:'رسوم جمركية: ادفع 100 جنيه', a:'pay', v:100},
  {t:'مصاريف صيانة: 25 عن كل منزل و100 عن كل فندق', a:'repair'},
  {t:'اقبض 50 جنيهًا من كل لاعب', a:'collect', v:50},
  {t:'حصلت على بطاقة خروج مجاني من السجن', a:'card'}
];
const COMMUNITY = [
  {t:'تقدّم إلى البداية واقبض 200 جنيه', a:'goto', to:0},
  {t:'خطأ في البنك لصالحك: اقبض 200 جنيه', a:'cash', v:200},
  {t:'ورثت مبلغًا: اقبض 100 جنيه', a:'cash', v:100},
  {t:'استرداد ضريبة الدخل: اقبض 20 جنيهًا', a:'cash', v:20},
  {t:'بيعت أسهمك: اقبض 50 جنيهًا', a:'cash', v:50},
  {t:'عيد ميلادك: اقبض 10 جنيهات من كل لاعب', a:'collect', v:10},
  {t:'رسوم المستشفى: ادفع 100 جنيه', a:'pay', v:100},
  {t:'غرامة تأخير: ادفع 50 جنيهًا', a:'pay', v:50},
  {t:'مصاريف صيانة: 25 عن كل منزل و100 عن كل فندق', a:'repair'},
  {t:'اذهب إلى السجن مباشرةً', a:'jail'},
  {t:'حصلت على بطاقة خروج مجاني من السجن', a:'card'},
  {t:'تقدّم إلى موقف مجاني', a:'goto', to:20}
];

let game = null;
let setupCfg = {count:2, players:[
  {name:'أنت', bot:false}, {name:'الكمبيوتر', bot:true},
  {name:'لاعب 3', bot:true}, {name:'لاعب 4', bot:true}
]};
let pending = null;
let diceResolver = null;
let overlayMode = null;

/* ---------- state helpers ---------- */
function newState(){
  return {
    players: setupCfg.players.slice(0, setupCfg.count).map((c,i) => ({
      id:i, name:c.name.trim() || ('لاعب ' + (i+1)), bot:!!c.bot, color:PCOLORS[i],
      cash:START_CASH, pos:0, inJail:false, jailTurns:0, cards:0, bankrupt:false
    })),
    owner:Array(40).fill(null), houses:Array(40).fill(0), mortgaged:{},
    current:0, turn:1, phase:'roll', dice:[1,1], rolling:false,
    lastCard:null, status:'', log:[], over:false, winner:null
  };
}
function save(){ if(game){ try{ localStorage.setItem(SAVE_KEY, JSON.stringify(game)); }catch(e){} } }
function load(){ try{ const s = localStorage.getItem(SAVE_KEY); return s ? JSON.parse(s) : null; }catch(e){ return null; } }
function logMsg(msg){
  if(!game) return;
  game.log.unshift(msg);
  if(game.log.length > 60) game.log.length = 60;
  game.status = msg;
  render();
}
function ownedBy(id){ const a=[]; for(let i=0;i<40;i++) if(game.owner[i]===id) a.push(i); return a; }
function groupTiles(g){ const a=[]; for(let i=0;i<40;i++) if(TILES[i].group===g) a.push(i); return a; }
function ownsGroup(id,g){ return groupTiles(g).length>0 && groupTiles(g).every(i => game.owner[i]===id); }
function groupHasHouses(g){ return groupTiles(g).some(i => game.houses[i]>0); }
function rentFor(idx, roll, mult){
  const t = TILES[idx], owner = game.owner[idx];
  let r = 0;
  if(t.type==='rail'){
    const n = TILES.filter((x,i) => x.type==='rail' && game.owner[i]===owner && !game.mortgaged[i]).length;
    r = 25 * Math.pow(2, Math.max(0,n-1));
  }else if(t.type==='util'){
    const n = TILES.filter((x,i) => x.type==='util' && game.owner[i]===owner && !game.mortgaged[i]).length;
    r = roll * (n>=2 ? 10 : 4);
  }else{
    const h = game.houses[idx] || 0;
    r = t.rent[h] || 0;
    if(h===0 && ownsGroup(owner, t.group)) r *= 2;
  }
  return Math.round(r * (mult || 1));
}

/* ---------- rendering ---------- */
const PIPS = {1:[5],2:[1,9],3:[1,5,9],4:[1,3,7,9],5:[1,3,5,7,9],6:[1,3,4,6,7,9]};
function dieHTML(n){
  let cells = '';
  for(let i=1;i<=9;i++) cells += `<span class="pip${PIPS[n].includes(i)?' on':''}"></span>`;
  return `<div class="die${game && game.rolling ? ' rolling' : ''}">${cells}</div>`;
}
function posFor(i){
  if(i<=10) return {r:10, c:10-i};
  if(i<=20) return {r:20-i, c:0};
  if(i<=30) return {r:0, c:i-20};
  return {r:i-30, c:10};
}
function tileHTML(t,i){
  const {r,c} = posFor(i);
  const owner = game ? game.owner[i] : null;
  const bandText = t.type==='rail' ? '🚉' : t.type==='util' ? '💡' : '';
  let inner;
  if(['go','jail','parking','gotojail'].includes(t.type)){
    inner = `<div class="corner-icon">${t.icon}</div><div class="name">${t.name}</div>`;
  }else if(t.type==='tax'){
    inner = `<div class="band">🧾</div><div class="name">${t.name}</div><div class="price">ادفع ${t.amount}</div>`;
  }else if(t.type==='chest' || t.type==='chance'){
    inner = `<div class="band">${t.icon}</div><div class="name">${t.name}</div><div class="price">اسحب بطاقة</div>`;
  }else{
    const h = game ? game.houses[i] : 0;
    inner = `<div class="band">${bandText}</div><div class="name">${t.name}</div>` +
            `<div class="price">${money(t.price)} ج.م</div>` +
            (h ? `<div class="houses">${h===5 ? '🏨' : '🏠'.repeat(h)}</div>` : '') +
            (game && game.mortgaged[i] ? '<div class="mort">مرهون</div>' : '') +
            (owner!==null && game ? `<div class="owner-dot" style="background:${game.players[owner].color}"></div>` : '');
  }
  const tokens = game ? game.players.filter(p => !p.bankrupt && p.pos===i)
    .map(p => `<span class="token" style="background:${p.color}" title="${esc(p.name)}">${p.id+1}</span>`).join('') : '';
  return `<div class="tile ${t.type}" style="grid-row:${r+1};grid-column:${c+1};--band:${t.color||'transparent'}" title="${esc(t.name)}">` +
         inner + (tokens ? `<div class="tokens">${tokens}</div>` : '') + '</div>';
}
function boardHTML(){
  let html = `<div class="center">
    <div class="center-logo">مونوبولي</div>
    <div class="center-sub">MONOPOLY</div>
    <div class="center-turn">${game ? 'دور ' + esc(game.players[game.current].name) : 'أهلاً بك!'}</div>
    ${game && game.lastCard ? `<div class="center-card"><b>${game.lastCard.title}</b><br>${esc(game.lastCard.text)}</div>` : ''}
    <div class="center-bank">البنك · ${money(START_CASH)} ج.م لكل لاعب</div>
  </div>`;
  for(let i=0;i<TILES.length;i++) html += tileHTML(TILES[i],i);
  return html;
}
function setupHTML(){
  const saved = load();
  let rows = '';
  for(let i=0;i<setupCfg.count;i++){
    const c = setupCfg.players[i];
    rows += `<div class="setup-row">
      <span class="dot" style="background:${PCOLORS[i]}"></span>
      <input type="text" class="cfg-name" data-i="${i}" value="${esc(c.name)}" maxlength="18" aria-label="اسم اللاعب ${i+1}">
      <label><input type="checkbox" class="cfg-bot" data-i="${i}" ${c.bot?'checked':''}> كمبيوتر</label>
    </div>`;
  }
  return `<div class="card">
    <h2>إعداد لعبة جديدة</h2>
    <label class="field">عدد اللاعبين
      <select id="cfg-count">${[2,3,4].map(n => `<option value="${n}" ${setupCfg.count===n?'selected':''}>${n} لاعبين</option>`).join('')}</select>
    </label>
    ${rows}
    <button class="btn primary wide" data-act="start">ابدأ اللعبة 🎲</button>
    ${saved ? '<button class="btn wide" style="margin-top:8px" data-act="resume">متابعة اللعبة المحفوظة</button>' : ''}
    <p class="hint">العب بنظام تناوب الأدوار على نفس الجهاز، أو دع الكمبيوتر يلعب معك. تبدأ بـ ${money(START_CASH)} جنيه، واسمّي اللاعبين كما تحب.</p>
  </div>
  <div class="card">
    <h3>ما هي مونوبولي؟</h3>
    <p class="hint">رمي النرد، شراء الشوارع، تحصيل الإيجار، وبناء المنازل والفنادق. آخر لاعب يبقى بعد إفلاس الباقين هو الفائز. اضغط «طريقة اللعب» للتفاصيل.</p>
  </div>`;
}
function playersHTML(){
  return game.players.map(p => `<div class="player ${p.id===game.current?'active':''} ${p.bankrupt?'out':''}">
    <span class="pdot" style="background:${p.color}">${p.id+1}</span>
    <span class="pname">${esc(p.name)} <span class="pmeta">${p.bot?'🤖 كمبيوتر':'👤 إنسان'}${p.inJail?' · ⛓️ في السجن':''}${p.cards?' · 🎫 '+p.cards:''}</span></span>
    <span class="pcash">${money(p.cash)}</span>
  </div>`).join('');
}
function managementHTML(){
  const p = game.players[game.current];
  const can = !game.over && game.phase==='roll' && !p.bot;
  const mine = ownedBy(p.id);
  let html = `<div class="props-list">`;
  if(!mine.length) html += '<p class="hint">لا تملك عقارات بعد. اشترِ ما تقف عليه لبناء ثروتك.</p>';
  mine.forEach(i => {
    const t = TILES[i], h = game.houses[i] || 0;
    html += `<div class="prop-item">
      <span class="pband" style="background:${t.color||'#6b7a70'}"></span>
      <span class="pinfo"><b>${esc(t.name)}</b><span>${t.type==='prop' ? (h===5?'فندق 🏨':h?h+' منزل 🏠':'أرض') : (t.type==='rail'?'محطة':'مرفق')} · ${money(t.price)} ج.م ${game.mortgaged[i]?'· مرهون':''}</span></span>
      ${(t.type!=='prop' || !groupHasHouses(t.group)) ? `<button class="btn small" data-act="mortgage" data-idx="${i}" ${can?'':'disabled'}>${game.mortgaged[i]?'فك الرهن':'رهن'}</button>` : ''}
    </div>`;
  });
  html += '</div>';
  Object.keys(GROUPS).forEach(g => {
    if(!ownsGroup(p.id,g)) return;
    const cost = GROUPS[g].house;
    const hs = groupTiles(g).map(i => game.houses[i]);
    html += `<div class="group-actions">
      <b style="color:${GROUPS[g].color}">مجموعة ${GROUPS[g].label}</b>
      <span>${hs.reduce((a,b)=>a+b,0)} منزل</span>
      <button class="btn small" data-act="house" data-op="buy" data-group="${g}" ${can && p.cash>=cost && Math.min(...hs)<5?'':'disabled'}>+ منزل (${cost})</button>
      <button class="btn small" data-act="house" data-op="sell" data-group="${g}" ${can && Math.max(...hs)>0?'':'disabled'}>− منزل</button>
    </div>`;
  });
  html += `<p class="hint">${can?'يمكنك البناء أو الرهن الآن، قبل رمي النرد.':'إدارة العقارات متاحة في بداية دورك فقط.'}</p>`;
  return html;
}
function hudHTML(){
  const p = game.players[game.current];
  const canRoll = !game.over && game.phase==='roll' && !p.bot && !pending;
  let html = `<div class="card">
    <div class="turn-head"><span class="who" style="color:${p.color}">دور ${esc(p.name)}</span><span class="badge">الجولة ${game.turn}</span></div>
    <div class="dice-row">${dieHTML(game.dice[0])}${dieHTML(game.dice[1])}</div>
    <button class="btn primary wide" data-act="roll" ${canRoll?'':'disabled'}>${p.bot?'🤖 الكمبيوتر يلعب…':'🎲 رمي النرد'}</button>
    <div class="status">${esc(game.status)}</div>
  </div>`;
  if(pending){
    html += `<div class="card decision"><h3>${esc(pending.title)}</h3><div class="desc">${esc(pending.desc)}</div><div class="actions">` +
      pending.buttons.map(b => `<button class="btn ${b.primary?'primary':'small'}" data-act="choice" data-val="${b.key}" ${b.disabled?'disabled':''}>${esc(b.label)}</button>`).join('') +
      '</div></div>';
  }
  html += `<div class="card"><h3>اللاعبون</h3><div class="players">${playersHTML()}</div></div>`;
  html += `<div class="card"><h3>عقارات ${esc(p.name)} وإدارة المباني</h3>${managementHTML()}</div>`;
  html += `<div class="card"><h3>سجل الأحداث</h3><div class="log">${game.log.slice(0,12).map(m => `<div>${esc(m)}</div>`).join('')}</div></div>`;
  return html;
}
function overlayHTML(){
  if(overlayMode==='rules') return `<div class="modal"><h2>📖 طريقة اللعب</h2>
    <p>الهدف: أن تكون آخر لاعب يملك المال بعد إفلاس منافسيك. يبدأ كل لاعب بـ ${money(START_CASH)} جنيه على خانة البداية.</p>
    <h3>خلال دورك</h3>
    <ul>
      <li>ارمِ النرد وتحرّك بعدد الخانات؛ عند المرور على البداية اقبض 200 جنيه.</li>
      <li>إذا وقفت على عقار غير مملوك: اشترِه بالسعر المكتوب، أو اتركه للمزاد.</li>
      <li>إذا كان العقار مملوكًا لغيرك: ادفع الإيجار (يتضاعف عند امتلاك المجموعة كاملة بدون منازل).</li>
      <li>الدوبل يمنحك رمية إضافية، وثلاث دوبل متتالية ترسلك إلى السجن.</li>
      <li>بطاقات «الفرصة» و«صندوق المجتمع» قد تنقلك، تمنحك مالًا، أو تطلب منك الدفع.</li>
    </ul>
    <h3>البناء والرهن</h3>
    <ul>
      <li>عند امتلاك مجموعة لونية كاملة، ابنِ المنازل بالتساوي (حتى 4 منازل ثم فندق).</li>
      <li>بيع المنازل بنصف السعر، ورهن العقار للحصول على نصف قيمته؛ العقار المرهون لا يحصّل إيجارًا.</li>
      <li>إن لم تستطع الدفع، تُباع منازلك وتُرهن عقاراتك تلقائيًا، وإلا تُعلن إفلاسك.</li>
    </ul>
    <p class="hint">تُحفظ اللعبة تلقائيًا في المتصفح؛ يمكنك العودة ومتابعتها لاحقًا.</p>
    <button class="btn primary wide" data-act="close">حسنًا، لنلعب!</button></div>`;
  if(overlayMode==='over' && game){
    const w = game.players[game.winner];
    return `<div class="modal"><h2>🏆 انتهت اللعبة!</h2>
      <p style="font-size:18px">الفائز هو <b style="color:${w.color}">${esc(w.name)}</b> بثروة ${money(w.cash)} جنيه.</p>
      <p>أحسنت اللعب! هل تريد جولة جديدة؟</p>
      <button class="btn primary wide" data-act="new">لعبة جديدة</button>
      <button class="btn wide" style="margin-top:8px" data-act="close">إغلاق</button></div>`;
  }
  return '';
}
function render(){
  board.innerHTML = boardHTML();
  panel.innerHTML = game ? hudHTML() : setupHTML();
  const show = !!overlayMode;
  overlay.className = 'overlay' + (show ? '' : ' hidden');
  overlay.innerHTML = show ? overlayHTML() : '';
  save();
}

/* ---------- decisions ---------- */
async function decide(p, opts){
  if(p.bot){
    game.phase = 'busy'; render();
    await delay(600);
    return opts.botValue;
  }
  game.phase = 'decision';
  const value = await new Promise(resolve => { pending = {title:opts.title, desc:opts.desc, buttons:opts.buttons, resolve}; render(); });
  pending = null;
  game.phase = 'busy';
  render();
  return value;
}
async function doRoll(p, preset){
  if(preset) return preset;
  if(!p.bot){
    game.phase = 'roll'; render();
    await new Promise(resolve => { diceResolver = resolve; });
  }else{
    await delay(500);
  }
  game.phase = 'busy'; game.rolling = true; render();
  for(let k=0;k<6;k++){ game.dice = [rand(6), rand(6)]; render(); await delay(70); }
  const d = [rand(6), rand(6)];
  game.dice = d; game.rolling = false; render();
  await delay(180);
  return d;
}

/* ---------- money, bankruptcy ---------- */
async function bankrupt(p, creditorId){
  if(p.bankrupt) return;
  p.bankrupt = true;
  const creditor = creditorId!=null ? game.players[creditorId] : null;
  if(creditor && !creditor.bankrupt) creditor.cash += p.cash;
  p.cash = 0;
  for(let i=0;i<40;i++){
    if(game.owner[i]!==p.id) continue;
    if(creditor && !creditor.bankrupt){ game.owner[i] = creditor.id; }
    else { game.owner[i] = null; game.houses[i] = 0; delete game.mortgaged[i]; }
  }
  logMsg(`💥 ${p.name} أفلس وخرج من اللعبة`);
  const alive = game.players.filter(x => !x.bankrupt);
  if(alive.length===1){
    game.over = true; game.winner = alive[0].id;
    logMsg(`🏆 ${alive[0].name} فاز باللعبة!`);
    overlayMode = 'over'; render();
  }
}
async function ensureCash(p, amount, creditorId){
  if(p.cash >= amount) return true;
  let guard = 0;
  while(p.cash < amount && guard++ < 200){
    const mine = ownedBy(p.id);
    const withHouses = mine.filter(i => game.houses[i]>0).sort((a,b) => game.houses[b]-game.houses[a]);
    if(withHouses.length){
      const i = withHouses[0], g = TILES[i].group;
      game.houses[i]--; p.cash += Math.floor(GROUPS[g].house/2);
      logMsg(`${p.name} باع منزلًا في ${TILES[i].name} مقابل ${money(Math.floor(GROUPS[g].house/2))}`);
      continue;
    }
    const i = mine.find(x => !game.mortgaged[x] && (TILES[x].type!=='prop' || !groupHasHouses(TILES[x].group)));
    if(i!==undefined){
      game.mortgaged[i] = true; p.cash += Math.floor(TILES[i].price/2);
      logMsg(`${p.name} رهن ${TILES[i].name} مقابل ${money(Math.floor(TILES[i].price/2))}`);
      continue;
    }
    break;
  }
  if(p.cash < amount){ await bankrupt(p, creditorId); return false; }
  render();
  return true;
}
async function pay(p, amount, creditorId){
  if(amount<=0 || p.bankrupt) return true;
  if(!(await ensureCash(p, amount, creditorId))) return false;
  p.cash -= amount;
  if(creditorId!=null && game.players[creditorId] && !game.players[creditorId].bankrupt) game.players[creditorId].cash += amount;
  render();
  return true;
}

/* ---------- movement & landing ---------- */
async function stepForward(p){
  p.pos = (p.pos+1) % 40;
  if(p.pos===0){ p.cash += 200; logMsg(`${p.name} مرّ على البداية وقبض 200 جنيه`); }
  else render();
  await delay(85);
}
async function moveBy(p, steps){ for(let s=0;s<steps;s++) await stepForward(p); }
async function moveTo(p, target){
  let guard=0;
  while(p.pos!==target && guard++<45) await stepForward(p);
}
async function moveBack(p, steps){
  for(let s=0;s<steps;s++){ p.pos = (p.pos+39) % 40; render(); await delay(100); }
}
function goToJail(p){
  p.pos = 10; p.inJail = true; p.jailTurns = 0;
  logMsg(`👮 ${p.name} ذهب إلى السجن`);
}
async function offerBuy(p, idx){
  const t = TILES[idx], price = t.price;
  const botWants = p.cash >= price + 120 && Math.random() < 0.85;
  const choice = await decide(p, {
    title:`هل تشتري ${t.name}؟`,
    desc:`السعر ${money(price)} جنيه · رصيدك ${money(p.cash)} جنيه · ${t.type==='prop'?'الإيجار الأساسي '+money(t.rent[0])+' جنيه':t.type==='rail'?'إيجار المحطات 25 → 200 جنيه':'إيجار المرافق حسب النرد'}.`,
    buttons:[
      {key:'buy', label:'شراء', primary:true, disabled:p.cash<price},
      {key:'pass', label:'مزاد'}
    ],
    botValue: botWants ? 'buy' : 'pass'
  });
  if(choice==='buy' && p.cash>=price){
    p.cash -= price; game.owner[idx] = p.id;
    logMsg(`🏠 ${p.name} اشترى ${t.name} مقابل ${money(price)}`);
    render();
  }else{
    await auction(idx);
  }
}
async function auction(idx){
  const t = TILES[idx];
  let bid = Math.ceil(t.price/2), leader = null;
  const passed = new Set();
  const order = game.players.filter(p => !p.bankrupt).map(p => p.id);
  let guard = 0;
  while(guard++ < 40){
    const contenders = order.filter(id => id!==leader && !passed.has(id) && game.players[id].cash > bid+10);
    if(!contenders.length) break;
    for(const id of contenders){
      if(passed.has(id) || id===leader || game.over) break;
      const p = game.players[id], nextBid = bid+10;
      const botBid = p.cash > nextBid+100 && nextBid <= t.price*1.35 && Math.random()<0.55;
      const choice = await decide(p, {
        title:`مزاد على ${t.name}`,
        desc:`أعلى مزايدة: ${money(bid)} جنيه${leader!==null?' بواسطة '+game.players[leader].name:''}. عرضك التالي ${money(nextBid)} جنيه.`,
        buttons:[{key:'bid', label:`زايد ${money(nextBid)}`, primary:true, disabled:p.cash<=nextBid},{key:'pass', label:'انسحاب'}],
        botValue: botBid ? 'bid' : 'pass'
      });
      if(choice==='bid' && p.cash>nextBid){ bid = nextBid; leader = id; logMsg(`${p.name} زايد ${money(bid)} على ${t.name}`); }
      else passed.add(id);
    }
    if(!order.some(id => id!==leader && !passed.has(id) && game.players[id].cash > bid+10)) break;
  }
  if(leader!==null){
    const p = game.players[leader];
    p.cash -= bid; game.owner[idx] = p.id;
    logMsg(`🔨 ${p.name} فاز بالمزاد على ${t.name} مقابل ${money(bid)}`);
  }else{
    logMsg(`المزاد على ${t.name} انتهى بدون مشترٍ`);
  }
  render();
}
async function drawCard(p, deckType, roll){
  const deck = deckType==='chance' ? CHANCE : COMMUNITY;
  const c = deck[Math.floor(Math.random()*deck.length)];
  game.lastCard = {title: deckType==='chance'?'بطاقة فرصة':'صندوق المجتمع', text:c.t};
  logMsg(`🃏 ${p.name}: ${c.t}`);
  await delay(p.bot ? 450 : 750);
  if(game.over) return;
  switch(c.a){
    case 'cash': p.cash += c.v; logMsg(`${p.name} قبض ${money(c.v)} جنيه`); render(); break;
    case 'pay': await pay(p, c.v, null); break;
    case 'card': p.cards++; render(); break;
    case 'jail': goToJail(p); break;
    case 'collect': {
      for(const other of game.players){
        if(other.id!==p.id && !other.bankrupt && !game.over) await pay(other, c.v, p.id);
      }
      break;
    }
    case 'repair': {
      let cost = 0;
      ownedBy(p.id).forEach(i => { const h = game.houses[i]; cost += h===5 ? 100 : h*25; });
      if(cost) await pay(p, cost, null);
      break;
    }
    case 'goto':
      await moveTo(p, c.to);
      if(!game.over && !p.bankrupt && !p.inJail) await resolveLanding(p, roll, 1);
      break;
    case 'back':
      await moveBack(p, c.v);
      if(!game.over && !p.bankrupt && !p.inJail) await resolveLanding(p, roll, 1);
      break;
    case 'nearest': {
      let target = -1;
      for(let k=1;k<=40;k++){
        const i = (p.pos+k)%40;
        if(TILES[i].type===c.kind){ target=i; break; }
      }
      if(target>=0){
        await moveTo(p, target);
        const flatRent = c.kind==='util' ? roll*c.mult : null;
        if(!game.over && !p.bankrupt && !p.inJail) await resolveLanding(p, roll, c.kind==='util' ? 1 : c.mult, flatRent);
      }
      break;
    }
  }
}
async function resolveLanding(p, roll, mult, flatRent){
  if(game.over || p.bankrupt) return;
  const idx = p.pos, t = TILES[idx];
  if(t.type==='go' || t.type==='parking' || t.type==='jail'){
    logMsg(`${p.name} وصل إلى ${t.name}`);
    return;
  }
  if(t.type==='tax'){ logMsg(`🧾 ${p.name} دفع ${t.amount} جنيه ${t.name}`); await pay(p, t.amount, null); return; }
  if(t.type==='gotojail'){ goToJail(p); return; }
  if(t.type==='chest' || t.type==='chance'){ await drawCard(p, t.type, roll); return; }
  const owner = game.owner[idx];
  if(owner===null){ await offerBuy(p, idx); return; }
  if(owner===p.id){ logMsg(`${p.name} في عقاره ${t.name}`); return; }
  if(game.mortgaged[idx]){ logMsg(`${t.name} مرهون حاليًا، لا يُدفع إيجار`); return; }
  const rent = flatRent != null ? flatRent : rentFor(idx, roll, mult);
  const o = game.players[owner];
  logMsg(`💸 ${p.name} دفع ${money(rent)} جنيه إيجارًا لـ ${o.name} عن ${t.name}`);
  await pay(p, rent, owner);
}

/* ---------- turn engine ---------- */
async function handleJail(p){
  const botValue = p.cards>0 ? 'card' : (p.cash>600 ? 'pay' : 'roll');
  const choice = await decide(p, {
    title:`${p.name} في السجن ⛓️`,
    desc:'ادفع 50 جنيه، أو استخدم بطاقة خروج، أو ارمِ النرد واخرج عند الحصول على دوبل. بعد ثلاث محاولات تُجبر على الدفع.',
    buttons:[
      {key:'pay', label:'ادفع 50 جنيه', primary:true, disabled:p.cash<50},
      {key:'card', label:'بطاقة خروج 🎫', disabled:p.cards<1},
      {key:'roll', label:'حاول بالدوبل 🎲'}
    ],
    botValue
  });
  if(choice==='card'){ p.cards--; p.inJail=false; p.jailTurns=0; logMsg(`${p.name} استخدم بطاقة خروج من السجن`); return {freed:true}; }
  if(choice==='pay'){ p.cash -= 50; p.inJail=false; p.jailTurns=0; logMsg(`${p.name} دفع 50 جنيه وخرج من السجن`); render(); return {freed:true}; }
  const d = await doRoll(p);
  logMsg(`${p.name} رمى ${d[0]} + ${d[1]} في السجن`);
  if(d[0]===d[1]){ p.inJail=false; p.jailTurns=0; logMsg('🎉 دوبل! خرج من السجن'); render(); return {freed:true, roll:d}; }
  p.jailTurns++;
  if(p.jailTurns>=3){
    if(!(await ensureCash(p,50,null))) return {freed:false};
    p.cash -= 50; p.inJail=false; p.jailTurns=0;
    logMsg(`${p.name} دفع 50 جنيه بعد 3 محاولات وخرج من السجن`);
    render();
    return {freed:true, roll:d};
  }
  logMsg(`${p.name} بقي في السجن (المحاولة ${p.jailTurns}/3)`);
  return {freed:false};
}
async function botManage(p){
  let guard = 0;
  while(!game.over && !p.bankrupt && guard++ < 8){
    // فكّ الرهن عندما يسمح الرصيد
    const mortgaged = ownedBy(p.id).filter(i => game.mortgaged[i] && p.cash > TILES[i].price);
    if(mortgaged.length){
      const i = mortgaged[0], cost = Math.ceil(TILES[i].price/2*1.1);
      p.cash -= cost; delete game.mortgaged[i];
      logMsg(`🤖 ${p.name} فكّ رهن ${TILES[i].name}`);
      render();
      continue;
    }
    let built = false;
    for(const g of Object.keys(GROUPS)){
      const idxs = groupTiles(g);
      if(!idxs.every(i => game.owner[i]===p.id) || idxs.some(i => game.mortgaged[i])) continue;
      const cost = GROUPS[g].house, min = Math.min(...idxs.map(i => game.houses[i]));
      if(min < 5 && p.cash > cost + 180){
        const target = idxs.find(i => game.houses[i]===min);
        p.cash -= cost; game.houses[target]++;
        logMsg(`🏗️ ${p.name} بنى ${game.houses[target]===5?'فندقًا':'منزلًا'} في ${TILES[target].name}`);
        render();
        built = true;
        break;
      }
    }
    if(!built) break;
  }
}
async function playTurn(){
  const p = game.players[game.current];
  if(p.bankrupt || game.over) return;
  if(p.bot) await botManage(p);
  let preset = null;
  if(p.inJail){
    const j = await handleJail(p);
    if(!j.freed || game.over || p.bankrupt){ if(!game.over) nextPlayer(); return; }
    preset = j.roll || null;
  }
  let doubles = 0, again = true;
  let skipExtra = !!preset; // الخروج من السجن بالدوبل لا يمنح رمية إضافية
  while(again && !game.over && !p.bankrupt){
    again = false;
    const d = await doRoll(p, preset); preset = null;
    logMsg(`🎲 ${p.name} رمى ${d[0]} + ${d[1]} = ${d[0]+d[1]}`);
    doubles = d[0]===d[1] ? doubles+1 : 0;
    if(doubles===3){ logMsg('ثلاث مرات دوبل متتالية!'); goToJail(p); break; }
    await moveBy(p, d[0]+d[1]);
    await resolveLanding(p, d[0]+d[1], 1);
    if(game.over || p.bankrupt || p.inJail) break;
    if(d[0]===d[1] && !skipExtra){ again = true; logMsg(`✨ ${p.name} حصل على دوبل ويلعب مرة أخرى`); }
    skipExtra = false;
  }
  if(!game.over) nextPlayer();
}
function nextPlayer(){
  const n = game.players.length;
  let i = game.current;
  for(let k=1;k<=n;k++){
    const j = (i+k)%n;
    if(!game.players[j].bankrupt){ game.current = j; break; }
  }
  game.turn++;
  game.phase = 'roll';
  game.lastCard = null;
  render();
  loopTurn();
}
function loopTurn(){
  if(!game || game.over) return;
  if(game.players[game.current].bankrupt){ nextPlayer(); return; }
  playTurn().catch(err => { console.error(err); logMsg('حدث خطأ: ' + err.message); });
}
function startGame(){
  game = newState();
  pending = null; diceResolver = null; overlayMode = null;
  logMsg('🎉 بدأت اللعبة! بالتوفيق لجميع اللاعبين');
  loopTurn();
}
function resumeGame(){
  const s = load();
  if(!s || !s.players || !s.owner) return;
  game = s;
  game.phase = 'roll'; game.rolling = false; game.over = !!game.over;
  pending = null; diceResolver = null;
  overlayMode = game.over ? 'over' : null;
  logMsg('▶️ تمت متابعة اللعبة المحفوظة');
  if(!game.over) loopTurn();
}

/* ---------- management ---------- */
function handleManagement(btn){
  if(!game || game.over || game.phase!=='roll' || pending) return;
  const p = game.players[game.current];
  if(p.bot) return;
  if(btn.dataset.act==='house'){
    const g = btn.dataset.group, op = btn.dataset.op;
    const idxs = groupTiles(g);
    if(!idxs.every(i => game.owner[i]===p.id) || idxs.some(i => game.mortgaged[i])) return;
    const hs = idxs.map(i => game.houses[i]);
    const cost = GROUPS[g].house;
    if(op==='buy'){
      const min = Math.min(...hs);
      if(min>=5 || p.cash<cost) return;
      const target = idxs.find(i => game.houses[i]===min);
      p.cash -= cost; game.houses[target]++;
      logMsg(`🏗️ ${p.name} بنى منزلًا في ${TILES[target].name} مقابل ${money(cost)}`);
    }else{
      const max = Math.max(...hs);
      if(max<=0) return;
      const target = idxs.find(i => game.houses[i]===max);
      game.houses[target]--; p.cash += Math.floor(cost/2);
      logMsg(`${p.name} باع منزلًا في ${TILES[target].name}`);
    }
    render();
  }else if(btn.dataset.act==='mortgage'){
    const i = Number(btn.dataset.idx);
    if(game.owner[i]!==p.id || game.houses[i]>0) return;
    if(TILES[i].type==='prop' && groupHasHouses(TILES[i].group)) return;
    if(game.mortgaged[i]){
      const cost = Math.ceil(TILES[i].price/2*1.1);
      if(p.cash<cost) return;
      p.cash -= cost; delete game.mortgaged[i];
      logMsg(`${p.name} فكّ رهن ${TILES[i].name} مقابل ${money(cost)}`);
    }else{
      game.mortgaged[i] = true; p.cash += Math.floor(TILES[i].price/2);
      logMsg(`${p.name} رهن ${TILES[i].name} مقابل ${money(Math.floor(TILES[i].price/2))}`);
    }
    render();
  }
}

/* ---------- events ---------- */
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if(!b || b.disabled) return;
  const a = b.dataset.act;
  if(a==='roll'){
    if(diceResolver){ const r = diceResolver; diceResolver = null; r(); }
  }else if(a==='choice'){
    if(pending){ const r = pending.resolve; r(b.dataset.val); }
  }else if(a==='start'){ startGame(); }
  else if(a==='resume'){ resumeGame(); }
  else if(a==='new'){
    game = null; pending = null; diceResolver = null; overlayMode = null;
    try{ localStorage.removeItem(SAVE_KEY); }catch(err){}
    render();
  }
  else if(a==='rules'){ overlayMode = 'rules'; render(); }
  else if(a==='close'){ overlayMode = null; render(); }
  else if(a==='house' || a==='mortgage'){ handleManagement(b); }
});
document.addEventListener('change', e => {
  const t = e.target;
  if(t.id==='cfg-count'){ setupCfg.count = Number(t.value); render(); }
  else if(t.classList.contains('cfg-bot')){ setupCfg.players[Number(t.dataset.i)].bot = t.checked; render(); }
});
document.addEventListener('input', e => {
  if(e.target.classList.contains('cfg-name')) setupCfg.players[Number(e.target.dataset.i)].name = e.target.value;
});

render();
})();
