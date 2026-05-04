// Desktop variants of screens — reuse data, rearrange layout.
const { useMemo: dUseMemo, useState: dUseState } = React;

function DesktopHome({ onOpenRecipe, ingFilter, setIngFilter, sortBy, setSortBy, setShowSortSheet }) {
  const filtered = dUseMemo(() => {
    let r = [...RECIPES];
    if (ingFilter.length) r = r.filter(x => ingFilter.every(f => x.tags.some(t => t.includes(f)) || x.name.includes(f)));
    if (sortBy === 'rating') r.sort((a, b) => b.rating - a.rating);
    if (sortBy === 'time')   r.sort((a, b) => a.minutes - b.minutes);
    if (sortBy === 'saves')  r.sort((a, b) => b.saves - a.saves);
    return r;
  }, [ingFilter, sortBy]);

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
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {['김치','돼지고기','두부','계란','감자','애호박','참치','김'].map(ing => (
            <Chip key={ing}
              active={ingFilter.includes(ing)}
              onClick={() => setIngFilter(f => f.includes(ing) ? f.filter(x => x !== ing) : [...f, ing])}
            >{ing}</Chip>
          ))}
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

function DesktopPlanner({ planner, onOpenRecipe, onOpenPlannerAdd }) {
  const days = Object.keys(planner);
  const slots = ['아침', '점심', '저녁'];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, color: T.ink }}>이번 주 식단</div>
          <div style={{ fontSize: 13, color: T.text3, marginTop: 2 }}>2026년 4월 14일 ~ 4월 20일</div>
        </div>
        <button onClick={() => onOpenPlannerAdd?.()} style={{
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
                    <button onClick={() => onOpenPlannerAdd?.(d, slot)} style={{
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

Object.assign(window, { DesktopHome, DesktopPlanner, DesktopRecipeDetail, DesktopPantry, DesktopMyPage });
