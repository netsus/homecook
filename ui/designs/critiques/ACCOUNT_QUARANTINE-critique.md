# ACCOUNT_QUARANTINE 설계 리뷰 — Round 4 Final

> 검토 대상: `ui/designs/ACCOUNT_QUARANTINE.md`
> 기준 문서: 요구사항 기준선 v1.7.22 / 화면정의서 v1.5.28 / 유저 Flow맵 v1.3.25 / account-session-generation-foundation workpack·acceptance·automation / 현행 디자인 토큰·모바일 UX·anchor 규칙
> 검토일: 2026-07-23 KST (UTC+09:00)
> 검토자: design-critic (independent Round 4 final re-review)
> Verdict: **PASS**
> Unresolved Blocker / Major / Minor: **0 / 0 / 0**

## 종합 평가

**등급**: 🟢 통과

**한 줄 요약**: Round 1–3의 blocker/major/minor가 모두 수리됐고, quarantine resolution의 계약·상태·파괴 행동 안전장치·모바일 UX·토큰·route gate가 Stage 1 구현 기준으로 일관되게 잠겼다.

`mobile baseline` 390px, `narrow mobile` 320px, recovery `primary CTA`, 단일 세로 `scroll containment`, safe-area, 최소 44px, auth-absent support-only, MYPAGE/auth callback route gate와 공식 anchor 분류가 모두 확인된다.

이 PASS는 Stage 1 markdown wireframe의 계약·UX 정합성만 승인한다. 구현 screenshot/Figma가 없는 현재 설계는 계속 `temporary`이며, Stage 4의 390/320/desktop 및 상태별 screenshot evidence와 별도 product-design authority 판정 전에는 구현 시각 품질 PASS 또는 `confirmed`로 간주할 수 없다.

## Round 4 최종 수리 확인

| Finding | 최종 설계 근거 | 결과 |
|---|---|---|
| B1 destructive separation / 공식 삭제 copy | delete review는 submit과 분리되고(`ACCOUNT_QUARANTINE.md:105-108`), confirmation sheet에서 공개한 사용자 등록 완제품과 공개 레시피의 익명화 보존 가능성, 개인 recipe·meal log·batch·private image 삭제 대상을 함께 보여준다(`:114-128`). 취소·Back·ESC·backdrop과 실패 후 재확인도 정의했다(`:130-132`, `:255-257`). | 닫힘 |
| B2 cleanup/pending/maintenance/conflict/stale 상태 의미 | 동일 요청 replay, payload conflict, `cleanup_pending`, maintenance, stale/unauthorized를 분리하고(`:258-262`), State Matrix가 loading/pending/replay/cleanup/error/conflict/unauthorized/auth-absent의 copy·action·retry·intent를 정의한다(`:264-277`). | 닫힘 |
| B3 generic back / gate bypass / non-applicable routing | generic back CTA를 금지하고(`:40`), browser back/forward/direct revisit re-gate, non-quarantine return target/MYPAGE 진행, production legacy non-exposure를 명시했다(`:240-248`). | 닫힘 |
| M1 내부 exact-session/generation/key User copy | 본인 확인과 recovery copy는 사용자 목적 중심이고(`:65-75`, `:177-180`), `IDEMPOTENCY_KEY_REUSED` User copy도 `요청이 달라 다시 확인이 필요해요`로 바뀌었다(`:272`). exact session/key는 implementation note에만 남는다(`:12`, `:254`). | 닫힘 |
| M2 320px status 비축약 | `narrow mobile` 상태 패널은 다중 행을 유지하고 핵심 copy의 ellipsis를 금지한다(`:164-167`, `:202-208`). | 닫힘 |
| M3 역할 토큰 / radius / gutter | quarantine은 `--warning*`, recovery `primary CTA`는 `--brand-primary*`와 `--control-height-lg`, destructive는 `--danger*`를 사용한다. surface/text/radius/gutter와 raw-hex 금지도 잠겼다(`:21-30`). | 닫힘 |
| m1 anchor 용어 | `Route Integration / Anchor Classification`에서 공식 anchor는 HOME/RECIPE_DETAIL/PLANNER_WEEK이며 이 화면은 `new-screen + high-risk` 독립 gate라고 구분한다(`:240-248`). | 닫힘 |
| m2 desktop FAQ 확장 | desktop은 보조 support rail만 사용하고 별도 help/support surface를 만들지 않는다(`:232-238`). | 닫힘 |
| m3 auth-absent support 중복 | auth-absent는 support card 한 개와 상태 card 한 개만 사용하고 outer support label 중복이 없다(`:136-161`). | 닫힘 |

## 크리티컬 이슈 (수정 필수)

없음.

## Major 이슈

없음.

## Minor 이슈

없음.

## 최종 체크리스트 결과

### A. 요구사항 정합성

