# Local Test Checklist: Manual Recipe And YouTube Import Slices 18-19

이 체크리스트는 로컬 브라우저에서 `slice18-manual-recipe-create`와 `slice19-youtube-import`가 함께 제대로 동작하는지 확인하기 위한 수동 점검표다.

## 준비

- [ ] 최신 작업 기준 브랜치인지 확인한다.
- [ ] 의존성을 설치한다:
  ```bash
  pnpm install
  ```
- [ ] 핵심 자동 회귀 테스트를 먼저 돌린다:
  ```bash
  pnpm test:product tests/manual-recipe-create.backend.test.ts tests/youtube-import.backend.test.ts
  pnpm exec playwright test tests/e2e/slice-18-manual-recipe-create.spec.ts tests/e2e/slice-19-youtube-import.spec.ts --grep-invert '@live-oauth'
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
  - [ ] 기본 조리방법 seed 8종(`stir_fry`, `boil`, `deep_fry`, `steam`, `grill`, `blanch`, `mix`, `prep`)
  - [ ] 재료 마스터 최소 10종 이상
  - [ ] 끼니 컬럼 4개(`아침`, `점심`, `간식`, `저녁`)
  - [ ] 시스템 레시피북 3개(`my_added`, `saved`, `liked`)
  - [ ] `recipe_sources` 테이블
  - [ ] YouTube stub URL 3종: `recipe12345`, `nonrecipe123`, `fail999999`

## Slice 18: Manual Recipe Create

- [ ] `MENU_ADD`에서 [직접 등록]을 누르거나 `/menu/add/manual`로 `MANUAL_RECIPE_CREATE` 화면에 진입한다.
- [ ] 비로그인 상태에서 등록을 시도하면 로그인 게이트가 뜨고, 로그인 후 `/menu/add/manual` 폼으로 복귀한다.
- [ ] 조리방법 목록과 재료 검색 데이터가 로딩된다.
- [ ] 레시피명, 재료, 조리 과정이 없는 상태에서는 [저장]이 비활성화된다.
- [ ] 레시피명과 기본 인분을 입력/조절할 수 있다.
- [ ] 정량 재료를 추가할 수 있고, 수량과 단위가 화면에 표시된다.
- [ ] 가감형 재료를 추가할 수 있고, 수량/단위 입력 없이 저장된다.
- [ ] 조리 과정을 추가할 때 조리방법을 선택할 수 있다.
- [ ] 조리 과정 설명을 입력하면 단계 번호와 조리방법 라벨이 표시된다.
- [ ] 필수값을 모두 채운 뒤 [저장]을 누르면 `POST /api/v1/recipes`가 호출된다.
- [ ] 저장 성공 후 `레시피 등록 완료` 안내가 표시된다.
- [ ] 응답 데이터는 `{ success, data, error }` 래퍼이며 `source_type='manual'`, `created_by=current_user.id`가 반영된다.
- [ ] [레시피 상세로 이동]을 누르면 `/recipe/{recipe_id}`로 이동한다.
- [ ] 상세 화면에서 방금 등록한 레시피명, 직접 등록 source 표시, 재료/스텝 정보가 보인다.
- [ ] 플래너 문맥에서 진입했다면 [끼니에 추가]를 눌러 계획 인분을 정하고 `MEAL_SCREEN`으로 복귀한다.
- [ ] 끼니에 추가된 식사는 `status='registered'`로 플래너에 표시된다.
- [ ] 플래너 문맥 없이 [끼니에 추가]를 시도하면 안내가 보이고 `POST /api/v1/meals`가 호출되지 않는다.
- [ ] `MYPAGE` → `my_added` 레시피북에 방금 등록한 직접 레시피가 보인다.
- [ ] `my_added` 반영은 `recipe_book_items` 추가가 아니라 `recipes.created_by + source_type='manual'` 조건으로 동작한다.
- [ ] 등록 실패 또는 네트워크 실패 시 에러 안내와 재시도가 동작한다.
- [ ] 모바일 폭 320px와 390px에서 입력 폼, 하단 CTA, 재료/스텝 모달이 서로 겹치지 않는다.

## Slice 19: YouTube Import

- [ ] `MENU_ADD`에서 [유튜브]를 누르거나 `/menu/add/youtube`로 `YT_IMPORT` 화면에 진입한다.
- [ ] 비로그인 상태에서 가져오기를 시도하면 로그인 게이트가 뜨고, 로그인 후 `/menu/add/youtube` 폼으로 복귀한다.
- [ ] 빈 URL 또는 잘못된 URL을 입력하면 `올바른 유튜브 URL을 입력해주세요` 안내가 보인다.
- [ ] 유효 레시피 stub URL `https://www.youtube.com/watch?v=recipe12345`를 입력하고 [가져오기]를 누르면 검증이 통과한다.
- [ ] 추출 중 loading/progress 상태가 보인다.
- [ ] 추출 완료 후 `추출 결과를 확인해주세요` 검수 화면으로 이동한다.
- [ ] 검수 화면에 레시피명, 기본 인분, 추출 방식(`description` 등), 재료 목록, 조리 과정 목록이 표시된다.
- [ ] 검수 단계에서만 레시피명과 기본 인분을 수정할 수 있다.
- [ ] 검수 단계에서 재료를 추가/수정/삭제할 수 있다.
- [ ] 검수 단계에서 조리 과정 설명과 조리방법을 수정할 수 있다.
- [ ] 추출 결과에 미분류 조리방법이 있으면 `신규` 라벨 또는 fallback 색상으로 구분된다.
- [ ] [등록]을 누르면 `POST /api/v1/recipes/youtube/register`가 호출된다.
- [ ] 등록 성공 후 `레시피가 등록됐어요` 완료 화면이 표시된다.
- [ ] 응답 데이터는 `{ success, data, error }` 래퍼이며 `recipe_id`와 `title`을 포함한다.
- [ ] 등록된 레시피는 `source_type='youtube'`, `created_by=current_user.id`로 저장된다.
- [ ] `recipe_sources`에 `youtube_url`, `youtube_video_id`, `extraction_methods`, `extraction_meta_json`, `raw_extracted_text`가 저장된다.
- [ ] 플래너 문맥에서 진입했다면 [이 끼니에 추가]를 눌러 계획 인분을 정하고 `MEAL_SCREEN`으로 복귀한다.
- [ ] 플래너 문맥 없이 완료하면 [이 끼니에 추가]가 보이지 않고 [레시피 상세 보기]와 [닫기]만 보인다.
- [ ] `MYPAGE` → `my_added` 레시피북에 방금 등록한 유튜브 레시피가 보인다.
- [ ] `my_added` 반영은 `recipe_book_items` 추가가 아니라 `recipes.created_by + source_type='youtube'` 조건으로 동작한다.
- [ ] 비레시피 stub URL `https://youtu.be/nonrecipe123` 또는 `https://www.youtube.com/watch?v=nonrecipe123`를 입력하면 "레시피 영상이 아닌 것 같아요" 분기가 보인다.
- [ ] 비레시피 분기에서 [다시 입력]을 누르면 URL 입력 화면으로 돌아간다.
- [ ] 비레시피 분기에서 [그래도 진행]을 누르면 추출/검수 단계로 진행된다.
- [ ] 실패 stub URL `https://www.youtube.com/watch?v=fail999999`를 입력하면 추출 실패 에러와 재시도가 동작한다.
- [ ] register 실패 또는 네트워크 실패 시 완료 화면으로 잘못 넘어가지 않고 에러가 표시된다.
- [ ] 모바일 폭 320px와 390px에서 URL 입력, 검수 리스트, 완료 화면, 하단 CTA가 서로 겹치지 않는다.

