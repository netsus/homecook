// ===== screens/planner.jsx =====
// vNext S4 — Planner screen: week nav, emoji 제거, 상태 배지 제거, 요리하기 버튼 제거, 식사추가 모달
const { useState: useState_P } = React;

// vNext S4 — 식사 추가 옵션 모달 (모바일)
function MealAddModal({ date, slot, planner, pantry, onClose, onMenuAdd, onGoManual, onGoYtImport, onGoLeftovers, onPickRecipe, showToast }) {
  const [query, setQuery] = useState_P('');
  const [mode, setMode] = useState_P('hub');
  const [bookId, setBookId] = useState_P(null);
  const [ytUrl, setYtUrl] = useState_P('');
  const options = [
    { id: 'recipebook', label: '레시피북에서 추가', icon: '📖' },
    { id: 'pantry',     label: '팬트리 기반 추천',  icon: '🧊' },
    { id: 'leftover',   label: '남은요리에서 추가',  icon: '🍱' },
    { id: 'youtube',    label: '유튜브에서 가져오기', icon: '🎬' },
    { id: 'manual',     label: '직접 등록',          icon: '✏️' },
  ];
  const close = () => {
    setMode('hub');
    setBookId(null);
    onClose();
  };
  const pickRecipe = (recipeId) => {
    close();
    if (onPickRecipe) onPickRecipe(date, slot, recipeId);
    else onMenuAdd(date, slot, 'search');
  };
  const books = window.RECIPEBOOK_SAMPLES || [
    { id: 'b_saved', kind: 'saved', name: '저장한 레시피', emoji: '🔖', recipeIds: ['r1','r2','r4'] },
    { id: 'b_custom1', kind: 'custom', name: '평일 저녁 빠른요리', emoji: '🍳', recipeIds: ['r1','r3','r4'] },
    { id: 'b_custom2', kind: 'custom', name: '주말 한 상 차림', emoji: '🍽️', recipeIds: ['r2'] },
  ];
  const selectedBook = books.find(b => b.id === bookId);
  const haveSet = new Set(Object.values(pantry || {}).filter(p => p.have).map(p => p.name));
  const pantryMatches = RECIPES.map(r => {
    const total = (r.ingredients || []).length || 1;
    const hit = (r.ingredients || []).filter(i => haveSet.has(i.name)).length;
    return { recipe: r, hit, total, score: Math.round(hit / total * 100) };
  }).sort((a, b) => b.score - a.score);
  const leftoverMeals = [];
  Object.keys(planner || {}).forEach(day => {
    ['아침', '점심', '저녁'].forEach(mealSlot => {
      mealItems(planner[day]?.[mealSlot]).forEach((meal, mealIndex) => {
        if (meal.status === 'cooked' && !meal.ateAt) {
          const recipe = RECIPES.find(r => r.id === meal.recipeId);
          if (recipe) leftoverMeals.push({ day, mealSlot, mealIndex, meal, recipe });
        }
      });
    });
  });
  const backButton = (
    <button onClick={() => { setMode('hub'); setBookId(null); }} style={{
      border: 'none', background: T.surfaceFill, color: T.text2,
      borderRadius: 9999, padding: '7px 11px', fontSize: 12, fontWeight: 800,
      cursor: 'pointer', marginBottom: 12,
    }}>← 식사 추가</button>
  );
  const recipeRow = (recipe, meta, extra) => (
    <button key={recipe.id + (meta || '')} onClick={() => pickRecipe(recipe.id)} style={{
      width: '100%', display: 'flex', alignItems: 'center', gap: 12,
      background: '#fff', border: `1px solid ${T.border}`, borderRadius: 12,
      padding: 12, marginBottom: 8, cursor: 'pointer', textAlign: 'left',
    }}>
      <div style={{
        width: 52, height: 52, borderRadius: 10, background: recipe.bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28,
      }}>{recipe.emoji}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: T.ink }}>{recipe.name}</div>
        {extra || <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>{meta || `${recipe.minutes}분 · ${recipe.servings}인분`}</div>}
      </div>
      <span style={{
        fontSize: 12, fontWeight: 800, color: T.mintDeep,
        background: T.mintSoft, padding: '6px 10px', borderRadius: 8,
      }}>추가</span>
    </button>
  );

  if (mode === 'books') {
    return (
      <Sheet title={selectedBook ? selectedBook.name : '레시피북에서 추가'} onClose={close}>
        {backButton}
        {!selectedBook ? books.map(book => (
          <button key={book.id} onClick={() => setBookId(book.id)} style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 12,
            background: '#fff', border: `1px solid ${T.border}`, borderRadius: 12,
            padding: '13px 14px', marginBottom: 8, cursor: 'pointer', textAlign: 'left',
          }}>
            <span style={{ fontSize: 22 }}>{book.emoji}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: T.ink }}>{book.name}</div>
              <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>{(book.recipeIds || []).length}개 레시피 · {book.kind === 'saved' ? '저장' : '내 책'}</div>
            </div>
            {Icon.chevR(T.text4)}
          </button>
        )) : (selectedBook.recipeIds || []).map(id => RECIPES.find(r => r.id === id)).filter(Boolean)
          .map(recipe => recipeRow(recipe))}
      </Sheet>
    );
  }

  if (mode === 'pantry') {
    return (
      <Sheet title="팬트리 기반 추천" onClose={close}>
        {backButton}
        <div style={{ fontSize: 12, color: T.mintDeep, fontWeight: 800, lineHeight: 1.5, marginBottom: 12 }}>
          보유 재료가 많이 맞는 레시피부터 보여드려요.
        </div>
        {pantryMatches.slice(0, 7).map(({ recipe, hit, total, score }) =>
          recipeRow(recipe, null, (
            <MatchProgressBar score={score} sub={`${hit}/${total}개 보유 · ${recipe.minutes}분`} style={{ marginTop: 7 }} />
          ))
        )}
      </Sheet>
    );
  }

  if (mode === 'leftover') {
    return (
      <Sheet title="남은 요리에서 추가" onClose={close}>
        {backButton}
        {leftoverMeals.length === 0 ? (
          <div style={{ padding: 28, textAlign: 'center', color: T.text3, fontSize: 13 }}>
            추가할 남은 요리가 없어요.
          </div>
        ) : leftoverMeals.map(item =>
          recipeRow(item.recipe, `${item.day} ${item.mealSlot} · 남은 요리 ${item.meal.servings || 1}인분`)
        )}
      </Sheet>
    );
  }

  if (mode === 'youtube') {
    const canImport = ytUrl.trim().length > 0;
    return (
      <Sheet title="유튜브에서 가져오기" onClose={close} footer={
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="neutral" style={{ flex: '0 0 88px', whiteSpace: 'nowrap' }} onClick={close}>취소</Button>
          <Button full disabled={!canImport} onClick={() => {
            showToast?.('영상에서 레시피를 가져왔어요');
            pickRecipe('r5');
          }}>가져오기</Button>
        </div>
      }>
        {backButton}
        <input value={ytUrl} onChange={e => setYtUrl(e.target.value)}
          placeholder="유튜브 URL 붙여넣기" autoFocus
          style={{
            width: '100%', boxSizing: 'border-box', padding: '12px 14px',
            border: `1px solid ${T.border}`, borderRadius: 10, outline: 'none',
            fontSize: 14, fontFamily: T.fontUI, color: T.ink, background: '#fff',
          }} />
        <div style={{ marginTop: 12, fontSize: 12, color: T.text3, lineHeight: 1.5 }}>
          프로토타입에서는 URL 입력 후 샘플 레시피를 식사 추가 흐름에 연결합니다.
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet title={`${date} ${slot} · 식사 추가`} onClose={close}>
      {/* 검색 input — 포커스 시 기존 menu-add 검색으로 이동 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        background: T.surfaceFill, borderRadius: 10, padding: '0 12px', height: 40,
        marginBottom: 16,
      }}>
        {Icon.search()}
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => { close(); onMenuAdd(date, slot, 'search'); }}
          placeholder="레시피 검색"
          style={{
            flex: 1, border: 'none', background: 'transparent', outline: 'none',
            fontSize: 14, color: T.ink, fontFamily: T.fontUI,
          }}
        />
      </div>
      {/* 옵션 버튼 2열 그리드 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {options.map(o => (
          <button key={o.id} onClick={() => {
            if (o.id === 'manual') {
              close();
              if (onGoManual) onGoManual(date, slot);
              else onMenuAdd(date, slot);
            } else if (o.id === 'recipebook') {
              setMode('books');
            } else if (o.id === 'pantry') {
              setMode('pantry');
            } else if (o.id === 'leftover') {
              setMode('leftover');
            } else if (o.id === 'youtube') {
              setMode('youtube');
            } else {
              close();
              onMenuAdd(date, slot, 'search');
            }
          }} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '14px 12px', borderRadius: 10,
            background: '#fff', border: `1px solid ${T.border}`,
            cursor: 'pointer', fontSize: 13, fontWeight: 600, color: T.ink,
            textAlign: 'left',
          }}>
            <span style={{ fontSize: 20 }}>{o.icon}</span>
            <span>{o.label}</span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}

function PlannerScreen({ planner, setPlanner, pantry, onOpenRecipe, onOpenPlannerAdd, onOpenMeal, onCreateShopping, onCookList, onMenuAdd, onGoManual, onGoYtImport, onGoLeftovers, onPickRecipeFromMealAdd, showToast, initialMealAdd }) {
  const keys = Object.keys(planner);
  const todayK = keys[todayIdx];
  const dayRefs = React.useRef({});
  const weekRailRef = React.useRef(null);
  const weekRailSnapTimer = React.useRef(null);
  const weekRailResetting = React.useRef(false);
  // vNext S4 — week navigation label은 유지하고, 이동 UI는 일주일 날짜 카드로 고정
  const [weekOffset, setWeekOffset] = useState_P(0);
  // vNext S4 — 식사 추가 모달 상태
  const [mealAddModal, setMealAddModal] = useState_P(null); // { date, slot }

  const weekLabel = React.useMemo(() => {
    const base = new Date(WEEK_START);
    base.setDate(base.getDate() + weekOffset * 7);
    const end = new Date(base);
    end.setDate(end.getDate() + 6);
    return `${base.getMonth()+1}월 ${base.getDate()}일 — ${end.getMonth()+1}월 ${end.getDate()}일`;
  }, [weekOffset]);

  const scrollToDay = (key) => {
    dayRefs.current[key]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const dateCardMeta = (index, offset = weekOffset) => {
    const d = new Date(WEEK_START);
    d.setDate(d.getDate() + index + offset * 7);
    return {
      dow: weekDays[index],
      day: d.getDate(),
      label: `${d.getMonth() + 1}/${d.getDate()}`
    };
  };

  const centerWeekRail = () => {
    const el = weekRailRef.current;
    if (!el) return;
    weekRailResetting.current = true;
    el.scrollLeft = el.clientWidth;
    window.setTimeout(() => { weekRailResetting.current = false; }, 80);
  };

  React.useEffect(() => {
    centerWeekRail();
  }, [weekOffset]);

  React.useEffect(() => () => window.clearTimeout(weekRailSnapTimer.current), []);

  const handleWeekRailScroll = () => {
    if (weekRailResetting.current) return;
    window.clearTimeout(weekRailSnapTimer.current);
    weekRailSnapTimer.current = window.setTimeout(() => {
      const el = weekRailRef.current;
      if (!el) return;
      const page = el.clientWidth || 1;
      const index = Math.round(el.scrollLeft / page);
      if (index <= 0) {
        setWeekOffset(w => w - 1);
      } else if (index >= 2) {
        setWeekOffset(w => w + 1);
      } else {
        centerWeekRail();
      }
    }, 140);
  };

  const stats = React.useMemo(() => {
    let total = 0,cooked = 0,shopped = 0;
    keys.forEach((k) => {
      ['아침', '점심', '저녁'].forEach((slot) => {
        mealItems(planner[k][slot]).forEach((m) => {
          total++;
          if (m.status === 'cooked') cooked++;
          if (m.status === 'shopped') shopped++;
        });
      });
    });
    return { total, cooked, shopped };
  }, [planner]);

  // 식사 추가 진입점: 모달 열기
  const openMealAdd = (date, slot) => setMealAddModal({ date, slot });

  React.useEffect(() => {
    if (initialMealAdd?.date && initialMealAdd?.slot) {
      setMealAddModal({ date: initialMealAdd.date, slot: initialMealAdd.slot });
    }
  }, [initialMealAdd?.nonce]);

  return (
    <div style={{ background: T.surfaceFill, minHeight: '100%', paddingBottom: 100 }}>
      <AppBar title="플래너" />

      {/* vNext S4 — Week summary */}
      <div style={{ background: '#fff', padding: '16px 20px', borderBottom: `1px solid ${T.border}` }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: T.ink, marginBottom: 12, fontFamily: T.fontBrand }}>
          {stats.total}개 음식 계획 중
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{
            flex: 1, background: T.cookDoneBg, borderRadius: 10, padding: 12
          }}>
            <div style={{ fontSize: 11, color: T.cookDoneFg, fontWeight: 600 }}>요리 완료</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: T.cookDoneFg }}>{stats.cooked}개</div>
          </div>
          <div style={{
            flex: 1, background: '#FFF4E1', borderRadius: 10, padding: 12
          }}>
            <div style={{ fontSize: 11, color: '#B8860B', fontWeight: 600 }}>장보기 완료</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#B8860B' }}>{stats.shopped}개</div>
          </div>
          <div style={{
            flex: 1, background: T.surfaceFill, borderRadius: 10, padding: 12
          }}>
            <div style={{ fontSize: 11, color: T.text2, fontWeight: 600 }}>등록</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: T.ink }}>
              {stats.total - stats.cooked - stats.shopped}개
            </div>
          </div>
        </div>
      </div>

      {/* vNext repair — MVP처럼 일주일 날짜 카드만 보여주고 스크롤 중 상단에 고정 */}
      <div style={{
        position: 'sticky', top: 52, zIndex: 24,
        background: '#fff', borderBottom: `1px solid ${T.border}`,
        padding: '10px 14px 12px',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 8,
        }}>
          <button onClick={() => setWeekOffset(w => w - 1)} style={{
            width: 30, height: 30, borderRadius: 15,
            background: T.surfaceFill, border: `1px solid ${T.border}`,
            cursor: 'pointer', fontSize: 17, color: T.text2,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>‹</button>
          <div style={{ fontSize: 14, color: T.ink, fontWeight: 800 }}>
            {weekOffset === 0 ? '이번 주' : weekOffset === 1 ? '다음 주' : weekOffset === -1 ? '지난 주' : '식단'} {weekLabel}
          </div>
          <button onClick={() => setWeekOffset(w => w + 1)} style={{
            width: 30, height: 30, borderRadius: 15,
            background: T.surfaceFill, border: `1px solid ${T.border}`,
            cursor: 'pointer', fontSize: 17, color: T.text2,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>›</button>
        </div>
        <div style={{
          display: 'flex', overflowX: 'auto',
          scrollSnapType: 'x mandatory', scrollbarWidth: 'none',
          scrollBehavior: 'smooth',
        }} ref={weekRailRef} onScroll={handleWeekRailScroll}>
          {[-1, 0, 1].map(relative => {
            const pageOffset = weekOffset + relative;
            return (
              <div key={pageOffset} style={{
                flex: '0 0 100%', scrollSnapAlign: 'start',
                display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4,
              }}>
                {keys.map((k, index) => {
                  const active = relative === 0 && k === todayK;
                  const meta = dateCardMeta(index, pageOffset);
                  return (
                    <button key={`${pageOffset}-${k}`} onClick={() => {
                      if (relative !== 0) setWeekOffset(pageOffset);
                      scrollToDay(k);
                    }} style={{
                      minWidth: 0, height: 52,
                      borderRadius: 11,
                      border: active ? `2px solid ${T.mint}` : `1px solid ${T.border}`,
                      background: active ? T.mintSoft : '#fff',
                      color: active ? T.mintDeep : T.text2,
                      cursor: 'pointer',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      gap: 1,
                    }}>
                      <div style={{ fontSize: 10, fontWeight: 800 }}>{meta.dow}</div>
                      <div style={{ fontSize: 19, fontWeight: 900, fontFamily: T.fontBrand }}>{meta.day}</div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Day cards */}
      <div style={{ padding: 16 }}>
        {keys.map((k, i) => {
          const isToday = k === todayK;
          const day = planner[k];
          const slots = ['아침', '점심', '저녁'];
          return (
            <div key={k} ref={(node) => { if (node) dayRefs.current[k] = node; }} style={{
              background: '#fff', borderRadius: 12, marginBottom: 12,
              border: isToday ? `2px solid ${T.mint}` : `1px solid ${T.border}`,
              boxShadow: isToday ? T.shadowDeep : 'none',
              overflow: 'hidden', scrollMarginTop: 132
            }}>
              {/* Day header */}
              <div style={{
                display: 'flex', alignItems: 'center', padding: '12px 16px',
                borderBottom: `1px solid ${T.surfaceSubtle}`,
                background: isToday ? T.mintSoft : '#fff'
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 16,
                  background: isToday ? T.mint : T.surfaceFill,
                  color: isToday ? '#fff' : T.ink,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, fontWeight: 700, marginRight: 10
                }}>{weekDays[i]}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>
                    {k} {isToday && <span style={{ color: T.mint, fontSize: 12, marginLeft: 4 }}>오늘</span>}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: T.text3 }}>
                  {['아침', '점심', '저녁'].filter((s) => mealItems(day[s]).length).length}/3
                </div>
              </div>
              {/* vNext S4 — Slot rows: 이모지 제거, 라벨 강화, 상태 배지·chevron 제거, + 음식 강화 */}
              {slots.map((slot) => {
                const meals = mealItems(day[slot]);
                const mealRows = meals.map((meal) => ({
                  meal,
                  recipe: RECIPES.find((r) => r.id === meal.recipeId)
                })).filter((row) => row.recipe);
                return (
                  <div key={slot} style={{
                    display: 'flex', alignItems: 'center', padding: '8px 12px',
                    height: 104, boxSizing: 'border-box',
                    borderBottom: `1px solid ${T.surfaceSubtle}`,
                    cursor: mealRows.length ? 'pointer' : 'default'
                  }} onClick={() => {
                    if (mealRows.length) onOpenMeal(k, slot);
                  }}>
                    {/* vNext S4 — 이모지 제거, 라벨만 또렷하게 */}
                    <div style={{
                      width: 38, fontSize: 13, color: T.ink,
                      fontWeight: 700, flexShrink: 0,
                    }}>
                      {slot}
                    </div>
                    {mealRows.length ?
                    <>
	                        <div style={{ flex: 1, marginLeft: 10, minWidth: 0, position: 'relative' }}>
	                          <div style={{
	                            display: 'grid',
	                            gridTemplateColumns: mealRows.length > 1 ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)',
	                            gap: 6,
	                          }}>
	                            {mealRows.slice(0, 2).map(({ meal, recipe }, idx) => (
	                              <div key={recipe.id + idx} style={{
	                                display: 'flex', alignItems: 'center', gap: 8,
	                                height: 50, borderRadius: 8,
	                                background: '#fff', color: T.ink,
	                                border: `1px solid ${T.surfaceSubtle}`,
	                                overflow: 'hidden', position: 'relative',
	                              }}>
	                                <div style={{
	                                  width: 38, height: 50, background: recipe.bg, flexShrink: 0,
	                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
	                                  fontSize: 22,
	                                }}>{recipe.emoji}</div>
	                                <div style={{ flex: 1, minWidth: 0 }}>
	                                  <div style={{ fontSize: 12, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{recipe.name}</div>
	                                  <div style={{ fontSize: 10, color: T.text3, marginTop: 1 }}>{meal.servings || recipe.servings}인분</div>
	                                </div>
	                                {idx === 1 && mealRows.length > 2 && (
	                                  <div style={{
	                                    position: 'absolute', right: 4, bottom: 4,
	                                    fontSize: 10, color: T.text2, background: 'rgba(248,249,250,0.92)',
	                                    padding: '2px 6px', borderRadius: 9999, fontWeight: 800,
	                                  }}>+{mealRows.length - 2}</div>
	                                )}
	                              </div>
	                            ))}
	                          </div>
	                        </div>
	                        {/* vNext S4 — + 음식 버튼을 + 아이콘형으로 축약하고 색상 충돌 완화 */}
	                        <button onClick={(e) => { e.stopPropagation(); openMealAdd(k, slot); }} style={{
	                          marginLeft: 8, width: 34, height: 34,
	                          border: `1.5px solid ${T.mealAddBorder}`, background: T.mealAddBg,
	                          color: T.mealAddFg, borderRadius: 10, fontSize: 20, lineHeight: 1,
	                          fontWeight: 700, cursor: 'pointer', flexShrink: 0,
	                        }}>+</button>
	                      </> :

	                    <button onClick={() => openMealAdd(k, slot)} style={{
	                      flex: 1, marginLeft: 10, height: 48, border: `1.5px dashed ${T.mealAddBorder}`,
	                      background: T.mealAddBg, borderRadius: 8, color: T.mealAddFg,
	                      fontSize: 13, fontWeight: 600, cursor: 'pointer',
	                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4
	                    }}>+ 식사 추가</button>
                    }
                  </div>);

              })}
            </div>);

        })}
      </div>

      {/* vNext S4 — 하단 CTA: 장보기만 (요리하기 제거) */}
      <div style={{
        position: 'absolute', bottom: 92, right: 16, zIndex: 20
      }}>
        <button style={{
          background: T.ink, color: '#fff', border: 'none',
          padding: '12px 18px', borderRadius: 9999, fontWeight: 700, fontSize: 14,
          boxShadow: T.shadowSharp, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 6
        }} onClick={onCreateShopping}>장보기</button>
      </div>

      {/* vNext S4 — 식사 추가 모달 */}
      {mealAddModal && (
        <MealAddModal
          date={mealAddModal.date}
          slot={mealAddModal.slot}
          planner={planner}
          pantry={pantry}
          onClose={() => setMealAddModal(null)}
          onMenuAdd={onMenuAdd}
          onGoManual={onGoManual}
          onGoYtImport={onGoYtImport}
          onGoLeftovers={onGoLeftovers}
          onPickRecipe={onPickRecipeFromMealAdd}
          showToast={showToast}
        />
      )}
    </div>);

}

window.PlannerScreen = PlannerScreen;
window.MealAddModal = MealAddModal;
