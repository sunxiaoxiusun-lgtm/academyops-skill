import { getD1 } from "@/db";
import { allocateStudentCode } from "@/app/lib/student-code";
import {
  allow,
  apiFailure,
  ApiError,
  requireMember,
  type Member,
} from "@/app/lib/authz";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;
const MAX_IMPORT_RECORDS = 50;
const businessDate = () =>
  new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);

export async function POST(request: Request) {
  try {
    const member = await requireMember();
    allow(member, ["admin", "sales", "operations", "operations_finance"]);
    const payload = (await request.json()) as {
      jobId?: string;
      records?: Row[];
    };
    const jobId = clean(payload.jobId, 60);
    if (
      !jobId ||
      !Array.isArray(payload.records) ||
      !payload.records.length ||
      payload.records.length > MAX_IMPORT_RECORDS
    )
      throw new ApiError(400, "导入草稿不正确");
    const db = getD1();
    const studentScope =
      member.role === "sales"
        ? " AND (s.owner_user_id=? OR s.created_by=?)"
        : "";
    const studentBindings =
      member.role === "sales" ? [member.userId, member.userId] : [];
    const job = await db
      .prepare(
        "SELECT id,created_by,status,source_type FROM ai_import_jobs WHERE id=?",
      )
      .bind(jobId)
      .first<Row>();
    if (!job || (job.created_by !== member.userId && member.role !== "admin"))
      throw new ApiError(404, "识别草稿不存在");
    if (job.status !== "review")
      throw new ApiError(409, "这份识别草稿已处理或不可用");
    if (String(job.source_type).startsWith("student_"))
      return Response.json(
        await importStudents(db, member, jobId, payload.records),
      );

    const [coursesResult, agentsResult, studentsResult] = await Promise.all([
      db.prepare("SELECT id,currency FROM courses WHERE active=1").all<Row>(),
      db
        .prepare(
          "SELECT id,commission_type,commission_value FROM agents WHERE active=1",
        )
        .all<Row>(),
      db
        .prepare(
          `SELECT s.id,s.full_name,s.date_of_birth,s.classin_account,s.owner_user_id,s.created_by,s.source_agent_id,g.phone,g.wechat_name FROM students s LEFT JOIN student_guardians sg ON sg.student_id=s.id AND sg.is_primary=1 LEFT JOIN guardians g ON g.id=sg.guardian_id WHERE s.status='active'${studentScope}`,
        )
        .bind(...studentBindings)
        .all<Row>(),
    ]);
    const courses = new Map(
      coursesResult.results.map((row) => [String(row.id), row]),
    );
    const agents = new Map(
      agentsResult.results.map((row) => [String(row.id), row]),
    );
    const statements: D1PreparedStatement[] = [];
    const enrollmentIds: string[] = [];

    for (let index = 0; index < payload.records.length; index++) {
      const record = payload.records[index];
      const studentName = clean(record.student_full_name, 120);
      const courseId = clean(record.course_id, 60);
      if (!studentName)
        throw new ApiError(400, `第 ${index + 1} 条缺少学员姓名`);
      const course = courses.get(courseId);
      if (!course)
        throw new ApiError(400, `第 ${index + 1} 条尚未匹配有效课程`);
      const registeredAt = businessDate();
      const list = amount(record.list_amount);
      const discount = 0;
      const net = list;
      if (list <= 0)
        throw new ApiError(400, `第 ${index + 1} 条课程原价不正确`);
      const paid = amount(record.payment_amount ?? 0);
      if (paid > net)
        throw new ApiError(400, `第 ${index + 1} 条收款超过应收金额`);
      const phone = clean(record.guardian_phone, 40),
        dob = date(record.date_of_birth),
        classin = clean(record.classin_account, 120);
      const studentId = findStudent(
        studentsResult.results,
        studentName,
        phone,
        dob,
        classin,
      );
      if (!studentId)
        throw new ApiError(
          400,
          `第 ${index + 1} 条未找到学员“${studentName}”的档案，请先创建学员档案后再报名`,
        );
      const student = studentsResult.results.find(
        (row) => String(row.id) === studentId,
      )!;
      if (
        member.role === "sales" &&
        String(student.owner_user_id) !== member.userId &&
        String(student.created_by) !== member.userId
      )
        throw new ApiError(
          403,
          `第 ${index + 1} 条学员不属于当前课程顾问，不能报名`,
        );
      const salesperson = String(student.owner_user_id || member.userId);
      const inheritedAgentId = clean(student.source_agent_id, 60);
      const agentId = agents.has(inheritedAgentId) ? inheritedAgentId : null;

      const enrollmentId = crypto.randomUUID(),
        number = `ENR-${registeredAt.replaceAll("-", "")}-${token(4)}`,
        currency = ["SGD", "CNY"].includes(clean(record.currency, 3))
          ? clean(record.currency, 3)
          : String(course.currency),
        registrationType =
          clean(record.registration_type, 10) === "renewal" ? "renewal" : "new";
      statements.push(
        db
          .prepare(
            "INSERT INTO enrollments (id,number,student_id,course_id,class_group_id,salesperson_user_id,agent_id,registration_type,quantity,list_amount_cents,discount_cents,net_amount_cents,currency,registered_at,start_date,expected_end_date,status,notes,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'active',?,?)",
          )
          .bind(
            enrollmentId,
            number,
            studentId,
            courseId,
            null,
            salesperson,
            agentId,
            registrationType,
            Math.max(1, Math.round(Number(record.quantity) || 1)),
            list,
            discount,
            net,
            currency,
            registeredAt,
            date(record.start_date),
            null,
            clean(record.notes, 2000),
            member.userId,
          ),
      );
      if (agentId) {
        const agent = agents.get(agentId)!;
        const commission =
          agent.commission_type === "percent"
            ? Math.round((net * Number(agent.commission_value)) / 10000)
            : Number(agent.commission_value);
        statements.push(
          db
            .prepare(
              "INSERT INTO commissions (id,enrollment_id,agent_id,basis_cents,rate_bps,amount_cents,status) VALUES (?,?,?,?,?,?,'pending')",
            )
            .bind(
              crypto.randomUUID(),
              enrollmentId,
              agentId,
              net,
              agent.commission_type === "percent" ? agent.commission_value : 0,
              commission,
            ),
        );
      }
      if (paid > 0) {
        const paymentId = crypto.randomUUID(),
          paidAt = date(record.paid_at) ?? registeredAt,
          method = clean(record.payment_method, 50) || "银行转账",
          reference = clean(record.payment_reference, 120);
        statements.push(
          db
            .prepare(
              "INSERT INTO payments (id,enrollment_id,amount_cents,currency,paid_at,method,reference,status,created_by) VALUES (?,?,?,?,?,?,?,'confirmed',?)",
            )
            .bind(
              paymentId,
              enrollmentId,
              paid,
              currency,
              paidAt,
              method,
              reference,
              member.userId,
            ),
          audit(db, member, "create", "payment", paymentId, {
            enrollmentId,
            enrollmentNumber: number,
            amountCents: paid,
            currency,
            paidAt,
            method,
            reference,
            source: "ai_import",
            jobId,
          }),
        );
      }
      statements.push(
        audit(db, member, "create", "enrollment", enrollmentId, {
          number,
          source: "ai_import",
          jobId,
        }),
      );
      enrollmentIds.push(enrollmentId);
    }
    statements.push(
      db
        .prepare(
          "UPDATE ai_import_jobs SET status='imported',imported_ids_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='review'",
        )
        .bind(JSON.stringify(enrollmentIds), jobId),
    );
    await db.batch(statements);
    return Response.json({ imported: enrollmentIds.length, enrollmentIds });
  } catch (error) {
    return apiFailure(error);
  }
}

