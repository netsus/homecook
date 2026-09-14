# 집밥흐름 선형 랜딩 로컬 구현 인수

## 체험4 요리 시작 강조 보강

팬트리 완료 안내가 사라지는 2.4초 이후, 2.5초부터 선택된 김치볶음밥 행·썸네일·메뉴 표시를 강조하고 3.5초부터 `김치볶음밥 요리하기` 버튼에 빛이 지나가는 효과를 준다. 효과는 2~3회 후 멈추며 모션 줄이기에서는 정지한다. 화면 높이·요리 시작 동작·다른 음식의 상태는 유지한다.

경험/랜딩 단위 테스트17개와390×844 전체 흐름·실제 애니메이션 진행·모션 줄이기 검증을 통과했다. 모션 캡처는 `.omx/artifacts/homeflow-linear/cooking-ready/390-emphasis.png`다. 배포·master 머지는 하지 않았다.

## 2026-09-12 광고 연결·투명 캐릭터·영양값 검증

- 광고 손그림 캐릭터 1개와 기존 캐릭터 6종의 투명 WebP 7개를 연결했다. 실제 알파 최소0/최대255와 파일별150KiB 미만을 검사했다. 원본·이전 배경 버전은 보존했다.
- 사용자 제공 김치볶음밥300g 영양은608kcal/탄56g/단25g/지32g이며 기존 예시와 합계는1,728kcal/탄202g/단97g/지70g이다. 이전600g완성량 추정은 폐기했다.
- 이미지 로드 뒤1.1초 대기+0.9초 등장, 선택 메뉴 안내, 입력칸 안쪽 포커스, 완료 캐릭터 반복 모션을 적용했다. 모션 줄이기에서는 정지한다.
- 최신 집중 검증8파일47개, 전체lint/typecheck, 프로덕션build, CSoT sync/diff 검사 통과.
- 모바일390×844/375×812/320×720의 모든 기본 화면 스크롤0,320×568은 체험에만8~97px 세로 스크롤을 허용해 잘림을 방지했다. 실제POST0과 waiting/entering/complete·줄어든 모션을 확인했다.
- 이미지·치수·모션 검증은 `.omx/artifacts/homeflow-linear/entry/`, 코드·빌드 로그는 같은 상위 폴더의 `transparent-*.log`다. 최종 시각 검토96/pass이며 독립Stage승인이 아니다.
- 배포·master 머지는 하지 않았다.

- 작업일: 2026-09-11
- 작업 브랜치: `feature/fe-marketing-demand-validation-round2`
- 범위: [PRD v0.7](./homecook-flow-round2-prd.md) / 투명 캐릭터·강화된 모션·사용자 제공 영양 표시의 로컬 후보. v4 시안과 v0.6 검증은 이전 이력
- 배포: 하지 않음. master 머지: 하지 않음. 독립 Stage 승인: 주장하지 않음.

## 확인 주소와 실행

경로는 `/beta/r2/homeflow`다. 기존 `/beta` 식단기록 랜딩을 변경하지 않았다. 기존 R2의 recording 설문도 보존했으며 새 recording 페이지는 이 작업 범위가 아니다.

저장하지 않는 로컬 미리보기:

```bash
MUMEOK_ROUND2_LOCAL_PREVIEW=true pnpm dev --hostname 127.0.0.1 --port 3217
```

`http://127.0.0.1:3217/beta/r2/homeflow`에서 확인한다. exact loopback host와 명시적 flag가 모두 있어야 preview가 열리며, query로 활성화할 수 없다. 미리보기는 실제 API/DB/Turnstile/이메일 전송 없이 `preview@example.com`으로 접수 화면까지 체험한다.

일반 모드는 R2 API와 연결한다. 운영 수집 설정이 없으면 공개 콘텐츠는 둘러볼 수 있고, 실제 제출은 닫힌 상태로 유지된다. 이 작업에서 운영 키·flag·DB를 설정하거나 실제 수집을 열지 않았다.

