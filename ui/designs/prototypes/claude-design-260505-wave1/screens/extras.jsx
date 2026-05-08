// ===== screens/extras.jsx =====
// ===== Extra screens — Phase 2 =====
// Shopping list, Cook list/run, Meal detail, MyPage subpages
const { useState: useState_X, useMemo: useMemo_X } = React;

// Utility — collect aggregated ingredients across selected planner slots
function aggregateIngredients(planner, selection, pantry) {
  const map = new Map();
  selection.forEach(({ date, slot, mealIndex }) => {
    const slotMeals = mealItems(planner[date]?.[slot]);
    const targets = mealIndex == null ? slotMeals : [slotMeals[mealIndex]].filter(Boolean);
    targets.forEach((meal) => {
      const recipe = RECIPES.find(r => r.id === meal.recipeId);
      if (!recipe) return;
      recipe.ingredients.forEach(ing => {
        const key = ing.name;
        const have = Object.values(pantry || {}).some(p => p.name === ing.name && p.have);
        if (!map.has(key)) {
          map.set(key, { name: ing.name, qty: ing.qty, section: ing.section, have, fromMeals: [] });
        }
        map.get(key).fromMeals.push(`${date} ${slot} · ${recipe.name}`);
      });
    });
  });
  return [...map.values()];
}

