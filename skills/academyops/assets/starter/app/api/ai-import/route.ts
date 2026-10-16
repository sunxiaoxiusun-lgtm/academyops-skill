import { getBucket, getD1, getOpenAIKey } from "@/db";
import { allow, apiFailure, ApiError, requireMember } from "@/app/lib/authz";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

const allowedExtensions = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "csv",
  "xls",
  "xlsx",
]);
const imageExtensions = new Set(["jpg", "jpeg", "png", "webp"]);
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_SOURCE_CHARS = 50000;
const MAX_IMPORT_RECORDS = 50;

export async function GET() {
  try {
    const member = await requireMember();
    allow(member, ["admin", "sales", "operations", "operations_finance"]);
    return Response.json({
      connected: Boolean(getOpenAIKey()),
      model: "gpt-4.1-mini",
    });
  } catch (error) {
    return apiFailure(error);
  }
}

export async function POST(request: Request) {
  let jobId = "";
  try {
    const member = await requireMember();
    allow(member, ["admin", "sales", "operations", "operations_finance"]);
    const apiKey = getOpenAIKey();
    if (!apiKey)
      throw new ApiError(
        503,
        "AI 识别尚未连接，请管理员先配置 OpenAI API 密钥",
      );

    const form = await request.formData();
    const mode =
      String(form.get("mode") ?? "enrollment") === "student"
        ? "student"
        : "enrollment";
    const sourceText = String(form.get("sourceText") ?? "").trim();
    if (sourceText.length > MAX_SOURCE_CHARS)
      throw new ApiError(
        400,
        "粘贴内容超过 50,000 个字符，请改用 Excel 或分批导入",
      );
    const fileValue = form.get("file");
    const file =
      fileValue instanceof File && fileValue.size > 0 ? fileValue : null;
    if (!sourceText && !file)
      throw new ApiError(
        400,
        "请上传图片 / Excel，或在 AI 补充说明中输入内容",
      );
    if (file && file.size > MAX_FILE_BYTES)
      throw new ApiError(400, "文件不能超过 10MB");

    const extension = file?.name.split(".").pop()?.toLowerCase() ?? "";
    if (file && !allowedExtensions.has(extension))
      throw new ApiError(400, "仅支持 JPG、PNG、WEBP、CSV、XLS 和 XLSX");

    const db = getD1();
    jobId = crypto.randomUUID();
    const sourceType = `${mode}_${file ? (imageExtensions.has(extension) ? "image" : "spreadsheet") : "text"}`;
    const fileName = file?.name.slice(0, 180) ?? "";
    const mimeType = file?.type || mimeFor(extension);
    const objectKey = file
      ? `ai-imports/${safeSegment(member.userId)}/${jobId}/${safeFileName(fileName)}`
      : null;

    if (file && objectKey) {
      await getBucket().put(objectKey, await file.arrayBuffer(), {
        httpMetadata: { contentType: mimeType },
        customMetadata: { uploadedBy: member.userId, jobId },
      });
    }
    await db
      .prepare(
        "INSERT INTO ai_import_jobs (id,source_type,source_text,file_name,mime_type,object_key,status,created_by) VALUES (?,?,?,?,?,?,'processing',?)",
      )
      .bind(
        jobId,
        sourceType,
        sourceText,
        fileName,
        mimeType,
        objectKey,
        member.userId,
      )
      .run();

    const [courses, classes, agents, team] = await Promise.all([
      db
        .prepare(
          "SELECT id,name,currency,standard_price_cents FROM courses WHERE active=1 ORDER BY name",
        )
        .all<Row>(),
      db
        .prepare(
          "SELECT cg.id,cg.course_id,cg.name,cg.classin_class_name,cg.teacher_name,c.name AS course_name FROM class_groups cg JOIN courses c ON c.id=cg.course_id WHERE cg.status='active' ORDER BY c.name,cg.start_date,cg.name",
        )
        .all<Row>(),
      db
        .prepare("SELECT id,name FROM agents WHERE active=1 ORDER BY name")
        .all<Row>(),
      db
        .prepare(
          "SELECT user_id,display_name,email,role FROM members WHERE status='active' AND role IN ('admin','sales','operations','operations_finance') ORDER BY display_name",
        )
        .all<Row>(),
    ]);
    const fileBytes = file ? new Uint8Array(await file.arrayBuffer()) : null;
    let records = await recognize(apiKey, {
      mode,
      sourceText,
      file,
      fileBytes,
      extension,
      mimeType,
      courses: courses.results,
      classes: classes.results,
      agents: agents.results,
      team: team.results,
    });
    records = await addStudentMatchHints(db, records, mode);
    await db
      .prepare(
        "UPDATE ai_import_jobs SET status='review',extracted_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
      )
      .bind(JSON.stringify(records), jobId)
      .run();
    return Response.json({ jobId, records, mode, sourceType, fileName });
  } catch (error) {
    if (jobId) {
      try {
        await getD1()
          .prepare(
            "UPDATE ai_import_jobs SET status='failed',error_message=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
          )
          .bind(
            error instanceof Error ? error.message.slice(0, 500) : "识别失败",
            jobId,
          )
          .run();
      } catch {
        /* preserve the original error */
      }
    }
    return apiFailure(error);
  }
}

