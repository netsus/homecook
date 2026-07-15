# Current Source of Truth

## Official Files
- `docs/요구사항기준선-v1.7.18.md`
- `docs/화면정의서-v1.5.24.md`
- `docs/유저flow맵-v1.3.21.md`
- `docs/db설계-v1.3.19.md`
- `docs/api문서-v1.2.23.md`

## Notes
- 위 5개 파일이 현재 공식 기준 문서다.
- `docs/reference/wireframes/`는 보조 참고 자료다.
- 구현 중 문서 충돌이 보이면 먼저 충돌 항목을 정리하고 작업 범위를 다시 확정한다.
- 사용자 승인으로 공식 계약을 바꾸는 경우에도 구현보다 문서가 먼저다. 관련 공식 문서와 이 파일의 버전/경로를 같은 `contract-evolution` PR에서 먼저 갱신한다.

## Recipe Nutrition, Prepared Food Catalog, And Product Planner Contract-Evolution `2026-07-15`

| 문서 | 변경 내용 |
|------|----------|
| 요구사항 기준선 v1.7.18 | Recipe Meal/완제품 분리 ADR, pinned ingredient predecessor, snapshot·계획 영양·결측·대표 환산·workflow 제외·호환/보안/비목표를 재잠금 |
| 화면정의서 v1.5.24 | 영양/완제품 화면의 loading·empty·error·read-only·partial·unavailable, login return-to-action과 recipe/product action 경계를 공식화 |
| 유저플로우 v1.3.21 | recipe/product 판별 흐름, additive read model, owner/read-only/login gate, shopping/cooking/leftover 구조적 제외와 계획 영양 합산 흐름을 동기화 |
| DB v1.3.19 | 49개 table 유지. `warnings_json`, immutable product `basis_relations_json`, `meals.recipe_id NOT NULL`, version pin/RLS/column guard를 구체화 |
| API v1.2.23 | endpoint 수 81개(active 80 + tombstone 1) 유지. recipe context `base_servings/scalable_values/fixed_values`, `basis_relations[]`, additive `product_entries`, no-duplicate read, wrapper/error/권한·멱등성·상태 경계를 재잠금 |

> 사용자는 2026-07-13 `nutrition-products-planner-expansion-20260713.md` 전체 계획을 명시 승인하고 계획대로 진행하도록 지시했다. public data pilot PR #1005는 merge commit `3866952c3e81bedfd80593f576e5ed6183ec7538`(reviewed head `028c6e8f13d3c8586bbbfaa9dad42f0ae65c1420`)로 선행 merge됐다.
> 이 계약은 아래 `Ingredient Nutrition Conversion Model Contract-Evolution 2026-07-14`를 pinned predecessor로 소비한다. 계산은 active current approved source/profile/ingredient link/conversion assignment/piece weight만 사용하고 runtime public API 호출이나 무검수 promotion을 허용하지 않는다.
> 기존 `meals`와 `POST /meals`는 recipe workflow 전용이다. 완제품은 `food_products`, immutable `food_product_nutrition_versions`, `product_planner_entries`로 분리하며 public은 일반 사용자 read-only, private은 owner-only다. planner/meals의 기존 recipe 배열은 유지하고 `product_entries`를 additive 제공하며 같은 recipe row를 중복 반환하지 않는다.
> product entry는 shopping preview/list, cooking session, leftover, recipe count·XP/activity와 `meals.status`에서 구조적으로 제외한다. 컬럼에 Recipe Meal 또는 ProductPlannerEntry가 하나라도 연결되면 기존 호환 `409 COLUMN_HAS_MEALS`를 유지한다.
> `tbsp=15mL`, `tsp=5mL`, 국내 조리용 `cup=200mL`와 승인 `VOLUME_G6/G10/G15/G20/G25` 대표값을 사용한 결과는 `약/예상`이다. piece weight는 재료·크기·손질/가식 상태가 정확히 일치할 때만 사용한다. product의 `serving/package/g/ml` 교차 환산은 pin된 immutable version의 승인 `basis_relations[]` 직접 관계가 있을 때만 허용한다.
> recipe snapshot은 input hash/calculation version/base servings/scalable·fixed vector/영양소별 상태와 known amount/reflected·target count/missing reason/quality/`warnings[]`를 불변 보존한다. `TO_TASTE`·결측·변환 불가는 0이 아니며 partial은 `최소 X`, unavailable은 amount null이다. 선택 인분 공식은 `scalable × selected/base + fixed`이고 요리모드 인분 조절 UI는 계속 금지한다.
> 합계는 실제 섭취가 아닌 `계획 영양`이다. 의료 처방·질환 코칭·actual consumption·OCR·바코드·외식·밀키트는 MVP 비목표이며 기존 삭제 endpoint와 domain rule은 되살리거나 완화하지 않는다. 이 PR은 공식 계약/SOT만 소유하고 후속 workpack·acceptance와 제품 구현은 별도 Codex 작업으로 진행한다.

## Ingredient Nutrition Conversion Model Contract-Evolution `2026-07-14`

| 문서 | 변경 내용 |
|------|----------|
| 요구사항 기준선 v1.7.17 | 공공 영양 source item 원문 보존, 기본 `100g` normalize, MFDS→RDA 10.4 호환 후보 우선순위, evidence/profile/assignment 분리, 검수·version·pilot 30·production 0 writes 경계 추가 |
| DB v1.3.18 | `measurement_source_evidence` 추가, 영양 source/item/profile/value 및 재료 link·환산 assignment·piece weight의 freshness/결측/후보·승인·철회·대체/RLS 계약 구체화. 전체 target 49개 table |
| 화면정의서 v1.5.23 | 변경 없음. 이번 슬라이스는 사용자 UI를 만들지 않음 |
| 유저플로우 v1.3.20 | 변경 없음. 사용자 route/action/state transition을 늘리지 않음 |
| API v1.2.22 | 변경 없음. public endpoint/field/response/error를 늘리지 않고 internal/admin import command만 후속 구현 |

> 공공 원문 계량 evidence, 서비스 대표 환산 profile, 재료별 승인 assignment를 별도 record로 보존한다. evidence를 검수했다고 assignment를 자동 승인하지 않으며 원문값과 대표값을 서로 덮어쓰지 않는다.
> 대표 부피 profile은 `VOLUME_G6/G10/G15/G20/G25`다. 15mL 관측값의 최소 거리가 `<=2.5g`인 후보만 생성하고 정확한 중간값 동률은 fail-closed하며, 사람 승인 후에만 active가 된다. `개→g`도 재료·크기·손질/가식부 상태가 일치하는 active approved piece weight가 없으면 금지한다.
> 초기 범위는 `20260626104000_seed_foodsafety_pilot_recipes.sql`의 정확히 30개 레시피와 그 canonical 재료 closure다. `DATA_GO_KR_API_KEY1`은 이전 개발자 로컬 smoke 증거일 뿐이며, key/auth query/raw payload·원문 row는 저장·로그·report·PR 본문에 남기지 않는다. 별도 승인 전 production load는 0 writes다.
> 이 contract-evolution은 사용자가 2026-07-14에 별도 Codex Stage 1 세션에 명시적으로 위임했다. 작성자와 구현자는 독립 Stage 1.5/3 검수자의 최종 승인을 대신할 수 없다.

## Mumeok Icon Edge Treatment Contract-Evolution `2026-07-14`

| 문서 | 변경 내용 |
|------|----------|
| 요구사항 기준선 v1.7.16 | favicon 투명 외곽, 180/192/256/512/1024 설치 계열 full-bleed 파란 배경, header/OG 원본 보존, 192 설치 아이콘 분리와 일반 icon 후보 제한 계약 추가 |
| 화면정의서 v1.5.23 | browser/OS mask 특성, 흰색 matte·halo 금지, document icon 후보·corner alpha/RGBA 자동 검증과 배포 cache Manual Only 기준 추가 |
| 유저플로우 v1.3.20 | 변경 없음. route, action, 상태 전이와 사용자 여정은 기존과 동일 |
| API v1.2.22 | 변경 없음. endpoint/field/response/error 변화 없음 |
| DB v1.3.17 | 변경 없음. schema/migration/seed/stored row 변화 없음 |

> 사용자가 2026-07-14에 browser tab에서 favicon 모서리의 흰색이 보이는 문제를 확인하고 수정을 명시 승인했다.
> favicon은 파란 둥근 사각형 밖을 실제 투명 alpha로 내보내며, 설치/PWA·Apple 아이콘은 OS mask를 위해 흰 모서리 없는 full-bleed 파란 배경으로 별도 파생한다. document의 일반 icon 후보에는 투명 favicon만 남겨 브라우저가 불투명 header/설치 아이콘을 tab icon으로 선택하지 않게 한다.
> 공식 source와 SHA-256, header 심볼, OG/Twitter·가로형·흑백 자산은 변경하지 않는다. 이 예외는 파생 아이콘의 외곽 픽셀에만 적용하며 글자 재생성·재착색·비율 변경을 허용하지 않는다.
> API/DB/dependency/route/interaction/접근성 이름/기술 식별자에는 변화가 없고 과거 공식 버전과 merged evidence는 그대로 보존한다.

## Mumeok Image Brand Assets Contract-Evolution `2026-07-13`

| 문서 | 변경 내용 |
|------|----------|
| 요구사항 기준선 v1.7.15 | 선택한 파란 `무먹` 이미지 심볼, HOME/non-HOME 표시 경계, favicon·설치 아이콘·OG/Twitter·보조 자산 사용 계약 추가 |
| 화면정의서 v1.5.22 | 공통 header의 심볼 조합, HOME 2단 이름 유지, 이미지 비율·접근성·반응형·authority 검증 기준 추가 |
| 유저플로우 v1.3.20 | 변경 없음. route, action, 상태 전이와 사용자 여정은 기존과 동일 |
| API v1.2.22 | 변경 없음. endpoint/field/response/error 변화 없음 |
| DB v1.3.17 | 변경 없음. schema/migration/seed/stored row 변화 없음 |

