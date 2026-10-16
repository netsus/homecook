# 출처 충돌 수량 선택 — 로컬 v75 후보, 2026-10-16

## 상태와 승인 범위

사용자는 출처가 충돌할 때 설명란·작성자 댓글의 재료량을 우선하도록 개선을 승인했다. `origin/master`의 `67e6d0c2be2eeef3831b45855755d9dada4925f4`에서 별도 브랜치 `codex/youtube-source-priority-conflicts-20261016`로 구현했다. 이 문서는 기존 v72 기록의 충돌 시 null 정책을 보완한다. 운영 상태는 [v74/gen49 기록](youtube-v74-operating-20261016.md)을 따른다.

이번 작업은 결정론적 검증 규칙, 결과 근거 전달, 저장 응답 재생과 로컬 커밋만 포함한다. 추가 모델·미디어 호출, DB·스키마·인증·권한 변경, 배포, credential 발급, gen49 재발급은 하지 않았다. text-first / conditional-vision 실행 라우팅은 **미구현**이다. 화면·실사용 HTTP 흐름, 실제 저장 DB와 빌드는 이번 범위에서 실행하지 않았다.

## 선택 규칙과 근거 경계

1. 영상 채널 ID와 실제 댓글의 작성자 채널 ID가 일치하며, 명시적 정정 대상이 정확히 확인된 작성자 정정.
2. 닫힌 설명란 재료 행의 명시 수량.
3. 닫힌 작성자 댓글 재료 행의 명시 수량.
4. 자막·화면의 수량은 상위 출처에 값이 없을 때 기존 검증 규칙으로 보완.

낮은 출처와 다르다는 이유만으로 상위 출처 수량을 null로 바꾸거나 평균하지 않는다. 같은 출처의 서로 모순되는 수량은 `conflicting`으로 남기며 환산할 수 없는 단위를 임의 환산하지 않는다. 모델이 직접 선택한 동일 원문의 병기 중량도 유지한다. 같은 최고 우선순위에서는 직접 인용된 owner를 먼저 사용하며, 다른 재료 행이 직접 인용한 별도 사용량을 합치지 않는다. 명시된 소스·양념 역할도 분리한다.

정정 문법은 1차로 `정정: 설명란 [소스] 미림 30ml → 미림 20ml`처럼 **출처·기존 tuple·새 tuple**이 있는 닫힌 형태만 지원한다. `수정:`·`오타 정정:`과 `->`도 허용한다. 역할 표기는 선택이며, 없으면 기존 대상이 유일해야 한다. 기존 수량 원문 전체가 정확히 하나의 owner와 맞고 새 tuple도 같은 재료로 결속되어야 한다. 단순 최신 댓글, 채널 미확인 댓글, 대상 불일치, 조건·부정·범위·근사량은 이 최우선 정정으로 승격하지 않는다. 자유 문장 정정의 일반 해석은 추가 범위다.

작성자 검증 정보는 snapshot → worker `sourceToInput` → extraction → single-pass ledger로 별도 전달한다. 텍스트의 `author_comment` marker만으로 정정 권위를 만들 수 없다. 댓글 본문의 `---`를 댓글 경계로 오인해 검증 ID를 잃지 않도록 실제 작성자 댓글의 원문 행과 대조한다. 기존의 일반 작성자 수량 경로는 서버 수집기의 author-channel 필터를 그대로 사용한다.

## 원문과 정규화 값

각 재료의 `amount`, `unit`, `amountRawText`, `evidenceRefs`가 선택 수량과 원문 근거다. `quantitySelection`에는 정책 버전, 선택 evidence ID, 정정 대상 evidence ID와 낮은 출처의 결속된 대안 수량·단위·원문 ref를 보존한다. 이름이나 수량이 결속되지 않은 기존 인용은 `unresolvedEvidenceRefs`에 원문만 남긴다. 이 항목에 임의 수량 소유권을 부여하지 않는다. 대안 상한 16개를 넘으면 새 우선 선택을 적용하지 않고 기존 검증 경로로 남긴다.

