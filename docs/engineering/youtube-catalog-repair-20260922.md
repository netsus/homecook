# YouTube 추출 접수 복구 — 2026-09-22

## 원인

9월 19일 재료 검색 migration이 `resolve_youtube_extraction_job_draft`를
정규화된 재료 검색으로 변경했지만, 이 함수 본문을 포함하는 catalog fingerprint를
갱신하지 않았다. 운영 DB의 실제 값은 `750a0236…`, DB 검사와 worker manifest는
이전 `06e3d277…`이었다. 따라서 접수 readiness는 false, worker의 claim은
`assert_youtube_extraction_catalog_ready`에서 거절된다. 영상 미리보기는 정상이다.

운영 schema를 별도 PostgreSQL 17.6 컨테이너에 복제하여 resolver 하나만 이전
본문으로 되돌리면 정확히 `06e3d277…`가 됨을 확인했다. 다른 DB 변경을 추측하여
일괄 승인한 것이 아니다. 운영의 기존 작업/레시피 데이터는 보존한다.

## 수정과 배포 계약

- 새 `20260922000000` migration은 검토한 실제 `750a0236…`만 허용한 뒤,
  readiness와 assertion의 이전 기준값을 한 transaction에서 교체한다.
- 실제 영상 검토에서 `1/2큰술`이 `1큰술`로 바뀌는 기존 SQL 수량 변환 오류도
  발견했다. `20260922010000`은 분수·대분수를 소수값으로 보존하고, 0 분모나
  잘못된 분수는 미확정·검토 대상으로 남긴다. 이 함수 변경도 검토 후 catalog를
  `2b4f7b7e…`로 함께 갱신한다. 원문 근거와 기존 일반 숫자 처리 경로는 보존한다.
- 수량 입력칸은 기존 decimal 입력에 맞춰 `step="any"`를 명시하여 브라우저의
  기본 정수 간격 검증이 소수값을 잘못된 입력으로 표시하지 않게 한다.
- 함수 owner/권한, worker generation/lease, 사용자 소유권 검사는 유지한다.
  다른 schema drift는 새 migration과 실행 중 assertion 모두 거부한다.
- expected-schema manifest도 같은 기준으로 갱신한다. 새 immutable worker
  artifact와 app descriptor를 만들고 새 generation credential을 함께 전환한다.
  기존 artifact의 파일/해시를 덮어쓰지 않는다.
- worker 전환은 검증된 exact full-local 대상과 백업·빈 큐/permit을 확인하는
  별도 운영 작업이다. 웹은 기존 앱 코드에 새 descriptor/manifest 경로만 반영해
  `pnpm deploy:dev -- --reviewed-ref <현재 웹 SHA> --env-file <비공개 patch>`로 배포한다.
  빠른 배포 도구의 worker 변경 제한을 완화하지 않는다.
- Sol low/low, policy version 2, pipeline identity와 공개 API는 유지한다.

## 앞으로 같은 문제가 생길 수 있는가

추출 RPC 본문, 관련 table/column/index/constraint, RLS/권한 또는 검사에 포함된
공유 의존성을 바꾸고 기준값/배포 정보를 함께 갱신하지 않으면 다시 발생할 수 있다.
레시피/재료 데이터 값의 일반적인 변경이나 검사 범위 밖의 화면 변경은 같은
catalog mismatch를 일으키지 않는다. 인증키 만료·영상 제공자 장애는 별도 원인이다.

기존 `test:youtube-async:postgres`는 8월 27일까지의 축소 fixture를 검증한다.
그 회귀 검사는 역사적 fixture의 기대값으로 유지하고, 현재 DB 전체 검사는 아래
별도 명령으로 수행한다. CI를 추가하지 않으며 **자동 배포 차단 장치는 아니다.**

```sh
pnpm verify:youtube-extraction:catalog
```

이 명령은 고유한 임시 Supabase를 만들고 현재 migration 전체를 적용한다.
역사 migration은 CLI와 같은 `postgres` 역할을 쓰고, 별도 RPC 소유자 교체가
필요한 9월 19일 검색 변경과 9월 22일 복구·분수 처리만 `supabase_admin`으로 적용한다.
원본 migration/운영 DB는 변경하지 않는다.
현재 manifest와 실제 catalog 일치, assertion 성공, 의도적인 RPC 변조 거부와
rollback 복구를 검사한 뒤 임시 자원만 정리한다. 일반 CLI replay는 9월 19일
RPC 변경에 필요한 소유 역할이 없어 실패하므로 동일한 관리자 실행 경로를 쓴다.

