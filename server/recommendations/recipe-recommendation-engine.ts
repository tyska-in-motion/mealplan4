export type MacroTotals = { calories: number; protein: number; carbs: number; fat: number };
export type PersonDayBalance = { target: MacroTotals; consumed: MacroTotals };
export type RecommendationHistoryEvent = { date: string; eaten: boolean; mealType?: string };
export type RecommendationFeedback = { action: "LIKE" | "DISLIKE" | "TOO_OFTEN" | "HIDE"; rating?: number | null; createdAt: string };
export type RecommendationCandidate = {
  id: number;
  name: string;
  isFavorite?: boolean;
  tags?: string[] | null;
  prepTime?: number | null;
  nutritionA: MacroTotals;
  nutritionB: MacroTotals;
  ingredientIds?: number[];
  history: RecommendationHistoryEvent[];
  feedback?: RecommendationFeedback | null;
};
export type RecommendationScore = { recipeId: number; score: number; reasons: string[]; breakdown: { macro: number; history: number; preferences: number; variety: number; plan: number } };

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const valid = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const dayAge = (date: string, today: string) => {
  const a = Date.parse(date.slice(0, 10) + "T00:00:00Z");
  const b = Date.parse(today.slice(0, 10) + "T00:00:00Z");
  return Number.isFinite(a) && Number.isFinite(b) ? Math.max(0, Math.floor((b - a) / 86400000)) : 60;
};

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
}): RecommendationScore[] {
  const planned = new Set(input.plannedRecipeIds || []);
  const results = input.candidates.map((candidate) => {
    const macro = (macroFit(candidate.nutritionA, input.balances.A) + macroFit(candidate.nutritionB, input.balances.B)) / 2;
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
    const breakdown = { macro, history, preferences, variety, plan };
    let score = input.mealType
      ? history * 0.55 + preferences * 0.20 + variety * 0.20 + plan * 0.05
      : macro * 0.35 + history * 0.25 + preferences * 0.15 + variety * 0.15 + plan * 0.10;
    const reasons: string[] = [];
    if (macro >= 70) reasons.push("Dobrze pasuje do pozostałego bilansu makro");
    if (history >= 65) reasons.push("Pasuje do dotychczasowych wyborów");
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
    return { recipeId: candidate.id, score: Math.round(clamp(score)), reasons, breakdown };
  });
  return results
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, input.limit || 10));
}
