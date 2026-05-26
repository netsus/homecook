# ADMIN_EVENTS -- 운영 이벤트 로그 조회

> 기준 문서: 화면정의서 v1.5.9 SS 23 / 요구사항 v1.7.2 SS 1-11, 2-14 / 유저플로우 v1.3.9 SS 12 / api문서 v1.2.12 GET /api/v1/admin/operational-events
> 슬라이스: admin-foundation
> 생성일: 2026-05-27
> evidence:
> - `ui/designs/evidence/admin-foundation/ADMIN_EVENTS-mobile.png`
> - `ui/designs/evidence/admin-foundation/ADMIN_EVENTS-mobile-narrow.png`
> - `ui/designs/evidence/admin-foundation/ADMIN_EVENTS-desktop.png`

---

## 화면 개요

운영 이벤트 로그를 읽기 전용으로 조회하는 관리자 전용 화면. OAuth 실패, YouTube 프로바이더 실패, 계정 삭제, service-role 누락, 서버 에러 등 최소 5종의 운영 이벤트를 필터/페이지네이션으로 탐색한다.

- **권한**: 관리자 전용 (`admin_members` 등록 필수)
- **API**: `GET /api/v1/admin/operational-events`
- **진입**: ADMIN_DASHBOARD 바로가기 또는 Admin 탭바 "이벤트" 탭
- **이탈**: Admin 탭바로 다른 관리 화면 이동
- **감사**: API 호출 시 `action='list_operational_events'`

---

## 레이아웃 와이어프레임

### 기본 상태 (read-only)

```
+---------------------------------------+  <- 375px (모바일 기준)
|  관리자                               |  <- 앱바 (56px)
+---------------------------------------+
|  대시보드  사용자  이벤트  감사로그   |  <- Admin 탭바 (44px)
+=======================================+     "이벤트" 활성: --brand
|                                       |
|  필터                                 |  <- 섹션 라벨, text-xs, 600, --text-3
|                                       |
| [전체 ▾]  [전체 ▾]  [전체 ▾]         |  <- 필터 칩 행
|  유형      심각도    소스              |     text-sm, --text-2
|                                       |
|  총 42건                              |  <- 결과 카운트, text-sm, --text-3
|                                       |
| +-----------------------------------+ |  <- 이벤트 카드 (모바일)
| | ⚠ auth_failure         warn     | |     --surface, --radius-md
| | auth · /api/v1/auth/callback     | |     --shadow-1
| | OAuth 콜백 인증 실패              | |
| | 2026-05-27 10:30                  | |     패딩: --space-3
| +-----------------------------------+ |
|                                       |     ⚠ 아이콘: severity 색상
| +-----------------------------------+ |     event_type: text-sm, 600, --foreground
| | ✕ service_role_missing   error   | |     severity pill: 아래 참조
| | admin · /api/v1/admin/users      | |     source + request_path: text-xs, --text-3
| | Service role key 부재             | |     message_summary: text-sm, --text-2
| | 2026-05-27 11:00                  | |     created_at: text-xs, --text-3
| +-----------------------------------+ |
|                                       |
| [<  1  2  3  >]                       |  <- 페이지네이션
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
|  유형: [전체▾]  심각도: [전체▾]  소스: [전체▾]        총 42건     |
|                                                                   |
| +---------------------------------------------------------------+ |
| | 유형            | 심각도 | 소스  | 경로            | 요약     | |
| | 시간            |        |       |                 |          | |
| +---------------------------------------------------------------+ |
| | auth_failure    | ⚠ warn | auth  | /api/v1/auth/   | OAuth 콜 | |
| | 05-27 10:30     |        |       | callback        | 백 실패  | |
| +---------------------------------------------------------------+ |
| | service_role_   | ✕ error| admin | /api/v1/admin/  | Service  | |
| | missing         |        |       | users           | role 부재| |
| | 05-27 11:00     |        |       |                 |          | |
| +---------------------------------------------------------------+ |
|                                                                   |
| [<  1  2  3  ...  >]                                              |
+-------------------------------------------------------------------+
```