## 구현한 흐름

1. **베타 오픈 전 수요조사** → **테스트 → 무먹체험 → 베타신청** 안내 → **4문항 테스트하기** → Q3 기준 4유형.
2. 실제 선정 영상·재료 → 요리계획 → 구매/팬트리 제외 → 팬트리 반영 → 요리모드.
3. `요리완료! 식단기록하기` → 김치볶음밥 300g이 들어간 1차형 주간 식단.
4. **베타오픈 신청하기** → 서버가 확인한 접수 완료 → **처음으로 돌아가기**. 결과 링크 공유는 별도 읽기 화면이다. 로컬 preview의 완료는 저장 없는 예시다.

Q1/Q2에서 `직접`을 삭제하고 Q3을 **집밥은 보통 어떻게 계획하나요?**로 바꿨다. Q3 보조 설명, 재미용 결과 안내, q4=none 연결 문장은 화면에서 제거했다. 기존 r2.1은 보존하고 미배포 `r2.2-homeflow`의 표시만 조정했다.

체험 날짜는 **9/12 토요일 김치볶음밥**, **9/13 일요일 기존 두부조림**이다. 각 날짜에 아침·점심 빈 행과 저녁 요리를 보인다. 체험 2/4의 **요리계획** 제목은 캘린더 아이콘과 함께 왼쪽에 배치한다. 첫 재료 목록은 5종과 **외 4가지 재료** 펼침, 요리모드는 작은 썸네일 옆 제목과 텍스트 재료 묶음을 사용한다.

장보기는 계란만 미체크인 5체크 상태로 시작한다. 큰 제목을 숨기고 **이미있음 / 팬트리 제외 / 되살리기 / 체크하고 장보기 완료하기** 조작을 제공한다. 체험 4는 선택된 오늘 요리 계획에 **지금 요리할 메뉴**를 표시하고 **김치볶음밥 요리하기**로 연결한다. 팬트리 추가 안내는 2.4초 뒤 사라진다. 제외하면 구매 체크도 해제하며 완료 뒤에는 수정할 수 없다. 선택한 구매 항목만 팬트리 반영 상태로 확정한다. 원본 앱 데이터는 수정하지 않는 광고 체험이다.

체험 2의 요리 추가와 체험 6의 식사 기록은 이미지 로드 완료 후 1,100ms 대기하고 900ms 동안 이동·확대·배경 강조를 적용한다. 애니메이션을 실제 데이터 중복 생성이나 서버 제출과 연결하지 않는다.

## 재사용과 새 코드

| 책임 | 파일 |
| --- | --- |
| 새 페이지·공개/preview 분기 | `app/beta/r2/homeflow/page.tsx`, `lib/server/homeflow-page.ts` |
| 첫 화면·설문·결과·접수·복구 | `components/marketing/homeflow-landing.tsx`와 CSS module |
| 시안의 체험 6화면 | `components/marketing/homeflow-experience.tsx`와 CSS module |
| 문구·재료·이미지 설정 | `lib/marketing/homeflow-content.ts` |
| UI 캐시·응답 검증 | `lib/marketing/homeflow-client.ts` |
| 새 설문 버전 | 기존 `lib/marketing-round2.ts`, `lib/marketing/round2-survey.ts` 확장 |
| 새 SQL | `supabase/migrations/20260911110000_marketing_round2_linear_homeflow.sql` |

기존 R2 endpoint, bootstrap, 서명, 쿠키, 동의, 중복·기간·보관 방어를 재사용한다. `r2.2-homeflow` 설문만 추가하고 원본 migration과 r2.1 설문 의미를 보존했다. 공용 Turnstile은 site key/action을 선택적으로 받아 기존 화면 기본값을 유지한다. 새 의존성은 추가하지 않았다.

## 제공 캐릭터와 이미지 반영

