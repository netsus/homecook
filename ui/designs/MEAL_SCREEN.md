# MEAL_SCREEN — 끼니 화면 (날짜·끼니 슬롯 식사 목록 관리)

> 기준 문서: 화면정의서 v1.5.0 §6 / 요구사항기준선 v1.6.3 §1-4 / 유저flow맵 v1.3.0 §③
> 생성일: 2026-04-18
> Wave1 mobile 100% parity note: this surface needs explicit fixed reference confirmation. Once exact-reference-ready, `ui/designs/WAVE1_MOBILE_APP_BASELINE.md` supersedes older MVP/C2 visual target notes.

---

## 레이아웃 와이어프레임

### 기본 화면 — 식사 있음 (375px)

```
┌─────────────────────────────┐  ← 375px (모바일 기준)
│ ← 뒤로      4월 18일 · 아침  │  ← 상단 앱바 (56px), sticky     ← --foreground 제목 text-xl
│                             │    뒤로가기 버튼 44×44px touch target
├─────────────────────────────┤  ← --line 구분선
│                             │
│ ┌─────────────────────────┐ │  ← 식사 카드 1                   ← --surface 배경 / radius 16px
│ │ 김치찌개                 │ │    ← --foreground text-base 700   (box-shadow 0 2px 10px rgba(0,0,0,0.08))
│ │ ● 식사 등록 완료         │ │    ← 상태 뱃지 neutral chip       ← --muted text-xs
│ │                         │ │
│ │  인분  [−] 2 [+]        │ │    ← stepper 44px touch targets  ← --brand 버튼 / radius 12px
│ │                         │ │      숫자: text-base 700 --foreground
│ │              [삭제]      │ │    ← 삭제 버튼 44px / text-sm    ← --muted 텍스트, 탭 시 확인 모달
│ └─────────────────────────┘ │
│                             │
│ ┌─────────────────────────┐ │  ← 식사 카드 2
│ │ 미역국                   │ │    ← --foreground text-base 700
│ │ ✓ 장보기 완료            │ │    ← 상태 뱃지 brand chip        ← --brand 배경 text-xs 흰색
│ │                         │ │
│ │  인분  [−] 3 [+]        │ │
│ │                         │ │
│ │              [삭제]      │ │
│ └─────────────────────────┘ │
│                             │
│ ┌─────────────────────────┐ │  ← 식사 카드 3
│ │ 시금치나물볶음            │ │    ← --foreground text-base 700
│ │ ✓✓ 요리 완료            │ │    ← 상태 뱃지 olive chip        ← --olive 배경 text-xs 흰색
│ │                         │ │
│ │  인분  [−] 2 [+]        │ │
│ │                         │ │
│ │              [삭제]      │ │
│ └─────────────────────────┘ │
│                             │
│   (추가 카드 있으면 세로 스크롤) │
│                             │
├─────────────────────────────┤  ← 하단 CTA 영역 (sticky, --panel 배경)
│  ┌─────────────────────┐   │  ← + 식사 추가 버튼               ← --brand 배경 / radius 12px
│  │    + 식사 추가       │   │    높이 52px, text-base 600 흰색
│  └─────────────────────┘   │    좌우 여백 --space-4 (16px)
│                             │  ← safe-area-inset-bottom 확보
└─────────────────────────────┘
      [홈] [플래너] [팬트리] [마이]   ← 하단 탭바 56px + safe-area-inset-bottom  ← --panel 배경
```

### 320px narrow sentinel

```
┌───────────────────────┐  ← 320px
│ ← 뒤로  4/18 · 아침   │  ← 날짜+끼니명이 좁아지면 short form으로 단축
│                       │    뒤로가기 44px 터치 타겟 유지 (잘림 없음)
├───────────────────────┤
│ ┌─────────────────┐   │
│ │ 김치찌개         │   │  ← 레시피명 1행 truncate (말줄임)
│ │ ● 식사 등록 완료 │   │  ← 뱃지 text-xs, 줄바꿈 없이 1행
│ │                 │   │
│ │ 인분 [−] 2 [+]  │   │  ← stepper 44px 유지 (CTA 잘림 없음)
│ │       [삭제]    │   │
│ └─────────────────┘   │
│                       │
│  ┌─────────────────┐  │
│  │  + 식사 추가     │  │  ← CTA 너비 좁아지지만 잘림 없음
│  └─────────────────┘  │
└───────────────────────┘
```

