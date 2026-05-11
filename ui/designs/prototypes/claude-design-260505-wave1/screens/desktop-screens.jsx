// ===== screens/desktop-screens.jsx =====
// Desktop variants of screens — reuse data, rearrange layout.
const { useMemo: dUseMemo, useState: dUseState } = React;

// vNext S2 — DesktopHome: 앱 개선사항을 웹 레이아웃에 자연스럽게 변환
function DesktopHome({ onOpenRecipe, onOpenSave, savedIds = [], ingFilter, setIngFilter, sortBy, setSortBy, onOpenIngredientFilter, ingredientNames = [], onGoPlanner }) {
  const [query, setQuery] = dUseState('');
  const [activeTheme, setActiveTheme] = dUseState(null);

  const filtered = dUseMemo(() => {
    let r = [...RECIPES];
    if (query) r = r.filter(x => x.name.includes(query));
    if (activeTheme) r = r.filter(x => x.theme === activeTheme);
    if (ingFilter.length > 0) {
      r = r.filter(x => {
        const names = x.ingredients.map(i => i.name).join(' ');
        return ingFilter.some(f => {
          if (f === 'rice') return /밥|국수|면|밀가루/.test(names);
          if (f === 'meat') return /돼지|소고기|닭|앞다리/.test(names);
          if (f === 'fish') return /연어|멸치|해산물/.test(names);
          if (f === 'veg') return /양파|감자|당근|호박|로메인/.test(names);
          if (f === 'egg') return /계란|두부/.test(names);
          if (f === 'kimchi') return /김치|묵은지/.test(names);
          return true;
        });
      });
    }
    if (ingredientNames.length) {
      r = r.filter(recipe => {
        const names = recipe.ingredients.map(i => i.name).join(' ');
        return ingredientNames.every(name => names.includes(name));
      });
    }
    if (sortBy === 'saves')  r.sort((a, b) => b.saves - a.saves);
    if (sortBy === 'fast')   r.sort((a, b) => a.minutes - b.minutes);
    return r;
  }, [query, activeTheme, ingFilter, ingredientNames, sortBy]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      {/* Hero / today — vNext: 플래너 카드 클릭→플래너 탭 */}
      <section style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 20 }}>
        <div style={{
          background: `linear-gradient(135deg, ${T.mint} 0%, ${T.mintDeep} 100%)`,
          borderRadius: 16, padding: 32, color: '#fff',
          display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
          minHeight: 220,
        }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.85, letterSpacing: 1 }}>오늘의 추천</div>
            <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8, fontFamily: T.fontBrand, letterSpacing: 0.4 }}>
              비 오는 날엔 따끈한 한 그릇
            </div>
            <div style={{ fontSize: 14, opacity: 0.9, marginTop: 6 }}>
              김치찌개 · 부대찌개 · 떡볶이 · 칼국수
            </div>
          </div>
          <button style={{
            alignSelf: 'flex-start', background: '#fff', color: T.mintDeep,
            border: 'none', padding: '10px 18px', borderRadius: 8,
            fontWeight: 700, fontSize: 14, cursor: 'pointer',
          }}>모음 보기</button>
        </div>

        {/* vNext: 이번 주 플래너 카드 — 클릭으로 플래너 탭 이동 */}
        <div onClick={onGoPlanner} style={{
          background: '#fff', borderRadius: 16, padding: 24,
          boxShadow: T.shadowDeep, display: 'flex', flexDirection: 'column', gap: 14,
          cursor: 'pointer', transition: 'box-shadow 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.boxShadow = T.shadowSharp; }}
        onMouseLeave={e => { e.currentTarget.style.boxShadow = T.shadowDeep; }}
        >
          <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>이번 주 플래너</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {['월','화','수','목','금','토','일'].map((d, i) => (
              <div key={d} style={{
                flex: 1, aspectRatio: '1/1.3',
                background: i === 1 ? T.mintSoft : T.surfaceFill,
                border: i === 1 ? `1.5px solid ${T.mint}` : '1.5px solid transparent',
                borderRadius: 8, padding: 6,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: 2,
              }}>
                <span style={{ fontSize: 11, color: i === 1 ? T.mintDeep : T.text3, fontWeight: 700 }}>{d}</span>
                <span style={{ fontSize: 16, fontWeight: 800, color: i === 1 ? T.mintDeep : T.ink }}>{14 + i}</span>
                {i === 1 && <span style={{ fontSize: 9, color: T.mintDeep }}>3건</span>}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12, color: T.text3 }}>
            화요일에 등록된 식단 3건 · <span style={{ color: T.mint, fontWeight: 700 }}>전체 보기</span>
          </div>
        </div>
      </section>

      {/* Search */}
      <section>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: T.surfaceFill, borderRadius: 12, padding: '0 16px', height: 44,
        }}>
          {Icon.search()}
          <input value={query} onChange={e => setQuery(e.target.value)}
            placeholder="김치볶음밥, 된장찌개…"
            style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none',
              fontSize: 14, color: T.ink, fontFamily: T.fontUI }} />
        </div>
      </section>

      {/* Theme row — 데스크톱은 테마 먼저 표시, 재료 칩은 아래 (모바일과 동일 순서) */}
      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: T.ink }}>테마별 레시피</div>
          <div style={{ fontSize: 12, color: T.text3 }}>전체보기 ›</div>
        </div>
        <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4, scrollbarWidth: 'none' }}>
          {THEMES.map(t => {
            const active = activeTheme === t.name;
            return (
              <div key={t.id} onClick={() => setActiveTheme(active ? null : t.name)} style={{
                flexShrink: 0, width: 150, height: 96, borderRadius: 14,
                background: t.bg, padding: 14, cursor: 'pointer',
                display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                border: active ? `2px solid ${T.mint}` : '2px solid transparent',
                boxShadow: T.shadowNatural,
              }}>
                <div style={{ fontSize: 28 }}>{t.emoji}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, fontFamily: T.fontBrand }}>{t.name}</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* All recipes with sort — vNext: SortDropdown 인라인 (시트 제거) */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: T.ink }}>
            모든 레시피 <span style={{ color: T.text3, fontSize: 14, fontWeight: 500 }}>({filtered.length})</span>
          </div>
          <SortDropdown value={sortBy} onChange={setSortBy} options={SORT_OPTIONS} />
        </div>

        {/* vNext follow-up: 레시피 검색 필터 칩 — 모든 레시피 아래 */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
          {onOpenIngredientFilter && (
            <button onClick={onOpenIngredientFilter} style={{
              padding: '8px 14px', borderRadius: 9999,
              background: ingredientNames.length > 0 ? T.mint : '#fff',
              border: `1.5px solid ${ingredientNames.length > 0 ? T.mintDeep : T.mint}`,
              color: ingredientNames.length > 0 ? '#fff' : T.mintDeep,
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>{Icon.search(ingredientNames.length > 0 ? '#fff' : T.mintDeep)} {ingredientNames.length > 0 ? `재료 ${ingredientNames.length}개 적용` : '재료로 검색'}</button>
          )}
          {INGREDIENT_FILTERS.map(f => {
            const active = ingFilter.includes(f.id);
            return (
              <button key={f.id} onClick={() => {
                setIngFilter(active ? ingFilter.filter(x => x !== f.id) : [...ingFilter, f.id]);
              }} style={{
                flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', borderRadius: 9999,
                background: active ? T.mintSoft : T.surfaceFill,
                border: active ? `1px solid ${T.mint}` : '1px solid transparent',
                color: active ? T.mintDeep : T.text2,
                fontSize: 13, fontWeight: active ? 700 : 500, cursor: 'pointer',
              }}>
                <span style={{ fontSize: 14 }}>{f.emoji}</span>{f.name}
              </button>
            );
          })}
        </div>

        {/* 3-col grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
          {filtered.map(r => (
            <div key={r.id} onClick={() => onOpenRecipe(r.id)} style={{
              background: '#fff', borderRadius: 12, overflow: 'hidden',
              boxShadow: T.shadowDeep, cursor: 'pointer',
              transition: 'transform 0.15s, box-shadow 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = T.shadowSharp; }}
            onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = T.shadowDeep; }}
            >
              <div style={{
                width: '100%', aspectRatio: '4/3', background: r.bg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 80, position: 'relative',
              }}>
                {r.emoji}
                <button aria-label={`${r.name} 저장`} onClick={(e) => { e.stopPropagation(); onOpenSave?.(r.id); }} style={{
                  position: 'absolute', top: 12, right: 12,
                  width: 36, height: 36, borderRadius: 18, border: 'none',
                  background: 'rgba(255,255,255,0.92)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>{Icon.bookmark(savedIds.includes(r.id))}</button>
                {r.saves > 2000 && (
                  <div style={{
                    position: 'absolute', top: 12, left: 12,
                    background: T.red, color: '#fff', fontSize: 11, fontWeight: 700,
                    padding: '4px 8px', borderRadius: 4,
                  }}>🔥 인기</div>
                )}
              </div>
              <div style={{ padding: 14 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: T.ink, marginBottom: 4 }}>{r.name}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: T.text3, fontSize: 12 }}>
                  {Icon.clock()} {r.minutes}분
                  <span>·</span>
                  {Icon.users()} {r.servings}인
                  <span>·</span>
                  {Icon.bookmark(false, T.text3)} {r.saves.toLocaleString()}
                </div>
              </div>
            </div>
          ))}
        </div>
        {filtered.length === 0 && (
          <div style={{ padding: '48px 16px', textAlign: 'center', color: T.text3 }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>🍽️</div>
            <div style={{ fontSize: 14 }}>조건에 맞는 레시피가 없어요</div>
          </div>
        )}
      </section>
    </div>
  );
}

// vNext S4 — DesktopPlanner: week nav, 이모지 제거, 상태 배지 제거, 요리하기 제거, 식사추가 다이얼로그
function DesktopPlanner({ planner, pantry, onOpenRecipe, onOpenPlannerAdd, onMenuAdd, onCreateShopping, onCookList, onOpenMeal, onGoManual, onGoYtImport, onGoLeftovers, onPickRecipeFromMealAdd, showToast, initialMealAdd }) {
  const days = Object.keys(planner);
  const slots = ['아침', '점심', '저녁'];
  // vNext S4 — week navigation label은 유지하고, 이동 UI는 일주일 날짜 카드로 고정
  const [weekOffset, setWeekOffset] = dUseState(0);
  // vNext S4 — 식사 추가 다이얼로그 상태
  const [mealAddDialog, setMealAddDialog] = dUseState(null); // { date, slot }
  const [mealAddMode, setMealAddMode] = dUseState('hub');
  const [mealAddBookId, setMealAddBookId] = dUseState(null);
  const [mealAddYtUrl, setMealAddYtUrl] = dUseState('');

  const stats = dUseMemo(() => {
    let total = 0, cooked = 0, shopped = 0;
    days.forEach(k => {
      ['아침', '점심', '저녁'].forEach(slot => {
        mealItems(planner[k]?.[slot]).forEach(m => {
          total++;
          if (m.status === 'cooked') cooked++;
          if (m.status === 'shopped') shopped++;
        });
      });
    });
    return { total, cooked, shopped };
  }, [planner, days]);

  const dateRange = dUseMemo(() => {
    if (!days.length) return '';
    const base = new Date(WEEK_START);
    base.setDate(base.getDate() + weekOffset * 7);
    const end = new Date(base);
    end.setDate(end.getDate() + 6);
    return `${base.getFullYear()}년 ${base.getMonth()+1}월 ${base.getDate()}일 ~ ${end.getMonth()+1}월 ${end.getDate()}일`;
  }, [days, weekOffset]);

  const weekLabel = weekOffset === 0 ? '이번 주 식단' : weekOffset === 1 ? '다음 주 식단' : weekOffset === -1 ? '지난 주 식단' : '식단';
  const dateCardMeta = (index) => {
    const d = new Date(WEEK_START);
    d.setDate(d.getDate() + index + weekOffset * 7);
    return { dow: weekDays[index], day: d.getDate(), label: `${d.getMonth() + 1}/${d.getDate()}` };
  };

  // 식사 추가 다이얼로그 옵션
  const mealAddOptions = [
    { id: 'recipebook', label: '레시피북에서 추가', icon: '📖' },
    { id: 'pantry',     label: '팬트리 기반 추천',  icon: '🧊' },
    { id: 'leftover',   label: '남은요리에서 추가',  icon: '🍱' },
    { id: 'youtube',    label: '유튜브에서 가져오기', icon: '🎬' },
    { id: 'manual',     label: '직접 등록',          icon: '✏️' },
  ];

  React.useEffect(() => {
    if (initialMealAdd?.date && initialMealAdd?.slot) {
      setMealAddDialog({ date: initialMealAdd.date, slot: initialMealAdd.slot });
      setMealAddMode('hub');
      setMealAddBookId(null);
    }
  }, [initialMealAdd?.nonce]);

  const closeMealAddDialog = () => {
    setMealAddDialog(null);
    setMealAddMode('hub');
    setMealAddBookId(null);
    setMealAddYtUrl('');
  };
  const pickMealAddRecipe = (recipeId) => {
    const target = mealAddDialog;
    closeMealAddDialog();
    if (target?.date && target?.slot && onPickRecipeFromMealAdd) {
      onPickRecipeFromMealAdd(target.date, target.slot, recipeId);
    } else {
      onOpenRecipe?.(recipeId);
    }
  };
  const mealAddBooks = window.RECIPEBOOK_SAMPLES || [];
  const mealAddBook = mealAddBooks.find(b => b.id === mealAddBookId);
  const mealAddHaveSet = new Set(Object.values(pantry || {}).filter(v => v.have).map(v => v.name));
  const mealAddPantryMatches = RECIPES.map(r => {
    const need = r.ingredients.length || 1;
    const matched = r.ingredients.filter(i => mealAddHaveSet.has(i.name)).length;
    return { r, score: Math.round((matched / need) * 100), matched, need };
  }).sort((a, b) => b.score - a.score);
  const mealAddLeftovers = [];
  Object.keys(planner || {}).forEach(day => {
    ['아침', '점심', '저녁'].forEach(mealSlot => {
      mealItems(planner[day]?.[mealSlot]).forEach((meal, mealIndex) => {
        if (meal.status === 'cooked' && !meal.ateAt) {
          const recipe = RECIPES.find(r => r.id === meal.recipeId);
          if (recipe) mealAddLeftovers.push({ day, mealSlot, mealIndex, meal, recipe });
        }
      });
    });
  });
  const mealAddBackBtn = (
    <button onClick={() => { setMealAddMode('hub'); setMealAddBookId(null); }} style={{
      border: `1px solid ${T.border}`, background: '#fff', color: T.text2,
      borderRadius: 9999, padding: '7px 12px', fontSize: 12, fontWeight: 800,
      cursor: 'pointer', marginBottom: 14,
    }}>← 식사 추가</button>
  );
  const mealAddRecipeRow = (recipe, meta, extra) => (
    <button key={recipe.id + (meta || '')} onClick={() => pickMealAddRecipe(recipe.id)} style={{
      display: 'flex', alignItems: 'center', gap: 12,
      background: '#fff', border: `1px solid ${T.border}`, borderRadius: 12,
      padding: 12, cursor: 'pointer', textAlign: 'left',
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: 10, background: recipe.bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30,
      }}>{recipe.emoji}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: T.ink }}>{recipe.name}</div>
        {extra || <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>{meta || `${recipe.minutes}분 · ${recipe.servings}인분`}</div>}
      </div>
      <span style={{ fontSize: 12, fontWeight: 800, color: T.mintDeep, background: T.mintSoft, padding: '6px 10px', borderRadius: 8 }}>추가</span>
    </button>
  );
  const renderMealAddDialogBody = () => {
    if (!mealAddDialog) return null;
    if (mealAddMode === 'books') {
      return (
        <>
          {mealAddBackBtn}
          {!mealAddBook ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {mealAddBooks.map(book => (
                <button key={book.id} onClick={() => setMealAddBookId(book.id)} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  background: '#fff', border: `1px solid ${T.border}`, borderRadius: 12,
                  padding: '12px 14px', cursor: 'pointer', textAlign: 'left',
                }}>
                  <span style={{ fontSize: 24 }}>{book.emoji}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: T.ink }}>{book.name}</div>
                    <div style={{ fontSize: 10, color: T.text3, marginTop: 2 }}>{(book.recipeIds || []).length}개 레시피 · {book.kind === 'saved' ? '저장' : '내 책'}</div>
                  </div>
                  {Icon.chevR(T.text4)}
                </button>
              ))}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {(mealAddBook.recipeIds || []).map(id => RECIPES.find(r => r.id === id)).filter(Boolean).map(recipe => mealAddRecipeRow(recipe))}
            </div>
          )}
        </>
      );
    }
    if (mealAddMode === 'pantry') {
      return (
        <>
          {mealAddBackBtn}
          <div style={{ fontSize: 12, color: T.mintDeep, fontWeight: 800, marginBottom: 12 }}>보유 재료가 많이 맞는 레시피부터 보여드려요.</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {mealAddPantryMatches.slice(0, 8).map(({ r, score, matched, need }) => mealAddRecipeRow(r, null, (
              <MatchProgressBar score={score} sub={`${matched}/${need}개 보유`} compact style={{ marginTop: 7 }} />
            )))}
          </div>
        </>
      );
    }
    if (mealAddMode === 'leftover') {
      return (
        <>
          {mealAddBackBtn}
          {mealAddLeftovers.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: T.text3, fontSize: 13 }}>추가할 남은 요리가 없어요.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {mealAddLeftovers.map(item => mealAddRecipeRow(item.recipe, `${item.day} ${item.mealSlot} · 남은 요리 ${item.meal.servings || 1}인분`))}
            </div>
          )}
        </>
      );
    }
    if (mealAddMode === 'youtube') {
      const canImport = mealAddYtUrl.trim().length > 0;
      return (
        <>
          {mealAddBackBtn}
          <input value={mealAddYtUrl} onChange={e => setMealAddYtUrl(e.target.value)} autoFocus
            placeholder="유튜브 URL 붙여넣기" style={{ ...dskInputStyle, background: '#fff', marginBottom: 12 }} />
          <button disabled={!canImport} onClick={() => {
            showToast?.('영상에서 레시피를 가져왔어요');
            pickMealAddRecipe('r5');
          }} style={{
            ...dskPrimaryBtn, width: '100%', opacity: canImport ? 1 : 0.5,
            cursor: canImport ? 'pointer' : 'default',
          }}>가져오기</button>
        </>
      );
    }
    return (
      <>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: T.surfaceFill, borderRadius: 10, padding: '0 12px', height: 40,
          marginBottom: 16, border: `1px solid ${T.border}`,
        }}>
          {Icon.search()}
          <input
            placeholder="레시피 검색"
            onFocus={() => { const d = mealAddDialog; closeMealAddDialog(); onMenuAdd(d.date, d.slot, 'search'); }}
            style={{
              flex: 1, border: 'none', background: 'transparent', outline: 'none',
              fontSize: 14, color: T.ink, fontFamily: T.fontUI,
            }}
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {mealAddOptions.map(o => (
            <button key={o.id} onClick={() => {
              const d = mealAddDialog;
              if (o.id === 'manual') {
                closeMealAddDialog();
                if (onGoManual) onGoManual(d.date, d.slot);
                else onMenuAdd(d.date, d.slot);
              } else if (o.id === 'recipebook') {
                setMealAddMode('books');
              } else if (o.id === 'pantry') {
                setMealAddMode('pantry');
              } else if (o.id === 'leftover') {
                setMealAddMode('leftover');
              } else if (o.id === 'youtube') {
                setMealAddMode('youtube');
              } else {
                closeMealAddDialog();
                onMenuAdd(d.date, d.slot, 'search');
              }
            }} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '14px 12px', borderRadius: 10,
              background: '#fff', border: `1px solid ${T.border}`,
              cursor: 'pointer', fontSize: 13, fontWeight: 600, color: T.ink,
              textAlign: 'left',
              transition: 'border-color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = T.mint; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; }}
            >
              <span style={{ fontSize: 20 }}>{o.icon}</span>
              <span>{o.label}</span>
            </button>
          ))}
        </div>
      </>
    );
  };

  return (
    <div>
      {/* vNext S4 — Header, 요리하기 제거, 장보기 텍스트 축약 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: T.ink }}>{weekLabel}</div>
          <div style={{ fontSize: 13, color: T.text3, marginTop: 2 }}>{dateRange}</div>
        </div>
        <button onClick={() => onCreateShopping?.()} style={{
          background: T.ink, color: '#fff', border: 'none', padding: '10px 16px',
          borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer',
        }}>장보기</button>
      </div>

      {/* vNext repair — MVP처럼 한 주 날짜 카드로 이동 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 10,
      }}>
        <button onClick={() => setWeekOffset(w => w - 1)} style={{
          background: T.surfaceFill, border: `1px solid ${T.border}`, borderRadius: 8,
          width: 32, height: 32, cursor: 'pointer', fontSize: 16, color: T.text2,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>‹</button>
        <div style={{ fontSize: 14, color: T.ink, fontWeight: 800 }}>{weekLabel} · {dateRange}</div>
        <button onClick={() => setWeekOffset(w => w + 1)} style={{
          background: T.surfaceFill, border: `1px solid ${T.border}`, borderRadius: 8,
          width: 32, height: 32, cursor: 'pointer', fontSize: 16, color: T.text2,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>›</button>
      </div>
      <div style={{
        display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 14,
        marginBottom: 8, scrollSnapType: 'x mandatory', scrollbarWidth: 'none',
      }}>
        {days.map((day, index) => {
          const active = index === todayIdx;
          const meta = dateCardMeta(index);
          return (
            <button key={day} style={{
              flex: '0 0 78px', height: 70, scrollSnapAlign: 'start',
              borderRadius: 12,
              border: active ? `2px solid ${T.mint}` : `1px solid ${T.border}`,
              background: active ? T.mintSoft : '#fff',
              color: active ? T.mintDeep : T.text2,
              cursor: 'pointer', textAlign: 'center',
            }}>
              <div style={{ fontSize: 11, fontWeight: 800, marginTop: 8 }}>{meta.dow}</div>
              <div style={{ fontSize: 22, fontWeight: 900, fontFamily: T.fontBrand, marginTop: 1 }}>{meta.day}</div>
              <div style={{ fontSize: 10, color: active ? T.mintDeep : T.text4, marginTop: 1 }}>{meta.label}</div>
            </button>
          );
        })}
      </div>

      {/* Weekly summary cards */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: T.ink, marginBottom: 10, fontFamily: T.fontBrand }}>
          {stats.total}개 음식 계획 중
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1, background: T.cookDoneBg, borderRadius: 10, padding: '12px 16px' }}>
            <div style={{ fontSize: 11, color: T.cookDoneFg, fontWeight: 600 }}>요리 완료</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: T.cookDoneFg }}>{stats.cooked}개</div>
          </div>
          <div style={{ flex: 1, background: '#FFF4E1', borderRadius: 10, padding: '12px 16px' }}>
            <div style={{ fontSize: 11, color: '#B8860B', fontWeight: 600 }}>장보기 완료</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#B8860B' }}>{stats.shopped}개</div>
          </div>
          <div style={{ flex: 1, background: T.surfaceFill, borderRadius: 10, padding: '12px 16px' }}>
            <div style={{ fontSize: 11, color: T.text2, fontWeight: 600 }}>등록</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: T.ink }}>{stats.total - stats.cooked - stats.shopped}개</div>
          </div>
        </div>
      </div>

      <div style={{
        background: '#fff', borderRadius: 12, overflow: 'hidden',
        boxShadow: T.shadowDeep,
        display: 'grid', gridTemplateColumns: '80px repeat(7, 1fr)',
      }}>
        <div style={{ background: T.surfaceFill, borderBottom: `1px solid ${T.border}` }} />
        {days.map((d, i) => {
          const [mm, dd] = d.split('/').map(Number);
          const date = new Date(WEEK_START.getFullYear(), mm - 1, dd);
          const isToday = i === 1;
          return (
            <div key={d} style={{
              padding: '14px 10px', textAlign: 'center',
              background: isToday ? T.mintSoft : T.surfaceFill,
              borderLeft: `1px solid ${T.border}`, borderBottom: `1px solid ${T.border}`,
            }}>
              <div style={{ fontSize: 11, color: isToday ? T.mintDeep : T.text3, fontWeight: 700 }}>
                {['일','월','화','수','목','금','토'][date.getDay()]}
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: isToday ? T.mintDeep : T.ink, marginTop: 2 }}>
                {date.getDate()}
              </div>
            </div>
          );
        })}

        {/* vNext S4 — 슬롯 라벨 강화(fontWeight 700→800, color T.ink), 상태배지 제거, + 음식 버튼 강화 */}
        {slots.map(slot => (
          <React.Fragment key={slot}>
            <div style={{
              padding: 12, background: T.surfaceFill, color: T.ink, fontWeight: 800, fontSize: 13,
              borderBottom: `1px solid ${T.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{slot}</div>
            {days.map(d => {
              const meals = mealItems(planner[d]?.[slot]);
              const mealRows = meals.map(meal => ({
                meal,
                recipe: RECIPES.find(r => r.id === meal.recipeId)
              })).filter(row => row.recipe);
              return (
                <div key={d+slot} style={{
                  borderLeft: `1px solid ${T.border}`, borderBottom: `1px solid ${T.border}`,
                  minHeight: 110, padding: 6,
                }}>
                  {mealRows.length ? (
                    <div onClick={() => onOpenMeal?.(d, slot)} style={{
                      background: '#fff', borderRadius: 8, padding: 6, minHeight: '100%',
                      border: `1px solid ${T.surfaceSubtle}`,
                      display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 6,
                      cursor: 'pointer',
                    }}>
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: mealRows.length > 1 ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)',
                        gap: 4,
                      }}>
                        {mealRows.slice(0, 2).map(({ meal, recipe }, idx) => (
                          <div key={recipe.id + idx} style={{
                            background: T.surfaceFill, borderRadius: 7,
                            display: 'flex', alignItems: 'center', gap: 6, minWidth: 0,
                            height: 44, overflow: 'hidden', position: 'relative',
                          }}>
                            <span style={{
                              width: 32, height: 44, flexShrink: 0, background: recipe.bg,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 18,
                            }}>{recipe.emoji || ''}</span>
                            <span style={{ flex: 1, minWidth: 0 }}>
                              <span style={{ display: 'block', fontSize: 10, fontWeight: 800, color: T.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{recipe.name}</span>
                              <span style={{ display: 'block', fontSize: 9, color: T.text3, marginTop: 1 }}>{meal.servings || recipe.servings}인분</span>
                            </span>
                            {idx === 1 && mealRows.length > 2 && (
                              <span style={{
                                position: 'absolute', right: 4, bottom: 4,
                                fontSize: 9, color: T.text2, background: 'rgba(255,255,255,0.9)',
                                padding: '1px 5px', borderRadius: 9999, fontWeight: 800,
                              }}>+{mealRows.length - 2}</span>
                            )}
                          </div>
                        ))}
                      </div>
                      {/* vNext S4 — StatusPill 제거, + 버튼 축약 */}
                      <button onClick={(e) => { e.stopPropagation(); setMealAddDialog({ date: d, slot }); }} style={{
                        marginLeft: 'auto', border: `1.5px solid ${T.mealAddBorder}`, background: T.mealAddBg,
                        color: T.mealAddFg, borderRadius: 8, width: 28, height: 28, fontSize: 17,
                        lineHeight: 1, fontWeight: 700, cursor: 'pointer',
                      }}>+</button>
                    </div>
                  ) : (
                    <button onClick={() => setMealAddDialog({ date: d, slot })} style={{
                      width: '100%', height: '100%',
                      background: T.mealAddBg, border: `1.5px dashed ${T.mealAddBorder}`, borderRadius: 8,
                      color: T.mealAddFg, fontSize: 14, fontWeight: 700, cursor: 'pointer',
                    }}>+ 추가</button>
                  )}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>

      {/* vNext S4 — 식사 추가 데스크톱 다이얼로그 (unified bottom sheet) */}
      {mealAddDialog && (
        <>
          <div onClick={closeMealAddDialog} style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000,
          }} />
          <div style={{
            position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
            zIndex: 1001, background: '#fff',
            borderTopLeftRadius: 20, borderTopRightRadius: 20,
            width: mealAddMode === 'hub' ? 420 : 620, maxWidth: 'calc(100vw - 32px)',
            maxHeight: '85vh', overflowY: 'auto',
            boxShadow: T.shadowCrisp, padding: '8px 24px 24px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '0 0 10px' }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: T.border }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: T.ink }}>
                {mealAddMode === 'books' && mealAddBook ? mealAddBook.name :
                  mealAddMode === 'books' ? '레시피북에서 추가' :
                  mealAddMode === 'pantry' ? '팬트리 기반 추천' :
                  mealAddMode === 'leftover' ? '남은요리에서 추가' :
                  mealAddMode === 'youtube' ? '유튜브에서 가져오기' :
                  `${mealAddDialog.date} ${mealAddDialog.slot} · 식사 추가`}
              </div>
              <button onClick={closeMealAddDialog} style={{
                width: 32, height: 32, borderRadius: 16, background: T.surfaceFill,
                border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{Icon.close()}</button>
            </div>
            {renderMealAddDialogBody()}
          </div>
        </>
      )}
    </div>
  );
}

// vNext S3 — DesktopRecipeDetail: 별점→MetricRow, 카테고리 헤더 제거, 조리법 폰트 키움, 우측 CTA 카드 정리
function DesktopRecipeDetail({ recipeId, onBack, onOpenPlannerAdd, onOpenSave, saved, onStartCook }) {
  const r = RECIPES.find(x => x.id === recipeId);
  const [servings, setServings] = dUseState(r.servings);
  const [tab, setTab] = dUseState('ingredients');
  const [liked, setLiked] = dUseState(false);
  const scale = servings / r.servings;
  const baseLikes = Math.round(r.saves * 0.6);
  const cookCount = Math.round(r.saves * 0.3);
  const displayTags = (r.tags || []).filter((tag) => !/분$/.test(tag));

  return (
    <div>
      <button onClick={onBack} style={{
        background: 'none', border: 'none', cursor: 'pointer',
        color: T.text2, fontSize: 13, fontWeight: 600, marginBottom: 16,
        display: 'inline-flex', alignItems: 'center', gap: 6,
      }}>{Icon.chevL(T.text2)} 목록으로</button>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 32, alignItems: 'start' }}>
        <div>
          <div style={{
            width: '100%', aspectRatio: '16/9', background: r.bg, borderRadius: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 140,
            marginBottom: 20, position: 'relative',
          }}>
            {r.emoji}
            {/* vNext follow-up: 좋아요/저장/요리완료 지표를 이미지 오른쪽에 세로 배치 */}
            <RecipeHeroStats
              likes={baseLikes + (liked ? 1 : 0)}
              saves={r.saves}
              cooks={cookCount}
              liked={liked}
              saved={saved}
              onLike={() => setLiked(!liked)}
              onSave={onOpenSave}
              style={{ position: 'absolute', right: 18, bottom: 18 }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: T.ink, margin: 0 }}>{r.name}</h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {[r.theme, ...displayTags].filter(Boolean).map((tag, idx) => (
              <span key={`${tag}-${idx}`} style={{
                fontSize: 12, color: idx === 0 ? T.mintDeep : T.text2,
                fontWeight: 800, background: idx === 0 ? T.mintSoft : T.surfaceFill,
                padding: '4px 9px', borderRadius: 9999,
              }}>{tag}</span>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: T.text3, fontSize: 13, marginBottom: 24, flexWrap: 'wrap' }}>
            {Icon.clock()} {r.minutes}분
            <span>·</span>
            {Icon.users()} {r.servings}인분
          </div>

          <div style={{ display: 'flex', gap: 24, borderBottom: `1px solid ${T.border}`, marginBottom: 20 }}>
            {[['ingredients','재료'],['cook','조리법'],['reviews','리뷰']].map(([k,l]) => (
              <button key={k} onClick={() => setTab(k)} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '12px 0', fontSize: 14, fontWeight: 700,
                color: tab === k ? T.mint : T.text3,
                borderBottom: tab === k ? `2px solid ${T.mint}` : '2px solid transparent',
                marginBottom: -1,
              }}>{l}</button>
            ))}
          </div>

          {/* vNext S3 — 재료 탭: 카테고리 헤더 제거, 정렬 순서 유지, 수량 스케일링 보존 */}
          {tab === 'ingredients' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              {(r.ingredients || []).map((ing, i) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between',
                  padding: '12px 14px', background: T.surfaceFill, borderRadius: 8,
                  fontSize: 14,
                }}>
                  <span style={{ color: T.ink }}>{ing.name}</span>
                  <span style={{ color: T.text2, fontWeight: 600 }}>
                    {typeof ing.amount === 'number' ? Math.round(ing.amount * scale * 10)/10 : ing.amount} {ing.unit || ''}
                  </span>
                </div>
              ))}
            </div>
          )}

          {tab === 'cook' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {(r.steps || []).map((s, i) => {
                const m = METHOD_COLORS[s.method] || { bg: T.surfaceFill, border: T.text3, text: T.text2, label: s.method };
                return (
                  <div key={i} style={{
                    display: 'flex', gap: 14, padding: 16,
                    background: '#fff', borderRadius: 10,
                    borderLeft: `4px solid ${m.border}`,
                    boxShadow: T.shadowNatural,
                  }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 16,
                      background: m.border, color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 14, fontWeight: 700, flexShrink: 0,
                    }}>{i+1}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <span style={{
                          fontSize: 11, fontWeight: 700,
                          color: m.text, padding: '2px 8px',
                          background: m.bg, borderRadius: 4,
                        }}>{m.label}</span>
                        {s.time && <span style={{ fontSize: 12, color: T.text3 }}>{s.time}</span>}
                      </div>
                      {/* vNext S3 — 조리법 폰트 키움 14→16 (데스크톱 base 16 기준 +2) */}
                      <div style={{ fontSize: 16, color: T.ink, lineHeight: 1.6 }}>{s.text}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {tab === 'reviews' && (
            <div style={{ color: T.text3, padding: 40, textAlign: 'center', fontSize: 14 }}>
              리뷰 — 데모에서는 비활성
            </div>
          )}
        </div>

        {/* vNext S3 — 우측 sticky 카드: 인분 조절 + 플래너에 추가 + 요리하기 (저장은 히어로 북마크로 이동) */}
        <aside style={{ position: 'sticky', top: 88 }}>
          <div style={{
            background: '#fff', borderRadius: 12, padding: 20,
            boxShadow: T.shadowDeep,
          }}>
            <div style={{ fontSize: 13, color: T.text3, fontWeight: 600, marginBottom: 8 }}>인분 조절</div>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: 12, background: T.surfaceFill, borderRadius: 8, marginBottom: 16,
            }}>
              <button onClick={() => setServings(Math.max(1, servings-1))} style={dQtyBtn}>−</button>
              <span style={{ fontSize: 18, fontWeight: 700, color: T.ink }}>{servings}인분</span>
              <button onClick={() => setServings(servings+1)} style={dQtyBtn}>＋</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Button variant="primary" full onClick={onOpenPlannerAdd}>플래너에 추가</Button>
              <Button variant="secondary" full onClick={onStartCook}>요리하기</Button>
            </div>
          </div>

          <div style={{
            marginTop: 16, padding: 16, background: T.mintSoft,
            borderRadius: 12, fontSize: 12, color: T.mintDeep, lineHeight: 1.5,
          }}>
            같은 재료로 <b style={{ fontWeight: 700 }}>3개 레시피</b>를 더 만들 수 있어요
          </div>
        </aside>
      </div>
    </div>
  );
}

const dQtyBtn = {
  width: 32, height: 32, borderRadius: 16, border: 'none',
  background: '#fff', color: T.ink, fontSize: 18, fontWeight: 700, cursor: 'pointer',
};

function DesktopPantry({ pantry, setPantry, onOpenAdd, onOpenBundle }) {
  const [query, setQuery] = dUseState('');
  const [activeCat, setActiveCat] = dUseState('전체');
  const [deleteMode, setDeleteMode] = dUseState(false);
  const [selected, setSelected] = dUseState(new Set());
  const categories = ['전체', ...PANTRY_CATEGORIES];
  const sections = {};
  Object.entries(pantry).forEach(([key, item]) => {
    if (!item.have) return;
    if (query && !item.name.includes(query)) return;
    if (activeCat !== '전체' && item.section !== activeCat) return;
    if (!sections[item.section]) sections[item.section] = [];
    sections[item.section].push({ key, ...item });
  });
  const totalHave = Object.values(pantry).filter(x => x.have).length;
  const total = PANTRY_ADD_ITEMS.length;
  const sectionEntries = Object.entries(sections);
  const toggleSelected = (key) => setSelected(prev => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });
  const deleteSelected = () => {
    if (selected.size === 0) return;
    setPantry(p => {
      const next = { ...p };
      selected.forEach(key => {
        if (next[key]) next[key] = { ...next[key], have: false };
      });
      return next;
    });
    setSelected(new Set());
    setDeleteMode(false);
    /* CONTRACT_CHECK: DELETE /pantry-items bulk — vNext에서는 UI shape만 */
  };
  const toggleDeleteMode = () => {
    setDeleteMode(on => {
      if (on) setSelected(new Set());
      return !on;
    });
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: T.ink, marginBottom: 4 }}>{'\uD32C\uD2B8\uB9AC'}</div>
          <div style={{ fontSize: 13, color: T.text3 }}>{'\uBCF4\uC720 \uC911\uC778 \uC7AC\uB8CC\uB97C \uD45C\uC2DC\uD558\uBA74 \uAC00\uB2A5\uD55C \uB808\uC2DC\uD53C\uB97C \uCD94\uCC9C\uD574 \uB4DC\uB824\uC694'}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            background: T.mintSoft, color: T.mintDeep, padding: '8px 14px',
            borderRadius: 8, fontSize: 13, fontWeight: 700,
          }}>{'\uBCF4\uC720'} {totalHave} / {total}</div>
          {onOpenAdd && (
            <button onClick={onOpenAdd} style={{
              background: T.mint, color: '#fff', border: 'none', cursor: 'pointer',
              padding: '10px 14px', height: 36, borderRadius: 8, fontSize: 13, fontWeight: 800,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>재료 추가</button>
          )}
          {onOpenBundle && (
            <button onClick={onOpenBundle} style={{
              background: '#fff', color: T.text2, border: `1px solid ${T.border}`, cursor: 'pointer',
              padding: '10px 14px', height: 36, borderRadius: 8, fontSize: 13, fontWeight: 800,
            }}>묶음 추가</button>
          )}
	          <button onClick={toggleDeleteMode} style={{
	            background: deleteMode ? '#fff' : T.red, color: deleteMode ? T.text2 : '#fff',
	            border: deleteMode ? `1px solid ${T.border}` : 'none', cursor: 'pointer',
	            padding: '10px 14px', height: 36, borderRadius: 8, fontSize: 13, fontWeight: 800,
	            whiteSpace: 'nowrap',
	          }}>{deleteMode ? '취소' : '삭제'}</button>
	        </div>
	      </div>
      <div style={{ marginBottom: 20 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: T.surfaceFill, borderRadius: 12, padding: '0 16px', height: 44,
        }}>
          {Icon.search()}
          <input value={query} onChange={e => setQuery(e.target.value)}
            placeholder={'\uC7AC\uB8CC \uAC80\uC0C9'}
            style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none',
              fontSize: 14, color: T.ink, fontFamily: T.fontUI }} />
        </div>
	      </div>
	      <div style={{ background: T.surfaceFill, borderRadius: 12, padding: 12, marginBottom: 20 }}>
	        <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
	          {categories.map(cat => (
	            <button key={cat} onClick={() => setActiveCat(cat)} style={{
	              flexShrink: 0, padding: '8px 14px', borderRadius: 9999,
	              border: activeCat === cat ? `1.5px solid ${T.mint}` : `1px solid ${T.border}`,
	              background: activeCat === cat ? T.mintSoft : '#fff',
	              color: activeCat === cat ? T.mintDeep : T.text2,
	              fontSize: 12, fontWeight: 800, cursor: 'pointer',
	            }}>{cat}</button>
	          ))}
	        </div>
	      </div>
      {sectionEntries.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20 }}>
          {sectionEntries.map(([cat, items]) => (
            <div key={cat} style={{
              background: '#fff', borderRadius: 12, padding: 20, boxShadow: T.shadowDeep,
            }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: T.ink, marginBottom: 12 }}>{cat}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {items.map(it => (
	                  <button key={it.key} onClick={() => deleteMode && toggleSelected(it.key)} style={{
	                    display: 'flex', alignItems: 'center', gap: 6,
	                    padding: '8px 12px', borderRadius: 9999,
	                    background: selected.has(it.key) ? T.mintSoft : T.surfaceFill,
	                    border: selected.has(it.key) ? `1px solid ${T.mint}` : '1px solid transparent',
	                    color: selected.has(it.key) ? T.mintDeep : T.ink,
	                    fontSize: 13, fontWeight: 800, cursor: deleteMode ? 'pointer' : 'default',
	                  }}>
	                    {deleteMode && (
	                      <span style={{
	                        width: 16, height: 16, borderRadius: 8,
	                        background: selected.has(it.key) ? T.mint : '#fff',
	                        border: selected.has(it.key) ? 'none' : `1.5px solid ${T.border}`,
	                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
	                      }}>{selected.has(it.key) && Icon.check('#fff', 12)}</span>
	                    )}
	                    <span>{PANTRY_IMAGES[it.name] || '🥬'}</span>
	                    {it.name}
	                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
	      ) : (
	        <div style={{ padding: '48px 16px', textAlign: 'center', color: T.text3 }}>
	          <div style={{ fontSize: 48, marginBottom: 8 }}>{'\uD83E\uDD6C'}</div>
	          <div style={{ fontSize: 14 }}>{'\uAC80\uC0C9 \uACB0\uACFC\uAC00 \uC5C6\uC5B4\uC694'}</div>
	        </div>
	      )}
	      {deleteMode && selected.size > 0 && (
	        <div style={{
	          position: 'fixed', left: 0, right: 0, bottom: 28, zIndex: 9500,
	          display: 'flex', justifyContent: 'center', pointerEvents: 'none',
	        }}>
	          <button onClick={deleteSelected} style={{
	            pointerEvents: 'auto', background: T.red, color: '#fff', border: 'none',
	            borderRadius: 9999, padding: '13px 28px', fontSize: 14, fontWeight: 900,
	            cursor: 'pointer', boxShadow: T.shadowSharp, whiteSpace: 'nowrap',
	          }}>제거하기</button>
	        </div>
	      )}
	    </div>
  );
}

function DesktopMyPage({ savedIds, onOpenRecipe, onGoPage }) {
  const books = (window.RECIPEBOOK_SAMPLES || []).filter(b => b.kind === 'custom');
  const menuItems = [
    ['\u{1F4DA}', '\uB808\uC2DC\uD53C\uBD81', '5\uAC1C', 'mypage-recipebook'],
    ['\u{1F6D2}', '\uC7A5\uBCF4\uAE30 \uAE30\uB85D', '12\uD68C', 'mypage-shopping'],
    ['\u{1F371}', '\uB0A8\uC740\uC694\uB9AC', '\uAD00\uB9AC', 'leftovers'],
    ['\u{1F37D}\uFE0F', '\uB2E4\uBA39\uC740 \uC694\uB9AC', '\uD788\uC2A4\uD1A0\uB9AC', 'ate-list'],
    ['\u2699\uFE0F', '\uD658\uACBD\uC124\uC815', null, 'settings'],
    ['\u{1F464}', '\uACC4\uC815 \uC815\uBCF4', null, 'mypage-account'],
    ['\u{1F514}', '\uC54C\uB9BC \uC124\uC815', null, 'mypage-notif'],
    ['\u{1F4AC}', '\uB3C4\uC6C0\uB9D0 \u00B7 FAQ', null, 'mypage-help'],
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 32, alignItems: 'start' }}>
      <aside style={{
        background: '#fff', borderRadius: 12, padding: 24,
        boxShadow: T.shadowDeep, textAlign: 'center',
      }}>
        <div style={{
          width: 88, height: 88, borderRadius: 44, background: T.mintSoft,
          color: T.mintDeep, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 32, fontWeight: 800, margin: '0 auto 12px',
        }}>U</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: T.ink }}>유저</div>
        <div style={{ fontSize: 12, color: T.text3, marginBottom: 20 }}>user@example.com</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 16 }}>
          {[['레시피북', 5],['요리', 12],['플래너', 24]].map(([l,n]) => (
            <div key={l} style={{ background: T.surfaceFill, padding: '12px 8px', borderRadius: 8 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: T.ink }}>{n}</div>
              <div style={{ fontSize: 11, color: T.text3 }}>{l}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {menuItems.map(([emoji, label, detail, page], i, arr) => (
            <div key={label} onClick={() => page && onGoPage && onGoPage(page)} style={{
              display: 'flex', alignItems: 'center', padding: '10px 8px',
              borderTop: i > 0 ? `1px solid ${T.surfaceSubtle}` : 'none',
              cursor: 'pointer', borderRadius: i === 0 ? '6px 6px 0 0' : i === arr.length - 1 ? '0 0 6px 6px' : 0,
              textAlign: 'left',
            }}>
              <div style={{ fontSize: 16, width: 26, flexShrink: 0 }}>{emoji}</div>
              <div style={{ flex: 1, fontSize: 13, color: T.ink, fontWeight: 500 }}>{label}</div>
              {detail && <div style={{ fontSize: 12, color: T.text3, marginRight: 4 }}>{detail}</div>}
              <div style={{ fontSize: 12, color: T.text4 }}>›</div>
            </div>
          ))}
        </div>
      </aside>
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, color: T.ink, marginBottom: 12 }}>레시피북</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
          {books.map(b => (
            <div key={b.id} onClick={() => onGoPage?.('mypage-recipebook')} style={{
              background: '#fff', borderRadius: 12, overflow: 'hidden',
              boxShadow: T.shadowDeep, cursor: 'pointer',
            }}>
              <div style={{
                width: '100%', aspectRatio: '4/3', background: T.mintSoft,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 64,
              }}>{b.emoji}</div>
              <div style={{ padding: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>{b.name}</div>
                <div style={{ fontSize: 12, color: T.text3, marginTop: 4 }}>
                  {b.recipeIds?.length || 0}개 레시피 · 내 책
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Wave 1.5 — Desktop variants (P0 RecipebookDetail/IngredientFilter
// + P1.1 MENU_ADD / SHOPPING_FLOW / SHOPPING_DETAIL / COOK_MODE)
// ─────────────────────────────────────────────────────────────

// Desktop: RECIPEBOOK_DETAIL (P0)
function DesktopMyPageRecipebookDetail({ bookId, onBack, onOpenRecipe, onRemoveRecipe, onDeleteBook, showToast }) {
  const [confirmDelete, setConfirmDelete] = dUseState(false);
  const [removingId, setRemovingId] = dUseState(null);
  const book = (window.RECIPEBOOK_SAMPLES || []).find(b => b.id === bookId);
  if (!book) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: T.text3, fontSize: 14 }}>
        레시피북을 찾을 수 없어요
        <div style={{ marginTop: 16 }}>
          <button onClick={onBack} style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${T.border}`, background: '#fff', cursor: 'pointer' }}>마이페이지로</button>
        </div>
      </div>
    );
  }
  const recipes = book.recipeIds.map(id => RECIPES.find(r => r.id === id)).filter(Boolean);
  const isCustom = book.kind === 'custom';
  return (
    <div>
      <button onClick={onBack} style={{
        background: 'none', border: 'none', cursor: 'pointer',
        color: T.text2, fontSize: 13, fontWeight: 600, marginBottom: 16,
        display: 'inline-flex', alignItems: 'center', gap: 6,
      }}>{Icon.chevL(T.text2)} 레시피북 목록</button>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 32, alignItems: 'start' }}>
        <aside style={{
          background: '#fff', borderRadius: 16, padding: 24, boxShadow: T.shadowDeep,
          position: 'sticky', top: 24,
        }}>
          <div style={{
            width: 88, height: 88, borderRadius: 22, background: T.mintSoft,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 40, marginBottom: 16,
          }}>{book.emoji}</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: T.ink, fontFamily: T.fontBrand, marginBottom: 4 }}>{book.name}</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 18 }}>
            <span style={{
              fontSize: 11, color: T.text3, background: T.surfaceFill,
              padding: '3px 8px', borderRadius: 6, fontWeight: 700,
            }}>{book.kind === 'saved' ? '저장한 레시피' : '내 레시피북'}</span>
            <span style={{ fontSize: 12, color: T.text3 }}>· {recipes.length}개</span>
          </div>
          {isCustom && (
            <button onClick={() => setConfirmDelete(true)} style={{
              width: '100%', padding: '11px 0', borderRadius: 10, border: `1px solid ${T.border}`,
              background: '#fff', color: T.red, fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}>레시피북 삭제</button>
          )}
        </aside>

        <main>
          <div style={{ fontSize: 16, fontWeight: 700, color: T.ink, marginBottom: 14 }}>레시피 ({recipes.length}개)</div>
          {recipes.length === 0 ? (
            <div style={{ background: '#fff', borderRadius: 12, padding: 60, textAlign: 'center', boxShadow: T.shadowDeep }}>
              <div style={{ fontSize: 44, marginBottom: 8 }}>📭</div>
              <div style={{ fontSize: 14, color: T.text3 }}>아직 레시피가 없어요</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
              {recipes.map(r => (
                <div key={r.id} style={{
                  background: '#fff', borderRadius: 12, overflow: 'hidden',
                  boxShadow: T.shadowDeep, position: 'relative',
                }}>
                  <div onClick={() => onOpenRecipe(r.id)} style={{
                    aspectRatio: '16/10', background: r.bg || T.surfaceFill,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 56, cursor: 'pointer',
                  }}>{r.emoji || '🍽️'}</div>
                  <div style={{ padding: 14 }}>
                    <div onClick={() => onOpenRecipe(r.id)} style={{ fontSize: 14, fontWeight: 700, color: T.ink, marginBottom: 6, cursor: 'pointer' }}>{r.name}</div>
                    <div style={{ fontSize: 11, color: T.text3 }}>조회 {formatMetricCount(recipeViewCount(r))} · {r.minutes}분 · {r.servings}인분</div>
                    {isCustom && (
                      <button onClick={() => setRemovingId(r.id)} style={{
                        marginTop: 10, padding: '6px 12px', borderRadius: 8, border: `1px solid ${T.border}`,
                        background: '#fff', color: T.text2, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                      }}>레시피북에서 제거</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>

      {confirmDelete && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9500 }}>
          <ConfirmDialog title="이 레시피북을 삭제할까요?"
            body="레시피북 안의 레시피는 삭제되지 않아요."
            destructive confirmLabel="삭제하기"
            onClose={() => setConfirmDelete(false)}
            onConfirm={() => { setConfirmDelete(false); onDeleteBook?.(book); }} />
        </div>
      )}
      {removingId && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9500 }}>
          <ConfirmDialog title="레시피북에서 제거할까요?"
            body="레시피 자체는 삭제되지 않아요."
            confirmLabel="제거하기"
            onClose={() => setRemovingId(null)}
            onConfirm={() => { onRemoveRecipe?.(book.id, removingId); setRemovingId(null); showToast?.('레시피북에서 제거됐어요'); }} />
        </div>
      )}
    </div>
  );
}

