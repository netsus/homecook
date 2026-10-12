# YouTube 설명란·작성자 댓글 원천 결속 수량 복구

## 상태

- 날짜: 2026-10-12
- 기준: 기존 source-bound 후보 `7e5f8ddd4d4fa22cbd3c8ad620686ea46efd8a77`에서 분기한 독립 작업 브랜치
- 구현: 로컬 완료, 운영·DB·웹 미반영
- 현재 런타임 후보: client v66, verifier v40, source binding v3
- 이번 후속 작업의 모델·OCR·영상 다운로드·네트워크 호출: 0회

앞선 정확 3건 평가는 승인된 Luna low 호출 3/3을 이미 모두 소비했고 남은 예산은 0이다. 이번
후속은 당시 저장한 immutable source snapshot과 raw proposal만 읽어 현재 verifier를 오프라인으로
재생했다. 과거 승인·receipt·`--execute`를 새 실행 권한으로 재사용하지 않았다.

## 원인과 범위

읽기 전용 진단 `.diagnostics/youtube-description-quantity-20261012/diagnosis.json`의 SHA-256은
`9c0fabe8e6422391576f14a98ec898644096090a0fa7d010696c5150784247e1`이다. 운영 v63에서 공식
설명란 또는 작성자 댓글의 `통삼겹살 500g`, `돼지고기 앞다리살 400g`, `양파 2개(500g)`가
post-verifier 결과에서 `unknown/null`로 남은 사례가 있었다. 저장된 pre-verifier JSON이 없던
최초 진단만으로는 모델 누락과 verifier 강등의 비율을 나누지 않는다.

v65까지 emoji bullet, amount-first 영문 행, 이전 정성량 행의 scope, `lb`, plain `RECIPE`
제목을 보완했다. v66은 저장 raw 재생에서 남은 다음 세 경계만 좁게 보완한다.

- `1/2 Onion`은 단위가 없으므로 그 행만으로는 복구하지 않는다. 별도의 caption에 정확히
  `half of a/an/one [허용 descriptor] Onion`이 한 번 있어 개수임을 확인할 때만 `1/2개`로
  해석한다. `green onion`, 조건·대체·범위, 다른 재료, 무게/부피 표현, 한 caption의 두 행
  소비는 차단한다.
- raw `estimated`는 그대로 되살리지 않는다. 기존 verifier의 최종값이 `unknown/null`이고
  대상 행의 유일한 거절 사유가 `unsupported-visual-estimate`인 경우에만, 별도 설명란/작성자
  댓글의 닫힌 원문 행이 명시한 primary 수량으로 복구한다.
- 원문 owner와 caption/다른 source mention에 서로 다른 exact 수량이 있으면 복구하지 않는다.
  실제 출처 모순, 대체재·조건·부정·행동·범위·근사·소유자 모호함은 계속 conflict 또는
  review-required다.

DB schema, SQL resolver 계약, allowlist, API, UI는 바꾸지 않았다.

## request-local 결속·복구 계약

설명란과 작성자 댓글은 source marker와 `---`마다 별도 `source_block_index`를 가진다. 서로 다른
block의 목록, 이름 또는 수량을 조립하지 않는다. 명시적 재료 제목 아래의 안전한 닫힌 행,
한 block의 연속한 안전한 재료 행 2개 이상, 연속한 emoji-marked numeric 행 2개 이상만
결속한다. name-first와 amount-first를 지원하며 `2개(500g)`, `1/2 lb | 250g`,
`2 Tablespoons | 30ml`은 첫 수량을 primary, 뒤 수량을 reference로 좌표와 함께 보존한다.
합산·환산하거나 reference를 primary로 바꾸지 않는다.

복구 전에 기존 verifier 결과와 issue 집합을 다시 확인한다.

1. 기존 `unknown/null` 복구는 모델이 같은 원천 owner를 이미 evidence로 제출했고 다른 issue가
   없을 때만 허용한다.
