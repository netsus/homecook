# 레시피 저장 복구 운영 확인 — 2026-10-15

## 실제 반영 결과

현재 웹은 `0ae67d66c5ab330cf3f7ef7aff3a7ba40e99b1d7`, build `prelaunch-0ae67d66c5ab-DexI9I`, 운영 DB는232다. 앱 #1723/#1726과 기존 배포 도구 #1724/#1725/#1727을 반영했다. 원229·231 review/receipt와 worker227/229/231 이력은 보존했다. 232는 함수 본문 하나의 역할 판독 수정이며 웹 재배포·새 인증키·worker 재시작을 하지 않았다.

DB231 operation은 `af8ba876-e3ec-4f2c-855d-f5aa90a21c1b`, DB232 operation은 `6bb9d5a6-0b6e-42e4-af78-0b6d7d6fa4d9`다. 두 단계 모두 committed·기존 데이터/설정 보존·직전 전체 백업 decode를 확인했다. 232 전체 catalog는 `440554c06775d1c9408f9bd8f16704aa7694489c5e08c4168432a4d245d23424`로 검토한 기대값과 같다. worker48 current232 확인 기록까지 발행했으며 PID58417·기존6개 credential/plist 파일·policy/credential 행은 그대로다.

## 수정한 문제와 운영에서 추가 발견한 원인

- 복사 레시피의 같은 영양 입력을 다시 저장할 때 physical 재료 UUID가 사유 식별자와 충돌하던 경계를 개인 레시피 v5의 안정된 의미 식별자로 보정했다. 기존 v4 계산값과 과거 식단은 재계산하지 않는다.
- 성공한 PATCH를 같은 요청으로 재시도하면 현재 revision/context 검사에 먼저 막히던 경계를 보정했다. 현재 세션·소유권을 확인한 뒤 정확히 결속된 성공 영수증만 재사용한다.
- 실제 새 웹에서 복사는 성공했지만 PATCH는 재로그인 후에도409 `ACCOUNT_SESSION_STALE`로 실패했다. PostgREST 로그에서 service_role의 새 RPC가55000으로 거절됨을 확인했다. 새 outer가 legacy 역할 GUC만 읽었고 실제 요청은 JSON claims를 사용한 것이 원인이었다. 기존 native가 두 형식을 함께 넣어 이 차이를 놓쳤다. 신규232 SQL은 기존 `auth.role()`로 역할을 읽고 scope/POST/두 경로/delegate·owner/ACL을 보존한다.

## 검증 결과

- 웹 배포의 관련1,450검사 PASS·선택 범위 밖133 skipped, 빌드·타입 검사 PASS. 저장 복구 route/native, SQL232 actual pre-request dispatcher4검사, 도구/독립 위험 검사와 최종 결속 검사를 별도로 통과했다. 서로 겹치는 검사 수를 합산하지 않는다.
- 소유 격리 환경에서 실제 SQL/ledger commit, DDL dispatch 뒤 강제 예외의 전체 rollback, 백업 decode/231 복원, 실COMMIT ACK 유실 후 같은 작업의 읽기 전용 reconcile·SQL 재전송0을 확인했다. NONNULL HTTP fingerprint 영수증의19열·원수량·개인 fact3건을 보존했다. 이는 합성 권위이며 실제 운영 승인·인증을 대신하지 않는다.
- 운영 QA 개인 복사본 `cff66a1f-7091-4612-8c60-71902768ac09`에 제목 수정 저장이 성공했다. 최종 저장 반복 클릭 후 revision1→2, 결속된 succeeded 영수증1건이며 원1/3L·1/7kg는 동일하다. 복사 생성과 명시 수정의 v5 snapshot2개 중1개가 현재다.
- 1440 데스크톱·375 모바일에서 저장 제목과 새로고침 유지, 가로 넘침 없음, 모바일 임시 제목 변경→버리기→재조회 불변, 뒤로가기의 홈 복귀를 확인했다. 별도 비로그인 브라우저는 개인 레시피를 읽지 못했고 마이페이지의 로그인 필요 안내를 확인했다.
- 원래 비교 대상 레시피3개·재료 전체·영양 snapshot·계획3개는 저장 전과 동일했다. 공개 상세 열기의 view_count/updated_at은 레시피 내용 비교에서 제외했다. 정상 네이버 재로그인은 수정 제목·원수량을 원래 편집 화면으로 복원했다.

## 실패 이력과 확인하지 않은 범위

처음 준비한 한글 문서 경로 인코딩과 이전 웹 marker 결속 오류는 DDL 전에 거절돼 교정했다. 격리 runner의 server-owned DTO 필드, 필수 조리법 참조, fingerprint 접두어 검사 오류3건은 원 로그를 보존하고 기존 제약에 맞춰 교정했다. 운영에서 응답 유실을 강제로 주입한 HTTP 재시도는 실행하지 않았고 route/격리 검사로 확인했다.

편집 첫 진입의 기존 수량 재확인과 빠른 다른 행 요청의 취소 동작은 이번 수정에서 바꾸지 않았다. 실제 무게 정답·추출 정확도를 검증한 단계가 아니며 새 영상 추출·P5·외부 AI 호출은0이다. R2와 정확도 개선 자료 수집은 OFF다.

비공개 근거는 `~/.homecook/operations/mumeok-beta-recipe-snapshot-20261015-lry0fhvq/role-forward-repair/operating-verification.json` 및 같은 디렉터리의 실제 화면/영수증/복구 보고서에 보관한다. 원준 Discord 단계 완료 전송은 HTTP204를 확인했다.

## 사용자 우선순위 갱신

1번 저장 오류는 운영 검증까지 완료했다. 2번 재료 입력 단위 기억과4번 정확도 개선 참여의 추가 구현은 보류하고 기존 기능은 유지한다. 이후3번 완성 무게 추정 고도화→5번 네이버 일반 사용자 가입→6번 최종 통합·추출 품질 검증 순서다. 영상 정답 검토와 별도 추출·평가 승인 등 선행조건은 유지한다.
