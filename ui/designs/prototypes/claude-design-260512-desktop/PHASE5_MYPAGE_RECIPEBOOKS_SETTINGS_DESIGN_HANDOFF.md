# Phase 5 Design Handoff: MyPage, Recipebooks, Settings

VERDICT: **READY_FOR_CODEX**

Date: 2026-05-14
Phase: 5 of 8
Plan: `.omx/plans/desktop-prototype-modern-webapp-redesign-ralplan-20260513.md`
Ledger: `PHASE0_PARITY_LEDGER.md`
CSS target: `styles-phase5.css` (loaded after `styles-phase4.css`)
Evidence target: `ui/designs/evidence/desktop-modern-redesign/phase-5/`

## 1. Phase 5 Rows To Close (13 rows)

### Screens (4)

| Row | Current status | Phase 5 action |
| --- | --- | --- |
| `screen:MYPAGE` | `open` | Redesign with tab-based sub-surfaces |
| `screen:RECIPEBOOKS` | `verified-foundation` | Fix card grid, kill huge-photo-tiny-text bug |
| `screen:RECIPEBOOK_DETAIL` | `open` | Implement with count consistency, delete affordance |
| `screen:SETTINGS` | `open` | Add MealColumns management, danger zone |

### Surfaces (5)

| Row | Current status | Phase 5 action |
| --- | --- | --- |
| `surface:MYPAGE::MyPageSaved` | `open` | Tab panel with saved recipe grid |
| `surface:MYPAGE::MyPageAccount` | `open` | Tab panel with account/provider info |
| `surface:MYPAGE::MyPageNotif` | `open` | Tab panel with notification preferences |
| `surface:MYPAGE::MyPageHelp` | `open` | Tab panel with FAQ/help content |
| `surface:SETTINGS::MealColumns` | `open` | Column management section in Settings |

### Modals (4)

| Row | Current status | Phase 5 action |
| --- | --- | --- |
| `modal:SETTINGS::NicknameModal` | `open` | Already implemented; verify and screenshot |
| `modal:SETTINGS::LogoutModal` | `open` | Already implemented; verify and screenshot |
| `modal:SETTINGS::AccountDeleteConfirm` | missing | Create destructive confirmation dialog |
| `modal:MYPAGE::RecipebookDeleteConfirm` | missing | Create destructive confirmation for custom books only |

---

## 2. User-Reported Problem: Recipebook Card Layout

### Current bug

`RecipebooksScreen` renders `RecipebookCard` components with a `.recipebook-mosaic` (16:10 aspect ratio, ~200px+ tall) followed by a tiny `.recipebook-card-body` containing the title and count on separate lines. At desktop widths, the mosaic dominates and the text is disproportionately small — "내가 추가한 레시피" on one line, "12개" on the next, both in small meta text below a massive image block.

### Root cause

The `.recipebook-mosaic` has `aspect-ratio: 16/10` with `width: 100%`, making it fill the card width and grow tall. The body text below has no minimum height or visual weight to balance. The card structure is vertical (image-above-text), which works for recipe photo cards but fails for recipebook collection cards where the text metadata matters more than any single thumbnail.

### Required fix

Replace the vertical mosaic-above-text card with a **horizontal card layout** where:

1. A compact square mosaic (120px x 120px at base, scaling up at wider breakpoints) sits on the left
2. Title, count, and type badge sit to the right with proper hierarchy
3. The mosaic is a 2x2 thumbnail grid (4 cells) inside the fixed square, not a full-width banner

This matches the pattern used by modern recipe/collection apps (e.g., Pinterest boards, Apple Photos albums) where the collection card emphasizes the title and metadata, not a giant photo strip.

---

## 3. Exact UX Design Per Row

### 3.1 `screen:MYPAGE` — Tab-Based MyPage

**Layout:** Full-width hero profile section at top (keep existing hero structure), followed by a horizontal tab bar with 4 named tabs. Each tab renders its own content panel below.

**Component:** `MyPageScreen` in `screens-2.jsx`

**Tabs:**

| Tab key | Label | Icon | Content |
| --- | --- | --- | --- |
| `saved` | 저장한 레시피 | `bookmark` | Recipe grid from saved set |
| `account` | 계정 관리 | `user` | Account info, provider, nickname edit, logout, delete |
| `notif` | 알림 설정 | `bell` | Notification toggle rows |
| `help` | 도움말 | `question` | FAQ accordion or static help rows |

**Hero section (keep existing):**
- Avatar circle with initials
- Nickname with edit pencil button
- Provider badge ("카카오 로그인 됨")
- Stats row: 저장한 레시피 38 | 다먹은 끼니 26 | 플래너 등록 14

**Tab bar spec:**
- Horizontal row of 4 text+icon tabs, left-aligned
- Active tab: `color: var(--brand); border-bottom: 2px solid var(--brand); font-weight: 600`
- Inactive tab: `color: var(--text-3); border-bottom: 2px solid transparent`
- Tab bar has a bottom border: `1px solid var(--line)`
- Spacing: `gap: 0; each tab padding: 12px 20px`
- Tab bar sits flush below the hero section

**Below the tabs:** a content area that switches based on active tab. The content includes quick-nav links to deeper screens (Recipebooks, Shopping Lists, Leftovers, Ate List, Settings) as contextual cards within the relevant tab, not as a separate section.

**Removed from current design:**
- The "활동" section with 4 `meta-row` buttons (recipebooks, leftovers, ate list, shopping) — these become contextual links within tabs
- The "설정" section with settings and logout rows — these move into the Account tab

