-- ============================================================
-- FIX: notifications table was created manually without a
-- title column. All app code and triggers reference it.
-- ============================================================
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS title TEXT DEFAULT 'System Notification';

-- Update existing rows that have no title
UPDATE public.notifications SET title = 'System Notification' WHERE title IS NULL;
