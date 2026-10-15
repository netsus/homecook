# 무먹 베타 v9 구현 진행 장부

## 최근 저장 단위 운영 반영·T9 식사 수정 확인 — 2026-10-15

#1714·master `13495fdadb3785874c4a3457e6ce2d6e4ed3dbc7`를 웹 `10cfaa6b245ef7cd9e74488b91cc33f1377aab49`·build `prelaunch-10cfaa6b245e-QkMzLR`로 반영했다. 배포 exit0·1,449 PASS·선택 범위 밖133 skipped, DB228·migration0이다. 아래 원수량/수동 발행 준비 기록보다 최신이며 **최근 단위·지정 T9 표본 확인이지 전체 v9 완료는 아니다.**

- 최근 단위: 실제 우유 새 검색 선택은 최근 L만 제안하고 양은 빈칸이다.1/4L→250mL 저장을 반복 클릭해 entry e941 한 건, raw1/4 L·normalized NULL/밀도 필요·영양unavailable을 보존했다. 저장 뒤 mL·빈칸을 제안하고 취소한 L은 기억하지 않았다.320/375/1440 가로 넘침 없음과 기존 당일4행/batch/evidence/attestation 동일을 확인했다. 일반 우유 한 source이며 다른 version/substitute·다른 최근 단위 소비자는 별도다. guest의 예시 플래너·QA 항목 비노출/점심 추가 로그인 안내·같은 날짜/segment next/계속 둘러보기 닫기는 확인했지만 실제 OAuth 복귀는 미실행이다.
- 앞선 T9 양/끼니 수정: 취소 불변,30→35g·원실측160g/잔125g,35g 아침→점심 이동·reload와75kcal/당일 표시157kcal를 확인했다. 양 변경의 `weight_basis.batch_revision`1→3은 기존 재캡처 계약임을 독립 source 검토했다. 최초 whole-basis 실패 비교는 보존하고, 이동에서는 basis의 batch_revision 포함 whole nutrition exact를 통과했다. 다른3행·evidence/attestation도 동일하며 양 변경 해석을 이동 기준 완화로 전용하지 않는다.
- 별도 미완료: #1712 웹 dd399/NYuI8l·1,449검사 배포 후에도 수동 publication은503/pending·원 recipe1/receipt1/nutrition0이다. 실제 prepare→payload와 v4 사유5종·estimated 코드 누락을 후속 검증 중이며 DB229는 아직 미적용이다. 배포 성공을 기능 성공으로 세지 않는다. C05 수집 OFF·기간 미정·정확도/개인 보정/나머지 T9는 남았고 새 추출·모델 평가·외부 AI0이다.

비공개 `mumeok-beta-meal-recent-unit-20261015-mzwu0jz5`·`mumeok-beta-t9-meal-edit-20261015-7cw_m0bl`의 요약/전후 JSON/화면과 독립 weight_basis 판정에 근거한다. root 실제 실행·제공 이미지 직접 읽기·기존 로컬 fixture를 구분하며 재실행하지 않았다. [단위 계약·주요 수치·한계](meal-log-recent-unit-20261015.md)를 따른다.

## 원수량 fidelity 운영 반영·읽기 표본 — 2026-10-15

이 절이 아래405/hSgqOv의 원분수 후속 준비 기록보다 최신이다. #1711 소스 `40882b122812d9151e4a526b90be6627fcba06ef`→master `66aea3564c18d431bc7e8f47acc639b96f2e6cf8`를 웹 `6d8e6a7ad1acab59eac0e06a67cb4d9542000b29`·build `prelaunch-6d8e6a7ad1ac-Sc2Dlo`로 반영했다. 배포 exit0·1,431 PASS·선택 범위 밖133 skipped다. **지정 원수량 읽기·표시의 확인이며, 완료 저장 전체·정확도·C05 수집·전체 v9 완료는 아니다.**

- 실제 읽기: 동일 계획 원1/3L·1/7kg, 동일3인분 session0.5L·0.214kg와 원문 조리 숫자/B08를 보존했다. 계획/요리×320/375/1440 여섯 실제 화면의 가로 넘침 없음·reload/back·guest login return과 제품0.1875kg 회귀를 확인했다. 최초 요리 탭 폭이1496에 머문 시도는 정확폭 통과에서 제외하고 보존했으며 새 중복 탭에서 폭을 확인한 뒤 닫았다. 이는 root CUA 관측이며 작성자212·독립177·총괄40/모의6화면·18PNG와 구분한다.
- 원기록: READ ONLY 실제 대상 대조에서 DB228·계획4행·재료2행·snapshot3행·recipe/session 전체 행 지문은 그대로다. 조회 DTO의 선반올림/원 metadata 누락을 고쳤으며 저장 DB 손실이나 영양·과거 기록 재계산으로 설명하지 않는다.
- 완료 준비 경계: 첫 cook-mode 재조회409를 native DevTools 콘솔로 관측한 뒤 정상 새로고침에서200으로 회복하고 완료 준비창을 열었다. 밀도unknown·선택 무게 빈칸·닫기 초점 복귀를 확인했으며 저장0이다. 팬트리 알림만으로 원인을 확정하지 않는다. 원인 미확정인 일시 실패를 보존하고 ‘현재 항상 실패’나 ‘이번 표시 패치가 고침’ 어느 쪽으로도 기록하지 않는다.
- 다음: 수동 draft publication은 별도 패치 최종 리뷰 통과·운영 미적용이며 publication/recent 단위가 이어진다. C05 draft #1707·da65는 운영 미적용·수집 OFF·기간 미정이다. W0/W2·W4·W5 정확도와 삭제/복원/모델 생명주기·T9 미확인 variant는 남았고 새 실제 추출·P5/모델 평가·외부 AI0이다.

비공개 원수량 operation의 `operating-summary.json`·`db-after.json`·실제 `live-plan/cook-320/375/1440` 화면/text와 product/back/guest 기록, 별도 source-evidence에 근거한다. [단위 계약·실제 확인·한계](cooking-quantity-fidelity-20261015.md)를 따른다. 문서 작업에서 운영·DB·브라우저를 재실행하지 않았다.

## 계획 snapshot 조회·안내 운영 반영과 T9 표본 — 2026-10-15

이 절이 아래 개인 확인 단계의 웹 af881와 계획 조회 실패/수정 준비 기록보다 최신이다. **계획 조회·안내와 지정한 실제 여정의 확인이며, 원분수 전체·정확도·C05 수집·전체 v9 완료는 아니다.**

- 현재 운영: #1709 merged master `02ed02214e16372fdc316f19ecb0318f0e7d3450`, 웹 후보 `4057885ff771065551d9200dec188dbd2ec7064e`·build `prelaunch-4057885ff771-hSgqOv`. 배포 exit0·recoveryPending=false, 검사1,429 PASS·선택 범위 밖133 skipped다. DB228은 READ ONLY로 대조했고 이번 웹 배포의 SQL/schema/config 변경0이다. 기존 개인 확인·C03/C01/C04 writer/worker 상태를 바꾸는 배포가 아니다.
- 실제 계획 조회: 이전에 실패한 동일 제품 계획6065를 열어3인분0.1875kg와 조리 원문0.125kg·B08 지정 안내를 확인했다. 기존 YouTube 계획7d595의 모르는 양은 ‘분량 확인 필요’로 보인다.320/375 가로 넘침 없음·1440/reload와 guest 본문 비노출/로그인 안내·같은 계획 next를 확인했다. 제품 계획6065·be0c 두 행의 전체 지문이 같고, 제품 snapshot의 재료·조리법·기본 인분도 동일했다. 독립 source23검사·모의 API6화면/18PNG와 총괄 CUA의 실제 운영 화면을 분리한다. 직접 브라우저 JSON API 탐색의 blockedByClient는 우회하지 않았다.
- 앞선 T9 여정: 공공제품3인분 계획·고정 버전→187.5g 장보기→팬트리 반영 없음/보유g 자동차감 없음→registered→shopping_done→cook_done·빈 무게/개인 확인 미선택 완료→나중190g/확인 미선택→30g 식사·190g 분모·160g 잔량을 확인했다. 같은 본문의 명시 새 계획은 별도 생성됐고 독립 요리 전후 이미 있던 두 계획의 전체 행 지문은 유지됐다. 기존 YouTube 저장 결과→새2인분 계획은 source/editable/revision3 불변이며 새 추출0이다. 이는 의도적 QA 업무자료 쓰기이며 웹 배포의 READ ONLY 대조와 혼동하지 않는다.
- 미실행 구분: 자기 소유 원본이어서 실제 UI fork variant 없음, 팬트리 제품1개라 다른 version/substitute 표본 없음, legacy8키 결과라 v4 원분수 variant 미실행이다. 기존 native/fixture의 통과를 이 실제 여정의 빈 표본에 채우지 않는다.
- 추가 finding: pure fixture에서 plan/cooking generic mapper의 `toFixed(2)` DTO 축소와 `quantity_input` 미전달을 확인했다. 원1/3L→0.33L·1/7kg의2→3인분→0.21kg 사례다. 저장 DB 손실을 확인한 것이 아니고 #1709에 포함된 교정도 아니다. 차기 원분수 조회·표시 보완 중으로 유지한다.
- 남은 범위: C05 draft #1707·소스 `da65a96a2611918096295d7d42f7d4e0b27f1e5c`는 운영 미적용·수집 OFF·기간 미정이다. W0/W2 조건 근거·W4 실제 개인 보정·W5 정확도·W6 및 실제 표본 저장/정정/삭제/복원/모델 생명주기·T9 미확인 variant가 남았다. 새 실제 추출·P5/모델 평가·외부 AI를 실행하지 않았다.

증거는 비공개 계획 operation의 `operating-verification.json`·`browser-operating-verification.json`·실제 화면 text/PNG·독립 source review와, 개인 operation의 `t9-operating-journeys-summary.json`이다. [단위 계약·실제 확인·한계](plan-snapshot-clarity-20261015.md)를 따른다. 문서 작업에서 운영이나 브라우저를 새로 실행하지 않았다.

## 선택 개인 무게 확인 운영 반영·원기록 보존 — 2026-10-15

이 절이 아래의 개인 확인 후보·운영 미적용 기록보다 최신이다. **개인 확인의 운영 표본을 확인한 단계이며, 추정 정확도 개선·C05 수집·전체 v9 완료는 아니다.**

