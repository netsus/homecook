# 요리·레시피북 피드백 — 2026-10-20 앱 후보

운영 기준 `16cf3155c7b59bd5f74a64e0a42fc0d9b14f6e1c`, DB238. 원본 저장소와 기존 미커밋·provider/R2·YouTube worker 보류 작업을 보존하고 별도 로컬 사본에서 수정했다. 운영 데이터 저장·수정·삭제, DB/키/권한 변경, 머지·배포는 하지 않았다.

## 변경과 확인된 원인

- 저장된 YouTube 레시피 상세에는 직접 요리 동작이 빠져 플래너만 거치게 보였다. 데스크톱·모바일에 기존 독립 session 진입을 연결하고, 상세의 전체 복귀 URL·선택 인분을 보존한다. 추출·provider·worker 계약은 변경하지 않는다.
- 요리 수량을 누르면 해당 재료 안에서 편집한다. 양/단위/미확인·저장·취소·오류 복구·키보드 포커스를 제공한다. 숫자는 분수 파서로 계산하고 기존 expected revision/idempotency 저장과 서버 영양·무게 재계산을 사용한다. 원본 snapshot과 다른 식사 상태는 바꾸지 않는다.
- 편집 저장 후 서버 display_text가 반올림한 경우에도 정량 원숫자를 표시한다. 일치하는 원입력은 재사용하며 짧은 분수와 순환소수의 정규화 분수를 표시한다. 모든 입력 문자열을 원문 그대로 새로 DB에 저장하는 기능은 아니다.
- 데스크톱 완료·취소를 기존 상단 고정 영역으로 이동한다. 모바일은 하단 조작·본문 스크롤을 유지한다. 편집 중 완료를 막아 미저장 입력이 사라지지 않게 한다.
- 완료 뒤 식사기록과 별도로 돌아가기를 제공한다. 완료만으로 먹은 양을 기록하지 않는다.
- 데스크톱 레시피북 선택은 전용 `/mypage/recipe-books/{id}` 페이지로 이동한다. 표지와 목록 복귀 문맥을 전달하며 모바일 기존 전용 경로도 유지한다.
- 목록형 목차는 선택 시 해당 카드로 스크롤·포커스하고 URL의 mode/recipe/hash를 보존한다. 현재 항목을 표시하고 반복 클릭도 다시 이동한다. 긴 목차는 기존 8개 페이지/추가 로드와 내부 스크롤, 데스크톱 고정 목차, 키보드 포커스 표시를 사용한다.

## 무게 후속 — 새 로컬 후보

화면의 실제 카레 수량을 새 recipe-mass-proxy-v1에 넣어3119.7g을 산출했다. 양념·스푼 가정의 입력 범위3059.55–3153.5g과 조리손실 미보정을 구분한다. 자동 입력, manual_estimate 편집, 빈 필드에서 시작하는 reported_measured 우선, 원예측 보존을 구현했다. 기존 g 식사기록을 사용하고 먹은 양은 자동 확정하지 않는다. 소량 가정은 영양값으로 전용하지 않는다.

[정책·출처·실제 결과·남은 검증](whole-cooked-weight-estimate-20261020.md)이 최신이다. 새 private 검증/완료 함수 SQL 후보는 최소 networkless PG25/25와 원DB238 함수·권한을 복원한 합성 native 통합10/10을 통과했다. 운영 DB238에는 적용하지 않았다. 실제 카레 frozen ID/proof의 운영 세션 결합과 실제 HTTP 인증부터 DB까지 한 연결은 미확인이다. 아래 초기 검증과750/900 합성값은 이전 UI 계약 검사 이력이다.

## 검증 근거

실제 Chrome 운영 레시피북과 저장 상세를 열어 캡처했다. 저장 상세에는 요리 버튼이 없었다. 첨부 Library의 메타데이터/OCR은 읽었으나 이미지 materialization helper가 제공되지 않아 원본 pixels를 보았다고 주장하지 않는다.

합성 API 프록시는 127.0.0.1에만 열고 미지정 API는 거부했다. 현재 앱의 실제 route/component로 1440×900·375×812를 확인했다. 수량 1/3 저장→GET→새로고침→완료 후 표시, 데스크톱 상단/모바일 하단, 무게 빈칸 완료창, 완료 뒤 두 링크, 26개 목차/키보드/추가 로드/직접 URL 재진입/가로 넘침 없음이 확인됐다. 서버 재계산과 실제 DB 저장은 프록시 UI 검사와 구분하며 별도 회귀 결과를 따른다. 초기 합성 fixture의 잘못된 null 조리법으로 발생한 화면 오류는 fixture를 수정해 재검사했다.