### 3.2 `surface:MYPAGE::MyPageSaved` — Saved Recipes Tab

**Content:** A grid of saved recipes using the existing `photo-card` pattern from HOME.

**Structure:**
```
[Tab: 저장한 레시피 (active)]

  ScreenHeader:
    title: "저장한 레시피"
    lead: "38개의 레시피를 저장했어요"

  [photo-card grid — 3 cols at 1024, 4 cols at 1280+]
    Each card: thumbnail, title, source, cookTime
    Click → push({ screen: "RECIPE", recipeId })

  Quick nav cards (below grid):
    ┌──────────────────────────────────┐
    │ 📖 레시피북 관리                   │
    │ 저장한·내가 추가한·커스텀 북 6개    →  │
    └──────────────────────────────────┘
```

**Data:** Use `savedSet` to filter `DA.RECIPES` and show saved recipes. For demo, show all recipes in `savedSet` (r3, r5 by default, plus any runtime additions).

**Empty state:** `StatePanel` with icon `bookmark`, title "저장한 레시피가 없어요", desc "홈에서 마음에 드는 레시피를 저장해보세요."

### 3.3 `surface:MYPAGE::MyPageAccount` — Account Tab

**Content:** Account information and dangerous actions.

**Structure:**
```
[Tab: 계정 관리 (active)]

  Section: 프로필
    ┌─────────────────────────────────────────┐
    │ 닉네임:  한지영                    [변경]  │
    │ 로그인:  카카오                           │
    └─────────────────────────────────────────┘

  Section: 계정 작업
    ┌─────────────────────────────────────────┐
    │ 🔓 로그아웃                          →   │
    │ 카카오 계정에서 로그아웃합니다              │
    ├─────────────────────────────────────────┤
    │ ⚙️ 설정                             →   │
    │ 알림 · 단위 · 테마 · 끼니 관리             │
    └─────────────────────────────────────────┘

  Section: 위험 영역
    ┌─────────────────────────────────────────┐
    │ 🗑️ 계정 삭제                              │
    │ 모든 데이터가 영구 삭제됩니다                │
    │                          [계정 삭제하기]   │
    └─────────────────────────────────────────┘
```

**Interactions:**
- 닉네임 [변경] → `onOpenNickname()` → NicknameModal
- 로그아웃 row → `onOpenLogout()` → LogoutModal
- 설정 row → `push({ screen: "SETTINGS" })`
- 계정 삭제하기 button → `AccountDeleteConfirm` modal (new)

**Danger zone styling:** Border `1px solid var(--error)` with `background: rgba(255,59,48,0.04)`. Button uses `btn-danger` class.

### 3.4 `surface:MYPAGE::MyPageNotif` — Notification Tab

**Content:** Notification preference toggles using `SwitchToggle` pattern from SettingsScreen.

**Structure:**
```
[Tab: 알림 설정 (active)]

  Section: 푸시 알림
    ┌────────────────────────────────────────────┐
    │ 요리 시간 알림                    [toggle]   │
    │ 등록한 끼니 30분 전 알림                      │
    ├────────────────────────────────────────────┤
    │ 장보기 리마인드                   [toggle]   │
    │ 장보기 미완료 시 오전 알림                     │
    ├────────────────────────────────────────────┤
    │ 플래너 요약                      [toggle]   │
    │ 매주 월요일 주간 식단 요약                     │
    └────────────────────────────────────────────┘

  Section: 이메일
    ┌────────────────────────────────────────────┐
    │ 주간 리포트                      [toggle]   │
    │ 이번주 요리 기록 요약 이메일                    │
    └────────────────────────────────────────────┘
```

**State:** All toggles are demo-only local state. Use `useState` for each toggle, no persistence.

### 3.5 `surface:MYPAGE::MyPageHelp` — Help Tab

**Content:** Static FAQ/help content.

**Structure:**
```
[Tab: 도움말 (active)]

  Section: 자주 묻는 질문
    ┌────────────────────────────────────────────┐
    │ ▸ 플래너에 끼니를 추가하는 방법              │
    │ ▸ 레시피북을 만들고 관리하는 방법             │
    │ ▸ 팬트리 재료를 등록하는 방법                │
    │ ▸ 장보기 리스트가 자동으로 만들어지나요?       │
    │ ▸ 요리모드는 데스크탑에서 사용할 수 있나요?    │
    └────────────────────────────────────────────┘

  Section: 문의
    ┌────────────────────────────────────────────┐
    │ 이메일 문의: help@homecook.kr               │
    │ 카카오톡 채널: @홈쿡                         │
    └────────────────────────────────────────────┘
```

**FAQ behavior:** Each FAQ row is an expandable disclosure (`<details>/<summary>` or toggle state). Clicking expands a static paragraph answer. This is a static prototype — answers can be 1-2 sentence placeholders.

### 3.6 `screen:RECIPEBOOKS` — Fixed Card Grid

**Layout:** Breadcrumb → ScreenHeader → Two sections (자동 분류 / 커스텀) → each with a responsive grid.

**Card redesign (RecipebookCard):**

Replace the current vertical mosaic-above-text with a **horizontal card**:

```
┌──────────────────────────────────────────────────┐
│ ┌──────────┐                                     │
│ │ [t1][t2] │  내가 추가한 레시피                    │
│ │ [t3][t4] │  12개 레시피 · 내가 추가한              │
│ └──────────┘                                 →   │
└──────────────────────────────────────────────────┘
```

