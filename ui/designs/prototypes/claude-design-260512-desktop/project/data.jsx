/* global React */
/* ============================================
   HomeCook prototype data — spec v1.5.2
   ============================================ */

/* ---------- 사진 (Unsplash food photos — validated working URLs) ---------- */
const FOOD = {
  kimchi:    "https://images.unsplash.com/photo-1583224944844-5b268c057b72?w=900&h=675&fit=crop&q=80",
  bibimbap:  "https://images.unsplash.com/photo-1553163147-622ab57be1c7?w=900&h=675&fit=crop&q=80",
  bulgogi:   "https://images.unsplash.com/photo-1498654896293-37aacf113fd9?w=900&h=675&fit=crop&q=80",
  galbi:     "https://images.unsplash.com/photo-1591343395082-e120087004b4?w=900&h=675&fit=crop&q=80",
  jjigae:    "https://images.unsplash.com/photo-1582450871972-ab5ca641643d?w=900&h=675&fit=crop&q=80",
  pasta:     "https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=900&h=675&fit=crop&q=80",
  salad:     "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=900&h=675&fit=crop&q=80",
  curry:     "https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=900&h=675&fit=crop&q=80",
  ramen:     "https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=900&h=675&fit=crop&q=80",
  tteok:     "https://images.unsplash.com/photo-1635363638580-c2809d049eee?w=900&h=675&fit=crop&q=80",
  japchae:   "https://images.unsplash.com/photo-1583032015879-e5022cb87c3b?w=900&h=675&fit=crop&q=80",
  sundubu:   "https://images.unsplash.com/photo-1607330289024-1535c6b4e1c1?w=900&h=675&fit=crop&q=80",
  egg:       "https://images.unsplash.com/photo-1607461194658-4e2a91d4f06e?w=900&h=675&fit=crop&q=80",
  soup:      "https://images.unsplash.com/photo-1604152135912-04a022e23696?w=900&h=675&fit=crop&q=80",
  bowl:      "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=900&h=675&fit=crop&q=80",
  sandwich:  "https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=900&h=675&fit=crop&q=80",
};

/* ---------- 카테고리(테마) ---------- */
const THEMES = [
  { id: "t1", title: "30분 안에 끝내는 한 끼", count: 42, thumb: FOOD.bibimbap },
  { id: "t2", title: "냉장고 털이",            count: 28, thumb: FOOD.japchae },
  { id: "t3", title: "에어프라이어 한 그릇",   count: 35, thumb: FOOD.bulgogi },
  { id: "t4", title: "도시락 메뉴",            count: 19, thumb: FOOD.sandwich },
  { id: "t5", title: "밥 없이 가볍게",         count: 14, thumb: FOOD.salad },
  { id: "t6", title: "비 오는 날 국물",        count: 22, thumb: FOOD.sundubu },
];

/* ---------- 재료 카탈로그 (PANTRY / 필터 공통) ---------- */
const INGREDIENTS = [
  { id:"ing-onion",   name:"양파",        cat:"채소" },
  { id:"ing-garlic",  name:"마늘",        cat:"채소" },
  { id:"ing-greenon", name:"대파",        cat:"채소" },
  { id:"ing-carrot",  name:"당근",        cat:"채소" },
  { id:"ing-spinach", name:"시금치",      cat:"채소" },
  { id:"ing-mushroom",name:"표고버섯",    cat:"채소" },
  { id:"ing-tofu",    name:"두부",        cat:"채소" },
  { id:"ing-zucchini",name:"애호박",      cat:"채소" },
  { id:"ing-cabbage", name:"양배추",      cat:"채소" },
  { id:"ing-beef",    name:"소고기",      cat:"육류" },
  { id:"ing-pork",    name:"돼지고기",    cat:"육류" },
  { id:"ing-chicken", name:"닭다리살",    cat:"육류" },
  { id:"ing-shrimp",  name:"새우",        cat:"해산물" },
  { id:"ing-anchovy", name:"멸치 육수",   cat:"해산물" },
  { id:"ing-egg",     name:"계란",        cat:"기타" },
  { id:"ing-rice",    name:"쌀",          cat:"곡물" },
  { id:"ing-noodle",  name:"국수",        cat:"곡물" },
  { id:"ing-gochu",   name:"고추장",      cat:"양념" },
  { id:"ing-soy",     name:"간장",        cat:"양념" },
  { id:"ing-sesame",  name:"참기름",      cat:"양념" },
  { id:"ing-doenj",   name:"된장",        cat:"양념" },
  { id:"ing-pepper",  name:"고춧가루",    cat:"양념" },
  { id:"ing-sugar",   name:"설탕",        cat:"양념" },
  { id:"ing-vinegar", name:"식초",        cat:"양념" },
  { id:"ing-mirin",   name:"맛술",        cat:"양념" },
  { id:"ing-kimchi-i",name:"배추김치",    cat:"양념" },
];
const ING = Object.fromEntries(INGREDIENTS.map(i => [i.id, i]));