독립 리뷰는 목차 반복 클릭·복귀 문맥·모바일 폼 폭·저장 후 분수 표시·옛 링크 수 테스트를 지적했고 반영했다. 최종 diff 재검토에서 새 중대 결함은 발견되지 않았다. 이후 중량 정책·SQL 후보를 구현하고 별도 독립 리뷰를 마쳤다.

- 집중 회귀: 19개 파일, 389개 중 388 통과·1 실패·0 건너뜀. 실패는 `youtube-result-first.ui.test.tsx`의 기존 `쪽파 재료명` 조회이며, 변경한 상세 컴포넌트만 운영 기준 원본으로 교체한 대조 실행에서도 동일하게 재현됐다. 이 실패를 통과로 처리하거나 무관한 추출 UI를 고치지 않았다.
- 환경 제한 때문에 기본 Vitest 설정의 사용자 캐시 쓰기가 막혔다. 무시된 `.artifacts/feedback-ui/vitest.config.mts`에 동일한 테스트 환경/alias와 CSS 전처리 생략을 지정해 집중 실행했다. 전체 product suite 또는 실제 DB 통합검사 통과를 뜻하지 않는다.
- 변경 파일 ESLint: 오류 0, 기존 recipebook `showToast` 의존성 경고 1. anti-slop: 신규 지적 0, 현재 84/기준 207. `git diff --check` 통과.
- 최종 `corepack pnpm build` 종료 0. 이후 단독 `corepack pnpm typecheck` 종료 0. 종료 코드와 로그를 `build-receipt.json`/`build-confirmed.log`, `typecheck-receipt.json`/`typecheck-final.log`에 저장했다. 빌드와 동시에 실행했던 타입검사는 재생성 중인 `.next/types` 파일 누락으로 실패하여 빌드 완료 후 다시 실행했다.
- Playwright E2E assertion은 바뀐 배치에 맞게 수정했으나 CLI E2E는 실행하지 않았다. 실제 Chrome 격리 UI 검사와 서버 단위/계약 검사를 구분한다.
- 캡처: `.artifacts/feedback-ui/cook-desktop.png`, `cook-mobile-fraction-reloaded.png`, `complete-mobile-estimate.png`, `complete-mobile-return.png`, `book-desktop-selected.png`, `book-mobile-direct-url.png`.
- 집중 결과 JSON: `.artifacts/feedback-ui/regression-final.json`. 수정 전 실패 대조 로그: `youtube-baseline.log`. UI 요청/콘솔 근거: `preview-requests.jsonl`, `browser-final-logs.json`. 합성 fixture 초기 오류 이외에 재검사 중 새 uncaught 오류는 관찰하지 못했으며, 모든 브라우저 네트워크 실패를 수집했다고 주장하지 않는다.

목록 모드에서도 로드한 레시피의 상세를 미리 읽는 기존 방식은 남아 있다. 선택 항목만 상세 조회하는 최적화는 별도 성능 작업으로 검토할 수 있다.

## 배포 경계

2026-10-20 08:25 UTC 통합·백업 확인 후 GitHub/DB/웹 전환 승인을 받았다. 공식 read-only plan은 DB239 쓰기를 기존 닫힌 R2 승계 가드로 거부했다. 현재 DB238 앱 successor는 SQL0만 허용하므로 새239용 exact profile이 필요하다. 기존 DB238·provider/R2·worker 승계 보호와 과거 PIN은 보존했다. [실제 통합 결과와 구체적인 차단 범위](cooked-weight-db239-release-readiness-20261020.md)를 따르며, 현재 push/PR/머지·DB/배포는 하지 않았다.

## 추가 식사기록 브라우저 회귀 — 승인 대기 중 격리 검증

무게 입력 없이 완료한 뒤 식사기록을 실제로 선택·저장·재조회하는 UI 공백을 추가 검증했다. 이 흐름은 유효한 전체 추정무게가 산출되는 경우 기존에도 지원되던 기능이다. 이번 앱 변경은 완료창 안내·복귀 동작과 인라인 수량 저장 연결을 보완하며, 새 중량 정책을 추가하지 않는다.

실제 수정 앱의 Next 개발 서버를 `127.0.0.1:3211`, 합성 API 프록시를 `127.0.0.1:3212`에서 실행했다. 서버 프로세스에서 Supabase 환경값을 제외했고 `/api/`는 전부 메모리 fixture가 응답하며 미등록 API는 거부한다. fixture가 제공한 750g·900g과 영양은 합성값이다. 운영 DB를 호출하거나 기존 데이터를 생성·수정·삭제하지 않았다. 검사 후 두 프로세스를 종료하고 Chrome 크기 변경을 복구했다.

