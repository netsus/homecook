/* global React */
const { useState, useEffect, useMemo, useRef } = React;

/* ============================================
   Sample data — Korean home-cooking recipes
   ============================================ */

// Inlined food photos (bundled via window.__resources)
const __R = (window.__resources || {});
const IMG = {
  bibimbap:    __R.bibimbap,
  kimchijjigae:__R.kimchijjigae,
  bulgogi:     __R.bulgogi,
  japchae:     __R.japchae,
  doenjang:    __R.doenjang,
  pasta:       __R.pasta,
  pancake:     __R.pancake,
  salad:       __R.salad,
  noodle:      __R.noodle,
  ramen:       __R.ramen,
  galbi:       __R.galbi,
  rolls:       __R.rolls,
  tteokbokki:  __R.tteokbokki,
  porridge:    __R.porridge,
  rice:        __R.rice,
  soup:        __R.soup,
};

const RECIPES = [
  { id: "r01", title: "엄마표 김치찌개",      author: "마음의주방",      time: 35, serves: 2, saved: 12420, likes: 8930, tag: "한식·찌개",    img: IMG.kimchijjigae, popular: true },
  { id: "r02", title: "한 그릇 비빔밥",        author: "오늘의식단",      time: 20, serves: 1, saved: 8210,  likes: 5230, tag: "한식·일품",    img: IMG.bibimbap },
  { id: "r03", title: "달콤짭짤 소불고기",     author: "정육코너",        time: 30, serves: 3, saved: 15240, likes: 9810, tag: "한식·구이",    img: IMG.bulgogi, popular: true },
  { id: "r04", title: "잡채 한 접시",          author: "명절집밥",        time: 50, serves: 4, saved: 6420,  likes: 4120, tag: "한식·면",      img: IMG.japchae },
  { id: "r05", title: "구수한 된장찌개",       author: "한식기본",        time: 25, serves: 2, saved: 9430,  likes: 6210, tag: "한식·찌개",    img: IMG.doenjang },
  { id: "r06", title: "오일 알리오 파스타",    author: "위클리쿡",        time: 18, serves: 2, saved: 11240, likes: 7340, tag: "양식·파스타",  img: IMG.pasta },
  { id: "r07", title: "주말 브런치 팬케이크",   author: "느린아침",        time: 25, serves: 2, saved: 4820,  likes: 3140, tag: "베이커리",     img: IMG.pancake },
  { id: "r08", title: "푸짐한 단호박 샐러드",   author: "라이트밀",        time: 15, serves: 2, saved: 3120,  likes: 2010, tag: "샐러드",       img: IMG.salad },
  { id: "r09", title: "비빔국수",              author: "여름반찬",        time: 12, serves: 2, saved: 5210,  likes: 3520, tag: "한식·면",      img: IMG.noodle },
  { id: "r10", title: "토마토 라멘",           author: "심야부엌",        time: 25, serves: 1, saved: 6820,  likes: 4630, tag: "일식·면",      img: IMG.ramen },
  { id: "r11", title: "양념 LA 갈비",          author: "주말집밥",        time: 60, serves: 4, saved: 13210, likes: 9120, tag: "한식·구이",    img: IMG.galbi, popular: true },
  { id: "r12", title: "참치 김밥",             author: "도시락반",        time: 20, serves: 2, saved: 7320,  likes: 5210, tag: "한식·분식",    img: IMG.rolls },
  { id: "r13", title: "매콤 떡볶이",           author: "분식 노트",       time: 18, serves: 2, saved: 9810,  likes: 6520, tag: "한식·분식",    img: IMG.tteokbokki },
  { id: "r14", title: "전복 야채죽",           author: "보양식록",        time: 40, serves: 2, saved: 2810,  likes: 1820, tag: "한식·죽",      img: IMG.porridge },
  { id: "r15", title: "참치마요 덮밥",         author: "혼밥일기",        time: 10, serves: 1, saved: 11820, likes: 8210, tag: "한식·일품",    img: IMG.rice },
  { id: "r16", title: "맑은 미역국",           author: "기념일밥상",      time: 30, serves: 3, saved: 4210,  likes: 2810, tag: "한식·국",      img: IMG.soup },
];

const RECIPE_BY_ID = Object.fromEntries(RECIPES.map(r => [r.id, r]));

const FILTERS = [
  { id: "all",     label: "전체",       count: 320 },
  { id: "korean",  label: "한식",       count: 142 },
  { id: "soup",    label: "찌개·국",    count: 38 },
  { id: "noodle",  label: "면 요리",    count: 22 },
  { id: "rice",    label: "밥·덮밥",    count: 41 },
  { id: "salad",   label: "샐러드",     count: 18 },
  { id: "bunsik",  label: "분식",       count: 24 },
  { id: "western", label: "양식",       count: 35 },
];

const INGREDIENT_GROUPS = [
  { name: "채소", items: ["애호박", "감자", "양파", "당근", "대파", "마늘", "청양고추", "버섯", "오이", "토마토", "시금치", "부추"] },
  { name: "육류·해산물", items: ["삼겹살", "소불고기용", "닭다리살", "다진소고기", "달걀", "참치캔", "오징어", "새우"] },
  { name: "주식·면", items: ["쌀", "찹쌀", "당면", "라면", "파스타면", "떡볶이떡", "식빵"] },
  { name: "장·소스", items: ["고추장", "된장", "간장", "참기름", "들기름", "설탕", "맛술", "굴소스"] },
  { name: "유제품", items: ["우유", "버터", "치즈", "요거트"] },
];

