DROP INDEX `idx_books_title`;--> statement-breakpoint
DROP INDEX `idx_books_author`;--> statement-breakpoint
DROP INDEX `idx_books_genre`;--> statement-breakpoint
DROP INDEX `idx_books_date`;--> statement-breakpoint
CREATE INDEX `idx_books_user_date` ON `books` (`author_user_id`,"read_date" DESC);--> statement-breakpoint
CREATE INDEX `idx_books_user_genre` ON `books` (`author_user_id`,`genre`);--> statement-breakpoint
CREATE INDEX `idx_books_user_rating` ON `books` (`author_user_id`,"rating" DESC);--> statement-breakpoint
DROP INDEX `idx_writings_created_at`;--> statement-breakpoint
CREATE INDEX `idx_writings_user_created` ON `writings` (`author_user_id`,"created_at" DESC);