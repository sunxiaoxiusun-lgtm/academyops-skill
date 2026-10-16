import platformConfig from "@/platform.config.json";
import { getBucket, getD1 } from "@/db";
import { allocateStudentCode } from "@/app/lib/student-code";
import { normalizeSpecificSchedule } from "@/app/lib/class-schedule";
import { resolveEnrollmentEndDate } from "@/app/lib/enrollment-dates";
import {
  allow,
  apiFailure,
  ApiError,
  requireMember,
  type Member,
} from "@/app/lib/authz";

export const dynamic = "force-dynamic";

const text = (value: unknown, max = 500) =>
  String(value ?? "")
    .trim()
    .slice(0, max);
const cents = (value: unknown) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 999999999)
    throw new ApiError(400, "金额不正确");
  return Math.round(n * 100);
};
const isoDate = (value: unknown, required = false) => {
  const v = text(value, 10);
  if (!v && !required) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new ApiError(400, "日期格式不正确");
  return v;
};
const weeklyDates = (startDate: string, lessonCount: number) => {
  const first = new Date(`${startDate}T00:00:00Z`);
  return Array.from({ length: lessonCount }, (_, index) => {
    const date = new Date(first);
    date.setUTCDate(first.getUTCDate() + index * 7);
    return date.toISOString().slice(0, 10);
  });
};
const scheduleDateCount = (value: string) =>
  (value.match(/\d{4}-\d{2}-\d{2}/g) ?? []).length;
const compactId = () =>
  crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
const businessDate = () =>
  new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
const datePrefix = () =>
  new Date().toISOString().slice(0, 10).replaceAll("-", "");
const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024;
const screenshotExtensions = new Set(["jpg", "jpeg", "png", "webp", "pdf"]);
const courseCategories = new Set([
  "Great Writing写作",
  "Creative Writing创意写作",
  "RE",
  "Literature阅读",
  "新加坡小学课程",
  "新加坡中学课程",
  "试听课",
  "其他课程",
]);
const teacherNames = new Set<string>(platformConfig.teachers);
const courseCategory = (value: unknown) => {
  const category = text(value, 20);
  return courseCategories.has(category) ? category : "其他课程";
};
const safeFileName = (value: string) =>
  value
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160) || "registration-proof";
const canAccessStudent = (
  member: Member,
  row: Record<string, unknown>,
) =>
  member.role !== "sales" ||
  row.owner_user_id === member.userId ||
  row.created_by === member.userId;
const canAccessEnrollment = (
  member: Member,
  row: Record<string, unknown>,
) =>
  member.role !== "sales" ||
  row.salesperson_user_id === member.userId ||
  row.created_by === member.userId;

async function requireCourseEditor(member: Member, courseId: string) {
  const course = await getD1()
    .prepare("SELECT id,created_by FROM courses WHERE id=? AND active=1")
    .bind(courseId)
    .first<Record<string, string>>();
  if (!course) throw new ApiError(404, "课程不存在或已删除");
  if (member.role !== "admin" && course.created_by !== member.userId)
    throw new ApiError(403, "只有课程创建者可以修改或删除课程内容");
}

async function requireClassGroupEditor(member: Member, classGroupId: string) {
  const classGroup = await getD1()
    .prepare("SELECT id,created_by FROM class_groups WHERE id=?")
    .bind(classGroupId)
    .first<Record<string, string>>();
  if (!classGroup) throw new ApiError(404, "班级不存在或已删除");
  if (member.role !== "admin" && classGroup.created_by !== member.userId)
    throw new ApiError(403, "只有班级创建者可以修改、结课或删除班级内容");
}

export async function GET(request: Request) {
  try {
    const member = await requireMember();
    const url = new URL(request.url);
    const view = url.searchParams.get("view") ?? "dashboard";
    if (member.role === "pending")
      return Response.json({ member, pending: true });
    const viewRoles: Record<string, Member["role"][]> = {
      dashboard: [
        "admin",
        "finance",
        "sales",
        "operations",
        "operations_finance",
      ],
      students: ["admin", "sales", "operations", "operations_finance"],
      student_detail: ["admin", "sales", "operations", "operations_finance"],
      enrollments: [
        "admin",
        "finance",
        "sales",
        "operations",
        "operations_finance",
      ],
      payments: ["admin", "finance", "sales", "operations_finance"],
      followups: ["admin", "sales", "operations", "operations_finance"],
      classes: ["admin", "sales", "operations", "operations_finance"],
      agents: ["admin", "finance", "operations_finance"],
      invoices: ["admin", "finance", "sales", "operations_finance"],
      settings: ["admin", "sales", "operations", "operations_finance"],
      audit: ["admin"],
      writingAssessment: [
        "admin",
        "finance",
        "sales",
        "operations",
        "operations_finance",
      ],
      catalog: [
        "admin",
        "finance",
        "sales",
        "operations",
        "operations_finance",
      ],
    };
    if (!viewRoles[view]?.includes(member.role))
      throw new ApiError(403, "你没有查看此页面的权限");
    if (view === "dashboard") return Response.json(await dashboard(member));
    if (view === "students") {
      return Response.json({
        member,
        students: await listStudents(member),
      });
    }
    if (view === "student_detail")
      return Response.json({
        member,
        ...(await studentDetail(member, text(url.searchParams.get("id"), 60))),
      });
    if (view === "enrollments")
      return Response.json({
        member,
        enrollments: await listEnrollments(member),
      });
    if (view === "payments")
      return Response.json({ member, payments: await listPayments(member) });
    if (view === "followups")
      return Response.json({
        member,
        followups: await listFollowups(member),
        due: await dueEnrollments(member),
      });
    if (view === "classes")
      return Response.json({ member, ...(await listClassGroups(member)) });
    if (view === "agents")
      return Response.json({ member, agents: await listAgents() });
    if (view === "settings")
      return Response.json({
        member,
        courses: await listCourses(member),
        team: await listTeam(member),
      });
    if (view === "catalog")
      return Response.json({
        member,
        courses: await listCourses(member),
        classes: await listClassOptions(member),
        agents: await listAgentOptions(),
        team: await listTeamDirectory(),
      });
    if (view === "invoices")
      return Response.json({ member, invoices: await listInvoices(member) });
    if (view === "audit")
      return Response.json({ member, auditLogs: await listAuditLogs() });
    if (view === "writingAssessment") return Response.json({ member });
    throw new ApiError(404, "页面不存在");
  } catch (error) {
    return apiFailure(error);
  }
}

export async function POST(request: Request) {
  let mutationAction = "unknown";
  let mutationUser = "unknown";
  let mutationRole = "unknown";
  try {
    const member = await requireMember();
    mutationUser = member.userId;
    mutationRole = member.role;
    if (member.role === "pending")
      throw new ApiError(403, "等待管理员分配权限");
    const isMultipart = request.headers
      .get("content-type")
      ?.includes("multipart/form-data");
    const formData = isMultipart ? await request.formData() : null;
    const payload = formData
      ? ({
          ...Object.fromEntries(formData.entries()),
          registrationScreenshots: formData.getAll("registrationScreenshots"),
          keepScreenshotIds: formData.getAll("keepScreenshotIds"),
          refundProof: formData.get("refundProof"),
        } as Record<string, unknown>)
      : ((await request.json()) as Record<string, unknown>);
    const action = text(payload.action, 50);
    mutationAction = action || "missing";
    if (action === "create_student")
      return Response.json(await createStudent(member, payload), {
        status: 201,
      });
    if (action === "update_student")
      return Response.json(await updateStudent(member, payload));
    if (action === "delete_student")
      return Response.json(await deleteStudent(member, payload));
    if (action === "delete_students")
      return Response.json(await deleteStudents(member, payload));
    if (action === "create_course")
      return Response.json(await createCourse(member, payload), {
        status: 201,
      });
    if (action === "update_course")
      return Response.json(await updateCourse(member, payload));
    if (action === "delete_course")
      return Response.json(await deleteCourse(member, payload));
    if (action === "create_class_group")
      return Response.json(await createClassGroup(member, payload), {
        status: 201,
      });
    if (action === "update_class_group")
      return Response.json(await updateClassGroup(member, payload));
    if (action === "delete_class_group")
      return Response.json(await deleteClassGroup(member, payload));
    if (action === "assign_enrollment_class")
      return Response.json(await assignEnrollmentClass(member, payload));
    if (action === "remove_enrollment_class")
      return Response.json(await removeEnrollmentClass(member, payload));
    if (action === "complete_class_group")
      return Response.json(await completeClassGroup(member, payload));
    if (action === "mark_roster_exported")
      return Response.json(await markRosterExported(member, payload));
    if (action === "create_agent")
      return Response.json(await createAgent(member, payload), { status: 201 });
    if (action === "create_enrollment")
      return Response.json(await createEnrollment(member, payload), {
        status: 201,
      });
    if (action === "update_enrollment")
      return Response.json(await updateEnrollment(member, payload));
    if (action === "delete_enrollment")
      return Response.json(await deleteEnrollment(member, payload));
    if (action === "record_payment")
      return Response.json(await recordPayment(member, payload), {
        status: 201,
      });
    if (action === "create_refund")
      return Response.json(await createRefund(member, payload), { status: 201 });
    if (action === "update_refund")
      return Response.json(await updateRefund(member, payload));
    if (action === "cancel_refund")
      return Response.json(await cancelRefund(member, payload));
    if (action === "delete_refund")
      return Response.json(await deleteRefund(member, payload));
    if (action === "create_followup")
      return Response.json(await createFollowup(member, payload), {
        status: 201,
      });
    if (action === "finish_course")
      return Response.json(await finishCourse(member, payload));
    if (action === "create_member")
      return Response.json(await createMember(member, payload), {
        status: 201,
      });
    if (action === "update_member")
      return Response.json(await updateMember(member, payload));
    if (action === "transfer_member_customers")
      return Response.json(await transferMemberCustomers(member, payload));
    if (action === "delete_member")
      return Response.json(await deleteMember(member, payload));
    if (action === "invoice_draft")
      return Response.json(await invoiceDraft(member, payload));
    if (action === "create_invoice")
      return Response.json(await createInvoice(member, payload), {
        status: 201,
      });
    if (action === "create_agent_statement")
      return Response.json(await createAgentStatement(member, payload), {
        status: 201,
      });
    throw new ApiError(404, "操作不存在");
  } catch (error) {
    console.warn(
      JSON.stringify({
        event: "workbench_mutation_failed",
        action: mutationAction,
        userId: mutationUser,
        role: mutationRole,
        status: error instanceof ApiError ? error.status : 500,
        message: error instanceof Error ? error.message : "unknown error",
      }),
    );
    return apiFailure(error);
  }
}

async function dashboard(member: Member) {
  const db = getD1();
  const scope =
    member.role === "sales"
      ? " AND (e.salesperson_user_id = ? OR e.created_by = ?)"
      : "";
  const binding =
    member.role === "sales" ? [member.userId, member.userId] : [];
  const month = new Date().toISOString().slice(0, 7);
  const [paidMonth, enrollmentTotal, netRows, paidRows] = await Promise.all([
    db
      .prepare(
        `SELECT p.currency,COALESCE(SUM(p.amount_cents),0) total FROM payments p JOIN enrollments e ON e.id=p.enrollment_id WHERE p.status='confirmed' AND substr(p.paid_at,1,7)=?${scope} GROUP BY p.currency`,
      )
      .bind(month, ...binding)
      .all<Record<string, unknown>>(),
    db
      .prepare(
        `SELECT COUNT(*) total FROM enrollments e WHERE e.status!='void' AND substr(e.registered_at,1,7)=?${scope}`,
      )
      .bind(month, ...binding)
      .first<{ total: number }>(),
    db
      .prepare(
        `SELECT e.currency,COALESCE(SUM(e.net_amount_cents),0) total FROM enrollments e WHERE e.status!='void'${scope} GROUP BY e.currency`,
      )
      .bind(...binding)
      .all<Record<string, unknown>>(),
    db
      .prepare(
        `SELECT p.currency,COALESCE(SUM(p.amount_cents),0) total FROM payments p JOIN enrollments e ON e.id=p.enrollment_id WHERE p.status='confirmed'${scope} GROUP BY p.currency`,
      )
      .bind(...binding)
      .all<Record<string, unknown>>(),
  ]);
  const paidAll = new Map(
    paidRows.results.map((row) => [String(row.currency), Number(row.total)]),
  );
  const balanceByCurrency = netRows.results.map((row) => ({
    currency: String(row.currency),
    total: Math.max(
      0,
      Number(row.total) - Number(paidAll.get(String(row.currency)) ?? 0),
    ),
  }));
  const due = await db
    .prepare(
      `SELECT COUNT(*) total FROM enrollments e WHERE e.status='active' AND e.expected_end_date IS NOT NULL AND e.expected_end_date BETWEEN date('now') AND date('now','+30 day')${scope}`,
    )
    .bind(...binding)
    .first<{ total: number }>();
  return {
    member,
    metrics: {
      paidMonthByCurrency: paidMonth.results.map((row) => ({
        currency: String(row.currency),
        total: Number(row.total),
      })),
      enrollmentsMonth: Number(enrollmentTotal?.total ?? 0),
      balanceByCurrency,
      dueSoon: Number(due?.total ?? 0),
    },
    recent: (await listEnrollments(member)).slice(0, 8),
    due: await dueEnrollments(member),
  };
}

async function listStudents(member: Member) {
  const db = getD1();
  const sql = `SELECT s.*, g.full_name guardian_name, g.wechat_name guardian_wechat_name, g.phone guardian_phone, g.email guardian_email,g.relationship guardian_relationship,m.display_name owner_name,CASE WHEN s.source_kind='parent_referral' THEN '家长转介绍' ELSE sa.name END source_agent_name,
    (SELECT COUNT(*) FROM enrollments e WHERE e.student_id=s.id AND e.status!='void'${member.role === "sales" ? " AND (e.salesperson_user_id=? OR e.created_by=?)" : ""}) enrollment_count,
    (SELECT followed_at FROM student_followups f WHERE f.student_id=s.id ORDER BY followed_at DESC,created_at DESC LIMIT 1) last_followed_at,
    (SELECT note FROM student_followups f WHERE f.student_id=s.id ORDER BY followed_at DESC,created_at DESC LIMIT 1) last_followup_note,
    (SELECT next_follow_up_at FROM student_followups f WHERE f.student_id=s.id ORDER BY followed_at DESC,created_at DESC LIMIT 1) next_follow_up_at
    FROM students s LEFT JOIN student_guardians sg ON sg.student_id=s.id AND sg.is_primary=1 LEFT JOIN guardians g ON g.id=sg.guardian_id LEFT JOIN members m ON m.user_id=s.owner_user_id LEFT JOIN agents sa ON sa.id=s.source_agent_id
    ${member.role === "sales" ? "WHERE (s.owner_user_id=? OR s.created_by=?)" : ""} ORDER BY s.updated_at DESC LIMIT 500`;
  const query = db.prepare(sql);
  return (
    member.role === "sales"
      ? query.bind(member.userId, member.userId, member.userId, member.userId)
      : query
  )
    .all()
    .then((r) => r.results);
}

