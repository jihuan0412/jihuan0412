/* 미니홈·광장 데이터 (공유 저장소). 배포 페이지에서 db·user 기능이 있을 때만 공유되고,
 * 그 밖(파일로 열기 등)에서는 내 미니홈만 이 기기에 저장된다.
 *
 * 경로
 *   homes/<uid>                    내 미니홈 (채널·방·BGM·글 목록 요약) — 본인만 씀, 모두 읽음
 *   homes/<uid>/posts/<postId>     글 본문 (제목·글·사진·BGM)          — 본인만 씀, 모두 읽음
 *   comments/<uid>_<postId>/items  댓글                                 — 누구나 씀
 *   guestbook/<uid>/items          방명록                               — 누구나 씀
 *   visits/<uid>/by/<visitorUid>   방문 기록                            — 누구나 씀
 */
(function (root) {
  'use strict';
  const C = { ready: false, shared: false, db: null, user: null, uid: null, canWrite: false, error: '' };
  let initP = null;

  function withTimeout(p, ms) { return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej({ code: 'timeout' }), ms))]); }

  C.init = function () {
    if (initP) return initP;
    initP = (async () => {
      try {
        if (!root.claude || !root.claude.use) throw { code: 'no_runtime' };
        const [db, user] = await withTimeout(Promise.all([root.claude.use('db'), root.claude.use('user')]), 11000);
        if (!db || !user) throw { code: 'unavailable' };
        const uid = await user.id();
        if (!uid) throw { code: 'signed_out' };
        C.db = db; C.user = user; C.uid = uid; C.shared = true;
        const cw = user.can ? await user.can('data.write') : null;
        C.canWrite = cw !== false;
      } catch (e) { C.shared = false; C.error = e && e.code || 'unavailable'; }
      C.ready = true;
      return C;
    })();
    return initP;
  };

  // 내 미니홈을 공유 저장소에 올림 (변경이 있을 때만 호출)
  C.publishHome = async function (home) {
    if (!C.shared || !C.canWrite) return false;
    try { await C.db.doc('homes/' + C.uid).set(Object.assign({}, home, { updatedAt: Date.now() })); return true; }
    catch (e) { if (e && e.code === 'invalid_argument') C.canWrite = false; C.error = e && e.code; return false; }
  };
  C.publishPost = async function (post) {
    if (!C.shared || !C.canWrite) return false;
    try { await C.db.doc('homes/' + C.uid + '/posts/' + post.id).set(post); return true; }
    catch (e) { C.error = e && e.code; return false; }
  };
  C.deletePost = async function (postId) {
    if (!C.shared || !C.canWrite) return false;
    try { await C.db.doc('homes/' + C.uid + '/posts/' + postId).delete(); return true; } catch (e) { return false; }
  };
  C.listHomes = async function (n) {
    if (!C.shared) return [];
    try { const q = await C.db.collection('homes').orderBy('updatedAt', 'desc').limit(n || 40).get(); return q.docs.map(d => Object.assign({ uid: d.id }, d.data())); }
    catch (e) { C.error = e && e.code; return []; }
  };
  C.getHome = async function (uid) {
    if (!C.shared) return null;
    try { const d = await C.db.doc('homes/' + uid).get(); return d.exists ? Object.assign({ uid }, d.data()) : null; } catch (e) { return null; }
  };
  C.getPost = async function (uid, postId) {
    if (!C.shared) return null;
    try { const d = await C.db.doc('homes/' + uid + '/posts/' + postId).get(); return d.exists ? d.data() : null; } catch (e) { return null; }
  };
  C.listComments = async function (uid, postId) {
    if (!C.shared) return [];
    try { const q = await C.db.collection('comments/' + uid + '_' + postId + '/items').orderBy('ts', 'asc').limit(100).get(); return q.docs.map(d => Object.assign({ id: d.id }, d.data())); } catch (e) { return []; }
  };
  C.addComment = async function (uid, postId, text, channel) {
    if (!C.shared || !C.canWrite) return false;
    try { await C.db.collection('comments/' + uid + '_' + postId + '/items').add({ text: String(text).slice(0, 300), by: C.uid, channel: String(channel || '').slice(0, 30), ts: Date.now() }); return true; } catch (e) { return false; }
  };
  C.listGuestbook = async function (uid) {
    if (!C.shared) return [];
    try { const q = await C.db.collection('guestbook/' + uid + '/items').orderBy('ts', 'desc').limit(50).get(); return q.docs.map(d => Object.assign({ id: d.id }, d.data())); } catch (e) { return []; }
  };
  C.addGuestbook = async function (uid, text, channel) {
    if (!C.shared || !C.canWrite) return false;
    try { await C.db.collection('guestbook/' + uid + '/items').add({ text: String(text).slice(0, 200), by: C.uid, channel: String(channel || '').slice(0, 30), ts: Date.now() }); return true; } catch (e) { return false; }
  };
  C.visit = async function (uid) {
    if (!C.shared || !C.canWrite || uid === C.uid) return;
    try { await C.db.doc('visits/' + uid + '/by/' + C.uid).set({ ts: Date.now() }); } catch (e) {}
  };
  C.visitCount = async function (uid) {
    if (!C.shared) return 0;
    try { const q = await C.db.collection('visits/' + uid + '/by').limit(1000).get(); return q.size; } catch (e) { return 0; }
  };
  C.deleteComment = async function (uid, postId, id) {
    try { await C.db.doc('comments/' + uid + '_' + postId + '/items/' + id).delete(); return true; } catch (e) { return false; }
  };

  // 사진: 긴 변 640px JPEG로 줄여 data URL로 (글 문서 256KiB 안에 들어가게)
  C.shrinkImage = function (file, maxSide, quality) {
    maxSide = maxSide || 640; quality = quality || 0.72;
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onerror = reject;
      fr.onload = () => {
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
          const k = Math.min(1, maxSide / Math.max(img.width, img.height));
          const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          let q = quality, url = c.toDataURL('image/jpeg', q);
          while (url.length > 150000 && q > 0.35) { q -= 0.1; url = c.toDataURL('image/jpeg', q); }
          resolve(url);
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  };

  root.Community = C;
})(window);
