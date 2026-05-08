// ===== screens/pantry.jsx =====
// Pantry screen
const { useState: useState_PT } = React;

function PantryScreen({ pantry, setPantry, onOpenAdd, onOpenBundle }) {
  const [query, setQuery] = useState_PT('');
  const [activeCat, setActiveCat] = useState_PT('전체');
  const [selected, setSelected] = useState_PT(new Set());
  const categories = ['전체', ...PANTRY_CATEGORIES];
  const ownedEntries = Object.entries(pantry).filter(([, v]) => v.have);
  const sections = {};
  ownedEntries.forEach(([k, v]) => {
    if (query && !v.name.includes(query)) return;
    if (activeCat !== '전체' && v.section !== activeCat) return;
    if (!sections[v.section]) sections[v.section] = [];
    sections[v.section].push({ key: k, ...v });
  });

  const haveCount = ownedEntries.length;
  const total = PANTRY_ADD_ITEMS.length;
  const toggleSelected = (key) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };
  const deleteSelected = () => {
    setPantry(prev => {
      const next = { ...prev };
      selected.forEach(key => {
        if (next[key]) next[key] = { ...next[key], have: false };
      });
      return next;
    });
    setSelected(new Set());
    /* CONTRACT_CHECK: DELETE /pantry-items bulk — vNext에서는 UI shape만 */
  };

  return (
    <div style={{ background: T.surfaceFill, minHeight: '100%', paddingBottom: 100 }}>
      <AppBar title="팬트리" left={null} right={selected.size > 0 ? (
        <button onClick={deleteSelected} style={{
          background: T.red, border: 'none', cursor: 'pointer',
          fontSize: 12, fontWeight: 800, color: '#fff', padding: '7px 10px',
          borderRadius: 9999,
        }}>삭제 {selected.size}</button>
      ) : null} />

      {/* Hero */}
      <div style={{ background: '#fff', padding: '16px 20px 20px', borderBottom: `1px solid ${T.border}` }}>
        <div style={{ fontSize: 13, color: T.text3, marginBottom: 4 }}>냉장고에 있는 재료</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 14 }}>
          <div style={{ fontSize: 32, fontWeight: 700, color: T.ink, fontFamily: T.fontBrand }}>
            {haveCount}
          </div>
          <div style={{ fontSize: 16, color: T.text3 }}>/ {total}개</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8,
          background: T.surfaceFill, borderRadius: 20, padding: '0 16px', height: 44 }}>
          {Icon.search()}
          <input value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="재료 검색"
          style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none',
            fontSize: 14, color: T.ink, fontFamily: T.fontUI }} />
        </div>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingTop: 12 }}>
          {categories.map(cat => (
            <button key={cat} onClick={() => setActiveCat(cat)} style={{
              flexShrink: 0, padding: '7px 12px', borderRadius: 9999,
              border: activeCat === cat ? `1.5px solid ${T.mint}` : `1px solid ${T.border}`,
              background: activeCat === cat ? T.mintSoft : '#fff',
              color: activeCat === cat ? T.mintDeep : T.text2,
              fontSize: 12, fontWeight: 800, cursor: 'pointer',
            }}>{cat}</button>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
          <button onClick={onOpenAdd} style={{
            padding: '11px 12px', borderRadius: 10, border: 'none',
            background: T.mint, color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer',
          }}>재료 추가</button>
          <button onClick={onOpenBundle} style={{
            padding: '11px 12px', borderRadius: 10, border: `1px solid ${T.border}`,
            background: '#fff', color: T.text2, fontSize: 13, fontWeight: 800, cursor: 'pointer',
          }}>묶음 추가</button>
        </div>
      </div>

      {/* Sections */}
      <div style={{ padding: 16 }}>
        {Object.entries(sections).length === 0 ? (
          <div style={{ background: '#fff', borderRadius: 12, padding: 40, textAlign: 'center', color: T.text3, border: `1px solid ${T.border}` }}>
            보유한 재료가 없어요
          </div>
        ) : Object.entries(sections).map(([sec, items]) =>
        <div key={sec} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text2, padding: '4px 4px 10px' }}>
              {sec}
            </div>
            <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden',
            border: `1px solid ${T.border}` }}>
              {items.map((it, i) =>
            <div key={it.key} style={{
              display: 'flex', alignItems: 'center', padding: '14px 16px',
              borderBottom: i < items.length - 1 ? `1px solid ${T.surfaceSubtle}` : 'none',
              cursor: 'pointer'
            }} onClick={() => toggleSelected(it.key)}>
                  <div style={{
                width: 34, height: 34, borderRadius: 12,
                background: T.surfaceFill,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginRight: 12, fontSize: 20,
              }}>{PANTRY_IMAGES[it.name] || '🥬'}</div>
                  <div style={{
                width: 22, height: 22, borderRadius: 11,
                background: selected.has(it.key) ? T.mint : '#fff',
                border: selected.has(it.key) ? 'none' : `1.5px solid ${T.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginRight: 10,
              }}>{selected.has(it.key) && Icon.check()}</div>
                  <div style={{ flex: 1, fontSize: 15,
                color: T.ink,
                fontWeight: 700,
                textDecoration: 'none' }}>{it.name}</div>
                </div>
            )}
            </div>
          </div>
        )}
      </div>
    </div>);

}

window.PantryScreen = PantryScreen;

