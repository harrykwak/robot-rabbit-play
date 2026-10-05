// 게임 데이터: 파일럿, 로봇 스탯, 스킬, 스테이지

// 기술표 문자열의 {atk} {hvy} {grd} {jump} {dash} {act} 는 현재 키 설정으로 바꿔서 보여준다 (input.js fmtKeys)
// 조작 원칙: {atk} 기본 공격, {hvy} 스킬 1(파일럿 대표기), {grd} 스킬 2(파일럿 방어기), {act} 호출/탑승/하차
export const COMMON_MOVES = [
  { input: '{atk} {atk} {atk}', name: '기본 3연타', desc: '마지막 발차기가 상대를 날려 보냅니다' },
  { input: '띄운 직후 {atk} 또는 {jump}', name: '추격 점프', desc: '띄운 상대에게 날아올라 공중 콤보로 이어집니다' },
  { input: '공중에서 {atk} 연타', name: '공중 콤보', desc: '마지막 타는 땅으로 내려찍어 튕겨 오르게 합니다' },
  { input: '{dash} 중 {atk}', name: '태클', desc: '대시 속도를 실은 몸통 박치기' },
  { input: '{hvy}', name: '스킬 1', desc: '파일럿 대표 기술. 쿨다운이 있습니다 ({atk} {atk} {hvy} 띄우기는 쿨다운 없음)' },
  { input: '{grd}', name: '스킬 2 · 방어', desc: '파일럿마다 다른 방어 기술 (가드, 구르기, 배리어, 반격 등)' },
  { input: '연속으로 맞는 중 {grd}', name: '브레이크 버스트', desc: '콤보에 갇히면 스킬 2를 소모해 주변을 밀어내고 빠져나옵니다' },
  { input: '게이지 MAX 로 {act}', name: '당근 리모컨 호출', desc: '맞는 중에도 가능. 배리어가 주변을 밀어내고 로봇이 떨어질 때까지 지켜줍니다' },
];

