CREATE TABLE `game_tags` (
	`game_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	PRIMARY KEY(`game_id`, `tag_id`),
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_game_tags_tag` ON `game_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `games` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`author_user_id` integer NOT NULL,
	`title` text NOT NULL,
	`developer` text NOT NULL,
	`genre` text NOT NULL,
	`played_date` text NOT NULL,
	`rating` integer NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`one_line_review` text,
	`is_public` integer DEFAULT 1 NOT NULL,
	`published_at` integer,
	`slug` text NOT NULL,
	`rawg_id` integer,
	`cover_url` text,
	`external_source` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`author_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "games_rating_range" CHECK("games"."rating" BETWEEN 1 AND 10)
);
--> statement-breakpoint
CREATE INDEX `idx_games_author_user` ON `games` (`author_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_games_user_slug` ON `games` (`author_user_id`,`slug`);--> statement-breakpoint
CREATE INDEX `idx_games_user_date` ON `games` (`author_user_id`,"played_date" DESC);--> statement-breakpoint
CREATE INDEX `idx_games_user_genre` ON `games` (`author_user_id`,`genre`);--> statement-breakpoint
CREATE INDEX `idx_games_user_rating` ON `games` (`author_user_id`,"rating" DESC);--> statement-breakpoint
CREATE INDEX `idx_games_public_published` ON `games` (`is_public`,"published_at" DESC);--> statement-breakpoint
CREATE INDEX `idx_games_rawg` ON `games` (`rawg_id`);--> statement-breakpoint
CREATE INDEX `idx_games_public_rawg` ON `games` (`is_public`,`rawg_id`);