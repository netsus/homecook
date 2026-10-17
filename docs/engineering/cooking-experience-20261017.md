# 실제 요리 경험 개선 — 2026-10-17

현재 판정: PR1781(화면/오일/공개영양), PR1782(75%무게), PR1784(이번요리수정), PR1785(v4 부분영양)가 master에 병합됐다. 운영 배포·새스키마 적용·영양데이터 쓰기는0회다. PR1785 병합 기준 master는 `3e3e18b5961e5154e09bc33a30e6682521f40095`다. 현재 v85 보존 검사 때문에 운영 접근을 중단했다. 기존 fresh replay 실패 원인을 분리했고, 고정 schema-only228+원본229–232에서 새233/234 전체 회귀25 PASS를 확인했다. 현재 운영232의 새 관측·실제 인증 HTTP·배포 ledger 전환은 아직 미확인이다. 기존 운영 Chrome 탭은 닫기 연결 오류로 닫힘을 확인하지 못했다. 아래21:18보고가 현재 인증 관련 경계다.

| 요구 | 코드/검증 | 운영 |
|---|---|---|
|1 완성무게 추정/실측|PR1782/1786 merged, 검증질량75%·조건별우선·미확인보존, 격리SQL25 PASS|미반영, schema+web 필요|
|2 전체 남색 배경|PR1781 merged|미반영|
|3 이번 요리 재료 수정|PR1784 merged, owner/판본/영양/무게/완료 연결, 격리SQL25 PASS|미반영, schema+web 필요|
|4 완료 모달 안내|PR1781 merged|미반영|
|5 정확 일반명 오일 연결|PR1781 merged, 특수오일 보존|미반영, 최근2행 data수정 별도대기|
|6 원입력 표시 제거|PR1781 merged, 원문·양 보존|미반영|
|7 공통 영양성분표|PR1781 merged, 부분/결측 보존|미반영|
|8 최근 영양 누락|PR1785 merged, 원인분류·부분복구, 84검사/type/build/review0finding|source/연결 보완·최소backup/data쓰기·운영검증 미완료|
|9 목차 탐색|PR1781 merged, desktop8행/탐색·mobile유지|미반영|

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

## 20:42 UTC 중간 인계 — 운영 배포0