2. 거절된 estimate 복구는 위의 단일 `unsupported-visual-estimate` 조건과 독립된 exact owner를
   모두 만족해야 한다. 이미 verifier가 받아들인 source-qualified estimate는 덮지 않는다.
3. 단위 없는 절반 복구는 단일 `invalid-quantity-or-measurement`와 독립 caption의 개수 증명을
   모두 만족해야 한다.

복구된 값은 transient `amountBasis=source-bound-stated`로 표시한다. v66의 estimate/절반 복구는
verifier가 이미 확인한 한국어 display name을 resolver lookup에 유지하고, 영문 원문 이름은
`originalName/sourceName`과 evidence에 보존한다. 기존 unknown/null 복구는 모델 display name을
신뢰하지 않고 서버가 결속한 source name을 사용한다.

sync 경로는 기존 재료 사전 조회가 lookup name을 정확히 하나의 canonical/synonym으로
`resolved`한 경우에만 `text_explicit` 수량을 공개한다. 0개 또는 다중 후보면 amount/unit을
null, source를 unknown, review-required를 true로 되돌린다. async worker도 transient 표식을
SQL 입력 전에 기존 `stated`로 바꾸고 대상 index를 request-local로 보관한 뒤, 실제 SQL
resolver의 authoritative `resolution_status=resolved`인 행만 저장 직전에 유지한다. 미해결·
다중 후보는 `unknown/null/review-required`로 강등한다. 따라서 `그릇 2개` 같은 비재료는
문법이나 모델 이름만으로 저장 수량이 되지 않는다.

## 버전·무결성

- client: `codex-vision-source-anchored-v66-source-bound-quantity-finalization`
- verifier: `source-anchor-fidelity-v40-source-bound-quantity-finalization`
- source-bound recovery policy: `source-bound-quantity-recovery-v2`
- source binding: `source-quantity-bindings-v3`
- prompt: `source-anchored-single-recipe-v17-source-first-quantity` (변경 없음)
- selector: `deterministic-evidence-v3-ingredient-event-preserving-largest-gap` (변경 없음)
- OCR policy: `source-anchored-full-frame-ocr-v1` (변경 없음)
- execution config signature: `b950c1a454c9979bd97953b5`
- candidate pipeline identity: `614233be53ee0f0a82b2e669bc8914b83d8046ba1f21fe6ab3972654a041a76d`
- runtime bundle SHA-256: `02bd4301d1a3d457022cfcbb62043343ffc8e6754afafc481dec03b2528a41e5`
- bundle manifest SHA-256: `7b11e802b31607cb95c97fc8c530691778e9d2afc96e4e4e5a0883ba039f7093`
- `literal-quantity-grammar.mjs`: `e3a2f2537f98219d56f36a320f8cffa8a969cb2473aad87166f66997fac2bc20`
- `single-pass-vision.mjs`: `a8614a16b2588e311262c8c3fede756bc6fe7f8b11ee2cbb2ba27f9e3759b4f3`
- `source-anchored-vision.mjs`: `666c506780de8ca1e971c40c1c32f00277bac9ea13ab244605216ea3044cbf0e`
- `source-quantity-owner-hints.mjs`: `f4cd6e3d78105a941e6045a753805201b2495827980b0e68aa22c74e54d69843`
- async resolver/finalization gate: `11c72f3d61dd402c14a7846b1972a44f246b17289761837cd4718358a87ae12a`

manifest의 모든 선언 파일을 실제 바이트와 다시 대조했고 불일치는 0이다. 실제 bundle worker가
생성한 identity의 canonical JSON SHA-256도 위 pipeline identity와 일치한다. 기존
`source-bound-evaluation-runner`와 preflight는 이미 소비된 v64 평가 후보에 고정되어 있어 현재
bundle과 다르면 fail-closed한다. 새 후보로 그 승인이나 3회 budget을 재사용할 수 없다.

## 저장 결과 오프라인 재검증