> 사용자가 2026-07-13에 `ui/designs/brand/mumeok/exports/source/mumeok-symbol-selected-source-1254.png`의 파란색 둥근 사각형 + 흰색 `무먹` 글자 심볼을 공식 브랜드 심볼로 명시 승인했다.
> 공식 심볼 source SHA-256은 `7ada6b0bcdd46a78a11b353c89e3506ac6288b31a20df321abe097b02738ffe4`이며 screenshot·미선택 후보·따옴표·점·장식 변형을 사용하지 않는다.
> HOME은 공식 심볼 옆에 기존 `무먹`/`무엇을 먹든` 세로 이름 위계를 유지하고, non-HOME 공통 header는 공식 심볼 + `무먹`만 표시한다. favicon·설치/PWA·Apple touch·OG/Twitter metadata는 생성 완료본을 연결한다.
> 기존 텍스트-only/no-image 문구는 이 addendum이 명시적으로 대체한다. API/DB/dependency/기술 식별자에는 변화가 없고 과거 공식 버전과 merged evidence는 그대로 보존한다.

## Nutrition, Prepared Food, And Planner Summary Contract-Evolution `2026-07-13`

| 문서 | 변경 내용 |
|------|----------|
| 요구사항 기준선 v1.7.14 | 핵심 영양 5종, complete/partial/unavailable, direct/estimated/mixed, 결측≠0, 대표 환산 등급, immutable snapshot, 완제품/계획 영양 정책 추가 |
| 화면정의서 v1.5.21 | RECIPE_DETAIL 예상 영양 카드, FOOD_PRODUCT_PICKER/CREATE, PLANNER_WEEK/MEAL_SCREEN 혼합 entry와 계획 영양 표시 계약 추가 |
| 유저플로우 v1.3.20 | 공공/내 private 완제품 검색·manual 등록·플래너 추가, pin된 snapshot 합산, recipe workflow 제외 흐름 추가 |
| DB v1.3.17 | 영양/source/환산/recipe snapshot/완제품/product planner entry 13개 additive table과 Meal snapshot pin/RLS/불변 제약 추가 |
| API v1.2.22 | Nutrition 공통 shape, recipe/planner/meals additive field, 계획 영양 1개 + 완제품 catalog/entry 7개 endpoint 추가. 기존 tombstone 포함 목록 73→81개(active 72→80개) |

> 사용자가 2026-07-13에 재료별 영양, 레시피 예상 영양, 완제품 planner entry, 끼니/날짜/주간 계획 영양 집계를 명시적으로 승인했다.
> MVP 핵심 영양소는 열량·탄수화물·단백질·지방·나트륨이며, 결측은 0이 아니다. completeness와 계산 품질을 분리하고 partial은 `최소 X`, unavailable은 null/정보 준비 중으로 유지한다.
> 큰술·작은술·컵·mL는 승인된 15mL당 약 6/10/15/20/25g 대표 등급을 사용하며 화면에 항상 `약/예상` 의미를 표시한다.
> 농촌진흥청 공개 계량자료는 필요한 소량 관측 사실·출처·조회일·변환 결과만 대표 등급 검수 근거로 보존한다. 원문 표·문장·배치·전체 데이터셋은 복제하지 않으며 source provenance/license를 표시하고 key/secret은 노출하지 않는다.
> 완제품은 Recipe/Meal과 별도 private/manual/public catalog로 관리하고 장보기·요리·남은요리·recipe metrics·`planner_registered` XP에서 제외한다. 플래너 합계는 생성 당시 pin된 immutable recipe/product snapshot만 사용한 `계획 영양`이다.
> 이 기능군의 기존 Claude 담당 단계는 역할이 분리된 별도 Codex 앱 작업으로 대체한다. 작성·구현 작업은 자기 변경을 최종 승인하지 않으며 이 예외는 아래 nutrition 관련 신규 slice에만 적용한다.

## HOME Service Name Lockup Contract-Evolution `2026-07-13`

| 문서 | 변경 내용 |
|------|----------|
| 요구사항 기준선 v1.7.13 | HOME 모바일 `HomeAppBar`와 desktop HOME `WebTopNav` 브랜드 영역에 큰 `무먹` 아래 작은 `무엇을 먹든`을 세로 2단으로 표시하는 예외 계약 추가 |
| 화면정의서 v1.5.20 | HOME 전용 2단 lockup의 반응형·접근성 계약과 390/320/1280 authority evidence 요구 추가 |
| 유저플로우 v1.3.19 | 변경 없음. route, 진입, 상태 전이, 사용자 action은 기존과 동일 |
| API v1.2.21 | 변경 없음. endpoint/field/response shape 변화 없음 |
| DB v1.3.16 | 변경 없음. schema/migration/stored row 변화 없음 |

> 사용자가 2026-07-13에 인지도가 낮은 짧은명 `무먹`의 뜻을 HOME에서 함께 학습할 수 있도록 이 세로 2단 lockup을 명시적으로 승인했다.
> HOME 외 AppBar·텍스트 워드마크·좁은 내비게이션은 `무먹` 단독을 유지하며, 두 이름의 오른쪽 inline 배치는 허용하지 않는다.
> 이번 변경은 새 화면/interaction 없는 low-risk visual change지만 HOME direct modification이므로 `anchor-extension`과 authority-required다. 기존 screenshot/evidence는 보존하고 새 workpack 경로에 390px/320px 및 desktop 1280px before/after와 authority report를 추가한다.
> API/DB/dependency/기술 식별자/이미지 로고/마스코트에는 변화가 없다.

## Service Brand Rebrand Contract-Evolution `2026-07-13`

| 문서 | 변경 내용 |
|------|----------|
| 요구사항 기준선 v1.7.12 | 정식명 `무엇을 먹든`, 짧은명 `무먹`, 고정 copy, 신규·빈 nickname `무먹러` fallback, 기술 식별자·사용자 콘텐츠·과거 자료 보존을 추가 |
| 화면정의서 v1.5.19 | AppBar/텍스트 워드마크, HOME/ABOUT/MYPAGE copy와 HOME anchor-extension authority evidence 계획을 갱신 |
| 유저플로우 v1.3.19 | HOME/가이드/로그인/성장 여정의 브랜드 표시, nickname 분기, notification read-time canonicalization을 추가 |
| API v1.2.21 | endpoint/field/DB shape 변화 없이 신규·빈 nickname fallback과 system notification exact-copy read-time canonicalization을 고정 |
| DB v1.3.16 | 변경 없음. migration/rewrite 없이 기존 schema와 stored rows를 유지 |

> 사용자가 2026-07-13에 기존 Claude 담당을 별도 Codex Stage 1 문서 계약 세션으로 대체하고 이 contract-evolution을 명시적으로 승인했다.
> 법적/SEO/서비스 최초 정의는 `무엇을 먹든`, 텍스트 워드마크·AppBar·좁은 내비게이션은 `무먹`을 사용한다. 신규 또는 trim 후 빈 nickname만 `무먹러` fallback을 쓰며 기존 저장 nickname은 변경하지 않는다.
> `homecook:*`, `HOMECOOK_*`, cookie/header/event/storage/package/repository/Supabase/OMO/stored key, 사용자 콘텐츠와 일반명사 `집밥`, 과거 공식 버전과 merged evidence/prototype은 보존한다.
> 새 영문 브랜드, dependency, DB migration, endpoint/response field, 이미지 로고·마스코트는 추가하지 않는다.

## Public Service Guide Addendum `2026-07-12`

| 문서 | 변경 내용 |
|------|----------|
| 요구사항 기준선 v1.7.11 | 공개 `/about` 서비스 가이드, 웹 공통 5개 메뉴, HOME `집밥 둘러보기`, MYPAGE 임시 도움말 제거를 추가 |
| 화면정의서 v1.5.18 | `ABOUT_SERVICE_GUIDE` 화면, HOME guide+theme rail 순서/상태/접근성, desktop/mobile 내비게이션 계약을 추가 |
| 유저플로우 v1.3.18 | 웹 메뉴, HOME 카드, direct/legacy URL에서 가이드로 진입하고 HOME/플래너로 복귀하는 여정을 추가 |

> 사용자가 2026-07-12에 `/about` 가이드, `PRIMARY_WEB_NAV_ITEMS` 공통화, HOME `집밥 둘러보기` 가로 rail 구성, MYPAGE 도움말 제거를 명시적으로 승인했다.
> API/DB 문서 변경은 없다. `함께 만드는 집밥` 커뮤니티/제안 게시판은 별도 후속 슬라이스로 제외한다.

## Social Auth Provider Memory And Identity Linking Addendum `2026-07-10`

| 문서 | 변경 내용 |
|------|----------|
| 요구사항 기준선 v1.7.11 | Google/Naver/Kakao 이메일 필수, provider memory advisory 정책, same-email/same-user 연결 허용과 different-user 자동 merge 금지, 수동 provider 연결 추가 |
| 화면정의서 v1.5.18 | LOGIN 최근 provider 강조/다른 provider 확인창/email-required·account-conflict 상태, MYPAGE 연결 provider 상태/연결 액션 추가 |
| 유저플로우 v1.3.18 | 일반 로그인 callback과 link callback 분리, 이메일 누락/same-user/different-user 분기, manual linking 흐름 추가 |
| DB v1.3.16 | schema 변경 없이 `social_provider` 최초/primary 의미와 Supabase Auth identity truth, normalized email/user-id conflict guard, PII 비로그 정책 고정 |
| API v1.2.20 | `/auth/callback`과 `/auth/link/callback` web route 계약, built-in Kakao 우선, Naver 표준 claim gate, 실제 provider 판정, provider memory 경계 추가. public API endpoint 수 변경 없음 |