---

## 상태별 화면

### Loading 상태

```
┌─────────────────────────────┐
│ ← 뒤로      4월 18일 · 아침  │
├─────────────────────────────┤
│                             │
│ ┌─────────────────────────┐ │  ← 스켈레톤 카드 1            ← --line 색상 shimmer
│ │ ░░░░░░░░░░░              │ │    제목줄 180px × 16px
│ │ ░░░░░░░░                 │ │    뱃지줄 80px × 12px
│ │                          │ │
│ │  ░░░░  ░  ░░░░           │ │    stepper 영역 ghost
│ └─────────────────────────┘ │
│                             │
│ ┌─────────────────────────┐ │  ← 스켈레톤 카드 2 (동일 구조)
│ │ ░░░░░░░░░░               │ │
│ │ ░░░░░                    │ │
│ │  ░░░░  ░  ░░░░           │ │
│ └─────────────────────────┘ │
│                             │
├─────────────────────────────┤
│  ┌─────────────────────┐   │  ← CTA는 loading 중에도 노출 유지
│  │    + 식사 추가       │   │
│  └─────────────────────┘   │
└─────────────────────────────┘
```

### Empty 상태 — 등록된 식사 없음

```
┌─────────────────────────────┐
│ ← 뒤로      4월 18일 · 아침  │
├─────────────────────────────┤
│                             │
│                             │
│    이 끼니에 등록된           │  ← --muted text-base 중앙 정렬
│    식사가 없어요              │
│                             │
│  ┌─────────────────────┐   │  ← Empty 상태 강조 CTA          ← --brand 배경 / radius 12px
│  │    + 식사 추가       │   │    (하단 고정이 아닌 본문 내 강조 위치)
│  └─────────────────────┘   │
│                             │
│                             │
│                             │
├─────────────────────────────┤
│  ┌─────────────────────┐   │  ← 하단 고정 CTA도 함께 유지
│  │    + 식사 추가       │   │
│  └─────────────────────┘   │
└─────────────────────────────┘
```

### Error 상태

```
┌─────────────────────────────┐
│ ← 뒤로      4월 18일 · 아침  │
├─────────────────────────────┤
│                             │
│                             │
│   식사 목록을 불러오지        │  ← --muted text-base 중앙 정렬
│   못했어요                   │
│                             │
│  ┌───────────────────┐     │  ← [다시 시도] 버튼              ← --brand text 버튼 (outlined)
│  │    다시 시도       │     │    radius 12px, 44px 높이
│  └───────────────────┘     │
│                             │
├─────────────────────────────┤
│  ┌─────────────────────┐   │
│  │    + 식사 추가       │   │  ← 에러 상태에서도 CTA 유지
│  └─────────────────────┘   │
└─────────────────────────────┘
```

---

## 컴포넌트 상세

### 상단 앱바 (AppBar)

- **구조**: 뒤로가기(44×44px) + 제목(날짜 · 끼니명) + 우측 여백
- **제목 포맷**: `N월 D일 · 끼니명` (예: `4월 18일 · 아침`)
- **320px 대응**: 화면 폭이 좁아지면 `M/D · 끼니명` short form 사용 (예: `4/18 · 아침`), 단 끼니명은 생략하지 않는다
- **sticky**: 세로 스크롤 중에도 상단 고정
- **Loading**: 제목은 이미 URL 파라미터 또는 진입 context에서 알고 있으므로 즉시 표시 (스켈레톤 불필요)
- **토큰**: `--foreground` text-xl 800, 배경 `--background`, border-bottom `--line`

### 식사 카드 (MealCard)

- **배경**: `--surface` / `box-shadow: 0 2px 10px rgba(0,0,0,0.08)` / `border-radius: 16px`
- **수평 여백**: 컨테이너 패딩 `--space-4` (16px)
- **내부 패딩**: `--space-4` (16px)
- **레시피명**: `--foreground` text-base 700, 1행 truncate (말줄임)
- **전체 카드 탭**: RECIPE_DETAIL로 이동 (상세 조회 진입점)
  - 단 stepper 버튼, 삭제 버튼 영역은 별도 tap target이므로 카드 전체 탭 대상에서 제외
