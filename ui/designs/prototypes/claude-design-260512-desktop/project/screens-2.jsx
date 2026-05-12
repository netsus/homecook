/* global React */
/* ============================================
   PLANNER + PANTRY + MYPAGE — spec v1.5.2
   ============================================ */
const { useState: useS2, useMemo: useMemo2 } = React;
const {
  Icon, Button, Chip, Tag, StatePanel,
  ScreenHeader, SegmentedRow,
} = window.HC;
const D2 = window.HC_DATA;

/* ============================================
   PLANNER_WEEK (§4)
   ============================================ */
function PlannerWeekScreen({ meals, onOpenAdd, onOpenMeal, onOpenShopping, stateOverride, onStateOverride }) {
  const isEmpty = stateOverride === "empty" || meals.length === 0;

  const mealMap = useMemo2(() => {
    const m = {};
    meals.forEach(meal => {
      const key = `${meal.date}__${meal.col}`;
      (m[key] ||= []).push(meal);
    });
    return m;
  }, [meals]);

  const summary = useMemo2(() => {
    const total = meals.length;
    const cookedDone = meals.filter(m => m.status === "cooked").length;
    const shopped = meals.filter(m => m.status === "shopped").length;
    const registered = meals.filter(m => m.status === "registered").length;
    return { total, cookedDone, shopped, registered };
  }, [meals]);

  return (
    <main className="screen">
      <div className="planner-page-head">
        <div>
          <h1 className="h1">주간 플래너</h1>
          <div className="text-meta tabular" style={{ marginTop: 6 }}>5월 11일(월) — 5월 17일(일)</div>
        </div>
        <div className="row gap-2">
          <Button variant="tertiary" leftIcon="chevL">이전 주</Button>
          <Button variant="tertiary" rightIcon="chevR">다음 주</Button>
          <Button variant="primary" leftIcon="cart" onClick={onOpenShopping}>
            장보기 미리보기
          </Button>
        </div>
      </div>

      {/* State demo */}
      <div className="state-toggle">
        <div className="state-toggle-label">화면 상태</div>
        <div className="state-toggle-chips">
          <button className={`state-toggle-chip ${(stateOverride || "ok") === "ok" ? "active" : ""}`} onClick={() => onStateOverride(null)}>기본</button>
          <button className={`state-toggle-chip ${stateOverride === "empty" ? "active" : ""}`} onClick={() => onStateOverride("empty")}>빈 주</button>
        </div>
      </div>

      <div className="planner-layout">
        {/* Sidebar */}
        <aside className="planner-side">
          <section className="planner-side-section">
            <div className="planner-side-title">이번 주 요약</div>
            <div className="planner-stat"><span>등록된 끼니</span><strong className="tabular">{summary.total}개</strong></div>
            <div className="planner-stat"><span>장본 끼니</span><strong className="tabular">{summary.shopped + summary.cookedDone}</strong></div>
            <div className="planner-stat"><span>요리 완료</span><strong className="tabular">{summary.cookedDone}</strong></div>
          </section>

          <section className="planner-side-section">
            <div className="planner-side-title">빠른 추가</div>
            <div className="col gap-2">
              <button className="planner-quick" onClick={() => onOpenAdd(D2.TODAY_ISO, "col-d")}>
                <Icon name="plus" size={14} /> 오늘 저녁
              </button>
              <button className="planner-quick" onClick={() => onOpenAdd("2026-05-13", "col-d")}>
                <Icon name="plus" size={14} /> 내일 저녁
              </button>
              <button className="planner-quick" onClick={() => onOpenAdd("2026-05-16", "col-l")}>
                <Icon name="plus" size={14} /> 주말 점심
              </button>
            </div>
          </section>

          <section className="planner-side-section">
            <div className="planner-side-title">최근 추가한 레시피</div>
            <div className="col gap-2">
              {D2.RECIPES.slice(0, 3).map(r => (
                <button key={r.id} className="planner-mini" onClick={() => onOpenAdd(null, null, r.id)}>
                  <div className="planner-mini-thumb">
                    <img src={r.photo} alt={r.title}
                      onError={(e) => { e.currentTarget.style.display = "none"; }} />
                  </div>
                  <div className="col" style={{ minWidth: 0 }}>
                    <div className="planner-mini-title">{r.title}</div>
                    <div className="planner-mini-meta tabular">{r.cookTime}분</div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        </aside>

        {/* Grid */}
        {isEmpty ? (
          <div className="planner-empty">
            <StatePanel
              icon="cal"
              title="이번 주는 아직 비어 있어요"
              desc="끼니를 추가해 한 주 식단을 계획해 보세요."
              action={<Button variant="primary" leftIcon="plus" onClick={() => onOpenAdd(D2.TODAY_ISO, "col-d")}>끼니 추가</Button>}
            />
          </div>
        ) : (
          <div className="planner-grid">
            <div className="planner-head timehead" />
            {D2.WEEK_DATES.map(d => (
              <div key={d.iso} className={`planner-head ${d.iso === D2.TODAY_ISO ? "today" : ""}`}>
                <div className="planner-head-dow">{d.dow}</div>
                <div className="planner-head-date day-num tabular">5/{d.d}</div>
              </div>
            ))}

            {D2.MEAL_COLUMNS.map(col => (
              <React.Fragment key={col.id}>
                <div className="planner-time">{col.name}</div>
                {D2.WEEK_DATES.map(d => {
                  const k = `${d.iso}__${col.id}`;
                  const cellMeals = mealMap[k] || [];
                  return (
                    <div key={d.iso} className="planner-cell">
                      {cellMeals.map(m => {
                        const r = D2.RECIPE[m.recipeId];
                        return (
                          <button key={m.id} className={`planner-meal status-${m.status}`} onClick={() => onOpenMeal(m.id)}>
                            <div className="planner-meal-thumb">
                              <img src={r?.photo} alt={r?.title}
                                onError={(e) => { e.currentTarget.style.display = "none"; }} />
                              <span className={`planner-meal-dot status-${m.status}`} />
                            </div>
                            <div className="planner-meal-title">{r?.title}</div>
                            <div className="planner-meal-meta tabular">{m.servings}인분</div>
                          </button>
                        );
                      })}
                      <button className="planner-add" onClick={() => onOpenAdd(d.iso, col.id)} aria-label="추가">
                        <Icon name="plus" size={14} />
                      </button>
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        )}
      </div>

      <div className="planner-legend">
        <span className="planner-legend-item"><span className="planner-legend-dot status-registered" /> 등록됨</span>
        <span className="planner-legend-item"><span className="planner-legend-dot status-shopped" /> 장본 끼니</span>
        <span className="planner-legend-item"><span className="planner-legend-dot status-cooked" /> 요리 완료</span>
      </div>
    </main>
  );
}

/* ============================================
   PANTRY (§9)
   ============================================ */
function PantryScreen({ pantryHeld, onTogglePantry, onOpenAddIngredient, onOpenAddBundle, toast }) {
  const [tab, setTab] = useS2("veg");
  const [query, setQuery] = useS2("");
  const [showOut, setShowOut] = useS2(true);

  const currentGroup = D2.PANTRY_GROUPS.find(g => g.id === tab);
  const items = useMemo2(() => {
    let list = D2.INGREDIENTS.filter(i => currentGroup?.cats.includes(i.cat));
    if (query.trim()) list = list.filter(i => i.name.includes(query.trim()));
    if (!showOut) list = list.filter(i => pantryHeld.has(i.id));
    return list;
  }, [tab, query, showOut, pantryHeld]);

  const heldCount = items.filter(i => pantryHeld.has(i.id)).length;
  const outCount  = items.filter(i => !pantryHeld.has(i.id)).length;

  return (
    <main className="screen">
      <div className="pantry-head">
        <div>
          <h1 className="h1">팬트리</h1>
          <p className="screen-lead">현재 갖고 있는 재료를 표시해 두면 장보기·레시피에서 자동으로 반영됩니다.</p>
        </div>
        <div className="row gap-2">
          <Button variant="tertiary" leftIcon="copy" onClick={onOpenAddBundle}>번들로 추가</Button>
          <Button variant="primary"   leftIcon="plus" onClick={onOpenAddIngredient}>재료 추가</Button>
        </div>
      </div>

      <div className="pantry-tabs">
        {D2.PANTRY_GROUPS.map(g => {
          const heldHere = D2.INGREDIENTS.filter(i => g.cats.includes(i.cat) && pantryHeld.has(i.id)).length;
          const totalHere = D2.INGREDIENTS.filter(i => g.cats.includes(i.cat)).length;
          return (
            <button
              key={g.id}
              className={`pantry-tab ${tab === g.id ? "active" : ""}`}
              onClick={() => setTab(g.id)}
            >
              <span>{g.title}</span>
              <span className="pantry-tab-count tabular">{heldHere}/{totalHere}</span>
            </button>
          );
        })}
      </div>

      <div className="pantry-toolbar">
        <div className="pantry-search">
          <Icon name="search" size={14} color="var(--text-3)" />
          <input
            type="text"
            placeholder={`${currentGroup?.title}에서 검색`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button className="search-clear" onClick={() => setQuery("")}>
              <Icon name="x" size={12} color="var(--text-3)" />
            </button>
          )}
        </div>
        <div className="pantry-toolbar-right">
          <label className="pantry-toggle-row">
            <input type="checkbox" checked={showOut} onChange={(e) => setShowOut(e.target.checked)} />
            <span>없는 재료도 표시</span>
          </label>
          <div className="text-meta tabular">
            보유 {heldCount} · 부족 {outCount}
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <StatePanel
          icon="fridge"
          title="여기에는 아직 재료가 없어요"
          desc="자주 쓰는 재료를 미리 등록해 두세요."
          action={<Button variant="primary" leftIcon="plus" onClick={onOpenAddIngredient}>재료 추가</Button>}
        />
      ) : (
        <div className="pantry-grid">
          {items.map(i => {
            const held = pantryHeld.has(i.id);
            return (
              <div key={i.id} className={`pantry-card ${held ? "" : "out"}`} onClick={() => onTogglePantry(i.id)}>
                <div className="pantry-card-tag">
                  <span className={`pantry-card-tag-pill ${held ? "held" : "out"}`}>
                    {held ? "보유" : "없음"}
                  </span>
                </div>
                <div className="pantry-card-icon">
                  <Icon name={iconForIngredient(i)} size={28} color={held ? "var(--text-2)" : "var(--text-4)"} />
                </div>
                <div className="pantry-card-name">{i.name}</div>
                <div className="pantry-card-meta">{i.cat}</div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}

function iconForIngredient(i) {
  if (i.cat === "채소") return "veg";
  if (i.cat === "육류") return "meat";
  if (i.cat === "해산물") return "fish";
  if (i.cat === "양념") return "seasoning";
  if (i.cat === "곡물") return "grain";
  return "egg";
}

/* ============================================
   MYPAGE (§13)
   ============================================ */
function MyPageScreen({ onGoRecipebooks, onGoShoppingLists, onGoLeftovers, onGoAteList, onOpenSettings, onOpenNickname, onOpenLogout, account }) {
  const stats = {
    saved: 38,
    cooked: 26,
    plannerDone: 14,
  };

  return (
    <main className="screen mypage">
      {/* Hero */}
      <section className="my-hero">
        <div className="my-avatar">{account.initials}</div>
        <div className="my-hero-text">
          <div className="my-nickname">
            <span className="h2">{account.nickname}</span>
            <button className="my-nick-edit" onClick={onOpenNickname} aria-label="닉네임 수정">
              <Icon name="edit" size={13} />
            </button>
          </div>
          <div className="my-provider">
            <span className={`my-provider-badge prov-${account.provider}`}>{providerLabel(account.provider)}</span>
            <span className="text-meta">로그인 됨</span>
          </div>
        </div>
        <div className="my-stats">
          <div className="my-stat">
            <div className="my-stat-num tabular">{stats.saved}</div>
            <div className="my-stat-lbl">저장한 레시피</div>
          </div>
          <div className="my-stat-divider" />
          <div className="my-stat">
            <div className="my-stat-num tabular">{stats.cooked}</div>
            <div className="my-stat-lbl">다 먹은 끼니</div>
          </div>
          <div className="my-stat-divider" />
          <div className="my-stat">
            <div className="my-stat-num tabular">{stats.plannerDone}</div>
            <div className="my-stat-lbl">플래너 등록</div>
          </div>
        </div>
      </section>

      {/* 활동 */}
      <section className="my-section">
        <h2 className="my-section-title">활동</h2>
        <div className="meta-list">
          <button className="meta-row" onClick={onGoRecipebooks}>
            <div className="meta-icon"><Icon name="book" size={16} /></div>
            <div className="meta-body">
              <div className="meta-title">레시피북</div>
              <div className="meta-sub">내가 추가한 · 저장한 · 좋아요한 · 커스텀 6개</div>
            </div>
            <Icon name="chevR" size={16} color="var(--text-4)" />
          </button>
          <button className="meta-row" onClick={onGoLeftovers}>
            <div className="meta-icon"><Icon name="pot" size={16} /></div>
            <div className="meta-body">
              <div className="meta-title">남은 요리</div>
              <div className="meta-sub">2건 — 불고기, 잡채</div>
            </div>
            <Icon name="chevR" size={16} color="var(--text-4)" />
          </button>
          <button className="meta-row" onClick={onGoAteList}>
            <div className="meta-icon"><Icon name="check" size={16} /></div>
            <div className="meta-body">
              <div className="meta-title">다먹은 목록</div>
              <div className="meta-sub">최근 30일 — 26건</div>
            </div>
            <Icon name="chevR" size={16} color="var(--text-4)" />
          </button>
          <button className="meta-row" onClick={onGoShoppingLists}>
            <div className="meta-icon"><Icon name="cart" size={16} /></div>
            <div className="meta-body">
              <div className="meta-title">장보기 목록</div>
              <div className="meta-sub">진행 1건 · 완료 1건</div>
            </div>
            <Icon name="chevR" size={16} color="var(--text-4)" />
          </button>
        </div>
      </section>

      {/* 설정 */}
      <section className="my-section">
        <h2 className="my-section-title">설정</h2>
        <div className="meta-list">
          <button className="meta-row" onClick={onOpenSettings}>
            <div className="meta-icon"><Icon name="settings" size={16} /></div>
            <div className="meta-body">
              <div className="meta-title">알림 · 단위 · 테마</div>
              <div className="meta-sub">앱 설정 전체</div>
            </div>
            <Icon name="chevR" size={16} color="var(--text-4)" />
          </button>
          <button className="meta-row" onClick={onOpenLogout}>
            <div className="meta-icon"><Icon name="logout" size={16} /></div>
            <div className="meta-body">
              <div className="meta-title">로그아웃</div>
              <div className="meta-sub">{providerLabel(account.provider)} 계정</div>
            </div>
            <Icon name="chevR" size={16} color="var(--text-4)" />
          </button>
        </div>
      </section>
    </main>
  );
}

function providerLabel(p) {
  if (p === "kakao") return "카카오";
  if (p === "naver") return "네이버";
  if (p === "google") return "구글";
  return p;
}

/* ============================================
   RECIPEBOOKS list (§13a)
   ============================================ */
function RecipebooksScreen({ onBack, onOpenBook, onCreateBook }) {
  const sys = D2.RECIPEBOOKS.filter(b => b.type !== "custom");
  const custom = D2.RECIPEBOOKS.filter(b => b.type === "custom");
  return (
    <main className="screen">
      <div className="breadcrumb">
        <button onClick={onBack} className="breadcrumb-link">
          <Icon name="chevL" size={14} /> 마이페이지
        </button>
        <span className="breadcrumb-sep">/</span>
        <span className="breadcrumb-cur">레시피북</span>
      </div>

      <ScreenHeader
        title="레시피북"
        lead="자동 분류된 시스템 북 3개와 커스텀 북을 한곳에서 관리합니다."
        right={<Button variant="primary" leftIcon="plus" onClick={onCreateBook}>새 레시피북</Button>}
      />

      <section className="my-section">
        <h2 className="my-section-title">자동 분류</h2>
        <div className="recipebook-grid">
          {sys.map(b => <RecipebookCard key={b.id} book={b} onClick={() => onOpenBook(b.id)} />)}
        </div>
      </section>

      <section className="my-section">
        <h2 className="my-section-title">커스텀</h2>
        <div className="recipebook-grid">
          {custom.map(b => <RecipebookCard key={b.id} book={b} onClick={() => onOpenBook(b.id)} />)}
        </div>
      </section>
    </main>
  );
}

function RecipebookCard({ book, onClick }) {
  return (
    <button className="recipebook-card" onClick={onClick}>
      <div className="recipebook-mosaic">
        {book.thumbs.slice(0, 3).map((t, i) => (
          <div key={i} className={`recipebook-mosaic-cell pos-${i}`}>
            <img src={t} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} />
          </div>
        ))}
      </div>
      <div className="recipebook-card-body">
        <div className="recipebook-card-title">{book.title}</div>
        <div className="recipebook-card-meta tabular">{book.count}개</div>
      </div>
    </button>
  );
}

window.HC_S2 = { PlannerWeekScreen, PantryScreen, MyPageScreen, RecipebooksScreen };
