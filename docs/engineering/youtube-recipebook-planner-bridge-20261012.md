# 유튜브 저장 레시피북·플래너 연결

상태: 로컬 구현·검증 완료. 운영 DB·웹 미반영이며 현재 빠른 배포 경로는 통합 범위를 거부한다.

## 첨부 화면에서 확인한 원인

- Library `libfile_7b81fb6dc7cc81918a33891255790716`의 2048×1284 PNG를 실제 픽셀로 확인했다. 운영 화면은 `/recipes/youtube/saved`에서 세 저장 레시피를 `유튜브에서 가져온 레시피` 전용 카드 목록으로만 보여준다.
- Library `libfile_ca3a3faef864819193576b66090f309a`의 2048×352 PNG를 실제 픽셀로 확인했다. 일반 레시피북 상단에도 `유튜브에서 가져온 레시피` 별도 진입 배너가 있어 `내가 추가한 레시피`와 분리된 정보 구조다.
- 화면 분류는 별도 배너·목록 때문에 발생하지만 플래너 단절의 근본 원인은 저장 결과에 일반 플래너가 소비하는 canonical `recipes.id`가 없던 점이다. 이번 변경은 전용 상세를 삭제하지 않고 호환 경로로 유지하면서 canonical 연결을 추가하고, 기본 노출·재사용 흐름만 일반 사용자 레시피와 합친다.

## 사용자 흐름

유튜브 추출 결과의 원본 보존형 편집 문서는 그대로 유지한다. 자동 저장이 완료되면 같은 소유자의 공개 canonical recipe ID를 1:1로 연결한다. 이 ID 때문에 저장 결과는 `내가 추가한 레시피`의 기존 목록·개수 계약에 포함되고 공개 레시피 검색에도 제목으로 노출된다. 저장 태그 중 기존 승인 시스템 태그는 `recipe_tags`에도 동기화되어 태그 검색·테마에 참여하고, 미승인 자유 태그는 공개 검색 인덱스로 승격하지 않는다. 카드에서 다시 열면 기존 유튜브 편집 화면으로 돌아가며, 저장 후에는 `내가 추가한 레시피에서 보기`로 기존 레시피북 reader에 진입한다. reader의 저장·플래너·요리 동작과 편집 화면의 플래너 추가를 재사용한다.

마이페이지의 별도 `유튜브에서 가져온 레시피` 진입 배너는 제거한다. 기존 `/recipes/youtube/saved` 목록과 상세 URL은 북마크·뒤로가기 호환을 위해 유지한다.

## 데이터·권한 계약

- `youtube_saved_recipe_results.canonical_recipe_id`는 `recipes.id`와 1:1이며 최초 배정 후 바뀌지 않는다.
- 연결 recipe는 `created_by=owner_user_id`, `visibility='public'`, `source_type='youtube'`다. 원본 저장 결과의 소유권과 편집 권한은 owner에게만 있고, 다른 사용자는 공개 recipe projection만 읽는다.
- 제목·썸네일·인분·태그·revision만 canonical recipe에 동기화한다. 원본 근거와 편집 JSON, ingredient link projection이 저장 내용의 권위다.
- 미해결 재료는 공용 catalog ID를 꾸며내지 않는다. 플래너의 불변 content snapshot 안에서만 recipe ID와 row ID로 결정적 synthetic UUID를 만들고, 실제 catalog ID와 충돌하지 않음을 확인한 뒤 원문 이름·표시 문자열·미해결 상태를 함께 고정한다. 장보기의 catalog 집계는 실제 연결 ID가 없는 행을 catalog 재료로 승격하지 않는다.
- 공개 상세·독립 요리모드는 저장 문서에서 표시용 재료와 단계만 투영한다. owner ID, 저장 draft ID, 원본 evidence, source snapshot, ingredient link 상태와 mutation metadata는 공개 응답에 넣지 않는다. 미확인 분량은 그대로 표시하되 영양 계산에는 포함하지 않는다.
- 공개 parent를 통해 읽을 수 있는 `recipe_sources.extraction_meta_json`에는 저장 draft ID나 원본 extraction metadata를 복사하지 않고, 민감 정보가 없는 boolean bridge 표식만 둔다. owner 편집 URL은 canonical recipe ID를 owner-scoped 저장 RPC가 다시 해석한다.
- 공개 recipe snapshot은 `owner_user_id=null`로 고정해 다른 사용자가 자기 플래너에 추가해도 원 작성자의 private ownership으로 잘못 묶이지 않는다.
- 레시피북 상세는 owner 검증과 `my_added` membership 검증 뒤 기존 owner-scoped 저장 RPC를 통해 내용을 읽는다.
- canonical recipe가 삭제되면 연결 저장 결과도 함께 삭제된다. 공개 recipe 노출은 기존 계정 공개 상태/RLS를 따르며 비활성 소유자를 우회하지 않는다.
- 계정 삭제로 private 저장 문서가 사라질 때 bridge recipe는 공개 검색·레시피북에서 soft-retire하고 다른 사용자의 saved/custom·like 참조를 정리한다. recipe tombstone과 이미 고정된 owner-neutral meal snapshot은 남겨 다른 사용자의 기존 플래너 기록을 보존한다.

