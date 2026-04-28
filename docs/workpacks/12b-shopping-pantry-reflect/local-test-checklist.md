# Local Test Checklist: Shopping Slices 10-12

이 체크리스트는 로컬 브라우저에서 `slice10a`, `slice10b`, `slice11`, `slice12a`, `slice12b`가 함께 제대로 동작하는지 확인하기 위한 수동 점검표다.

## 준비

- [ ] 최신 `master` 기준인지 확인한다: `git switch master && git pull --ff-only`
- [ ] 의존성을 설치한다: `pnpm install`
- [ ] 빠른 자동 회귀 테스트를 먼저 돌린다:
  ```bash
  pnpm test:product tests/shopping-detail.backend.test.ts tests/shopping-share-text.backend.test.ts tests/shopping-reorder.backend.test.ts tests/shopping-complete.backend.test.ts tests/shopping-detail.frontend.test.tsx tests/shopping-flow-screen.test.tsx
  pnpm exec playwright test tests/e2e/slice-09-shopping-preview-create.spec.ts tests/e2e/slice-10a-shopping-detail-interact.spec.ts tests/e2e/slice-10b-shopping-share-text.spec.ts tests/e2e/slice-11-shopping-reorder.spec.ts tests/e2e/slice-12a-shopping-complete.spec.ts tests/e2e/slice-12b-shopping-pantry-reflect.spec.ts --grep-invert '@live-oauth'
  ```
- [ ] 실제 로컬 DB smoke를 할 경우 demo seed와 local Supabase 서버를 준비한다:
  ```bash
  node scripts/local-seed-demo-data.mjs --start-date 2026-04-27
  NEXT_PUBLIC_APP_URL=http://localhost:3105 pnpm exec node scripts/dev-local-supabase.mjs -H 127.0.0.1 -p 3105
  ```
- [ ] 브라우저에서 `http://localhost:3105`에 접속하고 로그인/테스트 유저 상태를 확인한다.

## Slice 09-12 통합 생성 흐름

- [ ] 플래너에서 같은 레시피가 여러 날짜에 등록되어 있으면 `SHOPPING_FLOW`에서 레시피별 1행으로 합산되어 보인다.
- [ ] 예: 4/28 김치찌개 3인분 + 4/29 김치찌개 3인분은 `합산 계획 6인분`으로 보인다.
- [ ] `장보기 기준 인분` 기본값은 합산 계획 인분과 같다.
- [ ] `장보기 목록 만들기` 후 생성된 상세 화면 `/shopping/lists/{id}`로 이동한다.
- [ ] 플래너로 돌아와도 연결된 장보기 목록을 다시 여는 임시 `장보기 보기` 링크가 보인다.
  - 향후 마이페이지에 장보기목록 탭이 생기면 이 접근 경로는 그 탭으로 대체한다.

## Slice 10a: Shopping Detail Interact

- [ ] 장보기 상세 화면에 진입하면 제목, 날짜 범위, 구매 섹션, 팬트리 제외 섹션이 보인다.
- [ ] 구매 섹션 항목이 `sort_order ASC`, 동일하면 `id ASC` 순서로 표시된다.
- [ ] 구매 항목 체크를 켜고 끄면 화면 상태가 즉시 바뀌고 새로고침 후에도 유지된다.
- [ ] 구매 항목을 팬트리 제외로 보내면 제외 섹션으로 이동하고 `is_checked=false`로 정리된다.
- [ ] 팬트리 제외 항목을 다시 구매 섹션으로 되살릴 수 있다.
- [ ] 구매 섹션이 비면 "팬트리에 이미 있어서 장볼 재료가 없어요" 계열 empty 상태가 보인다.
- [ ] 완료된 리스트를 열면 체크/제외 조작이 비활성화되고 read-only 안내가 보인다.
- [ ] 비로그인 또는 세션 만료 상태에서 보호 흐름이 로그인 안내로 이어진다.

## Slice 10b: Shopping Share Text

- [ ] `SHOPPING_DETAIL` 상단의 `공유(텍스트)` 버튼이 보인다.
- [ ] 공유 버튼을 누르면 구매 섹션 항목만 공유 텍스트에 포함된다.
- [ ] 체크된 항목은 `☑`, 체크되지 않은 항목은 `☐`로 공유된다.
- [ ] `is_pantry_excluded=true` 항목은 공유 텍스트에 포함되지 않는다.
- [ ] 공유 텍스트는 리스트 제목/날짜와 체크리스트 항목을 읽기 쉬운 줄바꿈으로 만든다.
- [ ] Web Share API가 가능한 환경에서는 OS 공유 시트가 열린다.
- [ ] Web Share API가 불가능한 환경에서는 클립보드 복사와 성공 toast가 동작한다.
- [ ] 구매 섹션이 비어 있으면 빈 공유에 대한 안내 toast가 보인다.
- [ ] 완료된 read-only 리스트에서도 공유는 가능하다.

