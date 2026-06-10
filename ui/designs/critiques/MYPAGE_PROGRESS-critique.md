# MYPAGE_PROGRESS 설계 리뷰

> 검토 대상: `ui/designs/MYPAGE_PROGRESS.md`
> 기준 문서: 화면정의서 v1.5.14 SS 19 / 요구사항기준선 v1.7.7 progress contract / API 문서 v1.2.16 SS 12-9 / mobile-ux-rules.md / product-design-authority.md
> 검토일: 2026-06-10
> 검토자: design-critic

## 종합 평가

**등급**: 통과 (Green)

**한 줄 요약**: 33b 범위를 compact progress display로 제한했고, 33c의 badge/quest/toast/tutorial을 명확히 제외했다. 320px responsive rule, soft-fail, read-only, server-authority 표시 원칙이 모두 포함되어 Stage 1 설계 기준을 통과한다.

## 크리티컬 이슈

없음.

## 마이너 이슈

| # | 위치 | 문제 | 제안 |
| --- | --- | --- | --- |
| 1 | desktop layout | 데스크톱 profile row 우측 배치와 하단 배치가 둘 다 열려 있다. | Stage 4 구현 시 기존 `components/mypage/mypage-screen.tsx` 구조를 본 뒤 하나로 확정한다. 기존 panel 폭이 좁으면 하단 배치를 우선한다. |
| 2 | error retry | soft-fail error에 재시도 버튼을 선택으로 열어두었다. | MYPAGE core를 막지 않기 위해 1차 구현은 짧은 fallback copy만 두고, 명시 재시도는 과해지면 생략한다. |
| 3 | future hooks | badge row 여지를 남기되 슬롯을 미리 만들지 않는다고 되어 있다. | 적절하다. 33c에서 실제 요구가 생기기 전 추상화하지 않는다. |

## 체크리스트 결과

### A. 요구사항 정합성

- [x] 실제 `GET /api/v1/users/me/progress` 기반 표시로 정의되어 있다.
- [x] `GET /api/v1/users/me`에 progress를 섞지 않는다.
- [x] 하드코딩 level subtitle 제거가 blocker로 명시되어 있다.
- [x] badge/quest/toast/tutorial은 33c로 분리되어 있다.
- [x] schema/API 변경이 없다.

### B. 상태 커버리지

- [x] loading skeleton이 progress 영역으로 격리되어 있다.
- [x] zero-progress를 정상 시작 상태로 처리한다.
- [x] error가 MYPAGE 전체 실패로 전파되지 않는 soft-fail이다.
- [x] unauthorized는 기존 MYPAGE gate를 따른다.
- [x] read-only 성격이 명확하다.

### C. 모바일 UX

- [x] 390px와 320px 와이어프레임이 모두 있다.
- [x] 320px에서 긴 설명 copy는 줄바꿈 가능하다.
- [x] horizontal overflow가 blocker로 명시되어 있다.
- [x] progress bar height와 layout shift 방지 규칙이 있다.
- [x] touch target 문제를 만들 신규 버튼이 없다.

### D. 접근성

- [x] `role="progressbar"`와 aria value rule이 명시되어 있다.
- [x] 색상 외 percent/text가 함께 제공된다.
- [x] screen reader label 방향이 있다.
- [x] error copy가 과한 alert로 core usage를 막지 않는다.

### E. 톤 적합성

- [x] 게임형 등급 HUD를 피하고 compact 집밥 성장 UI로 제한했다.
- [x] 보상 상자, 과한 glow, rank ladder를 금지했다.
- [x] 후속 33c gamification과 현재 33b display foundation의 경계가 명확하다.

## Stage 4 Blockers

- [ ] 320px screenshot에서 progress text/bar가 겹치거나 잘린다.
- [ ] progress API 실패가 MYPAGE 전체 error로 전파된다.
- [ ] `집밥 러너` 또는 `레벨 5` 같은 정적 level subtitle이 남아 있다.
- [ ] 클라이언트가 XP/level threshold를 직접 계산한다.
- [ ] 33b에 badge/quest/toast/tutorial UI가 섞인다.

## 판정

Stage 1 통과. Stage 4 구현은 `ui/designs/MYPAGE_PROGRESS.md`와 prototype을 기준으로 진행하고, Stage 5 전에 390px/320px evidence를 반드시 남겨야 한다.
