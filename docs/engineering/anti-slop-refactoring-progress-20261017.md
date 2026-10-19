# Anti Slop·중단 리팩토링 진행 장부

이 문서는 중복 작업을 막기 위한 구현·검증 이력이다. 제품/API/DB 계약이나 배포 승인이 아니다. `AGENTS.md`가 작업 범위와 검사 강도를 결정한다.

- **운영93/후속 소스86:** PR1835 merge5ea를 한 번 공식 배포해 실제build `prelaunch-5ea486e53472-wPutWL`·DB238 ready·웹1473 PASS/133 이름필터 SKIP·99초/정적94/기존경고3·manifest200/보호GET2 wrapped401·읽기 전용 지문9 전후일치. [선행12 운영](anti-slop-planner-contracts-20261020.md)을 확인했다. 별도후속 `207b3a4bc`는 식사5/provider1/삭제JSON1의3논리커밋으로 통합163 PASS·전체 타입/lint/verify86new0·독립 코드승인, 원16377해결/86잔여이나 아직 머지0/운영0이다. 기존mealsGET1실패는 stale RPC fixture였고 정상화와 옛 malformed500 검사를 함께 고정해 해결했다(제품 완화0). 남은4설계·기존 권한3/static3/444/49미발견·YouTube17dirty·새인증QA/legacy미실행·유지8ID 근거를 [후속 보고](anti-slop-meal-followup-20261020.md)에 구분했다.

- **플래너 로컬 묶음93:** source `b867b1e3e`, 보호 해제19중12 해결/후속7 검토 대기·YouTube17 dirty보존.5논리커밋의 native SDK/실제 unused protocol 삭제/동일 scoped RPC/기존 validator 타입 표현으로 통합209 PASS·전체타입/lint/verify93new0·독립 검토 통과. 원16370해결/93잔여, 배열37/조건부25 유지, 유지8개 고정ID 근거를 [새 기록](anti-slop-planner-contracts-20261020.md)에 남겼다. 아직 머지0/운영0이고 실제7d15/Anti105·DB238이다. 부모7d15 인증 읽기QA PASS·무게200g근거/설정현재값보존/새생성0은 새 source QA가 아니다. 기존 mealsGET1실패·정적3·권한3/444/49미발견·legacy미실행을 숨기지 않는다.

- **안전 경계 운영105:** PR1833 merged/operating once at7d15dfe/buildprelaunch-7d15dfe790f8-MTla10/DB238. Anti105(43/37/25)/new0; original16358resolved/105remaining. Exact merge205 PASS, whole type/lint/verify/diff and independent APPROVE. Web1466 PASS/133 name-filter SKIP, build98s/static94/existingwarnings3; manifest200/unauth3 wrapped401. Fixed read-only data observer9 equal, original approval/PIN/ledger/readerFloor/plan unchanged. Existing static3FAIL preserved. Auth QA/legacy completion untested; permission3/444/separate49 unknown preserved. Protected36 origin/dirty read investigation ongoing, no silent release. SQL/settings/worker changes0; no docs-only redeploy. [상세 기록](anti-slop-safe-boundary-batch-20261020.md).

- **진도·활동 경계 운영 반영114:** 동일 SDK 직접 타입 대입2건과 타입 단언만 감싸던 catch를 정리했다. 전후5suite40 PASS·전체 비증분 타입/lint/verify/diff·제품·metadata 독립 APPROVE 뒤 PR1831을 일반 merge9542c435537f58f70734183e59084634a6ae2fdf로 반영했다. 원163 ID49해결/114잔여, 머지1/운영1, 실제9542c435/build `prelaunch-9542c435537f-ZlS15L`·loaded=true·DB238 ready다. 공식 앱-only plan/deploy exit0·선택웹1466 PASS/133 이름필터 SKIP·빌드 PASS(100초/정적94/기존경고3)·manifest200·변경GET2곳 wrapped401·원readerFloor/plan·복구대기없음을 확인했다. 새 인증QA/legacy 실제완료는 미실행이고 SQL/설정/PIN 변경은 없다. 고정4필드 오류 문자열 체인3건은 코드 변경 없이 명시적 유지 후보 근거만 추가했다(범위보류97에 포함). [검증·운영 QA 인계·기존 보류](anti-slop-growth-boundary-20261020.md)를 따른다.

## 현재 기준과 기록 방법

