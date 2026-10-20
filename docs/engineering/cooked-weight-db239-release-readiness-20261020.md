# 요리·레시피북 DB239 릴리스 준비 — 2026-10-20

**앱 수정과 격리 DB238 통합은 완료했고, 운영 전환은 도구 가드에서 차단됐다.** 사용자는08:25 UTC 통합·백업 확인 후 GitHub 반영/머지→함수2개 DB 변경→웹 배포→운영 확인을 승인했다. 원본 저장소 dirty와 provider/R2/YouTube 보류 작업은 보존했다. 신규 운영 백업·서비스 중지·GitHub 쓰기·DB 변경·웹 배포는 실행하지 않았다.

## 검증된 결과

| 검사 | 실제 결과와 범위 |
| --- | --- |
| 앱 집중 회귀 | 14파일233 PASS, 실패0/skip0. 기존389실행의 YouTube쪽파 조회1실패는 기준컴포넌트에서도 재현돼 별도 보존 |
| 최소 SQL fixture | 25 PASS, 실패0/skip0. proxy 위조·수량증거·gate·이전 receipt/reader·DDL/함수복원 호환. authority/base completion은 stub |
| Native DB238 | 10 PASS, 실패0/skip0. 고정 native schema232+원233–238, 실제 권위/완료/preview/meal/adjust 함수, 합성 데이터만 |
| Native 데이터 격리 | 복원 직후153표0행,36roles/23memberships·설정 일치,443함수. Network none/port0/mount0·운영연결0. 두 소유 테스트 컨테이너 제거 확인 |
| DB 변화 경계 | 강제 실패 시443함수+기존 batch/meal/evidence/receipt 롤백. 정상 적용 시 정확2본문 변경, OID/owner/ACL/config 유지 |
| 실제 DB 식사 차감 | 자동3119.7→125g/잔량2994.7; manual2800→180g/2620; reported2700→200g/2500. 원예측3119.7 이력 보존 |
| 실제 Chrome UI | 1440×900/375×812. 약3.1kg/3100g, 인라인 분수 저장/재조회, 헤더/모바일 조작, 완료 복귀, 책 전용URL/목차·키보드. API/영양은 합성 fixture |
| 정적/빌드 | production source build/typecheck/lint 종료0, anti-slop 신규0. 추가 통합테스트 lint/typecheck 종료0. 비활성 native 수집은 외부파일 없이 성공/10 skip |
| 독립 리뷰 | 수량/단위·기름문맥·decimal·context파일 수집 문제 수정 후 남은 중대한 결함 없음. 리뷰어 직접 실행은 아님 |
| 전체 migration 재생 | **실패**.213개 뒤 기존214번째 catalog hash fence. 역사 SQL·fence·YouTube 미수정. native 대안 성공과 구분 |

운영 HTTP 로그인→브라우저→실제 DB의 한 연결, 실제 카레 frozen source ID/proof, 카레 영양 정확도와 완성무게 실측은 미확인이다. 추정 모델은 조리손실 미보정이고 독립 실측 정답 표본0건이다. 섭취량은 자동 확정하지 않는다.

## 실행한 정확한 plan과 차단

작업 사본: `/Users/cwj/Documents/Codex/2026-10-20/task/homecook-ui`, branch `codex/cooking-recipebook-ui-20261020`. production 변경 검증 ref는 `094282d1790847fd8bc8d3fdeb7408c14eb1beb4`이며 이후 테스트/문서 커밋을 별도 보존한다.

```sh
corepack pnpm deploy:dev:plan -- \
  --reviewed-ref 094282d1790847fd8bc8d3fdeb7408c14eb1beb4 \
  --db-config /Users/cwj/.homecook/config/full-local-production.env \
  --db-compatible --test-script test:feedback-batch:web
```

대상: 운영 `16cf3155c7b59bd5f74a64e0a42fc0d9b14f6e1c`, build `prelaunch-16cf3155c7b5-qy0qD5`, DB238→239. 결과 exit1: `닫힌 R2 유지 배포: 닫힘 승계는 기존 reviewed-ref와 읽기 전용 DB 검증만 허용합니다.`

이는 **배포 도구의 source guard 거부**이며 자동 승인 심사 거절이 아니다. 변경이 실행된 뒤 결과가 불명확한 상태도 아니다. 해당 plan은 거부됐고 DB/웹 변경0이다. 같은 옵션 재시도·우회·기존 PIN 수정은 하지 않았다.