const CATEGORIES = ["전체", "채소", "육류", "해산물", "양념", "곡물", "기타"];

/* ---------- 레시피 (full) ---------- */
const RECIPES = [
  {
    id:"r1", title:"소고기 미역국", photo: FOOD.soup,
    source:"홈쿡 오리지널", tags:["국물","간단"], baseServings:2,
    views: 12483, likes:847, saves:1203, plannerAdds: 412,
    description: "결혼 기념일이든 평범한 월요일이든, 한 그릇이면 마음이 데워지는 미역국. 핏물을 잘 빼고 참기름에 충분히 볶아주는 것만 지키면 실패가 없어요.",
    cookTime: 40, difficulty: "쉬움",
    ingredients: [
      { id:"ing-beef",   amount:200, unit:"g" },
      { id:"ing-anchovy",amount:1.2, unit:"L", note:"국물용" },
      { id:"ing-garlic", amount:1,   unit:"큰술" },
      { id:"ing-soy",    amount:2,   unit:"큰술" },
      { id:"ing-sesame", amount:1,   unit:"큰술" },
      { id:"miyeok",     name:"불린 미역", amount:30, unit:"g" },
    ],
    steps: [
      { method:"준비",  text:"미역은 찬물에 20분 불린 뒤 한 입 크기로 자릅니다." },
      { method:"볶기",  text:"냄비에 참기름을 두르고 핏물 뺀 소고기를 볶다가 색이 변하면 미역을 넣어 3분 더 볶습니다." },
      { method:"끓이기",text:"육수를 붓고 강불에서 끓이다 거품을 걷어내고 약불로 25분 더 끓입니다." },
      { method:"준비",  text:"국간장 1큰술, 다진 마늘 1큰술을 넣고 간을 보며 마무리합니다." },
    ],
  },
  {
    id:"r2", title:"애호박 새우젓 볶음", photo: FOOD.bowl,
    source:"홈쿡 오리지널", tags:["반찬","10분"], baseServings:2,
    views: 8210, likes:512, saves:702, plannerAdds: 188,
    description: "애호박이 흐물해지지 않게 강불에서 빠르게 볶는 게 핵심입니다.",
    cookTime: 12, difficulty: "쉬움",
    ingredients: [
      { id:"ing-zucchini", amount:1, unit:"개" },
      { id:"ing-garlic",   amount:1, unit:"작은술" },
      { id:"ing-sesame",   amount:1, unit:"작은술" },
      { saewoo: true, name:"새우젓", amount:1, unit:"작은술" },
      { id:"ing-greenon",  amount:0.5, unit:"대" },
    ],
    steps: [
      { method:"준비",  text:"애호박은 반달썰기로 0.5cm 두께로 썹니다." },
      { method:"볶기",  text:"팬에 식용유를 두르고 마늘을 향이 날 때까지 볶습니다." },
      { method:"볶기",  text:"애호박을 넣고 강불에서 2분간 빠르게 볶습니다." },
      { method:"무치기",text:"새우젓과 다진 파를 넣고 30초 더 볶은 뒤 참기름으로 마무리합니다." },
    ],
  },
  {
    id:"r3", title:"비빔밥", photo: FOOD.bibimbap,
    source:"홈쿡 오리지널", tags:["한그릇","비건 가능"], baseServings:1,
    views: 24021, likes:1812, saves:2104, plannerAdds: 633,
    description: "남은 나물 반찬을 모두 모아 한 그릇으로 끝내는 비빔밥.",
    cookTime: 20, difficulty: "쉬움",
    ingredients: [
      { id:"ing-rice",   amount:1, unit:"공기" },
      { id:"ing-spinach",amount:50,unit:"g" },
      { id:"ing-carrot", amount:0.3, unit:"개" },
      { id:"ing-zucchini", amount:0.3, unit:"개" },
      { id:"ing-egg",    amount:1, unit:"개" },
      { id:"ing-gochu",  amount:1, unit:"큰술" },
      { id:"ing-sesame", amount:1, unit:"작은술" },
    ],
    steps: [
      { method:"준비",  text:"채소는 모두 5cm 길이로 채 썹니다." },
      { method:"데치기",text:"시금치는 끓는 물에 30초 데친 후 찬물에 헹궈 물기를 짭니다." },
      { method:"볶기",  text:"각 채소를 따로 소금 간만 살짝 해서 볶습니다." },
      { method:"굽기",  text:"계란은 반숙 후라이로 부칩니다." },
      { method:"무치기",text:"밥 위에 채소를 둘러 담고 계란과 고추장, 참기름을 올려 마무리합니다." },
    ],
  },
  {
    id:"r4", title:"순두부찌개", photo: FOOD.sundubu,
    source:"홈쿡 오리지널", tags:["국물","해장"], baseServings:2,
    views: 18910, likes:1453, saves:1820, plannerAdds: 521,
    description: "얼큰하게 끓여 한 그릇 비우면 속이 풀리는 순두부찌개.",
    cookTime: 25, difficulty: "쉬움",
    ingredients: [
      { id:"ing-tofu",   amount:1, unit:"팩" },
      { id:"ing-pork",   amount:100, unit:"g" },
      { id:"ing-anchovy",amount:600,unit:"ml" },
      { id:"ing-pepper", amount:2, unit:"큰술" },
      { id:"ing-garlic", amount:1, unit:"큰술" },
      { id:"ing-egg",    amount:1, unit:"개" },
      { id:"ing-greenon",amount:1, unit:"대" },
    ],
    steps: [
      { method:"볶기",   text:"뚝배기에 기름을 두르고 돼지고기를 볶다 고춧가루를 넣어 30초 더 볶습니다." },
      { method:"끓이기", text:"육수를 부어 끓이다가 순두부를 큼직하게 떠 넣습니다." },
      { method:"끓이기", text:"국간장으로 간을 맞춘 뒤 5분 더 끓입니다." },
      { method:"준비",   text:"계란을 깨뜨려 올리고 대파를 흩어 마무리합니다." },
    ],
  },
  {
    id:"r5", title:"소불고기", photo: FOOD.bulgogi,
    source:"홈쿡 오리지널", tags:["손님상","구이"], baseServings:3,
    views: 33120, likes:2891, saves:3402, plannerAdds: 1041,
    description: "달콤한 양념이 깊게 밴 불고기. 양념에 1시간 이상 재워 두는 게 포인트.",
    cookTime: 30, difficulty: "보통",
    ingredients: [
      { id:"ing-beef",    amount:400, unit:"g" },
      { id:"ing-onion",   amount:1,   unit:"개" },
      { id:"ing-soy",     amount:4,   unit:"큰술" },
      { id:"ing-sugar",   amount:1.5, unit:"큰술" },
      { id:"ing-garlic",  amount:1,   unit:"큰술" },
      { id:"ing-sesame",  amount:1,   unit:"큰술" },
      { id:"ing-greenon", amount:1,   unit:"대" },
    ],
    steps: [
      { method:"준비",  text:"분량의 양념을 모두 섞어 양념장을 만듭니다." },
      { method:"준비",  text:"소고기에 양념장을 부어 1시간 이상 재웁니다." },
      { method:"볶기",  text:"달군 팬에 양파부터 깔고 양념한 고기를 올려 강불에 볶습니다." },
      { method:"볶기",  text:"고기가 익으면 대파를 넣고 30초 더 볶아 마무리합니다." },
    ],
  },
  {
    id:"r6", title:"김치볶음밥", photo: FOOD.kimchi,
    source:"홈쿡 오리지널", tags:["한그릇","10분"], baseServings:1,
    views: 41200, likes:3210, saves:2980, plannerAdds: 1422,
    description: "잘 익은 김치를 충분히 볶아 깊은 맛을 끌어낸 김치볶음밥.",
    cookTime: 15, difficulty: "쉬움",
    ingredients: [
      { id:"ing-rice",     amount:1, unit:"공기" },
      { id:"ing-kimchi-i", amount:100, unit:"g" },
      { id:"ing-egg",      amount:1, unit:"개" },
      { id:"ing-greenon",  amount:0.5, unit:"대" },
      { id:"ing-sesame",   amount:1, unit:"작은술" },
      { id:"ing-soy",      amount:1, unit:"작은술" },
    ],
    steps: [
      { method:"볶기",  text:"팬에 김치를 잘게 썰어 강불에 충분히 볶습니다." },
      { method:"볶기",  text:"밥을 넣고 김치와 잘 섞어가며 2분 더 볶습니다." },
      { method:"굽기",  text:"옆에 계란 후라이를 부쳐 올립니다." },
      { method:"무치기",text:"참기름과 다진 파로 마무리합니다." },
    ],
  },
  {
    id:"r7", title:"잡채", photo: FOOD.japchae,
    source:"홈쿡 오리지널", tags:["명절","구이"], baseServings:4,
    views: 19332, likes:1410, saves:2105, plannerAdds: 622,
    description: "당면이 불지 않게 마지막에 무쳐내는 잡채.",
    cookTime: 45, difficulty: "보통",
    ingredients: [
      { name:"당면",       amount:200, unit:"g" },
      { id:"ing-beef",     amount:150, unit:"g" },
      { id:"ing-spinach",  amount:100, unit:"g" },
      { id:"ing-carrot",   amount:0.5, unit:"개" },
      { id:"ing-mushroom", amount:4,   unit:"개" },
      { id:"ing-onion",    amount:0.5, unit:"개" },
      { id:"ing-soy",      amount:4,   unit:"큰술" },
      { id:"ing-sugar",    amount:2,   unit:"큰술" },
      { id:"ing-sesame",   amount:2,   unit:"큰술" },
    ],
    steps: [
      { method:"끓이기",text:"당면을 끓는 물에 7분간 삶고 찬물에 헹궈 둡니다." },
      { method:"볶기",  text:"채소와 고기를 각각 따로 볶습니다." },
      { method:"무치기",text:"큰 볼에 모두 담고 양념과 함께 무쳐냅니다." },
      { method:"준비",  text:"참기름과 통깨로 마무리합니다." },
    ],
  },
  {
    id:"r8", title:"닭볶음탕", photo: FOOD.jjigae,
    source:"홈쿡 오리지널", tags:["국물","손님상"], baseServings:3,
    views: 22118, likes:1622, saves:1903, plannerAdds: 581,
    description: "감자가 부서질 듯 푹 익은 닭볶음탕.",
    cookTime: 50, difficulty: "보통",
    ingredients: [
      { id:"ing-chicken", amount:800, unit:"g" },
      { name:"감자",     amount:2,   unit:"개" },
      { id:"ing-onion",  amount:1,   unit:"개" },
      { id:"ing-carrot", amount:0.5, unit:"개" },
      { id:"ing-gochu",  amount:2,   unit:"큰술" },
      { id:"ing-pepper", amount:1,   unit:"큰술" },
      { id:"ing-soy",    amount:3,   unit:"큰술" },
      { id:"ing-garlic", amount:1,   unit:"큰술" },
    ],
    steps: [
      { method:"데치기",text:"닭은 끓는 물에 1분 데쳐 잡내를 뺍니다." },
      { method:"끓이기",text:"양념과 닭, 물을 넣고 강불에 10분 끓입니다." },
      { method:"끓이기",text:"감자, 당근, 양파를 넣고 약불에 30분 더 졸입니다." },
      { method:"준비",  text:"대파를 올려 마무리합니다." },
    ],
  },
];
const RECIPE = Object.fromEntries(RECIPES.map(r => [r.id, r]));

