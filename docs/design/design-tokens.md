# 집밥 디자인 토큰

> 확정일: 2026-03-20
> 기준 방향: C2 — 명랑한 주방 (Bright Kitchen)
> 적용 범위: Slice 02 Stage 4부터 모든 슬라이스
> 2026-05-11 Wave1 mobile update: Wave1 모바일 100% prototype parity surface의 목표값은 `ui/designs/WAVE1_MOBILE_APP_BASELINE.md`가 우선한다.
> 2026-05-12 Phase 2 update: app/web 책임 분리는 `ui/designs/WAVE1_APP_WEB_RESPONSIBILITY_MATRIX.md`를 따르고, 기본 구현 경로는 mobile-scoped Wave1 token layer다.
> 2026-05-19 App palette/shape update: 앱 화면은 `app/globals.css`의 `--brand-primary`, `--radius-*`, `--control-height-*` 계열을 단일 조절 지점으로 사용한다. 웹 `--web-*` 토큰은 변경하지 않는다.

---

## Wave1 Mobile 100% Parity Override

`docs/design/design-tokens.md`의 C2 / h6 / h7 값은 기존 MVP와 web/legacy surface의 현재 구현 이력을 설명한다.

하지만 Wave1 mobile 100% re-porting에서는 이 값들이 목표 디자인 기준이 아니다. `exact-reference-ready` 모바일 surface는 fixed prototype reference와 `ui/designs/WAVE1_MOBILE_APP_BASELINE.md`의 token/type/material 값을 따른다.

### Wave1 Mobile Target Tokens

This table is a short operational summary. The complete authoritative Wave1 mobile token list is `ui/designs/WAVE1_MOBILE_APP_BASELINE.md`.

| 역할 | 목표값 |
|------|--------|
| App background | `#FFFFFF` |
| Foreground / ink | `#212529` |
| Brand | `#0F766E` |
| Brand deep | `#0B5F59` |
| Brand soft | `#E7F4F2` |
| Brand border | `#CFE5E1` |
| Accent teal | `var(--brand)` |
| Danger / like | `#D83A3A` |
| Text 2 | `#495057` |
| Text 3 | `#868E96` |
| Text 4 | `#ADB5BD` |
| Border | `#DEE2E6` |
| Surface | `#FFFFFF` |
| Surface fill | `#F8F9FA` |
| Surface subtle | `#F1F3F5` |
| UI font | `"Avenir Next", "Pretendard", "Apple SD Gothic Neo", "Segoe UI", sans-serif` |
| Brand font | Same as UI font for product UI consistency |

### Runtime Token Rule

Do not change global runtime tokens blindly if that would redesign web or unrelated legacy surfaces.

Instead:

- record Wave1 mobile target values here and in `ui/designs/WAVE1_MOBILE_APP_BASELINE.md`;
- use `ui/designs/WAVE1_APP_WEB_RESPONSIBILITY_MATRIX.md` to decide whether a value can become global or must be scoped to mobile/Wave1 surfaces;
- during Phase 4/5 implementation, exact-reference-ready mobile surfaces must render the prototype values even if web/legacy surfaces still use old values;
- if a prototype font or asset is required but not available in production, block completion until the font/asset is packaged or the prototype reference is refrozen.

Do not use the older coral/cream token values as approved divergences for Wave1 mobile 100% completion.

### Wave1 Mobile Token Scoping Strategy

Phase 1 intentionally documented the target values without rewriting all runtime globals.

Phase 2 chose the default implementation path below before Phase 4/5 code work:

| Path | Phase 2 decision | Risk |
|------|-------------|------|
| mobile-scoped token layer, for example app shell or data attribute scope | default path for Wave1 mobile exact-reference-ready surfaces | requires careful component boundary mapping |
| per-component exact values from shared prototype tokens | allowed only for isolated surfaces or sheets, and must stay traceable to `WAVE1_MOBILE_APP_BASELINE.md` | can duplicate values if not centralized after porting |
| global token replacement | deferred until the web redesign branch owns the change or a later matrix update proves no web impact | high risk of accidental web redesign |

Therefore `app/globals.css` mobile runtime values may use the app-only brand palette when web ownership is preserved. Desktop web colors remain isolated in the `--web-*` tokens under the 1024px media block.

### 2026-05-19 App Runtime Brand Palette

앱 화면의 브랜드 느낌은 아래 토큰만 우선 조절한다. 화면 내부에서는 직접 hex 색상을 추가하지 않고 역할 토큰을 사용한다.

