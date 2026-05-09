# PLANNER_WEEK Column Customization 설계 리뷰

> 검토 대상: `components/settings/settings-screen.tsx` (끼니 컬럼 관리 섹션), `components/planner/planner-week-screen.tsx` (동적 컬럼 렌더링)
> 기준 문서: `docs/workpacks/planner-column-customization/README.md` / `automation-spec.json` / design-tokens.md / mobile-ux-rules.md / anchor-screens.md
> 검토일: 2026-05-10
> 검토자: design-critic
> 분류: anchor-extension (PLANNER_WEEK 기존 화면에 동적 컬럼 지원 확장)

## 종합 평가

**등급**: 통과 (Green)

**한 줄 요약**: SETTINGS 끼니 컬럼 관리 섹션(목록/추가/이름변경/삭제)이 기존 설정 화면 패턴에 자연스럽게 통합되었고, PLANNER_WEEK는 기존 `columns.map()` 구조가 3~5개 동적 컬럼을 올바르게 렌더링한다. 커스텀 컬럼명에 대한 fallback emoji(`🍽️`)가 제공되며, day card 식사 카운트도 `columns.length` 기반으로 동적 처리된다. 크리티컬 이슈 0건, 마이너 이슈 0건.

## 크리티컬 이슈 (수정 필수)

> 없음

## 마이너 이슈 (권장 수정)

> 없음

## 체크리스트 결과

### A. 요구사항 정합성
- [x] 컬럼 목록 조회(GET /planner/columns) 결과가 SETTINGS에 렌더링되는가 -- `loadColumns()` → `fetchPlannerColumns()` → sort by `sort_order` → `plannerColumns` state → `column-list` div에 `.map()` 렌더링.
- [x] 컬럼 추가(POST /planner/columns) 흐름이 구현되었는가 -- 추가 버튼 → `ColumnNameSheet` 바텀시트 → `handleAddColumn()` → `createPlannerColumn()` → 로컬 state 업데이트.
- [x] 컬럼 이름 변경(PATCH /planner/columns/:id) 흐름이 구현되었는가 -- 연필 아이콘 → `ColumnNameSheet` → `handleRenameColumn()` → `updatePlannerColumn()` → 로컬 state 업데이트.
- [x] 컬럼 삭제(DELETE /planner/columns/:id) 흐름이 구현되었는가 -- 휴지통 아이콘 → `ConfirmDialog` → `handleDeleteColumn()` → `deletePlannerColumn()` → 로컬 state 업데이트.
- [x] PLANNER_WEEK가 동적 컬럼을 렌더링하는가 -- `columns.map()` 기반, Zustand store의 `columns` 배열 사용.
- [x] 컬럼 수 제한(1~5)이 UI에서 적용되는가 -- 추가 버튼 `disabled` when `>= 5`, 삭제 버튼 `disabled` when `<= 1`.

### B. 공통 상태 커버리지
- [x] Loading 상태 포함 -- `columns-loading` testid, `Skeleton` 3개 표시.
- [x] Error 상태 포함 -- `columns-error` testid, 에러 메시지 + "다시 시도" 버튼.
- [x] Unauthorized 처리 -- `authState === "unauthorized"` 시 로그인 게이트 표시, 컬럼 관리 섹션 미노출.
- [x] Empty 상태 -- N/A (최소 1개 컬럼 보장).
- [x] Read-only 상태 -- N/A (설정 화면에 read-only 없음).

### C. API 에러 코드 처리
- [x] COLUMN_LIMIT_REACHED (409) -- 추가 시트에서 에러 메시지 표시.
- [x] COLUMN_NAME_DUPLICATE (409) -- 추가/이름변경 시트에서 에러 메시지 표시.
- [x] COLUMN_HAS_MEALS (409) -- 삭제 다이얼로그에서 에러 메시지 표시.
- [x] MIN_COLUMN_REQUIRED -- 삭제 버튼 `disabled` when `plannerColumns.length <= 1`.

### D. UX 품질
- [x] 터치 타겟 최소 44px 준수 -- 추가 버튼 `min-h-[44px]`, 이름변경/삭제 아이콘 버튼 `h-11 w-11`, 컬럼 행 `min-h-[52px]`.
- [x] 모바일 퍼스트 레이아웃 -- `px-4` 수평 여백, 기존 SETTINGS 패턴과 동일.
- [x] 전체 페이지 가로 스크롤 없음 -- 5-column PLANNER_WEEK E2E에서 `scrollWidth > innerWidth` 검증.
- [x] 핵심 액션 시각적 명확성 -- 추가 `--brand`, 삭제 확인 `--danger`, 이름변경/추가 저장 `--brand`.
- [x] 기존 SETTINGS 패턴 일관성 -- 동일한 `--surface` 카드, `--radius-lg`, `shadow-[var(--shadow-1)]`, `divide-y` 패턴 사용.

### E. 디자인 토큰 준수
- [x] CTA 버튼 `--brand` 사용 -- 추가 버튼, 저장하기 버튼.
- [x] 카드 배경 `--surface` 사용 -- 컬럼 관리 섹션 카드.
- [x] 섹션 라벨 `--text-3` 사용 -- "끼니 컬럼 관리" 라벨.
- [x] 보조 텍스트 `--text-4` 사용 -- 하단 "최소 1개 ~ 최대 5개" 안내.
- [x] 에러 텍스트 `--danger` 사용 -- 시트/다이얼로그 에러 메시지.
- [x] 카드 border-radius `--radius-lg` (16px) 준수 -- 컬럼 관리 카드.

## 통과 조건

- [x] 크리티컬 이슈 0개
- [x] 마이너 이슈 처리 또는 수용 결정 -- 해당 없음

**판정: Stage 4 통과 (Green)**. 남은 마이너 이슈는 없다.
