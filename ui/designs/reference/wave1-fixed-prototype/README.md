# Wave1 Fixed Prototype Reference

This directory locks the final Wave1 prototype visual reference for MVP service porting.

- Fixed prototype path: `ui/designs/prototypes/claude-design-260505-wave1`
- Fixed prototype implementation SHA: `9bf7a34c6b422d0c9981d4c2968e3350d5a28892`
- Visual/layout source of truth: fixed prototype
- Functional source of truth: MVP service implementation + official docs

Regenerate the committed screenshots only when the user explicitly approves a newer fixed prototype:

```bash
pnpm capture:wave1-prototype-lock
pnpm validate:wave1-prototype-lock
```

Wave1 service porting PRs must compare their service screenshots against these reference screenshots and record parity evidence in the PR body.

2026-05-12 Wave1 mobile 100% parity update:

- For mobile re-porting, these screenshots are exact visual/layout references, not loose scoring aids.
- The manifest uses `lock_version: 2` and `parity_mode: exact-mobile`.
- The validator no longer accepts historical `required_visual_verdict_score: 90` completion gates.
- Wave1 service porting PRs must include screenshot diff, computed-style audit, DOM geometry audit, visual blocker `0`, and unclassified visual difference `0` evidence before they can pass `pnpm validate:wave1-prototype-lock`.
- Phase 3 added 62 mobile screenshots for 31 additional surface states. Existing references are skipped by default during `pnpm capture:wave1-prototype-lock`; use `-- --force` only for an intentional user-approved refreeze.
- `GLOBAL::LoginGateModal` is not captured yet because the fixed phone shell has no deterministic mobile trigger.
