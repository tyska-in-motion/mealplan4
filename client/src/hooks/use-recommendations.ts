import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { fetchWithTimeout } from "@/lib/queryClient";

export type RecipeRecommendation = {
  recipeId: number;
  score: number;
  reasons: string[];
  breakdown: Record<string, number>;
  recipe: {
    id: number;
    name: string;
    imageUrl?: string | null;
    prepTime?: number | null;
    defaultServingsA?: number;
    defaultServingsB?: number;
    tags?: string[] | null;
    nutritionA: { calories: number; protein: number; carbs: number; fat: number };
    nutritionB: { calories: number; protein: number; carbs: number; fat: number };
  };
};

export function useRecipeRecommendations(date: string, mealType?: string | null, enabled = true, targetPerson: "A" | "B" | "both" = "both") {
  return useQuery({
    queryKey: [api.recommendations.list.path, date, mealType || "all", targetPerson],
    enabled,
    queryFn: async () => {
      const url = buildUrl(api.recommendations.list.path, { date, limit: 40, targetPerson, ...(mealType ? { mealType } : {}) });
      const response = await fetchWithTimeout(url);
      if (!response.ok) throw new Error("Nie udało się pobrać rekomendacji");
      return response.json() as Promise<{ date: string; macroEligibleRecipeIds: number[]; rarelyEatenRecipeIds: number[]; recommendations: RecipeRecommendation[] }>;
    },
    staleTime: 60_000,
  });
}

export function useRecipeRecommendationFeedback(date: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { recipeId: number; action: "LIKE" | "DISLIKE" | "TOO_OFTEN" | "HIDE" | "CLEAR" }) => {
      const response = await fetchWithTimeout(api.recommendations.feedback.path, {
        method: api.recommendations.feedback.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || "Nie udało się zapisać oceny");
      }
      return response.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [api.recommendations.list.path, date] }),
  });
}