> 이 변경은 사용자가 승인한 `auth-provider-memory-linking` contract-evolution이다.
> Kakao는 Supabase built-in `kakao`를 우선하고 기존 Kakao proxy는 custom compatibility fallback으로만 유지한다. Naver `custom:naver`는 기존 no-store `/api/auth/oauth-userinfo/naver`를 UserInfo URL로 사용하고 E3에서 `auth.users.email`과 안정적인 표준 `sub`를 함께 실측한다.
> `public.users.email`은 이번 slice에서 DB NOT NULL로 바꾸지 않지만 신규 social OAuth callback은 정규화된 비어 있지 않은 이메일을 필수로 한다.
> 동일 이메일 자동 연결은 Supabase가 같은 auth user id로 identity를 해석한 경우에만 허용한다. 다른 user id는 자동 merge/delete하지 않는다.
> `app_metadata.provider`는 최초 provider이므로 실제 마지막 로그인 provider의 단일 근거로 쓰지 않는다.
> 연결 identity의 canonical truth는 Supabase Auth이며 `public.users.social_provider`는 최초/primary provider 의미를 유지한다.
> `Allow users without an email`은 E1-E3 동안 ON, E4 직전 사용자 알림·확인 후 세 provider 모두 OFF, 이후 E5 production smoke를 수행한다.
> 구현 Stage 2/4는 이 공식 계약과 workpack이 main에 merge된 후에만 시작한다.

## Pilot Recipe Step Multi-Method Addendum `2026-06-27`

| 문서 | 변경 내용 |
|------|----------|
| DB v1.3.16 | `recipe_step_cooking_methods` additive table target 추가. `recipe_steps.cooking_method_id`는 첫/대표 조리법 호환 필드로 유지 |
| API v1.2.20 | 레시피 상세/요리모드 step 응답에 `cooking_methods[]` 배열을 additive 추가. 기존 `cooking_method`는 첫/대표 조리법으로 유지 |

> 이 변경은 파일럿 30개 식약처 레시피 품질 검수에서 한 단계에 `데치기 + 갈기`, `썰기 + 볶기`처럼 여러 조리법이 실제로 필요한 것이 확인되어 추가한다.
> 기존 클라이언트 호환을 위해 `recipe_steps.cooking_method_id`와 응답 `cooking_method`는 제거하지 않는다.
> 새 read path는 `recipe_step_cooking_methods.position ASC`를 canonical ordering으로 사용한다.
> DB 마이그레이션 전 코드가 배포되어도 기존 단일 조리법 조회로 fallback해야 한다.

## Public Recipe Photo Gallery Addendum `2026-06-27`

| 문서 | 변경 내용 |
|------|----------|
| API v1.2.20 | `GET /recipes/{recipe_id}` 응답에 상세 갤러리용 `photos[]` additive 필드 추가. 기존 `thumbnail_url`은 유지 |

> 이 변경은 manual UI/UX review plan 82번에 대한 사용자 승인 기반 후속 구현이다.
> 공공 레시피는 `recipe_sources.extraction_meta_json.image_candidates`에 남은 license-cleared public image 후보를 중복 제거해 `photos[]`로 내려줄 수 있다.
> 클라이언트는 `thumbnail_url` 단일 이미지만 있는 기존 레시피와 호환되어야 하며, 후보가 여러 장일 때만 갤러리 UI를 확장한다.

## Leftovers Stale Review Addendum `2026-06-20`

| 문서 | 변경 내용 |
|------|----------|
| 화면정의서 v1.5.18 | LEFTOVERS에서 `cooked_at` 기준 30일 이상 지난 남은 요리에 오래 보관 안내와 `계속 보관` 확인 액션을 표시 |
| DB v1.3.16 | `leftover_dishes.stale_reviewed_at` nullable 컬럼 추가 |
| API v1.2.20 | `GET /leftovers` 응답에 `stale_reviewed_at` 추가, `POST /leftovers/{leftover_id}/keep` 추가 |

> 이 변경은 manual UI/UX review plan 27번에 대한 사용자 승인 기반 server-sync 후속 구현이다.
> 시스템은 사용자 확인 없이 남은 요리를 자동 `eaten` 처리하지 않는다.
> `leftover_dishes.status`는 기존 공식 계약인 `leftover` / `eaten`만 유지한다.
> `계속 보관` 확인 상태는 `leftover_dishes.stale_reviewed_at` 서버 truth로 동기화한다.

## 404 Feedback Addendum `2026-06-20`

| 문서 | 변경 내용 |
|------|----------|
| 화면정의서 v1.5.18 | 전역 Not Found 상태에 복구 CTA와 인라인 피드백 입력/상태 표시 기준 추가 |
| API v1.2.20 | `POST /api/v1/feedback/404` 추가. 기존 `operational_events`에 `not_found_feedback` 이벤트로 저장하며 신규 DB table 없음 |

> 이 변경은 manual UI/UX review plan 3번에 대한 사용자 승인 기반 addendum이다.
> 404 피드백은 개인정보 입력을 유도하지 않고, 서버에서 이메일/URL/전화번호 패턴을 제거한 텍스트만 운영 이벤트로 저장한다.
> `operational_events` 기존 테이블을 재사용하므로 DB 설계 문서 버전 변경은 없다.

## Shopping Already-Have Pantry Reflection Addendum `2026-06-20`

| 문서 | 변경 내용 |
|------|----------|
| 요구사항 기준선 v1.7.11 | 장보기 완료 시 팬트리 반영 후보에 구매 체크 항목뿐 아니라 `이미있음`으로 표시한 팬트리 제외 항목을 포함 |
| 화면정의서 v1.5.18 | `SHOPPING_DETAIL` 완료 팝업 표시 대상을 구매 체크 항목 + `이미있음` 항목으로 갱신하고 버튼/설명을 팬트리 “반영” 용어로 정리 |
| 유저플로우 v1.3.18 | 장보기 완료 flow에서 `is_pantry_excluded=true` 항목도 기본 반영 후보가 되며 기존 pantry row는 중복 INSERT하지 않는 흐름 추가 |
| DB v1.3.16 | `shopping_list_items.added_to_pantry` CHECK 의미를 구매 체크 항목 또는 `이미있음` 항목의 반영 처리로 완화 |
| API v1.2.20 | `POST /shopping/lists/{list_id}/complete`의 `add_to_pantry_item_ids` 기본값/선택값 후보 규칙에 `is_pantry_excluded=true` 항목 포함 |

> 이 변경은 manual UI/UX review plan 17번에 대한 사용자 승인 기반 contract-evolution addendum이다.
> `add_to_pantry_item_ids: []`는 계속 명시적 팬트리 미반영을 뜻한다.
> `is_checked=false AND is_pantry_excluded=false`인 미구매 구매 섹션 항목은 계속 반영 후보가 아니다.

## Recipe Tags Contract-Evolution `36a-recipe-tags-contract-evolution`

| 문서 | 변경 내용 |
|------|----------|
| 요구사항 기준선 v1.7.11 | 레시피 태그를 서버 자동 추천 + 사용자 검수 기능으로 승격. P0 의미 태그 36개, 사용자 자유 태그와 시스템 의미 태그 경계, HOME theme eligibility 정책 추가 |
| 화면정의서 v1.5.18 | HOME 제목+태그 검색, tag chip 정확 필터, MANUAL_RECIPE_CREATE/YT_IMPORT 태그 추천·검수 UI 추가 |
| 유저플로우 v1.3.18 | YouTube/manual 등록 중 서버 추천 태그 생성 → 사용자 검수 → canonical tag 저장 → `recipes.tags` projection 흐름 추가 |
| DB v1.3.16 | `tags`, `recipe_tags` additive table target 추가. `recipes.tags`는 projection으로 유지. projection writer와 search/theme index 기준 추가. 테이블 수 33→35 |
| API v1.2.20 | `GET /tags`, `POST /recipes/tag-suggestions` 추가. `GET /recipes?tag=<normalized_key>`, 제목+승인 tag 검색, YouTube/manual reviewed `tags` body 확장. 엔드포인트 수 69→71 |

> 이 변경은 `36a-recipe-tags-contract-evolution` contract-evolution이다.
> 서버 자동 태그 추천 기능은 유지한다. 사용자가 태그를 수정하지 않으면 서버 추천값을 저장한다.
> 사용자 자유 tag는 표시/검색 가능하지만 HOME theme seed로 자동 승격하지 않는다. HOME theme는 public/approved/theme_eligible system semantic/source tag만 사용한다.
> `recipes.tags`는 카드/레거시 응답용 projection이며 canonical truth는 `tags` / `recipe_tags`다.
> P0 `normalized_key`는 한글 key를 그대로 사용하고 자동 romanization을 하지 않는다.
> 구현 Stage 2/4는 이 contract-evolution이 main에 merge된 후 36b~36e로 분리해 시작한다.

## Planner Column Reorder Addendum `2026-06-16`

| 문서 | 변경 내용 |
|------|----------|
| 요구사항 기준선 v1.7.10 | SETTINGS 끼니 컬럼 관리 범위에 이름 변경/추가/삭제뿐 아니라 순서 변경을 포함 |
| 화면정의서 v1.5.17 | SETTINGS 컬럼 목록에서 드래그 핸들 또는 위/아래 이동 컨트롤로 순서 변경 가능, PLANNER_WEEK 표시 순서 반영 |
| 유저플로우 v1.3.17 | SETTINGS 순서 변경 flow와 `meal_plan_columns.sort_order` 업데이트 흐름 추가 |
| DB v1.3.15 | 신규 schema 없이 기존 `meal_plan_columns.sort_order`로 사용자별 0부터 연속 정렬 유지 |
| API v1.2.19 | `PATCH /planner/columns/{column_id}` body에 optional `sort_order` 허용. 신규 endpoint 없음, 엔드포인트 수 67 유지 |

> 이 변경은 사용자 승인에 따라 기존 구현과 공식 문서의 불일치를 닫는 contract-evolution addendum이다.
> `planner-column-customization` workpack은 순서 변경을 1차 범위 밖으로 보던 이전 문구를 철회하고, 이미 구현된 SETTINGS reorder를 공식 범위로 동기화한다.

## Growth Achievement Album Contract-Evolution `35a-growth-achievement-album-contract-evolution`

