CREATE TABLE `hosted_request_budgets` (
	`scope` text NOT NULL,
	`bucket` text NOT NULL,
	`used` integer NOT NULL,
	PRIMARY KEY(`scope`, `bucket`)
);
