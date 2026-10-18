# v85 웹15 전환과 설치 웹 복구 — 2026-10-18

웹은 `15b1a36f9b4c4c293cd8f92c6f2824b13ba7eaf9`, build `prelaunch-15b1a36f9b4c-DVzl4n`으로 전환됐다. 공개 HTTPS 홈·로그인·개인정보와 실제 manifest가200이며, 실제 launcher39019/HTTP39025의 UID/cwd/부모·자식/시작 시각/3100 리스너 및 시작 키8개 일치, R2 `503 ROUND2_DISABLED`를 확인했다. state/recovery 완결 전후 원 d69의 전체 DB preimage 검증으로 DB232·43jobs·원42·worker49·원 승인3개 보존을 확인했다. gen50은 미발급이며 새 접수 readiness는 `blocked / READINESS_UNAVAILABLE`다. **v85 추출 활성화·인증된 추출 동작 검증은 미완료**다. 요리 변경 배포는 보류했다.

## 중단과 원인

1. 10:31 UTC 시도는 원본 state75021bytes/SHA2703과 공식 durableJson의 LF 스냅샷75022bytes/SHA192d를 같은 지문으로 비교한 guard 오류로 웹 교체 전에 중단됐다. 두 지문과 파싱 객체 동일성을 별도로 검증하도록 고치고 실패 원본을 보존·종결했다.
2. 다음 시도는 정상 deploy의 `plistBytes()`가 UTF-8 문자열을 반환하는데 `switchWeb()`이 이를 `Buffer.equals()`에 전달해, bootout·plist 쓰기 뒤 bootstrap 전에 멈췄다. 이전 테스트는 restart adapter/Buffer 경로 위주여서 실제 switchWeb의 문자열 입력을 놓쳤다.
3. 보상은 정상 경로가 인정하는 고정 v74 source handoff 대신 raw Git ancestry를 요구해 시작 전에 막혔다. 정상 경로와 동일한 pinned handoff 검증을 두 보상 floor 검사에도 적용한다. 증명·source·ledger가 다르거나 ancestry가 연결되지 않으면 거부한다.
4. 기동 후 Node fetch의 Host 처리 때문에 R2 probe가403을 반환했다. 기존 공식 HTTP probe와 Python 요청은503을 확인했다. 제품 origin 보호를 변경하지 않고 post-verifier도 기존 공식 HTTP probe를 사용한다.

## 실제 복구

설치된 정확한 f39 plist/웹15/DVzl4n, pending e572, 이전 state2703, 새8/OFF, 원 승인3개, 전체 DB, source aa477/E2e057, worker49750, unloaded·3100 무리스너를 확인한 뒤 기존 restart fence를 사용해 **현재 plist 등록만** 수행했다. bootout adapter는 무조건 거부하고 plist 쓰기는 동일성 확인만 허용했다. 웹은11:06:56 UTC에 기동됐으며 정확한 중단 시작 시각은 수집하지 않았다. 최초 probe 오류 후 서비스를 다시 시작하지 않았다.

후속 고정 metadata 도구는 새 PID39019/39025·실제 키·HTTP·R2·승인·DB를 확인하고, 원 state/recovery를 create-only archive에 보존했다. 기존 회전 marker를 유지한 정확한 새 state를 원자 게시하고 full DB/runtime을 다시 검증한 뒤 active recovery만 제거했다. 메타데이터 완결에서 재시작·plist 쓰기·DB 쓰기·자격 변경은0이다. 최초 bootstrap에는 서비스 등록1회가 포함된다.

- 최종 state SHA: `3bb03e719eee11fb9331d6289ff95b773f3648a10d764d5751853de2bbe324af`
- 실제 실패 recovery SHA: `e572a73fa3b0fdd8f783fd2c9320ecbe2e4a289b12b6f8bf9e573cddd3ebfc2f`
- 최종 complete SHA: `708c25685d5423c3207140e9d6f4cebebe3fd5161880ff63238f4da741cc2e6f`
- 독립 리뷰된 bootstrap source SHA: `68b9dc6c5bd460d1840b910bb200af9042b59278c63842954e4c9085d60bc7ae`
- 독립 리뷰된 metadata source SHA: `4cec469ed13069183a2fcc5eb279b5bec9e8a2bd9345e4cbccb8ac14a1d46d26`

[검증 메타데이터](data/v85-web-transition-recovery-20261018.json), [bootstrap 원 source](data/v85-installed-target-bootstrap-source-20261018.mjs), [metadata 원 source](data/v85-installed-target-finalize-source-20261018.mjs)는 비밀 값 없이 보존한다. 두 source는 해당 고정 사건의 기록이며 실행 당시 절대 경로를 유지한다. 현재 source/state/PID가 달라지면 거부하므로 범용 복구·재시도 도구로 사용하지 않는다. 기존 aa477/76f809 실행 source와 원 d69는 변경하지 않았다.

## 회귀 수정과 남은 확인

master의 switchWeb 입력은 부작용 전에 Buffer로 정규화해 실제 plutil 문자열과 Buffer 보상 모두 같은 bytes를 사용한다. 실제 switchWeb 함수와 transaction으로 정상 문자열/Buffer 활성화·실패 보상·설치 파일 변조·옛 키 거부를 검사하고, 실제 restore·approvedSourceAncestor 함수로 pinned handoff 두 floor 검사와 증명 부재/변조/권한 불일치/잘못된 후속 source 거부를 검사한다. 이 수정은 현재 웹을 다시 배포하거나 시작하지 않는다. 과거 고정 executor의 source pin은 실제 실행 증거로 유지한다.

다음 단계는 원 d69의 실제 발급 사용자 확인 경계에서 gen50 발급·등록·worker 전환·인증 health/empty-claim과 기존 결과 연결을 검증하는 것이다. 새 권한·만료 확대, DB 복원, 제외한 auth 항목을 새로 허용하는 조치는 수행하지 않았다. 새 모델 추출 호출0이다.

검증: 관련 Vitest8개 suite576개, Node62개(신규 실제 입력·handoff10개 포함), 타입·lint·diff 검사와 독립 리뷰 통과. 공식 HTTP probe를 사용한 실제 전환 후 검증기에서도 웹15/프로세스/startup8/R2 OFF/DB232/43jobs/worker49/승인 보존/recovery 없음을 재확인했다.

웹 전환 후 원 d69 preflight도 ready=true/credentialIssued=false로 통과했다. 실제 발급·등록은 실행하지 않았다.
