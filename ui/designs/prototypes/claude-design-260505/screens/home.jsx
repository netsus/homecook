// Home screen
const { useState: useState_H, useMemo: useMemo_H } = React;

function HomeScreen({ onOpenRecipe, sortBy, setSortBy, ingFilter, setIngFilter, showSortSheet, setShowSortSheet }) {
  const [query, setQuery] = useState_H('');
  const [activeTheme, setActiveTheme] = useState_H(null);

  const sorted = useMemo_H(() => {
    let list = [...RECIPES];
    if (query) list = list.filter(r => r.name.includes(query));
    if (activeTheme) list = list.filter(r => r.theme === activeTheme);
    if (ingFilter.length > 0) {
      // loose filter based on ingredient section
      list = list.filter(r => {
        const names = r.ingredients.map(i => i.name).join(' ');
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
    if (sortBy === 'rating') list.sort((a,b) => b.rating - a.rating);
    if (sortBy === 'saves') list.sort((a,b) => b.saves - a.saves);
    if (sortBy === 'fast') list.sort((a,b) => a.minutes - b.minutes);
    return list;
  }, [query, activeTheme, ingFilter, sortBy]);

  const sortLabel = { latest: '최신순', rating: '별점순', saves: '저장순', fast: '빠른 조리순' }[sortBy];

  return (
    <div style={{ background: '#fff', minHeight: '100%', paddingBottom: 100 }}>
      <AppBar brand right={Icon.bag()} left={<div style={{
        width: 32, height: 32, borderRadius: 16, background: T.mint, color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 13, fontWeight: 700,
      }}>채</div>} />

      {/* Hero greeting */}
      <div style={{ padding: '16px 16px 12px', background: '#fff' }}>
        <div style={{ fontSize: 14, color: T.text3, marginBottom: 2 }}>목요일 저녁,</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: T.ink, fontFamily: T.fontBrand }}>
          오늘은 뭐 해먹지?
        </div>
      </div>

      {/* Search */}
      <div style={{ padding: '4px 16px 12px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: T.surfaceFill, borderRadius: 20,
          padding: '0 16px', height: 44,
        }}>
          {Icon.search()}
          <input
            value={query} onChange={e => setQuery(e.target.value)}
            placeholder="김치볶음밥, 된장찌개…"
            style={{
              flex: 1, border: 'none', background: 'transparent',
              fontSize: 14, color: T.ink, outline: 'none', fontFamily: T.fontUI,
            }}
          />
        </div>
      </div>

      {/* Ingredient filter row */}
      <div style={{ padding: '4px 16px 16px', display: 'flex', gap: 8, overflowX: 'auto' }}>
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

      {/* Theme carousel (H1 compact horizontal strip, 1.5장 peek) */}
      <div style={{ padding: '12px 0 20px' }}>
        <div style={{ padding: '0 16px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: T.ink }}>테마별 레시피</div>
          <div style={{ fontSize: 12, color: T.text3 }}>전체보기 ›</div>
        </div>
        <div style={{ display: 'flex', gap: 10, overflowX: 'auto', padding: '0 16px 4px', scrollbarWidth: 'none' }}>
          {THEMES.map(t => {
            const active = activeTheme === t.name;
            return (
              <div key={t.id} onClick={() => setActiveTheme(active ? null : t.name)} style={{
                flexShrink: 0, width: 140, height: 92, borderRadius: 14,
                background: t.bg, padding: 12, cursor: 'pointer',
                display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                border: active ? `2px solid ${T.mint}` : '2px solid transparent',
                boxShadow: T.shadowNatural,
              }}>
                <div style={{ fontSize: 30 }}>{t.emoji}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.ink, fontFamily: T.fontBrand }}>
                  {t.name}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Promo strip */}
      <div style={{ padding: '0 16px 20px' }}>
        <div style={{
          background: `linear-gradient(135deg, ${T.mint} 0%, ${T.teal} 100%)`,
          borderRadius: 12, padding: 16, display: 'flex', alignItems: 'center',
          color: '#fff', gap: 12,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, opacity: 0.9, marginBottom: 2 }}>이번 주 식단 플래너</div>
            <div style={{ fontSize: 16, fontWeight: 700, fontFamily: T.fontBrand }}>
              오늘 저녁까지 2끼 남았어요
            </div>
          </div>
          <div style={{ fontSize: 32 }}>🍳</div>
        </div>
      </div>

      {/* All recipes with sort */}
      <div style={{ padding: '0 16px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: T.ink }}>
          모든 레시피 <span style={{ color: T.text3, fontSize: 14, fontWeight: 500 }}>({sorted.length})</span>
        </div>
        <button onClick={() => setShowSortSheet(true)} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 4, color: T.text2,
          fontSize: 13, fontWeight: 600,
        }}>
          {sortLabel} {Icon.chevD(T.text2)}
        </button>
      </div>

      <div style={{ padding: '0 16px' }}>
        {sorted.map(r => (
          <RecipeCard key={r.id} recipe={r} onClick={() => onOpenRecipe(r.id)} />
        ))}
        {sorted.length === 0 && (
          <div style={{ padding: '48px 16px', textAlign: 'center', color: T.text3 }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>🍽️</div>
            <div style={{ fontSize: 14 }}>조건에 맞는 레시피가 없어요</div>
          </div>
        )}
      </div>
    </div>
  );
}

window.HomeScreen = HomeScreen;
