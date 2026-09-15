-- Which controls actually get used.
--
-- The app keeps its own tally in the browser and works perfectly well without
-- this table; making it just means the counts survive a cleared browser and
-- can be read across a phone and a laptop together.

CREATE TABLE IF NOT EXISTS usage_events (
  id BIGSERIAL PRIMARY KEY,
  action TEXT NOT NULL,
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Reading the tally means grouping by action, so that is what gets the index
CREATE INDEX IF NOT EXISTS usage_events_action_idx ON usage_events (action, created_at DESC);

ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;

-- The app writes with the anon key and never reads these back, so inserting is
-- the only thing it is allowed to do
DROP POLICY IF EXISTS "anon can record usage" ON usage_events;
CREATE POLICY "anon can record usage" ON usage_events
  FOR INSERT TO anon WITH CHECK (true);

-- What the counts look like:
--   SELECT action, COUNT(*) AS uses, MAX(created_at) AS last_used
--   FROM usage_events GROUP BY action ORDER BY uses DESC;
