# Phase 7 Design Handoff: Cooking, Leftovers, Ate List

VERDICT: **READY_FOR_CODEX**

Date: 2026-05-14
Phase: 7 of 8
Plan: `.omx/plans/desktop-prototype-modern-webapp-redesign-ralplan-20260513.md`
Ledger: `PHASE0_PARITY_LEDGER.md`
CSS target: `styles-phase7.css` (loaded after `styles-phase6.css`)
Evidence target: `ui/designs/evidence/desktop-modern-redesign/phase-7/`

Post-review correction: Phase 7 implemented pantry deduction as the reachable inline
`CookIngredientChecklist` rail inside planner/standalone cook mode, not as a separate
`ConsumedIngredientSheet` modal. Claude/Ralph review on 2026-05-14 accepted the inline
surface and removed the stale dead modal/evidence.

---

## 1. Phase 7 Rows To Close (7 rows)

### Screens (5)

| Row | Current status | Phase 7 action |
| --- | --- | --- |
| `screen:COOK_READY_LIST` | `open` | New screen — shows all meals ready to cook, grouped by date, with status/method info and "요리 시작" entry point |
| `screen:COOK_MODE_PLANNER` | `open` | New screen — planner-context cook mode with step-by-step view, ingredient checklist sidebar, and meal status transition to `cooked` |
| `screen:COOK_MODE_STANDALONE` | `open` | New screen — standalone cook mode from recipe detail, visually distinct from planner cook, no meal status mutation |
| `screen:LEFTOVERS` | `open` | Redesign — richer card grid with status tags, action buttons, empty state, filter support, leftover-to-planner re-add flow |
| `screen:ATE_LIST` | `open` | Redesign — table-like list with undo/recreate actions, empty state, filter support, recipe link |

### Cook Deduction Surface + Modal (2)

| Row | Current status | Phase 7 action |
| --- | --- | --- |
| `surface:COOK_MODE::CookIngredientChecklist` | `open` | Inline pantry deduction rail in planner/standalone cook mode; shows recipe ingredients with checkboxes and deducts selected from pantry |
| `modal:COOK_MODE::CookNoticeDialog` | `open` | Replace — current notice-only dialog replaced with a useful redirect dialog that routes to `COOK_READY_LIST` or explains desktop cook mode |

---

## 2. Rows That Must Remain Open After Phase 7

### Phase 8 rows

All rows enter Phase 8 full-surface QA. No Phase 8 rows should be closed by Phase 7.

---

## 3. Domain Constraints (from RALPLAN §7)

These are hard rules. Codex must not violate them:

| # | Constraint | Why |
| --- | --- | --- |
| 1 | No serving adjustment UI in cook mode | Cook mode is execution, not planning. Servings are set at meal registration time. |
| 2 | Planner cook and standalone cook must be visually distinct | Planner cook mutates meal status (`shopped` → `cooked`). Standalone cook does not. Users must never confuse which mode they are in. |
| 3 | Planner cook may start from `registered` or `shopping_done` in the static desktop prototype | App parity allows cooking without using shopping first; completion still happens only after explicit cook mode, and production API/DB contracts are unchanged. |
| 4 | Planner cook completion must not be confused with standalone cooking | Standalone cook has no meal status side-effect. It's "I want to follow this recipe" not "I cooked this planner meal." |
| 5 | Desktop prototype only | No production API, DB, or mobile behavior changes. |
| 6 | Preserve existing prototype patterns from Phases 1-6 | Same stack routing, component naming, CSS layering, ARIA patterns, design tokens. |

---

## 4. Data / Fixture Requirements

### 4.1 Existing data (no changes needed for most)

| Data | Location in `data.jsx` | Usage |
| --- | --- | --- |
| `MEALS` | line 270-281 | 10 meals with mixed statuses: 2 `cooked`, 2 `shopped`, 6 `registered`. `m10` has `leftover: true`. |
| `LEFTOVERS` | line 341-344 | 2 leftover entries: `lf1` (불고기, 5/11), `lf2` (잡채, 5/9) |
| `ATE` | line 346-349 | 2 ate entries: `a1` (미역국, 5/8), `a2` (비빔밥, 5/6) |
| `RECIPES` | line 70-247 | 8 full recipes with ingredients and steps |
| `PANTRY_HELD` | line 284-288 | 14 held ingredients |
| `MEAL_COLUMNS` | line 251-255 | 3 columns: 아침/점심/저녁 |
| `WEEK_DATES` | line 259-267 | 7 dates: 5/11-5/17 |

### 4.2 New fixture data needed

Add to `data.jsx` before `window.HC_DATA`:

```javascript
/* ---------- 요리 단계 메서드 컬러 ---------- */
const COOK_METHOD_COLORS = {
  "준비":   { bg: "#FFF8EE", fg: "#B8860B" },
  "볶기":   { bg: "#FFF0E6", fg: "#D4600A" },
  "끓이기": { bg: "#FFECEC", fg: "#C13030" },
  "데치기": { bg: "#EEFBFF", fg: "#0A7EA4" },
  "굽기":   { bg: "#FFF5EE", fg: "#9A5A30" },
  "무치기": { bg: "#EEFFF3", fg: "#1A7A35" },
};
```

And export it via `window.HC_DATA`:

```javascript
window.HC_DATA = {
  // ... existing exports ...
  COOK_METHOD_COLORS,
};
```

---

## 5. Route / Stack Additions in `app.jsx`

### 5.1 New stack screens

| Stack screen | Component | Entry points |
| --- | --- | --- |
| `COOK_READY_LIST` | `CookReadyListScreen` | Direct hash / QA route; planner header button removed for app parity; replaced `setCookNotice(true)` calls |
| `COOK_MODE_PLANNER` | `CookModePlannerScreen` | CookReadyListScreen "요리 시작" button for a specific meal |
| `COOK_MODE_STANDALONE` | `CookModeStandaloneScreen` | RecipeDetailScreen "요리하기" button |

### 5.2 New app state

```javascript
// No separate cook-deduction modal state is needed.
// CookIngredientChecklist keeps its own selected ids and calls completeCookSession.
```

### 5.3 Routing changes

Replace ALL `setCookNotice(true)` calls:

| Current code | Replacement | File:Line |
| --- | --- | --- |
| `onCook={() => setCookNotice(true)}` in RecipeDetailScreen | `onCook={() => push({ screen: "COOK_MODE_STANDALONE", recipeId: cur.recipeId })}` | `app.jsx:259` |
| `onCook={() => setCookNotice(true)}` in MealScreen | `onCook={(mid) => push({ screen: "COOK_MODE_PLANNER", mealId: mid })}` | `app.jsx:285` |
| `onCook={() => setCookNotice(true)}` in LeftoversScreen | `onCook={(lfId) => { const lf = DA.LEFTOVERS.find(l => l.id === lfId); if (lf) push({ screen: "COOK_MODE_STANDALONE", recipeId: lf.recipeId }); }}` | `app.jsx:432` |

