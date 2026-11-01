/* 유튜브 채널 운영 타이쿤 — 게임 엔진 (DOM 없음)
 * 화면(index.html)과 시뮬레이션(sim/simulate.js)이 같은 엔진을 쓴다.
 * 시간 단위: 게임 시간(시간, gh). 실시간 1초 = 게임 2.4시간(1배속, 게임 1일 = 10초).
 */
(function (root) {
  'use strict';

  // ───────────────────────── 밸런스 수치 (전부 여기서 조정) ─────────────────────────
  const CONFIG = {
    realSecPerGameDay: 10,          // 1배속 기준 게임 1일 = 실시간 10초
    speeds: [1, 3, 10],

    startMoney: 300000,
    maxStaminaBase: 100,

    genre: { name: '정보·교육', B: 0.7, adRpm: 3.0, affiliatePerView: 1 },
    // 조회수 공식: V = B × (S0 + reach×S)^exp × (Q/50) × (A/50) × T × R × 썸네일 × 알고리즘배율
    S0: 2000,                       // 신규 채널 기본 노출 (S=0이어도 조회수가 나오게)
    reach: 20,                      // 구독자 1명이 만드는 노출
    subsExp: 0.7,

    // 구독 전환율: base + early × earlyK/(S+earlyK)
    conv: { base: 0.008, qRef: 60, early: 0.04, earlyK: 300, favorBonusAt: 70, favorBonus: 0.003 },

    peakHours: 72,                  // 업로드 후 72시간이 피크
    peakShare: 0.85,                // 피크 구간에 총 기대 조회수의 85%
    tailDailyShare: 0.004,          // 피크 이후 하루에 기대 조회수의 0.4%
    tailTauDays: 60,                // 롱테일 감쇠 (일)

    watchMinBase: 3, watchMinPerQ: 0.06, // 1회 시청 분 = 3 + Q×0.06
    monetize: { subs: 1000, watchHours: 4000 },

    // 제작 단계 (게임 시간, 체력 소모)
    stages: [
      { key: 'plan', name: '기획', hours: 24, stamina: 10 },
      { key: 'shoot', name: '촬영', hours: 36, stamina: 20 },
      { key: 'edit', name: '편집', hours: 36, stamina: 15 },
    ],
    tapHours: 0.6,                  // 화면 탭 1번 = 작업 0.6시간 진척 (체력은 그만큼 소모)
    staminaRegen: { working: 0.3, idle: 1.5, resting: 4 },
    burnout: { hours: 168, favor: -15 },
    outsourceEdit: { cost: 40000, timeMul: 0.7 },
    partTime: { hours: 24, stamina: 15, pay: 70000 },

    qualityBase: 45, qualityMax: 92, qualityRand: 4,

    // 호감도 목표 = base + perQ×품질 + perCtr×(썸네일-1). 업로드마다 목표 쪽으로 rate만큼 이동
    favor: { start: 50, base: 25, perQ: 0.6, perCtr: 40, rate: 0.2, streakBonus: 3, gapDays: 7, gapPerDay: 1, min: 5, max: 100 },

    trends: { count: 3, refreshDays: 6, expireDays: [5, 12], staleMul: 0.6 },
    viral: { q80: 0.04, q70: 0.015, base: 0.005, mul: [5, 20] },
    events: { everyDays: [25, 50], algoEveryDays: 30, algoMul: [0.8, 1.25] },

    offline: { maxRealSec: 7200, efficiency: 0.25 },
  };

  // 아이템 (장비·컴퓨터 부품·공간·강의). 브랜드 슬롯 ID만 다루고 표시 이름은 brands 데이터에서.
  // 효과: q=품질 가산, plan/shoot/edit=해당 단계 시간 감소 비율, thumb/seo=실력 레벨 가산, regen=휴식 회복 가산
  const EQUIP = {
    camera: { group: 'gear', name: '카메라', tiers: [
      { slot: 'cam_phone', price: 0 },
      { slot: 'cam_mirrorless', price: 800000, q: 7, shoot: 0.10 },
      { slot: 'cam_cinema', price: 6000000, q: 14, shoot: 0.15 } ] },
    mic: { group: 'gear', name: '마이크', tiers: [
      { slot: 'mic_builtin', price: 0 },
      { slot: 'mic_usb', price: 150000, q: 5 },
      { slot: 'mic_shotgun', price: 1200000, q: 9 } ] },
    light: { group: 'gear', name: '조명', tiers: [
      { slot: 'light_none', price: 0 },
      { slot: 'light_ring', price: 60000, q: 4 },
      { slot: 'light_3point', price: 700000, q: 7, shoot: 0.05 } ] },
    sw: { group: 'gear', name: '편집 소프트웨어', tiers: [
      { slot: 'sw_free', price: 0 },
      { slot: 'sw_sub', price: 300000, q: 4, edit: 0.10 },
      { slot: 'sw_plugin', price: 2000000, q: 9, edit: 0.20 } ] },

    ram: { group: 'pc', name: '램(RAM)', tiers: [
      { slot: 'ram_8', price: 0 },
      { slot: 'ram_16', price: 80000, edit: 0.10 },
      { slot: 'ram_32', price: 200000, edit: 0.20 },
      { slot: 'ram_64', price: 600000, edit: 0.30 } ] },
    ssd: { group: 'pc', name: '저장장치', tiers: [
      { slot: 'ssd_hdd', price: 0 },
      { slot: 'ssd_sata', price: 70000, plan: 0.05, edit: 0.05 },
      { slot: 'ssd_nvme', price: 180000, plan: 0.10, edit: 0.10 } ] },
    cpu: { group: 'pc', name: 'CPU', tiers: [
      { slot: 'cpu_4', price: 0 },
      { slot: 'cpu_8', price: 350000, edit: 0.10, plan: 0.05 },
      { slot: 'cpu_16', price: 1200000, edit: 0.20, plan: 0.10 } ] },
    gpu: { group: 'pc', name: '그래픽카드', tiers: [
      { slot: 'gpu_igpu', price: 0 },
      { slot: 'gpu_mid', price: 400000, edit: 0.15 },
      { slot: 'gpu_high', price: 1500000, edit: 0.30, q: 2 } ] },

    space: { group: 'space', name: '작업 공간', tiers: [
      { slot: 'space_corner', price: 0 },
      { slot: 'space_curtain', price: 100000, q: 2, shoot: 0.05 },
      { slot: 'space_home', price: 900000, q: 4, shoot: 0.20, regen: 1 },
      { slot: 'space_studio', price: 4000000, q: 6, shoot: 0.30, regen: 2 } ] },

    edu_edit: { group: 'edu', name: '편집 기초 강의', tiers: [
      { slot: 'edu_none', price: 0 }, { slot: 'edu_edit', price: 120000, edit: 0.10, q: 2 } ] },
    edu_thumb: { group: 'edu', name: '썸네일 디자인 강의', tiers: [
      { slot: 'edu_none', price: 0 }, { slot: 'edu_thumb', price: 90000, thumb: 2 } ] },
    edu_plan: { group: 'edu', name: '기획·대본 강의', tiers: [
      { slot: 'edu_none', price: 0 }, { slot: 'edu_plan', price: 150000, plan: 0.20, q: 3 } ] },
    edu_growth: { group: 'edu', name: '유튜브 성장 전략 강의', tiers: [
      { slot: 'edu_none', price: 0 }, { slot: 'edu_growth', price: 300000, seo: 2, thumb: 1 } ] },
    edu_mentor: { group: 'edu', name: '현직 유튜버 1:1 멘토링', tiers: [
      { slot: 'edu_none', price: 0 }, { slot: 'edu_mentor', price: 1500000, q: 4, plan: 0.10, shoot: 0.10, edit: 0.10, thumb: 2 } ] },
  };
  const GROUPS = { gear: '촬영 장비', pc: '컴퓨터 업그레이드', space: '작업 공간', edu: '강의·교육' };

  // 반복 구매 업그레이드 (타이쿤식 돈 쓰는 곳)
  const SKILLS = {
    thumb:   { name: '썸네일 연구', desc: '클릭률 +4%', base: 50000, grow: 1.7, max: 20 },
    seo:     { name: '검색 최적화 공부', desc: '롱테일 조회수 +8%', base: 80000, grow: 1.7, max: 20 },
    script:  { name: '대본 연습', desc: '품질 +1', base: 100000, grow: 1.8, max: 10 },
    fitness: { name: '헬스장 등록', desc: '최대 체력 +10', base: 120000, grow: 1.9, max: 5 },
    speed:   { name: '작업 요령', desc: '제작 시간 -5%', base: 150000, grow: 1.9, max: 8 },
  };

  const ROUTINE_PRICE = 150000;   // 자동 반복 루틴 (게임 머니)

  const TRAITS = {
    editor:   { name: '편집 재능', desc: '제작 시간 -25%, 품질 +10' },
    charisma: { name: '카리스마', desc: '구독 전환율 +20%' },
    planner:  { name: '기획력', desc: '트렌드 카드 4장, 품질 +5' },
  };

  // 모의 결제 상품 (현금, 원). 실제 결제 연동 없음.
  // 원칙: 구독자·게임머니·수익 배율은 팔지 않는다. 게임머니로도 살 수 있는 실물 아이템을 싸게 묶어 준다.
  const PACKS = {
    pc_starter: { name: '입문 PC 업그레이드 팩', price: 1100, once: true,
      desc: '램 16GB + SATA SSD + 편집 소프트웨어 구독',
      give: { equip: { ram: 1, ssd: 1, sw: 1 } } },
    gear_starter: { name: '초보 유튜버 장비 세트', price: 2200, once: true,
      desc: 'USB 마이크 + 링라이트 + 방음 커튼',
      give: { equip: { mic: 1, light: 1, space: 1 } } },
    class_pack: { name: '원데이 클래스 패키지', price: 1100, once: true,
      desc: '편집 기초 강의 + 썸네일 디자인 강의 + 기획·대본 강의',
      give: { equip: { edu_edit: 1, edu_thumb: 1, edu_plan: 1 } } },
    full_set: { name: '크리에이터 풀세트', price: 5500, once: true,
      desc: '미러리스 카메라 + 램 32GB + 보급형 그래픽카드 + 8코어 CPU + 작업 루틴 세팅',
      give: { equip: { camera: 1, ram: 2, gpu: 1, cpu: 1 }, routine: true } },
    studio: { name: '홈 스튜디오 꾸미기', price: 3300, once: true,
      desc: '홈 스튜디오 + 3점 조명 + NVMe SSD',
      give: { equip: { space: 2, light: 2, ssd: 2 } } },
  };
  // 게임 시작 시 고를 수 있는 시작 세트
  const START_SETS = ['free', 'pc_starter', 'gear_starter', 'full_set'];

  // ───────────────────────── 지역과 집 ─────────────────────────
  // 지역: 시작할 곳. 지역 전용 주제(경쟁 낮고 반응 좋음), 지역 이벤트, 생활 조건이 다르다.
  const REGIONS = {
    city: { name: '도시', icon: '🏙️', startMoney: 400000, reachMul: 1.1, partPay: 1.3, sponsorMul: 1.4, editMul: 1, regen: 0, localShare: 0.25,
      desc: '트렌드가 빠르고 협찬이 잘 들어온다. 알바 시급이 높지만 월세가 비싸고 시끄럽다.',
      topics: ['지하철 환승 꿀팁', '성수동 팝업스토어 정리', '청년 월세 지원금', '배달비 아끼는 법', '자취방 구하는 법', '공유 오피스 비교', '야근러 건강 관리', '도심 무료 전시'],
      localT: [1.0, 1.6], events: ['noise', 'popup'] },
    country: { name: '농촌', icon: '🌾', startMoney: 250000, reachMul: 0.9, partPay: 0.85, sponsorMul: 0.8, editMul: 1.1, regen: 1, localShare: 0.4,
      desc: '집값이 거의 들지 않고 조용하다. 시골 콘텐츠는 경쟁이 낮다. 인터넷이 느려 편집이 조금 더디다.',
      topics: ['시골 빈집 수리기', '텃밭 1년 농사 일지', '귀농 지원금 총정리', '5일장 물가 탐방', '농기계 임대 받는 법', '시골 살이 한 달 비용', '토종 씨앗 나눔', '청년 농부 창업'],
      localT: [1.1, 1.7], events: ['harvest', 'internet'] },
    seaside: { name: '바닷가', icon: '🌊', startMoney: 300000, reachMul: 1.0, partPay: 1.0, sponsorMul: 1.0, editMul: 1, regen: 0.5, localShare: 0.35,
      desc: '바다·낚시·캠핑 주제가 강하다. 축제철 대목이 있지만 태풍이 온다.',
      topics: ['물때표 보는 법', '갯벌 체험 명소', '바다낚시 입문 장비', '횟집 시세 읽는 법', '차박 명소 정리', '해수욕장 주차 꿀팁', '서핑 첫 수업', '어촌 한 달 살기'],
      localT: [1.0, 1.8], events: ['typhoon', 'festival'] },
    mountain: { name: '산속', icon: '⛰️', startMoney: 300000, reachMul: 0.95, partPay: 0.85, sponsorMul: 0.9, editMul: 1, regen: 1.5, localShare: 0.45,
      desc: '힐링·캠핑·자연 소리 콘텐츠. 쉬면 체력이 빨리 찬다. 정전과 산짐승 소동이 있다.',
      topics: ['초보 등산 코스', '겨울 캠핑 장비', '야생 버섯 구별법', '계곡 피서지 추천', '산속 자연 소리 8시간', '나무 장작 패기', '산골 한 달 살기', '별 사진 찍는 법'],
      localT: [1.2, 1.8], events: ['blackout', 'wildlife'] },
  };
  // 집: 지역마다 단계가 있다. rent=30일마다 내는 월세, move=이사 비용, unlock=필요 구독자,
  // furnished=들어 있는 가구(장비 단계, 이사 나가면 두고 감), q/regen/shoot/edit=집 자체 효과, size=방 크기(3D)
  const HOUSES = {
    gosiwon:   { region: 'city', name: '고시원', rent: 60000, move: 0, unlock: 0, size: [5, 5], wall: 'plain', floor: 'linoleum', q: -2, regen: -0.5, staff: 0, desc: '좁고 벽이 얇다. 대신 싸다.' },
    oneroom:   { region: 'city', name: '원룸', rent: 120000, move: 100000, unlock: 300, size: [7, 7], wall: 'paper', floor: 'wood', furnished: { light: 1 }, staff: 0, desc: '링라이트가 붙어 있는 신축 원룸.' },
    officetel: { region: 'city', name: '오피스텔', rent: 400000, move: 600000, unlock: 3000, size: [8, 8], wall: 'white', floor: 'wood', furnished: { light: 1, space: 1 }, q: 2, staff: 1, desc: '방음 잘 되는 오피스텔. 책상 하나 더 놓을 수 있다.' },
    office:    { region: 'city', name: '스튜디오 사무실', rent: 1200000, move: 2000000, unlock: 20000, size: [10, 9], wall: 'concrete', floor: 'concrete', furnished: { light: 2, space: 2 }, q: 4, staff: 3, desc: '촬영 스튜디오가 딸린 사무실.' },
    tower:     { region: 'city', name: '강남 사옥', rent: 5000000, move: 8000000, unlock: 200000, size: [12, 10], wall: 'glass', floor: 'tile', furnished: { light: 2, space: 3 }, q: 6, staff: 6, desc: '통유리 사옥. 직원과 함께 일한다.' },

    farmhouse: { region: 'country', name: '시골 빈집', rent: 0, move: 0, unlock: 0, size: [7, 7], wall: 'old', floor: 'old', regen: 0.5, staff: 0, desc: '마을에서 거의 공짜로 내준 빈집. 손볼 데가 많다.' },
    remodel:   { region: 'country', name: '리모델링 농가', rent: 60000, move: 300000, unlock: 1000, size: [8, 8], wall: 'hanok', floor: 'wood', furnished: { space: 1 }, regen: 0.5, staff: 1, desc: '직접 고친 농가. 마루가 넓다.' },
    barn:      { region: 'country', name: '창고 개조 스튜디오', rent: 300000, move: 1500000, unlock: 10000, size: [10, 9], wall: 'barn', floor: 'concrete', furnished: { space: 2, light: 1 }, q: 3, staff: 3, desc: '쌀 창고를 개조한 높은 천장 스튜디오.' },
    estate:    { region: 'country', name: '전원주택 스튜디오', rent: 1500000, move: 6000000, unlock: 100000, size: [12, 10], wall: 'white', floor: 'wood', furnished: { space: 3, light: 2 }, q: 5, regen: 0.5, staff: 6, desc: '마당 딸린 전원주택 전체가 스튜디오.' },

    minbak:    { region: 'seaside', name: '민박 방', rent: 40000, move: 0, unlock: 0, size: [6, 6], wall: 'blue', floor: 'linoleum', q: -1, staff: 0, desc: '할머니가 내준 민박 방 한 칸.' },
    seaview:   { region: 'seaside', name: '바닷가 원룸', rent: 100000, move: 120000, unlock: 500, size: [7, 7], wall: 'white', floor: 'wood', furnished: { light: 1 }, regen: 0.5, staff: 0, desc: '창밖으로 바다가 보이는 원룸.' },
    cafe:      { region: 'seaside', name: '오션뷰 카페 2층', rent: 500000, move: 1200000, unlock: 5000, size: [9, 8], wall: 'blue', floor: 'wood', furnished: { space: 1, light: 1 }, q: 3, staff: 2, desc: '카페 사장님이 빌려준 2층 전체.' },
    beach:     { region: 'seaside', name: '해변 스튜디오', rent: 2000000, move: 6000000, unlock: 50000, size: [12, 10], wall: 'glass', floor: 'tile', furnished: { space: 3, light: 2 }, q: 6, staff: 6, desc: '해변이 바로 앞인 통유리 스튜디오.' },

    attic:     { region: 'mountain', name: '산장 다락방', rent: 20000, move: 0, unlock: 0, size: [6, 6], wall: 'log', floor: 'wood', regen: 0.5, q: -1, staff: 0, desc: '산장 주인이 내준 다락방. 천장이 낮다.' },
    cabin:     { region: 'mountain', name: '통나무집', rent: 80000, move: 250000, unlock: 1000, size: [8, 7], wall: 'log', floor: 'wood', furnished: { space: 1 }, regen: 1, staff: 1, desc: '벽난로가 있는 통나무집.' },
    campstudio:{ region: 'mountain', name: '캠핑장 스튜디오', rent: 400000, move: 1500000, unlock: 10000, size: [10, 8], wall: 'log', floor: 'wood', furnished: { space: 2, light: 1 }, q: 3, regen: 1, staff: 3, desc: '캠핑장 관리동을 통째로 빌렸다.' },
    resort:    { region: 'mountain', name: '산속 리조트 스튜디오', rent: 1800000, move: 6000000, unlock: 100000, size: [12, 10], wall: 'white', floor: 'wood', furnished: { space: 3, light: 2 }, q: 5, regen: 1.5, staff: 6, desc: '숲속 리조트 한 동을 스튜디오로.' },
  };
  const housesOf = region => Object.keys(HOUSES).filter(k => HOUSES[k].region === region);
  const MOVE_DAYS = 3;          // 이사 기간 (업로드 불가)
  const RENT_DAYS = 30;

  const TOPICS = [
    '2026 연말정산 바뀐 점', '청년도약계좌 갈아타기', 'AI로 엑셀 자동화', '전기요금 누진제 피하는 법',
    '실업급여 받는 조건', '중고차 사기 피하는 법', '자동차세 연납 할인', '해외직구 관세 기준',
    '건강보험 피부양자 조건', '전세사기 체크리스트', 'ISA 계좌 활용법', '신용점수 올리는 법',
    '근로장려금 신청', '노트북 배터리 오래 쓰기', '스마트폰 사진 잘 찍기', '파이썬 첫걸음',
    '챗봇으로 공부 계획 짜기', '부업 세금 신고', '퇴직연금 IRP 정리', '알뜰폰 요금제 비교',
    '공공 무료강좌 모음', '자격증 독학 순서', '보이스피싱 최신 수법', '국민연금 추납',
    '주택청약 1순위 조건', '미국 ETF 세금', '숨은 보험금 찾기', '이사 체크리스트',
    '환율 쌀 때 환전법', '정부 지원금 한눈에',
  ];

  // ───────────────────────── 유틸 ─────────────────────────
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  function rnd(s) { return (s && s.rng) ? s.rng() : Math.random(); }
  function rr(s, a, b) { return a + (b - a) * rnd(s); }
  function pick(s, arr) { return arr[Math.floor(rnd(s) * arr.length)]; }
  const ghPerRealSec = () => 24 / CONFIG.realSecPerGameDay;

  function log(s, text, kind) {
    s.log.unshift({ gh: s.gh, text, kind: kind || 'info' });
    if (s.log.length > 120) s.log.length = 120;
    s._toasts.push({ text, kind: kind || 'info' });
  }

  // ───────────────────────── 새 게임 ─────────────────────────
  function newGame(opt) {
    opt = opt || {};
    const region = REGIONS[opt.region] ? opt.region : 'city';
    const house = (HOUSES[opt.house] && HOUSES[opt.house].region === region) ? opt.house : housesOf(region)[0];
    const s = {
      v: 2, region, house, moving: null, nextRentGh: RENT_DAYS * 24, debtDays: 0, channel: opt.channel || '나의 정보 채널', trait: opt.trait || 'planner',
      gh: 0, money: REGIONS[region].startMoney - (HOUSES[house].unlock ? 0 : 0), stamina: CONFIG.maxStaminaBase,
      subs: 0, totalViews: 0, watchHours: 0, favor: CONFIG.favor.start, monetized: false,
      totalIncome: 0,
      equip: Object.fromEntries(Object.keys(EQUIP).map(k => [k, 0])),
      skills: { thumb: 0, seo: 0, script: 0, fitness: 0, speed: 0 },
      trends: [], trendRefreshAt: 0,
      job: null, uploadReady: null,
      videos: [], tailRate: 0, tailQ: 50, videoSeq: 0,
      lastUploadGh: null, streak: 0,
      resting: false, burnoutUntil: 0,
      routine: { unlocked: false, on: false, outsource: false },
      algoMul: 1, nextAlgoGh: CONFIG.events.algoEveryDays * 24,
      nextEventGh: 0,
      pendingEvent: null, nextVideoBoost: null,
      purchases: {}, cashSpent: 0,
      quests: {}, log: [], realSec: 0, _toasts: [],
    };
    if (opt.rng) s.rng = opt.rng;
    s.nextEventGh = rr(s, CONFIG.events.everyDays[0], CONFIG.events.everyDays[1]) * 24;
    refreshTrends(s);
    if (opt.pack && opt.pack !== 'free') applyPack(s, opt.pack);
    log(s, `${REGIONS[region].icon} ${REGIONS[region].name}의 ${HOUSES[house].name}에서 「${s.channel}」 개설! 첫 영상 주제를 골라 보세요.`, 'good');
    return s;
  }

  // ───────────────────────── 파생 수치 ─────────────────────────
  function maxStamina(s) { return CONFIG.maxStaminaBase + s.skills.fitness * 10; }
  // 실제로 쓰는 장비 단계 = 내가 산 것과 집에 딸린 가구 중 좋은 쪽
  function effEquip(s) {
    const f = (HOUSES[s.house] && HOUSES[s.house].furnished) || {};
    const out = {};
    for (const k in EQUIP) out[k] = Math.max(s.equip[k] || 0, f[k] || 0);
    return out;
  }
  // 보유 아이템 + 집 + 지역 효과 합산 (시간 감소는 곱으로)
  function effects(s) {
    const e = { q: 0, plan: 1, shoot: 1, edit: 1, thumb: 0, seo: 0, regen: 0 };
    const eq = effEquip(s);
    const H = HOUSES[s.house] || {}, Rg = REGIONS[s.region] || {};
    e.q += H.q || 0; e.regen += (H.regen || 0) + (Rg.regen || 0);
    if (Rg.editMul) e.edit *= Rg.editMul;
    for (const k in EQUIP) {
      const t = EQUIP[k].tiers[eq[k] || 0];
      if (t.q) e.q += t.q;
      if (t.plan) e.plan *= 1 - t.plan;
      if (t.shoot) e.shoot *= 1 - t.shoot;
      if (t.edit) e.edit *= 1 - t.edit;
      if (t.thumb) e.thumb += t.thumb;
      if (t.seo) e.seo += t.seo;
      if (t.regen) e.regen += t.regen;
    }
    return e;
  }
  function baseQuality(s) {
    let q = CONFIG.qualityBase + effects(s).q + s.skills.script;
    if (s.trait === 'editor') q += 10;
    if (s.trait === 'planner') q += 5;
    return clamp(q, 0, CONFIG.qualityMax);
  }
  function stageHours(s, i) {
    const e = effects(s);
    let h = CONFIG.stages[i].hours * (1 - 0.05 * s.skills.speed) * [e.plan, e.shoot, e.edit][i];
    if (s.trait === 'editor') h *= 0.75;
    if (i === 2 && s.job && s.job.outsource) h *= CONFIG.outsourceEdit.timeMul;
    return h;
  }
  function thumbLv(s) { return s.skills.thumb + effects(s).thumb; }
  function seoLv(s) { return s.skills.seo + effects(s).seo; }
  function stageStaminaPerHour(s, i) {
    if (i === 2 && s.job && s.job.outsource) return 0;
    return CONFIG.stages[i].stamina / stageHours(s, i);
  }
  function convRate(s) {
    const c = CONFIG.conv;
    const q = s._lastQ || baseQuality(s);
    let r = c.base * q / c.qRef + c.early * c.earlyK / (s.subs + c.earlyK);
    if (s.favor >= c.favorBonusAt) r += c.favorBonus;
    if (s.trait === 'charisma') r *= 1.2;
    return r;
  }
  function thumbMul(s) { return 1 + 0.04 * thumbLv(s); }
  function expectedViews(s, T, q) {
    const g = CONFIG.genre;
    const rm = (REGIONS[s.region] || {}).reachMul || 1;
    return g.B * rm * Math.pow(CONFIG.S0 + CONFIG.reach * s.subs, CONFIG.subsExp) * (q / 50) * (s.favor / 50) * T * s.algoMul * thumbMul(s);
  }

  // ───────────────────────── 트렌드 카드 ─────────────────────────
  function makeCard(s) {
    const Rg = REGIONS[s.region];
    if (Rg && rnd(s) < Rg.localShare) {
      const used = new Set(s.trends.map(c => c.topic));
      const pool = Rg.topics.filter(t => !used.has(t));
      if (pool.length) {
        const range = Rg.localT;
        return { id: Math.floor(rnd(s) * 1e9), topic: pick(s, pool), comp: '낮음', local: true, T: rr(s, range[0], range[1]), range,
          expiresGh: s.gh + rr(s, 8, 16) * 24 };
      }
    }
    const comp = pick(s, ['낮음', '보통', '높음']);
    const range = comp === '낮음' ? [0.7, 1.3] : comp === '보통' ? [0.6, 1.7] : [0.5, 2.0];
    const T = rr(s, range[0], range[1]);
    const used = new Set(s.trends.map(c => c.topic));
    let topic = pick(s, TOPICS), guard = 0;
    while (used.has(topic) && guard++ < 20) topic = pick(s, TOPICS);
    return { id: Math.floor(rnd(s) * 1e9), topic, comp, T, range,
      expiresGh: s.gh + rr(s, CONFIG.trends.expireDays[0], CONFIG.trends.expireDays[1]) * 24 };
  }
  function refreshTrends(s) {
    const n = CONFIG.trends.count + (s.trait === 'planner' ? 1 : 0);
    s.trends = [];
    for (let i = 0; i < n; i++) s.trends.push(makeCard(s));
    s.trendRefreshAt = s.gh + CONFIG.trends.refreshDays * 24;
  }
  // 카드에 표시할 예상 조회수 범위
  function cardViewRange(s, card) {
    const q = baseQuality(s);
    return [expectedViews(s, card.range[0], q) * 0.6, expectedViews(s, card.range[1], q) * 1.6];
  }

  // ───────────────────────── 행동 ─────────────────────────
  function canWork(s) { return !s.job && !s.uploadReady && s.gh >= s.burnoutUntil && !s.pendingEvent && !s.moving; }

  function startVideo(s, cardIdx) {
    if (!canWork(s)) return false;
    const card = s.trends[cardIdx];
    if (!card) return false;
    const outsource = s.routine.outsource && s.money >= CONFIG.outsourceEdit.cost;
    if (outsource) s.money -= CONFIG.outsourceEdit.cost;
    s.job = { card, stage: 0, progress: 0, outsource };
    s.trends.splice(cardIdx, 1, makeCard(s));
    s.resting = false;
    return true;
  }

  // 작업 진척 h시간 (탭 또는 시간 경과). 체력 소모 포함.
  function workHours(s, h) {
    const j = s.job;
    if (!j) return;
    while (h > 1e-9 && s.job) {
      const need = stageHours(s, j.stage) * (1 - j.progress);
      const step = Math.min(h, need);
      const cost = stageStaminaPerHour(s, j.stage) * step;
      if (cost > s.stamina) {
        s.stamina = 0;
        triggerBurnout(s);
        return;
      }
      s.stamina -= cost;
      j.progress += step / stageHours(s, j.stage);
      h -= step;
      if (j.progress >= 1 - 1e-9) {
        j.stage++; j.progress = 0;
        if (j.stage >= CONFIG.stages.length) { finishJob(s); return; }
      }
    }
  }
  function tap(s) {
    if (!s.job || s.gh < s.burnoutUntil || s.pendingEvent) return false;
    workHours(s, CONFIG.tapHours);
    return true;
  }
  function triggerBurnout(s) {
    s.burnoutUntil = s.gh + CONFIG.burnout.hours;
    s.favor = clamp(s.favor + CONFIG.burnout.favor, CONFIG.favor.min, CONFIG.favor.max);
    s.resting = true;
    log(s, '번아웃! 7일간 강제 휴식, 알고리즘 호감도 -15', 'bad');
  }

  function makeThumbs(s) {
    // 3안: 실제 클릭률 배율과, 실력에 따라 정확도가 달라지는 예상치
    const noise = Math.max(0.03, 0.18 - 0.01 * thumbLv(s));
    const out = [];
    for (let i = 0; i < 3; i++) {
      const real = rr(s, 0.8, 1.25);
      const shown = clamp(real + rr(s, -noise, noise), 0.6, 1.5);
      out.push({ style: ['강렬한 글씨', '얼굴 클로즈업', '비교 도표'][i], real, shown });
    }
    return out;
  }
  function finishJob(s) {
    const j = s.job;
    s.job = null;
    s.uploadReady = { card: j.card, q: clamp(baseQuality(s) + rr(s, -CONFIG.qualityRand, CONFIG.qualityRand), 0, 100), thumbs: makeThumbs(s) };
    if (!s.routine.on) log(s, `「${j.card.topic}」 편집 완료 — 썸네일을 골라 업로드하세요.`, 'info');
  }

  function upload(s, thumbIdx) {
    const u = s.uploadReady;
    if (!u) return false;
    const th = u.thumbs[thumbIdx] || u.thumbs[0];
    let T = u.card.T;
    if (s.gh > u.card.expiresGh) T *= CONFIG.trends.staleMul;
    if (s.nextVideoBoost) { T *= s.nextVideoBoost; s.nextVideoBoost = null; }
    const R = rr(s, 0.6, 1.6);
    let V = expectedViews(s, T, u.q) * R * th.real;
    // 바이럴
    const vc = CONFIG.viral;
    let pv = u.q >= 80 ? vc.q80 : u.q >= 70 ? vc.q70 : vc.base;
    if (s.viralBoost) { pv *= s.viralBoost; s.viralBoost = 0; }
    let viral = false;
    if (rnd(s) < pv) { V *= rr(s, vc.mul[0], vc.mul[1]); viral = true; }
    const vid = { id: ++s.videoSeq, local: !!u.card.local, topic: u.card.topic, q: u.q, ctr: th.real, V, views: 0, uploadGh: s.gh, income: 0, viral };
    s.videos.unshift(vid);
    if (s.videos.length > 60) s.videos.length = 60;
    s._lastQ = u.q;
    // 알고리즘 호감도 (1단계 임시 규칙: 품질·썸네일·업로드 주기)
    const f = CONFIG.favor;
    if (s.lastUploadGh !== null && s.gh - s.lastUploadGh <= f.gapDays * 24) s.streak++; else s.streak = 1;
    const target = f.base + f.perQ * u.q + f.perCtr * (th.real - 1) + (s.streak >= 4 ? f.streakBonus : 0);
    s.favor = clamp(s.favor + (target - s.favor) * f.rate, f.min, f.max);
    s.lastUploadGh = s.gh;
    s.uploadReady = null;
    s.stats_videos = (s.stats_videos || 0) + 1;
    if (s.stats_videos === 1) s.firstVideoV = V;
    if (viral) {
      log(s, `🔥 「${vid.topic}」 바이럴! 예상 조회수 ${fmt(V)}`, 'good');
      s.pendingEvent = { id: 'viral', title: '바이럴 터짐!', text: `「${vid.topic}」이 추천에 올라탔습니다. 어떻게 할까요?`,
        choices: [ { label: '후속편 바로 준비 (다음 영상 트렌드 ×1.8, 호감도 +5)' }, { label: '평소대로 (협찬 문의 수익 즉시 받기)' } ] };
    } else if (!s.routine.on) {
      log(s, `「${vid.topic}」 업로드 (품질 ${Math.round(u.q)})`, 'info');
    }
    return true;
  }
  function bestThumbIdx(s) {
    const t = s.uploadReady.thumbs;
    let b = 0; for (let i = 1; i < t.length; i++) if (t[i].shown > t[b].shown) b = i;
    return b;
  }
  function bestCardIdx(s) {
    let b = 0, bv = -1;
    s.trends.forEach((c, i) => {
      const daysLeft = (c.expiresGh - s.gh) / 24;
      const mid = (c.range[0] + c.range[1]) / 2 * (daysLeft < 4 ? CONFIG.trends.staleMul : 1);
      if (mid > bv) { bv = mid; b = i; }
    });
    return b;
  }

  function partPay(s) { return Math.round(CONFIG.partTime.pay * ((REGIONS[s.region] || {}).partPay || 1) / 1000) * 1000; }
  function partTime(s) {
    if (!canWork(s) || s.stamina < CONFIG.partTime.stamina) return false;
    s.job = { partTime: true, left: CONFIG.partTime.hours };
    s.stamina -= CONFIG.partTime.stamina;
    return true;
  }

  function equipNext(s, k) { return EQUIP[k].tiers[s.equip[k] + 1] || null; }
  function buyEquip(s, k) {
    const n = equipNext(s, k);
    if (!n || s.money < n.price) return false;
    s.money -= n.price; s.equip[k]++;
    log(s, `${EQUIP[k].name} 구매 완료!`, 'good');
    return true;
  }
  function skillCost(s, k) { const d = SKILLS[k]; return Math.round(d.base * Math.pow(d.grow, s.skills[k]) / 1000) * 1000; }
  function buySkill(s, k) {
    const d = SKILLS[k];
    if (s.skills[k] >= d.max) return false;
    const c = skillCost(s, k);
    if (s.money < c) return false;
    s.money -= c; s.skills[k]++;
    return true;
  }
  function buyRoutine(s) {
    if (s.routine.unlocked || s.money < ROUTINE_PRICE) return false;
    s.money -= ROUTINE_PRICE; s.routine.unlocked = true; s.routine.on = true;
    log(s, '자동 반복 루틴 해금! 이제 놔둬도 영상이 계속 나옵니다.', 'good');
    return true;
  }

  // 이사: 같은 지역 다음 단계 집 또는 다른 지역 집으로. 이사 비용 + 첫 달 월세, 3일간 작업 불가.
  function moveCost(s, id) {
    const H = HOUSES[id];
    return Math.round((H.move + H.rent) * (H.region !== s.region ? 1.5 : 1) + (H.region !== s.region ? 300000 : 0));
  }
  function canMove(s, id) {
    const H = HOUSES[id];
    if (!H || id === s.house || s.moving) return { ok: false, why: '' };
    if (s.job || s.uploadReady) return { ok: false, why: '작업 중에는 이사할 수 없습니다' };
    if (s.subs < H.unlock) return { ok: false, why: `구독자 ${fmt(H.unlock)}명부터` };
    if (s.money < moveCost(s, id)) return { ok: false, why: '돈이 모자랍니다' };
    return { ok: true, why: '' };
  }
  function moveHouse(s, id) {
    if (!canMove(s, id).ok) return false;
    const cost = moveCost(s, id);
    s.money -= cost;
    s.moving = { from: s.house, to: id, fromRegion: s.region, untilGh: s.gh + MOVE_DAYS * 24, startGh: s.gh };
    s.resting = false;
    log(s, `🚚 ${HOUSES[id].name}(으)로 이사 출발! (₩${fmt(cost)}, ${MOVE_DAYS}일)`, 'good');
    return true;
  }
  function finishMove(s) {
    const m = s.moving;
    s.house = m.to; s.region = HOUSES[m.to].region; s.moving = null;
    s.nextRentGh = s.gh + RENT_DAYS * 24;
    if (m.fromRegion !== s.region) refreshTrends(s);
    log(s, `🏠 ${REGIONS[s.region].icon} ${HOUSES[s.house].name} 입주 완료!`, 'good');
  }

  function applyPack(s, id) {
    const p = PACKS[id];
    if (!p) return false;
    if (p.once && s.purchases[id]) return false;
    const g = p.give;
    if (g.equip) for (const k in g.equip) s.equip[k] = Math.max(s.equip[k], g.equip[k]);
    if (g.routine) { s.routine.unlocked = true; s.routine.on = true; }
    s.purchases[id] = (s.purchases[id] || 0) + 1;
    s.cashSpent += p.price;
    log(s, `「${p.name}」 지급 완료 (모의 결제)`, 'good');
    return true;
  }

  // ───────────────────────── 이벤트 ─────────────────────────
  function rollEvent(s) {
    const pool = ['sale', 'gift'];
    const Rg = REGIONS[s.region];
    if (Rg) pool.push(...Rg.events, ...Rg.events);
    if (s.subs >= 300) pool.push('hate', 'hate');
    if (s.subs >= 100) pool.push('sponsor');
    const id = pick(s, pool);
    if (id === 'hate') s.pendingEvent = { id, title: '악플·논란', text: '최근 영상 댓글에 비난이 몰리고 있습니다.',
      choices: [ { label: '사과 영상 (호감도 -5, 확실히 수습)' }, { label: '무시 (50% 확률로 커짐)' }, { label: '법적 대응 (₩500,000)' } ] };
    else if (id === 'sale') s.pendingEvent = { id, title: '장비 할인 세일', text: '전자상가 세일! 다음 장비 하나를 30% 싸게 살 수 있습니다.',
      choices: [ { label: '가장 싼 다음 장비 바로 구매' }, { label: '지나친다' } ] };
    else if (id === 'gift') s.pendingEvent = { id, title: '구독자 선물', text: '구독자가 손편지와 간식을 보냈습니다.',
      choices: [ { label: '감사 커뮤니티 글 (호감도 +3)' }, { label: '고맙게 먹고 쉰다 (체력 회복)' } ] };
    else if (REGION_EVENTS[id]) s.pendingEvent = Object.assign({ id }, REGION_EVENTS[id].make(s));
    else if (id === 'sponsor') s.pendingEvent = { id, title: '소규모 협찬 문의', text: '앱 회사가 영상 중간 광고를 제안했습니다.',
      choices: [ { label: `수락 (₩${fmt(sponsorPay(s))}, 호감도 -4)` }, { label: '거절 (호감도 +1)' } ] };
  }
  function sponsorPay(s) { return Math.round((50000 + s.subs * 40) * ((REGIONS[s.region] || {}).sponsorMul || 1) / 1000) * 1000; }
  function cheapestNext(s) {
    let best = null;
    for (const k in EQUIP) { const n = equipNext(s, k); if (n && (!best || n.price < best.price)) best = { k, price: n.price }; }
    return best;
  }
  // 지역 이벤트: 선택지마다 돈·호감도·시간·체력을 맞바꾼다
  const REGION_EVENTS = {
    noise: { make: () => ({ title: '층간 소음', text: '윗집 공사 소리 때문에 녹음이 안 됩니다.', choices: [{ label: '방음 보강 공사 (₩200,000, 다음 영상 품질 걱정 없음)' }, { label: '밤에 몰아서 촬영 (체력 -25)' }] }),
      resolve: (s, ci, fav) => { if (ci === 0) { s.money -= 200000; } else { s.stamina = Math.max(0, s.stamina - 25); fav(-2); } } },
    popup: { make: () => ({ title: '팝업스토어 초대', text: '성수동 팝업스토어에서 현장 촬영을 제안했습니다.', choices: [{ label: '현장 촬영 (체력 -15, 다음 영상 트렌드 ×1.6)' }, { label: '거절' }] }),
      resolve: (s, ci) => { if (ci === 0) { s.stamina = Math.max(0, s.stamina - 15); s.nextVideoBoost = 1.6; } } },
    harvest: { make: s => ({ title: '수확철 일손 돕기', text: '이웃 할머니가 고추 따는 일을 도와 달라고 하십니다.', choices: [{ label: `하루 돕기 (+₩${fmt(partPay(s) * 1.5)}, 체력 -20, 다음 영상 트렌드 ×1.4)` }, { label: '정중히 거절' }] }),
      resolve: (s, ci, fav) => { if (ci === 0) { s.money += partPay(s) * 1.5; s.stamina = Math.max(0, s.stamina - 20); s.nextVideoBoost = 1.4; } else fav(-1); } },
    internet: { make: () => ({ title: '인터넷 끊김', text: '마을 인터넷이 끊겼습니다. 업로드를 못 합니다.', choices: [{ label: '읍내 PC방 가기 (₩20,000)' }, { label: '하루 쉬기 (체력 회복, 호감도 -3)' }] }),
      resolve: (s, ci, fav) => { if (ci === 0) s.money -= 20000; else { s.stamina = maxStamina(s); fav(-3); } } },
    typhoon: { make: () => ({ title: '태풍 북상', text: '태풍이 옵니다. 장비를 어떻게 할까요?', choices: [{ label: '장비 대피 (2일 쉬기, 안전)' }, { label: '그냥 둔다 (40% 확률로 수리비 ₩300,000)' }, { label: '태풍 현장 생중계 (호감도 +6, 체력 -30)' }] }),
      resolve: (s, ci, fav) => { if (ci === 0) { s.resting = true; } else if (ci === 1) { if (rnd(s) < 0.4) { s.money -= 300000; log(s, '창문이 깨져 수리비 ₩300,000', 'bad'); } } else { fav(6); s.stamina = Math.max(0, s.stamina - 30); } } },
    festival: { make: () => ({ title: '바다 축제', text: '항구에서 해산물 축제가 열립니다.', choices: [{ label: '축제 브이로그 촬영 (다음 영상 트렌드 ×1.7)' }, { label: '축제 부스 알바 (+₩150,000, 체력 -20)' }] }),
      resolve: (s, ci) => { if (ci === 0) s.nextVideoBoost = 1.7; else { s.money += 150000; s.stamina = Math.max(0, s.stamina - 20); } } },
    blackout: { make: () => ({ title: '산속 정전', text: '폭설로 전기가 나갔습니다.', choices: [{ label: '소형 발전기 대여 (₩150,000)' }, { label: '촛불 켜고 쉬기 (체력 가득, 호감도 -3)' }] }),
      resolve: (s, ci, fav) => { if (ci === 0) s.money -= 150000; else { s.stamina = maxStamina(s); fav(-3); } } },
    wildlife: { make: () => ({ title: '산짐승 출몰', text: '창밖에 너구리 가족이 나타났습니다!', choices: [{ label: '조용히 촬영 (다음 영상 바이럴 확률 3배)' }, { label: '먹이 주지 않고 지켜보기 (호감도 +2)' }] }),
      resolve: (s, ci, fav) => { if (ci === 0) s.viralBoost = 3; else fav(2); } },
  };

  function resolveEvent(s, ci) {
    const e = s.pendingEvent;
    if (!e) return false;
    s.pendingEvent = null;
    const F = CONFIG.favor;
    const fav = d => { s.favor = clamp(s.favor + d, F.min, F.max); };
    if (REGION_EVENTS[e.id]) { REGION_EVENTS[e.id].resolve(s, ci, fav); return true; }
    if (e.id === 'viral') {
      if (ci === 0) { s.nextVideoBoost = 1.8; fav(5); log(s, '후속편 준비! 다음 영상 트렌드 효과 ×1.8', 'good'); }
      else { const p = sponsorPay(s) * 2; s.money += p; log(s, `협찬 문의 수익 ₩${fmt(p)}`, 'good'); }
    } else if (e.id === 'hate') {
      if (ci === 0) { fav(-5); log(s, '사과 영상으로 수습했습니다.', 'info'); }
      else if (ci === 1) {
        if (rnd(s) < 0.5) { const lost = Math.round(s.subs * 0.05); s.subs -= lost; fav(-10); log(s, `논란 확산… 구독자 -${fmt(lost)}, 호감도 -10`, 'bad'); }
        else log(s, '다행히 조용히 지나갔습니다.', 'info');
      } else { s.money -= 500000; log(s, '법적 대응으로 정리했습니다. (₩500,000)', 'info'); }
    } else if (e.id === 'sale') {
      if (ci === 0) {
        const c = cheapestNext(s);
        if (c && s.money >= c.price * 0.7) { s.money -= Math.round(c.price * 0.7); s.equip[c.k]++; log(s, `${EQUIP[c.k].name} 30% 할인 구매!`, 'good'); }
        else log(s, '돈이 모자라 사지 못했습니다.', 'bad');
      }
    } else if (e.id === 'gift') {
      if (ci === 0) fav(3); else s.stamina = maxStamina(s);
    } else if (e.id === 'sponsor') {
      if (ci === 0) { s.money += sponsorPay(s); fav(-4); } else fav(1);
    }
    return true;
  }

  // ───────────────────────── 퀘스트 (다음 목표 안내 + 보상) ─────────────────────────
  const QUESTS = [
    { id: 'first', text: '첫 영상 업로드', done: s => (s.stats_videos || 0) >= 1, reward: 50000 },
    { id: 'mic', text: '마이크 업그레이드', done: s => s.equip.mic >= 1, reward: 30000 },
    { id: 's100', text: '구독자 100명', done: s => s.subs >= 100, reward: 100000 },
    { id: 'routine', text: '자동 반복 루틴 해금', done: s => s.routine.unlocked, reward: 50000 },
    { id: 'v10', text: '영상 10편', done: s => (s.stats_videos || 0) >= 10, reward: 150000 },
    { id: 's1k', text: '구독자 1,000명', done: s => s.subs >= 1000, reward: 300000 },
    { id: 'money', text: '수익 창출 승인 (구독자 1천 + 시청 4천 시간)', done: s => s.monetized, reward: 300000 },
    { id: 'move1', text: '더 좋은 집으로 이사', done: s => HOUSES[s.house] && housesOf(s.region).indexOf(s.house) >= 1, reward: 200000 },
    { id: 'v30', text: '영상 30편', done: s => (s.stats_videos || 0) >= 30, reward: 500000 },
    { id: 's5k', text: '구독자 5,000명', done: s => s.subs >= 5000, reward: 800000 },
    { id: 's10k', text: '구독자 10,000명 (1단계 목표)', done: s => s.subs >= 10000, reward: 2000000 },
    { id: 's100k', text: '구독자 10만 — 실버 버튼', done: s => s.subs >= 100000, reward: 10000000 },
  ];
  function checkQuests(s) {
    for (const q of QUESTS) {
      if (!s.quests[q.id] && q.done(s)) {
        s.quests[q.id] = true; s.money += q.reward;
        log(s, `목표 달성: ${q.text} (보상 ₩${fmt(q.reward)})`, 'good');
      }
    }
  }

  // ───────────────────────── 시간 진행 ─────────────────────────
  function peakF(t) { // 업로드 후 t시간까지 누적 비율 (0~peakShare)
    const k = 20, T = CONFIG.peakHours;
    return CONFIG.peakShare * (1 - Math.exp(-Math.min(t, T) / k)) / (1 - Math.exp(-T / k));
  }
  function addViews(s, dv, q) {
    if (dv <= 0) return 0;
    s.totalViews += dv;
    s.watchHours += dv * (CONFIG.watchMinBase + CONFIG.watchMinPerQ * q) / 60;
    s.subs += dv * convRate(s);
    const g = CONFIG.genre;
    const inc = dv * ((s.monetized ? g.adRpm : 0) + g.affiliatePerView);
    s.money += inc; s.totalIncome += inc;
    return inc;
  }

  // dt: 게임 시간(시간). realDt: 같은 구간의 실시간(초, 부스트 타이머용)
  function advance(s, dt, realDt) {
    s.realSec += realDt || 0;
    while (dt > 1e-9) {
      if (s.pendingEvent) return;       // 선택지가 뜨면 시간 정지
      const h = Math.min(dt, 1);
      stepHour(s, h);
      dt -= h;
    }
  }

  function stepHour(s, h) {
    const t0 = s.gh, t1 = s.gh + h;
    s.gh = t1;
    const ms = maxStamina(s);

    // 체력 & 작업
    const burnt = t1 < s.burnoutUntil;
    if (burnt || s.resting) {
      s.stamina = Math.min(ms, s.stamina + (CONFIG.staminaRegen.resting + effects(s).regen) * h);
      if (!burnt && s.resting && s.stamina >= ms) { s.resting = false; if (!s.routine.on) log(s, '휴식 끝, 체력 가득!', 'info'); }
    } else if (s.job && s.job.partTime) {
      s.job.left -= h;
      if (s.job.left <= 0) { const pay = partPay(s); s.job = null; s.money += pay; log(s, `알바 끝 +₩${fmt(pay)}`, 'info'); }
    } else if (s.job) {
      s.stamina = Math.min(ms, s.stamina + CONFIG.staminaRegen.working * h);
      workHours(s, h);
    } else {
      s.stamina = Math.min(ms, s.stamina + CONFIG.staminaRegen.idle * h);
    }

    // 이사
    if (s.moving && t1 >= s.moving.untilGh) finishMove(s);
    // 월세
    if (t1 >= s.nextRentGh) {
      const rent = HOUSES[s.house].rent;
      s.nextRentGh += RENT_DAYS * 24;
      if (rent > 0) { s.money -= rent; log(s, `🏠 월세 -₩${fmt(rent)} (${HOUSES[s.house].name})`, s.money < 0 ? 'bad' : 'info'); }
      if (s.money < 0) {
        s.debtDays += RENT_DAYS;
        if (s.debtDays >= 60) {   // 두 달 밀리면 지역에서 가장 싼 집으로 강제 이사
          const cheap = housesOf(s.region)[0];
          if (cheap !== s.house) { s.house = cheap; log(s, `월세가 밀려 ${HOUSES[cheap].name}(으)로 옮겼습니다.`, 'bad'); }
          s.debtDays = 0;
        }
      } else s.debtDays = 0;
    }

    // 자동 반복 루틴
    if (s.routine.on && s.routine.unlocked && !s.pendingEvent) {
      if (s.uploadReady) upload(s, bestThumbIdx(s));
      if (canWork(s) && !s.resting) {
        if (s.stamina < 50) s.resting = true;
        else startVideo(s, bestCardIdx(s));
      }
    }

    // 조회수: 피크 구간 영상
    for (const v of s.videos) {
      const a0 = t0 - v.uploadGh, a1 = t1 - v.uploadGh;
      if (a0 >= CONFIG.peakHours) continue;
      const dv = v.V * (peakF(Math.max(0, a1)) - peakF(Math.max(0, a0)));
      v.views += dv;
      v.income += addViews(s, dv, v.q);
      if (a1 >= CONFIG.peakHours && !v.tailAdded) {
        v.tailAdded = true;
        const add = v.V * CONFIG.tailDailyShare;
        s.tailQ = (s.tailQ * s.tailRate + v.q * add) / (s.tailRate + add || 1);
        s.tailRate += add;
      }
    }
    // 롱테일 (지난 영상 전체)
    if (s.tailRate > 0) {
      const dv = s.tailRate * (h / 24) * (1 + 0.08 * seoLv(s));
      addViews(s, dv, s.tailQ);
      s.tailRate *= Math.exp(-h / (CONFIG.tailTauDays * 24));
    }

    // 호감도: 업로드 공백 페널티
    if (s.lastUploadGh !== null && t1 - s.lastUploadGh > CONFIG.favor.gapDays * 24)
      s.favor = clamp(s.favor - CONFIG.favor.gapPerDay * h / 24, CONFIG.favor.min, CONFIG.favor.max);

    // 수익 창출 승인
    if (!s.monetized && s.subs >= CONFIG.monetize.subs && s.watchHours >= CONFIG.monetize.watchHours) {
      s.monetized = true; log(s, '💰 수익 창출 승인! 이제 광고 수익이 들어옵니다.', 'good');
    }

    // 트렌드 갱신
    if (t1 >= s.trendRefreshAt) { refreshTrends(s); }

    // 알고리즘 개편
    if (t1 >= s.nextAlgoGh) {
      s.algoMul = rr(s, CONFIG.events.algoMul[0], CONFIG.events.algoMul[1]);
      s.nextAlgoGh += CONFIG.events.algoEveryDays * 24;
      log(s, `알고리즘 개편: 정보 채널 노출 ×${s.algoMul.toFixed(2)}`, s.algoMul >= 1 ? 'good' : 'bad');
    }
    // 랜덤 이벤트
    if (t1 >= s.nextEventGh && !s.pendingEvent) {
      s.nextEventGh = t1 + rr(s, CONFIG.events.everyDays[0], CONFIG.events.everyDays[1]) * 24;
      if ((s.stats_videos || 0) >= 2) rollEvent(s);
    }
    checkQuests(s);
  }

  // 접속하지 않은 동안: 지난 영상 수익만 효율 25%로 정산
  function offline(s, realSec) {
    const sec = Math.min(realSec, CONFIG.offline.maxRealSec);
    if (sec < 30) return null;
    const before = { money: s.money, subs: s.subs, views: s.totalViews };
    const h = sec * ghPerRealSec() * CONFIG.offline.efficiency;
    // 롱테일 + 피크 잔여분만 (제작은 진행 안 함)
    const days = h / 24;
    const tail = s.tailRate * CONFIG.tailTauDays * (1 - Math.exp(-days / CONFIG.tailTauDays)) * (1 + 0.08 * seoLv(s));
    addViews(s, tail, s.tailQ);
    s.tailRate *= Math.exp(-days / CONFIG.tailTauDays);
    s.stamina = maxStamina(s);
    return { realSec: sec, money: s.money - before.money, subs: s.subs - before.subs, views: s.totalViews - before.views };
  }

  // 옛 저장(v1) → v2: 도시 원룸에서 지내던 것으로
  function migrate(s) {
    if (!s.region) { s.region = 'city'; s.house = 'oneroom'; s.moving = null; s.nextRentGh = s.gh + RENT_DAYS * 24; s.debtDays = 0; }
    for (const k in EQUIP) if (s.equip[k] == null) s.equip[k] = 0;
    s.v = 2;
    return s;
  }

  function fmt(n) {
    n = Math.round(n);
    if (Math.abs(n) >= 1e8) return (n / 1e8).toFixed(1).replace(/\.0$/, '') + '억';
    if (Math.abs(n) >= 1e4) return (n / 1e4).toFixed(n >= 1e5 ? 0 : 1).replace(/\.0$/, '') + '만';
    return n.toLocaleString('ko-KR');
  }
  function gameDate(gh) {
    const d = Math.floor(gh / 24) + 1, hr = Math.floor(gh % 24);
    return `${d}일차 ${String(hr).padStart(2, '0')}:00`;
  }

  root.Engine = {
    CONFIG, EQUIP, GROUPS, SKILLS, TRAITS, PACKS, START_SETS, QUESTS, ROUTINE_PRICE, REGIONS, HOUSES, MOVE_DAYS, RENT_DAYS,
    housesOf, effEquip, moveCost, canMove, moveHouse, partPay, migrate,
    newGame, advance, offline, tap, startVideo, upload, partTime, buyEquip, buySkill, buyRoutine,
    applyPack, resolveEvent, refreshTrends, bestThumbIdx, bestCardIdx, cheapestNext, equipNext, skillCost,
    baseQuality, maxStamina, convRate, cardViewRange, stageHours, canWork, effects, thumbLv, seoLv,
    fmt, gameDate, ghPerRealSec,
  };
})(typeof window !== 'undefined' ? window : globalThis);