/* ---------- 끼니 컬럼 (default 아침/점심/저녁) ---------- */
const MEAL_COLUMNS = [
  { id:"col-b",  name:"아침" },
  { id:"col-l",  name:"점심" },
  { id:"col-d",  name:"저녁" },
];

/* ---------- PLANNER 주간 (5/11 - 5/17) ---------- */
const TODAY_ISO = "2026-05-12";
const WEEK_DATES = [
  { iso:"2026-05-11", dow:"월", d:11 },
  { iso:"2026-05-12", dow:"화", d:12 },
  { iso:"2026-05-13", dow:"수", d:13 },
  { iso:"2026-05-14", dow:"목", d:14 },
  { iso:"2026-05-15", dow:"금", d:15 },
  { iso:"2026-05-16", dow:"토", d:16 },
  { iso:"2026-05-17", dow:"일", d:17 },
];

/* status: registered | shopped | cooked */
const MEALS = [
  { id:"m1", date:"2026-05-11", col:"col-b", recipeId:"r6", servings:1, status:"cooked" },
  { id:"m2", date:"2026-05-11", col:"col-d", recipeId:"r5", servings:2, status:"cooked" },
  { id:"m3", date:"2026-05-12", col:"col-b", recipeId:"r6", servings:1, status:"shopped" },
  { id:"m4", date:"2026-05-12", col:"col-d", recipeId:"r4", servings:2, status:"shopped" },
  { id:"m5", date:"2026-05-13", col:"col-l", recipeId:"r3", servings:2, status:"registered" },
  { id:"m6", date:"2026-05-13", col:"col-d", recipeId:"r1", servings:2, status:"registered" },
  { id:"m7", date:"2026-05-14", col:"col-d", recipeId:"r8", servings:3, status:"registered" },
  { id:"m8", date:"2026-05-15", col:"col-l", recipeId:"r2", servings:2, status:"registered" },
  { id:"m9", date:"2026-05-15", col:"col-d", recipeId:"r7", servings:4, status:"registered" },
  { id:"m10",date:"2026-05-16", col:"col-l", recipeId:"r6", servings:1, status:"registered", leftover:true },
];