- **기본 상태**: 레시피명 + 상태 뱃지 + 인분 stepper + 삭제 버튼

#### 상태 뱃지 (StatusBadge)

| status | 사용자 표시 | 배경 색상 | 텍스트 |
|--------|------------|----------|--------|
| `registered` | 식사 등록 완료 | `--muted` (neutral chip) | `--surface` text-xs |
| `shopping_done` | 장보기 완료 | `--brand` | 흰색 text-xs |
| `cook_done` | 요리 완료 | `--olive` | 흰색 text-xs |

- chip border-radius: `9999px`
- 내부 패딩: `--space-2` (8px) 좌우

#### 인분 Stepper

- **구조**: `[−]` 버튼 + 현재 인분 숫자 + `[+]` 버튼
- **버튼**: 각 44×44px touch target, `--brand` 색상, `border-radius: 12px`
- **숫자**: `--foreground` text-base 700
- **단위 라벨**: `인분` text-sm `--muted` (숫자 오른쪽에 붙여서 읽힘)
- **최솟값**: 1인분 (0 이하로 감소 불가, `−` 버튼 비활성 처리)
- **최댓값**: 정의 없음 (합리적인 상한 구현 판단은 개발 단계)
- **인분 조절 확인 모달**: `shopping_done` 또는 `cook_done` 상태인 식사에서 stepper 조작 시 발동

#### 삭제 버튼

- **위치**: 카드 내부 우하단
- **크기**: 44×44px touch target (텍스트 버튼, text-sm `--muted`)
- **탭 시**: 삭제 확인 모달 즉시 표시 — 모달 없이 즉시 삭제 금지

### 인분 조절 확인 모달 (ServingChangeWarningModal)

- **발동 조건**: `shopping_done` 또는 `cook_done` 상태 식사의 stepper 조작 시
- **형태**: 바텀시트 / center modal (설계 단계 결정 — §6 화면정의서는 "확인 모달"로만 명시)
  - 모바일 UX 규칙 §6 기준: 짧은 확인은 center modal보다 bottom sheet 우선 검토
  - 여기서는 단순 확인 2버튼이므로 **center modal** 채택 (bottom sheet는 내용이 긴 선택형에 적합)
- **헤더**: eyebrow 없음 / icon-only close (화면정의서 v1.5.0 modal system 기준)
- **본문 copy**: `상태가 진행된 식사입니다. 인분 변경 시 다시 장보기/요리 흐름이 필요할 수 있어요.`
- **버튼**: `[변경하기]` (primary, `--brand`) / `[취소]` (secondary, `--muted`)
- **MVP 처리**: 변경 허용 + 상태는 그대로 유지 (상태 강제 초기화 없음)
- **border-radius**: `20px` (modal/바텀시트 규칙)
- **배경**: `--panel`

### 삭제 확인 모달 (DeleteConfirmModal)

- **발동 조건**: 식사 카드의 [삭제] 버튼 탭 시
- **형태**: center modal
- **헤더**: eyebrow 없음 / icon-only close
- **본문 copy**: `이 식사를 삭제하시겠어요?`
- **버튼**: `[삭제]` (destructive, `--brand-deep` 또는 위험 강조색) / `[취소]` (secondary)
- **border-radius**: `20px`
- **배경**: `--panel`

### Primary CTA — 하단 고정 식사 추가 버튼

> **[+ 식사 추가]는 이 화면의 primary CTA다.** 인분 조절 stepper와 삭제 버튼은 카드 내 secondary action이며, primary CTA보다 시각 위계가 낮아야 한다. primary CTA는 `--brand` 색상으로 가장 강한 시각 무게를 가지고, 화면 하단에 sticky 고정되어 항상 접근 가능해야 한다(mobile-ux-rules.md Rule 3 준수).

