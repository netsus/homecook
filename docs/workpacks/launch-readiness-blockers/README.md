# Launch Readiness Blockers

## Goal

광고 집행과 실제 사용자 모집 전에 출시 차단급 문제 5개를 닫는다. 사용자가 바로 보는 legal/trust surface, HOME 첫 진입 안정성, 보안 헤더, mixed-content, dependency audit를 각각 작은 PR로 분리하되 하나의 release-hotfix workpack 아래에서 추적한다.

이 workpack은 일반 roadmap 순서 예외다. 선행 slice 일부가 `merged`가 아니어도, 광고/배포를 직접 막는 이슈이므로 `launch-readiness-blocker`로 먼저 진행한다. 이 예외는 출시 차단 이슈에만 적용되며, 공식 문서 우선 원칙과 product slice 검증 gate를 완화하지 않는다.

## Slice Type

- Change type: `product-backend` + `product-frontend` + security/dependency release-hotfix
- Risk: `critical`
- Execution mode: manual split PRs
- Branches:
  - docs: `docs/launch-readiness-blockers`
  - backend/data: `feature/be-launch-readiness-blockers`
  - frontend/config: `feature/fe-launch-readiness-blockers`
- Source plan: `.omx/plans/homecook-launch-blockers-5-ralplan-dr-20260629.md`

## Codex-Only Execution Rule

- Claude 사용 금지. Stage 1, backend review, frontend implementation, final authority gate, closeout에서 Claude를 호출하지 않는다.
- 기존 Claude 담당 단계는 모두 **별도 새 Codex 세션**으로 대체한다.
- 구현 세션은 자기 작업을 승인하지 않는다. 리뷰, authority, final closeout은 구현 세션과 분리된 Codex 세션이 맡는다.
- authority-required 범위인 `/privacy`, `/terms`, HOME 변경은 `Codex frontend implementation session -> separate Codex authority/review session -> separate Codex final authority session -> separate Codex closeout session` 순서를 거친다.
- closeout 세션은 PR별 evidence를 모아 최종 launch gate를 판정한다.

## In Scope

- Track 0 legal/operator information intake
  - 운영자 실명 또는 법인명, 문의처, 개인정보 보호책임자, 처리 항목/목적/보유기간, 위탁/국외이전, 파기, 권리 행사, 시행일, 최종 광고 도메인을 확정한다.
  - 비어 있는 항목이 있으면 PR1은 production merge 금지다.
- PR1 Legal / Trust / SEO
  - `/privacy`, `/terms`, `/robots.txt`, `/sitemap.xml` 404 제거
  - fake contact 문자열 제거: `support@homecook.local`, `@homecook`
  - 실제 운영정보 기반 개인정보처리방침/이용약관 작성
  - public route만 sitemap에 포함
  - 운영용 기본 OG/Twitter 공유 이미지와 절대 URL metadata 제공
  - 공개 레시피 상세에 제목, 설명, 대표 이미지, canonical metadata 제공
  - 로그인 및 개인 데이터 route는 검색 색인에서 제외
- PR2 HOME hydration + guest gamification noise
  - HOME React hydration error `#418` 제거
  - guest route에서 global `GrowthToastStack`의 불필요한 401 fetch/console noise 제거
  - 로그인 상태 growth toast 동작 유지
- PR3 Security headers baseline
  - `next.config.ts` static response header baseline 추가
  - representative routes에서 security header presence 검증
  - CSP가 로그인, Supabase, image, YouTube/FoodSafety image를 깨지 않게 origin inventory 작성
- PR4 FoodSafety shared thumbnail normalization
  - FoodSafety host 한정 `http://www.foodsafetykorea.go.kr` -> `https://www.foodsafetykorea.go.kr`
  - read path helper와 route response sweep
  - `recipes.thumbnail_url`, `recipe_sources.extraction_meta_json.source_image_url`, `image_candidates[].url` idempotent migration
- PR5 PostCSS audit compliance
  - `postcss >=8.5.10` safe resolution
  - `corepack pnpm audit --prod --audit-level moderate` 통과
  - Next/Tailwind build compatibility 검증
- 화면:
  - `PRIVACY` 신규
  - `TERMS` 신규
  - `HOME` hydration-safe greeting and guest console clean
  - affected public recipe/detail/card surfaces for FoodSafety image evidence
