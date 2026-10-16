import platformConfig from "@/platform.config.json";
import { getBucket, getD1, getOpenAIKey } from "@/db";
import { apiFailure, ApiError, requireMember } from "@/app/lib/authz";
import {
  CREATIVE_WRITING_LEVELS,
  GREAT_WRITING_LEVELS,
  WRITING_ASSESSMENT_KNOWLEDGE,
} from "@/app/lib/writing-assessment-knowledge";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;
type Attachment = { name: string; key: string; type: string; size: number };

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 25 * 1024 * 1024;
const MAX_FILES = 10;
const allowedExtensions = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "pdf",
  "doc",
  "docx",
  "txt",
  "md",
]);
const imageExtensions = new Set(["jpg", "jpeg", "png", "webp"]);

export async function GET(request: Request) {
  try {
    const member = await requireMember();
    if (member.role === "pending") throw new ApiError(403, "等待管理员分配权限后才能使用写作评估");
    const db = getD1();
    const url = new URL(request.url);
    const selectedId = String(url.searchParams.get("id") ?? "").trim();
    const scope = member.role === "admin" ? "" : " WHERE wa.created_by=?";
    const listQuery = db.prepare(`SELECT wa.id,wa.student_name,wa.school_system,wa.school_name,wa.grade,wa.status,
      wa.recommended_cw_level,wa.recommended_gw_level,wa.confidence,wa.created_by,wa.created_at,wa.updated_at,
      COALESCE(m.display_name,'') created_by_name
      FROM writing_assessments wa LEFT JOIN members m ON m.user_id=wa.created_by${scope}
      ORDER BY wa.updated_at DESC LIMIT 100`);
    const assessments = member.role === "admin"
      ? await listQuery.all<Row>()
      : await listQuery.bind(member.userId).all<Row>();

    let selected: Row | null = null;
    let messages: Row[] = [];
    if (selectedId) {
      const selectedQuery = db.prepare(`SELECT wa.* FROM writing_assessments wa WHERE wa.id=?${
        member.role === "admin" ? "" : " AND wa.created_by=?"
      }`);
      selected = (member.role === "admin"
        ? await selectedQuery.bind(selectedId).first<Row>()
        : await selectedQuery.bind(selectedId, member.userId).first<Row>()) ?? null;
      if (!selected) throw new ApiError(404, "评估记录不存在或你没有查看权限");
      const result = await db
        .prepare("SELECT id,role,content,attachments_json,created_at FROM writing_assessment_messages WHERE assessment_id=? ORDER BY created_at,id")
        .bind(selectedId)
        .all<Row>();
      messages = result.results ?? [];
    }

    return Response.json({
      member,
      connected: Boolean(getOpenAIKey()),
      assessments: assessments.results ?? [],
      selected,
      messages,
    });
  } catch (error) {
    return apiFailure(error);
  }
}

