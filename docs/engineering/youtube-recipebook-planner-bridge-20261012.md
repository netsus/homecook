# 유튜브 저장 레시피북·플래너 연결

상태: 로컬 구현 및 검증 중. 운영 DB·웹 미반영.

## 사용자 흐름

유튜브 추출 결과의 원본 보존형 편집 문서는 그대로 유지한다. 자동 저장이 완료되면 같은 소유자의 비공개 canonical recipe ID를 1:1로 연결한다. 이 ID 때문에 저장 결과는 `내가 추가한 레시피`의 기존 목록·개수 계약에 포함되고, 카드에서 다시 열면 기존 유튜브 편집 화면으로 돌아간다. 편집 화면과 레시피북 reader 모두 같은 저장 결과를 읽으며, 저장된 상태에서 플래너 추가를 사용할 수 있다.

마이페이지의 별도 `유튜브에서 가져온 레시피` 진입 배너는 제거한다. 기존 `/recipes/youtube/saved` 목록과 상세 URL은 북마크·뒤로가기 호환을 위해 유지한다.

## 데이터·권한 계약

- `youtube_saved_recipe_results.canonical_recipe_id`는 `recipes.id`와 1:1이며 최초 배정 후 바뀌지 않는다.
- 연결 recipe는 `created_by=owner_user_id`, `visibility='private'`, `source_type='youtube'`다. 공개 레시피나 공용 재료 행을 만들지 않는다.
- 제목·썸네일·인분·태그·revision만 canonical recipe에 동기화한다. 원본 근거와 편집 JSON, ingredient link projection이 저장 내용의 권위다.
- 미해결 재료는 공용 catalog ID를 꾸며내지 않는다. 플래너의 불변 content snapshot 안에서만 recipe ID와 row ID로 결정적 synthetic UUID를 만들고, 실제 catalog ID와 충돌하지 않음을 확인한 뒤 원문 이름·표시 문자열·미해결 상태를 함께 고정한다. 장보기의 catalog 집계는 실제 연결 ID가 없는 행을 catalog 재료로 승격하지 않는다.
- 레시피북 상세는 owner 검증과 `my_added` membership 검증 뒤 기존 owner-scoped 저장 RPC를 통해 내용을 읽는다.
- canonical recipe가 삭제되면 연결 저장 결과도 함께 삭제되며, 계정 삭제의 기존 private recipe 정리 범위를 유지한다.

## 기존 데이터 backfill

새 migration은 기존 저장 결과마다 owner-private recipe 한 행과 recipe source 한 행을 만든다. 저장 결과의 `editable_content_json`, `editable_content_hash`, revision, source snapshot은 바꾸지 않는다. 기존 멱등 응답에는 새 recipe ID만 보완한다.

운영 적용 전 확인할 범위와 위험은 다음과 같다.

- 증가 행: 기존 저장 결과 수만큼 `recipes`와 `recipe_sources`가 각각 증가한다.
- 잠금/시간: saved results 전체를 한 번 갱신해 trigger backfill을 실행하므로 운영 원장 크기와 적용 시간을 사전 조회해야 한다.
- 되돌리기: 플래너 meal snapshot이 새 recipe ID를 참조한 뒤에는 단순 컬럼 제거가 아니라 참조 식사 보존 결정을 포함한 rollback이 필요하다.
- 따라서 운영 DB 적용·기존 데이터 일괄 변경은 백업과 대상 건수 확인 후 별도 승인으로 수행한다.
- 배포 순서는 DB migration 적용과 backfill 확인이 먼저이고 웹 배포가 다음이다. 웹만 먼저 배포하면 아직 bridge되지 않은 기존 저장 결과의 별도 진입 배너가 사라지므로 두 단계 사이를 길게 두지 않는다.

## 변경하지 않는 범위

- P5 추출 모델, worker, 평가 데이터
- 저장 결과의 원본/편집 JSON 계약과 optimistic revision
- 사용자 간 공개 범위, 공개 recipe 등록 정책
- 구형 `/recipes/{id}/save` service-role fallback
- 운영 배포, 인증·보안 설정

## 검증 계약

- 신규 저장 → `내가 추가한 레시피` 노출 → reader → 유튜브 편집 재진입 → 수정/저장 → 플래너 추가
- 기존 저장분 backfill과 멱등 응답 replay
- 반복 클릭, 새로고침, 취소/뒤로가기에서 중복 canonical recipe 및 편집 덮어쓰기 없음
- manual recipe 목록·reader·플래너 회귀 없음
- owner-private RLS와 다른 사용자 404 유지