### 5.4 Add new topTab routing

In the `topTab` computation, add cook screens to PLANNER_WEEK tab:

```javascript
if (s === "PLANNER_WEEK" || s === "MEAL" || s === "MENU_ADD" ||
    s === "RECIPE_SEARCH_PICKER" || s === "RECIPEBOOK_SELECTOR" ||
    s === "RECIPEBOOK_DETAIL_PICKER" || s === "PANTRY_MATCH_PICKER" ||
    s === "MANUAL_RECIPE_CREATE" || s === "YT_IMPORT" ||
    s === "COOK_READY_LIST" || s === "COOK_MODE_PLANNER") return "PLANNER_WEEK";
```

Standalone cook mode routes to no specific tab (recipe-context):

```javascript
// Add before the final return:
if (s === "COOK_MODE_STANDALONE") return "";
```

### 5.5 Add new body renderers

```javascript
} else if (s === "COOK_READY_LIST") {
  body = <CookReadyListScreen
    meals={meals}
    onBack={pop}
    onStartCook={(mealId) => push({ screen: "COOK_MODE_PLANNER", mealId })}
    onOpenMeal={(mid) => push({ screen: "MEAL", mealId: mid })}
  />;
} else if (s === "COOK_MODE_PLANNER") {
  const meal = meals.find(m => m.id === cur.mealId);
  body = <CookModePlannerScreen
    meal={meal}
    recipe={meal ? DA.RECIPE[meal.recipeId] : null}
    onBack={pop}
    onComplete={(mealId, recipe, deductIds) => completeCookSession({ mealId, recipe, deductIds })}
    pantryHeld={pantryHeld}
  />;
} else if (s === "COOK_MODE_STANDALONE") {
  const recipe = DA.RECIPE[cur.recipeId];
  body = <CookModeStandaloneScreen
    recipe={recipe}
    onBack={pop}
    onComplete={(recipe, deductIds) => completeCookSession({ recipe, deductIds })}
    pantryHeld={pantryHeld}
  />;
}
```

### 5.6 CookIngredientChecklist completion wiring

The shipped desktop implementation uses the reachable inline `CookIngredientChecklist`
rail as the authoritative pantry deduction surface. It calls `completeCookSession`
with selected deduction ids; planner mode mutates meal status, while standalone mode
only deducts pantry items.

### 5.7 CookNoticeDialog replacement

Replace the existing `CookNoticeDialog` render:

```javascript
// OLD:
<CookNoticeDialog open={cookNotice} onClose={() => setCookNotice(false)} />

// NEW:
<CookNoticeDialog
  open={cookNotice}
  onClose={() => setCookNotice(false)}
  onGoToCookList={() => {
    setCookNotice(false);
    push({ screen: "COOK_READY_LIST" });
  }}
/>
```

The `cookNotice` state stays for backward compatibility (e.g., if a surface still triggers it as a fallback). But the primary cook entry points now route directly to `COOK_READY_LIST` or `COOK_MODE_*`.

### 5.8 Leftovers / AteList enhanced wiring

```javascript
} else if (s === "LEFTOVERS") {
  body = <LeftoversScreen
    onBack={pop}
    onCook={(lfId) => {
      const lf = DA.LEFTOVERS.find(l => l.id === lfId);
      if (lf) push({ screen: "COOK_MODE_STANDALONE", recipeId: lf.recipeId });
    }}
    onMarkAte={(lfId) => toast("다 먹은 목록에 추가했어요")}
    onReAddToPlanner={(lfId) => {
      const lf = DA.LEFTOVERS.find(l => l.id === lfId);
      if (lf) {
        const recipe = DA.RECIPE[lf.recipeId];
        if (recipe) openServingsConfirm(recipe, DA.TODAY_ISO, "col-d");
      }
    }}
    onGoAteList={() => push({ screen: "ATE_LIST" })}
    toast={toast}
  />;
} else if (s === "ATE_LIST") {
  body = <AteListScreen
    onBack={pop}
    onOpenRecipe={(rid) => push({ screen: "RECIPE", recipeId: rid })}
    onUndoAte={(ateId) => toast("남은 요리로 되돌렸어요 (데모)")}
    onRecreate={(rid) => push({ screen: "RECIPE", recipeId: rid })}
    onGoLeftovers={() => push({ screen: "LEFTOVERS" })}
    toast={toast}
  />;
}
```

### 5.9 Component exports

Add new components to `window.HC_S3`:

```javascript
window.HC_S3 = {
  // ... existing exports ...
  CookReadyListScreen, CookModePlannerScreen, CookModeStandaloneScreen,
};
```

No cook-deduction modal export is needed; the reachable deduction UI is
`CookIngredientChecklist` inside `screens-3.jsx`.

---

## 6. Screen-by-Screen Design Spec

### 6.1 `screen:COOK_READY_LIST` — Cook-Ready Meals List

**Purpose:** Show all meals that can be cooked now, grouped by date. Replaces the old notice-only cook dialog as the primary cooking entry point.

**Component:** `CookReadyListScreen` in `screens-3.jsx`

**Props:**
```javascript
function CookReadyListScreen({ meals, onBack, onStartCook, onOpenMeal })
```

**Data logic:**
- Filter `meals` where `status !== "cooked"` (show both `registered` and `shopped`)
- Group by date (today → tomorrow → rest of week)
- Sort groups chronologically

**Layout:**

```
┌─────────────────────────────────────────────┐
│ ← 플래너  /  요리하기                         │
├─────────────────────────────────────────────┤
│ h1: 요리하기                                  │
│ lead: 플래너에 등록한 끼니를 바로 요리하거나, │
│       장보기 완료된 끼니를 이어서 조리해요.   │
├─────────────────────────────────────────────┤
│                                             │
│ ▸ 오늘 (5월 12일)                   2개 끼니 │
│ ┌──────────────────────────────────────────┐│
│ │ [●등록됨] 김치볶음밥                     ││
│ │ 화 5/12 · 아침 · 1인분 · 15분           ││
│ │ ┌────────────────────┐ ┌──────────────┐ ││
│ │ │ 상세 보기           │ │ 요리 시작 ▸ │ ││
│ │ └────────────────────┘ └──────────────┘ ││
│ └──────────────────────────────────────────┘│
│ ┌──────────────────────────────────────────┐│
│ │ [●장보기완료] 순두부찌개                 ││
│ │ 화 5/12 · 저녁 · 2인분 · 25분           ││
│ │ ...                                      ││
│ └──────────────────────────────────────────┘│
│                                             │
│ ▸ 수요일 (5월 13일)                         │
│ ...                                         │
│                                             │
│ [empty state when no meals]                 │
│ StatePanel icon="pot"                       │
│ "요리할 끼니가 없어요"                       │
│ "플래너에서 끼니를 등록하면 여기에 나타납니다."│
└─────────────────────────────────────────────┘
```

