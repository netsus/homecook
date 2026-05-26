# ADMIN_AUDIT_LOGS 설계 리뷰

> 검토 대상: `ui/designs/ADMIN_AUDIT_LOGS.md`
> 기준 문서: 화면정의서 v1.5.9 SS 24 / 요구사항 v1.7.2 SS 1-11, 2-14 / 유저플로우 v1.3.9 SS 12 / api문서 v1.2.12 GET /api/v1/admin/audit-logs / design-tokens.md / mobile-ux-rules.md / anchor-screens.md / AGENTS.md
> 검토일: 2026-05-27
> 검토자: design-critic

## 종합 평가

**등급**: 통과 (Green)

**한 줄 요약**: 화면정의서 SS 24의 감사 로그 목록 테이블(action, actor_admin_user_id, target_type, target_id, result, created_at), 필터(action, actor, target_type), 페이지네이션이 모두 반영되었다. ip_hash/user_agent_hash가 해시 값만 표시하며 모바일에서는 밀도를 위해 숨기는 합리적 결정이 포함되었다. 검색어 미저장 정책(target_id=null)과 request_path pathname-only 정책이 명확히 문서화되었다. 크리티컬 이슈 0건, 마이너 이슈 2건으로 Stage 1 통과 판정한다.

## 크리티컬 이슈 (수정 필수)

> 없음

## 마이너 이슈 (권장 수정)

| # | 위치 | 문제 | 제안 |
|---|------|------|------|
| 1 | AuditLogTable 열 수 | 데스크톱 테이블이 8열(액션/관리자/대상유형/경로/결과/IP해시/UA해시/시간)로 많다. 768px에서는 각 열이 매우 좁아져 읽기 어려울 수 있다. | 두 가지 방안: (A) IP해시/UA해시를 행 확장(accordion)으로 이동하여 기본 6열로 축소, (B) 테이블 breakpoint를 1024px으로 올려 768px~1023px에서는 카드 뷰 사용. blocker 아님 — Stage 4 실물 확인 후 결정. |
| 2 | 관리자 필터 UX | 관리자 필터 드롭다운이 UUID 목록을 표시한다. MVP에서 관리자가 1명이면 문제 없으나, 확장 시 UUID만으로는 누구인지 식별이 어렵다. | MVP에서는 현재 설계 유지. 관리자가 2명 이상이 되면 UUID + 닉네임/이메일 조합으로 드롭다운 옵션을 보강. blocker 아님 — 후속 확장 시 대응. |

## 체크리스트 결과

### A. 요구사항 정합성
- [x] 화면 정의서의 모든 컴포넌트가 와이어프레임에 포함됐는가 — SS 24: 감사 로그 목록 테이블(AuditLogCard/AuditLogTable), 필터(FilterBar), 페이지네이션(Pagination) 포함.
- [x] ip_hash/user_agent_hash가 해시 값만 표시하는가 — "sha256:... 축약" 명시. 원본 IP/User-Agent 미표시.
- [x] 검색어 미저장 정책이 반영됐는가 — "target_id=null (검색어 미저장)" 명시.
- [x] request_path pathname-only가 반영됐는가 — "pathname만 표시" 명시.
- [x] API 매핑이 정확한가 — GET /api/v1/admin/audit-logs의 query 파라미터(page, limit, action, actor_admin_user_id, target_type)가 UI와 매핑.
- [x] 감사 로그 조회 자체의 자기 참조 감사가 언급됐는가 — "감사 로그 조회 자체도 list_audit_logs 감사 기록을 남긴다" 명시.

### B. 공통 상태 커버리지
- [x] Loading 상태 — 스켈레톤 카드 + 필터 활성 유지.
- [x] Empty 상태 — "감사 로그가 없어요" + 필터 활성 유지.
- [x] Error / Unauthorized / Forbidden — 공통 패턴 적용.
- [x] Read-only — 수정/삭제 UI 없음.

### C. 내비게이션 & 플로우
- [x] Admin 탭바 일관성 — "감사로그" 활성 상태.
- [x] 진입/이탈 경로 — ADMIN_DASHBOARD 또는 탭바.
- [x] FilterBar가 ADMIN_EVENTS와 동일 패턴 — "동일 패턴. 필터 항목만 다름" 명시.

