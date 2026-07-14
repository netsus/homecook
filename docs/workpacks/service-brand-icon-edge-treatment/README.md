# Slice: service-brand-icon-edge-treatment

## Goal

브라우저 탭에서 공식 `무먹` favicon의 흰색 모서리가 드러나지 않게 하고, 설치/PWA·Apple 아이콘도 각 플랫폼의 mask와 자연스럽게 맞도록 정리한다. 선택한 공식 source와 header·OG/Twitter 자산은 그대로 보존하고, 파생 아이콘의 외곽 픽셀만 용도별로 다르게 처리한다.

## Approval And Ownership

- 사용자 승인: 2026-07-14. 실제 browser tab에서 흰색 favicon 모서리를 확인한 뒤 수정을 명시 요청했다.
- change type: `contract-evolution` + 후속 FE-only `ui-polish`.
- 이 작업은 `service-brand-image-assets`의 Codex-only 연속 작업이다. Stage 1 docs, Stage 4 구현, 독립 review를 역할 분리하고 작성·구현 작업은 자기 변경을 최종 승인하지 않는다. 전역 workflow actor 규칙은 바꾸지 않는다.
- 이 Stage 1 PR은 공식 계약, workpack, workflow metadata만 포함한다. runtime 이미지와 제품 코드는 docs PR merge 뒤 별도 구현 PR에서 수정한다.

## Branches

- 문서: `docs/mumeok-icon-edge-contract`
- 백엔드: N/A — API/DB 변경 없음
- 프론트엔드: `feature/fe-service-brand-icon-edge-treatment`

## Canonical Asset Contract

| 용도 | 규칙 |
| --- | --- |
| 선택 source | `ui/designs/brand/mumeok/exports/source/mumeok-symbol-selected-source-1254.png`, SHA-256 `7ada6b0bcdd46a78a11b353c89e3506ac6288b31a20df321abe097b02738ffe4` 유지 |
| favicon | 16/32/48/64 PNG와 ICO. 파란 둥근 사각형 바깥 alpha `0`, 흰색 matte·halo 없음 |
| 설치/PWA | 192/256/512/1024 PNG. 캔버스 전체가 브랜드 파란 배경이고 흰색 외곽 모서리 없음 |
| Apple touch | 180 PNG. 설치/PWA와 같은 full-bleed 파란 배경 |
| header | 기존 `public/brand/mumeok-symbol-192.png`를 변경하지 않고 같은 hash의 `icons/header-symbol-192.png` design export로 역할을 분명히 함 |
| social/auxiliary | OG/Twitter, 가로형, 흑백 자산을 변경하지 않음 |

### Preservation Baseline

아래 SHA-256은 구현 전 `master`의 승인본을 고정한 값이다. runtime과 design export를 함께 바꿔도 테스트가 통과하지 않도록 테스트 상수로 사용한다.

| 자산 | 기대 SHA-256 |
| --- | --- |
| source | `7ada6b0bcdd46a78a11b353c89e3506ac6288b31a20df321abe097b02738ffe4` |
| header symbol 192 | `694f523a5505c6ce2384d4b393f0ca7761597318c7f3e8bf44777b6efe3f6fac` |
| OG / Twitter 각각 | `cb1e6f45533df5906eda0ed72ca68bd4d1fd373964cc64d0f502e48d5b19eb27` |
| horizontal light | `5b88934b27b9973ffd6da2a4f7602dc2472d4bec0c196299d7a6f5370efacaa8` |
| horizontal black / white | `1eb753329271469220a954b8834d01958d56d4818aba2123c2e2dc652ca5b374` / `06d2f943037d2e29b0a5b5f2d19ad86c44317455b290fb2df1af10205d15ad2d` |
| symbol black-on-white / black-transparent | `9cbb066ced2a54d6d925e4efb3216a8eb49fe0043e58228eb1eee8dd4a96d488` / `4d9042ffba540e6554af7fbbc40754dd5f6ed85f850ced55c12d02a0986486df` |
| symbol white-on-dark / white-transparent | `9907d9be9c1bb74077d150fbf9645fffb5cdb450af91b2d12eed441d0fd1e764` / `abee931d6eca832cb13877737e3c5da6743f30898b3871e9ff25cb8b252ccd06` |

새 favicon/install export의 내부 보존 기준은 canonical source를 같은 target size로 Lanczos resize한 baseline이다. border에서 연결된 near-white 외곽 matte와 그 2px anti-alias 전이대만 변경을 허용하고, 그 밖의 보호 core는 baseline과 pixel-for-pixel 동일해야 한다. 즉 runtime과 design export를 동시에 바꾸는 방식으로 glyph·위치·그라데이션 회귀를 숨길 수 없다.

## In Scope

