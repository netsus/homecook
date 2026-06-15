# MYPAGE_GAMIFICATION Design Draft

## Purpose

33c gamification UI는 MYPAGE의 기존 프로필/progress 영역을 확장해 “집밥 기록이 쌓이는 느낌”을 만든다. 34c는 이 구조 위에 priority toast stack과 최근 성장 기록 archive surface를 추가한다. 참고 게임 이미지는 badge/rank/progress 구조만 참고하고, 시각 톤은 집밥 서비스의 차분한 카드, 작은 배지, 짧은 안내 문구로 낮춘다.

## Scope

- MYPAGE profile/progress 아래 대표 배지 row
- 현재 퀘스트 1~2개 요약
- 튜토리얼 퀘스트 1개
- 배지/성장 시스템 안내 modal 또는 bottom sheet
- source action 이후 priority toast stack
- MYPAGE 최근 성장 기록 archive surface
- SHOPPING_FLOW 장보기 묶음 안내 문구
- mobile 320/390px, desktop 1440px 대응

## Layout

### Mobile

1. Profile header
2. 33b compact progress bar
3. Badge strip
   - 대표 배지 1개
   - 최근 획득 배지 최대 2개
   - 안내 icon button
4. Quest panel
   - current quest 1개를 기본 노출
   - tutorial quest가 있으면 quest panel의 첫 row로 표시
   - “전체 보기”는 33c MVP에서는 modal expansion 정도로 제한하고 별도 full page는 만들지 않는다
5. Recent growth archive
   - 최신 live non-silent notification 목록
   - loading / empty / error를 MYPAGE core와 분리
   - 더 보기 버튼으로 cursor pagination
6. Existing MYPAGE menu/content

320px에서는 badge label이 두 줄로 늘어나는 것을 허용하지 않는다. badge는 icon + 짧은 label, quest는 title + progress line + small progress bar만 표시한다.

### Desktop

Desktop MYPAGE profile card 안에서 progress 아래에 badge strip과 quest summary를 묶는다. 오른쪽 content column을 침범하지 않고, profile card 내부 vertical rhythm을 유지한다.

## Components

### Badge Strip

- Shape: small rounded square icon with text label below or beside it.
- Max visible badges: mobile 3, desktop 4.
- Empty: “첫 배지는 첫 집밥 기록에서 시작돼요.”
- New state: tiny dot or “new” chip, not animated repeatedly.
- Locked state: guide modal 안에서만 보여주고 main strip에는 locked grid를 과하게 노출하지 않는다.

### Quest Panel

- Tone: “다음 집밥 루틴” rather than mission pressure.
- Row structure:
  - title
  - short description
  - `current / target`
  - slim progress bar
- Completed recent: “방금 달성” chip, no claim button.
- Tutorial quest examples:
  - 레시피 1개 저장하기
  - 이번 주 식사 1개 플래너에 올리기
  - 장보기 완료하기
  - 첫 요리 완료하기

### Badge Guide Modal

- Mobile: bottom sheet.
- Desktop: modal/popover anchored from guide button.
- Content sections:
  - 시스템 요약: “활동을 기록하면 배지와 퀘스트가 자동으로 쌓여요.”
  - XP source: 6개 canonical actions only (레시피 저장, 레시피북 생성, 장보기 완료, 요리 완료, 플래너 등록, 남은 요리 먹음).
  - Exclusions: ranking, pressure streak 없음.
  - Badge examples: earned/locked small list.
- Accessibility:
  - accessible title
  - close button
  - focus trap
  - ESC/backdrop close

### Priority Toast Stack

- Position: mobile bottom safe area above tab bar, desktop lower-right.
- Duration: short, user can ignore.
- Content:
  - server `title`
  - server `body`
  - type chip/tone for `level_up`, `achievement_unlocked`, `badge_unlocked`, `xp_awarded`
- It must not block source action success UI.
- It consumes `notifications.priority_unseen` in server order. The client does not recompute or reorder priority.
- Visible cap: mobile 2 toasts, desktop 3 toasts.
- Later items remain queued behind a collapsed `+N개의 새 소식 확인` summary.
- `level_up` has the strongest visual tone. `achievement_unlocked`, `badge_unlocked`, and `xp_awarded` remain calmer.
- Same `group_key` notifications keep server order and show a small “같은 활동” chip when the group has multiple items.
- `silent` notifications are never exposed.

### Recent Growth Archive

- Surface lives below the existing MYPAGE gamification card, not inside the profile header. 34d owns profile-header integration.
- Structure:
  - compact heading: “최근 성장 기록”
  - notification type chip
  - ISO date
  - title/body
  - optional “더 보기” button when `has_next=true`
- Read-only: no claim, delete, or reward CTA.
- Soft-fail: archive error does not block profile/progress/badge/quest surfaces.

## States

- `loading`: skeleton for badge strip, quest panel, and archive list independently.
- `empty`: first-use tutorial quest, first badge copy, and archive empty copy.
- `error`: soft-fail inline message, “성장 정보를 잠시 불러오지 못했어요.” / “성장 기록을 잠시 불러오지 못했어요.”
- `read-only`: no claim/reward button. only guide/dismiss/seen actions.
- `unauthorized`: MYPAGE auth gate owns this state.

## Visual Tone

- Avoid neon, metallic rank panels, large fantasy badges, treasure box CTA.
- Use mostly white/neutral surfaces with sage, coral, and small gold accents. Avoid a single beige/cream palette.
- Badge icons may be simple food/home symbols.
- Progress bar can reuse 33b compact progress scale.
- Quest cards should be dense and calm, not marketing hero cards.

## Prototype

Static prototype path:

- `ui/designs/prototypes/33c-badges-quests-toasts-tutorial/index.html`

34c Stage 4 evidence required:

- `ui/designs/evidence/34c-growth-notification-ui/mobile-390.png`
- `ui/designs/evidence/34c-growth-notification-ui/mobile-320.png`
- `ui/designs/evidence/34c-growth-notification-ui/desktop-1440.png`
- `ui/designs/evidence/34c-growth-notification-ui/toast-stack-mobile.png`
- `ui/designs/evidence/34c-growth-notification-ui/toast-stack-desktop.png`
- `ui/designs/evidence/34c-growth-notification-ui/toast-levelup.png`
- `ui/designs/evidence/34c-growth-notification-ui/archive-modal.png`
- `ui/designs/evidence/34c-growth-notification-ui/archive-empty.png`
- `ui/designs/evidence/34c-growth-notification-ui/shopping-copy.png`