- **현재 소스116:** [PR1828](https://github.com/netsus/homecook/pull/1828) 제품 `d625ccfa1`/merge `ae7e4ab102cdec7b6035c4d8cb366a1276095b58`, [PR1829](https://github.com/netsus/homecook/pull/1829) head `d5b0bae966dcea5966db59de7649a0e43cbe2cc1`/merge `e5face22af6f42daaf239ef57ed50e4f77e83e3e`를 반영했다. 좋아요 SDK 정리117→116/신규0·JS byte동일, 마이페이지 복원은 진단 감소0이다. 최종15suite214 PASS·전체 비증분 타입/lint/verify/diff·독립 APPROVE·375/1440px browser2 PASS(overflow/console/page-error/request/예상외API/write0). 원163 ID47해결/116잔여이며 원29계약29완료와 별개인 추가1건이다. 두 배치는 머지2/운영2, 공식 앱-only plan/deploy exit0·실제e5face/build `prelaunch-e5face22af6f-tQHGcl`·DB238 ready다. 선택웹1466 PASS/133 이름필터 SKIP·빌드 PASS(기존 경고3)·manifest200·보호GET3곳 wrapped401, 원readerFloor/databasePlanSha·복구 대기 없음 상태를 확인했다. 부모50bc 인증 QA(북·read-only·팬트리105·수량5/과거기록 보존)는 새후보 QA가 아니다. [실제 merge·초기 실패·재분류·한계](anti-slop-residual-rollout-20261020.md)가 최신이고 아래117/d7d는 과거 기록이다.
- 원275 baseline을 exact0d4ba86357b7에서 복구하고 과거191을 exact7e466b170의 동일 checker로 재실행했다. current116은 그191과 고정163에 정확히 포함되며191에서 부재75=163이전28+기록해결47이다. fingerprint 부재만으로 행동 개선/PR 성과를 주장하지 않는다. 과거117/173그룹 CSV는 당시 스냅샷으로 보존하며 별도49 원본 미발견/중복·완료 미추정은 그대로다. 역사적 cook-mode 조율보류1은 부모 QA 종료 후 다음 검토에서 사유를 재확인할 대상이지 자동 해결/영구 불가가 아니다.
- **이전50bc 운영 확인:** 정확 `50bcbe701e5cf47f099b95eca7b7b1be7cccf548`를 공식 앱-only plan/deploy exit0으로 반영했다. build `prelaunch-50bcbe701e5c-JYsG4J`·loaded=true·DB238 ready·원 readerFloor48c4·복구 대기 없음이며 후속6계약 **머지6/운영6**, 공유 선행/미사용 정리도 포함한다. 선택웹1466 PASS/133 명시적 이름필터 SKIP·빌드 PASS(기존경고4/정적94)·새 manifest200·보호GET3곳 wrapped401을 확인했다. SQL/환경/자격/권한/worker/정책/PIN 변경0이고 새 전체DB 백업/데이터지문 전체 재검증은 수행하지 않았다. 새 인증 QA·actual legacy 완료는 미확인이다. 아래 소스 통합 때의 운영0/d7d는 배포 전 이력이며, 이 문서만의 후속 PR로 앱을 다시 배포하지 않는다.
- 최종 source는 [PR1826](https://github.com/netsus/homecook/pull/1826) head `09f24b1ab5e3a2ab1092054a6132e317a7d39953` → master `50bcbe701e5cf47f099b95eca7b7b1be7cccf548`다. Anti **117/baseline207/신규0**, 원29계약 **29완료/0잔여**, 원163 ID **46해결/117잔여**다. 마지막 장보기 생성은 native6/실제 FK/unknown JSON 소비 경계로 직접 대입하며 기존30사례를 정확5208 원본과 대조했다. 최종91 PASS·통합45suite396 PASS·전체 비증분 타입/lint/Anti/diff·독립 APPROVE를 통과했다. 중복행 label short-circuit 초안1FAIL은 재현 후 수정했고 비문자열 ID 조기 표준500 차이를 API43에 명시했다. 전체275/별도49 완료나 held service-client 해결이 아니다. 후속6계약 **머지6/운영0**, 운영은 아직 d7d/build `prelaunch-d7d865ac2fa8-1VWr9s`·DB238이다. 아래118/잔여1은 이전 checkpoint이며 [통합·실패·운영 경계](anti-slop-contract-rollout-20261020.md)가 최신이다.
- 최신 source는 [PR1819](https://github.com/netsus/homecook/pull/1819) 공유 선행과 PR1820–1824의5계약, [PR1825](https://github.com/netsus/homecook/pull/1825)의 실행 코드 동일 미사용 writer97줄 정리를 포함한 `5208dcbdeb68bf6a229ca5a1c3156a868aa31148`다. Anti **118/baseline207/신규0**, 원29계약 **28완료/1잔여**다. e7 통합43suite353 PASS·선택웹1466 PASS/133 이름필터 SKIP·전체 비증분 타입/lint·독립 코드 검토, writer 전후58 PASS를 확인했다. 새5계약은 **머지5/운영0**이며 현재 운영 d7d/build `prelaunch-d7d865ac2fa8-1VWr9s`·DB238과 구분한다. 아래123/6잔여·Progress 로컬/미채택 문장은 이전 checkpoint다. [실제 PR·merge·검사·실패·운영 경계](anti-slop-contract-rollout-20261020.md)가 최신이다.
- 남은1건은 장보기 생성 request-client assertion이다. 정확 phase/인수 분리/owner match 실험은 TS2589가 남았고, native6 초안의 GenericSchema/interface 결함과 기존201을500으로 바꾸는 JSON8필드 guard는 미채택이다. 이것을 전면 불가능/새 승인 gate로 삼지 않고 기존 JSON 소비 동작을 보존하는 다음 작은 배치를 진행한다. 별도 미사용 writer 정리는 실제 불필요 코드 제거이나 진단 감소0이며 마지막1건 해결로 세지 않는다. 보류444·permission3·과거10실패를 유지하고, pantry2는 stale UUID/reason fixture만 복구한 사실을 초기18/2와 구분한다.
- 최신 운영도 `d7d865ac2fa86ad5ebc445ad8266ad78080a87dc`/build `prelaunch-d7d865ac2fa8-1VWr9s`다. 공식 앱-only plan/deploy exit0, 선택웹1466 PASS/133 이름필터 SKIP·빌드 PASS(기존 경고4), 실제ref/loaded·DB238 ready·원 readerFloor48c4·복구 대기 없음·manifest200·두 조회 비로그인401을 확인했다. 이번 두 배치 머지2/운영 반영2이며 인증 실제 흐름은 미확인이다. SQL/환경/자격/권한/worker/정책/PIN 변경0이다. 부모의 남은6건 계속 지시에 따라 다음 공유 계약·DELETE·manual POST를 진행하며 이미 끝난 배포는 재실행하지 않는다.
- 최신 소스는 목록 [PR1816](https://github.com/netsus/homecook/pull/1816) head `1dc9fac2c4d6b443e707039b04e66fe9989fa107` → master `a80f1ede73eade75df01e1e4856642d71207785f`, 상세 GET [PR1817](https://github.com/netsus/homecook/pull/1817) head `fdeceaae01f0745651682b551139ced5f1132179` → master `d7d865ac2fa86ad5ebc445ad8266ad78080a87dc`다. 각각 실제 SDK6표/10표와 SQL nullable/FK로 손코딩 조회 체인·연쇄 단언을 제거했다. 목록17 PASS, 상세38 PASS, 통합 중복 제외45 PASS·선택웹1466 PASS/133 이름필터 SKIP·전체 비증분 타입/lint/diff·독립 리뷰를 통과했다. 동일 객체 alias를 정규화한 두 route 실행 AST가 같고 normalizer JS도 byte 동일하다. Anti Slop **125→124→123/신규0**, 원29건 **23완료/6잔여**이며 원163개 ID 중40 해결/123잔여다. DELETE1·manual POST1·공유 growth route4는 남았고 보상/권한/fallback을 완화하지 않았다. 아래125·8잔여·P5 인계 대기 문장은 이전 checkpoint다.
- 부모가 P5 코드 담당 종료 및 운영 QA 종료를 인계했다. 기존 main legal dirty·catalog dirty·보호 P5 clean WT를 보존하고 최신 master 별도 WT에서 진행했다. 부모의 eb7 기존Chrome QA는 저장→북새로고침/분수 유지, 장보기완료→read-only/새로고침 수정0·팬트리0을 통과했다. 본인 진행 중 legacy 표본0이라 실제 legacy 완료는 미실행이며 snapshot-v2 시작은 취소/재조회만 확인했다. 새 QA 끼니 생성의 auto-review 거부는 재시도·우회하지 않는다. 이번 조회 배치의 운영 인증 흐름은 별도이며 기존 eb7 QA를 새 후보 QA로 바꿔 세지 않는다.
- Progress TS2589의 작은 `match({user_id})` 선행 후보 `e823fbc34`/`9887d303c`는 실제 SDK URL 동등성6·전체 타입·독립 리뷰·23suite128 PASS로 로컬 검증했지만 이번 두 PR에는 포함하지 않았다. 넓힌 첫 실행의123 PASS/5 FAIL은 두 오래된 fixture의 match 미지원이었고 지원만 추가해 재검증했으며 기대값은 완화하지 않았다. 원 실패 dirty 실험도 그대로다. native Gamification7의 메모리 overlay는 실제 선택 타입 동등성/미등록표 거부/전체 진단0을 재현했으나 SQL 계약·SDK runtime 회귀 전이므로 미채택이다. 이 선행 조사로 계약4건을 해결했다고 집계하지 않는다. 기존 권한3·보류444·pantry2/과거10 실패도 남는다.
- 목록 첫 merge 명령은 잘못 전사한 match-head SHA 때문에 서버 보호에 거절됐다. 실제 로컬/원격 HEAD를 읽어 일치 확인한 후 일반 merge로 반영했으며 admin 우회나 CI/Actions 설정 변경은 없었다. 정확한 배포 결과·남은 범위는 [조회 후속 기록](anti-slop-book-read-followup-20261020.md)을 따른다.
- 최신 snapshot 경계1건은 [PR1814](https://github.com/netsus/homecook/pull/1814) head `f73b11c6f1d900142b52eb003b683c7e2640ebda` → master `eb7df156d24b361a0e91b17345522cd1b15f05b1`로 머지하고 공식 앱-only 경로로 배포했다. build `prelaunch-eb7df156d24b-EeWHdq`·실제ref eb7·loaded=true·DB238 ready·readerFloor48c4·recoveryPending=false, 새 manifest200·비로그인 cook-mode401을 확인했다. 배포 exit0·웹1466 PASS/133 이름필터 SKIP·빌드 PASS(기존 경고4), 로컬45 PASS·전체 비증분 타입/lint·독립 리뷰 APPROVE·Anti125/신규0이며 계약8 잔여다. 원29건 중 로컬·머지 각각21건 완료/8건 잔여이며21건의 인증된 실제 흐름 완료를 뜻하지 않는다. 실제9표/FK/선택 행과 JSON unknown 형태 검증을 사용하며 정상 legacy/default/product/선택 수량·사용재료 fallback/순서를 보존한다. malformed 검사 대상 필드를 표준500으로 닫는 차이는 공식 API9-3에 기록했다. SQL/환경키/자격/권한/worker/정책/PIN 변경0이며 새 DB 전체 백업을 수행했다고 주장하지 않는다. 공개 상세 GET을 재실행하거나 조회수를 되돌리지 않았다.
- 인증 QA 인계 후보는 위 eb7/build에 고정한다. 이 작업의 추가 운영 변경은 종료했다. 부모의 지원되는 기존 테스트 계정 브라우저에서 (1) 공개 두부 canonical recipe `84a371bf-a082-4fa3-9c41-439492fb7fbd` 저장→기존 QA 북 재조회/새로고침, (2) 기존 테스트 장보기 완료→read-only/중복 완료와 선택하지 않은 팬트리 미반영, (3) 본인 legacy 요리 세션 cook-mode 읽기→완료/기록 유지와 독립 요리의 meal 상태 불변을 직렬 확인한다. 이 세션에는 js_repl/browser/Computer 도구가 없으며 격리 fixture 계정을 실제 운영 인증 QA로 대신하지 않았다. 기존 로그인 세션/토큰 추출·프로필 복제·새 자격 생성도 하지 않았다. 해당 쓰기 QA는 미실행이며 완료/21건 운영 검증으로 집계하지 않는다.
- 동시 후속 조사에서 보호된 저장/UI/플래너4건은 P5 작업트리의 현재 route diff 겹침0을 확인했지만 저장/import 타입·런타임과 의미상 인접하고 담당 종료 인계가 없어 수정하지 않았다. 공통 progress/growth4건은 별도 `codex/anti-slop-growth-contract-20261020`의 미커밋 실험으로 보존한다. 정확 선택열·user_id·단방향 단계와 count/error만의 소비 계약은 SDK 전체 대입 TS2589를 해결하지 못했다. 독립 메서드별 진단은 read select→eq 객체 비교에서 재귀를 특정했고, insert/upsert 단독 검사는0이었다. match 대안의 SDK HTTP6쌍은 같았으나 다른 Gamification 경계에 TS2589가 남아 채택하지 않았다. 해당 실험의 runtime23 PASS/Anti126/new0은 타입 실패 exit2와 별개이며4건 해결이나 머지 근거가 아니다. 권한3건·보류444·기존 실패 기준선도 해결하지 않았다.
- 이전 제품·도구 checkpoint: PR1812 head `484e89df92f5104a21ce8ae91cf1bf74ad338c54` → master `cd91be21ac12d1a04a15467d057b6b682cc6d75a`, 당시 진단 **126**, baseline **207**, 신규 **0**, 계약 **9** 잔여였다. 이전 로컬17커밋의19개 진단 해소를 실제 채택했고 중복 집계하지 않는다. 앱 `f204073a2dbd8468644d7f40e206f48ec6518e20`/build `prelaunch-f204073a2dbd-A2tFiO`의 DB238 ready·복구 대기 없음 확인은 앞선 운영 증거다. 현재125/8과 구분한다.
- 최신 사용자 지시: DB238을 그대로 유지하는 최소 앱 successor 검증기/CLI·관련 검증/리뷰/코드 통합과 타입 수정의 앱 전용 배포를 승인했다. 이전 장부의 승인 대기 문장은 당시 상태다. 기존 PIN/승인·가드는 보존하며 SQL/환경/키/권한/worker/정책 변경은 포함하지 않는다. 별도 세션의 승인된 영양5행 작업 종료 인계 전에는 실제 배포나 새 데이터 기준 고정을 하지 않는다.
- 이후 부모가 영양5행 완료 인계와 운영 대기 해제를 전달했다. 두부r4/소갈비r2/잡채r3와5개 수량을 확인했고, 인계 후 fresh9개 data/catalog/control 지문이 앱 배포 전후 모두 같았다. 직접SQL·원본/수량 저장·자격·worker·정책 변경0이다. 이후 공개 상세 QA의 기존 서버 조회수3행 증가로 normalData/파생preservedRows만 달라졌고, 그3필드만 과거 값으로 가정한 READ ONLY 계산으로 원 전체 지문을 유일하게 재구성했다. 조회수 복원·필드 제외·PIN 변경은 하지 않았다. 새source 승인/PIN·공식 plan·실제 QA·원인 증거와 범위 한계는 [DB238 앱 successor 기록](anti-slop-db238-app-successor-review-20261019.md)을 따른다.
- 후속6제품PR(#1773–#1778)은157→147을 확인했다. 아래147 checkpoint는 제품 변경 없이 실제 merge·통합검사·미반영 실험을 정리한다. 원 요청 전체 완료나 잔여29의 전체 불가 판정이 아니다.
- 원 요청의 **275건**과 별도 **49건**은 같은 목록이 아니다. 49건 원본은 미확인이므로 현재 진단과 합산하지 않는다.
- `275→233` 초기 구간과 `191→185` 중간 구간은 이번 승계에서 PR별 귀속을 복구하지 못했다. 차이를 특정 PR 성과로 채우지 않는다.
- 과거 PR 본문과 merge의 first-parent 이력으로 확인한 숫자만 기록한다. `?`는 미확인, `유지`는 진단 감소 없이 실질 코드만 정리한 경우다. 과거 표의 수치는 당시 실제 진단이며 현재 checker 실행 결과를 대신하지 않는다.
- #1649 이후 이 승계에서 baseline207·규칙·scope를 변경하지 않았다. 이전 baseline snapshot 감소 이력을 현재의 검사 완화로 되살리지 않는다.
- 다음 배치는 직전 PR의 실제 merge SHA·검사 결과를 이 장부에 먼저 반영한다. 이미 완료된 아래 항목을 다시 실행하지 않는다. 새 adapter/단언·무의미한 루프 치환으로 숫자만 줄이지 않는다.

### 원본 진단 ID와 판단 추적

- [진단 스냅샷·항목별 상태](evidence/anti-slop-inventory-20261017.json)는 master063f8a226의163개 occurrence를 고정했다. ID는 `file::rule::snippetSha256#occurrence`이며 hash는 기존 checker의 공백 정규화 source-span SHA256과 같다. line/occurrence는 이 checkpoint 기준이지 이동하는 현재 위치가 아니다.
- 163개 ID의 유일성·snippet hash·baseline207의 허용 count와 일치를 기계 검증했다. 원 요청275 전체의 초기 ID를 복구했다고 주장하지 않는다.
- 이전116 checkpoint 대조 분류는 범위 보류99, 명시 보류3, 기존TS2589 기술 보류0, 계약 보강 필요0, 병행 조율1, 고정 참고 보존8, 개선 근거 없음 유지5, 해결47다(총163/잔여116). 이전6개 이후 PR1828 좋아요1을 추가했으며, 원163개 ID·file/rule/snippet/hash/occurrence/line/column은 그대로다. PR1819 공유/PR1825 미사용 선언 정리/PR1829 상세 복원과 선행 PR1807의 save 추가 단언은 이번1개 감소와 중복 합산하지 않는다. 미검토0은 전체 해결이나 실행 불가 판정이 아니다.
- 앞으로 각 해결 항목에 기존 ID·파일·해결 근거·관련 검사·PR을 남긴다. 보류는 실제 scope/기술 근거를 남기며 원본 finding을 삭제하지 않는다. 작은 배치를 순차 진행하고 각 완료 결과를 부모 세션에 전달한다.

## 완료 이력: 복구한 초기 checkpoint

PR 링크는 당시 검사와 상세 diff의 근거다. 이 구간은 first-parent가 연속이어서 전후 checkpoint를 연결할 수 있다. 일부 leaf client는 연쇄 단언을 단일 경계로 정리했으며, 전체 미검증 타입 경계를 없앴다는 뜻은 아니다.

| PR | 실질 변경 | 실제 진단 전후 | merge SHA |
| --- | --- | --- | --- |
| [#1636](https://github.com/netsus/homecook/pull/1636) | recoverable manual writer 계약 테스트 동기화 | 233 유지 | `333e6ad542ada009eb3c4575c81839470bd1b895` |
| [#1637](https://github.com/netsus/homecook/pull/1637) | product 수정/삭제/report leaf client 단언을 단일 경계로 정리 | 233→230 | `ef365d03a1638d912120ff6c49401faf7ef7f06b` |
| [#1638](https://github.com/netsus/homecook/pull/1638) | product 목록·수동생성 client 경계 정리 | 230→228 | `e6f613f0d55270f27ca3e9abad2ac2f72c93aed6` |
| [#1639](https://github.com/netsus/homecook/pull/1639) | planner 영양 선택 필드 projection 명시화 | 228→226 | `5b154028a4c81e4e96afc9786586345b2883a508` |
| [#1640](https://github.com/netsus/homecook/pull/1640) | meal-log 선택 payload/projection 명시화 | 226→224 | `761f9940a6b9cb415fbd15c990c19f9c9003dd54` |
| [#1641](https://github.com/netsus/homecook/pull/1641) | owner/public-fork snapshot projection을 명시적으로 구성 | 224→222 | `ada26c0d9acfaa06c4e1958b0c151cdfc938e511` |
| [#1642](https://github.com/netsus/homecook/pull/1642) | theme request client 통합, 중간 map/filter pipeline 제거 | 222→216 | `8bab7f8722c2f048eb3ad0c35dbd22ca92098086` |
| [#1643](https://github.com/netsus/homecook/pull/1643) | cooked batch 선택 필드 projection 명시화 | 216→214 | `5364c6bb736048589addcb08044e8a75073cd55c` |
| [#1644](https://github.com/netsus/homecook/pull/1644) | survey 성공 응답 선택 필드 명시화 | 214→213 | `6ec3d787d87857376dce0e8503c5ec4d942744ee` |
| [#1645](https://github.com/netsus/homecook/pull/1645) | shopping ingredient 수집 중간 map/filter 제거 | 213→212 | `0f90afa759fe10cf8d6f9a3f6a3c0608962d810d` |
| [#1646](https://github.com/netsus/homecook/pull/1646) | external ingredient source 필드 수집 정리 | 212→211 | `eb6d438068be3e5e1bc245ebac2cff294399f398` |
| [#1647](https://github.com/netsus/homecook/pull/1647) | current/legacy 조리법 정렬 조회 중복 통합 | 211→210 | `dcaba840f1f6bc9866ae0fbcf38f2cd37b1831ca` |
| [#1648](https://github.com/netsus/homecook/pull/1648) | tag kind guard·공개 RPC 읽기 경계 통합 | 210→209 | `556a4cbf497f9f3700a9a4185d6beb74ac1f2e32` |
| [#1649](https://github.com/netsus/homecook/pull/1649) | image projection의 정확 키·필드 runtime guard | 209→207 | `2cf69403080582299a1ee2871f46212903642b92` |

## 완료 이력: 207 checkpoint 이후

| PR | 실질 변경 | 실제 진단 전후 | merge SHA |
| --- | --- | --- | --- |
| [#1650](https://github.com/netsus/homecook/pull/1650) | nutrition worker refresh/claim 응답 runtime guard·malformed 회귀 | 207→205 | `8d128aa824a605be4a932f51ddde2c4aeccc952d` |
| [#1651](https://github.com/netsus/homecook/pull/1651) | food catalog RPC client 구조적 타입 대입 | 205→204 | `d46124c2c25f912df72a46c83849ba0d80d8b8fb` |
| [#1652](https://github.com/netsus/homecook/pull/1652) | Round2 client 선택 필드 5곳 직접 대입 | 204→199 | `5d1d5e1c7e7f6c1eecf880604f2a4400d24ecbbf` |
| [#1653](https://github.com/netsus/homecook/pull/1653) | quiz answer 검증 경계·오류 문자열 수집 정리 | 199→197 | `8a74a1de820fa0370ef84255a73bd62af61b317d` |
| [#1654](https://github.com/netsus/homecook/pull/1654) | 캠페인 시각 회귀 fixture 고정(지원 검사만) | 197 유지 | `c839db51340c4b90f4f396e787325c4564b9e556` |
| [#1655](https://github.com/netsus/homecook/pull/1655) | tag normalize/usage backfill의 중간 배열·불필요 행 수집 제거 | 197→196 | `2ec7b0b1d686a6f3459da18879016ba0cb780138` |
| [#1656](https://github.com/netsus/homecook/pull/1656) | recipe ingredient product 선택 필드 직접 구성 | 196→195 | `b12ebd9e3a5a5cb55b7fcc09b9f9eb00d73f3960` |
| [#1657](https://github.com/netsus/homecook/pull/1657) | catalog ingredient/product projection union 명시 | 195→194 | `a207b63d3e37d4d24838ea5434e7cafc8a5277c9` |
| [#1658](https://github.com/netsus/homecook/pull/1658) | auth gate owner 선택 키의 omit/null 보존 | 194→193 | `c6abf1502c6fc76e1597960922c59adcaaab656e` |
| [#1659](https://github.com/netsus/homecook/pull/1659) | missing ingredient/method 필드의 ordered collector 통합 | 193→191 | `7e466b170ba39795220ef64e67eac3fab4429420` |

191 이후에는 비관련 병합이 다수 있다. 다음 #1734의 최종185만 확인했으므로 감소6을 그 PR 하나에 귀속하지 않는다.

## 완료 이력: 실제 불필요 코드·중복 정리와 최근 배치

| PR | 실질 변경 | 실제 진단 전후 | merge SHA |
| --- | --- | --- | --- |
| [#1734](https://github.com/netsus/homecook/pull/1734) | leftover eat/uneat/keep runtime parser, 미사용 projection helper 삭제 | ?→185 | `fb39578d21f3c866f9ac0f8f130d198e04d3365b` |
| [#1735](https://github.com/netsus/homecook/pull/1735) | leftover 3 route의 오류 매핑 중복 통합 | 185 유지 | `12c17c319c4dbca1c6b0603f40fdb567fc78bb41` |
| [#1736](https://github.com/netsus/homecook/pull/1736) | 중복 XP source-key 검사·pass-through level wrapper 삭제 | 185 유지 | `1a096733966bd02ad17e6c10e0e8b3dd870f9c5f` |
| [#1737](https://github.com/netsus/homecook/pull/1737) | cap metadata 정규화 중복·filter 중간 배열 제거 | 185 유지 | `91aa40c5ded78f4389fb6d9214d06673d818c252` |
| [#1740](https://github.com/netsus/homecook/pull/1740) | 순수 타입 단언 주변의 도달 불가능 catch 삭제 | 185 유지 | `63c277baba7161cc3c060789331a1625348b3dc9` |
| [#1741](https://github.com/netsus/homecook/pull/1741) | leftover status literal narrowing·단발 whitelist 제거 | 185 유지 | `435491dab2786a0cb3c836ec741229a965648cde` |
| [#1742](https://github.com/netsus/homecook/pull/1742) | wake-lock 선택 설정 직접 대입 | 185→184 | `47b6f4095e7e9a48dc09351c810196e30c00c9d1` |
| [#1744](https://github.com/netsus/homecook/pull/1744) | shopping 생성 성공 응답 variant 분리·키 생략 검증 | 184→183 | `7df1480da95e78b82d7ec5002a12f63059decd5a` |
| [#1747](https://github.com/netsus/homecook/pull/1747) | admin factory의 실제 타입 보존·중복 query interface 제거 | 183→180 | `36283200076d6e7cab9c66d626b6cbb69bbf630d` |
| [#1748](https://github.com/netsus/homecook/pull/1748) | admin 읽기 endpoint 3곳의 실제 client 직접 전달 | 180→177 | `30a13c81dec2ebb723127b0a91a3ae0368a2e6f5` |
| [#1751](https://github.com/netsus/homecook/pull/1751) | image cancel RPC 실제 client 직접 전달 | 177→176 | `05761cb45bd2e64002d7d874292621892da312c6` |
| [#1752](https://github.com/netsus/homecook/pull/1752) | image upload RPC/storage 실제 타입·죽은 interface 제거 | 176→174 | `9d96e4014d8644bf66fc51e0434438524076abcc` |
| [#1754](https://github.com/netsus/homecook/pull/1754) | 조리 시작의 기존 dbClient 별칭 재사용 | 174→173 | `1b551630eb9810d25ba381291a48eb6126f03adf` |
| [#1756](https://github.com/netsus/homecook/pull/1756) | session-attempt 시작/취소 RPC 실제 client 직접 전달 | 173→171 | `0194bf393d9d8755be82461a6223d5a71150886a` |
| [#1757](https://github.com/netsus/homecook/pull/1757) | meal-log 선택 revision 직접 대입 | 171→170 | `1897be9fadb0a49f3f44d8958e8cfe62fa0c43b6` |
| [#1758](https://github.com/netsus/homecook/pull/1758) | future impact RPC 단언·단순 전달 객체/함수 제거 | 170→169 | `218b1bec9f2865fb27f3d327bab370a65fe23766` |
| [#1759](https://github.com/netsus/homecook/pull/1759) | 북 목록 GET의 중복 reader 단언 제거 | 169→168 | `0ac1ff0e14e60c92d49ce2e7dcb2b0b02ecac7c0` |
| [#1760](https://github.com/netsus/homecook/pull/1760) | 북 상세 GET/DELETE의 중복 reader 단언 제거 | 168→166 | `1e4c7351f717ba4c468b526fdcdad0a3238e0132` |
| [#1761](https://github.com/netsus/homecook/pull/1761) | 북 표지 RPC/storage 실제 client 직접 전달 | 166→165 | `4a219fbc16ad7c8f81f0e25258cfcb397bea0252` |
| [#1762](https://github.com/netsus/homecook/pull/1762) | recipe DELETE RPC 단언·미사용 import 제거 | 165→164 | `be8101c9a7b844129648e8bf552e74e0cc274816` |
| [#1763](https://github.com/netsus/homecook/pull/1763) | 상세 GET 선택 context 직접 대입·지속 장부 복구 | 164→163 | `9a96f3fde5f3797a690ddbaa53bee6d27f297435` |
| [#1765](https://github.com/netsus/homecook/pull/1765) | leftover GET 단발 전달 함수 제거·철회 실험 기록 | 163 유지 | `063f8a2267b4559f8c7e2450006ce536ea60dec9` |
| [#1766](https://github.com/netsus/homecook/pull/1766) | PATCH 영양 helper 실제 client 직접 전달 | 163→162 | `f4f645c6389efe546d00571cd36155c7327e4c02` |
| [#1767](https://github.com/netsus/homecook/pull/1767) | POST fork 영양·RPC 실제 client 직접 전달 | 162→160 | `c06cf4538bfd1c816814782d5867a8b6417dd7cb` |
| [#1768](https://github.com/netsus/homecook/pull/1768) | 영양 predecessor 실제 읽기 계약 분리 | 160→158 | `017d22faba3ee8a333f8af4a579fe946055fed92` |
| [#1769](https://github.com/netsus/homecook/pull/1769) | 조리 완료 현대·legacy RPC 실제 client 직접 호출 | 158→157 | `c0afd5511f5990d96af5f3eef3e2686ff0c877c2` |
| [#1770](https://github.com/netsus/homecook/pull/1770) | 장보기7leaf 단발 전달 함수 삭제·guest 계약 고정 | 157 유지 | `bf549a6853e783664d5802295d9e996db31930ce` |
| [#1771](https://github.com/netsus/homecook/pull/1771) | tag/product GET 단발 unknown→cast helper 삭제 | 157 유지 | `4a9da270233b6c92e6a81498e35309efc348bb46` |
| [#1772](https://github.com/netsus/homecook/pull/1772) | 원본ID별 잔여 판단과 실패/한계 고정 | 157 유지 | `81f0432bed2cecaa80169366e95ddb3b338adc02` |
| [#1773](https://github.com/netsus/homecook/pull/1773) | native 영양 owner query·선택 행 계약 보강 | 157→156 | `1b730e2498eb1f766e9fe5f8dcaebb94b64fc170` |
| [#1774](https://github.com/netsus/homecook/pull/1774) | 수동 영양3호출의 실제 factory client 보존 | 156→153 | `7d320fba86d586a82291874fda2097ec414247d3` |
| [#1775](https://github.com/netsus/homecook/pull/1775) | 카드 저장상태 native 조인·선택행 계약 | 153→152 | `2d8103c8bc456f9263909c761ad863ee83b861db` |
| [#1776](https://github.com/netsus/homecook/pull/1776) | 검색 목록 native 선택행·RPC 계약 | 152→151 | `224298c619c0495afcd8dd41a9eaae17036ab239` |
| [#1777](https://github.com/netsus/homecook/pull/1777) | 진행/활동 writer의 실제 projection capability 계약 | 151→149 | `81563d1f7b7e71a9abddbb2ea8a1ab6009f249cb` |
| [#1778](https://github.com/netsus/homecook/pull/1778) | 재료 검색 카탈로그/레시피 native 소비 계약 | 149→147 | `2cd4aab93d5b9f527ce1a8b8de6d434136fc987b` |

최근 검증: #1760 관련21, #1761 관련53, #1762 관련35 각각 PASS·typecheck·변경 lint·독립 리뷰 APPROVE. `be8101c9a` 통합 10 suite /109 PASS. #1761/#1762는 emitted JS byte-identical도 독립 확인했다. 위 표가 모든 전체 테스트·운영 검증의 성공을 뜻하지 않는다.

## 최근 반영: [#1763](https://github.com/netsus/homecook/pull/1763) 상세 선택 context projection

- `app/api/v1/recipes/[id]/route.ts`의 빈 객체 conditional spread 1곳만 기존 typed detail의 선택 필드 직접 대입으로 바꾼다. owner 판정/조회·편집/삭제 로직·키 순서·context 없는 응답의 키 생략을 유지한다.
- 진단164→163, 신규0, baseline207·규칙·테스트 변경0. 전체 typecheck·변경 파일 ESLint·diff-check PASS.
- 편집 전후 `recipe-api-contracts`의 `detail|recipe does not exist|edit context|confirmed counts|QA mock recipe` 선택23 PASS /67 선택 제외. 전체90 PASS를 주장하지 않는다.
- 넓은92검사는 편집 전후90 PASS /기존2 FAIL로 동일하다. 아래 추가 기준선 절에 분리한다. 실행 JS 동일 주장은 하지 않는다(선택 필드 조립 변경).
- 독립 리뷰 APPROVE: 동일23 PASS /67 선택 제외, 전체 typecheck·ESLint·diff-check PASS. 넓은92건도90 PASS /기존2 FAIL을 직접 재현했고, 완료44행의 merge commit 제목도 불일치0을 확인했다. Anti Slop은 중복 실행하지 않아 부모 결과와 구분한다.
- 전체 build·화면·실DB·운영 흐름 미실행. 실제 merge SHA는 위 완료 표에 확정했다.

## 최근 반영: [#1765](https://github.com/netsus/homecook/pull/1765) leftover GET 단발 전달 함수 제거

- `app/api/v1/leftovers/route.ts`에서 한 번만 쓰는 `requireUser` 전달 함수를 제거하고, 기존 `routeClient.auth.getUser()` 호출과 nullable user 읽기를 GET에 직접 둔다. 같은 client의 호출1회·fixture 선행 분기·401 조건·bootstrap·조회·정렬·응답·상태 정책은 그대로다.
- 편집 전후 `leftovers.backend`, `leftover-mutation-parser`, `leftover-status-normalization` 3 suite /63 PASS. 전체 typecheck·변경 파일 ESLint·diff-check PASS, Anti Slop163 유지/신규0. 독립 리뷰 APPROVE 및 동일63건·typecheck·ESLint·diff-check PASS. Anti Slop은 중복 실행하지 않아 부모 결과와 구분한다. 이것을 전체 검사 통과로 넓히지 않는다.
- 진단 감소 목적의 변경이 아니다. `eat/route.ts`의 최초 불검증 client 경계는 그대로이며 runtime guard·새 adapter·단언 변경0이다. 실행JS 동일 주장은 하지 않는다(단발 함수 인라인 포함).
- 먼저 시험한 `LeftoverMutationAuthedDbClient = UserBootstrapDbClient` 동의어 제거는 체인 단언 snippet 변경을 baseline이 신규1건으로 거절해 전부 원복했다. 원복 후 diff0·실제163/신규0을 확인했다. baseline·scope·규칙을 바꾸거나 단일 단언으로 바꿔 이 검사를 우회하지 않았다.
- 실제 DB/운영/보안 정책/무게 후속 변경0, 전체 build·화면·실DB 흐름 미실행.

## 최근 반영: [#1766](https://github.com/netsus/homecook/pull/1766) PATCH 영양 helper client 경계

- 원본ID: `app/api/v1/recipes/[id]/route.ts::anti-slop(no-chained-type-assertions)::75dca4dc05eacbb3b3182090d0a749053ce982f349fd6869ff9238d463d5b741#1` (checkpoint063f8a226:671).
- 기존 scoped factory가 기존 `RecipeDraftNutritionClient` 계약을 직접 만족하므로 연쇄 단언·미사용 type import만 제거한다. 인터페이스 확대/새 adapter/대체 단언·runtime guard 제거0이다.
- 편집 전후 personal-recipe-customization-write-routes / recipe-future-impact-security / recipe-content-snapshot-future-propagation / recipe-product-nutrition: 4 suite41 PASS. 전체 typecheck·변경 ESLint·diff-check PASS, Anti Slop163→162 /baseline207/신규0.
- TypeScript ES2022/ESNext emitted JS byte-identical, SHA256 `21a0633b8cd40ad823b93558869d8949e4346d43844d64fccb1b17fa6ab7ac20`. 실제 저장·권한·RPC 인수/실행 코드 변경0이다. 실DB 쓰기를 실행하지 않았다.
- 독립 리뷰 APPROVE: 동일41건·전체 typecheck·ESLint·diff-check PASS, emitted JS 동일, inventory163개ID/hash/checkpoint/baseline대조0오류와상태집계일치를 확인했다. Anti Slop은 중복 실행하지 않아 부모 결과와 구분한다. 전체 build·화면·운영 흐름·전체 검사 미실행, 기존 실패8건+추가2건과49원본미확인은 별도로 유지한다.

## 최근 반영: [#1767](https://github.com/netsus/homecook/pull/1767) POST 파생 레시피 client 경계

- 원본ID는 inventory의 `app/api/v1/recipes/route.ts` / `no-chained-type-assertions` / hash `75dca4dc05eacbb3b3182090d0a749053ce982f349fd6869ff9238d463d5b741#1`(checkpoint1989), `fbb4fd32fd4a51ec15c9fca478fac4b344e50f95c07026b4c8139248f9822862#1`(checkpoint2009)이다.
- 기존 scoped factory를 nutrition helper와 fork RPC에 직접 전달한다. 두 연쇄 단언과 미사용 type import만 제거한다. consumer 계약 확대/새 adapter/대체 단언0이며 권한·저장·RPC runtime 변경0이다.
- 편집 전후 customization-write-routes / content-snapshot-future-propagation / future-patch-http-replay / quantity-mode / product-nutrition: 5 suite52 PASS. 전체 typecheck·변경 ESLint·diff-check PASS. Anti Slop162→160 /baseline207/신규0. 독립 리뷰 APPROVE: 동일52건·전체 typecheck·ESLint·diff-check PASS, emitted JS 동일을 직접 확인했다. Anti Slop은 부모 실행 결과와 구분한다.
- ES2022/ESNext emitted JS byte-identical, SHA256 `c6882876d2044e11098f021fdd3be2afedbf78dc406b02ee51994d4b9cf6da98`. 전체 build·화면·실DB·운영 검증 미실행이며 기존10실패·49원본 미확인은 별도다.
- 부모 세션 중간 통지는 지정 thread에 전송했으나 `thread not found`로 실패했다. 전달 성공으로 기록하지 않으며 다른 수신처로 우회하지 않는다.

## 최근 반영: [#1768](https://github.com/netsus/homecook/pull/1768) 영양 predecessor 읽기 계약 분리

- 원본ID: `app/api/v1/recipes/route.ts` checkpoint1196 및 `app/api/v1/recipes/[id]/publish/route.ts` checkpoint40, 각각 `no-chained-type-assertions::aa336e5ccd3ca10ecf13203e85ddb7c47042d995049950ccb04cd7c142e9f3b0#1`. 전체 ID/위치/근거는 inventory에 보존한다.
- 기존 predecessor 인수는 실제로 읽지 않는 recipes/recipe_ingredients와 잘못된 from단계 ListQuery를 요구했고 실제 사용하는 piece_unit_weights는 빠져 있었다. 실제3표의 select와 product/quantity RPC 계약을 분리하고, owner read·snapshot writer 계약은 전체 service client 교집합으로 유지한다. 새 adapter·단언·unknown 확대0, 두 호출자의 불필요 전체 서비스 단언만 제거한다.
- 설치된 Supabase의 native select-builder identity를 보존해 from단계에 in/eq/order/then이 있다고 잘못 선언하지 않는다. DB schema별 행 타입·완전한 deep-readonly 보장을 주장하지 않는다. MJS는 allowJs/no-checkJs라 잔여 any 경계가 있으며 첫 owner client 단언도 남긴다.
- 편집 전후 영양 service·manual publish·public runtime·supabase scope·personal write·product nutrition 6 suite116 PASS. 전체 typecheck·변경 ESLint·diff-check PASS, Anti Slop160→158 /baseline207/신규0. 독립 리뷰 APPROVE: 동일116건·type/lint·3파일JS동일 직접 확인, native default schema/MJS 한계도 확인했다. Anti Slop은 부모 결과와 구분한다.
- 3파일 ES2022/ESNext emitted JS 모두 byte-identical: service `e3a324c2406f3328b1f0033d30f40142f94a5985a8b57f473533eb391ef9f8a9`, recipes `c6882876d2044e11098f021fdd3be2afedbf78dc406b02ee51994d4b9cf6da98`, publish `058a78ad0bd1a14a9ada77364f6454acd4fd6279ec713a5cd92135bf155ac26b`.
- 실행 로직·권한·내부factory·DB·운영 변경0이다. 전체 build·화면·실DB 미실행, 기존10실패·49원본 미확인은 별도다.

## 최근 반영: [#1769](https://github.com/netsus/homecook/pull/1769) 조리 완료 RPC client 경계

- 원본ID: `app/api/v1/cooking/sessions/[session_id]/complete/route.ts::anti-slop(no-chained-type-assertions)::dfdc16fbe4f15c336cd94233663b7dba171ea3dff258c662baafca9c5fc1f8bc#1` (checkpoint137).
- 기존 routeClient fallback 연쇄 단언과 같은 호출의 serviceClient 단일 단언·미사용 type import만 제거한다. 현재 RPC·schema-cache fallback 조건·legacy 인수·owner/generation·멱등성·상태 전이 로직은 변경하지 않는다. 저장/UI/플래너 연결·무게 병행 파일은 수정하지 않았다.
- 편집 전후 cook-planner-complete.backend / legacy-cooking-complete-routes: 2 suite21 PASS, 전체 typecheck·변경 ESLint·diff-check PASS, Anti Slop158→157/baseline207/신규0. 독립 리뷰 APPROVE: 같은21건·type/lint/diff·JS동일을 직접 확인했다. Anti Slop은 부모 실행 결과와 구분한다. 감소1은 연쇄 단언이며 companion 단일 단언을 추가 감소로 세지 않는다.
- ES2022/ESNext emitted JS byte-identical SHA256 `73c23053f7bf2ca447886eb02bcc42f2364a4c991b90d54e8991f46ad3949ef6`. 기존 legacy fallback을 제거하거나 권한 정책을 바꾼 배치가 아니다. 실DB·운영·build·화면 검증 미실행이며 기존10실패·49원본미확인 유지다.

## 최근 반영: [#1770](https://github.com/netsus/homecook/pull/1770) 장보기 leaf 단발 전달 함수 삭제

- 원본 finding에 대응하는 진단 감소가 아니라 실제 불필요 코드 정리다. `shopping/preview`와 `shopping/lists/[list_id]`의 detail/share-text/complete/items/[item_id]/items/bulk/items/reorder 총7개 route에서 각각 한 번만 사용한 `requireUser` 함수를 삭제한다. 호출점은 같은 client의 auth.getUser1회와 authResult.data.user를 직접 읽는다. root lists의2회 사용 함수는 유지한다.
- 수정 전 기존5 suite92 PASS, 새 characterization7 PASS. 수정 후6 suite99 PASS: shopping-leaf-auth-read / shopping-preview.backend / shopping-detail.backend / shopping-reorder.backend / shopping-complete.backend / shopping-share-text.backend. 새7건은 실제 route를 호출해 같은 client1회·getUser1회·guest401·from/rpc0을 고정한다.
- 전체 typecheck·제품7파일/새test ESLint·diff-check PASS, Anti Slop157 유지/baseline207/신규0. 제품 코드 순28줄 감소이며 테스트 추가를 제품 감소로 숨기지 않는다. 독립 리뷰 APPROVE: 동일99건·전체 typecheck·ESLint·diff-check를 직접 확인했다. Anti Slop은 부모 결과와 구분한다.
- 401 판정·body/ID 검사 순서·bootstrap·조회·read-only409·완료상태·RPC 인수/권한/소유권은 유지한다. auth 보안 설정을 변경하거나 새 auth wrapper를 만들지 않았다. wrapper 제거라 emitted JS 동일 주장은 하지 않는다. 전체 build·화면·실DB·운영 미실행이며 기존10실패·49원본 미확인은 별도다.

## 최근 반영: [#1771](https://github.com/netsus/homecook/pull/1771) 목록 GET 단발 타입 변환 함수 삭제

- `app/api/v1/tags/route.ts`의 단일사용 asTagsDbClient와 `app/api/v1/food-products/route.ts` GET의 단일사용 asCatalogDbClient를 삭제한다. unknown으로 넓혀 다시 단언하던 호출을 기존 consumer 타입의 직접 변수 대입으로 바꾼다. 새 wrapper/cast/adapter0, 제품 POST의 별도 create/bootstrap 단언 helper는 그대로 둔다.
- 원본 finding 감소와 다른 실제 불필요 코드 정리로, 제품 순8줄 감소·Anti Slop157 유지/baseline207/신규0이다. SDK 기본 RPC 결과의 any 경계·DB schema별 행 검증이 해결됐다는 주장은 하지 않는다.
- 편집 전후 recipe-tags-route / prepared-food-catalog-api / community-prepared-food-catalog-api 3 suite27 PASS. 전체 typecheck·변경 ESLint·diff-check PASS. 독립 리뷰 APPROVE: 동일27건·type/lint/diff와 제품순8줄감소를 직접 확인했다. Anti Slop은 부모 결과와 구분한다.
- 기존 scope·로그인·RPC 인수·검증·성공/오류 응답/빈 목록 처리는 유지한다. 단발 identity 함수 삭제이므로 전체 emitted JS byte-identical 주장은 하지 않는다. 운영·DB·보안설정 변경0, 전체 build·화면·실DB 미실행이다. 기존10실패·49원본 미확인은 별도다.
- 최종 제품 코드에서 기존 실패5 suite를 재실행해127건=117 PASS/같은10 FAIL/skip0, exit1을 확인했다. 실패제목은 기존 목록과 같고 성공27건과 합쳐 전체통과로 표현하지 않는다. 권한 검사 완화·기대값 교체0이다.

## 최근 반영: [#1772](https://github.com/netsus/homecook/pull/1772) 잔여 원본 ID별 판단 고정

- 제품157건을 없앤 것이 아니라 inventory의 미검토53건을 분류했다. 원본163 ID/file/rule/hash/occurrence/checkpoint위치/snippet은 불변이고 해결6+잔여157을 유지한다. 별도49건 원본은 여전히 미확인이다.
- 독립 조사자는 clean063f8a226의 전체 TypeScript 진단0 확인 후 미검토 연쇄 단언45건을 각1개씩 메모리에서 직접대입으로 바꿨다. 직접성공4/TS2589 30/구조불일치11이었다. 제품 파일을 수정하지 않았다. 실패 probe는 변경 파일의 semantic diagnostics 분리이며 성공4와 nutrition predecessor 계약 개선은 전체 program0도 확인했다.
- 성공4 중 POST2와 complete1은 #1767/#1769에 반영했다. 구조불일치11 중 실제 predecessor 계약2는 #1768로 해결했다. 남은39는 TS2589 30+구조불일치9이며 **단순삭제 불가이지 전체 리팩토링 불가가 아니다**. 각 ID의 holdReason/review에 query 단계·row shape·누락 capability 및 probe 한계를 남겼다.
- 구조9의 실제 경계는 bundle generic Row의 recipe 필수필드 미보장1, progress/growth→gamification capability 누락2, standalone cook-mode generated projection 불일치1, detail ingredients normalized-row 검증/타입 경계1, manual nutrition caller3, publish owner read1이다. 검증 없이 generated row·조인 형태를 단정하거나 adapter/새cast로 숨기지 않는다. 후속은 해당 consumer의 실제 read/row 계약을 먼저 확정하는 원인 수준 작업이다.
- 직접성공 나머지1은 session-attempts cook-mode로, 병행 무게 호환 경로다. 확인한 weight worktree에 현재 target diff는 없었지만 미래 겹침까지 증명하지 못한다. 부모에 중간 통지를 시도했으나 thread not found였으므로 owner 조율 전에는 보존한다. 기술 실패로 위장하지 않는다.
- prototype8은 production bundle이 아니라 고정 visual reference/디자인 handoff다. 이 중260505 Wave1의7건은 참고 README가 승인된 refreeze만 허용하며 screenshot capture 때 실제 실행되는 참조물이다. 나머지260512 desktop modal1건은 별도 디자인 handoff이며 같은 capture로 실행된다고 주장하지 않는다. 죽은 코드라 삭제하거나 Anti 수치만 줄이려고 고치지 않는다.
- production 체인1(dedupeRecipeIds)은 실제 검색 RPC 중복ID 제거와 회귀 책임이 있고 크기/latency 문제 증거가 없다. filter(Boolean) 방어를 없애거나 loop로 바꾸지 않는다. product projection4의 의미는 다르다: normalize366/368은 각 값이 문자열일 때만 trim한 키를 넣고 부재/null/undefined/비문자열은 모두 생략한다. payload1367은 food_product_id가 truthy일 때 두 키를 함께 넣으며 version은 그 안에서 own undefined/null일 수 있다. snapshot641만 hasOwn으로 부재와 own undefined/null을 구분한다. 각각의 키순서/조건을 보존하려고 typed 임시객체+무조건spread로 바꾸는 방식은 실제 단순성/할당 개선 근거가 없다. 이5건은 해결이 아닌 근거 없음 유지다.
- 독립 장부 검토의 첫 verdict는 REQUEST CHANGES였다. projection4에 동일한 own-key 사유를 붙인 MEDIUM 정확성 문제와 prototype7+1의 capture 문구 LOW를 수용해 항목별 실제 조건으로 바로잡았다. 수정 전 실패 판단을 숨기지 않으며 재검토에서 모두 해결된 것으로 APPROVE를 받았다.
- 현 배치에서 원본163 ID·hash/위치 불변·baseline count 대조·집계·모든 해결PR/보류근거 존재·diff를 기계 검증했다. master4a9da2702 통합 관련21 suite310 PASS, 전체 typecheck·이번 연속 변경15파일 ESLint PASS, Anti Slop157/baseline207/신규0을 확인했다. 063f8a226 이후 checker/baseline/save route/내부factory 파일 diff0이다. 독립 장부 검토 APPROVE: 실제 조건·원본identity·집계·30+9·제품diff0·diff-check를 직접 재확인했다. 통합310/type/lint/Anti는 부모 실행 결과와 구분한다. 운영·DB·권한·보안설정·배포 변경0이다.

## 후속 재개: 실제 계약 보강과 현재 범주

재개 당시 master81f0432be의 잔여157은 계약 보강39+보호99(추출기52/보안24/플래너23)+기존 보류5(명시4/like기술1)+병행조율1+유지13(prototype8/근거없음5)이다. 해결6은 이157에 합산하지 않는다. native owner1·수동 호출3·카드1·검색1·진행/활동2·재료 검색2의 실제 머지를 반영한 현재 후보는 다음과 같다.

| 상태 | 건수 | 처리 |
| --- | --- | --- |
| 계약 보강 필요 | 29 | 실제 read/write shape 근거로 계속 진행 |
| 보호: 추출기/보안/플래너 | 99 | 52/24/23, 부모 조율 전 보존 |
| 기존 명시/기술 보류 | 5 | #1745 1/save fallback3/like1 |
| 병행 충돌 조율 | 1 | session-attempts cook-mode 보존 |
| 의도적 유지 | 13 | prototype8+단순화 근거 없는5 |
| 잔여 후보 합계 | 147 | baseline207·신규0 |

### 최근 반영: [#1773](https://github.com/netsus/homecook/pull/1773) 영양 owner query 단계·행 계약

- 원본ID: `app/api/v1/recipes/[id]/publish/route.ts::anti-slop(no-chained-type-assertions)::59c307534b5136d238e3d3f1f3b86ec2cc1c4f5766ba2d2c1232194a98061068#1` (checkpoint40).
- 기존 from() 단계에 eq/maybeSingle/정렬query가 있다고 손코딩한 선언을 실제 native table→select→filter/query 단계로 맞춘다. 기존 recipe/ingredient 행 필드를 native query parser에 명시해 선택 행 추론을 보존한다. recipe_id 필터 열을 기존 실제 조회에 맞게 포함하며 다른 table/DB schema를 생성·변경하지 않는다. publish의 실제 owner client를 직접 전달한다. 새 adapter/cast/any·unknown 확대0이다.
- 제품2파일 emitted JS byte-identical: service SHA `e3a324c2406f3328b1f0033d30f40142f94a5985a8b57f473533eb391ef9f8a9`, publish SHA `058a78ad0bd1a14a9ada77364f6454acd4fd6279ec713a5cd92135bf155ac26b`. 실제 SQL/RPC/권한/DB/정책 동작은 변경하지 않는다.
- 편집 전 기존5 suite86 PASS, 실제 설치 SDK+외부네트워크 없는 fetch fixture5 PASS. 편집 후6 suite91 PASS, 전체 typecheck·변경 ESLint·diff PASS. 테스트를 별도 compiler program에 포함해 `id/base_servings/updated_at|null` 선택행 타입을 확인한 진단0도 확보했다. 일반 typecheck가 이 테스트까지 포함한다고 과장하지 않는다. Anti Slop157→156/baseline207/신규0이다.
- 새 shape5건은 실제 SDK의 select/filter/order·기존 missing/invalid 행4개 거절·snapshot 쓰기0을 확인한다. 최초 새fixture는 계산결과에 없는 recipe_id를 기대해1 FAIL/4 PASS였고 제품 수정 없이 기존 계산결과 계약으로 바로잡았다. 첫 손코딩 staged 타입안은 TS2589로 실패했고 native 행 identity로 해결했다. 추가 compiler probe의 incremental 설정5074와 type-only 변수 lint1경고도 각각 probe 옵션/실제 then 검사로 수정했으며 제품 config·규칙은 바꾸지 않았다.
- 독립 검토는91/type/lint/JS동일을 직접 확인했다. native builder는 Insert/Update:never여도 delete 메서드를 노출한다는 주석 정확성 지적을 수용해 완전 readonly나 runtime 권한 증거가 아님을 명시했다. 이 consumer는 select만 실행하며 권한 확대0이다. 보완본 APPROVE: 새5 fixture와 테스트를 포함한 전체 compiler program 진단0도 독립 재확인했다. Anti Slop은 부모 실행 결과와 구분한다.
- 넓은 recipe-api-contracts90건은89 PASS/기존 managed-image mock 인수 실패1/exit1로 동일하다. 기존10실패·원49 미확인·1745/1749/444와 보호범위를 유지하며 다음 비충돌 계약 보강을 계속한다. 전체 build·화면·실DB·운영 배포는 실행하지 않았다.

### 최근 반영: [#1774](https://github.com/netsus/homecook/pull/1774) 수동 영양 호출의 실제 factory client 보존

- 원본ID는 `app/api/v1/recipes/route.ts::anti-slop(no-chained-type-assertions)::9763ee8b73027d7a1bc31e5d48061557cffac3c56473ba77be5893eb979beef2#1/#2/#3` (checkpoint2243/2293/2364)이다.
- #1773의 정확 owner 행 계약을 이용해 수동 공개 준비·legacy RPC 후처리·legacy insert 후처리에 실제 routeClient를 직접 전달한다. dbClient는 동일 scope의 유일한 const routeClient 단언 별칭임을 AST로 확인했다. 타입이 축소된 별칭을 새로 단언하지 않고 실제 factory 타입을 보존한다. 초기 ManualRecipeDbClient/bootstrap/growth 경계는 이 배치에서 해결하지 않으며 그대로 둔다.
- 제품 코드 변경은 인수3개뿐이다. 관리형 exact 객체 검사를 강화하고 legacy RPC/insert2개 fixture를 추가했다. 편집 전후6 suite93 PASS, 전체 typecheck·변경 ESLint·diff-check PASS, Anti Slop156→153/baseline207/신규0이다. body·validation·authority·writer 선택·인수·best-effort 오류·API 응답은 유지한다.
- emitted JS byte-identical은 아니다. transpiler/AST로 유일한 const 별칭과 알려진 인수3개 교체 외에는 JS 차이가 없음을 확인했다(SHA `5b639cae6c2332d442d1061f23916c295f8bd742d8f48b09f8a89017d1f63416`). 실제 handler 회귀는 관리형 prepare와 legacy RPC/insert 각각 동일 원래 client 객체를 전달함을 검증했다.
- 독립 리뷰 APPROVE: 동일93건·type/lint/diff, 객체 identity·3개 인수 외 JS 불변과 SHA를 직접 확인했다. Anti Slop은 부모 실행 결과와 구분한다. 보호99·기존 보류5·조율1·유지13, 기존10실패·별도49원본미확인 유지다. 운영·DB·접근권한·제품정책·build/화면/실DB 배포0이며 다음 비충돌 계약 보강을 계속한다.

### 최근 반영: [#1775](https://github.com/netsus/homecook/pull/1775) 카드 저장상태 native 조인 계약

- 원본ID: `app/api/v1/recipes/route.ts::anti-slop(no-chained-type-assertions)::b862a39f029c3d4647b2b4c6f210ded3831c4960685812e00256fbdc0ea416bb#1` (checkpoint1832).
- 손코딩 fluent-query 선언을 실제 SDK의 table→select→filter 단계와 정확 선택행 계약으로 교체한다. 기존 migration의 book_id NOT NULL FK·unique(book_id,recipe_id)를 대조해 recipe_book_items→recipe_books 관계를 명시했다. 두 표의 로컬 projection이며 전체 DB schema 생성·변경은 아니다. factory client를 직접 전달하고 새 adapter/단언/any 확대0이다.
- helper의 쿼리·owner/book-type 필터·guest/empty/error·중복 제거·응답은 그대로다. native builder는 delete를 노출하므로 deep-readonly나 runtime 권한 보장이라고 주장하지 않는다. 실제 consumer는 select만 실행하며 접근 확대0이다.
- 편집 전 기존3 suite18 PASS·실제 SDK/fake fetch5 PASS. 새 exact-join 타입 테스트를 포함한 편집 전 소스 동결 compiler는 TS2589·TS2344 두 진단으로 기존 계약 결함을 재현했다. 편집 후5 suite29 PASS와 해당 테스트를 포함한 전체 compiler program diagnostics0을 확인했다. 일반 typecheck·변경 ESLint·diff PASS, Anti Slop153→152/baseline207/신규0이다.
- recipe-visibility-security의 구형 cast 문자열 기대를 같은 호출의 직접 routeClient 전달·해당 cast 부재 검사로 강화했다. 기존 service-role/요청 scope 보호 검사는 유지한다. 실제 DB/RLS 검증이나 보안 정책 변경으로 표현하지 않는다.
- 제품2파일 emitted JS byte-identical: helper SHA `addfca9b0faa3232cc8e9d3d1a86b54f699bc3df52c2e5f97d74510e1b9505d4`, recipes SHA `5b639cae6c2332d442d1061f23916c295f8bd742d8f48b09f8a89017d1f63416`. 독립 리뷰 APPROVE: 동일29건·type/lint/diff·추가 testroot compiler진단0·FK/행/JS동일을 직접 재확인했다. Anti Slop은 부모 결과와 구분한다.
- 보호99·기존 보류5·조율1·유지13, 기존10실패·별도49원본미확인·1745/1749/444를 유지한다. 운영·DB 쓰기·권한·제품정책·전체 build/화면/실DB 검증0이며 다음 비충돌 계약 보강을 계속한다.

### 최근 반영: [#1776](https://github.com/netsus/homecook/pull/1776) 검색 목록 native 선택행·RPC 계약

- 원본ID: `app/api/v1/recipes/route.ts::anti-slop(no-chained-type-assertions)::c4d70fde2704d45db48bb362e214d0d76570933efdba41a227b78fa8bd766064#1` (checkpoint1746).
- 임의 select문에도 같은 RecipeListRow를 반환한다고 선언하던 수동 from/rpc/query 계약을 native SDK의 실제 선택행과 두 RPC Args/Returns로 교체한다. core_schema_bootstrap:96의 필드/nullability(tags NOT NULL), visibility_read_hardening:3,572의 필터열/태그RPC, product_only_identity:935의 제품RPC와 대조했다. 로컬 소비 projection이며 전체 DB schema·runtime grant·deep-readonly가 아니다.
- 기존 sort/cursor helper에 order/or:this 최소 constraint를 두어 실제 builder의 선택 결과 identity를 유지한다. 새 wrapper/adapter나 결과 any 주석 없이 factory를 직접 대입하고 최종 결과 as도 제거했다. ingredient 검색2경계·bootstrap·보호영역은 그대로다.
- 수정 전 기존3 suite18 PASS·새 실제SDK/fake-fetch7 PASS, 수정 후4 suite25 PASS. 새7건은 latest/count 커서방향2·전체선택열·public/deleted필터·tag중복제거·두RPC exact body·title escape·오류2·null-data를 확인한다. 최초fixture는 동시RPC 순서를 잘못 기대해6 PASS/1 FAIL이었고, 제품 수정 없이 count2+순서독립 exact body 비교로 바로잡았다.
- 전체 typecheck·변경 ESLint·diff PASS, Anti Slop152→151/baseline207/신규0이다. 처음 입력한 없는 check:anti-slop 명령은 exit254였으며 실제 기존 lint:anti-slop 재실행 결과로 기록한다. 검사 설정·baseline·범위 변경0이다.
- 제품 emitted JS의 차이는 결과 표현식의 불필요 괄호 한 쌍 제거1줄뿐이다. byte-identical로 주장하지 않으며 현재 SHA는 `655ee974eeafb3b5292f5e0b9f86cc3c9243acc77b2b1bcb263144a8ce795b7f`다. 쿼리·정렬·커서·RPC·빈값/오류·응답·실행동작은 유지한다.
- 독립 리뷰 APPROVE: 같은25건·전체type/lint/diff·migration 열/nullability/RPC를 재확인했다. private 타입의 select("id")가 정확 {id:string}[]|null, 두RPC가 정확 {recipe_id:string}[]|null임을 메모리 전용 assertion을 넣은 전체 compiler program diagnostics0으로 확인했다. 괄호를 제외한 emitted JS AST도 동일하다. Anti Slop은 부모 결과와 구분한다.
- 보호99·기존 보류5·조율1·유지13, 기존10실패·49원본미확인·1745/1749/444는 유지한다. 진행/활동 capability 후속안은 제품 편집0이며, 메모리 probe에서 기존 award fixture13개의 축소 타입 단언을 추가 확인했다. 그 fixture를 완전한 projection 증거로 쓰지 않으며 실제 성공/실패 경로 보강 후 별도 진행한다. 운영·DB 쓰기·권한·제품정책·전체 build/화면/실DB 검증0이다.

### 최근 반영: [#1777](https://github.com/netsus/homecook/pull/1777) 진행/활동 writer의 실제 projection capability 계약

- 원본ID는 `lib/server/user-progress.ts::anti-slop(no-chained-type-assertions)::a2c5fd4bd48d3ce5683f88b76fd735a69e7b35408f4dfb83886844dddfa6b4bf#1` (checkpoint431), `lib/server/user-growth-activity.ts::anti-slop(no-chained-type-assertions)::4d0a30d6891165e87b8ad349dc6c268b125b55a22ae06cd50835576b733680ab#1` (checkpoint164)이다.
- award 인수에 이미 호출하는 gamification 계약을 명시하되 core progress 읽기 계약은 그대로 둔다. growth 기록 client에는 기존 부가 progress/gamification 소비 계약을 함께 선언한다. 내부 재단언2개와 book 생성의 불필요 축소 단일단언만 제거한다. 외부 factory/공통 bootstrap 경계 단언은 남으며 이 배치가 그 경계까지 해결한 것은 아니다.
- 원장·summary·projection 순서·best-effort 오류 흡수·중복 종료·writer/권한은 실행 코드 그대로다. 제품3파일 emitted JS byte-identical: progress SHA `34227e4aaaa6026cd8d513181b3d80fbc9a764dda697d1108659e30e60baefde`, growth SHA `0c2f281fd286eee2c986b61a18cbd35e3fc15172b2cc03a9b48f2257ebdd9a40`, book route SHA `1e9ddd6719bce5d0eada10db48e365deac3338f41f8e3b0fd92e51b97a10490e`다.
- 수정 전 기존7 suite51 PASS·새7 PASS, 수정 후8 suite58 PASS. 새 fixture는 table별 객체+명시 반환 generic from으로 단언/any 없이 전체 소비 client에 직접 대입한다. badge/achievement/quest/notification의 실제 쓰기 인수, 원장/summary, 실패 반환·throw 후 원장 성공, 중복 후 projection0을 확인한다. SDK/DB/RLS simulator나 운영 권한 증거로 주장하지 않는다.
- 제품 수정 전 exact capability 타입 검사2개는 TS2344로 기존 누락을 재현했다. 최초 fixture는 generic from 반환 annotation 누락으로 TS2322도 있었고 명시 반환형·기존 summary version optional 계약으로 수정한 뒤 예상 TS2344 두 개만 남음을 확인했다. 최종 전체 typecheck·변경 ESLint·diff와 verify:anti-slop(규칙fixture·tool타입·baseline) 모두 PASS, 실제151→149/baseline207/신규0이다.
- 기존 award fixture13개는 실제 인수형 Parameters로 경계 단언만 정합했다. readUserProgress의 core 타입은 바꾸지 않았다. 일부 legacy fixture는 projection table 누락을 의도적으로 throw하고 흡수한다. 그중 기존 progress/source-action smoke는 부가 알림 시도가 실제 있었음도 검증한다. 이 단언들을 완전한 client shape 증거로 세지 않으며 새 typed full-path fixture와 구분한다.
- 실제 SDK를 기존 progress/gamification/activity 전체 수동 계약에 직접 대입하는 별도 probe는 TS2322/TS2589로 실패했다. 특히 head:true CountTable의 data:null 고정과 native builder 반환 타입이 다르다. 이 기존 유지보수 부채와 외부 단언은 미해결이며 이번 내부 capability 교집합으로 해결했다고 과장하지 않는다.
- 독립 리뷰 APPROVE: 동일58건·전체typecheck·변경8파일 lint·diff·제품3파일JS동일을 직접 확인했다. typed fixture의 성공 쓰기/실패 흡수/중복 경로와 core read 보존을 검토했으며 SDK/외부 경계 한계도 그대로다. Anti Slop은 부모 실행 결과와 구분한다.
- 보호99·기존 보류5·조율1·유지13, 기존10실패·49원본미확인·1745/1749/444는 유지한다. 실제 DB 쓰기·grant/RLS·인증설정·제품정책·운영배포·전체 build/화면/실DB 검증0이다.

### 최근 반영: [#1778](https://github.com/netsus/homecook/pull/1778) 재료 검색의 카탈로그/레시피 native 소비 계약

- 원본ID는 `app/api/v1/recipes/route.ts::anti-slop(no-chained-type-assertions)::618b2074248421401bfdc85e35f73bdf1ff1b63afb3393caf1bd1612c5090a72#1` (checkpoint1749), 같은 파일 hash `598a39d3f5bf77409ff13897fb9870725912ac3348c52e72eb2afa3339aadb32#1` (checkpoint1750)이다.
- 실제 카탈로그 ingredients/ingredient_synonyms·alias view와 recipe_ingredients/선택 RPC 기능을 분리한다. FK·category_code nullable·alias view5열·저장 ingredient_id nullable·RPC link의 nonnull ID를 기존 migration과 대조했다. 잘못된 양쪽 동일 client 요구를 제거하고 실제 factory를 직접 전달하며 fixture의 기존 연쇄 단언도 제거했다.
- 선택 RPC 분기를 그대로 유지한다. 저장 ID는 string|null로 맞추고 selected group에 null이 맞지 않음을 명시한다. 행을 버리는 filter나 순서 변경을 넣지 않는다. 정상 SDK의 IN은 null을 제외하지만, 고의 null 응답을 넣은 방어 회귀에서도 이전 search 결과 유지·선택 filter 불일치를 확인했다. 잘못된 fixture 응답을 실제 DB/RLS 동작으로 주장하지 않는다.
- 편집 전4 suite27 PASS, 편집 후 exact-native 타입 회귀1개를 더한4 suite28 PASS. 단언 없는 실제 SDK client 대입과 synonym inner object·alias5열·nullable 저장행·nonnull RPC의 정확4개 projection 타입을 전체 typecheck에 포함했다. 기존 fake ingredient 행의 누락 category_code는 실제 선택열에 맞게 null로 정합했다. 최종 typecheck·변경 ESLint·diff·verify:anti-slop PASS, 실제149→147/baseline207/신규0이다.
- route emitted JS byte-identical SHA `655ee974eeafb3b5292f5e0b9f86cc3c9243acc77b2b1bcb263144a8ce795b7f`. helper JS는 null 비교1곳만 다르며 SHA `86f2d28c726705dd5ff9d4e9ba476656c5b15aaf04a95f5be64f397df53c323e`다. 새 local schema는 전체 DB schema/runtime grant/deep-readonly가 아니며 alias loader의 기존 unknown/cast 경계는 그대로다.
- 독립 리뷰 APPROVE: 같은28건·전체typecheck·변경3파일 lint·diff·FK/view/nullability/RPC·JS차이를 재확인했다. Anti Slop은 부모 실행 결과와 구분한다. 보호99·기존 보류5·조율1·유지13·10기존실패·49원본미확인·1745/1749/444와 운영/DB/권한/정책 무변경을 유지한다.

### 최근 통합과 공유 계약 조사 한계

- master81563d1f7과 코드가 같은 #1777 최종head에서 후속20 suite187 PASS. 별도 기존5 suite127건은117 PASS/같은10 FAIL(exit1)을 재현했다. 전체 green으로 쓰거나 오래된 실패를 이번 배치 성과로 세지 않는다.
- 영양 memory 직접 전달은 최신81563d1f7 전체 program에서 TS2345 1건이다. loose Row 외에 BundleQuery가 native builder의 url/headers/urlLengthLimit/cloneRequestState 등 상태8개를 갖지 않는 원인이다. 정확 select-literal 공통 구조안은 native 대입 TS2589 1건, native|memory union 호출은 TS2349 2건이었다. 가짜 SDK 메서드를 채우거나 bundle에 없는 revision/quantity_input을 만들지 않는다. 별도 pure-core 분리 가능성을 남기며 모든 리팩터링 불가로 단정하지 않는다.
- 공통 bootstrap의 native3표와 각1표 native.from 교집합안은 보호 meals/route.ts:762의 TS2589 1건으로 미채택했다. users만 native로 바꾸고 ensurePublicUserRow/readUserRow를1표로 좁힌 안도 cooking/sessions/route.ts:144 TS2589 1건이다. 동일 const 객체의 원 factory 인수를 전달해도 그1건이 남았다. 제품/보호 파일 변경0이며, 이 실패를 해결로 세지 않는다.
- 위 bootstrap 조사 선언에서 interface Row를 섞어 생긴 never 오류와 SDK Views overload를 잘못 특수화한 TS2344는 probe 자체 오류로 정정·분리했다. 실제 DB의 social_id/settings_json NOT NULL과 JSONB 전체 타입은 기존 소비 계약과 구별한다. 이 특정 native 교체안의 실패는 다른 정확 계약안이나 전체26개 bootstrap 관련 후속 작업의 불가능 증거가 아니다.

## [#1779](https://github.com/netsus/homecook/pull/1779) 147 checkpoint: 확인 결과와 조율할 다음 경계

- 기준2cd4aab93에서 통합20 suite190 PASS·전체 typecheck·verify:anti-slop(규칙fixture/도구type/baseline147·신규0)·diff PASS. 이번6제품PR의 변경TS19파일을 포함한24파일 lint도 PASS했다. 추가5개 test는 별도 작업 변경이며 이 작업 성과로 귀속하지 않는다.
- 독립 통합검토도 동일190건·전체typecheck·diff exit0을 확인했다. 아래127건의 실패 묶음과 실험WT69건은 그 독립 실행에 포함하지 않았으며, Anti Slop은 부모 결과와 구분한다.
- 같은 기준에서 넓은 기존5 suite127건은117 PASS/같은10 FAIL(exit1)이다. 성공190건과 별도 집계하며 보호 검사나 기대값을 완화하지 않았다. 아래 기존 실패 원인·1745/1749/444·49원본 미확인은 그대로다.

| 계약 후보29의 현재 구성 | 개수 | 다음 판단에 필요한 근거 |
| --- | --- | --- |
| 공유 bootstrap과 각 local query 계약 | 26 | 아래 직접3개 분해에서 확인한 SDK any/eq 경계와 각 실제 row 계약. 공통 factory는 보호 소스이므로 부모 조율 없이 변경하지 않음 |
| 영양 refresh memory | 1 | native builder 흉내 대신 pure-core/bundle 입력·guard·오류 경계 분리 설계. bundle에 없는 필드를 만들지 않음 |
| recipe detail/standalone cook-mode 소비 view | 2 | canonical·quantity 연결 코드와 병행 소유 범위 조율, 실제 public/auth·legacy fallback 행 계약 |

- bootstrap 추가 read-only probe: 정확 select literal7개 자체와 insert/update→select→SingleRowQuery 단계 분리 자체는 각각 whole-program0이다. 하지만 keep/uneat/meal-log의 기존 단언을 직접 대입으로 바꾸면 각각 TS2589 1건이다. from(users)와 정확 select까지는0, eq 요구에서 재현되고 insert-only/update-only는0이었다. 원인은 SupabaseClient<any>의 ResolveFilterValue 비교 경계다. 단계 정리는 가치가 있어도 직접 대입3개를 해결한 충분조건은 아니므로 이번에 제품 반영하지 않았다.
- 부모의 2cd4aab93 combined literal/phase+3direct probe도 keep의 TS2589 1건이었다. 이는 세 항목 모두 성공이라는 증거가 아니며, 독립 각1개 probe 결과와 구분한다. 보호 factory 타입 또는 검증 경계 설계 없이 새 단언/adapter로 숨기지 않는다.
- 실험 WT `.worktrees/bootstrap-select-projection-contract-20261017`에는 미추적 `tests/bootstrap-sdk-projection-contract.test.ts`만 남겼다. 제품 편집/커밋/PR은0이다. 새 실제SDK7+기존4 suite62 =5 suite69 runtime PASS지만 직접 SDK client 대입 typecheck는 TS2589 1/exit2다. 최초 fixture의 POST/PATCH object Accept 누락3실패는 제품 수정 없이 정정했다. 이 파일은 미완료 실험이며 master의190건·typecheck 성공에 포함하지 않는다.
- standalone cook-mode의 별도 native3표+join3표/FK/public-auth 동일문자열/소비view안은 전체 compiler3진단(ParserError 전파)으로 미채택했다. legacy step fallback과 canonical productIngredients/cookingSteps 재대입까지 타입 영향이 가므로, 단순 한 줄 삭제가 아닌 병행 소유자 조율과 별도 회귀 범위가 필요하다. source/DB 변경0이며 이 특정안 실패를 전체 native 계약 불가로 확대하지 않는다.
- 이 checkpoint는 원본163 ID/hash를 보존한다. 해결16·계약29·보호99·명시4·기술1·조율1·고정참조8·근거없음5의 합163, 현재진단147이다. 보호99와 기존 보류를 스스로 해제하지 않는다. 전체 build·화면·실DB·운영 배포를 실행하지 않았다.

## 2026-10-19 재개: 원본29 재대조와 상세 재료 조회1건 로컬 검증

- 시작 조건 충족: 부모가 v85와 요리 개선9건의 운영 반영·실제 Chrome 검증 완료를 전달했다. 최신 기준은 master `f02e0bb8976a928ee7104bd2e55e3dad71f9142c`다. 공식 status를 별도 읽어 운영 웹 `d09ab4bcdd519e2921165ff33779821096172373`/build `prelaunch-d09ab4bcdd51-h6rAwJ`, DB238 committed/ready, readerPending=false/recoveryPending=false/normalDeploymentAllowed=true를 확인했다. worker gen50·기존 키/정책/고정만료·R2 OFF 보존은 부모의 운영 인계이며 이번 작업에서 worker나 비밀값을 재조사하지 않았다.
- 선행 운영 기록은 [요리 경험 최종 확인](cooking-experience-operating-checks-20261019.md)이다. 원235/238 승인·receipt와 reader floor48c4를 보존하며 동시 배포하지 않는다. 향후 앱 전용 반영도 정확한 새 SHA로 공식 plan과 `--already-applied-db` 경로를 먼저 확인한다. 이번 턴의 운영 쓰기·DB·배포는0이다.
- 원본 ID/hash를 실제 진단에 대조한 결과 계약29=상세/독립요리2+영양memory1+bootstrap26이 모두 남아 있다. 상세의 canonical 영양 계산이 선행 개선에서 추가됐지만 대상 정규화 단언은 남았고, 독립 요리모드·memory·bootstrap 파일은 이 기준 사이에 변경되지 않았다. 과거39 중 이미 해결한10건을 다시 작업하지 않으며49원본 미확인도 별도다.
- 전체147→146은 별도 선행 변경이다. PR1789가 save의 generic service-role fallback을 제거한 후 PR1807이 같은 userDbClient를 재사용해 원본 추가 단언1건을 없앴다. 이 작업이 save/권한을 수정하거나 보류444를 반영한 것이 아니며 남은 save 단언·권한 문제 전체 해결을 주장하지 않는다. 이전 장부의 fallback 존재·147·명시4 표기는 각 당시 checkpoint 기록으로 읽는다.
- 첫 작은 작업: `recipes/[id]/route.ts`의 재료 조회만 실제 native SDK table/select/filter 단계, nullable ingredient FK 및 public/auth×quantity4 선택 행으로 맞췄다. 동일 routeClient를 구조적으로 대입하고 기존 normalizer의 소비 계약으로 결과를 받으므로 결과의 unknown→연쇄 단언1건을 제거한다. 선택 열/순서·recipe_id 필터·sort_order·Promise.all의 요청 병렬성·public/auth 제품 라벨 경로·canonical 영양/quantity·권한/오류 응답은 유지한다. DB schema/grant나 runtime validation을 새로 바꾸지 않았다.
- 회귀 우선: 제품 수정 전 기존 상세23 PASS/67필터 SKIP와 새 실제SDK5 PASS를 확인했다. 최종 새8건에는 네 선택 행의 compiler 검사 및 제품 전용/null join auth/public2건을 추가했다. 최종 상세 선택2 suite31 PASS/67필터 SKIP, 별도 기본 설정3 suite28 PASS(새8+수량13+canonical 영양7), 중복8건을 제외한 고유51 PASS다. product 설정은 canonical suite를 포함하지 않아 첫 선택 실행에서는 수량13만 실행됐고, 이후 기본 설정에서 영양7을 실제 실행했다.
- 전체 typecheck·변경TS lint(max-warnings0)·verify:anti-slop(145/baseline207/신규0)·diff PASS다. 독립 최종 리뷰는 새8 PASS, nonincremental 전체typecheck/diff PASS와 SQL/SDK 요청 지연 실행을 직접 확인해 APPROVE했다. 최초 union4를 한 select에 전달한 초안은 TS2590으로 실패했고 개별 native select 추론으로 수정했다. type-only fixture 변수 lint경고4도 실제 builder then 확인으로 정정했다. 단언·any·검사 억제나 baseline 갱신으로 통과시키지 않았다.
- 상태: 별도 `codex/detail-row-contract-20261019` 작업트리의 로컬 검증본이며 미머지·미배포다. master 계약29에서 완료로 차감하지 않고 채택 후28(독립요리1+memory1+bootstrap26)로 기록한다. 원장 pendingLocalResolution과 candidateObservation은 이 로컬 상태를 명시한다. 기존 checkout·원장 미커밋 계획·고정 복구 checkout·bootstrap 미완료 실험은 보존했다. 전체 build/화면/실DB/RLS 및 기존 넓은 실패 묶음을 이번에 재실행한 것으로 주장하지 않는다.

## PR1811 머지 후 배포 차단과 독립 요리모드 로컬 검증

- PR1811은 검증한 head572063abd 그대로 ready→merge했고 실제 merge는 `64112be4bec14e29f88449214140250685210f15`다. 운영은 d09ab4b/DB238 ready·복구대기없음으로 재확인했다. 정확64112be4·`--already-applied-db`·기존 full-local 설정·`test:feedback-batch:web`를 지정한 공식 plan은 exit1, `Exact nutrition/recipe-save source is not already committed under its separate authority`로 거부됐다. deploy/새 상세 운영 검증은 미실행이며 기존 PIN/승인/가드·DB/worker/환경을 바꾸지 않았다.
- 공개 소스·테스트와 독립 읽기 전용 분석상 현재238의 새 앱-only successor 경로는 없다. 상세의 기존 PATCH writer 문자열이 legacy runtime source 검사에 걸리지만, 실제 PATCH/DELETE 및 GET 외 함수의 ES2022 emit은 양쪽 동일하다. 정확한 원인·최소 별도 successor 검증기·음성 회귀·추가 승인 범위는 [DB238 앱 후속 배포 검토](anti-slop-db238-app-successor-review-20261019.md)를 따른다. 제안은 미구현이며 과거승인쌍·다른 mode 전용이나 가드완화로 배포하지 않는다.
- 부모의 별도 로컬 진행 지시에 따라 `codex/cook-mode-row-contract-20261019`에서 독립 요리모드1건만 수정했다. 손코딩 fluent query interface를 실제 native6표/ingredient FK/step method FK/junction `step_id`·`method_id` 관계로 맞췄다. public/auth의 선택문을 각각 추론하고 기존 CookingIngredientRow/CookingStepRow 소비 view로 구조대입해 같은 client의 연쇄 단언1건을 제거했다. 새 단언/any/검사억제/wrapper0, SQL/권한/운영 변경0이다.
- 제품 수정 전 기존 standalone/canonical9+신규SDK7 PASS, 최종 native8(타입/선택열/인분/제품전용null join/legacy fallback/오류/잘못된인분)+기존9=2 suite17 PASS다. 전체 typecheck·변경 lint(max-warnings0)·Anti144/baseline207/신규0·diff PASS다. 독립 리뷰도17/전체nonincremental typecheck/diff PASS 및 SQL/FK/legacy/canonical/실패차단을 확인해 APPROVE했다. 비차단 NOT NULL 정밀도 권고는 cooking_method_id:string으로 수용하고 compiler를 재확인했다.
- 현재 로컬 검증본은 미머지·미배포다. master 계약28에서 아직 차감하지 않고 채택 후27(memory1+bootstrap26)로 구분한다. 원장의 pendingLocalResolution/candidateObservation에 남겼다. DB238 앱-only 도구 단계는 부모의 최소 변경 범위 승인 전 보류하며, 원격/운영 차단을 로컬 계약 실패로 표현하지 않는다. 실제 DB/RLS·브라우저·운영 검증이나 build를 이번 로컬 검증으로 대체하지 않는다.

## 영양 memory 로컬 계약 분리와 승인 대기 보존

- 부모가 새 DB238 앱 successor/CLI 변경·운영 범위를 사용자에게 확인 중이므로 승인 응답 전 새 검증기와 배포는 시작하지 않는다. 검증된 독립 요리모드 후보는 로컬 커밋 `a30be1a6a`로 보존했고 push/머지/배포하지 않았다. 다음 영양 변경은 그 뒤 별도 작은 커밋으로 분리한다.
- memory의 `RecipeNutritionServiceClient` 연쇄 단언1건을 제거했다. native 서비스는 기존 실제 SDK 조회·읽기 오류 처리를 유지하고, 공통 `prepareRecipeNutritionSnapshotFromInput`에 입력 행·실제 predecessor loader·RPC capability를 전달한다. refresh는 검증된 job bundle의 recipe와 기존 정렬된 재료를 직접 전달하며 기존 evidence filter/order/paging과 product/quantity RPC reader를 사용한다. 메모리가 SDK 내부 상태를 흉내 내도록 만들지 않았고 미사용 recipes table/maybeSingle도 삭제했다.
- 새 unknown 입력 경계는 실제 소비 행의 owner/revision/재료ID/제품pin 타입을 확인한다. 이는 잘못된 RPC 메타데이터를 쓰기 전 INVALID_RECIPE_NUTRITION_INPUT으로 명시 거절하는 경계 보강이다. 정상 SQL 행·기존 owner/session/version/quantity 판정·guard 독립 재계산/비교·마지막 두 RPC와 stale 오류·job acknowledgement 금지·DB 계약/권한/실데이터는 바꾸지 않는다. bundle에 없는 revision/quantity_input을 만들지 않는다.
- 수정 전4 suite66 PASS, 최종5 suite79 PASS(native owner SDK 포함, 새refresh8건)다. 연관 AI runtime/worker·발행·quantity-v4 선택은4 suite37 PASS/조건부1 suite12 SKIP이며 제외를 성공에 합산하지 않는다. 고유116 PASS/12 SKIP다. 전체 typecheck·변경 lint(max-warnings0)·Anti143/baseline207/신규0·diff PASS다. 독립 리뷰도3 suite61 PASS/전체nonincremental typecheck/diff PASS를 확인해 APPROVE했고 가짜 SDK cast wrapper가 아닌 실제 두 producer의 입력 경계 분리임을 검토했다.
- 최초 새fixture1건은 guard를 sort_order 순서로 가정해 실패했고 실제 ID 정렬 계약으로 fixture만 정정했다. 새unknown guard의 falsy product pin 타입 좁힘 문제는 root와 독립 리뷰에서 확인해 optional 필드별 실제 타입 검사와 false/object 회귀2건으로 수정했다. 검사·guard·baseline을 완화하지 않았다.
- 요리모드+memory 두 로컬 후보는 미머지·미배포이므로 master 계약28에서 완료로 차감하지 않는다. 함께 채택하면 공통 초기화26만 남는다. 원본39·원본미확인49·전체진단145/로컬143은 서로 다른 분모다. 승계 검증기/운영 배포는 승인 대기 중이며 이 로컬 검증을 실제 DB/RLS·운영 결과로 표현하지 않는다.

## Bootstrap26 분할: 첫 초기화 전용3건 로컬 완료

- DB238 successor 도구·CLI와 배포는 계속 승인 대기다. bootstrap26을 한 번에 치환하지 않고 실제 소비 계약별로 다음처럼 분리한다. 이 순서는 로컬 후보 작업 순서이며 승인 범위를 확장하지 않는다.

| 작은 묶음 | 기존 계약 후보 수 |
| --- | --- |
| 초기화 전용: leftovers keep/uneat, meal-log 공통 helper | 3 |
| leftovers 목록/eat | 2 |
| recipe-books | 6 |
| shopping preview/root/leaf | 9 |
| pantry root/bundles | 2 |
| manual recipe 생성 | 1 |
| cooking sessions root/cook-mode/cancel | 3 |

- 첫3건의 기존 `UserBootstrapDbClient` 하나를 실제 선택문·insert/update→select→maybeSingle 단계에 맞췄다. users/settings는 JSONB 소비 경계인 unknown, 북 종류는 실제4종 enum, 표지·이메일은 실제 nullable, social_id는 NOT NULL string이다. 초기화의 네 동등 필터는 공식 SDK `.match`로 표현하며 기존 `.eq`와 동일한 `column=eq.value` 요청을 검증했다. 별도 native/legacy union·adapter·새 단언·검사억제 없이 세 호출부의 연쇄 단언을 제거했다. owner/auth/RPC 순서, seed/default/version, 정렬, 23505 허용과 기존 payload를 유지한다.
- 수정 전3 suite64 PASS. 최종 SDK projection/JSON nullable·기존 bootstrap/leftover/UI auth-return4 suite75 PASS와 실제 SDK를 거치는 meal-log 경계4 PASS로 고유5 suite79 PASS다. meal-log는 guest401/stale409/bootstrap500/성공 시 auth→users→users→verified→internal 순서를 고정했다. 전체 typecheck·변경 lint·Anti140/baseline207/신규0·diff PASS다. 독립 리뷰는 이 중69 PASS와 전체 nonincremental typecheck/diff를 확인해 APPROVE했다. 독립69는79의 부분집합이지 추가 성공 수가 아니다.
- 실패한 native/legacy union 초안은 overload TS2349가 발생해 전부 폐기했다. 선택 결과의 list/single 단계를 잘못 선언한 TS2322도 실제 select→maybeSingle 단계로 수정했다. 기존 실패를 감추거나 suppress하지 않았다. 원래 보존된 bootstrap 실험 작업트리의 미추적 fixture는 수정하지 않고 현재 작업트리에 별도 복사·확장했다.
- factory의 기존 SDK generic any까지 해결했다는 뜻은 아니다. 이번 증거는 실제 선택 필드/nullable/cardinality와 소비 계약·요청 wire이며 실제 DB/RLS·운영 검증은 아니다. auth/factory/플래너/meal 제품 코드와 SQL·배포 도구·환경·운영 데이터는 변경하지 않았다.
- 앞선 로컬 커밋 `a30be1a6a`·`ad298ab0b`와 이번3건을 채택하면 bootstrap23이 남는다. master 계약28 상태는 아직 차감하지 않고 원장에 pendingLocalResolution5건으로 보존한다. push/PR/머지/배포는 실행하지 않았다.

## Bootstrap 후속: leftovers 목록·eat2건 로컬 완료

- 첫3건은 `0c9320a80`으로 보존했다. 다음 목록/eat의 연쇄 단언2건을 제거했다. 목록의 손코딩 fluent interface를 소비6표의 native SDK 행과 실제 `meals.column_id`/`cooking_session_meals.meal_id` many-to-one FK로 맞췄다. 같은 request client를 bootstrap과 reader에 직접 구조대입하며 eat의 단발 타입 별칭을 삭제했다. 큰 공통 추상화·새 단언·wrapper·억제0이다.
- 기존44 PASS 후 최종3 suite52 PASS(SDK8+backend33+bootstrap11), 전체 typecheck·변경 lint(max-warnings0)·Anti138/baseline207/신규0·diff PASS다. 독립 리뷰는 SDK/backend41+parser30=71 PASS와 전체 nonincremental typecheck/diff를 확인해 APPROVE했다. 서로 겹친 성공 수는 합산하지 않는다.
- SDK 신규 회귀는 정확 선택문·owner/in 필터·정렬·eaten 만료 조건·snapshot 우선·source 우선/origin fallback·null 관계·guest401/누락snapshot500/조회오류500을 고정했다. 최초 타입 fixture의 nullable FK 기대값은 SDK의 실제 NOT NULL FK 객체 추론과 달라 실패해 실제 추론으로 정정했다. nullable runtime/array-shaped 호환 방어는 기존대로이며 타입·검사를 약화하지 않았다.
- 응답·auth/bootstrap·eat 권위/RPC/보상 순서와 SQL/권한/운영 환경 불변. 로컬 채택 후 잔여21과 master 잔여28을 구분한다. 도구 승계/배포는 승인 대기, push/PR/머지/DB 쓰기는0이다.

## Bootstrap 후속: 장보기 공유 텍스트1건 로컬 완료

- leftovers2는 `a8537bbfa`로 보존했다. 다음은 병행 저장/플래너 범위를 피해 read-only 공유 텍스트1건만 분리했다. 수동 query interface를 소비3표/실제 필수 ingredient FK의 native SDK projection으로 맞추고 같은 request client를 bootstrap/reader에 직접 대입했다. 소비 view의 nullable 관계 방어는 보존했다. 공통 추상화·새 단언·억제0이다.
- 수정 전 backend/auth2 suite13 PASS, 최종 SDK9+기존13+bootstrap11=4 suite33 PASS, 전체 typecheck·변경 lint(max-warnings0)·Anti137/baseline207/신규0·diff PASS다. 필수 FK 객체 추론과 실제 선택문/boolean필터/이중정렬/owner403·guest401·missing404·items500·완료 목록 공유·null join fallback·빈 목록의 텍스트를 고정했다.
- 독립 리뷰도 최종4 suite33 PASS·전체 nonincremental typecheck/diff PASS와 실제 SQL/동일 client/권한·필터 보존을 확인해 APPROVE했다. 독립 검사 수는 중복 합산하지 않는다.
- 최초 SDK Row를 기존 interface로 재사용하면 SDK Record 제약 때문에 schema가 never로 추론돼 TS2339/TS2344가 발생했다. 동일 필드의 object type alias로 맞춰 실제 compiler/SDK 계약을 통과시켰다. 타입 assertion·index signature·검사 완화로 우회하지 않았다.
- master 계약28은 그대로이며 로컬 채택 후20으로 구분한다. 원격 push/PR/머지·새 배포 도구·운영 배포·DB 쓰기·권한 변경0, 승인 대기는 유지한다.

## Bootstrap 후속: 장보기 순서 변경1건 로컬 완료

- 공유 텍스트1건은 `c6b6654b9`로 보존했다. 순서 변경은 SDK 두 표의 실제 선택 행·sort_order 한 필드 update·반환 없는 update 단계로 계약을 맞췄다. 같은 request client의 bootstrap/reader 직접 대입으로 연쇄 단언1건과 손코딩 fluent interface를 제거했다. 런타임 함수·요청 순서·파서·오류/응답 로직은 그대로다.
- 수정 전2 suite16 PASS, 최종 SDK9+기존16+bootstrap11=4 suite36 PASS, 전체 typecheck·변경 lint(max-warnings0)·Anti136/baseline207/신규0·diff PASS다. 새 실제 SDK 요청 fixture는 guest401/owner403/완료409/누락404/조회500/update409·500, 실제 소속 item만 정확히 한 번 PATCH, update의 list/id 필터와 sort_order만 전달을 고정했다. 실제 DB 쓰기는0이다.
- 독립 리뷰도 최종4 suite36 PASS·전체 nonincremental typecheck/diff PASS 및 실제 SQL/반환 없는 update/owner·완료·소속 필터 보존을 확인해 APPROVE했다. root와 중복된 성공 수는 합산하지 않는다.
- master 계약28과 로컬 채택 후19를 구분한다. 새 단언·wrapper·검사 억제·DB/권한/운영 변경0, 원격 반영과 승계 도구·배포는 대기한다.

## Bootstrap 후속: 장보기 일괄 체크1건 로컬 완료

- reorder1은 `bb551e102`로 보존했다. bulk의 실제 두 표·check-only update→select 반환 행을 native SDK에 맞추고 같은 request client를 bootstrap/reader에 직접 대입했다. 기존 `amounts_json` unknown 정규화와 반환 sort_order/id 정렬·구매 제외 false 필터·owner/완료 보호·단일 update를 유지했다. 새 단언·억제·wrapper·공통 계층0이다.
- 수정 전25 PASS, 최종 SDK9+기존25+bootstrap11=4 suite45 PASS, 전체 typecheck·변경 lint(max-warnings0)·Anti135/baseline207/신규0·diff PASS다. SDK 회귀는 true/false/빈반환·소유403/완료409/누락404/guest401/update500 및 정확 payload/선택문/list/item/pantry-excluded 필터·정규화/동률정렬을 고정한다.
- 독립 리뷰도4 suite45 PASS·전체 nonincremental typecheck/diff PASS와 실제 SQL·단일 쓰기/필터 보존을 확인해 APPROVE했다. 중복 성공 수는 합산하지 않는다.
- master 계약28과 로컬 채택 후18을 구분한다. 실제 DB 쓰기·SQL/권한/도구·운영 변경과 원격 반영0, 승계 도구·배포는 승인 대기를 유지한다.

## Bootstrap 후속: 장보기 단건 체크1건 로컬 완료

- bulk1은 `70d8930ce`로 보존했다. 단건 항목의 실제 두 표/선택 행·flag-only update·select→maybeSingle 단계를 SDK에 맞춰 손코딩 fluent query interface와 연쇄 단언1건을 제거했다. 같은 request client bootstrap 직접 대입이며 no-op·제외면 체크false·owner/완료·이중 list/id 필터·JSON 정규화와 응답은 그대로다.
- 관련 기존25+SDK11+bootstrap11=4 suite47 PASS, 전체 typecheck·변경 lint(max-warnings0)·Anti134/baseline207/신규0·diff PASS다. 신규 fixture는 정상체크/제외/no-op·목록/항목404·guest401/owner403/완료409/update409·500과 정확 조회/쓰기 필터·payload를 고정했다.
- 독립 리뷰도4 suite47 PASS·전체 nonincremental typecheck/diff PASS와 실제 SQL/selected-single/보호 흐름 불변을 확인해 APPROVE했다. 중복 수는 합산하지 않는다.
- master 계약28은 유지하고 로컬 채택 후17로 구분한다. DB/SQL/권한/새 추상화·단언·억제/운영 변경0, 원격 반영과 승인 대기 중 도구·배포 실행0이다.

## Bootstrap 후속: 팬트리 묶음 조회1건 로컬 완료

- 단건 체크1건은 `9a6c850ca`로 보존했다. bundles의 실제4표/inner ingredient FK/현재 nullable pantry ingredient_id를 SDK에 맞췄다. 같은 request client를 bootstrap/reader에 직접 대입하고 손코딩 query interface를 제거했다. 상품 지원 migration20260731110000 이후 nullable 계약은 묶음 계산의 pantryItems 입력과 membership set 타입만 좁게 보정했다. 공유 PantryIngredientRow 전체나 런타임 계산/요청은 변경하지 않았다.
- 수정 전 pantry 전체+bootstrap은25 PASS/2 FAIL이었다. 기존 DELETE 성공 기대200→실제422와 오류 reason required_non_empty→invalid_or_empty_ids 불일치2건이며, 이 작업의 수정 전부터 있었다. 범위 밖 DELETE 계약을 변경하거나 테스트를 완화하지 않았다. 직접 bundles 기준선은1 PASS/15 이름필터 제외다.
- 최종 SDK10+bootstrap11=21 PASS와 기존 bundles1 PASS/15 필터 SKIP로 고유22 PASS다. 전체 typecheck·변경 lint(max-warnings0)·Anti133/baseline207/신규0·diff PASS다. inner FK 객체·정확 선택문/owner/in/이중정렬·빈목록 단락·guest401/각 단계500·nullable product identity의 membership 무영향을 고정했다. pantry 전체 통과를 주장하지 않는다.
- 독립 리뷰도 고유22 PASS/15 이름필터 제외·전체 nonincremental typecheck/diff PASS 및 SQL nullable/inner FK·helper 런타임 보존을 확인해 APPROVE했다. 기존 전체2실패는 해결로 간주하지 않는다.
- master 계약28과 로컬 채택 후16을 구분한다. 새 단언·wrapper·억제·SQL/권한/실DB 쓰기·운영·원격 반영0, 도구/배포 승인 대기는 유지한다.

## Bootstrap 후속: 레시피북 메타데이터 수정·삭제1건 로컬 완료

- pantry bundles1은 `7f47991e8`로 보존했다. 저장/플래너와 분리된 북 metadata만 실제3표/FK/native selected-single update/no-return delete로 맞췄다. 반환 행은 실제4종 enum/nullable cover이며 응답의 기존 custom 상수는 유지한다. 같은 request client를 bootstrap/native에 각각 직접 대입해 from 오버로드 충돌을 피하고 손코딩 query interface·연쇄 단언을 제거했다.
- 수정 전 넓은 mypage/route/bootstrap31 PASS/1 FAIL이었다. 별도 목록 GET의 기존 mock에 createRecipeImageInternalClient export가 없는 실패이며 이번 metadata 수정 전 발생했다. 이를 숨기거나 전체green으로 표현하지 않는다. 최종 SDK15+route14+bootstrap11=40 PASS, 기존 PATCH/DELETE3 PASS/4 이름필터 제외로 고유43 PASS다. 전체 typecheck·lint(max-warnings0)·Anti132/baseline207/신규0·diff PASS다.
- 독립 리뷰는 위 집합과 기존 bootstrap14를 포함한 고유57 PASS/4 이름필터 제외·전체 nonincremental typecheck/lint/diff를 확인해 APPROVE했다. root와 겹친 성공 수는 합산하지 않는다. emit은 동일 객체 bootstrap 별칭 추가/참조 교체 외 동일하며 바이트 완전 동일이라고 주장하지 않는다.
- 실제 SDK 요청은 owner403/시스템북403/guest401/missing404/items500/book500·정확 선택문·inner FK·제한 update payload·items→book 삭제 순서를 고정한다. SQL/실DB·권한·기존 저장/플래너·새 도구/운영·원격 반영0, master 계약28과 로컬 채택 후15를 구분한다.

## 별도 정확성 보정: 장보기 nullable 재료 ID3곳

- 메타데이터1건은 `e020b67bf`로 보존했다. pantry의 최신 제품 지원 migration을 추가 대조하면서, 이미 보존한 share-text/bulk/item SDK 행3곳에 과거 손코딩 계약의 ingredient_id:string이 남아 있는 정밀도 누락을 확인했다. 앞선 root/독립 리뷰 모두 이 nullable 변경을 놓쳤음을 기록한다. 진단 감소를 위해 거짓 nonnull을 유지하지 않는다.
- 실제20260731110000의 shopping_list_items ingredient_id DROP NOT NULL에 맞춰 세 행을 string|null로, share ingredient FK 추론은 object|null로 맞췄다. bulk/item에 제품null 반환 회귀 각각1건과 selected-row 타입 근거를 추가했다. 기존 ShoppingListItemSummary는 이미 nullable이며 제품3파일 JS emit은 HEAD와 동일하다. 런타임/권한/쓰기/응답 변경0이다.
- 최종6 suite62 PASS·전체 typecheck·lint(max-warnings0)·Anti132/baseline207/신규0 유지·diff PASS다. 기존3건 해결 수나 Anti 감소로 중복 계상하지 않는다. master28/로컬 채택 후15도 그대로다.
- 독립 리뷰는 SQL의 이전 누락을 명시하고6 suite62 PASS·전체 nonincremental typecheck/diff·제품3파일 byte-identical JS emit을 확인해 APPROVE했다. 기존 성공 수와 합산하지 않는다.

## Bootstrap 후속: 장보기 preview1건 로컬 완료

- nullable3곳 보정은 `7468cbb30`으로 보존했다(진단/완료 수 추가차감0). 다음 preview는 실제4표/nullable meal snapshot FK/상태enum과 native SDK 행으로 손코딩 fluent interface·연쇄 단언1건을 제거했다. 같은 request client bootstrap/reader 분리 대입 외 런타임 요청·분기·집계·정렬과 기존 array/null 소비 호환은 유지했다.
- 수정 전52 PASS, 최종 SDK9+기존41+bootstrap11=3 suite61 PASS·전체 typecheck·lint(max-warnings0)·Anti131/baseline207/신규0·diff PASS다. 정확 선택문/owner·registered·shopping_list_id is.null·created/id 정렬, 고정title/legacyfallback·빈목록·guest401·깨진pin/조회500·column조회 실패fallback을 SDK 요청으로 확인했다.
- 독립 리뷰도 최종3 suite61 PASS·전체 typecheck/lint/diff PASS와 실제 SQL·후속 nullable 대조/실제 SDK 선택 행·런타임 보존을 확인해 APPROVE했다. 중복 수는 합산하지 않는다.
- master 계약28과 로컬 채택 후14를 구분한다. SQL/실DB/권한/운영·원격 반영·새 도구/배포 변경0, 운영 승인은 대기한다.

## Bootstrap 후속: 기존 요리 세션 취소1건 로컬 완료

- preview1은 `c899fe6de`로 보존했다. 기존 취소의 native session1표/select/update/maybeSingle와 실제 상태3종enum을 맞췄다. cancelled 응답 상수가 DB 반환 row를 한 종류로 좁히지 않도록 했다. update 입력은 기존 cancelled 한 값, 같은 client bootstrap 분리 대입이며 기존 직접DML의 database-before-trigger 권한 경계를 승계/확대/완화하지 않았다.
- 기존 cancel 기준선2 PASS/15 이름필터 제외, 최종 SDK10+bootstrap11=21 PASS와 기존2 PASS/15 제외로 고유23 PASS다. 전체 typecheck·lint(max-warnings0)·Anti130/baseline207/신규0·diff PASS다. owner403/완료409/guest401/없음404/조회·update500·이미취소 멱등성·정확id/owner update필터를 고정했다.
- 독립 리뷰도 고유23 PASS/15 필터 제외·전체 nonincremental typecheck/diff PASS와 SQL/권한·상태흐름 불변을 확인해 APPROVE했다. 해당 권한 경계 전체의 안전성을 새로 검증한 것으로 확대하지 않는다.
- 상태 전이·auth/세션/DB/SQL/실데이터·운영/원격/새 도구·배포 변경0이다. master 계약28과 로컬 채택 후13을 구분한다. 기존 권한 결속을 해결했다는 주장이 아니다.

## Bootstrap 후속: 장보기 상세 읽기1건 로컬 완료

- cancel1은 `934dd6b10`으로 보존했다. 상세는 실제7표/두 nullable snapshot FK/제품 식별자 nullable/JSON unknown/native selected행으로 손코딩 query interface와 연쇄 단언1건을 제거했다. same request client bootstrap분리와 quantity read RPC 원 client 전달을 명시했다. meal 조회 throw catch/깨진pin 실패·소유권·정렬·제품 수량 실패 시 soft fallback은 유지했다.
- shopping_lists의 실제 테이블/SELECT에는 updated_at이 없으므로 가상 optional열과 불가능한 분기를 제거하고 이미 사용되던 created_at을 응답에 명시했다. 옛 mock이 선택하지 않은 updated_at을 임의 반환해 최종검사 첫 시도1건이 기대값 불일치로 실패했다. 해당 fixture의 가상열을 제거하고 실제값 기대/SDK exact select로 보강했다. 실제 API/DB 응답 계약을 바꾸지 않았고 테스트를 느슨하게 만들지 않았다.
- 수정 전25 PASS, 최종 SDK10+기존25+bootstrap11=4 suite46 PASS·전체 typecheck·lint(max-warnings0)·Anti129/baseline207/신규0·diff PASS다. SDK 회귀는 각 선택문/FK/JSON/productnull·완료목록 읽기·생성시각·pin우선·empty·owner403/guest401/404/500·정확 owner/pins quantity 읽기RPC를 확인했다.
- 독립 리뷰는 다른 집합(SDK10+backend18+bootstrap11+quantity helper9)48 PASS·전체 typecheck/lint/diff와 실제 SQL/RPC·권한 보존을 확인해 APPROVE했다. root46과 합산하지 않는다. 비차단 URL coverage 메모는 recipes/ingredients exact URL assertion 추가로 수용하고 root46/lint를 재확인했다. 실제 DB/RLS는 미실행이다.
- master 계약28과 로컬 채택 후12를 구분한다. DB/SQL/권한·쓰기·운영/원격/새 도구·배포 변경0이며 승인 대기는 유지한다.

## Bootstrap 후속: 장보기 이력 GET1건 로컬 완료

- 상세1건은 `7f7e3ee15`로 보존했다. 같은파일의 POST 생성·권한/growth/quantity와 분리해 history GET만 native2표/선택행으로 맞췄다. GET전용 수동 fluent interface와 POST타입의 미사용 history select멤버를 제거했다. 같은 request client bootstrap순서, owner/cursor/정렬/limit+1/구매 항목 개수/제목/오류/응답 유지다.
- 기준선55 PASS, 최종 SDK7+기존55=4 suite62 PASS·전체 typecheck·lint(max-warnings0)·Anti128/baseline207/신규0·diff PASS다. 신규fixture 첫2실패는 기존기간제목을 저장title로 잘못 기대했기 때문이며 실제 기존10/19~20 규칙으로 기대값만 정정했다. 제품 제목 함수는 변경하지 않았다.
- 독립 리뷰도4 suite62 PASS·전체 nonincremental typecheck/diff PASS 및 SQL/owner/cursor/count와 POST함수 byte-identical JS emit을 확인해 APPROVE했다. POST 생성·권한·보상 흐름 변경0이며 실제DB/RLS는 미실행이다. master28/로컬 채택 후11, 원격·도구·운영 배포 승인 대기를 유지한다.

## Bootstrap 후속: 레시피북 목록 GET1건 로컬 완료

- history GET1은 `d164acc09`로 보존했다. 북 목록 GET만 실제4표/실제items·likes→recipes FK/head count/nullable cover/enum native 계약으로 분리했다. GET의 연쇄 단언·선택 query cast와 미사용 수동 count interface를 제거했고, POST타입의 미사용 GET count overload도 삭제했다. POST 생성/보상과 표지 reader는 유지했다.
- 수정 전route14+bootstrap11=25 PASS. 최종 SDK6+route14+mypage7+bootstrap11=4 suite38 PASS·전체 typecheck·lint(max-warnings0)·Anti127/baseline207/신규0·diff PASS다. SDK는 HEAD/count=exact/Content-Range 수신/종류별 개수·owner·innerFK·빈목록/guest401/read/count500을 고정한다.
- 앞서 별도 실패로 보존한 mypage GET의 누락된 image factory mock export를 이번 GET 범위에서 보완하고, 오래된 id-only 기대를 실제 inner-count 선택문으로 강화했다. 기존표지 검증 route도 그대로 통과했으며 테스트를 완화하지 않았다. 그 과거1실패는 이제 해소됐지만 pantry DELETE2실패는 별도 그대로다.
- 독립 리뷰도4 suite38 PASS·전체 nonincremental typecheck/lint/diff와 실제 SQL/HEAD/표지 reader 보존, POST·auth helper byte-identical JS emit을 확인해 APPROVE했다. POST 보상 계약 장애는 미해결로 분리한다. master28/로컬 채택 후10, 실제 DB·권한/운영/원격·도구/배포0을 유지한다.

## Bootstrap 후속: 기존 요리 세션 생성1건 로컬 완료

- 북 목록 GET1은 `4a42068e6`으로 보존했다. 생성의 native6표/실제 insert/select/maybeSingle·nullable ingredient/product/snapshot FK·상태enum을 맞췄다. snapshot JSON은 concrete array로 가장하지 않고 unknown을 유지하며 기존 inline product guard를 그대로 둔다. same client bootstrap 분리 외 조회·삽입 순서/상태/응답/권한 흐름은 불변이다.
- 수정 전28 PASS, 최종 SDK15+기존생성17+bootstrap11=3 suite43 PASS·전체 typecheck·lint(max-warnings0)·Anti126/baseline207/신규0·diff PASS다. 독립 리뷰도 동일43/타입/lint/Anti126/new0/diff 및 실제 SQL/unknown guard/기존 direct-DML 경계 불변을 확인해 APPROVE했다. SDK transport fixture를 실제DB/RLS 권한 검증으로 확대하지 않는다.
- master28/로컬 채택 후9다. 남은9는 보호된 저장/UI/플래너와 접점이 있는 북 레시피3+manual생성1, 공통 progress/growth 경계4(bookPOST/pantry/shoppingPOST/complete), cook-mode snapshot 전체 JSON parser1로 구분한다. 두 경로(bookPOST/pantry)의 독립 memory 전체 compiler에서 progress 직접대입 TS2589, growth/award CountFilterQuery(data:null 대 SDK GenericStringError[]) TS2322를 각각 확인했다. 이는 운영 취약점 재현이나 모든 개선 불가능 판정이 아니다.
- 최소 후속 판단은 공통 count 소비(error/count)와 정확select/단계/필터 계약, 원장 성공/중복/부가 projection 실패 흡수·optionalRPC 부재 fail-closed를 먼저 분리하는 것이다. 기존 projection RPC는 activity/notification/count의 drop-in 대체가 아니다. cook-mode는 JSON unknown에서 출력할 keyed row parser와 malformed/legacy 처리 정책을 먼저 정해야 한다. 보호된 저장/UI4건은 병행 범위 조율 없이 건드리지 않는다. 새 단언/큰 adapter/검사 완화로 수만 줄이지 않는다.
- 실제 DB/SQL/환경/권한/운영·원격 변경0으로 이 로컬 묶음을 보존했다. 이후 새로 승인된 최소 앱 successor 작업은 별도 의도/검증으로 진행하며 영양5행 인계 전 배포/데이터 기준 고정은 하지 않는다.

## 보류·기술적 경계

- [#1745](https://github.com/netsus/homecook/pull/1745): OPEN DRAFT, head `5fc7dd78678a6d321bc689f7f3f74c6b02940e1e`. 완료 표에 넣지 않는다.
- [#1749](https://github.com/netsus/homecook/pull/1749): OPEN DRAFT, head `d551ff06ac2eeb368789dd67cd701ce36433e1f0`. response-boundary 강한 목록 검사 후보지만 미반영이다.
- `444fe1f6f`: 구형 save service-role fallback 제거의 접근 결과 변경 위험 때문에 보류. 분리 시도도 철회했으며 적용하지 않는다.
- 최초 승계 사용자 기록의 “검사만 분리해도 실제 권한위반3개가 남아 분리 시도를 철회”한 사실도 유지한다. 이번 작업은 그3개를 해결하거나 재판정한 것이 아니며, 아래10개 실패 테스트 수와 정책 항목 수를1:1로 합산하지 않는다.
- 최신 재확인: #1745/#1749는 위 exact head의 OPEN DRAFT다. 444는 master의 ancestor가 아니며 save의 기존 generic fallback도 남아 있다. 사용자 메인 checkout은 codex/gabia-direct-prelaunch·privacy/공식문서/관련test/미추적파일 dirty 그대로 보존했다.
- 좋아요 client 직접 대입과 과거 progress 직접 대입의 TS2589 실험은 원복/철회했다. 복잡한 adapter·새 단언으로 우회하지 않는다. 최초 DB client 경계가 남은 배치는 이를 해결한 것으로 과장하지 않는다.
- v85 추출기 전환·보안 승계·무게 후속·저장/UI/플래너 병행 변경은 이 작업의 수정 범위 밖이다. 운영 배포는 부모 조율이며 이 장부는 실행 승인이 아니다.

## 기존 실패 기준선: 성공 검사와 별도 유지

`be8101c9a`에서 다음 3 suite는 **35건 중27 PASS /8 FAIL, exit1**이다. 아래 실패 수와 실제 원인/미해결 정책 항목 수는 같지 않다.

| 검사 | 결과 | 원인·확인 경계 |
| --- | --- | --- |
| `hybrid-supabase-static-gate` | 9 PASS /4 FAIL | generic save fallback 하나가 테스트2개를 실패시킴. response-boundary 실제68/기대63, file-key Map scope overwrite 오탐이 각각1개 |
| `account-session-generation-inventory` | 2 PASS /2 FAIL | cooked-weight-attestations PATCH metadata 누락으로 둘 다 fail-closed 조기 종료. 뒤쪽 추가 drift 미확인 |
| `snapshot-v2-session-attempts` | 16 PASS /2 FAIL | product provenance 추가 계약/타입과 exact 기대값 충돌. 제품명·브랜드 직접 노출 계약은 추가 확인 필요 |

- save fallback은 `recipes/[id]/save/route.ts`의 `createServiceRoleClient() ?? routeClient`다. 실제 미해결 정책 경계이며 검사를 허용 목록 확대로 통과시키지 않는다.
- 첫 hybrid assert 뒤 별도 `internalOperationViolations`13개(image client7·future-propagation client6)가 가려져 있다. 개별 정당성·접근 가능성·악용은 이번 작업에서 판정하지 않았다. 확인된 exploit13개라고 쓰거나 blanket allowlist로 해결하지 않는다.
- response boundary 실제 violations는0이다. 오래된 count63 문제를 실제 누락68개로 표현하지 않는다. #1749는 여전히 미반영이다.
- public scope 검사기의 file-key Map이 recipes client와 보조 ingredients client를 덮어쓰는 현상은 runtime 권한 혼용 증거가 아니다. exact scope 검사를 약화하지 않는다.
- account route는 verified generation/owner·scoped RPC를 사용하고 SQL도 scope/session/generation/owner/idempotency를 확인한다. 현재 증거는 inventory metadata 누락이며 runtime 우회 증명이 아니다. 병행 무게 파일은 여기서 수정하지 않는다.
- cook-mode pantry `source_kind`와 product ID/version은 현재 C03 계약·공개 타입이 지지한다(`types/cooking.ts`, `docs/api문서-v1.2.43.md`, `mumeok-beta-product-contract-20261014.md`). 다만 recipe ingredient의 raw product name/brand는 기존 제거 테스트와 공개 prose의 정확 열거가 충돌해 단순 stale fixture로 확정하지 않는다. `undefined` category 속성의 JSON 생략 기대는 별도의 fixture 문제다.

### 추가로 재현한 넓은 상세/쓰기 검사 기준선

`be8101c9a` 기반 #1763 편집 전후 다음 2 suite는 **92건 중90 PASS /같은2 FAIL, exit1**이다. 앞의8실패에 섞거나 자동 수정하지 않는다.

- `personal-recipe-editor-permissions`: exact `"write_recipe_future_plan_change"` source 문자열을 기대하지만 현재 구현은 recoverable writer를 사용한다. source-text 검사 불일치이며 이 관찰만으로 권한 완전성을 입증하지 않는다.
- `recipe-api-contracts`: `dispatches generation-active managed image creation through the session-bound transaction writer`가 nutrition 준비 mock의 구형3인수 호출을 기대하는 반면 현재 구현은 session authority를 포함한 다른 인수 형태를 쓴다. 이번 GET 선택 필드와 무관한 쓰기 계약/fixture 확인 항목이며 실제 버그 여부를 단정하거나 기대값을 바꾸지 않는다.

## 갱신 시 지킬 것

1. 최신 master·worktree·dirty·기존 PR 상태부터 읽는다. 다른 작업을 checkout/reset하지 않는다.
2. 관련 행동을 편집 전에 검사하고, 변경 후 검사·type·lint·Anti Slop·독립 리뷰의 범위를 각각 기록한다.
3. draft PR부터 시작하고 최종 검증 head만 반영한다. 운영·DB·설정 작업을 이 장부 갱신에 끼워 넣지 않는다.
4. 기존 실패의 원인·중복·오탐·미확인 경계를 유지한다. 전체 통과·완전한 타입 안전·운영 완료로 넓혀 말하지 않는다.
5. 다음 갱신에서 현재 배치의 PR/실제 merge SHA를 완료 표에 옮기고, 새로 확인한 전후 수치만 추가한다.
