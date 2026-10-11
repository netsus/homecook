# 집밥 서비스 작업 규칙

## 현재 개발 모드

- 현재는 출시 전 빠른 개발 단계다. GitHub Actions CI는 사용하지 않는다. `Anti Slop`도 `pnpm verify:anti-slop` 로컬 명령으로 실행한다. 체크인된 대상 경로 workflow는 향후 Actions를 다시 활성화할 때 사용할 준비 파일이며 현재 PR의 required check나 머지 조건이 아니다.
- 사용자 피드백은 여러 오류·개선을 작업 브랜치에 모아서 처리한다. 개별 수정마다 커밋·머지·배포하지 않고 사용자가 묶음 반영을 요청할 때 진행한다.
- 수정 중에는 필요한 코드 확인과 해당 변경의 작은 회귀 검사만 수행한다. 실제 사용자 흐름·모바일/데스크톱 화면·타입/빌드 확인은 수정 묶음 단위로 정한다.
- 일반 화면·문구 수정마다 운영 백업·전체 복원·자동 시작 검증을 반복하지 않는다. 실제 DB·인증 서버·시작 설정을 변경하는 배포에서 해당 변경에 필요한 보호와 검증만 수행한다.
- 한 Codex 작업에서 계획, 구현, 로컬 확인, 수정, 커밋과 PR까지 이어서 처리할 수 있다.
- workpack, acceptance, Stage 1~6, 별도 task 승인, OMO, closeout, omo-report는 신규 작업의 조건이 아니다.
- 기존 workpack과 workflow-v2 자료는 과거 결정과 기능 맥락을 찾는 참고 기록으로만 사용한다.
- 고객 유입 또는 광고 집행을 시작하기 전에 최소 CI와 출시 점검을 다시 도입한다.
- 저장소의 스킬·에이전트·보조 문서가 작업 절차나 검증 범위를 다르게 요구하면 현재 `AGENTS.md`를 우선한다. 과거 CI·Stage·workpack·Claude review·closeout 지침을 신규 작업 조건으로 되살리지 않는다.

## 작업 시작

1. `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`에서 현재 공식 문서 경로를 확인한다.
2. 변경할 기능과 직접 관련된 공식 문서와 코드만 읽는다.
3. 작은 작업 브랜치를 만들고 구현한다. `pnpm branch:start -- --branch <name>`을 사용할 수 있다.
4. 관련 오류를 고치며 필요한 작은 검사를 실행하고, 수정 묶음의 사용자 흐름을 확인한다.
5. 변경 내용, 확인 결과, 남은 위험을 짧게 기록한다. 사용자가 요청한 시점에 묶어서 머지·배포한다.

공식 요구사항, 화면, API 또는 DB 계약을 바꿀 때는 사용자의 요청을 기준으로 관련 공식 문서와 구현을 같은 작업 브랜치에서 함께 갱신한다. 별도 docs PR이나 선행 Stage는 필요하지 않다.

## Codex 작업 품질

- 사용자에게는 결론과 현재 상태를 먼저 말한다. 필요한 만큼만 설명하고 같은 내용을 반복하지 않으며, 진행 알림은 중요한 결정·차단·완료 중심으로 짧게 쓴다.
- 구현 전에 현재 파일과 실행 결과로 전제를 확인한다. 결과를 바꿀 불확실성·충돌·트레이드오프는 숨기지 말고, 중요한 해석이 여러 개면 질문하거나 선택지를 드러낸다.
- 요청을 만족하는 가장 단순한 해법을 우선한다. 요청하지 않은 기능·추상화·설정 가능성·인접 리팩터링을 추가하지 않고, 변경 때문에 새로 생긴 미사용 코드만 함께 정리한다.
- 여러 단계 작업은 각 단계의 성공 조건과 확인 방법을 짧게 정한 뒤, 확인될 때까지 구현과 검사를 반복한다. 사소한 작업에 장문의 계획을 만들지는 않는다.
- TypeScript/JavaScript를 새로 작성하거나 의미 있게 리팩터링·리뷰할 때는 `homecook-typescript-evidence-review` 스킬을 적용한다. 제품 소스의 선택된 Anti Slop 규칙은 `pnpm verify:anti-slop`으로 검사하며, checked-in baseline을 넘는 신규 위반을 허용하지 않는다.
- 커밋, PR 생성, 머지 또는 완료·통과 주장 직전에는 `verification-before-completion` 스킬을 적용해 그 주장에 맞는 최신 명령의 전체 결과와 종료값을 확인한다. 테스트·lint·typecheck·build·요구사항 확인은 서로 대신하지 않는다.
- 이 절의 저장소 공통 지침과 `.agents/skills` 변경은 Codex가 새 실행을 시작할 때 로드된다. 이미 열린 세션에는 자동 소급되지 않으므로 다시 시작해 확인한다.

