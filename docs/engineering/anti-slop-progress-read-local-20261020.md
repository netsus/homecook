# Anti Slop 후속 — 로컬 Progress 경계·P5 인계 조사

상태: **로컬 검증·독립 리뷰 완료, 미머지·미배포**. 기준은 `origin/master d90af7a976392eb052a1d6557d3ab8c2bebb7221`이다. 운영 `eb7df156d24b361a0e91b17345522cd1b15f05b1`의 인증 QA는 부모의 지원 Chrome 세션이 담당하며, 이 작업에서는 운영/DB/자격/PIN/worker/정책을 읽거나 변경하지 않았다. push/PR/머지/배포도 실행하지 않았다.

## TS2589의 최소 원인과 국소 수정

- TypeScript5.9.3·Supabase/PostgREST2.99.1의 실제 설치 소스를 사용했다. 앱 import, JSON payload, 보상 정책, 교집합 없이 `{id,user_id}` 행과 `select('id')`만으로도 SDK `from→select→eq` builder를 손코딩 consumer 객체와 구조 비교할 때 TS2589가 재현된다.
- 선택열 literal이나 `eq` column literal, 단방향 결과 단계만으로는 해결되지 않았다. 정확한 schema는 선택 후 객체 단독 비교를 통과시키지만, 두 `from` overload를 가진 client 전체 비교는 여전히 실패한다. 따라서 클라이언트 초기화만의 문제나 선택열 수만의 문제로 단정하지 않는다.
- SDK `PostgrestFilterBuilder.ts`의 `ResolveFilterValue`(43행)와 `eq`(104행)는 관계/JSON 경로 조건 추론과 self-return을 포함한다. `eq` 함수 단독 대입과 실제 `eq` 호출 후 결과 대입은 통과한다. 실패는 그 generic 메서드를 포함한 builder 객체의 비교 경계로 좁혔으며, JSONpath 특정 분기가 단독 원인이라고 증명한 것은 아니다.
- 기존 bootstrap에서도 쓰는 공식 SDK `match({user_id})`는 같은 `user_id=eq.<value>` URL을 만든다. Progress의 읽기3곳만 이 방식으로 변경하고 정확한 선택열·필터 후 결과 단계만 계약으로 남겼다. 이벤트 insert·summary upsert·보상/중복·부가 projection 실패 처리는 그대로다. 새 공통 추상화/의존성/단언/any/검사 억제를 추가하지 않았다.
- `ReturnType<typeof createClient>`는 실제 기본 인수 호출로 생성된 SDK와 같지 않다. constructor의 일반화된 반환 타입만으로 비교하면 다른 schema/never 추론을 검사하게 되므로, 재현의 가상 TS에는 실제 기본 호출을 적고 실행은 하지 않았다. factory/auth/proxy 초기화를 변경하지 않았다.

변경 전 신규 실제 SDK 직접 대입 검사는 전체 비증분 tsc에서 TS2589/exit2였다. 변경 후 최종 전체 비증분 tsc/변경7파일 lint(max-warnings0)/diff는 exit0, 관련7suite46 PASS다. 신규6개는 기본 SDK 직접 대입, owner 세 입력(특수문자 포함)의 기존 eq URL 동등성, summary 없음→events→upsert 순서, 권한 오류 단락을 확인한다. 기존5 fixture에는 match 지원만 추가했고 기대값은 완화하지 않았다. 독립 리뷰도 APPROVE(직접3suite19 PASS·전체 비증분 tsc/lint/diff)다. 중복된 검사 성공 수를 합산하지 않는다.

Anti Slop은 **125/baseline207/신규0 유지**다. Gamification 전체 계약과 기존 route4건의 연쇄 단언을 제거한 변경은 아니므로 원29건21완료/8잔여 집계는 그대로다. 기존 `codex/anti-slop-growth-contract-20261020`의 실패 dirty3파일은 수정하지 않고 보존했다.

재현 산출물(저장소 ignored `.omx`, 운영 연결 없음):

- 기존 실패 WT `.omx/evidence/progress-ts2589-20261020/reproduce.mjs`: 매 case 새 Program으로15개 대조, 예상 TS2589 5개/진단0 10개를 고정한다. exit0은 **실패 재현이 예상과 일치함**이지 제품 타입 전체 통과가 아니다.
- 이 WT `.omx/evidence/progress-sdk-minimal-20261020/generic-eq.mjs`: generic column/value/property 대안도 실패함을 확인하고 match/eq함수 대조를 포함한다. compiler의 추론 한계나 옵션을 바꾸지 않는다.

## P5 인접4건: 기다리는 것은 제품정책이 아니라 작업 소유권 인계

