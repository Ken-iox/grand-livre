// © 2026 Ken-iox — Tous droits réservés. Voir LICENSE. Toute réutilisation est interdite sans autorisation écrite.
import { db, seedIfEmpty } from './db.js';

/* ============ STATE ============ */
var S = {
  categories: [], fixedCharges: [], transactions: [], patrimoineAccounts: [], sinkingFunds: [],
  thresholds: {}, automations: {}, calStartBalance: 1200, loan: {}, monthlyHistory: {}, chargePayments: {},
  categoryRules: [], dismissedSuggestions: []
};
var selectedMonth = null; // 'YYYY-MM', dashboard + saisie filter
var CURRENT_MONTH = monthKey(new Date());
var CURRENT_YEAR = String(new Date().getFullYear());

var MONTH_NAMES = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];

function monthKey(d){ return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0'); }
function monthLabel(mk){ var p = mk.split('-'); return MONTH_NAMES[parseInt(p[1],10)-1] + ' ' + p[0]; }
function daysInMonth(mk){ var p = mk.split('-'); return new Date(parseInt(p[0],10), parseInt(p[1],10), 0).getDate(); }
function eur(n){ n = n || 0; return n.toLocaleString('fr-FR', {minimumFractionDigits:2, maximumFractionDigits:2}) + ' €'; }
function pct(n){ return (n||0).toFixed(1).replace('.',',') + ' %'; }
function fmtDateFR(iso){ var p = iso.split('-'); return p[2]+'/'+p[1]+'/'+p[0]; }
function cssVar(name){ return getComputedStyle(document.documentElement).getPropertyValue('--'+name).trim(); }

/* ============ MODAL / TOAST (remplacent prompt/confirm) ============ */
function openModal(opts){
  // opts: {title, fields:[{key,label,type,value,options,step}], submitLabel, danger, onSubmit(values), onCancel}
  return new Promise(function(resolve){
    var root = document.getElementById('modal-root');
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    var fieldsHtml = (opts.fields||[]).map(function(f){
      if(f.type === 'select'){
        return '<div class="modal-field"><label>'+f.label+'</label><select data-mf="'+f.key+'">'+
          f.options.map(function(o){ return '<option value="'+o.value+'"'+(o.value===f.value?' selected':'')+'>'+o.label+'</option>'; }).join('')+
          '</select></div>';
      }
      var type = f.type || 'text';
      var step = type==='number' ? ' step="'+(f.step||'0.01')+'"' : '';
      var val = f.value != null ? f.value : '';
      return '<div class="modal-field"><label>'+f.label+'</label><input data-mf="'+f.key+'" type="'+type+'"'+step+' value="'+String(val).replace(/"/g,'&quot;')+'"></div>';
    }).join('');
    overlay.innerHTML =
      '<div class="modal-card" role="dialog" aria-modal="true">'+
        '<h2>'+opts.title+'</h2>'+
        '<div>'+fieldsHtml+'</div>'+
        '<div class="modal-actions">'+
          '<button type="button" class="btn-secondary" data-m="cancel">Annuler</button>'+
          '<button type="button" class="'+(opts.danger?'btn-danger':'btn-primary')+'" data-m="submit">'+(opts.submitLabel||'Valider')+'</button>'+
        '</div>'+
      '</div>';
    root.appendChild(overlay);
    var firstInput = overlay.querySelector('[data-mf]');
    if(firstInput) firstInput.focus();
    function close(result){
      root.removeChild(overlay);
      document.removeEventListener('keydown', onKey);
      resolve(result);
    }
    function collect(){
      var out = {};
      overlay.querySelectorAll('[data-mf]').forEach(function(el){
        out[el.dataset.mf] = el.tagName==='SELECT' ? el.value : (el.type==='number' ? parseFloat(el.value) : el.value);
      });
      return out;
    }
    function onKey(e){
      if(e.key === 'Escape') close(null);
      if(e.key === 'Enter' && e.target.tagName !== 'TEXTAREA'){ e.preventDefault(); close(collect()); }
    }
    overlay.addEventListener('click', function(e){ if(e.target === overlay) close(null); });
    overlay.querySelector('[data-m="cancel"]').addEventListener('click', function(){ close(null); });
    overlay.querySelector('[data-m="submit"]').addEventListener('click', function(){ close(collect()); });
    document.addEventListener('keydown', onKey);
  });
}
function confirmModal(title, desc, opts){
  opts = opts || {};
  return new Promise(function(resolve){
    var root = document.getElementById('modal-root');
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML =
      '<div class="modal-card" role="dialog" aria-modal="true">'+
        '<h2>'+title+'</h2>'+
        (desc ? '<div style="font-size:12.5px; color:var(--ink-soft); margin-bottom:6px;">'+desc+'</div>' : '')+
        '<div class="modal-actions">'+
          '<button type="button" class="btn-secondary" data-m="cancel">'+(opts.cancelLabel||'Annuler')+'</button>'+
          '<button type="button" class="'+(opts.danger?'btn-danger':'btn-primary')+'" data-m="submit">'+(opts.okLabel||'Confirmer')+'</button>'+
        '</div>'+
      '</div>';
    root.appendChild(overlay);
    function close(result){ root.removeChild(overlay); resolve(result); }
    overlay.addEventListener('click', function(e){ if(e.target === overlay) close(false); });
    overlay.querySelector('[data-m="cancel"]').addEventListener('click', function(){ close(false); });
    overlay.querySelector('[data-m="submit"]').addEventListener('click', function(){ close(true); });
  });
}
function showToast(message, opts){
  opts = opts || {};
  var stack = document.getElementById('toast-stack');
  var el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = '<span>'+message+'</span>' + (opts.actionLabel ? '<button type="button">'+opts.actionLabel+'</button>' : '');
  stack.appendChild(el);
  var timer = setTimeout(remove, opts.duration || 5000);
  function remove(){ clearTimeout(timer); if(el.parentNode) stack.removeChild(el); }
  if(opts.actionLabel){
    el.querySelector('button').addEventListener('click', function(){ remove(); if(opts.onAction) opts.onAction(); });
  }
  return remove;
}
function deleteWithUndo(store, obj, arrayRef, label, afterFn){
  var idx = arrayRef.indexOf(obj);
  if(idx >= 0) arrayRef.splice(idx, 1);
  db.delete(store, obj.id).then(afterFn);
  showToast('Supprimé : '+label, {
    actionLabel:'Annuler',
    onAction:function(){
      var toAdd = Object.assign({}, obj); delete toAdd.id;
      db.add(store, toAdd).then(function(saved){ arrayRef.push(saved); afterFn(); });
    }
  });
}

/* ============ BOOT ============ */
seedIfEmpty().then(loadAll).then(function(){
  selectedMonth = CURRENT_MONTH;
  wireNav(); wireTheme(); wireSheet();
  wireSaisie(); wireSaisieTools(); wireCalendrier(); wireBudgets(); wirePatrimoine(); wireParametres(); wireFab();
  renderAll();

  var action = new URLSearchParams(window.location.search).get('action');
  if(action === 'add'){ setView('saisie'); setTimeout(function(){ document.getElementById('qa-amt').focus(); }, 150); }
  else if(action === 'scan'){ setView('saisie'); setTimeout(function(){ document.getElementById('scan-file-input').click(); }, 150); }
});

function loadAll(){
  return Promise.all([
    db.getAll('categories'), db.getAll('fixedCharges'), db.getAll('transactions'),
    db.getAll('patrimoineAccounts'), db.getAll('sinkingFunds'),
    db.get('settings','thresholds'), db.get('settings','automations'),
    db.get('settings','calStartBalance'), db.get('settings','loan'), db.get('settings','monthlyHistory'),
    db.get('settings','chargePayments'), db.get('settings','categoryRules'), db.get('settings','dismissedSuggestions')
  ]).then(function(r){
    S.categories = r[0]; S.fixedCharges = r[1]; S.transactions = r[2];
    S.patrimoineAccounts = r[3]; S.sinkingFunds = r[4];
    S.thresholds = (r[5]&&r[5].value) || {}; S.automations = (r[6]&&r[6].value) || {};
    S.calStartBalance = (r[7]&&r[7].value) != null ? r[7].value : 1200;
    S.loan = (r[8]&&r[8].value) || {}; S.monthlyHistory = (r[9]&&r[9].value) || {};
    S.chargePayments = (r[10]&&r[10].value) || {};
    S.categoryRules = (r[11]&&r[11].value) || []; S.dismissedSuggestions = (r[12]&&r[12].value) || [];
  });
}

function renderAll(){
  renderMonthSelects();
  renderDashboard();
  renderAlerts();
  renderSuggestions();
  renderSaisie();
  renderCalendrier();
  renderBudgets();
  renderAbonnements();
  renderPatrimoine();
  renderAnnuel();
  renderAutomations();
  renderParametres();
}

/* ============ NAV / ROUTER ============ */
function wireNav(){
  var btns = document.querySelectorAll('.nav-btn, .sheet-item');
  btns.forEach(function(b){
    if(!b.dataset.view) return;
    b.addEventListener('click', function(){ setView(b.dataset.view); });
  });
  document.querySelectorAll('[data-goto]').forEach(function(b){
    b.addEventListener('click', function(){ setView(b.dataset.goto); });
  });
}
function setView(name){
  document.querySelectorAll('.view').forEach(function(v){ v.classList.toggle('active', v.id === 'view-'+name); });
  document.querySelectorAll('.nav-btn, .sheet-item').forEach(function(b){ b.classList.toggle('active', b.dataset.view === name); });
  window.scrollTo({top:0});
  closeSheet();
  var fab = document.getElementById('fab-add');
  if(fab) fab.classList.toggle('hidden', name === 'saisie');
}
function wireFab(){
  document.getElementById('fab-add').addEventListener('click', function(){
    setView('saisie');
    setTimeout(function(){ document.getElementById('qa-amt').focus(); }, 120);
  });
}
var sheetEl, overlayEl;
function wireSheet(){
  sheetEl = document.getElementById('more-sheet');
  overlayEl = document.getElementById('sheet-overlay');
  document.getElementById('more-btn').addEventListener('click', function(){ sheetEl.classList.add('open'); overlayEl.classList.add('open'); });
  overlayEl.addEventListener('click', closeSheet);
}
function closeSheet(){ if(sheetEl){ sheetEl.classList.remove('open'); overlayEl.classList.remove('open'); } }

function wireTheme(){
  var root = document.documentElement, label = document.getElementById('theme-label');
  var states = ['system','light','dark'], names = {system:'Système', light:'Clair', dark:'Sombre'};
  var cur = 'system';
  try { cur = localStorage.getItem('gl-theme') || 'system'; } catch(e){}
  function apply(t){
    if(t === 'system') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', t);
    label.textContent = names[t];
    try { localStorage.setItem('gl-theme', t); } catch(e){}
  }
  apply(cur);
  document.getElementById('theme-toggle').addEventListener('click', function(){
    cur = states[(states.indexOf(cur)+1) % states.length]; apply(cur);
  });
}

/* ============ DERIVED DATA ============ */
function txForMonth(mk){ return S.transactions.filter(function(t){ return t.date.indexOf(mk) === 0 && !t.needsReview; }); }
function fixedTotal(){ return S.fixedCharges.reduce(function(a,c){ return a+c.amount; }, 0); }
function variableBudgetTotal(){ return S.categories.reduce(function(a,c){ return a+c.monthlyBudget; }, 0); }

function monthAggregate(mk){
  var txs = txForMonth(mk);
  var hasLive = txs.length > 0;
  if(!hasLive){
    var h = S.monthlyHistory[mk];
    if(h) return {revenus:h.revenus, depenses:h.depenses, epargne:h.epargne, solde:h.solde, live:false};
    return null;
  }
  var revenus = 0, variableSpent = 0, epargne = 0;
  txs.forEach(function(t){
    if(t.type === 'revenu') revenus += t.amount;
    else if(t.type === 'variable') variableSpent += t.amount;
    else if(t.type === 'epargne') epargne += t.amount;
  });
  var depenses = fixedTotal() + variableSpent;
  var solde = revenus - depenses - epargne;
  return {revenus:revenus, depenses:depenses, epargne:epargne, solde:solde, variableSpent:variableSpent, live:true};
}

function diagnostics(mk){
  var agg = monthAggregate(mk) || {revenus:0, depenses:0, epargne:0, solde:0, variableSpent:0};
  var th = S.thresholds;
  var fixed = fixedTotal();
  var variableSpent = agg.variableSpent != null ? agg.variableSpent : Math.max(0, agg.depenses - fixed);
  var savingsPct = agg.revenus > 0 ? (agg.epargne/agg.revenus*100) : 0;
  var fixedPct = agg.revenus > 0 ? (fixed/agg.revenus*100) : 0;
  var variablePct = agg.revenus > 0 ? (variableSpent/agg.revenus*100) : 0;
  function tier(v, lo, hi, labels){
    if(v < lo) return {cls:'bad', label:labels[0]};
    if(v < hi) return {cls:'warn', label:labels[1]};
    return {cls:'good', label:labels[2]};
  }
  var savings = tier(savingsPct, th.savingsLow, th.savingsGood, ['À renforcer','Correct','Excellent']);
  var fixedD = fixedPct >= th.fixedMax ? {cls:'bad', label:'Élevées'} : (fixedPct >= th.fixedGood ? {cls:'warn', label:'Correct'} : {cls:'good', label:'Maîtrisées'});
  var variableD = variablePct >= th.variableMax ? {cls:'bad', label:'À surveiller'} : (variablePct >= th.variableGood ? {cls:'warn', label:'Correct'} : {cls:'good', label:'Maîtrisées'});
  var margin = agg.solde < 0 ? {cls:'bad', label:'Déficit'} : (agg.solde < th.comfortMargin ? {cls:'warn', label:'Serré'} : {cls:'good', label:'Confortable'});
  return {agg:agg, savingsPct:savingsPct, fixedPct:fixedPct, variablePct:variablePct, savings:savings, fixed:fixedD, variable:variableD, margin:margin, variableSpent:variableSpent};
}

function rolloverCarry(mk){
  if(!S.automations.rollover) return 0;
  var p = mk.split('-'); var d = new Date(parseInt(p[0],10), parseInt(p[1],10)-2, 1);
  var prevMk = monthKey(d);
  var prevAgg = monthAggregate(prevMk);
  if(!prevAgg) return 0;
  var prevSpent = prevAgg.variableSpent != null ? prevAgg.variableSpent : Math.max(0, prevAgg.depenses - fixedTotal());
  return Math.max(0, variableBudgetTotal() - prevSpent);
}

function categoryByName(name){ return S.categories.find(function(c){ return c.name === name; }); }

/* ============ MONTH SELECTS ============ */
function allKnownMonths(){
  var set = {};
  set[CURRENT_MONTH] = true;
  S.transactions.forEach(function(t){ set[t.date.slice(0,7)] = true; });
  Object.keys(S.monthlyHistory).forEach(function(k){ set[k] = true; });
  return Object.keys(set).sort().reverse();
}
function renderMonthSelects(){
  var months = allKnownMonths();
  var ms = document.getElementById('month-select');
  ms.innerHTML = months.map(function(m){ return '<option value="'+m+'"'+(m===selectedMonth?' selected':'')+'>'+monthLabel(m)+(m===CURRENT_MONTH?' (mois en cours)':'')+'</option>'; }).join('');
  ms.onchange = function(){ selectedMonth = ms.value; renderDashboard(); renderAlerts(); };

  var txm = document.getElementById('tx-month');
  var cur = txm.value || selectedMonth;
  txm.innerHTML = '<option value="all">Tous les mois</option>' + months.map(function(m){ return '<option value="'+m+'">'+monthLabel(m)+'</option>'; }).join('');
  txm.value = (cur === 'all' || months.indexOf(cur) >= 0) ? cur : selectedMonth;
}

/* ============ DASHBOARD ============ */
function renderDashboard(){
  document.getElementById('dashboard-hint').textContent = 'Tableau de bord de ' + monthLabel(selectedMonth) + '.';
  var agg = monthAggregate(selectedMonth);
  var pop = document.getElementById('dashboard-populated');
  var empty = document.getElementById('dashboard-empty');
  var hasAnyData = txForMonth(selectedMonth).length > 0 || (agg && !agg.live);
  if(!hasAnyData){
    pop.style.display = 'none'; empty.style.display = 'flex';
    return;
  }
  agg = agg || {revenus:0, depenses:fixedTotal(), epargne:0, solde:-fixedTotal(), variableSpent:0, live:true};
  pop.style.display = ''; empty.style.display = 'none';

  var d = diagnostics(selectedMonth);
  var carry = rolloverCarry(selectedMonth);
  var effectiveVarBudget = variableBudgetTotal() + carry;
  var resteVar = effectiveVarBudget - d.variableSpent;
  var isCurrent = selectedMonth === CURRENT_MONTH;
  var today = new Date();
  var remainingDays = isCurrent ? (daysInMonth(selectedMonth) - today.getDate() + 1) : daysInMonth(selectedMonth);
  var perDay = remainingDays > 0 ? resteVar/remainingDays : resteVar;

  var seriesRange = last6Months(selectedMonth);
  var revSeries = seriesRange.map(function(m){ var a = monthAggregate(m); return a ? a.revenus : 0; });
  var depSeries = seriesRange.map(function(m){ var a = monthAggregate(m); return a ? a.depenses : 0; });
  var eparSeries = seriesRange.map(function(m){ var a = monthAggregate(m); return a ? a.epargne : 0; });
  var soldeSeries = seriesRange.map(function(m){ var a = monthAggregate(m); return a ? a.solde : 0; });

  var chargesHtml = S.fixedCharges.map(function(c){
    var paid = !!((S.chargePayments[selectedMonth]||{})[c.id]);
    return '<div class="charge-row"><input type="checkbox" data-charge-id="'+c.id+'" '+(paid?'checked':'')+'>'+
      '<div class="charge-day">'+String(c.dueDay).padStart(2,'0')+'</div>'+
      '<div style="flex:1;"><div class="charge-name '+(paid?'paid':'')+'">'+c.icon+' '+c.name+'</div><div class="charge-tag">'+(c.group==='communes'?'Communes':'Personnelles')+'</div></div>'+
      '<div class="charge-amt tnum">'+eur(c.amount)+'</div></div>';
  }).join('');
  var paidCount = S.fixedCharges.filter(function(c){ return !!((S.chargePayments[selectedMonth]||{})[c.id]); }).length;

  var alerts = computeAlerts(selectedMonth).slice(0,2);
  var alertsHtml = alerts.length ? alerts.map(alertRowHtml).join('') : '<div style="font-size:11.5px; color:var(--ink-faint);">Rien à signaler ✓</div>';

  pop.innerHTML =
    '<div class="coach-line">'+humanSummary(d)+'</div>'+
    '<div class="card banner">'+
      '<div class="big stat"><div class="stat-label">Reste à vivre / jour</div><div class="stat-value tnum">'+animatedEur('reste-a-vivre', perDay)+'</div></div>'+
      '<div class="progress-block"><div class="progress-top"><span>Jour <b class="tnum">'+(isCurrent?today.getDate():daysInMonth(selectedMonth))+'</b> / '+daysInMonth(selectedMonth)+'</span><span><b class="tnum">'+eur(resteVar)+'</b> disponibles sur '+remainingDays+' jour'+(remainingDays>1?'s':'')+'</span></div>'+
      '<div class="bar-track"><div class="bar-fill" style="width:'+Math.max(0,Math.min(100, (daysInMonth(selectedMonth)-remainingDays)/daysInMonth(selectedMonth)*100))+'%; background:var(--accent);"></div></div></div>'+
    '</div>'+
    '<div class="grid cols-4">'+
      statCardHtml('Revenus', d.agg.revenus, revSeries, 'accent') +
      statCardHtml('Dépenses', d.agg.depenses, depSeries, 'bad') +
      statCardHtml('Épargne', d.agg.epargne, eparSeries, 'good') +
      statCardHtml('Solde restant', d.agg.solde, soldeSeries, d.margin.cls === 'good' ? 'good' : (d.margin.cls === 'warn' ? 'warn' : 'bad'), d.margin.label) +
    '</div>'+
    '<div class="section-title">Diagnostic du mois</div>'+
    '<div class="diag-row">'+
      diagChipHtml('Épargne', pct(d.savingsPct), d.savings) +
      diagChipHtml('Charges fixes', pct(d.fixedPct), d.fixed) +
      diagChipHtml('Dép. variables', pct(d.variablePct), d.variable) +
      diagChipHtml('Budget variable', eur(d.variableSpent)+' / '+eur(effectiveVarBudget), resteVar>=0?{cls:'good',label:'Sous budget'}:{cls:'bad',label:'Dépassé'}) +
    '</div>'+
    '<div class="grid cols-3" style="margin-top:18px;">'+
      '<div class="card"><div class="section-title" style="margin:0 0 8px;"><span>Charges fixes — '+monthLabel(selectedMonth)+'</span><span class="charge-counter">'+paidCount+'/'+S.fixedCharges.length+' prélevées</span></div>'+
      '<div class="charge-list" id="dash-charge-list">'+(chargesHtml || '<div style="font-size:12px;color:var(--ink-faint);">Aucune charge fixe. Ajoute-les dans Paramètres.</div>')+'</div></div>'+
      '<div class="card"><div class="section-title" style="margin:0 0 8px;">Alertes<button class="link" data-goto2="alertes">Tout voir</button></div>'+
      '<div class="alert-list">'+alertsHtml+'</div></div>'+
    '</div>';

  pop.querySelectorAll('[data-charge-id]').forEach(function(cb){
    cb.addEventListener('change', function(){
      var id = parseInt(cb.dataset.chargeId,10);
      S.chargePayments[selectedMonth] = S.chargePayments[selectedMonth] || {};
      S.chargePayments[selectedMonth][id] = cb.checked;
      persistChargePayments();
      renderDashboard();
    });
  });
  var gotoBtn = pop.querySelector('[data-goto2]');
  if(gotoBtn) gotoBtn.addEventListener('click', function(){ setView('alertes'); });
}

function persistChargePayments(){ db.put('settings', {key:'chargePayments', value:S.chargePayments}); }

function last6Months(endMk){
  var p = endMk.split('-'); var y = parseInt(p[0],10), m = parseInt(p[1],10);
  var arr = [];
  for(var i=5;i>=0;i--){ var d = new Date(y, m-1-i, 1); arr.push(monthKey(d)); }
  return arr;
}

function statCardHtml(label, value, series, colorVar, badge){
  return '<div class="card stat">'+
    '<div class="stat-label">'+label+'</div>'+
    '<div class="stat-value tnum">'+animatedEur('stat-'+label, value)+'</div>'+
    (badge ? '<span class="stat-delta '+(colorVar==='good'?'good':(colorVar==='warn'?'warn':'bad'))+'" style="position:absolute; top:12px; right:13px;">'+badge+'</span>' : '')+
    '<div class="stat-spark" data-series="'+series.join(',')+'" data-color="'+colorVar+'"></div>'+
  '</div>';
}
function diagChipHtml(name, val, tier){
  return '<div class="diag-chip"><div class="top"><span class="name">'+name+'</span><span class="pill '+tier.cls+'">'+tier.label+'</span></div>'+
    '<span class="val tnum">'+val+'</span><div class="bar-track"><div class="bar-fill" style="width:'+(tier.cls==='bad'?90:(tier.cls==='warn'?60:30))+'%; background:var(--'+tier.cls+');"></div></div></div>';
}

/* sparkline rendering (delegated, runs after any innerHTML set containing [data-series]) */
function paintSparklines(root){
  (root||document).querySelectorAll('[data-series]').forEach(function(el){
    var values = el.dataset.series.split(',').map(Number);
    var color = el.dataset.color;
    var w = el.clientWidth || 100, h = el.clientHeight || 28, pad = 3;
    var max = Math.max.apply(null, values.concat([0.01])), min = Math.min.apply(null, values.concat([0]));
    var range = (max-min) || 1;
    var step = (w-2*pad)/Math.max(1,values.length-1);
    var pts = values.map(function(v,i){ return [pad+i*step, h-pad-((v-min)/range)*(h-2*pad)]; });
    var c = cssVar(color) || cssVar('accent');
    var d = smoothPath(pts);
    var last = pts[pts.length-1];
    var areaD = d + ' L'+last[0].toFixed(1)+','+(h-pad)+' L'+pts[0][0].toFixed(1)+','+(h-pad)+' Z';
    el.innerHTML = '<svg viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="none">'+
      '<path d="'+areaD+'" fill="'+c+'" opacity="0.12" stroke="none"/>'+
      '<path d="'+d+'" fill="none" stroke="'+c+'" stroke-width="1.6" stroke-linecap="round"/>'+
      '<circle cx="'+last[0].toFixed(1)+'" cy="'+last[1].toFixed(1)+'" r="2.4" fill="'+c+'"/>'+
      '</svg>';
  });
}
function smoothPath(pts){
  var d = 'M'+pts[0][0].toFixed(1)+','+pts[0][1].toFixed(1);
  for(var i=1;i<pts.length;i++){
    var x0=pts[i-1][0], y0=pts[i-1][1], x1=pts[i][0], y1=pts[i][1], mx=(x0+x1)/2;
    d += ' C'+mx.toFixed(1)+','+y0.toFixed(1)+' '+mx.toFixed(1)+','+y1.toFixed(1)+' '+x1.toFixed(1)+','+y1.toFixed(1);
  }
  return d;
}
/* ============ ANIMATION DES CHIFFRES ============ */
var _numCache = {};
var _reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function animatedEur(key, value){
  return '<span data-anim-key="'+key+'" data-anim-to="'+value+'">'+eur(_numCache[key] != null ? _numCache[key] : value)+'</span>';
}
function playNumberAnimations(root){
  (root||document).querySelectorAll('[data-anim-key]').forEach(function(el){
    var key = el.dataset.animKey;
    var to = parseFloat(el.dataset.animTo);
    var from = _numCache[key] != null ? _numCache[key] : to;
    _numCache[key] = to;
    if(_reduceMotion || Math.abs(to-from) < 0.005){ el.textContent = eur(to); return; }
    var start = null, duration = 500;
    function step(ts){
      if(!start) start = ts;
      var p = Math.min(1, (ts-start)/duration);
      var eased = 1-Math.pow(1-p, 3);
      el.textContent = eur(from + (to-from)*eased);
      if(p < 1) requestAnimationFrame(step); else el.textContent = eur(to);
    }
    requestAnimationFrame(step);
  });
}

/* ============ TON HUMAIN — résumé du mois ============ */
function humanSummary(d){
  if(d.agg.solde < 0) return 'Ce mois est dans le rouge — regarde du côté des dépenses variables.';
  if(d.margin.cls === 'bad') return 'Ce mois est dans le rouge — regarde du côté des dépenses variables.';
  if(d.margin.cls === 'warn') return 'Ça passe, mais la marge est serrée jusqu’à la fin du mois.';
  if(d.savings.cls === 'good' && d.variable.cls === 'good') return 'Bien joué, tu es dans les clous ce mois-ci 👍';
  if(d.fixed.cls === 'bad') return 'Les charges fixes prennent une grosse part des revenus ce mois-ci.';
  if(d.variable.cls === 'bad') return 'Les dépenses variables débordent un peu — rien d’alarmant, à surveiller.';
  return 'Ça se passe plutôt bien ce mois-ci.';
}

// repaint sparklines after every render pass via MutationObserver-free simple hook
var _origRenderDashboard = renderDashboard;
renderDashboard = function(){
  _origRenderDashboard();
  var pop = document.getElementById('dashboard-populated');
  paintSparklines(pop);
  playNumberAnimations(pop);
};

/* ============ ALERTES ============ */
function computeAlerts(mk){
  var list = [];
  var d = diagnostics(mk);
  var A = S.automations;
  if(A.weeklyDigest && mk === CURRENT_MONTH && new Date().getDay() === 1){
    list.push({cls:'good', title:'Résumé de la semaine', desc:'Solde restant '+eur(d.agg.solde)+' · '+pct(d.variablePct)+' du budget variable utilisé.', meta:'Lundi'});
  }
  if(A.uncatDetect){
    S.transactions.filter(function(t){ return t.needsReview; }).forEach(function(t){
      list.push({cls:'bad', title:'Non catégorisé', desc:(t.note||t.category||'Transaction')+' · '+fmtDateFR(t.date), meta:eur(t.amount)});
    });
  }
  if(d.fixed.cls !== 'good') list.push({cls:d.fixed.cls, title:'Charges fixes '+d.fixed.label.toLowerCase(), desc:pct(d.fixedPct)+' des revenus (seuil max '+S.thresholds.fixedMax+' %).', meta:pct(d.fixedPct)});
  if(d.variable.cls !== 'good') list.push({cls:d.variable.cls, title:'Dépenses variables '+d.variable.label.toLowerCase(), desc:pct(d.variablePct)+' des revenus (seuil max '+S.thresholds.variableMax+' %).', meta:pct(d.variablePct)});
  if(d.margin.cls !== 'good') list.push({cls:d.margin.cls, title:'Marge '+d.margin.label.toLowerCase(), desc:'Solde restant sous le seuil confortable de '+eur(S.thresholds.comfortMargin)+'.', meta:eur(d.agg.solde)});
  if(A.overspendAlert){
    S.categories.forEach(function(c){
      var spent = txForMonth(mk).filter(function(t){ return t.type==='variable' && t.category===c.name; }).reduce(function(a,t){ return a+t.amount; },0);
      var pctVal = c.monthlyBudget > 0 ? (spent/c.monthlyBudget*100) : 0;
      if(pctVal >= 90) list.push({cls: pctVal>=100?'bad':'warn', title:'Catégorie proche du plafond', desc:c.icon+' '+c.name+' à '+Math.round(pctVal)+' % de son budget mensuel.', meta:Math.round(pctVal)+' %'});
    });
  }
  if(A.dueReminder){
    var today = new Date();
    if(mk === CURRENT_MONTH){
      S.fixedCharges.forEach(function(c){
        var paid = !!((S.chargePayments[mk]||{})[c.id]);
        if(paid) return;
        var due = new Date(today.getFullYear(), today.getMonth(), c.dueDay);
        var diffDays = Math.round((due - new Date(today.getFullYear(),today.getMonth(),today.getDate())) / 86400000);
        if(diffDays >= 0 && diffDays <= 3) list.push({cls:'warn', title:'Échéance dans '+diffDays+' jour'+(diffDays===1?'':'s'), desc:c.icon+' '+c.name+' — le '+String(c.dueDay).padStart(2,'0'), meta:eur(c.amount)});
      });
    }
  }
  if(d.savings.cls === 'good') list.push({cls:'good', title:'Taux d’épargne au-dessus du seuil', desc:pct(d.savingsPct)+' des revenus.', meta:pct(d.savingsPct)});
  return list;
}
function alertRowHtml(a){
  return '<div class="alert-item '+a.cls+'"><span class="ic">●</span><div class="alert-body"><div class="alert-title">'+a.title+'</div><div class="alert-desc">'+a.desc+'</div></div><div class="alert-meta">'+a.meta+'</div></div>';
}
function renderAlerts(){
  var alerts = computeAlerts(selectedMonth);
  var badCount = alerts.filter(function(a){ return a.cls==='bad' || a.cls==='warn'; }).length;
  var countEl = document.getElementById('alert-count');
  countEl.textContent = badCount; countEl.classList.toggle('zero', badCount===0);
  document.getElementById('alert-list-full').innerHTML = alerts.length ? alerts.map(alertRowHtml).join('') : '<div style="font-size:12.5px; color:var(--ink-faint);">Rien à signaler pour '+monthLabel(selectedMonth)+' ✓</div>';
}

/* ============ SUGGESTIONS — charges récurrentes détectées ============ */
function detectRecurringSuggestions(){
  var groups = {};
  S.transactions.filter(function(t){ return !t.needsReview && t.type==='variable'; }).forEach(function(t){
    var day = parseInt(t.date.slice(8,10),10);
    var bucket = Math.round(day/5)*5; // regroupe les jours proches (±~2)
    var amt = Math.round(t.amount);
    var key = t.category+'|'+amt+'|'+bucket;
    groups[key] = groups[key] || {category:t.category, amount:amt, bucket:bucket, months:{}};
    groups[key].months[t.date.slice(0,7)] = true;
  });
  var existingCharges = S.fixedCharges.map(function(c){ return c.name+'|'+Math.round(c.amount); });
  return Object.keys(groups).map(function(k){ return groups[k]; })
    .filter(function(g){ return Object.keys(g.months).length >= 2; })
    .filter(function(g){ return existingCharges.indexOf(g.category+'|'+g.amount) === -1; })
    .filter(function(g){ return S.dismissedSuggestions.indexOf(g.category+'|'+g.amount) === -1; });
}
function renderSuggestions(){
  var el = document.getElementById('suggest-list');
  if(!el) return;
  var suggestions = detectRecurringSuggestions();
  if(!suggestions.length){ el.innerHTML = ''; return; }
  el.innerHTML = suggestions.map(function(g, i){
    var cat = categoryByName(g.category);
    return '<div class="suggest-card"><span class="ic">💡</span><div class="body">'+(cat?cat.icon+' ':'')+g.category+' — '+eur(g.amount)+' revient chaque mois. L’ajouter comme charge fixe ?</div>'+
      '<button class="btn-secondary" type="button" data-dismiss-sugg="'+i+'" style="margin-right:6px;">Ignorer</button>'+
      '<button class="btn-primary" type="button" data-accept-sugg="'+i+'">Ajouter</button></div>';
  }).join('');
  el.querySelectorAll('[data-accept-sugg]').forEach(function(btn){
    btn.addEventListener('click', function(){
      var g = suggestions[parseInt(btn.dataset.acceptSugg,10)];
      var cat = categoryByName(g.category);
      openChargeModalPrefilled({name:g.category, icon:cat?cat.icon:'💳', amount:g.amount, dueDay:Math.max(1,g.bucket), group:'personnelles', isSubscription:false});
    });
  });
  el.querySelectorAll('[data-dismiss-sugg]').forEach(function(btn){
    btn.addEventListener('click', function(){
      var g = suggestions[parseInt(btn.dataset.dismissSugg,10)];
      S.dismissedSuggestions.push(g.category+'|'+g.amount);
      db.put('settings', {key:'dismissedSuggestions', value:S.dismissedSuggestions}).then(renderSuggestions);
    });
  });
}
function openChargeModalPrefilled(vals){
  openModal({
    title:'Ajouter comme charge fixe',
    fields:[
      {key:'name', label:'Nom', value:vals.name},
      {key:'icon', label:'Emoji', value:vals.icon},
      {key:'amount', label:'Montant mensuel (€)', type:'number', value:vals.amount},
      {key:'dueDay', label:'Jour de prélèvement (1-28)', type:'number', step:'1', value:vals.dueDay},
      {key:'group', label:'Groupe', type:'select', value:vals.group, options:[{value:'communes',label:'Communes'},{value:'personnelles',label:'Personnelles'}]},
      {key:'isSubscription', label:'Abonnement (oui/non)', type:'select', value:'non', options:[{value:'non',label:'Non'},{value:'oui',label:'Oui'}]}
    ]
  }).then(function(v){
    if(!v || !v.name) return;
    db.add('fixedCharges', {name:v.name, icon:v.icon||'💳', amount:v.amount||0, dueDay:Math.min(28,Math.max(1,parseInt(v.dueDay,10)||1)), group:v.group, isSubscription:v.isSubscription==='oui'}).then(function(c){
      S.fixedCharges.push(c);
      S.dismissedSuggestions.push(vals.name+'|'+Math.round(vals.amount));
      db.put('settings', {key:'dismissedSuggestions', value:S.dismissedSuggestions});
      renderParametres(); renderDashboard(); renderAbonnements(); renderCalendrier(); renderSuggestions();
      showToast('Charge fixe ajoutée.');
    });
  });
}

/* ============ SAISIE RAPIDE ============ */
function addTransaction(t){
  return db.add('transactions', t).then(function(saved){
    S.transactions.push(saved);
    renderMonthSelects(); renderDashboard(); renderAlerts(); renderSaisie(); renderBudgets(); renderAnnuel(); renderSuggestions();
    return saved;
  });
}
function findDuplicate(date, type, category, amount){
  return S.transactions.find(function(t){
    return !t.needsReview && t.date===date && t.type===type && t.category===category && Math.abs(t.amount-amount) < 0.005;
  });
}
function wireSaisie(){
  document.getElementById('qa-date').value = new Date().toISOString().slice(0,10);
  document.getElementById('quick-add-form').addEventListener('submit', function(e){
    e.preventDefault();
    var date = document.getElementById('qa-date').value;
    var category = document.getElementById('qa-cat').value;
    var type = document.getElementById('qa-type').value;
    var amount = parseFloat(document.getElementById('qa-amt').value);
    if(!date || !amount || amount <= 0) return;
    var dup = findDuplicate(date, type, category, amount);
    var proceed = dup
      ? confirmModal('Ça ressemble à un doublon', 'Une entrée identique ('+category+', '+eur(amount)+', '+fmtDateFR(date)+') existe déjà. Ajouter quand même ?', {okLabel:'Ajouter quand même'})
      : Promise.resolve(true);
    proceed.then(function(ok){
      if(!ok) return;
      addTransaction({date:date, type:type, category:category, amount:amount, needsReview:false}).then(function(){
        document.getElementById('qa-amt').value = '';
      });
    });
  });
  ['tx-search','tx-month','tx-type'].forEach(function(id){
    document.getElementById(id).addEventListener('input', renderSaisie);
    document.getElementById(id).addEventListener('change', renderSaisie);
  });
}
function renderQuickChips(){
  var since = new Date(); since.setDate(since.getDate()-60);
  var sinceStr = since.toISOString().slice(0,10);
  var counts = {};
  S.transactions.filter(function(t){ return !t.needsReview && t.type==='variable' && t.date >= sinceStr; })
    .forEach(function(t){ counts[t.category] = (counts[t.category]||0)+1; });
  var top = Object.keys(counts).sort(function(a,b){ return counts[b]-counts[a]; }).slice(0,6);
  var el = document.getElementById('quick-chips');
  if(!top.length){ el.innerHTML = ''; return; }
  el.innerHTML = top.map(function(name){
    var cat = categoryByName(name);
    return '<button type="button" class="quick-chip" data-chip="'+name+'">'+(cat?cat.icon+' ':'')+name+'</button>';
  }).join('');
  el.querySelectorAll('[data-chip]').forEach(function(btn){
    btn.addEventListener('click', function(){
      document.getElementById('qa-cat').value = btn.dataset.chip;
      document.getElementById('qa-type').value = 'variable';
      document.getElementById('qa-amt').focus();
      el.querySelectorAll('.quick-chip').forEach(function(c){ c.classList.remove('active'); });
      btn.classList.add('active');
    });
  });
}
function renderSaisie(){
  document.getElementById('qa-cat-list').innerHTML = S.categories.map(function(c){ return '<option value="'+c.name+'">'; }).join('');
  renderQuickChips();

  // swipe stack
  var review = S.transactions.filter(function(t){ return t.needsReview; });
  var stack = document.getElementById('swipe-stack');
  var emptyMsg = document.getElementById('swipe-empty');
  document.getElementById('swipe-section').style.display = review.length ? '' : 'none';
  if(review.length){
    stack.style.display = '';
    stack.innerHTML = review.map(function(t,i){
      var sugCat = categoryByName(t.suggestedCategory);
      var sugLabel = sugCat ? (sugCat.icon+' '+sugCat.name) : '✳️ Autre';
      return '<div class="swipe-card" style="z-index:'+(review.length-i)+';" data-tx-id="'+t.id+'">'+
        '<div class="swipe-bg left">↩ Plus tard</div><div class="swipe-bg right">✓ Accepter</div>'+
        '<div class="swipe-face"><div class="swipe-amt tnum">'+eur(t.amount)+'</div>'+
        '<div class="swipe-desc">'+(t.note||'')+' · '+fmtDateFR(t.date)+'</div>'+
        '<div class="swipe-suggest">Suggestion : <b>'+sugLabel+'</b></div></div></div>';
    }).join('');
    stack.querySelectorAll('.swipe-face').forEach(wireSwipe);
    emptyMsg.style.display = 'none';
  } else {
    stack.style.display = 'none'; emptyMsg.style.display = 'flex';
  }

  var q = document.getElementById('tx-search').value.trim().toLowerCase();
  var m = document.getElementById('tx-month').value;
  var t = document.getElementById('tx-type').value;
  var rows = S.transactions.filter(function(tx){ return !tx.needsReview; })
    .filter(function(tx){ return (m==='all' || tx.date.indexOf(m)===0) && (t==='all' || tx.type===t) && (!q || (tx.category||'').toLowerCase().indexOf(q)!==-1); })
    .sort(function(a,b){ return b.date.localeCompare(a.date) || b.id-a.id; });
  var body = document.getElementById('tx-body');
  var emptySt = document.getElementById('tx-empty');
  if(!rows.length){ body.innerHTML=''; emptySt.style.display='flex'; }
  else {
    emptySt.style.display='none';
    body.innerHTML = rows.map(function(tx){
      var cat = categoryByName(tx.category);
      var label;
      if(tx.type==='revenu') label = '💼 '+tx.category;
      else if(tx.type==='epargne') label = '🐷 '+tx.category;
      else label = cat ? (cat.icon+' '+cat.name) : tx.category;
      return '<tr><td>'+fmtDateFR(tx.date)+'</td><td><span class="cat-chip">'+label+'</span></td>'+
        '<td><span class="type-chip '+tx.type+'">'+({revenu:'Revenu',variable:'Variable',epargne:'Épargne'}[tx.type])+'</span></td>'+
        '<td class="amt tnum">'+eur(tx.amount)+'</td>'+
        '<td class="actions"><button class="icon-btn" data-del="'+tx.id+'" title="Supprimer">×</button></td></tr>';
    }).join('');
    body.querySelectorAll('[data-del]').forEach(function(btn){
      btn.addEventListener('click', function(){
        var id = parseInt(btn.dataset.del,10);
        var tx = S.transactions.find(function(x){ return x.id===id; });
        deleteWithUndo('transactions', tx, S.transactions, 'Entrée', function(){
          renderSaisie(); renderDashboard(); renderAlerts(); renderBudgets(); renderAnnuel();
        });
      });
    });
  }
}
/* ============ IMPORT CSV ============ */
var pendingImportRows = [];
function wireSaisieTools(){
  var toggleBtn = document.getElementById('import-toggle-btn');
  var box = document.getElementById('import-box');
  toggleBtn.addEventListener('click', function(){
    box.style.display = box.style.display === 'none' ? '' : 'none';
  });
  document.getElementById('import-file-input').addEventListener('change', function(e){
    var file = e.target.files[0]; if(!file) return;
    var reader = new FileReader();
    reader.onload = function(){ document.getElementById('import-textarea').value = reader.result; };
    reader.readAsText(file, 'utf-8');
  });
  document.getElementById('import-parse-btn').addEventListener('click', function(){
    pendingImportRows = parseCsv(document.getElementById('import-textarea').value);
    renderImportRows();
  });
  document.getElementById('import-cancel-btn').addEventListener('click', function(){
    pendingImportRows = []; document.getElementById('import-rows').innerHTML = '';
    document.getElementById('import-actions').style.display = 'none';
    document.getElementById('import-textarea').value = '';
    box.style.display = 'none';
  });
  document.getElementById('import-confirm-btn').addEventListener('click', function(){
    var rows = pendingImportRows.filter(function(r){ return r.include; });
    Promise.all(rows.map(function(r){ return db.add('transactions', {date:r.date, type:r.type, category:r.category, amount:Math.abs(r.amount), needsReview:false}); }))
      .then(function(saved){
        saved.forEach(function(t){ S.transactions.push(t); });
        showToast(saved.length+' transaction'+(saved.length>1?'s':'')+' importée'+(saved.length>1?'s':'')+'.');
        pendingImportRows = []; document.getElementById('import-rows').innerHTML = '';
        document.getElementById('import-actions').style.display = 'none';
        document.getElementById('import-textarea').value = '';
        box.style.display = 'none';
        renderMonthSelects(); renderDashboard(); renderAlerts(); renderSaisie(); renderBudgets(); renderAnnuel();
      });
  });

  document.getElementById('scan-btn').addEventListener('click', function(){ document.getElementById('scan-file-input').click(); });
  document.getElementById('scan-file-input').addEventListener('change', handleReceiptScan);
  document.getElementById('voice-btn').addEventListener('click', handleVoiceInput);
}

function parseCsv(text){
  var lines = text.split(/\r?\n/).map(function(l){ return l.trim(); }).filter(Boolean);
  var delim = text.indexOf(';') !== -1 ? ';' : ',';
  var rows = [];
  lines.forEach(function(line){
    var cols = line.split(delim).map(function(c){ return c.trim().replace(/^"|"$/g,''); });
    if(cols.length < 2) return;
    var dateCol = cols.find(function(c){ return /^\d{2}\/\d{2}\/\d{4}$/.test(c) || /^\d{4}-\d{2}-\d{2}$/.test(c); });
    var amountCol = null;
    for(var i=cols.length-1;i>=0;i--){
      var n = parseFloat(cols[i].replace(/\s/g,'').replace(',','.').replace('€',''));
      if(!isNaN(n) && cols[i] !== dateCol){ amountCol = n; break; }
    }
    if(dateCol == null || amountCol == null) return;
    var iso = /^\d{2}\/\d{2}\/\d{4}$/.test(dateCol)
      ? dateCol.slice(6,10)+'-'+dateCol.slice(3,5)+'-'+dateCol.slice(0,2)
      : dateCol;
    var label = cols.find(function(c){ return c !== dateCol && isNaN(parseFloat(c.replace(',','.'))); }) || cols.join(' ');
    var guessed = matchCategoryByKeyword(label);
    var type = amountCol > 0 ? 'revenu' : 'variable';
    rows.push({date:iso, label:label, amount:amountCol, type:type, category: guessed || label, include:true});
  });
  return rows;
}
function renderImportRows(){
  var wrap = document.getElementById('import-rows');
  var actions = document.getElementById('import-actions');
  if(!pendingImportRows.length){
    wrap.innerHTML = '<div style="font-size:12px;color:var(--ink-faint);">Aucune ligne reconnue — vérifie le format (date;libellé;montant).</div>';
    actions.style.display = 'none';
    return;
  }
  actions.style.display = 'flex';
  var catOptions = S.categories.map(function(c){ return '<option value="'+c.name+'">'+c.icon+' '+c.name+'</option>'; }).join('');
  wrap.innerHTML = pendingImportRows.map(function(r, i){
    return '<div class="import-row">'+
      '<span class="tnum" style="font-size:11px;">'+fmtDateFR(r.date)+'</span>'+
      '<span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="'+r.label+'">'+r.label+'</span>'+
      '<select data-imp-cat="'+i+'">'+catOptions+'<option value="'+r.category+'" selected style="display:none;">'+r.category+'</option></select>'+
      '<span class="tnum" style="text-align:right;">'+eur(Math.abs(r.amount))+'</span>'+
    '</div>';
  }).join('');
  wrap.querySelectorAll('[data-imp-cat]').forEach(function(sel){
    sel.addEventListener('change', function(){ pendingImportRows[parseInt(sel.dataset.impCat,10)].category = sel.value; });
  });
}

/* ============ SCAN DE REÇU (OCR local) ============ */
var tesseractLoaded = false;
function loadTesseract(){
  if(tesseractLoaded) return Promise.resolve();
  return new Promise(function(resolve, reject){
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
    s.onload = function(){ tesseractLoaded = true; resolve(); };
    s.onerror = reject;
    document.head.appendChild(s);
  });
}
function handleReceiptScan(e){
  var file = e.target.files[0]; if(!file) return;
  var status = document.getElementById('scan-status');
  status.style.display = '';
  status.textContent = '📥 Chargement du lecteur de reçus (première fois seulement)…';
  loadTesseract().then(function(){
    status.textContent = '🔎 Lecture du reçu en cours…';
    return window.Tesseract.recognize(file, 'fra');
  }).then(function(result){
    var text = result.data.text || '';
    var amount = extractAmountFromReceipt(text);
    var guessed = matchCategoryByKeyword(text);
    if(amount){
      document.getElementById('qa-amt').value = amount.toFixed(2);
      if(guessed) document.getElementById('qa-cat').value = guessed;
      document.getElementById('qa-type').value = 'variable';
      status.textContent = '✓ Montant détecté : '+eur(amount)+' — vérifie avant d’ajouter.';
    } else {
      status.textContent = '⚠️ Montant non détecté automatiquement — saisis-le manuellement.';
    }
    setTimeout(function(){ status.style.display = 'none'; }, 6000);
  }).catch(function(){
    status.textContent = '⚠️ Le lecteur de reçus n’a pas pu se charger (connexion nécessaire au premier scan).';
    setTimeout(function(){ status.style.display = 'none'; }, 6000);
  });
  e.target.value = '';
}
function extractAmountFromReceipt(text){
  var lines = text.split('\n');
  var totalLine = lines.find(function(l){ return /total/i.test(l); });
  var candidates = [];
  (totalLine ? [totalLine] : lines).forEach(function(l){
    var matches = l.match(/(\d{1,4}[.,]\d{2})/g);
    if(matches) matches.forEach(function(m){ candidates.push(parseFloat(m.replace(',','.'))); });
  });
  if(!candidates.length){
    var all = text.match(/(\d{1,4}[.,]\d{2})/g);
    if(all) candidates = all.map(function(m){ return parseFloat(m.replace(',','.')); });
  }
  if(!candidates.length) return null;
  return totalLine ? candidates[0] : Math.max.apply(null, candidates);
}

/* ============ SAISIE VOCALE (nécessite une connexion) ============ */
function handleVoiceInput(){
  var Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  var btn = document.getElementById('voice-btn');
  var status = document.getElementById('scan-status');
  if(!Rec){ showToast('Reconnaissance vocale non disponible sur ce navigateur.'); return; }
  var rec = new Rec();
  rec.lang = 'fr-FR'; rec.interimResults = false; rec.maxAlternatives = 1;
  btn.classList.add('recording'); btn.textContent = '🎤 Écoute…';
  status.style.display = ''; status.textContent = 'Parle maintenant, ex : "12 euros essence".';
  rec.onresult = function(e){
    var transcript = e.results[0][0].transcript;
    var amountMatch = transcript.match(/(\d+([.,]\d+)?)/);
    var amount = amountMatch ? parseFloat(amountMatch[1].replace(',','.')) : null;
    var guessed = matchCategoryByKeyword(transcript);
    if(amount) document.getElementById('qa-amt').value = amount.toFixed(2);
    if(guessed) document.getElementById('qa-cat').value = guessed;
    document.getElementById('qa-type').value = 'variable';
    status.textContent = amount ? ('✓ Compris : "'+transcript+'" — vérifie avant d’ajouter.') : ('⚠️ Montant non compris dans : "'+transcript+'"');
    setTimeout(function(){ status.style.display = 'none'; }, 6000);
  };
  rec.onerror = function(){
    status.textContent = '⚠️ Reconnaissance vocale indisponible (connexion requise).';
    setTimeout(function(){ status.style.display = 'none'; }, 6000);
  };
  rec.onend = function(){ btn.classList.remove('recording'); btn.textContent = '🎤 Dicter une dépense'; };
  rec.start();
}

function wireSwipe(face){
  var card = face.closest('.swipe-card');
  var bgLeft = card.querySelector('.swipe-bg.left'), bgRight = card.querySelector('.swipe-bg.right');
  var startX = 0, dx = 0, dragging = false;
  function onDown(e){ dragging = true; startX = (e.touches?e.touches[0].clientX:e.clientX); face.style.transition='none'; }
  function onMove(e){
    if(!dragging) return;
    var x = (e.touches?e.touches[0].clientX:e.clientX); dx = x - startX;
    face.style.transform = 'translateX('+dx+'px) rotate('+(dx/28)+'deg)';
    bgLeft.style.opacity = dx < -10 ? Math.min(1, Math.abs(dx)/80) : 0;
    bgRight.style.opacity = dx > 10 ? Math.min(1, dx/80) : 0;
  }
  function onUp(){
    if(!dragging) return; dragging = false;
    face.style.transition = 'transform .25s ease, opacity .25s ease';
    if(Math.abs(dx) > 80){
      var accepted = dx > 0;
      face.style.transform = 'translateX('+(dx>0?600:-600)+'px) rotate('+(dx>0?24:-24)+'deg)';
      face.style.opacity = '0';
      var txId = parseInt(card.dataset.txId,10);
      setTimeout(function(){
        if(accepted){
          var tx = S.transactions.find(function(x){ return x.id===txId; });
          var cat = categoryByName(tx.suggestedCategory) || S.categories[0];
          tx.needsReview = false; tx.type = 'variable'; tx.category = cat ? cat.name : tx.suggestedCategory;
          db.put('transactions', tx).then(function(){ renderSaisie(); renderDashboard(); renderAlerts(); renderBudgets(); });
        } else {
          card.remove();
          if(!document.querySelector('.swipe-card')){ document.getElementById('swipe-stack').style.display='none'; document.getElementById('swipe-empty').style.display='flex'; }
        }
      }, 220);
    } else {
      face.style.transform = 'translateX(0) rotate(0)'; bgLeft.style.opacity=0; bgRight.style.opacity=0;
    }
    dx = 0;
  }
  face.addEventListener('pointerdown', onDown);
  face.addEventListener('pointermove', onMove);
  face.addEventListener('pointerup', onUp);
  face.addEventListener('pointercancel', onUp);
  face.addEventListener('pointerleave', function(e){ if(dragging && e.buttons===0) onUp(); });
}

/* ============ CALENDRIER ============ */
function wireCalendrier(){
  var input = document.getElementById('cal-start');
  input.value = S.calStartBalance;
  input.addEventListener('input', function(){
    S.calStartBalance = parseFloat(input.value) || 0;
    db.put('settings', {key:'calStartBalance', value:S.calStartBalance});
    renderCalendrier();
  });
}
function renderCalendrier(){
  var mk = CURRENT_MONTH;
  var p = mk.split('-'); var y = parseInt(p[0],10), mo = parseInt(p[1],10);
  var first = new Date(y, mo-1, 1);
  var leading = (first.getDay()+6) % 7; // lundi=0
  var days = daysInMonth(mk);
  var dowEl = document.getElementById('cal-dow');
  dowEl.innerHTML = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'].map(function(d){ return '<div class="cal-dow">'+d+'</div>'; }).join('');

  var events = {};
  function push(day, amt, label, dir){ events[day] = events[day] || []; events[day].push({amt:amt, label:label, dir:dir}); }
  var revenusThisMonth = txForMonth(mk).filter(function(t){ return t.type==='revenu'; }).reduce(function(a,t){ return a+t.amount; },0);
  if(revenusThisMonth > 0) push(1, revenusThisMonth, 'Revenus', 'in');
  S.fixedCharges.forEach(function(c){ push(c.dueDay, -c.amount, c.name, 'out'); });
  txForMonth(mk).filter(function(t){ return t.type==='epargne'; }).forEach(function(t){ push(parseInt(t.date.slice(8,10),10), -t.amount, t.category||'Épargne', 'out'); });

  var start = S.calStartBalance;
  var bal = start, lowDay = 1, lowVal = start;
  var today = new Date().getDate();
  var html = '';
  for(var i=0;i<leading;i++) html += '<div class="cal-cell blank"></div>';
  for(var d=1; d<=days; d++){
    var lines = '';
    (events[d]||[]).sort(function(a,b){ return b.amt-a.amt; }).forEach(function(e){
      bal += e.amt;
      lines += '<div class="cal-line '+e.dir+'">'+(e.amt>0?'+':'')+Math.round(e.amt)+'€ '+e.label+'</div>';
    });
    if(bal < lowVal){ lowVal = bal; lowDay = d; }
    var showBal = (events[d]||[]).length ? '<div class="cal-bal tnum">'+Math.round(bal)+' €</div>' : '';
    var cls = 'cal-cell'+(d===today?' today':'');
    html += '<div class="'+cls+'" data-day="'+d+'"><div class="cal-day">'+d+'</div>'+lines+showBal+'</div>';
  }
  document.getElementById('cal-grid').innerHTML = html;
  var lowCell = document.querySelector('#cal-grid [data-day="'+lowDay+'"]');
  if(lowCell) lowCell.classList.add('low');
  document.getElementById('cal-low-val').textContent = eur(lowVal);
  document.getElementById('cal-low-day').textContent = lowDay;
  document.getElementById('cal-end-val').textContent = eur(bal);
}

/* ============ BUDGETS ============ */
var catSortMode = 'ecart';
function wireBudgets(){
  document.getElementById('cat-sort').addEventListener('change', function(e){ catSortMode = e.target.value; renderBudgets(); });
  document.getElementById('cat-add-btn').addEventListener('click', function(){
    openModal({
      title:'Nouvelle catégorie',
      fields:[
        {key:'name', label:'Nom', value:''},
        {key:'icon', label:'Emoji', value:'✳️'},
        {key:'monthlyBudget', label:'Budget mensuel (€)', type:'number', value:30}
      ]
    }).then(function(v){
      if(!v || !v.name) return;
      db.add('categories', {name:v.name, icon:v.icon||'✳️', monthlyBudget:v.monthlyBudget||0}).then(function(c){ S.categories.push(c); renderBudgets(); renderSaisie(); });
    });
  });
}
function renderBudgets(){
  document.getElementById('budgets-hint').textContent = 'Cumul réel '+CURRENT_YEAR+' vs budget.';
  var yearTx = S.transactions.filter(function(t){ return !t.needsReview && t.type==='variable' && t.date.indexOf(CURRENT_YEAR)===0; });
  var rows = S.categories.map(function(c){
    var real = yearTx.filter(function(t){ return t.category===c.name; }).reduce(function(a,t){ return a+t.amount; },0);
    var annual = c.monthlyBudget*12;
    var pct = annual>0 ? Math.min(100, Math.round(real/annual*100)) : 0;
    return {id:c.id, name:c.name, icon:c.icon, annual:annual, real:real, pct:pct, ecart:annual-real};
  });
  if(catSortMode==='pct') rows.sort(function(a,b){ return b.pct-a.pct; });
  else if(catSortMode==='name') rows.sort(function(a,b){ return a.name.localeCompare(b.name); });
  else rows.sort(function(a,b){ return a.ecart-b.ecart; });
  document.getElementById('cat-list').innerHTML = rows.map(function(r){
    var color = r.pct>85 ? 'var(--bad)' : (r.pct>55 ? 'var(--warn)' : 'var(--good)');
    return '<div class="cat-row">'+
      '<button class="cat-name" data-edit-cat="'+r.id+'" title="Modifier">'+r.icon+' '+r.name+'</button>'+
      '<div class="cat-bar-wrap"><div class="bar-track"><div class="bar-fill" style="width:'+r.pct+'%; background:'+color+';"></div></div></div>'+
      '<div class="cat-nums"><span class="budget tnum">'+eur(r.annual)+'</span><span class="ecart tnum" style="color:'+color+';">'+eur(r.ecart)+'</span></div>'+
      '<button class="icon-btn" data-del-cat="'+r.id+'" title="Supprimer">×</button>'+
    '</div>';
  }).join('') || '<div style="font-size:12px;color:var(--ink-faint);">Aucune catégorie. Clique "+ Catégorie" pour commencer.</div>';
  document.querySelectorAll('[data-edit-cat]').forEach(function(btn){
    btn.addEventListener('click', function(){
      var c = S.categories.find(function(x){ return x.id===parseInt(btn.dataset.editCat,10); });
      openModal({
        title:'Modifier '+c.name,
        fields:[
          {key:'icon', label:'Emoji', value:c.icon},
          {key:'monthlyBudget', label:'Budget mensuel (€)', type:'number', value:c.monthlyBudget}
        ]
      }).then(function(v){
        if(!v) return;
        c.icon = v.icon||c.icon; c.monthlyBudget = isNaN(v.monthlyBudget) ? c.monthlyBudget : v.monthlyBudget;
        db.put('categories', c).then(function(){ renderBudgets(); renderDashboard(); renderSaisie(); });
      });
    });
  });
  document.querySelectorAll('[data-del-cat]').forEach(function(btn){
    btn.addEventListener('click', function(){
      var id = parseInt(btn.dataset.delCat,10);
      var c = S.categories.find(function(x){ return x.id===id; });
      confirmModal('Supprimer '+c.name+' ?', 'Le budget et l’historique associés à ce nom resteront dans Saisie rapide.', {danger:true, okLabel:'Supprimer'}).then(function(ok){
        if(!ok) return;
        deleteWithUndo('categories', c, S.categories, 'Catégorie', function(){ renderBudgets(); renderSaisie(); });
      });
    });
  });
}

/* ============ ABONNEMENTS ============ */
function renderAbonnements(){
  var subs = S.fixedCharges.filter(function(c){ return c.isSubscription; }).sort(function(a,b){ return b.amount-a.amount; });
  var totalMonth = subs.reduce(function(a,c){ return a+c.amount; },0);
  document.getElementById('sub-total-month').textContent = eur(totalMonth);
  document.getElementById('sub-total-year').textContent = eur(totalMonth*12);
  document.getElementById('sub-list').innerHTML = subs.map(function(c){
    return '<div class="sub-row"><div class="sub-ic">'+c.icon+'</div><div class="sub-name">'+c.name+'</div>'+
      '<div class="sub-monthly tnum">'+eur(c.amount)+'/mois</div><div class="sub-annual tnum">'+eur(c.amount*12)+'/an</div></div>';
  }).join('') || '<div style="font-size:12px;color:var(--ink-faint);">Aucun abonnement marqué. Coche "Abonnement" sur une charge fixe dans Paramètres.</div>';
  var nudgeEl = document.getElementById('sub-nudge');
  if(subs.length){
    var top = subs[0];
    nudgeEl.textContent = '💡 '+top.name+' pèse à lui seul '+eur(top.amount*12)+'/an — ça vaut peut-être une comparaison.';
  } else nudgeEl.textContent = '';
}

/* ============ PATRIMOINE ============ */
function wirePatrimoine(){
  document.getElementById('account-add-btn').addEventListener('click', function(){
    openModal({
      title:'Nouveau compte',
      fields:[{key:'name', label:'Nom', value:''}, {key:'goal', label:'Objectif (€) — 0 si aucun', type:'number', value:0}]
    }).then(function(v){
      if(!v || !v.name) return;
      db.add('patrimoineAccounts', {name:v.name, goal:v.goal||0, snapshots:{}}).then(function(a){ S.patrimoineAccounts.push(a); renderPatrimoine(); });
    });
  });
  document.getElementById('fund-add-btn').addEventListener('click', function(){
    openModal({
      title:'Nouveau fonds de côté',
      fields:[
        {key:'name', label:'Nom', value:''}, {key:'icon', label:'Emoji', value:'💰'},
        {key:'annualTarget', label:'Objectif annuel (€)', type:'number', value:600},
        {key:'monthly', label:'Mis de côté chaque mois (€)', type:'number', value:50}
      ]
    }).then(function(v){
      if(!v || !v.name) return;
      db.add('sinkingFunds', {name:v.name, icon:v.icon||'💰', annualTarget:v.annualTarget||0, monthly:v.monthly||0, accumulated:0}).then(function(f){ S.sinkingFunds.push(f); renderPatrimoine(); });
    });
  });
  document.getElementById('loan-edit-btn').addEventListener('click', function(){
    openModal({
      title:'Prêt en cours',
      fields:[
        {key:'monthlyPayment', label:'Mensualité (€)', type:'number', value:S.loan.monthlyPayment||0},
        {key:'principal', label:'Capital initial emprunté (€)', type:'number', value:S.loan.principal||0},
        {key:'remaining', label:'Capital restant dû (€)', type:'number', value:S.loan.remaining||0}
      ]
    }).then(function(v){
      if(!v) return;
      S.loan = {monthlyPayment:v.monthlyPayment||0, principal:v.principal||0, remaining:v.remaining||0};
      db.put('settings', {key:'loan', value:S.loan}).then(renderPatrimoine);
    });
  });
}
function accountLatest(a){
  var keys = Object.keys(a.snapshots||{}).sort();
  return keys.length ? a.snapshots[keys[keys.length-1]] : 0;
}
function renderPatrimoine(){
  var total = S.patrimoineAccounts.reduce(function(sum,a){ return sum+accountLatest(a); }, 0);
  document.getElementById('patri-total').outerHTML = '<div class="stat-value tnum" id="patri-total">'+animatedEur('patri-total', total)+'</div>';

  var loanHtml;
  if(S.loan.monthlyPayment){
    var pct = S.loan.principal>0 ? Math.round((S.loan.principal-S.loan.remaining)/S.loan.principal*100) : 0;
    var monthsLeft = S.loan.monthlyPayment>0 ? Math.ceil(S.loan.remaining/S.loan.monthlyPayment) : 0;
    loanHtml = '<div class="loan-stat"><span class="l">Mensualité</span><span class="v tnum">'+eur(S.loan.monthlyPayment)+'</span></div>'+
      '<div class="loan-stat"><span class="l">Capital restant dû</span><span class="v tnum">'+eur(S.loan.remaining)+'</span></div>'+
      '<div class="loan-stat"><span class="l">Échéances restantes</span><span class="v tnum">'+monthsLeft+' mois</span></div>'+
      '<div class="loan-bar"><div class="goal-top"><span>'+pct+' % remboursé</span></div><div class="bar-track"><div class="bar-fill" style="width:'+pct+'%; background:var(--accent);"></div></div></div>';
  } else loanHtml = '<div style="font-size:12px;color:var(--ink-faint);">Aucun prêt renseigné. Clique "Modifier" pour en ajouter un.</div>';
  document.getElementById('loan-card').innerHTML = loanHtml;

  document.getElementById('patri-cards').innerHTML = S.patrimoineAccounts.map(function(a){
    var bal = accountLatest(a);
    var series = Object.keys(a.snapshots||{}).sort().map(function(k){ return a.snapshots[k]; });
    if(!series.length) series = [0];
    var goalPct = a.goal>0 ? Math.min(100, Math.round(bal/a.goal*100)) : 0;
    return '<div class="card">'+
      '<h3>'+a.name+'</h3>'+
      '<button class="stat-value tnum" data-update-bal="'+a.id+'" style="font-size:17px; margin-top:6px; background:none; border:none; padding:0; cursor:pointer; color:var(--ink); text-align:left;" title="Mettre à jour le solde">'+eur(bal)+'</button>'+
      '<div class="mini-chart" data-series="'+series.join(',')+'" data-color="accent"></div>'+
      (a.goal>0 ? '<div class="goal-row"><div class="goal-top" data-edit-goal="'+a.id+'" style="cursor:pointer;"><span>Objectif ✎</span><span class="tnum">'+eur(bal)+' / '+eur(a.goal)+'</span></div><div class="bar-track"><div class="bar-fill" style="width:'+goalPct+'%; background:var(--accent);"></div></div></div>'
        : '<div class="goal-row"><div class="goal-top" data-edit-goal="'+a.id+'" style="cursor:pointer;"><span>+ Définir un objectif</span></div></div>') +
    '</div>';
  }).join('') || '<div style="font-size:12px;color:var(--ink-faint);">Aucun compte. Clique "+ Compte" pour en ajouter un.</div>';
  document.querySelectorAll('[data-update-bal]').forEach(function(btn){
    btn.addEventListener('click', function(){
      var a = S.patrimoineAccounts.find(function(x){ return x.id===parseInt(btn.dataset.updateBal,10); });
      openModal({title:'Nouveau solde — '+a.name, fields:[{key:'v', label:monthLabel(CURRENT_MONTH)+' (€)', type:'number', value:accountLatest(a)}]}).then(function(r){
        if(!r || isNaN(r.v)) return;
        a.snapshots = a.snapshots || {}; a.snapshots[CURRENT_MONTH] = r.v;
        db.put('patrimoineAccounts', a).then(renderPatrimoine);
      });
    });
  });
  document.querySelectorAll('[data-edit-goal]').forEach(function(el){
    el.addEventListener('click', function(){
      var a = S.patrimoineAccounts.find(function(x){ return x.id===parseInt(el.dataset.editGoal,10); });
      openModal({title:'Objectif — '+a.name, fields:[{key:'v', label:'Objectif (€)', type:'number', value:a.goal||0}]}).then(function(r){
        if(!r || isNaN(r.v)) return;
        a.goal = r.v;
        db.put('patrimoineAccounts', a).then(renderPatrimoine);
      });
    });
  });

  document.getElementById('fund-list').innerHTML = S.sinkingFunds.map(function(f){
    var pct = f.annualTarget>0 ? Math.min(100, Math.round(f.accumulated/f.annualTarget*100)) : 0;
    return '<div class="fund-row" data-fund="'+f.id+'">'+
      '<div class="fund-name">'+f.icon+' '+f.name+'</div>'+
      '<div class="fund-monthly tnum">'+eur(f.monthly)+'/mois</div>'+
      '<div class="fund-bar"><div class="bar-track"><div class="bar-fill" style="width:'+pct+'%; background:var(--accent);"></div></div></div>'+
      '<div class="fund-acc tnum">'+eur(f.accumulated)+' / '+eur(f.annualTarget)+'</div>'+
      '<button class="icon-btn" data-del-fund="'+f.id+'" title="Supprimer">×</button>'+
    '</div>';
  }).join('') || '<div style="font-size:12px;color:var(--ink-faint);">Aucun fonds de côté pour l’instant.</div>';
  document.querySelectorAll('[data-fund]').forEach(function(row){
    row.addEventListener('click', function(e){
      if(e.target.closest('[data-del-fund]')) return;
      var f = S.sinkingFunds.find(function(x){ return x.id===parseInt(row.dataset.fund,10); });
      openModal({title:f.name, fields:[{key:'v', label:'Montant accumulé (€)', type:'number', value:f.accumulated}]}).then(function(r){
        if(!r || isNaN(r.v)) return;
        f.accumulated = r.v;
        db.put('sinkingFunds', f).then(renderPatrimoine);
      });
    });
  });
  document.querySelectorAll('[data-del-fund]').forEach(function(btn){
    btn.addEventListener('click', function(e){
      e.stopPropagation();
      var id = parseInt(btn.dataset.delFund,10);
      var f = S.sinkingFunds.find(function(x){ return x.id===id; });
      confirmModal('Supprimer '+f.name+' ?', null, {danger:true, okLabel:'Supprimer'}).then(function(ok){
        if(!ok) return;
        deleteWithUndo('sinkingFunds', f, S.sinkingFunds, 'Fonds', renderPatrimoine);
      });
    });
  });

  paintSparklines(document.getElementById('patri-cards'));
  playNumberAnimations(document.getElementById('view-patrimoine'));
}

/* ============ ANNUEL ============ */
function renderAnnuel(){
  document.getElementById('annuel-hint').textContent = CURRENT_YEAR + ' — revenus vs dépenses, courbe mois par mois.';
  var months = [];
  for(var m=1;m<=12;m++) months.push(CURRENT_YEAR+'-'+String(m).padStart(2,'0'));
  var aggs = months.map(function(mk){ return monthAggregate(mk); });

  var w=900,h=170,padL=6,padR=6,padT=10,padB=22;
  var known = aggs.filter(Boolean);
  var max = known.length ? Math.max.apply(null, known.map(function(a){ return Math.max(a.revenus,a.depenses); })) : 1;
  function pt(i,v){ var step=(w-padL-padR)/11; return [padL+i*step, h-padB-(v/max)*(h-padT-padB)]; }
  var revPts=[], depPts=[];
  aggs.forEach(function(a,i){ if(a){ revPts.push(pt(i,a.revenus)); depPts.push(pt(i,a.depenses)); } });
  var revColor = cssVar('accent-soft-line'), depColor = cssVar('accent');
  var svg = '';
  if(revPts.length>1){
    var revD = smoothPath(revPts), depD = smoothPath(depPts);
    var lastRev = revPts[revPts.length-1], lastDep = depPts[depPts.length-1];
    var areaDep = depD+' L'+lastDep[0].toFixed(1)+','+(h-padB)+' L'+depPts[0][0].toFixed(1)+','+(h-padB)+' Z';
    var gridLines = [0,0.5,1].map(function(f){ var y=h-padB-f*(h-padT-padB); return '<line x1="'+padL+'" y1="'+y+'" x2="'+(w-padR)+'" y2="'+y+'" stroke="var(--line)" stroke-width="1"/>'; }).join('');
    var labels = months.map(function(mk,i){ var pp=pt(i,0); return '<text x="'+pp[0].toFixed(1)+'" y="'+(h-4)+'" font-size="9.5" fill="var(--ink-faint)" text-anchor="middle">'+MONTH_NAMES[i].slice(0,4)+'.</text>'; }).join('');
    svg = '<svg viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="none">'+gridLines+
      '<path d="'+areaDep+'" fill="'+depColor+'" opacity="0.08" stroke="none"/>'+
      '<path d="'+revD+'" fill="none" stroke="'+revColor+'" stroke-width="2"/>'+
      '<path d="'+depD+'" fill="none" stroke="'+depColor+'" stroke-width="2.2"/>'+
      '<circle cx="'+lastRev[0].toFixed(1)+'" cy="'+lastRev[1].toFixed(1)+'" r="3.2" fill="'+revColor+'"/>'+
      '<circle cx="'+lastDep[0].toFixed(1)+'" cy="'+lastDep[1].toFixed(1)+'" r="3.2" fill="'+depColor+'"/>'+
      labels+'</svg>';
  } else {
    svg = '<div class="empty-state" style="padding:30px;"><div class="ic">◌</div><div class="t">Pas encore assez de données</div><div class="d">Le graphique apparaît dès que plusieurs mois ont des chiffres.</div></div>';
  }
  document.getElementById('year-chart').innerHTML = svg;

  var head = '<tr><th>Mois</th><th>Revenus</th><th>Dépenses</th><th>Solde</th><th>Bilan</th></tr>';
  var body = months.map(function(mk,i){
    var a = aggs[i];
    if(!a) return '<tr><td>'+MONTH_NAMES[i]+'</td><td colspan="4" style="text-align:center; color:var(--ink-faint);">—</td></tr>';
    var d = diagnostics(mk);
    return '<tr><td>'+MONTH_NAMES[i]+'</td><td class="tnum">'+eur(a.revenus)+'</td><td class="tnum">'+eur(a.depenses)+'</td><td class="tnum">'+eur(a.solde)+'</td>'+
      '<td><span class="pill '+d.margin.cls+'">'+d.margin.label+'</span></td></tr>';
  }).join('');
  document.getElementById('year-table').innerHTML = head+body;
}

/* ============ AUTOMATIONS ============ */
var AUTO_DEFS = [
  {key:'overspendAlert', title:'Alerte de dépassement', desc:'Prévenir dès qu’une catégorie variable dépasse 90 % de son budget mensuel.'},
  {key:'dueReminder', title:'Rappel avant échéance', desc:'Notifier 3 jours avant chaque charge fixe (loyer, assurances, abonnements).'},
  {key:'uncatDetect', title:'Détection des virements non catégorisés', desc:'Repérer les mouvements sans catégorie assignée et les proposer à trier (glisser-déposer).'},
  {key:'monthClose', title:'Bilan de fin de mois', desc:'Le récap + le diagnostic se génèrent automatiquement, sans formule à recopier.'},
  {key:'rollover', title:'Report du surplus non dépensé', desc:'Le budget non utilisé le mois dernier s’ajoute au budget variable de ce mois-ci.'},
  {key:'weeklyDigest', title:'Résumé hebdomadaire', desc:'Un résumé (solde, catégories à surveiller) s’affiche en haut des Alertes à chaque ouverture, le lundi.'}
];
function renderAutomations(){
  document.getElementById('auto-list').innerHTML = AUTO_DEFS.map(function(def){
    var on = !!S.automations[def.key];
    return '<div class="auto-card"><label class="switch"><input type="checkbox" data-auto="'+def.key+'" '+(on?'checked':'')+'><span class="track"><span class="thumb"></span></span></label>'+
      '<div class="auto-body"><div class="auto-title">'+def.title+'</div><div class="auto-desc">'+def.desc+'</div></div></div>';
  }).join('');
  document.querySelectorAll('[data-auto]').forEach(function(cb){
    cb.addEventListener('change', function(){
      S.automations[cb.dataset.auto] = cb.checked;
      db.put('settings', {key:'automations', value:S.automations}).then(function(){ renderAlerts(); renderDashboard(); });
    });
  });
}

/* ============ PARAMETRES ============ */
var TH_DEFS = [
  ['savingsLow','%'], ['savingsGood','%'], ['fixedGood','%'], ['fixedMax','%'],
  ['variableGood','%'], ['variableMax','%'], ['comfortMargin','€']
];
function wireParametres(){
  TH_DEFS.forEach(function(def){
    var key = def[0], unit = def[1];
    var input = document.getElementById('th-'+key);
    input.addEventListener('input', function(){
      S.thresholds[key] = parseFloat(input.value);
      document.getElementById('th-'+key+'-val').textContent = input.value + (unit==='%' ? ',0 %' : ',00 €');
      db.put('settings', {key:'thresholds', value:S.thresholds});
      renderDashboard(); renderAlerts();
    });
  });
  document.getElementById('charge-add-btn').addEventListener('click', function(){ openChargeModal(); });
  document.getElementById('rule-add-btn').addEventListener('click', function(){ openRuleModal(); });
}
function openChargeModal(existing){
  openModal({
    title: existing ? 'Modifier '+existing.name : 'Nouvelle charge fixe',
    fields:[
      {key:'name', label:'Nom', value: existing ? existing.name : ''},
      {key:'icon', label:'Emoji', value: existing ? existing.icon : '💳'},
      {key:'amount', label:'Montant mensuel (€)', type:'number', value: existing ? existing.amount : 20},
      {key:'dueDay', label:'Jour de prélèvement (1-28)', type:'number', step:'1', value: existing ? existing.dueDay : 1},
      {key:'group', label:'Groupe', type:'select', value: existing ? existing.group : 'personnelles', options:[{value:'communes',label:'Communes'},{value:'personnelles',label:'Personnelles'}]},
      {key:'isSubscription', label:'Abonnement (oui/non)', type:'select', value: existing && existing.isSubscription ? 'oui' : 'non', options:[{value:'non',label:'Non'},{value:'oui',label:'Oui'}]}
    ]
  }).then(function(v){
    if(!v || !v.name) return;
    var payload = {name:v.name, icon:v.icon||'💳', amount:v.amount||0, dueDay:Math.min(28,Math.max(1,parseInt(v.dueDay,10)||1)), group:v.group, isSubscription:v.isSubscription==='oui'};
    var op = existing ? db.put('fixedCharges', Object.assign(existing, payload)) : db.add('fixedCharges', payload);
    op.then(function(c){
      if(!existing) S.fixedCharges.push(c);
      renderParametres(); renderDashboard(); renderAbonnements(); renderCalendrier();
    });
  });
}
function renderParametres(){
  TH_DEFS.forEach(function(def){
    var key = def[0], unit = def[1];
    var input = document.getElementById('th-'+key);
    var val = S.thresholds[key] != null ? S.thresholds[key] : 0;
    input.value = val;
    document.getElementById('th-'+key+'-val').textContent = val.toLocaleString('fr-FR',{minimumFractionDigits:1}) + (unit==='%'?' %':' €');
  });
  document.getElementById('param-charge-list').innerHTML = S.fixedCharges.map(function(c){
    return '<div class="charge-row"><div class="charge-day">'+String(c.dueDay).padStart(2,'0')+'</div>'+
      '<button data-edit-charge="'+c.id+'" style="flex:1; text-align:left; background:none; border:none; padding:0; cursor:pointer; color:inherit; font:inherit;"><div class="charge-name">'+c.icon+' '+c.name+(c.isSubscription?' <span style="color:var(--ink-faint); font-weight:400;">· abonnement</span>':'')+'</div><div class="charge-tag">'+(c.group==='communes'?'Communes':'Personnelles')+'</div></button>'+
      '<div class="charge-amt tnum">'+eur(c.amount)+'</div>'+
      '<button class="icon-btn" data-del-charge="'+c.id+'" title="Supprimer" style="margin-left:6px;">×</button></div>';
  }).join('') || '<div style="font-size:12px;color:var(--ink-faint);">Aucune charge fixe.</div>';
  document.querySelectorAll('[data-edit-charge]').forEach(function(btn){
    btn.addEventListener('click', function(){
      openChargeModal(S.fixedCharges.find(function(x){ return x.id===parseInt(btn.dataset.editCharge,10); }));
    });
  });
  document.querySelectorAll('[data-del-charge]').forEach(function(btn){
    btn.addEventListener('click', function(){
      var id = parseInt(btn.dataset.delCharge,10);
      var c = S.fixedCharges.find(function(x){ return x.id===id; });
      confirmModal('Supprimer '+c.name+' ?', null, {danger:true, okLabel:'Supprimer'}).then(function(ok){
        if(!ok) return;
        deleteWithUndo('fixedCharges', c, S.fixedCharges, 'Charge fixe', function(){ renderParametres(); renderDashboard(); renderAbonnements(); renderCalendrier(); });
      });
    });
  });

  document.getElementById('rule-list').innerHTML = S.categoryRules.map(function(r, i){
    var cat = categoryByName(r.category);
    return '<div class="rule-row"><span>« '+r.keyword+' »</span><span>'+(cat?cat.icon+' '+cat.name:r.category)+'</span>'+
      '<button class="icon-btn" data-del-rule="'+i+'" title="Supprimer">×</button></div>';
  }).join('') || '<div style="font-size:12px;color:var(--ink-faint);">Aucune règle. Utile pour l’import CSV et la dictée vocale.</div>';
  document.querySelectorAll('[data-del-rule]').forEach(function(btn){
    btn.addEventListener('click', function(){
      S.categoryRules.splice(parseInt(btn.dataset.delRule,10), 1);
      db.put('settings', {key:'categoryRules', value:S.categoryRules}).then(renderParametres);
    });
  });
}
function openRuleModal(){
  if(!S.categories.length){ showToast('Crée d’abord au moins une catégorie dans Budgets.'); return; }
  openModal({
    title:'Nouvelle règle',
    fields:[
      {key:'keyword', label:'Mot-clé (ex: carrefour)', value:''},
      {key:'category', label:'Catégorie associée', type:'select', value:S.categories[0].name, options:S.categories.map(function(c){ return {value:c.name, label:c.icon+' '+c.name}; })}
    ]
  }).then(function(v){
    if(!v || !v.keyword) return;
    S.categoryRules.push({keyword:v.keyword.toLowerCase().trim(), category:v.category});
    db.put('settings', {key:'categoryRules', value:S.categoryRules}).then(renderParametres);
  });
}
function matchCategoryByKeyword(text){
  if(!text) return null;
  var low = text.toLowerCase();
  var hit = S.categoryRules.find(function(r){ return low.indexOf(r.keyword) !== -1; });
  return hit ? hit.category : null;
}

/* ============ PWA install ============ */
if('serviceWorker' in navigator){
  window.addEventListener('load', function(){ navigator.serviceWorker.register('sw.js').catch(function(){}); });
}
