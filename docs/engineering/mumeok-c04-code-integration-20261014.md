# C04 코드 통합 기록 · 2026-10-14

상태: `codex/mumeok-c04-integrated`의 로컬 소스 통합. 아래 최종 후속에서 worker bridge와 저장 YouTube owner UI도 합쳤다. 운영·DB·정책 활성화 기록이 아니다.

## 통합 순서와 충돌 처리

1. 독립 검토와 P2 보완이 끝난 recipe 입력 checkpoint `3151ca83919285b2e8534d49d164a0e63087d59e`에서 시작했다.
2. first/editor checkpoint `64013fdc7578696b767c8c26c798ef939490dc1a`를 로컬 merge `6bd920460`으로 합쳤다. `ingredient-quantity-policy-v4-20261013.md`의 한 충돌만 직접 해결했으며, recipe 소비자와 C03→C01→C04 editor의 날짜별 후속 기록을 모두 보존했다. 코드 충돌은 없었다.
3. master `41d3417ce2cb54c125e2d8f710bad54456b4f8c6`의 C01 최종 보완과 guest cook 복귀를 합쳤다. pending action·로그인 안내·레시피 상세·검사가 자동 병합됐으며 양쪽 기능을 함께 읽고 검사했다.

수량 초안 복귀는 기존 owner/account-generation/revision 확인 뒤 같은 초안을 열며 자동 저장하지 않는다. 요리 복귀는 선택 인분을 유지하고 현재 레시피 변경을 안내한 뒤 사용자가 요리하기를 다시 눌러야 한다. 취소·오래된 요청·다른 화면의 늦은 응답 방어는 양쪽 경로에서 보존한다. 새 복귀 기능이나 권한을 추가하지 않았다.

## 보존한 정확 소스

| 대상 | 기준 소스 또는 SHA256 |
|---|---|
| C01 `20261013233000_cooked_batch_weight_evidence.sql` | `60b9f4008768fc0846eb0b3a104fac3ef0650975535371adf876b95dcb711aa0` · master 원문 |
| first `20261014200000_quantity_input_v4_consumers.sql` | `9ec96a2a7bbf7192801b1f6dd43304ed8ba78ab73f934eac4c2c300e3ca85573` · cold GUC 초기화 포함 |
| editor `20261014213000_product_quantity_edit_capability.sql` | `acb0ec83aeabc91320a61b406c2a23dda258033592defbb09bd7f1bb8667399b` |
| recipe `20261014220000_recipe_quantity_input_v4.sql` | `9b15696aa8f33cb6a9c707d1355a90efb07bd929df3943519e58b1d6d6cc2367` · `3151ca839` 원문 |
| raw meal dispatch 보호 | `fb2c031d9f2d7a6161b391b0097372b4f35baca8`의 후손 `64013fdc7`과 `app/api/v1/meal-log/entries/route.ts`가 byte-identical |

`fb2c031d`는 SQL SHA가 아니라 앱 dispatch 보완 커밋이다. cooked_batch의 명시 `quantityInput`이 존재하면 원문을 모르는 legacy helper에 보내지 않는다. raw 없는 일반 숫자·receipt replay·handled=false의 기존 fallback은 유지한다. C01 preview의 읽기용 분모와 제어 OFF의 신규 저장 근거를 동일하게 취급하지 않으며, quantity/weight 응답 헤더의 독립 opt-in도 보존한다.

## 이 단계의 확인과 남은 범위

첫 merge의 관련11파일107검사와 타입 검사, master 통합 후 관련21파일301검사와 타입 검사를 각각 실패/skip0·exit0으로 확인했다. 후자는 pending·cook/quantity 로그인 복귀·C04 first/editor·recipe 원량/context·C01 응답/preview 호환과 source inventory 단위 검사를 포함한다. source inventory 단위 검사 통과는 실제 최종 DB의 전체 보안 inventory 통과를 뜻하지 않는다.

worker 최종 코드와 저장 YouTube 원문 UI를 합친 뒤 최종 production build를 한 번 수행한다. C04의 추가 wrapper/helper/alias에 대한 정확한 최종 source/body/owner/ACL/config 보안 지문 등록·fresh schema 통합은 후속이다. 기존 지문 차이를 정상 baseline으로 새로 승인하지 않았다. 이 단계에서는 native·실제 OAuth·운영/default DB·실제 config/키·새 추출·P5·모델/외부 AI 호출·배포를 실행하지 않았다. 로컬 merge commit만 만들며 push·PR·master·운영은 총괄이 처리한다.

## 최종 worker·저장 원문 UI 합침

