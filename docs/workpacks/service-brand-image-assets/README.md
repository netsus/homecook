# Slice: service-brand-image-assets

## Goal

사용자가 선택한 파란색 둥근 사각형 + 흰색 `무먹` 글자 심볼을 실제 서비스의 공통 header, favicon, 설치 아이콘, Apple touch 아이콘, OG/Twitter 공유 이미지에 일관되게 적용한다. 기존 `무먹`/`무엇을 먹든` 이름 관계, route, 상태, API/DB와 기술 식별자는 보존한다.

## Approval And Ownership

- 사용자 승인: 2026-07-13. 선택한 심볼을 공식 브랜드 심볼로 확정하고, 기존 이미지 로고 금지 계약을 먼저 갱신한 뒤 실제 서비스에 생성 자산을 적용하도록 명시 요청했다.
- change type: `contract-evolution` + 후속 FE-only product slice.
- 이 작업은 `service-brand-rebrand`와 `service-brand-home-lockup`의 Codex-only 예외를 잇는 후속 브랜드 슬라이스다. Stage 1 docs owner, Stage 4 frontend implementer, docs repair/final owner, authority reviewer를 역할이 분리된 Codex 작업으로 나누며 작성·구현 작업은 자기 변경을 최종 승인하지 않는다. 전역 workflow actor 규칙은 바꾸지 않는다.
- 이 Stage 1 PR은 공식 계약, workpack, workflow metadata만 포함한다. 제품 코드·runtime asset 복사·기존 screenshot/evidence는 수정하지 않는다.

## Branches

- 문서: `docs/mumeok-image-assets-contract`
- 백엔드: N/A — API/DB 변경 없는 FE-only slice
- 프론트엔드: `feature/fe-service-brand-image-assets`

## Canonical Asset Contract

| 용도 | canonical asset |
| --- | --- |
| 선택 source | `ui/designs/brand/mumeok/exports/source/mumeok-symbol-selected-source-1254.png` |
| source SHA-256 | `7ada6b0bcdd46a78a11b353c89e3506ac6288b31a20df321abe097b02738ffe4` |
| header 심볼 | `ui/designs/brand/mumeok/exports/icons/app-icon-192.png` |
| favicon | `ui/designs/brand/mumeok/exports/favicon/favicon.ico` 및 PNG export |
| 설치/PWA 아이콘 | `ui/designs/brand/mumeok/exports/icons/app-icon-192.png`, `app-icon-512.png` |
| Apple touch | `ui/designs/brand/mumeok/exports/icons/apple-touch-icon-180.png` |
| OG | `ui/designs/brand/mumeok/exports/social/og-image-1200x630.png` |
| Twitter | `ui/designs/brand/mumeok/exports/social/twitter-image-1200x630.png` |
| 보조 자산 | `logo/mumeok-logo-horizontal-light.png`, `monochrome/*` |

## In Scope

- HOME mobile `HomeAppBar`: 32px 안팎의 공식 심볼 + 기존 `무먹`/`무엇을 먹든` 세로 텍스트 위계.
- desktop HOME `WebTopNav`: 공식 심볼 + 기존 HOME 2단 텍스트 위계. nav 높이·tab 위치·right slot·interaction 보존.
- non-HOME `AppHeader`/`WebTopNav`: 공식 심볼 + `무먹`, 정식명 보조 줄 없음.
- favicon, PWA/설치 아이콘, Apple touch icon metadata와 manifest 연결.
- root 및 정적 public page의 OG/Twitter metadata를 생성 완료 1200×630 자산으로 연결.
- 인접 텍스트가 이름을 전달하는 심볼은 `alt=""`/장식 처리하고, link/heading의 접근성 이름은 기존 계약을 유지해 중복 낭독 방지.
- 기존 HOME loading/empty/error/filter-active, non-HOME route, auth/read-only/return-to-action 동작 보존.
- 공식 요구사항 v1.7.15, 화면정의서 v1.5.22, `CURRENT_SOURCE_OF_TRUTH`, 이 workpack/acceptance/automation/workflow metadata 동기화.

## Out of Scope

