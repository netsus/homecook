/* global React, ReactDOM */
const { useState: useStateA, useCallback: useCallbackA, useMemo: useMemoA, useEffect: useEffectA } = React;
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
  NicknameModal, RecipebookNameModal, LogoutModal,
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
    count: typeof book.count === "number" ? book.count : recipeIds.length,
    thumbs: book.thumbs || recipeIds.map(id => DA.RECIPE[id]?.photo).filter(Boolean),
  };
}

function latestActiveShoppingList(lists) {
  return [...lists]
    .filter(list => !list.completed)
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")) || String(b.id).localeCompare(String(a.id)))[0] || null;
}

function mealSlotLabel(meal) {
  const day = DA.WEEK_DATES.find(d => d.iso === meal.date);
  const colName = DA.MEAL_COLUMNS.find(c => c.id === meal.col)?.name || "끼니";
  return day ? `${day.dow} 5/${day.d} · ${colName}` : colName;
}

function shoppingIngredientName(ingredient) {
  return ingredient.id ? (DA.ING[ingredient.id]?.name || ingredient.name || "재료") : (ingredient.name || "재료");
}

function shoppingIngredientAmount(ingredient, factor) {
  const amount = typeof ingredient.amount === "number" ? ingredient.amount * factor : ingredient.amount;
  const value = typeof amount === "number"
    ? (amount >= 10 ? Math.round(amount * 10) / 10 : amount.toFixed(2).replace(/\.?0+$/, ""))
    : amount;
  return `${value || ""}${ingredient.unit ? ` ${ingredient.unit}` : ""}`.trim();
}

const DEFAULT_ROUTE = { screen: "HOME" };
const ROUTE_PARAM_KEYS = {
  RECIPE: ["recipeId"],
  MEAL: ["mealId"],
  MENU_ADD: ["date", "col"],
  RECIPE_SEARCH_PICKER: ["date", "col"],
  RECIPEBOOK_SELECTOR: ["date", "col"],
  RECIPEBOOK_DETAIL_PICKER: ["bookId", "date", "col"],
  PANTRY_MATCH_PICKER: ["date", "col"],
  MANUAL_RECIPE_CREATE: ["date", "col"],
  YT_IMPORT: ["date", "col"],
  RECIPEBOOK_DETAIL: ["bookId"],
  SHOPPING_DETAIL: ["listId"],
  COOK_MODE_PLANNER: ["mealId"],
  COOK_MODE_STANDALONE: ["recipeId"],
};
const TOP_ROUTE_SCREENS = new Set(["HOME", "PANTRY", "PLANNER_WEEK", "MYPAGE", "LOGIN"]);
const PLANNER_ROUTE_SCREENS = new Set([
  "MEAL",
  "MENU_ADD",
  "RECIPE_SEARCH_PICKER",
  "RECIPEBOOK_SELECTOR",
  "RECIPEBOOK_DETAIL_PICKER",
  "PANTRY_MATCH_PICKER",
  "MANUAL_RECIPE_CREATE",
  "YT_IMPORT",
  "COOK_READY_LIST",
  "COOK_MODE_PLANNER",
]);
const MYPAGE_ROUTE_SCREENS = new Set([
  "RECIPEBOOKS",
  "RECIPEBOOK_DETAIL",
  "SHOPPING_FLOW",
  "SHOPPING_LISTS",
  "SHOPPING_DETAIL",
  "LEFTOVERS",
  "ATE_LIST",
  "SETTINGS",
]);
const KNOWN_ROUTE_SCREENS = new Set([
  ...TOP_ROUTE_SCREENS,
  ...PLANNER_ROUTE_SCREENS,
  ...MYPAGE_ROUTE_SCREENS,
  "RECIPE",
  "COOK_MODE_STANDALONE",
]);

function routeParamsFor(screen) {
  return ROUTE_PARAM_KEYS[screen] || [];
}

