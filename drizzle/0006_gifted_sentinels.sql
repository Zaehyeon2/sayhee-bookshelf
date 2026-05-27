ALTER TABLE `books` ADD `one_line_review` text;--> statement-breakpoint
-- All existing books become public on this migration (is_public DEFAULT 1
-- by design per spec docs/superpowers/specs/2026-05-27-public-feed-design.md
-- §1 "마이그레이션 사건"). Pre-deployment user notification recommended.
ALTER TABLE `books` ADD `is_public` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `books` ADD `published_at` integer;--> statement-breakpoint
-- Backfill published_at from updated_at (not created_at) so books edited
-- more recently surface higher in the public feed. For never-edited books
-- updated_at == created_at, so legacy ordering is preserved.
UPDATE `books` SET `published_at` = `updated_at` WHERE `published_at` IS NULL;--> statement-breakpoint
CREATE INDEX `idx_books_public_published` ON `books` (`is_public`,"published_at" DESC);
