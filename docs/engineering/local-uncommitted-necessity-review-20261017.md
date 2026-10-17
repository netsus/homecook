# dirty worktree 26개 읽기 전용 검토 — 2026-10-17

대조 기준: 로컬에 이미 존재하는 `origin/master` **3e3e18b5961e5154e09bc33a30e6682521f40095**. fetch/network/API/운영 Chrome/DB/container 조회·변경 없음. 원 worktree 파일·Git 상태 수정/삭제/reset/stash/merge 없음. 요청받은 이 보고서와 `/tmp`의 비교용 메타데이터만 생성했다.

초기 inventory의 dirty26 경로를 현재 다시 확인했다. 현재 v85 경로는clean이며 나머지25개 경로에서 `--untracked-files=all` 기준 **5,711개 파일**을 확인했다. 초기의 `?? 디렉터리/`를 펼쳤기 때문에 초기 파일 수와 다르다. vision-loop 단독5,311개가 대다수다.

## 결론

- 즉시 전체 merge할 worktree는 없다. 현재 master에 없는 필요 안전수정 후보는 **cooked-weight-veto 코드+회귀**다. 최신 독립 브랜치 이식 후 검증할 가치가 있다.
- 선택 개선 후보는 scheme 없는 YouTube URL 정상화, bootstrap SDK projection 회귀, catalog 정책 추가회귀다. 현재9개 기능 결함으로 모두필수라고 판단하지 않는다.
- exact blob80개는 이미반영이다. 나머지17개는 원diff의 의미 있는 추가행이master에 있고 삭제행이없음을 확인한 hunk상 흡수후보다. 전체파일 동일/의미동등을 뜻하지 않으므로 별도 문맥판정을 아래에 남겼다.
- C05/최근단위memory·Round2/lead·v85/v89 worker·full-local/auth/배포 설정은 고유diff가 남아도 다른 소유자/보류 경계다. bulk merge나 환경 fallback 복구 대상으로 삼지 않는다.

## 비교 방식과 한계

`git status --porcelain -z --untracked-files=all`, `git diff --stat`, 필요한 source diff와 local `git show`만 읽었다. working/HEAD/master Git blob을 대조했다. `추가행미반영 a/b, 삭제행잔존 c/d`는 원HEAD→working diff의 15자초과 비공백행을 master 텍스트에 정확 대조한 보조증거다. 이름변경/리팩터링/줄바꿈·의미동등까지 자동 증명하지 않는다. env/키/credential 원문 및 사용자 기록내용은 보고서에 복사하지 않았다. 데이터/이미지 산출물은 경로·유형·master유무만으로 기록했고 모든 픽셀/본문을 사람수준으로 읽었다고 주장하지 않는다. 단위/전체빌드·DB·HTTP·실제화면 회귀는 이 인벤토리 작업에서 실행하지 않았다.

필요안전후보의 순수함수비교: master는 `재료를 데워 섞는다`, `달걀을 삶아 섞는다`, `국물을 버려 섞는다`에 모두 conflict`[]`; veto후보는 각각 `explicit_heat`, `explicit_heat`, `external_outflow`. `구운 참깨를 넣고 섞는다`는 양쪽`[]`. 문자열 함수만 메모리에서 실행했고 파일/DB 쓰기는없다.



## Worktree 요약

전체 파일별 검토 원본은 `/tmp/homecook-dirty-review-20261017.md`에 보존했다. 아래는 해당 독립 리뷰의 작업별 판정이며, 과거 증거/선택 후보/소유자 보류를 삭제나 자동 머지 승인으로 해석하지 않는다.

## 01. codex/gabia-direct-prelaunch

- 경로: `/Users/cwj/01_vibe_coding/homecook`
- 현재HEAD: `f970bc1d1f1e981d8947e852a9b51ada4a74570a` / 현재dirty확장파일: 7개
- 작업단위판정: **이미 반영/후속 대체** — 가비아 직접 전달·Cloudflare Turnstile 한정 설명은 현재 master 개인정보 화면에도 존재한다. 차이는 문장 줄바꿈과 과거 상태 기록이며 최신 개인정보·공식 문서를 옛 파일 전체로 덮어쓰지 않는다.


## 02. codex/intake-trend-prototype-plan-20261016

- 경로: `/private/tmp/homecook-intake-trend-plan-20261016`
- 현재HEAD: `f970bc1d1f1e981d8947e852a9b51ada4a74570a` / 현재dirty확장파일: 1개
- 작업단위판정: **실험·계획 기록** — 섭취량/체중 추세 프로토타입 계획 문서만 남았다. 제품 코드나 현재 9개 개선의 결함 수정이 아니다.


## 03. fix/v85-rotation-safe-cutover-20261017

