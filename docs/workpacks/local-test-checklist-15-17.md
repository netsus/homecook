# Local Test Checklist: Cook, Leftovers, Mypage Slices 15-17

이 체크리스트는 로컬 브라우저에서 `slice15a`, `slice15b`, `slice16`, `slice17a`, `slice17b`, `slice17c`가 함께 제대로 동작하는지 확인하기 위한 수동 점검표다.

## 준비

- [ ] 최신 작업 기준 브랜치인지 확인한다.
- [ ] 의존성을 설치한다:
  ```bash
  pnpm install
  ```
- [ ] 핵심 자동 회귀 테스트를 먼저 돌린다:
  ```bash
  pnpm test:product tests/cook-session-start.backend.test.ts tests/cook-planner-complete.backend.test.ts tests/cook-standalone-complete.backend.test.ts tests/cook-mode-screen.test.tsx tests/standalone-cook-mode-screen.test.tsx tests/leftovers.backend.test.ts tests/leftovers.frontend.test.tsx tests/mypage.backend.test.ts tests/mypage-screen.test.tsx tests/recipebook-detail.backend.test.ts tests/recipe-book-detail-screen.test.tsx tests/settings-account.backend.test.ts tests/settings-screen.test.tsx
  pnpm exec playwright test tests/e2e/slice-15a-cook-planner-complete.spec.ts tests/e2e/slice-15b-cook-standalone-complete.spec.ts tests/e2e/slice-16-leftovers.spec.ts tests/e2e/slice-17a-mypage.spec.ts tests/e2e/slice-17b-recipebook-detail.spec.ts tests/e2e/slice-17c-settings.spec.ts --grep-invert '@live-oauth'
  ```
- [ ] 깨끗한 demo 데이터가 필요하면 초기화한다:
  ```bash
  pnpm local:reset:demo
  ```
- [ ] 실제 로컬 Supabase 기반으로 브라우저 smoke를 할 경우 서버를 띄운다:
  ```bash
  NEXT_PUBLIC_APP_URL=http://127.0.0.1:3117 pnpm dev:local-supabase --hostname 127.0.0.1 --port 3117
  ```
- [ ] 빠른 데모 서버만 필요하면 reset 포함 데모 서버를 띄운다:
  ```bash
  pnpm dev:demo:reset
  ```
- [ ] 브라우저에서 실행 중인 로컬 URL에 접속하고, 로그인/테스트 유저 상태를 확인한다.
- [ ] 테스트 데이터에 아래 항목이 있는지 확인한다:
  - [ ] `shopping_done` 상태의 식사와 시작 가능한 요리 세션
  - [ ] 레시피 상세에서 바로 요리할 수 있는 레시피
  - [ ] 팬트리에 소진 가능한 재료
  - [ ] `leftover`, `eaten`, 30일 초과 `eaten` 남은요리 데이터
  - [ ] 시스템 레시피북 3개(`my_added`, `saved`, `liked`)와 커스텀 레시피북
  - [ ] 장보기 기록

## Slice 15a: Planner Cook Complete

- [ ] `COOK_READY_LIST`에서 [요리하기]를 눌러 세션 기반 `COOK_MODE`로 진입한다.
- [ ] 재료 화면에 조리 인분이 읽기 전용으로 보이고, 인분 조절 UI가 없다.
- [ ] 과정 화면에 조리 스텝과 조리방법 색상이 표시된다.
- [ ] 좌우 스와이프 또는 탭으로 재료 화면과 과정 화면을 전환할 수 있다.
- [ ] [요리 완료]를 누르면 소진 재료 체크리스트 팝업이 열린다.
- [ ] 소진 재료 체크리스트의 기본값은 모두 해제 상태다.
- [ ] 소진 재료를 하나도 선택하지 않고 완료하면 팬트리 항목이 삭제되지 않는다.
- [ ] 소진 재료를 선택하고 완료하면 선택한 재료만 팬트리에서 삭제된다.
- [ ] 완료 후 `COOK_READY_LIST`로 돌아가고 완료된 레시피가 목록에서 사라진다.
- [ ] 플래너에서 해당 식사의 상태가 `cook_done`으로 반영된다.
- [ ] 완료 후 `leftover_dishes`에 `status='leftover'` 항목이 생성된다.
- [ ] 완료 후 `recipes.cook_count`가 1 증가한다.
- [ ] 이미 완료된 세션에 complete 요청을 반복해도 중복 leftover 또는 중복 cook_count 증가가 없다.
- [ ] [취소]를 누르면 세션이 취소되고 `COOK_READY_LIST`로 돌아간다.
- [ ] 비로그인 또는 세션 만료 상태에서 보호 액션을 시도하면 로그인 게이트가 뜨고, 로그인 후 같은 `COOK_MODE`로 복귀한다.
- [ ] 존재하지 않는 세션 URL로 접근하면 에러 안내 또는 이전 화면 복귀가 동작한다.

