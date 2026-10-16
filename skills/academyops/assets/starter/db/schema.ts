import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
};

export const members = sqliteTable(
  "members",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    role: text("role").notNull().default("pending"),
    status: text("status").notNull().default("active"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("idx_members_user_id").on(table.userId),
    index("idx_members_role_status").on(table.role, table.status),
  ],
);

export const students = sqliteTable(
  "students",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    fullName: text("full_name").notNull(),
    englishName: text("english_name").notNull().default(""),
    dateOfBirth: text("date_of_birth"),
    school: text("school").notNull().default(""),
    grade: text("grade").notNull().default(""),
    classinAccount: text("classin_account").notNull().default(""),
    firstRegisteredAt: text("first_registered_at"),
    status: text("status").notNull().default("active"),
    ownerUserId: text("owner_user_id"),
    sourceAgentId: text("source_agent_id"),
    sourceKind: text("source_kind").notNull().default("agent"),
    referralParentWechat: text("referral_parent_wechat").notNull().default(""),
    notes: text("notes").notNull().default(""),
    createdBy: text("created_by").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("idx_students_code").on(table.code),
    index("idx_students_name").on(table.fullName),
    index("idx_students_classin").on(table.classinAccount),
    index("idx_students_owner").on(table.ownerUserId),
    index("idx_students_source_agent").on(table.sourceAgentId),
    index("idx_students_first_registered").on(table.firstRegisteredAt),
  ],
);

export const studentCodeCounters = sqliteTable("student_code_counters", {
  year: integer("year").primaryKey(),
  lastNumber: integer("last_number").notNull().default(0),
  ...timestamps,
});

export const guardians = sqliteTable(
  "guardians",
  {
    id: text("id").primaryKey(),
    fullName: text("full_name").notNull(),
    wechatName: text("wechat_name").notNull().default(""),
    phone: text("phone").notNull().default(""),
    email: text("email").notNull().default(""),
    relationship: text("relationship").notNull().default("家长"),
    createdBy: text("created_by").notNull(),
    ...timestamps,
  },
  (table) => [
    index("idx_guardians_phone").on(table.phone),
    index("idx_guardians_email").on(table.email),
  ],
);

export const studentGuardians = sqliteTable(
  "student_guardians",
  {
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    guardianId: text("guardian_id")
      .notNull()
      .references(() => guardians.id),
    isPrimary: integer("is_primary").notNull().default(1),
  },
  (table) => [
    uniqueIndex("idx_student_guardian_unique").on(
      table.studentId,
      table.guardianId,
    ),
    index("idx_student_guardians_guardian").on(table.guardianId),
  ],
);

export const courses = sqliteTable(
  "courses",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    category: text("category").notNull().default("常规课程"),
    standardPriceCents: integer("standard_price_cents").notNull().default(0),
    currency: text("currency").notNull().default("SGD"),
    unitLabel: text("unit_label").notNull().default("课时"),
    active: integer("active").notNull().default(1),
    createdBy: text("created_by"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("idx_courses_name_currency").on(table.name, table.currency),
    index("idx_courses_active").on(table.active),
    index("idx_courses_created_by").on(table.createdBy),
  ],
);

export const agents = sqliteTable(
  "agents",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    contact: text("contact").notNull().default(""),
    commissionType: text("commission_type").notNull().default("percent"),
    commissionValue: integer("commission_value").notNull().default(0),
    active: integer("active").notNull().default(1),
    notes: text("notes").notNull().default(""),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("idx_agents_name").on(table.name),
    index("idx_agents_active").on(table.active),
  ],
);

export const classGroups = sqliteTable(
  "class_groups",
  {
    id: text("id").primaryKey(),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id),
    name: text("name").notNull(),
    classinClassName: text("classin_class_name").notNull().default(""),
    teacherName: text("teacher_name").notNull(),
    startDate: text("start_date").notNull(),
    endDate: text("end_date"),
    scheduleType: text("schedule_type").notNull().default("weekly"),
    classTime: text("class_time").notNull().default(""),
    specificDates: text("specific_dates").notNull().default(""),
    status: text("status").notNull().default("active"),
    notes: text("notes").notNull().default(""),
    createdBy: text("created_by").notNull(),
    ...timestamps,
  },
  (table) => [
    index("idx_class_groups_course_status").on(table.courseId, table.status),
    index("idx_class_groups_start_date").on(table.startDate),
    index("idx_class_groups_created_by").on(table.createdBy),
  ],
);