### D. UX 품질
- [x] 터치 타겟 최소 44px — 필터 칩 44px, 페이지네이션 44x44px.
- [x] 모바일 퍼스트 레이아웃 — 375px 카드 뷰 + 768px+ 테이블 뷰.
- [x] 320px 대응 — 필터 칩 wrap, 카드 패딩 축소, action/path 말줄임.
- [x] whole-page horizontal scroll 금지 — 스크롤 정책 명시.
- [x] ip_hash/user_agent_hash 모바일 숨김 — 밀도 우선 결정으로 적절.

### E. 도메인 규칙 정합성
- [x] 원본 IP/User-Agent 미표시 — 해시 값만 표시.
- [x] 읽기 전용 정책 — 감사 로그 삭제/수정 UI 없음.
- [x] request_path pathname-only — 필드 정책 테이블에서 명시.

### F. 디자인 토큰 준수
- [x] FilterBar에 적절한 토큰 — ADMIN_EVENTS와 동일 패턴.
- [x] ResultPill에 적절한 토큰 — success에 --olive(기존 토큰), failure에 #FFEBEE/#C62828(ADMIN_EVENTS SeverityPill과 동일 시멘틱 컬러 — 마이너 #1은 ADMIN_EVENTS critique에서 이미 다룸).
- [x] AuditLogCard에 적절한 토큰 — --surface, --radius-md, --shadow-1, --foreground/--text-3.
- [x] Pagination에 적절한 토큰 — 공통 컴포넌트.

## design-generator 재작업 요청 항목

> 크리티컬 이슈 0건. 재작업 불필요.

- [ ] (마이너 #1) 테이블 열 수 768px 대응 — Stage 4 실물 확인 후 accordion 또는 breakpoint 조정.
- [ ] (마이너 #2) 관리자 필터 UUID + 닉네임 보강 — 관리자 2명 이상 시 후속 대응.

## 통과 조건

- [x] 크리티컬 이슈 0개
- [x] 마이너 이슈 처리 또는 수용 결정 — 2건 모두 Stage 4 또는 후속 확장에서 해결 가능

**판정: Stage 1 통과 (Green)**. 감사 로그 화면의 핵심 정책(해시 값만, 검색어 미저장, pathname-only)이 모두 정확히 반영되었다. 마이너 이슈는 구현 후 실물 확인으로 해결 가능.

## 부록: 검토 필요 항목에 대한 의견

| 요청 항목 | 의견 |
|----------|------|
| ip_hash/user_agent_hash 모바일 숨김 운영 영향 | 모바일에서 Admin 화면을 사용하는 시나리오는 "긴급 조회(emergency lookup)"다. 긴급 상황에서 IP/UA 해시가 필요한 경우는 드물다. 심층 분석은 데스크톱에서 수행하는 것이 자연스럽다. |
| 관리자 UUID 축약 8자 충분성 | UUID v4의 첫 8자(hex)는 4.3B 조합이므로 관리자 수가 소수일 때 충돌 가능성은 무시할 수 있다. MVP 1명이면 더더욱 충분. |
| 자기 참조 감사 무한 루프 UX | 기술적으로 감사 로그 조회 → 새 감사 기록 → 다음 페이지에 나타남 → 조회 시 또 기록... 의 자기 참조가 있으나, 이는 최신 로그가 상단에 추가될 뿐 사용자가 인식하는 "무한 루프"가 아니다. 같은 페이지를 새로고침하면 최상단에 자기 조회 기록이 하나 추가되는 것이 전부. 운영 도구에서는 이 패턴이 일반적(AWS CloudTrail 등). |
| 감사 로그 검색 기능 부재 | 필터(action, actor, target_type)와 최신순 페이지네이션으로 MVP 탐색 시나리오를 커버한다. 텍스트 검색은 감사 로그에서 "무엇을 검색하는가"가 불명확하므로 MVP에서 검색 필드를 추가하는 것보다 필터 조합이 더 적합하다. |
| ResultPill failure 시멘틱 컬러 | ADMIN_EVENTS의 SeverityPill error와 동일한 #FFEBEE/#C62828 조합이다. 시멘틱 컬러 토큰화는 ADMIN_EVENTS critique에서 다루었으므로 여기서는 중복하지 않는다. 두 화면이 동일 시멘틱 컬러를 공유하는 것 자체는 일관성 있는 결정. |
