export const ALLOWED_AMOUNT_BASIS = new Set(["stated", "spoken", "onscreen", "visual-estimate"]);

function cleanString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasKnownPiPayload(value) {
  return isObject(value) && (
    Array.isArray(value.recipes)
    || Array.isArray(value.candidates)
    || isObject(value.recipe)
  );
}

function extractJsonFromText(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    // Continue with markdown/inline JSON extraction.
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/iu);
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      // Continue with brace extraction.
    }
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    } catch {
      return null;
    }
  }
  return null;
}

function extractJsonFromJsonLines(text) {
  const lines = String(text ?? "").split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return null;
  const candidates = [];
  for (const line of lines) {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event?.message?.role === "assistant") {
      for (const part of event.message.content ?? []) {
        if (typeof part?.text === "string") candidates.push(part.text);
      }
    }
    if (event?.assistantMessageEvent?.content) {
      candidates.push(event.assistantMessageEvent.content);
    }
    if (Array.isArray(event?.messages)) {
      for (const message of event.messages) {
        if (message?.role !== "assistant") continue;
        for (const part of message.content ?? []) {
          if (typeof part?.text === "string") candidates.push(part.text);
        }
      }
    }
  }
  for (const candidate of candidates.reverse()) {
    const parsed = extractJsonFromText(candidate);
    if (parsed && isObject(parsed)) return parsed;
  }
  return null;
}

function collectTextCandidates(value) {
  if (!value || typeof value !== "object") return [];
  const candidates = [];
  for (const key of ["text", "output", "response", "content", "message", "result", "stdout"]) {
    const field = value[key];
    if (typeof field === "string") candidates.push(field);
    if (field && typeof field === "object") candidates.push(...collectTextCandidates(field));
  }
  if (Array.isArray(value.messages)) {
    for (const message of value.messages) {
      candidates.push(...collectTextCandidates(message));
      if (typeof message?.content === "string") candidates.push(message.content);
    }
  }
  return candidates;
}

export function parsePiRawOutput(raw) {
  if (raw && typeof raw === "object") {
    if (hasKnownPiPayload(raw)) return raw;
    for (const candidate of collectTextCandidates(raw)) {
      const fromJsonLines = extractJsonFromJsonLines(candidate);
      if (fromJsonLines) return fromJsonLines;
      const parsed = extractJsonFromText(candidate);
      if (parsed && isObject(parsed)) return parsed;
    }
    return raw;
  }

  const text = String(raw ?? "");
  const fromJsonLines = extractJsonFromJsonLines(text);
  if (fromJsonLines) return fromJsonLines;

  try {
    const parsed = JSON.parse(text);
    if (hasKnownPiPayload(parsed)) return parsed;
    for (const candidate of collectTextCandidates(parsed)) {
      const fromNestedJsonLines = extractJsonFromJsonLines(candidate);
      if (fromNestedJsonLines) return fromNestedJsonLines;
      const nested = extractJsonFromText(candidate);
      if (nested && isObject(nested)) return nested;
    }
    return parsed;
  } catch {
    const direct = extractJsonFromText(text);
    return direct;
  }
}

function normalizeAmountBasis(value) {
  const basis = cleanString(value);
  return basis ?? null;
}

function normalizeIngredient(ingredient) {
  const source = ingredient && typeof ingredient === "object" ? ingredient : {};
  const name = cleanString(source.name) ?? cleanString(source.item) ?? cleanString(source.ingredient);
  return {
    ...source,
    name,
    amount: cleanString(source.amount),
    unit: cleanString(source.unit),
    amountBasis: normalizeAmountBasis(source.amountBasis ?? source.basis),
  };
}

function normalizeStep(step, index) {
  if (typeof step === "string") return step.trim();
  if (step && typeof step === "object") {
    return cleanString(step.text) ?? cleanString(step.instruction) ?? cleanString(step.description) ?? `단계 ${index + 1}`;
  }
  return `단계 ${index + 1}`;
}

function normalizeStringArray(value) {
  return Array.isArray(value) ? value.map(cleanString).filter(Boolean) : [];
}

function normalizeCandidate(candidate, index) {
  const source = candidate && typeof candidate === "object" ? candidate : {};
  const ingredientNames = Array.isArray(source.ingredientNames)
    ? normalizeStringArray(source.ingredientNames)
    : Array.isArray(source.ingredients)
    ? source.ingredients
      .map((ingredient) => (typeof ingredient === "string" ? ingredient : ingredient?.name ?? ingredient?.item ?? ingredient?.ingredient))
      .map(cleanString)
      .filter(Boolean)
    : [];
  return {
    ...source,
    candidateId: cleanString(source.candidateId) ?? `r${index + 1}`,
    title: cleanString(source.title) ?? `레시피 ${index + 1}`,
    ingredientNames,
    evidence: normalizeStringArray(source.evidence),
    uncertainties: normalizeStringArray(source.uncertainties),
  };
}