export const enrollments = sqliteTable(
  "enrollments",
  {
    id: text("id").primaryKey(),
    number: text("number").notNull(),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id),
    classGroupId: text("class_group_id").references(() => classGroups.id),
    salespersonUserId: text("salesperson_user_id").notNull(),
    agentId: text("agent_id").references(() => agents.id),
    registrationType: text("registration_type").notNull().default("new"),
    quantity: integer("quantity").notNull().default(1),
    listAmountCents: integer("list_amount_cents").notNull(),
    discountCents: integer("discount_cents").notNull().default(0),
    netAmountCents: integer("net_amount_cents").notNull(),
    currency: text("currency").notNull().default("SGD"),
    registeredAt: text("registered_at").notNull(),
    startDate: text("start_date"),
    expectedEndDate: text("expected_end_date"),
    actualEndDate: text("actual_end_date"),
    rosterExportedAt: text("roster_exported_at"),
    registrationScreenshotKey: text("registration_screenshot_key"),
    registrationScreenshotName: text("registration_screenshot_name"),
    registrationScreenshotType: text("registration_screenshot_type"),
    registrationScreenshotUploadedAt: text(
      "registration_screenshot_uploaded_at",
    ),
    status: text("status").notNull().default("active"),
    notes: text("notes").notNull().default(""),
    createdBy: text("created_by").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("idx_enrollments_number").on(table.number),
    index("idx_enrollments_student").on(table.studentId),
    index("idx_enrollments_class_status").on(table.classGroupId, table.status),
    index("idx_enrollments_salesperson_date").on(
      table.salespersonUserId,
      table.registeredAt,
    ),
    index("idx_enrollments_type_currency_date").on(
      table.registrationType,
      table.currency,
      table.registeredAt,
    ),
    index("idx_enrollments_agent_date").on(table.agentId, table.registeredAt),
    index("idx_enrollments_end_date").on(table.expectedEndDate),
  ],
);

export const enrollmentScreenshots = sqliteTable(
  "enrollment_screenshots",
  {
    id: text("id").primaryKey(),
    enrollmentId: text("enrollment_id")
      .notNull()
      .references(() => enrollments.id),
    objectKey: text("object_key").notNull(),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    uploadedBy: text("uploaded_by").notNull(),
    uploadedAt: text("uploaded_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_enrollment_screenshots_enrollment").on(table.enrollmentId),
  ],
);

