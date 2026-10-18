# v85: 인증 행 지문 변화 뒤 한 번의 별도 상태 승계

## 왜 두 번째 승계가 필요한가

첫43개 continuation 승인 뒤 `auth.users` 전체 행 지문이 달라져 preflight가 `complete protected projection`에서 중단됐다. 이전 원42개 plan/anchor와43개 continuation/anchor를 덮어쓰지 않는다. 새 승인은 과거 변경을 정상 refresh 또는 timestamp-only로 분류하는 승인이 아니다. 행별 과거 원본이 없으므로 변경 컬럼 전체와 호출 주체는 계속 미확정이다.

사용자가 운영 탭 종료를 확인한 뒤 2026-10-18 05:36:27~05:40:47 UTC의 읽기 전용 관측에서 전체 보호 상태와10개 테이블 구성 지문이 동일했다(259.641초). auth 최근 updated_at은 전날21:03:38.653004이며 그 이후 새 refresh 감사 이벤트는 없었다. 짧은 관측은 앞으로의 무변경을 보장하지 않는다. 웹06a·활성worker v74/gen49·DB232·작업43개·새8키 fence·R2/lead OFF를 다시 확인했다.

## 이번에 허용하는 정확한 차이

- 웹 후보는 `15b1a36f9b4c4c293cd8f92c6f2824b13ba7eaf9`로 고정한다. 요리 개선 master나 미적용 migration2개를 포함하지 않는다.
- 원43개 capsule SHA `cf5a80513d4e532c2319344af8d72c23375d2fc24fdabc2864dee318dfe11ad5`의 raw 승인과 nested 원42개 권위를 모두 검증한다.
- 새 capsule은 prior 대비 `before.full.preservedRowsSha256`과 그에 따른 원본 대비 dataDeltas만 변경한다. 작업43개 전체 행/원42개, 일반 데이터, 나머지 보호 상태, worker·credential·policy·서비스·출처·새키/OFF는 모두 동일해야 한다.
- 이전 auth 테이블 지문과 현재 다른9개 구성요소로 prior 집계를 재구성한다. 당시10개를 함께 관측한 snapshot이라고 표현하지 않는다. 재구성은 승인된 prior 전체 지문과 정확히 일치해야 한다. 현재 full·10개 테이블·43개 작업은 동일 READ ONLY repeatable-read snapshot에서 읽는다. auth.users7명 유지와 auth 지문만 변화한 증거를 검증한다.
- 새 파일은 기존 operation의 `auth-successor-plan-20261018.json`, 별도 Keychain account는 `approved-auth-successor-20261018-sha256`이다. 둘 다 create-only이며 원본2개 승인과 anchor를 보존한다. 임의 승계 연쇄는 거부한다.
- 도구 checkout은 제품 후보15와 분리한다. 정확한 tool HEAD·깨끗한 tracked/untracked 상태·15부터의 전체 누적 소스 지문·유한한 이번 ops/test/doc 경로만 허용한다. 제품·의존성·DB diff는 거부한다.

## 권한과 실행 경계

worker50은 기존 role/scope/issuer/audience, 고정 만료2026-10-22T14:27:30Z와 봉인 v85 artifact를 그대로 사용한다. manager는 기존 ES256 키로 최대300초이며 권한 확대가 없다. 실제 등록 후49는 무효가 된다. 전환 중 일시503과 실패 뒤 수동 reconcile/resume 필요 가능성은 기존 도구와 같다.

`prepare-auth-successor <고정15> <새 /tmp 디렉터리>`는 실제 상태를 읽어 검토 파일만 만든다. 자격 발급·anchor 등록·서비스 전환은 없다. `approve-plan <검토파일> <정확한SHA>`는 사용자 Mac Terminal의3개 TTY와 V85-GEN50 직접 확인을 요구하고, 현재 전체 상태·원49·새키/OFF를 다시 검사한 뒤 세 번째 anchor/파일만 만든다.

승인 후 순서는 새 도구의 preflight → `deploy:dev` 공식 웹 배포(정확한 tool ref와 V85-BRIDGE 사용자 확인) → 새 도구 apply(V85-GEN50 사용자 확인)다. 역사적 R2 회전 증명은 prior43개 권위에 연결하되 실행 승인은 새 capsule/anchor와 정확한 tool ref에 연결한다. 각 경계의 전체 비교와 필수 빌드/검사는 유지한다. 미래 auth 변화·다른 작업 추가·키/제어 변화가 생기면 중단하며 자동 기준 갱신·시각 제외·포괄 refresh 허용은 하지 않는다.

확인받은 bytes의 SHA는 approve의 실제 재읽기 및 apply/resume의 최종 선택 권위와 일치해야 한다. 웹 사용자 확인 뒤와 프로세스 교체 직전에도 새 capsule 기준 전체 READ ONLY 관측·43개 작업·원49·새키/OFF를 검사한다. 확인 대기 중 파일 교체·삭제는 승인/발급 전에 거부한다.

실제 승인·배포·발급은 에이전트 PTY로 대신 실행하지 않는다. 새 검토 파일의 정확한 SHA와 도구 HEAD는 준비 완료 보고에서 전달하고, 기존 파일을 수정하지 않은 상태에서 사용자가 한 번에 검토할 수 있게 한다. 실제 웹·worker·추출 검증은 전환이 수행된 뒤 별도로 기록한다.

## 검증

관련 Vitest268개·회전 bridge Node31개·typecheck·변경 파일 lint·diff 검사를 통과했다. 세 anchor의 실제 loader에서 각각 누락/불일치와 nested prior 변조를 거부하며, 확인 대기 중 파일 교체·삭제와 웹 경계 auth drift/발급 흔적/OFF 변화의 거부를 fixture로 확인했다. 독립 보안 리뷰의 확인 SHA 결속 지적을 반영했고 추가 필수 blocker는 없었다. 제품·의존성·DB migration 변경은0이며 고정15의 기존 빌드 산출물을 바꾸지 않았다.