/* ---------- 팬트리 (보유 여부만) ---------- */
const PANTRY_HELD = new Set([
  "ing-onion","ing-garlic","ing-greenon","ing-egg","ing-rice",
  "ing-gochu","ing-soy","ing-sesame","ing-doenj","ing-pepper",
  "ing-sugar","ing-kimchi-i","ing-mirin","ing-anchovy",
]);
const PANTRY_GROUPS = [
  { id:"veg",    title:"채소·과일", cats:["채소"] },
  { id:"meat",   title:"육류·해산물", cats:["육류","해산물"] },
  { id:"sauce",  title:"양념·소스",   cats:["양념"] },
  { id:"grain",  title:"곡물·기타",   cats:["곡물","기타"] },
];
const PANTRY_BUNDLES = [
  { id:"b1", title:"기본 양념", picks:["ing-soy","ing-sesame","ing-gochu","ing-doenj","ing-pepper","ing-sugar","ing-vinegar","ing-mirin"] },
  { id:"b2", title:"국물 베이스", picks:["ing-anchovy","ing-garlic","ing-greenon","ing-soy"] },
  { id:"b3", title:"기본 채소", picks:["ing-onion","ing-garlic","ing-greenon","ing-carrot"] },
];

/* ---------- 장보기 리스트 ---------- */
const SHOPPING_LISTS = [
  {
    id:"sl1", title:"이번주 (5월 12일 - 5월 17일)", range:"5/12 - 5/17",
    createdAt:"2026-05-12", completed:false,
    mealIds:["m4","m5","m6","m7","m8","m9"],
    items: [
      { id:"i1", ing:"ing-beef",     name:"소고기 (양지)", amount:"450g",         note:"미역국·잡채용" },
      { id:"i2", ing:"ing-tofu",     name:"순두부",       amount:"2팩",         note:"" },
      { id:"i3", ing:"ing-pork",     name:"돼지고기 (앞다리)", amount:"100g",   note:"" },
      { id:"i4", ing:"ing-spinach",  name:"시금치",       amount:"150g",        note:"비빔밥·잡채" },
      { id:"i5", ing:"ing-carrot",   name:"당근",         amount:"2개",         note:"" },
      { id:"i6", ing:"ing-zucchini", name:"애호박",       amount:"1개",         note:"" },
      { id:"i7", ing:"ing-chicken",  name:"닭다리살",     amount:"800g",        note:"" },
      { id:"i8", ing:"ing-mushroom", name:"표고버섯",     amount:"4개 + 100g",  note:"잡채" },
      { id:"i9", ing:"misc-noodle",  name:"당면",         amount:"200g",         note:"" },
      { id:"i10",ing:"misc-potato",  name:"감자",         amount:"2개",         note:"" },
    ],
    excluded: [
      { id:"e1", ing:"ing-onion",    name:"양파",     amount:"2개" },
      { id:"e2", ing:"ing-garlic",   name:"마늘",     amount:"4큰술" },
      { id:"e3", ing:"ing-greenon",  name:"대파",     amount:"2.5대" },
      { id:"e4", ing:"ing-egg",      name:"계란",     amount:"2개" },
      { id:"e5", ing:"ing-soy",      name:"간장",     amount:"" },
      { id:"e6", ing:"ing-pepper",   name:"고춧가루", amount:"" },
    ],
  },
  {
    id:"sl2", title:"지난주 (5월 5일 - 5월 11일)", range:"5/5 - 5/11",
    createdAt:"2026-05-05", completed:true,
    mealIds:["m1","m2"],
    items: [
      { id:"j1", ing:"ing-beef",     name:"소고기", amount:"400g", checked:true },
      { id:"j2", ing:"ing-kimchi-i", name:"신김치", amount:"300g", checked:true },
    ],
    excluded: [],
  },
];