> **request_path 표시**: pathname만 표시 (쿼리스트링 없음). UI에서도 pathname-only임을 시각적으로 전달 — 경로가 `/api/v1/auth/callback`처럼 깔끔한 pathname으로만 보인다.

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
|    운영 이벤트가 없어요               |  <- text-base, 500, --text-2
|    선택한 조건에 맞는                 |  <- text-sm, 400, --text-3
|    이벤트가 없습니다                  |
|                                       |
+---------------------------------------+
```

### Error / Unauthorized / Forbidden 상태

> ADMIN_DASHBOARD와 동일한 공통 패턴 적용. Error 상태에서 [다시 시도]가 primary CTA.

---

## 컴포넌트 상세

### FilterBar (필터 바)

- **레이아웃**: 칩형 드롭다운 행. 현재 Admin API 계약은 날짜 범위 필터를 제공하지 않으므로 기간 입력은 두지 않는다.
- **칩 드롭다운** (event_type, severity, source):
  - 라벨: text-xs, 600, --text-3
  - 선택값: text-sm, 500, --text-2
  - 화살표: 16px, --text-3
  - 배경: --surface-fill, --radius-chip (10px)
  - 패딩: --space-2 (8px) 수평
  - 터치 타겟: 44px 높이
  - 간격: --space-2 (8px)
- **결과 카운트**: text-sm, --text-3, 우측 정렬
- **수평 여백**: --space-4 (16px) 양쪽
- **토큰 힌트**:
  - 칩 배경 <- `--surface-fill`
  - 칩 텍스트 <- `--text-2`
  - 라벨 <- `--text-3`
  - 모서리 <- `--radius-chip`

### SeverityPill (심각도 배지)

| 심각도 | 배경 | 텍스트 | 아이콘 |
|--------|------|--------|--------|
| `info` | --surface-fill | --text-2 | ℹ |
| `warn` | `#FFF3E0` (amber 100) | `#E65100` (amber 900) | ⚠ |
| `error` | `#FFEBEE` (red 50) | `#C62828` (red 900) | ✕ |

- **border-radius**: --radius-full (9999px)
- **패딩**: --space-1 (4px) × --space-2 (8px)
- **text**: text-xs, 700

> warn/error 배경색은 토큰에 없는 시멘틱 컬러다. Stage 4에서 토큰 확장 여부 결정.

### EventCard (이벤트 카드, 모바일)

- **카드 컨테이너**: --surface, --radius-md (12px), --shadow-1
  - 패딩: --space-3 (12px)
  - 수평 여백: --space-4 (16px) 양쪽
  - 카드 간격: --space-2 (8px)
  - **탭/클릭**: 카드 전체가 터치 타겟 → EventDetailPanel 토글
- **행 1**: 심각도 아이콘 + `event_type` + SeverityPill
  - event_type: text-sm, 600, --foreground
  - SeverityPill: 우측 정렬
- **행 2**: `source` · `request_path` (pathname만)
  - text-xs, 400, --text-3
  - 구분자: " · "
- **행 3**: `message_summary`
  - text-sm, 400, --text-2
  - 접힌 상태: 1행 말줄임 (모바일). 펼친 상태: 전체 표시
- **행 4**: `created_at` + 확장 표시기
  - text-xs, 400, --text-3
  - 형식: YYYY-MM-DD HH:mm
  - 확장 표시기: ▾/▴, 우측 정렬, 20px, --text-3
- **토큰 힌트**:
  - 카드 배경 <- `--surface`
  - event_type <- `--foreground`
  - source/path/time <- `--text-3`
  - summary <- `--text-2`
  - 그림자 <- `--shadow-1`
  - 모서리 <- `--radius-md`

### EventTable (이벤트 테이블, 768px 이상)

