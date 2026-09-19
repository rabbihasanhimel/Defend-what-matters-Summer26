/* BLACK TAG — mass-casualty triage for a hospital estate.
   The hospital already knows how to decide who waits. It has never
   been asked to do it for its own machines.

   The clock runs on its own. There is one validation lane, because there
   is one Lou. An idle lane is the most expensive thing on this screen. */
(function () {
'use strict';

var D    = window.BT;
var CAP  = D.capacity;
var FAST = /[?&]fast=1/.test(location.search) ? 3 : 1;
var FLAT = /[?&]flat=1/.test(location.search);
var DAYS = ['Saturday','Sunday','Monday','Tuesday','Wednesday','Thursday','Friday'];
var TAGS = { red:'Red', amber:'Amber', green:'Green', black:'Black' };
var SEC_PER_DAY = 12;         // one incident day every twelve seconds at 1x

var $  = function (s, r) { return (r || document).querySelector(s); };
var $$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };

/* ── state ─────────────────────────────────────────────────────── */
var S, RT, reached, cardEls;

function reset() {
  S = { stage:'brief', day:0, affected:0, severe:0, svc:{}, fired:{},
        order:[], queue:[], lane:null, twist:null, over:false };
  RT = { running:false, speed:1, last:0 };
  D.services.forEach(function (s) {
    S.svc[s.id] = { tag:null, status:'down', since:0, harm:0, mult:1, reinf:false };
  });
  reached = { brief:1 };
  cardEls = {};
}

/* ── clock ─────────────────────────────────────────────────────── */
function clk(day) {
  var mins = Math.round(day * 1440 + 134), d = Math.floor(mins / 1440), m = mins % 1440;
  return {
    t: String(Math.floor(m / 60)).padStart(2,'0') + ':' + String(m % 60).padStart(2,'0'),
    d: d,
    label: d === 0 ? 'Saturday · day one' : 'Day ' + (d + 1) + ' · ' + DAYS[d % 7]
  };
}
function paintClock(jump) {
  var c = clk(S.day);
  $('#clk').textContent = c.t;
  $('#clkday').textContent = c.label;
  if (jump) { $('#clk').classList.remove('jump'); void $('#clk').offsetWidth; $('#clk').classList.add('jump'); }
}

/* ── harm ──────────────────────────────────────────────────────── */
function tolDays(s) { return s.tolerance_h == null ? Infinity : s.tolerance_h / 24; }

/* what a single service is costing per day, right now */
function rateOf(s) {
  var st = S.svc[s.id];
  if (st.status !== 'down') return 0;
  return S.day >= st.since + tolDays(s) ? s.affected_day : 0;
}
function bleedRate() {
  var r = 0;
  D.services.forEach(function (s) { r += rateOf(s); });
  return r;
}

function accrue(a, b) {
  D.services.forEach(function (s) {
    var st = S.svc[s.id];
    if (st.status !== 'down') return;
    var lo = Math.max(a, st.since + tolDays(s));
    if (b > lo) {
      var dt = b - lo;
      S.affected += s.affected_day * dt;
      S.severe   += s.severe_day  * dt;
      st.harm    += s.affected_day * dt;
    }
  });
}

/* headless run, same rules, used for the 2019 plan's number */
function simulate(order, black) {
  var day = 0, aff = 0, sev = 0, st = {}, done = 0, reinfAt = null;
  D.services.forEach(function (s) { st[s.id] = { down:true, since:0, mult:1 }; });

  function step(to) {
    D.services.forEach(function (s) {
      var x = st[s.id]; if (!x.down) return;
      var lo = Math.max(day, x.since + tolDays(s));
      if (to > lo) { aff += s.affected_day * (to - lo); sev += s.severe_day * (to - lo); }
    });
    day = to;
  }

  for (var i = 0; i < order.length; i++) {
    var s = byId(order[i]);
    if (black[s.id]) continue;
    step(day + (s.systems / CAP) * st[s.id].mult);
    st[s.id].down = false; done++;
    if (done === 3 && reinfAt === null) {            // same reinfection rule as the live run
      var victim = null, c = 0;
      for (var j = 0; j < i; j++) { if (!black[order[j]]) { c++; if (c === 2) { victim = order[j]; break; } } }
      if (victim) { st[victim].down = true; st[victim].since = day; st[victim].mult = 1.6; reinfAt = day;
                    order.push(victim); }
    }
  }
  return { affected: aff, severe: sev, days: day };
}

function byId(id) { for (var i = 0; i < D.services.length; i++) if (D.services[i].id === id) return D.services[i]; return null; }

/* ── log ───────────────────────────────────────────────────────── */
function logLine(time, text, cls) {
  var li = document.createElement('li');
  if (cls) li.className = cls;
  li.innerHTML = '<time>' + time + '</time><p>' + text + '</p>';
  var log = $('#log'); log.appendChild(li); log.scrollTop = log.scrollHeight;
}
function fireEvents() {
  D.events.forEach(function (e, i) {
    if (S.fired[i] || e.day > S.day) return;
    if (e.svc && S.svc[e.svc].status !== 'down') return;   // you restored it. it did not happen.
    S.fired[i] = 1;
    logLine(e.t, e.w, e.svc ? 'bad' : '');
  });
}

/* ── readouts ──────────────────────────────────────────────────── */
var lastRate = -1;
function paintMeters() {
  var rate = Math.round(bleedRate());
  var el = $('#mRate');
  if (rate !== lastRate) {
    el.innerHTML = rate.toLocaleString('en') + '<small>/day</small>';
    el.classList.toggle('falling', rate < lastRate && lastRate >= 0);
    lastRate = rate;
  }
  set('#mAff', Math.round(S.affected).toLocaleString('en'));
  set('#mSev', Math.round(S.severe).toLocaleString('en'));
  function set(sel, v) {
    var e = $(sel);
    if (e.textContent === v) return;
    e.textContent = v;
  }
}

/* ── dependency ────────────────────────────────────────────────── */
/* You may queue behind identity as soon as identity is scheduled — that is the
   whole point of a queue. The lane simply will not START anything that cannot
   authenticate yet, and says so. */
function adScheduled() {
  return S.svc.ad.status === 'restored' ||
         (S.lane && S.lane.id === 'ad') ||
         S.queue.indexOf('ad') >= 0;
}
function blockedBy(id) {                       // blocks queueing
  return (id !== 'ad' && !adScheduled()) ? byId('ad') : null;
}
function canStart(id) {                        // blocks entering the lane
  return id === 'ad' || S.svc.ad.status === 'restored';
}
function restorable(id) {
  var st = S.svc[id];
  return st.status === 'down' && st.tag && st.tag !== 'black';
}

/* ── board ─────────────────────────────────────────────────────── */
function card(s) {
  var st  = S.svc[s.id];
  var el  = document.createElement('article');
  el.className = 'card';
  el.draggable = S.stage === 'triage';
  el.dataset.id = s.id;
  if (st.tag) el.dataset.tag = st.tag;
  if (st.status === 'restored') el.classList.add('restored');
  if (st.reinf && st.status === 'down') el.classList.add('reinf');

  var qi   = S.queue.indexOf(s.id);
  var inQ  = qi >= 0;
  var live = S.lane && S.lane.id === s.id;
  var dep  = blockedBy(s.id);
  var dur  = ((s.systems / CAP) * st.mult).toFixed(1);
  var tol  = s.tolerance_h == null ? 'no acute clock'
           : s.tolerance_h < 24 ? s.tolerance_h + ' h' : (s.tolerance_h / 24) + ' d';

  if (live) el.classList.add('live');
  if (inQ)  el.classList.add('queued');

  el.innerHTML =
    (st.status === 'restored' ? '<span class="c-back">back</span>' : '') +
    (st.reinf && st.status === 'down' ? '<span class="c-back c-again">encrypting again</span>' : '') +
    (live ? '<span class="c-back c-live">validating</span>' : '') +
    (inQ && !live ? '<span class="c-back c-q">' + (qi + 1) + ' in queue</span>' : '') +
    '<span class="c-n">' + s.name + '</span>' +
    '<div class="c-m"><span>' + s.dept + '</span><span><b>' + s.systems + '</b> sys</span>' +
    '<span><b>' + dur + '</b> d to validate</span><span class="c-tol">' + tol + '</span></div>' +
    '<div class="c-bleed"></div>' +
    '<p class="c-note">' + s.note + '<br><span style="color:var(--brass)">' + s.cost + '</span></p>' +
    (st.status === 'down'
      ? '<div class="tagbar">' + Object.keys(TAGS).map(function (t) {
          return '<button data-t="' + t + '">' + TAGS[t] + '</button>'; }).join('') + '</div>'
      : '') +
    (S.stage === 'restore' && restorable(s.id) && !live
      ? (dep
         ? '<div class="c-block">Queue ' + dep.name + ' first &mdash; nothing else can authenticate</div>'
         : '<div class="tagbar"><button data-run="1" class="c-run">' +
           (inQ ? 'Take out of the queue' : 'Put in the queue') + '</button></div>')
      : '');

  paintBleed(el, s);

  el.addEventListener('click', function (ev) {
    var b = ev.target.closest('button');
    if (b && b.dataset.t)   { tag(s.id, b.dataset.t, el); return; }
    if (b && b.dataset.run) { toggleQueue(s.id); return; }
    el.classList.toggle('open');
  });
  el.addEventListener('dragstart', function (ev) {
    if (S.stage !== 'triage') return ev.preventDefault();
    ev.dataTransfer.setData('text/plain', s.id); el.classList.add('drag');
  });
  el.addEventListener('dragend', function () { el.classList.remove('drag'); });
  return el;
}

/* the number that tells you what to pick next */
function paintBleed(el, s) {
  var box = el.querySelector('.c-bleed'); if (!box) return;
  var st = S.svc[s.id], r = rateOf(s);
  if (st.status === 'restored') { box.className = 'c-bleed done'; box.textContent = 'costing nothing'; return; }
  if (S.stage !== 'restore')    { box.className = 'c-bleed'; box.textContent = ''; return; }
  if (r > 0) { box.className = 'c-bleed hot'; box.textContent = 'costing ' + r + ' patients/day'; return; }
  var left = (st.since + tolDays(s) - S.day);
  box.className = 'c-bleed cool';
  box.textContent = left === Infinity ? 'no acute clock running'
    : 'starts costing in ' + (left * 24).toFixed(1) + ' h';
}

function paintBoard() {
  var bins = { down:$('#dDown'), red:$('#dRed'), amber:$('#dAmber'), green:$('#dGreen'), black:$('#dBlack') };
  for (var k in bins) bins[k].innerHTML = '';
  var n = { down:0, red:0, amber:0, green:0, black:0 };
  cardEls = {};

  D.services.forEach(function (s) {
    var st = S.svc[s.id], key = st.tag || 'down';
    var el = card(s);
    cardEls[s.id] = el;
    bins[key].appendChild(el); n[key]++;
  });
  $('#cDown').textContent  = n.down;
  $('#cRed').textContent   = n.red;
  $('#cAmber').textContent = n.amber;
  $('#cGreen').textContent = n.green;
  $('#cBlack').textContent = n.black;
  $('#startRestore').disabled = n.down > 0 || S.stage === 'restore';
  paintLane();
}

/* cheap per-frame refresh: no rebuild, so drag and open state survive */
function softBoard() {
  D.services.forEach(function (s) { if (cardEls[s.id]) paintBleed(cardEls[s.id], s); });
}

/* ── the lane ──────────────────────────────────────────────────── */
function paintLane() {
  if (S.stage !== 'restore') return;
  var L = S.lane;
  $('#laneName').textContent = L ? byId(L.id).name.replace(/&amp;/g, '&') : 'Idle';
  $('#laneName').classList.toggle('idle', !L);
  $('#laneBar').style.width = L ? (L.done / L.dur * 100).toFixed(1) + '%' : '0%';
  $('#laneDays').textContent = L
    ? (L.dur - L.done).toFixed(1) + ' days of validation left'
    : 'nobody is validating anything';

  $('#queue').innerHTML = S.queue.map(function (id, i) {
    return '<li data-q="' + id + '"><b>' + (i + 1) + '</b>' +
           byId(id).name.replace(/&amp;/g, '&') +
           '<span>' + ((byId(id).systems / CAP) * S.svc[id].mult).toFixed(1) + ' d</span></li>';
  }).join('') || '<li class="q-none">empty — the lane will stop when this one finishes</li>';

  var p = $('#prompt'), dep = S.svc.ad.status !== 'restored';
  var anyLeft = D.services.some(function (s) { return restorable(s.id); });
  p.hidden = false;
  if (!anyLeft && !L) { p.className = 'prompt'; p.textContent = 'Nothing left to restore. Count it.'; }
  else if (!L && dep) { p.className = 'prompt bad';
    p.textContent = S.queue.length
      ? 'The lane is waiting. Nothing in the queue can authenticate until identity and domain services is back.'
      : 'Nothing can be validated until identity and domain services is back. Queue it first.'; }
  else if (!L) { p.className = 'prompt bad';
    p.textContent = 'The lane is idle. Nobody is validating anything and the hospital is still bleeding. Queue something.'; }
  else if (!S.queue.length) { p.className = 'prompt warn';
    p.textContent = 'Queue is empty. When this finishes, the lane stops. Decide now, not then.'; }
  else { p.className = 'prompt';
    p.textContent = 'Validating ' + byId(L.id).name.replace(/&amp;/g, '&') + '. ' +
      S.queue.length + ' behind it.'; }
}

function toggleQueue(id) {
  if (S.over) return;
  var i = S.queue.indexOf(id);
  if (i >= 0) { S.queue.splice(i, 1); paintBoard(); return; }
  if (blockedBy(id)) return;
  S.queue.push(id);
  if (!S.lane) pullLane();
  paintBoard();
}

function pullLane() {
  for (var i = 0; i < S.queue.length; i++) {
    var id = S.queue[i];
    if (!restorable(id)) { S.queue.splice(i, 1); i--; continue; }
    if (!canStart(id)) continue;               // skip it, take the next one that can run
    S.queue.splice(i, 1);
    var s = byId(id);
    S.lane = { id: id, dur: (s.systems / CAP) * S.svc[id].mult, done: 0 };
    logLine(clk(S.day).t, 'Into the lane: <b style="font-weight:500;color:var(--bone)">' + s.name +
      '</b> — ' + s.systems + ' systems, ' + S.lane.dur.toFixed(1) + ' days of validation.', 'sys');
    return;
  }
  S.lane = null;
}

function completeLane() {
  var id = S.lane.id, s = byId(id), st = S.svc[id];
  st.status = 'restored'; st.mult = 1;
  S.order.push(id);
  Ward.setState(id, 'restored');
  logLine(clk(S.day).t, '<b style="font-weight:500;color:var(--pist)">' + s.name +
    '</b> validated and handed back to the wards. Harm from it stops here.', 'sys');
  S.lane = null;
  pullLane();
  paintBoard();
  maybeTwist();
}

/* nothing in the lane, nothing queued, nothing left that could be queued:
   the incident is over whichever way you got here — last restore, or last black tag */
function nothingLeft() {
  return !S.lane && !S.queue.length &&
         !D.services.some(function (x) { return restorable(x.id); });
}
function checkEnd() {
  if (S.over || S.stage !== 'restore' || !nothingLeft()) return false;
  logLine(clk(S.day).t, 'Nothing in the lane, nothing in the queue, nothing left that anyone ' +
    'is going to restore. That is the end of it.', 'sys');
  finish();
  return true;
}

/* ── the thing in the backup ───────────────────────────────────── */
function maybeTwist() {
  if (S.twist || S.order.length < 3) return;
  var victim = S.order[1];
  if (!victim) return;
  S.twist = victim;

  var st = S.svc[victim], s = byId(victim);
  st.status = 'down'; st.since = S.day; st.mult = 1.6; st.reinf = true;
  Ward.setState(victim, 'down'); Ward.shock(1.35);
  setRunning(false);

  logLine(clk(S.day).t, '<b style="font-weight:500;color:var(--rose)">' + s.name +
    ' is encrypting again.</b> The restore point was inside the nine days the group already had ' +
    'in the estate. The persistence came back with the data.', 'bad');

  toast('The backup', 'Your most recent clean restore point sits inside the dwell window, so everything ' +
    'restored from it has to be assumed dirty. ' + s.name + ' goes back on the board at 1.6&times; the ' +
    'cost, rebuilt from a copy older than the intrusion — or it takes a black tag like anything else.',
    [['Back to the board', function () { setRunning(true); }]]);
  paintBoard();
}

/* ── tagging ───────────────────────────────────────────────────── */
function tag(id, t, el) {
  var st = S.svc[id];
  if (st.status !== 'down') return;
  var was = st.tag;
  st.tag = t;

  if (t === 'black') {
    var qi = S.queue.indexOf(id); if (qi >= 0) S.queue.splice(qi, 1);
    dust(el);
    Ward.setState(id, 'black');
    sign(id);
    if (S.stage === 'restore')
      logLine(clk(S.day).t, 'Black tag: <b style="color:var(--gold);font-weight:500">' + byId(id).name +
        '</b>. Signed by Paul, countersigned by Dr. Mercier. It is not coming back.', 'sys');
  } else if (was === 'black') {
    Ward.setState(id, st.status === 'restored' ? 'restored' : 'down');
  }
  paintBoard();
  checkEnd();
}

/* powdered sugar. it is the only joke in the whole thing and it is not a joke. */
function dust(el) {
  if (!el) return;
  var r = el.getBoundingClientRect();
  for (var i = 0; i < 26; i++) {
    var p = document.createElement('i');
    p.className = 'dust';
    p.style.left = (r.left + Math.random() * r.width) + 'px';
    p.style.top  = (r.top + 8) + 'px';
    p.style.opacity = .3 + Math.random() * .6;
    document.body.appendChild(p);
    (function (node) {
      node.animate(
        [{ transform:'translateY(0)', opacity:.85 },
         { transform:'translateY(' + (r.height + 30 + Math.random() * 40) + 'px)', opacity:0 }],
        { duration: 900 + Math.random() * 900, easing:'cubic-bezier(.3,.7,.5,1)' }
      ).onfinish = function () { node.remove(); };
    })(p);
  }
}

/* ── the signed ledger (server side) ───────────────────────────── */
function sign(id) {
  var s = byId(id);
  fetch('blacktag.php?api=sign', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ service:id, clock: clk(S.day).label + ' ' + clk(S.day).t,
      basis: s.affected_day === 0
        ? 'no acute clinical dependency within the restore horizon'
        : 'clinical tolerance exceeds the achievable restore horizon' })
  }).catch(function () {});
}

