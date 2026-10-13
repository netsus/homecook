# 무먹 베타 v9 구현 진행 장부

## 범위와 실행 승인

- 요청 기준: `/Users/cwj/Downloads/mumeok-beta-audit-user-report.html`의 최신 v9와 2026-10-13 총괄 구현 요청. 첨부의 과거 ‘구현 미승인’ 문구는 조사 당시 상태이며 현재 사용자 지시가 우선한다.
- 모든 현재 유효 미완료 항목을 포함한다. 일반 리팩토링, Anti Slop 전체 정리, Actions 활성화는 제외한다.
- 브랜치/코드/검사/커밋/push/draft PR/검증 후 master merge/기존 경로 운영 배포/필요 restart는 승인됨.
- 보안·인증·권한 변경, 새 키, 복구 불가능 삭제, 운영 migration·일괄 데이터 변경, 새 비용·법적/개인정보 정책 결정은 구체 대상·영향·복구 방법을 제시해 별도 승인받는다.
- 신규 YouTube 추출, 모델/P5 평가, 추가 외부 AI 호출, 소진 예산 재사용은 금지. 기존 결과·로컬 fixture 검증만 허용.
- 일반 테스트 기록은 검증에 사용 가능. 복구 불가능한 삭제는 별도 승인 전 실행하지 않는다.
- Discord 기존 ‘원준’ 목적지에 단계 완료/실패 요약 전송 가능. HTTP 성공 확인을 남긴다.

## 시작 기준과 보존

- master/origin/master: `b257148d06737be703a7eea407d102384849bb25`.
- 운영 웹: `d22217ddc791df79e72c055516bd5cffd6bb69c0`, build `prelaunch-d22217ddc791-3EwFuq`.
- worker: v71/gen47, release `8e515a6482a1dfaa292d6f67ae6aa8a06f84d2d4` (별도 읽기 확인 진행).
- DB: ledger 219. master·웹·worker의 219 SQL 파일 해시와 모두 일치(추가/변경/누락0, READ ONLY 전후 해시 동일).
- 복구 정정: 현 state의 즉시 이전 웹은 `8e515a…`다. 외부 DB상태의 backwardCompatible=false는 이전 `f970→DB219` 전환 기록이다. 이번 DB·worker 무변경 웹 배포는 현재 d222를 previous로 저장해 복구한다. 상태파일의 단순 rollbackAvailable 표시만으로 호환성을 단정하지 않는다.
- 원래 checkout `codex/gabia-direct-prelaunch`의 개인정보/공식문서/테스트 미커밋 변경과 모든 다른 worktree는 보존한다.
- 작업 worktree: `/Users/cwj/.codex/worktrees/mumeok-beta-v9/homecook`; 첫 branch `codex/mumeok-beta-v9-batch1`.

## 항목과 작은 배포 단위

| 단위 | 포함 항목 | 시작 판정 / 의존 / 승인 경계 |
| --- | --- | --- |
| 기존 연결 확인 | T0/B03 | 기존 저장 연결은 이전 배포 해결. 재구현 금지; 기존 결과/fixture 재검증 및 중복 요청 계약 확인. 신규 추출 미검증 유지 |
| 1 계획 입력 | T1/B01, T2/B02 | 운영에서 상세3→모달2 및 Shift+Tab 배경이탈/Escape 미닫힘 재현. 웹 전용 최소 수정 진행 |
| 2 탐색 복귀 | T3/B04, T4/B05 | 남은요리 date/segment 복귀, 홈 검색 query/filter/sort/위치 복원. 관련 경로만 수정 |
| 3 요리·알림 | T7/B08/C02, T10, T11 | 지정 안내문·원문 보존, 결과 알림 우선, 데스크톱 폭 활용. 요리모드 인분조절 추가 금지 |
| 4 제품 목록 | C06-B0~B3 | 기존 brand로 등록업체 formatter/정확 별칭/텍스트 배지/원문 접근. DB·사진 작업 없음 |
| 5 개인 상세 | T12/B10 | 공개 metadata는 중립·private 노출 금지, 소유자 본문 제목 반영. 권한 정책을 바꾸지 않는 방법 우선 |
| 외부 표시 | T6/B07 | 네이버 서비스 표시명. 인증 관리자 설정 실행은 대상·영향·복구 설명 후 별도 승인 |
| 제품·단위 기반 | C03-P0~P8, C04-U0~U5, T5/B06 | 현재 제품 대표 연결 필수 제약 존재. 제품독립/행키/고정버전/근거환산/장보기·팬트리 호환을 최소 단계로 준비. 권한·운영DB는 별도 승인 |
| 무게·출처 | C01-W0~W5, T8/B09 | 위 제품 단위 계약 의존. 예측/실측 분리, 선택실측, 근거 없는 경우 null. 이력 보존. 운영DB·근거 재사용 정책 별도 승인 |
| 선택 참여 | C05-D0~D5 | C01/C04 의존. 목적·기간·삭제/백업 정책 미확정. 확정 전 UI 공개·수집 활성화 금지. 계정서버 상태·명시동의·철회 경합 검증 |
| 이후 데이터 단계 | C01-W4 활성화/W6, C05-D4 모델 활성화 | 데이터 충분성·정책·독립 품질 조건을 충족하기 전 학습/활성화 금지. 미래 ML은 문서상 즉시 구현 필수 아님 |
| 최종 묶음 | T9 | 각 운영 배포 후 모바일320/375·데스크톱, 로그인 전후, 취소/뒤로/새로고침/반복클릭·기존기록 확인. 미실행을 통과로 합치지 않음 |
| 기존 변경 보존·반영 | F01 (v10 추가 요청) | 기존 dirty 5파일과 미추적 운영문서/진단자료7개를 비공개 보존 완료. 직접 DNS·Turnstile 사실과 필요한 안내만 별도 PR. 새 개인정보 목적·기간 결정 승인 아님 |

