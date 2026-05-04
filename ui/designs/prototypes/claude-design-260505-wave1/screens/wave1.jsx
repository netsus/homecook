// ===== Wave 1: missing/partial screens & modals =====
// Style follows screens/extras.jsx — uses T tokens, AppBar, Button, Icon, Sheet patterns.
// No new domain logic; only UI surfaces matching 화면정의서 v1.5.1 + ledger constraints.
const { useState: useState_W, useMemo: useMemo_W, useEffect: useEffect_W } = React;

// ─────────────────────────────────────────────────────────────
// 공용 — 확인 다이얼로그 (centered modal, Baemin tone)
// ─────────────────────────────────────────────────────────────
function ConfirmDialog({ title, body, confirmLabel='확인', cancelLabel='취소', destructive=false, onConfirm, onClose, extra }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 16, width: '100%', maxWidth: 320,
        padding: '20px 20px 16px', boxShadow: T.shadowDeep,
      }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: T.ink, fontFamily: T.fontBrand, marginBottom: 8 }}>{title}</div>
        {body && <div style={{ fontSize: 13, color: T.text2, lineHeight: 1.55, marginBottom: 16 }}>{body}</div>}
        {extra}
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button onClick={onClose} style={{
            flex: 1, padding: '12px 0', borderRadius: 10, border: `1px solid ${T.border}`,
            background: '#fff', color: T.text2, fontSize: 14, fontWeight: 700, cursor: 'pointer',
          }}>{cancelLabel}</button>
          <button onClick={onConfirm} style={{
            flex: 1, padding: '12px 0', borderRadius: 10, border: 'none',
            background: destructive ? T.red : T.mint, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
          }}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// LOGIN — 소셜 로그인 + return-to-action
// ─────────────────────────────────────────────────────────────
function LoginScreen({ returnTo, onBack, onLogin }) {
  // returnTo: { label, run } — describes the action user was attempting
  return (
    <div style={{
      background: `linear-gradient(180deg, ${T.mintSoft} 0%, #fff 60%)`,
      minHeight: '100%', display: 'flex', flexDirection: 'column', paddingBottom: 40,
    }}>
      <div style={{ padding: '52px 16px 0', display: 'flex' }}>
        <button onClick={onBack} style={iconBtn}>{Icon.chevL()}</button>
      </div>

      <div style={{ flex: 1, padding: '20px 24px 0', display: 'flex', flexDirection: 'column' }}>
        <div style={{
          width: 72, height: 72, borderRadius: 18, background: T.mint, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 36, fontFamily: T.fontBrand, fontWeight: 800, marginBottom: 20,
          boxShadow: T.shadowSharp,
        }}>홈</div>

        <div style={{ fontSize: 26, fontWeight: 800, color: T.ink, fontFamily: T.fontBrand, lineHeight: 1.3 }}>
          홈쿡과 함께<br />오늘 뭐 먹지 정해봐요
        </div>
        <div style={{ fontSize: 14, color: T.text3, marginTop: 10, lineHeight: 1.55 }}>
          식단을 짜고, 장 보고, 요리한 기록을 남길 수 있어요.
        </div>

        {returnTo && (
          <div style={{
            marginTop: 20, background: '#fff', borderRadius: 12,
            border: `1px solid ${T.mint}`, padding: '12px 14px',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{ fontSize: 18 }}>↩️</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: T.mintDeep, fontWeight: 700 }}>로그인 후 이어서</div>
              <div style={{ fontSize: 13, color: T.ink, fontWeight: 700 }}>{returnTo.label}</div>
            </div>
          </div>
        )}

        <div style={{ flex: 1, minHeight: 40 }} />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
          <button onClick={() => onLogin('kakao', returnTo)} style={socialBtn('#FEE500', '#191919')}>
            <span style={{ fontSize: 18 }}>💬</span> 카카오로 시작하기
          </button>
          <button onClick={() => onLogin('apple', returnTo)} style={socialBtn('#000', '#fff')}>
            <span style={{ fontSize: 18 }}></span> Apple로 시작하기
          </button>
          <button onClick={() => onLogin('google', returnTo)} style={socialBtn('#fff', '#191919', `1px solid ${T.border}`)}>
            <span style={{ fontSize: 16 }}>G</span> Google로 시작하기
          </button>
        </div>
        <div style={{ textAlign: 'center', fontSize: 11, color: T.text3, lineHeight: 1.5 }}>
          계속 진행하면 <span style={{ textDecoration: 'underline' }}>이용약관</span>과{' '}
          <span style={{ textDecoration: 'underline' }}>개인정보처리방침</span>에 동의합니다.
        </div>
      </div>
    </div>
  );
}
const socialBtn = (bg, fg, border = 'none') => ({
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
  background: bg, color: fg, border, padding: '14px 0',
  borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: 'pointer',
});

