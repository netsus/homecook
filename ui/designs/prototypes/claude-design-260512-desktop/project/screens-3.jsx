/* global React */
/* ============================================
   MEAL_SCREEN + MENU_ADD + SHOPPING_DETAIL + SHOPPING_FLOW + sub screens
   ============================================ */
const { useState: useS3, useMemo: useMemo3, useEffect: useEffect3, useRef: useRef3 } = React;
const {
  Icon, Button, Chip, Tag, StatePanel, ScreenHeader, SegmentedRow, DateChipRail, Stepper,
} = window.HC;
const D3 = window.HC_DATA;

function plannerSlotLabel(dateISO, col) {
  const day = D3.WEEK_DATES.find(d => d.iso === dateISO);
  const colName = D3.MEAL_COLUMNS.find(c => c.id === col)?.name || "저녁";
  return day ? `${day.dow} 5/${day.d} · ${colName}` : `끼니 추가 · ${colName}`;
}

function recipeIngredientName(item) {
  return item.id ? D3.ING[item.id]?.name : item.name;
}

function recipeIngredientIds(recipe) {
  return (recipe?.ingredients || []).map(i => i.id).filter(Boolean);
}

function recipesForBook(bookId) {
  const map = {
    "rb-my": ["r6", "r1", "r2", "r8"],
    "rb-saved": ["r5", "r3", "r4", "r7"],
    "rb-liked": ["r3", "r6", "r2", "r1"],
    "rb-c1": ["r1", "r4", "r7", "r8"],
    "rb-c2": ["r5", "r8", "r1", "r3"],
    "rb-c3": ["r6", "r2", "r3", "r7"],
  };
  return (map[bookId] || D3.RECIPES.map(r => r.id)).map(id => D3.RECIPE[id]).filter(Boolean);
}

function createTempRecipe({ prefix, title, cookTime, baseServings, ingredients, memo, source, photo }) {
  const now = Date.now();
  return {
    id: `${prefix}-${now}`,
    title: title.trim(),
    photo: photo || D3.FOOD.bowl,
    source: source || "내가 추가한 레시피",
    tags: ["직접 추가"],
    baseServings,
    views: 0,
    likes: 0,
    saves: 0,
    plannerAdds: 0,
    description: memo?.trim() || "직접 추가한 레시피입니다.",
    cookTime,
    difficulty: "보통",
    ingredients,
    steps: [{ method: "메모", text: memo?.trim() || "조리 메모가 아직 없어요." }],
  };
}

/* ============================================
   MEAL_SCREEN (§6) — Today/Specific meal detail
   ============================================ */
