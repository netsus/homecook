# 무먹 YouTube 접수 복구 — 실제 반영 검증

## 범위와 원인

로그인 유튜브 접수는 DB가 V1 중복식별 키를 요구하지만 실제 웹에는 기존 V2 키만 남아 있어 실패했다. 기존 V1 종료8건 외 V2 종료33건(성공24·실패9)이 있었고, 기존 공식 웹 V2 키의 HMAC을33/33 대조했다. 최초 불일치 발생 시점은 미확정이며 UI 감사 수정 PR1731/1732의 회귀로 단정하지 않는다.

새 키 발급·교체·별도 secret 파일·접근권한 확대는0이다. 키·JWT·원 fingerprint·사용자 식별자를 공개하지 않는다. cursor V1은 별도 용도다. C05/R2는OFF, worker gen49는 유지한다.

## 최종 소스와 사전 검증

- PR1738: https://github.com/netsus/homecook/pull/1738
- 최종 병합 커밋 `25a6314ce16eef382b671b9086579e0909649afa`.
- master91aa40c5d의 병행 PR1734–1737(남은 요리·경험치)을 포함했다.9개 경로의53da→master before/after SHA만 개별 고정하며 다른 bytes는 거부한다. 독립 대조9/9일치, 변조 회귀 통과.
- 별도 완성무게 후속·추출기 미완성 후보는 제외했다. 원 사용자 checkout은 수정하지 않았다.
- 통합 표적15파일438 PASS, typecheck·변경ESLint·diff검사 exit0. Anti Slop 신규위반0(기존baseline 전체해결 의미 아님).
- 동결 트랜잭션 core SHA `eb42487f9ca0fb0472f7c4fbc333bfbf80635eaa4cf80c9d69a1f4cb4df6ee30`: 격리PG15/17 각각13 PASS. 합성 fixture/catalog stub이므로 실제 인증·RLS·PostgREST·worker 성공 증거로 확대하지 않는다.
- 최종 READ ONLY 계획 `/private/tmp/homecook-fingerprint-v2-review-20261017/operating-plan.json`, SHA256 `be8e1cf9480bd579a1903ce70a684d58eaf567ca2cc5742a85dd66a2a478e05a`. 기존41·active0·permitfalse·기존V2키33/33·workerPID49750을 확인했다. 이전fbdd계획은 재사용하지 않았다.

## 실행 확인

승인 plan SHA만 담는 create-only Keychain 감사 앵커 등록 exit0. 비밀 키나 지속 접근권한 추가가 아니다.

정책 전환 exit0: `current_fingerprint_key_version` 1→2 및 updated_at만 변경했다. 기존작업41건의 전체행 지문·보호관찰값은 전후 동일하다. 전용 transaction의advisory lock·fresh snapshot·full policy CAS·active0 검사를 통과했다. DB232·schema/functions/index/GRANT/RLS·일반자료·기존worker권위는 보존했다.

운영 영수증: `~/.homecook/operations/youtube-fingerprint-v2-20261017/{plan.json,policy-backup.json,attempt-1/,apply-receipt.json,authority.json}`. 파일0600·디렉터리0700. 키값·키digest는 담지 않는다.

공식 배포 도구는 동일 최종커밋으로 설치했다. 배포의 선택 웹 회귀는1,451 PASS·133 SKIP이며 Next 최적화 컴파일93초 성공을 확인했다. 최종 빌드·교체·운영 GET의 완료 여부와 Chrome 검증 결과는 진행 완료 후 아래에 기록한다.

## 판정표

| 항목 | 기대 동작 | 실제 확인 | 현재 분류·베타 차단 |
|---|---|---|---|
| 중복식별 정책/키 | 정책이 선택한 기존 키로 접수 | 기존V2키33/33 일치·current2 전환 | 설정 원인 복구, HTTP 완료판정 대기 |
| 기존41작업/DB권위 | 원행·결과·quota·소유권·권한 보존 | 전후 전체jobs/보호관찰값 동일·DB232 | 회귀 미검출(전환 관찰 범위) |
| 새 키/worker | 기존 키·gen49·동일 PID 유지 | 키변경0·PID49750 보존 | 계획 일치 |
| 병행master | 최근PR을 덮어쓰지 않음 | PR1734–1737 전체9파일 exact SHA 포함 | 계획 일치 |
| 실제 로그인 접수 | HTTP→V2 job1개→worker | 아직 신규신청0 | 검증 대기·베타 완료판정 차단 |
| 알림→저장→북/플래너 | 같은결과로 연결·새로고침 복구 | 아직 미실행 | 검증 대기 |
| C05/R2 | 수집OFF 유지 | 전환의기존closed보호 유지 | 새수집 기능미구현/보류와 구분 |

