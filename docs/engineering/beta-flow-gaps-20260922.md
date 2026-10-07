# 베타 핵심 흐름 보완 — 2026-09-22

10월 12일 첫 소규모 베타를 목표로 기존 기능의 화면 연결과 안내를 보완한다. 작업 브랜치는 `codex/beta-flow-gaps-20260922`다. 이 문서는 과거 계획의 상태를 현재 사실과 구분하고, 실제 확인한 결과만 기록한다.

**같은 날 후속 운영 작업:** 아래의 ‘운영 미반영·미활성·기존 계획 1건 미보완’은 이 구현 작업 종료 시점의 기록이다. 이후 사용자가 해당 조치를 요청해 실행했다. 최신 DB·웹·설정·실제 화면 상태는 [베타 기능 운영 반영 기록](beta-rollout-20260922.md)을 따른다. 부부 수동 테스트와 외부 사용자 검증은 별도다.

## 기준과 범위

- 최신 계약은 [Current Source of Truth](../sync/CURRENT_SOURCE_OF_TRUTH.md)의 공식 5종과 2026-09-22 addendum이다.
- 레시피 교정·제품/재료 선택·최근 음식·검색 오류·한글 입력·요리 완료 후 기록 연결을 구현하고 관련 검증을 수행한다. 코드와 격리 검증의 완료를 실제 운영 반영과 구분한다.
- 이번 작업은 운영 DB·capability·credential·배포를 변경하지 않는다. 모든 단계 강제, 권한/소유권/read-only/상태 전이 완화, 영양 근거 없는 환산은 하지 않는다.
- 신규 CI·Stage·workpack 승인 조건은 추가하지 않는다.

## 확인한 운영 사실과 한계

2026-09-21 22:37 KST, 기존 `full-local-production.env` 대상과 Docker adapter의 자원을 확인한 뒤 `BEGIN READ ONLY`로 조회한 결과다. 세부 접속값과 사용자 데이터는 이 문서에 기록하지 않는다.

| 확인 항목 | 결과 | 해석 범위 |
| --- | --- | --- |
| `account_generation_capability_state.state` | `generation_active` | F0를 현재 legacy/off로 설명하면 틀림 |
| 직접 Postgres 연결의 `public.read_recipe_snapshot_ui_mode()` | `legacy_v1` | 해당 연결의 결과이며 앱 요청별 override는 미확인 |
| 관련 두 feature flag의 `pg_db_role_setting` 영속 설정 | 빈 목록 | 요청 안에서 설정될 가능성까지 배제하지 않음 |
| 20260919000000 repairs migration | checksum 적용 이력 존재 | 읽기 scope 누락은 이미 복구된 이력 |
| migration ledger 조회 전/후 | 동일 | 이 확인은 운영 쓰기를 하지 않음 |

후속 작업에서 새 상태 도구로 실제 PostgREST 시작 방식까지 읽기 전용 확인했다. `generation_active`, 두 DB 기본 설정 미설정, UI mode `legacy_v1`, 역할별 설정 충돌 0, 내용 snapshot 없는 미완료 계획 1건, 잘못된 private 이미지 참조 0이었다. 미등록 과거 이미지 1건은 정리 대상이라고 단정하지 않고 경고만 남긴다. **기존 계획 1건은 새 모드 활성화 전에 다뤄야 할 운영 잔여이며 이번에 자동 보정하지 않았다.** 기능 코드의 병합, DB에서 읽은 상태, 실제 사용자 요청과 브라우저 동작은 각각 구분한다.

## 문서 상태 정리

| 항목 | 정리 내용 | 근거 |
| --- | --- | --- |
| DOC01 | 7월 22일 master plan은 역사 원안, 7월 23일 승인 및 F0+#1~#14 병합 후 현재 문서 링크 표시 | master plan 상단, CSoT, #14 병합 지도/보고 |
| DOC02 | #3의 docs/planned는 과거 checkpoint. 구현 병합과 운영 정리를 구분 | #3 README, work-item, omo-report |
| DOC03 | #13 Ready/merge pending은 과거 checkpoint. PR #1369/#1371 병합 완료 | #13 README, work-item, omo-report |
| DOC04 | #14 병합·리허설 검증 완료와 운영 실사용 미확인을 분리 | 8월 25일 PR #1412 및 병합 후 13/13 기록 |
| DOC05 | snapshot 읽기 scope 후속 문서는 9월 19일 해결·적용으로 갱신 | 20260919000000 migration, prelaunch-repair-20260918 |
| DOC06 | 이전 요리 ‘영양 기록 없음’은 후속 조건부 계산 승인으로 대체. 실측과 재료 중량 기준 계산은 구분 | CSoT 9월 15일 후속 승인, repairs SQL |
| DOC07 | /about·FAQ의 YouTube/식사 상세·수정 준비 중 안내를 현재 입력·수정 제공 상태에 맞춤 | service-guide, about-screen |

