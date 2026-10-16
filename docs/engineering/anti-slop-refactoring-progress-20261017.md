# Anti Slop·중단 리팩토링 진행 장부

이 문서는 중복 작업을 막기 위한 구현·검증 이력이다. 제품/API/DB 계약이나 배포 승인이 아니다. `AGENTS.md`가 작업 범위와 검사 강도를 결정한다.

## 현재 기준과 기록 방법

- 마지막 확정 master: `224298c619c0495afcd8dd41a9eaae17036ab239`, 실제 진단 **151**, baseline **207**, 신규 **0**.
- 후속 진행/활동 capability 계약은 로컬 **151→149/신규0**을 확인했다. 단순 삭제 실패를 전체 종료 사유로 보지 않고 실제 query/행 계약과 shape 회귀로 검증한다.
- 원 요청의 **275건**과 별도 **49건**은 같은 목록이 아니다. 49건 원본은 미확인이므로 현재 진단과 합산하지 않는다.
- `275→233` 초기 구간과 `191→185` 중간 구간은 이번 승계에서 PR별 귀속을 복구하지 못했다. 차이를 특정 PR 성과로 채우지 않는다.
- 과거 PR 본문과 merge의 first-parent 이력으로 확인한 숫자만 기록한다. `?`는 미확인, `유지`는 진단 감소 없이 실질 코드만 정리한 경우다. 과거 표의 수치는 당시 실제 진단이며 현재 checker 실행 결과를 대신하지 않는다.
- #1649 이후 이 승계에서 baseline207·규칙·scope를 변경하지 않았다. 이전 baseline snapshot 감소 이력을 현재의 검사 완화로 되살리지 않는다.
- 다음 배치는 직전 PR의 실제 merge SHA·검사 결과를 이 장부에 먼저 반영한다. 이미 완료된 아래 항목을 다시 실행하지 않는다. 새 adapter/단언·무의미한 루프 치환으로 숫자만 줄이지 않는다.

### 원본 진단 ID와 판단 추적

- [진단 스냅샷·항목별 상태](evidence/anti-slop-inventory-20261017.json)는 master063f8a226의163개 occurrence를 고정했다. ID는 `file::rule::snippetSha256#occurrence`이며 hash는 기존 checker의 공백 정규화 source-span SHA256과 같다. line/occurrence는 이 checkpoint 기준이지 이동하는 현재 위치가 아니다.
- 163개 ID의 유일성·snippet hash·baseline207의 허용 count와 일치를 기계 검증했다. 원 요청275 전체의 초기 ID를 복구했다고 주장하지 않는다.
- 현재 분류는 범위 보류99, 명시 보류4, 기존TS2589 기술 보류1, 계약 보강 필요31, 병행 조율1, 고정 참고 보존8, 개선 근거 없음 유지5, 해결14이다(총163). 미검토0은 전체 해결이나 실행 불가 판정이 아니다.
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

재개 당시 master81f0432be의 잔여157은 계약 보강39+보호99(추출기52/보안24/플래너23)+기존 보류5(명시4/like기술1)+병행조율1+유지13(prototype8/근거없음5)이다. 해결6은 이157에 합산하지 않는다. native owner1·수동 호출3·카드1·검색1의 머지와 진행/활동2의 로컬 해결을 반영한 현재 후보는 다음과 같다.

| 상태 | 건수 | 처리 |
| --- | --- | --- |
| 계약 보강 필요 | 31 | 실제 read/write shape 근거로 계속 진행 |
| 보호: 추출기/보안/플래너 | 99 | 52/24/23, 부모 조율 전 보존 |
| 기존 명시/기술 보류 | 5 | #1745 1/save fallback3/like1 |
| 병행 충돌 조율 | 1 | session-attempts cook-mode 보존 |
| 의도적 유지 | 13 | prototype8+단순화 근거 없는5 |
| 잔여 후보 합계 | 149 | baseline207·신규0 |

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

### 현재 배치: 진행/활동 writer의 실제 projection capability 계약

