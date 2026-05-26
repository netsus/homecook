# ADMIN_EVENTS 설계 리뷰

> 검토 대상: `ui/designs/ADMIN_EVENTS.md`
> 기준 문서: 화면정의서 v1.5.9 SS 23 / 요구사항 v1.7.2 SS 1-11, 2-14 / 유저플로우 v1.3.9 SS 12 / api문서 v1.2.12 GET /api/v1/admin/operational-events / design-tokens.md / mobile-ux-rules.md / anchor-screens.md / AGENTS.md
> 검토일: 2026-05-27
> 검토자: design-critic

## 종합 평가

**등급**: 통과 (Green)

**한 줄 요약**: 화면정의서 SS 23의 이벤트 목록 테이블(event_type, severity, source, created_at, message_summary), 필터(event_type, severity, source, 날짜 범위), 페이지네이션, 이벤트 상세 보기(EventDetailPanel — sanitized metadata_json, PII 금지)가 모두 반영되었다. 최소 이벤트 소스 5종과 PII 금지 목록이 문서화되었고, request_path pathname-only 표시가 명확하다. SeverityPill에 디자인 토큰에 없는 시멘틱 컬러가 사용되었으나 Stage 4에서 토큰화 결정 가능하다. 크리티컬 이슈 0건, 마이너 이슈 2건으로 Stage 1 통과 판정한다.

## 크리티컬 이슈 (수정 필수)

> 없음

## 마이너 이슈 (권장 수정)

| # | 위치 | 문제 | 제안 |
|---|------|------|------|
| 1 | SeverityPill | warn 배경 `#FFF3E0`(amber 100)과 error 배경 `#FFEBEE`(red 50)은 design-tokens.md에 없는 시멘틱 컬러다. 현재 설계에서 "Stage 4에서 토큰 확장 여부 결정"으로 미뤘으나, 토큰 체계 밖의 색상이 4개 Admin 화면에 퍼지면 관리가 어려워질 수 있다. | 두 가지 방안: (A) design-tokens.md에 `--severity-warn-bg`, `--severity-error-bg` 시멘틱 토큰을 추가, (B) 기존 토큰으로 대체 (warn → --brand-primary-soft, error → 기존 --danger 연한 버전). Stage 4 구현 전에 토큰 확장 PR을 올리거나, 인라인 사용을 명시적으로 수용. blocker 아님. |
| 2 | FilterBar 모바일 밀도 | 필터 칩 3개(유형/심각도/소스) + 날짜 범위(시작일/종료일)가 모바일 첫 화면에서 상당한 공간을 차지한다. 320px에서는 필터만으로 화면의 40%를 쓸 수 있다. | 필터를 접을 수 있는 "필터" 토글 버튼 패턴 고려. 기본 접힌 상태에서 [필터 ▾] 탭으로 펼침. 또는 현재 구조 유지하되 320px에서 칩을 2행으로 wrap. blocker 아님 — Stage 4에서 밀도 조정. |

## 체크리스트 결과

### A. 요구사항 정합성
- [x] 화면 정의서의 모든 컴포넌트가 와이어프레임에 포함됐는가 — SS 23: 이벤트 목록 테이블(EventCard/EventTable), 필터(FilterBar), 페이지네이션(Pagination), 이벤트 상세 보기(EventDetailPanel — accordion 패턴, sanitized metadata_json) 포함.
- [x] 최소 이벤트 소스 5종이 문서화됐는가 — auth_failure, youtube_provider_failure, account_deletion, service_role_missing, unhandled_server_error 모두 별도 테이블로 명시.
- [x] PII 금지 목록이 반영됐는가 — metadata_json 내 OAuth 토큰, YouTube URL/소스 텍스트, 관리자 검색어/이메일/닉네임, 비공개 장보기/팬트리 상세 금지 명시.
- [x] request_path pathname-only가 반영됐는가 — "pathname만 표시 (쿼리스트링 없음)" 명시 + 와이어프레임에서 pathname 형태로 표시.
- [x] API 매핑이 정확한가 — GET /api/v1/admin/operational-events의 query 파라미터(page, limit, event_type, severity, source, from, to)가 UI와 매핑.

### B. 공통 상태 커버리지
- [x] Loading 상태 — 스켈레톤 카드 + 필터 활성 유지 와이어프레임.
- [x] Empty 상태 — "운영 이벤트가 없어요" + 필터 활성 유지.
- [x] Error 상태 — ADMIN_DASHBOARD 공통 패턴 참조 명시.
- [x] Unauthorized / Forbidden — 공통 패턴 적용.
- [x] Read-only — 수정/삭제 UI 없음.

