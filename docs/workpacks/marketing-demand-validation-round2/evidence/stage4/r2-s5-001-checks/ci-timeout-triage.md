# 1a519 CI 시간 초과 관측

실행 [34568682592](https://github.com/netsus/homecook/actions/runs/34568682592)의 첫 quality 시도는 `personal-recipe-editor-full-local-verifier.test.ts:515` 한 조건의5000ms timeout으로 실패했다. 관측시간은5012ms, 전체8647 PASS/516 skip/1 FAIL이다. `ci-1a519-quality-attempt1.log.txt`는 수집한 `gh --log-failed` 원문이고, `ci-1a519-focused.log.txt`는 현재 소스의 같은 파일17조건이 모두 통과한 개별 실행이다. 개별 통과만으로 CI 실패 원인을 확정하지 않는다.

읽기 전용 코드 확인에서62eff→1a519의 해당 검증기·테스트와 app/components/lib는 변경0이다. `collectPersonalRecipeEditorSourceEvidence`는 이 source root의 TS/TSX와 고정 source를 읽고 TypeScript로 파싱한다. 새 docs/ui evidence/.artifacts를 직접 순회·해시·파싱하지 않는다. 증거 파일 증가가 해당 함수의 입력량을 직접 늘렸다는 가설은 이 코드 경로와 맞지 않는다.

전체 CI의 CPU·파일 읽기 경쟁은 가능한 가설이지만 구간별 측정이 없어 원인으로 단정하지 않는다. threshold·skip·소스 변경 없이 같은1a519 head의 failed-job1회 재실행은 attempt2에서 success로 종료했다. [동일 head 재실행 결과](ci-1a519-attempt2-result.json)를 보존하며 최초 실패를 삭제하지 않는다. 후속 metadata head의 CI는 별도 실행이고, 동일 실패가 다시 나타나면 이 기록으로 면제하지 않는다.