- 원본ID는 `lib/server/user-progress.ts::anti-slop(no-chained-type-assertions)::a2c5fd4bd48d3ce5683f88b76fd735a69e7b35408f4dfb83886844dddfa6b4bf#1` (checkpoint431), `lib/server/user-growth-activity.ts::anti-slop(no-chained-type-assertions)::4d0a30d6891165e87b8ad349dc6c268b125b55a22ae06cd50835576b733680ab#1` (checkpoint164)이다.
- award 인수에 이미 호출하는 gamification 계약을 명시하되 core progress 읽기 계약은 그대로 둔다. growth 기록 client에는 기존 부가 progress/gamification 소비 계약을 함께 선언한다. 내부 재단언2개와 book 생성의 불필요 축소 단일단언만 제거한다. 외부 factory/공통 bootstrap 경계 단언은 남으며 이 배치가 그 경계까지 해결한 것은 아니다.
- 원장·summary·projection 순서·best-effort 오류 흡수·중복 종료·writer/권한은 실행 코드 그대로다. 제품3파일 emitted JS byte-identical: progress SHA `34227e4aaaa6026cd8d513181b3d80fbc9a764dda697d1108659e30e60baefde`, growth SHA `0c2f281fd286eee2c986b61a18cbd35e3fc15172b2cc03a9b48f2257ebdd9a40`, book route SHA `1e9ddd6719bce5d0eada10db48e365deac3338f41f8e3b0fd92e51b97a10490e`다.
- 수정 전 기존7 suite51 PASS·새7 PASS, 수정 후8 suite58 PASS. 새 fixture는 table별 객체+명시 반환 generic from으로 단언/any 없이 전체 소비 client에 직접 대입한다. badge/achievement/quest/notification의 실제 쓰기 인수, 원장/summary, 실패 반환·throw 후 원장 성공, 중복 후 projection0을 확인한다. SDK/DB/RLS simulator나 운영 권한 증거로 주장하지 않는다.
- 제품 수정 전 exact capability 타입 검사2개는 TS2344로 기존 누락을 재현했다. 최초 fixture는 generic from 반환 annotation 누락으로 TS2322도 있었고 명시 반환형·기존 summary version optional 계약으로 수정한 뒤 예상 TS2344 두 개만 남음을 확인했다. 최종 전체 typecheck·변경 ESLint·diff와 verify:anti-slop(규칙fixture·tool타입·baseline) 모두 PASS, 실제151→149/baseline207/신규0이다.
- 기존 award fixture13개는 실제 인수형 Parameters로 경계 단언만 정합했다. readUserProgress의 core 타입은 바꾸지 않았다. 일부 legacy fixture는 projection table 누락을 의도적으로 throw하고 흡수한다. 그중 기존 progress/source-action smoke는 부가 알림 시도가 실제 있었음도 검증한다. 이 단언들을 완전한 client shape 증거로 세지 않으며 새 typed full-path fixture와 구분한다.
- 실제 SDK를 기존 progress/gamification/activity 전체 수동 계약에 직접 대입하는 별도 probe는 TS2322/TS2589로 실패했다. 특히 head:true CountTable의 data:null 고정과 native builder 반환 타입이 다르다. 이 기존 유지보수 부채와 외부 단언은 미해결이며 이번 내부 capability 교집합으로 해결했다고 과장하지 않는다.
- 독립 리뷰 APPROVE: 동일58건·전체typecheck·변경8파일 lint·diff·제품3파일JS동일을 직접 확인했다. typed fixture의 성공 쓰기/실패 흡수/중복 경로와 core read 보존을 검토했으며 SDK/외부 경계 한계도 그대로다. Anti Slop은 부모 실행 결과와 구분한다.
- 보호99·기존 보류5·조율1·유지13, 기존10실패·49원본미확인·1745/1749/444는 유지한다. 실제 DB 쓰기·grant/RLS·인증설정·제품정책·운영배포·전체 build/화면/실DB 검증0이다.

## 보류·기술적 경계

- [#1745](https://github.com/netsus/homecook/pull/1745): OPEN DRAFT, head `5fc7dd78678a6d321bc689f7f3f74c6b02940e1e`. 완료 표에 넣지 않는다.
- [#1749](https://github.com/netsus/homecook/pull/1749): OPEN DRAFT, head `d551ff06ac2eeb368789dd67cd701ce36433e1f0`. response-boundary 강한 목록 검사 후보지만 미반영이다.
- `444fe1f6f`: 구형 save service-role fallback 제거의 접근 결과 변경 위험 때문에 보류. 분리 시도도 철회했으며 적용하지 않는다.
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
