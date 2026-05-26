# ADMIN_AUDIT_LOGS -- 관리자 감사 로그 조회

> 기준 문서: 화면정의서 v1.5.9 SS 24 / 요구사항 v1.7.2 SS 1-11, 2-14 / 유저플로우 v1.3.9 SS 12 / api문서 v1.2.12 GET /api/v1/admin/audit-logs
> 슬라이스: admin-foundation
> 생성일: 2026-05-27
> evidence:
> - `ui/designs/evidence/admin-foundation/ADMIN_AUDIT_LOGS-mobile.png`
> - `ui/designs/evidence/admin-foundation/ADMIN_AUDIT_LOGS-mobile-narrow.png`
> - `ui/designs/evidence/admin-foundation/ADMIN_AUDIT_LOGS-desktop.png`

---

## 화면 개요

관리자 감사 로그를 읽기 전용으로 조회하는 관리자 전용 화면. 어떤 관리자가, 언제, 어떤 Admin API를 호출했는지 기록을 확인한다. IP와 User-Agent는 해시 값만 표시한다.

- **권한**: 관리자 전용 (`admin_members` 등록 필수)
- **API**: `GET /api/v1/admin/audit-logs`
- **진입**: ADMIN_DASHBOARD 바로가기 또는 Admin 탭바 "감사로그" 탭
- **이탈**: Admin 탭바로 다른 관리 화면 이동
- **감사**: API 호출 시 `action='list_audit_logs'`

---

## 레이아웃 와이어프레임

### 기본 상태 (read-only)

```
+---------------------------------------+  <- 375px (모바일 기준)
|  관리자                               |  <- 앱바 (56px)
+---------------------------------------+
|  대시보드  사용자  이벤트  감사로그   |  <- Admin 탭바 (44px)
+=======================================+     "감사로그" 활성: --brand
|                                       |
|  필터                                 |  <- 섹션 라벨, text-xs, 600, --text-3
|                                       |
| [전체 ▾]  [전체 ▾]  [전체 ▾]         |  <- 필터 칩 행
|  액션      관리자    대상유형          |     text-sm, --text-2
|                                       |
|  총 89건                              |  <- 결과 카운트, text-sm, --text-3
|                                       |
| +-----------------------------------+ |  <- 감사 로그 카드 (모바일)
| | list_users            ✓ success  | |     --surface, --radius-md
| | 관리자: a1b2...       user_list  | |     --shadow-1
| | /api/v1/admin/users              | |
| | 2026-05-27 10:35                  | |     패딩: --space-3
| +-----------------------------------+ |
|                                       |     action: text-sm, 600, --foreground
| +-----------------------------------+ |     result pill: 아래 참조
| | list_operational_events ✓ success| |     관리자 ID: text-xs, --text-3 (축약)
| | 관리자: a1b2...  operational_ev..| |     target_type: text-xs, --text-3
| | /api/v1/admin/operational-events | |     request_path: text-xs, --text-3
| | 2026-05-27 10:36                  | |     created_at: text-xs, --text-3
| +-----------------------------------+ |
|                                       |
| +-----------------------------------+ |
| | admin_page_view       ✓ success  | |
| | 관리자: a1b2...       admin_page | |
| | /admin                            | |
| | 2026-05-27 10:34                  | |
| +-----------------------------------+ |
|                                       |
| [<  1  2  3  ...  >]                 |  <- 페이지네이션
+---------------------------------------+
```

### 데스크톱 테이블 뷰 (768px 이상)

```
+-------------------------------------------------------------------+
|  관리자                                                           |
+-------------------------------------------------------------------+
|  대시보드  사용자  이벤트  감사로그                               |
+===================================================================+
|                                                                   |
|  액션: [전체▾]  관리자: [전체▾]  대상유형: [전체▾]     총 89건   |
|                                                                   |
| +---------------------------------------------------------------+ |
| | 액션              | 관리자      | 대상유형   | 경로           | |
| | 결과  | IP해시    | UA해시      | 시간                        | |
| +---------------------------------------------------------------+ |
| | list_users        | a1b2c3...   | user_list  | /api/v1/admin/ | |
| | ✓ success | sha256:d4.. | sha256:e5.. | 05-27 10:35       | |
| +---------------------------------------------------------------+ |
| | list_operational  | a1b2c3...   | operation  | /api/v1/admin/ | |
| | _events           |             | al_events  | operational-   | |
| | ✓ success | sha256:d4.. | sha256:e5.. | 05-27 10:36       | |
| +---------------------------------------------------------------+ |
| | admin_page_view   | a1b2c3...   | admin_page | /admin         | |
| | ✓ success | sha256:d4.. | sha256:e5.. | 05-27 10:34       | |
| +---------------------------------------------------------------+ |
|                                                                   |
| [<  1  2  3  ...  >]                                              |
+-------------------------------------------------------------------+
```

