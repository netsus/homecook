// Mock data for the homecook_ prototype
// All recipes use emoji placeholders to avoid hotlinking copyrighted food photos.

const RECIPES = [
  {
    id: 'r1',
    name: '김치볶음밥',
    emoji: '🍚',
    bg: 'linear-gradient(135deg, #FFE8E0 0%, #FFD0BC 100%)',
    tags: ['한식', '15분', '1인'],
    minutes: 15,
    servings: 1,
    kcal: 540,
    rating: 4.7,
    saves: 1284,
    theme: '자취생 간단식',
    method: 'stirfry', // 볶기 = 주황
    ingredients: [
      { name: '묵은지', qty: '1컵', section: '메인' },
      { name: '찬밥', qty: '1공기', section: '메인' },
      { name: '대파', qty: '1/2대', section: '채소' },
      { name: '계란', qty: '1개', section: '채소' },
      { name: '참기름', qty: '1T', section: '양념' },
      { name: '간장', qty: '1t', section: '양념' },
      { name: '고춧가루', qty: '1/2t', section: '양념' },
    ],
    steps: [
      { method: 'prep', title: '재료 준비', body: '묵은지는 송송 썰고 대파는 잘게 다져 준비해요.', minutes: 3 },
      { method: 'stirfry', title: '김치 볶기', body: '팬에 참기름 두르고 묵은지를 2분간 센불에 볶아 신맛을 날려요.', minutes: 2 },
      { method: 'stirfry', title: '밥 볶기', body: '찬밥을 넣고 간장, 고춧가루 넣어 3분간 볶아요.', minutes: 3 },
      { method: 'fry', title: '계란 프라이', body: '다른 팬에 계란 프라이를 노른자 반숙으로 부쳐요.', minutes: 2 },
      { method: 'mix', title: '플레이팅', body: '볶음밥 위에 계란 올리고 대파 뿌려 완성.', minutes: 1 },
    ],
  },
  {
    id: 'r2',
    name: '된장찌개',
    emoji: '🍲',
    bg: 'linear-gradient(135deg, #FFE0E0 0%, #FFB8B8 100%)',
    tags: ['한식', '국물', '25분'],
    minutes: 25,
    servings: 2,
    kcal: 310,
    rating: 4.8,
    saves: 2102,
    theme: '집밥 기본기',
    method: 'boil',
    ingredients: [
      { name: '된장', qty: '2T', section: '양념' },
      { name: '애호박', qty: '1/2개', section: '채소' },
      { name: '감자', qty: '1개', section: '채소' },
      { name: '두부', qty: '1/2모', section: '메인' },
      { name: '청양고추', qty: '1개', section: '채소' },
      { name: '멸치육수', qty: '500ml', section: '메인' },
    ],
    steps: [
      { method: 'prep', title: '재료 손질', body: '감자, 애호박, 두부는 한입 크기로 썰어 준비.', minutes: 5 },
      { method: 'boil', title: '육수 끓이기', body: '멸치육수에 된장을 풀고 팔팔 끓여요.', minutes: 8 },
      { method: 'boil', title: '채소 투입', body: '감자부터 넣고 5분, 애호박/두부 넣고 5분 더 끓여요.', minutes: 10 },
      { method: 'mix', title: '마무리', body: '청양고추 썰어 넣고 불 꺼 완성.', minutes: 2 },
    ],
  },
  {
    id: 'r3',
    name: '닭가슴살 샐러드',
    emoji: '🥗',
    bg: 'linear-gradient(135deg, #E8F5E0 0%, #C8E6A0 100%)',
    tags: ['샐러드', '다이어트', '10분'],
    minutes: 10,
    servings: 1,
    kcal: 290,
    rating: 4.5,
    saves: 856,
    theme: '다이어트 식단',
    method: 'mix',
    ingredients: [
      { name: '닭가슴살', qty: '100g', section: '메인' },
      { name: '로메인', qty: '2줌', section: '채소' },
      { name: '방울토마토', qty: '5개', section: '채소' },
      { name: '아보카도', qty: '1/2개', section: '채소' },
      { name: '발사믹 드레싱', qty: '2T', section: '양념' },
    ],
    steps: [
      { method: 'prep', title: '재료 손질', body: '닭가슴살 슬라이스, 로메인 뜯기, 토마토 반 갈라요.', minutes: 4 },
      { method: 'mix', title: '버무리기', body: '볼에 모두 담고 드레싱 뿌려 가볍게 버무려요.', minutes: 2 },
    ],
  },
  {
    id: 'r4',
    name: '제육볶음',
    emoji: '🥩',
    bg: 'linear-gradient(135deg, #FFD6C0 0%, #FFA07A 100%)',
    tags: ['한식', '매콤', '20분'],
    minutes: 20,
    servings: 2,
    kcal: 620,
    rating: 4.9,
    saves: 3201,
    theme: '밥도둑',
    method: 'stirfry',
    ingredients: [
      { name: '돼지고기 앞다리살', qty: '300g', section: '메인' },
      { name: '양파', qty: '1/2개', section: '채소' },
      { name: '대파', qty: '1대', section: '채소' },
      { name: '고추장', qty: '2T', section: '양념' },
      { name: '고춧가루', qty: '1T', section: '양념' },
      { name: '설탕', qty: '1T', section: '양념' },
      { name: '마늘', qty: '1T', section: '양념' },
    ],
    steps: [
      { method: 'prep', title: '양념장 만들기', body: '고추장, 고춧가루, 설탕, 마늘 섞어 양념장을 만들어요.', minutes: 3 },
      { method: 'prep', title: '고기 재우기', body: '돼지고기에 양념장 버무려 10분 재워요.', minutes: 10 },
      { method: 'stirfry', title: '센불 볶기', body: '달군 팬에 재운 고기를 넣고 센불에 4분 볶아요.', minutes: 4 },
      { method: 'stirfry', title: '채소 넣기', body: '양파와 대파를 넣고 3분 더 볶아 마무리.', minutes: 3 },
    ],
  },
  {
    id: 'r5',
    name: '연어 스테이크',
    emoji: '🐟',
    bg: 'linear-gradient(135deg, #FFE0D0 0%, #FFAA88 100%)',
    tags: ['양식', '오븐', '20분'],
    minutes: 20,
    servings: 2,
    kcal: 480,
    rating: 4.6,
    saves: 921,
    theme: '주말 특식',
    method: 'roast',
    ingredients: [
      { name: '연어', qty: '2조각', section: '메인' },
      { name: '아스파라거스', qty: '6대', section: '채소' },
      { name: '레몬', qty: '1/2개', section: '채소' },
      { name: '올리브오일', qty: '2T', section: '양념' },
      { name: '소금·후추', qty: '약간', section: '양념' },
    ],
    steps: [
      { method: 'prep', title: '밑간', body: '연어에 소금, 후추, 올리브오일 뿌려 10분 재워요.', minutes: 10 },
      { method: 'roast', title: '오븐 굽기', body: '200°C 오븐에서 아스파라거스와 함께 10분 구워요.', minutes: 10 },
      { method: 'mix', title: '플레이팅', body: '레몬 짜 뿌려 완성.', minutes: 1 },
    ],
  },
  {
    id: 'r6',
    name: '감자 수제비',
    emoji: '🥟',
    bg: 'linear-gradient(135deg, #F0E8D8 0%, #D4C49C 100%)',
    tags: ['한식', '국물', '30분'],
    minutes: 30,
    servings: 2,
    kcal: 420,
    rating: 4.4,
    saves: 512,
    theme: '비오는 날',
    method: 'boil',
    ingredients: [
      { name: '밀가루', qty: '2컵', section: '메인' },
      { name: '감자', qty: '2개', section: '채소' },
      { name: '애호박', qty: '1/2개', section: '채소' },
      { name: '멸치육수', qty: '1L', section: '메인' },
      { name: '국간장', qty: '1T', section: '양념' },
    ],
    steps: [
      { method: 'prep', title: '반죽', body: '밀가루에 물 넣어 반죽 후 30분 숙성.', minutes: 8 },
      { method: 'boil', title: '육수', body: '멸치육수 끓이고 감자 넣어 5분.', minutes: 6 },
      { method: 'boil', title: '수제비 넣기', body: '반죽을 얇게 떼어 넣고 10분 끓여요.', minutes: 10 },
      { method: 'mix', title: '간 맞추기', body: '국간장으로 간하고 애호박 넣어 3분 더.', minutes: 3 },
    ],
  },
];