현재 DB238 profile은235→238 SQL3개와 출발SHA/PIN만 허용한다. 앱 successor는 SQL0만 허용한다. 현재 가드 그대로239 쓰기가 가능한 경로는 없다. [닫힘 검사](../../scripts/lib/prelaunch-web-deploy.mjs), [기존238 profile](../../scripts/lib/saved-recipe-nutrition-maintenance.mjs), [앱 successor의 경계](anti-slop-db238-app-successor-review-20261019.md)를 독립 리뷰와 함께 대조했다.

## 필요한 별도 후속 프로필 — 미구현/미승인 운영 artifact

1. 새 create-only239 검토서/고정SHA로 실제 운영 SHA/build/plist, 후보 SHA, 전체 변경파일 before/after SHA를 결속한다. 과거 PIN·receipt·A/B·worker 세대/키/만료·R2상태를 변경하지 않는다.
2. 원 DB238 committed receipt를 predecessor로 보존한다. 기존238 원장 prefix 그대로와 `20261020210000_cooked_weight_mass_proxy.sql` 한 개의 raw/payload SHA만 허용한다. 이 파일은 테이블·컬럼·키·권한·소유자 변경 없이 다음2함수 본문만 교체한다.
   - `private.record_cooked_weight_evidence(uuid,uuid,bigint,bigint,text,timestamp with time zone)`
   - `public.complete_snapshot_v2_cooking_session_with_weight_evidence(uuid,timestamp with time zone,text,integer,timestamp with time zone,uuid,uuid,uuid[],text,numeric,text,jsonb,boolean,timestamp with time zone)`
3. 함수 전후 본문과 OID/owner/ACL/grantor/config 및 나머지 catalog·데이터·controls·원장 보존을 실제 target에 결속한다.239 unknown/foreign guard를238로 fallback하지 않는다.
4. 기존 보호 엔진의 platform backup/fence86120317/drain/동일 gen50 plist 중지·복구, exported snapshot DB dump, 단일DDL/원장 transaction·commit guard·읽기전용 reconcile을 재사용한다. 새 키·토큰이나 일반 bypass 경로를 만들지 않는다.
5. operator ref와 웹 ref를 분리하고 이 연결 코드도 실패경로·독립 리뷰를 거친다. 이후 정상 CLI로 백업 확인→GitHub 반영/머지→DB239→웹→운영 read-only 화면/권위/준비상태 확인을 수행한다. 기존 개인 데이터로 저장 테스트하지 않는다.

이 문서는 실행 권위를 발급하는 artifact가 아니며 보호 도구에는 연결하지 않았다. 위 후속 프로필을 별도 범위로 구체화해야 배포를 계속할 수 있다.

## 기존 백업 재검증

기존 승인 operation `cooking-experience-backup-20261019-5OioFg`의 archive를 기존 `verify-backup`와 기존 Keychain 키로 다시 인증·복호화 검증했다: PASS, created_at `2026-10-19T09:41:07.031Z`, formatv5, Storage payload 포함, unclassified0. 새로운 키·백업·서비스 중지는0이다.

당시 off-Mac/clean restore/key recovery/readiness PASS 기록을 읽었지만 이번에 그 작업들을 재실행하거나 시간을 갱신하지 않았다. 이 archive는 DB232 시점이며24시간 신선도는 실제 실행 시점에 다시 판단해야 한다. **현재 DB239용 신규 백업·현재 target readiness 통과로 확대하지 않는다.** 실제 DDL 직전 온라인 snapshot도 별도로 필요하다.

## 증거 위치

로컬 `.artifacts/feedback-ui/`의 `native-db238-setup.json`, `native-db238-tests.json`, `mass-proxy-compat-sql.json`, `native-disabled-collection.json`, `integration-container-cleanup.json`, `full-schema-replay-report.json`, `deploy-plan-mass-proxy.log`, `deploy-status-current.log`, `existing-platform-backup-verification.json`을 보존했다. 원본 운영 데이터·키는 deliverable에 포함하지 않는다. 전체 패치와 선택한 캡처/JSON/로그는 작업 폴더 상위의 `cooking-recipebook-ui.patch`, `cooking-recipebook-ui-evidence.tar.gz`와 checksum manifest로 전달한다.
