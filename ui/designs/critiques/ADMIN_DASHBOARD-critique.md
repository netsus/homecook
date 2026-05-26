# ADMIN_DASHBOARD 설계 리뷰

> 검토 대상: `ui/designs/ADMIN_DASHBOARD.md`
> 기준 문서: 화면정의서 v1.5.9 SS 21 / 요구사항 v1.7.2 SS 1-11, 2-14 / 유저플로우 v1.3.9 SS 12 / api문서 v1.2.12 / design-tokens.md / mobile-ux-rules.md / anchor-screens.md / AGENTS.md
> 검토일: 2026-05-27
> 검토자: design-critic
> evidence:
> - `ui/designs/evidence/admin-foundation/ADMIN_DASHBOARD-mobile.png`
> - `ui/designs/evidence/admin-foundation/ADMIN_DASHBOARD-desktop.png`

## 종합 평가

**등급**: 통과 (Green)

**한 줄 요약**: 화면정의서 SS 21의 모든 항목(관리자 인증, 403 Forbidden, 사용자 통계 요약, 운영 이벤트 요약, 관리 화면 네비게이션, 후속 disabled placeholder, admin_page_view 감사 기록 + fail closed)이 빠짐없이 반영되었다. 6개 상태(loading/empty/error/read-only/unauthorized + 선택적 forbidden)가 모두 와이어프레임으로 기술되었고, Admin 공통 네비게이션이 4개 화면에 일관되게 적용되는 구조다. 크리티컬 이슈 0건, 마이너 이슈 2건으로 Stage 1 통과 판정한다.

## 크리티컬 이슈 (수정 필수)

> 없음

## 마이너 이슈 (권장 수정)

| # | 위치 | 문제 | 제안 |
|---|------|------|------|
| 1 | SummaryCard | 요약 카드가 기존 list API를 재사용하여 count를 추출하는 구조인데, 사용자 150명 + 이벤트 전체를 조회해 count만 취하는 것이 비효율적일 수 있다. 현재 backend contract에 별도 summary/count API가 없다. | Stage 2 백엔드 구현 시 기존 list API의 pagination.total 필드를 사용하면 page=1&limit=1로 count만 취할 수 있다. 별도 API 불필요 — 현재 contract으로 충분. blocker 아님. |
| 2 | AdminTabBar | Admin 탭바에 disabled placeholder (커뮤니티, 신고)가 포함되어 있는데, 이 placeholder의 존재 자체가 관리자에게 "곧 제공될 기능"이라는 기대를 줄 수 있다. 출시 시점에 placeholder를 보여줄지, 완전히 숨길지 정책 결정이 필요하다. | Stage 4에서 placeholder 포함/제외를 결정. 포함하더라도 화면정의서 SS 21에 "disabled placeholder" 명시가 있으므로 현재 설계는 준수. blocker 아님. |

## 체크리스트 결과

### A. 요구사항 정합성
- [x] 화면 정의서의 모든 컴포넌트가 와이어프레임에 포함됐는가 — SS 21: 관리자 인증 확인, 403 Forbidden, 사용자 통계 요약(SummaryCard), 운영 이벤트 요약(SummaryCard), 관리 화면 네비게이션(NavRow + AdminTabBar), 후속 disabled placeholder, admin_page_view 감사 기록 모두 포함.
- [x] 문서에 없는 컴포넌트/필드/기능이 추가됐는가 — 추가 없음. 바로가기 행은 화면정의서의 "각 관리 화면 네비게이션 링크"에 해당.
- [x] 로그인/권한 게이트 대상 액션이 모두 처리됐는가 — requireAdminUser 가드 명시, unauthorized(401) + forbidden(403) 상태 와이어프레임 포함.
- [x] read-only 정책이 반영됐는가 — 수정/삭제 UI 없음. 요약 카드와 네비게이션만 제공.
- [x] 감사 기록 fail closed가 반영됐는가 — "감사 기록 실패 시 대시보드 데이터 렌더링 차단" 명시.

### B. 공통 상태 커버리지
- [x] Loading 상태 포함 — 스켈레톤 카드 + 스켈레톤 네비게이션 행 와이어프레임 제공.
- [x] Empty 상태 포함 — 숫자 0 표시 + 네비게이션 행 항상 표시. 대시보드는 고정 구조이므로 "비어있음" 안내 대신 0 값 표시가 적절.
- [x] Error 상태 포함 — 오류 아이콘 + "대시보드를 불러오지 못했어요" + [다시 시도] CTA 와이어프레임.
- [x] Unauthorized 상태 포함 — 잠금 아이콘 + "로그인이 필요합니다" + [로그인하기] CTA.
- [x] Forbidden 상태 포함 — 차단 아이콘 + "관리자 권한이 없습니다" + 안내 텍스트.

