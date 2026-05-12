# Design System: 오늘의집 (Ohou.se)

> Source: 직접 작성 (Stitch DESIGN.md base 9 섹션 포맷)
> Original auto-extracted tokens: `DESIGN.md.original.md` (Chrome 익스텐션 / bergside design-md-chrome)
> Status: 2차 정리본. 자동 추출 토큰 재분류 + 누락 섹션 보강 + ohou.se 실측 cross-check (Codex 검증 반영).
> Confidence note:
> - **웹 확인값 (High)**: 시그니처 블루 `#00A1FF`(공식 사이트 활성 탭에서 직접 확인), Image placeholder `#EAEDEF`, 폰트 스택, UI 라벨 letter-spacing -0.3px, 카드 hover image scale + gradient overlay 패턴, shadow.
> - **추출값 (High)**: muted surface `#f7f9fa`, radius 토큰, 본문 텍스트 컬러.
> - **사이트 일반 패턴 기반 추정 (Medium)**: 타이포 스케일 일부, spacing scale 확장값, 데스크탑 responsive breakpoint.
> - **앱/일반 패턴 추정 (Low → 별도 명시)**: bottom tab, sticky bottom CTA 등 모바일 앱 패턴 — 웹 reference에 그대로 적용 금지, §7에서 별도 표기.
> 검증 시 ohou.se DevTools로 cross-check 권장.

## 1. Visual Theme & Atmosphere

오늘의집(Ohou.se)은 "라이프스타일 슈퍼앱"이라는 정체성을 디자인 언어 전체에 일관되게 새긴다. 페이지는 사진을 위해 비워진다. 흰색 캔버스(`#ffffff`)와 따뜻한 회색의 muted surface(`#f7f9fa`) 위에 시그니처 **Ohou Blue**(`#00A1FF`)가 단 하나의 채도 높은 액센트로 놓여, 사용자의 시선이 항상 콘텐츠 사진(집들이·셀프 인테리어·상품 컷)에 먼저 가도록 설계된다. UI 자체는 **사진을 위한 갤러리 프레임** 역할에 충실하고, 텍스트·버튼·아이콘은 사진을 압도하지 않는다.

타이포그래피는 **한국어 가독성**을 최상위 가치로 둔다. Pretendard Variable을 primary로 채택하고, Noto Sans KR·Apple SD Gothic Neo·맑은 고딕을 fallback으로 둬서 모든 디바이스에서 한글이 깨지지 않게 한다. 본문 베이스가 15px라는 점이 인상적이다 — 표준 16px보다 1px 작아 화면 밀도가 높아지고, 카드형 콘텐츠가 더 많이 노출된다. 동시에 line-height를 1.5 이상으로 유지해 한국어 특유의 빽빽함을 해소한다.

레이아웃은 **사진 카드 그리드**가 지배한다. 균등 카드(상품) + 자유 비율 카드(콘텐츠)의 두 가지 그리드가 공존하고, 그 사이를 가는 1px whisper border와 둥근 16~24px radius가 매끄럽게 잇는다. 카드 hover의 1순위 효과는 그림자가 아니라 **사진 자체의 scale(1.05) 확대 + 하단 gradient overlay**다 — 이게 ohou의 가장 시그니처한 인터랙션이다. shadow는 보조로 fade-in되며 (`rgba(63,71,77,0.15) 0px 2px 5px`), **종이 위에 살짝 부유한 느낌**을 강화한다.

**Key Characteristics:**

* Pretendard Variable (한국어-optimized open font) primary, 다중 한글 fallback
* Warm Blue accent (`#00A1FF`) — 흰색 베이스 위 단일 액센트 컬러 (공식 사이트 활성 탭 실측)
* 따뜻한 회색 텍스트(`#424242` 본문, `#2f3438` 강조) — 순흑이 아닌 미세 회색
* 사진 카드 그리드가 IA의 중심 — 균등 카드 + 자유 비율 카드 혼용
* **시그니처 hover**: image `scale(1.05)` + 하단 gradient overlay + text-shadow (shadow는 보조)
* 1px 가벼운 border + 16~24px radius로 카드 사이 분리
* Image placeholder `#EAEDEF` (사진 로드 전 skeleton fill)
* Base body 15px (한국 모바일 친화적 밀도)
* **Letter-spacing 분리**: 본문 0, UI 라벨/탭/카드 제목 -0.3px (시그니처 트래킹)
* 카테고리 chip / 태그 pill UI가 콘텐츠 디스커버리의 핵심

