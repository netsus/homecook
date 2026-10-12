# YouTube 설명란·작성자 댓글 원천 결속 수량 복구

## 상태

- 날짜: 2026-10-12
- 기준: 기존 source-bound 후보 `7e5f8ddd4d4fa22cbd3c8ad620686ea46efd8a77`에서 분기한 독립 작업 브랜치
- 구현: 로컬 완료, 운영·DB·웹 미반영
- 현재 런타임 후보: client v65, verifier v39, source binding v2
- 이번 후속 작업의 모델·OCR·영상 다운로드·네트워크 호출: 0회

앞선 정확 3건 평가는 이전 승인 범위의 3/3 모델 호출을 이미 모두 소비했다. 이번 후속은
그때 저장한 immutable source snapshot과 raw proposal을 읽어 현재 verifier만 다시 실행했다.
과거 승인·receipt·`--execute`를 새 실행 권한으로 재사용하지 않았다.

## 원인과 최소 변경

읽기 전용 진단
`.diagnostics/youtube-description-quantity-20261012/diagnosis.json`의 SHA-256은
`9c0fabe8e6422391576f14a98ec898644096090a0fa7d010696c5150784247e1`과 일치한다.
운영 v63에서 공식 설명란 또는 작성자 댓글의 `통삼겹살 500g`,
`돼지고기 앞다리살 400g`, `양파 2개(500g)`가 post-verifier 결과에서
`unknown/null`로 남은 사례가 있었다. 저장된 pre-verifier JSON이 없던 최초 진단만으로는
모델 누락과 verifier 강등의 비율을 나누지 않는다.

기존 v64 후보는 이름-first 행과 일반 bullet을 request-local로 결속했지만 실제 저장 입력에서
다음 경계가 빠졌다.

- 작성자 댓글의 emoji bullet을 목록 표식으로 인식하지 못했다.
- 설명란의 `1/2 lb | 250g Spaghetti` 같은 amount-first 행을 닫힌 재료 행으로 인식하지 못했다.
- `RECIPE` 제목을 재료 영역으로 열지 않았고 `Handful of ...` 행이나 `약간` 행이 다음 행의
  scope를 잘못 바꿀 수 있었다.
- literal 단위 문법에 `lb`가 없었다.

따라서 새 저장 필드나 DB/API 계약을 만들지 않고 기존 source ledger와 verifier 사이의
request-local 결속만 확장했다. 서버가 원문에서 직접 만든 재료명·primary 수량·reference
수량·정규화 좌표를 verifier에 전달하며, 모델이 만든 이름·ID 자체는 승격 근거로 쓰지 않는다.

## request-local 결속·복구 계약

설명란과 작성자 댓글은 source marker와 `---`마다 별도 `source_block_index`를 가진다.
서로 다른 block의 목록, 이름 또는 수량을 조립하지 않는다. 다음 중 하나인 행만 결속한다.

1. 명시적인 재료 제목 아래의 안전한 닫힌 재료 행
2. 같은 source block에서 연속한 안전한 닫힌 재료 행 2개 이상
3. 같은 source block의 연속한 emoji-marked 목록에서 안전한 numeric tuple 2개 이상

결속은 name-first와 amount-first를 모두 지원한다. `2개(500g)`와
`1/2 lb | 250g`은 첫 수량을 primary, 뒤 수량을 reference로 좌표와 함께 보존한다.
amount-first의 여러 수량은 `|` 또는 괄호 관계 표지가 있을 때만 reference로 인정한다.
합산·환산하거나 reference를 primary로 교체하지 않는다.

복구는 raw 행이 정확히 `quantityState=unknown`, `amount=null`, `unit=null`이고 기존 verifier가
같은 원천 owner의 이름과 literal evidence를 다시 증명할 때만 시도한다. 이미 `explicit`,
`estimated`, `to_taste`, `conflicting`인 값은 덮지 않는다. 대체재·조건·부정·조리 행동·범위·
근사·정성량·추가 투입·다중 소유자, 한 owner의 중복 소비, 반복 numeric owner는 보수적으로
남긴다. description과 author comment가 primary/reference까지 같으면 description을 우선하되,
다르면 값을 섞지 않고 conflict를 유지한다.