- API / route:
  - `GET /privacy`
  - `GET /terms`
  - `GET /robots.txt`
  - `GET /sitemap.xml`
  - existing recipe/planner/shopping/recipe-book routes that expose recipe image URLs
  - existing `/api/v1/users/me/gamification` client usage path
- DB 영향:
  - PR4 idempotent migration for FoodSafety URL normalization
- Schema Change:
  - [ ] 없음
  - [x] 있음 -> PR4에서 `supabase/migrations/<timestamp>_normalize_foodsafety_image_urls.sql` 계열 migration 필요

## Out of Scope

- 법률 자문 또는 법률 적합성 최종 보증
- placeholder legal copy 또는 fake contact로 production merge
- private/auth route를 sitemap에 포함
- nonce/hash 기반 strict CSP 전환. 이번 범위는 static baseline이며, 필요하면 follow-up으로 분리한다.
- FoodSafety가 아닌 외부 URL의 임의 rewrite
- unrelated recipe image CDN migration
- PostCSS 이외의 dependency upgrade sweep
- 브랜드 일러스트를 별도 제작하는 고급 OG/Twitter image polish
- Search Console 제출 자동화
- 앞선 in-progress product slice의 구현/closeout 해결

## Dependencies

| 선행 항목 | 상태 | 확인 |
| --- | --- | --- |
| `.omx/plans/homecook-launch-blockers-5-ralplan-dr-20260629.md` | approved input | [x] |
| Track 0 legal/operator facts | required before PR1 production merge | [ ] |
| 선행 roadmap slice 전체 `merged` | launch blocker 예외로 waived | [x] |

> 예외 사유: 이 workpack은 일반 product roadmap 기능이 아니라 광고/배포 차단 release-hotfix다. 선행 slice 미완료 상태를 이유로 방치하면 fake contact, legal/SEO 404, hydration error, mixed-content, audit failure가 광고 집행과 사용자 모집을 직접 막는다.

## Backend First Contract

- 기존 API response wrapper `{ success, data, error }`를 유지한다.
- error object는 `{ code, message, fields[] }` 구조를 유지한다.
- PR4는 FoodSafety host만 정규화한다. 다른 `http://` URL은 증거와 승인 없이 바꾸지 않는다.
- PR4 migration은 idempotent 해야 하며, repeated apply 또는 already-normalized row에서 결과가 꼬이지 않아야 한다.
- PR4 read path guard는 migration 전/후 모두 API 응답에서 FoodSafety `https://`를 보장해야 한다.
- PR1 robots/sitemap은 Next.js metadata route로 만들고, private/auth route를 노출하지 않는다.
- PR1의 기본 social card는 Next.js image metadata route로 생성하고 1200x630 OG 규격을 유지한다.
- 공개 레시피 metadata 조회 실패 시 기본 집밥 social card로 안전하게 fallback한다.
- PR3 response headers는 representative route 전체에 적용되어야 한다.
- PR5는 새 dependency를 추가하지 않고 기존 override/lockfile로 audit blocker를 닫는다.

## Frontend Delivery Mode

- `/privacy`, `/terms`는 신규 화면이다. 긴 문서 스크롤, 모바일 320px 텍스트 줄바꿈, 접근성, footer/navigation recovery를 확인한다.
- HOME은 anchor screen이다. hydration fix가 visual geometry를 크게 바꾸지 않더라도 before/after desktop/mobile/narrow screenshot evidence가 필요하다.
- guest public routes는 console-clean이 acceptance다.
- 필수 상태:
  - legal pages: long static content, route metadata, mobile/desktop layout
  - HOME/gamification: loading, empty, error, unauthorized guest, logged-in
  - FoodSafety image surfaces: image available, missing image fallback, mixed-content free
  - security headers: no critical asset blocked by CSP
- 로그인 보호 action의 return-to-action 기존 동작을 깨지 않는다.

## Design Authority

- UI risk: `high-risk` release-hotfix with `new-screen` and `anchor-extension`
- Anchor screen dependency: `HOME`
- Required screens:
  - `PRIVACY`
  - `TERMS`
  - `HOME`