**Card HTML structure:**
```jsx
<button className="recipebook-card-h" onClick={onClick}>
  <div className="recipebook-card-mosaic-sq">
    {book.thumbs.slice(0,4).map((t,i) => (
      <div key={i} className="recipebook-mosaic-cell-sq">
        <img src={t} alt="" />
      </div>
    ))}
  </div>
  <div className="recipebook-card-info">
    <div className="recipebook-card-title">{book.title}</div>
    <div className="recipebook-card-count tabular">{book.count}개 레시피</div>
    {book.type === "custom" && (
      <span className="recipebook-card-badge">커스텀</span>
    )}
  </div>
  <Icon name="chevR" size={16} color="var(--text-4)" />
</button>
```

**Card CSS spec:**
```css
.recipebook-card-h {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 16px;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--surface);
  text-align: left;
  width: 100%;
  cursor: pointer;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.recipebook-card-h:hover {
  border-color: rgba(0,0,0,0.16);
  box-shadow: var(--shadow-card);
}

.recipebook-card-mosaic-sq {
  width: 80px;
  height: 80px;
  flex-shrink: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
  gap: 2px;
  border-radius: var(--r-sm);
  overflow: hidden;
}

.recipebook-mosaic-cell-sq {
  overflow: hidden;
  background: var(--image-placeholder);
}
.recipebook-mosaic-cell-sq img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.recipebook-card-info {
  flex: 1;
  min-width: 0;
}
.recipebook-card-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-1);
  line-height: 1.3;
}
.recipebook-card-count {
  font-size: 13px;
  color: var(--text-3);
  margin-top: 2px;
}
.recipebook-card-badge {
  display: inline-block;
  font-size: 11px;
  padding: 2px 8px;
  margin-top: 6px;
  border-radius: var(--r-pill);
  background: var(--brand-wash);
  color: var(--brand-deep);
  font-weight: 500;
}
```

**Grid layout:** The recipebook cards now use a **list layout** (single column) within each section, not a multi-column grid. This is because the horizontal card layout naturally fills width, and a list is more scannable for collections.

```css
.recipebook-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
```

**At 1280px+:** Switch to a 2-column grid if desired:
```css
@media (min-width: 1280px) {
  .recipebook-list {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }
}
```

**ScreenHeader right action:**
```jsx
right={
  <div className="row gap-2">
    <Button variant="primary" leftIcon="plus" onClick={onCreateBook}>
      새 레시피북
    </Button>
  </div>
}
```

### 3.7 `screen:RECIPEBOOK_DETAIL` — Recipe List With Actions

**Layout:** Breadcrumb → ScreenHeader with book info and actions → Recipe grid.

**Component changes to `RecipebookDetailScreen` in `screens-3.jsx`:**

Add new props:
- `onDeleteBook` — triggers `RecipebookDeleteConfirm` (custom books only)
- `onRemoveRecipe` — removes a recipe from the book (toast only, demo)
- `savedSet` — to show save state on recipe cards

**ScreenHeader:**
```jsx
<ScreenHeader
  title={book.title}
  lead={`${book.count}개의 레시피`}
  right={book.type === "custom" ? (
    <div className="row gap-2">
      <Button variant="tertiary" leftIcon="edit">북 편집</Button>
      <Button variant="ghost" leftIcon="trash" onClick={onDeleteBook}>삭제</Button>
    </div>
  ) : null}
/>
```

**Recipe grid:** Use existing `picker-recipe-grid` with `PickerRecipeCard` or a modified `photo-card` — 3 cols at 1024, 4 at 1280+.

**Use `recipesForBook(bookId)`** from screens-3.jsx (already exists) to get recipe list. This ensures count/content consistency.

**Empty state:** `StatePanel` with icon `book`, title "이 레시피북은 비어 있어요", desc "레시피를 저장할 때 이 북에 담아보세요."

### 3.8 `screen:SETTINGS` — Full Settings Surface

**Layout:** Breadcrumb → ScreenHeader → Sections: 끼니 관리, 알림, 단위, 테마, 계정, 위험 영역.

**Existing sections to keep:** 알림 (push toggle), 단위 (metric/cup segmented), 테마 (light/dark/system segmented).

**New section: 끼니 관리 (`surface:SETTINGS::MealColumns`)**

Insert as the FIRST section, before 알림:

```
Section: 끼니 관리
  현재 등록된 식사 시간대를 관리합니다.

  ┌──────────────────────────────────────────────┐
  │ 아침       기본 컬럼 · 삭제 불가         [—]   │
  │ 점심       기본 컬럼 · 삭제 불가         [—]   │
  │ 저녁       기본 컬럼 · 삭제 불가         [—]   │
  └──────────────────────────────────────────────┘
  
  Rules displayed below the list:
  · 최소 2개, 최대 5개 컬럼
  · 기본 3개(아침/점심/저녁)는 삭제 불가
  · 컬럼 추가 시 플래너 그리드에 행이 추가됨
  
  [+ 끼니 추가] button (disabled if 5 columns reached)
```

**MealColumns component spec:**