- 현재 운영: 앱 #1704·도구 #1705·plist 결속 보완 #1706을 병합하고 DB228, 웹 `af88126b44cf5abb6fa06f7c08f9eee23ca7de99`·build `prelaunch-af88126b44cf-f3IycH`, 개인 확인 writer ON을 확인했다. DB 반영은 writer OFF로 마치고 같은 새 reader의 배포·영수증 결속을 확인한 뒤 ON으로 전환했다. 기존 C03/C01/C04 writer와 worker48 ON을 유지했다. 원 승인·영수증·SQL과 기존 기록을 바꾸지 않았다.
- 실제 QA: 모바일375에서 완료창 취소·재열기 시 빈 숫자/미선택 확인, 선택160g+개인 확인 저장의 double click 후1건, 완료 세션 새로고침을 확인했다.30g 식사1건 뒤 잔량130g이고,1440에서 확인 철회 double click 후 attested revision1→retracted revision2·event2건으로 남았다. 철회/새로고침 뒤 원 실측g/evidence 지문·식사 전체 행/행 지문·고정160g 분모·130g 잔량이 동일했다.320 가로 넘침 없음, 닫기 초점 복귀, 비로그인 공개 상세와 남은 요리 로그인 안내·복귀 경로 표본도 확인했다.
- 검사 범위: 실제 reader 배포 검사1,418 PASS·선택 범위 밖133 skipped, deploy exit0·recoveryPending=false다. 위160g는 기능 QA의 사용자 보고값이며 저울·기기 정확도를 검증한 실험이 아니다. 기록의 `user_attested / not_verified / qa_personal_record`와 planned 원량을 유지하며 자동 보정·학습 정답으로 전환하지 않는다.
- 초기 거절과 교정: Git의 사람이 읽는 경로 출력이 한글 문서명을 인코딩해 처음 source-pair 준비가 다섯 문서의 지문을 잃었고, guard가 비공개 증거 로딩·실행 전에 거절했다. NUL 경로 목록으로 정확 bytes를 다시 결속했다. 별도 준비의 잘못된 plist SHA도 거절됐으며, 원 캡처/current plist bytes가 같음을 확인하고 #1706에서 결속을 바로잡았다. 오기 교정 과정에서 검사 기준이나 운영 plist를 바꾸지 않았고 초기 실패 기록을 보존했다.
- 남은 범위: C05 통합은 draft #1707·소스 `da65a96a2611918096295d7d42f7d4e0b27f1e5c`의 별도 로컬 준비이며 운영 미적용·개선 자료 수집 OFF·보유기간 미정이다. 새 빈 registry/13인자 overload는 추가하지 않았다. W0/W2 조건 근거·W4 실제 개인 보정·W5 정확도·W6/C05의 표본 저장·정정/삭제/복원·모델 생명주기와 T9 미확인 표본은 남았다. 새 실제 추출·P5/모델 평가·외부 AI 호출은 실행하지 않았다. GitHub Actions는 계속 비활성이다.

브라우저 단계는 총괄의 실제 운영 관측이다. 독립 검토는 지정한 배포 metadata·화면·행 지문의 정합성을 대조했으며, 브라우저를 독립 재실행한 것은 아니다.

비공개 개인 operation의 `database-committed-verification.json`, `reader-deployed-verification.json`, `writer-on-operating-verification.json`, `qa-browser-operating-summary.json` 및 철회 전후 QA JSON/화면 증거에 근거한다. [개인 확인 계약·운영 범위](cooked-weight-user-attestation-20261015.md), [배포·복구 경계](cooked-weight-attestation-successor-deployment-20261015.md)를 따른다. 이 문서 갱신 자체가 추가 운영 실행이나 표본 삭제·모델 활용을 뜻하지 않는다.

## C01 선택 개인 무게 확인 후보 — 2026-10-15

**구현 후보이며 운영 미적용이다.** 운영 웹 `e00d5f1199fe`·DB227·C03/C01/C04 ON·worker48 ON은 유지한다. 같은 v9의 검증 후 반영은 최신 사용자 승인 범위에서 이어가며, 전체 v9 완료나 개선 자료 수집 시작을 뜻하지 않는다.

- 변경: 기존 선택 g 입력에 미선택 확인1개를 추가하고, 소진한 요리에서도 원 실측값을 읽고 확인을 철회한다. 새 확인은 기존 측정과 원자 저장한다. 확인 취소/재생은 새 쓰기OFF와 분리하며 원 g·prediction·식사 근거·재료 원량을 바꾸지 않는다. 별도 control은 기본OFF다. 자세한 API·SQL·역사 보존 경계는 [단위 계약](cooked-weight-user-attestation-20261015.md)에 기록한다.
- 검증: UI 관련84개와 독립 추가2개, 실제 역할을 사용한 격리 PostgreSQL14개가 각각 통과했다. 백업 분류/스트리밍50개와 독립 추가12개는 두 표를 빠뜨리지 않는 소스 검사이며 전체 운영 복원 준비와 구분한다. 모바일375·좁은320·데스크톱1440의 실제 컴포넌트는 합성 API에서 확인했다. 빈칸/OFF 완료, 반복 저장1회, 원180g와 현재999g 구분, 철회·닫기 초점, 읽기 오류 중 기존210g 저장과 늦은 응답을 확인했다. 실제 OAuth·운영 DB 사용자 여정 검증은 아니다.
- 발견·수정: 읽기 재시도에서 버튼이 사라져 초점이 본문으로 이동하던 V1을 수정하고 키보드 재시도를 재확인했다. worker 후속 도구의 원227 unknown intent를228에서 재사용하던 경로도 독립 합성 검사로 찾아 차단했다. worker 도구 V2 관련58개·독립 추가15개는 소스 범위 통과이며 실제 전체 DB 배포 검증을 대신하지 않는다. 초기 실패 로그와 V1/V2 증거는 보존한다.
- 배포 준비: 기존 배포 도구에서 원227 영수증을 유지하며 새228 근거를 별도로 연결하고 있다. 운영의 기존 구조 지문은 읽기 전용 검사로 원 승인값과 일치했다. 복원 환경의 권한 표시·열 번호·SQL 표현 차이를 이유로 기준을 완화하지 않고, 원 BEFORE 구조에 검증된 새 SQL 변화만 투영해 예상 AFTER를 산출한다. 최종 배포 도구 통합·검증과 PR·운영 반영은 남았다.
- 남은 범위: C01 W0/W2 조건 근거·W4 실제 보정·W5 정확도·W6 및 C05의 선별/정정·삭제/모델 생명주기와 T9 전체 표본은 계속 추적한다. 현재 QA 기록을 학습용으로 전환하지 않으며, 미정 보유기간이나 품질 기준을 임의로 정하지 않는다. 새 추출·P5·모델 평가·외부 AI 호출과 R2 재개는 실행하지 않았다.

## C04 운영 활성화와 공개 상세 복구 확인 — 2026-10-15

이 문단이 아래의 DB226·worker OFF·후보 미배포 기록보다 최신이다. **전체 v9 완료는 아니다.**

- 현재 운영: 웹 `e00d5f1199fed3ff2afecf9abb511a47c8e3e387`, build `prelaunch-e00d5f1199fe-uskZty`, DB227, C03/C01/C04 writer ON, worker48 policy ON·PID69608/running. 원 C04 review·post·activation 기록 bytes를 보존했다. R2는 닫힌 상태이며 개선 자료 수집·새 추출·P5/모델 평가·외부AI 호출을 시작하지 않았다.
- 활성화 완료: PR #1696으로 과거 transaction 보존 증거와 이후 정상 자료 변경을 구분했고, #1697의 활성화 구간 잠금만 보완했다. 격리 PostgreSQL 검사7개 및 독립 검사 후 worker48의 같은 PID로 활성화가 완료됐다. 앞선 timeout/PID 변경 실패와 원 검증 기록은 보존했다. 현재 만료 점검은 정상이고 credential 만료는 `2026-10-20T14:52:30Z`, 권장 갱신 전 시점은 `2026-10-18T14:52:30Z`다.
- UI 후속: PR #1698·배포 도구 #1699로 웹79e를 운영 반영했다. 최근 목록은 원분수, 미리보기는 짧은 소수로 표시하며 입력·계산·저장 정밀도를 보존한다. 상세에서 추가 취소/저장 후 실제 추가 버튼으로 초점이 돌아오고, 목록 읽기 재시도는 검색 탭을 거쳐도 유지된다. B08 정확한 안내와 ‘선택한 N인분 기준’을 표시한다. 모바일375·좁은320·데스크톱1440 표본과 독립 리뷰를 확인했다. 운영 오류를 강제로 만들지 않았으므로 목록 오류 재시도 분기는 로컬 모형 증거다.
- 공개 상세 복구: 헤더 없는 익명 GET200과 달리 실제 `quantity-v4` 헤더 요청은409로 실패했고 Safari에서도 재현됐다. #1701은 기존 공개 재료 조회의 exact projection 하나만 추가했다. #1700은 이 단일 파일의 검토한 정방향 Git bytes만 기존 closed-R2/C04 후속 경로에서 허용한다. DB·RLS·GRANT·worker·키·원 승인 기록은 바꾸지 않았다. 새 운영 웹에서 익명 일반/미리보기 모두200, Safari 재시도/새로고침, 내장 브라우저의 비로그인375 화면과 로그인 안내·Escape 취소/선택3인분/실제 호출 버튼 복귀, 로그인한 Chrome 소유자 화면을 확인했다.
- 검사 구분: UI 통합200개, 활성화 이후 도구 통합327개, 공개 상세 최종 후보197개가 각각 통과했다. 마지막 실제 배포는1,418 PASS/선택 범위 밖133 skipped, 빌드·타입 성공과 기존 lint 경고4건이다. 이전 관련197개 중 생성계약1건 실패는 제품 오류가 아니라 모형의 함수·오류 클래스 누락이었다. #1702에서 테스트1파일만 보완해 원201·15개 named-argument 단언을 유지하고 독립90개 및 최종 후보197개를 통과했다. 원 실패 로그는 지우지 않았다. GitHub Actions는 계속 비활성이다.
- 기존 기록: `1/3L` 원입력과200g/134kcal·30g/86kcal 기록을 유지했다. 새 테스트 `1/7L`은 미리보기0.143L, DB수량 `0.14285714285714285714`와 원분수1/7로 저장됐다. 반복 클릭 후1건만 추가되고 새로고침 뒤 기존1/3L와 함께2건임을 확인했다. 영양 근거 없는 우유는 정보 없음이며 g=mL 환산을 만들지 않았다. 선택3인분의 제품 재료0.1875kg와 조리법 원문0.125kg를 구분했다.
- 탐색 복귀: ‘두부’9개 검색을 유지했다. 화면 뒤로가기2524.5px 복원과, 직전·복귀·안정 뒤를 측정한 별도 browser-back2357.5px 복원이 확인됐다. 앞선 두 번째 표본의167px 차이는 클릭 직전 값이 없어 원인을 단정하지 않고 보존한다. 관련 Home 소스는 수정하지 않았다.
- 한계: Safari 표본은 공개 상세·로그인 안내 취소이며 Safari의 키보드 초점 복귀는 확인하지 않았다. 실제 호출 버튼 초점 복귀는 내장 브라우저 표본이다. 전체 Safari 흐름이나 화면 읽기 프로그램 검증도 아니다. 기존 계정 OAuth 복귀는 앞 단계 증거이며 이번에 신규 가입을 수행하지 않았다. 네이버 서비스명·기존 로고·회원이름 수집 해제는 저장/재조회됐으나 개발 중·등록 멤버 제한과 검수 미신청은 유지된다.
- 다음: C01 W0/W2 근거·조건 확대, W1/W3 실제 측정 사실과 개인 보정 W4, W6/C05의 선별·삭제·모델 생명주기와 최종 T9 미확인 항목을 계속 추적한다. 현재 테스트 기록을 학습 자료로 전환하지 않고 미정 보유기간을90일/1년/무기한으로 대신 정하지 않는다. C05의 로컬 준비와 운영 활성화는 구분한다.

