# Borrow Map — 다중 reference 차용 규칙

> 이 문서는 AI agent가 디자인 작업을 할 때 **어디서 무엇을 빌릴 수 있고, 무엇을 절대 빌리면 안 되는지**의 단일 소스다.
> Holicook(homecook) 프로젝트는 `ohou/DESIGN.md`를 단일 base로 하고, 아래 매트릭스에 따라 `notion`/`airbnb`에서 좁은 범위로만 패턴을 차용한다.

## 0. 절대 규칙 (Absolute Locks)

이 규칙은 어떤 컨텍스트에서도 깨면 안 된다.

1. **컬러는 `ohou` tokens만 사용한다.** Notion blue, Airbnb Rausch Red, Airbnb Luxe purple 등 다른 reference의 컬러 hex를 한 개도 가져오지 않는다.
2. **폰트는 `Pretendard Variable` stack 고정.** Airbnb Cereal VF / NotionInter / Inter 같은 다른 reference의 폰트는 도입하지 않는다.
3. **Radius / spacing / shadow 토큰은 `ohou`만 사용한다.** 다른 reference의 32px radius, 5-layer shadow stack 같은 토큰을 가져오지 않는다.
4. **Reference의 카피·문구를 그대로 가져오지 않는다.** "Get Notion free", "Become a Host" 같은 영문 카피·CTA 라벨은 절대 사용 금지.
5. **차용은 "패턴·구성·인터랙션 방식" 수준에서만 일어난다.** 토큰을 옮기는 것이 아니라 _어떻게 배치하고 어떻게 움직이는지_ 만 빌린다.

## 1. 차용 매트릭스

### 1.1 글로벌 시스템 (모든 화면 공통)

| 영역 | Default | 차용 허용 | 차용 금지 |
|---|---|---|---|
| **컬러 토큰** | ohou 전체 (Ohou Blue `#00A1FF` primary) | (해당 없음) | Notion/Airbnb 컬러 hex 일체 |
| **폰트 패밀리** | `Pretendard Variable` stack | (해당 없음) | Cereal VF, NotionInter, Inter, Circular |
| **본문 letter-spacing** | 0 (한글 가독성) | (해당 없음) | Airbnb의 -0.18~-0.44px 본문 적용 금지 |
| **UI 라벨/탭/카드 제목 letter-spacing** | -0.3px (ohou 실측) | (해당 없음) | — |
| **Spacing scale** | ohou 8px base (4/8/12/16/24/32/48/64/80) | (해당 없음) | Notion organic 5.6/6.4 스케일 도입 금지 |
| **Radius scale** | ohou (4/8/16/24, full pill) | (해당 없음) | Airbnb 32px large radius 도입 금지 |
| **Shadow** | ohou single-layer (`rgba(63,71,77,0.15) 0px 2px 5px`) | (해당 없음) | Airbnb 3-layer / Notion 5-layer stack 사용 금지 |

### 1.2 화면별 차용 규칙

| 화면 | Default | Borrow from `notion` | Borrow from `airbnb` |
|---|---|---|---|
| **HOME (레시피 탐색)** | ohou photo card grid + filter chip | — | ✅ 카드 hover 인터랙션 — image scale(1.05), gradient overlay bottom, heart/save overlay top-right<br>✅ 카테고리 pill bar의 horizontal scroll + 좌우 화살표 패턴 |
| **RECIPE_DETAIL — 사진 영역** | ohou masonry / 상단 fill image | — | ✅ 갤러리 lightbox open 패턴<br>✅ 사진 carousel dot indicator |
| **RECIPE_DETAIL — 본문 (재료·스텝)** | ohou 카드 | ✅ Reading hierarchy — heading-to-body 비율, line-height 1.5+ 한글 가독성, 섹션 간 64-80px breathing | — |
| **RECIPE_DETAIL — 액션 (좋아요·저장·플래너 추가)** | ohou icon button + Ohou Blue 액센트 | — | ✅ heart icon overlay 위치 (top-right with white buffer) |
| **요리모드 (Cooking)** | ohou + 자체 패턴 (전체화면, 좌우 스와이프, 조리방법 색상 코딩) | — | — |
| **PLANNER_WEEK** | ohou 균등 카드 + 베이스라인 spacing | — | — |
| **SHOPPING_DETAIL** | ohou 체크리스트 + 카드 | — | — |
| **PANTRY** | ohou 균등 카드 그리드 | — | — |
| **MYPAGE / SETTINGS** | ohou | ✅ Notion 워크스페이스 톤 — whisper border 카드, 목록 + 메타 secondary text, 섹션 alt 배경 리듬 | — |
| **레시피북 (BOOKS)** | ohou photo content card | ✅ 컬렉션 그리드 hierarchy (대표 이미지 + 메타) | — |
| **로그인 / Auth** | ohou | — | — |
| **모달 / 시트** | ohou | ✅ Notion floating elevation 패턴 (단, shadow는 ohou의 single-layer로) | — |

### 1.3 컴포넌트별 차용 규칙