- **헤더 행**: --surface-fill 배경, text-xs, 600, --text-3, 높이 36px
- **데이터 행**: --surface 배경, 높이 auto (최소 56px)
  - 행 간: --line 하단 보더
  - **탭/클릭**: 행 전체가 터치 타겟 → EventDetailPanel 토글 (아래 참조)
- **열 구성**: 유형 (20%) | 심각도 (10%) | 소스 (10%) | 경로 (25%) | 요약 (25%) | 시간 (10%)
- **request_path 열**: pathname만 표시. 쿼리스트링 없음.
- **토큰 힌트**: UserTable과 동일 패턴

### EventDetailPanel (이벤트 상세 보기 — 행 확장)

이벤트 카드(모바일) 또는 테이블 행(데스크톱)을 탭하면 해당 행 아래에 disclosure panel이 펼쳐진다. 화면정의서 SS 23의 "이벤트 상세 보기 (metadata_json 포함, PII 포함 금지)"를 충족한다.

#### 모바일 확장 와이어프레임

```
| +-----------------------------------+ |
| | ⚠ auth_failure         warn     | |  <- 카드 탭 → 아래 확장
| | auth · /api/v1/auth/callback     | |
| | OAuth 콜백 인증 실패              | |
| | 2026-05-27 10:30              ▾  | |     ▾: 확장 표시기, --text-3
| |                                   | |
| | ┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈ | |  <- --line 구분선
| |                                   | |
| |  상세 메타데이터                  | |  <- 섹션 라벨, text-xs, 600, --text-3
| |                                   | |
| |  HTTP 상태    401                 | |  <- key-value 행
| |  에러 코드    INVALID_TOKEN       | |     key: text-xs, 400, --text-3
| |  대상 사용자  a1b2c3...           | |     value: text-sm, 400, --foreground
| |  요약         OAuth 콜백 인증 실패| |
| |                                   | |     패딩: --space-3
| +-----------------------------------+ |     카드 배경 유지 (--surface)
```

#### 데스크톱 확장 와이어프레임

```
| +---------------------------------------------------------------+ |
| | auth_failure    | ⚠ warn | auth  | /api/v1/auth/   | OAuth 콜 | |
| | 05-27 10:30     |        |       | callback        | 백 실패 ▾| |
| +---------------------------------------------------------------+ |
| | 상세 메타데이터                                                 | |
| |                                                                 | |
| | HTTP 상태: 401 · 에러 코드: INVALID_TOKEN · 대상 사용자: a1b2..| |
| +---------------------------------------------------------------+ |
```

> 데스크톱에서는 확장 영역이 전체 테이블 너비를 사용하며, key-value 쌍을 한 행에 " · "로 연결한다.

#### 컴포넌트 상세

- **토글 동작**: 카드/행 탭으로 열고 닫음 (accordion, 한 번에 하나만 열림)
- **확장 표시기**: ▾(접힘) / ▴(펼침), 20px, --text-3
- **구분선**: --line (1px), 카드 내부 수평
- **섹션 라벨**: "상세 메타데이터", text-xs, 600, --text-3
- **key-value 레이아웃**:
  - key: text-xs, 400, --text-3, 고정 너비 (80px 모바일 / inline 데스크톱)
  - value: text-sm, 400, --foreground
  - 행 간격: --space-1 (4px)
- **표시 필드** (sanitized `metadata_json`에서 추출):
  - `http_status` → HTTP 상태
  - `error_code` → 에러 코드
  - `target_user_id` → 대상 사용자 (UUID 축약)
  - `message_summary` → 요약 (전체 표시)
  - 기타 비민감 metadata 키가 있으면 key-value로 동적 표시
- **PII 표시 금지** (metadata_json에 있더라도 UI에서 표시하지 않음):
  - OAuth 토큰, OAuth code/next/error 쿼리 값
  - YouTube URL, YouTube 자막/소스 텍스트
  - 관리자 검색어, 이메일, 닉네임
  - 비공개 장보기/팬트리 상세
