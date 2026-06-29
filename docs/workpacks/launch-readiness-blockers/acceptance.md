# Acceptance: Launch Readiness Blockers

> acceptance는 PR1~PR5 전체 launch gate의 living closeout 문서다.
> 체크는 테스트, browser capture, audit output, DB query, preview/prod smoke처럼 evidence가 생긴 뒤에만 한다.
> Claude 사용 금지. 리뷰/authority/final closeout evidence는 구현 세션과 분리된 별도 Codex 세션에서 생성해야 한다.

## Workpack Gate

- [x] release-hotfix workpack README, acceptance, automation spec, workflow work item, status entry가 생성되어 있다 <!-- omo:id=accept-workpack-docs-created;stage=4;scope=shared;review=6 -->
- [x] 선행 slice 미완료 상태에서도 광고/배포 차단 이슈라 진행한다는 예외 사유가 roadmap과 workpack에 명시되어 있다 <!-- omo:id=accept-launch-exception-documented;stage=4;scope=shared;review=6 -->
- [x] Claude 없이 Codex-only로 진행하며 리뷰/authority/final closeout은 별도 Codex 세션으로 분리한다는 규칙이 문서화되어 있다 <!-- omo:id=accept-codex-only-rule-documented;stage=4;scope=shared;review=6 -->

## PR1 Legal / Trust / SEO

- [ ] `/privacy`가 local/preview/prod에서 200 응답한다 <!-- omo:id=accept-privacy-route;stage=4;scope=frontend;review=5,6 -->
- [ ] `/terms`가 local/preview/prod에서 200 응답한다 <!-- omo:id=accept-terms-route;stage=4;scope=frontend;review=5,6 -->
- [ ] `/robots.txt`가 local/preview/prod에서 200 응답한다 <!-- omo:id=accept-robots-route;stage=4;scope=frontend;review=6 -->
- [ ] `/sitemap.xml`가 local/preview/prod에서 200 응답한다 <!-- omo:id=accept-sitemap-route;stage=4;scope=frontend;review=6 -->
- [ ] sitemap은 public route만 포함하고 private/auth route를 포함하지 않는다 <!-- omo:id=accept-sitemap-public-only;stage=4;scope=frontend;review=6 -->
- [ ] `support@homecook.local`, `@homecook` fake contact 문자열이 repo와 production 화면에 남지 않는다 <!-- omo:id=accept-fake-contact-removed;stage=4;scope=frontend;review=5,6 -->
- [ ] 개인정보처리방침에는 처리 항목, 목적, 보유기간, 파기, 제3자 제공, 위탁, 국외 이전, 권리 행사, 보호책임자/연락처, 자동수집/쿠키, 안전조치가 실제 운영정보 기준으로 들어간다 <!-- omo:id=accept-privacy-real-facts;stage=4;scope=frontend;review=5,6 -->
- [ ] 이용약관에는 서비스 범위, 계정/탈퇴, 금지행위, 책임 제한, 문의, 시행일이 들어간다 <!-- omo:id=accept-terms-real-facts;stage=4;scope=frontend;review=5,6 -->
- [ ] `/privacy`, `/terms` mobile 320/390 and desktop screenshot evidence가 있고 텍스트 overflow가 없다 <!-- omo:id=accept-legal-screenshots;stage=4;scope=frontend;review=5,6 -->
- [ ] legal/operator human review 필요 여부와 현재 상태가 PR body에 명시되어 있다 <!-- omo:id=accept-human-legal-review-status;stage=4;scope=frontend;review=6 -->

## PR2 HOME Hydration / Guest Console

