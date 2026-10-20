# 요리·레시피북 DB239 릴리스 준비 — 2026-10-20

앱 수정과 격리 DB 통합, DB239 보호 배포 연결의 독립 리뷰를 완료했다. 사용자는 통합·백업 확인 후 GitHub 반영/머지 → 두 함수 변경 → 웹 배포 → 운영 확인을 승인했고, 후속 지시에서 같은 릴리스의 좁은 도구 호환성 보완을 확인했다. 운영 적용 결과는 아래 진행 기록과 실제 receipt를 따른다.

## 검증

- 앱 집중 회귀14파일233 PASS. 이전389개 실행의 기존 YouTube쪽파 조회1실패는 기준 컴포넌트에서도 재현돼 보존했다.
- 최소 SQL fixture25 PASS. authority/base completion은 명시적 stub이다.
- 새 native DB238 실제 앱 함수10 PASS, skip0. 합성 계정·레시피·세션·식사만 사용했고 운영 연결은0이다.
- 새 native 보호 엔진3 PASS, skip0. 실제 exported snapshot DB/roles 백업, 정상 커밋, SQL 오류 전체 롤백, COMMIT 응답 손실 후 읽기 전용 reconcile을 확인했다. 각 SQL 전송은1회이며 기존 데이터·controls·원238 원장·두 함수 OID가 보존됐다.
- DB239 maintenance/engine/실제 CLI body 및 기존238 successor 회귀123 PASS, skip0. 독립 리뷰어는 그중105개를 직접 재실행해 통과했다. 새 source root·정적 JSON PIN·239 우선 탐색·유한 predecessor·unknown fallback 거부를 확인했다.
- 기존 DB/웹/백업/일시중단 회귀 첫 실행226 PASS/2 timeout. 두 localhost HTTP 검사는 샌드박스 밖 원 테스트 재실행에서 웹 파일110/110 PASS였다. 원 실패를 지우지 않았다.
- 현재 typecheck/lint exit0, lint 기존 경고17개. Anti Slop 신규0(current84/baseline207). 제품 build와 Chrome1440×900/375×812은 앞선 앱 후보에서 성공했다. 도구 연결 변경 뒤 제품 소스는 동일하다.
- 전체 과거 migration 재생은213개 뒤 기존214번째 catalog fence에서 실패했다. 역사 SQL·fence·YouTube는 수정하지 않았으며 native 대안 통과와 구분한다.

Chrome의 저장·영양 API는 합성 fixture였다. 운영 HTTP 로그인→브라우저→실제 DB의 한 연결, 실제 사용자 카레 source/proof·영양 정확도와 완성무게 실측은 아직 확인하지 않았다. 추정 모델은 조리손실 미보정이며 독립 실측 표본0건이다. 식사 섭취량은 빈 값으로 유지하고 사용자의 명시 입력이 필요하다.

## 고정 릴리스 경계

출발 웹은 `16cf3155c7b59bd5f74a64e0a42fc0d9b14f6e1c`, build `prelaunch-16cf3155c7b5-qy0qD5`, DB238이다. 앱 대상은 `9645b954aec3f9e63b747e3ce8b0047d7fd68dda`이며 정확55파일 before/after SHA와238 원장 prefix를 고정한다. 별도 operator ref/hash는 실제 실행할 세 배포 모듈과 새 helper/manifest5개를 결속하며 PIN 선언만 정적 JSON으로 정규화한다.

`20261020210000_cooked_weight_mass_proxy.sql` 한 파일만239번째로 적용한다. raw SHA는 `ea827e50ba5fefb4cbf992fb7ad7b32d8e123679576e3eb7e1a119ba3c203e9d`, payload SHA는 `5f27a63f035f777036a912d2807fdee75de478ebebec9861d471be1c2bd8d7b8`다. 다음 두 함수 본문 외 테이블·컬럼·키·소유자·권한을 바꾸지 않는다.

- `private.record_cooked_weight_evidence(uuid,uuid,bigint,bigint,text,timestamp with time zone)`
- `public.complete_snapshot_v2_cooking_session_with_weight_evidence(uuid,timestamp with time zone,text,integer,timestamp with time zone,uuid,uuid,uuid[],text,numeric,text,jsonb,boolean,timestamp with time zone)`