export const enrollmentClassMemberships = sqliteTable(
  "enrollment_class_memberships",
  {
    id: text("id").primaryKey(),
    enrollmentId: text("enrollment_id")
      .notNull()
      .references(() => enrollments.id),
    classGroupId: text("class_group_id")
      .notNull()
      .references(() => classGroups.id),
    status: text("status").notNull().default("active"),
    joinedAt: text("joined_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    removedAt: text("removed_at"),
    rosterExportedAt: text("roster_exported_at"),
    createdBy: text("created_by").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("idx_enrollment_class_membership_unique").on(
      table.enrollmentId,
      table.classGroupId,
    ),
    index("idx_enrollment_class_membership_class_status").on(
      table.classGroupId,
      table.status,
    ),
    index("idx_enrollment_class_membership_enrollment_status").on(
      table.enrollmentId,
      table.status,
    ),
  ],
);

export const studentClassMemberships = sqliteTable(
  "student_class_memberships",
  {
    id: text("id").primaryKey(),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    classGroupId: text("class_group_id")
      .notNull()
      .references(() => classGroups.id),
    status: text("status").notNull().default("active"),
    joinedAt: text("joined_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    removedAt: text("removed_at"),
    rosterExportedAt: text("roster_exported_at"),
    createdBy: text("created_by").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("idx_student_class_membership_unique").on(
      table.studentId,
      table.classGroupId,
    ),
    index("idx_student_class_membership_class_status").on(
      table.classGroupId,
      table.status,
    ),
    index("idx_student_class_membership_student_status").on(
      table.studentId,
      table.status,
    ),
  ],
);

export const studentFollowups = sqliteTable(
  "student_followups",
  {
    id: text("id").primaryKey(),
    studentId: text("student_id")
      .notNull()
      .references(() => students.id),
    salespersonUserId: text("salesperson_user_id").notNull(),
    followedAt: text("followed_at").notNull(),
    method: text("method").notNull().default("微信"),
    note: text("note").notNull(),
    nextFollowUpAt: text("next_follow_up_at"),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_student_followups_student_date").on(
      table.studentId,
      table.followedAt,
    ),
    index("idx_student_followups_sales_date").on(
      table.salespersonUserId,
      table.followedAt,
    ),
    index("idx_student_followups_next_date").on(table.nextFollowUpAt),
  ],
);

export const payments = sqliteTable(
  "payments",
  {
    id: text("id").primaryKey(),
    enrollmentId: text("enrollment_id")
      .notNull()
      .references(() => enrollments.id),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull(),
    paidAt: text("paid_at").notNull(),
    method: text("method").notNull().default("银行转账"),
    reference: text("reference").notNull().default(""),
    status: text("status").notNull().default("confirmed"),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_payments_enrollment").on(table.enrollmentId),
    index("idx_payments_paid_at").on(table.paidAt),
    index("idx_payments_status").on(table.status),
  ],
);

export const refunds = sqliteTable(
  "refunds",
  {
    id: text("id").primaryKey(),
    enrollmentId: text("enrollment_id")
      .notNull()
      .references(() => enrollments.id),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull(),
    requestedAt: text("requested_at").notNull(),
    refundedAt: text("refunded_at"),
    lastLessonDate: text("last_lesson_date").notNull(),
    method: text("method").notNull().default("银行转账"),
    reference: text("reference").notNull().default(""),
    reason: text("reason").notNull().default(""),
    status: text("status").notNull().default("pending"),
    proofObjectKey: text("proof_object_key"),
    proofFileName: text("proof_file_name"),
    proofContentType: text("proof_content_type"),
    createdBy: text("created_by").notNull(),
    confirmedBy: text("confirmed_by"),
    confirmedAt: text("confirmed_at"),
    ...timestamps,
  },
  (table) => [
    index("idx_refunds_enrollment_status").on(table.enrollmentId, table.status),
    index("idx_refunds_refunded_at").on(table.refundedAt),
  ],
);

export const commissions = sqliteTable(
  "commissions",
  {
    id: text("id").primaryKey(),
    enrollmentId: text("enrollment_id")
      .notNull()
      .references(() => enrollments.id),
    agentId: text("agent_id")
      .notNull()
      .references(() => agents.id),
    basisCents: integer("basis_cents").notNull(),
    rateBps: integer("rate_bps").notNull().default(0),
    amountCents: integer("amount_cents").notNull(),
    status: text("status").notNull().default("pending"),
    settledMonth: text("settled_month"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("idx_commissions_enrollment").on(table.enrollmentId),
    index("idx_commissions_agent_status").on(table.agentId, table.status),
    index("idx_commissions_settled_month").on(table.settledMonth),
  ],
);

export const invoices = sqliteTable(
  "invoices",
  {
    id: text("id").primaryKey(),
    number: text("number").notNull(),
    type: text("type").notNull().default("customer"),
    enrollmentId: text("enrollment_id").references(() => enrollments.id),
    paymentId: text("payment_id").references(() => payments.id),
    agentId: text("agent_id").references(() => agents.id),
    period: text("period"),
    currency: text("currency").notNull(),
    totalCents: integer("total_cents").notNull(),
    status: text("status").notNull().default("issued"),
    snapshotJson: text("snapshot_json").notNull(),
    objectKey: text("object_key"),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("idx_invoices_number").on(table.number),
    index("idx_invoices_enrollment").on(table.enrollmentId),
    index("idx_invoices_payment").on(table.paymentId),
    index("idx_invoices_agent_period").on(table.agentId, table.period),
  ],
);

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    detailJson: text("detail_json").notNull().default("{}"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_audit_entity").on(table.entityType, table.entityId),
    index("idx_audit_user_date").on(table.userId, table.createdAt),
  ],
);

export const aiImportJobs = sqliteTable(
  "ai_import_jobs",
  {
    id: text("id").primaryKey(),
    sourceType: text("source_type").notNull(),
    sourceText: text("source_text").notNull().default(""),
    fileName: text("file_name").notNull().default(""),
    mimeType: text("mime_type").notNull().default(""),
    objectKey: text("object_key"),
    status: text("status").notNull().default("processing"),
    extractedJson: text("extracted_json").notNull().default("{}"),
    errorMessage: text("error_message").notNull().default(""),
    importedIdsJson: text("imported_ids_json").notNull().default("[]"),
    createdBy: text("created_by").notNull(),
    ...timestamps,
  },
  (table) => [
    index("idx_ai_import_jobs_user_date").on(table.createdBy, table.createdAt),
    index("idx_ai_import_jobs_status").on(table.status),
  ],
);

export const writingAssessments = sqliteTable(
  "writing_assessments",
  {
    id: text("id").primaryKey(),
    studentName: text("student_name").notNull().default("待补充"),
    schoolSystem: text("school_system").notNull().default(""),
    schoolName: text("school_name").notNull().default(""),
    grade: text("grade").notNull().default(""),
    status: text("status").notNull().default("draft"),
    recommendedCwLevel: text("recommended_cw_level").notNull().default(""),
    recommendedGwLevel: text("recommended_gw_level").notNull().default(""),
    confidence: integer("confidence").notNull().default(0),
    summary: text("summary").notNull().default(""),
    parentMessage: text("parent_message").notNull().default(""),
    recommendationJson: text("recommendation_json").notNull().default("{}"),
    createdBy: text("created_by").notNull(),
    ...timestamps,
  },
  (table) => [
    index("idx_writing_assessments_user_date").on(
      table.createdBy,
      table.createdAt,
    ),
    index("idx_writing_assessments_status").on(table.status),
  ],
);

export const writingAssessmentMessages = sqliteTable(
  "writing_assessment_messages",
  {
    id: text("id").primaryKey(),
    assessmentId: text("assessment_id")
      .notNull()
      .references(() => writingAssessments.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: text("content").notNull().default(""),
    attachmentsJson: text("attachments_json").notNull().default("[]"),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_writing_assessment_messages_session_date").on(
      table.assessmentId,
      table.createdAt,
    ),
  ],
);