- [ ] HOME desktop 첫 진입에서 React hydration error `#418`가 없다 <!-- omo:id=accept-home-desktop-hydration-clean;stage=4;scope=frontend;review=5,6 -->
- [ ] HOME mobile 첫 진입에서 React hydration error `#418`가 없다 <!-- omo:id=accept-home-mobile-hydration-clean;stage=4;scope=frontend;review=5,6 -->
- [ ] guest `/`에서 `/api/v1/users/me/gamification` 401 console noise가 없다 <!-- omo:id=accept-home-guest-gamification-clean;stage=4;scope=frontend;review=5,6 -->
- [ ] guest `/login`에서 global gamification 401 console noise가 없다 <!-- omo:id=accept-login-guest-gamification-clean;stage=4;scope=frontend;review=6 -->
- [ ] 대표 public recipe detail에서 global gamification 401 console noise가 없다 <!-- omo:id=accept-recipe-detail-guest-gamification-clean;stage=4;scope=frontend;review=6 -->
- [ ] 로그인 상태 growth toast 동작이 유지된다 <!-- omo:id=accept-logged-in-growth-toast-retained;stage=4;scope=frontend;review=5,6 -->
- [ ] greeting이 client mount 후 바뀌더라도 큰 layout shift가 없다 <!-- omo:id=accept-greeting-layout-stable;stage=4;scope=frontend;review=5,6 -->
- [ ] HOME before/after desktop/mobile/narrow screenshot evidence가 있다 <!-- omo:id=accept-home-authority-evidence;stage=4;scope=frontend;review=5,6 -->

## PR3 Security Headers

- [ ] root route response에 `X-Content-Type-Options: nosniff`가 있다 <!-- omo:id=accept-header-nosniff;stage=4;scope=frontend;review=6 -->
- [ ] representative routes에 `Referrer-Policy`가 있다 <!-- omo:id=accept-header-referrer-policy;stage=4;scope=frontend;review=6 -->
- [ ] representative routes에 `Permissions-Policy`가 있다 <!-- omo:id=accept-header-permissions-policy;stage=4;scope=frontend;review=6 -->
- [ ] representative routes에 frame embedding 제한 header 또는 CSP `frame-ancestors`가 있다 <!-- omo:id=accept-header-frame-protection;stage=4;scope=frontend;review=6 -->
- [ ] CSP를 적용한 경우 `*` allowlist 없이 필요한 origin만 허용한다 <!-- omo:id=accept-csp-no-wildcard;stage=4;scope=frontend;review=6 -->
- [ ] 로그인, HOME, recipe detail, mypage, planner, pantry가 header/CSP 때문에 깨지지 않는다 <!-- omo:id=accept-csp-smoke-no-breakage;stage=4;scope=frontend;review=6 -->
- [ ] header presence를 E2E 또는 route smoke가 검증한다 <!-- omo:id=accept-security-header-test;stage=4;scope=frontend;review=6 -->

## PR4 FoodSafety Mixed Content

- [ ] FoodSafety host 한정 URL normalization helper가 `http://www.foodsafetykorea.go.kr`만 `https://www.foodsafetykorea.go.kr`로 바꾼다 <!-- omo:id=accept-foodsafety-host-limited-helper;stage=2;scope=shared;review=3,6 -->
- [ ] `recipes.thumbnail_url`에 FoodSafety `http://` URL이 남지 않는다 <!-- omo:id=accept-foodsafety-recipes-count-zero;stage=2;scope=backend;review=3,6 -->
- [ ] `recipe_sources.extraction_meta_json.source_image_url`에 FoodSafety `http://` URL이 남지 않는다 <!-- omo:id=accept-foodsafety-source-image-count-zero;stage=2;scope=backend;review=3,6 -->
- [ ] `recipe_sources.extraction_meta_json.image_candidates[].url`에 FoodSafety `http://` URL이 남지 않는다 <!-- omo:id=accept-foodsafety-candidates-count-zero;stage=2;scope=backend;review=3,6 -->
- [ ] recipe list/detail/theme, planner, shopping preview/detail, recipe-book list/reader responses가 normalized URL을 반환한다 <!-- omo:id=accept-foodsafety-route-sweep;stage=2;scope=shared;review=3,6 -->
- [ ] HOME theme cards, recipe detail/gallery, planner, shopping preview/detail, recipe-book list/reader에서 mixed-content warning이 없다 <!-- omo:id=accept-foodsafety-browser-clean;stage=4;scope=frontend;review=6 -->
- [ ] migration은 idempotent 하며 already-normalized row를 깨지 않는다 <!-- omo:id=accept-foodsafety-migration-idempotent;stage=2;scope=backend;review=3,6 -->

## PR5 PostCSS Audit