| 문서 | 변경 내용 |
|------|----------|
| 요구사항 기준선 v1.7.10 | §2-16 성장/업적 앨범 정책 추가: 퀘스트를 튜토리얼 전용으로 축소, tutorial category, category별 achievement threshold, achievement no-XP, `Clay`→`Titanium` 등급명 |
| 화면정의서 v1.5.17 | §19 MYPAGE 성장 UI를 profile header 내부 action button 구조로 갱신. 등급/업적/튜토리얼/알림 modal/bottom sheet, stamp grid, spoon grade asset 기준 추가 |
| 유저플로우 v1.3.17 | ⑪-b에 튜토리얼 업적 플로우, 업적 앨범 확인 플로우, notification priority 확장, silent backfill 흐름 추가 |
| DB v1.3.15 | `user_achievement_awards` additive table target 추가. `user_quest_progress`는 tutorial 호환 surface로 축소. notification type에 `achievement_unlocked` 추가. 테이블 수 32→33 |
| API v1.2.19 | `GET /users/me/gamification`에 `achievement_album`, tutorial category summary, spoon grade image fields additive 확장. 신규 endpoint 없음. 엔드포인트 수 67 유지 |

> 이 변경은 `35a-growth-achievement-album-contract-evolution` contract-evolution이다.
> 퀘스트는 신규/초기 사용자 튜토리얼 surface로 축소하고, 장기 목표는 업적 앨범으로 전환한다.
> 업적 달성은 XP를 추가 지급하지 않는다. XP source와 cap은 34b 성장 backend model 계약을 유지한다.
> 기존 `quests` API field는 호환성을 위해 유지하되 standard quest expansion은 중단한다.
> 35c review-loop amendment: 퀘스트 완료는 업적 앨범 tutorial 상태로만 표시하고 `quest_completed` notification row/toast는 만들지 않는다. 기존 `quest_completed` notification row는 cleanup migration으로 제거한다.
> 기존 유저 backfill은 achievement state만 조용히 반영하고 historical toast/archive row를 만들지 않는다.
> 구현 Stage 2/4는 이 contract-evolution이 main에 merge된 후 35b/35c로 분리해 시작한다.

## Growth Leveling Follow-up Contract-Evolution `34a-growth-model-contract-evolution`

| 문서 | 변경 내용 |
|------|----------|
| 요구사항 기준선 v1.7.9 | §2-16 성장/레벨링 v2 정책 추가: `planner_registered` XP source, 첫/반복 XP 분리와 cap, non-XP activity ledger, level curve v2, 등급명, 알림 우선순위, backfill no-toast, 장보기 list/bundle count 분리 |
| 화면정의서 v1.5.16 | §19 MYPAGE 성장 UI를 프로필 영역 통합 방향으로 갱신, toast stack/archive preview/locked badge hint/badge shape/장보기 안내 문구 추가 |
| 유저플로우 v1.3.16 | ⑪-a/⑪-b에 플래너 등록 XP, non-XP activity, priority toast stack, archive 조회, 장보기 리스트 기준/끼니 묶음 기준 분리 흐름 추가 |
| DB v1.3.14 | `user_progress_events` 확장, `user_growth_activity_events` 추가, `user_progress_summary.level_curve_version`, notification priority/channel/group/archive 필드 추가. 테이블 수 31→32 |
| API v1.2.18 | `GET /users/me/gamification` additive 확장, `GET /users/me/gamification/archive` 추가. `GET /users/me`와 `GET /users/me/progress` 경계 유지. 엔드포인트 수 66→67 |

> 이 변경은 `34a-growth-model-contract-evolution` contract-evolution이다.
> 33c의 “새 XP source 없음 / XP 배점 변경 없음” 제약은 34 시리즈 범위에서 명시적으로 대체된다.
> `GET /users/me`는 계속 profile/settings-only 계약을 유지한다. `GET /users/me/progress`는 progress-only 계약을 유지하며 badge/quest/toast/archive field를 포함하지 않는다.
> `user_growth_activity_events`는 XP를 주지 않는 배지/퀘스트/최근 성장 기록용 activity ledger이며, `user_progress_events`는 XP 지급 ledger로 유지한다.
> historical/backfill recompute는 기존 유저 레벨/상태 반영만 수행하고 toast/notification/archive row를 만들지 않는다.
> 경쟁 랭킹, 전체 순위, pressure streak, season reset, XP decay, loot-box/random reward는 계속 scope 밖이다.
> 구현 Stage 2/4는 이 contract-evolution이 main에 merge된 후에 시작한다.

## User Progress Gamification Contract-Evolution `33c-gamification`

| 문서 | 변경 내용 |
|------|----------|
| 요구사항 기준선 v1.7.8 | §2-16-a 사용자 성장/배지/퀘스트 정책 추가: 33a canonical XP source 유지, badge/quest/tutorial/notification server authority, XP toast failure isolation, competitive/pressure/loot 제외 |
| 화면정의서 v1.5.15 | §19 MYPAGE §1-b 사용자 성장/배지/퀘스트 표시 추가: 대표 배지 row, badge guide modal/bottom sheet, active quest, tutorial quest, XP toast 위치/상태/금지사항 |
| 유저플로우 v1.3.15 | §⑪-b gamification 확인/XP toast 흐름 추가: MYPAGE surface, source action 후 notification refresh, soft-fail/seen 처리 |
| DB v1.3.13 | §11-2c~e 테이블 3종 추가: `user_badge_awards`, `user_quest_progress`, `user_progress_notifications`. unique/idempotency/seen 인덱스 추가. 테이블 수 28→31 |
| API v1.2.17 | §12-10~12 `GET /users/me/gamification`, `POST /users/me/gamification/notifications/seen`, `POST /users/me/gamification/tutorial-quests/{quest_key}/dismiss` 추가. 엔드포인트 수 63→66 |

> 이 변경은 `33c-badges-quests-toasts-tutorial` Stage 2/4 구현의 선행 contract-evolution이다.
> `GET /users/me`는 프로필/설정-only 계약을 유지한다. `GET /users/me/progress`는 33a response shape를 유지하며 badge/quest/toast/tutorial field를 포함하지 않는다.
> 33c는 33a의 4개 canonical event만 XP source로 사용한다. 새 XP source, 경쟁 랭킹, pressure streak, season reset, loot-box/random reward는 포함하지 않는다.
> badge/quest/notification projection 실패는 원래 source action 성공을 실패로 바꾸지 않는다.
> 구현(Stage 2)은 이 contract-evolution이 main에 merge된 후에 시작한다.

## User Progress Foundation Contract-Evolution `user-progress 예정`

| 문서 | 변경 내용 |
|------|----------|
| 요구사항 기준선 v1.7.7 | §2-16 사용자 진도 추적 정책 추가: 4개 canonical event, 전용 ledger/read model, `GET /users/me/progress` 전용 API, soft-fail, survivor-only backfill, leaderboard/streak/loot 제외 |
| 화면정의서 v1.5.14 | §19 MYPAGE §1-a 사용자 진도 표시(compact) 추가: progress subtitle/bar, soft-fail, 하드코딩 레벨 문구 제거, compact-only 제약 |
| 유저플로우 v1.3.14 | §⑪-a 사용자 진도 확인 서브플로우 추가: MYPAGE 계정 섹션 내 progress compact display, XP source events, 에러 처리, 화면↔여정 매핑 갱신 |
| DB v1.3.12 | §11-2 사용자 진도 테이블 2종 추가: `user_progress_events`(전용 ledger), `user_progress_summary`(projection/read model). canonical event map, backfill policy, 인덱스 추가. 테이블 수 26→28 |
| API v1.2.16 | §12-9 `GET /users/me/progress` 추가. `GET /users/me`는 profile/settings-only 유지. 33a response shape 확정. 33a non-fields(badge/quest/toast/timeline) 명시. 엔드포인트 수 v1.2.17 예정: 62→63 (1개 추가) |

> 이 변경은 `33a-user-progress-foundation`, `33b-mypage-progress-ui`, `33c-badges-quests-toasts-tutorial` 3개 slice의 선행 contract-evolution이다.
> `GET /users/me`는 프로필/설정-only 계약을 유지한다. progress 필드를 `/users/me`에 섞지 않는다.
> `operational_events`는 운영 로그이며, 사용자 보상 truth로 재사용하지 않는다.
> legacy backfill은 surviving rows 기준 lower-bound이다. 삭제된 활동은 복원됐다고 주장하지 않는다.
> 33a에 badge, quest, toast, tutorial, timeline, public backfill API는 포함하지 않는다.
> 구현(Stage 2)은 이 contract-evolution이 main에 merge된 후에 시작한다.

## Recipebook Diary Addendum (2026-06-10)

| 문서 | 변경 내용 |
|------|----------|
| 요구사항 기준선 v1.7.7 | 레시피북 리더에서 소유 레시피북의 재료/만들기를 읽기 전용으로 표시하고, 리더 상세 조회는 `view_count`를 증가시키지 않는 기준 추가 |
| 화면정의서 v1.5.14 | 마이페이지 레시피북 책장/인라인 상세, 커스텀 책 색상/커버 이미지 변경, 모바일 목차 중심 상세 기준 추가 |
| 유저플로우 v1.3.14 | 레시피북 리더가 목차 선택 후 재료/만들기를 표시하는 흐름으로 갱신 |
| DB v1.3.12 | `recipe_books.cover_color_key`, `recipe_books.cover_image_url` additive metadata 추가 |
| API v1.2.16 | `GET /recipe-books/{book_id}/recipes/{recipe_id}` read-only 리더 상세 endpoint와 레시피북 커버 메타데이터 필드 추가 |

> 이 변경은 사용자 승인(2026-06-10)에 따른 레시피북 다이어리/리더 contract-evolution이다.
> 레시피북 리더 상세 조회는 `GET /recipes/{id}`를 대체 호출하지 않으며 조회수를 증가시키지 않는다.
> 커버 메타데이터는 UI 표시용이며 저장 가능한 레시피북 타입과 권한 정책을 변경하지 않는다.

## v1.7.6 / v1.5.13 / v1.3.13 → v1.7.7 / v1.5.14 / v1.3.14 변경 이력 (2026-06-09)

