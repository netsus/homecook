# R2 Stage 4 프론트엔드 인수 기록

작성 작업: `01a08e24-2609-77e2-b303-3fb8bd6223e8`, frontend-implementer.
조정 작업: `01a07316-265c-7f22-b0af-fa22b7fb2b8a`.
현재 상태: **Stage 4 작성자 구현·검증 자료 인계 준비 완료, Draft 유지**. 최신 R2-AP-001 수정 code commit은 `2fa7547557554ad96b029b6fc00907fe7f350baa`다. 이전 동결 인계 head는 `3d1054b39c615fccd6a1541aad6256e45ec18f28`이다. Stage 4 전체 승인, 독립 authority·Stage 5·Stage 6 승인, Ready, 병합, 배포를 뜻하지 않는다.

## 선행 입력과 소유 범위

- 공식 r2.1 계약: `7f00e62c13572b5b2c0d54c997fe628f7a56567e` / PR #1551.
- Stage 1 merge: `fa7848924442df2790592b14875ccb6148e0c6ba` / PR #1550.
- Stage 2·독립 Stage 3: exact reviewed `09413ba38ee6d1c69925b1c479ce44e03e6885cd`, reviewer `01a08d65-e8dc-74c0-8d0e-3c8a96c1ac00`, PR #1552 merge `7312a0cc9cfe1f500d896eb806e4d533a4f068b9`.
- 이 문서보다 앞선 README/metadata의 Stage 1 Draft·미착수 표현은 당시 작성 이력이다. 선행 단계를 다시 시작하지 않았다.
- 이번 작업은 두 경로의 화면·브라우저 연결·검증과 Draft 인계만 소유한다. 운영 DB, 배포, 광고, 실제 provider/메일, Discord, 독립 Stage 승인은 실행하지 않는다.

## 구현

`app/beta/r2/[topic]/page.tsx`는 exact 주제·비활성 404·서명 문맥을 기존 서버 helper로 연결한다. GET은 DB를 호출하지 않는다. `middleware.ts`는 beta 경로 안에서 R2의 인코딩 별칭과 잘못된 경로만 거부하며 기존 v2 동작을 유지한다.

`components/marketing/round2/`는 MENU·세 활동·세 DONE·원 화면의 RECOVERY를 두 주제로 렌더한다. 메뉴는 bootstrap 전에 SSR로 보이고, 설문/예시 열기와 저장을 분리한다. 공식 네 질문과 동의 문구는 Stage 2 공용 상수를 소비한다. 예시는 기존 음식 자산과 준비된 세 장면만 사용하며 실제 제품 mutation을 하지 않는다.

`lib/marketing/round2-client.ts`와 저장소 adapter는 API 확정 완료만 반영한다. 낮은 revision, 참여 교체, 같은 요청 재시도, 전체 POST 직렬화, 탭별 draft, 이메일·동의·토큰의 메모리 수명을 관리한다. 기존 `round2-session.ts`도 변경했다. bootstrap pending과 활동 outbox 합계 50개를 같은 IndexedDB transaction으로 검사하고 만료 때 함께 정리한다. Stage 3에서 검증한 helper의 변경을 숨기지 않으며 기존 HTTPS 저장소 회귀와 새 실제 두 탭 검증을 함께 수행했다.

저장소 오류는 현재 유효 cookie_resume을 확인한 경우만 메모리 활동을 허용한다. 새 참여 fallback은 없다. 다른 탭이 새 참여를 만들면 이전 참여의 draft/outbox 쓰기와 POST를 차단한다. 오래된 410은 새 key/draft/outbox를 지우지 않는다. 410 이후 명시 재시작과 캠페인 종료를 구분한다.

R2 전용 Turnstile은 topic별 action·서버 제공 site key, 150×140 compact 크기와 메모리 callback을 사용한다. 자동 hidden token 입력은 만들지 않는다. 스크립트 실패 뒤 명시적인 재시도 버튼을 제공한다. 기존 v2 위젯은 수정하지 않았다.

공통 `ProviderMemorySync`에는 R2 경계만 추가했다. R2 직접 진입에서 새 인증 동기화를 시작하지 않고, SPA로 일반 앱에 돌아오면 재개한다. 일반 앱 사이 이동은 추가 동기화를 만들지 않는다. 일반 앱에서 이미 시작된 요청의 소급 취소를 보장한 것은 아니다.

