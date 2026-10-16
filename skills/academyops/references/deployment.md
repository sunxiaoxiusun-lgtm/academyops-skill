# Independent deployment

The starter is a Vinext/React application targeting Cloudflare Workers. Logical bindings `DB` and `BUCKET` refer to D1 and R2. The template's `.openai/hosting.json` deliberately has no project ID; register an independent Site before publishing through Sites.

For Sites, follow the installed Sites skill's current project setup, source synchronization, build and publication workflow. Use this starter as a sanitized template, retain its migrations, and create a new Site identity. Do not change or inspect another organization's live infrastructure to make a copy work.

For a local standalone check:

1. Install Node.js 22.13+ and run `npm run install:ci`.
2. Run `npm run build` to generate `dist/server/wrangler.json`.
3. Apply the SQL files listed in `drizzle/meta/_journal.json`, once each and in order, using the local Wrangler binding:

   ```sh
   node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_lively_violations.sql
   ```

   Repeat for the remaining journal entries. Local state is separate from production state; keep a record of local migrations already applied. Do not run all files repeatedly against an existing database.
4. Start `npm run dev` and open the printed loopback URL. The bundled development integration provides `/signin-with-chatgpt?return_to=/` for a synthetic local identity. This is not a real OAuth test or a production account.

Create a separate D1 database and R2 bucket for each organization. Runtime secrets, including an optional `OPENAI_API_KEY`, belong in the hosting environment. No live key is needed to install the skill or build the project.

For initial production setup, keep the new deployment owner-private while the owner establishes the first administrator. The first allowed identity can bootstrap the initial administrator when the members table is empty. Configure and verify staff permissions before opening broader access. Preview identity simulation must never be deployed as production authentication.

On another provider, explicitly replace Sites identity injection and environment bindings; copying a URL or GitHub source alone is insufficient. Do not promise production support until sign-in, server-side authorization, database migrations, file storage, invoice downloads, and requested AI integrations have been exercised with the recipient's own resources.