async function studentDetail(member: Member, id: string) {
  if (!id) throw new ApiError(400, "请选择学员");
  const db = getD1();
  const student = await db
    .prepare(
      `SELECT s.*,g.full_name guardian_name,g.wechat_name guardian_wechat_name,g.phone guardian_phone,g.email guardian_email,g.relationship guardian_relationship,m.display_name owner_name,CASE WHEN s.source_kind='parent_referral' THEN '家长转介绍' ELSE sa.name END source_agent_name
      FROM students s LEFT JOIN student_guardians sg ON sg.student_id=s.id AND sg.is_primary=1 LEFT JOIN guardians g ON g.id=sg.guardian_id LEFT JOIN members m ON m.user_id=s.owner_user_id LEFT JOIN agents sa ON sa.id=s.source_agent_id WHERE s.id=?`,
    )
    .bind(id)
    .first<Record<string, unknown>>();
  if (!student) throw new ApiError(404, "学员档案不存在");
  if (!canAccessStudent(member, student))
    throw new ApiError(403, "你不能查看其他课程顾问负责的学员详情");
  const enrollments = await db
    .prepare(
      `SELECT e.*,c.name course_name,a.name agent_name,m.display_name salesperson_name,
      (SELECT end_date FROM class_groups WHERE id=e.class_group_id) class_group_end_date,
      COALESCE(SUM(CASE WHEN p.status='confirmed' THEN p.amount_cents ELSE 0 END),0) paid_cents,
      COALESCE((SELECT SUM(r.amount_cents) FROM refunds r WHERE r.enrollment_id=e.id AND r.status='confirmed'),0) refunded_cents,
      COALESCE((SELECT json_group_array(json_object('id',r.id,'amount_cents',r.amount_cents,'currency',r.currency,'requested_at',r.requested_at,'refunded_at',r.refunded_at,'last_lesson_date',r.last_lesson_date,'method',r.method,'reference',r.reference,'reason',r.reason,'status',r.status,'proof_file_name',r.proof_file_name)) FROM refunds r WHERE r.enrollment_id=e.id ORDER BY r.created_at),'[]') refunds_json,
      COALESCE((SELECT json_group_array(json_object('id',es.id,'name',es.file_name)) FROM enrollment_screenshots es WHERE es.enrollment_id=e.id),'[]') registration_screenshots_json,
      (SELECT p0.paid_at FROM payments p0 WHERE p0.enrollment_id=e.id AND p0.status='confirmed' ORDER BY p0.created_at,p0.id LIMIT 1) payment_paid_at,
      (SELECT p0.method FROM payments p0 WHERE p0.enrollment_id=e.id AND p0.status='confirmed' ORDER BY p0.created_at,p0.id LIMIT 1) payment_method,
      (SELECT p0.reference FROM payments p0 WHERE p0.enrollment_id=e.id AND p0.status='confirmed' ORDER BY p0.created_at,p0.id LIMIT 1) payment_reference,
      (SELECT COUNT(*) FROM payments p0 WHERE p0.enrollment_id=e.id AND p0.status='confirmed') payment_count,
      trim(
        COALESCE((SELECT cg.name FROM class_groups cg WHERE cg.id=e.class_group_id),'') ||
        CASE WHEN e.class_group_id IS NOT NULL AND EXISTS (SELECT 1 FROM enrollment_class_memberships ecm WHERE ecm.enrollment_id=e.id AND ecm.status IN ('active','completed')) THEN '、' ELSE '' END ||
        COALESCE((SELECT group_concat(cg.name,'、') FROM enrollment_class_memberships ecm JOIN class_groups cg ON cg.id=ecm.class_group_id WHERE ecm.enrollment_id=e.id AND ecm.status IN ('active','completed') AND (e.class_group_id IS NULL OR ecm.class_group_id!=e.class_group_id)),'')
      ,'、') class_group_names
      FROM enrollments e JOIN courses c ON c.id=e.course_id LEFT JOIN agents a ON a.id=e.agent_id LEFT JOIN members m ON m.user_id=e.salesperson_user_id LEFT JOIN payments p ON p.enrollment_id=e.id
      WHERE e.student_id=?${member.role === "sales" ? " AND (e.salesperson_user_id=? OR e.created_by=?)" : ""} GROUP BY e.id ORDER BY e.registered_at DESC,e.created_at DESC`,
    )
    .bind(...(member.role === "sales" ? [id, member.userId, member.userId] : [id]))
    .all();
  const followups = await db
    .prepare(
      `SELECT f.*,m.display_name salesperson_name
       FROM student_followups f
       LEFT JOIN members m ON m.user_id=f.salesperson_user_id
       WHERE f.student_id=?
       ORDER BY f.followed_at DESC,f.created_at DESC
       LIMIT 100`,
    )
    .bind(id)
    .all();
  return {
    student,
    enrollments: enrollments.results,
    followups: followups.results,
  };
}

async function listEnrollments(member: Member) {
  const db = getD1();
  const sql = `SELECT e.*, s.full_name student_name, s.code student_code,g.wechat_name guardian_wechat_name,c.name course_name, cg.name class_group_name,cg.end_date class_group_end_date,cg.classin_class_name,cg.teacher_name,cg.class_time,cg.schedule_type,cg.specific_dates,cg.status class_group_status,a.name agent_name, m.display_name salesperson_name,
    COALESCE((SELECT json_group_array(json_object('id',es.id,'name',es.file_name)) FROM enrollment_screenshots es WHERE es.enrollment_id=e.id),'[]') registration_screenshots_json,
    (SELECT p0.id FROM payments p0 WHERE p0.enrollment_id=e.id AND p0.status='confirmed' ORDER BY p0.created_at,p0.id LIMIT 1) editable_payment_id,
    (SELECT p0.paid_at FROM payments p0 WHERE p0.enrollment_id=e.id AND p0.status='confirmed' ORDER BY p0.created_at,p0.id LIMIT 1) payment_paid_at,
    (SELECT p0.method FROM payments p0 WHERE p0.enrollment_id=e.id AND p0.status='confirmed' ORDER BY p0.created_at,p0.id LIMIT 1) payment_method,
    (SELECT p0.reference FROM payments p0 WHERE p0.enrollment_id=e.id AND p0.status='confirmed' ORDER BY p0.created_at,p0.id LIMIT 1) payment_reference,
    (SELECT COUNT(*) FROM payments p0 WHERE p0.enrollment_id=e.id AND p0.status='confirmed') payment_count,
    COALESCE((SELECT SUM(r.amount_cents) FROM refunds r WHERE r.enrollment_id=e.id AND r.status='confirmed'),0) refunded_cents,
    COALESCE((SELECT json_group_array(json_object('id',r.id,'amount_cents',r.amount_cents,'currency',r.currency,'requested_at',r.requested_at,'refunded_at',r.refunded_at,'last_lesson_date',r.last_lesson_date,'method',r.method,'reference',r.reference,'reason',r.reason,'status',r.status,'proof_file_name',r.proof_file_name)) FROM refunds r WHERE r.enrollment_id=e.id ORDER BY r.created_at),'[]') refunds_json,
    COALESCE(SUM(CASE WHEN p.status='confirmed' THEN p.amount_cents ELSE 0 END),0) paid_cents
    FROM enrollments e JOIN students s ON s.id=e.student_id LEFT JOIN student_guardians sg ON sg.student_id=s.id AND sg.is_primary=1 LEFT JOIN guardians g ON g.id=sg.guardian_id JOIN courses c ON c.id=e.course_id LEFT JOIN class_groups cg ON cg.id=e.class_group_id LEFT JOIN agents a ON a.id=e.agent_id LEFT JOIN members m ON m.user_id=e.salesperson_user_id LEFT JOIN payments p ON p.enrollment_id=e.id
    ${member.role === "sales" ? "WHERE (e.salesperson_user_id=? OR e.created_by=?)" : ""} GROUP BY e.id ORDER BY e.registered_at DESC, e.created_at DESC LIMIT 500`;
  const query = db.prepare(sql);
  return (member.role === "sales" ? query.bind(member.userId, member.userId) : query)
    .all()
    .then((r) => r.results);
}

async function listPayments(member: Member) {
  const db = getD1();
  const scope = member.role === "sales" ? "WHERE (e.salesperson_user_id=? OR e.created_by=?)" : "";
  const query = db.prepare(
    `SELECT p.*, e.number enrollment_number, e.salesperson_user_id, e.agent_id, e.registration_type, m.display_name salesperson_name, a.name agent_name, s.full_name student_name,g.wechat_name guardian_wechat_name,c.name course_name FROM payments p JOIN enrollments e ON e.id=p.enrollment_id JOIN students s ON s.id=e.student_id LEFT JOIN student_guardians sg ON sg.student_id=s.id AND sg.is_primary=1 LEFT JOIN guardians g ON g.id=sg.guardian_id JOIN courses c ON c.id=e.course_id LEFT JOIN members m ON m.user_id=e.salesperson_user_id LEFT JOIN agents a ON a.id=e.agent_id ${scope} ORDER BY p.paid_at DESC, p.created_at DESC LIMIT 500`,
  );
  return (member.role === "sales" ? query.bind(member.userId, member.userId) : query)
    .all()
    .then((r) => r.results);
}

async function listFollowups(member: Member) {
  const scope = member.role === "sales" ? "WHERE (f.salesperson_user_id=? OR f.created_by=?)" : "";
  const query = getD1().prepare(
    `SELECT f.*,s.code student_code,s.full_name student_name,s.grade,s.classin_account,g.wechat_name guardian_wechat_name,m.display_name salesperson_name FROM student_followups f JOIN students s ON s.id=f.student_id LEFT JOIN student_guardians sg ON sg.student_id=s.id AND sg.is_primary=1 LEFT JOIN guardians g ON g.id=sg.guardian_id LEFT JOIN members m ON m.user_id=f.salesperson_user_id ${scope} ORDER BY f.followed_at DESC,f.created_at DESC LIMIT 1000`,
  );
  return (member.role === "sales" ? query.bind(member.userId, member.userId) : query)
    .all()
    .then((r) => r.results);
}

async function listCourses(member: Member) {
  return getD1().prepare(
    `SELECT c.*,COALESCE(m.display_name,'未知员工') creator_name
     FROM courses c LEFT JOIN members m ON m.user_id=c.created_by
     WHERE c.active=1 ORDER BY c.name`,
  ).all().then((r) => r.results);
}
async function listClassOptions(member: Member) {
  return getD1().prepare(
    `SELECT cg.id,cg.course_id,cg.name,cg.classin_class_name,cg.teacher_name,cg.start_date,cg.end_date,cg.schedule_type,cg.class_time,cg.specific_dates,cg.created_by,c.name course_name
     FROM class_groups cg JOIN courses c ON c.id=cg.course_id
     WHERE cg.status='active' ORDER BY c.name,cg.start_date,cg.name`,
  ).all().then((r) => r.results);
}
async function listClassGroups(member: Member) {
  const db = getD1();
  const classesQuery = db.prepare(
    `SELECT cg.*,c.name course_name,COALESCE(m.display_name,'未知员工') creator_name
      FROM class_groups cg JOIN courses c ON c.id=cg.course_id LEFT JOIN members m ON m.user_id=cg.created_by
      ORDER BY CASE cg.status WHEN 'active' THEN 0 ELSE 1 END,c.name,cg.start_date,cg.name`,
  );
  const rosterQuery = db.prepare(
    `WITH class_links AS (
        SELECT e.id enrollment_id,NULL student_id,e.class_group_id,NULL membership_id,NULL student_membership_id,e.roster_exported_at,'active' membership_status,e.created_at joined_at,NULL removed_at FROM enrollments e WHERE e.class_group_id IS NOT NULL
        UNION ALL
        SELECT m.enrollment_id,NULL student_id,m.class_group_id,m.id membership_id,NULL student_membership_id,m.roster_exported_at,m.status membership_status,m.joined_at,m.removed_at FROM enrollment_class_memberships m
        WHERE m.status='removed' OR NOT EXISTS (SELECT 1 FROM enrollments e WHERE e.id=m.enrollment_id AND e.class_group_id=m.class_group_id)
        UNION ALL
        SELECT NULL enrollment_id,m.student_id,m.class_group_id,NULL membership_id,m.id student_membership_id,m.roster_exported_at,m.status membership_status,m.joined_at,m.removed_at FROM student_class_memberships m
        WHERE m.status='removed' OR (NOT EXISTS (
          SELECT 1 FROM enrollments e WHERE e.student_id=m.student_id AND e.class_group_id=m.class_group_id AND e.status='active'
        ) AND NOT EXISTS (
          SELECT 1 FROM enrollment_class_memberships em JOIN enrollments e ON e.id=em.enrollment_id
          WHERE e.student_id=m.student_id AND em.class_group_id=m.class_group_id AND em.status='active' AND e.status='active'
        ))
      )
      SELECT e.id enrollment_id,e.number,e.course_id,COALESCE(e.registered_at,s.first_registered_at) registered_at,e.start_date enrollment_start_date,e.expected_end_date enrollment_end_date,cl.roster_exported_at,cl.class_group_id,cl.membership_id,cl.student_membership_id,cl.membership_status,cl.joined_at,cl.removed_at,s.id student_id,s.code student_code,s.full_name student_name,s.classin_account,s.grade,g.wechat_name guardian_wechat_name,cg.name class_group_name,cg.classin_class_name,cg.teacher_name,cg.start_date class_start_date,cg.end_date class_end_date,cg.status class_group_status,cg.schedule_type,cg.class_time,cg.specific_dates,COALESCE(c.name,'未登记报名') course_name,COALESCE(c.name,'未登记报名') enrollment_course_name,cc.name class_course_name
      FROM class_links cl LEFT JOIN enrollments e ON e.id=cl.enrollment_id JOIN students s ON s.id=COALESCE(e.student_id,cl.student_id) LEFT JOIN student_guardians sg ON sg.student_id=s.id AND sg.is_primary=1 LEFT JOIN guardians g ON g.id=sg.guardian_id JOIN class_groups cg ON cg.id=cl.class_group_id LEFT JOIN courses c ON c.id=e.course_id JOIN courses cc ON cc.id=cg.course_id
      WHERE (e.id IS NULL OR e.status!='void') AND s.status='active' ORDER BY cc.name,cg.name,COALESCE(e.registered_at,s.first_registered_at),s.full_name`,
  );
  const [classes, roster, unassigned, assignable] = await Promise.all([
    classesQuery.all(),
    rosterQuery.all(),
    db
      .prepare(
        `SELECT e.id enrollment_id,e.number,e.course_id,e.registered_at,s.id student_id,s.full_name student_name,g.wechat_name guardian_wechat_name,s.classin_account,c.name course_name
      FROM enrollments e JOIN students s ON s.id=e.student_id LEFT JOIN student_guardians sg ON sg.student_id=s.id AND sg.is_primary=1 LEFT JOIN guardians g ON g.id=sg.guardian_id JOIN courses c ON c.id=e.course_id
      WHERE e.status='active' AND NOT EXISTS (
        SELECT 1 FROM class_groups cg WHERE cg.id=e.class_group_id AND cg.status='active'
      ) AND NOT EXISTS (
        SELECT 1 FROM enrollment_class_memberships m JOIN class_groups cg ON cg.id=m.class_group_id
        WHERE m.enrollment_id=e.id AND m.status='active' AND cg.status='active'
      ) ORDER BY e.registered_at DESC`,
      )
      .all(),
    db
      .prepare(
        `SELECT e.id enrollment_id,e.number,e.course_id,e.registered_at,s.id student_id,s.code student_code,s.full_name student_name,g.wechat_name guardian_wechat_name,s.classin_account,c.name course_name
      FROM enrollments e JOIN students s ON s.id=e.student_id LEFT JOIN student_guardians sg ON sg.student_id=s.id AND sg.is_primary=1 LEFT JOIN guardians g ON g.id=sg.guardian_id JOIN courses c ON c.id=e.course_id
      WHERE e.status='active'
      UNION ALL
      SELECT NULL enrollment_id,NULL number,NULL course_id,s.first_registered_at registered_at,s.id student_id,s.code student_code,s.full_name student_name,g.wechat_name guardian_wechat_name,s.classin_account,NULL course_name
      FROM students s LEFT JOIN student_guardians sg ON sg.student_id=s.id AND sg.is_primary=1 LEFT JOIN guardians g ON g.id=sg.guardian_id
      WHERE s.status='active' AND NOT EXISTS (SELECT 1 FROM enrollments e WHERE e.student_id=s.id AND e.status='active')
      ORDER BY student_name,course_name,registered_at`,
      )
      .all(),
  ]);
  const counts = new Map<string, { active: number; fresh: number }>();
  for (const row of roster.results as Record<string, unknown>[]) {
    const id = String(row.class_group_id);
    const value = counts.get(id) ?? { active: 0, fresh: 0 };
    if (row.membership_status !== "removed" && row.class_group_status === "active") {
      value.active += 1;
      if (!row.roster_exported_at) value.fresh += 1;
    }
    counts.set(id, value);
  }
  return {
    classes: (classes.results as Record<string, unknown>[]).map((row) => ({
      ...row,
      active_student_count: counts.get(String(row.id))?.active ?? 0,
      new_student_count: counts.get(String(row.id))?.fresh ?? 0,
    })),
    roster: roster.results,
    unassigned: unassigned.results,
    assignable: assignable.results,
    classOptions: await listClassOptions(member),
    courses: await listCourses(member),
  };
}
async function listAgents() {
  const db = getD1();
  const [agents, totals] = await Promise.all([
    db.prepare(
      `SELECT a.*,
  COUNT(c.id) commission_count,
  COALESCE(SUM(CASE WHEN c.status='pending' THEN c.amount_cents ELSE 0 END),0) pending_commission_cents
  FROM agents a LEFT JOIN commissions c ON c.agent_id=a.id
  WHERE a.active=1 GROUP BY a.id ORDER BY a.name`).all<Record<string, unknown>>(),
    db.prepare(
      `SELECT c.agent_id,e.currency,SUM(c.amount_cents) amount_cents
       FROM commissions c JOIN enrollments e ON e.id=c.enrollment_id
       WHERE c.status='pending'
       GROUP BY c.agent_id,e.currency ORDER BY e.currency`,
    ).all<Record<string, unknown>>(),
  ]);
  return agents.results.map((agent) => ({
    ...agent,
    pending_commission_by_currency: JSON.stringify(
      totals.results.filter((row) => row.agent_id === agent.id).map((row) => ({
        currency: row.currency,
        amount_cents: Number(row.amount_cents || 0),
      })),
    ),
  }));
}
async function listAgentOptions() {
  return getD1()
    .prepare("SELECT id,name FROM agents WHERE active=1 ORDER BY name")
    .all()
    .then((r) => r.results);
}
async function listTeam(member: Member) {
  if (member.role !== "admin") return [];
  return getD1()
    .prepare(
      `SELECT m.id,m.user_id,m.email,m.display_name,m.role,m.status,m.created_at,
  (SELECT COUNT(*) FROM students s WHERE s.owner_user_id=m.user_id) customer_count
  FROM members m WHERE m.status!='deleted' ORDER BY m.created_at`,
    )
    .all()
    .then((r) => r.results);
}
async function listTeamDirectory() {
  return getD1()
    .prepare(
      "SELECT user_id,display_name,role,status FROM members WHERE status='active' AND role IN ('admin','sales','operations','operations_finance') ORDER BY display_name",
    )
    .all()
    .then((r) => r.results);
}
async function listInvoices(member: Member) {
  const scope = member.role === "sales" ? " AND (e.salesperson_user_id=? OR e.created_by=?)" : "";
  const q = getD1().prepare(
    `SELECT i.*, s.full_name student_name,g.wechat_name guardian_wechat_name,c.name course_name,a.name agent_name FROM invoices i LEFT JOIN enrollments e ON e.id=i.enrollment_id LEFT JOIN students s ON s.id=e.student_id LEFT JOIN student_guardians sg ON sg.student_id=s.id AND sg.is_primary=1 LEFT JOIN guardians g ON g.id=sg.guardian_id LEFT JOIN courses c ON c.id=e.course_id LEFT JOIN agents a ON a.id=i.agent_id WHERE 1=1${scope} ORDER BY i.created_at DESC LIMIT 500`,
  );
  return (member.role === "sales" ? q.bind(member.userId, member.userId) : q)
    .all()
    .then((r) => r.results);
}
async function listAuditLogs() {
  return getD1()
    .prepare(
      `SELECT l.id,l.user_id,l.action,l.entity_type,l.entity_id,l.detail_json,l.created_at,
       COALESCE(m.display_name,'未知账号') actor_name,COALESCE(m.email,'') actor_email
       FROM audit_logs l LEFT JOIN members m ON m.user_id=l.user_id
       ORDER BY l.created_at DESC LIMIT 1000`,
    )
    .all()
    .then((r) => r.results);
}
async function dueEnrollments(member: Member) {
  const scope = member.role === "sales" ? " AND (e.salesperson_user_id=? OR e.created_by=?)" : "";
  const q = getD1().prepare(
    `SELECT e.id,e.student_id,e.number,e.expected_end_date,s.full_name student_name,g.wechat_name guardian_wechat_name,c.name course_name FROM enrollments e JOIN students s ON s.id=e.student_id LEFT JOIN student_guardians sg ON sg.student_id=s.id AND sg.is_primary=1 LEFT JOIN guardians g ON g.id=sg.guardian_id JOIN courses c ON c.id=e.course_id WHERE e.status='active' AND e.expected_end_date BETWEEN date('now') AND date('now','+30 day')${scope} ORDER BY e.expected_end_date LIMIT 20`,
  );
  return (member.role === "sales" ? q.bind(member.userId, member.userId) : q)
    .all()
    .then((r) => r.results);
}