**Markup pattern:**

```jsx
function CookReadyListScreen({ meals, onBack, onStartCook, onOpenMeal }) {
  const cookable = meals.filter(m => m.status !== "cooked");
  const grouped = useMemo(() => {
    const map = new Map();
    cookable.forEach(m => {
      if (!map.has(m.date)) map.set(m.date, []);
      map.get(m.date).push(m);
    });
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [cookable]);

  return (
    <main className="screen">
      <div className="breadcrumb">
        <button onClick={onBack} className="breadcrumb-link">
          <Icon name="chevL" size={14} /> 플래너
        </button>
        <span className="breadcrumb-sep">/</span>
        <span className="breadcrumb-cur">요리하기</span>
      </div>

      <ScreenHeader
        title="요리하기"
        lead="플래너에 등록한 끼니를 바로 요리하거나, 장보기 완료된 끼니를 이어서 조리해 보세요."
      />

      {cookable.length === 0 ? (
        <StatePanel icon="pot" title="요리할 끼니가 없어요" desc="플래너에서 끼니를 등록하면 여기에 나타납니다." />
      ) : (
        grouped.map(([date, dateMeals]) => (
          <section key={date} className="cook-date-section">
            <div className="cook-date-head">
              <h2 className="cook-date-title">{fmtDateSection(date)}</h2>
              <span className="cook-date-count tabular">{dateMeals.length}개 끼니</span>
            </div>
            <div className="cook-date-list">
              {dateMeals.map(m => (
                <CookReadyCard
                  key={m.id}
                  meal={m}
                  onStartCook={() => onStartCook(m.id)}
                  onOpenMeal={() => onOpenMeal(m.id)}
                />
              ))}
            </div>
          </section>
        ))
      )}
    </main>
  );
}
```

**`CookReadyCard` component:**

```jsx
function CookReadyCard({ meal, onStartCook, onOpenMeal }) {
  const recipe = D3.RECIPE[meal.recipeId];
  if (!recipe) return null;
  const statusLabel = meal.status === "registered" ? "등록됨" : "장보기 완료";
  const slotLabel = plannerSlotLabel(meal.date, meal.col);

  return (
    <div className="cook-ready-card">
      <div className="cook-ready-head">
        <span className={`cook-ready-status status-${meal.status}`}>
          <span className={`status-dot status-${meal.status}`} />
          {statusLabel}
        </span>
        <span className="cook-ready-time tabular">{recipe.cookTime}분</span>
      </div>
      <div className="cook-ready-title">{recipe.title}</div>
      <div className="cook-ready-meta tabular">{slotLabel} · {meal.servings}인분</div>
      <div className="cook-ready-actions">
        <Button variant="tertiary" size="sm" leftIcon="eye" onClick={onOpenMeal}>상세 보기</Button>
        <Button variant="primary" size="sm" leftIcon="pot" onClick={onStartCook}>요리 시작</Button>
      </div>
    </div>
  );
}
```

**Date section helper:**

```javascript
function fmtDateSection(iso) {
  const today = D3.TODAY_ISO;
  const d = new Date(iso + "T00:00:00");
  const dow = ["일","월","화","수","목","금","토"][d.getDay()];
  if (iso === today) return `오늘 (${d.getMonth()+1}월 ${d.getDate()}일)`;
  const tomorrow = new Date(new Date(today + "T00:00:00").getTime() + 86400000).toISOString().slice(0, 10);
  if (iso === tomorrow) return `내일 (${d.getMonth()+1}월 ${d.getDate()}일)`;
  return `${dow}요일 (${d.getMonth()+1}월 ${d.getDate()}일)`;
}
```

---

### 6.2 `screen:COOK_MODE_PLANNER` — Planner Cook Mode

**Purpose:** Step-by-step cooking view for a planner meal. Shows recipe steps on left, consumed ingredient checklist on right. On completion, marks meal as `cooked` and deducts pantry.

**Component:** `CookModePlannerScreen` in `screens-3.jsx`

**Props:**
```javascript
function CookModePlannerScreen({ meal, recipe, onBack, onComplete, pantryHeld })
```

**Visual distinction from standalone:**
- Header shows **planner context** (date, meal column, servings)
- Status pill shows current meal status
- Brand-colored header bar (`.cook-mode-header.planner`) with `border-bottom: 3px solid var(--brand)`
- Title: "플래너 요리모드"

**Layout:**

```
┌─────────────────────────────────────────────────────────────┐
│ ← 요리하기  /  플래너 요리모드                                │
│ ═══════════════════════════════════════ (brand border)       │
├──────────────────────────────────┬──────────────────────────┤
│ [planner badge]                  │ 차감할 재료              │
│ 화 5/12 · 저녁 · 2인분          │ ┌────────────────────┐   │
│                                  │ │ ☑ 순두부  1팩      │   │
│ h1: 순두부찌개                   │ │ ☑ 돼지고기 100g    │   │
│ lead: 25분 · 쉬움               │ │ ☑ 멸치육수 600ml   │   │
│                                  │ │ ☑ 고춧가루 2큰술   │   │
│ ┌─────────────────────────────┐  │ │ ☑ 마늘 1큰술       │   │
│ │ [볶기] 뚝배기에 기름을 ...  │  │ │ ☐ 계란 1개 (보유)  │   │
│ └─────────────────────────────┘  │ │ ☑ 대파 1대         │   │
│ ┌─────────────────────────────┐  │ └────────────────────┘   │
│ │ [끓이기] 육수를 부어 ...    │  │                          │
│ └─────────────────────────────┘  │ 7개 중 6개 선택          │
│ ┌─────────────────────────────┐  │                          │
│ │ [끓이기] 국간장으로 ...     │  │                          │
│ └─────────────────────────────┘  │ ┌──────────────────────┐ │
│ ┌─────────────────────────────┐  │ │ 요리 완료 (6개 차감) │ │
│ │ [준비] 계란을 깨뜨려 ...    │  │ └──────────────────────┘ │
│ └─────────────────────────────┘  │ [ 취소 ]                 │
│                                  │                          │
├──────────────────────────────────┴──────────────────────────┤
```

**Markup pattern:**

