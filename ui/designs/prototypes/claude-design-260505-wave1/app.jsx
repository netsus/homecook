const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "accentColor": "#2AC1BC",
  "showBrandFont": true,
  "density": "comfortable"
}/*EDITMODE-END*/;

function App() {
  const { useState, useEffect } = React;
  // persisted route
  const [route, setRoute] = useState(() => {
    try { return JSON.parse(localStorage.getItem('hc_route')) || { tab: 'home' }; }
    catch { return { tab: 'home' }; }
  });
  useEffect(() => { localStorage.setItem('hc_route', JSON.stringify(route)); }, [route]);

  const [planner, setPlanner] = useState(makeInitialPlanner());
  const [pantry, setPantry] = useState(INITIAL_PANTRY);
  const [savedIds, setSavedIds] = useState(['r1', 'r2', 'r4']);
  const [sortBy, setSortBy] = useState('rating');
  const [ingFilter, setIngFilter] = useState([]);

  // Modals
  const [plannerAdd, setPlannerAdd] = useState(null); // { recipeId, presetDate?, presetSlot? }
  const [saveModal, setSaveModal] = useState(null);
  const [sortSheet, setSortSheet] = useState(false);
  const [loginGate, setLoginGate] = useState(false);
  const [toast, setToast] = useState('');

  // Tweaks
  const [tweaks, setTweaks] = useState(TWEAK_DEFAULTS);
  const [tweaksOn, setTweaksOn] = useState(false);

  useEffect(() => {
    const onMsg = (e) => {
      if (e.data?.type === '__activate_edit_mode') setTweaksOn(true);
      if (e.data?.type === '__deactivate_edit_mode') setTweaksOn(false);
    };
    window.addEventListener('message', onMsg);
    window.parent.postMessage({ type: '__edit_mode_available' }, '*');
    return () => window.removeEventListener('message', onMsg);
  }, []);

  // Apply accent color
  useEffect(() => {
    window.T.mint = tweaks.accentColor;
  }, [tweaks.accentColor]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2000);
  };

  const toggleSaved = (id) => {
    setSavedIds(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  };

  // Routing helpers
  const goTab = (tab) => setRoute({ tab });
  const openRecipe = (id) => setRoute({ ...route, detail: id });
  const backFromDetail = () => setRoute({ ...route, detail: null });

  // Content
  let content;
  if (route.detail) {
    content = (
      <RecipeDetail
        recipeId={route.detail}
        onBack={backFromDetail}
        onOpenPlannerAdd={() => setPlannerAdd({ recipeId: route.detail })}
        onOpenSave={() => setSaveModal({ recipeId: route.detail })}
        saved={savedIds.includes(route.detail)}
        toggleSaved={() => toggleSaved(route.detail)}
      />
    );
  } else if (route.tab === 'home') {
    content = (
      <HomeScreen
        onOpenRecipe={openRecipe}
        sortBy={sortBy} setSortBy={setSortBy}
        ingFilter={ingFilter} setIngFilter={setIngFilter}
        showSortSheet={sortSheet} setShowSortSheet={setSortSheet}
      />
    );
  } else if (route.tab === 'planner') {
    content = (
      <PlannerScreen
        planner={planner} setPlanner={setPlanner}
        onOpenRecipe={openRecipe}
        onOpenPlannerAdd={(date, slot) => setPlannerAdd({ recipeId: 'r1', presetDate: date, presetSlot: slot })}
      />
    );
  } else if (route.tab === 'pantry') {
    content = <PantryScreen pantry={pantry} setPantry={setPantry} />;
  } else if (route.tab === 'mypage') {
    content = <MyPageScreen savedIds={savedIds} onOpenRecipe={openRecipe} />;
  }

  const fontBase = tweaks.density === 'compact' ? 13 : 14;

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'flex-start',
      justifyContent: 'center', padding: 40, gap: 40,
      background: '#E9ECEF',
    }}>
      <div style={{ position: 'relative' }}>
        <IOSDevice>
          <div style={{ height: '100%', position: 'relative', overflow: 'hidden', background: '#fff' }}>
            <div style={{ height: '100%', overflowY: 'auto' }}>
              {content}
            </div>
            {!route.detail && <BottomTab tab={route.tab} onTab={goTab} />}
            {plannerAdd && (
              <PlannerAddPopup
                recipeId={plannerAdd.recipeId}
                planner={planner}
                onClose={() => setPlannerAdd(null)}
                onConfirm={(date, slot, qty) => {
                  setPlanner(p => ({
                    ...p,
                    [date]: { ...p[date], [slot]: { recipeId: plannerAdd.recipeId, status: 'registered', servings: qty } },
                  }));
                  setPlannerAdd(null);
                  showToast(`${date} ${slot}에 추가됐어요`);
                }}
              />
            )}
            {saveModal && (
              <SavePopup
                recipeId={saveModal.recipeId}
                saved={savedIds.includes(saveModal.recipeId)}
                onClose={() => setSaveModal(null)}
                onConfirm={() => {
                  toggleSaved(saveModal.recipeId);
                  setSaveModal(null);
                  showToast(savedIds.includes(saveModal.recipeId) ? '저장이 해제됐어요' : '저장됐어요');
                }}
              />
            )}
            {sortSheet && (
              <SortSheet value={sortBy} onChange={setSortBy} onClose={() => setSortSheet(false)} />
            )}
            {loginGate && (
              <LoginGate onClose={() => setLoginGate(false)} onLogin={() => { setLoginGate(false); showToast('로그인됨'); }} />
            )}
            <Toast message={toast} />
          </div>
        </IOSDevice>
        <div style={{
          position: 'absolute', bottom: -30, left: 0, right: 0, textAlign: 'center',
          fontSize: 12, color: '#868E96',
        }}>
          {route.detail ? `${RECIPES.find(r => r.id === route.detail)?.name}` : {
            home: '홈', planner: '플래너', pantry: '팬트리', mypage: '마이페이지',
          }[route.tab]}
        </div>
      </div>

      {/* Side panel — quick jump */}
      <div style={{
        background: '#fff', borderRadius: 14, padding: 20, width: 260,
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)', alignSelf: 'flex-start', marginTop: 20,
      }}>
        <div style={{ fontSize: 11, color: '#868E96', fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>
          HOMECOOK_ PROTOTYPE
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#212529', marginBottom: 4, fontFamily: '"Jua", sans-serif', letterSpacing: 0.4 }}>
          배민 스타일 리디자인
        </div>
        <div style={{ fontSize: 12, color: '#868E96', lineHeight: 1.5, marginBottom: 16 }}>
          화면정의서 v1.5.0 기반 · 5개 메인 화면 + 3개 모달
        </div>
        <div style={{ fontSize: 11, color: '#868E96', fontWeight: 700, marginBottom: 8 }}>화면 이동</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
          {[
            ['home', '🏠 홈', '테마/검색/필터/정렬'],
            ['planner', '📅 플래너', '주간 식단 카드'],
            ['pantry', '🧊 팬트리', '재료 보유 체크'],
            ['mypage', '👤 마이', '프로필/저장 레시피'],
          ].map(([k, l, d]) => (
            <button key={k} onClick={() => setRoute({ tab: k })} style={{
              textAlign: 'left', padding: '10px 12px',
              background: route.tab === k && !route.detail ? '#E6F8F7' : '#F8F9FA',
              border: route.tab === k && !route.detail ? '1px solid #2AC1BC' : '1px solid transparent',
              borderRadius: 8, cursor: 'pointer',
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#212529' }}>{l}</div>
              <div style={{ fontSize: 11, color: '#868E96', marginTop: 1 }}>{d}</div>
            </button>
          ))}
        </div>
        <div style={{ fontSize: 11, color: '#868E96', fontWeight: 700, marginBottom: 8 }}>빠른 플로우</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <button onClick={() => { setRoute({ tab: 'home', detail: 'r4' }); }}
            style={quickBtn}>🥩 제육볶음 레시피 보기</button>
          <button onClick={() => { setRoute({ tab: 'home', detail: 'r4' }); setTimeout(() => setPlannerAdd({ recipeId: 'r4' }), 300); }}
            style={quickBtn}>📥 플래너 추가 시트</button>
          <button onClick={() => { setRoute({ tab: 'home', detail: 'r4' }); setTimeout(() => setSaveModal({ recipeId: 'r4' }), 300); }}
            style={quickBtn}>🔖 저장 시트</button>
          <button onClick={() => { setRoute({ tab: 'home' }); setTimeout(() => setSortSheet(true), 200); }}
            style={quickBtn}>⇅ 정렬 시트</button>
          <button onClick={() => setLoginGate(true)}
            style={quickBtn}>🔒 로그인 게이트</button>
        </div>
      </div>

      {/* Tweaks */}
      {tweaksOn && (
        <div className="tweaks-panel">
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, color: '#212529' }}>Tweaks</div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: '#495057', fontWeight: 600, marginBottom: 6 }}>
              포인트 컬러
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {[
                ['#2AC1BC', '민트'],
                ['#12B886', '틸'],
                ['#FF6B6B', '토마토'],
                ['#FFB347', '오렌지'],
                ['#343A40', '먹색'],
              ].map(([c, n]) => (
                <button key={c} onClick={() => {
                  setTweaks(t => ({ ...t, accentColor: c }));
                  window.parent.postMessage({ type: '__edit_mode_set_keys', edits: { accentColor: c } }, '*');
                }} style={{
                  width: 32, height: 32, borderRadius: 16, background: c,
                  border: tweaks.accentColor === c ? '2px solid #212529' : '2px solid transparent',
                  cursor: 'pointer',
                }} title={n} />
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#495057', fontWeight: 600 }}>
              <input type="checkbox" checked={tweaks.showBrandFont}
                onChange={e => {
                  setTweaks(t => ({ ...t, showBrandFont: e.target.checked }));
                  window.parent.postMessage({ type: '__edit_mode_set_keys', edits: { showBrandFont: e.target.checked } }, '*');
                }} />
              브랜드 폰트 (Jua)
            </label>
          </div>

          <div>
            <div style={{ fontSize: 12, color: '#495057', fontWeight: 600, marginBottom: 6 }}>밀도</div>
            <div style={{ display: 'flex', gap: 4 }}>
              {['compact', 'comfortable'].map(d => (
                <button key={d} onClick={() => {
                  setTweaks(t => ({ ...t, density: d }));
                  window.parent.postMessage({ type: '__edit_mode_set_keys', edits: { density: d } }, '*');
                }} style={{
                  flex: 1, padding: '6px 10px', fontSize: 11, borderRadius: 6,
                  background: tweaks.density === d ? '#212529' : '#F8F9FA',
                  color: tweaks.density === d ? '#fff' : '#495057',
                  border: 'none', cursor: 'pointer', fontWeight: 600,
                }}>{d}</button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const quickBtn = {
  textAlign: 'left', padding: '8px 10px', fontSize: 12,
  background: '#fff', border: '1px solid #DEE2E6', borderRadius: 6,
  cursor: 'pointer', color: '#495057',
};

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