- **텍스트**: `+ 식사 추가`
- **배경**: `--brand` / `border-radius: 12px` / 높이 52px
- **텍스트**: text-base 600 흰색
- **위치**: sticky bottom, `--panel` 배경 영역 내 / 탭바 위
- **좌우 여백**: `--space-4` (16px) — 전체 너비 stretch (컨테이너 너비 - 32px)
- **탭 시**: MENU_ADD 화면으로 이동
- **Empty 상태**: 하단 고정 primary CTA 유지 + 본문 내 강조 CTA 추가
- **시각 위계 원칙**: 식사 카드 내 stepper(+/-) 및 [삭제] 버튼은 `--muted` 또는 `--brand` 소형 요소로 처리하여 primary CTA인 [+ 식사 추가]와 시각적 혼동이 없도록 한다.

### 409 오류 인라인 표시

- **발동 조건**: 인분 변경 또는 삭제 API 요청에서 409 Conflict 응답
- **표시 위치**: 해당 식사 카드 하단에 인라인 텍스트로 표시 (토스트 대신)
- **copy**: `변경 중 충돌이 발생했어요. 새로고침 후 다시 시도해 주세요.`
- **색상**: `--brand-deep` (에러 강조) text-sm

---

## 스크롤 구조

```
┌─────────────────────────────────────────────────────┐
│  [sticky] 상단 앱바 (56px)                           │  ← 세로 스크롤 중 고정
├─────────────────────────────────────────────────────┤
│                                                     │
│  [scroll container] 식사 카드 목록                   │  ← 세로 스크롤만 (가로 스크롤 없음)
│    - 카드 간격: --space-4 (16px)                     │    overflow-y: auto
│    - 하단 패딩: 하단 CTA 높이(52px) + 탭바(56px)      │    overflow-x: hidden
│      + safe-area + --space-4 여유 확보               │
│                                                     │
├─────────────────────────────────────────────────────┤
│  [sticky] 하단 CTA 영역                              │  ← 세로 스크롤 중 고정
│    + 식사 추가 버튼 (52px)                           │
│    safe-area-inset-bottom 확보                       │
├─────────────────────────────────────────────────────┤
│  [sticky] 하단 탭바 (56px + safe-area)               │  ← 탭바는 이 화면에서도 유지
└─────────────────────────────────────────────────────┘
```

- **가로 스크롤 전면 금지**: page-level 및 카드 내부 모두 가로 스크롤 없음
- **세로 스크롤 containment**: 식사 카드 목록 영역만 스크롤 — 앱바와 하단 CTA는 고정

---

## 인터랙션 노트

| 액션 | 트리거 | 결과 | 로그인 필요 |
|------|--------|------|------------|
| 화면 진입 | PLANNER_WEEK 끼니 셀 탭 | 해당 날짜·끼니 식사 목록 로드 | Y (비로그인 시 로그인 게이트 모달) |
| 식사 카드 탭 | 카드 본문 영역 탭 (stepper/삭제 버튼 제외) | RECIPE_DETAIL 진입 (조회 목적) | N (상세 조회는 비로그인 가능) |
| 인분 감소 [−] | stepper 버튼 탭 | `registered`: 즉시 API 호출 / `shopping_done`·`cook_done`: 확인 모달 표시 | Y |
| 인분 증가 [+] | stepper 버튼 탭 | `registered`: 즉시 API 호출 / `shopping_done`·`cook_done`: 확인 모달 표시 | Y |
| 인분 변경 확인 | 확인 모달 [변경하기] 탭 | API 호출 후 식사 카드 인분 즉시 업데이트 (상태 유지) | Y |
| 인분 변경 취소 | 확인 모달 [취소] 탭 | 모달 닫힘, 인분 원래 값 복원 | Y |
| 식사 삭제 시도 | [삭제] 버튼 탭 | 삭제 확인 모달 표시 | Y |
| 삭제 확인 | 삭제 모달 [삭제] 탭 | API 호출 → 성공 시 카드 목록에서 즉시 제거 | Y |
| 삭제 취소 | 삭제 모달 [취소] 탭 | 모달 닫힘, 변경 없음 | Y |
| 식사 추가 | [+ 식사 추가] 버튼 탭 | MENU_ADD 화면 이동 | Y |
| 뒤로가기 | 앱바 [← 뒤로] 탭 | PLANNER_WEEK 복귀 | Y |
| 다시 시도 | Error 상태 [다시 시도] 탭 | 식사 목록 재요청 | Y |