운영 웹 화면은 사용자 Mac Chrome으로 점검했다. 현재 로그인 닉네임 `cw****`가 별도 QA 계정인지 확인되지 않아, 이 계정에 신규 검증 기록을 만들어도 되는지 질문했다. 계정 확인 전 신청·저장·플래너 생성을 보류하며 기존 개인 기록을 변경하지 않는다. 이는 제품 버그로 분류하지 않는다.

## 실행 이력과 한계

- 최초 원격 fetch는 샌드박스DNS제한으로 실패했으며 읽기 전용 권한 검토 후 성공했다.
- 최초검사명령은 shell의pnpm경로미설정으로 시작하지 못했다. corepack으로 실행했고 Vitest소유캐시 권한검토 후438 PASS를 확인했다.
- 잘못 옮긴 candidate SHA의 최초prepare는 executing-candidate-source로 거절됐으며 읽기전용·운영변경0이었다. 실제병합SHA로 다시prepare했다.
- 정책commit 직후 기존 웹도 V2키를 갖고 있어 새접수를 받을 수 있다. 새V2작업이생기면 과거V1로보상하지 않는다. 불확실 실행은reconcile로실제상태부터확인하며 맹목재시도하지 않는다.
- 새Chrome기록은 확인된테스트대상에서만 생성한다. 기존개인기록덮어쓰기·영구삭제는하지 않는다.

## 공식 웹 운영 결과

공식 `pnpm deploy:dev`가 종료값 0으로 완료됐다. 선택 회귀 1,451 PASS/133 SKIP, Next build·타입 검사·별도 포트 canary·웹 교체·운영 GET 확인이 통과했다. 운영 커밋은 `25a6314ce16eef382b671b9086579e0909649afa`, build는 `prelaunch-25a6314ce16e-6R93aX`이며, `loaded=true`, `recoveryPending=false`, DB ledger232다. worker는 기존 `3e58467499c6-v74` checkout과 동일 PID49750·gen49를 유지했고 이번 작업에서 교체하지 않았다. 배포 로그는 `~/.homecook/prelaunch-web/deploy-1792184390079.log`다.

사용자 Mac Chrome에서 새로고침 후 입력 화면을 1440×1000과 375×900으로 확인했다. 두 화면 모두 페이지 가로 넘침은 없고, 빈 URL에서 가져오기 버튼은 비활성이다. 실제 입력·미리보기·접수의 업무 성공은 이 화면 확인으로 증명되지 않는다.

### 별도 관찰: 데스크톱 초기 레이아웃 이동

- 분류: 기존 UI의 부작용 관찰/낮음, 베타 차단 아님. 이번 복구 회귀로 단정하지 않는다.
- 기대: 1440px 새로고침부터 데스크톱 배치가 안정적으로 보임.
- 실제: 새로고침 직후 모바일형 좁은 카드가 보였다가 로딩 후 정상 데스크톱 배치로 전환됐다. 정착 후 잘림·가로 넘침은 없다. 지속 시간은 측정하지 않았다.
- 재현: Chrome1440×1000 → `/recipes/new/youtube` 새로고침 → 초기·정착 화면 비교.
- 근거: `components/shared/use-desktop-viewport.ts`의 `useMediaQuery(...,false)`, `components/recipe/youtube-import-screen.tsx`의 desktop 분기. 두 파일은 운영53da→이번25a에서 변경이 없다. 초기 false 원인 해석은 코드와 화면에 근거한 추론이다.
- 권장: 후속 UI 묶음에서 초기 렌더 동안 폭 안정화를 검토. 검증 기준은 1440 새로고침 영상·연속 캡처에서 카드와 주요 메뉴의 불필요한 폭 이동이 없는 것이다.
- 화면: `02-after-youtube-1440.jpg`(초기), `03-after-youtube-1440-settled.jpg`(정착), `04-after-youtube-375.jpg`(모바일).

## 남은 차단·인계

**Chrome 신규 신청→worker→알림→결과→저장→북/플래너는 계정 대상 확인 대기**다. 현재 Chrome 로그인 닉네임은 `cw****`이며, 기존 QA라고 단정할 수 없어 이 계정에 새 검증 기록을 만들어도 되는지 질문했다. 거절이나 실행 결과 불확실이 아니며, 이 구간은 아직 시도하지 않았다. 신규 신청·유료 모델·저장·플래너 쓰기는 0이다. 대상 계정 허용 또는 테스트 계정 전환 후 대표 영상 `pjwILwDVC7U` 신청 1회부터 이어간다. 비밀번호·권한 변경, 반복 모델 호출, 기존 개인 기록 덮어쓰기는 필요 없다.

웹·정책 반영은 완료됐지만 로그인 HTTP의 최종 복구 완료·전체 v9 완료·모든 버그 없음을 주장하지 않는다. 이 검증 전에는 부모가 요청한 두 후속 작업의 배포 선행 조건이 완료됐다고 보고하지 않는다.

Library 보고서(화면3장 내장): `libfile_7adf500afbf48191bf5ad68c0968b282`.