## Slice 15b: Standalone Cook Complete

- [ ] `RECIPE_DETAIL`에서 [요리하기]를 누르면 `/cooking/recipes/{recipe_id}/cook-mode?servings=N` 경로로 이동한다.
- [ ] 비로그인 상태에서도 독립 요리 `COOK_MODE` 데이터는 조회되어 재료와 스텝이 보인다.
- [ ] 독립 요리 화면에도 조리 인분은 읽기 전용이며 인분 조절 UI가 없다.
- [ ] 좌우 스와이프 또는 탭으로 재료 화면과 과정 화면을 전환할 수 있다.
- [ ] 비로그인 상태에서 [요리 완료]를 누르면 로그인 게이트가 뜨고, 로그인 후 독립 요리 화면으로 복귀한다.
- [ ] 로그인 상태에서 [요리 완료]를 누르면 소진 재료 체크리스트 팝업이 열린다.
- [ ] 완료하면 `leftover_dishes`에 `status='leftover'` 항목이 생성된다.
- [ ] 완료하면 선택한 재료만 팬트리에서 삭제되고, 선택하지 않으면 팬트리 변동이 없다.
- [ ] 완료하면 `recipes.cook_count`가 1 증가한다.
- [ ] 독립 요리 완료는 `meals.status`를 바꾸지 않는다.
- [ ] 독립 요리 완료는 `cooking_sessions`를 생성하지 않는다.
- [ ] 중복 제출 방지가 동작해 빠른 더블 클릭으로 leftover가 중복 생성되지 않는다.
- [ ] [취소]를 누르면 cancel API 호출 없이 `RECIPE_DETAIL`로 돌아간다.
- [ ] 존재하지 않는 레시피 또는 잘못된 `servings` 값에서는 적절한 에러가 보인다.

## Slice 16: Leftovers

- [ ] `PLANNER_WEEK`의 [남은요리] 링크 또는 `/leftovers`로 `LEFTOVERS` 화면에 진입한다.
- [ ] 남은요리 목록이 최근 요리순으로 표시된다.
- [ ] 각 카드에 레시피명, 요리완료일, [다먹음], [플래너에 추가]가 보인다.
- [ ] 남은요리가 없을 때 empty 안내가 보인다.
- [ ] [다먹음]을 누르면 항목이 `eaten`으로 전이되고 `LEFTOVERS` 목록에서 사라진다.
- [ ] `/leftovers/ate` 또는 다먹은 목록 진입 시 다먹은 항목이 최신순으로 보인다.
- [ ] `ATE_LIST`에서 [덜먹음]을 누르면 항목이 `leftover`로 돌아오고 `LEFTOVERS`에 다시 보인다.
- [ ] [플래너에 추가]를 누르면 날짜, 끼니, 인분 선택 UI가 열린다.
- [ ] 남은요리를 플래너에 추가하면 새 meal이 생성되고 `is_leftover=true`, `leftover_dish_id`가 반영된다.
- [ ] 플래너에 추가한 남은요리가 `PLANNER_WEEK`에서 남은요리 식사로 식별된다.
- [ ] 30일이 지난 `eaten` 항목은 `ATE_LIST`에서 보이지 않는다.
- [ ] 비로그인 상태로 접근하면 로그인 게이트가 뜨고, 로그인 후 원래 화면으로 복귀한다.
- [ ] 네트워크 실패 또는 API 실패 시 에러 안내와 재시도가 동작한다.

