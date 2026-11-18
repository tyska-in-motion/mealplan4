export type MacroTotals = { calories: number; protein: number; carbs: number; fat: number };
export type PersonDayBalance = { target: MacroTotals; consumed: MacroTotals };
export type RecommendationHistoryEvent = { date: string; eaten: boolean; mealType?: string };
export type RecommendationFeedback = { action: "LIKE" | "DISLIKE" | "TOO_OFTEN" | "HIDE"; rating?: number | null; createdAt: string };
export type MealRatingEvent = { rating: number; date: string };
export type RecommendationCandidate = {
  id: number;
  name: string;
  isFavorite?: boolean;
  tags?: string[] | null;
  prepTime?: number | null;
  nutritionA: MacroTotals;
  nutritionB: MacroTotals;
  produceGramsA?: number;
  produceGramsB?: number;
  ratingHistoryA?: MealRatingEvent[];
  ratingHistoryB?: MealRatingEvent[];
  ingredientIds?: number[];
  history: RecommendationHistoryEvent[];
  feedback?: RecommendationFeedback | null;
};
export type RecommendationScore = { recipeId: number; score: number; reasons: string[]; breakdown: { macro: number; history: number; preferences: number; variety: number; plan: number; produce: number; rating: number; calorieCoverage: number } };

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const valid = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const dayAge = (date: string, today: string) => {
  const a = Date.parse(date.slice(0, 10) + "T00:00:00Z");
  const b = Date.parse(today.slice(0, 10) + "T00:00:00Z");
  return Number.isFinite(a) && Number.isFinite(b) ? Math.max(0, Math.floor((b - a) / 86400000)) : 60;
};

export function isWithinMacroTolerance(candidate: MacroTotals, balance: PersonDayBalance): boolean {
  const remaining = (key: keyof MacroTotals) =>
    Math.max(0, valid(balance.target[key]) - valid(balance.consumed[key]));
  const amount = (key: keyof MacroTotals) => Math.max(0, valid(candidate[key]));

  // Calories may exceed the remaining daily budget by at most 5%.
  if (amount("calories") > remaining("calories") * 1.05 + 1e-6) return false;

  // Protein, carbohydrates and fat each have a fixed allowance of 5 grams.
  return (["protein", "carbs", "fat"] as const).every(
    (key) => amount(key) <= remaining(key) + 5 + 1e-6,
  );
}

export function isRecommendationMacroEligible(
  candidate: Pick<RecommendationCandidate, "nutritionA" | "nutritionB">,
  balances: { A: PersonDayBalance; B: PersonDayBalance },
  targetPerson: "A" | "B" | "both" = "both",
): boolean {
  const fitsA = isWithinMacroTolerance(candidate.nutritionA, balances.A);
  const fitsB = isWithinMacroTolerance(candidate.nutritionB, balances.B);
  if (targetPerson === "A") return fitsA;
  if (targetPerson === "B") return fitsB;
  return fitsA && fitsB;
}

function macroFit(candidate: MacroTotals, balance: PersonDayBalance): number {
  const weights: Array<[keyof MacroTotals, number]> = [
    ["calories", 0.4], ["protein", 0.3], ["carbs", 0.15], ["fat", 0.15],
  ];
  return weights.reduce((sum, [key, weight]) => {
    const target = Math.max(1, valid(balance.target[key]));
    const remaining = Math.max(0, valid(balance.target[key]) - valid(balance.consumed[key]));
    const amount = Math.max(0, valid(candidate[key]));
    // If the daily target is already met, a further contribution is penalized.
    const distance = remaining > 0 ? Math.abs(amount - remaining * 0.35) : amount;
    const tolerance = Math.max(target * 0.22, remaining * 0.45, 1);
    return sum + clamp(100 * (1 - distance / tolerance)) * weight;
  }, 0);
}

