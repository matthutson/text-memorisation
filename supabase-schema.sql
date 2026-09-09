-- Create folders table
CREATE TABLE folders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000
);

-- Create texts table
CREATE TABLE texts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  artist TEXT DEFAULT '',
  content TEXT NOT NULL,
  youtube_url TEXT DEFAULT '',
  strumming_pattern TEXT DEFAULT '',
  image_data TEXT DEFAULT '',
  music_xml TEXT DEFAULT '',
  folder_id TEXT NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

-- Create indexes for better query performance
CREATE INDEX idx_texts_folder_id ON texts(folder_id);
CREATE INDEX idx_texts_created_at ON texts(created_at DESC);
CREATE INDEX idx_folders_created_at ON folders(created_at DESC);

-- Insert default folder
INSERT INTO folders (id, name, created_at)
VALUES ('default', 'Uncategorized', EXTRACT(EPOCH FROM NOW()) * 1000);

-- Enable Row Level Security
ALTER TABLE folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE texts ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (anyone can read/write)
-- Note: For multi-user support, you would replace these with user-specific policies
CREATE POLICY "Enable all access for folders" ON folders
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Enable all access for texts" ON texts
  FOR ALL USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- Migration: lyric bookmarks (run on existing installations)
--
-- Each bookmark ties a moment in the backing track to a line of the lyrics:
--   [{ "id": "bm-1699...", "time": 12.480, "line": 7, "label": "Country roads" }]
-- Until this column exists the app keeps bookmarks in the browser only.
-- ---------------------------------------------------------------------------
ALTER TABLE texts ADD COLUMN IF NOT EXISTS bookmarks JSONB DEFAULT '[]'::jsonb;

-- ---------------------------------------------------------------------------
-- Migration: tags replace folders
--
-- A song belongs to any number of tags instead of exactly one folder. The old
-- folders table and texts.folder_id are left in place: new texts still write
-- folder_id = 'default' to satisfy the NOT NULL constraint, and nothing reads
-- it any more, so this migration is reversible.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  updated_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000
);

CREATE TABLE IF NOT EXISTS text_tags (
  text_id TEXT NOT NULL REFERENCES texts(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (text_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_text_tags_tag_id ON text_tags(tag_id);

-- Every folder except the catch-all becomes a tag, and each song keeps the
-- folder it was in as its first tag
INSERT INTO tags (id, name, created_at)
SELECT id, name, created_at FROM folders WHERE id <> 'default'
ON CONFLICT (id) DO NOTHING;

INSERT INTO text_tags (text_id, tag_id)
SELECT id, folder_id FROM texts WHERE folder_id IS NOT NULL AND folder_id <> 'default'
ON CONFLICT DO NOTHING;

ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE text_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable all access for tags" ON tags;
CREATE POLICY "Enable all access for tags" ON tags
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Enable all access for text_tags" ON text_tags;
CREATE POLICY "Enable all access for text_tags" ON text_tags
  FOR ALL USING (true) WITH CHECK (true);