// 조리방법 색상 (화면정의서 0-5)
const METHOD_COLORS = {
  stirfry: { bg: '#FFF4E8', border: '#FFB347', text: '#D97706', label: '볶기' },
  boil:    { bg: '#FFEBEB', border: '#FF6B6B', text: '#C92A2A', label: '끓이기' },
  roast:   { bg: '#F1E8DC', border: '#A0826D', text: '#7C5A3F', label: '굽기' },
  steam:   { bg: '#E0F0FF', border: '#74C0FC', text: '#1971C2', label: '찌기' },
  fry:     { bg: '#FFF9DB', border: '#FFD43B', text: '#B38B00', label: '튀기기' },
  blanch:  { bg: '#E8F5D8', border: '#A9E34B', text: '#5C940D', label: '데치기' },
  mix:     { bg: '#D3F9D8', border: '#51CF66', text: '#2B8A3E', label: '무치기' },
  prep:    { bg: '#F1F3F5', border: '#ADB5BD', text: '#495057', label: '준비' },
};

const THEMES = [
  { id: 't1', name: '자취생 간단식', emoji: '🍳', bg: '#FFE8DC', accent: '#FF8C42' },
  { id: 't2', name: '집밥 기본기', emoji: '🏠', bg: '#E8F5FF', accent: '#4DABF7' },
  { id: 't3', name: '다이어트 식단', emoji: '🥗', bg: '#E8F8E0', accent: '#51CF66' },
  { id: 't4', name: '밥도둑', emoji: '🍚', bg: '#FFEBEB', accent: '#FF6B6B' },
  { id: 't5', name: '주말 특식', emoji: '🍷', bg: '#F3E8FF', accent: '#9775FA' },
  { id: 't6', name: '비오는 날', emoji: '☔', bg: '#E3F4F4', accent: '#15AABF' },
];