현재는 첫 광고 손그림에서 추출한 hero와 캐릭터 6종의 배경 제거 파생본을 사용한다. [투명 자산 기록](./assets/homeflow-transparent-manifest.json)의 7개 WebP는 `hasAlpha=true`, `alphaMin=0`으로 실제 투명을 확인했으며 합계 **447,504B**다. hero는 540×959, 나머지 6개는 720×720이다.

원본 PNG와 기존 파란 배경 WebP는 보존한다. 이전 단순 압축 이력은 PNG 합계 **10,305,593B → WebP 193,320B**이며 원본 파일 해시는 그대로다. 이 수치는 현재 투명 파생본의 용량이 아니다. [이전 변환 기록](./assets/homeflow-characters-manifest.json)에 원본·결과 크기와 해시를 남겼다.

| 위치 | 반영 자산 |
| --- | --- |
| 첫 화면 손그림 | `/assets/funnel/homeflow/characters/hero-ad-transparent.webp` |
| 오늘의 감각형 | `/assets/funnel/homeflow/characters/spontaneous-transparent.webp` |
| 머릿속 플래너형 | `/assets/funnel/homeflow/characters/mental-transparent.webp` |
| 알뜰 메모형 | `/assets/funnel/homeflow/characters/memo-transparent.webp` |
| 집밥 설계형 | `/assets/funnel/homeflow/characters/scheduled-transparent.webp` |
| 베타 초대 | `/assets/funnel/homeflow/characters/invitation-transparent.webp` |
| 신청 완료 | `/assets/funnel/homeflow/characters/success-transparent.webp` |

최신 결과 인용문·두 줄 설명을 코드에서 읽어 PRD §9에 동기화했다. 유형·초대·완료의 투명 캐릭터를 더 크게 보여준다. 완료에는 축하 효과와 지속적인 위아래 떠오름 모션을 적용하며 `prefers-reduced-motion`에서는 정지한다. 재료 9종은 기존 `/assets/ingredients/plush-v2/` 이미지를 재사용한다.

## 사용자 제공 영양 정보

김치볶음밥 **300g = 608kcal / 탄수화물 56g / 단백질 25g / 지방 32g**은 최신 사용자 제공 값을 사용한다. 기존 아침·점심 시연 합계 **1120kcal / C146g / P72g / F38g**에 더해 **1728kcal / C202g / P97g / F70g**을 표시한다. 작은 **영양정보 · 체험 예시** 안내를 유지하고 별도 실측 검증을 완료했다고 주장하지 않는다.

[영양 표시 기준](./homeflow-demo-nutrition.md)에 기존 시연 데이터·사용자 제공 값·합산을 구분했다. 앞서 논의한 재료별 추정과 완성 600g 가정은 폐기했으며 해당 상세 UI도 삭제한다. 실제 음식 DB·API 계약은 바꾸지 않는다.

## 신청 화면

**[필수] 이메일 수집·이용에 동의해요.** 체크와 **수집 목적과 보유 기간 보기** 펼침 영역을 사용한다. 펼침에는 베타 오픈 알림 발송 목적, 이메일 주소·신청 주제·동의 기록, **2026년 11월 30일까지·철회 시 삭제**를 표시한다. homeflow의 별도 개인정보처리방침 링크와 14세 안내는 제거했지만 서버의 consent 필드·검증·보관·동의 제약은 유지한다. 다른 R2의 공용 안내는 변경하지 않았다.

CTA는 **베타오픈 신청하기**다. 이메일 포커스 테두리는 `outline-offset: -3px`로 입력 안쪽에 그려 외곽 잘림을 막는다. 접수 완료에는 큰 성공 캐릭터·축하·반복 떠오름 효과·**처음으로 돌아가기**를 표시한다. 처음 이동은 기존 서버 완료를 지우거나 새 참여를 자동 생성하지 않는다.

## 수집·복구 보호

