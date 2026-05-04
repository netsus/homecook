// Modals / Sheets — Quiet Kitchen Sheet style (olive base + thin orange)
function Sheet({ title, onClose, children, footer }) {
  return (
    <>
      <div onClick={onClose} style={{
        position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100,
      }} />
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 101,
        background: '#FAF8F2', // olive base
        borderTopLeftRadius: 20, borderTopRightRadius: 20,
        borderTop: `2px solid ${T.orange}`, // thin orange highlight
        maxHeight: '85%', overflowY: 'auto',
        boxShadow: T.shadowCrisp,
        paddingBottom: 24,
      }}>
        {/* Grabber */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 0' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: T.border }} />
        </div>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', padding: '12px 20px 8px',
        }}>
          <div style={{ flex: 1, fontSize: 18, fontWeight: 700, color: T.ink }}>{title}</div>
          <button onClick={onClose} style={{
            width: 32, height: 32, borderRadius: 16,
            background: T.surfaceFill, border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{Icon.close()}</button>
        </div>
        <div style={{ padding: '8px 20px 16px' }}>{children}</div>
        {footer && (
          <div style={{ padding: '12px 20px 8px', borderTop: `1px solid ${T.border}` }}>
            {footer}
          </div>
        )}
      </div>
    </>
  );
}

function PlannerAddPopup({ recipeId, onClose, onConfirm, planner }) {
  const recipe = RECIPES.find(r => r.id === recipeId);
  const keys = Object.keys(planner);
  const [selDate, setSelDate] = React.useState(keys[todayIdx]);
  const [selSlot, setSelSlot] = React.useState('저녁');
  const [qty, setQty] = React.useState(recipe?.servings || 1);

  return (
    <Sheet title="플래너에 추가" onClose={onClose} footer={
      <Button variant="primary" full onClick={() => onConfirm(selDate, selSlot, qty)}>
        {selDate} {selSlot}에 추가
      </Button>
    }>
      {/* Recipe preview */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: 12,
        background: '#fff', borderRadius: 12, marginBottom: 16,
        border: `1px solid ${T.border}`,
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: 8, background: recipe.bg,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26,
        }}>{recipe.emoji}</div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>{recipe.name}</div>
          <div style={{ fontSize: 12, color: T.text3 }}>{recipe.minutes}분 · {recipe.kcal}kcal</div>
        </div>
      </div>

      {/* Date chips: 요일 + 4/17 */}
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
              fontSize: 13, fontWeight: active ? 700 : 500, cursor: 'pointer',
            }}>
              {weekDays[i]} {k}
            </button>
          );
        })}
      </div>

      {/* Slot */}
      <div style={{ fontSize: 13, color: T.text2, fontWeight: 600, marginBottom: 8 }}>식사 시간</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {['아침','점심','저녁'].map(s => {
          const active = selSlot === s;
          return (
            <button key={s} onClick={() => setSelSlot(s)} style={{
              flex: 1, padding: '10px 0', borderRadius: 10,
              background: active ? T.mintSoft : '#fff',
              color: active ? T.mintDeep : T.text2,
              border: `1px solid ${active ? T.mint : T.border}`,
              fontSize: 14, fontWeight: active ? 700 : 500, cursor: 'pointer',
            }}>{s}</button>
          );
        })}
      </div>

      {/* Compact stepper */}
      <div style={{ fontSize: 13, color: T.text2, fontWeight: 600, marginBottom: 8 }}>인분</div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: 10, background: '#fff', borderRadius: 10, border: `1px solid ${T.border}`,
      }}>
        <div style={{ fontSize: 14, color: T.text2 }}>몇 인분 계획할까요?</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => setQty(Math.max(1, qty - 1))} style={{
            width: 28, height: 28, borderRadius: 14, border: `1px solid ${T.border}`,
            background: '#fff', cursor: 'pointer', fontSize: 14, color: T.ink,
          }}>−</button>
          <div style={{ minWidth: 20, textAlign: 'center', fontWeight: 700, color: T.ink }}>{qty}</div>
          <button onClick={() => setQty(qty + 1)} style={{
            width: 28, height: 28, borderRadius: 14, border: 'none',
            background: T.ink, color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 700,
          }}>+</button>
        </div>
      </div>
    </Sheet>
  );
}