| 시나리오 | 실제 Chrome에서 확인한 결과 |
| --- | --- |
| 전체 추정무게 있음, 완성 무게 빈칸 | 데스크톱 1440×900. 빈 input 확인 → `weigh_later`/`finished_weight_g:null` 완료 요청 → 750g `known/estimated` 합성 batch → 식사기록에서 선택 가능 |
| 사용자가 정한 섭취량 | 최초 양은 빈칸이고 저장 비활성. 125g 직접 입력 → meal-log POST는 125g와 raw input `125/g`만 전송 → 201 모의 저장 → GET 재조회와 새로고침 후 125g 표시. 기록 당시 전체무게 750g·재료량 75% 추정 표시, 남은 양은 fixture에서 625g |
| 실측 우선 | 모바일 375×812. 추정 750g이 있어도 입력한 900g을 `set_finished_weight`/`reported_measured`로 요청. 별도로 입력한 섭취량 180g만 저장 → 새로고침 상세에 180g, 전체무게 900g, 사용자가 보고한 실측 표시. 남은 양은 fixture에서 720g |
| 전체무게 미확인 | 적당량 후추가 있는 fixture. 빈칸 완료는 허용하지만 합성 batch는 `missing/null`. 식사기록 목록에 무게 입력 필요·완성 중량 입력 링크만 있고 선택/추가 버튼 0개. 해당 batch의 meal-log POST 0개 |
| 영양 미확인 | 저장 응답과 재조회에서 탄수화물 `null`, 계산상태 partial 보존. 화면에 정보 없음·일부 정보 없음 표시, 0으로 바꾸지 않음 |

요리 완료 POST 3개와 사용자가 입력한 식사기록 POST 2개를 확인했다. 합성 API 오류 응답 0, 이 탭에서 수집한 console error/warn 0. 이 검사는 실제 컴포넌트·API 요청/응답 검증·화면 상태 전이·재조회 표시를 다룬다. 실제 DB의 추정 계산, SQL 검증, 원자적 원장 변경·멱등성·영속 저장 또는 운영 QA 통과를 증명하지 않는다. 합성 서버의 잔량 변경도 실제 SQL 검사와 구분한다.

최소 자동 회귀를 추가해 quantity-v4의 추정 batch는 선택되지만 섭취량을 자동 채우지 않고 명시한 125g만 저장하도록 보호했다. 기존 test harness에 선택적인 중량 출처/수량 정책 입력만 추가했다. 새 집중 실행은 5개 파일 64/64 통과·실패 0·건너뜀 0이며, 변경 테스트/fixture ESLint 종료 0, 서버 종료 후 `pnpm typecheck` 종료 0, `git diff --check` 통과다. 기존 19개 파일 389건 결과와 중복이 있으므로 합산하지 않는다. 제품 코드·DB 변경은 없고 프로덕션 빌드는 이번 검증 추가만으로 다시 실행하지 않았다.

근거는 `.artifacts/feedback-ui/meal-recording-requests.jsonl`, `meal-recording-state.json`, `meal-browser-observations.json`, `meal-browser-verification.json`, `meal-regression.json`, `meal-*.png`에 보관했다. `verify-meal-recording.mjs`는 브라우저 요청·상태·관찰값의 상호 일치를 검사한다. `meal-recording-proxy.mjs`가 이 격리 서버이며 실제 앱 서버가 별도로 필요하다. 당시 승인 대기 상태였으며 최신08:25 승인과 도구 가드 상태는 위 배포 경계를 따른다. 무게 독립 식사 원장은 추가하지 않았다.

## 최종 로컬 후보 검증

새 거친 카레 모델은 내부3119.7g을 보존하고 UI는 약3.1kg/3100g으로 표시한다. 최신 회귀14파일233/233·최소 격리 SQL25/25·native DB238 통합10/10(각각실패0/skip0), Chrome1440/375의 자동/수정추정/실측과 별도g식사저장·새로고침을 확인했다. 새 입력범위는 완성무게 신뢰구간이 아니다. 원예측과 수동추정/실측 이력 분리 및 후보 SQL의 제한·출처·운영 적용 승인 범위는 전체무게 문서를 따른다. 초기389건의 기존 YouTube 실패와 fresh migration 재생 실패는 별도보존한다. 새 production source lint/typecheck/build/anti-slop 종료값은 최신 mass-proxy receipt에 남긴다. push·PR·머지·운영 SQL·배포는 하지 않았다.
