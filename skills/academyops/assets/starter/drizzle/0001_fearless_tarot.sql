ALTER TABLE `invoices` ADD `payment_id` text REFERENCES payments(id);--> statement-breakpoint
CREATE INDEX `idx_invoices_payment` ON `invoices` (`payment_id`);