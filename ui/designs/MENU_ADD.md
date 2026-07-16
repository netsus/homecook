# MENU_ADD

> 기준 문서: 화면정의서 v1.5.0 §7 / 요구사항기준선 v1.6.3 §1-4 / 유저flow맵 v1.3.0 §③-a
> 생성일: 2026-04-24
> Wave1 mobile 100% parity note: fixed prototype reference and `ui/designs/WAVE1_MOBILE_APP_BASELINE.md` supersede older MVP/C2 visual target notes for mobile re-porting.

## Layout Summary

- mobile baseline 375px 기준 신규 화면이다.
- narrow 320px sentinel에서도 검색 입력창, placeholder 액션, 직접등록 링크가 한 화면 안에서 읽혀야 한다.
- primary CTA는 검색 결과 선택 이후 이어지는 검색 경로 진입이며, 현재 화면에서는 상단 검색 입력창이 가장 강한 행동이다.
- scroll containment는 앱바/검색 입력 상단 구조를 유지하고, 하단 placeholder 영역은 세로 스크롤 안에서만 움직이도록 잡는다.
- anchor: 독립 신규 화면이며 기존 anchor screen을 직접 재설계하지 않는다.

## Screen Structure

1. 상단 앱바: 뒤로가기 + `식사 추가`
2. 검색 입력 영역: 레시피 이름 검색, 최근 입력 placeholder 없음
3. 검색 path 안내문: 검색해서 추가하는 흐름을 한 줄로 설명
4. 비활성 action grid:
   - 유튜브
   - 레시피북
   - 남은요리
   - 팬트리
5. 직접등록 링크: `직접 등록은 18번 슬라이스에서 열림`

## Mobile Notes

- mobile baseline 375에서는 검색 입력창과 비활성 action grid 사이 간격을 16px로 유지한다.
- narrow 320에서는 action grid 라벨이 두 줄로 내려가더라도 터치 타겟 44px은 유지한다.
- primary CTA 역할을 하는 검색 입력창은 첫 viewport 안에 완전히 보여야 한다.
- scroll containment 기준상 page-level horizontal scroll은 허용하지 않는다.
- anchor 문맥에서는 `MEAL_SCREEN -> MENU_ADD -> RECIPE_SEARCH_PICKER` 흐름만 연결하고 다른 add path는 이번 슬라이스에서 열지 않는다.

---

## Prepared Food Planner Entry Addendum

> 추가일: 2026-07-16
> 상태: Stage 1 design artifact / independent critique·authority pending

### Flow Extension

- 기존 Recipe Meal add options를 유지하고 `[완제품]` option을 공식 활성 경로로 추가한다.
- `[완제품] -> FOOD_PRODUCT_PICKER`; 검색 결과 없음이면 `FOOD_PRODUCT_CREATE`; 저장 성공은 selected picker로 복귀한다.
- entry 생성 성공은 `MEAL_SCREEN`, 사용자가 뒤로가면 기존 `PLANNER_WEEK` anchor context로 복귀한다.

### 390px / Mobile Baseline 375

```text
┌─────────────────────────────────────┐
│ ←  식사 추가                        │
├─────────────────────────────────────┤
│ [ 레시피 이름 검색             🔍 ] │
│                                     │
│ [완제품]                            │  active option, 44px target
│ 공공 데이터 또는 내가 등록한 제품   │
│                                     │
│ [레시피북] [팬트리] [남은요리] ...  │
└─────────────────────────────────────┘
```

- primary CTA hierarchy는 기존 검색 input과 명확한 add option 사이에서 경쟁하지 않게 한다. 완제품은 Recipe search 결과처럼 가장하지 않는다.
- `완제품` label에 OCR/바코드/외식/밀키트 의미를 추가하지 않는다.

### Narrow 320px / Desktop 1280px

- 320px에서 option title/description은 2행까지 허용하되 44px target과 좌우 padding을 유지한다.
- desktop은 기존 option sheet/modal family 안에서 같은 위치·순서로 제공하고 별도 full-page navigation을 새로 만들지 않는다.
- scroll containment는 option list body에만 적용하고 page-level horizontal scroll을 만들지 않는다.

### State / Return Contract

- loading/error는 MENU_ADD 전체를 막지 않고 해당 option open 요청에만 feedback.
- unauthorized면 login gate 뒤 date, column, search, selected option context를 복원한다.
- picker/create에서 back하면 MENU_ADD의 기존 위치/focus로 돌아온다.
- product create/entry success가 Recipe Meal status나 XP/activity toast를 만들지 않는다.

### Evidence

- current-state before 390/320/desktop와 after `[완제품]` option을 비교한다.
- primary CTA, keyboard focus, back/ESC, screen-reader label, `MEAL_SCREEN` return을 검증한다.
- PLANNER_WEEK anchor flow의 scroll/date/column context 보존을 authority evidence에 포함한다.