독립 검토된 backend16·saved UI4 파일의 source `23c1aa47c188ec4dcf2119e92ad1884ecde8272d`를 이어서 합쳤다. 충돌은 `types/recipe.ts`의 읽기 `RecipeIngredient.quantity_input` 한 곳뿐이다. 공통 `QuantityInputSnapshot`과 정상 `RecipeQuantityInputSnapshot`을 함께 받도록 했으며, 정상 alias의 필수 `context_sha256`, context 응답과 쓰기 draft validator는 원문 그대로다. worker context를 normal context hash로 만들거나 바꾸지 않았다. backend15파일과 saved UI4파일은 각 freeze 원문과 byte-identical이다. 위 C01/first/editor/recipe SQL, raw legacy dispatch, guest cook·수량 복귀도 그대로다.

worker `20261014223000_youtube_quantity_input_bridge.sql` SHA는 `f586b27f2f5da5063a7eaa70278c7f00edab762aa27248b91a224411f436c750`이며, source13함수 manifest SHA는 `96380285501d6ee9cd81be8334ecebe4848446ac87c4420a3616e2553610fe1f`, catalog after는 `de001df9981d361130136e2dff184665ec5280e82a857aa4e0e6cd593848af05`다. 이전 dd924/4101 후보를 되살리지 않았다. gate·legacy 숫자/응답과 원입력 보존, 정책 OFF 이후 writer 경합 보호는 해당 source의 계약이다.

통합 후 관련28파일375검사·타입 검사·관련16개 TS/JS ESLint·Anti Slop728파일 신규0·공백/미해결 충돌0을 확인했다. 실사용자·HTTP JWT/OAuth·최종 native와 worker 설치는 실행하지 않았다. 운영 적용 전에는 격리한 source219→C03→C01(60b9)→C04 010000/200000/210000/213000/220000/223000 순서의 정확 before/post 지문과 실제 함수/정책/원량 통합 확인이 필요하다. worker13 source manifest 존재나 단위 검사만으로 전체 inventory 등록·통과를 주장하지 않는다.

production build는 실제 `.env` 파일이 없는 것을 확인하고 환경을 비운 뒤 가짜 localhost65534 주소/가짜 검증 값·QA OFF·R2 false만 넣어 실행했다. compile·type·94개 정적 페이지·trace가 완료됐고 exit0이다. Next 내장 lint는 공유 pnpm 저장소에서 react-hooks plugin 경로를 찾지 못해 수행되지 않았으며 별도 기본 flat-config의 관련 lint는 통과했다. 이 재현은 소스/의존성을 바꾸지 않은 기존 설치 경로 문제로 기록한다. 이 `.next`는 가짜 공개 설정이 들어간 검사용 결과이며 운영 배포에 재사용하면 안 된다. 로그와 종료값은 `/tmp/mumeok-c04-integrated-production-build.log`와 `-result.json`에 둔다. lint 경로 보완은 수량 소스와 분리한 후속 변경이다.

### ESLint 설치 경로 후속

수량 source merge는 `06328887f`로 고정했고, 경로 보완은 별도 `b398c9e9f`의 `eslint.config.mjs` 한 파일·추가3줄이다. 선언된 eslint-config-next package를 `createRequire(import.meta.url).resolve`로 찾고 실제 parent node_modules만 `resolvePluginsRelativeTo`에 전달한다. 기존 baseDirectory·extends·rules·ignore와 의존성은 byte-equivalent이며 절대 작업 경로를 넣지 않았다. 기본 config의 관련22파일 lint와 같은 기본 Next production build를 다시 확인했다. 내장 lint·타입·compile·94정적 페이지·trace가 모두 수행되어 exit0이고, 변경 밖의 기존 경고4개만 남는다(마이페이지·팬트리·레시피북 showToast dependency, YouTube bundle `_private` unused). 경고 정리나 규칙 완화는 하지 않았다. 첫 경로 실패 로그/result는 `-before-eslint-fix` 사본으로 보존한다. 최신 `.next`도 검사용 가짜 값이므로 운영에 재사용하지 않는다.

최종 freeze는 incoming20파일을 `23c1aa47c`와 비교한다. 19파일은 byte-identical, 타입1파일만 기존 정상 recipe 선언을 보존하면서 읽기 snapshot을 함께 수용하는 예외다. C01·first·editor·recipe·worker SQL과 worker13/de001 guard는 exact bytes를 유지한다. 상세 파일 SHA·검사 종료값·미실행 native/운영 경계는 `/tmp/mumeok-c04-final-integrated-freeze.json`에 둔다. 최종 전체-prefix DB 검증과 C04 보안 postimage 등록은 별도 worktree에서 총괄이 이어간다.
