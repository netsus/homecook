---
name: ship-pr-loop
description: Verify local changes, commit by intent, push, and open or merge a GitHub PR under Homecook's current repository rules. Use when the user asks to ship local work or complete the commit/push/PR/merge flow.
---

# Ship PR Loop

## 현재 기준

작업 절차와 검증 범위는 저장소 루트의 `AGENTS.md`를 우선한다. 스킬이나 과거 기록의 절차가 충돌하면 현재 저장소 규칙을 따른다.

Homecook은 출시 전 빠른 개발 단계다. CI 대기, 전체 테스트, Stage 승인, workpack/acceptance, Claude review, closeout과 omo-report는 머지 조건이 아니다. 없는 CI가 생길 때까지 기다리거나 CI를 다시 켜지 않는다.

## 작업 흐름

1. `git status -sb`와 diff로 범위를 확인한다. 사용자 변경을 보존하고 관련 파일만 명시적으로 stage한다. 기본 브랜치에서 수정하지 않는다.
2. 의도별로 변경을 묶고 관련 로컬 확인을 수행한다. 일반 UI는 변경 화면을 직접 확인하고, 일반 코드는 관련 테스트를 선택한다. 인증·권한·DB 변경은 `AGENTS.md`의 필수 검증을 유지한다.
3. 최종 diff와 검증 결과를 검토한다. 같은 Codex 작업이 검토와 수정을 이어서 할 수 있다. 발견한 실제 결함은 해결하고, 확인하지 못한 범위는 기록한다.
4. 커밋은 변경 이유를 제목에 쓰고, 필요한 경우 `Constraint:`, `Rejected:`, `Tested:`, `Not-tested:` 같은 Lore trailer를 남긴다.
5. 사용자가 요청한 범위 안에서 push하고 기존 PR을 갱신하거나 새 PR을 연다. PR 본문은 현재 `.github/pull_request_template.md`에 맞춰 변경 내용, 로컬 확인, 남은 위험을 짧게 적는다.
6. 머지까지 요청된 작업이면 로컬 확인과 검토를 마친 현재 변경을 머지한다. Draft/Ready나 승인 수를 별도 내부 조건으로 추가하지 않는다. GitHub의 실제 보호 규칙은 준수하며 강제로 우회하지 않는다.
7. PR URL, 머지 결과, 확인 내용과 남은 위험을 보고한다. 실행하지 않은 CI를 통과했다고 표현하지 않는다.

실제 보호 규칙이 예상과 다르게 머지를 막으면 원인을 확인한다. 이 스킬만을 근거로 보호 규칙을 변경하거나 관리자 우회를 사용하지 않는다. 사용자가 새로 명시한 검사 조건이 있으면 그 요청을 따른다.