```jsx
function MealColumnsEditor() {
  // Use DA.MEAL_COLUMNS as the source — read-only demo
  const cols = DA.MEAL_COLUMNS; // [{id, name}]
  const isDefault = (col) => ["col-b","col-l","col-d"].includes(col.id);
  const canAdd = cols.length < 5;
  const canDelete = (col) => !isDefault(col) && cols.length > 2;

  return (
    <div className="meal-columns-editor">
      <div className="meal-columns-list">
        {cols.map(col => (
          <div key={col.id} className="meal-col-row">
            <Icon name="drag" size={14} color="var(--text-4)" />
            <span className="meal-col-name">{col.name}</span>
            {isDefault(col) && (
              <span className="meal-col-badge">기본</span>
            )}
            <button
              className="meal-col-delete"
              disabled={!canDelete(col)}
              onClick={() => toast(`${col.name} 삭제 (데모)`)}
              aria-label={`${col.name} 삭제`}
            >
              <Icon name="trash" size={14} />
            </button>
          </div>
        ))}
      </div>
      <Button
        variant="tertiary"
        leftIcon="plus"
        disabled={!canAdd}
        onClick={() => toast("끼니 추가 (데모)")}
      >
        끼니 추가
      </Button>
      <div className="meal-col-rules">
        <p>최소 2개, 최대 5개의 끼니를 등록할 수 있어요.</p>
        <p>기본 끼니(아침/점심/저녁)는 삭제할 수 없어요.</p>
      </div>
    </div>
  );
}
```

**New section: 위험 영역 (Danger Zone)**

Insert as the LAST section:

```
Section: 위험 영역
  ┌──────────────────────────────────────────────┐
  │ 🗑️ 계정 삭제                                  │
  │ 모든 레시피북, 플래너, 장보기 기록이            │
  │ 영구적으로 삭제됩니다.                          │
  │                                               │
  │                         [계정 삭제하기]         │
  └──────────────────────────────────────────────┘
```

**Danger zone CSS:**
```css
.settings-danger {
  border: 1px solid var(--error);
  border-radius: var(--r-md);
  padding: 20px 24px;
  background: rgba(255,59,48,0.03);
}
.settings-danger .settings-row-title {
  color: var(--error);
  font-weight: 600;
}
```

**Settings needs new props:**
- `onOpenNickname` — passed through from App
- `onOpenLogout` — passed through from App
- `onDeleteAccount` — opens AccountDeleteConfirm
- `toast` — for demo actions

### 3.9 `modal:SETTINGS::NicknameModal`

Already implemented in `modals.jsx:538-557`. No code changes needed.

**Phase 5 action:** Verify it opens correctly from both MyPage Account tab and Settings, screenshot at 1280px.

### 3.10 `modal:SETTINGS::LogoutModal`

Already implemented in `modals.jsx:560-574`. No code changes needed.

**Phase 5 action:** Verify it opens correctly, screenshot at 1280px.

### 3.11 `modal:SETTINGS::AccountDeleteConfirm` (NEW)

**Trigger:** "계정 삭제하기" button in Settings danger zone or MyPage Account tab.

**Use existing `ConfirmDialog` from `components.jsx`** — do NOT create a new modal component. Instead, call `openConfirm()` with destructive configuration:

```jsx
openConfirm({
  title: "정말 계정을 삭제할까요?",
  message: "모든 레시피북, 플래너 기록, 장보기 내역이 영구적으로 삭제됩니다. 이 작업은 되돌릴 수 없어요.",
  confirmLabel: "계정 삭제",
  cancelLabel: "취소",
  destructive: true,
  icon: "trash",
  onConfirm: () => {
    toast("계정이 삭제되었습니다 (데모)");
    goTab("HOME");
  },
});
```

**This reuses the existing `ConfirmDialog` with `destructive: true`**, which already renders `btn-danger` and `.confirm-icon.danger` styling from Phase 3.

### 3.12 `modal:MYPAGE::RecipebookDeleteConfirm` (NEW)

**Trigger:** Delete button on `RecipebookDetailScreen` for custom books only.

**Also uses existing `ConfirmDialog`:**

```jsx
openConfirm({
  title: `"${book.title}" 레시피북을 삭제할까요?`,
  message: "레시피북만 삭제되며, 안에 담긴 레시피는 그대로 남아요.",
  confirmLabel: "삭제",
  cancelLabel: "취소",
  destructive: true,
  icon: "trash",
  onConfirm: () => {
    toast("레시피북을 삭제했어요 (데모)");
    pop(); // return to recipebooks list
  },
});
```

**Important:** Only custom books (`book.type === "custom"`) show the delete button. System books (my_added, saved, liked) must NOT have a delete action.

---

## 4. Route/State Model Changes in `app.jsx`

### 4.1 New state

```jsx
// Account delete confirm — reuses existing openConfirm
// No new modal state needed; AccountDeleteConfirm and RecipebookDeleteConfirm
// both go through the existing confirmDialog state.

// No new stack screens needed — all Phase 5 screens already exist in routing.
```

### 4.2 Modified screen routing

**`MYPAGE` case** — pass additional props:

```jsx
} else if (s === "MYPAGE") {
  body = <MyPageScreen
    account={account}
    savedSet={savedSet}                    // NEW
    onSaveToggle={toggleSave}              // NEW
    onGoRecipebooks={() => push({ screen: "RECIPEBOOKS" })}
    onGoShoppingLists={() => push({ screen: "SHOPPING_LISTS" })}
    onGoLeftovers={() => push({ screen: "LEFTOVERS" })}
    onGoAteList={() => push({ screen: "ATE_LIST" })}
    onOpenSettings={() => push({ screen: "SETTINGS" })}
    onOpenNickname={() => setNickname(true)}
    onOpenLogout={() => setLogout(true)}
    onOpenRecipe={(rid) => push({ screen: "RECIPE", recipeId: rid })}  // NEW
    onDeleteAccount={() => openConfirm({                                // NEW
      title: "정말 계정을 삭제할까요?",
      message: "모든 레시피북, 플래너 기록, 장보기 내역이 영구적으로 삭제됩니다. 이 작업은 되돌릴 수 없어요.",
      confirmLabel: "계정 삭제",
      cancelLabel: "취소",
      destructive: true,
      icon: "trash",
      onConfirm: () => { toast("계정이 삭제되었습니다 (데모)"); goTab("HOME"); },
    })}
    toast={toast}                          // NEW
  />;
```

