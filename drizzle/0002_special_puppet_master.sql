PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_books` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`author_user_id` integer NOT NULL,
	`title` text NOT NULL,
	`author` text NOT NULL,
	`genre` text NOT NULL,
	`read_date` text NOT NULL,
	`rating` integer NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`slug` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`author_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "rating_range" CHECK("__new_books"."rating" BETWEEN 1 AND 5)
);
--> statement-breakpoint
INSERT INTO `__new_books`("id", "author_user_id", "title", "author", "genre", "read_date", "rating", "content", "slug", "created_at", "updated_at") SELECT "id", "author_user_id", "title", "author", "genre", "read_date", "rating", "content", "slug", "created_at", "updated_at" FROM `books`;--> statement-breakpoint
DROP TABLE `books`;--> statement-breakpoint
ALTER TABLE `__new_books` RENAME TO `books`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_books_title` ON `books` (`title`);--> statement-breakpoint
CREATE INDEX `idx_books_author` ON `books` (`author`);--> statement-breakpoint
CREATE INDEX `idx_books_genre` ON `books` (`genre`);--> statement-breakpoint
CREATE INDEX `idx_books_date` ON `books` (`read_date`);--> statement-breakpoint
CREATE INDEX `idx_books_author_user` ON `books` (`author_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_books_user_slug` ON `books` (`author_user_id`,`slug`);