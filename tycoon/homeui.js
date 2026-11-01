/* 방 꾸미기 화면 + 미니홈·광장 화면 + 배경음악 연결.
 * index.html의 전역(S, E, tab, render, won, fmt, esc, itemName)을 쓴다.
 * 3D 배치는 Scene.setPlacement / placementPointer / placementConfirm / pickDecorAt (scene3d.js),
 * 음악은 Music (music.js), 공유는 Community (community.js).
 */
(function (root) {
  'use strict';
  const H = {
    placing: null,          // { id, rot, moveIdx, from }
    editing: false, selected: -1,
    decorCat: 'furniture',
    homeView: 'mine',       // mine | plaza | visit | post
    visit: null,            // { home, posts:[], guest:[], visits }
    post: null,             // { uid, id, data, comments }
    plaza: null, plazaQ: '', plazaLoading: false,
    composing: null,        // 작곡 중 설정
    bgmOn: localStorage.getItem('ytTycoon.bgm') !== '0',
    lastPub: 0, pubSig: '',
  };
  const MU = () => root.Music && root.Music.play ? root.Music : null;

  // ───────── 음악 ─────────
  function moodList() {
    const M = MU(); if (!M) return [];
    if (M.moods) return M.moods().map(x => ({ id: x.id, name: x.name }));
    if (!M.MOODS) return [];
    const m = M.MOODS;
    return Array.isArray(m) ? m.map(x => ({ id: x.id || x.key, name: x.name || x.label || x.id })) : Object.keys(m).map(k => ({ id: k, name: (m[k] && (m[k].name || m[k].label)) || k }));
  }
  const REGION_MOOD = { city: 'lofi', country: 'countryside', seaside: 'ocean', mountain: 'forest' };
  function defaultBgm() {
    const M = MU(); if (!M) return null;
    const ids = moodList().map(m => m.id);
    const want = REGION_MOOD[S.region];
    const mood = ids.includes(want) ? want : ids[0];
    return M.randomConfig ? M.randomConfig(mood, 7) : { mood, seed: 7 };
  }
  H.currentBgm = function () { return (S && S.home && S.home.bgm) || defaultBgm(); };
  H.playBgm = function (cfg) {
    const M = MU(); if (!M) return;
    try { if (M.unlock) M.unlock(); if (!H.bgmOn) { M.stop(); return; } M.play(cfg || H.currentBgm()); } catch (e) {}
  };
  H.stopBgm = function () { const M = MU(); if (M) try { M.stop(); } catch (e) {} };
  H.firstGesture = function () { if (H._unlocked || !S) return; H._unlocked = true; H.playBgm(); };

  // ───────── 꾸미기 ─────────
  H.renderDecor = function () {
    const cats = E.DECOR_CATS;
    const placed = E.placedHere(S), th = S.decor.theme[S.house] || {};
    let h = `<div class="card"><div class="row between"><h3>🛋️ 방 꾸미기</h3><span class="tag good">아늑함 ${E.cozy(S)}</span></div>
      <div class="mute small">아늑함이 높으면 휴식 회복 +${E.cozyBonus(S).regen.toFixed(1)}, 영상 품질 +${E.cozyBonus(S).q.toFixed(1)} (상한 있음). 놓은 가구는 이 집에 남고, 이사하면 새 집에 다시 놓을 수 있습니다.</div>
      <div class="row" style="margin:8px 0;gap:6px"><button class="${H.editing ? 'primary' : ''}" data-a="dedit">${H.editing ? '✅ 꾸미기 끝' : '🖐 옮기기·치우기'}</button><span class="mute small">놓인 것 ${placed.length}개</span></div>
      <div class="catrow">${Object.keys(cats).map(k => `<button class="seg2 ${H.decorCat === k ? 'on' : ''}" data-a="dcat" data-k="${k}">${cats[k]}</button>`).join('')}</div>`;
    for (const id in E.DECOR_ITEMS) {
      const D = E.DECOR_ITEMS[id]; if (D.cat !== H.decorCat) continue;
      const own = S.decor.owned[id] || 0, left = E.unplacedCount(S, id), locked = S.subs < (D.unlock || 0);
      const applied = D.place === 'theme' && th[D.slot] === id;
      let btns = '';
      if (D.place === 'theme') btns = own ? `<button data-a="dtheme" data-k="${id}" ${applied ? 'disabled' : ''}>${applied ? '적용 중' : '적용'}</button>` : '';
      else if (left > 0) btns = `<button data-a="dplace" data-k="${id}">놓기 (${left})</button>`;
      btns += `<button class="ok" data-a="dbuy" data-k="${id}" ${locked || S.money < D.price ? 'disabled' : ''}>${won(D.price)}</button>`;
      h += `<div class="item"><div><div class="name">${D.name}${own ? ` <span class="mute small">보유 ${own}</span>` : ''}</div>
        <div class="mute small">${D.place === 'wall' ? '벽에 걸기' : D.place === 'theme' ? (D.slot === 'wall' ? '벽 전체' : '바닥 전체') : `바닥 ${D.w}×${D.d}칸`} · 아늑함 +${D.cozy}${locked ? ` · <span style="color:var(--yellow)">구독자 ${fmt(D.unlock)}명부터</span>` : ''}</div></div>
        <div class="row" style="gap:4px;flex-shrink:0">${btns}</div></div>`;
    }
    if (th.wall || th.floor) h += `<div class="row" style="gap:6px;margin-top:8px">${th.wall ? '<button data-a="dclear" data-k="wall">벽지 원래대로</button>' : ''}${th.floor ? '<button data-a="dclear" data-k="floor">바닥 원래대로</button>' : ''}</div>`;
    return h + `</div>`;
  };
  function placeBar() {
    let bar = document.getElementById('placebar');
    if (!H.placing && !(H.editing && H.selected >= 0)) { if (bar) bar.remove(); return; }
    if (!bar) { bar = document.createElement('div'); bar.id = 'placebar'; document.body.appendChild(bar); }
    if (H.placing) {
      const D = E.DECOR_ITEMS[H.placing.id];
      bar.innerHTML = `<div class="pb-t">📍 ${D.name} — 방에서 놓을 곳을 탭하세요</div><div class="row" style="gap:6px">${D.place === 'floor' ? '<button data-a="drot">↻ 회전</button>' : ''}<button data-a="dcancel">취소</button></div>`;
    } else {
      const p = E.placedHere(S)[H.selected]; if (!p) { H.selected = -1; return placeBar(); }
      bar.innerHTML = `<div class="pb-t">🖐 ${E.DECOR_ITEMS[p.id].name}</div><div class="row" style="gap:6px"><button data-a="dmove">옮기기</button>${E.DECOR_ITEMS[p.id].place === 'floor' ? '<button data-a="drotsel">↻</button>' : ''}<button data-a="dremove">치우기</button><button data-a="dunsel">닫기</button></div>`;
    }
  }
  function startPlacing(id, moveIdx, from) {
    H.placing = { id, rot: from && from.rot || 0, moveIdx, from };
    tab = null;
    H.placing.onPick = pos => {
      let ok;
      if (H.placing.moveIdx != null) { E.placedHere(S).splice(H.placing.moveIdx, 0, Object.assign({ id }, pos)); ok = true; if (!E.canPlace(S, id, pos, H.placing.moveIdx)) { E.placedHere(S).splice(H.placing.moveIdx, 1); ok = false; } }
      else ok = E.placeDecor(S, id, pos);
      if (ok) { H.placing = null; Scene.setPlacement(null); H.selected = -1; save(); }
      placeBar(); render();
    };
    if (Scene.setPlacement) Scene.setPlacement({ id, rot: H.placing.rot, onPick: H.placing.onPick });
    placeBar();
  }
  function cancelPlacing() {
    if (!H.placing) return;
    if (H.placing.moveIdx != null && H.placing.from) E.placedHere(S).splice(H.placing.moveIdx, 0, H.placing.from);
    H.placing = null; if (Scene.setPlacement) Scene.setPlacement(null); placeBar();
  }
  // 방 화면 터치를 꾸미기가 먼저 가져갈지
  H.scenePointer = function (type, e) {
    if (H.placing && Scene.placementPointer) {
      Scene.placementPointer(e.clientX, e.clientY);
      if (type === 'up' && Scene.placementConfirm) Scene.placementConfirm();
      return true;
    }
    if (H.editing && type === 'up' && Scene.pickDecorAt) { H.selected = Scene.pickDecorAt(e.clientX, e.clientY); placeBar(); return true; }
    return H.editing || !!H.placing;
  };

  // ───────── 미니홈 ─────────
  function home() { if (!S.home) S.home = { bgm: null, posts: [] }; return S.home; }
  function shareNote() {
    if (!Community.ready) return '공유 기능 확인 중…';
    if (!Community.shared) return '📴 이 화면에서는 공유가 꺼져 있어 이 기기에만 저장됩니다 (배포 페이지에서 열면 함께 볼 수 있습니다).';
    if (!Community.canWrite) return '👀 보기 전용 권한이라 글을 올릴 수 없습니다.';
    return '🌐 공유 중 — 이 페이지를 볼 수 있는 사람들이 내 미니홈에 들어올 수 있습니다.';
  }
  H.renderMyHome = function () {
    const mineOn = H.homeView === 'mine' || (H.homeView === 'post' && H.post && H.post.back === 'mine');
    const sub = `<div class="catrow" style="margin-bottom:10px"><button class="seg2 ${mineOn ? 'on' : ''}" data-a="hview" data-k="mine">🏡 내 미니홈</button><button class="seg2 ${!mineOn ? 'on' : ''}" data-a="hview" data-k="plaza">🌐 광장</button></div>`;
    if (H.homeView === 'plaza') return sub + renderPlaza();
    if (H.homeView === 'visit') return sub + renderVisit();
    if (H.homeView === 'post') return sub + renderPost();
    const hm = home();
    let h = sub + `<div class="card"><h3>🏡 ${esc(S.channel)}의 미니홈</h3><div class="mute small">${E.GENRES[S.genre].icon} ${E.GENRES[S.genre].name} · ${E.REGIONS[S.region].icon} ${E.HOUSES[S.house].name} · 아늑함 ${E.cozy(S)} · 방문 ${H.myVisits == null ? '–' : H.myVisits}</div>
      <div class="mute small" style="margin-top:6px">${shareNote()}</div></div>`;
    // BGM
    const M = MU(), cfg = H.composing || hm.bgm;
    h += `<div class="card"><div class="row between"><h3>🎵 내 방 BGM</h3><button class="tg ${H.bgmOn ? 'on' : ''}" data-a="bgmtoggle"></button></div>`;
    if (!M) h += `<div class="mute small">음악 엔진을 불러오지 못했습니다.</div>`;
    else {
      h += `<div class="mute small" style="margin-bottom:6px">코드로 직접 만드는 음악이라 저작권 걱정이 없습니다. 분위기를 고르고 🎲로 새 곡을 만들어 보세요.</div>
        <div class="catrow">${moodList().map(m => `<button class="seg2 ${cfg && cfg.mood === m.id ? 'on' : ''}" data-a="bmood" data-k="${m.id}">${esc(m.name)}</button>`).join('')}</div>
        ${cfg ? `<div class="kv" style="margin:8px 0"><div class="k">${esc(cfg.title || '제목 없음')}</div><div class="v small">${esc(M.describe ? M.describe(cfg) : cfg.mood)}</div></div>` : ''}
        <div class="row" style="gap:6px;flex-wrap:wrap"><button data-a="bnew">🎲 새로 만들기</button><button data-a="bplay">▶ 들어보기</button><button data-a="bstop">■ 멈춤</button>${H.composing ? '<button class="ok" data-a="bsave">내 방 BGM으로 저장</button>' : ''}</div>`;
      if (H.composing) h += `<input type="text" id="btitle" maxlength="30" placeholder="곡 제목" value="${esc(H.composing.title || '')}" style="margin-top:8px">`;
    }
    h += `</div>`;
    // 글
    h += `<div class="card"><div class="row between"><h3>📝 내 글</h3><button class="ok" data-a="pnew">글쓰기</button></div>`;
    if (!hm.posts.length) h += `<div class="mute small">아직 글이 없습니다. 오늘 있었던 일, 방 자랑, 영상 뒷이야기를 올려 보세요.</div>`;
    for (const p of hm.posts) h += `<div class="vid" data-a="popen" data-k="${p.id}" data-u="me"><div class="row" style="gap:10px">${p.photo ? `<img src="${p.photo}" style="width:54px;height:54px;object-fit:cover;border-radius:8px">` : ''}<div style="flex:1"><b>${esc(p.title)}</b><div class="mute small">${new Date(p.ts).toLocaleDateString('ko-KR')}${p.bgm ? ' · 🎵' : ''}</div></div><button data-a="pdel" data-k="${p.id}">삭제</button></div></div>`;
    h += `</div>`;
    if (Community.shared) {
      h += `<div class="card"><h3>📖 방명록</h3>${(H.myGuest || []).map(g => `<div class="log"><b>${esc(g.channel || '손님')}</b> <span class="mute small">${new Date(g.ts).toLocaleDateString('ko-KR')}</span><br>${esc(g.text)}</div>`).join('') || '<div class="mute small">아직 방명록이 없습니다.</div>'}</div>`;
    }
    return h;
  };
  function renderPlaza() {
    if (!Community.shared) return `<div class="card"><h3>🌐 광장</h3><div class="mute small">${shareNote()}</div></div>`;
    let h = `<div class="card"><input type="text" id="psearch" placeholder="채널·제목·글 검색" value="${esc(H.plazaQ)}"><div class="row" style="gap:6px;margin-top:6px"><button data-a="psearch">🔍 검색</button><button data-a="prefresh">새로고침</button></div></div>`;
    if (!H.plaza) { loadPlaza(); return h + `<div class="mute small">불러오는 중…</div>`; }
    const q = H.plazaQ.trim().toLowerCase();
    const homes = H.plaza.filter(x => !q || [x.channel, ...(x.posts || []).map(p => p.title)].join(' ').toLowerCase().includes(q));
    if (!homes.length) h += `<div class="mute small">아직 아무도 없거나 검색 결과가 없습니다.</div>`;
    for (const x of homes) {
      const Rg = E.REGIONS[x.region] || {}, G = E.GENRES[x.genre] || {}, Hh = E.HOUSES[x.house] || {};
      const last = (x.posts || [])[0];
      h += `<div class="card" data-a="hvisit" data-k="${x.uid}" style="cursor:pointer"><div class="row between"><b>${G.icon || ''} ${esc(x.channel || '이름 없는 채널')}${x.uid === Community.uid ? ' <span class="tag good">나</span>' : ''}</b><span class="mute small">${Rg.icon || ''} ${esc(Hh.name || '')}</span></div>
        <div class="mute small">구독자 ${fmt(x.subs || 0)} · 아늑함 ${x.cozy || 0} · 글 ${(x.posts || []).length}${x.bgm ? ' · 🎵 BGM' : ''}</div>
        ${last ? `<div class="row" style="gap:8px;margin-top:6px">${last.thumb ? `<img src="${last.thumb}" style="width:44px;height:44px;object-fit:cover;border-radius:6px">` : ''}<div class="small">📝 ${esc(last.title)}</div></div>` : ''}</div>`;
    }
    return h;
  }
  async function loadPlaza() {
    if (H.plazaLoading) return; H.plazaLoading = true;
    H.plaza = await Community.listHomes(60); H.plazaLoading = false; render();
  }
  function stateFromHome(x) {
    const st = E.newGame({ region: x.region, house: x.house, genre: x.genre, channel: x.channel || '' });
    st.subs = x.subs || 0; st.gh = S ? S.gh : 34;
    if (x.equip) for (const k in x.equip) st.equip[k] = x.equip[k];
    st.decor = { owned: {}, placed: { [x.house]: x.decorPlaced || [] }, theme: { [x.house]: x.theme || {} } };
    st.staff = []; st._visit = true;
    return st;
  }
  async function openVisit(uid) {
    H.homeView = 'visit'; H.visit = { loading: true }; render();
    const x = uid === Community.uid ? await Community.getHome(uid) : await Community.getHome(uid);
    if (!x) { H.visit = { error: true }; render(); return; }
    H.visit = { home: x, guest: [], visits: null };
    Scene.setPreview(stateFromHome(x));
    tab = 'myhome';
    if (x.bgm && H.bgmOn) H.playBgm(x.bgm);
    Community.visit(uid);
    H.visit.guest = await Community.listGuestbook(uid);
    H.visit.visits = await Community.visitCount(uid);
    render();
  }
  function leaveVisit() { Scene.setPreview(null); H.visit = null; H.homeView = 'plaza'; H.playBgm(); }
  function renderVisit() {
    const v = H.visit;
    if (!v || v.loading) return `<div class="mute small">들어가는 중…</div>`;
    if (v.error) return `<div class="card">미니홈을 찾지 못했습니다. <button data-a="hback">돌아가기</button></div>`;
    const x = v.home, Rg = E.REGIONS[x.region] || {}, G = E.GENRES[x.genre] || {}, Hh = E.HOUSES[x.house] || {};
    let h = `<div class="card"><div class="row between"><h3>${G.icon || ''} ${esc(x.channel || '')}의 미니홈</h3><button data-a="hback">← 광장</button></div>
      <div class="mute small">${Rg.icon || ''} ${Rg.name || ''} ${esc(Hh.name || '')} · 구독자 ${fmt(x.subs || 0)} · 아늑함 ${x.cozy || 0} · 방문 ${v.visits == null ? '–' : v.visits}</div>
      ${x.bgm ? `<div class="row" style="gap:6px;margin-top:8px"><span class="small">🎵 ${esc(x.bgm.title || '이 방의 BGM')}</span><button data-a="vplay">▶</button><button data-a="bstop">■</button></div>` : ''}
      <div class="mute small" style="margin-top:6px">위 화면이 이 사람의 방입니다.</div></div>`;
    h += `<div class="card"><h3>📝 글</h3>`;
    if (!(x.posts || []).length) h += `<div class="mute small">아직 글이 없습니다.</div>`;
    for (const p of x.posts || []) h += `<div class="vid" data-a="popen" data-k="${p.id}" data-u="${x.uid}"><div class="row" style="gap:10px">${p.thumb ? `<img src="${p.thumb}" style="width:54px;height:54px;object-fit:cover;border-radius:8px">` : ''}<div><b>${esc(p.title)}</b><div class="mute small">${new Date(p.ts).toLocaleDateString('ko-KR')}</div></div></div></div>`;
    h += `</div><div class="card"><h3>📖 방명록</h3>`;
    if (Community.canWrite) h += `<div class="row" style="gap:6px;margin-bottom:6px"><input type="text" id="gtext" maxlength="200" placeholder="한마디 남기기"><button class="ok" data-a="gadd">남기기</button></div>`;
    h += (v.guest || []).map(g => `<div class="log"><b>${esc(g.channel || '손님')}</b> <span class="mute small">${new Date(g.ts).toLocaleDateString('ko-KR')}</span><br>${esc(g.text)}</div>`).join('') || '<div class="mute small">첫 방명록을 남겨 보세요.</div>';
    return h + `</div>`;
  }
  async function openPost(uid, id) {
    const mine = uid === 'me' || uid === Community.uid;
    const prevView = H.homeView;
    H.homeView = 'post'; H.post = { uid, id, loading: true, back: prevView }; render();
    let data = mine ? home().posts.find(p => p.id === id) : await Community.getPost(uid, id);
    H.post.data = data; H.post.loading = false;
    H.post.realUid = mine ? Community.uid : uid;
    H.post.comments = H.post.realUid ? await Community.listComments(H.post.realUid, id) : [];
    if (data && data.bgm && H.bgmOn) H.playBgm(data.bgm);
    render();
  }
  function renderPost() {
    const P = H.post;
    if (!P || P.loading) return `<div class="mute small">불러오는 중…</div>`;
    const d = P.data;
    if (!d) return `<div class="card">글을 찾지 못했습니다. <button data-a="pback">돌아가기</button></div>`;
    let h = `<div class="card"><button data-a="pback">← 돌아가기</button><h2 style="margin:10px 0 4px">${esc(d.title)}</h2><div class="mute small">${esc(d.channel || '')} · ${new Date(d.ts).toLocaleString('ko-KR')}</div>
      ${d.photo ? `<img src="${d.photo}" style="width:100%;border-radius:12px;margin:10px 0">` : ''}
      <div style="white-space:pre-wrap;line-height:1.6">${esc(d.text || '')}</div>
      ${d.bgm ? `<div class="row" style="gap:6px;margin-top:10px"><span class="small">🎵 ${esc(d.bgm.title || '첨부 BGM')}</span><button data-a="pplay">▶</button><button data-a="bstop">■</button></div>` : ''}</div>`;
    if (Community.shared && P.realUid) {
      h += `<div class="card"><h3>💬 댓글 ${(P.comments || []).length}</h3>`;
      h += (P.comments || []).map(c => `<div class="log"><b>${esc(c.channel || '손님')}</b> <span class="mute small">${new Date(c.ts).toLocaleDateString('ko-KR')}</span><br>${esc(c.text)}</div>`).join('');
      if (Community.canWrite) h += `<div class="row" style="gap:6px;margin-top:6px"><input type="text" id="ctext" maxlength="300" placeholder="댓글 달기"><button class="ok" data-a="cadd">등록</button></div>`;
      h += `</div>`;
    }
    return h;
  }
  // 글쓰기 창
  H.renderPostForm = function () {
    if (!H.form) return '';
    return `<div class="modal-bg"><div class="modal"><h2>📝 글쓰기</h2>
      <input type="text" id="ftitle" maxlength="40" placeholder="제목" value="${esc(H.form.title || '')}" style="margin-bottom:8px">
      <textarea id="ftext" maxlength="2000" placeholder="내용" style="width:100%;min-height:140px;padding:10px;border-radius:10px;border:1px solid var(--line);background:var(--card2);color:var(--text);font:inherit">${esc(H.form.text || '')}</textarea>
      <div class="row" style="gap:8px;margin:8px 0;flex-wrap:wrap"><label class="ghost" style="padding:8px 12px;border:1px solid var(--line);border-radius:10px;cursor:pointer">📷 사진 <input type="file" id="fphoto" accept="image/*" style="display:none"></label>
      ${home().bgm ? `<label class="small"><input type="checkbox" id="fbgm" ${H.form.bgm ? 'checked' : ''}> 🎵 내 방 BGM 첨부</label>` : '<span class="mute small">BGM을 저장하면 첨부할 수 있어요</span>'}</div>
      ${H.form.photo ? `<img src="${H.form.photo}" style="width:100%;max-height:220px;object-fit:cover;border-radius:10px">` : ''}
      <div class="mute small" style="margin-top:6px">다른 사람 얼굴이 나온 사진, 남의 저작물은 올리지 마세요. 공유가 켜져 있으면 이 페이지를 볼 수 있는 사람들이 읽습니다.</div>
      <div class="choices"><button class="primary" data-a="fsubmit">올리기</button><button data-a="fcancel">취소</button></div></div></div>`;
  };
  function keepForm() {
    if (!H.form) return;
    const t = document.getElementById('ftitle'), x = document.getElementById('ftext'), b = document.getElementById('fbgm');
    if (t) H.form.title = t.value; if (x) H.form.text = x.value; if (b) H.form.bgm = b.checked;
  }
  document.addEventListener('change', async e => {
    if (e.target && e.target.id === 'fphoto' && e.target.files[0]) {
      keepForm();
      try { H.form.photo = await Community.shrinkImage(e.target.files[0], 640, 0.72); H.form.thumb = await Community.shrinkImage(e.target.files[0], 120, 0.6); } catch (err) {}
      render();
    }
  });
  async function submitPost() {
    keepForm();
    const f = H.form; if (!f || !(f.title || '').trim()) return;
    const hm = home();
    const p = { id: 'p' + Date.now().toString(36), title: f.title.trim().slice(0, 40), text: (f.text || '').slice(0, 2000), photo: f.photo || null, thumb: f.thumb || null, bgm: f.bgm ? hm.bgm : null, ts: Date.now(), channel: S.channel };
    hm.posts.unshift(p); if (hm.posts.length > 12) hm.posts.length = 12;
    H.form = null; save(); render();
    await Community.publishPost(p); H.publishHome(true);
  }
  H.publishHome = async function (force) {
    if (!Community.shared || !Community.canWrite || !S) return;
    const hm = home();
    const doc = { channel: S.channel, region: S.region, house: S.house, genre: S.genre, subs: Math.round(S.subs), cozy: E.cozy(S), equip: E.effEquip(S),
      decorPlaced: E.placedHere(S), theme: S.decor.theme[S.house] || {}, bgm: hm.bgm || null,
      posts: hm.posts.map(p => ({ id: p.id, title: p.title, ts: p.ts, thumb: p.thumb || null })) };
    const sig = JSON.stringify(Object.assign({}, doc, { subs: Math.round(doc.subs / 100) }));
    if (!force && (sig === H.pubSig || Date.now() - H.lastPub < 20000)) return;
    H.pubSig = sig; H.lastPub = Date.now();
    await Community.publishHome(doc);
  };

  // ───────── 동작 ─────────
  H.act = function (a, d) {
    const k = d.k;
    switch (a) {
      case 'dcat': H.decorCat = k; return true;
      case 'dbuy': E.buyDecor(S, k); return true;
      case 'dtheme': { const D = E.DECOR_ITEMS[k]; S.decor.theme[S.house] = Object.assign({}, S.decor.theme[S.house], { [D.slot]: k }); return true; }
      case 'dclear': { const th = Object.assign({}, S.decor.theme[S.house]); delete th[k]; S.decor.theme[S.house] = th; return true; }
      case 'dplace': startPlacing(k); return true;
      case 'drot': if (H.placing) { H.placing.rot = (H.placing.rot + 1) % 4; Scene.setPlacement && Scene.setPlacement({ id: H.placing.id, rot: H.placing.rot, onPick: H.placing.onPick }); } return true;
      case 'dcancel': cancelPlacing(); return true;
      case 'dedit': H.editing = !H.editing; H.selected = -1; if (H.editing) tab = null; placeBar(); return true;
      case 'dunsel': H.selected = -1; placeBar(); return true;
      case 'dremove': E.removeDecor(S, H.selected); H.selected = -1; placeBar(); return true;
      case 'drotsel': { const p = E.placedHere(S)[H.selected]; if (p) E.moveDecor(S, H.selected, { rot: ((p.rot || 0) + 1) % 4 }); return true; }
      case 'dmove': { const l = E.placedHere(S), p = l[H.selected]; if (p) { l.splice(H.selected, 1); startPlacing(p.id, H.selected, p); H.selected = -1; } return true; }
      case 'hview': if (H.homeView === 'visit') leaveVisit(); H.homeView = k === 'mine' ? 'mine' : 'plaza'; if (k === 'plaza') H.plaza = null; return true;
      case 'hvisit': openVisit(k); return true;
      case 'hback': leaveVisit(); return true;
      case 'popen': openPost(d.u, k); return true;
      case 'pback': H.homeView = H.post && H.post.back === 'visit' ? 'visit' : H.post && H.post.back === 'plaza' ? 'plaza' : 'mine'; H.post = null; if (H.homeView === 'mine') H.playBgm(); return true;
      case 'pnew': H.form = { title: '', text: '', bgm: !!home().bgm }; return true;
      case 'fcancel': H.form = null; return true;
      case 'fsubmit': submitPost(); return true;
      case 'pdel': { const hm = home(); hm.posts = hm.posts.filter(p => p.id !== k); Community.deletePost(k); H.publishHome(true); save(); return true; }
      case 'psearch': { const el = document.getElementById('psearch'); H.plazaQ = el ? el.value : ''; return true; }
      case 'prefresh': H.plaza = null; return true;
      case 'gadd': { const el = document.getElementById('gtext'); if (el && el.value.trim() && H.visit) { Community.addGuestbook(H.visit.home.uid, el.value.trim(), S.channel).then(async () => { H.visit.guest = await Community.listGuestbook(H.visit.home.uid); render(); }); } return true; }
      case 'cadd': { const el = document.getElementById('ctext'); if (el && el.value.trim() && H.post) { Community.addComment(H.post.realUid, H.post.id, el.value.trim(), S.channel).then(async () => { H.post.comments = await Community.listComments(H.post.realUid, H.post.id); render(); }); } return true; }
      case 'bgmtoggle': H.bgmOn = !H.bgmOn; localStorage.setItem('ytTycoon.bgm', H.bgmOn ? '1' : '0'); if (H.bgmOn) H.playBgm(); else H.stopBgm(); return true;
      case 'bmood': { const M = MU(); if (M) { H.composing = M.randomConfig ? M.randomConfig(k, Math.floor(Math.random() * 1e6)) : { mood: k, seed: 1 }; H.composing.title = H.composing.title || ''; H.bgmOn = true; H.playBgm(H.composing); } return true; }
      case 'bnew': { const M = MU(); const base = H.composing || home().bgm || defaultBgm(); if (M && base) { H.composing = M.randomConfig ? M.randomConfig(base.mood, Math.floor(Math.random() * 1e6)) : base; H.bgmOn = true; H.playBgm(H.composing); } return true; }
      case 'bplay': H.bgmOn = true; H.playBgm(H.composing || home().bgm || defaultBgm()); return true;
      case 'bstop': H.stopBgm(); return true;
      case 'bsave': { const el = document.getElementById('btitle'); const c = Object.assign({}, H.composing, { title: (el && el.value.trim()) || '나의 방 BGM' }); home().bgm = c; H.composing = null; save(); H.publishHome(true); H.playBgm(c); return true; }
      case 'vplay': H.bgmOn = true; H.playBgm(H.visit.home.bgm); return true;
      case 'pplay': H.bgmOn = true; H.playBgm(H.post.data.bgm); return true;
    }
    return false;
  };
  H.onTabOpen = async function (k) {
    if (k === 'myhome' && Community.shared && Community.uid) {
      H.myVisits = await Community.visitCount(Community.uid);
      H.myGuest = await Community.listGuestbook(Community.uid);
      H.publishHome();
      render();
    }
  };
  H.tick = function () { if (S && Community.shared) H.publishHome(); };
  root.HomeUI = H;
})(window);