**`RECIPEBOOK_DETAIL` case** — pass delete and confirm props:

```jsx
} else if (s === "RECIPEBOOK_DETAIL") {
  const book = DA.RECIPEBOOKS.find(b => b.id === cur.bookId);
  body = <RecipebookDetailScreen
    bookId={cur.bookId}
    onBack={pop}
    onOpenRecipe={(rid) => push({ screen: "RECIPE", recipeId: rid })}
    onDeleteBook={book?.type === "custom" ? () => openConfirm({         // NEW
      title: `"${book.title}" 레시피북을 삭제할까요?`,
      message: "레시피북만 삭제되며, 안에 담긴 레시피는 그대로 남아요.",
      confirmLabel: "삭제",
      cancelLabel: "취소",
      destructive: true,
      icon: "trash",
      onConfirm: () => { toast("레시피북을 삭제했어요 (데모)"); pop(); },
    }) : null}
    toast={toast}                                                       // NEW
  />;
```

**`SETTINGS` case** — pass more props:

```jsx
} else if (s === "SETTINGS") {
  body = <SettingsScreen
    onBack={pop}
    account={account}
    onOpenNickname={() => setNickname(true)}    // NEW
    onOpenLogout={() => setLogout(true)}         // NEW
    onDeleteAccount={() => openConfirm({        // NEW
      title: "정말 계정을 삭제할까요?",
      message: "모든 레시피북, 플래너 기록, 장보기 내역이 영구적으로 삭제됩니다. 이 작업은 되돌릴 수 없어요.",
      confirmLabel: "계정 삭제",
      cancelLabel: "취소",
      destructive: true,
      icon: "trash",
      onConfirm: () => { toast("계정이 삭제되었습니다 (데모)"); goTab("HOME"); },
    })}
    toast={toast}                               // NEW
  />;
```

### 4.3 No new modals to mount in App

`AccountDeleteConfirm` and `RecipebookDeleteConfirm` both route through the existing `<HC_.ConfirmDialog>` already mounted in App. No new modal components to instantiate.

---

## 5. Component Additions/Modifications By File

### 5.1 `screens-2.jsx` — MyPageScreen rewrite + RecipebooksScreen fix

**MyPageScreen** — full rewrite:

```
Props added: savedSet, onSaveToggle, onOpenRecipe, onDeleteAccount, toast
Props kept: account, onGoRecipebooks, onGoShoppingLists, onGoLeftovers,
            onGoAteList, onOpenSettings, onOpenNickname, onOpenLogout

Internal state:
  const [activeTab, setActiveTab] = useState("saved");

Structure:
  <main className="screen mypage">
    {/* Hero — keep existing */}
    <MyPageHero ... />

    {/* Tab bar */}
    <div className="mypage-tabs">
      <MyPageTab id="saved"   label="저장한 레시피" icon="bookmark" />
      <MyPageTab id="account" label="계정 관리"    icon="user"     />
      <MyPageTab id="notif"   label="알림 설정"    icon="bell"     />
      <MyPageTab id="help"    label="도움말"       icon="question" />
    </div>

    {/* Tab panels */}
    {activeTab === "saved"   && <MyPageSavedPanel ... />}
    {activeTab === "account" && <MyPageAccountPanel ... />}
    {activeTab === "notif"   && <MyPageNotifPanel />}
    {activeTab === "help"    && <MyPageHelpPanel />}
  </main>
```

**RecipebooksScreen** — card layout fix:

- Replace `<RecipebookCard>` with new `<RecipebookCardH>` horizontal card
- Replace `.recipebook-grid` with `.recipebook-list`
- Keep section structure (자동 분류 / 커스텀)

### 5.2 `screens-3.jsx` — RecipebookDetailScreen + SettingsScreen upgrades

**RecipebookDetailScreen:**
- Accept new props: `onDeleteBook`, `toast`
- Add delete button in header (custom books only)
- Use `recipesForBook(bookId)` for content (already exists)
- Add empty state

**SettingsScreen:**
- Accept new props: `onOpenNickname`, `onOpenLogout`, `onDeleteAccount`, `toast`
- Add `MealColumnsEditor` section at top
- Add danger zone section at bottom
- Add nickname/logout links in account section

### 5.3 `modals.jsx` — No new modal components

Both new destructive confirmations route through existing `ConfirmDialog`. No changes to modals.jsx.

### 5.4 `components.jsx` — No changes

All needed primitives (ConfirmDialog, SwitchToggle, Icon, etc.) already exist.

### 5.5 `data.jsx` — Minor additions

Add FAQ data for help tab:

