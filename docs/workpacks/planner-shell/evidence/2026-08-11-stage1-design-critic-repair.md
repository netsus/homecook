# planner-shell Stage 1 design-critic repair evidence — 2026-08-11

## 역할과 경계

- repair author task: `019fecd2-df1e-7460-85cf-2ff08b0921c2`
- original author task: `019fecab…` (별도 task)
- design critic task: `019fecc9-c471-7e02-9722-43b6ca6f3d89` (별도 task)
- 이 작업은 critic의 B1/M1/M2/M3/minor 지적만 수리한다. 제품 코드, API, DB, schema, authority 판정, internal 1.5, Ready 전환, merge, Discord 알림은 범위 밖이다.
- fresh independent re-critique가 필요하며 이 문서는 자기 승인 증거가 아니다.

## 확인한 기준

- official tuple: 요구사항 `v1.7.30`, 화면정의서 `v1.5.34`, 유저 Flow `v1.3.32`, DB `v1.3.32`, API `v1.2.37`
- release ownership: `#8 -> #9 -> (#10, #11) -> #12 -> #13 -> #14`
- #9 merged code는 base `8ba3fa5a2a198eb4f9c19d59cea5f6ccc52fdd4f`에서만 소비한다. Manual/server-Mac/OAuth, merged-exact server-production/local-rehearsal, capability, `R/R+1/R+2`, activation은 계속 pending이다.
- #10은 Planner shell/plan-only PLANNER_WEEK만 소유한다. #11은 COOK_MODE/LEFTOVERS, #12는 MEAL_LOG body, #13은 compatibility tombstone을 소유한다.

## B1 — 승인 계획 원본 바이트 복구와 고정

기존 work item은 외부 절대 경로가 `d4d0… / 1,018줄`이라고 적었지만, 2026-08-11 현재 그 경로의 실제 바이트는 별도 2026-07-29 계획인 `45f02013fbc1c3af1936d596605230d0cbac7839a783224aa9535844e4bda7dc / 1,056줄`이었다. SOT가 두 계획을 별도 lineage로 열거하므로 후자를 #10 승인 계획의 superseding artifact로 취급하지 않았다.

복구 근거:

1. 2026-07-23 Codex session 기록(예: `019f8b24-b033-7b93-890d-e79bdb376bfb`)에는 당시 승인 파일을 직접 읽은 출력 조각과 `sha256sum`/`wc -l` 결과가 남아 있다.
2. 그 raw 출력 조각과 이후 파일에서 변경되지 않은 구간을 바이트 순서대로 결합했다. 내용을 새로 쓰거나 누락 구간을 추정하지 않았다.
3. 복구 결과는 `233,219 bytes`, `1,018` newline-terminated lines이며 SHA-256이 승인값과 정확히 일치했다.
4. exact bytes를 `docs/workpacks/planner-shell/evidence/cooking-meal-log-and-product-search-master-plan-20260722.md`에 고정했다.
5. `tests/planner-shell-stage1-relock.test.ts`는 이제 설명 문자열이 아니라 이 파일의 실제 존재, SHA-256, 줄 수, governed-path 참조와 외부 절대 경로 제거를 검사한다.

고정값:

```text
path: docs/workpacks/planner-shell/evidence/cooking-meal-log-and-product-search-master-plan-20260722.md
bytes: 233219
lines: 1018
sha256: d4d0fb39e80eeffc8b1e73ad92f0d91a35a9b6adc57a556ea8c9ec6ecffa951d
```

## M1 — 반응형 containment 계약

- 390px, 320px, desktop 모두 7-day containment와 첫 viewport의 at least 2-day overview를 잠갔다.
- 사용자 설정 1/3/5 meal columns, long custom meal names, 200% text scaling, localization expansion을 같은 스트레스 매트릭스에 포함했다.
- planner-local scroll/sticky 경계, page-level overflow 금지, bottom-tab safe-area와 device keyboard clearance를 분리해 적었다.

## M2 — 빈 슬롯 계약

- 빈 슬롯은 공식 문구 `비어 있음`만 표시한다.
- tap은 current behavior를 유지하고 future slice가 future behavior를 결정한다.
- 새 add affordance/empty CTA는 현재 implementation contract가 아니며, 필요하면 별도 승인된 Contract Evolution Candidate로만 다룬다.

## M3 — 키보드와 focus 계약

- selected tab만 `tabindex=0`인 roving tabindex를 잠갔다.
- Arrow Left/Right와 Home/End는 tablist 안에서 focus와 selection을 함께 이동한다.
- Tab은 selected panel로 들어간다.
- 보통의 segment 선택은 panel/heading에 강제 focus하지 않는다. 강제 진입점은 deep-link/auth-return/invoker-loss fallback으로만 제한했다.

## 증거 분리

- `PNG static-layout proof`: viewport geometry, containment, overview, columns, wrapping, sticky/safe-area, overflow만 증명한다.
- `Playwright history/focus/Escape proof`: history/back, roving focus/selection, Tab entry, trap/restore, Escape sequence를 증명한다.
- `Manual physical keyboard/screen reader/device keyboard proof`: physical keyboard, VoiceOver/TalkBack, real-device safe-area와 device keyboard를 증명한다.

## TDD와 후속 게이트

- RED: artifact 부재와 M1/M2/M3/minor 계약 누락으로 focused test 4건 실패를 확인한 뒤 문서를 수정했다.
- GREEN과 전체 검증 결과는 이 repair commit/PR body에 기록한다.
- 이 repair 이후에도 fresh independent design critic, internal 1.5, security/compatibility, five-axis, product-design-authority, Stage 3/5/6이 각각 별도 task에서 필요하다.