verifier가 복구한 값은 transient `amountBasis=source-bound-stated`로 표시한다. 이후 기존 재료
사전 조회가 verifier가 원문에서 고정한 이름을 단일 재료로 `resolved`한 경우에만 최종
`text_explicit` 수량으로 공개한다. sync 경로는 기존 사용자 DB 조회 결과를 사용한다. async
worker는 transient 표식을 SQL 입력 전에 기존 `amountBasis=stated`로 바꾸되 해당 ingredient
index를 request-local로 보관하고, 기존 SQL resolver가 돌려준 authoritative
`resolution_status`가 정확히 `resolved`인지 최종 저장 직전에 확인한다. 미해결·다중 후보는
amount/unit을 null, state를 `unknown`으로 되돌려 `review-required`로 남긴다. 따라서 숫자형
그릇·접시 목록처럼 문법만으로 재료성을 증명할 수 없는 입력은 모델 이름/ID만으로 승격되지
않는다. transient 표지는 persistence RPC의 입력/저장 계약을 넘지 않으며 새 DB 열·evidence
field·SQL allowlist 값은 추가하지 않는다.

emoji 제거도 임의 기호 삭제가 아니다. Extended Pictographic cluster 뒤에 실제 공백이 있는
행 머리만 목록 표식으로 제거한다. 목록을 이어 주는 비 numeric emoji 행은 정성량 또는 범위
재료형으로 제한하며 승인 개수에는 포함하지 않는다. isolated emoji나 임의 감상 문구는 닫힌
목록의 근거로 쓰지 않는다.

## 버전·무결성

- client: `codex-vision-source-anchored-v65-source-bound-quantity-replay-fixes`
- verifier: `source-anchor-fidelity-v39-source-bound-quantity-replay-fixes`
- prompt: `source-anchored-single-recipe-v17-source-first-quantity` (변경 없음)
- selector: `deterministic-evidence-v3-ingredient-event-preserving-largest-gap` (변경 없음)
- OCR policy: `source-anchored-full-frame-ocr-v1` (변경 없음)
- source binding: `source-quantity-bindings-v2`
- execution config signature: `ec2a61efa3f408614fe41a5e`
- candidate pipeline identity: `19b173b7f6dcfc5f88cd62878028efab4a979baacd8b6f7c68072cb5ee44ad4d`
- runtime bundle SHA-256: `ef587335a6c1e0199c114d501ecc0ef1dc18d56cf8b7f7dc3a759934c415337b`
- bundle manifest SHA-256: `7c80eb4b28a928c06747a35a005d2224a728669ed5b06bbad5bd9af6c13cf489`
- `literal-quantity-grammar.mjs`: `e3a2f2537f98219d56f36a320f8cffa8a969cb2473aad87166f66997fac2bc20`
- `single-pass-vision.mjs`: `a8614a16b2588e311262c8c3fede756bc6fe7f8b11ee2cbb2ba27f9e3759b4f3`
- `source-anchored-vision.mjs`: `95b1deb4f099e2814952a4ef2cf5114800a6bd9815d128f94857c676640c94ac`
- `source-quantity-owner-hints.mjs`: `3ef0658bf5f5b003cb9054097fe07c23a06d8337f42d71c6f7a2a6324bec8aec`
- async resolver/finalization gate: `11c72f3d61dd402c14a7846b1972a44f246b17289761837cd4718358a87ae12a`

기존 `source-bound-evaluation-runner`와 preflight는 이미 소비된 v64 평가 후보에 고정했다.
현재 bundle과 달라지면 fail-closed임을 테스트한다. 새 후보로 그 승인이나 3회 budget을
재사용할 수 없다.

## 저장 결과 오프라인 재검증

재검증 스크립트는 ignored 작업 증거
`.omx/source-bound-evaluation-20261012/replay-saved-results.mjs`이고 SHA-256은
`0e9b6c5a76ddf5635ad15536f8e15b9405256fa4818dc851bbf55b40b4004ef8`이다. 정확한 source와
durable result SHA를 먼저 확인하고, 저장된 invocation의 id/text/provider/method/block/line/timestamp와
현재 재구성 ledger가 같은지 검사한 뒤 저장된 raw proposal을 v39 verifier에 넣는다.
모델·네트워크 호출 수는 모두 0이다.

결과 `.omx/source-bound-evaluation-20261012/replay-result-v2.json`의 SHA-256은
`d94221b0f6e4caae0b976e8097c9656731b1e3c40becc1f6a13da1670492f269`이다.

