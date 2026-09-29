// 게임 데이터: 파일럿, 로봇 스탯, 스킬, 스테이지

// 기술표 문자열의 {atk} {hvy} {grd} {jump} {dash} {act} 는 현재 키 설정으로 바꿔서 보여준다 (input.js fmtKeys)
export const COMMON_MOVES = [
  { input: '{atk} {atk} {atk}', name: '기본 3연타', desc: '마지막 발차기가 상대를 날려 보냅니다' },
  { input: '띄운 직후 {jump}', name: '추격 점프', desc: '띄운 상대에게 날아올라 공중 콤보로 이어집니다' },
  { input: '공중에서 {atk} 연타', name: '공중 콤보', desc: '마지막 타는 땅으로 내려찍어 튕겨 오르게 합니다' },
  { input: '{dash} 중 {atk}', name: '태클', desc: '대시 속도를 실은 몸통 박치기' },
  { input: '{grd} 누르고 있기', name: '가드', desc: '앞에서 오는 공격을 막습니다. 강공격은 가드를 부숩니다' },
  { input: '게이지 MAX 로 {act}', name: '당근 리모컨', desc: '맞는 중에도 가능. 배리어가 주변을 밀어내고 로봇이 떨어질 때까지 지켜줍니다' },
];

// hp/speed/jump: 사람 상태 능력치. reach: 발차기 판정 배율. dmgTaken: 받는 피해 배율. gaugeMul: 게이지 충전 배율
// airJumps: 공중 추가 점프 횟수. airChain: 공중 콤보 최대 타수. parry: 저스트 가드
// robot: 탑승 보너스 (armor 내구도, speed 이동, cd 쿨다운, board 탑승 시간 배율)
// acts: 파일럿 전용 기술 (actions.js HUMAN_ACTS 의 이름)
export const PILOTS = [
  {
    id: 'rico', name: '리코', body: 0xff4d4d, accent: 0x2b3a67, skin: 0xffd3ae, hair: 0x3a2418, style: 0, color: 0xff4d5e,
    desc: '돌격형 복서', role: '파워',
    hp: 115, speed: 7.0, jump: 11.5, reach: 1, dmgTaken: 0.9, gaugeMul: 1, airJumps: 0, airChain: 3, parry: false, armorHeavy: true,
    robot: { armor: 1.12, speed: 1, cd: 1, board: 1 },
    acts: { heavy: 'ricoCharge', launcher: 'ricoUpper', dashHvy: 'ricoRush', airHvy: 'ricoMeteor' },
    stats: { power: 5, speed: 2, air: 2, tech: 2 },
    traits: ['맷집: 받는 피해 -10%, 체력 115', '강공격 중 슈퍼 아머 (약공격에 끊기지 않음)', '탑승 시 로봇 내구도 +12%'],
    moves: [
      { input: '{hvy} 누르고 있다 떼기', name: '캐럿 스트레이트', desc: '오래 모을수록 강해지는 가드 브레이크 펀치' },
      { input: '{atk} {atk} {hvy}', name: '로켓 어퍼', desc: '함께 솟구치는 어퍼컷. 바로 공중 콤보로' },
      { input: '{dash} 중 {hvy}', name: '러시 블로', desc: '슈퍼 아머로 밀고 들어가는 2연타' },
      { input: '공중에서 {hvy}', name: '메테오 훅', desc: '땅으로 내리꽂으며 작은 충격파' },
    ],
  },
  {
    id: 'mimi', name: '미미', body: 0xffc21f, accent: 0x5b3cc4, skin: 0xffe0c4, hair: 0xff8fb8, style: 2, color: 0xffc21f,
    desc: '토끼 후드 말괄량이', role: '기동',
    hp: 88, speed: 8.4, jump: 12.5, reach: 0.95, dmgTaken: 1.05, gaugeMul: 1.25, airJumps: 1, airChain: 3, parry: false,
    robot: { armor: 1, speed: 1, cd: 1, board: 0.55 },
    acts: { heavy: 'mimiBoomerang', launcher: 'mimiHop', dashHvy: 'mimiRoll', airHvy: 'mimiStamp' },
    stats: { power: 2, speed: 5, air: 4, tech: 3 },
    traits: ['2단 점프, 가장 빠른 발', '당근 게이지 충전 +25%', '탑승 시간 45% 단축'],
    moves: [
      { input: '{hvy}', name: '당근 부메랑', desc: '던지면 돌아오는 부메랑. 갈 때와 올 때 두 번 맞힘' },
      { input: '{atk} {atk} {hvy}', name: '바니 호핑킥', desc: '깡충 뛰어오르며 띄우기' },
      { input: '{dash} 중 {hvy}', name: '토끼 구르기', desc: '무적 구르기 후 올려차기' },
      { input: '공중에서 {hvy}', name: '엉덩방아 스탬프', desc: '수직 낙하 후 주변에 충격파' },
    ],
  },
  {
    id: 'jun', name: '준', body: 0x2fb8ff, accent: 0x1d2340, skin: 0xf0c49c, hair: 0x1b1b24, style: 1, color: 0x2fb8ff,
    desc: '캡모자 스트리트 파이터', role: '카운터',
    hp: 100, speed: 7.6, jump: 11.5, reach: 1, dmgTaken: 1, gaugeMul: 1, airJumps: 0, airChain: 3, parry: true,
    robot: { armor: 1, speed: 1, cd: 0.82, board: 1 },
    acts: { heavy: 'junSweep', launcher: 'junKnee', dashHvy: 'junSlide', airHvy: 'junAxe' },
    stats: { power: 3, speed: 3, air: 3, tech: 5 },
    traits: ['저스트 가드: 맞기 직전 가드하면 패리 (로봇 공격도 튕겨냄)', '패리 후 다음 공격 피해 1.5배', '로봇 스킬 쿨다운 -18%'],
    moves: [
      { input: '맞기 직전 {grd}', name: '저스트 가드', desc: '공격을 튕겨내고 상대를 경직시킵니다' },
      { input: '{hvy}', name: '스트리트 스윕', desc: '가드를 무시하고 넘어뜨리는 다리 후리기' },
      { input: '{atk} {atk} {hvy}', name: '라이징 니', desc: '무릎으로 올려 띄우기' },
      { input: '{dash} 중 {hvy}', name: '슬라이딩', desc: '낮게 미끄러져 넘어뜨리기' },
      { input: '공중에서 {hvy}', name: '액스 킥', desc: '내려찍어 상대를 바닥에 튕깁니다' },
    ],
  },
  {
    id: 'sora', name: '소라', body: 0x39d98a, accent: 0x6b2d5c, skin: 0xffd9bf, hair: 0xe8e8f0, style: 3, color: 0x39d98a,
    desc: '포니테일 킥복서', role: '공중전',
    hp: 95, speed: 7.8, jump: 12.5, reach: 1.22, dmgTaken: 1, gaugeMul: 1, airJumps: 0, airChain: 5, parry: false,
    robot: { armor: 1, speed: 1.12, cd: 1, board: 1 },
    acts: { heavy: 'soraSpin', launcher: 'soraFlip', dashHvy: 'soraKnee', airHvy: 'soraSwallow' },
    stats: { power: 3, speed: 4, air: 5, tech: 3 },
    traits: ['긴 리치: 발차기 판정 +22%', '공중 콤보 최대 5타', '탑승 시 로봇 이동 속도 +12%'],
    moves: [
      { input: '{hvy}', name: '회오리 킥', desc: '빙글 돌며 주변을 여러 번 차기' },
      { input: '{atk} {atk} {hvy}', name: '서머솔트', desc: '공중제비로 함께 떠오르며 띄우기' },
      { input: '{dash} 중 {hvy}', name: '플라잉 니', desc: '멀리 날아가는 무릎 차기' },
      { input: '공중에서 {hvy}', name: '제비 차기', desc: '공중에서 회전하며 주변 휩쓸기' },
    ],
  },
];