// ─────────────────────────────────────────────────────────────
// MENU_ADD — 식사 추가 방식 선택 hub + 4 pickers
// host: planner slot + (presetDate, presetSlot)
// ─────────────────────────────────────────────────────────────
function MenuAddScreen({ presetDate, presetSlot, planner, pantry, onBack, onPickRecipe, onGoManual, onGoYtImport, showToast }) {
  // mode: 'hub' | 'search' | 'books' | 'pantry-match'
  const [mode, setMode] = useState_W('hub');
  const slotLabel = presetDate && presetSlot ? `${presetDate} ${presetSlot}` : '플래너';

  if (mode === 'search') {
    return <RecipeSearchPicker title="검색으로 추가" slotLabel={slotLabel}
      onBack={() => setMode('hub')} onPick={onPickRecipe} />;
  }
  if (mode === 'books') {
    return <RecipeBookSelector slotLabel={slotLabel}
      onBack={() => setMode('hub')} onPick={onPickRecipe} />;
  }
  if (mode === 'pantry-match') {
    return <PantryMatchPicker pantry={pantry} slotLabel={slotLabel}
      onBack={() => setMode('hub')} onPick={onPickRecipe} />;
  }

  const tiles = [
    { k: 'search', emoji: '🔎', title: '검색해서 추가', sub: '레시피 이름·재료로 찾기', go: () => setMode('search') },
    { k: 'books',  emoji: '📚', title: '레시피북에서 추가', sub: '저장한 레시피 / 내 레시피', go: () => setMode('books') },
    { k: 'pantry', emoji: '🧊', title: '팬트리 기반 추천', sub: '냉장고 재료로 만들 수 있는 요리', go: () => setMode('pantry-match') },
    { k: 'manual', emoji: '✏️', title: '직접 등록', sub: '재료·조리법 직접 입력', go: () => onGoManual?.(presetDate, presetSlot) },
    { k: 'yt',     emoji: '📺', title: '유튜브에서 가져오기', sub: 'URL 붙여넣기로 자동 추출', go: () => onGoYtImport?.(presetDate, presetSlot) },
  ];
  return (
    <div style={{ background: T.surfaceFill, minHeight: '100%' }}>
      <AppBar title="식사 추가" left={<button onClick={onBack} style={iconBtn}>{Icon.chevL()}</button>} />
      <div style={{ padding: '12px 20px 4px' }}>
        <div style={{ fontSize: 11, color: T.mintDeep, fontWeight: 700 }}>대상</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: T.ink, fontFamily: T.fontBrand }}>{slotLabel}</div>
      </div>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {tiles.map(t => (
          <button key={t.k} onClick={t.go} style={{
            display: 'flex', alignItems: 'center', gap: 14, padding: 16,
            background: '#fff', border: `1px solid ${T.border}`, borderRadius: 12,
            cursor: 'pointer', textAlign: 'left',
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12, background: T.mintSoft,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
            }}>{t.emoji}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>{t.title}</div>
              <div style={{ fontSize: 12, color: T.text3, marginTop: 2 }}>{t.sub}</div>
            </div>
            <span style={{ color: T.text4 }}>{Icon.chevR(T.text4)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// RECIPE_SEARCH_PICKER (surface inside MENU_ADD)
// ─────────────────────────────────────────────────────────────
function RecipeSearchPicker({ title='레시피 검색', slotLabel, onBack, onPick }) {
  const [q, setQ] = useState_W('');
  const list = useMemo_W(() => {
    const ql = q.trim();
    if (!ql) return RECIPES.slice(0, 6);
    return RECIPES.filter(r =>
      r.name.includes(ql) ||
      (r.ingredients || []).some(i => i.name.includes(ql))
    );
  }, [q]);

  return (
    <div style={{ background: T.surfaceFill, minHeight: '100%' }}>
      <AppBar title={title} left={<button onClick={onBack} style={iconBtn}>{Icon.chevL()}</button>} />
      <div style={{ padding: 16, background: '#fff', borderBottom: `1px solid ${T.border}` }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: T.surfaceFill, borderRadius: 10, padding: '10px 14px',
        }}>
          {Icon.search(T.text3)}
          <input value={q} onChange={e => setQ(e.target.value)} autoFocus
            placeholder="레시피 이름 또는 재료"
            style={{ border: 'none', background: 'transparent', flex: 1, fontSize: 14, outline: 'none' }} />
          {q && <button onClick={() => setQ('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.text3 }}>✕</button>}
        </div>
        {slotLabel && <div style={{ marginTop: 8, fontSize: 11, color: T.text3 }}>대상 · {slotLabel}</div>}
      </div>
      <div style={{ padding: 16 }}>
        {list.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: T.text3 }}>
            <div style={{ fontSize: 36, marginBottom: 6 }}>🤔</div>
            <div style={{ fontSize: 13 }}>검색 결과가 없어요</div>
          </div>
        ) : list.map(r => (
          <button key={r.id} onClick={() => onPick(r.id)} style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 12,
            background: '#fff', border: `1px solid ${T.border}`, borderRadius: 12,
            padding: 12, marginBottom: 8, cursor: 'pointer', textAlign: 'left',
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: 10, background: r.bg,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30,
            }}>{r.emoji}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>{r.name}</div>
              <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>
                ⭐ {r.rating} · {r.minutes}분 · {(r.tags || []).join(' · ')}
              </div>
            </div>
            <span style={{
              fontSize: 12, fontWeight: 700, color: T.mintDeep,
              background: T.mintSoft, padding: '6px 10px', borderRadius: 6,
            }}>선택</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// RecipeBookSelector — 책 선택 → RecipeBookDetailPicker
// ─────────────────────────────────────────────────────────────
function RecipeBookSelector({ slotLabel, onBack, onPick }) {
  const books = [
    { id: 'b_saved', kind: 'saved', name: '저장한 레시피', count: 8, emoji: '🔖' },
    { id: 'b_custom1', kind: 'custom', name: '평일 저녁 빠른요리', count: 12, emoji: '🍳' },
    { id: 'b_custom2', kind: 'custom', name: '주말 한 상 차림', count: 5, emoji: '🍽️' },
  ];
  const [openId, setOpenId] = useState_W(null);
  if (openId) return <RecipeBookDetailPicker bookId={openId}
    book={books.find(b => b.id === openId)} slotLabel={slotLabel}
    onBack={() => setOpenId(null)} onPick={onPick} />;
  return (
    <div style={{ background: T.surfaceFill, minHeight: '100%' }}>
      <AppBar title="레시피북에서 추가" left={<button onClick={onBack} style={iconBtn}>{Icon.chevL()}</button>} />
      <div style={{ padding: 16 }}>
        {books.map(b => (
          <button key={b.id} onClick={() => setOpenId(b.id)} style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 12,
            background: '#fff', border: `1px solid ${T.border}`, borderRadius: 12,
            padding: '14px 16px', marginBottom: 8, cursor: 'pointer', textAlign: 'left',
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: 10, background: T.mintSoft,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
            }}>{b.emoji}</div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>{b.name}</span>
                <span style={{
                  fontSize: 10, color: T.text3, background: T.surfaceFill,
                  padding: '2px 6px', borderRadius: 4, fontWeight: 600,
                }}>{b.kind === 'saved' ? '저장' : '내 책'}</span>
              </div>
              <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>{b.count}개 레시피</div>
            </div>
            {Icon.chevR(T.text4)}
          </button>
        ))}
      </div>
    </div>
  );
}
function RecipeBookDetailPicker({ bookId, book, slotLabel, onBack, onPick }) {
  // simulate book-specific recipes; reuse RECIPES
  const items = RECIPES.slice(0, book?.count > 6 ? 6 : (book?.count || 4));
  return (
    <div style={{ background: T.surfaceFill, minHeight: '100%' }}>
      <AppBar title={book?.name || '레시피북'} left={<button onClick={onBack} style={iconBtn}>{Icon.chevL()}</button>} />
      <div style={{ padding: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
          {items.map(r => (
            <button key={r.id} onClick={() => onPick(r.id)} style={{
              background: '#fff', border: `1px solid ${T.border}`, borderRadius: 12,
              padding: 0, overflow: 'hidden', cursor: 'pointer', textAlign: 'left',
            }}>
              <div style={{
                width: '100%', aspectRatio: '4/3', background: r.bg,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 50,
              }}>{r.emoji}</div>
              <div style={{ padding: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.ink }}>{r.name}</div>
                <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>⭐ {r.rating} · {r.minutes}분</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PantryMatchPicker — 팬트리 기반 추천
// ─────────────────────────────────────────────────────────────
function PantryMatchPicker({ pantry, slotLabel, onBack, onPick }) {
  const have = new Set(Object.values(pantry || {}).filter(p => p.have).map(p => p.name));
  const ranked = useMemo_W(() => {
    return RECIPES.map(r => {
      const ings = r.ingredients || [];
      const hit = ings.filter(i => have.has(i.name)).length;
      const ratio = ings.length ? hit / ings.length : 0;
      return { r, hit, total: ings.length, ratio, missing: ings.filter(i => !have.has(i.name)).map(i => i.name) };
    }).sort((a, b) => b.ratio - a.ratio);
  }, [pantry]);

  return (
    <div style={{ background: T.surfaceFill, minHeight: '100%' }}>
      <AppBar title="팬트리 기반 추천" left={<button onClick={onBack} style={iconBtn}>{Icon.chevL()}</button>} />
      <div style={{ padding: '14px 16px', background: T.mintSoft, borderBottom: `1px solid ${T.border}` }}>
        <div style={{ fontSize: 12, color: T.mintDeep, fontWeight: 700, lineHeight: 1.5 }}>
          팬트리에 있는 재료로 만들 수 있는 요리부터 보여드려요. 부족한 재료는 장보기 목록으로 모아보세요.
        </div>
      </div>
      <div style={{ padding: 12 }}>
        {ranked.map(({ r, hit, total, missing }) => (
          <button key={r.id} onClick={() => onPick(r.id)} style={{
            width: '100%', display: 'flex', gap: 12, padding: 12,
            background: '#fff', border: `1px solid ${T.border}`, borderRadius: 12,
            marginBottom: 8, cursor: 'pointer', textAlign: 'left',
          }}>
            <div style={{
              width: 64, height: 64, borderRadius: 10, background: r.bg,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32,
            }}>{r.emoji}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>{r.name}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                <span style={{
                  fontSize: 11, fontWeight: 700, color: T.mintDeep,
                  background: T.mintSoft, padding: '3px 8px', borderRadius: 4,
                }}>재료 {hit}/{total}</span>
                <div style={{
                  flex: 1, height: 4, background: T.surfaceSubtle,
                  borderRadius: 2, overflow: 'hidden',
                }}>
                  <div style={{ width: `${(hit/Math.max(1,total))*100}%`, height: '100%', background: T.mint }} />
                </div>
              </div>
              {missing.length > 0 && (
                <div style={{ fontSize: 11, color: T.text3, marginTop: 6, lineHeight: 1.4 }}>
                  부족 · {missing.slice(0, 3).join(', ')}{missing.length > 3 ? ` 외 ${missing.length-3}` : ''}
                </div>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// LEFTOVERS — 남은요리 관리
// ─────────────────────────────────────────────────────────────
function LeftoversScreen({ planner, onBack, onReuse, onGoAteList, onMarkAte, onMarkPartial, showToast }) {
  // Derived: meals with status === 'cooked' but not consumed
  const days = Object.keys(planner);
  const items = [];
  days.forEach(d => {
    ['아침','점심','저녁'].forEach(s => {
      const m = planner[d]?.[s];
      if (m?.status === 'cooked' && !m.ateAt) items.push({ date: d, slot: s, meal: m });
    });
  });

  return (
    <div style={{ background: T.surfaceFill, minHeight: '100%', paddingBottom: 40 }}>
      <AppBar title="남은요리" left={<button onClick={onBack} style={iconBtn}>{Icon.chevL()}</button>}
        right={<button onClick={onGoAteList} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 13, color: T.mintDeep, fontWeight: 700,
        }}>다먹은 기록</button>} />
      <div style={{ padding: '14px 16px', background: '#fff', borderBottom: `1px solid ${T.border}` }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: T.ink, fontFamily: T.fontBrand }}>
          {items.length === 0 ? '남은 요리가 없어요' : `남은 요리 ${items.length}개`}
        </div>
        <div style={{ fontSize: 12, color: T.text3, marginTop: 4 }}>
          요리한 끼니를 다시 플래너에 올리거나 다 먹은 것으로 정리할 수 있어요.
        </div>
      </div>
      {items.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 44, marginBottom: 8 }}>🍱</div>
          <div style={{ fontSize: 13, color: T.text3 }}>요리를 마치면 여기에 모여요</div>
        </div>
      ) : (
        <div style={{ padding: 16 }}>
          {items.map(({ date, slot, meal }) => {
            const r = RECIPES.find(x => x.id === meal.recipeId);
            return (
              <div key={date+slot} style={{
                background: '#fff', borderRadius: 12, marginBottom: 10,
                border: `1px solid ${T.border}`, overflow: 'hidden',
              }}>
                <div style={{ display: 'flex', padding: 14, gap: 12, alignItems: 'center' }}>
                  <div style={{
                    width: 56, height: 56, borderRadius: 10, background: r.bg,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30,
                  }}>{r.emoji}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>{r.name}</div>
                    <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>
                      {date} {slot} · {meal.servings}인분
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, padding: '0 12px 12px' }}>
                  <button onClick={() => onReuse(date, slot)} style={smallSecBtn}>🔁 다시 플래너에</button>
                  <button onClick={() => onMarkPartial(date, slot)} style={smallSecBtn}>🥢 덜먹음</button>
                  <button onClick={() => onMarkAte(date, slot)} style={{
                    ...smallSecBtn, background: T.mint, color: '#fff', border: 'none', flex: 1,
                  }}>✓ 다먹음</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
const smallSecBtn = {
  padding: '8px 10px', fontSize: 12, fontWeight: 700, borderRadius: 8,
  background: '#fff', color: T.text2, border: `1px solid ${T.border}`,
  cursor: 'pointer', whiteSpace: 'nowrap',
};

// ─────────────────────────────────────────────────────────────
// ATE_LIST — 다먹은 히스토리
// ─────────────────────────────────────────────────────────────
function AteListScreen({ planner, onBack, onUndoAte, onRecreate }) {
  const days = Object.keys(planner);
  const items = [];
  days.forEach(d => {
    ['아침','점심','저녁'].forEach(s => {
      const m = planner[d]?.[s];
      if (m?.ateAt) items.push({ date: d, slot: s, meal: m });
    });
  });
  return (
    <div style={{ background: T.surfaceFill, minHeight: '100%' }}>
      <AppBar title="다먹은 기록" left={<button onClick={onBack} style={iconBtn}>{Icon.chevL()}</button>} />
      <div style={{ padding: 16 }}>
        {items.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: 12, padding: 40, textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>📒</div>
            <div style={{ fontSize: 13, color: T.text3 }}>아직 다먹은 기록이 없어요</div>
          </div>
        ) : items.map(({ date, slot, meal }) => {
          const r = RECIPES.find(x => x.id === meal.recipeId);
          return (
            <div key={date+slot} style={{
              background: '#fff', borderRadius: 12, marginBottom: 10,
              border: `1px solid ${T.border}`, padding: 14,
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div style={{
                width: 48, height: 48, borderRadius: 10, background: r.bg,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24,
              }}>{r.emoji}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>{r.name}</div>
                <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>
                  {date} {slot} · {meal.servings}인분 다먹음
                </div>
              </div>
              <button onClick={() => onUndoAte(date, slot)} style={smallSecBtn}>덜먹음으로</button>
              <button onClick={() => onRecreate(meal.recipeId)} style={{ ...smallSecBtn, color: T.mintDeep, border: `1px solid ${T.mint}` }}>다시 만들기</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MANUAL_RECIPE_CREATE — 직접 등록
// ─────────────────────────────────────────────────────────────
function ManualRecipeCreateScreen({ presetDate, presetSlot, onBack, onCreated, showToast }) {
  const [name, setName] = useState_W('');
  const [minutes, setMinutes] = useState_W(20);
  const [servings, setServings] = useState_W(2);
  const [ings, setIngs] = useState_W([{ name: '', qty: '' }]);
  const [steps, setSteps] = useState_W([{ method: 'prep', text: '' }]);
  const valid = name.trim() && ings.some(i => i.name.trim()) && steps.some(s => s.text.trim());
  const methods = Object.keys(METHOD_COLORS);

  const submit = () => {
    if (!valid) return;
    const id = 'r_manual_' + Date.now();
    onCreated({
      id, name: name.trim(), minutes, servings,
      bg: T.mintSoft, emoji: '🍳', rating: 0, saves: 0, kcal: 0,
      tags: ['직접 등록'], method: 'prep',
      ingredients: ings.filter(i => i.name.trim()).map(i => ({ name: i.name.trim(), qty: i.qty || '적당량', section: '직접 입력' })),
      steps: steps.filter(s => s.text.trim()).map((s, i) => ({ method: s.method, title: `Step ${i+1}`, body: s.text, minutes: 2, text: s.text, time: '약 2분' })),
    }, presetDate, presetSlot);
  };

  return (
    <div style={{ background: T.surfaceFill, minHeight: '100%', paddingBottom: 100 }}>
      <AppBar title="직접 등록" left={<button onClick={onBack} style={iconBtn}>{Icon.chevL()}</button>} />
      {/* 기본 정보 */}
      <Section title="기본 정보">
        <Field label="요리 이름">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="예: 김치찌개" style={inp} />
        </Field>
        <div style={{ display: 'flex', gap: 8 }}>
          <Field label="조리 시간(분)" style={{ flex: 1 }}>
            <input type="number" value={minutes} onChange={e => setMinutes(+e.target.value || 0)} style={inp} />
          </Field>
          <Field label="기준 인분" style={{ flex: 1 }}>
            <input type="number" value={servings} onChange={e => setServings(+e.target.value || 1)} style={inp} />
          </Field>
        </div>
      </Section>

      {/* 재료 */}
      <Section title="재료" right={
        <button onClick={() => setIngs([...ings, { name: '', qty: '' }])} style={addLinkBtn}>+ 추가</button>
      }>
        {ings.map((it, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input value={it.name} onChange={e => setIngs(ings.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
              placeholder="재료" style={{ ...inp, flex: 1.4 }} />
            <input value={it.qty} onChange={e => setIngs(ings.map((x, j) => j === i ? { ...x, qty: e.target.value } : x))}
              placeholder="양 (예: 200g)" style={{ ...inp, flex: 1 }} />
            {ings.length > 1 && (
              <button onClick={() => setIngs(ings.filter((_, j) => j !== i))} style={removeBtn}>−</button>
            )}
          </div>
        ))}
      </Section>

      {/* 조리법 */}
      <Section title="조리법" right={
        <button onClick={() => setSteps([...steps, { method: 'prep', text: '' }])} style={addLinkBtn}>+ 단계</button>
      }>
        {steps.map((s, i) => (
          <div key={i} style={{
            background: T.surfaceFill, borderRadius: 10, padding: 12, marginBottom: 8,
            borderLeft: `4px solid ${METHOD_COLORS[s.method].border}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: T.text3 }}>STEP {i+1}</span>
              <select value={s.method} onChange={e => setSteps(steps.map((x, j) => j === i ? { ...x, method: e.target.value } : x))}
                style={{
                  fontSize: 11, fontWeight: 700, padding: '4px 8px', borderRadius: 6,
                  border: `1px solid ${METHOD_COLORS[s.method].border}`,
                  background: METHOD_COLORS[s.method].bg, color: METHOD_COLORS[s.method].text,
                }}>
                {methods.map(m => <option key={m} value={m}>{METHOD_COLORS[m].label}</option>)}
              </select>
              {steps.length > 1 && (
                <button onClick={() => setSteps(steps.filter((_, j) => j !== i))}
                  style={{ marginLeft: 'auto', ...removeBtn }}>−</button>
              )}
            </div>
            <textarea value={s.text} onChange={e => setSteps(steps.map((x, j) => j === i ? { ...x, text: e.target.value } : x))}
              rows={2} placeholder="이 단계에서 무엇을 하나요?"
              style={{ ...inp, width: '100%', resize: 'none', minHeight: 56 }} />
          </div>
        ))}
      </Section>

      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16,
        background: '#fff', borderTop: `1px solid ${T.border}`,
      }}>
        <Button full disabled={!valid} onClick={submit}>등록하고 다음 단계 →</Button>
      </div>
    </div>
  );
}
const inp = {
  width: '100%', padding: '10px 12px', fontSize: 14,
  border: `1px solid ${T.border}`, borderRadius: 8, background: '#fff',
  color: T.ink, outline: 'none',
};
const addLinkBtn = {
  background: 'none', border: 'none', color: T.mintDeep, fontSize: 12, fontWeight: 700, cursor: 'pointer',
};
const removeBtn = {
  width: 36, background: '#fff', border: `1px solid ${T.border}`, color: T.text3,
  borderRadius: 8, cursor: 'pointer', fontSize: 18,
};
function Section({ title, right, children }) {
  return (
    <div style={{ background: '#fff', marginTop: 8, padding: '16px 16px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>{title}</div>
        {right}
      </div>
      {children}
    </div>
  );
}
function Field({ label, children, style }) {
  return (
    <div style={{ marginBottom: 10, ...style }}>
      <div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// YT_IMPORT — URL 입력 → loading → review/edit → 등록 완료
// ─────────────────────────────────────────────────────────────
function YtImportScreen({ presetDate, presetSlot, onBack, onCreated, onAddPlanner, showToast }) {
  // step: 'input' | 'loading' | 'error' | 'review'
  const [step, setStep] = useState_W('input');
  const [url, setUrl] = useState_W('');
  const [draft, setDraft] = useState_W(null);
  const validUrl = /youtu(\.be|be\.com)/i.test(url) || /^https?:\/\//.test(url);

  const startExtract = () => {
    if (!validUrl) return;
    setStep('loading');
    setTimeout(() => {
      // simulate: error 10% chance
      if (url.includes('fail')) { setStep('error'); return; }
      setDraft({
        name: '백종원 김치찌개',
        thumbnail: '🥘',
        bg: '#FFE9E0',
        minutes: 25,
        servings: 2,
        channel: '백종원의 요리비책',
        ingredients: [
          { name: '김치', qty: '300g', section: '냉장' },
          { name: '돼지고기', qty: '200g', section: '냉장' },
          { name: '두부', qty: '1/2모', section: '냉장' },
          { name: '대파', qty: '1대', section: '냉장' },
        ],
        steps: [
          { method: 'prep', text: '김치는 한입 크기로 자르고, 돼지고기는 깍둑썰기 한다.' },
          { method: 'stirfry', text: '냄비에 돼지고기와 김치를 넣고 5분간 볶는다.' },
          { method: 'boil', text: '물 500ml를 붓고 끓인 뒤 두부와 대파를 넣는다.' },
        ],
      });
      setStep('review');
    }, 1400);
  };

  if (step === 'input' || step === 'error') {
    return (
      <div style={{ background: T.surfaceFill, minHeight: '100%' }}>
        <AppBar title="유튜브에서 가져오기" left={<button onClick={onBack} style={iconBtn}>{Icon.chevL()}</button>} />
        <div style={{ padding: 24 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: T.ink, fontFamily: T.fontBrand, marginBottom: 6 }}>
            유튜브 영상 URL을 붙여넣어 주세요
          </div>
          <div style={{ fontSize: 12, color: T.text3, lineHeight: 1.55, marginBottom: 16 }}>
            영상 설명에서 재료와 조리법을 자동으로 추출해요. 추출 후 직접 다듬을 수 있어요.
          </div>
          <input value={url} onChange={e => setUrl(e.target.value)}
            placeholder="https://youtu.be/..." style={inp} />
          {step === 'error' && (
            <div style={{
              marginTop: 12, padding: 12, background: '#FFF5F5',
              border: `1px solid ${T.red}`, borderRadius: 10, fontSize: 12, color: T.red,
            }}>
              ⚠ 영상에서 레시피를 추출하지 못했어요. URL을 다시 확인하거나 직접 등록해 주세요.
            </div>
          )}
          <div style={{ marginTop: 16, padding: 14, background: '#fff', borderRadius: 10, border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 12, color: T.text3, fontWeight: 700, marginBottom: 6 }}>이런 영상을 가져올 수 있어요</div>
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: T.text2, lineHeight: 1.7 }}>
              <li>설명에 재료 목록이 있는 영상</li>
              <li>10분 이내의 짧은 요리 영상</li>
              <li>한국어 채널 (베타)</li>
            </ul>
          </div>
          <div style={{ marginTop: 24 }}>
            <Button full disabled={!validUrl} onClick={startExtract}>가져오기</Button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'loading') {
    return (
      <div style={{ background: T.surfaceFill, minHeight: '100%' }}>
        <AppBar title="가져오는 중" left={<button onClick={() => setStep('input')} style={iconBtn}>{Icon.chevL()}</button>} />
        <div style={{ padding: 60, textAlign: 'center' }}>
          <div style={{ fontSize: 56, marginBottom: 14, animation: 'pulse 1.2s infinite' }}>📺</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: T.ink, fontFamily: T.fontBrand }}>레시피를 가져오고 있어요…</div>
          <div style={{ fontSize: 12, color: T.text3, marginTop: 8 }}>최대 30초 정도 걸려요</div>
          <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
        </div>
      </div>
    );
  }

  // review
  const setField = (k, v) => setDraft(d => ({ ...d, [k]: v }));
  const setIng = (i, k, v) => setDraft(d => ({ ...d, ingredients: d.ingredients.map((x, j) => j === i ? { ...x, [k]: v } : x) }));
  const setStep_ = (i, k, v) => setDraft(d => ({ ...d, steps: d.steps.map((x, j) => j === i ? { ...x, [k]: v } : x) }));
  const submit = () => {
    const id = 'r_yt_' + Date.now();
    onCreated({
      id, name: draft.name, bg: draft.bg, emoji: draft.thumbnail,
      minutes: draft.minutes, servings: draft.servings,
      rating: 0, saves: 0, kcal: 0, tags: ['유튜브'],
      method: draft.steps[0]?.method || 'prep',
      ingredients: draft.ingredients,
      steps: draft.steps.map((s, i) => ({ method: s.method, title: `Step ${i+1}`, body: s.text, minutes: 2, text: s.text, time: '약 2분' })),
    }, presetDate, presetSlot);
  };

  return (
    <div style={{ background: T.surfaceFill, minHeight: '100%', paddingBottom: 100 }}>
      <AppBar title="추출 결과 확인" left={<button onClick={() => setStep('input')} style={iconBtn}>{Icon.chevL()}</button>} />
      <div style={{ background: '#fff', padding: 16, display: 'flex', gap: 12, alignItems: 'center', borderBottom: `1px solid ${T.border}` }}>
        <div style={{ width: 60, height: 60, borderRadius: 10, background: draft.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32 }}>
          {draft.thumbnail}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: T.text3 }}>{draft.channel}</div>
          <input value={draft.name} onChange={e => setField('name', e.target.value)}
            style={{ ...inp, padding: '4px 0', border: 'none', fontSize: 16, fontWeight: 700 }} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 0, background: '#fff', padding: '8px 16px', borderBottom: `1px solid ${T.border}` }}>
        <Field label="조리 시간(분)" style={{ flex: 1, marginRight: 8 }}>
          <input type="number" value={draft.minutes} onChange={e => setField('minutes', +e.target.value || 0)} style={inp} />
        </Field>
        <Field label="기준 인분" style={{ flex: 1 }}>
          <input type="number" value={draft.servings} onChange={e => setField('servings', +e.target.value || 1)} style={inp} />
        </Field>
      </div>

      <Section title={`재료 · ${draft.ingredients.length}개`}>
        {draft.ingredients.map((it, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input value={it.name} onChange={e => setIng(i, 'name', e.target.value)} style={{ ...inp, flex: 1.4 }} />
            <input value={it.qty} onChange={e => setIng(i, 'qty', e.target.value)} style={{ ...inp, flex: 1 }} />
          </div>
        ))}
      </Section>

      <Section title={`조리법 · ${draft.steps.length}단계`}>
        {draft.steps.map((s, i) => (
          <div key={i} style={{
            background: T.surfaceFill, borderRadius: 10, padding: 12, marginBottom: 8,
            borderLeft: `4px solid ${METHOD_COLORS[s.method].border}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: T.text3 }}>STEP {i+1}</span>
              <select value={s.method} onChange={e => setStep_(i, 'method', e.target.value)}
                style={{
                  fontSize: 11, fontWeight: 700, padding: '4px 8px', borderRadius: 6,
                  border: `1px solid ${METHOD_COLORS[s.method].border}`,
                  background: METHOD_COLORS[s.method].bg, color: METHOD_COLORS[s.method].text,
                }}>
                {Object.keys(METHOD_COLORS).map(m => <option key={m} value={m}>{METHOD_COLORS[m].label}</option>)}
              </select>
            </div>
            <textarea value={s.text} onChange={e => setStep_(i, 'text', e.target.value)} rows={2}
              style={{ ...inp, width: '100%', resize: 'none', minHeight: 56 }} />
          </div>
        ))}
      </Section>

      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16,
        background: '#fff', borderTop: `1px solid ${T.border}`,
      }}>
        <Button full onClick={submit}>등록하고 다음 단계 →</Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SHOPPING_DETAIL — read-only 재열람 + pantry-excluded section + reflect
// list: { id, name, items: [{ name, qty, section, fromMeals[], have, checked? }],
//         status: 'active' | 'completed', completedAt?, pantryReflect? }
// ─────────────────────────────────────────────────────────────
function ShoppingDetailScreen({ list, onBack, onToggleItem, onComplete, onReopen, onReflect, showToast }) {
  if (!list) return <div style={{ padding: 40 }}>장보기 목록을 찾을 수 없어요</div>;
  const completed = list.status === 'completed';

  // group: 사야 함 / 팬트리에 이미 있음
  const buy = list.items.filter(i => !i.have);
  const skip = list.items.filter(i => i.have);
  const checkedCount = buy.filter(i => i.checked).length;
  const allDone = buy.length > 0 && checkedCount === buy.length;
  const sectionsMap = buy.reduce((acc, it) => {
    (acc[it.section] = acc[it.section] || []).push(it); return acc;
  }, {});

  return (
    <div style={{ background: T.surfaceFill, minHeight: '100%', paddingBottom: 130 }}>
      <AppBar title={list.name} left={<button onClick={onBack} style={iconBtn}>{Icon.chevL()}</button>}
        right={completed ? (
          <span style={{
            fontSize: 11, fontWeight: 700, color: T.mintDeep, background: T.mintSoft,
            padding: '4px 10px', borderRadius: 9999,
          }}>완료</span>
        ) : null} />

      {/* 진행 상태 */}
      <div style={{ background: '#fff', padding: 20, borderBottom: `1px solid ${T.border}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div>
            <div style={{ fontSize: 12, color: T.text3 }}>
              {completed ? `${list.completedAt || '완료됨'}` : `사야 할 재료 ${buy.length - checkedCount}개`}
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: T.ink, fontFamily: T.fontBrand, marginTop: 2 }}>
              {completed ? '장보기 완료' : (allDone ? '모두 담았어요!' : '장보기 진행 중')}
            </div>
          </div>
          {!completed && (
            <div style={{ fontSize: 28, fontWeight: 800, color: T.mint, fontFamily: T.fontBrand }}>
              {Math.round((checkedCount / Math.max(1, buy.length)) * 100)}%
            </div>
          )}
        </div>
        {!completed && (
          <div style={{ height: 6, background: T.surfaceSubtle, borderRadius: 3, marginTop: 12, overflow: 'hidden' }}>
            <div style={{ width: `${(checkedCount / Math.max(1, buy.length)) * 100}%`, height: '100%', background: T.mint }} />
          </div>
        )}
      </div>

      {/* 사야 함 */}
      <div style={{ padding: 16 }}>
        {Object.entries(sectionsMap).map(([sec, list2]) => (
          <div key={sec} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: T.text3, fontWeight: 700, marginBottom: 8 }}>
              {sec} <span style={{ color: T.text4 }}>· {list2.length}</span>
            </div>
            <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', border: `1px solid ${T.border}` }}>
              {list2.map((it, i) => (
                <button key={it.name} disabled={completed} onClick={() => onToggleItem(it.name)} style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                  padding: '14px 16px', border: 'none', background: 'none',
                  borderBottom: i < list2.length - 1 ? `1px solid ${T.surfaceSubtle}` : 'none',
                  cursor: completed ? 'default' : 'pointer', textAlign: 'left',
                  opacity: completed ? 0.7 : 1,
                }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: 11,
                    background: it.checked ? T.mint : '#fff',
                    border: `1.5px solid ${it.checked ? T.mint : T.border}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>{it.checked && Icon.check('#fff')}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{
                      fontSize: 15, fontWeight: 600, color: T.ink,
                      textDecoration: it.checked ? 'line-through' : 'none',
                    }}>{it.name}</div>
                    <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>
                      {it.qty} · {(it.fromMeals || []).length}끼에 사용
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}

        {/* 팬트리 제외 섹션 */}
        {skip.length > 0 && (
          <div style={{ marginTop: 6 }}>
            <div style={{ fontSize: 12, color: T.text3, fontWeight: 700, marginBottom: 8 }}>
              팬트리에 이미 있어 제외 <span style={{ color: T.text4 }}>· {skip.length}</span>
            </div>
            <div style={{
              background: T.mintSoft, borderRadius: 12, padding: '10px 12px',
              display: 'flex', flexWrap: 'wrap', gap: 6,
            }}>
              {skip.map(it => (
                <span key={it.name} style={{
                  fontSize: 12, fontWeight: 600, color: T.mintDeep, background: '#fff',
                  padding: '6px 10px', borderRadius: 9999, display: 'inline-flex', alignItems: 'center', gap: 4,
                }}>{Icon.check(T.mintDeep)} {it.name}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* CTA */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16,
        background: '#fff', borderTop: `1px solid ${T.border}`, display: 'flex', gap: 8,
      }}>
        {completed ? (
          <>
            <Button variant="neutral" onClick={() => onReflect(list)}>팬트리에 반영</Button>
            <Button full variant="neutral" onClick={() => onReopen(list.id)}>다시 열기</Button>
          </>
        ) : (
          <Button full disabled={buy.length === 0} onClick={() => onComplete(list.id)}>
            {allDone ? '✓ 장보기 완료' : `완료 (${checkedCount}/${buy.length})`}
          </Button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PantryReflectPicker — null / [] / selected ids 의미 분리
// ─────────────────────────────────────────────────────────────
function PantryReflectPicker({ list, onClose, onConfirm }) {
  // mode: null = 미선택(아직 결정 안 함), [] = 명시적 거절, [ids] = 선택
  const buy = list?.items?.filter(i => !i.have && i.checked) || [];
  const [picked, setPicked] = useState_W(new Set(buy.map(i => i.name)));
  const togglePick = (name) => {
    setPicked(p => {
      const n = new Set(p);
      n.has(name) ? n.delete(name) : n.add(name);
      return n;
    });
  };
  return (
    <div style={overlay} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: '20px 20px 0 0',
        position: 'absolute', bottom: 0, left: 0, right: 0,
        maxHeight: '85%', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '18px 20px 12px', borderBottom: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: T.ink, fontFamily: T.fontBrand }}>
            팬트리에 반영할까요?
          </div>
          <div style={{ fontSize: 12, color: T.text3, marginTop: 4, lineHeight: 1.5 }}>
            장 본 재료 중 팬트리에 추가할 항목을 선택하세요. 선택하지 않으면 반영하지 않아요.
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {buy.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: T.text3, fontSize: 13 }}>
              담은 재료가 없어요.
            </div>
          ) : buy.map(it => {
            const on = picked.has(it.name);
            return (
              <button key={it.name} onClick={() => togglePick(it.name)} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 4px', border: 'none', background: 'none', cursor: 'pointer',
                borderBottom: `1px solid ${T.surfaceSubtle}`, textAlign: 'left',
              }}>
                <div style={{
                  width: 22, height: 22, borderRadius: 6,
                  background: on ? T.mint : '#fff',
                  border: `1.5px solid ${on ? T.mint : T.border}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>{on && Icon.check('#fff')}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: T.ink }}>{it.name}</div>
                  <div style={{ fontSize: 11, color: T.text3 }}>{it.qty}</div>
                </div>
              </button>
            );
          })}
        </div>
        <div style={{ padding: 16, borderTop: `1px solid ${T.border}`, display: 'flex', gap: 8 }}>
          <button onClick={() => onConfirm([])} style={{
            ...smallSecBtn, padding: '12px 14px', fontSize: 13,
          }}>반영 안 함</button>
          <Button full disabled={picked.size === 0} onClick={() => onConfirm([...picked])}>
            {picked.size}개 반영하기
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// SETTINGS — cook-mode prefs + nickname/logout/account-delete
// ─────────────────────────────────────────────────────────────
function SettingsScreen({ profile, onBack, onUpdateProfile, onLogout, onDeleteAccount, showToast }) {
  const [keepAwake, setKeepAwake] = useState_W(true);
  const [voice, setVoice] = useState_W(false);
  const [autoNext, setAutoNext] = useState_W(false);
  const [showNick, setShowNick] = useState_W(false);
  const [confirmLogout, setConfirmLogout] = useState_W(false);
  const [confirmDelete, setConfirmDelete] = useState_W(false);

  return (
    <div style={{ background: T.surfaceFill, minHeight: '100%', paddingBottom: 40 }}>
      <AppBar title="설정" left={<button onClick={onBack} style={iconBtn}>{Icon.chevL()}</button>} />

      <Section title="계정">
        <Row left="닉네임" right={<>
          <span style={{ fontSize: 13, color: T.text2 }}>{profile.nickname}</span>
          <button onClick={() => setShowNick(true)} style={editLinkBtn}>변경</button>
        </>} />
        <Row left="이메일" right={<span style={{ fontSize: 13, color: T.text3 }}>{profile.email}</span>} />
      </Section>

      <Section title="요리 모드">
        <ToggleRow label="화면 켜둠" sub="요리 중 화면이 꺼지지 않아요" on={keepAwake} onChange={setKeepAwake} />
        <ToggleRow label="음성 안내" sub="단계 음성을 읽어줘요 (베타)" on={voice} onChange={setVoice} />
        <ToggleRow label="타이머 끝나면 다음 단계 자동" sub="" on={autoNext} onChange={setAutoNext} />
      </Section>

      <Section title="기타">
        <Row left="로그아웃" right={<button onClick={() => setConfirmLogout(true)} style={editLinkBtn}>실행</button>} />
        <Row left={<span style={{ color: T.red }}>회원 탈퇴</span>}
          right={<button onClick={() => setConfirmDelete(true)} style={{ ...editLinkBtn, color: T.red }}>탈퇴</button>} />
      </Section>

      {showNick && (
        <NicknameEditSheet current={profile.nickname}
          onClose={() => setShowNick(false)}
          onSave={(v) => { onUpdateProfile({ nickname: v }); setShowNick(false); showToast?.('닉네임이 변경됐어요'); }} />
      )}
      {confirmLogout && (
        <ConfirmDialog title="로그아웃 할까요?" body="다시 로그인해야 식단·팬트리가 동기화돼요."
          confirmLabel="로그아웃" onClose={() => setConfirmLogout(false)}
          onConfirm={() => { setConfirmLogout(false); onLogout(); }} />
      )}
      {confirmDelete && (
        <ConfirmDialog title="정말 탈퇴하시겠어요?"
          body="모든 식단, 레시피, 팬트리 기록이 영구 삭제됩니다. 이 동작은 되돌릴 수 없어요."
          destructive confirmLabel="탈퇴하기" onClose={() => setConfirmDelete(false)}
          onConfirm={() => { setConfirmDelete(false); onDeleteAccount(); }}
          extra={<div style={{
            padding: 10, background: '#FFF5F5', borderRadius: 8, fontSize: 11, color: T.red, lineHeight: 1.5,
          }}>⚠ 7일 이내 재로그인 시 일부 데이터는 복구가 가능합니다 (베타).</div>} />
      )}
    </div>
  );
}
function Row({ left, right }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '12px 0', borderBottom: `1px solid ${T.surfaceSubtle}`,
    }}>
      <div style={{ fontSize: 14, color: T.ink, fontWeight: 600 }}>{left}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>{right}</div>
    </div>
  );
}
function ToggleRow({ label, sub, on, onChange }) {
  return (
    <Row left={<div>
      <div style={{ fontSize: 14, color: T.ink, fontWeight: 600 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>{sub}</div>}
    </div>} right={
      <button onClick={() => onChange(!on)} style={{
        width: 44, height: 26, borderRadius: 13,
        background: on ? T.mint : '#DEE2E6', border: 'none',
        position: 'relative', cursor: 'pointer', transition: 'background 0.15s',
      }}>
        <div style={{
          position: 'absolute', top: 2, left: on ? 20 : 2,
          width: 22, height: 22, borderRadius: 11, background: '#fff',
          transition: 'left 0.15s', boxShadow: '0 1px 3px rgba(0,0,0,0.16)',
        }} />
      </button>
    } />
  );
}
const editLinkBtn = {
  background: 'none', border: 'none', color: T.mintDeep,
  fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0,
};

function NicknameEditSheet({ current, onClose, onSave }) {
  const [v, setV] = useState_W(current || '');
  const valid = v.trim().length >= 2 && v.trim().length <= 12;
  return (
    <div style={overlay} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: '20px 20px 0 0',
        position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20,
      }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: T.ink, fontFamily: T.fontBrand, marginBottom: 12 }}>
          닉네임 변경
        </div>
        <input value={v} onChange={e => setV(e.target.value)} autoFocus
          placeholder="2~12자" maxLength={12} style={inp} />
        <div style={{ fontSize: 11, color: T.text3, marginTop: 6 }}>
          {v.trim().length}/12자
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <Button variant="neutral" onClick={onClose}>취소</Button>
          <Button full disabled={!valid} onClick={() => onSave(v.trim())}>저장</Button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MYPAGE TABS — recipebook + shopping history (host inside MyPage)
// ─────────────────────────────────────────────────────────────
function MyPageRecipebookTab({ onOpenBook, onCreateBook, onDeleteBook }) {
  const [confirmId, setConfirmId] = useState_W(null);
  const books = [
    { id: 'b_saved', kind: 'saved', name: '저장한 레시피', count: 8, emoji: '🔖' },
    { id: 'b_custom1', kind: 'custom', name: '평일 저녁 빠른요리', count: 12, emoji: '🍳' },
    { id: 'b_custom2', kind: 'custom', name: '주말 한 상 차림', count: 5, emoji: '🍽️' },
  ];
  return (
    <div style={{ padding: 16 }}>
      {books.map(b => (
        <div key={b.id} style={{
          display: 'flex', alignItems: 'center', gap: 12,
          background: '#fff', border: `1px solid ${T.border}`, borderRadius: 12,
          padding: '14px 16px', marginBottom: 8,
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: 10, background: T.mintSoft,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
          }}>{b.emoji}</div>
          <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => onOpenBook(b.id)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>{b.name}</span>
              <span style={{
                fontSize: 10, color: T.text3, background: T.surfaceFill,
                padding: '2px 6px', borderRadius: 4, fontWeight: 600,
              }}>{b.kind === 'saved' ? '저장' : '내 책'}</span>
            </div>
            <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>{b.count}개 레시피</div>
          </div>
          {b.kind === 'custom' && (
            <button onClick={() => setConfirmId(b.id)} style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 8, color: T.text4, fontSize: 18,
            }}>⋯</button>
          )}
        </div>
      ))}
      <button onClick={onCreateBook} style={{
        width: '100%', padding: '14px 0', background: 'none',
        border: `1.5px dashed ${T.border}`, borderRadius: 12, color: T.text3,
        fontSize: 13, fontWeight: 700, cursor: 'pointer', marginTop: 4,
      }}>+ 새 레시피북 만들기</button>

      {confirmId && (
        <ConfirmDialog title="레시피북을 삭제할까요?" body="레시피북 안의 레시피는 삭제되지 않아요."
          destructive confirmLabel="삭제하기"
          onClose={() => setConfirmId(null)}
          onConfirm={() => { onDeleteBook(confirmId); setConfirmId(null); }} />
      )}
    </div>
  );
}
function MyPageShoppingTab({ shoppingLists, onOpen }) {
  return (
    <div style={{ padding: 16 }}>
      {shoppingLists.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: 12, padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🛒</div>
          <div style={{ fontSize: 13, color: T.text3 }}>아직 장보기 기록이 없어요</div>
        </div>
      ) : shoppingLists.map(l => (
        <button key={l.id} onClick={() => onOpen(l.id)} style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 12,
          background: '#fff', border: `1px solid ${T.border}`, borderRadius: 12,
          padding: '14px 16px', marginBottom: 8, cursor: 'pointer', textAlign: 'left',
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: l.status === 'completed' ? T.mintSoft : T.surfaceFill,
            color: l.status === 'completed' ? T.mintDeep : T.text2,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
          }}>{l.status === 'completed' ? '✓' : '🛒'}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>{l.name}</div>
            <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>
              {l.items.length}개 재료 · {l.status === 'completed' ? `완료 · ${l.completedAt || ''}` : '진행 중'}
            </div>
          </div>
          {Icon.chevR(T.text4)}
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// PANTRY — PantryAddSheet + PANTRY_BUNDLE_PICKER
// ─────────────────────────────────────────────────────────────
function PantryAddSheet({ onClose, onAddItem, onOpenBundle }) {
  const [name, setName] = useState_W('');
  const [section, setSection] = useState_W('냉장');
  const sections = ['냉장', '냉동', '실온', '양념', '기타'];
  const valid = name.trim().length > 0;
  return (
    <div style={overlay} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: '20px 20px 0 0',
        position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20,
      }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: T.ink, fontFamily: T.fontBrand, marginBottom: 12 }}>
          재료 추가
        </div>

        <button onClick={onOpenBundle} style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 12,
          background: T.mintSoft, border: `1px solid ${T.mint}`,
          borderRadius: 10, padding: '12px 14px', cursor: 'pointer', textAlign: 'left',
          marginBottom: 14,
        }}>
          <span style={{ fontSize: 22 }}>📦</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.mintDeep }}>묶음으로 한꺼번에 추가</div>
            <div style={{ fontSize: 11, color: T.mintDeep, marginTop: 2 }}>김치찌개 재료 / 한식 기본 양념 등</div>
          </div>
          {Icon.chevR(T.mintDeep)}
        </button>

        <Field label="재료 이름">
          <input value={name} onChange={e => setName(e.target.value)} autoFocus
            placeholder="예: 양파" style={inp} />
        </Field>
        <Field label="구역">
          <div style={{ display: 'flex', gap: 6 }}>
            {sections.map(s => (
              <button key={s} onClick={() => setSection(s)} style={{
                flex: 1, padding: '10px 0', borderRadius: 8, fontSize: 12, fontWeight: 700,
                background: section === s ? T.mintSoft : '#fff',
                color: section === s ? T.mintDeep : T.text2,
                border: section === s ? `1px solid ${T.mint}` : `1px solid ${T.border}`,
                cursor: 'pointer',
              }}>{s}</button>
            ))}
          </div>
        </Field>

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <Button variant="neutral" onClick={onClose}>취소</Button>
          <Button full disabled={!valid} onClick={() => onAddItem({ name: name.trim(), section, have: true })}>추가</Button>
        </div>
      </div>
    </div>
  );
}

function PantryBundlePicker({ onClose, onConfirm }) {
  const bundles = [
    { id: 'kor_basic', name: '한식 기본 양념', emoji: '🧂', items: ['간장','된장','고추장','참기름','다진마늘','설탕'] },
    { id: 'kimchi_jjigae', name: '김치찌개 재료', emoji: '🥘', items: ['김치','돼지고기','두부','대파','양파'] },
    { id: 'pasta_basic', name: '파스타 기본', emoji: '🍝', items: ['스파게티','올리브유','마늘','파마산','페퍼론치노'] },
    { id: 'salad_basic', name: '샐러드 기본', emoji: '🥗', items: ['양상추','방울토마토','오이','드레싱','계란'] },
  ];
  const [selectedId, setSelectedId] = useState_W(null);
  const [picked, setPicked] = useState_W(new Set());
  const bundle = bundles.find(b => b.id === selectedId);
  const togglePick = (n) => setPicked(p => { const x = new Set(p); x.has(n) ? x.delete(n) : x.add(n); return x; });

  return (
    <div style={overlay} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: '20px 20px 0 0',
        position: 'absolute', bottom: 0, left: 0, right: 0,
        maxHeight: '85%', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '18px 20px 12px', borderBottom: `1px solid ${T.border}`,
          display: 'flex', alignItems: 'center', gap: 8 }}>
          {selectedId && (
            <button onClick={() => { setSelectedId(null); setPicked(new Set()); }} style={iconBtn}>{Icon.chevL()}</button>
          )}
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: T.ink, fontFamily: T.fontBrand }}>
              {bundle ? bundle.name : '재료 묶음 선택'}
            </div>
            <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>
              {bundle ? '추가할 항목을 골라주세요' : '자주 함께 쓰는 재료를 한 번에 추가해요'}
            </div>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {!bundle ? bundles.map(b => (
            <button key={b.id} onClick={() => { setSelectedId(b.id); setPicked(new Set(b.items)); }} style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 12,
              background: '#fff', border: `1px solid ${T.border}`, borderRadius: 12,
              padding: '12px 14px', marginBottom: 8, cursor: 'pointer', textAlign: 'left',
            }}>
              <span style={{ fontSize: 24 }}>{b.emoji}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.ink }}>{b.name}</div>
                <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>{b.items.join(', ')}</div>
              </div>
              {Icon.chevR(T.text4)}
            </button>
          )) : bundle.items.map(it => {
            const on = picked.has(it);
            return (
              <button key={it} onClick={() => togglePick(it)} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                background: '#fff', border: `1px solid ${T.border}`, borderRadius: 10,
                padding: '12px 14px', marginBottom: 6, cursor: 'pointer', textAlign: 'left',
              }}>
                <div style={{
                  width: 22, height: 22, borderRadius: 6,
                  background: on ? T.mint : '#fff', border: `1.5px solid ${on ? T.mint : T.border}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>{on && Icon.check('#fff')}</div>
                <span style={{ fontSize: 14, color: T.ink, fontWeight: 600 }}>{it}</span>
              </button>
            );
          })}
        </div>

        {bundle && (
          <div style={{ padding: 16, borderTop: `1px solid ${T.border}`, display: 'flex', gap: 8 }}>
            <Button variant="neutral" onClick={onClose}>취소</Button>
            <Button full disabled={picked.size === 0} onClick={() => onConfirm([...picked])}>
              {picked.size}개 추가
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// COOK_MODE — ConsumedIngredientChecklist sheet (요리 완료 직전)
// ─────────────────────────────────────────────────────────────
function ConsumedIngredientSheet({ recipe, defaultSelection, onClose, onConfirm }) {
  const [picked, setPicked] = useState_W(new Set(defaultSelection || (recipe.ingredients || []).map(i => i.name)));
  const toggle = (n) => setPicked(p => { const x = new Set(p); x.has(n) ? x.delete(n) : x.add(n); return x; });
  return (
    <div style={overlay} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: '20px 20px 0 0',
        position: 'absolute', bottom: 0, left: 0, right: 0,
        maxHeight: '85%', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '18px 20px 12px', borderBottom: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: T.ink, fontFamily: T.fontBrand }}>
            소진된 재료를 확인해주세요
          </div>
          <div style={{ fontSize: 12, color: T.text3, marginTop: 4, lineHeight: 1.5 }}>
            체크된 재료는 팬트리에서 자동으로 빠져요. (요리: {recipe.name})
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {(recipe.ingredients || []).map(it => {
            const on = picked.has(it.name);
            return (
              <button key={it.name} onClick={() => toggle(it.name)} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                background: '#fff', border: `1px solid ${T.border}`, borderRadius: 10,
                padding: '12px 14px', marginBottom: 6, cursor: 'pointer', textAlign: 'left',
              }}>
                <div style={{
                  width: 22, height: 22, borderRadius: 6,
                  background: on ? T.mint : '#fff', border: `1.5px solid ${on ? T.mint : T.border}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>{on && Icon.check('#fff')}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: T.ink }}>{it.name}</div>
                  <div style={{ fontSize: 11, color: T.text3 }}>{it.qty}</div>
                </div>
              </button>
            );
          })}
        </div>
        <div style={{ padding: 16, borderTop: `1px solid ${T.border}`, display: 'flex', gap: 8 }}>
          <Button variant="neutral" onClick={() => onConfirm([])}>건너뛰기</Button>
          <Button full onClick={() => onConfirm([...picked])}>요리 완료 ({picked.size}개 차감)</Button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, {
  ConfirmDialog, LoginScreen, MenuAddScreen, RecipeSearchPicker, RecipeBookSelector,
  RecipeBookDetailPicker, PantryMatchPicker, LeftoversScreen, AteListScreen,
  ManualRecipeCreateScreen, YtImportScreen, ShoppingDetailScreen, PantryReflectPicker,
  SettingsScreen, NicknameEditSheet, MyPageRecipebookTab, MyPageShoppingTab,
  PantryAddSheet, PantryBundlePicker, ConsumedIngredientSheet,
});
