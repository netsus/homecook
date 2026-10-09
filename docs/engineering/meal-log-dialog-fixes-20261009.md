# 2026-10-09 식사기록 수정·확인창·입력 수정 (운영 반영)

## 확인한 원인

- 수정 sheet가 닫히며 상세 화면의 focus boundary가 다시 활성화될 때 전역 성공 확인창도 함께 열린다. 각 boundary가 따로 inert/aria-hidden을 저장·복원하면 확인창 조상이 inert로 남거나 아래 화면이 키보드 이벤트를 가로챌 수 있었다.
- 배경 click만으로 닫으면 숫자 선택을 입력창에서 시작하고 배경에서 놓을 때 합성되는 click도 배경 클릭으로 취급됐다.
- 409가 모두 ‘다른 변경의 최신 기록 반영’으로 처리됐다. 실제 사용자 사례는 완성400g 음식에500g을 입력한 경우였다. 원장의 양 초과 보호는 정상적으로 유지해야 하며, 버전 충돌과 안내를 구분해야 한다. 운영 기록은 읽기만 했다.

## 변경

1. 공유 모달 boundary는 최상위 하나만 배경 격리/Tab/Escape를 처리한다. 성공 확인창에 우선순위를 지정해 상세가 늦게 재활성화되어도 확인창을 막지 않는다. 기존 격리 복원 → 최상위로 포커스 이동 → 배경 격리 순서로 aria-hidden 경고를 방지한다. 모든 모달이 닫히면 기존 inert/aria-hidden/스크롤을 복원한다.
2. 배경에서 pointerdown/up이 모두 발생한 짧은 탭만 배경 닫기로 처리한다. 입력창에서 시작한 선택 드래그, 배경에서 내부로 끝난 드래그, 취소된 pointer는 닫기를 만들지 않는다.
3. 추가/수정의 먹은 양 입력에서 Enter로 제출한다. IME 조합·keyCode229·반복 키·잘못된 값·이미 저장 중인 요청은 제외하고 ref로 같은 tick 중복도 막는다.
4. PATCH 성공 응답의 revision/quantity를 오래된 조회 응답으로 덮지 않고 다음 수정에 사용한다. 부모의 상세/추가 복귀 컨텍스트도 갱신한다. 실제 서버 revision·멱등성·소유권 검사는 유지한다.
5. meal-log RPC의 정확한 PostgreSQL `22003 + CONFLICT` 조합만 양 초과로 분류한다. HTTP409/codeCONFLICT는 그대로이며 `fields=[{field:'quantity.amount',reason:'exceeds_available_amount'}]`와 ‘이 음식에서 기록할 수 있는 양을 초과했어요. 입력한 양을 줄여 주세요.’를 반환한다. UI는 입력을 유지하며 이 오류를 버전 충돌로 다시 쓰지 않는다. 40001·55000·deadlock 및 다른 숫자 오류 처리는 보존한다. SQL 변경은 없다.

## 변경 파일

- `components/shared/{use-dialog-boundary,use-backdrop-dismiss}.ts`, `action-confirmation.tsx`, `app-overlay.tsx`
- `components/planner/{meal-log-screen,meal-log-add-sheet}.tsx`
- `lib/server/meal-log.ts`
- 관련 단위 검사와 `tests/e2e/meal-log-edit-dialog-regression.spec.ts`
- 기존 계획 추가 검사 fixture에 최신 영양 계약의 warnings 배열을 보완했다. AI 영양 기능 자체는 변경하지 않았다.

## 검증

- 관련 단위103개 통과. 확인창 우선순위, 격리 복원 순서, 원래 inert 보존, 포커스 순서, 배경 드래그, IME·repeat·중복 입력, 양 초과/버전충돌 분리, 연속 수정 revision과키를 확인했다.
- 모바일375px/PC1280px 브라우저8개 통과.500g 실패→350g 정상수정→확인버튼 실제hit/click→300g재수정→Escape확인창닫기, 드래그중모달유지, Enter추가저장, 정상배경탭닫기, 스크롤잠금복원과 Chrome aria-hidden 경고0을 확인했다.
- 타입 검사·변경파일 ESLint 통과. 화면 증거 `.omx/evidence/meal-edit-20261009/verified/`.
- 실제 사용자의 기록은 수정하지 않았다. DB/SQL 변경 없음. 이번 레시피 영양 UI와 함께 웹 `4d7238de7e8f`로 운영 반영했다(PR #1600). 실기기 IME/터치키보드는 별도 확인이 필요하다.
