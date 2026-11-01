/* 방 안 장면 3D — Three.js 로우폴리 미니어처 방 (비스듬히 내려다보는 시점).
 * 게임 상태 S를 읽기만 한다. WebGL을 못 쓰는 기기에서는 2D 장면(Scene2D)으로 대신한다.
 * 그림 파일 없이 기본 도형과 코드로 만든 무늬로 그린다.
 */
(function (root) {
  'use strict';
  const T = root.THREE;
  let fallback = null;
  let renderer, scene, camera, cv, labelsEl, flashEl;
  let insetCss = 140, dockCss = 70;
  let t = 0, built = false, lastSig = '';
  let hemi, sun, deskLamp, monitorLight, filmLight, doorLight;
  let roomG, equipG, glass, floorMat, wallMat, backdropTex;
  const anim = { steam: [], sparks: [], rgb: [], ringMats: [], softMats: [], recDot: null, monitorMats: [] };
  let player, courier = null, editor = null;
  let bubbleEl, lastBubble = '';
  let lastIncome = null, lastSubs = null, lastVid = 0, floatAcc = 0, accMoney = 0, accSubs = 0, blinkAt = 2;
  const light = { sun: 1, hemi: 0.6, lamp: 0, sky: new T.Color('#8fd0ff'), sunCol: new T.Color('#fff1d6') };

  // ───────── 색 ─────────
  const C = {
    skin: '#f3c9a1', hair: '#2b1d14', shirt: '#e5484d', pants: '#30406b', shoe: '#22252d',
    wood: '#a8713f', woodD: '#7c4f2b', metal: '#3a3d46', dark: '#1d1f25',
  };
  const mat = (c, o) => new T.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.75, metalness: 0.05 }, o || {}));
  const flat = (c, o) => new T.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.8, flatShading: true }, o || {}));
  const glow = (c, i) => new T.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: i == null ? 1 : i, roughness: 0.4 });

  function mesh(geo, m, x, y, z, parent, opt) {
    const o = new T.Mesh(geo, m);
    o.position.set(x || 0, y || 0, z || 0);
    o.castShadow = !(opt && opt.noCast); o.receiveShadow = true;
    (parent || scene).add(o);
    return o;
  }
  const box = (w, h, d, m, x, y, z, p, opt) => mesh(new T.BoxGeometry(w, h, d), m, x, y, z, p, opt);
  const cyl = (rt, rb, h, m, x, y, z, p, seg) => mesh(new T.CylinderGeometry(rt, rb, h, seg || 16), m, x, y, z, p);
  const sph = (r, m, x, y, z, p, ws, hs) => mesh(new T.SphereGeometry(r, ws || 14, hs || 10), m, x, y, z, p);

  // ───────── 코드로 만드는 무늬 ─────────
  function canvasTex(w, h, draw, repeat) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const tx = new T.CanvasTexture(c); tx.encoding = T.sRGBEncoding; tx.anisotropy = 4;
    if (repeat) { tx.wrapS = tx.wrapT = T.RepeatWrapping; tx.repeat.set(repeat[0], repeat[1]); }
    return tx;
  }
  function woodTex() {
    return canvasTex(512, 512, (g, w, h) => {
      const rows = 8, ph = h / rows;
      for (let r = 0; r < rows; r++) {
        let x = -((r * 97) % 200);
        while (x < w) {
          const len = 160 + ((r * 31 + x) % 120);
          const l = 62 + ((r * 13 + Math.abs(x)) % 9) - 4;
          g.fillStyle = `hsl(30, 45%, ${l}%)`; g.fillRect(x, r * ph, len, ph);
          g.strokeStyle = 'rgba(70,40,15,.35)'; g.lineWidth = 2; g.strokeRect(x + 1, r * ph + 1, len - 2, ph - 2);
          for (let k = 0; k < 4; k++) { g.strokeStyle = 'rgba(90,55,25,.12)'; g.beginPath(); const yy = r * ph + 8 + k * 14 + (x % 7); g.moveTo(x, yy); g.bezierCurveTo(x + len * 0.3, yy - 4, x + len * 0.6, yy + 4, x + len, yy); g.stroke(); }
          x += len;
        }
      }
    }, [2, 2]);
  }
  function wallTex() {
    return canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 32) { g.fillStyle = 'rgba(0,0,0,.05)'; g.fillRect(x, 0, 16, h); }
      for (let y = 8; y < h; y += 32) for (let x = 24; x < w; x += 32) { g.fillStyle = 'rgba(0,0,0,.06)'; g.beginPath(); g.arc(x, y + (x % 64 ? 16 : 0), 2.5, 0, 7); g.fill(); }
    }, [3, 1]);
  }
  function textTex(text, bg, fg, w, h) {
    return canvasTex(w || 512, h || 256, (g, W, H) => {
      g.fillStyle = bg; g.fillRect(0, 0, W, H);
      g.fillStyle = fg; let fs = H * 0.28;
      const font = n => `800 ${n}px -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif`;
      g.font = font(fs); while (g.measureText(text).width > W * 0.86 && fs > 10) { fs -= 2; g.font = font(fs); }
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, W / 2, H / 2);
    });
  }

  // ───────── 사람 (2등신 로우폴리) ─────────
  function makePerson(c) {
    c = Object.assign({ skin: C.skin, hair: C.hair, shirt: C.shirt, pants: C.pants }, c || {});
    const g = new T.Group(); scene.add(g);
    const skinM = flat(c.skin), shirtM = flat(c.shirt), pantsM = flat(c.pants), hairM = flat(c.hair), shoeM = flat(C.shoe), eyeM = mat('#1b1b1f');
    const body = new T.Group(); g.add(body);
    const torso = mesh(new T.CapsuleGeometry(0.2, 0.24, 4, 10), shirtM, 0, 0.86, 0, body);
    torso.scale.set(1, 1, 0.8);
    const head = new T.Group(); head.position.set(0, 1.36, 0); body.add(head);
    sph(0.28, skinM, 0, 0, 0, head, 16, 12);
    const hairTop = mesh(new T.SphereGeometry(0.3, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), hairM, 0, 0.03, -0.01, head);
    const hairBack = mesh(new T.SphereGeometry(0.295, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), hairM, 0, -0.02, -0.02, head);
    hairBack.rotation.x = -Math.PI / 2;
    box(0.36, 0.06, 0.12, hairM, 0, 0.17, 0.2, head);                               // 앞머리
    if (c.cap) { cyl(0.31, 0.31, 0.1, flat(c.cap), 0, 0.14, 0, head, 16); box(0.3, 0.03, 0.2, flat(c.cap), 0, 0.1, 0.3, head); }
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
    return { g, body, head, eyes, mouth, armL, armR, legL, legR, carry, x: 0, z: 0, ry: 0, phase: 0, tx: 0, tz: 0 };
  }
  function pose(p, k, dt) {
    // k: { moving, sit, lie, typing, talk, blink }
    p.phase += dt * (k.moving ? 9 : 6);
    const s = Math.sin(p.phase);
    const set = (o, x, z) => { o.rotation.x += (x - o.rotation.x) * Math.min(1, dt * 14); o.rotation.z += ((z || 0) - o.rotation.z) * Math.min(1, dt * 14); };
    p.body.position.y = 0; p.g.rotation.x = 0;
    if (k.lie) {
      p.g.rotation.x = -Math.PI / 2;
      set(p.legL, 0); set(p.legR, 0); set(p.armL, 0, -0.1); set(p.armR, 0, 0.1);
    } else if (k.sit) {
      p.body.position.y = -0.06;
      set(p.legL, -1.5); set(p.legR, -1.5);
      if (k.typing) { set(p.armL, -1.25 + s * 0.12); set(p.armR, -1.25 - s * 0.12); }
      else if (k.talk) { set(p.armL, -0.3); set(p.armR, -1.9 + s * 0.35, 0.25 + s * 0.15); }
      else { set(p.armL, -0.5); set(p.armR, -0.5); }
    } else if (k.moving) {
      p.body.position.y = Math.abs(s) * 0.04;
      set(p.legL, s * 0.65); set(p.legR, -s * 0.65);
      if (p.carry) { set(p.armL, -1.3); set(p.armR, -1.3); } else { set(p.armL, -s * 0.55); set(p.armR, s * 0.55); }
    } else {
      p.body.position.y = Math.sin(t * 2) * 0.008;
      set(p.legL, 0); set(p.legR, 0);
      if (p.carry) { set(p.armL, -1.3); set(p.armR, -1.3); } else { set(p.armL, 0, -0.06); set(p.armR, 0, 0.06); }
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
  function turnTo(p, ang, dt) {
    let diff = ang - p.ry; while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2;
    p.ry += diff * Math.min(1, dt * 10);
  }

  // ───────── 방 구조 (한 번) ─────────
  const SPOT = {
    desk: { x: -2.0, z: -2.72, ry: Math.PI }, film: { x: 2.75, z: -2.55, ry: 0 },
    bed: { x: -3.0, z: 3.35 }, door: { x: -3.75, z: 1.5 }, side: { x: 0.3, z: 1.75, ry: Math.PI },
  };
  function buildRoom() {
    roomG = new T.Group(); scene.add(roomG);
    floorMat = mat('#ffffff', { map: woodTex(), roughness: 0.7 });
    const fl = box(8.2, 0.25, 8.2, floorMat, -0.1, -0.125, -0.1, roomG); fl.castShadow = false;
    box(8.4, 0.3, 8.4, mat('#3b2a20'), -0.1, -0.4, -0.1, roomG);              // 바닥 받침 (미니어처 느낌)
    wallMat = mat('#ffffff', { map: wallTex() });
    const H = 3, th = 0.2;
    // 뒷벽 (창문 구멍)
    const bz = -4.1, wx0 = 0.4, wx1 = 2.0, wy0 = 1.1, wy1 = 2.4;
    box(wx0 + 4.2, H, th, wallMat, (-4.2 + wx0) / 2, H / 2, bz, roomG);
    box(4.0 - wx1, H, th, wallMat, (wx1 + 4.0) / 2, H / 2, bz, roomG);
    box(wx1 - wx0, wy0, th, wallMat, (wx0 + wx1) / 2, wy0 / 2, bz, roomG);
    box(wx1 - wx0, H - wy1, th, wallMat, (wx0 + wx1) / 2, (wy1 + H) / 2, bz, roomG);
    // 창틀·유리·창턱
    const frameM = mat('#f4efe6');
    [[wx0, 0.06], [wx1, 0.06]].forEach(([x]) => box(0.08, wy1 - wy0 + 0.08, 0.26, frameM, x, (wy0 + wy1) / 2, bz, roomG));
    box(wx1 - wx0, 0.08, 0.26, frameM, (wx0 + wx1) / 2, wy1, bz, roomG);
    box(wx1 - wx0 + 0.3, 0.07, 0.38, frameM, (wx0 + wx1) / 2, wy0, bz + 0.08, roomG);
    box(0.05, wy1 - wy0, 0.1, frameM, (wx0 + wx1) / 2, (wy0 + wy1) / 2, bz, roomG);
    box(wx1 - wx0, 0.05, 0.1, frameM, (wx0 + wx1) / 2, (wy0 + wy1) / 2, bz, roomG);
    glass = new T.Mesh(new T.PlaneGeometry(wx1 - wx0, wy1 - wy0), new T.MeshBasicMaterial({ color: '#8fd0ff' }));
    glass.position.set((wx0 + wx1) / 2, (wy0 + wy1) / 2, bz - 0.06); roomG.add(glass);
    // 창밖 건물 실루엣
    const cityM = new T.MeshBasicMaterial({ color: '#5a6a9a' });
    [[0.6, 0.35], [0.95, 0.55], [1.3, 0.3], [1.65, 0.45]].forEach(([x, h]) => { const b = new T.Mesh(new T.PlaneGeometry(0.3, h), cityM); b.position.set(x, wy0 + h / 2, bz - 0.05); roomG.add(b); anim.city = cityM; });
    // 왼쪽 벽 (문 구멍)
    const lx = -4.1, dz0 = 1.0, dz1 = 2.0, dh = 2.15;
    box(th, H, dz0 + 4.2, wallMat, lx, H / 2, (-4.2 + dz0) / 2, roomG);
    box(th, H, 4.0 - dz1, wallMat, lx, H / 2, (dz1 + 4.0) / 2, roomG);
    box(th, H - dh, dz1 - dz0, wallMat, lx, (dh + H) / 2, (dz0 + dz1) / 2, roomG);
    const doorM = mat('#8a5b34');
    box(0.08, dh, dz1 - dz0, doorM, lx + 0.06, dh / 2, (dz0 + dz1) / 2, roomG);
    box(0.1, 0.7, 0.7, mat('#7a4e2c'), lx + 0.08, 1.55, (dz0 + dz1) / 2, roomG);
    box(0.1, 0.8, 0.7, mat('#7a4e2c'), lx + 0.08, 0.6, (dz0 + dz1) / 2, roomG);
    sph(0.05, mat('#e8c45a', { metalness: 0.6, roughness: 0.3 }), lx + 0.16, 1.05, dz1 - 0.15, roomG);
    // 걸레받이
    box(8.2, 0.12, 0.04, mat('#d9cfc0'), -0.1, 0.06, -3.98, roomG);
    box(0.04, 0.12, 8.2, mat('#d9cfc0'), -3.98, 0.06, -0.1, roomG);

    // 책상
    const dk = new T.Group(); dk.position.set(-2.0, 0, -3.55); roomG.add(dk);
    box(2.4, 0.08, 0.85, mat(C.wood), 0, 0.76, 0, dk);
    [[-1.12, -0.36], [1.12, -0.36], [-1.12, 0.36], [1.12, 0.36]].forEach(([x, z]) => box(0.07, 0.72, 0.07, mat(C.woodD), x, 0.36, z, dk));
    box(0.5, 0.5, 0.75, mat(C.woodD), 0.9, 0.5, 0, dk);                         // 서랍
    box(0.46, 0.02, 0.02, mat('#d8c39a'), 0.9, 0.62, 0.38, dk);
    // 머그
    cyl(0.07, 0.06, 0.14, mat('#f2f2f2'), -0.95, 0.87, 0.15, dk); cyl(0.06, 0.06, 0.01, mat('#5b3418'), -0.95, 0.94, 0.15, dk);
    for (let i = 0; i < 4; i++) { const st = sph(0.035, new T.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5 }), -2.95, 1, -3.4, scene, 6, 4); st.castShadow = false; anim.steam.push({ m: st, k: i / 4 }); }
    // 의자 (사무용)
    const ch = new T.Group(); ch.position.set(SPOT.desk.x, 0, SPOT.desk.z); roomG.add(ch); anim.chair = ch;
    cyl(0.04, 0.04, 0.36, mat(C.metal), 0, 0.24, 0, ch);
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; const leg = box(0.32, 0.04, 0.05, mat(C.dark), Math.sin(a) * 0.15, 0.05, Math.cos(a) * 0.15, ch); leg.rotation.y = a + Math.PI / 2; }
    box(0.55, 0.08, 0.5, mat('#3b3f4b'), 0, 0.46, 0, ch);
    box(0.5, 0.42, 0.07, mat('#454a58'), 0, 0.72, 0.27, ch);                     // 등받이 (몸 뒤쪽, 낮게)
    // 침대
    const bd = new T.Group(); bd.position.set(-3.0, 0, 2.5); roomG.add(bd);
    box(1.5, 0.35, 2.5, mat('#6e4a2c'), 0, 0.2, 0, bd);
    box(1.5, 0.75, 0.12, mat('#5a3b22'), 0, 0.5, -1.25, bd);
    box(1.4, 0.2, 2.35, mat('#f1ecf7'), 0, 0.47, 0.02, bd);
    box(0.9, 0.14, 0.42, mat('#ffffff'), 0, 0.62, -0.88, bd);
    anim.blanket = box(1.44, 0.12, 1.5, mat('#5d72d6'), 0, 0.6, 0.45, bd);
    box(1.45, 0.02, 0.1, mat('#7b8ee6'), 0, 0.665, -0.28, bd);
    // 스툴 (촬영용)
    const sl = new T.Group(); sl.position.set(SPOT.film.x, 0, SPOT.film.z); roomG.add(sl);
    cyl(0.24, 0.24, 0.06, mat('#9b6a3e'), 0, 0.46, 0, sl);
    for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + 0.6; const l = cyl(0.025, 0.025, 0.46, mat('#5a3a20'), Math.sin(a) * 0.15, 0.22, Math.cos(a) * 0.15, sl, 6); l.rotation.z = Math.sin(a) * 0.12; l.rotation.x = -Math.cos(a) * 0.12; }

    equipG = new T.Group(); scene.add(equipG);
    built = true;
  }

  // ───────── 장비·공간 (상태가 바뀔 때마다 다시 만듦) ─────────
  function clearGroup(g) { while (g.children.length) { const c = g.children.pop(); c.traverse(o => { if (o.geometry) o.geometry.dispose(); }); } }
  function buildEquip(S) {
    clearGroup(equipG);
    anim.rgb = []; anim.ringMats = []; anim.softMats = []; anim.monitorMats = []; anim.recDot = null;
    const e = S.equip, sp = e.space, G = equipG;
    // 공간 단계별 벽·바닥 색
    wallMat.color.set(['#efe4d0', '#8f9ab3', '#7880a8', '#5a6290'][sp]);
    floorMat.color.set(['#ffffff', '#efe2d2', '#d8c3ae', '#bfa894'][sp]);
    // 책상 위 컴퓨터
    const pcLv = e.ram + e.ssd + e.cpu + e.gpu, dx = -2.0, dz = -3.55, top = 0.8;
    const screenM = () => { const m = glow('#2c4170', 0.9); anim.monitorMats.push(m); return m; };
    if (pcLv === 0) {
      box(0.6, 0.03, 0.4, mat('#a7adb5', { metalness: 0.5 }), dx, top + 0.015, dz + 0.05, G);
      const lid = box(0.6, 0.4, 0.03, mat('#888d95', { metalness: 0.5 }), dx, top + 0.2, dz - 0.15, G); lid.rotation.x = -0.25;
      const sc = box(0.54, 0.34, 0.01, screenM(), dx, top + 0.2, dz - 0.13, G); sc.rotation.x = -0.25;
    } else {
      box(0.16, 0.3, 0.12, mat(C.dark), dx, top + 0.15, dz - 0.2, G); box(0.3, 0.02, 0.22, mat(C.dark), dx, top + 0.01, dz - 0.2, G);
      box(0.95, 0.56, 0.05, mat('#15171d'), dx, top + 0.5, dz - 0.22, G); box(0.88, 0.49, 0.01, screenM(), dx, top + 0.5, dz - 0.19, G);
      if (e.gpu >= 2) { const m2 = box(0.6, 0.4, 0.05, mat('#15171d'), dx + 0.82, top + 0.42, dz - 0.12, G); m2.rotation.y = -0.4; const s2 = box(0.54, 0.34, 0.01, screenM(), dx + 0.81, top + 0.42, dz - 0.095, G); s2.rotation.y = -0.4; box(0.1, 0.22, 0.1, mat(C.dark), dx + 0.82, top + 0.11, dz - 0.12, G); }
      box(0.7, 0.03, 0.22, mat('#2d3038'), dx, top + 0.015, dz + 0.15, G);    // 키보드
      box(0.08, 0.03, 0.12, mat('#2d3038'), dx + 0.5, top + 0.015, dz + 0.17, G);
      // 본체 (책상 옆 바닥)
      box(0.28, 0.6, 0.6, mat('#2a2c33', { metalness: 0.3 }), dx + 1.45, 0.3, dz + 0.05, G);
      if (e.gpu >= 1) for (let i = 0; i < 3; i++) { const m = glow('#ff00ff', 1.4); anim.rgb.push({ m, k: i }); box(0.01, 0.04, 0.45, m, dx + 1.3, 0.15 + i * 0.18, dz + 0.05, G, { noCast: true }); }
    }
    // 마이크
    if (e.mic === 1) { cyl(0.05, 0.08, 0.03, mat(C.dark), dx - 0.65, top + 0.015, dz + 0.1, G); cyl(0.012, 0.012, 0.2, mat(C.metal), dx - 0.65, top + 0.12, dz + 0.1, G); cyl(0.045, 0.045, 0.16, mat('#2b2b30', { metalness: 0.4 }), dx - 0.65, top + 0.28, dz + 0.1, G); }
    if (e.mic === 2) { cyl(0.02, 0.02, 0.7, mat(C.metal), dx - 1.0, top + 0.35, dz - 0.3, G); const arm = box(0.6, 0.025, 0.025, mat(C.metal), dx - 0.72, top + 0.68, dz - 0.15, G); arm.rotation.y = -0.5; const mc = cyl(0.05, 0.05, 0.22, mat('#18181c', { metalness: 0.4 }), dx - 0.45, top + 0.6, dz, G); mc.rotation.z = Math.PI / 2; }
    // 촬영 구역
    const fx = SPOT.film.x, fz = SPOT.film.z;
    if (sp >= 2) {   // 배경천 + 스탠드
      [-0.9, 0.9].forEach(o => cyl(0.025, 0.025, 2.3, mat(C.metal), fx + o, 1.15, -3.75, G, 8));
      box(1.85, 0.03, 0.03, mat(C.metal), fx, 2.3, -3.75, G);
      backdropTex = textTex('▶ ' + (S.channel || ''), '#1fa69c', '#ffffff', 512, 512);
      box(1.75, 2.05, 0.02, mat('#ffffff', { map: backdropTex }), fx, 1.25, -3.74, G);
    }
    const lights = e.light === 1 ? [[0.75, -0.2, 'ring']] : e.light === 2 ? [[-0.85, 0.35, 'soft'], [0.85, 0.35, 'soft']] : [];
    for (const [ox, oz, kind] of lights) {
      const lx = fx + ox, lz = fz + 0.9 + oz;
      for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; const l = cyl(0.015, 0.015, 0.7, mat(C.dark), lx + Math.sin(a) * 0.14, 0.32, lz + Math.cos(a) * 0.14, G, 6); l.rotation.set(-Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4); }
      cyl(0.02, 0.02, 1.2, mat(C.metal), lx, 1.2, lz, G, 6);
      if (kind === 'ring') { const m = glow('#fff8e0', 0.4); anim.ringMats.push(m); const r = mesh(new T.TorusGeometry(0.28, 0.035, 8, 28), m, lx, 1.85, lz, G); r.rotation.y = Math.atan2(fx - lx, fz - lz); }
      else { const sb = new T.Group(); sb.position.set(lx, 1.9, lz); sb.rotation.y = Math.atan2(fx - lx, fz - lz); G.add(sb); box(0.55, 0.45, 0.22, mat('#222'), 0, 0, -0.1, sb); const m = glow('#fffbe6', 0.3); anim.softMats.push(m); box(0.5, 0.4, 0.01, m, 0, 0, 0.02, sb, { noCast: true }); }
    }
    // 삼각대 카메라 (스툴을 바라봄)
    const cx = fx, cz = fz + 2.0;
    for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2 + 0.3; const l = cyl(0.015, 0.015, 1.05, mat(C.dark), cx + Math.sin(a) * 0.18, 0.5, cz + Math.cos(a) * 0.18, G, 6); l.rotation.set(-Math.cos(a) * 0.32, 0, Math.sin(a) * 0.32); }
    const camG = new T.Group(); camG.position.set(cx, 1.05, cz); camG.rotation.y = Math.PI; G.add(camG);
    if (e.camera === 0) { box(0.09, 0.17, 0.02, mat(C.dark), 0, 0.1, 0, camG); }
    else if (e.camera === 1) { box(0.26, 0.17, 0.12, mat('#2f3138', { metalness: 0.3 }), 0, 0.09, 0, camG); const ln = cyl(0.06, 0.06, 0.14, mat('#111'), 0, 0.09, 0.12, camG); ln.rotation.x = Math.PI / 2; }
    else { box(0.34, 0.26, 0.38, mat('#1b1c20', { metalness: 0.3 }), 0, 0.14, 0, camG); const ln = cyl(0.09, 0.09, 0.26, mat('#0b0b0b'), 0, 0.14, 0.3, camG); ln.rotation.x = Math.PI / 2; box(0.18, 0.12, 0.14, mat(C.metal), 0.06, 0.34, -0.06, camG); }
    anim.recDot = sph(0.025, glow('#ff2d2d', 0), 0.1, 0.22, 0.06, camG, 8, 6);
    // 공간 소품
    if (sp >= 1) { // 흡음재 (왼쪽 벽) + 커튼
      for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) box(0.06, 0.42, 0.42, mat((i + j) % 2 ? '#2b2f3e' : '#3a3f53', { roughness: 1 }), -3.97, 1.5 + j * 0.46, -3.3 + i * 0.46, G);
      [0.15, 2.25].forEach(x => { const cu = box(0.32, 1.7, 0.08, flat('#9b3440'), x, 1.65, -3.92, G); cu.scale.x = 1; });
      box(2.6, 0.03, 0.03, mat(C.metal), 1.2, 2.55, -3.9, G);
    }
    if (sp >= 2) { // 러그·화분
      const rug = cyl(1.3, 1.3, 0.02, mat('#93507a', { roughness: 1 }), 0.4, 0.011, 1.1, G, 32); rug.castShadow = false;
      const rug2 = cyl(0.9, 0.9, 0.022, mat('#7c3d63', { roughness: 1 }), 0.4, 0.013, 1.1, G, 32); rug2.castShadow = false;
      cyl(0.18, 0.14, 0.32, flat('#b3653a'), -3.6, 0.16, -0.5, G, 10);
      [[0, 0.55, 0, 0.26], [0.12, 0.72, 0.05, 0.18], [-0.1, 0.75, -0.06, 0.17]].forEach(([x, y, z, r]) => sph(r, flat('#2f8f55'), -3.6 + x, y, -0.5 + z, G, 7, 5));
    }
    if (sp >= 3) { // 소파·ON AIR
      const so = new T.Group(); so.position.set(2.5, 0, 3.3); so.rotation.y = Math.PI; G.add(so);
      box(1.9, 0.4, 0.8, flat('#5b70a8'), 0, 0.25, 0, so); box(1.9, 0.55, 0.22, flat('#475a8c'), 0, 0.6, 0.32, so);
      [-1.0, 1.0].forEach(x => box(0.22, 0.6, 0.8, flat('#475a8c'), x, 0.35, 0, so));
      const sign = box(0.9, 0.3, 0.04, mat('#ffffff', { map: textTex('ON AIR', '#200a14', '#ff4f74', 512, 170), emissive: '#ff4f74', emissiveIntensity: 0.25 }), 3.2, 2.5, -3.98, G);
      sign.castShadow = false;
    }
    // 수료증 액자 (뒷벽 책상 위)
    let n = 0;
    for (const k of ['edu_edit', 'edu_thumb', 'edu_plan', 'edu_growth', 'edu_mentor']) if (e[k]) {
      const x = -3.4 + n * 0.42; n++;
      box(0.32, 0.4, 0.03, mat('#b48a3a', { metalness: 0.4 }), x, 2.25, -3.98, G);
      box(0.26, 0.34, 0.01, mat('#fffaf0'), x, 2.25, -3.96, G, { noCast: true });
      sph(0.035, mat('#d33'), x + 0.07, 2.13, -3.95, G, 8, 6);
    }
    if (S.skills.fitness) { cyl(0.02, 0.02, 0.4, mat(C.metal), -1.6, 0.08, 2.2, G, 6).rotation.z = Math.PI / 2; [-0.2, 0.2].forEach(o => cyl(0.08, 0.08, 0.06, mat('#222'), -1.6 + o, 0.08, 2.2, G, 10).rotation.z = Math.PI / 2); }
    if (S.subs >= 100000) { box(0.4, 0.5, 0.04, mat('#3d3d3d'), 2.9, 2.3, -3.98, G); box(0.34, 0.44, 0.01, mat('#dfe4ea', { metalness: 0.8, roughness: 0.2 }), 2.9, 2.3, -3.955, G); }
  }

  // ───────── 시간대 조명 ─────────
  function timeTarget(gh) {
    const h = gh % 24;
    if (h < 5 || h >= 21) return { sun: 0, sunCol: '#8899ff', hemi: 0.28, hs: '#5a6ab8', hg: '#2a2030', lamp: 1, sky: '#0d1636', city: '#1a2244' };
    if (h < 8) return { sun: 0.7, sunCol: '#ffb38a', hemi: 0.45, hs: '#ffd2b8', hg: '#6a4a3a', lamp: 0.3, sky: '#f6a27a', city: '#7a6a8a' };
    if (h < 16) return { sun: 1.5, sunCol: '#fff1d6', hemi: 0.62, hs: '#d6ecff', hg: '#8a6a4a', lamp: 0, sky: '#7cc8ff', city: '#6a7fae' };
    if (h < 19) return { sun: 1.05, sunCol: '#ff9a5a', hemi: 0.45, hs: '#ffc9a0', hg: '#6a4a3a', lamp: 0.4, sky: '#ff9a5a', city: '#8a5a6a' };
    return { sun: 0, sunCol: '#8899ff', hemi: 0.34, hs: '#8a7ac8', hg: '#3a2a40', lamp: 0.9, sky: '#3a2a68', city: '#2a2050' };
  }

  // ───────── 연출 ─────────
  function screenPos(x, y, z) {
    const v = new T.Vector3(x, y, z).project(camera);
    return { x: (v.x + 1) / 2 * cv.clientWidth, y: (1 - v.y) / 2 * cv.clientHeight };
  }
  function floatText(str, x, y, cls) {
    const el = document.createElement('div'); el.className = 'f3d ' + (cls || ''); el.textContent = str;
    el.style.left = x + 'px'; el.style.top = y + 'px'; labelsEl.appendChild(el);
    setTimeout(() => el.remove(), 1700);
  }
  function sparkle(x, y, z, n) {
    for (let i = 0; i < n; i++) {
      const m = box(0.06, 0.06, 0.06, glow(['#ffe066', '#ffffff', '#7ee0ff', '#ff8fb1'][i % 4], 1.2), x, y, z, scene, { noCast: true });
      anim.sparks.push({ m, vx: (Math.random() - 0.5) * 3, vy: Math.random() * 3 + 1, vz: (Math.random() - 0.5) * 3, life: 0.9 + Math.random() * 0.4 });
    }
  }

  function playerTask(S) {
    const j = S.job;
    if (S.gh < S.burnoutUntil) return { at: 'bed', lie: true, say: '😵 번아웃…', burn: true };
    if (S.pendingEvent) return { at: null, say: '❗' };
    if (S.resting) return { at: 'bed', lie: true, say: 'Zzz…' };
    if (j && j.partTime) return { at: 'door', hide: true };
    if (j) {
      if (j.stage === 0) return { at: 'desk', sit: true, typing: true, say: '💡 기획 중' };
      if (j.stage === 1) return { at: 'film', sit: true, talk: true, say: ['여러분 안녕하세요!', '오늘 알려드릴 건요…', '구독·좋아요 부탁해요!'][Math.floor(t / 2.5) % 3] };
      if (j.outsource) return { at: null, say: '☕ 외주 맡김' };
      return { at: 'desk', sit: true, typing: true, say: '✂️ 편집 중' };
    }
    if (S.uploadReady) return { at: 'desk', sit: true, say: '📤 썸네일 고르기!' };
    return { at: null };
  }

  // ───────── 초기화·크기 ─────────
  function init(canvas) {
    cv = canvas;
    let ok = !!T;
    if (ok) {
      try { renderer = new T.WebGLRenderer({ canvas: cv, antialias: true, alpha: true }); } catch (e) { ok = false; }
    }
    if (!ok || !renderer) { fallback = root.Scene2D; fallback.init(canvas); return; }
    cv.style.imageRendering = 'auto';
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.outputEncoding = T.sRGBEncoding; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    scene = new T.Scene();
    camera = new T.OrthographicCamera(-6, 6, 6, -6, 0.1, 100);
    const target = new T.Vector3(-0.3, 0.6, -0.3);
    camera.position.copy(target).add(new T.Vector3(11, 15, 11));   // 조금 더 위에서 내려다봄 (세로 화면을 꽉 채우게)
    camera.lookAt(target);
    hemi = new T.HemisphereLight('#d6ecff', '#8a6a4a', 0.6); scene.add(hemi);
    sun = new T.DirectionalLight('#fff1d6', 1.5);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.02;
    Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 40 });
    scene.add(sun); scene.add(sun.target);
    deskLamp = new T.PointLight('#ffb867', 0, 6, 2); deskLamp.position.set(-3.1, 1.6, -3.2); scene.add(deskLamp);
    monitorLight = new T.PointLight('#7fa8ff', 0.3, 3.5, 2); monitorLight.position.set(-2.0, 1.3, -3.0); scene.add(monitorLight);
    filmLight = new T.PointLight('#fff4dc', 0, 5, 2); filmLight.position.set(2.75, 2.0, -1.4); scene.add(filmLight);
    doorLight = new T.PointLight('#ffbe7a', 0, 3, 2); doorLight.position.set(-3.6, 2.4, 1.5); scene.add(doorLight);
    // 책상 스탠드
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
      .flash3d{position:fixed;inset:0;pointer-events:none;z-index:2;background:rgba(255,190,80,.0);transition:background .5s}`;
    document.head.appendChild(css);
    buildRoom();
    player = makePerson(); player.x = 0.5; player.z = 0.8; player.tx = 0.5; player.tz = 0.8;
    resize();
    window.addEventListener('resize', resize);
  }
  function resize() {
    if (fallback) return fallback.resize && fallback.resize();
    if (!renderer) return;
    const w = cv.clientWidth || window.innerWidth, h = cv.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    // 방이 정보창과 아래 버튼 사이 가운데 오도록, 가로 폭에 맞춰 크기를 정한다
    const avail = Math.max(120, h - insetCss - dockCss);
    const wpp = Math.max(11.4 / w, 12.5 / avail);                 // 화면 1px당 월드 크기 (좌우 끝은 살짝 잘려도 방을 크게)
    const halfW = w * wpp / 2, halfH = h * wpp / 2;
    const want = insetCss + avail * 0.46;                         // 방 중심이 올 화면 y (벽 높이만큼 살짝 위로)
    const shift = (want - h / 2) * wpp;
    camera.left = -halfW; camera.right = halfW; camera.top = halfH + shift; camera.bottom = -halfH + shift;
    camera.updateProjectionMatrix();
  }
  function setInset(px) {
    if (fallback) return fallback.setInset(px);
    if (Math.abs(px - insetCss) > 2) { insetCss = px; resize(); }
  }

  // ───────── 매 프레임 ─────────
  function frame(S, dt, speed) {
    if (fallback) return fallback.frame(S, dt, speed);
    if (!renderer || !S) return;
    t += dt;
    if (cv.clientWidth && Math.abs(renderer.domElement.width - Math.round(cv.clientWidth * renderer.getPixelRatio())) > 2) resize();
    const sig = JSON.stringify(S.equip) + S.skills.fitness + (S.subs >= 100000) + S.channel;
    if (sig !== lastSig) {
      if (lastSig) { courier = courier || spawnCourier(); sparkle(0.3, 1.2, 0.5, 18); }
      buildEquip(S); lastSig = sig;
    }

    // 조명
    const tg = timeTarget(S.gh), k = Math.min(1, dt * 1.5);
    light.sun += (tg.sun - light.sun) * k; light.hemi += (tg.hemi - light.hemi) * k; light.lamp += (tg.lamp - light.lamp) * k;
    light.sky.lerp(new T.Color(tg.sky), k); light.sunCol.lerp(new T.Color(tg.sunCol), k);
    sun.intensity = light.sun; sun.color.copy(light.sunCol);
    const hh = S.gh % 24, xo = (hh - 12) * 0.9;
    sun.position.set(1.2 + xo, 7.5, -10); sun.target.position.set(1.2 + xo * 0.3, 0, 1);
    hemi.intensity = light.hemi; hemi.color.lerp(new T.Color(tg.hs), k); hemi.groundColor.lerp(new T.Color(tg.hg), k);
    glass.material.color.copy(light.sky);
    if (anim.city) anim.city.color.lerp(new T.Color(tg.city), k);
    deskLamp.intensity = light.lamp * 1.3; doorLight.intensity = light.lamp * 0.6;
    const j = S.job, shooting = j && !j.partTime && j.stage === 1, working = j && !j.partTime && (j.stage === 0 || (j.stage === 2 && !j.outsource));
    monitorLight.intensity = 0.25 + light.lamp * 0.5 + (working ? 0.3 : 0);
    filmLight.intensity = shooting && S.equip.light ? 1.6 : 0;
    anim.ringMats.forEach(m => { m.emissiveIntensity = shooting ? 2.2 : 0.35; });
    anim.softMats.forEach(m => { m.emissiveIntensity = shooting ? 2 : 0.3; });
    anim.monitorMats.forEach((m, i) => { m.emissive.set(working ? (j.stage === 2 ? ['#3a5a9a', '#5a3a8a'][Math.floor(t * 2 + i) % 2] : '#4a6aa8') : '#2c4170'); });
    anim.rgb.forEach(r => r.m.emissive.setHSL(((t * 0.25 + r.k * 0.33) % 1), 0.9, 0.55));
    if (anim.recDot) anim.recDot.material.emissiveIntensity = shooting && Math.floor(t * 2) % 2 ? 3 : 0;
    anim.steam.forEach(s => { const q = (t * 0.5 + s.k) % 1; s.m.position.set(-2.95 + Math.sin(t * 2 + s.k * 6) * 0.03, 1.0 + q * 0.5, -3.4); s.m.material.opacity = 0.45 * (1 - q); s.m.scale.setScalar(0.6 + q); });

    // 플레이어
    const task = playerTask(S);
    if (task.at === 'bed') { player.tx = -3.0; player.tz = 3.0; }
    else if (task.at) { player.tx = SPOT[task.at].x; player.tz = SPOT[task.at].z; }
    else if (t > (player.wanderAt || 0)) { player.wanderAt = t + 3 + Math.random() * 3; player.tx = -1.0 + Math.random() * 3.2; player.tz = -1.2 + Math.random() * 3.0; }
    const moving = walkTo(player, dt, 1.7 * Math.min(2, Math.sqrt(speed || 1)));
    const arrived = !moving;
    if (arrived && task.at && SPOT[task.at] && SPOT[task.at].ry != null) turnTo(player, SPOT[task.at].ry, dt);
    if (t > blinkAt) blinkAt = t + 2.5 + Math.random() * 2;
    const lying = arrived && task.lie;
    player.g.visible = !(task.hide && arrived);
    if (lying) { player.g.position.set(-3.0, 0.72, 3.25); player.ry = 0; player.g.rotation.y = 0; }
    else { player.g.position.set(player.x, arrived && task.sit ? 0.0 : 0, player.z); player.g.rotation.y = player.ry; }
    pose(player, { moving, sit: arrived && task.sit, lie: lying, typing: arrived && task.typing, talk: arrived && task.talk, blink: blinkAt - t > 2.35 }, dt);
    anim.blanket.scale.z = lying ? 1.3 : 1; anim.blanket.position.z = lying ? 0.25 : 0.45; anim.blanket.position.y = lying ? 0.72 : 0.6;
    anim.chair.rotation.y = arrived && task.at === 'desk' ? 0 : 0.5;

    // NPC
    updateCourier(dt); updateEditor(S, dt);

    // 말풍선
    if (player.g.visible && arrived && task.say) {
      const p = lying ? screenPos(-3.0, 1.2, 2.0) : screenPos(player.x, task.sit ? 1.75 : 1.85, player.z);
      if (task.say !== lastBubble) { bubbleEl.textContent = task.say; lastBubble = task.say; }
      bubbleEl.style.display = 'block';
      const bw = bubbleEl.offsetWidth / 2 + 6, vw = window.innerWidth;
      bubbleEl.style.left = Math.max(bw, Math.min(vw - bw, p.x)) + 'px'; bubbleEl.style.top = (p.y - 6) + 'px';
    } else bubbleEl.style.display = 'none';

    // 수익·구독 알림
    if (lastIncome === null) { lastIncome = S.totalIncome; lastSubs = S.subs; lastVid = S.videoSeq; }
    accMoney += S.totalIncome - lastIncome; accSubs += S.subs - lastSubs; lastIncome = S.totalIncome; lastSubs = S.subs;
    floatAcc += dt;
    if (floatAcc > 1.3) {
      floatAcc = 0;
      const w = screenPos(1.2, 2.6, -4.0);
      if (accMoney >= 1) floatText('+₩' + root.Engine.fmt(accMoney), w.x - 34, w.y, 'money');
      if (accSubs >= 1) floatText('♥ +' + root.Engine.fmt(accSubs), w.x + 38, w.y + 14, 'subs');
      accMoney = 0; accSubs = 0;
    }
    if (S.videoSeq !== lastVid) {
      const v = S.videos[0]; lastVid = S.videoSeq;
      if (v) {
        const p = screenPos(-2.0, 2.0, -3.4); floatText('📤 업로드 완료!', p.x, p.y, 'info');
        if (v.viral) { const c = screenPos(0, 1.5, 0); floatText('🔥 바이럴!', c.x, c.y, 'big'); sparkle(0, 1.5, 0, 40); flashEl.style.background = 'rgba(255,190,80,.35)'; setTimeout(() => { flashEl.style.background = 'rgba(255,190,80,0)'; }, 400); }
      }
    }
    // 반짝이
    for (let i = anim.sparks.length - 1; i >= 0; i--) {
      const s = anim.sparks[i]; s.life -= dt;
      if (s.life <= 0) { scene.remove(s.m); s.m.geometry.dispose(); anim.sparks.splice(i, 1); continue; }
      s.vy -= 6 * dt; s.m.position.x += s.vx * dt; s.m.position.y += s.vy * dt; s.m.position.z += s.vz * dt; s.m.rotation.x += dt * 6;
    }
    renderer.render(scene, camera);
  }

  function spawnCourier() {
    const p = makePerson({ shirt: '#3d8a4a', pants: '#3a3a3a', cap: '#2d6b39', hair: '#4a3520', box: true });
    p.x = SPOT.door.x; p.z = SPOT.door.z; p.tx = 0.2; p.tz = 1.2; p.phase0 = 0; p.wait = 0;
    return p;
  }
  function updateCourier(dt) {
    if (!courier) return;
    const p = courier, mv = walkTo(p, dt, 2.0);
    p.g.position.set(p.x, 0, p.z); p.g.rotation.y = p.ry;
    if (!mv && p.phase0 === 0) { p.wait += dt; if (p.wait > 0.8) { p.phase0 = 1; if (p.carry) p.carry.visible = false; p.carry = null; const s = screenPos(p.x, 2, p.z); floatText('📦 배송 완료', s.x, s.y, 'money'); p.tx = SPOT.door.x; p.tz = SPOT.door.z; } }
    else if (!mv && p.phase0 === 1) { scene.remove(p.g); courier = null; return; }
    pose(p, { moving: mv }, dt);
  }
  function updateEditor(S, dt) {
    const out = S.job && !S.job.partTime && S.job.stage === 2 && S.job.outsource;
    if (out && !editor) {
      editor = makePerson({ shirt: '#5b6fe0', hair: '#d9b36a', skin: '#e9bb92' });
      editor.x = SPOT.door.x; editor.z = SPOT.door.z; editor.tx = SPOT.side.x; editor.tz = SPOT.side.z;
      // 외주용 접이식 테이블 + 노트북
      editor.table = new T.Group(); scene.add(editor.table); editor.table.position.set(SPOT.side.x, 0, SPOT.side.z - 0.75);
      box(1.1, 0.05, 0.6, mat('#b07a47'), 0, 0.62, 0, editor.table); [[-0.5, -0.25], [0.5, -0.25], [-0.5, 0.25], [0.5, 0.25]].forEach(([x, z]) => box(0.05, 0.6, 0.05, mat('#87592f'), x, 0.3, z, editor.table));
      box(0.4, 0.02, 0.28, mat('#b6bcc6', { metalness: 0.5 }), 0, 0.66, 0.05, editor.table); const lid = box(0.4, 0.28, 0.02, mat('#9aa1ad', { metalness: 0.5 }), 0, 0.8, -0.1, editor.table); lid.rotation.x = -0.25;
      const st = makeStool(); st.position.set(SPOT.side.x, 0, SPOT.side.z); editor.table.add(st); st.position.set(0, 0, 0.75);
    }
    if (!editor) return;
    if (!out && !editor.leaving) { editor.leaving = true; editor.tx = SPOT.door.x; editor.tz = SPOT.door.z; }
    const mv = walkTo(editor, dt, 1.8), arrived = !mv;
    if (arrived && !editor.leaving) turnTo(editor, Math.PI, dt);
    editor.g.position.set(editor.x, 0, editor.z); editor.g.rotation.y = editor.ry;
    pose(editor, { moving: mv, sit: arrived && !editor.leaving, typing: arrived && !editor.leaving }, dt);
    if (editor.leaving && arrived) { scene.remove(editor.g); scene.remove(editor.table); editor = null; }
  }
  function makeStool() { const g = new T.Group(); cyl(0.2, 0.2, 0.05, mat('#7a4a2a'), 0, 0.46, 0, g); cyl(0.03, 0.03, 0.46, mat(C.metal), 0, 0.23, 0, g, 6); return g; }

  function tapFx(x, y) { if (fallback) return fallback.tapFx(x, y); floatText('+작업!', x + (Math.random() - 0.5) * 40, y, 'tap'); }
  function toLogical(cx, cy) { if (fallback) return fallback.toLogical(cx, cy); return { x: cx, y: cy }; }

  root.Scene = { init, frame, tapFx, toLogical, resize, setInset, is3D: () => !fallback };
})(window);