## 기존 데이터 backfill

새 migration은 기존 저장 결과마다 owner-created public recipe 한 행과 recipe source 한 행을 만든다. 기존 4건의 저장 JSON과 source snapshot에는 공개/비공개 선택 필드가 없음을 읽기 전용 집계로 확인했으므로 별도 비공개 예외 없이 같은 계약을 적용한다. 저장 결과의 `editable_content_json`, `editable_content_hash`, revision, source snapshot은 바꾸지 않는다. 기존 멱등 응답에는 새 recipe ID만 보완한다.

운영 적용 전 확인할 범위와 위험은 다음과 같다.

- 증가 행: 기존 저장 결과 수만큼 `recipes`와 `recipe_sources`가 각각 증가한다.
- 잠금/시간: saved results 전체를 한 번 갱신해 trigger backfill을 실행하므로 운영 원장 크기와 적용 시간을 사전 조회해야 한다.
- 되돌리기: 플래너 meal snapshot이 새 recipe ID를 참조한 뒤에는 단순 컬럼 제거가 아니라 참조 식사 보존 결정을 포함한 rollback이 필요하다.
- 따라서 운영 DB 적용·기존 데이터 일괄 변경은 백업과 대상 건수 확인 후 별도 승인으로 수행한다.
- 배포 순서는 DB migration 적용과 backfill 확인이 먼저이고 웹 배포가 다음이다. 웹만 먼저 배포하면 아직 bridge되지 않은 기존 저장 결과의 별도 진입 배너가 사라지므로 두 단계 사이를 길게 두지 않는다.

## 변경하지 않는 범위

- P5 추출 모델, worker, 평가 데이터
- 저장 결과의 원본/편집 JSON 계약과 optimistic revision
- 구형 `/recipes/{id}/save` service-role fallback
- 운영 배포, 인증·보안 설정
- P5 추출 모델의 분량 판정과 영양 계산 정책

## master·운영 웹 통합 후보와 DB 검증 경계

- 통합 후보는 master `7e466b170ba39795220ef64e67eac3fab4429420`에서 시작해 현재 운영 웹 `f970bc1d1f1e981d8947e852a9b51ada4a74570a`를 두 번째 부모로 연결한 `d7fb78ae4c459eed8555046f6480dbe61dc24b79` 위에 이 기능을 적용했다. 47개 충돌은 최신 master 후속 구현을 유지했고, 운영 이력 대응과 파일별 결정은 [재통합 기록](./master-live-reintegration-20261012.md)에 고정했다. 미완성 leftovers, 보류 `444fe1f6f`, P5 추출기·평가 이력과 별도 source-bound worker 후보는 포함하지 않는다.
- 운영 DB 원장 218개에 이미 반영된 `20261011140000_retire_unused_ingredients.sql`, `20261011200000_household_spoon_measurement.sql`은 운영 영수증과 같은 checksum의 migration source closure로만 포함한다. 이 두 파일은 다시 실행하지 않는다.
- migration source는 이번 bridge까지 219개지만, 성공한 DB 통합 검사는 운영과 동등한 post-218 schema 복제본에 `20261012120000_youtube_saved_recipe_canonical_bridge.sql`만 적용한 **target migration 검증**이다. 이를 219개 전체 replay 성공으로 표현하지 않는다.
- 빈 DB에서 219개를 순서대로 적용하는 현재 전체 replay는 이번 변경 전부터 있던 `20260919001000_ingredient_search_normalization.sql`의 `INGREDIENT_SEARCH_YOUTUBE_LOOKUP_SHAPE_CHANGED`에서 중단된다. 기존 migration의 checksum은 운영 기준·master·release 후보에서 동일하며, 이 실패를 이번 target migration 성공으로 덮지 않는다.
- bridge SQL은 함수·트리거·기존 저장 결과 UPDATE를 포함해 `deploy:dev`의 빠른 추가형 DB 경로에서 거부된다. 새 백업과 대상 확인을 승인받은 별도 통제 transaction으로 DB/backfill을 먼저 적용하고, 원장 219개와 API schema reload를 확인한 뒤 웹을 `--already-applied-db`로 전환한다.

## 검증 계약

