# 전체 요리 무게 — 2026-10-20 로컬 후보

운영 기준 `16cf3155c7b5`, DB238은 변경하지 않았다. 이 문서는 새 서버 계산기·완료 UI·검증 함수 SQL 후보의 **격리 검증**을 기록한다. 기존 사용자 기록·원본 저장소 dirty·provider/R2·YouTube worker 보류 작업을 건드리지 않았다. 새 인분/비율 원장은 범위 밖이다.

## 실제 화면의 카레와 계산 결과

제공된 레시피북에서 저장 상세 `b74f5cd2-0db2-4354-b111-1136140763e7`의 ‘맛있는 돼지고기 카레’, 기본 2인분을 읽고 캡처했다. 레시피 화면에는 주요 음식과 물이 있으며, 전체 재료를 다시 입력해야 하는 경우가 아니다.

| 화면 재료 | 기준 추정 g | 입력 재료 가정 범위 g |
| --- | ---: | ---: |
| 돼지앞다리살400g·양파500g·감자360g·당근140g·카레가루100g·버터16g | 1516 | 1516–1516 |
| 물1500ml | 1500 | 1500–1500 |
| 식용유 분량 미확인, 단계 ‘식용유를 약간…’ | 7 | 3.5–14 |
| 소금2꼬집 | 2 | 1–3 |
| 후추 약간 | 0.2 | 0.05–0.5 |
| 맛술3스푼 | 54 | 18–67.5 |
| 케첩1크게스푼 | 22.5 | 15–30 |
| 국간장1스푼 | 18 | 6–22.5 |
| **합계** | **3119.7** | **3059.55–3153.5** |

화면 수량을 옮긴 합성 source ID fixture를 **실제 새 계산기**에 넣어 나온 값이다. 운영 세션을 생성하거나 실제 frozen v4 proof/ID를 읽은 결과는 아니다. UI에는 약3.1kg과 유효2자리 자동 필드3100g이 표시된다. 내부 원예측3119.7은 보존하고 자동 완료 시 반올림 표시값을 서버 입력으로 복사하지 않는다.

이는 **입력한 재료량 기준 거친 전체무게**다. 증발·팬 잔류·조리손실은 미보정이다. 위 범위는 숟가락·양념 가정의 입력 범위이며, 완성 음식의 신뢰구간이나 오차 보증이 아니다. 실제 완성무게는 더 작을 수 있다. 정확도를 검증할 독립 실측 정답 표본은 여전히 0건이다.

## 근거와 제품 정책의 구분

