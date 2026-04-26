// Pantry screen
const { useState: useState_PT } = React;

function PantryScreen({ pantry, setPantry }) {
  const [query, setQuery] = useState_PT('');
  const sections = {};
  Object.entries(pantry).forEach(([k, v]) => {
    if (query && !v.name.includes(query)) return;
    if (!sections[v.section]) sections[v.section] = [];
    sections[v.section].push({ key: k, ...v });
  });

  const haveCount = Object.values(pantry).filter(v => v.have).length;
  const total = Object.keys(pantry).length;

  return (
    <div style={{ background: T.surfaceFill, minHeight: '100%', paddingBottom: 100 }}>
      <AppBar title="팬트리" left={null} right={<span style={{ fontSize: 20, color: T.text2 }}>+</span>} />

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
          <input value={query} onChange={e => setQuery(e.target.value)}
            placeholder="재료 검색"
            style={{ flex: 1, border: 'none', background: 'transparent', outline: 'none',
              fontSize: 14, color: T.ink, fontFamily: T.fontUI }} />
        </div>
      </div>

      {/* Sections */}
      <div style={{ padding: 16 }}>
        {Object.entries(sections).map(([sec, items]) => (
          <div key={sec} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text2, padding: '4px 4px 10px' }}>
              {sec}
            </div>
            <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden',
              border: `1px solid ${T.border}` }}>
              {items.map((it, i) => (
                <div key={it.key} style={{
                  display: 'flex', alignItems: 'center', padding: '14px 16px',
                  borderBottom: i < items.length - 1 ? `1px solid ${T.surfaceSubtle}` : 'none',
                  cursor: 'pointer',
                }} onClick={() => {
                  setPantry({ ...pantry, [it.key]: { ...pantry[it.key], have: !it.have } });
                }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: 12,
                    background: it.have ? T.mint : '#fff',
                    border: it.have ? 'none' : `2px solid ${T.border}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginRight: 12,
                  }}>{it.have && Icon.check()}</div>
                  <div style={{ flex: 1, fontSize: 15,
                    color: it.have ? T.ink : T.text3,
                    fontWeight: it.have ? 600 : 400,
                    textDecoration: 'none' }}>{it.name}</div>
                  {it.have && <span style={{ fontSize: 11, color: T.mintDeep, fontWeight: 600 }}>보유</span>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

window.PantryScreen = PantryScreen;
