# AcademyOps — Education Platform Builder

## 教育管理平台构建技能 · 中文 / English

AcademyOps 是一个可复用的 Codex 技能，用于创建和定制教育管理平台，涵盖学员档案、报名记录、灵活排课、收款管理、渠道佣金和可编辑发票。支持 AI 辅助录入、团队角色权限、筛选报表及云端部署指导，适用于教育机构、补习中心和培训团队。

A reusable Codex skill for building education management platforms with student records, enrollment tracking, flexible class scheduling, payment management, channel commissions, and editable invoices. Includes AI-assisted data entry, role-based team access, filtered reports, and cloud deployment guidance—customizable for academies, tutoring centers, and training teams.

AcademyOps 是**构建技能和经过脱敏的应用模板**，不是共用的在线平台或数据库。每位使用者需要建立、配置并管理自己的独立平台。

AcademyOps is a **builder skill with a clean application starter**, not a shared hosted database. Every recipient creates and operates their own independent platform.

## 功能 / What is included

- 每名学员一个唯一档案，可关联多次报名、家长信息和跟进记录。
- 区分内部课程顾问与外部渠道代理；渠道佣金不等同于顾问工资。
- 支持每周固定、逐次指定和混合排课：前几节单独安排，之后按固定星期上课，每节日期和时间均可修改。
- 报名结束日期默认采用所选班级的结束日期，也可覆盖为孩子实际最后一节课的日期。
- 可筛选在读和已结课班级，保留并下载 ClassIn 学员名单。
- 支持新币 / 人民币收款、退款、课程顾问业绩报表及渠道结算。
- 发票先预览修改再确认开具；英文发票支持浏览器打印 / 保存 PDF，以及下载可编辑 Word。
- 在服务端校验员工权限并保留操作记录。
- 可选 AI 从文字、图片及支持的文档中提取信息，并提供遵循用户权限的业务助手。
- 附项目生成脚本、数据库迁移、中立机构配置、中英双语介绍和英文详细文档。

English:

- One student identity with multiple enrollments, guardian details and follow-up history.
- Separate internal course consultants and external referral channels.
- Weekly, individually selected and mixed schedules: initial one-off lessons followed by a recurring weekday, with editable per-lesson dates and times.
- Enrollment end dates that default to the selected class end date, with an optional personal last-lesson override.
- Active/completed class filters and retained, downloadable ClassIn rosters.
- SGD/CNY payments, refunds, consultant reports and channel settlements.
- Reviewed invoice drafts, English invoice views, browser print/save-as-PDF, and editable Word downloads.
- Server-side member permissions and audit records.
- Optional AI extraction from text, images and supported documents, plus a permission-aware business assistant.
- A scaffold script, schema migrations, neutral organization configuration, a bilingual overview and detailed English documentation.

## 安装 / Install in Codex

先将仓库克隆到工作目录：

Clone this repository into a working directory:

```sh
git clone https://github.com/sunxiaoxiusun-lgtm/academyops-skill.git
```

将完整的 `skills/academyops` 文件夹复制到 Codex 技能目录。macOS / Linux 默认目录的安装命令如下，需**先进入刚克隆的仓库**：

Copy `skills/academyops` into your Codex skills directory. For the default macOS/Linux location:

```sh
cd academyops-skill
mkdir -p ~/.codex/skills
test ! -e ~/.codex/skills/academyops && cp -R skills/academyops ~/.codex/skills/academyops
```

如果目标目录已存在，请先检查现有安装再更新；以上命令不会覆盖它。使用自定义 Codex 主目录时，请使用该目录下的 `skills` 文件夹。安装后新建一个 Codex 对话，输入 `$academyops` 调用。安装技能不会自动启动网站或创建数据库。

If the destination already exists, inspect and update that installation deliberately; the command above will not overwrite it. If you use a custom Codex home directory, use its `skills` subdirectory instead. Open a new Codex task after installation, then invoke `$academyops`.

Windows、ZIP 安装、更新和卸载详见[安装说明（英文）](docs/INSTALLATION.md)。使用 ZIP 时，解压后复制其中完整的 `skills/academyops` 文件夹，而不只是 `SKILL.md`。

For Windows, ZIP installation, updates and removal, see [Installation](docs/INSTALLATION.md). Installing the skill does not start a website or provision a database.

## 使用方法 / Use the skill

可以直接对 Codex 说：

> 使用 $academyops 为示例教育机构创建一个教育管理平台，需要唯一学员档案、课程顾问归属、渠道来源、新币 / 人民币收款、可编辑发票及班级名单。排课需要支持前两节课分别指定日期，之后固定每周三上课。第一版先在本地运行，发布前先征求我的确认。

Start with a request such as:

> Use $academyops to build an education management platform for Example Academy. We need unique student records, consultant ownership, referral channels, SGD/CNY receipts, editable invoices, and class rosters. Include schedules where the first two lessons are on specific dates and the remaining lessons repeat every Wednesday. Keep the first version local and ask before publishing.

