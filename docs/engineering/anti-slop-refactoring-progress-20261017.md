# Anti Slop·중단 리팩토링 진행 장부

이 문서는 중복 작업을 막기 위한 구현·검증 이력이다. 제품/API/DB 계약이나 배포 승인이 아니다. `AGENTS.md`가 작업 범위와 검사 강도를 결정한다.

## 현재 기준과 기록 방법

- 마지막 확정 master: `f4f645c6389efe546d00571cd36155c7327e4c02`, 실제 진단 **162**, baseline **207**, 신규 **0**.
- 현재 POST 파생 레시피의 실제 client 직접 전달은 로컬 **162→160 /신규0**을 확인했다. 현재 배치 절의 검사와 한계를 함께 읽는다. 머지 상태·SHA는 해당 PR과 다음 장부 갱신으로 확정한다.
- 원 요청의 **275건**과 별도 **49건**은 같은 목록이 아니다. 49건 원본은 미확인이므로 현재 진단과 합산하지 않는다.
- `275→233` 초기 구간과 `191→185` 중간 구간은 이번 승계에서 PR별 귀속을 복구하지 못했다. 차이를 특정 PR 성과로 채우지 않는다.
- 과거 PR 본문과 merge의 first-parent 이력으로 확인한 숫자만 기록한다. `?`는 미확인, `유지`는 진단 감소 없이 실질 코드만 정리한 경우다. 과거 표의 수치는 당시 실제 진단이며 현재 checker 실행 결과를 대신하지 않는다.
- #1649 이후 이 승계에서 baseline207·규칙·scope를 변경하지 않았다. 이전 baseline snapshot 감소 이력을 현재의 검사 완화로 되살리지 않는다.
- 다음 배치는 직전 PR의 실제 merge SHA·검사 결과를 이 장부에 먼저 반영한다. 이미 완료된 아래 항목을 다시 실행하지 않는다. 새 adapter/단언·무의미한 루프 치환으로 숫자만 줄이지 않는다.

### 원본 진단 ID와 판단 추적

- [진단 스냅샷·항목별 상태](evidence/anti-slop-inventory-20261017.json)는 master063f8a226의163개 occurrence를 고정했다. ID는 `file::rule::snippetSha256#occurrence`이며 hash는 기존 checker의 공백 정규화 source-span SHA256과 같다. line/occurrence는 이 checkpoint 기준이지 이동하는 현재 위치가 아니다.
- 163개 ID의 유일성·snippet hash·baseline207의 허용 count와 일치를 기계 검증했다. 원 요청275 전체의 초기 ID를 복구했다고 주장하지 않는다.
- 현재 분류는 범위 보류99, 명시 보류4, 기존TS2589 기술 보류1, 미검토56, 해결3이다. 범위 보류는 컴파일 실패나 취약점 판정이 아니며, 미검토를 실행 불가로 간주하지 않는다.
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

## 현재 배치: POST 파생 레시피 client 경계

- 원본ID는 inventory의 `app/api/v1/recipes/route.ts` / `no-chained-type-assertions` / hash `75dca4dc05eacbb3b3182090d0a749053ce982f349fd6869ff9238d463d5b741#1`(checkpoint1989), `fbb4fd32fd4a51ec15c9fca478fac4b344e50f95c07026b4c8139248f9822862#1`(checkpoint2009)이다.
- 기존 scoped factory를 nutrition helper와 fork RPC에 직접 전달한다. 두 연쇄 단언과 미사용 type import만 제거한다. consumer 계약 확대/새 adapter/대체 단언0이며 권한·저장·RPC runtime 변경0이다.
- 편집 전후 customization-write-routes / content-snapshot-future-propagation / future-patch-http-replay / quantity-mode / product-nutrition: 5 suite52 PASS. 전체 typecheck·변경 ESLint·diff-check PASS. Anti Slop162→160 /baseline207/신규0. 독립 리뷰 APPROVE: 동일52건·전체 typecheck·ESLint·diff-check PASS, emitted JS 동일을 직접 확인했다. Anti Slop은 부모 실행 결과와 구분한다.
- ES2022/ESNext emitted JS byte-identical, SHA256 `c6882876d2044e11098f021fdd3be2afedbf78dc406b02ee51994d4b9cf6da98`. 전체 build·화면·실DB·운영 검증 미실행이며 기존10실패·49원본 미확인은 별도다.
- 부모 세션 중간 통지는 지정 thread에 전송했으나 `thread not found`로 실패했다. 전달 성공으로 기록하지 않으며 다른 수신처로 우회하지 않는다.

## 보류·기술적 경계

- [#1745](https://github.com/netsus/homecook/pull/1745): OPEN DRAFT, head `5fc7dd78678a6d321bc689f7f3f74c6b02940e1e`. 완료 표에 넣지 않는다.
- [#1749](https://github.com/netsus/homecook/pull/1749): OPEN DRAFT, head `d551ff06ac2eeb368789dd67cd701ce36433e1f0`. response-boundary 강한 목록 검사 후보지만 미반영이다.
- `444fe1f6f`: 구형 save service-role fallback 제거의 접근 결과 변경 위험 때문에 보류. 분리 시도도 철회했으며 적용하지 않는다.
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
