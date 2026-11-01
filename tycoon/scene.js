/* 방 안 장면 (캔버스 픽셀 그림). 그림 파일 없이 코드로 그린다.
 * 게임 상태 S를 읽어서 캐릭터 위치·행동, 보유 장비, 낮밤을 그린다. 상태를 바꾸지 않는다.
 */
(function (root) {
  'use strict';
  const W = 240, H = 168, K = 3;          // 논리 해상도 × 배율
  let cv, ctx, t = 0;
  const P = { x: 120, y: 100, tx: 120, ty: 100, face: 1, walk: 0, wanderAt: 0, visible: true };
  const npcs = [];                          // 택배·외주 편집자
  const floats = [];                        // 떠오르는 글자
  let flash = 0, lastEquipSig = '', lastIncome = null, lastSubs = null, lastVid = 0, floatAcc = 0, accMoney = 0, accSubs = 0;

  // 위치
  const SPOT = {
    desk: { x: 44, y: 66 }, film: { x: 192, y: 70 }, bed: { x: 30, y: 126 }, door: { x: 86, y: 52 },
    side: { x: 112, y: 132 }, center: { x: 120, y: 100 },
  };

  function init(canvas) {
    cv = canvas;
    cv.width = W * K; cv.height = H * K;
    ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;
  }

  // ───────── 그리기 도구 ─────────
  function r(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x) * K, Math.round(y) * K, Math.round(w) * K, Math.round(h) * K); }
  function txt(s, x, y, size, c, align) {
    ctx.font = `bold ${size * K}px -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`;
    ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.65)'; ctx.strokeText(s, x * K, y * K);
    ctx.fillStyle = c; ctx.fillText(s, x * K, y * K);
  }
  function bubble(s, x, y) {
    ctx.font = `bold ${6 * K}px -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`;
    const w = ctx.measureText(s).width / K + 6;
    const bx = Math.max(2, Math.min(W - w - 2, x - w / 2));
    r(bx, y - 9, w, 10, '#fff'); r(x - 1, y + 1, 3, 2, '#fff');
    ctx.fillStyle = '#111'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(s, (bx + w / 2) * K, (y - 4) * K);
  }

  // 사람: (x,y)는 발 위치
  function person(x, y, o) {
    const f = o.frame || 0, sit = o.sit, lie = o.lie;
    const skin = '#f2c9a0', hair = o.hair || '#2b1d14', shirt = o.shirt || '#e94b4b', pants = o.pants || '#2f3b59';
    if (lie) {
      r(x - 8, y - 4, 4, 4, skin); r(x - 8, y - 5, 4, 2, hair);
      r(x - 4, y - 4, 10, 4, shirt);
      return;
    }
    const bob = (!sit && o.moving) ? (f % 2) : 0;
    const top = y - 15 - bob + (sit ? 3 : 0);
    // 다리
    if (sit) { r(x - 3, y - 4, 6, 2, pants); }
    else if (o.moving) { r(x - 3, y - 5, 2, 5 - (f % 2), pants); r(x + 1, y - 5, 2, 4 + (f % 2), pants); }
    else { r(x - 3, y - 5, 2, 5, pants); r(x + 1, y - 5, 2, 5, pants); }
    // 몸
    r(x - 4, top + 6, 8, 6, shirt);
    // 팔 (타자: 번갈아)
    if (o.typing) { r(x - 5, top + 7 + (f % 2), 2, 3, skin); r(x + 3, top + 8 - (f % 2), 2, 3, skin); }
    else if (o.talk) { r(x - 5, top + 7, 2, 4, shirt); r(x + 4, top + 5 + (f % 2), 2, 3, skin); }
    else { r(x - 5, top + 7, 1, 5, shirt); r(x + 4, top + 7, 1, 5, shirt); }
    // 머리
    r(x - 3, top, 6, 6, skin);
    r(x - 3, top - 1, 6, 2, hair);
    if (o.back) r(x - 3, top, 6, 4, hair);
    else { r(x - 2 + (o.face < 0 ? 0 : 1), top + 3, 1, 1, '#222'); r(x + (o.face < 0 ? 0 : 1), top + 3, 1, 1, '#222'); }
    if (o.cap) r(x - 4, top - 1, 8, 2, o.cap);
  }

  // ───────── 방 ─────────
  function sky(hour) {
    if (hour < 5 || hour >= 21) return ['#0b1330', '#1a2550', true];
    if (hour < 7) return ['#f7a072', '#5b6fa8', false];
    if (hour < 17) return ['#7cc3ff', '#bfe4ff', false];
    if (hour < 19) return ['#ff9a5a', '#ffd08a', false];
    return ['#3a2a5c', '#7a4f7a', false];
  }

  function drawRoom(S) {
    const e = S.equip, space = e.space;
    const wallC = ['#d9cdb8', '#4b5160', '#3a3f5a', '#2c3350'][space];
    const floorA = ['#b98e5e', '#a77f55', '#8a6a4c', '#6f5a48'][space], floorB = ['#ad8355', '#9c754c', '#806244', '#665241'][space];
    // 벽·바닥
    r(0, 0, W, 50, wallC); r(0, 48, W, 2, '#00000033');
    for (let y = 50, row = 0; y < H; y += 8, row++) for (let x = -16, col = 0; x < W; x += 16, col++) r(x + (row % 2) * 8, y, 16, 8, (col + row) % 2 ? floorA : floorB);
    // 창문 (낮밤)
    const hour = S.gh % 24, [s1, s2, night] = sky(hour);
    r(118, 8, 40, 28, '#e8e2d6'); r(120, 10, 36, 24, s1); r(120, 22, 36, 12, s2);
    if (night) { for (let i = 0; i < 7; i++) r(122 + (i * 13) % 32, 11 + (i * 7) % 10, 1, 1, '#fff'); r(146, 13, 4, 4, '#f5f1c8'); }
    else if (hour >= 7 && hour < 17) r(146, 13, 5, 5, '#fff3a0');
    r(137, 10, 2, 24, '#e8e2d6'); r(120, 21, 36, 2, '#e8e2d6');
    if (space >= 1) { r(114, 6, 6, 32, '#8c2f39'); r(156, 6, 6, 32, '#8c2f39'); }
    // 문
    r(76, 14, 20, 35, '#7a5230'); r(78, 16, 16, 31, '#8d6038'); r(91, 32, 2, 2, '#e0c060');
    if (S.job && S.job.partTime) { r(79, 22, 14, 6, '#fff'); ctx.fillStyle = '#c00'; txt('알바중', 86, 25, 4, '#d22'); }
    // 흡음재
    if (space >= 1) for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) r(4 + i * 8, 10 + j * 8, 7, 7, (i + j) % 2 ? '#2a2d3a' : '#383c4d');
    // 촬영 배경천 / 네온
    if (space >= 2) { r(168, 6, 48, 42, '#20b2aa'); r(170, 8, 44, 38, '#27c4bb'); txt('▶ ' + (S.channel || '').slice(0, 6), 192, 27, 5, '#fff'); }
    if (space >= 3) { r(222, 10, 14, 14, '#111'); txt('ON AIR', 229, 17, 3, '#ff4b6e'); }
    // 수료증
    let cx = 30;
    for (const k of ['edu_edit', 'edu_thumb', 'edu_plan', 'edu_growth', 'edu_mentor']) if (e[k]) { r(cx, 8, 8, 10, '#c9a84a'); r(cx + 1, 9, 6, 8, '#fffbe8'); r(cx + 2, 12, 4, 1, '#999'); cx += 10; }
    // 실버 버튼
    if (S.subs >= 100000) { r(100, 4, 12, 14, '#666'); r(101, 5, 10, 12, '#d8dde3'); r(104, 9, 4, 4, '#c33'); }
    // 러그·화분·소파
    if (space >= 2) { r(80, 92, 70, 34, '#7b3f61'); r(83, 95, 64, 28, '#8f4b72'); r(224, 46, 10, 10, '#a0522d'); r(222, 34, 14, 13, '#2e8b57'); }
    if (space >= 3) { r(150, 140, 50, 18, '#4a5d8a'); r(150, 134, 50, 8, '#5b70a0'); }
    // 헬스 덤벨
    if (S.skills.fitness) { r(60, 150, 10, 2, '#555'); r(58, 148, 3, 6, '#333'); r(69, 148, 3, 6, '#333'); }
  }

  function drawDesk(S, now) {
    const e = S.equip, pcLv = e.ram + e.ssd + e.cpu + e.gpu;
    // 책상
    r(12, 44, 64, 6, '#8b5a2b'); r(12, 50, 64, 3, '#6d4520'); r(14, 53, 3, 14, '#6d4520'); r(71, 53, 3, 14, '#6d4520');
    const editing = S.job && !S.job.partTime && S.job.stage === 2 && !S.job.outsource;
    const screen = (x, y, w, h) => {
      r(x, y, w, h, '#1c1f26'); r(x + 1, y + 1, w - 2, h - 2, editing ? '#1e2a3a' : '#2a3550');
      if (editing) { for (let i = 0; i < 3; i++) r(x + 2, y + 3 + i * 3, ((now * 20 + i * 7) % (w - 6)) + 2, 2, ['#ff6b6b', '#4da3ff', '#3ccf7a'][i]); }
      else if (S.job && !S.job.partTime && S.job.stage === 0) { r(x + 2, y + 3, w - 6, 1, '#ddd'); r(x + 2, y + 6, w - 9, 1, '#ddd'); r(x + 2, y + 9, w - 7, 1, '#ddd'); }
    };
    if (pcLv === 0) { r(28, 38, 20, 2, '#9aa0a6'); screen(30, 28, 16, 11); }
    else {
      screen(26, 24, 24, 16); r(36, 40, 4, 4, '#333'); r(32, 43, 12, 1, '#333');
      if (e.gpu >= 2) { screen(51, 26, 16, 14); r(57, 40, 3, 4, '#333'); }
      // 본체
      r(64, 30, 9, 14, '#222'); r(65, 31, 7, 12, '#2d2d33');
      if (e.gpu >= 1) { const hue = (now * 120) % 360; r(66, 33, 5, 1, `hsl(${hue},90%,60%)`); r(66, 38, 5, 1, `hsl(${(hue + 120) % 360},90%,60%)`); }
    }
    // 마이크
    if (e.mic === 1) { r(18, 36, 3, 6, '#333'); r(17, 42, 5, 2, '#555'); }
    if (e.mic === 2) { r(14, 26, 1, 18, '#444'); r(14, 26, 8, 1, '#444'); r(21, 26, 4, 7, '#222'); }
    // 의자
    r(38, 64, 12, 3, '#333'); r(43, 67, 2, 5, '#555');
  }

  function drawFilm(S, now) {
    const e = S.equip, j = S.job;
    const shooting = j && !j.partTime && j.stage === 1;
    // 의자
    r(186, 66, 12, 3, '#7a4a2a'); r(191, 69, 2, 4, '#5a3a20');
    // 조명
    if (e.light === 1) { r(212, 72, 1, 30, '#444'); ctx.beginPath(); ctx.strokeStyle = shooting ? '#fff8d0' : '#bbb'; ctx.lineWidth = 2 * K; ctx.arc(212.5 * K, 68 * K, 6 * K, 0, Math.PI * 2); ctx.stroke(); }
    if (e.light === 2) for (const lx of [168, 214]) { r(lx, 72, 1, 30, '#444'); r(lx - 5, 60, 11, 12, shooting ? '#fffbe0' : '#d8d8d8'); r(lx - 5, 60, 11, 2, '#333'); }
    // 카메라 (삼각대)
    const cx = 192, cy = 104;
    r(cx - 4, cy, 1, 12, '#333'); r(cx + 3, cy, 1, 12, '#333'); r(cx, cy, 1, 12, '#333');
    if (e.camera === 0) r(cx - 3, cy - 6, 7, 5, '#222');
    else if (e.camera === 1) { r(cx - 5, cy - 7, 10, 7, '#222'); r(cx - 2, cy - 10, 4, 3, '#444'); }
    else { r(cx - 7, cy - 9, 14, 9, '#111'); r(cx - 3, cy - 13, 6, 4, '#333'); r(cx + 5, cy - 12, 4, 3, '#555'); }
    if (shooting && Math.floor(now * 2) % 2) r(cx + 3, cy - 5, 2, 2, '#ff2d2d');
    // 침대
    r(8, 112, 46, 40, '#5a4a8a'); r(10, 114, 42, 36, '#e9e4f5'); r(12, 116, 14, 8, '#fff'); r(10, 128, 42, 22, '#6c7fd8');
  }

  // ───────── 캐릭터 상태 ─────────
  function playerTask(S) {
    const j = S.job;
    if (S.gh < S.burnoutUntil) return { at: 'bed', lie: true, say: '😵', burn: true };
    if (S.pendingEvent) return { at: null, say: '❗' };
    if (S.resting) return { at: 'bed', lie: true, say: 'z z z' };
    if (j && j.partTime) return { at: 'door', hide: true };
    if (j) {
      if (j.stage === 0) return { at: 'desk', sit: true, typing: true, say: '💡 기획 중' };
      if (j.stage === 1) return { at: 'film', sit: true, talk: true, say: ['여러분 안녕하세요!', '오늘 알려드릴 건…', '구독 좋아요!'][Math.floor(t / 2.5) % 3] };
      if (j.outsource) return { at: null, say: '☕' };
      return { at: 'desk', sit: true, typing: true, say: '✂️ 편집 중' };
    }
    if (S.uploadReady) return { at: 'desk', sit: true, say: '썸네일 골라 주세요!' };
    return { at: null };
  }

  function moveToward(o, dt, speed) {
    const dx = o.tx - o.x, dy = o.ty - o.y, d = Math.hypot(dx, dy);
    if (d < 0.8) { o.x = o.tx; o.y = o.ty; return false; }
    const s = Math.min(d, speed * dt);
    o.x += dx / d * s; o.y += dy / d * s;
    if (Math.abs(dx) > 0.5) o.face = dx > 0 ? 1 : -1;
    return true;
  }

  // ───────── 이벤트 감지 (상태 변화 → 연출) ─────────
  function watch(S, dt) {
    const sig = JSON.stringify(S.equip);
    if (lastEquipSig && sig !== lastEquipSig) npcs.push({ kind: 'courier', x: SPOT.door.x, y: SPOT.door.y, tx: 120, ty: 96, phase: 0, face: 1, walk: 0, t: 0 });
    lastEquipSig = sig;
    if (lastIncome === null) { lastIncome = S.totalIncome; lastSubs = S.subs; lastVid = S.videoSeq; }
    accMoney += S.totalIncome - lastIncome; accSubs += S.subs - lastSubs;
    lastIncome = S.totalIncome; lastSubs = S.subs;
    floatAcc += dt;
    if (floatAcc > 1.1) {
      floatAcc = 0;
      if (accMoney >= 1) floats.push({ s: '+₩' + root.Engine.fmt(accMoney), x: 138 + Math.random() * 10, y: 40, c: '#ffd34d', life: 1.6 });
      if (accSubs >= 1) floats.push({ s: '+' + root.Engine.fmt(accSubs) + ' 구독', x: 150 + Math.random() * 20, y: 54, c: '#ff7aa8', life: 1.6 });
      accMoney = 0; accSubs = 0;
    }
    if (S.videoSeq !== lastVid) {
      const v = S.videos[0];
      lastVid = S.videoSeq;
      if (v) {
        floats.push({ s: '📤 업로드!', x: 44, y: 30, c: '#fff', life: 1.8, size: 7 });
        if (v.viral) { flash = 1.2; floats.push({ s: '🔥 바이럴!', x: W / 2, y: 70, c: '#ff5d3a', life: 2.5, size: 12 }); }
      }
    }
    // 외주 편집자
    const out = S.job && !S.job.partTime && S.job.stage === 2 && S.job.outsource;
    let ed = npcs.find(n => n.kind === 'editor');
    if (out && !ed) npcs.push(ed = { kind: 'editor', x: SPOT.door.x, y: SPOT.door.y, tx: SPOT.side.x, ty: SPOT.side.y, face: 1, walk: 0 });
    if (!out && ed && !ed.leaving) { ed.leaving = true; ed.tx = SPOT.door.x; ed.ty = SPOT.door.y; }
  }

  function updateNpcs(dt) {
    for (let i = npcs.length - 1; i >= 0; i--) {
      const n = npcs[i];
      n.moving = moveToward(n, dt, 40);
      if (n.moving) n.walk += dt * 8;
      if (n.kind === 'courier') {
        if (!n.moving && n.phase === 0) { n.t += dt; if (n.t > 0.8) { n.phase = 1; n.tx = SPOT.door.x; n.ty = SPOT.door.y; floats.push({ s: '📦 도착!', x: n.x, y: n.y - 22, c: '#fff', life: 1.4 }); } }
        else if (!n.moving && n.phase === 1) npcs.splice(i, 1);
      } else if (n.kind === 'editor' && n.leaving && !n.moving) npcs.splice(i, 1);
    }
  }

  // ───────── 프레임 ─────────
  function frame(S, dt, speed) {
    if (!ctx || !S) return;
    t += dt;
    watch(S, dt);
    const task = playerTask(S);
    if (task.at) { P.tx = SPOT[task.at].x; P.ty = SPOT[task.at].y; }
    else if (t > P.wanderAt) { P.wanderAt = t + 2 + Math.random() * 3; P.tx = 90 + Math.random() * 70; P.ty = 80 + Math.random() * 50; }
    const walkSpeed = 65 * Math.min(2, Math.sqrt(speed || 1));
    P.moving = moveToward(P, dt, walkSpeed);
    if (P.moving) P.walk += dt * 8;
    const arrived = !P.moving;
    P.visible = !(task.hide && arrived);
    updateNpcs(dt);

    ctx.clearRect(0, 0, cv.width, cv.height);
    drawRoom(S);
    drawDesk(S, t);
    drawFilm(S, t);
    // 외주 테이블
    if (npcs.some(n => n.kind === 'editor')) { r(100, 122, 26, 4, '#9a6a3a'); r(102, 126, 2, 8, '#7a5230'); r(122, 126, 2, 8, '#7a5230'); r(108, 116, 10, 6, '#c0c4cc'); }

    // 깊이 정렬해서 사람 그리기
    const people = [];
    if (P.visible) people.push({ y: P.y, draw: () => {
      const tf = Math.floor(P.walk) + (arrived && (task.typing || task.talk) ? Math.floor(t * 6) : 0);
      const o = { frame: tf, moving: P.moving, face: P.face, shirt: task.burn ? '#777' : '#e94b4b',
        sit: arrived && task.sit, lie: arrived && task.lie, typing: arrived && task.typing, talk: arrived && task.talk, back: arrived && task.at === 'desk' };
      person(P.x, P.y, o);
    } });
    for (const n of npcs) people.push({ y: n.y, draw: () => {
      if (n.kind === 'courier') { person(n.x, n.y, { frame: Math.floor(n.walk), moving: n.moving, face: n.face, shirt: '#3b7d3b', cap: '#2d5e2d' }); if (n.phase === 0) r(n.x - 4, n.y - 12, 8, 6, '#c8975a'); }
      else person(n.x, n.y, { frame: Math.floor(n.walk) + (n.moving ? 0 : Math.floor(t * 6)), moving: n.moving, face: n.face, shirt: '#5a6fd8', hair: '#c9a86a', sit: !n.moving, typing: !n.moving });
    } });
    people.sort((a, b) => a.y - b.y).forEach(p => p.draw());

    // 밤 조명
    const hour = S.gh % 24;
    if (hour < 6 || hour >= 20) { ctx.fillStyle = 'rgba(10,15,40,.28)'; ctx.fillRect(0, 0, cv.width, cv.height); }

    // 말풍선
    if (P.visible && arrived && task.say) bubble(task.say, P.x, P.y - (task.lie ? 10 : 18));
    if (task.burn && arrived) { r(P.x - 8, P.y - 26, 16, 5, '#888'); r(P.x - 5, P.y - 29, 10, 4, '#999'); }

    // 떠오르는 글자
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i];
      f.life -= dt; f.y -= dt * 12;
      if (f.life <= 0) { floats.splice(i, 1); continue; }
      ctx.globalAlpha = Math.min(1, f.life);
      txt(f.s, f.x, f.y, f.size || 6, f.c);
      ctx.globalAlpha = 1;
    }
    if (flash > 0) { flash -= dt; ctx.fillStyle = `rgba(255,200,80,${Math.max(0, flash) * 0.35})`; ctx.fillRect(0, 0, cv.width, cv.height); }
  }

  function tapFx(x, y) {
    if (floats.filter(f => f.tap).length > 4) return;
    floats.push({ s: '+작업!', x: x + (Math.random() - 0.5) * 24, y: y + (Math.random() - 0.5) * 10, c: '#ffe066', life: 0.6, size: 5, tap: true });
  }
  function toLogical(clientX, clientY) {
    const b = cv.getBoundingClientRect();
    return { x: (clientX - b.left) / b.width * W, y: (clientY - b.top) / b.height * H };
  }

  root.Scene = { init, frame, tapFx, toLogical };
})(window);
