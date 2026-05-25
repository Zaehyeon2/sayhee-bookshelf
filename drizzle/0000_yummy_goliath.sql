CREATE TABLE `book_tags` (
	`book_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	PRIMARY KEY(`book_id`, `tag_id`),
	FOREIGN KEY (`book_id`) REFERENCES `books`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_book_tags_tag` ON `book_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `books` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`author` text NOT NULL,
	`genre` text NOT NULL,
	`read_date` text NOT NULL,
	`rating` integer NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`slug` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "rating_range" CHECK("books"."rating" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `books_slug_unique` ON `books` (`slug`);--> statement-breakpoint
CREATE INDEX `idx_books_title` ON `books` (`title`);--> statement-breakpoint
CREATE INDEX `idx_books_author` ON `books` (`author`);--> statement-breakpoint
CREATE INDEX `idx_books_genre` ON `books` (`genre`);--> statement-breakpoint
CREATE INDEX `idx_books_date` ON `books` (`read_date`);--> statement-breakpoint
CREATE TABLE `tags` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_name_unique` ON `tags` (`name`);