export async function POST(request: Request) {
  try {
    const member = await requireMember();
    if (member.role === "pending") throw new ApiError(403, "等待管理员分配权限后才能使用写作评估");
    const apiKey = getOpenAIKey();
    if (!apiKey) throw new ApiError(503, "写作评估助手尚未连接，请联系管理员检查 OpenAI API 配置");

    const form = await request.formData();
    const message = String(form.get("message") ?? "").trim().slice(0, 12000);
    const files = form
      .getAll("files")
      .filter((value): value is File => value instanceof File && value.size > 0);
    if (!message && !files.length) throw new ApiError(400, "请输入信息或上传孩子的作文");
    if (files.length > MAX_FILES) throw new ApiError(400, `每次最多上传 ${MAX_FILES} 个文件`);
    if (files.some((file) => file.size > MAX_FILE_BYTES)) throw new ApiError(400, "每个文件不能超过 10MB");
    if (files.reduce((sum, file) => sum + file.size, 0) > MAX_TOTAL_BYTES)
      throw new ApiError(400, "本次上传文件总大小不能超过 25MB");
    for (const file of files) {
      const extension = extensionFor(file.name);
      if (!allowedExtensions.has(extension))
        throw new ApiError(400, "支持 JPG、PNG、WEBP、PDF、Word、TXT 和 Markdown 文件");
    }

    const db = getD1();
    let assessmentId = String(form.get("assessmentId") ?? "").trim();
    if (assessmentId) {
      const existing = await db
        .prepare(`SELECT id FROM writing_assessments WHERE id=?${member.role === "admin" ? "" : " AND created_by=?"}`)
        .bind(...(member.role === "admin" ? [assessmentId] : [assessmentId, member.userId]))
        .first<Row>();
      if (!existing) throw new ApiError(404, "评估记录不存在或你没有编辑权限");
    } else {
      assessmentId = crypto.randomUUID();
      await db
        .prepare("INSERT INTO writing_assessments (id,created_by) VALUES (?,?)")
        .bind(assessmentId, member.userId)
        .run();
    }

    const attachments: Attachment[] = [];
    const userContent: Row[] = [
      { type: "input_text", text: message || "请分析我上传的孩子近期写作样本，并继续完成课程能力评估。" },
    ];
    for (const file of files) {
      const extension = extensionFor(file.name);
      const bytes = new Uint8Array(await file.arrayBuffer());
      const mime = file.type || mimeFor(extension);
      const key = `writing-assessments/${safeSegment(member.userId)}/${assessmentId}/${crypto.randomUUID()}-${safeName(file.name)}`;
      await getBucket().put(key, bytes, { httpMetadata: { contentType: mime } });
      attachments.push({ name: file.name.slice(0, 180), key, type: mime, size: file.size });
      const dataUrl = `data:${mime};base64,${toBase64(bytes)}`;
      userContent.push(
        imageExtensions.has(extension)
          ? { type: "input_image", image_url: dataUrl, detail: "high" }
          : { type: "input_file", filename: file.name.slice(0, 180), file_data: dataUrl },
      );
    }

    await db
      .prepare("INSERT INTO writing_assessment_messages (id,assessment_id,role,content,attachments_json,created_by) VALUES (?,?,?,?,?,?)")
      .bind(crypto.randomUUID(), assessmentId, "user", message, JSON.stringify(attachments), member.userId)
      .run();

    const historyResult = await db
      .prepare("SELECT role,content FROM writing_assessment_messages WHERE assessment_id=? ORDER BY created_at DESC,id DESC LIMIT 24")
      .bind(assessmentId)
      .all<Row>();
    const history = [...(historyResult.results ?? [])].reverse();
    if (history.length) history.pop();
    const input: Row[] = [
      ...history
        .filter((item) => ["user", "assistant"].includes(String(item.role)) && String(item.content || "").trim())
        .map((item) => ({ role: item.role, content: String(item.content).slice(0, 8000) })),
      { role: "user", content: userContent },
    ];

    const openAIResponse = await callOpenAI(apiKey, {
      model: "gpt-4.1-mini",
      store: false,
      instructions: assistantInstructions(),
      input,
      text: { format: assessmentFormat },
    });
    const raw = responseText(openAIResponse);
    let result: Row;
    try {
      result = JSON.parse(raw) as Row;
    } catch {
      throw new ApiError(502, "写作评估结果格式异常，请重试");
    }
    const reply = String(result.reply ?? "请继续补充孩子的资料。").slice(0, 12000);
    const profile = isRow(result.profile) ? result.profile : {};
    const recommendation = isRow(result.recommendation) ? result.recommendation : null;
    const status = result.status === "complete" && recommendation ? "completed" : "draft";
    const reasons = recommendation && Array.isArray(recommendation.reasons)
      ? recommendation.reasons.map(String).slice(0, 8)
      : [];
    const summary = reasons.join("；").slice(0, 4000);

    await db.batch([
      db
        .prepare("INSERT INTO writing_assessment_messages (id,assessment_id,role,content,attachments_json,created_by) VALUES (?,?,?,?,?,?)")
        .bind(crypto.randomUUID(), assessmentId, "assistant", reply, "[]", member.userId),
      db
        .prepare(`UPDATE writing_assessments SET student_name=?,school_system=?,school_name=?,grade=?,status=?,
          recommended_cw_level=?,recommended_gw_level=?,confidence=?,summary=?,parent_message=?,recommendation_json=?,updated_at=CURRENT_TIMESTAMP
          WHERE id=?`)
        .bind(
          clean(profile.studentName, "待补充", 120),
          clean(profile.schoolSystem, "", 80),
          clean(profile.schoolName, "", 160),
          clean(profile.grade, "", 80),
          status,
          recommendation ? clean(recommendation.creativeWritingLevel, "", 40) : "",
          recommendation ? clean(recommendation.greatWritingLevel, "", 40) : "",
          recommendation ? Math.max(0, Math.min(100, Number(recommendation.confidence || 0))) : 0,
          summary,
          recommendation ? clean(recommendation.parentMessage, "", 6000) : "",
          JSON.stringify(recommendation ?? {}),
          assessmentId,
        ),
    ]);

    return Response.json({ assessmentId, reply, status, profile, recommendation });
  } catch (error) {
    return apiFailure(error);
  }
}