> **ip_hash / user_agent_hash**: 데스크톱에서만 표시. 원본이 아닌 해시 값만 (`sha256:...` 축약). 모바일에서는 밀도를 위해 숨김.

### Loading 상태

```
+---------------------------------------+
|  관리자                               |
+---------------------------------------+
|  대시보드  사용자  이벤트  감사로그   |
+=======================================+
|                                       |
|  필터 (활성 유지)                     |
|                                       |
| +-----------------------------------+ |
| |  ░░░░░░░░  ░░░░  ░░░  ░░░░░░  | |  <- 스켈레톤 카드 × 5
| |  ░░░░░░░░░░░░░░░░               | |
| +-----------------------------------+ |
| +-----------------------------------+ |
| |  ░░░░░░░░  ░░░░  ░░░  ░░░░░░  | |
| |  ░░░░░░░░░░░░░░░░               | |
| +-----------------------------------+ |
+---------------------------------------+
```

### Empty 상태

```
+---------------------------------------+
|  관리자                               |
+---------------------------------------+
|  대시보드  사용자  이벤트  감사로그   |
+=======================================+
|                                       |
|  필터 (활성 유지)                     |
|                                       |
|                                       |
|          (빈 로그 아이콘)             |  <- 중앙 정렬
|                                       |
|    감사 로그가 없어요                 |  <- text-base, 500, --text-2
|    선택한 조건에 맞는                 |  <- text-sm, 400, --text-3
|    기록이 없습니다                    |
|                                       |
+---------------------------------------+
```

### Error / Unauthorized / Forbidden 상태

> ADMIN_DASHBOARD와 동일한 공통 패턴 적용. Error 상태에서 [다시 시도]가 primary CTA.

---

## 컴포넌트 상세

### FilterBar (필터 바)

> ADMIN_EVENTS FilterBar와 동일 패턴. 필터 항목만 다름. 현재 Admin API 계약은 날짜 범위 필터를 제공하지 않으므로 기간 입력은 두지 않는다.
- **칩 드롭다운 1**: 액션 (`action`) — 전체 / list_users / list_operational_events / list_audit_logs / admin_page_view
- **칩 드롭다운 2**: 관리자 (`actor_admin_user_id`) — 전체 / 관리자 UUID 목록
- **칩 드롭다운 3**: 대상유형 (`target_type`) — 전체 / user_list / user_search / operational_event_list / audit_log_list / admin_page
- **나머지 스타일링**: ADMIN_EVENTS FilterBar와 동일

### ResultPill (결과 배지)