과거 workflow JSON의 `in_progress`/`projecting`은 전체 당시 운영 잔여를 포함하는 보존 기록이다. 자동화 검증의 병합 완료 사실을 함께 기록하고 현재 신규 작업 gate로 사용하지 않는다. 과거 외부 검증 pending이 남아 있다는 이유만으로 현재 F0를 미활성이라고 판단하지 않는다.

## 실제 변경·확인 결과

### 문서·가이드

- 역사 계획과 #3/#13/#14 상태 해석, 읽기 scope 해결, legacy 영양 설명의 대체 관계를 정리했다.
- 가이드에 현재 YouTube 가져오기와 음식 상세의 섭취량 수정 경로를 표시했다. 필요한 기능으로 바로 시작할 수 있음을 안내한다.
- 관련 기존 테스트의 구형 준비 중 문구 기대값을 갱신했다. `pnpm exec vitest run tests/service-guide-content.test.ts tests/about-screen.test.tsx`는 2개 파일·13개 테스트 통과했다. `git diff --check`도 통과했다. 모바일/데스크톱 실제 화면 확인은 통합 확인에 남아 있다.

### 앱 구현·통합 확인

| 항목 | 구현 내용 | 확인 기준 |
| --- | --- | --- |
| D01 | 이름 있는 재료 교체·추가·삭제, 조리 단계의 재료 참조 정리. 일반 재료 교체는 기존 양·단위·고정 여부 유지. 제품 단위가 다르면 재입력 전 저장 차단 | 원본 200g/고정량 보존, 삭제 참조 제거, 중복 재료 방지, 모바일/데스크톱 편집 |
| D02 | 작성·개인 편집의 통합 picker, 승인 연결 제품 선택, 제품/영양 버전 쌍의 원자적 저장과 그 버전에 따른 계산. 상세·요리에서 제품명을 확인 | 승인 관계/접근권한/버전 불일치 거부, 일반 재료 영양 fallback 금지, 실제 DB snapshot 저장 |
| D03 | 최근 음식과 재로그인 초안을 이름이 아닌 정확 ID로 재확인해 허용 단위·환산 관계 복원 | 이름 변경, kg/g·포장/g, 접근 불가·단위 지원 종료, 재로그인·비동기 경합 |
| D04 | 요리한 음식의 최근 목록과 제품·재료의 최근 목록을 해당 탭에서 제공 | 탭별 출처 분리·기존 남은 음식 선택 유지 |
| D05 | 팬트리 제품 조회 실패를 빈 목록으로 바꾸던 처리를 제거하고 오류·재시도 표시 | 제품만 실패한 경우와 재시도 성공, 모바일/데스크톱 |
| D06 | 한글 조합 중 조회를 멈추고 완료 뒤 지연 검색, 오래된 검색·더보기 응답 취소 | 조합 입력·이전 응답 경합 회귀 |
| D07 | 완료 뒤 식사기록/남은요리/복귀, 취소 뒤 복귀. 새 기능 상태 확인과 명시적 설정 도구 제공 | 읽기 전용·중복 완료 방지, 안전한 복귀 URL, DB 설정 쌍 원자성. 운영 활성화는 미실행 |

통합 과정에서 재로그인 초안에 일시적인 단위 메타정보가 섞여 복원이 폐기되는 문제와, 삭제된 끼니 기록 상세에서 옮길 끼니를 고를 수 없는 문제도 수정했다. 초안의 기존 영속 필드만 저장하고 복귀 뒤 현재 정보를 다시 읽으며, 삭제된 끼니 기록의 수정은 활성 끼니 선택 후 허용한다.

### DB·API 반영 범위

- 새 SQL은 기존 테이블과 권한·세션·이미지·receipt 보호를 유지한다. 과거 recipe/meal/batch 데이터를 일괄 재작성하지 않는다.
- 현재 계정 세대 방식의 수동 작성은 private recipe다. 제품 쌍을 보존하지 못하는 구형 작성 경로는 요청을 거부해 제품을 일반 재료로 조용히 바꾸지 않는다.
- 제품 영양은 **정확히 고정한 버전**의 승인 공개 출처·기준량·환산 관계를 사용한다. 제품의 현재 버전이나 대표 재료 영양으로 대체하지 않는다. 출처 미확인·직접 입력 라벨은 부분값/계산 불가 상태를 유지한다.
- 기존 `/food-catalog/search`에 정확 `source_type/source_id` 모드를 추가한다. 인증된 자기 계정 조회이며 익명 실행·다른 사용자 ID 위조를 막는다. 이름·검색 순위와 무관하고 결과 없음은 0행이다.