- 경로: `/private/tmp/homecook-v85-web-recovery-20261017`
- 현재HEAD: `15b1a36f9b4c4c293cd8f92c6f2824b13ba7eaf9` / 현재dirty확장파일: 0개
- 작업단위판정: **다른 소유자 보류** — 초기 dirty14였던 v85 전환 소유자의 worktree가 현재 clean이다. 소유자 종료/반영 상황의 변경이며 초기 inventory로 삭제나 재머지를 판단하지 않는다.


## 04. fix/public-recipe-nutrition-read

- 경로: `/Users/cwj/.codex/worktrees/2ab3/homecook`
- 현재HEAD: `af044945462f66adc77a64ec680052abf24ed0e8` / 현재dirty확장파일: 4개
- 작업단위판정: **이미 반영/후속 대체** — 섬유질 partial 접두사 예외는 master가 모든 영양표시에서 최소 접두사를 제거한 후속 정책으로 대체했다. 대규모 영양 데이터 SQL은 별도 소유자/대상 검토 없이 재실행하지 않는다.


## 05. codex/mumeok-c01-reader-evidence

- 경로: `/Users/cwj/.codex/worktrees/cooked-weight-prediction/homecook`
- 현재HEAD: `db0fa13f58eae59b7b9b2ab7716d6008b67df415` / 현재dirty확장파일: 2개
- 작업단위판정: **실험·과거 증거** — 베타 v9/C01 진행 기록과 과거 source-of-truth 추가뿐이다. 현재 공식 기록 순서를 과거 문서로 덮어쓰지 않는다.


## 06. detached HEAD

- 경로: `/Users/cwj/.codex/worktrees/cooked-weight-veto/homecook`
- 현재HEAD: `5925b8090d9ba421aed35e1a2ecd28acce5300b1` / 현재dirty확장파일: 3개
- 작업단위판정: **필요한 미반영 후보** — MIX 단계의 새 가열/배수 동사 veto가 master에 없다. 데워/삶아/버려 사례를 순수 함수로 대조해 차이를 확인했다. 코드와 회귀만 최신 별도 브랜치에 이식할 후보이며 원 worktree 변경/전체 merge 금지.


## 07. codex/ingredient-nutrition-correction-20261006

- 경로: `/Users/cwj/.codex/worktrees/ingredient-nutrition-correction/homecook`
- 현재HEAD: `8abed074f04ec9ca5b7fec0b25d2effced3fc966` / 현재dirty확장파일: 57개
- 작업단위판정: **이미 반영/후속 대체** — 57개 중50개는 working blob이 master와 완전히 같다. 추가 catalog 회귀 일부와 MEXT 원천 parser 실험만 개별 검토 대상으로 남는다. 원천/SQL의 broad 재반영 금지.


## 08. feature/marketing-demand-validation-landing-polish

- 경로: `/Users/cwj/.codex/worktrees/marketing-demand-validation-stage6-safety/homecook`
- 현재HEAD: `08f3ddaec410dd2bacae9ffd7d75ddc5ccbeec68` / 현재dirty확장파일: 8개
- 작업단위판정: **다른 소유자 보류** — 마케팅 랜딩의 광고문구·이미지·흐름 재설계다. 요리 개선 선행 요건이 아니며 Round2/lead OFF 경계를 유지해야 한다. 소유자 디자인/현재 깔때기 계약 확인 없이 merge하지 않는다.


## 09. feature/fe-marketing-demand-validation-v2

- 경로: `/Users/cwj/.codex/worktrees/marketing-demand-validation-v2-stage4/homecook`
- 현재HEAD: `c29d4a9bd39a8b9d4fcd89b1160bf64290ef405e` / 현재dirty확장파일: 2개
- 작업단위판정: **실험·과거 구현** — 기존 대형 랜딩을 202줄의 hero/quiz 실험으로 치환한다. 현재 funnel·오프라인 큐·후속 동의 흐름을 제거하므로 단순 미반영 개선으로 판단할 수 없다.


## 10. chore/marketing-local-dashboard

- 경로: `/Users/cwj/.codex/worktrees/marketing-local-dashboard-preserved/homecook`
- 현재HEAD: `8f0caf0a9ebf64816fd4021b2f292f839aa78e38` / 현재dirty확장파일: 27개
- 작업단위판정: **다른 소유자 보류** — 로컬 마케팅/lead/Round2 dashboard 도구와 테스트다. 운영 실행·데이터 연결·수집 활성화하지 않는다. proposal-critic 스킬 삭제는 제품 요청과 무관한 로컬 삭제 상태로 보존.


## 11. codex/mumeok-c04-weight-origin

