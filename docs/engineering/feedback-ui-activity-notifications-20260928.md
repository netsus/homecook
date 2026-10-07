# 화면 정리·활동 알림 (2026-09-28 후속)

현재 상태: `codex/mumeok-ui-notification-feedback-20260928`에 누적, **미배포**. 앞선 웹 배포 `8d9dc57efe22`와 구분한다. 운영 데이터·설정 변경 없음.

## 화면 계약

- 요리계획은 캘린더/이번 주 장보기 기록 묶음 다음에 등록·장보기 완료·요리 완료 상태 합계를 표시한다. 끼니 상세의 추가는 44px 테두리 버튼이다.
- 커스텀 레시피북도 실제 열람 가능한 레시피 수를 표지에 표시한다. 옵션은 배경과 대비되는 점 세 개와 44px 클릭 영역을 쓴다.
- 식사 기록은 날짜를 즉시 유지하고 기록 영역만 스켈레톤으로 표시한다. 반복 로딩 문구를 추가하지 않는다.
- 계획·식사 기록 kcal/g는 반올림한 정수로 표시한다. 저장값, 계산, 수정 입력의 소수점 정밀도는 보존한다.
- 식사 기록 하루 요약 카드 주변 중복 선과 목록 삭제 버튼을 제거한다. 음식별 kcal와 끼니 합계는 오른쪽에 크게 표시한다. 삭제는 상세에 있고 상세의 +는 같은 날짜·끼니에 추가한다.
- 먹은 음식 선택에서 완성 무게가 없으면 날짜와 ‘무게 입력 필요’, 입력 동작만 표시한다. 제품·재료 검색의 반복 설명은 제거한다.
- 요리모드는 제목·조리 단계·취소/완료 동작을 한 스크롤 영역 안에 둔다. 제목과 버튼의 고정 및 본문 내부 이중 스크롤을 제거한다.

## 무게가 없는 음식

옛 기록에만 한정되지 않는다. 스냅샷이 없거나, 정량 재료 중 하나라도 승인된 g 환산 근거(개당 무게·밀도 등)가 없으면 전체 재료 무게 합×0.75를 계산하지 않는다. 일부 재료만으로 총중량을 만들지 않는다. 해당 음식은 무게 입력 후 g 식사 기록이 가능하다.

## 종 모양 알림

요리계획 등록, 장보기 목록 생성/완료, 요리 완료, 실제 팬트리 차감, 식사 기록, 다 먹음의 성공을 계정별 영속 활동 기록으로 저장한다. YouTube 추출 결과는 기존 영속 알림 목록을 계속 사용한다.

- 실제 도메인 저장 트랜잭션에 함께 기록하므로 실패·롤백은 알림도 남기지 않는다.
- 같은 계정 세대·이벤트 종류·원본 ID는 하나만 기록한다. 재시도로 성공 알림을 중복 생성하지 않는다.
- 팬트리 차감 문구는 요리 완료 시 실제 차감된 항목으로 작성하며, 선택 후보나 클라이언트 문구를 신뢰하지 않는다.
- ‘새 알림’과 ‘지난 알림’에 표시한다. 화면에 보인 행만 읽음 처리하고 서버가 반환한 미확인 수로 배지를 갱신한다. 다음 페이지와 재시도 동작을 제공한다.
- 로그아웃·계정 전환 시 로컬 목록/배지를 즉시 비우고 이전 요청 결과를 무시한다. 탈퇴 시 해당 계정 세대의 활동 알림을 정리한다.
- 기존 브라우저 CustomEvent는 목록을 새로 읽는 신호로만 쓴다. 임의 메시지를 저장하거나 브라우저 저장소로 영속화하지 않는다.
- 새 기능 배포 이전의 과거 활동을 소급 생성하지 않는다.

## API·DB

`GET /api/v1/users/me/action-notifications?view=unseen|archive&limit=30&cursor=...` → 표준 success/data/error 래퍼. data는 `items`, `next_cursor`, `has_next`, `unread_count`.

각 행: `id`, `event_type`, `title`, `message`, `target_path`, `created_at`, `seen_at`.

`POST /api/v1/users/me/action-notifications/seen` body `{ids: UUID[]}` → data `{seen_ids: UUID[], unread_count: number}`. 타인/이전 계정 세대 행에는 영향을 주지 않는다.

`public.action_notifications`는 소유자와 계정 세대를 보유한다. 브라우저 직접 테이블 접근/쓰기 권한을 주지 않는다. 검증된 세션 권한과 정확한 내부 RPC 범위로만 조회·읽음 처리한다. 새 migration `20260928020000_action_notifications.sql`과 웹은 다음 묶음 배포에서 함께 반영해야 한다.

## 확인 범위

- 합친 변경의 관련 단위/컴포넌트/API/격리 PG 검사 145개 통과. 별도 화면 담당의 요리/계획/북 검사도 통과했다.
- 최종 브라우저 검사: 375px·1280px 식사 기록/추가 동작 2개, 단일 요리 스크롤 1개, 알림 읽음→새로고침→지난 기록 2개 통과. 알림 브라우저 검사는 로컬 API fixture를 사용한다.
- 타입 검사, 알림 변경 파일 ESLint, diff 검사 통과.
- 운영 데이터 없는 실제 전체 스키마의 격리 DB에서 신규/기존 요리 완료·실제 팬트리 차감·식사 기록/소진·장보기, 재시도 중복 방지·중간 실패 롤백·타인/다른 계정 세대 차단·탈퇴 정리 검증 통과. 검사 후 격리 컨테이너를 제거했다.
- SQL SHA256: `b9a4196ceb117fd342143e6ecb945412f7c6e5094342cf1ce76da3f3e260bd0f`. 격리 검증 보고서는 `.omx/reports/action-notifications-full-schema.json`.
- 운영 알림 생성과 실제 iPhone 확인은 배포 후 남아 있다. 이번에는 production 빌드/배포·운영 백업·운영 데이터 변경을 실행하지 않았다.

## 주요 변경 파일

- `components/planner/{planner-week-screen,planner-week-board,meal-screen,meal-log-screen,meal-log-add-sheet,meal-log-nutrition-chart}.tsx`: 배치·추가 동작·간소화·영양 표시.
- `components/mypage/{mypage-screen,mypage-mobile-screen}.tsx`, `app/globals.css`: 북 개수와 옵션 대비.
- `components/cooking/{snapshot-v2-cook-mode-view,cook-mode-mobile-ui,cook-mode-loading-board}.tsx`: 단일 스크롤.
- `components/notifications/use-action-notifications.ts`, `components/youtube-extraction/youtube-extraction-notification-center.tsx`, `stores/action-notification-store.ts`: 영속 목록과 읽음·배지·계정 전환.
- `lib/api/action-notifications.ts`, `lib/server/action-notifications.ts`, `app/api/v1/users/me/action-notifications/`: API 연동과 권한 검사.
- `lib/api/{meal,product-planner-entry,shopping,cooking,meal-log,leftovers,mypage}.ts`: 성공 시 갱신·로그아웃/탈퇴 시 초기화.
- `supabase/migrations/20260928020000_action_notifications.sql`: 영속 기록·원자성·소유자/계정 세대 보호.