export function scoreRecipeRecommendations(input: {
  candidates: RecommendationCandidate[];
  balances: { A: PersonDayBalance; B: PersonDayBalance };
  date: string;
  plannedRecipeIds?: number[];
  ingredientAffinity?: Record<number, number>;
  limit?: number;
  mealType?: string;
  targetPerson?: "A" | "B" | "both";
}): RecommendationScore[] {
  const planned = new Set(input.plannedRecipeIds || []);
  const targetPerson = input.targetPerson || "both";
  const eligibleCandidates = input.candidates.filter((candidate) => isRecommendationMacroEligible(candidate, input.balances, targetPerson));
  const results = eligibleCandidates.map((candidate) => {
    const fitsA = isWithinMacroTolerance(candidate.nutritionA, input.balances.A);
    const fitsB = isWithinMacroTolerance(candidate.nutritionB, input.balances.B);
    const bothFit = fitsA && fitsB;
    const macro = targetPerson === "A"
      ? macroFit(candidate.nutritionA, input.balances.A)
      : targetPerson === "B"
        ? macroFit(candidate.nutritionB, input.balances.B)
        : (macroFit(candidate.nutritionA, input.balances.A) + macroFit(candidate.nutritionB, input.balances.B)) / 2;
    // Prefer more substantial meals so the daily calorie target can be covered
    // with fewer planned meals. This is a ranking bonus only; macro eligibility
    // above remains the hard limit for each person.
    const calorieCoverageFor = (nutrition: MacroTotals, balance: PersonDayBalance) => {
      const remaining = Math.max(0, valid(balance.target.calories) - valid(balance.consumed.calories));
      if (remaining <= 0) return 0;
      return clamp((Math.max(0, valid(nutrition.calories)) / remaining) * 100);
    };
    const calorieCoverage = targetPerson === "A"
      ? calorieCoverageFor(candidate.nutritionA, input.balances.A)
      : targetPerson === "B"
        ? calorieCoverageFor(candidate.nutritionB, input.balances.B)
        : (calorieCoverageFor(candidate.nutritionA, input.balances.A) + calorieCoverageFor(candidate.nutritionB, input.balances.B)) / 2;
    const events = candidate.history.filter((event) => dayAge(event.date, input.date) <= 60 && (!input.mealType || event.mealType === input.mealType));
    const historyStrength = events.reduce((sum, event) => {
      const age = dayAge(event.date, input.date);
      return sum + (event.eaten ? 1 : 0.2) * Math.exp(-age / 30);
    }, 0);
    const history = clamp(25 + Math.log1p(historyStrength) * 38 + (candidate.isFavorite ? 15 : 0));
    const ingredientIds = candidate.ingredientIds || [];
    const affinities = ingredientIds.map((id) => clamp(valid(input.ingredientAffinity?.[id]), -100, 100));
    const preferences = clamp(50 + (affinities.length ? affinities.reduce((a, b) => a + b, 0) / affinities.length : 0) * 0.5);
    const recentEaten = events.some((event) => event.eaten && dayAge(event.date, input.date) <= 7);
    const recentPlanned = events.some((event) => !event.eaten && dayAge(event.date, input.date) <= 3);
    const variety = recentEaten ? 15 : recentPlanned ? 45 : 85;
    const plan = planned.has(candidate.id) ? 0 : 85;
    const produceGrams = targetPerson === "A"
      ? valid(candidate.produceGramsA)
      : targetPerson === "B"
        ? valid(candidate.produceGramsB)
        : Math.max(valid(candidate.produceGramsA), valid(candidate.produceGramsB));
    const produce = produceGrams >= 100 ? 100 : 0;
    const ratingEvents = targetPerson === "A"
      ? candidate.ratingHistoryA || []
      : targetPerson === "B"
        ? candidate.ratingHistoryB || []
        : [...(candidate.ratingHistoryA || []), ...(candidate.ratingHistoryB || [])];
    const weightedRatings = ratingEvents
      .filter((event) => Number.isFinite(Number(event.rating)) && Number(event.rating) >= 1 && Number(event.rating) <= 5)
      .map((event) => ({ rating: Number(event.rating), weight: Math.exp(-dayAge(event.date, input.date) / 45) }));
    const ratingWeight = weightedRatings.reduce((sum, event) => sum + event.weight, 0);
    const ratingAverage = ratingWeight > 0
      ? weightedRatings.reduce((sum, event) => sum + event.rating * event.weight, 0) / ratingWeight
      : 3;
    // A small confidence ramp prevents one isolated rating from dominating the rank.
    const rating = ratingWeight > 0
      ? Math.round((ratingAverage - 3) * 6 * Math.min(1, ratingWeight / 3))
      : 0;
    const breakdown = { macro, history, preferences, variety, plan, produce, rating, calorieCoverage };
    let score = input.mealType
      ? history * 0.55 + preferences * 0.20 + variety * 0.20 + plan * 0.05
      : macro * 0.35 + history * 0.25 + preferences * 0.15 + variety * 0.15 + plan * 0.10;
    if (produce > 0) score += 12;
    score += rating;
    score += calorieCoverage * 0.25;
    const reasons: string[] = [];
    if (macro >= 70) reasons.push("Dobrze pasuje do pozostałego bilansu makro");
    if (targetPerson !== "both" && bothFit) reasons.push("Pasuje do bilansu obu osób");
    if (history >= 65) reasons.push("Pasuje do dotychczasowych wyborów");
    if (produce > 0) reasons.push("Co najmniej 100 g warzyw lub owoców w porcji");
    if (calorieCoverage >= 50) reasons.push("Pokrywa dużą część pozostałego zapotrzebowania kalorycznego");
    if (rating >= 5) reasons.push("Wysokie oceny z poprzednich posiłków");
    else if (rating <= -5) reasons.push("Niższe oceny z poprzednich posiłków");
    if (candidate.isFavorite) reasons.push("Przepis oznaczony jako ulubiony");
    if (recentEaten) reasons.push("Ostatnio jedzony – ograniczono jego pozycję");
    if (!recentEaten && !recentPlanned) reasons.push("Daje większą różnorodność");
    if (candidate.feedback?.action === "LIKE") score += 18;
    if (candidate.feedback?.rating) score += (valid(candidate.feedback.rating) - 3) * 3;
    if (candidate.feedback?.action === "DISLIKE") {
      score -= 35;
      reasons.push("Obniżona pozycja po wcześniejszej negatywnej ocenie");
    }
    if (candidate.feedback?.action === "TOO_OFTEN") score -= 18;
    if (candidate.feedback?.action === "HIDE") score = 0;
    if (planned.has(candidate.id)) { reasons.push("Przepis jest już w planie"); score = 0; }
    return { recipeId: candidate.id, score: Math.round(clamp(score)), reasons, breakdown, priority: targetPerson !== "both" && bothFit ? 1 : 0 };
  });
  return results
    .filter((item) => item.score > 0)
    .sort((a, b) => b.priority - a.priority || b.score - a.score)
    .slice(0, Math.max(1, input.limit || 40))
    .map(({ priority: _priority, ...item }) => item);
}
