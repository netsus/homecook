# Slice 8 Claude Pre-Signoff

Source artifact:

- `.omx/artifacts/claude-delegate-1dcfb5ba-e2cc-4d1a-a658-8f90c0a26b18-slice8-presignoff-response-20260519T005258Z.md`

Claude session metadata:

- `session_attach_mode=resume`
- `session_id=1dcfb5ba-e2cc-4d1a-a658-8f90c0a26b18`
- `model=opus`
- `effort=high`
- `permission_mode=bypassPermissions`

Verdict:

- `PRE-SIGNOFF: APPROVED`

Scope approved:

- `screen:LEFTOVERS`
- `screen:ATE_LIST`
- final Slice 8 burn-down evidence

Key implementation constraints:

- Use `WebShell className="web-leftovers-shell"` and `WebTopNav activeId="mypage"` for desktop.
- Add `.web-leftovers-shell` to the web token bridge.
- Use breadcrumb plus `WebPageHeader`; remove the ad hoc stats-card header.
- Render leftovers as a 3-column desktop card grid, with a 2-column fallback around 1024-1100px.
- Render ate-list as rows using the prototype `72px minmax(0,1fr) auto auto` structure.
- Use shared web primitives for buttons, cards, empty, error, and skeleton states.
- Do not invent new leftovers cook-start or ate-list recreate APIs.
- Mobile below `1024px` must remain preserved.

Allowed divergences:

- `요리하기` links to `/recipe/{recipe_id}` because no `startCookFromLeftover` API exists.
- `다시 만들기` links to `/recipe/{recipe_id}` because no `recreateFromAte` API exists.
- Prototype demo controls are not rendered in MVP.