```jsx
const FAQ_ITEMS = [
  {
    q: "플래너에 끼니를 추가하는 방법",
    a: "플래너 화면에서 빈 셀의 + 버튼을 누르거나, 레시피 상세에서 '플래너에 추가'를 선택하세요.",
  },
  {
    q: "레시피북을 만들고 관리하는 방법",
    a: "마이페이지 > 레시피북에서 '새 레시피북' 버튼으로 커스텀 북을 만들 수 있어요.",
  },
  {
    q: "팬트리 재료를 등록하는 방법",
    a: "팬트리 화면에서 재료 카드를 클릭하면 보유/없음 상태를 전환할 수 있어요.",
  },
  {
    q: "장보기 리스트가 자동으로 만들어지나요?",
    a: "네, 플래너에 등록한 끼니의 재료에서 팬트리 보유 재료를 빼고 자동으로 장보기 리스트를 만들어줘요.",
  },
  {
    q: "요리모드는 데스크탑에서 사용할 수 있나요?",
    a: "요리모드는 현재 모바일 앱에서만 지원됩니다. 데스크탑에서는 레시피 확인과 장보기를 활용하세요.",
  },
];
```

Add to `window.HC_DATA` exports:
```jsx
FAQ_ITEMS,
```

### 5.6 `app.jsx` — Prop threading only

No new modal state. Only the prop additions described in section 4.

---

## 6. CSS: `styles-phase5.css`

### 6.1 Loading order

```html
<!-- In index.html, after styles-phase4.css -->
<link rel="stylesheet" href="styles-phase5.css" />
```

### 6.2 Complete CSS spec

```css
/* ============================================
   Phase 5 — MyPage, Recipebooks, Settings
   ============================================ */

/* --- MyPage tabs --- */
.mypage-tabs {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--line);
  margin: 0 -32px;
  padding: 0 32px;
}
.mypage-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 12px 20px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-3);
  border: none;
  background: none;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: color 0.15s ease, border-color 0.15s ease;
  white-space: nowrap;
}
.mypage-tab:hover {
  color: var(--text-2);
}
.mypage-tab.active {
  color: var(--brand);
  border-bottom-color: var(--brand);
  font-weight: 600;
}
.mypage-tab:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: -2px;
}

.mypage-panel {
  padding-top: 32px;
}

/* --- MyPage sub-panels --- */

/* Saved panel recipe grid */
.mypage-saved-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 20px;
}
@media (min-width: 1280px) {
  .mypage-saved-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

/* Account panel */
.mypage-account-section {
  margin-bottom: 32px;
}
.mypage-account-section:last-child {
  margin-bottom: 0;
}

.account-profile-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 20px;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--surface);
}
.account-profile-info {
  flex: 1;
}
.account-profile-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-1);
}
.account-profile-provider {
  font-size: 13px;
  color: var(--text-3);
  margin-top: 2px;
}

/* Notification toggles */
.notif-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 0;
  border-bottom: 1px solid var(--line);
}
.notif-row:last-child {
  border-bottom: none;
}
.notif-info {
  flex: 1;
}
.notif-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-1);
}
.notif-desc {
  font-size: 13px;
  color: var(--text-3);
  margin-top: 2px;
}

/* Help / FAQ */
.faq-list {
  display: flex;
  flex-direction: column;
  gap: 0;
}
.faq-item {
  border-bottom: 1px solid var(--line);
}
.faq-item:last-child {
  border-bottom: none;
}
.faq-question {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 14px 0;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-1);
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
}
.faq-question:hover {
  color: var(--brand);
}
.faq-chevron {
  margin-left: auto;
  transition: transform 0.15s ease;
  flex-shrink: 0;
}
.faq-chevron.open {
  transform: rotate(90deg);
}
.faq-answer {
  padding: 0 0 14px 22px;
  font-size: 14px;
  color: var(--text-2);
  line-height: 1.6;
}
.faq-contact {
  padding: 16px 20px;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--bg-alt);
}
.faq-contact-row {
  font-size: 14px;
  color: var(--text-2);
  padding: 4px 0;
}

/* Quick nav card (from saved tab to recipebooks) */
.mypage-quick-nav {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--bg-alt);
  width: 100%;
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s ease;
  margin-top: 24px;
}
.mypage-quick-nav:hover {
  border-color: var(--brand);
}
.mypage-quick-nav-body {
  flex: 1;
}
.mypage-quick-nav-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-1);
}
.mypage-quick-nav-desc {
  font-size: 13px;
  color: var(--text-3);
  margin-top: 2px;
}

/* --- Recipebook card horizontal --- */
.recipebook-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
@media (min-width: 1280px) {
  .recipebook-list {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }
}

.recipebook-card-h {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 12px 16px;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--surface);
  text-align: left;
  width: 100%;
  cursor: pointer;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
}
.recipebook-card-h:hover {
  border-color: rgba(0,0,0,0.16);
  box-shadow: var(--shadow-card);
  transform: translateY(-1px);
}
.recipebook-card-h:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}

.recipebook-card-mosaic-sq {
  width: 80px;
  height: 80px;
  flex-shrink: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
  gap: 2px;
  border-radius: var(--r-sm);
  overflow: hidden;
  background: var(--image-placeholder);
}
@media (min-width: 1440px) {
  .recipebook-card-mosaic-sq {
    width: 96px;
    height: 96px;
  }
}

.recipebook-mosaic-cell-sq {
  overflow: hidden;
  background: var(--image-placeholder);
}
.recipebook-mosaic-cell-sq img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.recipebook-card-info {
  flex: 1;
  min-width: 0;
}
.recipebook-card-info .recipebook-card-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-1);
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.recipebook-card-info .recipebook-card-count {
  font-size: 13px;
  color: var(--text-3);
  margin-top: 2px;
}
.recipebook-card-badge {
  display: inline-block;
  font-size: 11px;
  padding: 2px 8px;
  margin-top: 6px;
  border-radius: var(--r-pill);
  background: var(--brand-wash);
  color: var(--brand-deep);
  font-weight: 500;
}

/* --- Recipebook detail --- */
.recipebook-detail-actions {
  display: flex;
  gap: 8px;
}

/* --- Settings MealColumns --- */
.meal-columns-editor {
  margin-top: 8px;
}
.meal-columns-list {
  display: flex;
  flex-direction: column;
  gap: 0;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  overflow: hidden;
}
.meal-col-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--line);
  background: var(--surface);
}
.meal-col-row:last-child {
  border-bottom: none;
}
.meal-col-name {
  flex: 1;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-1);
}
.meal-col-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: var(--r-pill);
  background: var(--bg-alt);
  color: var(--text-3);
  font-weight: 500;
}
.meal-col-delete {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  background: none;
  border-radius: var(--r-sm);
  color: var(--text-3);
  cursor: pointer;
  transition: color 0.15s ease, background 0.15s ease;
}
.meal-col-delete:hover:not(:disabled) {
  color: var(--error);
  background: rgba(255,59,48,0.06);
}
.meal-col-delete:disabled {
  color: var(--text-4);
  cursor: not-allowed;
}
.meal-col-delete:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}
.meal-col-rules {
  margin-top: 12px;
  font-size: 13px;
  color: var(--text-3);
  line-height: 1.6;
}
.meal-col-rules p {
  margin: 0;
}

/* --- Settings danger zone --- */
.settings-danger {
  border: 1px solid var(--error);
  border-radius: var(--r-md);
  padding: 20px 24px;
  background: rgba(255,59,48,0.03);
}
.settings-danger-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--error);
  margin-bottom: 4px;
}
.settings-danger-desc {
  font-size: 13px;
  color: var(--text-2);
  line-height: 1.5;
  margin-bottom: 16px;
}

/* --- 1440px+ expansions --- */
@media (min-width: 1440px) {
  .mypage-tabs {
    margin: 0 -40px;
    padding: 0 40px;
  }
}

/* --- Focus state for all new interactive elements --- */
.mypage-quick-nav:focus-visible,
.faq-question:focus-visible,
.notif-row button:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}
```