| 결과 | 배경 | 텍스트 | 아이콘 |
|------|------|--------|--------|
| `success` | --surface-fill | --olive (#1f6b52) | ✓ |
| `failure` | `#FFEBEE` (red 50) | `#C62828` (red 900) | ✕ |

- **border-radius**: --radius-full (9999px)
- **패딩**: --space-1 (4px) × --space-2 (8px)
- **text**: text-xs, 700

### AuditLogCard (감사 로그 카드, 모바일)

- **카드 컨테이너**: --surface, --radius-md (12px), --shadow-1
  - 패딩: --space-3 (12px)
  - 수평 여백: --space-4 (16px) 양쪽
  - 카드 간격: --space-2 (8px)
- **행 1**: `action` + ResultPill
  - action: text-sm, 600, --foreground
  - ResultPill: 우측 정렬
- **행 2**: 관리자 UUID (축약) + `target_type`
  - "관리자: " 라벨 + UUID 첫 8자: text-xs, 400, --text-3
  - target_type: text-xs, 400, --text-3, 우측 정렬
- **행 3**: `request_path` (pathname만)
  - text-xs, 400, --text-3
- **행 4**: `created_at`
  - text-xs, 400, --text-3
  - 형식: YYYY-MM-DD HH:mm
- **ip_hash / user_agent_hash**: 모바일에서는 **숨김** (밀도 우선)
- **토큰 힌트**:
  - 카드 배경 <- `--surface`
  - action <- `--foreground`
  - 메타 텍스트 <- `--text-3`
  - 그림자 <- `--shadow-1`
  - 모서리 <- `--radius-md`

### AuditLogTable (감사 로그 테이블, 768px 이상)

- **헤더 행**: --surface-fill 배경, text-xs, 600, --text-3, 높이 36px
- **데이터 행**: --surface 배경, 높이 auto (최소 56px)
  - 행 간: --line 하단 보더
- **열 구성**: 액션 (18%) | 관리자 (12%) | 대상유형 (12%) | 경로 (20%) | 결과 (8%) | IP해시 (10%) | UA해시 (10%) | 시간 (10%)
- **관리자 열**: UUID 첫 8자 + "..." 말줄임
- **해시 열**: "sha256:" + 처음 6자 + "..." 말줄임
- **request_path 열**: pathname만 표시
- **토큰 힌트**: UserTable과 동일 패턴

### Pagination

> ADMIN_USERS와 동일한 Pagination 컴포넌트 공유.

---

## 감사 로그 필드 정책

이 화면에서 표시하는 감사 로그 필드:

| 필드 | 표시 | 비고 |
|------|------|------|
| `id` | UUID | 행 key (UI에서 직접 표시하지 않음) |
| `actor_admin_user_id` | UUID 축약 (첫 8자) | 관리자 식별 |
| `action` | 전체 표시 | list_users, list_operational_events, list_audit_logs, admin_page_view |
| `target_type` | 전체 표시 | user_list, user_search, operational_event_list, audit_log_list, admin_page |
| `target_id` | null (검색어 미저장) | user_search 시 target_id=null |
| `request_path` | pathname만 | 쿼리스트링 없음 |
| `result` | success / failure | ResultPill로 표시 |
| `ip_hash` | sha256:... 축약 | 원본 아닌 해시 값만. 데스크톱만 표시 |
| `user_agent_hash` | sha256:... 축약 | 원본 아닌 해시 값만. 데스크톱만 표시 |
| `created_at` | YYYY-MM-DD HH:mm | 생성 시각 |

**표시 금지**:
- 원본 IP 주소
- 원본 User-Agent 문자열
- 검색어 (target_id에도 저장되지 않음)

---

## 인터랙션 노트

| 액션 | 트리거 | 결과 | API | 권한 |
|------|--------|------|-----|------|
| 감사 로그 로드 | 페이지 마운트 / 필터 변경 / 페이지 변경 | 감사 로그 목록 조회 | GET /admin/audit-logs | admin |
| 액션 필터 | 드롭다운 선택 | 해당 action만 필터링, page 1 리셋 | GET /admin/audit-logs?action=... | admin |
| 관리자 필터 | 드롭다운 선택 | 해당 actor만 필터링 | GET /admin/audit-logs?actor_admin_user_id=... | admin |
| 대상유형 필터 | 드롭다운 선택 | 해당 target_type만 필터링 | GET /admin/audit-logs?target_type=... | admin |
| 페이지 이동 | 페이지 번호 또는 화살표 탭 | 해당 페이지 조회 | GET /admin/audit-logs?page=N | admin |

### 스크롤 정책

| 영역 | 스크롤 방향 | 비고 |
|------|-----------|------|
| 앱바 + Admin 탭바 | 고정 (sticky) | 상단 고정 |
| 필터 바 | 세로 스크롤 시 같이 이동 | 고정하지 않음 |
| 감사 로그 목록 | 세로 스크롤 | 카드 또는 테이블 |
| 페이지 전체 | 가로 스크롤 금지 | whole-page horizontal scroll 금지 |
| 테이블 (768px+) | 가로 스크롤 금지 | 열 비율 + 말줄임으로 맞춤 |

> **scroll containment**: 앱바 + Admin 탭바는 sticky로 고정되어 감사 로그 목록만 세로 스크롤된다. 필터 바는 콘텐츠와 함께 이동하여 데이터 영역을 최대화한다. 테이블은 열 비율 + 말줄임으로 가로 스크롤 없이 맞춘다.

---

## 320px 대응 (작은 모바일 sentinel)

- **필터 칩 행**: 3개 칩이 320px에서 넘칠 수 있음 → 2행 wrap 허용
- **감사 로그 카드**: 카드 패딩 --space-3 → --space-2 축소
- **action 텍스트**: `list_operational_events`처럼 긴 action은 말줄임
- **request_path**: pathname 말줄임 (`/api/v1/admin/oper...`)
- **관리자 UUID**: 축약 표시 (첫 6~8자)

320px에서 확인해야 할 blocker:
- [ ] 감사 로그 카드의 action + ResultPill이 한 행에 맞는지
- [ ] 필터 칩이 접근 가능한지
- [ ] request_path 말줄임 후에도 경로 구분이 가능한지
- [ ] 모든 터치 타겟이 44px 이상인지

---

## 디자인 결정 사항

1. **ip_hash / user_agent_hash 모바일 숨김**: 해시 값은 운영 추적보다 감사 증적 확인 목적이 강하다. 모바일에서는 핵심 정보(action, 관리자, 경로, 결과, 시간)만 표시하여 밀도를 유지한다. 데스크톱에서는 모든 필드를 표시한다.

2. **관리자 UUID 축약**: 관리자가 소수(MVP에서 1명)이므로 UUID 전체를 표시할 필요가 없다. 첫 8자로 식별 가능하며 필터에서 전체 UUID를 선택할 수 있다.

3. **ResultPill 이진 분류**: result는 success/failure로만 구분한다. 운영 이벤트의 severity(info/warn/error)와 달리 감사 로그는 성공/실패만 의미가 있다.

4. **ADMIN_EVENTS와 FilterBar 공유**: 필터 바 컴포넌트 구조가 동일하므로 칩 드롭다운 패턴을 공유한다. 필터 항목 목록만 다르다.

5. **자기 참조 감사**: 감사 로그 조회 자체도 `list_audit_logs` 감사 기록을 남긴다. UI에서 이를 특별히 표시하지는 않으나, 필터에서 확인 가능하다.

---

## Anchor Screen 영향 분석

- **ADMIN_AUDIT_LOGS는 anchor screen이 아니다**
- **Anchor extension 해당 여부**: 해당하지 않음
- **모바일 UX 리스크**: 중간. ADMIN_EVENTS와 유사한 리스크 — 필터 칩 밀림, 긴 action/path 텍스트.

---

## Design Authority

- **UI risk**: `new-screen`
- **Authority status**: `required`
- **Stage 4 evidence path placeholder**:
  - `ui/designs/evidence/admin-foundation/ADMIN_AUDIT_LOGS-mobile.png`
  - `ui/designs/evidence/admin-foundation/ADMIN_AUDIT_LOGS-mobile-narrow.png`
  - `ui/designs/evidence/admin-foundation/ADMIN_AUDIT_LOGS-desktop.png`
- **Authority report path**: `ui/designs/authority/ADMIN_AUDIT_LOGS-authority.md`
- Stage 5: Codex design review → Claude final authority gate

---

## 접근성 노트

- **필터 칩**: 각 `role="combobox"` 또는 `<select>`, 라벨 `aria-label`
- **감사 로그 카드**: `role="article"`, ResultPill에 `aria-label="결과: success"` 등
- **테이블**: `role="table"`, 헤더 `role="columnheader"`
- **해시 값**: `aria-label="IP 해시: sha256:d4e5..."` (시각적으로 축약되더라도 전체 값 접근 가능)
- **결과 카운트**: `aria-live="polite"`
- **색상 대비**: ResultPill success (--olive on --surface-fill) = 5.8:1 (AA 통과), failure (#C62828 on #FFEBEE) = 7.1:1 (AA 통과)
- **터치 타겟**: 필터 칩 44px, 페이지네이션 44x44px

---

## design-critic 검토 필요 항목

- [ ] 감사 로그 카드에서 action + ResultPill + 관리자 + target_type이 320px에서 읽히는지
- [ ] ip_hash/user_agent_hash를 모바일에서 숨기는 것이 운영상 문제 없는지
- [ ] 관리자 UUID 축약 (첫 8자)이 관리자 구분에 충분한지 (MVP 1명이면 충분하나 확장 시)
- [ ] 자기 참조 감사 (감사 로그 조회 → 감사 기록)가 무한 루프 UX 혼란을 일으키지 않는지
- [ ] 감사 로그 양이 많을 때 페이지네이션만으로 탐색이 충분한지 (검색 기능 부재)
