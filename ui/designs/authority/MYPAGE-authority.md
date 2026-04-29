# MYPAGE Authority Precheck

> 대상 slice: `17a-mypage-overview-history` Stage 4 `authority_precheck`
> evidence:
> - mobile-default-screenshot: `ui/designs/evidence/17a-mypage-overview-history/MYPAGE-mobile.png`
> - mobile-narrow-screenshot: `ui/designs/evidence/17a-mypage-overview-history/MYPAGE-mobile-narrow.png`
> - design reference: `ui/designs/MYPAGE.md`
> - implementation reference: `components/mypage/mypage-screen.tsx`
> - page entry: `app/mypage/page.tsx`
> - api client: `lib/api/mypage.ts`
> - e2e reference: `tests/e2e/slice-17a-mypage.spec.ts`
> - vitest reference: `tests/mypage-screen.test.tsx`
> 검토일: 2026-04-30
> 검토자: Claude

## Verdict

- verdict: `pass`
- 한 줄 요약: MYPAGE 신규 화면은 프로필 섹션, 레시피북 탭(시스템 3개 + 커스텀 CRUD), 장보기 기록 탭(cursor pagination)이 모바일 기본/좁은 폭에서 정상 작동하며 Stage 5 public design review를 시작할 수 있다.

## Scorecard

| 항목 | 점수 | 메모 |
|------|------|------|
| Mobile UX | 4/5 | 375px와 320px 모두 프로필+탭바+카드 리스트가 page-level horizontal overflow 없이 유지된다. 프로필 스크롤 아웃 후 탭바 sticky가 작동한다. |
| Interaction Clarity | 4/5 | 시스템 레시피북은 ⋯ 메뉴 없음(불변성 UI 차단), 커스텀 레시피북은 ⋯→이름 변경/삭제가 명확하다. 삭제 확인 다이얼로그가 실수 방지 역할을 한다. |
| Visual Hierarchy | 4/5 | 프로필(닉네임 lg bold) → 탭 바(sm bold, brand 밑줄) → 섹션 헤더(sm semibold, text-3) → 카드(base semibold) 위계가 안정적이다. |
| Color / Material Fit | 4/5 | `--brand`, `--olive`, `--surface`, `--text-3`, `--line`, `--shadow-1` 등 Baemin-derived 토큰을 사용한다. 완료 뱃지 olive, 진행 중 뱃지 brand 구분이 PLANNER_WEEK 패턴과 일관적이다. |
| Familiar App Pattern Fit | 4/5 | 프로필 + 탭 전환 + 리스트 카드 패턴은 배민, 쿠팡이츠 등 국내 앱의 마이페이지 패턴을 따른다. |

## Mobile UX Rule Check

- Rule 1 (whole-page horizontal scroll): `pass`
- Rule 2 (scroll containment): `pass` — 탭바 sticky, 프로필 스크롤 포함, 하단 탭바 고정
- Rule 3 (primary CTA): `pass` — [+ 새 레시피북] CTA가 커스텀 섹션 하단에 위치
- Rule 3a (control proximity): `pass` — ⋯ 메뉴 버튼이 카드 우측에 위치, 터치 타겟 44x44
- Rule 4/4a/4b (familiar pattern + information grouping): `pass`
- Rule 5 (mobile sentinel): `pass` — 320px에서 패딩 축소, 시스템 레시피북 이름+count 한 행 표시 가능

## Contract / Policy Check

- 로그인 필수: `pass` (`SocialLoginButtons nextPath="/mypage"`)
- API wrapper 소비: `pass` (`lib/api/mypage.ts`에서 `{ success, data, error }` envelope 검증)
- 시스템 레시피북 불변성: `pass` (⋯ 메뉴가 시스템 책에 노출되지 않음, 서버 403 방어와 이중 차단)
- 커스텀 레시피북 CRUD: `pass` (생성 POST 201, 이름 변경 PATCH 200, 삭제 DELETE 200)
- 장보기 기록 cursor pagination: `pass` (IntersectionObserver 기반 자동 로드, `next_cursor` + `has_next` 소비)
- read-only: `N/A-pass` (이 화면에 read-only 모드 없음, 장보기 기록 read-only는 SHOPPING_DETAIL로 위임)