- 이메일·동의·Turnstile 토큰을 UI 영속 캐시에 저장하지 않는다.
- 설문 초안과 성공 응답이 확인된 답변을 구분한다. 다른 탭의 완료를 현재 초안의 결과로 표시하지 않는다.
- 캐시가 없거나 기존 r2.1 참여가 이미 완료한 경우 유형을 지어내거나 답변을 덮어쓰지 않고 체험으로 복귀한다.
- 결과불명 신청은 입력·동의·뒤로가기를 잠그고 같은 event/payload로 확인한다.
- 확정 실패 뒤 수정한 이메일과 현재 동의를 재시도에 적용한다.
- 완료 충돌은 최신 서버 상태로 재연결한다. 만료된 참여는 사용자의 `새 참여 시작`으로만 재시작한다.

## 검증 기록

### 이전 로컬 구현 검증 이력

아래 전체 테스트·DB·빌드·리뷰 결과는 캐릭터 및 최신 모바일 압축 UI **이전**의 검증이다. 새 UI 변경이 전체 검증을 통과했다는 증거로 사용하지 않는다.

- 신규 parser 테스트 RED 7개 실패 확인 후 기존/신규 backend 관련 122개 통과.
- `pnpm verify:marketing-round2:isolated`: 일회용 로컬 DB 423개 검사 및 실제 HTTPS handler/SDK/DB 테스트 7개 통과. `productionWrites=0`, `remoteAccess=0`; 생성한 격리 자원 정리 완료.
- `pnpm test:product`: 646 파일 통과, 39 파일 생략; 7,746 테스트 통과, 516 생략. 첫 실행의 새 busy 문구 위반은 수정했고, 다른 테스트의 임시 파일 삭제 경합은 단독 및 전체 재실행으로 통과했다.
- 후속 동의/이메일/유형 복귀 회귀는 실패를 재현한 뒤 수정했다. 당시 `homeflow-landing` + `homeflow-client` 15개 통과; 콘텐츠·체험·page·Turnstile 포함 집중 26개 통과 기록을 보존한다.
- Playwright: 390×844, 320×720의 전체 선형 흐름 2개 통과. 제목 1개/가로 넘침 0/제외 시 체크 해제/완료 read-only/300g/preview 접수 확인. 실제 POST 0건.
- `pnpm lint`, `pnpm typecheck`, `pnpm validate:source-of-truth-sync`, `pnpm validate:branch` 통과.
- 당시 프로덕션 빌드 성공; 새 라우트는 동적 페이지다. 당시 빌드 로그는 아래 evidence 경로에 보존한다.
- 보조 코드 리뷰의 기존 5개 및 후속 2개 finding을 회귀 테스트와 함께 수정했다. 검토 범위 내 미해결 P1/P2 0. 같은 작업의 보조 리뷰이며 독립 Stage 승인이 아니다.

이전 로컬 evidence:

- `.omx/artifacts/homeflow-linear/`: 모바일 20개 PNG, visual-verdict, 전체 테스트·빌드·lint·typecheck 로그.
- `.omx/artifacts/r2-stage2/http-integration.json`: 실제 HTTPS 테스트 결과.
- `tests/e2e/homeflow-linear.spec.ts`: 명시적 local preview 전용 브라우저 검증.

### 이전 v0.6 캐릭터·모바일 압축 UI 검증

아래 결과는 이번 v0.7 투명 자산·모션·영양 표시 변경 이전의 검증 이력이다.