```jsx
function CookModePlannerScreen({ meal, recipe, onBack, onComplete, pantryHeld }) {
  if (!meal || !recipe) return null;

  const slotLabel = plannerSlotLabel(meal.date, meal.col);
  const statusLabel = meal.status === "registered" ? "등록됨" : "장보기 완료";

  return (
    <main className="screen cook-mode-screen">
      <div className="breadcrumb">
        <button onClick={onBack} className="breadcrumb-link">
          <Icon name="chevL" size={14} /> 요리하기
        </button>
        <span className="breadcrumb-sep">/</span>
        <span className="breadcrumb-cur">플래너 요리모드</span>
      </div>

      <div className="cook-mode-header planner">
        <div className="cook-mode-context">
          <span className={`meal-status-pill status-${meal.status}`}>
            <span className={`status-dot status-${meal.status}`} />
            {statusLabel}
          </span>
          <span className="cook-mode-slot tabular">{slotLabel} · {meal.servings}인분</span>
        </div>
        <h1 className="h1">{recipe.title}</h1>
        <p className="text-meta">{recipe.cookTime}분 · {recipe.difficulty}</p>
      </div>

      <div className="cook-mode-layout">
        <div className="cook-mode-steps">
          <h2 className="cook-section-title">조리 단계</h2>
          {recipe.steps.map((step, idx) => (
            <CookStepCard key={idx} step={step} index={idx + 1} />
          ))}
        </div>

        <aside className="cook-mode-rail">
          <CookIngredientChecklist
            recipe={recipe}
            servings={meal.servings}
            pantryHeld={pantryHeld}
            onComplete={(deductIds) => onComplete(meal.id, recipe, deductIds)}
            onCancel={onBack}
          />
        </aside>
      </div>
    </main>
  );
}
```

**Key: The actual deduction happens through `CookIngredientChecklist` in the sidebar.**
The "요리 완료" button passes the selected ingredient ids directly to the cook completion
handler, so the rail is the authoritative reachable deduction surface.

---

### 6.3 `screen:COOK_MODE_STANDALONE` — Standalone Cook Mode

**Purpose:** Follow a recipe step-by-step without planner context. No meal status mutation. Can still deduct pantry ingredients.

**Component:** `CookModeStandaloneScreen` in `screens-3.jsx`

**Props:**
```javascript
function CookModeStandaloneScreen({ recipe, onBack, onComplete, pantryHeld })
```

**Visual distinction from planner:**
- No planner context (no date/slot/status pill)
- Amber/neutral header bar (`.cook-mode-header.standalone`) with `border-bottom: 3px solid var(--text-3)`
- Title: "독립 요리모드"
- Info note: "이 요리는 플래너 끼니와 연결되지 않아요. 팬트리 재료 차감만 진행합니다."

**Layout:** Same 2-column layout as planner cook mode, but:
- No status pill
- No date/slot badge
- Different header color accent
- Footer note explaining standalone context

```jsx
function CookModeStandaloneScreen({ recipe, onBack, onComplete, pantryHeld }) {
  if (!recipe) return null;

  return (
    <main className="screen cook-mode-screen">
      <div className="breadcrumb">
        <button onClick={onBack} className="breadcrumb-link">
          <Icon name="chevL" size={14} /> 레시피
        </button>
        <span className="breadcrumb-sep">/</span>
        <span className="breadcrumb-cur">독립 요리모드</span>
      </div>

      <div className="cook-mode-header standalone">
        <h1 className="h1">{recipe.title}</h1>
        <p className="text-meta">{recipe.cookTime}분 · {recipe.difficulty} · {recipe.baseServings}인분</p>
        <div className="cook-mode-notice">
          <Icon name="info" size={14} />
          <span>이 요리는 플래너 끼니와 연결되지 않아요. 팬트리 재료 차감만 진행합니다.</span>
        </div>
      </div>

      <div className="cook-mode-layout">
        <div className="cook-mode-steps">
          <h2 className="cook-section-title">조리 단계</h2>
          {recipe.steps.map((step, idx) => (
            <CookStepCard key={idx} step={step} index={idx + 1} />
          ))}
        </div>

        <aside className="cook-mode-rail">
          <CookIngredientChecklist
            recipe={recipe}
            servings={recipe.baseServings}
            pantryHeld={pantryHeld}
            onComplete={(deductIds) => onComplete(recipe, deductIds)}
            onCancel={onBack}
          />
        </aside>
      </div>
    </main>
  );
}
```

---

### 6.4 Shared Cook Mode Sub-Components

#### `CookStepCard`

```jsx
function CookStepCard({ step, index }) {
  const colors = D3.COOK_METHOD_COLORS[step.method] || { bg: "var(--bg-alt)", fg: "var(--text-2)" };
  return (
    <div className="cook-step-card" style={{ borderLeftColor: colors.fg }}>
      <div className="cook-step-head">
        <span className="cook-step-badge" style={{ background: colors.bg, color: colors.fg }}>
          {step.method}
        </span>
        <span className="cook-step-num tabular">단계 {index}</span>
      </div>
      <p className="cook-step-text">{step.text}</p>
    </div>
  );
}
```

#### `CookIngredientChecklist` (inline sidebar rail)

```jsx
function CookIngredientChecklist({ recipe, servings, pantryHeld, onComplete, onCancel }) {
  const [checked, setChecked] = useState(() => {
    // Default: check all ingredients that are in pantry
    return new Set(
      recipe.ingredients
        .filter(i => i.id && pantryHeld?.has(i.id))
        .map(i => i.id)
    );
  });

  const toggle = (id) => setChecked(prev => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const factor = servings / recipe.baseServings;

  return (
    <div className="cook-rail-card">
      <div className="cook-rail-title">차감할 재료</div>
      <div className="cook-rail-list">
        {recipe.ingredients.map((ing, idx) => {
          const name = ing.id ? D3.ING[ing.id]?.name : ing.name;
          const v = typeof ing.amount === "number" ? ing.amount * factor : ing.amount;
          const inPantry = ing.id && pantryHeld?.has(ing.id);
          const isChecked = ing.id ? checked.has(ing.id) : false;

          return (
            <button
              key={idx}
              className={`cook-rail-item ${isChecked ? "on" : ""}`}
              onClick={() => ing.id && toggle(ing.id)}
              disabled={!ing.id}
              type="button"
            >
              <span className={`check-box ${isChecked ? "on" : ""}`}>
                {isChecked && <Icon name="check" size={12} />}
              </span>
              <span className="cook-rail-name">{name}</span>
              <span className="cook-rail-amount tabular">
                {typeof v === "number" ? (v >= 10 ? Math.round(v * 10) / 10 : v.toFixed(2).replace(/\.?0+$/, "")) : v}
                {ing.unit ? ` ${ing.unit}` : ""}
              </span>
              {inPantry && <span className="cook-rail-held">보유</span>}
            </button>
          );
        })}
      </div>
      <div className="cook-rail-summary tabular">
        {recipe.ingredients.filter(i => i.id).length}개 중 {checked.size}개 선택
      </div>
      <div className="cook-rail-footer">
        <Button variant="primary" full leftIcon="check" onClick={() => onComplete([...checked])}>
          요리 완료 ({checked.size}개 차감)
        </Button>
        <Button variant="ghost" full onClick={onCancel}>취소</Button>
      </div>
    </div>
  );
}
```

---

### 6.5 `surface:COOK_MODE::CookIngredientChecklist` — Pantry Deduction Rail

