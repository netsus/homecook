// ===== screens/modals.jsx =====
// Modals / Sheets — unified white bottom sheet style
function Sheet({ title, onClose, children, footer }) {
  return (
    <>
      <div onClick={onClose} style={{
        position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.42)', zIndex: 210
      }} />
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 211,
        width: '100%', maxWidth: 480, margin: '0 auto',
        background: '#fff',
        borderTopLeftRadius: 20, borderTopRightRadius: 20,
        maxHeight: '85%', overflowY: 'auto',
        boxShadow: T.shadowCrisp,
        paddingBottom: 24
      }}>
        {/* Grabber */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 0' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: T.border }} />
        </div>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', padding: '12px 20px 8px'
        }}>
          <div style={{ flex: 1, fontSize: 18, fontWeight: 700, color: T.ink }}>{title}</div>
          <button onClick={onClose} style={{
            width: 32, height: 32, borderRadius: 16,
            background: T.surfaceFill, border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>{Icon.close()}</button>
        </div>
        <div style={{ padding: '8px 20px 16px' }}>{children}</div>
        {footer &&
        <div style={{ padding: '12px 20px 8px', borderTop: `1px solid ${T.border}`, background: '#fff' }}>
            {footer}
          </div>
        }
      </div>
    </>);

}

function PlannerAddPopup({ recipeId, onClose, onConfirm, planner }) {
  const recipe = RECIPES.find((r) => r.id === recipeId);
  const keys = Object.keys(planner);
  const [selDate, setSelDate] = React.useState(keys[todayIdx]);
  const [selSlot, setSelSlot] = React.useState('저녁');
  const [qty, setQty] = React.useState(recipe?.servings || 1);

  return (
    <Sheet title="플래너에 추가" onClose={onClose} footer={
    <div style={{ display: 'flex', gap: 8 }}>
        <Button variant="neutral" style={{ flex: '0 0 88px', whiteSpace: 'nowrap' }} onClick={onClose}>
          취소
        </Button>
        <Button variant="primary" full onClick={() => onConfirm(selDate, selSlot, qty)}>
          {selDate} {selSlot}에 추가
        </Button>
      </div>
    }>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: 12,
        background: T.surfaceFill, borderRadius: 12, marginBottom: 16,
        border: `1px solid ${T.border}`
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: 8, background: recipe.bg,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26
        }}>{recipe.emoji}</div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>{recipe.name}</div>
          <div style={{ fontSize: 12, color: T.text3 }}>{recipe.minutes}분 · 선택 {qty}인분</div>
        </div>
      </div>

      <div style={{ fontSize: 13, color: T.text2, fontWeight: 600, marginBottom: 8 }}>날짜</div>
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 16, paddingBottom: 4 }}>
        {keys.map((k, i) => {
          const active = selDate === k;
          return (
            <button key={k} onClick={() => setSelDate(k)} style={{
              flexShrink: 0, padding: '8px 12px', borderRadius: 9999,
              background: active ? T.ink : '#fff',
              color: active ? '#fff' : T.text2,
              border: `1px solid ${active ? T.ink : T.border}`,
              fontSize: 13, fontWeight: active ? 700 : 500, cursor: 'pointer'
            }}>
              {weekDays[i]} {k}
            </button>);

        })}
      </div>

      <div style={{ fontSize: 13, color: T.text2, fontWeight: 600, marginBottom: 8 }}>끼니</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {['아침', '점심', '저녁'].map((s) => {
          const active = selSlot === s;
          return (
            <button key={s} onClick={() => setSelSlot(s)} style={{
              flex: 1, padding: '10px 0', borderRadius: 10,
              background: active ? T.mintSoft : '#fff',
              color: active ? T.mintDeep : T.text2,
              border: `1px solid ${active ? T.mint : T.border}`,
              fontSize: 14, fontWeight: active ? 700 : 500, cursor: 'pointer'
            }}>{s}</button>);

        })}
      </div>

      <div style={{ fontSize: 13, color: T.text2, fontWeight: 600, marginBottom: 8 }}>인분</div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: 10, background: T.surfaceFill, borderRadius: 10, border: `1px solid ${T.border}`
      }}>
        <div style={{ fontSize: 14, color: T.text2 }}>몇 인분 계획할까요?</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => setQty(Math.max(1, qty - 1))} style={{
            width: 28, height: 28, borderRadius: 14, border: `1px solid ${T.border}`,
            background: '#fff', cursor: 'pointer', fontSize: 14, color: T.ink
          }}>−</button>
          <div style={{ minWidth: 20, textAlign: 'center', fontWeight: 700, color: T.ink }}>{qty}</div>
          <button onClick={() => setQty(qty + 1)} style={{
            width: 28, height: 28, borderRadius: 14, border: 'none',
            background: T.ink, color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 700
          }}>+</button>
        </div>
      </div>
    </Sheet>);

}