### 로그인 게이트 동작

- MEAL_SCREEN 자체가 로그인 필요 화면이다.
- 비로그인 상태에서 진입 시도: 로그인 게이트 모달 표시 → [로그인] → LOGIN 화면 → return-to-action으로 MEAL_SCREEN 복귀
- MEAL_SCREEN 안에서 개별 액션(인분 조절, 삭제)이 토큰 만료 등으로 인증 실패하면 동일 패턴으로 재처리

### MENU_ADD 복귀 동작

- MENU_ADD에서 식사 추가 완료 후 MEAL_SCREEN으로 복귀 시 식사 목록을 자동 갱신한다.

---

## 화면 정의서 §6 항목 매핑

| 정의서 항목 | 구현 여부 | 비고 |
|------------|----------|------|
| 헤더: 날짜 + 끼니명 | ✅ | `N월 D일 · 끼니명` 포맷 |
| 식사 리스트 (카드) | ✅ | 카드 단위 구성 |
| 레시피명 | ✅ | 1행 truncate |
| 계획 인분 | ✅ | stepper 내 숫자 표시 |
| 상태 뱃지 (`registered` / `shopping_done` / `cook_done`) | ✅ | 3종 chip 색상 분리 |
| [인분 조절] 버튼 | ✅ | stepper (−/+) 방식 |
| [삭제] 버튼 | ✅ | 확인 모달 필수 연결 |
| 하단 [식사 추가] → MENU_ADD | ✅ | sticky 하단 CTA |
| 인분 조절 확인 모달 (shopping_done / cook_done) | ✅ | center modal 채택 |
| 삭제 확인 모달 | ✅ | center modal 채택 |
| 409 오류 인라인 표시 | ✅ | 카드 하단 인라인 |
| loading / empty / error 상태 | ✅ | 3종 모두 설계 |
| 개별 [요리하기] 버튼 없음 (정책) | ✅ | 설계에서 제외 |
| 식사 카드 → RECIPE_DETAIL 탭 진입 | ✅ | 카드 본문 탭으로 처리 |
| 전체 페이지 가로 스크롤 금지 | ✅ | overflow-x: hidden |
| 헤더·하단 CTA 고정, 목록만 스크롤 | ✅ | sticky 구조 명시 |
| 터치 타겟 최소 44×44px | ✅ | stepper, 삭제, 뒤로가기 모두 적용 |

---

## 디자인 결정 사항

### D1. 인분 조절 확인 모달 — center modal vs bottom sheet

화면정의서 §6은 "확인 모달"로만 명시. 내용이 짧은 2버튼 확인이므로 center modal 채택.
화면정의서 v1.5.0 modal system 기준(`eyebrow 없음 / icon-only close / --panel 배경`)을 따른다.
bottom sheet는 선택지가 여러 개이거나 내용이 긴 경우에 적합 (mobile-ux-rules §6 참조).

### D2. 삭제 확인 모달 — 동일 패턴

[삭제] 모달도 같은 center modal 패턴 적용. destructive 액션이므로 버튼 색상을 `--brand-deep`으로 구분.

### D3. 식사 카드 탭 영역과 stepper/삭제 버튼 탭 영역 분리

전체 카드 탭 = RECIPE_DETAIL 진입 (조회용)이고,
stepper 버튼과 삭제 버튼은 별도 탭 타겟이므로 이벤트 전파 중단(stopPropagation) 처리가 필요하다.
이 분리 정책은 화면정의서 §6 "식사 카드는 상세 조회 진입점"과 "인분 조절 가능" 두 항목을 동시에 만족시킨다.

### D4. 하단 탭바 유지 여부

MEAL_SCREEN은 PLANNER_WEEK에서 push navigation으로 진입하는 서브 화면이다.
화면정의서 §0-1에서 하단 탭 4개는 전역 공통 구조로 정의되어 있다.
UX 일관성을 위해 MEAL_SCREEN에서도 하단 탭바를 유지한다.

### D5. 인분 stepper 최솟값 1인분 처리

0 이하 감소는 사용자 의미가 없으므로 `−` 버튼을 disabled 처리. 화면정의서에 명시 없으나 합리적인 UX 결정.

### D6. 409 오류 처리 위치