---

## 7. Desktop Visual System Guidance (1024 / 1280 / 1440)

### MyPage

| Element | 1024px | 1280px | 1440px |
| --- | --- | --- | --- |
| Hero max-width | `var(--desktop-content-lg)` (1360px) | same | 1360px + 80px padding |
| Saved recipe grid | 3 columns | 4 columns | 4 columns |
| Tab bar padding | 32px sides | 32px sides | 40px sides |
| Panel content | `max-width: var(--desktop-content-lg)` | same | same |

### Recipebooks

| Element | 1024px | 1280px | 1440px |
| --- | --- | --- | --- |
| Card list | 1 column | 2 columns | 2 columns |
| Card mosaic size | 80px square | 80px square | 96px square |
| Card padding | 12px 16px | 12px 16px | 12px 16px |

### Recipebook Detail

| Element | 1024px | 1280px | 1440px |
| --- | --- | --- | --- |
| Recipe grid | 3 columns | 4 columns | 4 columns (follow home-grid) |

### Settings

| Element | 1024px | 1280px | 1440px |
| --- | --- | --- | --- |
| Content width | `var(--desktop-content-sm)` (960px) centered | same | same |
| MealColumns list | full width within content | same | same |
| Danger zone | full width within content | same | same |

---

## 8. Accessibility and Keyboard/Focus Requirements

### Tab bar

- Each tab is a `<button>` with `role` implied by native semantics
- Active tab: `aria-selected="true"` (if using `role="tablist"` / `role="tab"`)
- Recommended: wrap in `<div role="tablist">`, each tab `role="tab"`, panel `role="tabpanel"`
- Arrow left/right moves focus between tabs
- Tab key moves from tab bar into active panel content

### FAQ accordion

- Each question is a `<button>` that toggles the answer
- `aria-expanded="true|false"` on the question button
- Answer region has `id` referenced by `aria-controls` on the question

### MealColumns

- Delete buttons have `aria-label` with column name
- Disabled delete buttons have `aria-disabled="true"` and `cursor: not-allowed`
- Drag handles are decorative only in demo (no actual DnD)

### Destructive modals

- Cancel button receives initial focus (already handled by ConfirmDialog)
- Destructive confirm button uses `btn-danger` styling
- `Escape` closes the dialog

### Focus-visible

All new interactive elements use:
```css
:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
```

---

## 9. Screenshot/Visual QA Matrix

### Required evidence files

All evidence should go to: `ui/designs/evidence/desktop-modern-redesign/phase-5/`

