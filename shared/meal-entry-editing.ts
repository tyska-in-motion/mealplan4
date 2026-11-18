export type EditableMealIngredient = {
  ingredientId: number;
  amount: number;
  originalIngredientId?: number;
  originalDisplayedAmount?: number;
  originalBaseAmount?: number;
  originalScalingType?: "LINEAR" | "FIXED" | "STEP" | "FORMULA" | null;
  originalScalingFormula?: string | null;
  originalStepThresholds?: Array<{ minServings: number; maxServings?: number | null; amount: number }> | null;
};

export type SavedMealIngredient = {
  ingredientId: number;
  amount: number;
  scalingType: "LINEAR" | "FIXED" | "STEP" | "FORMULA";
  scalingFormula?: string | null;
  stepThresholds?: Array<{ minServings: number; maxServings?: number | null; amount: number }> | null;
};

/**
 * The editor displays quantities for the current entry servings. Keep untouched
 * ingredients in their original recipe scale. A manually changed (or newly
 * added) quantity becomes a LINEAR base amount so future serving changes remain
 * proportional to the value the user entered.
 */
export function prepareMealEntryIngredientEdits(
  ingredients: EditableMealIngredient[],
  recipeServings: number,
  entryServings: number,
): SavedMealIngredient[] {
  const safeRecipeServings = Number(recipeServings) > 0 ? Number(recipeServings) : 1;
  const safeEntryServings = Number(entryServings) > 0 ? Number(entryServings) : 1;

  return ingredients
    .filter((ingredient) => Number(ingredient.ingredientId) > 0)
    .map((ingredient) => {
      const ingredientId = Number(ingredient.ingredientId);
      const amount = Number(ingredient.amount) || 0;
      const isUnchangedOriginal = Number(ingredient.originalIngredientId) === ingredientId
        && Number.isFinite(Number(ingredient.originalDisplayedAmount))
        && amount === Number(ingredient.originalDisplayedAmount);

      if (isUnchangedOriginal) {
        return {
          ingredientId,
          amount: Number(ingredient.originalBaseAmount) || 0,
          scalingType: ingredient.originalScalingType || "LINEAR",
          scalingFormula: ingredient.originalScalingFormula,
          stepThresholds: ingredient.originalStepThresholds,
        };
      }

      return {
        ingredientId,
        amount: amount * safeRecipeServings / safeEntryServings,
        scalingType: "LINEAR" as const,
      };
    });
}