첫 묶음 [PR1781](https://github.com/netsus/homecook/pull/1781)은 20:34:33 UTC에 master `f4c677671f86821008134f8c2aa4c85562840ebb`로 머지됐다. 독립 worktree는 같은 경로에서 후속 branch `codex/cooking-execution-quantity-20261017`로 전환했고 기준 HEAD는 f4c677671이다.

승인/로그인 대기가 아니다. 후속 무게 후보는 전체 재료의 질량을 확인할 수 있을 때만75%를 적용하고, 기존 조건별 추정·실측 구분을 보존한다. 관련49검사 PASS. 새로 만든 소유자 표시·네트워크 없음·영속 볼륨 없음·빈 PostgreSQL fixture에서 새 SQL의 추정/실측 저장 구분·위조/owner/gate 거절8검사 PASS. 운영 DB에는 새 SQL을 적용하지 않았다. 전체 schema·완료 HTTP·화면·독립 리뷰는 아직이며 현재 후속 코드는 미커밋 후보다. 실행분 재료 수정(3)은 아직 구현 전이다.

v85 단독 담당의 배포 잠금은 유지한다. 앱 메시지 도구에서 부모 목적지를 찾지 못해 중간 보고는 commentary와 이 파일로 기록한다.

최신 master PR1780 `8e83c485d`를 통합했고 SOURCE_OF_TRUTH의 양쪽 새 절을 보존해 문서 충돌만 해결했다. v85 운영 전환·배포 잠금은 여전히 별개다.


## 20:49 UTC 무게 묶음 후보

전체 검증질량을 아는 경우75% 추정 모델을 추가했다. 기존 bounded 조건별 성공값 우선, 미확인/적당량/환산근거 없음은null 보존, 배율1회, 실측별도 우선. 완료/남은음식/식사preview/식사기록에 모델과가정 설명이전달된다. original recipe·과거기록 수정0. SQL은모델/가정/증거/중복/총량만추가검증하고기존owner·receipt·gate를유지한다.

독립리뷰에서가정코드검증과JS/SQL소수반올림2건을찾아수정했다. 영문가정코드+실제summary/meal/preview회귀, 직렬화된개별재료십진수합산+half-up2자리로통일했다. 재리뷰확정finding0, reviewer7파일109검사PASS. 합동8파일128검사PASS. 격리된소유fixture의실SQL12검사PASS(추정/실측구분,미확인null,위조/다른owner/gate거절,100.3/14.7/101.1g·소수배율·환산). 운영DB/전체schema/인증HTTP저장종단검사는아니다.

Chrome실제컴포넌트375×812/1440×900에서추정225g·빈실측·가정설명·가로넘침없음을확인했다。190입력은reported_measured 요청,빈칸은weigh_later/null 요청을로컬콜백에서확인했다. 임시fixture route는제거했다. 실행분재료수정(3)은미구현이며9개운영완료로표시하지않는다. 웹+스키마동시반영필요,운영배포0·잠금유지.

무게 후보 최종 typecheck·build exit0, 변경ESLint exit0/경고0, diff check exit0. 기존4개 build경고 유지. evidence web/DB gate의 기존 상태는 변경하지 않았고, 배포시 기능 사용 가능 여부는 담당자가 실제 승인된 설정과 함께 확인해야 한다.


## 20:56 UTC 인계

무게복원 [PR1782](https://github.com/netsus/homecook/pull/1782)는20:51:27UTC master `16a0c5466a8b333151da95689d46fa33368cc5f9`로머지됐다. 운영배포0이며SQL운영적용0. 현재독립branch `codex/cooking-run-ingredients-20261017`는16a0기준이다.

실행분수정(3)은아직구현전설계다. 원래 session/content snapshot의불변·public-owner-null보호를완화하지않고별도private실행양overlay를둔다. 원본기준양은보존하고수정한행만현재요리분의고정량으로취급해이중배율을막는다. 영양·예상무게를동일overlay판본으로고정하고완료와경쟁하는수정은revision/소유자/상태/멱등성으로차단해야한다. 취소는원본에반영하지않는다. 구버전완료경로가수정내용을무시하는것도DB에서거절하도록검증할예정이다.


## 21:07 UTC 실행분 재료 수정 후보

원본과 session snapshot pointer를바꾸지않는private execution overlay, owner/상태/revision/기존멱등원장, 수정행현재인분fixed·미수정행기존배율, 동일양으로영양/무게계산·완료원자참조를초안구현했다. 구완료우회는수정overlay가있으면DB에서거절한다. 식사분모는완료음식에고정된영양총량을사용한다. 미확인/변환근거없음은결측유지, g↔kg·ml↔L만자동환산한다.

실행PATCH·GET2회refresh·완료route·gateOFF·미인증/위조/infra/충돌·unit/focus/cancel5파일47검사PASS. 별도UI/기존계약5파일50검사PASS(후속추가2개별도). 격리minimalSQLfixture10검사PASS, 재현시소유networkless컨테이너안에새DB만create/drop하고원본SQL의기본validator/receipt함수를사용한다. 별도현재운영validator읽기전용복사fixture에서도10PASS였다. 전체schema/실제인증HTTP종단검증은아니며운영SQL적용0.

독립리뷰3건(수정0개인확인보존·초기focus·DB evidenceOFF완료)을수정하고재리뷰확정finding0. C05/R2/lead OFF불변, 수정실행분에는원본지문의개인확인을잘못붙이지않도록개인확인UI만비노출하며실측저장은유지한다. 수정0은기존개인확인흐름을그대로유지한다.

Chrome실제컴포넌트375/1440에서수정titlefocus·200g→0.2kg자동환산·0.19kg적용·버튼focus복귀·완료추정143g표시·닫기/재열기값유지·가로넘침0을확인했다. callback형fixture이며운영DB저장/인증HTTP종단이라고세지않는다. 현재미커밋후보이고타입/빌드최종·PR/머지·배포는아직이다.

실행분 후보 최종: 합동14파일159검사PASS, SQL10PASS, typecheck/build exit0(기존4경고), 변경ESLint 오류0/경고0, diff check0. Chrome모바일375/데스크톱1440·최종시트폭640/가로넘침0. 임시route제거·dev서버종료. 실행분/완성무게2 migration 모두운영미적용이며v85잠금유지.


## 21:17 UTC 최근 영양 후속 후보와 제한

실행분수정 [PR1784](https://github.com/netsus/homecook/pull/1784)는21:11:24UTC master `0faf17976b68ddaaabc33f5ca9d667066e18aabb`로머지됐다. 운영배포0·스키마적용0. 새후속branch `codex/recent-youtube-nutrition-partial-20261017`는0faf기준이다.

최근공개6개에는quantity-v4가섞여있어첫묶음의보수적whole-recipe guard로여전히전체계산을멈추는원인이남았다. 후속은확실한직접질량/부피만복구하고불량/estimated/unavailable/failure-reason/frozen-batch수량은그행의amountnull로둔다. raw→현재량→normalized의단위/수량일치도검증한다. anyv4이면v4계산기를사용해옛숟가락/개환산으로바꾸지않고, 제품은기존별도원천준비상태를유지한다. 기존persistedsnapshot·private·권한경계는변경0이다.

기존공개audit응답+로컬DB승인profile35행을읽기전용으로대조한기본레시피전체량개발계산: 카레6/12·바비큐1/8·두부볶음1/13·잡채1/15반영으로partial복구. 만둣국0/11·소갈비찜0/14는확실한질량과정확원천조합이없어unavailable유지했다. 원audit는행별scalable를보관하지않아이진단은기본전체량만검사했으며선택인분벡터/실시간운영결과나실측전체영양으로세지않는다. 임시개발검사는제거했고결과 `/tmp/homecook-recent-partial-local-results.json`에보존했다.

최신공개상세재조회는자동승인검토가‘식별자의운영도메인전송에별도승인이없음’으로거절했다. 해당재조회는실행되지않았고재시도/우회하지않았다. 기존공개자료와local-read-only계산으로독립검증을계속했다. 운영수정·외부건강정보전송·새영양숫자채우기0.

최근최소연결후보: 만둣국의옛식용유 `93a5ea7e-4880-5940-af82-6bbc8d6ee680`와바비큐의일반오일 `22d40e7b-f3f2-54a7-a594-0962ed1c2ad1`을현재식용유 `d6d92b38-853f-43c2-b2e1-2b4a591de334`로정확연결하는2행만우선대상이다. 원문/양/특수오일/과거pin은보존하고실제쓰기전target·원본JSON/판본·백업·dryrun을담당자가확인해야한다. 지금은준비후보이며적용0이다. 냉동만두/해물육수코인은실제catalog가있어도승인profile없음, 조청도profile없음. 기존공공원천의여러브랜드만두/배주스/조청유과를이재료와동일하다고매칭하지않았다.

[농촌진흥청공식DB안내](https://www.nics.go.kr/food/kfi/fct/fctIntro/list?menuId=PS03562)는2026-10-17확인했다. 개별식품/제조사기준량을확인하지못한영양숫자를이안내만으로채우지않는다. source/profile보완·최근대상최소데이터쓰기·실제인증저장종단·운영반영은미완료다.


## 21:18 UTC v85 보존 검사 관련 즉시 보고

부모의운영인증/프로필변경충돌질문에기존기록만대조했다. 첫묶음PR1781의20:34:33UTC머지전에이작업이운영Chrome의기존로그인된요리화면과공개레시피상세를읽었다. 정확한탭오픈시각은현재기록에없다. 로그인/프로필수정/요리완료저장클릭은하지않았다. 페이지진입만으로브라우저내Auth background갱신이일어났을가능성은배제할수없고요청별network로그가없어auth.users지문변화의원인이라고단정하지않는다.

그후화면QA는127.0.0.1:3187의QA더미환경으로진행했고개발서버는종료했다. 운영API재조회는승인검토에서실행전거절됐으며최근SQL은모두끝난READ ONLY/rollback조회뿐이다. 진행중인운영shell/API요청은없다. 하위reviewer는로컬코드/검사만수행했고운영DB/Chrome접근없음을보고했다.

현재부터운영접근/로그인/세션갱신QA/운영쓰기를중지한다. 남아있을수있는자기소유운영확인탭의닫기를시도했지만Chrome연결이Debugger unattached로닫힘을확인하지못했다. 재연결/새로운운영페이지진입은하지않는다. 부모/사용자가기존운영요리확인탭을직접닫아주어야백그라운드갱신가능성을확실히제거할수있다. 정확한계정/사용자식별자/토큰/환경값은출력하지않았다.


최근부분영양 후속 최종:4파일84검사PASS, typecheck/build exit0(기존4경고),변경ESLint0·diffcheck0,독립리뷰1건수정후finding0. 운영중지요청뒤새운영접근0. 검사용자기소유networkless/tmpfs PostgreSQL컨테이너는exactID·label·networknone재확인후제거했고기존운영/dev컨테이너는건드리지않았다. 임시route와진단test도제거했다.

배포 인계 주의: 두 새 migration 중 실행분 수정에는 function-body hook을 위한 동적SQL과scope-chain변경이 있어일반추가형fastDB분류로바로통과한다고가정하면안된다. `scripts/lib/prelaunch-database.mjs`는procedural/dynamic SQL을별도reviewedDB절차대상으로분류한다. 현재별도운영DB readiness·전체schema·실제인증HTTP종단은미준비/미실행이며배포설정/validator를완화하지않았다. 잠금해제후담당자가정확한기준DB/head와백업을확인해검토된DB반영을직렬화하고웹은승인된pnpm deploy:dev경로를사용해야한다.

## 21:25 이후 후속 — 운영 접근 중단 유지

- PR1785를 `3e3e18b5961e5154e09bc33a30e6682521f40095`로 머지했다. 부모 메시지 전달 도구는 다시 `thread not found`라 직접 전달되지 않았으며 본 기록과 최종 응답으로 인계한다.
- 거절된 읽기는 canonical recipe UUID 6개를 `https://app.mumeok.kr/api/v1/recipes/<UUID>` 경로로 보내 최신 공개 영양 payload를 확인하려던 Python urllib GET이다. 인증/user/session/token은 보내지 않는 요청이었으나 자동 승인 검토가 로컬 DB 유래 식별자의 외부 전송에 대한 명시 승인이 없다고 거절했다. 실행 전 거절, 출력 파일 없음, 재시도·우회0. 이후 운영 사이트·DB·Chrome·인증 재접근0이다.
- 전체 스키마 격리 재생은 고정 PG17 이미지, network none·port0·mount0·실제 credential0의 새 컨테이너만 사용했다. 파일별 transaction·UTF8·표준 플랫폼 fixture를 맞춘 후 기존 `20261009130000_ingredient_piece_unit_evidence.sql`의 `PIECE_UNIT_FUNCTION_BASELINE_MISMATCH: build_recipe_nutrition_input_guard_pre_product_20260922`에서 중단됐다. 새233/234에 아직 도달하지 않아 전체 스키마 성공이라고 표시하지 않는다. 실패 직전 스키마는 합성 데이터 없는 schema-only `/tmp/homecook-cooking-full-schema-before-failure.sql`, 결과는 `/tmp/homecook-cooking-full-schema-report.json`, 로그는 `/tmp/homecook-cooking-full-schema.log`다. 새 소유 컨테이너 모두 정리 확인.
- 기존 최소 fixture의 mass12·execution10 PASS와 전체 스키마 차단은 별개다. 기존 migration의 hash fence를 완화하거나 skip하지 않았다. [적용·복구 계획](cooking-experience-database-transition-20261017.md)을 따로 남겼으며 fastDB 적용은 하지 않는다.
- 로컬 미반영 cooked-weight-veto의 두 코드 hunk와20개 회귀를 독립 worktree에 이식했다. 단순 MIX 태그라도 실제 가열/배수 지시가 있으면 100% 폐쇄혼합 추정을 거절한다. 이미 준비된 ‘구운 참깨/삶은 달걀’ 명사는 가열 지시로 확대하지 않는다. 관련58 PASS, typecheck/lint 성공. 원 worktree·과거 증거 문서는 수정하지 않았다. PR/merge 상태는 후속 기록 참조.
- 137개 고유 후보 브랜치는 중복 커밋 제거 후511개다. [커밋별 읽기 대조](data/local-change-necessity-review-20261017.json)에 master 역사상 postimage 존재와 미일치 runtime 경로를 남겼다. 역사에 있다는 것은 현재 동작 검증을 대신하지 않는다. 필요 변경 모두 머지 요청은 계속 열린 항목이며 미검토 후보를 완료로 처리하지 않는다.
- [최근 재료 연결·출처 검토](recent-nutrition-source-review-20261017.md): 운영 backup/data 변경0. 정확 식용유 연결2행은 차후 최소 백업·현재 revision 확인 후 반영 후보다. 제품/원료 불명 항목은 source 확보 전 보류한다.

후속 veto 검증: 작성자58 PASS, 독립 리뷰63 PASS·finding0, typecheck/build exit0(기존4경고), 변경 ESLint0. 화면 구성 변경은 없으며 앞선375/1440 Chrome 흐름 검증에 더해 서버의 가열·배수 판정만 보완한다. 전체 격리 재생 [기계 기록](data/cooking-full-schema-validation-20261017.json)은 기존 fence 실패와 미도달233/234를 그대로 보존한다.

## 격리232→233/234 후속 검증

- 원 migration 파일은 변경하지 않았다. fresh212→213 실패는 기존 검증기의 exact fixture로 분리했다. 같은 본문/owner/ACL에 `search_path`의pg_temp가추가된차이이며, before정의md5 `4afb4fcc…`·본문SHA `12d47c74…`·속성을확인한뒤 역사형으로복원하면 원 fence `86f9d5ec…`를통과한다. 다음214는schema/함수/owner/ACL등의정확catalog지문불일치로실패한다(expected81362d75…,actual67e4a441…). 재료데이터누락이원인이라는초기추정은철회한다. 현재진단runner는기존catalog검증기의역사별실행role/단일backend를완전히재현하지않아그차이까지원인으로확정하지않았다. [fresh 진단](data/cooking-fresh-replay-diagnosis-20261017.json)은 이 실패를유지한다.
- 이미보존된 schema-only228 dump `b92a1bc3…`와password없는roles `a37b4386…`를검증해새PG17 networknone/port0/mount0에복원했다.153테이블/0행확인후 원본229–232를적용하고 기존승인109함수inventory의body/owner/ACL/config/security/volatility 누락·차이0을확인했다.
- 원본233/234 실제DDL을적용한전체schema 회귀25 PASS. 실제service_role 호출·실행분저장/새조회·원본불변·배율1회·g/kg동등성·실측/추정/미확인·부분영양·식사영양저장·멱등·취소/완료상태·stale/타인/위조·철회/탈퇴중/세대교체·read-only·수정/완료경합을확인했다.
- 기존public/private함수432개는정의와메타데이터가모두같다. 의도한기존4개만body변경, 신규6개이며 기존owner/ACL/config/volatility보존·scopealias OID/본문보존을검사했다. [후보postimage](../security/cooking-experience-source-function-postimages.json)는운영승인또는기존보안gate대체가아니다.
- 실제DDL뒤강제오류after233/after234는전체rollback했다. COMMIT후연결종료복제본은읽기로committed상태를확인하고DDL재전송0이었다. COMMIT ACK유실재현은아니다. 개인확인수집control OFF/0행·소유컨테이너cleanup확인. [검증보고](data/cooking-schema232-regression-20261017.json).
- 독립리뷰지적2개는수정했다: ACK검증범위표현정정, 실행시작RUNNING/runId및실패/cleanup실패의최종FAIL기록. Docker없는PATH실패에서이전PASS가남지않고새FAIL이기록되는것을확인했다. 초기회귀fixture의source·완료시간·응답shape/경고계약을수정했으며제품/SQL제약완화는0이다.
- 관련API/UI/계산기70 PASS, 로컬runtime의미검토기존회귀196 PASS(서로중복가능). 타입/변경lint통과. 이번후속은검증도구/문서만변경하며기존375/1440 Chrome증거범위를확대하지않는다.
- 이fixture의과거canonical pack에는 `beforeMatchesApproved=false`가있다. 이번109함수의실제PASS와구분하며, 현재운영232전체동등성·원deployledger/PIN·실제인증HTTP까지통과했다고주장하지않는다. 운영접근/배포잠금·C05/R2/lead OFF·공개UUID GET보류는유지한다.
- 최근영양연결2행·원천보류의 [구체반영계획](data/recent-nutrition-link-plan-20261017.json)을기록했다. backup/운영쓰기0이며실행가능UPDATE가아니다. 나머지runtime의미검토는첫5개분류후138개남는다.


## 격리 검증 병합과 로컬 검토 후속

- 검증/문서 묶음 [PR1787](https://github.com/netsus/homecook/pull/1787)은 `de177e14ca878a24f94db5a1741c1e7dff77394e`로 master 병합했다. 원 migration 파일 변경0, 운영 조회/쓰기·배포0이다.
- C05 관련 runtime 후보5개를 독립 읽기 검토해 소유자 보류로 분류했다. 현재 기능 대체/불필요 판정이 아니며 후보 코드·SQL은 머지하지 않았다. [분류 근거](local-change-inventory-20261017.md#runtime-의미-검토-두-번째-묶음--c05-5개-소유자-보류). 미검토133개와 별도 보류 항목은 계속 열려 있다.
- 9개 개선의 코드 병합과 운영 완료를 구분한다. 최근 영양2행의 현재 before-image/백업/CAS 반영, 현재 운영232 동등성/실제 인증 HTTP, DB233/234와 웹 배포는 v85 잠금 해제 및 부모 직렬 조율 전 대기다.


## Runtime 저장 fallback 검토

기존 후보 `444fe1f6f` 중 저장 RPC 부재/PGRST202 뒤 전역 service-role fallback만 사용자 권한으로 좁혔다. 이전 두 회귀 실패를 확인하고 최소 수정 후 관련24 PASS·독립 route23 PASS·타입/lint를 확인했다. 원자 RPC/세션 경로와 API 계약은 불변이다. 기존 public read 정책 두 경로는 별도 보류이며 전체 옛 patch를 가져오지 않았다. 미검토132건은 수정 필요 건수와 다르며 부분 검토 보류1건도 열린 상태다. 실제 인증/운영 쓰기/Chrome 접근·배포0이다. 배포 도구 fixture의 import collection 실패는 [별도 기록](local-change-inventory-20261017.md#runtime-검토-세-번째-묶음--저장-fallback-최소-이식)을 따른다.


## 로컬 후보 후속 분류와 남은 조사

- 저장 fallback 보완은 PR1789(`634fa5b99`)로 병합/운영 미반영이다. 마케팅/lab13개·추출 prototype6개·알림 UI14개·역사SQL8개의 읽기 검토를 [근거와 함께 기록](local-change-inventory-20261017.md#runtime-검토-네-번째일곱-번째-묶음--재머지와-보류-구분)했다. 당시 판정 대기91건은 필요 수정 건수가 아니며 조사4건과 별도 보류/부분 후보는 열려 있다.
- 반복 기름 투입에서 총량 확인 경고가 없는 P2 합성 사례를 재현했다. 기존 후보4420a222c를 중복으로 닫지 않고 원천·adapter/UI·저장 경계 조사에 남겼다. 추출기/worker 변경과 모델 호출0이다.
- fresh214에는 역사 실행 actor/함수owner·ACL 차이의 단서가 있다. 보존된 schema-only228의 helper3개 owner는 supabase_admin이고 postgres EXECUTE가 별도이지만 진단runner는 postgres로 만든다. 기존 verifier의 actor8개를 격리 재현한 [별도 시도](data/fresh-historical-actor-attempt-20261017.json)는177에서 합성 bootstrap의 ADMIN-option 차이로 멈췄다. 214 해결/원인 확정이라고 주장하지 않는다. 시도 코드만 /tmp에 보존하고 진단runner·역사SQL·fence는 원상태를 유지했다. 개인 자료/운영 접근0, 소유 컨테이너cleanup 확인이다.


추가 역사SQL7개·알림UI17개의 현재 보호/후속 구현을 대조해 최신 판정 대기67개(미착수59+조사중8)다. 조사 메모8개는 그대로 pending이며, cached schema232와 저장소 SQL의 정의/volatility 차이는 현재 운영 장애로 단정하지 않는다. 표지 읽기 후보ce7d9dbe8는 별도 독립 worktree에서 재현·검증 중이고 아직 이 분류에 완료 반영하지 않았다.


표지 후보ce7d9dbe8의 누락은 별도 worktree에서1FAIL로 재현 후 최소 수정했다. 소유 목록은 사용자 권한, 표지의 service-only RPC/Storage만 기존 이미지 내부 scope로 처리한다. 관련23 PASS·독립23 PASS·타입/lint, 실제 운영/Storage접근0이다. 최신 판정 대기66개(미착수58+조사중8)이며 원 SQL/권한 변경은 없다. 분류 기록 PR1790은 `462f07f94`로 병합했다.


## Runtime133개 전체 1차 대조 완료 — 운영 완료 아님

필요한 최소 수정2건(PR1789·1791)은 master에 병합했고 운영 미반영이다. [최종 근거/조사28개](local-runtime-review-final-20261017.md)와 [커밋별 기계 기록](data/local-change-necessity-review-20261017.json)에 최신 집계를 남겼다. 초기133개는 runtime 재머지 불필요75·실험 보존8·정책/소유자 보류20·추가 조사28·최소 수정2개로 나뉜다. 미착수0은 모두 읽고 독립 리뷰했다는 뜻이며 필요한 변경 전체 완료는 아니다. 앞선 C055개/첫5개와 부분 수정 뒤 public-read 정책, runtime 외 나머지 파일 보류는 별도다.

async/parser 선택 회귀는67 PASS/2 기존 기대값 FAIL이며 정책/지문을 임의 변경하지 않았다. 반복 기름 총량 경고와 소수점 진행 이벤트는 pure 합성 재현만 확인했다. 현재 운영/키/DB/Chrome/배포/worker/bundle 변경0, 원 브랜치/타 작업 보존이다. 현재 운영232 동등성·실제 인증 흐름·최근 영양2행 백업/적용·233/234 DB 및 웹 배포는 v85 잠금 해제와 부모 직렬 조율 대기다.


## 요리 요구 직접 연관 후속 조사 계획

기준 master14464a83c에서28개 후보를13개 조사 단위로 묶는다. 우선순위는 저장 원문/사용자 수량4개 → 정확 별칭1개 → 반복 총량/선택·미확인/원천 worker15개 → DB replay3개 → 등록ACK3개·scope1개·이미지origin1개다. 중복 commit은 같은 단위에서만 조사하고 원13개단위/28개목록에 결과와 재개 조건을 남긴다. 실험8/기존정책20은 활성화하지 않는다.

성공 기준은 현재 UI→입력→저장/재조회→요리 영양 경로의 작은 회귀 또는 현재와 다른 정책/authority/봉인 대상이라는 구체 보류 근거다. 필요 수정만 별도 검증·리뷰·병합하고 운영접근·DB/인증/웹배포는 계속0으로 유지한다.

core의 수정 전masterd55f20562와 현재14464a83c를 독립 checkout에서 같은5파일로 새 실행해 각각67 PASS/2 FAIL(exit1)을 확인했다. 실패 본문 전체가 동일하고 관련 제품/검사 차이는 저장/표지4파일뿐이다. [기계 대조](data/runtime-core-baseline-comparison-20261017.json). 기존 기대값·정책·지문 변경0이며 새 전체green 주장0이다.


## 직접 연관28개 후속 — 독립 조사 범위 종료

[28개/13단위의 구체 결과·중복·재개 조건](cooking-related-runtime-followup-20261017.md)을 기록했다. 현재 수량UI/서버34 PASS·정확연결/ACK87 PASS·순수AST7개는 사용자 수량권위 보존을 뒷받침하며 optional 선택정보 소실은 additive 계약 보류다. v85 봉인worker15개·DB source/cached 차이3개 등은 구체 재개조건으로 남긴다.

표지 origin 공백만 추가 최소 수정해 PR1793(`4446d01fc`)으로 병합했다. same-origin GET은 매 요청 현재 책 소유권/registry/path/state와 파일한도를 확인하며 reader 상대경로도 유지한다. 관련57 PASS·독립57 PASS·type/lint/build0. 실제auth/Storage/Chrome·운영반영0이다. Anti Slop는 기준master와같은 기존5개로exit1/신규표지0/baseline변경0이다.

초기133개 최신분할은 최소수정3·runtime재머지불필요75·실험8·정책/owner보류23·추가조사24이며 미착수0이다. ACK동일3개만 새server확장보류로 옮겼고 기존실험8/정책20은 활성화0이다. 필요한변경전체/운영완료는false다. core는수정전d55f20562·중간14464a83c·최종4446d01fc 모두67 PASS/2동일기대FAIL이며 마지막실패본문도정확동일하다. 현재잠금에서독립실행가능한조사범위는끝났고 표의source/worker/catalog/운영조건을따라재개한다.
