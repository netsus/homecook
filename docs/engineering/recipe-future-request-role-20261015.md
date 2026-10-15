# 레시피 수정 요청의 JWT 역할 읽기 보정

실제 DB231·웹 `0ae67d…`에서 복사 저장과 미래 계획 영향 조회는 성공했지만, 개인 레시피 변경 저장은 재로그인 뒤에도 `ACCOUNT_SESSION_STALE`/409를 반환했다. 총괄이 확인한 PostgREST 로그에는 새 `read_recipe_future_patch_result` 요청과 `55000` 거절이 있으므로 BFF의 세션 확인 이전 반환은 아니다. 운영 조작과 후속 적용은 총괄이 담당한다.

기존 dispatcher는 `request.jwt.claims` JSON의 역할을 읽는다. DB231에서 추가한 outer scope 함수만 옛 `request.jwt.claim.role` 설정을 직접 요구해 JSON만 전달되는 정상 service 요청이 기존 allow-list로 내려갔다. 기존 목록에 새 두 RPC 경로가 없어 같은 세션 오류로 거절됐다. 원 native helper는 두 설정을 함께 넣어 이 차이를 검증하지 못했다.

## 변경 범위

새 `20261015100000_recipe_future_request_role.sql`은 정확한231 함수의 definition/source·owner·ACL·search path·security definer·volatility·인자·결과를 확인한 뒤 outer 함수 하나의 역할 읽기를 `auth.role()`로 바꾼다. 이는 기존 session authority 함수가 쓰는 JWT 역할 읽기 방식이다. scope·POST·두 RPC 경로와 이전 delegate를 유지하고, 원231 SQL·review/PIN/receipt·테이블·정책·worker·앱 runtime은 변경하지 않는다.

`CREATE OR REPLACE`로 기존 postgres 소유권과 postgres 전용 ACL을 유지한다. 새 RPC의 실제 세션 tuple·계정 generation·소유자·멱등성 검사는 기존 본문 그대로다. 이 변경은 익명이나 일반 authenticated 역할에 새 RPC 실행 권한을 주지 않는다.

## 격리 검증

`HOMECOOK_RECIPE_REQUEST_ROLE_NATIVE=1 pnpm exec vitest run --config vitest.product.config.ts tests/recipe-request-role.native.test.ts`로 실행한다. 기존 고정 schema-only228 dump와 password-free roles의 SHA를 확인하고 원229/230/231 SQL을 그대로 적용한다. 고유 UUID/label, 고정 이미지, pull-never, network-none, port/mount 없는 자기 컨테이너만 Unix socket으로 사용하고 호출마다 소유권을 확인한다. 실제 DB·key·AI·서비스를 사용하지 않는다.

현재231과 같은 outer definition SHA `59cd9173…`에서 JSON claims+실제 service 역할/옛 설정 없음의 거절을 먼저 재현한다.232 적용 뒤 같은 요청의 통과와 익명·authenticated·역할 누락/불일치, 다른 scope·method·path 거절을 확인한다. 기존 preview 허용, 원 owner/ACL/config, 다른 함수·관계·열·제약·RLS 정책·namespace·role 메타데이터 불변도 확인한다.153개 애플리케이션 표는 초기0행이며 인증 bootstrap과 사용자 저장을 재현하는 검사는 아니다. 소유 자원은 종료 시 삭제하고 원 실패와 결과는 `/tmp`에 보존한다.

이 검증은 요청 scope 경계만 증명한다. 실제 사용자 저장 성공·운영232 적용·새 승인 chain·전체 v9 완료를 뜻하지 않는다. 원231 승인 기록을 수정하지 않고 기존 배포 engine/CLI를 이용하는 별도231→232 exact successor 결속은 총괄의 다음 단위다. 웹 runtime 변경이 없어 이 보정만을 위한 웹 재배포는 필요하지 않다.