- favicon 16/32/48/64 PNG와 ICO를 투명 외곽 버전으로 교체.
- 설치/PWA 192/256/512/1024와 Apple touch 180 아이콘을 흰 모서리 없는 full-bleed 파란 배경 버전으로 교체. runtime manifest에는 192/512, design exports에는 192/256/512/1024를 유지.
- runtime에 설치 전용 `public/brand/app-icon-192.png`를 추가하고 manifest 192 항목이 header 심볼 대신 이 파일을 참조하도록 분리.
- root document의 일반 icon metadata에서 `mumeok-symbol-192.png` 후보를 제거하고 투명 favicon PNG/ICO만 노출.
- 원본 source hash, header/OG/Twitter hash, 글자 형태·위치·비율·파란 영역을 회귀 테스트로 고정.
- PNG corner alpha/RGBA, ICO frame size/transparency, document/manifest 경로, production static HTTP response를 RED/GREEN으로 검증.
- 실제 favicon을 어두운 browser/tab 배경에 합성한 비교 evidence와 visual verdict를 새 경로에 보존.

## Out of Scope

- 기준 source, header 심볼, OG/Twitter, 가로형·흑백 보조 자산 변경.
- 흰색 `무먹` 글자 재생성, 이동, 비율 변경, 재착색 또는 장식 추가.
- header 구성·크기·접근성 이름, HOME/non-HOME 이름 위계, route·interaction 변경.
- 새 dependency, font, token, UI framework.
- API endpoint/field/error, DB schema/migration/seed/stored row, auth/권한·상태 전이 변경.
- 과거 공식 버전, 이전 workpack, prototype, merged evidence 소급 수정.

## Dependencies

| 선행 항목 | 상태 | 확인 |
| --- | --- | --- |
| `service-brand-image-assets` | merged | [x] image #996, docs #997, frontend #998 |
| icon edge contract-evolution | merged | [x] 공식 문서 v1.7.16/v1.5.23와 이 workpack이 docs PR #1000으로 선행 merge |

> Stage 4는 docs PR #1000 merge 뒤 별도 frontend branch에서 진행했다.

## Backend First Contract

- Stage 2/3: N/A. request/path/query/response/error/API envelope 변화가 없다.
- DB schema/migration/seed/write, auth/owner/read-only/idempotency/state transition 변화가 없다.
- 구현 diff에 API/DB/dependency/기술 식별자 변경이 들어오면 scope 위반으로 차단한다.

## Frontend Delivery Mode

- 이미지 후보 편집은 공식 source를 reference로 사용하되 runtime 반영 전 글자·비율·색상 보존과 corner pixel 계약을 자동 검증한다.
- RED에서 현재 favicon의 불투명 흰 corner, 설치 아이콘의 흰 corner, manifest의 header 심볼 재사용과 document 일반 icon의 192 header 후보를 먼저 확인한다.
- GREEN에서는 favicon과 설치용 자산을 별도 export로 관리하고 metadata/manifest의 기존 size/type 계약을 유지한다.
- `loading / empty / error / read-only / unauthorized` 화면 상태는 건드리지 않으며 기존 회귀 테스트가 그대로 통과해야 한다.

## Design Authority

- UI risk: `low-risk` — page layout·interaction·header는 바뀌지 않고 browser/install icon 외곽만 수정한다.
- Anchor screen dependency: 없음.
- Visual artifact: `ui/designs/evidence/service-brand-icon-edge-treatment/favicon-dark-tab-before.png`, `favicon-dark-tab-after.png`, `icon-contact-sheet.png`, `visual-verdict.json`.
- Generator/critic: 화면 generator·critic은 생략한다. favicon/app icon 편집은 image generation/editing workflow를 사용하고 pixel guard와 visual verdict로 검증한다.
- Authority status: `not-required`.
- Notes: HOME/RECIPE_DETAIL/PLANNER_WEEK를 직접 수정하지 않아 anchor-extension이 아니다. 독립 Stage 5/6 asset review는 유지한다.

## Design Status