- [ ] `postcss` resolved version이 `8.5.10+`다 <!-- omo:id=accept-postcss-safe-version;stage=4;scope=shared;review=6 -->
- [ ] `package.json`과 `pnpm-lock.yaml`이 일치한다 <!-- omo:id=accept-postcss-package-lock-sync;stage=4;scope=shared;review=6 -->
- [ ] `corepack pnpm audit --prod --audit-level moderate`가 통과한다 <!-- omo:id=accept-postcss-audit-pass;stage=4;scope=shared;review=6 -->
- [ ] `pnpm build`가 통과한다 <!-- omo:id=accept-postcss-build-pass;stage=4;scope=shared;review=6 -->
- [ ] 새 dependency를 추가하지 않는다 <!-- omo:id=accept-postcss-no-new-dependency;stage=4;scope=shared;review=6 -->
- [ ] PR body가 이 문제를 runtime exploit가 아니라 supply-chain/audit compliance blocker로 기록한다 <!-- omo:id=accept-postcss-risk-framing;stage=4;scope=shared;review=6 -->

## Codex-Only Review / Authority / Closeout

- [ ] backend/data PR4는 구현 세션과 다른 Codex review session이 검토한다 <!-- omo:id=accept-separate-codex-backend-review;stage=2;scope=backend;review=3,6 -->
- [ ] PR1 `/privacy`/`/terms`는 별도 Codex authority/review session이 검토한다 <!-- omo:id=accept-separate-codex-legal-authority;stage=4;scope=frontend;review=5,6 -->
- [ ] PR2 HOME anchor change는 별도 Codex authority/review session이 검토한다 <!-- omo:id=accept-separate-codex-home-authority;stage=4;scope=frontend;review=5,6 -->
- [ ] authority-required PR1/PR2는 또 다른 Codex final authority session에서 blocker 0 판정을 받는다 <!-- omo:id=accept-separate-codex-final-authority;stage=4;scope=frontend;review=6 -->
- [ ] final closeout은 별도 Codex closeout session이 PR1~PR5 evidence를 집계한다 <!-- omo:id=accept-separate-codex-closeout;stage=4;scope=shared;review=6 -->

## Overall Launch Gate

- [ ] legal/SEO routes가 local/preview/prod에서 정상 응답한다 <!-- omo:id=accept-launch-legal-routes;stage=4;scope=frontend;review=6 -->
- [ ] fake contact 문자열이 repo와 production 화면에서 제거된다 <!-- omo:id=accept-launch-fake-contact-gone;stage=4;scope=frontend;review=6 -->
- [ ] HOME desktop/mobile first load에 hydration error가 없다 <!-- omo:id=accept-launch-home-hydration-clean;stage=4;scope=frontend;review=6 -->
- [ ] guest public routes에서 gamification 401 console noise가 없다 <!-- omo:id=accept-launch-guest-console-clean;stage=4;scope=frontend;review=6 -->
- [ ] response security headers가 root와 representative routes에 적용된다 <!-- omo:id=accept-launch-security-headers;stage=4;scope=frontend;review=6 -->
- [ ] FoodSafety mixed-content warning이 대상 surfaces에서 사라진다 <!-- omo:id=accept-launch-foodsafety-clean;stage=4;scope=frontend;review=6 -->
- [ ] DB와 JSON metadata에 FoodSafety `http://` URL이 남지 않는다 <!-- omo:id=accept-launch-foodsafety-data-clean;stage=2;scope=backend;review=3,6 -->
- [ ] production audit command가 통과한다 <!-- omo:id=accept-launch-audit-pass;stage=4;scope=shared;review=6 -->
- [ ] 각 PR은 current PR head SHA의 시작된 CI check 전체가 green인 상태에서만 merge한다 <!-- omo:id=accept-launch-current-head-green;stage=4;scope=shared;review=6 -->

### Manual Only

- [ ] 실제 운영자/개인정보 보호책임자/문의처/위탁/국외이전 정보 최종 확인
- [ ] human legal/operator review
- [ ] production deployment 후 Search Console 제출 전 robots/sitemap fetch 확인
- [ ] production DB migration application and count query evidence if local DB cannot mirror production exactly
