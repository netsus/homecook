# 실제 요리 경험 개선 — 2026-10-17

## 시작 상태와 경계
- origin/master `36fbf9535b8bfe46ba323943ed4cf70640a3ca98` fetch 완료. 로컬 master `b257148d0`는 282 commits 뒤(고유 commit 0). 기본 폴더 `codex/gabia-direct-prelaunch` / `f970bc1d1`: 개인정보/가비아 문서·테스트 미커밋. 복사·삭제·reset 없이 보존.
- 독립 `/tmp/homecook-cooking-experience-20261017`, `codex/cooking-experience-20261017`. 다른 작업트리 변경을 가져오지 않음.
- 비-release 작업트리 134, 미커밋26, 경로소실3, HEAD가 origin/master에 포함100. 포함된 HEAD도 미커밋 작업은 미반영일 수 있어 제거하지 않음. unmerged34는 squash/중복 가능성 미확정. 아래 목록은 소유 작업 추정이며 폐기 승인이 아님.
- 운영 state.json 읽기: 웹 `06a3369f5c5e1c3ca49045f370f0ce12f049c805`, build `prelaunch-06a3369f5c5e-EWuEsS`. worker v74/gen49·DB232는 공식 운영기록 기준(실시간 worker/DB 확인 별도).
- v85 담당 `01a145cd-a454-748a-9399-a48f85e8a002` 단독 배포. 전환완료·잠금해제·부모 조율 전 배포/공유설정 변경 없음. 구키 fallback 금지, Round2/lead/C05 OFF. 환경/키/credential 출력 없음.
- 부모 진행 전달 1회: source_thread_id 목적지 not found. 이후 결과는 이 문서와 최종 응답으로 전달.

## 작은 묶음과 검증
1. 화면 정리(2/4/6/9): 남색 전체 배경, 완료 안내 핵심+펼침 설명, 원입력 보조표시 제거(양/원자료 보존), 데스크톱 목차 페이지 탐색과 중복 목차 제거. 모바일 유일 탐색 보존. 관련 UI tests·type/lint·독립 리뷰·Chrome375/1440.
2. 무게(1): 기존 조건별 추정 우선, 총재료 질량 확인 가능한 경우에만 0.75 명시적 fallback. 실측우선/미확인/저장 일치 회귀. 기존 수집·학습·개인확인 보호 보존.
3. 실행분 수정(3): 요리 실행 snapshot에만 저장, 배율 중복 금지. 새로고침/취소/단위/미확인/영양·추정·완료 원자성 및 권한 테스트. 원본/공유 레시피 변경 없음.
4. 영양 표시(7): 공통 영양성분표, 기준량/결측/추정 보존. 상세/끼니 통합. 모바일·데스크톱 숫자 정렬·접근성 확인.
5. 재료/최근 영양 조사(5/8): 기존 generic-oil 작업 중복 조사. 정확 이름만 식용유 연결, 특수 오일 보존. 최근 레시피 결측을 연결/환산/수량/완성무게/원천별 분류. 운영 데이터는 영향대상 최소 백업·검토 후 별도 반영하며 현재 쓰기0.

각 묶음 완료는 코드·작은 회귀·타입/lint·독립 리뷰·Chrome 실제 화면 통과 시에만 표시. PR/merge/배포 상태는 별도로 기록. 타입/빌드는 배포 전 최종 묶음에도 수행. CI/Stage/workpack gate 부활 없음.

## 진행
- 상태 조사 및 독립 worktree: 완료. 외부 screenshot Library는 OCR 확보, 실제 pixels 확인 대기(보지 않은 화면으로 판정하지 않음).
- 구현/검증/PR/merge/배포: 진행 전.

