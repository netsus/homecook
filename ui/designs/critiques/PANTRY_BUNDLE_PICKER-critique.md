# PANTRY_BUNDLE_PICKER 설계 리뷰

> 검토 대상: `ui/designs/PANTRY_BUNDLE_PICKER.md`
> 기준 문서: 화면정의서 v1.5.1 SS 18 / 요구사항 v1.6.4 SS 1-8 / 유저 Flow맵 v1.3.1 SS 7
> 검토일: 2026-04-28
> 검토자: design-critic

## 종합 평가

**등급**: 🟡 조건부 통과

**한 줄 요약**: 화면정의서 SS 18의 3단계 플로우(묶음 선택 -> 재료 체크리스트 -> 팬트리 추가)가 정확히 구현되어 있고, 상태 커버리지(Loading/Empty/Error/Adding)가 충실하며, scroll containment와 320px 대응이 별도 설계되어 있다. 다만 `--brand` 색상 값 불일치(1곳), Error 상태의 retry CTA 시각 위계, 바텀시트 높이 적응 전략 부재, 시트 drag-down과 내부 스크롤 간 제스처 충돌 명세 부재 등 마이너 이슈가 존재한다.

## 크리티컬 이슈 (수정 필수)

> 없음

## 마이너 이슈 (권장 수정)