async function recognize(
  apiKey: string,
  input: {
    mode: "student" | "enrollment";
    sourceText: string;
    file: File | null;
    fileBytes: Uint8Array | null;
    extension: string;
    mimeType: string;
    courses: Row[];
    classes: Row[];
    agents: Row[];
    team: Row[];
  },
) {
  const catalog = JSON.stringify({
    courses: input.courses,
    classes: input.classes,
    agents: input.agents,
    salespeople: input.team,
  });
  const content: Row[] = [
    {
      type: "input_text",
      text: `请从用户提供的内容中提取报名记录。可用课程、报名渠道与内部员工名单如下：${catalog}\n\n用户补充说明（用于解释、纠正或强调文件内容；与文件冲突时以补充说明为准，但不得凭空补全）：${input.sourceText || "无"}`,
    },
  ];
  if (input.file && input.fileBytes) {
    const dataUrl = `data:${input.mimeType};base64,${toBase64(input.fileBytes)}`;
    content.push(
      imageExtensions.has(input.extension)
        ? { type: "input_image", image_url: dataUrl, detail: "high" }
        : { type: "input_file", filename: input.file.name, file_data: dataUrl },
    );
  }
  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        store: false,
        max_output_tokens: 30000,
        instructions:
          input.mode === "student"
            ? "你是教育机构的学员资料录入助手。只提取明确出现的信息，不猜测姓名、年级、微信名、日期或联系方式。课程顾问是内部员工，只能从提供的团队名单匹配 ID；首次来源渠道是外部客户来源，只能从渠道名单匹配 ID。无法确定时对应 ID 必须为 null 并写入 warnings。首次登记日期统一 YYYY-MM-DD。必须逐行读取并返回全部记录，不得只返回预览中最明显的几行；单次最多返回前 50 条。"
            : "你是教育机构的报名资料录入助手。只提取明确出现的学员、课程、金额和收款信息，不猜测。课程只能从课程名单匹配。报名不分配班级，也不询问报名日期、预计结课日期、课程顾问或渠道；日期与归属信息由系统自动处理或从已有学员档案继承。无法确定课程时对应 ID 必须为 null、保留原始名称并写入 warnings。金额输出十进制元，不要输出分。币种只能是 SGD 或 CNY；报名类型只能是 new（新报）或 renewal（续报）。必须逐行读取并返回全部报名，不得只返回预览中最明显的几行；单次最多返回前 50 条。",
        input: [{ role: "user", content }],
        text: {
          format: {
            type: "json_schema",
            name:
              input.mode === "student" ? "student_import" : "enrollment_import",
            strict: true,
            schema:
              input.mode === "student" ? studentImportSchema : importSchema,
          },
        },
      }),
    });
  } catch {
    throw new ApiError(502, "AI 识别服务连接失败，请稍后重试");
  }
  const body = (await response.json()) as Row;
  if (!response.ok) {
    const detail =
      body.error && typeof body.error === "object"
        ? String((body.error as Row).message ?? "")
        : "";
    throw new ApiError(
      502,
      detail ? `AI 识别失败：${detail.slice(0, 180)}` : "AI 识别服务暂时不可用",
    );
  }
  const outputText = responseText(body);
  if (!outputText) throw new ApiError(502, "AI 没有返回可用的报名信息");
  const parsed = JSON.parse(outputText) as { records?: Row[] };
  if (!Array.isArray(parsed.records) || !parsed.records.length)
    throw new ApiError(422, "没有识别到报名记录，请补充更清楚的内容");
  return parsed.records.slice(0, MAX_IMPORT_RECORDS);
}

async function addStudentMatchHints(
  db: D1Database,
  records: Row[],
  mode: "student" | "enrollment",
) {
  const existing = await db
    .prepare(
      "SELECT s.id,s.code,s.full_name,s.date_of_birth,s.classin_account,g.phone,g.wechat_name FROM students s LEFT JOIN student_guardians sg ON sg.student_id=s.id AND sg.is_primary=1 LEFT JOIN guardians g ON g.id=sg.guardian_id WHERE s.status='active'",
    )
    .all<Row>();
  return records.map((record) => {
    const name = String(record.student_full_name ?? "")
        .trim()
        .toLowerCase(),
      phone = String(record.guardian_phone ?? "").trim(),
      dob = String(record.date_of_birth ?? "").trim(),
      classin = String(record.classin_account ?? "")
        .trim()
        .toLowerCase();
    const named = existing.results.filter(
      (row) =>
        String(row.full_name ?? "")
          .trim()
          .toLowerCase() === name,
    );
    const exact = named.filter(
      (row) =>
        (phone && String(row.phone ?? "") === phone) ||
        (dob && String(row.date_of_birth ?? "") === dob) ||
        (classin &&
          String(row.classin_account ?? "")
            .trim()
            .toLowerCase() === classin),
    );
    const matches = exact.length ? exact : named.length === 1 ? named : [];
    if (!matches.length && named.length > 1)
      return {
        ...record,
        warnings: [
          ...(Array.isArray(record.warnings) ? record.warnings : []),
          "存在多个同名学员，请补充家长电话、生日或 ClassIn 账号后再导入",
        ],
      };
    if (!matches.length)
      return {
        ...record,
        warnings: [
          ...(Array.isArray(record.warnings) ? record.warnings : []),
          ...(mode === "enrollment"
            ? ["未找到学员档案，请先创建学员档案后再报名"]
            : []),
        ],
      };
    const match = matches[0];
    return {
      ...record,
      existing_student_id: String(match.id),
      existing_student_code: String(match.code),
      warnings: [
        ...(Array.isArray(record.warnings) ? record.warnings : []),
        mode === "student"
          ? `已有学员 ${String(match.code)}，学员档案导入时会跳过`
          : `已匹配已有学员 ${String(match.code)}，报名会直接关联此档案`,
      ],
    };
  });
}

