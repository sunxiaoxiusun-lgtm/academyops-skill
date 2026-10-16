# Installing AcademyOps

## Requirements

Use a Codex environment that can load local skills. Node.js 22.13+ and npm are needed to scaffold/build the application; Git is needed to clone the repository. This is a local skill package, not a hosted plugin installation or a marketplace listing.

## macOS and Linux

Clone the repository and copy the skill folder to the default skills directory:

```sh
git clone https://github.com/sunxiaoxiusun-lgtm/academyops-skill.git
cd academyops-skill
mkdir -p ~/.codex/skills
test ! -e ~/.codex/skills/academyops && cp -R skills/academyops ~/.codex/skills/academyops
```

The final path must be `~/.codex/skills/academyops/SKILL.md`, with `assets`, `scripts` and `references` alongside it. Copy the entire folder, not just SKILL.md. A custom Codex home directory uses its own `skills/academyops` path. Do not merge into an existing installation without reviewing it.

## Windows PowerShell

```powershell
git clone https://github.com/sunxiaoxiusun-lgtm/academyops-skill.git
Set-Location academyops-skill
$skillDestination = Join-Path $env:USERPROFILE '.codex\skills\academyops'
if (Test-Path $skillDestination) { throw 'AcademyOps already exists. Review it before updating.' }
New-Item -ItemType Directory -Force (Split-Path $skillDestination) | Out-Null
Copy-Item -Recurse 'skills\academyops' $skillDestination
```

Use your custom Codex skills location if configured.

## ZIP installation

Download the skill ZIP from the repository's GitHub Releases page. Extract it, find `skills/academyops`, and copy that entire folder into your skills directory. Check that the resulting path ends in `skills/academyops/SKILL.md`, not two nested copies of `skills`.

## Verify installation

Open a new Codex task and start your request with `$academyops`. For example: “Use $academyops to create a local student and enrollment workbench for Example Academy.” If it is not discovered, check the directory nesting and the skills location used by your Codex environment. Installing the skill does not start a website or provision a database.

## Update or remove

Run `git pull --ff-only` in your cloned public repository to obtain updates, inspect the changes, and replace the installed skill folder after preserving local customizations. Generated customer applications are separate projects; updating the skill must not overwrite them.

To uninstall, remove only the installed `academyops` skill folder using your file manager. This does not delete separately generated applications or cloud databases.
