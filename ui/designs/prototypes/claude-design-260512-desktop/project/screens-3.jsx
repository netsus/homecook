/* global React */
/* ============================================
   MEAL_SCREEN + MENU_ADD + SHOPPING_DETAIL + SHOPPING_FLOW + sub screens
   ============================================ */
const { useState: useS3, useMemo: useMemo3 } = React;
const {
  Icon, Button, Chip, Tag, StatePanel, ScreenHeader, SegmentedRow, DateChipRail, Stepper,
} = window.HC;
const D3 = window.HC_DATA;

/* ============================================
   MEAL_SCREEN (§6) — Today/Specific meal detail
   ============================================ */
function MealScreen({ mealId, onBack, onCook, onGoShopping, onGoRecipe, onDelete, onChangeServings, toast }) {
  const meal = D3.MEALS.find(m => m.id === mealId);
  const recipe = meal ? D3.RECIPE[meal.recipeId] : null;
  if (!meal || !recipe) return null;

  const ate = false; // could be derived
  const dayLabel = D3.fmtPlannerDate(meal.date);

  return (
    <main className="screen">
      <div className="breadcrumb">
        <button onClick={onBack} className="breadcrumb-link">
          <Icon name="chevL" size={14} /> 플래너
        </button>
        <span className="breadcrumb-sep">/</span>
        <span className="breadcrumb-cur">{dayLabel} · {D3.MEAL_COLUMNS.find(c => c.id === meal.col)?.name}</span>
      </div>

      <div className="meal-layout">
        <div className="meal-main">
          <div className="meal-hero">
            <img src={recipe.photo} alt={recipe.title} onError={(e) => { e.currentTarget.style.display = "none"; }}/>
            <div className="meal-hero-overlay">
              <span className={`meal-status-pill status-${meal.status}`}>
                <span className={`status-dot status-${meal.status}`} />
                {meal.status === "registered" ? "등록됨" : meal.status === "shopped" ? "장본 끼니" : "요리 완료"}
              </span>
            </div>
          </div>

          <div className="meal-titleblock">
            <h1 className="h1">{recipe.title}</h1>
            <div className="text-meta tabular">
              {dayLabel} · {D3.MEAL_COLUMNS.find(c => c.id === meal.col)?.name} · {meal.servings}인분
            </div>
            <p className="reading-lead" style={{ marginTop: 16 }}>{recipe.description}</p>
          </div>

          <section className="reading-section">
            <h2 className="h2">재료 ({meal.servings}인분 기준)</h2>
            <ul className="ing-list">
              {recipe.ingredients.map((i, idx) => {
                const name = i.id ? D3.ING[i.id]?.name : i.name;
                const factor = meal.servings / recipe.baseServings;
                const v = typeof i.amount === "number" ? i.amount * factor : i.amount;
                return (
                  <li key={idx} className="ing-row">
                    <span className="ing-name">{name}</span>
                    <span className="ing-amount tabular">
                      {typeof v === "number" ? (v >= 10 ? Math.round(v * 10) / 10 : v.toFixed(2).replace(/\.?0+$/, "")) : v}
                      {i.unit ? ` ${i.unit}` : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        <aside className="meal-rail">
          <div className="rail-card">
            <div className="rail-section">
              <Button variant="primary" full leftIcon="pot" onClick={() => onCook(meal.id)}>
                요리하기
              </Button>
              <div style={{ height: 8 }} />
              <Button variant="secondary" full leftIcon="book" onClick={() => onGoRecipe(recipe.id)}>
                원본 레시피 보기
              </Button>
            </div>
            <div className="rail-section">
              <div className="rail-title">인분 조절</div>
              <Stepper value={meal.servings} onChange={(v) => onChangeServings(meal.id, v)} min={1} max={10} unit="인분" />
            </div>
            {meal.status === "registered" && (
              <div className="rail-section">
                <Button variant="tertiary" full leftIcon="cart" onClick={onGoShopping}>
                  이번주 장보기 보기
                </Button>
              </div>
            )}
            <div className="rail-section">
              <button className="meal-danger" onClick={() => onDelete(meal.id)}>
                <Icon name="trash" size={14} /> 끼니에서 삭제
              </button>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}

/* ============================================
   MENU_ADD (§7) — 6 entry options
   ============================================ */
function MenuAddScreen({ onBack, dateISO, col, onPickRecipe, onPickFromBook, onPickByPantry, onManualCreate, onYTImport, onSearchUrl }) {
  const day = D3.WEEK_DATES.find(d => d.iso === dateISO);
  const colName = D3.MEAL_COLUMNS.find(c => c.id === col)?.name;

  const entries = [
    { id:"search", icon:"search", title:"레시피 검색",     desc:"제목·재료로 홈쿡 레시피에서 찾기",    cta:"검색하기",  on: onPickRecipe },
    { id:"book",   icon:"book",   title:"레시피북에서 선택", desc:"저장한·내가 추가한 레시피 모음에서",  cta:"북 열기",   on: onPickFromBook },
    { id:"pantry", icon:"fridge", title:"팬트리 매칭",       desc:"가지고 있는 재료에 맞춰 추천",         cta:"매칭 보기", on: onPickByPantry },
    { id:"manual", icon:"edit",   title:"직접 만들기",       desc:"내 레시피로 추가 (제목/메모만)",       cta:"입력하기",  on: onManualCreate },
    { id:"yt",     icon:"youtube",title:"유튜브 가져오기",   desc:"링크 붙여 넣어 영상 메모로 추가",      cta:"붙여넣기",  on: onYTImport },
    { id:"url",    icon:"link",   title:"웹페이지 가져오기", desc:"블로그·검색 결과를 메모로",            cta:"링크 추가", on: onSearchUrl },
  ];

  return (
    <main className="screen">
      <div className="breadcrumb">
        <button onClick={onBack} className="breadcrumb-link"><Icon name="chevL" size={14} /> 플래너</button>
        <span className="breadcrumb-sep">/</span>
        <span className="breadcrumb-cur">끼니 추가</span>
      </div>

      <ScreenHeader
        eyebrow={day ? `${day.dow} 5/${day.d} · ${colName}` : "끼니 추가"}
        title="어디서 레시피를 가져올까요?"
        lead="6가지 입구 중 하나를 골라 진행하세요."
      />

      <div className="menu-add-grid">
        {entries.map(e => (
          <button key={e.id} className="menu-add-card" onClick={e.on}>
            <div className="menu-add-icon"><Icon name={e.icon} size={20} color="var(--brand-deep)" /></div>
            <div className="menu-add-body">
              <div className="menu-add-title">{e.title}</div>
              <div className="menu-add-desc">{e.desc}</div>
            </div>
            <div className="menu-add-cta">
              {e.cta} <Icon name="chevR" size={14} />
            </div>
          </button>
        ))}
      </div>
    </main>
  );
}

/* ============================================
   SHOPPING_DETAIL (§12) — current week
   ============================================ */
function ShoppingDetailScreen({ list, pantryHeld, onTogglePantry, onBack, onMarkComplete, onOpenReAdd, onOpenPantryReflect, readOnly, toast }) {
  const [checked, setChecked] = useS3(new Set());

  if (!list) return null;

  const toggle = (id) => setChecked(prev => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const total = list.items.length;
  const done = checked.size;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const allDone = total > 0 && done === total;

  // Reflect to pantry — items not in pantry & checked
  const reflectables = list.items.filter(i => checked.has(i.id) && i.ing?.startsWith("ing-") && !pantryHeld.has(i.ing));

  return (
    <main className="screen">
      <div className="breadcrumb">
        <button onClick={onBack} className="breadcrumb-link"><Icon name="chevL" size={14} /> 마이페이지</button>
        <span className="breadcrumb-sep">/</span>
        <span className="breadcrumb-cur">{list.title}</span>
      </div>

      <ScreenHeader
        eyebrow={list.completed ? "완료된 장보기" : "진행 중"}
        title={list.title}
        lead={list.completed ? "완료된 장보기는 읽기 전용이에요." : "체크하면서 장을 보고, 마지막에 완료를 누르면 팬트리에 반영할 수 있어요."}
        right={
          !readOnly && !list.completed ? (
            <Button
              variant="primary"
              leftIcon={allDone ? "check" : "cart"}
              disabled={!allDone}
              onClick={() => { if (allDone) { onOpenPantryReflect(reflectables); onMarkComplete(list.id); } }}
            >
              장보기 완료
            </Button>
          ) : (!list.completed ? null : (
            <Button variant="tertiary" leftIcon="refresh" onClick={() => onOpenReAdd(list.id)}>
              다시 장보기
            </Button>
          ))
        }
      />

      {!list.completed && (
        <div className="shopping-progress-card">
          <div className="shopping-progress-text tabular">{done} / {total} 항목 ({pct}%)</div>
          <div className="progress">
            <div className="progress-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      <div className="shopping-grid">
        <section>
          <div className="sh-section-head">
            <div className="sh-section-title">구매할 재료</div>
            <div className="sh-section-count tabular">{total}개</div>
          </div>
          <div className="checklist-2col">
            {list.items.map(i => {
              const ck = list.completed ? !!i.checked : checked.has(i.id);
              return (
                <button
                  key={i.id}
                  className={`check-row ${ck ? "on" : ""}`}
                  onClick={() => !list.completed && !readOnly && toggle(i.id)}
                  disabled={list.completed || readOnly}
                >
                  <span className={`check-box ${ck ? "on" : ""}`}>
                    {ck && <Icon name="check" size={12} />}
                  </span>
                  <span style={{ flex: 1, textAlign: "left" }}>
                    <span className="check-name">{i.name}</span>
                  </span>
                  <span className="check-amt tabular">{i.amount}</span>
                </button>
              );
            })}
          </div>
        </section>

        <aside>
          <div className="shopping-side-card">
            <div className="shopping-side-title">팬트리에서 빠진 재료</div>
            <p className="shopping-side-help">이미 보유 중이라 장보기에서 제외됐어요. 떨어졌으면 아래에서 다시 추가하세요.</p>
            <ul className="pantry-include-list">
              {list.excluded.map(e => (
                <li key={e.id} className="pantry-include-row">
                  <span className="pantry-dot" />
                  <span style={{ flex: 1 }}>
                    <span className="pantry-include-name">{e.name}</span>
                    {e.amount && <span className="pantry-include-amount tabular"> · {e.amount}</span>}
                  </span>
                  <button className="pantry-include-btn" onClick={() => toast(`${e.name}을(를) 장보기에 추가했어요`)}>장보기 추가</button>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </main>
  );
}

/* ============================================
   SHOPPING_FLOW (§11) — entry flow chooser
   ============================================ */
function ShoppingFlowScreen({ onBack, onOpenCurrent, onOpenPast, onCreateNew, currentList }) {
  const onCardKey = (handler) => (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handler();
    }
  };

  return (
    <main className="screen">
      <div className="breadcrumb">
        <button onClick={onBack} className="breadcrumb-link"><Icon name="chevL" size={14} /> 마이페이지</button>
        <span className="breadcrumb-sep">/</span>
        <span className="breadcrumb-cur">장보기</span>
      </div>

      <ScreenHeader title="장보기" lead="플래너에 등록한 끼니로 만든 장보기 리스트가 모입니다." />

      <div className="shopping-flow-grid">
        {currentList && (
          <div
            className="shopping-flow-card primary"
            role="button"
            tabIndex={0}
            onClick={() => onOpenCurrent(currentList.id)}
            onKeyDown={onCardKey(() => onOpenCurrent(currentList.id))}
          >
            <div className="shopping-flow-eyebrow">진행 중</div>
            <div className="shopping-flow-title">{currentList.title}</div>
            <div className="shopping-flow-meta tabular">
              {currentList.items.length}개 항목 · {currentList.mealIds.length}끼
            </div>
            <Button variant="primary" rightIcon="chevR" size="sm">바로 시작</Button>
          </div>
        )}

        <div
          className="shopping-flow-card"
          role="button"
          tabIndex={0}
          onClick={onOpenPast}
          onKeyDown={onCardKey(onOpenPast)}
        >
          <div className="shopping-flow-eyebrow">과거 목록</div>
          <div className="shopping-flow-title">지난 장보기 다시 보기</div>
          <div className="shopping-flow-meta">읽기 전용 · 다시 장보기로 복원 가능</div>
          <Button variant="tertiary" rightIcon="chevR" size="sm">목록 열기</Button>
        </div>

        <div
          className="shopping-flow-card"
          role="button"
          tabIndex={0}
          onClick={onCreateNew}
          onKeyDown={onCardKey(onCreateNew)}
        >
          <div className="shopping-flow-eyebrow">직접 만들기</div>
          <div className="shopping-flow-title">새 장보기 리스트</div>
          <div className="shopping-flow-meta">플래너 없이 항목만 적기</div>
          <Button variant="tertiary" rightIcon="plus" size="sm">새로 만들기</Button>
        </div>
      </div>
    </main>
  );
}

/* ============================================
   SHOPPING_LISTS — list of all shopping lists
   ============================================ */
function ShoppingListsScreen({ onBack, onOpen }) {
  const lists = D3.SHOPPING_LISTS;
  return (
    <main className="screen">
      <div className="breadcrumb">
        <button onClick={onBack} className="breadcrumb-link"><Icon name="chevL" size={14} /> 마이페이지</button>
        <span className="breadcrumb-sep">/</span>
        <span className="breadcrumb-cur">장보기 목록</span>
      </div>

      <ScreenHeader title="장보기 목록" lead="진행 중과 완료된 장보기 리스트를 한곳에서 봅니다." />

      <div className="meta-list">
        {lists.map(l => (
          <button key={l.id} className="meta-row" onClick={() => onOpen(l.id)}>
            <div className="meta-icon"><Icon name="cart" size={16} /></div>
            <div className="meta-body">
              <div className="meta-title">{l.title}</div>
              <div className="meta-sub tabular">{l.items.length}개 항목 · {l.completed ? "완료" : "진행 중"}</div>
            </div>
            {l.completed && <span className="tag">완료</span>}
            <Icon name="chevR" size={16} color="var(--text-4)" />
          </button>
        ))}
      </div>
    </main>
  );
}

/* ============================================
   LEFTOVERS (§15)
   ============================================ */
function LeftoversScreen({ onBack, onCook, onMarkAte }) {
  return (
    <main className="screen">
      <div className="breadcrumb">
        <button onClick={onBack} className="breadcrumb-link"><Icon name="chevL" size={14} /> 마이페이지</button>
        <span className="breadcrumb-sep">/</span>
        <span className="breadcrumb-cur">남은 요리</span>
      </div>

      <ScreenHeader title="남은 요리" lead="요리한 뒤 남은 음식을 메모해 두면 다음 끼니로 빠르게 옮길 수 있어요." />

      {D3.LEFTOVERS.length === 0 ? (
        <StatePanel icon="pot" title="남은 요리가 없어요" desc="요리모드에서 '남은 요리로 등록'을 누르면 여기에 쌓입니다." />
      ) : (
        <div className="leftover-grid">
          {D3.LEFTOVERS.map(lf => {
            const r = D3.RECIPE[lf.recipeId];
            return (
              <div key={lf.id} className="leftover-card">
                <div className="leftover-thumb">
                  <img src={r?.photo} alt={r?.title} onError={(e) => { e.currentTarget.style.display = "none"; }} />
                </div>
                <div className="leftover-body">
                  <div className="leftover-title">{r?.title}</div>
                  <div className="leftover-meta tabular">{D3.fmtPlannerDate(lf.createdAt)} · {lf.note}</div>
                  <div className="row gap-2" style={{ marginTop: 12 }}>
                    <Button variant="secondary" size="sm" leftIcon="cal" onClick={() => onCook(lf.id)}>플래너로 옮기기</Button>
                    <Button variant="ghost" size="sm" leftIcon="check" onClick={() => onMarkAte(lf.id)}>다 먹었어요</Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}

/* ============================================
   ATE_LIST (§16)
   ============================================ */
function AteListScreen({ onBack, onOpenRecipe }) {
  return (
    <main className="screen">
      <div className="breadcrumb">
        <button onClick={onBack} className="breadcrumb-link"><Icon name="chevL" size={14} /> 마이페이지</button>
        <span className="breadcrumb-sep">/</span>
        <span className="breadcrumb-cur">다먹은 목록</span>
      </div>

      <ScreenHeader title="다먹은 목록" lead="요리모드를 완료했거나 '다 먹었어요'를 누른 끼니가 기록됩니다." />

      <div className="ate-list">
        {D3.ATE.map(a => {
          const r = D3.RECIPE[a.recipeId];
          if (!r) return null;
          return (
            <button key={a.id} className="ate-row" onClick={() => onOpenRecipe(r.id)}>
              <div className="ate-thumb">
                <img src={r.photo} alt={r.title} onError={(e) => { e.currentTarget.style.display = "none"; }} />
              </div>
              <div className="ate-body">
                <div className="ate-title">{r.title}</div>
                <div className="ate-meta tabular">{D3.fmtPlannerDate(a.ateAt)}</div>
              </div>
              <Icon name="chevR" size={16} color="var(--text-4)" />
            </button>
          );
        })}
      </div>
    </main>
  );
}

/* ============================================
   RECIPEBOOK_DETAIL — 한 북의 레시피들
   ============================================ */
function RecipebookDetailScreen({ bookId, onBack, onOpenRecipe }) {
  const book = D3.RECIPEBOOKS.find(b => b.id === bookId);
  if (!book) return null;

  // For demo, show all recipes (would be filtered in production)
  const recipes = D3.RECIPES.slice(0, Math.min(book.count, D3.RECIPES.length));

  return (
    <main className="screen">
      <div className="breadcrumb">
        <button onClick={onBack} className="breadcrumb-link"><Icon name="chevL" size={14} /> 레시피북</button>
        <span className="breadcrumb-sep">/</span>
        <span className="breadcrumb-cur">{book.title}</span>
      </div>

      <ScreenHeader
        title={book.title}
        lead={`${book.count}개의 레시피`}
        right={book.type === "custom" ? <Button variant="tertiary" leftIcon="edit">북 편집</Button> : null}
      />

      <div className="home-grid">
        {recipes.map(r => (
          <button key={r.id} className="photo-card" onClick={() => onOpenRecipe(r.id)}>
            <div className="photo-card-thumb">
              <img src={r.photo} alt={r.title} onError={(e) => { e.currentTarget.style.display = "none"; }} />
            </div>
            <div className="photo-card-body">
              <div className="photo-card-title">{r.title}</div>
              <div className="photo-card-meta tabular">{r.cookTime}분 · {r.baseServings}인분</div>
            </div>
          </button>
        ))}
      </div>
    </main>
  );
}

/* ============================================
   SETTINGS
   ============================================ */
function SettingsScreen({ onBack, account }) {
  const [pushNotif, setPushNotif] = useS3(true);
  const [unit, setUnit] = useS3("metric");
  const [theme, setTheme] = useS3("light");

  return (
    <main className="screen">
      <div className="breadcrumb">
        <button onClick={onBack} className="breadcrumb-link"><Icon name="chevL" size={14} /> 마이페이지</button>
        <span className="breadcrumb-sep">/</span>
        <span className="breadcrumb-cur">설정</span>
      </div>

      <ScreenHeader title="설정" lead="알림 · 단위 · 테마를 한곳에서 관리합니다." />

      <section className="settings-section">
        <h3 className="settings-section-title">알림</h3>
        <div className="settings-row">
          <div>
            <div className="settings-row-title">푸시 알림</div>
            <div className="settings-row-sub">끼니 요리 시간, 장보기 리마인드</div>
          </div>
          <SwitchToggle on={pushNotif} onChange={setPushNotif} />
        </div>
      </section>

      <section className="settings-section">
        <h3 className="settings-section-title">단위</h3>
        <div className="settings-row">
          <div>
            <div className="settings-row-title">계량 단위</div>
            <div className="settings-row-sub">미터법 (g, ml) 또는 컵·큰술 표기</div>
          </div>
          <SegmentedRow
            value={unit}
            onChange={setUnit}
            options={[{value:"metric", label:"미터법"}, {value:"cup", label:"컵·큰술"}]}
          />
        </div>
      </section>

      <section className="settings-section">
        <h3 className="settings-section-title">테마</h3>
        <div className="settings-row">
          <div>
            <div className="settings-row-title">앱 테마</div>
            <div className="settings-row-sub">시스템 설정 따라가기를 권장합니다</div>
          </div>
          <SegmentedRow
            value={theme}
            onChange={setTheme}
            options={[{value:"light", label:"라이트"}, {value:"dark", label:"다크"}, {value:"system", label:"시스템"}]}
          />
        </div>
      </section>

      <section className="settings-section">
        <h3 className="settings-section-title">계정</h3>
        <div className="meta-list">
          <div className="meta-row" style={{cursor:"default"}}>
            <div className="meta-icon"><Icon name="user" size={16} /></div>
            <div className="meta-body">
              <div className="meta-title">{account.nickname}</div>
              <div className="meta-sub">{account.provider === "kakao" ? "카카오" : account.provider === "naver" ? "네이버" : "구글"} 로그인</div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function SwitchToggle({ on, onChange }) {
  return (
    <button className={`switch ${on ? "on" : ""}`} onClick={() => onChange(!on)} role="switch" aria-checked={on}>
      <span className="switch-thumb" />
    </button>
  );
}

/* ============================================
   COOK_NOTICE — mobile-only cooking mode notice
   ============================================ */
function CookNoticeDialog({ open, onClose }) {
  const { Dialog, Button } = window.HC;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="요리모드는 모바일에서만 지원돼요"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>닫기</Button>
          <Button variant="primary" leftIcon="link" onClick={onClose}>모바일 앱 열기</Button>
        </>
      }
    >
      <div className="cook-notice">
        <div className="cook-notice-icon"><Icon name="pot" size={36} color="var(--brand-deep)" /></div>
        <p className="reading">요리 단계 진행과 타이머는 데스크탑에서 사용하기 어려워, 모바일 앱에서만 지원합니다. 데스크탑에서는 레시피를 미리 살펴보고, 장보기를 마무리해 두세요.</p>
        <ul className="cook-notice-list">
          <li><Icon name="check" size={14} color="var(--brand-deep)" /> 인분/재료 미리 조절</li>
          <li><Icon name="check" size={14} color="var(--brand-deep)" /> 장보기 리스트 만들기</li>
          <li><Icon name="check" size={14} color="var(--brand-deep)" /> 플래너 등록</li>
        </ul>
      </div>
    </Dialog>
  );
}

window.HC_S3 = {
  MealScreen, MenuAddScreen, ShoppingDetailScreen, ShoppingFlowScreen, ShoppingListsScreen,
  LeftoversScreen, AteListScreen, RecipebookDetailScreen, SettingsScreen, CookNoticeDialog,
};
