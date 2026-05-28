ALTER TABLE `books` ADD `isbn` text;--> statement-breakpoint
ALTER TABLE `books` ADD `cover_url` text;--> statement-breakpoint
ALTER TABLE `books` ADD `external_source` text;--> statement-breakpoint
CREATE INDEX `idx_books_isbn` ON `books` (`isbn`);--> statement-breakpoint
CREATE INDEX `idx_books_public_isbn` ON `books` (`is_public`,`isbn`);--> statement-breakpoint
ALTER TABLE `movies` ADD `tmdb_id` integer;--> statement-breakpoint
ALTER TABLE `movies` ADD `cover_url` text;--> statement-breakpoint
ALTER TABLE `movies` ADD `external_source` text;--> statement-breakpoint
CREATE INDEX `idx_movies_tmdb` ON `movies` (`tmdb_id`);--> statement-breakpoint
CREATE INDEX `idx_movies_public_tmdb` ON `movies` (`is_public`,`tmdb_id`);