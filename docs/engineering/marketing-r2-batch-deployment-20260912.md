# R2 누적 웹 변경 배포 및 테스트 집계 제외

사용자는 2026-09-12 누적 변경 배포를 승인했고, 현재 R2 참여 5건(recording 2, homeflow 3)이 모두 테스트임을 확인했다. 원본 참여·이벤트·신청 데이터는 삭제하거나 수정하지 않는다.

## 테스트 제외

기존 `operational_events`에 `event_type=marketing_test_exclusion`, `source=operator_confirmed_20260912`로 확인한 participation ID별 제외 근거를 한 번 기록한다. metadata는 table, participation_id, reason만 포함하고 이메일이나 응답 내용은 포함하지 않는다. 새 column·schema·RLS 변경은 없다. 분석 SQL은 [round2-analysis.sql](../marketing/round2-analysis.sql)의 anti-join을 사용해 해당 참여와 종속 이벤트/신청을 함께 제외한다. 기존 v2 광고 기록은 건드리지 않는다.

적용 전에 exact local Docker identity를 검사하고 owner-only 새 디렉터리에 전체 pg_dump 및 roles 백업을 생성·decode한다. UUID 목록과 원본 데이터 digest를 private plan에 고정한다. bounded transaction/advisory lock에서 고정된 5건만 검증 후 INSERT하고, 기존 metadata와 충돌하면 중단한다. 다시 읽어 marker 5건·events 25건 제외 및 원본 digest 불변을 확인한다. 자동 삭제·reset·restore는 없다.

## 웹 배포

현재 live `c13c96a4dd8a32ead04e31049c039d737186dbc5` 후속 후보만 `deploy-prelaunch-web.mjs --reviewed-ref`로 배포한다. master는 병합하지 않는다. `NEXT_PUBLIC_SITE_URL=https://app.mumeok.kr`, 기존 local Auth/Data 설정과 R2 키·control을 유지한다.

R2 repository root는 기존 root가 live checkout과 같을 때만 새 checkout으로 이동한다. release SHA와 readiness path는 새 private 환경 patch로 고정한다. 기존 provider·DB·ingress 증거는 보호 코드·SQL·키·대상·라우팅이 동일한지 확인한 경우에만 원 실행 시각/원 SHA를 보존해 승계하며 새로운 실행으로 기록하지 않는다. 새 consent UI의 목적·항목·기간·철회·필수 동의는 검토한다. 실행 설정과 새 source SHA가 다른 경우 활성화하지 않는다.

최종 운영 확인은 홈 목록, 팬트리 guest/add gate, R2 화면·readiness, 절대 OG/Twitter 이미지 URL과 실제 이미지 GET이다. 검증용 참여를 새로 저장하지 않는다. UI smoke는 읽기와 guest gate까지만 수행한다.