/* ---------- 남은 요리 ---------- */
const LEFTOVERS = [
  { id:"lf1", recipeId:"r5", createdAt:"2026-05-11", note:"불고기 2인분" },
  { id:"lf2", recipeId:"r7", createdAt:"2026-05-09", note:"잡채 절반" },
];
/* ---------- 다먹은 목록 ---------- */
const ATE = [
  { id:"a1", recipeId:"r1", ateAt:"2026-05-08" },
  { id:"a2", recipeId:"r3", ateAt:"2026-05-06" },
];

/* ---------- 마이페이지 ---------- */
const ACCOUNT = {
  nickname: "한지영",
  provider: "kakao", // kakao | naver | google
  initials: "JY",
};

/* 시스템 자동 레시피북 + 커스텀 */
const RECIPEBOOKS = [
  { id:"rb-my",     type:"my_added", title:"내가 추가한 레시피",  count:12, thumbs:[FOOD.bulgogi, FOOD.kimchi, FOOD.bowl] },
  { id:"rb-saved",  type:"saved",    title:"저장한 레시피",       count:38, thumbs:[FOOD.pasta, FOOD.curry, FOOD.bibimbap] },
  { id:"rb-liked",  type:"liked",    title:"좋아요한 레시피",     count:74, thumbs:[FOOD.salad, FOOD.ramen, FOOD.tteok] },
  { id:"rb-c1",     type:"custom",   title:"엄마 레시피",         count:18, thumbs:[FOOD.soup, FOOD.jjigae, FOOD.japchae] },
  { id:"rb-c2",     type:"custom",   title:"손님 초대",           count: 7, thumbs:[FOOD.bulgogi, FOOD.galbi, FOOD.pasta] },
  { id:"rb-c3",     type:"custom",   title:"도시락 모음",         count:11, thumbs:[FOOD.sandwich, FOOD.salad, FOOD.bowl] },
];

