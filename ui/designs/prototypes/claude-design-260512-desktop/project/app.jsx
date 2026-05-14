/* global React, ReactDOM */
const { useState: useStateA, useCallback: useCallbackA, useMemo: useMemoA } = React;
const HC_ = window.HC;
const DA = window.HC_DATA;
const { LoginScreen, HomeScreen, RecipeDetailScreen } = window.HC_S1;
const { PlannerWeekScreen, PantryScreen, MyPageScreen, RecipebooksScreen } = window.HC_S2;
const {
  MealScreen, MenuAddScreen, ShoppingDetailScreen, ShoppingFlowScreen, ShoppingListsScreen,
  RecipeSearchPickerScreen, RecipeBookSelectorScreen, RecipeBookDetailPickerScreen, PantryMatchPickerScreen,
  ManualRecipeCreateScreen, YtImportScreen,
  LeftoversScreen, AteListScreen, CookReadyListScreen, CookModePlannerScreen, CookModeStandaloneScreen,
  RecipebookDetailScreen, SettingsScreen, CookNoticeDialog,
} = window.HC_S3;
const {
  SaveModal, PlannerAddModal, IngredientFilterModal, Lightbox,
  PlannedServingsConfirmModal,
  PantryAddIngredientModal, PantryAddBundleModal, PantryReflectModal,
  ConsumedIngredientSheet,
  NicknameModal, LogoutModal,
} = window.HC_MODALS;

function normalizeShoppingList(list) {
  const origin = list.origin || (list.mealIds?.length ? "planner-linked" : "manual");
  return { ...list, origin };
}

function normalizeLeftover(item) {
  return {
    servings: 1,
    sourceMealId: null,
    sourceDate: item.createdAt || null,
    sourceCol: null,
    ...item,
  };
}

function normalizeAteItem(item) {
  return {
    servings: 1,
    sourceMealId: null,
    sourceDate: item.ateAt || null,
    sourceCol: null,
    ...item,
  };
}

function normalizeRecipebook(book) {
  const recipeIds = Array.isArray(book.recipeIds) ? book.recipeIds : [];
  return {
    ...book,
    recipeIds,
    thumbs: book.thumbs || recipeIds.map(id => DA.RECIPE[id]?.photo).filter(Boolean),
  };
}

function latestActiveShoppingList(lists) {
  return [...lists]
    .filter(list => !list.completed)
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")) || String(b.id).localeCompare(String(a.id)))[0] || null;
}

