/* 방 안 장면 v2 — 전체 화면 캔버스, 코드로 그리는 픽셀 그림.
 * 게임 상태 S를 읽기만 한다. 위치는 논리 좌표(가로 약 200)로 계산하고 정수 배율로 확대해 픽셀이 선명하게 보이게 한다.
 */
(function (root) {
  'use strict';
  let cv, ctx, s = 2, W = 200, H = 400, t = 0;
  let L = {};                                 // 배치 (화면 크기에 따라 계산)
  const P = { x: 100, y: 260, tx: 100, ty: 260, face: 'down', walk: 0, wanderAt: 0, moving: false };
  const npcs = [], floats = [], parts = [];
  let insetCss = 140;                         // 위쪽 정보창이 덮는 높이 (CSS px)
  let flash = 0, lastEquipSig = '', lastIncome = null, lastSubs = null, lastVid = 0, floatAcc = 0, accMoney = 0, accSubs = 0, blinkAt = 2;

  // ───────── 크기·배치 ─────────
  function setInset(px) { if (Math.abs(px - insetCss) > 2) { insetCss = px; resize(); } }
  function init(canvas) { cv = canvas; ctx = cv.getContext('2d'); resize(); window.addEventListener('resize', resize); }
  function resize() {
    if (!cv) return;
    const cw = cv.clientWidth || window.innerWidth, ch = cv.clientHeight || window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    s = Math.max(2, Math.round(cw * dpr / 200));
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    W = Math.ceil(cv.width / s); H = Math.ceil(cv.height / s);
    const top = Math.round(insetCss / (cw / W));   // 위쪽 정보창 아래 (논리 px)
    const FT = Math.min(top + 60, Math.round(H * 0.46)); // 바닥 시작선
    L = {
      top, FT, bottom: H - 42,
      desk: { x: 10, y: FT - 4, w: 78 },
      win: { x: Math.round(W / 2) - 10, y: FT - 58, w: 40, h: 34 },
      door: { x: W - 34, y: FT - 50, w: 24, h: 50 },
      film: { x: W - 62, y: FT + 54 },
      bed: { x: 8, y: Math.max(FT + 96, Math.min(H - 112, FT + 128)), w: 56, h: 64 },
    };
    L.spot = {
      desk: { x: 46, y: FT + 42 }, film: { x: L.film.x + 24, y: L.film.y + 34 },
      bed: { x: L.bed.x + 22, y: L.bed.y + 22 }, door: { x: L.door.x + 12, y: FT + 6 },
      side: { x: Math.round(W / 2) - 8, y: FT + 104 },
    };
    ctx.imageSmoothingEnabled = false;
  }

  // ───────── 그리기 도구 ─────────
  const R = Math.round;
  function rect(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(R(x) * s, R(y) * s, R(w) * s, R(h) * s); }
  function poly(pts, c) { ctx.fillStyle = c; ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x * s, y * s) : ctx.moveTo(x * s, y * s)); ctx.closePath(); ctx.fill(); }
  function oval(x, y, rx, ry, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(x * s, y * s, rx * s, ry * s, 0, 0, Math.PI * 2); ctx.fill(); }
  // 윗면·앞면이 있는 상자 (x,y = 윗면 왼쪽 위)
  function box(x, y, w, d, h, top, front, line) {
    rect(x - 1, y - 1, w + 2, d + h + 2, line || '#2a1d14');
    rect(x, y, w, d, top); rect(x, y + d, w, h, front);
    rect(x, y + d, w, 1, 'rgba(255,255,255,.12)');
  }
  function shadow(x, y, rx, ry) { oval(x, y, rx, ry || rx * 0.35, 'rgba(0,0,0,.22)'); }
  function shade(c, k) { // 색 밝기 조절 (#rrggbb)
    const n = parseInt(c.slice(1), 16), f = v => Math.max(0, Math.min(255, R(v * k)));
    return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => f(v).toString(16).padStart(2, '0')).join('');
  }
  function label(str, x, y, size, color, bg) {
    ctx.font = `800 ${size * s}px -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (bg) {
      const w = ctx.measureText(str).width / s + 8, h = size + 5;
      ctx.fillStyle = bg; roundRect(x - w / 2, y - h / 2, w, h, 4); ctx.fill();
    } else { ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.strokeText(str, x * s, y * s); }
    ctx.fillStyle = color; ctx.fillText(str, x * s, y * s);
  }
  function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x * s, y * s, w * s, h * s, r * s); }
  function bubble(str, x, y) {
    ctx.font = `800 ${6 * s}px -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`;
    const w = ctx.measureText(str).width / s + 10, h = 12;
    const bx = Math.max(3, Math.min(W - w - 3, x - w / 2)), by = y - h - 4;
    ctx.fillStyle = 'rgba(0,0,0,.25)'; roundRect(bx + 1, by + 1.5, w, h, 5); ctx.fill();
    ctx.fillStyle = '#fff'; roundRect(bx, by, w, h, 5); ctx.fill();
    poly([[x - 3, by + h - 0.5], [x + 3, by + h - 0.5], [x, by + h + 4]], '#fff');
    ctx.fillStyle = '#1b1f2a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(str, (bx + w / 2) * s, (by + h / 2 + 0.5) * s);
  }

  // ───────── 사람 ─────────
  // 부위 목록을 외곽선 → 채움 두 번 그려서 테두리를 만든다
  function person(x, y, o) {
    const skin = o.skin || '#f3c9a1', skinD = shade(skin, 0.85), hair = o.hair || '#2b1d14';
    const shirt = o.shirt || '#e5484d', shirtD = shade(shirt, 0.78), pants = o.pants || '#30406b', shoe = '#22252d';
    const f = o.frame || 0, step = o.moving ? [0, 1, 0, -1][f % 4] : 0;
    const back = o.dir === 'up';
    const side = !o.lie && !o.sit && (o.dir === 'left' || o.dir === 'right');
    const blink = o.blink;
    x = R(x); y = R(y);
    if (!o.lie) shadow(x, y, 8, 2.6);
    const P2 = [];
    const add = (px, py, w, h, c) => P2.push([px, py, w, h, c]);
    if (side) {
      // 오른쪽을 보는 모습으로 만든 뒤, 왼쪽이면 x를 거울처럼 뒤집는다
      const st = o.moving ? [0, 1, 0, -1][f % 4] : 0;
      const ty = y - 17 - (o.moving && f % 2 ? 1 : 0);
      add(x - 2 - st * 2, y - 8, 3, 6, shade(pants, 0.8)); add(x - 2 - st * 2, y - 2, 4, 2, shoe);   // 뒷다리
      add(x - 2 + st * 2, y - 8, 3, 6, pants); add(x - 2 + st * 2, y - 2, 5, 2, shoe);               // 앞다리
      add(x - 4, ty + 1, 8, 9, shirt); add(x - 4, ty + 1, 2, 9, shirtD);                               // 몸통
      if (o.box) { add(x + 2, ty + 2, 9, 9, '#c9975b'); add(x + 2, ty + 2, 9, 2, '#dcae74'); add(x + 3, ty + 4, 3, 2, skin); }
      else { add(x - 1 + st * 2, ty + 2, 3, 7, shade(shirt, 0.9)); add(x - 1 + st * 2, ty + 9, 3, 2, skin); } // 팔
      const hy = ty - 10;
      add(x - 4, hy, 9, 10, skin);                                                                    // 머리
      add(x - 5, hy - 1, 8, 4, hair); add(x - 5, hy, 3, 8, hair); add(x + 3, hy - 1, 2, 2, hair);    // 머리카락(뒤·위)
      if (blink) add(x + 2, hy + 5, 2, 1, '#2a2a2a'); else add(x + 2, hy + 4, 2, 2, '#2a2a2a');      // 눈
      add(x + 5, hy + 5, 1, 2, skinD);                                                                // 코
      add(x + 1, hy + 7, 2, 1, '#f29b9b');                                                            // 볼
      if (o.cap) { add(x - 5, hy - 2, 10, 3, o.cap); add(x + 4, hy, 4, 1, shade(o.cap, 0.7)); }
      if (o.dir === 'left') for (const p of P2) p[0] = 2 * x - p[0] - p[2];
    } else if (o.lie) {
      add(x - 14, y - 7, 9, 8, skin); add(x - 14, y - 8, 9, 4, hair); add(x - 15, y - 7, 2, 6, hair);
      if (!back) { add(x - 10, y - 4, 1, 1, '#2a2a2a'); }
    } else {
      const sit = o.sit, by = sit ? y - 4 : y;
      // 다리·신발
      if (sit) { add(x - 5, by - 3, 4, 3, pants); add(x + 1, by - 3, 4, 3, pants); add(x - 5, by, 4, 2, shoe); add(x + 1, by, 4, 2, shoe); }
      else {
        add(x - 5, by - 8 + Math.max(0, step), 4, 7 - Math.max(0, step), pants); add(x + 1, by - 8 + Math.max(0, -step), 4, 7 - Math.max(0, -step), pants);
        add(x - 5, by - 2, 4, 2, shoe); add(x + 1, by - 2, 4, 2, shoe);
      }
      const ty = by - 17 - (o.moving && f % 2 ? 1 : 0);
      // 몸통
      add(x - 6, ty + 1, 12, 9, shirt); add(x + 3, ty + 1, 3, 9, shirtD);
      if (!back) add(x - 2, ty + 1, 4, 2, shade(shirt, 1.2));
      // 팔
      const sw = o.moving ? step : 0;
      if (o.typing) { const a = (f % 2); add(x - 8, ty + 2, 3, 5, shirt); add(x + 5, ty + 2, 3, 5, shirtD); add(x - 7 + a, ty + 7, 3, 2, skin); add(x + 4 - a, ty + 7, 3, 2, skin); }
      else if (o.talk) { add(x - 8, ty + 2, 3, 7, shirt); add(x - 8, ty + 9, 3, 2, skin); add(x + 5, ty - 1 + (f % 2), 3, 5, shirtD); add(x + 5, ty - 3 + (f % 2), 3, 2, skin); }
      else { add(x - 8, ty + 2 + sw, 3, 7, shirt); add(x - 8, ty + 9 + sw, 3, 2, skin); add(x + 5, ty + 2 - sw, 3, 7, shirtD); add(x + 5, ty + 9 - sw, 3, 2, skin); }
      // 머리
      const hy = ty - 10;
      add(x - 5, hy, 10, 10, skin); add(x + 3, hy + 1, 2, 9, skinD);
      if (back) { add(x - 5, hy - 1, 10, 9, hair); }
      else {
        add(x - 5, hy - 1, 10, 4, hair); add(x - 6, hy, 2, 6, hair); add(x + 4, hy, 2, 5, hair);
        if (blink) { add(x - 3, hy + 6, 2, 1, '#2a2a2a'); add(x + 1, hy + 6, 2, 1, '#2a2a2a'); }
        else { add(x - 3, hy + 5, 2, 2, '#2a2a2a'); add(x + 1, hy + 5, 2, 2, '#2a2a2a'); }
        add(x - 4, hy + 8, 2, 1, '#f29b9b'); add(x + 2, hy + 8, 2, 1, '#f29b9b');
        if (o.talk && f % 2) add(x - 1, hy + 8, 2, 2, '#7a2b2b');
      }
      if (o.cap) { add(x - 6, hy - 2, 12, 3, o.cap); add(x - 6, hy + 1, 14, 1, shade(o.cap, 0.7)); }
      if (o.box) { add(x - 7, ty + 2, 14, 9, '#c9975b'); add(x - 7, ty + 2, 14, 2, '#dcae74'); add(x - 1, ty + 2, 2, 9, '#a8783f'); }
    }
    const line = 'rgba(24,18,22,.9)';
    for (const [px, py, w, h] of P2) rect(px - 1, py - 1, w + 2, h + 2, line);
    for (const [px, py, w, h, c] of P2) rect(px, py, w, h, c);
  }

  // ───────── 시간대 ─────────
  function timeOf(gh) {
    const h = gh % 24;
    if (h < 5 || h >= 21) return { k: 'night', sky: ['#0a1030', '#1c2a5c'], amb: '#5d6db0', beam: 0 };
    if (h < 8) return { k: 'dawn', sky: ['#f6a27a', '#7d8fd0'], amb: '#ffd9c2', beam: 0.5 };
    if (h < 16) return { k: 'day', sky: ['#69bdfc', '#c8e8ff'], amb: '#ffffff', beam: 1 };
    if (h < 19) return { k: 'dusk', sky: ['#ff8b55', '#ffcf8a'], amb: '#ffc9a0', beam: 0.7 };
    return { k: 'eve', sky: ['#3a2a68', '#8d5a88'], amb: '#9a8ec8', beam: 0 };
  }

  // ───────── 방 ─────────
  function drawRoom(S, tm) {
    const e = S.equip, sp = e.space, FT = L.FT;
    const wall = ['#e8dcc6', '#566079', '#43496a', '#2f3654'][sp];
    const wallD = shade(wall, 0.9), floorA = ['#c8975f', '#b9895a', '#9c7452', '#7d6250'][sp], floorB = shade(floorA, 0.92);
    // 뒷벽 (줄무늬 벽지)
    rect(0, 0, W, FT, wall);
    for (let x = 0; x < W; x += 8) rect(x, 0, 4, FT, wallD);
    rect(0, FT - 5, W, 5, shade(wall, 0.7)); rect(0, FT - 5, W, 1, shade(wall, 1.15));
    // 바닥 (원목 마루, 원근감 있게 아래로 갈수록 판이 넓어짐)
    rect(0, FT, W, H - FT, floorA);
    let y = FT, row = 0;
    while (y < H) {
      const ph = 6 + Math.floor(row / 3);
      rect(0, y, W, 1, shade(floorA, 0.8));
      const off = (row * 17) % 30;
      for (let x = -off; x < W; x += 30) rect(x, y, 1, ph, shade(floorA, 0.82));
      if (row % 2) rect(0, y + 1, W, ph - 1, floorB);
      y += ph; row++;
    }
    // 옆벽 (원근)
    poly([[0, 0], [8, 0], [8, FT - 5], [0, FT + 30]], shade(wall, 0.75));
    poly([[W, 0], [W - 8, 0], [W - 8, FT - 5], [W, FT + 30]], shade(wall, 0.75));
    // 창문
    const w = L.win;
    rect(w.x - 3, w.y - 3, w.w + 6, w.h + 8, '#efe9dc'); rect(w.x - 4, w.y + w.h + 3, w.w + 8, 3, '#d6cdb9');
    const g = ctx.createLinearGradient(0, w.y * s, 0, (w.y + w.h) * s); g.addColorStop(0, tm.sky[0]); g.addColorStop(1, tm.sky[1]);
    ctx.fillStyle = g; ctx.fillRect(w.x * s, w.y * s, w.w * s, w.h * s);
    if (tm.k === 'night' || tm.k === 'eve') { for (let i = 0; i < 9; i++) rect(w.x + 2 + (i * 11) % (w.w - 4), w.y + 2 + (i * 7) % (w.h - 10), 1, 1, '#fff'); oval(w.x + w.w - 9, w.y + 8, 3.5, 3.5, '#f4f0c6'); }
    else if (tm.k === 'day') { oval(w.x + w.w - 10, w.y + 8, 4, 4, '#fff6b0'); oval(w.x + 10, w.y + 18, 7, 3, 'rgba(255,255,255,.85)'); oval(w.x + 16, w.y + 17, 5, 3, 'rgba(255,255,255,.85)'); }
    // 먼 건물
    for (let i = 0; i < 4; i++) rect(w.x + i * 10, w.y + w.h - 8 - (i % 2) * 4, 9, 8 + (i % 2) * 4, tm.k === 'night' ? '#141a35' : 'rgba(60,70,110,.45)');
    rect(w.x + w.w / 2 - 1, w.y, 2, w.h, '#efe9dc'); rect(w.x, w.y + w.h / 2 - 1, w.w, 2, '#efe9dc');
    if (sp >= 1) { rect(w.x - 9, w.y - 6, 8, w.h + 12, '#9b3440'); rect(w.x + w.w + 1, w.y - 6, 8, w.h + 12, '#9b3440'); rect(w.x - 9, w.y - 6, 8, 2, '#c24a57'); rect(w.x + w.w + 1, w.y - 6, 8, 2, '#c24a57'); rect(w.x - 11, w.y - 8, w.w + 22, 2, '#555'); }
    // 문
    const d = L.door;
    rect(d.x - 2, d.y - 2, d.w + 4, d.h + 2, '#5a3a22'); rect(d.x, d.y, d.w, d.h, '#8a5b34');
    rect(d.x + 3, d.y + 4, d.w - 6, 16, '#7a4e2c'); rect(d.x + 3, d.y + 24, d.w - 6, 20, '#7a4e2c'); oval(d.x + d.w - 5, d.y + 27, 1.5, 1.5, '#e8c45a');
    if (S.job && S.job.partTime) label('알바 중', d.x + d.w / 2, d.y + 13, 5, '#fff', '#d6453d');
    // 흡음재
    if (sp >= 1) for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) { rect(12 + i * 9, FT - 54 + j * 9, 8, 8, (i + j) % 2 ? '#2b2f3e' : '#3a3f53'); rect(12 + i * 9, FT - 54 + j * 9, 8, 1, '#4a5068'); }
    // 수료증 액자
    let cx = 52;
    for (const k of ['edu_edit', 'edu_thumb', 'edu_plan', 'edu_growth', 'edu_mentor']) if (e[k]) { rect(cx, FT - 56, 9, 11, '#b48a3a'); rect(cx + 1, FT - 55, 7, 9, '#fffaf0'); rect(cx + 2, FT - 52, 5, 1, '#999'); rect(cx + 2, FT - 50, 4, 1, '#bbb'); oval(cx + 6, FT - 47.5, 1.2, 1.2, '#d33'); cx += 11; }
    // 실버 버튼
    if (S.subs >= 100000) { rect(L.win.x + L.win.w + 14, FT - 54, 14, 16, '#3d3d3d'); rect(L.win.x + L.win.w + 15, FT - 53, 12, 14, '#dfe4ea'); poly([[L.win.x + L.win.w + 19, FT - 49], [L.win.x + L.win.w + 19, FT - 43], [L.win.x + L.win.w + 24, FT - 46]], '#e33'); }
    // 스튜디오: 네온
    if (sp >= 3) { label('ON AIR', L.door.x - 22, FT - 46, 5, '#ff5c7a', 'rgba(20,10,20,.85)'); }
    // 걸레받이 그림자
    rect(8, FT, W - 16, 2, 'rgba(0,0,0,.12)');
  }

  function sunbeam(S, tm) {
    if (!tm.beam) return;
    const h = S.gh % 24, w = L.win, FT = L.FT;
    const skew = (h - 12) * -6;
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.16 * tm.beam;
    poly([[w.x, w.y + w.h], [w.x + w.w, w.y + w.h], [w.x + w.w + skew + 20, FT + 80], [w.x + skew - 20, FT + 80]], tm.k === 'dusk' ? '#ffb070' : '#fff3c4');
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    // 먼지
    for (let i = 0; i < 8; i++) {
      const px = w.x + ((i * 37 + t * 4) % (w.w + 20)) - 5 + skew * ((i % 5) / 5), py = w.y + w.h + ((i * 23 + t * 6) % 70);
      rect(px, py, 1, 1, 'rgba(255,250,220,.6)');
    }
  }

  function drawDesk(S) {
    const e = S.equip, D = L.desk, pcLv = e.ram + e.ssd + e.cpu + e.gpu, j = S.job;
    const editing = j && !j.partTime && j.stage === 2 && !j.outsource, planning = j && !j.partTime && j.stage === 0;
    // 책상 다리 + 상판
    shadow(D.x + D.w / 2, D.y + 32, D.w / 2 + 4, 4);
    rect(D.x + 3, D.y + 12, 4, 20, '#5b3a20'); rect(D.x + D.w - 7, D.y + 12, 4, 20, '#5b3a20');
    box(D.x, D.y, D.w, 8, 5, '#a8713f', '#7c4f2b');
    // 화면
    const screen = (x, y, w, h) => {
      rect(x - 1, y - 1, w + 2, h + 2, '#15171d'); rect(x, y, w, h, editing || planning ? '#1d2840' : '#22314f');
      if (editing) { for (let i = 0; i < 3; i++) rect(x + 2, y + 3 + i * 3, ((t * 14 + i * 9) % (w - 6)) + 2, 2, ['#ff6b6b', '#4da3ff', '#3ccf7a'][i]); rect(x + 2 + (t * 9) % (w - 4), y + 1, 1, h - 2, '#fff'); }
      else if (planning) { for (let i = 0; i < 4; i++) rect(x + 2, y + 2 + i * 3, w - 5 - (i * 3) % 7, 1, '#d8dde8'); }
      else { rect(x + 2, y + 2, w - 4, h - 4, '#2c4170'); rect(x + w / 2 - 2, y + h / 2 - 2, 4, 4, '#e5484d'); }
    };
    if (pcLv === 0) { rect(D.x + 26, D.y - 2, 22, 3, '#a7adb5'); poly([[D.x + 28, D.y - 2], [D.x + 46, D.y - 2], [D.x + 44, D.y - 16], [D.x + 30, D.y - 16]], '#888d95'); screen(D.x + 31, D.y - 15, 12, 10); }
    else {
      rect(D.x + 34, D.y - 6, 4, 6, '#2a2c33'); rect(D.x + 29, D.y - 1, 14, 2, '#2a2c33');
      screen(D.x + 22, D.y - 24, 28, 18);
      if (e.gpu >= 2) { rect(D.x + 57, D.y - 5, 3, 5, '#2a2c33'); screen(D.x + 51, D.y - 21, 16, 15); }
      // 본체
      box(D.x + D.w - 14, D.y - 20, 11, 3, 19, '#3a3d46', '#26282f', '#111');
      if (e.gpu >= 1) { const hu = (t * 90) % 360; rect(D.x + D.w - 12, D.y - 14, 7, 1, `hsl(${hu},90%,62%)`); rect(D.x + D.w - 12, D.y - 8, 7, 1, `hsl(${(hu + 140) % 360},90%,62%)`); oval(D.x + D.w - 8.5, D.y - 4, 2, 2, `hsl(${(hu + 60) % 360},80%,55%)`); }
      // 키보드
      rect(D.x + 24, D.y + 2, 22, 3, '#2d3038'); rect(D.x + 25, D.y + 2, 20, 1, '#4a4f5c');
    }
    // 머그컵 + 김
    rect(D.x + 6, D.y - 4, 5, 5, '#f2f2f2'); rect(D.x + 11, D.y - 3, 2, 2, '#f2f2f2'); rect(D.x + 7, D.y - 4, 3, 1, '#6b3e1e');
    for (let i = 0; i < 2; i++) { const k = (t * 0.8 + i * 0.5) % 1; rect(D.x + 8 + Math.sin(t * 3 + i) * 1.2, D.y - 6 - k * 8, 1, 2, `rgba(255,255,255,${0.5 * (1 - k)})`); }
    // 마이크
    if (e.mic === 1) { rect(D.x + 16, D.y - 9, 3, 7, '#333'); rect(D.x + 14, D.y - 2, 7, 2, '#555'); rect(D.x + 16, D.y - 9, 3, 2, '#666'); }
    if (e.mic === 2) { rect(D.x + 4, D.y - 30, 1, 28, '#555'); rect(D.x + 4, D.y - 30, 12, 1, '#555'); rect(D.x + 14, D.y - 30, 5, 9, '#1d1d1d'); rect(D.x + 14, D.y - 30, 5, 2, '#444'); }
    // 의자
    const cx = L.spot.desk.x;
    shadow(cx, L.FT + 46, 9, 2.5);
    rect(cx - 1, L.FT + 38, 2, 7, '#444'); rect(cx - 7, L.FT + 45, 14, 1, '#333');
    box(cx - 8, L.FT + 31, 16, 4, 3, '#3b3f4b', '#2b2e37', '#15161b');
  }

  function drawChairBack(S) { // 앉아 있을 때 의자 등받이가 몸 앞으로 오게
    const cx = L.spot.desk.x;
    const y = L.spot.desk.y;
    rect(cx - 1, y - 6, 2, 4, '#2b2e37');                                   // 등받이 기둥
    box(cx - 7, y - 12, 14, 2, 5, '#4d5262', '#3a3e4b', '#15161b');          // 낮은 등받이 (허리 높이)
  }

  function drawFilm(S) {
    const e = S.equip, F = L.film, j = S.job, sp = e.space;
    const shooting = j && !j.partTime && j.stage === 1;
    // 배경천 (홈 스튜디오 이상)
    if (sp >= 2) {
      rect(F.x - 2, F.y - 34, 2, 46, '#333'); rect(F.x + 50, F.y - 34, 2, 46, '#333'); rect(F.x - 2, F.y - 36, 54, 2, '#333');
      rect(F.x, F.y - 34, 50, 40, '#1fa69c'); rect(F.x, F.y - 34, 50, 3, '#28c2b6');
      label('▶ ' + (S.channel || '').slice(0, 5), F.x + 25, F.y - 16, 5, '#fff');
    }
    // 화분
    if (sp >= 2) { box(W - 22, L.FT - 4, 10, 3, 9, '#b3653a', '#8f4f2c'); oval(W - 17, L.FT - 12, 8, 7, '#2f8f55'); oval(W - 20, L.FT - 16, 5, 5, '#3caa66'); oval(W - 13, L.FT - 15, 4, 4, '#3caa66'); }
    // 의자(스툴)
    const cx = L.spot.film.x;
    shadow(cx, L.spot.film.y + 1, 8, 2.4);
    rect(cx - 5, L.spot.film.y - 5, 2, 6, '#5a3a20'); rect(cx + 3, L.spot.film.y - 5, 2, 6, '#5a3a20');
    box(cx - 7, L.spot.film.y - 9, 14, 3, 2, '#9b6a3e', '#744a28');
    // 조명
    const lights = e.light === 1 ? [[cx + 22, 0]] : e.light === 2 ? [[cx - 26, 1], [cx + 24, 1]] : [];
    for (const [lx, type] of lights) {
      const ly = L.spot.film.y + 16;
      shadow(lx, ly + 1, 6, 2);
      rect(lx, ly - 30, 1, 30, '#3a3a3a'); rect(lx - 4, ly, 9, 1, '#3a3a3a');
      if (type === 0) { ctx.strokeStyle = shooting ? '#fff8d8' : '#c9c9c9'; ctx.lineWidth = 2.5 * s; ctx.beginPath(); ctx.arc(lx * s + s / 2, (ly - 36) * s, 7 * s, 0, Math.PI * 2); ctx.stroke(); }
      else { box(lx - 6, ly - 44, 13, 2, 12, '#333', shooting ? '#fffbe6' : '#dcdcdc', '#111'); }
    }
    // 삼각대 카메라 (의자를 바라봄)
    const tx = cx, ty = L.spot.film.y + 40;
    shadow(tx, ty + 12, 8, 2.4);
    poly([[tx, ty], [tx - 7, ty + 12], [tx - 6, ty + 12]], '#2d2d2d'); poly([[tx, ty], [tx + 7, ty + 12], [tx + 6, ty + 12]], '#2d2d2d'); rect(tx, ty, 1, 12, '#2d2d2d');
    if (e.camera === 0) { rect(tx - 4, ty - 8, 9, 7, '#1d1d22'); rect(tx - 3, ty - 7, 7, 5, '#3a4a6a'); }
    else if (e.camera === 1) { box(tx - 6, ty - 10, 13, 3, 7, '#3a3d46', '#22242a', '#0b0b0d'); oval(tx + 0.5, ty - 3, 3, 2, '#111'); rect(tx - 3, ty - 13, 6, 3, '#2b2d33'); }
    else { box(tx - 8, ty - 13, 17, 3, 10, '#2f3138', '#1b1c20', '#000'); rect(tx + 6, ty - 17, 6, 4, '#3a3d46'); rect(tx - 7, ty - 16, 4, 3, '#555'); oval(tx + 0.5, ty - 3, 4, 2.4, '#0b0b0b'); }
    if (shooting && Math.floor(t * 2) % 2) oval(tx + 5, ty - 9, 1.3, 1.3, '#ff2d2d');
  }

  function drawBed(S, lying) {
    const B = L.bed;
    shadow(B.x + B.w / 2, B.y + B.h + 2, B.w / 2 + 4, 4);
    box(B.x, B.y, B.w, 8, 6, '#6e4a2c', '#553620');                // 머리판
    rect(B.x - 1, B.y + 13, B.w + 2, B.h - 12, '#2a1d14');
    rect(B.x, B.y + 14, B.w, B.h - 14, '#f1ecf7');                 // 매트리스
    rect(B.x + 4, B.y + 16, 18, 10, '#ffffff'); rect(B.x + 4, B.y + 24, 18, 2, '#d9d3e6');   // 베개
    const by = B.y + (lying ? 24 : 30);
    rect(B.x, by, B.w, B.y + B.h - by, '#5d72d6'); rect(B.x, by, B.w, 3, '#7b8ee6');          // 이불
    for (let i = 0; i < 4; i++) rect(B.x + 6 + i * 13, by + 8, 6, 6, '#6e82e0');
    rect(B.x, B.y + B.h - 2, B.w, 2, '#4559b8');
  }

  function drawDecor(S) {
    const sp = S.equip.space, FT = L.FT;
    // 러그
    if (sp >= 2) { const rx = W / 2 - 38, ry = FT + 86; oval(W / 2, ry + 18, 44, 18, '#7c3d63'); oval(W / 2, ry + 18, 39, 15, '#93507a'); oval(W / 2, ry + 18, 30, 11, '#7c3d63'); }
    // 소파
    if (sp >= 3) { const x = W - 74, y = L.bed.y + 20; shadow(x + 32, y + 30, 36, 4); box(x, y, 64, 6, 14, '#5b70a8', '#475a8c'); box(x, y + 6, 64, 10, 10, '#6a80bb', '#52669c'); box(x - 4, y + 2, 8, 12, 14, '#5b70a8', '#475a8c'); box(x + 60, y + 2, 8, 12, 14, '#5b70a8', '#475a8c'); }
    // 덤벨
    if (S.skills.fitness) { const x = 76, y = L.bed.y + 52; rect(x, y, 12, 2, '#666'); rect(x - 2, y - 2, 3, 6, '#2b2b2b'); rect(x + 11, y - 2, 3, 6, '#2b2b2b'); }
  }

  function drawSideTable() {
    const x = L.spot.side.x - 18, y = L.spot.side.y - 18;
    shadow(x + 18, y + 22, 18, 3);
    rect(x + 2, y + 6, 2, 14, '#6b4325'); rect(x + 32, y + 6, 2, 14, '#6b4325');
    box(x, y, 36, 5, 3, '#b07a47', '#87592f');
    rect(x + 12, y - 2, 12, 3, '#b6bcc6'); poly([[x + 13, y - 2], [x + 23, y - 2], [x + 22, y - 10], [x + 14, y - 10]], '#9aa1ad');
  }

  // ───────── 캐릭터 상태 ─────────
  function playerTask(S) {
    const j = S.job;
    if (S.gh < S.burnoutUntil) return { at: 'bed', lie: true, say: '😵 번아웃…', burn: true };
    if (S.pendingEvent) return { at: null, say: '❗' };
    if (S.resting) return { at: 'bed', lie: true, say: 'Zzz' };
    if (j && j.partTime) return { at: 'door', hide: true };
    if (j) {
      if (j.stage === 0) return { at: 'desk', sit: true, typing: true, dir: 'up', say: '💡 기획 중' };
      if (j.stage === 1) return { at: 'film', sit: true, talk: true, say: ['여러분 안녕하세요!', '오늘 알려드릴 건요…', '구독·좋아요 부탁해요!'][Math.floor(t / 2.5) % 3] };
      if (j.outsource) return { at: null, say: '☕ 외주 맡김' };
      return { at: 'desk', sit: true, typing: true, dir: 'up', say: '✂️ 편집 중' };
    }
    if (S.uploadReady) return { at: 'desk', sit: true, dir: 'up', say: '📤 썸네일 고르기!' };
    return { at: null };
  }

  function moveToward(o, dt, speed) {
    const dx = o.tx - o.x, dy = o.ty - o.y, d = Math.hypot(dx, dy);
    if (d < 0.8) { o.x = o.tx; o.y = o.ty; return false; }
    const st = Math.min(d, speed * dt);
    o.x += dx / d * st; o.y += dy / d * st;
    o.dir = Math.abs(dx) > Math.abs(dy) * 0.8 ? (dx > 0 ? 'right' : 'left') : (dy < 0 ? 'up' : 'down');
    return true;
  }

  // ───────── 상태 변화 감지 → 연출 ─────────
  function watch(S, dt) {
    const sig = JSON.stringify(S.equip) + S.skills.fitness;
    if (lastEquipSig && sig !== lastEquipSig) {
      npcs.push({ kind: 'courier', x: L.spot.door.x, y: L.spot.door.y, tx: W / 2, ty: L.FT + 70, phase: 0, walk: 0, t: 0 });
      sparkle(W / 2, L.FT + 40, 14);
    }
    lastEquipSig = sig;
    if (lastIncome === null) { lastIncome = S.totalIncome; lastSubs = S.subs; lastVid = S.videoSeq; }
    accMoney += S.totalIncome - lastIncome; accSubs += S.subs - lastSubs;
    lastIncome = S.totalIncome; lastSubs = S.subs;
    floatAcc += dt;
    if (floatAcc > 1.2) {
      floatAcc = 0;
      const wx = L.win.x + L.win.w / 2;
      if (accMoney >= 1) floats.push({ str: '+₩' + root.Engine.fmt(accMoney), x: wx - 14 + Math.random() * 8, y: L.win.y + 10, c: '#3a2a00', bg: '#ffd84d', life: 1.8 });
      if (accSubs >= 1) floats.push({ str: '♥ +' + root.Engine.fmt(accSubs), x: wx + 16 + Math.random() * 8, y: L.win.y + 22, c: '#fff', bg: '#ff4f7b', life: 1.8 });
      accMoney = 0; accSubs = 0;
    }
    if (S.videoSeq !== lastVid) {
      const v = S.videos[0]; lastVid = S.videoSeq;
      if (v) {
        floats.push({ str: '📤 업로드 완료!', x: L.spot.desk.x + 10, y: L.desk.y - 34, c: '#fff', bg: '#2f6fed', life: 2 });
        if (v.viral) { flash = 1.4; sparkle(W / 2, H / 2, 30); floats.push({ str: '🔥 바이럴!', x: W / 2, y: H / 2 - 20, c: '#fff', bg: '#ff5a2c', life: 2.6, size: 12 }); }
      }
    }
    const out = S.job && !S.job.partTime && S.job.stage === 2 && S.job.outsource;
    let ed = npcs.find(n => n.kind === 'editor');
    if (out && !ed) npcs.push(ed = { kind: 'editor', x: L.spot.door.x, y: L.spot.door.y, tx: L.spot.side.x, ty: L.spot.side.y + 10, walk: 0 });
    if (!out && ed && !ed.leaving) { ed.leaving = true; ed.tx = L.spot.door.x; ed.ty = L.spot.door.y; }
  }
  function sparkle(x, y, n) { for (let i = 0; i < n; i++) parts.push({ x, y, vx: (Math.random() - 0.5) * 60, vy: -Math.random() * 50 - 10, life: 0.8 + Math.random() * 0.5, c: ['#ffe066', '#fff', '#7ee0ff', '#ff8fb1'][i % 4] }); }

  function updateNpcs(dt) {
    for (let i = npcs.length - 1; i >= 0; i--) {
      const n = npcs[i];
      n.moving = moveToward(n, dt, 55);
      if (n.moving) n.walk += dt * 9;
      if (n.kind === 'courier') {
        if (!n.moving && n.phase === 0) { n.t += dt; if (n.t > 0.9) { n.phase = 1; n.tx = L.spot.door.x; n.ty = L.spot.door.y; floats.push({ str: '📦 배송 완료', x: n.x, y: n.y - 36, c: '#3a2a00', bg: '#ffd84d', life: 1.4 }); } }
        else if (!n.moving && n.phase === 1) npcs.splice(i, 1);
      } else if (n.kind === 'editor' && n.leaving && !n.moving) npcs.splice(i, 1);
    }
  }

  // ───────── 프레임 ─────────
  function frame(S, dt, speed) {
    if (!ctx || !S) return;
    if (cv.clientWidth && Math.abs(cv.width - R(cv.clientWidth * (window.devicePixelRatio || 1))) > 2) resize();
    t += dt;
    watch(S, dt);
    const task = playerTask(S);
    if (task.at) { P.tx = L.spot[task.at].x; P.ty = L.spot[task.at].y; }
    else if (t > P.wanderAt) { P.wanderAt = t + 2.5 + Math.random() * 3; P.tx = 70 + Math.random() * (W - 140); P.ty = L.FT + 60 + Math.random() * 60; }
    P.moving = moveToward(P, dt, 70 * Math.min(2, Math.sqrt(speed || 1)));
    if (P.moving) P.walk += dt * 10;
    const arrived = !P.moving;
    if (t > blinkAt) blinkAt = t + 2.5 + Math.random() * 2;
    const blink = blinkAt - t > 2.35 && !P.moving;
    const tm = timeOf(S.gh);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    drawRoom(S, tm);
    sunbeam(S, tm);
    drawDecor(S);

    // 깊이 정렬: 가구와 사람을 발 y 기준으로
    const items = [];
    const lying = arrived && task.lie;
    items.push({ y: L.desk.y + 30, draw: () => drawDesk(S) });
    items.push({ y: L.spot.film.y - 2, draw: () => drawFilm(S) });
    items.push({ y: L.bed.y + 10, draw: () => drawBed(S, lying) });
    if (npcs.some(n => n.kind === 'editor')) items.push({ y: L.spot.side.y + 4, draw: drawSideTable });
    const visible = !(task.hide && arrived);
    if (visible) {
      const sitDesk = arrived && task.at === 'desk';
      items.push({ y: lying ? L.bed.y + 40 : P.y + (sitDesk ? -12 : 0), draw: () => {
        const fr = Math.floor(P.walk) + (arrived && (task.typing || task.talk) ? Math.floor(t * 7) : 0);
        if (lying) {
          person(L.bed.x + 22, L.bed.y + 24, { lie: true, shirt: task.burn ? '#7a7a7a' : '#e5484d' });
          rect(L.bed.x, L.bed.y + 24, L.bed.w, L.bed.h - 24, '#5d72d6'); rect(L.bed.x, L.bed.y + 24, L.bed.w, 3, '#7b8ee6');
          for (let i = 0; i < 4; i++) rect(L.bed.x + 6 + i * 13, L.bed.y + 32, 6, 6, '#6e82e0');
          return;
        }
        person(P.x, P.y, { frame: fr, moving: P.moving, dir: arrived && task.dir ? task.dir : P.dir, sit: arrived && task.sit, typing: arrived && task.typing, talk: arrived && task.talk, blink, shirt: task.burn ? '#7a7a7a' : '#e5484d' });
        if (sitDesk) drawChairBack(S);
      } });
    }
    for (const n of npcs) items.push({ y: n.y, draw: () => {
      if (n.kind === 'courier') person(n.x, n.y, { frame: Math.floor(n.walk), moving: n.moving, dir: n.dir, shirt: '#3d8a4a', pants: '#3a3a3a', cap: '#2d6b39', hair: '#4a3520', box: n.phase === 0 });
      else person(n.x, n.y, { frame: Math.floor(n.walk) + (n.moving ? 0 : Math.floor(t * 7)), moving: n.moving, dir: n.moving ? n.dir : 'up', shirt: '#5b6fe0', hair: '#d9b36a', sit: !n.moving, typing: !n.moving, skin: '#e9bb92' });
    } });
    items.sort((a, b) => a.y - b.y).forEach(it => it.draw());

    // 조명 (시간대 색 곱하기 → 광원 더하기)
    if (tm.amb !== '#ffffff') {
      ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = tm.amb; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.globalCompositeOperation = 'screen';
      const glow = (x, y, r, c) => { const g = ctx.createRadialGradient(x * s, y * s, 0, x * s, y * s, r * s); g.addColorStop(0, c); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect((x - r) * s, (y - r) * s, r * 2 * s, r * 2 * s); };
      glow(L.desk.x + 36, L.desk.y - 14, 46, 'rgba(110,150,255,.45)');
      if (S.equip.light) glow(L.spot.film.x, L.spot.film.y - 20, 50, S.job && S.job.stage === 1 ? 'rgba(255,240,200,.55)' : 'rgba(255,220,170,.18)');
      glow(L.door.x - 4, L.FT - 10, 36, 'rgba(255,190,110,.25)');
      ctx.globalCompositeOperation = 'source-over';
    }

    // 말풍선
    if (visible && arrived && task.say) {
      const by = lying ? L.bed.y + 14 : (task.sit ? P.y - 32 : P.y - 36);
      bubble(task.say, lying ? L.bed.x + 24 : P.x, by);
      if (task.lie && !task.burn) { const k = (t % 1.5) / 1.5; label('z', L.bed.x + 36 + k * 8, L.bed.y + 8 - k * 14, 5 + k * 3, `rgba(255,255,255,${1 - k})`); }
    }
    if (task.burn && arrived) { oval(L.bed.x + 24, L.bed.y - 2, 10, 5, '#8a8f99'); oval(L.bed.x + 18, L.bed.y - 4, 6, 4, '#9aa0aa'); }

    // 파티클
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.life -= dt; if (p.life <= 0) { parts.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 70 * dt;
      rect(p.x, p.y, 2, 2, p.c);
    }
    // 떠오르는 글자
    for (let i = floats.length - 1; i >= 0; i--) {
      const f = floats[i]; f.life -= dt; f.y -= dt * 10;
      if (f.life <= 0) { floats.splice(i, 1); continue; }
      ctx.globalAlpha = Math.min(1, f.life * 1.5);
      label(f.str, f.x, f.y, f.size || 6, f.c, f.bg);
      ctx.globalAlpha = 1;
    }
    if (flash > 0) { flash -= dt; ctx.fillStyle = `rgba(255,190,80,${Math.max(0, flash) * 0.3})`; ctx.fillRect(0, 0, cv.width, cv.height); }
  }

  function tapFx(x, y) {
    if (floats.filter(f => f.tap).length > 4) return;
    floats.push({ str: '+작업!', x: x + (Math.random() - 0.5) * 24, y: y + (Math.random() - 0.5) * 10, c: '#3a2a00', bg: '#ffe066', life: 0.6, size: 5, tap: true });
    for (let i = 0; i < 3; i++) parts.push({ x, y, vx: (Math.random() - 0.5) * 50, vy: -Math.random() * 40, life: 0.4, c: '#ffe066' });
  }
  function toLogical(cx, cy) { const b = cv.getBoundingClientRect(); return { x: (cx - b.left) / b.width * (cv.width / s), y: (cy - b.top) / b.height * (cv.height / s) }; }

  root.Scene = { init, frame, tapFx, toLogical, resize, setInset };
})(window);