function normalizeRouteEntry(entry) {
  const screen = KNOWN_ROUTE_SCREENS.has(entry?.screen) ? entry.screen : DEFAULT_ROUTE.screen;
  const normalized = { screen };
  routeParamsFor(screen).forEach((key) => {
    if (entry?.[key] !== undefined && entry[key] !== null && entry[key] !== "") {
      normalized[key] = String(entry[key]);
    }
  });
  return normalized;
}

function parseHashRoute(hash) {
  const raw = String(hash || (typeof window !== "undefined" ? window.location.hash : "")).replace(/^#/, "");
  if (!raw) return DEFAULT_ROUTE;

  const params = new URLSearchParams(raw);
  return normalizeRouteEntry({
    screen: params.get("screen") || DEFAULT_ROUTE.screen,
    ...Object.fromEntries(params.entries()),
  });
}

function routeEntryToHash(entry) {
  const normalized = normalizeRouteEntry(entry);
  const params = new URLSearchParams();
  params.set("screen", normalized.screen);
  routeParamsFor(normalized.screen).forEach((key) => {
    if (normalized[key]) params.set(key, normalized[key]);
  });
  return `#${params.toString()}`;
}

function writeRouteHash(entry, mode = "push") {
  if (typeof window === "undefined") return;

  const hash = routeEntryToHash(entry);
  if (window.location.hash === hash) return;

  const url = `${window.location.pathname}${window.location.search}${hash}`;
  if (mode === "replace") {
    window.history.replaceState(null, "", url);
  } else {
    window.history.pushState(null, "", url);
  }
}

function stackFromRouteEntry(entry) {
  const route = normalizeRouteEntry(entry);
  if (TOP_ROUTE_SCREENS.has(route.screen)) return [route];
  if (route.screen === "RECIPE") return [{ screen: "HOME" }, route];
  if (route.screen === "COOK_MODE_STANDALONE") {
    return route.recipeId
      ? [{ screen: "HOME" }, { screen: "RECIPE", recipeId: route.recipeId }, route]
      : [{ screen: "HOME" }, route];
  }
  if (PLANNER_ROUTE_SCREENS.has(route.screen)) {
    const stack = [{ screen: "PLANNER_WEEK" }];
    const hasSlot = route.date || route.col;

    if (["RECIPE_SEARCH_PICKER", "RECIPEBOOK_SELECTOR", "PANTRY_MATCH_PICKER", "MANUAL_RECIPE_CREATE", "YT_IMPORT"].includes(route.screen) && hasSlot) {
      stack.push({ screen: "MENU_ADD", date: route.date, col: route.col });
    }
    if (route.screen === "RECIPEBOOK_DETAIL_PICKER") {
      if (hasSlot) stack.push({ screen: "MENU_ADD", date: route.date, col: route.col });
      stack.push({ screen: "RECIPEBOOK_SELECTOR", date: route.date, col: route.col });
    }

    return [...stack, route];
  }
  if (MYPAGE_ROUTE_SCREENS.has(route.screen)) {
    const stack = [{ screen: "MYPAGE" }];
    if (route.screen === "RECIPEBOOK_DETAIL") stack.push({ screen: "RECIPEBOOKS" });
    if (route.screen === "SHOPPING_DETAIL") stack.push({ screen: "SHOPPING_LISTS" });
    return [...stack, route];
  }
  return [DEFAULT_ROUTE];
}

function createShoppingListFromMeals(targetMeals, pantryHeld) {
  const stamp = Date.now();
  const firstMeal = targetMeals[0];
  const firstRecipe = firstMeal ? DA.RECIPE[firstMeal.recipeId] : null;
  const title = targetMeals.length === 1 && firstRecipe
    ? `${mealSlotLabel(firstMeal)} ${firstRecipe.title} 장보기`
    : `${targetMeals.length}개 끼니 장보기`;
  const items = [];
  const excluded = [];

  targetMeals.forEach(meal => {
    const recipe = DA.RECIPE[meal.recipeId];
    if (!recipe) return;
    const factor = (meal.servings || recipe.baseServings || 1) / (recipe.baseServings || 1);
    recipe.ingredients.forEach((ingredient, index) => {
      const row = {
        id: `${meal.id}-${ingredient.id || "custom"}-${index}`,
        ing: ingredient.id || null,
        name: shoppingIngredientName(ingredient),
        amount: shoppingIngredientAmount(ingredient, factor),
        note: recipe.title,
      };
      if (ingredient.id && pantryHeld.has(ingredient.id)) {
        excluded.push(row);
      } else {
        items.push(row);
      }
    });
  });

  return {
    id: `sl-${stamp}`,
    title,
    range: firstMeal ? mealSlotLabel(firstMeal) : "직접 만든 장보기",
    createdAt: DA.TODAY_ISO,
    completed: false,
    origin: "planner-linked",
    mealIds: targetMeals.map(meal => meal.id),
    items,
    excluded,
  };
}

function createManualShoppingList() {
  const stamp = Date.now();
  return normalizeShoppingList({
    id: `sl-manual-${stamp}`,
    title: "새 장보기 리스트",
    range: "직접 만든 목록",
    createdAt: DA.TODAY_ISO,
    completed: false,
    origin: "manual",
    mealIds: [],
    items: [
      { id: `manual-${stamp}-1`, ing: null, name: "직접 추가한 재료", amount: "1개", note: "" },
    ],
    excluded: [],
  });
}

function cloneShoppingListForReadd(list) {
  const stamp = Date.now();
  return normalizeShoppingList({
    id: `sl-readd-${stamp}`,
    title: `${list.title} 다시 장보기`,
    range: list.range || "다시 장보기",
    createdAt: DA.TODAY_ISO,
    completed: false,
    origin: "readd",
    mealIds: [],
    items: (list.items || []).map((item, index) => ({
      ...item,
      id: `readd-${stamp}-${index}`,
      checked: false,
    })),
    excluded: (list.excluded || []).map((item, index) => ({
      ...item,
      id: `readd-ex-${stamp}-${index}`,
    })),
  });
}

function App() {
  // Routing — hash-backed stack. Modals intentionally stay out of browser history.
  const [stack, setStack] = useStateA(() => stackFromRouteEntry(parseHashRoute()));
  const cur = stack[stack.length - 1];

  // Persisted state
  const [savedSet, setSavedSet] = useStateA(() => new Set(["r1", "r2", "r3", "r4", "r5", "r6"]));
  const [pantryHeld, setPantryHeld] = useStateA(() => new Set(DA.PANTRY_HELD));
  const [meals, setMeals] = useStateA(() => DA.MEALS);
  const [shoppingLists, setShoppingLists] = useStateA(() => DA.SHOPPING_LISTS.map(normalizeShoppingList));
  const [activeShoppingListId, setActiveShoppingListId] = useStateA(() => latestActiveShoppingList(DA.SHOPPING_LISTS)?.id || null);
  const [leftovers, setLeftovers] = useStateA(() => DA.LEFTOVERS.map(normalizeLeftover));
  const [ateItems, setAteItems] = useStateA(() => DA.ATE.map(normalizeAteItem));
  const [recipebooks, setRecipebooks] = useStateA(() => DA.RECIPEBOOKS.map(normalizeRecipebook));
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
  const [plannerAddModal, setPlannerAddModal] = useStateA({ open: false, recipeId: null, date: null, col: null, servings: null });
  const [servingsConfirm, setServingsConfirm] = useStateA({ open: false, recipe: null, date: null, col: null, lockedSlot: false });
  const [filterModal, setFilterModal] = useStateA({ open: false });
  const [lightbox, setLightbox] = useStateA({ open: false, photos: [], idx: 0 });
  const [pantryAddIng, setPantryAddIng] = useStateA(false);
  const [pantryAddBundle, setPantryAddBundle] = useStateA(false);
  const [pantryReflect, setPantryReflect] = useStateA({ open: false, items: [], listId: null, checkedItemIds: [] });
  const [nickname, setNickname] = useStateA(false);
  const [recipebookNameModal, setRecipebookNameModal] = useStateA({ open: false, mode: "create", bookId: null });
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

  useEffectA(() => {
    if (!window.location.hash) writeRouteHash(DEFAULT_ROUTE, "replace");

    const syncStackFromHash = () => {
      setStack(stackFromRouteEntry(parseHashRoute()));
      window.scrollTo({ top: 0, behavior: "instant" });
    };

    window.addEventListener("popstate", syncStackFromHash);
    window.addEventListener("hashchange", syncStackFromHash);
    return () => {
      window.removeEventListener("popstate", syncStackFromHash);
      window.removeEventListener("hashchange", syncStackFromHash);
    };
  }, []);

  // Nav
  const push = (entry) => {
    const route = normalizeRouteEntry(entry);
    setStack(s => [...s, route]);
    writeRouteHash(route);
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const replace = (entry) => {
    const route = normalizeRouteEntry(entry);
    setStack(s => [...s.slice(0, -1), route]);
    writeRouteHash(route, "replace");
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const pop = () => {
    if (stack.length <= 1) return;

    const nextStack = stack.slice(0, -1);
    setStack(nextStack);
    writeRouteHash(nextStack[nextStack.length - 1], "replace");
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const goTab = (tab) => {
    const route = normalizeRouteEntry({ screen: tab });
    setStack([route]);
    writeRouteHash(route);
    window.scrollTo({ top: 0, behavior: "instant" });
  };

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

  const openShoppingForMeal = useCallbackA((mealId) => {
    const meal = meals.find(m => m.id === mealId);
    if (!meal || meal.status === "cooked") return;

    if (meal.status === "registered") {
      const activeLinked = shoppingLists.find(list => !list.completed && list.mealIds?.includes(meal.id));
      if (activeLinked) {
        setActiveShoppingListId(activeLinked.id);
        push({ screen: "SHOPPING_DETAIL", listId: activeLinked.id });
        return;
      }
      const newList = createShoppingListFromMeals([meal], pantryHeld);
      setShoppingLists(prev => [newList, ...prev]);
      setActiveShoppingListId(newList.id);
      push({ screen: "SHOPPING_DETAIL", listId: newList.id });
      return;
    }

    const linked = shoppingLists.find(list => list.mealIds?.includes(meal.id));
    if (linked) {
      if (!linked.completed) setActiveShoppingListId(linked.id);
      push({ screen: "SHOPPING_DETAIL", listId: linked.id });
      return;
    }
    toast("연결된 장보기 목록이 없어요");
  }, [meals, shoppingLists, pantryHeld, toast]);

  const completeShoppingList = useCallbackA((listId, checkedItemIds = []) => {
    const target = shoppingLists.find(list => list.id === listId);
    if (!target) return;
    const checkedSet = new Set(checkedItemIds);
    setShoppingLists(prev => prev.map(list => {
      if (list.id !== listId) return list;
      return {
        ...list,
        completed: true,
        items: list.items.map(item => ({ ...item, checked: checkedSet.has(item.id) || Boolean(item.checked) })),
      };
    }));
    setMeals(prev => prev.map(meal => (
      target.mealIds?.includes(meal.id) && meal.status === "registered"
        ? { ...meal, status: "shopped" }
        : meal
    )));
    setActiveShoppingListId(current => current === listId ? null : current);
  }, [shoppingLists]);

  const requestShoppingCompletion = useCallbackA((listId, checkedItemIds, reflectableItems) => {
    if (reflectableItems.length > 0) {
      setPantryReflect({ open: true, items: reflectableItems, listId, checkedItemIds });
      return;
    }
    completeShoppingList(listId, checkedItemIds);
    toast("장보기를 완료했어요");
  }, [completeShoppingList, toast]);

  const openManualShoppingList = useCallbackA(() => {
    const list = createManualShoppingList();
    setShoppingLists(prev => [list, ...prev]);
    setActiveShoppingListId(list.id);
    push({ screen: "SHOPPING_DETAIL", listId: list.id });
    toast("새 장보기 리스트를 만들었어요");
  }, [toast]);

  const readdShoppingList = useCallbackA((listId) => {
    const source = shoppingLists.find(list => list.id === listId);
    if (!source || !source.completed) return;
    const list = cloneShoppingListForReadd(source);
    setShoppingLists(prev => [list, ...prev]);
    setActiveShoppingListId(list.id);
    push({ screen: "SHOPPING_DETAIL", listId: list.id });
    toast("다시 장보기로 담았어요");
  }, [shoppingLists, toast]);

  const openCreateRecipebook = useCallbackA(() => {
    setRecipebookNameModal({ open: true, mode: "create", bookId: null });
  }, []);

  const openEditRecipebook = useCallbackA((bookId) => {
    setRecipebookNameModal({ open: true, mode: "edit", bookId });
  }, []);

  const closeRecipebookNameModal = useCallbackA(() => {
    setRecipebookNameModal({ open: false, mode: "create", bookId: null });
  }, []);

  const saveRecipebookName = useCallbackA((title) => {
    if (recipebookNameModal.mode === "edit") {
      const bookId = recipebookNameModal.bookId;
      setRecipebooks(prev => prev.map(book => (
        book.id === bookId && book.type === "custom" ? { ...book, title } : book
      )));
      closeRecipebookNameModal();
      toast("레시피북 이름을 수정했어요");
      return;
    }

    const id = `rb-custom-${Date.now()}`;
    const book = normalizeRecipebook({
      id,
      title,
      type: "custom",
      recipeIds: [],
      count: 0,
      thumbs: [],
    });
    setRecipebooks(prev => [...prev, book]);
    closeRecipebookNameModal();
    push({ screen: "RECIPEBOOK_DETAIL", bookId: id });
    toast("새 레시피북을 만들었어요");
  }, [recipebookNameModal, closeRecipebookNameModal, toast]);

  const completeLogout = useCallbackA(() => {
    setIsAuthenticated(false);
    setLogout(false);
    setNickname(false);
    setSaveModal({ open: false, recipeId: null });
    setPlannerAddModal({ open: false, recipeId: null, date: null, col: null, servings: null });
    closeServingsConfirm();
    setRecipebookNameModal({ open: false, mode: "create", bookId: null });
    setLoginGate({ open: false, actionLabel: "", helper: "", resume: null });
    toast("로그아웃했어요");
    goTab("HOME");
  }, [closeServingsConfirm, toast]);

  const leftoverNote = useCallbackA((recipe, servings) => {
    return `${recipe?.title || "요리"} ${servings}인분`;
  }, []);

  const recordPlannerLeftover = useCallbackA((meal, recipe) => {
    if (!meal || !recipe) return;
    const servings = Math.max(1, Math.ceil((meal.servings || recipe.baseServings || 2) / 2));
    const leftover = normalizeLeftover({
      id: `lf-${meal.id}`,
      recipeId: meal.recipeId,
      createdAt: DA.TODAY_ISO,
      note: leftoverNote(recipe, servings),
      servings,
      sourceMealId: meal.id,
      sourceDate: meal.date,
      sourceCol: meal.col,
    });
    setLeftovers(prev => [
      leftover,
      ...prev.filter(item => item.sourceMealId !== meal.id),
    ]);
  }, [leftoverNote]);

  const reAddLeftoverToPlanner = useCallbackA((leftoverId) => {
    const leftover = leftovers.find(item => item.id === leftoverId);
    if (!leftover) return;
    const date = DA.WEEK_DATES.some(day => day.iso === leftover.sourceDate) ? leftover.sourceDate : DA.TODAY_ISO;
    setPlannerAddModal({
      open: true,
      recipeId: leftover.recipeId,
      date,
      col: leftover.sourceCol || "col-d",
      servings: leftover.servings || DA.RECIPE[leftover.recipeId]?.baseServings || 2,
    });
  }, [leftovers]);

  const moveLeftoverToAte = useCallbackA((leftoverId) => {
    const leftover = leftovers.find(item => item.id === leftoverId);
    if (!leftover) return;
    const ateItem = normalizeAteItem({
      id: `a-${leftover.id}-${Date.now()}`,
      recipeId: leftover.recipeId,
      ateAt: DA.TODAY_ISO,
      servings: leftover.servings || 1,
      sourceMealId: leftover.sourceMealId || null,
      sourceDate: leftover.sourceDate || leftover.createdAt || DA.TODAY_ISO,
      sourceCol: leftover.sourceCol || null,
    });
    setLeftovers(prev => prev.filter(item => item.id !== leftoverId));
    setAteItems(prev => [ateItem, ...prev]);
    toast("다먹은 목록에 추가했어요");
  }, [leftovers, toast]);

  const undoAteToLeftover = useCallbackA((ateItemId) => {
    const ateItem = ateItems.find(item => item.id === ateItemId);
    if (!ateItem) return;
    const recipe = DA.RECIPE[ateItem.recipeId];
    const servings = ateItem.servings || 1;
    const leftover = normalizeLeftover({
      id: `lf-${ateItem.id}-${Date.now()}`,
      recipeId: ateItem.recipeId,
      createdAt: DA.TODAY_ISO,
      note: leftoverNote(recipe, servings),
      servings,
      sourceMealId: ateItem.sourceMealId || null,
      sourceDate: ateItem.sourceDate || ateItem.ateAt || DA.TODAY_ISO,
      sourceCol: ateItem.sourceCol || null,
    });
    setAteItems(prev => prev.filter(item => item.id !== ateItemId));
    setLeftovers(prev => [leftover, ...prev]);
    toast("남은 요리로 되돌렸어요");
  }, [ateItems, leftoverNote, toast]);

  const completeCookSession = useCallbackA(({ mealId, recipe, deductIds = [] }) => {
    setPantryHeld(prev => {
      const next = new Set(prev);
      deductIds.forEach(id => next.delete(id));
      return next;
    });
    const fromPlanner = Boolean(mealId);
    const meal = fromPlanner ? meals.find(item => item.id === mealId) : null;
    const cookedRecipe = recipe || (meal ? DA.RECIPE[meal.recipeId] : null);
    if (fromPlanner) {
      setMeals(prev => prev.map(meal => meal.id === mealId ? { ...meal, status: "cooked" } : meal));
      recordPlannerLeftover(meal, cookedRecipe);
    }
    toast(fromPlanner
      ? `요리 완료! ${deductIds.length}개 재료를 차감했어요`
      : `${cookedRecipe?.title || "요리"} 완료! ${deductIds.length}개 재료를 차감했어요`);
    if (fromPlanner) {
      setStack([{ screen: "PLANNER_WEEK" }]);
      window.scrollTo({ top: 0, behavior: "instant" });
    } else {
      pop();
    }
  }, [meals, recordPlannerLeftover, toast]);

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
      }, () => setPlannerAddModal({ open: true, recipeId: rid, date: DA.TODAY_ISO, col: "col-d", servings }))}
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
          if (recipeId) setPlannerAddModal({ open: true, recipeId, date: date || DA.TODAY_ISO, col: col || "col-d", servings: null });
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
      onGoShopping={() => openShoppingForMeal(cur.mealId)}
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
      onCreateBook={openCreateRecipebook}
    />;
  } else if (s === "RECIPEBOOK_DETAIL") {
    const book = recipebooks.find(b => b.id === cur.bookId);
    body = <RecipebookDetailScreen
      bookId={cur.bookId}
      recipebooks={recipebooks}
      onBack={pop}
      onOpenRecipe={(rid) => push({ screen: "RECIPE", recipeId: rid })}
      onEditBook={book?.type === "custom" ? () => openEditRecipebook(book.id) : null}
      onDeleteBook={book?.type === "custom" ? () => openRecipebookDeleteConfirm(book) : null}
    />;
  } else if (s === "SHOPPING_FLOW") {
    body = <ShoppingFlowScreen
      onBack={pop}
      onOpenCurrent={(lid) => {
        setActiveShoppingListId(lid);
        push({ screen: "SHOPPING_DETAIL", listId: lid });
      }}
      onOpenPast={() => push({ screen: "SHOPPING_LISTS" })}
      onCreateNew={openManualShoppingList}
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
      onOpenReAdd={readdShoppingList}
      onCompleteShopping={requestShoppingCompletion}
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
      onMarkAte={moveLeftoverToAte}
      onReAddToPlanner={reAddLeftoverToPlanner}
      onGoAteList={() => push({ screen: "ATE_LIST" })}
    />;
  } else if (s === "ATE_LIST") {
    body = <AteListScreen
      ateItems={ateItems}
      onBack={pop}
      onOpenRecipe={(rid) => push({ screen: "RECIPE", recipeId: rid })}
      onUndoAte={undoAteToLeftover}
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
      onComplete={(mealId, completedRecipe, deductIds) => completeCookSession({ mealId, recipe: completedRecipe, deductIds })}
      pantryHeld={pantryHeld}
    />;
  } else if (s === "COOK_MODE_STANDALONE") {
    const recipe = DA.RECIPE[cur.recipeId];
    body = <CookModeStandaloneScreen
      recipe={recipe}
      onBack={pop}
      onComplete={(completedRecipe, deductIds) => completeCookSession({ recipe: completedRecipe, deductIds })}
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
        onCreateBook={() => {
          setSaveModal({ open: false, recipeId: null });
          openCreateRecipebook();
        }}
      />
      <PlannerAddModal
        open={plannerAddModal.open}
        recipeId={plannerAddModal.recipeId}
        defaultDate={plannerAddModal.date}
        defaultCol={plannerAddModal.col}
        defaultServings={plannerAddModal.servings}
        onClose={() => setPlannerAddModal({ open: false, recipeId: null, date: null, col: null, servings: null })}
        onConfirm={({ recipeId, date, col, servings }) => {
          const id = `m-${Date.now()}`;
          setMeals(ms => [...ms, { id, recipeId, date, col, servings, status: "registered" }]);
          setPlannerAddModal({ open: false, recipeId: null, date: null, col: null, servings: null });
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
        onClose={() => setPantryReflect({ open: false, items: [], listId: null, checkedItemIds: [] })}
        onConfirm={(ings) => {
          setPantryHeld(p => { const n = new Set(p); ings.forEach(i => n.add(i)); return n; });
          const completedFromShopping = Boolean(pantryReflect.listId);
          if (completedFromShopping) {
            completeShoppingList(pantryReflect.listId, pantryReflect.checkedItemIds);
          }
          setPantryReflect({ open: false, items: [], listId: null, checkedItemIds: [] });
          toast(completedFromShopping ? "장보기를 완료하고 팬트리에 반영했어요" : `${ings.length}개 재료를 팬트리에 반영했어요`);
        }}
      />
      <NicknameModal
        open={nickname}
        current={account.nickname}
        onClose={() => setNickname(false)}
        onConfirm={(name) => { setAccount(a => ({ ...a, nickname: name })); setNickname(false); toast("닉네임을 변경했어요"); }}
      />
      <RecipebookNameModal
        open={recipebookNameModal.open}
        mode={recipebookNameModal.mode}
        currentTitle={recipebooks.find(book => book.id === recipebookNameModal.bookId)?.title || ""}
        onClose={closeRecipebookNameModal}
        onConfirm={saveRecipebookName}
      />
      <LogoutModal
        open={logout}
        provider={account.provider}
        onClose={() => setLogout(false)}
        onConfirm={completeLogout}
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