| # | 위치 | 문제 | 제안 |
|---|------|------|------|
| 1 | 컴포넌트 상세 SS 5 -- 하단 고정 CTA -- 활성 상태 | `--brand (#ED7470)`가 design-tokens.md의 확정 값이다. 그러나 설계 문서 내에서 첫 번째 언급(와이어프레임 주석)은 `--brand bg`로만 표기하고, 컴포넌트 상세 표에서 `bg: --brand (#ED7470)`로 올바르게 표기된다. 문제는 없으나, 화면 메타나 체크리스트 시점의 검토 항목 원문에 `--brand (#FF6C3C)`로 기재된 체크리스트 기준과 혼동을 방지해야 한다. design-tokens.md가 2026-04-27에 `--brand`를 `#ED7470`으로 확정했으므로 설계 문서 내의 `#ED7470` 표기는 정확하다. **이슈 없음으로 재분류** -- 단, 설계 문서 자체에서 두 가지 CTA 비활성 색상(`--surface-subtle`)이 명시되어 있는데 Adding 상태와 비활성 상태가 동일한 시각 처리이므로 사용자가 "아직 선택 안 한 것"과 "전송 중"을 구분하기 어려울 수 있다. | Adding 상태에서는 spinner가 이미 구분자 역할을 하므로 수용 가능하나, spinner가 보이지 않는 순간(네트워크 지연 초기)에 대비해 CTA 텍스트를 "추가 중..."으로 변경한 것은 적절하다. 추가 조치 불필요. |
| 2 | Error 상태 -- [다시 시도] 버튼 | Error CTA가 `--olive border+text, bg: transparent`로 되어 있어 secondary outline 스타일이다. Error 상태에서 [다시 시도]가 유일한 복구 수단이므로, mobile-ux-rules Rule 3 "Primary CTA는 첫 화면에서 읽혀야 한다"에 따라 primary 시각 위계가 더 적절하다. PANTRY-critique에서도 동일 패턴을 마이너 #2로 지적한 바 있다. | [다시 시도] 버튼을 `--brand bg, --surface text` primary 스타일로 변경하여 유일한 복구 CTA임을 시각적으로 강조한다. 또는 시트 맥락에서 `--olive`를 의도적으로 사용한다면 그 근거를 디자인 결정 사항에 명시한다. |
| 3 | 바텀시트 높이 -- 90vh 고정 | 묶음이 2-3개이고 재료가 적을 때 90vh 시트는 하단이 비어 보일 수 있다. 설계 문서도 "검토 필요 항목"으로 이를 직접 언급하고 있다. mobile-ux-rules Rule 4 "정보 구조는 일반적인 앱 기대를 존중한다" 관점에서, 바텀시트가 컨텐츠보다 과도하게 클 때 빈 공간이 "아직 로딩 중인가?"라는 오해를 줄 수 있다. | `max-height: 90vh`는 유지하되, `height: auto` (content-fit)를 기본으로 하고 컨텐츠가 90vh를 초과할 때만 스크롤이 활성화되는 adaptive 방식을 명시한다. 또는 "묶음이 적을 때도 90vh를 유지하는 이유"를 디자인 결정 사항에 추가한다 (예: "아코디언 펼침 시 높이 변동을 방지하기 위해 고정 높이 채택"). |
| 4 | 시트 drag-down과 내부 스크롤 제스처 충돌 | 설계 문서에서 "검토 필요 항목"으로 직접 언급한 바와 같이, 시트 내부 스크롤 영역에서 위로 드래그 시 시트 닫기와 리스트 스크롤이 충돌한다. 이에 대한 해결 전략이 `Scroll containment` 표에 `overscroll-behavior: contain`으로만 언급되어 있고, scroll-at-top 감지 로직이 명시되지 않았다. | "스크롤이 최상단(scrollTop === 0)일 때만 drag-down으로 시트 닫기, 그 외에는 내부 스크롤 우선" 규칙을 인터랙션 노트 또는 Scroll containment 표에 추가한다. 이는 표준 바텀시트 패턴이므로 구현 가이드로서 명시하는 것이 도움된다. |
| 5 | 320px에서 [보유중] pill과 재료명 공존 | 설계 문서가 "검토 필요 항목"으로 직접 언급했다. 320px 와이어프레임에서 재료명이 길 때(`text-overflow: ellipsis` 처리 명시) [보유중] pill과 한 줄에 공존할 수 있는지 구체적 계산이 없다. 행 내부 레이아웃이 `체크박스(24px) + gap(12px) + 재료명(flex:1) + gap(12px) + pill/라벨(약 48px)`이면 320px - 좌우패딩(24px) = 296px 내에서 재료명 가용 폭은 약 200px로 충분해 보이나, 패딩이 `--space-3(12px) x 2 = 24px`이므로 실제 가용은 `296 - 24 - 12 - 48 = 212px` 정도다. | 계산상 수용 가능하다. 단, "보유중" pill 대신 아이콘(체크마크 또는 작은 dot)으로 축약하는 320px 대안도 검토 가능하다. 현재 설계도 기능적으로 문제없으므로 구현 시 실제 확인 수준으로 충분하다. |
| 6 | 보유중 재료의 dimmed 텍스트 접근성 | 설계 문서가 "검토 필요 항목"으로 직접 언급했다. 보유중 재료의 텍스트가 `--text-4 (#ADB5BD)`인데, 시트 배경 `--panel (rgba(255,252,248,0.92))`에서의 대비 비율이 WCAG 2.1 AA (4.5:1) 기준을 충족하는지 확인이 필요하다. `#ADB5BD` vs `#FFFCF8` (panel 불투명 근사)는 약 1.8:1로 AA 기준 미달이다. 다만 이는 "disabled/dimmed" 상태로 WCAG에서는 비활성 요소에 대비 요건을 면제하는 경우가 있으나, 보유중 재료도 사용자가 "강제 체크 가능"하므로 인터랙티브 요소에 해당한다. | `--text-4` 대신 `--text-3 (#868E96)`을 사용하면 대비 비율이 약 3.2:1로 개선된다. 인터랙티브 요소이므로 최소 `--text-3`을 권장한다. 또는 `--muted (#5f6470)` 사용 시 4.3:1로 AA 근접. |

## 체크리스트 결과

### A. 요구사항 정합성
- [x] 화면 정의서의 모든 컴포넌트가 와이어프레임에 포함됐는가 -- SS 18의 3단계 플로우(묶음 리스트 선택 / 재료 체크리스트 노출 / [팬트리에 추가]) 모두 포함. 묶음 카드 아코디언, 재료 행(BundleIngredientRow), 하단 고정 CTA가 정확히 매핑됨
- [x] 문서에 없는 컴포넌트/필드/기능이 추가됐는가 -- "보유중 재료 강제 체크 허용"은 문서에 명시되지 않았으나, API가 중복 추가를 silent skip 처리하므로 안전하며 사용자 자유도 보장 측면에서 합리적. 별도 contract-evolution 불필요
- [x] 로그인 게이트 대상 액션이 모두 처리됐는가 -- PANTRY 자체가 로그인 필수이므로 바텀시트 진입 시 이미 인증 상태. 별도 게이트 불필요하며 화면 메타에 정확히 명시됨
- [x] read-only 상태 (완료 장보기 등)가 올바르게 반영됐는가 -- 해당 없음 (팬트리 묶음 추가에는 read-only 상태 없음). 정확
- [x] 삭제된 엔드포인트 `DELETE /recipes/{id}/save`가 UI에 등장하지 않는가 -- 등장하지 않음

