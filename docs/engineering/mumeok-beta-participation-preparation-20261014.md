# C05 선택 참여 — 로컬 준비와 남은 작업

현재 상태는 코드 준비이며 운영 완료가 아니다. 정책·기간 미정, 운영 UI 비활성, 참여/수집 OFF를 유지한다. 90일/1년을 임의로 채택하지 않는다. 정확도 개선에 필요한 표본량과 오래된 자료의 유용성을 근거로, 실제 저장·삭제·백업 처리까지 구체화해 별도 승인을 받는다.

## 구현

- 서버가 확인한 계정/세대별 선택·문서 버전/hash·시각·revision·멱등 처리를 준비했다. 화면의 계정 대신 다른 계정에 쓰지 못하도록 `expected_subject`를 API/DB에서 검증한다.
- 모바일 최초 선택 안내와 모든 기기 설정은 QA fixture에서만 제공한다. 필수 로그인·개인 실측·식단 작업에는 참여를 요구하지 않는다.
- 신규 참여 OFF·새 문서에도 기존 철회 접근을 유지한다. 401은 이전 주체 상태를 무효화하고, 일시적인 네트워크/5xx 변경요청 실패는 기존 선택과 재시도키를 보존한다. 조회 실패는 확인 불가 상태로 표시하며 서버에서 철회됐다고 간주하지 않는다. 계정 변경 중 늦은 응답은 새 주체를 덮지 않는다.
- 순수 표본/정리 평가 함수는 모르는 근거·예정 투입량·QA·추정·잔량을 제외하며 수집·실제 정리완료·모델 활성화는 항상 false다. 실제 수집기를 구현하거나 연결한 것으로 보지 않는다.

## 검증

주체 전제조건·철회 접근 반례를 먼저 재현했다. UI24, backend31·격리 PostgreSQL9·비활성 gate54가 통과했고, 독립 검토자는 실제 Next 모의 화면의 정책OFF/문서 교체/401/500 및 늦은 이전 계정401을 확인했다. 실제 기존 인증/수명주기 함수와 configured pre-request·service_role을 이용한 schema-only archive218→정확219→C05 격리 검증도 통과했다. 운영 자료 복원0, 운영 DB 접근0, 소유한 격리 자원만 정리했다. 실제 HTTP JWT/gateway 검증은 미실행이다.

구현자와 리뷰어를 분리했다. 최초24파일은 batch1_servings 구현/plan_inventory 검토, 발견된 서버7파일 delta는 plan_inventory 구현/root 검토, UI3파일 delta는 root 구현/plan_inventory 검토다. 실제 화면 증거와 API/DB 검사를 서로 대체하지 않는다. 최신 master 23b5166 통합 후 build·typecheck·변경 TS/TSX lint가 통과했다. 후속 UI/서버·기존 설정 4개 suite 111개 검사도 통과했다. 최초 typecheck의 테스트 타입 오류는 동일한 정확 매칭/성공 응답 조건을 유지해 교정했다. build의 기존 무관 경고 4건은 별도로 남는다.

## 후속 단위와 운영 경계

C03→C01→C05의 최종 스키마·함수 계약 통합은 아래 같은 날짜 후속 검사로 보완했다. C04 수량 계약과 D3~D5 통합은 남아 있다. 운영 적용은 총괄의 기존 승인 범위와 정확한 SQL·실제 DB 대상·백업·복구 계획을 따른다. 기본 OFF 적용은 활성 동의문이나 실제 수집 승인을 뜻하지 않는다.

실제 투입량·전체음식·용기제외·섭취 전·테스트 자료 제외·정정 무효화 근거, 최소 선별본과 삭제 연결·만료/재시도·철회/탈퇴·백업복원 처리, 영향 모델 제외/재계산/검증/되돌림이 미완료다. [D3~D5 준비안](weight-improvement-d3-d5-draft.md)에 목적별 필드·기간을 제안할 방법과 미구현 영역을 구분했다. 실제 자료 수집·모델 학습·외부 AI 호출은 실행하지 않았다.

## C03→C01→C05 실제 함수 통합 · 2026-10-14

기존 D1/D2의 작은 PostgreSQL stub 검사는 실제 C03/C01 통합 근거로 쓰지 않는다. 허용된 schema-only219 archive SHA `5447e5ae08359feb9750676820968daf2edcf0ed57b64997e718ccc8d8dae790`와 비밀번호 없는 roles SHA `a37b43865c14194ab8aae8758c7f596679cc50e93f425d0af52767f54b9145d3`를 새 UUID label의 소유한 Supabase PostgreSQL17.6 컨테이너에 복원했다. 고정 image `public.ecr.aws/supabase/postgres@sha256:a9946f08d31e8eb1149229c94e5c26603a9233116807cbbd93d75179cbac516a`, `--pull=never`, network none, host port·mount0이다. `/tmp`와 `/var/run/postgresql` socket 경로를 내부에만 준비한다.

