-- Migration: Add missing columns to texts table
-- Run this against your existing Supabase database if you already have data.

ALTER TABLE texts
  ADD COLUMN IF NOT EXISTS stems JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS ultimate_guitar_url TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS soundslice_url TEXT DEFAULT '';
