# 유튜브 저장 레시피북·플래너 연결

상태: 웹과 DB219 운영 반영 완료. worker는 기존 c51d/gen46을 유지한다.

## 운영 반영 (2026-10-13)

- 승인된 순서대로 웹 `8e515a6482a1dfaa292d6f67ae6aa8a06f84d2d4` (`prelaunch-8e515a6482a1-I0Aj7c`)를 먼저 올리고, 정적 asset과 실행 상태를 확인한 뒤 DB219를 적용했다.
- 최초 DB apply 시도 `db8f816c-3e11-4e36-9e20-c4695db77195`는 공용 DB adapter가 `postgres` 역할로 migration ledger lock을 열어 권한 오류가 났다. backup·migration·commit dispatch 전에 실패했으며, fresh DB218/저장 4건/bridge 부재를 다시 확인한 `verified_not_applied` reconciliation은 `mutationPerformed=false`, `guardRemoved=true`로 끝났다.
- 운영 드라이버는 통합 DB 세션만 고정 로컬 Docker의 `supabase_admin`으로 열도록 분리했다. 불확실한 pre-commit 실패는 실제 DB218, 저장 4건, privacy 0건, bridge 부재, 죽은 session을 모두 확인하는 정확한 `reconcile-not-applied` 경로 외에는 guard를 해제하지 않는다.
- 재시도 operation `f7860129-ad3b-4244-9cc5-3378d1a35765`는 migration `20261012120000_youtube_saved_recipe_canonical_bridge.sql` (`e51b6a…d4993`)과 ledger 219를 같은 transaction으로 commit했다. 적용 전 queue/processing은 0, permit holder는 없었다.
- 적용 직전 full archive는 `/Users/cwj/.homecook/operations/youtube-integrated-20261013/f7860129-ad3b-4244-9cc5-3378d1a35765/backup/postgres.dump`, SHA-256 `15c29821618e9cb7c70bbbe0df2cb2f0bd3246924352667bf8ce047400f48097`, 117,547,295 bytes다. roles SHA-256은 `33b16c…a84277`, snapshot은 `00000034-00006838-1`이며 full archive decode를 확인했다.
- poststate는 saved 4, canonical 4, invalid 0, 명시적 privacy 선택 0이다. `record-integrated-master-database`가 release/ledger/checksum을 다시 확인한 뒤 rollback guard를 제거했고 현재 웹 status는 release `8e515a…`, ledger 219, guard 없음이다.
- 익명 공개 `q` 검색은 `신김치 제육볶음` canonical ID `cef3198a-a846-4fd6-beb3-2868591e0f7f` 1건을 반환했다. 공개 상세는 재료 15개·단계 21개를 반환하면서 `source_snapshot_json`, `editable_content_json`, `owner_user_id`, `canonical_recipe_id`, raw transcript를 노출하지 않았다.
- 사용자 Google Chrome에서 배포 홈의 YouTube canonical 카드와 theme를 실제 픽셀로 확인했다. 다만 저장돼 있던 계정 세션이 `HOMECOOK_HYBRID_AUTHORITY::ACCOUNT_SESSION_STALE::409`라 검색 UI와 마이페이지가 로그인 API 오류로 닫혔다. 세션을 우회·재발급하거나 운영 계정을 변경하지 않았으므로 owner의 레시피북→편집→플래너 모달 실흐름은 재로그인 뒤 최종 확인이 남는다. 익명 API 성공과 서버 로그를 대조해 DB219/공개 검색 실패가 아니라 stale browser session으로 구분했다.
- 운영 worker는 release `c51d53871f31c7840fe24792b46b191ca963b11b`, credential generation 46 그대로다. v71 policy/credential, queue, launchd는 이 반영에서 변경하지 않았다.

## 첨부 화면에서 확인한 원인

