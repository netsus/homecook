# 재료 검색 정규화와 대표 이름 통합 — 2026-10-09

상태: **2026-10-09 운영 DB·웹 반영 완료.** 웹 `4fe84f825c547904c4af969c8c72756d4e59a54b`, 빌드 `prelaunch-4fe84f825c54-kc39oX`. 자동 Gemini 영양 생성은 사용자 요청대로 꺼진 상태를 유지한다.

## 사용자가 겪은 현상과 확인 결과

사용자는 유튜브 추출에서 띄어쓰기가 다른 재료를 인식하지 못한 경험을 말했다. 구체적인 이름은 기억하지 못하므로 그 당시 원인은 확정하지 않는다.

현재 일반 공백·탭·NBSP·전각 공백은 기존 JS/SQL 코드에서 이미 같은 검색 키로 처리됐다. 실제로 재현한 실패는 U+200B/U+200C/U+200D/U+2060 같은 보이지 않는 문자가 남는 경우다. 이 문자를 제거하고, 제거 후 분리된 한글 조합까지 다시 정규화했다. 음식 검색의 query fingerprint도 정리된 입력을 사용한다. 단어 순서·부위·가열/건조 상태·구두점은 임의로 지우지 않는다.

또한 같은 재료인 두 ID가 별도 후보로 남던 경우를 대표 ID로 접는다. 같은 대표로 가는 후보는 하나가 되고, 실제로 다른 재료인 후보는 계속 확인 대상으로 남는다. 저장돼 있던 옛 추출 초안이나 사용자 기록을 일괄 재작성하지 않는다.

## 이름 처리 원칙

| 차이 | 처리 |
| --- | --- |
| 다진 마늘 / 다진마늘 / 숨은 구분 문자가 낀 이름 | 공통 검색 키 정리. 동의어를 각각 추가하지 않음 |
| 오뎅 / 어묵처럼 실제 다른 호칭 | 명시적인 동의어 관계 |
| 슈가파우더 / 가루 설탕처럼 검토된 중복 ID | 대표 ID로 검색·새 선택 통합 |
| 등록되지 않은 오타 | 이번에는 자동으로 다른 재료에 연결하지 않음. 향후 유사 후보 제안과 확정 동작을 분리 |
| 생것 / 말린 것, 다른 부위·제품 | 별도 식품 정체성 유지 |