// Desktop: INGREDIENT_FILTER as centered dialog (P0 desktop variant)
function DesktopIngredientFilterDialog({ value = [], onApply, onClose }) {
  const [selected, setSelected] = dUseState(new Set(value));
  const [query, setQuery] = dUseState('');
  const toggle = (n) => setSelected(s => {
    const next = new Set(s);
    if (next.has(n)) next.delete(n); else next.add(n);
    return next;
  });
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9500, padding: 24,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 18, width: 720, maxHeight: '86vh',
        display: 'flex', flexDirection: 'column', boxShadow: T.shadowCrisp, overflow: 'hidden',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 24px 14px', borderBottom: `1px solid ${T.border}`,
        }}>
          <div style={{ fontSize: 19, fontWeight: 800, color: T.ink, fontFamily: T.fontBrand }}>재료로 거르기</div>
          <button onClick={onClose} style={{
            width: 32, height: 32, borderRadius: 16, background: T.surfaceFill, border: 'none', cursor: 'pointer', fontSize: 18, color: T.text2,
          }}>✕</button>
        </div>
        <div style={{ padding: '14px 24px 12px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: T.surfaceFill, borderRadius: 10, padding: '0 14px', height: 40,
          }}>
            {Icon.search()}
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="재료 검색"
              style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 14, color: T.ink }} />
          </div>
        </div>
        <div style={{ padding: '0 24px 16px', overflowY: 'auto', flex: 1 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 24 }}>
            {(window.INGREDIENT_FILTER_GROUPS || []).map(g => {
              const filtered = query ? g.ingredients.filter(n => n.includes(query)) : g.ingredients;
              if (filtered.length === 0) return null;
              return (
                <div key={g.cat}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: T.text2, marginBottom: 8 }}>{g.cat}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {filtered.map(n => {
                      const on = selected.has(n);
                      return (
                        <button key={n} onClick={() => toggle(n)} style={{
                          padding: '7px 12px', borderRadius: 9999,
                          background: on ? T.mintSoft : T.surfaceFill,
                          color: on ? T.mintDeep : T.text2,
                          border: on ? `1px solid ${T.mint}` : '1px solid transparent',
                          fontSize: 12, fontWeight: 700, cursor: 'pointer',
                        }}>{n}</button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div style={{
          display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '14px 24px',
          borderTop: `1px solid ${T.border}`, background: '#fff',
        }}>
          <button onClick={() => setSelected(new Set())} style={{
            padding: '11px 18px', borderRadius: 10, border: `1px solid ${T.border}`,
            background: '#fff', color: T.text2, fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}>초기화</button>
          <button onClick={() => onApply([...selected])} style={{
            padding: '11px 22px', borderRadius: 10, border: 'none',
            background: T.mint, color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer',
          }}>{selected.size > 0 ? `${selected.size}개 적용` : '필터 적용'}</button>
        </div>
      </div>
    </div>
  );
}

// Desktop: MENU_ADD (P1.1)
function DesktopMenuAddScreen({ presetDate, presetSlot, initialMode, planner, pantry, onBack, onPickRecipe, onGoManual, onGoYtImport, showToast }) {
  const initialTab = initialMode === 'books' ? 'book' : initialMode === 'pantry-match' ? 'pantry' : initialMode === 'search' ? 'search' : 'search';
  const [tab, setTab] = dUseState(initialTab);
  const slotLabel = presetDate && presetSlot ? `${presetDate} ${presetSlot}` : '플래너';
  const menuHaveSet = new Set(Object.values(pantry || {}).filter(v => v.have).map(v => v.name));
  const menuPantryMatches = RECIPES.map(r => {
    const need = (r.ingredients || []).length || 1;
    const matched = (r.ingredients || []).filter(i => menuHaveSet.has(i.name)).length;
    return { r, score: Math.round((matched / need) * 100), matched, need };
  }).sort((a, b) => b.score - a.score);
  const tabs = [
    { k: 'search', label: '레시피 검색', emoji: '🔎' },
    { k: 'book', label: '레시피북', emoji: '📚' },
    { k: 'pantry', label: '팬트리 매칭', emoji: '🧊' },
    { k: 'create', label: '직접/유튜브', emoji: '✏️' },
  ];
  return (
    <div style={{ padding: '8px 0' }}>
      <button onClick={onBack} style={{
        background: 'none', border: 'none', cursor: 'pointer',
        color: T.text2, fontSize: 13, fontWeight: 600, marginBottom: 14,
        display: 'inline-flex', alignItems: 'center', gap: 6,
      }}>{Icon.chevL(T.text2)} 플래너로</button>

      <div style={{
        background: 'linear-gradient(135deg,' + T.mint + ' 0%,' + T.mintDeep + ' 100%)',
        color: '#fff', padding: '24px 28px', borderRadius: 16, marginBottom: 24,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontSize: 12, opacity: 0.9, fontWeight: 700, marginBottom: 4 }}>식사 추가 · {slotLabel}</div>
          <div style={{ fontSize: 24, fontWeight: 800, fontFamily: T.fontBrand }}>어떻게 추가할까요?</div>
        </div>
        <div style={{ fontSize: 56 }}>🍳</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 24, alignItems: 'start' }}>
        <aside style={{ display: 'flex', flexDirection: 'column', gap: 6, position: 'sticky', top: 24 }}>
          {tabs.map(t => (
            <button key={t.k} onClick={() => setTab(t.k)} style={{
              textAlign: 'left', padding: '12px 14px', borderRadius: 10,
              background: tab === t.k ? T.mintSoft : '#fff',
              border: tab === t.k ? `1px solid ${T.mint}` : `1px solid ${T.border}`,
              color: tab === t.k ? T.mintDeep : T.text1,
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{ fontSize: 18 }}>{t.emoji}</span>{t.label}
            </button>
          ))}
        </aside>

        <main style={{ background: '#fff', borderRadius: 16, padding: 24, boxShadow: T.shadowDeep, minHeight: 480 }}>
          {tab === 'search' && (
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: T.ink, marginBottom: 14 }}>레시피 검색</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14 }}>
                {RECIPES.slice(0, 9).map(r => (
                  <div key={r.id} onClick={() => onPickRecipe?.(r.id)} style={{
                    background: '#fff', border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden', cursor: 'pointer',
                  }}>
                    <div style={{ aspectRatio: '4/3', background: r.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 44 }}>{r.emoji}</div>
                    <div style={{ padding: 10 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{r.name}</div>
                      <div style={{ fontSize: 10, color: T.text3, marginTop: 2 }}>조회 {formatMetricCount(recipeViewCount(r))} · {r.minutes}분</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {tab === 'book' && (
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: T.ink, marginBottom: 14 }}>레시피북에서 고르기</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
                {(window.RECIPEBOOK_SAMPLES || []).map(b => (
                  <div key={b.id} style={{
                    background: '#fff', border: `1px solid ${T.border}`, borderRadius: 12, padding: 16,
                  }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 10, background: T.mintSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>{b.emoji}</div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, marginBottom: 3 }}>{b.name}</div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                          <span style={{ fontSize: 13, fontWeight: 800, color: T.mintDeep }}>{b.recipeIds.length}개 레시피</span>
                          <span style={{ fontSize: 11, color: T.text3 }}>{b.kind === 'saved' ? '저장' : '내 책'}</span>
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {b.recipeIds.slice(0, 3).map(id => {
                        const r = RECIPES.find(x => x.id === id);
                        return r ? (
                          <button key={id} onClick={() => onPickRecipe?.(id)} style={{
                            display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6,
                            background: T.surfaceFill, border: 'none', cursor: 'pointer', textAlign: 'left',
                          }}>
                            <span style={{ fontSize: 14 }}>{r.emoji}</span>
                            <span style={{ fontSize: 12, fontWeight: 600, color: T.ink, flex: 1 }}>{r.name}</span>
                          </button>
                        ) : null;
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {tab === 'pantry' && (
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: T.ink, marginBottom: 14 }}>팬트리 재료로 매칭</div>
              <div style={{ fontSize: 12, color: T.text3, marginBottom: 16 }}>
                보유 재료가 많이 일치하는 순서로 정렬돼요.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14 }}>
                {menuPantryMatches.slice(0, 6).map(({ r, score, matched, need }) => (
                  <div key={r.id} onClick={() => onPickRecipe?.(r.id)} style={{
                    background: '#fff', border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden', cursor: 'pointer',
                    position: 'relative',
                  }}>
                    <div style={{ aspectRatio: '4/3', background: r.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 44 }}>{r.emoji}</div>
                    <div style={{ padding: 10 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{r.name}</div>
                      <MatchProgressBar score={score} sub={`${matched}/${need}개 보유`} compact style={{ marginTop: 8 }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {tab === 'create' && (
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: T.ink, marginBottom: 14 }}>새 레시피 만들기</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <button onClick={() => onGoManual?.(presetDate, presetSlot)} style={{
                  background: '#fff', border: `1px solid ${T.border}`, borderRadius: 12, padding: 24, cursor: 'pointer', textAlign: 'left',
                }}>
                  <div style={{ fontSize: 32, marginBottom: 10 }}>✏️</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: T.ink, marginBottom: 4 }}>직접 등록</div>
                  <div style={{ fontSize: 12, color: T.text3 }}>재료·조리법을 직접 입력해요</div>
                </button>
                <button onClick={() => onGoYtImport?.(presetDate, presetSlot)} style={{
                  background: '#fff', border: `1px solid ${T.border}`, borderRadius: 12, padding: 24, cursor: 'pointer', textAlign: 'left',
                }}>
                  <div style={{ fontSize: 32, marginBottom: 10 }}>📺</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: T.ink, marginBottom: 4 }}>유튜브에서 가져오기</div>
                  <div style={{ fontSize: 12, color: T.text3 }}>URL을 붙여넣으면 자동 추출</div>
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

// Desktop: SHOPPING_FLOW (= ShoppingCreate, P1.1)
function DesktopShoppingCreateScreen({ planner, pantry, presetDate, presetSlot, presetMealIndex, onBack, onComplete, showToast }) {
  const singleMealMode = presetDate && presetSlot && presetMealIndex != null;
  // Aggregate ingredients from registered meals
  const items = dUseMemo(() => {
    const acc = {};
    Object.entries(planner).forEach(([date, day]) => {
      ['아침','점심','저녁'].forEach(slot => {
        if (singleMealMode && (date !== presetDate || slot !== presetSlot)) return;
        mealItems(day[slot]).forEach((m, mealIndex) => {
          if (singleMealMode && mealIndex !== presetMealIndex) return;
          if (m.status === 'cooked') return;
          const r = RECIPES.find(x => x.id === m.recipeId);
          if (!r) return;
          r.ingredients.forEach(ing => {
            const key = ing.name;
            const have = Object.values(pantry || {}).some(p => p.name === ing.name && p.have);
            if (!acc[key]) acc[key] = { name: ing.name, qty: ing.qty || '약간', section: ing.section || '기타', meals: [], have };
            acc[key].meals.push(`${date} ${slot} · ${r.name}`);
          });
        });
      });
    });
    return Object.values(acc);
  }, [planner, pantry, presetDate, presetSlot, presetMealIndex]);
  const [localSkipRevived, setLocalSkipRevived] = dUseState(new Set());
  const [localBuyExcluded, setLocalBuyExcluded] = dUseState(new Set());

  const sections = ['채소','육류','해산물','유제품','곡류','양념','기타'];
  const buy = items.filter(i => (!i.have || localSkipRevived.has(i.name)) && !localBuyExcluded.has(i.name));
  const skip = items.filter(i => (i.have && !localSkipRevived.has(i.name)) || localBuyExcluded.has(i.name));
  const grouped = sections.map(sec => ({ sec, list: buy.filter(i => i.section === sec) })).filter(g => g.list.length > 0);
  const shoppingListTitle = singleMealMode ? `${presetDate} ${presetSlot} 음식 장보기` : '2026.05.10 · 장보기 목록';
  const completeCurrentShopping = () => {
    const skipNames = new Set(skip.map(i => i.name));
    const currentItems = items.map(i => {
      const isHave = skipNames.has(i.name);
      return {
        ...i,
        fromMeals: i.meals,
        have: isHave,
        checked: !isHave,
      };
    });
    onComplete?.({
      id: 'sl_' + Date.now(),
      name: shoppingListTitle,
      createdAt: '2026-05-10',
      status: 'active',
      items: currentItems,
    });
    /* CONTRACT_CHECK: POST /shopping-lists — vNext에서는 UI shape만 */
  };
  const moveToSkip = (name) => {
    setLocalBuyExcluded(s => new Set(s).add(name));
    setLocalSkipRevived(s => {
      const n = new Set(s);
      n.delete(name);
      return n;
    });
  };
  const reviveToBuy = (name) => {
    setLocalBuyExcluded(s => {
      const n = new Set(s);
      n.delete(name);
      return n;
    });
    setLocalSkipRevived(s => new Set(s).add(name));
  };
  const desktopMoveBtn = {
    border: `1px solid ${T.border}`, background: '#fff', color: T.text2,
    borderRadius: 9999, padding: '6px 10px', fontSize: 11, fontWeight: 800,
    whiteSpace: 'nowrap', cursor: 'pointer', flexShrink: 0,
  };

  return (
    <div>
      <button onClick={onBack} style={{
        background: 'none', border: 'none', cursor: 'pointer',
        color: T.text2, fontSize: 13, fontWeight: 600, marginBottom: 14,
        display: 'inline-flex', alignItems: 'center', gap: 6,
      }}>{Icon.chevL(T.text2)} 돌아가기</button>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: T.ink, fontFamily: T.fontBrand }}>{shoppingListTitle}</div>
          <div style={{ fontSize: 13, color: T.text3, marginTop: 2 }}>
            {singleMealMode ? '해당 음식 기준' : '이번 주 등록된 식단 기준'} · 구매 예정 {buy.length}개 · 팬트리 제외 {skip.length}개
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button disabled={buy.length === 0} onClick={completeCurrentShopping} style={{
            padding: '10px 18px', borderRadius: 8, border: 'none',
            background: buy.length === 0 ? T.border : T.mint, color: buy.length === 0 ? T.text4 : '#fff',
            fontSize: 13, fontWeight: 800, cursor: buy.length === 0 ? 'default' : 'pointer',
          }}>장보기 완료</button>
          <button onClick={() => showToast?.('공유 링크가 복사됐어요')} style={{
            padding: '10px 16px', borderRadius: 8, border: 'none',
            background: T.surfaceFill, color: T.ink, fontSize: 13, fontWeight: 800, cursor: 'pointer',
          }}>공유</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24, alignItems: 'start' }}>
        <div style={{ background: '#fff', borderRadius: 14, padding: 8, boxShadow: T.shadowDeep }}>
          <div style={{ padding: '12px 16px 4px', fontSize: 14, fontWeight: 800, color: T.ink }}>장볼 재료 목록</div>
          {grouped.map(g => (
            <div key={g.sec} style={{ padding: '12px 16px' }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: T.text2, marginBottom: 8 }}>{g.sec} ({g.list.length})</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                {g.list.map(it => (
                  <div key={it.name} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 12px', borderRadius: 10,
                    background: T.surfaceFill,
                  }}>
                    <span style={{ fontSize: 14 }}>🛒</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{it.name}</div>
                      <div style={{ fontSize: 10, color: T.text3, marginTop: 2 }}>{it.meals.slice(0, 2).join(' · ')}{it.meals.length > 2 ? ` 외 ${it.meals.length - 2}` : ''}</div>
                    </div>
                    <span style={{ fontSize: 11, color: T.text3, fontWeight: 600 }}>{it.qty}</span>
                    <button onClick={() => moveToSkip(it.name)} style={desktopMoveBtn}>이미있음</button>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {grouped.length === 0 && (
            <div style={{ padding: 40, textAlign: 'center', color: T.text3, fontSize: 13 }}>
              장볼 재료가 없어요. 아래 재료를 되살리면 목록에 다시 들어가요.
            </div>
          )}
          <div style={{ padding: '18px 16px 14px', borderTop: `1px solid ${T.surfaceSubtle}` }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: T.ink, marginBottom: 10 }}>
              팬트리에 있어서 제외된 재료 <span style={{ color: T.text4 }}>· {skip.length}</span>
            </div>
            {skip.length === 0 ? (
              <div style={{ padding: 18, borderRadius: 10, background: T.surfaceFill, color: T.text3, fontSize: 13, textAlign: 'center' }}>
                제외된 재료가 없어요.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                {skip.map(it => (
                  <div key={it.name} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 12px', borderRadius: 10, background: T.surfaceSubtle,
                  }}>
                    <span style={{ fontSize: 14, color: T.text4 }}>✓</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: T.text4 }}>{it.name}</div>
                      <div style={{ fontSize: 10, color: T.text3, marginTop: 2 }}>{it.qty} · {it.meals.length}끼에 사용</div>
                    </div>
                    <button onClick={() => reviveToBuy(it.name)} style={{ ...desktopMoveBtn, color: T.mintDeep }}>되살리기</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <aside style={{ background: '#fff', borderRadius: 14, padding: 20, boxShadow: T.shadowDeep, position: 'sticky', top: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: T.ink, marginBottom: 14 }}>요약</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Stat label="이번 주 음식" value={Object.values(planner).reduce((a, d) => a + ['아침','점심','저녁'].reduce((sum, s) => sum + mealItems(d[s]).length, 0), 0) + '개'} />
            <Stat label="필요한 재료" value={items.length + '개'} />
            <Stat label="팬트리 제외" value={skip.length + '개'} color={T.mintDeep} />
            <Stat label="구매 예정" value={buy.length + '개'} color={T.red} />
          </div>
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${T.surfaceSubtle}` }}>
            <div style={{ fontSize: 11, color: T.text3, lineHeight: 1.55 }}>
              ⓘ 보유 재료는 팬트리 데이터와 자동 매칭. 사용자가 수정 가능합니다.
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
function Stat({ label, value, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
      <span style={{ fontSize: 12, color: T.text3 }}>{label}</span>
      <span style={{ fontSize: 18, fontWeight: 800, color: color || T.ink, fontFamily: T.fontBrand }}>{value}</span>
    </div>
  );
}

// Desktop: SHOPPING_DETAIL (P1.1)
function DesktopShoppingDetailScreen({ list, onBack, onToggleItem, onComplete, onReopen, showToast }) {
  if (!list) {
    return (
      <div>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.text2, fontSize: 13, fontWeight: 600, marginBottom: 14 }}>{Icon.chevL(T.text2)} 목록으로</button>
        <div style={{ padding: 60, textAlign: 'center', color: T.text3 }}>장보기 목록을 찾을 수 없어요</div>
      </div>
    );
  }
  const completed = list.status === 'completed';
  const [localSkipRevived, setLocalSkipRevived] = dUseState(new Set());
  const [localBuyExcluded, setLocalBuyExcluded] = dUseState(new Set());
  const buy = list.items.filter(i => !i.have || localSkipRevived.has(i.name)).filter(i => !localBuyExcluded.has(i.name));
  const skip = list.items.filter(i => (i.have && !localSkipRevived.has(i.name)) || localBuyExcluded.has(i.name));
  const checked = buy.filter(i => i.checked).length;
  const total = buy.length;
  const progress = total > 0 ? checked / total : 0;
  const createdDate = list.createdAt || '2026-04-20';
  const sections = buy.reduce((acc, it) => {
    (acc[it.section] = acc[it.section] || []).push(it);
    return acc;
  }, {});
  const completeCurrentShopping = () => {
    const skipNames = new Set(skip.map(i => i.name));
    const currentItems = list.items.map(i => {
      const isHave = skipNames.has(i.name);
      return { ...i, have: isHave, checked: isHave ? false : i.checked };
    });
    onComplete?.({ ...list, items: currentItems });
  };

  return (
    <div>
      <button onClick={onBack} style={{
        background: 'none', border: 'none', cursor: 'pointer',
        color: T.text2, fontSize: 13, fontWeight: 600, marginBottom: 14,
        display: 'inline-flex', alignItems: 'center', gap: 6,
      }}>{Icon.chevL(T.text2)} 장보기 목록</button>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: T.ink, fontFamily: T.fontBrand }}>{list.name}</div>
          <div style={{ fontSize: 13, color: T.text3, marginTop: 2 }}>
            {createdDate} 생성 · {completed ? `완료 · ${list.completedAt || ''}` : '진행 중'} · {checked}/{total} 체크
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button aria-label="공유" onClick={() => showToast?.('공유 링크가 복사됐어요')} style={{
            padding: '10px 14px', borderRadius: 8, border: `1px solid ${T.border}`,
            background: '#fff', color: T.text2, fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}>공유</button>
          {completed ? (
            <span style={{
              padding: '10px 14px', borderRadius: 8, background: T.surfaceFill,
              color: T.text3, fontSize: 13, fontWeight: 800,
            }}>읽기 전용</span>
          ) : (
            <button onClick={completeCurrentShopping} style={{
              padding: '10px 18px', borderRadius: 8, border: 'none',
              background: T.mint, color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer',
            }}>장보기 완료</button>
          )}
        </div>
      </div>

      {/* Progress */}
      <div style={{ background: '#fff', borderRadius: 12, padding: 16, marginBottom: 20, boxShadow: T.shadowNatural }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: T.text2, fontWeight: 800 }}>구매할 재료 {buy.length}개</span>
          <span style={{ fontSize: 12, color: T.text3 }}>팬트리 제외 {skip.length}개</span>
        </div>
        <div style={{ height: 8, background: T.surfaceFill, borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ width: `${progress*100}%`, height: '100%', background: T.mint, transition: 'width 0.2s' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: T.text3 }}>
          <span>0%</span><span>{Math.round(progress*100)}% 진행</span><span>100%</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 0.85fr', gap: 24, alignItems: 'start' }}>
        <main style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {Object.entries(sections).map(([sec, items]) => (
          <div key={sec} style={{ background: '#fff', borderRadius: 12, padding: 16, boxShadow: T.shadowDeep }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: T.text2, marginBottom: 12 }}>{sec} ({items.length})</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {items.map(it => (
                <div key={it.name} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10,
                  background: it.checked ? T.mintSoft : T.surfaceFill,
                }}>
                  <button disabled={completed} onClick={() => onToggleItem?.(it.name)} style={{
                    flex: 1, display: 'flex', alignItems: 'center', gap: 12,
                    border: 'none', background: 'none', cursor: completed ? 'default' : 'pointer',
                    textAlign: 'left', padding: 0,
                  }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: 11,
                    background: it.checked ? T.mint : '#fff',
                    border: it.checked ? 'none' : `2px solid ${T.border}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, fontWeight: 800,
                  }}>{it.checked ? '✓' : ''}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, textDecoration: it.checked ? 'line-through' : 'none' }}>{it.name}</div>
                    <div style={{ fontSize: 10, color: T.text3, marginTop: 2 }}>{it.qty} · {(it.fromMeals || []).join(' · ')}</div>
                  </div>
                  </button>
                  {!completed && (
                    <button onClick={() => {
                      setLocalBuyExcluded(s => { const n = new Set(s); n.add(it.name); return n; });
                      setLocalSkipRevived(s => { const n = new Set(s); n.delete(it.name); return n; });
                      showToast?.(`${it.name} → 이미 있음 처리`);
                      /* CONTRACT_CHECK: PATCH /shopping-lists/:id/items/:name {have:true} — vNext에서는 UI shape만 */
                    }} style={{
                      padding: '6px 10px', borderRadius: 8, border: `1px solid ${T.border}`,
                      background: '#fff', color: T.text2, fontSize: 11, fontWeight: 800,
                      cursor: 'pointer', whiteSpace: 'nowrap',
                    }}>이미있음</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
        {Object.keys(sections).length === 0 && (
          <div style={{ background: '#fff', borderRadius: 12, padding: 40, boxShadow: T.shadowDeep, textAlign: 'center', color: T.text3 }}>
            구매할 재료가 없어요
          </div>
        )}
        </main>

        <aside style={{ background: '#fff', borderRadius: 12, padding: 16, boxShadow: T.shadowDeep, position: 'sticky', top: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: T.text2, marginBottom: 12 }}>
            팬트리에 이미 있어 제외 ({skip.length})
          </div>
          {skip.length === 0 ? (
            <div style={{ fontSize: 12, color: T.text3, lineHeight: 1.6 }}>제외된 재료가 없어요.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {skip.map(it => (
                <div key={it.name} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', borderRadius: 10, background: T.surfaceFill,
                }}>
                  <span style={{ width: 22, height: 22, borderRadius: 11, background: T.mintSoft, color: T.mintDeep,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 900 }}>✓</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.text2 }}>{it.name}</div>
                    <div style={{ fontSize: 10, color: T.text3, marginTop: 2 }}>{it.qty}</div>
                  </div>
                  {!completed && (
                    <button onClick={() => {
                      if (it.have) setLocalSkipRevived(s => { const n = new Set(s); n.add(it.name); return n; });
                      setLocalBuyExcluded(s => { const n = new Set(s); n.delete(it.name); return n; });
                      showToast?.(`${it.name} → 장보기 목록으로 복원`);
                      /* CONTRACT_CHECK: PATCH /shopping-lists/:id/items/:name {have:false} — vNext에서는 UI shape만 */
                    }} style={{
                      padding: '6px 10px', borderRadius: 8, border: `1px solid ${T.mint}`,
                      background: T.mintSoft, color: T.mintDeep, fontSize: 11, fontWeight: 800,
                      cursor: 'pointer', whiteSpace: 'nowrap',
                    }}>되살리기</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>

      {!completed && (
        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
          <button disabled={buy.length === 0} onClick={completeCurrentShopping} style={{
            padding: '13px 28px', borderRadius: 10, border: 'none',
            background: buy.length === 0 ? T.border : T.mint, color: '#fff',
            fontSize: 14, fontWeight: 800, cursor: buy.length === 0 ? 'default' : 'pointer',
            fontFamily: T.fontBrand,
          }}>장보기 완료</button>
        </div>
      )}
      </div>
  );
}

// Desktop: COOK_MODE (= CookRun, P1.1)
function DesktopCookRunScreen({ date, slot, mealIndex = 0, recipeId, planner, onBack, onComplete, showToast }) {
  const meal = date && slot ? mealItems(planner[date]?.[slot])[mealIndex] : null;
  const recipe = RECIPES.find(r => r.id === (recipeId || meal?.recipeId));
  const independentCook = !!recipeId && !meal;
  const [consumed, setConsumed] = dUseState(new Set());
  const [confirmCancel, setConfirmCancel] = dUseState(false);
  if (!recipe) {
    return (
      <div>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.text2, fontSize: 13, fontWeight: 600, marginBottom: 14 }}>{Icon.chevL(T.text2)} 돌아가기</button>
        <div style={{ padding: 60, textAlign: 'center', color: T.text3 }}>레시피를 찾을 수 없어요</div>
      </div>
    );
  }
  const steps = recipe.steps || [{ text: '레시피 단계 정보가 없어요' }];

  return (
    <div>
      <button onClick={() => setConfirmCancel(true)} style={{
        background: 'none', border: 'none', cursor: 'pointer',
        color: T.text2, fontSize: 13, fontWeight: 600, marginBottom: 14,
        display: 'inline-flex', alignItems: 'center', gap: 6,
      }}>{Icon.chevL(T.text2)} 취소</button>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 11, color: T.text3, fontWeight: 700, letterSpacing: 1 }}>
            {independentCook ? '요리 모드 · 독립 요리' : `요리 모드 · ${date} ${slot}`}
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: T.ink, fontFamily: T.fontBrand }}>{recipe.name}</div>
        </div>
        <div style={{ fontSize: 13, color: T.text3 }}>{steps.length}단계</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 24, alignItems: 'start' }}>
        {/* All steps — scrollable main area */}
        <main style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {steps.map((cur, i) => {
            const m = METHOD_COLORS[cur.method] || METHOD_COLORS.prep;
            return (
              <div key={i} style={{
                background: '#fff', borderRadius: 16, boxShadow: T.shadowDeep, overflow: 'hidden',
                borderLeft: `5px solid ${m.border}`,
              }}>
                <div style={{ padding: 22 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <span style={{
                      fontSize: 11, fontWeight: 800, color: '#fff', background: m.border,
                      padding: '3px 10px', borderRadius: 9999,
                    }}>STEP {i + 1}</span>
                    <span style={{
                      fontSize: 11, fontWeight: 700, color: m.text, background: m.bg,
                      padding: '3px 8px', borderRadius: 9999,
                    }}>{m.label}</span>
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: T.ink, lineHeight: 1.55, marginBottom: 8, fontFamily: T.fontBrand }}>
                    {cur.title || `단계 ${i + 1}`}
                  </div>
                  <div style={{ fontSize: 14, color: T.text1, lineHeight: 1.6 }}>
                    {cur.body || cur.text || ''}
                  </div>
                </div>
              </div>
            );
          })}

	        </main>

	        <aside style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'sticky', top: 24 }}>
	          <div style={{ background: '#fff', borderRadius: 12, padding: 16, boxShadow: T.shadowDeep }}>
	            <div style={{ display: 'flex', gap: 10 }}>
	              <button onClick={() => setConfirmCancel(true)} style={{
	                padding: '12px 16px', borderRadius: 10, border: `1px solid ${T.border}`,
	                background: '#fff', color: T.text2, fontSize: 13, fontWeight: 800, cursor: 'pointer',
	                whiteSpace: 'nowrap',
	              }}>취소</button>
	              <button onClick={() => {
                  if (independentCook) {
                    showToast?.('🎉 요리 완료!');
                    onBack?.();
                  } else {
                    onComplete?.(date, slot, [...consumed], mealIndex);
                  }
                }} style={{
	                flex: 1, padding: '12px 18px', borderRadius: 10, border: 'none',
	                background: T.mint, color: '#fff', fontSize: 14, fontWeight: 900, cursor: 'pointer',
	                fontFamily: T.fontBrand, whiteSpace: 'nowrap',
	              }}>요리 완료</button>
	            </div>
	          </div>
	          {/* Consumed checklist */}
          <div style={{ background: '#fff', borderRadius: 12, padding: 16, boxShadow: T.shadowDeep }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: T.text2, marginBottom: 10 }}>차감할 재료</div>
            <div style={{ fontSize: 11, color: T.text3, marginBottom: 10 }}>완료 시 팬트리에서 차감돼요. 안 쓴 재료는 체크 해제.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {recipe.ingredients.slice(0, 8).map(ing => {
                const on = consumed.has(ing.name);
                return (
                  <button key={ing.name} onClick={() => setConsumed(s => {
                    const n = new Set(s); if (n.has(ing.name)) n.delete(ing.name); else n.add(ing.name); return n;
                  })} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6,
                    background: on ? T.mintSoft : 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
                  }}>
                    <span style={{
                      width: 16, height: 16, borderRadius: 4,
                      background: on ? T.mint : 'transparent',
                      border: on ? 'none' : `1.5px solid ${T.border}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff', fontSize: 11, fontWeight: 800,
                    }}>{on ? '✓' : ''}</span>
                    <span style={{ fontSize: 12, color: T.ink, flex: 1 }}>{ing.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>
      </div>

      {confirmCancel && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9500 }}>
          <ConfirmDialog title="요리를 취소할까요?"
            body="진행 중인 요리 기록이 사라져요."
            destructive confirmLabel="취소하기" cancelLabel="계속하기"
            onClose={() => setConfirmCancel(false)}
            onConfirm={() => { setConfirmCancel(false); onBack(); }} />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Wave 1.6 — Desktop variants (LOGIN / SETTINGS / MEAL_SCREEN / COOK_READY_LIST)
// 모바일 컴포넌트와 동일한 prop 시그니처를 유지해서 App 측 wiring 변화를 최소화한다.
// ─────────────────────────────────────────────────────────────

// Desktop: LOGIN (P1.2)
function DesktopLoginScreen({ returnTo, onBack, onLogin }) {
  const providers = [
    { k: 'naver',  label: '네이버로 시작',   bg: '#03C75A', color: '#fff',    emoji: 'N' },
    { k: 'google', label: 'Google로 시작',  bg: '#fff',    color: '#212529', emoji: 'G', border: T.border },
  ];
  return (
    <div style={{
      minHeight: 'calc(100vh - 120px)',
      display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 32, alignItems: 'stretch',
    }}>
      {/* Hero panel */}
      <div style={{
        background: `linear-gradient(135deg, ${T.mint} 0%, ${T.mintDeep} 100%)`,
        color: '#fff', borderRadius: 20, padding: 48, position: 'relative',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between', overflow: 'hidden',
      }}>
        <div>
          <div style={{
            width: 80, height: 80, borderRadius: 22, background: 'rgba(255,255,255,0.18)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 38, fontFamily: T.fontBrand, fontWeight: 800, marginBottom: 24,
            backdropFilter: 'blur(8px)',
          }}>홈</div>
          <div style={{ fontSize: 36, fontWeight: 800, lineHeight: 1.25, fontFamily: T.fontBrand }}>
            홈쿡과 함께<br />오늘 뭐 먹지 정해봐요
          </div>
          <div style={{ fontSize: 15, opacity: 0.92, marginTop: 14, lineHeight: 1.6, maxWidth: 420 }}>
            식단을 짜고, 장 보고, 요리한 기록을 남길 수 있어요.<br />
            로그인하면 모든 기록이 자동으로 동기화돼요.
          </div>
        </div>
        <div style={{
          display: 'flex', gap: 16, opacity: 0.9, fontSize: 13,
          background: 'rgba(255,255,255,0.12)', borderRadius: 12, padding: 14, backdropFilter: 'blur(8px)',
        }}>
          <span>🍳 식단 플래너</span>
          <span>·</span>
          <span>🛒 장보기</span>
          <span>·</span>
          <span>🧊 팬트리</span>
          <span>·</span>
          <span>📖 레시피북</span>
        </div>
      </div>

      {/* Login panel */}
      <div style={{
        background: '#fff', borderRadius: 20, padding: 40, boxShadow: T.shadowDeep,
        display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        <div>
          <div style={{ fontSize: 11, color: T.text3, fontWeight: 700, letterSpacing: 1.2 }}>SIGN IN</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: T.ink, fontFamily: T.fontBrand, marginTop: 6 }}>
            소셜 계정으로 빠르게
          </div>
        </div>

        {returnTo && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            border: `1px solid ${T.mint}`, background: T.mintSoft,
            borderRadius: 12, padding: 14,
          }}>
            <span style={{ fontSize: 22 }}>↩️</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: T.mintDeep, fontWeight: 800 }}>로그인 후 이어서</div>
              <div style={{ fontSize: 14, color: T.ink, fontWeight: 700, marginTop: 1 }}>{returnTo.label}</div>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
          {providers.map(p => (
            <button key={p.k} onClick={() => onLogin?.(p.k, returnTo)} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '14px 18px', borderRadius: 12,
              background: p.bg, color: p.color, fontSize: 15, fontWeight: 700, cursor: 'pointer',
              border: p.border ? `1px solid ${p.border}` : 'none',
              boxShadow: T.shadowNatural, fontFamily: T.fontUI, justifyContent: 'flex-start',
            }}>
              <span style={{
                width: 28, height: 28, borderRadius: 14,
                background: p.k === 'apple' ? '#fff' : 'rgba(0,0,0,0.06)',
                color: p.k === 'apple' ? '#000' : 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14,
              }}>{p.emoji}</span>
              <span style={{ flex: 1, textAlign: 'left' }}>{p.label}</span>
            </button>
          ))}
        </div>

        <div style={{
          fontSize: 11, color: T.text3, lineHeight: 1.55, marginTop: 6,
          padding: 12, background: T.surfaceFill, borderRadius: 10,
        }}>
          ⓘ 로그인 없이 둘러보고 싶다면 <button onClick={onBack} style={{
            background: 'none', border: 'none', color: T.mintDeep, fontWeight: 700, cursor: 'pointer', padding: 0,
          }}>건너뛰기</button>. 단, 작성한 식단·레시피·팬트리 기록은 기기 내에만 저장돼요.
        </div>
      </div>
    </div>
  );
}

// Desktop: SETTINGS (P1.2)
function DesktopSettingsScreen({ profile, onBack, onUpdateProfile, onLogout, onDeleteAccount, showToast }) {
  const defaultPrefs = { keepAwake: true, voice: false, autoNext: false };
  const defaultMealColumns = ['아침', '점심', '저녁'];
  const [savedPrefs, setSavedPrefs] = dUseState(defaultPrefs);
  const [draftPrefs, setDraftPrefs] = dUseState(defaultPrefs);
  const [savedMealColumns, setSavedMealColumns] = dUseState(defaultMealColumns);
  const [mealColumns, setMealColumns] = dUseState(defaultMealColumns);
  const [newMealName, setNewMealName] = dUseState('');
  const [section, setSection] = dUseState('planner');
  const prefsDirty = JSON.stringify(savedPrefs) !== JSON.stringify(draftPrefs);
  const normalizedMealColumns = mealColumns.map(name => name.trim()).filter(Boolean);
  const mealColumnsDirty = JSON.stringify(savedMealColumns) !== JSON.stringify(normalizedMealColumns);
  const mealColumnsValid = normalizedMealColumns.length === mealColumns.length && normalizedMealColumns.length > 0;
  const settingsDirty = prefsDirty || mealColumnsDirty;
  const setDraftPref = (key, value) => setDraftPrefs(prev => ({ ...prev, [key]: value }));
  const saveSettings = () => {
    if (!mealColumnsValid) {
      showToast?.('끼니 이름을 모두 입력해주세요');
      return;
    }
    setSavedPrefs(draftPrefs);
    setSavedMealColumns(normalizedMealColumns);
    setMealColumns(normalizedMealColumns);
    showToast?.('환경설정이 저장됐어요');
  };
  const cancelSettings = () => {
    setDraftPrefs(savedPrefs);
    setMealColumns(savedMealColumns);
    setNewMealName('');
    showToast?.('환경설정 변경을 취소했어요');
  };

  const addMealColumn = () => {
    const name = newMealName.trim();
    if (!name) return;
    if (mealColumns.length >= 5) {
      showToast?.('끼니 컬럼은 최대 5개까지 가능해요');
      return;
    }
    if (mealColumns.includes(name)) {
      showToast?.('이미 있는 끼니예요');
      return;
    }
    setMealColumns(cols => [...cols, name]);
    setNewMealName('');
    showToast?.('끼니 컬럼이 추가됐어요');
  };
  const updateMealColumn = (idx, value) => {
    setMealColumns(cols => cols.map((name, i) => i === idx ? value : name));
  };
  const removeMealColumn = (idx) => {
    setMealColumns(cols => cols.filter((_, i) => i !== idx));
    showToast?.('끼니 컬럼이 삭제됐어요');
  };

  const sections = [
    { k: 'planner', label: '플래너 끼니', emoji: '🗓️' },
    { k: 'cook',    label: '요리 모드', emoji: '🍳' },
    { k: 'notif',   label: '알림', emoji: '🔔' },
    { k: 'data',    label: '데이터 · 백업', emoji: '💾' },
  ];

  return (
    <div>
      <button onClick={onBack} style={{
        background: 'none', border: 'none', cursor: 'pointer',
        color: T.text2, fontSize: 13, fontWeight: 600, marginBottom: 16,
        display: 'inline-flex', alignItems: 'center', gap: 6,
      }}>{Icon.chevL(T.text2)} 마이페이지</button>

      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: T.ink, fontFamily: T.fontBrand }}>설정</div>
        <div style={{ fontSize: 12, color: T.text3 }}>필요한 설정은 저장 후 반영돼요</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 24, alignItems: 'start' }}>
        <aside style={{ display: 'flex', flexDirection: 'column', gap: 4, position: 'sticky', top: 24 }}>
          {sections.map(s => (
            <button key={s.k} onClick={() => setSection(s.k)} style={{
              textAlign: 'left', padding: '11px 14px', borderRadius: 10,
              background: section === s.k ? T.mintSoft : 'transparent',
              border: section === s.k ? `1px solid ${T.mint}` : '1px solid transparent',
              color: section === s.k ? T.mintDeep : T.text1,
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <span style={{ fontSize: 16 }}>{s.emoji}</span>{s.label}
            </button>
          ))}
        </aside>

        <main style={{ background: '#fff', borderRadius: 16, padding: 28, boxShadow: T.shadowDeep, minHeight: 400 }}>
          {section === 'planner' && (
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: T.ink, marginBottom: 18 }}>플래너 끼니 컬럼</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {mealColumns.map((name, idx) => (
                  <div key={`${name}-${idx}`} style={{
                    display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center',
                    padding: 12, borderRadius: 12, border: `1px solid ${T.border}`, background: T.surfaceFill,
                  }}>
                    <input value={name} onChange={e => updateMealColumn(idx, e.target.value)}
                      style={{ ...inp, background: '#fff', padding: '11px 12px', fontSize: 13 }}
                      aria-label={`끼니 컬럼 ${idx + 1}`} />
                    <button onClick={() => removeMealColumn(idx)} disabled={mealColumns.length <= 1} style={{
                      width: 40, height: 40, borderRadius: 10, border: `1px solid ${T.border}`,
                      background: mealColumns.length <= 1 ? T.surfaceFill : '#fff',
                      color: mealColumns.length <= 1 ? T.text4 : T.red,
                      cursor: mealColumns.length <= 1 ? 'not-allowed' : 'pointer',
                      fontSize: 17, fontWeight: 800,
                    }}>×</button>
                  </div>
                ))}
                {mealColumns.length < 5 && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, marginTop: 4 }}>
                    <input value={newMealName} onChange={e => setNewMealName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') addMealColumn(); }}
                      placeholder="새 끼니 이름"
                      style={{ ...inp, padding: '12px 14px', fontSize: 13 }} />
                    <button onClick={addMealColumn} style={{
                      padding: '0 16px', borderRadius: 10, border: 'none',
                      background: T.mint, color: '#fff', fontSize: 13, fontWeight: 800,
                      cursor: 'pointer', whiteSpace: 'nowrap',
                    }}>+ 끼니 컬럼 추가</button>
                  </div>
                )}
                <div style={{ fontSize: 11, color: mealColumns.length >= 5 ? T.red : T.text3, marginTop: 2 }}>{mealColumns.length}/5개</div>
              </div>
            </div>
          )}
          {section === 'cook' && (
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: T.ink, marginBottom: 18 }}>요리 모드</div>
              <DesktopToggleRow label="화면 켜둠" sub="요리 중 화면이 꺼지지 않아요" on={draftPrefs.keepAwake} onChange={(v) => setDraftPref('keepAwake', v)} />
              <DesktopToggleRow label="음성 안내" sub="단계 음성을 읽어줘요 (베타)" on={draftPrefs.voice} onChange={(v) => setDraftPref('voice', v)} />
              <DesktopToggleRow label="타이머 끝나면 다음 단계 자동" sub="타이머 종료 시 자동으로 다음 단계로 넘어갑니다" on={draftPrefs.autoNext} onChange={(v) => setDraftPref('autoNext', v)} />
            </div>
          )}
          {section === 'notif' && (
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: T.ink, marginBottom: 18 }}>알림</div>
              <div style={{ background: T.surfaceFill, borderRadius: 10, padding: 24, fontSize: 13, color: T.text2, textAlign: 'center' }}>
                알림 설정은 다음 Wave에서 제공돼요. 현재는 모두 기본 설정으로 동작합니다.
              </div>
            </div>
          )}
          {section === 'data' && (
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: T.ink, marginBottom: 18 }}>데이터 · 백업</div>
              <DesktopSettingRow label="데이터 내보내기" sub="식단·레시피·팬트리를 JSON으로 받아요"
                right={<button onClick={() => showToast?.('내보내기는 다음 Wave (베타)')} style={editLinkBtnDsk}>내보내기</button>} />
              <DesktopSettingRow label="기기 데이터 초기화" sub="이 기기의 임시 캐시만 비웁니다"
                right={<button onClick={() => showToast?.('캐시가 비워졌어요')} style={editLinkBtnDsk}>초기화</button>} />
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 22 }}>
            <button disabled={!settingsDirty} onClick={cancelSettings} style={{
              padding: '10px 16px', borderRadius: 10, border: `1px solid ${T.border}`,
              background: '#fff', color: settingsDirty ? T.text2 : T.text4, fontSize: 13, fontWeight: 800,
              cursor: settingsDirty ? 'pointer' : 'not-allowed',
            }}>취소</button>
            <button disabled={!settingsDirty || !mealColumnsValid} onClick={saveSettings} style={{
              padding: '10px 18px', borderRadius: 10, border: 'none',
              background: settingsDirty && mealColumnsValid ? T.mint : T.border, color: '#fff', fontSize: 13, fontWeight: 900,
              cursor: settingsDirty && mealColumnsValid ? 'pointer' : 'not-allowed',
            }}>저장</button>
          </div>
        </main>
      </div>
    </div>
  );
}
function DesktopSettingRow({ label, sub, right }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '14px 0', borderBottom: `1px solid ${T.surfaceSubtle}`, gap: 16,
    }}>
      <div>
        <div style={{ fontSize: 14, color: T.ink, fontWeight: 700 }}>{label}</div>
        {sub && <div style={{ fontSize: 12, color: T.text3, marginTop: 3 }}>{sub}</div>}
      </div>
      {right != null && <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>{right}</div>}
    </div>
  );
}
function DesktopToggleRow({ label, sub, on, onChange }) {
  return (
    <DesktopSettingRow label={label} sub={sub} right={
      <button onClick={() => onChange(!on)} style={{
        width: 48, height: 28, borderRadius: 14,
        background: on ? T.mint : '#DEE2E6', border: 'none',
        position: 'relative', cursor: 'pointer', transition: 'background 0.15s',
      }}>
        <div style={{
          position: 'absolute', top: 2, left: on ? 22 : 2,
          width: 24, height: 24, borderRadius: 12, background: '#fff',
          transition: 'left 0.15s', boxShadow: '0 1px 3px rgba(0,0,0,0.16)',
        }} />
      </button>
    } />
  );
}
const editLinkBtnDsk = {
  background: 'none', border: 'none', color: T.mintDeep,
  fontSize: 13, fontWeight: 800, cursor: 'pointer', padding: '4px 0',
  whiteSpace: 'nowrap', lineHeight: 1.2,
};
const dskRoundBtn = {
  width: 32, height: 32, borderRadius: 16, border: 'none',
  background: '#fff', color: T.text2, fontSize: 18, fontWeight: 800, cursor: 'pointer',
};
const dskMealActionBtn = {
  padding: '11px 8px', borderRadius: 10, border: `1px solid ${T.border}`,
  background: '#fff', color: T.text2, fontSize: 12, fontWeight: 800, cursor: 'pointer',
};

// Desktop: MEAL_SCREEN (P1.2)
function DesktopMealDetailScreen({ date, slot, planner, onBack, onOpenRecipe, onStartCook, onCreateShopping, onChangeStatus, onRemove, onChangeServings }) {
  const meals = mealItems(planner[date]?.[slot]);
  const [askDelete, setAskDelete] = dUseState(null);
  if (meals.length === 0) {
    return (
      <div>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.text2, fontSize: 13, fontWeight: 600, marginBottom: 14 }}>{Icon.chevL(T.text2)} 돌아가기</button>
        <div style={{ padding: 60, textAlign: 'center', color: T.text3 }}>끼니를 찾을 수 없어요</div>
      </div>
    );
  }

  /* ─── Unified desktop card renderer ─── */
  const DskMealCard = ({ meal, mealIndex }) => {
    const recipe = RECIPES.find(r => r.id === meal.recipeId);
    if (!recipe) return null;
    return (
      <div style={{
        background: '#fff', borderRadius: 16, boxShadow: T.shadowDeep, overflow: 'hidden',
        border: `1px solid ${T.border}`, position: 'relative',
      }}>
        {/* Trash icon — top-right */}
        <button aria-label="삭제" onClick={() => setAskDelete({ index: mealIndex, recipe })} style={{
          position: 'absolute', top: 14, right: 14, zIndex: 1,
          width: 34, height: 34, borderRadius: 17, border: 'none',
          background: T.surfaceFill, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>{Icon.trash(T.text3, 16)}</button>

        <div style={{ display: 'grid', gridTemplateColumns: '112px 1fr', gap: 14, padding: 16 }}>
          <div style={{
            width: 112, height: 112, borderRadius: 14, background: recipe.bg,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 62,
          }}>{recipe.emoji}</div>
          <div style={{ minWidth: 0, paddingRight: 30 }}>
            <button onClick={() => onOpenRecipe?.(recipe.id)} style={{
              background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left',
            }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: T.ink, fontFamily: T.fontBrand, marginBottom: 4 }}>
                {recipe.name}
              </div>
            </button>
            <div style={{ fontSize: 12, color: T.text3 }}>
              {recipe.minutes}분 · {meal.servings}인분
            </div>
          </div>
        </div>

        <div style={{ padding: '0 16px 16px' }}>
          {/* Servings stepper */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: T.surfaceFill, borderRadius: 12, padding: 12, marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: T.text2, fontWeight: 800 }}>계획 인분</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button onClick={() => onChangeServings?.(date, slot, Math.max(1, meal.servings - 1), mealIndex)} style={dskRoundBtn}>−</button>
              <span style={{ minWidth: 48, textAlign: 'center', fontSize: 16, fontWeight: 800, color: T.ink }}>{meal.servings}인분</span>
              <button onClick={() => onChangeServings?.(date, slot, Math.min(12, meal.servings + 1), mealIndex)} style={{ ...dskRoundBtn, background: T.mint, color: '#fff' }}>+</button>
            </div>
          </div>

          {/* Ingredient chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
            {recipe.ingredients.slice(0, 6).map(ing => (
              <span key={ing.name} style={{ fontSize: 11, color: T.text2, background: T.surfaceFill, padding: '6px 9px', borderRadius: 9999 }}>
                {ing.name}
              </span>
            ))}
          </div>

          {/* Actions: 장보기 + 요리하기 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button onClick={() => onCreateShopping?.(date, slot, mealIndex)} style={dskMealActionBtn}>장보기</button>
            <button onClick={() => onStartCook?.(date, slot, mealIndex)} style={{ ...dskMealActionBtn, background: T.mint, borderColor: T.mint, color: '#fff' }}>요리하기</button>
          </div>
        </div>
      </div>
    );
  };

  const totalServings = meals.reduce((sum, meal) => sum + (meal.servings || 1), 0);

  return (
    <div>
      <button onClick={onBack} style={{
        background: 'none', border: 'none', cursor: 'pointer',
        color: T.text2, fontSize: 13, fontWeight: 600, marginBottom: 14,
        display: 'inline-flex', alignItems: 'center', gap: 6,
      }}>{Icon.chevL(T.text2)} 플래너</button>

      <div style={{
        background: '#fff', borderRadius: 18, boxShadow: T.shadowDeep, padding: 28, marginBottom: 22,
        display: 'grid', gridTemplateColumns: '1fr 280px', gap: 24, alignItems: 'center',
      }}>
        <div>
          <div style={{ fontSize: 12, color: T.mintDeep, fontWeight: 800, letterSpacing: 1, marginBottom: 6 }}>
            {date} · {slot}
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: T.ink, fontFamily: T.fontBrand }}>
            {meals.length > 1 ? `${slot}에 먹을 음식 ${meals.length}개` : (RECIPES.find(r => r.id === meals[0]?.recipeId)?.name || slot)}
          </div>
          <div style={{ fontSize: 13, color: T.text3, marginTop: 6 }}>
            {meals.length > 1 ? '한 끼니 안에서 여러 레시피의 인분과 요리를 관리해요.' : '이 끼니의 인분과 재료를 확인하세요.'}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Stat label="음식 수" value={meals.length + '개'} />
          <Stat label="총 인분" value={totalServings + '인분'} color={T.mintDeep} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        {meals.map((meal, mealIndex) => (
          <DskMealCard key={`${meal.recipeId}-${mealIndex}`} meal={meal} mealIndex={mealIndex} />
        ))}
      </div>

      {askDelete && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9500 }}>
          <ConfirmDialog title="이 음식을 삭제할까요?"
            body={askDelete.recipe.name + ' (' + date + ' ' + slot + ') 가 식단에서 제거돼요.'}
            destructive confirmLabel="삭제"
            onClose={() => setAskDelete(null)}
            onConfirm={() => { const idx = askDelete.index; setAskDelete(null); onRemove?.(date, slot, idx); }} />
        </div>
      )}
    </div>
  );
}

// Desktop: COOK_READY_LIST (P1.2)
function DesktopCookListScreen({ planner, onBack, onStartCook, onOpenMeal }) {
  const days = Object.keys(planner);
  const todayK = days[todayIdx];
  const tomorrowK = days[todayIdx + 1];
  const groups = [
    { k: 'today',   label: '오늘',                dayKeys: [todayK],                emoji: '🌟' },
    { k: 'tomorrow', label: '내일',               dayKeys: [tomorrowK],             emoji: '⏭️' },
    { k: 'rest',    label: '이번 주 남은 끼니',     dayKeys: days.slice(todayIdx + 2), emoji: '📅' },
  ];
  const buildMeals = (dayKeys) => {
    const list = [];
    dayKeys.forEach(d => {
      ['아침','점심','저녁'].forEach(s => {
        mealItems(planner[d]?.[s]).forEach((m, mealIndex) => {
          if (m.status !== 'cooked') list.push({ date: d, slot: s, meal: m, mealIndex });
        });
      });
    });
    return list;
  };
  const totalReady = groups.reduce((acc, g) => acc + buildMeals(g.dayKeys).length, 0);

  return (
    <div>
      <button onClick={onBack} style={{
        background: 'none', border: 'none', cursor: 'pointer',
        color: T.text2, fontSize: 13, fontWeight: 600, marginBottom: 14,
        display: 'inline-flex', alignItems: 'center', gap: 6,
      }}>{Icon.chevL(T.text2)} 플래너</button>

      <div style={{
        background: 'linear-gradient(135deg,' + T.mintSoft + ' 0%, #fff 100%)',
        border: `1px solid ${T.mint}`, borderRadius: 16, padding: 28, marginBottom: 24,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontSize: 12, color: T.mintDeep, fontWeight: 800, letterSpacing: 1, marginBottom: 4 }}>COOK READY</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: T.ink, fontFamily: T.fontBrand }}>
            지금 요리할 수 있는 식사 {totalReady}건
          </div>
          <div style={{ fontSize: 13, color: T.text3, marginTop: 2 }}>오늘부터 이번 주말까지, 아직 요리하지 않은 식사를 모았어요</div>
        </div>
        <div style={{ fontSize: 80, opacity: 0.85 }}>🍳</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        {groups.map(g => {
          const meals = buildMeals(g.dayKeys);
          if (meals.length === 0 && g.k !== 'today') return null;
          return (
            <section key={g.k}>
              <div style={{
                display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12,
              }}>
                <span style={{ fontSize: 18 }}>{g.emoji}</span>
                <div style={{ fontSize: 16, fontWeight: 800, color: T.ink }}>{g.label}</div>
                <div style={{ fontSize: 12, color: T.text3 }}>· {meals.length}끼</div>
              </div>
              {meals.length === 0 ? (
                <div style={{
                  background: '#fff', border: `1px dashed ${T.border}`, borderRadius: 12,
                  padding: 32, textAlign: 'center',
                }}>
                  <div style={{ fontSize: 32, marginBottom: 6 }}>✨</div>
                  <div style={{ fontSize: 13, color: T.text2, fontWeight: 700 }}>오늘 요리할 끼니가 없어요</div>
                  <div style={{ fontSize: 11, color: T.text3, marginTop: 4 }}>플래너에서 식단을 등록해 보세요</div>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
                  {meals.map(({ date, slot, meal, mealIndex }) => {
                    const recipe = RECIPES.find(r => r.id === meal.recipeId);
                    if (!recipe) return null;
                    const m = METHOD_COLORS[recipe.method] || METHOD_COLORS.prep;
                    return (
                      <div key={`${date}-${slot}-${mealIndex}`} style={{
                        background: '#fff', borderRadius: 14, overflow: 'hidden',
                        border: `1px solid ${T.border}`, boxShadow: T.shadowNatural,
                        borderLeft: `4px solid ${m.border}`,
                        display: 'flex', flexDirection: 'column',
                      }}>
                        <div onClick={() => onOpenMeal?.(date, slot)} style={{
                          padding: 14, display: 'flex', gap: 12, alignItems: 'center', cursor: 'pointer',
                        }}>
                          <div style={{
                            width: 64, height: 64, borderRadius: 12, background: recipe.bg,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, flexShrink: 0,
                          }}>{recipe.emoji}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 10, fontWeight: 800, color: m.text, background: m.bg, padding: '2px 6px', borderRadius: 4 }}>
                                {m.label}
                              </span>
                              <StatusPill status={meal.status} />
                            </div>
                            <div style={{ fontSize: 14, fontWeight: 800, color: T.ink, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {recipe.name}
                            </div>
                            <div style={{ fontSize: 11, color: T.text3 }}>
                              {date} {slot} #{mealIndex + 1} · {meal.servings}인분 · {recipe.minutes}분
                            </div>
                          </div>
                        </div>
                        <div style={{ padding: '0 14px 14px', display: 'flex', gap: 8 }}>
                          <button onClick={() => onOpenMeal?.(date, slot)} style={{
                            flex: 1, padding: '10px 0', borderRadius: 10, border: `1px solid ${T.border}`,
                            background: '#fff', color: T.text2, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                          }}>상세 보기</button>
                          <button onClick={() => onStartCook?.(date, slot, mealIndex)} style={{
                            flex: 2, padding: '10px 0', borderRadius: 10, border: 'none',
                            background: T.mint, color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer',
                          }}>🍳 요리 시작</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Wave 1.7 — P1.3 desktop screens (LEFTOVERS, ATE_LIST, MANUAL_CREATE,
// YT_IMPORT, RECIPE_SEARCH_PICKER, MYPAGE_TAB_* lists)
// ─────────────────────────────────────────────────────────────

// Common back-link helper
function DskBackLink({ onClick, label }) {
  return (
    <button onClick={onClick} style={{
      background: 'none', border: 'none', cursor: 'pointer',
      color: T.text2, fontSize: 13, fontWeight: 600, marginBottom: 14,
      display: 'inline-flex', alignItems: 'center', gap: 6,
    }}>{Icon.chevL(T.text2)} {label}</button>
  );
}

const desktopMealSwitchBtn = {
  padding: '10px 14px', borderRadius: 8, border: `1px solid ${T.border}`,
  background: '#fff', color: T.text2, fontSize: 12, fontWeight: 800,
  cursor: 'pointer', whiteSpace: 'nowrap', minWidth: 86,
};

// Desktop: LEFTOVERS (P1.3)
function DesktopLeftoversScreen({ planner, onBack, onReuse, onGoAteList, onMarkAte, onMarkPartial, showToast }) {
  // 'cooked' 인데 ateAt이 없는 끼니 = "남은 요리"
  const leftovers = [];
  Object.entries(planner).forEach(([date, day]) => {
    ['아침','점심','저녁'].forEach(slot => {
      mealItems(day[slot]).forEach((m, mealIndex) => {
        if (m && m.status === 'cooked' && !m.ateAt) {
          const r = RECIPES.find(x => x.id === m.recipeId);
          if (r) leftovers.push({ date, slot, meal: m, mealIndex, recipe: r });
        }
      });
    });
  });
  return (
    <div>
      <DskBackLink onClick={onBack} label="마이페이지" />
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: T.ink, fontFamily: T.fontBrand }}>남은 요리</div>
          <div style={{ fontSize: 13, color: T.text3, marginTop: 2 }}>다 먹지 않은 식사 {leftovers.length}건. 플래너에 다시 올리거나 다 먹은 것으로 기록하세요.</div>
        </div>
	        <button onClick={onGoAteList} style={desktopMealSwitchBtn}>다먹은 요리</button>
      </div>
      {leftovers.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: 16, padding: 60, textAlign: 'center', boxShadow: T.shadowDeep }}>
          <div style={{ fontSize: 44, marginBottom: 8 }}>🥡</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.text2 }}>남은 요리가 없어요</div>
          <div style={{ fontSize: 12, color: T.text3, marginTop: 4 }}>모든 끼니를 다 드셨거나 아직 요리한 끼니가 없어요</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
          {leftovers.map(({ date, slot, meal, mealIndex, recipe }) => (
            <div key={`${date}-${slot}-${mealIndex}`} style={{
              background: '#fff', borderRadius: 14, overflow: 'hidden',
              border: `1px solid ${T.border}`, boxShadow: T.shadowNatural,
            }}>
              <div style={{ display: 'flex', gap: 12, padding: 14, alignItems: 'center' }}>
                <div style={{
                  width: 64, height: 64, borderRadius: 12, background: recipe.bg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36,
                }}>{recipe.emoji}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: T.ink, marginBottom: 3 }}>{recipe.name}</div>
                  <div style={{ fontSize: 11, color: T.text3 }}>{date} {slot} {meal.servings}인분</div>
                  <div style={{ fontSize: 10, color: T.tealLight, marginTop: 4, fontWeight: 700 }}>🍳 요리 완료, 아직 안 먹음</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, padding: '0 14px 14px' }}>
                <button onClick={() => onReuse?.(date, slot, mealIndex)} style={{
                  flex: 1, padding: '9px 0', borderRadius: 8, border: `1px solid ${T.border}`,
                  background: '#fff', color: T.text2, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                }}>플래너에 추가</button>
                <button onClick={() => onMarkAte?.(date, slot, mealIndex)} style={{
                  flex: 1, padding: '9px 0', borderRadius: 8, border: 'none',
                  background: T.mint, color: '#fff', fontSize: 11, fontWeight: 800, cursor: 'pointer',
                }}>다 먹음</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Desktop: ATE_LIST (P1.3)
function DesktopAteListScreen({ planner, onBack, onGoLeftovers, onUndoAte, onRecreate }) {
  const ateMeals = [];
  Object.entries(planner).forEach(([date, day]) => {
    ['아침','점심','저녁'].forEach(slot => {
      mealItems(day[slot]).forEach((m, mealIndex) => {
        if (m && m.ateAt) {
          const r = RECIPES.find(x => x.id === m.recipeId);
          if (r) ateMeals.push({ date, slot, meal: m, mealIndex, recipe: r });
        }
      });
    });
  });
  return (
    <div>
      <DskBackLink onClick={onBack} label="남은 요리" />
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: T.ink, fontFamily: T.fontBrand }}>다먹은 요리</div>
          <div style={{ fontSize: 13, color: T.text3, marginTop: 2 }}>다 먹은 끼니 {ateMeals.length}건. 잘못 표시했다면 되돌릴 수 있어요.</div>
        </div>
	        <button onClick={onGoLeftovers} style={desktopMealSwitchBtn}>남은 요리</button>
      </div>
      {ateMeals.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: 16, padding: 60, textAlign: 'center', boxShadow: T.shadowDeep }}>
          <div style={{ fontSize: 44, marginBottom: 8 }}>🍽️</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.text2 }}>아직 다먹은 요리가 없어요</div>
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: 14, padding: 8, boxShadow: T.shadowDeep }}>
          {ateMeals.map(({ date, slot, meal, mealIndex, recipe }, i) => (
            <div key={`${date}-${slot}-${mealIndex}`} style={{
              display: 'flex', alignItems: 'center', gap: 14, padding: 14,
              borderBottom: i < ateMeals.length - 1 ? `1px solid ${T.surfaceSubtle}` : 'none',
            }}>
              <div style={{
                width: 48, height: 48, borderRadius: 10, background: recipe.bg,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, flexShrink: 0,
              }}>{recipe.emoji}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>{recipe.name}</div>
	                <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>{date} {slot} {meal.servings}인분</div>
              </div>
              <button onClick={() => onUndoAte?.(date, slot, mealIndex)} style={{
                padding: '8px 12px', borderRadius: 8, border: `1px solid ${T.border}`,
                background: '#fff', color: T.text2, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}>되돌리기</button>
              <button onClick={() => onRecreate?.(recipe.id)} style={{
                padding: '8px 12px', borderRadius: 8, border: 'none',
                background: T.mint, color: '#fff', fontSize: 12, fontWeight: 800, cursor: 'pointer',
              }}>다시 만들기</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Desktop: MANUAL_RECIPE_CREATE (P1.3)
function DesktopManualRecipeCreateScreen({ presetDate, presetSlot, onBack, onCreated, showToast }) {
  const [name, setName]         = dUseState('');
  const [emoji, setEmoji]       = dUseState('🍽️');
  const [minutes, setMinutes]   = dUseState(20);
  const [servings, setServings] = dUseState(2);
  const [ingredients, setIngredients] = dUseState([]);
  const [steps, setSteps]       = dUseState(['']);
  const [ingModal, setIngModal] = dUseState(false);
  const ingredientsComplete = ingredients.length > 0 && ingredients.every(i => i.name && String(i.amount || '').trim());
  const stepsComplete = steps.length > 0 && steps.every(s => s.trim());
  const valid = name.trim().length > 0 && ingredientsComplete && stepsComplete;
  const slotLabel = presetDate && presetSlot ? `${presetDate} ${presetSlot}` : '플래너 미선택';
  const warnNumericOnly = () => showToast?.('재료 수량은 숫자만 입력할 수 있어요');
  const blockNonNumericInput = (e) => {
    const text = e.data ?? e.clipboardData?.getData('text') ?? '';
    if (text && /[^0-9]/.test(text)) {
      e.preventDefault();
      warnNumericOnly();
    }
  };
  const setIngredientAmount = (idx, value) => {
    if (/[^0-9]/.test(value)) warnNumericOnly();
    const amount = value.replace(/[^0-9]/g, '');
    setIngredients(ingredients.map((x, j) => j === idx ? { ...x, amount } : x));
  };
  const submit = () => {
    if (!valid) {
      showToast?.('재료 수량과 조리법 빈칸을 채워주세요');
      return;
    }
    const recipe = {
      id: 'r_user_' + Date.now(), name: name.trim(), emoji, minutes, servings,
      bg: T.mintSoft, rating: 5, saves: 0, kcal: 0,
      ingredients: ingredients.map(i => ({ name: i.name, qty: (i.amount || '') + (i.unit || 'g'), section: i.category || '직접 입력' })),
      steps: steps.filter(s => s.trim()).map(s => ({ text: s.trim(), kind: 'etc' })),
      tags: ['직접 등록'], theme: '집밥', method: 'prep',
    };
    onCreated?.(recipe, presetDate, presetSlot);
    showToast?.('레시피가 등록됐어요');
  };
  return (
    <div>
      <DskBackLink onClick={onBack} label="식사 추가" />
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: T.ink, fontFamily: T.fontBrand }}>직접 레시피 등록</div>
          <div style={{ fontSize: 13, color: T.text3, marginTop: 2 }}>대상: {slotLabel}</div>
        </div>
        <button onClick={submit} disabled={!valid} style={{
          padding: '11px 20px', borderRadius: 10, border: 'none',
          background: valid ? T.mint : T.surfaceFill,
          color: valid ? '#fff' : T.text4,
          fontSize: 13, fontWeight: 800, cursor: valid ? 'pointer' : 'default',
        }}>완료</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 24, alignItems: 'start' }}>
        <main style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Basic info */}
          <div style={{ background: '#fff', borderRadius: 14, padding: 22, boxShadow: T.shadowDeep }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: T.text2, marginBottom: 14 }}>기본 정보</div>
            <DesktopFormRow label="이모지">
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {['🍽️','🍳','🥘','🍲','🍝','🍔','🥗','🍣','🍕','🌮','🍜','🥟'].map(e => (
                  <button key={e} onClick={() => setEmoji(e)} style={{
                    width: 40, height: 40, fontSize: 22, borderRadius: 10,
                    background: emoji === e ? T.mintSoft : T.surfaceFill,
                    border: emoji === e ? `1px solid ${T.mint}` : '1px solid transparent',
                    cursor: 'pointer',
                  }}>{e}</button>
                ))}
              </div>
            </DesktopFormRow>
            <DesktopFormRow label="레시피 이름 *">
              <input value={name} onChange={e => setName(e.target.value)} placeholder="예: 엄마표 김치찌개"
                style={dskInputStyle} />
            </DesktopFormRow>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <DesktopFormRow label="조리시간 (분)">
                <input type="number" min={1} max={300} value={minutes} onChange={e => setMinutes(parseInt(e.target.value)||0)} style={dskInputStyle} />
              </DesktopFormRow>
              <DesktopFormRow label="기준 인분">
                <input type="number" min={1} max={12} value={servings} onChange={e => setServings(parseInt(e.target.value)||1)} style={dskInputStyle} />
              </DesktopFormRow>
            </div>
          </div>

          {/* Ingredients */}
          <div style={{ background: '#fff', borderRadius: 14, padding: 22, boxShadow: T.shadowDeep }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: T.text2 }}>재료 ({ingredients.length})</div>
              <button onClick={() => setIngModal(true)} style={dskAddBtn}>+ 재료 선택</button>
            </div>
            {ingredients.length === 0 ? (
              <button onClick={() => setIngModal(true)} style={{
                width: '100%', padding: 18, borderRadius: 12,
                border: `1.5px dashed ${T.mint}`, background: T.mintSoft,
                color: T.mintDeep, fontSize: 13, fontWeight: 800, cursor: 'pointer',
              }}>재료를 검색해서 여러 개 선택하기</button>
            ) : ingredients.map((it, i) => (
              <div key={it.name} style={{ display: 'grid', gridTemplateColumns: '2fr 90px 104px 32px', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: T.ink }}>{it.name}</div>
                <input type="text" inputMode="numeric" pattern="[0-9]*" value={it.amount || ''}
                  onBeforeInput={blockNonNumericInput}
                  onPaste={blockNonNumericInput}
                  onChange={e => setIngredientAmount(i, e.target.value)}
                  placeholder="양" style={{ ...dskInputStyle, textAlign: 'center' }} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                  {['g', 'ml'].map(unit => (
                    <button key={unit} onClick={() => setIngredients(ingredients.map((x, j) => j === i ? { ...x, unit } : x))} style={{
                      border: `1px solid ${it.unit === unit ? T.mint : T.border}`,
                      background: it.unit === unit ? T.mintSoft : '#fff',
                      color: it.unit === unit ? T.mintDeep : T.text2,
                      borderRadius: 8, padding: '10px 0', fontSize: 12, fontWeight: 800, cursor: 'pointer',
                    }}>{unit}</button>
                  ))}
                </div>
                <button onClick={() => setIngredients(ingredients.filter((_, j) => j !== i))} style={{
                  border: 'none', background: T.surfaceFill, borderRadius: 8, color: T.text3,
                  fontSize: 16, cursor: 'pointer', height: 36,
                }} title="삭제">×</button>
              </div>
            ))}
          </div>

          {/* Steps */}
          <div style={{ background: '#fff', borderRadius: 14, padding: 22, boxShadow: T.shadowDeep }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: T.text2 }}>조리 순서 ({steps.length})</div>
              <button onClick={() => setSteps([...steps, ''])} style={dskAddBtn}>+ 단계 추가</button>
            </div>
            {steps.map((s, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '36px 1fr 32px', gap: 8, marginBottom: 8, alignItems: 'flex-start' }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 16, background: T.mintSoft, color: T.mintDeep,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800,
                }}>{i+1}</div>
                <textarea value={s} onChange={e => { const n = [...steps]; n[i] = e.target.value; setSteps(n); }}
                  placeholder="조리 과정 설명"
                  rows={2}
                  style={{ ...dskInputStyle, resize: 'vertical', fontFamily: T.fontUI }} />
                <button onClick={() => setSteps(steps.filter((_, j) => j !== i))} style={{
                  border: 'none', background: T.surfaceFill, borderRadius: 8, color: T.text3,
                  fontSize: 16, cursor: 'pointer', height: 32,
                }} title="삭제">×</button>
              </div>
            ))}
          </div>
        </main>

        <aside style={{ background: '#fff', borderRadius: 14, padding: 22, boxShadow: T.shadowDeep, position: 'sticky', top: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: T.text2, marginBottom: 12 }}>미리보기</div>
          <div style={{
            aspectRatio: '4/3', background: T.mintSoft, borderRadius: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 80, marginBottom: 12,
          }}>{emoji}</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: T.ink, marginBottom: 4 }}>
            {name || '레시피 이름'}
          </div>
          <div style={{ fontSize: 11, color: T.text3, marginBottom: 14 }}>
            {minutes}분 · {servings}인분 · 직접 등록
          </div>
          <div style={{ fontSize: 11, color: T.text3, lineHeight: 1.6 }}>
            ⓘ 등록 후 자동으로 {presetDate && presetSlot ? `${presetDate} ${presetSlot}에 추가` : '레시피 상세로 이동'}돼요.
          </div>
        </aside>
      </div>
      {ingModal && <IngredientPickerModal
        selected={ingredients}
        onConfirm={(picked) => { setIngredients(picked); setIngModal(false); }}
        onClose={() => setIngModal(false)} />}
    </div>
  );
}
function DesktopFormRow({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.text2, marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}
const dskInputStyle = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  border: `1px solid ${T.border}`, background: '#fff', color: T.ink,
  fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
};
const dskAddBtn = {
  padding: '6px 12px', borderRadius: 8, border: `1px dashed ${T.border}`,
  background: '#fff', color: T.mintDeep, fontSize: 11, fontWeight: 700, cursor: 'pointer',
};

// Desktop: YT_IMPORT (P1.3)
function DesktopYtImportScreen({ presetDate, presetSlot, onBack, onCreated, showToast }) {
  const [url, setUrl]   = dUseState('');
  const [loading, setL] = dUseState(false);
  const [parsed, setParsed] = dUseState(null);
  const slotLabel = presetDate && presetSlot ? `${presetDate} ${presetSlot}` : '플래너 미선택';
  const fakeImport = () => {
    if (!url) return;
    setL(true);
    setTimeout(() => {
      setParsed({
        title: '백종원 김치찌개 (자동 추출)',
        emoji: '🍲',
        channel: 'PaikJongWon Lab',
        ingredients: [
          { name: '김치', qty: '300g' }, { name: '돼지고기', qty: '200g' },
          { name: '두부', qty: '1모' }, { name: '대파', qty: '1대' },
          { name: '간장', qty: '1큰술' }, { name: '설탕', qty: '1작은술' },
        ],
        steps: ['냄비에 김치를 볶는다', '돼지고기 추가', '물 붓고 끓인다', '두부·대파 추가 후 마무리'],
      });
      setL(false);
    }, 800);
  };
  const confirm = () => {
    if (!parsed) return;
    onCreated?.({
      id: 'r_yt_' + Date.now(),
      name: parsed.title, emoji: parsed.emoji,
      minutes: 25, servings: 4, bg: '#FFE4B5',
      rating: 4.6, saves: 0, kcal: 0,
      ingredients: parsed.ingredients,
      steps: parsed.steps.map(s => ({ text: s, kind: 'etc' })),
      tags: ['유튜브 가져오기'], theme: '집밥', method: 'prep',
    }, presetDate, presetSlot);
    showToast?.('유튜브 레시피가 등록됐어요');
  };
  return (
    <div>
      <DskBackLink onClick={onBack} label="식사 추가" />
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: T.ink, fontFamily: T.fontBrand }}>유튜브에서 가져오기</div>
        <div style={{ fontSize: 13, color: T.text3, marginTop: 2 }}>대상: {slotLabel} · URL을 붙여넣으면 재료·조리법을 자동 추출해요 (베타)</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' }}>
        <main style={{ background: '#fff', borderRadius: 14, padding: 22, boxShadow: T.shadowDeep }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: T.text2, marginBottom: 12 }}>YouTube URL</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://youtube.com/..."
              style={{ ...dskInputStyle, flex: 1 }} />
            <button onClick={fakeImport} disabled={!url || loading} style={{
              padding: '10px 18px', borderRadius: 8, border: 'none',
              background: url && !loading ? T.mint : T.surfaceFill,
              color: url && !loading ? '#fff' : T.text4,
              fontSize: 13, fontWeight: 800, cursor: url && !loading ? 'pointer' : 'default',
            }}>{loading ? '추출 중…' : '가져오기'}</button>
          </div>
          <div style={{
            fontSize: 11, color: T.text3, lineHeight: 1.6,
            padding: 12, background: T.surfaceFill, borderRadius: 8,
          }}>
            ⓘ 이 데모는 자동 추출 결과를 시뮬레이션합니다. 실제 환경에서는 영상 자막·설명을 분석해요.
          </div>
        </main>
        <aside style={{ background: '#fff', borderRadius: 14, padding: 22, boxShadow: T.shadowDeep, minHeight: 360 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: T.text2, marginBottom: 12 }}>추출 결과</div>
          {!parsed ? (
            <div style={{ padding: 40, textAlign: 'center', color: T.text3, fontSize: 12 }}>
              URL을 입력하고 ‘가져오기’를 눌러주세요
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 14 }}>
                <div style={{ fontSize: 56 }}>{parsed.emoji}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: T.ink, marginBottom: 2 }}>{parsed.title}</div>
                  <div style={{ fontSize: 11, color: T.text3 }}>{parsed.channel}</div>
                </div>
              </div>
              <div style={{ fontSize: 11, fontWeight: 800, color: T.text2, marginTop: 14, marginBottom: 6 }}>재료 ({parsed.ingredients.length})</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
                {parsed.ingredients.map(ing => (
                  <span key={ing.name} style={{
                    fontSize: 11, color: T.text2, background: T.surfaceFill,
                    padding: '4px 10px', borderRadius: 9999,
                  }}>{ing.name} {ing.qty}</span>
                ))}
              </div>
              <div style={{ fontSize: 11, fontWeight: 800, color: T.text2, marginBottom: 6 }}>조리 단계 ({parsed.steps.length})</div>
              <ol style={{ paddingLeft: 18, margin: 0, fontSize: 12, color: T.text2, lineHeight: 1.7 }}>
                {parsed.steps.map((s, i) => <li key={i}>{s}</li>)}
              </ol>
              <button onClick={confirm} style={{
                width: '100%', marginTop: 16, padding: '12px 0', borderRadius: 10, border: 'none',
                background: T.mint, color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer',
              }}>등록 + 플래너 추가</button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

// Desktop: RECIPE_SEARCH_PICKER 단독 (P1.3)
function DesktopRecipeSearchPicker({ title='레시피 검색', slotLabel, onBack, onPick }) {
  const [query, setQuery] = dUseState('');
  const filtered = dUseMemo(() => {
    if (!query) return RECIPES;
    return RECIPES.filter(r => r.name.includes(query) || r.tags.some(t => t.includes(query)));
  }, [query]);
  return (
    <div>
      <DskBackLink onClick={onBack} label="돌아가기" />
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: T.ink, fontFamily: T.fontBrand }}>{title}</div>
        {slotLabel && <div style={{ fontSize: 13, color: T.text3, marginTop: 2 }}>대상: {slotLabel}</div>}
      </div>
      <div style={{ background: '#fff', borderRadius: 12, padding: '0 16px', height: 48, display: 'flex', alignItems: 'center', gap: 8, boxShadow: T.shadowNatural, marginBottom: 18 }}>
        {Icon.search()}
        <input value={query} onChange={e => setQuery(e.target.value)} autoFocus
          placeholder="레시피·태그 검색"
          style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none', fontSize: 14, color: T.ink, fontFamily: 'inherit' }} />
        {query && <button onClick={() => setQuery('')} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: T.text3, fontSize: 18 }}>×</button>}
      </div>
      {filtered.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: 16, padding: 60, textAlign: 'center', boxShadow: T.shadowDeep }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🔍</div>
          <div style={{ fontSize: 13, color: T.text3 }}>검색 결과가 없어요</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14 }}>
          {filtered.map(r => (
            <div key={r.id} onClick={() => onPick?.(r.id)} style={{
              background: '#fff', borderRadius: 12, overflow: 'hidden',
              border: `1px solid ${T.border}`, cursor: 'pointer',
            }}>
              <div style={{ aspectRatio: '4/3', background: r.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 44 }}>{r.emoji}</div>
              <div style={{ padding: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.ink, marginBottom: 2 }}>{r.name}</div>
                <div style={{ fontSize: 10, color: T.text3 }}>조회 {formatMetricCount(recipeViewCount(r))} · {r.minutes}분</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Desktop: MYPAGE_TAB_RECIPEBOOK 목록 (P1.3)
function DesktopMyPageRecipebookList({ onBack, onOpenBook, onCreateBook, onDeleteBook, showToast }) {
  const [confirmId, setConfirmId] = dUseState(null);
  const [menuId, setMenuId] = dUseState(null);
  const books = window.RECIPEBOOK_SAMPLES || [];
  return (
    <div>
      <DskBackLink onClick={onBack} label="마이페이지" />
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: T.ink, fontFamily: T.fontBrand }}>레시피북</div>
          <div style={{ fontSize: 13, color: T.text3, marginTop: 2 }}>모은 레시피를 책으로 정리해요 · {books.length}권</div>
        </div>
        <button onClick={onCreateBook} style={{
          padding: '11px 18px', borderRadius: 10, border: 'none',
          background: T.mint, color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer',
        }}>+ 새 레시피북</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
        {books.map(b => (
          <div key={b.id} style={{
            background: '#fff', borderRadius: 14, padding: 18,
            border: `1px solid ${T.border}`, boxShadow: T.shadowNatural, position: 'relative',
          }}>
            {b.kind === 'custom' && (
              <button onClick={() => setMenuId(menuId === b.id ? null : b.id)} style={{
                position: 'absolute', top: 14, right: 14,
                background: 'none', border: 'none', cursor: 'pointer',
                color: T.text4, fontSize: 18, padding: 4,
              }}>⋯</button>
            )}
            {menuId === b.id && (
              <div style={{
                position: 'absolute', top: 48, right: 14, zIndex: 20,
                background: '#fff', border: `1px solid ${T.border}`, borderRadius: 10,
                boxShadow: T.shadowDeep, overflow: 'hidden', minWidth: 128,
              }}>
                <button onClick={() => { setMenuId(null); showToast?.('이름 변경은 다음 Wave에서 제공돼요'); }} style={{
                  width: '100%', background: '#fff', border: 'none', padding: '10px 12px',
                  textAlign: 'left', fontSize: 13, fontWeight: 700, color: T.ink, cursor: 'pointer',
                }}>이름 변경</button>
                <button onClick={() => { setMenuId(null); setConfirmId(b.id); }} style={{
                  width: '100%', background: '#fff', border: 'none', borderTop: `1px solid ${T.surfaceSubtle}`,
                  padding: '10px 12px', textAlign: 'left', fontSize: 13, fontWeight: 700, color: T.red, cursor: 'pointer',
                }}>삭제</button>
              </div>
            )}
            <div onClick={() => onOpenBook?.(b.id)} style={{ cursor: 'pointer' }}>
              <div style={{
                width: 64, height: 64, borderRadius: 14, background: T.mintSoft,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, marginBottom: 14,
              }}>{b.emoji}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 15, fontWeight: 800, color: T.ink }}>{b.name}</span>
                <span style={{
                  fontSize: 10, color: T.mintDeep, background: T.mintSoft,
                  padding: '2px 6px', borderRadius: 4, fontWeight: 700,
                }}>{b.recipeIds.length}개 레시피</span>
              </div>
              <div style={{ fontSize: 11, color: T.text3 }}>{b.kind === 'saved' ? '저장' : '내 책'}</div>
            </div>
          </div>
        ))}
      </div>
      {confirmId && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9500 }}>
          <ConfirmDialog title="레시피북을 삭제할까요?"
            body="레시피북 안의 레시피는 삭제되지 않아요."
            destructive confirmLabel="삭제하기"
            onClose={() => setConfirmId(null)}
            onConfirm={() => { onDeleteBook?.(confirmId); setConfirmId(null); showToast?.('레시피북이 삭제됐어요'); }} />
        </div>
      )}
    </div>
  );
}

// Desktop: MYPAGE_TAB_SHOPPINGLISTS (P1.3)
function DesktopMyPageShoppingList({ shoppingLists = [], onBack, onOpen }) {
  const active = shoppingLists.filter(l => l.status !== 'completed');
  const done   = shoppingLists.filter(l => l.status === 'completed');
  return (
    <div>
      <DskBackLink onClick={onBack} label="마이페이지" />
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: T.ink, fontFamily: T.fontBrand }}>장보기 기록</div>
        <div style={{ fontSize: 13, color: T.text3, marginTop: 2 }}>진행 중 {active.length}건 · 완료 {done.length}건</div>
      </div>
      {[['진행 중', active], ['완료', done]].map(([label, list]) => (
        list.length === 0 ? null : (
          <section key={label} style={{ marginBottom: 22 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: T.text2, marginBottom: 10 }}>{label} ({list.length})</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
              {list.map(l => (
                <button key={l.id} onClick={() => onOpen?.(l.id)} style={{
                  textAlign: 'left', cursor: 'pointer',
                  background: '#fff', border: `1px solid ${T.border}`, borderRadius: 14, padding: 16,
                  boxShadow: T.shadowNatural,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: 10,
                      background: l.status === 'completed' ? T.mintSoft : T.surfaceFill,
                      color: l.status === 'completed' ? T.mintDeep : T.text2,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
                    }}>{l.status === 'completed' ? '✓' : '🛒'}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: T.ink }}>{l.name}</div>
                      <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>
                        {l.items.length}개 재료 · {l.status === 'completed' ? '완료' : '진행 중'}
                      </div>
                    </div>
                  </div>
                  <div style={{
                    fontSize: 11, color: T.text3, lineHeight: 1.6,
                    background: T.surfaceFill, borderRadius: 8, padding: 8,
                  }}>
                    {l.items.slice(0, 4).map(i => i.name).join(' · ')}{l.items.length > 4 ? ` 외 ${l.items.length - 4}개` : ''}
                  </div>
                </button>
              ))}
            </div>
          </section>
        )
      ))}
      {shoppingLists.length === 0 && (
        <div style={{ background: '#fff', borderRadius: 16, padding: 60, textAlign: 'center', boxShadow: T.shadowDeep }}>
          <div style={{ fontSize: 44, marginBottom: 8 }}>🛒</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.text2 }}>아직 장보기 기록이 없어요</div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Wave 1.8 — P2 desktop modal/picker variants (centered dialogs)
// ─────────────────────────────────────────────────────────────

function DskOverlay({ children, onClose, width = 480 }) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9500, padding: 24,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 16, width, maxHeight: '88vh',
        display: 'flex', flexDirection: 'column', boxShadow: T.shadowCrisp, overflow: 'hidden',
      }}>
        {children}
      </div>
    </div>
  );
}
function DskDialogHeader({ title, sub, onClose }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
      padding: '18px 22px 14px', borderBottom: `1px solid ${T.border}`,
    }}>
      <div>
        <div style={{ fontSize: 17, fontWeight: 800, color: T.ink, fontFamily: T.fontBrand }}>{title}</div>
        {sub && <div style={{ fontSize: 12, color: T.text3, marginTop: 3 }}>{sub}</div>}
      </div>
      <button onClick={onClose} style={{
        width: 30, height: 30, borderRadius: 15, background: T.surfaceFill, border: 'none', cursor: 'pointer', fontSize: 16, color: T.text2,
      }}>✕</button>
    </div>
  );
}
function DskDialogFooter({ children }) {
  return (
    <div style={{
      display: 'flex', gap: 8, justifyContent: 'flex-end',
      padding: '14px 22px', borderTop: `1px solid ${T.border}`, background: '#fff',
    }}>{children}</div>
  );
}

// P2 — PantryAdd
function DesktopPantryAddDialog({ pantry, onClose, onAddItem, onOpenBundle }) {
  const [query, setQuery] = dUseState('');
  const [activeCat, setActiveCat] = dUseState('전체');
  const [picked, setPicked] = dUseState(new Set());
  const ownedNames = new Set(Object.values(pantry || {}).filter(item => item.have).map(item => item.name));
  const categories = ['전체', ...PANTRY_CATEGORIES];
  const filtered = PANTRY_ADD_ITEMS.filter(item => {
    if (activeCat !== '전체' && item.section !== activeCat) return false;
    if (query.trim() && !item.name.includes(query.trim())) return false;
    return true;
  });
  const togglePick = (name) => setPicked(prev => {
    if (ownedNames.has(name)) return prev;
    const next = new Set(prev);
    next.has(name) ? next.delete(name) : next.add(name);
    return next;
  });
  const pickedItems = PANTRY_ADD_ITEMS.filter(item => picked.has(item.name));
  return (
    <DskOverlay onClose={onClose} width={620}>
      <DskDialogHeader title="재료 추가" onClose={onClose} />
      <div style={{ padding: '18px 22px', overflowY: 'auto' }}>
        <input value={query} onChange={e => setQuery(e.target.value)} autoFocus
          placeholder="재료 검색" style={{ ...dskInputStyle, background: T.surfaceFill, marginBottom: 10 }} />
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginBottom: 16 }}>
          {categories.map(cat => (
            <button key={cat} onClick={() => setActiveCat(cat)} style={{
              flexShrink: 0, padding: '8px 14px', borderRadius: 9999,
              border: activeCat === cat ? `1.5px solid ${T.mint}` : `1px solid ${T.border}`,
              background: activeCat === cat ? T.mintSoft : '#fff',
              color: activeCat === cat ? T.mintDeep : T.text2,
              fontSize: 12, fontWeight: 800, cursor: 'pointer',
            }}>{cat}</button>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {filtered.map(item => {
            const on = picked.has(item.name);
            const owned = ownedNames.has(item.name);
            return (
              <button key={item.name} disabled={owned} onClick={() => togglePick(item.name)} style={{
                display: 'flex', alignItems: 'center', gap: 8, minHeight: 54,
                padding: '10px 12px', borderRadius: 12,
                border: on ? `1.5px solid ${T.mint}` : `1px solid ${T.border}`,
                background: owned ? T.surfaceFill : on ? T.mintSoft : '#fff',
                cursor: owned ? 'not-allowed' : 'pointer', opacity: owned ? 0.55 : 1,
                textAlign: 'left',
              }}>
                <span style={{ width: 30, height: 30, borderRadius: 10, background: T.surfaceFill,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>{item.image}</span>
                <span style={{ flex: 1, fontSize: 13, color: T.ink, fontWeight: 800 }}>{item.name}</span>
                {owned && <span style={{ fontSize: 10, color: T.text3, fontWeight: 800 }}>보유중</span>}
                {on && Icon.check(T.mintDeep, 16)}
              </button>
            );
          })}
        </div>
        {filtered.length === 0 && (
          <div style={{ padding: 34, textAlign: 'center', color: T.text3, fontSize: 13 }}>검색 결과가 없어요</div>
        )}
        <button onClick={onOpenBundle} style={{
          marginTop: 14, width: '100%', borderRadius: 10, border: `1px solid ${T.border}`,
          background: '#fff', color: T.text2, padding: '11px 14px',
          fontSize: 13, fontWeight: 800, cursor: 'pointer',
        }}>묶음 추가</button>
      </div>
      <DskDialogFooter>
        <button onClick={onClose} style={dskGhostBtn}>취소</button>
        <button disabled={picked.size === 0} onClick={() => onAddItem?.(pickedItems)} style={{
          ...dskPrimaryBtn, opacity: picked.size ? 1 : 0.5, cursor: picked.size ? 'pointer' : 'default',
        }}>{picked.size > 0 ? `${picked.size}개 추가` : '재료 선택'}</button>
      </DskDialogFooter>
    </DskOverlay>
  );
}

// P2 — PantryBundle
function DesktopPantryBundleDialog({ onClose, onConfirm }) {
  const bundles = [
    { id: 'kor_basic', name: '한식 기본 양념', emoji: '🧂', items: ['간장','된장','고추장','참기름','다진마늘','설탕'] },
    { id: 'kimchi_jjigae', name: '김치찌개 재료', emoji: '🥘', items: ['김치','돼지고기','두부','대파','양파'] },
    { id: 'pasta_basic', name: '파스타 기본', emoji: '🍝', items: ['스파게티','올리브유','마늘','파마산','페퍼론치노'] },
    { id: 'salad_basic', name: '샐러드 기본', emoji: '🥗', items: ['양상추','방울토마토','오이','드레싱','계란'] },
  ];
  const [selectedId, setSelectedId] = dUseState(null);
  const [picked, setPicked] = dUseState(new Set());
  const bundle = bundles.find(b => b.id === selectedId);
  const togglePick = (n) => setPicked(p => { const x = new Set(p); x.has(n) ? x.delete(n) : x.add(n); return x; });
  return (
    <DskOverlay onClose={onClose} width={560}>
      <DskDialogHeader
        title={bundle ? bundle.name : '재료 묶음 선택'}
        sub={bundle ? '추가할 항목을 골라주세요' : '자주 함께 쓰는 재료를 한 번에 추가해요'}
        onClose={onClose} />
      {bundle && (
        <div style={{ padding: '10px 22px 0' }}>
          <button onClick={() => { setSelectedId(null); setPicked(new Set()); }} style={dskGhostBtn}>← 묶음 다시 고르기</button>
        </div>
      )}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 22px 18px' }}>
        {!bundle ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {bundles.map(b => (
              <button key={b.id} onClick={() => { setSelectedId(b.id); setPicked(new Set(b.items)); }} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                background: '#fff', border: `1px solid ${T.border}`, borderRadius: 12,
                padding: '12px 14px', cursor: 'pointer', textAlign: 'left',
              }}>
                <span style={{ fontSize: 26 }}>{b.emoji}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: T.ink }}>{b.name}</div>
                  <div style={{ fontSize: 10, color: T.text3, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {b.items.join(', ')}
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {bundle.items.map(it => {
              const on = picked.has(it);
              return (
                <button key={it} onClick={() => togglePick(it)} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  background: on ? T.mintSoft : '#fff', border: `1px solid ${on ? T.mint : T.border}`, borderRadius: 10,
                  padding: '10px 12px', cursor: 'pointer', textAlign: 'left',
                }}>
                  <div style={{
                    width: 18, height: 18, borderRadius: 5,
                    background: on ? T.mint : '#fff', border: `1.5px solid ${on ? T.mint : T.border}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 800,
                  }}>{on ? '✓' : ''}</div>
                  <span style={{ fontSize: 13, color: T.ink, fontWeight: 700 }}>{it}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      <DskDialogFooter>
        <button onClick={onClose} style={dskGhostBtn}>취소</button>
        {bundle && (
          <button disabled={picked.size === 0} onClick={() => onConfirm?.([...picked])} style={{
            ...dskPrimaryBtn, opacity: picked.size === 0 ? 0.5 : 1, cursor: picked.size === 0 ? 'default' : 'pointer',
          }}>{picked.size}개 추가</button>
        )}
      </DskDialogFooter>
    </DskOverlay>
  );
}

// P2 — PantryReflect
function DesktopPantryReflectDialog({ list, onClose, onConfirm }) {
  const buyable = (list?.items || []).filter(i => !i.have);
  const [picked, setPicked] = dUseState(new Set(buyable.filter(i => i.checked).map(i => i.name)));
  const toggle = (n) => setPicked(p => { const x = new Set(p); x.has(n) ? x.delete(n) : x.add(n); return x; });
  return (
    <DskOverlay onClose={onClose} width={520}>
      <DskDialogHeader
        title="팬트리에 반영할까요?"
        sub={`'${list?.name || '장보기'}'에서 산 재료를 팬트리 보유로 표시해요`}
        onClose={onClose} />
      <div style={{ padding: '14px 22px', overflowY: 'auto', flex: 1 }}>
        {buyable.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: T.text3, fontSize: 12 }}>
            반영할 재료가 없어요
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {buyable.map(it => {
              const on = picked.has(it.name);
              return (
                <button key={it.name} onClick={() => toggle(it.name)} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10,
                  background: on ? T.mintSoft : T.surfaceFill, border: 'none', cursor: 'pointer', textAlign: 'left',
                }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: 5,
                    background: on ? T.mint : '#fff', border: `1.5px solid ${on ? T.mint : T.border}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 800,
                  }}>{on ? '✓' : ''}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{it.name}</div>
                    <div style={{ fontSize: 10, color: T.text3 }}>{it.qty} · {it.section}</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
      <DskDialogFooter>
        <button onClick={() => onConfirm?.([])} style={dskGhostBtn}>건너뛰기</button>
        <button onClick={() => onConfirm?.([...picked])} style={dskPrimaryBtn}>
          {picked.size}개 반영
        </button>
      </DskDialogFooter>
    </DskOverlay>
  );
}

// P2 — ConsumedIngredient
function DesktopConsumedIngredientDialog({ recipe, defaultSelection, onClose, onConfirm }) {
  const [picked, setPicked] = dUseState(new Set(defaultSelection || (recipe?.ingredients || []).map(i => i.name)));
  const toggle = (n) => setPicked(p => { const x = new Set(p); x.has(n) ? x.delete(n) : x.add(n); return x; });
  if (!recipe) return null;
  return (
    <DskOverlay onClose={onClose} width={540}>
      <DskDialogHeader
        title="소진된 재료를 확인해주세요"
        sub={`체크된 재료는 팬트리에서 자동으로 빠져요 · ${recipe.name}`}
        onClose={onClose} />
      <div style={{ padding: '14px 22px', overflowY: 'auto', flex: 1 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {(recipe.ingredients || []).map(it => {
            const on = picked.has(it.name);
            return (
              <button key={it.name} onClick={() => toggle(it.name)} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10,
                background: on ? T.mintSoft : T.surfaceFill, border: 'none', cursor: 'pointer', textAlign: 'left',
              }}>
                <div style={{
                  width: 18, height: 18, borderRadius: 5,
                  background: on ? T.mint : '#fff', border: `1.5px solid ${on ? T.mint : T.border}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 800,
                }}>{on ? '✓' : ''}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{it.name}</div>
                  <div style={{ fontSize: 10, color: T.text3 }}>{it.qty}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
      <DskDialogFooter>
        <button onClick={() => onConfirm?.([])} style={dskGhostBtn}>건너뛰기</button>
        <button onClick={() => onConfirm?.([...picked])} style={dskPrimaryBtn}>
          요리 완료 ({picked.size}개 차감)
        </button>
      </DskDialogFooter>
    </DskOverlay>
  );
}

// P2 — RecipeBookSelector
function DesktopRecipeBookSelectorDialog({ slotLabel, onClose, onPick }) {
  const books = window.RECIPEBOOK_SAMPLES || [];
  return (
    <DskOverlay onClose={onClose} width={540}>
      <DskDialogHeader
        title="레시피북 고르기"
        sub={slotLabel ? `대상: ${slotLabel}` : '책을 선택하면 안의 레시피로 이동해요'}
        onClose={onClose} />
      <div style={{ padding: '14px 22px', overflowY: 'auto', flex: 1 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {books.map(b => (
            <button key={b.id} onClick={() => onPick?.(b.id)} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              background: '#fff', border: `1px solid ${T.border}`, borderRadius: 12,
              padding: '12px 14px', cursor: 'pointer', textAlign: 'left',
            }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: T.mintSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>{b.emoji}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: T.ink, marginBottom: 3 }}>{b.name}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: T.mintDeep }}>{b.recipeIds.length}개 레시피</span>
                  <span style={{ fontSize: 11, color: T.text3 }}>{b.kind === 'saved' ? '저장' : '내 책'}</span>
                </div>
              </div>
              {Icon.chevR(T.text4)}
            </button>
          ))}
        </div>
      </div>
      <DskDialogFooter>
        <button onClick={onClose} style={dskGhostBtn}>닫기</button>
      </DskDialogFooter>
    </DskOverlay>
  );
}

// P2 — RecipeBookDetailPicker (책 안 레시피 선택)
function DesktopRecipeBookDetailPickerDialog({ bookId, slotLabel, onClose, onPick }) {
  const book = (window.RECIPEBOOK_SAMPLES || []).find(b => b.id === bookId);
  const recipes = book ? book.recipeIds.map(id => RECIPES.find(r => r.id === id)).filter(Boolean) : [];
  return (
    <DskOverlay onClose={onClose} width={620}>
      <DskDialogHeader
        title={book ? book.name + ' · 레시피 고르기' : '레시피북'}
        sub={slotLabel ? `대상: ${slotLabel}` : '클릭하면 해당 레시피로 식사 추가'}
        onClose={onClose} />
      <div style={{ padding: '14px 22px', overflowY: 'auto', flex: 1 }}>
        {recipes.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: T.text3, fontSize: 12 }}>
            레시피북에 레시피가 없어요
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
            {recipes.map(r => (
              <button key={r.id} onClick={() => onPick?.(r.id)} style={{
                background: '#fff', border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden',
                cursor: 'pointer', textAlign: 'left', padding: 0,
              }}>
                <div style={{ aspectRatio: '4/3', background: r.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40 }}>{r.emoji}</div>
                <div style={{ padding: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.ink }}>{r.name}</div>
                  <div style={{ fontSize: 10, color: T.text3, marginTop: 2 }}>조회 {formatMetricCount(recipeViewCount(r))} · {r.minutes}분</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      <DskDialogFooter>
        <button onClick={onClose} style={dskGhostBtn}>닫기</button>
      </DskDialogFooter>
    </DskOverlay>
  );
}

// P2 — PantryMatchPicker
function DesktopPantryMatchPickerDialog({ pantry, slotLabel, onClose, onPick }) {
  const haveSet = new Set(Object.values(pantry || {}).filter(v => v.have).map(v => v.name));
  const ranked = dUseMemo(() => RECIPES.map(r => {
    const need = r.ingredients.length || 1;
    const matched = r.ingredients.filter(i => haveSet.has(i.name)).length;
    return { r, score: Math.round((matched / need) * 100), matched, need };
  }).sort((a, b) => b.score - a.score), [haveSet]);
  return (
    <DskOverlay onClose={onClose} width={620}>
      <DskDialogHeader
        title="팬트리 매칭"
        sub={slotLabel ? `대상: ${slotLabel} · 보유 재료가 많이 일치하는 순서` : '보유 재료가 많이 일치하는 순서'}
        onClose={onClose} />
      <div style={{ padding: '14px 22px', overflowY: 'auto', flex: 1 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
          {ranked.slice(0, 9).map(({ r, score, matched, need }) => (
            <button key={r.id} onClick={() => onPick?.(r.id)} style={{
              background: '#fff', border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden',
              position: 'relative', cursor: 'pointer', textAlign: 'left', padding: 0,
            }}>
              <div style={{ aspectRatio: '4/3', background: r.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 44 }}>{r.emoji}</div>
              <div style={{ padding: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{r.name}</div>
                <MatchProgressBar score={score} sub={`${matched}/${need}개 보유 · ${r.minutes}분`} compact style={{ marginTop: 8 }} />
              </div>
            </button>
          ))}
        </div>
      </div>
      <DskDialogFooter>
        <button onClick={onClose} style={dskGhostBtn}>닫기</button>
      </DskDialogFooter>
    </DskOverlay>
  );
}

const dskGhostBtn = {
  padding: '10px 16px', borderRadius: 8, border: `1px solid ${T.border}`,
  background: '#fff', color: T.text2, fontSize: 13, fontWeight: 700, cursor: 'pointer',
  whiteSpace: 'nowrap',
};
const dskPrimaryBtn = {
  padding: '10px 18px', borderRadius: 8, border: 'none',
  background: T.mint, color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer',
};

Object.assign(window, {
  DesktopHome, DesktopPlanner, DesktopRecipeDetail, DesktopPantry, DesktopMyPage,
  // Wave 1.5 desktop variants
  DesktopMyPageRecipebookDetail, DesktopIngredientFilterDialog,
  DesktopMenuAddScreen, DesktopShoppingCreateScreen, DesktopShoppingDetailScreen, DesktopCookRunScreen,
  // Wave 1.6 desktop variants
  DesktopLoginScreen, DesktopSettingsScreen, DesktopMealDetailScreen, DesktopCookListScreen,
  // Wave 1.7 desktop variants (P1.3)
  DesktopLeftoversScreen, DesktopAteListScreen, DesktopManualRecipeCreateScreen, DesktopYtImportScreen,
  DesktopRecipeSearchPicker, DesktopMyPageRecipebookList, DesktopMyPageShoppingList,
  // Wave 1.8 desktop modals (P2)
  DesktopPantryAddDialog, DesktopPantryBundleDialog, DesktopPantryReflectDialog,
  DesktopConsumedIngredientDialog, DesktopRecipeBookSelectorDialog,
  DesktopRecipeBookDetailPickerDialog, DesktopPantryMatchPickerDialog,
});