- Required design artifacts before PR1/PR2 Ready for Review:
  - `ui/designs/PRIVACY.md`
  - `ui/designs/TERMS.md`
  - `ui/designs/critiques/PRIVACY-critique.md`
  - `ui/designs/critiques/TERMS-critique.md`
  - `ui/designs/authority/HOME-authority.md` or equivalent HOME authority report for hydration/guest-console change evidence
  - screenshot evidence under `ui/designs/evidence/launch-readiness-blockers/`
- Authority status: `required`
- Codex-only replacement:
  - design/authority review must be performed by a separate Codex session from implementation.
  - final authority must be performed by another separate Codex session before authority-required PRs can be marked confirmed.

## Design Status

- [x] 임시 UI (temporary) - workpack lock only, implementation not started
- [ ] 리뷰 대기 (pending-review) - PR1/PR2 implementation evidence ready
- [ ] 확정 (confirmed) - separate Codex authority/review and final authority sessions pass with blocker 0
- [ ] N/A

## Source Links

- `.omx/plans/homecook-launch-blockers-5-ralplan-dr-20260629.md`
- `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
- `docs/workpacks/README.md`
- `docs/engineering/agent-workflow-overview.md`
- `docs/engineering/slice-workflow.md`
- `docs/engineering/product-design-authority.md`
- `docs/design/mobile-ux-rules.md`
- `docs/design/anchor-screens.md`
- `app/layout.tsx`
- `components/home/home-screen.tsx`
- `components/gamification/growth-toast-stack.tsx`
- `lib/api/user-gamification.ts`
- `lib/recipe-image.ts`
- `next.config.ts`
- `package.json`
- `pnpm-lock.yaml`

## QA / Test Data Plan

- Fixture baseline:
  - guest HOME first load
  - logged-in HOME with growth toast enabled
  - representative public recipe detail with FoodSafety image
  - recipe list/theme card with FoodSafety image
  - planner/shopping/recipe-book route responses with recipe image payloads
  - legal pages with long Korean copy
- Browser evidence:
  - HOME desktop/mobile/narrow hydration and console capture
  - `/login` guest console capture
  - representative public recipe detail console capture
  - `/privacy`, `/terms` desktop/mobile/narrow screenshots
  - routes with FoodSafety image cards/gallery console capture
- Data evidence:
  - FoodSafety `http://` count query for `recipes.thumbnail_url`
  - FoodSafety `http://` count query for `recipe_sources.extraction_meta_json`
  - migration dry review and local apply if local DB is available
- Header evidence:
  - `curl -I` snapshots for root and representative routes
  - CSP no-block smoke for login, HOME, recipe detail, mypage, planner, pantry
- Audit evidence:
  - `pnpm why postcss` or lockfile inspection showing `8.5.10+`
  - `corepack pnpm audit --prod --audit-level moderate`

## Verification Strategy

Stage 1 docs:

```bash
pnpm validate:source-of-truth-sync
pnpm validate:workflow-v2
pnpm validate:workpack -- --slice launch-readiness-blockers
git diff --check
```

PR1:

```bash
pnpm install --frozen-lockfile && pnpm verify:frontend:pr
pnpm install --frozen-lockfile && pnpm verify:frontend
curl -I http://localhost:3000/privacy
curl -I http://localhost:3000/terms
curl -I http://localhost:3000/robots.txt
curl -I http://localhost:3000/sitemap.xml
```

PR2:

```bash
pnpm test -- tests/home-screen.test.tsx tests/growth-toast-stack.test.tsx tests/user-gamification-api-client.test.ts
pnpm build
pnpm verify:frontend
```

PR3:

```bash
pnpm test:e2e:security
curl -I http://localhost:3000 | grep -Ei 'content-security-policy|x-frame-options|x-content-type-options|referrer-policy|permissions-policy'
pnpm verify:frontend
```

PR4:

```bash
pnpm test -- tests/recipe-image.test.ts
pnpm verify:backend
pnpm verify:frontend
```

PR5:

```bash
pnpm install
pnpm install --frozen-lockfile
pnpm build
corepack pnpm audit --prod --audit-level moderate
pnpm verify:frontend
```

## Key Rules

