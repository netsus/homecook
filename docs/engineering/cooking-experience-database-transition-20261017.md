# 요리 경험 DB 적용·복구 계획

2026-10-17. 코드 master 병합과 DB 적용은 별개다. v85 담당의 잠금 해제와 부모의 배포 직렬화 전에는 운영 조회·쓰기·공유 배포 설정 변경을 하지 않는다. 이 문서는 실행 영수증이 아니다.

## 변경 범위

| Migration | 영향 | 보존해야 하는 경계 |
|---|---|---|
|`20261017210000_cooked_weight_mass_fallback.sql`|기존 `private.record_cooked_weight_evidence`를 교체하고 `ingredient-mass-75-v1`을 검증한다.|모든 재료의 검증 질량·고유 행·총합·75% 결과를 확인한다. receipt/소유권/기존 조건 추정/실측/미확인/수집 OFF 보호를 유지한다.|
|`20261017220000_cooking_execution_quantities.sql`|개인 실행분 테이블1개, public RPC3개, private helper2개와 scope wrapper/alias를 추가한다. 기존 완료 및 영양 resolver에 보호 hook을 삽입한다.|원본 recipe/snapshot 불변, owner·현재 세션·판본 CAS·기존 멱등 receipt, recipe→session 잠금 순서, 기존 전체 authority/scope 체인. 직접 테이블 ACL 없음.|

두 파일 모두 BEGIN/COMMIT을 포함하며 234는 동적 함수 DDL을 사용한다. 일반 fastDB 경로는 이 문법을 허용하지 않는다. validator/allowlist를 느슨하게 만들거나 fastDB로 적용하지 않는다. 현재 DB232에서 원자적인 별도 검토 적용 경로가 필요하다. worker/키/C05/R2/lead 설정을 변경하지 않는다.

## 적용 전 확인과 격리 검증

1. 잠금 해제 후 정확한 DB target·ledger232·새 migration 미적용 여부와 웹/worker 버전을 새로 확인한다. 지금은 운영 읽기까지 중단되어 이 조건을 수행하지 않았다.
2. 적용 대상 전체 schema·함수 정의/owner/ACL/search_path/volatility·기존 보호 receipt·control·일반 데이터 지문을 비공개 백업한다. 개인 실행분/영양/무게 이력의 원본을 외부로 보내거나 로그에 출력하지 않는다. 백업 decode와 별도 빈 격리 복원이 확인되어야 한다.
3. 실제 DB232의 검토 가능한 schema-only 사본을 소유 격리 PG17에서 복원해 두 파일을 순서대로 실행한다. fresh replay의 기존213 함수 설정 차이는 저장소의 exact historical fixture로 재현했고, 다음214는 schema/함수/owner/ACL의 정확 catalog 지문 불일치에서 멈춘다. 재료 데이터 부족 때문이라는 초기 추정은 철회했으며, 역사별 실행 role/단일 backend 차이를 포함한 상세 원인은 미확정이다. 별도로 출처가 고정된 schema-only228+원본229–232에서109함수 승인 검사와233/234 전체 회귀25개를 통과했다. 현재 운영232의 동등성은 잠금 해제 후 새로 대조해야 하며, fence를 skip해 성공으로 만들지 않는다.
4. 적용 전후 함수 postimage와 exact ACL을 비교한다. 233의 교체 함수, 234의 완료/resolver/scope 체인과 신규 함수만 의도대로 달라야 한다. 기존 보안 inventory는 옛 함수 body hash를 가지므로 새 postimage를 별도로 검토해야 한다. owner/ACL/search_path 차이를 body 변경과 함께 승인하지 않는다.
5. 실제 기존 완료/영양 함수와 authority로 owner/타인/읽기전용/취소·완료 상태, 요청 재전송, 수정·완료 경합, stale 판본, v4·상품·일반 재료, 배율1회, 미확인/추정/실측을 검증한다. 이전 웹의 수정 세션 완료 우회는409여야 한다. 부분 적용·COMMIT ACK 불명·재진입도 시험한다.

현재 증거: 관련 단위/API/UI 테스트와 최소 SQL fixture mass12·execution10 PASS. 후속 고정schema-only228+원본229–232에서233/234 전체 회귀25 PASS, 기존109함수 승인 inventory차이0·전체432함수불변·실제DDLrollback·실제service_role 검증을확인했다. [결과와한계](data/cooking-schema232-regression-20261017.json)를따른다. 현재운영232의fresh동등성·실제인증HTTP·deployledger전환은미완료이며 운영배포승인이아니다.

## 장애와 복구

- COMMIT 전 SQL 실패: 해당 트랜잭션은 rollback한다. 연결이 끊겼다면 추정하지 말고 동일 target의 ledger·신규 테이블·함수 postimage를 읽어 확정한다. 233만 committed면 기록하고 234를 중복 실행하지 않는다. 234는 CREATE TABLE/함수 rename이 있어 임의 재실행 대상이 아니다.
- 적용 전 상태로 되돌리기: 아직 신규 개인 실행분/새 모델 이력이 없고 적용 결과가 확정된 경우에만, 저장한 정확한 함수 정의·속성·ACL·ledger를 단일 검토 트랜잭션으로 되돌린다. 이름만 보고 scope wrapper를 삭제하지 않는다. CAS와 원래 scope 체인을 함께 확인한다.
- 새 개인 실행분/완료 이력이 생긴 뒤: 테이블/receipt/영양/무게 이력을 삭제하거나 옛 snapshot으로 덮어쓰지 않는다. DB hook과 frozen 영양 resolver를 유지하고, 새 수정 진입을 차단하는 웹 보완 또는 검증한 forward migration을 우선한다. 옛 웹으로만 돌리면 이미 수정된 세션의 화면은 원본을 보여줄 수 있으므로 완료409를 오류가 없는 정상 복귀라고 주장하지 않는다.
- 233 이후 새75% 이력이 생긴 뒤: 기존 이력을 과거 모델/실측으로 재표기하지 않는다. reader 호환성이 확인될 때까지 새 모델 쓰기를 멈추는 forward 보완을 택한다. 저장된 실측과 추정 기록은 각각 보존한다.
- 전체 DB 복원은 일반 UI 롤백 수단이 아니다. 운영 데이터가 추가된 DB를 통째로 이전 시점으로 되돌리는 작업은 이번 승인 범위가 아니며 별도 영향 검토가 필요하다.

웹 반영 후 실제 인증·모바일/데스크톱 흐름 및 영양 저장 readback을 담당자와 직렬 확인한다. 그 전까지 모든 개선은 ‘master 병합/운영 미반영’으로 표시한다.

빈fresh재생의213차이는기존exact historical fixture로해결했고, 다음214는schema/함수/권한catalog지문불일치로분리했다(재료데이터원인미확인). 검증된schema-only선행으로현재기능의전체함수회귀를확인한것이며기존migration/fence를skip하거나수정하지않았다. 전체과거canonical부정합과현재운영동등성의미확인은계속보존한다.