## Slice 18-19 통합 흐름

- [ ] `my_added` 레시피북에 직접 등록 레시피와 유튜브 등록 레시피가 함께 보인다.
- [ ] `my_added` 레시피북에는 `source_type IN ('manual', 'youtube')`인 내 레시피만 보이고 다른 사용자의 레시피는 보이지 않는다.
- [ ] 직접 등록 레시피와 유튜브 등록 레시피 모두 상세 화면에서 플래너 추가가 가능하다.
- [ ] 플래너에 추가한 직접/유튜브 레시피는 `registered` 상태로 장보기 preview 대상이 될 수 있다.
- [ ] 19에서 생성된 미분류 조리방법은 이후 18 직접 등록 화면의 조리방법 목록에서도 조회된다.
- [ ] 18과 19 모두 `QUANT` 재료는 수량/단위 필수, `TO_TASTE` 재료는 수량/단위 없음 규칙을 지킨다.
- [ ] 18과 19 모두 `step_number`는 1부터 시작하고 중복되지 않는다.
- [ ] 로그아웃 후 `/menu/add/manual`, `/menu/add/youtube`, 등록/가져오기 보호 액션이 모두 로그인 게이트로 이어진다.
- [ ] 로그인 후 return-to-action이 각각 원래 화면 또는 원래 액션으로 복귀한다.
- [ ] 브라우저 콘솔에 예상치 못한 `pageerror` 또는 API wrapper 밖 에러가 없다.

## 선택 수동 확인

- [ ] 실제 YouTube Data API 또는 live 영상 검증/추출이 연결된 환경에서 유튜브 가져오기를 별도 확인한다. 현재 MVP stub 기반이면 생략 가능하다.
- [ ] 다양한 유튜브 URL 형식(`youtube.com/watch`, `youtu.be`, `youtube.com/shorts`, playlist 포함 URL)을 확인한다.
- [ ] 등록된 직접/유튜브 레시피로 요리 세션을 시작해 `COOK_MODE`에서 조리방법 색상이 올바르게 표시되는지 확인한다.
- [ ] 실기기 모바일 브라우저에서 재료 검색 모달, 조리 과정 모달, 유튜브 검수 리스트 편집 UX를 확인한다.

## 완료 기준

- [ ] 위 항목 중 실패한 항목이 없다.
- [ ] 실패 항목이 있으면 화면 이름, URL, 관련 id(`recipe_id`, `extraction_id`, `meal_id`, `book_id`), 콘솔 에러, 네트워크 응답 코드를 기록했다.
- [ ] 자동 테스트와 수동 테스트 결과가 같은 계약을 말한다.
- [ ] 18의 직접 등록은 `source_type='manual'`과 `my_added` 가상 책 반영을 지킨다.
- [ ] 19의 유튜브 등록은 `source_type='youtube'`, `recipe_sources`, 미분류 조리방법 생성 규칙을 지킨다.
- [ ] 18/19에서 생성한 레시피가 플래너, 레시피 상세, 마이페이지 레시피북 흐름과 충돌하지 않는다.
