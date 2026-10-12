# YouTube 설명란·작성자 댓글 원천 결속 수량 복구

## 상태

- 날짜: 2026-10-12
- 기준: `7e466b170ba39795220ef64e67eac3fab4429420`에서 분기한 독립 작업 브랜치
- 구현: 로컬 완료, 운영·DB·웹 미반영
- 런타임 후보: `v64-source-bound` (source-anchored client v64, verifier v38)
- 모델·OCR·영상 다운로드·네트워크 평가: 0회

여기서 `v64-source-bound`는 과거 P5 v64를 재사용한 이름이 아니다. 이 문서의 기준
commit에서 새로 만든 source-bound 후보이며, 정확한 client/verifier/pipeline identity와
bundle hash를 아래에 함께 고정한다.

## 확인한 문제

읽기 전용 진단
`.diagnostics/youtube-description-quantity-20261012/diagnosis.json`의 SHA-256은
`9c0fabe8e6422391576f14a98ec898644096090a0fa7d010696c5150784247e1`과 일치한다.
운영 v63에서 공식 설명란 또는 작성자 댓글에 명시된 `통삼겹살 500g`,
`돼지고기 앞다리살 400g`, `양파 2개(500g)`가 post-verifier 결과에서
`unknown/null`로 남은 사례가 있다. 저장된 pre-verifier raw 모델 JSON은 없으므로
모델 누락과 검증 강등의 개별 비율은 이 진단으로 나누지 않는다.

모델이 제출한 이름이나 evidence ID만 보고 `unknown`을 승격하는 방식은 안전하지 않다.
이번 변경은 서버가 source ledger를 만들 때 닫힌 재료 행의 재료명과 literal 수량을
먼저 결속하고, 기존 verifier가 같은 원천 재료 행을 독립적으로 확인한 경우에만
기존 explicit 검증을 다시 실행한다.

## request-local 결속 계약

`buildSinglePassEvidenceLedger`는 source marker마다 `source_block_index`를 부여한다.
작성자 댓글 묶음의 `---`도 별도 source block으로 취급하되 기존 `line_index`는
댓글 묶음 전체에서 단조 증가하도록 유지한다. 따라서 서로 다른 작성자 댓글 행은
목록 연속성이나 수량을 공유하지 않는다.

source-anchored 모드의 YouTube description/comment 중 다음만 request-local
`sourceQuantityBindings`를 가진다.

1. 명시적인 재료 제목 아래의 닫힌 한 재료 행
2. 같은 source block 안에서 연속한 안전한 닫힌 재료 행 2개 이상

각 결속은 NFKC·공백 정리된 ledger 행을 기준으로 다음을 보존한다.

- 정확한 `sourceName`
- primary `amount`, `unit`, literal
- 재료명과 primary 수량의 `[start, end)` 정규화 좌표
- 괄호 안 reference 수량과 좌표
- source provider/method/block/line 및 owner evidence ID
- 같은 block의 반복 numeric owner 존재 여부

이 값은 모델 prompt의 정답이나 저장 필드가 아니다. request-local ledger에서 verifier로만
전달된다. 기존 owner-hint 버전과 prompt v17은 그대로이며, 작성자 댓글에 새 결속이
생겨도 prompt owner-hint packet은 바뀌지 않는 회귀를 고정했다.

## 복구와 보수적 보존

- raw 행이 정확히 `quantityState=unknown`, `amount=null`, `unit=null`일 때만 후보가 된다.
- 모델의 표시용 이름이나 검증 전 evidence ID 자체는 승격 근거가 아니다. 모델
  `sourceName`은 서버 결속 후보를 찾는 키로만 사용하고, 기존 verifier가 원문 이름과
  literal evidence owner 하나를 문제 없이 결속한 baseline 행이어야 한다.
- 선택한 서버 owner의 이름·수량·전체 원문 evidence로 raw 행을 다시 구성한 뒤 기존
  explicit verifier를 다시 통과한다. 대상 밖 행과 issue가 달라지면 복구하지 않는다.
- 하나의 서버 owner를 둘 이상의 모델 행이 요구하거나, 한 block에 같은 이름의 반복·다중
  numeric owner가 있으면 승격하지 않고 검수 대상으로 남긴다.
- description과 author comment가 primary 및 reference까지 같으면 description owner를
  우선한다. 서로 다르면 값을 조립하거나 덮지 않고 `conflicting`으로 보존한다.
- 결속 밖의 대체재·조건·부정·조리 행동·범위·근사·정성량·추가 투입·다중 소유자 언급은
  복구를 막는다.
- 기존 `explicit`, `estimated`, `to_taste`, `conflicting`은 덮지 않는다.
- `양파 2개(500g)`는 `2개`만 primary로 복구한다. `500g`은 reference 좌표와 원문
  evidence에 남기며 합산·환산·대체하지 않는다.