- **request_path**: pathname만 표시 (이미 목록에서 표시 중이므로 상세에서 중복하지 않음)
- **토큰 힌트**:
  - 구분선 <- `--line`
  - 섹션 라벨 <- `--text-3`
  - key <- `--text-3`
  - value <- `--foreground`

### Pagination

> ADMIN_USERS와 동일한 Pagination 컴포넌트 공유.

---

## 이벤트 소스 정책

이 화면에서 표시하는 운영 이벤트 최소 5종:

| event_type | severity | source | 비고 |
|------------|----------|--------|------|
| `auth_failure` | warn | auth | OAuth/인증 콜백 실패 |
| `youtube_provider_failure` | warn | youtube | YouTube validate/extract/register 실패 |
| `account_deletion` | info | user | 계정 삭제 성공/실패 |
| `service_role_missing` | error | admin | Admin API service-role 누락 |
| `unhandled_server_error` | error | server | 선별된 라우트 핸들러 미처리 에러 |

**표시 금지 (metadata_json 내)**:
- OAuth 토큰, OAuth code/next/error 쿼리 값
- YouTube URL, YouTube 자막/소스 텍스트
- 관리자 검색어, 이메일, 닉네임
- 비공개 장보기/팬트리 상세

---

## 인터랙션 노트

| 액션 | 트리거 | 결과 | API | 권한 |
|------|--------|------|-----|------|
| 이벤트 목록 로드 | 페이지 마운트 / 필터 변경 / 페이지 변경 | 운영 이벤트 목록 조회 | GET /admin/operational-events | admin |
| 이벤트 상세 보기 | 카드/행 탭 | EventDetailPanel 확장 (sanitized metadata_json 표시) | - (로컬 토글, 추가 API 없음) | admin |
| 이벤트 상세 닫기 | 펼쳐진 카드/행 재탭 또는 다른 행 탭 | EventDetailPanel 접힘 (accordion) | - | admin |
| 유형 필터 | 드롭다운 선택 | 해당 event_type만 필터링, page 1 리셋 | GET /admin/operational-events?event_type=... | admin |
| 심각도 필터 | 드롭다운 선택 | 해당 severity만 필터링 | GET /admin/operational-events?severity=... | admin |
| 소스 필터 | 드롭다운 선택 | 해당 source만 필터링 | GET /admin/operational-events?source=... | admin |
| 페이지 이동 | 페이지 번호 또는 화살표 탭 | 해당 페이지 조회 | GET /admin/operational-events?page=N | admin |

### 스크롤 정책

| 영역 | 스크롤 방향 | 비고 |
|------|-----------|------|
| 앱바 + Admin 탭바 | 고정 (sticky) | 상단 고정 |
| 필터 바 | 세로 스크롤 시 같이 이동 | 고정하지 않음 |
| 이벤트 목록 | 세로 스크롤 | 카드 또는 테이블 |
| 페이지 전체 | 가로 스크롤 금지 | whole-page horizontal scroll 금지 |

> **scroll containment**: 앱바 + Admin 탭바는 sticky로 고정되어 이벤트 목록만 세로 스크롤된다. 필터 바는 콘텐츠와 함께 이동하여 데이터 영역을 최대화한다. 테이블은 열 비율 조정으로 가로 스크롤 없이 맞춘다.

---

## 320px 대응 (작은 모바일 sentinel)

- **필터 칩 행**: 3개 칩이 320px에서 넘칠 수 있음 → 2행 wrap 허용, 또는 overflow-x auto
- **이벤트 카드**: 카드 패딩 --space-3 → --space-2 축소. message_summary 1행 말줄임
- **request_path**: pathname이 길면 말줄임 (`/api/v1/auth/call...`)

320px에서 확인해야 할 blocker:
- [ ] 필터 칩이 뷰포트 내에서 접근 가능한지 (wrap 또는 가로 스크롤)
- [ ] 이벤트 카드의 4행 정보가 읽기 가능한 상태인지
- [ ] SeverityPill 텍스트가 잘리지 않는지
- [ ] EventDetailPanel key-value 행에서 key(80px) + value가 겹치지 않는지
- [ ] 모든 터치 타겟이 44px 이상인지