const INGREDIENT_FILTERS = [
  { id: 'rice', name: '밥·면', emoji: '🍚' },
  { id: 'meat', name: '육류', emoji: '🥩' },
  { id: 'fish', name: '해산물', emoji: '🐟' },
  { id: 'veg', name: '채소', emoji: '🥬' },
  { id: 'egg', name: '계란·두부', emoji: '🥚' },
  { id: 'kimchi', name: '김치', emoji: '🥬' },
];

// Initial planner state — 7일 × (아침/점심/저녁)
const todayIdx = 3; // 목요일
const WEEK_START = new Date(2026, 3, 20); // 2026-04-20 월요일
const weekDays = ['월','화','수','목','금','토','일'];

function makeInitialPlanner() {
  const plan = {};
  for (let i = 0; i < 7; i++) {
    const d = new Date(WEEK_START);
    d.setDate(d.getDate() + i);
    const key = `${d.getMonth()+1}/${d.getDate()}`;
    plan[key] = { 아침: null, 점심: null, 저녁: null };
  }
  // Seed some meals
  const keys = Object.keys(plan);
  plan[keys[0]].저녁 = { recipeId: 'r2', status: 'cooked', servings: 2 };
  plan[keys[1]].점심 = { recipeId: 'r1', status: 'cooked', servings: 1 };
  plan[keys[1]].저녁 = { recipeId: 'r4', status: 'shopped', servings: 2 };
  plan[keys[2]].저녁 = { recipeId: 'r6', status: 'registered', servings: 2 };
  plan[keys[3]].점심 = { recipeId: 'r3', status: 'registered', servings: 1 };
  plan[keys[3]].저녁 = { recipeId: 'r2', status: 'registered', servings: 2 };
  plan[keys[5]].저녁 = { recipeId: 'r5', status: 'registered', servings: 2 };
  return plan;
}

const INITIAL_PANTRY = {
  rice: { name: '쌀', have: true, section: '주식' },
  noodle: { name: '국수', have: false, section: '주식' },
  onion: { name: '양파', have: true, section: '채소' },
  potato: { name: '감자', have: true, section: '채소' },
  carrot: { name: '당근', have: false, section: '채소' },
  pepper: { name: '청양고추', have: true, section: '채소' },
  zucchini: { name: '애호박', have: false, section: '채소' },
  egg: { name: '계란', have: true, section: '단백질' },
  tofu: { name: '두부', have: false, section: '단백질' },
  chicken: { name: '닭가슴살', have: false, section: '단백질' },
  kimchi: { name: '김치', have: true, section: '양념' },
  soysauce: { name: '간장', have: true, section: '양념' },
  gochujang: { name: '고추장', have: true, section: '양념' },
  doenjang: { name: '된장', have: true, section: '양념' },
  sesameoil: { name: '참기름', have: true, section: '양념' },
  gochugaru: { name: '고춧가루', have: true, section: '양념' },
  sugar: { name: '설탕', have: true, section: '양념' },
  garlic: { name: '다진마늘', have: true, section: '양념' },
};

Object.assign(window, {
  RECIPES, METHOD_COLORS, THEMES, INGREDIENT_FILTERS,
  makeInitialPlanner, weekDays, WEEK_START, INITIAL_PANTRY, todayIdx,
});