### B. 공통 상태 커버리지
- [x] Loading 상태 (스켈레톤/인디케이터) 포함 -- 스켈레톤 카드 4개 + shimmer 애니메이션 + CTA 비활성 스켈레톤 명시. 헤더는 정상 표시
- [x] Empty 상태 (안내 + CTA) 포함 -- "등록된 묶음이 없어요" + 설명 문구. CTA는 의도적으로 비노출(추가할 항목이 없으므로). Empty에서의 유일한 탈출구는 [X] 닫기인데, 이는 정보 화면이므로 적절
- [x] Error 상태 (안내 + [다시 시도]) 포함 -- "묶음 목록을 불러오지 못했어요" + [다시 시도] CTA. 시각 위계는 마이너 #2에서 다룸
- [x] read-only 상태가 필요한 화면에서 수정 UI 비노출 -- 해당 없음

### C. 내비게이션 & 플로우
- [x] 하단 탭 4개 (홈/플래너/팬트리/마이페이지) 구조 일관성 -- 바텀시트이므로 탭바는 시트 뒤에 dim overlay로 가려짐. 시트 닫기 후 PANTRY로 복귀하면 탭바 표시. 정확
- [x] 유저 Flow맵과 진입/이탈 경로 일치 -- SS 7의 `[묶음 추가] -> PANTRY_BUNDLE_PICKER -> 묶음 카테고리 선택 -> 재료 체크리스트 -> [팬트리에 추가] -> pantry_items INSERT`가 정확히 매핑. 진입(PANTRY [묶음 추가] 탭), 이탈(성공 시 토스트+시트 닫기+PANTRY 복귀, 실패 시 에러 토스트+시트 유지, 닫기 시 선택 폐기+PANTRY 복귀) 모두 명시
- [x] 뒤로가기 동작 명시 여부 -- 닫기 방법 3가지(drag-down, overlay 탭, [X] 버튼) + 닫기 시 동작(선택 상태 폐기, PANTRY 복귀) 명시
- [x] 플로우 단절 지점 없는가 -- 단절 없음. 모든 인터랙션에 결과(토스트/시트 유지/CTA 업데이트)가 명시됨. 추가 실패 시에도 시트가 유지되어 재시도 가능

### D. UX 품질
- [x] 터치 타겟 최소 44px 준수 -- 닫기 버튼 44x44px, 묶음 카드 헤더 48px, 재료 행 min-height 44px(행 전체가 터치 영역), CTA 48px, [다시 시도] 44px 모두 명시
- [x] 모바일 퍼스트 (375px 기준) 레이아웃 -- 375px 기준 와이어프레임 2단계(Step 1: 묶음 리스트, Step 2: 묶음 펼침) 제공
- [x] 작은 모바일 sentinel에서도 구조가 유지되는가 -- 320px 별도 와이어프레임 + 대응 규칙 6항 명시(여백 축소, 재료 수 생략 가능, 말줄임, CTA 터치 타겟 유지, 체크박스 44px 유지)
- [x] 핵심 액션이 시각적으로 명확한가 -- [N개 팬트리에 추가] primary CTA `--brand bg`로 시트 하단 고정. 첫 화면에서 즉시 보임. CTA 카운트(N)로 선택 상태 실시간 반영
- [x] whole-page horizontal scroll을 유도하지 않는가 -- scroll containment 표에서 "전체 페이지 가로: 없음" 명시
- [x] scroll containment가 명확한가 -- 3개 영역(시트 내부: 세로 스크롤, 시트 배경: 스크롤 잠금, 전체 가로: 없음)이 표로 정리됨. `overscroll-behavior: contain` 명시
- [ ] 장보기 D&D (sort_order) UI가 명확한가 -- 해당 없음
- [ ] 팬트리 제외 섹션 2영역 구조가 올바른가 -- 해당 없음 (SHOPPING_DETAIL만)
- [x] AI스러운 제네릭 UI 사용 여부 -- 없음. 아코디언+체크리스트+고정 CTA의 실용적 구성. 글로우, 과도한 그라디언트 없음