관련 함수나 DB 구조 변경 시 이 명령을 로컬에서 실행하고, 해시가 달라지면
변경 범위를 검토한 새 migration·manifest·artifact를 함께 준비한다.
해시를 실제 DB 값으로 무조건 자동 갱신하는 것은 금지한다.

## 검증 / 운영 결과

- 최신 migration 178개 전체 격리 재현과 catalog 정상/변조 거부·분수 처리 3개 통과.
  분수 검사는 설치된 실제 resolver의 수량 처리 블록을 읽어 8가지 입력으로 실행한다.
  역사 정책·PostgREST 권한 회귀 78개, 관련 migration/readiness/worker/artifact
  단위 테스트 103개 통과. 변경 파일 ESLint와 `pnpm typecheck` 통과.
- 운영 전체 DB archive 백업 후 새 SQL와 checksum 이력을 같은 transaction으로
  적용했다. readiness/assert/resolver의 owner·ACL·security definer·설정이 동일함을
  적용 전후 비교했다. 운영 DB reset이나 기존 레시피/작업 삭제는 없다.
- 최초 접수 복구 worker는 `4245146028a56b935bd3f0d7330a54bb3d60b483`, generation 43이다.
  분수 수정 worker는 `b5f4d13c0d2586c6ba666bbe4939beb33de21c07`, generation 44로 전환했다.
  현재 credential 만료는 **2026-09-29 02:44 KST**다. 기존 6시간 간격 만료 상태
  점검은 유지하며 자동 갱신은 추가하지 않았다. 만료 전 운영 갱신이 필요하다.
  기존 Python/영상 도구 PATH를 보존했고, 새
  프로세스의 재시작 반복이 없는 상태와 제한된 worker JWT의 claim 성공을 확인했다.
  DB readiness=true, app descriptor/manifest/DB catalog `2b4f7b7e…` 일치를 확인했다.
- 웹 소스 `5d9c5b09624dff83b43d91983704cec3171087da`는 유지하고 새 경로를 반영해
  최초 build `prelaunch-5d9c5b09624d-GuVRzC`, 최종 분수 수정 build
  `prelaunch-5d9c5b09624d-A3Lhra`로 배포했다. 공식 도구의 별도 포트와 운영
  웹 GET 검증을 통과했다. 빌드 내부 ESLint는 기존 `eslint-plugin-react-hooks`
  누락으로 완료되지 않았으므로 통과로 기록하지 않는다. production 빌드 자체는
  exit 0이며 이 작업의 변경 파일 lint는 별도로 통과했다.
- 실제 사이트의 `qIR8fZC9cBs`가 최초 접수 복구 후 한 번의 시도로 약 4분 만에
  succeeded가 됐고, 재료 15개·조리 단계 9개가 검토 화면에 표시됐다.
  검증용 초안은 레시피로 등록하지 않았다.
- 분수 수정 후 같은 영상을 다시 접수해 재시도 없이 317초 만에 succeeded가 됐다.
  검토 화면의 재료 15개·조리 단계 11개와 된장/설탕 `0.5큰술`, 후추 `0.25큰술`을
  실제 입력값 및 DB draft로 확인했다. 기존 결과를 덮어쓰지 않고 새 작업으로 검증했다.
- 입력칸 변경은 기존 웹 commit의 후속 `6fa49be6ac55d77a6537d097cf872dba785e0533`
  (애플리케이션 diff는 `step="any"` 한 줄)로 별도 배포했다. 최종 웹 build는
  `prelaunch-6fa49be6ac55-1K7x1R`이다. worker와 DB 기준은 위 generation 44를 유지한다.
  데스크톱과 390px 모바일에서 `0.5`/`0.25`가 유효한 숫자 입력임을 확인했고,
  증감 키가 `0.5 → 1.5`로 동작한 뒤 원래 값으로 복원했다. 모바일 가로 넘침은 없다.