- screenshot, 미선택 후보, 따옴표·점·장식·마스코트가 있는 변형 사용.
- 선택 심볼의 글자 재생성, 임의 재착색, 비율 왜곡, 모서리 재가공.
- 새 영문 브랜드, font, token, dependency, UI framework.
- route, 정보 구조, header 높이, nav tab 위치, interaction, 도메인 상태 전이 변경.
- API endpoint/field/error, DB schema/migration/seed/stored row, auth/권한 변경.
- `homecook:*`, `HOMECOOK_*`, cookie/header/event/storage/package/repository/Supabase/OMO key rename.
- 과거 공식 버전, 기존 workpack, prototype, merged evidence의 소급 수정.

## Dependencies

| 선행 항목 | 상태 | 확인 |
| --- | --- | --- |
| `service-brand-rebrand` | merged | [x] docs #985 / backend #987 / frontend #988 |
| `service-brand-home-lockup` | merged | [x] docs #990 / frontend #991, HOME 2단 이름 위계 확정 |
| selected brand exports | merged | [x] image-only PR #996, canonical source와 20개 최종 export |
| image asset contract-evolution | docs | [ ] 공식 문서 v1.7.15/v1.5.22와 이 workpack이 main에 먼저 merge |

> Stage 4는 이 docs PR merge와 internal 1.5 docs gate 통과 뒤에만 시작한다. 기존 evidence는 baseline으로 읽되 덮어쓰지 않는다.

## Backend First Contract

- Stage 2/3: N/A. request/path/query/response/error/API envelope에 변화가 없다.
- DB schema/migration/seed/write, auth/owner/read-only/idempotency/state transition에 변화가 없다.
- 구현 diff에 API/DB/dependency/기술 식별자 변경이 들어오면 scope 위반으로 차단한다.

## Frontend Delivery Mode

- 기존 `AppHeader`, `WebTopNav`, `HomeAppBar` 구조와 link/heading semantics를 재사용한다.
- 공통 header 심볼 경로/크기/접근성 처리는 작은 공유 primitive로 중복을 줄이되 새 dependency는 추가하지 않는다.
- RED에서 header 심볼·metadata·manifest 연결 부재를 확인한 뒤 최소 구현으로 GREEN을 만든다.
- runtime에는 선택 완료 export의 파일 복사본만 두고, 생성 후보나 screenshot을 복사하지 않는다.
- 기존 dynamic orange social image는 canonical blue OG/Twitter 자산 연결 뒤 제거한다.

## Design Authority

- UI risk: `anchor-extension` — interaction은 그대로지만 HOME 첫인상인 header가 직접 바뀐다.
- Anchor screen dependency: `HOME`.
- Reused design artifact: `ui/designs/HOME.md`, 기존 `service-brand-home-lockup` evidence.
- Generator/critic: 사용자가 선택한 확정 심볼과 기존 확정 header 조합이므로 신규 이미지 생성은 생략한다. screenshot authority는 생략하지 않는다.
- Before evidence:
  - `ui/designs/evidence/service-brand-image-assets/HOME-before-390.png`
  - `ui/designs/evidence/service-brand-image-assets/HOME-before-320.png`
  - `ui/designs/evidence/service-brand-image-assets/HOME-desktop-before-1280.png`
- After evidence:
  - `ui/designs/evidence/service-brand-image-assets/HOME-after-390.png`
  - `ui/designs/evidence/service-brand-image-assets/HOME-after-320.png`
  - `ui/designs/evidence/service-brand-image-assets/HOME-desktop-after-1280.png`
  - `ui/designs/evidence/service-brand-image-assets/accessibility-geometry-audit.json`
  - `ui/designs/evidence/service-brand-image-assets/visual-verdict.json`
- Authority report: `ui/designs/authority/HOME-service-brand-image-assets-authority.md`.
- Evidence must prove: 선택 심볼 일치, 320px fit/overflow 0, text/image 중복 낭독 없음, nav geometry와 첫 viewport 보존, 미선택 장식 변형 부재.

## Design Status

