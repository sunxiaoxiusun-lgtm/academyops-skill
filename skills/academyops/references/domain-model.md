# Business rules and extension points

## Students, enrollments, and sources

A student has one stable identity and may have many enrollments and class memberships. Use name, guardian contact, date of birth and optional teaching-platform account to flag possible duplicates; a matching name alone must not silently merge two children. Store guardian messaging name, grade, initial registration date, responsible employee, and follow-up history.

Internal course consultants are employees paid outside channel commission calculations. External referral channels identify customer acquisition sources and may earn commission. Keep these concepts separate in ownership, filters, invoices, and monthly consultant reports. An employee role is not a channel.

An enrollment belongs to a student and course, may link to a class, and can have multiple payments, refunds, attachments, and class memberships. Store monetary values in integer minor units. Aggregate SGD and CNY separately; never add different currencies without an explicit exchange-rate calculation and a retained rate snapshot.

## Dates and classes

Store calendar dates as YYYY-MM-DD and lesson times in a documented timezone. A weekly series differs from a mixed series: initial one-off lessons can occur on different dates and times before a fixed weekday starts. Total lesson count includes the one-off lessons. Preserve per-session times when converting an AI draft to concrete dates or reopening a schedule.

The starter expands mixed schedules into explicit sessions in `specific_dates`; no shared global calendar service is required. Validate actual calendar dates, time ranges, duplicates and lesson limits. Incomplete AI instructions should leave an editable draft or ask for clarification, not fabricate an end date.

Enrollment end dates default to the selected class's end date. A manually supplied date represents that child's last lesson and takes precedence. Switching the selected class resets the form's previous override; editing an existing enrollment preserves its saved personal date. Missing class end dates may remain empty. End dates must not precede the child's first lesson.

Completing a class changes its state and associated active memberships to completed; it does not delete enrollment, payment or roster records. Completed rosters remain visible and exportable. Status, teacher, course and category filters must constrain the same rows shown and downloaded. Removed memberships retain a distinct removed state and removal date.

## Payments, invoices, and permissions

Validate receipt amounts and retain additional payments when editing the initial receipt. Separate core enrollment/payment persistence from attachment persistence and report a partial attachment failure accurately.

Invoice issuance uses a staff-reviewed editable draft and stores a snapshot. Keep invoice identity and totals stable after issuance; support editable Word output and a print/save-as-PDF view. Optional company seals are supplied by each organization, never bundled from a real company.

Check authorization on the server, including student/enrollment ownership and class editing rights. Preserve audit records for material changes. Disabling a member must block subsequent protected requests. The starter uses ChatGPT sign-in identity plus its own member permissions; it does not implement standalone email/password authentication.

## Configuration and current boundaries

`platform.config.json` controls organization display/legal names, optional invoice registration/address, logo/seal paths, and teachers. Other policies are code-level extension points: course categories, supported currencies, exchange-rate settlement, timezone and UI language. The writing-assessment knowledge file is a neutral rubric that should be replaced only with approved content.