public/private/auth 자료 행0과 `homecook_deploy.migrations` 이력 행0을 먼저 확인했다. 원 이력표의 owner `supabase_admin`과 postgres SELECT-only는 그대로이며, 승인된219 filename/SHA metadata만 admin으로 seed했다. 기능 DDL은 실제 `postgres` principal로 아래 정확한 순서에 적용했다. 세 SQL은 수정하지 않았다.

| 순서 | migration | SHA256 |
|---|---|---|
|1|`20261013190000_recipe_product_only_identity.sql`|`0a1f518ab49a1171d825b87eaeea6210e59b4cf0e08022b40a3dea05fb1e7f75`|
|2|`20261013233000_cooked_batch_weight_evidence.sql`|`0c92fa9d4a83cfefa5313e7b8a13c610ac108555248d1db756d4bd7f2d8384af`|
|3|`20261014230000_weight_improvement_participation.sql`|`bc263347ef51f7ffc86731b7c161618f3181b81cd00bf8f2ec57a01b989eeda8`|

[C05 source postimage](../security/weight-improvement-participation-source-function-postimages.json)는 정확 원 SQL의 body/raw MD5와 C01 이후 pre/post 함수 계약을 결속한다. C05의8개 함수 중 기존 outer1개만 바뀌며 새 helper/RPC6개와 보존 alias1개가 추가된다. 기존 outer의 본문·owner·ACL·security-definer·volatility·전체 proconfig는 `private.verify_scope_pre_weight_participation_20261014()`에 그대로 남는다. C01의15개 함수는 outer의 alias 대응을 포함해 원 본문과 속성을 보존한다. 실제 authority·configured pre-request 함수와 role config도 불변이다.

`includeWeightImprovementParticipationFunctions:true`는 기존 C03/C01 opt-in과 함께만 사용한다. C058개 및 combined45개의 signature·body·owner·ACL·search_path·volatility를 별도 검사한다. C058개는 전체 proconfig도 정확히 검사하며, 이전 C03/C01의 전체 proconfig 보존은 native pre/post 비교로 확인한다. whole inventory는90→97개로 늘린다. C05 함수의 추가 `statement_timeout` 설정은 본문/권한/search_path가 같아도 configuration drift로 거절한다. C03/C01의 기본 검사와 권한은 유지한다. whole inventory의 기존 source8·owner18·ACL16·search_path2·RLS-owner1·table-ACL2·unexpected-policy1·membership8 차이는 전후 그대로다. 이를 새 정상 baseline으로 승인하거나 전체 보안 PASS로 보고하지 않는다.

`tests/weight-improvement-participation.native.test.ts`의 fresh native12검사는 실제 service_role, 원 authority, authenticator의 설정된 `public.verify_full_local_postgrest_request_authority`를 사용한다. OFF/null 읽기의 참여/receipt 쓰기0, collection CHECK(false), API 직접 표 권한0, 정확 POST 경로와 기존 C01 위임, 명시 현재문서 동의, 불변 event, 동일 키 재생, notice/decline 구분, owner/session/deleting 거절, expected generation의 receipt 이전 거절, 새 generation의 옛 참여 부활0, OFF 뒤 철회와 옛 opt-in 키의 현재 withdrawn/pending 재생을 확인한다. generation fixture는 원 복합 FK·한 owner의 active1·binding identity 불변을 지키며 새 synthetic lifecycle/binding을 추가한다. 실제 계정 재가입이나 HTTP JWT 서명 검증을 뜻하지 않는다.

로컬 보안 회귀6파일15검사와 native1파일12검사가 각각 실패/skip0·exit0이다. 타입 검사·변경4개 TS/JS ESLint·diff 공백 검사를 별도로 확인했다. 새 product TypeScript 변경은 없다. fixture와 source 추출 컨테이너는 각각 자기 label/image/CID를 확인한 뒤 자기 CID만 제거했다. `/tmp/mumeok-c05-native-integration-report.json`, `/tmp/mumeok-c05-native-final.log`, `/tmp/mumeok-c05-source-extraction-cleanup.json`에 검사와 정리 증거를 둔다.

초기 준비에서 일반 Supabase 이력표 이름을 잘못 추정한 컨테이너는 준비 실패로 폐기했고 통합 증거에서 제외했다. fresh 복원 후 실제 원 이력표를 사용했다. generation fixture의 기존 PK/binding 재작성 및 active 중복 실패도 보존한 뒤 제약을 바꾸지 않고 fixture만 교정했다. 실제 운영 DB·서비스·config·키·worker·네트워크 호출·실제 사용자 자료 복원은0이다. C04 교차 계약, collector·표본 registry·삭제/기간/복원·D4 모델·D5 실제 탈퇴/정정 연쇄 처리는 여전히 미완료다. 정책/보유기간은 미정, 수집 OFF이며 임의 기간·삭제 완료·정확도 개선을 주장하지 않는다.