| 문서 | 변경 내용 |
|------|----------|
| 요구사항 기준선 v1.7.7 | COOK_MODE를 현재 단계 중심에서 전체 재료 + 전체 조리순서 whole-board 모드로 변경. 단계 이동, 현재 단계 재료량 보드, 단계별 재료/불세기/조리시간 기본 표시 제거 |
| 화면정의서 v1.5.14 | COOK_MODE 재료 보드/조리순서 보드, 브랜드 파란색 수량·번호 박스, 조리방법 태그 위치, 실제 wake lock 활성 상태 표시 기준 추가 |
| 유저플로우 v1.3.14 | 플래너 경유와 독립 요리 COOK_MODE 흐름을 whole-board 확인 흐름으로 갱신 |
| DB v1.3.12 | 변경 없음 |
| API v1.2.16 | 변경 없음 |

> 이 변경은 사용자 승인(2026-06-09)에 따른 COOK_MODE whole-board UI contract-evolution이다.
> 기존 cook-mode 조회/완료/취소 API와 DB 상태 전이 계약은 변경하지 않는다.

## v1.7.5 / v1.5.12 / v1.3.12 / DB v1.3.11 / API v1.2.15 → v1.7.6 / v1.5.13 / v1.3.13 / DB v1.3.12 / API v1.2.16 변경 이력 (2026-06-09)

| 문서 | 변경 내용 |
|------|----------|
| 요구사항 기준선 v1.7.6 | 재료 taxonomy v2 목표를 8대분류/21소분류로, 조리방법 taxonomy v2 목표를 6그룹/20대표 method로 확정. v1 category label 8종 호환 유지 |
| 화면정의서 v1.5.13 | HOME/PANTRY/직접등록/YT_IMPORT/상세/요리모드의 v2 표시 기준과 v1 label fallback, `씻기` 제외/`에어프라이어` 포함 표시 기준 추가 |
| 유저플로우 v1.3.13 | 재료 등록·검색·필터와 조리방법 선택·검수 흐름에 v2 mapping과 migration fallback 추가 |
| DB v1.3.12 | `ingredient_category_groups`, `ingredient_categories`, `ingredients.category_code`, `cooking_method_categories`, `cooking_methods.category_code`, `cooking_method_synonyms` additive migration target 추가 |
| API v1.2.16 | `GET /ingredients`, `POST /recipes/youtube/ingredient-registration`, `GET /cooking-methods`에 v2 optional field 계약 추가. 기존 endpoint 수와 v1 query/body/응답 shape 호환 유지 |

> 이 변경은 `docs/workpacks/taxonomy-v2-contract-evolution` contract-evolution이다.
> 계획대로 진행하면 전체 재료 카테고리는 사용자-facing 대분류 8개, 내부 소분류 21개가 된다.
> 조리방법은 6그룹, 20대표 method가 된다.
> `씻기`는 canonical method에서 제외하고, `에어프라이어`는 canonical method에 포함한다.
> v2 taxonomy는 additive migration으로 시작한다. `ingredients.category`, `GET /ingredients?category=<v1 label>`, YouTube ingredient registration의 v1 `category` body는 migration 동안 유지한다.
> 운영 DB 재분류는 idempotent migration과 review 가능한 mapping 근거가 있을 때만 수행하며, 외부 데이터 production 직적재는 계속 금지한다.

## Ingredient Fruit Category Addendum (2026-06-08)

| 문서 | 변경 내용 |
|------|----------|
| 요구사항 기준선 v1.7.5 | 재료 카테고리 v1 canonical을 기존 7종에서 `과일` 포함 8종으로 확장 |
| 화면정의서 v1.5.12 | HOME/PANTRY/YT_IMPORT/직접등록 재료 category 선택지에 `과일` 추가 |
| 유저플로우 v1.3.12 | YouTube/직접등록/팬트리/HOME 흐름의 재료 category 확인 기준을 8종으로 갱신 |
| DB v1.3.11 | `ingredients.category` 허용 설명에 `과일` 추가, 기존 과일 seed/운영 row는 `과일`로 재분류 |
| API v1.2.15 | `GET /ingredients?category=`와 YouTube ingredient registration category 계약에 `과일` 추가 |

> 이 변경은 사용자 승인 요청(2026-06-08)에 따른 category expansion follow-up이다.
> 신규 `ingredient_categories` DB table/FK 전환은 계속 scope 밖이며, 기존 `ingredients.category` 문자열과 shared mapping source를 유지한다.
> 기존 DB에 `딸기`, `생딸기`, `사과`, `바나나`, `레몬`, `라임`, `오렌지`, `귤`, `배`, `키위`, `복숭아`, `포도`, `블루베리`, `망고`가 있으면 `과일`로 재분류한다.

## v1.7.4 / v1.5.11 / v1.3.11 / DB v1.3.10 / API v1.2.14 → v1.7.5 / v1.5.12 / v1.3.12 / DB v1.3.11 / API v1.2.15 변경 이력 (2026-06-02)

| 문서 | 변경 내용 |
|------|----------|
| 요구사항 기준선 v1.7.5 | 공개 텍스트 추출 이후 조건부 `visual_quantity_extractor` enrichment 단계 추가, `YoutubeQuantitySource` enum, `quantity_confirmation_status` register 검증, `recipe_sources.extraction_methods` mismatch 정리 |
| 화면정의서 v1.5.12 | YT_IMPORT 검수 화면에 수량 provenance 배지, confirm/edit/clear 인터랙션, quick import 수량 리뷰 차단 추가 |
| 유저플로우 v1.3.12 | extract 후 visual quantity enrichment 흐름, 검수 화면 수량 확인 인터랙션, quick import review-required fallback 분기 추가 |
| DB v1.3.11 | `youtube_visual_extraction_cache`, `youtube_visual_extraction_events` 서버 전용 테이블 추가, `recipe_sources.extraction_methods` 설명을 실제 YouTube session 값에 맞게 정리 |
| API v1.2.15 | extract 응답 `ingredients[]`에 `quantity_*` review fields 추가, register에 `quantity_confirmation_status` 검증 추가, `source_providers`에 `visual_quantity_extractor` 계약 추가 |

> 이 변경은 `docs/workpacks/32-youtube-visual-quantity-enrichment` contract-evolution이다.
> visual enrichment는 원천 extraction method가 아니라 보조 enrichment이므로 `extraction_methods`는 `description | comment | caption`만 유지한다.
> `recipe_inferred` 수량은 사용자 확인 없이 register/quick auto-register할 수 없다.
> raw video, raw frame, raw provider response, API key, secret, 레시피오 data는 저장/반환하지 않는다.
> selected-frame OCR, Cloud Vision, ASR/STT는 v1 out of scope이다.

## v1.7.3 / v1.5.10 / v1.3.10 / DB v1.3.9 / API v1.2.13 → v1.7.4 / v1.5.11 / v1.3.11 / DB v1.3.10 / API v1.2.14 변경 이력 (2026-05-30)

| 문서 | 변경 내용 |
|------|----------|
| 요구사항 기준선 v1.7.4 | YouTube 등록 시 세션 썸네일을 `recipes.thumbnail_url`에 서버 측 복사, 직접 등록 이미지 업로드 정책, 공유 결정론 태그 생성기 정책 추가 |
| 화면정의서 v1.5.11 | RECIPE_DETAIL 썸네일 source note/placeholder, HOME/상세 태그 표시, MANUAL_RECIPE_CREATE 이미지 업로드, YT_IMPORT 썸네일/태그 preview 추가 |
| 유저플로우 v1.3.11 | YouTube register와 직접 등록에서 `thumbnail_url`/`tags`가 `recipes`에 저장되는 흐름 추가 |
| DB v1.3.10 | 기존 `recipes.thumbnail_url`/`recipes.tags` 활용 계약, `recipe-images` Storage bucket/policy 추가. 신규 recipe image/tag table은 scope 밖 |
| API v1.2.14 | `POST /api/v1/recipes/images` 추가, YouTube extract/register thumbnail/tags 계약, manual `POST /recipes` image reference 검증과 server-generated tags 계약 추가 |

> 이 변경은 `docs/workpacks/31-recipe-media-tags` contract-evolution이다.
> YouTube 썸네일은 다운로드/리호스팅하지 않고 원본 URL을 보존한다.
> 이미지 바이너리는 DB에 저장하지 않으며, 생성/AI 이미지 fallback과 정규화 tag table은 MVP scope 밖이다.

## YouTube Multi-Recipe Caption Addendum (2026-05-30)

| 문서 | 변경 내용 |
|------|----------|
| 요구사항 기준선 v1.7.3 | 한 영상에 여러 요리가 있는 경우 공개 자막/설명/작성자 댓글에서 후보를 분리하고 사용자가 저장할 후보를 선택해야 함을 추가 |
| 화면정의서 v1.5.10 | YT_IMPORT 검수 화면에 요리 후보 목록과 후보 선택 로딩/오류 상태 추가 |
| 유저플로우 v1.3.10 | extract에서 `multi_parent` 세션과 후보 ledger를 만들고, 후보 선택 후 `candidate_child` 세션으로 register하는 흐름 추가 |
| DB v1.3.9 | `youtube_extraction_sessions.session_kind`, parent 참조 컬럼, `youtube_extraction_candidates` 후보 ledger 추가 |
| API v1.2.13 | extract 응답에 `multi_recipe_status`, `recipe_candidates[]`, source segment metadata 추가, `POST /recipes/youtube/candidate-drafts` 추가 |

> v1.7.4 / v1.5.11 / v1.3.11 / DB v1.3.10 / API v1.2.14는 이 addendum을 포함한 v1.7.3 계열 문서를 기준으로 작성한다.
> 특정 video_id별 결과 fixture, 레시피오 결과 반환은 금지한다. 공개 텍스트 provider/parser를 우선 사용하고, 아래 Gemini addendum의 조건을 만족하는 경우에만 구조화 fallback을 허용한다.

## Gemini YouTube Structured Fallback Addendum (2026-06-01)

