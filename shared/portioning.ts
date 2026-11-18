import { calculateScaledAmount } from "./scaling";

export type Person = "A" | "B";
export type PortionsByPerson = Record<Person, number>;
export type AllocationByPerson = Record<Person, number>;

export function getScaledIngredientAmount(ingredient: any, servings: number, recipeServings: number) {
  return calculateScaledAmount(ingredient, servings, recipeServings);
}

/** An override is a final amount, rather than another multiplier. */
export function getFinalIngredientAmount(defaultAmount: number, overrideAmount?: number | null) {
  return Number.isFinite(Number(overrideAmount)) && Number(overrideAmount) >= 0 ? Number(overrideAmount) : defaultAmount;
}

export function isValidBatchAllocation(allocation: AllocationByPerson) {
  return Math.abs((Number(allocation.A) || 0) + (Number(allocation.B) || 0) - 100) < 0.001;
}

export function servingsFromAllocation(totalServings: number, allocation: AllocationByPerson): PortionsByPerson {
  const total = Math.max(0, Number(totalServings) || 0);
  return { A: Math.round(total * (Number(allocation.A) || 0)) / 100, B: Math.round(total * (Number(allocation.B) || 0)) / 100 };
}

/**
 * Converts cooked-batch ingredient totals into the final, fixed quantity for
 * each person's allocated servings. The batch total is deliberately used as
 * the divisor, rather than the number of currently displayed participants:
 * a batch can also contain portions allocated for another day.
 */
export function splitBatchIngredientAmounts<T extends { servings?: number | null }>(
  ingredients: Array<{ ingredientId: number; amount: number }>,
  participants: T[],
  batchServings: number,
) {
  const totalServings = Number(batchServings);
  if (!Number.isFinite(totalServings) || totalServings <= 0) {
    return participants.map(() => []);
  }

  return participants.map((participant) => ingredients.map((ingredient) => ({
    ingredientId: Number(ingredient.ingredientId),
    amount: Math.round((Number(ingredient.amount) || 0) * (Number(participant.servings) || 0) / totalServings),
    scalingType: "FIXED" as const,
  })));
}


/**
 * Batch allocations store each person's recipe ingredients as final FIXED amounts.
 * When that allocation changes size, scale those fixed snapshots by the recipe's
 * configured scaling ratio. Keep per-meal additions fixed, and leave LINEAR/STEP/
 * FORMULA overrides alone because the normal serving calculation handles them.
 */
export function rescaleFixedBatchAllocationIngredients(
  mealIngredients: Array<{ ingredientId: number; amount: number; scalingType?: "LINEAR" | "FIXED" | "STEP" | "FORMULA" | null }>,
  recipeIngredients: Array<{ ingredientId: number; amount?: number; baseAmount?: number; scalingType?: "LINEAR" | "FIXED" | "STEP" | "FORMULA" | null; scalingFormula?: string | null; stepThresholds?: Array<{ minServings: number; maxServings?: number | null; amount: number }> | null }>,
  previousServings: number,
  nextServings: number,
  recipeServings: number,
) {
  const previous = Number(previousServings) > 0 ? Number(previousServings) : 1;
  const next = Number(nextServings) > 0 ? Number(nextServings) : previous;
  const baseServings = Number(recipeServings) > 0 ? Number(recipeServings) : 1;
  const sourceCounts = new Map<number, number>();
  for (const source of recipeIngredients || []) {
    const id = Number(source.ingredientId);
    sourceCounts.set(id, (sourceCounts.get(id) || 0) + 1);
  }
  const occurrences = new Map<number, number>();

  return (mealIngredients || []).map((ingredient) => {
    const id = Number(ingredient.ingredientId);
    const occurrence = (occurrences.get(id) || 0) + 1;
    occurrences.set(id, occurrence);
    if (occurrence > (sourceCounts.get(id) || 0) || (ingredient.scalingType || "FIXED") !== "FIXED") {
      return { ingredientId: id, amount: Number(ingredient.amount) || 0, scalingType: ingredient.scalingType || "FIXED" };
    }

    const source = recipeIngredients.filter((row) => Number(row.ingredientId) === id)[occurrence - 1];
    if (!source || (source.scalingType || "LINEAR") === "FIXED") {
      return { ingredientId: id, amount: Number(ingredient.amount) || 0, scalingType: "FIXED" as const };
    }

    const sourceForScaling = { ...source, baseAmount: Number(source.baseAmount ?? source.amount) || 0 };
    const oldExpected = calculateScaledAmount(sourceForScaling, previous, baseServings);
    const newExpected = calculateScaledAmount(sourceForScaling, next, baseServings);
    const ratio = oldExpected > 0 ? newExpected / oldExpected : next / previous;
    return {
      ingredientId: id,
      amount: (Number(ingredient.amount) || 0) * (Number.isFinite(ratio) && ratio >= 0 ? ratio : next / previous),
      scalingType: "FIXED" as const,
    };
  });
}

/** Keeps meal-specific additions out of a shared-batch ingredient update. */
export function getAdditionalMealIngredients(
  mealIngredients: Array<{ ingredientId: number; amount: number; scalingType?: "LINEAR" | "FIXED" | "STEP" | "FORMULA" }>,
  recipeIngredients: Array<{ ingredientId: number }>,
) {
  const recipeOccurrences = new Map<number, number>();
  recipeIngredients.forEach((ingredient) => {
    const id = Number(ingredient.ingredientId);
    recipeOccurrences.set(id, (recipeOccurrences.get(id) || 0) + 1);
  });

  const mealOccurrences = new Map<number, number>();
  return mealIngredients
    .filter((ingredient) => {
      const id = Number(ingredient.ingredientId);
      const occurrence = (mealOccurrences.get(id) || 0) + 1;
      mealOccurrences.set(id, occurrence);
      return occurrence > (recipeOccurrences.get(id) || 0);
    })
    .map((ingredient) => ({
      ingredientId: Number(ingredient.ingredientId),
      amount: Number(ingredient.amount) || 0,
      scalingType: ingredient.scalingType || "FIXED",
    }));
}

/**
 * Restores recipe ingredients for a meal without discarding ingredients added
 * specifically to that meal. This also supports duplicate recipe ingredients:
 * only occurrences beyond the recipe's own occurrences are additions.
 */
export function restoreRecipeIngredientsPreservingAdditions(
  mealIngredients: Array<{ ingredientId: number; amount: number; scalingType?: "LINEAR" | "FIXED" | "STEP" | "FORMULA" }>,
  recipeIngredients: Array<{ ingredientId: number; amount?: number; baseAmount?: number; scalingType?: "LINEAR" | "FIXED" | "STEP" | "FORMULA" }>,
) {
  const restoredRecipeIngredients = recipeIngredients.map((ingredient) => ({
    ingredientId: Number(ingredient.ingredientId),
    amount: Math.round(Number(ingredient.baseAmount ?? ingredient.amount) || 0),
    scalingType: ingredient.scalingType || "LINEAR",
  }));

  return [
    ...restoredRecipeIngredients,
    ...getAdditionalMealIngredients(mealIngredients, recipeIngredients),
  ];
}