운영 증거는 기존 비공개 C04 operation의 `activation-operating-verification.json`, `ui79e-operating-verification.json`, `public-detail-operating-verification.json` 및 두 review-evidence 디렉터리에 보존했다. 원준 Discord에 단계 반영·검증 실패와 이후 복구 요약을 각각 보내 HTTP204를 확인했다. [공개 조회 계약](c04-public-recipe-quantity-read-20261015.md), [기존 배포 경계](c04-active-worker-ui-continuation-20261015.md)를 따른다.

## C04 DB 준비 단계 운영 확인 · 2026-10-14

- 변경: PR #1688 앱 후보는 준비 상태로 두고, PR #1694·도구 `6306f862552f`의 기존 보호 경로로 C04 first5만 DB221→226에 반영했다. 운영 웹은 `5be05649968e` 그대로다.
- 검증: 실제 catalog `649eb3a2…`, immutable `1fd6bb45…`, 원 열·전체41표 자료 지문 보존, 새 metadata NULL, C03/C01 ON·C04 OFF와 worker47/대기0을 확인했다. 같은 snapshot 백업117,668,603 bytes 전체 decode와 역할 백업을 남겼고 홈·앱·목록·기존 테스트 레시피의 HTTP200/성공을 확인했다. Discord204 확인.
- 실패·수정: 최초 계획의 worker2파일 분류 연결 누락과 JSON scope 키 순서의 잘못된 불일치를 각각 재현·최소 수정·독립 검토했다. 원 검토 값이나 검사 기준은 낮추지 않았다. 실제 읽기 전용 계획 통과 후 적용했다.
- 후속 준비 진단: 상세 API 상태 확인이 테스트 레시피 조회수를14→15로 올려 T1 이후 prepare가 중단됐다. 원 백업 SHA를 검증하고 읽기 전용 반복 가능한 snapshot에서 이 한 조회수만 차이를 설명함을 확인했다. 조회수·영수증·운영 비교식을 되돌리거나 고치지 않았으며, 기존 health 기록의 `writes=0`은 서버 조회수 부수효과를 반영하지 못한 값이라 별도 정정했다. 단순 점검은 `view=preview`를 쓰고, 과거 T1의 transaction 보존과 현재 snapshot을 구분하는 좁은 조건만 바로잡는다. 실제 pre 생성 이후의 지문 보호는 유지한다.
- 추가 회귀: 동일본문의 새 계획과 같은 요청 retry를 구분하는 UI11/SQL13, 다른 사용자 공공제품 fork를 검증했다. C03 단계14 PASS이며 C04 단계 동작13 PASS/이전 C03전용 지문1 FAIL을 구분한다. C04의 별도 source63/전체 제어64 증거와 혼동하지 않는다.
- 남은 작업: worker DB1건·worker48·새 웹·writer ON·실제 단위 흐름은 아직 미완료다. 현재226의 실제 영수증에 후속 검토를 연결하며 C05 수집·모델 평가·새 추출은 실행하지 않는다.

## 범위와 실행 승인

- 요청 기준: `/Users/cwj/Downloads/mumeok-beta-audit-user-report.html`의 최신 v9와 2026-10-13 총괄 구현 요청. 첨부의 과거 ‘구현 미승인’ 문구는 조사 당시 상태이며 현재 사용자 지시가 우선한다.
- 모든 현재 유효 미완료 항목을 포함한다. 일반 리팩토링, Anti Slop 전체 정리, Actions 활성화는 제외한다.
- 브랜치/코드/검사/커밋/push/draft PR/검증 후 master merge/기존 경로 운영 배포/필요 restart는 승인됨.
- 초기 요청은 운영DB·보안 등 별도 사전 확인을 요구했으나, 이후 사용자가 “다 적용하고, 앞으로는 승인받을 필요 없이 알아서 적용해줘”라고 직접 승인했다. 같은 v9 범위의 검증된 반영은 반복 승인 없이 진행하며 정확한 대상·백업·복구·검증은 유지한다. 미정 보유기간이나 자료 활용 조건을 임의로 확정하지 않는다.
- 신규 YouTube 추출, 모델/P5 평가, 추가 외부 AI 호출, 소진 예산 재사용은 금지. 기존 결과·로컬 fixture 검증만 허용.
- 일반 테스트 기록은 검증에 사용 가능. 복구 불가능한 삭제는 별도 승인 전 실행하지 않는다.
- Discord 기존 ‘원준’ 목적지에 단계 완료/실패 요약 전송 가능. HTTP 성공 확인을 남긴다.

## 시작 기준과 보존

- master/origin/master: `b257148d06737be703a7eea407d102384849bb25`.
- 운영 웹: `d22217ddc791df79e72c055516bd5cffd6bb69c0`, build `prelaunch-d22217ddc791-3EwFuq`.
- worker: v71/gen47, release `8e515a6482a1dfaa292d6f67ae6aa8a06f84d2d4` (별도 읽기 확인 진행).
- DB: ledger 219. master·웹·worker의 219 SQL 파일 해시와 모두 일치(추가/변경/누락0, READ ONLY 전후 해시 동일).
- 복구 정정: 현 state의 즉시 이전 웹은 `8e515a…`다. 외부 DB상태의 backwardCompatible=false는 이전 `f970→DB219` 전환 기록이다. 이번 DB·worker 무변경 웹 배포는 현재 d222를 previous로 저장해 복구한다. 상태파일의 단순 rollbackAvailable 표시만으로 호환성을 단정하지 않는다.
- 원래 checkout `codex/gabia-direct-prelaunch`의 개인정보/공식문서/테스트 미커밋 변경과 모든 다른 worktree는 보존한다.
- 작업 worktree: `/Users/cwj/.codex/worktrees/mumeok-beta-v9/homecook`; 첫 branch `codex/mumeok-beta-v9-batch1`.

## 항목과 작은 배포 단위

| 단위 | 포함 항목 | 시작 판정 / 의존 / 승인 경계 |
| --- | --- | --- |
| 기존 연결 확인 | T0/B03 | 기존 저장 연결은 이전 배포 해결. 재구현 금지; 기존 결과/fixture 재검증 및 중복 요청 계약 확인. 신규 추출 미검증 유지 |
| 1 계획 입력 | T1/B01, T2/B02 | 첫 배포와 탐색 후속 배포로 운영 인분·키보드·성공 확인 복귀 검증 완료. 로그인 자동복귀의 실제 OAuth는 미검증 |
| 2 탐색 복귀 | T3/B04, T4/B05, T12/B10, T2 성공 확인 후속 | 날짜/탭·홈 탐색 복원, 비공개 탭 제목, 성공 확인 후 실제 호출 버튼 복귀를 통합. PR #1675·웹76ff4efe438f 운영 검증 완료. 아래 실제 검증·미검증 범위 참조 |
| 3 요리·알림 | T7/B08/C02, T10, T11 | PR #1671/#1673/#1674·웹13d52fe55c21 운영 검증 완료. 원문/인분 계약 유지 |
| 4 제품 목록 | C06-B0~B3 | PR #1670·웹72187436d3bb 운영 검증 완료. DB·사진 작업 없음 |
| 5 개인 상세 | T12/B10 | 탐색 복귀 단위2에 통합. 공개 metadata는 중립·private 노출 금지, 권한 확인 본문 제목만 탭에 반영 |
| 외부 표시 | T6/B07 | 사용자 승인으로 이름만 무먹으로 저장·재조회 완료. 개발 중/멤버 제한 유지, 검수·신규 OAuth는 미실행 |
| 제품·단위 기반 | C03-P0~P8, C04-U0~U5, T5/B06 | 현재 제품 대표 연결 필수 제약 존재. 제품독립/행키/고정버전/근거환산/장보기·팬트리 호환을 최소 단계로 준비. 권한·운영DB는 별도 승인 |
| 무게·출처 | C01-W0~W5, T8/B09 | 위 제품 단위 계약 의존. 예측/실측 분리, 선택실측, 근거 없는 경우 null. 이력 보존. 운영DB·근거 재사용 정책 별도 승인 |
| 선택 참여 | C05-D0~D5 | C01/C04 의존. 목적·기간·삭제/백업 정책 미확정. 확정 전 UI 공개·수집 활성화 금지. 계정서버 상태·명시동의·철회 경합 검증 |
| 이후 데이터 단계 | C01-W4 활성화/W6, C05-D4 모델 활성화 | 데이터 충분성·정책·독립 품질 조건을 충족하기 전 학습/활성화 금지. 미래 ML은 문서상 즉시 구현 필수 아님 |
| 최종 묶음 | T9 | 각 운영 배포 후 모바일320/375·데스크톱, 로그인 전후, 취소/뒤로/새로고침/반복클릭·기존기록 확인. 미실행을 통과로 합치지 않음 |
| 기존 변경 보존·반영 | F01 (v10 추가 요청) | 기존 dirty 5파일과 미추적 운영문서/진단자료7개를 비공개 보존 완료. 직접 DNS·Turnstile 사실과 필요한 안내만 별도 PR. 새 개인정보 목적·기간 결정 승인 아님 |

## 제외·대체와 불변 계약