| 영상 | immutable source SHA-256 | 저장 result SHA-256 | v38 → v39 실제 차이 |
|---|---|---|---|
| `D9jzKcu9Snc` | `ccb47ccf7b40c6ebacdc6ea1a6b5b07736546b9decaebbb2cc4d57a4e513cb11` | `fd20faf126ed85724295ecfd0b8c056576e91d2f38d02c70abf1c469a1c49c13` | `통삼겹살` unknown→`500 g explicit`, 두 번째 `소금` unknown→`1 티스푼 explicit`; verified explicit 0→2, rejected 3→1 |
| `AtGAVBl1vrQ` | `074b583eb201f3bcc1da1eae43466d0d9bce33bef91552ce85a95bec2a4ffefc` | `89d71e1a5761faf183774336f75079509f2df5af7ab64f998738b9e71d3084ae` | `돼지고기 앞다리살` unknown→`400 g explicit`; verified explicit 10→11, rejected 1→0. `양파`는 `2개` 한 행이며 `500g`은 reference로만 보존 |
| `eJyoszbyNNQ` | `46dce89f7a2ae3d5986d7cd8306259e1f350d61761b38bdc9b0962f8a502f345` | `bb1fa2234ae70976e7f12b10e141222cfb1604835eb4aca3a379d1f03af06526` | 최종 출력 변화 없음. amount-first 7행 결속과 primary/reference 좌표는 생성되지만 기존 `estimated` 두 행은 덮지 않음 |

이 replay는 verifier까지의 결과다. 최초 진단에서 목표 재료의 DB 연결 성공은 확인됐지만 이번
오프라인 replay는 DB를 다시 조회하지 않았다. bridge 회귀에서는 같은 source-bound 후보가
단일 재료 사전 match일 때만 수량을 유지하고, match 0개 또는 다중 후보면 amount/unit을 null,
quantity source를 unknown, review-required를 true로 바꾸는 것을 mock 사전으로 확인했다.
별도의 async worker 회귀는 transient basis가 SQL 입력에서 기존 `stated`로 정규화되고, SQL
resolver 결과가 `resolved`이면 그대로 유지되며 그릇·접시 같은 `unresolved`/`needs_review`면
`unknown/null`로 강등된 payload만 최종 persistence RPC에 전달됨을 확인한다. resolver 응답이
없거나 index가 어긋나면 저장하지 않고 fail-closed한다.

`eJyoszbyNNQ`의 `½ Onion`은 단위가 없어 계속 unknown이다. Olive Oil/Balsamic Vinegar는
저장 raw가 `estimated`여서 보수적 비덮기 정책상 그대로이고 Garlic의 기존 conflict도
유지한다. D9의 시각 원천 `한두 꼬집`과 honey conflict 역시 이번 literal source 복구 범위가
아니다. 이는 누락을 숨긴 결과가 아니라 남은 검수 범위다.

## 회귀 검증 범위와 한계

fixture/mock 검사는 제목 있는/없는 연속 목록, description/comment, comment block 분리,
한글/영문, 줄바꿈·일반 bullet·emoji bullet·NFKC, description/comment 일치·불일치,
name-first/amount-first, primary/reference 좌표, 반복 투입, 대체·조건·부정·행동·범위·정성·
다중 소유자, 기존 상태 비덮기와 owner 중복 소비 차단을 포함한다.
숫자형 비재료 emoji 목록, 관계 표지 없는 인접 수량, 닫히지 않은 reference 괄호와 재료 사전
미해결 source-bound 후보의 fail-closed 처리와 저장 RPC 전에 transient basis가 제거되는지도
포함한다.

이 결과는 결정적 verifier 코드와 저장된 세 raw proposal에 대한 재검증만 증명한다. 새 모델
호출에서 모델 출력이 개선됐다는 뜻이 아니며 P5 통과, 운영 반영, 새 영상 다운로드 성공을
뜻하지 않는다. DB/API/UI/저장 계약과 canonical 레시피·플래너 파일은 변경하지 않았다.
async worker에 request-local index와 기존 SQL resolver의 authoritative 결과를 최종 persistence
직전에 확인하는 gate만 추가했으며 운영 DB에는 migration을 적용하지 않았다.