- 신규 저장 → `내가 추가한 레시피` 노출 → reader → 유튜브 편집 재진입 → 수정/저장 → 플래너 추가
- 기존 저장분 backfill과 멱등 응답 replay
- 반복 클릭, 새로고침, 취소/뒤로가기에서 중복 canonical recipe 및 편집 덮어쓰기 없음
- manual recipe 목록·reader·플래너 회귀 없음
- owner-only 편집/RPC와 다른 사용자의 공개 상세·검색·플래너 추가를 각각 검증
- 미확인 분량은 경고 1개만 보이고, 확인/직접 입력 후 중복 상태 배지가 남지 않으며 영양 계산 제외 계약 유지
- 좁은 모바일 폭, 긴 단위, 키보드 입력에서 단위 입력이 행 밖으로 넘치지 않음

## 로컬 검증 결과

- 직접 관련 Vitest는 10개 파일, 107개가 통과했다. 보안 경계 자체 리뷰에서 발견한 타 사용자 recipebook reader 분기와 독립 리뷰에서 발견한 계정 삭제 orphan 경계를 수정한 뒤 해당 경로 5개 파일, 109개도 통과했다. 당시 기준 master에서도 동일했던 `recipe-add-to-planner` 3개 실패는 후속 마무리에서 현재 전역 확인 다이얼로그와 같은 탭 `sessionStorage` 인증 복귀 계약을 실제 검증하도록 갱신했다. meal 생성 payload·`plan_count` 증가·확인 버튼 닫기·legacy/cross-tab `localStorage` 비재사용을 포함한 최신 집중 검사는 2개 파일, 24개가 통과했다.
- 수동 레시피, 레시피 상세·영양, 플래너, 쇼핑, 식사 기록, 인증과 YouTube 공개·저장 흐름의 넓은 회귀 묶음은 27개 파일, 461개가 통과했다.
- 운영 원장 218개와 동등한 schema 복제본에 target bridge migration만 적용한 PostgreSQL 검사는 최종 SQL로 2개 모두 통과했다. 공개 태그 검색, owner 공개 projection, 다른 사용자의 플래너 추가와 owner-neutral snapshot, owner-scoped update, canonical ID 불변성, 기존 4행의 정확한 backfill, 공개 source row에 private draft ID·extraction metadata가 남지 않음, 계정 삭제 뒤 공개 bridge·레시피북 참조 정리와 타 사용자 planner snapshot 보존을 확인했다. 격리 컨테이너는 검사 후 제거했고 운영 데이터는 읽기 전용 집계 외에 변경하지 않았다.
- `pnpm typecheck`와 `pnpm build`가 통과했다. build는 93개 정적 페이지를 만들었다. `pnpm lint`는 오류 0개, 기준 master에도 있는 경고 9개로 통과했다.
- Playwright Chromium에서 `desktop-chrome`, Pixel 7 기반 `mobile-chrome`, iPhone SE 크기의 `mobile-ios-small` 3개 프로젝트가 최종 코드로 모두 통과했다. 독립 포트 3118에서 저장 결과 재진입, 편집·저장, 새로고침, `내가 추가한 레시피` 이동, 반복 클릭 중복 방지와 좁은 화면 overflow를 확인했다. 포트 3100은 다른 세션의 프로세스가 사용 중이어서 종료하지 않았다. 이는 사용자의 기존 대화형 Google Chrome이 아니라 저장소가 관리하는 Chromium 검사다.
- 배포 도구 자체 회귀는 4개 파일, 155개가 통과했다. 다만 실제 통합 후보의 `deploy:dev:plan`은 master와 운영 웹을 다시 합치며 생긴 보호 대상 server/tooling/config 파일을 현재 빠른 웹 배포 허용 범위 밖으로 판정해 중단했다. 배포 guard를 완화하지 않았으며, 이 통합 delta를 허용하는 별도 readiness 결정 또는 더 작은 배포 source가 필요하다.
- 위 plan 차단을 해소하더라도 bridge SQL은 함수·트리거·기존 저장 결과 UPDATE를 포함하므로 빠른 추가형 DB 경로로는 적용할 수 없다. 운영 대상 건수·백업을 확인한 승인된 DB transaction/backfill 뒤 `--already-applied-db` 웹 배포가 필요하다.
- 정식 `release:production:promote`는 별도로 unconditional fail-closed와 현재 발급할 수 없는 GitHub attestation 때문에 차단되어 있다. Actions 비활성 상태의 정확한 누락 신뢰 계층, 구현하지 않은 offline approval 제안, 권한·rollback 경계는 [읽기 전용 배포 준비 진단](./local-mac-production-actions-disabled-readiness-20261012.md)에 보존했다. guard 제거·파일 은닉·빈 context 허용은 배포 대안이 아니다.