- [ ] 임시 UI (temporary) — Stage 1 계약 잠금, Stage 4 구현 전
- [ ] 리뷰 대기 (pending-review) — Stage 4 asset/evidence와 독립 리뷰 완료, current-head PR CI/merge 대기
- [x] 확정 (confirmed) — 독립 Stage 5/6 review 승인과 PR #1001 current-head 전체 gate 통과 후 merge
- [ ] N/A — FE 자산 변경 없음

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/요구사항기준선-v1.7.16.md`
- `docs/화면정의서-v1.5.23.md`
- `docs/유저flow맵-v1.3.20.md`
- `docs/db설계-v1.3.17.md`
- `docs/api문서-v1.2.22.md`
- `docs/workpacks/service-brand-image-assets/README.md`
- `docs/engineering/slice-workflow.md`
- `docs/engineering/agent-workflow-overview.md`
- `docs/engineering/product-design-authority.md`

## QA / Test Data Plan

### Vitest / static guard

- 승인된 구현 전 target-size fixture 9개의 SHA-256을 생성기와 테스트의 고정 상수로 검증한다.
- PNG decoder로 favicon의 border-connected 외곽 전체 alpha `0`과 2px 전이대의 흰색 matte/halo 부재를 검증한다.
- 설치/PWA/Apple 180/192/256/512/1024 아이콘 외곽 전체가 불투명 브랜드 파란 계열이고 near-white가 아님을 검증한다.
- ICO의 16/32/48/64 frame을 각 favicon PNG와 전체 decoded pixel 단위로 비교한다.
- document 일반 icon 후보에는 투명 favicon만 있고 `mumeok-symbol-192.png`와 설치용 full-bleed 아이콘이 없음을 고정한다.
- manifest 192/512 경로와 icon size/type을 고정하고 192가 header 심볼 경로를 재사용하지 않음을 검증한다.
- 공식 source와 header/OG/Twitter 기존 hash가 바뀌지 않았음을 고정한다.
- source target-size baseline의 border-connected matte + 2px 전이대 밖 보호 core가 새 export와 pixel-for-pixel 일치하는지 검증한다.

### Production / visual

- production build에서 `/favicon.ico`, favicon PNG, app-icon-192/512, Apple touch icon이 200과 올바른 content type/dimension을 반환하는지 전용 Playwright HTTP smoke로 확인한다.
- before/after favicon을 같은 어두운 tab 배경에 합성하고 16/32px 가독성, 흰 corner/halo, 글자 형태를 visual verdict로 확인한다.
- 설치용 180/192/256/512/1024 contact sheet에서 full-bleed 배경과 glyph 보존을 확인한다.
- Formal exploratory QA는 N/A다. 화면 흐름·interaction을 바꾸지 않는 low-risk 정적 아이콘 외곽 수정이므로, 전체 픽셀 deterministic guard와 전용 production HTTP smoke, targeted visual verdict로 대체한다.

### Manual Only

- 실제 배포 뒤 browser favicon cache를 비우거나 새 profile에서 흰 corner가 사라졌는지 확인한다.
- 실제 iOS/Android/PWA 홈 화면 추가 후 각 OS mask에서 아이콘이 자연스럽게 보이는지 확인한다.

## Blocker Conditions

- 공식 source hash, header/OG/Twitter 기존 hash가 바뀜.
- favicon corner가 불투명하거나 흰색 matte/halo가 남음.
- 설치/PWA/Apple 아이콘 corner가 흰색이거나 투명해 OS mask 밖 배경이 비침.
- 글자 형태·위치·비율 또는 파란 영역이 승인본과 다르게 재생성됨.
- manifest 192가 header 심볼 경로를 계속 재사용하거나 size/type이 틀림.
- document 일반 icon metadata에 `mumeok-symbol-192.png` 또는 설치용 full-bleed 아이콘이 favicon 후보로 남음.
- API/DB/dependency/route/interaction/접근성 이름 또는 과거 evidence 변경.
- visual verdict의 unresolved blocker/major 또는 current-head CI 실패.

## Primary User Path

1. 사용자가 서비스를 browser tab에서 연다.
2. 어두운 tab 배경에서도 favicon의 파란 둥근 사각형 바깥에 흰 모서리나 halo가 보이지 않는다.
3. 사용자가 PWA/홈 화면에 추가하면 OS mask 안이 full-bleed 파란 배경으로 채워지고 같은 `무먹` 글자를 본다.

## Delivery Checklist

- [x] 공식 문서 v1.7.16/v1.5.23, SoT와 후속 workpack을 docs PR로 먼저 merge <!-- omo:id=brand-icon-edge-delivery-contract;stage=4;scope=shared;review=6 -->
- [x] 현재 불투명 favicon corner와 manifest 경로 회귀 테스트 RED 확인 <!-- omo:id=brand-icon-edge-delivery-red;stage=4;scope=frontend;review=5,6 -->
- [x] favicon PNG/ICO 투명 외곽과 흰색 matte·halo 부재 구현 <!-- omo:id=brand-icon-edge-delivery-favicon;stage=4;scope=frontend;review=5,6 -->
- [x] 180/192/256/512/1024 설치용 full-bleed 파란 아이콘과 manifest 192 분리 <!-- omo:id=brand-icon-edge-delivery-install;stage=4;scope=frontend;review=5,6 -->
- [x] document 일반 icon 후보를 투명 favicon 계열로 제한 <!-- omo:id=brand-icon-edge-delivery-document-icons;stage=4;scope=frontend;review=5,6 -->
- [x] source/header/OG/Twitter hash와 glyph·비율 보존 guard 통과 <!-- omo:id=brand-icon-edge-delivery-preserve;stage=4;scope=frontend;review=5,6 -->
- [x] production static route와 manifest smoke 통과 <!-- omo:id=brand-icon-edge-delivery-smoke;stage=4;scope=frontend;review=5,6 -->
- [x] before/after contact sheet, visual verdict와 독립 asset review 완료 <!-- omo:id=brand-icon-edge-delivery-visual;stage=4;scope=frontend;review=5,6 -->

## Contract Evolution Candidates

없음. 이 workpack은 사용자가 승인한 파생 아이콘 외곽 처리 계약의 구현 기준이다.