/* ── toast with choices ────────────────────────────────────────── */
function toast(who, text, actions) {
  var t = $('#toast');
  t.hidden = false;
  t.innerHTML = '<b>' + who + '</b>' + text +
    '<div style="margin-top:15px;display:flex;gap:9px">' +
    actions.map(function (a, i) {
      return '<button class="ghost" data-i="' + i + '">' + a[0] + '</button>'; }).join('') + '</div>';
  t.onclick = function (ev) {
    var b = ev.target.closest('button'); if (!b) return;
    t.hidden = true;
    var fn = actions[+b.dataset.i][1]; if (fn) fn();
  };
}

/* ── the clock itself ──────────────────────────────────────────── */
function setRunning(on) {
  RT.running = on && !S.over;
  RT.last = performance.now();
  var b = $('#pause');
  b.textContent = RT.running ? 'Pause' : 'Run';
  b.classList.toggle('tb-run', RT.running);
  b.classList.toggle('tb-hold', !RT.running);
  $('.shell').classList.toggle('paused', !RT.running && S.stage === 'restore');
}
function setSpeed(v) {
  RT.speed = v;
  $$('.tb.sp').forEach(function (b) { b.classList.toggle('on', +b.dataset.sp === v); });
}

function tick(now) {
  requestAnimationFrame(tick);
  if (!RT.running || S.stage !== 'restore') { RT.last = now; return; }
  var dt = Math.min(0.2, (now - RT.last) / 1000);
  RT.last = now;
  var days = dt / SEC_PER_DAY * RT.speed * FAST;

  accrue(S.day, S.day + days);
  S.day += days;
  if (S.lane) {
    S.lane.done += days;
    if (S.lane.done >= S.lane.dur) { completeLane(); }
  }
  fireEvents();
  paintClock(); paintMeters(); paintLane(); softBoard();
  if (checkEnd()) return;

  if (S.day > 42 && !S.over) {                       // six weeks. that is the whole story.
    logLine(clk(S.day).t, 'Six weeks. Whatever is still down is not coming back on this incident.', 'sys');
    finish();
  }
}