## 작업트리 보존 목록
- `/Users/cwj/01_vibe_coding/homecook` — `codex/gabia-direct-prelaunch` / f970bc1d1f1e / HEAD기준반영 / 변경7개
- `/private/tmp/homecook-demo-planner-hotfix-VdUPFS` — `codex/demo-planner-status-hotfix-20260917` / ecd87372becf / 미병합·중복미확정 / 변경0개
- `/private/tmp/homecook-intake-trend-plan-20261016` — `codex/intake-trend-prototype-plan-20261016` / f970bc1d1f1e / HEAD기준반영 / 변경1개
- `/private/tmp/homecook-r2-readiness-hotfix-eOkYbj` — `codex/r2-readiness-deploy-hotfix` / 5c140caea3ce / HEAD기준반영 / 변경0개
- `/private/tmp/homecook-r2-ready-validation-55cd5493` — `detached` / 55cd5493cd0a / 미병합·중복미확정 / 변경0개
- `/private/tmp/homecook-v85-web-recovery-20261017` — `fix/v85-rotation-safe-cutover-20261017` / ca5a871097f5 / 미병합·중복미확정 / 변경14개
- `/Users/cwj/.codex/worktrees/2ab3/homecook` — `fix/public-recipe-nutrition-read` / af044945462f / HEAD기준반영 / 변경4개
- `/Users/cwj/.codex/worktrees/cooked-weight-prediction/homecook` — `codex/mumeok-c01-reader-evidence` / db0fa13f58ea / HEAD기준반영 / 변경2개
- `/Users/cwj/.codex/worktrees/cooked-weight-veto/homecook` — `detached` / 5925b8090d9b / HEAD기준반영 / 변경3개
- `/Users/cwj/.codex/worktrees/gamification-projection-20260906/homecook` — `fix/gamification-projection-web-20260906` / d22ddb447a54 / 미병합·중복미확정 / 변경0개
- `/Users/cwj/.codex/worktrees/ingredient-nutrition-correction/homecook` — `codex/ingredient-nutrition-correction-20261006` / 8abed074f04e / HEAD기준반영 / 변경57개
- `/Users/cwj/.codex/worktrees/marketing-demand-validation-stage6-safety/homecook` — `feature/marketing-demand-validation-landing-polish` / 08f3ddaec410 / HEAD기준반영 / 변경8개
- `/Users/cwj/.codex/worktrees/marketing-demand-validation-v2-stage4/homecook` — `feature/fe-marketing-demand-validation-v2` / c29d4a9bd39a / HEAD기준반영 / 변경2개
- `/Users/cwj/.codex/worktrees/marketing-local-dashboard-preserved/homecook` — `chore/marketing-local-dashboard` / 8f0caf0a9ebf / HEAD기준반영 / 변경3개
- `/Users/cwj/.codex/worktrees/meal-log-runtime-20260906/homecook` — `fix/meal-log-runtime-20260906` / 6abe9f0aa636 / 미병합·중복미확정 / 변경0개
- `/Users/cwj/.codex/worktrees/mumeok-beta-company/homecook` — `codex/mumeok-recipe-save-recovery` / c435d614a099 / 미병합·중복미확정 / 변경0개
- `/Users/cwj/.codex/worktrees/mumeok-beta-f01/homecook` — `codex/mumeok-beta-f01-privacy` / 7196651a8345 / 미병합·중복미확정 / 변경0개
- `/Users/cwj/.codex/worktrees/mumeok-beta-navigation/homecook` — `codex/mumeok-c04-worker-cutover` / 9b5029ef5662 / 미병합·중복미확정 / 변경0개
- `/Users/cwj/.codex/worktrees/mumeok-beta-products/homecook` — `codex/mumeok-c04-weight-origin` / 8e52a4c0411b / HEAD기준반영 / 변경6개
- `/Users/cwj/.codex/worktrees/mumeok-beta-web-release/homecook` — `codex/mumeok-recipe-role-source-release` / 5a3926e5a188 / 미병합·중복미확정 / 변경0개
- `/Users/cwj/.codex/worktrees/mumeok-c04-active-continuation/homecook` — `codex/mumeok-c04-active-continuation` / f8194a6784f1 / HEAD기준반영 / 변경6개
- `/Users/cwj/.codex/worktrees/mumeok-cooking-quantity-fidelity/homecook` — `codex/mumeok-cooking-quantity-fidelity` / 40882b122812 / 미병합·중복미확정 / 변경0개
- `/Users/cwj/.codex/worktrees/mumeok-manual-publication-context/homecook` — `codex/mumeok-recipe-snapshot-identity` / 950fd090b826 / HEAD기준반영 / 변경7개
- `/Users/cwj/.codex/worktrees/mumeok-meal-recent-unit/homecook` — `codex/mumeok-meal-recent-unit` / a684394e189b / 미병합·중복미확정 / 변경0개
- `/Users/cwj/.codex/worktrees/mumeok-nutrition-v4-reasons/homecook` — `codex/mumeok-recipe-unit-memory` / 950fd090b826 / HEAD기준반영 / 변경21개
- `/Users/cwj/.codex/worktrees/mumeok-nutrition-validator-deploy/homecook` — `codex/mumeok-menu-add-quantity-contract-tests` / 646282c58d80 / HEAD기준반영 / 변경1개
- `/Users/cwj/.codex/worktrees/mumeok-weight-participation/homecook` — `codex/mumeok-weight-participation-integration` / da65a96a2611 / 미병합·중복미확정 / 변경0개
- `/Users/cwj/.codex/worktrees/notification-retry-test/homecook` — `codex/mumeok-beta-notification-retry` / 00c81681dd39 / 미병합·중복미확정 / 변경0개
- `/Users/cwj/.codex/worktrees/protected-rollout/homecook` — `codex/mumeok-c03-reader-fence` / 5a3d12b69ff0 / 미병합·중복미확정 / 변경0개
- `/Users/cwj/.codex/worktrees/quantity-fidelity-operating-docs/homecook` — `codex/mumeok-recipe-http-replay` / 950fd090b826 / HEAD기준반영 / 변경9개
- `/Users/cwj/.codex/worktrees/recent-unit-operating-docs/homecook` — `codex/mumeok-retired-product-plan-scope` / ddfe55029a39 / 미병합·중복미확정 / 변경0개
- `/Users/cwj/.codex/worktrees/youtube-choice-quantity-20261010/homecook` — `codex/youtube-choice-quantity-20261010` / 55351544a479 / 미병합·중복미확정 / 변경0개
- `/Users/cwj/.codex/worktrees/youtube-display-release/homecook` — `codex/youtube-speed-quality-20261009` / 55e8a3651eec / 미병합·중복미확정 / 변경0개
- `/Users/cwj/.codex/worktrees/youtube-ingredient-resolution/homecook` — `codex/youtube-ingredient-resolution-20261009` / 55e8a3651eec / 미병합·중복미확정 / 변경19개
- `/Users/cwj/.codex/worktrees/youtube-optional-coverage-20261010/homecook` — `codex/youtube-optional-coverage-20261010` / dfe9d64495fc / 미병합·중복미확정 / 변경0개
- `/Users/cwj/.codex/worktrees/youtube-resolution-deploy-20261010/homecook` — `codex/youtube-resolution-deploy-20261010` / c51d53871f31 / HEAD기준반영 / 변경1개
- `/Users/cwj/.codex/worktrees/youtube-saved-quantity-compose-20261010/homecook` — `codex/youtube-optional-preservation-20261010` / 403e0f0500af / 미병합·중복미확정 / 변경0개
- `/Users/cwj/.codex/worktrees/youtube-vision-redesign/homecook` — `codex/youtube-vision-redesign` / fa167d9aeb11 / HEAD기준반영 / 변경111개
- `/Users/cwj/01_vibe_coding/homecook-codex-vision-loop` — `feature/codex-vision-single-loop` / f7775f68cf7a / 미병합·중복미확정 / 변경1154개
- `/Users/cwj/01_vibe_coding/homecook-full-local-restore` — `docs/full-local-production-operator-checklist` / af0b65ce33b8 / HEAD기준반영 / 변경67개
- `/Users/cwj/01_vibe_coding/homecook-session-lifecycle-deploy-v20` — `detached` / 4462ac8784e4 / HEAD기준반영 / 변경1개
- `/Users/cwj/01_vibe_coding/homecook-youtube-i031-impl` — `fix/youtube-shorts-import-resilience` / 3d73542f86a9 / HEAD기준반영 / 변경7개
- `/Users/cwj/01_vibe_coding/homecook/.worktrees/bootstrap-select-projection-contract-20261017` — `codex/bootstrap-select-projection-contract-20261017` / 2cd4aab93d5b / HEAD기준반영 / 변경1개
- `/Users/cwj/01_vibe_coding/homecook/.worktrees/response-boundary-inventory-20261017` — `codex/response-boundary-inventory-20261017` / d551ff06ac2e / 미병합·중복미확정 / 변경0개
- `/Users/cwj/01_vibe_coding/homecook/.worktrees/shopping-rpc-client-inference-20261017` — `codex/shopping-rpc-client-inference-20261017` / 5fc7dd78678a / 미병합·중복미확정 / 변경0개
- `/Users/cwj/01_vibe_coding/homecook/.worktrees/youtube-generic-oil-resolution` — `codex/youtube-generic-oil-resolution-20261011` / 2bc8ce58ae27 / 미병합·중복미확정 / 변경0개
- `/Users/cwj/01_vibe_coding/homecook/.worktrees/youtube-human-reviewed-source` — `codex/youtube-v86-source-name-quantity-repair-20261012` / 80d2cbf309a0 / 미병합·중복미확정 / 변경0개
- `/Users/cwj/01_vibe_coding/homecook/.worktrees/youtube-multi-parent-save-20261011` — `codex/youtube-multi-parent-save-20261011` / 21819a8634ee / 미병합·중복미확정 / 변경0개
- `/Users/cwj/01_vibe_coding/homecook/.worktrees/youtube-recipebook-planner-20261012` — `codex/youtube-recipebook-planner-20261012` / 6fe4c80e06eb / 미병합·중복미확정 / 변경0개
- `/Users/cwj/01_vibe_coding/homecook/.worktrees/youtube-recipebook-planner-release-20261012` — `codex/youtube-recipebook-planner-release-20261012` / a6676d27e175 / 미병합·중복미확정 / 변경1개
- `/Users/cwj/01_vibe_coding/homecook/.worktrees/youtube-source-quantity-recovery-20261012` — `codex/youtube-source-quantity-recovery-20261012` / 80d2cbf309a0 / 미병합·중복미확정 / 변경14개
- `/Users/cwj/01_vibe_coding/homecook/.worktrees/youtube-v69-choice-name` — `codex/youtube-v69-choice-name-20261011` / 64d934c698b3 / 미병합·중복미확정 / 변경0개
- `/Users/cwj/01_vibe_coding/homecook/.worktrees/youtube-v71-p5` — `codex/youtube-v71-p5-20261011` / 9838f9b6336a / 미병합·중복미확정 / 변경0개
- `/Users/cwj/01_vibe_coding/homecook/.worktrees/youtube-v73-former8` — `codex/youtube-v73-former8-20261011` / 0c98a367d4e9 / 미병합·중복미확정 / 변경0개
- `/Users/cwj/01_vibe_coding/homecook/.worktrees/youtube-v74-owner-normalization` — `codex/youtube-v74-owner-normalization-20261011` / e869582b45ea / 미병합·중복미확정 / 변경0개
- `/Users/cwj/01_vibe_coding/homecook/.worktrees/youtube-v75-source-ownership` — `codex/youtube-v79-identical-pair-20261011` / 17d46f09c6a8 / 미병합·중복미확정 / 변경0개