**Purpose:** Reachable inline pantry ingredient deduction surface inside cook mode.
It shows all recipe ingredients, preselects pantry-held items, supports toggling
individual deductions, and allows completing with zero selected items.

**Component:** `CookIngredientChecklist` in `screens-3.jsx`

**Behavior:**
- Renders in both planner and standalone cook mode.
- Pre-selects ingredients currently in pantry (`pantryHeld`).
- User can toggle individual ingredient deductions.
- "요리 완료 (N개 차감)" confirms with the selected ids.
- Empty selection is valid and completes with no pantry deduction.
- Planner mode additionally marks the source meal cooked; standalone mode does not mutate meal status.

---

### 6.6 `modal:COOK_MODE::CookNoticeDialog` — Replaced Notice

**Purpose:** The current notice-only dialog says "요리모드는 모바일에서만 지원돼요." Phase 7 replaces this with a useful redirect.

**Component:** `CookNoticeDialog` in `screens-3.jsx` — modified in place

**New behavior:**
- Title: "데스크탑 요리모드"
- Body explains that desktop cook mode is now available for step-by-step recipe viewing and ingredient deduction
- Primary CTA: "요리하기 목록" → navigates to `COOK_READY_LIST`
- Secondary CTA: "닫기"
- Keep the checklist of what's available on desktop

**New markup:**

```jsx
function CookNoticeDialog({ open, onClose, onGoToCookList }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="데스크탑 요리모드"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>닫기</Button>
          <Button variant="primary" leftIcon="pot" onClick={onGoToCookList}>요리하기 목록</Button>
        </>
      }
    >
      <div className="cook-notice">
        <div className="cook-notice-icon"><Icon name="pot" size={36} color="var(--brand-deep)" /></div>
        <p className="reading">데스크탑에서 레시피 단계를 보면서 요리하고, 사용한 재료를 팬트리에서 차감할 수 있어요.</p>
        <ul className="cook-notice-list">
          <li><Icon name="check" size={14} color="var(--brand-deep)" /> 조리 단계 확인</li>
          <li><Icon name="check" size={14} color="var(--brand-deep)" /> 사용 재료 차감</li>
          <li><Icon name="check" size={14} color="var(--brand-deep)" /> 플래너 끼니 완료 처리</li>
        </ul>
      </div>
    </Dialog>
  );
}
```

---

### 6.7 `screen:LEFTOVERS` — Redesigned Leftovers

**Purpose:** Show cooked meals that haven't been eaten, with actions to re-add to planner, cook again, or mark as eaten.

**Component:** `LeftoversScreen` in `screens-3.jsx` — rewrite

**Props (expanded):**
```javascript
function LeftoversScreen({ onBack, onCook, onMarkAte, onReAddToPlanner, onGoAteList, toast })
```

**Design improvements over current sparse version:**
- Add header right action: "다먹은 목록 →" navigation link to AteListScreen
- Better card layout with status tag ("남은 요리")
- Add action buttons: "플래너에 추가" (re-add), "요리하기" (cook), "다 먹었어요" (mark ate)
- Focusable card with hover elevation
- Empty state uses fridge icon

**Layout:**

```
┌─────────────────────────────────────────────┐
│ ← 마이페이지  /  남은 요리                   │
├─────────────────────────────────────────────┤
│ h1: 남은 요리            [다먹은 목록 →]     │
│ lead: 요리한 뒤 남은 음식을 ...             │
├─────────────────────────────────────────────┤
│ ┌───────────┐ ┌───────────┐ ┌───────────┐  │
│ │ [img]     │ │ [img]     │ │           │  │
│ │ 소불고기   │ │ 잡채      │ │  (empty)  │  │
│ │ 5/11·2인분│ │ 5/9·절반  │ │           │  │
│ │ [Tag:남음]│ │ [Tag:남음]│ │           │  │
│ │           │ │           │ │           │  │
│ │[플래너추가]│ │[플래너추가]│ │           │  │
│ │[요리하기] │ │[요리하기] │ │           │  │
│ │[다먹었어요]│ │[다먹었어요]│ │           │  │
│ └───────────┘ └───────────┘ └───────────┘  │
└─────────────────────────────────────────────┘
```

**Markup:**

```jsx
function LeftoversScreen({ onBack, onCook, onMarkAte, onReAddToPlanner, onGoAteList, toast }) {
  return (
    <main className="screen">
      <div className="breadcrumb">
        <button onClick={onBack} className="breadcrumb-link">
          <Icon name="chevL" size={14} /> 마이페이지
        </button>
        <span className="breadcrumb-sep">/</span>
        <span className="breadcrumb-cur">남은 요리</span>
      </div>

      <ScreenHeader
        title="남은 요리"
        lead="요리한 뒤 남은 음식을 메모해 두면 다음 끼니로 빠르게 옮길 수 있어요."
        right={
          <Button variant="tertiary" leftIcon="list" onClick={onGoAteList}>
            다먹은 목록
          </Button>
        }
      />

      {D3.LEFTOVERS.length === 0 ? (
        <StatePanel icon="fridge" title="남은 요리가 없어요" desc="요리모드 완료 후 남은 음식이 여기에 기록됩니다." />
      ) : (
        <div className="leftover-grid">
          {D3.LEFTOVERS.map(lf => {
            const r = D3.RECIPE[lf.recipeId];
            if (!r) return null;
            return (
              <div key={lf.id} className="leftover-card" tabIndex={0}>
                <div className="leftover-thumb">
                  <img src={r.photo} alt={r.title} onError={(e) => { e.currentTarget.style.display = "none"; }} />
                </div>
                <div className="leftover-body">
                  <div className="leftover-head">
                    <div className="leftover-title">{r.title}</div>
                    <Tag>남은 요리</Tag>
                  </div>
                  <div className="leftover-meta tabular">{D3.fmtPlannerDate(lf.createdAt)} · {lf.note}</div>
                  <div className="leftover-actions">
                    <Button variant="secondary" size="sm" leftIcon="cal" onClick={() => onReAddToPlanner(lf.id)}>플래너에 추가</Button>
                    <Button variant="tertiary" size="sm" leftIcon="pot" onClick={() => onCook(lf.id)}>요리하기</Button>
                    <Button variant="ghost" size="sm" leftIcon="check" onClick={() => onMarkAte(lf.id)}>다 먹었어요</Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
```

---

### 6.8 `screen:ATE_LIST` — Redesigned Ate List

**Purpose:** History of completed/eaten meals with undo and recreate actions.

**Component:** `AteListScreen` in `screens-3.jsx` — rewrite

**Props (expanded):**
```javascript
function AteListScreen({ onBack, onOpenRecipe, onUndoAte, onRecreate, onGoLeftovers, toast })
```

**Design improvements:**
- Add header right action: "남은 요리 →" navigation link to LeftoversScreen
- Add "되돌리기" (undo ate → back to leftover) action per row
- Add "다시 만들기" action per row (links to recipe)
- Better table-like list with hover, focus-visible
- Empty state

