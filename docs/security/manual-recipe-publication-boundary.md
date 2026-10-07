# 직접 등록 공개 전환 권한 경계 — 2026-09-27

로컬 누적 변경이며 운영 migration·Storage 쓰기는 아직 실행하지 않았다.

## 공개 완료

`publish_manual_recipe`는 `service_role` 전용이다. 요청마다 기존 세션/계정 세대 권한 검증, 동일 소유자의 생성 receipt, 직접 등록(`manual`, `origin_recipe_id IS NULL`), 삭제 여부, 수정 시점을 확인한다. 개인 포크·다른 작성자·다른 세대는 공개할 수 없다. 공개 전환과 승인 태그 공개, 영양/조리 내용 완성, 이미지 참조 교체, receipt 갱신은 같은 트랜잭션이다.

공개된 요청을 재생할 때도 현재 공개 영양 snapshot과 현재 내용 hash의 공개 content snapshot을 확인한다. 준비가 누락되면 같은 세션/소유권/수정 시점 보호 아래 다시 완성하며, DB 오류는 성공으로 감추지 않는다. 영양 자료 부족은 기존 `partial`/`unavailable` 계산 계약을 따른다.

## 이미지 복사와 새 테이블

공개 Storage PUT 전에 private 원본 바이트의 크기·실제 형식·해시를 검증하고, DB 트랜잭션에서 공개 자산 registry/reference와 레시피 공개·영양/내용 저장을 먼저 확정한다. 따라서 영양/DB 실패 뒤에 추적되지 않는 공개 blob이 생기지 않는다. 이 시점부터 공개 의도가 확정된 자산이므로 계정 삭제와 경합해 늦게 완료한 PUT도 공개 자산 보존 규칙을 따르며 오류 보상으로 삭제하지 않는다.

`private.manual_recipe_publication_images`는 준비/공개 후 이미지 준비 중 상태를 기록하는 영속 journal이다. API 역할의 직접 테이블 권한은 없고 RLS를 사용한다. 소유자·세대·source/target ID와 경로·해시를 보관한다. **소유자·원본 이미지·레시피 FK cascade를 두지 않는다.** 따라서 탈퇴/원본 정리 후에도 미완료 공개 자산의 추적 정보를 잃지 않는다. 실제 target 바이트를 검증하고 정확한 참조를 다시 확인한 ready ACK 후에만 journal을 삭제한다.

공개 commit 뒤 이미지 업로드가 실패하면 레시피는 검색 가능한 공개 상태이나 사진은 중립 placeholder다. 같은 POST 재시도는 journal의 동일 target을 검증/복구한다. private 원본은 ready까지 일반 unlinked 정리로 넘기지 않는다. 업로드는 덮어쓰지 않고, 다른 요청의 성공을 지울 수 있는 삭제 보상을 실행하지 않는다. 이미 올라간 target만으로도 lost ACK를 복구할 수 있다. 계정 삭제로 private 원본이 정리되고 target도 아직 없다면 해당 pending 추적은 보존되며 사진은 계속 placeholder다.

ready 전에는 POST 성공 응답과 생성 receipt GET 성공을 내보내지 않는다. 공개 원본을 복제한 개인 사본에서도 같은 pending target은 표시하지 않는다. DB와 Storage 사이의 짧은 구간에서 공개 레시피가 먼저 보이고 사진은 placeholder일 수 있다는 가용성 절충을 채택했다. 별도 worker/운영 스케줄러는 추가하지 않았다.

공개 commit 전에 원본 사진을 교체한 경우에는 최신 revision의 새 prepare만 새 target ID를 만든다. 이 단계에는 public PUT이 없어 이전 target blob이 존재하지 않는다. 오래된 revision·source·target의 완료 증거는 거절한다.

## 정확한 내부 RPC 범위

`20260927120501_manual_recipe_publication_scope.sql`은 기존 `private.verify_full_local_internal_scope()` 본문을 `private.verify_full_local_internal_scope_pre_manual_publish_20260927()` 이름으로 보존한다. 새 wrapper와 predecessor 모두 `postgres` 소유, `SECURITY DEFINER`, `pg_catalog, public, private, pg_temp` 검색 경로이며 PUBLIC/anon/authenticated/service_role 직접 실행을 철회한다.

추가 허용은 `recipe-future-propagation` 내부 범위의 다음 POST 두 경로뿐이다.

- `/rpc/publish_manual_recipe`
- `/rpc/read_owned_manual_recipe_publication_context`

그 외 scope·HTTP 메서드·경로는 모두 기존 predecessor에 그대로 위임한다. 격리 PostgreSQL 검사에서 두 경로 허용, 다른 경로/GET의 기존 거절 유지, predecessor 직접 권한 철회를 확인한다. 역사적인 rename 체인을 다시 분류하기 위해 validator를 확장하지 않는다. 신규 실제 작성/조회 함수 세 개는 기존 additive manifest와 `--contract-only` 검사에 등록했다.