// 스테이지: 좁아도 입체적으로. 지형은 arena.js 의 setStage(id) 가 만든다
export const STAGES = [
  { id: 'farm', name: '당근 농장 섬', desc: '언덕, 건초 더미, 점프 버섯이 있는 기본 섬' },
  { id: 'fort', name: '풍차 요새', desc: '가운데 높은 요새와 경사로, 바닥 구멍' },
  { id: 'sky', name: '구름 정원', desc: '작은 섬들을 움직이는 발판과 점프대로 잇는 공중 정원' },
];

export const ROBOT_ORDER = ['titan', 'bolt', 'cannon', 'hammer'];

// speed: 이동속도, armor: 내구도, power/speed/range 는 선택 화면 표시용 (0~5)
export const ROBOT_STATS = {
  titan: {
    tag: '파워', speed: 9.2, armor: 380, jump: 15,
    bars: { power: 5, speed: 2, range: 3, armor: 4 },
    skills: [
      { key: 'J', name: '타이탄 펀치', desc: '묵직한 2연타 스트레이트' },
      { key: 'K', name: '로켓 펀치', desc: '주먹을 발사해 일직선으로 날려버림', cd: 3.6 },
      { key: 'L', name: '캐럿 스톰프', desc: '뛰어올라 내려찍는 광역 충격파', cd: 7 },
    ],
  },
  bolt: {
    tag: '스피드', speed: 13.5, armor: 270, jump: 17,
    bars: { power: 3, speed: 5, range: 2, armor: 2 },
    skills: [
      { key: 'J', name: '볼트 킥', desc: '빠른 3연속 킥' },
      { key: 'K', name: '드릴 이어 대시', desc: '귀를 드릴로 바꿔 돌진', cd: 3 },
      { key: 'L', name: '토네이도 킥', desc: '회전하며 주변을 휩쓸기', cd: 6 },
    ],
  },
  cannon: {
    tag: '원거리', speed: 9.4, armor: 310, jump: 14,
    bars: { power: 3, speed: 3, range: 5, armor: 3 },
    skills: [
      { key: 'J', name: '캐럿 블래스터', desc: '양손 연사 에너지탄' },
      { key: 'K', name: '당근 미사일', desc: '유도 당근 미사일 6발', cd: 5 },
      { key: 'L', name: '문 레이저', desc: '충전 후 눈에서 거대한 레이저', cd: 9 },
    ],
  },
  hammer: {
    tag: '광역', speed: 8.6, armor: 420, jump: 13.5,
    bars: { power: 5, speed: 2, range: 4, armor: 5 },
    skills: [
      { key: 'J', name: '해머 스윙', desc: '거대한 당근 해머 2연타' },
      { key: 'K', name: '해머 스핀', desc: '해머를 휘두르며 회전 돌진', cd: 6 },
      { key: 'L', name: '메가 슬램', desc: '대지를 가르는 초대형 내려찍기', cd: 8 },
    ],
  },
};