재생 스크립트는 ignored 작업 증거
`.omx/source-bound-evaluation-20261012/replay-saved-results.mjs`이고 SHA-256은
`4c6bec1c4ce005db0189687030b036e29d110772ebc7a1b2cba9ff2e7f424fce`이다. source와 durable
result SHA를 먼저 확인하고 저장 invocation의 id/text/provider/method/block/line/timestamp와
현재 ledger 좌표가 같은지 검사한 뒤 저장 raw proposal을 v40 verifier에 넣는다. 모델·네트워크
호출 수는 모두 0이다.

결과 `.omx/source-bound-evaluation-20261012/replay-result-v3.json`의 SHA-256은
`433976ca4d03699d7da1b46106a67dc53c4b18da8add06de5d2c4ed115018310`이다.

| 영상 | immutable source SHA-256 | 저장 result SHA-256 | v38 → v40 실제 차이 |
|---|---|---|---|
| `D9jzKcu9Snc` | `ccb47ccf7b40c6ebacdc6ea1a6b5b07736546b9decaebbb2cc4d57a4e513cb11` | `fd20faf126ed85724295ecfd0b8c056576e91d2f38d02c70abf1c469a1c49c13` | `통삼겹살` unknown→`500 g explicit`, 두 번째 `소금` unknown→`1 티스푼 explicit`; verified 0→2, rejected 3→1 |
| `AtGAVBl1vrQ` | `074b583eb201f3bcc1da1eae43466d0d9bce33bef91552ce85a95bec2a4ffefc` | `89d71e1a5761faf183774336f75079509f2df5af7ab64f998738b9e71d3084ae` | `돼지고기 앞다리살` unknown→`400 g explicit`; verified 10→11, rejected 1→0. `양파 2개`가 primary이고 `500g`은 reference로만 보존 |
| `eJyoszbyNNQ` | `46dce89f7a2ae3d5986d7cd8306259e1f350d61761b38bdc9b0962f8a502f345` | `bb1fa2234ae70976e7f12b10e141222cfb1604835eb4aca3a379d1f03af06526` | `양파` unknown→`1/2개 explicit`; `올리브 오일` unknown→`2 Tablespoons explicit`(reference `30ml`), `발사믹 식초` unknown→`1 Tablespoon explicit`(reference `15ml`); verified 4→7, rejected 3→0 |

eJ의 Garlic은 설명란 `2 Cloves`와 caption `one/couple`가 충돌하므로 계속 `conflicting`이다.
D9의 시각 원천 `한두 꼬집`과 honey conflict도 복구하지 않는다.

## 실제 경계 검증과 한계

관련 unit/runtime 회귀 10개 파일 264개를 통과했다. 여기에 raw estimate 단순 부활 방지,
source/caption exact 모순, 조건·대체·부정·범위, unitless 무게, compound green onion, 공유 caption,
accepted estimate 비덮기, localized resolver name 유지, 비재료 fail-closed를 포함한다.

`pnpm verify:anti-slop`, `pnpm typecheck`, `pnpm lint`, `pnpm build`도 종료값 0이다. lint/build에는
이번 범위 이전부터 있던 React Hook/unused 경고가 남지만 오류나 신규 Anti Slop 위반은 없다.

`pnpm verify:youtube-ingredient-resolution:isolated`는 disposable local Supabase에서 218개 migration
(`d1b2a37a602359467015ddf10fcdc051c751dc3eabf6df61bfe61a220f844d14`)을 재생하고 실제 SQL
resolver fence와 저장 postimage/concurrent ensure를 포함한 8개 integration test를 통과했다.
최근 두 catalog selection migration도 원래 함수 소유자인 `supabase_admin`으로 재생하도록 검증
harness의 역할 목록만 보완했다. 격리 DB는 검증 후 정리했다. 운영 DB, 원격 DB, worker, 배포에는
쓰기나 교체를 하지 않았다.

이 결과는 결정적 verifier 코드, 저장된 세 raw proposal, 현재 로컬 resolver/저장 RPC 경계를
증명한다. 새 모델 출력의 개선, P5 통과, 운영 반영, 새 영상 다운로드 성공을 뜻하지 않는다.