PostgreSQL의 [문자열 정규화](https://www.postgresql.org/docs/current/functions-string.html), [동의어 사전](https://www.postgresql.org/docs/current/textsearch-dictionaries.html#TEXTSEARCH-SYNONYM), [유사도 검색](https://www.postgresql.org/docs/current/pgtrgm.html)도 목적을 구분한 기능이다. 이 앱은 기존 검색 키·동의어 테이블·색인을 재사용하며 새 검색 엔진이나 AI API를 추가하지 않는다.

## 구현

- `lib/ingredient-search.ts`, `lib/server/food-catalog-search.ts`: 공백/NFKC/대소문자와 숨은 서식 문자의 일관된 처리. 검색 패턴의 특수문자 escape와 cursor 검사는 유지.
- `lib/server/ingredient-canonical-search.ts`: 기존 공개 alias view에서 검토된 대표 관계를 읽는다. 이름이 비슷하다는 이유로 합치지 않는다. 오류·잘못된 관계·연쇄 alias는 정상 빈 결과로 숨기지 않는다.
- `/ingredients`: 원래 이름/동의어로 찾은 뒤 대표 메타데이터로 합친다. 표준명 정확 일치 → 별칭 정확 일치 → 접두/부분 일치 순서와 대표 ID 중복 제거. 무검색 목록도 대표만 표시.
- YouTube 동기 matcher와 비동기 SQL matcher: 실제 표준명 우선, 옛 표준명은 동의어와 같은 우선순위. 다른 재료가 같은 별칭을 쓰면 `needs_review` 유지. 비동기 작업은 기존 DB 매칭 함수를 재사용하며, 검색을 위해 새 AI 호출을 추가하지 않았다.
- 레시피·팬트리 검색: 대표와 옛 ID를 양방향으로 찾아 기존 참조를 놓치지 않는다. 팬트리의 이름·분류 표시만 대표 정보로 맞추고, 물리적인 재고 행·원래 ingredient_id·사용자 소유권·수량을 합치지 않는다. 분류 필터를 대표 정보로 적용하므로 팬트리는 1,000행 이후도 페이지 조회한다.
- `lib/mock/qa-fixtures.ts`와 e2e mock: 운영과 같은 정규화·명시 별칭 검색을 사용한다. 운영 UI의 레이아웃이나 검색 중 카테고리 유지 정책은 바꾸지 않았다.

## DB 변경과 권한

`20261009090000_ingredient_canonical_search.sql`은 기존 `ingredient_catalog_aliases` view 끝에 대표 표준명/분류/분류코드만 붙인다. security-invoker 및 기존 공개 view 권한을 유지한다. 웹 anonymous read scope에는 정확한 GET 경로를 추가하고 JS gate는 5개 공개 열·정렬·페이지 범위만 허용한다.

비동기 resolver는 `youtube_extraction_worker_rpc_owner`라는 NOINHERIT/NOBYPASSRLS 역할로 동작한다. 실역할 검사에서 새 관계 조회가 거부되는 것을 재현한 뒤, `ingredient_catalog_entries`의 `ingredient_id`, `presentation`, `representative_ingredient_id` 3개 열만 SELECT하도록 허용했다. RLS는 alias 행만 보이고 전체 테이블·review_state·UPDATE·대표 관계의 비공개 근거는 계속 차단한다. 기존 helper 소유자와 worker의 기존 EXECUTE 권한은 유지한다.

확정 중복20개의 옛 표준명 중 대표에 없는17개만 동의어로 추가한다(기존3개 유지). 기존 동의어53개를 무조건 복사하지 않고 조회 시 대표로 연결한다. `빵`, `가슴`, `꽃줄기` 등 다른 재료에도 연결되는 일반 표현의 모호성은 남긴다. 원래 재료20개·영양값·레시피 FK·사용자 기록은 삭제하거나 합치지 않는다.

기존 STORED 검색 키 중 새 규칙과 달라지는 행만 재계산한다. 이번 실제 복원 자료에서는 기존 이름·기존 별칭·영양·참조·과거 기록이 그대로 보존됐고, 별칭 수만 4,129→4,146개로 증가했다. 재실행 추가0을 검증했다.

## 검증과 제한

- 숨은 문자 실패4건과 조합형 한글 실패1건을 먼저 재현한 뒤 수정.
- 대표/옛 이름 양방향 검색, 잘못된 alias 읽기, 범위 밖 다중 후보, 소유권·1,000행 이후 자료 누락 회귀.
- 관련12개 파일 **231개 검사 통과**. 전체 타입 검사·변경 파일 lint·production build 통과. 빌드의 기존 무관한 lint 경고 4개는 유지했다.
- 현재 운영 DB의 전체 백업을 네트워크가 없는 새 DB에 복원한 뒤 migration을 실행했다. SQL 정상/모호성/20쌍/숨은 문자/기존 별칭/제품 소유권/실제 async owner 권한 검사를 통과했다.
- 동일 migration 재실행의 데이터 불변과 기존 별칭 전체, 원래 재료·영양·참조·과거 기록의 체크섬 보존을 확인했다. AI 설정도 그대로다.
- 넓은 API suite의 레시피 생성13건·팬트리3건 실패는 수정 전 기준 checkout에서도 재현됐다. 이번 검색 대상은 통과했고, 나머지 생성/삭제 계약의 오래된 fixture 기대는 이번 범위에서 변경하지 않았다. 전체 suite 통과로 표현하지 않는다.
- 실제 운영에서 사용자가 겪었던 과거 추출 사례는 재료명이 없어 동일 원인인지 확정하지 못했다.

[격리 DB 검증 결과](data/ingredient-canonical-search-verification-20261009.json)는 배포 전 기록이다. [운영 반영 결과](data/ingredient-canonical-search-production-20261009.json)에서 최종 상태를 확인한다.

## 운영 반영 결과

최신 운영DB의 전체 백업·격리 복원과 실제 역할 검사 후 SQL 하나를 적용했다. migration 원장은211→212개, 동의어는4,129→4,146개다. 재료1,930개와 기존 영양·사용 기록의 체크섬을 보존했다. 별도 SQL 적용 후 웹을 교체했고 준비/교체 직전/완료 후 AI 자동 실행이 꺼져 있음을 확인했다.

운영 주소에서20쌍 모두 대표ID 하나만 반환하고 옛ID는 반환하지 않았다. 슈가파우더·다진마늘의 띄어쓰기/숨은 문자 변형도 같은 결과를 냈다. 실제 추출 역할에서20쌍과 숨은 문자 매칭을 읽기 전용으로 확인했다. 새 영상 추출·외부 모델 호출은 실행하지 않았다. 웹 후보225개와 배포 검증117개 검사가 통과했고 production build·별도 포트·운영 GET 확인을 마쳤다. 배포 폴더의 Next 내장 lint는 기존 eslint-plugin-react-hooks 경로 오류로 실행되지 않았으며, 별도 변경 파일 lint와 타입 검사는 통과했다.

이 작업이 만든 격리 DB 컨테이너는 제거했고 운영 백업은 보관한다. 다른 작업의 미반영 UI 수정과 기존 Luna worker 설정은 변경하지 않았다. [PR #1599](https://github.com/netsus/homecook/pull/1599).

## 후속 개발: YouTube 추출 이름 연결 보강 (미배포)

`codex/youtube-ingredient-resolution-20261009` 브랜치에서 저장된 v59 결과의 5개 엄격 이름 불일치를 독립 검토했다. 기존 frozen golden과 `grading-v2` 점수는 바꾸지 않고, 추출 의미 동등성과 실제 카탈로그 후보·최종 ID를 별도 지표로 측정한다. 고정 입력·기대 ID·분모와 전후 결과는 [targeted benchmark](data/youtube-ingredient-resolution-benchmark-20261009.json)에 기록했다.

초기 benchmark를 5건으로 제한한 이유는 사용자 사례 5건만 원문과 고정 카탈로그 ID를 별도로 검토해 기대 ID를 독립적으로 확정할 수 있었기 때문이다. resolver가 고른 ID를 다시 정답으로 쓰지 않았고, 기대 ID가 없는 나머지 행을 정확도 분모에 넣지 않았다. 이후 같은 v59 캐시 30개 영상의 344개 재료 occurrence를 모델 호출 없이 전수 스캔했다. 341개는 조회 정책 자체가 불변이고, 실제 후보 또는 검토 동의어가 달라지는 행은 3개였다. `큰 사이즈 두부`, `맛술(미림)`, 근거가 있는 `스파게티`가 각각 검토 ID로 새로 연결됐으며, 기존 연결 ID 변경 0건, 연결→모호/미해결 0건, 모호성 변화 0건이었다. 이는 전체 30개의 정확도 점수가 아니라 baseline→candidate 변화 목록이다. 입력 30개 파일의 해시를 확인했고 원본은 수정하지 않았다. 상세 분모·lineage·제한은 [v59 dev30 regression delta](data/youtube-ingredient-resolution-v59-dev30-regression-20261009.json)에 기록했다.

조회 후보는 원문을 저장 전에 수정하지 않는다. `큰 사이즈 두부`처럼 닫힌 크기 wrapper만 조회 후보 `두부`를 추가하고, 브랜드·용도·부위·건조/조리 상태·영양 차이는 제거하지 않는다. `맛술(미림)`은 현재 카탈로그의 검토된 맛술 ID에 전체 표현 하나를 동의어로 붙인다. `바질 잎`은 일반 바질로 합치지 않고 잎 전용 ID를 유지하며, `올리브 오일`은 기존 대표/동의어 구조를 그대로 사용한다.

`스파게티`라는 이름만으로는 요리명과 면 재료를 구분할 수 없어 계속 미해결이다. 다만 같은 저장 행의 보존 원문 전체가 `Spaghetti`이고, 바로 뒤에 현재 단위와 같은 명시 질량(`Spaghetti 250g` 등)이 있을 때만 상태 미확정 `파스타면` 후보를 추가한다. `Spaghetti sauce`, `Spaghetti squash`, 브랜드명, `Cooked Spaghetti`, 다른 질량 단위처럼 원문에 정체성·상태 차이가 있으면 연결하지 않는다. 동일 이름이 한 레시피에 여러 번 나오더라도 occurrence별 키를 사용해 근거가 있는 행만 연결하고 다른 행은 미해결로 둔다.

후속 migration `20261009200000_youtube_ingredient_resolution.sql`은 TypeScript와 같은 후보 순위, 정확 후보 우선, 표준명 우선, 다중 ID 보존을 SQL resolver에 적용한다. 비동기 YouTube resolver도 이름·단위·보존 원문을 넘긴다. 새 helper는 공개 API 역할에 노출하지 않으며 기존 worker owner에만 필요한 EXECUTE를 부여한다. helper 3개의 정확한 함수 정의·security mode·설정·ACL도 기존 shared-dependency contract에 포함해 본문이나 권한이 달라지면 readiness가 거부되도록 했다. resolver 본문과 helper 계약으로 달라진 비동기 추출 카탈로그 지문은 격리 migration postimage에서 계산해 재고정했다. 실제 worker lease/permit 경로에서 `Spaghetti 250g`만 파스타면으로 연결되고 소스·호박·브랜드·조리상태가 붙은 원문은 수량·단위·원문을 유지한 채 미해결임을 확인했다.

이 후속 변경은 아직 운영 DB·worker·웹에 적용하지 않았다. 운영 반영 전에는 현재 full-local 카탈로그 ID와 generation writer 상태를 확인하고, 백업 후 `pnpm deploy:dev` 범위의 승인된 절차로 migration과 앱 코드를 같은 묶음에 반영해야 한다.
