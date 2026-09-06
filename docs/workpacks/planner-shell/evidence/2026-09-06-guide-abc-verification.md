# 상세 보류 · 계획 영양 · 가이드 · 랜딩 3개 변형

## 반영과 변경 파일

- `components/planner/meal-log-screen.tsx`, `planner-week-screen.tsx`: 현재 준비 모드에서 음식 이름 클릭은 비로그인→로그인 페이지(선택일·식사 기록 복귀 주소 보존), 로그인→준비 안내로 차단한다. 기존 편집 복귀 초안도 수정창을 열지 않고 보관한다. 추가·삭제의 기존 권한 보호는 유지한다.
- 기존 상세·수정 내부 코드는 이후 개발과 회귀 검증을 위해 보존했다. 준비 모드 해제 시 노출될 수 있으므로 해제 전에 상세 개발·검증을 별도로 완료해야 한다. 기존 수정 회귀 테스트는 준비 모드 해제 시험 환경으로 분리하고, 현재 준비 모드의 진입 차단은 별도 테스트로 고정했다.
- `components/planner/planner-week-board.tsx`: 계획 인분, 1인분당 kcal·탄수화물·단백질·지방을 표시한다. pinned 계획 전체 값÷계획 인분을 사용하며 부분/미확인/stale/0인분 보호를 유지한다. 공용 환산 처리로 중복 계산을 줄였다.
- `components/about/about-screen.tsx`, `lib/content/service-guide.ts`, about 전용 CSS: 만들 계획→여러 끼 분량 조리→먹은 g 기록→하루 영양 흐름으로 내용을 갱신했다. 준비 중인 YouTube와 식사 상세·수정을 명시했다. 기존 당근·브로콜리 이미지와 공유 OG를 재사용하고 `/about#how-to`에 `/beta?ad_variant=a` 체험 배너를 배치했다. 기존 앵커·뒤로가기·문의·법률 링크는 유지한다.
- `app/beta/page.tsx`, `components/marketing/marketing-demand-validation-screen.tsx`, `lib/marketing/demand-validation.ts`: 새 유입과 Hero는 a/b/c만 제공한다. 기본/d/default/잘못된 값은 기본 a로 정규화하며, 알려진 UTM 우선순위는 기존대로 유지한다. URL의 나머지 query와 반복값은 보존한다. 기본/d 전용 Hero 분기를 삭제했다.
- 공유 결과의 읽기 전용 URL은 별도 Hero가 아니므로 유지한다. 공유 결과에서 ‘나도 테스트하기’와 ‘처음 화면’ 모두 활성 변형 URL과 새 view 초기화를 거친다. 과거 세션·리드·DB의 d/default 값을 재작성하거나 삭제하지 않는다. API의 역사적 accepted enum은 유지하고 신규 view만 a/b/c로 정규화한다.

## 검증

- 관련 64개 파일 중 62개 통과, 2개 환경 의존 생략. 750개 테스트 통과, 27개 생략. `/tmp/guide-abc-regression.log`.
- 데스크톱·모바일 브라우저: 20개 통과, 반대 화면 전용 4개 의도적 생략. `/tmp/guide-abc-e2e.log`. 음식 이름의 로그인 페이지 진입, 계획 영양 표시, 가이드/법률/뒤로가기, 기본/d/a/b/c 주소·Hero·view 이벤트 정합을 확인했다. 랜딩 API는 공식 테스트 fixture로 제어했다.
- 별도 실제 HTTP 요청: 기본 `/beta`와 d는 307, 활성 b는 200. 원시 UTM을 보존하는 Location 확인.
- 전체 타입 검사·ESLint·SOT 문서 정합성·diff 공백 검사·최종 Next production build 통과. `/beta`는 searchParams를 읽는 동적 경로로 빌드된다.
- 보조 리뷰에서 발견한 이전 edit 복귀의 준비 안내 우회와 공유 결과 뒤로가기의 view 초기화 누락을 각각 실패 테스트 후 수정했다. 재검토에서 두 건의 수정이 확인됐다.
- 320·375·1280px에서 가이드/계획 카드 가로 넘침 없음. 시각 검토 95/pass와 이미지: `ui/designs/evidence/prelaunch-planner-ui/guide-abc/`. 랜딩 이미지는 UI fixture 기반이다.

## 남은 범위

운영 배포, 실제 계정 OAuth·저장 전체 흐름, 과거 데이터 정리·DB 변경은 수행하지 않았다. 준비 모드 해제와 식사 상세 출시도 이번 범위 밖이다.

로컬 랜딩의 실제 API 초기화는 기존 오류 안내를 반환한다. 따라서 실제 참여 저장을 성공으로 보고하지 않는다. 이번 랜딩 검증은 실제 HTTP 주소 전환 및 테스트 API를 사용한 화면·이벤트·흐름 검증이다. 실제 서비스 API 연결은 별도 환경 검증이 필요하다.

빌드는 비공개 환경파일을 복사하지 않은 별도 runtime copy와 가짜 loopback Supabase 값으로 수행했다.