async function createStudent(member: Member, p: Record<string, unknown>) {
  allow(member, ["admin", "sales", "operations", "operations_finance"]);
  const db = getD1();
  const fullName = text(p.fullName, 120),
    grade = text(p.grade, 60),
    wechat = text(p.guardianWechatName, 120),
    classin = text(p.classinAccount, 120);
  const dob = isoDate(p.dateOfBirth);
  const phone = text(p.guardianPhone, 40),
    firstRegisteredAt = isoDate(p.firstRegisteredAt, true)!;
  if (!fullName || !grade || !wechat)
    throw new ApiError(400, "请填写孩子姓名、年级和家长微信名");
  const matches = await db
    .prepare(
      "SELECT s.id,s.code,s.full_name,s.classin_account,s.owner_user_id,s.created_by,g.full_name guardian_name,g.phone,g.wechat_name FROM students s LEFT JOIN student_guardians sg ON sg.student_id=s.id AND sg.is_primary=1 LEFT JOIN guardians g ON g.id=sg.guardian_id WHERE lower(s.full_name)=lower(?) OR (? != '' AND g.phone=?) OR (? != '' AND lower(s.classin_account)=lower(?)) LIMIT 8",
    )
    .bind(fullName, phone, phone, classin, classin)
    .all();
  if (matches.results.length)
    throw new ApiError(
      409,
      "发现可能重复的学员，请先检查已有档案",
      member.role === "sales"
        ? matches.results.filter((row) => canAccessStudent(member, row))
        : matches.results,
    );
  let owner = member.userId;
  const requestedOwner = text(p.salespersonUserId, 100);
  if (requestedOwner) {
    const valid = await db
      .prepare(
        "SELECT user_id FROM members WHERE user_id=? AND status='active' AND role IN ('admin','sales','operations','operations_finance')",
      )
      .bind(requestedOwner)
      .first<{ user_id: string }>();
    if (valid) owner = valid.user_id;
  }
  const requestedAgent = text(p.sourceAgentId, 60);
  const sourceKind = requestedAgent === "__parent_referral__" ? "parent_referral" : "agent";
  let sourceAgentId: string | null = null;
  if (requestedAgent && sourceKind === "agent") {
    const valid = await db
      .prepare("SELECT id FROM agents WHERE id=? AND active=1")
      .bind(requestedAgent)
      .first<{ id: string }>();
    if (!valid) throw new ApiError(400, "渠道不存在或已停用");
    sourceAgentId = valid.id;
  }
  const sid = crypto.randomUUID(),
    gid = crypto.randomUUID(),
    code = await allocateStudentCode(db);
  await db.batch([
    db
      .prepare(
        "INSERT INTO students (id,code,full_name,english_name,date_of_birth,school,grade,classin_account,first_registered_at,status,owner_user_id,source_agent_id,source_kind,referral_parent_wechat,notes,created_by) VALUES (?,?,?,?,?,?,?,?,?,'active',?,?,?,?,?,?)",
      )
      .bind(
        sid,
        code,
        fullName,
        text(p.englishName, 120),
        dob,
        text(p.school, 160),
        grade,
        classin,
        firstRegisteredAt,
        owner,
        sourceAgentId,
        sourceKind,
        text(p.referralParentWechat, 120),
        text(p.notes, 2000),
        member.userId,
      ),
    db
      .prepare(
        "INSERT INTO guardians (id,full_name,wechat_name,phone,email,relationship,created_by) VALUES (?,?,?,?,?,?,?)",
      )
      .bind(
        gid,
        text(p.guardianName, 120) || "待补",
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
      .bind(sid, gid),
    audit(db, member, "create", "student", sid, { code, fullName, source: text(p.source, 30) || "manual" }),
  ]);
  return { id: sid, code };
}

async function updateStudent(member: Member, p: Record<string, unknown>) {
  allow(member, ["admin", "sales", "operations", "operations_finance"]);
  const db = getD1(),
    id = text(p.id, 60),
    fullName = text(p.fullName, 120),
    grade = text(p.grade, 60),
    wechat = text(p.guardianWechatName, 120),
    classin = text(p.classinAccount, 120),
    phone = text(p.guardianPhone, 40),
    firstRegisteredAt = isoDate(p.firstRegisteredAt, true)!;
  if (!fullName || !grade || !wechat)
    throw new ApiError(400, "请填写孩子姓名、年级和家长微信名");
  const current = await db
    .prepare(
      "SELECT s.id,s.owner_user_id,s.created_by,sg.guardian_id,g.full_name guardian_name,g.phone guardian_phone FROM students s LEFT JOIN student_guardians sg ON sg.student_id=s.id AND sg.is_primary=1 LEFT JOIN guardians g ON g.id=sg.guardian_id WHERE s.id=?",
    )
    .bind(id)
    .first<Record<string, string>>();
  if (!current) throw new ApiError(404, "学员不存在");
  if (!canAccessStudent(member, current))
    throw new ApiError(403, "你不能修改其他课程顾问负责的学员");
  const duplicate = await db
    .prepare(
      "SELECT s.id,s.code,s.full_name,s.owner_user_id,s.created_by FROM students s LEFT JOIN student_guardians sg ON sg.student_id=s.id AND sg.is_primary=1 LEFT JOIN guardians g ON g.id=sg.guardian_id WHERE s.id!=? AND (lower(s.full_name)=lower(?) OR (?!='' AND g.phone=?) OR (?!='' AND lower(s.classin_account)=lower(?))) LIMIT 8",
    )
    .bind(id, fullName, phone, phone, classin, classin)
    .all();
  if (duplicate.results.length)
    throw new ApiError(
      409,
      "发现可能重复的学员，请先检查已有档案",
      member.role === "sales"
        ? duplicate.results.filter((row) => canAccessStudent(member, row))
        : duplicate.results,
    );
  let owner = current.owner_user_id || member.userId;
  const requested = text(p.salespersonUserId, 100);
  if (requested) {
    const valid = await db
      .prepare(
        "SELECT user_id FROM members WHERE user_id=? AND status='active' AND role IN ('admin','sales','operations','operations_finance')",
      )
      .bind(requested)
      .first<{ user_id: string }>();
    if (valid) owner = valid.user_id;
  }
  const requestedAgent = text(p.sourceAgentId, 60);
  const sourceKind = requestedAgent === "__parent_referral__" ? "parent_referral" : "agent";
  let sourceAgentId: string | null = null;
  if (requestedAgent && sourceKind === "agent") {
    const valid = await db
      .prepare("SELECT id FROM agents WHERE id=? AND active=1")
      .bind(requestedAgent)
      .first<{ id: string }>();
    if (!valid) throw new ApiError(400, "渠道不存在或已停用");
    sourceAgentId = valid.id;
  }
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        "UPDATE students SET full_name=?,english_name=?,date_of_birth=NULL,school=?,grade=?,classin_account=?,first_registered_at=?,owner_user_id=?,source_agent_id=?,source_kind=?,referral_parent_wechat=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
      )
      .bind(
        fullName,
        text(p.englishName, 120),
        text(p.school, 160),
        grade,
        classin,
        firstRegisteredAt,
        owner,
        sourceAgentId,
        sourceKind,
        text(p.referralParentWechat, 120),
        text(p.notes, 2000),
        id,
      ),
  ];
  if (current.guardian_id)
    statements.push(
      db
        .prepare(
          "UPDATE guardians SET full_name=?,wechat_name=?,phone=?,email=?,relationship=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
        )
        .bind(
          text(p.guardianName, 120) || current.guardian_name || "待补",
          wechat,
          phone || current.guardian_phone || "",
          "",
          "家长",
          current.guardian_id,
        ),
    );
  statements.push(
    audit(db, member, "update", "student", id, {
      label: fullName,
      after: {
        fullName,
        englishName: text(p.englishName, 120),
        school: text(p.school, 160),
        grade,
        classinAccount: classin,
        firstRegisteredAt,
        ownerUserId: owner,
        sourceAgentId,
        sourceKind,
        referralParentWechat: text(p.referralParentWechat, 120),
        notes: text(p.notes, 2000),
        guardianName:
          text(p.guardianName, 120) || current.guardian_name || "待补",
        guardianWechatName: wechat,
        guardianPhone: phone || current.guardian_phone || "",
      },
    }),
  );
  await db.batch(statements);
  return { ok: true };
}

async function deleteStudent(member: Member, p: Record<string, unknown>) {
  allow(member, ["admin", "sales"]);
  const db = getD1(),
    id = text(p.id, 60);
  const student = await db
    .prepare("SELECT id,code,full_name,owner_user_id,created_by FROM students WHERE id=?")
    .bind(id)
    .first<Record<string, string>>();
  if (!student) throw new ApiError(404, "学员不存在或已被删除");
  if (!canAccessStudent(member, student))
    throw new ApiError(403, "课程顾问只能删除自己负责的学员");
  const guardians = await db
    .prepare("SELECT guardian_id FROM student_guardians WHERE student_id=?")
    .bind(id)
    .all<{ guardian_id: string }>();
  const screenshots = await db
    .prepare(
      "SELECT registration_screenshot_key FROM enrollments WHERE student_id=? AND registration_screenshot_key IS NOT NULL",
    )
    .bind(id)
    .all<{ registration_screenshot_key: string }>();
  const additionalScreenshots = await db
    .prepare(
      "SELECT es.object_key FROM enrollment_screenshots es JOIN enrollments e ON e.id=es.enrollment_id WHERE e.student_id=?",
    )
    .bind(id)
    .all<{ object_key: string }>();
  const refundProofs = await db
    .prepare(
      "SELECT r.proof_object_key FROM refunds r JOIN enrollments e ON e.id=r.enrollment_id WHERE e.student_id=? AND r.proof_object_key IS NOT NULL",
    )
    .bind(id)
    .all<{ proof_object_key: string }>();
  const statements: D1PreparedStatement[] = [
    db
      .prepare("DELETE FROM student_class_memberships WHERE student_id=?")
      .bind(id),
    db
      .prepare(
        "DELETE FROM enrollment_class_memberships WHERE enrollment_id IN (SELECT id FROM enrollments WHERE student_id=?)",
      )
      .bind(id),
    db
      .prepare(
        "DELETE FROM invoices WHERE enrollment_id IN (SELECT id FROM enrollments WHERE student_id=?) OR payment_id IN (SELECT p.id FROM payments p JOIN enrollments e ON e.id=p.enrollment_id WHERE e.student_id=?)",
      )
      .bind(id, id),
    db
      .prepare(
        "DELETE FROM commissions WHERE enrollment_id IN (SELECT id FROM enrollments WHERE student_id=?)",
      )
      .bind(id),
    db
      .prepare(
        "DELETE FROM payments WHERE enrollment_id IN (SELECT id FROM enrollments WHERE student_id=?)",
      )
      .bind(id),
    db
      .prepare(
        "DELETE FROM refunds WHERE enrollment_id IN (SELECT id FROM enrollments WHERE student_id=?)",
      )
      .bind(id),
    db
      .prepare(
        "DELETE FROM enrollment_screenshots WHERE enrollment_id IN (SELECT id FROM enrollments WHERE student_id=?)",
      )
      .bind(id),
    db.prepare("DELETE FROM enrollments WHERE student_id=?").bind(id),
    db.prepare("DELETE FROM student_followups WHERE student_id=?").bind(id),
    db.prepare("DELETE FROM student_guardians WHERE student_id=?").bind(id),
    db.prepare("DELETE FROM students WHERE id=?").bind(id),
  ];
  for (const guardian of guardians.results)
    statements.push(
      db
        .prepare(
          "DELETE FROM guardians WHERE id=? AND NOT EXISTS (SELECT 1 FROM student_guardians WHERE guardian_id=?)",
        )
        .bind(guardian.guardian_id, guardian.guardian_id),
    );
  statements.push(
    audit(db, member, "delete", "student", id, {
      code: student.code,
      fullName: student.full_name,
    }),
  );
  await db.batch(statements);
  const screenshotKeys = screenshots.results
    .map((row) => row.registration_screenshot_key)
    .filter(Boolean)
    .concat(additionalScreenshots.results.map((row) => row.object_key))
    .concat(refundProofs.results.map((row) => row.proof_object_key));
  if (screenshotKeys.length) {
    try {
      await getBucket().delete(screenshotKeys);
    } catch {
      /* the deleted business record remains authoritative */
    }
  }
  return { ok: true };
}