## 2. Color Palette & Roles

### Brand Primary

* **Ohou Blue** (`#00A1FF`): 시그니처 액센트. 주요 CTA, 활성 탭/필터, 링크, 좋아요·저장·하트 인터랙션. 흰색 베이스 위 단 하나의 saturated color. 공식 사이트 활성 탭 컬러 실측값.
* **Ohou Blue Light** (`#5bb8ff` 추정): hover/active 보조 상태 (관찰 기반 추정 — DevTools 검증 필요).
* **Ohou Blue Dark** (`#0085db` 추정): 진행 상태·강조 헤더 (관찰 기반 추정 — DevTools 검증 필요).

### Surface

* **Pure White** (`#ffffff`): 페이지 베이스 배경, 카드 배경, primary 버튼 텍스트.
* **Muted Surface** (`#f7f9fa`): 섹션 alt 배경, 입력 필드 배경, 비활성 chip 배경. 보조 surface로 사용 (이미지 placeholder 용도 아님).
* **Image Placeholder / Skeleton** (`#EAEDEF`): **이미지 placeholder, skeleton state, 로딩 중 카드 fill 색.** 실측값 — 사진 카드의 이미지가 로드되기 전 표시되는 회색.
* **Subtle Divider** (`#eef0f2` 추정): 가는 구분선용 (DevTools 검증 필요).

### Text