- Library `libfile_7b81fb6dc7cc81918a33891255790716`의 2048×1284 PNG를 실제 픽셀로 확인했다. 운영 화면은 `/recipes/youtube/saved`에서 세 저장 레시피를 `유튜브에서 가져온 레시피` 전용 카드 목록으로만 보여준다.
- Library `libfile_ca3a3faef864819193576b66090f309a`의 2048×352 PNG를 실제 픽셀로 확인했다. 일반 레시피북 상단에도 `유튜브에서 가져온 레시피` 별도 진입 배너가 있어 `내가 추가한 레시피`와 분리된 정보 구조다.
- 화면 분류는 별도 배너·목록 때문에 발생하지만 플래너 단절의 근본 원인은 저장 결과에 일반 플래너가 소비하는 canonical `recipes.id`가 없던 점이다. 이번 변경은 전용 상세를 삭제하지 않고 호환 경로로 유지하면서 canonical 연결을 추가하고, 기본 노출·재사용 흐름만 일반 사용자 레시피와 합친다.

## 사용자 흐름

유튜브 추출 결과의 원본 보존형 편집 문서는 그대로 유지한다. 자동 저장이 완료되면 같은 소유자가 만든 public canonical recipe ID를 1:1로 연결한다. 이 ID 때문에 저장 결과는 `내가 추가한 레시피`의 기존 목록·개수 계약과 공개 검색에 함께 포함되고, 다른 사용자도 자신의 레시피북·플래너·요리 흐름에서 재사용할 수 있다. 저장 태그는 기존 검토 태그 동기화 계약을 재사용해 승인된 시스템 태그만 공개 태그 검색·테마에 참여한다. 카드에서 다시 열면 owner만 기존 유튜브 편집 화면으로 돌아가며, 저장 후에는 `내가 추가한 레시피에서 보기`로 기존 레시피북 reader에 진입한다.

마이페이지의 별도 `유튜브에서 가져온 레시피` 진입 배너는 제거한다. 기존 `/recipes/youtube/saved` 목록과 상세 URL은 북마크·뒤로가기 호환을 위해 유지한다.

## 데이터·권한 계약

- `youtube_saved_recipe_results.canonical_recipe_id`는 `recipes.id`와 1:1이며 최초 배정 후 바뀌지 않는다.
- 연결 recipe는 `created_by=owner_user_id`, `visibility='public'`, `source_type='youtube'`다. 공개 canonical recipe의 읽기·저장·플래너 사용은 다른 사용자에게도 열리지만 원본 저장 문서와 수정 권한은 owner에게만 있다.
- 제목·썸네일·인분·태그·revision만 canonical recipe에 동기화한다. 원본 근거와 편집 JSON, ingredient link projection이 저장 내용의 권위다.
- 미해결 재료는 공용 catalog ID를 꾸며내지 않는다. 플래너의 불변 content snapshot 안에서만 recipe ID와 row ID로 결정적 synthetic UUID를 만들고, 실제 catalog ID와 충돌하지 않음을 확인한 뒤 원문 이름·표시 문자열·미해결 상태를 함께 고정한다. 장보기의 catalog 집계는 실제 연결 ID가 없는 행을 catalog 재료로 승격하지 않는다.
- 공개 상세·독립 요리모드는 저장 문서에서 표시용 재료와 단계만 투영한다. owner ID, 저장 draft ID, 원본 evidence, source snapshot, ingredient link 상태와 mutation metadata는 응답에 넣지 않는다. 미확인 분량은 그대로 표시하되 영양 계산에는 포함하지 않는다. 투영 서비스가 없으면 빈 성공을 반환하지 않고 500으로 닫는다.
- `recipe_sources.extraction_meta_json`에는 저장 draft ID나 원본 extraction metadata를 복사하지 않고, 민감 정보가 없는 boolean bridge 표식만 둔다. owner 편집 URL은 canonical recipe ID를 owner-scoped 저장 RPC가 다시 해석한다.
- public recipe snapshot은 `owner_user_id=null`로 고정해 다른 사용자가 자신의 플래너에서 같은 불변 내용을 안전하게 재사용한다.
- 레시피북 상세는 공개 canonical recipe의 표시 projection을 사용한다. owner의 편집 재진입만 기존 owner-scoped 저장 RPC를 사용한다.
- canonical recipe가 삭제되면 연결 저장 결과도 함께 삭제된다. 공개 읽기가 private 저장 문서나 owner mutation 권한을 노출하지 않는다.
- 계정 삭제는 private 저장 문서를 제거하고 bridge recipe를 공개 검색에서 soft-retire한다. 다른 사용자가 이미 만든 meal과 owner-neutral snapshot은 과거 기록으로 보존한다.