동일 metadata를 verifier 결과 → recipe 정규화 → worker evidence sanitizer → 웹 parser까지 전달한다. 배열·문자열·출처·선택 ref 포함 여부를 경계에서 검증한다. DB 컬럼이나 저장 권한은 변경하지 않았다. 기존 원시 model proposal과 trace를 덮어쓰지 않았다.

## 저장된 실제 응답 재생

[재생 증거 JSON](evidence/youtube-source-conflict-priority-replay-20261016.json)에 입력 경로·SHA256·전후 변화·정답지 hash를 보존했다. 낙지·양파는 기존 v73 실평가 raw/ledger, 소갈비찜은 마지막 v74 실평가 raw/ledger를 사용했다. 같은 입력을 master v74 verifier와 후보로 각각 순수 재생했다. 소갈비찜의 수정 전 결과는 저장된 v74 trace 전체 객체와 일치했다. 다른 두 입력의 비교 기준도 모델을 다시 부르지 않고 재생한 master v74 결과다.

- 기존 정상 숫자 30개(낙지 15, 양파 7, 소갈비찜 8)를 모두 유지했다. 재료 행 수와 조리 단계는 세 입력 모두 그대로다.
- 유일한 수량 변화는 낙지 식용유 `conflicting/null` → 설명란 `2 / 스푼`, 원문 `식용유 2스푼 16g`이다. 원문 병기 16g을 보존하며 새 환산은 하지 않았다.
- 자막 `식용류 두 스푼 12g`은 이름이 엄격하게 결속되지 않아 12g을 정규화 대안으로 단정하지 않고 `unresolvedEvidenceRefs`에 원문 그대로 보존했다. 두 양을 정답으로 인정하는 고정 정답지는 변경하지 않았다.
- 낙지 미림의 별도 3스푼·4스푼 행, 양파 오일 모호량, 기존 caption 숫자가 유지됐다. 약간을 5g으로 바꾸지 않았다.
- 소갈비찜의 간장 미해결·마늘 누락·후추 모호량 문제는 이 규칙만으로 해결되지 않았고 새 정답지로 덮지 않았다.
- 이번 모델·미디어 호출 0회다. 새 추출 점수나 전체 P5 통과 판정으로 취급하지 않는다.

## 로컬 후보 identity

- client: `codex-vision-source-anchored-v75-authored-conflict-priority`
- verifier: `source-anchor-fidelity-v48-authored-conflict-priority`
- execution config signature: `e16baf5eaf4207380356eb02`
- pipeline identity: `bae1f73d12eab8a147f69fd433b0ff3b39d8de45ae5746e96e96e73e60d46395`

bundle manifest, 웹 exact identity와 pipeline을 함께 일치시켰다. 이것은 로컬 후보이며 운영 v74 worker·웹·정책을 바꾸지 않는다.

## 검증

- 관련 Vitest 7개 파일 **347개 통과**, 실패·건너뜀 0. 작성자 검증, 정정 대상·역할, unknown/null 충돌, 같은 출처 모순, 용도 분리, 병기량, 단위 환산 금지, 기존 guard, metadata 정규화·웹 파싱, runtime byte/identity 일치를 포함한다.
- `pnpm typecheck`, `pnpm verify:anti-slop`, 선택 ESLint와 `git diff --check` 통과. Anti Slop 신규 위반 0이며 baseline을 늘리지 않았다.
- 독립 검토에서 unknown/null 충돌, 역할 지정 정정, 환산 불가 자막 대안, 댓글 내부 구분선 사례를 찾아 수정·회귀 검사했다. 최종 독립 재검토에서 추가 결함을 발견하지 못했다. 독립 검토는 순수 검증으로 수행했고, Vitest cache 권한 때문에 독립 에이전트의 Vitest는 시작 전에 실패했다. 위 347개는 구현 작업에서 정상 실행한 결과다.
