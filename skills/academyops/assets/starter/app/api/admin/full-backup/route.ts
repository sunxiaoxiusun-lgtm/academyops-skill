import { zipSync, strToU8 } from "fflate";

import { getBucket, getD1 } from "@/db";
import { allow, apiFailure, requireMember } from "@/app/lib/authz";

export const dynamic = "force-dynamic";

type BackupRow = Record<string, unknown>;
type StoredFile = {
  category: "registration-screenshot" | "refund-proof" | "writing-assessment";
  recordId: string;
  objectKey: string;
  originalName: string;
  archivePath?: string;
  sizeBytes?: number;
  status: "included" | "missing";
};

function businessDate() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function safeName(value: unknown, fallback = "file") {
  const cleaned = String(value ?? "")
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/^[.-]+|[.-]+$/g, "")
    .slice(0, 160);
  return cleaned || fallback;
}

export async function GET() {
  try {
    const member = await requireMember();
    allow(member, ["admin"]);

    const db = getD1();
    const bucket = getBucket();
    const archive: Record<string, Uint8Array> = {};
    const rowsByTable = new Map<string, BackupRow[]>();
    const tableSummary: Array<{ table: string; rows: number }> = [];
    const schema = await db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all<{ name: string }>();
    const tables = (schema.results ?? [])
      .map((row) => row.name)
      .filter((name) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name));

    for (const table of tables) {
      const result = await db.prepare(`SELECT * FROM "${table}"`).all<BackupRow>();
      const rows = result.results ?? [];
      rowsByTable.set(table, rows);
      tableSummary.push({ table, rows: rows.length });
      archive[`database/${table}.json`] = strToU8(JSON.stringify(rows, null, 2));
    }

    const fileSummary: StoredFile[] = [];
    const seenObjectKeys = new Set<string>();

    async function includeStoredFile(
      category: StoredFile["category"],
      recordId: unknown,
      objectKey: unknown,
      originalName: unknown,
    ) {
      const key = String(objectKey ?? "").trim();
      if (!key || seenObjectKeys.has(key)) return;
      seenObjectKeys.add(key);

      const id = safeName(recordId, "record");
      const name = safeName(originalName, "attachment");
      const folder =
        category === "registration-screenshot"
          ? "registration-screenshots"
          : category === "refund-proof"
            ? "refund-proofs"
            : "writing-assessments";
      const archivePath = `files/${folder}/${id}-${name}`;
      const object = await bucket.get(key);

      if (!object) {
        fileSummary.push({ category, recordId: id, objectKey: key, originalName: name, status: "missing" });
        return;
      }

      const bytes = new Uint8Array(await object.arrayBuffer());
      archive[archivePath] = bytes;
      fileSummary.push({
        category,
        recordId: id,
        objectKey: key,
        originalName: name,
        archivePath,
        sizeBytes: bytes.byteLength,
        status: "included",
      });
    }

    for (const row of rowsByTable.get("enrollment_screenshots") ?? []) {
      await includeStoredFile(
        "registration-screenshot",
        row.id ?? row.enrollment_id,
        row.object_key,
        row.file_name,
      );
    }

    // Older records may still store one screenshot directly on the enrollment row.
    for (const row of rowsByTable.get("enrollments") ?? []) {
      await includeStoredFile(
        "registration-screenshot",
        row.id,
        row.registration_screenshot_key,
        row.registration_screenshot_name,
      );
    }

    for (const row of rowsByTable.get("refunds") ?? []) {
      await includeStoredFile(
        "refund-proof",
        row.id,
        row.proof_object_key,
        row.proof_file_name,
      );
    }

    for (const row of rowsByTable.get("writing_assessment_messages") ?? []) {
      let attachments: Array<{ name?: string; key?: string }> = [];
      try {
        const parsed = JSON.parse(String(row.attachments_json ?? "[]"));
        if (Array.isArray(parsed)) attachments = parsed;
      } catch {
        attachments = [];
      }
      for (const attachment of attachments) {
        await includeStoredFile(
          "writing-assessment",
          row.assessment_id ?? row.id,
          attachment.key,
          attachment.name,
        );
      }
    }

    const generatedAt = new Date().toISOString();
    const manifest = {
      format: "academyops-platform-full-backup",
      formatVersion: 1,
      generatedAt,
      generatedBy: { memberId: member.id, email: member.email },
      database: {
        engine: "Cloudflare D1 (SQLite)",
        tables: tableSummary,
        totalRows: tableSummary.reduce((total, item) => total + item.rows, 0),
      },
      objectStorage: {
        engine: "Cloudflare R2",
        includedFiles: fileSummary.filter((item) => item.status === "included").length,
        missingFiles: fileSummary.filter((item) => item.status === "missing").length,
        files: fileSummary,
      },
    };

    archive["manifest.json"] = strToU8(JSON.stringify(manifest, null, 2));
    archive["README.txt"] = strToU8(
      [
        "Education Platform Full Backup",
        `生成时间（UTC）：${generatedAt}`,
        "",
        "database/：所有应用数据库表的完整 JSON 数据。",
        "files/registration-screenshots/：报名截图。",
        "files/refund-proofs/：退款凭证。",
        "files/writing-assessments/：CR 写作能力评估中上传的作文与资料。",
        "manifest.json：表行数、文件清单及缺失文件提示。",
        "",
        "请将整个 ZIP 原样保留。恢复数据前请联系平台管理员进行校验。",
      ].join("\n"),
    );

    const zip = zipSync(archive, { level: 6 });
    const date = businessDate();
    const body = zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer;

    return new Response(body, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="Education-Full-Backup-${date}.zip"`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return apiFailure(error);
  }
}
