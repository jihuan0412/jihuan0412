/* 방 꾸미기 아이템 3D 모델 — Three.js 로우폴리.
 * window.DECOR3D.build(id, THREE, helpers?) → THREE.Group
 *  - 바닥 아이템: 원점 = 바닥 위 차지 칸의 가운데, 앞이 +z (rot 0). 크기 = w×d 칸 (칸 0.5m).
 *  - 벽 아이템: 원점 = 벽 표면 가운데, 앞이 +z (왼쪽 벽은 장면이 돌려 붙인다).
 *  - group.userData.tick(t, env) 가 있으면 매 프레임 부른다 (env.night 0~1).
 * 그림 파일 없이 기본 도형과 캔버스 무늬로만 만든다. 모듈 없이 한 HTML 파일에 그대로 넣어도 된다.
 */
(function (root) {
  'use strict';
  const texCache = {};

  function build(id, T, helpers) {
    T = T || root.THREE;
    const g = new T.Group();
    g.name = 'decor_' + id;
    const fn = MODELS[id];
    if (!fn) return g;
    const K = kit(T, g, id);
    const tick = fn(K, T);
    if (typeof tick === 'function') g.userData.tick = tick;
    mergeStatic(g, T);
    g.userData.decorId = id;
    return g;
  }

  // ───────── 도구 모음 ─────────
  function kit(T, g, id) {
    const cache = {};
    const std = (c, o, fs) => {
      const key = (fs ? 'f' : 's') + c + (o ? JSON.stringify(o) : '');
      if (cache[key] && !(o && (o.map || o.emissiveMap))) return cache[key];
      const m = new T.MeshStandardMaterial(Object.assign({ color: c, roughness: fs ? 0.85 : 0.7, metalness: 0.05, flatShading: !!fs }, o || {}));
      // 환경맵이 없어서 금속이 검게 보이지 않도록 금속감을 줄이고 색으로 표현한다
      if (m.metalness > 0.4) { m.metalness = 0.4; m.roughness = Math.max(m.roughness, 0.35); }
      if (!(o && (o.map || o.emissiveMap))) cache[key] = m;
      return m;
    };
    const K = {
      g, T,
      M: (c, o) => std(c, o, false),
      F: (c, o) => std(c, o, true),
      E: (c, i, o) => new T.MeshStandardMaterial(Object.assign({ color: c, emissive: c, emissiveIntensity: i == null ? 1 : i, roughness: 0.4 }, o || {})),
      glass: (c, op) => new T.MeshStandardMaterial({ color: c || '#cfefff', transparent: true, opacity: op == null ? 0.22 : op, roughness: 0.05, metalness: 0.1, depthWrite: false }),
      halo: (c, op) => new T.MeshBasicMaterial({ color: c, transparent: true, opacity: op == null ? 0.18 : op, blending: T.AdditiveBlending, depthWrite: false }),
      rng: seeded(hash(id)),
      add(geo, m, x, y, z, p, noShadow) {
        const o = new T.Mesh(geo, m);
        o.position.set(x || 0, y || 0, z || 0);
        const tr = m && (m.transparent || m.blending === T.AdditiveBlending);
        o.castShadow = !noShadow && !tr; o.receiveShadow = !tr;
        (p || g).add(o); return o;
      },
      dyn(o) { o.userData.dyn = true; return o; },
      grp(x, y, z, p) { const o = new T.Group(); o.position.set(x || 0, y || 0, z || 0); (p || g).add(o); return o; },
      box(w, h, d, m, x, y, z, p) { return K.add(new T.BoxGeometry(w, h, d), m, x, y, z, p); },
      cyl(rt, rb, h, m, x, y, z, p, seg, open) { return K.add(new T.CylinderGeometry(rt, rb, h, seg || 16, 1, !!open), m, x, y, z, p); },
      sph(r, m, x, y, z, p, ws, hs) { return K.add(new T.SphereGeometry(r, ws || 14, hs || 10), m, x, y, z, p); },
      ico(r, m, x, y, z, p, det) { return K.add(new T.IcosahedronGeometry(r, det || 0), m, x, y, z, p); },
      cone(r, h, m, x, y, z, p, seg) { return K.add(new T.ConeGeometry(r, h, seg || 10), m, x, y, z, p); },
      tor(r, tube, m, x, y, z, p, rs, ts, arc) { return K.add(new T.TorusGeometry(r, tube, rs || 8, ts || 20, arc || Math.PI * 2), m, x, y, z, p); },
      cap(r, len, m, x, y, z, p) { return K.add(new T.CapsuleGeometry(r, len, 4, 10), m, x, y, z, p); },
      // 모서리가 둥근 상자 (가로 w, 높이 h, 깊이 d)
      rbox(w, h, d, r, m, x, y, z, p) {
        const b = Math.min(r, d / 2.2, w / 2.2, h / 2.2) * 0.6, ww = w - 2 * b, hh = h - 2 * b, rr = Math.max(0.0005, Math.min(r - b, ww / 2.01, hh / 2.01));
        const s = new T.Shape(), x0 = -ww / 2, y0 = -hh / 2;
        s.moveTo(x0 + rr, y0); s.lineTo(x0 + ww - rr, y0); s.quadraticCurveTo(x0 + ww, y0, x0 + ww, y0 + rr);
        s.lineTo(x0 + ww, y0 + hh - rr); s.quadraticCurveTo(x0 + ww, y0 + hh, x0 + ww - rr, y0 + hh);
        s.lineTo(x0 + rr, y0 + hh); s.quadraticCurveTo(x0, y0 + hh, x0, y0 + hh - rr);
        s.lineTo(x0, y0 + rr); s.quadraticCurveTo(x0, y0, x0 + rr, y0);
        const geo = new T.ExtrudeGeometry(s, { depth: Math.max(0.001, d - 2 * b), bevelEnabled: b > 0.001, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 4 });
        geo.center();
        return K.add(geo, m, x, y, z, p);
      },
      // a→b 막대
      rod(a, b, r, m, p, seg) {
        const A = new T.Vector3(a[0], a[1], a[2]), B = new T.Vector3(b[0], b[1], b[2]), d = B.clone().sub(A), len = d.length();
        const o = K.add(new T.CylinderGeometry(r, r, len, seg || 6), m, (A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2, p);
        o.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize());
        return o;
      },
      tube(pts, r, m, p, closed, seg) {
        const curve = new T.CatmullRomCurve3(pts.map(q => new T.Vector3(q[0], q[1], q[2])), !!closed);
        return K.add(new T.TubeGeometry(curve, seg || 40, r, 6, !!closed), m, 0, 0, 0, p);
      },
      lathe(prof, m, x, y, z, p, seg) { return K.add(new T.LatheGeometry(prof.map(q => new T.Vector2(q[0], q[1])), seg || 18), m, x, y, z, p); },
      tex(key, w, h, draw, opt) {
        if (texCache[key]) return texCache[key];
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        draw(c.getContext('2d'), w, h);
        const tx = new T.CanvasTexture(c); tx.encoding = T.sRGBEncoding; tx.anisotropy = 4;
        if (opt && opt.repeat) { tx.wrapS = tx.wrapT = T.RepeatWrapping; tx.repeat.set(opt.repeat[0], opt.repeat[1]); }
        if (opt && opt.nearest) { tx.magFilter = T.NearestFilter; tx.minFilter = T.NearestFilter; tx.generateMipmaps = false; }
        texCache[key] = tx; return tx;
      },
      // 벽 액자용: 앞면에 그림을 붙인 판
      picture(w, h, tx, x, y, z, p, emissive) {
        const m = new T.MeshStandardMaterial({ map: tx, roughness: 0.6, emissive: emissive ? '#ffffff' : '#000000', emissiveMap: emissive ? tx : null, emissiveIntensity: emissive || 0 });
        return K.add(new T.PlaneGeometry(w, h), m, x, y, z, p);
      },
    };
    return K;
  }
  // 움직이지 않는 조각을 재질별로 하나로 합쳐 그리기 호출 수를 줄인다 (움직이는 건 K.dyn 으로 표시)
  function mergeStatic(g, T) {
    g.updateMatrixWorld(true);
    const buckets = new Map();
    g.traverse(o => {
      if (!o.isMesh || o.userData.dyn || Array.isArray(o.material)) return;
      let owner = o.parent;
      while (owner !== g && !owner.userData.dyn) owner = owner.parent;
      const m = o.material, ga = o.geometry.attributes;
      if (m.transparent || m.blending !== T.NormalBlending || ga.color || !ga.normal || !ga.uv) return;
      const key = owner.uuid + m.uuid + (o.castShadow ? '|s' : '|n');
      if (!buckets.has(key)) buckets.set(key, { owner, list: [] });
      buckets.get(key).list.push(o);
    });
    const dropped = new Set();
    buckets.forEach(({ owner, list }) => {
      if (list.length < 2) return;
      const inv = new T.Matrix4().copy(owner.matrixWorld).invert();
      const parts = list.map(o => {
        const geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
        geo.applyMatrix4(new T.Matrix4().multiplyMatrices(inv, o.matrixWorld));
        return geo;
      });
      let n = 0; parts.forEach(q => { n += q.attributes.position.count; });
      const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
      let k = 0;
      parts.forEach(q => { pos.set(q.attributes.position.array, k * 3); nor.set(q.attributes.normal.array, k * 3); uv.set(q.attributes.uv.array, k * 2); k += q.attributes.position.count; q.dispose(); });
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('normal', new T.BufferAttribute(nor, 3)); geo.setAttribute('uv', new T.BufferAttribute(uv, 2));
      geo.computeBoundingSphere();
      const mm = new T.Mesh(geo, list[0].material);
      mm.castShadow = list[0].castShadow; mm.receiveShadow = true;
      list.forEach(o => { dropped.add(o.geometry); o.parent.remove(o); });
      owner.add(mm);
    });
    if (dropped.size) { g.traverse(o => { if (o.geometry) dropped.delete(o.geometry); }); dropped.forEach(q => q.dispose()); }
  }
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function seeded(seed) { let a = seed || 1; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const pick = (K, arr) => arr[Math.floor(K.rng() * arr.length) % arr.length];
  const BOOKC = ['#e5484d', '#2f6fed', '#f5b83d', '#3aa676', '#8a5cf6', '#f07aa8', '#2b2f3e', '#e98b3a', '#5bc0d8', '#f2efe6'];

  // 작은 피규어 (높이 약 0.13~0.16)
  function figure(K, kind, x, y, z, p) {
    const f = K.grp(x, y, z, p), T = K.T;
    K.cyl(0.035, 0.038, 0.012, K.M('#20232b'), 0, 0.006, 0, f, 14);
    const skin = K.F('#f3c9a1');
    if (kind === 'robot') {
      K.box(0.05, 0.05, 0.035, K.M('#c9ced8', { metalness: 0.5, roughness: 0.3 }), 0, 0.045, 0, f);
      K.box(0.055, 0.045, 0.045, K.M('#dfe3ea', { metalness: 0.5, roughness: 0.3 }), 0, 0.1, 0, f);
      [-0.012, 0.012].forEach(ex => K.sph(0.006, K.E('#39d0ff', 1.6), ex, 0.104, 0.024, f, 6, 4));
      K.cyl(0.002, 0.002, 0.03, K.M('#888'), 0, 0.135, 0, f, 4); K.sph(0.006, K.E('#ff4f4f', 1.5), 0, 0.152, 0, f, 6, 4);
      [-0.033, 0.033].forEach(ax => K.box(0.012, 0.04, 0.014, K.M('#9aa1ad'), ax, 0.05, 0, f));
    } else if (kind === 'mecha') {
      K.box(0.028, 0.045, 0.02, K.F('#f2f3f7'), 0, 0.035, 0, f);
      K.box(0.05, 0.04, 0.03, K.F('#2f6fed'), 0, 0.078, 0, f);
      K.box(0.022, 0.012, 0.031, K.F('#e5484d'), 0, 0.07, 0.001, f);
      K.box(0.03, 0.03, 0.028, K.F('#f2f3f7'), 0, 0.113, 0, f);
      K.cone(0.008, 0.03, K.F('#f5c33d'), -0.008, 0.135, 0.01, f, 4).rotation.z = 0.6;
      K.cone(0.008, 0.03, K.F('#f5c33d'), 0.008, 0.135, 0.01, f, 4).rotation.z = -0.6;
      [-0.035, 0.035].forEach(ax => K.box(0.018, 0.045, 0.02, K.F('#f2f3f7'), ax, 0.075, 0, f));
    } else if (kind === 'dino') {
      const gm = K.F('#5cc46a');
      const b = K.sph(0.035, gm, 0, 0.045, 0, f, 8, 6); b.scale.set(1, 0.9, 1.3);
      const h = K.sph(0.025, gm, 0, 0.09, 0.03, f, 8, 6); h.scale.set(1, 0.9, 1.2);
      K.cone(0.015, 0.05, gm, 0, 0.035, -0.055, f, 6).rotation.x = -1.8;
      for (let i = 0; i < 3; i++) K.cone(0.008, 0.018, K.F('#f5b83d'), 0, 0.08 - i * 0.012, -0.005 - i * 0.02, f, 4);
      [-0.009, 0.009].forEach(ex => K.sph(0.004, K.M('#111'), ex, 0.098, 0.05, f, 5, 4));
    } else {
      const col = { knight: '#9aa1ad', magic: '#ff8fc8', hero: '#e5484d', idol: '#8a5cf6' }[kind] || '#e5484d';
      const hair = { knight: '#c9ced8', magic: '#ffd0e8', hero: '#2b1d14', idol: '#5bc0d8' }[kind] || '#2b1d14';
      K.cone(0.028, 0.06, K.F(col), 0, 0.042, 0, f, 8);
      K.sph(0.03, skin, 0, 0.098, 0, f, 10, 8);
      const hr = K.add(new T.SphereGeometry(0.032, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), K.F(hair), 0, 0.1, -0.003, f);
      [-0.01, 0.01].forEach(ex => K.sph(0.004, K.M('#1b1b1f'), ex, 0.097, 0.028, f, 5, 4));
      if (kind === 'knight') { K.box(0.004, 0.07, 0.006, K.M('#e8eef5', { metalness: 0.8, roughness: 0.2 }), 0.032, 0.07, 0.01, f).rotation.z = -0.3; K.box(0.02, 0.004, 0.006, K.M('#c08a2a'), 0.026, 0.05, 0.01, f); }
      if (kind === 'magic') { K.rod([0.025, 0.04, 0.01], [0.04, 0.09, 0.015], 0.002, K.M('#fff'), f); K.sph(0.008, K.E('#ffe066', 1.5), 0.04, 0.093, 0.015, f, 6, 4); }
      if (kind === 'idol') { K.tor(0.012, 0.003, K.M('#ffd84d', { metalness: 0.6, roughness: 0.3 }), 0, 0.13, 0, f, 4, 10).rotation.x = Math.PI / 2; }
      if (kind === 'hero') { const cp = K.box(0.04, 0.05, 0.004, K.F('#2f6fed'), 0, 0.055, -0.02, f); cp.rotation.x = 0.2; }
    }
    return f;
  }

  // 금빛 플레이 버튼 상패
  function plaque(K, col, x, y, z, p, s) {
    s = s || 1;
    const q = K.grp(x, y, z, p);
    q.scale.setScalar(s);
    const metal = K.M(col, { metalness: 0.85, roughness: 0.25 });
    K.rbox(0.2, 0.15, 0.014, 0.02, metal, 0, 0.09, 0, q);
    K.rbox(0.09, 0.065, 0.008, 0.016, K.M(col === '#e9edf2' ? '#c9ced6' : '#f7d774', { metalness: 0.7, roughness: 0.25 }), 0, 0.095, 0.009, q);
    const tri = K.cyl(0.02, 0.02, 0.006, K.M('#ffffff', { metalness: 0.3, roughness: 0.3 }), 0.004, 0.095, 0.014, q, 3);
    tri.rotation.x = Math.PI / 2; tri.rotation.y = Math.PI / 2;
    K.box(0.07, 0.018, 0.05, K.M('#1d1f25'), 0, 0.009, -0.01, q);
    const st = K.box(0.012, 0.09, 0.012, K.M('#1d1f25'), 0, 0.06, -0.02, q); st.rotation.x = -0.25;
    return q;
  }
  // 금컵 트로피
  function cup(K, col, x, y, z, p, s) {
    const q = K.grp(x, y, z, p); q.scale.setScalar(s || 1);
    const gm = K.M(col || '#f2c14e', { metalness: 0.9, roughness: 0.22 });
    K.box(0.07, 0.025, 0.07, K.M('#3a2a20'), 0, 0.0125, 0, q);
    K.lathe([[0.0, 0.025], [0.025, 0.025], [0.012, 0.04], [0.008, 0.07], [0.012, 0.08], [0.04, 0.1], [0.045, 0.14], [0.042, 0.142], [0.0, 0.11]], gm, 0, 0, 0, q, 16);
    [-1, 1].forEach(sx => { const h = K.tor(0.018, 0.004, gm, sx * 0.045, 0.118, 0, q, 5, 10, Math.PI); h.rotation.z = sx > 0 ? -Math.PI / 2 : Math.PI / 2; });
    return q;
  }

  // ───────── 모델 ─────────
  const MODELS = {
    // ── 가구 ──
    sofa_small(K) {
      const fab = K.F('#e8796b'), fabD = K.F('#cf6156'), legM = K.M('#6b4a2b');
      [[-0.42, -0.17], [0.42, -0.17], [-0.42, 0.17], [0.42, 0.17]].forEach(([x, z]) => K.cyl(0.02, 0.014, 0.08, legM, x, 0.04, z, null, 8));
      K.rbox(0.96, 0.18, 0.46, 0.04, fabD, 0, 0.17, 0);
      [-0.215, 0.215].forEach(x => K.rbox(0.42, 0.1, 0.36, 0.04, fab, x, 0.31, 0.04));
      [-0.215, 0.215].forEach(x => { const b = K.rbox(0.42, 0.3, 0.11, 0.05, fab, x, 0.47, -0.165); b.rotation.x = -0.12; });
      [-0.44, 0.44].forEach(x => K.rbox(0.1, 0.32, 0.46, 0.045, fabD, x, 0.3, 0));
      const pl = K.rbox(0.2, 0.18, 0.07, 0.05, K.F('#ffd166'), 0.27, 0.46, -0.07); pl.rotation.set(-0.25, -0.2, 0.18);
      const p2 = K.rbox(0.18, 0.16, 0.06, 0.05, K.F('#7ec8c8'), -0.28, 0.45, -0.08); p2.rotation.set(-0.25, 0.25, -0.15);
      const th = K.box(0.22, 0.012, 0.3, K.F('#f4efe6'), -0.08, 0.365, 0.06); th.rotation.y = 0.15;
      for (let i = 0; i < 4; i++) K.box(0.22, 0.013, 0.02, K.F('#9fb7e8'), -0.08, 0.366, -0.06 + i * 0.08).rotation.y = 0.15;
    },
    beanbag(K, T) {
      const geo = new T.IcosahedronGeometry(0.24, 3), pa = geo.attributes.position;
      for (let i = 0; i < pa.count; i++) {
        let x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
        const r2 = (x * x + z * z) / 0.0576;
        if (y > 0) y = y * 0.7 - 0.07 * Math.exp(-r2 * 4); else y *= 0.55;
        x *= 1 + Math.max(0, -y) * 0.6; z *= 1 + Math.max(0, -y) * 0.6;
        pa.setXYZ(i, x, y, z);
      }
      geo.computeVertexNormals();
      K.add(geo, K.F('#f5b83d'), 0, 0.135, 0);
      K.box(0.05, 0.03, 0.005, K.F('#fff'), 0.12, 0.08, 0.2).rotation.y = 0.5;
      // 위에 놓인 게임패드
      const pad = K.grp(0.02, 0.215, 0.02); pad.rotation.set(-0.15, 0.4, 0);
      K.rbox(0.11, 0.025, 0.06, 0.02, K.M('#2b2f3e'), 0, 0, 0, pad);
      [-0.05, 0.05].forEach(x => K.sph(0.022, K.M('#2b2f3e'), x, -0.002, 0.012, pad, 8, 6));
      [['#e5484d', 0.035, 0.0], ['#3aa676', 0.045, 0.01], ['#2f6fed', 0.025, 0.01]].forEach(([c, x, z]) => K.sph(0.006, K.M(c), x, 0.014, z, pad, 6, 4));
      K.box(0.025, 0.006, 0.006, K.M('#9aa1ad'), -0.035, 0.014, 0.005, pad); K.box(0.006, 0.006, 0.025, K.M('#9aa1ad'), -0.035, 0.014, 0.005, pad);
    },
    bookshelf(K) {
      const wood = K.M('#c08a55'), woodD = K.M('#9a6a3e'), D = 0.32, z0 = -0.08, H = 1.5;
      [-0.48, 0.48].forEach(x => K.box(0.04, H, D, wood, x, H / 2, z0));
      K.box(1.0, 0.04, D + 0.02, wood, 0, H - 0.02, z0); K.box(0.96, 0.08, D, woodD, 0, 0.04, z0);
      K.box(0.96, H, 0.02, K.M('#f1e6d2'), 0, H / 2, z0 - D / 2 + 0.01);
      const shelves = [0.08, 0.43, 0.78, 1.13];
      shelves.slice(1).forEach(y => K.box(0.92, 0.03, D - 0.02, wood, 0, y, z0));
      shelves.forEach((y, si) => {
        let x = -0.44;
        const lim = si === 3 ? 0.1 : 0.44;
        while (x < lim) {
          const w = 0.03 + K.rng() * 0.035, h = 0.18 + K.rng() * 0.1, c = pick(K, BOOKC);
          if (x + w > lim) break;
          const b = K.box(w, h, 0.2 + K.rng() * 0.04, K.F(c), x + w / 2, y + 0.015 + h / 2, z0 + 0.02);
          if (K.rng() < 0.08 && x > -0.3) { b.rotation.z = -0.3; b.position.x += 0.03; x += 0.05; }
          K.box(w + 0.001, 0.012, 0.005, K.F('#f5e6c0'), x + w / 2, y + 0.015 + h * 0.75, z0 + 0.12 + 0.002);
          x += w + 0.004;
          if (si === 1 && x > 0.05 && x < 0.12) { // 책 사이 소품: 작은 지구본
            K.cyl(0.03, 0.04, 0.015, K.M('#7c4f2b'), x + 0.07, y + 0.022, z0 + 0.02);
            K.sph(0.055, K.F('#5bc0d8'), x + 0.07, y + 0.1, z0 + 0.02, null, 10, 8);
            K.sph(0.03, K.F('#5cc46a'), x + 0.09, y + 0.12, z0 + 0.06, null, 6, 4).scale.set(1, 0.7, 0.5);
            x += 0.15;
          }
        }
      });
      // 맨 위칸 오른쪽: 화분
      K.cyl(0.06, 0.05, 0.1, K.M('#f2efe6'), 0.32, 1.195, z0);
      [[0, 0.07], [0.04, 0.05], [-0.04, 0.06]].forEach(([x, y]) => K.ico(0.05, K.F('#3f9a3a'), 0.32 + x, 1.24 + y, z0 + 0.01));
      // 위: 사진 액자 + 상자
      const fr = K.box(0.16, 0.2, 0.02, K.M('#2b2f3e'), -0.25, H + 0.1, z0 - 0.05); fr.rotation.x = -0.12;
      K.box(0.12, 0.16, 0.005, K.M('#9fd8ff'), -0.25, H + 0.1, z0 - 0.038).rotation.x = -0.12;
      K.rbox(0.26, 0.14, 0.24, 0.02, K.F('#e8c590'), 0.2, H + 0.07, z0);
    },
    low_table(K) {
      const wood = K.M('#b9824c'), woodD = K.M('#8a5a32');
      K.rbox(0.96, 0.05, 0.46, 0.06, wood, 0, 0.3, 0);
      [[-0.41, -0.16], [0.41, -0.16], [-0.41, 0.16], [0.41, 0.16]].forEach(([x, z]) => K.cyl(0.025, 0.018, 0.28, woodD, x, 0.14, z, null, 8));
      const top = 0.325;
      // 찻주전자 + 찻잔
      K.sph(0.06, K.F('#f2efe6'), -0.25, top + 0.05, -0.04, null, 10, 8).scale.y = 0.85;
      K.cyl(0.02, 0.025, 0.02, K.F('#f2efe6'), -0.25, top + 0.105, -0.04, null, 8);
      const sp = K.cyl(0.008, 0.014, 0.08, K.F('#f2efe6'), -0.18, top + 0.06, -0.04, null, 6); sp.rotation.z = -0.9;
      K.tor(0.03, 0.007, K.F('#f2efe6'), -0.31, top + 0.06, -0.04, null, 4, 8).rotation.y = 0;
      [[-0.1, 0.09], [-0.36, 0.11]].forEach(([x, z]) => { K.cyl(0.028, 0.022, 0.045, K.F('#7ec8c8'), x, top + 0.0225, z, null, 10); K.cyl(0.024, 0.024, 0.002, K.M('#a8642a'), x, top + 0.042, z, null, 10); });
      // 귤 바구니
      K.cyl(0.11, 0.08, 0.05, K.F('#c9975b'), 0.22, top + 0.025, -0.02, null, 10);
      [[0, 0, 0], [0.05, 0, 0.03], [-0.05, 0, 0.02], [0.02, 0, -0.05], [-0.02, 0.04, 0], [0.03, 0.04, 0.01]].forEach(([x, y, z]) => {
        K.sph(0.035, K.F('#ff9a2e'), 0.22 + x, top + 0.07 + y, -0.02 + z, null, 8, 6);
        K.box(0.012, 0.006, 0.006, K.F('#3f9a3a'), 0.22 + x, top + 0.105 + y, -0.02 + z);
      });
      // 펼친 책
      const bk = K.grp(0.02, top + 0.008, 0.1); bk.rotation.y = -0.3;
      K.box(0.2, 0.012, 0.14, K.F('#2f6fed'), 0, 0, 0, bk);
      [-0.05, 0.05].forEach(x => { const pg = K.box(0.095, 0.01, 0.13, K.F('#fffaf0'), x, 0.01, 0, bk); pg.rotation.z = x < 0 ? 0.08 : -0.08; });
    },
    gaming_chair(K) {
      const blk = K.M('#262931', { roughness: 0.5 }), acc = K.F('#ff4f7b'), metal = K.M('#3a3d46', { metalness: 0.6, roughness: 0.35 });
      for (let i = 0; i < 5; i++) {
        const a = i / 5 * Math.PI * 2;
        const l = K.box(0.2, 0.03, 0.04, metal, Math.sin(a) * 0.1, 0.06, Math.cos(a) * 0.1); l.rotation.y = a + Math.PI / 2;
        K.sph(0.022, blk, Math.sin(a) * 0.2, 0.022, Math.cos(a) * 0.2, null, 8, 6);
      }
      K.cyl(0.025, 0.03, 0.35, metal, 0, 0.24, 0, null, 10);
      K.rbox(0.44, 0.09, 0.42, 0.05, blk, 0, 0.45, 0.01);
      K.rbox(0.3, 0.02, 0.34, 0.04, acc, 0, 0.497, 0.02);
      const back = K.grp(0, 0.5, -0.18); back.rotation.x = -0.12;
      K.rbox(0.42, 0.72, 0.09, 0.08, blk, 0, 0.38, 0, back);
      K.rbox(0.24, 0.5, 0.02, 0.05, acc, 0, 0.33, 0.045, back);
      [-0.19, 0.19].forEach(x => K.rbox(0.07, 0.6, 0.12, 0.03, blk, x, 0.32, 0.02, back));
      K.rbox(0.2, 0.1, 0.06, 0.04, K.F('#1b1d23'), 0, 0.6, 0.07, back);
      K.rbox(0.18, 0.14, 0.07, 0.05, blk, 0, 0.18, 0.07, back);
      [-0.24, 0.24].forEach(x => { K.box(0.03, 0.18, 0.03, metal, x, 0.55, -0.02); K.rbox(0.07, 0.03, 0.24, 0.015, blk, x, 0.65, 0.0); });
    },
    wardrobe(K) {
      const body = K.M('#efe4d2'), trim = K.M('#b9824c'), H = 1.85;
      [[-0.44, -0.18], [0.44, -0.18], [-0.44, 0.18], [0.44, 0.18]].forEach(([x, z]) => K.cyl(0.02, 0.015, 0.08, trim, x, 0.04, z, null, 8));
      K.rbox(0.96, H - 0.08, 0.46, 0.02, body, 0, 0.08 + (H - 0.08) / 2, 0);
      K.box(1.0, 0.05, 0.5, trim, 0, H + 0.02, 0);
      K.box(0.92, 0.22, 0.01, K.M('#e2d4bc'), 0, 0.24, 0.232);
      K.box(0.92, 0.008, 0.012, K.M('#b8a88e'), 0, 0.36, 0.234);
      K.box(0.006, H - 0.4, 0.012, K.M('#b8a88e'), 0, 1.11, 0.234);
      [-0.23, 0.23].forEach(x => {
        K.box(0.4, H - 0.48, 0.008, K.M('#f6eee0'), x, 1.11, 0.232);
        K.box(0.32, H - 0.62, 0.006, K.M('#e8dcc8'), x, 1.11, 0.238);
      });
      [-0.04, 0.04].forEach(x => K.cyl(0.008, 0.008, 0.16, K.M('#c8a24a', { metalness: 0.7, roughness: 0.3 }), x, 1.1, 0.25, null, 6));
      K.cyl(0.006, 0.006, 0.12, K.M('#c8a24a', { metalness: 0.7, roughness: 0.3 }), 0, 0.24, 0.245, null, 6).rotation.z = Math.PI / 2;
      // 위: 모자 상자 + 접은 담요
      K.cyl(0.13, 0.13, 0.14, K.F('#f07aa8'), -0.22, H + 0.115, 0, null, 14);
      K.cyl(0.135, 0.135, 0.03, K.F('#ffd0e0'), -0.22, H + 0.19, 0, null, 14);
      K.rbox(0.3, 0.08, 0.24, 0.03, K.F('#7ec8c8'), 0.2, H + 0.085, 0);
      K.rbox(0.28, 0.06, 0.22, 0.03, K.F('#f5b83d'), 0.2, H + 0.155, 0);
    },
    fridge_mini(K) {
      const body = K.M('#9fdcc8', { roughness: 0.45 }), chrome = K.M('#e0e4ea', { metalness: 0.8, roughness: 0.2 });
      [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]].forEach(([x, z]) => K.cyl(0.018, 0.022, 0.04, chrome, x, 0.02, z, null, 8));
      K.rbox(0.44, 0.78, 0.42, 0.07, body, 0, 0.43, -0.01);
      K.box(0.4, 0.006, 0.01, K.M('#6fb8a2'), 0, 0.6, 0.2);
      K.box(0.025, 0.2, 0.03, chrome, 0.17, 0.48, 0.21);
      K.box(0.025, 0.08, 0.03, chrome, 0.17, 0.7, 0.21);
      K.rbox(0.16, 0.035, 0.01, 0.015, K.M('#f2efe6'), -0.08, 0.72, 0.205);
      [['#e5484d', -0.12, 0.45], ['#f5b83d', -0.04, 0.4], ['#2f6fed', -0.1, 0.33]].forEach(([c, x, y], i) => i === 0 ? K.cyl(0.018, 0.018, 0.012, K.F(c), x, y, 0.21).rotation.x = Math.PI / 2 : K.box(0.035, 0.03, 0.012, K.F(c), x, y, 0.21));
      K.box(0.07, 0.09, 0.003, K.M('#fffaf0'), -0.04, 0.48, 0.212).rotation.z = 0.08;
      // 위: 음료 캔들
      [['#e5484d', -0.1], ['#3aa676', 0.0], ['#2f6fed', 0.1]].forEach(([c, x]) => { K.cyl(0.026, 0.026, 0.09, K.M(c, { metalness: 0.4, roughness: 0.35 }), x, 0.865, 0.02, null, 10); K.cyl(0.022, 0.026, 0.008, chrome, x, 0.914, 0.02, null, 10); });
    },
    piano(K) {
      const blk = K.M('#1c1d22', { roughness: 0.25, metalness: 0.1 }), white = K.M('#fbfbf8', { roughness: 0.35 }), z0 = -0.06;
      [-0.7, 0.7].forEach(x => { K.box(0.05, 0.72, 0.34, blk, x, 0.36, z0); K.box(0.07, 0.04, 0.38, blk, x, 0.02, z0 + 0.01); });
      K.box(1.36, 0.04, 0.02, blk, 0, 0.12, z0 - 0.15);
      K.box(1.36, 0.5, 0.02, blk, 0, 0.45, z0 - 0.15);
      K.box(1.45, 0.1, 0.36, blk, 0, 0.76, z0);
      K.box(1.45, 0.03, 0.06, blk, 0, 0.83, z0 + 0.15);
      // 건반
      const nW = 22, kw = 1.3 / nW;
      for (let i = 0; i < nW; i++) K.box(kw - 0.003, 0.02, 0.13, white, -0.65 + kw * (i + 0.5), 0.82, z0 + 0.235);
      for (let i = 0; i < nW - 1; i++) { const o = i % 7; if (o === 2 || o === 6) continue; K.box(kw * 0.55, 0.022, 0.08, blk, -0.65 + kw * (i + 1), 0.838, z0 + 0.21); }
      K.box(1.45, 0.06, 0.04, blk, 0, 0.82, z0 + 0.315);
      // 보면대 + 악보
      const mr = K.box(0.6, 0.2, 0.015, blk, 0, 0.92, z0 - 0.08); mr.rotation.x = -0.25;
      [-0.12, 0.12].forEach(x => { const s = K.box(0.21, 0.27, 0.003, K.M('#fffaf0'), x, 0.97, z0 - 0.065); s.rotation.x = -0.25; s.rotation.y = x < 0 ? 0.05 : -0.05; });
      for (let i = 0; i < 5; i++) [-0.12, 0.12].forEach(x => { const l = K.box(0.17, 0.004, 0.002, K.M('#555'), x, 1.05 - i * 0.04, z0 - 0.06 + i * 0.01); l.rotation.x = -0.25; });
      K.sph(0.008, K.E('#ff3b3b', 2), 0.6, 0.8, z0 + 0.185, null, 6, 4);
      [-0.05, 0.05].forEach(x => K.box(0.04, 0.015, 0.08, K.M('#c8a24a', { metalness: 0.8, roughness: 0.25 }), x, 0.04, z0 + 0.1));
      // 메트로놈
      K.cyl(0.0, 0.045, 0.12, K.M('#8a5a32'), -0.55, 0.87, z0 - 0.05, null, 4);
    },
    hammock(K, T) {
      const wood = K.F('#b9824c'), woodD = K.F('#8a5a32');
      K.box(1.44, 0.06, 0.08, wood, 0, 0.03, 0);
      [-1, 1].forEach(s => {
        K.box(0.08, 0.04, 0.44, woodD, s * 0.68, 0.02, 0);
        K.rod([s * 0.68, 0.05, 0], [s * 0.62, 1.05, 0], 0.03, wood, null, 6);
        K.sph(0.025, K.M('#9aa1ad', { metalness: 0.6 }), s * 0.62, 1.04, 0.0, null, 6, 4);
      });
      // 천 (늘어진 면)
      const L = 1.0, W = 0.42, geo = new T.PlaneGeometry(L, W, 18, 6); geo.rotateX(-Math.PI / 2);
      const pa = geo.attributes.position;
      for (let i = 0; i < pa.count; i++) {
        const x = pa.getX(i), z = pa.getZ(i), u = 2 * x / L, v = 2 * z / W;
        const sag = 1 - u * u, pinch = 0.25 + 0.75 * Math.sqrt(Math.max(0, sag));
        pa.setXYZ(i, x, 0.82 - 0.4 * sag + 0.09 * v * v * sag, z * pinch);
      }
      geo.computeVertexNormals();
      const stripes = K.tex('hammock', 64, 128, (c, w, h) => { const cols = ['#ff7a6b', '#ffd166', '#7ec8c8', '#f4efe6', '#8a5cf6']; for (let i = 0; i < 8; i++) { c.fillStyle = cols[i % cols.length]; c.fillRect(0, i * h / 8, w, h / 8); } });
      const sw = K.dyn(K.grp(0, 0, 0));
      K.add(geo, new T.MeshStandardMaterial({ map: stripes, side: T.DoubleSide, roughness: 0.9 }), 0, 0, 0, sw);
      [-1, 1].forEach(s => [-0.04, 0, 0.04].forEach(z => K.rod([s * 0.5, 0.82, z], [s * 0.62, 1.03, 0], 0.005, K.M('#f2efe6'), null, 4)));
      const pl = K.rbox(0.18, 0.08, 0.26, 0.04, K.F('#fffaf0'), -0.32, 0.6, 0, sw); pl.rotation.z = 0.45;
      const bk = K.box(0.1, 0.02, 0.14, K.F('#2f6fed'), 0.1, 0.45, 0.02, sw); bk.rotation.set(0.1, 0.4, 0);
      return (t) => { sw.rotation.x = Math.sin(t * 1.2) * 0.04; sw.position.z = Math.sin(t * 1.2) * 0.02; };
    },

    // ── 조명 ──
    floor_lamp(K, T) {
      const blk = K.M('#2b2f3e', { metalness: 0.4, roughness: 0.4 }), brass = K.M('#c8a24a', { metalness: 0.75, roughness: 0.3 });
      K.cyl(0.13, 0.15, 0.03, blk, 0, 0.015, 0, null, 18);
      K.cyl(0.012, 0.012, 1.35, brass, 0, 0.7, 0, null, 8);
      const shadeM = new T.MeshStandardMaterial({ color: '#fff1cf', emissive: '#ffcf7a', emissiveIntensity: 0.6, side: T.DoubleSide, roughness: 0.8 });
      K.cyl(0.12, 0.18, 0.24, shadeM, 0, 1.42, 0, null, 18, true);
      K.tor(0.18, 0.006, brass, 0, 1.3, 0, null, 4, 24).rotation.x = Math.PI / 2;
      const bulb = K.sph(0.045, K.E('#fff2c0', 2), 0, 1.38, 0, null, 10, 8);
      K.rod([0.05, 1.36, 0.0], [0.05, 1.24, 0.0], 0.002, brass); K.sph(0.008, brass, 0.05, 1.235, 0);
      const h = K.sph(0.3, K.halo('#ffcf7a', 0.1), 0, 1.4, 0, null, 14, 10);
      const pool = K.add(new T.CircleGeometry(0.42, 24), K.halo('#ffcf7a', 0.08), 0, 0.006, 0); pool.rotation.x = -Math.PI / 2;
      return (t, env) => { const n = env ? env.night : 0; shadeM.emissiveIntensity = 0.45 + n * 0.9; bulb.material.emissiveIntensity = 1.5 + n * 1.5; h.material.opacity = 0.015 + n * 0.12; pool.material.opacity = 0.01 + n * 0.12; };
    },
    lava_lamp(K, T) {
      const wood = K.M('#d8b48a'), metal = K.M('#c9ced8', { metalness: 0.8, roughness: 0.25 });
      // 작은 원형 협탁
      K.cyl(0.2, 0.2, 0.03, wood, 0, 0.4, 0, null, 20);
      K.cyl(0.02, 0.02, 0.38, K.M('#2b2f3e'), 0, 0.2, 0, null, 8);
      K.cyl(0.12, 0.13, 0.02, K.M('#2b2f3e'), 0, 0.01, 0, null, 16);
      const y0 = 0.415;
      K.cyl(0.045, 0.075, 0.1, metal, 0, y0 + 0.05, 0, null, 14);
      const liquid = new T.MeshStandardMaterial({ color: '#b46bff', emissive: '#7a2cff', emissiveIntensity: 0.5, transparent: true, opacity: 0.55, roughness: 0.1, depthWrite: false });
      K.lathe([[0.0, 0], [0.045, 0], [0.065, 0.12], [0.04, 0.27], [0.0, 0.27]], liquid, 0, y0 + 0.1, 0, null, 18);
      K.lathe([[0.0, 0], [0.032, 0], [0.045, 0.08], [0.0, 0.08]], metal, 0, y0 + 0.36, 0, null, 14);
      const blobM = K.E('#ff8a3d', 1.4), blobs = [];
      for (let i = 0; i < 4; i++) blobs.push({ m: K.dyn(K.sph(0.022 + i * 0.004, blobM, 0, 0, 0, null, 8, 6)), k: i * 0.27, sp: 0.18 + i * 0.05 });
      const h = K.sph(0.16, K.halo('#c46bff', 0.12), 0, y0 + 0.24, 0, null, 12, 8);
      return (t, env) => {
        blobs.forEach(b => {
          const q = (Math.sin(t * b.sp + b.k * 6) + 1) / 2, yy = 0.03 + q * 0.21, r = 0.055 - Math.abs(yy - 0.12) * 0.1;
          b.m.position.set(Math.sin(t * 0.7 + b.k * 9) * r * 0.4, y0 + 0.1 + yy, Math.cos(t * 0.5 + b.k * 7) * r * 0.4);
          b.m.scale.set(1, 1 + Math.sin(t * 1.3 + b.k) * 0.25, 1);
        });
        h.material.opacity = 0.02 + (env ? env.night : 0) * 0.14;
      };
    },
    moon_lamp(K, T) {
      const wood = K.M('#9a6a3e');
      K.rbox(0.3, 0.04, 0.24, 0.02, wood, 0, 0.02, 0);
      K.rod([-0.08, 0.04, 0], [-0.03, 0.13, 0], 0.012, wood); K.rod([0.08, 0.04, 0], [0.03, 0.13, 0], 0.012, wood);
      const geo = new T.IcosahedronGeometry(0.19, 3), pa = geo.attributes.position, col = new Float32Array(pa.count * 3);
      const crater = [[0.5, 0.6, 0.6, 0.35], [-0.6, 0.2, 0.75, 0.3], [0.1, -0.5, 0.85, 0.28], [-0.2, 0.75, -0.6, 0.3], [0.8, -0.2, -0.5, 0.35], [-0.5, -0.6, -0.5, 0.3], [0.2, 0.2, 0.95, 0.18]];
      for (let i = 0; i < pa.count; i += 3) {
        let cx = 0, cy = 0, cz = 0; for (let k = 0; k < 3; k++) { cx += pa.getX(i + k); cy += pa.getY(i + k); cz += pa.getZ(i + k); }
        const l = Math.hypot(cx, cy, cz); cx /= l; cy /= l; cz /= l;
        let v = 0.96 + K.rng() * 0.04;
        crater.forEach(([x, y, z, r]) => { const n = Math.hypot(x, y, z), d = Math.hypot(cx - x / n, cy - y / n, cz - z / n); if (d < r) v -= 0.18 * (1 - d / r); });
        for (let k = 0; k < 3; k++) { col[(i + k) * 3] = v; col[(i + k) * 3 + 1] = v * 0.95; col[(i + k) * 3 + 2] = v * 0.78; }
      }
      geo.setAttribute('color', new T.BufferAttribute(col, 3));
      const moonM = new T.MeshBasicMaterial({ vertexColors: true, color: '#fff6d8' });
      const moon = K.dyn(K.add(geo, moonM, 0, 0.32, 0));
      moon.castShadow = false;
      const h = K.sph(0.3, K.halo('#ffe9a8', 0.1), 0, 0.32, 0, null, 14, 10);
      return (t, env) => { moon.rotation.y = t * 0.1; h.material.opacity = 0.015 + (env ? env.night : 0) * 0.13; };
    },

    // ── 식물 ──
    monstera(K, T) {
      K.lathe([[0, 0], [0.11, 0], [0.15, 0.24], [0.155, 0.27], [0.14, 0.27], [0.0, 0.25]], K.M('#f2efe6', { roughness: 0.5 }), 0, 0, 0, null, 18);
      K.cyl(0.15, 0.15, 0.03, K.M('#e2a94e'), 0, 0.12, 0, null, 18, true);
      K.cyl(0.13, 0.13, 0.01, K.F('#5a3a20'), 0, 0.255, 0, null, 14);
      const leafShape = () => {
        const s = new T.Shape();
        s.moveTo(0, 0); s.bezierCurveTo(0.2, -0.04, 0.24, 0.22, 0, 0.32); s.bezierCurveTo(-0.24, 0.22, -0.2, -0.04, 0, 0);
        [[0.08, 0.12], [-0.08, 0.12], [0.1, 0.2], [-0.1, 0.2], [0.06, 0.05], [-0.06, 0.05]].forEach(([x, y]) => { const hp = new T.Path(); hp.absellipse(x, y, 0.028, 0.012, 0, Math.PI * 2, false, x > 0 ? 0.5 : -0.5); s.holes.push(hp); });
        return s;
      };
      const leafGeo = new T.ShapeGeometry(leafShape(), 6);
      const lpa = leafGeo.attributes.position;
      for (let i = 0; i < lpa.count; i++) { const x = lpa.getX(i), y = lpa.getY(i); lpa.setZ(i, -0.6 * y * y + Math.abs(x) * 0.25); }
      leafGeo.computeVertexNormals();
      const gA = new T.MeshStandardMaterial({ color: '#2f9a5a', side: T.DoubleSide, flatShading: true, roughness: 0.7 });
      const gB = new T.MeshStandardMaterial({ color: '#3fb46c', side: T.DoubleSide, flatShading: true, roughness: 0.7 });
      const stemM = K.M('#4f8a3a');
      const leaves = [];
      [[0.0, 0.62, 0.0, 0.25], [1.1, 0.55, 0.1, 0.5], [2.3, 0.7, 0.05, 0.4], [3.4, 0.5, 0.12, 0.6], [4.5, 0.66, 0.08, 0.45], [5.5, 0.48, 0.1, 0.7], [0.6, 0.85, 0.0, 0.1]].forEach(([a, h, off, tilt], i) => {
        const bx = Math.sin(a) * off, bz = Math.cos(a) * off, tx = Math.sin(a) * (off + 0.14), tz = Math.cos(a) * (off + 0.14);
        K.rod([bx * 0.3, 0.25, bz * 0.3], [tx, 0.25 + h * 0.75, tz], 0.008, stemM, null, 5);
        const p = K.dyn(K.grp(tx, 0.25 + h * 0.75, tz)); p.rotation.order = 'YXZ'; p.rotation.y = a; p.rotation.x = 0.9 + tilt * 0.6;
        const lf = K.add(leafGeo, i % 2 ? gA : gB, 0, 0, 0, p); lf.scale.setScalar(i === 6 ? 0.7 : 0.85 + (i % 3) * 0.08);
        leaves.push(p);
      });
      return (t) => leaves.forEach((p, i) => { p.rotation.z = Math.sin(t * 0.8 + i * 1.7) * 0.04; });
    },
    cactus(K) {
      const terra = K.F('#d9774a'), green = K.F('#4caf63'), greenD = K.F('#3d9a52');
      // 나무 받침대
      K.cyl(0.17, 0.17, 0.03, K.M('#c08a55'), 0, 0.24, 0, null, 14);
      [0, 2.1, 4.2].forEach(a => { const l = K.rod([Math.sin(a) * 0.15, 0, Math.cos(a) * 0.15], [Math.sin(a) * 0.1, 0.235, Math.cos(a) * 0.1], 0.012, K.M('#9a6a3e')); });
      const y0 = 0.255;
      K.cyl(0.12, 0.09, 0.16, terra, 0, y0 + 0.08, 0, null, 10);
      K.cyl(0.13, 0.13, 0.04, terra, 0, y0 + 0.16, 0, null, 10);
      K.cyl(0.115, 0.115, 0.01, K.F('#8a6a4a'), 0, y0 + 0.175, 0, null, 10);
      const y1 = y0 + 0.18;
      K.cyl(0.05, 0.055, 0.3, green, 0, y1 + 0.15, 0, null, 8); K.sph(0.05, green, 0, y1 + 0.3, 0, null, 8, 5);
      K.rod([0.04, y1 + 0.12, 0], [0.1, y1 + 0.12, 0], 0.025, greenD, null, 8); K.cyl(0.026, 0.026, 0.1, greenD, 0.1, y1 + 0.17, 0, null, 8); K.sph(0.026, greenD, 0.1, y1 + 0.22, 0, null, 8, 5);
      K.rod([-0.04, y1 + 0.18, 0], [-0.09, y1 + 0.18, 0], 0.022, greenD, null, 8); K.cyl(0.022, 0.022, 0.07, greenD, -0.09, y1 + 0.215, 0, null, 8); K.sph(0.022, greenD, -0.09, y1 + 0.25, 0, null, 8, 5);
      [0, 1.2, 2.4, 3.6, 4.8].forEach(a => K.sph(0.014, K.F('#ff7ab0'), Math.sin(a) * 0.016, y1 + 0.345, Math.cos(a) * 0.016, null, 5, 4));
      K.sph(0.01, K.F('#ffe066'), 0, y1 + 0.352, 0, null, 5, 4);
      const ball = K.ico(0.045, K.F('#6cc47a'), 0.07, y1 + 0.03, 0.05, null, 1); ball.scale.y = 0.8;
      for (let i = 0; i < 14; i++) { const a = K.rng() * 6.28, y = y1 + 0.05 + K.rng() * 0.24; K.box(0.004, 0.004, 0.02, K.M('#fffaf0'), Math.sin(a) * 0.053, y, Math.cos(a) * 0.053).rotation.y = a; }
    },
    bonsai(K) {
      const wood = K.M('#5a3a20'), trunk = K.F('#7a5236');
      K.rbox(0.44, 0.04, 0.34, 0.02, wood, 0, 0.3, 0);
      [[-0.19, -0.14], [0.19, -0.14], [-0.19, 0.14], [0.19, 0.14]].forEach(([x, z]) => K.box(0.04, 0.28, 0.04, wood, x, 0.14, z));
      K.box(0.36, 0.03, 0.03, wood, 0, 0.08, 0.14); K.box(0.36, 0.03, 0.03, wood, 0, 0.08, -0.14);
      const y0 = 0.32;
      K.rbox(0.32, 0.07, 0.2, 0.015, K.M('#2f4a7a', { roughness: 0.35 }), 0, y0 + 0.035, 0);
      K.box(0.3, 0.01, 0.18, K.F('#5aa04a'), 0, y0 + 0.072, 0);
      K.ico(0.03, K.F('#8a8f99'), 0.1, y0 + 0.08, 0.04).scale.y = 0.6;
      K.tube([[-0.03, y0 + 0.07, 0], [0.02, y0 + 0.15, 0.01], [-0.05, y0 + 0.24, 0], [0.0, y0 + 0.32, -0.01], [0.04, y0 + 0.36, 0]], 0.022, trunk, null, false, 24);
      K.tube([[0.0, y0 + 0.18, 0.01], [0.08, y0 + 0.22, 0.02], [0.14, y0 + 0.24, 0.03]], 0.011, trunk, null, false, 12);
      K.tube([[-0.04, y0 + 0.26, 0], [-0.11, y0 + 0.3, 0.0], [-0.16, y0 + 0.3, 0.02]], 0.01, trunk, null, false, 12);
      const fol = [K.F('#2f7a3a'), K.F('#3f9a4a'), K.F('#4aa856')];
      [[0.04, 0.4, 0, 0.09], [0.15, 0.27, 0.03, 0.065], [-0.16, 0.33, 0.02, 0.07], [-0.04, 0.33, 0.04, 0.05], [0.09, 0.42, -0.02, 0.06]].forEach(([x, y, z, r], i) => {
        const f = K.ico(r, fol[i % 3], x, y0 + y, z, null, 1); f.scale.set(1.3, 0.55, 1.1);
      });
    },
    flower_vase(K) {
      const wood = K.M('#f2efe6');
      K.cyl(0.17, 0.17, 0.03, wood, 0, 0.5, 0, null, 18);
      K.cyl(0.035, 0.05, 0.48, wood, 0, 0.25, 0, null, 10);
      K.cyl(0.13, 0.15, 0.03, wood, 0, 0.015, 0, null, 18);
      const y0 = 0.515;
      K.lathe([[0, 0], [0.05, 0], [0.08, 0.06], [0.075, 0.12], [0.035, 0.19], [0.04, 0.23], [0.032, 0.23], [0.0, 0.2]], K.M('#5b8fd8', { roughness: 0.25 }), 0, y0, 0, null, 18);
      K.tor(0.077, 0.006, K.M('#f2efe6', { roughness: 0.25 }), 0, y0 + 0.09, 0, null, 4, 18).rotation.x = Math.PI / 2;
      const stemM = K.M('#4f8a3a');
      const fl = [['#ff6b8a', 0.0, 0.0, 0.0], ['#ffd166', 0.07, 0.02, -0.12], ['#ff9a5a', -0.07, 0.03, 0.1], ['#f4efe6', 0.03, 0.07, -0.05], ['#c78bff', -0.04, -0.06, 0.06], ['#ff6b8a', 0.06, -0.05, 0.08]];
      fl.forEach(([c, dx, dz], i) => {
        const top = [dx * 2.2, y0 + 0.4 + (i % 3) * 0.05 - (i === 0 ? -0.04 : 0), dz * 2.2];
        K.rod([dx * 0.3, y0 + 0.18, dz * 0.3], top, 0.005, stemM, null, 4);
        const head = K.grp(top[0], top[1], top[2]);
        if (i % 2 === 0) { // 튤립
          const b = K.sph(0.03, K.F(c), 0, 0.02, 0, head, 8, 6); b.scale.y = 1.3;
          for (let k = 0; k < 3; k++) { const p = K.cone(0.016, 0.035, K.F(c), Math.sin(k * 2.1) * 0.015, 0.05, Math.cos(k * 2.1) * 0.015, head, 4); }
        } else { // 데이지
          K.sph(0.014, K.F('#ffcf3a'), 0, 0.01, 0, head, 8, 6);
          for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2, p = K.sph(0.014, K.F(c), Math.sin(a) * 0.024, 0.006, Math.cos(a) * 0.024, head, 6, 4); p.scale.set(1, 0.35, 1); }
        }
      });
      [[0.06, 0.32, 0.03, 0.6], [-0.06, 0.3, -0.02, -0.6], [0.0, 0.34, -0.06, 0.2]].forEach(([x, y, z, r]) => { const l = K.sph(0.035, K.F('#5aa04a'), x, y0 + y, z, null, 6, 4); l.scale.set(0.35, 1.2, 0.12); l.rotation.z = r; });
    },
    hanging_plant(K) {
      const rope = K.M('#f2e6d0'), metal = K.M('#2b2f3e', { metalness: 0.5, roughness: 0.4 });
      K.box(0.05, 0.08, 0.015, metal, 0, 0.22, 0.008);
      K.rod([0, 0.24, 0.01], [0, 0.24, 0.3], 0.008, metal);
      K.tor(0.012, 0.003, metal, 0, 0.225, 0.29, null, 4, 8);
      const sw = K.dyn(K.grp(0, 0.21, 0.29));
      const potY = -0.42;
      [0, 2.1, 4.2].forEach(a => K.rod([0, 0, 0], [Math.sin(a) * 0.1, potY + 0.11, Math.cos(a) * 0.1], 0.003, rope, sw, 4));
      K.lathe([[0, 0], [0.07, 0], [0.1, 0.06], [0.105, 0.12], [0.0, 0.11]], K.F('#f7f3ea'), 0, potY - 0.01, 0, sw, 12);
      K.tor(0.103, 0.006, rope, 0, potY + 0.06, 0, sw, 4, 14).rotation.x = Math.PI / 2;
      const lfA = K.F('#3fb46c'), lfB = K.F('#2f9a5a');
      [[0, 0.14, 0, 0.07], [0.05, 0.13, 0.04, 0.05], [-0.05, 0.13, -0.03, 0.05], [0.03, 0.15, -0.05, 0.05]].forEach(([x, y, z, r], i) => K.ico(r, i % 2 ? lfA : lfB, x, potY + y, z, sw, 1).scale.y = 0.7);
      const vines = [];
      [[0.08, 0.06, 0.32], [-0.06, 0.08, 0.26], [0.02, 0.1, 0.4], [-0.09, -0.02, 0.22], [0.06, -0.08, 0.3]].forEach(([x, z, len], vi) => {
        const v = K.dyn(K.grp(x, potY + 0.1, z, sw)); vines.push(v);
        const n = Math.round(len / 0.04);
        for (let i = 0; i < n; i++) {
          const yy = -i * 0.04, sx = Math.sin(i * 0.9 + vi) * 0.01;
          K.rod([sx, yy, 0], [Math.sin((i + 1) * 0.9 + vi) * 0.01, yy - 0.04, 0], 0.002, K.M('#4f8a3a'), v, 3);
          const l = K.sph(0.018, i % 2 ? lfA : lfB, sx + (i % 2 ? 0.014 : -0.014), yy - 0.02, 0.005, v, 5, 4); l.scale.set(1, 0.6, 0.3); l.rotation.z = i % 2 ? -0.6 : 0.6;
        }
      });
      return (t) => { sw.rotation.z = Math.sin(t * 0.9) * 0.035; vines.forEach((v, i) => { v.rotation.z = Math.sin(t * 1.3 + i) * 0.06; }); };
    },

    // ── 벽 장식 ──
    poster_movie(K) {
      const tx = K.tex('poster_movie', 256, 368, (c, w, h) => {
        const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#1a1240'); gr.addColorStop(0.55, '#5a2a7a'); gr.addColorStop(1, '#ff8a5a'); c.fillStyle = gr; c.fillRect(0, 0, w, h);
        const r = seeded(7); for (let i = 0; i < 70; i++) { c.fillStyle = `rgba(255,255,255,${0.4 + r() * 0.6})`; c.fillRect(r() * w, r() * h * 0.6, 1.5, 1.5); }
        c.fillStyle = '#ffcf6a'; c.beginPath(); c.arc(170, 120, 52, 0, 7); c.fill();
        c.fillStyle = 'rgba(255,140,80,.55)'; c.beginPath(); c.arc(156, 106, 12, 0, 7); c.arc(190, 140, 8, 0, 7); c.fill();
        c.strokeStyle = '#ffe9b0'; c.lineWidth = 6; c.beginPath(); c.ellipse(170, 120, 90, 20, -0.35, 0, 7); c.stroke();
        // 고양이 우주인 실루엣
        c.fillStyle = '#16102e'; c.beginPath(); c.arc(80, 250, 34, 0, 7); c.fill();
        c.beginPath(); c.moveTo(52, 232); c.lineTo(58, 196); c.lineTo(76, 222); c.fill(); c.beginPath(); c.moveTo(108, 232); c.lineTo(102, 196); c.lineTo(84, 222); c.fill();
        c.strokeStyle = '#9fe8ff'; c.lineWidth = 4; c.beginPath(); c.arc(80, 248, 44, 0, 7); c.stroke();
        c.fillStyle = '#ffe066'; c.beginPath(); c.arc(68, 246, 5, 0, 7); c.arc(92, 246, 5, 0, 7); c.fill();
        c.fillStyle = '#16102e'; c.fillRect(0, 300, w, h - 300);
        c.fillStyle = '#ffd84d'; c.font = '900 30px Arial Black, Impact, sans-serif'; c.textAlign = 'center'; c.fillText('COSMIC', w / 2, 330); c.fillText('CAT', w / 2, 360);
        c.fillStyle = '#ff9a9a'; c.font = '700 11px sans-serif'; c.fillText('★★★★★  IN THEATERS', w / 2, 290);
      });
      K.box(0.48, 0.68, 0.015, K.M('#20232b'), 0, 0, 0.0075);
      K.picture(0.44, 0.64, tx, 0, 0, 0.016);
    },
    poster_game(K) {
      const tx = K.tex('poster_game', 64, 84, (c, w, h) => {
        c.fillStyle = '#1b2a4a'; c.fillRect(0, 0, w, h);
        for (let y = 0; y < 50; y += 4) for (let x = 0; x < w; x += 4) if ((x * 7 + y * 13) % 23 === 0) { c.fillStyle = '#ffffff'; c.fillRect(x, y, 1, 1); }
        c.fillStyle = '#3aa676'; c.fillRect(0, 54, w, 4); c.fillStyle = '#7a5236'; c.fillRect(0, 58, w, 6);
        const spr = ['..rrrr..', '.rrrrrr.', '.ssffss.', 'sfsffsfs', 'sffffffs', '..bbbb..', '.bbyybb.', '.b.bb.b.'];
        const P = { r: '#e5484d', s: '#5a3a20', f: '#f3c9a1', b: '#2f6fed', y: '#ffd84d' };
        spr.forEach((row, j) => [...row].forEach((ch, i) => { if (P[ch]) { c.fillStyle = P[ch]; c.fillRect(14 + i * 2, 38 + j * 2, 2, 2); } }));
        c.fillStyle = '#ffd84d'; c.fillRect(42, 30, 6, 6); c.fillStyle = '#f5a623'; c.fillRect(44, 32, 2, 2);
        c.fillStyle = '#e5484d'; [[40, 46], [48, 46], [44, 42]].forEach(([x, y]) => c.fillRect(x, y, 4, 4));
        c.fillStyle = '#ffd84d'; c.font = 'bold 9px monospace'; c.textAlign = 'center'; c.fillText('PIXEL', w / 2, 13); c.fillText('QUEST', w / 2, 23);
        c.fillStyle = '#9fe8ff'; c.font = '6px monospace'; c.fillText('PRESS START', w / 2, 76);
      }, { nearest: true });
      const p = K.grp(0, 0, 0); p.rotation.z = 0.04;
      K.box(0.5, 0.66, 0.004, K.M('#fffaf0'), 0, 0, 0.002, p);
      K.picture(0.46, 0.62, tx, 0, 0, 0.0045, p);
      const tape = K.M('#f7e7a0', { transparent: true, opacity: 0.85 });
      [[-0.23, 0.31, 0.7], [0.23, 0.31, -0.7], [-0.23, -0.31, -0.7], [0.23, -0.31, 0.7]].forEach(([x, y, r]) => K.box(0.09, 0.03, 0.002, tape, x, y, 0.006, p).rotation.z = r);
    },
    painting(K, T) {
      const tx = K.tex('painting', 320, 224, (c, w, h) => {
        const gr = c.createLinearGradient(0, 0, 0, h * 0.6); gr.addColorStop(0, '#ff9e6a'); gr.addColorStop(0.6, '#ffd59a'); gr.addColorStop(1, '#ffe8c0'); c.fillStyle = gr; c.fillRect(0, 0, w, h);
        c.fillStyle = '#fff2c6'; c.beginPath(); c.arc(220, 92, 26, 0, 7); c.fill();
        const mtn = (col, pts) => { c.fillStyle = col; c.beginPath(); c.moveTo(0, h); pts.forEach(([x, y]) => c.lineTo(x, y)); c.lineTo(w, h); c.fill(); };
        mtn('#9a7ab8', [[0, 120], [60, 70], [110, 105], [170, 60], [240, 110], [290, 80], [320, 100]]);
        mtn('#6a5a9a', [[0, 140], [50, 110], [120, 140], [200, 100], [270, 135], [320, 120]]);
        c.fillStyle = '#5a8ac0'; c.fillRect(0, 150, w, 74);
        const r = seeded(11);
        for (let i = 0; i < 260; i++) { const y = 152 + r() * 70; c.fillStyle = `rgba(255,${200 + r() * 55},${150 + r() * 80},${0.15 + r() * 0.3})`; c.fillRect(r() * w, y, 6 + r() * 16, 2); }
        c.fillStyle = 'rgba(255,240,190,.6)'; for (let i = 0; i < 18; i++) c.fillRect(205 + (r() - 0.5) * 30, 152 + i * 4, 10 + r() * 20, 2);
        mtn('#2f5a3a', [[0, 180], [40, 165], [80, 178], [120, 160], [150, 175], [0, 224]]);
        for (let i = 0; i < 400; i++) { c.fillStyle = `rgba(${r() * 255},${r() * 200},${r() * 160},0.06)`; c.fillRect(r() * w, r() * h, 8, 3); }
      });
      const gold = K.M('#c9a14a', { metalness: 0.8, roughness: 0.3 }), goldD = K.M('#a07a2a', { metalness: 0.8, roughness: 0.35 });
      const W = 0.72, H = 0.52, f = 0.06;
      K.box(W + 2 * f, f, 0.05, gold, 0, H / 2 + f / 2, 0.025); K.box(W + 2 * f, f, 0.05, gold, 0, -H / 2 - f / 2, 0.025);
      K.box(f, H, 0.05, gold, -W / 2 - f / 2, 0, 0.025); K.box(f, H, 0.05, gold, W / 2 + f / 2, 0, 0.025);
      K.box(W + 0.02, 0.012, 0.055, goldD, 0, H / 2, 0.03); K.box(W + 0.02, 0.012, 0.055, goldD, 0, -H / 2, 0.03);
      K.box(0.012, H, 0.055, goldD, -W / 2, 0, 0.03); K.box(0.012, H, 0.055, goldD, W / 2, 0, 0.03);
      [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([sx, sy]) => K.sph(0.025, gold, sx * (W / 2 + f / 2), sy * (H / 2 + f / 2), 0.05, null, 8, 6));
      K.box(W, H, 0.01, K.M('#f2efe6'), 0, 0, 0.012);
      K.picture(W - 0.01, H - 0.01, tx, 0, 0, 0.018);
      // 액자 조명
      const brass = K.M('#c8a24a', { metalness: 0.75, roughness: 0.3 });
      K.box(0.04, 0.03, 0.02, brass, 0, H / 2 + f + 0.04, 0.01);
      K.rod([0, H / 2 + f + 0.04, 0.02], [0, H / 2 + f + 0.08, 0.12], 0.006, brass);
      const lamp = K.cyl(0.022, 0.022, 0.24, brass, 0, H / 2 + f + 0.08, 0.13, null, 10); lamp.rotation.z = Math.PI / 2;
      const lit = K.box(0.22, 0.006, 0.02, K.E('#fff2c0', 1.5), 0, H / 2 + f + 0.06, 0.13);
      const wash = K.add(new T.PlaneGeometry(W + 0.1, H * 0.7), K.halo('#ffe6b0', 0.0), 0, H * 0.15, 0.025); wash.renderOrder = 2;
      return (t, env) => { const n = env ? env.night : 0; wash.material.opacity = n * 0.12; lit.material.emissiveIntensity = 0.8 + n * 1.5; };
    },
    clock(K, T) {
      const tx = K.tex('clock', 256, 256, (c, w) => {
        c.fillStyle = '#fffaf0'; c.fillRect(0, 0, w, w);
        c.translate(w / 2, w / 2);
        for (let i = 0; i < 60; i++) { c.save(); c.rotate(i / 60 * Math.PI * 2); c.fillStyle = i % 5 ? '#9aa1ad' : '#2b2f3e'; c.fillRect(i % 5 ? -1.5 : -4, -118, i % 5 ? 3 : 8, i % 5 ? 10 : 20); c.restore(); }
        c.fillStyle = '#2b2f3e'; c.font = 'bold 30px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        [12, 3, 6, 9].forEach((n, i) => { const a = i / 4 * Math.PI * 2; c.fillText(String(n), Math.sin(a) * 78, -Math.cos(a) * 78); });
        c.fillStyle = '#e5484d'; c.font = 'bold 13px sans-serif'; c.fillText('♥', 0, 40);
      });
      const rimM = K.M('#ff8a6b', { roughness: 0.4 });
      const body = K.cyl(0.21, 0.21, 0.045, rimM, 0, 0, 0.0225, null, 32); body.rotation.x = Math.PI / 2;
      K.tor(0.205, 0.016, rimM, 0, 0, 0.045, null, 8, 32);
      K.add(new T.CircleGeometry(0.19, 40), new T.MeshStandardMaterial({ map: tx, roughness: 0.5 }), 0, 0, 0.046);
      const hand = (len, wid, col, z) => { const p = K.dyn(K.grp(0, 0, z)); K.box(wid, len, 0.004, K.M(col), 0, len / 2 - 0.02, 0, p); return p; };
      const hh = hand(0.11, 0.014, '#2b2f3e', 0.05), mm = hand(0.155, 0.009, '#2b2f3e', 0.054), ss = hand(0.165, 0.004, '#e5484d', 0.058);
      K.cyl(0.012, 0.012, 0.012, K.M('#e5484d'), 0, 0, 0.06, null, 10).rotation.x = Math.PI / 2;
      K.add(new T.CircleGeometry(0.19, 40), K.glass('#ffffff', 0.12), 0, 0, 0.066);
      return () => {
        const d = new Date(), s = d.getSeconds() + d.getMilliseconds() / 1000, m = d.getMinutes() + s / 60, h = (d.getHours() % 12) + m / 60;
        ss.rotation.z = -Math.floor(s) / 60 * Math.PI * 2; mm.rotation.z = -m / 60 * Math.PI * 2; hh.rotation.z = -h / 12 * Math.PI * 2;
      };
    },
    shelf_wall(K) {
      const wood = K.M('#c08a55'), y = -0.05, top = y + 0.0175;
      K.rbox(0.72, 0.035, 0.2, 0.01, wood, 0, y, 0.1);
      [-0.26, 0.26].forEach(x => { K.box(0.02, 0.1, 0.02, K.M('#2b2f3e'), x, y - 0.07, 0.01); K.rod([x, y - 0.11, 0.01], [x, y - 0.02, 0.15], 0.008, K.M('#2b2f3e')); });
      // 책 3권 + 북엔드
      [['#e5484d', 0.035, 0.2], ['#2f6fed', 0.03, 0.17], ['#f5b83d', 0.04, 0.22]].forEach(([c, w, h], i) => K.box(w, h, 0.14, K.F(c), -0.3 + i * 0.042, top + h / 2, 0.1));
      const lb = K.box(0.03, 0.18, 0.14, K.F('#3aa676'), -0.155, top + 0.085, 0.1); lb.rotation.z = -0.35; lb.position.x += 0.02;
      // 다육이
      K.cyl(0.04, 0.032, 0.06, K.F('#f2efe6'), -0.02, top + 0.03, 0.1, null, 10);
      for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28; const l = K.cone(0.015, 0.05, K.F('#7cc48a'), Math.sin(a) * 0.015, top + 0.08, 0.1 + Math.cos(a) * 0.015, null, 4); l.rotation.set(Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.5); }
      // 머그
      K.cyl(0.03, 0.03, 0.07, K.F('#ffd0e0'), 0.1, top + 0.035, 0.1, null, 12);
      K.tor(0.02, 0.006, K.F('#ffd0e0'), 0.135, top + 0.035, 0.1, null, 4, 8);
      // 사진 액자 (기대 세움)
      const fr = K.grp(0.22, top, 0.08); fr.rotation.x = -0.15;
      K.box(0.12, 0.15, 0.012, K.M('#2b2f3e'), 0, 0.075, 0, fr);
      K.box(0.095, 0.12, 0.003, K.M('#9fd8ff'), 0, 0.08, 0.007, fr);
      K.sph(0.025, K.F('#ffd84d'), -0.02, 0.06, 0.009, fr, 6, 4).scale.z = 0.1;
      K.box(0.095, 0.03, 0.003, K.M('#5cc46a'), 0, 0.035, 0.008, fr);
      figure(K, 'dino', 0.31, top, 0.11);
    },
    world_map(K) {
      const tx = K.tex('world_map', 360, 200, (c, w, h) => {
        c.fillStyle = '#7cc3e0'; c.fillRect(0, 0, w, h);
        c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 1;
        for (let x = 0; x <= w; x += 30) { c.beginPath(); c.moveTo(x, 10); c.lineTo(x, h - 10); c.stroke(); }
        for (let y = 10; y <= h - 10; y += 30) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
        const land = [
          ['#9ed27a', [[20, 40], [60, 25], [110, 30], [125, 50], [100, 70], [92, 90], [78, 100], [64, 88], [40, 70], [22, 56]]],
          ['#f2c46a', [[86, 104], [104, 108], [116, 124], [108, 150], [96, 176], [90, 160], [84, 130]]],
          ['#f5a66a', [[165, 36], [196, 28], [204, 46], [190, 56], [172, 58]]],
          ['#e8d36a', [[168, 66], [200, 62], [216, 82], [210, 112], [196, 140], [184, 138], [176, 108], [164, 86]]],
          ['#c7e08a', [[204, 30], [260, 20], [320, 30], [338, 48], [316, 70], [292, 92], [270, 84], [252, 96], [236, 78], [214, 58]]],
          ['#f08a8a', [[290, 130], [322, 126], [334, 144], [318, 158], [296, 152]]],
          ['#fff', [[120, 6], [150, 4], [146, 18], [128, 20]]],
        ];
        land.forEach(([col, pts]) => { c.fillStyle = col; c.strokeStyle = 'rgba(60,80,60,.5)'; c.lineWidth = 2; c.beginPath(); pts.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath(); c.fill(); c.stroke(); });
        c.fillStyle = '#f08a8a'; c.beginPath(); c.arc(306, 56, 4, 0, 7); c.fill();
        c.fillStyle = '#2b4a6a'; c.font = 'bold 12px serif'; c.textAlign = 'center'; c.fillText('WORLD', w / 2, h - 6);
        c.strokeStyle = '#2b4a6a'; c.lineWidth = 1.5; c.beginPath(); c.arc(40, 160, 16, 0, 7); c.stroke(); c.beginPath(); c.moveTo(40, 140); c.lineTo(40, 180); c.moveTo(20, 160); c.lineTo(60, 160); c.stroke();
      });
      const wood = K.M('#8a5a32'), W = 0.9, H = 0.5;
      K.box(W + 0.05, H + 0.05, 0.02, wood, 0, 0, 0.01);
      K.picture(W, H, tx, 0, 0, 0.021);
      [[0.36, 0.09, '#e5484d'], [-0.22, 0.05, '#ffd84d'], [0.02, -0.02, '#2f6fed'], [-0.12, -0.12, '#3aa676']].forEach(([x, y, c]) => {
        K.rod([x, y, 0.021], [x, y, 0.045], 0.002, K.M('#c9ced8', { metalness: 0.7 }));
        K.sph(0.012, K.M(c), x, y, 0.048, null, 8, 6);
      });
    },

    // ── 조명 (벽) ──
    string_lights(K) {
      const pts = [];
      for (let i = 0; i <= 24; i++) { const u = i / 24, x = -0.62 + u * 1.24, s = Math.sin(u * Math.PI * 2); pts.push([x, 0.12 - 0.13 * Math.abs(s), 0.03]); }
      K.tube(pts, 0.004, K.M('#3a3d46'), null, false, 60);
      [-0.62, 0, 0.62].forEach(x => K.sph(0.01, K.M('#c9ced8', { metalness: 0.6 }), x, 0.12, 0.02, null, 6, 4));
      const cols = ['#ffd56b', '#ff8fa3', '#8fe3ff', '#b4ff8f', '#ffb36b', '#d9a6ff'];
      const bulbs = [];
      for (let i = 1; i < 24; i += 2) {
        const p = pts[i];
        K.cyl(0.008, 0.008, 0.015, K.M('#3a3d46'), p[0], p[1] - 0.01, 0.03, null, 6);
        const b = K.sph(0.017, K.E(cols[(i >> 1) % cols.length], 1.6), p[0], p[1] - 0.032, 0.032, null, 8, 6); b.scale.y = 1.3; b.castShadow = false;
        bulbs.push(b);
      }
      // 폴라로이드 사진
      const photos = [['#ffb3c6', -0.31], ['#9fd8ff', 0.0], ['#c7f0a8', 0.31]];
      photos.forEach(([c, x], i) => {
        const p = K.grp(x, 0.0, 0.02); p.rotation.z = (i - 1) * 0.12;
        K.box(0.012, 0.022, 0.012, K.M('#c08a55'), 0, -0.002, 0.008, p);
        K.box(0.09, 0.105, 0.003, K.M('#fffaf0'), 0, -0.06, 0.004, p);
        K.box(0.075, 0.072, 0.002, K.M(c), 0, -0.052, 0.007, p);
        K.sph(0.014, K.F('#fff6c0'), 0.015, -0.04, 0.008, p, 6, 4).scale.z = 0.1;
      });
      return (t, env) => { const n = env ? env.night : 0; bulbs.forEach((b, i) => { b.material.emissiveIntensity = (1.1 + n * 1.2) * (0.75 + 0.25 * Math.sin(t * 2.2 + i * 1.9)); }); };
    },
    neon_heart(K, T) {
      const pts = [];
      for (let i = 0; i < 64; i++) { const a = i / 64 * Math.PI * 2; pts.push([0.0115 * 16 * Math.pow(Math.sin(a), 3), 0.0115 * (13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) + 0.03, 0.04]); }
      K.rbox(0.5, 0.46, 0.012, 0.03, K.glass('#e8f6ff', 0.25), 0, 0, 0.022);
      [[-0.2, 0.18], [0.2, 0.18], [-0.2, -0.18], [0.2, -0.18]].forEach(([x, y]) => K.cyl(0.012, 0.012, 0.03, K.M('#c9ced8', { metalness: 0.8, roughness: 0.2 }), x, y, 0.015, null, 8).rotation.x = Math.PI / 2);
      const neonM = K.E('#ff2d7a', 1.1);
      const tube = K.tube(pts, 0.011, neonM, null, true, 120); tube.castShadow = false;
      const haloM = K.halo('#ff2d7a', 0.12);
      K.tube(pts, 0.028, haloM, null, true, 80);
      const wash = K.tex('neonwash', 128, 128, (c, w) => { const gr = c.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, w, w); });
      const wm = new T.MeshBasicMaterial({ color: '#ff2d7a', map: wash, transparent: true, opacity: 0.35, blending: T.AdditiveBlending, depthWrite: false });
      K.add(new T.PlaneGeometry(0.9, 0.8), wm, 0, 0, 0.004);
      return (t, env) => {
        const flick = (Math.sin(t * 37) > 0.97 || (t % 7 > 6.6 && Math.sin(t * 60) > 0)) ? 0.35 : 1;
        const n = env ? env.night : 0;
        neonM.emissiveIntensity = (0.9 + n * 0.8) * flick; haloM.opacity = (0.08 + n * 0.14) * flick; wm.opacity = (0.08 + n * 0.3) * flick;
      };
    },

    // ── 수집품 ──
    figure_set(K) {
      const frameM = K.M('#f4efe6'), W = 0.46, H = 1.45, D = 0.36, z0 = -0.05;
      K.box(W, 0.08, D, frameM, 0, 0.04, z0); K.box(W, 0.04, D, frameM, 0, H - 0.02, z0);
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => K.box(0.03, H, 0.03, frameM, sx * (W / 2 - 0.015), H / 2, z0 + sz * (D / 2 - 0.015)));
      K.box(W - 0.02, H - 0.1, 0.01, K.M('#2f3a5a'), 0, H / 2, z0 - D / 2 + 0.01);
      const gl = K.glass('#dff4ff', 0.16);
      const levels = [0.08, 0.42, 0.76, 1.1];
      levels.slice(1).forEach(y => K.box(W - 0.04, 0.012, D - 0.04, K.glass('#e8f8ff', 0.35), 0, y, z0));
      K.box(W - 0.03, H - 0.12, 0.004, gl, 0, H / 2, z0 + D / 2 - 0.005);
      [-1, 1].forEach(s => K.box(0.004, H - 0.12, D - 0.03, gl, s * (W / 2 - 0.004), H / 2, z0));
      K.box(W - 0.06, 0.012, 0.012, K.E('#e8f6ff', 1.6), 0, H - 0.05, z0 + D / 2 - 0.04);
      const kinds = [['robot', 'mecha', 'magic'], ['knight', 'dino', 'idol'], ['hero', 'mecha', 'robot'], ['magic', 'knight']];
      kinds.forEach((row, li) => row.forEach((k, i) => {
        const n = row.length, x = (i - (n - 1) / 2) * 0.13;
        const f = figure(K, k, x, levels[li] + 0.006 + (li === 0 ? 0.0 : 0), z0 + 0.02 + (i % 2) * 0.04);
        f.rotation.y = (i - (n - 1) / 2) * -0.3; f.scale.setScalar(1.15);
      }));
    },
    vinyl(K, T) {
      const wood = K.M('#8a5a32'), woodL = K.M('#b9824c');
      K.box(0.48, 0.03, 0.4, woodL, 0, 0.465, -0.01); K.box(0.48, 0.03, 0.4, woodL, 0, 0.065, -0.01);
      [-0.225, 0.225].forEach(x => K.box(0.03, 0.43, 0.4, wood, x, 0.265, -0.01));
      K.box(0.44, 0.43, 0.01, wood, 0, 0.265, -0.205);
      [[-0.2, -0.18], [0.2, -0.18], [-0.2, 0.16], [0.2, 0.16]].forEach(([x, z]) => K.cyl(0.015, 0.012, 0.05, K.M('#2b2f3e'), x, 0.025, z, null, 6));
      let x = -0.2;
      for (let i = 0; i < 16 && x < 0.19; i++) { const c = pick(K, BOOKC), w = 0.016 + K.rng() * 0.01; const s = K.box(w, 0.32, 0.32, K.F(c), x + w / 2, 0.24, 0.0); if (i === 9) s.rotation.z = -0.2; x += w + 0.004; }
      const front = K.grp(0.0, 0.08, 0.17); front.rotation.x = -0.2;
      K.box(0.3, 0.3, 0.012, K.F('#ffd166'), 0, 0.15, 0, front);
      K.cyl(0.07, 0.07, 0.004, K.F('#e5484d'), 0, 0.17, 0.007, front, 20).rotation.x = Math.PI / 2;
      // 턴테이블
      const y = 0.48;
      K.rbox(0.44, 0.06, 0.34, 0.015, K.M('#2b2f3e', { roughness: 0.4 }), 0, y + 0.03, -0.01);
      K.box(0.44, 0.008, 0.34, K.M('#c08a55'), 0, y + 0.004, -0.01);
      K.cyl(0.14, 0.14, 0.015, K.M('#9aa1ad', { metalness: 0.7, roughness: 0.3 }), -0.04, y + 0.067, -0.01, null, 28);
      const recTx = K.tex('vinylrec', 256, 256, (c, w) => {
        c.fillStyle = '#16171b'; c.fillRect(0, 0, w, w);
        for (let r = 30; r < 128; r += 3) { c.strokeStyle = r % 9 ? 'rgba(255,255,255,.05)' : 'rgba(255,255,255,.12)'; c.beginPath(); c.arc(w / 2, w / 2, r, 0, 7); c.stroke(); }
        c.fillStyle = '#ff6b8a'; c.beginPath(); c.arc(w / 2, w / 2, 34, 0, 7); c.fill();
        c.fillStyle = '#ffd84d'; c.beginPath(); c.arc(w / 2, w / 2, 34, 0, 1.6); c.lineTo(w / 2, w / 2); c.fill();
        c.fillStyle = '#16171b'; c.beginPath(); c.arc(w / 2, w / 2, 4, 0, 7); c.fill();
      });
      const rec = K.dyn(K.grp(-0.04, y + 0.076, -0.01));
      K.cyl(0.135, 0.135, 0.004, [K.M('#16171b'), new T.MeshStandardMaterial({ map: recTx, roughness: 0.3, metalness: 0.2 }), K.M('#16171b')], 0, 0, 0, rec, 32);
      K.cyl(0.004, 0.004, 0.02, K.M('#c9ced8', { metalness: 0.8 }), 0, 0.01, 0, rec, 6);
      const chrome = K.M('#d8dde5', { metalness: 0.85, roughness: 0.2 });
      K.cyl(0.025, 0.03, 0.03, chrome, 0.16, y + 0.075, -0.12, null, 12);
      const arm = K.grp(0.16, y + 0.1, -0.12); arm.rotation.y = 0.35;
      K.rod([0, 0, 0], [-0.02, 0, 0.2], 0.005, chrome, arm);
      K.box(0.025, 0.012, 0.04, K.M('#2b2f3e'), -0.02, -0.008, 0.21, arm);
      K.cyl(0.018, 0.018, 0.035, K.M('#2b2f3e'), 0, 0, -0.035, arm, 10).rotation.x = Math.PI / 2;
      K.cyl(0.012, 0.012, 0.01, K.M('#9aa1ad'), 0.17, y + 0.065, 0.12, null, 10);
      K.sph(0.006, K.E('#3aff8a', 2), 0.12, y + 0.062, 0.157, null, 6, 4);
      return (t) => { rec.rotation.y = -t * 3.5; };
    },
    guitar_stand(K, T) {
      const blk = K.M('#2b2f3e', { metalness: 0.4, roughness: 0.4 }), foam = K.M('#5a5f6b');
      K.rod([-0.14, 0.0, 0.12], [0, 0.12, 0.0], 0.01, blk); K.rod([0.14, 0.0, 0.12], [0, 0.12, 0.0], 0.01, blk); K.rod([0, 0.0, -0.18], [0, 0.12, 0.0], 0.01, blk);
      K.rod([0, 0.12, 0.0], [0, 0.78, -0.13], 0.011, blk);
      [-0.1, 0.1].forEach(x => { K.rod([0, 0.16, 0.05], [x, 0.17, 0.09], 0.01, blk); K.cyl(0.02, 0.02, 0.07, foam, x, 0.18, 0.1, null, 8).rotation.x = Math.PI / 2; });
      K.rod([-0.03, 0.78, -0.13], [0.03, 0.78, -0.13], 0.012, foam);
      // 기타 (앞이 +z)
      const gt = K.grp(0, 0.18, 0.06); gt.rotation.x = -0.18;
      const s = new T.Shape();
      s.moveTo(0, -0.21); s.bezierCurveTo(0.21, -0.21, 0.2, 0.03, 0.095, 0.055); s.bezierCurveTo(0.165, 0.09, 0.15, 0.23, 0, 0.23); s.bezierCurveTo(-0.15, 0.23, -0.165, 0.09, -0.095, 0.055); s.bezierCurveTo(-0.2, 0.03, -0.21, -0.21, 0, -0.21);
      const geo = new T.ExtrudeGeometry(s, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 2, curveSegments: 14 });
      geo.translate(0, 0, -0.035);
      const topTx = K.tex('guitartop', 256, 256, (c, w) => {
        const gr = c.createRadialGradient(w / 2, w * 0.62, 10, w / 2, w * 0.55, w * 0.55); gr.addColorStop(0, '#ffd27a'); gr.addColorStop(0.55, '#e08a3a'); gr.addColorStop(0.85, '#7a2e14'); gr.addColorStop(1, '#2a120a'); c.fillStyle = gr; c.fillRect(0, 0, w, w);
        c.fillStyle = '#1a0d08'; c.beginPath(); c.arc(w / 2, w * 0.33, 24, 0, 7); c.fill();
        c.strokeStyle = '#f5e6c0'; c.lineWidth = 4; c.beginPath(); c.arc(w / 2, w * 0.33, 31, 0, 7); c.stroke();
        c.fillStyle = '#2a120a'; c.fillRect(w / 2 - 34, w * 0.78, 68, 12);
      });
      // 앞판 UV = 모양 좌표(m) → 캔버스 0~1 로 맞춘다
      topTx.wrapS = topTx.wrapT = T.ClampToEdgeWrapping; topTx.repeat.set(1 / 0.46, 1 / 0.46); topTx.offset.set(0.5, 0.22 / 0.46);
      const body = K.add(geo, [new T.MeshStandardMaterial({ map: topTx, roughness: 0.35 }), K.M('#5a2a12', { roughness: 0.4 })], 0, 0.21, 0, gt);
      K.box(0.05, 0.42, 0.025, K.M('#3a2414'), 0, 0.62, 0.02, gt);
      for (let i = 1; i < 10; i++) K.box(0.05, 0.004, 0.027, K.M('#d8dde5', { metalness: 0.8 }), 0, 0.43 + i * 0.038, 0.021, gt);
      const hs = K.box(0.07, 0.14, 0.02, K.M('#2a120a'), 0, 0.89, 0.01, gt); hs.rotation.x = -0.2;
      [-1, 1].forEach(sx => [0, 1, 2].forEach(k => K.cyl(0.006, 0.006, 0.03, K.M('#d8dde5', { metalness: 0.8 }), sx * 0.045, 0.85 + k * 0.035, 0.0, gt, 6).rotation.z = Math.PI / 2));
      for (let i = 0; i < 6; i++) K.box(0.0015, 0.66, 0.0015, K.M('#f2efe6', { metalness: 0.6 }), -0.0125 + i * 0.005, 0.5, 0.05, gt);
      return null;
    },
    trophy(K) {
      const wood = K.M('#6b4a2b'), W = 0.46, H = 1.4, D = 0.36, z0 = -0.05;
      K.box(W, 0.1, D, wood, 0, 0.05, z0); K.box(W + 0.02, 0.05, D + 0.02, wood, 0, H - 0.025, z0);
      [-1, 1].forEach(s => K.box(0.03, H, D, wood, s * (W / 2 - 0.015), H / 2, z0));
      K.box(W - 0.04, H - 0.1, 0.01, K.M('#7a1f2b', { roughness: 0.9 }), 0, H / 2, z0 - D / 2 + 0.01);
      const levels = [0.1, 0.5, 0.92];
      levels.slice(1).forEach(y => K.box(W - 0.04, 0.02, D - 0.02, wood, 0, y, z0));
      K.box(W - 0.05, H - 0.14, 0.004, K.glass('#fff6dc', 0.14), 0, H / 2 + 0.01, z0 + D / 2 - 0.005);
      K.box(W - 0.08, 0.012, 0.012, K.E('#fff2c0', 1.4), 0, H - 0.07, z0 + D / 2 - 0.04);
      // 맨 아래: 메달들
      [[-0.12, '#f2c14e'], [0, '#d8dde5'], [0.12, '#d08a4a']].forEach(([x, c]) => {
        K.box(0.03, 0.12, 0.004, K.F(['#e5484d', '#2f6fed', '#3aa676'][Math.round(x * 8 + 1)]), x, levels[0] + 0.14, z0 - D / 2 + 0.02);
        K.cyl(0.03, 0.03, 0.008, K.M(c, { metalness: 0.85, roughness: 0.25 }), x, levels[0] + 0.07, z0 - D / 2 + 0.026, null, 16).rotation.x = Math.PI / 2;
      });
      cup(K, '#d8dde5', -0.12, levels[0] + 0.01, z0 + 0.06, null, 0.9);
      cup(K, '#d08a4a', 0.12, levels[0] + 0.01, z0 + 0.06, null, 0.8);
      // 가운데: 실버 버튼 + 컵
      plaque(K, '#e9edf2', -0.06, levels[1] + 0.01, z0 + 0.02, null, 1.2);
      cup(K, '#f2c14e', 0.14, levels[1] + 0.01, z0 + 0.03, null, 1.1);
      // 맨 위: 골드 버튼
      plaque(K, '#f2c14e', 0, levels[2] + 0.01, z0 + 0.02, null, 1.6);
      // 지붕 위: 큰 트로피
      cup(K, '#f2c14e', 0, H, z0, null, 1.6);
    },

    // ── 재미 ──
    aquarium(K, T) {
      const stand = K.M('#2b2f3e', { roughness: 0.5 });
      K.rbox(0.96, 0.5, 0.42, 0.02, stand, 0, 0.25, 0);
      [-0.24, 0.24].forEach(x => { K.box(0.44, 0.4, 0.008, K.M('#363a47'), x, 0.25, 0.212); K.box(0.008, 0.08, 0.012, K.M('#c9ced8', { metalness: 0.7 }), x + (x < 0 ? 0.19 : -0.19), 0.3, 0.218); });
      const y0 = 0.5, TW = 0.94, TH = 0.44, TD = 0.4;
      K.box(TW, 0.02, TD, K.M('#1d1f25'), 0, y0 + 0.01, 0);
      // 바닥 모래 (울퉁불퉁)
      const sand = new T.PlaneGeometry(TW - 0.02, TD - 0.02, 12, 6); sand.rotateX(-Math.PI / 2);
      const sp = sand.attributes.position; for (let i = 0; i < sp.count; i++) sp.setY(i, Math.sin(sp.getX(i) * 9) * 0.008 + Math.cos(sp.getZ(i) * 13) * 0.006 + (sp.getZ(i) < 0 ? 0.015 : 0));
      sand.computeVertexNormals();
      K.add(sand, K.F('#f0d9a0'), 0, y0 + 0.04, 0);
      K.box(TW - 0.02, 0.03, TD - 0.02, K.F('#e8cf90'), 0, y0 + 0.025, 0);
      [[-0.3, -0.08, 0.06], [0.28, -0.1, 0.05], [-0.12, -0.12, 0.04], [0.35, 0.05, 0.03]].forEach(([x, z, r]) => { const rk = K.ico(r, K.F('#8a8f99'), x, y0 + 0.05, z, null, 0); rk.scale.y = 0.7; });
      // 보물상자
      K.box(0.07, 0.04, 0.05, K.F('#8a5a32'), 0.12, y0 + 0.065, -0.05); const lid = K.box(0.07, 0.012, 0.05, K.F('#a8713f'), 0.12, y0 + 0.095, -0.07); lid.rotation.x = -0.6;
      K.sph(0.012, K.E('#ffd84d', 0.8), 0.12, y0 + 0.09, -0.05, null, 6, 4);
      // 수초
      const weeds = [];
      [[-0.38, -0.1, '#3fb46c', 6], [-0.32, -0.12, '#2f9a5a', 8], [0.2, -0.13, '#5cc46a', 7], [0.4, -0.08, '#2f9a5a', 5], [-0.05, -0.14, '#7cd06a', 6]].forEach(([x, z, c, n]) => {
        const w = K.dyn(K.grp(x, y0 + 0.05, z)); weeds.push(w);
        for (let i = 0; i < n; i++) { const l = K.box(0.02, 0.05, 0.006, K.F(c), Math.sin(i) * 0.01, 0.025 + i * 0.045, 0, w); l.rotation.z = (i % 2 ? 0.3 : -0.3); }
      });
      // 물고기
      const fishC = [['#ff7a2e', '#ffffff'], ['#3d8bff', '#ffd84d'], ['#ffd84d', '#ff7a2e'], ['#ff5c8a', '#ffffff'], ['#5ce0d0', '#2b2f3e']];
      const fish = fishC.map(([a, b], i) => {
        const f = K.dyn(K.grp(0, 0, 0));
        const bd = K.sph(0.032, K.F(a), 0, 0, 0, f, 8, 6); bd.scale.set(1.5, 1, 0.55);
        K.box(0.006, 0.04, 0.03, K.F(b), 0.005, 0, 0, f).scale.z = 0.5;
        const tl = K.dyn(K.cone(0.02, 0.03, K.F(a), -0.045, 0, 0, f, 4)); tl.rotation.z = Math.PI / 2;
        [-1, 1].forEach(s => K.sph(0.005, K.M('#111'), 0.022, 0.006, s * 0.012, f, 5, 4));
        return { f, tl, sp: 0.35 + i * 0.09, ph: i * 1.7, y: y0 + 0.12 + (i % 3) * 0.08, z: -0.1 + (i % 4) * 0.06 };
      });
      // 기포
      const bubM = new T.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.6, roughness: 0.1 });
      const bubs = []; for (let i = 0; i < 6; i++) { const b = K.sph(0.008 + (i % 3) * 0.003, bubM, 0.34, 0, -0.12, null, 6, 4); b.castShadow = false; bubs.push(b); }
      K.cyl(0.015, 0.015, 0.02, K.M('#9aa1ad'), 0.34, y0 + 0.06, -0.12, null, 8);
      // 물 + 유리
      const water = new T.MeshStandardMaterial({ color: '#1e9be8', emissive: '#1a6ad0', emissiveIntensity: 0.35, transparent: true, opacity: 0.5, roughness: 0.1, depthWrite: false });
      const wm = K.box(TW - 0.02, TH - 0.06, TD - 0.02, water, 0, y0 + 0.02 + (TH - 0.06) / 2, 0); wm.renderOrder = 1;
      const gl = K.glass('#dff4ff', 0.07); const gm = K.box(TW, TH, TD, gl, 0, y0 + TH / 2, 0); gm.renderOrder = 2;
      const edgeM = K.M('#1d1f25');
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => K.box(0.012, TH, 0.012, edgeM, sx * TW / 2, y0 + TH / 2, sz * TD / 2));
      // 뚜껑 + 조명
      K.box(TW + 0.01, 0.035, TD * 0.4, edgeM, 0, y0 + TH + 0.017, -TD * 0.3);
      [-1, 1].forEach(s => K.box(TW + 0.01, 0.012, 0.012, edgeM, 0, y0 + TH, s * TD / 2));
      [-1, 1].forEach(s => K.box(0.012, 0.012, TD, edgeM, s * TW / 2, y0 + TH, 0));
      const lit = K.box(TW - 0.1, 0.008, 0.05, K.E('#e8f8ff', 1.5), 0, y0 + TH - 0.002, -TD * 0.3); lit.castShadow = false;
      const surf = K.add(new T.PlaneGeometry(TW - 0.02, TD - 0.02), new T.MeshStandardMaterial({ color: '#5cc8ff', transparent: true, opacity: 0.25, roughness: 0.05, depthWrite: false }), 0, y0 + TH - 0.04, 0); surf.rotation.x = -Math.PI / 2;
      return (t, env) => {
        fish.forEach(o => {
          const s = Math.sin(t * o.sp + o.ph), c = Math.cos(t * o.sp + o.ph);
          o.f.position.set(s * 0.36, o.y + Math.sin(t * 1.3 + o.ph) * 0.02, o.z + Math.sin(t * o.sp * 0.7 + o.ph) * 0.05);
          o.f.rotation.y = c >= 0 ? 0 : Math.PI; o.tl.rotation.y = Math.sin(t * 12 + o.ph) * 0.5;
        });
        bubs.forEach((b, i) => { const q = (t * 0.35 + i / bubs.length) % 1; b.position.set(0.34 + Math.sin(t * 3 + i) * 0.008, y0 + 0.07 + q * (TH - 0.12), -0.12); });
        weeds.forEach((w, i) => { w.rotation.z = Math.sin(t * 1.1 + i) * 0.08; });
        water.emissiveIntensity = 0.2 + (env ? env.night : 0) * 0.35;
      };
    },
    cat_tower(K, T) {
      const carpet = K.F('#d8c6a8'), carpetD = K.F('#b9a07a');
      const sisal = K.tex('sisal', 32, 64, (c, w, h) => { for (let y = 0; y < h; y += 4) { c.fillStyle = y % 8 ? '#c9a46a' : '#b48a50'; c.fillRect(0, y, w, 4); } }, { repeat: [1, 3] });
      const sisalM = new T.MeshStandardMaterial({ map: sisal, roughness: 0.95 });
      K.rbox(0.48, 0.05, 0.48, 0.03, carpet, 0, 0.025, 0);
      // 아래 집 (구멍)
      K.rbox(0.26, 0.26, 0.26, 0.03, carpetD, -0.1, 0.18, -0.1);
      const hole = K.add(new T.CircleGeometry(0.07, 16), K.M('#3a2a1a'), -0.1, 0.17, 0.031 + 0); hole.castShadow = false;
      K.cyl(0.045, 0.045, 0.85, sisalM, 0.14, 0.47, 0.12, null, 12);
      K.cyl(0.04, 0.04, 0.75, sisalM, -0.15, 0.68, -0.14, null, 12);
      K.rbox(0.4, 0.04, 0.32, 0.04, carpet, -0.02, 0.33, 0.04);
      K.rbox(0.36, 0.04, 0.3, 0.04, carpet, 0.02, 0.9, 0.04);
      K.cyl(0.04, 0.04, 0.3, sisalM, 0.0, 1.07, 0.04, null, 12);
      // 위쪽 동그란 침대
      const yB = 1.22;
      K.cyl(0.17, 0.15, 0.04, carpetD, 0, yB, 0.03, null, 20);
      K.tor(0.155, 0.035, carpet, 0, yB + 0.03, 0.03, null, 8, 22).rotation.x = Math.PI / 2;
      // 매달린 공
      K.rod([-0.16, 0.89, 0.18], [-0.16, 0.64, 0.18], 0.002, K.M('#f2efe6'));
      const ball = K.dyn(K.sph(0.03, K.F('#ff5c8a'), -0.16, 0.62, 0.18, null, 8, 6));
      // 고양이 (치즈냥이)
      const orange = K.F('#f5a04a'), white = K.F('#fff6ea'), cat = K.dyn(K.grp(0, yB + 0.03, 0.04));
      const body = K.dyn(K.sph(0.1, orange, 0, 0.06, -0.01, cat, 12, 8)); body.scale.set(1, 0.75, 1.15);
      const chest = K.sph(0.06, white, 0, 0.06, 0.07, cat, 10, 8); chest.scale.set(1, 1, 0.6);
      [-0.05, 0.05].forEach(x => K.sph(0.025, white, x, 0.015, 0.1, cat, 8, 6).scale.set(1, 0.7, 1.2));
      const head = K.dyn(K.grp(0, 0.15, 0.08, cat));
      const hd = K.sph(0.072, orange, 0, 0, 0, head, 12, 10); hd.scale.set(1.08, 0.92, 0.95);
      const muz = K.sph(0.035, white, 0, -0.022, 0.055, head, 8, 6); muz.scale.set(1.3, 0.8, 0.7);
      K.sph(0.009, K.M('#ff8fa3'), 0, -0.008, 0.075, head, 6, 4);
      const ears = [-1, 1].map(s => { const e = K.dyn(K.cone(0.03, 0.05, orange, s * 0.042, 0.065, 0, head, 4)); e.rotation.z = -s * 0.25; K.cone(0.016, 0.03, K.F('#ffb3c0'), s * 0.042, 0.06, 0.008, head, 4).rotation.z = -s * 0.25; return e; });
      const eyes = [-1, 1].map(s => { const e = K.dyn(K.sph(0.01, K.M('#20232b'), s * 0.028, 0.008, 0.062, head, 6, 4)); e.scale.y = 1.3; return e; });
      for (let i = 0; i < 3; i++) { K.box(0.03, 0.008, 0.004, K.F('#d87a2a'), 0, 0.045 - i * 0.012, 0.025 + i * 0.006, head).rotation.x = -0.6; }
      [-1, 1].forEach(s => [0, 1].forEach(k => K.box(0.04, 0.002, 0.002, K.M('#ffffff'), s * 0.055, -0.02 - k * 0.01, 0.06, head).rotation.z = s * (k ? -0.15 : 0.15)));
      [0, 1, 2].forEach(i => { const st = K.sph(0.035, K.F('#d87a2a'), 0, 0.13 - i * 0.005, -0.02 - i * 0.045, cat, 8, 4); st.scale.set(1.6, 0.25, 0.45); });
      const tail = K.grp(0, 0.05, -0.11, cat);
      const segs = []; let prev = tail;
      for (let i = 0; i < 5; i++) { const sg = K.dyn(K.grp(0, 0, i ? -0.035 : 0, prev)); K.sph(0.022 - i * 0.002, i === 4 ? white : orange, 0, 0, -0.018, sg, 8, 6).scale.z = 1.4; segs.push(sg); prev = sg; }
      return (t) => {
        segs.forEach((s, i) => { s.rotation.y = Math.sin(t * 2.2 - i * 0.6) * 0.35; s.rotation.x = -0.2; });
        head.rotation.y = Math.sin(t * 0.4) * 0.35 + (Math.sin(t * 0.13) > 0.9 ? 0.4 : 0);
        const blink = (t % 4.3) < 0.12 ? 0.15 : 1.3; eyes.forEach(e => { e.scale.y = blink; });
        ears[1].rotation.x = (t % 5.1) < 0.15 ? -0.4 : 0;
        body.scale.y = 0.75 + Math.sin(t * 2) * 0.012;
        ball.position.x = -0.16 + Math.sin(t * 1.6) * 0.03;
      };
    },
    arcade(K, T) {
      const side = new T.Shape();
      side.moveTo(-0.22, 0); side.lineTo(0.2, 0); side.lineTo(0.2, 0.78); side.lineTo(0.25, 0.84); side.lineTo(0.24, 0.9); side.lineTo(0.1, 0.94); side.lineTo(0.05, 1.36); side.lineTo(0.13, 1.42); side.lineTo(0.13, 1.6); side.lineTo(-0.22, 1.6); side.lineTo(-0.22, 0);
      const sg = new T.ExtrudeGeometry(side, { depth: 0.03, bevelEnabled: false }); sg.rotateY(-Math.PI / 2);
      const artTx = K.tex('arcadeside', 128, 256, (c, w, h) => { const gr = c.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#5a2aff'); gr.addColorStop(1, '#ff3d8b'); c.fillStyle = gr; c.fillRect(0, 0, w, h); c.fillStyle = 'rgba(255,255,255,.25)'; for (let i = 0; i < 6; i++) { c.beginPath(); c.moveTo(0, 40 + i * 40); c.lineTo(w, 10 + i * 40); c.lineTo(w, 22 + i * 40); c.lineTo(0, 52 + i * 40); c.fill(); } });
      artTx.wrapS = artTx.wrapT = T.RepeatWrapping; artTx.repeat.set(2.2, 0.62);
      const sideM = new T.MeshStandardMaterial({ map: artTx, roughness: 0.5 });
      [0.24, -0.21].forEach(x => K.add(sg, sideM, x, 0, 0));
      const blk = K.M('#1b1d24', { roughness: 0.5 });
      K.box(0.42, 0.78, 0.4, blk, 0, 0.39, -0.01);
      K.box(0.42, 0.06, 0.02, K.M('#ff3d8b'), 0, 0.76, 0.2);
      // 동전 투입구
      K.box(0.12, 0.16, 0.01, K.M('#2b2f3e'), 0, 0.42, 0.195); [-0.03, 0.03].forEach(x => K.box(0.02, 0.05, 0.006, K.E('#ff5c3d', 1.2), x, 0.45, 0.2));
      // 조작판
      const cp = K.grp(0, 0.88, 0.17); cp.rotation.x = 0.28;
      K.box(0.42, 0.04, 0.17, K.M('#2b2f3e'), 0, 0, 0, cp);
      K.box(0.4, 0.002, 0.15, K.F('#ffd84d'), 0, 0.021, 0, cp);
      K.cyl(0.006, 0.006, 0.06, K.M('#111'), -0.1, 0.05, 0.0, cp, 6); K.sph(0.022, K.M('#e5484d', { roughness: 0.3 }), -0.1, 0.085, 0, cp, 10, 8);
      [['#2f6fed', 0.04, -0.02], ['#3aa676', 0.09, -0.03], ['#e5484d', 0.14, -0.02], ['#2f6fed', 0.05, 0.03], ['#3aa676', 0.1, 0.02], ['#e5484d', 0.15, 0.03]].forEach(([c, x, z]) => K.cyl(0.014, 0.014, 0.016, K.M(c, { roughness: 0.3 }), x, 0.026, z, cp, 10));
      // 화면
      const mk = (fr) => (c, w, h) => {
        c.fillStyle = '#05060f'; c.fillRect(0, 0, w, h);
        const inv = ['..x..x..', '...xx...', '..xxxx..', '.xx..xx.', 'xxxxxxxx', 'x.xxxx.x', 'x.x..x.x', '...xx...'];
        const cols = ['#ff5c8a', '#5ce0d0', '#ffd84d'];
        for (let r = 0; r < 3; r++) for (let k = 0; k < 4; k++) { c.fillStyle = cols[r]; inv.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === 'x' && !(fr && j === 7)) c.fillRect(8 + k * 14 + i + (fr ? 2 : 0), 12 + r * 11 + j, 1, 1); })); }
        c.fillStyle = '#7cff6b'; c.fillRect(28 + (fr ? 6 : 0), 70, 7, 3); c.fillRect(30 + (fr ? 6 : 0), 68, 3, 2);
        c.fillStyle = '#ffffff'; c.fillRect(31 + (fr ? 6 : 0), 50 - (fr ? 6 : 0), 1, 4);
        c.fillStyle = '#7cff6b'; [6, 30, 54].forEach(x => c.fillRect(x, 62, 8, 3));
        c.fillStyle = '#ffffff'; c.font = '6px monospace'; c.fillText('SCORE ' + (fr ? '01250' : '01200'), 2, 7);
      };
      const tA = K.tex('arcadeA', 72, 80, mk(0), { nearest: true }), tB = K.tex('arcadeB', 72, 80, mk(1), { nearest: true });
      const scrM = new T.MeshStandardMaterial({ map: tA, emissive: '#ffffff', emissiveMap: tA, emissiveIntensity: 1.1, roughness: 0.3 });
      K.box(0.42, 0.46, 0.02, blk, 0, 1.15, 0.065).rotation.x = -0.12;
      const scr = K.add(new T.PlaneGeometry(0.34, 0.36), scrM, 0, 1.15, 0.078); scr.rotation.x = -0.12; scr.castShadow = false;
      const halo = K.add(new T.PlaneGeometry(0.42, 0.44), K.halo('#7a9cff', 0.12), 0, 1.15, 0.082); halo.rotation.x = -0.12;
      // 마키 (간판)
      const mq = K.tex('arcademq', 256, 64, (c, w, h) => { const gr = c.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#ff3d8b'); gr.addColorStop(0.5, '#ffd84d'); gr.addColorStop(1, '#5ce0d0'); c.fillStyle = gr; c.fillRect(0, 0, w, h); c.fillStyle = '#1b1d24'; c.font = '900 40px Arial Black, Impact, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('ARCADE', w / 2, h / 2 + 2); });
      K.box(0.42, 0.18, 0.06, blk, 0, 1.51, 0.08);
      const mqM = new T.MeshStandardMaterial({ map: mq, emissive: '#ffffff', emissiveMap: mq, emissiveIntensity: 0.9 });
      K.add(new T.PlaneGeometry(0.4, 0.15), mqM, 0, 1.51, 0.111);
      K.box(0.42, 0.02, 0.38, blk, 0, 1.6, -0.03);
      return (t, env) => { const f = Math.floor(t * 2) % 2; const tx = f ? tB : tA; if (scrM.map !== tx) { scrM.map = tx; scrM.emissiveMap = tx; } scrM.emissiveIntensity = 1 + Math.sin(t * 30) * 0.05; mqM.emissiveIntensity = 0.7 + (env ? env.night : 0) * 0.6; };
    },
    treadmill(K, T) {
      const gray = K.M('#3a3d46', { roughness: 0.5 }), blk = K.M('#1b1d24'), accent = K.M('#2fd0a0');
      K.rbox(0.46, 0.09, 0.92, 0.03, gray, 0, 0.07, 0.03);
      [[-0.2, 0.43], [0.2, 0.43], [-0.2, -0.38], [0.2, -0.38]].forEach(([x, z]) => K.box(0.05, 0.03, 0.05, blk, x, 0.015, z));
      const beltTx = K.tex('belt', 32, 64, (c, w, h) => { c.fillStyle = '#1b1d24'; c.fillRect(0, 0, w, h); c.fillStyle = '#2b2f3a'; for (let y = 0; y < h; y += 8) c.fillRect(0, y, w, 3); }, { repeat: [1, 6] });
      const beltM = new T.MeshStandardMaterial({ map: beltTx, roughness: 0.9 });
      const belt = K.add(new T.PlaneGeometry(0.34, 0.8), beltM, 0, 0.118, 0.07); belt.rotation.x = -Math.PI / 2;
      [-0.2, 0.2].forEach(x => { K.box(0.05, 0.02, 0.84, K.M('#c9ced8', { metalness: 0.5, roughness: 0.4 }), x, 0.125, 0.06); K.box(0.052, 0.01, 0.84, accent, x, 0.1, 0.06); });
      K.rbox(0.46, 0.16, 0.18, 0.04, gray, 0, 0.12, -0.38);
      K.box(0.3, 0.02, 0.005, accent, 0, 0.14, -0.288);
      [-0.2, 0.2].forEach(x => K.rod([x, 0.15, -0.36], [x * 0.95, 1.12, -0.44], 0.022, gray, null, 8));
      const con = K.grp(0, 1.16, -0.43); con.rotation.x = -0.5;
      K.rbox(0.46, 0.2, 0.06, 0.03, gray, 0, 0, 0, con);
      const scrTx = K.tex('treadscr', 128, 48, (c, w, h) => { c.fillStyle = '#0b2a22'; c.fillRect(0, 0, w, h); c.fillStyle = '#5cffc0'; c.font = 'bold 22px monospace'; c.fillText('8.5', 8, 30); c.font = '10px monospace'; c.fillText('km/h', 50, 30); c.fillText('♥128', 86, 18); c.fillText('12:30', 86, 38); });
      const sm = new T.MeshStandardMaterial({ map: scrTx, emissive: '#ffffff', emissiveMap: scrTx, emissiveIntensity: 0.9 });
      K.add(new T.PlaneGeometry(0.26, 0.1), sm, 0, 0.02, 0.031, con);
      [-0.16, 0.16].forEach(x => K.cyl(0.018, 0.018, 0.01, K.M(x < 0 ? '#e5484d' : '#2fd0a0'), x, -0.05, 0.03, con, 10).rotation.x = Math.PI / 2);
      [-0.23, 0.23].forEach(x => { K.rod([x, 1.0, -0.42], [x, 1.0, -0.15], 0.016, blk, null, 8); K.rod([x, 1.0, -0.15], [x * 0.9, 0.94, -0.12], 0.016, blk, null, 8); });
      K.rod([-0.23, 1.0, -0.15], [-0.23, 1.0, -0.42], 0.022, K.M('#5a5f6b'), null, 8);
      K.cyl(0.03, 0.03, 0.14, K.M('#5cc8ff', { transparent: true, opacity: 0.75 }), 0.2, 1.07, -0.48, null, 10);
      K.cyl(0.018, 0.022, 0.03, K.M('#2f6fed'), 0.2, 1.155, -0.48, null, 10);
      // 수건
      const tw = K.box(0.06, 0.24, 0.012, K.F('#ffd0e0'), -0.24, 0.9, -0.2); tw.rotation.y = Math.PI / 2;
      return (t) => { beltTx.offset.y = (t * 0.8) % 1; };
    },
    disco_ball(K, T) {
      const blk = K.M('#2b2f3e', { metalness: 0.5, roughness: 0.35 });
      [0, 2.1, 4.2].forEach(a => K.rod([Math.sin(a) * 0.2, 0, Math.cos(a) * 0.2], [0, 0.35, 0], 0.012, blk));
      K.rod([0, 0.35, 0], [0, 1.7, 0], 0.014, blk);
      K.rod([0, 1.7, 0], [0, 1.7, 0.12], 0.012, blk);
      K.box(0.05, 0.05, 0.05, blk, 0, 1.69, 0.12);
      K.rod([0, 1.66, 0.12], [0, 1.52, 0.12], 0.003, K.M('#c9ced8'));
      const geo = new T.IcosahedronGeometry(0.15, 2), pa = geo.attributes.position, col = new Float32Array(pa.count * 3);
      const pal = [[0.95, 0.95, 1], [0.75, 0.78, 0.85], [0.55, 0.58, 0.65], [1, 0.75, 0.9], [0.7, 0.95, 1], [1, 0.95, 0.7]];
      for (let i = 0; i < pa.count; i += 3) { const c = K.rng() < 0.75 ? pal[Math.floor(K.rng() * 3)] : pal[3 + Math.floor(K.rng() * 3)]; for (let k = 0; k < 3; k++) col.set(c, (i + k) * 3); }
      geo.setAttribute('color', new T.BufferAttribute(col, 3));
      const ballM = new T.MeshStandardMaterial({ vertexColors: true, metalness: 0.35, roughness: 0.15, flatShading: true, emissive: '#555566', emissiveIntensity: 0.6 });
      const ball = K.dyn(K.add(geo, ballM, 0, 1.37, 0.12));
      // 바닥에 비친 빛 점
      const spots = K.dyn(K.grp(0, 0.008, 0.06));
      const sc = ['#ff6bd0', '#6be7ff', '#fff36b', '#9bff6b', '#ffffff'];
      const spotM = sc.map(c => K.halo(c, 0.45));
      for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2 + K.rng(), r = 0.18 + K.rng() * 0.3; const s = K.add(new T.CircleGeometry(0.025 + K.rng() * 0.02, 10), spotM[i % sc.length], Math.sin(a) * r, 0, Math.cos(a) * r, spots); s.rotation.x = -Math.PI / 2; }
      return (t, env) => { ball.rotation.y = t * 0.8; spots.rotation.y = t * 0.8; const n = env ? env.night : 0; spotM.forEach((m, i) => { m.opacity = (0.2 + n * 0.5) * (0.7 + 0.3 * Math.sin(t * 3 + i)); }); ballM.emissiveIntensity = 0.45 + 0.25 * Math.sin(t * 5); };
    },
    rug_round(K, T) {
      const tx = K.tex('ruground', 256, 256, (c, w) => {
        const rings = ['#e8796b', '#f6e7d2', '#7ec8c8', '#f6e7d2', '#f5b83d', '#f6e7d2', '#e8796b'];
        rings.forEach((col, i) => { c.fillStyle = col; c.beginPath(); c.arc(w / 2, w / 2, w / 2 - i * 17, 0, 7); c.fill(); });
        c.fillStyle = '#f6e7d2'; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; c.beginPath(); c.arc(w / 2 + Math.cos(a) * 58, w / 2 + Math.sin(a) * 58, 6, 0, 7); c.fill(); }
        const r = seeded(3); for (let i = 0; i < 2500; i++) { c.fillStyle = `rgba(${r() > 0.5 ? 255 : 0},${r() > 0.5 ? 255 : 0},${r() > 0.5 ? 255 : 0},0.05)`; c.fillRect(r() * w, r() * w, 2, 2); }
      });
      const top = new T.MeshStandardMaterial({ map: tx, roughness: 1 }), side = K.M('#d4655a', { roughness: 1 });
      const rug = K.cyl(0.47, 0.47, 0.014, [side, top, side], 0, 0.007, 0, null, 40); rug.castShadow = false;
      for (let i = 0; i < 28; i++) { const a = i / 28 * Math.PI * 2, p = K.sph(0.016, K.F(i % 2 ? '#f5b83d' : '#f6e7d2'), Math.sin(a) * 0.48, 0.012, Math.cos(a) * 0.48, null, 6, 4); p.castShadow = false; }
    },
  };

  root.DECOR3D = { build, has: id => !!MODELS[id], ids: () => Object.keys(MODELS) };
})(typeof window !== 'undefined' ? window : this);
