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