function SavePopup({ recipeId, onClose, onConfirm, saved, savedBookIds = [], books: providedBooks, onCreateBook }) {
  const [creating, setCreating] = React.useState(false);
  const [newName, setNewName] = React.useState('');
  const fallbackBooks = [
    { id: 'b_saved', kind: 'saved', name: '저장한 레시피', emoji: '🔖', recipeIds: [] },
    { id: 'b_custom1', kind: 'custom', name: '평일 저녁 빠른요리', emoji: '🍳', recipeIds: [] },
    { id: 'b_custom2', kind: 'custom', name: '주말 한 상 차림', emoji: '🍽️', recipeIds: [] },
  ];
  const baseBooks = (providedBooks && providedBooks.length)
    ? providedBooks
    : (window.RECIPEBOOK_SAMPLES && window.RECIPEBOOK_SAMPLES.length)
    ? window.RECIPEBOOK_SAMPLES
    : fallbackBooks;
  const books = baseBooks;
  const [selected, setSelected] = React.useState(() => new Set(
    savedBookIds.length ? savedBookIds : (saved ? ['b_saved'] : [])
  ));
  const toggleBook = (id) => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  return (
    <Sheet title="레시피 저장" onClose={onClose} footer={
    <div style={{ display: 'flex', gap: 8 }}>
        <Button variant="neutral" style={{ flex: '0 0 88px', whiteSpace: 'nowrap' }} onClick={onClose}>
          취소
        </Button>
        <Button variant="primary" full onClick={() => onConfirm([...selected])}>
          {selected.size ? `${selected.size}개 레시피북 반영` : '저장 해제'}
        </Button>
      </div>
    }>
      {/* vNext S3 — 레시피 정보 프리뷰 섹션 제거 */}
      <div style={{ fontSize: 13, color: T.text2, fontWeight: 600, marginBottom: 8 }}>레시피북 다중 선택</div>
      <div style={{ background: '#fff', borderRadius: 10, border: `1px solid ${T.border}` }}>
        {books.map((book, i) => {
          const on = selected.has(book.id);
          return (
        <div key={book.id} onClick={() => toggleBook(book.id)} style={{
          display: 'flex', alignItems: 'center', padding: '12px 16px', cursor: 'pointer',
          borderBottom: `1px solid ${T.surfaceSubtle}`
        }}>
            <div style={{
            width: 20, height: 20, borderRadius: 6,
            border: `2px solid ${on ? T.mint : T.border}`,
            background: on ? T.mint : '#fff',
            marginRight: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>{on && Icon.check('#fff')}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, color: T.ink, fontWeight: 800 }}>{book.name}</div>
              <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>
                {on ? '저장됨 · 선택 해제하면 이 책에서 삭제' : '미저장 · 선택하면 이 책에 추가'}
              </div>
            </div>
            <span style={{
              fontSize: 11, color: book.kind === 'saved' ? T.mintDeep : T.text3,
              background: book.kind === 'saved' ? T.mintSoft : T.surfaceFill,
              padding: '3px 7px', borderRadius: 9999, fontWeight: 800,
            }}>{book.kind === 'saved' ? '저장' : '내 책'}</span>
          </div>
          );
        })}
        {/* vNext S3 — 새 레시피북 만들기 인라인 UI */}
        {/* CONTRACT_CHECK: 레시피북 생성 API (POST /recipe-books) 트랜잭션 위치 확정 필요 — vNext에서는 UI shape만 */}
        {!creating ? (
          <div onClick={() => setCreating(true)} style={{
            display: 'flex', alignItems: 'center', padding: '12px 16px', cursor: 'pointer',
            color: T.mint, fontSize: 14, fontWeight: 600, gap: 8
          }}>
            <span style={{ fontSize: 18, lineHeight: 1 }}>+</span> 새 레시피북 만들기
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', gap: 8 }}>
            <input
              autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="레시피북 이름"
              style={{
                flex: 1, padding: '8px 10px', border: `1px solid ${T.mint}`,
                borderRadius: 8, fontSize: 14, outline: 'none', color: T.ink,
                fontFamily: T.fontUI
              }}
            />
            <button onClick={() => {
              const name = newName.trim();
              if (!name) return;
              const id = onCreateBook ? onCreateBook(name) : 'b_new_' + Date.now();
              setSelected(prev => new Set([...prev, id]));
              setCreating(false);
              setNewName('');
            }} style={{
              background: T.mint, color: '#fff', border: 'none', borderRadius: 8,
              padding: '8px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer'
            }}>추가</button>
          </div>
        )}
      </div>
    </Sheet>);

}