- 경로: `/Users/cwj/.codex/worktrees/mumeok-beta-products/homecook`
- 현재HEAD: `8e52a4c0411b8b697eff858a8325dac7194f2b5b` / 현재dirty확장파일: 6개
- 작업단위판정: **이미 반영/후속 대체** — C04 frozen quantity 보존·원천 일치 검증이 master에 정확 반영되거나 후속 fallback 추가와 함께 포함됐다. 옛 전체 파일을 가져오면 최신75% 처리가 퇴행한다.


## 12. codex/mumeok-c04-active-continuation

- 경로: `/Users/cwj/.codex/worktrees/mumeok-c04-active-continuation/homecook`
- 현재HEAD: `f8194a6784f14b06df7fdda2166b151dafe598f8` / 현재dirty확장파일: 6개
- 작업단위판정: **이미 반영/후속 대체** — 활성 worker continuation helper와 보호 rollout은 master에 존재한다. 옛 배포 스크립트 import/관측 조합을 v85 전환 위에 덮어쓰지 않는다. 관련 문서는 과거 증거다.


## 13. codex/mumeok-recipe-snapshot-identity

- 경로: `/Users/cwj/.codex/worktrees/mumeok-manual-publication-context/homecook`
- 현재HEAD: `950fd090b826d234db670346a78231ddb00250e2` / 현재dirty확장파일: 7개
- 작업단위판정: **이미 반영** — 7개 모두 working blob과 master blob이 동일하다. 원본·추가 테스트·migration까지 재반영할 변경이 없다.


## 14. codex/mumeok-recipe-unit-memory

- 경로: `/Users/cwj/.codex/worktrees/mumeok-nutrition-v4-reasons/homecook`
- 현재HEAD: `950fd090b826d234db670346a78231ddb00250e2` / 현재dirty확장파일: 21개
- 작업단위판정: **다른 소유자 보류** — 최근 단위 기억(memory) 쓰기·UI hint·사용자 JSON 저장·migration이 묶여 있다. 현재 C05/최근 단위 기억 신규 수집 보류와 충돌하므로 활성화/merge하지 않는다.


## 15. codex/mumeok-menu-add-quantity-contract-tests

- 경로: `/Users/cwj/.codex/worktrees/mumeok-nutrition-validator-deploy/homecook`
- 현재HEAD: `646282c58d80c0f925e5dd683ace8a4efbe6cd5a` / 현재dirty확장파일: 1개
- 작업단위판정: **이미 반영** — menu-add-screen 테스트 working blob이 master와 완전히 같다.


## 16. codex/mumeok-recipe-http-replay

- 경로: `/Users/cwj/.codex/worktrees/quantity-fidelity-operating-docs/homecook`
- 현재HEAD: `950fd090b826d234db670346a78231ddb00250e2` / 현재dirty확장파일: 9개
- 작업단위판정: **이미 반영/후속 대체** — recipe PATCH HTTP replay와 snapshot reason 보호는 master에 포함되거나 후속 구현이 있다. 원 route를 되돌리지 않는다. 별도 native fixture/문서는 과거 재현·증거로 보존한다.


## 17. codex/youtube-ingredient-resolution-20261009

- 경로: `/Users/cwj/.codex/worktrees/youtube-ingredient-resolution/homecook`
- 현재HEAD: `55e8a3651eec24dfaab51ad1ddd262fff30b33d3` / 현재dirty확장파일: 19개
- 작업단위판정: **이미 반영/후속 대체** — ingredient resolution의 큰 부분이 master에 반영됐다. 로컬 spaghetti 규칙은 raw 문장 속 spaghetti+mass만으로 후보를 넓히지만 master는 전체 영문 재료명+수량 단위가 정확히 맞는 stricter 정규식을 사용한다. 옛 완화 규칙/동명migration을 가져오지 않는다.


## 18. codex/youtube-resolution-deploy-20261010

- 경로: `/Users/cwj/.codex/worktrees/youtube-resolution-deploy-20261010/homecook`
- 현재HEAD: `c51d53871f31c7840fe24792b46b191ca963b11b` / 현재dirty확장파일: 1개
- 작업단위판정: **다른 소유자 보류** — 운영 resolution 함수 권위 수집용 standalone script다. 현재 운영 중단·v85 소유자 경계에서 실행하거나 최신 권위 수집 절차를 대체할 필요가 입증되지 않았다.


## 19. codex/youtube-vision-redesign

- 경로: `/Users/cwj/.codex/worktrees/youtube-vision-redesign/homecook`
- 현재HEAD: `fa167d9aeb114283fddc5399a77daaaf432ecf6e` / 현재dirty확장파일: 128개
- 작업단위판정: **다른 소유자 보류** — 추출기 vision 재설계·force_refresh·owner cache·원문대안 수량·worker bundle/migration이 함께 있다. 현 v85/승인 fence와 분리해야 하며 worker/pipeline·credential·추출 재평가 권한을 추정하지 않는다.


