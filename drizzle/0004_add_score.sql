CREATE TABLE `score` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`song_slug` text NOT NULL,
	`score` integer NOT NULL,
	`accuracy` real NOT NULL,
	`wpm` real NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `score_song_slug_score_idx` ON `score` (`song_slug`,`score`);--> statement-breakpoint
CREATE INDEX `score_user_id_idx` ON `score` (`user_id`);