| 컴포넌트 | Default | Borrow from `notion` | Borrow from `airbnb` |
|---|---|---|---|
| **Primary button** | ohou (`#00A1FF` bg, 8px radius) | — | — |
| **Card (사진 콘텐츠)** | ohou photo card | — | ✅ Hover: image scale(1.05) + gradient overlay + text-shadow (실제 ohou 패턴이기도 함) |
| **Card (상품/균등)** | ohou product card | — | — |
| **Filter chip** | ohou (`#f7f9fa`↔`#00A1FF`) | — | ✅ Horizontal scroll pill bar 패턴 |
| **Skeleton / Placeholder** | ohou (`#EAEDEF` image placeholder, `#f7f9fa` secondary surface) | — | — |
| **Modal / Bottom sheet** | ohou | ✅ Center modal layout (데스크탑) | — |
| **Heading hierarchy** | ohou Pretendard scale | ✅ H1→H2→H3 비율과 vertical rhythm (단, 폰트는 Pretendard) | — |
| **Long-form text** | ohou body 15-16px | ✅ Reading line-height 1.5+, paragraph spacing, 인용/구분 | — |
| **Search bar** | ohou (`#f7f9fa` bg) | — | ✅ Search bar의 prominence + pill-like rounding 패턴 |

## 2. 차용 표현 예시 (Good vs Bad)

### ✅ Good — 패턴만 빌리고 토큰은 ohou로 변환

```
RECIPE_DETAIL 본문은 Notion 스타일의 reading hierarchy를 따른다:
- H2 → body 사이 24px breathing
- 본문 line-height 1.6 (한글 가독성 우선)
- 단, 폰트는 Pretendard Variable, 컬러는 #424242 (ohou text primary)
```

### ❌ Bad — 토큰까지 통째로 가져오기

```
RECIPE_DETAIL은 Notion 톤이다:
- NotionInter 64px, letter-spacing -2.125px (← 폰트·트래킹 통째 가져옴, 금지)
- Color #0075de 액센트 (← Notion 컬러 도입, 금지)
- Warm white #f6f5f4 배경 (← Notion 토큰, 금지)
```

### ✅ Good — Airbnb의 사진 hover 패턴 차용

```
HOME 레시피 카드 hover:
- 이미지 scale(1.05), 300ms ease-out
- 하단 gradient overlay (rgba(0,0,0,0) → rgba(0,0,0,0.5))
- 카드 자체 shadow는 ohou single-layer 유지 (Airbnb 3-layer stack 미사용)
```

### ❌ Bad — Airbnb의 shadow까지 도입

```
HOME 카드는 Airbnb 스타일이다:
- 3-layer shadow stack (← 금지, ohou single-layer 유지)
- 20px radius card (← 금지, ohou 16px 유지)
- Rausch Red 좋아요 색 (← 금지, ohou semantic red 사용)
```

## 3. 신규 패턴이 필요할 때 (이 매트릭스에 없는 경우)

1. **먼저 ohou에 해당 패턴이 있는지 확인**한다.
2. 없다면 `notion`/`airbnb`에서 **가장 유사한 패턴**을 찾는다.
3. 차용 시 **토큰(컬러·폰트·radius·shadow)은 ohou로 변환**한다.
4. 변환 결과를 이 문서의 매트릭스에 항목으로 추가한다 (커밋과 함께).

## 4. 검증 체크리스트 (PR 시점)

AI agent가 생성한 결과물이 이 borrow-map을 지켰는지 확인하기 위한 체크.

- [ ] `globals.css`의 토큰이 ohou 값만 포함하는가 — Notion/Airbnb hex 검색해서 0개여야 함
- [ ] 폰트가 Pretendard stack 외 다른 폰트를 import하지 않는가
- [ ] 영문 카피 ("Become a Host" 같은) 가 섞이지 않았는가
- [ ] Shadow가 single-layer ohou 패턴인가 (3-layer/5-layer stack 검색해서 0개여야 함)
- [ ] 라디우스가 16/24px 범위를 벗어나지 않는가 (Airbnb 32px 도입 금지)
- [ ] 한글 본문에 negative letter-spacing이 들어가지 않았는가 (UI 라벨 -0.3px는 OK)

## 5. 이 문서를 AI에게 줄 때

```
홈쿡 디자인 시 다음 규칙을 반드시 준수해줘:

Primary base: docs/design/references/ohou/DESIGN.md
Borrow rules: docs/design/references/borrow-map.md (반드시 읽고 따를 것)
Borrow source 1 (제한적 차용만): docs/design/references/notion/DESIGN.md
Borrow source 2 (제한적 차용만): docs/design/references/airbnb/DESIGN.md

규칙:
- borrow-map.md §0의 절대 규칙을 어기지 말 것
- borrow-map.md §1의 매트릭스 범위 안에서만 다른 reference 차용
- 매트릭스에 없는 영역은 ohou만 사용
- 결과물 작성 후 §4 체크리스트로 셀프 검증
```
