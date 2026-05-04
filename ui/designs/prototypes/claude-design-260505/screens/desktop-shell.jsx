// Desktop shell — SideNav + content area + optional right rail
function DesktopShell({ tab, onTab, children, brand = true, showLogin }) {
  const items = [
    { id: 'home', label: '홈', icon: Icon.home, hint: '레시피 탐색' },
    { id: 'planner', label: '플래너', icon: Icon.cal, hint: '주간 식단' },
    { id: 'pantry', label: '팬트리', icon: Icon.fridge, hint: '재료 관리' },
    { id: 'mypage', label: '마이', icon: Icon.user, hint: '내 활동' },
  ];
  return (
    <div style={{
      minHeight: '100vh', background: T.surfaceFill, display: 'flex',
      fontFamily: T.fontUI, color: T.ink,
    }}>
      {/* Sidebar */}
      <aside style={{
        width: 240, flexShrink: 0, background: '#fff',
        borderRight: `1px solid ${T.border}`,
        position: 'sticky', top: 0, height: '100vh',
        display: 'flex', flexDirection: 'column',
        padding: '24px 16px',
      }}>
        <div style={{
          fontSize: 26, fontWeight: 700, color: T.mint,
          fontFamily: T.fontBrand, letterSpacing: 0.5,
          padding: '0 8px 24px',
        }}>
          homecook<span style={{ color: T.ink }}>_</span>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {items.map(it => {
            const active = tab === it.id;
            return (
              <button key={it.id} onClick={() => onTab(it.id)} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 12px', borderRadius: 10,
                background: active ? T.mintSoft : 'transparent',
                color: active ? T.mintDeep : T.text2,
                border: 'none', cursor: 'pointer', textAlign: 'left',
                fontWeight: active ? 700 : 500, fontSize: 14,
              }}>
                {it.icon(active, active ? T.mintDeep : T.text2)}
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span>{it.label}</span>
                  <span style={{ fontSize: 11, color: active ? T.mintDeep : T.text3, fontWeight: 500, opacity: 0.85 }}>{it.hint}</span>
                </div>
              </button>
            );
          })}
        </nav>

        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button onClick={showLogin} style={{
            background: T.mint, color: '#fff', border: 'none', borderRadius: 8,
            padding: '12px 16px', fontWeight: 700, fontSize: 14, cursor: 'pointer',
          }}>로그인</button>
          <div style={{ fontSize: 11, color: T.text4, padding: '4px 8px' }}>
            v1.5.0 · 배민 리디자인
          </div>
        </div>
      </aside>

      {/* Top bar + content */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <header style={{
          height: 64, background: '#fff', borderBottom: `1px solid ${T.border}`,
          display: 'flex', alignItems: 'center', padding: '0 32px', gap: 16,
          position: 'sticky', top: 0, zIndex: 20,
        }}>
          <div style={{
            flex: 1, maxWidth: 480, display: 'flex', alignItems: 'center', gap: 8,
            background: T.surfaceFill, borderRadius: 10, padding: '10px 14px',
          }}>
            {Icon.search()}
            <input
              placeholder="레시피, 재료 검색"
              style={{
                flex: 1, border: 'none', background: 'transparent', outline: 'none',
                fontSize: 14, fontFamily: T.fontUI, color: T.ink,
              }}
            />
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 16 }}>
            <button style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 13, color: T.text2, fontWeight: 600,
            }}>도움말</button>
            <button style={{
              width: 36, height: 36, borderRadius: 18,
              background: T.mintSoft, color: T.mintDeep,
              border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13,
            }}>U</button>
          </div>
        </header>

        <main style={{
          flex: 1, padding: '24px 32px 64px',
          maxWidth: 1200, width: '100%', margin: '0 auto',
        }}>
          {children}
        </main>
      </div>
    </div>
  );
}

window.DesktopShell = DesktopShell;
