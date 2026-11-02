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
    // 입문 PC 팩 + 링라이트·방음 커튼. 60분 성장 무료의 약 3배. 미러리스 카메라나 USB 마이크까지 넣으면 품질이 바이럴 구간을 넘어 5~9배로 뛴다.
    full_set: { name: '크리에이터 풀세트', price: 2200, once: true,
      desc: '입문 PC 팩 + 링라이트 + 방음 커튼 (램 16GB · SATA SSD · 편집 소프트웨어 구독 포함)',
      give: { equip: { ram: 1, ssd: 1, sw: 1, light: 1, space: 1 } } },
    studio: { name: '홈 스튜디오 꾸미기', price: 3300, once: true,
      desc: '홈 스튜디오 + 3점 조명 + NVMe SSD',
      give: { equip: { space: 2, light: 2, ssd: 2 } } },
  };
  // 게임 시작 시 고를 수 있는 시작 세트
  const START_SETS = ['free', 'pc_starter', 'gear_starter', 'full_set'];

  // ───────────────────────── 지역과 집 ─────────────────────────
  // 지역: 시작할 곳. 지역 전용 주제(경쟁 낮고 반응 좋음), 지역 이벤트, 생활 조건이 다르다.
  const REGIONS = {
    city: { name: '도시', icon: '🏙️', startMoney: 400000, reachMul: 1.1, partPay: 1.3, sponsorMul: 1.4, editMul: 1, regen: 0, localShare: 0.25, life: { cook: 1.1, delivery: 0.85, eatout: 1.2 }, deliveryWait: 0.6,
      desc: '트렌드가 빠르고 협찬이 잘 들어온다. 알바 시급이 높지만 월세가 비싸고 시끄럽다.',
      topics: ['지하철 환승 꿀팁', '성수동 팝업스토어 정리', '청년 월세 지원금', '배달비 아끼는 법', '자취방 구하는 법', '공유 오피스 비교', '야근러 건강 관리', '도심 무료 전시'],
      localT: [1.0, 1.6], events: ['noise', 'popup'] },
    country: { name: '농촌', icon: '🌾', startMoney: 250000, reachMul: 0.9, partPay: 0.85, sponsorMul: 0.8, editMul: 1.1, regen: 1, localShare: 0.4, life: { ramen: 0.9, cook: 0.6, delivery: 1.4, eatout: 0.8 }, deliveryWait: 2,
      desc: '집값이 거의 들지 않고 조용하다. 시골 콘텐츠는 경쟁이 낮다. 인터넷이 느려 편집이 조금 더디다.',
      topics: ['시골 빈집 수리기', '텃밭 1년 농사 일지', '귀농 지원금 총정리', '5일장 물가 탐방', '농기계 임대 받는 법', '시골 살이 한 달 비용', '토종 씨앗 나눔', '청년 농부 창업'],
      localT: [1.1, 1.7], events: ['harvest', 'internet'] },
    seaside: { name: '바닷가', icon: '🌊', startMoney: 300000, reachMul: 1.0, partPay: 1.0, sponsorMul: 1.0, editMul: 1, regen: 0.5, localShare: 0.35, life: { cook: 0.8, delivery: 1.1 }, deliveryWait: 1.3,
      desc: '바다·낚시·캠핑 주제가 강하다. 축제철 대목이 있지만 태풍이 온다.',
      topics: ['물때표 보는 법', '갯벌 체험 명소', '바다낚시 입문 장비', '횟집 시세 읽는 법', '차박 명소 정리', '해수욕장 주차 꿀팁', '서핑 첫 수업', '어촌 한 달 살기'],
      localT: [1.0, 1.8], events: ['typhoon', 'festival'] },
    mountain: { name: '산속', icon: '⛰️', startMoney: 300000, reachMul: 0.95, partPay: 0.85, sponsorMul: 0.9, editMul: 1, regen: 1.5, localShare: 0.45, life: { cook: 0.7, delivery: 1.6, eatout: 1.1 }, deliveryWait: 2.5,
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
  // 방 안 고정 가구 위치 (scene3d.js의 배치와 같은 식). 꾸미기 아이템이 이 자리와 겹치지 않게 한다.
  function roomLayout(houseId) {
    const H = HOUSES[houseId], RW = H.size[0], RD = H.size[1], hx = RW / 2, hz = RD / 2;
    const L = { RW, RD, desk: { x: -hx + 1.95, z: -hz + 0.55 }, film: { x: hx - 1.25, z: -hz + 1.55 }, bed: { x: -hx + 0.85, z: hz - 1.35 }, door: { z: -hz + Math.min(2.1, RD * 0.32) }, kitchen: kitchenSpot(H) };
    // 막힌 영역(사각형 x0,z0,x1,z1): 책상+의자, 침대, 촬영 구역(스툴~삼각대), 문 앞 통로
    const bw = RW <= 6 ? 1.1 : 1.5;
    L.blocked = [
      [L.desk.x - 1.3, -hz, L.desk.x + 1.75, L.desk.z + 1.3],
      [L.bed.x - bw / 2, L.bed.z - 1.3, L.bed.x + bw / 2, L.bed.z + 1.3],
      [L.film.x - 1.0, -hz, hx, Math.min(L.film.z + 2.3, hz)],
      [-hx, L.door.z - 0.6, -hx + 1.0, L.door.z + 0.6],
      L.kitchen.side === 'left' ? [-hx, L.kitchen.z0, -hx + 1.3, L.kitchen.z1] : [hx - 1.3, L.kitchen.z0, hx, L.kitchen.z1],
    ];
    return L;
  }
  // 부엌(냉장고 + 가스레인지): 왼쪽 벽 문과 침대 사이(카메라에서 잘 보이는 벽)에 자리가 있으면 거기, 없으면 오른쪽 아래.
  // 촬영 구역과 집별 소품(벽난로·평상 등)을 피한다. 좁으면 냉장고만.
  function kitchenSpot(H) {
    const RW = H.size[0], RD = H.size[1], hx = RW / 2, hz = RD / 2;
    const doorZ = -hz + Math.min(2.1, RD * 0.32), bedZ = hz - 1.35;
    const g0 = doorZ + 0.65, g1 = bedZ - 1.3 - 0.05;
    const mk = (side, z0, z1, stove) => {
      const f = side === 'left' ? 1 : -1, x = side === 'left' ? -hx + 0.35 : hx - 0.35;
      return { side, f, x, z0, z1, stove, fridgeZ: z1 - 0.33, stoveZ: z0 + 0.33, spot: { x: x + f * 0.68, z: stove ? (z0 + z1) / 2 : z1 - 0.33 } };
    };
    if (g1 - g0 >= 1.3) return mk('left', g1 - 1.3, g1, true);
    if (g1 - g0 >= 0.66) return mk('left', g1 - 0.66, g1, false);
    const filmEnd = Math.min(-hz + 1.55 + 2.3, hz);
    const corner = H.wall === 'hanok' ? 1.4 : (H.wall === 'log' || H.name === '통나무집') ? 0.75 : H.wall === 'old' || H.wall === 'barn' ? 1.0 : H.wall === 'blue' ? 0.85 : 0.05;
    let z1 = hz - corner, z0 = z1 - 1.3, stove = true;
    if (z0 < filmEnd) { z0 = z1 - 0.66; stove = false; }
    if (z0 < filmEnd) { z1 = hz - 0.05; z0 = z1 - 0.66; }
    return mk('right', z0, z1, stove);
  }

  // ───────────────────────── AI 제작 ─────────────────────────
  // 구독 단계(돈으로 산다) × 숙련도(써야 오른다). 단계마다 '직접 / AI / 직원' 중 누가 할지 정한다.
  const AI_PLANS = [
    { name: '무료 체험', monthly: 0, credits: 10, cap: 50, timeMul: 1, unlock: 0, watermark: true },
    { name: '기본 구독', monthly: 30000, credits: 50, cap: 65, timeMul: 1, unlock: 500 },
    { name: '프로 구독', monthly: 150000, credits: 200, cap: 80, timeMul: 0.7, unlock: 5000 },
    { name: '스튜디오 플랜', monthly: 600000, credits: 99999, cap: 90, timeMul: 0.5, unlock: 50000 },
  ];
  // 숙련 레벨: need=AI로 만든 영상 수, plan=필요 구독 단계. time=AI 단계 시간 배율, cr=단계별 크레딧, tee=AI 티 감점(촬영을 AI로 할 때)
  const AI_LEVELS = [
    { name: '초보', need: 0, time: 0.6, q: 0, cr: [3, 6, 3], tee: 15 },
    { name: '프롬프트 감 잡음', need: 15, time: 0.5, q: 5, cr: [2, 4, 2], tee: 12 },
    { name: '워크플로 정착', need: 50, time: 0.4, q: 10, cr: [1, 3, 1], tee: 8 },
    { name: '자동화 설계자', need: 150, plan: 2, time: 0.3, q: 15, cr: [1, 1, 1], tee: 4 },
    { name: 'AI 디렉터', need: 400, plan: 3, time: 0.2, q: 20, cr: [0.5, 1, 0.5], tee: 0 },
  ];
  // ───────────────────────── 직원 ─────────────────────────
  const STAFF_ROLES = {
    writer:    { name: '작가', icon: '✍️', stage: 0, salary: 150000, desc: '기획을 맡는다' },
    shooter:   { name: '촬영 스태프', icon: '🎥', stage: 1, salary: 250000, desc: '촬영을 맡는다' },
    editor:    { name: '편집자', icon: '✂️', stage: 2, salary: 250000, desc: '편집을 맡는다' },
    manager:   { name: '매니저', icon: '📋', salary: 300000, desc: '협찬 단가 1.5배, 업로드 꾸준함 보너스' },
    ai_op:     { name: 'AI 오퍼레이터', icon: '🤖', salary: 350000, desc: 'AI 크레딧 30% 절약, AI 숙련 +1단계처럼' },
    community: { name: '커뮤니티 매니저', icon: '💬', salary: 120000, desc: '악플 피해 절반, 구독 전환 +5%' },
  };
  const NAMES = ['김하늘', '이도윤', '박서연', '최민준', '정예린', '강지호', '윤수아', '임태오', '한소율', '오지안', '서준우', '신다은', '권하람', '황시우', '송유나'];

  // ───────────────────────── 방 꾸미기 ─────────────────────────
  // place: floor(바닥, 칸 단위 w×d) / wall(뒷벽·왼쪽 벽) / theme(벽지·바닥재). 3D 모양은 decor.js가 id로 만든다.
  // cozy: 아늑함 점수(휴식 회복·영상 품질에 소폭 반영, 상한 있음)
  const DECOR_CATS = { furniture: '가구', light: '조명', plant: '식물', wall: '벽 장식', collect: '수집품', fun: '재미', theme: '벽지·바닥' };
  const DECOR_ITEMS = {
    sofa_small:   { cat: 'furniture', name: '2인 소파', price: 180000, place: 'floor', w: 2, d: 1, cozy: 3 },
    beanbag:      { cat: 'furniture', name: '빈백 쿠션', price: 60000, place: 'floor', w: 1, d: 1, cozy: 2 },
    bookshelf:    { cat: 'furniture', name: '책장', price: 90000, place: 'floor', w: 2, d: 1, cozy: 2 },
    low_table:    { cat: 'furniture', name: '좌식 테이블', price: 50000, place: 'floor', w: 2, d: 1, cozy: 1 },
    gaming_chair: { cat: 'furniture', name: '게이밍 의자', price: 250000, place: 'floor', w: 1, d: 1, cozy: 2 },
    wardrobe:     { cat: 'furniture', name: '옷장', price: 150000, place: 'floor', w: 2, d: 1, cozy: 1 },
    fridge_mini:  { cat: 'furniture', name: '미니 냉장고', price: 120000, place: 'floor', w: 1, d: 1, cozy: 1 },
    piano:        { cat: 'furniture', name: '디지털 피아노', price: 900000, place: 'floor', w: 3, d: 1, cozy: 3, unlock: 5000 },
    hammock:      { cat: 'furniture', name: '실내 해먹', price: 300000, place: 'floor', w: 3, d: 1, cozy: 4, unlock: 3000 },
    floor_lamp:   { cat: 'light', name: '스탠드 조명', price: 70000, place: 'floor', w: 1, d: 1, cozy: 2 },
    string_lights:{ cat: 'light', name: '알전구 줄조명', price: 30000, place: 'wall', cozy: 3 },
    neon_heart:   { cat: 'light', name: '하트 네온사인', price: 120000, place: 'wall', cozy: 2 },
    lava_lamp:    { cat: 'light', name: '라바 램프', price: 45000, place: 'floor', w: 1, d: 1, cozy: 2 },
    moon_lamp:    { cat: 'light', name: '달 무드등', price: 40000, place: 'floor', w: 1, d: 1, cozy: 2 },
    monstera:     { cat: 'plant', name: '몬스테라', price: 60000, place: 'floor', w: 1, d: 1, cozy: 2 },
    cactus:       { cat: 'plant', name: '선인장 화분', price: 15000, place: 'floor', w: 1, d: 1, cozy: 1 },
    bonsai:       { cat: 'plant', name: '분재', price: 200000, place: 'floor', w: 1, d: 1, cozy: 2 },
    flower_vase:  { cat: 'plant', name: '꽃병', price: 35000, place: 'floor', w: 1, d: 1, cozy: 2 },
    hanging_plant:{ cat: 'plant', name: '행잉 플랜트', price: 40000, place: 'wall', cozy: 2 },
    poster_movie: { cat: 'wall', name: '영화 포스터', price: 20000, place: 'wall', cozy: 1 },
    poster_game:  { cat: 'wall', name: '게임 포스터', price: 20000, place: 'wall', cozy: 1 },
    painting:     { cat: 'wall', name: '유화 액자', price: 150000, place: 'wall', cozy: 2 },
    clock:        { cat: 'wall', name: '벽시계', price: 25000, place: 'wall', cozy: 1 },
    shelf_wall:   { cat: 'wall', name: '벽 선반', price: 40000, place: 'wall', cozy: 1 },
    world_map:    { cat: 'wall', name: '세계 지도', price: 30000, place: 'wall', cozy: 1 },
    figure_set:   { cat: 'collect', name: '피규어 진열장', price: 350000, place: 'floor', w: 1, d: 1, cozy: 2, unlock: 1000 },
    vinyl:        { cat: 'collect', name: 'LP 턴테이블', price: 280000, place: 'floor', w: 1, d: 1, cozy: 3, unlock: 1000 },
    guitar_stand: { cat: 'collect', name: '기타 스탠드', price: 200000, place: 'floor', w: 1, d: 1, cozy: 2 },
    trophy:       { cat: 'collect', name: '트로피 장식장', price: 500000, place: 'floor', w: 1, d: 1, cozy: 2, unlock: 10000 },
    aquarium:     { cat: 'fun', name: '수족관', price: 450000, place: 'floor', w: 2, d: 1, cozy: 4, unlock: 2000 },
    cat_tower:    { cat: 'fun', name: '캣타워 + 고양이', price: 400000, place: 'floor', w: 1, d: 1, cozy: 5, unlock: 3000 },
    arcade:       { cat: 'fun', name: '오락기', price: 800000, place: 'floor', w: 1, d: 1, cozy: 3, unlock: 10000 },
    treadmill:    { cat: 'fun', name: '러닝머신', price: 600000, place: 'floor', w: 1, d: 2, cozy: 1, unlock: 5000 },
    disco_ball:   { cat: 'fun', name: '미러볼', price: 90000, place: 'floor', w: 1, d: 1, cozy: 2 },
    rug_round:    { cat: 'theme', name: '동그란 러그', price: 40000, place: 'floor', w: 2, d: 2, cozy: 2, flat: true },
    wp_pastel:    { cat: 'theme', name: '파스텔 벽지', price: 80000, place: 'theme', slot: 'wall', color: '#f6d6e0', cozy: 1 },
    wp_mint:      { cat: 'theme', name: '민트 벽지', price: 80000, place: 'theme', slot: 'wall', color: '#cfeee2', cozy: 1 },
    wp_navy:      { cat: 'theme', name: '네이비 벽지', price: 80000, place: 'theme', slot: 'wall', color: '#3a4a74', cozy: 1 },
    wp_brick:     { cat: 'theme', name: '벽돌 벽지', price: 120000, place: 'theme', slot: 'wall', color: '#b5654a', cozy: 1 },
    fl_white:     { cat: 'theme', name: '화이트 원목 바닥', price: 150000, place: 'theme', slot: 'floor', color: '#f2ede4', cozy: 1 },
    fl_dark:      { cat: 'theme', name: '다크 원목 바닥', price: 150000, place: 'theme', slot: 'floor', color: '#8a6a50', cozy: 1 },
    fl_carpet:    { cat: 'theme', name: '그레이 카펫', price: 180000, place: 'theme', slot: 'floor', color: '#b8bcc6', cozy: 2 },
  };
  const DECOR_CELL = 0.5;   // 바닥 배치 칸 크기 (m)

  const housesOf = region => Object.keys(HOUSES).filter(k => HOUSES[k].region === region);
  const MOVE_DAYS = 3;          // 이사 기간 (업로드 불가)
  const RENT_DAYS = 30;

  // ───────────────────────── 장르 ─────────────────────────
  // B=조회수 계수, rpm=조회 1회당 광고 수익(원), conv=구독 전환 배율, tail=롱테일 배율, viral=바이럴 확률 배율,
  // tee=AI 촬영 티 배율(얼굴이 나와야 하는 장르일수록 큼), micX=마이크 효과 배율, sponsor=협찬 배율
  const GENRES = {
    info:  { name: '정보·교육', icon: '📚', B: 0.7, rpm: 3.0, aff: 1, conv: 1, tail: 1.3, viral: 0.8, tee: 0.8, micX: 1, sponsor: 1,
      desc: '느리게 크지만 광고 단가가 높고 검색으로 꾸준히 본다. AI 제작에 잘 맞는다.' },
    game:  { name: '게임', icon: '🎮', B: 0.85, rpm: 1.4, aff: 0.7, conv: 0.95, tail: 0.7, viral: 1.5, tee: 1, micX: 1, sponsor: 0.9,
      desc: '빨리 크고 바이럴이 잦지만 단가가 낮다. 트렌드가 금방 식는다.',
      topics: ['신작 RPG 첫인상', '공포게임 실황 1화', '랭크 올리는 법', '인디게임 숨은 명작', '레트로 게임 추억', '게임 속 버그 모음', '모바일 게임 과금 비교', '스피드런 도전', '게임 OST 명곡', '멀티플레이 웃긴 순간', '신작 발표회 정리', '게임 패드 비교'] },
    food:  { name: '먹방·일상', icon: '🍜', B: 0.74, rpm: 1.8, aff: 0.8, conv: 1.12, tail: 0.8, viral: 1.2, tee: 1.8, micX: 1, sponsor: 1.5,
      desc: '팬이 끈끈하고 협찬이 빨리 들어온다. 얼굴이 나와야 해서 AI 촬영이 어렵다.',
      topics: ['편의점 신상 털기', '라면 10종 끓여 먹기', '자취 요리 일주일', '야식 ASMR', '동네 맛집 탐방', '다이어트 식단 브이로그', '대왕 돈가스 도전', '집밥 한 상 차리기', '디저트 카페 투어', '아침 루틴 브이로그', '장보기 하울', '밀키트 솔직 후기'] },
    music: { name: '음악·커버', icon: '🎵', B: 0.7, rpm: 2.2, aff: 0.8, conv: 1.05, tail: 1.1, viral: 1.1, tee: 1.3, micX: 2, sponsor: 1,
      desc: '마이크 장비 효과가 두 배. 저작권 경고가 잦다.',
      topics: ['요즘 인기곡 어쿠스틱 커버', '90년대 명곡 메들리', '통기타 입문 코드', '피아노로 치는 드라마 OST', '방구석 노래방', '작곡 첫걸음', '버스킹 현장', '목소리 관리 꿀팁', '캐럴 커버', '1인 아카펠라', '밴드 합주 브이로그', '음향 장비 비교'] },
  };

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
    const genre = GENRES[opt.genre] ? opt.genre : 'info';
    const house = (HOUSES[opt.house] && HOUSES[opt.house].region === region) ? opt.house : housesOf(region)[0];
    const s = {
      v: 3, genre, region, house, moving: null, nextRentGh: RENT_DAYS * 24, debtDays: 0, staff: [], candidates: [], candRefreshGh: 0,
      pipeline: ['self', 'self', 'self'], ai: { plan: 0, credits: AI_PLANS[0].credits, made: 0, label: true },
      live: null, goods: null, membersOn: false,
      decor: { owned: {}, placed: {}, theme: {} }, channel: opt.channel || '나의 정보 채널', trait: opt.trait || 'planner',
      // 한 단계 위 집에서 시작하면 그 이사비만큼 덜 가지고 시작
      gh: 0, money: REGIONS[region].startMoney - HOUSES[house].move, stamina: CONFIG.maxStaminaBase,
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
      life: newLife(),
    };
    if (opt.rng) s.rng = opt.rng;
    if (opt.ngp) {   // 뉴게임+: 지난 판 AI 숙련 절반, 시작 자금 1.5배
      s.ai.made = Math.floor((opt.ngp.aiMade || 0) / 2); s.money = Math.round(s.money * 1.5); s.ngp = (opt.ngp.count || 0) + 1;
    }
    s.nextEventGh = rr(s, CONFIG.events.everyDays[0], CONFIG.events.everyDays[1]) * 24;
    refreshTrends(s);
    if (opt.pack && opt.pack !== 'free') applyPack(s, opt.pack);
    log(s, `${REGIONS[region].icon} ${REGIONS[region].name}의 ${HOUSES[house].name}에서 「${s.channel}」 개설! 첫 영상 주제를 골라 보세요.`, 'good');
    return s;
  }

  function newLife() { return { hunger: 80, clean: 85, mood: 70, act: null, delivery: null, fullUntil: 0, svc: {} }; }

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
    const cb = s.decor ? cozyBonus(s) : { q: 0, regen: 0 };
    e.q += (H.q || 0) + cb.q; e.regen += (H.regen || 0) + (Rg.regen || 0) + cb.regen;
    if (Rg.editMul) e.edit *= Rg.editMul;
    for (const k in EQUIP) {
      const t = EQUIP[k].tiers[eq[k] || 0];
      if (t.q) e.q += t.q * (k === 'mic' ? G(s).micX : 1);
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
    q += lifeQ(s);
    return clamp(q, 0, CONFIG.qualityMax);
  }
  function G(s) { return GENRES[s.genre] || GENRES.info; }
  // 계절: 게임 속 1년 = 120일 (계절마다 30일)
  const SEASONS = [{ name: '봄', icon: '🌸' }, { name: '여름', icon: '☀️' }, { name: '가을', icon: '🍂' }, { name: '겨울', icon: '❄️' }];
  const SEASON_LOCAL = { city: [1, 1, 1, 1.1], country: [1.15, 1, 1.3, 0.85], seaside: [1, 1.35, 0.95, 0.8], mountain: [1.05, 1.1, 1.3, 1.15] };
  function season(gh) { return Math.floor((gh / 24) % 120 / 30); }
  function aiLevel(s) {
    let lv = 0;
    for (let i = 1; i < AI_LEVELS.length; i++) { const L = AI_LEVELS[i]; if (s.ai.made >= L.need && s.ai.plan >= (L.plan || 0)) lv = i; }
    if (hasStaff(s, 'ai_op')) lv = Math.min(AI_LEVELS.length - 1, lv + 1);
    return lv;
  }
  function hasStaff(s, role) { return (s.staff || []).find(x => x.role === role); }
  function stageMethod(s, i) { return (s.job && s.job.how) ? s.job.how[i] : (s.pipeline || ['self', 'self', 'self'])[i]; }
  function stageHoursBy(s, i, how) {
    const e = effects(s);
    const base = CONFIG.stages[i].hours;
    if (how === 'ai') return base * AI_LEVELS[aiLevel(s)].time * AI_PLANS[s.ai.plan].timeMul * Math.sqrt(e.edit);
    if (how === 'staff') { const st = (s.staff || []).find(x => STAFF_ROLES[x.role].stage === i); return base * (1.25 - (st ? st.ability : 50) / 100 * 0.7) * [e.plan, e.shoot, e.edit][i]; }
    let h = base * (1 - 0.05 * s.skills.speed) * [e.plan, e.shoot, e.edit][i];
    if (s.trait === 'editor') h *= 0.75;
    if (i === 2 && s.job && s.job.outsource) h *= CONFIG.outsourceEdit.timeMul;
    if (s.life) h /= lifeTier(s).speed;
    return h;
  }
  function stageHours(s, i) { return stageHoursBy(s, i, stageMethod(s, i)); }
  function aiCredits(s, i) { return s.ai.ownModel ? 0 : AI_LEVELS[aiLevel(s)].cr[i] * (hasStaff(s, 'ai_op') ? 0.7 : 1); }
  // 단계별 품질 → 영상 품질 (기획 30%, 촬영 40%, 편집 30%)
  function stageQuality(s, i, how) {
    if (how === 'ai') {
      const lv = aiLevel(s), P = AI_PLANS[s.ai.plan];
      let q = Math.min(P.cap + (s.ai.ownModel ? 8 : 0), 42 + AI_LEVELS[lv].q + effEquip(s).gpu * 2 + (s.ai.ownModel ? 15 : 0));
      if (i === 1 && !s.ai.ownModel) q -= AI_LEVELS[lv].tee * G(s).tee;
      return q;
    }
    if (how === 'staff') { const st = (s.staff || []).find(x => STAFF_ROLES[x.role].stage === i); return clamp(30 + (st ? st.ability : 50) * 0.45 + effects(s).q * 0.7, 0, CONFIG.qualityMax); }
    return baseQuality(s);
  }
  function videoQuality(s, how) {
    how = how || s.pipeline;
    let q = 0.3 * stageQuality(s, 0, how[0]) + 0.4 * stageQuality(s, 1, how[1]) + 0.3 * stageQuality(s, 2, how[2]);
    if (how.includes('ai') && AI_PLANS[s.ai.plan].watermark) q -= 8;
    return clamp(q, 0, CONFIG.qualityMax);
  }
  function thumbLv(s) { return s.skills.thumb + effects(s).thumb; }
  function seoLv(s) { return s.skills.seo + effects(s).seo; }
  function stageStaminaPerHour(s, i) {
    if (i === 2 && s.job && s.job.outsource) return 0;
    if (stageMethod(s, i) !== 'self') return 0;
    return CONFIG.stages[i].stamina / stageHours(s, i);
  }
  function convRate(s) {
    const c = CONFIG.conv;
    const q = s._lastQ || baseQuality(s);
    let r = c.base * q / c.qRef + c.early * c.earlyK / (s.subs + c.earlyK);
    if (s.favor >= c.favorBonusAt) r += c.favorBonus;
    if (s.trait === 'charisma') r *= 1.2;
    if (hasStaff(s, 'community')) r *= 1.05;
    r *= G(s).conv;
    r /= 1 + s.subs / 300000;      // 큰 채널일수록 새 구독 전환이 줄어든다
    if (s._lastAI && aiLevel(s) < 4) r *= 0.88;   // AI 영상은 팬 충성도가 조금 낮다
    return r;
  }
  function thumbMul(s) { return 1 + 0.04 * thumbLv(s); }
  function expectedViews(s, T, q) {
    const g = CONFIG.genre;
    const rm = (REGIONS[s.region] || {}).reachMul || 1;
    return G(s).B * rm * Math.pow(CONFIG.S0 + CONFIG.reach * s.subs, CONFIG.subsExp) * (q / 50) * (s.favor / 50) * T * s.algoMul * thumbMul(s);
  }

  // ───────────────────────── 트렌드 카드 ─────────────────────────
  function makeCard(s) {
    const Rg = REGIONS[s.region];
    if (Rg && rnd(s) < Rg.localShare) {
      const used = new Set(s.trends.map(c => c.topic));
      const pool = Rg.topics.filter(t => !used.has(t));
      if (pool.length) {
        const sm = (SEASON_LOCAL[s.region] || [1, 1, 1, 1])[season(s.gh)];
        const range = [Rg.localT[0] * sm, Rg.localT[1] * sm];
        return { id: Math.floor(rnd(s) * 1e9), topic: pick(s, pool), comp: '낮음', local: true, season: sm !== 1 ? sm : 0, T: rr(s, range[0], range[1]), range,
          expiresGh: s.gh + rr(s, 8, 16) * 24 };
      }
    }
    const comp = pick(s, ['낮음', '보통', '높음']);
    const range = comp === '낮음' ? [0.7, 1.3] : comp === '보통' ? [0.6, 1.7] : [0.5, 2.0];
    const T = rr(s, range[0], range[1]);
    const used = new Set(s.trends.map(c => c.topic));
    const pool = G(s).topics || TOPICS;
    let topic = pick(s, pool), guard = 0;
    while (used.has(topic) && guard++ < 20) topic = pick(s, pool);
    return { id: Math.floor(rnd(s) * 1e9), topic, comp, T, range,
      expiresGh: s.gh + rr(s, CONFIG.trends.expireDays[0], CONFIG.trends.expireDays[1]) * (s.genre === 'game' ? 0.6 : 1) * 24 };
  }
  function refreshTrends(s) {
    const n = CONFIG.trends.count + (s.trait === 'planner' ? 1 : 0);
    s.trends = [];
    for (let i = 0; i < n; i++) s.trends.push(makeCard(s));
    s.trendRefreshAt = s.gh + CONFIG.trends.refreshDays * 24;
  }
  // 카드에 표시할 예상 조회수 범위
  function cardViewRange(s, card) {
    const q = videoQuality(s);
    return [expectedViews(s, card.range[0], q) * 0.6, expectedViews(s, card.range[1], q) * 1.6];
  }

  // ───────────────────────── 행동 ─────────────────────────
  function canWork(s) { return !s.job && !s.uploadReady && s.gh >= s.burnoutUntil && !s.pendingEvent && !s.moving && !s.live; }

  function startVideo(s, cardIdx) {
    if (!canWork(s)) return false;
    const card = s.trends[cardIdx];
    if (!card) return false;
    const how = (s.pipeline || ['self', 'self', 'self']).slice();
    for (let i = 0; i < 3; i++) {
      if (how[i] === 'staff' && !(s.staff || []).find(x => STAFF_ROLES[x.role].stage === i)) how[i] = 'self';
    }
    const need = how.reduce((a, h, i) => a + (h === 'ai' ? aiCredits(s, i) : 0), 0);
    if (need > s.ai.credits) { for (let i = 0; i < 3; i++) if (how[i] === 'ai') how[i] = 'self'; if (!s.routine.on) log(s, 'AI 크레딧이 모자라 직접 만듭니다.', 'bad'); }
    else s.ai.credits -= need;
    const outsource = how[2] === 'self' && s.routine.outsource && s.money >= CONFIG.outsourceEdit.cost;
    if (outsource) s.money -= CONFIG.outsourceEdit.cost;
    s.job = { card, stage: 0, progress: 0, outsource, how };
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
    if (!s.job || s.job.partTime || s.gh < s.burnoutUntil || s.pendingEvent || lifeBusy(s)) return false;
    workHours(s, CONFIG.tapHours);
    return true;
  }
  function triggerBurnout(s) {
    s.burnoutUntil = s.gh + CONFIG.burnout.hours;
    s.favor = clamp(s.favor + CONFIG.burnout.favor, CONFIG.favor.min, CONFIG.favor.max);
    s.resting = true;
    if (s.life) s.life.mood = Math.max(0, s.life.mood - 25);
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
    s.uploadReady = { card: j.card, how: j.how, q: clamp(videoQuality(s, j.how) + rr(s, -CONFIG.qualityRand, CONFIG.qualityRand), 0, 100), thumbs: makeThumbs(s) };
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
    // 시청자 피로도: 최근 하루 평균 업로드가 0.5편을 넘으면 한 편당 조회수가 줄어든다
    s.upRate = (s.upRate || 0) + 1;
    const fatigue = 1 / (1 + Math.max(0, s.upRate / 7 - 0.5) * 1.4);
    let V = expectedViews(s, T, u.q) * R * th.real * fatigue;
    if (fatigue < 0.8 && !s._fatigueWarned) { s._fatigueWarned = true; log(s, '😮‍💨 시청자 피로도: 영상을 너무 자주 올려 한 편당 조회수가 줄고 있습니다.', 'bad'); }
    if (fatigue > 0.95) s._fatigueWarned = false;
    // 바이럴
    const vc = CONFIG.viral;
    let pv = u.q >= 80 ? vc.q80 : u.q >= 70 ? vc.q70 : vc.base;
    if (s.viralBoost) { pv *= s.viralBoost; s.viralBoost = 0; }
    pv *= G(s).viral;
    let viral = false;
    if (rnd(s) < pv) { V *= rr(s, vc.mul[0], vc.mul[1]); viral = true; }
    const vid = { avd: CONFIG.watchMinBase + CONFIG.watchMinPerQ * u.q, id: ++s.videoSeq, ai: (u.how || []).includes('ai'), local: !!u.card.local, topic: u.card.topic, q: u.q, ctr: th.real, V, views: 0, uploadGh: s.gh, income: 0, viral };
    s.videos.unshift(vid);
    if (s.videos.length > 60) s.videos.length = 60;
    s._lastQ = u.q;
    const usedAI = (u.how || []).includes('ai');
    s._lastAI = usedAI;
    if (usedAI) {
      const before = aiLevel(s); s.ai.made++; const after = aiLevel(s);
      if (after > before) log(s, `🤖 AI 숙련 레벨 업: ${AI_LEVELS[after].name}`, 'good');
      if (!s.ai.label && rnd(s) < 0.1) s._aiCaught = true;
      if (s.ai.label) V *= 0.95;
    }
    // 알고리즘 호감도 (1단계 임시 규칙: 품질·썸네일·업로드 주기)
    const f = CONFIG.favor;
    if (s.lastUploadGh !== null && s.gh - s.lastUploadGh <= f.gapDays * 24) s.streak++; else s.streak = 1;
    const target = f.base + f.perQ * u.q + f.perCtr * (th.real - 1) + (s.streak >= 4 ? f.streakBonus : 0);
    s.favor = clamp(s.favor + (target - s.favor) * f.rate, f.min, f.max);
    s.lastUploadGh = s.gh;
    if (s.life) s.life.mood = clamp(s.life.mood + (viral ? 12 : 4), 0, 100);
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

  // ───────── 후반: MCN, 자체 AI 모델, 엔딩 ─────────
  const MCN_COST = 50000000, MODEL_COST = 80000000, MODEL_DAYS = 30;
  const CREATOR_NAMES = ['먹보곰', '게임하는 토끼', '노래하는 별', '꿀팁박사', '여행가 J', '운동왕 민', '그림쟁이', '요리하는 아빠', '고양이 집사', '과학쌤', '캠핑러버', '댄스크루 A'];
  function canFoundMCN(s) { return !s.mcn && s.subs >= 500000 && staffCap(s) >= 6 && s.money >= MCN_COST; }
  function foundMCN(s) {
    if (!canFoundMCN(s)) return false;
    s.money -= MCN_COST; s.mcn = { creators: [], nextScoutGh: s.gh, scouts: [] };
    scoutCreators(s);
    log(s, '🏢 MCN 회사 설립! 소속 크리에이터를 영입하세요.', 'good');
    return true;
  }
  function scoutCreators(s) {
    s.mcn.scouts = [0, 1, 2].map(() => {
      const g = pick(s, Object.keys(GENRES)), subs = Math.round(rr(s, 20000, 200000));
      return { name: pick(s, CREATOR_NAMES), genre: g, subs, potential: Math.round(rr(s, 40, 95)), independence: Math.round(rr(s, 10, 90)), fee: Math.round(subs * 60 / 10000) * 10000 };
    });
    s.mcn.nextScoutGh = s.gh + 15 * 24;
  }
  function signCreator(s, i) {
    const c = s.mcn && s.mcn.scouts[i];
    if (!c || s.money < c.fee) return false;
    s.money -= c.fee; s.mcn.creators.push(Object.assign({ support: 1, since: s.gh }, c)); s.mcn.scouts.splice(i, 1);
    log(s, `🤝 ${GENRES[c.genre].icon} ${c.name} 영입! (구독자 ${fmt(c.subs)})`, 'good');
    return true;
  }
  function mcnTotalSubs(s) { return s.subs + (s.mcn ? s.mcn.creators.reduce((a, c) => a + c.subs, 0) : 0); }
  function canTrainModel(s) { return !s.ai.ownModel && !s.ai.training && aiLevel(s) >= 4 && s.ai.plan >= 3 && s.money >= MODEL_COST; }
  function trainModel(s) {
    if (!canTrainModel(s)) return false;
    s.money -= MODEL_COST; s.ai.training = { untilGh: s.gh + MODEL_DAYS * 24 };
    log(s, `🧠 내 채널 전용 AI 모델 학습 시작 (${MODEL_DAYS}일)`, 'good');
    return true;
  }
  const ENDINGS = {
    sale: { name: '채널 매각', desc: '채널을 팔고 다음 인생으로.' },
    mcn: { name: 'MCN 상장', desc: '소속 크리에이터 10명, 총 구독자 500만. 회사가 상장했다.' },
    aistudio: { name: 'AI 스튜디오', desc: '자체 AI 모델로 움직이는 콘텐츠 공장. 구독자 300만.' },
  };
  function endGame(s, type, score) {
    s.ended = { type, score: Math.round(score), gh: s.gh, subs: s.subs, videos: s.stats_videos || 0, income: s.totalIncome, realSec: s.realSec };
    log(s, `🏁 엔딩: ${ENDINGS[type].name}`, 'good');
  }
  function checkEndings(s) {
    if (s.ended) return;
    if (s.mcn && s.mcn.creators.length >= 10 && mcnTotalSubs(s) >= 5000000) endGame(s, 'mcn', mcnTotalSubs(s) * 10 + s.money);
    else if (s.ai.ownModel && s.subs >= 3000000 && s.ai.made >= 300) endGame(s, 'aistudio', s.subs * 15 + s.money);
    else if (s.subs >= 300000 && !s.pendingEvent && s.gh >= (s.saleOfferGh || 0)) {
      s.saleOfferGh = s.gh + 120 * 24;
      const price = Math.round((s.subs * 4000 + s.totalIncome * 0.5) / 1e6) * 1e6;
      s.pendingEvent = { id: 'saleoffer', price, title: '채널 매각 제안', text: `대형 미디어 회사가 채널을 ₩${fmt(price)}에 사겠다고 합니다. 받으면 게임이 끝납니다.`,
        choices: [{ label: `매각한다 (엔딩, 점수 ₩${fmt(price)})` }, { label: '거절하고 계속 키운다' }] };
    }
  }

  // ───────── 방 꾸미기 ─────────
  function buyDecor(s, id) {
    const D = DECOR_ITEMS[id];
    if (!D || s.money < D.price || s.subs < (D.unlock || 0)) return false;
    s.money -= D.price; s.decor.owned[id] = (s.decor.owned[id] || 0) + 1;
    if (D.place === 'theme') { s.decor.theme[s.house] = Object.assign({}, s.decor.theme[s.house], { [D.slot]: id }); }
    log(s, `🛋️ ${D.name} 구매!${D.place === 'theme' ? ' 바로 적용했습니다.' : ' 집 메뉴의 꾸미기에서 놓을 수 있습니다.'}`, 'good');
    return true;
  }
  function placedHere(s) { return s.decor.placed[s.house] || (s.decor.placed[s.house] = []); }
  function unplacedCount(s, id) {
    let used = 0; for (const h in s.decor.placed) used += s.decor.placed[h].filter(p => p.id === id).length;
    return (s.decor.owned[id] || 0) - used;
  }
  function footprint(id, x, z, rot) {
    const D = DECOR_ITEMS[id], w = (rot % 2 ? D.d : D.w) * DECOR_CELL, d = (rot % 2 ? D.w : D.d) * DECOR_CELL;
    return [x - w / 2, z - d / 2, x + w / 2, z + d / 2];
  }
  const overlap = (a, b) => a[0] < b[2] - 0.01 && a[2] > b[0] + 0.01 && a[1] < b[3] - 0.01 && a[3] > b[1] + 0.01;
  // 바닥: x,z는 놓을 중심(칸에 맞춤). 벽: wall='back'|'left', x(또는 z)는 벽을 따라가는 위치, y는 높이
  function canPlace(s, id, pos, ignoreIdx) {
    const D = DECOR_ITEMS[id]; if (!D || D.place === 'theme') return false;
    const L = roomLayout(s.house), hx = L.RW / 2, hz = L.RD / 2;
    const list = placedHere(s);
    if (D.place === 'wall') {
      const span = pos.wall === 'back' ? hx : hz, v = pos.wall === 'back' ? pos.x : pos.z;
      if (Math.abs(v) > span - 0.4 || pos.y < 0.9 || pos.y > 2.6) return false;
      return !list.some((p, i) => i !== ignoreIdx && DECOR_ITEMS[p.id].place === 'wall' && p.wall === pos.wall && Math.abs((pos.wall === 'back' ? p.x : p.z) - v) < 0.7 && Math.abs(p.y - pos.y) < 0.6);
    }
    const fp = footprint(id, pos.x, pos.z, pos.rot || 0);
    if (fp[0] < -hx - 0.01 || fp[2] > hx + 0.01 || fp[1] < -hz - 0.01 || fp[3] > hz + 0.01) return false;   // 벽에 붙여 놓을 수 있다
    if (!D.flat && L.blocked.some(b => overlap(fp, b))) return false;
    return !list.some((p, i) => i !== ignoreIdx && DECOR_ITEMS[p.id].place === 'floor' && !DECOR_ITEMS[p.id].flat === !D.flat && overlap(fp, footprint(p.id, p.x, p.z, p.rot || 0)));
  }
  function placeDecor(s, id, pos) {
    if (unplacedCount(s, id) <= 0 || !canPlace(s, id, pos)) return false;
    placedHere(s).push(Object.assign({ id }, pos));
    return true;
  }
  function moveDecor(s, idx, pos) {
    const p = placedHere(s)[idx]; if (!p || !canPlace(s, p.id, Object.assign({}, p, pos), idx)) return false;
    Object.assign(p, pos); return true;
  }
  function removeDecor(s, idx) { const l = placedHere(s); if (!l[idx]) return false; l.splice(idx, 1); return true; }
  function sellDecor(s, id) {
    if (unplacedCount(s, id) <= 0) return false;
    s.decor.owned[id]--; s.money += Math.round(DECOR_ITEMS[id].price * 0.5);
    return true;
  }
  // 아늑함: 지금 집에 놓인 것 + 벽지·바닥재
  function cozy(s) {
    let c = 0; for (const p of placedHere(s)) c += DECOR_ITEMS[p.id].cozy || 0;
    const th = s.decor.theme[s.house] || {}; for (const k in th) c += (DECOR_ITEMS[th[k]] || {}).cozy || 0;
    return c;
  }
  function cozyBonus(s) { const c = cozy(s); return { q: Math.min(4, c * 0.12), regen: Math.min(1.5, c * 0.05) }; }

  // ───────── 라이브 방송 (구독자 3천부터) ─────────
  function canLive(s) { return s.subs >= 3000 && canWork(s) && !s.live && s.stamina >= 25; }
  function startLive(s) {
    if (!canLive(s)) return false;
    s.live = { left: 24 }; s.stamina -= 25; s.stats_live = (s.stats_live || 0) + 1;
    return true;
  }
  function endLive(s) {
    s.live = null;
    const base = Math.pow(s.subs, 0.8) * 12 * (s.trait === 'charisma' ? 1.5 : 1) * (s.favor / 60);
    if (rnd(s) < 0.1) { const loss = 8; s.favor = clamp(s.favor - loss, CONFIG.favor.min, CONFIG.favor.max); log(s, `📛 라이브 방송 사고… 호감도 -${loss}`, 'bad'); }
    const inc = Math.round(base * rr(s, 0.7, 1.6));
    s.money += inc; s.totalIncome += inc; s.favor = clamp(s.favor + 2, CONFIG.favor.min, CONFIG.favor.max);
    s.subs += Math.round(s.subs * 0.004);
    log(s, `🔴 라이브 종료! 슈퍼챗 +₩${fmt(inc)}`, 'good');
  }
  // ───────── 멤버십 (구독자 3천부터, 월 정산) ─────────
  function memberIncome(s) {
    if (s.subs < 3000) return 0;
    const loyal = 0.006 * (s.trait === 'charisma' ? 1.15 : 1) * (hasStaff(s, 'community') ? 1.3 : 1) * (s.favor / 60);
    return Math.round(s.subs * loyal * 4900 / 1000) * 1000;
  }
  // ───────── 굿즈 (구독자 5만부터) ─────────
  const GOODS_COST = 3000000;
  function canGoods(s) { return s.subs >= 50000 && !s.goods && s.money >= GOODS_COST; }
  function makeGoods(s) {
    if (!canGoods(s)) return false;
    s.money -= GOODS_COST;
    const demand = s.subs * 0.012 * (s.favor / 60) * rr(s, 0.6, 1.5);
    s.goods = { left: 30 * 24, total: Math.round(demand * 18000), sold: 0 };
    log(s, `👕 굿즈 제작 (₩${fmt(GOODS_COST)}) — 30일 동안 팔립니다`, 'good');
    return true;
  }
  // ───────── 직원 채용 ─────────
  function staffCap(s) { return (HOUSES[s.house] || {}).staff || 0; }
  function refreshCandidates(s) {
    const roles = Object.keys(STAFF_ROLES);
    s.candidates = [0, 1, 2].map(() => {
      const role = pick(s, roles), ab = Math.round(rr(s, 45, 92));
      return { role, name: pick(s, NAMES), ability: ab, salary: Math.round(STAFF_ROLES[role].salary * (0.7 + ab / 150) / 1000) * 1000, aiAversion: Math.round(rr(s, 0, 80)) };
    });
    s.candRefreshGh = s.gh + 10 * 24;
  }
  function hire(s, idx) {
    const c = s.candidates[idx];
    if (!c || (s.staff || []).length >= staffCap(s)) return false;
    if (s.staff.find(x => x.role === c.role)) return false;
    const fee = c.salary * 0.5;
    if (s.money < fee) return false;
    s.money -= fee;
    s.staff.push(Object.assign({ mood: 75, since: s.gh }, c));
    s.candidates.splice(idx, 1);
    log(s, `🤝 ${STAFF_ROLES[c.role].name} ${c.name} 입사! (능력 ${c.ability}, 월급 ₩${fmt(c.salary)})`, 'good');
    return true;
  }
  function fire(s, idx) {
    const st = s.staff[idx]; if (!st) return false;
    s.staff.splice(idx, 1);
    for (let i = 0; i < 3; i++) if (s.pipeline[i] === 'staff' && STAFF_ROLES[st.role].stage === i) s.pipeline[i] = 'self';
    log(s, `${STAFF_ROLES[st.role].name} ${st.name} 퇴사`, 'info');
    return true;
  }
  function setPipeline(s, i, how) {
    if (how === 'staff' && !(s.staff || []).find(x => STAFF_ROLES[x.role].stage === i)) return false;
    s.pipeline[i] = how; return true;
  }
  function setAIPlan(s, p) {
    const P = AI_PLANS[p];
    if (!P || p === s.ai.plan || s.subs < P.unlock) return false;
    if (s.money < P.monthly) return false;
    s.money -= P.monthly; s.ai.plan = p; s.ai.credits = Math.max(s.ai.credits, P.credits);
    log(s, `🤖 AI ${P.name} 시작 (월 ₩${fmt(P.monthly)})`, 'good');
    return true;
  }
  // 30일마다 나가는 돈과 들어오는 돈
  function monthly(s) {
    const H = HOUSES[s.house];
    const sal = (s.staff || []).reduce((a, x) => a + x.salary, 0);
    return { rent: H.rent, ai: AI_PLANS[s.ai.plan].monthly, salary: sal, life: lifeMonthly(s), members: memberIncome(s) };
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

  // ───────────────────────── 생활 (배부름·청결·기분 → 컨디션) ─────────────────────────
  // 벌칙보다 보상 쪽: 잘 챙기면 '컨디션 최상'으로 품질·작업 속도가 오른다. 안 챙겨도 알아서 라면·샤워는 해서 게임이 멈추지는 않는다.
  // 수치는 게임 시간 1시간당. 1배속 기준 배부름 100→0 약 70초. 게임 1년이 실제 20분이라 끼니값은 상징적으로 싸게.
  const LIFE = {
    decay: { hunger: 0.6, clean: 0.35, mood: 0.22 },
    auto: { hunger: 35, clean: 30 },
    moodRest: 45,   // 기분은 가만두면 45 근처로 내려와 머문다 (방치해도 '보통'은 유지)
    tiers: [   // 컨디션 점수 = 배부름 40% + 청결 30% + 기분 30%
      { min: 70, name: '최상', icon: '😄', q: 2, speed: 1.15, regen: 1.1 },
      { min: 40, name: '보통', icon: '🙂', q: 0, speed: 1, regen: 1 },
      { min: 20, name: '지침', icon: '😩', q: -3, speed: 0.92, regen: 0.85 },
      { min: -1, name: '최악', icon: '😵', q: -6, speed: 0.8, regen: 0.6 },
    ],
  };
  // hours: 게임 시간 (1배속 1시간 = 0.42초). 캐릭터가 걸어가 하는 모습이 보이게 몇 시간씩.
  // at: 3D에서 캐릭터가 가는 곳. cost는 지역 배율(REGIONS.life)을 곱한다.
  const LIFE_ACTS = {
    ramen:    { name: '라면 끓이기', icon: '🍜', group: 'eat', cost: 300, hours: 3, hunger: 35, mood: -3, at: 'kitchen', say: '🍜 후루룩', desc: '싸고 빠르지만 기분이 조금 떨어져요' },
    cook:     { name: '집밥 요리', icon: '🍳', group: 'eat', cost: 800, hours: 5, hunger: 85, mood: 10, buff: 48, at: 'kitchen', say: '🍳 요리 중', desc: '든든함: 이틀 동안 품질 +1' },
    delivery: { name: '배달 시키기', icon: '🛵', group: 'eat', cost: 3000, hours: 0, wait: 2, hunger: 70, mood: 10, desc: '하던 일을 멈추지 않아요. 2시간 뒤 도착' },
    eatout:   { name: '밖에서 사 먹기', icon: '🍲', group: 'eat', cost: 4000, hours: 6, hunger: 95, mood: 25, at: 'outside', say: '', desc: '배부르고 기분도 좋아져요' },
    shower:   { name: '씻기', icon: '🚿', group: 'care', cost: 0, hours: 3, clean: 100, mood: 3, at: 'bath', say: '🚿 씻는 중', desc: '청결 가득' },
    tidy:     { name: '방 청소', icon: '🧹', group: 'care', cost: 0, hours: 4, clean: 25, mood: 6, at: 'room', say: '🧹 청소 중', desc: '청결 +25, 기분 +6' },
    walk:     { name: '동네 산책', icon: '🚶', group: 'fun', cost: 0, hours: 5, mood: 35, stamina: 10, at: 'outside', desc: '기분 +35, 체력 +10' },
    call:     { name: '친구와 통화', icon: '📞', group: 'fun', cost: 0, hours: 3, mood: 20, at: 'bedside', say: '📞 응응, 나 요즘…', desc: '기분 +20' },
    game:     { name: '게임 한 판', icon: '🎮', group: 'fun', cost: 0, hours: 4, mood: 25, at: 'desk', say: '🎮 한 판만 더…', desc: '기분 +25' },
  };
  const LIFE_GROUPS = { eat: '먹기', care: '씻기·청소', fun: '기분 전환' };
  // 게임머니로 사는 생활 자동화 (타이쿤식: 귀찮은 일을 돈으로 맡긴다)
  const LIFE_SERVICES = {
    mealkit: { name: '도시락 정기 배송', icon: '🍱', price: 0, monthly: 40000, unlock: 0, desc: '배고프면 알아서 도시락을 먹어요 (라면 대신, 기분 안 떨어짐)' },
    robot:   { name: '로봇청소기', icon: '🤖', price: 150000, monthly: 0, unlock: 300, desc: '청결이 절반 속도로 줄어요' },
    coffee:  { name: '커피머신', icon: '☕', price: 90000, monthly: 0, unlock: 100, desc: '기분이 천천히 줄고, 작업 중 기분 +' },
    helper:  { name: '가사 도우미', icon: '🧑‍🍳', price: 0, monthly: 300000, unlock: 10000, desc: '집밥과 청소를 맡아 줘요 (든든함 유지, 청결 가득)' },
  };

  function lifeScore(s) { const L = s.life; return L ? 0.4 * L.hunger + 0.3 * L.clean + 0.3 * L.mood : 70; }
  function lifeTier(s) { const sc = lifeScore(s); return LIFE.tiers.find(t => sc >= t.min); }
  function lifeQ(s) { if (!s.life) return 0; return lifeTier(s).q + (s.gh < (s.life.fullUntil || 0) ? 1 : 0); }
  function lifeCost(s, id) { const A = LIFE_ACTS[id], m = (REGIONS[s.region].life || {})[id] || 1; return Math.round(A.cost * m / 100) * 100; }
  function lifeBusy(s) { return !!(s.life && s.life.act); }
  function canLifeAct(s, id) {
    const A = LIFE_ACTS[id];
    if (!A || !s.life || s.pendingEvent || s.moving || s.live || s.ended) return { ok: false, why: '지금은 못 해요' };
    if (s.gh < s.burnoutUntil) return { ok: false, why: '번아웃 휴식 중' };
    if (s.job && s.job.partTime) return { ok: false, why: '알바 중' };
    if (A.hours > 0 && s.life.act) return { ok: false, why: '다른 일을 하는 중' };
    if (id === 'delivery' && s.life.delivery) return { ok: false, why: '배달 오는 중' };
    const c = lifeCost(s, id);
    if (c > 0 && s.money < c) return { ok: false, why: '돈이 모자라요' };
    return { ok: true };
  }
  function lifeAct(s, id, quiet) {
    if (!canLifeAct(s, id).ok) return false;
    const A = LIFE_ACTS[id], c = lifeCost(s, id);
    s.money -= c;
    if (!quiet) s.resting = false;   // 직접 누르면 쉬던 걸 멈추고, 자동으로 챙길 때는 쉬는 중에도 그대로
    if (A.wait) { s.life.delivery = { id, at: s.gh + A.wait * (REGIONS[s.region].deliveryWait || 1) }; if (!quiet) log(s, `${A.icon} 배달 주문! 곧 도착해요`, 'info'); return true; }
    s.life.act = { id, left: A.hours, total: A.hours };
    if (!quiet) log(s, `${A.icon} ${A.name}${c ? ` (₩${fmt(c)})` : ''}`, 'info');
    return true;
  }
  function applyLife(s, A) {
    const L = s.life;
    if (A.hunger) L.hunger = clamp(L.hunger + A.hunger, 0, 100);
    if (A.clean) L.clean = clamp(L.clean + A.clean, 0, 100);
    if (A.mood) L.mood = clamp(L.mood + A.mood, 0, 100);
    if (A.stamina) s.stamina = Math.min(maxStamina(s), s.stamina + A.stamina);
    if (A.buff) L.fullUntil = s.gh + A.buff;
  }
  function buyService(s, id) {
    const V = LIFE_SERVICES[id];
    if (!V || s.life.svc[id] || s.subs < V.unlock || s.money < V.price) return false;
    s.money -= V.price; s.life.svc[id] = true;
    log(s, `${V.icon} ${V.name} 시작!`, 'good');
    return true;
  }
  function stopService(s, id) { if (!s.life.svc[id] || !LIFE_SERVICES[id].monthly) return false; s.life.svc[id] = false; log(s, `${LIFE_SERVICES[id].name} 해지`, 'info'); return true; }
  function lifeMonthly(s) { let m = 0; if (s.life) for (const k in s.life.svc) if (s.life.svc[k]) m += LIFE_SERVICES[k].monthly; return m; }

  function lifeStep(s, h) {
    const L = s.life; if (!L) return;
    const sv = L.svc, D = LIFE.decay;
    const working = s.job && !s.job.partTime && stageMethod(s, s.job.stage) === 'self';
    L.hunger = clamp(L.hunger - D.hunger * h * (working ? 1.15 : 1), 0, 100);
    L.clean = clamp(L.clean - D.clean * h * (sv.robot ? 0.5 : 1), 0, 100);
    let md = D.mood * (sv.coffee ? 0.6 : 1);
    if (L.hunger < 15) md += 0.6;
    if (L.clean < 15) md += 0.4;
    if (L.mood > LIFE.moodRest || L.hunger < 15 || L.clean < 15) L.mood = clamp(L.mood - md * h, 0, 100);
    if (sv.helper) { L.clean = Math.max(L.clean, 85); }
    // 하던 생활 행동
    if (L.act) {
      L.act.left -= h;
      if (L.act.left <= 0) { const A = LIFE_ACTS[L.act.id]; L.act = null; applyLife(s, A); }
    }
    if (L.delivery && s.gh >= L.delivery.at) { const A = LIFE_ACTS[L.delivery.id]; L.delivery = null; applyLife(s, A); L.courier = (L.courier || 0) + 1; log(s, '🛵 배달 왔어요! 맛있게 먹었습니다', 'good'); }
    // 자동으로 챙기기 (방치해도 멈추지 않게)
    if (L.hunger < LIFE.auto.hunger && !L.delivery) {
      if (sv.helper) { applyLife(s, LIFE_ACTS.cook); L.autoN = (L.autoN || 0) + 1; }
      else if (sv.mealkit) { applyLife(s, { hunger: 60, mood: 2 }); L.autoN = (L.autoN || 0) + 1; }
      else if (!L.act && canLifeAct(s, 'ramen').ok) { lifeAct(s, 'ramen', true); L.mood = Math.min(100, L.mood + 2); L.autoN = (L.autoN || 0) + 1; }
      else if (!L.act && L.hunger < 10) { applyLife(s, { hunger: 25, mood: -2 }); }   // 돈이 없으면 집에 있는 걸로 대충 때운다
    }
    if (L.clean < LIFE.auto.clean && !L.act && canLifeAct(s, 'shower').ok) lifeAct(s, 'shower', true);
  }

  // ───────────────────────── 이벤트 ─────────────────────────
  function rollEvent(s) {
    const pool = ['sale', 'gift'];
    if (s.ai.made > 0 && s.ai.plan > 0) pool.push('aiprice', 'aiupdate');
    if (s.subs >= 200) { pool.push('copyright'); if (s.genre === 'music') pool.push('copyright', 'copyright'); if (s._lastAI) pool.push('copyright'); }
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
    else if (id === 'copyright') s.pendingEvent = { id, title: '저작권 경고', text: '최근 영상의 배경음악(또는 생성물)이 저작권 신고를 받았습니다.', choices: [{ label: '영상 비공개 (그 영상 조회수 중단)' }, { label: '수익을 원작자에게 양도 (₩' + fmt(Math.min(5000000, Math.max(30000, s.subs * 8))) + ')' }, { label: '이의 제기 (40% 승리, 지면 호감도 -10)' }] };
    else if (id === 'aiprice') s.pendingEvent = { id, title: 'AI 구독료 인상', text: `AI 서비스가 다음 달부터 요금을 20% 올린다고 합니다.`, choices: [{ label: `이번 달 차액만 내고 유지 (₩${fmt(AI_PLANS[s.ai.plan].monthly * 0.2)})` }, { label: '한 단계 낮은 요금제로' }] };
    else if (id === 'aiupdate') s.pendingEvent = { id, title: 'AI 모델 업데이트', text: '새 AI 모델이 나왔습니다. 프롬프트를 다시 익혀야 합니다.', choices: [{ label: '새 모델로 갈아탄다 (숙련 경험 -5, 호감도 +2)' }, { label: '익숙한 모델 유지' }] };
    else if (REGION_EVENTS[id]) s.pendingEvent = Object.assign({ id }, REGION_EVENTS[id].make(s));
    else if (id === 'sponsor') s.pendingEvent = { id, title: '소규모 협찬 문의', text: '앱 회사가 영상 중간 광고를 제안했습니다.',
      choices: [ { label: `수락 (₩${fmt(sponsorPay(s))}, 호감도 -4)` }, { label: '거절 (호감도 +1)' } ] };
  }
  function sponsorPay(s) { return Math.round((50000 + s.subs * 40) * ((REGIONS[s.region] || {}).sponsorMul || 1) * (hasStaff(s, 'manager') ? 1.5 : 1) * G(s).sponsor / 1000) * 1000; }
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
    if (e.id === 'quit') {
      const idx = s.staff.findIndex(x => x.name === e.staffName);
      if (idx >= 0) {
        if (ci === 0) {
          const st = s.staff[idx], cap = STAFF_ROLES[st.role].salary * 3;
          st.salary = Math.min(cap, Math.round(st.salary * 1.3 / 1000) * 1000); st.mood = 85; st.aiAversion = Math.round(st.aiAversion * 0.6);
        }
        else { const R = STAFF_ROLES[s.staff[idx].role]; fire(s, idx); if (ci === 2 && R.stage != null) s.pipeline[R.stage] = 'ai'; }
      }
      return true;
    }
    if (e.id === 'aicaught') { fav(-20); s.ai.label = true; return true; }
    if (e.id === 'saleoffer') { if (ci === 0) endGame(s, 'sale', e.price); return true; }
    if (e.id === 'indep') {
      const idx = s.mcn.creators.findIndex(c => c.name === e.cname);
      if (idx >= 0) { const c = s.mcn.creators[idx]; if (ci === 0) c.support = 0.9; else if (ci === 1) { s.mcn.creators.splice(idx, 1); log(s, `${c.name} 독립`, 'info'); } else fav(-8); }
      return true;
    }
    if (e.id === 'copyright') {
      if (ci === 0) { const v = s.videos[0]; if (v) { v.V = v.views; v.tailAdded = true; } log(s, '영상을 비공개로 돌렸습니다.', 'info'); }
      else if (ci === 1) s.money -= Math.min(5000000, Math.max(30000, s.subs * 8));
      else if (rnd(s) < 0.4) log(s, '이의 제기 승리!', 'good'); else { fav(-10); log(s, '이의 제기 실패… 호감도 -10', 'bad'); }
      return true;
    }
    if (e.id === 'aiprice') { if (ci === 1 && s.ai.plan > 0) { s.ai.plan--; log(s, `AI ${AI_PLANS[s.ai.plan].name}(으)로 낮췄습니다.`, 'info'); } else s.money -= Math.round(AI_PLANS[s.ai.plan].monthly * 0.2); return true; }
    if (e.id === 'aiupdate') { if (ci === 0) { s.ai.made = Math.max(0, s.ai.made - 5); fav(2); } return true; }
    if (e.id === 'viral') {
      if (ci === 0) { s.nextVideoBoost = 1.8; fav(5); log(s, '후속편 준비! 다음 영상 트렌드 효과 ×1.8', 'good'); }
      else { const p = sponsorPay(s) * 2; s.money += p; log(s, `협찬 문의 수익 ₩${fmt(p)}`, 'good'); }
    } else if (e.id === 'hate') {
      if (ci === 0) { fav(-5); log(s, '사과 영상으로 수습했습니다.', 'info'); }
      else if (ci === 1) {
        if (rnd(s) < (hasStaff(s, 'community') ? 0.25 : 0.5)) { const lost = Math.round(s.subs * 0.05); s.subs -= lost; fav(-10); log(s, `논란 확산… 구독자 -${fmt(lost)}, 호감도 -10`, 'bad'); }
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
    { id: 'ai1', text: 'AI로 영상 만들어 보기', done: s => s.ai && s.ai.made >= 1, reward: 100000 },
    { id: 'live1', text: '첫 라이브 방송', done: s => s.stats_live >= 1, reward: 200000 },
    { id: 'hire1', text: '첫 직원 채용', done: s => s.staff && s.staff.length >= 1, reward: 300000 },
    { id: 'decor3', text: '방에 꾸미기 아이템 3개 놓기', done: s => s.decor && (s.decor.placed[s.house] || []).length >= 3, reward: 100000 },
    { id: 'v30', text: '영상 30편', done: s => (s.stats_videos || 0) >= 30, reward: 500000 },
    { id: 's5k', text: '구독자 5,000명', done: s => s.subs >= 5000, reward: 800000 },
    { id: 's10k', text: '구독자 10,000명 (1단계 목표)', done: s => s.subs >= 10000, reward: 2000000 },
    { id: 's50k', text: '구독자 5만', done: s => s.subs >= 50000, reward: 5000000 },
    { id: 's100k', text: '구독자 10만 — 실버 버튼', done: s => s.subs >= 100000, reward: 10000000 },
    { id: 's500k', text: '구독자 50만 — MCN 설립 가능', done: s => s.subs >= 500000, reward: 30000000 },
    { id: 's1m', text: '구독자 100만 — 골드 버튼', done: s => s.subs >= 1000000, reward: 100000000 },
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
    const inc = dv * ((s.monetized ? G(s).rpm : 0) + g.affiliatePerView * G(s).aff);
    s.money += inc; s.totalIncome += inc;
    return inc;
  }

  // dt: 게임 시간(시간). realDt: 같은 구간의 실시간(초, 부스트 타이머용)
  function advance(s, dt, realDt) {
    s.realSec += realDt || 0;
    while (dt > 1e-9) {
      if (s.pendingEvent || s.ended) return;       // 선택지가 뜨거나 엔딩이면 시간 정지
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
      s.stamina = Math.min(ms, s.stamina + (CONFIG.staminaRegen.resting + effects(s).regen) * h * (s.life ? lifeTier(s).regen : 1));
      if (!burnt && s.resting && s.stamina >= ms) { s.resting = false; if (!s.routine.on) log(s, '휴식 끝, 체력 가득!', 'info'); }
    } else if (s.job && s.job.partTime) {
      s.job.left -= h;
      if (s.job.left <= 0) { const pay = partPay(s); s.job = null; s.money += pay; log(s, `알바 끝 +₩${fmt(pay)}`, 'info'); }
    } else if (s.job) {
      const selfNow = stageMethod(s, s.job.stage) === 'self' && !(s.job.stage === 2 && s.job.outsource);
      const paused = selfNow && lifeBusy(s);      // 밥 먹거나 씻는 동안 직접 하던 작업은 멈춘다
      s.stamina = Math.min(ms, s.stamina + (selfNow && !paused ? CONFIG.staminaRegen.working : CONFIG.staminaRegen.idle) * h);
      if (!paused) workHours(s, h);
    } else {
      s.stamina = Math.min(ms, s.stamina + CONFIG.staminaRegen.idle * h);
    }

    lifeStep(s, h);
    // 이사
    if (s.moving && t1 >= s.moving.untilGh) finishMove(s);
    // 라이브
    if (s.live) { s.live.left -= h; if (s.live.left <= 0) endLive(s); }
    // 굿즈 판매
    if (s.goods) {
      const k = Math.min(h, s.goods.left) / (30 * 24), inc = s.goods.total * k;
      s.money += inc; s.totalIncome += inc; s.goods.sold += inc; s.goods.left -= h;
      if (s.goods.left <= 0) { log(s, `👕 굿즈 판매 마감: 총 ₩${fmt(s.goods.sold)}`, 'good'); s.goods = null; }
    }
    // 직원 기분: 일하면 조금씩 지치고, 쉬면 회복. AI가 그 직원 일을 대신하면 AI 거부감만큼 떨어진다
    if (s.staff && s.staff.length) {
      for (const st of s.staff.slice()) {
        const R = STAFF_ROLES[st.role];
        const busy = s.job && !s.job.partTime && R.stage != null && s.job.how && s.job.how[R.stage] === 'staff';
        const replaced = R.stage != null && s.pipeline[R.stage] === 'ai';
        st.mood = clamp(st.mood + h / 24 * (busy ? -0.6 : 0.8) - (replaced ? h / 24 * st.aiAversion / 40 : 0), 0, 100);
        if (st.mood < 20 && !s.pendingEvent) {
          s.pendingEvent = { id: 'quit', staffName: st.name, title: '직원 퇴사 통보', text: `${R.name} ${st.name}이(가) 그만두겠다고 합니다. (기분 ${Math.round(st.mood)})`,
            choices: [{ label: `월급 인상하고 붙잡기 (₩${fmt(Math.min(STAFF_ROLES[st.role].salary * 3, st.salary * 1.3))}/월, AI 거부감 완화)` }, { label: '보내 준다' }, { label: 'AI로 대체한다 (그 단계를 AI로)' }] };
        }
      }
    }
    if (staffCap(s) > 0 && t1 >= (s.candRefreshGh || 0)) refreshCandidates(s);
    if (s.mcn) {
      for (const c of s.mcn.creators) {
        const g = (0.0025 + c.potential / 100 * 0.004) * c.support * (h / 24);
        c.subs += c.subs * g;
        const inc = c.subs * 0.4 * (h / 24) * 0.2;      // 소속 크리에이터 수익의 20%
        s.money += inc; s.totalIncome += inc;
        if (c.subs > s.subs && !c.askedIndep && !s.pendingEvent && rnd(s) < 0.02 * c.independence / 50) {
          c.askedIndep = true;
          s.pendingEvent = { id: 'indep', cname: c.name, title: '크리에이터 독립 요구', text: `${c.name}의 구독자(${fmt(c.subs)})가 대표님 채널보다 많아졌습니다. 독립하겠다고 합니다.`,
            choices: [{ label: '수익 배분 재협상 (내 몫 20%→12%, 남는다)' }, { label: '보내 준다' }, { label: '계약을 근거로 붙잡는다 (호감도 -8)' }] };
        }
      }
      if (t1 >= s.mcn.nextScoutGh) scoutCreators(s);
    }
    if (s.ai.training && t1 >= s.ai.training.untilGh) { s.ai.training = null; s.ai.ownModel = true; log(s, '🧠 전용 AI 모델 완성! AI 티 소멸, AI 품질 +15, 크레딧 불필요', 'good'); }
    checkEndings(s);
    if (s._aiCaught && !s.pendingEvent) {
      s._aiCaught = false;
      s.pendingEvent = { id: 'aicaught', title: 'AI 표시 미이행 적발', text: 'AI로 만든 영상에 표시를 안 한 것이 들통났습니다.', choices: [{ label: '사과하고 앞으로 자동 표시 (호감도 -20)' }] };
    }
    // 월세
    if (t1 >= s.nextRentGh) {
      const mo = monthly(s), rent = mo.rent;
      s.nextRentGh += RENT_DAYS * 24;
      const out = mo.rent + mo.ai + mo.salary + (mo.life || 0);
      s.money += mo.members - out; s.totalIncome += mo.members;
      if (out || mo.members) log(s, `📅 월 정산: 월세 ₩${fmt(mo.rent)} · AI ₩${fmt(mo.ai)} · 월급 ₩${fmt(mo.salary)}${mo.life ? ` · 생활 ₩${fmt(mo.life)}` : ''}${mo.members ? ` · 멤버십 +₩${fmt(mo.members)}` : ''}`, s.money < 0 ? 'bad' : 'info');
      s.ai.credits = Math.max(Math.min(s.ai.credits, AI_PLANS[s.ai.plan].credits * 2), AI_PLANS[s.ai.plan].credits);
      if (s.money < 0) (s.staff || []).forEach(x => { x.mood -= 20; });
      if (rent < 0) {}
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
      const dv = s.tailRate * (h / 24) * (1 + 0.08 * seoLv(s)) * G(s).tail;
      addViews(s, dv, s.tailQ);
      s.tailRate *= Math.exp(-h / (CONFIG.tailTauDays * 24));
    }

    s.upRate = (s.upRate || 0) * Math.exp(-h / (7 * 24));
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
      log(s, `알고리즘 개편: ${G(s).name} 노출 ×${s.algoMul.toFixed(2)}`, s.algoMul >= 1 ? 'good' : 'bad');
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
    if (s.life) { s.life.act = null; s.life.hunger = Math.max(s.life.hunger, 60); s.life.clean = Math.max(s.life.clean, 60); }
    return { realSec: sec, money: s.money - before.money, subs: s.subs - before.subs, views: s.totalViews - before.views };
  }

  // 옛 저장(v1) → v2: 도시 원룸에서 지내던 것으로
  function migrate(s) {
    if (!s.region) { s.region = 'city'; s.house = 'oneroom'; s.moving = null; s.nextRentGh = s.gh + RENT_DAYS * 24; s.debtDays = 0; }
    for (const k in EQUIP) if (s.equip[k] == null) s.equip[k] = 0;
    if (!s.genre) s.genre = 'info';
    if (!s.decor) s.decor = { owned: {}, placed: {}, theme: {} };
    if (!s.ai) s.ai = { plan: 0, credits: AI_PLANS[0].credits, made: 0, label: true };
    if (!s.pipeline) s.pipeline = ['self', 'self', 'self'];
    if (!s.staff) s.staff = [];
    if (!s.candidates) { s.candidates = []; s.candRefreshGh = 0; }
    if (s.stamina == null || isNaN(s.stamina)) s.stamina = CONFIG.maxStaminaBase;
    if (!s.life) s.life = newLife();
    if (!s.life.svc) s.life.svc = {};
    s.v = 3;
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
    LIFE, LIFE_ACTS, LIFE_GROUPS, LIFE_SERVICES, lifeScore, lifeTier, lifeQ, lifeCost, lifeBusy, canLifeAct, lifeAct, buyService, stopService,
    DECOR_CATS, DECOR_ITEMS, DECOR_CELL, roomLayout, buyDecor, placedHere, unplacedCount, canPlace, placeDecor, moveDecor, removeDecor, sellDecor, cozy, cozyBonus, footprint,
    SEASONS, SEASON_LOCAL, season, GENRES, CONFIG, EQUIP, GROUPS, SKILLS, TRAITS, PACKS, START_SETS, QUESTS, ROUTINE_PRICE, REGIONS, HOUSES, MOVE_DAYS, RENT_DAYS,
    housesOf, effEquip, moveCost, canMove, moveHouse, partPay, migrate,
    AI_PLANS, AI_LEVELS, STAFF_ROLES, GOODS_COST, aiLevel, aiCredits, videoQuality, stageQuality, stageHoursBy, setPipeline, setAIPlan,
    ENDINGS, MCN_COST, MODEL_COST, canFoundMCN, foundMCN, scoutCreators, signCreator, mcnTotalSubs, canTrainModel, trainModel,
    canLive, startLive, memberIncome, canGoods, makeGoods, staffCap, refreshCandidates, hire, fire, monthly, hasStaff,
    newGame, advance, offline, tap, startVideo, upload, partTime, buyEquip, buySkill, buyRoutine,
    applyPack, resolveEvent, refreshTrends, bestThumbIdx, bestCardIdx, cheapestNext, equipNext, skillCost,
    baseQuality, maxStamina, convRate, cardViewRange, stageHours, canWork, effects, thumbLv, seoLv,
    fmt, gameDate, ghPerRealSec,
  };
})(typeof window !== 'undefined' ? window : globalThis);