| 변수명 | 값 | 용도 |
|--------|---|------|
| `--brand-primary` | `#0F766E` | 앱 기본 브랜드색, CTA, 선택 상태 |
| `--brand-primary-hover` | `#0B5F59` | pressed / hover / 진한 강조 |
| `--brand-primary-soft` | `#E7F4F2` | 활성 칩, 안내 배경, 연한 브랜드 면 |
| `--brand-primary-border` | `#CFE5E1` | 브랜드 계열 연한 테두리 |
| `--brand-primary-shadow-color` | `rgba(15, 118, 110, 0.18)` | 브랜드 그림자 색 |

### 2026-05-19 App Runtime Shape Tokens

앱 화면의 둥글기와 주요 컨트롤 크기는 아래 토큰에서 우선 조절한다. 웹 `--web-*` 형태 토큰은 별도 유지한다.

| 변수명 | 값 | 용도 |
|--------|---|------|
| `--radius-control` | `8px` | 버튼, 입력창, 작은 액션 |
| `--radius-chip` | `10px` | 필터 칩, 작은 pill형 라벨 |
| `--radius-card` | `10px` | 카드, 리스트 아이템 |
| `--radius-panel` | `14px` | 큰 패널, 프로필 아이콘 박스 |
| `--radius-sheet` | `18px` | 바텀시트, 모달 표면 |
| `--control-height-md` | `44px` | 기본 터치 컨트롤 |
| `--control-height-lg` | `48px` | 주요 CTA |
| `--control-height-xl` | `52px` | 큰 CTA, 앱 헤더 높이 |

---

## 색상 토큰

| 변수명 | 값 | 용도 |
|--------|---|------|
| `--background` | `#fff9f2` | 앱 전체 배경 (따뜻한 크림) |
| `--foreground` | `#1a1a2e` | 기본 텍스트 (진한 네이비) |
| `--brand` | `#ED7470` | 주요 CTA, 활성 탭, 배지 (2026-04-27 사용자 승인, 이전 `#FF6C3C`) |
| `--brand-deep` | `#C84C48` | hover, active, pressed 상태 (2026-04-27 사용자 승인, 이전 `#E05020`) |
| `--olive` | `#1f6b52` | 태그, 재료 필터 칩, 서브 액션 |
| `--surface` | `#ffffff` | 카드, 입력 필드 배경 |
| `--panel` | `rgba(255,252,248,0.92)` | 바텀시트, 모달, 탭바 (반투명) |
| `--line` | `rgba(0,0,0,0.07)` | 구분선, 카드 테두리 |
| `--muted` | `#5f6470` | 보조 텍스트, 플레이스홀더 |

### 요리모드 조리방법 색상 (화면정의서 v1.2 기준)

| 조리방법 | 색상 |
|---------|------|
| 볶기 / 볶아주기 | `#FF8C42` |
| 끓이기 / 국물 | `#E8453C` |
| 굽기 / 오븐 / 구이 | `#8B5E3C` |
| 찌기 / 스팀 | `#4A90D9` |
| 튀기기 | `#F5C518` |
| 데치기 | `#7BC67E` |
| 무치기 / 버무리기 | `#2ea67a` |
| 섞기 / 준비 / 기타 | `#AAAAAA` |

### 배민 스타일 Additive 토큰 (2026-04-27)

> 기준: `baemin-style-tokens-additive` Stage 2 + `baemin-style-token-values` Stage 4.
> 이 섹션은 후속 배민 스타일 전환 슬라이스에서 사용할 추가 토큰을 기록한다.
> `--brand-soft`는 2026-05-19 앱 팔레트 정리로 `--brand-primary-soft`를 따른다. 이전 C2/additive 값은 `#FDEBEA`였다.
> 나머지 additive 토큰(`--surface-fill/subtle`, `--text-2/3/4`, `--shadow-1/2/3`, `--radius-*`)은 현재 값을 유지한다 (사용자 승인 "keep current").

