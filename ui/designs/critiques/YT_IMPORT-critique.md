# YT_IMPORT 설계 리뷰

> 검토 대상: `ui/designs/YT_IMPORT.md`
> 기준 문서: 화면정의서 v1.5.1 S10 / 요구사항 v1.6.4 S2-4 / 유저flow맵 v1.3.1 S9
> 디자인 토큰: `docs/design/design-tokens.md` (2026-04-27 최종)
> 모바일 UX: `docs/design/mobile-ux-rules.md`
> 앵커 스크린: `docs/design/anchor-screens.md`
> 검토일: 2026-05-02
> 검토자: design-critic (Claude)
> 디자인 분류: prototype-derived design (h8 matrix)

## 종합 평가

**등급**: 🟡 조건부 통과

**한 줄 요약**: 4-Step 흐름이 화면정의서 S10 및 요구사항 S2-4와 빠짐없이 정합하며, 디자인 토큰 준수, 7-상태 커버리지, 스크롤 구조, 320px sentinel 대응 모두 양호. 크리티컬 이슈 0건, 마이너 이슈 4건 (권장 개선 수준). prototype-only 요소 미사용 확인됨.

## 크리티컬 이슈 (수정 필수)

없음

## 마이너 이슈 (권장 수정)

| # | 위치 | 문제 | 제안 |
|---|------|------|------|
| 1 | Step 1.5 비레시피 경고 | 썸네일 이미지 로딩 실패 시 fallback 처리 미명시. 네트워크 불안정 환경에서 깨진 이미지 표시 가능 | 16:9 영역에 `--surface-fill` 배경 + 영상 아이콘 placeholder fallback 명시 |
| 2 | Step 2 추출 진행 | 추출이 30초 이상 걸릴 때 사용자 이탈 방지 UX가 진행 바 + "잠시만 기다려주세요" 텍스트만 존재. 긴 대기 시간에 대한 추가 안내 부족 | 15초 경과 시 "조금 더 걸릴 수 있어요" 등 동적 안내 텍스트 전환, 또는 대략적 예상 소요 시간 표시 검토 |
| 3 | Step 3 재료 편집 바텀시트 | 재료 검색 리스트의 scroll containment가 명시되지 않음. MANUAL_RECIPE_CREATE 리뷰에서도 동일 지적 존재 | 검색 결과 영역에 `max-height: 40vh` + fade gradient affordance 명시 (MANUAL_RECIPE_CREATE 재료 추가 모달과 동일 처리) |
| 4 | Step 3 base_servings null 케이스 | 추출 결과에서 `base_servings`가 null로 반환될 수 있는데, 이때 stepper 기본값과 필수 입력 강조 UX가 명시되지 않음 | stepper 기본값 1로 세팅 + 섹션 상단에 "--brand 밑줄 또는 강조 border"로 필수 입력 주의 환기 |

## 체크리스트 결과

### A. 요구사항 정합성

- [x] 화면 정의서 S10의 모든 컴포넌트가 와이어프레임에 포함됨
  - Step 1: URL 입력 + [가져오기] (Line 27-58)
  - Step 1.5: 레시피 영상 검증 + [다시 입력]/[그래도 진행] (Line 64-103)
  - Step 2: 자동 추론 진행 상태, 4단계 progress (Line 107-145)
  - Step 3: 레시피명/기본 인분/재료/스텝 편집, 조리방법 자동 분류, "신규" 라벨 (Line 148-212)
  - Step 4: 등록 완료 + "이 끼니에 추가" + 인분 입력 (Line 214-264)
- [x] 문서에 없는 컴포넌트/필드/기능이 추가되지 않음 (extraction_methods pill, 비레시피 경고 모두 S10/S2-4에 근거 있음)
- [x] 로그인 게이트 대상 액션 처리 완료 (화면 진입, [가져오기], [등록], [이 끼니에 추가] 모두 로그인 필요 표기, Line 365-391 + Unauthorized 상태 Line 532-557)
- [x] return-to-action 처리 명시됨 (로그인 성공 후 YT_IMPORT Step 1 자동 진입, Line 557)
- [x] read-only 상태 해당 없음 (등록 완료 후 화면 닫힘, 등록된 레시피는 RECIPE_DETAIL에서 확인)
- [x] 삭제된 엔드포인트 `DELETE /recipes/{id}/save` 미사용

### B. 공통 상태 커버리지

- [x] Loading 상태 포함 (URL 검증 중 버튼 로딩 Line 445-458, 추출 중 Step 2 전체 화면 Line 459-463)
- [x] Empty 상태 포함 (재료 0개, 스텝 0개 각각 독립 empty + CTA, Line 465-477)
- [x] Error 상태 포함 (URL 검증 실패 Line 479-491, 추출 실패 Line 493-513, 등록 실패 Line 515-530)
- [x] Unauthorized 상태 포함 (비로그인 진입 시 전체 화면 안내 + [로그인]/[취소], Line 532-557)
- [x] 총 7가지 상태 변형이 와이어프레임과 함께 명시됨 -- 우수한 커버리지

### C. 내비게이션 & 플로우