| Evidence file | Surface | What to verify |
| --- | --- | --- |
| `mypage-saved-1024.png` | MyPage saved tab | 3-col recipe grid, hero, tab bar |
| `mypage-saved-1280.png` | MyPage saved tab | 4-col grid |
| `mypage-saved-1440.png` | MyPage saved tab | 4-col grid, expanded padding |
| `mypage-account-1280.png` | MyPage account tab | Profile card, logout row, danger zone |
| `mypage-notif-1280.png` | MyPage notification tab | Toggle rows |
| `mypage-help-1280.png` | MyPage help tab | FAQ expanded, contact card |
| `recipebooks-1024.png` | Recipebooks list | 1-col horizontal cards |
| `recipebooks-1280.png` | Recipebooks list | 2-col horizontal cards |
| `recipebooks-1440.png` | Recipebooks list | 2-col, 96px mosaics |
| `recipebook-detail-1280.png` | Recipebook detail | Recipe grid, custom book actions |
| `recipebook-detail-delete-1280.png` | RecipebookDeleteConfirm | Destructive dialog open |
| `settings-1024.png` | Settings | MealColumns, all sections |
| `settings-1280.png` | Settings | Full settings surface |
| `settings-danger-1280.png` | Settings danger zone | Red border, danger button |
| `settings-account-delete-1280.png` | AccountDeleteConfirm | Destructive dialog open |
| `nickname-modal-1280.png` | NicknameModal | Dialog open state |
| `logout-modal-1280.png` | LogoutModal | Dialog open state |
| `visual-qa-report.json` | All | Console errors, overflow, Korean wrapping |

### Console/error check

- Zero console errors on all Phase 5 surfaces
- No nested `<button>` warnings
- No horizontal overflow at any breakpoint
- No orphan Korean syllable wrapping in titles, tabs, or buttons

---

## 10. Rows That Must Remain Open After Phase 5

### Phase 6 (Pantry & Shopping) — 11 rows

| Row | Status after Phase 5 |
| --- | --- |
| `screen:PANTRY` | `verified-foundation` |
| `screen:SHOPPING_FLOW` | `verified-foundation` |
| `screen:SHOPPING_LISTS` | `open` |
| `screen:SHOPPING_DETAIL` | `open` |
| `surface:PANTRY::PantrySearchToolbar` | `verified-foundation` |
| `surface:PANTRY::PantryBundlePicker` | `open` |
| `surface:PANTRY::PantryAddIngredient` | `open` |
| `surface:MYPAGE::ShoppingHistory` | `open` |
| `modal:PANTRY::PantryAddIngredientModal` | `open` |
| `modal:PANTRY::PantryAddBundleModal` | `open` |
| `modal:SHOPPING_DETAIL::PantryReflectModal` | `open` |

### Phase 7 (Cooking, Leftovers, Ate List) — 7 rows

| Row | Status after Phase 5 |
| --- | --- |
| `screen:LEFTOVERS` | `open` |
| `screen:ATE_LIST` | `open` |
| `screen:COOK_READY_LIST` | `open` |
| `screen:COOK_MODE_PLANNER` | `open` |
| `screen:COOK_MODE_STANDALONE` | `open` |
| `surface:COOK_MODE::CookIngredientChecklist` | `open` |
| `modal:COOK_MODE::CookNoticeDialog` | `open` |

### Phase 8 (Full QA) — all rows

Phase 8 is the full-surface verification pass. All rows must be `verified` before Phase 8 can close.

---

## 11. Data/Fixture Assumptions

### No new fixtures needed

- Saved recipes: `savedSet` state already exists in App (`new Set(["r3", "r5"])`)
- Recipebooks: `DA.RECIPEBOOKS` already has 3 system + 3 custom books
- Recipes: `DA.RECIPES` has 8 recipes
- Account: `DA.ACCOUNT` has nickname, provider, initials
- Meal columns: `DA.MEAL_COLUMNS` has 3 default columns
- FAQ items: New `DA.FAQ_ITEMS` array (5 entries, defined in section 5.5)

### Fixture constraints

- `recipesForBook(bookId)` in screens-3.jsx already maps book IDs to recipe subsets
- Recipe count in `book.count` may exceed actual rendered recipes (fixture vs display). This is acceptable for a demo — the count shows the fixture value, and the grid shows available demo recipes.

---

## 12. Implementation Notes For Codex

### Priority order

1. **RecipebooksScreen card fix** — this is the user-reported bug; fix first
2. **MyPageScreen tab rewrite** — largest surface area change
3. **SettingsScreen upgrades** — MealColumns + danger zone
4. **RecipebookDetailScreen** — delete affordance + count consistency
5. **styles-phase5.css** — all new CSS classes
6. **data.jsx** — FAQ_ITEMS addition
7. **app.jsx** — prop threading
8. **Screenshots and evidence**

### Do NOT

- Do not create new modal components for AccountDeleteConfirm or RecipebookDeleteConfirm — use existing `ConfirmDialog` via `openConfirm()`
- Do not alter the old `.recipebook-grid` or `.recipebook-card` classes — add new `.recipebook-list` and `.recipebook-card-h` alongside them; the old classes are used by the Phase 4 recipebook picker flows
- Do not touch `screens-1.jsx` (HOME, LOGIN, RECIPE_DETAIL)
- Do not touch Phase 1-4 CSS files
- Do not add new npm dependencies
- Do not alter mobile behavior below 1024px
- Do not close Phase 6/7 rows

### File change summary

| File | Change type | Scope |
| --- | --- | --- |
| `project/screens-2.jsx` | Modify | MyPageScreen rewrite, RecipebooksScreen card fix |
| `project/screens-3.jsx` | Modify | RecipebookDetailScreen props, SettingsScreen sections |
| `project/app.jsx` | Modify | Prop threading only |
| `project/data.jsx` | Modify | Add FAQ_ITEMS |
| `project/styles-phase5.css` | Create | All Phase 5 CSS |
| `project/index.html` | Modify | Add styles-phase5.css link |
| `PHASE0_PARITY_LEDGER.md` | Modify | Update 13 rows to verified |