## 제외·대체와 불변 계약

- C06-I0~I5 사진 수집/Storage 확대는 B0~B3 텍스트 배지로 대체.
- B08 조리법 숫자/문장 자동변환·수량삽입·수동 재료 연결·새 전체량 패널 제외. 안내: ‘재료표는 선택한 인분으로 환산됩니다. 조리법의 수량은 원문 그대로입니다’.
- 원본 인분은 확인될 때만 표시한다.
- 제품 대표 재료 연결은 선택적 분류/대체 정보이며 제품ID/영양버전/단위근거를 대체하지 않는다.
- 팬트리 보유 목록 유지. g 재고 자동차감·커머스·가격/판매처 스키마·대량 제품 정제 제외.
- g/mL 동등 가정 금지, 제품에 일반 재료 밀도 차용 금지. 조리수율과 영양잔존율 분리.
- 과거 식단·완성배치·제품영양버전·snapshot 자동재계산/일괄변경 금지.
- C05의 과거 ‘C01-W5 전체 통계’ 표현은 작업표 기준 W6를 의미한다. W5는 검증 단계다.

## 단위 1: 계획 입력 — 구현·독립 리뷰 확인, 미배포

- 운영 재현: 두부찌개 상세3인분/669kcal/두부450g/물600ml → 추가창2인분. 실제 잘못된 저장은 새로 만들지 않음.
- 운영 재현: 추가창 닫기에서 Shift+Tab → `/terms` 링크; Escape 이후 dialog1개 유지.
- 구현 소유: servings 담당은 recipe 상세/planner payload, dialog 담당은 WebModal/WebDialog/기존 boundary 연결. 총괄은 문서/통합검사/운영배포만 담당.
- 최종 독립 리뷰: GPT-6.1 Sol xhigh, 변경 소스14파일/테스트8파일 검토, 집중11파일229테스트 통과(실패/skip0), 자동초점·메뉴 제거 후 명시 복귀 target 독립 재현 통과. 검사 전후 source/test diff SHA256 `b7f90ba6174313453907f4f4e6c31549b44179ae5124c500fe3e4946f9492ec2` 동일. 병합 차단0.
- 최종 코드의 `pnpm typecheck`, `pnpm verify:anti-slop` exit0(신규 위반0), 변경파일 ESLint exit0(기존 showToast 의존성 경고2), diff check exit0. build는1차 통과했으며 배포 후보에서 실제 최종 빌드를 다시 확인한다.
- 기존 YouTube 공개 projection/저장 route/수량 fixture·meal 멱등성의 로컬16검사 통과. 외부 추출/모델 요청0.
- PR, master SHA, 배포 SHA, 운영 재확인: 아직 없음. 운영 완료 아님.

### 진행 중 검증과 배포 경계