- [x] 하단 탭 4개 (홈/플래너/팬트리/마이) 구조 일관성 (Step 1 Line 58, Step 3 Line 211)
- [x] 유저 Flow맵 S9와 진입/이탈 경로 일치 (MENU_ADD -> YT_IMPORT -> MEAL_SCREEN/RECIPE_DETAIL/MENU_ADD, Line 15-18 + Line 388-391)
- [x] 뒤로가기 동작 명시 (Step 1: MENU_ADD 복귀 Line 368, Step 3: 수정 내용 삭제 확인 모달 Line 369)
- [x] 플로우 단절 지점 없음 (Step 4에서 3가지 선택지, 에러 시 다시 시도/다른 영상 입력 분기 모두 존재)
- [x] Step 전환: 같은 페이지 내 콘텐츠 교체 + history state push로 브라우저 뒤로가기 지원 (Line 414-416)

### D. UX 품질

- [x] 터치 타겟 최소 44px 준수
  - 뒤로 버튼 44x44px (Line 272)
  - 인분 stepper [+]/[-] 44x44 (Line 172, 356)
  - 재료/스텝 [편집] 아이콘 44x44 (Line 316, 330)
  - [+ 재료 추가]/[+ 조리 과정 추가] 44px 높이 (Line 184, 206)
- [x] 모바일 퍼스트 (375px 기준) 레이아웃 (Line 28 명시)
- [x] 320px sentinel 대응 명시 (Line 618-629: AppBar 말줄임, 여백 축소, 재료명 말줄임, badge 줄바꿈 허용)
- [x] 핵심 액션이 시각적으로 명확함
  - Step 1: [가져오기] full-width --brand CTA
  - Step 3: AppBar [등록] --brand (항상 접근 가능)
  - Step 4: [이 끼니에 추가] primary --brand CTA
- [x] whole-page horizontal scroll 없음 (Line 400 명시)
- [x] scroll containment 명확함 (Step별 스크롤 필요성 분석 Line 395-404, 바텀시트 본문과 페이지 본문 경계 구분 Line 404)
- [x] 장보기 D&D: 해당 없음
- [x] 팬트리 제외 섹션 2-영역 구조: 해당 없음
- [x] AI스러운 제네릭 UI 미사용 (글로우, 과도한 그라디언트, 번쩍이는 효과 없음)

### E. 도메인 규칙 정합성

- [x] `meals.status` 전이 표현 정확 -- Step 4 "이 끼니에 추가" -> POST /meals -> status='registered' (Line 389, 유저flow맵 S9 Line 752 확인)
- [x] 독립 요리와 meals 상태 관계: 해당 없음 (이 화면은 레시피 등록 + 플래너 추가 전용)
- [x] 팬트리 수량 관련: 해당 없음
- [x] 요리모드 인분 조절 UI: 해당 없음 (이 화면은 요리모드가 아님)
- [x] 저장 가능한 레시피북 타입: 해당 없음 (레시피 등록 화면이며 레시피북 관련 UI 없음)

### F. 디자인 토큰 준수

- [x] CTA 버튼에 `--brand` 사용됨 ([가져오기] Line 51, [그래도 진행] Line 92, [등록] Line 151, [이 끼니에 추가] Line 230, 인분 [추가] Line 260)
- [x] 카드 배경에 `--surface` 명시됨 (추출 진행 카드 Line 134 `--surface bg`, 등록 완료 카드 Line 220)
- [x] 태그/칩에 `--olive` 사용됨 (추출 방식 pill Line 157 `--olive pill`, [+ 재료 추가] Line 184, [+ 조리 과정 추가] Line 206)
- [x] 보조 텍스트에 `--text-2`, `--text-3` 사용됨 (Line 39, 77, 118, 154 등 -- `--muted`는 empty 상태 안내 텍스트에만 사용, Line 322/337)
- [x] 카드 border-radius: `--radius-lg` (16px) 대형 카드, `--radius-md` (12px) 중형 카드 -- 토큰 기준과 일치
- [x] 수평 여백 16px (`--space-4`) 모바일 기준 준수 (와이어프레임 기본 여백)
- [x] 확정 토큰 외 임의 색상 미사용 (모든 색상이 토큰 변수명으로 참조됨, `#d56a3a`/`#6e7c4a` 등 구버전 값 없음)
- [x] `--brand-soft` 활용이 적절함 (비레시피 경고 카드 배경, "신규" 조리방법 pill -- 현재 확정값 `#FDEBEA` 기준)
- [x] 바텀시트 `--radius-xl` (20px) 사용 (끼니 추가 인분 바텀시트 Line 352)
- [x] 버튼 `--radius-sm` (8px) 일관 사용 (Line 51, 92, 98, 184, 206, 231, 260)

### G. Prototype-Derived Design 준수