function SavePopup({ recipeId, onClose, onConfirm, saved }) {
  const recipe = RECIPES.find(r => r.id === recipeId);
  const [folder, setFolder] = React.useState('기본 폴더');
  const folders = ['기본 폴더', '주말에 해먹기', '주중 간단식', '손님 오는 날'];

  return (
    <Sheet title="레시피 저장" onClose={onClose} footer={
      <Button variant="primary" full onClick={() => onConfirm()}>
        {saved ? '저장 취소' : `${folder}에 저장`}
      </Button>
    }>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: 12,
        background: '#fff', borderRadius: 12, marginBottom: 16, border: `1px solid ${T.border}`,
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: 8, background: recipe.bg,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26,
        }}>{recipe.emoji}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>{recipe.name}</div>
          <div style={{ fontSize: 12, color: T.text3 }}>{recipe.theme}</div>
        </div>
      </div>
      <div style={{ fontSize: 13, color: T.text2, fontWeight: 600, marginBottom: 8 }}>폴더 선택</div>
      <div style={{ background: '#fff', borderRadius: 10, border: `1px solid ${T.border}` }}>
        {folders.map((f, i) => (
          <div key={f} onClick={() => setFolder(f)} style={{
            display: 'flex', alignItems: 'center', padding: '12px 16px', cursor: 'pointer',
            borderBottom: i < folders.length - 1 ? `1px solid ${T.surfaceSubtle}` : 'none',
          }}>
            <div style={{
              width: 18, height: 18, borderRadius: 9,
              border: `2px solid ${folder === f ? T.mint : T.border}`,
              background: folder === f ? T.mint : '#fff',
              marginRight: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>{folder === f && <div style={{ width: 6, height: 6, borderRadius: 3, background: '#fff' }} />}</div>
            <div style={{ flex: 1, fontSize: 14, color: T.ink }}>{f}</div>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

function SortSheet({ value, onChange, onClose }) {
  const opts = [
    ['latest', '최신순'],
    ['rating', '별점순'],
    ['saves', '저장순'],
    ['fast', '빠른 조리순'],
  ];
  return (
    <Sheet title="정렬" onClose={onClose}>
      <div style={{ background: '#fff', borderRadius: 10, border: `1px solid ${T.border}` }}>
        {opts.map(([k,l], i) => (
          <div key={k} onClick={() => { onChange(k); onClose(); }} style={{
            display: 'flex', alignItems: 'center', padding: '14px 16px', cursor: 'pointer',
            borderBottom: i < opts.length - 1 ? `1px solid ${T.surfaceSubtle}` : 'none',
          }}>
            <div style={{ flex: 1, fontSize: 15, fontWeight: value === k ? 700 : 500, color: T.ink }}>{l}</div>
            {value === k && <div style={{ color: T.mint }}>{Icon.check(T.mint)}</div>}
          </div>
        ))}
      </div>
    </Sheet>
  );
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
    </Sheet>
  );
}

function Toast({ message }) {
  if (!message) return null;
  return (
    <div style={{
      position: 'absolute', bottom: 110, left: '50%', transform: 'translateX(-50%)',
      zIndex: 200, background: 'rgba(33,37,41,0.95)', color: '#fff',
      padding: '12px 20px', borderRadius: 9999, fontSize: 13, fontWeight: 600,
      boxShadow: T.shadowSharp, whiteSpace: 'nowrap',
    }}>{message}</div>
  );
}

Object.assign(window, { Sheet, PlannerAddPopup, SavePopup, SortSheet, LoginGate, Toast });
