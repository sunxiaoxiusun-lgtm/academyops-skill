# AcademyOps application starter

This is an empty, independently configurable education operations platform. Set organization details and teacher choices in `platform.config.json`. Replace the generic SVG logo if desired. No stamp, registration number, address, account list, customer record, or production hosting identity is included.

Requirements: Node.js 22.13+, npm, and Git. Run `npm run install:ci`, then `npm run build`. Follow the installed AcademyOps skill's `references/deployment.md` to initialize local D1 migrations and preview or publish with independent resources.

The application targets Cloudflare Workers using Vinext, D1 and R2. Hosted identity uses Sites' ChatGPT sign-in headers and the application's member permissions. A fresh database permits the initial allowed visitor to become administrator; initialize it owner-private. This is not an email/password authentication service.

AI features require your own server-side `OPENAI_API_KEY`. Manual registration and platform development do not require making AI requests. Local and production databases are separate. Do not commit either database, file uploads or secrets.

The workbench currently uses Chinese labels, English invoices, SGD/CNY payments and UTC+8 scheduling. Translate the UI or adapt regional code explicitly when needed. Invoice PDF delivery uses the browser print/save-as-PDF view; Word downloads are editable DOCX files. ClassIn support manages and exports rosters; it does not include an automatic ClassIn API connection.

Common commands:

```sh
npm run install:ci
npm run build
npm run dev
npx tsc --noEmit
```

The dev server prints its local URL. Apply the journaled schema migrations to the local D1 database before opening data-dependent pages. Use the supplied development sign-in route only in a loopback preview. Configure production authentication and secrets separately.