1. Claude를 사용하지 않는다.
2. 구현, 리뷰, authority, final closeout은 독립 Codex 세션으로 분리한다.
3. 같은 Codex 세션이 자기 구현을 approve하지 않는다.
4. 선행 slice 미완료 예외는 광고/배포 차단 release-hotfix에만 적용된다.
5. fake contact와 placeholder legal copy는 production merge blocker다.
6. 개인정보처리방침은 실제 처리 현황을 반영해야 하며 Codex가 법률 적합성을 최종 보증하지 않는다.
7. HOME hydration fix는 SSR/CSR 첫 렌더를 deterministic하게 만든다.
8. guest 401 gamification fetch는 public route console noise로 남기지 않는다.
9. security header baseline은 critical assets를 깨면 안 된다. CSP가 위험하면 PR3a non-CSP headers와 PR3b CSP baseline으로 split한다.
10. FoodSafety URL 정규화는 host-limited다.
11. PostCSS advisory는 runtime exploit로 과장하지 않고 supply-chain/audit compliance blocker로 다룬다.
12. 각 PR은 current PR head SHA 기준 시작된 GitHub checks 전체가 green일 때만 merge한다.

## Contract Evolution Candidates

- 없음. 이번 workpack은 launch readiness blocker repair다.
- legal/operator fact가 공식 product/API contract 변경을 요구하면 별도 사용자 승인 후 `contract-evolution` 경로로 분리한다.

## Primary User Path

1. 광고 유입 사용자가 HOME에 진입한다.
2. 첫 렌더에서 hydration error와 guest 401 console noise가 발생하지 않는다.
3. 사용자가 footer 또는 crawler route를 통해 `/privacy`, `/terms`, `/robots.txt`, `/sitemap.xml`를 정상 확인한다.
4. public recipe/card/detail surfaces에서 FoodSafety image가 mixed-content 없이 표시된다.
5. 운영자는 security headers와 dependency audit가 launch gate를 막지 않는 상태로 preview/prod evidence를 확인한다.

## Delivery Checklist

> 이 체크리스트는 PR1~PR5 동안 계속 갱신하는 living closeout 문서다.

- [x] Stage 1 release-hotfix workpack docs/acceptance/automation/work-item 잠금 <!-- omo:id=delivery-stage1-workpack-lock;stage=4;scope=shared;review=6 -->
- [x] Codex-only execution rule and separate-review-session rule documented <!-- omo:id=delivery-codex-only-rule;stage=4;scope=shared;review=6 -->
- [x] 선행 slice 미완료 상태 launch blocker 예외 사유 documented <!-- omo:id=delivery-launch-exception;stage=4;scope=shared;review=6 -->
- [ ] Track 0 legal/operator facts complete before PR1 production merge <!-- omo:id=delivery-track0-operator-facts;stage=4;scope=frontend;review=5,6 -->
- [ ] PR1 legal/trust/SEO routes and fake contact removal implemented <!-- omo:id=delivery-pr1-legal-trust-seo;stage=4;scope=frontend;review=5,6 -->
- [ ] PR1 `/privacy` and `/terms` design artifacts and separate Codex authority evidence complete <!-- omo:id=delivery-pr1-design-authority;stage=4;scope=frontend;review=5,6 -->
- [ ] PR2 HOME hydration and guest gamification console noise fixed <!-- omo:id=delivery-pr2-hydration-console;stage=4;scope=frontend;review=5,6 -->
- [ ] PR2 HOME screenshot and console-clean evidence complete <!-- omo:id=delivery-pr2-authority-evidence;stage=4;scope=frontend;review=5,6 -->
- [ ] PR3 security headers baseline and CSP route smoke complete <!-- omo:id=delivery-pr3-security-headers;stage=4;scope=frontend;review=6 -->
- [ ] PR4 FoodSafety read path helper, route sweep, and idempotent migration complete <!-- omo:id=delivery-pr4-foodsafety-normalization;stage=2;scope=shared;review=3,6 -->
- [ ] PR4 data count and mixed-content browser evidence complete <!-- omo:id=delivery-pr4-data-browser-evidence;stage=2;scope=shared;review=3,6 -->
- [ ] PR5 PostCSS override, lockfile resolution, build, and audit evidence complete <!-- omo:id=delivery-pr5-postcss-audit;stage=4;scope=shared;review=6 -->
- [ ] Separate Codex closeout session aggregates PR1~PR5 launch gate evidence <!-- omo:id=delivery-final-codex-closeout;stage=4;scope=shared;review=6 -->
