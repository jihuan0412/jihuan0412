// music.js — 절차적 BGM 엔진 (Web Audio API로 전부 코드 합성: 오디오 파일/샘플 없음 → 저작권 걱정 없음)
// 사용: Music.unlock() (사용자 클릭 안에서) → Music.play(Music.randomConfig('lofi', 123))
// 노래 설정(JSON): { mood, seed, tempo, key, swing, layers:{drums,bass,chords,melody,ambience}, volume, title }
// 같은 설정 → 항상 같은 음악 (seed 기반 결정적 생성).
(function (root) {
  'use strict';

  var AC = root.AudioContext || root.webkitAudioContext || null;
  var OAC = root.OfflineAudioContext || root.webkitOfflineAudioContext || null;

  // ---------------------------------------------------------------- 난수 (결정적)
  function hashStr(s) {
    s = String(s);
    var h = 2166136261 >>> 0;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function mulberry32(a) {
    a = a >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashInts(a, b, c) { // 정수 3개 → [0,1)
    var h = Math.imul((a | 0) ^ 0x9E3779B9, 0x85EBCA6B) ^ Math.imul((b | 0) + 0x632BE5AB, 0xC2B2AE35) ^ Math.imul((c | 0) + 0x5BD1E995, 0x27D4EB2F);
    h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D); h ^= h >>> 12; h = Math.imul(h, 0x297A2D39); h ^= h >>> 15;
    return (h >>> 0) / 4294967296;
  }
  function Rng(seedStr) {
    var f = mulberry32(hashStr(seedStr));
    return {
      f: f,
      range: function (a, b) { return a + (b - a) * f(); },
      int: function (a, b) { return a + Math.floor(f() * (b - a + 1)); },
      pick: function (arr) { return arr[Math.floor(f() * arr.length)]; },
      chance: function (p) { return f() < p; },
      weighted: function (items, weights) {
        var s = 0, i; for (i = 0; i < weights.length; i++) s += weights[i];
        var r = f() * s; for (i = 0; i < weights.length; i++) { r -= weights[i]; if (r <= 0) return items[i]; }
        return items[items.length - 1];
      }
    };
  }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function mod12(x) { return ((x % 12) + 12) % 12; }

  // ---------------------------------------------------------------- 음악 이론
  var NOTE_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  var NOTE_ALIASES = { 'C#': 1, 'D#': 3, 'Gb': 6, 'G#': 8, 'A#': 10, 'Cb': 11, 'Fb': 4, 'E#': 5, 'B#': 0 };
  var MODES = {
    major: { iv: [0, 2, 4, 5, 7, 9, 11], ko: '메이저' },
    minor: { iv: [0, 2, 3, 5, 7, 8, 10], ko: '마이너' },
    dorian: { iv: [0, 2, 3, 5, 7, 9, 10], ko: '도리안' },
    mixolydian: { iv: [0, 2, 4, 5, 7, 9, 10], ko: '믹솔리디안' },
    lydian: { iv: [0, 2, 4, 6, 7, 9, 11], ko: '리디안' }
  };
  var ROMAN = { I: 0, II: 2, III: 4, IV: 5, V: 7, VI: 9, VII: 11 };

  // 'ii7', 'bVImaj7', 'V7sus4', 'iiø7', 'Iadd9' → { root(반음, 조성 기준), iv:[구성음 간격] }
  function parseChord(sym) {
    var m = /^(b|#)?(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)(.*)$/.exec(sym);
    if (!m) throw new Error('bad chord ' + sym);
    var acc = m[1] === 'b' ? -1 : m[1] === '#' ? 1 : 0;
    var num = m[2], suf = m[3];
    var lower = num === num.toLowerCase();
    var root = mod12(ROMAN[num.toUpperCase()] + acc);
    var tri = lower ? [0, 3, 7] : [0, 4, 7], iv;
    switch (suf) {
      case '': iv = tri; break;
      case 'dim': iv = [0, 3, 6]; break;
      case 'ø7': case 'm7b5': iv = [0, 3, 6, 10]; break;
      case '7': iv = lower ? [0, 3, 7, 10] : [0, 4, 7, 10]; break;
      case 'maj7': iv = lower ? [0, 3, 7, 11] : [0, 4, 7, 11]; break;
      case '9': iv = lower ? [0, 3, 7, 10, 14] : [0, 4, 7, 10, 14]; break;
      case 'maj9': iv = [0, 4, 7, 11, 14]; break;
      case 'add9': iv = tri.concat([14]); break;
      case '6': iv = tri.concat([9]); break;
      case 'sus4': iv = [0, 5, 7]; break;
      case 'sus2': iv = [0, 2, 7]; break;
      case '7sus4': iv = [0, 5, 7, 10]; break;
      default: iv = tri;
    }
    return { sym: sym, root: root, iv: iv };
  }

  // 화음 구성음 근처에서 반음 충돌하는 스케일음(어보이드 노트)을 빼고, 화음 밖 반음계 구성음은 더한다.
  function chordScale(modePcs, tonePcs) {
    var out = [], i;
    for (i = 0; i < modePcs.length; i++) {
      var pc = modePcs[i];
      if (tonePcs.indexOf(pc) >= 0) { out.push(pc); continue; }
      if (tonePcs.indexOf(mod12(pc - 1)) >= 0 || tonePcs.indexOf(mod12(pc + 1)) >= 0) continue;
      out.push(pc);
    }
    for (i = 0; i < tonePcs.length; i++) if (out.indexOf(tonePcs[i]) < 0) out.push(tonePcs[i]);
    return out.sort(function (a, b) { return a - b; });
  }

  // 보이스 리딩: 이전 보이싱과 가장 가까운 자리바꿈을 고른다.
  function voiceChord(chord, keyPc, prev, lo, hi, maxNotes) {
    var iv = chord.iv.slice();
    if (iv.length > maxNotes) { // 5음은 빼고, 그래도 많으면 근음 생략(베이스가 냄)
      var i5 = iv.indexOf(7); if (i5 >= 0) iv.splice(i5, 1);
      if (iv.length > maxNotes) iv.splice(0, 1);
    }
    var pcs = iv.map(function (x) { return mod12(keyPc + chord.root + x); });
    var best = null, bestScore = 1e9, center = (lo + hi) / 2 - 2;
    for (var r = 0; r < pcs.length; r++) {
      var rot = pcs.slice(r).concat(pcs.slice(0, r));
      for (var s = lo; s < lo + 12; s++) {
        if (mod12(s) !== rot[0]) continue;
        var notes = [s], ok = true;
        for (var k = 1; k < rot.length; k++) {
          var n = notes[k - 1] + 1; while (mod12(n) !== rot[k]) n++;
          notes.push(n);
        }
        if (notes[notes.length - 1] > hi) ok = false;
        if (!ok) continue;
        var sc = 0, j, q;
        if (prev) {
          for (j = 0; j < notes.length; j++) { var md = 99; for (q = 0; q < prev.length; q++) md = Math.min(md, Math.abs(notes[j] - prev[q])); sc += md; }
          for (q = 0; q < prev.length; q++) { var md2 = 99; for (j = 0; j < notes.length; j++) md2 = Math.min(md2, Math.abs(notes[j] - prev[q])); sc += md2; }
          var mean = 0; for (j = 0; j < notes.length; j++) mean += notes[j]; mean /= notes.length;
          sc += Math.abs(mean - center) * 0.35; // 음역이 한쪽으로 흘러가지 않게
        } else {
          var mean0 = 0; for (j = 0; j < notes.length; j++) mean0 += notes[j]; mean0 /= notes.length;
          sc = Math.abs(mean0 - center);
        }
        if (sc < bestScore) { bestScore = sc; best = notes; }
      }
    }
    return best || pcs.map(function (pc) { var n = lo; while (mod12(n) !== pc) n++; return n; });
  }

  // ---------------------------------------------------------------- 분위기(무드) 정의
  // drums 패턴 문자: X=1 x=.75 o=.5 -=.28 g=유령음(확률) .=쉼
  var DRUM_STYLES = {
    boombap: { rows: { kick: 'X.....g...X..g..', snare: '....X.......X...', hat: 'x-o-x-o-x-o-x-og' }, fill: { snare: '....X.......X.-x', kick: 'X.....g.........' } },
    soft: { rows: { kick: 'x.......o.......', rim: '....o.......o...', shaker: 'o-x-o-x-o-x-o-x-' }, fill: { rim: '....o.......o.-o' } },
    pop: { rows: { kick: 'X...X...X...X...', clap: '....X.......X...', ohat: '..x...x...x...x.', hat: 'o.-.o.-.o.-.o.-.' }, fill: { snare: '........x.o.xxXX', kick: 'X...X...X.......' }, crash: true },
    chip: { rows: { ckick: 'X.......X.g.....', cnoise: '....X.......X...', chat: 'o.-.o.-.o.-.o.-g' }, fill: { cnoise: '....X...x.x.xxXX' }, crash: true },
    jazz: { rows: { ride: 'x...o.x.x...o.x.', phat: '....o.......o...', kick: '-...-...-...-...', brush: '......g.....g.g.' }, fill: { brush: '..........-.o.x.' } },
    country: { rows: { kick: 'X.......x.......', rim: '....x.......x...', shaker: '-.o.-.o.-.o.-.o.' }, fill: { snare: '........-.o.x.x.' } },
    ballad: { rows: { kick: 'x.........g.....', rim: '....o.......o...', hat: '-.-.-.-.-.-.-.-.' }, fill: { snare: '............-.o.' } },
    citypop: { rows: { kick: 'X.....x.X.......', snare: '....X.......X...', hat: 'x-o-x-o-x-o-x-o-', ohat: '..............o.' }, fill: { snare: '....X.....o.xxXX' }, crash: true },
    gentle: { rows: { kick: 'o...............', shaker: '-.o.-.o.-.o.-.o.' } },
    none: { rows: {} }
  };

  var MOODS = {
    lofi: {
      name: '로파이', desc: '비 오는 밤 공부할 때 듣는 느릿한 비트',
      tempo: [70, 86], swing: [0.45, 0.7], swingUnit: 1, keys: [0, 2, 3, 5, 7, 8, 10],
      progs: [
        { mode: 'major', chords: 'ii7 V7 Imaj7 vi7' },
        { mode: 'major', chords: 'IVmaj7 iii7 ii7 Imaj7' },
        { mode: 'dorian', chords: 'i7 IV7 i7 IV7' },
        { mode: 'minor', chords: 'i7 bVImaj7 iv7 v7' },
        { mode: 'major', chords: 'Imaj7 vi7 ii7 V7sus4' },
        { mode: 'major', chords: 'IVmaj7 V7 iii7 vi7' }
      ],
      harm: 1,
      chords: [{ inst: 'epiano', style: 'lofi', gain: 1 }],
      bass: { inst: 'sub', style: 'lofi' },
      melody: { insts: ['pluck', 'bell', 'flute'], range: [67, 84], density: 0.42 },
      drums: 'boombap',
      ambience: { beds: ['vinyl'], maybe: [['rain', 0.5]] },
      tone: 3400, wow: 1, reverb: { size: 2.0, mix: 0.22 }, humanize: 0.012,
      mix: { drums: 0.9, bass: 0.9, chords: 0.75, melody: 0.7, ambience: 0.8 },
      titles: ['비 오는 창가', '새벽 세 시 공부', '식은 커피', '방구석 라디오', '느린 일요일', '창밖 네온사인']
    },
    cozy: {
      name: '잔잔한 오후', desc: '햇살 드는 방에서 차 한 잔',
      tempo: [78, 94], swing: [0, 0.2], swingUnit: 1, keys: [0, 2, 5, 7, 9, 10],
      progs: [
        { mode: 'major', chords: 'I V vi IV' },
        { mode: 'major', chords: 'I iii IV V' },
        { mode: 'major', chords: 'IV I V vi' },
        { mode: 'major', chords: 'Iadd9 vi7 IVmaj7 V' },
        { mode: 'major', chords: 'I vi IV V' }
      ],
      harm: 1,
      chords: [{ inst: 'piano', style: 'broken', gain: 0.9 }, { inst: 'pad', style: 'sustain', gain: 0.45 }],
      bass: { inst: 'sub', style: 'ballad' },
      melody: { insts: ['marimba', 'bell', 'flute'], range: [67, 86], density: 0.45 },
      drums: 'soft',
      ambience: { beds: ['breeze'], events: { bird: 0.5 } },
      tone: 9000, wow: 0, reverb: { size: 2.6, mix: 0.26 }, humanize: 0.01,
      mix: { drums: 0.75, bass: 0.8, chords: 0.75, melody: 0.7, ambience: 0.7 },
      titles: ['햇살 한 조각', '오후 세 시의 낮잠', '고양이와 창가', '레몬티', '느긋한 산책', '빨래 마르는 날']
    },
    upbeat: {
      name: '신나는', desc: '구독자 폭발! 텐션 업 팝 비트',
      tempo: [112, 128], swing: [0, 0.1], swingUnit: 1, keys: [0, 2, 4, 5, 7, 9],
      progs: [
        { mode: 'major', chords: 'I V vi IV' },
        { mode: 'major', chords: 'vi IV I V' },
        { mode: 'major', chords: 'I IV vi V' },
        { mode: 'mixolydian', chords: 'I bVII IV I' }
      ],
      harm: 1,
      chords: [{ inst: 'pluck', style: 'stabs', gain: 0.9 }, { inst: 'pad', style: 'sustain', gain: 0.35 }],
      bass: { inst: 'synthBass', style: 'pop' },
      melody: { insts: ['lead', 'marimba', 'bell'], range: [69, 86], density: 0.6 },
      drums: 'pop',
      ambience: { beds: ['city'] },
      tone: 0, wow: 0, reverb: { size: 1.4, mix: 0.14 }, humanize: 0.006,
      mix: { drums: 0.75, bass: 0.85, chords: 0.7, melody: 0.7, ambience: 0.45 },
      titles: ['조회수 떡상', '알림 설정 필수', '오늘도 업로드', '하이라이트 모음', '좋아요 폭탄', '실버버튼 가자']
    },
    chiptune: {
      name: '8비트 게임', desc: '옛날 게임기 느낌의 삑삑 사운드',
      tempo: [126, 150], swing: [0, 0], swingUnit: 1, keys: [0, 2, 4, 5, 7, 9],
      progs: [
        { mode: 'major', chords: 'I IV V I' },
        { mode: 'major', chords: 'I vi IV V' },
        { mode: 'major', chords: 'vi IV I V' },
        { mode: 'minor', chords: 'i bVI bVII i' },
        { mode: 'minor', chords: 'i iv bVII bIII' }
      ],
      harm: 1,
      chords: [{ inst: 'chipArp', style: 'arp16', gain: 1 }],
      bass: { inst: 'triBass', style: 'chip' },
      melody: { insts: ['pulse'], range: [67, 88], density: 0.62 },
      drums: 'chip',
      ambience: { beds: ['crt'] },
      tone: 0, wow: 0, reverb: { size: 0.8, mix: 0.08 }, humanize: 0,
      mix: { drums: 0.8, bass: 0.9, chords: 0.9, melody: 0.75, ambience: 0.5 },
      titles: ['스테이지 1-1', '보스 등장 전', '세이브 포인트', '보너스 코인', '픽셀 모험', '하이스코어']
    },
    jazz: {
      name: '재즈 카페', desc: '원두 향 가득한 스윙 재즈',
      tempo: [92, 124], swing: [0.7, 0.9], swingUnit: 2, keys: [0, 3, 5, 7, 8, 10],
      progs: [
        { mode: 'major', chords: 'ii7 V7 Imaj7 VI7' },
        { mode: 'major', chords: 'Imaj7 vi7 ii7 V7' },
        { mode: 'major', chords: 'iii7 VI7 ii7 V7' },
        { mode: 'major', chords: 'Imaj7 VI7 ii7 V7' },
        { mode: 'minor', chords: 'i7 iv7 iiø7 V7' }
      ],
      harm: 1,
      chords: [{ inst: 'epiano', style: 'charleston', gain: 1 }],
      bass: { inst: 'upright', style: 'walking' },
      melody: { insts: ['vibes', 'flute'], range: [65, 84], density: 0.5 },
      drums: 'jazz',
      ambience: { beds: ['cafe'], events: { clink: 0.5 }, maybe: [['rain', 0.3]] },
      tone: 11000, wow: 0, reverb: { size: 2.2, mix: 0.22 }, humanize: 0.012,
      mix: { drums: 0.85, bass: 0.95, chords: 0.7, melody: 0.7, ambience: 0.6 },
      titles: ['원두 한 스푼', '창가 자리', '오후의 라떼', '비밥 산책', '골목 재즈바', '블루노트']
    },
    countryside: {
      name: '시골 아침', desc: '새소리와 기타가 있는 상쾌한 아침',
      tempo: [88, 104], swing: [0, 0.25], swingUnit: 1, keys: [0, 2, 4, 7, 9],
      progs: [
        { mode: 'major', chords: 'I IV I V' },
        { mode: 'major', chords: 'I V IV I' },
        { mode: 'major', chords: 'I vi IV V' },
        { mode: 'major', chords: 'IV I V I' },
        { mode: 'major', chords: 'I IV vi V' }
      ],
      harm: 1, penta: true,
      chords: [{ inst: 'guitar', style: 'strum', gain: 1 }],
      bass: { inst: 'upright', style: 'country' },
      melody: { insts: ['flute', 'marimba'], range: [67, 86], density: 0.5 },
      drums: 'country',
      ambience: { beds: ['breeze'], events: { bird: 1.4 } },
      tone: 13000, wow: 0, reverb: { size: 1.8, mix: 0.2 }, humanize: 0.01,
      mix: { drums: 0.75, bass: 0.85, chords: 0.75, melody: 0.7, ambience: 0.75 },
      titles: ['논두렁 산책', '아침 이슬', '할머니 댁', '닭 우는 소리', '자전거 타고', '감자밭']
    },
    ocean: {
      name: '바닷가', desc: '파도 소리와 반짝이는 벨',
      tempo: [68, 82], swing: [0, 0.15], swingUnit: 1, keys: [0, 2, 4, 5, 7, 9],
      progs: [
        { mode: 'lydian', chords: 'Imaj7 II Imaj7 II' },
        { mode: 'major', chords: 'Imaj7 IVmaj7 Imaj7 IVmaj7' },
        { mode: 'major', chords: 'IVmaj7 Imaj7 vi7 V' },
        { mode: 'major', chords: 'Iadd9 V vi7 IVmaj7' }
      ],
      harm: 0.5,
      chords: [{ inst: 'pad', style: 'sustain', gain: 0.8 }, { inst: 'bell', style: 'arp8', gain: 0.55 }],
      bass: { inst: 'sub', style: 'hold' },
      melody: { insts: ['bell', 'flute', 'marimba'], range: [69, 88], density: 0.28 },
      drums: 'gentle',
      ambience: { beds: ['waves'], events: { gull: 0.25 } },
      tone: 10000, wow: 0, reverb: { size: 3.2, mix: 0.34 }, humanize: 0.012,
      mix: { drums: 0.6, bass: 0.8, chords: 0.8, melody: 0.7, ambience: 0.55 },
      titles: ['해 질 녘 모래사장', '파도 위 윤슬', '조개 줍기', '등대 아래', '여름 끝자락', '바닷바람']
    },
    forest: {
      name: '산속 밤', desc: '풀벌레 소리와 고요한 숲속의 밤',
      tempo: [60, 72], swing: [0, 0], swingUnit: 1, keys: [0, 2, 4, 5, 7, 9],
      progs: [
        { mode: 'minor', chords: 'i bVI bIII bVII' },
        { mode: 'dorian', chords: 'i7 IV i7 IV' },
        { mode: 'minor', chords: 'i iv i v' },
        { mode: 'minor', chords: 'i bVII bVI bVII' }
      ],
      harm: 0.5,
      chords: [{ inst: 'pad', style: 'sustain', gain: 0.85 }, { inst: 'guitar', style: 'arp8', gain: 0.5 }],
      bass: { inst: 'sub', style: 'hold' },
      melody: { insts: ['flute', 'bell'], range: [62, 79], density: 0.3 },
      drums: 'none',
      ambience: { beds: ['crickets', 'wind'], events: { owl: 0.25 } },
      tone: 7000, wow: 0, reverb: { size: 3.5, mix: 0.36 }, humanize: 0.014,
      mix: { drums: 0, bass: 0.75, chords: 0.75, melody: 0.65, ambience: 0.85 },
      titles: ['별 헤는 밤', '캠프파이어', '반딧불이', '부엉이 숲', '달빛 오솔길', '텐트 안에서']
    },
    ballad: {
      name: '감성 발라드', desc: '피아노와 빗소리, 촉촉한 감성',
      tempo: [64, 76], swing: [0, 0.12], swingUnit: 1, keys: [0, 2, 3, 5, 7, 8, 10],
      progs: [
        { mode: 'major', chords: 'IVmaj7 V7 iii7 vi7 ii7 V7 Imaj7 Imaj7' },
        { mode: 'major', chords: 'I V vi iii IV I IV V' },
        { mode: 'major', chords: 'I V vi IV' },
        { mode: 'major', chords: 'vi IV I V' }
      ],
      harm: 1,
      chords: [{ inst: 'piano', style: 'broken', gain: 1 }, { inst: 'pad', style: 'sustain', gain: 0.35 }],
      bass: { inst: 'sub', style: 'ballad' },
      melody: { insts: ['flute', 'bell'], range: [64, 81], density: 0.4 },
      drums: 'ballad',
      ambience: { beds: ['rain'] },
      tone: 11000, wow: 0, reverb: { size: 2.8, mix: 0.3 }, humanize: 0.014,
      mix: { drums: 0.7, bass: 0.85, chords: 0.8, melody: 0.7, ambience: 0.7 },
      titles: ['너의 우산', '첫눈 오는 날', '편지', '그 계절', '버스 창가', '오래된 사진']
    },
    citypop: {
      name: '시티팝', desc: '네온사인 아래 80년대 드라이브',
      tempo: [100, 116], swing: [0, 0.15], swingUnit: 1, keys: [0, 2, 3, 5, 7, 8, 10],
      progs: [
        { mode: 'major', chords: 'IVmaj7 V7 iii7 vi7' },
        { mode: 'major', chords: 'IVmaj7 III7 vi7 vi7' },
        { mode: 'major', chords: 'ii7 V7 Imaj7 vi7' },
        { mode: 'major', chords: 'IVmaj7 iii7 ii7 Imaj7' }
      ],
      harm: 1,
      chords: [{ inst: 'epiano', style: 'citypop', gain: 1 }, { inst: 'pad', style: 'sustain', gain: 0.3 }],
      bass: { inst: 'synthBass', style: 'citypop' },
      melody: { insts: ['lead', 'bell'], range: [67, 86], density: 0.55 },
      drums: 'citypop',
      ambience: { beds: ['city'] },
      tone: 14000, wow: 0.5, reverb: { size: 2.0, mix: 0.2 }, humanize: 0.008,
      mix: { drums: 0.9, bass: 0.85, chords: 0.7, melody: 0.7, ambience: 0.45 },
      titles: ['한밤의 드라이브', '플라스틱 러브', '네온 거리', '도시의 불빛', '금요일 밤', '카세트테이프']
    }
  };
  var MOOD_ORDER = ['lofi', 'cozy', 'upbeat', 'chiptune', 'jazz', 'countryside', 'ocean', 'forest', 'ballad', 'citypop'];

  var INST_KO = { epiano: '일렉피아노', piano: '피아노', pad: '패드', pluck: '플럭', bell: '벨', marimba: '마림바', vibes: '비브라폰', flute: '플루트', lead: '신스 리드', pulse: '8비트 리드', chipArp: '8비트 아르페지오', guitar: '어쿠스틱 기타', sub: '서브 베이스', upright: '콘트라베이스', synthBass: '신스 베이스', triBass: '삼각파 베이스' };
  var AMB_KO = { vinyl: 'LP 잡음', rain: '빗소리', breeze: '산들바람', bird: '새소리', city: '도시 소음', crt: '브라운관 험', cafe: '카페 소음', clink: '찻잔 소리', waves: '파도 소리', gull: '갈매기', crickets: '풀벌레', wind: '바람', owl: '부엉이' };

  // ---------------------------------------------------------------- 설정
  function parseKey(k) {
    if (typeof k === 'number' && isFinite(k)) return mod12(Math.round(k));
    if (typeof k === 'string') {
      var s = k.trim(); var name = s.charAt(0).toUpperCase() + s.slice(1);
      var i = NOTE_NAMES.indexOf(name); if (i >= 0) return i;
      if (NOTE_ALIASES[name] != null) return NOTE_ALIASES[name];
      var n = parseInt(s, 10); if (isFinite(n)) return mod12(n);
    }
    return 0;
  }
  function normalize(cfg) {
    cfg = cfg || {};
    var mood = MOODS[cfg.mood] ? cfg.mood : 'lofi';
    var M = MOODS[mood];
    var seed = cfg.seed == null ? 1 : cfg.seed;
    if (typeof seed !== 'number') seed = hashStr(seed);
    seed = Math.abs(Math.floor(seed)) % 2147483647;
    var L = cfg.layers || {};
    function lay(k, d) { return L[k] == null ? d : !!L[k]; }
    var tempo = Number(cfg.tempo);
    if (!isFinite(tempo) || tempo <= 0) tempo = Math.round((M.tempo[0] + M.tempo[1]) / 2);
    var swing = Number(cfg.swing); if (!isFinite(swing)) swing = (M.swing[0] + M.swing[1]) / 2;
    var vol = Number(cfg.volume); if (!isFinite(vol)) vol = 0.8;
    return {
      mood: mood, seed: seed,
      tempo: Math.round(clamp(tempo, 40, 200)),
      key: parseKey(cfg.key == null ? 0 : cfg.key),
      swing: Math.round(clamp(swing, 0, 1) * 100) / 100,
      layers: { drums: lay('drums', M.drums !== 'none'), bass: lay('bass', true), chords: lay('chords', true), melody: lay('melody', true), ambience: lay('ambience', true) },
      volume: clamp(vol, 0, 1),
      title: cfg.title != null ? String(cfg.title).slice(0, 40) : M.titles[seed % M.titles.length]
    };
  }
  function randomConfig(mood, seed) {
    if (!MOODS[mood]) mood = MOOD_ORDER[Math.floor(Math.random() * MOOD_ORDER.length)];
    if (seed == null) seed = Math.floor(Math.random() * 1e9);
    if (typeof seed !== 'number') seed = hashStr(seed);
    seed = Math.abs(Math.floor(seed)) % 2147483647;
    var M = MOODS[mood], r = Rng('cfg:' + mood + ':' + seed);
    return normalize({
      mood: mood, seed: seed,
      tempo: r.int(M.tempo[0], M.tempo[1]),
      key: r.pick(M.keys),
      swing: r.range(M.swing[0], M.swing[1]),
      layers: { drums: M.drums !== 'none', bass: true, chords: true, melody: true, ambience: true },
      volume: 0.8,
      title: r.pick(M.titles)
    });
  }

  // ---------------------------------------------------------------- 작곡 (오디오 없이 이벤트 목록 생성)
  var STEPS = 16, BARS = 16, LOOP = STEPS * BARS; // 16분음표 단위, 8마디 A + 8마디 A'

  function makePlan(cfgIn) {
    var cfg = normalize(cfgIn), M = MOODS[cfg.mood];
    var base = cfg.mood + ':' + cfg.seed;
    var rs = Rng('struct:' + base);
    var prog = rs.pick(M.progs);
    var modePcs = MODES[prog.mode].iv.map(function (x) { return mod12(x + cfg.key); });
    var melModePcs = modePcs;
    if (M.penta) { // 장조 5음계: 4·7음 제거
      var rm = prog.mode === 'minor' || prog.mode === 'dorian' ? [1, 5] : [3, 6];
      melModePcs = modePcs.filter(function (_, i) { return rm.indexOf(i) < 0; });
    }
    var chords = prog.chords.split(' ').map(function (sym) {
      var c = parseChord(sym);
      c.tones = c.iv.map(function (x) { return mod12(cfg.key + c.root + x); });
      c.rootPc = mod12(cfg.key + c.root);
      c.scale = chordScale(melModePcs, c.tones);
      return c;
    });
    var chordInsts = M.chords.map(function (c) { return { inst: c.inst, style: c.style, gain: c.gain }; });
    var melInst = rs.pick(M.melody.insts);
    var amb = { beds: (M.ambience.beds || []).slice(), events: M.ambience.events || {} };
    (M.ambience.maybe || []).forEach(function (mb) { if (rs.chance(mb[1])) amb.beds.push(mb[0]); });

    // 화음 구간(segment)
    var segs = [], prevV = null, bar, maxNotes = 4;
    for (bar = 0; bar < BARS; bar++) {
      var ci = Math.floor((bar % 8) * M.harm) % chords.length;
      var last = segs[segs.length - 1];
      if (last && last.ci === ci && bar % 8 !== 0) { last.bars++; continue; }
      segs.push({ bar: bar, bars: 1, ci: ci, chord: chords[ci] });
    }
    segs.forEach(function (s) {
      s.voicing = voiceChord(s.chord, cfg.key, prevV, 52, 77, maxNotes);
      prevV = s.voicing;
    });
    var barSeg = []; segs.forEach(function (s, i) { for (var b = 0; b < s.bars; b++) barSeg[s.bar + b] = i; });
    segs.forEach(function (s, i) { s.next = segs[(i + 1) % segs.length]; });

    var loops = [mkLoop(), mkLoop()];
    function mkLoop() { var a = new Array(LOOP); for (var i = 0; i < LOOP; i++) a[i] = null; return a; }
    function add(loopIdx, step, ev) {
      var targets = loopIdx == null ? [0, 1] : [loopIdx];
      for (var k = 0; k < targets.length; k++) {
        var L = loops[targets[k]], s = ((step % LOOP) + LOOP) % LOOP;
        (L[s] || (L[s] = [])).push(ev);
      }
    }

    // --- 코드 반주
    var rc = Rng('chords:' + base);
    chordInsts.forEach(function (ch, layerIdx) {
      segs.forEach(function (sg) {
        var V = sg.voicing, st0 = sg.bar * STEPS, len = sg.bars * STEPS, b, s, i;
        var E = function (step, notes, dur, vel, roll) {
          for (var n = 0; n < notes.length; n++) add(null, step, { l: 'chords', i: ch.inst, m: notes[n], d: dur, v: vel * ch.gain, o: roll ? n * roll : 0, g: layerIdx });
        };
        switch (ch.style) {
          case 'sustain': E(st0, V, len - 0.5, 0.6, 0); break;
          case 'lofi':
            for (b = 0; b < sg.bars; b++) {
              s = st0 + b * STEPS;
              E(s, V, 7, 0.62, 0.014);
              if (rc.chance(0.55)) E(s + 10, V, 5, 0.42, 0.01);
            }
            break;
          case 'stabs':
            for (b = 0; b < sg.bars; b++) {
              s = st0 + b * STEPS;
              [2, 6, 10, 14].forEach(function (o, k) { E(s + o, V, 1.4, k % 2 ? 0.55 : 0.62, 0.004); });
              if (rc.chance(0.4)) E(s + 15, V, 1, 0.4, 0.003);
            }
            break;
          case 'arp16':
            var up = V.concat([V[0] + 12]);
            var patt = rc.pick([[0, 1, 2, 3, 4, 3, 2, 1], [0, 2, 1, 3, 2, 4, 3, 1], [0, 1, 2, 4, 0, 1, 2, 4]]);
            for (i = 0; i < len; i++) add(null, st0 + i, { l: 'chords', i: ch.inst, m: up[patt[i % patt.length] % up.length], d: 0.9, v: (i % 4 === 0 ? 0.65 : 0.45) * ch.gain, o: 0, g: layerIdx });
            break;
          case 'arp8':
            var ar = V.concat([V[1] + 12, V[0] + 12]);
            for (i = 0; i < len; i += 2) {
              if (i % 8 !== 0 && rc.chance(0.3)) continue;
              var idx = (i / 2) % ar.length; if (Math.floor(i / 2 / ar.length) % 2) idx = ar.length - 1 - idx;
              add(null, st0 + i, { l: 'chords', i: ch.inst, m: ar[idx], d: 5, v: (i % 8 === 0 ? 0.55 : 0.4) * ch.gain, o: 0, g: layerIdx });
            }
            break;
          case 'strum':
            for (b = 0; b < sg.bars; b++) {
              s = st0 + b * STEPS;
              var pat = [[0, 'D', 0.7], [4, 'D', 0.45], [6, 'U', 0.4], [8, 'D', 0.6], [10, 'U', 0.38], [12, 'D', 0.5], [14, 'U', 0.4]];
              pat.forEach(function (p) {
                if (p[0] === 4 && rc.chance(0.5)) return;
                var notes = p[1] === 'D' ? V.slice() : V.slice(1).reverse();
                E(s + p[0], notes, p[1] === 'D' ? 3.5 : 1.8, p[2], 0.011);
              });
            }
            break;
          case 'charleston':
            for (b = 0; b < sg.bars; b++) {
              s = st0 + b * STEPS;
              var cp = rc.pick([[[0, 2, 0.6], [6, 5, 0.5]], [[0, 3, 0.55], [10, 4, 0.5]], [[4, 2, 0.5], [10, 3, 0.55]], [[0, 6, 0.55], [14, 2, 0.45]]]);
              cp.forEach(function (p) { E(s + p[0], V, p[1], p[2], 0.006); });
            }
            break;
          case 'broken':
            for (b = 0; b < sg.bars; b++) {
              s = st0 + b * STEPS;
              var bp = [0, 1, 2, 3, 2, 1, 2, 1];
              for (i = 0; i < 8; i++) {
                var mi = V[bp[i] % V.length];
                add(null, s + i * 2, { l: 'chords', i: ch.inst, m: mi, d: 5, v: (i === 0 ? 0.55 : i === 4 ? 0.45 : 0.36) * ch.gain, o: 0, g: layerIdx });
              }
            }
            break;
          case 'citypop':
            for (b = 0; b < sg.bars; b++) {
              s = st0 + b * STEPS;
              E(s, V, 3.5, 0.6, 0.005); E(s + 6, V, 1.5, 0.45, 0.004); E(s + 10, V, 3, 0.52, 0.005);
              if (rc.chance(0.4)) E(s + 14, V, 1.5, 0.4, 0.004);
            }
            break;
        }
      });
    });

    // --- 베이스
    var rb = Rng('bass:' + base), BL = cfg.mood === 'upbeat' || cfg.mood === 'chiptune' ? 38 : 36;
    function bassRoot(pc) { return BL + mod12(pc - BL); }
    segs.forEach(function (sg) {
      var R = bassRoot(sg.chord.rootPc), nR = bassRoot(sg.next.chord.rootPc);
      var F = R + 7 > BL + 15 ? R - 5 : R + 7, inst = M.bass.inst, b, s;
      var third = R + (sg.chord.iv[1] != null ? sg.chord.iv[1] : 4);
      function B(step, m, d, v) { add(null, step, { l: 'bass', i: inst, m: m, d: d, v: v, o: 0 }); }
      for (b = 0; b < sg.bars; b++) {
        s = (sg.bar + b) * STEPS;
        var lastBar = b === sg.bars - 1;
        switch (M.bass.style) {
          case 'lofi':
            B(s, R, 6, 0.85);
            B(s + 10, rb.chance(0.4) ? F : R, 3, 0.6);
            if (lastBar && rb.chance(0.5) && nR !== R) B(s + 14, nR + (nR > R ? -2 : 2), 1.8, 0.5);
            break;
          case 'hold': if (b === 0) B(s, R, sg.bars * STEPS - 1, 0.7); break;
          case 'pop':
            for (var e = 0; e < 8; e++) B(s + e * 2, e % 2 ? R + 12 : R, 1.5, e % 2 ? 0.55 : 0.8);
            break;
          case 'chip':
            for (var e2 = 0; e2 < 8; e2++) B(s + e2 * 2, e2 % 2 ? R + 12 : R, 1.7, 0.8);
            break;
          case 'walking':
            var w2 = rb.chance(0.5) ? third : R + 2;
            var w3 = rb.chance(0.6) ? F : third;
            var w4 = lastBar ? nR + (rb.chance(0.5) ? 1 : -1) : (rb.chance(0.5) ? F + 2 : third);
            if (w4 < BL - 2) w4 += 12;
            B(s, R, 3.6, 0.85); B(s + 4, w2, 3.6, 0.65); B(s + 8, w3, 3.6, 0.72); B(s + 12, w4, 3.6, 0.62);
            break;
          case 'country':
            B(s, R, 3.5, 0.85); B(s + 8, F, 3.5, 0.7);
            if (lastBar && nR !== R && rb.chance(0.6)) { B(s + 12, nR + (nR > R ? -2 : 2), 1.8, 0.55); B(s + 14, nR + (nR > R ? -1 : 1), 1.8, 0.55); }
            break;
          case 'ballad':
            B(s, R, 10, 0.8);
            if (rb.chance(0.6)) B(s + 12, rb.chance(0.5) ? F : R, 3.5, 0.55);
            break;
          case 'citypop':
            B(s, R, 2, 0.85); B(s + 3, R + 12, 0.8, 0.55); B(s + 6, R, 1.6, 0.7); B(s + 8, R, 1.2, 0.65);
            B(s + 10, R + 12, 0.8, 0.55); B(s + 11, R, 1, 0.5); B(s + 14, lastBar ? nR + (nR > R ? -1 : 1) : F, 1.5, 0.6);
            break;
        }
      }
    });

    // --- 드럼
    var DS = DRUM_STYLES[M.drums] || DRUM_STYLES.none, rd = Rng('drums:' + base);
    var VEL = { X: 1, x: 0.75, o: 0.5, '-': 0.28 };
    for (bar = 0; bar < BARS; bar++) {
      var rows = {}, k;
      for (k in DS.rows) rows[k] = DS.rows[k];
      if (bar % 8 === 7 && DS.fill) for (k in DS.fill) rows[k] = DS.fill[k];
      for (k in rows) {
        var row = rows[k];
        for (var st = 0; st < 16; st++) {
          var ch2 = row.charAt(st), v = VEL[ch2];
          if (ch2 === 'g') { if (!rd.chance(0.5)) continue; v = 0.25; }
          if (!v) continue;
          add(null, bar * STEPS + st, { l: 'drums', i: k, v: v, o: 0 });
        }
      }
      if (DS.crash && bar % 8 === 0) add(null, bar * STEPS, { l: 'drums', i: M.drums === 'chip' ? 'cnoiseLong' : 'crash', v: 0.6, o: 0 });
    }

    // --- 멜로디 (모티프 리듬 + 윤곽, 강박은 화음 구성음)
    var MR = M.melody.range, center = (MR[0] + MR[1]) / 2;
    var rmBase = Rng('melody:' + base);
    function makeCell(r, density) {
      var on = [], s;
      for (s = 0; s < 32; s++) {
        var w = s % 16 === 0 ? 1 : s % 8 === 0 ? 0.75 : s % 4 === 0 ? 0.5 : s % 2 === 0 ? 0.3 : 0.07;
        var p = s === 0 ? 1 : w * density * 1.5 * (s >= 28 ? 0.25 : 1);
        if (M.tempo[0] < 75 && s % 2) p = 0;
        if (r.f() < p) on.push(s);
      }
      while (on.length < 3) { var add2 = r.int(1, 13) * 2; if (on.indexOf(add2) < 0) on.push(add2); on.sort(function (a, b) { return a - b; }); }
      var notes = on.map(function (s2, i) { var nx = i + 1 < on.length ? on[i + 1] : 32; return { s: s2, d: Math.min(nx - s2, 8) }; });
      var dirs = [], lastD = 0;
      notes.forEach(function (n, i) {
        if (i === 0) { dirs.push(0); return; }
        var d;
        if (Math.abs(lastD) >= 3) d = lastD > 0 ? -1 : 1; // 도약 후 반대 방향으로 순차진행
        else d = r.weighted([-3, -2, -1, 0, 1, 2, 3, 4], [0.4, 1.3, 3, 0.8, 3, 1.3, 0.5, 0.25]);
        dirs.push(d); lastD = d;
      });
      for (var i = 0; i < notes.length; i++) notes[i].dir = dirs[i];
      return notes;
    }
    function mutate(cell, r) {
      var c = cell.map(function (n) { return { s: n.s, d: n.d, dir: n.dir }; });
      var k2 = r.int(1, c.length - 1);
      if (c[k2]) c[k2].dir = r.pick([-2, -1, 1, 2]);
      if (r.chance(0.5) && c.length > 3) { // 음 하나 쪼개거나 합치기
        var j = r.int(1, c.length - 1);
        if (c[j].d >= 4) { var half = Math.floor(c[j].d / 2); c.splice(j + 1, 0, { s: c[j].s + half, d: c[j].d - half, dir: r.pick([-1, 1]) }); c[j].d = half; }
        else if (j > 0) { c[j - 1].d += c[j].d; c.splice(j, 1); }
      }
      return c;
    }
    function cadence(cell) {
      var c = cell.filter(function (n) { return n.s < 14; }).map(function (n) { return { s: n.s, d: Math.min(n.d, 14 - n.s), dir: n.dir }; });
      c.push({ s: 16, d: 12, dir: -1, cad: true });
      return c;
    }
    var cellA = makeCell(rmBase, M.melody.density);
    var cellB = makeCell(rmBase, M.melody.density);
    function realize(loopIdx, cells, secBar, r, finalTonic) {
      var cur = null, prevDir = 0;
      cells.forEach(function (cell, ci2) {
        cell.forEach(function (n) {
          var abs = (secBar + ci2 * 2) * STEPS + n.s, bar2 = Math.floor(abs / STEPS), sinBar = abs % STEPS;
          var ch = segs[barSeg[bar2]].chord;
          var sc = [], tn = [], m;
          for (m = MR[0] - 2; m <= MR[1] + 2; m++) { if (ch.scale.indexOf(mod12(m)) >= 0) sc.push(m); if (ch.tones.indexOf(mod12(m)) >= 0) tn.push(m); }
          var p;
          if (cur == null) {
            p = nearest(tn, center + r.int(-3, 3));
          } else {
            var dir = n.dir;
            if (cur > center + 6 && dir > 0) dir = -dir;
            if (cur < center - 6 && dir < 0) dir = -dir;
            var idx = nearestIdx(sc, cur) + dir;
            if (idx < 0) idx = -idx; if (idx >= sc.length) idx = 2 * (sc.length - 1) - idx;
            p = sc[clamp(idx, 0, sc.length - 1)];
            var strong = sinBar % 8 === 0 || n.d >= 6;
            if (strong && tn.indexOf(p) < 0) p = nearestDir(tn, p, dir || prevDir);
            prevDir = dir;
          }
          if (n.cad) {
            var tgt = finalTonic && ch.tones.indexOf(cfg.key) >= 0 ? cfg.key : ch.rootPc;
            var cands = sc.filter(function (x) { return mod12(x) === tgt; });
            if (!cands.length) cands = tn;
            p = nearest(cands, cur == null ? center : cur);
          }
          p = clamp(p, MR[0] - 2, MR[1] + 2);
          if (cur != null) { // 9도 넘는 도약은 옥타브 이동으로 줄인다 (음이름 유지 → 화음음 성질 유지)
            while (p - cur > 9 && p - 12 >= MR[0] - 2) p -= 12;
            while (cur - p > 9 && p + 12 <= MR[1] + 2) p += 12;
          }
          var dur = n.d;
          if (sinBar + dur > STEPS && bar2 + 1 < BARS) { // 다음 화음과 부딪히는 음은 마디선에서 끊기
            var nch = segs[barSeg[bar2 + 1]].chord;
            if (nch !== ch && nch.tones.indexOf(mod12(p)) < 0) dur = Math.max(1, STEPS - sinBar);
          }
          var vel = 0.62 + (sinBar === 0 ? 0.2 : sinBar % 8 === 0 ? 0.13 : sinBar % 4 === 0 ? 0.06 : -0.04) + r.range(-0.04, 0.04);
          add(loopIdx, abs, { l: 'melody', i: melInst, m: p, d: Math.max(0.8, dur * 0.9), v: clamp(vel, 0.2, 1), o: 0 });
          cur = p;
        });
      });
    }
    function nearestIdx(arr, x) { var bi = 0, bd = 1e9; for (var i = 0; i < arr.length; i++) { var d = Math.abs(arr[i] - x); if (d < bd) { bd = d; bi = i; } } return bi; }
    function nearest(arr, x) { return arr[nearestIdx(arr, x)]; }
    function nearestDir(arr, x, dir) {
      var best = null, bd = 1e9;
      for (var i = 0; i < arr.length; i++) { var d = arr[i] - x; var ad = Math.abs(d) + (dir && d * dir < 0 ? 0.5 : 0); if (ad < bd) { bd = ad; best = arr[i]; } }
      return best;
    }
    // 변주 0: A A' A 종지 | A A'' A' 으뜸음 종지,  변주 1: B 셀이 들어간 새 버전
    var r0 = Rng('mel0:' + base), r1 = Rng('mel1:' + base);
    var A2 = mutate(cellA, r0), A3 = mutate(cellA, r0);
    realize(0, [cellA, A2, cellA, cadence(cellA)], 0, r0, false);
    realize(0, [cellA, A3, A2, cadence(A2)], 8, r0, true);
    var B2 = mutate(cellB, r1);
    realize(1, [cellA, cellB, cellA, cadence(cellB)], 0, r1, false);
    realize(1, [cellB, B2, cellA, cadence(cellA)], 8, r1, true);

    // --- 앰비언스 이벤트 (새, 부엉이, 갈매기, 찻잔)
    var ra = Rng('amb:' + base), loopSec = LOOP * 60 / cfg.tempo / 4;
    Object.keys(amb.events).forEach(function (type) {
      var n = Math.max(1, Math.round(amb.events[type] * loopSec / 10));
      for (var i = 0; i < n; i++) {
        var step = ra.int(0, LOOP - 1);
        add(null, step, { l: 'ambience', i: type, v: ra.range(0.5, 1), o: 0, p: { pan: ra.range(-0.8, 0.8), a: ra.f(), b: ra.f(), n: ra.int(2, 5) } });
      }
    });

    return {
      cfg: cfg, mood: M, prog: prog, modeKo: MODES[prog.mode].ko, chords: chords, segs: segs,
      chordInsts: chordInsts, melInst: melInst, bassInst: M.bass.inst, amb: amb, loops: loops,
      stepDur: 60 / cfg.tempo / 4
    };
  }

  function describe(config) {
    var cfg = normalize(config), p;
    try { p = makePlan(cfg); } catch (e) { return MOODS[cfg.mood].name; }
    var parts = [];
    var L = cfg.layers;
    if (L.drums && p.mood.drums !== 'none') parts.push('드럼');
    if (L.bass) parts.push('베이스');
    if (L.chords) parts.push(p.chordInsts.map(function (c) { return INST_KO[c.inst] || c.inst; }).join('+'));
    if (L.melody) parts.push(INST_KO[p.melInst] + ' 멜로디');
    var amb = p.amb.beds.concat(Object.keys(p.amb.events)).map(function (a) { return AMB_KO[a] || a; });
    var s = p.mood.name + ' · ' + cfg.tempo + 'BPM · ' + NOTE_NAMES[cfg.key] + ' ' + p.modeKo;
    if (cfg.swing >= 0.3) s += ' · 스윙 ' + Math.round(cfg.swing * 100) + '%';
    if (parts.length) s += ' · ' + parts.join('·');
    if (L.ambience && amb.length) s += ' · ' + amb.join('+');
    return s;
  }

  // ---------------------------------------------------------------- 오디오 공용 자원 (컨텍스트별 캐시)
  function resources(ctx) {
    if (ctx.__musicRes) return ctx.__musicRes;
    var R = { waves: {}, bufs: {} };
    function wave(real, imag) { return ctx.createPeriodicWave(new Float32Array(real), new Float32Array(imag)); }
    function pulse(duty) {
      var N = 40, re = [0], im = [0];
      for (var n = 1; n < N; n++) { re.push(Math.sin(2 * Math.PI * n * duty) / (Math.PI * n)); im.push((1 - Math.cos(2 * Math.PI * n * duty)) / (Math.PI * n)); }
      return wave(re, im);
    }
    function harm(amps) { var re = [0], im = [0]; amps.forEach(function (a) { re.push(0); im.push(a); }); return wave(re, im); }
    R.waves.pulse25 = pulse(0.25);
    R.waves.pulse12 = pulse(0.125);
    R.waves.warm = harm([1, 0.35, 0.12, 0.05]);
    R.waves.upright = harm([1, 0.55, 0.25, 0.12, 0.06]);
    R.waves.flute = harm([1, 0.18, 0.06, 0.02]);
    R.noise = makeBuffer(ctx, 1, 4, ctx.sampleRate, 'noise', function (d, sr, r) { for (var i = 0; i < d[0].length; i++) d[0][i] = r() * 2 - 1; });
    ctx.__musicRes = R;
    return R;
  }
  function makeBuffer(ctx, ch, sec, sr, seedStr, fill) {
    var b = ctx.createBuffer(ch, Math.max(1, Math.floor(sec * sr)), sr), d = [];
    for (var c = 0; c < ch; c++) d.push(b.getChannelData(c));
    fill(d, sr, mulberry32(hashStr(seedStr)));
    return b;
  }
  function cachedBuf(ctx, name, fn) {
    var R = resources(ctx);
    if (!R.bufs[name]) R.bufs[name] = fn();
    return R.bufs[name];
  }
  function impulse(ctx, size) {
    var key = 'ir' + size.toFixed(1);
    return cachedBuf(ctx, key, function () {
      var sr = ctx.sampleRate;
      return makeBuffer(ctx, 2, size, sr, key, function (d, sr2, r) {
        var n = d[0].length, k = 6.9 / size;
        for (var c = 0; c < 2; c++) {
          var lp = 0, x = d[c];
          for (var i = 0; i < n; i++) {
            var t = i / sr2, damp = 0.6 - 0.5 * Math.min(1, t / size); // 시간이 지날수록 어두워짐
            lp += (r() * 2 - 1 - lp) * damp;
            var pre = t < 0.012 ? t / 0.012 : 1;
            x[i] = lp * Math.exp(-k * t) * pre * 0.5;
          }
        }
      });
    });
  }

  // ---------------------------------------------------------------- 악기 (오실레이터·노이즈·FM·엔벨로프)
  function envGain(ctx, t, a, peak, decTC, sus, d, relTC) {
    var g = ctx.createGain(), p = g.gain;
    p.setValueAtTime(0, t);
    p.linearRampToValueAtTime(peak, t + a);
    if (sus < 1) p.setTargetAtTime(peak * sus, t + a, decTC);
    var tr = Math.max(t + d, t + a + 0.005);
    p.setTargetAtTime(0, tr, relTC);
    g._end = tr + relTC * 6;
    return g;
  }
  function osc(ctx, type, f, t, end, R) {
    var o = ctx.createOscillator();
    if (R && R.waves[type]) o.setPeriodicWave(R.waves[type]); else o.type = type;
    o.frequency.setValueAtTime(f, t);
    o.start(t); o.stop(end);
    return o;
  }
  function vibrato(ctx, target, t, end, rate, cents, delay) {
    var l = ctx.createOscillator(), lg = ctx.createGain();
    l.frequency.value = rate;
    lg.gain.setValueAtTime(0, t);
    lg.gain.linearRampToValueAtTime(cents, t + delay + 0.25);
    l.connect(lg); lg.connect(target.detune);
    l.start(t); l.stop(end);
  }
  function noiseSrc(ctx, R, t, end, rate, r) {
    var s = ctx.createBufferSource();
    s.buffer = R.noise; s.playbackRate.value = rate || 1;
    s.start(t, (r == null ? 0.3 : r) * 3.5); s.stop(end);
    return s;
  }
  function filt(ctx, type, f, q) { var b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q != null) b.Q.value = q; return b; }

  var INST = {
    epiano: function (ctx, R, out, t, f, d, v) { // FM 로즈 느낌
      var g = envGain(ctx, t, 0.004, 0.16 * v, 0.9, 0.35, d, 0.18), e = g._end;
      var c = osc(ctx, 'sine', f, t, e), m = osc(ctx, 'sine', f, t, e), mg = ctx.createGain();
      mg.gain.setValueAtTime(f * (0.9 + 1.6 * v), t); mg.gain.setTargetAtTime(f * 0.18, t, 0.22);
      m.connect(mg); mg.connect(c.frequency); c.connect(g); g.connect(out);
      return e;
    },
    piano: function (ctx, R, out, t, f, d, v) {
      var g = envGain(ctx, t, 0.003, 0.15 * v, 0.9, 0.0, d + 0.4, 0.3), e = Math.min(g._end, t + 4);
      var c = osc(ctx, 'sine', f, t, e), m = osc(ctx, 'sine', f * 2, t, e), mg = ctx.createGain();
      mg.gain.setValueAtTime(f * 0.9 * v, t); mg.gain.setTargetAtTime(f * 0.05, t, 0.12);
      m.connect(mg); mg.connect(c.frequency);
      var o2 = osc(ctx, 'triangle', f * 1.002, t, e), g2 = ctx.createGain(); g2.gain.value = 0.35;
      c.connect(g); o2.connect(g2); g2.connect(g); g.connect(out);
      return e;
    },
    pad: function (ctx, R, out, t, f, d, v) {
      var g = envGain(ctx, t, 0.5, 0.055 * v, 1.2, 0.8, d, 0.7), e = g._end;
      var lp = filt(ctx, 'lowpass', 500, 0.6);
      lp.frequency.setValueAtTime(400, t); lp.frequency.linearRampToValueAtTime(1300 + 400 * v, t + 0.9);
      var o1 = osc(ctx, 'sawtooth', f, t, e), o2 = osc(ctx, 'sawtooth', f, t, e);
      o1.detune.value = -9; o2.detune.value = 8;
      o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(out);
      return e;
    },
    pluck: function (ctx, R, out, t, f, d, v) {
      var g = envGain(ctx, t, 0.003, 0.2 * v, 0.22, 0.0, d, 0.08), e = Math.min(g._end, t + 1.5);
      var lp = filt(ctx, 'lowpass', 600, 1.5);
      lp.frequency.setValueAtTime(800 + 2600 * v, t); lp.frequency.setTargetAtTime(500, t, 0.1);
      var o1 = osc(ctx, 'sawtooth', f, t, e), o2 = osc(ctx, 'triangle', f, t, e);
      o1.detune.value = 5;
      o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(out);
      return e;
    },
    bell: function (ctx, R, out, t, f, d, v) { // 오르골/벨 FM
      var g = envGain(ctx, t, 0.002, 0.15 * v, 0.6, 0.0, d + 0.6, 0.4), e = Math.min(g._end, t + 3.5);
      var c = osc(ctx, 'sine', f, t, e), m = osc(ctx, 'sine', f * 4, t, e), mg = ctx.createGain();
      mg.gain.setValueAtTime(f * 1.6 * v, t); mg.gain.setTargetAtTime(f * 0.05, t, 0.12);
      m.connect(mg); mg.connect(c.frequency); c.connect(g); g.connect(out);
      return e;
    },
    marimba: function (ctx, R, out, t, f, d, v) {
      var g = envGain(ctx, t, 0.002, 0.24 * v, 0.22, 0.0, d, 0.12), e = Math.min(g._end, t + 1.4);
      var c = osc(ctx, 'sine', f, t, e), h = osc(ctx, 'sine', f * 4, t, t + 0.12), hg = ctx.createGain();
      hg.gain.setValueAtTime(0.25 * v, t); hg.gain.setTargetAtTime(0, t, 0.025);
      c.connect(g); h.connect(hg); hg.connect(g); g.connect(out);
      return e;
    },
    vibes: function (ctx, R, out, t, f, d, v) {
      var g = envGain(ctx, t, 0.002, 0.2 * v, 0.9, 0.0, d + 0.5, 0.35), e = Math.min(g._end, t + 3.5);
      var c = osc(ctx, 'sine', f, t, e), h = osc(ctx, 'sine', f * 4, t, t + 0.4), hg = ctx.createGain();
      hg.gain.setValueAtTime(0.12 * v, t); hg.gain.setTargetAtTime(0, t, 0.08);
      var trem = ctx.createGain(); trem.gain.value = 1;
      var l = osc(ctx, 'sine', 5.2, t, e), lg = ctx.createGain(); lg.gain.value = 0.18;
      l.connect(lg); lg.connect(trem.gain);
      c.connect(trem); h.connect(hg); hg.connect(trem); trem.connect(g); g.connect(out);
      return e;
    },
    flute: function (ctx, R, out, t, f, d, v) {
      var g = envGain(ctx, t, 0.06, 0.15 * v, 0.4, 0.85, d, 0.1), e = g._end;
      var c = osc(ctx, 'flute', f, t, e, R);
      vibrato(ctx, c, t, e, 5.1, 9, 0.18);
      c.connect(g); g.connect(out);
      var n = noiseSrc(ctx, R, t, t + 0.15, 1, (f % 1)), bp = filt(ctx, 'bandpass', Math.min(f * 2, 8000), 2), ng = ctx.createGain();
      ng.gain.setValueAtTime(0.08 * v, t); ng.gain.setTargetAtTime(0, t + 0.02, 0.03);
      n.connect(bp); bp.connect(ng); ng.connect(out);
      return e;
    },
    lead: function (ctx, R, out, t, f, d, v) {
      var g = envGain(ctx, t, 0.015, 0.1 * v, 0.3, 0.75, d, 0.09), e = g._end;
      var lp = filt(ctx, 'lowpass', 2400, 1.5);
      var o1 = osc(ctx, 'sawtooth', f, t, e), o2 = osc(ctx, 'pulse25', f, t, e, R);
      o2.detune.value = 7;
      vibrato(ctx, o1, t, e, 5.5, 10, 0.2);
      o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(out);
      return e;
    },
    pulse: function (ctx, R, out, t, f, d, v) {
      var g = envGain(ctx, t, 0.002, 0.11 * v, 0.25, 0.65, d * 0.92, 0.02), e = g._end;
      var o = osc(ctx, 'pulse25', f, t, e, R);
      if (d > 0.25) vibrato(ctx, o, t, e, 6, 14, 0.12);
      o.connect(g); g.connect(out);
      return e;
    },
    chipArp: function (ctx, R, out, t, f, d, v) {
      var g = envGain(ctx, t, 0.001, 0.2 * v, 0.06, 0.35, d * 0.8, 0.015), e = g._end;
      var o = osc(ctx, 'pulse12', f, t, e, R); o.connect(g); g.connect(out);
      return e;
    },
    guitar: function (ctx, R, out, t, f, d, v) {
      var g = envGain(ctx, t, 0.002, 0.13 * v, 0.45, 0.0, d, 0.12), e = Math.min(g._end, t + 2.5);
      var lp = filt(ctx, 'lowpass', 800, 1.2);
      lp.frequency.setValueAtTime(1500 + 2500 * v, t); lp.frequency.setTargetAtTime(700, t, 0.08);
      var o1 = osc(ctx, 'sawtooth', f, t, e), o2 = osc(ctx, 'triangle', f * 2, t, e), g2 = ctx.createGain();
      g2.gain.value = 0.3;
      o1.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g); g.connect(out);
      return e;
    },
    sub: function (ctx, R, out, t, f, d, v) {
      var g = envGain(ctx, t, 0.008, 0.28 * v, 0.5, 0.6, d, 0.07), e = g._end;
      var o = osc(ctx, 'warm', f, t, e, R); o.connect(g); g.connect(out);
      return e;
    },
    upright: function (ctx, R, out, t, f, d, v) {
      var g = envGain(ctx, t, 0.006, 0.34 * v, 0.3, 0.35, d, 0.06), e = g._end;
      var lp = filt(ctx, 'lowpass', 900, 0.8);
      lp.frequency.setValueAtTime(1600, t); lp.frequency.setTargetAtTime(600, t, 0.08);
      var o = osc(ctx, 'upright', f, t, e, R); o.connect(lp); lp.connect(g); g.connect(out);
      return e;
    },
    synthBass: function (ctx, R, out, t, f, d, v) {
      var g = envGain(ctx, t, 0.003, 0.2 * v, 0.2, 0.7, d, 0.04), e = g._end;
      var lp = filt(ctx, 'lowpass', 300, 4);
      lp.frequency.setValueAtTime(400 + 1600 * v, t); lp.frequency.setTargetAtTime(280, t, 0.07);
      var o = osc(ctx, 'sawtooth', f, t, e), s = osc(ctx, 'sine', f, t, e), sg = ctx.createGain(); sg.gain.value = 0.8;
      o.connect(lp); lp.connect(g); s.connect(sg); sg.connect(g); g.connect(out);
      return e;
    },
    triBass: function (ctx, R, out, t, f, d, v) {
      var g = envGain(ctx, t, 0.002, 0.26 * v, 0.2, 0.9, d * 0.9, 0.015), e = g._end;
      var o = osc(ctx, 'triangle', f, t, e); o.connect(g); g.connect(out);
      return e;
    }
  };

  // 드럼 (v: 0..1)
  function hit(ctx, R, out, t, v, r, o) { // 노이즈 + 필터 + 감쇠
    var n = noiseSrc(ctx, R, t, t + o.len, o.rate || 1, r), f = filt(ctx, o.type, o.f, o.q), g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(o.amp * v, t + (o.a || 0.001));
    g.gain.setTargetAtTime(0, t + (o.a || 0.001), o.tc);
    n.connect(f); f.connect(g); g.connect(out);
  }
  function tone(ctx, out, t, v, type, f0, f1, sweep, amp, tc, len) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + sweep);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(amp * v, t + 0.002); g.gain.setTargetAtTime(0, t + 0.002, tc);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + len);
  }
  var DRUM = {
    kick: function (c, R, o, t, v, r) { tone(c, o, t, v, 'sine', 150, 45, 0.11, 0.95, 0.09, 0.55); },
    snare: function (c, R, o, t, v, r) { hit(c, R, o, t, v, r, { type: 'highpass', f: 1400, q: 0.7, amp: 0.45, tc: 0.055, len: 0.35 }); tone(c, o, t, v, 'triangle', 210, 160, 0.05, 0.35, 0.035, 0.2); },
    clap: function (c, R, o, t, v, r) {
      for (var i = 0; i < 3; i++) hit(c, R, o, t + i * 0.011, v * (i === 2 ? 1 : 0.6), r + i * 0.1, { type: 'bandpass', f: 1300, q: 1.1, amp: 0.6, tc: i === 2 ? 0.07 : 0.006, len: 0.4 });
    },
    hat: function (c, R, o, t, v, r) { hit(c, R, o, t, v, r, { type: 'highpass', f: 7500, q: 0.7, amp: 0.22, tc: 0.016, len: 0.12 }); },
    ohat: function (c, R, o, t, v, r) { hit(c, R, o, t, v, r, { type: 'highpass', f: 6500, q: 0.7, amp: 0.16, tc: 0.08, len: 0.5 }); },
    phat: function (c, R, o, t, v, r) { hit(c, R, o, t, v, r, { type: 'bandpass', f: 7000, q: 1, amp: 0.15, tc: 0.02, len: 0.12 }); },
    rim: function (c, R, o, t, v, r) { tone(c, o, t, v, 'triangle', 1700, 1500, 0.01, 0.22, 0.012, 0.08); hit(c, R, o, t, v, r, { type: 'bandpass', f: 2500, q: 2, amp: 0.25, tc: 0.012, len: 0.08 }); },
    shaker: function (c, R, o, t, v, r) { hit(c, R, o, t, v, r, { type: 'bandpass', f: 5500, q: 1.2, amp: 0.2, a: 0.012, tc: 0.03, len: 0.2 }); },
    brush: function (c, R, o, t, v, r) { hit(c, R, o, t, v, r, { type: 'bandpass', f: 2800, q: 0.6, amp: 0.25, a: 0.01, tc: 0.07, len: 0.4 }); },
    ride: function (c, R, o, t, v, r) { hit(c, R, o, t, v, r, { type: 'highpass', f: 5200, q: 0.8, amp: 0.14, tc: 0.22, len: 1.2 }); tone(c, o, t, v, 'sine', 3700, 3650, 0.2, 0.025, 0.25, 1.2); },
    crash: function (c, R, o, t, v, r) { hit(c, R, o, t, v, r, { type: 'highpass', f: 4200, q: 0.6, amp: 0.18, a: 0.003, tc: 0.45, len: 2.5 }); },
    ckick: function (c, R, o, t, v, r) { tone(c, o, t, v, 'square', 200, 50, 0.07, 0.22, 0.05, 0.25); },
    cnoise: function (c, R, o, t, v, r) { hit(c, R, o, t, v, r, { type: 'highpass', f: 900, q: 0.5, amp: 0.32, tc: 0.06, len: 0.3, rate: 0.35 }); },
    cnoiseLong: function (c, R, o, t, v, r) { hit(c, R, o, t, v, r, { type: 'highpass', f: 2000, q: 0.5, amp: 0.15, tc: 0.35, len: 1.8, rate: 0.5 }); },
    chat: function (c, R, o, t, v, r) { hit(c, R, o, t, v, r, { type: 'highpass', f: 8000, q: 0.5, amp: 0.16, tc: 0.012, len: 0.08, rate: 0.7 }); }
  };

  // 앰비언스 원샷 이벤트
  function panned(ctx, out, pan) {
    if (ctx.createStereoPanner) { var p = ctx.createStereoPanner(); p.pan.value = pan; p.connect(out); return p; }
    return out;
  }
  var AMB_EV = {
    bird: function (ctx, R, out, t, v, p) {
      var dst = panned(ctx, out, p.pan), o = ctx.createOscillator(), g = ctx.createGain(), f0 = 2600 + p.a * 1600, n = p.n, sp = 0.09 + p.b * 0.06;
      o.type = 'sine'; g.gain.setValueAtTime(0, t);
      for (var i = 0; i < n; i++) {
        var ti = t + i * sp, fi = f0 * (1 + (i % 2) * 0.12 * (p.b - 0.5));
        o.frequency.setValueAtTime(fi, ti); o.frequency.linearRampToValueAtTime(fi * 1.45, ti + 0.035); o.frequency.linearRampToValueAtTime(fi * 0.92, ti + sp * 0.8);
        g.gain.setValueAtTime(0, ti); g.gain.linearRampToValueAtTime(0.05 * v, ti + 0.012); g.gain.linearRampToValueAtTime(0, ti + sp * 0.75);
      }
      o.connect(g); g.connect(dst); o.start(t); o.stop(t + n * sp + 0.1);
    },
    owl: function (ctx, R, out, t, v, p) {
      var dst = panned(ctx, out, p.pan), o = ctx.createOscillator(), g = ctx.createGain(), f = 340 + p.a * 60;
      o.type = 'sine'; o.frequency.setValueAtTime(f, t);
      var times = [[0, 0.35], [0.55, 0.18], [0.8, 0.5]];
      g.gain.setValueAtTime(0, t);
      times.forEach(function (x) {
        var a = t + x[0];
        o.frequency.setValueAtTime(f * 1.04, a); o.frequency.linearRampToValueAtTime(f * 0.94, a + x[1]);
        g.gain.setValueAtTime(0, a); g.gain.linearRampToValueAtTime(0.07 * v, a + 0.05); g.gain.linearRampToValueAtTime(0, a + x[1]);
      });
      var lp = filt(ctx, 'lowpass', 900, 0.5);
      o.connect(g); g.connect(lp); lp.connect(dst); o.start(t); o.stop(t + 1.5);
    },
    gull: function (ctx, R, out, t, v, p) {
      var dst = panned(ctx, out, p.pan), o = ctx.createOscillator(), g = ctx.createGain(), f = 1300 + p.a * 400;
      o.type = 'triangle';
      for (var i = 0; i < Math.min(p.n, 3); i++) {
        var a = t + i * 0.42;
        o.frequency.setValueAtTime(f, a); o.frequency.linearRampToValueAtTime(f * 1.35, a + 0.08); o.frequency.linearRampToValueAtTime(f * 0.8, a + 0.32);
        g.gain.setValueAtTime(0, a); g.gain.linearRampToValueAtTime(0.025 * v, a + 0.05); g.gain.linearRampToValueAtTime(0, a + 0.34);
      }
      var bp = filt(ctx, 'bandpass', 1600, 0.8);
      o.connect(bp); bp.connect(g); g.connect(dst); o.start(t); o.stop(t + 1.5);
    },
    clink: function (ctx, R, out, t, v, p) {
      var dst = panned(ctx, out, p.pan), f = 2900 + p.a * 1500;
      [1, 2.76].forEach(function (k, i) {
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.value = f * k; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime((i ? 0.006 : 0.012) * v, t + 0.002); g.gain.setTargetAtTime(0, t + 0.002, 0.09);
        o.connect(g); g.connect(dst); o.start(t); o.stop(t + 0.6);
      });
    }
  };

  // 앰비언스 배경(루프)
  function lfo(ctx, rate, depth, target, t) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = rate; g.gain.value = depth; o.connect(g); g.connect(target); o.start(t);
    return o;
  }
  function loopSrc(ctx, buf, t, rate) { var s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; if (rate) s.playbackRate.value = rate; s.start(t); return s; }
  var BEDS = {
    vinyl: function (ctx, R, out, t) {
      var buf = cachedBuf(ctx, 'vinyl', function () {
        return makeBuffer(ctx, 1, 5, 22050, 'vinyl', function (d, sr, r) {
          var x = d[0], lp = 0;
          for (var i = 0; i < x.length; i++) { lp += (r() * 2 - 1 - lp) * 0.3; x[i] = lp * 0.035; }
          var pops = Math.floor(5 * 9);
          for (var k = 0; k < pops; k++) {
            var at = Math.floor(r() * (x.length - 40)), amp = (r() < 0.1 ? 0.6 : 0.18) * (0.4 + r() * 0.6) * (r() < 0.5 ? -1 : 1), len = 2 + Math.floor(r() * 8);
            for (var j = 0; j < len; j++) x[at + j] += amp * Math.exp(-j / (len / 3)) * (j % 2 ? -0.6 : 1);
          }
        });
      });
      var s = loopSrc(ctx, buf, t), hp = filt(ctx, 'highpass', 700, 0.5), g = ctx.createGain(); g.gain.value = 0.9;
      s.connect(hp); hp.connect(g); g.connect(out);
      return [s];
    },
    rain: function (ctx, R, out, t) {
      var buf = cachedBuf(ctx, 'rain', function () {
        return makeBuffer(ctx, 2, 6, 22050, 'rain', function (d, sr, r) {
          for (var c = 0; c < 2; c++) {
            var x = d[c], lp = 0, lp2 = 0;
            for (var i = 0; i < x.length; i++) { lp += (r() * 2 - 1 - lp) * 0.5; lp2 += (lp - lp2) * 0.2; x[i] = (lp - lp2) * 0.25; }
            for (var k = 0; k < 6 * 70; k++) { // 빗방울
              var at = Math.floor(r() * (x.length - 200)), amp = 0.05 + r() * 0.12, ff = 0.2 + r() * 0.5;
              for (var j = 0; j < 120; j++) x[at + j] += amp * Math.exp(-j / 18) * Math.sin(j * ff * 3);
            }
          }
        });
      });
      var s = loopSrc(ctx, buf, t), lp = filt(ctx, 'lowpass', 5500, 0.5), g = ctx.createGain(); g.gain.value = 0.55;
      s.connect(lp); lp.connect(g); g.connect(out);
      return [s];
    },
    waves: function (ctx, R, out, t) {
      var nodes = [];
      [[-0.6, 0.071, 0], [0.6, 0.053, 0.3]].forEach(function (cfg, i) {
        var s = loopSrc(ctx, R.noise, t, 0.97 + i * 0.05), lp = filt(ctx, 'lowpass', 550, 0.4), g = ctx.createGain();
        g.gain.value = 0.22;
        nodes.push(s, lfo(ctx, cfg[1], 0.2, g.gain, t), lfo(ctx, cfg[1], 380, lp.frequency, t), lfo(ctx, cfg[1] * 2.7, 90, lp.frequency, t));
        s.connect(lp); lp.connect(g); g.connect(panned(ctx, out, cfg[0]));
      });
      return nodes;
    },
    crickets: function (ctx, R, out, t) {
      var buf = cachedBuf(ctx, 'crickets', function () {
        return makeBuffer(ctx, 1, 3.3, 22050, 'crickets', function (d, sr, r) {
          var x = d[0], pos = 0;
          while (pos < x.length - sr * 0.4) {
            var f = 4300 + r() * 500, pulses = 3 + Math.floor(r() * 3), amp = 0.08 + r() * 0.12;
            for (var p = 0; p < pulses; p++) {
              var st = pos + Math.floor(p * sr * 0.045);
              for (var j = 0; j < sr * 0.03 && st + j < x.length; j++) { var e = Math.sin(Math.PI * j / (sr * 0.03)); x[st + j] += amp * e * e * Math.sin(2 * Math.PI * f * j / sr); }
            }
            pos += Math.floor(sr * (0.35 + r() * 0.5));
          }
        });
      });
      var nodes = [];
      [[-0.5, 1, 0.5], [0.55, 0.91, 0.35]].forEach(function (c) {
        var s = loopSrc(ctx, buf, t + c[2], c[1]), g = ctx.createGain(); g.gain.value = 0.35;
        s.connect(g); g.connect(panned(ctx, out, c[0])); nodes.push(s);
      });
      return nodes;
    },
    wind: function (ctx, R, out, t) {
      var s = loopSrc(ctx, R.noise, t, 0.9), bp = filt(ctx, 'bandpass', 420, 0.9), g = ctx.createGain(); g.gain.value = 0.12;
      s.connect(bp); bp.connect(g); g.connect(out);
      return [s, lfo(ctx, 0.06, 0.08, g.gain, t), lfo(ctx, 0.045, 160, bp.frequency, t)];
    },
    breeze: function (ctx, R, out, t) {
      var s = loopSrc(ctx, R.noise, t, 1.03), bp = filt(ctx, 'bandpass', 900, 0.6), g = ctx.createGain(); g.gain.value = 0.05;
      s.connect(bp); bp.connect(g); g.connect(out);
      return [s, lfo(ctx, 0.08, 0.03, g.gain, t), lfo(ctx, 0.05, 300, bp.frequency, t)];
    },
    city: function (ctx, R, out, t) {
      var s = loopSrc(ctx, R.noise, t, 0.6), lp = filt(ctx, 'lowpass', 260, 0.5), g = ctx.createGain(); g.gain.value = 0.3;
      s.connect(lp); lp.connect(g); g.connect(out);
      return [s, lfo(ctx, 0.07, 0.12, g.gain, t)];
    },
    crt: function (ctx, R, out, t) {
      var o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = 60; g.gain.value = 0.02;
      var s = loopSrc(ctx, R.noise, t, 1), hp = filt(ctx, 'highpass', 6000, 0.5), ng = ctx.createGain(); ng.gain.value = 0.012;
      o.connect(g); g.connect(out); s.connect(hp); hp.connect(ng); ng.connect(out); o.start(t);
      return [o, s];
    },
    cafe: function (ctx, R, out, t) { // 웅성거림: 말소리 대역 노이즈를 빠르게 흔든다
      var nodes = [];
      [[-0.5, 3.1, 650], [0.5, 4.3, 900]].forEach(function (c, i) {
        var s = loopSrc(ctx, R.noise, t, 1 + i * 0.07), bp = filt(ctx, 'bandpass', c[2], 2.2), g = ctx.createGain(); g.gain.value = 0.11;
        nodes.push(s, lfo(ctx, c[1], 220, bp.frequency, t), lfo(ctx, c[1] * 0.37, 0.05, g.gain, t));
        s.connect(bp); bp.connect(g); g.connect(panned(ctx, out, c[0]));
      });
      return nodes;
    }
  };

  // ---------------------------------------------------------------- 마스터 버스 & 노래 재생
  function makeMaster(ctx, vol) {
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.006; comp.release.value = 0.25;
    var shaper = ctx.createWaveShaper(), N = 2048, curve = new Float32Array(N);
    for (var i = 0; i < N; i++) { // 0.6까지는 선형, 그 위로 부드럽게 눌러서 최대 ±0.9
      var x = i / (N - 1) * 2 - 1, a = Math.abs(x);
      curve[i] = a < 0.6 ? x : (x < 0 ? -1 : 1) * (0.6 + 0.4 * Math.tanh((a - 0.6) / 0.4) * 0.75);
    }
    shaper.curve = curve;
    var trim = ctx.createGain(); trim.gain.value = 0.7;
    var out = ctx.createGain(); out.gain.value = vol;
    trim.connect(comp); comp.connect(shaper); shaper.connect(out); out.connect(ctx.destination);
    return { input: trim, out: out, comp: comp };
  }

  var LAYER_GAIN = { drums: 1, bass: 0.85, chords: 1, melody: 2.2, ambience: 1.5 };
  function Song(ctx, master, plan, realtime) {
    var cfg = plan.cfg, M = plan.mood, self = this;
    this.ctx = ctx; this.plan = plan; this.cfg = cfg; this.realtime = realtime;
    this.R = resources(ctx); this.step = 0; this.t0 = 0; this.alive = true; this.voices = []; this.beds = [];
    this.out = ctx.createGain(); this.out.gain.value = 0;
    this.out.connect(master.input);
    var music = ctx.createGain(), toneNode = music;
    if (M.tone) { var lp = filt(ctx, 'lowpass', M.tone, 0.5); music.connect(lp); toneNode = lp; }
    if (M.wow) { // 테이프 워블: 짧은 딜레이 시간을 느리게 흔들어 음정을 살짝 출렁이게
      var dl = ctx.createDelay(0.05); dl.delayTime.value = 0.012;
      var wl = ctx.createOscillator(), wg = ctx.createGain(); wl.frequency.value = 0.55; wg.gain.value = 0.0011 * M.wow;
      wl.connect(wg); wg.connect(dl.delayTime); wl.start();
      toneNode.connect(dl); toneNode = dl; this.beds.push(wl);
    }
    toneNode.connect(this.out);
    var conv = ctx.createConvolver(); conv.buffer = impulse(ctx, M.reverb.size);
    var revG = ctx.createGain(); revG.gain.value = M.reverb.mix * 2.2;
    conv.connect(revG); revG.connect(music);
    var sends = { drums: 0.25, bass: 0.05, chords: 1, melody: 0.9 };
    this.bus = {};
    ['drums', 'bass', 'chords', 'melody'].forEach(function (k) {
      var b = ctx.createGain(); b.gain.value = cfg.layers[k] ? M.mix[k] * LAYER_GAIN[k] : 0;
      var sg = ctx.createGain(); sg.gain.value = sends[k] * 0.5;
      b.connect(music); b.connect(sg); sg.connect(conv);
      self.bus[k] = b;
    });
    var ab = ctx.createGain(); ab.gain.value = cfg.layers.ambience ? M.mix.ambience * LAYER_GAIN.ambience : 0; ab.connect(this.out);
    var as = ctx.createGain(); as.gain.value = 0.3; ab.connect(as); as.connect(conv);
    this.bus.ambience = ab;
  }
  Song.prototype.start = function (t0, fade) {
    var ctx = this.ctx, self = this;
    this.t0 = t0;
    var g = this.out.gain, vol = this.cfg.volume;
    g.cancelScheduledValues(t0); g.setValueAtTime(0, t0); g.linearRampToValueAtTime(vol, t0 + fade);
    this.plan.amb.beds.forEach(function (b) { if (BEDS[b]) self.beds = self.beds.concat(BEDS[b](ctx, self.R, self.bus.ambience, t0)); });
  };
  Song.prototype.setLayers = function (layers, volume) {
    var M = this.plan.mood, t = this.ctx.currentTime, self = this;
    ['drums', 'bass', 'chords', 'melody', 'ambience'].forEach(function (k) {
      self.cfg.layers[k] = !!layers[k];
      self.bus[k].gain.setTargetAtTime(layers[k] ? M.mix[k] * LAYER_GAIN[k] : 0, t, 0.15);
    });
    if (volume != null) { this.cfg.volume = volume; this.out.gain.cancelScheduledValues(t); this.out.gain.setTargetAtTime(volume, t, 0.15); }
  };
  var MAX_VOICES = 26;
  Song.prototype.scheduleUntil = function (tEnd) {
    var sd = this.plan.stepDur;
    while (this.alive) {
      var t = this.t0 + this.step * sd;
      if (t >= tEnd) break;
      if (!(this.realtime && t < this.ctx.currentTime - 0.05)) this.scheduleStep(this.step, t);
      this.step++;
    }
  };
  Song.prototype.scheduleStep = function (gs, t) {
    var P = this.plan, cfg = this.cfg, M = P.mood, ctx = this.ctx, R = this.R;
    var loopIdx = Math.floor(gs / LOOP), s = gs % LOOP, evs = P.loops[loopIdx % 2][s];
    if (!evs) return;
    var su = M.swingUnit || 1, sd = P.stepDur;
    var swingOfs = (s % (2 * su) === su) ? cfg.swing * su * sd / 3 : 0;
    var vs = this.voices;
    while (vs.length && vs[0] < t) vs.shift();
    for (var i = 0; i < evs.length; i++) {
      var ev = evs[i];
      if (!cfg.layers[ev.l]) continue;
      if (ev.l === 'melody' && ((loopIdx === 0 && s < STEPS) || (loopIdx % 4 === 3 && s < LOOP / 2))) continue; // 인트로/브레이크다운
      var h = hashInts(cfg.seed, gs, i), h2 = hashInts(gs, i, cfg.seed + 7);
      var hum = M.humanize * (ev.l === 'drums' ? 0.35 : 1);
      var tt = t + swingOfs + ev.o + h * hum;
      var vel = clamp(ev.v * (1 + (h2 - 0.5) * 0.16), 0.05, 1);
      var dest = this.bus[ev.l];
      if (ev.l === 'drums') { if (DRUM[ev.i]) DRUM[ev.i](ctx, R, dest, tt, vel, h2); continue; }
      if (ev.l === 'ambience') { if (AMB_EV[ev.i]) AMB_EV[ev.i](ctx, R, dest, tt, vel, ev.p); continue; }
      if (vs.length >= MAX_VOICES && (ev.l === 'chords')) continue; // 동시 발음 수 제한 (모바일)
      var fn = INST[ev.i]; if (!fn) continue;
      var end = fn(ctx, R, dest, tt, mtof(ev.m), ev.d * sd, vel);
      // 끝나는 시각 순서로 삽입
      var j = vs.length; while (j > 0 && vs[j - 1] > end) j--; vs.splice(j, 0, end);
    }
  };
  Song.prototype.stop = function (fade) {
    var ctx = this.ctx, t = ctx.currentTime, self = this;
    if (!this.alive) return;
    this.alive = false;
    fade = fade == null ? 1 : fade;
    var g = this.out.gain;
    try { g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0, t + fade); } catch (e) { }
    setTimeout(function () {
      self.beds.forEach(function (n) { try { n.stop(); } catch (e) { } });
      try { self.out.disconnect(); } catch (e) { }
    }, (fade + 0.4) * 1000);
  };

  // ---------------------------------------------------------------- 공개 API
  var ctx = null, master = null, current = null, timer = null, masterVol = 0.8;
  function ensureCtx() {
    if (!AC) return null;
    if (ctx) return ctx;
    try {
      ctx = new AC({ latencyHint: 'playback' });
    } catch (e) { try { ctx = new AC(); } catch (e2) { ctx = null; return null; } }
    master = makeMaster(ctx, masterVol);
    return ctx;
  }
  function tick() {
    if (!current || !current.alive || !ctx) return;
    var hidden = typeof document !== 'undefined' && document.hidden;
    try { current.scheduleUntil(ctx.currentTime + (hidden ? 1.5 : 0.2)); } catch (e) { if (root.console) console.warn('Music tick', e); }
  }
  function sameCore(a, b) { return a.mood === b.mood && a.seed === b.seed && a.tempo === b.tempo && a.key === b.key && a.swing === b.swing; }

  var Music = {
    version: 1,
    MOODS: MOODS,
    MOOD_ORDER: MOOD_ORDER,
    KEYS: NOTE_NAMES.slice(),
    available: !!AC,
    moods: function () { return MOOD_ORDER.map(function (id) { return { id: id, name: MOODS[id].name, desc: MOODS[id].desc, tempo: MOODS[id].tempo.slice() }; }); },
    normalize: normalize,
    randomConfig: randomConfig,
    describe: describe,
    plan: function (cfg) { return makePlan(cfg); },
    unlock: function () {
      try {
        var c = ensureCtx(); if (!c) return Promise.resolve(false);
        var b = c.createBuffer(1, 1, 22050), s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(0);
        if (c.state !== 'running' && c.resume) return c.resume().then(function () { return true; }, function () { return false; });
        return Promise.resolve(true);
      } catch (e) { return Promise.resolve(false); }
    },
    play: function (config) {
      try {
        var c = ensureCtx(); if (!c) return false;
        if (c.state === 'suspended' && c.resume) c.resume().catch(function () { });
        var cfg = normalize(config);
        if (current && current.alive && sameCore(current.cfg, cfg)) { // 레이어/볼륨만 바뀜 → 끊김 없이 적용
          current.setLayers(cfg.layers, cfg.volume); current.cfg.title = cfg.title;
          return true;
        }
        var switching = !!(current && current.alive);
        if (current) current.stop(1.2);
        var song = new Song(c, master, makePlan(cfg), true);
        song.start(c.currentTime + 0.08, switching ? 1.6 : 1.2);
        current = song;
        if (!timer) timer = setInterval(tick, 25);
        tick();
        return true;
      } catch (e) { if (root.console) console.warn('Music.play', e); return false; }
    },
    stop: function (fade) {
      try {
        if (current) current.stop(fade == null ? 1 : fade);
        current = null;
        if (timer) { clearInterval(timer); timer = null; }
      } catch (e) { }
    },
    isPlaying: function () { return !!(current && current.alive); },
    current: function () { return current && current.alive ? JSON.parse(JSON.stringify(current.cfg)) : null; },
    setVolume: function (v) {
      masterVol = clamp(Number(v) || 0, 0, 1);
      try { if (master) master.out.gain.setTargetAtTime(masterVol, ctx.currentTime, 0.05); } catch (e) { }
    },
    getVolume: function () { return masterVol; },
    context: function () { return ctx; },
    renderPreview: function (config, seconds) {
      if (!OAC) return Promise.reject(new Error('OfflineAudioContext 없음'));
      try {
        seconds = clamp(Number(seconds) || 8, 0.5, 300);
        var sr = 44100, oc = new OAC(2, Math.ceil(sr * seconds), sr);
        var m = makeMaster(oc, 1);
        var song = new Song(oc, m, makePlan(config), false);
        song.start(0.02, 0.15);
        // 노드를 한꺼번에 만들면 렌더가 느려지므로(모든 노드가 매 블록 처리됨) suspend로 1초씩 나눠 예약
        var CH = 1;
        if (oc.suspend && seconds > 3 * CH) {
          song.scheduleUntil(2 * CH);
          for (var tq = CH; tq < seconds - CH; tq += CH) (function (tq) {
            oc.suspend(tq).then(function () { song.scheduleUntil(Math.min(seconds, tq + 2 * CH)); oc.resume(); });
          })(tq);
        } else song.scheduleUntil(seconds);
        var g = song.out.gain, fe = Math.max(0.2, seconds - 0.3);
        g.setValueAtTime(song.cfg.volume, fe); g.linearRampToValueAtTime(0, seconds);
        song.beds.forEach(function (n) { try { n.stop(seconds); } catch (e) { } });
        return new Promise(function (resolve, reject) {
          oc.oncomplete = function (e) { resolve(e.renderedBuffer); };
          var p = oc.startRendering();
          if (p && p.then) p.then(resolve, reject);
        });
      } catch (e) { return Promise.reject(e); }
    },
    toWavBlob: function (buf) {
      var nch = buf.numberOfChannels, len = buf.length, sr = buf.sampleRate;
      var ab = new ArrayBuffer(44 + len * nch * 2), dv = new DataView(ab), off = 0;
      function str(s) { for (var i = 0; i < s.length; i++) dv.setUint8(off++, s.charCodeAt(i)); }
      function u32(x) { dv.setUint32(off, x, true); off += 4; }
      function u16(x) { dv.setUint16(off, x, true); off += 2; }
      str('RIFF'); u32(36 + len * nch * 2); str('WAVE'); str('fmt '); u32(16); u16(1); u16(nch); u32(sr); u32(sr * nch * 2); u16(nch * 2); u16(16);
      str('data'); u32(len * nch * 2);
      var chans = []; for (var c = 0; c < nch; c++) chans.push(buf.getChannelData(c));
      for (var i = 0; i < len; i++) for (c = 0; c < nch; c++) { var x = clamp(chans[c][i], -1, 1); dv.setInt16(off, x < 0 ? x * 0x8000 : x * 0x7FFF, true); off += 2; }
      return new Blob([ab], { type: 'audio/wav' });
    }
  };

  root.Music = Music;
})(typeof window !== 'undefined' ? window : this);
