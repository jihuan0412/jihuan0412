// 밸런스 시뮬레이션: 단순한 봇이 1배속으로 60분 플레이했을 때의 성장 곡선.
// 실행: node sim/simulate.js [판 수]
// 화면 탭(작업 독려)은 쓰지 않는다 → 실제 플레이어보다 약간 느린 기준선.
'use strict';
const path = require('path');
require(path.join(__dirname, '..', 'engine.js'));
const E = globalThis.Engine;

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function botMove(s) {
  // 같은 지역 다음 단계 집이 열렸고, 이사비 + 석 달 월세를 감당할 수 있으면 이사
  const list = E.housesOf(s.region), i = list.indexOf(s.house), next = list[i + 1];
  if (!next) return;
  const H = E.HOUSES[next];
  if (E.canMove(s, next).ok && s.money > E.moveCost(s, next) + H.rent) E.moveHouse(s, next);
}
function botAI(s) {
  // AI 위주: 열린 가장 높은 요금제로 올리고, 크레딧이 되면 파이프라인을 AI로
  for (let p = E.AI_PLANS.length - 1; p > s.ai.plan; p--) if (s.subs >= E.AI_PLANS[p].unlock && s.money > E.AI_PLANS[p].monthly * 3) { E.setAIPlan(s, p); break; }
  const mix = s._style === 'mix' ? ['ai', 'self', 'ai'] : ['ai', 'ai', 'ai'];
  for (let i = 0; i < 3; i++) s.pipeline[i] = mix[i];
}
function saving(s) {
  const list = E.housesOf(s.region), next = list[list.indexOf(s.house) + 1];
  if (!next || s.subs < E.HOUSES[next].unlock) return 0;
  return E.moveCost(s, next) + E.HOUSES[next].rent;
}
function botBuy(s) {
  if (s.money < saving(s)) return;      // 이사할 돈을 모으는 중
  // 루틴 먼저, 그다음 가장 싼 다음 아이템 (여유 자금 20% 남김), 그다음 싼 반복 업그레이드
  if (!s.routine.unlocked && s.money >= E.ROUTINE_PRICE * 1.2) E.buyRoutine(s);
  for (let guard = 0; guard < 5; guard++) {
    const c = E.cheapestNext(s);
    let best = c ? { kind: 'equip', k: c.k, price: c.price } : null;
    for (const k in E.SKILLS) {
      if (s.skills[k] >= E.SKILLS[k].max) continue;
      const p = E.skillCost(s, k);
      if (!best || p < best.price) best = { kind: 'skill', k, price: p };
    }
    if (!best || s.money < best.price * 1.2) return;
    if (best.kind === 'equip') E.buyEquip(s, best.k); else E.buySkill(s, best.k);
  }
}

function botLife(s) {
  // 생활 챙기는 봇: 배고프면 집밥, 더러우면 씻기, 기분 처지면 산책. 'neglect' 봇은 자동(라면·샤워)만 쓴다
  if (s._life === 'neglect' || E.lifeBusy(s)) return;
  const L = s.life;
  if (L.hunger < 45 && s.money > 5000 && E.canLifeAct(s, 'cook').ok) return E.lifeAct(s, 'cook', true);
  if (L.clean < 35 && E.canLifeAct(s, 'shower').ok) return E.lifeAct(s, 'shower', true);
  if (L.mood < 50 && E.canLifeAct(s, 'walk').ok) return E.lifeAct(s, 'walk', true);
  for (const k of ['coffee', 'robot']) if (!L.svc[k] && s.subs >= E.LIFE_SERVICES[k].unlock && s.money > E.LIFE_SERVICES[k].price * 3) E.buyService(s, k);
}
function play(pack, seed, minutes, region, style, genre, life) {
  const s = E.newGame({ pack, genre: genre || 'info', region: region || 'city', trait: 'planner', rng: mulberry32(seed) });
  s._style = style || 'self'; s._life = life || 'care';
  const dtReal = 0.5, marks = { 5: null, 15: null, 30: null, 60: null };
  let firstUploadSec = null;
  for (let t = 0; t < minutes * 60; t += dtReal) {
    if (s.pendingEvent) E.resolveEvent(s, 0);
    if (s.uploadReady && !s.routine.on) E.upload(s, E.bestThumbIdx(s));
    if (!s.routine.on && E.canWork(s) && !s.resting) {
      if (s.stamina < 50) s.resting = true; else E.startVideo(s, E.bestCardIdx(s));
    }
    botLife(s);
    if (s._style !== 'self') botAI(s);
    botBuy(s);
    if (!s.job && !s.uploadReady) botMove(s);
    E.advance(s, dtReal * E.ghPerRealSec(), dtReal);
    if (firstUploadSec === null && (s.stats_videos || 0) >= 1) firstUploadSec = t;
    const m = (t + dtReal) / 60;
    if (m in marks && marks[m] === null) marks[m] = { cond: E.lifeScore(s), subs: s.subs, money: s.money, q: E.baseQuality(s), vids: s.stats_videos || 0, mon: s.monetized, house: s.house };
  }
  return { marks, firstUploadSec, firstViews: s.firstVideoV || 0 };
}

const N = +process.argv[2] || 20;
const median = a => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
const mode = a => { const c = {}; a.forEach(x => c[x] = (c[x] || 0) + 1); return Object.entries(c).sort((x, y) => y[1] - x[1])[0][0]; };
console.log(`판 수 ${N}, 1배속, 탭 없음, 특성=기획력. 값은 중앙값.`);
const row = (label, runs) => {
  const cols = [5, 15, 30, 60].map(m => `${m}분 ${E.fmt(median(runs.map(r => r.marks[m].subs)))}명`);
  const q60 = median(runs.map(r => r.marks[60].q)).toFixed(0);
  const house = E.HOUSES[mode(runs.map(r => r.marks[60].house))].name;
  console.log(`${label.padEnd(20)} | ${cols.join(' | ')} | 60분 품질 ${q60}, 집 ${house}, 돈 ${E.fmt(median(runs.map(r => r.marks[60].money)))}`);
};
console.log('— 생활 챙기기 (도시, 무료 시작)');
for (const lf of ['care', 'neglect']) { const runs = []; for (let i = 0; i < N; i++) runs.push(play('free', 1000 + i, 60, 'city', 'self', 'info', lf)); row(lf === 'care' ? '잘 챙김' : '자동만(방치)', runs); console.log('   60분 컨디션 중앙값', median(runs.map(r => r.marks[60].cond)).toFixed(0)); }
console.log('— 지역별 (무료 시작)');
for (const region of Object.keys(E.REGIONS)) { const runs = []; for (let i = 0; i < N; i++) runs.push(play('free', 1000 + i, 60, region)); row(region, runs); }
console.log('— 시작 세트별 (도시)');
for (const pack of E.START_SETS.slice(1)) { const runs = []; for (let i = 0; i < N; i++) runs.push(play(pack, 1000 + i, 60, 'city')); row(pack, runs); }
console.log('— 제작 방식별 (도시, 무료 시작)');
for (const style of ['ai', 'mix']) { const runs = []; for (let i = 0; i < N; i++) runs.push(play('free', 1000 + i, 60, 'city', style)); row(style === 'ai' ? '전부 AI' : '기획·편집만 AI', runs); }
console.log('— 장르별 (도시, 무료 시작)');
for (const g of Object.keys(E.GENRES)) { const runs = []; for (let i = 0; i < N; i++) runs.push(play('free', 1000 + i, 60, 'city', 'self', g)); row(E.GENRES[g].name, runs); }