전역 CSS·기존 `/beta` 계약·DB schema·쿠키·설문 상수는 변경하지 않았다. 새 의존성도 없다.

## 최종 Stage 4 검증

| 검증 | 현재 근거 |
| --- | --- |
| TDD | 메뉴/설문/직접 신청, 지연 완료의 화면 이동, provider 재시도, 인증 경계, IDB 합계50·탭 복제·stale 삭제/쓰기의 RED→GREEN 원문 보존 |
| 정식 PR 빠른 gate | 마지막 수정 후 `verify:frontend:pr` exit0. lint/typecheck, 제품7,827 PASS/516 환경별 skip, build, core smoke65 PASS/10 skip, core a11y11 PASS/4 skip, core visual15 PASS. 3기기 축소 없음 |
| R2 frontend | 초기117 PASS/브라우저 opt-in1 skip 및 이후 중복CTA 회귀2건 포함 최종 전체제품 통과. 별도 client/storage/session 실제 Chromium 포함55 PASS/skip0 |
| 백엔드 회귀 | 기존 R2 단위 201 PASS, 기존 HTTPS 브라우저 저장소 회귀 PASS |
| 실제 UI·DB | 원형 Next GET/POST → 기존 SDK/RPC → 새 isolated DB의 24조건 PASS. 194 API 요청, 23참여, fixture provider15회, 외부0·page error0, 기존 accepted fixture1row checksum 보존 |
| 실제 오류 | 409 동의 갱신, 410 명시 재시작, commit 응답 유실의 동일 event 재시도, 실제 429 대기, cookie_resume. 두 topic×4폭 RECOVERY8장 |
| 최종 production preview | code c00fa23f에서 단독 build→680개 compiled tree 동일 복사,31/31 PASS,68캡처(100%64장+320px LEAD/LEAD_DONE200%4장)·axe·44px·가로overflow·keyboard·reduced-motion. POST/외부/IndexedDB/local/session storage0. 최신loopback3118 |
| 브라우저 뒤로/앞으로 | 두 topic 실제 Back/Forward 2 PASS, 최종31개 preview 검사에 포함 |
| 보조 리뷰 | 지연 응답 이동·stale 참여 삭제/쓰기·보안 재시도 수정 후 71 PASS / skip0, 추가 수정 요구0. 독립 Stage 승인이 아님 |
| 공통 성능 | 안전한 빈 포트3120에서 기존 설정·budget 그대로 3회×2URL PASS |
| 기존 전체 회귀 | 1,019 PASS / 189 skip / 7 fail. 선택 재실행 17 PASS / 3 skip / 기존 좁은 화면 geometry4 fail. exact base7312a0에서도 같은4건·같은수치 재현. PASS나 N/A로 바꾸지 않음 |
| 전체 추가 gate | 접근성21 PASS/15 skip, security12 PASS. 전체 visual15 PASS/23 skip/10개 desktop 상세snapshot 실패. exact base에도같은10실패,9건은크기·픽셀수동일,meal detail은높이+260px동일/픽셀수차이보존 |
| 탐색 QA/eval | 정식빠른gate green뒤2topic×3viewport6경로직접탐색. R2-QA-001 중복저장CTA 해결, actualAPI오류2조건/8캡처 재확인. 보고서coverage평가99 PASS(42/43 covered, 독립검토1 blocked 유지). 디자인authority점수가 아님 |
| 독립 검토 | authority_precheck/Stage5/finalauthority/Stage6 pending. complete gate의baseline실패는open으로유지하고영향분류를독립reviewer에위임 |

검증 상세와 실행 예외는 [retained evidence](../../../.artifacts/r2-stage4/verification/manifest.json) 및 [실행 예외](../../../.artifacts/r2-stage4/verification/verification-exceptions.md)를 따른다. 초기 고정3100 Lighthouse가 기존 개발 배포 서버를 읽은 결과는 이번 candidate 증거에서 제외했다. 기존 서버를 종료·변경하지 않았고, 이후 모든 검증은 비어 있는 별도 포트에서 재사용 없이 실행했다. Next dev의 Cache-Control 덮어쓰기와 실제 production의 `private, no-store` / `no-referrer`도 구분한다.

## 최종 QA와 source 연결

