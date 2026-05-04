// Shared components
const { useState, useEffect, useRef, useMemo } = React;

// Icons (simple SVG)
const Icon = {
  search: (c = T.text3) => (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="9" cy="9" r="6" stroke={c} strokeWidth="2"/><path d="M14 14l3 3" stroke={c} strokeWidth="2" strokeLinecap="round"/></svg>
  ),
  heart: (filled, c = T.text2) => filled
    ? <svg width="22" height="22" viewBox="0 0 24 24"><path d="M12 21s-7-4.5-9.5-9A5.5 5.5 0 0112 6a5.5 5.5 0 019.5 6c-2.5 4.5-9.5 9-9.5 9z" fill={T.red}/></svg>
    : <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M12 21s-7-4.5-9.5-9A5.5 5.5 0 0112 6a5.5 5.5 0 019.5 6c-2.5 4.5-9.5 9-9.5 9z" stroke={c} strokeWidth="2"/></svg>,
  bookmark: (filled, c = T.text2) => filled
    ? <svg width="20" height="20" viewBox="0 0 24 24"><path d="M6 3h12v18l-6-4-6 4V3z" fill={T.mint}/></svg>
    : <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M6 3h12v18l-6-4-6 4V3z" stroke={c} strokeWidth="2" strokeLinejoin="round"/></svg>,
  clock: (c = T.text3) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke={c} strokeWidth="2"/><path d="M12 7v5l3 2" stroke={c} strokeWidth="2" strokeLinecap="round"/></svg>
  ),
  star: (c = T.orange) => (
    <svg width="14" height="14" viewBox="0 0 24 24"><path d="M12 2l3 7 7 .5-5.5 4.5 2 7-6.5-4-6.5 4 2-7L2 9.5 9 9z" fill={c}/></svg>
  ),
  users: (c = T.text3) => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="9" cy="8" r="3" stroke={c} strokeWidth="2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke={c} strokeWidth="2" strokeLinecap="round"/><circle cx="17" cy="9" r="2.5" stroke={c} strokeWidth="2"/><path d="M15 14c3 0 6 1.5 6 4.5" stroke={c} strokeWidth="2" strokeLinecap="round"/></svg>
  ),
  plus: (c = '#fff') => <svg width="16" height="16" viewBox="0 0 24 24"><path d="M12 4v16M4 12h16" stroke={c} strokeWidth="2.5" strokeLinecap="round"/></svg>,
  close: (c = T.ink) => <svg width="20" height="20" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke={c} strokeWidth="2" strokeLinecap="round"/></svg>,
  chevR: (c = T.text3) => <svg width="8" height="14" viewBox="0 0 8 14"><path d="M1 1l6 6-6 6" stroke={c} strokeWidth="2" fill="none" strokeLinecap="round"/></svg>,
  chevL: (c = T.ink) => <svg width="10" height="16" viewBox="0 0 10 16"><path d="M8 1L2 8l6 7" stroke={c} strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  chevD: (c = T.ink) => <svg width="12" height="8" viewBox="0 0 12 8"><path d="M1 1l5 5 5-5" stroke={c} strokeWidth="2" fill="none" strokeLinecap="round"/></svg>,
  check: (c = '#fff') => <svg width="14" height="14" viewBox="0 0 24 24"><path d="M5 12l5 5 9-11" stroke={c} strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  home: (a, c) => <svg width="24" height="24" viewBox="0 0 24 24" fill={a?c:'none'}><path d="M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6h-6v6H4a1 1 0 01-1-1v-9z" stroke={c} strokeWidth="2" strokeLinejoin="round"/></svg>,
  cal: (a, c) => <svg width="24" height="24" viewBox="0 0 24 24" fill={a?c:'none'}><rect x="3" y="5" width="18" height="16" rx="2" stroke={c} strokeWidth="2"/><path d="M3 9h18M8 3v4M16 3v4" stroke={c} strokeWidth="2" strokeLinecap="round"/></svg>,
  fridge: (a, c) => <svg width="24" height="24" viewBox="0 0 24 24" fill={a?c:'none'}><rect x="5" y="3" width="14" height="18" rx="2" stroke={c} strokeWidth="2"/><path d="M5 11h14M8 7v1M8 14v2" stroke={c} strokeWidth="2" strokeLinecap="round"/></svg>,
  user: (a, c) => <svg width="24" height="24" viewBox="0 0 24 24" fill={a?c:'none'}><circle cx="12" cy="8" r="4" stroke={c} strokeWidth="2"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" stroke={c} strokeWidth="2" strokeLinecap="round"/></svg>,
  bag: (c = T.ink) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M5 8h14l-1 13H6L5 8z" stroke={c} strokeWidth="2" strokeLinejoin="round"/><path d="M9 8V5a3 3 0 016 0v3" stroke={c} strokeWidth="2"/></svg>,
  fire: (c = T.red) => <svg width="14" height="14" viewBox="0 0 24 24"><path d="M12 2s-4 4-4 8a4 4 0 004 4 4 4 0 004-4c0 4-4 8-4 8s-6-2-6-8c0-3 2-4 2-4s1 2 3 0c2-2 1-4 1-4z" fill={c}/></svg>,
  chef: (c = T.mint) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M6 13v6h12v-6M6 13a4 4 0 01-2-7 4 4 0 018-2 4 4 0 018 2 4 4 0 01-2 7" stroke={c} strokeWidth="2" strokeLinejoin="round"/></svg>,
};