- [x] 임시 UI (temporary) — Stage 1 계약 잠금, Stage 4 구현 전
- [ ] 리뷰 대기 (pending-review) — Stage 4 구현/evidence 완료
- [ ] 확정 (confirmed) — 독립 authority와 Stage 6 blocker 0
- [ ] N/A — FE 화면 없음

## Source Links

- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/요구사항기준선-v1.7.15.md`
- `docs/화면정의서-v1.5.22.md`
- `docs/유저flow맵-v1.3.20.md`
- `docs/db설계-v1.3.17.md`
- `docs/api문서-v1.2.22.md`
- `docs/workpacks/service-brand-rebrand/README.md`
- `docs/workpacks/service-brand-home-lockup/README.md`
- `docs/engineering/slice-workflow.md`
- `docs/engineering/agent-workflow-overview.md`
- `docs/engineering/product-design-authority.md`
- `docs/design/mobile-ux-rules.md`
- `docs/design/anchor-screens.md`
- `ui/designs/HOME.md`

## QA / Test Data Plan

### Vitest / static guard

- RED: `AppHeader`, HOME `HomeAppBar`, `WebTopNav`에서 공식 심볼이 없으면 실패한다.
- RED: root/page metadata가 canonical OG/Twitter와 favicon/install icon/manifest 경로를 참조하지 않으면 실패한다.
- GREEN: header accessible name, HOME/non-HOME 이름 경계, metadata/manifest 경로, source hash/runtime file 크기를 고정한다.
- old orange social image generator와 미선택 후보/screenshot 경로가 runtime source에 남지 않음을 검증한다.

### Playwright / visual

- 390px/320px HOME과 desktop 1280px HOME/non-HOME을 검증한다.
- header overflow 0, HOME first viewport, nav height/tab 위치/right slot, keyboard focus, 중복 accessible name을 확인한다.
- favicon/manifest/OG/Twitter URL이 200과 올바른 content type/dimension을 반환하는지 production build에서 확인한다.

### Manual Only

- 실제 배포 URL의 브라우저 탭/홈 화면 추가 아이콘 캐시 갱신 확인.
- 카카오톡, X/Twitter 등 외부 crawler cache가 갱신된 뒤 공유 카드 표시 확인.

## Blocker Conditions

- canonical source hash 불일치 또는 screenshot/미선택/장식 변형 사용.
- HOME/non-HOME 이름 경계 회귀, 중복 낭독, 320px 잘림·겹침·overflow.
- desktop nav geometry/right slot/interaction 또는 HOME first viewport drift.
- metadata/manifest가 canonical icon/social asset을 참조하지 않거나 잘못된 dimension/content type을 제공.
- API/DB/dependency/기술 식별자/과거 evidence 변경.
- required before/after, visual verdict, authority report 누락 또는 unresolved blocker.
- current-head CI 미통과.

## Delivery Checklist

- [ ] 공식 문서 v1.7.15/v1.5.22와 SoT를 docs PR로 먼저 merge <!-- omo:id=brand-image-delivery-contract;stage=1;scope=shared;review=1.5,6 -->
- [ ] canonical runtime asset 복사본과 source hash guard 적용 <!-- omo:id=brand-image-delivery-assets;stage=4;scope=frontend;review=5,6 -->
- [ ] HOME/non-HOME header 심볼 조합 적용 <!-- omo:id=brand-image-delivery-header;stage=4;scope=frontend;review=5,6 -->
- [ ] favicon/install/Apple/manifest 적용 <!-- omo:id=brand-image-delivery-icons;stage=4;scope=frontend;review=5,6 -->
- [ ] OG/Twitter canonical 공유 이미지 적용 <!-- omo:id=brand-image-delivery-social;stage=4;scope=frontend;review=5,6 -->
- [ ] RED/GREEN component/static/E2E 회귀 검증 <!-- omo:id=brand-image-delivery-tests;stage=4;scope=frontend;review=5,6 -->
- [ ] 390/320/1280 before/after, audit, visual verdict, authority report 완료 <!-- omo:id=brand-image-delivery-authority;stage=4;scope=frontend;review=5,6 -->

## Contract Evolution Candidates

없음. 이 workpack 자체가 사용자가 승인한 이미지 브랜드 자산 contract-evolution의 구현 기준이다.