- C06-I0~I5 사진 수집/Storage 확대는 B0~B3 텍스트 배지로 대체.
- B08 조리법 숫자/문장 자동변환·수량삽입·수동 재료 연결·새 전체량 패널 제외. 안내: ‘재료표는 선택한 인분으로 환산됩니다. 조리법의 수량은 원문 그대로입니다’.
- 원본 인분은 확인될 때만 표시한다.
- 제품 대표 재료 연결은 선택적 분류/대체 정보이며 제품ID/영양버전/단위근거를 대체하지 않는다.
- 팬트리 보유 목록 유지. g 재고 자동차감·커머스·가격/판매처 스키마·대량 제품 정제 제외.
- g/mL 동등 가정 금지, 제품에 일반 재료 밀도 차용 금지. 조리수율과 영양잔존율 분리.
- 과거 식단·완성배치·제품영양버전·snapshot 자동재계산/일괄변경 금지.
- C05의 과거 ‘C01-W5 전체 통계’ 표현은 작업표 기준 W6를 의미한다. W5는 검증 단계다.
- C05 사용자 정정(2026-10-13): 추정 정확도 개선에 필요한 표본량·자료 나이에 따른 유용성 검증과 철회/삭제 방법을 마련한 뒤 기간을 제안한다. 현재 기간 미정·개선 수집 OFF이며 90일/1년은 승인되지 않았다.

## 단위 1: 계획 입력 — 운영 반영, 성공 확인창 초점 후속 남음

- 운영 재현: 두부찌개 상세3인분/669kcal/두부450g/물600ml → 추가창2인분. 실제 잘못된 저장은 새로 만들지 않음.
- 운영 재현: 추가창 닫기에서 Shift+Tab → `/terms` 링크; Escape 이후 dialog1개 유지.
- 구현 소유: servings 담당은 recipe 상세/planner payload, dialog 담당은 WebModal/WebDialog/기존 boundary 연결. 총괄은 문서/통합검사/운영배포만 담당.
- 최종 독립 리뷰: GPT-6.1 Sol xhigh, 변경 소스14파일/테스트8파일 검토, 집중11파일229테스트 통과(실패/skip0), 자동초점·메뉴 제거 후 명시 복귀 target 독립 재현 통과. 검사 전후 source/test diff SHA256 `b7f90ba6174313453907f4f4e6c31549b44179ae5124c500fe3e4946f9492ec2` 동일. 병합 차단0.
- 최종 코드의 `pnpm typecheck`, `pnpm verify:anti-slop` exit0(신규 위반0), 변경파일 ESLint exit0(기존 showToast 의존성 경고2), diff check exit0. build는1차 통과했으며 배포 후보에서 실제 최종 빌드를 다시 확인한다.
- 기존 YouTube 공개 projection/저장 route/수량 fixture·meal 멱등성의 로컬16검사 통과. 외부 추출/모델 요청0.
- PR 준비와 후속 화면 결과는 아래 기록한다. master merge·운영 배포·운영 재확인 전이므로 운영 완료가 아니다.

### 화면 검사 후 모바일 보완

- draft PR: `https://github.com/netsus/homecook/pull/1669`, 최초 코드 `90b874147a19017ec10ec691d19fad21e895bc6d`. 아직 merge/배포하지 않았다.
- 실제 Chromium fixture 화면에서 모바일320/375는 초기 초점이 배경 버튼에 남고 inert=false임을 확인했다. 공용 AppBottomSheet 전체를 변경하지 않고 PlannerAddSheet 모바일 두 변형에만 기존 useDialogBoundary와 panelRef를 연결했다. 저장 중 Escape 보호도 동일하게 적용했다.
- 추가 회귀4개는 수정 전 실패를 확인한 뒤 통과. 관련4파일38검사 통과. 모바일320/375·데스크톱1440 실제 UI3검사 통과: 상세2→3·모달3·취소재열기·Tab/Shift+Tab·Escape·원버튼 복귀·배경 격리·저장대기 보호·fixture POST3. 페이지/콘솔/실패요청/누락fixture 오류0, 가로 넘침0.
- 모바일 후속 독립 리뷰: 새2파일 digest `3652c6c9b00ddd3062e84bc17411d45da7bb554138484fb58c0a70a3afc06a62` 전후동일, 관련5파일46검사 통과(실패/skip0), 차단0. 후속 최종 typecheck·Anti Slop 신규0·두 파일 lint·diff check도 exit0.
- 증거: `/tmp/mumeok-v9-ui-batch1-3216-20261013/`의 viewport별 runtime.json와 PNG. 총괄은320/1440 modal 픽셀도 직접 확인했다. 이는 로컬 모의 API 검증이며 실계정/운영 DB 저장 성공 증거가 아니다.
- 최초 검토 변경과 동일한 d222 후속 웹 후보 `0bf33c6f9c333b025a86c5789160e3f8eab08eb0`의 기존 deploy plan은 통과했다. 모바일 후속 commit을 포함한 최종 후보 SHA로 다시 검증해야 한다.
- Discord 초기 조사 요약 전송은 기존 원준 목적지 HTTP204 확인. 전체 구현 완료 알림이 아니다.

### 진행 중 검증과 배포 경계

- 첫 focused 검사에서 313개 중3개가 실패했다. unchanged master worktree에서도 planner-add-sheet-redesign의 같은3개 실패를 재현했다. 기존 nutrition fixture에 필수 sources가 없어 발생했으며 RecipeNutrition 계약에 맞게 fixture만 보완했다(기대값/제품 기준 불변). 단독6검사 재실행 통과.
- 기존 `test:feedback-batch:web`: 1,304 통과, 선택 범위 밖131 skipped. 전체 suite 합격 주장이 아니다.
- 독립 리뷰에서 autoFocus의 opener 캡처 누락과 메뉴 제거 후 복귀 누락을 발견해 기존 훅+명시 fallback으로 수정/재검사 중.
- 1차 typecheck/build/Anti Slop 통과. 후속 typecheck와 build 병렬 실행은 build가 생성 타입을 교체하는 동안 TS6053으로 실패했다. 최종에는 build 완료 후 typecheck를 순차 실행한다.
- 기본 `deploy:dev:plan`은 master에 있는 worker/운영파일7개 차이로 exit1 거부. guard를 변경하지 않는다. master merge 후 d222 후속 웹 전용 배포 소스에 검증 commit만 cherry-pick하고 기존 `--reviewed-ref` 경로를 사용한다. package 변경은 R2 승계를 막으므로 새 test key를 추가하지 않는다.
- 기존 배포 옵션 후보: `--reviewed-ref <검증된40SHA> --already-applied-db --db-config /Users/cwj/.homecook/config/full-local-production.env --test-script test:feedback-batch:web`. 후보의 실제 plan과 DB READ ONLY 확인을 실행한 뒤 배포한다.
- 현재 worker는 정상이며 만료감시기는 옛12파일 verifier와 현 v71 22파일 구성 불일치로 실패한다. 새 키 발급0. 현재 gen47 만료는 2026-10-19 17:24:41 KST. 플랫폼 백업 metadata 약84시간 경과이며 신규 운영DB 변경 전에 별도 보호 확인 필요.

## F01 — 기존 미커밋 변경 (보존 완료, 반영 전)

- 추가 요청: 기존 변경을 잊지 않도록 이 총괄에서 보존·분류·작은 PR·필요 배포로 정리. 개인정보 동의 구현 전에 비교한다. 감사 세션은 별도 수정하지 않는다.
- 원본 기준 HEAD `f970bc1d1f1e981d8947e852a9b51ada4a74570a`, branch `codex/gabia-direct-prelaunch`.
- 비공개 보존: `/Users/cwj/.homecook/operations/mumeok-beta-v9-f01-20261013-_fv2tqbx` (디렉터리0700, 파일0600). 파일7개 원문, HEAD/unstaged/staged binary diff, status, UTC시각·파일별SHA256·크기 manifest. 누락0; 원본 수정0.
- app/privacy/page.tsx 및 launch-readiness-legal-seo.test.tsx: master도 옛 전체 Cloudflare 중계 설명이므로 필요 반영 후보. 현재 운영 사실 대조와 독립 검사 후 별도 반영.
- CSoT·요구사항·화면정의서: 10/12 DNS 추가 문단이 후보. master에 이후 문단이 추가됐으므로 파일 전체를 덮지 않고 필요한 문단만 통합한다.
- docs/engineering/gabia-direct-domain-20261012.md: 미추적 운영 기록. 과거 사실과 현재 재검증을 구분해 검토한다.
- .diagnostics/youtube-description-quantity-20261012/diagnosis.json: 진단 자료로 별도 보존, DNS/개인정보 PR에 포함하지 않는다. 실행·평가 없음.
- 작성자 미확정. 원본 dirty 상태는 유지하며 전체 add/reset/삭제 금지. 채택 이유·최종 PR/SHA·잔존 상태는 후속 기록한다.

## 첫 운영 반영 결과 — 2026-10-13 KST

- PR #1669 merged: master `f80de7589041e6d8217f917f5284fdf2d51d6624`.
- 웹만 기존 reviewed-ref 배포: `16bf11f73293b35a2f49f4a19974b87ebb1dba2b`, build `prelaunch-16bf11f73293-XqRqSV`. 최종 기능경로/SQL/package/lockfile은 merge한 master와 byte차이0. CSoT 과거문단 충돌만 배포 소스 기존 이력에 새 문단을 추가해 해결했다.
- 배포 plan·최종 빌드·선택 회귀·별도포트·웹교체·운영 GET 성공. status loaded=true/recoveryPending=false. DB219는 READ ONLY 대조만 했고 worker/gen47 변경0.
- 운영 Chrome1440: 두부찌개 상세2→3, 추가창3, Shift+Tab 내부 마지막버튼·Escape 닫기, 재열기3. 10/26 저녁 추가를 double click해 식사 카드1건만 저장됐다. 상세 재조회·새로고침 후3인분/669kcal를 확인하고 고정 계획 레시피에서 두부450g/물600ml를 확인했다. 테스트 계획1건은 보존하며 기존 기록은 삭제하지 않았다.
- 운영375/320: 같은3인분 유지, 초기 close 포커스·Shift+Tab 내부순환·Escape/취소 후 실제 추가버튼 복귀, 페이지320px 가로넘침0 확인. 320운영 스크린샷을 실제 픽셀로 확인했다.
- 추가 관찰: 저장 성공 ActionConfirmation의 확인을 닫은 후 초점이 BODY에 남는다. 일반 취소/Escape 복귀와 구분해 후속 조사 중이며 T2 전체 합격으로 처리하지 않는다.
- 실계정 OAuth 재로그인 왕복·실기기 Safari·실제 스크린리더는 미실행. 이 단위의 로컬 로그인 복귀 검사는 통과했지만 실제 OAuth 합격으로 확대하지 않는다.
- 단계 요약 Discord 기존 원준 목적지 HTTP204 확인(초기 조사·첫 운영 반영 각1회).