**Layout:**

```
┌──────────────────────────────────────────────┐
│ ← 마이페이지  /  다먹은 목록                  │
├──────────────────────────────────────────────┤
│ h1: 다먹은 목록           [남은 요리 →]       │
│ lead: 요리모드를 완료했거나 ...               │
├──────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────┐ │
│ │ [img] 소고기 미역국   5/8   [되돌리기] [다시만들기] ▸ │
│ ├──────────────────────────────────────────┤ │
│ │ [img] 비빔밥          5/6   [되돌리기] [다시만들기] ▸ │
│ └──────────────────────────────────────────┘ │
│                                              │
│ [empty: 아직 다먹은 요리가 없어요]             │
└──────────────────────────────────────────────┘
```

**Markup:**

```jsx
function AteListScreen({ onBack, onOpenRecipe, onUndoAte, onRecreate, onGoLeftovers, toast }) {
  return (
    <main className="screen">
      <div className="breadcrumb">
        <button onClick={onBack} className="breadcrumb-link">
          <Icon name="chevL" size={14} /> 마이페이지
        </button>
        <span className="breadcrumb-sep">/</span>
        <span className="breadcrumb-cur">다먹은 목록</span>
      </div>

      <ScreenHeader
        title="다먹은 목록"
        lead="요리모드를 완료했거나 '다 먹었어요'를 누른 끼니가 기록됩니다."
        right={
          <Button variant="tertiary" leftIcon="swap" onClick={onGoLeftovers}>
            남은 요리
          </Button>
        }
      />

      {D3.ATE.length === 0 ? (
        <StatePanel icon="check" title="아직 다먹은 요리가 없어요" desc="요리를 완료하거나 남은 요리에서 '다 먹었어요'를 누르면 여기에 기록됩니다." />
      ) : (
        <div className="ate-list">
          {D3.ATE.map(a => {
            const r = D3.RECIPE[a.recipeId];
            if (!r) return null;
            return (
              <div key={a.id} className="ate-row">
                <div className="ate-thumb">
                  <img src={r.photo} alt={r.title} onError={(e) => { e.currentTarget.style.display = "none"; }} />
                </div>
                <div className="ate-body">
                  <div className="ate-title">{r.title}</div>
                  <div className="ate-meta tabular">{D3.fmtPlannerDate(a.ateAt)}</div>
                </div>
                <div className="ate-actions">
                  <Button variant="ghost" size="sm" leftIcon="swap" onClick={() => onUndoAte(a.id)}>되돌리기</Button>
                  <Button variant="tertiary" size="sm" leftIcon="refresh" onClick={() => onRecreate(r.id)}>다시 만들기</Button>
                </div>
                <button className="ate-link" onClick={() => onOpenRecipe(r.id)} aria-label={`${r.title} 레시피 보기`}>
                  <Icon name="chevR" size={16} color="var(--text-4)" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
```

---

## 7. CSS Plan: `styles-phase7.css`

Load after `styles-phase6.css` in `homecook desktop prototype.html`:

```html
<link rel="stylesheet" href="styles-phase7.css"/>
```

### 7.1 Cook Ready List

```css
/* ============================================
   Phase 7 — Cooking, Leftovers, Ate List
   ============================================ */

/* --- Cook Ready List --- */
.cook-date-section {
  margin-bottom: 32px;
}

.cook-date-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.cook-date-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-1);
  letter-spacing: -0.3px;
}

.cook-date-count {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-3);
}

.cook-date-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.cook-ready-card {
  padding: 18px 22px;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--surface);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.cook-ready-card:hover {
  border-color: rgba(0, 0, 0, 0.16);
  box-shadow: var(--shadow-card);
}

.cook-ready-card:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}

.cook-ready-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.cook-ready-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 700;
}

.cook-ready-time {
  font-size: 13px;
  color: var(--text-3);
}

.cook-ready-title {
  font-size: 17px;
  font-weight: 700;
  color: var(--text-1);
  letter-spacing: -0.3px;
}

.cook-ready-meta {
  font-size: 13px;
  color: var(--text-3);
  margin-top: 2px;
}

.cook-ready-actions {
  display: flex;
  gap: 8px;
  margin-top: 14px;
}
```

### 7.2 Cook Mode Layout

```css
/* --- Cook Mode --- */
main.cook-mode-screen {
  max-width: var(--content-max, 1200px);
}

.cook-mode-header {
  margin-bottom: 24px;
  padding-bottom: 18px;
}

.cook-mode-header.planner {
  border-bottom: 3px solid var(--brand);
}

.cook-mode-header.standalone {
  border-bottom: 3px solid var(--text-3);
}

.cook-mode-context {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}

.cook-mode-slot {
  font-size: 14px;
  color: var(--text-2);
}

.cook-mode-notice {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  padding: 10px 14px;
  border-radius: var(--r-sm);
  background: var(--bg-alt);
  color: var(--text-3);
  font-size: 13px;
  font-weight: 600;
}

.cook-mode-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) 340px;
  gap: 28px;
  align-items: start;
}

@media (max-width: 1100px) {
  .cook-mode-layout {
    grid-template-columns: 1fr;
  }
}

.cook-section-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-1);
  margin-bottom: 14px;
}
```

### 7.3 Cook Step Cards

```css
/* --- Cook Step Cards --- */
.cook-step-card {
  padding: 16px 20px;
  border: 1px solid var(--line);
  border-left: 4px solid var(--text-3);
  border-radius: var(--r-md);
  background: var(--surface);
  margin-bottom: 10px;
}

.cook-step-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
}

.cook-step-badge {
  display: inline-flex;
  align-items: center;
  height: 24px;
  padding: 0 10px;
  border-radius: var(--r-pill);
  font-size: 12px;
  font-weight: 700;
}

.cook-step-num {
  font-size: 12px;
  color: var(--text-3);
  font-weight: 600;
}

.cook-step-text {
  font-size: 15px;
  color: var(--text-1);
  line-height: 1.55;
  letter-spacing: -0.3px;
}
```

### 7.4 Cook Ingredient Rail

```css
/* --- Cook Ingredient Rail --- */
.cook-rail-card {
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--surface);
  padding: 20px;
  position: sticky;
  top: 80px;
}

.cook-rail-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-1);
  margin-bottom: 14px;
}

.cook-rail-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.cook-rail-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border: none;
  border-radius: var(--r-sm);
  background: transparent;
  text-align: left;
  cursor: pointer;
  font: inherit;
  transition: background 0.1s ease;
}

.cook-rail-item:hover {
  background: var(--bg-alt);
}

.cook-rail-item:disabled {
  cursor: default;
  opacity: 0.6;
}

.cook-rail-item.on .cook-rail-name {
  text-decoration: line-through;
  color: var(--text-3);
}

.cook-rail-name {
  flex: 1;
  font-size: 14px;
  color: var(--text-1);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cook-rail-amount {
  font-size: 13px;
  color: var(--text-3);
  white-space: nowrap;
}

.cook-rail-held {
  font-size: 11px;
  font-weight: 700;
  color: var(--success);
  background: rgba(26, 174, 57, 0.08);
  padding: 2px 6px;
  border-radius: var(--r-pill);
}

.cook-rail-summary {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--line);
  font-size: 13px;
  color: var(--text-3);
}

.cook-rail-footer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 16px;
}

.cook-rail-item:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: -2px;
}
```