## Slice 17a: Mypage Overview And History

- [ ] 하단 탭 또는 `/mypage`로 `MYPAGE`에 진입한다.
- [ ] 상단에 닉네임, 프로필 이미지, 소셜 제공자가 표시된다.
- [ ] 기본 탭은 레시피북 탭이다.
- [ ] 시스템 레시피북 3개(`내가 추가한 레시피`, `저장한 레시피`, `좋아요한 레시피`)가 표시된다.
- [ ] 각 레시피북의 `recipe_count`가 실제 데이터와 맞다.
- [ ] 커스텀 레시피북이 시스템 레시피북 아래에 표시된다.
- [ ] 커스텀 레시피북이 없으면 empty 안내와 [새 레시피북 만들기]가 보인다.
- [ ] [새 레시피북]으로 커스텀 레시피북을 생성할 수 있다.
- [ ] 커스텀 레시피북의 메뉴에서 이름을 변경할 수 있다.
- [ ] 커스텀 레시피북의 메뉴에서 삭제할 수 있다.
- [ ] 시스템 레시피북은 이름 변경과 삭제 액션이 불가능하거나 API에서 403으로 막힌다.
- [ ] 장보기 기록 탭으로 전환하면 목록이 최신순으로 표시된다.
- [ ] 장보기 기록이 없으면 empty 안내가 보인다.
- [ ] 장보기 기록 항목을 누르면 `SHOPPING_DETAIL` read-only 모드로 이동한다.
- [ ] 비로그인 상태로 접근하면 로그인 게이트가 뜨고, 로그인 후 `MYPAGE`로 복귀한다.
- [ ] 데이터 로드 실패 시 에러 안내와 [다시 시도]가 동작한다.

## Slice 17b: Recipebook Detail Remove

- [ ] `MYPAGE` 레시피북 탭에서 레시피북을 누르면 `/mypage/recipe-books/{book_id}` 상세 화면으로 이동한다.
- [ ] 레시피북 상세에 레시피 목록이 최신 추가순으로 표시된다.
- [ ] 레시피 카드 클릭 시 `RECIPE_DETAIL`로 이동한다.
- [ ] 레시피가 없으면 empty 안내가 보인다.
- [ ] saved 책에서 [제거]를 누르면 레시피가 목록에서 사라지고 `save_count`가 감소한다.
- [ ] custom 책에서 [제거]를 누르면 레시피가 목록에서 사라지고 `save_count`가 감소한다.
- [ ] liked 책에서 제거 액션을 누르면 좋아요가 해제되고 `like_count`가 감소한다.
- [ ] `my_added` 책에서는 제거 버튼이 표시되지 않는다.
- [ ] `my_added` 책 제거 API를 직접 시도하면 403이 반환된다.
- [ ] 이미 제거한 레시피를 다시 제거하면 404가 반환된다.
- [ ] "더 보기" 또는 무한 스크롤이 있다면 다음 페이지가 중복 없이 로드된다.
- [ ] 제거 실패 시 optimistic UI가 잘못 고정되지 않고 에러가 표시된다.
- [ ] 비로그인 상태로 접근하면 로그인 게이트가 뜨고, 로그인 후 같은 상세 화면으로 복귀한다.
- [ ] 존재하지 않는 레시피북 URL은 404 또는 적절한 에러 상태로 처리된다.

## Slice 17c: Settings Account

