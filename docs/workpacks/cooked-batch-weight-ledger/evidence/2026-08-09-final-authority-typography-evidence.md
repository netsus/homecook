# Final-authority typography repair fresh evidence — 2026-08-09

## 역할과 범위

- 역할: Homecook #8 `cooked-batch-weight-ledger` final-authority typography repair의 fresh evidence generator
- 위임 source task: `019fe028-be31-76f2-a5a7-986000a93374`
- P2 author, prior authority, Stage 5와 다른 evidence-only 작업이다.
- 제품 코드와 테스트를 수정하지 않았다.
- Stage 5, final product-design authority, Stage 6, PR #1311 branch/body/Ready/merge, Discord, capability/production write를 수행하지 않는다.
- 이 문서는 fresh runtime·PNG evidence를 기록할 뿐 approval 또는 authority verdict를 내리지 않는다.
- Claude CLI, Claude 앱, Claude API를 사용하지 않았다.

## Exact source lock

| 항목 | exact value |
| --- | --- |
| repair branch | `fix/cooked-batch-stage4-cta-typography-p2` |
| repair commit / evidence parent | `8791ce66484dd468a9f2dba77b75d09b24e1d1db` |
| repair tree | `ad346bc8a0472ea05c8aa8feb145452678f04572` |
| parent product head | `02b77e018d6d02bfbb82feb0b97d51e41e463923` |
| evidence-only branch | `docs/cooked-batch-final-authority-typography-evidence` |
| fixed finding | 두 #8 completion footer CTA에 scoped `text-base` 16px 적용 및 component/E2E regression 추가 |

작업 전 `HEAD`, tree, parent를 직접 확인했고 위 값과 모두 일치했다. 불일치 상태나 `origin/master` 기반으로 캡처하지 않았다.

직접 읽은 입력은 `AGENTS.md`, `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`, #8 `README.md`·`acceptance.md`·`automation-spec.json`·관련 evidence, `docs/engineering/product-design-authority.md`, `docs/design/mobile-ux-rules.md`, `docs/design/design-tokens.md`, prior authority report commit `93deffdd`, repair commit `8791ce66`의 code/test diff다.

## Canonical capture와 fresh 결과

Exact command:

```bash
PLAYWRIGHT_REUSE_EXISTING_SERVER=0 pnpm test:e2e:regression:ci --grep cooked-batch-weight-ledger
```

각 실행은 기존 서버를 재사용하지 않고 Playwright web server를 새로 시작했다. exact repair source에는 typography E2E가 desktop/mobile 두 프로젝트에 추가됐기 때문에, prior authority report의 `9 passed / 1 intended skip`에서 fresh repair 결과는 `11 passed / 1 intended skip`으로 정확히 2 pass 증가한다. 총 수집은 `12 tests = 11 passed + 1 intended skip`이며, skip은 세 viewport를 스스로 설정하는 capture test의 `mobile-chrome` 중복 실행 1건이다.

| clean-server run | exact result | desktop 1280 SHA-256 | mobile 390 SHA-256 | narrow 320 SHA-256 |
| ---: | --- | --- | --- | --- |
| 1 | `11 passed / 1 intended skip` | `3a5fe330b39ea48da7f1ff5900ac1608748f99cb5f9934341ba8a36d3064297c` | `8c2586bba25f55562cb88891d60e028b0c3d931b41513067c0895dd6b10b92f9` | `67f59c7536ec6b57e5c83e0b8327630ed161653abd431c25bafb1d1273555027` |
| 2 | `11 passed / 1 intended skip` | `3a5fe330b39ea48da7f1ff5900ac1608748f99cb5f9934341ba8a36d3064297c` | `8c2586bba25f55562cb88891d60e028b0c3d931b41513067c0895dd6b10b92f9` | `67f59c7536ec6b57e5c83e0b8327630ed161653abd431c25bafb1d1273555027` |
| 3 | `11 passed / 1 intended skip` | `3a5fe330b39ea48da7f1ff5900ac1608748f99cb5f9934341ba8a36d3064297c` | `8c2586bba25f55562cb88891d60e028b0c3d931b41513067c0895dd6b10b92f9` | `67f59c7536ec6b57e5c83e0b8327630ed161653abd431c25bafb1d1273555027` |

세 실행의 9개 결과 파일은 모두 byte-identical이다. visible typography token 변경 뒤 exact repair runtime에서 PNG를 새로 생성했지만, 캡처 픽셀과 PNG bytes는 prior committed evidence와 우연히 동일했다. 따라서 Git은 세 PNG를 새 blob/diff로 표현하지 않는다. freshness는 exact repair source에서 실행한 3회 clean-server command, 매회 fresh write 뒤 즉시 계산한 SHA-256, runtime assertions와 이 report로 증명한다. PNG bytes가 같다는 사실을 새 캡처 생략으로 해석하지 않는다.

> evidence:
> - `ui/designs/evidence/cooked-batch-weight-ledger/COOK_MODE-implementation-desktop-1280.png` — `1280×900`, SHA-256 `3a5fe330b39ea48da7f1ff5900ac1608748f99cb5f9934341ba8a36d3064297c`, fresh generated 3회, `view_image detail=original` 직접 검사
> - `ui/designs/evidence/cooked-batch-weight-ledger/COOK_MODE-implementation-mobile-default-390.png` — `390×844`, SHA-256 `8c2586bba25f55562cb88891d60e028b0c3d931b41513067c0895dd6b10b92f9`, fresh generated 3회, `view_image detail=original` 직접 검사
> - `ui/designs/evidence/cooked-batch-weight-ledger/COOK_MODE-implementation-mobile-narrow-320.png` — `320×568`, SHA-256 `67f59c7536ec6b57e5c83e0b8327630ed161653abd431c25bafb1d1273555027`, fresh generated 3회, `view_image detail=original` 직접 검사

