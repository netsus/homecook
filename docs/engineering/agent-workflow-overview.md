# 출시 전 개발 흐름

## 상태

현재 Homecook은 출시 전 빠른 개발 모드다. GitHub Actions CI, Stage gate, workpack gate, OMO와 closeout 보고서를 사용하지 않는다.

## 기본 흐름

1. 현재 공식 문서와 관련 코드를 확인한다.
2. 작은 작업 브랜치에서 기능을 구현한다.
3. 로컬 앱을 직접 사용해 변경 흐름을 확인하고 계속 수정한다.
4. 관련 테스트가 가치 있을 때 선택 실행한다.
5. 변경 내용과 실제 확인 결과를 짧은 PR 또는 커밋에 남기고 머지한다.
6. `pnpm deploy:dev`의 빌드와 preview smoke를 통과한 결과를 출시 전 개발 서버에 배포한다.

별도 Stage, task ID 분리, 독립 승인, workpack/acceptance 갱신, OMO 상태 동기화는 요구하지 않는다.

## 변경 위험에 따른 확인

| 변경 | 기본 확인 |
| --- | --- |
| 문구·간격·색상 | 해당 화면 모바일/데스크톱 직접 확인 |
| 일반 UI·상태 처리 | 관련 화면 흐름 + 필요한 관련 테스트 |
| API·서버 로직 | 요청/응답/오류 흐름 + 관련 테스트 |
| 인증·권한·소유권 | 다른 사용자 접근 차단과 실패 경로 테스트 |
| DB migration | 격리 로컬 replay, 백업, 이전 앱 호환성 확인 |
| 배포 도구·운영 설정 | 전용 테스트와 dry-run/plan 확인 |

`pnpm typecheck`와 `pnpm build`는 배포 전 최소 권장 검사다. 전체 `pnpm test`, 전체 Playwright, Lighthouse, visual regression은 큰 변경이나 출시 준비 때 실행한다.

## PR

PR 본문에는 세 가지만 있으면 된다.

- 무엇을 바꿨는지
- 로컬에서 무엇을 확인했는지
- 남은 위험이나 확인할 항목

CI check, approval count, Ready 상태, closeout projection은 머지 조건이 아니다.

## 출시 전환

고객 유입 또는 광고 집행 전에는 별도 작업으로 다음을 다시 정한다.

- 빠른 lint/typecheck/build/관련 테스트 CI
- 인증·권한·DB 변경 전용 검사
- 배포 전 핵심 Playwright smoke
- 필요한 branch protection과 필수 check

기존 workflow와 OMO 구현은 Git 이력에서 복구할 수 있으나, 당시 구성을 그대로 되살리지 말고 현재 제품 위험에 맞춰 최소 구성부터 만든다.
