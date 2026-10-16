# Building your own platform

## Describe the first version

Tell Codex the organization name, requested language, courses, currencies, team roles and core workflows. Leave optional branding until later if necessary. Example:

> Use $academyops to create a local platform for Example Academy with student profiles, parent contact details, enrollment and receipt records, course consultant ownership, external referral channels, completed-class archives, and downloadable rosters. Use SGD/CNY and English invoices. Ask before publishing.

The skill generates an isolated application from the bundled starter. It does not copy an existing organization's data or use an existing live Site.

## Configure organization details

Edit the generated `platform.config.json`:

```json
{
  "organization": {
    "displayName": "Example Academy",
    "legalName": "Example Education Company",
    "registrationNumber": "",
    "invoiceAddressLines": [],
    "logoPath": "/organization-logo.svg",
    "sealPath": ""
  },
  "teachers": ["Teacher One", "Teacher Two"]
}
```

Use only your own legal details and artwork. Leave the optional seal path empty unless you supply a compatible image and configure invoice output for it. Keep API keys and passwords out of this file.

The baseline UI is Chinese and regional logic uses SGD/CNY and UTC+8. Ask Codex to translate labels or adapt currency/timezone logic explicitly if your requirements differ. Branding fields do not automatically make those changes.

## Create and run the application

From the public repository root:

```sh
node skills/academyops/scripts/create-platform.mjs --output ../example-academy --name "Example Academy" --legal-name "Example Education Company" --teachers "Teacher One,Teacher Two"
cd ../example-academy
npm run install:ci
npm run build
```

The generator refuses a non-empty destination. Read the generated README and the skill's deployment reference to apply the local migrations once, start the preview, and use local development sign-in. Build success alone does not initialize a database or verify production authentication.

## Workflows to customize and verify

1. Register a student and guardian; check duplicate warnings before creating a second profile for the same child.
2. Add multiple enrollments to one student. Track the internal consultant separately from the external referral channel.
3. Create a class and schedule. For example, set the first two lessons on November 2 and November 6, 2026, then repeat on Wednesdays from November 11. Include the year, start/end times and total lesson count in AI instructions. Review the expanded dates before saving.
4. Select a class during enrollment; its end date becomes the default. Override it only when the child's last lesson differs, and verify the saved date after reopening.
5. Complete a class, confirm that the full historical roster remains available, and export only the currently filtered Active/completed/all rows.
6. Preview and edit an invoice, confirm issuance, download DOCX and print/save a PDF. Verify currency and organization details.
7. Test admin, consultant, operations and finance permissions with separate accounts; disabling a member must prevent subsequent access.

## AI and deployment

AI features read a separately configured `OPENAI_API_KEY` on the server. Configure your own key in your hosting environment and exercise extraction with fictional examples first. File/model support, network access and API billing must be checked for the recipient's own environment. The skill installer does not request or embed a key.

For production, use independent hosting, D1 and R2 resources. Bootstrap the first administrator while access is owner-private, then configure staff access. Sites supports the starter's identity headers; another host needs an explicit authentication adapter. Follow `skills/academyops/references/deployment.md` with the current hosting tools.

## Sharing your changes

Share generic code or skill improvements only. Keep production identities, member lists, customer documents, database exports and uploads in private storage. Run `node scripts/validate.mjs` on a clean skill distribution before sharing it, and verify any new business or integration behavior in a separate test deployment.