function assistantInstructions() {
  return `你是 ${platformConfig.organization.displayName} 内部的“Codex 写作能力评估助手”。只服务员工，用中文进行自然、专业、简洁的对话。

你的任务：通过对话收集必要信息，阅读孩子最近的写作样本，并同时推荐最适合的 Creative Writing 精确 A/B 级别和 Great Writing 级别。

必须收集的信息：孩子姓名；国际学校或公立学校；学校全名；年级或年龄；英语学习背景；最近 2–3 篇由孩子独立完成的作文；作品是否经过家长、老师或 AI 大幅修改。可以分轮追问，但每次问题要集中、具体、方便员工回答。

评估维度：思想与组织、句法和语法控制、词汇、叙事技巧、论证与体裁、拼写标点、独立完成度。学校背景只是语境，绝不能自动决定级别。以多篇作品稳定展现的水平为准，不因为单篇最强作品拔高级别。资料不足时 status 必须是 needs_more_info、recommendation 必须为 null，并继续询问最关键的缺口；不得猜测。

资料充分时，status 为 complete，并给出两个级别、0–100 的信心度、具体证据、优势、接下来 2–4 个学习重点，以及一段可直接发给家长的中文话术。家长话术应先肯定具体优点，再说明推荐与依据，最后说明学习目标；不得贬低孩子或学校，不得保证结果。

课程知识如下：
${WRITING_ASSESSMENT_KNOWLEDGE}`;
}

const assessmentFormat = {
  type: "json_schema",
  name: "academyops_writing_assessment",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      reply: { type: "string" },
      status: { type: "string", enum: ["needs_more_info", "complete"] },
      profile: {
        type: "object",
        additionalProperties: false,
        properties: {
          studentName: { type: ["string", "null"] },
          schoolSystem: { type: ["string", "null"] },
          schoolName: { type: ["string", "null"] },
          grade: { type: ["string", "null"] },
        },
        required: ["studentName", "schoolSystem", "schoolName", "grade"],
      },
      recommendation: {
        type: ["object", "null"],
        additionalProperties: false,
        properties: {
          creativeWritingLevel: { type: "string", enum: CREATIVE_WRITING_LEVELS },
          greatWritingLevel: { type: "string", enum: GREAT_WRITING_LEVELS },
          confidence: { type: "integer", minimum: 0, maximum: 100 },
          reasons: { type: "array", items: { type: "string" } },
          strengths: { type: "array", items: { type: "string" } },
          priorities: { type: "array", items: { type: "string" } },
          parentMessage: { type: "string" },
        },
        required: [
          "creativeWritingLevel",
          "greatWritingLevel",
          "confidence",
          "reasons",
          "strengths",
          "priorities",
          "parentMessage",
        ],
      },
    },
    required: ["reply", "status", "profile", "recommendation"],
  },
};

async function callOpenAI(apiKey: string, body: Row) {
  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError(502, "写作评估助手连接失败，请稍后重试");
  }
  const result = (await response.json()) as Row;
  if (!response.ok) {
    const detail = isRow(result.error) ? String(result.error.message || "") : "";
    throw new ApiError(502, detail ? `写作评估暂时无法处理：${detail.slice(0, 180)}` : "写作评估助手暂时不可用");
  }
  return result;
}

function responseText(response: Row) {
  if (typeof response.output_text === "string" && response.output_text) return response.output_text;
  if (!Array.isArray(response.output)) return "";
  return (response.output as Row[])
    .flatMap((item) =>
      Array.isArray(item.content)
        ? (item.content as Row[])
            .filter((part) => part?.type === "output_text" && typeof part.text === "string")
            .map((part) => String(part.text))
        : [],
    )
    .join("\n");
}

function isRow(value: unknown): value is Row {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function clean(value: unknown, fallback: string, max: number) {
  const result = String(value ?? "").trim().slice(0, max);
  return result || fallback;
}

function extensionFor(name: string) {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

function safeSegment(value: string) {
  return value.replace(/[^A-Za-z0-9_-]+/g, "-").slice(0, 100) || "member";
}

function safeName(value: string) {
  return (
    value
      .normalize("NFKC")
      .replace(/[^\p{L}\p{N}._-]+/gu, "-")
      .replace(/^[.-]+|[.-]+$/g, "")
      .slice(0, 160) || "writing-sample"
  );
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk)
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

function mimeFor(extension: string) {
  return (
    {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
      pdf: "application/pdf",
      doc: "application/msword",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      txt: "text/plain",
      md: "text/markdown",
    } as Record<string, string>
  )[extension] || "application/octet-stream";
}