### C. 내비게이션 & 플로우
- [x] Admin 탭바 구조 일관성 — 4개 활성 탭(대시보드/사용자/이벤트/감사로그) + 2개 disabled placeholder(커뮤니티/신고). 모든 Admin 화면에 공통 적용으로 명시.
- [x] 일반 앱 하단 탭바와 분리 — "일반 앱 하단 탭바 없음" 명시. Admin은 독립 네비게이션.
- [x] 유저 Flow맵과 진입/이탈 경로 일치 — 진입: /admin 직접 접근. 이탈: Admin 탭바 또는 브라우저 뒤로가기. 유저플로우 v1.3.9 SS 12와 일치.
- [x] disabled placeholder가 미구현 페이지로 이동하지 않는가 — "탭 불가, 네비게이션 없음" 명시.

### D. UX 품질
- [x] 터치 타겟 최소 44px 준수 — Admin 탭바 44px, NavRow 52px, CTA 44px 모두 명시.
- [x] 모바일 퍼스트 (375px 기준) 레이아웃 — 와이어프레임이 375px 기준.
- [x] 작은 모바일 sentinel에서도 구조 유지 — 320px 대응 섹션 포함: 탭바 overflow-x auto, 요약 카드 2열 그리드 유지.
- [x] whole-page horizontal scroll을 유도하지 않는가 — 스크롤 정책에서 가로 스크롤 금지 명시.
- [x] scroll containment가 명확한가 — 앱바 + 탭바 sticky, 콘텐츠 세로 스크롤. 스크롤 정책 테이블에서 각 영역 정의.
- [x] 내부 운영 도구로서 적절한 밀도인가 — 요약 카드는 데이터 중심으로 장식 최소화. 바로가기 행도 간결. 적절함.

### E. 도메인 규칙 정합성
- [x] PII 최소화 정책 반영 — 대시보드는 count만 표시하므로 PII 노출 없음.
- [x] 읽기 전용 정책 — 수정/삭제 UI 없음.
- [x] service role 정책 — UI 수준에서 직접 표현하지 않으나, Error 상태가 service role 부재 시의 fail closed를 포함.

### F. 디자인 토큰 준수
- [x] 앱바/탭바에 적절한 토큰 사용 — --surface 배경, --foreground 제목, --brand 활성 탭, --text-3 비활성 탭, --line 보더.
- [x] 요약 카드에 적절한 토큰 사용 — --surface, --radius-md, --shadow-1, --foreground 숫자, --text-3 라벨.
- [x] NavRow에 적절한 토큰 사용 — --surface, --radius-md, --shadow-1, --foreground 텍스트, --text-3 chevron.
- [x] 확정 토큰 외 임의 색상 미사용 — 모든 색상이 design-tokens.md 확정 토큰과 일치.
- [x] disabled placeholder에 --text-4 사용 — 적절한 disabled 토큰 선택.

## design-generator 재작업 요청 항목

> 크리티컬 이슈 0건. 마이너 이슈 2건은 Stage 1 blocker가 아니므로 재작업 불필요.

- [ ] (마이너 #1) SummaryCard count 데이터 소스 — page=1&limit=1 + pagination.total로 해결 가능. Stage 2에서 확인.
- [ ] (마이너 #2) disabled placeholder 포함/제외 정책 — Stage 4에서 결정. 현재 설계는 화면정의서 준수.

## 통과 조건

이 화면 설계가 구현으로 넘어가려면:
- [x] 크리티컬 이슈 0개
- [x] 마이너 이슈 처리 또는 수용 결정 — 2건 모두 Stage 2/4에서 해결 가능

**판정: Stage 1 통과 (Green)**. 마이너 이슈 2건은 구현 시 자연스럽게 해결되며 Stage 2 백엔드 착수에 영향 없음.

## 부록: 검토 필요 항목에 대한 의견

| 요청 항목 | 의견 |
|----------|------|
| 요약 카드 2열 그리드 320px 균형 | 숫자(text-2xl = 24px)와 라벨(text-xs = 11px)의 수직 조합은 320px에서 2열로 나눠도 각 셀이 ~140px 이상 확보된다. text-2xl 숫자는 3~4자리(0~9999)이므로 충분함. |
| disabled placeholder의 "미구현" 전달 | --text-4 + opacity 0.5 조합이 iOS/Android의 disabled 탭 패턴과 일치하므로 "탭 불가"임을 자연스럽게 전달. 추가로 cursor: default가 데스크톱에서도 비활성을 명확히 한다. |
| 바로가기 행과 탭바의 기능적 중복 | 의도된 중복이다. 탭바는 Admin 전체의 공통 네비게이션이고, 바로가기 행은 대시보드 고유의 "다음 행동 안내"다. 대시보드에서만 표시되므로 혼란보다 편의가 크다. |
| count 데이터 소스 | list API에 page=1&limit=1을 보내면 응답의 pagination.total에서 전체 count를 얻을 수 있다. 별도 summary API 없이도 충분히 동작한다. |
| 감사 기록 fail closed vs 일반 Error 구분 | 현재 설계에서는 시각적으로 동일한 Error 상태를 사용한다. 운영자가 원인을 파악하기 위해 브라우저 콘솔이나 서버 로그를 확인해야 하나, MVP에서는 충분하다. 후속으로 Error 메시지에 "감사 기록 실패" 힌트를 추가할 수 있다. |