API 문서 v1.2.2에서 409 오류 가능성이 명시되어 있으므로, 토스트 대신 해당 카드 하단 인라인 표시 방식을 채택. 여러 카드에서 동시에 발생할 수 있으므로 global toast 단독 처리보다 카드 인라인이 더 명확하다.

### D7. anchor screen 관련 리스크 메모

MEAL_SCREEN은 anchor screen(`PLANNER_WEEK`)에서 직접 진입하는 화면이다.
anchor-screens.md 기준으로 MEAL_SCREEN 자체는 anchor screen이 아니지만,
PLANNER_WEEK의 slot row 탭 → MEAL_SCREEN 플로우는 `PLANNER_WEEK`의 핵심 CTA에 연결된 진입점이다.
이 화면의 UX 품질이 낮으면 PLANNER_WEEK 전체의 완성도에 영향을 준다.
Stage 4 authority review 시 PLANNER_WEEK → MEAL_SCREEN 전환 흐름을 함께 검토할 것.

---

## design-critic 검토 필요 항목

- [ ] 식사 카드 내 정보 밀도: 레시피명 + 상태 뱃지 + stepper + 삭제가 카드 한 장 안에서 너무 붐비지 않는지 실제 렌더링 확인
- [ ] 320px narrow에서 stepper `[−] N인분 [+]` 3요소가 한 행에 안정적으로 표시되는지 확인
- [ ] 인분 조절 확인 모달 copy 길이: "상태가 진행된 식사입니다. 인분 변경 시 다시 장보기/요리 흐름이 필요할 수 있어요." — 모바일 모달 폭에서 읽기 불편하지 않은지 확인
- [ ] 하단 CTA + 탭바가 겹쳐 콘텐츠를 가리는 bottom safe area 처리 — 특히 iPhone 하단 홈 인디케이터 영역
- [ ] 식사 카드가 1개일 때 + 식사 추가 CTA의 시각 위계 (CTA가 너무 아래로 내려가 주목성이 떨어지지 않는지)
- [ ] loading 스켈레톤 카드 높이가 실제 카드 높이와 맞는지 (CLS 방지)
- [ ] 삭제 버튼과 stepper의 레이아웃 우선순위 — 좁은 폭에서 삭제 버튼 탭 영역이 stepper와 겹치지 않는지

---

## Prepared Food Planner Entry Addendum

> 추가일: 2026-07-16
> 상태: Stage 1 design artifact / independent critique·authority pending

### Successor Contract

- 위 역사적 Recipe Meal 설계 중 `개별 [요리하기] 없음` 문구는 공식 v1.5.26의 Recipe Meal 단축 경로가 이미 supersede했다. 이 addendum은 ProductPlannerEntry에만 요리 action/status가 없음을 잠근다.
- `GET /meals.items[]` recipe-only shape는 유지하고 additive `product_entries[]`를 UI adapter에서 중복 없이 합친다.
- Product entry에는 status/recipe/shopping/cooking/leftover field/action이 없다.
- product name/brand/version/relations/nutrition은 entry pin을 authority로 사용한다.

### Mixed Entry Layout — 390px / Mobile Baseline 375

```text
┌─────────────────────────────────────┐
│ ←  3월 1일 · 아침                   │
├─────────────────────────────────────┤
│ Recipe Meal                         │
│ 김치찌개                  [등록]     │
│ [−] 2인분 [+]       [삭제] [요리...] │
├─────────────────────────────────────┤
│ 완제품                              │ type label
│ 플레인 요거트 · 브랜드              │
│ 1회 · 예상 열량 105 kcal            │ pinned quantity 기준
│ [수량 변경]                  [삭제]  │
├─────────────────────────────────────┤
│ [+ 식사 추가]                       │ primary CTA
└─────────────────────────────────────┘
```

- Recipe Meal과 ProductPlannerEntry는 card chrome family를 공유해도 type label과 actions가 다르다.
- product card에 status chip 빈 공간을 남기지 않는다.
- product quantity는 recipe `인분` stepper와 다른 unit을 가질 수 있어 `[수량 변경]`에서 picker quantity surface를 재사용한다.
- product card 탭은 Recipe Detail로 가지 않는다. 공식 별도 product detail route가 없으므로 card 자체는 read-only summary이고 명시적 수량/삭제 action만 제공한다.

