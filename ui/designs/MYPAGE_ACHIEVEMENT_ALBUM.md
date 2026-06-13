# MYPAGE Achievement Album

## Purpose

MYPAGE 상단을 "내 집밥 성장 프로필"처럼 보이게 한다. 사용자는 첫 화면에서 현재 등급, 레벨, XP, 주요 기록을 한 번에 보고, 자세한 내용은 `등급`, `업적`, `튜토리얼`, `알림` 버튼으로 들어간다.

## Reference Assets

- Concept board:
  - `docs/design/assets/spoon-grade-characters/concept-boards/mypage-achievement-album-prototype.png`
  - `docs/design/assets/spoon-grade-characters/concept-boards/mypage-achievement-album-prototype-v1.png`
- Grade character images:
  - `docs/design/assets/spoon-grade-characters/characters/clay-spoon.png`
  - `docs/design/assets/spoon-grade-characters/characters/wood-spoon.png`
  - `docs/design/assets/spoon-grade-characters/characters/steel-spoon.png`
  - `docs/design/assets/spoon-grade-characters/characters/silver-spoon.png`
  - `docs/design/assets/spoon-grade-characters/characters/gold-spoon.png`
  - `docs/design/assets/spoon-grade-characters/characters/diamond-spoon.png`
  - `docs/design/assets/spoon-grade-characters/characters/titanium-spoon.png`
- Grade badge icons:
  - `docs/design/assets/spoon-grade-characters/badge-icons/clay-spoon-badge.png`
  - `docs/design/assets/spoon-grade-characters/badge-icons/wood-spoon-badge.png`
  - `docs/design/assets/spoon-grade-characters/badge-icons/steel-spoon-badge.png`
  - `docs/design/assets/spoon-grade-characters/badge-icons/silver-spoon-badge.png`
  - `docs/design/assets/spoon-grade-characters/badge-icons/gold-spoon-badge.png`
  - `docs/design/assets/spoon-grade-characters/badge-icons/diamond-spoon-badge.png`
  - `docs/design/assets/spoon-grade-characters/badge-icons/titanium-spoon-badge.png`

## Screen Structure

### Profile Header

- Avatar, nickname, provider badge, edit/settings affordance
- Current grade icon + `Grade · Lv.N`
- XP bar + current/next XP + next level remaining helper
- Compact records:
  - cooking count
  - planner count
  - shopping count
- Action buttons:
  - `등급`
  - `업적`
  - `튜토리얼`
  - `알림`

The header should read as one profile module, not as separate cards placed next to each other.

### Grade Modal

- Shows all seven grades in order.
- Current grade is highlighted.
- Locked future grades show required level range and subdued image treatment.
- Mobile: bottom sheet.
- Desktop: modal/popover.

### Achievement Album Modal

- Category tabs:
  - 전체
  - 튜토리얼
  - 레시피
  - 플래너
  - 장보기
  - 요리
  - 팬트리
  - 남은요리
  - 레시피북
- Each category shows stamp cards.
- Earned: filled stamp/badge with earned date.
- Active: progress bar and `current / target`.
- Locked: muted stamp and short hint.
- No reward claim button.

### Tutorial Modal

- Uses the same achievement data as `tutorial` category.
- Shows six steps and overall completion.
- A step can link to the relevant feature path.
- Completion state should feel like an album being filled, not a checklist that punishes the user.

### Notification Archive Modal

- Filters:
  - 전체
  - 성장
  - 업적
  - 시스템
- Sort: newest first.
- Priority display follows server order:
  - level up
  - achievement or badge unlocked
  - tutorial completed
  - XP awarded

## Visual Rules

- Use the spoon grade images as collectible grade signals.
- Do not let the grade image dominate the first viewport on mobile.
- Keep surfaces clean and home-cooking oriented. The UI can borrow collection mechanics, but should not look like combat rank, gacha, or competitive leaderboard.
- Use stable dimensions for icons, grade images, stamp cards, progress bars, and buttons.
- Text must not overflow at 320px.
- Avoid nested cards inside the profile header.

## Responsive Rules

- 320px mobile:
  - Profile identity and grade/level must fit without overlap.
  - Action buttons can wrap to a 2x2 grid.
  - XP bar remains full width inside the header.
- 390px mobile:
  - Compact records can be three columns if text fits, otherwise icon + number only.
- Desktop:
  - Header stays content-height driven.
  - Achievement/archive panels do not stretch the profile header height.
  - Modal width should allow stamp grid without crowding.

## State Rules

- Loading:
  - Header skeleton for growth fields only.
- Empty:
  - `Clay · Lv.1`, XP 0, tutorial first step active.
- Error:
  - progress/gamification/archive failures are isolated.
- Read-only:
  - No claim button, no random reward, no competition.
- Unauthorized:
  - Existing MYPAGE auth gate.

## 35c Evidence Targets

- `mobile-320.png`
- `mobile-390.png`
- `desktop-1440.png`
- `desktop-1920.png`
- `grade-modal.png`
- `achievement-album-modal.png`
- `tutorial-modal.png`
- `notification-archive-modal.png`
- `soft-fail-progress.png`
- `soft-fail-gamification.png`
- `soft-fail-archive.png`