async function deleteStudents(member: Member, p: Record<string, unknown>) {
  allow(member, ["admin", "sales"]);
  const ids = [
    ...new Set(
      (Array.isArray(p.ids) ? p.ids : [])
        .map((id) => text(id, 60))
        .filter(Boolean),
    ),
  ];
  if (!ids.length) throw new ApiError(400, "请至少选择一名学员");
  if (ids.length > 100)
    throw new ApiError(400, "一次最多删除 100 名学员");

  const placeholders = ids.map(() => "?").join(",");
  const students = await getD1()
    .prepare(
      `SELECT id,owner_user_id,created_by FROM students WHERE id IN (${placeholders})`,
    )
    .bind(...ids)
    .all<{ id: string; owner_user_id: string; created_by: string }>();
  if (students.results.length !== ids.length)
    throw new ApiError(409, "部分学员档案已不存在，请刷新列表后重试");
  if (
    member.role === "sales" &&
    students.results.some((student) => !canAccessStudent(member, student))
  )
    throw new ApiError(403, "课程顾问只能删除自己负责的学员");

  for (const id of ids) await deleteStudent(member, { id });
  return { ok: true, deletedCount: ids.length };
}

async function updateEnrollment(member: Member, p: Record<string, unknown>) {
  allow(member, ["admin", "finance", "sales", "operations", "operations_finance"]);
  const db = getD1(), id = text(p.id, 60), courseId = text(p.courseId, 60);
  const current = await db.prepare(
    "SELECT e.*,COALESCE((SELECT SUM(amount_cents) FROM payments WHERE enrollment_id=e.id AND status='confirmed'),0) paid_cents FROM enrollments e WHERE e.id=?",
  ).bind(id).first<Record<string, unknown>>();
  if (!current) throw new ApiError(404, "报名记录不存在或已被删除");
  if (!canAccessEnrollment(member, current))
    throw new ApiError(403, "你不能修改其他课程顾问的报名记录");
  const course = await db.prepare("SELECT id,currency FROM courses WHERE id=? AND active=1").bind(courseId).first<Record<string, string>>();
  if (!course) throw new ApiError(404, "课程不存在或已停用");
  if (!text(p.listAmount, 30)) throw new ApiError(400, "请填写课程原价");
  if (!text(p.paymentAmount, 30)) throw new ApiError(400, "请填写实际收款金额");
  const list = cents(p.listAmount), paid = cents(p.paymentAmount);
  if (paid <= 0) throw new ApiError(400, "实际收款金额必须大于 0");
  if (list < paid) throw new ApiError(400, "课程原价不能低于实际收款金额");
  const net = paid, discount = Math.max(0, list - net);
  const currency = ["SGD", "CNY"].includes(text(p.currency, 3)) ? text(p.currency, 3) : course.currency;
  const registrationType = text(p.registrationType, 10) === "renewal" ? "renewal" : "new";
  const quantity = Math.max(1, Math.round(Number(p.quantity) || 1));
  const startDate = isoDate(p.firstLessonDate);
  const classGroupId = text(p.classGroupId, 60) || null;
  const classGroup = classGroupId
    ? await db.prepare("SELECT id,name,end_date FROM class_groups WHERE id=? AND course_id=? AND (status='active' OR id=?)").bind(classGroupId, courseId, String(current.class_group_id || "")).first<Record<string, string>>()
    : null;
  if (classGroupId && !classGroup)
    throw new ApiError(400, "所选班级不属于该课程或已经结课，请重新选择");

  let expectedEndDate: string | null;
  try { expectedEndDate = resolveEnrollmentEndDate(p.expectedEndDate, classGroup?.end_date, p.expectedEndDateMode); }
  catch (error) { throw new ApiError(400, error instanceof Error ? error.message : "结束日期不正确"); }
  if (expectedEndDate && startDate && expectedEndDate < startDate)
    throw new ApiError(400, "结束日期不能早于加入第一次课日期");

  const payments = await db.prepare("SELECT id,amount_cents,paid_at,method,reference FROM payments WHERE enrollment_id=? AND status='confirmed' ORDER BY created_at,id").bind(id).all<Record<string, unknown>>();
  const editablePayment = payments.results[0];
  const otherPaid = payments.results.slice(1).reduce((sum, row) => sum + Number(row.amount_cents || 0), 0);
  if (paid < otherPaid)
    throw new ApiError(400, `该报名另有 ${otherPaid / 100} 的后续收款，实际收款总额不能低于此金额`);
  const editableAmount = paid - otherPaid;
  const paidAt = isoDate(p.paidAt, true)!;
  const paymentMethod = text(p.paymentMethod, 50) || "银行转账";
  const paymentReference = text(p.paymentReference, 120);

  const existingScreenshots = await db.prepare("SELECT id,object_key,file_name FROM enrollment_screenshots WHERE enrollment_id=? ORDER BY uploaded_at,id").bind(id).all<{id:string;object_key:string;file_name:string}>();
  const hasScreenshotSelection = Array.isArray(p.keepScreenshotIds);
  const requestedKeepIds = hasScreenshotSelection
    ? new Set((p.keepScreenshotIds as unknown[]).map((value) => text(value, 60)).filter(Boolean))
    : new Set(existingScreenshots.results.map((row) => row.id));
  const keepLegacy = !hasScreenshotSelection || requestedKeepIds.has("legacy");
  const keptScreenshots = existingScreenshots.results.filter((row) => requestedKeepIds.has(row.id));
  const removedScreenshots = existingScreenshots.results.filter((row) => !requestedKeepIds.has(row.id));
  const uploads = Array.isArray(p.registrationScreenshots)
    ? p.registrationScreenshots.filter((value): value is File => value instanceof File && value.size > 0)
    : [];
  const legacyCount = current.registration_screenshot_key && keepLegacy ? 1 : 0;
  if (legacyCount + keptScreenshots.length + uploads.length > 5)
    throw new ApiError(400, "付款截图最多保留和上传 5 张");
  const pendingUploads: Array<{file:File;id:string;key:string;name:string;type:string;size:number}> = [];
  for (const screenshot of uploads) {
    if (screenshot.size > MAX_SCREENSHOT_BYTES)
      throw new ApiError(400, `付款截图“${screenshot.name}”不能超过 10MB`);
    const extension = screenshot.name.split(".").pop()?.toLowerCase() ?? "";
    if (!screenshotExtensions.has(extension))
      throw new ApiError(400, "付款截图仅支持 JPG、PNG、WEBP 或 PDF");
    const name = screenshot.name.slice(0, 180);
    const type = screenshot.type || ({jpg:"image/jpeg",jpeg:"image/jpeg",png:"image/png",webp:"image/webp",pdf:"application/pdf"}[extension] ?? "application/octet-stream");
    pendingUploads.push({
      file: screenshot,
      id: crypto.randomUUID(),
      key: `enrollment-screenshots/${id}/${crypto.randomUUID()}-${safeFileName(name)}`,
      name,
      type,
      size: screenshot.size,
    });
  }

  // Save the enrollment and payment first. Screenshot storage is handled
  // separately so an upload failure never rolls back the business record.
  const statements: D1PreparedStatement[] = [
    db.prepare("UPDATE enrollments SET course_id=?,class_group_id=?,registration_type=?,quantity=?,list_amount_cents=?,discount_cents=?,net_amount_cents=?,currency=?,start_date=?,expected_end_date=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
      .bind(courseId, classGroupId, registrationType, quantity, list, discount, net, currency, startDate, expectedEndDate, text(p.notes, 2000), id),
    db.prepare("UPDATE commissions SET basis_cents=?,amount_cents=CASE WHEN rate_bps>0 THEN CAST(ROUND(?*rate_bps/10000.0) AS INTEGER) ELSE amount_cents END WHERE enrollment_id=?")
      .bind(net, net, id),
    audit(db, member, "update", "enrollment", id, {
      number: current.number,
      before: { courseId: current.course_id, classGroupId: current.class_group_id, quantity: current.quantity, listAmountCents: current.list_amount_cents, paidAmountCents: current.paid_cents, currency: current.currency, startDate: current.start_date, expectedEndDate: current.expected_end_date },
      after: { courseId, classGroupId, quantity, listAmountCents: list, discountCents: discount, paidAmountCents: paid, netAmountCents: net, currency, registrationType, startDate, expectedEndDate, paymentMethod, paymentReference, notes: text(p.notes, 2000), keptScreenshotCount: legacyCount + keptScreenshots.length, requestedScreenshotNames: pendingUploads.map((row) => row.name), requestedRemovedScreenshotNames: removedScreenshots.map((row) => row.file_name) },
    }),
  ];
  if (editablePayment) {
    statements.push(db.prepare("UPDATE payments SET amount_cents=?,currency=?,paid_at=?,method=?,reference=? WHERE id=?").bind(editableAmount, currency, paidAt, paymentMethod, paymentReference, editablePayment.id));
  } else {
    statements.push(paymentStatement(db, member, id, currency, editableAmount, paidAt, paymentMethod, paymentReference, crypto.randomUUID()));
  }
  for (const row of payments.results.slice(1))
    statements.push(db.prepare("UPDATE payments SET currency=? WHERE id=?").bind(currency, row.id));
  try {
    await db.batch(statements);
  } catch (error) {
    console.error(JSON.stringify({
      event: "enrollment_core_save_failed",
      enrollmentId: id,
      message: error instanceof Error ? error.message : "unknown error",
    }));
    throw error;
  }

  const uploadedRecords: Array<{id:string;key:string;name:string;type:string;size:number}> = [];
  try {
    for (const upload of pendingUploads) {
      await getBucket().put(upload.key, await upload.file.arrayBuffer(), {
        httpMetadata: { contentType: upload.type },
        customMetadata: { uploadedBy: member.userId, enrollmentId: id },
      });
      uploadedRecords.push(upload);
    }
  } catch (error) {
    if (uploadedRecords.length) {
      try { await getBucket().delete(uploadedRecords.map((row) => row.key)); } catch { /* preserve the upload error */ }
    }
    console.error(JSON.stringify({
      event: "enrollment_screenshot_upload_failed",
      enrollmentId: id,
      message: error instanceof Error ? error.message : "unknown error",
    }));
    return {
      ok: true,
      paymentScreenshotCount:
        (current.registration_screenshot_key ? 1 : 0) + existingScreenshots.results.length,
      screenshotWarning: "报名资料和收款已保存，但付款截图暂未更新，请稍后重新上传。",
    };
  }

  const screenshotChanged =
    pendingUploads.length > 0 ||
    removedScreenshots.length > 0 ||
    Boolean(current.registration_screenshot_key && !keepLegacy);
  if (!screenshotChanged) {
    return {
      ok: true,
      paymentScreenshotCount: legacyCount + keptScreenshots.length,
    };
  }

  const screenshotStatements: D1PreparedStatement[] = [
    db.prepare("UPDATE enrollments SET registration_screenshot_key=CASE WHEN ? THEN registration_screenshot_key ELSE NULL END,registration_screenshot_name=CASE WHEN ? THEN registration_screenshot_name ELSE NULL END,registration_screenshot_type=CASE WHEN ? THEN registration_screenshot_type ELSE NULL END,registration_screenshot_uploaded_at=CASE WHEN ? THEN registration_screenshot_uploaded_at ELSE NULL END WHERE id=?")
      .bind(keepLegacy ? 1 : 0, keepLegacy ? 1 : 0, keepLegacy ? 1 : 0, keepLegacy ? 1 : 0, id),
  ];
  for (const row of removedScreenshots)
    screenshotStatements.push(db.prepare("DELETE FROM enrollment_screenshots WHERE id=? AND enrollment_id=?").bind(row.id, id));
  for (const row of uploadedRecords)
    screenshotStatements.push(db.prepare("INSERT INTO enrollment_screenshots (id,enrollment_id,object_key,file_name,content_type,size_bytes,uploaded_by) VALUES (?,?,?,?,?,?,?)").bind(row.id,id,row.key,row.name,row.type,row.size,member.userId));

  try {
    await db.batch(screenshotStatements);
  } catch (error) {
    if (uploadedRecords.length) {
      try { await getBucket().delete(uploadedRecords.map((row) => row.key)); } catch { /* preserve the original screenshot error */ }
    }
    console.error(JSON.stringify({
      event: "enrollment_screenshot_save_failed",
      enrollmentId: id,
      message: error instanceof Error ? error.message : "unknown error",
    }));
    return {
      ok: true,
      paymentScreenshotCount:
        (current.registration_screenshot_key ? 1 : 0) + existingScreenshots.results.length,
      screenshotWarning: "报名资料和收款已保存，但付款截图暂未更新，请稍后重新上传。",
    };
  }

  const deleteKeys = removedScreenshots.map((row) => row.object_key);
  if (current.registration_screenshot_key && !keepLegacy) deleteKeys.push(String(current.registration_screenshot_key));
  if (deleteKeys.length) {
    try { await getBucket().delete(deleteKeys); } catch { /* database state remains authoritative */ }
  }
  return { ok: true, paymentScreenshotCount: legacyCount + keptScreenshots.length + uploadedRecords.length };
}

async function deleteEnrollment(member: Member, p: Record<string, unknown>) {
  allow(member, ["admin", "sales", "operations", "operations_finance"]);
  const db = getD1(),
    id = text(p.id, 60);
  const enrollment = await db
    .prepare(
      "SELECT e.id,e.number,e.student_id,e.salesperson_user_id,e.created_by,e.net_amount_cents,e.currency,e.registration_screenshot_key,s.full_name student_name,c.name course_name FROM enrollments e JOIN students s ON s.id=e.student_id JOIN courses c ON c.id=e.course_id WHERE e.id=?",
    )
    .bind(id)
    .first<Record<string, unknown>>();
  if (!enrollment) throw new ApiError(404, "报名记录不存在或已被删除");
  if (!canAccessEnrollment(member, enrollment))
    throw new ApiError(403, "课程顾问只能删除自己登记的报名记录");
  const screenshots = await db
    .prepare("SELECT object_key FROM enrollment_screenshots WHERE enrollment_id=?")
    .bind(id)
    .all<{ object_key: string }>();
  const refundProofs = await db
    .prepare("SELECT proof_object_key FROM refunds WHERE enrollment_id=? AND proof_object_key IS NOT NULL")
    .bind(id)
    .all<{ proof_object_key: string }>();
  await db.batch([
    db
      .prepare(
        "DELETE FROM invoices WHERE enrollment_id=? OR payment_id IN (SELECT id FROM payments WHERE enrollment_id=?)",
      )
      .bind(id, id),
    db.prepare("DELETE FROM commissions WHERE enrollment_id=?").bind(id),
    db.prepare("DELETE FROM payments WHERE enrollment_id=?").bind(id),
    db.prepare("DELETE FROM refunds WHERE enrollment_id=?").bind(id),
    db.prepare("DELETE FROM enrollment_class_memberships WHERE enrollment_id=?").bind(id),
    db.prepare("DELETE FROM enrollment_screenshots WHERE enrollment_id=?").bind(id),
    db.prepare("DELETE FROM enrollments WHERE id=?").bind(id),
    audit(db, member, "delete", "enrollment", id, {
      number: enrollment.number,
      studentId: enrollment.student_id,
      studentName: enrollment.student_name,
      courseName: enrollment.course_name,
      netAmountCents: enrollment.net_amount_cents,
      currency: enrollment.currency,
    }),
  ]);
  const screenshotKeys = screenshots.results.map((row) => row.object_key);
  screenshotKeys.push(...refundProofs.results.map((row) => row.proof_object_key));
  if (enrollment.registration_screenshot_key)
    screenshotKeys.push(String(enrollment.registration_screenshot_key));
  if (screenshotKeys.length) {
    try {
      await getBucket().delete(screenshotKeys);
    } catch {
      /* the deleted business record remains authoritative */
    }
  }
  return { ok: true };
}

async function createCourse(member: Member, p: Record<string, unknown>) {
  allow(member, ["admin", "sales", "operations", "operations_finance"]);
  const name = text(p.name, 160);
  if (!name) throw new ApiError(400, "请填写课程名称");
  const id = crypto.randomUUID();
  await getD1().batch([
    getD1()
      .prepare(
        "INSERT INTO courses (id,name,category,standard_price_cents,currency,unit_label,created_by) VALUES (?,?,?,?,?,?,?)",
      )
      .bind(
        id,
        name,
        courseCategory(p.category),
        0,
        "SGD",
        "课时",
        member.userId,
      ),
    audit(getD1(), member, "create", "course", id, {
      name,
      category: courseCategory(p.category),
      source: text(p.source, 30) || "manual",
    }),
  ]);
  return { id };
}

async function updateCourse(member: Member, p: Record<string, unknown>) {
  allow(member, ["admin", "sales", "operations", "operations_finance"]);
  const db = getD1(), id = text(p.id, 60), name = text(p.name, 160);
  if (!id || !name) throw new ApiError(400, "请填写课程名称");
  await requireCourseEditor(member, id);
  const current = await db.prepare("SELECT id FROM courses WHERE id=? AND active=1").bind(id).first();
  if (!current) throw new ApiError(404, "课程不存在或已删除");
  await db.batch([
    db.prepare("UPDATE courses SET name=?,category=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
      .bind(name,courseCategory(p.category),id),
    audit(db,member,"update","course",id,{label:name,after:{name,category:courseCategory(p.category)}}),
  ]);
  return { ok: true };
}

async function deleteCourse(member: Member, p: Record<string, unknown>) {
  allow(member, ["admin", "sales", "operations", "operations_finance"]);
  const db=getD1(),id=text(p.id,60);
  await requireCourseEditor(member, id);
  const course=await db.prepare("SELECT id,name FROM courses WHERE id=? AND active=1").bind(id).first<Record<string,string>>();
  if(!course)throw new ApiError(404,"课程不存在或已删除");
  const usage=await db.prepare("SELECT (SELECT COUNT(*) FROM class_groups WHERE course_id=?) class_count,(SELECT COUNT(*) FROM enrollments WHERE course_id=?) enrollment_count").bind(id,id).first<Record<string,number>>();
  if(Number(usage?.class_count||0)>0||Number(usage?.enrollment_count||0)>0)throw new ApiError(409,`课程已有 ${Number(usage?.class_count||0)} 个班级和 ${Number(usage?.enrollment_count||0)} 条报名，不能直接删除；可编辑课程或先处理关联班级`);
  await db.batch([db.prepare("UPDATE courses SET active=0,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(id),audit(db,member,"delete","course",id,{name:course.name})]);
  return {ok:true};
}

async function createClassGroup(member: Member, p: Record<string, unknown>) {
  allow(member, ["admin", "sales", "operations", "operations_finance"]);
  const db = getD1(),
    courseId = text(p.courseId, 60),
    name = text(p.name, 160),
    teacherName = text(p.teacherName, 120),
    initialStartDate = isoDate(p.startDate, true)!;
  let startDate = initialStartDate;
  if (!courseId || !name || !teacherName)
    throw new ApiError(400, "请填写课程、班级名称和老师姓名");
  if (!teacherNames.has(teacherName)) throw new ApiError(400, "请选择教师名单中的授课老师");
  const course = await db
    .prepare("SELECT id FROM courses WHERE id=? AND active=1")
    .bind(courseId)
    .first<{ id: string }>();
  if (!course) throw new ApiError(404, "课程不存在或已停用");
  const scheduleType = ["weekly", "specific_dates"].includes(
      text(p.scheduleType, 20),
    )
      ? text(p.scheduleType, 20)
      : "weekly",
    classTime = text(p.classTime, 300);
  const lessonCount = Math.trunc(Number(p.lessonCount));
  let specificDates = String(p.specificDates ?? "").trim(),
    endDate = isoDate(p.endDate);
  if (scheduleType === "weekly") {
    if (!Number.isFinite(lessonCount) || lessonCount < 1 || lessonCount > 200)
      throw new ApiError(400, "总节数需要填写 1–200 之间的数字");
    const dates = weeklyDates(startDate, lessonCount);
    specificDates = dates.join("\n");
    endDate = dates.at(-1) ?? startDate;
  }
  if (!classTime) throw new ApiError(400, "请填写上课时间");
  if (scheduleType === "specific_dates" && !specificDates)
    throw new ApiError(400, "请在日历中选择具体上课日期");
  if (scheduleType === "specific_dates") {
    try { ({ startDate, endDate, specificDates } = normalizeSpecificSchedule(specificDates, classTime)); }
    catch (error) { throw new ApiError(400, error instanceof Error ? error.message : "课表格式不正确"); }
  }
  const id = crypto.randomUUID();
  await db.batch([
    db
      .prepare(
        "INSERT INTO class_groups (id,course_id,name,classin_class_name,teacher_name,start_date,end_date,schedule_type,class_time,specific_dates,status,notes,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,'active',?,?)",
      )
      .bind(
        id,
        courseId,
        name,
        text(p.classinClassName, 180),
        teacherName,
        startDate,
        endDate,
        scheduleType,
        classTime,
        specificDates,
        text(p.notes, 2000),
        member.userId,
      ),
    audit(db, member, "create", "class_group", id, {
      courseId,
      name,
      teacherName,
      startDate,
      scheduleType,
      lessonCount: scheduleType === "weekly" ? lessonCount : scheduleDateCount(specificDates),
      source: text(p.source, 30) || "manual",
    }),
  ]);
  return { id };
}

async function updateClassGroup(member: Member, p: Record<string, unknown>) {
  allow(member,["admin","sales","operations","operations_finance"]);
  const db=getD1(),id=text(p.id,60),courseId=text(p.courseId,60),name=text(p.name,160),teacherName=text(p.teacherName,120);let startDate=isoDate(p.startDate,true)!;
  if(!id||!courseId||!name||!teacherName)throw new ApiError(400,"请填写课程、班级名称和老师姓名");
  await requireClassGroupEditor(member, id);
  if(!teacherNames.has(teacherName))throw new ApiError(400,"请选择教师名单中的授课老师");
  const [current,course]=await Promise.all([db.prepare("SELECT id,course_id,status FROM class_groups WHERE id=?").bind(id).first<Record<string,string>>(),db.prepare("SELECT id FROM courses WHERE id=? AND active=1").bind(courseId).first()]);
  if(!current)throw new ApiError(404,"班级不存在或已删除");if(!course)throw new ApiError(404,"课程不存在或已停用");
  if(current.course_id!==courseId){const linked=await db.prepare("SELECT (SELECT COUNT(*) FROM enrollments WHERE class_group_id=?) + (SELECT COUNT(*) FROM enrollment_class_memberships WHERE class_group_id=? AND status='active') + (SELECT COUNT(*) FROM student_class_memberships WHERE class_group_id=? AND status='active') total").bind(id,id,id).first<{total:number}>();if(Number(linked?.total||0)>0)throw new ApiError(409,"班级已有学员，不能改到其他课程");}
  const scheduleType=text(p.scheduleType,20)==="specific_dates"?"specific_dates":"weekly",classTime=text(p.classTime,300);const lessonCount=Math.trunc(Number(p.lessonCount));let specificDates=String(p.specificDates??"").trim(),endDate=isoDate(p.endDate);if(scheduleType==="weekly"){if(!Number.isFinite(lessonCount)||lessonCount<1||lessonCount>200)throw new ApiError(400,"总节数需要填写 1–200 之间的数字");const dates=weeklyDates(startDate,lessonCount);specificDates=dates.join("\n");endDate=dates.at(-1)??startDate;}
  if(!classTime)throw new ApiError(400,"请填写上课时间");if(scheduleType==="specific_dates"&&!specificDates)throw new ApiError(400,"请在日历中选择具体上课日期");
  if(scheduleType==="specific_dates"){try{({startDate,endDate,specificDates}=normalizeSpecificSchedule(specificDates,classTime));}catch(error){throw new ApiError(400,error instanceof Error?error.message:"课表格式不正确");}}
  await db.batch([db.prepare("UPDATE class_groups SET course_id=?,name=?,classin_class_name=?,teacher_name=?,start_date=?,end_date=?,schedule_type=?,class_time=?,specific_dates=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
    .bind(courseId,name,text(p.classinClassName,180),teacherName,startDate,endDate,scheduleType,classTime,specificDates,text(p.notes,2000),id),audit(db,member,"update","class_group",id,{label:name,after:{courseId,name,classinClassName:text(p.classinClassName,180),teacherName,startDate,endDate,scheduleType,classTime,lessonCount:scheduleType==="weekly"?lessonCount:scheduleDateCount(specificDates),specificDates,notes:text(p.notes,2000)}})]);
  return{ok:true};
}

async function deleteClassGroup(member: Member, p: Record<string, unknown>) {
  allow(member,["admin","sales","operations","operations_finance"]);
  const db=getD1(),id=text(p.id,60);const group=await db.prepare("SELECT id,name FROM class_groups WHERE id=?").bind(id).first<Record<string,string>>();if(!group)throw new ApiError(404,"班级不存在或已删除");
  await requireClassGroupEditor(member, id);
  const usage=await db.prepare("SELECT (SELECT COUNT(*) FROM enrollments WHERE class_group_id=?) + (SELECT COUNT(*) FROM enrollment_class_memberships WHERE class_group_id=?) + (SELECT COUNT(*) FROM student_class_memberships WHERE class_group_id=?) total").bind(id,id,id).first<{total:number}>();if(Number(usage?.total||0)>0)throw new ApiError(409,`班级已有 ${Number(usage?.total||0)} 条学员记录，不能删除；请使用“设为结课”保留历史`);
  await db.batch([db.prepare("DELETE FROM class_groups WHERE id=?").bind(id),audit(db,member,"delete","class_group",id,{name:group.name})]);return{ok:true};
}

async function assignEnrollmentClass(
  member: Member,
  p: Record<string, unknown>,
) {
  allow(member, ["admin", "sales", "operations", "operations_finance"]);
  const db = getD1();
  const selectionKey = text(p.selectionKey, 140);
  const enrollmentId =
    text(p.enrollmentId, 60) ||
    (selectionKey.startsWith("enrollment:") ? selectionKey.slice(11) : "");
  const studentId =
    text(p.studentId, 60) ||
    (selectionKey.startsWith("student:") ? selectionKey.slice(8) : "");
  const classGroupId = text(p.classGroupId, 60);
  if ((!enrollmentId && !studentId) || !classGroupId)
    throw new ApiError(400, "请选择学员和班级");
  if (studentId) {
    const [student, classGroup] = await Promise.all([
      db
        .prepare("SELECT id,code,full_name,status,owner_user_id,created_by FROM students WHERE id=?")
        .bind(studentId)
        .first<Record<string, string>>(),
      db
        .prepare("SELECT id,name,status FROM class_groups WHERE id=?")
        .bind(classGroupId)
        .first<Record<string, string>>(),
    ]);
    if (!student || student.status !== "active")
      throw new ApiError(404, "未找到有效学员档案");
    if (!classGroup || classGroup.status !== "active")
      throw new ApiError(404, "班级不存在或已结课");
    const duplicate = await db
      .prepare(
        `SELECT 1 found WHERE
        EXISTS (SELECT 1 FROM student_class_memberships WHERE student_id=? AND class_group_id=? AND status='active')
        OR EXISTS (SELECT 1 FROM enrollments WHERE student_id=? AND class_group_id=? AND status='active')
        OR EXISTS (SELECT 1 FROM enrollment_class_memberships m JOIN enrollments e ON e.id=m.enrollment_id WHERE e.student_id=? AND m.class_group_id=? AND m.status='active' AND e.status='active')`,
      )
      .bind(studentId, classGroupId, studentId, classGroupId, studentId, classGroupId)
      .first();
    if (duplicate) throw new ApiError(409, "该学员已经在这个班级中");
    const membershipId = crypto.randomUUID();
    await db.batch([
      db
        .prepare(
          `INSERT INTO student_class_memberships (id,student_id,class_group_id,status,joined_at,removed_at,roster_exported_at,created_by)
          VALUES (?,?,?,'active',CURRENT_TIMESTAMP,NULL,NULL,?)
          ON CONFLICT(student_id,class_group_id) DO UPDATE SET status='active',joined_at=CURRENT_TIMESTAMP,removed_at=NULL,roster_exported_at=NULL,updated_at=CURRENT_TIMESTAMP`,
        )
        .bind(membershipId, studentId, classGroupId, member.userId),
      audit(db, member, "assign", "student_class", studentId, {
        studentCode: student.code,
        studentName: student.full_name,
        classGroupId,
        classGroupName: classGroup.name,
        enrollmentId: null,
        source: text(p.source, 30) || "manual",
      }),
    ]);
    return { ok: true };
  }
  const [enrollment, classGroup] = await Promise.all([
    db
      .prepare("SELECT e.id,e.course_id,e.class_group_id,e.status,e.salesperson_user_id,e.created_by,c.name course_name,old_cg.name old_class_group_name,old_cc.name old_class_course_name FROM enrollments e JOIN courses c ON c.id=e.course_id LEFT JOIN class_groups old_cg ON old_cg.id=e.class_group_id LEFT JOIN courses old_cc ON old_cc.id=old_cg.course_id WHERE e.id=?")
      .bind(enrollmentId)
      .first<Record<string, string>>(),
    db
      .prepare(
        "SELECT cg.id,cg.course_id,cg.name,cg.start_date,cg.end_date,c.name course_name FROM class_groups cg JOIN courses c ON c.id=cg.course_id WHERE cg.id=? AND cg.status='active'",
      )
      .bind(classGroupId)
      .first<Record<string, string>>(),
  ]);
  if (!enrollment || enrollment.status !== "active")
    throw new ApiError(404, "未找到进行中的报名");
  if (!classGroup) throw new ApiError(404, "班级不存在或已结课");
  const duplicateStudent = await db
    .prepare(
      `SELECT 1 found FROM enrollments target
      WHERE target.id=? AND (
        EXISTS (SELECT 1 FROM enrollments e WHERE e.student_id=target.student_id AND e.class_group_id=? AND e.status='active')
        OR EXISTS (SELECT 1 FROM enrollment_class_memberships m JOIN enrollments e ON e.id=m.enrollment_id WHERE e.student_id=target.student_id AND m.class_group_id=? AND m.status='active' AND e.status='active')
        OR EXISTS (SELECT 1 FROM student_class_memberships m WHERE m.student_id=target.student_id AND m.class_group_id=? AND m.status='active')
      )`,
    )
    .bind(enrollmentId, classGroupId, classGroupId, classGroupId)
    .first();
  if (duplicateStudent) throw new ApiError(409, "该学员已经在这个班级中");
  const membership = enrollment.class_group_id
    ? db
        .prepare(
          `INSERT INTO enrollment_class_memberships (id,enrollment_id,class_group_id,status,joined_at,removed_at,roster_exported_at,created_by)
          VALUES (?,?,?,'active',CURRENT_TIMESTAMP,NULL,NULL,?)
          ON CONFLICT(enrollment_id,class_group_id) DO UPDATE SET status='active',joined_at=CURRENT_TIMESTAMP,removed_at=NULL,roster_exported_at=NULL,updated_at=CURRENT_TIMESTAMP`,
        )
        .bind(crypto.randomUUID(), enrollmentId, classGroupId, member.userId)
    : db
        .prepare(
          "UPDATE enrollments SET class_group_id=?,start_date=COALESCE(start_date,?),expected_end_date=COALESCE(expected_end_date,?),roster_exported_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?",
        )
        .bind(classGroupId, classGroup.start_date, classGroup.end_date, enrollmentId);
  await db.batch([
    membership,
    audit(db, member, "assign", "enrollment_class", enrollmentId, {
      label: enrollmentId,
      before: { existingClassGroupId: enrollment.class_group_id },
      after: {
        classGroupId,
        classGroupName: classGroup.name,
        classCourseName: classGroup.course_name,
        enrollmentCourseName: enrollment.course_name,
        source: text(p.source, 30) || "manual",
      },
    }),
  ]);
  return { ok: true };
}

async function removeEnrollmentClass(member: Member, p: Record<string, unknown>) {
  allow(member, ["admin", "sales", "operations", "operations_finance"]);
  const db = getD1(),
    enrollmentId = text(p.enrollmentId, 60),
    studentId = text(p.studentId, 60),
    classGroupId = text(p.classGroupId, 60),
    membershipId = text(p.membershipId, 60),
    studentMembershipId = text(p.studentMembershipId, 60);
  if ((!enrollmentId && !studentMembershipId) || !classGroupId)
    throw new ApiError(400, "缺少学员或班级信息");
  if (studentMembershipId) {
    const student = await db
      .prepare("SELECT owner_user_id,created_by FROM students WHERE id=?")
      .bind(studentId)
      .first<Record<string, unknown>>();
    if (!student) throw new ApiError(404, "未找到学员档案");
    const statement = db
      .prepare(
        "UPDATE student_class_memberships SET status='removed',removed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND student_id=? AND class_group_id=? AND status='active'",
      )
      .bind(studentMembershipId, studentId, classGroupId);
    await db.batch([
      statement,
      audit(db, member, "remove", "student_class", studentId, {
        classGroupId,
        studentMembershipId,
      }),
    ]);
    return { ok: true };
  }
  const enrollment = await db
    .prepare("SELECT id,class_group_id,status,salesperson_user_id,created_by FROM enrollments WHERE id=?")
    .bind(enrollmentId)
    .first<Record<string, string>>();
  if (!enrollment || enrollment.status !== "active")
    throw new ApiError(404, "未找到进行中的报名");
  const statements: D1PreparedStatement[] = membershipId
    ? [db
        .prepare(
          "UPDATE enrollment_class_memberships SET status='removed',removed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND enrollment_id=? AND class_group_id=? AND status='active'",
        )
        .bind(membershipId, enrollmentId, classGroupId)]
    : [
        db.prepare(
          `INSERT INTO enrollment_class_memberships (id,enrollment_id,class_group_id,status,joined_at,removed_at,roster_exported_at,created_by)
           SELECT ?,e.id,e.class_group_id,'removed',e.created_at,CURRENT_TIMESTAMP,e.roster_exported_at,? FROM enrollments e WHERE e.id=? AND e.class_group_id=?
           ON CONFLICT(enrollment_id,class_group_id) DO UPDATE SET status='removed',removed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP`,
        ).bind(crypto.randomUUID(), member.userId, enrollmentId, classGroupId),
        db.prepare(
          "UPDATE enrollments SET class_group_id=NULL,roster_exported_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=? AND class_group_id=?",
        ).bind(enrollmentId, classGroupId),
      ];
  await db.batch([
    ...statements,
    audit(db, member, "remove", "enrollment_class", enrollmentId, {
      classGroupId,
      membershipId: membershipId || null,
    }),
  ]);
  return { ok: true };
}

async function completeClassGroup(member: Member, p: Record<string, unknown>) {
  allow(member, ["admin", "sales", "operations", "operations_finance"]);
  const db = getD1(),
    id = text(p.id || p.classGroupId, 60),
    endDate = isoDate(p.endDate, true)!;
  await requireClassGroupEditor(member, id);
  const current = await db
    .prepare("SELECT id,name,status,start_date,end_date FROM class_groups WHERE id=?")
    .bind(id)
    .first<Record<string, string>>();
  if (!current) throw new ApiError(404, "班级不存在或已删除");
  if (current.status === "completed") return { ok: true, alreadyCompleted: true };
  if (current.status !== "active") throw new ApiError(409, "该班级状态无法结课，请刷新后重试");
  if (current.start_date && endDate < current.start_date)
    throw new ApiError(400, "实际结课日期不能早于班级开课日期");
  await db.batch([
    db
      .prepare(
        "UPDATE class_groups SET status='completed',end_date=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='active'",
      )
      .bind(endDate, id),
    db
      .prepare(
        "UPDATE enrollment_class_memberships SET status='completed',updated_at=CURRENT_TIMESTAMP WHERE class_group_id=? AND status='active'",
      )
      .bind(id),
    db
      .prepare(
        "UPDATE student_class_memberships SET status='completed',updated_at=CURRENT_TIMESTAMP WHERE class_group_id=? AND status='active'",
      )
      .bind(id),
    audit(db, member, "complete", "class_group", id, {
      name: current.name,
      endDate,
    }),
  ]);
  return { ok: true };
}

async function markRosterExported(member: Member, p: Record<string, unknown>) {
  allow(member, ["admin", "sales", "operations", "operations_finance"]);
  const keys = Array.isArray(p.rosterKeys)
    ? p.rosterKeys
        .map((value) => text(value, 160))
        .filter(Boolean)
        .slice(0, 1000)
    : [];
  if (!keys.length) return { ok: true, marked: 0 };
  const db = getD1(),
    now = new Date().toISOString();
  const updates: D1PreparedStatement[] = [];
  for (const key of keys) {
    const [kind, first, second] = key.split(":");
    if (kind === "membership" && first)
      updates.push(
        member.role === "sales"
          ? db.prepare("UPDATE enrollment_class_memberships SET roster_exported_at=COALESCE(roster_exported_at,?),updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='active' AND enrollment_id IN (SELECT id FROM enrollments WHERE salesperson_user_id=? OR created_by=?)").bind(now, first, member.userId, member.userId)
          : db.prepare("UPDATE enrollment_class_memberships SET roster_exported_at=COALESCE(roster_exported_at,?),updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='active'").bind(now, first),
      );
    if (kind === "legacy" && first && second)
      updates.push(
        member.role === "sales"
          ? db.prepare("UPDATE enrollments SET roster_exported_at=COALESCE(roster_exported_at,?),updated_at=CURRENT_TIMESTAMP WHERE id=? AND class_group_id=? AND status='active' AND (salesperson_user_id=? OR created_by=?)").bind(now, first, second, member.userId, member.userId)
          : db.prepare("UPDATE enrollments SET roster_exported_at=COALESCE(roster_exported_at,?),updated_at=CURRENT_TIMESTAMP WHERE id=? AND class_group_id=? AND status='active'").bind(now, first, second),
      );
    if (kind === "studentMembership" && first)
      updates.push(
        member.role === "sales"
          ? db.prepare("UPDATE student_class_memberships SET roster_exported_at=COALESCE(roster_exported_at,?),updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='active' AND student_id IN (SELECT id FROM students WHERE owner_user_id=? OR created_by=?)").bind(now, first, member.userId, member.userId)
          : db.prepare("UPDATE student_class_memberships SET roster_exported_at=COALESCE(roster_exported_at,?),updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='active'").bind(now, first),
      );
  }
  await db.batch([
    ...updates,
    audit(db, member, "update", "enrollment_roster", keys[0], {
      rosterKeys: keys,
      exportedAt: now,
    }),
  ]);
  return { ok: true, marked: updates.length };
}

async function createAgent(member: Member, p: Record<string, unknown>) {
  allow(member, ["admin", "finance", "operations_finance"]);
  const name = text(p.name, 160);
  if (!name) throw new ApiError(400, "请填写渠道名称");
  const type = text(p.commissionType, 20) || "percent";
  const raw = Number(p.commissionValue);
  if (!Number.isFinite(raw) || raw < 0)
    throw new ApiError(400, "佣金设置不正确");
  const value =
    type === "percent" ? Math.round(raw * 100) : Math.round(raw * 100);
  const id = crypto.randomUUID();
  await getD1().batch([
    getD1()
      .prepare(
        "INSERT INTO agents (id,name,contact,commission_type,commission_value,notes) VALUES (?,?,?,?,?,?)",
      )
      .bind(id, name, text(p.contact, 200), type, value, text(p.notes, 1000)),
    audit(getD1(), member, "create", "agent", id, { name, type, value, source: text(p.source, 30) || "manual" }),
  ]);
  return { id };
}

async function createEnrollment(member: Member, p: Record<string, unknown>) {
  allow(member, ["admin", "sales", "operations", "operations_finance"]);
  const db = getD1();
  const studentId = text(p.studentId, 50),
    courseId = text(p.courseId, 50),
    classGroupId = text(p.classGroupId, 50) || null,
    firstLessonDate = isoDate(p.firstLessonDate, true)!;
  if (!text(p.listAmount, 30)) throw new ApiError(400, "请填写课程原价");
  if (!text(p.paymentAmount, 30))
    throw new ApiError(400, "请填写实际收款金额");
  const list = cents(p.listAmount),
    paid = cents(p.paymentAmount);
  if (paid <= 0) throw new ApiError(400, "实际收款金额必须大于 0");
  if (paid > list)
    throw new ApiError(400, "实际收款金额不能高于课程原价");
  const discount = list - paid,
    net = paid;
  const student = await db
    .prepare(
      "SELECT id,owner_user_id,source_agent_id,created_by FROM students WHERE id=? AND status='active'",
    )
    .bind(studentId)
    .first<{
      id: string;
      owner_user_id: string;
      source_agent_id: string | null;
      created_by: string;
    }>();
  if (!student)
    throw new ApiError(
      404,
      "未找到学员档案，请先到“学员档案”创建后再报名",
    );
  if (!canAccessStudent(member, student))
    throw new ApiError(403, "课程顾问只能为自己负责或创建的学员登记报名");
  const course = await db
    .prepare("SELECT id,currency FROM courses WHERE id=? AND active=1")
    .bind(courseId)
    .first<{ id: string; currency: string }>();
  if (!course) throw new ApiError(404, "课程不存在");
  const classGroup = classGroupId
    ? await db
        .prepare(
          "SELECT id,name,end_date FROM class_groups WHERE id=? AND course_id=? AND status='active'",
        )
        .bind(classGroupId, courseId)
        .first<{ id: string; name: string; end_date: string | null }>()
    : null;
  if (classGroupId && !classGroup)
    throw new ApiError(400, "所选班级不属于该课程或已经结课，请重新选择");
  let expectedEndDate: string | null;
  try { expectedEndDate = resolveEnrollmentEndDate(p.expectedEndDate, classGroup?.end_date, p.expectedEndDateMode); }
  catch (error) { throw new ApiError(400, error instanceof Error ? error.message : "结束日期不正确"); }
  if (expectedEndDate && expectedEndDate < firstLessonDate)
    throw new ApiError(400, "结束日期不能早于加入第一次课日期");
  const agentId = student.source_agent_id || null;
  const currency = ["SGD", "CNY"].includes(text(p.currency, 3))
      ? text(p.currency, 3)
      : course.currency,
    registrationType =
      text(p.registrationType, 10) === "renewal" ? "renewal" : "new";
  const salesperson =
    member.role === "sales"
      ? member.userId
      : student.owner_user_id || member.userId;
  const id = crypto.randomUUID(),
    registered = businessDate(),
    number = `ENR-${registered.replaceAll("-", "")}-${compactId().slice(0, 4)}`;
  const screenshots = Array.isArray(p.registrationScreenshots)
    ? p.registrationScreenshots.filter(
        (value): value is File => value instanceof File && value.size > 0,
      )
    : [];
  if (screenshots.length > 5)
    throw new ApiError(400, "付款截图最多上传 5 张");
  const screenshotRecords: Array<{
    id: string;
    key: string;
    name: string;
    type: string;
    size: number;
  }> = [];
  for (const screenshot of screenshots) {
    if (screenshot.size > MAX_SCREENSHOT_BYTES)
      throw new ApiError(400, `付款截图“${screenshot.name}”不能超过 10MB`);
    const extension = screenshot.name.split(".").pop()?.toLowerCase() ?? "";
    if (!screenshotExtensions.has(extension))
      throw new ApiError(400, "付款截图仅支持 JPG、PNG、WEBP 或 PDF");
    const name = screenshot.name.slice(0, 180);
    const type =
      screenshot.type ||
      ({
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png",
        webp: "image/webp",
        pdf: "application/pdf",
      }[extension] ?? "application/octet-stream");
    const record = {
      id: crypto.randomUUID(),
      key: `enrollment-screenshots/${id}/${crypto.randomUUID()}-${safeFileName(name)}`,
      name,
      type,
      size: screenshot.size,
    };
    await getBucket().put(record.key, await screenshot.arrayBuffer(), {
      httpMetadata: { contentType: type },
      customMetadata: { uploadedBy: member.userId, enrollmentId: id },
    });
    screenshotRecords.push(record);
  }
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        "INSERT INTO enrollments (id,number,student_id,course_id,class_group_id,salesperson_user_id,agent_id,registration_type,quantity,list_amount_cents,discount_cents,net_amount_cents,currency,registered_at,start_date,expected_end_date,registration_screenshot_key,registration_screenshot_name,registration_screenshot_type,registration_screenshot_uploaded_at,status,notes,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'active',?,?)",
      )
      .bind(
        id,
        number,
        studentId,
        courseId,
        classGroupId,
        salesperson,
        agentId,
        registrationType,
        Math.max(1, Math.round(Number(p.quantity) || 1)),
        list,
        discount,
        net,
        currency,
        registered,
        firstLessonDate,
        expectedEndDate,
        null,
        null,
        null,
        null,
        text(p.notes, 2000),
        member.userId,
      ),
  ];
  for (const screenshot of screenshotRecords) {
    statements.push(
      db
        .prepare(
          "INSERT INTO enrollment_screenshots (id,enrollment_id,object_key,file_name,content_type,size_bytes,uploaded_by) VALUES (?,?,?,?,?,?,?)",
        )
        .bind(
          screenshot.id,
          id,
          screenshot.key,
          screenshot.name,
          screenshot.type,
          screenshot.size,
          member.userId,
        ),
    );
  }
  if (agentId) {
    const a = await db
      .prepare(
        "SELECT commission_type,commission_value FROM agents WHERE id=? AND active=1",
      )
      .bind(agentId)
      .first<{ commission_type: string; commission_value: number }>();
    if (!a) throw new ApiError(400, "渠道不存在");
    const amount =
      a.commission_type === "percent"
        ? Math.round((net * a.commission_value) / 10000)
        : a.commission_value;
    statements.push(
      db
        .prepare(
          "INSERT INTO commissions (id,enrollment_id,agent_id,basis_cents,rate_bps,amount_cents,status) VALUES (?,?,?,?,?,?,'pending')",
        )
        .bind(
          crypto.randomUUID(),
          id,
          agentId,
          net,
          a.commission_type === "percent" ? a.commission_value : 0,
          amount,
        ),
    );
  }
  if (paid > 0) {
    const paymentId = crypto.randomUUID();
    const paidAt = isoDate(p.paidAt, true)!;
    const paymentMethod = text(p.paymentMethod, 50) || "银行转账";
    const paymentReference = text(p.paymentReference, 120);
    statements.push(
      paymentStatement(
        db,
        member,
        id,
        currency,
        paid,
        paidAt,
        paymentMethod,
        paymentReference,
        paymentId,
      ),
      audit(db, member, "create", "payment", paymentId, {
        enrollmentId: id,
        enrollmentNumber: number,
        amountCents: paid,
        currency,
        paidAt,
        method: paymentMethod,
        reference: paymentReference,
        source: text(p.source, 30) || "manual",
      }),
    );
  }
  statements.push(
    audit(db, member, "create", "enrollment", id, {
      number,
      net,
      classGroupId,
      classGroupName: classGroup?.name ?? null,
      firstLessonDate,
      expectedEndDate,
      paymentScreenshotCount: screenshotRecords.length,
      paymentScreenshotNames: screenshotRecords.map((item) => item.name),
      source: text(p.source, 30) || "manual",
    }),
  );
  try {
    await db.batch(statements);
  } catch (error) {
    if (screenshotRecords.length) {
      try {
        await getBucket().delete(screenshotRecords.map((item) => item.key));
      } catch {
        /* keep original database error */
      }
    }
    throw error;
  }
  return {
    id,
    number,
    currency,
    paidCents: paid,
    classGroupName: classGroup?.name ?? null,
    firstLessonDate,
    expectedEndDate,
    paymentScreenshotCount: screenshotRecords.length,
  };
}

async function createFollowup(member: Member, p: Record<string, unknown>) {
  allow(member, ["admin", "sales", "operations", "operations_finance"]);
  const db = getD1(),
    studentId = text(p.studentId, 60),
    followedAt = isoDate(p.followedAt, true)!,
    note = text(p.note, 3000);
  if (!note) throw new ApiError(400, "请填写本次跟进内容");
  const student = await db
    .prepare(
      "SELECT id,owner_user_id,created_by FROM students WHERE id=? AND status='active'",
    )
    .bind(studentId)
    .first<{ id: string; owner_user_id: string; created_by: string }>();
  if (!student) throw new ApiError(404, "学员不存在");
  if (!canAccessStudent(member, student))
    throw new ApiError(403, "你不能记录其他课程顾问负责的学员");
  const salesperson = student.owner_user_id || member.userId,
    id = crypto.randomUUID();
  await db.batch([
    db
      .prepare(
        "INSERT INTO student_followups (id,student_id,salesperson_user_id,followed_at,method,note,next_follow_up_at,created_by) VALUES (?,?,?,?,?,?,?,?)",
      )
      .bind(
        id,
        studentId,
        salesperson,
        followedAt,
        text(p.method, 30) || "微信",
        note,
        isoDate(p.nextFollowUpAt),
        member.userId,
      ),
    audit(db, member, "create", "student_followup", id, {
      studentId,
      followedAt,
      salesperson,
      source: text(p.source, 30) || "manual",
    }),
  ]);
  return { id };
}

async function recordPayment(member: Member, p: Record<string, unknown>) {
  allow(member, ["admin", "finance", "sales", "operations_finance"]);
  const db = getD1(),
    id = text(p.enrollmentId, 50);
  const e = await db
    .prepare(
      "SELECT id,currency,net_amount_cents,salesperson_user_id,created_by,(SELECT COALESCE(SUM(amount_cents),0) FROM payments WHERE enrollment_id=enrollments.id AND status='confirmed') paid FROM enrollments WHERE id=? AND status!='void'",
    )
    .bind(id)
    .first<Record<string, number | string>>();
  if (!e) throw new ApiError(404, "报名记录不存在");
  if (!canAccessEnrollment(member, e))
    throw new ApiError(403, "你不能操作其他课程顾问的收款");
  const amount = cents(p.amount);
  if (amount <= 0 || Number(e.paid) + amount > Number(e.net_amount_cents))
    throw new ApiError(400, "收款金额超过未收余额");
  const pid = crypto.randomUUID();
  await db.batch([
    paymentStatement(
      db,
      member,
      id,
      String(e.currency),
      amount,
      isoDate(p.paidAt, true)!,
      text(p.method, 50) || "银行转账",
      text(p.reference, 120),
      pid,
    ),
    audit(db, member, "create", "payment", pid, { enrollmentId: id, amount, source: text(p.source, 30) || "manual" }),
  ]);
  return { id: pid };
}

const refundRoles: Member["role"][] = [
  "admin",
  "finance",
  "sales",
  "operations",
  "operations_finance",
];

async function refundEnrollment(member: Member, enrollmentId: string) {
  allow(member, refundRoles);
  const enrollment = await getD1()
    .prepare(
      `SELECT e.id,e.number,e.student_id,e.salesperson_user_id,e.created_by,e.class_group_id,e.currency,e.net_amount_cents,e.status,e.created_at,
      COALESCE((SELECT SUM(p.amount_cents) FROM payments p WHERE p.enrollment_id=e.id AND p.status='confirmed'),0) paid_cents
      FROM enrollments e WHERE e.id=? AND e.status!='void'`,
    )
    .bind(enrollmentId)
    .first<Record<string, unknown>>();
  if (!enrollment) throw new ApiError(404, "报名记录不存在");
  if (!canAccessEnrollment(member, enrollment))
    throw new ApiError(403, "课程顾问只能处理自己负责学员的退费");
  return enrollment;
}

async function saveRefundProof(
  member: Member,
  enrollmentId: string,
  refundId: string,
  value: unknown,
) {
  if (!(value instanceof File) || value.size <= 0) return null;
  if (value.size > MAX_SCREENSHOT_BYTES)
    throw new ApiError(400, "退款凭证不能超过 10MB");
  const extension = value.name.split(".").pop()?.toLowerCase() ?? "";
  if (!screenshotExtensions.has(extension))
    throw new ApiError(400, "退款凭证仅支持 JPG、PNG、WEBP 或 PDF");
  const fileName = value.name.slice(0, 180);
  const contentType =
    value.type ||
    ({
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
      pdf: "application/pdf",
    }[extension] ?? "application/octet-stream");
  const objectKey = `refund-proofs/${enrollmentId}/${refundId}-${crypto.randomUUID()}-${safeFileName(fileName)}`;
  await getBucket().put(objectKey, await value.arrayBuffer(), {
    httpMetadata: { contentType },
    customMetadata: { uploadedBy: member.userId, enrollmentId, refundId },
  });
  return { objectKey, fileName, contentType };
}

async function refundReconciliation(
  db: D1Database,
  member: Member,
  enrollment: Record<string, unknown>,
  refundId: string,
  nextStatus: string,
  nextAmount: number,
  lastLessonDate: string,
) {
  const other = await db
    .prepare(
      "SELECT COALESCE(SUM(amount_cents),0) total FROM refunds WHERE enrollment_id=? AND id!=? AND status='confirmed'",
    )
    .bind(enrollment.id, refundId)
    .first<{ total: number }>();
  const confirmedTotal =
    Number(other?.total || 0) + (nextStatus === "confirmed" ? nextAmount : 0);
  const paid = Number(enrollment.paid_cents || 0);
  const nextEnrollmentStatus = confirmedTotal
    ? confirmedTotal >= paid
      ? "refunded"
      : "partial_refund"
    : "active";
  const remainingBasis = Math.max(
    0,
    Number(enrollment.net_amount_cents || 0) - confirmedTotal,
  );
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        "UPDATE commissions SET basis_cents=?,amount_cents=CASE WHEN rate_bps>0 THEN CAST(ROUND(?*rate_bps/10000.0) AS INTEGER) ELSE amount_cents END,updated_at=CURRENT_TIMESTAMP WHERE enrollment_id=? AND status='pending'",
      )
      .bind(remainingBasis, remainingBasis, enrollment.id),
  ];
  if (nextStatus === "confirmed") {
    if (enrollment.class_group_id) {
      const membershipId = crypto.randomUUID();
      statements.push(
        db
          .prepare(
            "INSERT OR IGNORE INTO enrollment_class_memberships (id,enrollment_id,class_group_id,status,joined_at,removed_at,created_by) VALUES (?,?,?,'removed',?,?,?)",
          )
          .bind(
            membershipId,
            enrollment.id,
            enrollment.class_group_id,
            enrollment.created_at,
            lastLessonDate,
            member.userId,
          ),
      );
    }
    statements.push(
      db
        .prepare(
          "UPDATE enrollment_class_memberships SET status='removed',removed_at=?,updated_at=CURRENT_TIMESTAMP WHERE enrollment_id=? AND status='active'",
        )
        .bind(lastLessonDate, enrollment.id),
      db
        .prepare(
          "UPDATE student_class_memberships SET status='removed',removed_at=?,updated_at=CURRENT_TIMESTAMP WHERE student_id=? AND status='active' AND class_group_id IN (SELECT class_group_id FROM enrollment_class_memberships WHERE enrollment_id=? UNION SELECT class_group_id FROM enrollments WHERE id=? AND class_group_id IS NOT NULL)",
        )
        .bind(lastLessonDate, enrollment.student_id, enrollment.id, enrollment.id),
      db
        .prepare(
          "UPDATE enrollments SET class_group_id=NULL,actual_end_date=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
        )
        .bind(lastLessonDate, nextEnrollmentStatus, enrollment.id),
    );
  } else if (["refunded", "partial_refund"].includes(String(enrollment.status))) {
    statements.push(
      db
        .prepare(
          "UPDATE enrollments SET status=?,actual_end_date=CASE WHEN ?='active' THEN NULL ELSE actual_end_date END,updated_at=CURRENT_TIMESTAMP WHERE id=?",
        )
        .bind(nextEnrollmentStatus, nextEnrollmentStatus, enrollment.id),
    );
  }
  return { statements, confirmedTotal, nextEnrollmentStatus };
}

async function createRefund(member: Member, p: Record<string, unknown>) {
  const db = getD1();
  const enrollmentId = text(p.enrollmentId, 60);
  const enrollment = await refundEnrollment(member, enrollmentId);
  const amount = cents(p.amount);
  if (amount <= 0) throw new ApiError(400, "退费金额必须大于 0");
  const existing = await db
    .prepare(
      "SELECT COALESCE(SUM(amount_cents),0) total FROM refunds WHERE enrollment_id=? AND status!='cancelled'",
    )
    .bind(enrollmentId)
    .first<{ total: number }>();
  if (Number(existing?.total || 0) + amount > Number(enrollment.paid_cents || 0))
    throw new ApiError(400, "累计退费金额不能超过已确认收款");
  const status = text(p.status, 20) === "confirmed" ? "confirmed" : "pending";
  const requestedAt = isoDate(p.requestedAt, true)!;
  const refundedAt = status === "confirmed" ? isoDate(p.refundedAt || requestedAt, true)! : null;
  const lastLessonDate = isoDate(p.lastLessonDate, true)!;
  const reason = text(p.reason, 2000);
  if (!reason) throw new ApiError(400, "请填写退费原因");
  const id = crypto.randomUUID();
  const proof = await saveRefundProof(member, enrollmentId, id, p.refundProof);
  const reconciliation = await refundReconciliation(
    db,
    member,
    enrollment,
    id,
    status,
    amount,
    lastLessonDate,
  );
  try {
    await db.batch([
      db
        .prepare(
          "INSERT INTO refunds (id,enrollment_id,amount_cents,currency,requested_at,refunded_at,last_lesson_date,method,reference,reason,status,proof_object_key,proof_file_name,proof_content_type,created_by,confirmed_by,confirmed_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CASE WHEN ?='confirmed' THEN CURRENT_TIMESTAMP ELSE NULL END)",
        )
        .bind(
          id,
          enrollmentId,
          amount,
          enrollment.currency,
          requestedAt,
          refundedAt,
          lastLessonDate,
          text(p.method, 50) || "银行转账",
          text(p.reference, 120),
          reason,
          status,
          proof?.objectKey ?? null,
          proof?.fileName ?? null,
          proof?.contentType ?? null,
          member.userId,
          status === "confirmed" ? member.userId : null,
          status,
        ),
      ...reconciliation.statements,
      audit(db, member, "create", "refund", id, {
        enrollmentId,
        amountCents: amount,
        currency: enrollment.currency,
        status,
        lastLessonDate,
        proofFileName: proof?.fileName ?? null,
      }),
    ]);
  } catch (error) {
    if (proof) try { await getBucket().delete(proof.objectKey); } catch {}
    throw error;
  }
  return { id, status, enrollmentStatus: reconciliation.nextEnrollmentStatus };
}

async function updateRefund(member: Member, p: Record<string, unknown>) {
  const db = getD1(), id = text(p.id, 60);
  const current = await db
    .prepare("SELECT * FROM refunds WHERE id=?")
    .bind(id)
    .first<Record<string, unknown>>();
  if (!current) throw new ApiError(404, "退费记录不存在");
  const enrollment = await refundEnrollment(member, String(current.enrollment_id));
  const amount = cents(p.amount);
  if (amount <= 0) throw new ApiError(400, "退费金额必须大于 0");
  const other = await db
    .prepare("SELECT COALESCE(SUM(amount_cents),0) total FROM refunds WHERE enrollment_id=? AND id!=? AND status!='cancelled'")
    .bind(current.enrollment_id, id)
    .first<{ total: number }>();
  if (Number(other?.total || 0) + amount > Number(enrollment.paid_cents || 0))
    throw new ApiError(400, "累计退费金额不能超过已确认收款");
  const status = text(p.status, 20) === "confirmed" ? "confirmed" : "pending";
  const requestedAt = isoDate(p.requestedAt, true)!;
  const refundedAt = status === "confirmed" ? isoDate(p.refundedAt || requestedAt, true)! : null;
  const lastLessonDate = isoDate(p.lastLessonDate, true)!;
  const reason = text(p.reason, 2000);
  if (!reason) throw new ApiError(400, "请填写退费原因");
  const proof = await saveRefundProof(member, String(current.enrollment_id), id, p.refundProof);
  const reconciliation = await refundReconciliation(db, member, enrollment, id, status, amount, lastLessonDate);
  try {
    await db.batch([
      db.prepare("UPDATE refunds SET amount_cents=?,requested_at=?,refunded_at=?,last_lesson_date=?,method=?,reference=?,reason=?,status=?,proof_object_key=?,proof_file_name=?,proof_content_type=?,confirmed_by=?,confirmed_at=CASE WHEN ?='confirmed' THEN CURRENT_TIMESTAMP ELSE NULL END,updated_at=CURRENT_TIMESTAMP WHERE id=?")
        .bind(amount,requestedAt,refundedAt,lastLessonDate,text(p.method,50)||"银行转账",text(p.reference,120),reason,status,proof?.objectKey??current.proof_object_key,proof?.fileName??current.proof_file_name,proof?.contentType??current.proof_content_type,status==="confirmed"?member.userId:null,status,id),
      ...reconciliation.statements,
      audit(db,member,"update","refund",id,{enrollmentId:current.enrollment_id,amountCents:amount,status,lastLessonDate}),
    ]);
  } catch (error) {
    if (proof) try { await getBucket().delete(proof.objectKey); } catch {}
    throw error;
  }
  if (proof && current.proof_object_key) try { await getBucket().delete(String(current.proof_object_key)); } catch {}
  return { ok: true, status, enrollmentStatus: reconciliation.nextEnrollmentStatus };
}

async function cancelRefund(member: Member, p: Record<string, unknown>) {
  const db = getD1(), id = text(p.id, 60);
  const current = await db.prepare("SELECT * FROM refunds WHERE id=?").bind(id).first<Record<string, unknown>>();
  if (!current) throw new ApiError(404, "退费记录不存在");
  const enrollment = await refundEnrollment(member, String(current.enrollment_id));
  const reconciliation = await refundReconciliation(db,member,enrollment,id,"cancelled",0,String(current.last_lesson_date));
  await db.batch([
    db.prepare("UPDATE refunds SET status='cancelled',confirmed_by=NULL,confirmed_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(id),
    ...reconciliation.statements,
    audit(db,member,"cancel","refund",id,{enrollmentId:current.enrollment_id}),
  ]);
  return { ok: true, enrollmentStatus: reconciliation.nextEnrollmentStatus };
}

async function deleteRefund(member: Member, p: Record<string, unknown>) {
  const db = getD1(), id = text(p.id, 60);
  const current = await db.prepare("SELECT * FROM refunds WHERE id=?").bind(id).first<Record<string, unknown>>();
  if (!current) throw new ApiError(404, "退费记录不存在");
  const enrollment = await refundEnrollment(member, String(current.enrollment_id));
  const reconciliation = await refundReconciliation(db,member,enrollment,id,"deleted",0,String(current.last_lesson_date));
  await db.batch([
    db.prepare("DELETE FROM refunds WHERE id=?").bind(id),
    ...reconciliation.statements,
    audit(db,member,"delete","refund",id,{enrollmentId:current.enrollment_id,amountCents:current.amount_cents,status:current.status}),
  ]);
  if (current.proof_object_key) try { await getBucket().delete(String(current.proof_object_key)); } catch {}
  return { ok: true, enrollmentStatus: reconciliation.nextEnrollmentStatus };
}

async function finishCourse(member: Member, p: Record<string, unknown>) {
  allow(member, ["admin", "sales", "operations", "operations_finance"]);
  const id = text(p.enrollmentId, 50),
    date = isoDate(p.actualEndDate, true)!;
  const enrollment = await getD1()
    .prepare("SELECT salesperson_user_id,created_by FROM enrollments WHERE id=? AND status='active'")
    .bind(id)
    .first<{ salesperson_user_id: string; created_by: string }>();
  if (!enrollment) throw new ApiError(404, "未找到进行中的课程");
  if (!canAccessEnrollment(member, enrollment))
    throw new ApiError(403, "课程顾问只能处理自己负责学员的结课");
  const r = await getD1()
    .prepare(
      "UPDATE enrollments SET actual_end_date=?,status='completed',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='active'",
    )
    .bind(date, id)
    .run();
  if (!r.meta.changes) throw new ApiError(409, "课程状态已经发生变化，请刷新后重试");
  await getD1()
    .prepare(
      "INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,detail_json) VALUES (?,?,?,?,?,?)",
    )
    .bind(
      crypto.randomUUID(),
      member.userId,
      "complete",
      "enrollment",
      id,
      JSON.stringify({ date }),
    )
    .run();
  return { ok: true };
}
async function createMember(member: Member, p: Record<string, unknown>) {
  allow(member, ["admin"]);
  const db = getD1(),
    email = text(p.email, 180).toLowerCase(),
    displayName = text(p.displayName, 120),
    role = text(p.role, 20);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new ApiError(400, "请填写正确的员工邮箱");
  if (!displayName) throw new ApiError(400, "请填写员工姓名");
  if (
    !["admin", "finance", "sales", "operations", "operations_finance"].includes(
      role,
    )
  )
    throw new ApiError(400, "请选择员工角色");
  const existing = await db
    .prepare(
      "SELECT id,user_id,status FROM members WHERE lower(email)=lower(?) ORDER BY created_at LIMIT 1",
    )
    .bind(email)
    .first<Record<string, string>>();
  if (existing?.status === "deleted") {
    const restoredStatus = existing.user_id.startsWith("invite:")
      ? "invited"
      : "active";
    await db.batch([
      db
        .prepare(
          "UPDATE members SET display_name=?,role=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
        )
        .bind(displayName, role, restoredStatus, existing.id),
      audit(db, member, "restore", "member", existing.id, { email, role }),
    ]);
    return { id: existing.id, email, status: restoredStatus };
  }
  if (existing)
    throw new ApiError(
      409,
      existing.status === "disabled"
        ? "该邮箱已有停用账号，可在员工列表中重新启用"
        : "该邮箱已经在员工列表中",
    );
  const id = crypto.randomUUID();
  await db.batch([
    db
      .prepare(
        "INSERT INTO members (id,user_id,email,display_name,role,status) VALUES (?,?,?,?,?,'invited')",
      )
      .bind(id, `invite:${crypto.randomUUID()}`, email, displayName, role),
    audit(db, member, "invite", "member", id, { email, role }),
  ]);
  return { id, email, status: "invited" };
}
async function updateMember(member: Member, p: Record<string, unknown>) {
  allow(member, ["admin"]);
  const id = text(p.id, 50),
    role = text(p.role, 20),
    requestedStatus = text(p.status, 20) || "active";
  if (
    ![
      "admin",
      "finance",
      "sales",
      "operations",
      "operations_finance",
      "pending",
    ].includes(role) ||
    !["active", "invited", "disabled"].includes(requestedStatus)
  )
    throw new ApiError(400, "权限设置不正确");
  if (id === member.id && requestedStatus !== "active")
    throw new ApiError(400, "不能停用自己的账号");
  const db = getD1();
  const target = await db
    .prepare("SELECT user_id,email,display_name,role,status FROM members WHERE id=?")
    .bind(id)
    .first<Record<string, string>>();
  if (!target) throw new ApiError(404, "员工账号不存在");
  const status =
    target.user_id.startsWith("invite:") && requestedStatus === "active"
      ? "invited"
      : requestedStatus;
  await db.batch([
    db.prepare(
      "UPDATE members SET role=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
    ).bind(role, status, id),
    audit(db, member, "update", "member", id, {
      label: `${target.display_name} ${target.email}`,
      before: { role: target.role, status: target.status },
      after: { role, status },
    }),
  ]);
  return { ok: true };
}
async function transferMemberCustomers(
  member: Member,
  p: Record<string, unknown>,
) {
  allow(member, ["admin"]);
  const db = getD1(),
    fromMemberId = text(p.fromMemberId, 50),
    toMemberId = text(p.toMemberId, 50),
    deleteSource = p.deleteSource === true || p.deleteSource === "true";
  if (!fromMemberId || !toMemberId)
    throw new ApiError(400, "请选择原负责人和接手员工");
  if (fromMemberId === toMemberId)
    throw new ApiError(400, "接手员工不能与原负责人相同");
  if (fromMemberId === member.id && deleteSource)
    throw new ApiError(400, "不能删除自己当前使用的账号");
  const [source, target] = await Promise.all([
    db
      .prepare(
        "SELECT id,user_id,email,display_name,status FROM members WHERE id=? AND status!='deleted'",
      )
      .bind(fromMemberId)
      .first<Record<string, string>>(),
    db
      .prepare(
        "SELECT id,user_id,email,display_name,role,status FROM members WHERE id=? AND status='active' AND role IN ('admin','sales','operations','operations_finance')",
      )
      .bind(toMemberId)
      .first<Record<string, string>>(),
  ]);
  if (!source) throw new ApiError(404, "原负责人账号不存在");
  if (!target)
    throw new ApiError(
      400,
      "接手员工必须是已启用的管理员、课程顾问、教务运营或教务运营财务",
    );
  const count = await db
    .prepare("SELECT COUNT(*) total FROM students WHERE owner_user_id=?")
    .bind(source.user_id)
    .first<{ total: number }>();
  const customerCount = Number(count?.total ?? 0);
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        "UPDATE students SET owner_user_id=?,updated_at=CURRENT_TIMESTAMP WHERE owner_user_id=?",
      )
      .bind(target.user_id, source.user_id),
    audit(db, member, "transfer", "member_customers", fromMemberId, {
      fromUserId: source.user_id,
      fromName: source.display_name,
      toUserId: target.user_id,
      toName: target.display_name,
      customerCount,
      deleteSource,
    }),
  ];
  if (deleteSource)
    statements.push(
      db
        .prepare(
          "UPDATE members SET status='deleted',updated_at=CURRENT_TIMESTAMP WHERE id=?",
        )
        .bind(fromMemberId),
    );
  await db.batch(statements);
  return {
    ok: true,
    customerCount,
    sourceName: source.display_name,
    targetName: target.display_name,
    sourceDeleted: deleteSource,
  };
}
async function deleteMember(member: Member, p: Record<string, unknown>) {
  allow(member, ["admin"]);
  const db = getD1(),
    id = text(p.id, 50);
  if (!id) throw new ApiError(400, "请选择员工账号");
  if (id === member.id) throw new ApiError(400, "不能删除自己当前使用的账号");
  const target = await db
    .prepare(
      "SELECT id,user_id,email,display_name,role,status FROM members WHERE id=? AND status!='deleted'",
    )
    .bind(id)
    .first<Record<string, string>>();
  if (!target) throw new ApiError(404, "员工账号不存在或已删除");
  const assigned = await db
    .prepare("SELECT COUNT(*) total FROM students WHERE owner_user_id=?")
    .bind(target.user_id)
    .first<{ total: number }>();
  if (Number(assigned?.total ?? 0) > 0)
    throw new ApiError(
      409,
      `该员工还有 ${Number(assigned?.total ?? 0)} 位负责客户，请先完成客户交接`,
    );
  await db.batch([
    db
      .prepare(
        "UPDATE members SET status='deleted',updated_at=CURRENT_TIMESTAMP WHERE id=?",
      )
      .bind(id),
    audit(db, member, "delete", "member", id, {
      email: target.email,
      displayName: target.display_name,
      role: target.role,
    }),
  ]);
  return { ok: true };
}
async function invoiceSource(member: Member, p: Record<string, unknown>) {
  allow(member, ["admin", "finance", "sales", "operations_finance"]);
  const db = getD1();
  const paymentId = text(p.paymentId, 50);
  const enrollmentId = text(p.enrollmentId, 50);
  if (!paymentId && !enrollmentId)
    throw new ApiError(400, "请选择需要开票的报名或收款");
  const row = paymentId
    ? await db
        .prepare(
          "SELECT e.*,p.id payment_id,p.amount_cents invoice_amount_cents,p.paid_at,p.method,p.reference,s.full_name student_name,c.name course_name,g.full_name guardian_name,g.email guardian_email,g.phone guardian_phone FROM payments p JOIN enrollments e ON e.id=p.enrollment_id JOIN students s ON s.id=e.student_id JOIN courses c ON c.id=e.course_id LEFT JOIN student_guardians sg ON sg.student_id=s.id AND sg.is_primary=1 LEFT JOIN guardians g ON g.id=sg.guardian_id WHERE p.id=? AND p.status='confirmed'",
        )
        .bind(paymentId)
        .first<Record<string, unknown>>()
    : await db
        .prepare(
          "SELECT e.*,NULL payment_id,COALESCE(SUM(CASE WHEN pay.status='confirmed' THEN pay.amount_cents ELSE 0 END),0) invoice_amount_cents,s.full_name student_name,c.name course_name,g.full_name guardian_name,g.email guardian_email,g.phone guardian_phone FROM enrollments e JOIN students s ON s.id=e.student_id JOIN courses c ON c.id=e.course_id LEFT JOIN student_guardians sg ON sg.student_id=s.id AND sg.is_primary=1 LEFT JOIN guardians g ON g.id=sg.guardian_id LEFT JOIN payments pay ON pay.enrollment_id=e.id WHERE e.id=? GROUP BY e.id",
        )
        .bind(enrollmentId)
        .first<Record<string, unknown>>();
  if (!row) throw new ApiError(404, "未找到可开票的收款记录");
  if (!canAccessEnrollment(member, row))
    throw new ApiError(403, "你不能为其他课程顾问的报名开票");
  return row;
}

async function invoiceDraft(member: Member, p: Record<string, unknown>) {
  const row = await invoiceSource(member, p);
  const amountCents = Number(row.invoice_amount_cents || 0),
    quantity = Math.max(1, Number(row.quantity || 1)),
    rateCents = Math.round(amountCents / quantity);
  const start = row.start_date ? `\nStarting ${String(row.start_date)}` : "";
  return {
    enrollmentId: String(row.id),
    paymentId: String(row.payment_id || ""),
    invoiceNumber: `MA-${datePrefix()}-${compactId().slice(0, 4)}`,
    invoiceDate: new Date().toISOString().slice(0, 10),
    billTo: String(row.guardian_name || row.student_name || ""),
    studentName: String(row.student_name || ""),
    description: `${String(row.course_name || "Course Fee")}\n${quantity} lessons total${start}`,
    quantity: String(quantity),
    rate: (rateCents / 100).toFixed(2),
    amount: (amountCents / 100).toFixed(2),
    taxPercent: "0",
    currency: String(row.currency || "SGD"),
    paymentTerms: "Due upon receipt",
    notes: "",
  };
}

async function createInvoice(member: Member, p: Record<string, unknown>) {
  const db = getD1(),
    row = await invoiceSource(member, p);
  const number =
      text(p.invoiceNumber, 80) ||
      `MA-${datePrefix()}-${compactId().slice(0, 4)}`,
    invoiceDate = isoDate(p.invoiceDate, true)!;
  const billTo = text(p.billTo, 200),
    description = text(p.description, 2000),
    paymentTerms = text(p.paymentTerms, 200) || "Due upon receipt",
    notes = text(p.notes, 1000);
  const quantity = Number(p.quantity),
    rateCents = cents(p.rate),
    amountCents = cents(p.amount),
    taxPercent = Number(p.taxPercent ?? 0),
    currency = text(p.currency, 3).toUpperCase();
  if (!billTo || !description) throw new ApiError(400, "请填写抬头和项目说明");
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 99999)
    throw new ApiError(400, "数量不正确");
  if (amountCents <= 0) throw new ApiError(400, "发票金额必须大于 0");
  if (!Number.isFinite(taxPercent) || taxPercent < 0 || taxPercent > 100)
    throw new ApiError(400, "税率不正确");
  if (!["SGD", "CNY", "USD"].includes(currency))
    throw new ApiError(400, "请选择正确的币种");
  const duplicate = await db
    .prepare("SELECT id FROM invoices WHERE number=? LIMIT 1")
    .bind(number)
    .first();
  if (duplicate) throw new ApiError(409, "该发票编号已经存在，请修改后再确认");
  const taxCents = Math.round((amountCents * taxPercent) / 100),
    totalCents = amountCents + taxCents,
    id = crypto.randomUUID();
  const invoice = {
    invoiceDate,
    billTo,
    description,
    quantity,
    rateCents,
    amountCents,
    taxPercent,
    taxCents,
    totalCents,
    currency,
    paymentTerms,
    notes,
  };
  const snapshot = { ...row, invoice };
  await db.batch([
    db
      .prepare(
        "INSERT INTO invoices (id,number,type,enrollment_id,payment_id,currency,total_cents,status,snapshot_json,created_by) VALUES (?,?,'customer',?,?,?,?,'issued',?,?)",
      )
      .bind(
        id,
        number,
        row.id,
        row.payment_id,
        currency,
        totalCents,
        JSON.stringify(snapshot),
        member.userId,
      ),
    audit(db, member, "create", "invoice", id, {
      number,
      enrollmentId: row.id,
      paymentId: row.payment_id,
      invoiceDate,
      totalCents,
      currency,
    }),
  ]);
  return { id, number };
}