// vNext S1 NOTE: SortSheet은 SortDropdown(components.jsx)으로 대체 예정.
// HOME S2에서 SortSheet 호출을 SortDropdown으로 교체.
// 이 컴포넌트는 교체 전까지 하위 호환용으로 유지.
function SortSheet({ value, onChange, onClose }) {
  const opts = [
  ['views', '조회수순'],
  ['latest', '최신순'],
  ['saves', '저장순'],
  ['plans', '플래너 등록순']];

  return (
    <Sheet title="정렬" onClose={onClose}>
      <div style={{ background: '#fff', borderRadius: 10, border: `1px solid ${T.border}` }}>
        {opts.map(([k, l], i) =>
        <div key={k} onClick={() => {onChange(k);onClose();}} style={{
          display: 'flex', alignItems: 'center', padding: '14px 16px', cursor: 'pointer',
          borderBottom: i < opts.length - 1 ? `1px solid ${T.surfaceSubtle}` : 'none'
        }}>
            <div style={{ flex: 1, fontSize: 15, fontWeight: value === k ? 700 : 500, color: T.ink }}>{l}</div>
            {value === k && <div style={{ color: T.mint }}>{Icon.check(T.mint)}</div>}
          </div>
        )}
      </div>
    </Sheet>);

}

function LoginGate({ onClose, onLogin }) {
  return (
    <Sheet title="로그인이 필요해요" onClose={onClose} footer={
    <div style={{ display: 'flex', gap: 8 }}>
        <Button variant="neutral" style={{ flex: 1 }} onClick={onClose}>취소</Button>
        <Button variant="primary" style={{ flex: 2 }} onClick={onLogin}>로그인</Button>
      </div>
    }>
      <div style={{ padding: '8px 0 16px', fontSize: 14, color: T.text2, lineHeight: 1.57 }}>
        이 기능은 로그인 후 이용할 수 있어요. 로그인하면 원래 하려던 작업으로 자동 이동합니다.
      </div>
    </Sheet>);

}

function Toast({ message }) {
  if (!message) return null;
  return (
    <div style={{
      position: 'absolute', bottom: 110, left: '50%', transform: 'translateX(-50%)',
      zIndex: 200, background: 'rgba(33,37,41,0.95)', color: '#fff',
      padding: '12px 20px', borderRadius: 9999, fontSize: 13, fontWeight: 600,
      boxShadow: T.shadowSharp, whiteSpace: 'nowrap'
    }}>{message}</div>);

}

Object.assign(window, { Sheet, PlannerAddPopup, SavePopup, SortSheet, LoginGate, Toast });
