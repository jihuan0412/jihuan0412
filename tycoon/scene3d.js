/* 방 안 장면 3D — Three.js 로우폴리 미니어처 (비스듬히 내려다보는 시점).
 * 게임 상태 S를 읽기만 한다. 집(크기·벽·바닥)과 지역(바깥 풍경)에 따라 장면을 다시 짓는다.
 * WebGL을 못 쓰는 기기에서는 2D 장면(Scene2D)으로 대신한다. 그림 파일 없이 기본 도형과 코드로 만든 무늬로 그린다.
 */
(function (root) {
  'use strict';
  const T = root.THREE;
  let fallback = null;
  let renderer, scene, camera, cv, labelsEl, flashEl;
  let insetCss = 140, dockCss = 70;
  let t = 0, worldSig = '', equipSig = '', preview = null, orbit = 0;
  let hemi, sun, deskLamp, monitorLight, filmLight, doorLight;
  let worldG, roomG, equipG, outG, glassMats = [], floorMat, wallMat;
  let RW = 8, RD = 8, L = {};                     // 방 크기와 배치
  const camTarget = new T.Vector3();
  const anim = {};
  let curHouse = null, lastCourierN = null;
  let player, courier = null, editor = null, movers = [], staffPeople = [];
  let bubbleEl, lastBubble = '';
  let lastIncome = null, lastSubs = null, lastVid = 0, floatAcc = 0, accMoney = 0, accSubs = 0, blinkAt = 2;
  const light = { sun: 1, hemi: 0.6, lamp: 0, sky: new T.Color('#8fd0ff'), sunCol: new T.Color('#fff1d6'), fog: new T.Color('#9fc7e8') };
  const texCache = {};

  // ───────── 색·재질 ─────────
  const C = { skin: '#f3c9a1', hair: '#2b1d14', shirt: '#e5484d', pants: '#30406b', shoe: '#22252d', wood: '#a8713f', woodD: '#7c4f2b', metal: '#3a3d46', dark: '#1d1f25' };
  const mat = (c, o) => new T.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.75, metalness: 0.05 }, o || {}));
  const flat = (c, o) => new T.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.85, flatShading: true }, o || {}));
  const glow = (c, i) => new T.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: i == null ? 1 : i, roughness: 0.4 });

  function mesh(geo, m, x, y, z, parent, opt) {
    const o = new T.Mesh(geo, m);
    o.position.set(x || 0, y || 0, z || 0);
    o.castShadow = !(opt && opt.noCast); o.receiveShadow = !(opt && opt.noReceive);
    (parent || scene).add(o);
    return o;
  }
  const box = (w, h, d, m, x, y, z, p, opt) => mesh(new T.BoxGeometry(w, h, d), m, x, y, z, p, opt);
  const cyl = (rt, rb, h, m, x, y, z, p, seg) => mesh(new T.CylinderGeometry(rt, rb, h, seg || 16), m, x, y, z, p);
  const sph = (r, m, x, y, z, p, ws, hs) => mesh(new T.SphereGeometry(r, ws || 14, hs || 10), m, x, y, z, p);
  const cone = (r, h, m, x, y, z, p, seg) => mesh(new T.ConeGeometry(r, h, seg || 8), m, x, y, z, p);

  // ───────── 코드로 만드는 무늬 ─────────
  function canvasTex(key, w, h, draw, repeat) {
    if (texCache[key]) return texCache[key];
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const tx = new T.CanvasTexture(c); tx.encoding = T.sRGBEncoding; tx.anisotropy = 4;
    tx.wrapS = tx.wrapT = T.RepeatWrapping;
    if (repeat) tx.repeat.set(repeat[0], repeat[1]);
    texCache[key] = tx;
    return tx;
  }
  const rnd = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const FLOORS = {
    wood: g => { const rows = 8, ph = 512 / rows; for (let r = 0; r < rows; r++) { let x = -((r * 97) % 200); while (x < 512) { const len = 160 + ((r * 31 + x) % 120), l = 60 + rnd(r * 7 + x) * 10; g.fillStyle = `hsl(30,45%,${l}%)`; g.fillRect(x, r * ph, len, ph); g.strokeStyle = 'rgba(70,40,15,.35)'; g.lineWidth = 2; g.strokeRect(x + 1, r * ph + 1, len - 2, ph - 2); for (let k = 0; k < 3; k++) { g.strokeStyle = 'rgba(90,55,25,.12)'; g.beginPath(); const yy = r * ph + 12 + k * 16; g.moveTo(x, yy); g.bezierCurveTo(x + len * .3, yy - 4, x + len * .6, yy + 4, x + len, yy); g.stroke(); } x += len; } } },
    old: g => { FLOORS.wood(g); g.fillStyle = 'rgba(60,40,30,.35)'; g.fillRect(0, 0, 512, 512); for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(30,20,10,${0.1 + rnd(i) * 0.15})`; g.fillRect(rnd(i + 3) * 512, rnd(i + 9) * 512, 8 + rnd(i) * 40, 2); } },
    linoleum: g => { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { g.fillStyle = (x + y) % 2 ? '#d9cfb8' : '#cfc3a8'; g.fillRect(x * 64, y * 64, 64, 64); } g.strokeStyle = 'rgba(0,0,0,.08)'; for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, 512); g.moveTo(0, i * 64); g.lineTo(512, i * 64); g.stroke(); } },
    concrete: g => { g.fillStyle = '#9a9ea6'; g.fillRect(0, 0, 512, 512); for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${rnd(i) > .5 ? 255 : 0},${rnd(i) > .5 ? 255 : 0},${rnd(i) > .5 ? 255 : 0},.05)`; g.fillRect(rnd(i + 1) * 512, rnd(i + 2) * 512, 3, 3); } g.strokeStyle = 'rgba(0,0,0,.12)'; g.lineWidth = 2; g.strokeRect(0, 0, 256, 256); g.strokeRect(256, 256, 256, 256); },
    tile: g => { g.fillStyle = '#e9e6e0'; g.fillRect(0, 0, 512, 512); g.strokeStyle = 'rgba(0,0,0,.1)'; g.lineWidth = 3; for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 128, 0); g.lineTo(i * 128, 512); g.moveTo(0, i * 128); g.lineTo(512, i * 128); g.stroke(); } },
  };
  const WALLS = {
    plain: { c: '#d6d0c4', draw: g => { g.fillStyle = '#fff'; g.fillRect(0, 0, 256, 256); for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(80,70,60,${0.03 + rnd(i) * 0.05})`; g.fillRect(rnd(i) * 256, rnd(i + 5) * 256, 20 + rnd(i) * 40, 10 + rnd(i + 2) * 30); } } },
    paper: { c: '#f1e6d2', draw: g => { g.fillStyle = '#fff'; g.fillRect(0, 0, 256, 256); for (let x = 0; x < 256; x += 32) { g.fillStyle = 'rgba(0,0,0,.05)'; g.fillRect(x, 0, 16, 256); } for (let y = 8; y < 256; y += 32) for (let x = 24; x < 256; x += 32) { g.fillStyle = 'rgba(0,0,0,.06)'; g.beginPath(); g.arc(x, y + (x % 64 ? 16 : 0), 2.5, 0, 7); g.fill(); } } },
    white: { c: '#f5f3ef', draw: g => { g.fillStyle = '#fff'; g.fillRect(0, 0, 256, 256); } },
    concrete: { c: '#a9adb4', draw: g => { g.fillStyle = '#fff'; g.fillRect(0, 0, 256, 256); for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(0,0,0,${rnd(i) * 0.06})`; g.fillRect(rnd(i + 1) * 256, rnd(i + 2) * 256, 2, 2); } g.fillStyle = 'rgba(0,0,0,.1)'; [[40, 60], [200, 60], [40, 190], [200, 190]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); }); g.strokeStyle = 'rgba(0,0,0,.08)'; g.strokeRect(0, 0, 256, 128); } },
    old: { c: '#e4d4a8', draw: g => { g.fillStyle = '#fff'; g.fillRect(0, 0, 256, 256); for (let i = 0; i < 25; i++) { g.fillStyle = `rgba(120,90,50,${0.05 + rnd(i) * 0.1})`; g.beginPath(); g.arc(rnd(i) * 256, rnd(i + 4) * 256, 6 + rnd(i + 1) * 26, 0, 7); g.fill(); } g.strokeStyle = 'rgba(80,60,40,.35)'; g.beginPath(); g.moveTo(60, 0); g.lineTo(80, 50); g.lineTo(70, 110); g.stroke(); } },
    hanok: { c: '#f3eee2', draw: g => { g.fillStyle = '#fff'; g.fillRect(0, 0, 256, 256); g.fillStyle = '#6b4a2b'; g.fillRect(0, 0, 256, 14); g.fillRect(0, 120, 256, 10); g.fillRect(0, 0, 14, 256); g.fillRect(124, 0, 10, 256); } },
    barn: { c: '#a8553f', draw: g => { for (let x = 0; x < 256; x += 32) { g.fillStyle = x % 64 ? '#ffffff' : '#e8e8e8'; g.fillRect(x, 0, 32, 256); g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x, 0, 2, 256); } } },
    blue: { c: '#ffffff', draw: g => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 256); g.fillStyle = '#3d7fc4'; g.fillRect(0, 150, 256, 106); g.fillStyle = '#ffffff'; g.fillRect(0, 150, 256, 6); for (let x = 0; x < 256; x += 32) { g.fillStyle = 'rgba(0,0,0,.08)'; g.fillRect(x, 156, 2, 100); } } },
    log: { c: '#b9824c', draw: g => { for (let y = 0; y < 256; y += 32) { const gr = g.createLinearGradient(0, y, 0, y + 32); gr.addColorStop(0, '#ffffff'); gr.addColorStop(.5, '#e6e6e6'); gr.addColorStop(1, '#a8a8a8'); g.fillStyle = gr; g.fillRect(0, y, 256, 32); g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, y + 30, 256, 2); } } },
    glass: { c: '#cfe3f2', draw: g => { g.fillStyle = '#fff'; g.fillRect(0, 0, 256, 256); g.fillStyle = 'rgba(40,50,60,.6)'; g.fillRect(0, 0, 256, 6); g.fillRect(0, 0, 6, 256); } },
  };
  function floorTex(kind) { return canvasTex('f_' + kind, 512, 512, FLOORS[kind] || FLOORS.wood, [RW / 4, RD / 4]); }
  function wallTex(kind) { return canvasTex('w_' + kind, 256, 256, (WALLS[kind] || WALLS.paper).draw, [3, 1]); }
  function textTex(text, bg, fg, w, h) {
    const c = document.createElement('canvas'); c.width = w || 512; c.height = h || 256;
    const g = c.getContext('2d'), W = c.width, H = c.height;
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    let fs = H * 0.28; const font = n => `800 ${n}px -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`;
    g.font = font(fs); while (g.measureText(text).width > W * 0.86 && fs > 10) { fs -= 2; g.font = font(fs); }
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, W / 2, H / 2);
    const tx = new T.CanvasTexture(c); tx.encoding = T.sRGBEncoding; return tx;
  }

  // ───────── 사람 (2등신 로우폴리) ─────────
  function makePerson(c, parent) {
    c = Object.assign({ skin: C.skin, hair: C.hair, shirt: C.shirt, pants: C.pants }, c || {});
    const g = new T.Group(); (parent || scene).add(g);
    const skinM = flat(c.skin), shirtM = flat(c.shirt), pantsM = flat(c.pants), hairM = flat(c.hair), shoeM = flat(C.shoe), eyeM = mat('#1b1b1f');
    const body = new T.Group(); g.add(body);
    const torso = mesh(new T.CapsuleGeometry(0.2, 0.24, 4, 10), shirtM, 0, 0.86, 0, body); torso.scale.set(1, 1, 0.8);
    const head = new T.Group(); head.position.set(0, 1.36, 0); body.add(head);
    sph(0.28, skinM, 0, 0, 0, head, 16, 12);
    mesh(new T.SphereGeometry(0.3, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), hairM, 0, 0.03, -0.01, head);
    const hb = mesh(new T.SphereGeometry(0.295, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), hairM, 0, -0.02, -0.02, head); hb.rotation.x = -Math.PI / 2;
    box(0.36, 0.06, 0.12, hairM, 0, 0.17, 0.2, head);
    if (c.longHair) { box(0.5, 0.45, 0.12, hairM, 0, -0.15, -0.2, head); }
    if (c.cap) { cyl(0.31, 0.31, 0.1, flat(c.cap), 0, 0.14, 0, head, 16); box(0.3, 0.03, 0.2, flat(c.cap), 0, 0.1, 0.3, head); }
    if (c.glasses) { [-0.1, 0.1].forEach(x => { const r = mesh(new T.TorusGeometry(0.06, 0.012, 6, 12), mat('#222'), x, 0.0, 0.27, head); }); }
    const eyes = [-0.1, 0.1].map(x => sph(0.035, eyeM, x, 0.0, 0.26, head, 8, 6));
    [-0.15, 0.15].forEach(x => { const ck = sph(0.04, mat('#f59a9a'), x, -0.07, 0.235, head, 8, 6); ck.scale.z = 0.3; });
    const mouth = box(0.07, 0.02, 0.02, mat('#7a2b2b'), 0, -0.1, 0.27, head);
    const limb = (x, y, len, r, m, handM) => {
      const piv = new T.Group(); piv.position.set(x, y, 0); body.add(piv);
      mesh(new T.CapsuleGeometry(r, len, 3, 8), m, 0, -len / 2 - r * 0.6, 0, piv);
      if (handM) sph(r * 1.15, handM, 0, -len - r * 1.2, 0, piv, 8, 6);
      return piv;
    };
    const armL = limb(-0.27, 1.02, 0.26, 0.065, shirtM, skinM), armR = limb(0.27, 1.02, 0.26, 0.065, shirtM, skinM);
    const legL = limb(-0.1, 0.56, 0.3, 0.08, pantsM), legR = limb(0.1, 0.56, 0.3, 0.08, pantsM);
    [legL, legR].forEach(l => box(0.15, 0.08, 0.24, shoeM, 0, -0.52, 0.04, l));
    let carry = null;
    if (c.box) { carry = new T.Group(); body.add(carry); box(0.42, 0.32, 0.32, flat('#c9975b'), 0, 0.95, 0.33, carry); box(0.43, 0.04, 0.33, flat('#e1b37a'), 0, 1.1, 0.33, carry); box(0.06, 0.33, 0.33, flat('#a8783f'), 0, 0.95, 0.33, carry); }
    return { g, body, head, eyes, mouth, armL, armR, legL, legR, carry, x: 0, z: 0, ry: 0, phase: Math.random() * 6, tx: 0, tz: 0 };
  }
  function pose(p, k, dt) {
    p.phase += dt * (k.moving ? 9 : 6);
    const s = Math.sin(p.phase);
    const set = (o, x, z) => { o.rotation.x += (x - o.rotation.x) * Math.min(1, dt * 14); o.rotation.z += ((z || 0) - o.rotation.z) * Math.min(1, dt * 14); };
    p.body.position.y = 0; p.g.rotation.x = 0;
    if (k.lie) { p.g.rotation.x = -Math.PI / 2; set(p.legL, 0); set(p.legR, 0); set(p.armL, 0, -0.1); set(p.armR, 0, 0.1); }
    else if (k.sit) {
      p.body.position.y = -0.06; set(p.legL, -1.5); set(p.legR, -1.5);
      if (k.typing) { set(p.armL, -1.25 + s * 0.12); set(p.armR, -1.25 - s * 0.12); }
      else if (k.talk) { set(p.armL, -0.3); set(p.armR, -1.9 + s * 0.35, 0.25 + s * 0.15); }
      else { set(p.armL, -0.5); set(p.armR, -0.5); }
    } else if (k.moving) {
      p.body.position.y = Math.abs(s) * 0.04; set(p.legL, s * 0.65); set(p.legR, -s * 0.65);
      if (p.carry && p.carry.visible) { set(p.armL, -1.3); set(p.armR, -1.3); } else { set(p.armL, -s * 0.55); set(p.armR, s * 0.55); }
    } else if (k.wave) { set(p.legL, 0); set(p.legR, 0); set(p.armL, 0, -0.06); set(p.armR, -2.6, 0.3 + s * 0.3); }
    else {
      p.body.position.y = Math.sin(t * 2 + p.phase) * 0.008; set(p.legL, 0); set(p.legR, 0);
      if (p.carry && p.carry.visible) { set(p.armL, -1.3); set(p.armR, -1.3); } else { set(p.armL, 0, -0.06); set(p.armR, 0, 0.06); }
    }
    const blink = k.blink ? 0.12 : 1;
    p.eyes.forEach(e => { e.scale.y += (blink - e.scale.y) * 0.6; });
    p.mouth.scale.y = k.talk ? 1 + (Math.sin(t * 18) > 0 ? 2.5 : 0) : 1;
  }
  function walkTo(p, dt, speed) {
    const dx = p.tx - p.x, dz = p.tz - p.z, d = Math.hypot(dx, dz);
    if (d < 0.02) { p.x = p.tx; p.z = p.tz; return false; }
    const st = Math.min(d, speed * dt);
    p.x += dx / d * st; p.z += dz / d * st;
    turnTo(p, Math.atan2(dx, dz), dt);
    return true;
  }
  function turnTo(p, ang, dt) { let d = ang - p.ry; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; p.ry += d * Math.min(1, dt * 10); }
  function disposeTree(o) { o.traverse(m => { if (m.geometry) m.geometry.dispose(); }); if (o.parent) o.parent.remove(o); }

  // ───────── 배치 (방 크기에 따라) ─────────
  function layout() {
    const hx = RW / 2, hz = RD / 2;
    L = {
      desk: { x: -hx + 1.95, z: -hz + 0.55 },
      win: { x: hx - Math.min(3.3, RW * 0.45), w: RW >= 9 ? 2.2 : 1.6 },
      door: { z: -hz + Math.min(2.1, RD * 0.32) },
      film: { x: hx - 1.25, z: -hz + 1.55 },
      bed: { x: -hx + 0.85, z: hz - 1.35 },
      side: { x: RW >= 8 ? 0.6 : 0.2, z: RW >= 8 ? 0.9 : 0.4 },
    };
    L.spot = {
      desk: { x: L.desk.x, z: L.desk.z + 0.83, ry: Math.PI },
      film: { x: L.film.x, z: L.film.z, ry: 0 },
      bed: { x: L.bed.x, z: L.bed.z + 0.8 },
      door: { x: -hx + 0.35, z: L.door.z },
      outside: { x: -hx - 1.4, z: L.door.z },
      side: { x: L.side.x, z: L.side.z + 0.75, ry: Math.PI },
    };
    if (curHouse) {
      const K = root.Engine.roomLayout(curHouse).kitchen;
      L.spot.kitchen = { x: K.spot.x, z: K.spot.z, ry: K.f > 0 ? -Math.PI / 2 : Math.PI / 2 };
    } else L.spot.kitchen = { x: hx - 1, z: hz - 1, ry: Math.PI / 2 };
    const bw = RW <= 6 ? 1.1 : 1.5;
    L.spot.bedside = { x: L.bed.x + bw / 2 + 0.35, z: L.bed.z + 0.3, ry: -Math.PI / 2 };
    L.spot.room = { x: 0.3, z: 0.6 };
    camTarget.set(0, 0.5, 0);
  }

  // ───────── 방 + 바깥 짓기 ─────────
  function buildWorld(S) {
    if (worldG) disposeTree(worldG);
    worldG = new T.Group(); scene.add(worldG);
    roomG = new T.Group(); worldG.add(roomG);
    outG = new T.Group(); worldG.add(outG);
    anim.cars = []; anim.waves = null; anim.boats = []; anim.streetLights = []; anim.windowsLit = []; anim.water = null; anim.clouds = [];
    glassMats = [];
    const H = root.Engine.HOUSES[S.house];
    RW = H.size[0]; RD = H.size[1]; curHouse = S.house;
    layout();
    const hx = RW / 2, hz = RD / 2, WH = RW >= 10 ? 3.4 : 3, th = 0.2;
    // 바닥
    floorMat = mat('#ffffff', { map: floorTex(H.floor), roughness: 0.7 });
    const fl = box(RW + 0.2, 0.25, RD + 0.2, floorMat, 0, -0.125, 0, roomG, { noCast: true });
    box(RW + 0.5, 0.35, RD + 0.5, mat('#4a3a30'), 0, -0.42, 0, roomG);
    // 벽
    const wk = WALLS[H.wall] || WALLS.paper;
    wallMat = mat(wk.c, { map: wallTex(H.wall) });
    const isGlass = H.wall === 'glass';
    const bz = -hz - 0.1, lx = -hx - 0.1;
    const W = L.win, wx0 = W.x - W.w / 2, wx1 = W.x + W.w / 2, wy0 = 1.0, wy1 = 2.4;
    if (isGlass) {
      // 통유리 벽: 기둥 + 유리
      const gm = new T.MeshStandardMaterial({ color: '#bfe0ff', transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.3 });
      glassMats.push(gm);
      const pg = new T.Mesh(new T.PlaneGeometry(RW + 0.2, WH), gm); pg.position.set(0, WH / 2, bz); roomG.add(pg);
      const pl = new T.Mesh(new T.PlaneGeometry(RD + 0.2, WH), gm); pl.position.set(lx, WH / 2, 0); pl.rotation.y = Math.PI / 2; roomG.add(pl);
      for (let x = -hx; x <= hx + 0.01; x += 2) box(0.12, WH, 0.12, mat('#2d333b'), x, WH / 2, bz, roomG);
      for (let z = -hz; z <= hz + 0.01; z += 2) box(0.12, WH, 0.12, mat('#2d333b'), lx, WH / 2, z, roomG);
      box(RW + 0.3, 0.14, 0.14, mat('#2d333b'), 0, WH, bz, roomG); box(0.14, 0.14, RD + 0.3, mat('#2d333b'), lx, WH, 0, roomG);
      box(RW + 0.3, 0.1, 0.14, mat('#2d333b'), 0, 0.05, bz, roomG); box(0.14, 0.1, RD + 0.3, mat('#2d333b'), lx, 0.05, 0, roomG);
    } else {
      box(wx0 + hx + 0.2, WH, th, wallMat, (-hx - 0.2 + wx0) / 2, WH / 2, bz, roomG);
      box(hx - wx1, WH, th, wallMat, (wx1 + hx) / 2, WH / 2, bz, roomG);
      box(wx1 - wx0, wy0, th, wallMat, W.x, wy0 / 2, bz, roomG);
      box(wx1 - wx0, WH - wy1, th, wallMat, W.x, (wy1 + WH) / 2, bz, roomG);
      const frameM = mat(H.wall === 'log' || H.wall === 'hanok' ? '#6b4a2b' : '#f4efe6');
      [wx0, wx1].forEach(x => box(0.08, wy1 - wy0 + 0.08, 0.26, frameM, x, (wy0 + wy1) / 2, bz, roomG));
      box(wx1 - wx0, 0.08, 0.26, frameM, W.x, wy1, bz, roomG);
      box(wx1 - wx0 + 0.3, 0.07, 0.38, frameM, W.x, wy0, bz + 0.08, roomG);
      box(0.05, wy1 - wy0, 0.1, frameM, W.x, (wy0 + wy1) / 2, bz, roomG);
      box(wx1 - wx0, 0.05, 0.1, frameM, W.x, (wy0 + wy1) / 2, bz, roomG);
      const gm = new T.MeshBasicMaterial({ color: '#8fd0ff', transparent: true, opacity: 0.25 });
      const glass = new T.Mesh(new T.PlaneGeometry(wx1 - wx0, wy1 - wy0), gm); glass.position.set(W.x, (wy0 + wy1) / 2, bz); roomG.add(glass);
      // 왼쪽 벽 (문 구멍)
      const dz0 = L.door.z - 0.5, dz1 = L.door.z + 0.5, dh = 2.15;
      box(th, WH, dz0 + hz + 0.2, wallMat, lx, WH / 2, (-hz - 0.2 + dz0) / 2, roomG);
      box(th, WH, hz - dz1, wallMat, lx, WH / 2, (dz1 + hz) / 2, roomG);
      box(th, WH - dh, dz1 - dz0, wallMat, lx, (dh + WH) / 2, L.door.z, roomG);
      // 벽 위 마감
      box(RW + 0.4, 0.08, 0.3, mat(H.wall === 'log' ? '#5a3a20' : '#e8e2d6'), 0, WH + 0.04, bz, roomG);
      box(0.3, 0.08, RD + 0.4, mat(H.wall === 'log' ? '#5a3a20' : '#e8e2d6'), lx, WH + 0.04, 0, roomG);
    }
    // 문
    const doorG = new T.Group(); doorG.position.set(lx + 0.06, 0, L.door.z); roomG.add(doorG); anim.door = doorG;
    const doorM = mat(H.wall === 'blue' ? '#3d7fc4' : H.wall === 'glass' || H.wall === 'concrete' ? '#3a3f4a' : '#8a5b34');
    const leaf = new T.Group(); leaf.position.set(0, 0, -0.5); doorG.add(leaf); anim.doorLeaf = leaf; doorG.userData.spot = 'door';
    box(0.06, 2.12, 1.0, doorM, 0, 1.06, 0.5, leaf);
    sph(0.05, mat('#e8c45a', { metalness: 0.6, roughness: 0.3 }), 0.08, 1.05, 0.88, leaf);
    // 걸레받이
    box(RW, 0.12, 0.04, mat('#d9cfc0'), 0, 0.06, -hz + 0.02, roomG);
    box(0.04, 0.12, RD, mat('#d9cfc0'), -hx + 0.02, 0.06, 0, roomG);
    // 지붕 장식 (주택류: 박공) / 건물 매스 (도시)
    buildShell(S, H, WH);
    // 기본 가구
    buildFurniture(S, H);
    // 바깥 풍경
    buildOutside(S, H);
    // 플레이어 위치 보정
    if (player) { player.x = 0; player.z = 0.5; player.tx = 0; player.tz = 0.5; }
  }

  function buildShell(S, H, WH) {
    const hx = RW / 2, hz = RD / 2, G = roomG;
    const region = H.region;
    if (region !== 'city' && H.wall === 'glass') {
      // 도시 밖 통유리 스튜디오: 얇은 평지붕 처마만
      box(RW + 1.2, 0.2, 1.4, mat('#e8e4dc'), 0, WH + 0.1, -hz - 0.4, G); box(1.4, 0.2, RD + 1.2, mat('#e8e4dc'), -hx - 0.4, WH + 0.1, 0, G);
    } else if (region === 'city') {
      // 도시 건물: 방 뒤로 건물 몸체가 솟아 있다
      const floors = H.wall === 'glass' ? 6 : H.name === '고시원' ? 4 : 3;
      const bm = mat(H.wall === 'glass' ? '#8fa3b8' : H.name === '고시원' ? '#b9a58c' : '#c9c2b6');
      const hgt = floors * 3;
      box(RW + 0.6, hgt, 1.2, bm, 0, WH + hgt / 2, -hz - 0.7, G);
      box(1.2, hgt, RD + 0.6, bm, -hx - 0.7, WH + hgt / 2, 0, G);
      const winM = new T.MeshStandardMaterial({ color: '#2a3a55', emissive: '#ffd27a', emissiveIntensity: 0, roughness: 0.3 });
      anim.windowsLit.push(winM);
      for (let f = 0; f < floors; f++) {
        for (let x = -hx + 0.8; x < hx - 0.3; x += 1.4) box(0.7, 1.0, 0.05, winM, x, WH + 1.2 + f * 3, -hz - 0.08, G, { noCast: true });
        for (let z = -hz + 0.8; z < hz - 0.3; z += 1.4) box(0.05, 1.0, 0.7, winM, -hx - 0.08, WH + 1.2 + f * 3, z, G, { noCast: true });
      }
      if (H.name === '고시원') label3d('고시원', -hx - 0.1, WH + 1.5, 0, G);
    } else {
      // 주택: 뒤쪽 박공지붕
      const roofM = flat(region === 'seaside' ? '#2f6db0' : region === 'country' ? (H.wall === 'hanok' ? '#3b3f4a' : '#b0482e') : '#5a3a22');
      const rg = new T.Group(); rg.position.set(0, WH, -hz - 0.1); G.add(rg);
      const shape = new T.Shape(); shape.moveTo(-hx - 0.5, 0); shape.lineTo(hx + 0.5, 0); shape.lineTo(0, Math.min(2.2, RW * 0.28)); shape.lineTo(-hx - 0.5, 0);
      const gable = mesh(new T.ExtrudeGeometry(shape, { depth: 0.25, bevelEnabled: false }), mat(WALLS[H.wall] ? WALLS[H.wall].c : '#ddd'), 0, 0, -0.25, rg);
      const slopeL = Math.hypot(hx + 0.5, Math.min(2.2, RW * 0.28)) + 0.3, ang = Math.atan2(Math.min(2.2, RW * 0.28), hx + 0.5);
      const r1 = box(slopeL, 0.12, 1.4, roofM, -(hx + 0.5) / 2, Math.min(2.2, RW * 0.28) / 2 + 0.06, -0.5, rg); r1.rotation.z = ang;
      const r2 = box(slopeL, 0.12, 1.4, roofM, (hx + 0.5) / 2, Math.min(2.2, RW * 0.28) / 2 + 0.06, -0.5, rg); r2.rotation.z = -ang;
      if (H.wall === 'log' || H.name === '통나무집') cyl(0.25, 0.25, 1.4, mat('#7a6a5a'), hx * 0.4, Math.min(2.2, RW * 0.28) + 0.5, -0.6, rg, 8);   // 굴뚝
    }
  }
  function label3d(text, x, y, z, parent) {
    const tx = textTex(text, '#20283a', '#ffd27a', 512, 160);
    const p = new T.Mesh(new T.PlaneGeometry(1.6, 0.5), new T.MeshBasicMaterial({ map: tx }));
    p.position.set(x, y, z); p.rotation.y = Math.PI / 2; parent.add(p);
  }

  function buildFurniture(S, H) {
    const G = roomG;
    // 책상
    const dk = new T.Group(); dk.position.set(L.desk.x, 0, L.desk.z); G.add(dk);
    const woodM = mat(H.wall === 'glass' || H.wall === 'concrete' ? '#d8d2c8' : C.wood);
    box(2.4, 0.08, 0.85, woodM, 0, 0.76, 0, dk);
    [[-1.12, -0.36], [1.12, -0.36], [-1.12, 0.36], [1.12, 0.36]].forEach(([x, z]) => box(0.07, 0.72, 0.07, mat(C.woodD), x, 0.36, z, dk));
    box(0.5, 0.5, 0.75, mat(C.woodD), 0.9, 0.5, 0, dk);
    cyl(0.07, 0.06, 0.14, mat('#f2f2f2'), -0.95, 0.87, 0.15, dk); cyl(0.06, 0.06, 0.01, mat('#5b3418'), -0.95, 0.94, 0.15, dk);
    anim.steam = [];
    for (let i = 0; i < 4; i++) { const st = sph(0.035, new T.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5 }), 0, 0, 0, G, 6, 4); st.castShadow = false; anim.steam.push({ m: st, k: i / 4 }); }
    // 스탠드
    cyl(0.08, 0.1, 0.03, mat(C.dark), -1.05, 0.81, -0.25, dk); const arm = cyl(0.012, 0.012, 0.45, mat(C.dark), -1.05, 1.03, -0.25, dk, 6); arm.rotation.z = 0.2;
    const shade = cone(0.1, 0.12, glow('#ffe1a6', 0), -1.0, 1.25, -0.25, dk, 10); shade.rotation.z = -0.4; anim.lampShade = shade;
    // 의자
    const ch = new T.Group(); ch.position.set(L.spot.desk.x, 0, L.spot.desk.z); G.add(ch); anim.chair = ch;
    cyl(0.04, 0.04, 0.36, mat(C.metal), 0, 0.24, 0, ch);
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; const leg = box(0.32, 0.04, 0.05, mat(C.dark), Math.sin(a) * 0.15, 0.05, Math.cos(a) * 0.15, ch); leg.rotation.y = a + Math.PI / 2; }
    box(0.55, 0.08, 0.5, mat('#3b3f4b'), 0, 0.46, 0, ch);
    box(0.5, 0.42, 0.07, mat('#454a58'), 0, 0.72, 0.27, ch);
    // 침대 (고시원은 좁은 침대)
    const narrow = H.size[0] <= 6;
    const bd = new T.Group(); bd.position.set(L.bed.x, 0, L.bed.z); G.add(bd); anim.bed = bd;
    const bw = narrow ? 1.1 : 1.5;
    box(bw, 0.35, 2.5, mat('#6e4a2c'), 0, 0.2, 0, bd);
    box(bw, 0.75, 0.12, mat('#5a3b22'), 0, 0.5, -1.25, bd);
    box(bw - 0.1, 0.2, 2.35, mat('#f1ecf7'), 0, 0.47, 0.02, bd);
    box(bw * 0.6, 0.14, 0.42, mat('#ffffff'), 0, 0.62, -0.88, bd);
    anim.blanket = box(bw - 0.06, 0.12, 1.5, mat(S.region === 'mountain' ? '#b5523a' : S.region === 'seaside' ? '#3aa0c8' : '#5d72d6'), 0, 0.6, 0.45, bd);
    // 부엌 (냉장고 + 가스레인지) — 누르면 생활 메뉴
    const K = root.Engine.roomLayout(S.house).kitchen;
    const kg = new T.Group(); G.add(kg); kg.userData.spot = 'kitchen'; anim.kitchen = kg;
    const small = !K.stove, fh = small ? 1.05 : 1.55;
    box(0.6, fh, 0.62, mat('#eef1f4', { roughness: 0.35 }), K.x, fh / 2, K.fridgeZ, kg);
    const F = K.f;
    box(0.02, fh - 0.12, 0.56, mat('#cfd6de'), K.x + F * 0.305, fh / 2, K.fridgeZ, kg);
    box(0.025, 0.02, 0.58, mat('#aab3bd'), K.x + F * 0.31, fh * 0.68, K.fridgeZ, kg);
    box(0.04, 0.3, 0.04, mat('#8e98a3', { metalness: 0.6 }), K.x + F * 0.33, fh * 0.82, K.fridgeZ - 0.2, kg);
    box(0.04, 0.3, 0.04, mat('#8e98a3', { metalness: 0.6 }), K.x + F * 0.33, fh * 0.45, K.fridgeZ - 0.2, kg);
    ['#ff6b6b', '#ffd43b', '#4dabf7'].forEach((c, i) => box(0.02, 0.07, 0.07, mat(c), K.x + F * 0.32, fh * 0.6 + i * 0.1, K.fridgeZ - 0.12 + i * 0.07, kg));
    anim.burners = [];
    if (K.stove) {
      box(0.62, 0.86, 0.64, mat(H.wall === 'log' || H.wall === 'hanok' ? C.wood : '#f2efe8'), K.x, 0.43, K.stoveZ, kg);
      box(0.64, 0.04, 0.66, mat('#d6d2ca', { roughness: 0.4 }), K.x, 0.88, K.stoveZ, kg);
      box(0.02, 0.5, 0.5, mat('#c9c4ba'), K.x + F * 0.315, 0.42, K.stoveZ, kg);
      [-0.15, 0.15].forEach(o => { cyl(0.11, 0.11, 0.02, mat('#2a2a2a'), K.x, 0.91, K.stoveZ + o, kg, 14); const b = cyl(0.08, 0.08, 0.012, glow('#ff7a2a', 0), K.x, 0.925, K.stoveZ + o, kg, 14); anim.burners.push(b); });
      anim.pot = cyl(0.13, 0.12, 0.16, mat('#b9c0c8', { metalness: 0.6, roughness: 0.3 }), K.x, 1.0, K.stoveZ - 0.15, kg, 14);
      anim.potLid = cyl(0.135, 0.135, 0.02, mat('#a3aab3', { metalness: 0.6, roughness: 0.3 }), K.x, 1.09, K.stoveZ - 0.15, kg, 14);
      box(0.24, 0.02, 0.14, mat('#e9e2d2'), K.x, 0.91, K.stoveZ + 0.2, kg);
    }
    anim.cookSteam = [];
    for (let i = 0; i < 5; i++) { const st = sph(0.05, new T.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0 }), K.x, 1.1, K.stoveZ - 0.15, G, 6, 4); st.castShadow = false; anim.cookSteam.push({ m: st, k: i / 5 }); }
    bd.userData.spot = 'bed';
    // 스툴
    const sl = new T.Group(); sl.position.set(L.film.x, 0, L.film.z); G.add(sl);
    cyl(0.24, 0.24, 0.06, mat('#9b6a3e'), 0, 0.46, 0, sl);
    for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + 0.6; const l = cyl(0.025, 0.025, 0.46, mat('#5a3a20'), Math.sin(a) * 0.15, 0.22, Math.cos(a) * 0.15, sl, 6); l.rotation.z = Math.sin(a) * 0.12; l.rotation.x = -Math.cos(a) * 0.12; }
    // 집별 소품
    const hx = RW / 2, hz = RD / 2;
    if (H.wall === 'old') { box(0.5, 0.4, 0.4, flat('#8a6a4a'), hx - 0.6, 0.2, hz - 0.6, G); box(0.4, 0.3, 0.4, flat('#9a7a5a'), hx - 0.55, 0.55, hz - 0.65, G); }   // 낡은 궤짝
    if (H.wall === 'log' || H.name === '통나무집') { // 벽난로
      box(1.1, 1.1, 0.5, flat('#7a7a80'), hx - 0.7, 0.55, hz - 0.35, G); box(0.6, 0.5, 0.1, mat('#1a1a1a'), hx - 0.7, 0.4, hz - 0.62, G);
      anim.fire = sph(0.16, glow('#ff8a2a', 2), hx - 0.7, 0.3, hz - 0.5, G, 8, 6);
    }
    if (H.wall === 'hanok') { box(1.6, 0.25, 1.0, flat('#a8713f'), hx - 1.2, 0.12, hz - 0.8, G); }   // 평상
    if (H.wall === 'barn') { [[hx - 0.6, hz - 0.6], [hx - 1.4, hz - 0.5]].forEach(([x, z]) => cyl(0.35, 0.35, 0.7, flat('#d8b85a'), x, 0.35, z, G, 10)); }   // 짚단
    if (H.wall === 'blue') { const lb = new T.Group(); lb.position.set(hx - 0.5, 0, hz - 0.5); G.add(lb); cyl(0.3, 0.3, 0.06, mat('#e8e2d0'), 0, 0.03, 0, lb, 12); sph(0.12, mat('#f2d8b0'), 0, 0.15, 0, lb, 8, 6); }   // 조개 바구니
  }

  // ───────── 바깥 풍경 ─────────
  function buildOutside(S, H) {
    const G = outG, region = H.region, hx = RW / 2, hz = RD / 2;
    const groundC = { city: '#7d8088', country: '#7fae54', seaside: '#e8d6a0', mountain: '#5f8f4a' }[region];
    const ground = box(60, 0.2, 60, flat(groundC), 0, -0.62, 0, G, { noCast: true });
    anim.groundMat = ground.material; anim.groundBase = new T.Color(groundC); anim.leafMats = [];
    const tree = (x, z, s, kind) => {
      const g = new T.Group(); g.position.set(x, -0.5, z); g.scale.setScalar(s || 1); G.add(g);
      cyl(0.12, 0.16, 1.0, flat('#6b4a2b'), 0, 0.5, 0, g, 6);
      if (kind === 'pine') { cone(0.9, 1.4, flat('#2f6b3a'), 0, 1.4, 0, g, 7); cone(0.7, 1.2, flat('#357a42'), 0, 2.0, 0, g, 7); cone(0.45, 0.9, flat('#3d8a4a'), 0, 2.6, 0, g, 7); }
      else if (kind === 'palm') { const tr = cyl(0.08, 0.12, 2.6, flat('#9a7a4a'), 0, 1.3, 0, g, 6); for (let i = 0; i < 6; i++) { const lf = box(1.4, 0.04, 0.3, flat('#3c9a4a'), Math.cos(i) * 0.6, 2.6, Math.sin(i) * 0.6, g); lf.rotation.y = -i; lf.rotation.z = -0.4; } }
      else { const l1 = flat('#4c9a46'), l2 = flat('#5aac50'); anim.leafMats.push(l1, l2); sph(0.8, l1, 0, 1.6, 0, g, 7, 5); sph(0.55, l2, 0.35, 2.0, 0.2, g, 7, 5); }
      return g;
    };
    if (region === 'city') {
      // 앞길 도로 + 인도
      box(60, 0.05, 4, flat('#3a3d44'), 0, -0.5, hz + 4.2, G, { noCast: true });
      for (let x = -28; x < 28; x += 3) box(1.4, 0.06, 0.15, flat('#f2d14a'), x, -0.47, hz + 4.2, G, { noCast: true });
      box(60, 0.15, 1.6, flat('#b8b4ac'), 0, -0.45, hz + 1.5, G, { noCast: true });
      box(1.6, 0.15, 60, flat('#b8b4ac'), -hx - 1.8, -0.45, 0, G, { noCast: true });
      // 차
      for (let i = 0; i < 3; i++) {
        const car = new T.Group(); car.position.set(-20 + i * 14, -0.45, hz + 3.5 + (i % 2) * 1.3); G.add(car);
        const col = ['#e5484d', '#2f6fed', '#f2f2f2'][i];
        box(1.8, 0.45, 0.85, flat(col), 0, 0.3, 0, car); box(1.0, 0.35, 0.8, flat(col), -0.1, 0.7, 0, car); box(0.95, 0.3, 0.82, mat('#9fd0ff', { roughness: 0.1 }), -0.1, 0.7, 0, car);
        [[-0.6, 0.42], [0.6, 0.42], [-0.6, -0.42], [0.6, -0.42]].forEach(([x, z]) => { const w = cyl(0.18, 0.18, 0.12, mat('#111'), x, 0.12, z, car, 10); w.rotation.x = Math.PI / 2; });
        const hl = box(0.05, 0.1, 0.6, glow('#fff3c0', 0), 0.9, 0.35, 0, car, { noCast: true }); car.userData = { speed: (i % 2 ? -1 : 1) * (2.5 + i), hl };
        if (car.userData.speed < 0) car.rotation.y = Math.PI;
        anim.cars.push(car);
      }
      // 주변 빌딩
      const bld = (x, z, w, d, h, c) => { box(w, h, d, flat(c), x, -0.5 + h / 2, z, G); const wm = new T.MeshStandardMaterial({ color: '#2a3a55', emissive: '#ffd27a', emissiveIntensity: 0, roughness: .3 }); anim.windowsLit.push(wm); for (let y = 1.2; y < h - 0.6; y += 1.6) for (let k = -w / 2 + 0.6; k < w / 2 - 0.3; k += 1.2) box(0.6, 0.8, 0.05, wm, x + k, -0.5 + y, z + d / 2 + 0.03, G, { noCast: true }); };
      bld(hx + 5, -hz - 3, 4, 4, 14, '#8d97a6'); bld(hx + 10, -hz + 2, 4, 5, 9, '#a9a08f'); bld(-hx - 7, -hz - 6, 5, 4, 18, '#6f7c8f'); bld(hx + 6, hz + 9, 5, 4, 7, '#b5aa98'); bld(-hx - 8, hz + 9, 4, 4, 11, '#93a0ae');
      // 가로등·가로수
      for (let x = -hx - 2; x < hx + 10; x += 5) {
        cyl(0.05, 0.06, 3, mat('#444'), x, 1.0, hz + 2.1, G, 6); const lamp = box(0.5, 0.12, 0.25, glow('#fff1c4', 0), x + 0.2, 2.5, hz + 2.1, G, { noCast: true });
        const pl = new T.PointLight('#ffd89a', 0, 6, 2); pl.position.set(x + 0.2, 2.3, hz + 2.1); G.add(pl); anim.streetLights.push({ m: lamp, l: pl });
      }
      tree(hx + 2.5, hz + 1.5, 0.7); tree(-hx - 1.8, hz + 2.6, 0.7);
    } else if (region === 'country') {
      // 논 (계절에 따라 색)
      anim.paddies = [];
      for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
        const pm = flat('#86b84f'); anim.paddies.push(pm);
        box(4.2, 0.08, 3.2, pm, hx + 4 + i * 4.6, -0.48, -hz + 0.5 + j * 3.6, G, { noCast: true });
        box(4.4, 0.12, 0.15, flat('#8a6a4a'), hx + 4 + i * 4.6, -0.45, -hz + 0.5 + j * 3.6 + 1.7, G);
      }
      box(1.6, 0.06, 40, flat('#c2a676'), -hx - 2.2, -0.5, 0, G, { noCast: true });       // 흙길
      // 울타리
      for (let z = -hz; z < hz + 3; z += 0.9) { box(0.08, 0.7, 0.08, flat('#a07850'), hx + 1.3, -0.15, z, G); }
      box(0.05, 0.06, RD + 3, flat('#a07850'), hx + 1.3, 0.05, 1.5, G); box(0.05, 0.06, RD + 3, flat('#a07850'), hx + 1.3, -0.2, 1.5, G);
      // 헛간 + 트랙터
      const bn = new T.Group(); bn.position.set(-hx - 5, -0.5, -hz - 4); G.add(bn);
      box(4, 3, 3.5, flat('#b0482e'), 0, 1.5, 0, bn); const rf = box(4.4, 0.2, 2.2, flat('#5a5a60'), 0, 3.4, 0.9, bn); rf.rotation.x = 0.6; const rf2 = box(4.4, 0.2, 2.2, flat('#5a5a60'), 0, 3.4, -0.9, bn); rf2.rotation.x = -0.6;
      box(1.4, 2, 0.1, flat('#f2e6d0'), 0, 1, 1.78, bn);
      const tr = new T.Group(); tr.position.set(hx + 3.5, -0.5, hz + 3); tr.rotation.y = -0.6; G.add(tr);
      box(1.4, 0.6, 0.9, flat('#2f8f45'), 0, 0.6, 0, tr); box(0.7, 0.7, 0.8, flat('#2f8f45'), -0.3, 1.2, 0, tr);
      [[0.5, 0.5, 0.45], [0.5, -0.5, 0.45], [-0.5, 0.5, 0.3], [-0.5, -0.5, 0.3]].forEach(([x, z, r]) => { const w = cyl(r, r, 0.2, mat('#1b1b1b'), x, r, z, tr, 12); w.rotation.x = Math.PI / 2; });
      for (let i = 0; i < 6; i++) tree(-hx - 3 - (i % 3) * 3, hz + 1 - Math.floor(i / 3) * 6, 0.9 + rnd(i) * 0.4);
      // 멀리 산
      [[-20, -22, 9], [-6, -26, 12], [12, -24, 10], [24, -18, 8]].forEach(([x, z, h]) => cone(h * 0.9, h, flat('#5f8a5a'), x, h / 2 - 0.5, z, G, 6));
      // 짚단
      [[hx + 6, hz + 2], [hx + 7.2, hz + 2.6]].forEach(([x, z]) => { const hb = cyl(0.5, 0.5, 0.9, flat('#e0c36a'), x, -0.05, z, G, 10); hb.rotation.z = Math.PI / 2; });
    } else if (region === 'seaside') {
      // 바다 (물결)
      const geo = new T.PlaneGeometry(70, 40, 40, 24);
      const wm = new T.MeshStandardMaterial({ color: '#2f8fc8', roughness: 0.25, metalness: 0.1, flatShading: true, transparent: true, opacity: 0.92 });
      const sea = new T.Mesh(geo, wm); sea.rotation.x = -Math.PI / 2; sea.position.set(6, -0.55, hz + 16); sea.receiveShadow = true; G.add(sea);
      anim.water = { mesh: sea, base: Float32Array.from(geo.attributes.position.array) };
      box(70, 0.2, 2, flat('#f2e8c6'), 6, -0.58, hz + 3.6, G, { noCast: true });   // 젖은 모래선
      // 등대
      const lh = new T.Group(); lh.position.set(hx + 9, -0.5, hz + 9); G.add(lh);
      cyl(0.6, 0.8, 5, flat('#f4f4f4'), 0, 2.5, 0, lh, 10); cyl(0.62, 0.72, 0.8, flat('#d6453d'), 0, 3.2, 0, lh, 10); cyl(0.6, 0.62, 0.8, flat('#d6453d'), 0, 1.6, 0, lh, 10);
      anim.lighthouse = cyl(0.5, 0.5, 0.6, glow('#fff3b0', 0.3), 0, 5.3, 0, lh, 10); cone(0.7, 0.7, flat('#333'), 0, 5.95, 0, lh, 10);
      // 배
      for (let i = 0; i < 2; i++) { const b = new T.Group(); b.position.set(-4 + i * 9, -0.5, hz + 12 + i * 4); G.add(b); box(2.2, 0.5, 0.9, flat(i ? '#f2f2f2' : '#d6453d'), 0, 0.2, 0, b); box(0.8, 0.6, 0.7, flat('#f2f2f2'), -0.3, 0.7, 0, b); cyl(0.04, 0.04, 1.8, mat('#555'), 0.5, 1.2, 0, b, 6); anim.boats.push(b); }
      // 파라솔·야자
      [[hx + 3, hz + 1.5, '#ff6b6b'], [hx + 6, hz + 2.2, '#4da3ff']].forEach(([x, z, c]) => { cyl(0.03, 0.03, 1.8, mat('#ddd'), x, 0.4, z, G, 6); cone(1.0, 0.5, flat(c), x, 1.4, z, G, 10); });
      tree(-hx - 2.5, hz + 1, 0.9, 'palm'); tree(hx + 2, -hz - 1.5, 1.0, 'palm'); tree(-hx - 4, -hz - 2, 1.1, 'palm');
      // 방파제 바위
      for (let i = 0; i < 6; i++) { const r = mesh(new T.DodecahedronGeometry(0.5 + rnd(i) * 0.4, 0), flat('#8a8f99'), -hx - 6 + i * 0.9, -0.3, hz + 5 + rnd(i + 2) * 0.8, G); r.rotation.set(rnd(i), rnd(i + 1), 0); }
    } else {
      // 산속: 소나무 숲, 바위, 계곡
      for (let i = 0; i < 26; i++) {
        const a = rnd(i) * Math.PI * 2, d = 7 + rnd(i + 3) * 14;
        let x = Math.cos(a) * d, z = Math.sin(a) * d;
        if (x > -hx - 1 && x < hx + 1 && z > -hz - 1 && z < hz + 1) continue;
        if (z > hz && x > -hx - 1) z += 4;                 // 앞쪽은 덜 가리게
        tree(x, z, 0.9 + rnd(i + 5) * 0.8, 'pine');
      }
      for (let i = 0; i < 5; i++) { const r = mesh(new T.DodecahedronGeometry(0.4 + rnd(i) * 0.6, 0), flat('#8d8f95'), hx + 2 + rnd(i) * 4, -0.3, -hz + rnd(i + 7) * RD, G); r.rotation.set(rnd(i), rnd(i + 2), 0); }
      // 계곡
      const geo = new T.PlaneGeometry(3, 50, 6, 40); const wm = new T.MeshStandardMaterial({ color: '#4aa8d8', roughness: 0.2, flatShading: true });
      const st = new T.Mesh(geo, wm); st.rotation.x = -Math.PI / 2; st.position.set(hx + 4.5, -0.52, 0); G.add(st); anim.water = { mesh: st, base: Float32Array.from(geo.attributes.position.array), stream: true };
      // 먼 산
      [[-18, -24, 14], [-2, -30, 18], [16, -26, 15], [28, -14, 10], [-28, -8, 11]].forEach(([x, z, h]) => { cone(h * 0.8, h, flat('#4d7a52'), x, h / 2 - 0.5, z, G, 7); cone(h * 0.25, h * 0.25, flat('#f4f6f8'), x, h - 0.5 - h * 0.12, z, G, 7); });
      // 모닥불
      const fp = new T.Group(); fp.position.set(hx + 2.4, -0.5, hz + 2.5); G.add(fp);
      for (let i = 0; i < 6; i++) { const s = mesh(new T.DodecahedronGeometry(0.15, 0), flat('#777'), Math.cos(i) * 0.4, 0.1, Math.sin(i) * 0.4, fp); }
      anim.campfire = sph(0.22, glow('#ff7a1a', 2), 0, 0.3, 0, fp, 8, 6);
      const cf = new T.PointLight('#ff8a3a', 0, 6, 2); cf.position.set(0, 0.8, 0); fp.add(cf); anim.campLight = cf;
      // 텐트
      const tn = new T.Group(); tn.position.set(hx + 4.6, -0.5, hz + 4.5); tn.rotation.y = -0.5; G.add(tn); cone(1.2, 1.4, flat('#e08a2a'), 0, 0.7, 0, tn, 4);
    }
    // 구름
    for (let i = 0; i < 4; i++) { const cg = new T.Group(); cg.position.set(-20 + i * 12, 14 + rnd(i) * 3, -18 + rnd(i + 1) * 8); G.add(cg); [0, 1.2, -1.1].forEach((o, k) => sph(1.4 - k * 0.2, new T.MeshStandardMaterial({ color: '#ffffff', roughness: 1, transparent: true, opacity: 0.9 }), o, k * 0.2, 0, cg, 8, 6)); anim.clouds.push(cg); }
  }

  // ───────── 장비 (가구 포함 단계로) ─────────
  function buildEquip(S) {
    if (equipG) disposeTree(equipG);
    equipG = new T.Group(); scene.add(equipG);
    anim.rgb = []; anim.ringMats = []; anim.softMats = []; anim.monitorMats = []; anim.recDot = null;
    const e = root.Engine.effEquip(S), sp = e.space, G = equipG, H = root.Engine.HOUSES[S.house];
    const hx = RW / 2, hz = RD / 2;
    const pcLv = e.ram + e.ssd + e.cpu + e.gpu, dx = L.desk.x, dz = L.desk.z, top = 0.8;
    const screenM = () => { const m = glow('#2c4170', 0.9); anim.monitorMats.push(m); return m; };
    if (pcLv === 0) {
      box(0.6, 0.03, 0.4, mat('#a7adb5', { metalness: 0.5 }), dx, top + 0.015, dz + 0.05, G);
      const lid = box(0.6, 0.4, 0.03, mat('#888d95', { metalness: 0.5 }), dx, top + 0.2, dz - 0.15, G); lid.rotation.x = -0.25;
      const sc = box(0.54, 0.34, 0.01, screenM(), dx, top + 0.2, dz - 0.13, G); sc.rotation.x = -0.25;
    } else {
      box(0.16, 0.3, 0.12, mat(C.dark), dx, top + 0.15, dz - 0.2, G); box(0.3, 0.02, 0.22, mat(C.dark), dx, top + 0.01, dz - 0.2, G);
      box(0.95, 0.56, 0.05, mat('#15171d'), dx, top + 0.5, dz - 0.22, G); box(0.88, 0.49, 0.01, screenM(), dx, top + 0.5, dz - 0.19, G);
      if (e.gpu >= 2) { const m2 = box(0.6, 0.4, 0.05, mat('#15171d'), dx + 0.82, top + 0.42, dz - 0.12, G); m2.rotation.y = -0.4; const s2 = box(0.54, 0.34, 0.01, screenM(), dx + 0.81, top + 0.42, dz - 0.095, G); s2.rotation.y = -0.4; box(0.1, 0.22, 0.1, mat(C.dark), dx + 0.82, top + 0.11, dz - 0.12, G); }
      box(0.7, 0.03, 0.22, mat('#2d3038'), dx, top + 0.015, dz + 0.15, G);
      box(0.08, 0.03, 0.12, mat('#2d3038'), dx + 0.5, top + 0.015, dz + 0.17, G);
      box(0.28, 0.6, 0.6, mat('#2a2c33', { metalness: 0.3 }), dx + 1.45, 0.3, dz + 0.05, G);
      if (e.gpu >= 1) for (let i = 0; i < 3; i++) { const m = glow('#ff00ff', 1.4); anim.rgb.push({ m, k: i }); box(0.01, 0.04, 0.45, m, dx + 1.3, 0.15 + i * 0.18, dz + 0.05, G, { noCast: true }); }
    }
    if (e.mic === 1) { cyl(0.05, 0.08, 0.03, mat(C.dark), dx - 0.65, top + 0.015, dz + 0.1, G); cyl(0.012, 0.012, 0.2, mat(C.metal), dx - 0.65, top + 0.12, dz + 0.1, G); cyl(0.045, 0.045, 0.16, mat('#2b2b30', { metalness: 0.4 }), dx - 0.65, top + 0.28, dz + 0.1, G); }
    if (e.mic === 2) { cyl(0.02, 0.02, 0.7, mat(C.metal), dx - 1.0, top + 0.35, dz - 0.3, G); const arm = box(0.6, 0.025, 0.025, mat(C.metal), dx - 0.72, top + 0.68, dz - 0.15, G); arm.rotation.y = -0.5; const mc = cyl(0.05, 0.05, 0.22, mat('#18181c', { metalness: 0.4 }), dx - 0.45, top + 0.6, dz, G); mc.rotation.z = Math.PI / 2; }
    const fx = L.film.x, fz = L.film.z;
    if (sp >= 2) {
      [-0.9, 0.9].forEach(o => cyl(0.025, 0.025, 2.3, mat(C.metal), fx + o, 1.15, -hz + 0.25, G, 8));
      box(1.85, 0.03, 0.03, mat(C.metal), fx, 2.3, -hz + 0.25, G);
      box(1.75, 2.05, 0.02, mat('#ffffff', { map: textTex('▶ ' + (S.channel || ''), '#1fa69c', '#ffffff', 512, 512) }), fx, 1.25, -hz + 0.26, G);
    }
    const lights = e.light === 1 ? [[0.75, -0.2, 'ring']] : e.light === 2 ? [[-0.85, 0.35, 'soft'], [0.85, 0.35, 'soft']] : [];
    for (const [ox, oz, kind] of lights) {
      const lx = fx + ox, lz = fz + 0.9 + oz;
      for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; const l = cyl(0.015, 0.015, 0.7, mat(C.dark), lx + Math.sin(a) * 0.14, 0.32, lz + Math.cos(a) * 0.14, G, 6); l.rotation.set(-Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4); }
      cyl(0.02, 0.02, 1.2, mat(C.metal), lx, 1.2, lz, G, 6);
      if (kind === 'ring') { const m = glow('#fff8e0', 0.4); anim.ringMats.push(m); const r = mesh(new T.TorusGeometry(0.28, 0.035, 8, 28), m, lx, 1.85, lz, G); r.rotation.y = Math.atan2(fx - lx, fz - lz); }
      else { const sb = new T.Group(); sb.position.set(lx, 1.9, lz); sb.rotation.y = Math.atan2(fx - lx, fz - lz); G.add(sb); box(0.55, 0.45, 0.22, mat('#222'), 0, 0, -0.1, sb); const m = glow('#fffbe6', 0.3); anim.softMats.push(m); box(0.5, 0.4, 0.01, m, 0, 0, 0.02, sb, { noCast: true }); }
    }
    const cx = fx, cz = Math.min(fz + 2.0, hz - 0.4);
    for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2 + 0.3; const l = cyl(0.015, 0.015, 1.05, mat(C.dark), cx + Math.sin(a) * 0.18, 0.5, cz + Math.cos(a) * 0.18, G, 6); l.rotation.set(-Math.cos(a) * 0.32, 0, Math.sin(a) * 0.32); }
    const camG = new T.Group(); camG.position.set(cx, 1.05, cz); camG.rotation.y = Math.PI; G.add(camG);
    if (e.camera === 0) box(0.09, 0.17, 0.02, mat(C.dark), 0, 0.1, 0, camG);
    else if (e.camera === 1) { box(0.26, 0.17, 0.12, mat('#2f3138', { metalness: 0.3 }), 0, 0.09, 0, camG); const ln = cyl(0.06, 0.06, 0.14, mat('#111'), 0, 0.09, 0.12, camG); ln.rotation.x = Math.PI / 2; }
    else { box(0.34, 0.26, 0.38, mat('#1b1c20', { metalness: 0.3 }), 0, 0.14, 0, camG); const ln = cyl(0.09, 0.09, 0.26, mat('#0b0b0b'), 0, 0.14, 0.3, camG); ln.rotation.x = Math.PI / 2; box(0.18, 0.12, 0.14, mat(C.metal), 0.06, 0.34, -0.06, camG); }
    anim.recDot = sph(0.025, glow('#ff2d2d', 0), 0.1, 0.22, 0.06, camG, 8, 6);
    if (sp >= 1 && H.wall !== 'glass') {
      for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) box(0.06, 0.42, 0.42, mat((i + j) % 2 ? '#2b2f3e' : '#3a3f53', { roughness: 1 }), -hx + 0.03, 1.5 + j * 0.46, -hz + 0.7 + i * 0.46, G);
      const W = L.win; [W.x - W.w / 2 - 0.2, W.x + W.w / 2 + 0.2].forEach(x => box(0.32, 1.7, 0.08, flat('#9b3440'), x, 1.65, -hz + 0.08, G));
      box(W.w + 0.8, 0.03, 0.03, mat(C.metal), W.x, 2.55, -hz + 0.1, G);
    }
    if (sp >= 2) {
      const rug = cyl(Math.min(1.3, RW * 0.16), Math.min(1.3, RW * 0.16), 0.02, mat('#93507a', { roughness: 1 }), L.side.x, 0.011, L.side.z + 0.4, G, 32); rug.castShadow = false;
      const rug2 = cyl(Math.min(0.9, RW * 0.11), Math.min(0.9, RW * 0.11), 0.022, mat('#7c3d63', { roughness: 1 }), L.side.x, 0.013, L.side.z + 0.4, G, 32); rug2.castShadow = false;
      const px = -hx + 0.45, pz = L.door.z + 1.0;
      cyl(0.18, 0.14, 0.32, flat('#b3653a'), px, 0.16, pz, G, 10);
      [[0, 0.55, 0, 0.26], [0.12, 0.72, 0.05, 0.18], [-0.1, 0.75, -0.06, 0.17]].forEach(([x, y, z, r]) => sph(r, flat('#2f8f55'), px + x, y, pz + z, G, 7, 5));
    }
    if (sp >= 3 && RW >= 9) {
      const so = new T.Group(); so.position.set(hx - 2.0, 0, hz - 0.6); so.rotation.y = Math.PI; G.add(so);
      box(1.9, 0.4, 0.8, flat('#5b70a8'), 0, 0.25, 0, so); box(1.9, 0.55, 0.22, flat('#475a8c'), 0, 0.6, 0.32, so);
      [-1.0, 1.0].forEach(x => box(0.22, 0.6, 0.8, flat('#475a8c'), x, 0.35, 0, so));
    }
    if (sp >= 3) { const sign = box(0.9, 0.3, 0.04, mat('#ffffff', { map: textTex('ON AIR', '#200a14', '#ff4f74', 512, 170), emissive: '#ff4f74', emissiveIntensity: 0.25 }), hx - 0.8, 2.6, -hz + 0.04, G); sign.castShadow = false; }
    let n = 0;
    for (const k of ['edu_edit', 'edu_thumb', 'edu_plan', 'edu_growth', 'edu_mentor']) if (S.equip[k]) {
      const x = L.desk.x - 1.0 + n * 0.42; n++;
      box(0.32, 0.4, 0.03, mat('#b48a3a', { metalness: 0.4 }), x, 2.25, -hz + 0.02, G);
      box(0.26, 0.34, 0.01, mat('#fffaf0'), x, 2.25, -hz + 0.04, G, { noCast: true });
      sph(0.035, mat('#d33'), x + 0.07, 2.13, -hz + 0.05, G, 8, 6);
    }
    if (S.skills.fitness) { cyl(0.02, 0.02, 0.4, mat(C.metal), L.bed.x + 1.2, 0.08, L.bed.z + 0.6, G, 6).rotation.z = Math.PI / 2; [-0.2, 0.2].forEach(o => cyl(0.08, 0.08, 0.06, mat('#222'), L.bed.x + 1.2 + o, 0.08, L.bed.z + 0.6, G, 10).rotation.z = Math.PI / 2); }
    if (S.subs >= 100000) { box(0.4, 0.5, 0.04, mat('#3d3d3d'), L.film.x - 1.5, 2.3, -hz + 0.02, G); box(0.34, 0.44, 0.01, mat('#dfe4ea', { metalness: 0.8, roughness: 0.2 }), L.film.x - 1.5, 2.3, -hz + 0.045, G); }
    // 직원 책상 (집 크기에 따라)
    anim.staffDesks = [];
    const staff = (S.staff || []);
    const slots = staffSlots(H);
    staff.forEach((st, i) => {
      const sl = slots[i]; if (!sl) return;
      const g = new T.Group(); g.position.set(sl.x, 0, sl.z); g.rotation.y = sl.ry; G.add(g);
      box(1.3, 0.06, 0.7, mat('#d8d2c8'), 0, 0.74, 0, g); [[-0.6, -0.3], [0.6, -0.3], [-0.6, 0.3], [0.6, 0.3]].forEach(([x, z]) => box(0.05, 0.72, 0.05, mat(C.metal), x, 0.36, z, g));
      box(0.6, 0.38, 0.04, mat('#15171d'), 0, 1.0, -0.2, g); const sm = glow(st.role === 'ai' ? '#7a4cff' : '#2c4170', 0.9); anim.monitorMats.push(sm); box(0.55, 0.33, 0.01, sm, 0, 1.0, -0.175, g);
      box(0.45, 0.06, 0.4, mat('#3b3f4b'), 0, 0.46, 0.55, g);
      anim.staffDesks.push({ x: sl.x + Math.sin(sl.ry) * 0.55, z: sl.z + Math.cos(sl.ry) * 0.55, ry: sl.ry + Math.PI });
    });
  }
  function staffSlots(H) {
    const hx = RW / 2, hz = RD / 2, out = [];
    // 방 가운데~오른쪽 앞쪽에 줄지어 책상
    for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
      const x = -hx + 2.4 + col * 1.9, z = -hz + 4.2 + row * 1.8;
      if (x > hx - 2.4 || z > hz - 1.0) continue;
      if (Math.abs(x - L.bed.x) < 1.6 && Math.abs(z - L.bed.z) < 2) continue;
      if (Math.abs(x - L.film.x) < 1.4 && z < L.film.z + 2.6) continue;
      out.push({ x, z, ry: Math.PI });
    }
    return out;
  }

  // ───────── 시간대 ─────────
  function timeTarget(gh) {
    const h = gh % 24;
    if (h < 5 || h >= 21) return { sun: 0, sunCol: '#8899ff', hemi: 0.3, hs: '#5a6ab8', hg: '#2a2030', lamp: 1, sky: '#0f1a3a', fog: '#0f1a3a' };
    if (h < 8) return { sun: 0.7, sunCol: '#ffb38a', hemi: 0.45, hs: '#ffd2b8', hg: '#6a4a3a', lamp: 0.3, sky: '#f6b08a', fog: '#e8b49a' };
    if (h < 16) return { sun: 1.55, sunCol: '#fff1d6', hemi: 0.42, hs: '#d6ecff', hg: '#8a6a4a', lamp: 0, sky: '#8fd0ff', fog: '#b9dcf2' };
    if (h < 19) return { sun: 1.05, sunCol: '#ff9a5a', hemi: 0.45, hs: '#ffc9a0', hg: '#6a4a3a', lamp: 0.4, sky: '#ff9f6a', fog: '#e8a080' };
    return { sun: 0, sunCol: '#8899ff', hemi: 0.34, hs: '#8a7ac8', hg: '#3a2a40', lamp: 0.9, sky: '#3a2a68', fog: '#3a2a68' };
  }

  // ───────── 연출 ─────────
  function screenPos(x, y, z) { const v = new T.Vector3(x, y, z).project(camera); return { x: (v.x + 1) / 2 * cv.clientWidth, y: (1 - v.y) / 2 * cv.clientHeight }; }
  function floatText(str, x, y, cls) { const el = document.createElement('div'); el.className = 'f3d ' + (cls || ''); el.textContent = str; el.style.left = x + 'px'; el.style.top = y + 'px'; labelsEl.appendChild(el); setTimeout(() => el.remove(), 1700); }
  function sparkle(x, y, z, n) { for (let i = 0; i < n; i++) { const m = box(0.06, 0.06, 0.06, glow(['#ffe066', '#ffffff', '#7ee0ff', '#ff8fb1'][i % 4], 1.2), x, y, z, scene, { noCast: true }); anim.sparks.push({ m, vx: (Math.random() - 0.5) * 3, vy: Math.random() * 3 + 1, vz: (Math.random() - 0.5) * 3, life: 0.9 + Math.random() * 0.4 }); } }

  function playerTask(S) {
    const j = S.job;
    if (S.moving) return { at: 'door', carry: true, say: '📦 이삿짐 싸는 중' };
    if (S.gh < S.burnoutUntil) return { at: 'bed', lie: true, say: '😵 번아웃…', burn: true };
    if (S.pendingEvent) return { at: null, say: '❗' };
    if (S.live) return { at: 'film', sit: true, talk: true, say: ['라이브 시작합니다!', '슈퍼챗 감사합니다!', '질문 받을게요~'][Math.floor(t / 2.5) % 3] };
    const la = S.life && S.life.act;
    if (la) {
      const A = root.Engine.actDef(S, la) || {};
      if (A.at === 'outside') return { at: 'outside', hide: true };
      if (A.at === 'bath') return { at: 'door', hide: true, say: A.say };
      if (A.at === 'kitchen') return { at: 'kitchen', typing: true, cook: true, say: A.say };
      if (A.at === 'bedside') return { at: 'bedside', talk: true, say: A.say };
      if (A.at === 'desk') return { at: 'desk', sit: true, typing: true, say: A.say };
      if (A.at === 'room') return { at: 'room', typing: true, say: A.say };
    }
    if (S.resting) return { at: 'bed', lie: true, say: 'Zzz…' };
    if (j && j.partTime) return { at: 'outside', hide: true };
    if (j) {
      const how = j.how || [];
      if (j.stage === 0) return how[0] === 'ai' ? { at: 'desk', sit: true, say: '🤖 AI 기획 생성 중' } : how[0] === 'staff' ? { at: null, say: '☕ 작가가 기획 중' } : { at: 'desk', sit: true, typing: true, say: '💡 기획 중' };
      if (j.stage === 1) return how[1] === 'ai' ? { at: 'desk', sit: true, say: '🤖 AI 영상 생성 중' } : how[1] === 'staff' ? { at: 'film', sit: true, talk: true, say: '🎥 촬영 스태프와 촬영' } : { at: 'film', sit: true, talk: true, say: ['여러분 안녕하세요!', '오늘 알려드릴 건요…', '구독·좋아요 부탁해요!'][Math.floor(t / 2.5) % 3] };
      if (j.outsource || how[2] === 'staff') return { at: null, say: '☕ 편집 맡김' };
      if (how[2] === 'ai') return { at: 'desk', sit: true, say: '🤖 AI 자동 편집 중' };
      return { at: 'desk', sit: true, typing: true, say: '✂️ 편집 중' };
    }
    if (S.uploadReady) return { at: 'desk', sit: true, say: '📤 썸네일 고르기!' };
    const L2 = S.life;
    if (L2 && L2.hunger < 30) return { at: null, say: '🍚 배고파…' };
    if (L2 && L2.clean < 30) return { at: null, say: '😣 씻고 싶다' };
    if (L2 && L2.mood < 30) return { at: null, say: '😞 기분 전환이 필요해' };
    return { at: null };
  }

  // ───────── 초기화·크기 ─────────
  function init(canvas) {
    cv = canvas;
    let ok = !!T;
    if (ok) { try { renderer = new T.WebGLRenderer({ canvas: cv, antialias: true }); } catch (e) { ok = false; } }
    if (!ok || !renderer) { fallback = root.Scene2D; fallback.init(canvas); return; }
    cv.style.imageRendering = 'auto';
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.outputEncoding = T.sRGBEncoding; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.92;
    scene = new T.Scene();
    scene.background = new T.Color('#8fd0ff');
    scene.fog = new T.Fog('#b9dcf2', 60, 140);
    camera = new T.OrthographicCamera(-6, 6, 6, -6, 0.1, 200);
    hemi = new T.HemisphereLight('#d6ecff', '#8a6a4a', 0.6); scene.add(hemi);
    sun = new T.DirectionalLight('#fff1d6', 1.5);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.02;
    Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 60 });
    scene.add(sun); scene.add(sun.target);
    deskLamp = new T.PointLight('#ffb867', 0, 6, 2); scene.add(deskLamp);
    monitorLight = new T.PointLight('#7fa8ff', 0.3, 3.5, 2); scene.add(monitorLight);
    filmLight = new T.PointLight('#fff4dc', 0, 5, 2); scene.add(filmLight);
    doorLight = new T.PointLight('#ffbe7a', 0, 3, 2); scene.add(doorLight);
    anim.sparks = [];
    labelsEl = document.createElement('div'); labelsEl.id = 'labels3d'; document.body.appendChild(labelsEl);
    bubbleEl = document.createElement('div'); bubbleEl.className = 'bub3d'; labelsEl.appendChild(bubbleEl);
    flashEl = document.createElement('div'); flashEl.className = 'flash3d'; document.body.appendChild(flashEl);
    const css = document.createElement('style');
    css.textContent = `#labels3d{position:fixed;inset:0;pointer-events:none;z-index:3}
      .bub3d{position:absolute;transform:translate(-50%,-100%);background:#fff;color:#1b1f2a;font-weight:800;font-size:13px;padding:5px 10px;border-radius:12px;white-space:nowrap;box-shadow:0 3px 10px rgba(0,0,0,.3);display:none}
      .bub3d:after{content:"";position:absolute;left:50%;bottom:-6px;margin-left:-6px;border:6px solid transparent;border-bottom:0;border-top-color:#fff}
      .f3d{position:absolute;transform:translate(-50%,-50%);font-weight:800;font-size:13px;padding:3px 9px;border-radius:99px;white-space:nowrap;animation:f3d 1.7s ease-out forwards;box-shadow:0 2px 8px rgba(0,0,0,.35)}
      .f3d.money{background:#ffd84d;color:#3a2a00}.f3d.subs{background:#ff4f7b;color:#fff}.f3d.info{background:#2f6fed;color:#fff}.f3d.tap{background:#ffe066;color:#3a2a00;font-size:12px;animation-duration:.7s}
      .f3d.big{font-size:22px;background:#ff5a2c;color:#fff;padding:6px 16px}
      @keyframes f3d{0%{opacity:0;margin-top:6px}15%{opacity:1}100%{opacity:0;margin-top:-46px}}
      .flash3d{position:fixed;inset:0;pointer-events:none;z-index:2;background:rgba(255,190,80,0);transition:background .5s}`;
    document.head.appendChild(css);
    player = makePerson();
    resize();
    window.addEventListener('resize', resize);
  }
  function placeCamera() {
    const dist = Math.max(RW, RD) * 1.4 + 6;
    const a = Math.PI / 4 + orbit;
    camera.position.set(camTarget.x + Math.sin(a) * dist, camTarget.y + dist * 0.96, camTarget.z + Math.cos(a) * dist);
    camera.lookAt(camTarget);
  }
  function resize() {
    if (fallback) return fallback.resize && fallback.resize();
    if (!renderer) return;
    const w = cv.clientWidth || window.innerWidth, h = cv.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    const avail = Math.max(120, h - insetCss - dockCss);
    const span = Math.max(RW, RD) + 1.6;                          // 방 크기에 맞춰 확대
    const wpp = Math.max(span * 1.33 / w, span * 1.45 / avail);
    const halfW = w * wpp / 2, halfH = h * wpp / 2;
    const want = insetCss + avail * 0.48;
    const shift = (want - h / 2) * wpp;
    camera.left = -halfW; camera.right = halfW; camera.top = halfH + shift; camera.bottom = -halfH + shift;
    camera.updateProjectionMatrix();
    placeCamera();
  }
  function setInset(px) { if (fallback) return fallback.setInset(px); if (Math.abs(px - insetCss) > 2) { insetCss = px; resize(); } }
  function setDock(px) { if (fallback) return; if (Math.abs(px - dockCss) > 2) { dockCss = px; resize(); } }
  function setLowGfx(on) {
    if (!renderer) return;
    renderer.shadowMap.enabled = !on; renderer.setPixelRatio(on ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
    resize();
  }

  // 시작 화면 미리보기: 상태를 직접 넘기면 그 집을 보여 주고 천천히 돈다
  function setPreview(state) { preview = state; if (!state) { orbit = 0; placeCamera(); } }

  // ───────── 매 프레임 ─────────
  function frame(S, dt, speed) {
    if (fallback) return S && fallback.frame(S, dt, speed);
    if (!renderer) return;
    S = preview || S;
    if (!S) { renderer.render(scene, camera); return; }
    t += dt;
    if (cv.clientWidth && Math.abs(renderer.domElement.width - Math.round(cv.clientWidth * renderer.getPixelRatio())) > 2) resize();
    if (preview) { orbit += dt * 0.15; placeCamera(); } else if (orbit) { orbit = 0; placeCamera(); }
    const wsig = S.house + '|' + S.region;
    if (wsig !== worldSig) { worldSig = wsig; buildWorld(S); equipSig = ''; resize(); clearMovers(); }
    const sig = JSON.stringify(root.Engine.effEquip(S)) + JSON.stringify(S.equip) + S.skills.fitness + (S.subs >= 100000) + S.channel + JSON.stringify((S.staff || []).map(x => x.role));
    if (sig !== equipSig) {
      if (equipSig && !preview) { courier = courier || spawnCourier(); sparkle(0, 1.2, 0.5, 18); }
      buildEquip(S); equipSig = sig;
    }

    // 조명
    const tg = timeTarget(S.gh), k = Math.min(1, dt * 1.5);
    light.sun += (tg.sun - light.sun) * k; light.hemi += (tg.hemi - light.hemi) * k; light.lamp += (tg.lamp - light.lamp) * k;
    light.sky.lerp(new T.Color(tg.sky), k); light.sunCol.lerp(new T.Color(tg.sunCol), k); light.fog.lerp(new T.Color(tg.fog), k);
    scene.background.copy(light.sky); scene.fog.color.copy(light.fog);
    sun.intensity = light.sun; sun.color.copy(light.sunCol);
    const hh = S.gh % 24, xo = (hh - 12) * 1.2;
    sun.position.set(2 + xo, 12, -14); sun.target.position.set(xo * 0.2, 0, 2);
    hemi.intensity = light.hemi; hemi.color.lerp(new T.Color(tg.hs), k); hemi.groundColor.lerp(new T.Color(tg.hg), k);
    deskLamp.position.set(L.desk.x - 1.0, 1.5, L.desk.z); deskLamp.intensity = light.lamp * 1.3;
    if (anim.lampShade) anim.lampShade.material.emissiveIntensity = light.lamp * 2;
    monitorLight.position.set(L.desk.x, 1.3, L.desk.z + 0.5);
    filmLight.position.set(L.film.x, 2.0, L.film.z + 1.1);
    doorLight.position.set(-RW / 2 + 0.4, 2.4, L.door.z); doorLight.intensity = light.lamp * 0.5;
    const j = S.job, shooting = (j && !j.partTime && j.stage === 1 && !(j.how && j.how[1] === 'ai')) || S.live, working = j && !j.partTime && (j.stage !== 1);
    monitorLight.intensity = 0.25 + light.lamp * 0.5 + (working ? 0.3 : 0);
    filmLight.intensity = shooting && root.Engine.effEquip(S).light ? 1.6 : 0;
    anim.ringMats.forEach(m => { m.emissiveIntensity = shooting ? 2.2 : 0.35; });
    anim.softMats.forEach(m => { m.emissiveIntensity = shooting ? 2 : 0.3; });
    const aiNow = j && j.how && j.how[j.stage] === 'ai';
    anim.monitorMats.forEach((m, i) => { m.emissive.set(aiNow ? ['#7a4cff', '#c04cff'][Math.floor(t * 3 + i) % 2] : working ? (j.stage === 2 ? ['#3a5a9a', '#5a3a8a'][Math.floor(t * 2 + i) % 2] : '#4a6aa8') : '#2c4170'); });
    anim.rgb.forEach(r => r.m.emissive.setHSL(((t * 0.25 + r.k * 0.33) % 1), 0.9, 0.55));
    if (anim.recDot) anim.recDot.material.emissiveIntensity = shooting && Math.floor(t * 2) % 2 ? 3 : 0;
    anim.steam.forEach(s => { const q = (t * 0.5 + s.k) % 1; s.m.position.set(L.desk.x - 0.95 + Math.sin(t * 2 + s.k * 6) * 0.03, 1.0 + q * 0.5, L.desk.z + 0.15); s.m.material.opacity = 0.45 * (1 - q); s.m.scale.setScalar(0.6 + q); });
    const night = light.lamp > 0.5;
    anim.windowsLit.forEach((m, i) => { m.emissiveIntensity = night ? 0.9 : 0; });
    anim.streetLights.forEach(s => { s.m.material.emissiveIntensity = night ? 2 : 0; s.l.intensity = night ? 1.2 : 0; });
    anim.cars.forEach(c => { c.position.x += c.userData.speed * dt; if (c.position.x > 30) c.position.x = -30; if (c.position.x < -30) c.position.x = 30; c.userData.hl.material.emissiveIntensity = night ? 2 : 0; });
    anim.boats.forEach((b, i) => { b.position.y = -0.5 + Math.sin(t * 1.3 + i) * 0.12; b.rotation.z = Math.sin(t * 1.1 + i) * 0.06; });
    anim.clouds.forEach((c, i) => { c.position.x += dt * 0.3; if (c.position.x > 30) c.position.x = -30; });
    if (anim.lighthouse) anim.lighthouse.material.emissiveIntensity = night ? 2.5 + Math.sin(t * 3) : 0.3;
    if (anim.campfire) { anim.campfire.scale.setScalar(0.85 + Math.sin(t * 9) * 0.15); anim.campLight.intensity = night ? 1.4 + Math.sin(t * 11) * 0.3 : 0; }
    if (anim.fire) anim.fire.scale.setScalar(0.85 + Math.sin(t * 9) * 0.15);
    // 방 꾸미기 (놓인 아이템 + 벽지·바닥재 + 배치 모드)
    updateDecor(S);
    // 계절
    const sea = root.Engine.season(S.gh);
    if (anim.groundMat && S.region !== 'seaside') {
      const tgt = sea === 3 ? new T.Color(S.region === 'city' ? '#c9ccd2' : '#eef2f6') : sea === 2 && S.region !== 'city' ? anim.groundBase.clone().lerp(new T.Color('#b8a050'), 0.35) : anim.groundBase;
      anim.groundMat.color.lerp(tgt, Math.min(1, dt * 2));
    }
    if (anim.leafMats) { const lc = new T.Color(['#5aac50', '#3f9a3a', '#d8862a', '#e6ecef'][sea]); anim.leafMats.forEach((m, i) => m.color.lerp(i % 2 ? lc : lc.clone().multiplyScalar(0.88), Math.min(1, dt * 2))); }
    if (sea === 3 && !preview && !anim.snow) {
      const n = 220, geo = new T.BufferGeometry(), pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 30; pos[i * 3 + 1] = Math.random() * 14; pos[i * 3 + 2] = (Math.random() - 0.5) * 30; }
      geo.setAttribute('position', new T.BufferAttribute(pos, 3));
      anim.snow = new T.Points(geo, new T.PointsMaterial({ color: '#ffffff', size: 0.12, transparent: true, opacity: 0.9 })); scene.add(anim.snow);
    } else if (sea !== 3 && anim.snow) { scene.remove(anim.snow); anim.snow.geometry.dispose(); anim.snow = null; }
    if (anim.snow) { const p = anim.snow.geometry.attributes.position; for (let i = 0; i < p.count; i++) { let y = p.array[i * 3 + 1] - dt * 1.2; const x = p.array[i * 3], z = p.array[i * 3 + 2]; const inside = Math.abs(x) < RW / 2 + 0.2 && Math.abs(z) < RD / 2 + 0.2; if (y < (inside ? 3.2 : -0.5)) y = 14; p.array[i * 3 + 1] = y; p.array[i * 3] = x + Math.sin(t + i) * dt * 0.2; } p.needsUpdate = true; }
    if (anim.paddies) { const col = ['#86b84f', '#5da53c', '#d8b84a', '#e8e4dc'][root.Engine.season(S.gh)]; anim.paddies.forEach(m => m.color.set(col)); }
    if (anim.water) {
      const pos = anim.water.mesh.geometry.attributes.position, b = anim.water.base;
      for (let i = 0; i < pos.count; i++) { const x = b[i * 3], y = b[i * 3 + 1]; pos.array[i * 3 + 2] = anim.water.stream ? Math.sin(y * 1.5 + t * 4) * 0.05 : Math.sin(x * 0.6 + t * 1.6) * 0.12 + Math.cos(y * 0.8 + t * 1.2) * 0.1; }
      pos.needsUpdate = true; anim.water.mesh.geometry.computeVertexNormals();
    }
    // 문 여닫기 (누가 드나들 때)
    const someoneAtDoor = [player, courier, editor, ...movers].some(p => p && Math.hypot(p.x - L.spot.door.x, p.z - L.spot.door.z) < 1.4 && p.g.visible);
    if (anim.doorLeaf) anim.doorLeaf.rotation.y += ((someoneAtDoor ? -1.3 : 0) - anim.doorLeaf.rotation.y) * Math.min(1, dt * 6);

    // 플레이어
    const task = playerTask(S);
    if (task.at === 'bed') { player.tx = L.bed.x; player.tz = L.bed.z + 1.4; }
    else if (task.at) { player.tx = L.spot[task.at].x; player.tz = L.spot[task.at].z; }
    else if (t > (player.wanderAt || 0)) { player.wanderAt = t + 3 + Math.random() * 3; player.tx = (Math.random() - 0.3) * RW * 0.4; player.tz = (Math.random() - 0.2) * RD * 0.4; }
    const moving = walkTo(player, dt, (S.life && S.life.act ? 3.2 : 1.7) * Math.min(2, Math.sqrt(speed || 1)));
    const arrived = !moving;
    if (arrived && task.at && L.spot[task.at] && L.spot[task.at].ry != null) turnTo(player, L.spot[task.at].ry, dt);
    if (t > blinkAt) blinkAt = t + 2.5 + Math.random() * 2;
    const lying = arrived && task.lie;
    player.g.visible = !(task.hide && arrived);
    if (lying) { player.g.position.set(L.bed.x, 0.72, L.bed.z + 0.8); player.g.rotation.y = 0; }
    else { player.g.position.set(player.x, 0, player.z); player.g.rotation.y = player.ry; }
    pose(player, { moving, sit: arrived && task.sit, lie: lying, typing: arrived && task.typing, talk: arrived && task.talk, blink: blinkAt - t > 2.35 }, dt);
    if (anim.blanket) { anim.blanket.scale.z = lying ? 1.3 : 1; anim.blanket.position.z = lying ? 0.25 : 0.45; anim.blanket.position.y = lying ? 0.72 : 0.6; }
    if (anim.chair) anim.chair.rotation.y = arrived && task.at === 'desk' ? 0 : 0.5;

    const cooking = arrived && task.cook;
    anim.burners.forEach(b => { b.material.emissiveIntensity = cooking ? 1.8 + Math.sin(t * 12) * 0.3 : 0; });
    if (anim.potLid) anim.potLid.position.y = 1.09 + (cooking ? Math.abs(Math.sin(t * 9)) * 0.025 : 0);
    if (anim.cookSteam) { const K = root.Engine.roomLayout(S.house).kitchen; anim.cookSteam.forEach(s => { const q = (t * 0.6 + s.k) % 1; s.m.position.set(K.x + Math.sin(t * 2 + s.k * 6) * 0.04, 1.12 + q * 0.7, K.stoveZ - 0.15); s.m.material.opacity = cooking && K.stove ? 0.5 * (1 - q) : 0; s.m.scale.setScalar(0.6 + q * 1.2); }); }
    if (S.life && !preview) { const n = S.life.courier || 0; if (lastCourierN == null) lastCourierN = n; if (n !== lastCourierN) { lastCourierN = n; courier = courier || spawnCourier(); } }
    updateCourier(dt); updateEditor(S, dt); updateMovers(S, dt); updateStaff(S, dt);

    // 말풍선
    if (!preview && player.g.visible && arrived && task.say) {
      const p = lying ? screenPos(L.bed.x, 1.2, L.bed.z - 0.5) : screenPos(player.x, task.sit ? 1.75 : 1.85, player.z);
      if (task.say !== lastBubble) { bubbleEl.textContent = task.say; lastBubble = task.say; }
      bubbleEl.style.display = 'block';
      const bw = bubbleEl.offsetWidth / 2 + 6, vw = window.innerWidth;
      bubbleEl.style.left = Math.max(bw, Math.min(vw - bw, p.x)) + 'px'; bubbleEl.style.top = (p.y - 6) + 'px';
    } else bubbleEl.style.display = 'none';

    if (!preview) {
      if (lastIncome === null) { lastIncome = S.totalIncome; lastSubs = S.subs; lastVid = S.videoSeq; }
      accMoney += S.totalIncome - lastIncome; accSubs += S.subs - lastSubs; lastIncome = S.totalIncome; lastSubs = S.subs;
      floatAcc += dt;
      if (floatAcc > 1.3) {
        floatAcc = 0;
        const w = screenPos(L.win.x, 2.8, -RD / 2);
        if (accMoney >= 1) floatText('+₩' + root.Engine.fmt(accMoney), w.x - 34, w.y, 'money');
        if (accSubs >= 1) floatText('♥ +' + root.Engine.fmt(accSubs), w.x + 38, w.y + 14, 'subs');
        accMoney = 0; accSubs = 0;
      }
      if (S.videoSeq !== lastVid) {
        const v = S.videos[0]; lastVid = S.videoSeq;
        if (v) {
          const p = screenPos(L.desk.x, 2.0, L.desk.z); floatText('📤 업로드 완료!', p.x, p.y, 'info');
          if (v.viral) { const c = screenPos(0, 1.5, 0); floatText('🔥 바이럴!', c.x, c.y, 'big'); sparkle(0, 1.5, 0, 40); flashEl.style.background = 'rgba(255,190,80,.35)'; setTimeout(() => { flashEl.style.background = 'rgba(255,190,80,0)'; }, 400); }
        }
      }
    }
    for (let i = anim.sparks.length - 1; i >= 0; i--) {
      const s = anim.sparks[i]; s.life -= dt;
      if (s.life <= 0) { scene.remove(s.m); s.m.geometry.dispose(); anim.sparks.splice(i, 1); continue; }
      s.vy -= 6 * dt; s.m.position.x += s.vx * dt; s.m.position.y += s.vy * dt; s.m.position.z += s.vz * dt; s.m.rotation.x += dt * 6;
    }
    renderer.render(scene, camera);
  }

  // ───────── 드나드는 사람들 ─────────
  function spawnCourier() {
    const p = makePerson({ shirt: '#3d8a4a', pants: '#3a3a3a', cap: '#2d6b39', hair: '#4a3520', box: true });
    p.x = L.spot.outside.x; p.z = L.spot.outside.z; p.tx = 0.2; p.tz = 0.6; p.phase0 = 0; p.wait = 0; p.leg = 0;
    p.path = [L.spot.door, { x: 0.2, z: 0.6 }];
    return p;
  }
  function followPath(p, dt, speed) {
    if (p.path && p.path.length) { p.tx = p.path[0].x; p.tz = p.path[0].z; }
    const mv = walkTo(p, dt, speed);
    if (!mv && p.path && p.path.length) { p.path.shift(); return true; }
    return mv;
  }
  function updateCourier(dt) {
    if (!courier) return;
    const p = courier, mv = followPath(p, dt, 2.2);
    p.g.position.set(p.x, 0, p.z); p.g.rotation.y = p.ry;
    if (!mv && p.phase0 === 0) { p.wait += dt; if (p.wait > 0.8) { p.phase0 = 1; if (p.carry) p.carry.visible = false; const s = screenPos(p.x, 2, p.z); floatText('📦 배송 완료', s.x, s.y, 'money'); p.path = [L.spot.door, L.spot.outside]; } }
    else if (!mv && p.phase0 === 1) { disposeTree(p.g); courier = null; return; }
    pose(p, { moving: mv }, dt);
  }
  function updateEditor(S, dt) {
    const out = S.job && !S.job.partTime && S.job.stage === 2 && (S.job.outsource);
    if (out && !editor && !preview) {
      editor = makePerson({ shirt: '#5b6fe0', hair: '#d9b36a', skin: '#e9bb92', glasses: true });
      editor.x = L.spot.outside.x; editor.z = L.spot.outside.z; editor.path = [L.spot.door, L.spot.side];
      editor.table = new T.Group(); scene.add(editor.table); editor.table.position.set(L.side.x, 0, L.side.z);
      box(1.1, 0.05, 0.6, mat('#b07a47'), 0, 0.62, 0, editor.table); [[-0.5, -0.25], [0.5, -0.25], [-0.5, 0.25], [0.5, 0.25]].forEach(([x, z]) => box(0.05, 0.6, 0.05, mat('#87592f'), x, 0.3, z, editor.table));
      box(0.4, 0.02, 0.28, mat('#b6bcc6', { metalness: 0.5 }), 0, 0.66, 0.05, editor.table); const lid = box(0.4, 0.28, 0.02, mat('#9aa1ad', { metalness: 0.5 }), 0, 0.8, -0.1, editor.table); lid.rotation.x = -0.25;
      const st = new T.Group(); st.position.set(0, 0, 0.75); editor.table.add(st); cyl(0.2, 0.2, 0.05, mat('#7a4a2a'), 0, 0.46, 0, st); cyl(0.03, 0.03, 0.46, mat(C.metal), 0, 0.23, 0, st, 6);
    }
    if (!editor) return;
    if (!out && !editor.leaving) { editor.leaving = true; editor.path = [L.spot.door, L.spot.outside]; }
    const mv = followPath(editor, dt, 1.9), arrived = !mv && (!editor.path || !editor.path.length);
    if (arrived && !editor.leaving) turnTo(editor, Math.PI, dt);
    editor.g.position.set(editor.x, 0, editor.z); editor.g.rotation.y = editor.ry;
    pose(editor, { moving: mv, sit: arrived && !editor.leaving, typing: arrived && !editor.leaving }, dt);
    if (editor.leaving && arrived) { disposeTree(editor.g); disposeTree(editor.table); editor = null; }
  }
  // 이사 중: 상자 더미 + 일꾼 두 명이 상자를 나른다 + 문 밖 트럭
  function updateMovers(S, dt) {
    if (S.moving && !preview) {
      if (!anim.moveProps) {
        anim.moveProps = new T.Group(); scene.add(anim.moveProps);
        for (let i = 0; i < 7; i++) { const b = box(0.5, 0.38, 0.4, flat(i % 2 ? '#c9975b' : '#b98648'), 0.4 + (i % 3) * 0.55, 0.19 + Math.floor(i / 3) * 0.38, 0.8 + (i % 2) * 0.1, anim.moveProps); box(0.51, 0.04, 0.06, flat('#e8d9b0'), b.position.x, b.position.y + 0.19, b.position.z, anim.moveProps); }
        const tr = new T.Group(); tr.position.set(L.spot.outside.x - 2.2, -0.45, L.spot.outside.z); tr.rotation.y = Math.PI / 2; anim.moveProps.add(tr);
        box(2.4, 1.6, 1.5, flat('#f4f4f4'), -0.6, 1.0, 0, tr); box(1.1, 1.1, 1.45, flat('#2f6fed'), 1.2, 0.75, 0, tr); box(0.05, 0.5, 1.2, mat('#9fd0ff'), 1.76, 1.0, 0, tr);
        const lbl = new T.Mesh(new T.PlaneGeometry(2.0, 0.6), new T.MeshBasicMaterial({ map: textTex('🚚 이사', '#ffffff', '#2f6fed', 512, 150) })); lbl.position.set(-0.6, 1.1, 0.76); tr.add(lbl);
        [[-1.2, 0.7], [-1.2, -0.7], [1.2, 0.7], [1.2, -0.7]].forEach(([x, z]) => { const w = cyl(0.3, 0.3, 0.2, mat('#1b1b1b'), x, 0.3, z, tr, 12); w.rotation.x = Math.PI / 2; });
        movers = [0, 1].map(i => { const m = makePerson({ shirt: '#f2a03a', cap: '#d6453d', box: true, pants: '#3a3a3a' }); m.x = 0.6 + i; m.z = 1.0; m.leg = i; return m; });
      }
      movers.forEach((m, i) => {
        if (!m.path || !m.path.length) { m.leg = 1 - m.leg; m.path = m.leg ? [L.spot.door, L.spot.outside] : [L.spot.door, { x: 0.6 + i * 0.6, z: 1.0 }]; if (m.carry) m.carry.visible = !!m.leg; }
        const mv = followPath(m, dt, 2.0);
        m.g.position.set(m.x, 0, m.z); m.g.rotation.y = m.ry; m.g.visible = !(m.x < -RW / 2 - 1.0);
        pose(m, { moving: mv }, dt);
      });
    } else if (anim.moveProps) clearMovers();
  }
  function clearMovers() { if (anim.moveProps) { disposeTree(anim.moveProps); anim.moveProps = null; } movers.forEach(m => disposeTree(m.g)); movers = []; }
  // 직원: 자기 책상에 앉아 일한다
  function updateStaff(S, dt) {
    const staff = preview ? [] : (S.staff || []);
    while (staffPeople.length > staff.length) disposeTree(staffPeople.pop().g);
    staff.forEach((st, i) => {
      let p = staffPeople[i];
      const looks = [{ shirt: '#3d8a4a', hair: '#1b1b1b' }, { shirt: '#8a4ad8', hair: '#c97a3a', longHair: true }, { shirt: '#2f6fed', hair: '#3a2a1a', glasses: true }, { shirt: '#f2a03a', hair: '#e8d090', longHair: true }, { shirt: '#6a7280', hair: '#222' }, { shirt: '#d6453d', hair: '#5a3a2a' }];
      if (!p || p.role !== st.role) { if (p) disposeTree(p.g); p = makePerson(Object.assign({}, looks[i % looks.length], st.role === 'ai' ? { glasses: true } : {})); p.role = st.role; p.x = L.spot.outside.x; p.z = L.spot.outside.z; staffPeople[i] = p; p.path = [L.spot.door]; }
      const seat = anim.staffDesks[i];
      if (seat && (!p.path || !p.path.length)) { p.tx = seat.x; p.tz = seat.z; }
      const mv = followPath(p, dt, 1.8), arrived = !mv && seat && Math.hypot(p.x - seat.x, p.z - seat.z) < 0.05;
      if (arrived) turnTo(p, seat.ry, dt);
      p.g.position.set(p.x, 0, p.z); p.g.rotation.y = p.ry;
      pose(p, { moving: mv, sit: arrived, typing: arrived && (st.mood || 70) > 30, blink: Math.sin(t * 0.7 + i * 2) > 0.97 }, dt);
    });
  }

  // ───────── 방 꾸미기 ─────────
  // 놓인 아이템은 decor.js(DECOR3D)가 모양을 만들고, 여기서는 위치·벽지·바닥재·배치 모드(유령 미리보기)를 맡는다.
  let decorG = null, decorSig = '', decorTicks = [], lastS = null, themeBase = null;
  const place = { opts: null, ghost: null, ghostId: '', tintMats: [], plate: null, grid: null, gridKey: '', raw: null, pos: null, valid: false, ray: null, ndc: null };
  const wallH = () => RW >= 10 ? 3.4 : 3;
  const decorItems = () => root.Engine.DECOR_ITEMS;
  function disposeDeep(o) {
    o.traverse(m => {
      if (m.geometry) m.geometry.dispose();
      if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach(x => x.dispose());
    });
    if (o.parent) o.parent.remove(o);
  }
  function placeObj(o, D, p) {
    if (D.place === 'wall') {
      if (p.wall === 'left') { o.position.set(-RW / 2 + 0.02, p.y, p.z); o.rotation.y = Math.PI / 2; }
      else { o.position.set(p.x, p.y, -RD / 2 + 0.02); o.rotation.y = 0; }
    } else { o.position.set(p.x, 0, p.z); o.rotation.y = (p.rot || 0) * Math.PI / 2; }
  }
  function buildDecor(S) {
    if (decorG) disposeDeep(decorG);
    decorG = new T.Group(); decorG.name = 'decor'; scene.add(decorG); decorTicks = [];
    const D3 = root.DECOR3D, items = decorItems();
    const list = (S.decor && S.decor.placed && S.decor.placed[S.house]) || [];
    if (D3) list.forEach((p, i) => {
      const D = items[p.id]; if (!D || D.place === 'theme') return;
      const o = D3.build(p.id, T);
      o.userData.decorIdx = i;
      o.traverse(m => { if (m.isMesh) m.userData.decorIdx = i; });
      placeObj(o, D, p);
      if (place.opts && place.opts.ignoreIdx === i) o.visible = false;
      decorG.add(o);
      if (o.userData.tick) decorTicks.push(o.userData.tick);
    });
    applyTheme(S);
  }
  // ── 벽지·바닥재: 흰 바탕 무늬에 색을 입힌다 (벽돌만 색 있는 무늬)
  const THEME_TEX = {
    wp_pastel: g => { g.fillStyle = '#fff'; g.fillRect(0, 0, 256, 256); g.fillStyle = 'rgba(255,255,255,.9)'; g.fillStyle = 'rgba(120,90,110,.10)'; for (let y = 0; y < 256; y += 32) for (let x = (y / 32) % 2 * 16; x < 256; x += 32) { g.beginPath(); g.arc(x + 8, y + 8, 4, 0, 7); g.fill(); } },
    wp_mint: g => { g.fillStyle = '#fff'; g.fillRect(0, 0, 256, 256); for (let x = 0; x < 256; x += 32) { g.fillStyle = 'rgba(60,110,90,.10)'; g.fillRect(x, 0, 12, 256); g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(x + 14, 0, 2, 256); } },
    wp_navy: g => { g.fillStyle = '#fff'; g.fillRect(0, 0, 256, 256); g.fillStyle = 'rgba(255,230,160,.55)'; for (let i = 0; i < 40; i++) { const x = rnd(i + 50) * 256, y = rnd(i + 90) * 256, r = 1 + rnd(i) * 1.6; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); } g.strokeStyle = 'rgba(0,0,0,.08)'; for (let y = 0; y < 256; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); } },
    wp_brick: g => { g.fillStyle = '#e9ddd0'; g.fillRect(0, 0, 256, 256); const rows = 12, bh = 256 / rows; for (let r = 0; r < rows; r++) { const off = r % 2 ? 0 : 21; for (let x = -42 + off; x < 256; x += 42) { const l = 40 + rnd(r * 31 + x) * 12, hh = 8 + rnd(r * 7 + x * 3) * 6; g.fillStyle = `hsl(${hh},${42 + rnd(x + r) * 12}%,${l}%)`; g.fillRect(x + 2, r * bh + 2, 38, bh - 4); g.fillStyle = 'rgba(0,0,0,.08)'; g.fillRect(x + 2, r * bh + bh - 5, 38, 3); } } },
    fl_wood: g => { const rows = 8, ph = 512 / rows; for (let r = 0; r < rows; r++) { let x = -((r * 97) % 200); while (x < 512) { const len = 160 + ((r * 31 + x) % 120), l = 86 + rnd(r * 7 + x) * 12; g.fillStyle = `hsl(30,8%,${l}%)`; g.fillRect(x, r * ph, len, ph); g.strokeStyle = 'rgba(40,30,20,.28)'; g.lineWidth = 2; g.strokeRect(x + 1, r * ph + 1, len - 2, ph - 2); for (let k = 0; k < 3; k++) { g.strokeStyle = 'rgba(60,45,30,.10)'; g.beginPath(); const yy = r * ph + 12 + k * 16; g.moveTo(x, yy); g.bezierCurveTo(x + len * .3, yy - 4, x + len * .6, yy + 4, x + len, yy); g.stroke(); } x += len; } } },
    fl_carpet: g => { g.fillStyle = '#f4f4f4'; g.fillRect(0, 0, 512, 512); for (let i = 0; i < 9000; i++) { const v = rnd(i) > 0.5 ? 255 : 120; g.fillStyle = `rgba(${v},${v},${v},${0.06 + rnd(i + 7) * 0.08})`; g.fillRect(rnd(i + 1) * 512, rnd(i + 2) * 512, 2, 2); } g.strokeStyle = 'rgba(0,0,0,.05)'; g.lineWidth = 3; for (let i = 0; i <= 2; i++) { g.beginPath(); g.moveTo(i * 256, 0); g.lineTo(i * 256, 512); g.moveTo(0, i * 256); g.lineTo(512, i * 256); g.stroke(); } },
  };
  function applyTheme(S) {
    if (!wallMat || !floorMat) return;
    if (!themeBase || themeBase.wallMat !== wallMat || themeBase.floorMat !== floorMat) themeBase = { wallMat, floorMat, wc: wallMat.color.clone(), wm: wallMat.map, fc: floorMat.color.clone(), fm: floorMat.map };
    const items = decorItems(), th = (S.decor && S.decor.theme && S.decor.theme[S.house]) || {};
    const w = items[th.wall], f = items[th.floor];
    if (w && w.color && THEME_TEX[th.wall]) {
      wallMat.map = canvasTex('th_' + th.wall, 256, 256, THEME_TEX[th.wall], [3, 1]);
      wallMat.color.set(th.wall === 'wp_brick' ? '#ffffff' : w.color);
    } else { wallMat.map = themeBase.wm; wallMat.color.copy(themeBase.wc); }
    if (f && f.color) {
      const kind = th.floor === 'fl_carpet' ? 'fl_carpet' : 'fl_wood';
      floorMat.map = canvasTex('th_' + kind + RW + 'x' + RD, 512, 512, THEME_TEX[kind], [RW / 4, RD / 4]);
      floorMat.color.set(f.color);
      floorMat.roughness = kind === 'fl_carpet' ? 1 : 0.7;
    } else { floorMat.map = themeBase.fm; floorMat.color.copy(themeBase.fc); floorMat.roughness = 0.7; }
    wallMat.needsUpdate = true; floorMat.needsUpdate = true;
  }
  function updateDecor(S) {
    lastS = S;
    const dc = S.decor;
    const dsig = worldSig + '|' + (dc ? JSON.stringify(dc.placed && dc.placed[S.house]) + JSON.stringify(dc.theme && dc.theme[S.house]) : '') + '|' + !!root.DECOR3D;
    if (dsig !== decorSig) { decorSig = dsig; buildDecor(S); if (place.opts) refreshPlacement(); }
    const env = { night: light.lamp };
    for (const f of decorTicks) f(t, env);
    if (place.opts) {
      const key = S.house + '|' + RW + 'x' + RD + '|' + (decorItems()[place.opts.id] || {}).place;
      if (key !== place.gridKey) buildGrid(S, key);
      if (place.ghost) { const k = 0.42 + 0.14 * Math.sin(t * 6); place.tintMats.forEach(m => { m.emissiveIntensity = k; }); }
    }
  }

  // ── 배치 모드
  function buildGrid(S, key) {
    if (place.grid) { disposeDeep(place.grid); place.grid = null; }
    place.gridKey = key;
    const D = decorItems()[place.opts.id]; if (!D) return;
    const G = new T.Group(); G.name = 'placeGrid'; scene.add(G); place.grid = G;
    const hx = RW / 2, hz = RD / 2, c = root.Engine.DECOR_CELL, pts = [];
    const lineM = new T.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.45, depthWrite: false });
    if (D.place === 'wall') {
      const y0 = 0.9, y1 = 2.6;
      const bm = new T.MeshBasicMaterial({ color: '#7ee0ff', transparent: true, opacity: 0.12, depthWrite: false });
      const b = new T.Mesh(new T.PlaneGeometry(2 * (hx - 0.4), y1 - y0), bm); b.position.set(0, (y0 + y1) / 2, -hz + 0.012); G.add(b);
      const l = new T.Mesh(new T.PlaneGeometry(2 * (hz - 0.4), y1 - y0), bm); l.position.set(-hx + 0.012, (y0 + y1) / 2, 0); l.rotation.y = Math.PI / 2; G.add(l);
      for (let x = -hx + 0.4; x <= hx - 0.4 + 1e-6; x += 0.5) pts.push(x, y0, -hz + 0.014, x, y1, -hz + 0.014);
      for (let y = y0; y <= y1 + 1e-6; y += 0.5) pts.push(-hx + 0.4, y, -hz + 0.014, hx - 0.4, y, -hz + 0.014);
      for (let z = -hz + 0.4; z <= hz - 0.4 + 1e-6; z += 0.5) pts.push(-hx + 0.014, y0, z, -hx + 0.014, y1, z);
      for (let y = y0; y <= y1 + 1e-6; y += 0.5) pts.push(-hx + 0.014, y, -hz + 0.4, -hx + 0.014, y, hz - 0.4);
    } else {
      for (let x = -hx; x <= hx + 1e-6; x += c) pts.push(x, 0.006, -hz, x, 0.006, hz);
      for (let z = -hz; z <= hz + 1e-6; z += c) pts.push(-hx, 0.006, z, hx, 0.006, z);
      // 고정 가구 자리(못 놓는 곳)는 옅은 빨강
      const bm = new T.MeshBasicMaterial({ color: '#ff5a5a', transparent: true, opacity: 0.24, depthWrite: false });
      if (!D.flat) root.Engine.roomLayout(S.house).blocked.forEach(r => {
        const x0 = Math.max(-hx, r[0]), x1 = Math.min(hx, r[2]), z0 = Math.max(-hz, r[1]), z1 = Math.min(hz, r[3]);
        if (x1 <= x0 || z1 <= z0) return;
        const m = new T.Mesh(new T.PlaneGeometry(x1 - x0, z1 - z0), bm); m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, 0.005, (z0 + z1) / 2); G.add(m);
      });
    }
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(pts, 3));
    const ls = new T.LineSegments(geo, lineM); ls.renderOrder = 3; G.add(ls);
  }
  function makeGhost(id) {
    const D = decorItems()[id];
    place.tintMats = []; place.ghostId = id;
    if (!root.DECOR3D || !D) { place.ghost = null; return; }
    const o = root.DECOR3D.build(id, T);
    o.traverse(m => {
      if (!m.isMesh) return;
      m.castShadow = false; m.receiveShadow = false;
      const conv = x => {
        const c = x.clone();
        c.transparent = true; c.opacity = Math.min(x.opacity == null ? 1 : x.opacity, 0.72);
        if (c.emissive) { c.emissive = new T.Color('#3dff8a'); c.emissiveIntensity = 0.45; c.emissiveMap = null; place.tintMats.push(c); }
        return c;
      };
      m.material = Array.isArray(m.material) ? m.material.map(conv) : conv(m.material);
    });
    // 바닥: 차지하는 칸 / 벽: 붙는 자리
    const c = root.Engine.DECOR_CELL;
    const pm = new T.MeshBasicMaterial({ color: '#3dff8a', transparent: true, opacity: 0.35, depthWrite: false });
    const plate = D.place === 'wall' ? new T.Mesh(new T.PlaneGeometry(0.66, 0.56), pm) : new T.Mesh(new T.PlaneGeometry(D.w * c - 0.02, D.d * c - 0.02), pm);
    if (D.place === 'wall') plate.position.z = 0.006; else { plate.rotation.x = -Math.PI / 2; plate.position.y = 0.012; }
    plate.renderOrder = 4; o.add(plate); place.plate = pm;
    o.userData.tick = null;
    scene.add(o); place.ghost = o;
  }
  function setPlacement(opts) {
    if (fallback || !renderer) return;
    if (!place.ray) { place.ray = new T.Raycaster(); place.ndc = new T.Vector2(); }
    place.opts = opts && decorItems()[opts.id] && decorItems()[opts.id].place !== 'theme' ? Object.assign({ rot: 0 }, opts) : null;
    if (place.ghost && (!place.opts || place.opts.id !== place.ghostId)) { disposeDeep(place.ghost); place.ghost = null; place.ghostId = ''; }
    if (decorG) decorG.children.forEach(o => { o.visible = !(place.opts && place.opts.ignoreIdx === o.userData.decorIdx); });
    if (!place.opts) {
      if (place.grid) { disposeDeep(place.grid); place.grid = null; place.gridKey = ''; }
      place.pos = null; place.valid = false; place.raw = null;
      return;
    }
    const D = decorItems()[place.opts.id];
    if (place.raw && place.raw.kind !== D.place) place.raw = null;
    if (!place.ghost) makeGhost(place.opts.id);
    if (lastS) { const key = lastS.house + '|' + RW + 'x' + RD + '|' + D.place; if (key !== place.gridKey) buildGrid(lastS, key); }
    if (!place.raw) {
      // 처음 위치: 옮기는 중이면 원래 자리, 아니면 방 가운데(바닥)·뒷벽 가운데(벽)
      const list = lastS && lastS.decor && lastS.decor.placed[lastS.house] || [], cur = place.opts.ignoreIdx != null ? list[place.opts.ignoreIdx] : null;
      if (cur && D.place === 'wall') place.raw = { kind: 'wall', wall: cur.wall, v: cur.wall === 'left' ? cur.z : cur.x, y: cur.y };
      else if (cur) place.raw = { kind: 'floor', x: cur.x, z: cur.z };
      else place.raw = D.place === 'wall' ? { kind: 'wall', wall: 'back', v: 0, y: 1.6 } : { kind: 'floor', x: 0, z: 0.5 };
    }
    refreshPlacement();
  }
  function refreshPlacement() {
    if (!place.opts || !place.raw || !lastS) return;
    const S = lastS, id = place.opts.id, D = decorItems()[id], hx = RW / 2, hz = RD / 2, c = root.Engine.DECOR_CELL;
    const ok = p => root.Engine.canPlace(S, id, p, place.opts.ignoreIdx);
    let pos;
    if (D.place === 'wall') {
      const r = place.raw, span = r.wall === 'left' ? hz : hx;
      const v = Math.max(-(span - 0.4), Math.min(span - 0.4, Math.round(r.v / 0.25) * 0.25));
      const y = Math.max(1.0, Math.min(2.5, Math.round(r.y / 0.25) * 0.25));
      pos = r.wall === 'left' ? { wall: 'left', z: v, y } : { wall: 'back', x: v, y };
      place.valid = ok(pos) && !wallBlocked(pos);
    } else {
      const rot = ((place.opts.rot || 0) % 4 + 4) % 4, w = (rot % 2 ? D.d : D.w) * c, d = (rot % 2 ? D.w : D.d) * c;
      const snap = (v, s, h) => Math.max(-h + s / 2, Math.min(h - s / 2, Math.round((v - s / 2) / c) * c + s / 2));
      let x = snap(place.raw.x, w, hx), z = snap(place.raw.z, d, hz);
      pos = { x: +x.toFixed(3), z: +z.toFixed(3), rot };
      place.valid = ok(pos);
      if (!place.valid) {
        // 벽에 딱 붙은 칸은 엔진 여유(5cm)만큼 안쪽으로 밀어서 다시 본다
        const e = 0.05;
        if (x - w / 2 < -hx + e) x = -hx + e + w / 2; if (x + w / 2 > hx - e) x = hx - e - w / 2;
        if (z - d / 2 < -hz + e) z = -hz + e + d / 2; if (z + d / 2 > hz - e) z = hz - e - d / 2;
        const p2 = { x: +x.toFixed(3), z: +z.toFixed(3), rot };
        if ((p2.x !== pos.x || p2.z !== pos.z) && ok(p2)) { pos = p2; place.valid = true; }
      }
    }
    place.pos = pos;
    if (place.ghost) {
      placeObj(place.ghost, D, pos);
      if (D.place === 'wall') place.ghost.position[pos.wall === 'left' ? 'x' : 'z'] += 0.01;
      const col = place.valid ? '#3dff8a' : '#ff4a4a';
      place.tintMats.forEach(m => m.emissive.set(col));
      if (place.plate) place.plate.color.set(col);
    }
  }
  // 창문·문과 겹치는 벽 자리는 장면 쪽에서 막는다
  function wallBlocked(p) {
    if (lastS && root.Engine.HOUSES[lastS.house].wall === 'glass') return false;
    if (p.wall === 'back') { const W = L.win; return Math.abs(p.x - W.x) < W.w / 2 + 0.3 && p.y > 1.0 - 0.25 && p.y < 2.4 + 0.25; }
    return Math.abs(p.z - L.door.z) < 0.5 + 0.3 && p.y - 0.3 < 2.15;
  }
  function pointerRay(cx, cy) {
    const r = cv.getBoundingClientRect();
    place.ndc.set((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    place.ray.setFromCamera(place.ndc, camera);
    return place.ray.ray;
  }
  function placementPointer(cx, cy) {
    if (fallback || !renderer || !place.opts) return null;
    const ray = pointerRay(cx, cy), D = decorItems()[place.opts.id], hx = RW / 2, hz = RD / 2, WH = wallH();
    const v = new T.Vector3();
    if (D.place === 'wall') {
      let best = null;
      if (ray.intersectPlane(new T.Plane(new T.Vector3(0, 0, 1), hz), v) && Math.abs(v.x) <= hx && v.y >= 0 && v.y <= WH + 0.5) best = { d: v.distanceTo(ray.origin), wall: 'back', v: v.x, y: v.y };
      if (ray.intersectPlane(new T.Plane(new T.Vector3(1, 0, 0), hx), v) && Math.abs(v.z) <= hz && v.y >= 0 && v.y <= WH + 0.5) { const d = v.distanceTo(ray.origin); if (!best || d < best.d) best = { d, wall: 'left', v: v.z, y: v.y }; }
      if (!best && ray.intersectPlane(new T.Plane(new T.Vector3(0, 1, 0), 0), v)) {
        const y = place.raw && place.raw.y || 1.6;
        best = (v.z + hz) < (v.x + hx) ? { wall: 'back', v: v.x, y } : { wall: 'left', v: v.z, y };
      }
      if (best) place.raw = { kind: 'wall', wall: best.wall, v: best.v, y: best.y };
    } else if (ray.intersectPlane(new T.Plane(new T.Vector3(0, 1, 0), 0), v)) place.raw = { kind: 'floor', x: v.x, z: v.z };
    refreshPlacement();
    return { pos: place.pos, valid: place.valid };
  }
  function placementConfirm() {
    if (fallback || !place.opts || !place.pos || !place.valid) return false;
    const pos = Object.assign({}, place.pos), cb = place.opts.onPick;
    if (cb) cb(pos);
    return true;
  }
  function pickDecorAt(cx, cy) {
    if (fallback || !renderer || !decorG || !decorG.children.length) return -1;
    if (!place.ray) { place.ray = new T.Raycaster(); place.ndc = new T.Vector2(); }
    pointerRay(cx, cy);
    const hits = place.ray.intersectObjects(decorG.children.filter(o => o.visible), true);
    for (const h of hits) if (h.object.userData.decorIdx != null && h.object.material && !(h.object.material.blending === T.AdditiveBlending)) return h.object.userData.decorIdx;
    return -1;
  }

  // 방 안 물건(냉장고·침대·문) 누르기
  function pickSpot(cx, cy) {
    if (fallback || !renderer || !roomG) return null;
    if (!place.ray) { place.ray = new T.Raycaster(); place.ndc = new T.Vector2(); }
    pointerRay(cx, cy);
    const hits = place.ray.intersectObjects(roomG.children, true);
    for (const h of hits.slice(0, 3)) { let o = h.object; while (o && o !== roomG) { if (o.userData && o.userData.spot) return o.userData.spot; o = o.parent; } }
    return null;
  }
  function tapFx(x, y) { if (fallback) return fallback.tapFx(x, y); floatText('+작업!', x + (Math.random() - 0.5) * 40, y, 'tap'); }
  function toLogical(cx, cy) { if (fallback) return fallback.toLogical(cx, cy); return { x: cx, y: cy }; }

  root.Scene = { init, frame, tapFx, toLogical, resize, setInset, setDock, setPreview, setLowGfx, is3D: () => !fallback,
    setPlacement, placementPointer, placementConfirm, pickDecorAt, pickSpot };
})(window);
