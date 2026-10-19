# 현재 영양 발행·분수 저장의 별도 운영 권위

## 범위

기존 운영 웹196·DB235를 출발점으로 현재 저장 레시피의 명시 catalog 선택, 현재 내용의 영양 발행, 분수 JSON 왕복 저장을 묶는다. 별도 `saved-recipe-nutrition-experience` feature의 PIN/guard/receipt를 사용한다. 원235 승인·receipt·reader floor와 v85 A/B·gen50·고정 만료·키·정책은 수정하지 않는다.

정확한 추가 SQL은 아래3개다. 순서·raw SHA·transaction 외피를 제거한 payload SHA·전체235 prefix를 함께 검사한다.

| 순서 | 파일 | SHA256 |
| --- | --- | --- |
| 236 | `20261019120000_youtube_saved_catalog_selection.sql` | `b7df06e51c2cb9ea95eb03154cf4b80e0268c949c4d104be4f72d464d2e88ac6` |
| 237 | `20261019130000_youtube_saved_nutrition_publication.sql` | `fc9f65b1d592ae60062fbc7a3eaa40da8b8fa6a3d17d6b9f676e053e6ad7e60e` |
| 238 | `20261019140000_cooking_quantity_json_echo.sql` | `d75f523bae2b443ad5bc17e1ab39ddc68976c2a8b8edb9e60de7722e4f313f29` |

기존9함수 교체와 private helper1개 추가만 허용한다. 기존OID·owner·grantor를 포함한 ACL·설정·security·volatility를 보존한다. public nutrition guard의 SQL→PL/pgSQL 언어 변경만 명시적으로 허용하며 private pre-product guard와 worker 고정 함수는 유지한다. raw catalog remainder는 정확10 signature만 제외하고 table·scope·role·schema·열의 표현은 모두 포함한다. 복원 fixture와의 알려진 표현 차이는 기존 고정 canonicalizer의3 query에서만 처리하며 생성된 query SHA도 결속한다.

현재 웹196에는 원235 운영 도구의 후속이 모두 들어 있지 않다. master40b9의 기존 `cooking-experience-maintenance.mjs`와 `marketing-round2-controlled-deploy.mjs`는 정확한196→40b9 Git blob 쌍으로만 운반한다. 이번 feature는 두 도구의 임의 수정이나 과거 PIN 재지정을 허용하지 않는다.

## 적용과 복구 계약

공식 `pnpm deploy:dev` 경로에서만 `saved-nutrition-database`, `saved-nutrition-database-retry`, `saved-nutrition-reconcile`을 지원한다. 미결속 PIN은 private config나 운영 target을 읽기 전에 거절한다. 적용 시 기존 controller로 같은 worker plist를 중지·복구하며 generation/키/expiry/policy를 바꾸지 않는다.

SERIALIZABLE transaction, 기존 lock, exported snapshot에 묶인 전체 DB·roles backup/복호 해석, postgres payload 실행과 원장 소유자의 ledger 기록을 재사용한다. 전체 normal-data SQL은 줄이지 않는다. 실제 실행분 전행과 원235 원장 전체도 별도로 지문화해 DDL 전후에 비교한다. source9/10함수의 실제OID와 scope outer/alias OID도 비교한다. native raw after catalog는 COMMIT 전 intent와 terminal receipt/reconcile에 결속한다.

COMMIT 응답 미확인은 기존 guard를 보존하고 명시 reconcile로 분류한다. SQL을 자동 재전송하지 않는다. 새 unknown/foreign guard는 원235 fallback을 금지한다. `not_applied`는 별도 terminal/guard 일치 후에만 원235로 돌아갈 수 있다. 이후 일반 사용자 쓰기로 바뀐 행 지문을 원 transaction의 보존 증거로 바꾸지 않는다.

새 웹 source handoff는 정확196 build/plist→승인 target과 모든 변경 파일의 양쪽 SHA를 검사한다. 새 SQL 감지, scope 분류, baseline/recovery의90초 비동기 read 경로를 같은 두 feature에 한정해 연결한다. 역사 v74 검증에는 원232 predecessor를 그대로 전달한다. C04/개인 실측 writer 전환은 계속 별도 권위가 필요하다.

## 검증 상태

제품은236 SQL15개·237 SQL20개, API/UI72개, 타입·빌드·관련 lint를 통과했다. 제목/단계만 바꾼 뒤 발행 pending에서 새 끼니가 옛 content pin을 고르는 P2를 실제 회귀18 PASS/2 FAIL로 재현한 뒤20 PASS로 수정했다. 제품 최종 독립 리뷰 잔여 P1/P2는0이다. [제품 계약과 한계](saved-recipe-catalog-selection-20261019.md), [분수 저장51회귀](cooking-frozen-quantity-json-echo-20261019.md)를 따른다.

운영 권위의 첫 격리 실행은 실제 commit,236/237/238 각각의 중간 오류 rollback,COMMIT 뒤 backend 종료·ACK 미확인 reconcile5사례를 통과했다. 전체 백업 decode와 async timer, 기존 실행분·scope OID·controls 보존, DDL 재발송0을 확인했다. 최종 실행 `dc721348dc3b93852c69bfee735f08ea`은 ACL grantor·카탈로그 음성 검사·백업 중 admission fence 유실·ACK 미확인 후 동일 정의 함수 재생성을 포함한7사례/20음성 검사 PASS와 cleanup을 확인했다. 원 commit intent의10함수 OID와 scope OID를 receipt에 보존하고 apply/reconcile/이후 baseline에서 대조한다. 실제 재생성에서 raw catalog와 portable image는 같았지만 OID만 달라 reconcile이 거절되고 원 unknown guard·DDL 재발송0을 유지했다. [최종 격리 증거](data/saved-recipe-nutrition-maintenance-checks-20261019.json)를 따른다. native fence 유실 검사는 backup 뒤 boundary에서 DDL0을 보장하는 범위이며 실제 worker 재부팅이나 controller의 모든500ms containment를 증명하지 않는다.

최종 소스 고정 전 task 관련 기존 Anti Slop 위반5곳은 조건부 속성 대입과 이미 검증된 typed DB client 재사용으로 정리했다. baseline·권한·SQL은 바꾸지 않았으며 선택59회귀와 관련 lint·Anti Slop 신규0을 확인했다.

후속 운영 적용·두 오일 행의 실제 CAS·최종 Chrome 재검증은 아직 실행하지 않았다. [현재 운영과9개 QA 상태](cooking-experience-operating-checks-20261019.md)를 함께 본다.