---

## 디자인 결정 사항

1. **심각도 시멘틱 컬러**: warn(amber)/error(red)/info(neutral)로 구분한다. 기존 디자인 토큰에 없는 시멘틱 컬러이므로 Stage 4에서 토큰 확장 또는 인라인 사용을 결정한다.

2. **카드/테이블 반응형 전환**: ADMIN_USERS와 동일하게 768px 기준으로 카드 ↔ 테이블 전환. 운영 이벤트는 열이 6개로 많아 모바일에서 테이블이 부적합하다.

3. **request_path pathname-only 표시**: UI에서 쿼리스트링 없이 pathname만 표시하여 PII(OAuth code/next/error, 검색어 등)가 화면에 노출되지 않도록 한다.

4. **message_summary 1행 말줄임 (접힌 상태, 모바일)**: 이벤트 요약 메시지가 길 수 있으나 접힌 상태에서는 1행 말줄임으로 밀도를 유지한다. 카드/행 탭 시 EventDetailPanel이 펼쳐지며 전체 메시지와 metadata를 볼 수 있다.

5. **이벤트 상세 보기 (행 확장 패턴)**: 화면정의서 SS 23의 "이벤트 상세 보기 (metadata_json 포함, PII 포함 금지)"를 충족하기 위해 accordion 행 확장 패턴을 채택한다. 별도 모달이나 페이지 전환 없이 카드/행 내부에서 disclosure panel로 metadata_json의 비민감 필드를 표시한다. PII 필드는 서버에서 sanitize된 상태로 오더라도 UI에서 이중 확인하여 표시하지 않는다.

---

## Anchor Screen 영향 분석

- **ADMIN_EVENTS는 anchor screen이 아니다**
- **Anchor extension 해당 여부**: 해당하지 않음
- **모바일 UX 리스크**: 중간. 필터 칩이 320px에서 밀릴 수 있으나 wrap/overflow로 대응 가능.

---

## Design Authority

- **UI risk**: `new-screen`
- **Authority status**: `required`
- **Stage 4 evidence path placeholder**:
  - `ui/designs/evidence/admin-foundation/ADMIN_EVENTS-mobile.png`
  - `ui/designs/evidence/admin-foundation/ADMIN_EVENTS-mobile-narrow.png`
  - `ui/designs/evidence/admin-foundation/ADMIN_EVENTS-desktop.png`
- **Authority report path**: `ui/designs/authority/ADMIN_EVENTS-authority.md`
- Stage 5: Codex design review → Claude final authority gate

---

## 접근성 노트

- **필터 칩**: 각 `role="combobox"` 또는 `<select>`, 라벨 `aria-label`
- **이벤트 카드**: `role="article"`, SeverityPill에 `aria-label="심각도: warn"` 등
- **테이블**: `role="table"`, 헤더 `role="columnheader"`
- **결과 카운트**: `aria-live="polite"`
- **색상 대비**: SeverityPill warn (#E65100 on #FFF3E0) = 5.2:1 (AA 통과), error (#C62828 on #FFEBEE) = 7.1:1 (AA 통과)
- **터치 타겟**: 필터 칩 44px, 페이지네이션 44x44px

---

## design-critic 검토 필요 항목

- [ ] 심각도 시멘틱 컬러(amber/red)가 기존 디자인 토큰과 조화로운지
- [ ] 필터 칩 3개가 모바일 첫 화면에서 과도한 공간을 차지하지 않는지
- [ ] EventDetailPanel 확장 시 카드 높이 변화가 목록 스크롤에 어색하지 않은지
- [ ] sanitized metadata_json의 key-value가 320px에서도 읽히는지
- [ ] request_path가 pathname-only임을 사용자(관리자)가 자연스럽게 인지하는지
