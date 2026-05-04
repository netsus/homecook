// ===== Extra screens — Phase 2 =====
// Shopping list, Cook list/run, Meal detail, MyPage subpages
const { useState: useState_X, useMemo: useMemo_X } = React;

// Utility — collect aggregated ingredients across selected planner slots
function aggregateIngredients(planner, selection, pantry) {
  const map = new Map();
  selection.forEach(({ date, slot }) => {
    const meal = planner[date]?.[slot];
    if (!meal) return;
    const recipe = RECIPES.find(r => r.id === meal.recipeId);
    if (!recipe) return;
    recipe.ingredients.forEach(ing => {
      const key = ing.name;
      const have = Object.values(pantry || {}).some(p => p.name === ing.name && p.have);
      if (!map.has(key)) {
        map.set(key, { name: ing.name, qty: ing.qty, section: ing.section, have, fromMeals: [] });
      }
      map.get(key).fromMeals.push(`${date} ${slot}`);
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
      const m = planner[d]?.[s];
      if (m && m.status !== 'cooked') initialSel.push({ date: d, slot: s });
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

  const toggleSel = (date, slot) => {
    setSelection(s => {
      const exists = s.find(x => x.date === date && x.slot === slot);
      return exists ? s.filter(x => x !== exists) : [...s, { date, slot }];
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
            const slots = [['아침','🌅'],['점심','☀️'],['저녁','🌙']];
            const hasAny = slots.some(([s]) => day[s]);
            if (!hasAny) return null;
            return (
              <div key={d} style={{
                background: '#fff', borderRadius: 12, marginBottom: 12,
                border: `1px solid ${T.border}`, overflow: 'hidden',
              }}>
                <div style={{ padding: '10px 16px', fontSize: 13, fontWeight: 700, color: T.ink, background: T.surfaceFill }}>
                  {d}
                </div>
                {slots.map(([s, emo]) => {
                  const m = day[s];
                  if (!m) return null;
                  const recipe = RECIPES.find(r => r.id === m.recipeId);
                  const sel = selection.some(x => x.date === d && x.slot === s);
                  const cooked = m.status === 'cooked';
                  return (
                    <button key={s} disabled={cooked} onClick={() => toggleSel(d, s)} style={{
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
                      <span style={{ fontSize: 18 }}>{emo}</span>
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
            {selection.length}끼 재료 모으기
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
        display: 'flex', gap: 8,
      }}>
        <Button variant="neutral" onClick={() => { showToast('공유 링크가 복사됐어요'); }}>공유</Button>
        <Button full disabled={checked.size === 0} onClick={() => onAddToPantry([...checked])}>
          담은 재료 팬트리에 추가 ({checked.size})
        </Button>
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
              const m = planner[d]?.[s];
              if (m && m.status !== 'cooked') meals.push({ date: d, slot: s, meal: m });
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
                {meals.map(({ date, slot, meal }) => {
                  const recipe = RECIPES.find(r => r.id === meal.recipeId);
                  const m = METHOD_COLORS[recipe.method] || METHOD_COLORS.prep;
                  return (
                    <div key={date+slot} style={{
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
                            {date} {slot} · {meal.servings}인분 · {recipe.minutes}분
                          </div>
                        </div>
                      </div>
                      <div style={{ padding: '0 14px 14px' }}>
                        <Button full onClick={() => onStartCook(date, slot)}>
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
function CookRunScreen({ date, slot, planner, onBack, onComplete, showToast }) {
  const meal = planner[date]?.[slot];
  if (!meal) return <div style={{ padding: 40 }}>끼니를 찾을 수 없어요</div>;
  const recipe = RECIPES.find(r => r.id === meal.recipeId);
  const [stepIdx, setStepIdx] = useState_X(0);
  const [seconds, setSeconds] = useState_X(0);
  const [running, setRunning] = useState_X(true);

  React.useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [running]);

  const step = recipe.steps[stepIdx];
  const m = METHOD_COLORS[step.method] || METHOD_COLORS.prep;
  const fmt = (s) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;

  const next = () => {
    if (stepIdx < recipe.steps.length - 1) setStepIdx(stepIdx + 1);
    else onComplete(date, slot);
  };

  return (
    <div style={{ background: '#0E1014', minHeight: '100%', color: '#fff', display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '52px 16px 14px',
      }}>
        <button onClick={onBack} style={{ ...iconBtn, background: 'rgba(255,255,255,0.1)' }}>{Icon.chevL('#fff')}</button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 11, opacity: 0.6, fontWeight: 600 }}>{recipe.name}</div>
          <div style={{ fontSize: 13, fontWeight: 700, fontFamily: T.fontBrand }}>
            {stepIdx + 1} / {recipe.steps.length} 스텝
          </div>
        </div>
        <button onClick={() => showToast('레시피 노트 — 추후 구현')}
          style={{ ...iconBtn, background: 'rgba(255,255,255,0.1)' }}>📝</button>
      </div>

      {/* Progress dots */}
      <div style={{ display: 'flex', gap: 4, padding: '0 16px 12px' }}>
        {recipe.steps.map((s, i) => (
          <div key={i} style={{
            flex: 1, height: 3, borderRadius: 2,
            background: i <= stepIdx ? T.mint : 'rgba(255,255,255,0.15)',
          }} />
        ))}
      </div>

      {/* Big timer */}
      <div style={{ padding: '8px 16px 0', textAlign: 'center' }}>
        <div style={{ fontSize: 11, opacity: 0.5, fontWeight: 600, letterSpacing: 1 }}>경과 시간</div>
        <div style={{ fontSize: 56, fontWeight: 800, fontFamily: '"SF Mono", monospace', letterSpacing: 2, marginTop: 4 }}>
          {fmt(seconds)}
        </div>
        <div style={{ fontSize: 12, opacity: 0.6 }}>예상 {recipe.minutes}분 · 이번 스텝 약 {step.minutes}분</div>
      </div>

      {/* Step card */}
      <div style={{ flex: 1, padding: 16, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{
          background: m.bg, borderRadius: 20, padding: 24,
          color: '#1a1a2e', borderLeft: `6px solid ${m.border}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{
              fontSize: 12, fontWeight: 700, color: m.text, background: '#fff',
              padding: '4px 10px', borderRadius: 9999,
            }}>{m.label}</span>
            <span style={{ fontSize: 12, color: m.text, fontWeight: 600 }}>약 {step.minutes}분</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#1a1a2e', marginBottom: 10, fontFamily: T.fontBrand }}>
            {step.title}
          </div>
          <div style={{ fontSize: 16, color: '#1a1a2e', lineHeight: 1.55 }}>{step.body}</div>
        </div>

        {/* Mini ingredients hint */}
        <div style={{
          marginTop: 14, background: 'rgba(255,255,255,0.06)', padding: 12, borderRadius: 10,
          fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.5,
        }}>
          <span style={{ color: T.mint, fontWeight: 700 }}>이 단계 재료</span> · {recipe.ingredients.slice(0, 3).map(i => `${i.name} ${i.qty}`).join(', ')}…
        </div>
      </div>

      {/* Bottom controls */}
      <div style={{
        padding: '12px 16px 28px', display: 'flex', gap: 8, alignItems: 'center',
        background: 'linear-gradient(180deg, transparent, rgba(0,0,0,0.5))',
      }}>
        <button onClick={() => setStepIdx(Math.max(0, stepIdx - 1))} disabled={stepIdx === 0}
          style={{
            background: 'rgba(255,255,255,0.12)', color: '#fff', border: 'none',
            height: 56, padding: '0 18px', borderRadius: 12, fontSize: 14, fontWeight: 700,
            cursor: stepIdx === 0 ? 'default' : 'pointer', opacity: stepIdx === 0 ? 0.4 : 1,
          }}>이전</button>
        <button onClick={() => setRunning(r => !r)} style={{
          background: 'rgba(255,255,255,0.12)', color: '#fff', border: 'none',
          width: 56, height: 56, borderRadius: 28, fontSize: 18, cursor: 'pointer',
        }}>{running ? '⏸' : '▶'}</button>
        <button onClick={next} style={{
          flex: 1, background: T.mint, color: '#fff', border: 'none',
          height: 56, borderRadius: 12, fontSize: 16, fontWeight: 800, cursor: 'pointer',
          fontFamily: T.fontBrand, letterSpacing: 0.5,
        }}>{stepIdx === recipe.steps.length - 1 ? '✓ 요리 완료' : '다음 스텝 →'}</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// 플래너 끼니 상세
// ─────────────────────────────────────────────────────
function MealDetailScreen({ date, slot, planner, onBack, onOpenRecipe, onStartCook, onCreateShopping, onChangeStatus, onRemove }) {
  const meal = planner[date]?.[slot];
  const recipe = meal && RECIPES.find(r => r.id === meal.recipeId);
  if (!recipe) return <div style={{ padding: 40 }}>끼니를 찾을 수 없어요</div>;
  const m = METHOD_COLORS[recipe.method] || METHOD_COLORS.prep;

  const statusFlow = [
    { k: 'registered', l: '등록됨', emoji: '📝' },
    { k: 'shopped', l: '장보기 완료', emoji: '🛒' },
    { k: 'cooked', l: '요리 완료', emoji: '🍳' },
  ];

  return (
    <div style={{ background: T.surfaceFill, minHeight: '100%', paddingBottom: 120 }}>
      {/* Hero */}
      <div style={{
        position: 'relative', width: '100%', aspectRatio: '4/3',
        background: recipe.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 140,
      }}>
        {recipe.emoji}
        <button onClick={onBack} style={{
          position: 'absolute', top: 52, left: 16,
          width: 36, height: 36, borderRadius: 18, background: 'rgba(255,255,255,0.92)',
          border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>{Icon.chevL()}</button>
      </div>

      <div style={{ background: '#fff', padding: 20 }}>
        <div style={{ fontSize: 12, color: T.text3, fontWeight: 600, marginBottom: 4 }}>
          {date} · {slot}
        </div>
        <div style={{ fontSize: 24, fontWeight: 700, color: T.ink, marginBottom: 8, fontFamily: T.fontBrand }}>
          {recipe.name}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: m.text, background: m.bg, padding: '4px 10px', borderRadius: 9999 }}>
            {m.label}
          </span>
          <span style={{ fontSize: 12, color: T.text3 }}>{recipe.minutes}분 · {meal.servings}인분 · {recipe.kcal}kcal</span>
        </div>
        <button onClick={() => onOpenRecipe(recipe.id)} style={{
          background: T.surfaceFill, border: 'none', padding: '8px 12px',
          borderRadius: 6, fontSize: 12, color: T.text2, fontWeight: 600, cursor: 'pointer',
        }}>전체 레시피 보기 →</button>
      </div>

      {/* Status timeline */}
      <div style={{ background: '#fff', marginTop: 8, padding: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: T.ink, marginBottom: 14 }}>진행 상태</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {statusFlow.map((s, i) => {
            const order = statusFlow.findIndex(x => x.k === meal.status);
            const active = i <= order;
            return (
              <button key={s.k} onClick={() => onChangeStatus(date, slot, s.k)} style={{
                flex: 1, padding: '12px 8px', borderRadius: 10,
                border: active ? `1.5px solid ${T.mint}` : `1px solid ${T.border}`,
                background: active ? T.mintSoft : '#fff', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              }}>
                <span style={{ fontSize: 22 }}>{s.emoji}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: active ? T.mintDeep : T.text3 }}>{s.l}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Ingredients summary */}
      <div style={{ background: '#fff', marginTop: 8, padding: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: T.ink, marginBottom: 12 }}>
          필요 재료 <span style={{ color: T.text3, fontWeight: 500 }}>· {recipe.ingredients.length}개</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {recipe.ingredients.map(ing => (
            <span key={ing.name} style={{
              fontSize: 12, color: T.text2, background: T.surfaceFill,
              padding: '6px 10px', borderRadius: 9999, fontWeight: 500,
            }}>{ing.name} <b style={{ color: T.text3, fontWeight: 500 }}>{ing.qty}</b></span>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        padding: 16, background: '#fff', borderTop: `1px solid ${T.border}`,
        display: 'flex', gap: 8,
      }}>
        <Button variant="neutral" onClick={() => onCreateShopping(date, slot)}>🛒 장보기</Button>
        <Button full onClick={() => onStartCook(date, slot)}>🍳 요리 시작</Button>
      </div>
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
