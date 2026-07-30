export type RecipeEditorContext =
  | "planner-add"
  | "personal-create"
  | "personal-edit"
  | "public-fork";

export interface RecipeEditorContextPolicy {
  activeEntry: boolean;
  cancelDestination: "planner-origin" | "current-recipe-detail" | "source-recipe-detail" | "invoker";
  mealSideEffect: "create-after-recipe" | "none";
  plannerContextRequired: boolean;
  primaryIdentity: "new-private" | "same-private";
  secondaryIdentity: "new-private" | "none";
  sourceMutation: "current-private-only" | "never";
}

export type RecipeEditorImageState =
  | "idle"
  | "uploaded_unlinked"
  | "attached"
  | (string & {});

export interface RecipeEditorImageDraft {
  attachment: "unattached" | "attached";
  imageObjectId: string | null;
  readUrl?: string | null;
  readUrlExpiresAt?: string | null;
  state: RecipeEditorImageState;
}

export interface RecipeEditorImageSource {
  image_object_id: string;
  read_url: string;
  read_url_expires_at: string;
  state: RecipeEditorImageState;
}

export type RecipeEditorIngredientSource =
  | {
      kind: "ingredient";
      ingredientId: string | null;
    }
  | {
      kind: "product";
      productId: string | null;
      productNutritionVersionId: string | null;
    };

export interface RecipeEditorIngredientDraft {
  draftId: string;
  source: RecipeEditorIngredientSource;
  standardName: string;
  amount: number | null;
  unit: string | null;
  ingredientType: string;
  sortOrder: number;
}

export interface RecipeEditorStepDraft {
  draftId: string;
  instruction: string;
  cookingMethodId: string | null;
  sortOrder: number;
}

export interface RecipeEditorDraft {
  title: string;
  baseServings: number;
  ingredients: RecipeEditorIngredientDraft[];
  steps: RecipeEditorStepDraft[];
  tags: string[];
  image: RecipeEditorImageDraft;
}

export type RecipeEditorCleanupState = "idle" | "running" | "failed" | "complete";

export function getRecipeEditorContextPolicy(
  context: RecipeEditorContext,
): RecipeEditorContextPolicy {
  switch (context) {
    case "planner-add":
      return {
        activeEntry: true,
        cancelDestination: "planner-origin",
        mealSideEffect: "create-after-recipe",
        plannerContextRequired: true,
        primaryIdentity: "new-private",
        secondaryIdentity: "none",
        sourceMutation: "never",
      };
    case "personal-edit":
      return {
        activeEntry: true,
        cancelDestination: "current-recipe-detail",
        mealSideEffect: "none",
        plannerContextRequired: false,
        primaryIdentity: "same-private",
        secondaryIdentity: "new-private",
        sourceMutation: "current-private-only",
      };
    case "public-fork":
      return {
        activeEntry: true,
        cancelDestination: "source-recipe-detail",
        mealSideEffect: "none",
        plannerContextRequired: false,
        primaryIdentity: "new-private",
        secondaryIdentity: "none",
        sourceMutation: "never",
      };
    case "personal-create":
      return {
        activeEntry: false,
        cancelDestination: "invoker",
        mealSideEffect: "none",
        plannerContextRequired: false,
        primaryIdentity: "new-private",
        secondaryIdentity: "none",
        sourceMutation: "never",
      };
  }
}

export function createRecipeEditorImageDraft(
  image?: RecipeEditorImageSource | null,
): RecipeEditorImageDraft {
  if (!image) {
    return {
      attachment: "unattached",
      imageObjectId: null,
      readUrl: null,
      readUrlExpiresAt: null,
      state: "idle",
    };
  }

  return {
    attachment:
      image.state === "attached"
      || image.state === "attached_private"
      || image.state === "attached_public_shared"
        ? "attached"
        : "unattached",
    imageObjectId: image.image_object_id,
    readUrl: image.read_url,
    readUrlExpiresAt: image.read_url_expires_at,
    state: image.state,
  };
}

export function createEmptyRecipeEditorDraft(): RecipeEditorDraft {
  return {
    title: "",
    baseServings: 2,
    ingredients: [],
    steps: [],
    tags: [],
    image: createRecipeEditorImageDraft(),
  };
}

function normalizeDraftForCompare(draft: RecipeEditorDraft) {
  return JSON.stringify({
    title: draft.title.trim(),
    baseServings: draft.baseServings,
    ingredients: draft.ingredients.map((ingredient) => ({
      source: ingredient.source,
      standardName: ingredient.standardName,
      amount: ingredient.amount,
      unit: ingredient.unit,
      ingredientType: ingredient.ingredientType,
      sortOrder: ingredient.sortOrder,
    })),
    steps: draft.steps.map((step) => ({
      instruction: step.instruction.trim(),
      cookingMethodId: step.cookingMethodId,
      sortOrder: step.sortOrder,
    })),
    tags: [...draft.tags],
    image: {
      attachment: draft.image.attachment,
      imageObjectId: draft.image.imageObjectId,
      state: draft.image.state,
    },
  });
}

export function isRecipeEditorDraftDirty(
  initialDraft: RecipeEditorDraft,
  nextDraft: RecipeEditorDraft,
) {
  return normalizeDraftForCompare(initialDraft) !== normalizeDraftForCompare(nextDraft);
}

export function resolveRecipeEditorExit({
  cleanupState,
  dirty,
  hasUnattachedManagedImage,
}: {
  cleanupState: RecipeEditorCleanupState;
  dirty: boolean;
  hasUnattachedManagedImage: boolean;
}) {
  if (
    hasUnattachedManagedImage
    && (cleanupState === "failed" || cleanupState === "running")
  ) {
    return "cleanup-blocked";
  }

  if (dirty) {
    return "confirm-discard";
  }

  return "exit";
}

export async function cleanupRecipeEditorImage(
  image: RecipeEditorImageDraft | null,
  options: {
    cancelOwnerUpload: (imageObjectId: string, idempotencyKey: string) => Promise<{ success: boolean }>;
    idempotencyKey: string;
  },
) {
  if (!image?.imageObjectId || image.attachment === "attached") {
    return "not-required";
  }

  try {
    const result = await options.cancelOwnerUpload(
      image.imageObjectId,
      options.idempotencyKey,
    );

    return result.success ? "complete" : "failed";
  } catch {
    return "failed";
  }
}