## C06 다음 배포 준비

사진 대신 등록업체 배지와 원문 확인을 제공하는 코드가 별도 branch에 준비됐다. master 첫 묶음을 통합한 뒤 관련99검사(97+검색복구2)와 typecheck를 다시 통과했다. 독립99검사·320/375/1360화면·원문/ID/버전 보존 근거는 [C06 기록](mumeok-beta-company-20261013.md)을 따른다. C06 운영 반영은 아직 하지 않았다.

## 단위 2: 탐색 복귀·탭 제목·성공 확인 후속 — 운영 미배포

- 포함: T3/B04, T4/B05, T12/B10, 첫 운영에서 남은 T2 성공 확인창 초점 복귀. 이미 배포한 첫 계획 입력 묶음의 일반 취소/Escape 검증과 구분한다.
- T3: 선택한 식사기록 날짜와 log 탭을 남은 요리·다 먹은 목록·기록 입력 및 저장 후에도 기존 return helper로 전달한다. 직접 진입 fallback·기록 날짜·API·권한 정책은 유지한다.
- T4: query/sort/ingredient UUID/tag/theme을 URL로 복원하고 부분/전체 초기화를 구분한다. 상세 진입 전 목록 범위·scroll을 기록하고 화면/browser back에서 목록을 다시 읽은 뒤 복원한다. 헤더/브랜드 Home Link와 same-path URL 변경을 반영하며 Next history와 기존 사용자 metadata를 보존한다. 명시적 home return은 같은 탭·같은 탐색의 snapshot만 한 번 소비한다.
- T12: 공개 anon metadata의 null 결과는 중립/noindex, client는 기존 권한 확인 API의 ready·현재 ID·안전한 제목만 탭에 반영한다. 404와403/500을 구분하고 목적지 제목·OG/Twitter는 보존한다. 비공개용 서버 reader·권한 확대는 없다.
- T2 후속: 실제 CTA currentTarget ref를 성공 확인창에 전달하고 확인창 generation/pathname에 맞는 경우만 복귀한다. 같은 문구의 확인창도 별도 수명으로 구분한다. 선택형 restoreFocusWhen은 복귀에만 적용하고 body lock·inert·activeDialogs 정리는 항상 수행한다. 새 모달 초기 초점, 취소/실패/저장 중 보호는 유지하며 로그인 자동 복귀는 임의 버튼을 추측하지 않는다. 화면/경로 이탈 후 늦은 성공·실패는 옛 확인창을 만들지 않는다.
- 독립 리뷰 최종: 병합 차단0, **15파일314/314 통과·실패0·건너뜀0·exit0**. 21:36:16 시작,16.31초. 이전 부분 검사와 합산하지 않는다. 보고서 `/tmp/mumeok-beta-navigation-review.md`의 통합 HEAD `3d5318f60f2e708c437f640e3f9b5e23d55aab6c`와 추가 T2 source/test diff SHA256 `716c74903e302f317771ea6deba0579d7a12713bf4a07a52f04a9eb930a4aab0`, 새 테스트 SHA256 `fcd65862cd0ddd325ade658a46a9a945bf1fc93965bbc9344f3e53c3801ac65f`를 확인했다. 검사·서버 종료 전후 소스 동일이며 결속 SHA256은 `cd79f24badf80fe0e01c067d15165ee662ed794e1c5649250a27e8409ab3549f`다.
- 최종 소스 commit: `2c9b636b76daac31ea6cfafc03981f59e9a1ca9e`(총괄). 총괄이 최종 build·targeted ESLint·typecheck exit0과 Anti Slop 신규0을 확인했다. 이 문서 작업에서는 고정된 source/test를 수정하거나 해당 검사를 대신 실행하지 않았다.
- 독립 실제 Next 로컬 가짜 데이터 UI: 모바일320/375에서 화면 back과 browser back의 탐색 위치 복원, 실제 헤더/브랜드 Home Link 초기화·same-path URL 입력/정렬 동기화를 확인했다. 모바일375 확인 클릭·데스크톱1440 Escape 후 동일 DOM planner opener 복귀, 정상 비공개 fixture 탭 제목과 중립 OG/Twitter도 확인했다. focus/title 두 viewport의 pageErrors·missingFixtures0, meal POST각1건은 모두 가짜 응답이다.
- T3의 date/log PNG는 로딩 화면이므로 저장 내용 재조회로 확대하지 않는다. 실계정 OAuth·실제 비소유자/익명 DB 조회·운영 저장/재조회·Safari·스크린리더와 의도적으로 서버 metadata를 늦춘 경합은 미실행이다. 이 묶음의 운영 배포·B04/B05/B10 및 T2 성공 복귀의 운영 재검증도 아직 완료되지 않았다.

### 선행 요리·알림 후보의 배포 중단 — 총괄 확인 기록

