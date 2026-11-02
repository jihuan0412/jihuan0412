// 짧은 손맛 게임 (10~20초). 결과는 0~1 점수. 건너뛰면 평균(0.5).
// MiniGame.play(kind, cb): kind = 'shoot'(촬영 타이밍) · 'cook'(불 조절) · 'fish'(낚시 입질)
// 열려 있는 동안 게임 시간은 멈춘다 (index.html의 loop가 MiniGame.open을 본다).
(function (root) {
  'use strict';
  const css = `
  .mg-bg { position: fixed; inset: 0; background: rgba(8,10,20,.72); z-index: 40; display: flex; align-items: center; justify-content: center; padding: 16px; touch-action: none; }
  .mg { width: 100%; max-width: 380px; background: var(--card, #1d2233); border-radius: 18px; padding: 18px 16px 14px; text-align: center; color: var(--text, #fff); box-shadow: 0 10px 40px rgba(0,0,0,.5); user-select: none; -webkit-user-select: none; }
  .mg h2 { margin: 0 0 4px; font-size: 19px; }
  .mg .sub { font-size: 13px; opacity: .75; min-height: 18px; }
  .mg .pips { margin: 8px 0 4px; font-size: 20px; letter-spacing: 4px; }
  .mg .track { position: relative; height: 46px; margin: 14px 0 10px; border-radius: 12px; background: #2b3147; overflow: hidden; }
  .mg .zone { position: absolute; top: 0; bottom: 0; background: rgba(80,220,140,.35); border-left: 2px solid #5ce09a; border-right: 2px solid #5ce09a; }
  .mg .zone i { position: absolute; top: 0; bottom: 0; left: 30%; right: 30%; background: rgba(80,220,140,.45); }
  .mg .needle { position: absolute; top: -2px; bottom: -2px; width: 6px; margin-left: -3px; border-radius: 3px; background: #ffe066; box-shadow: 0 0 10px #ffe066; }
  .mg .pond { position: relative; height: 150px; margin: 12px 0 8px; border-radius: 14px; background: linear-gradient(#2f6fa8, #1b4a78); overflow: hidden; }
  .mg .bob { position: absolute; left: 50%; top: 52px; width: 16px; height: 34px; transform: translateX(-50%); transition: transform .08s; }
  .mg .bob b { position: absolute; left: 0; top: 0; width: 16px; height: 20px; border-radius: 8px 8px 4px 4px; background: linear-gradient(#ff4d4d 55%, #fff 55%); box-shadow: 0 0 6px rgba(0,0,0,.4); }
  .mg .bob s { position: absolute; left: 7px; top: -26px; width: 2px; height: 28px; background: rgba(255,255,255,.7); }
  .mg .bob u { position: absolute; left: -14px; top: 18px; width: 44px; height: 8px; border: 2px solid rgba(255,255,255,.35); border-radius: 50%; }
  .mg .bob.bite { transform: translate(-50%, 18px); }
  .mg .fishy { position: absolute; font-size: 22px; opacity: .55; }
    .mg .bang { position: absolute; left: 50%; top: 8px; transform: translateX(-50%); font-size: 30px; font-weight: 800; color: #ffe066; text-shadow: 0 0 10px #000; }
  .mg .big { font-size: 46px; margin: 6px 0; }
  .mg .hit { width: 100%; padding: 16px; font-size: 18px; font-weight: 700; border-radius: 14px; border: 0; background: var(--accent, #ff5a5f); color: #fff; }
  .mg .skip { margin-top: 10px; background: transparent; border: 0; color: inherit; opacity: .6; font-size: 13px; text-decoration: underline; }
  .mg .res { font-size: 15px; margin: 8px 0 2px; }
  `;
  let styled = false;
  const MG = { open: false };

  const KINDS = {
    shoot: { title: '🎬 촬영 타이밍', hint: '노란 선이 초록 칸에 들어올 때 누르세요', btn: '찰칵!', rounds: 3, icon: '📷',
      labels: ['초점 놓침', '조금 흔들림', '잘 찍힘!', '완벽한 컷!'] },
    cook: { title: '🍳 불 조절', hint: '알맞게 익었을 때(초록 칸) 재료를 뒤집어요', btn: '뒤집기!', rounds: 3, icon: '🍳',
      labels: ['타 버림', '살짝 덜 익음', '맛있게 익음!', '완벽한 한 접시!'] },
    fish: { title: '🎣 낚시', hint: '찌가 쑥 들어가며 ❗가 뜨면 바로 당기세요', btn: '당기기!', rounds: 3, icon: '🎣',
      labels: ['한 마리도 못 잡음', '한 마리!', '두 마리!', '세 마리 대박!'] },
  };

  function el(html) { const d = document.createElement('div'); d.innerHTML = html; return d.firstElementChild; }

  MG.play = function (kind, cb) {
    if (MG.open) return;
    const K = KINDS[kind]; if (!K) { cb(0.5); return; }
    if (!styled) { const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st); styled = true; }
    MG.open = true;
    const bg = el(`<div class="mg-bg"><div class="mg"><h2>${K.title}</h2><div class="sub"></div><div class="pips"></div><div class="stage"></div>
      <button class="hit">${K.btn}</button><br><button class="skip">건너뛰기 (보통 결과)</button></div></div>`);
    document.body.appendChild(bg);
    const sub = bg.querySelector('.sub'), pips = bg.querySelector('.pips'), stage = bg.querySelector('.stage'), hit = bg.querySelector('.hit'), skip = bg.querySelector('.skip');
    sub.textContent = K.hint;
    const scores = [];
    let round = 0, raf = 0, done = false, t0 = 0, lockUntil = 0;
    const drawPips = () => { pips.textContent = Array.from({ length: K.rounds }, (_, i) => i < scores.length ? (scores[i] >= 1 ? '⭐' : scores[i] > 0 ? '✨' : '✖️') : '○').join(''); };

    // ── 타이밍 막대 (촬영·요리)
    let pos = 0, dir = 1, speed = 0, zone = null, needle = null, zoneEl = null;
    function newBar() {
      const w = kind === 'cook' ? 0.24 - round * 0.03 : 0.22 - round * 0.035;
      const c = 0.2 + Math.random() * 0.6;
      zone = [Math.max(0.02, c - w / 2), Math.min(0.98, c + w / 2)];
      speed = 0.75 + round * 0.3 + Math.random() * 0.15;
      pos = Math.random() < 0.5 ? 0 : 1; dir = pos ? -1 : 1;
      stage.innerHTML = `<div class="big">${K.icon}</div><div class="track"><div class="zone" style="left:${zone[0] * 100}%;width:${(zone[1] - zone[0]) * 100}%"><i></i></div><div class="needle"></div></div>`;
      needle = stage.querySelector('.needle'); zoneEl = stage.querySelector('.zone');
    }
    function barTap() {
      const w = zone[1] - zone[0], c = (zone[0] + zone[1]) / 2, d = Math.abs(pos - c);
      const sc = d <= w * 0.2 ? 1 : d <= w / 2 ? 0.6 : d <= w / 2 + 0.06 ? 0.2 : 0;
      scores.push(sc);
      sub.textContent = sc >= 1 ? '완벽해요!' : sc >= 0.6 ? '좋아요!' : sc > 0 ? '아슬아슬' : '놓쳤어요';
      next();
    }
    // ── 낚시 (반응 속도)
    let biteAt = 0, biting = false, bob = null, bang = null;
    function newFish() {
      biting = false; biteAt = performance.now() + 900 + Math.random() * 2200;
      stage.innerHTML = `<div class="pond"><span class="fishy" style="left:14%;top:96px">🐟</span><span class="fishy" style="left:72%;top:110px">🐠</span><div class="bang" style="display:none">❗</div><div class="bob"><s></s><u></u><b></b></div></div>`;
      bob = stage.querySelector('.bob'); bang = stage.querySelector('.bang');
      sub.textContent = '기다리는 중…';
    }
    function fishTap(now) {
      if (!biting) { scores.push(0); sub.textContent = '너무 빨랐어요, 물고기가 도망갔어요'; next(); return; }
      const rt = now - biteAt;
      const sc = rt < 450 ? 1 : rt < 750 ? 0.6 : 0;
      scores.push(sc); sub.textContent = sc ? `🐟 잡았다! (${Math.round(rt)}ms)` : '조금 늦었어요';
      next();
    }

    function next() {
      round++; drawPips();
      lockUntil = performance.now() + 550;
      if (round >= K.rounds) { finish(); return; }
      setTimeout(() => { if (done) return; kind === 'fish' ? newFish() : newBar(); }, 500);
    }
    function finish(skipped) {
      done = true; cancelAnimationFrame(raf);
      const total = skipped ? 0.5 : scores.reduce((a, b) => a + b, 0) / K.rounds;
      const li = kind === 'fish' ? Math.round(total * 3) : total >= 0.9 ? 3 : total >= 0.55 ? 2 : total >= 0.25 ? 1 : 0;
      stage.innerHTML = `<div class="big">${total >= 0.55 ? '🎉' : total > 0 ? '🙂' : '😅'}</div><div class="res"><b>${skipped ? '보통 결과로 넘어갔어요' : K.labels[li]}</b></div>`;
      hit.textContent = '확인'; skip.style.display = 'none';
      hit.onclick = null;
      setTimeout(() => {
        hit.addEventListener('pointerup', close, { once: true });
      }, 250);
      function close(e) { e && e.stopPropagation(); bg.remove(); MG.open = false; cb(total); }
    }

    function frame(now) {
      if (done) return;
      const dt = Math.min(0.05, (now - (t0 || now)) / 1000); t0 = now;
      if (kind !== 'fish' && needle && round < K.rounds && now > lockUntil) {
        pos += dir * speed * dt;
        if (pos > 1) { pos = 1; dir = -1; } if (pos < 0) { pos = 0; dir = 1; }
        needle.style.left = (pos * 100) + '%';
      }
      if (kind === 'fish' && bob && !biting && now >= biteAt && round < K.rounds) {
        biting = true; bob.classList.add('bite'); bang.style.display = ''; sub.textContent = '지금!';
      }
      if (kind === 'fish' && biting && now - biteAt > 1100 && round < K.rounds && now > lockUntil) { scores.push(0); sub.textContent = '놓쳤어요'; biting = false; next(); }
      raf = requestAnimationFrame(frame);
    }

    // 이 창 안의 누름은 게임 화면으로 새지 않게 막는다
    const stop = e => e.stopPropagation();
    bg.addEventListener('pointerdown', e => {
      stop(e);
      if (done) return;
      if (e.target === skip) { finish(true); return; }
      if (e.target === hit || e.target.closest('.stage')) {
        const now = performance.now();
        if (now < lockUntil) return;
        if (kind === 'fish') fishTap(now); else if (needle) barTap();
      }
    });
    bg.addEventListener('pointerup', stop);
    bg.addEventListener('click', stop);

    drawPips();
    kind === 'fish' ? newFish() : newBar();
    raf = requestAnimationFrame(frame);
  };

  root.MiniGame = MG;
})(typeof window !== 'undefined' ? window : globalThis);
