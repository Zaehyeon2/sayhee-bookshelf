CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`display_name` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`must_change_password` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_users_username` ON `users` (`username`);--> statement-breakpoint
DROP INDEX `books_slug_unique`;--> statement-breakpoint
ALTER TABLE `books` ADD `author_user_id` integer REFERENCES users(id);--> statement-breakpoint
CREATE INDEX `idx_books_author_user` ON `books` (`author_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_books_user_slug` ON `books` (`author_user_id`,`slug`);