- 캐릭터·재료 매핑·두 줄 설명·초기 5체크 테스트는 RED 4건을 확인한 뒤 콘텐츠 테스트 **5개 통과**. 대상 ESLint·diff 검사도 통과했다.
- 체험 테스트 **7개 통과**. 구매 제외·복귀·완료 보호와 새 화면 구성을 확인했다.
- 브라우저 흐름 **4/4 통과**. 390×844, 375×812, 320×720의 기본 화면은 세로 스크롤 **0px**, 가로 넘침 없이 확인했다.
- 320×568은 비체험 기본 화면 스크롤 **0px**, 체험 화면은 **8~97px**의 필요한 스크롤을 허용한다. 펼친 재료·동의 상세, 큰 글자·키보드 상태까지 무조건 스크롤 0을 약속하지 않는다.
- 저장 없는 local preview의 실제 **POST 0건**을 확인했다. 운영 수집 또는 DB 기록 성공의 증거가 아니다.
- 당시 v0.6 visual-verdict는 **95점 / PASS**다.
- 후속 통합 단위 테스트 **8개 파일·45개 테스트 통과**, 전체 `lint`·`typecheck`·프로덕션 빌드 통과. 새 라우트 크기는 **19.6kB**, 공유 JavaScript는 **133kB**다. CSoT 동기화와 diff 검사도 통과했다.
- 보조 리뷰에서 새 P1/P2 발견 없음. 같은 작업의 보조 검토이며 독립 Stage 승인이 아니다.
- 이번 UI 변경은 실제 DB/API 보호를 바꾸지 않아 isolated DB 검증을 재실행하지 않았다. 위 이전 전체 7,746개/DB 423개 결과는 역사적 검증으로 유지한다.

당시 캡처·측정은 `.omx/artifacts/homeflow-linear/compact/`에 있으며 `{너비}x{높이}-*.png`, 측정 JSON 및 `visual-verdict.json`으로 보존한다. 예: `390x844-01-recipe.png`, `375x812-beta-form.png`, `320x720-06-meal-log.png`.

### 이번 v0.7 변경의 확인 상태

- 투명 파생본 7개와 알파 채널 유무·최소값은 manifest로 확인했다.
- 영양 표시 합산과 코드의 최신 사용자 제공 값, PRD의 결과 인용문·두 줄 설명을 대조한다.
- 이번 변경의 브라우저·모션·단위 테스트·전체 lint/typecheck/build 통합 검증은 진행 중이다. 이전 통과 기록을 이번 변경의 통과로 선언하지 않는다.

## 남은 운영 사항

- 투명 자산·모션·사용자 제공 영양 표시의 통합 검증 결과가 확정되면 이번 검증 절에 기록한다. 로컬 후보 상태이며 독립 Stage 승인이나 운영 배포를 대체하지 않는다.
- 선정 영상의 조리 순서·불 세기·시간은 원본 확인 전이므로 조리법에 `구성 예시`를 표시하고 시간 태그는 넣지 않았다.
- 김치볶음밥 300g은 사용자 제공 섭취·영양 체험값이다. 아침 250g·420 kcal와 점심 400g·700 kcal는 기존 데모 기록으로 유지한다. 완성 중량·잔량·실측 정확성은 확인한 것으로 주장하지 않는다.
- 실제 접수를 열려면 이후 운영 환경에 후속 migration과 R2 준비 조건을 적용·검증해야 한다. 현재 동작 중인 운영 서버를 수정하거나 배포 승인으로 취급하지 않는다.
- master 머지·배포 금지는 계속 유지한다.


## 체험6 확대 등장·영양 숫자 카운트 보강

- 변경: `homeflow-experience.tsx`, `homeflow-experience.module.css`, 대응 단위/E2E 테스트 및 로컬 구현 계약. 기존 등장 상태를 재사용해 1.1초 대기 후 1.4초 확대와 영양 숫자 증가를 동기화했다. 이전 숫자 확대 효과는 제거했다. 새 의존성 없음.
- 검증: 관련 단위 테스트 17개, 390×844/320×720 실제 브라우저 전체 흐름 2개 통과. 중간 숫자·확대 비율, 최종 합계, 모션 줄이기, 카드 내부 폭과 무스크롤 확인. ESLint/typecheck/git diff --check 통과.
- 한계: 로컬 UI 검증이며 실제 신청 전송·배포·master 머지·독립 Stage 승인은 수행하지 않았다.
