CREATE TABLE `movie_tags` (
	`movie_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	PRIMARY KEY(`movie_id`, `tag_id`),
	FOREIGN KEY (`movie_id`) REFERENCES `movies`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_movie_tags_tag` ON `movie_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `movies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`author_user_id` integer NOT NULL,
	`title` text NOT NULL,
	`director` text NOT NULL,
	`genre` text NOT NULL,
	`watched_date` text NOT NULL,
	`rating` integer NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`one_line_review` text,
	`is_public` integer DEFAULT 1 NOT NULL,
	`published_at` integer,
	`slug` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`author_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "movies_rating_range" CHECK("movies"."rating" BETWEEN 1 AND 10)
);
--> statement-breakpoint
CREATE INDEX `idx_movies_author_user` ON `movies` (`author_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_movies_user_slug` ON `movies` (`author_user_id`,`slug`);--> statement-breakpoint
CREATE INDEX `idx_movies_user_date` ON `movies` (`author_user_id`,"watched_date" DESC);--> statement-breakpoint
CREATE INDEX `idx_movies_user_genre` ON `movies` (`author_user_id`,`genre`);--> statement-breakpoint
CREATE INDEX `idx_movies_user_rating` ON `movies` (`author_user_id`,"rating" DESC);--> statement-breakpoint
CREATE INDEX `idx_movies_public_published` ON `movies` (`is_public`,"published_at" DESC);