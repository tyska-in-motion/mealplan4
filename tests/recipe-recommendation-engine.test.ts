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

test("recommendations allow 5% extra calories and 5g extra per macro", () => {
  const candidate = {
    id: 10, name: "Within tolerance",
    nutritionA: { calories: 1050, protein: 84, carbs: 105, fat: 36.75 },
    nutritionB: { calories: 1050, protein: 84, carbs: 105, fat: 36.75 },
    history: [],
  };
  const results = scoreRecipeRecommendations({
    date: "2026-11-17", balances: { A: balance, B: balance }, candidates: [candidate],
  });
  assert.equal(results.length, 1);
});

test("recommendations reject any nutrient exceeding its exact tolerance", () => {
  const within = {
    id: 11, name: "Within", nutritionA: { calories: 1050, protein: 84, carbs: 105, fat: 36.75 },
    nutritionB: { calories: 1050, protein: 84, carbs: 105, fat: 36.75 }, history: [],
  };
  const overCalories = { ...within, id: 12, nutritionA: { ...within.nutritionA, calories: 1051 } };
  const overProtein = { ...within, id: 13, nutritionA: { ...within.nutritionA, protein: 85.01 } };
  const overCarbs = { ...within, id: 14, nutritionA: { ...within.nutritionA, carbs: 105.01 } };
  const overFat = { ...within, id: 15, nutritionB: { ...within.nutritionB, fat: 40.01 } };
  const results = scoreRecipeRecommendations({
    date: "2026-11-17", balances: { A: balance, B: balance },
    candidates: [within, overCalories, overProtein, overCarbs, overFat],
  });
  assert.deepEqual(results.map((item) => item.recipeId), [11]);
});

test("meal ratings influence only the selected person's recommendations", () => {
  const candidate = { id: 20, name: "Rated", nutritionA: { calories: 350, protein: 40, carbs: 30, fat: 8 }, nutritionB: { calories: 350, protein: 40, carbs: 30, fat: 8 }, history: [], ratingHistoryA: [{ rating: 5, date: "2026-11-16" }], ratingHistoryB: [{ rating: 1, date: "2026-11-16" }] };
  const args = { date: "2026-11-17", balances: { A: balance, B: balance }, candidates: [candidate] };
  const ratedA = scoreRecipeRecommendations({ ...args, targetPerson: "A" })[0];
  const ratedB = scoreRecipeRecommendations({ ...args, targetPerson: "B" })[0];
  assert.ok(ratedA.score > ratedB.score);
  assert.ok(ratedA.score > 0 && ratedB.score > 0);
});

test("a single low meal rating reduces rank but does not hide a recipe", () => {
  const candidate = { id: 21, name: "One low rating", nutritionA: { calories: 350, protein: 40, carbs: 30, fat: 8 }, nutritionB: { calories: 350, protein: 40, carbs: 30, fat: 8 }, history: [] };
  const args = { date: "2026-11-17", balances: { A: balance, B: balance }, candidates: [candidate] };
  const baseline = scoreRecipeRecommendations(args)[0];
  const rated = scoreRecipeRecommendations({ ...args, candidates: [{ ...candidate, ratingHistoryA: [{ rating: 1, date: "2026-11-16" }] }], targetPerson: "A" })[0];
  assert.ok(rated);
  assert.ok(rated.score < baseline.score);
});

test("recent meal ratings carry more weight than older ratings", () => {
  const candidate = { id: 22, name: "Changing feedback", nutritionA: { calories: 350, protein: 40, carbs: 30, fat: 8 }, nutritionB: { calories: 350, protein: 40, carbs: 30, fat: 8 }, history: [] };
  const args = { date: "2026-11-17", balances: { A: balance, B: balance }, targetPerson: "A" as const };
  const recentLow = scoreRecipeRecommendations({ ...args, candidates: [{ ...candidate, ratingHistoryA: [{ rating: 5, date: "2026-09-01" }, { rating: 1, date: "2026-11-16" }] }] })[0];
  const recentHigh = scoreRecipeRecommendations({ ...args, candidates: [{ ...candidate, ratingHistoryA: [{ rating: 1, date: "2026-09-01" }, { rating: 5, date: "2026-11-16" }] }] })[0];
  assert.ok(recentHigh.score > recentLow.score);
});