**후속 인계로 대기 해제:** 부모가 현재 활성 작업은 이 계약 작업과 코드 편집·배포가 금지된 요리 QA뿐이며 v85 담당도 완료했다고 명시했다. 다른 활성 P5 담당은 확인되지 않았다. root가 main/P5/catalog 작업트리의 상태를 읽기 전용으로 확인·보존했다. main의 기존 legal 변경은 대상 route와 다르며, catalog WT에는 과거 미커밋 파일이 남아 있으나 아래3 route와 공유 타입2개의 working bytes는 최신 `origin/master`와 차이0이다. reset/stash/덮어쓰기/잠금 해제 없이 최신 d90의 별도 clean WT에서 목록 GET부터 진행한다. 따라서 아래 질문은 더 이상 착수의 필수 승인 조건이 아니며, 다른 활성 담당이나 새 dirty overlap이 실제 발견될 때 전달할 확인 목록이다. 운영 배포 대기는 인증 QA 종료 인계까지 그대로 유지한다.

공식 [bridge 계약](youtube-recipebook-planner-bridge-20261012.md)의34–49행은 이미 master에 반영된 canonical/source-only/private authority와 공개 projection 계약이다. 67행의 구형 save service-role fallback은 명시 보존이며, manual POST의 optional `create_manual_recipe` RPC→direct-DML fallback과 별개다. 이 정책을 다시 결정해 달라고 요청할 필요는 없다.

| 파일 | 보류된 계약/수정 단위 | 필요한 인계 |
| --- | --- | --- |
| `app/api/v1/recipe-books/[book_id]/recipes/route.ts` | 목록 GET의 canonical bridge·owner detail_href, native 선택 행 | 파일 편집 freeze와 type-only 분리 허용 |
| `app/api/v1/recipe-books/[book_id]/recipes/[recipe_id]/route.ts` | GET의 owner saved RPC/타 사용자 public projection, DELETE의 my_added403·growth | GET/DELETE가 같은 파일이므로 파일 전체 freeze; DELETE는 growth 경계도 선행 확인 |
| `app/api/v1/recipes/route.ts` | manual/derived POST의 optional RPC/기존 direct-DML·bootstrap/growth·권한 순서 | 파일 freeze와 기존 fallback/호출 순서 보존 확인; 마지막 순서로 진행 |

관련 공유 타입은 `types/recipe.ts`, `types/youtube-saved-recipe.ts`다. 등록된 P5 worktree는 `youtube-human-reviewed-source`, branch `codex/youtube-v86-source-name-quantity-repair-20261012`, head `80d2cbf309a0dbe94dbb7ce4cce5c2aff81c8ea4`이며 현재 로컬 ref 대조는 master614/P543이다. 커밋 diff에는 위3 route overlap0이나 두 공유 타입 변경이 있다. 마지막으로 root가 `GIT_OPTIONAL_LOCKS=0 git -C <P5> status --short --branch`와 `rev-parse HEAD`만 읽어 **등록된 이 WT는 clean**임을 확인했다(파일 편집·index 갱신·checkout0). 독립 조사자는 filesystem을 열지 않아 당시 dirty를 미확인으로 보고했으며, 이 마지막 root 관측으로 그 제한만 보완했다. 다만 이 오래된 등록 WT가 담당자의 현재 실제 작업 위치인지와 앞으로의 편집 freeze는 여전히 인계가 필요하다. clean/idle은 작업 종료 증거가 아니다. 별도 catalog-selection 작업의 master 통합 역시 원P5 종료 증거로 확대하지 않는다.

부모가 담당에게 전달할 질문은 다음3개다.

1. 원 세션 `01a12fcc-1869-73c2-ace7-a1e6873780ab`의 현재 실제 작업 위치가 위 clean WT `80d2cbf30`인가, 별도 canonical bridge 후속 WT인가? 다르다면 실제 active WT/branch/head와 dirty·미추적·남은 편집 파일을 알려 달라. 같은 위치라면 이미 확인한 clean 상태를 다시 제출할 필요 없이 남은 편집 범위/종료 여부만 확인해 달라.
2. 위3 route와 공유 타입2개를 파일별 `FREEZE YES/NO`로 답해 달라. 특히 detail GET/DELETE는 파일 전체를 잠글 수 있는가? 남은 코드가 없으면 `REMAINING_EDITS=NONE`, 종료했으면 `HANDOFF_READY=YES`를 명시해 달라.
3. 확정된 canonical/public bridge·private source/edit authority·공개 민감정보 비노출·my_added DELETE403·두 fallback을 그대로 두고, 최신 master 별도 WT에서 `list_GET`, `detail_GET_DELETE`, `manual_POST`의 route-local 타입/선택 단계+검사만 분리하는 것을 각각 `ALLOW/BLOCK`으로 답해 달라. 계약 변경이 pending이면 해당 항목·결정자·이유만 알려 달라.

최신 인계에 따라 독립 수정 가능한 list GET→detail GET부터 진행하고 DELETE→manual POST는 공통 growth 경계를 함께 확인한다. 새 PENDING/dirty overlap이 실제 발견되면 해당 파일만 보류한다. 다른 작업의 old branch를 cherry-pick/rebase하지 않으며, 운영 배포는 인증 QA 종료 인계 뒤에만 직렬 진행한다. 기존 권한3건·보류444·실패 기준선은 미해결로 유지한다.
