# Exploratory QA: 31-recipe-media-tags

## 목적
- acceptance checklist를 기반으로 desktop/mobile 사용자 흐름과 edge case를 탐색한다.
- 기능 버그뿐 아니라 디자인, 접근성, copy, affordance, 복구 UX 문제도 함께 기록한다.

## 입력 자료
- 체크리스트: `ui/designs/evidence/31-recipe-media-tags/exploratory-checklist.json`
- 보고서 템플릿: `ui/designs/evidence/31-recipe-media-tags/exploratory-report.json`
- 기본 URL: `http://127.0.0.1:3000`
- 필수 device coverage: `desktop-chrome, mobile-chrome, mobile-ios-small`

## 권장 데이터 셋업
- Fixture baseline
  - YouTube extract fixture with thumbnail and provider tags
  - YouTube register fixture verifying client thumbnail/tags are not accepted
  - Manual create fixture with valid user upload reference
  - Manual create negative fixtures for arbitrary external URL and cross-user storage URL
- Real DB smoke
  - `pnpm dev:demo`
  - 실제 로그인 세션에서 `/menu/add/youtube` URL 입력 → extract → review preview → register → recipe detail image/source note/tags 확인 → cleanup
  - 직접 등록에서 이미지 선택 → 저장 → detail image/tags 확인 → recipe + storage object cleanup
- Seed / reset
  - 신규 ingredient/system row 없음
  - Supabase Storage bucket/policy 준비 필요
- Blocker 조건
  - Storage bucket/policy 미준비
  - image upload API가 current-user path ownership을 검증하지 못함
  - YouTube thumbnail/tags가 client body로 override 가능함

## 실행 규칙
1. checklistItems를 순서대로 훑고 coverage 상태를 채운다.
2. desktop, 일반 mobile, 작은 iOS viewport를 모두 확인한다.
3. edgeCases 항목을 실제로 시도한다.
4. finding마다 severity, repro_steps, expected, actual, evidence_paths, remaining_risk를 남긴다.
5. 작은 높이 viewport에서는 above-the-fold 상태와 CTA 가시성을 캡처한다.
6. 마지막에 남은 리스크와 미커버 항목을 summary에 요약한다.

## 권장 실행 예시
- `pnpm dev:demo`로 앱을 띄운다.
- `http://127.0.0.1:3000`에서 브라우저 탐색을 시작한다.
- 완료 후 `ui/designs/evidence/31-recipe-media-tags/exploratory-report.json`를 채우고 `pnpm qa:eval -- --checklist ui/designs/evidence/31-recipe-media-tags/exploratory-checklist.json --report ui/designs/evidence/31-recipe-media-tags/exploratory-report.json`로 점수화한다.
- eval 결과는 기본값으로 `ui/designs/evidence/31-recipe-media-tags/eval-result.json`에 저장된다.

## 필수 휴리스틱
- 모바일에서 정렬, 필터, CTA처럼 자주 쓰는 control의 텍스트가 읽기 어려울 정도로 작지 않은지 확인한다.
- 작은 높이 viewport(iPhone SE 급)에서 primary CTA가 가려지지 않고 짧은 스크롤 안에서 도달 가능한지 확인한다.
- 같은 기능을 수행하는 CTA가 한 화면에 중복으로 노출되지 않는지 확인한다.
- 핵심 정보와 그 정보에 대한 액션이 물리적으로 멀리 떨어지지 않고 같은 맥락 안에 배치되는지 확인한다.
- h1/h2, 버튼, 상태 메시지 카피가 과하게 길거나 어색하지 않은지 확인한다.
- empty, loading, error 상태에서 사용자가 의미 없는 no-op CTA를 누를 수 없는지 확인한다.
- 아이콘, 버튼, 피드백 표현이 placeholder나 MVP 임시 UI처럼 보이지 않는지 확인한다.

## 필수 증거 가이드
- 각 required device별로 최소 1개 이상 스크린샷 또는 녹화 경로를 남긴다.
- 작은 viewport에서는 above-the-fold 캡처를 남긴다.
- 중복 CTA, 정보 계층, 카피 이상 여부를 찾지 못했더라도 확인 결과를 notes에 남긴다.

## Edge Cases
- Desktop viewport에서 대표 사용자 흐름을 처음부터 끝까지 다시 검증한다.
- Mobile viewport에서 동일 흐름을 다시 검증한다.
- 작은 iOS viewport(iPhone SE 급)에서 above-the-fold 영역과 하단 CTA 가시성을 확인한다.
- 중간 상태에서 hard refresh 후 상태 복원과 URL 정합성을 확인한다.
- 뒤로가기/앞으로가기 후 UI와 상태가 어긋나지 않는지 확인한다.
- 느린 네트워크에서 pending, skeleton, retry UX를 확인한다.
- 오프라인 또는 서버 오류에서 에러 메시지와 복구 동선을 확인한다.
- 키보드만으로 주요 동선과 모달 닫기/탐색이 가능한지 확인한다.
- 중복 탭/연속 클릭 시 중복 호출 방지와 최종 상태 일관성을 확인한다.
- 비로그인 보호 액션 후 로그인 복귀와 return-to-action 재실행을 확인한다.
- read-only 상태에서 우회 수정 시도와 409/차단 UX를 확인한다.
