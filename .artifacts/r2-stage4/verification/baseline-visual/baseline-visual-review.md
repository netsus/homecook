# 데스크톱 상세 시각 검증의 기준 커밋 재현

**같은 10개 화면의 snapshot 실패가 기준 커밋에서도 재현됐다.** 결과는 **10 failed / 1 skipped / 0 passed, exit 1**이다. 기존 실패라는 진단 사실이며 PASS/N/A/게이트 면제 또는 병합 승인으로 바꾸지 않는다. 배너나 비교 이미지 노후화가 원인이라고 단정하지 않는다.

기준 SHA: `7312a0cc9cfe1f500d896eb806e4d533a4f068b9`.
새 detached 임시 worktree와 별도 `.next`, 기존 node_modules의 APFS clone copy를 사용했다. 설치/버전 변경/제품 코드/config/snapshot 수정은 없다. 공식 Playwright config, desktop-chrome, workers=1, retries=0, `http://127.0.0.1:3122`, reuseExistingServer=false다. 기존 3100/후보 3120 서버, 운영 DB/Docker/provider/배포는 조작하지 않았다.

```text
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3122 PLAYWRIGHT_REUSE_EXISTING_SERVER=0 corepack pnpm exec playwright test tests/e2e/qa-visual.spec.ts --project=desktop-chrome --grep-invert '@visual-core' --workers=1 --retries=0
```

## 후보와 기준 로그 비교

9건은 크기와 diff pixel count가 정확히 일치한다. `qa-meal-detail`은 expected 1280×937 → actual 1280×1197(+260px)는 같지만, 후보 65,906 pixels / 기준 63,377 pixels로 서로 다르다. 동일 수치가 있는 경우에도 두 actual 이미지의 모든 pixel byte가 같다는 주장으로 확대하지 않는다.

| snapshot | 후보 metric | 기준 metric | 수치 일치 |
| --- | --- | --- | --- |
| `qa-meal-detail.png` | Expected an image 1280px by 937px, received 1280px by 1197px. 65906 pixels (ratio 0.05 of all image pixels) are different. | Expected an image 1280px by 937px, received 1280px by 1197px. 63377 pixels (ratio 0.05 of all image pixels) are different. | 차이 있음 |
| `qa-menu-add-search.png` | 10178 pixels (ratio 0.01 of all image pixels) are different. | 10178 pixels (ratio 0.01 of all image pixels) are different. | 동일 |
| `qa-manual-recipe-create.png` | Expected an image 1280px by 1495px, received 1280px by 1535px. 86670 pixels (ratio 0.05 of all image pixels) are different. | Expected an image 1280px by 1495px, received 1280px by 1535px. 86670 pixels (ratio 0.05 of all image pixels) are different. | 동일 |
| `qa-youtube-import-url.png` | 27342 pixels (ratio 0.03 of all image pixels) are different. | 27342 pixels (ratio 0.03 of all image pixels) are different. | 동일 |
| `qa-pantry.png` | Expected an image 1280px by 1528px, received 1280px by 1568px. 51868 pixels (ratio 0.03 of all image pixels) are different. | Expected an image 1280px by 1528px, received 1280px by 1568px. 51868 pixels (ratio 0.03 of all image pixels) are different. | 동일 |
| `qa-shopping-flow.png` | Expected an image 1280px by 898px, received 1280px by 938px. 60595 pixels (ratio 0.06 of all image pixels) are different. | Expected an image 1280px by 898px, received 1280px by 938px. 60595 pixels (ratio 0.06 of all image pixels) are different. | 동일 |
| `qa-mypage-saved.png` | Expected an image 1280px by 1113px, received 1280px by 1153px. 31315 pixels (ratio 0.03 of all image pixels) are different. | Expected an image 1280px by 1113px, received 1280px by 1153px. 31315 pixels (ratio 0.03 of all image pixels) are different. | 동일 |
| `qa-cook-mode-planner.png` | Expected an image 1280px by 744px, received 1280px by 720px. 112029 pixels (ratio 0.12 of all image pixels) are different. | Expected an image 1280px by 744px, received 1280px by 720px. 112029 pixels (ratio 0.12 of all image pixels) are different. | 동일 |
| `qa-leftovers-ready.png` | Expected an image 1280px by 1416px, received 1280px by 1456px. 52258 pixels (ratio 0.03 of all image pixels) are different. | Expected an image 1280px by 1416px, received 1280px by 1456px. 52258 pixels (ratio 0.03 of all image pixels) are different. | 동일 |
| `qa-leftovers-empty.png` | Expected an image 1280px by 970px, received 1280px by 1010px. 19338 pixels (ratio 0.02 of all image pixels) are different. | Expected an image 1280px by 970px, received 1280px by 1010px. 19338 pixels (ratio 0.02 of all image pixels) are different. | 동일 |


후보 `visual-full.log`는 즉시 `candidate-visual-full.log`로 보존했다. 이 작업 시작 시 root `test-results`에는 qa-visual desktop 디렉터리가 이미 0개여서 후보 actual/diff PNG를 추가 복사하지 못했다(`candidate-capture.json`). 따라서 후보↔기준 비교의 직접 근거는 위 로그 수치이며 이미지 byte 비교는 수행하지 않았다.

## 보존 및 소스 근거

- `baseline-desktop-detail.log`: 기준 실행 원문.
- `comparison.json`: snapshot별 후보/기준 metric 비교.
- `expected/`: 기준 Git의 expected PNG 10장.
- `test-results/`: 기준 actual PNG 10장, diff PNG 10장, 실패 screenshot 10장, video/context 원문. 다음 테스트 명령을 실행하기 전에 보존했다.
- `playwright-report/`: 공식 HTML 보고서.
- `evidence-manifest.json`: expected와 test-results의 71개 파일 SHA-256/크기.
- `source-equality.json`: global CSS·app layout·공용 shell/header/tab·qa-visual spec·공식 Playwright config·lockfile·expected PNG 10장을 합친 19개 파일이 기준 Git blob/기준 worktree/후보와 byte 단위로 동일하다.
- `baseline-status-after.txt`, `baseline-diff.txt`: 실행 뒤 tracked source/snapshot 변경 0.
- `listener-before.txt`, `listener-after.txt`: 3122 실행 전·후 listener 0.

의도적으로 제외한 @visual-core 및 후보 전체 48-case 결과는 이 재현 시험에서 재검증하지 않았다. 이번 10개 테스트는 첫 screenshot assertion에서 중단되므로 각 테스트의 뒤쪽 모든 화면이 검증됐다고 주장하지 않는다. 원인 수정/별도 regression gate 판단은 조정자와 독립 검토가 소유한다.

정리 완료: 이 작업이 만든 detached worktree/복제 node_modules/.next만 제거했다. repo-local 증거는 유지하며 `cleanup.log` exit=0이다.