기존238 PIN과 receipt를 predecessor로 보존한다. 새239 unknown/foreign/불일치는238로 fallback하지 않는다. 새 reader/writer 활성화 경로는 허용하지 않고 DB-first 이후 정상 `--already-applied-db` 웹 handoff만 지원한다. R2 닫힘, gen50/기존 plist/키/만료/정책과 과거 A/B 증거는 유지한다.

초기 `--db-compatible` plan은 기존 source guard가 거부했고 mutation0이었다. 자동 승인 심사 거절은 아니며 같은 옵션으로 우회하지 않았다. 새 경로는 기존 fence/drain/일시중단·exported snapshot·단일 transaction·원 intent 기반 reconcile을 재사용한다.

## 진행 기록

- PR [#1841](https://github.com/netsus/homecook/pull/1841) 초안 생성·연결 완료. 도구 연결 커밋/최종 머지와 운영 적용은 이 기록 시점 대기 중이다.
- 기존 DB232 플랫폼 백업을 재인증했지만 새 DB239 readiness로 사용하지 않는다.
- 새 create-only operation `cooked-weight-backup-20261020-okQDuk`을 준비했다. 운영 설정은 수정하지 않고 readiness 경로만 다른0600 복사본을 만들었다. 기존 승인된 서로 다른3매체 경로를 확인했다.
- 첫 새 백업은 DB234에서 추가된 `private.cooking_execution_quantities`의 기존 분류 누락으로 실패했다. DB239 적용0, archive 성공0이다. 동일 서비스 복구 PID54910→16382, 실제 인증/readiness·queue0/processing0/permit없음과 보호 지문 동일을 확인했다. 실패 artifact를 보존한다.
- 기존 백업 분류에 정확히 위 표1개만 포함하도록 보완했다. 원 코드에서 같은 실패를 재현한 뒤 수량/revision/소유자/추정값·행 누락 변조 거부와 유사 미분류 표 거부를 포함한 관련4파일122 PASS를 확인했다. 운영155개 표 이름만 읽은 분류 사전검사도 PASS, 개인 행 읽기0/변경0이다. 이는 기존 개인 실행분 보존에 필요한 호환성 보완이며 private 전체 허용·세션 제외·권한·DB 변경은 없다. 새 백업 재시도는 별도 create-only operation으로 수행한다.

원본 저장소 미커밋 작업과 provider/R2/YouTube 보류 작업은 보존한다. `.artifacts/feedback-ui`는 비공개 검증 로그·합성 fixture 결과를 보관하며 키/원본 개인 데이터는 전달물에 넣지 않는다.

### 새 플랫폼 백업 결과

두 번째 operation `cooked-weight-backup-20261020-GEwaV4`에서 백업과 동일 설정 복구가 성공했다(09:38:41.596–09:39:58.670 UTC 전체 operation; 정확한 API 중단 길이로 해석하지 않음). worker16382→22909, 실제 인증/readiness·queue0/processing0/permit없음·보호 지문 동일을 확인했다. archive SHA와 별도 매체 사본 SHA는 모두 `98cca02aae206d7c92bdb0866256d1075941e7874abd86080d8754f44f6051d5`다.

기존 `verify-backup`, 인증된 off-Mac 사본, 새 격리 DB·Storage 전체 clean restore와 기존 escrow 키 복구가 PASS했다. source backup 생성은 `2026-10-20T09:39:46.517Z`, 미분류0이다. 격리 복원 증거는 `production_readiness_issued:false`이며 별도 기존 `record-readiness` 결과로만 운영 readiness를 판정한다. 운영 복원/키 교체는0이다.

PIN-null 거부 검사는 실제 운영 PIN 상태와 무관한 코드 복사 fixture로 격리했고 도구 회귀123개를 다시 통과했다. 독립 리뷰도 해당2개를 직접 재실행해 통과했다. 소유 native 테스트 컨테이너 제거를 확인했다.