## 5 Mandatory States Check

| 상태 | 구현 | 비고 |
|------|------|------|
| Loading | `pass` | `MypageLoadingSkeleton` — 프로필 + 탭바 + 카드 3장 스켈레톤 |
| Empty | `pass` | 레시피북 탭: 커스텀 없을 시 "아직 만든 레시피북이 없어요" + CTA / 장보기 탭: 아이콘 + "저장된 장보기 기록이 없어요" + 플래너 링크 |
| Error | `pass` | "데이터를 불러오지 못했어요" + [다시 시도] 버튼 |
| Read-only | `N/A-pass` | 해당 없음 |
| Unauthorized | `pass` | `ContentState tone="gate"` + `SocialLoginButtons` + 홈 복귀 링크 |

## Accessibility Check

- Tab bar: `role="tablist"` + `role="tab"` + `aria-selected`: `pass`
- Tab panel: `role="tabpanel"`: `pass`
- System book cards: `role="listitem"` in `role="list"`: `pass`
- ⋯ menu button: `aria-haspopup="menu"` + `aria-label="레시피북명 옵션 메뉴"`: `pass`
- Context menu: `role="menu"` + `role="menuitem"`: `pass`
- Delete dialog: `role="alertdialog"` + `aria-modal="true"`: `pass`
- Create CTA: `aria-label="새 레시피북 만들기"`: `pass`
- Shopping infinite scroll: `aria-live="polite"`: `pass`
- 최소 터치 타겟 44x44: `pass` (min-h-11, w-11 등)

## Blockers

없음.

## Major Issues

없음.

## Minor Issues

| # | 위치 | 문제 | 제안 |
|---|------|------|------|
| 1 | 320px | 커스텀 레시피북 이름이 긴 경우 ⋯ 버튼과 겹칠 수 있다. 현재 truncate로 처리되어 blocker는 아니다. | Stage 5에서 20자 이상 이름의 320px 표시를 한 번 더 확인했다. `MYPAGE-mobile-narrow.png` 기준 겹침 없음. |
| 2 | 프로필 이미지 | fallback 이니셜 아바타가 단색(brand-soft) 배경이다. 시각적으로 단조로울 수 있다. | Stage 5에서 gradient 또는 패턴 배경 검토를 권장한다. |

## Evidence Status

- mobile-default (375px): `ui/designs/evidence/17a-mypage-overview-history/MYPAGE-mobile.png`
- mobile-narrow (320px): `ui/designs/evidence/17a-mypage-overview-history/MYPAGE-mobile-narrow.png`
- geometry check (320x568, `scrollY=0`): bottom nav `top=507.0625`, custom card `bottom=454`, create CTA `bottom=502`, horizontal overflow 없음 (`scrollWidth=320`, `clientWidth=320`)

> Note: 스크린샷 evidence는 dev 서버 + E2E route mock + authenticated override로 수집했다.

## Decision

- Stage 4 authority_precheck 결과: `통과`
- Stage 5 public design review 시작 가능 여부: `가능`
- 추가 보강 필요: Stage 5에서 320px 이름 길이와 fallback 아바타 디자인 lightweight 확인

## Stage 5 Codex Authority Review

- reviewer: Codex
- review date: 2026-04-30
- verdict: `pass`
- blocker_count: 0
- major_count: 0
- minor_count: 1

### Findings

- 320px first viewport overlap: `resolved` — bottom nav and MYPAGE content no longer intersect at `scrollY=0`.
- Long custom recipe book name: `pass` — text truncates before count/menu controls and keeps a visible gap from the fixed bottom tabs.
- Fallback avatar: `accepted` — simple initial avatar matches the temporary-but-polished MYPAGE shell and remains accessible through `aria-label="프로필 이니셜"`.
- System book emoji icons: `accepted` — no icon dependency exists in this repo, and the current app already uses small emoji accents in product UI. Kept as a low-risk visual cue rather than adding a dependency.

### Stage 5 Decision

- Design Status can move from `pending-review` to `confirmed` only after Claude `final_authority_gate` passes.
- Codex public design review: `approved`.
