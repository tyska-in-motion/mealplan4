import test from "node:test";
import assert from "node:assert/strict";
import { prepareMealEntryIngredientEdits } from "../shared/meal-entry-editing";

test("manual edits become proportional base amounts for the current entry servings", () => {
  const saved = prepareMealEntryIngredientEdits([
    { ingredientId: 1, amount: 150, originalIngredientId: 1, originalDisplayedAmount: 200, originalBaseAmount: 100, originalScalingType: "LINEAR" },
    { ingredientId: 2, amount: 0, originalIngredientId: 2, originalDisplayedAmount: 50, originalBaseAmount: 50, originalScalingType: "LINEAR" },
  ], 1, 2);
  assert.deepEqual(saved, [{ ingredientId: 1, amount: 75, scalingType: "LINEAR" }]);
});

test("unchanged STEP and FORMULA ingredients keep their original scaling metadata", () => {
  const saved = prepareMealEntryIngredientEdits([
    { ingredientId: 3, amount: 70, originalIngredientId: 3, originalDisplayedAmount: 70, originalBaseAmount: 100, originalScalingType: "STEP", originalStepThresholds: [{ minServings: 1, maxServings: 1, amount: 70 }] },
    { ingredientId: 4, amount: 80, originalIngredientId: 4, originalDisplayedAmount: 80, originalBaseAmount: 80, originalScalingType: "FORMULA", originalScalingFormula: "scaleFactor * baseServings" },
  ], 1, 1);
  assert.equal(saved[0].scalingType, "STEP");
  assert.deepEqual(saved[0].stepThresholds, [{ minServings: 1, maxServings: 1, amount: 70 }]);
  assert.equal(saved[1].scalingType, "FORMULA");
  assert.equal(saved[1].scalingFormula, "scaleFactor * baseServings");
});

test("a newly added ingredient uses the editor's entered quantity as its base amount", () => {
  const saved = prepareMealEntryIngredientEdits([
    { ingredientId: 5, amount: 20, isNewIngredient: true, scalingType: "LINEAR" },
  ], 3, 1);
  assert.deepEqual(saved, [{ ingredientId: 5, amount: 20, scalingType: "LINEAR" }]);
});