async function importStudents(
  db: D1Database,
  member: Member,
  jobId: string,
  records: Row[],
) {
  const existing = (
    await db
      .prepare(
        "SELECT s.id,s.code,s.full_name,s.date_of_birth,s.classin_account,g.phone,g.wechat_name FROM students s LEFT JOIN student_guardians sg ON sg.student_id=s.id AND sg.is_primary=1 LEFT JOIN guardians g ON g.id=sg.guardian_id WHERE s.status='active'",
      )
      .all<Row>()
  ).results;
  const [memberRows, agentRows] = await Promise.all([
    db
      .prepare(
        "SELECT user_id FROM members WHERE status='active' AND role IN ('admin','sales','operations','operations_finance')",
      )
      .all<Row>(),
    db.prepare("SELECT id FROM agents WHERE active=1").all<Row>(),
  ]);
  const newIds: string[] = [],
    duplicates: Row[] = [],
    statements: D1PreparedStatement[] = [];
  const validSales = new Set(
      memberRows.results.map((row) => String(row.user_id)),
    ),
    validAgents = new Set(agentRows.results.map((row) => String(row.id)));
  for (let index = 0; index < records.length; index++) {
    const record = records[index],
      name = clean(record.student_full_name, 120),
      grade = clean(record.grade, 60),
      wechat = clean(record.guardian_wechat_name, 120),
      phone = clean(record.guardian_phone, 40),
      dob = null,
      classin = clean(record.classin_account, 120),
      firstRegisteredAt = date(record.first_registered_at);
    if (!name || !grade || !wechat || !firstRegisteredAt)
      throw new ApiError(
        400,
        `第 ${index + 1} 条请补全孩子姓名、年级、家长微信名和首次登记日期`,
      );
    const duplicateId = findStudent(existing, name, phone, dob, classin);
    if (duplicateId) {
      const found = existing.find((row) => String(row.id) === duplicateId);
      duplicates.push({ id: duplicateId, code: found?.code, name });
      continue;
    }
    const salesperson = validSales.has(clean(record.salesperson_user_id, 100))
        ? clean(record.salesperson_user_id, 100)
        : member.userId,
      sourceAgentId = validAgents.has(clean(record.agent_id, 60))
        ? clean(record.agent_id, 60)
        : null,
      studentId = crypto.randomUUID(),
      guardianId = crypto.randomUUID(),
      code = await allocateStudentCode(db);
    statements.push(
      db
        .prepare(
          "INSERT INTO students (id,code,full_name,english_name,date_of_birth,school,grade,classin_account,first_registered_at,status,owner_user_id,source_agent_id,notes,created_by) VALUES (?,?,?,?,?,?,?,?,?,'active',?,?,?,?)",
        )
        .bind(
          studentId,
          code,
          name,
          clean(record.english_name, 120),
          dob,
          clean(record.school, 160),
          grade,
          classin,
          firstRegisteredAt,
          salesperson,
          sourceAgentId,
          clean(record.notes, 2000),
          member.userId,
        ),
      db
        .prepare(
          "INSERT INTO guardians (id,full_name,wechat_name,phone,email,relationship,created_by) VALUES (?,?,?,?,?,?,?)",
        )
        .bind(
          guardianId,
          clean(record.guardian_name, 120) || "待补",
          wechat,
          phone,
          "",
          "家长",
          member.userId,
        ),
      db
        .prepare(
          "INSERT INTO student_guardians (student_id,guardian_id,is_primary) VALUES (?,?,1)",
        )
        .bind(studentId, guardianId),
      audit(db, member, "create", "student", studentId, {
        code,
        source: "ai_student_import",
        jobId,
      }),
    );
    newIds.push(studentId);
    existing.push({
      id: studentId,
      code,
      full_name: name,
      date_of_birth: dob,
      classin_account: classin,
      phone,
      wechat_name: wechat,
    });
  }
  statements.push(
    db
      .prepare(
        "UPDATE ai_import_jobs SET status='imported',imported_ids_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='review'",
      )
      .bind(JSON.stringify(newIds), jobId),
  );
  await db.batch(statements);
  return { imported: newIds.length, studentIds: newIds, duplicates };
}

