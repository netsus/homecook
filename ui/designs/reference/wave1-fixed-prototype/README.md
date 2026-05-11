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

Wave1 service porting PRs must compare their service screenshots against these reference screenshots and record the visual verdict score, blocker count, and any approved divergence in the PR body.