* **Text Primary** (`#424242`): 본문, 카드 제목. 순흑(#000) 대신 부드러운 회색.
* **Text Secondary** (`#2f3438`): 강조 텍스트, 헤딩. Primary보다 약간 더 어두움.
* **Text Tertiary** (`#8a8e93` 추정): 메타 정보, 캡션, 타임스탬프.
* **Text Inverse** (`#ffffff`): 다크 배경·이미지 오버레이 위 텍스트.
* **Text Brand** (`#00A1FF`): 링크, 인터랙티브 강조.

### Semantic

* **Success** (`#1aae39` 추정): 구매 완료, 저장 완료 토스트.
* **Warning** (`#ff9500` 추정): 임시 저장, 재고 부족.
* **Error** (`#ff3b30` 추정): 결제 실패, 폼 오류.
* **Like / Heart** (`#ff5757` 추정): 좋아요 인터랙션 (콘텐츠 카드 하트).

### Depth & Border

* **Border Default** (`rgba(0,0,0,0.08)` 추정): 카드 outline, 입력 border.
* **Border Strong** (`#dddddd` 추정): 강조 divider.
* **Shadow** (`rgba(63,71,77,0.15) 0px 2px 5px 0px`): 카드·플로팅 요소 기본 그림자. 단일 레이어, 종이 위 부유감.

> 추정값(추정 표기)은 자동 추출에서 누락된 항목을 사이트 일반 관찰로 채운 것. ohou.se DevTools에서 cross-check 후 확정 권장.

## 3. Typography Rules

### Font Family

* **Primary**: `Pretendard Variable`
* **Fallback stack**: `Pretendard Variable, Pretendard, -apple-system, BlinkMacSystemFont, system-ui, "Noto Sans KR", "Apple SD Gothic Neo", "맑은 고딕", Malgun Gothic, sans-serif`
* **OpenType features**: 한국어 기본 (가변 weight 100-900)

### Hierarchy

| Role | Font | Size | Weight | Line Height | Notes |
| --- | --- | --- | --- | --- | --- |
| Display | Pretendard Variable | 40px (2.50rem) | 700 | 1.25 | 기획전 타이틀, 큰 promo headline |
| H1 | Pretendard Variable | 28px (1.75rem) | 700 | 1.30 | 페이지 메인 제목 |
| H2 | Pretendard Variable | 22px (1.38rem) | 700 | 1.35 | 섹션 헤딩, 카테고리 타이틀 |
| H3 | Pretendard Variable | 18px (1.13rem) | 600 | 1.40 | 카드 제목, 모달 제목 |
| Body Large | Pretendard Variable | 16px (1.00rem) | 400 | 1.50 | 상품 설명, 콘텐츠 본문 |
| Body | Pretendard Variable | 15px (0.94rem) | 400 | 1.50 | **베이스 본문** — 한국 모바일 밀도 친화 |
| Body Medium | Pretendard Variable | 15px (0.94rem) | 500 | 1.50 | 내비게이션, 버튼, 강조 UI |
| Caption | Pretendard Variable | 14px (0.88rem) | 400 | 1.45 | 카드 부제, 메타 |
| Small | Pretendard Variable | 12px (0.75rem) | 500 | 1.40 | 태그, pill, 마이크로 라벨 |
| Micro | Pretendard Variable | 11px (0.69rem) | 400 | 1.40 | 타임스탬프, 카운트 |

### Principles

* **한국어 우선 가독성**: line-height 1.5 baseline. 한글은 라틴 알파벳보다 시각적 밀도가 높아 1.3 미만이면 답답해진다.
* **15px base**: 일반 사이트(16px)보다 1px 작아 모바일 한 화면에 더 많은 카드가 노출됨. 데스크탑에서는 16px Body Large로 점진 확대.
* **4-weight 시스템**: 400(읽기) · 500(UI/상호작용) · 600(강조 카드 제목) · 700(헤딩/디스플레이). Variable font라 weight 미세 조정 가능.
* **Letter-spacing은 본문과 UI 라벨을 분리한다** (ohou.se 실측 기반):
    * **본문 (body, paragraph)**: `0` 또는 매우 작음 — 한글 가독성 보존
    * **UI 라벨 / 탭 / 카드 제목 / nav 텍스트**: `-0.3px` — 오늘의집 시그니처 트래킹, 라벨에 적당한 밀도를 줌
    * **Display (40px+)**: `-0.5px ~ -1px` — 미세 negative tracking으로 헤드라인 압축감
* **숫자는 tabular**: 가격·인분·평점 표시에 `font-feature-settings: "tnum"` 권장 (자동 추출에는 없으나 e-commerce 사이트 관행).

## 4. Component Stylings

### Buttons

**Primary (Ohou Blue)**

* Background: `#00A1FF`
* Text: `#ffffff`
* Padding: 12px 20px (medium), 14px 24px (large)
* Radius: 8px (medium), 12px (large)
* Hover: 배경 darken to `#0085db` (추정)
* Active: scale(0.98), 동일 색
* Disabled: `#cfd4d8` bg, `#ffffff` text
* Use: 주요 CTA — "구매하기", "장바구니 담기", "팔로우", "저장"

**Secondary (Ghost / Outline)**

* Background: `transparent`
* Border: `1px solid #00A1FF`
* Text: `#00A1FF`
* Padding: 동일
* Hover: 배경 `rgba(29,162,255,0.06)` (옅은 블루 워시)
* Use: 부수 액션 — "공유", "팔로워", "필터 적용"

**Tertiary (Quiet)**

* Background: `#f7f9fa` (muted surface)
* Text: `#424242`
* Border: none
* Use: 카드 내 작은 액션 — "더보기", "정렬", "옵션 선택"

**Icon Button**

* 36×36px touch target
* Background: transparent (default) → `rgba(0,0,0,0.04)` (hover)
* Radius: 50% (원형) 또는 8px
* Use: 좋아요(하트), 저장(북마크), 공유, 닫기

### Cards & Containers

**Photo Content Card** (집들이·스타일링 카드)

* Background: `#ffffff`
* Image: 카드 상단 fill, 4:3 또는 정사각 비율, `object-fit: cover`
* Image placeholder: `#EAEDEF` (skeleton fill, lazy-load 전)
* Border: `1px solid rgba(0,0,0,0.08)` 또는 borderless
* Radius: 16px (sm) — 카드 전체
* 이미지 radius: 16px 16px 0 0 (top corners)
* Inner padding: 12-16px
* Caption: 14px Pretendard Variable weight 400
* Author + meta: 12-13px secondary text

**Photo card hover 패턴 (시그니처 — 이게 핵심)**

ohou.se의 카드 hover는 그림자가 아니라 **사진 자체가 살아 움직이는** 방식이다. shadow는 보조 효과일 뿐, 1순위는 image scale + gradient overlay이다.

* **Image scale**: `transform: scale(1.05)`, `transition: 300ms ease-out` — 사진이 카드 안에서 살짝 확대됨 (카드 외곽은 고정, image만 zoom-in)
* **Image overflow clip**: 카드는 `overflow: hidden`이라 확대된 사진이 잘려서 frame 안에 머묾
* **Gradient overlay**: 사진 위에 텍스트가 얹히는 카드의 경우 하단 `linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.5) 100%)`을 항상 깔아 텍스트 가독성을 확보
* **Text shadow**: 사진 위 텍스트에 `text-shadow: 0 1px 2px rgba(0,0,0,0.3)` 또는 그라데이션 위 흰 텍스트
* **Shadow (보조)**: hover 시 `rgba(63,71,77,0.15) 0px 2px 5px 0px` fade-in — 단, image scale 없이는 ohou 톤이 안 남
* **Cursor / focus**: pointer, focus ring은 outline `2px solid #00A1FF`

**Product Card** (상품 카드)

* Background: `#ffffff`
* Image: 정사각, edge-to-edge
* Border: none (그리드에서 spacing으로 분리)
* Radius: 8px image, 0 card
* Price: 16-18px weight 700 primary text
* Discount badge: red/orange pill, 12px weight 600
* Brand name: 12px secondary text
* Use: 스토어 상품 그리드

**Masonry / Lifestyle Card** (자유 비율)

* 가변 height (사진 비율 그대로)
* Hover: 위 "Photo card hover 패턴" 동일 적용 — image scale(1.05) + gradient overlay 우선, shadow는 보조
* Like / Save 아이콘 오버레이 (top-right)

### Inputs & Forms

* Background: `#f7f9fa`
* Border: `1px solid transparent` (default) → `#00A1FF` (focus)
* Radius: 8px
* Padding: 12px 16px
* Text: 15px Pretendard Variable
* Placeholder: `#8a8e93` (text tertiary)
* Search bar: 좌측 magnifier 아이콘, 우측 clear(X) 아이콘

### Navigation

* **Top header (Desktop/Mobile)**: 흰색 sticky header, logo + global search + 사용자 메뉴
* **Category bar**: 가로 스크롤 카테고리 chip 리스트 (모바일), tab bar (데스크탑)
* **Bottom tab (Mobile)**: 5탭 구조 일반적 (홈/탐색/스토어/저장/마이) — 활성 탭은 Ohou Blue
* **Hover/Active**: Ohou Blue 텍스트, 굵기 500→600 전환

### Distinctive Components

**Filter Chip / Tag Pill**

* Default: `#f7f9fa` bg, `#424242` text
* Active: `#00A1FF` bg, `#ffffff` text
* Radius: 9999px (full pill)
* Padding: 6px 14px
* Font: 13-14px weight 500
* Use: 카테고리 필터, 태그, 검색 추천

**Like / Save Overlay**

* Position: 카드 image top-right
* Heart icon: 24px, outline (default) → fill red `#ff5757` (active)
* Background: `rgba(255,255,255,0.85)` 원형 buffer

**Price Display**

* Original price: line-through, secondary text
* Discount %: red text, weight 600
* Final price: 16-18px primary text, weight 700
* Tabular numerals

**Stats Bar** (콘텐츠 카드)

* 좋아요 수 + 스크랩 수 + 댓글 수
* 아이콘 + 숫자 inline
* 12-13px tertiary text

## 5. Layout Principles

### Spacing System

* **Base unit**: 4px
* **Scale**: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80px
* **카드 간 gap**: 8-12px (mobile grid), 16-20px (desktop grid)
* **섹션 vertical padding**: 32px (mobile), 48-64px (desktop)
* **컨테이너 horizontal padding**: 16px (mobile), 24-32px (desktop)

> 자동 추출의 `space.1=1px ~ space.8=10px`는 마이크로 spacing만 잡혔던 것 — 실제 사이트는 위 큰 단위가 더 핵심.

### Grid & Container

* **Max content width**: 1200px (데스크탑 콘텐츠 영역)
* **Photo grid**: 2-column (mobile <600px), 3-column (tablet), 4-5 column (desktop)
* **Product grid**: 2-column (mobile), 4-column (desktop)
* **Masonry**: 자유 비율 카드는 CSS columns 또는 grid-auto-rows: masonry
* **Container alternation**: white ↔ `#f7f9fa` 섹션 교차 — 시각 리듬

### Border Radius Scale

* **xs (4px)**: 작은 chip, badge, micro element
* **sm (8px)**: 입력 필드, 버튼, 작은 카드
* **md (16px)**: 표준 콘텐츠 카드
* **lg (24px)**: 큰 promo 카드, 모달 컨테이너
* **full (9999px)**: pill, chip, 원형 아바타 / 아이콘 버튼

### Whitespace Philosophy

* **사진 우선**: 텍스트와 사진 사이는 8-12px, 섹션 사이는 32-64px. 사진이 숨 쉴 공간을 우선.
* **카드 그리드 밀도**: 모바일은 빽빽하게(8px gap), 데스크탑은 여유 있게(16-20px gap).
* **alt 배경 리듬**: 흰색 섹션과 muted gray 섹션의 교차로 페이지를 분절. 하드한 divider를 거의 쓰지 않음.

## 6. Depth & Elevation

| Level | Treatment | Use |
| --- | --- | --- |
| Flat (Level 0) | No shadow, no border | 페이지 배경, 텍스트 블록, masonry 카드 default |
| Whisper (Level 1) | `1px solid rgba(0,0,0,0.08)` | 카드 outline, 입력 필드, divider |
| Soft (Level 2) | `rgba(63,71,77,0.15) 0px 2px 5px 0px` | 카드 hover, sticky header, dropdown |
| Floating (Level 3) | `rgba(63,71,77,0.18) 0px 8px 24px 0px` (추정 보강) | 모달, bottom sheet, 플로팅 액션 버튼 |
| Focus (a11y) | `2px solid #00A1FF` outline | 키보드 포커스 ring |

**Shadow Philosophy**: 오늘의집의 그림자는 **종이 위에 살짝 떠 있는 느낌**을 목표로 한다. 한 개의 layer로 충분히 깊이를 만들고, opacity는 0.15로 다소 진하지만 blur radius(5px)가 작아 윤곽이 분명하다. Notion식 multi-layer ambient occlusion과는 다른 방향 — 더 명료한 카드 분리.

* 모달·sheet에서는 ohou Blue가 빛처럼 살짝 비치는 느낌의 더 큰 그림자(추정 보강)
* 호버 시 그림자가 fade-in되며 카드가 떠오름

## 7. Responsive Behavior

> **신뢰도 표시**: 이 섹션은 **웹 reference**가 1차 출처다. ohou에는 별도 모바일 앱(iOS/Android)이 존재하지만, 이 reference는 **공식 웹사이트(ohou.se)의 responsive 동작**을 다룬다. 앱 전용 패턴(bottom tab, 햄버거 + sticky CTA 등)은 §7.6에 별도로 추정 표기한다.

### 7.1 Breakpoints (웹 — Medium confidence)

> ohou.se 메인은 JS-heavy 페이지라 정확한 breakpoint를 자동 추출하지 못했다. 아래는 그리드 컬럼 변화 관찰 기반 추정.

| Name | Width | Key Changes |
| --- | --- | --- |
| Mobile S | <360px | 단일 컬럼, 16px padding, 본문 14px로 축소 |
| Mobile | 360-767px | 2-column photo grid, 8px gap, 본문 15px |
| Tablet | 768-1023px | 3-column grid, 16px gap, side margin 24px |
| Desktop | 1024-1439px | 4-column grid, 20px gap, max-width 1200px |
| Wide | >1440px | 4-5 column grid, centered, 32px outer margin |

### 7.2 Touch Targets (웹 — High confidence)

* 모든 인터랙티브 요소 최소 44×44pt 보장
* 카드 자체가 큰 터치 타겟 — 이미지 어디든 탭하면 상세 진입
* 좋아요·저장 아이콘 36-44px 원형 buffer

### 7.3 Collapsing Strategy (웹 확인값)

* **헤더**: 데스크탑 inline nav → 모바일 햄버거 + 검색 아이콘
* **카테고리 bar**: 데스크탑 tab → 모바일 가로 스크롤 chip strip
* **상품 그리드**: 4-col → 3-col → 2-col → 1-col
* **모달**: 데스크탑 center modal → 모바일 full-screen 또는 bottom sheet

### 7.4 Image Behavior (웹 — High confidence)

* **Aspect-ratio 보존**: `object-fit: cover`로 카드 비율 유지 (실측)
* **Hover scale**: 데스크탑에서 `transform: scale(1.05)` (실측)
* **Lazy loading**: 무한 스크롤 그리드에서 viewport 진입 시 fetch
* **Responsive srcset**: 모바일은 압축 작은 이미지, 데스크탑은 고해상
* **Placeholder**: `#EAEDEF` skeleton (실측) → 이미지 fade-in

### 7.5 Modal / Sheet (웹 확인값)

* 데스크탑: center modal, 화면 중앙, dimmed overlay
* 모바일 웹: full-screen overlay 또는 bottom sheet

### 7.6 모바일 앱 패턴 (추정 — Low confidence, 웹 reference 아님)

> 아래 항목은 ohou의 **모바일 앱** UX에서 흔히 관찰되는 패턴이지만, **이번 자동 추출과 웹 reference 검증만으로는 확정할 수 없다**. 홈쿡 웹 디자인에 그대로 적용하지 말고, 모바일 웹뷰 또는 native app에 한정해서 참고만 한다.

* **Bottom tab navigation** (5탭 구조 — 홈/탐색/스토어/저장/마이, 활성 탭 Ohou Blue): 모바일 앱 일반 패턴 추정
* **Sticky bottom CTA** (상품 상세에서 "구매하기" / 레시피 상세에서 "요리하기" 같은 고정 액션 바): 일반 e-commerce/콘텐츠 앱 패턴 추정
* **Pull-to-refresh**: 일반 모바일 앱 패턴 추정
* **Floating action button**: ohou 앱에서 사용 가능성 있으나 미확인

→ 홈쿡 **웹**에서는 §7.1~§7.5 규칙만 따른다. 모바일 앱이 별도로 있다면 §7.6 패턴을 추가 검증 후 도입한다.

## 8. Accessibility & States

### Focus System

* 모든 인터랙티브 요소에 `:focus-visible` 적용
* Focus ring: `2px solid #00A1FF` outline, offset 2px
* Tab navigation 전체 지원

### Interactive States

* **Default**: 정상 표시
* **Hover** (desktop): 컬러 미세 shift, 카드는 soft shadow fade-in
* **Active/Pressed**: scale(0.98), 색상 약간 어둡게
* **Focus**: blue outline ring
* **Disabled**: gray bg (`#cfd4d8`), text `#8a8e93`, cursor not-allowed
* **Loading**: skeleton placeholder 또는 spinner (Ohou Blue)
* **Error**: red border + 텍스트, 16px above input
* **Empty**: 일러스트 + 안내 카피 + 다음 액션 CTA

### Color Contrast

* Primary text (`#424242`) on white: ~9.7:1 (WCAG AAA)
* Secondary text (`#2f3438`) on white: ~12.5:1 (WCAG AAA)
* Tertiary text (`#8a8e93`) on white: ~3.6:1 (WCAG AA large text only)
* Ohou Blue (`#00A1FF`) on white: ~3.0:1 — **AA fail for normal text, OK for large text(18pt+)**. 본문에는 진한 variant(`#0085db`, ~4.6:1) 권장.
* White text on Ohou Blue button: ~4.3:1 — AA pass for large text, marginal for 14px normal.

### Korean A11y Considerations

* 한글 본문은 12px 이하 사용 지양 (가독성)
* line-height 1.5 미만 본문은 한글 가독성 저하
* IME 입력 중 placeholder 깨짐 방지 (Safari 이슈 주의)

## 9. Agent Prompt Guide

### Quick Color Reference

* Primary CTA: Ohou Blue (`#00A1FF`) — 공식 사이트 실측
* Background: Pure White (`#ffffff`)
* Alt Background: Muted Gray (`#f7f9fa`)
* Image Placeholder / Skeleton: `#EAEDEF` — 실측
* Heading text: Text Secondary (`#2f3438`)
* Body text: Text Primary (`#424242`)
* Caption / meta: Text Tertiary (`#8a8e93`)
* Border: `1px solid rgba(0,0,0,0.08)`
* Like / Heart: `#ff5757`
* Focus ring: Ohou Blue (`#00A1FF`)

### Example Component Prompts

* "Create a photo content card grid. Each card: white background, 16px radius, `overflow: hidden`. Image fills top in 4:3 ratio with `object-fit: cover` and `#EAEDEF` placeholder fill while loading. 12px inner padding below image. Title at 15px Pretendard Variable weight 500 color #2f3438 with letter-spacing -0.3px. Author line at 13px weight 400 color #8a8e93. Heart icon overlay top-right, 24px outline, fills #ff5757 when active. **On hover: image `transform: scale(1.05)` 300ms ease-out, fade in bottom gradient overlay `linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.5) 100%)`, fade in shadow `rgba(63,71,77,0.15) 0px 2px 5px 0px` as secondary effect.** Mobile: 2 columns 8px gap. Desktop: 4 columns 20px gap."

* "Design a product card: white background, square image edge-to-edge, no border. Below image: brand name 12px #8a8e93, product title 14px #424242 weight 400, price block (original price line-through gray, discount % red weight 600, final price 17px weight 700 black). Tabular numerals for price."

* "Build a filter chip row: horizontally scrollable strip. Default chip: #f7f9fa background, #424242 text, 14px weight 500 with letter-spacing -0.3px (UI 라벨 트래킹), 6px 14px padding, 9999px radius. Active chip: #00A1FF background, white text. 8px gap between chips."

* "Create a primary CTA button: #00A1FF background, white text, 15px Pretendard Variable weight 600, 12px 20px padding, 8px radius. Hover: darken to #0085db. Active: scale(0.98). Focus: 2px outline #00A1FF offset 2px."

* "Design a search bar: full-width, #f7f9fa background, no border by default, #00A1FF 1px border on focus. Left magnifier icon 20px color #8a8e93. 12px 16px padding. Placeholder text 15px #8a8e93. Right clear-X icon shows when value present."

* "Build an alternating section layout: white sections alternate with #f7f9fa sections. 32px vertical padding mobile, 48-64px desktop. Max content width 1200px centered with 16px (mobile) / 24-32px (desktop) horizontal padding. Section heading at 22px Pretendard Variable weight 700 color #2f3438."

### Iteration Guide

1. **사진을 위해 UI를 비워라.** 흰색·muted gray 베이스에 텍스트는 차분히. 사진이 가장 밝아야 함.
2. **Ohou Blue (`#00A1FF`)는 단 하나의 액센트.** CTA·active state·링크 외에 큰 면적으로 쓰지 말 것.
3. **한글 가독성 우선.** line-height 1.5 이상, body 15px, **본문 letter-spacing 0**.
4. **UI 라벨에는 -0.3px 트래킹.** 탭/카드 제목/nav/버튼 라벨 모두 `-0.3px` — ohou 시그니처 트래킹.
5. **Pretendard Variable** primary, 모든 한글 fallback 명시.
6. **Radius 16px = 표준 카드.** 8px = 버튼/입력, 24px = 큰 promo, full pill = chip.
7. **카드 hover는 image scale + gradient overlay가 1순위.** shadow는 보조 fade-in. shadow만으로는 ohou 톤이 안 남.
8. **그림자는 1 layer로 충분.** `rgba(63,71,77,0.15) 0px 2px 5px`. 종이 위 부유감.
9. **카드 그리드가 IA의 중심.** masonry(콘텐츠) + 균등(상품) 두 패턴 혼용.
10. **Image placeholder는 `#EAEDEF`.** lazy-load 전 카드 fill로 — `#f7f9fa`보다 명확히 어두워야 사진과 구분됨.
11. **숫자는 tabular.** 가격·평점·인분 표시에 일관된 폭.
12. **카테고리 chip이 콘텐츠 디스커버리의 핵심.** 가로 스크롤 strip + 활성 상태.
13. **웹에 모바일 앱 패턴을 무비판 도입하지 말 것.** Bottom tab, sticky bottom CTA는 §7.6의 앱 추정 패턴이고 웹 reference로는 확정되지 않았다.

### Holicook 적용 시 매핑 힌트

* HOME(레시피 탐색) ← 오늘의집 콘텐츠 카드 그리드 패턴 (집들이 → 레시피)
* 카테고리/태그 ← 필터 chip 패턴 그대로
* RECIPE_DETAIL 사진 영역 ← masonry 콘텐츠 카드 + 인터랙션 overlay
* 좋아요/저장 인터랙션 ← 하트 + 북마크 overlay 그대로 차용
* SHOPPING_DETAIL ← 상품 카드 + 체크리스트 합성
* PANTRY ← 균등 카드 그리드