function App() {
  // Routing — stack-based
  const [stack, setStack] = useStateA([{ screen: "HOME" }]);
  const cur = stack[stack.length - 1];

  // Persisted state
  const [savedSet, setSavedSet] = useStateA(() => new Set(["r1", "r2", "r3", "r4", "r5", "r6"]));
  const [pantryHeld, setPantryHeld] = useStateA(() => new Set(DA.PANTRY_HELD));
  const [meals, setMeals] = useStateA(() => DA.MEALS);
  const [shoppingLists] = useStateA(() => DA.SHOPPING_LISTS.map(normalizeShoppingList));
  const [activeShoppingListId, setActiveShoppingListId] = useStateA(() => latestActiveShoppingList(DA.SHOPPING_LISTS)?.id || null);
  const [leftovers] = useStateA(() => DA.LEFTOVERS.map(normalizeLeftover));
  const [ateItems] = useStateA(() => DA.ATE.map(normalizeAteItem));
  const [recipebooks] = useStateA(() => DA.RECIPEBOOKS.map(normalizeRecipebook));
  const [savedFilters, setSavedFilters] = useStateA(() => new Set());

  // Demo-state overrides
  const [homeState, setHomeState] = useStateA(null);
  const [plannerState, setPlannerState] = useStateA(null);

  // Toast bus
  const toastBus = useMemoA(() => DA.makeToastBus(), []);
  const toast = useCallbackA((m) => toastBus.show(m), [toastBus]);

  const activeShoppingList = useMemoA(() => {
    const explicit = shoppingLists.find(list => !list.completed && list.id === activeShoppingListId);
    return explicit || latestActiveShoppingList(shoppingLists);
  }, [shoppingLists, activeShoppingListId]);

  // Modals
  const [saveModal, setSaveModal] = useStateA({ open: false, recipeId: null });
  const [plannerAddModal, setPlannerAddModal] = useStateA({ open: false, recipeId: null, date: null, col: null });
  const [servingsConfirm, setServingsConfirm] = useStateA({ open: false, recipe: null, date: null, col: null, lockedSlot: false });
  const [filterModal, setFilterModal] = useStateA({ open: false });
  const [lightbox, setLightbox] = useStateA({ open: false, photos: [], idx: 0 });
  const [pantryAddIng, setPantryAddIng] = useStateA(false);
  const [pantryAddBundle, setPantryAddBundle] = useStateA(false);
  const [pantryReflect, setPantryReflect] = useStateA({ open: false, items: [], listId: null });
  const [consumedSheet, setConsumedSheet] = useStateA({ open: false, recipe: null, mealId: null, ingredients: [] });
  const [nickname, setNickname] = useStateA(false);
  const [logout, setLogout] = useStateA(false);
  const [cookNotice, setCookNotice] = useStateA(false);
  const [account, setAccount] = useStateA(DA.ACCOUNT);
  const [isAuthenticated, setIsAuthenticated] = useStateA(false);
  const [confirmDialog, setConfirmDialog] = useStateA({
    open: false,
    title: "",
    message: "",
    confirmLabel: "",
    cancelLabel: "",
    destructive: false,
    icon: "question",
    onConfirm: null,
  });
  const [loginGate, setLoginGate] = useStateA({
    open: false,
    actionLabel: "",
    helper: "",
    resume: null,
  });

  // Nav
  const push = (entry) => { setStack(s => [...s, entry]); window.scrollTo({ top: 0, behavior: "instant" }); };
  const replace = (entry) => { setStack(s => [...s.slice(0, -1), entry]); window.scrollTo({ top: 0, behavior: "instant" }); };
  const pop = () => { setStack(s => s.length > 1 ? s.slice(0, -1) : s); window.scrollTo({ top: 0, behavior: "instant" }); };
  const goTab = (tab) => { setStack([{ screen: tab }]); window.scrollTo({ top: 0, behavior: "instant" }); };

  const openAccountDeleteConfirm = () => openConfirm({
    title: "정말 계정을 삭제할까요?",
    message: "모든 레시피북, 플래너 기록, 장보기 내역이 영구적으로 삭제됩니다. 이 작업은 되돌릴 수 없어요.",
    confirmLabel: "계정 삭제",
    cancelLabel: "취소",
    destructive: true,
    icon: "trash",
    onConfirm: () => {
      toast("계정이 삭제되었습니다 (데모)");
      goTab("HOME");
    },
  });

  const openRecipebookDeleteConfirm = (book) => openConfirm({
    title: `"${book.title}" 레시피북을 삭제할까요?`,
    message: "레시피북만 삭제되며, 안에 담긴 레시피는 그대로 남아요.",
    confirmLabel: "삭제",
    cancelLabel: "취소",
    destructive: true,
    icon: "trash",
    onConfirm: () => {
      toast("레시피북을 삭제했어요 (데모)");
      pop();
    },
  });

  const closeConfirm = useCallbackA(() => {
    setConfirmDialog({
      open: false,
      title: "",
      message: "",
      confirmLabel: "",
      cancelLabel: "",
      destructive: false,
      icon: "question",
      onConfirm: null,
    });
  }, []);

  const openConfirm = useCallbackA((config) => {
    setConfirmDialog({
      open: true,
      title: config?.title || "확인할까요?",
      message: config?.message || "",
      confirmLabel: config?.confirmLabel || "확인",
      cancelLabel: config?.cancelLabel || "취소",
      destructive: Boolean(config?.destructive),
      icon: config?.icon || "question",
      onConfirm: config?.onConfirm || null,
    });
  }, []);

  const completeLogin = useCallbackA((provider, message = "로그인했어요.") => {
    setIsAuthenticated(true);
    setAccount(a => ({ ...a, provider: provider || a.provider }));
    toast(message);
  }, [toast]);

  // Protected actions — desktop LoginGate foundation
  const requireAuth = useCallbackA((config, action) => {
    if (isAuthenticated) {
      action?.();
      return;
    }
    setLoginGate({
      open: true,
      actionLabel: config?.actionLabel || "보호된 작업",
      helper: config?.helper || "로그인하면 방금 하려던 작업을 이어서 완료할 수 있어요.",
      resume: action,
    });
  }, [isAuthenticated]);

  const closeLoginGate = useCallbackA(() => {
    setLoginGate({ open: false, actionLabel: "", helper: "", resume: null });
  }, []);

  const confirmLoginGate = useCallbackA((provider) => {
    const resume = loginGate.resume;
    completeLogin(provider, "로그인했어요. 작업을 이어갑니다.");
    setLoginGate({ open: false, actionLabel: "", helper: "", resume: null });
    if (resume) window.setTimeout(() => resume(), 0);
  }, [loginGate, completeLogin]);

  const openServingsConfirm = useCallbackA((recipe, date, col) => {
    setServingsConfirm({
      open: true,
      recipe,
      date: date || DA.TODAY_ISO,
      col: col || "col-d",
      lockedSlot: Boolean(date && col),
    });
  }, []);

  const closeServingsConfirm = useCallbackA(() => {
    setServingsConfirm({ open: false, recipe: null, date: null, col: null, lockedSlot: false });
  }, []);

  const addPlannerMealToSlot = useCallbackA(({ recipe, recipeId, date, col, servings }) => {
    const targetRecipeId = recipeId || recipe?.id;
    if (!targetRecipeId) return;
    if (recipe && !DA.RECIPE[targetRecipeId]) {
      DA.RECIPE[targetRecipeId] = recipe;
      DA.RECIPES.push(recipe);
    }
    const id = `m-${Date.now()}`;
    setMeals(ms => [...ms, {
      id,
      recipeId: targetRecipeId,
      date: date || DA.TODAY_ISO,
      col: col || "col-d",
      servings: servings || recipe?.baseServings || 2,
      status: "registered",
    }]);
    toast("플래너에 추가했어요");
    setStack([{ screen: "PLANNER_WEEK" }]);
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [toast]);

  const addMealFromServingsConfirm = useCallbackA(({ recipeId, date, col, servings }) => {
    addPlannerMealToSlot({ recipe: servingsConfirm.recipe, recipeId, date, col, servings });
    closeServingsConfirm();
  }, [servingsConfirm.recipe, addPlannerMealToSlot, closeServingsConfirm]);

  const addCreatedRecipeFromMenuAdd = useCallbackA((recipe, date, col) => {
    if (date && col) {
      addPlannerMealToSlot({ recipe, date, col, servings: recipe.baseServings || 2 });
      return;
    }
    openServingsConfirm(recipe, date, col);
  }, [addPlannerMealToSlot, openServingsConfirm]);

  // Save toggle (from PhotoCard)
  const toggleSave = (rid) => {
    if (!rid || rid === "clear-all") {
      setSavedFilters(new Set());
      return;
    }
    const recipe = DA.RECIPE[rid];
    requireAuth({
      actionLabel: recipe ? `"${recipe.title}" 저장` : "레시피 저장",
      helper: "저장한 레시피북에 담으려면 로그인이 필요해요.",
    }, () => {
      setSavedSet(prev => {
        const n = new Set(prev);
        if (n.has(rid)) { n.delete(rid); toast("저장 해제했어요"); }
        else { n.add(rid); toast("저장한 레시피북에 담았어요"); }
        return n;
      });
    });
  };

  // Top-level navigation tabs
  const topTab = (() => {
    const s = cur.screen;
    if (s === "HOME") return "HOME";
    if (s === "LOGIN") return "";
    if (s === "PLANNER_WEEK" || s === "MEAL" || s === "MENU_ADD" ||
        s === "RECIPE_SEARCH_PICKER" || s === "RECIPEBOOK_SELECTOR" ||
        s === "RECIPEBOOK_DETAIL_PICKER" || s === "PANTRY_MATCH_PICKER" ||
        s === "MANUAL_RECIPE_CREATE" || s === "YT_IMPORT" ||
        s === "COOK_READY_LIST" || s === "COOK_MODE_PLANNER") return "PLANNER_WEEK";
    if (s === "COOK_MODE_STANDALONE") return "";
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
  } else if (s === "LOGIN") {
    body = <LoginScreen
      onLogin={(provider) => {
        completeLogin(provider);
        goTab("HOME");
      }}
      onGuest={() => goTab("HOME")}
    />;
  } else if (s === "RECIPE") {
    body = <RecipeDetailScreen
      recipeId={cur.recipeId}
      onBack={pop}
      savedSet={savedSet}
      onSaveToggle={toggleSave}
      onOpenLightbox={(photos, idx) => setLightbox({ open: true, photos, idx })}
      onOpenPlannerAdd={(rid, servings) => requireAuth({
        actionLabel: "플래너에 레시피 추가",
        helper: "플래너에 식단을 등록하려면 로그인이 필요해요.",
      }, () => setPlannerAddModal({ open: true, recipeId: rid, date: DA.TODAY_ISO, col: "col-d" }))}
      onOpenSave={() => requireAuth({
        actionLabel: "레시피북에 저장",
        helper: "저장할 레시피북을 고르려면 로그인이 필요해요.",
      }, () => setSaveModal({ open: true, recipeId: cur.recipeId }))}
      onCook={() => push({ screen: "COOK_MODE_STANDALONE", recipeId: cur.recipeId })}
      pantryHeld={pantryHeld}
      toast={toast}
    />;
  } else if (s === "PLANNER_WEEK") {
    body = <PlannerWeekScreen
      meals={plannerState === "empty" ? [] : meals}
      onOpenAdd={(date, col, recipeId) => {
        requireAuth({
          actionLabel: recipeId ? "플래너에 레시피 추가" : "플래너에 메뉴 추가",
          helper: "플래너를 편집하려면 로그인이 필요해요.",
        }, () => {
          if (recipeId) setPlannerAddModal({ open: true, recipeId, date: date || DA.TODAY_ISO, col: col || "col-d" });
          else push({ screen: "MENU_ADD", date, col });
        });
      }}
      onOpenMeal={(mid) => push({ screen: "MEAL", mealId: mid })}
      onOpenShopping={() => push({ screen: "SHOPPING_FLOW" })}
      onOpenCookReady={() => push({ screen: "COOK_READY_LIST" })}
      stateOverride={plannerState}
      onStateOverride={setPlannerState}
    />;
  } else if (s === "MEAL") {
    body = <MealScreen
      mealId={cur.mealId}
      meal={meals.find(m => m.id === cur.mealId)}
      onBack={pop}
      onCook={(mid) => push({ screen: "COOK_MODE_PLANNER", mealId: mid })}
      onGoShopping={() => push({ screen: "SHOPPING_DETAIL", listId: "sl1" })}
      onGoRecipe={(rid) => push({ screen: "RECIPE", recipeId: rid })}
      onDelete={(mid) => openConfirm({
        title: "끼니를 삭제할까요?",
        message: "이 플래너 항목만 삭제되며 저장한 레시피와 팬트리는 그대로 유지돼요.",
        confirmLabel: "삭제",
        destructive: true,
        icon: "trash",
        onConfirm: () => {
          setMeals(ms => ms.filter(m => m.id !== mid));
          toast("끼니를 삭제했어요");
          pop();
        },
      })}
      onChangeServings={(mid, v) => setMeals(ms => ms.map(m => m.id === mid ? { ...m, servings: v } : m))}
      pantryHeld={pantryHeld}
      toast={toast}
    />;
  } else if (s === "MENU_ADD") {
    body = <MenuAddScreen
      onBack={pop}
      dateISO={cur.date}
      col={cur.col}
      onPickRecipe={() => push({ screen: "RECIPE_SEARCH_PICKER", date: cur.date, col: cur.col })}
      onPickFromBook={() => push({ screen: "RECIPEBOOK_SELECTOR", date: cur.date, col: cur.col })}
      onPickByPantry={() => push({ screen: "PANTRY_MATCH_PICKER", date: cur.date, col: cur.col })}
      onManualCreate={() => push({ screen: "MANUAL_RECIPE_CREATE", date: cur.date, col: cur.col })}
      onYTImport={() => push({ screen: "YT_IMPORT", date: cur.date, col: cur.col })}
      onSearchUrl={() => { toast("웹페이지 가져오기 (데모)"); pop(); }}
    />;
  } else if (s === "RECIPE_SEARCH_PICKER") {
    body = <RecipeSearchPickerScreen
      dateISO={cur.date}
      col={cur.col}
      onBack={pop}
      onSelectRecipe={(recipe) => openServingsConfirm(recipe, cur.date, cur.col)}
    />;
  } else if (s === "RECIPEBOOK_SELECTOR") {
    body = <RecipeBookSelectorScreen
      dateISO={cur.date}
      col={cur.col}
      recipebooks={recipebooks}
      onBack={pop}
      onOpenBook={(bookId) => push({ screen: "RECIPEBOOK_DETAIL_PICKER", bookId, date: cur.date, col: cur.col })}
    />;
  } else if (s === "RECIPEBOOK_DETAIL_PICKER") {
    body = <RecipeBookDetailPickerScreen
      bookId={cur.bookId}
      dateISO={cur.date}
      col={cur.col}
      recipebooks={recipebooks}
      onBack={pop}
      onSelectRecipe={(recipe) => openServingsConfirm(recipe, cur.date, cur.col)}
    />;
  } else if (s === "PANTRY_MATCH_PICKER") {
    body = <PantryMatchPickerScreen
      dateISO={cur.date}
      col={cur.col}
      pantryHeld={pantryHeld}
      onBack={pop}
      onSelectRecipe={(recipe) => openServingsConfirm(recipe, cur.date, cur.col)}
    />;
  } else if (s === "MANUAL_RECIPE_CREATE") {
    body = <ManualRecipeCreateScreen
      dateISO={cur.date}
      col={cur.col}
      onBack={pop}
      onCreateRecipe={(recipe) => addCreatedRecipeFromMenuAdd(recipe, cur.date, cur.col)}
    />;
  } else if (s === "YT_IMPORT") {
    body = <YtImportScreen
      dateISO={cur.date}
      col={cur.col}
      onBack={pop}
      onCreateRecipe={(recipe) => addCreatedRecipeFromMenuAdd(recipe, cur.date, cur.col)}
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
      savedSet={savedSet}
      shoppingLists={shoppingLists}
      recipebooks={recipebooks}
      onSaveToggle={toggleSave}
      onGoRecipebooks={() => push({ screen: "RECIPEBOOKS" })}
      onGoShoppingLists={() => push({ screen: "SHOPPING_LISTS" })}
      onGoLeftovers={() => push({ screen: "LEFTOVERS" })}
      onGoAteList={() => push({ screen: "ATE_LIST" })}
      onOpenSettings={() => push({ screen: "SETTINGS" })}
      onOpenNickname={() => setNickname(true)}
      onOpenLogout={() => setLogout(true)}
      onOpenRecipe={(rid) => push({ screen: "RECIPE", recipeId: rid })}
      onDeleteAccount={openAccountDeleteConfirm}
    />;
  } else if (s === "RECIPEBOOKS") {
    body = <RecipebooksScreen
      recipebooks={recipebooks}
      onBack={pop}
      onOpenBook={(bid) => push({ screen: "RECIPEBOOK_DETAIL", bookId: bid })}
      onCreateBook={() => toast("새 레시피북 만들기 (데모)")}
    />;
  } else if (s === "RECIPEBOOK_DETAIL") {
    const book = recipebooks.find(b => b.id === cur.bookId);
    body = <RecipebookDetailScreen
      bookId={cur.bookId}
      recipebooks={recipebooks}
      onBack={pop}
      onOpenRecipe={(rid) => push({ screen: "RECIPE", recipeId: rid })}
      onDeleteBook={book?.type === "custom" ? () => openRecipebookDeleteConfirm(book) : null}
      toast={toast}
    />;
  } else if (s === "SHOPPING_FLOW") {
    body = <ShoppingFlowScreen
      onBack={pop}
      onOpenCurrent={(lid) => {
        setActiveShoppingListId(lid);
        push({ screen: "SHOPPING_DETAIL", listId: lid });
      }}
      onOpenPast={() => push({ screen: "SHOPPING_LISTS" })}
      onCreateNew={() => toast("새 장보기 만들기 (데모)")}
      currentList={activeShoppingList}
    />;
  } else if (s === "SHOPPING_LISTS") {
    body = <ShoppingListsScreen
      lists={shoppingLists}
      onBack={pop}
      onOpen={(lid) => {
        const list = shoppingLists.find(l => l.id === lid);
        if (list && !list.completed) setActiveShoppingListId(lid);
        push({ screen: "SHOPPING_DETAIL", listId: lid });
      }}
    />;
  } else if (s === "SHOPPING_DETAIL") {
    const list = shoppingLists.find(l => l.id === cur.listId);
    body = <ShoppingDetailScreen
      list={list}
      pantryHeld={pantryHeld}
      onBack={pop}
      onOpenReAdd={(lid) => toast("다시 장보기로 복원 (데모)")}
      onOpenPantryReflect={(items, listId) => setPantryReflect({ open: true, items, listId })}
      readOnly={list?.completed}
      toast={toast}
    />;
  } else if (s === "LEFTOVERS") {
    body = <LeftoversScreen
      leftovers={leftovers}
      onBack={pop}
      onCook={(lfId) => {
        const lf = leftovers.find(l => l.id === lfId);
        if (lf) push({ screen: "COOK_MODE_STANDALONE", recipeId: lf.recipeId });
      }}
      onMarkAte={() => toast("다 먹은 목록에 추가했어요")}
      onReAddToPlanner={() => toast("플래너에 다시 추가했어요 (데모)")}
      onGoAteList={() => push({ screen: "ATE_LIST" })}
    />;
  } else if (s === "ATE_LIST") {
    body = <AteListScreen
      ateItems={ateItems}
      onBack={pop}
      onOpenRecipe={(rid) => push({ screen: "RECIPE", recipeId: rid })}
      onUndoAte={() => toast("남은 요리로 되돌렸어요 (데모)")}
      onRecreate={(rid) => push({ screen: "COOK_MODE_STANDALONE", recipeId: rid })}
      onGoLeftovers={() => push({ screen: "LEFTOVERS" })}
    />;
  } else if (s === "COOK_READY_LIST") {
    body = <CookReadyListScreen
      meals={meals}
      onBack={pop}
      onStartCook={(mealId) => {
        const meal = meals.find(m => m.id === mealId);
        if (meal?.status !== "shopped") {
          toast("장보기 완료 후 요리할 수 있어요");
          return;
        }
        push({ screen: "COOK_MODE_PLANNER", mealId });
      }}
      onOpenMeal={(mid) => push({ screen: "MEAL", mealId: mid })}
      onOpenNotice={() => setCookNotice(true)}
    />;
  } else if (s === "COOK_MODE_PLANNER") {
    const meal = meals.find(m => m.id === cur.mealId);
    const recipe = meal ? DA.RECIPE[meal.recipeId] : null;
    body = <CookModePlannerScreen
      meal={meal}
      recipe={recipe}
      onBack={pop}
      onComplete={(mealId, completedRecipe) => setConsumedSheet({
        open: true,
        recipe: completedRecipe,
        mealId,
        ingredients: (completedRecipe?.ingredients || []).filter(i => i.id),
      })}
      pantryHeld={pantryHeld}
    />;
  } else if (s === "COOK_MODE_STANDALONE") {
    const recipe = DA.RECIPE[cur.recipeId];
    body = <CookModeStandaloneScreen
      recipe={recipe}
      onBack={pop}
      onComplete={(completedRecipe) => setConsumedSheet({
        open: true,
        recipe: completedRecipe,
        mealId: null,
        ingredients: (completedRecipe?.ingredients || []).filter(i => i.id),
      })}
      pantryHeld={pantryHeld}
    />;
  } else if (s === "SETTINGS") {
    body = <SettingsScreen
      onBack={pop}
      account={account}
      onOpenNickname={() => setNickname(true)}
      onOpenLogout={() => setLogout(true)}
      onDeleteAccount={openAccountDeleteConfirm}
      toast={toast}
    />;
  }

  return (
    <>
      <HC_.TopNav
        tab={topTab}
        onTab={goTab}
        account={account}
        isAuthenticated={isAuthenticated}
        onAvatarClick={() => {
          if (isAuthenticated) goTab("MYPAGE");
          else if (cur.screen !== "LOGIN") push({ screen: "LOGIN" });
        }}
      />
      {body}

      <SaveModal
        open={saveModal.open}
        recipeId={saveModal.recipeId}
        savedSet={savedSet}
        recipebooks={recipebooks}
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
      <PlannedServingsConfirmModal
        open={servingsConfirm.open}
        recipe={servingsConfirm.recipe}
        defaultDate={servingsConfirm.date}
        defaultCol={servingsConfirm.col}
        lockedSlot={servingsConfirm.lockedSlot}
        onClose={closeServingsConfirm}
        onConfirm={addMealFromServingsConfirm}
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
        onClose={() => setPantryReflect({ open: false, items: [], listId: null })}
        onConfirm={(ings) => {
          setPantryHeld(p => { const n = new Set(p); ings.forEach(i => n.add(i)); return n; });
          const completedFromShopping = Boolean(pantryReflect.listId);
          setPantryReflect({ open: false, items: [], listId: null });
          toast(completedFromShopping ? "장보기를 완료하고 팬트리에 반영했어요" : `${ings.length}개 재료를 팬트리에 반영했어요`);
        }}
      />
      <ConsumedIngredientSheet
        open={consumedSheet.open}
        recipe={consumedSheet.recipe}
        mealId={consumedSheet.mealId}
        ingredients={consumedSheet.ingredients}
        pantryHeld={pantryHeld}
        onClose={() => setConsumedSheet({ open: false, recipe: null, mealId: null, ingredients: [] })}
        onConfirm={(deductIds) => {
          setPantryHeld(p => {
            const n = new Set(p);
            deductIds.forEach(id => n.delete(id));
            return n;
          });
          const fromPlanner = Boolean(consumedSheet.mealId);
          if (fromPlanner) {
            setMeals(ms => ms.map(m => m.id === consumedSheet.mealId ? { ...m, status: "cooked" } : m));
          }
          setConsumedSheet({ open: false, recipe: null, mealId: null, ingredients: [] });
          toast(fromPlanner ? `요리 완료! ${deductIds.length}개 재료를 차감했어요` : `${deductIds.length}개 재료를 팬트리에서 차감했어요`);
          if (fromPlanner) {
            setStack([{ screen: "PLANNER_WEEK" }]);
            window.scrollTo({ top: 0, behavior: "instant" });
          } else {
            pop();
          }
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
        onGoToCookList={() => {
          setCookNotice(false);
          push({ screen: "COOK_READY_LIST" });
        }}
      />
      <HC_.LoginGateDialog
        open={loginGate.open}
        actionLabel={loginGate.actionLabel}
        helper={loginGate.helper}
        onClose={closeLoginGate}
        onConfirm={confirmLoginGate}
      />
      <HC_.ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel={confirmDialog.confirmLabel}
        cancelLabel={confirmDialog.cancelLabel}
        destructive={confirmDialog.destructive}
        icon={confirmDialog.icon}
        onClose={closeConfirm}
        onConfirm={() => {
          const fn = confirmDialog.onConfirm;
          closeConfirm();
          fn?.();
        }}
      />

      <HC_.Toast bus={toastBus} />
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