## 버전·무결성

- client: `codex-vision-source-anchored-v64-source-bound-quantity-recovery`
- verifier: `source-anchor-fidelity-v38-source-bound-quantity-recovery`
- prompt: `source-anchored-single-recipe-v17-source-first-quantity` (변경 없음)
- selector: `deterministic-evidence-v3-ingredient-event-preserving-largest-gap` (변경 없음)
- OCR policy: `source-anchored-full-frame-ocr-v1` (변경 없음)
- source binding: `source-quantity-bindings-v1`
- execution config signature: `72912a139bef413676f9c3ae`
- candidate pipeline identity: `f0d7a43869f533050c7357afaa0994b4e01e980adbc2d9ece290859bf33cb6d0`
- runtime bundle SHA-256: `4b67adadf5490261b91736399050dc71ed70f7f870fb369ebca070b766092b6e`
- bundle manifest SHA-256: `18073207e185266b6328d8ed39462d79e80666cfd7a73c9de2b864629a7bb025`
- `single-pass-vision.mjs`: `666f45888412b6a6ad1853e3e7f4a1706d66f3b35ea6318042edb3806dc0825c`
- `source-anchored-vision.mjs`: `bdf5ccf5683819d56addf4235bbb621915ff3600fd6154bbd1a218c086f77b0c`
- `source-quantity-owner-hints.mjs`: `2e2dcf582b529e705c7f7a0c3e6039e78a2e3e483bd9e0c8abd338caa46ffbae`

pipeline identity는 exact runtime identity와 Codex CLI version의 canonical JSON SHA-256이다.
bundle manifest에는 변경된 세 모듈의 실제 SHA-256을 반영했다. 운영의 v63/policy3
pipeline identity와 배포 계약은 바꾸지 않았으며, 이 후보를 운영에 적용하려면 별도
배포 승인과 정책 회전 검토가 필요하다.

## 최소 3건 평가 입력과 캐시 상태

평가 대상은 다음 순서로 고정했다. allowlist 순서도 이 표와 같아야 한다.

| 순서 | 영상 | 확인할 원천 | 현재 로컬 상태 |
|---:|---|---|---|
| 1 | `D9jzKcu9Snc` · <https://www.youtube.com/shorts/D9jzKcu9Snc> | 작성자 댓글 | 진단에 `통삼겹살 500g` 등 post-verifier evidence만 있음. 완전한 immutable `source.json`이 없어 실평가 불가 |
| 2 | `AtGAVBl1vrQ` · <https://www.youtube.com/shorts/AtGAVBl1vrQ> | 작성자 댓글 | 진단에 `돼지고기 앞다리살 400g`, `양파 2개(500g)` 등 post-verifier evidence만 있음. 완전한 immutable `source.json`이 없어 실평가 불가 |
| 3 | `eJyoszbyNNQ` · <https://www.youtube.com/watch?v=eJyoszbyNNQ> | 설명란 | `notebooks/recipe_loop_data/train/eJyoszbyNNQ/source.json`, SHA-256 `46dce89f7a2ae3d5986d7cd8306259e1f350d61761b38bdc9b0962f8a502f345`; `RECIPE` 아래 `1/2 lb | 250g Spaghetti`, `½ Onion`, `2 Cloves Garlic`, `2 Cups | 500ml Water` 등이 있어 source cache 준비 완료 |

앞의 두 영상에 공통으로 재사용 가능한 것은 진단 JSON SHA-256
`9c0fabe8e6422391576f14a98ec898644096090a0fa7d010696c5150784247e1`뿐이다.
이 진단은 전체 author-comment source snapshot이나 pre-verifier 모델 입력을 대체하지 않는다.
따라서 두 건을 실제 추출 평가하려면 새 공개 원천 수집과 snapshot 고정이 필요하며, 이는
현재 승인되지 않은 네트워크 작업이다. 세 번째 건의 기존 `golden.json`은 실추출 입력으로
읽지 않는다.

세 번째 영상은 기존 prepared media도
`/Users/cwj/01_vibe_coding/homecook/.omx/p5-v70-dev30-20261011/media-cache/eJyoszbyNNQ/source.136.mp4`
에 있고, 42,787,256 bytes 및 SHA-256
`c5b95544cf37fd126c7d0a24f39e7db7542a765901bbf2c5b26e5c7e86ffe697`를 확인했다.
preparation manifest SHA-256은
`20e4474517f792e7857bad1f9c4792b20d0be06e7e2de2a9f6abc9e7100173f6`, media index SHA-256은
`eb72573cf91948ba432d2f39274c5b8a013111cf07969f4307fb4c04d30382ec`이다. 같은 index에는
앞의 두 Shorts가 없다. 따라서 `eJyoszbyNNQ`만 새 다운로드 없이 source/media 입력을 만들
수 있고, 두 Shorts는 새 source snapshot과 media 확보가 모두 필요하다. 캐시 존재는 OCR
또는 모델 실행 승인으로 간주하지 않는다.