const PANTRY = [
  { name: "양파",    group: "채소",      held: true,  meta: "1개 남음" },
  { name: "대파",    group: "채소",      held: true,  meta: "1단" },
  { name: "마늘",    group: "채소",      held: true,  meta: "다진 1통" },
  { name: "감자",    group: "채소",      held: false, meta: "다 떨어짐" },
  { name: "애호박",  group: "채소",      held: false, meta: "—" },
  { name: "달걀",    group: "육류·해산물", held: true,  meta: "5알" },
  { name: "두부",    group: "장·기타",   held: true,  meta: "한 모" },
  { name: "쌀",      group: "주식·면",   held: true,  meta: "2.4kg" },
  { name: "파스타면", group: "주식·면",   held: false, meta: "—" },
  { name: "간장",    group: "장·소스",   held: true,  meta: "충분" },
  { name: "고추장",  group: "장·소스",   held: true,  meta: "절반" },
  { name: "참기름",  group: "장·소스",   held: true,  meta: "여유" },
  { name: "설탕",    group: "장·소스",   held: true,  meta: "여유" },
  { name: "우유",    group: "유제품",    held: true,  meta: "500ml" },
  { name: "버터",    group: "유제품",    held: false, meta: "—" },
  { name: "치즈",    group: "유제품",    held: true,  meta: "슬라이스 4장" },
];

const DAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];
const TIME_LABELS = ["아침", "점심", "저녁"];

// Planner default — Tuesday today
const PLANNER_DATA = {
  default: [
    [null,                 { r: "r07", servings: 2 }, null, null, null, { r: "r02", servings: 2 }, { r: "r08", servings: 2 }],   // 아침
    [{ r: "r15", servings: 1 }, { r: "r12", servings: 2 }, { r: "r06", servings: 2 }, null, { r: "r09", servings: 2 }, null, { r: "r13", servings: 2 }], // 점심
    [{ r: "r01", servings: 2 }, { r: "r05", servings: 2 }, { r: "r03", servings: 3 }, { r: "r10", servings: 1 }, { r: "r04", servings: 3 }, { r: "r11", servings: 4 }, { r: "r16", servings: 3 }], // 저녁
  ],
  empty: [
    [null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null],
  ],
};

const SHOPPING_BUY = [
  { sec: "채소·과일", items: [
    { name: "애호박", amt: "1개" },
    { name: "감자", amt: "3개" },
    { name: "버섯", amt: "150g" },
    { name: "청양고추", amt: "3개" },
    { name: "쪽파", amt: "1단" },
    { name: "당근", amt: "1개" },
  ]},
  { sec: "육류·해산물", items: [
    { name: "삼겹살", amt: "400g" },
    { name: "소불고기용", amt: "500g" },
    { name: "다진 소고기", amt: "200g" },
  ]},
  { sec: "유제품·기타", items: [
    { name: "버터 (무염)", amt: "100g" },
    { name: "파스타면", amt: "500g" },
    { name: "식빵", amt: "1봉" },
  ]},
];

const SHOPPING_PANTRY = [
  { name: "양파",   note: "팬트리에 1개 남음" },
  { name: "달걀",   note: "팬트리에 5알" },
  { name: "두부",   note: "한 모 있음" },
  { name: "쌀",     note: "넉넉히 보유" },
  { name: "간장",   note: "충분" },
  { name: "참기름", note: "여유" },
  { name: "고추장", note: "절반 남음" },
  { name: "마늘",   note: "다진마늘 1통" },
];

const RECIPE_DETAIL_INGREDIENTS = [
  { name: "신김치", amt: "1/4포기" },
  { name: "돼지고기 앞다리살", amt: "200g" },
  { name: "두부", amt: "1/2모" },
  { name: "양파", amt: "1/2개" },
  { name: "대파", amt: "1대" },
  { name: "다진마늘", amt: "1큰술" },
  { name: "고춧가루", amt: "1큰술" },
  { name: "국간장", amt: "1큰술" },
  { name: "참기름", amt: "1작은술" },
  { name: "쌀뜨물", amt: "500ml" },
];

const RECIPE_DETAIL_STEPS = [
  "팬에 참기름을 두르고 한입 크기로 자른 돼지고기를 노릇하게 볶아요. 기름이 베어나오면 다진마늘을 더해요.",
  "신김치를 가위로 잘라 넣고 고춧가루를 더한 뒤 5분간 더 볶아 김치 향을 끌어올려요.",
  "쌀뜨물을 부어 끓이고, 끓어오르면 두부와 양파를 큼직하게 썰어 넣어요.",
  "약불에서 15분간 자작하게 졸이듯 끓여요. 거품은 살살 걷어내요.",
  "국간장으로 간을 맞추고 송송 썬 대파를 올려 1분 더 끓이면 완성이에요.",
];

const RECIPE_DETAIL_PHOTOS = [
  IMG.kimchijjigae, IMG.doenjang, IMG.bibimbap, IMG.rice, IMG.soup,
];

const MYPAGE_ACTIVITIES = [
  { icon: "📒", title: "내 레시피북",   meta: "3권 · 24개 레시피",    sub: "마지막 업데이트 어제" },
  { icon: "🛒", title: "장보기 기록",   meta: "12회 완료",            sub: "이번 달 평균 4.2일 간격" },
  { icon: "🔥", title: "요리 완료",     meta: "42끼",                 sub: "지난 30일" },
  { icon: "❤️", title: "좋아한 레시피",  meta: "67개",                 sub: "" },
];

const MYPAGE_SETTINGS = [
  { icon: "🔔", title: "알림 설정", meta: "장보기 알림 · 끼니 리마인더" },
  { icon: "👤", title: "계정",     meta: "이메일 로그인 · Google 연동" },
  { icon: "❓", title: "도움말",   meta: "FAQ · 1:1 문의" },
  { icon: "📄", title: "약관 및 정책", meta: "이용약관 · 개인정보 처리방침" },
];