## Runtime test evidence

| Runtime assertion | Fresh evidence |
| --- | --- |
| CTA typography | `돌아가기`, `완료 저장` 모두 390×844와 320×568에서 computed `font-size: 16px` |
| no wrap / clipping | 두 CTA 모두 `white-space: nowrap`, `scrollWidth <= clientWidth` |
| touch target | 두 CTA 모두 두 mobile 폭에서 computed height `>=44px`; capture flow는 모든 dialog button과 label을 `>=44px`로 검사 |
| default/hover/pressed contrast | 두 CTA를 390/320 각각에서 default, hover, pressed로 실제 전환하고 매 상태 computed foreground/background ratio `>=4.5:1` 확인 |
| enabled primary states | known-weight와 `weigh_later` 각각에서 primary CTA default/hover/pressed ratio `>=4.5:1`, serious/critical axe finding `0` |
| overflow / containment | 390/320 모두 document-level horizontal overflow `false`; dialog width/height가 viewport 안에 유지 |
| focus / Escape | Tab·Shift+Tab focus trap, Escape close, opener focus restore를 확인; pending submit 중 Escape는 sheet를 닫지 않음 |
| 422 recovery | mocked real `422 VALIDATION_ERROR` 후 alert focus, exact product selection과 `640` input 보존, `aria-invalid`, `aria-describedby`, error heading ratio `>=4.5:1`, serious/critical axe finding `0` |
| capture hygiene | fonts loaded, network idle, reduced motion, animation/transition/caret disabled, pointer hover neutral, settled paint, console error `[]` |

위 값은 정적 PNG에서 추정한 것이 아니라 `tests/e2e/slice-cooked-batch-weight-ledger.spec.ts`의 실제 browser computed style/geometry/state assertions가 세 clean-server 실행에서 모두 통과한 결과다.

## Original-size 직접 검사

### Desktop `1280×900`

- dimmed COOK_MODE whole-board 위 중앙의 narrow bottom sheet로 task context가 유지된다.
- header → no-guess 안내 → exact pantry rows → weight exact-one section → fixed footer 순서가 분명하다.
- `돌아가기`와 `완료 저장` 레이블은 한 줄로 선명하게 읽히고 서로 겹치거나 잘리지 않는다.
- footer가 sheet 폭 안에 있고 CTA와 본문 사이의 경계가 분명하다.

### Mobile default `390×844`

- viewport 폭 전체의 familiar bottom-sheet mental model, drag handle, title/close, internal body와 fixed footer 위계가 유지된다.
- 두 CTA 레이블은 16px button scale로 읽히며 한 줄을 유지한다.
- footer가 weight 설명 아래에 붙고 primary/secondary 너비와 색 위계가 분명하다.
- page-level horizontal overflow, CTA clipping, footer overlap이 보이지 않는다.

### Mobile narrow `320×568`

- pantry row가 body 내부에서 자연스럽게 이어져 내부 세로 스크롤 경계가 드러난다.
- narrow footer의 두 CTA는 한 줄이고, `완료 저장` primary가 `돌아가기`보다 강한 위계를 유지한다.
- footer가 화면 하단에 고정되며 CTA가 잘리거나 viewport를 넘지 않는다.
- 본문 일부는 의도된 internal scroll 아래에 있지만 footer가 핵심 조작을 가리지 않고 sheet hierarchy를 보존한다.

## Evidence limits

- 세 PNG는 초기 default/disabled completion state의 정적 이미지다. enabled known-weight/`weigh_later`, hover/pressed, mocked 422, focus 이동, Escape/pending lock, opener restore를 자체적으로 증명하지 않으며 이 항목은 fresh Playwright runtime evidence에 의존한다.
- screenshot은 virtual keyboard resize/occlusion, physical iOS Safari·Android Chrome/WebView, VoiceOver/TalkBack, 실제 손가락 touch 정확도 또는 full WCAG conformance를 증명하지 않는다.
- axe serious/critical `0`과 exercised contrast/geometry pass는 전체 accessibility approval을 뜻하지 않는다.
- PNG bytes가 prior evidence와 같으므로 Git tree는 캡처 실행 시각을 보존하지 않는다. 이 report의 3-run ledger가 regeneration provenance를 보완한다.

## Change boundary와 handoff

- evidence target은 위 canonical PNG 3개뿐이었다.
- unrelated generated evidence는 생기지 않았고, 제품 코드·테스트·공식 계약·workpack 상태를 변경하지 않았다.
- final commit은 이 fresh report만 tree diff로 기록한다. 세 PNG는 3회 재생성됐지만 parent와 byte-identical이어서 Git diff가 없다.
- fresh independent final authority task가 exact repair product head와 이 evidence commit을 별도로 검토해야 한다.
- `Design Status: pending-review`, lifecycle `in_progress`, Draft 상태는 이 작업에서 변경하지 않는다.

## Contract Evolution Candidate

없음. 이 작업은 기존 #8 scoped 16px typography repair의 evidence refresh이며 public endpoint/field/status/error/schema/capability를 변경하지 않는다.