- [ ] `MYPAGE`의 톱니바퀴 버튼을 누르면 `/settings` 화면으로 이동한다.
- [ ] 설정 로딩 중 skeleton이 보인다.
- [ ] 화면 꺼짐 방지 토글이 현재 `settings_json.screen_wake_lock` 값을 반영한다.
- [ ] 토글을 변경하면 즉시 서버에 저장된다.
- [ ] 토글 변경 후 새로고침해도 값이 유지된다.
- [ ] 토글 저장 실패 시 값이 원래대로 되돌아가고 에러가 표시된다.
- [ ] 닉네임 변경 UI를 열면 현재 닉네임이 보이고 입력에 포커스된다.
- [ ] 2자 미만 또는 30자 초과 닉네임은 저장되지 않고 검증 메시지가 보인다.
- [ ] 유효한 닉네임을 저장하면 `MYPAGE`에서도 새 닉네임이 보인다.
- [ ] 로그아웃 버튼을 누르면 확인 후 세션이 정리되고 HOME으로 이동한다.
- [ ] 로그아웃 실패 시 HOME으로 이동하지 않고 에러가 보인다.
- [ ] 회원 탈퇴 버튼을 누르면 확인 다이얼로그가 먼저 뜬다.
- [ ] 회원 탈퇴를 확정하면 `users.deleted_at`이 설정되고 HOME으로 이동한다.
- [ ] 회원 탈퇴 실패 또는 탈퇴 후 로그아웃 cleanup 실패 시 화면에 남고 에러가 보인다.
- [ ] 비로그인 상태로 `/settings`에 직접 접근하면 로그인 게이트가 뜨고, 로그인 후 `/settings`로 복귀한다.
- [ ] 뒤로가기 버튼은 `/mypage`로 이동한다.

## Slice 15-17 통합 흐름

- [ ] 플래너 경유 요리 완료(15a) 후 생성된 남은요리가 `LEFTOVERS`(16)에 보인다.
- [ ] 독립 요리 완료(15b) 후 생성된 남은요리가 `LEFTOVERS`(16)에 보인다.
- [ ] `LEFTOVERS`에서 플래너에 추가한 남은요리가 플래너에 등록되고, 이후 플래너 경유 요리 흐름과 충돌하지 않는다.
- [ ] 요리 완료 시 팬트리 소진 결과가 팬트리 화면과 다음 요리 소진 체크리스트에 자연스럽게 반영된다.
- [ ] 레시피북 상세(17b)에서 레시피를 제거한 뒤 `MYPAGE`(17a)로 돌아가면 `recipe_count`가 갱신된다.
- [ ] 로그아웃(17c) 후 `MYPAGE`, `LEFTOVERS`, `SETTINGS`, 보호된 완료 액션이 모두 로그인 게이트로 이어진다.
- [ ] 로그인 후 return-to-action이 각각 원래 화면 또는 원래 액션으로 복귀한다.
- [ ] 브라우저 콘솔에 예상치 못한 `pageerror` 또는 API wrapper 밖 에러가 없다.
- [ ] 모바일 폭 320px와 일반 모바일 폭 375px에서 하단 탭, 고정 CTA, 팝업, 리스트 카드가 서로 겹치지 않는다.

## 선택 수동 확인

- [ ] `pnpm test:e2e:oauth`로 live OAuth 시나리오를 별도 실행한다. 실제 외부 OAuth 설정이 있을 때만 수행한다.
- [ ] 실기기 모바일 브라우저에서 `COOK_MODE` 전체화면 스와이프, `LEFTOVERS` 카드 액션, `MYPAGE` 탭 전환, `SETTINGS` 토글 UX를 확인한다.
- [ ] 회원 탈퇴 후 동일 소셜 계정으로 재가입 가능 여부를 확인한다.
- [ ] 실제 시간 조작 또는 장기 테스트로 30일 경과 `eaten` 항목 숨김을 확인한다.

## 완료 기준

- [ ] 위 항목 중 실패한 항목이 없다.
- [ ] 실패 항목이 있으면 화면 이름, URL, 관련 id(`session_id`, `recipe_id`, `leftover_id`, `book_id`), 콘솔 에러, 네트워크 응답 코드를 기록했다.
- [ ] 자동 테스트와 수동 테스트 결과가 같은 계약을 말한다.
- [ ] 15a/15b의 플래너 요리와 독립 요리 상태 전이가 섞이지 않는다.
- [ ] 16의 남은요리 상태 전이와 플래너 재등록이 실제 데이터에 남는다.
- [ ] 17a/17b/17c의 계정, 레시피북, 설정 흐름이 로그인 게이트와 소유자 검증을 지킨다.