### C. 내비게이션 & 플로우
- [x] Admin 탭바 일관성 — "이벤트" 활성 상태.
- [x] 진입/이탈 경로 — ADMIN_DASHBOARD 또는 탭바.
- [x] 필터 ↔ 목록 상호작용 — 필터 변경 시 page 1 리셋, API 재호출.

### D. UX 품질
- [x] 터치 타겟 최소 44px — 필터 칩 44px, 날짜 입력 44px, 페이지네이션 44x44px.
- [x] 모바일 퍼스트 레이아웃 — 375px 기준 카드 뷰. 데스크톱 테이블 768px+.
- [x] 320px 대응 — 필터 칩 wrap/overflow, 카드 패딩 축소, message_summary 말줄임.
- [x] whole-page horizontal scroll 금지 — 스크롤 정책 명시.
- [x] severity 시각적 구분 — SeverityPill로 info/warn/error 색상 구분. (마이너 #1에서 토큰 문제 지적)

### E. 도메인 규칙 정합성
- [x] metadata_json 내 PII 금지 — 별도 섹션에서 금지 목록 명시.
- [x] 읽기 전용 정책 — 이벤트 삭제/수정 UI 없음.
- [x] request_path pathname-only — 와이어프레임과 디자인 결정에서 이중 명시.

### F. 디자인 토큰 준수
- [x] FilterBar에 적절한 토큰 — --surface-fill 칩 배경, --radius-chip, --text-2/3.
- [ ] SeverityPill에 토큰 외 색상 — #FFF3E0, #E65100, #FFEBEE, #C62828 사용. 마이너 #1에서 다룸.
- [x] EventCard에 적절한 토큰 — --surface, --radius-md, --shadow-1, --foreground/--text-2/--text-3.
- [x] Pagination에 적절한 토큰 — ADMIN_USERS와 동일.

## design-generator 재작업 요청 항목

> 크리티컬 이슈 0건. 재작업 불필요.

- [ ] (마이너 #1) SeverityPill 시멘틱 컬러 토큰화 — Stage 4 전 결정.
- [ ] (마이너 #2) FilterBar 모바일 밀도 — Stage 4에서 접기 패턴 또는 wrap 확정.

## 통과 조건

- [x] 크리티컬 이슈 0개
- [x] 마이너 이슈 처리 또는 수용 결정 — 2건 모두 Stage 4에서 해결 가능하며 blocker 아님. 이벤트 상세 보기는 EventDetailPanel(accordion 패턴)로 MVP에 포함됨.

**판정: 통과 (Green)**. 화면정의서 SS 23의 모든 컴포넌트가 설계에 반영되었다. 마이너 이슈 2건(시멘틱 컬러 토큰화, 필터 모바일 밀도)은 Stage 4에서 해결 가능하며 blocker가 아니다.

## 부록: 검토 필요 항목에 대한 의견

| 요청 항목 | 의견 |
|----------|------|
| 심각도 시멘틱 컬러 조화 | amber/red 계열은 로그/모니터링 도구의 업계 표준(Grafana, Datadog, Sentry). 기존 디자인 토큰은 소비자 앱 중심이므로 Admin 전용 시멘틱 토큰을 별도 관리하는 것이 합리적. |
| 필터 3개 + 날짜 범위 모바일 공간 | 6개 필터 파라미터(event_type, severity, source, from, to + page)가 있으나 UI에서는 5개 입력이 노출된다. 모바일에서 기본 접힘 상태의 [필터] 토글이 가장 깔끔하나, 필터 없이 전체 이벤트를 먼저 보여주는 것도 유효한 패턴. |
| message_summary 1행 말줄임 충분성 | 운영 이벤트의 message_summary가 짧은 한국어 문장("OAuth 콜백 인증 실패", "Service role key 부재" 등)이면 1행으로 충분. EventDetailPanel 확장 시 전체 message_summary와 metadata_json 키-값을 볼 수 있으므로 목록 상태에서는 1행 말줄임이 합리적. |
| EventDetailPanel 운영 충분성 | accordion 패턴으로 카드/행 탭 시 sanitized metadata_json을 키-값 쌍으로 표시한다. PII 금지 목록이 명확히 정의되어 있고, 심층 분석이 필요한 경우 Supabase 대시보드/서버 로그를 교차 참조하는 경로가 유효하다. MVP 운영 범위에 적합. |
| request_path pathname-only 인지 | 관리자(운영자)는 기술 배경이 있으므로 pathname과 URL의 차이를 이해한다. UI에서 쿼리스트링이 없는 것 자체가 자연스러운 표시이며, "이 필드는 pathname만 저장합니다" 라벨은 과도한 설명. |