export function normalizePiRecipeCandidates(value) {
  const parsed = parsePiRawOutput(value);
  const candidates = Array.isArray(parsed?.candidates) ? parsed.candidates : [];
  return {
    ...parsed,
    candidates: candidates.map(normalizeCandidate),
  };
}

export function normalizePiRecipeOutput(value) {
  const parsed = parsePiRawOutput(value);
  const recipes = Array.isArray(parsed?.recipes) ? parsed.recipes : isObject(parsed?.recipe) ? [parsed.recipe] : [];
  const repairLog = Array.isArray(parsed?.repairLog)
    ? parsed.repairLog.filter((entry) => isObject(entry))
    : [];
  return {
    ...parsed,
    recipes: recipes.map((recipe) => {
      const source = recipe && typeof recipe === "object" ? recipe : {};
      return {
        ...source,
        title: cleanString(source.title) ?? "제목 미확인",
        candidateId: cleanString(source.candidateId),
        ingredients: Array.isArray(source.ingredients) ? source.ingredients.map(normalizeIngredient) : [],
        steps: Array.isArray(source.steps) ? source.steps.map(normalizeStep).filter(Boolean) : [],
        uncertainties: Array.isArray(source.uncertainties) ? source.uncertainties.filter((item) => typeof item === "string") : [],
      };
    }),
    repairLog,
  };
}

export function validatePiRecipeCandidates(output) {
  const errors = [];
  if (!output || typeof output !== "object") {
    return ["output must be a JSON object"];
  }
  if (!Array.isArray(output.candidates)) {
    errors.push("candidates must be an array");
    return errors;
  }

  output.candidates.forEach((candidate, index) => {
    if (!cleanString(candidate.candidateId)) {
      errors.push(`candidates[${index}].candidateId is required`);
    }
    if (!cleanString(candidate.title)) {
      errors.push(`candidates[${index}].title is required`);
    }
    if (!Array.isArray(candidate.ingredientNames)) {
      errors.push(`candidates[${index}].ingredientNames must be an array`);
    }
  });

  return errors;
}

export function validatePiRecipeOutput(output) {
  const errors = [];
  if (!output || typeof output !== "object") {
    return ["output must be a JSON object"];
  }
  if (!Array.isArray(output.recipes)) {
    errors.push("recipes must be an array");
    return errors;
  }

  output.recipes.forEach((recipe, recipeIndex) => {
    if (!cleanString(recipe.title)) {
      errors.push(`recipes[${recipeIndex}].title is required`);
    }
    if (!Array.isArray(recipe.ingredients)) {
      errors.push(`recipes[${recipeIndex}].ingredients must be an array`);
      return;
    }
    recipe.ingredients.forEach((ingredient, ingredientIndex) => {
      if (!cleanString(ingredient.name)) {
        errors.push(`recipes[${recipeIndex}].ingredients[${ingredientIndex}].name is required`);
      }
      if (ingredient.amountBasis !== null && ingredient.amountBasis !== undefined && !ALLOWED_AMOUNT_BASIS.has(ingredient.amountBasis)) {
        errors.push(
          `recipes[${recipeIndex}].ingredients[${ingredientIndex}].amountBasis must be one of ${[...ALLOWED_AMOUNT_BASIS].join(", ")} or null`,
        );
      }
    });
    if (!Array.isArray(recipe.steps)) {
      errors.push(`recipes[${recipeIndex}].steps must be an array`);
    }
  });

  if (Array.isArray(output.repairLog)) {
    output.repairLog.forEach((entry, index) => {
      if (!entry || typeof entry !== "object") {
        errors.push(`repairLog[${index}] must be an object`);
        return;
      }
      for (const key of ["patchId", "field", "before", "after", "evidenceRef", "reasonCode", "confidence"]) {
        if (!(key in entry)) {
          errors.push(`repairLog[${index}].${key} is required`);
        }
      }
    });
  }

  return errors;
}

export function assertValidPiRecipeOutput(output) {
  const errors = validatePiRecipeOutput(output);
  if (errors.length > 0) {
    throw new Error(`Pi recipe output schema validation failed:\n- ${errors.join("\n- ")}`);
  }
  return true;
}

export function assertValidPiRecipeCandidates(output) {
  const errors = validatePiRecipeCandidates(output);
  if (errors.length > 0) {
    throw new Error(`Pi recipe candidates schema validation failed:\n- ${errors.join("\n- ")}`);
  }
  return true;
}
