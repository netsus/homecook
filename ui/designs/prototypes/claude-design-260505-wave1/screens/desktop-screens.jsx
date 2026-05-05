// Desktop variants of screens — reuse data, rearrange layout.
const { useMemo: dUseMemo, useState: dUseState } = React;

function DesktopHome({ onOpenRecipe, ingFilter, setIngFilter, sortBy, setSortBy, setShowSortSheet, onOpenIngredientFilter, ingredientNames = [] }) {
  const filtered = dUseMemo(() => {
    let r = [...RECIPES];
    if (ingFilter.length) r = r.filter(x => ingFilter.every(f => x.tags.some(t => t.includes(f)) || x.name.includes(f)));
    if (ingredientNames.length) {
      r = r.filter(recipe => {
        const names = recipe.ingredients.map(i => i.name).join(' ');
        return ingredientNames.every(name => names.includes(name));
      });
    }
    if (sortBy === 'rating') r.sort((a, b) => b.rating - a.rating);
    if (sortBy === 'time')   r.sort((a, b) => a.minutes - b.minutes);
    if (sortBy === 'saves')  r.sort((a, b) => b.saves - a.saves);
    return r;
  }, [ingFilter, ingredientNames, sortBy]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      {/* Hero / today */}
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

        <div style={{
          background: '#fff', borderRadius: 16, padding: 24,
          boxShadow: T.shadowDeep, display: 'flex', flexDirection: 'column', gap: 14,
        }}>
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
            화요일에 등록된 식단 3건 · <span style={{ color: T.mint, fontWeight: 700, cursor: 'pointer' }}>전체 보기</span>
          </div>
        </div>
      </section>

      {/* Filter row */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: T.ink }}>레시피 둘러보기</div>
          <button onClick={() => setShowSortSheet(true)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 13, color: T.text2, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4,
          }}>
            정렬: {{rating:'평점순', time:'시간순', saves:'저장순'}[sortBy]} {Icon.chevD(T.text2)}
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
          {['김치','돼지고기','두부','계란','감자','애호박','참치','김'].map(ing => (
            <Chip key={ing}
              active={ingFilter.includes(ing)}
              onClick={() => setIngFilter(f => f.includes(ing) ? f.filter(x => x !== ing) : [...f, ing])}
            >{ing}</Chip>
          ))}
          {onOpenIngredientFilter && (
            <button onClick={onOpenIngredientFilter} style={{
              padding: '8px 14px', borderRadius: 9999,
              background: ingredientNames.length > 0 ? T.mint : '#fff',
              border: `1px dashed ${ingredientNames.length > 0 ? T.mintDeep : T.border}`,
              color: ingredientNames.length > 0 ? '#fff' : T.text2,
              fontSize: 12, fontWeight: 700, cursor: 'pointer', marginLeft: 4,
            }}>🔎 {ingredientNames.length > 0 ? `재료 ${ingredientNames.length}개 적용` : '재료로 거르기'}</button>
          )}
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
                  {Icon.star()} <span style={{ color: T.ink, fontWeight: 600 }}>{r.rating}</span>
                  <span>·</span>
                  {Icon.clock()} {r.minutes}분
                  <span>·</span>
                  {Icon.users()} {r.servings}인
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function DesktopPlanner({ planner, onOpenRecipe, onOpenPlannerAdd, onMenuAdd }) {
  const days = Object.keys(planner);
  const slots = ['아침', '점심', '저녁'];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: T.ink }}>이번 주 식단</div>
          <div style={{ fontSize: 13, color: T.text3, marginTop: 2 }}>2026년 4월 14일 ~ 4월 20일</div>
        </div>
        <button onClick={() => onMenuAdd?.()} style={{
          background: T.mint, color: '#fff', border: 'none', padding: '10px 16px',
          borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer',
        }}>+ 식단 추가</button>
      </div>

      <div style={{
        background: '#fff', borderRadius: 12, overflow: 'hidden',
        boxShadow: T.shadowDeep,
        display: 'grid', gridTemplateColumns: '80px repeat(7, 1fr)',
      }}>
        <div style={{ background: T.surfaceFill, borderBottom: `1px solid ${T.border}` }} />
        {days.map((d, i) => {
          const date = new Date(d);
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

        {slots.map(slot => (
          <React.Fragment key={slot}>
            <div style={{
              padding: 12, background: T.surfaceFill, color: T.text2, fontWeight: 700, fontSize: 12,
              borderBottom: `1px solid ${T.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{slot}</div>
            {days.map(d => {
              const meal = planner[d]?.[slot];
              const recipe = meal && RECIPES.find(r => r.id === meal.recipeId);
              return (
                <div key={d+slot} style={{
                  borderLeft: `1px solid ${T.border}`, borderBottom: `1px solid ${T.border}`,
                  minHeight: 110, padding: 6,
                }}>
                  {recipe ? (
                    <div onClick={() => onOpenRecipe(recipe.id)} style={{
                      background: recipe.bg || T.surfaceFill, borderRadius: 8, padding: 8, height: '100%',
                      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                      cursor: 'pointer',
                    }}>
                      <div style={{ fontSize: 24, lineHeight: 1 }}>{recipe.emoji || '🍽️'}</div>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: T.ink, lineHeight: 1.3, marginBottom: 4 }}>{recipe.name}</div>
                        <StatusPill status={meal.status} />
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => onMenuAdd?.(d, slot)} style={{
                      width: '100%', height: '100%',
                      background: 'transparent', border: `1.5px dashed ${T.border}`, borderRadius: 8,
                      color: T.text3, fontSize: 18, cursor: 'pointer',
                    }}>+</button>
                  )}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function DesktopRecipeDetail({ recipeId, onBack, onOpenPlannerAdd, onOpenSave, saved, toggleSaved }) {
  const r = RECIPES.find(x => x.id === recipeId);
  const [servings, setServings] = dUseState(r.servings);
  const [tab, setTab] = dUseState('ingredients');
  const scale = servings / r.servings;

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
            marginBottom: 20,
          }}>{r.emoji}</div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <h1 style={{ fontSize: 28, fontWeight: 800, color: T.ink, margin: 0 }}>{r.name}</h1>
            <button onClick={toggleSaved} style={{
              background: 'none', border: 'none', cursor: 'pointer', display: 'flex',
            }}>{Icon.heart(saved)}</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, color: T.text2, fontSize: 14, marginBottom: 24, flexWrap: 'wrap' }}>
            {Icon.star()} <span style={{ fontWeight: 700, color: T.ink }}>{r.rating}</span>
            <span>({r.saves.toLocaleString()})</span>
            <span>·</span>
            {Icon.clock()} {r.minutes}분
            <span>·</span>
            {(r.tags || []).join(' · ')}
          </div>

          <div style={{ display: 'flex', gap: 24, borderBottom: `1px solid ${T.border}`, marginBottom: 20 }}>
            {[['ingredients','재료'],['cook','조리법'],['reviews','리뷰 '+r.saves]].map(([k,l]) => (
              <button key={k} onClick={() => setTab(k)} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '12px 0', fontSize: 14, fontWeight: 700,
                color: tab === k ? T.mint : T.text3,
                borderBottom: tab === k ? `2px solid ${T.mint}` : '2px solid transparent',
                marginBottom: -1,
              }}>{l}</button>
            ))}
          </div>

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
                      <div style={{ fontSize: 14, color: T.ink, lineHeight: 1.6 }}>{s.text}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {tab === 'reviews' && (
            <div style={{ color: T.text3, padding: 40, textAlign: 'center', fontSize: 14 }}>
              리뷰 {r.saves.toLocaleString()}개 — 데모에서는 비활성
            </div>
          )}
        </div>

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
              <Button variant="secondary" full onClick={onOpenSave}>{saved ? '저장 해제' : '저장하기'}</Button>
            </div>
          </div>

          <div style={{
            marginTop: 16, padding: 16, background: T.mintSoft,
            borderRadius: 12, fontSize: 12, color: T.mintDeep, lineHeight: 1.5,
          }}>
            💡 같은 재료로 <b style={{ fontWeight: 700 }}>3개 레시피</b>를 더 만들 수 있어요
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

function DesktopPantry({ pantry, setPantry }) {
  const sections = {};
  Object.entries(pantry).forEach(([key, item]) => {
    if (!sections[item.section]) sections[item.section] = [];
    sections[item.section].push({ key, ...item });
  });
  const totalHave = Object.values(pantry).filter(x => x.have).length;
  const total = Object.keys(pantry).length;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: T.ink, marginBottom: 4 }}>팬트리</div>
          <div style={{ fontSize: 13, color: T.text3 }}>보유 중인 재료를 표시하면 가능한 레시피를 추천해 드려요</div>
        </div>
        <div style={{
          background: T.mintSoft, color: T.mintDeep, padding: '8px 14px',
          borderRadius: 8, fontSize: 13, fontWeight: 700,
        }}>보유 {totalHave} / {total}</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20 }}>
        {Object.entries(sections).map(([cat, items]) => (
          <div key={cat} style={{
            background: '#fff', borderRadius: 12, padding: 20, boxShadow: T.shadowDeep,
          }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.ink, marginBottom: 12 }}>{cat}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {items.map(it => (
                <button key={it.key} onClick={() => {
                  setPantry(p => ({ ...p, [it.key]: { ...p[it.key], have: !p[it.key].have } }));
                }} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 12px', borderRadius: 9999,
                  background: it.have ? T.mintSoft : T.surfaceFill,
                  border: it.have ? `1px solid ${T.mint}` : '1px solid transparent',
                  color: it.have ? T.mintDeep : T.text2,
                  fontSize: 13, fontWeight: it.have ? 700 : 500, cursor: 'pointer',
                }}>
                  {it.have && Icon.check(T.mintDeep)}
                  {it.name}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DesktopMyPage({ savedIds, onOpenRecipe }) {
  const saved = RECIPES.filter(r => savedIds.includes(r.id));
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
          {[['저장', saved.length],['요리', 12],['플래너', 24]].map(([l,n]) => (
            <div key={l} style={{ background: T.surfaceFill, padding: '12px 8px', borderRadius: 8 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: T.ink }}>{n}</div>
              <div style={{ fontSize: 11, color: T.text3 }}>{l}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {['알림 설정','계정 정보','도움말','로그아웃'].map(m => (
            <button key={m} style={{
              padding: '10px 12px', background: 'none', border: 'none',
              cursor: 'pointer', textAlign: 'left', borderRadius: 6,
              fontSize: 13, color: T.text2, fontWeight: 500,
            }}>{m}</button>
          ))}
        </div>
      </aside>
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, color: T.ink, marginBottom: 12 }}>저장한 레시피</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16 }}>
          {saved.map(r => (
            <div key={r.id} onClick={() => onOpenRecipe(r.id)} style={{
              background: '#fff', borderRadius: 12, overflow: 'hidden',
              boxShadow: T.shadowDeep, cursor: 'pointer',
            }}>
              <div style={{
                width: '100%', aspectRatio: '4/3', background: r.bg,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 64,
              }}>{r.emoji}</div>
              <div style={{ padding: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>{r.name}</div>
                <div style={{ fontSize: 12, color: T.text3, marginTop: 4 }}>
                  ⭐ {r.rating} · {r.minutes}분
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
                    <div style={{ fontSize: 11, color: T.text3 }}>⭐ {r.rating} · {r.minutes}분 · {r.servings}인분</div>
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
function DesktopMenuAddScreen({ presetDate, presetSlot, planner, pantry, onBack, onPickRecipe, onGoManual, onGoYtImport, showToast }) {
  const [tab, setTab] = dUseState('search');
  const slotLabel = presetDate && presetSlot ? `${presetDate} ${presetSlot}` : '플래너';
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
                      <div style={{ fontSize: 10, color: T.text3, marginTop: 2 }}>⭐ {r.rating} · {r.minutes}분</div>
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
                        <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{b.name}</div>
                        <div style={{ fontSize: 11, color: T.text3 }}>{b.recipeIds.length}개</div>
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
                {RECIPES.slice(0, 6).map(r => (
                  <div key={r.id} onClick={() => onPickRecipe?.(r.id)} style={{
                    background: '#fff', border: `1px solid ${T.border}`, borderRadius: 12, overflow: 'hidden', cursor: 'pointer',
                    position: 'relative',
                  }}>
                    <div style={{
                      position: 'absolute', top: 8, left: 8,
                      background: T.mint, color: '#fff', fontSize: 10, fontWeight: 800,
                      padding: '3px 8px', borderRadius: 9999,
                    }}>매칭 {Math.floor(60 + Math.random()*30)}%</div>
                    <div style={{ aspectRatio: '4/3', background: r.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 44 }}>{r.emoji}</div>
                    <div style={{ padding: 10 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{r.name}</div>
                      <div style={{ fontSize: 10, color: T.text3, marginTop: 2 }}>{r.minutes}분 · {r.servings}인분</div>
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
function DesktopShoppingCreateScreen({ planner, pantry, onBack, onAddToPantry, showToast }) {
  // Aggregate ingredients from registered meals
  const items = dUseMemo(() => {
    const acc = {};
    Object.entries(planner).forEach(([date, day]) => {
      ['아침','점심','저녁'].forEach(slot => {
        const m = day[slot];
        if (!m || m.status === 'cooked') return;
        const r = RECIPES.find(x => x.id === m.recipeId);
        if (!r) return;
        r.ingredients.forEach(ing => {
          const key = ing.name;
          if (!acc[key]) acc[key] = { name: ing.name, qty: '약간', section: ing.section || '기타', meals: [], have: !!pantry[key]?.have };
          acc[key].meals.push(`${date} ${slot}`);
        });
      });
    });
    return Object.values(acc);
  }, [planner, pantry]);

  const sections = ['채소','육류','해산물','유제품','곡류','양념','기타'];
  const grouped = sections.map(sec => ({ sec, list: items.filter(i => i.section === sec) })).filter(g => g.list.length > 0);
  const need = items.filter(i => !i.have);
  const have = items.filter(i => i.have);

  return (
    <div>
      <button onClick={onBack} style={{
        background: 'none', border: 'none', cursor: 'pointer',
        color: T.text2, fontSize: 13, fontWeight: 600, marginBottom: 14,
        display: 'inline-flex', alignItems: 'center', gap: 6,
      }}>{Icon.chevL(T.text2)} 돌아가기</button>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: T.ink, fontFamily: T.fontBrand }}>장보기 목록 만들기</div>
          <div style={{ fontSize: 13, color: T.text3, marginTop: 2 }}>이번 주 등록된 식단 기준 · 총 {items.length}개 재료</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => onAddToPantry?.(have.map(i => i.name))} style={{
            padding: '10px 14px', borderRadius: 8, border: `1px solid ${T.border}`,
            background: '#fff', color: T.text2, fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}>보유 재료 팬트리 반영</button>
          <button onClick={() => showToast?.('장보기 목록이 만들어졌어요')} style={{
            padding: '10px 18px', borderRadius: 8, border: 'none',
            background: T.mint, color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer',
          }}>🛒 {need.length}개 사야 함 · 목록 만들기</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 24, alignItems: 'start' }}>
        <div style={{ background: '#fff', borderRadius: 14, padding: 8, boxShadow: T.shadowDeep }}>
          {grouped.map(g => (
            <div key={g.sec} style={{ padding: '12px 16px' }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: T.text2, marginBottom: 8 }}>{g.sec} ({g.list.length})</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                {g.list.map(it => (
                  <div key={it.name} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 12px', borderRadius: 10,
                    background: it.have ? T.mintSoft : T.surfaceFill,
                  }}>
                    <span style={{ fontSize: 14 }}>{it.have ? '✓' : '🛒'}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: it.have ? T.mintDeep : T.ink }}>{it.name}</div>
                      <div style={{ fontSize: 10, color: T.text3, marginTop: 2 }}>{it.meals.slice(0, 2).join(' · ')}{it.meals.length > 2 ? ` 외 ${it.meals.length - 2}` : ''}</div>
                    </div>
                    <span style={{ fontSize: 11, color: T.text3, fontWeight: 600 }}>{it.qty}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {grouped.length === 0 && (
            <div style={{ padding: 60, textAlign: 'center', color: T.text3, fontSize: 13 }}>
              플래너에 등록된 식단이 없어요
            </div>
          )}
        </div>

        <aside style={{ background: '#fff', borderRadius: 14, padding: 20, boxShadow: T.shadowDeep, position: 'sticky', top: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: T.ink, marginBottom: 14 }}>요약</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Stat label="이번 주 식단" value={Object.values(planner).reduce((a, d) => a + ['아침','점심','저녁'].filter(s => d[s]).length, 0) + '끼'} />
            <Stat label="필요한 재료" value={items.length + '개'} />
            <Stat label="이미 보유" value={have.length + '개'} color={T.mintDeep} />
            <Stat label="구매 필요" value={need.length + '개'} color={T.red} />
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
function DesktopShoppingDetailScreen({ list, onBack, onToggleItem, onComplete, onReopen, onReflect, showToast }) {
  if (!list) {
    return (
      <div>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.text2, fontSize: 13, fontWeight: 600, marginBottom: 14 }}>{Icon.chevL(T.text2)} 목록으로</button>
        <div style={{ padding: 60, textAlign: 'center', color: T.text3 }}>장보기 목록을 찾을 수 없어요</div>
      </div>
    );
  }
  const checked = list.items.filter(i => i.checked).length;
  const total = list.items.length;
  const progress = total > 0 ? checked / total : 0;
  const sections = {};
  list.items.forEach(it => {
    if (!sections[it.section]) sections[it.section] = [];
    sections[it.section].push(it);
  });

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
            {list.status === 'completed' ? `완료 · ${list.completedAt || ''}` : '진행 중'} · {checked}/{total} 체크
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {list.status === 'completed' ? (
            <>
              <button onClick={() => onReopen?.(list.id)} style={{
                padding: '10px 14px', borderRadius: 8, border: `1px solid ${T.border}`,
                background: '#fff', color: T.text2, fontSize: 13, fontWeight: 700, cursor: 'pointer',
              }}>다시 열기</button>
              <button onClick={() => onReflect?.(list)} style={{
                padding: '10px 18px', borderRadius: 8, border: 'none',
                background: T.mint, color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer',
              }}>팬트리 반영</button>
            </>
          ) : (
            <button onClick={() => onComplete?.(list.id)} style={{
              padding: '10px 18px', borderRadius: 8, border: 'none',
              background: T.mint, color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer',
            }}>장보기 완료</button>
          )}
        </div>
      </div>

      {/* Progress */}
      <div style={{ background: '#fff', borderRadius: 12, padding: 16, marginBottom: 20, boxShadow: T.shadowNatural }}>
        <div style={{ height: 8, background: T.surfaceFill, borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ width: `${progress*100}%`, height: '100%', background: T.mint, transition: 'width 0.2s' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, color: T.text3 }}>
          <span>0%</span><span>{Math.round(progress*100)}% 진행</span><span>100%</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        {Object.entries(sections).map(([sec, items]) => (
          <div key={sec} style={{ background: '#fff', borderRadius: 12, padding: 16, boxShadow: T.shadowDeep }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: T.text2, marginBottom: 12 }}>{sec} ({items.length})</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {items.map(it => (
                <button key={it.name} onClick={() => onToggleItem?.(it.name)} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10,
                  background: it.checked ? T.mintSoft : T.surfaceFill, border: 'none', cursor: 'pointer', textAlign: 'left',
                  textDecoration: it.checked ? 'line-through' : 'none',
                  opacity: it.have ? 0.6 : 1,
                }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: 11,
                    background: it.checked ? T.mint : '#fff',
                    border: it.checked ? 'none' : `2px solid ${T.border}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, fontWeight: 800,
                  }}>{it.checked ? '✓' : ''}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{it.name}</div>
                    <div style={{ fontSize: 10, color: T.text3, marginTop: 2 }}>{it.qty} · {(it.fromMeals || []).join(' · ')}{it.have ? ' · 보유' : ''}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Desktop: COOK_MODE (= CookRun, P1.1)
function DesktopCookRunScreen({ date, slot, planner, onBack, onComplete, showToast }) {
  const meal = planner[date]?.[slot];
  const recipe = meal && RECIPES.find(r => r.id === meal.recipeId);
  const [step, setStep] = dUseState(0);
  const [consumed, setConsumed] = dUseState(new Set());
  if (!recipe) {
    return (
      <div>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.text2, fontSize: 13, fontWeight: 600, marginBottom: 14 }}>{Icon.chevL(T.text2)} 돌아가기</button>
        <div style={{ padding: 60, textAlign: 'center', color: T.text3 }}>식사를 찾을 수 없어요</div>
      </div>
    );
  }
  const steps = recipe.steps || [{ text: '레시피 단계 정보가 없어요' }];
  const cur = steps[step] || steps[0];
  const stepKind = (cur.kind || 'etc');
  const stepColor = T['cook' + stepKind.charAt(0).toUpperCase() + stepKind.slice(1)] || T.text3;

  return (
    <div>
      <button onClick={onBack} style={{
        background: 'none', border: 'none', cursor: 'pointer',
        color: T.text2, fontSize: 13, fontWeight: 600, marginBottom: 14,
        display: 'inline-flex', alignItems: 'center', gap: 6,
      }}>{Icon.chevL(T.text2)} 그만두기</button>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 11, color: T.text3, fontWeight: 700, letterSpacing: 1 }}>요리 모드 · {date} {slot}</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: T.ink, fontFamily: T.fontBrand }}>{recipe.name}</div>
        </div>
        <div style={{ fontSize: 13, color: T.text3 }}>{step + 1} / {steps.length} 단계</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 24, alignItems: 'start' }}>
        <main style={{
          background: '#fff', borderRadius: 16, boxShadow: T.shadowDeep, overflow: 'hidden',
        }}>
          <div style={{
            aspectRatio: '16/9', background: recipe.bg || T.surfaceFill,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 96, position: 'relative',
          }}>
            {recipe.emoji}
            <div style={{
              position: 'absolute', top: 14, left: 14,
              background: stepColor, color: '#fff', fontSize: 11, fontWeight: 800,
              padding: '6px 12px', borderRadius: 9999, letterSpacing: 0.5,
            }}>{stepKind.toUpperCase()}</div>
          </div>
          <div style={{ padding: 28 }}>
            <div style={{ fontSize: 12, color: T.text3, fontWeight: 700, marginBottom: 8 }}>STEP {step + 1}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: T.ink, lineHeight: 1.55, marginBottom: 18 }}>
              {cur.text || '단계 설명'}
            </div>
            {cur.tip && (
              <div style={{ background: T.surfaceFill, borderRadius: 10, padding: 14, fontSize: 13, color: T.text2, lineHeight: 1.55 }}>
                💡 {cur.tip}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
              <button onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0} style={{
                padding: '12px 22px', borderRadius: 10, border: `1px solid ${T.border}`,
                background: '#fff', color: step === 0 ? T.text4 : T.text2,
                fontSize: 14, fontWeight: 700, cursor: step === 0 ? 'default' : 'pointer',
              }}>◀ 이전</button>
              {step < steps.length - 1 ? (
                <button onClick={() => setStep(s => s + 1)} style={{
                  padding: '12px 28px', borderRadius: 10, border: 'none',
                  background: T.mint, color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer',
                }}>다음 단계 ▶</button>
              ) : (
                <button onClick={() => onComplete?.(date, slot, [...consumed])} style={{
                  padding: '12px 28px', borderRadius: 10, border: 'none',
                  background: T.tealLight, color: '#fff', fontSize: 14, fontWeight: 800, cursor: 'pointer',
                }}>🎉 요리 완료</button>
              )}
            </div>
          </div>
        </main>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'sticky', top: 24 }}>
          {/* Steps overview */}
          <div style={{ background: '#fff', borderRadius: 12, padding: 16, boxShadow: T.shadowDeep }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: T.text2, marginBottom: 10 }}>전체 단계</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {steps.map((s, i) => (
                <button key={i} onClick={() => setStep(i)} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 10px', borderRadius: 8,
                  background: i === step ? T.mintSoft : 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
                }}>
                  <span style={{ fontSize: 11, color: i < step ? T.mintDeep : (i === step ? T.mintDeep : T.text3), fontWeight: 800, minWidth: 18 }}>
                    {i < step ? '✓' : i + 1}
                  </span>
                  <span style={{ fontSize: 12, color: i === step ? T.ink : T.text2, fontWeight: i === step ? 700 : 500, lineHeight: 1.4 }}>
                    {s.text || `단계 ${i+1}`}
                  </span>
                </button>
              ))}
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
    </div>
  );
}

Object.assign(window, {
  DesktopHome, DesktopPlanner, DesktopRecipeDetail, DesktopPantry, DesktopMyPage,
  // Wave 1.5 desktop variants
  DesktopMyPageRecipebookDetail, DesktopIngredientFilterDialog,
  DesktopMenuAddScreen, DesktopShoppingCreateScreen, DesktopShoppingDetailScreen, DesktopCookRunScreen,
});