캐시 상태와 후보 hash만 확인하는 네트워크 없는 명령은 다음 하나다.

```sh
node scripts/recipe-loop/source-bound-evaluation-preflight.mjs --preflight-only
```

이 CLI는 `--execute`를 제공하지 않는다. 현재 출력은
`status=source-cache-incomplete`, `liveExecutionAvailableFromCli=false`, 준비 1/3이다.

## 평가 승인·provider 경계

`evaluation-dispatch-authorization.mjs`는 오프라인으로 다음 fail-closed 계약을 검증한다.

- host가 검증한 `role:user` 메시지의 정확한 grant만 허용
- host 설정 allowlist와 요청·승인 allowlist가 순서까지 정확히 일치
- 총 dispatch 예산은 allowlist 길이와 같고 영상별 1회
- 호출 전에 request authorization과 영상별 소비 marker를 영속화
- 같은 request ID의 다른 승인, allowlist 밖 영상, 재시도 및 불확실한 실패 후 재실행 거부

따라서 사용자 승인 1회가 정확한 영상 3개·총 3회·영상별 재시도 없음으로 명시되면 그
범위를 표현할 수 있다. `source-bound-evaluation-runner.mjs`는 이 controller를 최소
3건 runner에 연결해 다음 순서로 동작한다.

1. 세 source snapshot의 경로·SHA-256·영상 URL·필수 description/comment를 모두 확인한다.
2. host가 검증한 최신 `role:user` grant를 exact allowlist·후보·호출 계약에 결속한다.
3. 영상별 소비 marker를 먼저 exclusive/durable 생성한다.
4. primitive provider 콜백 직전 마지막 await에서 candidate git/bundle/pipeline identity를
   다시 읽어 승인 후보와 비교한다.
5. provider 콜백을 정확히 한 번 호출하고 telemetry가 model 1, selector 0, repair 0,
   retry 0인지 확인한다. 불확실한 실패도 이미 소비된 것으로 남긴다.

runner가 받는 `invokeProviderOnce`는 단일 provider request를 수행하는 신뢰 host adapter여야
한다. 저장소에는 authoritative message store를 읽는 API나 그러한 support-tool adapter가
없으므로 이를 셸 환경 변수, 모델이 만든 승인 파일, timestamp만으로 대체하지 않는다.
`verifyRoleUserMessage` mock은 단위 테스트에서만 사용한다. 실제 실행에는 (a) 별도 사용자
메시지, (b) 그 메시지를 직접 검증하는 support tool, (c) 모델 호출 명령에 대한 별도 tool
approval, (d) 모델 sandbox 밖의 host-owned budget/log directory가 모두 필요하다.
현재 runner는 adapter가 반환한 telemetry를 사후 확인하므로 거짓 adapter 자체를 방어하지
않으며, prepared media 경로·hash도 아직 request grant에 결속하지 않는다. live adapter를
추가할 때는 primitive dispatch 구현과 media binding을 함께 독립 검토해야 한다.

budget marker의 계약 경로는 host가 제공한 절대 `budgetDirectory` 아래
`<sha256(requestId)>/authorization.json`과
`<sha256(requestId)>/<sha256(videoId)>.json`이다. 실제 host directory와 provider log/receipt
경로는 아직 support-tool adapter가 없고 실행도 승인되지 않았으므로 존재하지 않는다.
mock은 OS 임시 디렉터리만 사용하고 테스트 종료 시 삭제한다. old dev30/P5 runner와 그
`approval.json`·receipt는 이 경계에 입력할 수 없다.

## 검증 범위와 한계

네트워크 없는 fixture/mock으로 제목 목록, 제목 없는 연속 목록, description/comment,
댓글별 `---` block 분리, 한글/영문, 줄바꿈·bullet·NFKC, 설명/댓글 일치·불일치,
primary/reference 보존, 반복 투입, 대체·조건·부정·행동·범위·정성·다중 소유자,
기존 상태 비덮기와 owner 중복 소비 차단을 확인한다.

이 검증은 결정적 코드 경로만 증명한다. 실제 모델 성능 개선, 공개 Shorts 재추출 성공,
P5 통과, 운영 반영을 증명하지 않는다. DB/API/UI 저장 계약은 변경하지 않았으며 별도
canonical 저장·플래너 작업 파일도 수정하지 않았다.
