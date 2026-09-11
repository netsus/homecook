# R2 외 기존 화면 실패의 기준 커밋 재현

결과: **선택한 4개 사례가 기준 커밋에서도 모두 같은 수치로 실패했다.** 이 결과는 기존 실패 재현 사실이며 테스트 통과, N/A, 게이트 면제 또는 병합 승인으로 바꾸지 않는다.

- 기준 SHA: `7312a0cc9cfe1f500d896eb806e4d533a4f068b9` (detached temporary worktree).
- 공식 `playwright.config.ts`, `mobile-ios-small`(Chromium + iPhone SE 에뮬레이션), workers=1, retries=0.
- 새 주소 `http://127.0.0.1:3122`, reuseExistingServer=false. 실행 전·후 listener 0.
- 제품 소스/config 수정 없음. 실행 후 baseline tracked diff 0. 운영 3100/후보 3120 및 기존 프로세스 조작 없음. DB/Docker/provider/배포 작업 없음.

| 기준 spec:line | 결과 | 후보와 동일한 실제 값 |
| --- | --- | --- |
| `slice-16-leftovers.spec.ts:344` | FAIL | 버튼 bottom=509.4375, 허용<=480, lowerHitTarget=false |
| `slice-16-leftovers.spec.ts:360` | FAIL | 버튼 bottom=509.4375, 허용<=480, lowerHitTarget=false |
| `slice-16-leftovers.spec.ts:376` | FAIL | 버튼 bottom=509.4375, 허용<=480, lowerHitTarget=false |
| `slice-prepared-food-planner-entry.spec.ts:915` | FAIL | sticky action bottom=572, 허용<=569 (assertion line 972) |

실행 명령:

```text
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3122 PLAYWRIGHT_REUSE_EXISTING_SERVER=0 corepack pnpm exec playwright test tests/e2e/slice-16-leftovers.spec.ts:344 tests/e2e/slice-16-leftovers.spec.ts:360 tests/e2e/slice-16-leftovers.spec.ts:376 tests/e2e/slice-prepared-food-planner-entry.spec.ts:915 --project=mobile-ios-small --workers=1 --retries=0
```

최종 exit=1, 4 failed. 첫 symlink 시도는 Turbopack이 외부 node_modules 경로를 거부해 시험 시작 전 실패했고 `symlink-startup-failure.log`에 구분했다. 제품/config를 바꾸지 않고 현재 root node_modules를 APFS clone copy하여 재실행했다. 의존성 설치/버전 변경 없음.

`source-equality.json`은 기준 Git blob/기준 worktree/후보의 SHA-256을 비교한다. global CSS·app layout·leftovers page/component·공용 shell/tab·food picker/create form·두 spec·공식 Playwright config·lockfile는 동일하다. package.json만 후보의 R2 검증용 scripts 네 개 추가로 다르며, 이 diff를 `source-diff.txt`에 그대로 보존했다. 모든 파일이 동일하다고 주장하지 않는다.

증거:

- `baseline-four-cases.log`: 기준 실행 원문과 정확 assertion 값.
- `result.json`, `provenance.json`: 기준 SHA/실행 조건/결과.
- `test-results/`: 네 실패 PNG, video, error context; `retained-evidence.json`에 SHA-256/크기.
- `playwright-report/`: 공식 HTML 보고서.
- `baseline-status-after.txt`, `baseline-tracked-diff.txt`, `source-equality.json`, `source-diff.txt`: 소스 비교.
- `listener-before.txt`, `listener-after-symlink-failure.txt`, `listener-after.txt`: 새 포트 안전 확인.

다른 세 실패(총 7개 중 나머지), R2 화면 자체 또는 candidate 전체 regression 결과는 이 진단의 재검증 범위가 아니다. 수정 필요성/범위/후속 gate 판단은 조정자와 독립 검토가 소유한다.

정리 완료: 본 작업이 만든 detached worktree/복제 node_modules/.next/test 실행 원본만 삭제했다. 보존 증거는 위 repo-local baseline 폴더에 남아 있다. `cleanup.log`의 worktree_remove_exit=0.