// hp/speed/jump: 사람 상태 능력치. reach: 발차기 판정 배율. dmgTaken: 받는 피해 배율. gaugeMul: 게이지 충전 배율
// airJumps: 공중 추가 점프 횟수. airChain: 공중 콤보 최대 타수
// cls: 클래스, sub: 세부 역할. role 은 선택 화면 표시용 (cls · sub)
// robot: 탑승 보너스 (armor 내구도, speed 이동, cd 쿨다운, board 탑승 시간 배율)
// acts: 파일럿 전용 기술 (actions.js HUMAN_ACTS 의 이름). heavy/dashHvy/airHvy 는 스킬 1 쿨다운을 쓴다. launcher 는 콤보 루트라 무료
// skill1: { name, cd } 대표 기술. skill2: { kind, name, cd, ... } 방어 기술
//   kind: guard(누르고 있기) / parry(누르고 있기 + 저스트 가드) / roll / flip / smoke / barrier / brace / blink
//   guard 계열은 떼는 순간부터 cd 가 돈다. hold: 최대 유지 시간, robotGuard: 로봇 공격 가드 시 받는 피해 비율
export const PILOTS = [
  {
    id: 'rico', name: '리코', body: 0xff4d4d, accent: 0x2b3a67, skin: 0xffd3ae, hair: 0x3a2418, style: 0, color: 0xff4d5e,
    look: { outfit: 'bomber', legs: 'cargo', pants: 0x2d3142, inner: 0x1b1b24, sole: 0xff4d4d, hands: 'boxing', eyes: 'fierce', eye: 0xb3342f, mouth: 'grin' },
    desc: '돌격형 복서', cls: '브루저', sub: '파워', role: '브루저 · 파워',
    hp: 115, speed: 7.3, jump: 11.5, reach: 1, dmgTaken: 0.9, gaugeMul: 1, airJumps: 0, airChain: 3,
    robot: { armor: 1.12, speed: 1, cd: 1, board: 1 },
    acts: { heavy: 'ricoCharge', launcher: 'ricoUpper', dashHvy: 'ricoRush', airHvy: 'ricoMeteor' },
    skill1: { name: '캐럿 스트레이트', cd: 2.6 },
    skill2: { kind: 'guard', name: '철벽 가드', cd: 0.35, hold: 3, robotGuard: 0.3 },
    stats: { power: 5, speed: 2, air: 2, tech: 2 },
    traits: ['맷집: 받는 피해 -10%, 체력 115', '강공격 중 슈퍼 아머 (약공격에 끊기지 않음)', '철벽 가드: 로봇 공격도 70% 막아냄', '탑승 시 로봇 내구도 +12%'],
    moves: [
      { input: '{hvy} 누르고 있다 떼기', name: '캐럿 스트레이트', desc: '오래 모을수록 강해지는 가드 브레이크 펀치' },
      { input: '{grd} 누르고 있기', name: '철벽 가드', desc: '앞쪽 공격을 막습니다. 로봇 공격도 대부분 버팁니다' },
      { input: '{atk} {atk} {hvy}', name: '로켓 어퍼', desc: '함께 솟구치는 어퍼컷. 바로 공중 콤보로' },
      { input: '{dash} 중 {hvy}', name: '러시 블로', desc: '슈퍼 아머로 밀고 들어가는 2연타' },
      { input: '공중에서 {hvy}', name: '메테오 훅', desc: '땅으로 내리꽂으며 작은 충격파' },
    ],
  },
  {
    id: 'mimi', name: '미미', body: 0xffc21f, accent: 0x5b3cc4, skin: 0xffe0c4, hair: 0xff8fb8, style: 2, color: 0xffc21f,
    look: { outfit: 'hoodie', legs: 'shorts', pants: 0x5b3cc4, inner: 0xfff3d6, socks: 0xffffff, shoe: 0xffb3c8, sole: 0x5b3cc4, eyes: 'round', eye: 0xd2477f, mouth: 'cat', blush: true },
    desc: '토끼 후드 말괄량이', cls: '어쌔신', sub: '기동', role: '어쌔신 · 기동',
    hp: 88, speed: 8.7, jump: 12.5, reach: 0.95, dmgTaken: 1.05, gaugeMul: 1.25, airJumps: 1, airChain: 3,
    robot: { armor: 1, speed: 1, cd: 1, board: 0.55 },
    acts: { heavy: 'mimiBoomerang', launcher: 'mimiHop', dashHvy: 'mimiRoll', airHvy: 'mimiStamp' },
    skill1: { name: '당근 부메랑', cd: 2.2 },
    skill2: { kind: 'roll', name: '바니 롤', cd: 1.3 },
    stats: { power: 2, speed: 5, air: 4, tech: 3 },
    traits: ['2단 점프, 가장 빠른 발', '바니 롤: 짧은 쿨다운의 무적 구르기', '당근 게이지 충전 +25%', '탑승 시간 45% 단축'],
    moves: [
      { input: '{hvy}', name: '당근 부메랑', desc: '던지면 돌아오는 부메랑. 갈 때와 올 때 두 번 맞힘' },
      { input: '{grd}', name: '바니 롤', desc: '스틱 방향으로 무적 구르기' },
      { input: '{atk} {atk} {hvy}', name: '바니 호핑킥', desc: '깡충 뛰어오르며 띄우기' },
      { input: '{dash} 중 {hvy}', name: '토끼 구르기', desc: '무적 구르기 후 올려차기' },
      { input: '공중에서 {hvy}', name: '엉덩방아 스탬프', desc: '수직 낙하 후 주변에 충격파' },
    ],
  },
  {
    id: 'jun', name: '준', body: 0x2fb8ff, accent: 0x1d2340, skin: 0xf0c49c, hair: 0x1b1b24, style: 1, color: 0x2fb8ff,
    look: { outfit: 'track', legs: 'slim', pants: 0x1d2340, shoe: 0xf4f4f4, sole: 0x2fb8ff, hands: 'fingerless', eyes: 'cool', eye: 0x2c4d8a, mouth: 'smirk' },
    desc: '캡모자 스트리트 파이터', cls: '파이터', sub: '카운터', role: '파이터 · 카운터',
    hp: 100, speed: 7.8, jump: 11.5, reach: 1, dmgTaken: 1, gaugeMul: 1, airJumps: 0, airChain: 3, parry: true,
    robot: { armor: 1, speed: 1, cd: 0.82, board: 1 },
    acts: { heavy: 'junSweep', launcher: 'junKnee', dashHvy: 'junSlide', airHvy: 'junAxe' },
    skill1: { name: '스트리트 스윕', cd: 2.6 },
    skill2: { kind: 'parry', name: '저스트 가드', cd: 0.35, hold: 2.5, robotGuard: 0.5 },
    stats: { power: 3, speed: 3, air: 3, tech: 5 },
    traits: ['저스트 가드: 맞기 직전 가드하면 패리 (로봇 공격도 튕겨내고 약점 노출)', '패리 후 다음 공격 피해 1.5배', '로봇 스킬 쿨다운 -18%'],
    moves: [
      { input: '맞기 직전 {grd}', name: '저스트 가드', desc: '공격을 튕겨내고 상대를 경직시킵니다. 누르고 있으면 일반 가드' },
      { input: '{hvy}', name: '스트리트 스윕', desc: '가드를 무시하고 넘어뜨리는 다리 후리기' },
      { input: '{atk} {atk} {hvy}', name: '라이징 니', desc: '무릎으로 올려 띄우기' },
      { input: '{dash} 중 {hvy}', name: '슬라이딩', desc: '낮게 미끄러져 넘어뜨리기' },
      { input: '공중에서 {hvy}', name: '액스 킥', desc: '내려찍어 상대를 바닥에 튕깁니다' },
    ],
  },
  {
    id: 'sora', name: '소라', body: 0x39d98a, accent: 0x6b2d5c, skin: 0xffd9bf, hair: 0xe8e8f0, style: 3, color: 0x39d98a,
    look: { outfit: 'tech', legs: 'shorts', pants: 0x2a2233, socks: 0x1b1b24, shoe: 0xffffff, sole: 0x39d98a, trim: 0x39d98a, eyes: 'sharp', eye: 0x1f8c63, mouth: 'smile' },
    desc: '포니테일 킥복서', cls: '파이터', sub: '공중전', role: '파이터 · 공중전',
    hp: 95, speed: 8.0, jump: 12.5, reach: 1.22, dmgTaken: 1, gaugeMul: 1, airJumps: 0, airChain: 5,
    robot: { armor: 1, speed: 1.12, cd: 1, board: 1 },
    acts: { heavy: 'soraSpin', launcher: 'soraFlip', dashHvy: 'soraKnee', airHvy: 'soraSwallow' },
    skill1: { name: '회오리 킥', cd: 3 },
    skill2: { kind: 'flip', name: '백플립', cd: 1.6 },
    stats: { power: 3, speed: 4, air: 5, tech: 3 },
    traits: ['긴 리치: 발차기 판정 +22%', '공중 콤보 최대 5타', '백플립: 무적으로 뒤로 뛰어올라 바로 공중전', '탑승 시 로봇 이동 속도 +12%'],
    moves: [
      { input: '{hvy}', name: '회오리 킥', desc: '빙글 돌며 주변을 여러 번 차기' },
      { input: '{grd}', name: '백플립', desc: '뒤로 공중제비. 착지 전에 공중 공격으로 반격' },
      { input: '{atk} {atk} {hvy}', name: '서머솔트', desc: '공중제비로 함께 떠오르며 띄우기' },
      { input: '{dash} 중 {hvy}', name: '플라잉 니', desc: '멀리 날아가는 무릎 차기' },
      { input: '공중에서 {hvy}', name: '제비 차기', desc: '공중에서 회전하며 주변 휩쓸기' },
    ],
  },
  {
    id: 'dori', name: '도리', body: 0xff8fc8, accent: 0x3b4a78, skin: 0xf6cfae, hair: 0x6b4430, style: 4, color: 0xff7ac0,
    look: { outfit: 'blazer', legs: 'skirt', pants: 0x3b4a78, inner: 0xffffff, tie: 0xff4d8d, socks: 0xffffff, shoe: 0x5a3a2e, sole: 0x2a1c14, eyes: 'round', eye: 0x8a4a2a, mouth: 'smile', blush: true },
    desc: '방패 헬멧 수호자', cls: '탱커', sub: '가디언', role: '탱커 · 가디언',
    hp: 135, speed: 6.7, jump: 11, reach: 1, dmgTaken: 0.85, gaugeMul: 0.95, airJumps: 0, airChain: 3,
    robot: { armor: 1.2, speed: 0.96, cd: 1, board: 1 },
    acts: { heavy: 'doriBash', launcher: 'doriLift', dashHvy: 'doriBash', airHvy: 'doriDrop' },
    skill1: { name: '방패 돌진', cd: 3 },
    skill2: { kind: 'barrier', name: '당근 배리어', cd: 6.5, time: 1.5, radius: 2.8 },
    stats: { power: 3, speed: 1, air: 2, tech: 3 },
    traits: ['가장 튼튼함: 체력 135, 받는 피해 -15%', '당근 배리어: 사방의 공격을 막고 붙은 적을 밀어냄 (공격하면 해제)', '방패 돌진은 슈퍼 아머 + 가드 브레이크', '탑승 시 로봇 내구도 +20%'],
    moves: [
      { input: '{hvy}', name: '방패 돌진', desc: '슈퍼 아머로 밀고 들어가 가드를 부수며 날려 보냅니다' },
      { input: '{grd}', name: '당근 배리어', desc: '잠깐 동안 모든 방향의 공격을 막는 방어막 (로봇 공격 포함)' },
      { input: '{atk} {atk} {hvy}', name: '방패 올려치기', desc: '방패로 퍼 올려 띄우기' },
      { input: '공중에서 {hvy}', name: '헤비 드롭', desc: '몸으로 내리꽂는 충격파' },
    ],
  },
  {
    id: 'haru', name: '하루', body: 0xff9a2e, accent: 0x274b3f, skin: 0xffd9b8, hair: 0x2a1c14, style: 5, color: 0xff9a2e,
    look: { outfit: 'utility', legs: 'cargo', pants: 0x3f4a3a, inner: 0xf2efe6, shoe: 0x2a2a30, sole: 0xff9a2e, hands: 'fingerless', eyes: 'cool', eye: 0x3a6b4f, mouth: 'smirk' },
    desc: '고글 새총 명사수', cls: '슈터', sub: '견제', role: '슈터 · 견제',
    hp: 90, speed: 7.9, jump: 12, reach: 0.95, dmgTaken: 1.05, gaugeMul: 1.05, airJumps: 0, airChain: 3,
    robot: { armor: 1, speed: 1.04, cd: 0.88, board: 1 },
    acts: { heavy: 'haruShot', launcher: 'haruKick', dashHvy: 'haruVolley', airHvy: 'haruAirShot' },
    skill1: { name: '당근 새총', cd: 1.3 },
    skill2: { kind: 'smoke', name: '연막 백스텝', cd: 3 },
    stats: { power: 2, speed: 4, air: 3, tech: 4 },
    traits: ['유일한 원거리 견제: 자동 조준 새총', '연막 백스텝: 뒤로 빠지며 붙은 적을 잠깐 경직', '로봇 스킬 쿨다운 -12%'],
    moves: [
      { input: '{hvy}', name: '당근 새총', desc: '가까운 적을 자동 조준해 당근을 쏩니다' },
      { input: '{grd}', name: '연막 백스텝', desc: '연막을 터뜨리며 뒤로 빠집니다. 가까운 적은 잠깐 멈춥니다' },
      { input: '{atk} {atk} {hvy}', name: '점프 킥', desc: '뛰어오르며 띄우기' },
      { input: '{dash} 중 {hvy}', name: '3연 새총', desc: '부채꼴로 세 발' },
      { input: '공중에서 {hvy}', name: '공중 사격', desc: '떠오른 채 아래로 쏘기' },
    ],
  },
  {
    id: 'taro', name: '타로', body: 0xc98a4b, accent: 0x3a2a24, skin: 0xe8b98f, hair: 0x1f1a17, style: 6, color: 0xd0904e,
    look: { outfit: 'vest', legs: 'cargo', pants: 0x3a2a24, inner: 0xf5efe2, belt: 0xd0904e, shoe: 0x222222, sole: 0xd0904e, eyes: 'fierce', eye: 0x3a2418, mouth: 'flat' },
    desc: '두건 쓴 씨름꾼', cls: '그래플러', sub: '잡기', role: '그래플러 · 잡기',
    hp: 122, speed: 6.9, jump: 11, reach: 1.05, dmgTaken: 0.92, gaugeMul: 1, airJumps: 0, airChain: 3,
    robot: { armor: 1.1, speed: 1, cd: 1, board: 0.8 },
    acts: { heavy: 'taroGrab', launcher: 'taroLift', dashHvy: 'taroDashGrab', airHvy: 'taroPress' },
    skill1: { name: '당근 수플렉스', cd: 3 },
    skill2: { kind: 'brace', name: '버티기 반격', cd: 4 },
    stats: { power: 5, speed: 2, air: 1, tech: 3 },
    traits: ['잡기: 가드를 무시하고 뒤로 던짐 (추격 점프 가능)', '버티기 반격: 자세 중 맞으면 피해 없이 되받아침 (로봇은 약점 노출)', '체력 122, 탑승 시간 20% 단축'],
    moves: [
      { input: '{hvy}', name: '당근 수플렉스', desc: '가까운 상대를 붙잡아 뒤로 던집니다. 가드 불가' },
      { input: '{grd}', name: '버티기 반격', desc: '잠깐 버티는 자세. 이때 맞으면 피해 없이 반격합니다' },
      { input: '{atk} {atk} {hvy}', name: '씨름 들어올리기', desc: '슈퍼 아머로 퍼 올려 띄우기' },
      { input: '{dash} 중 {hvy}', name: '돌진 잡기', desc: '달려들며 붙잡기' },
      { input: '공중에서 {hvy}', name: '바디 프레스', desc: '온몸으로 내리찍는 충격파' },
    ],
  },
  {
    id: 'luna', name: '루나', body: 0xa46bff, accent: 0x2a2150, skin: 0xffe2cf, hair: 0xd9e4ff, style: 7, color: 0xb07cff,
    look: { outfit: 'coat', legs: 'skirt', pants: 0x2a2150, inner: 0xf6f0ff, socks: 0x2a2150, shoe: 0x1b1630, sole: 0xffd84a, eyes: 'sly', eye: 0x8a5cff, mouth: 'smirk' },
    desc: '뾰족 모자 트릭스터', cls: '컨트롤러', sub: '함정', role: '컨트롤러 · 함정',
    hp: 92, speed: 7.6, jump: 12, reach: 1, dmgTaken: 1.03, gaugeMul: 1.15, airJumps: 0, airChain: 3,
    robot: { armor: 1, speed: 1, cd: 0.9, board: 1 },
    acts: { heavy: 'lunaTrap', launcher: 'lunaRise', dashHvy: 'lunaTrap', airHvy: 'lunaDrop' },
    skill1: { name: '끈끈이 덫', cd: 3.6 },
    skill2: { kind: 'blink', name: '순간이동', cd: 2.4, dist: 4.5 },
    stats: { power: 2, speed: 3, air: 3, tech: 5 },
    traits: ['끈끈이 덫: 밟은 사람은 1초 경직, 로봇은 멈추고 약점 노출 (최대 2개)', '순간이동: 스틱 방향(없으면 뒤)으로 짧은 무적 이동', '당근 게이지 충전 +15%'],
    moves: [
      { input: '{hvy}', name: '끈끈이 덫', desc: '앞에 덫을 설치합니다. 밟은 적을 붙잡아 둡니다' },
      { input: '{grd}', name: '순간이동', desc: '스틱 방향으로 짧게 순간이동 (무적)' },
      { input: '{atk} {atk} {hvy}', name: '문 라이즈', desc: '회전하며 떠올라 띄우기' },
      { input: '공중에서 {hvy}', name: '덫 떨구기', desc: '떠 있는 채 발밑에 덫을 떨어뜨립니다' },
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
// skills[0].parts: 기본 콤보에 쓰는 부위 (부서질 때마다 콤보 피해 감소)
// skills[1|2].juice: 당근쥬스 소모량, part: 이 부위가 부서지면 스킬 봉인 (robot-systems.js)
export const ROBOT_STATS = {
  titan: {
    tag: '파워', speed: 9.2, armor: 380, jump: 15,
    bars: { power: 5, speed: 2, range: 3, armor: 4 },
    skills: [
      { key: 'J', name: '타이탄 펀치', desc: '묵직한 2연타 스트레이트', parts: ['armL', 'armR'] },
      { key: 'K', name: '로켓 펀치', desc: '주먹을 발사해 일직선으로 날려버림', cd: 3.6, juice: 18, part: 'armR' },
      { key: 'L', name: '캐럿 스톰프', desc: '뛰어올라 내려찍는 광역 충격파', cd: 7, juice: 28, part: 'legs' },
    ],
  },
  bolt: {
    tag: '스피드', speed: 13.5, armor: 270, jump: 17,
    bars: { power: 3, speed: 5, range: 2, armor: 2 },
    skills: [
      { key: 'J', name: '볼트 킥', desc: '빠른 3연속 킥', parts: ['legs'] },
      { key: 'K', name: '드릴 이어 대시', desc: '귀를 드릴로 바꿔 돌진', cd: 3, juice: 15, part: 'head' },
      { key: 'L', name: '토네이도 킥', desc: '회전하며 주변을 휩쓸기', cd: 6, juice: 25, part: 'legs' },
    ],
  },
  cannon: {
    tag: '귀 타격', speed: 9.4, armor: 310, jump: 14,
    bars: { power: 3, speed: 3, range: 3, armor: 3 },
    skills: [
      { key: 'J', name: '귀 휘두르기', desc: '한쪽 귀를 낮게 휘둘러 타격하고 다른 귀는 얼굴 앞을 지킵니다', parts: ['head'] },
      { key: 'K', name: '당근 미사일', desc: '유도 당근 미사일 6발', cd: 5, juice: 22 },
      { key: 'L', name: '문 레이저', desc: '충전 후 눈에서 거대한 레이저', cd: 9, juice: 35, part: 'head' },
    ],
  },
  hammer: {
    tag: '광역', speed: 8.6, armor: 420, jump: 13.5,
    bars: { power: 5, speed: 2, range: 4, armor: 5 },
    skills: [
      { key: 'J', name: '양손 해머', desc: '두 손으로 들어 올려 내려찍는 망치 2연타', parts: ['armL', 'armR'] },
      { key: 'K', name: '해머 스핀', desc: '해머를 휘두르며 회전 돌진', cd: 6, juice: 22, part: 'armR' },
      { key: 'L', name: '메가 슬램', desc: '대지를 가르는 초대형 내려찍기', cd: 8, juice: 30, part: 'armL' },
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
  // 호출 배리어: 리모컨을 누른 순간부터 로봇 착지 뒤까지 호출자를 지킨다
  shieldTime: 5.5,        // 최대 지속 (로봇이 늦게 떨어져도 여기서 끝)
  shieldAfterLand: 2.2,   // 착지 후 추가 지속
  shieldRadius: 4.2,      // 발동 순간 밀어내는 반경
  // 콤보
  comboWindow: 1.1,       // 다음 타까지 허용 시간
  comboScaleFrom: 4,      // 이 타수부터 피해 감소
  comboScaleStep: 0.08,   // 타수당 피해 감소율
  comboScaleMin: 0.4,
  comboGauge: 0.8,        // 콤보 타수당 추가 게이지
  enemyRobotGauge: 1.8,   // 적이 로봇에 타고 있을 때 게이지 자연 충전 배율
  // ---- 일방적인 전투 방지 ----
  // 경직/띄우기 감쇠: 쉬지 않고 연속으로 맞은 횟수(hitsTaken) 기준
  juggleFrom: 4,          // 이 타수 이후부터 경직·공중 체공 감소
  juggleStep: 0.08,
  juggleMin: 0.4,
  juggleCap: 11,          // 이 타수부터는 공중에 붙잡아 둘 수 없다 (빨리 떨어져 다운)
  juggleTime: 2.4,        // 또는 이만큼 계속 경직/공중에 있었으면
  freeReset: 0.3,         // 이만큼 자유롭게 움직이면 연속 피격 수 초기화
  // 브레이크 버스트: 연속으로 맞는 중 스킬 2 로 탈출
  burstHits: 5,
  burstCd: 7,             // 스킬 2 쿨다운으로 지불
  burstInvuln: 0.6,
  burstRadius: 3.2,
  // 다운: 누워 있는 동안 무적, 일어난 뒤 잠깐 더 무적
  downTime: 0.5,
  quickRise: 0.18,        // 이 시간 뒤 버튼을 누르면 바로 기상
  wakeInvuln: 0.4,
  // CPU 협공 제한: 한 대상에게 동시에 달려드는 CPU 수
  focusPlayer: 1,
  focusOther: 2,
  // 역전 도움: 뒤처진 만큼 게이지가 빨리 찬다 (점수 = 목숨 + 체력 비율)
  comebackPer: 0.35,
  comebackMax: 1.8,
  // 로봇 vs 사람
  robotHitCap: 15,        // 로봇이 걸어 다니는 사람에게 주는 한 방 최대 피해
  humanVsRobot: 0.8,      // 사람이 로봇에게 주는 피해 배율
  backstab: 1.6,          // 로봇 뒤에서 때리면
  exposedMul: 1.5,        // 약점 노출 (패리/반격/덫/버스트) 중 추가 배율
  robotBreak: 45,         // 사람에게 이만큼 맞으면 로봇이 휘청인다
  // ---- 로봇 에너지: 당근쥬스 ----
  juiceMax: 100,
  juiceDrain: 1.2,        // 탑승 중(전투) 초당 감소
  juiceDash: 8,           // 대시 1회
  juiceBoost: 3,          // 공중 추진 초당
  juiceLow: 25,           // 이하이면 경고 (CPU 는 보급소를 찾는다)
  juiceEmptySpeed: 0.65,  // 바닥나면: 이동 배율, 스킬/대시 불가
  juiceEmptyDmg: 0.75,    //            공격 피해 배율
  juiceHeadMul: 1.4,      // 머리 파손 시 쥬스 소모 배율
  // ---- 부위 파괴 ----
  partHp: { armL: 0.28, armR: 0.28, head: 0.22, legs: 0.34 }, // 로봇 최대 내구도 대비
  partHumanMul: 1.4,      // 사람 공격은 부위를 더 잘 부순다 (틈을 노리는 반격)
  partLegsBelow: 0.3,     // 타격 높이 비율이 이보다 낮으면 (70% 확률) 다리
  partHeadAbove: 0.74,    // 이보다 높으면 머리
  partLegsSpeed: 0.72,    // 다리 파손: 이동/점프 배율, 대시 불가
  partLegsJump: 0.7,
  partHeadAim: 0.6,       // 머리 파손: 자동 조준 원뿔을 이만큼 좁히고
  partHeadRange: 0.6,     //            조준 거리 배율
  partComboLoss: 0.25,    // 콤보에 쓰는 부위 하나가 부서질 때마다 콤보 피해 감소
  partComboMin: 0.5,
};