- [Ajinomoto 공식 계량 표](https://park.ajinomoto.co.jp/contents/basic/chomiryo_bunryou/)는 물15ml≈15g, 미림/간장 큰술≈18g, 케첩 큰술≈15g의 참고값을 제공한다. 맛술은 미림의 대리값이며 실제 상품 밀도로 확정하지 않는다. 사용자의 비표준 ‘스푼’은 계량큰술로 확정하지 않고 작은술~큰술 차이와 여유를 둔 제품 가정으로 남긴다. 크게스푼 케첩22.5g(15–30g)도 별도 가정이다.
- [Nisshin 공식 안내](https://www.nisshin-oillio.com/customer/faq_detail.html?id=4000032)는 기름15ml≈14g을 설명한다. [S&B 2인분 카레](https://www.sbfoods-worldwide.com/recipes/433.html)는 기름1/2큰술을 쓴다. 이 비교 레시피를 참고해 약간의 기름은 2인분7g(3.5–14g)으로 추정한다. 사용자 카레의 실제 사용량·흡수량을 측정한 값은 아니다. 기름을0g으로 제외하지 않는다.
- [Kikkoman 레시피](https://www.kikkoman.co.jp/homecook/search/recipe/00059936/)는 소금 한 꼬집을1g으로 둔다. 꼬집당0.5–1.5g은 변동을 드러내는 제품 가정이다. 후추2인분0.2g(0.05–0.5g)도 소량 사용에 대한 공개된 가정이며 보편적 dose나 영양 환산 자료가 아니다.
- [USDA 조리수율](https://www.ars.usda.gov/ARSUserFiles/80400525/Data/retn/USDA_CookingYields_MeatPoultry02.pdf), [FAO 계산 자료](https://www.fao.org/fileadmin/templates/food_composition/documents/Presentations/Food_Composition_-_Recipes_and_other_calculations.pdf), [FAO 보관 EuroFIR 지침](https://www.fao.org/uploads/media/vasquez-caicedo_et_al__2007_recipe_rulesD2.2.9_02.pdf)은 입력 질량, 조리수율, 물/지방과 외부 손실의 구분을 뒷받침한다. 특정 고기 수율이나 기존75%를 이 카레 전체의 과학적 수율로 쓰지 않았다. Bognár 권리 보류 및 개인 보정 apply=false는 유지한다.

`recipe-mass-proxy-v1` / `household-minor-dose-20261020-v1`은 정책 ID·SHA256·원래 수량/identity·각 행의 g/범위·authorized label 출처·손실 미보정 가정을 고정한다. 기존 outer catalogVersion은 호환 형식이며 USDA가 카레의 계수를 제공했다는 뜻이 아니다. 이 가정은 영양 재료 환산이나 기존 영양값에 전용하지 않는다.

## 구현

새 `withRecipeMassProxy`는 bounded 계산이 불가할 때 원본과 소유자 확인 cook-mode의 모든 재료 ID·순서·표시 이름 및 단계 원문을 결합한다. 확인된 질량은 보존한다. 이름 추론은 정확한 소량 allowlist의 generic 재료에만 허용하고 product를 이름으로 환산하지 않는다. 미확정 소량 상한이 확인된 질량의10%를 넘으면 거부한다. 기름은 다른 재료의 ‘약간’을 빌리지 않으며 명시된 소량 문맥과 단위를 요구한다. 배수·버림·튀김·추가 물/기름 문맥과 누락된 핵심 재료/물은 거부한다. 잘못된 frozen proof를 새 환산으로 수리하지 않는다. 기존 bounded/75% 모델은 별도 검사와 출처를 유지한다.

소수 곱셈부터 BigInt decimal로 계산해 PostgreSQL numeric과 반올림을 맞춘다. frozen 원입력1500mL·표시1.5L 및 실행 중 동일1.5L 재저장을 지원한다. 실행 중 수정은 기존 nutrition 재계산·revision·멱등성 경로를 유지하며 원본 snapshot은 바꾸지 않는다.

완료 UI는 자동값을 채우고 그대로 완료 가능하다. 자동 모드는 `weigh_later/null`을 보내 서버 예측을 선택한다. ‘추정값 수정’은 값이 채워진 편집 필드와 **manual_estimate** 출처를 사용한다. ‘실측값 입력’은 빈 필드로 시작해 **reported_measured**로 우선 저장한다. 자동값을 실측으로 승격하거나 manual에 attestation을 붙이지 않는다. 추정으로 돌아갈 때 이전 draft/attestation은 비운다. fresh prediction이 오더라도 명시적 draft를 덮어쓰지 않는다. 미지수는 가짜0으로 채우지 않는다.

`20261020210000_cooked_weight_mass_proxy.sql`은 기존 private writer에서 새 모델의 원본 source binding·모든 행·정책 hash·각 dose 산술·범위·합계를 따로 검증한다. 기존75% 검사와 owner/receipt/gate 보호를 유지한다. 기존 public 완료 함수는 명시적 manual_estimate를 허용하며 재시도 관측 종류도 확인한다. **테이블·컬럼·권한·소유자·키를 변경하지 않으며 운영 DB에 적용하지 않았다.** app/API와 이 후보 SQL의 동시 릴리스가 필요하다. 명시적 manual은 DB gate OFF에서 legacy fallback으로 실측 전환되지 않고409로 보류된다.

## 실제 검증과 한계

- 새 계산기·UI·route·수량·기존 모델 집중 회귀14파일233/233, 실패0·skip0. 레시피북/인라인24개도 포함한다. 목차 키보드 검사의 RAF 포커스 완료를 기다리는 타이밍을 바로잡아 재검사했다. 초기389실행의 기존 YouTube쪽파 조회1실패는 기준 컴포넌트에서도 재현됐으며 전체 suite 통과로 바꾸지 않는다.
- 새 후보 SQL은 소유한 PostgreSQL17-alpine, network=none, port/영구볼륨 없는 일회성 DB에서25/25 통과했다. 자동/수정 추정/실측 분리, estimate 보존, 위조 수치·범위·hash·identity·proof·행 수, owner/gate 거부, decimal tie와3/80스푼, frozen1500mL↔1.5L·동일양 재저장, 원함수 복원·이전 reader/receipt 호환을 포함한다. 초기 문법 오류는 수정·재실행했다. 이 최소 fixture의 authority와 기존 completion은 명시적 stub이며, 아래 native 검증과 구분한다.
- 실제 Chrome1440×900/375×812: 약3.1kg/3100g 표시와 내부3119.7 보존을 재확인했다. 그 전 원정밀도 표시 상태에서 자동3119.7→125g, manual2800→180g, measured2700→200g을 완료·식사기록·새로고침으로 확인했다. 수량은 사용자 입력 전 blank·저장 disabled이고, manual에도 추정 안내가 나온다. 자동 estimate3119.7은 수정/실측 뒤에도 별도 history에 남았다. API POST6개/오류0, console warn/error0. 이 브라우저 API·영양값·잔량은 합성 메모리 fixture이며 실제 DB 저장·카레 영양 정확도 검증이 아니다.
- 독립 리뷰의 배수 활용형, 소량 기름 판정, 소수 곱셈, frozen 단위 전환/재저장 지적을 수정했다. 최신 소스 재검토에서 남은 중대 결함 없음. 리뷰어는 저장된233 이전78/78·SQL20/20을 확인했으며 브라우저/SQL을 직접 재실행하지 않았다.
- 변경 lint/anti-slop/typecheck/build의 최신 종료값은 `.artifacts/feedback-ui/mass-proxy-*-receipt.json`과 로그를 따른다. 테스트와 빌드는 서로 대체하지 않는다.

마지막 캡처는 viewport 변경 후 DOM 크기와 렌더링 완료를 확인해 `curry-viewport/`에 다시 저장했다(375×812/1440×900, scrollWidth 각각375/1440). 초기 즉시 캡처의 이전 레이아웃 이미지는 최종 증거로 사용하지 않는다. 최종 build/typecheck/lint/verify:anti-slop 종료0·신규0을 확인했고 기존 빌드 경고3개는 보존한다.

증거는 `.artifacts/feedback-ui/curry-model-prediction.json`, `mass-proxy-final-tests.json`, `mass-proxy-compat-sql.json`, `curry-whole-weight/`와 아래 native 결과에 있다. 운영 적용과 실제 frozen 카레 source 결합 확인은 아직 하지 않았다.

## 승인 후 DB238 native 통합 검증과 배포 차단

2026-10-20 08:25 UTC 사용자가 통합 검증·백업 확인 후 GitHub 반영/머지→함수2개 DB 변경→웹 배포→운영 확인 진행을 승인했다. 이 승인을 기존 보호 도구의 PIN 변경이나 다른 기능의 권한 전용으로 해석하지 않는다.

전체 migration 처음부터 재생은213개 뒤 `20261009200000_youtube_ingredient_resolution.sql`의 기존 catalog hash fence에서 실패했다(실제 `67e4a441…`, 요구 `81362d75…`). 기존 문서에 기록된 문제와 같고, 역사 SQL·hash fence·YouTube 코드는 바꾸지 않았다. 이 실행은 **실패**로 보존한다.

대신 저장소에 문서화된 native schema-only 복원 경로를 사용했다. 승인된 schema232 archive SHA `8b5fb24afc4f6635ff1640d33d73ffb3883af49b0554dad6f81735a6a7a6587b`와 고정 Supabase PostgreSQL image에 원233–238 SQL을 그대로 적용했다. 초기153개 표의 행0, role36/membership23·설정 일치, 함수443개를 확인했다. archive에는 TABLE DATA/SEQUENCE SET/BLOB DATA가 없으며 운영 연결0·network none·port0·mount0다. raw dump 차이는 기존 검토된 deparse 정규화로만 비교했다. 이것은 처음부터 migration 재생 성공을 대신 주장하지 않는다.

실제 기존 auth/완료/preview/meal/adjust 함수는 stub으로 교체하지 않고 합성 owner/session/snapshot/영양만 주입했다. native 검사10/10은 자동3119.7g→125g 기록/잔량2994.7g, manual2800→180g, reported2700→200g, 이전 receipt 재시도·변경 거부, owner/anon/폐기 binding 거부, 실제 gate OFF·옛 client, 후속 잔량수정 시 기존 meal 근거 고정, 원2함수 복원 후 옛 reader/새 이력 보존과 구client 완료를 확인한다. 강제 DDL 실패가443함수 전체와 기존 batch/meal/evidence/receipt를 되돌리고, 정상 적용에서는 정확2개 본문만 바뀌며 OID/owner/ACL/config가 보존됨을 비교했다. 운영 HTTP 로그인·브라우저부터 DB까지 한 연결·실제 카레 영양 정확도 검증은 아니다.

독립 리뷰에서 native 테스트 import 시 외부 context 파일을 무조건 읽는 문제가 나왔다. 활성화된 beforeAll로 옮기고 context SHA를 고정했다. 비활성 검사에 존재하지 않는 context 경로를 주입해 수집 성공/10 skip을 확인했으며 이를10 pass로 세지 않는다. 증거는 `native-db238-setup.json`, `native-db238-tests.json`, `native-disabled-collection.json`, `full-schema-replay-report.json`이다.

정식 read-only deploy plan은 `--db-compatible`를 `닫힌 R2 유지 배포: 닫힘 승계는 기존 reviewed-ref와 읽기 전용 DB 검증만 허용합니다.`로 차단했다. 이는 **배포 도구 가드의 거부이며 자동 승인 심사 거절이 아니다.** DB238 프로필은235→238의 고정3 SQL/PIN만 허용하고 앱 successor는 SQL0 전용이다. 재시도·우회·과거 PIN 재지정은 하지 않았다. 별도239 feature 검토서/고정 SHA,238 predecessor receipt,239 SQL raw/payload·함수2개 전후상/나머지 catalog·행·권한·제어 보존, 기존 backup/fence/단일 transaction/reconcile 연결이 선행돼야 한다. 상세 범위는 [DB239 배포 준비서](cooked-weight-db239-release-readiness-20261020.md)를 따른다. 이 시점 신규 운영 백업·서비스 중지·GitHub 쓰기·DB 적용·웹 배포는0이다.
