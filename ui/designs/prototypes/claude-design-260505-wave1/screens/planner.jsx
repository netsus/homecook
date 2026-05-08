// ===== screens/planner.jsx =====
// vNext S4 — Planner screen: week nav, emoji 제거, 상태 배지 제거, 요리하기 버튼 제거, 식사추가 모달
const { useState: useState_P } = React;

// vNext S4 — 식사 추가 옵션 모달 (모바일)
function MealAddModal({ date, slot, onClose, onMenuAdd, onGoManual }) {
  const [query, setQuery] = useState_P('');
  const options = [
    { id: 'recipebook', label: '레시피북에서 추가', icon: '📖' },
    { id: 'pantry',     label: '팬트리 기반 추천',  icon: '🧊' },
    { id: 'leftover',   label: '남은요리에서 추가',  icon: '🍱' },
    { id: 'youtube',    label: '유튜브에서 가져오기', icon: '🎬' },
    { id: 'manual',     label: '직접 등록',          icon: '✏️' },
  ];
  return (
    <Sheet title={`${date} ${slot} · 식사 추가`} onClose={onClose}>
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
          onFocus={() => { onClose(); onMenuAdd(date, slot); }}
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
            onClose();
            if (o.id === 'manual') {
              // CONTRACT_CHECK: 직접 등록 경로 — S5에서 직접 manual-create callback 연결 필요 — vNext에서는 UI shape만
              onGoManual?.(date, slot) || onMenuAdd(date, slot);
            } else {
              // S4는 기존 menu-add 라우트로 폴백
              onMenuAdd(date, slot);
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

function PlannerScreen({ planner, setPlanner, onOpenRecipe, onOpenPlannerAdd, onOpenMeal, onCreateShopping, onCookList, onMenuAdd, onGoManual }) {
  const keys = Object.keys(planner);
  const todayK = keys[todayIdx];
  // vNext S4 — week navigation (prototype: label만 변경, 데이터는 동일)
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

  return (
    <div style={{ background: T.surfaceFill, minHeight: '100%', paddingBottom: 100 }}>
      <AppBar title="플래너" />

      {/* vNext S4 — Week navigation + Summary */}
      <div style={{ background: '#fff', padding: '16px 20px', borderBottom: `1px solid ${T.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <button onClick={() => setWeekOffset(w => w - 1)} style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px',
            fontSize: 18, color: T.text2,
          }}>‹</button>
          <div style={{ fontSize: 14, color: T.text3, fontWeight: 600 }}>
            {weekOffset === 0 ? '이번 주' : weekOffset === 1 ? '다음 주' : weekOffset === -1 ? '지난 주' : ''} {weekLabel}
          </div>
          <button onClick={() => setWeekOffset(w => w + 1)} style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px',
            fontSize: 18, color: T.text2,
          }}>›</button>
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, color: T.ink, marginBottom: 12, fontFamily: T.fontBrand }}>
          {stats.total}개 음식 계획 중
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
          const slots = ['아침', '점심', '저녁'];
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
              {/* vNext S4 — Slot rows: 이모지 제거, 라벨 강화, 상태 배지·chevron 제거, + 음식 강화 */}
              {slots.map((slot) => {
                const meals = mealItems(day[slot]);
                const recipes = meals.map((meal) => RECIPES.find((r) => r.id === meal.recipeId)).filter(Boolean);
                return (
                  <div key={slot} style={{
                    display: 'flex', alignItems: 'center', padding: '10px 16px',
                    borderBottom: `1px solid ${T.surfaceSubtle}`,
                    cursor: recipes.length ? 'pointer' : 'default'
                  }} onClick={() => {
                    if (recipes.length) onOpenMeal(k, slot);
                  }}>
                    {/* vNext S4 — 이모지 제거, 라벨만 또렷하게 */}
                    <div style={{
                      width: 40, fontSize: 13, color: T.ink,
                      fontWeight: 700, flexShrink: 0,
                    }}>
                      {slot}
                    </div>
                    {recipes.length ?
                    <>
                        <div style={{ flex: 1, marginLeft: 12, minWidth: 0 }}>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
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
                        </div>
                        {/* vNext S4 — + 음식 버튼을 chevron 자리로 이동, 더 눈에 띄게 */}
                        <button onClick={(e) => { e.stopPropagation(); openMealAdd(k, slot); }} style={{
                          marginLeft: 8, border: `1.5px solid ${T.mint}`, background: T.mintSoft,
                          color: T.mintDeep, borderRadius: 8, padding: '5px 10px', fontSize: 12,
                          fontWeight: 700, cursor: 'pointer', flexShrink: 0,
                        }}>+ 음식</button>
                      </> :

                    <button onClick={() => openMealAdd(k, slot)} style={{
                      flex: 1, marginLeft: 12, height: 44, border: `1.5px dashed ${T.mint}`,
                      background: T.mintSoft, borderRadius: 8, color: T.mintDeep,
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
          onClose={() => setMealAddModal(null)}
          onMenuAdd={onMenuAdd}
          onGoManual={onGoManual}
        />
      )}
    </div>);

}

window.PlannerScreen = PlannerScreen;
window.MealAddModal = MealAddModal;