### E. 도메인 규칙 정합성
- [x] `meals.status` 전이 표현 정확성 -- 해당 없음 (PANTRY_BUNDLE_PICKER에서 meals 상태를 다루지 않음)
- [x] 독립 요리는 meals 상태를 바꾸지 않는 것이 UI에서 명확한가 -- 해당 없음
- [x] 팬트리는 수량이 아닌 보유 여부만 표시 -- 재료 행에 수량 UI 없음. 보유 상태는 `is_in_pantry` 기반으로 [보유중] pill / (없음) 라벨로만 표시. 화면 메타에 "보유 여부만" 정책 정확히 반영
- [x] 요리 모드에서 인분 조절 UI가 없는가 -- 해당 없음
- [x] 저장 가능한 레시피북 타입 (saved/custom) 만 표시 -- 해당 없음

### F. 디자인 토큰 준수 (docs/design/design-tokens.md 기준)
- [x] CTA 버튼에 `--brand` 사용됐는가 -- `--brand bg` (#ED7470) 명시. design-tokens.md 확정 값과 일치
- [x] 카드 배경에 `--surface` 명시됐는가 -- 묶음 카드 bg: `--surface` 명시
- [x] 태그/칩에 `--olive` 사용됐는가 -- 체크박스 checked 상태에 `--olive bg + white check` 사용. [보유중] pill은 `--surface-fill bg + --text-3 text`로 중립 처리. 적절
- [x] 보조 텍스트에 `--muted` 사용됐는가 -- helper copy `--muted`, 닫기 아이콘 `--muted`, (없음) 라벨은 `--text-4` 사용. `--muted`와 `--text-4` 분배는 disabled 의미가 있는 곳에 `--text-4`를 적절히 사용
- [x] 카드 border-radius 16px 준수됐는가 -- 바텀시트 상단: `--radius-xl (20px)`. 묶음 카드는 아코디언 구조로 border-radius보다 border-bottom: `--line` 구분선 사용. 카드형이 아닌 리스트형이므로 16px 규칙의 직접 적용 대상이 아님. 적절
- [x] 수평 여백 16px(모바일) 기준 준수됐는가 -- CTA 컨테이너 `--space-4 (16px)` 수평 패딩 명시. 시트 내부도 `--space-4` 기준
- [x] 확정 토큰 외 임의 색상이 사용됐는가 -- 사용되지 않음. 모든 색상이 토큰 변수명으로 참조됨. `#d56a3a`, `#6e7c4a` 등 구버전 색상 사용 없음

## 강점

1. **플로우 완결성**: 묶음 선택 -> 재료 체크 -> 추가 -> PANTRY 복귀의 전체 사이클이 인터랙션 노트 표에 8개 액션으로 빠짐없이 매핑됨
2. **미보유 기본 선택 로직**: "묶음의 목적이 집에 없는 재료를 추가하는 것"이라는 도메인 의도를 정확히 반영하여 미보유 재료를 기본 체크, 보유중 재료를 기본 미체크로 설정. UX 마찰 최소화
3. **CTA 카운트 실시간 반영**: "[N개 팬트리에 추가]" 형태로 선택 수를 실시간 업데이트. 사용자가 추가 규모를 즉시 인지 가능
4. **Adding 상태 별도 설계**: POST 호출 중 CTA가 disabled + spinner + "추가 중..." 텍스트로 변경되는 상태를 별도 와이어프레임으로 표현
5. **접근성(a11y) 명세**: `role="dialog"`, `aria-modal`, focus trap, `aria-expanded` (아코디언), `aria-checked` (체크박스), `aria-busy` (CTA) 등 접근성 속성 포괄 명시
6. **성능 고려사항**: 묶음 5-10개, 재료 4-15개로 가상 스크롤 불필요 판단, 낙관적 업데이트 전략(POST 즉시 시트 닫기 -> 토스트 -> PANTRY 재조회) 명시
7. **State 타입 명세**: `bundles`, `expandedBundleId`, `selectedIds`, `isLoading`, `isAdding`, `error` 6개 상태와 초기값, TypeScript 코드까지 제공하여 구현자가 직접 활용 가능
8. **바텀시트 선택 근거**: mobile-ux-rules Rule 6를 인용하며 전체 페이지 대신 시트를 선택한 근거를 디자인 결정 사항에 기록. h8 gate `prototype-derived design` 분류도 정확히 명시
9. **토큰 사용 정확성**: 모든 색상/간격/반경이 토큰 변수명 + 구체 값 쌍으로 표기되어 구현 시 혼동 없음

## design-generator 재작업 요청 항목

- [ ] 마이너 #2: Error 상태 [다시 시도] 버튼을 `--brand bg, --surface text` primary 스타일로 변경하거나, `--olive` secondary 유지 시 근거 명시
- [ ] 마이너 #3: 바텀시트 높이를 `max-height: 90vh; height: auto`(content-adaptive)로 변경하거나, 90vh 고정 유지 시 근거를 디자인 결정 사항에 추가
- [ ] 마이너 #4: 시트 내부 스크롤과 drag-down 닫기 간 제스처 우선순위 규칙(`scrollTop === 0`일 때만 drag-down 허용)을 인터랙션 노트 또는 Scroll containment 표에 추가
- [ ] 마이너 #6: 보유중 재료 텍스트 색상을 `--text-4`에서 `--text-3`(또는 `--muted`)으로 변경하여 인터랙티브 요소의 접근성 대비 비율 개선 검토

## Stage 1 repair disposition

> 수리 기준: `.omx/artifacts/stage1-doc-gate-review-13-pantry-core-20260428T231002KST.md` (DG-REQ-005)

### 수리 완료 항목

| # | 마이너 | 조치 | 수리 위치 |
|---|--------|------|----------|
| 1 | #2 Error CTA secondary 스타일 | `--olive border+text` → `--brand bg, --surface text` primary 스타일로 변경 | `ui/designs/PANTRY_BUNDLE_PICKER.md` -- Error 상태 와이어프레임 |
| 2 | #3 바텀시트 높이 90vh 고정 | `height: auto; max-height: 90vh` adaptive 방식으로 변경. 컨텐츠가 90vh 미만이면 빈 공간 없이 맞춤, 초과 시 내부 스크롤. | `ui/designs/PANTRY_BUNDLE_PICKER.md` -- 컴포넌트 상세 SS 1, 설계 결정 SS 6 |
| 3 | #4 drag-down vs 내부 스크롤 제스처 충돌 | `scrollTop === 0`일 때만 drag-down 허용 규칙을 Scroll containment에 추가 | `ui/designs/PANTRY_BUNDLE_PICKER.md` -- Scroll containment 섹션 |
| 4 | #6 보유중 재료 dimmed 텍스트 접근성 | `--text-4` → `--text-3`으로 변경하여 인터랙티브 요소의 대비 비율 개선 (~3.2:1) | `ui/designs/PANTRY_BUNDLE_PICKER.md` -- 컴포넌트 상세 SS 4, 와이어프레임 주석 |

### Stage 4 검증 항목 (수용)

| # | 마이너 | 판정 | 근거 |
|---|--------|------|------|
| 1 | #1 --brand 색상 값 | 수용 (이슈 없음) | critic 자체에서 "이슈 없음으로 재분류" 판정. design-tokens.md 확정 값 `#ED7470`과 일치. |
| 2 | #5 320px [보유중] pill 공존 | Stage 4 구현 후 검증 | critic 계산: 가용 폭 ~212px으로 수용 가능. 실물 확인 필요. |

### 재작업 요청 항목 갱신

- [x] 마이너 #2: Error CTA `--brand bg` primary 스타일로 변경 완료
- [x] 마이너 #3: 바텀시트 높이 adaptive 방식 (`height: auto; max-height: 90vh`) 변경 완료
- [x] 마이너 #4: drag-down vs 내부 스크롤 우선순위 규칙 추가 완료
- [x] 마이너 #6: 보유중 재료 텍스트 `--text-4` → `--text-3` 변경 완료

## 통과 조건

이 화면 설계가 구현으로 넘어가려면:
- [x] 크리티컬 이슈 0개
- [x] 마이너 이슈 처리 또는 수용 결정 (6개 전부 처리/수용 완료: #1 이슈 없음, #2-#4/#6 수리, #5 Stage 4 검증)
