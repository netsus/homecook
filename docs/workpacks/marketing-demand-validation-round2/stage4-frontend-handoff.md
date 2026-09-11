# R2 Stage 4 프론트엔드 인수 기록

작성 작업: `01a08e24-2609-77e2-b303-3fb8bd6223e8`, frontend-implementer.
조정 작업: `01a07316-265c-7f22-b0af-fa22b7fb2b8a`.
현재 상태: **Draft 체크포인트**. 구현 code commit은 `a5079881f118c2b7dc00119a949b8c7e8b03b86a`다. 독립 authority·Stage 5·Stage 6 승인, Ready, 병합, 배포를 뜻하지 않는다.

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

## 검증 체크포인트

| 검증 | 현재 근거 |
| --- | --- |
| TDD | 메뉴/설문/직접 신청, 지연 완료의 화면 이동, provider 재시도, 인증 경계, IDB 합계50·탭 복제·stale 삭제/쓰기의 RED→GREEN 원문 보존 |
| 전체 제품 | 첫 안정 실행 7,822 PASS / 516 환경별 skip, production build PASS. 이후 좁은 보수는 targeted·타입 검증, 최종 재검증 예정 |
| R2 frontend | 117 PASS / 실제 브라우저 opt-in 1 skip. 별도 client/storage/session 실제 Chromium 포함 55 PASS / skip0 |
| 백엔드 회귀 | 기존 R2 단위 201 PASS, 기존 HTTPS 브라우저 저장소 회귀 PASS |
| 실제 UI·DB | 원형 Next GET/POST → 기존 SDK/RPC → 새 isolated DB의 24조건 PASS. 194 API 요청, 23참여, fixture provider15회, 외부0·page error0, 기존 accepted fixture1row checksum 보존 |
| 실제 오류 | 409 동의 갱신, 410 명시 재시작, commit 응답 유실의 동일 event 재시도, 실제 429 대기, cookie_resume. 두 topic×4폭 RECOVERY8장 |
| production preview | 루프백에서 복사한 production build의 29/29 PASS, 68 캡처·axe·44px·가로 overflow·200% 글자·keyboard·reduced-motion 통과. POST/외부/IndexedDB/local/session storage0 |
| 브라우저 뒤로/앞으로 | 두 topic 실제 Back/Forward 2 PASS |
| 보조 리뷰 | 지연 응답 이동·stale 참여 삭제/쓰기·보안 재시도 수정 후 71 PASS / skip0, 추가 수정 요구0. 독립 Stage 승인이 아님 |
| 공통 성능 | 안전한 빈 포트3120에서 기존 설정·budget 그대로 3회×2URL PASS |
| 기존 전체 회귀 | 1,019 PASS / 189 skip / 7 fail. 선택 재실행 17 PASS / 3 skip / 기존 좁은 화면 geometry4 fail. exact base7312a0에서도 같은4건·같은수치 재현. PASS나 N/A로 바꾸지 않음 |
| 전체 추가 gate | 접근성21 PASS/15 skip, security12 PASS. 전체 visual15 PASS/23 skip/10개 기존 desktop 상세 snapshot 실패(기준 SHA 비교 중). |
| 남은 실행 | 정식 PR 빠른 gate(lint/typecheck/product/build/core smoke/a11y/visual, 기기 축소 없음), exploratory QA/eval, PR head CI 진행·대기 |

검증 상세와 실행 예외는 [retained evidence](../../../.artifacts/r2-stage4/verification/manifest.json) 및 [실행 예외](../../../.artifacts/r2-stage4/verification/verification-exceptions.md)를 따른다. 초기 고정3100 Lighthouse가 기존 개발 배포 서버를 읽은 결과는 이번 candidate 증거에서 제외했다. 기존 서버를 종료·변경하지 않았고, 이후 모든 검증은 비어 있는 별도 포트에서 재사용 없이 실행했다. Next dev의 Cache-Control 덮어쓰기와 실제 production의 `private, no-store` / `no-referrer`도 구분한다.

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

Design Status는 pending-review다. 작성자와 native 보조는 독립 authority/Stage 5/Stage 6를 대신하지 않는다. 조정자가 별도 reviewer에게 정확한 PR head와 retained evidence를 전달한다. 새 작업을 직접 만들거나 merge-ready·confirmed를 자기 승인하지 않는다.

실제 provider·실기기 인앱/키보드·이미지/영상 사용권·공개 개인정보 운영 준비·운영 activation/DB 적용/배포/메일은 Manual Only다. 테스트의 mock provider 성공을 실제 발송이나 이메일 소유 확인으로 표현하지 않는다. Web Locks 미지원 브라우저의 탭 간 동작은 실제 기기 확인 범위에 남긴다.
