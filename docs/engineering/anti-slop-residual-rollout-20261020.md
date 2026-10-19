# Anti Slop116 — 좋아요와 장보기 상세 선택 복원

최종 제품 source는 `e5face22af6f42daaf239ef57ed50e4f77e83e3e`다. 두 제품 배치는 **머지2/운영2**다. 공식 앱-only plan/deploy exit0 후 실제 ref가 같은 e5face이며 build `prelaunch-e5face22af6f-tQHGcl`·loaded=true·DB238 ready를 확인했다.

## 작은 배치와 검증

| 배치 | head / merge | 검증과 범위 |
| --- | --- | --- |
| [PR1828](https://github.com/netsus/homecook/pull/1828) 좋아요 SDK 계약 | `d625ccfa1f0f52b16ff5741867196e63e9f1705c`(제품) / `ae7e4ab102cdec7b6035c4d8cb366a1276095b58` | 기존5→수정 전 SDK11 포함16→정확 타입 포함17 PASS·전체 타입/lint/verify·독립 APPROVE. 손코딩 타입55줄→SDK19줄, 제품 JS byte동일. 권한/소유자/23505/count refresh 불변. |
| [PR1829](https://github.com/netsus/homecook/pull/1829) 상세 URL 선택 복원 | `d5b0bae966dcea5966db59de7649a0e43cbe2cc1` / `e5face22af6f42daaf239ef57ed50e4f77e83e3e` | 신규 RED2·모바일 RED1, 관련13suite197 PASS·전체 타입/lint/verify·독립 APPROVE.375/1440px 격리 Playwright2 PASS·overflow/page-error/request/console-error/예상외API/장보기write0. |

최종 merge source에서 **15suite214 PASS**, 전체 비증분 타입·변경6파일 ESLint max-warnings0·`verify:anti-slop`의 fixture/tool-type/baseline 거부 검사·diff-check가 통과했다. 두 PR의 GitGuardian 외부 check도 SUCCESS였고 Actions·웹훅·설정은 바꾸지 않았다. 중복 실행 결과를 합산하지 않는다. 앱-only 공식 plan은 web2파일/SQL0/environmentKeys0/readOnly DB238 확인 경로다.

좋아요는 실제2표 SDK 계약으로 기존 기술 보류1을 해결했으며 Anti117→116/신규0이다. 마이페이지는 Anti 감소0이며 실제 탐색 결함과 선택 full-item 대신 ID만 보관하는 복잡성을 정리했다. 같은 파일의 사용하지 않는 callback 의존성1줄도 삭제해 기존 lint warning1을 제거했고 플래너 본문/입력/권한은 그대로다.

## 장보기 문제의 원인과 실패 보존

선택 ID는 URL에 기록했지만 mount는 tab만 읽고 popstate는 닫기만 처리하던 누락이다. `b6a8653d7876e784c871ca10f282380e232afa0e`(2026-05-24)부터 확인되며50bc와3eb의 mypage blob이 같아 최근 Anti Slop 귀속이 아니다. 데이터 유실·권한 실패라고 단정하지 않는다. URL 직접 진입/새로고침/forward·첫 페이지 밖 ID·빈 ID·닫기/탭 전환·query/hash/history.state를 기존 상세 API로 복원하고, 모바일 카드의 기존 standalone 경로는 유지한다.

확대 검사에서 기존 `shopping-detail.frontend` fixture의 usePathname 누락36실패를 발견했다. UI 미수정 ae7에서 root도6 PASS/36 FAIL을 재현한 뒤 mock export1줄만 보완해42 PASS로 복구했다. 기대값·권한/read-only 검사를 완화하지 않았다. 새 fixture의 이름 오타·desktop/mobile test-id·분리된 이름/수량 기대와 초기 브라우저 mock 누락도 제품 실패와 구분해 기록했다. 모바일 전용 분기 누락은 실제375px browser/RED로 찾아 보완했다. [상세 원인·초기 실패·최종 raw artifacts·한계](mypage-shopping-selection-restore-20261020.md)를 따른다.

## 진단과 과거 목록 대응

현재 **116/baseline207/신규0**: 연쇄 단언54(프로토콜40·projection/JSON14), 배열 이중 순회37, 조건부 own-key25, 누산 복사0이다. 원163 ID는 **47해결/116잔여**, 원29계약29완료/0잔여와 별개로 좋아요1건을 추가 채택했다. 원본 ID/file/rule/snippet/hash/occurrence/위치는 유지한다.

원275 baseline은0d4ba86357b7의255그룹/count275, 과거191은 정확7e466b170 당시 코드/동일 검사기의 root·독립 재실행으로 복구했다. scope/rules/config/script/plugin 차분0, Oxlint/plugins1.78.0이다. 고정117 보고의173그룹 CSV는 **191→163→117**의 당시 count이고 이후처럼 덮어쓰지 않는다. 현재116도 같은 fingerprint 포함관계를 기계 대조한다.191→116 부재75 =163이전28 +기록해결47이나 부재를 행동 개선/개별PR귀속/원요구 전체완료로 확대하지 않는다. [고정117 재분류와191 대응](anti-slop-residual-review-20261020.md), [당시117 JSON](evidence/anti-slop-residual-review-20261020.json), [191 대응 CSV](evidence/anti-slop-191-fingerprint-map-20261020.csv)를 함께 읽는다.

별도49건 원본은 저장소/Git/관련 .omx 범위에서 미발견이다. 중복/완료/잔여 수를 추정하거나 현재116과 합산하지 않는다.275 전체·별도4리팩토링 요구의 완전한 항목 매핑을 복구했다는 뜻도 아니다.

## 실제 잔여와 다음 검토 순서

- 역사적 범위/병행 보존99: YouTube52·인증/세션24·플래너23. 진단 자체는 취약점/성능 결함의 증명이 아니며 영구 불가 상태도 아니다. 범위 조율 후 JSON 경계14·실제 SDK 계약부터 증거를 읽는다.
- 참고 디자인8은 동결 기준, 명시 보류3은 save444 관련2/PR1745 관련1로 유지한다. 개선 근거 없는5는 키 부재와 dedupe 의미를 지표용 치환하지 않는다.
- 과거 조율보류 cook-mode1은 부모 QA 종료로 기존 “연락 불가/진행 중” 사유를 다음 소스 조사에서 재확인할 대상이다. 해결로 처리하지 않았고 새 앱의 인증 QA와 충돌하지 않게 다시 조율한다.
- 기존 permission3·보류444fe1f6f·과거 넓은10실패를 이 결과로 해결하지 않았다. 본인 소유 legacy 세션이 없어 실제 legacy 완료는 미실행이다.

## 운영·검증 경계

부모가 이전50bc 인증 QA 종료를 인계했다: 북 저장/재조회·완료 장보기 read-only·팬트리105개 재조회·승인 수량5개/대상 과거 기록 보존 PASS. 이 결과는 새 e5face 후보의 인증 QA가 아니다. 이번 브라우저는35417 loopback fixture이며 운영3100·기존 로그인 세션·토큰 추출·신규 QA 데이터 생성·공개 recipe detail GET을 사용하지 않았다.

기존 main legal dirty·catalog dirty·P5 clean WT와 과거 실패 실험을 보존했다. 이번 앱 변경에 SQL/키/인증·보안 설정/권한/worker/정책/PIN 변경은 없고 새로운 전체DB 백업/전체 지문 재검증을 수행했다고 주장하지 않는다. 공식 배포 log는 `deploy-1792436671132.log`다. 선택 웹1466 PASS/133 명시적 이름필터 SKIP·빌드 PASS(컴파일99초/정적94/기존 경고3)를 확인했다. 기존 경고4에서 미사용 의존성1줄 삭제로1개 줄었으며 검사를 완화하지 않았다. 실제 status의 원 databasePlanSha/readerFloor48c4·closed-R2·recoveryPending=false·readerPending=false·normalDeploymentAllowed=true는 유지된다. rollbackAvailable=false와 integratedDatabaseGuardPresent=false도 그대로다. 새 manifest200·recipe-books/shopping-lists/pantry 비로그인 GET3곳의 표준 wrapped401을 확인했다. 새 e5face 인증 QA·actual legacy 완료는 미실행이다.

독립 추가 검토에서 기존 `fetchShoppingListDetail`의 raw ID path 보간에 LOW 비차단 후속1건을 확인했다. query 복원으로 malformed ID 도달 범위가 넓어졌고 `../preview`는 다른 상세 구조를 받아 해당 화면 오류가 날 수 있다. 고정 same-origin GET이며 인증/사용자 필터와 UUID/owner 보호는 유지돼 쓰기·노출·권한 우회 증거는 없다. 기존 standalone도 같은 helper를 사용한다. path-segment 인코딩과 malformed-ID 회귀 검사를 다음 작은 배치에서 검토하며 이번 결과로 해결했다고 표시하지 않는다.