- [x] quarantined lifecycle이 일반 Planner/MYPAGE보다 먼저 보이는 독립 interstitial이다.
- [x] auth-present는 `계정 복구 | 삭제 검토`만 제공하고 destructive submit은 별도 confirmation을 거친다.
- [x] auth-absent는 activate/delete CTA 없이 support / Manual Only만 제공한다.
- [x] final confirmation에 shared manual product/public recipe 보존 가능성과 private content 삭제 대상을 모두 표시한다.
- [x] `cleanup_pending` 202를 완료가 아닌 정리 시작 상태로 표시한다.
- [x] maintenance, idempotency conflict, stale/unauthorized를 서로 다른 상태와 복구 경로로 분리한다.
- [x] 삭제된 `DELETE /recipes/{id}/save`는 등장하지 않는다.

### B. 공통 상태 커버리지

- [x] `loading`, non-applicable/legacy non-exposure, retryable `error`를 정의했다.
- [x] pending/replay/cleanup_pending의 중복 submit 차단과 갱신 시점을 정의했다.
- [x] conflict, maintenance, unauthorized/session stale의 copy·action·이동을 분리했다.
- [x] auth-absent restricted/read-only에서 mutation CTA가 없다.
- [x] Idempotency-Key/session generation은 User copy가 아니라 내부 state/implementation note에만 둔다.

### C. 내비게이션 & 플로우

- [x] auth callback 또는 MYPAGE guard가 일반 content보다 gate를 먼저 렌더한다.
- [x] browser back/forward/direct revisit도 quarantined lifecycle을 re-gate한다.
- [x] unauthorized/session stale은 auth callback 뒤 동일 resolution intent로 return-to-action한다.
- [x] non-quarantine은 원래 return target 또는 정상 MYPAGE로 이어진다.
- [x] 공식 anchor screen 의존성은 없으며 anchor extension이 아닌 `new-screen + high-risk`다.

### D. UX 품질

- [x] `mobile baseline` 390px와 `narrow mobile` 320px를 각각 설계했다.
- [x] recovery가 가장 강한 `primary CTA`이고 delete는 review와 confirm으로 분리된다.
- [x] whole-page horizontal scroll을 금지하고 하나의 세로 `scroll containment`만 사용한다.
- [x] bottom safe-area padding과 최소 44px touch target을 명시했다.
- [x] 320px 상태 copy는 다중 행이며 ellipsis로 자르지 않는다.
- [x] destructive sheet의 취소·Back·ESC·backdrop·focus return을 정의했다.
- [x] auth-absent support panel과 status panel의 border/content 경계가 중복 없이 명확하다.
- [x] 글로우, 과도한 그라디언트, 장식 이미지 같은 AI형 generic UI는 없다.

### E. 도메인 규칙 정합성

- [x] resolution은 `activate | delete`이고 auth-absent는 Manual Only다.
- [x] 동일 요청 재진입은 새 mutation을 만들지 않는다.
- [x] different-payload conflict와 stale/unauthorized를 분리했다.
- [x] delete initiation 뒤 `cleanup_pending`을 완료로 표시하지 않는다.
- [x] 공개 owner-neutral content 보존 가능성과 private content 삭제 경계가 공식 계약과 일치한다.
- [x] meals, shopping, pantry, cooking, recipe-book 도메인 규칙은 이 화면에 해당하지 않는다.

### F. 디자인 토큰 준수

- [x] recovery `primary CTA`, quarantine warning, destructive action을 brand/warning/danger 역할 토큰으로 분리했다.
- [x] surface/text/radius/control token과 모바일 `--space-4` gutter를 명시했다.
- [x] raw hex와 구버전 token 직접 사용을 금지했다.
- [x] 최소 control height 44px와 primary CTA 48px 구조를 유지한다.

## design-generator 재작업 요청 항목

없음.

## Stage 1 통과 조건

- [x] Unresolved Blocker / Major / Minor `0 / 0 / 0`
- [x] auth-present activate/delete, auth-absent support-only, loading/error/pending/conflict/maintenance/unauthorized의 행동 계약이 workpack·acceptance·automation과 정렬됨
- [x] `mobile baseline`, `narrow mobile`, `primary CTA`, `scroll containment`, `anchor` 분류가 문서에 명시됨

## Stage 4 future authority gate

Stage 1 PASS와 별개로 구현 후에는 다음이 필수다.

- [ ] 390px `mobile baseline`, 320px `narrow mobile`, desktop screenshot 확보
- [ ] activate/delete/error/pending/conflict/maintenance/unauthorized 상태 evidence와 scroll 중 CTA/safe-area evidence 확보
- [ ] Stage 4 screenshot/Figma 기반 product-design authority report에서 blocker 0 확인
- [ ] authority gate 전 `Design Status: confirmed` 부여 금지
