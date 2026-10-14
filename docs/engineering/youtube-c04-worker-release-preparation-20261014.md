# C04 worker source 봉인 준비 — 2026-10-14

상태: source 준비·로컬 파일 검증 완료, 실제 worker/DB/credential/운영 교체 미실행. 최종 release SHA는 root 커밋 후 다시 봉인해야 한다. 현재 fixture의 가짜 release/tree는 설치 권위가 아니다.

## 정확한 변경

`scripts/manifests/youtube-extraction-expected-schema.json`의 `catalog_fingerprint` 한 필드만 기존 `81362d758b5138a95b6cbe1d8d7c1f064653b467907a42a7335c00d97dc59ba9`에서 검토된 `de001df9981d361130136e2dff184665ec5280e82a857aa4e0e6cd593848af05`로 바꾼다. 새 manifest raw SHA256은 `2ea26b772e3f69e7bbf524d6303c5c40072b6c721028204a821dba0699822e20`이다. schema identity/version·fingerprint 계산 범위·역할/RPC inventory·초기 policy 등 다른 필드는 모두 보존한다.

근거는 `20261014223000_youtube_quantity_input_bridge.sql`의 exact81362 preimage→de001 postimage guard와 `docs/security/youtube-worker-quantity-function-postimages.json`의 기존10+신규3 함수다. SQL SHA는 `f586b27f2f5da5063a7eaa70278c7f00edab762aa27248b91a224411f436c750`, 13함수 registry SHA는 `96380285501d6ee9cd81be8334ecebe4848446ac87c4420a3616e2553610fe1f`다. 실제 운영 관측을 기대값으로 채택하지 않았다. 별도 담당자의 통합63함수 registry는 수정하지 않는다.

`tests/youtube-worker-quantity-release-preparation.test.ts`는 이 연결과 최신 C01 SQL60b9 이후 C04의 첫5개/최종6개 source SHA, 기존 expected-schema의 모든 다른 필드, 봉인된 runtime/schema/descriptor의 파일 지문을 검사한다. 첫5개는010000/200000/210000/213000/220000, 마지막은223000이다. 원장221 이후의 실제 prefix·후속 전체 source/DB 검증은 root가 별도로 결속한다.

## 로컬 검증과 한계

원81362 manifest가 새de001 postimage와 불일치하는 회귀를 수정 전 실패로 확인했다. 한 필드 수정 후 새3검사와 기존 worker 원문 수량13검사, artifact build/schema/closure/descriptor 관련 선택9검사를 통과했다. artifact 관련29검사는 선택 제외이며 성공 개수에 넣지 않는다. 직접 TypeScript·새 test ESLint·기존 anti-slop3단계도 통과했다.

기존 `materializeYoutubeExtractionWorkerArtifact`와 `verifyYoutubeExtractionWorkerArtifact`로 현 source의37파일을 가짜 release/tree로 복사·읽기 전용 봉인·재검증했다. worker runtime과 새 expected schema가 inventory에 포함되고 descriptor가 같은 artifact/schema digest에 결속됨을 확인했다. bundle/model/prompt·기존 v71 PIN·credential/ops config는 변경하지 않았다. 기존 v71 입력으로 재계산한 policy digest는 `17577b8be8be9da59d37aee80c4467e09fc27b8398a547f63497760c774dc6d7`로 동일하다. 정책 값을 새 code의 실행 권위로 자동 재사용한 것은 아니다.

검사 결과는 `/tmp/mumeok-c04-worker-release-*`의 로그·artifact proof·source freeze에 있다. 이는 파일 생성/무결성과 source 연결 검사다. worker 실행·실제 HTTP/JWT·credential 발급·설치·restart·zero-AI 운영 건강·실영상 추출/평가·외부 AI·DB 접근은 하지 않았다. 이 검사를 설치된 worker의 건강 증거로 사용할 수 없다.

## root의 후속 봉인·전환

root 커밋으로 최종 source SHA/tree가 정해지면 기존 artifact build/verify를 그 정확 source에서 다시 실행한다. 기존 v71 artifact/descriptor/expected schema를 덮어쓰거나 fixture의 가짜 SHA를 실제 source로 relabel하지 않는다. 최종 immutable artifact/schema 원bytes·descriptor·policy/credential release 결속을 함께 검증한다.

새223000 DB guard가 de001이 된 뒤 구81362 expected schema/descriptor로 정상 enqueue를 주장할 수 없다. 기존 enqueue readiness는 두 지문을 정확히 비교한다. 첫5개 DB OFF checkpoint와 worker 관리자1개 단계를 분리해도, 새 수량 활성화는 여섯 SQL·웹 reader·새 worker 결속이 완성된 뒤에만 한다. 마지막 DDL은 기존 supabase_admin actor가 필요하며 일반 빠른 배포 scanner나 C03/C01 권위를 우회하지 않는다. credential generation/정책·queue·실제 worker 교체·건강·복구는 root의 기존 제어 경로에서 별도로 수행한다.