const FAQ_ITEMS = [
  {
    q: "플래너에 끼니를 추가하는 방법",
    a: "플래너 화면의 빈 칸에서 추가 버튼을 누르거나, 레시피 상세에서 플래너에 추가를 선택하세요.",
  },
  {
    q: "레시피북을 만들고 관리하는 방법",
    a: "마이페이지의 레시피북 관리에서 새 레시피북을 만들고, 커스텀 북은 상세 화면에서 삭제할 수 있어요.",
  },
  {
    q: "팬트리 재료를 등록하는 방법",
    a: "팬트리 화면에서 재료 카드를 선택하면 보유 상태를 바꿀 수 있고, 재료 추가 버튼으로 여러 재료를 한 번에 담을 수 있어요.",
  },
  {
    q: "장보기 리스트가 자동으로 만들어지나요?",
    a: "플래너에 등록한 끼니의 재료에서 팬트리에 있는 재료를 제외해 장보기 리스트를 만들 수 있어요.",
  },
  {
    q: "요리모드는 데스크탑에서 사용할 수 있나요?",
    a: "데스크탑에서도 조리 단계를 보며 요리하고, 사용한 재료를 팬트리에서 차감할 수 있어요. 플래너 끼니는 장보기 완료 후에만 요리 완료로 바뀝니다.",
  },
];