| 문서 | 변경 내용 |
|------|----------|
| 요구사항 기준선 v1.7.4 | 설명란/작성자 댓글/caption parser가 재료 또는 조리 단계를 충분히 만들지 못하거나 자막/전사 parser 결과가 대화 파편 중심으로 저품질일 때 env/한도/cache/근거 검증 기반 Gemini structured fallback 허용 |
| 화면정의서 v1.5.11 | YT_IMPORT 처리 파이프라인에 Gemini 구조화 보조 단계를 추가하되 source label은 설명란/작성자 댓글/자막으로 유지 |
| 유저플로우 v1.3.11 | extract 단계에서 공개 텍스트 파싱 후 부족한 경우 Gemini JSON 구조화 보조를 거치는 흐름 추가 |
| DB v1.3.10 | `youtube_llm_extraction_cache`, `youtube_llm_extraction_events` 서버 전용 cache/event 테이블 추가 |
| API v1.2.14 | `source_providers`의 `gemini_structured_extractor`, `gemini_structured_extractor_cache`와 `extraction_meta_json.llm_extractor.parser_quality` 포함 provenance 계약 추가 |

> Gemini는 원천 source가 아니라 이미 수집한 공개 텍스트를 정리하는 보조 extractor다. `extraction_methods`는 `description` / `comment` / `caption`만 유지한다.
> API key, provider raw response, secret, 레시피오 결과, 영상별 fixture는 저장하거나 반환하지 않는다.

## v1.7.2 / v1.5.9 / v1.3.9 / DB v1.3.8 / API v1.2.12 → v1.7.3 / v1.5.10 / v1.3.10 / DB v1.3.9 / API v1.2.13 변경 이력 (2026-05-28)

| 문서 | 변경 내용 |
|------|----------|
| 요구사항 기준선 v1.7.3 | YouTube 추출/등록의 ingredient/step `component_label` 영속화, 상세/요리모드 섹션 소제목 표시, manual create 비확장 명시 |
| 화면정의서 v1.5.10 | YT_IMPORT 검수, RECIPE_DETAIL, COOK_MODE의 인접 label heading 규칙과 중복 prefix 억제 규칙 추가 |
| 유저플로우 v1.3.10 | extract → review → register → DB → detail/cook-mode까지 `component_label` 보존 흐름 추가 |
| DB v1.3.9 | `recipe_ingredients.component_label`, `recipe_steps.component_label` nullable 컬럼 추가 |
| API v1.2.13 | `POST /recipes/youtube/extract`, `POST /recipes/youtube/register`, recipe detail, cook-mode 응답에 nullable `component_label` 추가. `POST /recipes` manual body는 no-`component_label`로 분리 |

> 이 변경은 `docs/workpacks/28-youtube-section-label-persistence` contract-evolution이다.
> `component_label`은 표시용 metadata이며 shopping aggregation, manual create authoring, pantry consumed checklist semantics는 변경하지 않는다.

## Low-cost YouTube Transcript Fallback Addendum (2026-05-30)

| 문서 | 변경 내용 |
|------|----------|
| 요구사항 기준선 v1.7.3 | YouTube extract가 설명란/작성자 댓글만으로 부족할 때 transcript cache → 공개 timedtext → cookie retry → 제한적 Apify fallback 순서로 자막/전사를 보완할 수 있음을 명시. paid fallback은 env/일일 한도 없이는 비활성화 |
| API v1.2.13 | §6 공통 정책에 transcript fallback 순서, Apify env, secret logging 금지, `source_providers`/`transcript_provider` provenance 계약 추가 |
| DB v1.3.9 | `youtube_transcript_cache`, `youtube_transcript_fetch_events` 서버 전용 테이블 추가. 90일 TTL cache와 provider/user daily limit 집계를 지원 |

> 이 addendum은 무료 공개 텍스트를 먼저 쓰고 실패 시에만 제한적 유료 transcript API를 쓰기 위한 contract-evolution이다.
> 오디오 STT/Whisper, 로그인/소유자 전용 caption download, 영상 ID별 fixture 반환은 범위 밖이다.

## Recipio-style YouTube Import Parity Addendum (2026-05-28)

| 문서 | 변경 내용 |
|------|----------|
| 요구사항 기준선 v1.7.2 | §2-4에 레시피오형 빠른 유튜브 가져오기 모드 추가: 중복 확인 → 미리보기 → 비동기 진행률 → 자동 등록, 단 검수 필요 draft는 기존 YT_IMPORT 검수 화면으로 fallback |
| 화면정의서 v1.5.9 | §10에 `/recipes/new/youtube` 별도 진입면, 추천 영상 카드, 중복 카드, 진행률, 검수 fallback 상태 추가 |
| 유저플로우 v1.3.9 | ⑨에 Quick Import 분기 추가: `GET /recipes/youtube/recipio/check`로 중복 확인 후 기존 validate/extract/register 계약 재사용 |
| API v1.2.12 | §6-5 `GET /api/v1/recipes/youtube/recipio/check` 추가. 새 저장 계약은 만들지 않고 기존 §6-1/6-2/6-4를 순차 소비 |
| DB v1.3.8 | 변경 없음. `recipe_sources.youtube_video_id`와 기존 `youtube_extraction_sessions`/RPC를 재사용 |

> 이 addendum은 사용자가 승인한 레시피오형 UX flow parity 구현이다.
> 신규 LLM/이미지 생성/유료 provider 계약은 추가하지 않는다.
> quick import는 기존 YouTube import feature flag/auth guard를 그대로 따른다.
> 2026-05-29 clarification: 여기서 parity는 UX flow parity만 의미한다. 특정 YouTube video_id별로 레시피오 생성 데이터를 코드 fixture로 반환하는 shortcut은 금지하며, 중복 확인을 제외한 신규 추출은 항상 provider/parser 경로를 거친다.

## v1.7.1 / v1.5.8 / v1.3.8 / DB v1.3.7 / API v1.2.11 → v1.7.2 / v1.5.9 / v1.3.9 / DB v1.3.8 / API v1.2.12 변경 이력 (2026-05-27)

| 문서 | 변경 내용 |
|------|----------|
| 요구사항 기준선 v1.7.2 | §1-11 내부 운영 관리 (Admin Foundation) 추가: 읽기 전용 MVP 범위, admin_members 기반 접근 제어, PII 최소화, 운영 이벤트/감사 로깅 정책. §2-14 관리자 접근 정책 추가 |
| 화면정의서 v1.5.9 | Admin Foundation 화면 4종 추가: ADMIN_DASHBOARD, ADMIN_USERS, ADMIN_EVENTS, ADMIN_AUDIT_LOGS. 각 화면 loading/empty/error/read-only/unauthorized/forbidden(403) 상태 정의 |
| 유저플로우 v1.3.9 | ⑫ 내부 운영 관리 플로우 추가: 관리 대시보드 진입, 사용자 목록 조회, 운영 이벤트 조회, 감사 로그 조회. 화면↔여정 매핑 테이블에 Admin 4화면 추가 |
| DB v1.3.8 | §12 Admin Foundation 테이블 3종 추가: admin_members (관리자 신원), operational_events (시스템 운영 이벤트), admin_audit_logs (관리자 감사 로그). service-role 전용 RLS, 인덱스 정의 |
| API v1.2.12 | Admin Foundation 엔드포인트 3종 추가: `GET /api/v1/admin/users`, `GET /api/v1/admin/operational-events`, `GET /api/v1/admin/audit-logs`. createServiceRoleClient() 필수, 감사 로그 기록, PII 최소화. 엔드포인트 수 55 → 58 |

> 이 변경은 Admin Foundation (내부 운영 관리 기반) contract-evolution이다.
> 런칭 초기 운영에 필요한 최소한의 내부 관리 기반을 공식 문서 5종에 추가한다.
> MVP 범위는 읽기 전용이며, 파괴적 관리 동작(사용자 정지·삭제·수정, 레시피 삭제 등)은 scope 밖이다.
> 모든 admin API는 `createServiceRoleClient()` 필수, `routeClient` 폴백 금지, service-role 부재 시 fail closed.
> admin_members 최초 등록은 Supabase SQL/service-role로 직접 수행하며, 환경변수 허용목록 우회 없음.
> 구현(Stage 2)은 별도 Stage 1 workpack/acceptance re-lock PR이 main에 merge되고 pending recheck가 해소될 때까지 시작하지 않는다.

## v1.7.0 / v1.5.7 / v1.3.7 / DB v1.3.6 / API v1.2.10 → v1.7.1 / v1.5.8 / v1.3.8 / DB v1.3.7 / API v1.2.11 변경 이력 (2026-05-25)

| 문서 | 변경 내용 |
|------|----------|
| 요구사항 기준선 v1.7.1 | slice27 선행 taxonomy contract lock: legacy 7 ingredient category freeze, additive shadow taxonomy 원칙, cooking method optional metadata, `label` non-overload, external data staging-only gate 명시 |
| 화면정의서 v1.5.8 | HOME/PANTRY/YT_IMPORT 화면의 category 선택지는 legacy 7종 label 유지, 조리방법 label/color_key 소비 유지, 외부 데이터 자동 직수입 금지 명시 |
| 유저플로우 v1.3.8 | YouTube/직접등록/팬트리/HOME 흐름에서 legacy category와 shared mapping source 원칙, 외부 데이터 staging/review/approved seed gate 명시 |
| DB v1.3.7 | schema DDL 없이 `ingredients.category` legacy 7종 유지, ingredient registry/FK cutover 제외, `cooking_methods.label` taxonomy 과적재 금지, 외부 raw data production 직적재 금지 명시 |
| API v1.2.11 | `GET /ingredients?category=`와 `POST /recipes/youtube/ingredient-registration.category`는 legacy 7종 label 계약 유지. `GET /cooking-methods` v1 shape 유지, endpoint 수 55개 유지 |