| 변수명 | 값 | 역할 |
|--------|---|------|
| `--brand-soft` | `#E7F4F2` | 활성 칩 배경, 상태 pill 배경 같은 브랜드 tint. 실제 값은 `--brand-primary-soft`에서 조절한다. |
| `--surface-fill` | `#F8F9FA` | 입력 필드, 비활성 칩 배경 |
| `--surface-subtle` | `#F1F3F5` | 섹션 배경, chip hover 배경 |
| `--text-2` | `#495057` | 부제, 설명 텍스트 |
| `--text-3` | `#868E96` | 보조 메타 정보 |
| `--text-4` | `#ADB5BD` | disabled 텍스트 |
| `--shadow-1` | `0 1px 3px rgba(0, 0, 0, 0.04)` | 작은 카드/썸네일의 약한 그림자 |
| `--shadow-2` | `0 2px 8px rgba(0, 0, 0, 0.08)` | 카드, 시트, 드롭다운의 기본 그림자 |
| `--shadow-3` | `0 8px 24px rgba(0, 0, 0, 0.16)` | 오버레이, 다이얼로그의 강한 그림자 |
| `--radius-sm` | `8px` | 버튼, 작은 썸네일, 입력 필드 |
| `--radius-md` | `12px` | 카드, 인셋 패널 |
| `--radius-lg` | `16px` | 큰 카드, 시트 표면 |
| `--radius-xl` | `20px` | 바텀시트 상단, 검색바형 surface |
| `--radius-full` | `9999px` | pill, avatar, 원형 버튼 |

---

## 타이포그래피

| 변수명 | 값 | 용도 |
|--------|---|------|
| `--font-body` | `"Avenir Next", "Pretendard", "Apple SD Gothic Neo", "Segoe UI", sans-serif` | 본문 전체, 레시피 제목 포함 모든 텍스트 |
| `--font-display` | `"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif` | 미사용 (향후 필요 시 재검토) |

> **결정**: 레시피 제목 포함 전체 텍스트에 sans-serif 단독 사용.
> `--font-display`는 코드에서 제거하거나 주석 처리.

### 타이포 스케일

| 단계 | rem | px | weight | 용도 |
|------|-----|----|--------|------|
| `text-xs` | 0.6875 | 11px | 600–700 | 배지, 태그, 통계 라벨 |
| `text-sm` | 0.8125 | 13px | 400–600 | 카드 메타, 보조 정보 |
| `text-base` | 1.0 | 16px | 400–600 | 본문, 버튼, 입력 |
| `text-lg` | 1.125 | 18px | 700 | 소제목, 모달 제목 |
| `text-xl` | 1.25 | 20px | 800 | 화면 제목, AppBar |
| `text-2xl` | 1.5 | 24px | 700–800 | 레시피 제목 (카드/상세) |
| `text-3xl` | 1.875 | 30px | 800 | 히어로 텍스트 (드물게) |

---

## 간격 토큰

| 토큰 | px | 용도 |
|------|-----|------|
| `--space-1` | 4px | 아이콘↔텍스트 간격 |
| `--space-2` | 8px | 칩 내부 패딩, 배지 |
| `--space-3` | 12px | 카드 내부 패딩 (소) |
| `--space-4` | 16px | 카드 패딩, 기본 수평 여백 (모바일) |
| `--space-5` | 20px | 섹션 헤더 마진 |
| `--space-6` | 24px | 컨테이너 수평 패딩 (≥768px) |
| `--space-8` | 32px | 섹션 간격 |
| `--space-12` | 48px | 화면 상단 여백 |

---

## 컴포넌트 규칙

| 항목 | 값 |
|------|---|
| 카드 border-radius | `16px` |
| 버튼 border-radius | `12px` |
| 칩 / 태그 border-radius | `9999px` |
| 모달 / 바텀시트 border-radius | `20px` |
| 터치 타겟 최소 크기 | `44 × 44px` |
| 하단 탭바 높이 | `56px + safe-area-inset-bottom` |
| 카드 box-shadow | `0 2px 10px rgba(0,0,0,0.08)` |

---

## 변경 이력

| 날짜 | 변경 내용 | 담당 |
|------|----------|------|
| 2026-03-20 | 초기 확정 (C2 명랑한 주방) | design-consultant |
| 2026-04-27 | 배민 스타일 후속 전환용 additive 토큰 14개 추가 | Codex |
| 2026-04-27 | 사용자 승인 brand 토큰 값 변경: `--brand` #ED7470, `--brand-deep` #C84C48, `--brand-soft` #FDEBEA; additive gray/surface/radius/shadow 값 유지 확정 | Claude |
| 2026-05-11 | Wave1 Mobile 100% Parity Override 섹션 추가, mobile target tokens 문서화 | Codex |
| 2026-05-12 | Phase 2 app/web 책임 분리 및 mobile-scoped token layer 기본 경로 확정 | Codex |