- [QA 보고서](../../../.artifacts/qa/marketing-demand-validation-round2/stage4-20260911/exploratory-report.json), [QA eval](../../../.artifacts/qa/marketing-demand-validation-round2/stage4-20260911/eval-result.json), [직접탐색관찰](../../../.artifacts/qa/marketing-demand-validation-round2/stage4-20260911/exploration-observations.json).
- [구현·검증 source 파일](evidence/stage4/source-manifest.json), [작성자stage-result](evidence/stage4/stage4-result.json).
- [기존geometry 기준재현](../../../.artifacts/r2-stage4/verification/baseline/baseline-review.md), [기존visual 기준재현](../../../.artifacts/r2-stage4/verification/baseline-visual/baseline-visual-review.md).
- [선행Stage3 retained사본](../../../.artifacts/r2-stage4/verification/stage3-input/retention-manifest.json). 서버·공용계약·SQL9파일이exact reviewed09413과같음을확인했으며396 SQL assertion을Stage4에서재실행했다고말하지않는다.
- 초기PR template reference표기오류는본문의exact work-item JSON경로로수정했다. 최초실패이력과최신current-head CI는구분한다.
- 중간전체제품실행의기존personal-recipe-editor focus실패1회는수정없이동일정식빠른gate전체를재실행해7827 PASS를확인했다. 실패원문과재실행을모두보존하며원인을단정하지않는다.

## 화면 근거

- [production build 미리보기 68장](../../../ui/designs/evidence/marketing-demand-validation-round2/stage4/production-preview/manifest.json)
- [기록 메뉴](../../../ui/designs/evidence/marketing-demand-validation-round2/stage4/production-preview/recording-390x844-MENU.png), [집밥 흐름 좁은 메뉴](../../../ui/designs/evidence/marketing-demand-validation-round2/stage4/production-preview/homeflow-320x568-MENU.png)
- [실제 오류 화면](../../../ui/designs/evidence/marketing-demand-validation-round2/stage4/real-recovery/)

정적 설계와 실제 실행은 다른 근거다. preview의 local consent validation 이미지는 실제 서버 오류의 대체물이 아니다. Full-page 캡처의 이미지 높이는 자연 스크롤 전체이며 실행 viewport는 manifest에 기록한다. 일부 실제 오류 캡처의 Next dev N 표시는 개발 도구다. 모든 runtime authority는 독립 검토 대기다.

## 재현

패키지 매니저는 `corepack pnpm` 10.32.1, 기존 3443 runner는 직렬 실행한다.

1. `corepack pnpm install --frozen-lockfile`
2. `corepack pnpm test:marketing-round2:frontend`
3. `corepack pnpm test:marketing-round2:client-browser`
4. `corepack pnpm verify:marketing-round2:browser-storage`
5. `corepack pnpm verify:marketing-round2:ui-isolated`
6. 비어 있는 루프백3117에서 `MUMEOK_ROUND2_LOCAL_PREVIEW=true NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_ANON_KEY= corepack pnpm exec next dev --hostname 127.0.0.1 --port 3117`, 다른 터미널에서 `corepack pnpm test:e2e:marketing-round2`.

미리보기 자동화는 호출자가 소유한 서버만 사용하며 다른 프로세스를 종료하거나 암묵적으로 재사용하지 않는다. 실제 통합 runner는 `.env`를 복사하지 않고 새 UUID isolated DB·rate/control·테스트키만 생성한다. 실제 운영 project `homecook-full-local-isolated`와 volume `homecook-full-local-postgres`는 테스트 대상으로 선택하지 않는다.

## 독립 검토·운영 인수

