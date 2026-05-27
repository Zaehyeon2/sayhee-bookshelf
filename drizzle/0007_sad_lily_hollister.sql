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
	`one_line_review` text,
	`is_public` integer DEFAULT 1 NOT NULL,
	`published_at` integer,
	`slug` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`author_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "rating_range" CHECK("__new_books"."rating" BETWEEN 1 AND 10)
);
--> statement-breakpoint
INSERT INTO `__new_books`("id", "author_user_id", "title", "author", "genre", "read_date", "rating", "content", "one_line_review", "is_public", "published_at", "slug", "created_at", "updated_at") SELECT "id", "author_user_id", "title", "author", "genre", "read_date", "rating", "content", "one_line_review", "is_public", "published_at", "slug", "created_at", "updated_at" FROM `books`;--> statement-breakpoint
DROP TABLE `books`;--> statement-breakpoint
ALTER TABLE `__new_books` RENAME TO `books`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
-- Backfill: 기존 1-5 별점 스케일을 1-10 반쪽별 스케일로 doubling
-- (마이그레이션 직전 행들은 모두 옛 CHECK 1-5를 통과한 값). 멱등 — 이미
-- 1-10 스케일인 행이 있으면 영향 없음. 옛 스케일 5 → 새 스케일 10 = 별 5개.
UPDATE `books` SET `rating` = `rating` * 2 WHERE `rating` <= 5;--> statement-breakpoint
CREATE INDEX `idx_books_author_user` ON `books` (`author_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_books_user_slug` ON `books` (`author_user_id`,`slug`);--> statement-breakpoint
CREATE INDEX `idx_books_user_date` ON `books` (`author_user_id`,`read_date` DESC);--> statement-breakpoint
CREATE INDEX `idx_books_user_genre` ON `books` (`author_user_id`,`genre`);--> statement-breakpoint
CREATE INDEX `idx_books_user_rating` ON `books` (`author_user_id`,`rating` DESC);--> statement-breakpoint
CREATE INDEX `idx_books_public_published` ON `books` (`is_public`,`published_at` DESC);