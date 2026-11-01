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

function botBuy(s) {
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

function play(pack, seed, minutes) {
  const s = E.newGame({ pack, trait: 'planner', rng: mulberry32(seed) });
  const dtReal = 0.5, marks = { 5: null, 15: null, 30: null, 60: null };
  let firstUploadSec = null;
  for (let t = 0; t < minutes * 60; t += dtReal) {
    if (s.pendingEvent) E.resolveEvent(s, 0);
    if (s.uploadReady && !s.routine.on) E.upload(s, E.bestThumbIdx(s));
    if (!s.routine.on && E.canWork(s) && !s.resting) {
      if (s.stamina < 50) s.resting = true; else E.startVideo(s, E.bestCardIdx(s));
    }
    botBuy(s);
    E.advance(s, dtReal * E.ghPerRealSec(), dtReal);
    if (firstUploadSec === null && (s.stats_videos || 0) >= 1) firstUploadSec = t;
    const m = (t + dtReal) / 60;
    if (m in marks && marks[m] === null) marks[m] = { subs: s.subs, money: s.money, q: E.baseQuality(s), vids: s.stats_videos || 0, mon: s.monetized };
  }
  return { marks, firstUploadSec, firstViews: s.firstVideoV || 0 };
}

const N = +process.argv[2] || 20;
const median = a => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
console.log(`판 수 ${N}, 1배속, 탭 없음, 특성=기획력. 값은 중앙값.`);
for (const pack of E.START_SETS) {
  const runs = [];
  for (let i = 0; i < N; i++) runs.push(play(pack, 1000 + i, 60));
  const row = [5, 15, 30, 60].map(m => `${m}분 ${E.fmt(median(runs.map(r => r.marks[m].subs)))}명`);
  const q60 = median(runs.map(r => r.marks[60].q)).toFixed(0);
  const v60 = median(runs.map(r => r.marks[60].vids));
  const monAt30 = runs.filter(r => r.marks[30].mon).length;
  console.log(`${pack.padEnd(13)} | ${row.join(' | ')} | 60분 품질 ${q60}, 영상 ${v60}편 | 30분에 수익화 ${monAt30}/${N} | 첫 영상 조회 ${E.fmt(median(runs.map(r => r.firstViews)))}`);
}