## 첫 구현 묶음 — 검증된 로컬 후보

- 2/4/6/9: body가 active dark cooking canvas를 따라 남색, 완료 안내 핵심+details, 원입력 보조행3곳 제거(주표시 원분수/단위/배율/저장원문 보존), desktop 목차8행·이전/다음·명시적 더불러오기. active recipe에서페이지파생, 하단 중복 전체목록 제거. 모바일 컴포넌트/목차 유지.
- 5: 추출 이름 전체가 `오일`일 때만 `식용유`로 조회. 명시 특수오일은변경0, source/raw/display/2큰술 보존. 과거 generic-oil branch의 광범위기름review 정책은가져오지않음. 실제 full-local 식용유 `d6d92b38-853f-43c2-b2e1-2b4a591de334`의 승인profile1·conversion1 확인. 15mL→약14g manufacturer evidence가 VOLUME_G15의 단순15g보다우선한다. [닛신오일리오2026 PDF](https://www.nisshin-oillio.com/oil/pdf/book.pdf)의인쇄15–16쪽, PDF9페이지(0-based8)의계량스푼15mL·약14g 원문을2026-10-17 재확인했다. 신규DB값/연결쓰기0.
- 7: 레시피·focused계획카드에공통 `NutritionFactsTable`. 선택전체/기본1인분(기존recipe계약) 또는계획전체/1인분 명시. 부분값은‘확인된일부’, 결측은정보준비중. 기존 AI notice/선택영양/원천/환산품질보존. 100g이나법정라벨 주장 없음.
- 8 부분복구: 공개 canonical bridge RPC 성공후이며 기존current nutrition snapshot이없을때에만승인된DB원천3표를읽어동적계산. GET쓰기0·기존snapshot우선·private/nonbridge/상품/v4 quantity pin을legacy환산으로재해석하지않음. 일반장애temporary, hybrid account409/503보존. 제품단계/원문과기존plan/batch/meal-log핀은변경0. 기존계획/미연결원천/미확인양/상품/v4경로까지전부해결했다는뜻이아님.

### 검증과 제한

- 화면첫묶음5파일153 PASS; 영양/오일/helper/북권한4파일57 PASS; 실제GET/기존snapshot/private/hybrid경계3파일17 PASS; 계획/AI/public-product3파일85 PASS. 합동15파일312 중311 PASS/옛열량태그기대1FAIL은 새표의 `1,100 kcal`로검사를맞춘후 해당suite재확인했다. 아래최종기록참조.
- 수정전 master에서도기존 nutrition API fixture1개가500으로실패했다. public product-label RPC와view-client mock누락을보완했고보호기대값/권한조건변경0. 이후해당API8개PASS.
- typecheck0, 변경ESLint오류0/기존showToast dependency경고1. `pnpm build` exit0(기존4경고). fullVitest/CI/전체Playwright 미실행.
- 독립코드리뷰2회: UI확정finding0; 영양/오일/공개읽기확정finding0, reviewer자체61검사PASS. 권장GET직접검사는추가완료.
- Chrome실제운영기존요리세션에서흰양옆여백과상세영양그래프확인. 사용자첨부4개는LibraryOCR만확보했으므로픽셀확인으로세지않음.
- Chrome로컬실제컴포넌트 fixture 375×812/1440×900: 전체남색/body17,25,35·가로넘침없음, 빈선택숫자/완료저장·summaryEnter접기/펼침, table양화면총량/단위/결측/숫자정렬, 목차8행·2페이지선택9쪽일치확인. 모바일목차/재료원분수·키보드는관련UI회귀검사로확인. 이fixture확인은인증HTTP/운영DB저장종단시험이아니다. 임시route는제거했고새의존성0.

### 최근 영양 누락의 실제 읽기 전용 분류

2026-10-17 20시대 UTC, 운영웹06a·full-local대상은공개대상recipe존재와원장232로대조했다. READ ONLY transaction·쓰기0, 새backup필요한데이터변경0.

공개최신유튜브10개중6개가 `RECIPE_NUTRITION_SNAPSHOT_MISSING`; 이전4개는partial3/complete1. 누락6개의고유재료참조47종중실제catalog부재11종·승인profile부재12종(조청1종포함). 각부분수치의source freshness/현재승인여부는실제calculator가추가검사한다. 다음목록은현재참조가없거나승인profile이없는대상이며일반명으로제품값을임의대체하지않는다.

| 레시피 | 카탈로그/승인원천 부족 | 양 미확인 행 |
|---|---|---:|
| 얼큰 만둣국 | 냉동만두·옛식용유참조·해물육수코인·땡초 |1|
| 뼈 없는 순살 소갈비찜 | 늑간살·갈아만든 배 |8|
| 맛있는 돼지고기 카레 | 승인profile부재없음(단위/양은별개) |2|
| 허니갈릭 통삼겹살 바비큐 | 오일·육즙 |4|
| 꽈리고추 두부볶음 | 대파흰대·조청·후추가루 |5|
| 하루가 지나도 불지 않는 잡채 | 생표고버섯 |1|

완성무게는레시피총영양계산의필수입력이아니며100g/섭취량계산과구분한다. 컵/줌/크게스푼/가득스푼/개수등의환산누락도source부재와별개다. source없는11참조의명확한기존DB재연결·필요한새공공/제조사원천보완·최근대상최소백업/검토/저장은v85전환직렬화후별도묶음으로남는다. 사용자건강정보외부전송0.

### 기존 변경·Anti Slop 인계

[전체브랜치/PR/미커밋목록](local-change-inventory-20261017.md). 원기본폴더의가비아문서는이미master에들어간내용이며master에역사자료구분2줄이추가됐다. 옛privacy는master의‘사이트키·접속출처’공개문구를되돌리고옛test는해당assertion등을줄이는차이다. 필요신규기능으로머지하지않고원파일그대로보존한다. 날짜fixture변경은실제법정시행일변경의근거가아니므로별도적용하지않는다. 나머지124고유후보는필요성/후속대체확인대기이며전부검토·머지완료로표현하지않는다.

이번묶음이해결했다고세는원본AntiSlop ID는0이다. 남은상세두개 `app/api/v1/recipes/[id]/route.ts::anti-slop(no-chained-type-assertions)::91e5705e78b700f1287003227440f6dab707875d501101f851a207a28286d093#1`, `...::75dca4dc05eacbb3b3182090d0a749053ce982f349fd6869ff9238d463d5b741#1`; 독립요리 `app/api/v1/recipes/[id]/cook-mode/route.ts::anti-slop(no-chained-type-assertions)::ce0f88be7a1fdeee0a51d9af9db8f0e19433dbe3fa2cfddb1150efdf006a0d3f#1`; 영양memory `lib/server/ingredient-ai-nutrition-refresh.ts::anti-slop(no-chained-type-assertions)::ec7d41753dac343ab951b9a532e4f50507f257809b23f8cfca572965af34f32e#1`은그대로남는다. 상세1건으로부르던계약후보와원진단2개를합산하지않는다. checkpoint1779의잔여29/총147·bootstrap26은현재9개기능운영후별도작업이다.

### 남은 핵심묶음과 운영잠금

1/3(0.75fallback, 실행분재료수정)은구현전이다. snapshot_v2는완료시현재서버고정snapshot·조건별evidence를다시검증한다. UI양만고치는방식은영양/추정/완료에반영되지않으므로채택하지않는다. 별도실행snapshot/owner·상태·revision·idempotency보호와일관된server계산·저장을함께설계/회귀해야한다.

PR/merge/배포는아직진행전. PR1780master병합과v85실제전환은별개다. v85담당승인대기·배포잠금유지, 공유설정/운영DB쓰기/키fallback/worker교체/새모델호출0. 부모app메시지도구는source_thread_id를찾지못해중간report전송실패1회이며commentary와이문서로진행상태를남긴다.

최종 합동 회귀: 15파일312 PASS/FAIL0/SKIP0, exit0. 별도 계산기+상세185 PASS. typecheck·build exit0, 변경lint 오류0/기존경고1. 운영배포0.

최신 master PR1780 `8e83c485d`를 통합했고 SOURCE_OF_TRUTH의 양쪽 새 절을 보존해 문서 충돌만 해결했다. v85 운영 전환·배포 잠금은 여전히 별개다.
