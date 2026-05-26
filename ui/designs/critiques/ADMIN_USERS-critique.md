# ADMIN_USERS 설계 리뷰

> 검토 대상: `ui/designs/ADMIN_USERS.md`
> 기준 문서: 화면정의서 v1.5.9 SS 22 / 요구사항 v1.7.2 SS 1-11, 2-14 / 유저플로우 v1.3.9 SS 12 / api문서 v1.2.12 GET /api/v1/admin/users / design-tokens.md / mobile-ux-rules.md / anchor-screens.md / AGENTS.md
> 검토일: 2026-05-27
> 검토자: design-critic
> evidence:
> - `ui/designs/evidence/admin-foundation/ADMIN_USERS-mobile.png`
> - `ui/designs/evidence/admin-foundation/ADMIN_USERS-mobile-narrow.png`
> - `ui/designs/evidence/admin-foundation/ADMIN_USERS-desktop.png`

## 종합 평가

**등급**: 통과 (Green)

**한 줄 요약**: 화면정의서 SS 22의 사용자 목록 테이블(user id, 마스킹 이메일, provider, nickname, created_at, 고수준 카운트/상태), 검색/필터, 페이지네이션이 모두 반영되었다. PII 최소화 정책(승인된 요약 정보만, 원문 이메일/OAuth 토큰/YouTube URL 금지)이 별도 섹션으로 문서화되었고, 검색어 감사 로그 미저장 정책도 명시되었다. 768px 기준 테이블 ↔ 카드 반응형 전환, 320px 대응, 5개 상태 와이어프레임이 모두 포함되었다. 크리티컬 이슈 0건, 마이너 이슈 2건으로 Stage 1 통과 판정한다.

## 크리티컬 이슈 (수정 필수)

> 없음

## 마이너 이슈 (권장 수정)

| # | 위치 | 문제 | 제안 |
|---|------|------|------|
| 1 | Empty 상태 | "검색 결과가 없어요"와 "사용자가 없어요" (시스템에 사용자가 전무한 경우)가 시각적으로 구분되지 않는다. 후자는 거의 발생하지 않으나, 초기 운영 시 admin bootstrap 직후에는 가능하다. | 검색어/필터가 활성화된 상태에서는 "검색 결과가 없어요", 필터 없이 전체 목록이 비었을 때는 "등록된 사용자가 없어요"로 메시지를 분기. blocker 아님 — Stage 4에서 분기 구현. |
| 2 | UserTable 열 너비 | 데스크톱 테이블의 열 비율(닉네임 20% / 이메일 30% / 프로바이더 12% / 가입일 18% / 레시피 10% / 상태 10%)이 768px에서는 이메일 열이 좁아 마스킹 이메일이 잘릴 수 있다. | 768px~1024px 구간에서 이메일 열을 말줄임 처리하거나, breakpoint를 조정(예: 1024px 이상에서 테이블). blocker 아님 — Stage 4 실물 확인 후 조정. |

## 체크리스트 결과

### A. 요구사항 정합성
- [x] 화면 정의서의 모든 컴포넌트가 와이어프레임에 포함됐는가 — SS 22: 사용자 목록 테이블(UserTable/UserCard), 검색/필터(SearchField + ProviderFilter), 페이지네이션(Pagination) 모두 포함.
- [x] PII 최소화 정책이 반영됐는가 — 별도 "PII 최소화 정책" 섹션에서 허용 필드 7개, 금지 항목 5개를 명시.
- [x] 검색어 감사 로그 미저장이 반영됐는가 — "검색어는 감사 로그에 기록하지 않는다. target_type='user_search', target_id=null" 명시.
- [x] read-only 정책이 반영됐는가 — "수정/삭제 UI 없음" + "읽기 전용 목록만 제공" 명시. 행 클릭/상세 보기 의도적 미포함.
- [x] API 매핑이 정확한가 — GET /api/v1/admin/users의 query 파라미터(page, limit, search, provider)가 UI 컴포넌트와 정확히 매핑.