function Chip({ children, active, onClick, style, compact }) {
  return (
    <button onClick={onClick} style={{
      padding: compact ? '6px 10px' : '8px 14px',
      borderRadius: 9999,
      background: active ? T.ink : T.surfaceSubtle,
      color: active ? '#fff' : T.text2,
      border: 'none',
      fontSize: compact ? 12 : 13,
      fontWeight: active ? 700 : 500,
      cursor: 'pointer',
      whiteSpace: 'nowrap',
      ...style,
    }}>{children}</button>
  );
}

function Button({ children, variant = 'primary', onClick, style, disabled, size = 'md', full }) {
  const vs = {
    primary: { bg: T.mint, color: '#fff', border: 'transparent' },
    secondary: { bg: 'transparent', color: T.mint, border: T.mint },
    neutral: { bg: T.surfaceFill, color: T.ink, border: 'transparent' },
    destructive: { bg: T.red, color: '#fff', border: 'transparent' },
    dark: { bg: T.ink, color: '#fff', border: 'transparent' },
  }[variant];
  const sizes = { sm: { h: 36, fs: 13, pad: '0 14px' }, md: { h: 48, fs: 16, pad: '0 24px' } }[size];
  const ds = disabled ? { bg: T.border, color: T.text4, border: 'transparent' } : vs;
  return (
    <button onClick={disabled ? undefined : onClick} style={{
      height: sizes.h, padding: sizes.pad, borderRadius: 8,
      background: ds.bg, color: ds.color, border: `1px solid ${ds.border}`,
      fontSize: sizes.fs, fontWeight: 700, cursor: disabled ? 'default' : 'pointer',
      width: full ? '100%' : undefined, fontFamily: T.fontUI,
      ...style,
    }}>{children}</button>
  );
}

function StatusPill({ status }) {
  const map = {
    registered: { label: '등록', bg: T.surfaceSubtle, fg: T.text2 },
    shopped: { label: '장보기 완료', bg: '#FFF4E1', fg: '#B8860B' },
    cooked: { label: '요리 완료', bg: T.mintSoft, fg: T.mintDeep },
  };
  const s = map[status] || map.registered;
  return (
    <span style={{
      background: s.bg, color: s.fg, fontSize: 10, fontWeight: 700,
      padding: '2px 6px', borderRadius: 4, letterSpacing: -0.2,
    }}>{s.label}</span>
  );
}