> 이 변경은 `pre-27-taxonomy-consumer-alignment` Phase 1 Contract Lock 보강이다.
> slice27 YouTube 개선 전까지 “현재 MVP 소비 경로는 legacy 7 category + shared mapping/helper를 사용한다”는 계약을 공식 문서 5종에 고정한다.
> 2026-06-08 Ingredient Fruit Category Addendum이 category count만 `과일` 포함 8종으로 supersede한다. shared mapping/helper, 신규 DB registry table 제외, 외부 데이터 staging-only 원칙은 그대로 유지한다.
> 식약처/농식품올바로 등 외부 데이터 ingestion runtime은 이 변경의 범위 밖이며, production 직적재는 금지된다.

## v1.6.9 / v1.5.6 / v1.3.6 / DB v1.3.5 / API v1.2.9 → v1.7.0 / v1.5.7 / v1.3.7 / DB v1.3.6 / API v1.2.10 변경 이력 (2026-05-24)

| 문서 | 변경 내용 |
|------|----------|
| 요구사항 기준선 v1.7.0 | §2-9 회원 탈퇴 정책: 사용자 개인 기록은 삭제하고, 직접/유튜브로 등록한 레시피는 작성자 정보 없이 보존. 동일 소셜 계정 재로그인 시 이전 개인 기록이 보이지 않아야 함 |
| 화면정의서 v1.5.7 | SETTINGS 회원 탈퇴 확인 문구와 성공 후 HOME 이동/재로그인 기대 결과를 새 삭제 정책에 맞게 정리 |
| 유저플로우 v1.3.7 | MYPAGE → SETTINGS → 회원탈퇴 flow에 private data cleanup, authored recipe anonymize 보존, 새 bootstrap 재로그인 상태 추가 |
| DB v1.3.6 | `delete_user_private_data(p_user_id)` RPC 추가. `users` 삭제 cascade로 개인 데이터 정리, `recipes.created_by`는 `ON DELETE SET NULL`, save/like count 재계산 |
| API v1.2.10 | `DELETE /users/me` 동작을 soft-delete에서 private data cleanup으로 변경. 엔드포인트 수 55개 유지 |

> 이 변경은 RC-MO-06 account deletion/rejoin evidence에서 확인된 “탈퇴 후 재로그인 시 기존 저장/플래너 데이터가 유지됨” 문제를 닫기 위한 contract-evolution이다.
> release 전 visible delete-account action의 안내 문구와 실제 데이터 정책을 일치시킨다.

## API v1.2.8 → API v1.2.9 변경 이력 (2026-05-23)

| 문서 | 변경 내용 |
|------|----------|
| API v1.2.9 | `POST /auth/login`, `PATCH /auth/profile` 제거. 현재 웹 로그인은 Supabase OAuth callback을 사용하고, 닉네임 설정/변경은 `PATCH /users/me`가 담당한다. 엔드포인트 전체 목록 active method/path 수를 55개로 정리 |

> 이 변경은 MVP 1 계약 위험 잠금 중 `CR-002` contract-evolution이다.
> 두 endpoint는 route와 테스트는 있었지만 현재 웹 화면에서 직접 소비하지 않았다.
> 구현을 보존해 unused public auth surface를 늘리는 대신 공식 API 계약과 route/test를 함께 정리한다.

## API v1.2.7 → API v1.2.8 변경 이력 (2026-05-22)

| 문서 | 변경 내용 |
|------|----------|
| API v1.2.8 | `POST /auth/refresh` 제거. 현재 인증 세션 갱신은 Supabase SDK / `@supabase/ssr` 세션 관리에 위임하며, 실제 route/화면/테스트 소비자가 없는 public refresh endpoint를 새로 만들지 않음. 엔드포인트 전체 목록 active method/path 수를 57개로 정리 |

> 이 변경은 MVP 1 계약 위험 잠금 중 `CR-001` contract-evolution이다.
> `docs/api문서-v1.2.7.md`에는 `POST /auth/refresh`가 남아 있었지만 `app/api/v1/auth/refresh/route.ts`, 화면 호출, 테스트가 없었다.
> 구현을 추가하지 않고 공식 API 계약에서 제거해 실제 인증 구조와 문서 계약을 맞춘다.

## v1.6.8 / v1.5.5 / v1.3.5 / DB v1.3.4 / API v1.2.6 → v1.6.9 / v1.5.6 / v1.3.6 / DB v1.3.5 / API v1.2.7 변경 이력 (2026-05-22)

| 문서 | 변경 내용 |
|------|----------|
| 요구사항 기준선 v1.6.9 | §2-4 유튜브 레시피 추출 정책: DB에 없는 재료를 사용자 확인 후 새 표준 재료로 등록하는 흐름, `draft_ingredient_id`, RPC 기반 ingredient/synonym 등록, client-side resolved 전환 정책 추가 |
| 화면정의서 v1.5.6 | §10 YT_IMPORT: unresolved / needs_review 재료 row에 [새 재료로 등록] fallback 추가, 등록 sheet/modal, 성공/실패 상태, `draft_json` 불변 정책 명시 |
| 유저플로우 v1.3.6 | ⑨ 유튜브 등록 여정: 검수 단계의 검색 교체 / 새 재료 등록 분기, `POST /recipes/youtube/ingredient-registration`, 데이터 변화에 ingredients/ingredient_synonyms 추가 |
| DB v1.3.5 | `youtube_extraction_sessions.draft_json.ingredients[]`의 `draft_ingredient_id` 계약, `register_youtube_ingredient(...)` RPC, ambiguous synonym best-effort skip 정책 추가 |
| API v1.2.7 | §6: extract ingredient 응답에 `draft_ingredient_id` 추가, §6-3 `POST /recipes/youtube/ingredient-registration` 신규, 기존 register를 §6-4로 이동, 엔드포인트 목록 갱신 |

> 이 변경은 슬라이스 22 YouTube 미등록 재료 등록 contract-evolution이다.
> 매번 migration으로 신규 재료를 추가하지 않고, YT_IMPORT 검수 단계에서 사용자 확인 후 `ingredients` / `ingredient_synonyms`를 안전하게 갱신하는 경로를 공식화한다.
> 새 등록은 자동 실행하지 않으며, session 소유권·만료·`draft_ingredient_id`를 검증한다. registration API는 session `draft_json`을 수정하지 않고, 클라이언트가 현재 검수 row를 `resolved`로 전환한다.

## v1.6.7 / v1.5.4 / v1.3.4 / DB v1.3.3 / API v1.2.5 → v1.6.8 / v1.5.5 / v1.3.5 / DB v1.3.4 / API v1.2.6 변경 이력 (2026-05-21)

| 문서 | 변경 내용 |
|------|----------|
| 요구사항 기준선 v1.6.8 | §2-4 유튜브 레시피 등록: oEmbed 미리보기 후 extract 단계에서 3-way classification(recipe/uncertain/non_recipe), YouTube Data API videos.list 기반 실제 추출, 서버 세션 관리(24h TTL), ingredient resolution_status, step incomplete detection, 원자적 RPC 등록, provenance session FK |
| 화면정의서 v1.5.5 | §10 YT_IMPORT: oEmbed 미리보기, extract 단계 3-way classification UI(uncertain 경고/non_recipe 차단), indeterminate progress, ingredient resolution_status 배지, step incomplete_fields blocking/warning, 저장 활성화 조건, 세션 기반 원자적 등록 |
| 유저플로우 v1.3.5 | ⑨ 유튜브 등록 여정: oEmbed 미리보기, extract 단계 classification 분기, description-first 추출 + 세션 생성, resolution/incomplete 검수, RPC 등록 + 소유권 검증, 데이터 변화 테이블에 youtube_extraction_sessions 추가 |
| DB v1.3.4 | §4-2 youtube_extraction_sessions 신규 테이블 추가(classification, extracted_data, status, 24h TTL). §4-3 recipe_sources에 youtube_extraction_session_id FK 추가 |
| API v1.2.6 | §6 전면 개정: validate는 oEmbed 미리보기 + uncertain 반환, extract는 videos.list 기반 classification/session_id/resolution_status/incomplete_fields/draft_warnings, register는 session_id 기반 소유권/만료/소비 검증 + 에러 코드(404/409/410/422), provider 에러(502/429), feature flag(404 FEATURE_DISABLED) |

> 이 변경은 슬라이스 20 YouTube 실제 API description-first 추출 contract-evolution이다.
> 슬라이스 19의 deterministic stub 추출을 실제 YouTube Data API videos.list 기반으로 교체하고, validate 단계는 quota를 쓰지 않는 oEmbed 미리보기로 제한하며, 서버 세션 관리·ingredient resolution·step incomplete·원자적 RPC 등록·provenance session FK를 도입한다.
> 공개 작성자 댓글과 공개 caption timedtext는 description-first 보조 source로 허용하며, extraction_methods 배열에는 `description`, `comment`, `caption`만 기록한다. ASR/LLM/OCR/추정 레이어는 scope 밖이다.

## v1.6.6 / v1.5.3 / v1.3.3 / API v1.2.4 → v1.6.7 / v1.5.4 / v1.3.4 / API v1.2.5 변경 이력 (2026-05-18)

| 문서 | 변경 내용 |
|------|----------|
| 요구사항 기준선 v1.6.7 | PL-03: `MEAL_SCREEN`에서 `shopping_done` 상태 개별 식사에 `[요리하기]` 단축 경로 추가. `registered` 상태는 대상 제외(장보기 우회 불가). 독립 요리 시맨틱 변경 없음 |
| 화면정의서 v1.5.4 | `MEAL_SCREEN` §6에 개별 식사 `[요리하기]` 버튼 정의 추가. `COOK_MODE` §14에 MEAL_SCREEN 복귀 경로 추가 |
| 유저플로우 v1.3.4 | ③ 식단 계획 여정에 `MEAL_SCREEN → COOK_MODE → MEAL_SCREEN` 경로 추가. ⑤ 요리하기 여정에 ⑤-b 개별 식사 단축 경로 추가 |
| DB v1.3.3 (유지) | 변경 없음 — 기존 `cooking_sessions`, `cooking_session_meals`, `meals` 테이블 구조 그대로 사용 |
| API v1.2.5 | 9-2 `POST /cooking/sessions`의 허용 호출자에 `MEAL_SCREEN` 추가. 단일 `meal_id`로 호출하는 사용 패턴 공식화. 신규 엔드포인트 없음, 서버 검증 변경 없음 |