/* ── stages ────────────────────────────────────────────────────── */
function go(stage) {
  S.stage = stage; reached[stage] = 1;
  $('.shell').dataset.stage = stage;
  $$('.stage').forEach(function (el) {
    el.classList.toggle('on', el.dataset.for.split(' ').indexOf(stage) >= 0);
  });
  $$('.rail-i').forEach(function (b) {
    var k = b.dataset.go;
    b.toggleAttribute('data-on', k === stage);
    b.toggleAttribute('data-done', !!reached[k] && k !== stage);
    b.disabled = !reached[k];
  });
  var live = stage === 'triage' || stage === 'restore' || stage === 'reckoning';
  $('#meters').hidden  = !live;
  $('#logwrap').hidden = !live;
  $('#lane').hidden    = stage !== 'restore';
  $('#prompt').hidden  = stage !== 'restore';
}

/* 02 — the adversary moment */
function impact() {
  go('impact');
  var order = D.services.slice().sort(function () { return Math.random() - .5; });
  var ul = $('#falling'); ul.innerHTML = '';
  var i = 0, head = $('#impNow');

  var iv = setInterval(function () {
    var s = order[i];
    var li = document.createElement('li');
    li.className = 'in';
    li.innerHTML = '<span class="fn">' + s.name + '</span><span class="fs">' + s.systems + ' systems encrypted</span>';
    ul.appendChild(li);
    Ward.setState(s.id, 'down');
    Ward.shock(.42);
    head.textContent = s.dept;
    S.day = 0.0005 * (i + 1);
    paintClock();
    if (++i >= order.length) {
      clearInterval(iv);
      head.textContent = D.total + ' systems. Eleven minutes.';
      S.day = 0.008;
      paintClock(true);
      $('#impFoot').hidden = false;
    }
  }, 340 / FAST);
}