## 기존 데이터 backfill

새 migration은 기존 저장 결과마다 owner-created public recipe 한 행과 recipe source 한 행을 만든다. 기존 4건에는 별도 `visibility`·`privacy`·`is_public` 선택값이 0건임을 읽기 전용으로 확인했고, 사용자 요청에 따라 신규 저장과 같은 공개 검색 계약을 적용한다. 별도로 비공개가 명시된 수동 레시피는 대상이 아니다. 저장 결과의 `editable_content_json`, `editable_content_hash`, revision, source snapshot은 바꾸지 않는다. 기존 멱등 응답에는 새 recipe ID만 보완한다.

운영 적용 전에 확인했고 승인받은 범위와 위험은 다음과 같다. 실제 결과는 위 운영 반영 절을 따른다.

- 증가 행: 기존 저장 결과 수만큼 `recipes`와 `recipe_sources`가 각각 증가한다.
- 잠금/시간: saved results 전체를 한 번 갱신해 trigger backfill을 실행하므로 운영 원장 크기와 적용 시간을 사전 조회해야 한다.
- 되돌리기: 플래너 meal snapshot이 새 recipe ID를 참조한 뒤에는 단순 컬럼 제거가 아니라 참조 식사 보존 결정을 포함한 rollback이 필요하다.
- 운영 DB 적용·기존 데이터 일괄 변경은 백업과 대상 건수 확인 후 받은 별도 승인 범위에서 수행했다.
- 배포 순서는 **호환 웹 선배포 → DB219 백업·transaction·backfill → DB 상태 기록 → worker 전환**이다. DB를 먼저 적용하면 운영 f970 웹은 child row가 없는 새 canonical recipe의 내용을 빈 값으로 렌더링할 수 있다. 새 웹은 bridge RPC가 아직 없는 DB218에서도 기존 전용 저장 경로를 유지하므로 이 순서만 허용한다. DB219 뒤에는 f970 웹으로 자동 rollback하지 않는다.

## 변경하지 않는 범위

- P5 추출 모델·평가 데이터
- 저장 결과의 원본/편집 JSON 계약과 optimistic revision
- 구형 `/recipes/{id}/save` service-role fallback
- 신규 signing/trust/auth key 생성이나 인증·보안 설정 변경
- P5 추출 모델의 분량 판정과 영양 계산 정책

## master·운영 웹 통합 후보와 DB 검증 경계

- 통합 후보는 master `7e466b170ba39795220ef64e67eac3fab4429420`에서 시작해 현재 운영 웹 `f970bc1d1f1e981d8947e852a9b51ada4a74570a`를 두 번째 부모로 연결한 `d7fb78ae4c459eed8555046f6480dbe61dc24b79` 위에 이 기능을 적용했다. 47개 충돌은 최신 master 후속 구현을 유지했고, 운영 이력 대응과 파일별 결정은 [재통합 기록](./master-live-reintegration-20261012.md)에 고정했다. 승인된 source-bound 후보 `4c39d0b81`은 조상으로 포함하며, 후속 half-word-range fail-closed 보강으로 client v71·verifier v44·source binding v8이 최종 상태다. 미완성 leftovers, 보류 `444fe1f6f`, 별도 P5 모델·평가 데이터는 포함하지 않는다.
- 운영 DB 원장 218개에 이미 반영된 `20261011140000_retire_unused_ingredients.sql`, `20261011200000_household_spoon_measurement.sql`은 운영 영수증과 같은 checksum의 migration source closure로만 포함한다. 이 두 파일은 다시 실행하지 않는다.
- migration source는 이번 bridge까지 219개다. 격리된 combined verifier에서 219개 schema와 bridge PostgreSQL 검사 10개가 모두 통과했다. 이는 운영 DB를 변경했다는 뜻이 아니다.
- bridge SQL은 함수·트리거·기존 저장 결과 UPDATE를 포함해 일반 추가형 DB 경로에서 거부된다. `scripts/youtube-integrated-controlled-db.mjs`만 정확한 DB218 원장, 운영 대상, 저장 건수, migration checksum을 확인한다. apply는 웹 deploy/rollback과 같은 운영 lock을 점유하고, 검증된 새 웹의 release/build/선배포 상태와 실제 정적 asset 응답이 모두 일치해야 시작한다. jobs·permits·saved results·migration ledger를 transaction 동안 잠가 queue/permit 재유입을 막고, 복원 가능 dump 뒤 같은 transaction에서 migration과 DB219 영수증을 함께 반영한다.
- `deploy:dev --reviewed-integrated-master-readiness --db-config ...`는 DB218과 전체 release descriptor를 읽기 전용으로 확인하고 웹만 먼저 전환한다. DB apply 시작 전부터 내구성 있는 rollback guard와 operation journal을 연결하고, COMMIT dispatch 전 guard를 다시 봉인한다. 따라서 결과가 불확실한 경우에도 이전 f970 웹 자동 rollback은 fail-closed다. DB 적용 후 `record-integrated-master-database`가 public owner-created backfill과 DB219를 다시 확인해 비호환 DB 상태를 기록한 다음 guard를 제거한다.