- 첫 준비 실패는 PostCSS 오류로2개 검사 묶음이 실행되기 전에 중단됐다. PR [#1673](https://github.com/netsus/homecook/pull/1673)의 CSS mock 보완만 검증해 `4479cebdd`로 병합한 뒤 로컬 선택 검사1,308통과·131선택skip을 확인했다. 실제 배포 통과를 뜻하지 않는다.
- 두 번째 명령: `pnpm deploy:dev -- --reviewed-ref 89ebbc8f817a863f710ed06558d709502ae79830 --already-applied-db --db-config <비공개 full-local 설정> --test-script test:feedback-batch:web`, **exit1·운영 교체 전 중단**. 비공개 로그는 `/Users/cwj/.homecook/prelaunch-web/deploy-1791897309366.log`다.
- 정확 실패: `tests/use-action-notifications.test.tsx > splits a failed multi-page read retry into at most 50 IDs per request`,176행. 기대 `[50,50,10]`, 실제 `[30,50,10]`. 첫 검사 묶음138통과, 두 번째 검사 묶음1,063통과·1실패; 나머지 묶음은 실행되지 않았다.
- 두 번째 실패 직후 원인은 **타이밍 경합 의심·독립 진단 중**이었으며, 당시 준비 중인 진단을 확정 근거로 쓰거나 검사/기대값을 생략하지 않았다.
- 두 번째 중단 후 총괄 status 확인: 운영 `72187436d3bb`, loaded=true, recoveryPending=false. 운영 웹은 보존되었다. 배포 실패를 DB 변경·새 기록 저장 또는 운영 기능 합격으로 해석하지 않는다.
- 후속 독립 진단 `/tmp/mumeok-beta-notification-retry-diagnosis.md`: 테스트가 DOM60행만 기다린 뒤 이전30행 observer callback에60행을 전달한 경합을 강제해 동일 `[30,50,10]` 실패를 재현했다. 제품의50-ID 상한 분할 결함으로 확인된 것은 아니다. 현재60행의 등록 대상이 정확히 준비된 뒤 callback을 호출하도록 테스트9줄만 보완했고, 기존 `[50,50,10]`·API3호출·60행 읽음·badge0 기대를 유지했다. 제품 hook 변경0이며 구현자/총괄 각각11검사 통과·lint/typecheck exit0을 확인했다.
- PR [#1674](https://github.com/netsus/homecook/pull/1674)는 `483813287`로 병합됐다. 총괄이 웹 후보 `13d52fe55c21fe473e002596e0880e37f2859390`의 세 번째 배포를 진행 중이며 로그 식별자는 `1791897954993`다. 전체 배포 검사·교체·운영 확인 결과는 아직 전달받지 않았고, 단독11검사를 배포 성공으로 확대하지 않는다. 이 탐색 후속은 여전히 운영 미배포다.
- 후속 총괄 실행 확인: 세 번째 요리·알림 배포는 웹 `13d52fe55c21fe473e002596e0880e37f2859390`·build `prelaunch-13d52fe55c21-qir8Bl`로 성공했다. 위 ‘진행 중’·운영 `72187436d3bb` 보존·두 차례 실패는 각각 당시 기록이다. 현재 총괄의 운영 UI 확인은 진행 중이며 요리·알림 기능 검증 완료나 탐색 후속 배포를 뜻하지 않는다.

## C06 운영 반영 — 2026-10-13 KST

- PR #1670 merged: master `5a0b12105caffffc8ea8db4981f71c1af6583256`. 웹 `72187436d3bbd7201fd1e5fad149a7bfde440ef3`, build `prelaunch-72187436d3bb-8cWCNi`.
- 직전16bf 웹의 후속 source만 사용했고 master 기능코드/SQL/package/lockfile byte차이0. 기존 deploy plan/최종build/회귀/별도포트/웹교체/GET 성공. DB·worker 변경0.
- 실제 Chrome1360/320/375의 샘표 검색에서 폰타나시저드레싱→샘표, 샘표우리엄마콩자반→양포식품, 업체가 시아스인 샘표 상품→시아스를 확인했다. 원문 업체명과 제품명을 유지하고 UUID를 목록/checkbox 이름에 노출하지 않는다.
- 320/375에서 전체 업체명 선택 칩·키보드 Space 선택해제/선택·가로 넘침0 확인. 실제 제품1건을 테스트 팬트리에 추가한 뒤 새로고침에서도 제품명/샘표식품주식회사 원문을 확인했다. 재검색 결과 보유중 disabled로 중복 추가가 막혔다. 원래108개 항목은 유지하며 테스트 제품1개를 남겼다.
- 실기기 Safari/실제 스크린리더는 미실행. 운영 배지·선택·저장 범위는 확인됐으며 전체 회사 법적 동일성이나 전체 베타 합격을 뜻하지 않는다.
- 단계 요약은 기존 원준 Discord 목적지 HTTP204로 전송했다.

## 승인된 R2 임시 중지 — F01 선행 운영 조치

- 사용자가 구체적인 대상·영향·복구 안내에 ‘수집만 임시 중지’로 응답했다. 이 승인은 F01 배포 보호 변경이나 R2 재활성 승인이 아니다.
- 실제 runtime 권위는 DB singleton이 아닌 기존 operation control.json이다. 사용자 승인 전 true/true·consent_generation1을 읽기 확인했고, 승인 뒤 기존 deployed createRound2FileStorage의 동일 lease/writeControl로 false/false·generation1을 저장했다.
- 비공개 operation: `/Users/cwj/.homecook/operations/mumeok-beta-r2-pause-20261013-oAMEwF`. before 원문·prepared·receipt·검토한1회실행 코드(0700/0600, create-only/fsync) 보존. 실행 코드 SHA256 `52fdf09a003579971493e208cd64a2559a8dccf1826150026d18b6580dda474e`를 독립 검토했고 기존 storage23검사와 문법검사 통과.
- 기존제어파일 target과 실제 plist·deployed 모듈 hash/현재true,true,1을 재검증했다. 변경 후 readback·백업/결과 hash·잠금 해제·일반 앱 GET200 확인. DB write0·키 변경0·서비스 restart0·세대 변경0. 단계 요약 Discord HTTP204.
- 자동 재활성·세대 감소·과거 백업 역복원 금지. 재개는 실제 연결 검증 뒤 별도 사용자 승인 대상이다.
- F01 자체는 여전히 app/privacy 보호 및 과거 Cloudflare R2 증거 계약으로 배포 보류다. 닫힘 사실만으로 guard를 우회하지 않는다. 별도 읽기 진단은 `/tmp/mumeok-beta-f01-deploy-readiness.md`와 `/tmp/mumeok-beta-f01-control-state.md`에 남겼다.

## 재개 규칙

1. 먼저 이 장부와 각 PR 및 작업 worktree status를 읽고 현재 운영 SHA/DB를 재확인한다.
2. 구현 → 관련 테스트·타입·lint → 독립 리뷰 → draft PR → 확인 후 merge → 필요한 구성요소 배포 → 실제 운영 확인 순서.
3. 운영 배포는 총괄 하나만 실행한다. 다음 미검증 묶음을 현재 배포에 섞지 않는다.
4. 실패 시 정확 명령/대상/guard 사유를 기록한다. 보호 우회·자동 파괴적 rollback 금지.


## 요리·알림 운영 확인 완료 — 2026-10-13

- PR #1671과 준비 검사 보완 #1673/#1674 병합 후 release `13d52fe55c21fe473e002596e0880e37f2859390`, build `prelaunch-13d52fe55c21-qir8Bl`을 기존 `deploy:dev --reviewed-ref ... --already-applied-db --test-script test:feedback-batch:web`로 반영했다. 최종 회귀 1,308통과·131선택제외, build·preview·운영 GET 통과, loaded=true/recoveryPending=false. DB219는 읽기 검증만 했고 worker·DB migration·키·운영 환경은 변경하지 않았다.
- 실제 운영 Chrome: 기존 두부찌개 선택2→3인분으로 독립 snapshot 요리를 시작했다. 재료 두부450g/물600ml, 조리문 물400ml·2스푼 그대로, 지정 안내문을 확인했다. 모바일375/320 실측 viewport에서 가로넘침0, 데스크톱1440에서 화면1392px 및 가로넘침0을 확인했다. 새로고침 후 같은3인분·문구·재료를 유지했고 취소됨 상태→돌아가기→기존 상세 복귀를 확인했다. 팬트리 소진·요리 완료·식사 기록 저장은 실행하지 않았다.
- 실제 지난 알림은 기존 유튜브 결과14개 다음에 활동 알림을 표시했다. 지난 알림 탭에서 Tab 이동 시 첫 유튜브 결과 버튼에 초점이 갔다. 새 알림·로딩·지난 알림·닫기를 확인했으며 재추출/재시도 버튼을 실행하지 않았다. 신규 추출·AI·P5 호출0. 변경하지 않은 실패/만료 결과 자체를 성공으로 간주하지 않는다.
- R2 control 재조회: collection_enabled=false, lead_enabled=false, consent_generation=1. 승인된 임시 중지를 유지한다. 앞선 두 준비 실패는 운영 교체 전에 중단됐으며 위 최종 배포와 구분한다.

## T6 네이버 서비스명 — 승인된 이름만 반영

- 사용자가 `서비스명만 무먹으로 저장`을 승인했다. 네이버 개발자센터의 HomeCook 앱이 운영 custom:naver provider와 같은 client ID인지 운영 DB READ ONLY boolean 비교로 확인했다(credential 조회/출력0).
- API 설정의 애플리케이션 이름만 HomeCook→무먹으로 변경했다. 저장 전 미리보기, 설정 완료 표시, reload 후 이름 무먹 유지와 service/callback URL·동의 checkbox 값 동일을 확인했다. 키·제공 정보·URL·로고·검수 상태는 변경하지 않았다.
- 현재 개발 중으로 등록 멤버만 이용할 수 있다는 관리자 표시를 확인했다. 검수 신청·일반 회원 신규 OAuth·원래 액션 복귀는 미실행이며 T6 전체 완료는 아니다. 기존 이름으로 되돌릴 때도 같은 이름 항목만 변경하는 방법이다.


## 탐색 복귀 운영 확인 — 2026-10-13

- PR #1675, master `3e02203a7e1581ab410ea3b0d38310540d6b3413`; 웹 `76ff4efe438ff697132e2ba0a9188d47e508cb17`, build `prelaunch-76ff4efe438f-ncSzAz`. 기존 deploy:dev 경로로 웹만 교체했고 loaded=true/recoveryPending=false. DB219는 기존 ledger/source checksum의 읽기 검증이며 실제 전체 스키마 동일성 검사로 확대하지 않는다. DB/worker/키 변경0.
- 최신 통합 focused 검사15파일314개와 탐색 상태11개 통과, typecheck·build·lint/기존 Anti Slop 신규0. 독립 리뷰 source/test20파일은 rebase 뒤 byte 동일. 배포 검사1,328통과·131선택제외·실패0, 운영 기본 GET 통과.
- 실제 Chrome 모바일375: 두부 검색9개→상세→화면 뒤로가기에서 검색어/9개/스크롤2524.5px 복원. 브라우저 뒤로가기도 같은 검색어/9개로 복귀했다. 두 번째 진입은 조회수 정렬 변경과 자동스크롤이 있어 이전2524.5와 동일 위치를 별도 보장하지 않는다. 독립 fixture의 browser back 위치 검증과 구분한다.
- 실제 데스크톱1440: 두부+최신순+한식5개를 새로고침해 유지, 브랜드 홈 링크로 빈 검색·조회수순 복원. 10월12일 식사기록→남은요리→기록창 취소→다 먹은 요리→남은요리→뒤로에서10월12일/식사기록 탭 유지. 기록창의 기존 기본 기록일은 오늘이며 이번에는 실제 섭취 저장을 하지 않았다.
- 실제 기존 비공개 레시피 소유자: 본문과 정상 탭 제목 일치·reload 유지. 인증 없는 HTTP200은 레시피 상세 중립제목/noindex,nofollow/OG·Twitter 중립제목이며 소유자 브라우저 OG·Twitter도 중립이다. 실제 비소유자 계정 OAuth는 미실행.
- 실제 데스크톱1440 성공 확인 클릭과 모바일375 성공 확인 Escape 모두 실제 플래너 추가 버튼으로 복귀; body lock 해제/inert0. 10월25일 저녁 double-click와10월24일 저녁 저장은 각각1개·3인분·등록 상태로 확인했고 reload 후 유지했다. 허용된 테스트 기록2개는 삭제하지 않았다. 저장 대기 UI의 버튼 비활성도 확인했다.
- 실제 신규 OAuth·다른 사용자 계정·Safari·스크린리더·늦은 서버 metadata 강제경합은 미실행. fixture 통과를 이 범위의 운영 합격으로 확대하지 않는다. 새 추출/외부AI/P5 실행0. 요리·알림 및 이번 단계 요약은 기존 원준 Discord 목적지에 전송했으며 각각 HTTP204를 확인했다.


## F01 승인과 준비 검사 중단 — 2026-10-14

- 사용자 `검증한 범위로 적용` 승인: PR #1672/#1677, 정확 웹 `76ff4efe438f → 87cd04e11607`, 수집 env 두 flag false, 닫힘을 유지하는 실패 보상. 수집 재개·DB migration·worker·키 변경은 미승인/미실행이다. 앞선 R2 control 중지·네이버 이름 저장은 반복하지 않았다.
- 앱 #1672는 `9a004e7559e6d85c224068d638f8ed5207290217`, 배포 도구 #1677은 `171dd3600c6e2105ea7187f7b7c9e09adf10748a`로 병합했다. 도구 commit `8d62f868db43493ae3c30cea5eaf8ab3605a7d0c`를 기존 installer로 설치했다. 앱 후보의 제품/SQL/package는 병합 앱과 byte 차이0이다.
- PIN delta 독립178검사·typecheck·targeted lint·정확12파일 plan 통과. 최초 명령은 `pnpm deploy:dev -- --reviewed-r2-closed-maintenance --reviewed-ref 87cd04e11607b85cda720e7fe60ac06b42356e7a --env-file <승인된 private false-only dotenv> --test-script test:feedback-batch:web --already-applied-db --db-config <private full-local config>`.
- 첫 배포 준비 로그 `1791908147221`: 회귀1,330통과·131선택제외, production build exit0. 빌드 내 ESLint의 react-hooks plugin 로딩은 실패했으며 별도 수행한 관련 lint 통과와 구분한다. 운영 교체 전 별도 포트의 R2 응답 검사 실패로 전체 deploy exit1. status는 기존 `76ff4efe438f`, loaded=true/recoveryPending=false, DB219로 확인했다. 실패 단계 요약 Discord HTTP204.
- 원인은 Node fetch가 명시 Host를 loopback authority로 바꾸는 검사 전송 결함이다. 소유 loopback HTTP 서버와 동일 실패 build의 별도 프로세스에서 재현했다. 기존 fetch는403/ORIGIN_NOT_ALLOWED, node:http의 정확 Host·Origin 요청은503/ROUND2_DISABLED. 각 요청은 빈 JSON이며 collection/control/IP/provider/DB 이전의 disabled 경로다. 자기 프로세스를 종료했고 운영 전환0.
- 기존 endpoint의 origin 보호를 바꾸지 않고 배포 검사만 node:http로 수정 중이다. exact 503+ROUND2_DISABLED·loopback 대상·timeout·응답크기 제한·redirect 거부를 유지한다. 실제 전송 회귀 red1→green 및 관련4묶음184검사·typecheck·targeted lint 통과. 독립 리뷰와 후속 PR/같은 승인 후보 재배포는 아직 진행 중이다.

## F01 웹 운영 확인 — 2026-10-14

- Host 전송 검사만 고친 PR #1678은 `7dd1bf36dac6da83a542cb1a876bea0b1effdce1`로 병합했다. 독립184검사와 oversized response/timeout/invalid port 검사를 통과했다. 도구 `ad8e7451d5b6028a8e745e5000d2bcc1fd79ebdf`를 기존 installer로 설치하고 같은 승인 후보를 재시도했다. 제품·origin 검증·승인 PIN·DB 경계 변경0.
- 재시도 로그1791908861413, 회귀1,330통과·131선택제외·실패0. production build·별도 포트·교체 후 closed smoke 통과. 웹 `87cd04e11607b85cda720e7fe60ac06b42356e7a`, build `prelaunch-87cd04e11607-Hl2nrc`, loaded=true/closedR2Maintenance=true/recoveryPending=false. 두 수집 env false/false, 기존 control false/false·generation1 및 원중지 receipt/proof9 bytes 동일. DB219 읽기 검증만 수행, worker·키·스키마·보유기간 변경0.
- 실제 Chrome1440·375·320에서 R2 홈 링크0·가로넘침0 및 기존 레시피/테마/메뉴를 확인했다. 두부 검색9개·새로고침·상세2→3인분(450g/600ml/669kcal)·추가창3인분·취소·뒤로 검색 복귀를 확인했다. 새 식사/팬트리 기록은 만들지 않았으며 상세의 기존 조회수 집계는 발생할 수 있다.
- 실제 개인정보 페이지를 reload하여 직접 연결 안내·Turnstile 한정 항목/목적·일반 사이트와 소셜 로그인 이용 가능 안내를 확인했다. 인증 없는 공개 HTTP도 홈/login/privacy200·같은 정정 본문, recording404, homeflow200·저장 없는 안내, collector503/ROUND2_DISABLED를 확인했다.
- 실제 homeflow는 테스트용4응답→정적 레시피/계획/장보기/요리/식사 예시→신청 화면까지 확인했다. 모든 단계에 저장 없는 안내가 보이고 마지막 동의·신청은disabled, Turnstile iframe/script0이었다. 이메일 입력·제출·외부 영상 클릭·실제 추출0. reload는 첫 화면으로 돌아왔다. 이 예시는 실제 레시피 추출/식사 기록 저장의 검증이 아니다.
- 화면 증거: `/tmp/mumeok-f01-production-ui`의 home320/375/1440과 homeflow-disabled375. 비공개 승인 operation에도0600 사본/해시·HTTP/UI 검증을 보존했다. 원준 Discord 단계 요약 HTTP204. 실제 OAuth·Safari·스크린리더·운영 장애 강제복구는 미실행이다. build 내부 ESLint plugin 해결 실패는 별도 candidate build/관련 lint 통과와 구분한다.
- 추가 발견: 설치형 `homecook-deploy status`는 snapshot에 `lib/server/youtube-extraction-worker-timing.json`이 빠져 ERR_MODULE_NOT_FOUND. 저장소의 기존 `pnpm deploy:dev:status`는 위 운영 상태를 정상 확인했다. 웹 배포 실패가 아니며 설치 포장만 별도 최소 수정·실제 archive module load 검사로 보완 중이다. 일반 DB219 수동 rollback 제한을 우회하지 않는다.


## C03 공공제품 운영 확인 — 2026-10-14

- 사용자 정확 C03 전체 승인과 이후 검증된 v9 범위의 반복 승인 생략 지시를 기록했다. 앱 #1682·기존 배포 도구 #1683/#1685/#1686/#1687을 병합했고, 현재 웹은 `1c676f43c99f3268801e7ca4b1072859331503c8`/`prelaunch-1c676f43c99f-R8e0px`, DB220, 제품 새 형식 저장 ON이다. C01/C04/C05는 배포에 포함하지 않았다. Actions 비활성·R2 false/false·generation1 유지.
- 최초 DB 시도는 admin 소유 이력표의 잠금 권한 문제로 SQL 실행 전에 끝났다. 기존 reconcile에서 not_applied를 확정하고 기록을 보존했다. 기존 admin 접속은 이력 잠금/INSERT에만 사용하고 기능 SQL은 원래 postgres 역할/설정으로 실행하는5파일 보완을 독립240검사 후 적용했다. 권한/owner 변경 없이 명시 database-retry로 성공했다.
- DB 직전 백업117,576,419bytes와 전체 archive 해독 검사가 완료됐다. 적용 후 catalog `135d98c7…`, immutable `cf117590…`, 보존 행 해시가 기대값과 일치했다. 첫 웹 준비는1,369통과/133선택제외·build 후 전환 전에 중단됐으며 내부 stack은 공통 오류 처리에 남지 않았다. 확인된 reader adapter 초기화 누락은1파일5줄로 고치고 관련170/독립실행6검사를 통과했다. 같은 앱/SQL/PIN으로 웹을 재준비해 전환·운영 smoke·reader floor 확인 후 조건부 ON을 실행했다.
- 실제 Chrome375/1440에서 기존 두부찌개3인분 계획669kcal·고정 재료450g/0.75개/600mL·조리 원문400mL를 확인했다. 계획 입력3인분·취소·원버튼 복귀, 제품 편집 취소/새로고침 후 원제목·원량 보존을 확인했다. 비로그인 HTTP 공개 레시피·홈·privacy200, R2 recording404.
- 테스트 레시피 `fb869ab0-f3bd-497a-9d9c-fc12f6866413`은 대표 ingredient_id=null·공공제품 `fe43e586-4a19-49ee-9618-da7b983cbdca`·영양 버전 `7f1c13b3-6aaf-4c8c-ac79-322a43935aaa`·0.125kg를 공개 API에서 그대로 반환했다. 영양 기준100g/275kcal→125g/343.75kcal(표시344), 원 조리문 보존. 팬트리 선택도 같은 기존 버전/기준을 재조회하고 취소했다.
- 테스트 계획 `8b84870a-3365-4fe6-bb2e-98cb4d944b72`(10/27 저녁2인분)과 장보기 `d5b049ee-76f4-4155-9a06-411be70073bf`를 남겼다. 같은 제품/버전의125g이며 보유 제외→되살리기→구매 체크→보유 제외 후 is_checked=false를 실제 읽기 전용 조회로 확인했다. 팬트리 반영 안 함으로 완료하고 새로고침 뒤 read-only를 확인했다. 기존 폰타나 보유 항목은 유지했다. 기록 삭제·g 재고 자동 차감 없음.
- DB220 이후 worker readiness는 ready=true/catalog `81362d75…`·기존 만료2026-10-19T08:24:41Z를 확인했다. worker·credential·pre-request는 바꾸지 않았다. 실제 OAuth 재로그인·다른 사람 계정·새 추출/P5/모델 평가·운영 장애 강제복원은 미실행이다. 직접 비소유자/전체 보안 검증 완료로 확대하지 않는다.
- 새 데이터 이후 이전 reader로 내리지 않는다. 문제 시 기존 안전 OFF 경로로 새 저장을 중지하고 현재 reader/floor를 유지한다. 전체 DB 복원은 자동 실행하지 않는다. 실패/완료 Discord 전송은 각 HTTP204 확인. 비공개 operation `/Users/cwj/.homecook/operations/mumeok-beta-c03-20261014-MeZKNX`와 `.omx/beta-v9/current-state.json`에 시도·검증·운영 화면·테스트 기록을 남겼다.


## C01 DB·읽기 웹 운영 반영 — 2026-10-14

- **범위:** C01 DB221과 호환 읽기 웹을 반영했다. 새 무게 저장은 OFF이며, 로그인 후 실제 조리·선택 실측·식사 기록은 미검증이다. 기능 전체 완료나 정확도 개선 완료를 뜻하지 않는다.
- **소스:** 앱 PR #1684/#1689/#1690, 기존 배포 도구 PR #1691. 웹 `32ab591babf7ec30b7f56b0cbddce65ec1e46e3a`, build `prelaunch-32ab591babf7-HteyQ9`, 설치 도구/master `db0fa13f58eae59b7b9b2ab7716d6008b67df415`. applied SQL `20261013233000_cooked_batch_weight_evidence.sql` SHA256 `60b9f4008768fc0846eb0b3a104fac3ef0650975535371adf876b95dcb711aa0`.
- **DB 보호:** 정확한 운영 대상·직전 백업의 전체 해독 가능 여부·원장/역할·예상 변경 구조·기존 행 보존을 확인했다. DB220→221 operation `a0679055-a297-48be-a1b7-67c012a617db`; 적용 후 catalog `523fcb7462b35b85667707438ae3138e05de11e093a51399caec944c0e57b7bb`가 격리 환경에서 미리 계산한 기대값과 일치했다. 기존 행은 같은 transaction에서 보존 확인했다. C03 ON/C01 OFF, worker readiness true와 기존 catalog `81362d758b5138a95b6cbe1d8d7c1f064653b467907a42a7335c00d97dc59ba9`를 재확인했다.
- **수정한 호환 결함:** C01 OFF 중에도 영양 미리보기에 새 필드를 붙이면 직전 웹의 엄격한 응답 검증이 실패했다. 구 응답 형태는 OFF에서 유지하고 새 필드는 ON에서만 추가했다. 격리 재현 실패 뒤 수정 후 통과했으며 과거 식사 근거 읽기는 보존했다. 적용된 SQL은 이후 편집하지 않는다.
- **검사:** 최종 후보 typecheck/build 및 선택 회귀 1,385통과·133선택제외. 실제 배포 빌드의 내부 lint는 플러그인 경로 해석 오류를 출력했으므로 lint 통과로 계산하지 않는다. 같은 배포 checkout의 변경 TS/JS 53파일을 동일 규칙으로 명시 경로 해석해 별도 lint exit0을 확인했다. 규칙·의존성 변경은 없었다. 이후 C04 후보의 최소 경로 수정은 별도 검토이며 이 배포에 포함되지 않았다.
- **총괄 운영 관찰:** Chrome 375/1440 공개 제품 레시피에서 2→3인분, 제품 `.125kg`→`.1875kg` 및 344→516kcal, 원문 조리법 `.125kg` 유지, 로그인 안내의 3인분·명시 재클릭 안내, 취소/Escape 후 요리 버튼 초점 복귀와 새로고침을 확인했다. 공개 API 200, 일반 익명 요리 시작 요청은 401 `UNAUTHORIZED`였다. 인증된 조리·실측·식사 저장으로 확대하지 않는다.
- **외부 설정:** 승인된 네이버 이름 `무먹`, 기존 브랜드 로고 등록, 회원이름 수집 해제를 저장·재조회했다. 총괄이 확인한 동의 화면의 식별자/이메일 필수·별명/사진 선택 및 개발 중 멤버 제한은 유지한다. 로그인 화면의 별도 법적 동의는 제출하지 않았고 사용자 응답을 기다린다. 새 키·검수 신청은 하지 않았다.
- **복구/남은 작업:** 읽기 버전 하한은 `32ab591babf7ec30b7f56b0cbddce65ec1e46e3a`다. 새 형식 호환 웹은 유지하고 문제 시 해당 저장만 OFF로 둔다. 구 웹으로 임의 복귀하거나 전체 DB를 자동 복원하지 않는다. 로그인 검증→조건부 저장 ON→테스트 계정의 새 조리·실측·식사와 기존 기록 회귀가 남았다. R2 수집·C05 개선 수집·C04는 활성화하지 않았다.
- **증거:** 비공개 운영 경로 `~/.homecook/operations/mumeok-beta-c01-20261014-HhhiQC/`의 `reader-stage-verification.json`, `after-database-observation.json`, `worker-readiness-after221.json`, `release-related-eslint-result.json` 및 화면/배포 로그. 총괄 전송 기록에서 운영 DB 단계와 읽기 웹 단계의 Discord 요약은 각각 HTTP204를 확인했다. 현재 진행 상황은 이 문단이 앞선 로컬 준비 기록보다 우선한다.


## C01 기본 무게 저장 ON 운영 확인 — 2026-10-14

이 문단은 위 C01 OFF 읽기 단계 이후의 실제 확인이다. 사용자가 네이버 필수 개인정보 제공 두 항목 진행을 승인했고, 현재 화면의 무먹·이용자 식별자/이메일을 대조해 필수만 선택했다. 별명·프로필사진은 선택하지 않았다. 오래 대기한 첫 요청은 네이버 오류로 종료돼 성공으로 처리하지 않았고, 앱에서 새 요청을 시작해 같은 항목으로 로그인했다. 상세의 선택3인분을 복원했으며 자동 요리 시작은 없었다.

기존 C01 writer-on plan이 ready=true/변경0임을 확인한 뒤 같은 보호 경로로 ON을 실행했다. writer-on 결과 committed/true, 실제 DB control true와 설치 도구 status의 loaded=true/readerPending=false/recoveryPending=false를 확인했다. 웹32ab·buildHteyQ9·DB221은 그대로다. C03 ON·R2 OFF와 worker를 유지했으며 소스/키/DB 스키마 추가 변경은 없었다.

총괄의 운영 확인은 다음과 같다. 아래 무게 입력은 허용된 테스트 계정의 가짜 검사값이며 실제 음식의 물리 실측이나 개선용 적격 표본이 아니다.

- OFF 때 저장한3인분 테스트 요리는140.63g·이전 방식 추정으로 남았다. ON 뒤 같은 레시피를 실측 빈칸으로 완료하면187.5g·조건별 추정으로 저장되고, 화면은 반올림한 약188g과 섞기 가정·미확인 조건을 표시한다. 팬트리 항목은 선택하지 않았다.
- 375px 실제 모바일에서 완료 저장을 반복 클릭했으며 요리1건과 예측1건만 생성됐다. 이 요리에 섭취 전180g을 입력하면 원 예측을 보존하고 관찰1건을 추가한다. 무게 수정 재진입은 사라지고 전체무게 근거는 사용자가 보고한 실측으로 바뀐다.
- 30g 식사의 미리보기는86kcal·전체무게180g·남을 양150g을 표시했다. 저장 반복 클릭 뒤 실제 식사1건과 잔량150g을 확인했다. DB의 새 식사 weight_basis에는 당시180g·model/예측/관찰 ID·batch revision2가 고정되고 현재 batch는revision3이다. 뒤로가기에서 같은10월14일을 유지했다.
- 1440px 데스크톱의 별도2인분 완료에서는0g을 거절하고, 선택 입력120g을 저장했다. 실제 DB에 prediction1건과 completion 관찰1건, finished/remaining120g을 확인했다. 새로고침과 다시 읽기에서 정상 완료 상태를 유지했다.
- 10월13일 기존 식사200g·134kcal의 목록/상세/뒤로가기를 확인했다. 해당 행 updated_at은10월13일 그대로이고 weight_basis가 새로 끼워지지 않았다. 기존3인분 계획도registered·고정snapshot을 유지한다. 모든 과거 데이터에 대한 새로운 전체 감사 결과로 확대하지 않는다.

모바일/데스크톱은 DOM의 실제375/1440 너비와 PNG를 확인했다. 최초 캐시된 viewport 설정이 다른 탭에 적용돼 `c01-on-empty-optional-mobile.png`는 실제1496px이므로 모바일 증거로 쓰지 않는다. 정확375px의 `c01-on-empty-optional-375.png`를 별도 생성했다. 이 도구 설정 문제와 제품 문제를 구분했다.

**남은 후속:** 완료 모달 취소 후 초점이 원 요리 완료 버튼으로 돌아오지 않고, 나중 무게 저장에서도 사라진 원 액션 대신 같은batch 관리 버튼으로 돌아오지 않는 문제가 확인됐다. 공유 dialog 보호를 완화하지 않고 실제 호출 버튼/ref 연결만 별도 좁은 웹 수정으로 준비한다. 이 후속의 미검증 변경은 운영32ab에 섞지 않았다. C01의 실제 추정 정확도, 개인 보정·전체 모델 활성화, 미정 정책/보유기간, C04/C05 운영은 여전히 별도다. 실제 영상 추출/P5/외부AI 호출은0이다.

비공개 증거는 같은 C01 operation의 `writer-and-journeys.json`, `authenticated-off-journey.json`, `on-flow-readonly-evidence.json`, `completion-measured-readonly-evidence.json`, `legacy-meal-after-on.json`, `worker-readiness-after-on.txt`, `status-after-writer-on.json`, `writer-on-plan.log`·`writer-on-apply.log`와 해당 PNG들이다. 테스트 조리 세 건과 식사 한 건은 보존했다. 총괄의 이 단계 Discord 전송은HTTP204를 확인했다.


## C01 초점 후속 운영 확인 — 2026-10-14

PR #1692와 배포 도구 보완 #1693을 검증 후 병합하고 웹 `5be05649968e261d83bfc216754f4540b1b0b636`·build `prelaunch-5be05649968e-X8W1FZ`를 운영 확인했다. 기본 무게 저장 ON 이후 발견했던 완료창/실측 저장 초점 문제는 이 버전에서 해소됐다. DB221·C03/C01 ON·R2 OFF·worker는 유지했다.

- 모바일375의 완료창 닫기와 데스크톱1440의 Escape 후 실제 요리 완료 BUTTON으로 복귀했다. 데스크톱 무게 입력 취소는 원 무게 수정 액션, 모바일 실측 저장 성공 후에는 같은배치의 관리 BUTTON으로 복귀했다. 동일 제목의 다른 배치로 이동하지 않았고 새로고침 후120g도 유지됐다. 가짜 QA 요리1건을 추가로 보존했으며 새 식사는 만들지 않았다.
- 원 공유 dialog 보호를 재사용하고 leftovers 화면의 중복 수동 animation-frame 복귀 코드를 제거했다. 독립67검사, 실제 모의 화면6흐름, root build/type 통과. 운영 배포1385통과·133선택제외이며 기본 빌드 lint도 통과(기존 경고4)했다.
- 첫 plan은 `eslint.config.mjs`를 허용하지 않는 구성 변경으로 거부해 운영 변경 없이 중단됐다. 원 `pnpm deploy:dev:plan -- --reviewed-ref 5be05649968e261d83bfc216754f4540b1b0b636 --already-applied-db --db-config <고정 운영 설정> --test-script test:feedback-batch:web`와 원인은 비공개 `focus-web-plan.log`에 보존했다. 정확 Git 원문 SHA의 검토한 경로 수정3줄만 허용하는 보완을 독립211검사·실제 Git 원문/거절16조건·타입/lint로 검증했다. 새 우회 옵션이나 임의 설정 허용은 없다.
- 기존 installer로 도구 `4385861d96a81bdf69a57e7240d7729cbb7835bd`를 설치하고 설치된 plan 재검증 후 배포했다. 최초 다른worktree config lint의 모듈 경로 충돌은 같은 검토 원문을 현재 폴더의 임시 config로 읽어 검증한 뒤 삭제해 해소했다. source 규칙·의존성은 바꾸지 않았다.
- 실제 증거: 기존 C01 operation의 `focus-operating-verification.json`, `status-after-focus-deploy.json`, `focus-web-apply.log`, `focus-completion-return-375.png`, `focus-completion-return-1440.png`, `focus-late-measure-manager-375.png`. 배포 로그 `deploy-1791966537730.log`. 단계 Discord HTTP204 확인. C04/C05 운영이나 실제 정확도 평가 완료 주장이 아니다.

## C04 DB227·새 웹·단위 저장 ON, worker 활성화 보완 — 2026-10-15

- 기존 도구 PR #1696(`f8194a6784f1`)로 T1의 transaction 보존 증명과 이후 정상 활동을 구분했다. 원 T1/R을 보존한 prepare/quiesce 뒤 마지막 SQL1개를 적용했고 DB227 receipt의 기존 자료 보존을 확인했다. worker48 설치·인증·건강·기존 만료 감시 OK, 추출/외부AI0을 확인했다.
- reader 웹 `6b610eb012da42b5d151b058531815dc12a8ca45`·build `prelaunch-6b610eb012da-aIib9L`를 배포했다. 관련1389PASS/133선택제외·빌드/타입/lint 확인 뒤 공개 응답과 기존30g/86kcal·200g/134kcal를 읽었다. 초기 세션 재확인 안내는 화면 재시도로 복구됐고 재로그인은 하지 않았다. C04 writer ON이 확정됐으며 C03/C01 ON·R2 OFF를 유지한다.
- 별도 worker 활성화는 `locked service PID/plist changed`로 중단됐고 actual `activation-not-applied`·policy OFF를 확인했다. 동일 plist의 PID41975→69608, DB statement timeout 직후 claim 실패·자동 재시작 기록이 정합한다. 활성화만 동일4표의 SHARE ROW EXCLUSIVE로 빈 조회를 허용하고 쓰기 차단·PID/자료 보호를 유지하는 최소 보완을 격리 검증한다. 아직 worker 활성화 완료가 아니며 원 verification은 보존한다.
- 운영375/1440에서 우유 빈mL·200mL→0.2L·밀도 없는 g 거절·0/음수/분모0 저장 차단을 확인했다. 허용 테스트 기록1개는1/3L→mL를 두 번 클릭해 저장해도1개이고 새로고침/상세에 원문1/3L·영양미상이 유지된다. preview/최근의 긴 소수 표시와 상세에서 추가창 취소 후 실제 호출버튼 초점 복귀는 별도 작은 UI 후속으로 남았다. 실제Safari/스크린리더·전체U-A/W/C05 완료로 확대하지 않는다.
