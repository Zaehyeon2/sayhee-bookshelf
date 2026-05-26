CREATE TABLE `writing_tags` (
	`writing_id` integer NOT NULL,
	`tag_id` integer NOT NULL,
	PRIMARY KEY(`writing_id`, `tag_id`),
	FOREIGN KEY (`writing_id`) REFERENCES `writings`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_writing_tags_tag` ON `writing_tags` (`tag_id`);--> statement-breakpoint
CREATE TABLE `writings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`author_user_id` integer NOT NULL,
	`title` text NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`slug` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`author_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_writings_author_user` ON `writings` (`author_user_id`);--> statement-breakpoint
CREATE INDEX `idx_writings_created_at` ON `writings` (`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_writings_user_slug` ON `writings` (`author_user_id`,`slug`);