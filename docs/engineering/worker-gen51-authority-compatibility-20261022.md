# gen51 배포·백업 검증 호환성

범위는 이미 완료된 동일 권한 50→51 갱신의 검증 승계다. 운영 자격 발급·등록, 정책 변경, 자동 rotation, 배포, 백업 실행, 재시작은 포함하지 않는다.

원 gen50 승인 4개와 activation seal, 기존 DB240 승인·영수증을 수정하지 않는다. gen50 원 증거는 seal의 실제 activation 시각(2026-10-19T07:45:54.134Z)으로 검증한다. 이는 과거 증거에만 적용되며, gen51 현재 만료 검사와 현재 DB 조회에는 실제 현재 시각을 사용한다. gen51 만료 30분 전부터 검증을 거부한다.

새 authority reader는 고정 계획/영수증 SHA 및 두 독립 Keychain 지문을 모두 확인한다. 토큰/metadata 원래 파일 지문, 제한된 claim 집합·역할·scope·issuer·audience·최대 7일 TTL, 원래 artifact/config/descriptor/policy, plist의 단일 metadata 경로 변경만 인정한다. signing key는 읽지 않는다. 누락·불일치·gen52·현재 만료 시 gen50으로 fallback하지 않는다.

DB240 기대 baseline의 credentialGeneration/credentialRowSha256 두 필드만 승계한다. 원 baseline과 갱신 전 credential 전체 지문이 같아야 하며, 갱신 중에는 credential의 generation/JTI/expiry/updated_at 외의 변경을 허용하지 않는다. 현재 DB credential 전체·정책 전체·240개 ledger를 고정 갱신 영수증과 대조한다. 원 DB240 catalog/함수/OID/ACL/제어/드레인 검사는 유지한다. 제한된 ASCII credential 행의 PostgreSQL jsonb 정렬·공백 직렬화를 사용하며 실제 PostgreSQL 계산으로 구·신 지문을 각각 대조한다.

기존 DB240 operator의 실행 파일 지문은 역사적 Git blob으로 그대로 검증한다. 새 operator는 별도의 정확한 커밋과 유한 실행 파일 지문을 결속한다. 구현 커밋의 변경 파일 집합을 고정 전임자와 대조하고, pin만 변경하는 직접 자식 커밋 및 전체 tracked/untracked clean을 요구해 미포함 imported helper 변경도 거부한다. 호출자 인수나 환경으로 승인 경로나 해시를 바꿀 수 없다. 새 코드가 예전 DB 변경을 재승인하지 않는다.

공식 읽기 전용 확인 명령:

```sh
node scripts/plan-worker-gen51-compatibility.mjs deployment
node scripts/plan-worker-gen51-compatibility.mjs backup
```

두 명령은 현재 DB240/app 6f3/gen51에 한정한다. 실제 웹 plist 지문·checkout HEAD·BUILD_ID·추적 파일 clean과 loaded 명령·명시 환경·실제 프로세스 소유자/cwd/동일 PID를 전후 대조한다. 실제 DB 관찰, 원 승인 체인, 실제 loaded worker 인수/소유자/cwd/동일 PID, 인증 성공 및 잘못된 empty claim 거부, sealed health, DB enqueue readiness, 닫힌 R2 collector를 확인한다. deployment는 기존 deploy-prelaunch-web의 `plan`도 호출한다. backup은 실제 백업에 쓰는 coordinator의 `plan`을 호출한다. read-only plan은 enqueue fence를 획득하거나 서비스를 중단하지 않는다.

이 명령의 통과는 실제 배포·중단을 동반한 암호화 백업/복원 또는 새로운 앱/DB/generation을 검증했다는 의미가 아니다. 해당 작업은 대상과 변경 범위에 맞는 후속 승인과 검증이 필요하다. 과거 gen50 복구·재발급 명령을 재사용하지 않는다.

검증 결과는 작업 보고 시각과 함께 별도로 기록한다. 공개 PR에는 비공개 원문 증거·토큰·키·개인 데이터가 포함되지 않아야 한다.

공개 브랜치는 공개 master 기준으로 정제한 두 커밋(A 구현/B pin)만 게시한다. 비공개 갱신 영수증의 역사적 sourceRef는 그대로 보존하지만, 그 실행 세션의 커밋·대화·운영 row fixture를 업로드할 필요는 없다. fixture는 합성 행만 사용한다.

기본 master에서 실행할 때는 정확한 공개 기준 커밋을 첫 부모, 검증된 B를 둘째 부모로 갖고 전체 Git tree가 B와 동일한 merge commit만 인정한다. B의 직접 부모·pin-only diff·전체 source tree와 clean 검사를 그대로 유지한다. 추가 파일이나 helper가 바뀐 merge, squash/rebase, 다른 기준 branch는 거부한다. 이후 master가 바뀌면 검증된 B checkout에서 기존 공식 명령을 사용한다. 실제 앱 배포나 서비스 재시작은 이 코드 머지에 포함되지 않는다.
