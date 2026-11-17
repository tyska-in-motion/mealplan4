CREATE TABLE IF NOT EXISTS recipe_recommendation_feedback (
  id serial PRIMARY KEY,
  recipe_id integer NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('LIKE', 'DISLIKE', 'TOO_OFTEN', 'HIDE')),
  rating integer CHECK (rating BETWEEN 1 AND 5),
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recipe_recommendation_feedback_recipe_created_idx
  ON recipe_recommendation_feedback (recipe_id, created_at DESC);