### Product Card Expected Energy

- 표시 authority는 entry가 pin한 `product_nutrition_version_id`와 entry `quantity`로 서버가 산출해 `GET /meals.product_entries[].nutrition.values.energy_kcal`에 담은 값이다. current product/version을 다시 조회하거나 이름·브랜드·밀도로 재계산하지 않는다.
- `status=complete`이고 `amount`가 non-null이면 `예상 열량 X kcal`다. 명시적으로 관측된 complete `amount=0`만 `예상 열량 0 kcal`로 표시한다.
- `status=partial`이고 `known_amount`가 non-null이면 `예상 열량 최소 X kcal`다. 일반 총량처럼 표시하지 않는다.
- unavailable 또는 `amount/known_amount`가 모두 null이면 `예상 열량 정보 준비 중`이다. missing/null/unavailable을 `0 kcal`로 바꾸지 않는다.
- quantity PATCH 뒤에는 같은 pinned version으로 산출된 새 entry nutrition response만 반영한다. current version이 바뀌어도 card 값은 조용히 repin되지 않는다.

### Narrow 320px

- product name/brand metadata와 action row를 분리한다.
- `[수량 변경]`, `[삭제]`는 각각 44px target이며 한 행이 좁으면 vertical action layout을 사용한다.
- sticky `[식사 추가]` CTA, bottom tab, safe area, keyboard가 겹치지 않는다.
- Recipe Meal action이 product card에 시각적으로 붙어 보이지 않도록 card boundary/spacing을 유지한다.

### Desktop 1280px

- 기존 MEAL_SCREEN content column 안에서 mixed entries를 동일 순서로 보여준다.
- product action은 hover-only가 아니라 keyboard/touch 모두 접근 가능하다.
- quantity edit nested modal은 background focus/scroll을 잠그고 close 후 해당 product card로 focus를 복원한다.

### Required States

- loading: recipe list는 유지하고 additive product list만 skeleton 가능.
- empty: recipe/product 양쪽이 모두 없을 때만 전체 empty.
- error: product read/PATCH/delete 실패는 product 영역 inline retry/error, recipe card 유지.
- read-only: pin된 과거/soft-deleted product는 snapshot으로 계속 읽고 catalog edit affordance 없음.
- unauthorized: login 뒤 plan date/column/entry/quantity context 복원.
- partial: 가능한 nutrition은 `최소` 의미; unavailable: `정보 준비 중`; missing은 0이 아님.
- basis mismatch: quantity nested surface에 머물고 card/list context를 보존.

### Delete / Pin Stability

- product delete confirmation은 Recipe Meal delete와 같은 modal family를 쓰되 `완제품 계획에서 삭제`라고 type을 명시한다.
- 성공 시 product entry만 list에서 제거한다. catalog/Recipe Meal/version UI를 바꾸지 않는다.
- current product version/metadata 변경이나 soft-delete 후에도 기존 card는 pinned name/brand/version/quantity를 유지한다.

### Primary CTA / Scroll Containment / Anchor Flow

- `[식사 추가]` primary CTA는 기존 위치와 hierarchy를 유지한다.
- mixed entry list만 세로 scroll하며 page-level horizontal overflow는 금지한다.
- `PLANNER_WEEK` anchor로 돌아갈 때 day/column scroll context를 복원한다.
- Stage 4 evidence: mixed/only-product/old-pin/deleted-existing/loading/error/partial/unavailable at 390/320/desktop.

---

## Planner Nutrition Summary Addendum

> 추가일: 2026-07-17
> workpack: `planner-nutrition-summary`
> 상태: Stage 1 temporary design contract / independent critique passed / implementation·authority pending

### Column Aggregate Boundary

- `start_date=end_date=현재 날짜`의 공식 `GET /planner/nutrition` 응답에서 현재 `column_id`와 일치하는 `days[].columns[]` nutrition만 사용한다.
- 새 column filter query나 entry별 recipe nutrition field를 추가하지 않는다.
- 기존 Recipe Meal/ProductPlannerEntry cards와 actions는 그대로 두고, 끼니 전체 `계획 영양` summary를 목록 위에 compact section으로 추가한다.
- aggregate `incomplete_entry_count`는 combined `N개 항목 확인 필요`다. API에 없는 partial count/unavailable count 두 field를 요구하지 않는다.

