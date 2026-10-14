# C04 수량 원문 source 계약 등록 — 2026-10-14

상태: 소스 등록·소유 격리 검증 완료, 운영 적용 전. 전체 보안 inventory의 기존 실패를 해결하거나 허용한 것은 아니다. worker 봉인용 expected-schema 변경은 별도 브랜치이며 여기에는 포함하지 않는다.

`docs/security/quantity-input-v4-source-function-postimages.json`은 최신 C01 SQL60b9 뒤 C04의 여섯 고정 migration을 같은 순서로 결속한다. 첫5개의 기능 DDL actor는 postgres, 마지막223000/f586의 actor는 supabase_admin이다. 기존33·신규27 함수와 unchanged overload3개, 총63개의 본문 MD5·정확 signature·owner·non-owner ACL·전체 configuration·SECDEF·volatility를 기록한다. worker13 postimage와 catalog81362→de001도 별도 원 registry와 일치해야 한다. SQL/역할/권한 metadata 기준은 바꾸지 않는다.

`full-local-security-inventory.mjs`의 `includeQuantityInputV4Functions`는 명시 opt-in이다. 완전한 C03/C01 선행 계약이 없으면 거절하고 기본 계약은 유지한다. source-only63검사와 C03+C01+C04 union94검사 모두 같은 current postimage를 사용한다. 보존한 overload도 없거나 본문·configuration·volatility가 달라지면 거절한다. whole 검사에서 missing expected signature가 있어도 unregistered overload는 NULL 비교에 숨지 않고 실제 OID로 계산한다.

네 개의 checked-in baseline/native pre-C04 본문 불일치는 manifest의 `historical_preimage_mismatches`에 원값·단계별 값과 미해결 상태로 보존한다. 이는 이번에 검토한 current postimage를 옛 값으로 거짓 실패시키는 OR 조건의 근거가 아니다. current 비교는 postimage에만 엄격히 결속하며 과거 불일치 해결을 주장하지 않는다.

소유 schema-only219 archive5447/암호 없는 roles a37b·pinned PG/network-none/자료행0/Unix socket에서 최신 C03→C01 60b9→C04 여섯 migration을 다시 준비했다. source 등록 관련14검사(순수7/실PG7), source63·union94 mismatch0을 확인했다. 누락·변조·추가overload·volatility의 실패를 직접 유지하고, whole validator가 기존 실패를 그대로 거절하는 회귀를 추가했다. 현재 opt-in whole은 body4/owner18/ACL16/unexpected membership8 외에도 기존 policy/RLS/table ACL/search_path 실패가 남는다. default whole의 body15와 새 opt-in body4를 구분하며 어느 쪽도 전체 PASS가 아니다.

기존 수량 원문 native12, recipe9, worker32 및 C0117개 통과는 인수 전 실행 근거로 보존한다. 마지막 C01 동시성 회귀는 기본5초 제한에서5464ms에 실패했으므로, 중복 seed가 남은 fixture에서 반복하지 않고 새 소유 fixture의 원검사를 `--testTimeout20000`으로 선택 실행했다. 6292ms에1검사 통과·18선택제외했으며 원 assertion이나 C01 source를 바꾸지 않았다. 이1개를 새 전체19검사 통과로 표현하지 않는다.

수량 원문 integration test의 OFF preview 기대는 최신 C01 계약과 맞춘다. 제어 OFF에서는 preview/새 writer에 weight_basis를 붙이지 않으며 기본 numeric/nutrition과 quantity_input/batch_basis의 정확 비교를 유지한다. ON 저장 및 OFF 뒤 기존 근거 보존 검사는 그대로다.

인수한 정확CID/UUID label의 격리4개와 인수 후 새 fixture1개만 확인·정리하고 각각 resources_removed 증거를 남긴다. 실제 `homecook-full-local-isolated` 프로젝트나 다른 인스턴스에는 접근하지 않는다. 소스 동결·명령/종료값·before/after 지문·cleanup·미해결 whole 실패는 `/tmp/mumeok-c04-contracts-takeover-*` 인계 자료에 기록한다. 실제 운영/config/개인 자료/worker/credential/AI/새 source 활성화는 실행하지 않았으며 root가 독립 리뷰·커밋·후속 운영 결속을 담당한다.