/* 03 → 04 */
function startRestore() {
  accrue(S.day, 0.25);
  S.day = 0.25;
  go('restore');
  $('#boardOver').textContent = 'Restore';
  $('#boardTitle').textContent = 'Keep the lane full. The clock does not wait for you.';
  $('#boardSub').innerHTML = 'One service is validated at a time, because there is one Lou. ' +
    'Queue what comes next before the lane empties. Black is final.';
  $('#loadPlan').hidden = true;
  $('#startRestore').hidden = true;
  $('#stopHere').hidden = false;
  logLine('08:20', 'Six hours to agree the board. Dr. Mercier signs the black tags at 08:14 and asks ' +
    'to be told before any of them change.', 'sys');
  paintBoard(); paintMeters(); fireEvents();
  setSpeed(1); setRunning(true);
  paintClock(true);
}

/* 05 */
function finish() {
  if (S.over) return;
  S.over = true;
  setRunning(false);
  go('reckoning');

  var black = {};
  D.services.forEach(function (s) { if (S.svc[s.id].tag === 'black') black[s.id] = 1; });
  var plan = D.services.slice().sort(function (a, b) { return a.tier2019 - b.tier2019; })
                       .map(function (s) { return s.id; });
  var base = simulate(plan, {});
  var mine = { affected: S.affected, severe: S.severe, days: S.day };
  var max  = Math.max(base.affected, mine.affected);

  $('#race').innerHTML =
    row('mine', 'Your board', mine, max,
        Object.keys(black).length + ' services black-tagged · ' + S.order.length + ' restored · ' +
        mine.days.toFixed(1) + ' days') +
    row('plan', 'The 2019 disaster recovery plan', base, max,
        'All ' + D.services.length + ' services restored, in contract-value order · ' + base.days.toFixed(1) + ' days');

  var paid = D.services.filter(function (s) { return black[s.id]; });
  $('#reckNote').innerHTML = paid.length
    ? 'Nobody is going to restore ' + paid.map(function (s) { return s.name.toLowerCase(); }).join(', ') +
      '. That was a decision, it has two signatures on it, and it is the reason the rest came back ' +
      'when it did.<br><br>You were never going to get everyone back. The only question on the board ' +
      'was who waited, and whether anybody had signed for it.'
    : 'You black-tagged nothing, so you restored in the order the plan would have, slowly. ' +
      'That is a defensible choice. It is just not a decision.';

  $('#paid').innerHTML = paid.length
    ? '<div class="paid-h">What the black tags cost</div>' + paid.map(function (s) {
        return '<div class="paid-i"><div class="paid-n">' + s.name + '</div>' +
               '<div class="paid-c">' + s.cost + '</div></div>'; }).join('')
    : '';

  fetch('blacktag.php?api=ledger').then(function (r) { return r.json(); }).then(function (j) {
    $('#chainState').textContent = j.intact ? '· chain intact' : '· chain broken';
    $('#chainState').classList.toggle('bad', !j.intact);
    $('#led').innerHTML = j.chain.length ? j.chain.map(function (e) {
      return '<div class="led-i"><div class="led-n">' + e.name + '</div>' +
        '<div class="led-b">' + e.basis + '. ' + e.systems + ' systems. ' + e.clock + '.</div>' +
        '<div class="led-m">' + e.signed + ' · ' + e.counter + '<br>#' + e.seq +
        ' <b>' + String(e.hash).slice(0, 16) + '</b></div></div>';
    }).join('') : '<div class="led-none">No black tags were signed. Nothing here to review.</div>';
  }).catch(function () { $('#led').innerHTML = '<div class="led-none">Ledger unavailable.</div>'; });

  setTimeout(function () {
    $$('.rbar i').forEach(function (el) { el.style.width = el.dataset.w + '%'; });
  }, 120);

  function row(cls, title, r, max, detail) {
    return '<div class="rrow ' + cls + '"><div class="rrow-h"><span class="rrow-t">' + title + '</span>' +
      '<span class="rrow-v">' + Math.round(r.affected).toLocaleString('en') +
      '<small>affected &middot; ' + Math.round(r.severe) + ' time-critical</small></span></div>' +
      '<div class="rbar"><i data-w="' + (r.affected / max * 100).toFixed(1) + '"></i></div>' +
      '<div class="rrow-d">' + detail + '</div></div>';
  }
}