function findStudent(
  rows: Row[],
  name: string,
  phone: string,
  dob: string | null,
  classin = "",
) {
  const named = rows.filter(
    (row) => String(row.full_name).trim().toLowerCase() === name.toLowerCase(),
  );
  const exact = named.filter(
    (row) =>
      (phone && String(row.phone) === phone) ||
      (dob && String(row.date_of_birth) === dob) ||
      (classin &&
        String(row.classin_account).trim().toLowerCase() ===
          classin.toLowerCase()),
  );
  if (exact.length === 1) return String(exact[0].id);
  if (exact.length > 1)
    throw new ApiError(409, `学员 ${name} 匹配到多个档案，请改为手动登记`);
  if (named.length === 1) return String(named[0].id);
  if (named.length > 1)
    throw new ApiError(409, `学员 ${name} 存在同名档案，请补充家长电话或生日`);
  return "";
}
function clean(value: unknown, max: number) {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}
function date(value: unknown) {
  const v = clean(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}
function amount(value: unknown) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n < 0 || n > 999999999)
    throw new ApiError(400, "金额不正确");
  return Math.round(n * 100);
}
function token(length: number) {
  return crypto.randomUUID().replaceAll("-", "").slice(0, length).toUpperCase();
}
function audit(
  db: D1Database,
  member: Member,
  action: string,
  entityType: string,
  entityId: string,
  detail: unknown,
) {
  return db
    .prepare(
      "INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,detail_json) VALUES (?,?,?,?,?,?)",
    )
    .bind(
      crypto.randomUUID(),
      member.userId,
      action,
      entityType,
      entityId,
      JSON.stringify(detail),
    );
}