- 첫 focused 검사에서 313개 중3개가 실패했다. unchanged master worktree에서도 planner-add-sheet-redesign의 같은3개 실패를 재현했다. 기존 nutrition fixture에 필수 sources가 없어 발생했으며 RecipeNutrition 계약에 맞게 fixture만 보완했다(기대값/제품 기준 불변). 단독6검사 재실행 통과.
- 기존 `test:feedback-batch:web`: 1,304 통과, 선택 범위 밖131 skipped. 전체 suite 합격 주장이 아니다.
- 독립 리뷰에서 autoFocus의 opener 캡처 누락과 메뉴 제거 후 복귀 누락을 발견해 기존 훅+명시 fallback으로 수정/재검사 중.
- 1차 typecheck/build/Anti Slop 통과. 후속 typecheck와 build 병렬 실행은 build가 생성 타입을 교체하는 동안 TS6053으로 실패했다. 최종에는 build 완료 후 typecheck를 순차 실행한다.
- 기본 `deploy:dev:plan`은 master에 있는 worker/운영파일7개 차이로 exit1 거부. guard를 변경하지 않는다. master merge 후 d222 후속 웹 전용 배포 소스에 검증 commit만 cherry-pick하고 기존 `--reviewed-ref` 경로를 사용한다. package 변경은 R2 승계를 막으므로 새 test key를 추가하지 않는다.
- 기존 배포 옵션 후보: `--reviewed-ref <검증된40SHA> --already-applied-db --db-config /Users/cwj/.homecook/config/full-local-production.env --test-script test:feedback-batch:web`. 후보의 실제 plan과 DB READ ONLY 확인을 실행한 뒤 배포한다.
- 현재 worker는 정상이며 만료감시기는 옛12파일 verifier와 현 v71 22파일 구성 불일치로 실패한다. 새 키 발급0. 현재 gen47 만료는 2026-10-19 17:24:41 KST. 플랫폼 백업 metadata 약84시간 경과이며 신규 운영DB 변경 전에 별도 보호 확인 필요.

## F01 — 기존 미커밋 변경 (보존 완료, 반영 전)

- 추가 요청: 기존 변경을 잊지 않도록 이 총괄에서 보존·분류·작은 PR·필요 배포로 정리. 개인정보 동의 구현 전에 비교한다. 감사 세션은 별도 수정하지 않는다.
- 원본 기준 HEAD `f970bc1d1f1e981d8947e852a9b51ada4a74570a`, branch `codex/gabia-direct-prelaunch`.
- 비공개 보존: `/Users/cwj/.homecook/operations/mumeok-beta-v9-f01-20261013-_fv2tqbx` (디렉터리0700, 파일0600). 파일7개 원문, HEAD/unstaged/staged binary diff, status, UTC시각·파일별SHA256·크기 manifest. 누락0; 원본 수정0.
- app/privacy/page.tsx 및 launch-readiness-legal-seo.test.tsx: master도 옛 전체 Cloudflare 중계 설명이므로 필요 반영 후보. 현재 운영 사실 대조와 독립 검사 후 별도 반영.
- CSoT·요구사항·화면정의서: 10/12 DNS 추가 문단이 후보. master에 이후 문단이 추가됐으므로 파일 전체를 덮지 않고 필요한 문단만 통합한다.
- docs/engineering/gabia-direct-domain-20261012.md: 미추적 운영 기록. 과거 사실과 현재 재검증을 구분해 검토한다.
- .diagnostics/youtube-description-quantity-20261012/diagnosis.json: 진단 자료로 별도 보존, DNS/개인정보 PR에 포함하지 않는다. 실행·평가 없음.
- 작성자 미확정. 원본 dirty 상태는 유지하며 전체 add/reset/삭제 금지. 채택 이유·최종 PR/SHA·잔존 상태는 후속 기록한다.

## 재개 규칙

1. 먼저 이 장부와 각 PR 및 작업 worktree status를 읽고 현재 운영 SHA/DB를 재확인한다.
2. 구현 → 관련 테스트·타입·lint → 독립 리뷰 → draft PR → 확인 후 merge → 필요한 구성요소 배포 → 실제 운영 확인 순서.
3. 운영 배포는 총괄 하나만 실행한다. 다음 미검증 묶음을 현재 배포에 섞지 않는다.
4. 실패 시 정확 명령/대상/guard 사유를 기록한다. 보호 우회·자동 파괴적 rollback 금지.
