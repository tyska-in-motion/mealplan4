import test from "node:test";
import assert from "node:assert/strict";
import { scoreRecipeRecommendations } from "../server/recommendations/recipe-recommendation-engine";

const balance = { target: { calories: 2000, protein: 150, carbs: 200, fat: 65 }, consumed: { calories: 1000, protein: 70, carbs: 100, fat: 30 } };

test("recommendations are ranked and capped to requested limit", () => {
  const results = scoreRecipeRecommendations({
    date: "2026-11-17", limit: 1, balances: { A: balance, B: balance },
    candidates: [
      { id: 1, name: "A", nutritionA: { calories: 350, protein: 40, carbs: 30, fat: 8 }, nutritionB: { calories: 350, protein: 40, carbs: 30, fat: 8 }, history: [] },
      { id: 2, name: "B", nutritionA: { calories: 800, protein: 5, carbs: 100, fat: 60 }, nutritionB: { calories: 800, protein: 5, carbs: 100, fat: 60 }, history: [] },
    ],
  });
  assert.equal(results.length, 1);
  assert.equal(results[0].recipeId, 1);
});

test("DISLIKE applies a strong penalty without excluding the recipe", () => {
  const candidate = { id: 1, name: "A", nutritionA: { calories: 350, protein: 40, carbs: 30, fat: 8 }, nutritionB: { calories: 350, protein: 40, carbs: 30, fat: 8 }, history: [] };
  const args = { date: "2026-11-17", balances: { A: balance, B: balance }, candidates: [candidate] };
  const baseline = scoreRecipeRecommendations(args)[0];
  const disliked = scoreRecipeRecommendations({ ...args, candidates: [{ ...candidate, feedback: { action: "DISLIKE" as const, createdAt: "2026-11-17" } }] })[0];
  assert.ok(disliked);
  assert.ok(disliked.score < baseline.score);
});

test("recipes eaten in the last week receive a variety penalty", () => {
  const candidate = { id: 1, name: "A", nutritionA: { calories: 350, protein: 40, carbs: 30, fat: 8 }, nutritionB: { calories: 350, protein: 40, carbs: 30, fat: 8 }, history: [] };
  const args = { date: "2026-11-17", balances: { A: balance, B: balance }, candidates: [candidate] };
  const baseline = scoreRecipeRecommendations(args)[0];
  const repeated = scoreRecipeRecommendations({ ...args, candidates: [{ ...candidate, history: [{ date: "2026-11-15", eaten: true }] }] })[0];
  assert.ok(repeated.score < baseline.score);
});
