# R2 production-build local preview evidence

This is a production **build** served only on loopback with the explicit non-saving preview flag. It is not a deployment or collector activation. Production and lead collection flags are false. No private .env file was copied; the child process receives an explicit minimal preview-only environment.

The coordinator's completed `.next` build was copied while the first full frontend gate entered Lighthouse, before the regression dev server could overwrite it. Cache was excluded. BUILD_ID and compiled page SHA256 were checked before and after copy, and eight owned source hashes remained identical through browser verification. `copy.json` and `result.json` record identity. The recorded Git HEAD is the pre-commit base; the tested uncommitted candidate is bound by the source hashes, not a claim that those changes were already committed.

- `headers.txt`: actual HTTP 200, exact `Cache-Control: private, no-store`, and `Referrer-Policy: no-referrer`.
- `e2e.log`: 29 passed in 42.2 seconds; failures, skipped and flaky counts all zero.
- `result.json`: machine-readable run/candidate identity.
- `screenshot-manifest.json`: 68 final PNGs including 64 topic/viewport/state captures and four actual 200%-text captures. There is no Next dev indicator in these production images.
- Full Playwright report: `../preview-browser/runs/2026-09-11T02-19-32-625Z/report.json`.
- All 68 capture points passed axe/overflow/touch-target checks; eight full matrix flows asserted external calls 0, writes 0, page/console/failed-request errors 0, IndexedDB/localStorage/sessionStorage records 0. Both topics passed keyboard focus and return, reduced motion and actual 200% root text at 320px.

The RECOVERY capture is explicitly local consent validation, not a substitute for API error/DB integration. Real provider, mobile OS/in-app browsers, mail and production activation are not verified by this local preview.

Server URLs retained for the explicitly authorized handoff:

- http://127.0.0.1:3117/beta/r2/recording
- http://127.0.0.1:3117/beta/r2/homeflow

`server-ownership.json` identifies only this child process/temp directory. The owning wrapper is exec session 34421 and child PID 95850. Terminating this owned child triggers the wrapper's marker-checked deletion of its temporary copy and writes `cleanup.json`; it does not touch the source worktree, other servers, Docker, Supabase or operational data. The leader and coordinator were informed of the live URLs and evidence. The leader owns the eventual shutdown or continued review handoff.
