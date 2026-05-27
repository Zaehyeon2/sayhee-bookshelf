ALTER TABLE `books` ADD `one_line_review` text;--> statement-breakpoint
ALTER TABLE `books` ADD `is_public` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `books` ADD `published_at` integer;--> statement-breakpoint
UPDATE `books` SET `published_at` = `updated_at` WHERE `published_at` IS NULL;--> statement-breakpoint
CREATE INDEX `idx_books_public_published` ON `books` (`is_public`,"published_at" DESC);