/* ── wiring ────────────────────────────────────────────────────── */
function boot() {
  reset();
  if (FLAT || !Ward.init(D.services)) { $('#ward').hidden = true; $('#wardfail').hidden = false; }
  go('brief');
  paintClock();
  setSpeed(1);

  $('#begin').onclick        = impact;
  $('#toTriage').onclick     = function () { go('triage'); paintBoard(); paintMeters(); };
  $('#startRestore').onclick = startRestore;
  $('#stopHere').onclick     = finish;
  $('#pause').onclick        = function () { setRunning(!RT.running); };
  $$('.tb.sp').forEach(function (b) { b.onclick = function () { setSpeed(+b.dataset.sp); }; });

  $('#loadPlan').onclick = function () {
    D.services.slice().sort(function (a, b) { return a.tier2019 - b.tier2019; })
      .forEach(function (s, i) { S.svc[s.id].tag = i < 5 ? 'red' : i < 10 ? 'amber' : 'green'; });
    paintBoard();
    toast('The 2019 plan', 'This is what the hospital already has. It ranks every system by vendor ' +
      'contract value and support SLA, which is why payroll sits above radiology. Nothing in it is ' +
      'black. Change it.', [['Understood', null]]);
  };
  $('#again').onclick = function () {
    fetch('blacktag.php?api=reset').catch(function(){}).finally(function () { location.reload(); });
  };

  $$('.rail-i').forEach(function (b) {
    b.onclick = function () {
      var k = b.dataset.go;
      if (k === 'triage' && reached.restore) k = 'restore';   // the board does not go backwards
      if (reached[k]) go(k);
    };
  });

  /* drag between columns, triage only */
  $$('.col').forEach(function (col) {
    var tagName = col.dataset.tag;
    col.addEventListener('dragover',  function (e) { e.preventDefault(); col.classList.add('over'); });
    col.addEventListener('dragleave', function () { col.classList.remove('over'); });
    col.addEventListener('drop', function (e) {
      e.preventDefault(); col.classList.remove('over');
      var id = e.dataTransfer.getData('text/plain'); if (!id) return;
      if (tagName === 'down') { S.svc[id].tag = null; paintBoard(); return; }
      tag(id, tagName, $('.card[data-id="' + id + '"]'));
    });
  });

  /* queue reordering by click-to-remove */
  $('#queue').addEventListener('click', function (e) {
    var li = e.target.closest('li[data-q]');
    if (li) toggleQueue(li.dataset.q);
  });

  /* the log is deliberately large enough to read from the back of the room,
     which costs board height — so it folds away on a keypress */
  function toggleLog() { $('.shell').classList.toggle('logmin'); }
  $('#logwrap').querySelector('header').onclick = toggleLog;

  /* drag the grip to size the log for whatever room you end up in */
  var shell = $('.shell'), grip = $('#logGrip'), drag = null;
  try {
    var saved = localStorage.getItem('bt.logh');
    if (saved) { shell.style.setProperty('--logh', saved); shell.classList.add('logsized'); }
  } catch (e) {}

  grip.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    grip.setPointerCapture(e.pointerId);
    drag = { y: e.clientY, h: $('#logwrap').getBoundingClientRect().height };
    shell.classList.add('logdrag');
  });
  grip.addEventListener('pointermove', function (e) {
    if (!drag) return;
    var h = Math.max(72, Math.min(innerHeight * 0.75, drag.h + (drag.y - e.clientY)));
    shell.classList.remove('logmin');
    shell.classList.add('logsized');
    shell.style.setProperty('--logh', Math.round(h) + 'px');
  });
  function endDrag() {
    if (!drag) return;
    drag = null;
    shell.classList.remove('logdrag');
    try { localStorage.setItem('bt.logh', shell.style.getPropertyValue('--logh')); } catch (e) {}
  }
  grip.addEventListener('pointerup', endDrag);
  grip.addEventListener('pointercancel', endDrag);
  grip.addEventListener('dblclick', function () {
    shell.classList.remove('logsized', 'logmin');
    shell.style.removeProperty('--logh');
    try { localStorage.removeItem('bt.logh'); } catch (e) {}
  });

  addEventListener('keydown', function (e) {
    if (e.target.tagName === 'INPUT') return;
    if (e.code === 'Space' && S.stage === 'restore') { e.preventDefault(); setRunning(!RT.running); }
    if (e.key === 'l' || e.key === 'L') toggleLog();
  });

  requestAnimationFrame(tick);
}

window.BTstate = function () { return { S: S, RT: RT }; };

document.readyState === 'loading' ? addEventListener('DOMContentLoaded', boot) : boot();
})();