### B. 공통 상태 커버리지
- [x] Loading 상태 — 스켈레톤 행 × 5 + 검색 필드 활성 유지 와이어프레임.
- [x] Empty 상태 — 빈 상자 아이콘 + "검색 결과가 없어요" 와이어프레임. (마이너 #1에서 메시지 분기 제안)
- [x] Error 상태 — 오류 아이콘 + "사용자 목록을 불러오지 못했어요" + [다시 시도] CTA.
- [x] Unauthorized / Forbidden — "ADMIN_DASHBOARD와 동일한 패턴" 명시. 공통 적용.
- [x] Read-only — 수정 UI 없음으로 기본 read-only.

### C. 내비게이션 & 플로우
- [x] Admin 탭바 일관성 — "사용자" 활성 상태로 Admin 공통 탭바 적용.
- [x] 진입/이탈 경로 — 진입: ADMIN_DASHBOARD 바로가기 또는 탭바. 이탈: 탭바로 다른 화면.
- [x] 페이지네이션 플로우 — 페이지 변경 시 API 호출 + 스크롤 유지/리셋 정책 (명시적으로 기술하지 않으나 표준 동작으로 충분).

### D. UX 품질
- [x] 터치 타겟 최소 44px — 검색 필드 44px, 필터 44px, 페이지네이션 44x44px, UserCard 전체 탭 불가(read-only).
- [x] 모바일 퍼스트 레이아웃 — 375px 기준 카드 뷰 와이어프레임. 데스크톱 테이블은 768px+.
- [x] 320px 대응 — 카드 패딩 축소, 닉네임/이메일 말줄임, 메타 행 2행 wrap 허용.
- [x] whole-page horizontal scroll 금지 — 스크롤 정책에 명시. 테이블도 열 비율 조정.
- [x] 검색 debounce — 300ms debounce 명시. Enter 키 즉시 검색도 지원.

### E. 도메인 규칙 정합성
- [x] 마스킹 이메일만 표시 — `email_masked` 필드. 원문 이메일 표시 금지.
- [x] OAuth 토큰 미표시 — PII 금지 목록에 포함.
- [x] YouTube URL/소스 텍스트 미표시 — PII 금지 목록에 포함.
- [x] 비공개 장보기/팬트리 상세 미표시 — PII 금지 목록에 포함.
- [x] 프로바이더 pill이 OAuth 프로바이더만 표시 — 토큰 정보 없이 프로바이더명만.

### F. 디자인 토큰 준수
- [x] 검색 필드에 적절한 토큰 — --surface-fill 배경, --radius-sm, --muted placeholder, --brand 포커스 보더.
- [x] 테이블/카드에 적절한 토큰 — --surface 행/카드, --surface-fill 헤더, --text-3 메타, --foreground 닉네임.
- [x] 프로바이더 pill에 --olive — #1f6b52 배경, white 텍스트, --radius-full.
- [x] 페이지네이션에 적절한 토큰 — --text-2 비활성, --brand 활성, --text-3 화살표.
- [x] 확정 토큰 외 임의 색상 미사용 — 모든 색상 일치.

## design-generator 재작업 요청 항목

> 크리티컬 이슈 0건. 재작업 불필요.

- [ ] (마이너 #1) Empty 상태 메시지 분기 — Stage 4에서 구현. blocker 아님.
- [ ] (마이너 #2) 테이블 열 너비 768px 대응 — Stage 4 실물 확인 후 조정. blocker 아님.

## 통과 조건

- [x] 크리티컬 이슈 0개
- [x] 마이너 이슈 처리 또는 수용 결정 — 2건 모두 Stage 4에서 해결 가능

**판정: Stage 1 통과 (Green)**. PII 최소화 정책이 명확히 문서화되었고, 검색어 감사 미저장 정책이 화면정의서와 정확히 일치한다.

## 부록: 검토 필요 항목에 대한 의견

| 요청 항목 | 의견 |
|----------|------|
| 마스킹 이메일 320px 카드 뷰 가독성 | `c***@example.com`은 약 18자. text-sm(13px)에서 320px - padding(24px) = 296px 내에 충분히 들어간다. 매우 긴 도메인만 말줄임 필요. |
| 프로바이더 pill 배지 시각적 간섭 | --olive pill은 작은 크기(text-xs)와 --radius-full로 테이블 헤더와 무게가 다르므로 시각적 간섭 없음. 테이블에서는 별도 열, 카드에서는 메타 행에 인라인으로 배치. |
| 검색 debounce 깜빡임 | 300ms debounce + Loading 스켈레톤 전환은 업계 표준. 스켈레톤이 있으므로 "빈 화면 깜빡임"은 없다. 추가로 이전 결과를 유지하다가 새 결과로 교체하는 stale-while-revalidate 패턴도 고려 가능하나 Stage 4 구현 결정. |
| 테이블 ↔ 카드 전환 768px breakpoint | 768px(iPad mini 세로)는 6열 테이블의 최소 유효 너비다. 더 넓으면(1024px) 여유가 있지만 768px에서도 열 비율로 맞출 수 있다. 마이너 #2에서 말줄임 대응 제안. |
| Empty 상태 "사용자 없음" vs "검색 결과 없음" 구분 | 마이너 #1로 다룸. 검색어/필터 상태로 조건 분기가 가능하다. 초기 운영 시(admin bootstrap 직후) "등록된 사용자가 없어요"가 표시될 수 있으나, 이는 정상 동작. |