## 20. feature/codex-vision-single-loop

- 경로: `/Users/cwj/01_vibe_coding/homecook-codex-vision-loop`
- 현재HEAD: `f7775f68cf7afa12079032b20f39039abaad4ba8` / 현재dirty확장파일: 5311개
- 작업단위판정: **실험·과거 증거** — recipe-loop/codex vision 실험·평가기·holdout/프레임/실행 결과가 대부분이다. 고유 코드도 제품 공개 경로 필요성·현재 번들 검증이 확정되지 않았다. notebook 결과는 머지 대상 제품 수정으로 분류하지 않는다.


## 21. docs/full-local-production-operator-checklist

- 경로: `/Users/cwj/01_vibe_coding/homecook-full-local-restore`
- 현재HEAD: `af0b65ce33b8cc413f66cd30f2bfdcd98b6acdfb` / 현재dirty확장파일: 67개
- 작업단위판정: **다른 소유자 보류** — full-local 인증/권한·JWT 시각 정밀도·public origin·세션검증·스토리지·DB migration·Docker/시작 설정 묶음이다. 현 권위 모델과 다른 시점의 내부 클라이언트 변경이 많아 단순 복사 금지. 현재 운영 접근/배포 잠금 해제 및 소유자 검증 전 보류.


## 22. detached HEAD

- 경로: `/Users/cwj/01_vibe_coding/homecook-session-lifecycle-deploy-v20`
- 현재HEAD: `4462ac8784e40478ad8be6bd35ff585fc01d68d4` / 현재dirty확장파일: 1개
- 작업단위판정: **다른 소유자 보류** — legacy local-mac-production의 extractor mode 환경 allowlist 추가1줄이다. 현재 공식 prelaunch 경로의 key/worker fence와 연관되어 추정 복구하지 않는다. 환경 값은 조회하지 않았다.


## 23. fix/youtube-shorts-import-resilience

- 경로: `/Users/cwj/01_vibe_coding/homecook-youtube-i031-impl`
- 현재HEAD: `3d73542f86a9ec87b3aaa1b9d3b1b8f29b3015ee` / 현재dirty확장파일: 7개
- 작업단위판정: **미반영 개선 후보/분리 필요** — scheme 없는 youtube.com/youtu.be 입력에 https를 붙이는 로컬 개선이 master에 없다. URL 정상화 부분은 작은 선택 개선 후보이나 현재9개 필수 결함 근거는 없다. worker/import 전체diff·local-dev 실행 테스트와 분리해야 한다.


## 24. codex/bootstrap-select-projection-contract-20261017

- 경로: `/Users/cwj/01_vibe_coding/homecook/.worktrees/bootstrap-select-projection-contract-20261017`
- 현재HEAD: `2cd4aab93d5b9f527ce1a8b8de6d434136fc987b` / 현재dirty확장파일: 1개
- 작업단위판정: **미반영 테스트 후보** — 실제 Supabase SDK를 fake fetch와 연결해 bootstrap selected projection·쓰기순서·오류를 검증하는 신규 테스트다. 제품 수정 없음. 필요하면 별도 작은 테스트 PR로 검토할 수 있으며 운영/RLS 검증으로 주장할 수 없다.


## 25. codex/youtube-recipebook-planner-release-20261012

- 경로: `/Users/cwj/01_vibe_coding/homecook/.worktrees/youtube-recipebook-planner-release-20261012`
- 현재HEAD: `a6676d27e1751ec1351fe29dc83ba86c20adaa8b` / 현재dirty확장파일: 1개
- 작업단위판정: **이미 반영/후속 대체** — 공개 canonical bridge viewer/4행 backfill 검증 추가가 대부분 현재 master에 포함됐다. 일부 declaration/fixture 차이만 남아 전체 재반영 불필요. 새 DB 테스트는 이 검토에서 실행하지 않았다.


## 26. codex/youtube-source-quantity-recovery-20261012

- 경로: `/Users/cwj/01_vibe_coding/homecook/.worktrees/youtube-source-quantity-recovery-20261012`
- 현재HEAD: `80d2cbf309a0dbe94dbb7ce4cce5c2aff81c8ea4` / 현재dirty확장파일: 14개
- 작업단위판정: **다른 소유자 보류** — source-bound quantity recovery v89 runtime/manifest/owner-hints·prompt/verifier 테스트 변경이다. 현 v85 단독 소유자/동결 artifact/재평가 경계에 걸리므로 필요성 확정·권한 확인 전 merge·실행 금지.