> 이 변경은 사용자 승인(2026-05-18)을 기반으로 한 PL-03 MEAL_SCREEN 개별 식사 요리하기 단축 경로 contract-evolution이다.
> 기존 `POST /cooking/sessions` 계약을 `MEAL_SCREEN`에서 단일 meal_id로 호출하는 planner 세션 단축 경로를 공식화한다.
> `registered` → `cook_done` 전이는 금지되며, `shopping_done`을 거친 식사만 대상이다.

## v1.6.5 / v1.5.2 / v1.3.2 / DB v1.3.2 / API v1.2.3 → v1.6.6 / v1.5.3 / v1.3.3 / DB v1.3.3 / API v1.2.4 변경 이력 (2026-05-12)

| 문서 | 변경 내용 |
|------|----------|
| 요구사항 기준선 v1.6.6 | Wave1 prototype parity 결정 반영: HOME 최신순, SavePopup multi-save, 장보기 기록 다시열기, 남은요리/레시피북 상세 메타 확장, prototype visual 우선 |
| 화면정의서 v1.5.3 | HOME 정렬 옵션, SavePopup multi-select, LoginGateModal visual/behavior 경계, 장보기 기록 `다시열기`, LEFTOVERS/ATE_LIST/RECIPEBOOK_DETAIL 카드 메타 확정 |
| 유저플로우 v1.3.3 | 탐색 정렬, multi-save, 장보기 기록 read-only reopen, 남은요리/레시피북 상세 메타 flow 갱신 |
| DB v1.3.3 | `leftover_dishes.cooking_servings` 추가, HOME 최신순/남은요리 메타 조회 인덱스 추가, 기존 `completed_at` 재사용 명시 |
| API v1.2.4 | `GET /recipes sort=latest`, `POST /recipes/{id}/save book_ids[]`, `/shopping/lists completed_at`, `/leftovers` 카드 메타, `/recipe-books/{id}/recipes` 메타 확장 |

> 이 변경은 사용자 승인(2026-05-12)을 기반으로 한 Wave1 prototype parity contract-evolution이다.
> Phase4 재진행 전에 official MVP 기능 계약과 fixed prototype visual 기준의 충돌을 줄이기 위한 선행 문서 잠금이다.

## v1.6.4 / v1.5.1 / v1.3.1 / DB v1.3.1 / API v1.2.2 → v1.6.5 / v1.5.2 / v1.3.2 / DB v1.3.2 / API v1.2.3 변경 이력 (2026-05-10)

| 문서 | 변경 내용 |
|------|----------|
| 요구사항 기준선 v1.6.5 | 기본 끼니 컬럼을 `아침 / 점심 / 저녁` 3개로 변경하고, 설정에서 이름 변경/추가/삭제 가능하도록 승인 |
| 화면정의서 v1.5.2 | `PLANNER_WEEK`는 사용자별 동적 끼니 컬럼을 표시하고, `SETTINGS`에 끼니 컬럼 관리 섹션을 추가 |
| 유저플로우 v1.3.2 | 신규 회원 bootstrap은 `meal_plan_columns ×3`, 설정에서 컬럼 관리 flow 추가 |
| DB v1.3.2 | `meal_plan_columns` 공개 정책을 기본 3개 + 사용자 관리 1~5개로 변경, 빈 컬럼만 삭제 가능 |
| API v1.2.3 | `GET/POST/PATCH/DELETE /planner/columns` 계약 추가, 중복명/최대개수/최소개수/식사 연결 삭제 제한 명시 |

> 이 변경은 사용자 승인(2026-05-10)을 기반으로 한 planner column customization contract-evolution이다.
> 기존 사용자에게 이미 생성된 컬럼은 자동 삭제하지 않고, 설정 화면에서 사용자가 직접 정리할 수 있게 한다.

## v1.6.3 / v1.5.0 / v1.3.0 → v1.6.4 / v1.5.1 / v1.3.1 변경 이력 (2026-04-27)

| 문서 | 변경 내용 |
|------|----------|
| 요구사항 기준선 v1.6.4 | PLANNER_WEEK의 "가로 스크롤 없음" 잠금을 제거하고 Baemin prototype planner reference를 우선 기준으로 채택 |
| 화면정의서 v1.5.1 | PLANNER_WEEK §5: H2/H4의 vertical-only day-card overview, planner-level no-horizontal-scroll, 기존 slot-row layout lock을 prototype parity 범위에서 supersede |
| 유저플로우 v1.3.1 | §③ 식단 계획 여정: prototype reference와 동일한 localized scroll/swipe/peek affordance를 허용 |
| API (v1.2.2 유지) | 변경 없음 — `GET /planner`, planner-related mutation 계약 동일 |
| DB (v1.3.1 유지) | 변경 없음 — `meal_plan_columns`, `meals` 구조 동일 |

> 이 변경은 사용자 승인(2026-04-27)을 기반으로 한 Baemin prototype parity contract-evolution이다.
> `PLANNER_WEEK` 구현은 prototype reference를 우선하되, 의도치 않은 page-level horizontal overflow는 계속 UI 결함으로 본다.

## v1.2.3 → v1.3.0 변경 이력 (2026-04-17)

| 문서 | 변경 내용 |
|------|----------|
| 화면정의서 v1.3.0 | PLANNER_WEEK §5: day card 본문을 2×2 grid → 세로 slot row 방식으로 변경, 가로 스크롤 전면 제거, 5-column 정보 축약 원칙 추가 |
| 유저플로우 v1.3.0 | §③ 식단 계획 여정: 세로 스크롤 중심 탐색 명시, 가로 스크롤 없음 선언 |
| API (v1.2.2 유지) | 변경 없음 — `GET /planner` 계약 동일 |
| DB (v1.3.1 유지) | 변경 없음 — `meal_plan_columns`, `meals` 구조 동일 |

> 이 변경은 H4 gate 승인(2026-04-16)을 기반으로 한 H2 Stage 1 contract-evolution이다.
> H2 FE 구현(`feature/fe-planner-week-v2`)은 이 문서 갱신 이후에 시작할 수 있다.

## v1.3.0 → v1.3.1 변경 이력 (2026-04-17)

| 문서 | 변경 내용 |
|------|----------|
| 화면정의서 v1.3.1 | RECIPE_DETAIL §3: PlannerAddPopup UX 확정 — 성공 후 토스트만 표시(PLANNER_WEEK 이동 없음), 토스트 텍스트 `N월 D일 끼니에 추가됐어요`, 이후 follow-up에서 선택 날짜는 활성 칩으로만 확인하도록 단순화 |
| 유저플로우 v1.3.0 | 변경 없음 |
| API (v1.2.2 유지) | 변경 없음 — `POST /meals` 계약 동일 |
| DB (v1.3.1 유지) | 변경 없음 |

> 이 변경은 H3 planner-add-sync Stage 1 사용자 승인(2026-04-17)을 기반으로 한 contract-evolution이다.
> H3 FE 구현(`feature/fe-h3-planner-add-sync`)은 이 문서 갱신 이후에 시작할 수 있다.

## v1.3.1 → v1.4.0 변경 이력 (2026-04-17)

| 문서 | 변경 내용 |
|------|----------|
| 화면정의서 v1.4.0 | HOME §1: 테마 섹션을 2열 카드 그리드에서 compact horizontal carousel strip(1.5장 peek, ~130px)으로 변경 |
| 유저플로우 v1.3.0 | 변경 없음 |
| API (v1.2.2 유지) | 변경 없음 — `GET /recipes`, `GET /themes` 계약 동일 |
| DB (v1.3.1 유지) | 변경 없음 |

> 이 변경은 H1 home-first-impression Stage 1 사용자 승인(2026-04-17, D1/D2/D3/D4)을 기반으로 한 contract-evolution이다.
> 정렬 컨트롤 위치·재료 필터 위치는 현행 유지. 테마 섹션 형태만 변경.
> H1 FE 구현(`feature/fe-h1-home-first-impression`)은 이 문서 갱신 이후에 시작할 수 있다.

## v1.4.0 follow-up note (2026-04-17)

| 문서 | 변경 내용 |
|------|----------|
| 화면정의서 v1.4.0 | RECIPE_DETAIL PlannerAddPopup: 선택 날짜를 보여주는 별도 확인 라벨 제거. 날짜 선택 상태는 활성 날짜 칩으로만 확인. |
| 유저플로우 v1.3.0 | 변경 없음 |
| API (v1.2.2 유지) | 변경 없음 — `POST /meals` 계약 동일 |
| DB (v1.3.1 유지) | 변경 없음 |

> 이 변경은 사용자 승인 하의 H3 planner-add 후속 UI polish를 반영한 경미한 contract follow-up이다.
> 성공 토스트 포맷과 이동 정책은 그대로 유지되며, 날짜 선택 확인 방식만 단순화됐다.

## v1.4.0 → v1.5.0 변경 이력 (2026-04-17)

| 문서 | 변경 내용 |
|------|----------|
| 화면정의서 v1.5.0 | `PlannerAddPopup`, `SavePopup`, `INGREDIENT_FILTER_MODAL`, HOME 정렬 선택 UI를 Quiet Kitchen Sheets 기준으로 재정의. eyebrow 제거, icon-only close, `olive base + thin orange highlight`, PlannerAdd 날짜 chip `요일 + 4/17`, Save 제목 `레시피 저장` 확정 |
| 유저플로우 v1.3.0 | 변경 없음 |
| API (v1.2.2 유지) | 변경 없음 — `POST /meals`, `POST /recipes/{id}/save`, `GET /ingredients`, `GET /recipes` 계약 동일 |
| DB (v1.3.1 유지) | 변경 없음 |

> 이 변경은 H5 modal-system-direction Stage 1 사용자 승인(2026-04-17, D1~D6)을 기반으로 한 contract-evolution이다.
> h5 modal system redesign FE 구현(`feature/fe-h5-modal-system-redesign`)은 이 문서 갱신 이후에 시작할 수 있다.