- [x] Baemin vocabulary/material 사용 (토큰 체계, 카드 패턴, 바텀시트 패턴이 기존 앱 스타일과 일관)
- [x] Jua 폰트 미사용 (폰트 토큰은 `--font-body` 기준 sans-serif)
- [x] prototype-only 바텀탭 동작 없음 (표준 4-탭 구조 유지)
- [x] near-100% parity 시도 없음 -- 자체적인 multi-step flow 설계가 서비스 맥락에 맞게 구성됨
- [x] anchor screen 확장 아님 (Line 599-603: YT_IMPORT는 MENU_ADD에서 진입하는 독립 화면, HOME/RECIPE_DETAIL/PLANNER_WEEK 미수정)

### H. MANUAL_RECIPE_CREATE 패턴 일관성

- [x] AppBar 우측 CTA 패턴 일치 ([저장] vs [등록] -- 동일 위치, 동일 --brand 스타일)
- [x] 재료/스텝 편집 바텀시트가 MANUAL_RECIPE_CREATE와 동일한 형태임을 명시 (Line 381, 384, 587-588)
- [x] 인분 stepper UI 패턴 일치 (--brand 버튼, 44x44 터치 타겟)
- [x] 등록 완료 후 3가지 선택지 패턴 일관 (끼니 추가/상세 보기/닫기)

## design-generator 자체 점검 항목 리뷰

설계 문서 하단에 13개 점검 요청 항목이 명시되어 있다 (Line 634-646). 각 항목에 대한 판정:

| # | 항목 | 판정 | 비고 |
|---|------|------|------|
| 1 | Step 2 장기 대기 이탈 방지 | 마이너 #2로 기록 | 진행 바는 있으나 동적 안내 부족 |
| 2 | Step 3 긴 리스트 스크롤 | OK | 전체 페이지 세로 스크롤로 처리, 가로 스크롤 없음 |
| 3 | 320px에서 [등록] 잘림 | OK | AppBar 좌측 뒤로(44px) + 중앙 제목(말줄임) + 우측 [등록](~50px) -- 320px에서 수용 가능 |
| 4 | 재료 편집 바텀시트 스크롤 간섭 | 마이너 #3으로 기록 | scroll containment 미명시 |
| 5 | 썸네일 로딩 실패 fallback | 마이너 #1로 기록 | fallback 미명시 |
| 6 | cook-* 토큰 일관성 | OK | design-tokens.md 조리방법 색상표와 --cook-{method} 패턴 일치 |
| 7 | "unassigned" color_key fallback | OK | --cook-gray 회색 계열 fallback 명시 (Line 335) |
| 8 | history state 뒤로가기 | OK | Line 416에서 history state push 활용 명시 |
| 9 | [이 끼니에 추가] -> POST /meals 실패 에러 | OK | 등록 실패 에러 상태(Line 515-530)와 유사하게 처리 가능하나, 끼니 추가 실패 전용 에러는 별도 명시 없음 -- 등록 실패 바텀시트 패턴을 재활용하면 충분 |
| 10 | 네트워크 끊김 시 timeout/retry | OK | 추출 실패 에러 상태에서 [다시 시도] + [다른 영상 입력] 제공 (Line 493-513) |
| 11 | 키보드와 URL 입력 필드 겹침 (320px) | OK | 키보드 처리 섹션에서 virtual keyboard inset 대응 명시 (Line 408-410) |
| 12 | base_servings null 시 필수 입력 강조 | 마이너 #4로 기록 | 기본값과 강조 UI 미명시 |

## design-generator 재작업 요청 항목

> 크리티컬 이슈 0건이므로 재작업 필수 사항은 없음. 아래는 권장 보완 사항.

- [ ] Step 1.5 썸네일 이미지 fallback 추가 (16:9 영역 + `--surface-fill` bg + 영상 아이콘)
- [ ] Step 2 장기 대기(15초+) 시 동적 안내 텍스트 전환 명시
- [ ] 재료 편집 바텀시트 검색 리스트 scroll containment 명시 (`max-height: 40vh` + fade gradient)
- [ ] Step 3 `base_servings` null 시 stepper 기본값(1) + 필수 입력 강조 UI 명시

## 통과 조건

이 화면 설계가 구현으로 넘어가려면:
- [x] 크리티컬 이슈 0개
- [ ] 마이너 이슈 4건 처리 또는 수용 결정 (구현 단계에서 반영 가능한 수준)

## Stage 4 반영 메모

> 아래 마이너 4건은 **accepted carry-forward**이며, 미해결 블로커가 아니다.
> Stage 4 프론트엔드 구현 시 아래 사항을 반영한다.

1. **썸네일 fallback** — Step 1.5 비레시피 경고에서 썸네일 로딩 실패 시 16:9 `--surface-fill` 배경 + 영상 아이콘 placeholder 적용
2. **장시간 대기 안내** — Step 2 추출 진행이 15초 이상일 때 "조금 더 걸릴 수 있어요" 동적 텍스트 전환
3. **검색 스크롤 containment** — Step 3 재료 편집 바텀시트 검색 리스트에 `max-height: 40vh` + fade gradient affordance (MANUAL_RECIPE_CREATE 동일 패턴)
4. **base_servings null 기본값** — 추출 결과 `base_servings`가 null이면 stepper 기본값 1 + `--brand` 강조 border로 필수 입력 환기
