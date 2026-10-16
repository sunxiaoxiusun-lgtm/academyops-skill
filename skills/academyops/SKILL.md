---
name: academyops
description: Build and customize education management platforms from a clean full-stack starter; use for student records, enrollments, flexible scheduling, payments, referral channels, invoices, staff permissions, or changes to generated platforms. 为教育机构、补习中心及培训团队构建或定制教务平台，适用于学员档案、报名、灵活排课、收款、渠道、发票、员工权限及已有生成平台的修改。
---

# AcademyOps — Education Platform Builder

教育管理平台构建技能：从脱敏的全栈应用模板创建独立平台，或按要求定制已生成的平台。安装技能不会启动网站或创建数据库；使用者需要自己的部署、数据库、存储与可选 AI 密钥。

Generate an independent platform from `assets/starter`. The bundled template contains application code and schema migrations, not a deployed service or a populated database.

## Create a platform

1. Infer the requested modules, organization name, language, currencies, and hosting choice from the user. Ask only for choices that materially change implementation. Neutral branding is usable until real branding is supplied.
2. Run the scaffold helper using its absolute path:

   ```sh
   node <skill-directory>/scripts/create-platform.mjs --output <new-empty-directory> --name "Example Academy"
   ```

   Optional flags: `--legal-name`, `--teachers` (comma-separated). The output must be empty; this is a new project, never a replacement for a customized working tree.
3. Edit `platform.config.json` for legal name, invoice registration/address, logo, optional seal, and teacher choices. The baseline supports SGD/CNY, UTC+8 scheduling, a Chinese workbench, and English invoices. Translate UI or adapt currency/timezone logic when requested; changing branding configuration alone does not implement these regional changes.
4. Read [references/domain-model.md](references/domain-model.md) before changing business relationships, permissions, schedules, invoices, or reporting. Preserve the distinctions described there.
5. Implement only the user's requested changes. Existing generated platforms should be edited in place after inspecting their configuration and migration history; do not rerun the scaffold over them.
6. Install locked dependencies with `npm run install:ci`, and validate with `npm run build` and `npx tsc --noEmit`. Resolve actual failures before handing off. The repository's `scripts/validate.mjs` checks the clean distributable and empty schema; run it before redistributing a skill, not on a deployed customer's populated project.

## Hosting, identity, and AI

Read [references/deployment.md](references/deployment.md) when previewing or publishing. Each generated organization needs a new hosting identity, database, file bucket, secrets, and initial administrator. A GitHub repository alone does not provide the application's database or authentication.

When the Sites skill and tools are available, use their current workflow for a **new** Site with the generated project as a sanitized template. Register a new project and retain the newly returned identity. Do not attempt to discover or reuse a source author's infrastructure. If the user chooses another provider, adapt Cloudflare Worker bindings and dispatch-owned authentication explicitly; do not present this starter as provider-independent without those changes.

The server reads `OPENAI_API_KEY` from its own environment. Configure a recipient's key only with their authorization, keep it server-side, and do not enable real AI calls simply to demonstrate a template. AI schedule extraction produces an editable draft; confirm missing dates, times, and lesson counts before saving. Business-assistant actions must respect role checks and the user's explicit instruction to change records.

## Sharing boundaries

Keep customer databases, uploads, screenshots, invoices, secrets, runtime state, and organization-specific branding out of shared source. Do not add production Site IDs or personal information to examples. Use fictional or empty examples. A request to build a platform does not by itself authorize publishing it, inviting employees, importing private records, or sending messages.

Before delivery, report implemented modules, checks actually run, how to open the result, and any unverified external integration. Do not claim a deployment or AI integration works solely because compilation passed.
