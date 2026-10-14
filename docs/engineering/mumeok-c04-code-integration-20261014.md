# C04 코드 통합 기록 · 2026-10-14

상태: `codex/mumeok-c04-integrated`의 로컬 소스 통합. worker bridge와 저장 YouTube owner UI는 아직 이 브랜치에 합치지 않았다. 운영·DB·정책 활성화 기록이 아니다.

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
