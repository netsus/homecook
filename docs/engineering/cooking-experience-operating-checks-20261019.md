# 실제 요리 경험 운영 확인 — 2026-10-19

## 현재 운영

- 웹 `48c4ce03abaed534775095988a95a57525d5dd72`, build `prelaunch-48c4ce03abae-gsyzsl`, 공식 `pnpm deploy:dev` exit0. 제품 PR [1807](https://github.com/netsus/homecook/pull/1807) merge `d9b884e31ae4b62eeb17405cf3aa3671e4df577b`, 별도 PIN PR [1808](https://github.com/netsus/homecook/pull/1808) merge `43b1a9e840ea4a6353be090c36ea94ad823a78c2`다. 제품 target과 운영 도구 SHA4090은 구분한다.
- DB238 committed, plan SHA `a8795f5e5177cc77aa106ffb7b83a892260e0cfeddff3d5aabd6d1afac1a7692`, 새 receipt SHA `86157669cc8c463e345a767b26ba838137153cb54c1e08cab62a283deba528af`. 원235 receipt `8ebf54657f7d47c97c0cfdb575ff81bcf0ae5dbea1e3dcb555efdd2360bc78b6`와 원 reader floor는 그대로 보존한다.
- 공식 status: loaded=true, databaseReady=true, readerPending=false, recoveryPending=false, normalDeploymentAllowed=true. DB rollback은 제공하지 않는다.
- worker gen50·PID54910·policy ON·고정 만료 `2026-10-22T14:27:30Z`. 실제 health/인증200/빈 claim 거부/readiness를 확인했고 queued0/processing0/permit0/sharedHolders0/unclassified0이다. DB 단계의 같은 plist 중지·복구만 수행했다. 웹 단계는 worker를 바꾸지 않았다. Round2/lead/C05 OFF·구키 fallback 금지·기존 키와 A/B 기록을 유지한다.

## 9개 실제 QA 범위

| 요구 | 최종 운영 웹에서 확인한 범위 | 한계·남은 범위 |
| --- | --- | --- |
| 1 완성 무게 | 기존 QA에서 추정600g/직접 입력90g/미확인null 저장을 확인했다. 최종48c4에서 기존 mix 추정642.857…g(화면643g)과 625g×75%=468.75g(화면469g) fallback을 별도 완료 저장. 둘 다 ‘실측 아님’, 개인 인증0 | 실제 음식 정확도를 검증한 수치가 아니다. 직접 입력/미확인은 웹196에서, 해당 SQL·컴포넌트 회귀는 최종 소스에서 확인 |
| 2 남색 배경 | 최종1440px 요리 화면 전체 남색, body rgb(17,25,35), 문서 폭1440=viewport1440, 양쪽 흰 여백0 | HTML 기본 배경색과 화면을 덮는 body/요리 영역의 배경을 혼동하지 않는다 |
| 3 실행분 수량 수정 | 최종 Chrome에서 밀가루1/7kg 미수정·우유만500g→적용·새로고침·완료 성공. execution revision1·영양 complete. DB의 미수정 frozen proof는 원 snapshot과 정확히 같음. 이전 QA의 단위500g→0.5kg/취소/미확인/4인분 단일 배율도 유지 | 원본1/3L·1/7kg와 기존 계획registered 보존. 원본/공유 레시피 변경0 |
| 4 완료 안내 | 최종375px에서 간결한 완료 창·접힌 측정 방법·실측/추정 구분·선택 입력·팬트리0·가로 넘침0 | 개인 확인은 선택 상태이며 QA에서 체크하지 않음 |
| 5 오일 연결 | 정확 일반명 alias/단위 환산 회귀 유지. 최종 소유자 UI→기존 RPC/CAS로 두 오일 행만 실제 식용유에 연결, 각각 revision2→3 | 만둣국의 현재10g을 옛2큰술로 복원하지 않았고 바비큐 미확인량도 그대로. 올리브유/참기름/고추기름을 일반 오일로 덮어쓰지 않음 |
| 6 원입력 제거 | 최종 상세 모바일에서 라벨0,1/3L·1/7kg 양 정보 유지, 데스크톱 공통 상세 회귀 통과 | 원문·출처·저장 근거 자체는 보존. 편집기의 단위 전환/복구 안내는 상세의 중복 라벨과 구분 |
| 7 영양표 | 최종 상세에서 총선택2인분/기본1인분 표·확인된 일부 표시. QA 끼니 상세의 계획2인분/1인분 표·미확인 ‘정보 준비 중’·375px 넘침0. 숫자/단위·행/열 header 유지 | 법정 라벨이라고 주장하지 않음. 과거 끼니의 고정 영양이 미확인이면 새 레시피 값으로 소급 덮어쓰지 않음 |
| 8 최근 영양 누락 | 현재 catalog 선택과 내용별 영양 발행236/237 운영 적용. 두 소유자 저장의 실제 HTTP/RPC 및 새 nutrition/content pin을 확인. 만둣국은1/11,바비큐는4/8 재료 반영 partial | 제품·조리 상태 확인이 필요한 자료는 아래 표에 남김. 전체 재료 영양 완성이나 모든 최근 레시피 backfill 완료가 아니다. 새 meal·canonical standalone 완료의 pin 계약은 격리 실제 SQL로 확인했으며 최종 Chrome에서 실제 음식 완료 기록을 추가하지 않음 |
| 9 목차 | 최종18개 북: 데스크톱8개×3페이지,URL13쪽→목차2/3·본문13쪽,다음목차→17쪽,키보드Enter13쪽 일치. 하단 중복 목차 group0. 모바일 목차18개·키보드3/13쪽·이전/다음 유지 | 모바일/데스크톱 간 실시간 크기 변경 때 현재 선택의 연속성은 기존 제한. 각 화면 선택·목차 페이지·본문과 URL로 재진입한 선택은 확인 |

UI 검증은 사용자 Chrome의 명시 QA 레시피3종·최근 저장 레시피2종과18개 북으로 수행했다. 첨부 Library4개의 실제 픽셀을 본 것으로 세지 않는다. 과거 확보한 OCR과 실제 Chrome 관측을 혼동하지 않는다.

## 완료 저장 재조회

읽기 전용 증거 SHA `66066ef9db153a6b2b848192fb842d1e8d56d8b1e2f37be1c8f748a13056f62d`:

- QA batch `40afe86c-5545-4156-8fdb-97e4db609757`: standalone/completed,2인분, finished null·missing, prediction unavailable, execution revision1·nutrition partial.
- QA batch `ab448890-6091-493b-9a86-6db17c93886a`: standalone/completed,4인분, finished600g·known, conditional estimate600g, execution revision1·nutrition complete.
- QA batch `84a0db85-7da9-4265-8016-220b42960f12`: standalone/completed,2인분, finished90g·known, prediction125g와 reported_measurement90g 별도 기록. 실제 음식 계량의 정확도를 주장하지 않는다.
- 세 건 모두 개인 측정 인증0, 팬트리 차감 알림0. UI에서 팬트리 선택0을 확인했다. QA 계획 `7fcbc6fe-d3a0-4760-b60a-20768c965fe6`은 registered이며 원본 재료량도 보존됐다. 다른 사용자 기록은 조사하지 않았다.

## 최종 완료 저장·숫자 보존 재조회

최종 두 QA 완료의 읽기 전용 증거 SHA `031b5c489c417f55809a440ca227a3172e58dea5b7cc8bc2743a8246aab43158`:

- `b13def84-c0f9-416d-9ff9-49dbe826bd98`: standalone/completed,2인분,실행 revision1·영양 complete,finished642.8571428571429g. UI 우유500g·밀가루1/7kg·새로고침 보존을 확인했다.
- `290d0483-eafc-4683-90dc-53ea58383a28`: 명시적인 ‘동작 확인용’ QA 레시피,standalone/completed,2인분,finished468.75g. UI에서625g의75%와 실측 아님을 확인했다. 새 원본 레시피를 만들지 않았다.
- 두 건 모두 prediction event만 있으며 measured 값null·개인 인증0·팬트리 차감 알림0이다. 원 QA 계획registered와 원본 분수도 그대로다. 실제 식사 기록을 추가하지 않았다.
- 미수정 frozen proof 비교 SHA `e537d7adfca4db1139d2a1290e971b8f295ddb642eb989d24e0a6cff47b44ece`: `raw_value=1/7`,원 snapshot/저장 양쪽 normalized 숫자 텍스트 `142.85714285714285714000`,JSONB 전체 proof 동일. JS echo로 DB 원본 정밀도를 바꾸지 않았다.

## 최근 영양 누락의 원인 구분

[초기 읽기 전용 조사](cooking-experience-20261017.md#최근-영양-누락의-실제-읽기-전용-분류)는 당시 최신10개 중6개의 snapshot 누락과 catalog/승인 profile/분량 부족을 구분했다. 이 수치는10월17일 조사이며 최종 현재 전체 재집계가 아니다. 후속으로 확인한 문제는 v4 수량 한 행 때문에 전체 계산을 막던 guard,원천의 synthetic ID를 실제 catalog로 오인한 연결,저장된 현재 내용에 맞는 nutrition/content pin 발행 부재다. 확실한 직접 질량/부피만 부분 계산하고,현재 선택·발행 경로와 두 명확한 연결을 복구했다.

- **DB 연결**: source synthetic ID와 실제 selectable catalog를 구분한다. 두 일반 오일만 검토된 기존 식용유 ID로 명시 연결했다.
- **단위 환산**: 컵/개/스푼·밀도·제품 의존 근거는 direct g/ml와 별개다. 새 식품에 이전 식품의 frozen 근거를 전용하지 않는다.
- **분량 부족**: null/미확인량은 보존하고 가능한 재료만 partial로 반영한다. 바비큐 오일에 임의 g를 만들지 않았다.
- **완성무게 부족**: 레시피 전체 영양의 필수 입력이 아니며100g·섭취량 계산과 구분한다. 알려진 투입 질량만75% 추정 fallback에 사용한다.
- **영양 원천 부족**: 실제 제품·조리 상태에 맞는 승인 profile/source를 확인한다. 기존 대표 식용유 기준을 제조사 수치로 바꾸지 않으며,아래 제품 미확정 항목은 보류한다. [공공/제조사 원천 검토](recent-nutrition-source-review-20261017.md)를 따른다.

## 두 오일 행의 최소 수정

최신 beforeimage SHA `c659f586047ab6bcd460262e5757664dbb5f3fe4d4678c9287625f2b6f784177`,과거 pin/끼니/요리 before SHA `0b88d08a7bad9207a29498c5b32558c15b377789081e55981e78a521b0d476fa`,사후 검증 SHA `9b17036d9184188b2bab2fdf502f90d24713fbc4f1b3818c3e7b3efde41e7b5e`다. 원문/소유자/전체 행은 비공개 운영 폴더에만 보존한다.

사용자 Chrome의 기존 소유자 저장 경로에서 검색·선택·기존 revision CAS로 저장했다. 각 saved row의 `catalog_ingredient_id` 한 값만 바뀌었음을 전체 editable JSON으로 대조했다. 나머지 모든 재료·제목/단계·인분·display text·source pointer·원천 JSON 지문·소유권·계정 세대가 같다.

- 얼큰 만둣국 `e0ead6ed-184d-40d9-add6-2181d5042992`: 현재 ‘식용유10g’·source pointer null 보존. 기존 식용유 `d6d92b38-853f-43c2-b2e1-2b4a591de334` 선택,revision3. 새 nutrition pin `b533f0fb-a15d-5f35-29a5-fd1c3a60eaaf`,partial1/11. 공개 표의92kcal/46kcal은 **연결된 일부 재료의 사용자 대표 기준**이며 전체 음식의 검증된 영양이 아니다.
- 허니갈릭 통삼겹살 바비큐 `3c4e9cec-ab39-478a-ab28-26ca30780958`: 원문 ‘오일’·amount/unit null·원 source pointer 보존. 같은 식용유 선택,revision3. 새 nutrition pin `9dcfb336-fe0e-4a7c-a346-7d501cfae4da`,partial4/8. 미확인 오일량에 임의 무게를 넣지 않았다.
- 기존 content snapshot1개·끼니1개·요리2개는 전행 동일하다. nutrition snapshot0→2와 content snapshot1→3은 새 발행의 append이며 과거 pin을 바꾸지 않았다. 다른 레시피 재료 backfill·새 profile 수치 작성0이다.

## 백업·운영 반영·검증

암호화 DB·Storage·인증 포함 플랫폼 백업 `cooking-experience-backup-20261019-5OioFg`의 SHA는 `10f8d72f108c3506cf77a1bfa890660bf2c70190b8cfc7f3f17205f870912974`다. 사용자가 승인한 별도 매체의 정확한 새 경로 복사·SHA/HMAC 검사,격리 DB+Storage 복원·별도 escrow 키 복구를 완료했다. 원본·기존 승인·이전 실패 기록은 보존했다. 이 사본은 당시 플랫폼 백업이며 DB238 이후의 새 off-Mac 백업이라고 주장하지 않는다.

새 create-only review SHA `f1dd80889e76799ba8997314747c4e2475c4dd9052501b7bfb4c27ff2dacd381`로 현재196/235→48c4/238과48개 양쪽 파일 bytes를 결속했다. 원235 승인에 내용을 추가하거나 re-PIN하지 않았다. 공식 DB plan exit0/ready true,DB apply exit0/committed,web plan/apply exit0,최종 status exit0이다. DB transaction은 현재235의 전체 DB·roles snapshot backup/해석을 새로 수행했고,전체 원장 prefix·실행분 전행·모든 보존 행·controls·scope/기존 함수 OID/metadata를 대조했다. 검토한 public nutrition guard의 SQL→PLpgSQL 언어 변경만 metadata 예외이며 나머지 속성·권한은 보존했다. 새 receipt operation은 `25f95cf2-c649-4a51-8214-08c0ed75425c`다.

현재238 authority는 C04/개인 실측 writer ON/OFF·retry의 새 권한이 아니다. 같은 gen50을 복구했으며 키/정책/만료·A/B·과거 작업을 보존했다. 실제 maintenance 관측은 DB 뒤와 웹 뒤 모두 healthy/auth/readiness 성공,후자의 PID54910·queued/processing0이다.

검증은236 실제SQL15,237 실제SQL20,분수 저장51,API/UI72와 마지막 의미 보존 정리59,운영 도구7격리사례/20음성 검사,최종 PIN Node36 PASS/선택1 SKIP이다. 공식 웹 선택 suite는 **1466 PASS/133 필터 SKIP/0 FAIL**,최종 typecheck/Anti Slop 신규0/관련 lint·운영용 build/별도 포트·정적 파일·운영 GET을 확인했다. 전체 Vitest/전체 Playwright/Lighthouse를 실행한 것은 아니다. actual Chrome의 임시375/1440 viewport는 마지막에 reset했다. 새 실행의 요약은 [운영 검증 JSON](data/cooking-experience-operating-checks-20261019.json)에 기록한다.

## 부모 세션에서 모을 상품 확인 자료

운영과 독립 작업은 계속 진행하며, 아래를 임의의 제조사 수치로 대체하지 않는다.

| 실제 레시피·원본 영상 | 정확한 원천을 정하는 데 부족한 정보 |
| --- | --- |
| [얼큰 만둣국](https://www.youtube.com/watch?v=Y-WKwWA-6-o) | 냉동만두 제품·종류, 육수코인 제품과 희석 전 건조량 |
| [뼈 없는 순살 소갈비찜](https://www.youtube.com/watch?v=pjwILwDVC7U) | 갈아만든배 제품/일반·제로 구분, 늑간살 손질·조리 상태 |
| [꽈리고추 두부볶음 · 연결 검증 · 감사1013](https://www.youtube.com/watch?v=tqpwhtw54mQ) | 조청 원료·제품. 추가 수치 보완 시 대파 흰대/전체, 후추 종류 |
| [하루가 지나도 불지 않는 잡채 · 배포 확인](https://www.youtube.com/watch?v=vqb3WyZmL_8) | 표고가 생것인지 건조 후 불린 것인지 |

일반 식용유의 기존 HOMECOOK_USER_STANDARD 자료는 사용자 대표 기준이며 제조사 실측 자료라고 표시하지 않는다. 건강 정보의 외부 전송은0이다.
