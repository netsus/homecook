# Stage 3 backend review evidence

- Slice: `marketing-demand-validation`
- Branch: `feature/be-marketing-demand-validation`
- Scope: 단일 validation route, 단일 session table, shared pure rules, scoped service-role access
- Review separation: Stage 2 구현자와 별도의 Codex code reviewer 및 security reviewer

## Review rounds

1. 사전 보안 검토는 UUID row authority, exact Origin, Turnstile hostname/action, lead-only readiness, duplicate race, raw metadata 금지를 blocker로 잠갔다.
2. 최초 구현 리뷰는 progressed view 처리, negative intent lead, attribution/nullable type, Turnstile HTTP fail-closed, retention authority를 지적했다.
3. 수정 뒤 code reviewer는 progressed `view`를 완료 action replay로 보는 승인 계획 §6.2를 재확인하고 finding을 철회했다.
4. 최종 code verdict: `APPROVE`.
5. 최종 security verdict: `APPROVED / FINDINGS_COUNT:0`.

## Verified behavior

- server-issued UUIDv4 HttpOnly cookie와 실제 session row가 함께 있어야 후속 action이 가능하다.
- 같은 action은 first-write-wins이며 새 payload로 기존 값을 덮어쓰지 않는다.
- `intent_choice=enough`인 대조군은 email 제출 전에 409로 차단된다.
- accepted/duplicate lead의 공개 response body는 byte-for-byte 동일하다.
- Turnstile은 HTTP 2xx, `success`, allowlisted hostname, exact action을 모두 만족해야 한다.
- lead readiness가 닫혀 있어도 quiz/result pure rule은 동작한다.
- raw IP, user-agent, referrer, cookie fingerprint, Turnstile token은 DB schema와 response에 저장하지 않는다.
- `target_qualified`는 quiz 완료 전 null이고 서버가 공식 truth table로 다시 계산한다.
- followup 두 질문은 선택 사항이며 둘 다 건너뛰어도 completion timestamp를 기록할 수 있다.

## Automated evidence

- Focused Vitest: 6 files, 80 tests passed
- Product Vitest: 253 files, 2,984 tests (2,809 passed / 175 intentionally skipped)
- TypeScript: `pnpm typecheck` passed
- ESLint: `pnpm lint` passed
- Next production build: passed; `/api/v1/marketing/validation` route emitted
- Security Playwright smoke: 12/12 passed
- Fresh isolated full-local migration/security gate: all migrations including `20260831100000_marketing_validation_sessions.sql` replayed; security-function PostgreSQL and Data API negative smoke passed
- Diff whitespace: `git diff --check` passed

## Pending

- Current-head backend PR CI
- Manual Only: operator privacy facts, production Turnstile secret/hostname, paid origin/UTM, campaign end, edge rate-limit evidence, production readiness approval