/* ---------- 메뉴 추가: 유튜브/직접 만들기 더미 데이터 ---------- */
const YT_DEMO_EXTRACTION = {
  videoTitle: "초간단 김치볶음밥 만들기 | 10분 레시피",
  channel: "홈쿡 TV",
  thumbnail: FOOD.kimchi,
  recipe: {
    title: "김치볶음밥",
    cookTime: 15,
    baseServings: 1,
    ingredients: [
      { id:"ing-rice",     amount:1,   unit:"공기" },
      { id:"ing-kimchi-i", amount:100, unit:"g" },
      { id:"ing-egg",      amount:1,   unit:"개" },
      { id:"ing-greenon",  amount:0.5, unit:"대" },
      { id:"ing-sesame",   amount:1,   unit:"작은술" },
    ],
    memo: "출처: 유튜브 — 홈쿡 TV",
  },
};

const UNIT_OPTIONS = ["g", "ml", "개", "큰술", "작은술", "공기", "컵", "팩", "대", "장"];

/* ---------- 요리 단계 메서드 컬러 ---------- */
const COOK_METHOD_COLORS = {
  "준비":   { bg: "#FFF8EE", fg: "#B8860B" },
  "볶기":   { bg: "#FFF0E6", fg: "#D4600A" },
  "끓이기": { bg: "#FFECEC", fg: "#C13030" },
  "데치기": { bg: "#EEFBFF", fg: "#0A7EA4" },
  "굽기":   { bg: "#FFF5EE", fg: "#9A5A30" },
  "무치기": { bg: "#EEFFF3", fg: "#1A7A35" },
};

/* ---------- 토스트 코어 ---------- */
function makeToastBus() {
  const subs = new Set();
  return {
    sub(fn){ subs.add(fn); return () => subs.delete(fn); },
    show(msg){ subs.forEach(fn => fn(msg)); },
  };
}

/* ---------- 차트 helper ---------- */
function fmtPlannerDate(iso) {
  const d = new Date(iso + "T00:00:00");
  return `${d.getMonth()+1}월 ${d.getDate()}일`;
}
function fmtChipDate(iso) {
  const d = new Date(iso + "T00:00:00");
  const dow = ["일","월","화","수","목","금","토"][d.getDay()];
  return `${dow} ${d.getMonth()+1}/${d.getDate()}`;
}

window.HC_DATA = {
  FOOD, THEMES, INGREDIENTS, ING, CATEGORIES, RECIPES, RECIPE,
  MEAL_COLUMNS, WEEK_DATES, TODAY_ISO, MEALS,
  PANTRY_HELD, PANTRY_GROUPS, PANTRY_BUNDLES,
  SHOPPING_LISTS, LEFTOVERS, ATE,
  ACCOUNT, RECIPEBOOKS, FAQ_ITEMS,
  YT_DEMO_EXTRACTION, UNIT_OPTIONS,
  COOK_METHOD_COLORS,
  makeToastBus, fmtPlannerDate, fmtChipDate,
};
