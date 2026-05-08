// ===== screens/mypage.jsx =====
// MyPage screen
function MyPageScreen({ savedIds, onOpenRecipe, onGoPage }) {
  const stats = [
  { k: 'cooked', l: '요리 완료', v: 24, c: T.mint },
  { k: 'books', l: '레시피북', v: 5, c: T.orange },
  { k: 'streak', l: '연속', v: 7, c: T.red }];

  return (
    <div style={{ background: T.surfaceFill, minHeight: '100%', paddingBottom: 100 }}>
      <AppBar title="마이페이지" left={null} right={null} />

      {/* Profile hero */}
      <div style={{ background: '#fff', padding: 20, borderBottom: `1px solid ${T.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 32,
            background: `linear-gradient(135deg, ${T.mint} 0%, ${T.teal} 100%)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 24, fontWeight: 700, fontFamily: T.fontBrand
          }}>채</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: T.ink }}>채실장</div>
            <div style={{ fontSize: 13, color: T.text3, marginTop: 2 }}>
              🍳 집밥 러너 · 레벨 5
            </div>
          </div>
          <button style={{
            padding: '8px 12px', background: T.surfaceFill, border: 'none',
            borderRadius: 8, fontSize: 12, fontWeight: 600, color: T.text2, cursor: 'pointer'
          }}>편집</button>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {stats.map((s) =>
          <div key={s.k} style={{
            flex: 1, background: T.surfaceFill, borderRadius: 10, padding: 12, textAlign: 'center'
          }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: s.c, fontFamily: T.fontBrand }}>{s.v}</div>
              <div style={{ fontSize: 12, color: T.text3, marginTop: 2 }}>{s.l}</div>
            </div>
          )}
        </div>
      </div>

      {/* Menu list */}
      <div style={{ padding: 16 }}>
        <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden',
          border: `1px solid ${T.border}` }}>
          {[
          ['📚', '레시피북', '5개', 'mypage-recipebook'],
          ['🛒', '장보기 기록', '12회', 'mypage-shopping'],
          ['🍱', '남은요리', '관리', 'leftovers'],
          ['🍽️', '다먹은 요리', '히스토리', 'ate-list'],
          ['⚙️', '환경설정', null, 'settings'],
          ['👤', '계정 정보', null, 'mypage-account'],
          ['🔔', '알림 설정', null, 'mypage-notif'],
          ['💬', '도움말 · FAQ', null, 'mypage-help']].
          map(([emoji, label, detail, page], i, arr) =>
          <div key={label} onClick={() => page && onGoPage && onGoPage(page)} style={{
            display: 'flex', alignItems: 'center', padding: '14px 16px',
            borderBottom: i < arr.length - 1 ? `1px solid ${T.surfaceSubtle}` : 'none',
            cursor: 'pointer'
          }}>
              <div style={{ fontSize: 18, width: 28 }}>{emoji}</div>
              <div style={{ flex: 1, fontSize: 15, color: T.ink }}>{label}</div>
              {detail && <div style={{ fontSize: 13, color: T.text3, marginRight: 8 }}>{detail}</div>}
              {Icon.chevR()}
            </div>
          )}
        </div>
      </div>
    </div>);

}

window.MyPageScreen = MyPageScreen;