async function createAgentStatement(
  member: Member,
  p: Record<string, unknown>,
) {
  allow(member, ["admin", "finance", "operations_finance"]);
  const db = getD1(),
    agentId = text(p.agentId, 50),
    period = text(p.period, 7);
  if (!/^\d{4}-\d{2}$/.test(period)) throw new ApiError(400, "请选择结算月份");
  const agent = await db
    .prepare("SELECT * FROM agents WHERE id=? AND active=1")
    .bind(agentId)
    .first<Record<string, unknown>>();
  if (!agent) throw new ApiError(404, "渠道不存在");
  const lines = await db
    .prepare(
      `SELECT c.id commission_id,c.amount_cents,c.basis_cents,c.rate_bps,e.number enrollment_number,e.registered_at,e.currency,s.full_name student_name,co.name course_name
    FROM commissions c JOIN enrollments e ON e.id=c.enrollment_id JOIN students s ON s.id=e.student_id JOIN courses co ON co.id=e.course_id
    WHERE c.agent_id=? AND substr(e.registered_at,1,7)=? AND c.status='pending' ORDER BY e.registered_at,e.number`,
    )
    .bind(agentId, period)
    .all<Record<string, unknown>>();
  if (!lines.results.length) throw new ApiError(400, "该月份没有待结算佣金");
  const currencies = [
    ...new Set(lines.results.map((line) => String(line.currency))),
  ];
  const unsupportedCurrencies = currencies.filter((currency) => !["SGD", "CNY"].includes(currency));
  if (unsupportedCurrencies.length)
    throw new ApiError(400, `暂不支持将 ${unsupportedCurrencies.join("、")} 折算为人民币`);
  const usesSgd = currencies.includes("SGD");
  const exchangeRate = usesSgd
    ? await latestSgdCnyRate()
    : { date: new Date().toISOString().slice(0, 10), rate: 1, source: "CNY 原币" };
  const convertedLines = lines.results.map((line) => {
    const originalCurrency = String(line.currency);
    const rateToCny = originalCurrency === "SGD" ? exchangeRate.rate : 1;
    return {
      ...line,
      original_currency: originalCurrency,
      exchange_rate_to_cny: rateToCny,
      converted_basis_cents: Math.round(Number(line.basis_cents) * rateToCny),
      converted_amount_cents: Math.round(Number(line.amount_cents) * rateToCny),
    };
  });
  const originalTotals = currencies.map((currency) => ({
    currency,
    basis_cents: lines.results.filter((line) => String(line.currency) === currency).reduce((sum, line) => sum + Number(line.basis_cents), 0),
    amount_cents: lines.results.filter((line) => String(line.currency) === currency).reduce((sum, line) => sum + Number(line.amount_cents), 0),
  }));
  const total = convertedLines.reduce(
      (sum, line) => sum + Number(line.converted_amount_cents),
      0,
    ),
    id = crypto.randomUUID(),
    number = `AGT-${period.replace("-", "")}-${compactId().slice(0, 4)}`;
  const snapshot = {
    agent,
    period,
    lines: convertedLines,
    original_totals: originalTotals,
    exchange_rate: {
      base: "SGD",
      quote: "CNY",
      rate: exchangeRate.rate,
      date: exchangeRate.date,
      source: exchangeRate.source,
      applied: usesSgd,
    },
    total_cents: total,
    currency: "CNY",
  };
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        "INSERT INTO invoices (id,number,type,agent_id,period,currency,total_cents,status,snapshot_json,created_by) VALUES (?,?,'agent_statement',?,?,?,?, 'issued',?,?)",
      )
      .bind(
        id,
        number,
        agentId,
        period,
        "CNY",
        total,
        JSON.stringify(snapshot),
        member.userId,
      ),
    audit(db, member, "create", "agent_statement", id, {
      number,
      agentId,
      period,
      total,
      currency: "CNY",
      originalTotals,
      exchangeRate: exchangeRate.rate,
      exchangeRateDate: exchangeRate.date,
      exchangeRateSource: exchangeRate.source,
    }),
  ];
  for (const line of lines.results)
    statements.push(
      db
        .prepare(
          "UPDATE commissions SET status='settled',settled_month=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending'",
        )
        .bind(period, line.commission_id),
    );
  await db.batch(statements);
  return { id, number, totalCents: total, currency: "CNY", exchangeRate: exchangeRate.rate, exchangeRateDate: exchangeRate.date, exchangeRateApplied: usesSgd };
}