function MealScreen({ mealId, meal: mealProp, onBack, onCook, onGoShopping, onGoRecipe, onDelete, onChangeServings, pantryHeld, toast }) {
  const meal = mealProp || D3.MEALS.find(m => m.id === mealId);
  const recipe = meal ? D3.RECIPE[meal.recipeId] : null;
  if (!meal || !recipe) return null;

  const dayLabel = D3.fmtPlannerDate(meal.date);
  const slotLabel = plannerSlotLabel(meal.date, meal.col);
  const statusLabel = meal.status === "registered" ? "등록됨" : meal.status === "shopped" ? "장보기 완료" : "요리 완료";

  return (
    <main className="screen">
      <div className="breadcrumb">
        <button onClick={onBack} className="breadcrumb-link">
          <Icon name="chevL" size={14} /> 플래너
        </button>
        <span className="breadcrumb-sep">/</span>
        <span className="breadcrumb-cur">{slotLabel}</span>
      </div>

      <div className="meal-layout">
        <div className="meal-main">
          <div className="meal-hero">
            <img src={recipe.photo} alt={recipe.title} onError={(e) => { e.currentTarget.style.display = "none"; }}/>
            <div className="meal-hero-overlay">
              <span className={`meal-status-pill status-${meal.status}`}>
                <span className={`status-dot status-${meal.status}`} />
                {statusLabel}
              </span>
            </div>
          </div>

          <div className="meal-titleblock">
            <h1 className="h1">{recipe.title}</h1>
            <div className="text-meta tabular">
              {dayLabel} · {D3.MEAL_COLUMNS.find(c => c.id === meal.col)?.name} · {meal.servings}인분
            </div>
            <p className="reading-lead" style={{ marginTop: 16 }}>{recipe.description}</p>
          </div>

          <section className="reading-section">
            <h2 className="h2">재료 ({meal.servings}인분 기준)</h2>
            <ul className="ing-list">
              {recipe.ingredients.map((i, idx) => {
                const name = i.id ? D3.ING[i.id]?.name : i.name;
                const factor = meal.servings / recipe.baseServings;
                const v = typeof i.amount === "number" ? i.amount * factor : i.amount;
                return (
                  <li key={idx} className="ing-row">
                    <span className="ing-name">{name}</span>
                    <span className="ing-amount tabular">
                      {typeof v === "number" ? (v >= 10 ? Math.round(v * 10) / 10 : v.toFixed(2).replace(/\.?0+$/, "")) : v}
                      {i.unit ? ` ${i.unit}` : ""}
                    </span>
                    {i.id && pantryHeld?.has(i.id) && (
                      <span className="ing-held-mark"><Icon name="check" size={11} /> 팬트리</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        <aside className="meal-rail">
          <div className="rail-card">
            <div className="rail-section">
              {meal.status === "cooked" ? (
                <div className="meal-complete-note">
                  <Icon name="check" size={16} />
                  <span>요리 완료된 끼니예요</span>
                </div>
              ) : (
                <Button variant="primary" full leftIcon="pot" onClick={() => onCook(meal.id)}>
                  요리하기
                </Button>
              )}
              <div style={{ height: 8 }} />
              <Button variant="secondary" full leftIcon="book" onClick={() => onGoRecipe(recipe.id)}>
                원본 레시피 보기
              </Button>
            </div>
            <div className="rail-section">
              <div className="rail-title">인분 조절</div>
              <Stepper value={meal.servings} onChange={(v) => onChangeServings(meal.id, v)} min={1} max={10} unit="인분" />
            </div>
            {meal.status !== "cooked" && (
              <div className="rail-section">
                <Button variant="tertiary" full leftIcon="cart" onClick={onGoShopping}>
                  {meal.status === "registered" ? "이번주 장보기 보기" : "장보기 확인하기"}
                </Button>
              </div>
            )}
            <div className="rail-section">
              <button className="meal-danger" onClick={() => onDelete(meal.id)}>
                <Icon name="trash" size={14} /> 끼니에서 삭제
              </button>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}

/* ============================================
   MENU_ADD (§7) — 6 entry options
   ============================================ */
function MenuAddScreen({ onBack, dateISO, col, onPickRecipe, onPickFromBook, onPickByPantry, onManualCreate, onYTImport, onSearchUrl }) {
  const day = D3.WEEK_DATES.find(d => d.iso === dateISO);
  const colName = D3.MEAL_COLUMNS.find(c => c.id === col)?.name;

  const entries = [
    { id:"search", icon:"search", title:"레시피 검색",     desc:"제목·재료로 홈쿡 레시피에서 찾기",    cta:"검색하기",  on: onPickRecipe },
    { id:"book",   icon:"book",   title:"레시피북에서 선택", desc:"저장한·내가 추가한 레시피 모음에서",  cta:"북 열기",   on: onPickFromBook },
    { id:"pantry", icon:"fridge", title:"팬트리 매칭",       desc:"가지고 있는 재료에 맞춰 추천",         cta:"매칭 보기", on: onPickByPantry },
    { id:"manual", icon:"edit",   title:"직접 만들기",       desc:"내 레시피로 추가 (제목/메모만)",       cta:"입력하기",  on: onManualCreate },
    { id:"yt",     icon:"youtube",title:"유튜브 가져오기",   desc:"링크 붙여 넣어 영상 메모로 추가",      cta:"붙여넣기",  on: onYTImport },
    { id:"url",    icon:"link",   title:"웹페이지 가져오기", desc:"블로그·검색 결과를 메모로",            cta:"링크 추가", on: onSearchUrl },
  ];

  return (
    <main className="screen">
      <div className="breadcrumb">
        <button onClick={onBack} className="breadcrumb-link"><Icon name="chevL" size={14} /> 플래너</button>
        <span className="breadcrumb-sep">/</span>
        <span className="breadcrumb-cur">끼니 추가</span>
      </div>

      <ScreenHeader
        eyebrow={day ? `${day.dow} 5/${day.d} · ${colName}` : "끼니 추가"}
        title="어디서 레시피를 가져올까요?"
        lead="6가지 입구 중 하나를 골라 진행하세요."
      />

      <div className="menu-add-grid">
        {entries.map(e => (
          <button key={e.id} className="menu-add-card" onClick={e.on}>
            <div className="menu-add-icon"><Icon name={e.icon} size={20} color="var(--brand-deep)" /></div>
            <div className="menu-add-body">
              <div className="menu-add-title">{e.title}</div>
              <div className="menu-add-desc">{e.desc}</div>
            </div>
            <div className="menu-add-cta">
              {e.cta} <Icon name="chevR" size={14} />
            </div>
          </button>
        ))}
      </div>
    </main>
  );
}

function PickerRecipeCard({ recipe, onPick, match }) {
  return (
    <button className="picker-recipe-card" onClick={() => onPick(recipe)}>
      <div className="picker-recipe-thumb">
        <img src={recipe.photo} alt={recipe.title} onError={(e) => { e.currentTarget.style.display = "none"; }} />
      </div>
      <div className="picker-recipe-body">
        <div className="picker-recipe-title">{recipe.title}</div>
        <div className="picker-recipe-meta tabular">
          {recipe.cookTime}분 · {recipe.baseServings}인분
        </div>
        {match && (
          <div className="picker-recipe-match tabular">
            보유 {match.held}/{match.total}
          </div>
        )}
      </div>
    </button>
  );
}

/* ============================================
   MENU_ADD PICKER — Recipe search
   ============================================ */
function RecipeSearchPickerScreen({ dateISO, col, onBack, onSelectRecipe }) {
  const [query, setQuery] = useS3("");
  const inputRef = useRef3(null);
  useEffect3(() => { window.setTimeout(() => inputRef.current?.focus(), 0); }, []);

  const recipes = useMemo3(() => {
    const q = query.trim();
    if (!q) return D3.RECIPES;
    return D3.RECIPES.filter(r => {
      const titleMatch = r.title.includes(q);
      const ingredientMatch = r.ingredients.some(i => recipeIngredientName(i)?.includes(q));
      return titleMatch || ingredientMatch;
    });
  }, [query]);

  return (
    <main className="screen">
      <div className="breadcrumb">
        <button onClick={onBack} className="breadcrumb-link"><Icon name="chevL" size={14} /> 끼니 추가</button>
        <span className="breadcrumb-sep">/</span>
        <span className="breadcrumb-cur">레시피 검색</span>
      </div>

      <div className="picker-search-header">
        <div>
          <div className="eyebrow">{plannerSlotLabel(dateISO, col)}</div>
          <h1 className="h1">레시피 검색</h1>
        </div>
        <div className="search-bar">
          <Icon name="search" size={15} color="var(--text-3)" />
          <input
            ref={inputRef}
            type="text"
            placeholder="레시피 제목 또는 재료 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button className="search-clear" onClick={() => setQuery("")} aria-label="검색어 지우기">
              <Icon name="x" size={12} />
            </button>
          )}
        </div>
      </div>

      {recipes.length === 0 ? (
        <StatePanel icon="search" title="검색어와 일치하는 레시피가 없어요" desc="다른 제목이나 재료명으로 다시 찾아보세요." />
      ) : (
        <div className="picker-recipe-grid">
          {recipes.map(r => <PickerRecipeCard key={r.id} recipe={r} onPick={onSelectRecipe} />)}
        </div>
      )}
    </main>
  );
}

/* ============================================
   MENU_ADD PICKER — Recipebook selector
   ============================================ */
function RecipeBookSelectorScreen({ dateISO, col, onBack, onOpenBook }) {
  return (
    <main className="screen">
      <div className="breadcrumb">
        <button onClick={onBack} className="breadcrumb-link"><Icon name="chevL" size={14} /> 끼니 추가</button>
        <span className="breadcrumb-sep">/</span>
        <span className="breadcrumb-cur">레시피북에서 선택</span>
      </div>

      <ScreenHeader
        eyebrow={plannerSlotLabel(dateISO, col)}
        title="레시피북에서 선택"
        lead="북을 고른 뒤 레시피를 선택하면 끼니에 추가할 수 있어요."
      />

      <div className="meta-list picker-book-list">
        {D3.RECIPEBOOKS.map(book => (
          <button key={book.id} className="meta-row picker-book-row" onClick={() => onOpenBook(book.id)}>
            <div className="meta-icon"><Icon name={book.type === "custom" ? "bookOpen" : "book"} size={16} /></div>
            <div className="meta-body">
              <div className="meta-title">{book.title}</div>
              <div className="meta-sub tabular">{book.count}개 레시피</div>
            </div>
            <div className="picker-book-thumbs" aria-hidden="true">
              {book.thumbs.slice(0, 3).map((src, idx) => (
                <span key={`${book.id}-${idx}`} className="picker-book-thumb">
                  <img src={src} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                </span>
              ))}
            </div>
            <Icon name="chevR" size={16} color="var(--text-4)" />
          </button>
        ))}
      </div>
    </main>
  );
}

function RecipeBookDetailPickerScreen({ bookId, dateISO, col, onBack, onSelectRecipe }) {
  const book = D3.RECIPEBOOKS.find(b => b.id === bookId);
  const recipes = recipesForBook(bookId);
  if (!book) return null;

  return (
    <main className="screen">
      <div className="breadcrumb">
        <button onClick={onBack} className="breadcrumb-link"><Icon name="chevL" size={14} /> 레시피북에서 선택</button>
        <span className="breadcrumb-sep">/</span>
        <span className="breadcrumb-cur">{book.title}</span>
      </div>

      <ScreenHeader
        eyebrow={plannerSlotLabel(dateISO, col)}
        title={book.title}
        lead={`${book.count}개의 레시피 중 끼니에 추가할 메뉴를 고르세요.`}
      />

      <div className="picker-recipe-grid">
        {recipes.map(r => <PickerRecipeCard key={r.id} recipe={r} onPick={onSelectRecipe} />)}
      </div>
    </main>
  );
}

/* ============================================
   MENU_ADD PICKER — Pantry match
   ============================================ */
function PantryMatchPickerScreen({ dateISO, col, pantryHeld, onBack, onSelectRecipe }) {
  const matches = useMemo3(() => {
    return D3.RECIPES.map(recipe => {
      const ids = recipeIngredientIds(recipe);
      const held = ids.filter(id => pantryHeld?.has(id)).length;
      const missing = ids.filter(id => !pantryHeld?.has(id)).map(id => D3.ING[id]?.name).filter(Boolean);
      const total = Math.max(ids.length, 1);
      return { recipe, held, total: ids.length, pct: Math.round((held / total) * 100), missing };
    }).sort((a, b) => b.pct - a.pct || a.recipe.cookTime - b.recipe.cookTime);
  }, [pantryHeld]);

  return (
    <main className="screen">
      <div className="breadcrumb">
        <button onClick={onBack} className="breadcrumb-link"><Icon name="chevL" size={14} /> 끼니 추가</button>
        <span className="breadcrumb-sep">/</span>
        <span className="breadcrumb-cur">팬트리 매칭</span>
      </div>

      <ScreenHeader
        eyebrow={plannerSlotLabel(dateISO, col)}
        title="팬트리 재료로 고르기"
        lead="지금 보유한 재료와 잘 맞는 레시피를 먼저 보여드려요."
      />

      <div className="pantry-match-list" role="list">
        {matches.map(item => (
          <button
            key={item.recipe.id}
            className="pantry-match-card"
            role="listitem"
            onClick={() => onSelectRecipe(item.recipe)}
          >
            <div className="pantry-match-thumb">
              <img src={item.recipe.photo} alt={item.recipe.title} onError={(e) => { e.currentTarget.style.display = "none"; }} />
            </div>
            <div className="pantry-match-body">
              <div className="pantry-match-head">
                <div>
                  <div className="pantry-match-title">{item.recipe.title}</div>
                  <div className="pantry-match-meta tabular">{item.recipe.cookTime}분 · {item.recipe.baseServings}인분</div>
                </div>
                <div className="pantry-match-score tabular">{item.pct}%</div>
              </div>
              <div className="pantry-match-bar" aria-hidden="true">
                <span className="pantry-match-fill" style={{ width: `${item.pct}%` }} />
              </div>
              <div className="pantry-match-detail">
                <span className="tabular">보유 {item.held}/{item.total}</span>
                {item.missing.length > 0 && <span>부족: {item.missing.slice(0, 4).join(", ")}</span>}
              </div>
            </div>
            <Icon name="chevR" size={16} color="var(--text-4)" />
          </button>
        ))}
      </div>
    </main>
  );
}

function IngredientEditor({ ingredients, onChange, onRemove, onOpenPicker }) {
  return (
    <div className="ing-edit-list">
      {ingredients.map((ing, idx) => (
        <div key={idx} className="ing-edit-row">
          <div className="ing-edit-name">{recipeIngredientName(ing) || ing.name}</div>
          <input
            className="ing-edit-amount"
            value={ing.amount}
            onChange={(e) => onChange(idx, { amount: e.target.value })}
            aria-label={`${recipeIngredientName(ing) || ing.name} 수량`}
          />
          <select
            className="ing-edit-unit"
            value={ing.unit || "개"}
            onChange={(e) => onChange(idx, { unit: e.target.value })}
            aria-label={`${recipeIngredientName(ing) || ing.name} 단위`}
          >
            {D3.UNIT_OPTIONS.map(unit => <option key={unit} value={unit}>{unit}</option>)}
          </select>
          <button className="ing-edit-remove" onClick={() => onRemove(idx)} aria-label={`${recipeIngredientName(ing) || ing.name} 삭제`}>
            <Icon name="x" size={14} />
          </button>
        </div>
      ))}
      {ingredients.length === 0 && <div className="create-empty">아직 추가한 재료가 없어요.</div>}
      <Button variant="tertiary" leftIcon="plus" onClick={onOpenPicker}>재료 추가</Button>
    </div>
  );
}

/* ============================================
   MANUAL_RECIPE_CREATE
   ============================================ */
function ManualRecipeCreateScreen({ dateISO, col, onBack, onCreateRecipe }) {
  const [title, setTitle] = useS3("");
  const [cookTime, setCookTime] = useS3(30);
  const [baseServings, setBaseServings] = useS3(2);
  const [ingredients, setIngredients] = useS3([]);
  const [memo, setMemo] = useS3("");
  const [pickerOpen, setPickerOpen] = useS3(false);
  const nameRef = useRef3(null);

  useEffect3(() => { window.setTimeout(() => nameRef.current?.focus(), 0); }, []);

  const updateIngredient = (idx, patch) => setIngredients(list => list.map((ing, i) => i === idx ? { ...ing, ...patch } : ing));
  const removeIngredient = (idx) => setIngredients(list => list.filter((_, i) => i !== idx));
  const addIngredients = (items) => {
    setIngredients(list => [
      ...list,
      ...items
        .filter(i => !list.some(existing => existing.id === i.id))
        .map(i => ({ id: i.id, amount: 1, unit: i.cat === "양념" ? "큰술" : "개" })),
    ]);
    setPickerOpen(false);
  };

  const submit = () => {
    if (!title.trim()) return;
    onCreateRecipe(createTempRecipe({
      prefix: "manual",
      title,
      cookTime,
      baseServings,
      ingredients,
      memo,
      source: "내가 추가한 레시피",
      photo: D3.FOOD.bowl,
    }));
  };

  const IngredientPicker = window.HC_MODALS?.IngredientPickerModal_ManualCreate;

  return (
    <main className="screen create-screen">
      <div className="breadcrumb">
        <button onClick={onBack} className="breadcrumb-link"><Icon name="chevL" size={14} /> 끼니 추가</button>
        <span className="breadcrumb-sep">/</span>
        <span className="breadcrumb-cur">직접 만들기</span>
      </div>

      <div className="create-form-shell">
        <ScreenHeader
          eyebrow={plannerSlotLabel(dateISO, col)}
          title="내 레시피 직접 만들기"
          lead="제목과 재료만 입력해도 끼니로 등록할 수 있어요."
        />

        <div className="create-form">
          <section className="create-section">
            <h2 className="create-section-title">기본 정보</h2>
            <div className="form-row">
              <label className="form-label">레시피 이름</label>
              <input
                ref={nameRef}
                className="text-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="예: 된장찌개"
              />
            </div>
            <div className="create-inline-rows">
              <div className="form-row form-row-inline">
                <label className="form-label">조리 시간</label>
                <Stepper value={cookTime} onChange={setCookTime} min={5} max={180} unit="분" />
              </div>
              <div className="form-row form-row-inline">
                <label className="form-label">기본 인분</label>
                <Stepper value={baseServings} onChange={setBaseServings} min={1} max={10} unit="인분" />
              </div>
            </div>
          </section>

          <section className="create-section">
            <h2 className="create-section-title">재료</h2>
            <IngredientEditor
              ingredients={ingredients}
              onChange={updateIngredient}
              onRemove={removeIngredient}
              onOpenPicker={() => setPickerOpen(true)}
            />
          </section>

          <section className="create-section">
            <h2 className="create-section-title">메모</h2>
            <textarea
              className="create-memo"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="조리법이나 가족 취향 메모를 적어두세요."
            />
          </section>
        </div>

        <div className="create-footer">
          <Button variant="ghost" onClick={onBack}>취소</Button>
          <Button variant="primary" leftIcon="cal" disabled={!title.trim()} onClick={submit}>등록하기</Button>
        </div>
      </div>

      {IngredientPicker && (
        <IngredientPicker
          open={pickerOpen}
          existingIds={ingredients.map(i => i.id).filter(Boolean)}
          onClose={() => setPickerOpen(false)}
          onConfirm={addIngredients}
        />
      )}
    </main>
  );
}

/* ============================================
   YT_IMPORT
   ============================================ */
function YtImportScreen({ dateISO, col, onBack, onCreateRecipe }) {
  const demo = D3.YT_DEMO_EXTRACTION;
  const [url, setUrl] = useS3("");
  const [loading, setLoading] = useS3(false);
  const [review, setReview] = useS3(false);
  const [title, setTitle] = useS3(demo.recipe.title);
  const [cookTime, setCookTime] = useS3(demo.recipe.cookTime);
  const [baseServings, setBaseServings] = useS3(demo.recipe.baseServings);
  const [ingredients, setIngredients] = useS3(demo.recipe.ingredients);
  const [memo, setMemo] = useS3(demo.recipe.memo);
  const [pickerOpen, setPickerOpen] = useS3(false);
  const urlRef = useRef3(null);
  const titleRef = useRef3(null);

  useEffect3(() => { window.setTimeout(() => urlRef.current?.focus(), 0); }, []);
  useEffect3(() => { if (review) window.setTimeout(() => titleRef.current?.focus(), 0); }, [review]);

  const startImport = () => {
    if (!url.trim() || loading) return;
    setLoading(true);
    window.setTimeout(() => {
      setTitle(demo.recipe.title);
      setCookTime(demo.recipe.cookTime);
      setBaseServings(demo.recipe.baseServings);
      setIngredients(demo.recipe.ingredients);
      setMemo(demo.recipe.memo);
      setReview(true);
      setLoading(false);
    }, 800);
  };

  const updateIngredient = (idx, patch) => setIngredients(list => list.map((ing, i) => i === idx ? { ...ing, ...patch } : ing));
  const removeIngredient = (idx) => setIngredients(list => list.filter((_, i) => i !== idx));
  const addIngredients = (items) => {
    setIngredients(list => [
      ...list,
      ...items
        .filter(i => !list.some(existing => existing.id === i.id))
        .map(i => ({ id: i.id, amount: 1, unit: i.cat === "양념" ? "큰술" : "개" })),
    ]);
    setPickerOpen(false);
  };

  const submit = () => {
    if (!title.trim()) return;
    onCreateRecipe(createTempRecipe({
      prefix: "yt",
      title,
      cookTime,
      baseServings,
      ingredients,
      memo,
      source: "유튜브",
      photo: demo.thumbnail,
    }));
  };

  const IngredientPicker = window.HC_MODALS?.IngredientPickerModal_ManualCreate;

  return (
    <main className="screen create-screen">
      <div className="breadcrumb">
        <button onClick={onBack} className="breadcrumb-link"><Icon name="chevL" size={14} /> 끼니 추가</button>
        <span className="breadcrumb-sep">/</span>
        <span className="breadcrumb-cur">유튜브 가져오기</span>
      </div>

      <div className="create-form-shell">
        <ScreenHeader
          eyebrow={plannerSlotLabel(dateISO, col)}
          title="유튜브 레시피 가져오기"
          lead="영상 링크를 붙여넣고 가져온 정보를 확인한 뒤 끼니로 등록하세요."
        />

        {!review ? (
          <div className="create-form">
            <section className="create-section yt-url-section">
              <h2 className="create-section-title">영상 링크</h2>
              <div className="yt-url-row">
                <div className="search-bar yt-url-input">
                  <Icon name="link" size={15} color="var(--text-3)" />
                  <input
                    ref={urlRef}
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") startImport(); }}
                    placeholder="https://youtube.com/watch?v=..."
                  />
                </div>
                <Button variant="primary" leftIcon="youtube" disabled={!url.trim() || loading} onClick={startImport}>
                  {loading ? "가져오는 중" : "가져오기"}
                </Button>
              </div>
              <div className="yt-info-grid">
                <div className="yt-info-box"><Icon name="info" size={15} /> 설명란에 재료 목록이 있는 요리 영상이 잘 맞아요.</div>
                <div className="yt-info-box"><Icon name="globe" size={15} /> 현재는 한국어 채널을 우선 지원하는 데모 흐름이에요.</div>
              </div>
              {loading && <div className="yt-loading">영상 설명을 읽고 레시피 정보를 정리하고 있어요.</div>}
            </section>
          </div>
        ) : (
          <>
            <div className="yt-review-banner"><Icon name="check" size={15} /> 레시피 정보를 가져왔어요. 수정 후 등록하세요.</div>
            <div className="yt-preview-card">
              <div className="yt-preview-thumb">
                <img src={demo.thumbnail} alt={demo.videoTitle} onError={(e) => { e.currentTarget.style.display = "none"; }} />
              </div>
              <div>
                <div className="yt-preview-title">{demo.videoTitle}</div>
                <div className="yt-preview-meta">채널: {demo.channel}</div>
              </div>
            </div>
            <div className="create-form">
              <section className="create-section">
                <h2 className="create-section-title">가져온 기본 정보</h2>
                <div className="form-row">
                  <label className="form-label">레시피 이름</label>
                  <input ref={titleRef} className="text-input" value={title} onChange={(e) => setTitle(e.target.value)} />
                </div>
                <div className="create-inline-rows">
                  <div className="form-row form-row-inline">
                    <label className="form-label">조리 시간</label>
                    <Stepper value={cookTime} onChange={setCookTime} min={5} max={180} unit="분" />
                  </div>
                  <div className="form-row form-row-inline">
                    <label className="form-label">기본 인분</label>
                    <Stepper value={baseServings} onChange={setBaseServings} min={1} max={10} unit="인분" />
                  </div>
                </div>
              </section>
              <section className="create-section">
                <h2 className="create-section-title">재료</h2>
                <IngredientEditor
                  ingredients={ingredients}
                  onChange={updateIngredient}
                  onRemove={removeIngredient}
                  onOpenPicker={() => setPickerOpen(true)}
                />
              </section>
              <section className="create-section">
                <h2 className="create-section-title">메모</h2>
                <textarea className="create-memo" value={memo} onChange={(e) => setMemo(e.target.value)} />
              </section>
            </div>
            <div className="create-footer">
              <Button variant="ghost" onClick={onBack}>취소</Button>
              <Button variant="primary" leftIcon="cal" disabled={!title.trim()} onClick={submit}>등록하기</Button>
            </div>
          </>
        )}
      </div>

      {IngredientPicker && (
        <IngredientPicker
          open={pickerOpen}
          existingIds={ingredients.map(i => i.id).filter(Boolean)}
          onClose={() => setPickerOpen(false)}
          onConfirm={addIngredients}
        />
      )}
    </main>
  );
}

/* ============================================
   SHOPPING_DETAIL (§12) — current week
   ============================================ */
function ShoppingDetailScreen({ list, pantryHeld, onTogglePantry, onBack, onMarkComplete, onOpenReAdd, onOpenPantryReflect, readOnly, toast }) {
  const [checked, setChecked] = useS3(new Set());

  if (!list) return null;

  const toggle = (id) => setChecked(prev => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const total = list.items.length;
  const done = checked.size;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const allDone = total > 0 && done === total;

  // Reflect to pantry — items not in pantry & checked
  const reflectables = list.items.filter(i => checked.has(i.id) && i.ing?.startsWith("ing-") && !pantryHeld.has(i.ing));

  return (
    <main className="screen">
      <div className="breadcrumb">
        <button onClick={onBack} className="breadcrumb-link"><Icon name="chevL" size={14} /> 마이페이지</button>
        <span className="breadcrumb-sep">/</span>
        <span className="breadcrumb-cur">{list.title}</span>
      </div>

      <ScreenHeader
        eyebrow={list.completed ? "완료된 장보기" : "진행 중"}
        title={list.title}
        lead={list.completed ? "완료된 장보기는 읽기 전용이에요." : "체크하면서 장을 보고, 마지막에 완료를 누르면 팬트리에 반영할 수 있어요."}
        right={
          !readOnly && !list.completed ? (
            <Button
              variant="primary"
              leftIcon={allDone ? "check" : "cart"}
              disabled={!allDone}
              onClick={() => { if (allDone) { onOpenPantryReflect(reflectables); onMarkComplete(list.id); } }}
            >
              장보기 완료
            </Button>
          ) : (!list.completed ? null : (
            <Button variant="tertiary" leftIcon="refresh" onClick={() => onOpenReAdd(list.id)}>
              다시 장보기
            </Button>
          ))
        }
      />

      {!list.completed && (
        <div className="shopping-progress-card">
          <div className="shopping-progress-text tabular">{done} / {total} 항목 ({pct}%)</div>
          <div className="progress">
            <div className="progress-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      <div className="shopping-grid">
        <section>
          <div className="sh-section-head">
            <div className="sh-section-title">구매할 재료</div>
            <div className="sh-section-count tabular">{total}개</div>
          </div>
          <div className="checklist-2col">
            {list.items.map(i => {
              const ck = list.completed ? !!i.checked : checked.has(i.id);
              return (
                <button
                  key={i.id}
                  className={`check-row ${ck ? "on" : ""}`}
                  onClick={() => !list.completed && !readOnly && toggle(i.id)}
                  disabled={list.completed || readOnly}
                >
                  <span className={`check-box ${ck ? "on" : ""}`}>
                    {ck && <Icon name="check" size={12} />}
                  </span>
                  <span style={{ flex: 1, textAlign: "left" }}>
                    <span className="check-name">{i.name}</span>
                  </span>
                  <span className="check-amt tabular">{i.amount}</span>
                </button>
              );
            })}
          </div>
        </section>

        <aside>
          <div className="shopping-side-card">
            <div className="shopping-side-title">팬트리에서 빠진 재료</div>
            <p className="shopping-side-help">이미 보유 중이라 장보기에서 제외됐어요. 떨어졌으면 아래에서 다시 추가하세요.</p>
            <ul className="pantry-include-list">
              {list.excluded.map(e => (
                <li key={e.id} className="pantry-include-row">
                  <span className="pantry-dot" />
                  <span style={{ flex: 1 }}>
                    <span className="pantry-include-name">{e.name}</span>
                    {e.amount && <span className="pantry-include-amount tabular"> · {e.amount}</span>}
                  </span>
                  <button className="pantry-include-btn" onClick={() => toast(`${e.name}을(를) 장보기에 추가했어요`)}>장보기 추가</button>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </main>
  );
}

/* ============================================
   SHOPPING_FLOW (§11) — entry flow chooser
   ============================================ */
function ShoppingFlowScreen({ onBack, onOpenCurrent, onOpenPast, onCreateNew, currentList }) {
  const onCardKey = (handler) => (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handler();
    }
  };

  return (
    <main className="screen">
      <div className="breadcrumb">
        <button onClick={onBack} className="breadcrumb-link"><Icon name="chevL" size={14} /> 마이페이지</button>
        <span className="breadcrumb-sep">/</span>
        <span className="breadcrumb-cur">장보기</span>
      </div>

      <ScreenHeader title="장보기" lead="플래너에 등록한 끼니로 만든 장보기 리스트가 모입니다." />

      <div className="shopping-flow-grid">
        {currentList && (
          <div
            className="shopping-flow-card primary"
            role="button"
            tabIndex={0}
            onClick={() => onOpenCurrent(currentList.id)}
            onKeyDown={onCardKey(() => onOpenCurrent(currentList.id))}
          >
            <div className="shopping-flow-eyebrow">진행 중</div>
            <div className="shopping-flow-title">{currentList.title}</div>
            <div className="shopping-flow-meta tabular">
              {currentList.items.length}개 항목 · {currentList.mealIds.length}끼
            </div>
            <Button variant="primary" rightIcon="chevR" size="sm">바로 시작</Button>
          </div>
        )}

        <div
          className="shopping-flow-card"
          role="button"
          tabIndex={0}
          onClick={onOpenPast}
          onKeyDown={onCardKey(onOpenPast)}
        >
          <div className="shopping-flow-eyebrow">과거 목록</div>
          <div className="shopping-flow-title">지난 장보기 다시 보기</div>
          <div className="shopping-flow-meta">읽기 전용 · 다시 장보기로 복원 가능</div>
          <Button variant="tertiary" rightIcon="chevR" size="sm">목록 열기</Button>
        </div>

        <div
          className="shopping-flow-card"
          role="button"
          tabIndex={0}
          onClick={onCreateNew}
          onKeyDown={onCardKey(onCreateNew)}
        >
          <div className="shopping-flow-eyebrow">직접 만들기</div>
          <div className="shopping-flow-title">새 장보기 리스트</div>
          <div className="shopping-flow-meta">플래너 없이 항목만 적기</div>
          <Button variant="tertiary" rightIcon="plus" size="sm">새로 만들기</Button>
        </div>
      </div>
    </main>
  );
}

/* ============================================
   SHOPPING_LISTS — list of all shopping lists
   ============================================ */
function ShoppingListsScreen({ onBack, onOpen }) {
  const lists = D3.SHOPPING_LISTS;
  return (
    <main className="screen">
      <div className="breadcrumb">
        <button onClick={onBack} className="breadcrumb-link"><Icon name="chevL" size={14} /> 마이페이지</button>
        <span className="breadcrumb-sep">/</span>
        <span className="breadcrumb-cur">장보기 목록</span>
      </div>

      <ScreenHeader title="장보기 목록" lead="진행 중과 완료된 장보기 리스트를 한곳에서 봅니다." />

      <div className="meta-list">
        {lists.map(l => (
          <button key={l.id} className="meta-row" onClick={() => onOpen(l.id)}>
            <div className="meta-icon"><Icon name="cart" size={16} /></div>
            <div className="meta-body">
              <div className="meta-title">{l.title}</div>
              <div className="meta-sub tabular">{l.items.length}개 항목 · {l.completed ? "완료" : "진행 중"}</div>
            </div>
            {l.completed && <span className="tag">완료</span>}
            <Icon name="chevR" size={16} color="var(--text-4)" />
          </button>
        ))}
      </div>
    </main>
  );
}

/* ============================================
   LEFTOVERS (§15)
   ============================================ */
function LeftoversScreen({ onBack, onCook, onMarkAte }) {
  return (
    <main className="screen">
      <div className="breadcrumb">
        <button onClick={onBack} className="breadcrumb-link"><Icon name="chevL" size={14} /> 마이페이지</button>
        <span className="breadcrumb-sep">/</span>
        <span className="breadcrumb-cur">남은 요리</span>
      </div>

      <ScreenHeader title="남은 요리" lead="요리한 뒤 남은 음식을 메모해 두면 다음 끼니로 빠르게 옮길 수 있어요." />

      {D3.LEFTOVERS.length === 0 ? (
        <StatePanel icon="pot" title="남은 요리가 없어요" desc="요리모드에서 '남은 요리로 등록'을 누르면 여기에 쌓입니다." />
      ) : (
        <div className="leftover-grid">
          {D3.LEFTOVERS.map(lf => {
            const r = D3.RECIPE[lf.recipeId];
            return (
              <div key={lf.id} className="leftover-card">
                <div className="leftover-thumb">
                  <img src={r?.photo} alt={r?.title} onError={(e) => { e.currentTarget.style.display = "none"; }} />
                </div>
                <div className="leftover-body">
                  <div className="leftover-title">{r?.title}</div>
                  <div className="leftover-meta tabular">{D3.fmtPlannerDate(lf.createdAt)} · {lf.note}</div>
                  <div className="row gap-2" style={{ marginTop: 12 }}>
                    <Button variant="secondary" size="sm" leftIcon="cal" onClick={() => onCook(lf.id)}>플래너로 옮기기</Button>
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

/* ============================================
   ATE_LIST (§16)
   ============================================ */
function AteListScreen({ onBack, onOpenRecipe }) {
  return (
    <main className="screen">
      <div className="breadcrumb">
        <button onClick={onBack} className="breadcrumb-link"><Icon name="chevL" size={14} /> 마이페이지</button>
        <span className="breadcrumb-sep">/</span>
        <span className="breadcrumb-cur">다먹은 목록</span>
      </div>

      <ScreenHeader title="다먹은 목록" lead="요리모드를 완료했거나 '다 먹었어요'를 누른 끼니가 기록됩니다." />

      <div className="ate-list">
        {D3.ATE.map(a => {
          const r = D3.RECIPE[a.recipeId];
          if (!r) return null;
          return (
            <button key={a.id} className="ate-row" onClick={() => onOpenRecipe(r.id)}>
              <div className="ate-thumb">
                <img src={r.photo} alt={r.title} onError={(e) => { e.currentTarget.style.display = "none"; }} />
              </div>
              <div className="ate-body">
                <div className="ate-title">{r.title}</div>
                <div className="ate-meta tabular">{D3.fmtPlannerDate(a.ateAt)}</div>
              </div>
              <Icon name="chevR" size={16} color="var(--text-4)" />
            </button>
          );
        })}
      </div>
    </main>
  );
}

/* ============================================
   RECIPEBOOK_DETAIL — 한 북의 레시피들
   ============================================ */
function RecipebookDetailScreen({ bookId, onBack, onOpenRecipe, onDeleteBook, toast }) {
  const book = D3.RECIPEBOOKS.find(b => b.id === bookId);
  if (!book) return null;

  const recipes = recipesForBook(bookId);

  return (
    <main className="screen">
      <div className="breadcrumb">
        <button onClick={onBack} className="breadcrumb-link"><Icon name="chevL" size={14} /> 레시피북</button>
        <span className="breadcrumb-sep">/</span>
        <span className="breadcrumb-cur">{book.title}</span>
      </div>

      <ScreenHeader
        title={book.title}
        lead={`대표 ${recipes.length}개 레시피 · 전체 ${book.count}개`}
        right={book.type === "custom" ? (
          <div className="recipebook-detail-actions">
            <Button variant="tertiary" leftIcon="edit" onClick={() => toast?.("레시피북 편집 (데모)")}>북 편집</Button>
            <Button variant="ghost" leftIcon="trash" onClick={onDeleteBook}>삭제</Button>
          </div>
        ) : null}
      />

      {recipes.length > 0 ? (
        <div className="home-grid">
          {recipes.map(r => (
            <button key={r.id} className="photo-card" onClick={() => onOpenRecipe(r.id)}>
              <div className="photo-card-thumb">
                <img src={r.photo} alt={r.title} onError={(e) => { e.currentTarget.style.display = "none"; }} />
              </div>
              <div className="photo-card-body">
                <div className="photo-card-title">{r.title}</div>
                <div className="photo-card-meta tabular">{r.cookTime}분 · {r.baseServings}인분</div>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <StatePanel
          icon="book"
          title="이 레시피북은 비어 있어요"
          desc="레시피를 저장할 때 이 북에 담아보세요."
        />
      )}
    </main>
  );
}

/* ============================================
   SETTINGS
   ============================================ */
function SettingsScreen({ onBack, account, onOpenNickname, onOpenLogout, onDeleteAccount, toast }) {
  const [pushNotif, setPushNotif] = useS3(true);
  const [unit, setUnit] = useS3("metric");
  const [theme, setTheme] = useS3("light");

  return (
    <main className="screen settings-screen">
      <div className="breadcrumb">
        <button onClick={onBack} className="breadcrumb-link"><Icon name="chevL" size={14} /> 마이페이지</button>
        <span className="breadcrumb-sep">/</span>
        <span className="breadcrumb-cur">설정</span>
      </div>

      <ScreenHeader title="설정" lead="알림 · 단위 · 테마를 한곳에서 관리합니다." />

      <section className="settings-section">
        <h3 className="settings-section-title">끼니 관리</h3>
        <div className="settings-section-lead">플래너에 표시되는 식사 시간대를 관리합니다.</div>
        <MealColumnsEditor toast={toast} />
      </section>

      <section className="settings-section">
        <h3 className="settings-section-title">알림</h3>
        <div className="settings-row">
          <div>
            <div className="settings-row-title">푸시 알림</div>
            <div className="settings-row-sub">끼니 요리 시간, 장보기 리마인드</div>
          </div>
          <SwitchToggle on={pushNotif} onChange={setPushNotif} />
        </div>
      </section>

      <section className="settings-section">
        <h3 className="settings-section-title">단위</h3>
        <div className="settings-row">
          <div>
            <div className="settings-row-title">계량 단위</div>
            <div className="settings-row-sub">미터법 (g, ml) 또는 컵·큰술 표기</div>
          </div>
          <SegmentedRow
            value={unit}
            onChange={setUnit}
            options={[{value:"metric", label:"미터법"}, {value:"cup", label:"컵·큰술"}]}
          />
        </div>
      </section>

      <section className="settings-section">
        <h3 className="settings-section-title">테마</h3>
        <div className="settings-row">
          <div>
            <div className="settings-row-title">앱 테마</div>
            <div className="settings-row-sub">시스템 설정 따라가기를 권장합니다</div>
          </div>
          <SegmentedRow
            value={theme}
            onChange={setTheme}
            options={[{value:"light", label:"라이트"}, {value:"dark", label:"다크"}, {value:"system", label:"시스템"}]}
          />
        </div>
      </section>

      <section className="settings-section">
        <h3 className="settings-section-title">계정</h3>
        <div className="meta-list">
          <div className="meta-row" style={{cursor:"default"}}>
            <div className="meta-icon"><Icon name="user" size={16} /></div>
            <div className="meta-body">
              <div className="meta-title">{account.nickname}</div>
              <div className="meta-sub">{account.provider === "kakao" ? "카카오" : account.provider === "naver" ? "네이버" : "구글"} 로그인</div>
            </div>
          </div>
          <button className="meta-row" type="button" onClick={onOpenNickname}>
            <div className="meta-icon"><Icon name="edit" size={16} /></div>
            <div className="meta-body">
              <div className="meta-title">닉네임 변경</div>
              <div className="meta-sub">마이페이지와 댓글에 표시되는 이름</div>
            </div>
            <Icon name="chevR" size={16} color="var(--text-4)" />
          </button>
          <button className="meta-row" type="button" onClick={onOpenLogout}>
            <div className="meta-icon"><Icon name="logout" size={16} /></div>
            <div className="meta-body">
              <div className="meta-title">로그아웃</div>
              <div className="meta-sub">현재 로그인한 계정에서 나갑니다.</div>
            </div>
            <Icon name="chevR" size={16} color="var(--text-4)" />
          </button>
        </div>
      </section>

      <section className="settings-section">
        <h3 className="settings-section-title">위험 영역</h3>
        <div className="settings-danger">
          <div className="settings-danger-title">계정 삭제</div>
          <div className="settings-danger-desc">모든 레시피북, 플래너, 장보기 기록이 영구적으로 삭제됩니다. 이 작업은 되돌릴 수 없어요.</div>
          <Button variant="danger" leftIcon="trash" onClick={onDeleteAccount}>계정 삭제하기</Button>
        </div>
      </section>
    </main>
  );
}

function SwitchToggle({ on, onChange }) {
  return (
    <button className={`switch ${on ? "on" : ""}`} onClick={() => onChange(!on)} role="switch" aria-checked={on}>
      <span className="switch-thumb" />
    </button>
  );
}

function MealColumnsEditor({ toast }) {
  const defaultIds = new Set(["col-b", "col-l", "col-d"]);
  const cols = D3.MEAL_COLUMNS;
  const canAdd = cols.length < 5;
  const canDelete = (col) => !defaultIds.has(col.id) && cols.length > 2;

  return (
    <div className="meal-columns-editor">
      <div className="meal-columns-list">
        {cols.map(col => (
          <div key={col.id} className="meal-col-row">
            <Icon name="drag" size={14} color="var(--text-4)" />
            <span className="meal-col-name">{col.name}</span>
            {defaultIds.has(col.id) && <span className="meal-col-badge">기본</span>}
            <button
              className="meal-col-delete"
              type="button"
              disabled={!canDelete(col)}
              aria-label={`${col.name} 삭제`}
              onClick={() => toast?.(`${col.name} 삭제 (데모)`)}
            >
              <Icon name="trash" size={14} />
            </button>
          </div>
        ))}
      </div>
      <div className="meal-columns-actions">
        <Button
          variant="tertiary"
          leftIcon="plus"
          disabled={!canAdd}
          onClick={() => toast?.("끼니 추가 (데모)")}
        >
          끼니 추가
        </Button>
      </div>
      <div className="meal-col-rules">
        <p>최소 2개, 최대 5개의 끼니를 등록할 수 있어요.</p>
        <p>기본 끼니(아침/점심/저녁)는 삭제할 수 없어요.</p>
        <p>컬럼을 추가하면 플래너 그리드에도 같은 순서로 표시됩니다.</p>
      </div>
    </div>
  );
}

/* ============================================
   COOK_NOTICE — mobile-only cooking mode notice
   ============================================ */
function CookNoticeDialog({ open, onClose }) {
  const { Dialog, Button } = window.HC;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="요리모드는 모바일에서만 지원돼요"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>닫기</Button>
          <Button variant="primary" leftIcon="link" onClick={onClose}>모바일 앱 열기</Button>
        </>
      }
    >
      <div className="cook-notice">
        <div className="cook-notice-icon"><Icon name="pot" size={36} color="var(--brand-deep)" /></div>
        <p className="reading">요리 단계 진행과 타이머는 데스크탑에서 사용하기 어려워, 모바일 앱에서만 지원합니다. 데스크탑에서는 레시피를 미리 살펴보고, 장보기를 마무리해 두세요.</p>
        <ul className="cook-notice-list">
          <li><Icon name="check" size={14} color="var(--brand-deep)" /> 인분/재료 미리 조절</li>
          <li><Icon name="check" size={14} color="var(--brand-deep)" /> 장보기 리스트 만들기</li>
          <li><Icon name="check" size={14} color="var(--brand-deep)" /> 플래너 등록</li>
        </ul>
      </div>
    </Dialog>
  );
}

window.HC_S3 = {
  MealScreen, MenuAddScreen, ShoppingDetailScreen, ShoppingFlowScreen, ShoppingListsScreen,
  RecipeSearchPickerScreen, RecipeBookSelectorScreen, RecipeBookDetailPickerScreen, PantryMatchPickerScreen,
  ManualRecipeCreateScreen, YtImportScreen,
  LeftoversScreen, AteListScreen, RecipebookDetailScreen, SettingsScreen, CookNoticeDialog,
};