Draft PR은 [#1555](https://github.com/netsus/homecook/pull/1555)다. 최종PRhead/CI는GitHub의현재head와마지막인계메시지를기준으로확인한다. Design Status는 pending-review다. 작성자와 native 보조는 독립 authority/Stage 5/Stage 6를 대신하지 않는다. 조정자가 별도 reviewer에게 정확한 PR head와 retained evidence를 전달한다. 새 작업을 직접 만들거나 merge-ready·confirmed를 자기 승인하지 않는다.

실제 provider·실기기 인앱/키보드·이미지/영상 사용권·공개 개인정보 운영 준비·운영 activation/DB 적용/배포/메일은 Manual Only다. 테스트의 mock provider 성공을 실제 발송이나 이메일 소유 확인으로 표현하지 않는다. Web Locks 미지원 브라우저의 탭 간 동작은 실제 기기 확인 범위에 남긴다.

## 독립 precheck 수정 R2-AP-001 (2026-09-11)

음식 띠의 고정 높이가 200% MENU 설명을 잘랐다. CSS의 `height:72px` 한 속성을 `min-height:72px`로 바꿨다. 승인 문구·글자 크기·정보 구조·CTA 순서는 그대로다. 100% 8개 메뉴 캡처는 수정 전후 byte동일이며 200%에서는 320폭의띠142px,390폭100px로늘어나 실제상하clipping0이다.

- [수정 결과와 source/build 정보](evidence/stage4/r2-ap-001-result.json)
- [before/after 32캡처와 hash](../../../ui/designs/evidence/marketing-demand-validation-round2/stage4/r2-ap-001/screenshots.json)
- [실측 RED](../../../ui/designs/evidence/marketing-demand-validation-round2/stage4/r2-ap-001/geometry-red.json), [실측 GREEN](../../../ui/designs/evidence/marketing-demand-validation-round2/stage4/r2-ap-001/geometry-green.json)
- 두topic × 320/390 × initial/completed MENU: 200%8조합 RED→GREEN. 기존31개와함께39/39브라우저PASS, production build·타입·lint통과.
- 수정본은 별도소유루프백3124에서 제공한다. 독립reviewer가사용중인3118동결복사본은재시작하거나변경하지않았다.

확대 검증 범위: 기존68PNG 전체가200%였던것이아니다. 100%4폭매트릭스64장(7정상상태와로컬동의오류)과320px LEAD/LEAD_DONE200%4장이었다. 이번에MENU initial/completed의두topic320/390px 200%8조합을추가했다. 그외화면·폭의200%전수PASS는주장하지않는다. 이전QA보고서와평가원문은repair폴더에보존하고현재QA보고서에같은범위를정정했다. 전체독립precheck는진행중이며이수정의작성자검증이승인을대신하지않는다.

## R2-AP-002 실제 오류 확대 근거

제품fd9c4827을변경하지않고 실제409동의갱신/commit응답유실2조건×4폭의200%8조합을추가했다. [고정패키지](../../../ui/designs/evidence/marketing-demand-validation-round2/stage4/r2-ap-002/README.md)에full-page8장·같은조합CTA상세8장, geometry8개,캡처소스hash·최종guard차이·cleanup을보존했다. 정적텍스트clipping/가로overflow0, CTA실제hit-test와입력/장면보존을확인했다. 마지막완전성guard는저장된실측에직접적용했고불필요한UI/DB재실행은하지않았다. 3118/3124는유지하며전체독립리뷰승인은계속대기다.

## 독립 authority_precheck 원본 이식

검토자 `01a08e8f-6c04-7233-a12c-b256f460e6cb`가 exact `783ae392c648ed43d481e2166c6f42f0cc0a7912`에서 precheck PASS/required0, R2-AP-001/002 closed를 반환했다. [원본 결과](evidence/stage4/independent-precheck-01a08e8f/precheck-result.json)와 [이식 검증](evidence/stage4/independent-precheck-01a08e8f/import-verification.json)을 보존했고 보고서8개/evidence subtree는 byte그대로 복사했다. 원본 판정을 작성자가 수정하지 않았다. 검증기의 엄격한 비초안 검사에서 발견한 evidence 표기/서술형 요구사항 호환 문제는 같은 이식 기록에 남겼으며 임의 수정하지 않았다. 완료 표시는 precheck에만 한정한다. public Stage5·final authority·confirmed·전체 acceptance·Ready·merge는 대기하며, Stage5 결과와 함께 commit/push할 예정이다.


## Stage5 R2-S5-001 수정과 최종 재검토 인계

독립 Stage5는 exact783ae392에서 이메일/동의 편집 후 재시도가 실제 요청 없이 성공을 반환하는 required finding을 발견했다. [독립 원문과 재현](evidence/stage5/stage5-report.md)은 request_changes로 보존한다. 작성자는 원래 신청과 편집 초안을 분리하고, 원래 접수 확인·명시적 편집 취소·동의/보안 재확인 경로를 추가했다. 공개 API나 동의 계약은 바꾸지 않았다.

[수정 결과](evidence/stage4/r2-s5-001-result.json), [주소를 가린 브라우저 관측](../../../ui/designs/evidence/marketing-demand-validation-round2/stage4/r2-s5-001-browser/README.md), [실제 API/DB 전체28 검증](../../../ui/designs/evidence/marketing-demand-validation-round2/stage4/r2-s5-001-actual-ui/README.md)을 따른다. 과거 precheck PASS는 이번 수정본의 독립 승인으로 승계하지 않는다. 코드 `7bfe0d3b48f771bf5c3fa26421fac54ad6e53e77`의 제품 파일은 실제 실행 snapshot과 해시가 같다. 현재 R2 단위345 PASS/7환경skip, 전체 lint/typecheck가 통과했다. 전체28은 원래24와 추가복구4를 같은 격리 실행에서 검증했고, 앞선 테스트 대기 누락 FAIL과 focused4 PASS는 별도 보존했다. 1,316개 시간순 관측·208개 파싱 응답·115회 캡처 기록(고유 PNG113개)을 구분한다.

실제 전체 실행 명령은 `--lead-edit`를 포함했다. 이후 최종 runner는 기본 선택도 같은28분기를 쓰도록 바꿨고, recovery/zoom/focused 선택 보존과 동등성을 단위검사했다. 무옵션 전체 명령을 직접 실행한 결과로 표현하지 않는다. 정식 `verify:frontend:pr`의 기존7,827 PASS는 과거 수정본의 근거이며 새 코드의 검증/현재 head CI와 분리한다. 기존 whole frontend 실패4+10개는 여전히 open이다.

원문 재현 소스5개는 실행 제품 코드와 구분한 `.cjs.txt` 보관본으로 이동했다. 내용과 해시는 유지했고, same-reviewer의 직접 링크3곳 revision을 보존했다. lint 규칙이나 검증기는 바꾸지 않았다. 별도 docs PR1556의 승인 base `8c6573bf594fa15613205ce97e4435d751c7d87c`를 merge commit `57236f26fb1665693733f78eeb7237c6c99df663`로 통합했다. 제품/검증 소스는 코드 commit과 같다. strict 검사에는 독립 보고서의6JSON 참조 누락6건만 남아 있으며, 파일의 실제 근거를 검토한 같은 reviewer가 연결한다. 작성자가 보고서를 자기 승인하지 않았다. 최종 independent Stage5 재검토·final authority·Stage6·Ready·merge·배포는 계속 대기한다.

## 독립 Stage5 승인과 고정 미리보기

같은 독립 검토자가 exact `62eff252cdd537c9a849caf1881ac490687abac3`에서 R2-S5-001 해결, approve/required0, 체크리스트17개 통과와 final authority 대기1개를 확정했다. [별도 재검토 원문](evidence/stage5/recheck-62eff252/stage5-report.md)을 이식했으며 이전 request_changes 원문을 덮어쓰지 않았다. 보고서8개는 reviewer가 제공한 revision만 적용했다. 교체 전 보고서의 원문/해시를 불변 보관본으로 연결하고, 새 재검토는 별도 명시했다. 제공된 근거 연결 뒤 strict 검사는 exit0이며 내용·해시·pointer 점검과 구분한다.

[고정 비저장 미리보기](../../../ui/designs/evidence/marketing-demand-validation-round2/stage4/r2-s5-001-production-preview/README.md)는 source62eff의 실제 페이지와 production build를 사용한다. [집밥 기록](http://127.0.0.1:3126/beta/r2/recording), [집밥 관리](http://127.0.0.1:3126/beta/r2/homeflow)를 유지하며 source2,465파일/compiled830파일 해시 일치, 빌드·내장 lint/typecheck와 독립 활동6조건을 확인했다. POST·브라우저 저장소·외부 요청은0이고 새로고침하면 완료가 초기화된다. 실제 접수/복구 증거는 앞의 별도 API/DB28 실행을 따른다. 빌드 복사 범위·의존성 경로 오류였던 앞선 두 시도도 분리 보존했다. 제품·Next/ESLint 설정·skip flag는 바꾸지 않았다.

source62eff의 GitHub 검사19개는16 SUCCESS/3의도된 SKIP로 전부 종료했다. 이후 근거 문서만 바뀐 최종 head의 CI는 해당 head에서 별도로 확인한다. 검토/미리보기 이후 제품·테스트·harness 변경은 없다.

조정 작업 `01a07316-265c-7f22-b0af-fa22b7fb2b8a`는 별도의 최종 화면 승인 작업 `01a08f0c-bbbb-74b1-ac9b-20feb1ac085f`를 실제 배정했다. 현재 검토 중이며 최종 판정은 작성자 작업에서 생성하지 않는다. Stage6는 아직 미배정이다. Design Status는 pending-review, 전체 authority acceptance·Ready·merge·배포와 기존 전체 UI 실패 처리도 대기한다.