// ─────────────────────────────────────────────────────
// 장보기 목록 만들기
// ─────────────────────────────────────────────────────
function ShoppingCreateScreen({ planner, pantry, onBack, onAddToPantry, showToast }) {
  // step: 'select' (끼니 선택) → 'review' (재료 체크리스트)
  const [step, setStep] = useState_X('select');
  const days = Object.keys(planner);

  // Pre-select all uncooked meals by default
  const initialSel = [];
  days.forEach(d => {
    ['아침','점심','저녁'].forEach(s => {
      mealItems(planner[d]?.[s]).forEach((m, mealIndex) => {
        if (m.status !== 'cooked') initialSel.push({ date: d, slot: s, mealIndex });
      });
    });
  });
  const [selection, setSelection] = useState_X(initialSel);
  const [checked, setChecked] = useState_X(new Set());

  const items = useMemo_X(() => aggregateIngredients(planner, selection, pantry), [selection, planner, pantry]);
  const sectionsMap = items.reduce((acc, it) => {
    (acc[it.section] = acc[it.section] || []).push(it); return acc;
  }, {});
  const needed = items.filter(it => !it.have);
  const progress = needed.length ? Math.round([...checked].filter(k => needed.find(n => n.name === k)).length / needed.length * 100) : 0;

  const toggleSel = (date, slot, mealIndex) => {
    setSelection(s => {
      const exists = s.find(x => x.date === date && x.slot === slot && x.mealIndex === mealIndex);
      return exists ? s.filter(x => x !== exists) : [...s, { date, slot, mealIndex }];
    });
  };
  const toggleCheck = (name) => {
    setChecked(c => {
      const n = new Set(c);
      n.has(name) ? n.delete(name) : n.add(name);
      return n;
    });
  };

  if (step === 'select') {
    return (
      <div style={{ background: T.surfaceFill, minHeight: '100%', paddingBottom: 120 }}>
        <AppBar title="장보기 목록" left={<button onClick={onBack} style={iconBtn}>{Icon.chevL()}</button>} />

        <div style={{ background: '#fff', padding: 20, borderBottom: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 12, color: T.mintDeep, fontWeight: 700, marginBottom: 4 }}>STEP 1 / 2</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: T.ink, fontFamily: T.fontBrand }}>
            어떤 끼니의 재료를 살까요?
          </div>
          <div style={{ fontSize: 13, color: T.text3, marginTop: 6 }}>
            선택한 끼니의 재료를 자동으로 모아드려요
          </div>
        </div>

        <div style={{ padding: 16 }}>
          {days.map(d => {
            const day = planner[d] || {};
            const slots = ['아침','점심','저녁'];
            const hasAny = slots.some(s => mealItems(day[s]).length > 0);
            if (!hasAny) return null;
            return (
              <div key={d} style={{
                background: '#fff', borderRadius: 12, marginBottom: 12,
                border: `1px solid ${T.border}`, overflow: 'hidden',
              }}>
                <div style={{ padding: '10px 16px', fontSize: 13, fontWeight: 700, color: T.ink, background: T.surfaceFill }}>
                  {d}
                </div>
                {slots.map(s => {
                  const meals = mealItems(day[s]);
                  if (meals.length === 0) return null;
                  return meals.map((m, mealIndex) => {
                    const recipe = RECIPES.find(r => r.id === m.recipeId);
                    if (!recipe) return null;
                    const sel = selection.some(x => x.date === d && x.slot === s && x.mealIndex === mealIndex);
                    const cooked = m.status === 'cooked';
                    return (
                    <button key={`${s}-${mealIndex}`} disabled={cooked} onClick={() => toggleSel(d, s, mealIndex)} style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                      padding: '12px 16px', border: 'none', background: 'none',
                      borderTop: `1px solid ${T.surfaceSubtle}`, cursor: cooked ? 'default' : 'pointer',
                      opacity: cooked ? 0.5 : 1, textAlign: 'left',
                    }}>
                      <div style={{
                        width: 22, height: 22, borderRadius: 6,
                        background: sel ? T.mint : '#fff',
                        border: `1.5px solid ${sel ? T.mint : T.border}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>{sel && Icon.check('#fff')}</div>
                      <div style={{
                        width: 32, height: 32, borderRadius: 6, background: recipe.bg,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
                      }}>{recipe.emoji}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: T.ink }}>{recipe.name}</div>
                        <div style={{ fontSize: 11, color: T.text3 }}>
                          {s} · {m.servings}인분 {cooked && '· 요리 완료'}
                        </div>
                      </div>
                    </button>
                    );
                  });
                })}
              </div>
            );
          })}
        </div>

        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16,
          background: '#fff', borderTop: `1px solid ${T.border}`,
        }}>
          <Button full disabled={selection.length === 0} onClick={() => setStep('review')}>
            {selection.length}개 음식 재료 모으기
          </Button>
        </div>
      </div>
    );
  }

  // step === 'review'
  return (
    <div style={{ background: T.surfaceFill, minHeight: '100%', paddingBottom: 140 }}>
      <AppBar title="장보기 목록" left={<button onClick={() => setStep('select')} style={iconBtn}>{Icon.chevL()}</button>} />

      <div style={{ background: '#fff', padding: 20, borderBottom: `1px solid ${T.border}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div>
            <div style={{ fontSize: 12, color: T.mintDeep, fontWeight: 700, marginBottom: 4 }}>STEP 2 / 2</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: T.ink, fontFamily: T.fontBrand }}>
              {needed.length}개 재료를 사야 해요
            </div>
          </div>
          <div style={{ fontSize: 32, fontWeight: 700, color: T.mint, fontFamily: T.fontBrand }}>{progress}%</div>
        </div>
        <div style={{ height: 6, background: T.surfaceSubtle, borderRadius: 3, marginTop: 12, overflow: 'hidden' }}>
          <div style={{ width: `${progress}%`, height: '100%', background: T.mint, transition: 'width 0.2s' }} />
        </div>
      </div>

      <div style={{ padding: 16 }}>
        {Object.entries(sectionsMap).map(([sec, list]) => (
          <div key={sec} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: T.text3, fontWeight: 700, marginBottom: 8, padding: '0 4px' }}>
              {sec} <span style={{ color: T.text4 }}>· {list.length}</span>
            </div>
            <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', border: `1px solid ${T.border}` }}>
              {list.map((it, i) => {
                const isChecked = checked.has(it.name);
                return (
                  <button key={it.name} disabled={it.have} onClick={() => toggleCheck(it.name)} style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                    padding: '14px 16px', border: 'none', background: 'none', cursor: it.have ? 'default' : 'pointer',
                    borderBottom: i < list.length - 1 ? `1px solid ${T.surfaceSubtle}` : 'none',
                    textAlign: 'left',
                  }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: 11,
                      background: it.have ? T.mintSoft : (isChecked ? T.mint : '#fff'),
                      border: `1.5px solid ${it.have ? T.mint : (isChecked ? T.mint : T.border)}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>{(isChecked || it.have) && Icon.check(it.have ? T.mintDeep : '#fff')}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{
                        fontSize: 15, fontWeight: 600, color: it.have ? T.text4 : T.ink,
                        textDecoration: isChecked ? 'line-through' : 'none',
                      }}>{it.name}</div>
                      <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>
                        {it.qty} · {it.fromMeals.length}끼에 사용
                      </div>
                    </div>
                    {it.have ? (
                      <span style={{ fontSize: 11, fontWeight: 700, color: T.mintDeep, background: T.mintSoft, padding: '3px 8px', borderRadius: 4 }}>보유</span>
                    ) : (
                      <span style={{ fontSize: 11, color: T.text3 }}>{isChecked ? '담음' : ''}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16,
        background: '#fff', borderTop: `1px solid ${T.border}`,
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        <Button full disabled={needed.length === 0} onClick={() => {
          showToast('장보기 목록이 만들어졌어요');
          /* CONTRACT_CHECK: POST /shopping-lists — vNext에서는 UI shape만 */
        }}>
          장보기 목록 만들기
        </Button>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="neutral" onClick={() => { showToast('공유 링크가 복사됐어요'); }}>공유</Button>
          <Button full variant="neutral" disabled={checked.size === 0} onClick={() => onAddToPantry([...checked])}>
            담은 재료 팬트리에 추가 ({checked.size})
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// 장보기 → 팬트리 추가 모달
// ─────────────────────────────────────────────────────
function AddToPantryModal({ items, onClose, onConfirm }) {
  const [quantities, setQuantities] = useState_X(
    Object.fromEntries(items.map(n => [n, 1]))
  );

  return (
    <div style={overlay} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: '20px 20px 0 0',
        position: 'absolute', bottom: 0, left: 0, right: 0,
        maxHeight: '85%', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 20px 12px', borderBottom: `1px solid ${T.border}`,
        }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: T.ink, fontFamily: T.fontBrand }}>
              팬트리에 추가
            </div>
            <div style={{ fontSize: 12, color: T.text3, marginTop: 2 }}>
              담은 재료 {items.length}개를 보유 재료로 등록해요
            </div>
          </div>
          <button onClick={onClose} style={iconBtn}>{Icon.close()}</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {items.map(name => (
            <div key={name} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 0', borderBottom: `1px solid ${T.surfaceSubtle}`,
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 18, background: T.mintSoft,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
              }}>🥕</div>
              <div style={{ flex: 1, fontSize: 15, fontWeight: 600, color: T.ink }}>{name}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button onClick={() => setQuantities(q => ({ ...q, [name]: Math.max(1, (q[name]||1) - 1) }))}
                  style={qtyBtn}>−</button>
                <span style={{ minWidth: 24, textAlign: 'center', fontSize: 14, fontWeight: 700, color: T.ink }}>
                  {quantities[name] || 1}
                </span>
                <button onClick={() => setQuantities(q => ({ ...q, [name]: (q[name]||1) + 1 }))}
                  style={{ ...qtyBtn, background: T.mint, color: '#fff', border: 'none' }}>+</button>
              </div>
            </div>
          ))}
        </div>

        <div style={{ padding: 16, borderTop: `1px solid ${T.border}`, display: 'flex', gap: 8 }}>
          <Button variant="neutral" onClick={onClose}>취소</Button>
          <Button full onClick={() => onConfirm(quantities)}>추가하기</Button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// 요리하기 목록 (오늘/내일 끼니 카드)
// ─────────────────────────────────────────────────────
function CookListScreen({ planner, onBack, onStartCook, onOpenMeal }) {
  const days = Object.keys(planner);
  const todayK = days[todayIdx];
  const tomorrowK = days[todayIdx + 1];

  // Group: 오늘 / 내일 / 이후
  const groups = [
    ['오늘', [todayK]],
    ['내일', [tomorrowK]],
    ['이번 주 남은 끼니', days.slice(todayIdx + 2)],
  ];

  return (
    <div style={{ background: T.surfaceFill, minHeight: '100%', paddingBottom: 100 }}>
      <AppBar title="요리하기" left={<button onClick={onBack} style={iconBtn}>{Icon.chevL()}</button>} />

      <div style={{ background: '#fff', padding: 20, borderBottom: `1px solid ${T.border}` }}>
        <div style={{ fontSize: 13, color: T.text3, marginBottom: 4 }}>오늘 4월 23일 목요일</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: T.ink, fontFamily: T.fontBrand }}>
          어떤 요리부터 시작할까요?
        </div>
      </div>

      <div style={{ padding: 16 }}>
        {groups.map(([label, dayKeys]) => {
          const meals = [];
          dayKeys.forEach(d => {
            ['아침','점심','저녁'].forEach(s => {
              mealItems(planner[d]?.[s]).forEach((m, mealIndex) => {
                if (m.status !== 'cooked') meals.push({ date: d, slot: s, meal: m, mealIndex });
              });
            });
          });
          if (meals.length === 0 && label === '오늘') {
            return (
              <div key={label} style={{ marginBottom: 24 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.ink, marginBottom: 10 }}>{label}</div>
                <div style={{ background: '#fff', border: `1px solid ${T.border}`, borderRadius: 12, padding: 24, textAlign: 'center' }}>
                  <div style={{ fontSize: 36, marginBottom: 6 }}>✨</div>
                  <div style={{ fontSize: 14, color: T.text2, fontWeight: 600 }}>오늘 요리할 끼니가 없어요</div>
                  <div style={{ fontSize: 12, color: T.text3, marginTop: 4 }}>플래너에서 식단을 등록해 보세요</div>
                </div>
              </div>
            );
          }
          if (meals.length === 0) return null;

          return (
            <div key={label} style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.ink, marginBottom: 10 }}>
                {label} <span style={{ color: T.text3, fontWeight: 500 }}>· {meals.length}끼</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {meals.map(({ date, slot, meal, mealIndex }) => {
                  const recipe = RECIPES.find(r => r.id === meal.recipeId);
                  if (!recipe) return null;
                  const m = METHOD_COLORS[recipe.method] || METHOD_COLORS.prep;
                  return (
                    <div key={`${date}-${slot}-${mealIndex}`} style={{
                      background: '#fff', borderRadius: 12, overflow: 'hidden',
                      border: `1px solid ${T.border}`,
                      borderLeft: `4px solid ${m.border}`,
                    }}>
                      <div style={{ display: 'flex', padding: 14, gap: 12, alignItems: 'center' }}
                        onClick={() => onOpenMeal(date, slot)}>
                        <div style={{
                          width: 64, height: 64, borderRadius: 10, background: recipe.bg,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36,
                        }}>{recipe.emoji}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: m.text, background: m.bg, padding: '2px 6px', borderRadius: 4 }}>
                              {m.label}
                            </span>
                            <StatusPill status={meal.status} />
                          </div>
                          <div style={{ fontSize: 15, fontWeight: 700, color: T.ink, marginBottom: 2 }}>
                            {recipe.name}
                          </div>
                          <div style={{ fontSize: 11, color: T.text3 }}>
                            {date} {slot} #{mealIndex + 1} · {meal.servings}인분 · {recipe.minutes}분
                          </div>
                        </div>
                      </div>
                      <div style={{ padding: '0 14px 14px' }}>
                        <Button full onClick={() => onStartCook(date, slot, mealIndex)}>
                          🍳 요리 시작
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// 요리하기 진행 페이지
// ─────────────────────────────────────────────────────
function CookRunScreen({ date, slot, mealIndex = 0, planner, onBack, onComplete, showToast }) {
  const meal = mealItems(planner[date]?.[slot])[mealIndex];
  if (!meal) return <div style={{ padding: 40 }}>끼니를 찾을 수 없어요</div>;
  const recipe = RECIPES.find(r => r.id === meal.recipeId);
  const [showConsumed, setShowConsumed] = useState_X(false);
  const [confirmCancel, setConfirmCancel] = useState_X(false);

  return (
    <div style={{ background: '#0E1014', minHeight: '100%', color: '#fff', display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '52px 16px 14px',
      }}>
        <button onClick={() => setConfirmCancel(true)} style={{ ...iconBtn, background: 'rgba(255,255,255,0.1)' }}>{Icon.chevL('#fff')}</button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, opacity: 0.6, fontWeight: 600 }}>{recipe.name}</div>
          <div style={{ fontSize: 13, fontWeight: 700, fontFamily: T.fontBrand }}>
            {recipe.steps.length}단계
          </div>
        </div>
        <div style={{ width: 36 }} />
      </div>

      {/* All steps — scrollable */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px' }}>
        {recipe.steps.map((step, i) => {
          const m = METHOD_COLORS[step.method] || METHOD_COLORS.prep;
          return (
            <div key={i} style={{
              background: m.bg, borderRadius: 16, padding: 20, marginBottom: 12,
              color: '#1a1a2e', borderLeft: `5px solid ${m.border}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{
                  fontSize: 11, fontWeight: 800, color: '#fff', background: m.border,
                  padding: '3px 10px', borderRadius: 9999,
                }}>STEP {i + 1}</span>
                <span style={{
                  fontSize: 11, fontWeight: 700, color: m.text, background: '#fff',
                  padding: '3px 8px', borderRadius: 9999,
                }}>{m.label}</span>
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#1a1a2e', marginBottom: 8, fontFamily: T.fontBrand }}>
                {step.title}
              </div>
              <div style={{ fontSize: 15, color: '#1a1a2e', lineHeight: 1.6 }}>{step.body}</div>
            </div>
          );
        })}
      </div>

      {/* Bottom controls: 취소 + 요리완료 */}
      <div style={{
        padding: '12px 16px 28px', display: 'flex', gap: 8, alignItems: 'center',
        background: 'linear-gradient(180deg, transparent, rgba(0,0,0,0.5))',
      }}>
        <button onClick={() => setConfirmCancel(true)} style={{
          background: 'rgba(255,255,255,0.12)', color: '#fff', border: 'none',
          height: 56, padding: '0 20px', borderRadius: 12, fontSize: 14, fontWeight: 700,
          cursor: 'pointer',
        }}>취소</button>
        <button onClick={() => setShowConsumed(true)} style={{
          flex: 1, background: T.mint, color: '#fff', border: 'none',
          height: 56, borderRadius: 12, fontSize: 16, fontWeight: 800, cursor: 'pointer',
          fontFamily: T.fontBrand, letterSpacing: 0.5,
        }}>요리 완료</button>
      </div>

      {showConsumed && (
        <ConsumedIngredientSheet recipe={recipe}
          onClose={() => setShowConsumed(false)}
          onConfirm={(picked) => { setShowConsumed(false); onComplete(date, slot, picked, mealIndex); }} />
      )}
      {confirmCancel && (
        <ConfirmDialog title="요리를 취소할까요?"
          body="진행 중인 요리 기록이 사라져요."
          destructive confirmLabel="취소하기" cancelLabel="계속하기"
          onClose={() => setConfirmCancel(false)}
          onConfirm={() => { setConfirmCancel(false); onBack(); }} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────
// 플래너 끼니 상세
// ─────────────────────────────────────────────────────
const servingMiniBtn = {
  width: 28, height: 28, borderRadius: 14, border: 'none',
  background: '#fff', color: T.text2, fontSize: 16, fontWeight: 800, cursor: 'pointer',
};
const mealActionBtn = {
  padding: '10px 8px', borderRadius: 10, border: `1px solid ${T.border}`,
  background: '#fff', color: T.text2, fontSize: 12, fontWeight: 800, cursor: 'pointer',
};
function MealDetailScreen({ date, slot, planner, onBack, onOpenRecipe, onStartCook, onCreateShopping, onChangeStatus, onRemove, onChangeServings }) {
  const meals = mealItems(planner[date]?.[slot]);
  const [askDelete, setAskDelete] = useState_X(null);
  if (meals.length === 0) return <div style={{ padding: 40 }}>끼니를 찾을 수 없어요</div>;

  /* ─── Unified card renderer ─── */
  const MealCard = ({ meal, mealIndex }) => {
    const recipe = RECIPES.find(r => r.id === meal.recipeId);
    if (!recipe) return null;
    return (
      <div style={{
        background: '#fff', border: `1px solid ${T.border}`, borderRadius: 14,
        overflow: 'hidden', boxShadow: T.shadowNatural, position: 'relative',
      }}>
        {/* Trash icon — top-right */}
        <button aria-label="삭제" onClick={() => setAskDelete({ index: mealIndex, recipe })} style={{
          position: 'absolute', top: 12, right: 12, zIndex: 1,
          width: 32, height: 32, borderRadius: 16, border: 'none',
          background: T.surfaceFill, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>{Icon.trash(T.text3, 16)}</button>

        <div style={{ display: 'flex', gap: 12, padding: 14 }}>
          <div style={{
            width: 76, height: 76, borderRadius: 12, background: recipe.bg,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40,
            flexShrink: 0,
          }}>{recipe.emoji}</div>
          <div style={{ flex: 1, minWidth: 0, paddingRight: 28 }}>
            <button onClick={() => onOpenRecipe(recipe.id)} style={{
              background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left',
            }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: T.ink, marginBottom: 3 }}>
                {recipe.name}
              </div>
            </button>
            <div style={{ fontSize: 12, color: T.text3, marginBottom: 6 }}>
              {recipe.minutes}분 · {recipe.kcal}kcal · {meal.servings}인분
            </div>
          </div>
        </div>

        <div style={{ padding: '0 14px 14px' }}>
          {/* Servings stepper */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: 10, background: T.surfaceFill, borderRadius: 10, marginBottom: 10,
          }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: T.text2 }}>계획 인분</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button onClick={() => onChangeServings(date, slot, Math.max(1, meal.servings - 1), mealIndex)} style={servingMiniBtn}>−</button>
              <span style={{ fontSize: 16, fontWeight: 800, color: T.ink, minWidth: 42, textAlign: 'center' }}>{meal.servings}인분</span>
              <button onClick={() => onChangeServings(date, slot, Math.min(12, meal.servings + 1), mealIndex)} style={{ ...servingMiniBtn, background: T.mint, color: '#fff' }}>+</button>
            </div>
          </div>

          {/* Ingredient chips */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 12 }}>
            {recipe.ingredients.slice(0, 5).map(ing => (
              <span key={ing.name} style={{ fontSize: 11, color: T.text2, background: T.surfaceFill, padding: '5px 8px', borderRadius: 9999 }}>
                {ing.name}
              </span>
            ))}
            {recipe.ingredients.length > 5 && (
              <span style={{ fontSize: 11, color: T.text3, padding: '5px 2px' }}>+{recipe.ingredients.length - 5}</span>
            )}
          </div>

          {/* Actions: 장보기 + 요리하기 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button onClick={() => onCreateShopping(date, slot)} style={mealActionBtn}>장보기</button>
            <button onClick={() => onStartCook(date, slot, mealIndex)} style={{ ...mealActionBtn, background: T.mint, borderColor: T.mint, color: '#fff' }}>요리하기</button>
          </div>
        </div>
      </div>
    );
  };

  const totalServings = meals.reduce((sum, meal) => sum + (meal.servings || 1), 0);

  return (
    <div style={{ background: T.surfaceFill, minHeight: '100%', paddingBottom: 56 }}>
      <AppBar title={`${slot} 음식 ${meals.length > 1 ? meals.length + '개' : ''}`}
        left={<button onClick={onBack} style={iconBtn}>{Icon.chevL()}</button>} />

      <div style={{ background: '#fff', padding: 20, borderBottom: `1px solid ${T.border}` }}>
        <div style={{ fontSize: 12, color: T.mintDeep, fontWeight: 800, marginBottom: 4 }}>
          {date} · {slot}
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: T.ink, fontFamily: T.fontBrand }}>
          {meals.length > 1 ? '한 끼에 여러 음식을 같이 먹어요' : meals[0] && RECIPES.find(r => r.id === meals[0].recipeId)?.name}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: T.text2, background: T.surfaceFill, padding: '6px 10px', borderRadius: 9999 }}>
            {meals.length}개 음식
          </span>
          <span style={{ fontSize: 12, fontWeight: 700, color: T.text2, background: T.surfaceFill, padding: '6px 10px', borderRadius: 9999 }}>
            총 {totalServings}인분 계획
          </span>
        </div>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {meals.map((meal, mealIndex) => (
          <MealCard key={`${meal.recipeId}-${mealIndex}`} meal={meal} mealIndex={mealIndex} />
        ))}
      </div>

      {askDelete && (
        <ConfirmDialog title="이 음식을 삭제할까요?"
          body={`${askDelete.recipe.name} (${date} ${slot}) 가 식단에서 제거돼요.`}
          destructive confirmLabel="삭제"
          onClose={() => setAskDelete(null)}
          onConfirm={() => { const idx = askDelete.index; setAskDelete(null); onRemove(date, slot, idx); }} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────
// 마이페이지 세부 — 저장 레시피 / 계정 / 알림 / 도움말
// ─────────────────────────────────────────────────────
function MyPageSavedScreen({ savedIds, onBack, onOpenRecipe, toggleSaved }) {
  const list = RECIPES.filter(r => savedIds.includes(r.id));
  return (
    <div style={{ background: T.surfaceFill, minHeight: '100%', paddingBottom: 100 }}>
      <AppBar title="저장한 레시피" left={<button onClick={onBack} style={iconBtn}>{Icon.chevL()}</button>}
        right={<span style={{ fontSize: 13, color: T.text3 }}>{list.length}개</span>} />
      <div style={{ padding: 16 }}>
        {list.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: 12, padding: 40, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🔖</div>
            <div style={{ fontSize: 14, color: T.text3 }}>저장한 레시피가 없어요</div>
          </div>
        ) : list.map(r => (
          <div key={r.id} style={{
            background: '#fff', borderRadius: 12, marginBottom: 10, overflow: 'hidden',
            display: 'flex', alignItems: 'center', cursor: 'pointer',
            border: `1px solid ${T.border}`,
          }} onClick={() => onOpenRecipe(r.id)}>
            <div style={{
              width: 88, height: 88, background: r.bg,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 44,
              flexShrink: 0,
            }}>{r.emoji}</div>
            <div style={{ flex: 1, padding: '12px 14px' }}>
              <div style={{ fontSize: 11, color: T.mintDeep, fontWeight: 700 }}>{r.theme}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: T.ink, margin: '2px 0' }}>{r.name}</div>
              <div style={{ fontSize: 12, color: T.text3, display: 'flex', gap: 6, alignItems: 'center' }}>
                {Icon.star()} {r.rating} · {Icon.clock()} {r.minutes}분
              </div>
            </div>
            <button onClick={e => { e.stopPropagation(); toggleSaved(r.id); }} style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 14,
            }}>{Icon.bookmark(true)}</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function MyPageAccountScreen({ onBack }) {
  const fields = [
    ['이름', '채실장'],
    ['이메일', 'chae@homecook.app'],
    ['전화번호', '010-1234-5678'],
    ['생일', '1995-04-12'],
    ['요리 레벨', '레벨 5 · 집밥 러너'],
    ['가입일', '2025년 11월 3일'],
  ];
  return (
    <div style={{ background: T.surfaceFill, minHeight: '100%', paddingBottom: 100 }}>
      <AppBar title="계정 정보" left={<button onClick={onBack} style={iconBtn}>{Icon.chevL()}</button>} />
      <div style={{ padding: 16 }}>
        <div style={{ background: '#fff', borderRadius: 12, padding: '8px 0', border: `1px solid ${T.border}` }}>
          {fields.map(([k, v], i) => (
            <div key={k} style={{
              display: 'flex', alignItems: 'center', padding: '14px 16px',
              borderBottom: i < fields.length - 1 ? `1px solid ${T.surfaceSubtle}` : 'none',
            }}>
              <div style={{ fontSize: 13, color: T.text3, width: 100 }}>{k}</div>
              <div style={{ flex: 1, fontSize: 14, color: T.ink, fontWeight: 600 }}>{v}</div>
              {Icon.chevR()}
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Button variant="neutral">비밀번호 변경</Button>
          <Button variant="destructive" full>회원 탈퇴</Button>
        </div>
      </div>
    </div>
  );
}

function MyPageNotifScreen({ onBack }) {
  const [opts, setOpts] = useState_X({
    plannerReminder: true,
    cookTime: true,
    shoppingTime: true,
    weeklyReport: false,
    promo: false,
    marketing: false,
  });
  const items = [
    ['plannerReminder', '플래너 리마인드', '내일 끼니 전날 21시'],
    ['cookTime', '요리 시간 알림', '예상 시작 30분 전'],
    ['shoppingTime', '장보기 알림', '주말 오전 10시'],
    ['weeklyReport', '주간 요약 리포트', '일요일 저녁'],
    ['promo', '신메뉴 / 테마 추천', '주 1회'],
    ['marketing', '마케팅 알림', '이벤트 / 프로모션'],
  ];
  return (
    <div style={{ background: T.surfaceFill, minHeight: '100%', paddingBottom: 100 }}>
      <AppBar title="알림 설정" left={<button onClick={onBack} style={iconBtn}>{Icon.chevL()}</button>} />
      <div style={{ padding: 16 }}>
        <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', border: `1px solid ${T.border}` }}>
          {items.map(([k, l, sub], i) => {
            const on = opts[k];
            return (
              <div key={k} style={{
                display: 'flex', alignItems: 'center', padding: '14px 16px', gap: 12,
                borderBottom: i < items.length - 1 ? `1px solid ${T.surfaceSubtle}` : 'none',
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: T.ink }}>{l}</div>
                  <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>{sub}</div>
                </div>
                <button onClick={() => setOpts(o => ({ ...o, [k]: !o[k] }))} style={{
                  width: 48, height: 28, borderRadius: 14, border: 'none',
                  background: on ? T.mint : T.border, cursor: 'pointer', position: 'relative',
                  transition: 'background 0.15s',
                }}>
                  <div style={{
                    position: 'absolute', top: 2, left: on ? 22 : 2,
                    width: 24, height: 24, borderRadius: 12, background: '#fff',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)', transition: 'left 0.15s',
                  }} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MyPageHelpScreen({ onBack }) {
  const faqs = [
    ['플래너에 끼니를 어떻게 등록하나요?', '플래너 화면에서 비어 있는 슬롯의 +버튼을 누르거나, 레시피 상세에서 "플래너에 추가"를 누르면 등록할 수 있어요.'],
    ['장보기 목록은 어떻게 만들어지나요?', '플래너에 등록된 끼니의 재료를 자동으로 모아드려요. 보유 재료(팬트리)에 있는 것은 자동으로 빠집니다.'],
    ['요리하기 모드는 무엇인가요?', '레시피 스텝을 큰 화면 한 번에 하나씩 보여주는 모드예요. 타이머와 함께 조리 방법별로 색상이 적용됩니다.'],
    ['팬트리는 어떤 화면인가요?', '집에 있는 재료를 표시하는 화면이에요. 표시한 재료는 장보기 목록에서 자동으로 제외돼요.'],
  ];
  const [open, setOpen] = useState_X(0);
  return (
    <div style={{ background: T.surfaceFill, minHeight: '100%', paddingBottom: 100 }}>
      <AppBar title="도움말 · FAQ" left={<button onClick={onBack} style={iconBtn}>{Icon.chevL()}</button>} />
      <div style={{ padding: 16 }}>
        <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', border: `1px solid ${T.border}` }}>
          {faqs.map(([q, a], i) => (
            <div key={i} style={{
              borderBottom: i < faqs.length - 1 ? `1px solid ${T.surfaceSubtle}` : 'none',
            }}>
              <button onClick={() => setOpen(open === i ? -1 : i)} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '14px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
              }}>
                <span style={{
                  fontSize: 12, fontWeight: 700, color: T.mintDeep,
                  background: T.mintSoft, padding: '2px 8px', borderRadius: 4, flexShrink: 0,
                }}>Q</span>
                <span style={{ flex: 1, fontSize: 14, color: T.ink, fontWeight: 600 }}>{q}</span>
                <span style={{ transform: open === i ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
                  {Icon.chevD()}
                </span>
              </button>
              {open === i && (
                <div style={{
                  padding: '0 16px 14px 50px', fontSize: 13, color: T.text2, lineHeight: 1.6,
                }}>{a}</div>
              )}
            </div>
          ))}
        </div>

        <div style={{
          marginTop: 12, background: '#fff', borderRadius: 12, padding: 16,
          border: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: 22, background: T.mintSoft,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
          }}>💬</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>1:1 문의</div>
            <div style={{ fontSize: 12, color: T.text3 }}>평일 10시-18시 응답</div>
          </div>
          {Icon.chevR()}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Shared styles
// ─────────────────────────────────────────────────────
const overlay = {
  position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 100,
};
const iconBtn = {
  width: 32, height: 32, borderRadius: 16, border: 'none', background: 'transparent',
  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
};
const qtyBtn = {
  width: 28, height: 28, borderRadius: 14, border: `1px solid ${T.border}`,
  background: '#fff', color: T.ink, fontSize: 16, fontWeight: 700, cursor: 'pointer',
};

Object.assign(window, {
  ShoppingCreateScreen, AddToPantryModal, CookListScreen, CookRunScreen,
  MealDetailScreen, MyPageSavedScreen, MyPageAccountScreen, MyPageNotifScreen, MyPageHelpScreen,
});