// Recipe card — large (used in Home feed)
function RecipeCard({ recipe, onClick, compact }) {
  if (compact) {
    return (
      <div onClick={onClick} style={{
        width: 160, flexShrink: 0, cursor: 'pointer',
      }}>
        <div style={{
          width: '100%', aspectRatio: '1/1', borderRadius: 12,
          background: recipe.bg, display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: 68, marginBottom: 8,
          boxShadow: T.shadowNatural,
        }}>{recipe.emoji}</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: T.ink, marginBottom: 2 }}>{recipe.name}</div>
        <div style={{ fontSize: 12, color: T.text3, display: 'flex', alignItems: 'center', gap: 4 }}>
          {Icon.clock()}{recipe.minutes}분
          <span style={{ margin: '0 3px' }}>·</span>
          {Icon.star()}{recipe.rating}
        </div>
      </div>
    );
  }
  return (
    <div onClick={onClick} style={{
      background: '#fff', borderRadius: 12, overflow: 'hidden',
      boxShadow: T.shadowDeep, cursor: 'pointer', marginBottom: 16,
    }}>
      <div style={{
        width: '100%', aspectRatio: '16/9', background: recipe.bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 96, position: 'relative',
      }}>
        {recipe.emoji}
        <div style={{
          position: 'absolute', top: 12, right: 12,
          width: 36, height: 36, borderRadius: 18,
          background: 'rgba(255,255,255,0.92)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>{Icon.bookmark(false)}</div>
        {recipe.saves > 2000 && (
          <div style={{
            position: 'absolute', top: 12, left: 12,
            background: T.red, color: '#fff', fontSize: 11, fontWeight: 700,
            padding: '4px 8px', borderRadius: 4,
          }}>🔥 인기</div>
        )}
      </div>
      <div style={{ padding: 16 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: T.ink, marginBottom: 4 }}>{recipe.name}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: T.text3, fontSize: 13, marginBottom: 10 }}>
          {Icon.star()} <span style={{ color: T.ink, fontWeight: 600 }}>{recipe.rating}</span>
          <span>({recipe.saves.toLocaleString()})</span>
          <span>·</span>
          {Icon.clock()} {recipe.minutes}분
          <span>·</span>
          {Icon.users()} {recipe.servings}인
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {recipe.tags.map(t => (
            <span key={t} style={{
              background: T.surfaceSubtle, color: T.text2, fontSize: 12, fontWeight: 500,
              padding: '4px 10px', borderRadius: 9999,
            }}>{t}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

// Bottom tab bar
function BottomTab({ tab, onTab }) {
  const items = [
    { id: 'home', label: '홈', icon: Icon.home },
    { id: 'planner', label: '플래너', icon: Icon.cal },
    { id: 'pantry', label: '팬트리', icon: Icon.fridge },
    { id: 'mypage', label: '마이', icon: Icon.user },
  ];
  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 40,
      background: '#fff', borderTop: `0.5px solid ${T.border}`,
      paddingTop: 8, paddingBottom: 28,
      display: 'flex', justifyContent: 'space-around',
    }}>
      {items.map(it => {
        const active = tab === it.id;
        const c = active ? T.mint : T.text3;
        return (
          <button key={it.id} onClick={() => onTab(it.id)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            padding: '4px 8px',
          }}>
            {it.icon(active, c)}
            <span style={{ fontSize: 11, fontWeight: active ? 700 : 500, color: c }}>{it.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// App bar (top)
function AppBar({ title, left, right, brand }) {
  return (
    <div style={{
      position: 'sticky', top: 0, background: '#fff', zIndex: 30,
      borderBottom: `0.5px solid ${T.border}`,
      padding: '10px 16px', display: 'flex', alignItems: 'center',
      minHeight: 52,
    }}>
      <div style={{ width: 32 }}>{left}</div>
      <div style={{
        flex: 1, textAlign: 'center',
        fontSize: brand ? 22 : 18, fontWeight: 700, color: T.ink,
        fontFamily: brand ? T.fontBrand : T.fontUI,
        letterSpacing: brand ? 0.5 : 0,
      }}>
        {brand ? <span style={{ color: T.mint }}>homecook</span> : title}
        {brand && <span style={{ color: T.ink }}>_</span>}
      </div>
      <div style={{ width: 32, textAlign: 'right' }}>{right}</div>
    </div>
  );
}

Object.assign(window, { Icon, Chip, Button, StatusPill, RecipeCard, BottomTab, AppBar });
