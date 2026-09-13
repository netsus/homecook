# Git 작업 방식

## 브랜치

기본 브랜치 `master`에서 직접 파일을 수정하지 않는다. 작은 작업 브랜치를 만들고 한 가지 의도만 담는다.

허용 예시:

- `feature/<slug>`
- `fix/<slug>`
- `chore/<slug>`
- `docs/<slug>`
- `refactor/<slug>`
- `hotfix/<slug>`

표준 시작 명령은 `pnpm branch:start -- --branch <name>`이다. workpack 문서나 Stage 완료는 브랜치 생성 조건이 아니다.

## 커밋과 PR

- 커밋 제목은 `feat:`, `fix:`, `docs:`, `chore:`처럼 의도를 알아보기 쉽게 쓴다.
- 하나의 작은 기능이나 수정은 한 브랜치와 한 PR에 함께 담을 수 있다.
- 계약 문서와 그 구현은 같은 PR에 포함할 수 있다.
- PR은 공유 변경의 검토 기록으로 권장하지만 CI, Draft/Ready 전환, 승인 수, Stage evidence는 요구하지 않는다.

PR에는 변경 내용, 로컬 확인 결과, 남은 위험만 짧게 기록한다.

## 머지

GitHub Actions CI는 출시 전 개발 단계에서 비활성화한다. 자동 check를 기다리지 않고 로컬 확인 후 머지할 수 있다.

충돌이 없고 변경한 흐름을 직접 확인했다면 머지한다. 인증·권한·DB·배포 변경은 관련 테스트와 안전 절차까지 확인한 뒤 머지한다.

## 배포

`master` 머지는 자동 배포를 일으키지 않는다. 출시 전 개발 서버 배포는 `docs/engineering/prelaunch-web-deployment.md`의 수동 명령을 사용한다.
