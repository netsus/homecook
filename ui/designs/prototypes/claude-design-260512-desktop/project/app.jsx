/* global React, ReactDOM */
const { useState: useStateA, useCallback: useCallbackA, useMemo: useMemoA } = React;
const HC_ = window.HC;
const DA = window.HC_DATA;
const { HomeScreen, RecipeDetailScreen } = window.HC_S1;
const { PlannerWeekScreen, PantryScreen, MyPageScreen, RecipebooksScreen } = window.HC_S2;
const {
  MealScreen, MenuAddScreen, ShoppingDetailScreen, ShoppingFlowScreen, ShoppingListsScreen,
  LeftoversScreen, AteListScreen, RecipebookDetailScreen, SettingsScreen, CookNoticeDialog,
} = window.HC_S3;
const {
  SaveModal, PlannerAddModal, IngredientFilterModal, Lightbox,
  PantryAddIngredientModal, PantryAddBundleModal, PantryReflectModal,
  NicknameModal, LogoutModal,
} = window.HC_MODALS;

function App() {
  // Routing — stack-based
  const [stack, setStack] = useStateA([{ screen: "HOME" }]);
  const cur = stack[stack.length - 1];

  // Persisted state
  const [savedSet, setSavedSet] = useStateA(() => new Set(["r3", "r5"]));
  const [pantryHeld, setPantryHeld] = useStateA(() => new Set(DA.PANTRY_HELD));
  const [meals, setMeals] = useStateA(() => DA.MEALS);
  const [savedFilters, setSavedFilters] = useStateA(() => new Set());

  // Demo-state overrides
  const [homeState, setHomeState] = useStateA(null);
  const [plannerState, setPlannerState] = useStateA(null);

  // Toast bus
  const toastBus = useMemoA(() => DA.makeToastBus(), []);
  const toast = useCallbackA((m) => toastBus.show(m), [toastBus]);

  // Modals
  const [saveModal, setSaveModal] = useStateA({ open: false, recipeId: null });
  const [plannerAddModal, setPlannerAddModal] = useStateA({ open: false, recipeId: null, date: null, col: null });
  const [filterModal, setFilterModal] = useStateA({ open: false });
  const [lightbox, setLightbox] = useStateA({ open: false, photos: [], idx: 0 });
  const [pantryAddIng, setPantryAddIng] = useStateA(false);
  const [pantryAddBundle, setPantryAddBundle] = useStateA(false);
  const [pantryReflect, setPantryReflect] = useStateA({ open: false, items: [] });
  const [nickname, setNickname] = useStateA(false);
  const [logout, setLogout] = useStateA(false);
  const [cookNotice, setCookNotice] = useStateA(false);
  const [account, setAccount] = useStateA(DA.ACCOUNT);

  // Nav
  const push = (entry) => { setStack(s => [...s, entry]); window.scrollTo({ top: 0, behavior: "instant" }); };
  const replace = (entry) => { setStack(s => [...s.slice(0, -1), entry]); window.scrollTo({ top: 0, behavior: "instant" }); };
  const pop = () => { setStack(s => s.length > 1 ? s.slice(0, -1) : s); window.scrollTo({ top: 0, behavior: "instant" }); };
  const goTab = (tab) => { setStack([{ screen: tab }]); window.scrollTo({ top: 0, behavior: "instant" }); };

  // Save toggle (from PhotoCard)
  const toggleSave = (rid) => {
    if (!rid || rid === "clear-all") {
      setSavedFilters(new Set());
      return;
    }
    setSavedSet(prev => {
      const n = new Set(prev);
      if (n.has(rid)) { n.delete(rid); toast("저장 해제했어요"); }
      else { n.add(rid); toast("저장한 레시피북에 담았어요"); }
      return n;
    });
  };

  // Top-level navigation tabs
  const topTab = (() => {
    const s = cur.screen;
    if (s === "HOME") return "HOME";
    if (s === "PLANNER_WEEK" || s === "MEAL" || s === "MENU_ADD") return "PLANNER_WEEK";
    if (s === "PANTRY") return "PANTRY";
    if (s === "MYPAGE" || s === "RECIPEBOOKS" || s === "RECIPEBOOK_DETAIL" || s === "SHOPPING_FLOW" ||
        s === "SHOPPING_DETAIL" || s === "SHOPPING_LISTS" || s === "LEFTOVERS" || s === "ATE_LIST" || s === "SETTINGS") return "MYPAGE";
    return "HOME";
  })();

  // Body rendering
  let body = null;
  const s = cur.screen;

  if (s === "HOME") {
    body = <HomeScreen
      savedSet={savedSet}
      onSaveToggle={toggleSave}
      onOpenRecipe={(rid) => push({ screen: "RECIPE", recipeId: rid })}
      onOpenFilter={() => setFilterModal({ open: true })}
      savedFilters={savedFilters}
      stateOverride={homeState}
      onStateOverride={setHomeState}
      toast={toast}
    />;
  } else if (s === "RECIPE") {
    body = <RecipeDetailScreen
      recipeId={cur.recipeId}
      onBack={pop}
      savedSet={savedSet}
      onSaveToggle={toggleSave}
      onOpenLightbox={(photos, idx) => setLightbox({ open: true, photos, idx })}
      onOpenPlannerAdd={(rid, servings) => setPlannerAddModal({ open: true, recipeId: rid, date: DA.TODAY_ISO, col: "col-d" })}
      onOpenSave={() => setSaveModal({ open: true, recipeId: cur.recipeId })}
      onCook={() => setCookNotice(true)}
      pantryHeld={pantryHeld}
      toast={toast}
    />;
  } else if (s === "PLANNER_WEEK") {
    body = <PlannerWeekScreen
      meals={plannerState === "empty" ? [] : meals}
      onOpenAdd={(date, col, recipeId) => {
        if (recipeId) setPlannerAddModal({ open: true, recipeId, date: date || DA.TODAY_ISO, col: col || "col-d" });
        else push({ screen: "MENU_ADD", date, col });
      }}
      onOpenMeal={(mid) => push({ screen: "MEAL", mealId: mid })}
      onOpenShopping={() => push({ screen: "SHOPPING_DETAIL", listId: "sl1" })}
      stateOverride={plannerState}
      onStateOverride={setPlannerState}
    />;
  } else if (s === "MEAL") {
    body = <MealScreen
      mealId={cur.mealId}
      onBack={pop}
      onCook={() => setCookNotice(true)}
      onGoShopping={() => push({ screen: "SHOPPING_DETAIL", listId: "sl1" })}
      onGoRecipe={(rid) => push({ screen: "RECIPE", recipeId: rid })}
      onDelete={(mid) => { setMeals(ms => ms.filter(m => m.id !== mid)); toast("끼니를 삭제했어요"); pop(); }}
      onChangeServings={(mid, v) => setMeals(ms => ms.map(m => m.id === mid ? { ...m, servings: v } : m))}
      toast={toast}
    />;
  } else if (s === "MENU_ADD") {
    body = <MenuAddScreen
      onBack={pop}
      dateISO={cur.date}
      col={cur.col}
      onPickRecipe={() => { toast("레시피 검색 (데모)"); pop(); }}
      onPickFromBook={() => { push({ screen: "RECIPEBOOKS", pickerMode: true }); }}
      onPickByPantry={() => { toast("팬트리 매칭 (데모)"); pop(); }}
      onManualCreate={() => { toast("직접 만들기 (데모)"); pop(); }}
      onYTImport={() => { toast("유튜브 가져오기 (데모)"); pop(); }}
      onSearchUrl={() => { toast("웹페이지 가져오기 (데모)"); pop(); }}
    />;
  } else if (s === "PANTRY") {
    body = <PantryScreen
      pantryHeld={pantryHeld}
      onTogglePantry={(id) => {
        setPantryHeld(p => {
          const n = new Set(p);
          if (n.has(id)) { n.delete(id); toast("팬트리에서 제거했어요"); }
          else { n.add(id); toast("팬트리에 추가했어요"); }
          return n;
        });
      }}
      onOpenAddIngredient={() => setPantryAddIng(true)}
      onOpenAddBundle={() => setPantryAddBundle(true)}
      toast={toast}
    />;
  } else if (s === "MYPAGE") {
    body = <MyPageScreen
      account={account}
      onGoRecipebooks={() => push({ screen: "RECIPEBOOKS" })}
      onGoShoppingLists={() => push({ screen: "SHOPPING_LISTS" })}
      onGoLeftovers={() => push({ screen: "LEFTOVERS" })}
      onGoAteList={() => push({ screen: "ATE_LIST" })}
      onOpenSettings={() => push({ screen: "SETTINGS" })}
      onOpenNickname={() => setNickname(true)}
      onOpenLogout={() => setLogout(true)}
    />;
  } else if (s === "RECIPEBOOKS") {
    body = <RecipebooksScreen
      onBack={pop}
      onOpenBook={(bid) => push({ screen: "RECIPEBOOK_DETAIL", bookId: bid })}
      onCreateBook={() => toast("새 레시피북 만들기 (데모)")}
    />;
  } else if (s === "RECIPEBOOK_DETAIL") {
    body = <RecipebookDetailScreen
      bookId={cur.bookId}
      onBack={pop}
      onOpenRecipe={(rid) => push({ screen: "RECIPE", recipeId: rid })}
    />;
  } else if (s === "SHOPPING_FLOW") {
    body = <ShoppingFlowScreen
      onBack={pop}
      onOpenCurrent={(lid) => push({ screen: "SHOPPING_DETAIL", listId: lid })}
      onOpenPast={() => push({ screen: "SHOPPING_LISTS" })}
      onCreateNew={() => toast("새 장보기 만들기 (데모)")}
      currentList={DA.SHOPPING_LISTS.find(l => !l.completed)}
    />;
  } else if (s === "SHOPPING_LISTS") {
    body = <ShoppingListsScreen
      onBack={pop}
      onOpen={(lid) => push({ screen: "SHOPPING_DETAIL", listId: lid })}
    />;
  } else if (s === "SHOPPING_DETAIL") {
    const list = DA.SHOPPING_LISTS.find(l => l.id === cur.listId);
    body = <ShoppingDetailScreen
      list={list}
      pantryHeld={pantryHeld}
      onTogglePantry={(id) => setPantryHeld(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; })}
      onBack={pop}
      onMarkComplete={(lid) => toast("장보기를 완료했어요")}
      onOpenReAdd={(lid) => toast("다시 장보기로 복원 (데모)")}
      onOpenPantryReflect={(items) => setPantryReflect({ open: true, items })}
      readOnly={list?.completed}
      toast={toast}
    />;
  } else if (s === "LEFTOVERS") {
    body = <LeftoversScreen
      onBack={pop}
      onCook={() => setCookNotice(true)}
      onMarkAte={() => toast("다 먹은 목록에 추가했어요")}
    />;
  } else if (s === "ATE_LIST") {
    body = <AteListScreen
      onBack={pop}
      onOpenRecipe={(rid) => push({ screen: "RECIPE", recipeId: rid })}
    />;
  } else if (s === "SETTINGS") {
    body = <SettingsScreen onBack={pop} account={account} />;
  }

  return (
    <>
      <HC_.TopNav tab={topTab} onTab={goTab} account={account} />
      {body}

      <SaveModal
        open={saveModal.open}
        recipeId={saveModal.recipeId}
        savedSet={savedSet}
        onClose={() => setSaveModal({ open: false, recipeId: null })}
        onConfirm={(rid, books) => {
          setSavedSet(p => new Set([...p, rid]));
          setSaveModal({ open: false, recipeId: null });
          toast(`${books.length}개 북에 저장했어요`);
        }}
        toast={toast}
      />
      <PlannerAddModal
        open={plannerAddModal.open}
        recipeId={plannerAddModal.recipeId}
        defaultDate={plannerAddModal.date}
        defaultCol={plannerAddModal.col}
        onClose={() => setPlannerAddModal({ open: false, recipeId: null, date: null, col: null })}
        onConfirm={({ recipeId, date, col, servings }) => {
          const id = `m-${Date.now()}`;
          setMeals(ms => [...ms, { id, recipeId, date, col, servings, status: "registered" }]);
          setPlannerAddModal({ open: false, recipeId: null, date: null, col: null });
          toast("플래너에 추가했어요");
        }}
      />
      <IngredientFilterModal
        open={filterModal.open}
        savedFilters={savedFilters}
        onClose={() => setFilterModal({ open: false })}
        onApply={(set) => { setSavedFilters(set); setFilterModal({ open: false }); toast(`${set.size}개 재료로 필터링`); }}
      />
      <Lightbox
        open={lightbox.open}
        photos={lightbox.photos}
        idx={lightbox.idx}
        onClose={() => setLightbox({ open: false, photos: [], idx: 0 })}
        onNav={(dir) => setLightbox(lb => ({
          ...lb,
          idx: (lb.idx + dir + lb.photos.length) % lb.photos.length,
        }))}
      />
      <PantryAddIngredientModal
        open={pantryAddIng}
        pantryHeld={pantryHeld}
        onClose={() => setPantryAddIng(false)}
        onConfirm={(ids) => {
          setPantryHeld(p => { const n = new Set(p); ids.forEach(i => n.add(i)); return n; });
          setPantryAddIng(false);
          toast(`${ids.length}개 재료를 추가했어요`);
        }}
      />
      <PantryAddBundleModal
        open={pantryAddBundle}
        pantryHeld={pantryHeld}
        onClose={() => setPantryAddBundle(false)}
        onConfirm={(bid) => {
          const b = DA.PANTRY_BUNDLES.find(x => x.id === bid);
          if (b) {
            setPantryHeld(p => { const n = new Set(p); b.picks.forEach(i => n.add(i)); return n; });
            toast(`${b.title} 번들을 추가했어요`);
          }
          setPantryAddBundle(false);
        }}
      />
      <PantryReflectModal
        open={pantryReflect.open}
        items={pantryReflect.items}
        onClose={() => setPantryReflect({ open: false, items: [] })}
        onConfirm={(ings) => {
          setPantryHeld(p => { const n = new Set(p); ings.forEach(i => n.add(i)); return n; });
          setPantryReflect({ open: false, items: [] });
          toast(`${ings.length}개 재료를 팬트리에 반영했어요`);
        }}
      />
      <NicknameModal
        open={nickname}
        current={account.nickname}
        onClose={() => setNickname(false)}
        onConfirm={(name) => { setAccount(a => ({ ...a, nickname: name })); setNickname(false); toast("닉네임을 변경했어요"); }}
      />
      <LogoutModal
        open={logout}
        provider={account.provider}
        onClose={() => setLogout(false)}
        onConfirm={() => { setLogout(false); toast("로그아웃했어요 (데모)"); }}
      />
      <CookNoticeDialog
        open={cookNotice}
        onClose={() => setCookNotice(false)}
      />

      <HC_.Toast bus={toastBus} />
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