## 검증 계약

- 신규 저장 → `내가 추가한 레시피` 노출 → reader → 유튜브 편집 재진입 → 수정/저장 → 플래너 추가
- 기존 저장분 backfill과 멱등 응답 replay
- 반복 클릭, 새로고침, 취소/뒤로가기에서 중복 canonical recipe 및 편집 덮어쓰기 없음
- manual recipe 목록·reader·플래너 회귀 없음
- 공개 검색·타 사용자 상세/레시피북/플래너/요리 재사용과 owner-only 편집을 각각 검증
- 미확인 분량은 경고 1개만 보이고, 확인/직접 입력 후 중복 상태 배지가 남지 않으며 영양 계산 제외 계약 유지
- 좁은 모바일 폭, 긴 단위, 키보드 입력에서 단위 입력이 행 밖으로 넘치지 않음

## 로컬 검증 결과

- YouTube 가져오기·worker·재료 연결 회귀는 28개 파일 414개, source-bound 오프라인·권한 회귀는 5개 파일 198개, 레시피북·재진입·플래너·요리모드·배포 회귀는 12개 파일 295개가 통과했다.
- 219개 migration 전체 재생과 PostgreSQL 검사에서 public projection, 공개 태그 검색, 타 사용자 레시피북·플래너 snapshot, owner-scoped update, canonical ID 불변성, 기존 4행 public backfill, source row 비밀정보 비복사, 계정 삭제 뒤 공개 retire와 타 사용자 과거 planner 보존을 확인한다. 격리 컨테이너는 검사 후 제거하며 운영 데이터는 변경하지 않는다.
- `pnpm typecheck`와 `pnpm build`가 통과했다. build는 93개 정적 페이지를 만들었다. `pnpm lint`는 오류 0개, 기준 master에도 있는 경고 9개로 통과했다.
- Playwright Chromium에서 `desktop-chrome`, Pixel 7 기반 `mobile-chrome`, iPhone SE 크기의 `mobile-ios-small` 3개 프로젝트가 최종 코드로 모두 통과했다. 독립 포트 3118에서 저장 결과 재진입, 편집·저장, 새로고침, `내가 추가한 레시피` 이동, 반복 클릭 중복 방지와 좁은 화면 overflow를 확인했다. 포트 3100은 다른 세션의 프로세스가 사용 중이어서 종료하지 않았다. 이는 사용자의 기존 대화형 Google Chrome이 아니라 저장소가 관리하는 Chromium 검사다.
- 배포 도구 단위 회귀를 포함한 집중 검사 333개가 통과했다. 운영 f970부터 정확한 `origin/master`까지의 전체 파일·checksum·두 source commit ancestry를 release descriptor로 고정하며, 이 검토 lane 밖의 파일은 계속 거부한다.
- 정식 `release:production:promote`는 별도로 unconditional fail-closed와 현재 발급할 수 없는 GitHub attestation 때문에 차단되어 있다. Actions 비활성 상태의 정확한 누락 신뢰 계층, 구현하지 않은 offline approval 제안, 권한·rollback 경계는 [읽기 전용 배포 준비 진단](./local-mac-production-actions-disabled-readiness-20261012.md)에 보존했다. guard 제거·파일 은닉·빈 context 허용은 배포 대안이 아니다.