也可以在仓库根目录直接运行脚本，生成独立项目：

Or create the starter directly from the repository root without an agent:

```sh
node skills/academyops/scripts/create-platform.mjs --output ../example-academy --name "Example Academy" --teachers "Teacher One,Teacher Two"
cd ../example-academy
npm run install:ci
npm run build
```

接着初始化自己的数据库和部署环境；构建成功不代表数据库或登录已经配置完成。详见[使用说明（英文）](docs/USAGE.md)和[部署参考（英文）](skills/academyops/references/deployment.md)。

Then initialize your own database and hosting. See [Usage](docs/USAGE.md) and the skill's [deployment reference](skills/academyops/references/deployment.md).

## 隐私与独立性 / Privacy and isolation

分享包不包含学员或家长记录、员工账号、付款截图、已开发票、密钥、运行数据库、正式 Site 标识、真实机构 Logo 或印章、公司注册资料、渠道预置数据及专有课程内容，也不包含原平台的 Git 历史。公开仓库的历史仅包含自身初始化及脱敏后的分享版本。

The distributable excludes student/guardian records, employee accounts, payment screenshots, issued invoices, secrets, runtime databases, production Site IDs, real organization logos/seals, company registration details, channel seed data and proprietary curriculum content. It does not include the source platform's Git history. The public repository's history begins with its own setup and sanitized distribution.

请配置自己的机构资料、部署、D1 数据库、R2 文件存储、管理员及可选 API 密钥，不要连接他人的基础设施。安装此技能不会获得任何现有机构的数据访问权。

Do not connect a generated platform to somebody else's infrastructure. Configure your own organization details, hosting, D1 database, R2 bucket, administrator and optional API secret. Installing this skill grants no access to any existing organization's records.

## 当前适用范围 / Current implementation boundaries

应用模板使用 React/Vinext，面向 Cloudflare Workers 部署，以 D1/R2 存储数据和文件，并使用 Sites 提供的 ChatGPT 登录。在其他平台部署或改成独立账号密码登录，需要额外适配。目前工作台界面为中文，发票为英文，本文为中英双语，详细安装与使用文档为英文。默认实现 SGD/CNY 和 UTC+8，并非自动支持所有币种和时区。ClassIn 功能为名单管理与导出，不包含 ClassIn API 自动同步。

The starter uses React/Vinext and targets Cloudflare Workers, with D1/R2 storage and Sites-provided ChatGPT sign-in. It needs adaptation for other hosting or standalone authentication. The current workbench UI is Chinese and invoices are English; this overview is bilingual, with detailed installation and usage guides in English. SGD/CNY and UTC+8 are implemented defaults, not automatic support for every currency or timezone. ClassIn support is roster management/export, not automatic synchronization through ClassIn's API.

机构名称、发票注册资料和地址、可选印章及教师名单可在 `platform.config.json` 配置。界面翻译、课程分类、其他币种、时区和薪资政策需要修改代码。模板提供的通用写作评价标准并不保证适合具体课程分级。

Organization names, invoice registration/address, optional seal and teachers are configurable in `platform.config.json`. UI translations, course taxonomy, extra currencies, timezone changes and payroll policies are code-level customizations. The neutral writing rubric is not a curriculum-placement guarantee.

AI 功能需要使用者配置自己的 OpenAI API 密钥，调用可能产生费用；仅安装技能无需密钥。正式使用真实客户资料前，请在自己的部署中验证登录、权限、存储、发票及 AI 功能。

AI calls require the recipient's own OpenAI API key and may incur usage fees. No API key is needed to install the skill. Each recipient should verify real sign-in, permissions, storage, invoicing and AI behavior against their own deployment before operating with customer data.

## 验证 / Validation

使用 Node.js 22.13 或更高版本运行：

With Node.js 22.13+:

```sh
node scripts/validate.mjs
```

此检查覆盖分享包路径、密钥和正式部署标识模式、迁移一致性，以及内存中新建数据库的业务表是否为空。生成的应用仍需单独构建和进行类型检查。扫描不保证后续修改的安全性，也不代表外部安全认证。

This checks distribution paths, credential/live-identity patterns, migration consistency and an empty database created in memory. Build and type-check a generated application separately. The scanner is a distribution check, not a guarantee about future edits or an external security certification.

## 仓库结构 / Repository layout

`skills/academyops` 是需要安装的完整技能包；`assets/starter` 是脱敏后的应用模板，`references` 提供业务与部署规则。`docs` 包含英文详细安装和使用说明。

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

## 许可证 / License

AcademyOps 原创技能说明和应用定制采用 [MIT 许可证](LICENSE)。现有第三方许可证声明予以保留，详见[第三方声明](THIRD_PARTY_NOTICES.md)。使用者自行提供的 Logo 和印章由其自行负责。

Original AcademyOps skill instructions and application customizations are available under the [MIT License](LICENSE). Existing third-party license notices are retained; see [Third-party notices](THIRD_PARTY_NOTICES.md). Logos and seals supplied by recipients remain their responsibility.