## Slice 11: Shopping Reorder

- [ ] 미완료 리스트의 각 구매 항목에 위/아래 이동 컨트롤이 보인다.
- [ ] 첫 항목의 위 이동, 마지막 항목의 아래 이동은 비활성화되거나 숨겨진다.
- [ ] 항목을 위/아래로 이동하면 화면 순서가 바뀌고 저장된다.
- [ ] 새로고침하거나 상세 화면에 다시 들어와도 변경된 순서가 유지된다.
- [ ] 이동 API 실패 상황에서는 에러 메시지가 보이고 순서가 잘못 고정되지 않는다.
- [ ] 완료된 리스트에서는 순서 변경 컨트롤이 비활성화되거나 숨겨진다.
- [ ] 완료된 리스트에 reorder API를 직접 시도하면 `409 CONFLICT`가 반환된다.

## Slice 12a: Shopping Complete Core

- [ ] 미완료 리스트에서는 하단 `장보기 완료` 버튼이 보인다.
- [ ] `장보기 완료`를 누르면 12b 팬트리 반영 팝업이 먼저 열린다.
- [ ] 팝업에서 완료를 확정하면 성공 toast가 보이고 리스트가 read-only로 전환된다.
- [ ] 완료 후 `장보기 완료` 버튼은 사라진다.
- [ ] 완료 후 체크/제외/순서 변경 컨트롤은 비활성화된다.
- [ ] 완료된 read-only 화면에서 `플래너로 돌아가기` 버튼으로 플래너에 복귀할 수 있다.
- [ ] 플래너로 돌아가면 연결된 식사가 `장보기 완료` 또는 `shopping_done` 상태로 표시된다.
- [ ] 같은 리스트에 완료 API를 다시 호출해도 `200` 멱등 응답이 유지된다.
- [ ] 완료된 리스트의 체크/제외/순서 변경 API는 `409`를 반환한다.

## Slice 12b: Shopping Pantry Reflect

- [ ] 완료 전 팝업 제목 `팬트리에 추가할까요?`가 보인다.
- [ ] 체크되어 있고 팬트리 제외가 아닌 항목만 팝업 선택 대상에 보인다.
- [ ] 기본 선택은 `모두 추가`이며 API body는 미전달 또는 `undefined` 의미를 유지한다.
- [ ] `모두 추가`로 완료하면 유효 항목이 팬트리에 반영되고 성공 toast에 팬트리 추가 개수가 보인다.
- [ ] `선택 추가`를 고르면 항목 리스트가 보이고 선택한 항목만 `add_to_pantry_item_ids`로 전달된다.
- [ ] 선택을 모두 해제하면 완료 버튼이 비활성화된다.
- [ ] `추가 안 함`으로 완료하면 `add_to_pantry_item_ids: []` 의미가 유지되고 팬트리 추가 개수는 표시되지 않는다.
- [ ] 체크된 유효 항목이 없으면 `추가 안 함`이 기본 상태이고 `모두 추가` / `선택 추가`는 비활성화된다.
- [ ] 팝업의 `취소`, 닫기 버튼, 배경 클릭, Escape 키는 완료 API를 호출하지 않고 팝업만 닫는다.
- [ ] 완료 응답의 `pantry_added_item_ids`에 포함된 항목은 상세 화면에서 `팬트리 반영 완료` 표시가 보인다.
- [ ] 이미 팬트리에 있거나 이미 반영된 항목은 중복 생성되지 않고 응답 카운트와 `pantry_added_item_ids.length`가 일치한다.

## 통합 흐름

- [ ] 장보기 상세 진입 → 항목 체크/제외 조정 → 순서 변경 → 공유 텍스트 확인 → 완료 → 팬트리 반영 선택까지 한 번에 진행한다.
- [ ] 완료 전 공유 텍스트에는 구매 섹션 최신 순서와 최신 제외 상태가 반영된다.
- [ ] 완료 후 read-only 상태에서도 공유는 가능하지만 체크/제외/순서 변경은 불가능하다.
- [ ] 완료 후 플래너 상태와 장보기 상세 read-only 상태가 서로 맞는다.
- [ ] 팬트리 반영을 한 항목만 팬트리/상세 표시에서 반영 완료로 보인다.
- [ ] 브라우저 콘솔에 예상치 못한 `pageerror` 또는 API wrapper 밖 에러가 없다.

## 완료 기준

- [ ] 위 항목 중 실패한 항목이 없다.
- [ ] 실패 항목이 있으면 화면 이름, 리스트 id, item id, 콘솔 에러, 네트워크 응답 코드를 기록했다.
- [ ] 자동 테스트와 수동 테스트 결과가 같은 계약을 말한다.
