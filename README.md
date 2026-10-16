# AcademyOps — Education Platform Builder

A reusable Codex skill for building education management platforms with student records, enrollment tracking, flexible class scheduling, payment management, channel commissions, and editable invoices. Includes AI-assisted data entry, role-based team access, filtered reports, and cloud deployment guidance—customizable for academies, tutoring centers, and training teams.

AcademyOps is a **builder skill with a clean application starter**, not a shared hosted database. Every recipient creates and operates their own independent platform.

## What is included

- One student identity with multiple enrollments, guardian details and follow-up history.
- Separate internal course consultants and external referral channels.
- Weekly, individually selected and mixed schedules: initial one-off lessons followed by a recurring weekday, with editable per-lesson dates and times.
- Enrollment end dates that default to the selected class end date, with an optional personal last-lesson override.
- Active/completed class filters and retained, downloadable ClassIn rosters.
- SGD/CNY payments, refunds, consultant reports and channel settlements.
- Reviewed invoice drafts, English invoice views, browser print/save-as-PDF, and editable Word downloads.
- Server-side member permissions and audit records.
- Optional AI extraction from text, images and supported documents, plus a permission-aware business assistant.
- A scaffold script, schema migrations, neutral organization configuration and English documentation.

## Install in Codex

Clone this repository into a working directory:

```sh
git clone https://github.com/sunxiaoxiusun-lgtm/academyops-skill.git
```

Copy `skills/academyops` into your Codex skills directory. For the default macOS/Linux location, run this **from inside the cloned repository**:

```sh
mkdir -p ~/.codex/skills
test ! -e ~/.codex/skills/academyops && cp -R skills/academyops ~/.codex/skills/academyops
```

If the destination already exists, inspect and update that installation deliberately; the command above will not overwrite it. If you use a custom Codex home directory, use its `skills` subdirectory instead. Open a new Codex task after installation, then invoke `$academyops`.

For Windows, ZIP installation, updates and removal, see [Installation](docs/INSTALLATION.md).

## Use the skill

Start with a request such as:

> Use $academyops to build an education management platform for Example Academy. We need unique student records, consultant ownership, referral channels, SGD/CNY receipts, editable invoices, and class rosters. Include schedules where the first two lessons are on specific dates and the remaining lessons repeat every Wednesday. Keep the first version local.

Or create the starter directly without an agent:

```sh
node skills/academyops/scripts/create-platform.mjs --output ../example-academy --name "Example Academy" --teachers "Teacher One,Teacher Two"
cd ../example-academy
npm run install:ci
npm run build
```

Then initialize your own database and hosting. See [Usage](docs/USAGE.md) and the skill's [deployment reference](skills/academyops/references/deployment.md).

## Privacy and isolation

The distributable excludes student/guardian records, employee accounts, payment screenshots, issued invoices, secrets, runtime databases, production Site IDs, real organization logos/seals, company registration details, channel seed data and proprietary curriculum content. It does not include the source platform's Git history. The public repository's history begins with its own setup and sanitized distribution.

Do not connect a generated platform to somebody else's infrastructure. Configure your own organization details, hosting, D1 database, R2 bucket, administrator and optional API secret. Installing this skill grants no access to any existing organization's records.

## Current implementation boundaries

The starter uses React/Vinext and targets Cloudflare Workers, with D1/R2 storage and Sites-provided ChatGPT sign-in. It needs adaptation for other hosting or standalone authentication. The current workbench UI is Chinese; invoices and these instructions are English. SGD/CNY and UTC+8 are implemented defaults, not automatic support for every currency or timezone. ClassIn support is roster management/export, not automatic synchronization through ClassIn's API.

Organization names, invoice registration/address, optional seal and teachers are configurable in `platform.config.json`. UI translations, course taxonomy, extra currencies, timezone changes and payroll policies are code-level customizations. The neutral writing rubric is not a curriculum-placement guarantee.

AI calls require the recipient's own OpenAI API key and may incur usage fees. No API key is needed to install the skill. Each recipient should verify real sign-in, permissions, storage, invoicing and AI behavior against their own deployment before operating with customer data.

## Validation

With Node.js 22.13+:

```sh
node scripts/validate.mjs
```

This checks distribution paths, credential/live-identity patterns, migration consistency and an empty database created in memory. Build and type-check a generated application separately. The scanner is a distribution check, not a guarantee about future edits or an external security certification.

## Repository layout

```text
skills/academyops/
  SKILL.md               Codex workflow and scope
  agents/openai.yaml     Skill discovery metadata
  scripts/               Independent project generator
  references/            Business rules and deployment guidance
  assets/starter/        Sanitized full-stack application template
docs/                    English installation and usage instructions
scripts/validate.mjs     Distribution and empty-schema checks
```

## License

Original AcademyOps skill instructions and application customizations are available under the [MIT License](LICENSE). Existing third-party license notices are retained; see [Third-party notices](THIRD_PARTY_NOTICES.md). Logos and seals supplied by recipients remain their responsibility.