## 로컬 확인

- 일반 UI 수정: 수정 묶음을 확인할 때 변경 화면을 모바일과 데스크톱에서 확인한다.
- 일반 코드 수정: 관련 테스트를 선택 실행한다.
- 배포 전: 최소 `pnpm typecheck`와 `pnpm build`를 권장한다.
- 인증, 권한, 다른 사용자 데이터, read-only, 상태 전이, DB 변경: 해당 변경의 작은 회귀 검사를 수행하고 실제 흐름은 묶음 반영 전에 확인한다. 개별 수정마다 운영 테스트나 백업을 실행하지 않는다.
- 전체 Vitest, 전체 Playwright, Lighthouse, visual regression은 매 PR의 의무가 아니다. 큰 변경이나 출시 준비 때 선택 실행한다.

## 절대 안전 규칙

- Supabase의 운영·개발 기준은 `docs/engineering/supabase-local-only-operations.md`다. Supabase Cloud project, linked remote DB, remote credential을 요구하거나 사용하지 않는다.
- 운영 데이터가 있는 full-local Supabase에서 `db reset`, volume 삭제, 파괴적 replay를 실행하지 않는다.
- 운영 데이터 변경 전에는 대상과 백업 상태를 확인한다. 스키마 검증은 격리된 로컬 환경을 사용한다.
- 권한, 소유권, read-only, 멱등성, 상태 전이 보호를 편의를 위해 완화하지 않는다.
- 비밀정보를 저장소, 명령 인수, 로그에 넣지 않는다.
- 배포는 `docs/engineering/prelaunch-web-deployment.md`의 `pnpm deploy:dev` 경로를 사용한다. worker, Docker 구성, 네트워크, 파괴적 DB 변경은 빠른 배포 범위가 아니다.

## 구현 계약

- API 응답은 `{ success, data, error }` 래퍼를 유지한다.
- error는 `{ code, message, fields[] }` 구조를 따른다.
- UI는 필요한 `loading / empty / error / read-only / unauthorized` 상태를 다룬다.
- 비로그인 보호 액션은 로그인 안내 후 return-to-action을 지원한다.
- 새 의존성을 추가하거나 제거하면 `package.json`과 `pnpm-lock.yaml`을 함께 갱신한다.

## 주요 도메인 규칙

- `meals.status`는 `registered -> shopping_done -> cook_done` 순서로만 전이한다. 독립 요리는 meal 상태를 바꾸지 않는다.
- 장보기 preview는 `status='registered' AND shopping_list_id IS NULL`만 포함한다.
- 장보기 완료 후 목록은 read-only이며 수정 API는 `409`를 반환한다.
- `is_pantry_excluded=true`이면 `is_checked=false`로 정리한다.
- `add_to_pantry_item_ids`는 `null`=기본값, `[]`=미반영, 값 목록=선택 반영이다.
- `shopping_list_items`는 `sort_order ASC`, 동률이면 `id ASC`다.
- 요리모드에는 인분 조절 UI를 두지 않는다.
- 저장 가능한 레시피북 타입은 `saved`, `custom`이다.
- 삭제된 `DELETE /recipes/{id}/save`를 되살리지 않는다.

## Git과 소통

- 기본 브랜치에서 직접 수정하지 않고 하나의 작은 의도를 작업 브랜치에 담는다.
- PR은 선택이지만, 공유 저장소 변경은 짧은 PR로 머지하는 방식을 권장한다.
- CI 결과, Stage evidence, workpack closeout은 머지 조건이 아니다.
- 사용자-facing 응답은 특별한 요청이 없으면 한국어로 작성한다.