### 390px / Mobile Baseline 375 Compatibility

```text
┌─────────────────────────────────────┐
│ ←  7월 17일 · 아침                  │
├─────────────────────────────────────┤
│ 계획 영양 · 예상 포함               │
│ 열량       최소 600 kcal            │
│ 탄수화물   최소 75 g                │
│ 단백질     최소 30 g                │
│ 지방       최소 20 g                │
│ 나트륨     정보 준비 중             │
│ 1개 항목 확인 필요 · [안내 보기]    │
├─────────────────────────────────────┤
│ 기존 Recipe Meal card               │
│ 기존 ProductPlannerEntry card       │
├─────────────────────────────────────┤
│ [+ 식사 추가]                       │
└─────────────────────────────────────┘
```

- 영양 section은 entry card와 같은 surface family를 쓰되 primary CTA보다 시각적 무게가 낮다.
- 핵심 5종은 label/value 2열 compact list다. 5개의 중첩 card나 horizontal carousel로 만들지 않는다.
- `complete`는 총량, `partial`은 `최소`, `unavailable`은 `정보 준비 중`이다. missing/null을 `0`이나 빈 대시만으로 숨기지 않는다.
- observed `complete/amount=0`만 `0`으로 표시한다.

### Quality / Warning Presentation

| API quality | 사용자 의미 |
| --- | --- |
| `direct` | `직접 기준` |
| `estimated` | `예상 포함` |
| `mixed` | `직접·예상 혼합` |
| `null` | `정보 준비 중` |

- raw enum이나 개발용 `ready` 문자열을 그대로 노출하지 않는다.
- aggregate `warnings[]`는 승인된 presentation mapping으로 `계량 환산 포함`, `일부 재료/영양 정보 없음` 같은 안내를 제공한다. raw provider data, 내부 path, secret, 다른 사용자 ID를 표시하지 않는다.
- warning 상세는 inline disclosure 또는 짧은 sheet를 사용할 수 있으나 새로운 full page/endpoint를 만들지 않는다.

### Narrow 320px

- label/value 2열을 유지하되 긴 `정보 준비 중`이 잘리면 해당 nutrient row만 2행을 허용한다.
- 핵심 5종 section, entry action, sticky `[식사 추가]`, bottom tab, safe area가 겹치지 않는다.
- touch target은 44px이고 warning disclosure는 keyboard/ESC/focus restoration을 지원한다.
- page-level 및 nutrition section 내부 horizontal scroll을 만들지 않는다.

### Desktop 1280px

- 기존 MEAL_SCREEN content column 안에서 summary와 entry list의 읽기 순서를 유지한다.
- summary를 별도 dashboard sidebar나 목표 chart로 확장하지 않는다.
- keyboard focus 순서는 뒤로가기 → summary disclosure/retry → entry actions → primary CTA다.

### Soft Loading / Error / Race

- nutrition loading은 summary skeleton만 표시하고 기존 entry cards와 `[식사 추가]`를 유지한다.
- nutrition error는 summary section inline retry로 제한하고 Recipe Meal/ProductPlannerEntry read/mutation을 막지 않는다.
- 날짜/column 변경 또는 retry 때 request key를 비교해 늦은 이전 응답이 현재 끼니 summary를 덮지 않는다.
- 해당 column summary가 없으면 false zero를 만들지 않고 `계획 영양 정보 준비 중` 상태를 사용한다.

### Stage 4 Evidence Plan

- before/after 각각 `390`, `320`, `desktop 1280`을 `ui/designs/evidence/planner-nutrition-summary/{before,after}/`에 저장한다.
- complete, partial/minimum, unavailable, mixed quality, combined incomplete count, warning disclosure, loading, error/retry, stale column response를 포함한다.
- 기존 entry list, Recipe Meal/product 구분, sticky primary CTA, safe area, anchor return, focus, page overflow를 함께 판정한다.
- 최종 authority report 전까지 이 addendum은 `temporary`이며 구현 pass나 `confirmed`를 의미하지 않는다.