### 7.5 Cook Ingredient Checklist Rail

The shipped CSS for the reachable deduction surface is under the `.cook-rail-*`
classes in `styles-phase7.css`.

### 7.6 Leftover Card Polish

```css
/* --- Leftover card polish --- */
.leftover-card:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}

.leftover-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}

.leftover-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
}
```

### 7.7 Ate List Polish

```css
/* --- Ate list polish --- */
.ate-row {
  position: relative;
}

.ate-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.ate-link {
  display: flex;
  align-items: center;
  padding: 4px;
  border: none;
  background: transparent;
  cursor: pointer;
  flex-shrink: 0;
}

.ate-link:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}

.ate-row:focus-within {
  background: var(--bg-alt);
}
```

### 7.8 Responsive

```css
/* --- Responsive --- */
@media (max-width: 1100px) {
  .cook-mode-layout {
    grid-template-columns: 1fr;
  }
  .ate-actions {
    flex-direction: column;
  }
}
```

---

## 8. Accessibility and Keyboard Requirements

### Cook Ready List

| Feature | Implementation |
| --- | --- |
| Card focus | `.cook-ready-card` is not a button (contains buttons), but gets hover elevation |
| Button focus | All inner `<Button>` components have focus-visible from primitives |

### Cook Mode

| Feature | Implementation |
| --- | --- |
| Step cards | Informational, no interaction needed |
| Ingredient checklist | `<button>` elements with `check-box` pattern, matching Phase 6 shopping checklist |
| Disabled state | Ingredients without `id` are `disabled` (non-catalogued items like 불린 미역, 당면, 감자) |
| Rail sticky | `position: sticky; top: 80px` keeps rail visible while scrolling steps |

### Consumed Ingredient Sheet

| Feature | Implementation |
| --- | --- |
| Dialog role | Uses existing `Dialog` component (escape, focus trap, click-outside) |
| Checkboxes | `<button>` elements with visual check-box, matching existing patterns |
| Footer actions | "건너뛰기" (ghost) + "요리 완료" (primary) |

### Leftovers / Ate List

| Feature | Implementation |
| --- | --- |
| Leftover cards | `tabIndex={0}` for keyboard reachability |
| Ate rows | Contains inner buttons; row gets `:focus-within` highlight |
| Navigation links | Cross-navigation buttons between leftovers ↔ ate list |

---

## 9. Screenshot / Visual QA Matrix

### Required evidence files at `ui/designs/evidence/desktop-modern-redesign/phase-7/`

| File | Description | Width | Key checks |
| --- | --- | --- | --- |
| `cook-ready-list-1024.png` | CookReadyListScreen with meals grouped by date | 1024 | Date sections, status pills, card layout, actions |
| `cook-ready-list-1280.png` | CookReadyListScreen at wider width | 1280 | Cards don't stretch awkwardly, status readable |
| `cook-ready-empty-1280.png` | CookReadyListScreen with no cookable meals | 1280 | Empty state with pot icon and guidance copy |
| `cook-mode-planner-1024.png` | Planner cook mode at 1024px | 1024 | 2-col layout or stacked, brand header border, planner context |
| `cook-mode-planner-1280.png` | Planner cook mode at 1280px | 1280 | 2-col layout, step cards with method colors, sticky rail |
| `cook-mode-standalone-1280.png` | Standalone cook mode | 1280 | Different header (no brand border), info notice, no status pill |
| `cook-notice-1280.png` | Updated CookNoticeDialog | 1280 | New copy, "요리하기 목록" CTA, desktop cooking checklist |
| `leftovers-1024.png` | LeftoversScreen at 1024px | 1024 | Card grid, status tags, action buttons |
| `leftovers-1280.png` | LeftoversScreen at 1280px | 1280 | 3-col grid, cross-nav to ate list, cards with actions |
| `leftovers-empty-1280.png` | LeftoversScreen with no leftovers | 1280 | Empty state with fridge icon |
| `ate-list-1280.png` | AteListScreen with entries | 1280 | Table rows, undo/recreate actions, cross-nav to leftovers |
| `ate-list-empty-1280.png` | AteListScreen with no entries | 1280 | Empty state |
| `visual-qa-report.json` | Structured QA report | — | Console errors, visual checks, accessibility |

Total: 13 PNGs + 1 JSON = **14 evidence files**

---

## 10. Hard Acceptance Gates

| # | Gate | How to verify |
| --- | --- | --- |
| 1 | Cooking is not notice-only | `COOK_READY_LIST`, `COOK_MODE_PLANNER`, and `COOK_MODE_STANDALONE` are real desktop screens with recipe steps and ingredient checklists — not just a "mobile only" dialog |
| 2 | No serving adjustment UI in cook mode | Neither `CookModePlannerScreen` nor `CookModeStandaloneScreen` contains a `Stepper` or any servings input. Servings are display-only. |
| 3 | Planner cook and standalone cook are visually distinct | Planner mode: brand-colored header border, status pill, planner context (date/slot/servings). Standalone mode: neutral header border, info notice, no status pill. |
| 4 | Planner cook completion marks meal as `cooked` | `CookIngredientChecklist` → `completeCookSession({ mealId, ... })` → planner-only `setMeals` mutation |
| 5 | Standalone cook does NOT mutate meal status | `CookIngredientChecklist` → `completeCookSession({ recipe, ... })` without `mealId` → no `setMeals` call |
| 6 | Consumed ingredient flow deducts from pantry | `setPantryHeld(p => { const n = new Set(p); deductIds.forEach(id => n.delete(id)); return n; })` |
| 7 | Leftovers and ate list have useful desktop states | Filter/empty states, cross-navigation between leftovers ↔ ate list, action buttons (re-add, cook, undo, recreate) |
| 8 | Phase 8 rows remain open | No Phase 8 rows closed by this phase |
| 9 | Meal status flow is explicit | `registered` and `shopped` planner meals can enter cook mode; only `CookIngredientChecklist` completion sets `status: "cooked"` |
| 10 | No console errors from new surfaces | `visual-qa-report.json` shows `findings: [], pageErrors: [], failedRequests: []` |

---

## 11. Ledger Update Instructions

After Phase 7 implementation and evidence capture, update `PHASE0_PARITY_LEDGER.md`:

### Phase burn-down summary

Change Phase 7 row in the summary table:

```markdown
| Phase 7 | Cooking, leftovers, ate list | 7 owner rows | Verified in Phase 7; evidence at `ui/designs/evidence/desktop-modern-redesign/phase-7/`. |
```

### Screen rows to update

```markdown
| `screen:LEFTOVERS` | stack `LEFTOVERS`, `screens-3.jsx::LeftoversScreen` | `LeftoversScreen`, `DesktopLeftoversScreen` | Phase 7 | `verified` | Evidence: `leftovers-1024.png`, `leftovers-1280.png`, `leftovers-empty-1280.png`, and `visual-qa-report.json`; card grid, actions, empty state, and cross-nav to ate list verified. |
| `screen:ATE_LIST` | stack `ATE_LIST`, `screens-3.jsx::AteListScreen` | `AteListScreen`, `DesktopAteListScreen` | Phase 7 | `verified` | Evidence: `ate-list-1280.png`, `ate-list-empty-1280.png`, and `visual-qa-report.json`; undo/recreate actions, cross-nav to leftovers, and empty state verified. |
| `screen:COOK_READY_LIST` | stack `COOK_READY_LIST`, `screens-3.jsx::CookReadyListScreen` | `CookListScreen`, `DesktopCookListScreen` | Phase 7 | `verified` | Evidence: `cook-ready-list-1024.png`, `cook-ready-list-1280.png`, `cook-ready-empty-1280.png`, and `visual-qa-report.json`; date grouping, status pills, and empty state verified. |
| `screen:COOK_MODE_PLANNER` | stack `COOK_MODE_PLANNER`, `screens-3.jsx::CookModePlannerScreen` | `CookRunScreen`, `DesktopCookRunScreen` | Phase 7 | `verified` | Evidence: `cook-mode-planner-1024.png`, `cook-mode-planner-1280.png`, and `visual-qa-report.json`; brand header, planner context, step cards, ingredient rail, and meal status transition verified. |
| `screen:COOK_MODE_STANDALONE` | stack `COOK_MODE_STANDALONE`, `screens-3.jsx::CookModeStandaloneScreen` | `CookRunScreen`, `DesktopCookRunScreen` | Phase 7 | `verified` | Evidence: `cook-mode-standalone-1280.png` and `visual-qa-report.json`; neutral header, info notice, no status pill, no meal mutation verified. |
```

### Modal rows to update

```markdown
| `surface:COOK_MODE::CookIngredientChecklist` | `screens-3.jsx::CookIngredientChecklist` | `ConsumedIngredientSheet`, `DesktopConsumedIngredientDialog` | Phase 7 | `verified` | Evidence: `cook-mode-planner-1280.png`, `cook-mode-standalone-1280.png`, and `visual-qa-report.json`; reachable inline ingredient checkboxes, pantry deduction, and planner/standalone distinction verified. |
| `modal:COOK_MODE::CookNoticeDialog` | `screens-3.jsx::CookNoticeDialog` | notice/advisory only | Phase 7 | `verified` | Evidence: `cook-notice-1280.png` and `visual-qa-report.json`; replaced with desktop cook mode redirect dialog. |
```

---

## 12. Implementation Priority (Suggested Order)

1. **`data.jsx`** — Add `COOK_METHOD_COLORS` constant and export.
2. **`styles-phase7.css`** — Create CSS file with all Phase 7 classes.
3. **`homecook desktop prototype.html`** — Add `<link rel="stylesheet" href="styles-phase7.css"/>` after `styles-phase6.css`.
4. **`screens-3.jsx` CookNoticeDialog** — Replace notice-only dialog with desktop cook mode redirect. Add `onGoToCookList` prop.
5. **`screens-3.jsx` CookStepCard + CookIngredientChecklist** — Shared sub-components for cook mode screens.
6. **`screens-3.jsx` CookReadyListScreen** — New cook-ready list with date grouping.
7. **`screens-3.jsx` CookModePlannerScreen** — Planner cook mode with brand header.
8. **`screens-3.jsx` CookModeStandaloneScreen** — Standalone cook mode with neutral header.
9. **`screens-3.jsx` CookIngredientChecklist** — Reachable inline pantry deduction rail.
10. **`screens-3.jsx` LeftoversScreen** — Redesign with actions and cross-nav.
11. **`screens-3.jsx` AteListScreen** — Redesign with undo/recreate and cross-nav.
12. **`app.jsx`** — Add new state, routes, and wiring for all new screens/modals. Replace `setCookNotice(true)` calls.
13. **`app.jsx` window.HC_S3 / window.HC_MODALS** — Export new components.
14. **Screenshot QA** — Capture all 14 evidence files.
15. **Ledger update** — Mark all 7 rows `verified`.

---

## 13. Test / QA Plan

### Automated QA (Playwright visual QA script)

Extend the existing Phase 6 QA script pattern:

1. Navigate to each new screen at 1024px and 1280px widths
2. Capture screenshots to `ui/designs/evidence/desktop-modern-redesign/phase-7/`
3. Check for console errors and page errors
4. Check for failed network requests
5. Output `visual-qa-report.json` with `findings`, `pageErrors`, `failedRequests` arrays

### Manual verification checklist

| Check | How | Pass criteria |
| --- | --- | --- |
| Cook entry from MealScreen | Click "요리하기" on a meal | Routes to `COOK_MODE_PLANNER`, not `CookNoticeDialog` |
| Cook entry from RecipeDetail | Click "요리하기" on a recipe | Routes to `COOK_MODE_STANDALONE` |
| Planner cook has brand header | Open planner cook mode | Brand-colored bottom border on header, status pill visible |
| Standalone cook has neutral header | Open standalone cook mode | Neutral border, info notice, no status pill |
| No servings stepper in cook mode | Inspect both cook mode screens | No `Stepper` component, servings are text-only |
| Planner cook completes meal | Click "요리 완료" → confirm deduction | Meal status changes to `cooked`, toast confirms |
| Standalone cook does not change meal status | Click "요리 완료" → confirm deduction | No meal status change, only pantry deduction |
| Consumed sheet deducts pantry | Confirm with ingredients selected | Selected ingredients removed from `pantryHeld` |
| Skip deduction | Click "건너뛰기" in consumed sheet | No pantry change, but meal still marked cooked (if planner) |
| Leftovers cross-nav | Click "다먹은 목록" button | Navigates to AteListScreen |
| Ate list cross-nav | Click "남은 요리" button | Navigates to LeftoversScreen |
| Re-add leftover to planner | Click "플래너에 추가" on a leftover | Opens servings confirm modal |
| Cook from leftover | Click "요리하기" on a leftover | Opens standalone cook mode for that recipe |
| Empty states | Navigate to screens with no data | Appropriate empty state panels with icons and guidance copy |
| No console errors | Check `visual-qa-report.json` | `pageErrors: [], findings: []` |
| Responsive at 1024px | Resize to 1024px | Cook mode stacks to single column, all content visible |
