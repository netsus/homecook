# Developer Onboarding

Homecook은 현재 출시 전 빠른 개발 단계다. 자동 CI, Stage 1~6, workpack gate, OMO와 closeout report를 사용하지 않는다.

## 먼저 읽을 것

1. `AGENTS.md`
2. `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`
3. 변경 기능과 관련된 공식 요구사항·화면·API·DB 문서
4. 관련 코드와 테스트

`docs/workpacks/`, `.workflow-v2/`, OMO 문서는 과거 결정 확인용 기록이다. 신규 작업의 선행 조건이 아니다.

## 저장소 구조

| 위치 | 역할 |
| --- | --- |
| `app/` | Next.js 페이지와 API 진입점 |
| `components/` | 화면과 공용 UI |
| `lib/`, `stores/` | 비즈니스 로직, 서버 helper, 상태 |
| `supabase/` | 로컬 DB migration과 설정 |
| `tests/` | 선택 실행하는 Vitest와 Playwright 테스트 |
| `docs/sync/` | 현재 공식 문서 버전 |
| `docs/workpacks/` | 역사적 기능 계획과 결정 기록 |

## 작업 방법

```bash
pnpm branch:start -- --branch feature/my-change
pnpm dev
```

변경한 화면과 흐름을 직접 확인하며 수정한다. 관련 테스트가 도움이 되면 선택 실행한다.

```bash
pnpm typecheck
pnpm build
pnpm exec vitest run tests/<관련-test>.test.ts
pnpm test:e2e:smoke
```

모든 명령을 매번 실행할 필요는 없다. 인증·권한·DB·배포 변경은 관련 테스트와 안전 절차를 생략하지 않는다.

PR에는 다음만 짧게 적는다.

- 변경 내용
- 직접 확인한 환경과 흐름
- 남은 위험

자동 check를 기다리지 않고 로컬 확인이 끝나면 머지할 수 있다.

## 로컬과 배포

- 일반 개발: `pnpm dev`
- 로컬 Supabase: `pnpm dev:local-supabase`
- 배포 계획: `pnpm deploy:dev:plan`
- 출시 전 개발 서버 배포: `pnpm deploy:dev`
- 상태 확인: `pnpm deploy:dev:status`
- 웹 rollback: `pnpm deploy:dev:rollback`

운영 데이터가 있는 full-local Supabase에는 destructive reset이나 volume 삭제를 실행하지 않는다.
