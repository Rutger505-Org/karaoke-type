CREATE TABLE `admin_email` (
	`email` text PRIMARY KEY NOT NULL,
	`added_by` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `song_request` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`artist` text NOT NULL,
	`link` text,
	`note` text,
	`user_id` text,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `song_request_status_created_at_idx` ON `song_request` (`status`,`created_at`);
--> statement-breakpoint
INSERT INTO `admin_email` (`email`) VALUES ('rutger.pronk11@gmail.com');
