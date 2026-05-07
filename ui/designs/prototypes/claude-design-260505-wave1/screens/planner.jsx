// Planner screen (week view with day cards, slot rows per 화면정의서 H4)
const { useState: useState_P } = React;

function PlannerScreen({ planner, setPlanner, onOpenRecipe, onOpenPlannerAdd, onOpenMeal, onCreateShopping, onCookList, onMenuAdd }) {
  const keys = Object.keys(planner);
  const todayK = keys[todayIdx];

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

  return (
    <div style={{ background: T.surfaceFill, minHeight: '100%', paddingBottom: 100 }}>
      <AppBar title="이번 주 플래너" left={Icon.chevL()} right={<span style={{ fontSize: 20 }}>⋯</span>} />

      {/* Summary */}
      <div style={{ background: '#fff', padding: '16px 20px', borderBottom: `1px solid ${T.border}` }}>
        <div style={{ fontSize: 14, color: T.text3, marginBottom: 4 }}>4월 20일 — 26일</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: T.ink, marginBottom: 12, fontFamily: T.fontBrand }}>
          이번 주 {stats.total}개 음식 계획 중
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{
            flex: 1, background: T.mintSoft, borderRadius: 10, padding: 12
          }}>
            <div style={{ fontSize: 11, color: T.mintDeep, fontWeight: 600 }}>요리 완료</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: T.mintDeep }}>{stats.cooked}개</div>
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

      {/* Day cards */}
      <div style={{ padding: 16 }}>
        {keys.map((k, i) => {
          const isToday = k === todayK;
          const day = planner[k];
          const slots = [['아침', '🌅'], ['점심', '☀️'], ['저녁', '🌙']];
          return (
            <div key={k} style={{
              background: '#fff', borderRadius: 12, marginBottom: 12,
              border: isToday ? `2px solid ${T.mint}` : `1px solid ${T.border}`,
              boxShadow: isToday ? T.shadowDeep : 'none',
              overflow: 'hidden'
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
              {/* Slot rows */}
              {slots.map(([slot, emoji]) => {
                const meals = mealItems(day[slot]);
                const recipes = meals.map((meal) => RECIPES.find((r) => r.id === meal.recipeId)).filter(Boolean);
                const summary = slotStatusSummary(day[slot]);
                return (
                  <div key={slot} style={{
                    display: 'flex', alignItems: 'center', padding: '10px 16px',
                    borderBottom: `1px solid ${T.surfaceSubtle}`,
                    cursor: recipes.length ? 'pointer' : 'default'
                  }} onClick={() => {
                    if (recipes.length) onOpenMeal(k, slot); else
                    onOpenPlannerAdd(k, slot);
                  }}>
                    <div style={{
                      width: 48, textAlign: 'center', fontSize: 12, color: T.text3,
                      fontWeight: 600
                    }}>
                      <div style={{ fontSize: 18 }}>{emoji}</div>
                      {slot}
                    </div>
                    {recipes.length ?
                    <>
                        <div style={{ flex: 1, marginLeft: 12, minWidth: 0 }}>
                          <div style={{ display: 'flex', gap: 6, marginBottom: 7, flexWrap: 'wrap' }}>
                            {recipes.slice(0, 3).map((recipe, idx) => (
                              <span key={recipe.id + idx} style={{
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                maxWidth: 116, padding: '4px 7px', borderRadius: 8,
                                background: recipe.bg, color: T.ink,
                                fontSize: 11, fontWeight: 700,
                              }}>
                                <span>{recipe.emoji}</span>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{recipe.name}</span>
                              </span>
                            ))}
                            {recipes.length > 3 && (
                              <span style={{ fontSize: 11, color: T.text2, background: T.surfaceFill, padding: '4px 7px', borderRadius: 8, fontWeight: 700 }}>
                                +{recipes.length - 3}개 더
                              </span>
                            )}
                          </div>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <StatusPill status={summary.status === 'mixed' ? 'shopped' : summary.status} />
                            <span style={{ fontSize: 11, color: T.text3 }}>{recipes.length}개 음식 · {summary.label}</span>
                            <button onClick={(e) => { e.stopPropagation(); onMenuAdd?.(k, slot); }} style={{
                              marginLeft: 'auto', border: `1px dashed ${T.border}`, background: '#fff',
                              color: T.text2, borderRadius: 7, padding: '4px 8px', fontSize: 11,
                              fontWeight: 700, cursor: 'pointer',
                            }}>+ 음식</button>
                          </div>
                        </div>
                        {Icon.chevR()}
                      </> :

                    <button onClick={() => onMenuAdd?.(k, slot)} style={{
                      flex: 1, marginLeft: 12, height: 44, border: `1px dashed ${T.border}`,
                      background: 'transparent', borderRadius: 8, color: T.text3,
                      fontSize: 13, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4
                    }}>+ 식사 추가</button>
                    }
                  </div>);

              })}
            </div>);

        })}
      </div>

      {/* Floating shopping CTA */}
      <div style={{
        position: 'absolute', bottom: 92, right: 16, zIndex: 20
      }}>
        <button style={{
          background: T.ink, color: '#fff', border: 'none',
          padding: '12px 18px', borderRadius: 9999, fontWeight: 700, fontSize: 14,
          boxShadow: T.shadowSharp, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 6
        }} onClick={onCreateShopping}>🛒 장보기 목록 만들기</button>
        <button style={{
          marginTop: 8, background: T.mint, color: '#fff', border: 'none',
          padding: '12px 18px', borderRadius: 9999, fontWeight: 700, fontSize: 14,
          boxShadow: T.shadowSharp, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 6
        }} onClick={onCookList}>🍳 요리하기</button>
      </div>
    </div>);

}

window.PlannerScreen = PlannerScreen;