async function latestSgdCnyRate() {
  let response: Response;
  try {
    response = await fetch("https://api.frankfurter.dev/v2/rate/SGD/CNY", {
      headers: { Accept: "application/json" },
    });
  } catch {
    throw new ApiError(503, "暂时无法获取当天 SGD→CNY 汇率，请稍后重试");
  }
  if (!response.ok)
    throw new ApiError(503, "暂时无法获取当天 SGD→CNY 汇率，请稍后重试");
  const data = (await response.json()) as { date?: unknown; rate?: unknown };
  const rate = Number(data.rate);
  const date = text(data.date, 10);
  if (!Number.isFinite(rate) || rate <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date))
    throw new ApiError(503, "当天 SGD→CNY 汇率数据无效，请稍后重试");
  return {
    date,
    rate,
    source: "Frankfurter 官方参考汇率",
  };
}

function paymentStatement(
  db: D1Database,
  member: Member,
  enrollmentId: string,
  currency: string,
  amount: number,
  paidAt: string,
  method: string,
  reference: string,
  id = crypto.randomUUID(),
) {
  return db
    .prepare(
      "INSERT INTO payments (id,enrollment_id,amount_cents,currency,paid_at,method,reference,status,created_by) VALUES (?,?,?,?,?,?,?,'confirmed',?)",
    )
    .bind(
      id,
      enrollmentId,
      amount,
      currency,
      paidAt,
      method,
      reference,
      member.userId,
    );
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