### 운영 모드 도구

`pnpm recipe:snapshot:features -- status --config <저장소 밖의 private full-local 설정>`은 읽기 전용이다. `plan`, `enable`, `disable`도 `--execute` 없이는 상태와 계획만 출력한다.

명시 실행은 exact local target와 기존 서명된 백업 readiness를 확인하고, 두 DB 기본 설정을 한 transaction으로 바꾼다. 새 DB 연결의 값과 UI mode를 확인하며, 설정을 끌 때 기존 v2 기록·조회·완료·취소를 삭제하지 않는다. 누락된 계획 pin, 잘못된 private 이미지 참조, 역할별 설정 충돌은 차단한다. 참조 없는 과거 이미지 숫자는 경고이며 자동 삭제나 활성화 조건으로 사용하지 않는다.

기존 PostgREST 연결 풀 재연결이나 운영 데이터 backfill은 자동 수행하지 않는다. 도구 결과도 `activation_verified:false`를 유지한다. 앱의 실제 생성·저장 완주를 확인하기 전에는 운영 활성화 완료라고 기록하지 않는다.

### 검증과 한계

- 변경된 동작의 Vitest 회귀, 실제 격리 PostgreSQL에서 설정·권한·원자성 검증, 현재 전체 migration 재생 및 제품 선택/영양 저장/YouTube catalog 검증을 수행했다. 최종 명령과 집계는 아래 결과 표에 기록한다.
- `tests/e2e/beta-flow-gaps.spec.ts`는 390px 모바일·1280px 데스크톱에서 12개 과제를 검증하고 `.artifacts/beta-flow-gaps/`에 화면을 저장한다. 실제 작성·수정 컴포넌트를 사용하지만 API는 격리된 가짜 응답이다. 운영 저장·실사용자 테스트로 해석하지 않는다.
- 운영 secret 없는 별도 복사본에서 production build를 수행한다. 개발 중인 다른 서버의 `.next`를 덮어쓰지 않는다. 빌드의 기존 `eslint-plugin-react-hooks` 해석 경고와 변경 파일 대상 ESLint 결과를 분리한다.
- 전체 Vitest/전체 E2E를 실행한 것은 아니다. 구형 `manual-recipe-create-screen.test.tsx`의 전체 묶음은 현재 인증·이미지·성공 알림 mock과 맞지 않는 기존 실패가 남아 있다. 이번 수동 작성 동작은 새 focused tests와 브라우저 picker 검증으로 확인했다.
- 운영 DB migration 적용·웹 배포·새 모드 활성화·신규 OAuth 완주·부부 수동 테스트는 미실행이다. 10월 12일 베타 전 수동 확인 목록은 그대로 수행해야 한다.

### 최종 확인 결과

| 확인 | 결과 |
| --- | --- |
| 변경 관련 Vitest 24파일 | 251개 통과. 최근 ID/단위/로그인 복귀, 재료 교정·제품 선택·영양·표시, 권한·운영 도구 포함 |
| `pnpm verify:beta-flow-gaps:db` | 현재 migration 182개 격리 재생 성공. 제품 선택·authenticated A/B·실제 v2 조회 16개, 제품 영양·실제 snapshot 저장 3개, 기존 YouTube catalog/분수/변조거부 3개: 총 22개 통과 |
| 모바일 390px / 데스크톱 1280px | beta-flow-gaps Playwright 12개 통과, 화면 24장 저장·확인. 가짜 API임을 명시 |
| `pnpm typecheck` | 통과 |
| 변경 JS/TS 61파일 ESLint | 통과 |
| production build | 격리된 소스 복사본 exit 0. runtime source가 최종 작업본과 같음을 파일 비교. 빌드 내부 ESLint는 기존 react-hooks plugin 해석 문제로 완료되지 않았으며 위 별도 ESLint와 구분 |
| 공식 문서 동기화·diff·변경 JSON | 통과 |
| 독립 검토 | 수량 보존, 정확 ID/재로그인, 제품명 표시, 실제 v2 경로, 불필요한 과거 이미지 차단을 수정한 뒤 추가 차단·중요 지적 없음 |

전체 migration 검증 대상 hash는 `aa07783d01383e0ff69dbdd228b1c19db43fe6ddc9227ca6a1a994ca6775b795`이며, 검증용 `hcg_50178_ab6cc5` 자원은 검증 뒤 정리했다. 운영 DB에는 네 개의 새 migration을 적용하지 않았다.