function responseText(body: Row) {
  if (typeof body.output_text === "string" && body.output_text)
    return body.output_text;
  if (!Array.isArray(body.output)) return "";
  return body.output
    .flatMap((item) => {
      if (
        !item ||
        typeof item !== "object" ||
        !Array.isArray((item as Row).content)
      )
        return [];
      return ((item as Row).content as Row[])
        .filter(
          (part) =>
            part?.type === "output_text" && typeof part.text === "string",
        )
        .map((part) => String(part.text));
    })
    .join("");
}

const nullableString = { type: ["string", "null"] };
const nullableNumber = { type: ["number", "null"] };
const importSchema = {
  type: "object",
  properties: {
    records: {
      type: "array",
      minItems: 1,
      maxItems: MAX_IMPORT_RECORDS,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          student_full_name: { type: "string" },
          english_name: nullableString,
          school: nullableString,
          grade: nullableString,
          classin_account: nullableString,
          first_registered_at: nullableString,
          guardian_name: nullableString,
          guardian_wechat_name: nullableString,
          guardian_phone: nullableString,
          course_id: nullableString,
          course_name_raw: nullableString,
          class_group_id: nullableString,
          class_group_name_raw: nullableString,
          quantity: nullableNumber,
          list_amount: nullableNumber,
          payment_amount: nullableNumber,
          payment_method: nullableString,
          payment_reference: nullableString,
          paid_at: nullableString,
          currency: nullableString,
          registration_type: nullableString,
          registered_at: nullableString,
          start_date: nullableString,
          expected_end_date: nullableString,
          agent_id: nullableString,
          agent_name_raw: nullableString,
          salesperson_user_id: nullableString,
          salesperson_name_raw: nullableString,
          notes: nullableString,
          confidence: { type: "number" },
          warnings: { type: "array", items: { type: "string" } },
        },
        required: [
          "student_full_name",
          "english_name",
          "school",
          "grade",
          "classin_account",
          "first_registered_at",
          "guardian_name",
          "guardian_wechat_name",
          "guardian_phone",
          "course_id",
          "course_name_raw",
          "class_group_id",
          "class_group_name_raw",
          "quantity",
          "list_amount",
          "payment_amount",
          "payment_method",
          "payment_reference",
          "paid_at",
          "currency",
          "registration_type",
          "registered_at",
          "start_date",
          "expected_end_date",
          "agent_id",
          "agent_name_raw",
          "salesperson_user_id",
          "salesperson_name_raw",
          "notes",
          "confidence",
          "warnings",
        ],
      },
    },
  },
  required: ["records"],
  additionalProperties: false,
};

const studentImportSchema = {
  type: "object",
  properties: {
    records: {
      type: "array",
      minItems: 1,
      maxItems: MAX_IMPORT_RECORDS,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          student_full_name: { type: "string" },
          english_name: nullableString,
          school: nullableString,
          grade: nullableString,
          classin_account: nullableString,
          first_registered_at: nullableString,
          guardian_name: nullableString,
          guardian_wechat_name: nullableString,
          guardian_phone: nullableString,
          agent_id: nullableString,
          agent_name_raw: nullableString,
          salesperson_user_id: nullableString,
          salesperson_name_raw: nullableString,
          notes: nullableString,
          confidence: { type: "number" },
          warnings: { type: "array", items: { type: "string" } },
        },
        required: [
          "student_full_name",
          "english_name",
          "school",
          "grade",
          "classin_account",
          "first_registered_at",
          "guardian_name",
          "guardian_wechat_name",
          "guardian_phone",
          "agent_id",
          "agent_name_raw",
          "salesperson_user_id",
          "salesperson_name_raw",
          "notes",
          "confidence",
          "warnings",
        ],
      },
    },
  },
  required: ["records"],
  additionalProperties: false,
};

function toBase64(bytes: Uint8Array) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk)
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}
function safeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
}
function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 160) || "upload";
}
function mimeFor(extension: string) {
  return (
    (
      {
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        webp: "image/webp",
        csv: "text/csv",
        xls: "application/vnd.ms-excel",
        xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      } as Record<string, string>
    )[extension] ?? "application/octet-stream"
  );
}