export const DIFFICULTY = [
  { name: '쉬움', react: 0.45, aggro: 0.45, guard: 0.1, skill: 0.35, steal: 0.15, dmgTaken: 0.85 },
  { name: '보통', react: 0.28, aggro: 0.7, guard: 0.3, skill: 0.6, steal: 0.45, dmgTaken: 1 },
  { name: '어려움', react: 0.14, aggro: 0.95, guard: 0.55, skill: 0.9, steal: 0.8, dmgTaken: 1.1 },
];

export const RULES = {
  matchTime: 180,
  humanHp: 100,
  gaugeMax: 100,
  gaugePassive: 2.6,     // 초당
  gaugeDeal: 1.1,        // 가한 피해당
  gaugeTake: 0.7,        // 받은 피해당
  boardOwner: 0.8,
  boardOther: 2.2,
  boardRange: 1.6,
  robotDrain: 3,         // 탑승 중 초당 내구도 감소
  robotIdleLife: 30,     // 빈 로봇 유지 시간
  arenaFallY: -14,
  // 소환 배리어: 리모컨을 누른 순간부터 로봇 착지 뒤까지 소환자를 지킨다
  shieldTime: 5.5,        // 최대 지속 (로봇이 늦게 떨어져도 여기서 끝)
  shieldAfterLand: 2.2,   // 착지 후 추가 지속
  shieldRadius: 4.2,      // 발동 순간 밀어내는 반경
  // 콤보
  comboWindow: 1.1,       // 다음 타까지 허용 시간
  comboScaleFrom: 5,      // 이 타수부터 피해 감소
  comboScaleMin: 0.45,
  comboGauge: 0.8,        // 콤보 타수당 추가 게이지
  enemyRobotGauge: 1.8,   // 적이 로봇에 타고 있을 때 게이지 자연 충전 배율
};

