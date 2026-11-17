import { useState } from "react";
import { useRecipeRecommendations, useRecipeRecommendationFeedback } from "@/hooks/use-recommendations";
import { useAddMealEntry } from "@/hooks/use-meal-plan";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ThumbsDown, ThumbsUp, Sparkles } from "lucide-react";

export function RecipeRecommendations({ date }: { date: string }) {
  const { data, isLoading, isError } = useRecipeRecommendations(date);
  const feedback = useRecipeRecommendationFeedback(date);
  const addMeal = useAddMealEntry();
  const [personByRecipe, setPersonByRecipe] = useState<Record<number, "A" | "B">>({});
  const [mealTypeByRecipe, setMealTypeByRecipe] = useState<Record<number, string>>({});
  const recommendations = data?.recommendations || [];

  if (isLoading) return <Card><CardContent className="p-4 text-sm text-muted-foreground">Dobieranie przepisów do bilansu dnia…</CardContent></Card>;
  if (isError) return <Card><CardContent className="p-4 text-sm text-muted-foreground">Nie udało się załadować rekomendacji.</CardContent></Card>;
  if (!recommendations.length) return null;

  return (
    <Card className="mb-4">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base"><Sparkles className="h-4 w-4" /> Propozycje na podstawie bilansu dnia</CardTitle>
        <p className="text-xs text-muted-foreground">Makro uwzględnia już zaplanowane posiłki. Historia wyborów: 60 dni.</p>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {recommendations.map((item) => {
          const recipe = item.recipe;
          const person = personByRecipe[recipe.id] || "A";
          const nutrition = person === "B" ? recipe.nutritionB : recipe.nutritionA;
          return (
            <div key={recipe.id} className="min-w-0 rounded-lg border p-3">
              <div className="flex items-start gap-3">
                {recipe.imageUrl ? <img src={recipe.imageUrl} alt="" className="h-14 w-14 rounded-md object-cover" /> : null}
                <div className="min-w-0 flex-1">
                  <div className="font-medium leading-tight">{recipe.name}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{Math.round(item.score)} pkt{recipe.prepTime ? ` · ${recipe.prepTime} min` : ""}</div>
                </div>
              </div>
              <div className="my-2 text-xs"> {Math.round(nutrition.calories)} kcal · B {Math.round(nutrition.protein)} g · W {Math.round(nutrition.carbs)} g · T {Math.round(nutrition.fat)} g</div>
              <ul className="mb-3 list-inside list-disc text-xs text-muted-foreground">{item.reasons.slice(0, 2).map((reason) => <li key={reason}>{reason}</li>)}</ul>
              <div className="mb-2 flex gap-2">
                <select aria-label="Osoba" value={person} onChange={(event) => setPersonByRecipe((old) => ({ ...old, [recipe.id]: event.target.value as "A" | "B" }))} className="h-8 flex-1 rounded-md border bg-background px-2 text-xs">
                  <option value="A">Osoba A</option><option value="B">Osoba B</option>
                </select>
                <select aria-label="Posiłek" value={mealTypeByRecipe[recipe.id] || "lunch"} onChange={(event) => setMealTypeByRecipe((old) => ({ ...old, [recipe.id]: event.target.value }))} className="h-8 flex-1 rounded-md border bg-background px-2 text-xs">
                  <option value="breakfast">Śniadanie</option><option value="lunch">Obiad</option><option value="dinner">Kolacja</option><option value="snack">Przekąska</option>
                </select>
              </div>
              <Button size="sm" className="w-full" disabled={addMeal.isPending} onClick={() => addMeal.mutate({ date, recipeId: recipe.id, mealType: mealTypeByRecipe[recipe.id] || "lunch", person, servings: person === "A" ? (recipe.defaultServingsA || 1) : (recipe.defaultServingsB || 1.5) })}>Dodaj do planu</Button>
              <div className="mt-2 flex justify-end gap-1">
                <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Lubię ten przepis" disabled={feedback.isPending} onClick={() => feedback.mutate({ recipeId: recipe.id, action: "LIKE" })}><ThumbsUp className="h-3.5 w-3.5" /></Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Nie lubię tego przepisu" disabled={feedback.isPending} onClick={() => feedback.mutate({ recipeId: recipe.id, action: "DISLIKE" })}><ThumbsDown className="h-3.5 w-3.5" /></Button>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={feedback.isPending} onClick={() => feedback.mutate({ recipeId: recipe.id, action: "TOO_OFTEN" })}>Za często</Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
