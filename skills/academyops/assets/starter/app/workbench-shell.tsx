"use client";

import platformConfig from "@/platform.config.json";


import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { nextWeekday, parseLessonSlots, serializeSlots, timeRange, validateLessonSlots, weeklySlots, type LessonSlot } from "./lib/class-schedule";
import {
  AlertTriangle,
  ArrowRightLeft,
  Bot,
  BookOpenCheck,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Download,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  History,
  Image as ImageIcon,
  LayoutDashboard,
  LogOut,
  MessageSquarePlus,
  Paperclip,
  Plus,
  ReceiptText,
  Search,
  Send,
  Settings,
  Sparkles,
  Trash2,
  Upload,
  UserPlus,
  UsersRound,
  WalletCards,
  X,
} from "lucide-react";
import type { ChatGPTUser } from "./chatgpt-auth";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
} from "@/components/ui/pagination";
import { zhCN } from "date-fns/locale";

type View =
  | "dashboard"
  | "students"
  | "enrollments"
  | "classes"
  | "payments"
  | "followups"
  | "agents"
  | "invoices"
  | "writingAssessment"
  | "settings"
  | "audit";
type Modal =
  | "student"
  | "studentProfile"
  | "studentEdit"
  | "enrollment"
  | "enrollmentEdit"
  | "aiImport"
  | "classGroup"
  | "classEdit"
  | "assignClass"
  | "addClassStudent"
  | "removeClassStudent"
  | "completeClass"
  | "payment"
  | "refund"
  | "finish"
  | "followup"
  | "course"
  | "courseEdit"
  | "agent"
  | "member"
  | "memberTransfer"
  | "invoiceConfirm"
  | null;
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type DeleteTarget = {
  type: "student" | "enrollment" | "member" | "course" | "classGroup";
  id: string;
  name: string;
  detail: string;
};
const PAGE_SIZE = 10;
const WRITING_ASSESSMENT_MAX_FILES = 10;
type SearchOption = { value: string; label: string; keywords: string };

const navigation: { id: View; label: string; icon: typeof LayoutDashboard }[] =
  [
    { id: "dashboard", label: "工作总览", icon: LayoutDashboard },
    { id: "students", label: "学员档案", icon: UsersRound },
    { id: "enrollments", label: "报名记录", icon: GraduationCap },
    { id: "classes", label: "班级排课", icon: CalendarDays },
    { id: "payments", label: "收款管理", icon: CircleDollarSign },
    { id: "followups", label: "客户跟进", icon: BookOpenCheck },
    { id: "agents", label: "渠道结算", icon: ReceiptText },
    { id: "invoices", label: "发票记录", icon: FileText },
    { id: "writingAssessment", label: "CR写作能力评估", icon: Bot },
    { id: "settings", label: "团队与权限", icon: Settings },
    { id: "audit", label: "操作日志", icon: History },
  ];

const titles: Record<View, [string, string]> = {
  dashboard: ["工作总览", "今天的招生与收款"],
  students: ["学员档案", "唯一档案、课程顾问与首次登记"],
  enrollments: ["报名记录", "新报续报、课程顾问与渠道来源"],
  classes: ["班级排课", "ClassIn 班级、上课安排与在读名单"],
  payments: ["收款管理", "按每一笔实际到账核对"],
  followups: ["客户跟进", "保留每一次课程顾问跟进记录"],
  agents: ["渠道结算", "整理渠道来源与待结佣金"],
  invoices: ["发票记录", "固定编号与生成时的数据快照"],
  writingAssessment: ["CR写作能力评估", "作文分析、课程匹配与家长沟通建议"],
  settings: ["团队与权限", "维护渠道、员工账号和角色"],
  audit: ["操作日志", "追踪每一次新增、修改与删除"],
};

const courseCategories = [
  "Great Writing写作",
  "Creative Writing创意写作",
  "RE",
  "Literature阅读",
  "新加坡小学课程",
  "新加坡中学课程",
  "试听课",
  "其他课程",
];
const teacherNames = platformConfig.teachers;
const displayCourseCategory = (value: unknown) => {
  const category = String(value || "");
  if (courseCategories.includes(category)) return category;
  if (category === "写作") return "Great Writing写作";
  if (category === "阅读") return "Literature阅读";
  return "其他课程";
};

const money = (cents = 0, currency = "SGD") =>
  `${currency} ${(Number(cents) / 100).toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const today = () => new Date().toISOString().slice(0, 10);
const roleName = (role: string) =>
  ({
    admin: "系统管理员",
    finance: "财务",
    sales: "课程顾问",
    operations: "教务运营",
    operations_finance: "教务运营财务",
    pending: "待授权",
  })[role] ?? role;
const memberStatusName = (status: string) =>
  ({ active: "已启用", invited: "待首次登录", disabled: "已停用" })[status] ??
  status;
const roleViews: Record<string, View[]> = {
  admin: [
    "dashboard",
    "students",
    "enrollments",
    "classes",
    "payments",
    "followups",
    "agents",
    "invoices",
    "writingAssessment",
    "settings",
    "audit",
  ],
  sales: [
    "dashboard",
    "students",
    "enrollments",
    "classes",
    "payments",
    "followups",
    "invoices",
    "writingAssessment",
    "settings",
  ],
  finance: ["dashboard", "enrollments", "payments", "agents", "invoices", "writingAssessment"],
  operations: [
    "dashboard",
    "students",
    "enrollments",
    "classes",
    "followups",
    "writingAssessment",
    "settings",
  ],
  operations_finance: [
    "dashboard",
    "students",
    "enrollments",
    "classes",
    "payments",
    "followups",
    "agents",
    "invoices",
    "writingAssessment",
    "settings",
  ],
  pending: [],
};
const roleDetails: Record<
  string,
  { title: string; duty: string; scope: string }
> = {
  admin: {
    title: "系统管理员",
    duty: "管理团队账号、课程、渠道和全部业务数据",
    scope: "全部查看与操作；可分配权限、删除记录、生成渠道结算单",
  },
  sales: {
    title: "课程顾问",
    duty: "跟进本人负责的客户，并登记报名、收款、退费、客户发票和班级排课",
    scope:
      "可处理本人学员的退费、最后上课日期、退班和退款凭证，也可创建和维护课程班级、分配学员及导出在读名单；无渠道佣金与员工权限管理权限",
  },
  finance: {
    title: "财务",
    duty: "核对全体收款、客户发票和渠道佣金结算",
    scope: "查看全部成单与收款；可生成渠道月结单；不能删除学员或修改团队权限",
  },
  operations: {
    title: "教务运营",
    duty: "协助课程顾问建立学员档案，并维护课程、班级排课和开课结课信息",
    scope:
      "可代课程顾问创建学员档案并指定负责人；可创建、编辑和维护课程及班级排课；不处理渠道佣金和团队授权",
  },
  operations_finance: {
    title: "教务运营财务",
    duty: "同时负责教务运营与财务工作，贯通学员服务、课程执行和财务核对",
    scope:
      "拥有教务运营与财务的全部功能；可维护学员、课程、报名、跟进和结课，也可处理收款、发票与渠道结算；不能管理员工账号或删除业务记录",
  },
  pending: {
    title: "待授权",
    duty: "新员工等待管理员分配角色",
    scope: "暂时不能查看业务数据或执行操作",
  },
};
const registrationName = (value: string) =>
  value === "renewal" ? "续报" : "新报";

export function WorkbenchShell({ user }: { user: ChatGPTUser }) {
  const [view, setView] = useState<View>("dashboard");
  const [data, setData] = useState<Row>({});
  const [catalog, setCatalog] = useState<Row>({
    students: [],
    courses: [],
    agents: [],
    team: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<Modal>(null);
  const [selected, setSelected] = useState<Row | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterYear, setFilterYear] = useState("");
  const [filterMonth, setFilterMonth] = useState("");
  const [filterAgent, setFilterAgent] = useState("");
  const [filterSales, setFilterSales] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterCurrency, setFilterCurrency] = useState("");
  const [filterStartDate, setFilterStartDate] = useState("");
  const [filterEndDate, setFilterEndDate] = useState("");
  const [statementMonth, setStatementMonth] = useState(
    new Date().toISOString().slice(0, 7),
  );
  const [aiConnected, setAiConnected] = useState(false);
  const [aiDraft, setAiDraft] = useState<{
    jobId: string;
    mode: "student" | "enrollment";
    records: Row[];
  } | null>(null);
  const [aiWorking, setAiWorking] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  const load = useCallback(async (target: View) => {
    setLoading(true);
    setError("");
    try {
      const scope = target === "students" ? "&scope=directory" : "";
      const response = await fetch(`/api/workbench?view=${target}${scope}`, {
        cache: "no-store",
      });
      const result = (await response.json()) as Row;
      if (!response.ok) throw new Error(result.error ?? "读取失败");
      setData(result);
      if (["agents", "settings", "classes"].includes(target))
        setCatalog((current: Row) => ({ ...current, ...result }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "读取失败");
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshDashboard = useCallback(async () => {
    try {
      const response = await fetch("/api/workbench?view=dashboard", {
        cache: "no-store",
      });
      const result = (await response.json()) as Row;
      if (response.ok) setData(result);
    } catch {
      /* the completed Codex response remains visible if refresh fails */
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(view), 0);
    return () => window.clearTimeout(timer);
  }, [view, load]);

  useEffect(() => {
    type WebTool = {
      name: string;
      title: string;
      description: string;
      inputSchema: object;
      annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
      execute: (input: Row) => Promise<Row>;
    };
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: WebTool,
            options?: { signal?: AbortSignal },
          ) => void | Promise<void>;
        };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const run = async (action: string, input: Row) => {
      const response = await fetch("/api/workbench", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...input }),
      });
      const result = (await response.json()) as Row;
      if (!response.ok) throw new Error(result.error ?? "操作失败");
      return result;
    };
    const tools: WebTool[] = [
      {
        name: "create_student_record",
        title: "新建学员档案",
        description:
          "建立唯一的孩子与主要家长档案。遇到疑似重复学员时会拒绝创建并要求先核对。",
        inputSchema: {
          type: "object",
          properties: {
            fullName: { type: "string" },
            englishName: { type: "string" },
            school: { type: "string" },
            grade: { type: "string" },
            classinAccount: { type: "string" },
            firstRegisteredAt: { type: "string", description: "YYYY-MM-DD" },
            sourceAgentId: { type: "string", description: "首次来源渠道 ID" },
            referralParentWechat: { type: "string", description: "转介绍家长微信（选填）" },
            guardianName: { type: "string" },
            guardianWechatName: { type: "string" },
            guardianPhone: { type: "string" },
            notes: { type: "string" },
          },
          required: [
            "fullName",
            "grade",
            "firstRegisteredAt",
            "guardianWechatName",
          ],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: async (input) => {
          const result = await run("create_student", input);
          setView("students");
          await load("students");
          return { id: result.id, code: result.code };
        },
      },
      {
        name: "record_enrollment_payment",
        title: "登记一笔收款",
        description:
          "为已有报名登记一笔实际到账记录；金额不能超过该报名的未收余额。",
        inputSchema: {
          type: "object",
          properties: {
            enrollmentId: { type: "string" },
            amount: { type: "number", exclusiveMinimum: 0 },
            paidAt: { type: "string", description: "YYYY-MM-DD" },
            method: { type: "string" },
            reference: { type: "string" },
          },
          required: ["enrollmentId", "amount", "paidAt"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: async (input) => {
          const result = await run("record_payment", input);
          setView("payments");
          await load("payments");
          return { id: result.id, status: "confirmed" };
        },
      },
      {
        name: "stage_enrollment_import_from_text",
        title: "识别报名文字并生成草稿",
        description:
          "从一段报名文字识别一个或多个学员、课程、金额和来源，只生成待人工核对的草稿，不会直接写入正式报名数据库。",
        inputSchema: {
          type: "object",
          properties: {
            sourceText: { type: "string", minLength: 3, maxLength: 50000 },
          },
          required: ["sourceText"],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: true },
        execute: async (input) => {
          const form = new FormData();
          form.set("sourceText", String(input.sourceText ?? ""));
          const [response, catalogResponse] = await Promise.all([
            fetch("/api/ai-import", { method: "POST", body: form }),
            fetch("/api/workbench?view=catalog"),
          ]);
          const result = (await response.json()) as Row;
          const catalogResult = (await catalogResponse.json()) as Row;
          if (!response.ok) throw new Error(String(result.error ?? "识别失败"));
          setCatalog((current: Row) => ({ ...current, ...catalogResult }));
          setAiDraft({
            jobId: String(result.jobId),
            mode: "enrollment",
            records: result.records as Row[],
          });
          setAiConnected(true);
          setView("enrollments");
          setModal("aiImport");
          return {
            jobId: result.jobId,
            recordCount: (result.records as Row[]).length,
            status: "review_required",
          };
        },
      },
    ];
    for (const tool of tools) {
      try {
        void Promise.resolve(
          context.registerTool(tool, { signal: lifecycle.signal }),
        ).catch(() => undefined);
      } catch {
        /* unsupported preview context */
      }
    }
    return () => lifecycle.abort();
  }, [load]);

  const changeView = (next: View, showAll = false) => {
    const currentMonth = new Date().toISOString().slice(0, 7);
    setView(next);
    setSearch("");
    setFilterYear(
      next === "enrollments" && !showAll ? currentMonth.slice(0, 4) : "",
    );
    setFilterMonth(
      next === "enrollments" && !showAll ? currentMonth.slice(5, 7) : "",
    );
    setFilterAgent("");
    setFilterSales("");
    setFilterType("");
    setFilterCurrency("");
    setFilterStartDate("");
    setFilterEndDate("");
  };
  const member = data.member ?? catalog.member ?? { role: "pending" };
  const visibleNavigation = navigation.filter((item) =>
    (roleViews[member.role] ?? []).includes(item.id),
  );

  const openEnrollment = async () => {
    setError("");
    try {
      const [studentResponse, catalogResponse] = await Promise.all([
        fetch("/api/workbench?view=students&scope=directory", {
          cache: "no-store",
        }),
        fetch("/api/workbench?view=catalog", { cache: "no-store" }),
      ]);
      const students = (await studentResponse.json()) as Row;
      const list = (await catalogResponse.json()) as Row;
      if (!studentResponse.ok || !catalogResponse.ok)
        throw new Error(students.error ?? list.error ?? "读取基础资料失败");
      setCatalog({ ...list, students: students.students ?? [] });
      setModal("enrollment");
    } catch (e) {
      setError(e instanceof Error ? e.message : "读取基础资料失败");
    }
  };

  const openEditEnrollment = async (row: Row) => {
    setError("");
    try {
      const response = await fetch("/api/workbench?view=catalog", { cache: "no-store" });
      const result = (await response.json()) as Row;
      if (!response.ok) throw new Error(result.error ?? "读取课程资料失败");
      setCatalog((current: Row) => ({ ...current, ...result }));
      setSelected(row);
      setModal("enrollmentEdit");
    } catch (e) {
      setError(e instanceof Error ? e.message : "读取课程资料失败");
    }
  };

  const openStudent = async () => {
    setError("");
    try {
      const response = await fetch("/api/workbench?view=catalog");
      const result = (await response.json()) as Row;
      if (!response.ok) throw new Error(result.error ?? "读取团队资料失败");
      setCatalog((current: Row) => ({ ...current, ...result }));
      setModal("student");
    } catch (e) {
      setError(e instanceof Error ? e.message : "读取团队资料失败");
    }
  };

  const openEditStudent = async (row: Row) => {
    setError("");
    try {
      const response = await fetch("/api/workbench?view=catalog");
      const result = (await response.json()) as Row;
      if (!response.ok) throw new Error(result.error ?? "读取渠道资料失败");
      setCatalog((current: Row) => ({ ...current, ...result }));
      setSelected(row);
      setModal("studentEdit");
    } catch (e) {
      setError(e instanceof Error ? e.message : "读取渠道资料失败");
    }
  };

  const openStudentProfile = async (row: Row) => {
    setError("");
    try {
      const response = await fetch(
        `/api/workbench?view=student_detail&id=${encodeURIComponent(String(row.id))}`,
        { cache: "no-store" },
      );
      const result = (await response.json()) as Row;
      if (!response.ok) throw new Error(result.error ?? "读取学员详情失败");
      setSelected(result);
      setModal("studentProfile");
    } catch (e) {
      setError(e instanceof Error ? e.message : "读取学员详情失败");
    }
  };

  const openAssignClass = async (row: Row) => {
    setError("");
    try {
      const response = await fetch("/api/workbench?view=classes", {
        cache: "no-store",
      });
      const result = (await response.json()) as Row;
      if (!response.ok) throw new Error(result.error ?? "读取班级失败");
      setData((current: Row) => ({
        ...current,
        classOptions: result.classOptions ?? [],
      }));
      setSelected(row);
      setModal("assignClass");
    } catch (e) {
      setError(e instanceof Error ? e.message : "读取班级失败");
    }
  };

  const openAiImport = async (
    mode: "student" | "enrollment" = "enrollment",
  ) => {
    setError("");
    setAiDraft(null);
    try {
      const [catalogResponse, statusResponse] = await Promise.all([
        fetch("/api/workbench?view=catalog"),
        fetch("/api/ai-import"),
      ]);
      const list = (await catalogResponse.json()) as Row;
      const status = (await statusResponse.json()) as Row;
      if (!catalogResponse.ok || !statusResponse.ok)
        throw new Error(list.error ?? status.error ?? "读取智能录入设置失败");
      setCatalog((current: Row) => ({ ...current, ...list }));
      setAiConnected(Boolean(status.connected));
      setAiDraft(null);
      setSelected({ aiMode: mode });
      setModal("aiImport");
    } catch (e) {
      setError(e instanceof Error ? e.message : "读取智能录入设置失败");
    }
  };

  const analyzeImport = async (form: HTMLFormElement) => {
    setAiWorking(true);
    setError("");
    try {
      const response = await fetch("/api/ai-import", {
        method: "POST",
        body: new FormData(form),
      });
      const result = (await response.json()) as Row;
      if (!response.ok) throw new Error(String(result.error ?? "识别失败"));
      setAiDraft({
        jobId: String(result.jobId),
        mode: result.mode === "student" ? "student" : "enrollment",
        records: result.records as Row[],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "识别失败");
    } finally {
      setAiWorking(false);
    }
  };

  const confirmImport = async () => {
    if (!aiDraft) return;
    setAiWorking(true);
    setError("");
    try {
      const response = await fetch("/api/ai-import/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(aiDraft),
      });
      const result = (await response.json()) as Row;
      if (!response.ok) throw new Error(String(result.error ?? "导入失败"));
      const target = aiDraft.mode === "student" ? "students" : "enrollments";
      const duplicateCount = Array.isArray(result.duplicates)
        ? result.duplicates.length
        : 0;
      setNotice(
        aiDraft.mode === "student"
          ? `已导入 ${result.imported} 名学员${duplicateCount ? `，跳过 ${duplicateCount} 名重复学员` : ""}`
          : `已导入 ${result.imported} 条报名记录`,
      );
      setModal(null);
      setAiDraft(null);
      setSelected(null);
      setView(target);
      await load(target);
      setTimeout(() => setNotice(""), 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "导入失败");
    } finally {
      setAiWorking(false);
    }
  };

  const updateAiRecord = (index: number, key: string, value: unknown) =>
    setAiDraft((current) =>
      current
        ? {
            ...current,
            records: current.records.map((record, i) =>
              i === index ? { ...record, [key]: value } : record,
            ),
          }
        : current,
    );

  const submitBody = async (action: string, body: Row) => {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/workbench", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...body }),
      });
      const result = (await response.json()) as Row;
      if (!response.ok) {
        if (response.status === 409 && result.details?.length)
          throw new Error(
            `${result.error}：${result.details.map((r: Row) => `${r.code} ${r.full_name}`).join("、")}`,
          );
        throw new Error(result.error ?? "保存失败");
      }
      const targetView =
        action === "create_class_group" ? ("classes" as View) : view;
      setModal(null);
      setSelected(null);
      setNotice(
        action === "create_invoice"
          ? `已生成发票 ${result.number}`
          : action === "create_agent_statement"
            ? `已生成渠道结算单 ${result.number}${result.exchangeRateApplied ? `，按 ${result.exchangeRateDate} 汇率 1 SGD = ${Number(result.exchangeRate || 1).toFixed(4)} CNY 折算` : ""}，人民币合计 ${money(Number(result.totalCents || 0), "CNY")}`
          : action === "create_class_group"
            ? "班级已保存，下面已显示新建班级"
            : "已保存",
      );
      setTimeout(() => setNotice(""), 3500);
      if (action === "create_class_group") changeView(targetView, true);
      await load(targetView);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };
  const submit = async (action: string, form: HTMLFormElement) =>
    submitBody(action, Object.fromEntries(new FormData(form)));

  const exportRosterRows = async (rows: Row[], filename: string) => {
    exportCsv(
      filename,
      [
        "成员状态",
        "班级状态",
        "班级结课日期",
        "移除日期",
        "新加入",
        "班级课程",
        "报名课程",
        "班级",
        "ClassIn班级",
        "学员",
        "家长微信",
        "ClassIn账号",
        "年级",
        "老师",
        "开课日期",
        "上课安排",
        "报名日期",
        "加入第一次课日期",
        "计划结束日期",
        "报名编号",
      ],
      rows.map((r) => [
        r.membership_status === "removed" ? "已移除" : r.class_group_status === "completed" ? "已结课" : "在读",
        r.class_group_status === "completed" ? "已结课" : "Active",
        r.class_group_status === "completed" ? r.class_end_date || "" : "",
        r.removed_at ? String(r.removed_at).slice(0, 10) : "",
        r.roster_exported_at ? "" : "新加入",
        r.class_course_name,
        r.enrollment_course_name,
        r.class_group_name,
        r.classin_class_name,
        r.student_name,
        r.guardian_wechat_name,
        r.classin_account,
        r.grade,
        r.teacher_name,
        r.class_start_date,
        scheduleText(r),
        r.registered_at,
        r.enrollment_start_date,
        r.enrollment_end_date,
        r.number || "未登记报名",
      ]),
    );
    const activeRows = rows.filter((r) => r.membership_status !== "removed" && r.class_group_status === "active");
    if (activeRows.length) {
      await submitBody("mark_roster_exported", {
        rosterKeys: activeRows.map((r) =>
          r.student_membership_id
            ? `studentMembership:${r.student_membership_id}`
            : r.membership_id
            ? `membership:${r.membership_id}`
            : `legacy:${r.enrollment_id}:${r.class_group_id}`,
        ),
      });
    }
  };
  const exportActiveRoster = async (rows: Row[]) =>
    exportRosterRows(rows, `ClassIn筛选名单-${today()}.csv`);
  const exportClassRoster = async (group: Row) =>
    exportRosterRows(
      (data.roster ?? []).filter((r: Row) => r.class_group_id === group.id),
      `ClassIn-${String(group.name).replaceAll("/", "-")}-${today()}.csv`,
    );

  const submitEnrollment = async (form: HTMLFormElement) => {
    setSaving(true);
    setError("");
    try {
      const body = new FormData(form);
      body.set("action", "create_enrollment");
      if (!String(body.get("studentId") ?? ""))
        throw new Error("请选择已有学员档案；如果搜不到，请先创建学员档案");
      if (!String(body.get("courseId") ?? ""))
        throw new Error("请选择报名课程");
      const firstLessonDate = String(body.get("firstLessonDate") ?? "");
      const expectedEndDate = String(body.get("expectedEndDate") ?? "");
      if (expectedEndDate && firstLessonDate && expectedEndDate < firstLessonDate)
        throw new Error("结束日期不能早于加入第一次课日期");
      if (!String(body.get("listAmount") ?? "").trim())
        throw new Error("请填写课程原价");
      const listAmount = Number(body.get("listAmount"));
      const paymentAmountText = String(body.get("paymentAmount") ?? "").trim();
      const paymentAmount = Number(paymentAmountText);
      if (!paymentAmountText || !Number.isFinite(paymentAmount) || paymentAmount <= 0)
        throw new Error("请填写大于 0 的实际收款金额");
      if (paymentAmount > listAmount)
        throw new Error("实际收款金额不能高于课程原价");
      const response = await fetch("/api/workbench", { method: "POST", body });
      const result = (await response.json()) as Row;
      if (!response.ok) throw new Error(result.error ?? "保存报名失败");
      setModal(null);
      setSelected(null);
      const screenshotMessage = result.paymentScreenshotCount
        ? `，${result.paymentScreenshotCount} 张付款截图已存档`
        : "";
      setNotice(
        `报名 ${result.number} 已保存，已确认收款 ${money(Number(result.paidCents || 0), String(result.currency || "SGD"))}${result.classGroupName ? `，已加入班级“${result.classGroupName}”` : ""}${screenshotMessage}`,
      );
      setTimeout(() => setNotice(""), 4000);
      changeView("enrollments", true);
      await load("enrollments");
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存报名失败");
    } finally {
      setSaving(false);
    }
  };

  const submitEnrollmentEdit = async (form: HTMLFormElement) => {
    setSaving(true);
    setError("");
    try {
      const body = new FormData(form);
      body.set("action", "update_enrollment");
      const firstLessonDate = String(body.get("firstLessonDate") ?? "");
      const expectedEndDate = String(body.get("expectedEndDate") ?? "");
      if (expectedEndDate && firstLessonDate && expectedEndDate < firstLessonDate)
        throw new Error("结束日期不能早于加入第一次课日期");
      const listAmount = Number(body.get("listAmount"));
      const paymentAmount = Number(body.get("paymentAmount"));
      if (!Number.isFinite(paymentAmount) || paymentAmount <= 0)
        throw new Error("请填写大于 0 的实际收款金额");
      if (paymentAmount > listAmount)
        throw new Error("实际收款金额不能高于课程原价");
      const response = await fetch("/api/workbench", { method: "POST", body });
      const result = (await response.json()) as Row;
      if (!response.ok) throw new Error(result.error ?? "保存报名修改失败");
      setModal(null);
      setSelected(null);
      setNotice(
        result.screenshotWarning
          ? String(result.screenshotWarning)
          : `报名记录已更新，现有付款截图 ${Number(result.paymentScreenshotCount || 0)} 张`,
      );
      setTimeout(() => setNotice(""), result.screenshotWarning ? 8000 : 4000);
      await load("enrollments");
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存报名修改失败");
    } finally {
      setSaving(false);
    }
  };

  const submitRefund = async (form: HTMLFormElement) => {
    setSaving(true);
    setError("");
    try {
      const body = new FormData(form);
      body.set("action", selected?.refund ? "update_refund" : "create_refund");
      const response = await fetch("/api/workbench", { method: "POST", body });
      const result = (await response.json()) as Row;
      if (!response.ok) throw new Error(result.error ?? "保存退费失败");
      setModal(null);
      setSelected(null);
      setNotice(
        result.status === "confirmed"
          ? "退费已确认到账，最后上课日期和退班状态已同步"
          : "退费申请已保存，尚未确认到账",
      );
      setTimeout(() => setNotice(""), 4500);
      changeView("enrollments", true);
      await load("enrollments");
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存退费失败");
    } finally {
      setSaving(false);
    }
  };

  const refundAction = async (action: "cancel_refund" | "delete_refund", id: string) => {
    const label = action === "cancel_refund" ? "撤销" : "永久删除";
    if (!window.confirm(`确认${label}这条退费记录？`)) return;
    await submitBody(action, { id });
  };

  const transferCustomers = async (form: HTMLFormElement) => {
    setSaving(true);
    setError("");
    try {
      const fields = Object.fromEntries(new FormData(form));
      const response = await fetch("/api/workbench", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "transfer_member_customers",
          ...fields,
          deleteSource: fields.deleteSource === "true",
        }),
      });
      const result = (await response.json()) as Row;
      if (!response.ok) throw new Error(result.error ?? "客户交接失败");
      setModal(null);
      setSelected(null);
      setNotice(
        `已将 ${result.customerCount} 位客户从 ${result.sourceName} 转交给 ${result.targetName}${result.sourceDeleted ? "，原账号已删除" : ""}`,
      );
      setTimeout(() => setNotice(""), 5000);
      await load("settings");
    } catch (e) {
      setError(e instanceof Error ? e.message : "客户交接失败");
    } finally {
      setSaving(false);
    }
  };

  const openInvoiceConfirm = async (
    row: Row,
    kind: "enrollment" | "payment" = "enrollment",
  ) => {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/workbench", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "invoice_draft",
          ...(kind === "payment"
            ? { paymentId: row.id }
            : { enrollmentId: row.id }),
        }),
      });
      const result = (await response.json()) as Row;
      if (!response.ok) throw new Error(result.error ?? "读取发票草稿失败");
      setSelected(result);
      setModal("invoiceConfirm");
    } catch (e) {
      setError(e instanceof Error ? e.message : "读取发票草稿失败");
    } finally {
      setSaving(false);
    }
  };

  const confirmInvoice = async (form: HTMLFormElement) => {
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/workbench", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_invoice",
          ...Object.fromEntries(new FormData(form)),
        }),
      });
      const result = (await response.json()) as Row;
      if (!response.ok) throw new Error(result.error ?? "生成发票失败");
      setModal(null);
      setSelected(null);
      window.location.assign(`/invoice/${result.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "生成发票失败");
    } finally {
      setSaving(false);
    }
  };

  const deleteRecord = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    setError("");
    try {
      const action =
        deleteTarget.type === "student"
          ? "delete_student"
          : deleteTarget.type === "enrollment"
            ? "delete_enrollment"
            : deleteTarget.type === "course"
              ? "delete_course"
              : deleteTarget.type === "classGroup"
                ? "delete_class_group"
                : "delete_member";
      const response = await fetch("/api/workbench", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, id: deleteTarget.id }),
      });
      const result = (await response.json()) as Row;
      if (!response.ok) throw new Error(result.error ?? "删除失败");
      setDeleteTarget(null);
      setNotice(
        deleteTarget.type === "student"
          ? "学员及其相关记录已删除"
          : deleteTarget.type === "enrollment"
            ? "报名及其相关记录已删除"
            : deleteTarget.type === "course"
              ? "课程已删除"
              : deleteTarget.type === "classGroup"
                ? "班级已删除"
                : "员工账号已删除，历史业务记录已保留",
      );
      setTimeout(() => setNotice(""), 4000);
      await load(view);
    } catch (e) {
      setError(e instanceof Error ? e.message : "删除失败");
    } finally {
      setSaving(false);
    }
  };

  const deleteStudents = async (ids: string[]) => {
    if (!ids.length) return false;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/workbench", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete_students", ids }),
      });
      const result = (await response.json()) as Row;
      if (!response.ok) throw new Error(result.error ?? "批量删除失败");
      setNotice(`已删除 ${Number(result.deletedCount ?? ids.length)} 名学员及其相关记录`);
      setTimeout(() => setNotice(""), 4000);
      await load(view);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "批量删除失败");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list =
      data.students ??
      data.enrollments ??
      data.payments ??
      data.followups ??
      data.invoices ??
      data.auditLogs ??
      [];
    if (
      !q &&
      !filterYear &&
      !filterMonth &&
      !filterAgent &&
      !filterSales &&
      !filterType &&
      !filterCurrency &&
      !filterStartDate &&
      !filterEndDate
    )
      return null;
    return list.filter((r: Row) => {
      const dateValue = String(
        r.registered_at ??
          r.first_registered_at ??
          r.followed_at ??
          r.paid_at ??
          r.created_at ??
          "",
      );
      return (
        (!q ||
          Object.values(r).some((v) =>
            String(v ?? "")
              .toLowerCase()
              .includes(q),
          )) &&
        (!filterYear || dateValue.slice(0, 4) === filterYear) &&
        (!filterMonth || dateValue.slice(5, 7) === filterMonth) &&
        (!filterAgent ||
          String(r.agent_id ?? r.source_agent_id ?? "") === filterAgent) &&
        (!filterSales ||
          String(r.salesperson_user_id ?? r.owner_user_id ?? "") ===
            filterSales) &&
        (!filterType || String(r.registration_type ?? "") === filterType) &&
        (!filterCurrency || String(r.currency ?? "") === filterCurrency) &&
        (!filterStartDate || dateValue >= filterStartDate) &&
        (!filterEndDate || dateValue <= filterEndDate)
      );
    });
  }, [
    search,
    data,
    filterYear,
    filterMonth,
    filterAgent,
    filterSales,
    filterType,
    filterCurrency,
    filterStartDate,
    filterEndDate,
  ]);

  const filterRows: Row[] =
    data.students ?? data.enrollments ?? data.payments ?? data.followups ?? [];

  if (data.pending) return <PendingAccess user={user} />;

  return (
    <div className="min-h-screen bg-[#f5f7fb] text-slate-900 lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="hidden min-h-screen flex-col bg-[linear-gradient(180deg,#102f56,#0b2442)] px-4 py-5 text-white shadow-[8px_0_30px_rgba(16,47,86,.08)] lg:flex">
        <Brand />
        <nav className="space-y-1" aria-label="主导航">
          {visibleNavigation.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => changeView(id)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${view === id ? "bg-[#e5b529] font-semibold text-[#102f56] shadow-sm" : "text-blue-100/80 hover:bg-white/8 hover:text-white"}`}
              type="button"
            >
              <Icon className="h-[18px] w-[18px]" />
              {label}
            </button>
          ))}
        </nav>
        <div className="mt-auto border-t border-white/10 pt-4">
          <div className="px-3 py-2">
            <p className="truncate text-sm font-medium">{user.displayName}</p>
            <p className="text-xs text-[#f5d878]">{roleName(member.role)}</p>
          </div>
          <a
            className="mt-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-300 hover:bg-white/7 hover:text-white"
            href="/signout-with-chatgpt?return_to=/"
          >
            <LogOut className="h-[18px] w-[18px]" />
            退出登录
          </a>
        </div>
      </aside>

      <main className="min-w-0">
        <header className="sticky top-0 z-10 flex min-h-17 items-center justify-between gap-4 border-b bg-white/92 px-4 py-3 backdrop-blur lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Image
              src={platformConfig.organization.logoPath}
              alt={platformConfig.organization.displayName}
              width={156}
              height={70}
              className="h-auto w-24 lg:hidden"
            />
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[.12em] text-[#c18f08]">
                {titles[view][0]}
              </p>
              <h1 className="truncate text-lg font-semibold text-[#102f56]">
                {titles[view][1]}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {view !== "dashboard" && (
              <div className="relative hidden md:block">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-64 pl-9"
                  placeholder={
                    view === "students"
                      ? "搜索姓名、家长微信、电话等"
                      : "搜索当前列表"
                  }
                />
              </div>
            )}
            <select
              aria-label="切换页面"
              className="h-10 max-w-38 rounded-lg border bg-white px-2 text-sm lg:hidden"
              value={view}
              onChange={(e) => changeView(e.target.value as View)}
            >
              {visibleNavigation.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.label}
                </option>
              ))}
            </select>
            <span className="grid h-10 w-10 place-items-center rounded-full border border-[#efd371] bg-[#fff3c4] font-semibold text-[#102f56]">
              {(user.fullName ?? user.email).slice(0, 1).toUpperCase()}
            </span>
          </div>
        </header>

        <div className="mx-auto max-w-[1500px] space-y-5 p-4 lg:p-8">
          {notice && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {notice}
            </div>
          )}
          {error && (
            <div className="flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              <span>{error}</span>
              <button onClick={() => setError("")} aria-label="关闭">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          {view !== "dashboard" && (
            <div className="relative md:hidden">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9"
                placeholder={
                  view === "students"
                    ? "搜索姓名、家长微信、电话等"
                    : "搜索当前列表"
                }
              />
            </div>
          )}
          {!loading &&
            ["students", "enrollments", "payments", "followups"].includes(
              view,
            ) && (
              <EnhancedListFilters
                rows={filterRows}
                year={filterYear}
                month={filterMonth}
                agent={filterAgent}
                sales={filterSales}
                type={filterType}
                currency={filterCurrency}
                startDate={filterStartDate}
                endDate={filterEndDate}
                showRange={view === "enrollments"}
                showType={["enrollments", "payments"].includes(view)}
                showAgent={["students", "enrollments", "payments"].includes(
                  view,
                )}
                setYear={setFilterYear}
                setMonth={setFilterMonth}
                setAgent={setFilterAgent}
                setSales={setFilterSales}
                setType={setFilterType}
                setCurrency={setFilterCurrency}
                setStartDate={setFilterStartDate}
                setEndDate={setFilterEndDate}
              />
            )}
          {loading ? (
            <Loading />
          ) : (
            renderView(view, data, filtered, {
              member,
              saving,
              reloadDashboard: refreshDashboard,
              filterYear,
              filterMonth,
              statementMonth,
              setStatementMonth,
              openStudent,
              openStudentAi: () => void openAiImport("student"),
              openEditStudent,
              openStudentProfile,
              deleteStudent: (row: Row) =>
                setDeleteTarget({
                  type: "student",
                  id: String(row.id),
                  name: String(row.full_name),
                  detail: `${Number(row.enrollment_count || 0)} 条报名及全部收款、跟进和相关发票`,
                }),
              deleteStudents,
              openEnrollment,
              editEnrollment: (row: Row) => void openEditEnrollment(row),
              openAiImport: () => void openAiImport("enrollment"),
              deleteEnrollment: (row: Row) =>
                setDeleteTarget({
                  type: "enrollment",
                  id: String(row.id),
                  name: String(row.student_name),
                  detail: `${String(row.course_name)} · ${String(row.number)}`,
                }),
              openClassGroup: (course?: Row) => {
                setSelected(course ? { courseId: course.id } : null);
                setModal("classGroup");
              },
              editCourse: (course: Row) => {
                setSelected(course);
                setModal("courseEdit");
              },
              deleteCourse: (course: Row) => setDeleteTarget({type:"course",id:String(course.id),name:String(course.name),detail:"没有班级和报名时可删除"}),
              editClass: (group: Row) => {
                setSelected(group);
                setModal("classEdit");
              },
              deleteClass: (group: Row) => setDeleteTarget({type:"classGroup",id:String(group.id),name:String(group.name),detail:`${Number(group.active_student_count||0)} 名在读学员`}),
              assignClass: (row: Row) => void openAssignClass(row),
              addClassStudent: (group: Row) => {
                setSelected(group);
                setModal("addClassStudent");
              },
              removeClassStudent: (row: Row) => {
                setSelected(row);
                setModal("removeClassStudent");
              },
              completeClass: (row: Row) => {
                setSelected(row);
                setModal("completeClass");
              },
              exportActiveRoster: (rows: Row[]) => void exportActiveRoster(rows),
              exportClassRoster: (group: Row) => void exportClassRoster(group),
              openFollowup: (row: Row) => {
                setSelected(row);
                setModal("followup");
              },
              openPayment: (row: Row) => {
                setSelected(row);
                setModal("payment");
              },
              openFinish: (row: Row) => {
                setSelected(row);
                setModal("finish");
              },
              openRefund: (enrollment: Row, refund?: Row) => {
                setSelected({ enrollment, refund: refund ?? null });
                setModal("refund");
              },
              createInvoice: openInvoiceConfirm,
              createAgentStatement: async (agentId: string, period: string) => {
                await submitBody("create_agent_statement", { agentId, period });
              },
              openCourse: () => setModal("course"),
              openAgent: () => setModal("agent"),
              openMember: () => setModal("member"),
              transferMember: (row: Row) => {
                setSelected(row);
                setModal("memberTransfer");
              },
              updateMember: async (
                id: string,
                role: string,
                status: string,
              ) => {
                await submitBody("update_member", { id, role, status });
              },
              deleteMember: (row: Row) =>
                setDeleteTarget({
                  type: "member",
                  id: String(row.id),
                  name: String(row.display_name),
                  detail: `${String(row.email)} · 删除后立即停止登录，历史业务记录保留`,
                }),
            })
          )}
        </div>
      </main>

      <Dialog
        open={modal !== null}
        onOpenChange={(open) => {
          if (!open) {
            setModal(null);
            setSelected(null);
            setError("");
          }
        }}
      >
        <DialogContent
          className={`max-h-[90vh] overflow-y-auto ${modal === "aiImport" || modal === "studentProfile" || modal === "enrollmentEdit" ? "sm:max-w-5xl" : modal === "invoiceConfirm" ? "sm:max-w-3xl" : "sm:max-w-2xl"}`}
        >
          {error && (
            <div
              role="alert"
              className="flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            >
              <span>
                <strong>未能保存：</strong>
                {error}
              </span>
              <button type="button" onClick={() => setError("")} aria-label="关闭错误提示">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          {modal === "student" && (
            <StudentForm
              catalog={catalog}
              member={member}
              saving={saving}
              onAi={() => void openAiImport("student")}
              onSubmit={(e) => {
                e.preventDefault();
                void submit("create_student", e.currentTarget);
              }}
            />
          )}
          {modal === "studentEdit" && selected && (
            <StudentEditForm
              student={selected}
              catalog={catalog}
              member={member}
              saving={saving}
              onSubmit={(e) => {
                e.preventDefault();
                void submit("update_student", e.currentTarget);
              }}
            />
          )}
          {modal === "studentProfile" && selected && (
            <StudentProfile
              data={selected}
              onEditStudent={(student) => void openEditStudent(student)}
              onEditEnrollment={(enrollment) => void openEditEnrollment(enrollment)}
              onFollowup={(student) => {
                setSelected(student);
                setModal("followup");
              }}
            />
          )}
          {modal === "enrollment" && (
            <EnrollmentForm
              catalog={catalog}
              saving={saving}
              onSubmit={(e) => {
                e.preventDefault();
                void submitEnrollment(e.currentTarget);
              }}
            />
          )}
          {modal === "enrollmentEdit" && selected && (
            <EnrollmentEditForm
              enrollment={selected}
              courses={catalog.courses ?? []}
              classes={catalog.classes ?? []}
              saving={saving}
              onSubmit={(e) => {
                e.preventDefault();
                void submitEnrollmentEdit(e.currentTarget);
              }}
            />
          )}
          {modal === "aiImport" && (
            <AiImportFormWithClasses
              mode={
                (aiDraft?.mode ?? selected?.aiMode ?? "enrollment") as
                  "student" | "enrollment"
              }
              connected={aiConnected}
              draft={aiDraft}
              catalog={catalog}
              working={aiWorking}
              onAnalyze={(e) => {
                e.preventDefault();
                void analyzeImport(e.currentTarget);
              }}
              onUpdate={updateAiRecord}
              onConfirm={() => void confirmImport()}
              onReset={() => setAiDraft(null)}
            />
          )}
          {modal === "classGroup" && (
            <ClassGroupForm
              courses={catalog.courses ?? []}
              defaultCourseId={selected?.courseId}
              saving={saving}
              onSubmit={(e) => {
                e.preventDefault();
                void submit("create_class_group", e.currentTarget);
              }}
            />
          )}
          {modal === "classEdit" && selected && (
            <ClassGroupForm
              courses={catalog.courses ?? []}
              classGroup={selected}
              saving={saving}
              onSubmit={(e) => { e.preventDefault(); void submit("update_class_group", e.currentTarget); }}
            />
          )}
          {modal === "assignClass" && selected && (
            <AssignClassForm
              enrollment={selected}
              classes={data.classOptions ?? []}
              saving={saving}
              onSubmit={(e) => {
                e.preventDefault();
                void submit("assign_enrollment_class", e.currentTarget);
              }}
            />
          )}
          {modal === "addClassStudent" && selected && (
            <AddClassStudentForm
              classGroup={selected}
              rows={data.assignable ?? []}
              roster={data.roster ?? []}
              saving={saving}
              onSubmit={(e) => {
                e.preventDefault();
                void submit("assign_enrollment_class", e.currentTarget);
              }}
            />
          )}
          {modal === "removeClassStudent" && selected && (
            <RemoveClassStudentForm
              row={selected}
              saving={saving}
              onSubmit={(e) => {
                e.preventDefault();
                void submit("remove_enrollment_class", e.currentTarget);
              }}
            />
          )}
          {modal === "completeClass" && selected && (
            <CompleteClassForm
              classGroup={selected}
              saving={saving}
              onSubmit={(e) => {
                e.preventDefault();
                void submit("complete_class_group", e.currentTarget);
              }}
            />
          )}
          {modal === "payment" && selected && (
            <PaymentForm
              enrollment={selected}
              saving={saving}
              onSubmit={(e) => {
                e.preventDefault();
                void submit("record_payment", e.currentTarget);
              }}
            />
          )}
          {modal === "refund" && selected?.enrollment && (
            <RefundForm
              enrollment={selected.enrollment}
              refund={selected.refund}
              saving={saving}
              onCancel={(id) => void refundAction("cancel_refund", id)}
              onDelete={(id) => void refundAction("delete_refund", id)}
              onSubmit={(e) => {
                e.preventDefault();
                void submitRefund(e.currentTarget);
              }}
            />
          )}
          {modal === "finish" && selected && (
            <FinishForm
              enrollment={selected}
              saving={saving}
              onSubmit={(e) => {
                e.preventDefault();
                void submit("finish_course", e.currentTarget);
              }}
            />
          )}
          {modal === "followup" && selected && (
            <FollowupForm
              student={selected}
              saving={saving}
              onSubmit={(e) => {
                e.preventDefault();
                void submit("create_followup", e.currentTarget);
              }}
            />
          )}
          {modal === "course" && (
            <CourseForm
              saving={saving}
              onSubmit={(e) => {
                e.preventDefault();
                void submit("create_course", e.currentTarget);
              }}
            />
          )}
          {modal === "courseEdit" && selected && (
            <CourseForm
              course={selected}
              saving={saving}
              onSubmit={(e) => { e.preventDefault(); void submit("update_course", e.currentTarget); }}
            />
          )}
          {modal === "agent" && (
            <AgentForm
              saving={saving}
              onSubmit={(e) => {
                e.preventDefault();
                void submit("create_agent", e.currentTarget);
              }}
            />
          )}
          {modal === "member" && (
            <MemberForm
              saving={saving}
              onSubmit={(e) => {
                e.preventDefault();
                void submit("create_member", e.currentTarget);
              }}
            />
          )}
          {modal === "memberTransfer" && selected && (
            <MemberTransferForm
              source={selected}
              team={data.team ?? []}
              currentMember={member}
              saving={saving}
              onSubmit={(e) => {
                e.preventDefault();
                void transferCustomers(e.currentTarget);
              }}
            />
          )}
          {modal === "invoiceConfirm" && selected && (
            <InvoiceConfirmForm
              draft={selected}
              saving={saving}
              onSubmit={(e) => {
                e.preventDefault();
                void confirmInvoice(e.currentTarget);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !saving) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteTarget?.type === "student"
                ? "永久删除这个学员？"
                : deleteTarget?.type === "enrollment"
                  ? "永久删除这条报名？"
                  : deleteTarget?.type === "course"
                    ? "删除这门课程？"
                    : deleteTarget?.type === "classGroup"
                      ? "删除这个班级？"
                      : "删除这个员工账号？"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.name} · {deleteTarget?.detail}。
              {deleteTarget?.type === "member"
                ? "如需恢复，可用同一邮箱重新添加。"
                : deleteTarget?.type === "course" || deleteTarget?.type === "classGroup"
                  ? "只有没有关联报名的数据才能删除；有关联记录时系统会阻止操作。"
                  : "此操作无法撤销，相关金额将不再计入统计。"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={saving}
              onClick={(event) => {
                event.preventDefault();
                void deleteRecord();
              }}
            >
              {saving
                ? "删除中…"
                : deleteTarget?.type === "member"
                  ? "确认删除账号"
                  : "确认永久删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function WritingAssessmentView({ member }: { member: Row }) {
  const [assessments, setAssessments] = useState<Row[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [selected, setSelected] = useState<Row | null>(null);
  const [messages, setMessages] = useState<Row[]>([]);
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [connected, setConnected] = useState(true);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const conversationRef = useRef<HTMLDivElement>(null);

  const loadAssessment = useCallback(async (id = "") => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(
        `/api/writing-assessment${id ? `?id=${encodeURIComponent(id)}` : ""}`,
        { cache: "no-store" },
      );
      const result = (await response.json()) as Row;
      if (!response.ok) throw new Error(String(result.error || "读取评估记录失败"));
      setAssessments(Array.isArray(result.assessments) ? result.assessments : []);
      setConnected(Boolean(result.connected));
      setSelected((result.selected as Row) ?? null);
      setMessages(Array.isArray(result.messages) ? result.messages : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "读取评估记录失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAssessment();
  }, [loadAssessment]);

  useEffect(() => {
    conversationRef.current?.scrollTo({
      top: conversationRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, sending]);

  const chooseAssessment = async (id: string) => {
    setSelectedId(id);
    await loadAssessment(id);
  };

  const newAssessment = () => {
    setSelectedId("");
    setSelected(null);
    setMessages([]);
    setMessage("");
    setFiles([]);
    setError("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const sendAssessment = async () => {
    if ((!message.trim() && !files.length) || sending) return;
    setSending(true);
    setError("");
    const optimistic: Row = {
      id: `local-${Date.now()}`,
      role: "user",
      content: message.trim(),
      attachments_json: JSON.stringify(files.map((file) => ({ name: file.name }))),
    };
    setMessages((current) => [...current, optimistic]);
    const sentMessage = message;
    const sentFiles = files;
    setMessage("");
    setFiles([]);
    if (fileRef.current) fileRef.current.value = "";
    try {
      const form = new FormData();
      if (selectedId) form.set("assessmentId", selectedId);
      form.set("message", sentMessage);
      sentFiles.forEach((file) => form.append("files", file));
      const response = await fetch("/api/writing-assessment", {
        method: "POST",
        body: form,
      });
      const result = (await response.json()) as Row;
      if (!response.ok) throw new Error(String(result.error || "评估失败"));
      const id = String(result.assessmentId || selectedId);
      setSelectedId(id);
      await loadAssessment(id);
    } catch (sendError) {
      setMessages((current) => current.filter((item) => item.id !== optimistic.id));
      setMessage(sentMessage);
      setFiles(sentFiles);
      setError(sendError instanceof Error ? sendError.message : "评估失败，请重试");
    } finally {
      setSending(false);
    }
  };

  let recommendation: Row | null = null;
  try {
    const parsed = JSON.parse(String(selected?.recommendation_json || "{}"));
    if (parsed && typeof parsed === "object" && Object.keys(parsed).length)
      recommendation = parsed as Row;
  } catch {
    recommendation = null;
  }

  const copyParentMessage = async () => {
    const text = String(selected?.parent_message || recommendation?.parentMessage || "");
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="grid min-h-[680px] gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
      <Card className="h-fit overflow-hidden xl:sticky xl:top-4">
        <CardHeader className="border-b bg-slate-50/70 pb-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg">评估记录</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                {member.role === "admin" ? "可查看全部员工记录" : "仅显示你的评估记录"}
              </p>
            </div>
            <Button size="sm" onClick={newAssessment}>
              <Plus className="mr-1 h-4 w-4" /> 新评估
            </Button>
          </div>
        </CardHeader>
        <CardContent className="max-h-[620px] space-y-2 overflow-y-auto p-3">
          {loading && !assessments.length ? (
            <p className="px-2 py-8 text-center text-sm text-muted-foreground">读取中…</p>
          ) : assessments.length ? (
            assessments.map((item) => (
              <button
                type="button"
                key={String(item.id)}
                onClick={() => void chooseAssessment(String(item.id))}
                className={`w-full rounded-xl border p-3 text-left transition ${
                  selectedId === item.id
                    ? "border-blue-500 bg-blue-50 shadow-sm"
                    : "border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-semibold text-slate-900">{String(item.student_name || "待补充姓名")}</span>
                  <Badge variant={item.status === "completed" ? "default" : "secondary"}>
                    {item.status === "completed" ? "已完成" : "评估中"}
                  </Badge>
                </div>
                <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                  {[item.school_name, item.grade].filter(Boolean).join(" · ") || "等待补充学校和年级"}
                </p>
                {item.recommended_cw_level ? (
                  <p className="mt-2 text-xs font-medium text-blue-700">
                    CW {String(item.recommended_cw_level)} · GW {String(item.recommended_gw_level)}
                  </p>
                ) : null}
                {member.role === "admin" && item.created_by_name ? (
                  <p className="mt-1 text-[11px] text-muted-foreground">评估人：{String(item.created_by_name)}</p>
                ) : null}
              </button>
            ))
          ) : (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              还没有评估记录，点击“新评估”开始。
            </div>
          )}
        </CardContent>
      </Card>

      <div className="min-w-0 space-y-5">
        {!connected ? (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            OpenAI API 尚未连接，请管理员检查平台的加密环境变量。
          </div>
        ) : null}
        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        ) : null}

        <Card className="overflow-hidden">
          <CardHeader className="border-b bg-gradient-to-r from-blue-50 to-amber-50">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-blue-700 p-2.5 text-white"><Bot className="h-5 w-5" /></div>
                <div>
                  <CardTitle className="text-xl">Codex 写作评估助手</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    通过对话补齐资料，匹配 Creative Writing 与 Great Writing 级别
                  </p>
                </div>
              </div>
              <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">课程知识库已连接</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div ref={conversationRef} className="h-[460px] space-y-4 overflow-y-auto bg-slate-50/50 p-4 sm:p-6">
              {!messages.length ? (
                <div className="mx-auto max-w-2xl rounded-2xl border border-blue-100 bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-2 font-semibold text-blue-900">
                    <Sparkles className="h-5 w-5 text-amber-500" /> 开始一份新评估
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-600">
                    请先告诉我孩子姓名、来自国际学校还是公立学校、学校名称及年级，并上传最近 2–3 篇作文。也请说明作品是否由孩子独立完成、是否经过老师、家长或 AI 大幅修改。
                  </p>
                  <button
                    type="button"
                    onClick={() => setMessage("孩子姓名：\n学校体系（国际/公立）：\n学校名称：\n年级/年龄：\n英语学习背景：\n作文是否独立完成：")}
                    className="mt-4 text-sm font-medium text-blue-700 hover:underline"
                  >
                    使用资料模板
                  </button>
                </div>
              ) : null}
              {messages.map((item) => {
                let attachments: Row[] = [];
                try {
                  const parsed = JSON.parse(String(item.attachments_json || "[]"));
                  if (Array.isArray(parsed)) attachments = parsed;
                } catch {
                  attachments = [];
                }
                const isUser = item.role === "user";
                return (
                  <div key={String(item.id)} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ${
                      isUser ? "bg-blue-700 text-white" : "border border-slate-200 bg-white text-slate-800"
                    }`}>
                      {item.content ? <p className="whitespace-pre-wrap">{String(item.content)}</p> : null}
                      {attachments.length ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {attachments.map((attachment, index) => (
                            <span key={`${String(attachment.name)}-${index}`} className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs ${isUser ? "bg-white/15" : "bg-slate-100"}`}>
                              <FileText className="h-3.5 w-3.5" /> {String(attachment.name || "作文附件")}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
              {sending ? (
                <div className="flex justify-start">
                  <div className="rounded-2xl border bg-white px-4 py-3 text-sm text-muted-foreground shadow-sm">
                    正在阅读作文并匹配课程级别…
                  </div>
                </div>
              ) : null}
            </div>
            <div className="border-t bg-white p-4">
              {files.length ? (
                <div className="mb-3 flex flex-wrap gap-2">
                  {files.map((file, index) => (
                    <span key={`${file.name}-${index}`} className="inline-flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-1.5 text-xs text-blue-800">
                      <Paperclip className="h-3.5 w-3.5" /> {file.name}
                      <button type="button" aria-label="移除文件" onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
              <Textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault();
                    void sendAssessment();
                  }
                }}
                placeholder="补充孩子背景、回答助手问题，或说明希望重点评估的方面…"
                className="min-h-24 resize-none"
                disabled={sending || !connected}
              />
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <input
                    ref={fileRef}
                    type="file"
                    multiple
                    accept=".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx,.txt,.md"
                    className="hidden"
                    onChange={(event) => {
                      const selectedFiles = Array.from(event.target.files || []);
                      const combined = [...files, ...selectedFiles];
                      setFiles(combined.slice(0, WRITING_ASSESSMENT_MAX_FILES));
                      setError(
                        combined.length > WRITING_ASSESSMENT_MAX_FILES
                          ? `每次最多上传 ${WRITING_ASSESSMENT_MAX_FILES} 个文件`
                          : "",
                      );
                      event.currentTarget.value = "";
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => fileRef.current?.click()}
                    disabled={sending || !connected || files.length >= WRITING_ASSESSMENT_MAX_FILES}
                  >
                    <Paperclip className="mr-2 h-4 w-4" /> 上传作文（最多10份）
                  </Button>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    图片、PDF、Word、TXT；已选 {files.length}/10，单份 10MB 以内
                  </p>
                </div>
                <Button onClick={() => void sendAssessment()} disabled={sending || !connected || (!message.trim() && !files.length)}>
                  <Send className="mr-2 h-4 w-4" /> {sending ? "分析中…" : "发送给 Codex"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {recommendation ? (
          <Card className="overflow-hidden border-emerald-200">
            <CardHeader className="border-b bg-emerald-50">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-emerald-900">
                    <CheckCircle2 className="h-5 w-5" /> 课程匹配建议
                  </CardTitle>
                  <p className="mt-1 text-sm text-emerald-800">基于当前资料生成，可继续对话补充后更新结论</p>
                </div>
                <Badge className="bg-emerald-700">信心度 {String(recommendation.confidence || 0)}%</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-5 p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-blue-700">Creative Writing</p>
                  <p className="mt-1 text-2xl font-bold text-blue-950">{String(recommendation.creativeWritingLevel || "—")}</p>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-amber-700">Great Writing</p>
                  <p className="mt-1 text-2xl font-bold text-amber-950">{String(recommendation.greatWritingLevel || "—")}</p>
                </div>
              </div>
              <div className="grid gap-5 lg:grid-cols-3">
                {[
                  ["推荐依据", recommendation.reasons],
                  ["目前优势", recommendation.strengths],
                  ["下一阶段重点", recommendation.priorities],
                ].map(([label, values]) => (
                  <div key={String(label)}>
                    <h4 className="font-semibold text-slate-900">{String(label)}</h4>
                    <ul className="mt-2 space-y-2 text-sm text-slate-600">
                      {(Array.isArray(values) ? values : []).map((value, index) => (
                        <li key={`${String(value)}-${index}`} className="flex gap-2"><span className="text-blue-600">•</span><span>{String(value)}</span></li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <div className="rounded-xl border bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="font-semibold text-slate-900">可直接发给家长的话术</h4>
                  <Button size="sm" variant="outline" onClick={() => void copyParentMessage()}>{copied ? "已复制" : "复制话术"}</Button>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-700">{String(selected?.parent_message || recommendation.parentMessage || "")}</p>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

function renderView(
  view: View,
  data: Row,
  filtered: Row[] | null,
  actions: Row,
) {
  if (view === "dashboard")
    return (
      <Dashboard
        data={data}
        onEnroll={actions.openEnrollment}
        onChanged={actions.reloadDashboard}
        onOpenProfile={actions.openStudentProfile}
        canEnroll={[
          "admin",
          "sales",
          "operations",
          "operations_finance",
        ].includes(actions.member.role)}
      />
    );
  if (view === "writingAssessment")
    return <WritingAssessmentView member={actions.member} />;
  if (view === "students")
    return (
      <Students
        rows={filtered ?? data.students ?? []}
        member={actions.member}
        onNew={actions.openStudent}
        onAi={actions.openStudentAi}
        onEdit={actions.openEditStudent}
        onView={actions.openStudentProfile}
        onFollowup={actions.openFollowup}
        onDelete={actions.deleteStudent}
        onBulkDelete={actions.deleteStudents}
        saving={actions.saving}
        canDelete={["admin", "sales", "operations", "operations_finance"].includes(actions.member.role)}
      />
    );
  if (view === "enrollments")
    return (
      <Enrollments
        rows={filtered ?? data.enrollments ?? []}
        period={[actions.filterYear, actions.filterMonth]
          .filter(Boolean)
          .join("-")}
        member={actions.member}
        onNew={actions.openEnrollment}
        onAiImport={actions.openAiImport}
        onPayment={actions.openPayment}
        onFinish={actions.openFinish}
        onInvoice={actions.createInvoice}
        onRefund={actions.openRefund}
        onEdit={actions.editEnrollment}
        onDelete={actions.deleteEnrollment}
        canEdit={["admin", "finance", "sales", "operations", "operations_finance"].includes(actions.member.role)}
        canDelete={["admin", "sales"].includes(actions.member.role)}
      />
    );
  if (view === "classes")
    return (
      <ClassesView
        data={data}
        member={actions.member}
        onNew={actions.openClassGroup}
        onCourse={actions.openCourse}
        onEditCourse={actions.editCourse}
        onDeleteCourse={actions.deleteCourse}
        onEditClass={actions.editClass}
        onDeleteClass={actions.deleteClass}
        onAssign={actions.assignClass}
        onAddStudent={actions.addClassStudent}
        onRemoveStudent={actions.removeClassStudent}
        onComplete={actions.completeClass}
        onExport={actions.exportActiveRoster}
        onExportClass={actions.exportClassRoster}
      />
    );
  if (view === "payments")
    return (
      <Payments
        rows={filtered ?? data.payments ?? []}
        onInvoice={(row: Row) => actions.createInvoice(row, "payment")}
      />
    );
  if (view === "followups")
    return (
      <Followups
        rows={filtered ?? data.followups ?? []}
        due={data.due ?? []}
        onOpenProfile={actions.openStudentProfile}
      />
    );
  if (view === "agents")
    return (
      <Agents
        rows={data.agents ?? []}
        onNew={actions.openAgent}
        member={actions.member}
        month={actions.statementMonth}
        setMonth={actions.setStatementMonth}
        onStatement={actions.createAgentStatement}
      />
    );
  if (view === "invoices")
    return <Invoices rows={filtered ?? data.invoices ?? []} />;
  if (view === "audit")
    return <AuditLogs rows={filtered ?? data.auditLogs ?? []} />;
  return (
    <SettingsView
      data={data}
      member={actions.member}
      onAgent={actions.openAgent}
      onMember={actions.openMember}
      transferMember={actions.transferMember}
      updateMember={actions.updateMember}
      deleteMember={actions.deleteMember}
    />
  );
}

function Dashboard({
  data,
  onEnroll,
  onChanged,
  onOpenProfile,
  canEnroll,
}: {
  data: Row;
  onEnroll: () => void;
  onChanged: () => void;
  onOpenProfile: (student: Row) => void;
  canEnroll: boolean;
}) {
  const metrics = data.metrics ?? {},
    paid = formatTotals(metrics.paidMonthByCurrency),
    balance = formatTotals(metrics.balanceByCurrency);
  return (
    <>
      <section className="flex flex-col justify-between gap-4 overflow-hidden rounded-2xl border border-[#244f7b] bg-[linear-gradient(110deg,#102f56,#1c5d99)] p-5 text-white shadow-[0_14px_40px_rgba(16,47,86,.18)] sm:flex-row sm:items-center lg:p-6">
        <div>
          <p className="text-sm font-medium text-[#f5d878]">快速登记</p>
          <h2 className="mt-1 text-xl font-semibold">
            从一笔报名开始，自动归入学员档案
          </h2>
          <p className="mt-2 text-sm text-blue-100/80">
            先搜索已有学员，避免重复建立档案。
          </p>
        </div>
        {canEnroll && (
          <Button
            onClick={onEnroll}
            className="h-11 shrink-0 bg-[#e5b529] text-[#102f56] hover:bg-[#f0c94d]"
          >
            <Plus className="mr-2 h-4 w-4" />
            登记报名
          </Button>
        )}
      </section>
      <CodexPanel onChanged={onChanged} />
      <section className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["本月实收", paid],
          ["本月报名", String(metrics.enrollmentsMonth ?? 0)],
          ["未收余额", balance],
          ["即将结课", String(metrics.dueSoon ?? 0)],
        ].map(([label, value]) => (
          <Metric key={label} label={label} value={value} />
        ))}
      </section>
      <section className="mt-5 grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <Panel title="最近报名" subtitle="最近8笔新建或续报">
          <EnrollmentTable rows={data.recent ?? []} compact />
        </Panel>
        <Panel title="待跟进" subtitle="未来30天预计结课">
          <div className="space-y-2">
            {(data.due ?? []).length ? (
              (data.due ?? []).map((r: Row) => (
                <button
                  type="button"
                  key={r.id}
                  onClick={() => onOpenProfile({ id: r.student_id })}
                  className="group flex w-full items-center justify-between gap-3 rounded-xl border border-transparent bg-slate-50 p-3 text-left transition hover:border-blue-200 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#174f87] focus-visible:ring-offset-2"
                  aria-label={`查看 ${r.student_name} 的学员档案`}
                >
                  <div className="min-w-0">
                    <p className="font-medium text-[#102f56] group-hover:text-[#174f87]">{r.student_name}</p>
                    <p className="text-sm text-slate-500">家长微信：{r.guardian_wechat_name || "待补"}</p>
                    <p className="text-sm text-slate-500">{r.course_name}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <Badge variant="secondary">{r.expected_end_date}</Badge>
                    <span className="text-xs font-medium text-[#174f87]">查看档案</span>
                  </div>
                </button>
              ))
            ) : (
              <Empty icon={BookOpenCheck} text="暂无即将结课的课程" />
            )}
          </div>
        </Panel>
      </section>
    </>
  );
}

type CodexChatMessage = {
  role: "user" | "assistant";
  text: string;
  completed?: number;
};

function CodexPanel({ onChanged }: { onChanged: () => void }) {
  const [messages, setMessages] = useState<CodexChatMessage[]>([
    {
      role: "assistant",
      text: "你好，我可以协助创建学员档案、报名、课程、班级，记录收款或跟进。你也可以上传图片、PDF、Word 或 Excel；信息不完整时，我会先请你补齐再执行。",
    },
  ]);
  const [draft, setDraft] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [working, setWorking] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const scrollArea = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollArea.current?.scrollTo({
      top: scrollArea.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, working]);

  const send = async () => {
    const text = draft.trim();
    if ((!text && !file) || working) return;
    const previous = messages;
    const userText = text || "请读取我上传的文件并按内容处理。";
    setMessages((current) => [
      ...current,
      {
        role: "user",
        text: file ? `${userText}\n附件：${file.name}` : userText,
      },
    ]);
    setDraft("");
    setWorking(true);
    let clearAttachment = false;
    try {
      const body = new FormData();
      body.set("message", userText);
      body.set(
        "history",
        JSON.stringify(
          previous.map(({ role, text: itemText }) => ({
            role,
            text: itemText,
          })),
        ),
      );
      if (file) body.set("file", file);
      const response = await fetch("/api/codex", { method: "POST", body });
      const result = (await response.json()) as Row;
      if (!response.ok)
        throw new Error(String(result.error || "Codex 助手暂时无法处理"));
      const completed = Array.isArray(result.completed)
        ? result.completed.length
        : 0;
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          text: String(result.reply || "已处理。"),
          completed,
        },
      ]);
      if (completed) onChanged();
      clearAttachment = completed > 0;
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          text:
            error instanceof Error
              ? error.message
              : "Codex 助手暂时无法处理",
        },
      ]);
    } finally {
      if (clearAttachment) {
        setFile(null);
        if (fileInput.current) fileInput.current.value = "";
      }
      setWorking(false);
    }
  };

  return (
    <section className="mt-5 overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-[0_12px_36px_rgba(23,79,135,.10)]">
      <div className="flex flex-col justify-between gap-3 bg-[linear-gradient(100deg,#eaf4ff,#fff8dd)] px-5 py-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-[#123f70]">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#175b99] text-white">
              <Bot className="h-5 w-5" />
            </span>
            Codex 业务助手
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            用文字或文件完成平台操作；必填信息缺失时会先向你确认。
          </p>
        </div>
        <Badge
          variant="secondary"
          className="w-fit bg-emerald-100 text-emerald-800"
        >
          权限与操作日志已启用
        </Badge>
      </div>
      <div
        ref={scrollArea}
        className="max-h-[28rem] space-y-3 overflow-y-auto bg-slate-50/70 px-4 py-4 sm:px-5"
      >
        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ${message.role === "user" ? "bg-[#175b99] text-white" : "border border-slate-200 bg-white text-slate-700"}`}
            >
              {message.text}
              {message.completed ? (
                <p className="mt-2 border-t border-emerald-200 pt-2 font-semibold text-emerald-700">
                  已完成并记录 {message.completed} 项平台操作
                </p>
              ) : null}
            </div>
          </div>
        ))}
        {working && (
          <div className="flex justify-start">
            <div className="rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm text-slate-500">
              <Sparkles className="mr-2 inline h-4 w-4 animate-pulse text-[#175b99]" />
              正在核对资料与权限…
            </div>
          </div>
        )}
      </div>
      <div className="border-t border-slate-200 bg-white p-4 sm:p-5">
        {file && (
          <div className="mb-3 flex items-center justify-between rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-[#174f87]">
            <span className="min-w-0 truncate">
              <Paperclip className="mr-2 inline h-4 w-4" />
              {file.name}
            </span>
            <button
              type="button"
              className="ml-3 font-semibold"
              onClick={() => {
                setFile(null);
                if (fileInput.current) fileInput.current.value = "";
              }}
            >
              移除
            </button>
          </div>
        )}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
              rows={3}
              placeholder="例如：为示例学员登记报名；或创建一个由指定老师授课的新班级……"
              disabled={working}
            />
          </div>
          <div className="flex gap-2">
            <label className="inline-flex h-10 cursor-pointer items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <Paperclip className="mr-2 h-4 w-4" />
              上传文件
              <input
                ref={fileInput}
                type="file"
                className="sr-only"
                accept=".jpg,.jpeg,.png,.webp,.pdf,.csv,.xls,.xlsx,.txt,.md,.doc,.docx,image/*"
                disabled={working}
                onChange={(event) =>
                  setFile(event.target.files?.[0] ?? null)
                }
              />
            </label>
            <Button
              type="button"
              className="h-10"
              disabled={working || (!draft.trim() && !file)}
              onClick={() => void send()}
            >
              <Send className="mr-2 h-4 w-4" />
              发送
            </Button>
          </div>
        </div>
        <p className="mt-2 text-xs leading-5 text-slate-500">
          Enter 发送，Shift + Enter 换行。单个文件最大 10MB；AI
          只会执行当前账号有权限的操作。
        </p>
      </div>
    </section>
  );
}

function StudentProfile({
  data,
  onEditStudent,
  onEditEnrollment,
  onFollowup,
}: {
  data: Row;
  onEditStudent: (student: Row) => void;
  onEditEnrollment: (enrollment: Row) => void;
  onFollowup: (student: Row) => void;
}) {
  const student: Row = data.student ?? {};
  const enrollments: Row[] = data.enrollments ?? [];
  const followups: Row[] = data.followups ?? [];
  const totals = new Map<string, { net: number; paid: number }>();
  for (const row of enrollments) {
    const currency = String(row.currency || "SGD");
    const current = totals.get(currency) ?? { net: 0, paid: 0 };
    current.net += Number(row.net_amount_cents || 0);
    current.paid += Number(row.paid_cents || 0);
    totals.set(currency, current);
  }
  return (
    <div>
      <DialogHeader>
        <div className="flex flex-wrap items-start justify-between gap-3 pr-8">
          <DialogTitle>
            <button
              type="button"
              className="text-left text-[#174f87] underline-offset-4 hover:underline"
              onClick={() => onEditStudent(student)}
            >
              {student.full_name || "学员详情"}
            </button>
          </DialogTitle>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => onEditStudent(student)}>
              编辑全部资料与备注
            </Button>
            <Button type="button" size="sm" onClick={() => onFollowup(student)}>
              <MessageSquarePlus className="mr-2 h-4 w-4" />
              记录跟进
            </Button>
          </div>
        </div>
        <DialogDescription>
          学员编号：<span className="font-mono font-semibold text-[#174f87]">{student.code || "—"}</span>
          {student.english_name ? ` · ${student.english_name}` : ""}
          {student.classin_account
            ? ` · ClassIn ${student.classin_account}`
            : " · ClassIn 账号待补"}
        </DialogDescription>
      </DialogHeader>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border bg-slate-50 p-3">
          <p className="text-xs font-medium text-slate-500">学校 / 年级</p>
          <p className="mt-1 font-medium">{student.school || "待补"}</p>
          <p className="text-sm text-slate-500">{student.grade || "待补年级"}</p>
        </div>
        <div className="rounded-xl border bg-slate-50 p-3">
          <p className="text-xs font-medium text-slate-500">家长微信 / 联系方式</p>
          <p className="mt-1 font-medium">{student.guardian_wechat_name || "待补"}</p>
          <p className="text-sm text-slate-500">{student.guardian_phone || "暂无电话"}</p>
        </div>
        <div className="rounded-xl border bg-slate-50 p-3">
          <p className="text-xs font-medium text-slate-500">课程顾问 / 渠道</p>
          <p className="mt-1 font-medium">{student.owner_name || "未分配"}</p>
          <p className="text-sm text-slate-500">{student.source_agent_name || "自然到访"}</p>
        </div>
        <div className="rounded-xl border bg-slate-50 p-3">
          <p className="text-xs font-medium text-slate-500">报名次数</p>
          <p className="mt-1 text-xl font-semibold text-[#174f87]">{enrollments.length}</p>
          <p className="text-sm text-slate-500">首次登记 {student.first_registered_at || "待补"}</p>
        </div>
      </div>

      {[...totals.entries()].length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {[...totals.entries()].map(([currency, total]) => (
            <Badge key={currency} variant="secondary" className="px-3 py-1 text-sm">
              {currency}：应收 {money(total.net, currency)} · 已收 {money(total.paid, currency)}
            </Badge>
          ))}
        </div>
      )}

      <div className="mt-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold text-[#102f56]">跟进记录 · {followups.length}</h3>
          <Button type="button" size="sm" variant="outline" onClick={() => onFollowup(student)}>
            <MessageSquarePlus className="mr-2 h-4 w-4" />
            新增跟进
          </Button>
        </div>
        {followups.length ? (
          <div className="space-y-2">
            {followups.map((row) => (
              <article key={row.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-[#183858]">
                    {row.followed_at} · {row.method || "其他"}
                  </p>
                  <p className="text-xs text-slate-500">{row.salesperson_name || "未分配课程顾问"}</p>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{row.note}</p>
                {row.next_follow_up_at && (
                  <p className="mt-2 text-xs font-medium text-amber-700">下次跟进：{row.next_follow_up_at}</p>
                )}
              </article>
            ))}
          </div>
        ) : (
          <Empty icon={BookOpenCheck} text="该学员还没有跟进记录" />
        )}
      </div>

      <div className="mt-6">
        <h3 className="mb-3 font-semibold text-[#102f56]">全部报名记录 · {enrollments.length}</h3>
        {enrollments.length ? (
          <div className="table-scroll">
            <table className="student-history-table">
              <thead>
                <tr>
                  <th>报名日期 / 编号</th>
                  <th>报名课程 / 班级</th>
                  <th>类型</th>
                  <th className="text-right">应收 / 已收</th>
                  <th>课程顾问 / 渠道</th>
                  <th>状态 / 结课日期</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {enrollments.map((row) => (
                  <tr key={row.id}>
                    <td className="whitespace-nowrap">
                      <b>{row.registered_at}</b>
                      <small className="font-mono">{row.number}</small>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="text-left font-semibold text-[#174f87] underline-offset-4 hover:underline"
                        onClick={() => onEditEnrollment({ ...row, guardian_wechat_name: student.guardian_wechat_name })}
                      >
                        {row.course_name}
                      </button>
                      <small>{row.class_group_names || "暂未分班"}</small>
                    </td>
                    <td><Badge variant="secondary">{registrationName(row.registration_type)}</Badge></td>
                    <td className="whitespace-nowrap text-right tabular-nums">
                      <b>{money(row.net_amount_cents, row.currency)}</b>
                      <small>已收 {money(row.paid_cents, row.currency)}</small>
                    </td>
                    <td>
                      <b>{row.salesperson_name || "未分配"}</b>
                      <small>{row.agent_name || "无渠道"}</small>
                    </td>
                    <td className="whitespace-nowrap">
                      <Status value={row.status} />
                      <small>{row.actual_end_date || row.expected_end_date || "结课日期待补"}</small>
                    </td>
                    <td>
                      <Button type="button" size="sm" variant="outline" onClick={() => onEditEnrollment({ ...row, guardian_wechat_name: student.guardian_wechat_name })}>
                        编辑报名
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon={BookOpenCheck} text="该学员还没有报名记录" />
        )}
      </div>
    </div>
  );
}

function Students({
  rows,
  member,
  onNew,
  onAi,
  onEdit,
  onView,
  onFollowup,
  onDelete,
  onBulkDelete,
  saving,
  canDelete,
}: {
  rows: Row[];
  member: Row;
  onNew: () => void;
  onAi: () => void;
  onEdit: (r: Row) => void;
  onView: (r: Row) => void;
  onFollowup: (r: Row) => void;
  onDelete: (r: Row) => void;
  onBulkDelete: (ids: string[]) => Promise<boolean>;
  saving: boolean;
  canDelete: boolean;
}) {
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = useMemo(
    () =>
      rows.slice(
        (currentPage - 1) * PAGE_SIZE,
        currentPage * PAGE_SIZE,
      ),
    [rows, currentPage],
  );
  useEffect(() => {
    const timer = window.setTimeout(() => setPage(1), 0);
    return () => window.clearTimeout(timer);
  }, [rows]);
  const selectableIds = useMemo(
    () =>
      pageRows
        .filter(
          (row) =>
            canDelete &&
            (member.role !== "sales" ||
              row.owner_user_id === member.userId ||
              row.created_by === member.userId),
        )
        .map((row) => String(row.id)),
    [pageRows, member.role, member.userId, canDelete],
  );
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const available = new Set(selectableIds);
      setSelectedIds(
        (current) => new Set([...current].filter((id) => available.has(id))),
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [selectableIds]);
  const allSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id));
  const someSelected = selectedIds.size > 0 && !allSelected;
  const toggleAll = (checked: boolean) =>
    setSelectedIds(checked ? new Set(selectableIds) : new Set());
  const toggleOne = (id: string, checked: boolean) =>
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  return (
    <>
      <Panel
        title={`学员档案 · ${rows.length}`}
        action={
          <div className="flex flex-wrap gap-2">
            {canDelete && (
              <Button
                variant="outline"
                className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                disabled={!selectedIds.size || saving}
                onClick={() => setConfirmBulkDelete(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                删除所选{selectedIds.size ? `（${selectedIds.size}）` : ""}
              </Button>
            )}
            <Button variant="outline" onClick={() => exportStudents(rows)}>
              <Download className="mr-2 h-4 w-4" />
              导出名单
            </Button>
            <Button variant="outline" onClick={onAi}>
              <Sparkles className="mr-2 h-4 w-4" />
              AI 登记学员
            </Button>
            <Button onClick={onNew}>
              <UserPlus className="mr-2 h-4 w-4" />
              新建学员
            </Button>
          </div>
        }
      >
      {rows.length ? (
        <div className="table-scroll">
          <table className="min-w-[1600px]">
            <thead>
              <tr>
                {canDelete && (
                  <th className="w-12">
                    <Checkbox
                      aria-label="选择当前列表全部可删除学员"
                      checked={allSelected ? true : someSelected ? "indeterminate" : false}
                      disabled={!selectableIds.length}
                      onCheckedChange={(checked) => toggleAll(checked === true)}
                    />
                  </th>
                )}
                <th className="w-16 text-center">序号</th>
                <th className="min-w-40">学员编号</th>
                <th>学员</th>
                <th>家长微信</th>
                <th>联系方式</th>
                <th>学校 / 年级</th>
                <th>首次登记</th>
                <th>课程顾问</th>
                <th className="min-w-32">渠道来源</th>
                <th>最近跟进</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r, index) => {
                const canManage =
                  member.role !== "sales" ||
                  r.owner_user_id === member.userId ||
                  r.created_by === member.userId;
                return (
                  <tr key={r.id}>
                    {canDelete && (
                      <td>
                        <Checkbox
                          aria-label={`选择学员 ${r.full_name}`}
                          checked={selectedIds.has(String(r.id))}
                          disabled={!canManage}
                          onCheckedChange={(checked) =>
                            toggleOne(String(r.id), checked === true)
                          }
                        />
                      </td>
                    )}
                    <td className="text-center font-semibold tabular-nums text-slate-500">
                      {(currentPage - 1) * PAGE_SIZE + index + 1}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="font-mono font-semibold text-[#174f87] underline-offset-4 hover:underline"
                        onClick={() => onView(r)}
                      >
                        {r.code || "—"}
                      </button>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="text-left font-semibold text-[#174f87] underline-offset-4 hover:underline"
                        onClick={() => onView(r)}
                      >
                        {r.full_name}
                      </button>
                      <small>
                        {r.english_name || "—"}
                        {r.classin_account
                          ? ` · ClassIn ${r.classin_account}`
                          : ""}
                      </small>
                    </td>
                    <td>
                      {r.guardian_wechat_name || "待补"}
                    </td>
                    <td>
                      {r.guardian_phone || "—"}
                    </td>
                    <td>
                      {r.school || "—"}
                      <small>{r.grade || "待补年级"}</small>
                    </td>
                    <td>
                      {r.first_registered_at || "待补"}
                      <small>{r.enrollment_count} 次报名</small>
                    </td>
                    <td>
                      <b>{r.owner_name || "未分配"}</b>
                    </td>
                    <td>
                      <Badge variant="secondary">
                        {r.source_agent_name || "自然到访"}
                      </Badge>
                    </td>
                    <td>
                      {r.last_followed_at || "暂无"}
                      <small>
                        {r.last_followup_note ||
                          (r.next_follow_up_at &&
                            `下次 ${r.next_follow_up_at}`) ||
                          ""}
                      </small>
                    </td>
                    <td>
                      {canManage ? (
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onView(r)}
                          >
                            查看详情
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => onEdit?.(r)}
                          >
                            编辑
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onFollowup(r)}
                          >
                            <MessageSquarePlus className="mr-1 h-4 w-4" />
                            跟进
                          </Button>
                          {canDelete && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-600 hover:bg-red-50 hover:text-red-700"
                              onClick={() => onDelete(r)}
                            >
                              <Trash2 className="mr-1 h-4 w-4" />
                              删除
                            </Button>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">仅查看</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty icon={UsersRound} text="还没有学员，先建立第一份档案" />
      )}
      {rows.length > PAGE_SIZE && (
        <ListPagination
          page={currentPage}
          totalPages={pageCount}
          totalItems={rows.length}
          onPageChange={setPage}
        />
      )}
      </Panel>
      <AlertDialog open={confirmBulkDelete} onOpenChange={setConfirmBulkDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除所选 {selectedIds.size} 名学员？</AlertDialogTitle>
            <AlertDialogDescription>
              将永久删除这些学员档案，以及关联的报名、收款、跟进、发票和付款截图。每位学员的删除操作都会记录操作者和档案信息，此操作无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={saving || !selectedIds.size}
              onClick={(event) => {
                event.preventDefault();
                const ids = [...selectedIds];
                setConfirmBulkDelete(false);
                void onBulkDelete(ids).then((ok) => {
                  if (ok) setSelectedIds(new Set());
                });
              }}
            >
              {saving ? "删除中…" : `确认删除 ${selectedIds.size} 名学员`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
function ClassesView({
  data,
  member,
  onNew,
  onCourse,
  onEditCourse,
  onDeleteCourse,
  onEditClass,
  onDeleteClass,
  onAssign,
  onAddStudent,
  onRemoveStudent,
  onComplete,
  onExport,
  onExportClass,
}: {
  data: Row;
  member: Row;
  onNew: (course?: Row) => void;
  onCourse: () => void;
  onEditCourse: (course: Row) => void;
  onDeleteCourse: (course: Row) => void;
  onEditClass: (group: Row) => void;
  onDeleteClass: (group: Row) => void;
  onAssign: (r: Row) => void;
  onAddStudent: (group: Row) => void;
  onRemoveStudent: (row: Row) => void;
  onComplete: (r: Row) => void;
  onExport: (rows: Row[]) => void;
  onExportClass: (group: Row) => void;
}) {
  const [classQuery, setClassQuery] = useState("");
  const [teacherFilter, setTeacherFilter] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("全部课程");
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [classStatus, setClassStatus] = useState<"active" | "completed" | "all">("active");
  const [coursePage, setCoursePage] = useState(1);
  const [showAllCourses, setShowAllCourses] = useState(false);
  const classes: Row[] = data.classes ?? [],
    courses: Row[] = data.courses ?? [],
    roster: Row[] = data.roster ?? [],
    activeAll = classes.filter((r) => r.status === "active"),
    completedAll = classes.filter((r) => r.status === "completed"),
    canManage = ["admin", "sales", "operations", "operations_finance"].includes(
      member.role,
    );
  const canEditCreatedItem = (row: Row) =>
    member.role === "admin" || String(row.created_by || "") === String(member.userId || "");
  const query = classQuery.trim().toLowerCase();
  const teachers = Array.from(
    new Set(
      classes
        .map((group) => String(group.teacher_name || "").trim())
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b, "zh-CN"));
  const matchesClass = (group: Row) =>
    (!teacherFilter || String(group.teacher_name || "") === teacherFilter) &&
    (!query ||
      [
        group.name,
        group.course_name,
        group.classin_class_name,
        group.teacher_name,
      ].some((value) => String(value || "").toLowerCase().includes(query)));
  const matchingActive = activeAll.filter(matchesClass);
  const matchingCompleted = completedAll.filter(matchesClass);
  const visibleCourses = courses.filter((course) => {
    const matchingClass = classes.some(
      (group) => group.course_id === course.id && matchesClass(group),
    );
    const matchingCourse = [course.name, course.category, course.unit_label].some(
      (value) => String(value || "").toLowerCase().includes(query),
    );
    const categoryMatch = selectedCategory === "全部课程" || displayCourseCategory(course.category) === selectedCategory;
    if (!categoryMatch) return false;
    if (teacherFilter) return matchingClass;
    return !query || matchingCourse || matchingClass;
  });
  const coursePageCount = Math.max(1, Math.ceil(visibleCourses.length / 3));
  const safeCoursePage = Math.min(coursePage, coursePageCount);
  const displayedCourses = showAllCourses
    ? visibleCourses
    : visibleCourses.slice((safeCoursePage - 1) * 3, safeCoursePage * 3);
  const selectedCourse = visibleCourses.find((course) => course.id === selectedCourseId) ?? null;
  const visibleCourseIds = new Set(visibleCourses.map((course) => course.id));
  const inCourseScope = (group: Row) => visibleCourseIds.has(group.course_id) && (!selectedCourseId || group.course_id === selectedCourseId);
  const active = matchingActive.filter(inCourseScope);
  const completed = matchingCompleted.filter(inCourseScope);
  const shownGroups = classStatus === "active" ? active : classStatus === "completed" ? completed : [...active, ...completed];
  const shownGroupIds = new Set(shownGroups.map((group) => group.id));
  const filteredRoster = roster.filter((row) => shownGroupIds.has(row.class_group_id));
  const hasFilters = Boolean(query || teacherFilter || selectedCourseId || selectedCategory !== "全部课程");
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_12rem_12rem_auto] md:items-end">
          <Field label="搜索课程或班级">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={classQuery}
                onChange={(event) => { setClassQuery(event.target.value); setCoursePage(1); }}
                className="pl-9"
                placeholder="课程名称、内部班级名或 ClassIn 班级名"
              />
            </div>
          </Field>
          <Field label="班级状态">
            <select value={classStatus} onChange={(event) => setClassStatus(event.target.value as "active" | "completed" | "all")} className="h-10 w-full rounded-lg border bg-white px-3 text-sm">
              <option value="active">Active · 在读班级</option>
              <option value="completed">已结课班级</option>
              <option value="all">全部班级</option>
            </select>
          </Field>
          <Field label="授课老师">
            <select
              value={teacherFilter}
              onChange={(event) => { setTeacherFilter(event.target.value); setCoursePage(1); }}
              className="h-10 w-full rounded-lg border bg-white px-3 text-sm"
            >
              <option value="">全部老师</option>
              {teachers.map((teacher) => (
                <option key={teacher} value={teacher}>{teacher}</option>
              ))}
            </select>
          </Field>
          {hasFilters && (
            <Button
              type="button"
              variant="outline"
              onClick={() => { setClassQuery(""); setTeacherFilter(""); setSelectedCategory("全部课程"); setSelectedCourseId(""); setClassStatus("all"); setCoursePage(1); }}
            >
              <X className="mr-2 h-4 w-4" />
              清除筛选
            </Button>
          )}
        </div>
        {hasFilters && (
          <p className="mt-3 text-sm text-slate-500">
            找到 {visibleCourses.length} 门课程、{active.length} 个在读班级、{completed.length} 个已结课班级
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        {["全部课程", ...courseCategories].map((category) => {
          const count = category === "全部课程" ? courses.length : courses.filter((course) => displayCourseCategory(course.category) === category).length;
          return <Button key={category} type="button" size="sm" variant={selectedCategory === category ? "default" : "outline"} onClick={() => { setSelectedCategory(category); setSelectedCourseId(""); setCoursePage(1); setShowAllCourses(false); }}>
            {category} · {count}
          </Button>;
        })}
      </div>
      <Panel
        title={`课程与开班 · ${visibleCourses.length}${hasFilters ? ` / ${courses.length}` : ""} 门课程`}
        subtitle="先建立课程，再从课程卡片直接开班；报名课程用于财务归属，实际班级可按教学安排调整。"
        action={<div className="flex flex-wrap gap-2">
          {visibleCourses.length > 3 && <Button type="button" variant="outline" size="sm" onClick={() => { setShowAllCourses((value) => !value); setCoursePage(1); }}>
            {showAllCourses ? "每页展示 3 门" : "展示全部课程"}
          </Button>}
          {canManage && <Button onClick={onCourse} size="sm"><Plus className="mr-2 h-4 w-4" />新增课程</Button>}
        </div>}
      >
        {visibleCourses.length ? (
          <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {displayedCourses.map((course: Row) => {
              const courseClasses = matchingActive.filter((group) => group.course_id === course.id);
              const canEditCourse = canEditCreatedItem(course);
              return <div key={course.id} className={`flex flex-col justify-between gap-4 rounded-2xl border bg-white p-4 transition hover:border-blue-300 hover:shadow-sm ${selectedCourse?.id === course.id ? "border-blue-400 ring-2 ring-blue-100" : "border-slate-200"}`}>
                <button type="button" className="text-left" onClick={() => setSelectedCourseId(String(course.id))}><div className="flex items-start justify-between gap-3"><p className="font-semibold text-[#102f56]">{course.name}</p><Badge variant="secondary">{courseClasses.length} 个 Active 班</Badge></div><p className="mt-2 text-sm text-slate-500">{displayCourseCategory(course.category)} · {course.unit_label} · {money(course.standard_price_cents, course.currency)}</p><p className="mt-1 text-xs text-slate-500">创建者：{course.creator_name || "未知员工"}</p><p className="mt-2 text-xs font-medium text-[#174f87]">点击查看此课程的班级</p></button>
                {canManage && <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => onNew(course)}><CalendarDays className="mr-2 h-4 w-4" />为此课程开班</Button>{canEditCourse && <><Button size="sm" variant="ghost" onClick={() => onEditCourse(course)}>编辑</Button><Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => onDeleteCourse(course)}><Trash2 className="mr-1 h-4 w-4" />删除</Button></>}</div>}
              </div>;
            })}
          </div>
          {!showAllCourses && visibleCourses.length > 3 && <div className="flex flex-wrap items-center justify-center gap-3 border-t border-slate-100 pt-4">
            <Button type="button" size="sm" variant="outline" disabled={safeCoursePage <= 1} onClick={() => setCoursePage((page) => Math.max(1, page - 1))}>上一页</Button>
            <span className="text-sm font-semibold text-[#174f87]">第 {safeCoursePage} / {coursePageCount} 页</span>
            <Button type="button" size="sm" variant="outline" disabled={safeCoursePage >= coursePageCount} onClick={() => setCoursePage((page) => Math.min(coursePageCount, page + 1))}>下一页</Button>
          </div>}
          </div>
        ) : <Empty icon={BookOpenCheck} text={hasFilters ? "没有符合当前条件的课程" : "还没有课程，请先新增课程，再建立第一个班级"} />}
      </Panel>
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 via-white to-amber-50 p-3 shadow-sm">
        <span className="mr-1 text-xl font-extrabold tracking-tight text-[#0755a5] md:text-2xl">{selectedCourse ? `${selectedCourse.name} 的班级` : "全部课程班级"}</span>
        <Button size="sm" variant={classStatus === "active" ? "default" : "outline"} onClick={() => setClassStatus("active")}>Active · {active.length}</Button>
        <Button size="sm" variant={classStatus === "completed" ? "default" : "outline"} onClick={() => setClassStatus("completed")}>已结课 · {completed.length}</Button>
        <Button size="sm" variant={classStatus === "all" ? "default" : "outline"} onClick={() => setClassStatus("all")}>全部 · {active.length + completed.length}</Button>
        {selectedCourseId && <Button size="sm" variant="outline" onClick={() => setSelectedCourseId("")}>全部课程班级</Button>}
        <Button size="sm" variant="outline" disabled={!filteredRoster.length} onClick={() => onExport(filteredRoster)}><Download className="mr-2 h-4 w-4" />下载筛选后的 ClassIn 名单 · {filteredRoster.length} 人次</Button>
      </div>
      {classStatus !== "completed" && <Panel
        title={`Active 班级 · ${active.length}${hasFilters ? ` / ${activeAll.length}` : ""}`}
        subtitle="默认显示 Active 班级；名单同时保留被移除学员及移除日期。"
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={!filteredRoster.length} onClick={() => onExport(filteredRoster)}>
              <Download className="mr-2 h-4 w-4" />
              导出当前筛选名单
            </Button>
            {canManage && (
              <Button onClick={onNew}>
                <Plus className="mr-2 h-4 w-4" />
                新建班级
              </Button>
            )}
          </div>
        }
      >
        {active.length ? (
          <div className="space-y-5">
            {active.map((group) => {
              const students = roster.filter(
                (r) => r.class_group_id === group.id && r.membership_status !== "removed",
              );
              const removedStudents = roster.filter(
                (r) => r.class_group_id === group.id && r.membership_status === "removed",
              );
              const canEditClass = canEditCreatedItem(group);
              return (
                <section
                  key={group.id}
                  className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_8px_28px_rgba(16,47,86,.07)]"
                >
                  <div className="grid gap-5 border-b border-slate-200 bg-[linear-gradient(115deg,#eef6ff_0%,#f8fbff_55%,#fff8d9_100%)] px-5 py-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-start">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="rounded-full bg-[#174f87] px-2.5 py-1 text-xs font-semibold text-white">
                          在读班级
                        </span>
                        <Badge variant="secondary" className="border border-amber-200 bg-amber-50 text-amber-900">
                          {students.length} 名学员
                        </Badge>
                        {Number(group.new_student_count) > 0 && <Badge className="bg-[#e5b529] text-[#102f56]">{group.new_student_count} 名新加入</Badge>}
                      </div>
                      <h3 className="mt-3 break-words text-lg font-semibold leading-7 text-[#102f56]">
                        {group.name}
                      </h3>
                      {String(group.course_name || "") !== String(group.name || "") && <p className="mt-1 text-sm font-medium text-[#37658f]">{group.course_name}</p>}
                      <p className="mt-1 text-xs text-slate-500">创建者：{group.creator_name || "未知员工"}</p>
                      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 2xl:grid-cols-3">
                        <div className="rounded-xl border border-white/80 bg-white/75 px-3.5 py-3 shadow-sm">
                          <dt className="text-xs font-medium text-slate-500">ClassIn 班级</dt>
                          <dd className="mt-1 break-words font-medium text-[#183858]">{group.classin_class_name || group.name}</dd>
                        </div>
                        <div className="rounded-xl border border-white/80 bg-white/75 px-3.5 py-3 shadow-sm">
                          <dt className="text-xs font-medium text-slate-500">授课老师</dt>
                          <dd className="mt-1 font-medium text-[#183858]">{group.teacher_name || "待补"}</dd>
                        </div>
                        <div className="rounded-xl border border-white/80 bg-white/75 px-3.5 py-3 shadow-sm sm:col-span-2 2xl:col-span-1">
                          <dt className="text-xs font-medium text-slate-500">开课与上课安排</dt>
                          <dd className="mt-1 leading-5 text-[#183858]">{group.start_date} · {scheduleText(group)}</dd>
                        </div>
                      </dl>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 border-t border-[#cfdae8] pt-4 xl:max-w-[34rem] xl:justify-end xl:border-l xl:border-t-0 xl:pl-5 xl:pt-0"><Button size="sm" variant="outline" onClick={() => onExportClass(group)}><Download className="mr-1.5 h-4 w-4" />下载本班名单</Button>{canManage && <Button size="sm" onClick={() => onAddStudent(group)}><UserPlus className="mr-1.5 h-4 w-4" />加入学员</Button>}{canEditClass && <><Button size="sm" variant="outline" onClick={() => onEditClass(group)}>编辑班级</Button><Button size="sm" variant="outline" className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800" onClick={() => onComplete(group)}><CheckCircle2 className="mr-1.5 h-4 w-4" />设为结课</Button><Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => onDeleteClass(group)}><Trash2 className="mr-1 h-4 w-4" />删除</Button></>}</div>
                  </div>
                  {students.length ? (
                    <>
                    <div className="table-scroll hidden rounded-none border-0 lg:block">
                      <table className="min-w-[100rem] table-fixed">
                        <colgroup><col className="w-[16%]"/><col className="w-[12%]"/><col className="w-[14%]"/><col className="w-[12%]"/><col className="w-[6%]"/><col className="w-[9%]"/><col className="w-[10%]"/><col className="w-[10%]"/><col className="w-[6%]"/>{canManage && <col className="w-[5%]"/>}</colgroup>
                        <thead>
                          <tr>
                            <th>学员档案</th>
                            <th>家长微信</th>
                            <th>报名课程</th>
                            <th>ClassIn 账号</th>
                            <th>年级</th>
                            <th>报名日期</th>
                            <th>加入第一次课</th>
                            <th>计划结束日期</th>
                            <th>加入状态</th>
                            {canManage && <th>操作</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {students.map((r) => (
                            <tr key={r.enrollment_id || r.student_membership_id}>
                              <td>
                                <b className="break-words text-[0.95rem]">{r.student_name}</b>
                                <small className="break-all">学员编号：{r.student_code}</small>
                                <small className="break-all">报名编号：{r.number || "未登记报名"}</small>
                              </td>
                              <td className="break-all whitespace-normal">{r.guardian_wechat_name || "待补"}</td>
                              <td className="whitespace-normal font-medium leading-6">{r.enrollment_course_name}</td>
                              <td className="break-all whitespace-normal">
                                {r.classin_account || (
                                  <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">待补</span>
                                )}
                              </td>
                              <td>{r.grade || "—"}</td>
                              <td>{r.registered_at}</td>
                              <td>{r.enrollment_start_date || "—"}</td>
                              <td>{r.enrollment_end_date || "—"}</td>
                              <td>
                                {r.roster_exported_at ? (
                                  <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">已同步</Badge>
                                ) : (
                                  <Badge className="bg-[#e5b529] text-[#102f56]">
                                    新加入
                                  </Badge>
                                )}
                              </td>
                              {canManage && (
                                <td>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="whitespace-nowrap text-red-600 hover:bg-red-50 hover:text-red-700"
                                    onClick={() => onRemoveStudent(r)}
                                  >
                                    移出班级
                                  </Button>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="divide-y divide-slate-200 lg:hidden">
                      {students.map((r) => <article key={r.enrollment_id || r.student_membership_id} className="space-y-4 p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="break-words font-semibold text-[#102f56]">{r.student_name}</p><p className="mt-1 break-all text-xs text-slate-500">{r.student_code}</p></div>{r.roster_exported_at?<Badge variant="outline" className="shrink-0 border-blue-200 bg-blue-50 text-blue-700">已同步</Badge>:<Badge className="shrink-0 bg-[#e5b529] text-[#102f56]">新加入</Badge>}</div><dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2 text-sm"><dt className="text-slate-500">报名课程</dt><dd className="break-words font-medium text-[#183858]">{r.enrollment_course_name}</dd><dt className="text-slate-500">报名编号</dt><dd className="break-all text-[#183858]">{r.number || "未登记报名"}</dd><dt className="text-slate-500">家长微信</dt><dd className="break-all text-[#183858]">{r.guardian_wechat_name || "待补"}</dd><dt className="text-slate-500">ClassIn</dt><dd className="break-all text-[#183858]">{r.classin_account || <span className="text-amber-700">待补</span>}</dd><dt className="text-slate-500">年级 / 报名</dt><dd className="text-[#183858]">{r.grade || "—"} · {r.registered_at}</dd><dt className="text-slate-500">第一次课</dt><dd className="text-[#183858]">{r.enrollment_start_date || "—"}</dd><dt className="text-slate-500">计划结束</dt><dd className="text-[#183858]">{r.enrollment_end_date || "—"}</dd></dl>{canManage&&<div className="flex justify-end border-t border-slate-100 pt-3"><Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={()=>onRemoveStudent(r)}>移出班级</Button></div>}</article>)}
                    </div>
                    </>
                  ) : (
                    <div className="grid min-h-32 place-items-center bg-slate-50/70 p-5 text-center"><div><UsersRound className="mx-auto h-6 w-6 text-slate-400"/><p className="mt-2 text-sm text-slate-500">这个班级暂时没有在读学员。</p></div></div>
                  )}
                  {removedStudents.length > 0 && <div className="border-t border-slate-200 bg-slate-50 p-4"><p className="mb-3 text-sm font-semibold text-slate-700">已移除学员 · {removedStudents.length}</p><div className="grid gap-2 md:grid-cols-2">{removedStudents.map((r) => <div key={`removed-${r.membership_id || r.student_membership_id || r.enrollment_id}`} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"><span className="font-medium text-slate-700">{r.student_name}</span><span className="ml-2 text-slate-500">{r.student_code || ""}</span><p className="mt-1 text-xs text-slate-500">家长微信：{r.guardian_wechat_name || "待补"}</p><p className="mt-1 text-xs text-red-700">{String(r.removed_at || "").slice(0, 10)} 被移除</p></div>)}</div></div>}
                </section>
              );
            })}
          </div>
        ) : (
          <Empty
            icon={CalendarDays}
            text={hasFilters ? "没有符合当前条件的在读班级" : "还没有在读班级，先建立课程班级和排课安排"}
          />
        )}
      </Panel>}
      {(data.unassigned ?? []).length > 0 && (
        <Panel
          title={`历史报名待分班 · ${(data.unassigned ?? []).length}`}
          subtitle="升级前已有的在读报名不会丢失，请逐条分配到对应班级。"
        >
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>学员</th>
                  <th>家长微信</th>
                  <th>课程</th>
                  <th>ClassIn账号</th>
                  <th>报名日期</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {(data.unassigned ?? []).map((r: Row) => (
                  <tr key={r.enrollment_id}>
                    <td>
                      <b>{r.student_name}</b>
                      <small>{r.number}</small>
                    </td>
                    <td>{r.guardian_wechat_name || "待补"}</td>
                    <td>{r.course_name}</td>
                    <td>{r.classin_account || "待补"}</td>
                    <td>{r.registered_at}</td>
                    <td>
                      {canManage ? (
                        <Button size="sm" onClick={() => onAssign(r)}>
                          分配班级
                        </Button>
                      ) : (
                        <span className="text-xs text-slate-400">
                          请联系教务
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
      {classStatus !== "active" && (
        <Panel
          title={`已结课班级 · ${completed.length}${hasFilters ? ` / ${completedAll.length}` : ""}`}
          subtitle="已结课班级及完整 ClassIn 名单保留，可按当前筛选条件查看和下载。"
        >
          {completed.length ? <div className="space-y-4">
            {completed.map((group) => {
              const canEditClass = canEditCreatedItem(group);
              return <div key={group.id} className="rounded-xl border bg-slate-50 p-4">
                <Badge className="mb-2 bg-emerald-100 text-emerald-800">已结课</Badge>
                <p className="font-medium">
                  {group.course_name} · {group.name}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {group.teacher_name} · {group.start_date} 至{" "}
                  {group.end_date || "—"}
                </p>
                <p className="mt-1 text-xs text-slate-500">创建者：{group.creator_name || "未知员工"}</p>
                <p className="mt-2 text-sm text-slate-600">ClassIn 班级：{group.classin_class_name || group.name} · 实际结课：{group.end_date || "待补"}</p>
                <div className="table-scroll mt-3 rounded-lg border bg-white">
                  <table><thead><tr><th>学员 / 编号</th><th>家长微信</th><th>ClassIn 账号</th><th>年级</th><th>报名课程</th><th>报名日期</th><th>第一次课</th><th>状态</th></tr></thead><tbody>
                    {roster.filter((row) => row.class_group_id === group.id).map((row) => <tr key={`${group.id}-${row.membership_id || row.student_membership_id || row.enrollment_id}`}><td><b>{row.student_name}</b><small>{row.student_code}</small><small>{row.number || "未登记报名"}</small></td><td>{row.guardian_wechat_name || "待补"}</td><td>{row.classin_account || "待补"}</td><td>{row.grade || "—"}</td><td>{row.enrollment_course_name}</td><td>{row.registered_at || "—"}</td><td>{row.enrollment_start_date || "—"}</td><td>{row.membership_status === "removed" ? <span className="text-red-700">已移除 · {String(row.removed_at || "").slice(0, 10)}</span> : <Badge variant="outline" className="border-emerald-200 text-emerald-800">已结课</Badge>}</td></tr>)}
                  </tbody></table>
                  {!roster.some((row) => row.class_group_id === group.id) && <p className="p-4 text-sm text-slate-500">没有历史学员记录</p>}
                </div>
                <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => onExportClass(group)}><Download className="mr-1 h-4 w-4" />下载本班名单</Button>{canEditClass && <><Button size="sm" variant="outline" onClick={() => onEditClass(group)}>编辑</Button><Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => onDeleteClass(group)}><Trash2 className="mr-1 h-4 w-4" />删除</Button></>}</div>
              </div>;
            })}
          </div> : <Empty icon={CheckCircle2} text="没有符合当前条件的已结课班级" />}
        </Panel>
      )}
    </div>
  );
}
function Enrollments({
  rows,
  period,
  member,
  onNew,
  onAiImport,
  onPayment,
  onFinish,
  onInvoice,
  onRefund,
  onEdit,
  onDelete,
  canEdit,
  canDelete,
}: {
  rows: Row[];
  period: string;
  member: Row;
  onNew: () => void;
  onAiImport: () => void;
  onPayment: (r: Row) => void;
  onFinish: (r: Row) => void;
  onInvoice: (r: Row) => void;
  onRefund: (enrollment: Row, refund?: Row) => void;
  onEdit: (r: Row) => void;
  onDelete: (r: Row) => void;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const canEnroll = [
    "admin",
    "sales",
    "operations",
    "operations_finance",
  ].includes(member.role);
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = useMemo(
    () =>
      rows.slice(
        (currentPage - 1) * PAGE_SIZE,
        currentPage * PAGE_SIZE,
      ),
    [rows, currentPage],
  );
  useEffect(() => {
    const timer = window.setTimeout(() => setPage(1), 0);
    return () => window.clearTimeout(timer);
  }, [rows]);
  return (
    <div className="space-y-5">
      <ConsultantSummary rows={rows} period={period} />
      <Panel
        title={`成单记录 · ${rows.length}`}
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() =>
                exportEnrollments(
                  rows,
                  period ? `课程顾问成单-${period}` : "课程顾问成单",
                )
              }
            >
              <Download className="mr-2 h-4 w-4" />
              导出当前单据
            </Button>
            {canEnroll && (
              <>
                <Button variant="outline" onClick={onAiImport}>
                  <Sparkles className="mr-2 h-4 w-4" />
                  AI 智能录入
                </Button>
                <Button onClick={onNew}>
                  <Plus className="mr-2 h-4 w-4" />
                  手动登记
                </Button>
              </>
            )}
          </div>
        }
      >
        <EnrollmentTable
          rows={pageRows}
          onPayment={onPayment}
          onFinish={onFinish}
          onInvoice={onInvoice}
          onRefund={onRefund}
          onEdit={onEdit}
          onDelete={onDelete}
          canPayment={[
            "admin",
            "finance",
            "sales",
            "operations_finance",
          ].includes(member.role)}
          canFinish={["admin", "sales", "operations", "operations_finance"].includes(
            member.role,
          )}
          canInvoice={[
            "admin",
            "finance",
            "sales",
            "operations_finance",
          ].includes(member.role)}
          canRefund={[
            "admin",
            "finance",
            "sales",
            "operations",
            "operations_finance",
          ].includes(member.role)}
          canEdit={canEdit}
          canDelete={canDelete}
        />
        {rows.length > PAGE_SIZE && (
          <ListPagination
            page={currentPage}
            totalPages={pageCount}
            totalItems={rows.length}
            onPageChange={setPage}
          />
        )}
      </Panel>
    </div>
  );
}
function EnrollmentTable({
  rows,
  compact = false,
  onPayment,
  onFinish,
  onInvoice,
  onRefund,
  onEdit,
  onDelete,
  canPayment = false,
  canFinish = false,
  canInvoice = false,
  canRefund = false,
  canEdit = false,
  canDelete = false,
}: {
  rows: Row[];
  compact?: boolean;
  onPayment?: (r: Row) => void;
  onFinish?: (r: Row) => void;
  onInvoice?: (r: Row) => void;
  onRefund?: (enrollment: Row, refund?: Row) => void;
  onEdit?: (r: Row) => void;
  onDelete?: (r: Row) => void;
  canPayment?: boolean;
  canFinish?: boolean;
  canInvoice?: boolean;
  canRefund?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
}) {
  if (!rows.length) return <Empty icon={GraduationCap} text="暂无报名记录" />;
  const canOpenEditor = canEdit || typeof onEdit === "function";
  return (
    <div className="table-scroll">
      <table className={compact ? "" : "enrollment-table"}>
        {!compact && (
          <colgroup>
            <col className="w-[180px]" />
            <col className="w-[160px]" />
            <col className="w-[210px]" />
            <col className="w-[135px]" />
            <col className="w-[155px]" />
            <col className="w-[155px]" />
            <col className="w-[140px]" />
            <col className="w-[300px]" />
          </colgroup>
        )}
        <thead>
          <tr>
            <th>学员 / 单号</th>
            <th>家长微信</th>
            <th>课程</th>
            <th>类型 / 日期</th>
            <th>原价 / 实收</th>
            {!compact && (
              <>
                <th>课程顾问 / 渠道</th>
                <th>结课</th>
                <th>操作</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const refunds = parseScreenshotFiles(r.refunds_json);
            const uploadedScreenshots = parseScreenshotFiles(
              r.registration_screenshots_json,
            );
            const screenshotFiles = r.registration_screenshot_key
              ? [
                  {
                    id: "legacy",
                    name: r.registration_screenshot_name || "付款截图",
                  },
                  ...uploadedScreenshots,
                ]
              : uploadedScreenshots;
            return (
            <tr key={r.id}>
              <td className="break-words">
                {canOpenEditor ? (
                  <button
                    type="button"
                    className="text-left font-bold text-[#0f5797] underline decoration-blue-300 decoration-2 underline-offset-4 transition hover:text-[#083d70] hover:decoration-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    onClick={() => onEdit?.(r)}
                    aria-label={`编辑 ${r.student_name} 的报名记录`}
                  >
                    {r.student_name}
                  </button>
                ) : (
                  <b>{r.student_name}</b>
                )}
                <small className="font-mono">{r.number}</small>
                {canOpenEditor && (
                  <button
                    type="button"
                    className="mt-2 inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-semibold text-[#0f5797] hover:border-blue-400 hover:bg-blue-100"
                    onClick={() => onEdit?.(r)}
                  >
                    <Paperclip className="h-3.5 w-3.5" />
                    编辑报名 / 上传截图
                  </button>
                )}
              </td>
              <td className="break-all">{r.guardian_wechat_name || "待补"}</td>
              <td className="break-words">
                {r.course_name}
                <small>课节数 {r.quantity}</small>
              </td>
              <td className="whitespace-nowrap">
                <Badge variant="secondary">
                  {registrationName(r.registration_type)}
                </Badge>
                <small>{r.registered_at}</small>
              </td>
              <td className="whitespace-nowrap text-right tabular-nums">
                <b>{money(r.list_amount_cents, r.currency)}</b>
                <small>已收 {money(r.paid_cents, r.currency)}</small>
                {Number(r.refunded_cents || 0) > 0 && (
                  <small className="text-red-600">
                    已退 {money(r.refunded_cents, r.currency)} · 净收{" "}
                    {money(Math.max(0, Number(r.paid_cents || 0) - Number(r.refunded_cents || 0)), r.currency)}
                  </small>
                )}
              </td>
              {!compact && (
                <>
                  <td className="break-words">
                    {r.salesperson_name || "—"}
                    <small>{r.agent_name || "无渠道"}</small>
                  </td>
                  <td className="whitespace-nowrap">
                    {r.actual_end_date || r.expected_end_date || "待补"}
                    <small>
                      <Status value={r.status} />
                    </small>
                  </td>
                  <td>
                    <div className="grid grid-cols-2 gap-2 [&_button]:w-full [&_button]:whitespace-nowrap [&_a]:w-full [&_a]:justify-center">
                      {screenshotFiles.map((file: Row, index: number) => (
                        <Button key={file.id} size="sm" variant="outline" asChild>
                          <a
                            href={`/api/enrollment/${r.id}/screenshot${file.id === "legacy" ? "" : `?fileId=${encodeURIComponent(file.id)}`}`}
                            target="_blank"
                            rel="noreferrer"
                            title={file.name}
                          >
                            <Paperclip className="mr-1 h-4 w-4" />
                            付款截图 {index + 1}
                          </a>
                        </Button>
                      ))}
                      {canPayment && r.status === "active" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onPayment?.(r)}
                        >
                          收款
                        </Button>
                      )}
                      {canInvoice && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onInvoice?.(r)}
                        >
                          生成发票
                        </Button>
                      )}
                      {canRefund && Number(r.paid_cents || 0) > 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onRefund?.(r)}
                        >
                          申请退费
                        </Button>
                      )}
                      {refunds.map((refund: Row) => (
                        <Button
                          key={refund.id}
                          size="sm"
                          variant="ghost"
                          className={refund.status === "confirmed" ? "text-red-700" : "text-amber-700"}
                          onClick={() => onRefund?.(r, refund)}
                        >
                          {refund.status === "confirmed" ? "已退" : refund.status === "cancelled" ? "已撤销" : "退费待确认"}{" "}
                          {money(refund.amount_cents, refund.currency)}
                        </Button>
                      ))}
                      {canFinish && r.status === "active" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onFinish?.(r)}
                        >
                          登记结课
                        </Button>
                      )}
                      {canOpenEditor && (
                        <Button size="sm" variant="ghost" onClick={() => onEdit?.(r)}>
                          编辑报名 / 截图
                        </Button>
                      )}
                      {canDelete && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-600 hover:bg-red-50 hover:text-red-700"
                          onClick={() => onDelete?.(r)}
                        >
                          <Trash2 className="mr-1 h-4 w-4" />
                          删除
                        </Button>
                      )}
                    </div>
                  </td>
                </>
              )}
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
function Payments({
  rows,
  onInvoice,
}: {
  rows: Row[];
  onInvoice: (r: Row) => void;
}) {
  return (
    <div className="space-y-5">
      <PaymentSummary rows={rows} />
      <Panel
        title={`收款记录 · ${rows.length}`}
        subtitle="汇总仅计入已确认的实际到账；下方保留当前筛选范围内的全部记录。"
      >
        {rows.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>到账日期</th>
                  <th>学员 / 课程</th>
                  <th>家长微信</th>
                  <th>类型</th>
                  <th>课程顾问 / 渠道</th>
                  <th>金额</th>
                  <th>方式</th>
                  <th>交易编号</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.paid_at}</td>
                    <td>
                      <b>{r.student_name}</b>
                      <small>
                        {r.course_name} · {r.enrollment_number}
                      </small>
                    </td>
                    <td className="break-all">{r.guardian_wechat_name || "待补"}</td>
                    <td>
                      <Badge variant="secondary">
                        {registrationName(r.registration_type)}
                      </Badge>
                    </td>
                    <td>
                      {r.salesperson_name || "未分配"}
                      <small>{r.agent_name || "自然到访"}</small>
                    </td>
                    <td className="whitespace-nowrap text-right font-semibold tabular-nums">{money(r.amount_cents, r.currency)}</td>
                    <td>{r.method}</td>
                    <td>{r.reference || "—"}</td>
                    <td>
                      <Status value={r.status} />
                    </td>
                    <td>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onInvoice(r)}
                      >
                        生成发票
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon={WalletCards} text="暂无收款记录" />
        )}
      </Panel>
    </div>
  );
}
function Followups({
  rows,
  due,
  onOpenProfile,
}: {
  rows: Row[];
  due: Row[];
  onOpenProfile: (student: Row) => void;
}) {
  return (
    <div className="space-y-5">
      <Panel
        title={`课程顾问跟进记录 · ${rows.length}`}
        action={
          <Button variant="outline" onClick={() => exportFollowups(rows)}>
            <Download className="mr-2 h-4 w-4" />
            导出跟进
          </Button>
        }
      >
        {rows.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>跟进日期</th>
                  <th>学员</th>
                  <th>家长微信</th>
                  <th>方式</th>
                  <th>跟进内容</th>
                  <th>课程顾问</th>
                  <th>下次跟进</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.followed_at}</td>
                    <td>
                      <b>{r.student_name}</b>
                      <small>
                        {r.student_code} · {r.grade}
                      </small>
                    </td>
                    <td className="break-all">{r.guardian_wechat_name || "待补"}</td>
                    <td>{r.method}</td>
                    <td className="max-w-md whitespace-normal">{r.note}</td>
                    <td>{r.salesperson_name || "—"}</td>
                    <td>{r.next_follow_up_at || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon={BookOpenCheck} text="还没有客户跟进记录" />
        )}
      </Panel>
      <Panel title={`未来30天预计结课 · ${due.length}`}>
        {due.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {due.map((r) => (
              <button
                type="button"
                key={r.id}
                onClick={() => onOpenProfile({ id: r.student_id })}
                className="group flex items-center justify-between gap-3 rounded-xl border bg-white p-4 text-left transition hover:border-blue-300 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#174f87] focus-visible:ring-offset-2"
                aria-label={`查看 ${r.student_name} 的学员档案`}
              >
                <div className="min-w-0">
                  <p className="font-semibold text-[#102f56] group-hover:text-[#174f87]">{r.student_name}</p>
                  <p className="mt-1 text-sm text-slate-500">家长微信：{r.guardian_wechat_name || "待补"}</p>
                  <p className="mt-1 text-sm text-slate-500">{r.course_name}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <Badge variant="secondary">{r.expected_end_date}</Badge>
                  <span className="text-xs font-medium text-[#174f87]">查看档案</span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <Empty icon={BookOpenCheck} text="暂无即将结课的课程" />
        )}
      </Panel>
    </div>
  );
}
function Agents({
  rows,
  onNew,
  member,
  month,
  setMonth,
  onStatement,
}: {
  rows: Row[];
  onNew: () => void;
  member: Row;
  month: string;
  setMonth: (value: string) => void;
  onStatement: (agentId: string, period: string) => void;
}) {
  const canSettle = ["admin", "finance", "operations_finance"].includes(
    member.role,
  );
  return (
    <Panel
      title={`渠道档案 · ${rows.length}`}
      subtitle="渠道是客户来源，可设置佣金；SGD 与 CNY 佣金会合并到同一张结算单，并按结算日最新汇率统一折算成人民币。"
      action={
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="w-40"
          />
          <Button onClick={onNew}>
            <Plus className="mr-2 h-4 w-4" />
            新增渠道
          </Button>
        </div>
      }
    >
      {rows.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>渠道</th>
                <th>联系方式</th>
                <th>佣金规则</th>
                <th>待结佣金</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <b>{r.name}</b>
                  </td>
                  <td>{r.contact || "—"}</td>
                  <td>
                    {r.commission_type === "percent"
                      ? `${r.commission_value / 100}%`
                      : money(r.commission_value)}
                  </td>
                  <td className="whitespace-nowrap text-right font-semibold tabular-nums">{formatCommissionTotals(r.pending_commission_by_currency)}</td>
                  <td>
                    <Status value={r.active ? "active" : "disabled"} />
                  </td>
                  <td>
                    {canSettle ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onStatement(r.id, month)}
                      >
                        生成人民币结算单
                      </Button>
                    ) : (
                      <span className="text-xs text-slate-400">
                        仅管理员、财务或教务运营财务可结算
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty icon={ReceiptText} text="还没有渠道档案" />
      )}
    </Panel>
  );
}
function Invoices({ rows }: { rows: Row[] }) {
  return (
    <Panel title={`发票记录 · ${rows.length}`}>
      {rows.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>编号</th>
                <th>对象</th>
                <th>家长微信</th>
                <th>课程 / 期间</th>
                <th>金额</th>
                <th>日期</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <b>{r.number}</b>
                    <small>
                      {r.type === "customer" ? "客户发票" : "渠道代理发票"}
                    </small>
                  </td>
                  <td>{r.student_name || r.agent_name || "—"}</td>
                  <td>{r.student_name ? r.guardian_wechat_name || "待补" : "—"}</td>
                  <td>{r.course_name || r.period || "—"}</td>
                  <td className="whitespace-nowrap text-right font-semibold tabular-nums">{money(r.total_cents, r.currency)}</td>
                  <td>{String(r.created_at).slice(0, 10)}</td>
                  <td>
                    <a
                      className="text-sm font-medium text-[#174f87] hover:underline"
                      href={`/invoice/${r.id}`}
                      target="_blank"
                    >
                      查看 / 下载 Word 或 PDF
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty icon={FileText} text="暂无发票记录" />
      )}
    </Panel>
  );
}
function AuditLogs({ rows }: { rows: Row[] }) {
  return (
    <Panel
      title={`操作日志 · ${rows.length}`}
      subtitle="仅系统管理员可查看。日志按时间倒序保存操作人、动作、对象与变更内容。"
    >
      {rows.length ? (
        <div className="table-scroll">
          <table className="audit-table">
            <thead><tr><th>时间</th><th>操作人</th><th>动作</th><th>对象</th><th>变更内容</th></tr></thead>
            <tbody>
              {rows.map((row) => {
                const detail = parseAuditDetail(row.detail_json);
                return (
                  <tr key={row.id}>
                    <td className="whitespace-nowrap">{formatAuditTime(row.created_at)}</td>
                    <td><b>{row.actor_name}</b><small>{row.actor_email || row.user_id}</small></td>
                    <td><Badge variant="secondary">{auditActionName(row.action)}</Badge></td>
                    <td><b>{auditEntityName(row.entity_type)}</b><small>{detail.label || row.entity_id}</small></td>
                    <td className="max-w-xl whitespace-normal text-sm text-slate-600">{auditDetailText(detail)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty icon={History} text="暂无操作日志" />
      )}
    </Panel>
  );
}
function SettingsView({
  data,
  member,
  onAgent,
  onMember,
  transferMember,
  updateMember,
  deleteMember,
}: {
  data: Row;
  member: Row;
  onAgent: () => void;
  onMember: () => void;
  transferMember: (row: Row) => void;
  updateMember: (id: string, role: string, status: string) => void;
  deleteMember: (row: Row) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <Panel
          title="员工账号与权限"
          subtitle="员工离职时可把全部负责客户交给另一位员工，再删除原账号；历史业务记录不会被改写。"
          action={
            member.role === "admin" ? (
              <Button onClick={onMember} size="sm">
                <UserPlus className="mr-2 h-4 w-4" />
                添加员工
              </Button>
            ) : undefined
          }
        >
          {member.role === "admin" && (data.team ?? []).length ? (
            <div className="space-y-3">
              {data.team.map((r: Row) => {
                const awaiting = String(r.user_id).startsWith("invite:"),
                  isSelf = r.id === member.id,
                  customerCount = Number(r.customer_count || 0);
                return (
                  <div
                    key={r.id}
                    className="grid gap-3 rounded-xl border p-3 lg:grid-cols-[minmax(190px,1fr)_165px_120px_auto] lg:items-center"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{r.display_name}</p>
                        <Badge
                          variant={
                            r.status === "disabled"
                              ? "destructive"
                              : "secondary"
                          }
                        >
                          {memberStatusName(r.status)}
                        </Badge>
                        <Badge variant="outline">{customerCount} 位客户</Badge>
                        {isSelf && <Badge variant="outline">当前账号</Badge>}
                      </div>
                      <p className="mt-1 text-sm text-slate-500">{r.email}</p>
                    </div>
                    <select
                      aria-label={`${r.display_name}的角色`}
                      className="h-10 rounded-lg border bg-white px-2 text-sm"
                      value={r.role}
                      onChange={(e) =>
                        updateMember(r.id, e.target.value, r.status)
                      }
                    >
                      {[
                        "admin",
                        "finance",
                        "sales",
                        "operations",
                        "operations_finance",
                        "pending",
                      ].map((role) => (
                        <option key={role} value={role}>
                          {roleName(role)}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label={`${r.display_name}的账号状态`}
                      className="h-10 rounded-lg border bg-white px-2 text-sm"
                      value={r.status}
                      onChange={(e) =>
                        updateMember(r.id, r.role, e.target.value)
                      }
                    >
                      {awaiting ? (
                        <option value="invited">待首次登录</option>
                      ) : (
                        <option value="active">启用</option>
                      )}
                      <option value="disabled">停用</option>
                    </select>
                    <div className="flex flex-wrap justify-end gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!customerCount}
                        onClick={() => transferMember(r)}
                      >
                        <ArrowRightLeft className="mr-1 h-4 w-4" />
                        交接
                      </Button>
                      {isSelf ? (
                        <span className="px-2 py-2 text-center text-xs text-slate-400">
                          不可删除自己
                        </span>
                      ) : customerCount ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-[#174f87]"
                          onClick={() => transferMember(r)}
                        >
                          交接后删除
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-600 hover:bg-red-50 hover:text-red-700"
                          onClick={() => deleteMember(r)}
                        >
                          <Trash2 className="mr-1 h-4 w-4" />
                          删除
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              只有系统管理员可以查看员工账号并分配角色。
            </p>
          )}
          {member.role === "admin" && (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-3">
              <p className="text-xs leading-5 text-slate-600">
                客户交接只改变当前负责人；原员工的历史报名、收款、业绩和跟进记录继续保留。仍有客户的账号必须先交接才能删除。
              </p>
              <Button variant="outline" onClick={onAgent}>
                管理渠道
              </Button>
            </div>
          )}
        </Panel>
      </div>
      <Panel
        title="员工职责与权限范围"
        subtitle="课程顾问属于内部员工；渠道属于外部客户来源，两者分开管理。"
      >
        <div className="grid gap-3 lg:grid-cols-2">
          {[
            "admin",
            "sales",
            "finance",
            "operations",
            "operations_finance",
            "pending",
          ].map((role) => {
            const detail = roleDetails[role];
            return (
              <div key={role} className="rounded-xl border bg-slate-50/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">{detail.title}</p>
                  <Badge variant="secondary">{roleName(role)}</Badge>
                </div>
                <p className="mt-3 text-sm text-slate-700">{detail.duty}</p>
                <p className="mt-2 text-xs leading-5 text-slate-500">
                  {detail.scope}
                </p>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

function StudentForm({
  catalog,
  member,
  saving,
  onAi,
  onSubmit,
}: {
  catalog: Row;
  member: Row;
  saving: boolean;
  onAi: () => void;
  onSubmit: React.FormEventHandler<HTMLFormElement>;
}) {
  const activeOwners = (catalog.team ?? []).filter(
    (r: Row) =>
      ["admin", "sales", "operations", "operations_finance"].includes(
        r.role,
      ) && r.status === "active",
  );
  const isOperations = ["operations", "operations_finance"].includes(
    member.role,
  );
  const adviserOptions = isOperations
    ? activeOwners.filter((r: Row) => ["admin", "sales"].includes(r.role))
    : activeOwners;
  const ownerOptions = adviserOptions.length ? adviserOptions : activeOwners;
  return (
    <form onSubmit={onSubmit}>
      <DialogHeader>
        <DialogTitle>新建学员档案</DialogTitle>
        <DialogDescription>
          可以让 AI 从文字、截图、照片或 Excel 中识别，也可以继续手动填写。
        </DialogDescription>
      </DialogHeader>
      <div className="mt-5 flex flex-col gap-4 rounded-2xl border border-blue-200 bg-blue-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="flex items-center gap-2 font-semibold text-[#174f87]">
            <Sparkles className="h-5 w-5" />
            AI 智能登记
          </p>
          <p className="mt-1 text-sm text-slate-600">
            上传图片或 Excel，或粘贴一段学员信息；识别后先核对，再写入数据库。
          </p>
        </div>
        <Button type="button" onClick={onAi} className="shrink-0">
          <Upload className="mr-2 h-4 w-4" />
          上传或粘贴识别
        </Button>
      </div>
      <div className="my-5 flex items-center gap-3 text-xs text-slate-400">
        <span className="h-px flex-1 bg-slate-200" />
        <span>或手动填写</span>
        <span className="h-px flex-1 bg-slate-200" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="孩子姓名 *">
          <Input name="fullName" required />
        </Field>
        <Field label="英文名">
          <Input name="englishName" />
        </Field>
        <Field label="学校">
          <Input name="school" />
        </Field>
        <Field label="年级 *">
          <Input name="grade" required />
        </Field>
        <Field label="ClassIn 账号">
          <Input name="classinAccount" />
        </Field>
        <Field label="首次登记日期 *">
          <Input
            name="firstRegisteredAt"
            type="date"
            defaultValue={today()}
            required
          />
        </Field>
        <Field label="首次来源渠道">
          <select name="sourceAgentId" className="h-10 w-full rounded-lg border bg-white px-3 text-sm">
            <option value="">无渠道 / 自然到访</option>
            <option value="__parent_referral__">家长转介绍</option>
            {(catalog.agents ?? []).map((r: Row) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </Field>
        <Field label="转介绍家长微信（选填）"><Input name="referralParentWechat" placeholder="仅家长转介绍时填写" /></Field>
        <Field label="家长微信名 *">
          <Input name="guardianWechatName" required />
        </Field>
        {ownerOptions.length ? (
          <Field label="课程顾问 *">
            <select
              name="salespersonUserId"
              defaultValue={isOperations ? "" : member.userId}
              required
              className="h-10 w-full rounded-lg border bg-white px-3 text-sm"
            >
              {isOperations && (
                <option value="" disabled>
                  请选择负责该学员的课程顾问
                </option>
              )}
              {ownerOptions.map((r: Row) => (
                  <option key={r.user_id} value={r.user_id}>
                    {r.display_name}
                    {r.user_id === member.userId ? "（登记人）" : ""}
                  </option>
                ))}
            </select>
            <p className="text-xs text-slate-500">
              {isOperations
                ? "教务可代课程顾问建档；保存后，该学员会归所选课程顾问负责。"
                : "默认是当前登记人，也可以选择其他课程顾问。"}
            </p>
          </Field>
        ) : null}
        <div className="sm:col-span-2">
          <Field label="备注">
            <Textarea name="notes" rows={3} />
          </Field>
        </div>
      </div>
      <Submit saving={saving} label="保存学员" />
    </form>
  );
}
function StudentEditForm({
  student,
  catalog,
  member,
  saving,
  onSubmit,
}: {
  student: Row;
  catalog: Row;
  member: Row;
  saving: boolean;
  onSubmit: React.FormEventHandler<HTMLFormElement>;
}) {
  return (
    <form onSubmit={onSubmit}>
      <DialogHeader>
        <DialogTitle>完善学员档案</DialogTitle>
        <DialogDescription>
          {student.code} · 补齐必填资料或更新课程顾问和渠道来源。
        </DialogDescription>
      </DialogHeader>
      <input type="hidden" name="id" value={student.id} />
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="孩子姓名 *">
          <Input name="fullName" defaultValue={student.full_name} required />
        </Field>
        <Field label="英文名">
          <Input name="englishName" defaultValue={student.english_name} />
        </Field>
        <Field label="学校">
          <Input name="school" defaultValue={student.school} />
        </Field>
        <Field label="年级 *">
          <Input name="grade" defaultValue={student.grade} required />
        </Field>
        <Field label="ClassIn 账号">
          <Input name="classinAccount" defaultValue={student.classin_account} />
        </Field>
        <Field label="首次登记日期 *">
          <Input
            name="firstRegisteredAt"
            type="date"
            defaultValue={student.first_registered_at || today()}
            required
          />
        </Field>
        <Field label="渠道来源">
          <select
            name="sourceAgentId"
            defaultValue={student.source_kind === "parent_referral" ? "__parent_referral__" : student.source_agent_id ?? ""}
            className="h-10 w-full rounded-lg border bg-white px-3 text-sm"
          >
            <option value="">无渠道 / 自然到访</option>
            <option value="__parent_referral__">家长转介绍</option>
            {(catalog.agents ?? []).map((r: Row) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-slate-500">
            可选择已建立的渠道；不选择则显示为自然到访。
          </p>
        </Field>
        <Field label="转介绍家长微信（选填）"><Input name="referralParentWechat" defaultValue={student.referral_parent_wechat} placeholder="仅家长转介绍时填写" /></Field>
        <Field label="家长微信名 *">
          <Input
            name="guardianWechatName"
            defaultValue={student.guardian_wechat_name}
            required
          />
        </Field>
        {(catalog.team ?? []).length ? (
          <Field label="课程顾问 *">
            <select
              name="salespersonUserId"
              defaultValue={student.owner_user_id ?? member.userId}
              required
              className="h-10 w-full rounded-lg border bg-white px-3 text-sm"
            >
              {catalog.team
                .filter(
                  (r: Row) =>
                    [
                      "admin",
                      "sales",
                      "operations",
                      "operations_finance",
                    ].includes(r.role) && r.status === "active",
                )
                .map((r: Row) => (
                  <option key={r.user_id} value={r.user_id}>
                    {r.display_name}
                  </option>
                ))}
            </select>
          </Field>
        ) : null}
        <div className="sm:col-span-2">
          <Field label="备注">
            <Textarea name="notes" rows={3} defaultValue={student.notes} />
          </Field>
        </div>
      </div>
      <Submit saving={saving} label="保存修改" />
    </form>
  );
}
function EnrollmentEndDateField({ classEndDate, customEndDate, firstLessonDate, hasClass, onChange }: {
  classEndDate: string;
  customEndDate: string;
  firstLessonDate: string;
  hasClass: boolean;
  onChange: (value: string) => void;
}) {
  return <Field label="结束日期（默认随班，选填）">
    <input type="hidden" name="expectedEndDateMode" value={customEndDate ? "custom" : "class"} />
    <Input name="expectedEndDate" type="date" className="cursor-pointer" min={firstLessonDate || undefined} value={customEndDate || classEndDate} onChange={(event) => onChange(event.target.value)} />
    <p className="text-xs leading-5 text-slate-500">
      {customEndDate
        ? "已按孩子最后一次课日期安排。"
        : classEndDate
          ? `默认使用所选班级结课日期 ${classEndDate}，无需另外填写。`
          : hasClass ? "所选班级尚未设置结课日期，可先留空或填写孩子最后一次课日期。" : "选择班级后自动使用班级结课日期。"}
      {" "}只加入几节课时，可改为孩子最后一次课的日期。
    </p>
    {customEndDate && <Button type="button" size="sm" variant="outline" onClick={() => onChange("")}>恢复默认随班日期</Button>}
  </Field>;
}

function EnrollmentForm({
  catalog,
  saving,
  onSubmit,
}: {
  catalog: Row;
  saving: boolean;
  onSubmit: React.FormEventHandler<HTMLFormElement>;
}) {
  const studentOptions = (catalog.students ?? []).map((r: Row) => ({
    value: String(r.id),
    label: `${r.full_name} · ${r.code}`,
    keywords: [
      r.english_name,
      r.classin_account,
      r.guardian_name,
      r.guardian_wechat_name,
      r.guardian_phone,
      r.owner_name,
    ]
      .filter(Boolean)
      .join(" "),
  }));
  const courseOptions = (catalog.courses ?? []).map((r: Row) => ({
    value: String(r.id),
    label: String(r.name),
    keywords: [r.category, r.currency, r.unit_label]
      .filter(Boolean)
      .join(" "),
  }));
  const [courseId, setCourseId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [classGroupId, setClassGroupId] = useState("");
  const [firstLessonDate, setFirstLessonDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const selectedClassEndDate = String((catalog.classes ?? []).find((group: Row) => String(group.id) === classGroupId)?.end_date || "");
  const [currency, setCurrency] = useState("SGD");
  const [listAmount, setListAmount] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [screenshotPreviews, setScreenshotPreviews] = useState<
    Array<{ name: string; type: string; size: number; url: string }>
  >([]);
  const classOptions = useMemo(
    () =>
      (catalog.classes ?? [])
        .filter((r: Row) => String(r.course_id) === courseId)
        .map((r: Row) => ({
          value: String(r.id),
          label: `${r.name}${r.classin_class_name ? ` · ClassIn：${r.classin_class_name}` : ""}`,
          keywords: [r.teacher_name, r.start_date, r.class_time]
            .filter(Boolean)
            .join(" "),
        })),
    [catalog.classes, courseId],
  );
  useEffect(
    () => () => {
      screenshotPreviews.forEach((preview) => URL.revokeObjectURL(preview.url));
    },
    [screenshotPreviews],
  );
  return (
    <form onSubmit={onSubmit} noValidate>
      <DialogHeader>
        <DialogTitle>登记报名</DialogTitle>
        <DialogDescription>
          必须先建立学员档案；保存报名即按填写金额确认到账。选择 Active 班级后，学员会直接进入该班级的在读名单。
        </DialogDescription>
      </DialogHeader>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="学员 *">
          <SearchableSelect
            name="studentId"
            options={studentOptions}
            value={studentId}
            onValueChange={setStudentId}
            placeholder="搜索学员姓名、编号或账号"
            empty="未找到学员档案，请先到“学员档案”创建后再报名"
          />
          <p className="text-xs leading-5 text-slate-500">
            搜不到孩子时不能报名，请先建立学员档案。
          </p>
        </Field>
        <Field label="报名课程 *">
          <SearchableSelect
            name="courseId"
            options={courseOptions}
            value={courseId}
            onValueChange={(value) => {
              setCourseId(value);
              setClassGroupId("");
              setCustomEndDate("");
              const course = (catalog.courses ?? []).find(
                (item: Row) => String(item.id) === value,
              );
              setCurrency(String(course?.currency || "SGD"));
              setListAmount(
                course
                  ? (Number(course.standard_price_cents || 0) / 100).toFixed(2)
                  : "",
              );
              setPaymentAmount(
                course
                  ? (Number(course.standard_price_cents || 0) / 100).toFixed(2)
                  : "",
              );
            }}
            placeholder="搜索全部已创建课程"
            empty="没有找到匹配的课程"
          />
          <p className="text-xs leading-5 text-slate-500">
            共 {courseOptions.length} 门可报名课程，新建课程会立即显示。
          </p>
        </Field>
        <Field label="加入第一次课日期 *">
          <Input
            name="firstLessonDate"
            type="date"
            value={firstLessonDate}
            onChange={(event) => setFirstLessonDate(event.target.value)}
            required
          />
          <p className="text-xs leading-5 text-slate-500">
            表示该学员实际从哪一次课开始加入，班级名单会同步显示。
          </p>
        </Field>
        <EnrollmentEndDateField classEndDate={selectedClassEndDate} customEndDate={customEndDate} firstLessonDate={firstLessonDate} hasClass={Boolean(classGroupId)} onChange={setCustomEndDate} />
        <div className="sm:col-span-2">
          <Field label="加入 Active 班级（选填）">
            <SearchableSelect
              name="classGroupId"
              options={classOptions}
              value={classGroupId}
              onValueChange={(value) => { setClassGroupId(value); setCustomEndDate(""); }}
              placeholder={courseId ? "搜索该课程的在读班级" : "请先选择报名课程"}
              empty={courseId ? "该课程暂时没有在读班级，可先保存报名后再分班" : "请先选择报名课程"}
              disabled={!courseId}
            />
            <p className="text-xs leading-5 text-slate-500">
              已找到 {classOptions.length} 个 Active 班级；只显示所选课程仍在读的班级，保存报名后会自动加入。
            </p>
          </Field>
        </div>
        <Field label="报名类型 *">
          <select
            name="registrationType"
            className="h-10 w-full rounded-lg border bg-white px-3 text-sm"
            required
          >
            <option value="new">新报</option>
            <option value="renewal">续报</option>
          </select>
        </Field>
        <Field label="币种 *">
          <select
            name="currency"
            value={currency}
            onChange={(event) => setCurrency(event.target.value)}
            className="h-10 w-full rounded-lg border bg-white px-3 text-sm"
            required
          >
            <option value="SGD">新币 SGD</option>
            <option value="CNY">人民币 CNY</option>
          </select>
        </Field>
        <Field label="课节数">
          <Input
            name="quantity"
            type="number"
            min="1"
            defaultValue="1"
            required
          />
        </Field>
        <Field label="课程原价 *">
          <Input
            name="listAmount"
            type="number"
            min="0"
            step="0.01"
            value={listAmount}
            onChange={(event) => setListAmount(event.target.value)}
            required
          />
          {courseId && (
            <p className="text-xs leading-5 text-slate-500">
              已自动带入课程设置中的原价，如本次价格不同可直接修改。
            </p>
          )}
        </Field>
        <Field label="实际收款金额 *">
          <Input
            name="paymentAmount"
            type="number"
            min="0.01"
            step="0.01"
            max={listAmount || undefined}
            value={paymentAmount}
            onChange={(event) => setPaymentAmount(event.target.value)}
            required
          />
          <p className="text-xs leading-5 text-slate-500">
            必须填写客户本次实际到账金额；如有优惠，请填写优惠后的实收金额。
          </p>
        </Field>
        <div className="sm:col-span-2 flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-medium">保存后自动确认实际收款</p>
            <p className="mt-1 leading-6 text-emerald-800">
              系统将按上方填写的实际收款金额生成已确认记录，无需再次到收款管理中登记。
            </p>
          </div>
        </div>
        <Field label="到账日期">
          <Input name="paidAt" type="date" defaultValue={today()} />
        </Field>
        <Field label="付款方式">
          <select
            name="paymentMethod"
            className="h-10 w-full rounded-lg border bg-white px-3 text-sm"
          >
            <option>银行转账</option>
            <option>PayNow</option>
            <option>微信支付</option>
            <option>支付宝</option>
            <option>微店</option>
            <option>现金</option>
            <option>信用卡</option>
            <option>其他</option>
          </select>
        </Field>
        <Field label="交易编号">
          <Input name="paymentReference" />
        </Field>
        <div className="sm:col-span-2">
          <Field label="付款截图（选填，最多 5 张）">
            <label className="block rounded-xl border border-dashed border-blue-200 bg-blue-50/60 p-4">
              <span className="flex items-center gap-2 text-sm font-medium text-[#174f87]">
                <Paperclip className="h-4 w-4" />
                上传客户付款截图
              </span>
              <input
                className="mt-3 block max-w-full text-sm"
                type="file"
                name="registrationScreenshots"
                multiple
                accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
                onChange={(event) => {
                  const files = Array.from(event.currentTarget.files ?? []);
                  if (files.length > 5) {
                    event.currentTarget.value = "";
                    event.currentTarget.setCustomValidity(
                      "付款截图最多选择 5 张，请重新选择",
                    );
                    event.currentTarget.reportValidity();
                    setScreenshotPreviews([]);
                    return;
                  }
                  event.currentTarget.setCustomValidity("");
                  setScreenshotPreviews(
                    files.map((file) => ({
                      name: file.name,
                      type: file.type,
                      size: file.size,
                      url: URL.createObjectURL(file),
                    })),
                  );
                }}
              />
              <span className="mt-2 block text-xs text-slate-500">
                支持 JPG、PNG、WEBP 或 PDF；每张最大 10MB。提交前可点击预览，提交后课程顾问可在报名记录中查看。
              </span>
            </label>
            {screenshotPreviews.length > 0 && (
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {screenshotPreviews.map((preview, index) => (
                  <a
                    key={`${preview.name}-${index}`}
                    href={preview.url}
                    target="_blank"
                    rel="noreferrer"
                    className="group overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:border-blue-300 hover:shadow-md"
                    title={`点击查看：${preview.name}`}
                  >
                    {preview.type.startsWith("image/") ? (
                      <Image
                        src={preview.url}
                        alt={`付款截图 ${index + 1}`}
                        width={240}
                        height={150}
                        unoptimized
                        className="h-24 w-full object-cover"
                      />
                    ) : (
                      <div className="grid h-24 place-items-center bg-red-50 text-red-700">
                        <FileText className="h-8 w-8" />
                      </div>
                    )}
                    <div className="p-2">
                      <p className="truncate text-xs font-medium text-slate-700">
                        {index + 1}. {preview.name}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-500">
                        {(preview.size / 1024 / 1024).toFixed(2)} MB · 点击查看
                      </p>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </Field>
        </div>
        <div className="sm:col-span-2">
          <Field label="备注">
            <Textarea name="notes" rows={3} />
          </Field>
        </div>
      </div>
      {!(catalog.students ?? []).length && (
        <p className="mt-4 text-sm text-amber-700">请先建立学员档案。</p>
      )}
      <Submit
        saving={saving}
        label="确认报名并记录已收款"
        disabled={
          !(catalog.students ?? []).length ||
          !(catalog.courses ?? []).length
        }
      />
    </form>
  );
}
function EnrollmentEditForm({
  enrollment,
  courses,
  classes,
  saving,
  onSubmit,
}: {
  enrollment: Row;
  courses: Row[];
  classes: Row[];
  saving: boolean;
  onSubmit: React.FormEventHandler<HTMLFormElement>;
}) {
  const [courseId, setCourseId] = useState(String(enrollment.course_id || ""));
  const [classGroupId, setClassGroupId] = useState(String(enrollment.class_group_id || ""));
  const [firstLessonDate, setFirstLessonDate] = useState(String(enrollment.start_date || ""));
  const selectedClassEndDate = String(classes.find((group) => String(group.id) === classGroupId)?.end_date || (classGroupId === String(enrollment.class_group_id || "") ? enrollment.class_group_end_date : "") || "");
  const [customEndDate, setCustomEndDate] = useState(() => {
    const saved = String(enrollment.expected_end_date || "");
    return saved && saved !== selectedClassEndDate ? saved : "";
  });
  const existingScreenshots = [
    ...(enrollment.registration_screenshot_key
      ? [{ id: "legacy", name: enrollment.registration_screenshot_name || "付款截图" }]
      : []),
    ...parseScreenshotFiles(enrollment.registration_screenshots_json),
  ];
  const [keptScreenshotIds, setKeptScreenshotIds] = useState(
    () => new Set(existingScreenshots.map((file: Row) => String(file.id))),
  );
  const [newScreenshots, setNewScreenshots] = useState<File[]>([]);
  const classOptions = classes.filter((row) => String(row.course_id) === courseId);
  const currentClassMissing = Boolean(
    enrollment.class_group_id &&
      courseId === String(enrollment.course_id) &&
      !classOptions.some((row) => String(row.id) === String(enrollment.class_group_id)),
  );
  const keptCount = keptScreenshotIds.size;
  return (
    <form onSubmit={onSubmit} encType="multipart/form-data">
      <DialogHeader>
        <DialogTitle>编辑报名记录</DialogTitle>
        <DialogDescription>
          {enrollment.student_name} · 家长微信 {enrollment.guardian_wechat_name || "待补"} · {enrollment.number}。所有修改及付款截图变更都会写入操作日志。
        </DialogDescription>
      </DialogHeader>
      <input type="hidden" name="id" value={enrollment.id} />
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="报名课程 *">
          <select name="courseId" value={courseId} onChange={(event) => { setCourseId(event.target.value); setClassGroupId(""); setCustomEndDate(""); }} required className="h-10 w-full rounded-lg border bg-white px-3 text-sm">
            {courses.map((course) => <option key={course.id} value={course.id}>{displayCourseCategory(course.category)} · {course.name}</option>)}
          </select>
        </Field>
        <Field label="课程班级（选填）">
          <select name="classGroupId" value={classGroupId} onChange={(event) => { setClassGroupId(event.target.value); setCustomEndDate(""); }} className="h-10 w-full rounded-lg border bg-white px-3 text-sm">
            <option value="">暂不分班</option>
            {currentClassMissing && <option value={enrollment.class_group_id}>{enrollment.class_group_name || "当前班级"}（已结课，保留）</option>}
            {classOptions.map((group) => <option key={group.id} value={group.id}>{group.name} · {group.teacher_name}</option>)}
          </select>
        </Field>
        <Field label="报名类型 *">
          <select name="registrationType" defaultValue={enrollment.registration_type} className="h-10 w-full rounded-lg border bg-white px-3 text-sm">
            <option value="new">新报</option><option value="renewal">续报</option>
          </select>
        </Field>
        <Field label="课节数"><Input name="quantity" type="number" min="1" defaultValue={enrollment.quantity} required /></Field>
        <Field label="币种 *">
          <select name="currency" defaultValue={enrollment.currency} className="h-10 w-full rounded-lg border bg-white px-3 text-sm"><option value="SGD">新币 SGD</option><option value="CNY">人民币 CNY</option></select>
        </Field>
        <Field label="课程原价 *"><Input name="listAmount" type="number" min="0" step="0.01" defaultValue={(Number(enrollment.list_amount_cents || 0) / 100).toFixed(2)} required /></Field>
        <Field label="实际收款金额 *"><Input name="paymentAmount" type="number" min="0.01" step="0.01" defaultValue={(Number(enrollment.paid_cents || 0) / 100).toFixed(2)} required /><p className="text-xs text-slate-500">当前共 {Number(enrollment.payment_count || 0)} 笔已确认收款；修改会调整报名时的首笔收款，并保留后续追加收款。</p></Field>
        <Field label="加入第一次课日期（选填）"><Input name="firstLessonDate" type="date" className="cursor-pointer" value={firstLessonDate} onChange={(event) => setFirstLessonDate(event.target.value)} /><p className="text-xs text-slate-500">可直接输入日期或点击日历选择；旧记录暂时没有日期也能保存。</p></Field>
        <EnrollmentEndDateField classEndDate={selectedClassEndDate} customEndDate={customEndDate} firstLessonDate={firstLessonDate} hasClass={Boolean(classGroupId)} onChange={setCustomEndDate} />
        <Field label="到账日期 *"><Input name="paidAt" type="date" defaultValue={enrollment.payment_paid_at || today()} required /></Field>
        <Field label="付款方式">
          <select name="paymentMethod" defaultValue={enrollment.payment_method || "银行转账"} className="h-10 w-full rounded-lg border bg-white px-3 text-sm">
            <option>银行转账</option><option>PayNow</option><option>微信支付</option><option>支付宝</option><option>微店</option><option>现金</option><option>信用卡</option><option>其他</option>
          </select>
        </Field>
        <Field label="交易编号"><Input name="paymentReference" defaultValue={enrollment.payment_reference || ""} /></Field>
        <div className="sm:col-span-2">
          <Field label="付款截图管理（最多 5 张）">
            <div className="rounded-2xl border-2 border-blue-200 bg-gradient-to-br from-blue-50/90 to-white p-4 sm:p-5">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 font-semibold text-slate-900"><ImageIcon className="h-5 w-5 text-[#0f5797]" />查看、删除或继续上传付款截图</p>
                  <p className="mt-1 text-sm text-slate-600">要替换截图：先将旧截图标记为删除，再在下方选择新图片，最后点击“保存报名修改”。</p>
                </div>
                <Badge variant="secondary">保存后共 {keptCount + newScreenshots.length} / 5 张</Badge>
              </div>
              {existingScreenshots.length > 0 ? (
                <div className="mb-4 grid gap-3 sm:grid-cols-2">
                {existingScreenshots.map((file: Row, index: number) => {
                  const id = String(file.id);
                  const kept = keptScreenshotIds.has(id);
                  return (
                    <div key={id} className={`rounded-xl border p-3 text-sm ${kept ? "border-slate-200 bg-white" : "border-red-200 bg-red-50"}`}>
                      {kept && <input type="hidden" name="keepScreenshotIds" value={id} />}
                      <div className="flex min-w-0 items-center gap-2">
                        <ImageIcon className={`h-4 w-4 shrink-0 ${kept ? "text-[#0f5797]" : "text-red-500"}`} />
                        <span className={`min-w-0 flex-1 truncate font-medium ${kept ? "text-slate-800" : "text-red-700 line-through"}`}>{index + 1}. {file.name}</span>
                        <Badge variant={kept ? "secondary" : "destructive"}>{kept ? "保留" : "将删除"}</Badge>
                      </div>
                      <div className="mt-3 flex gap-2">
                        <Button type="button" size="sm" variant="outline" asChild>
                          <a href={`/api/enrollment/${enrollment.id}/screenshot${id === "legacy" ? "" : `?fileId=${encodeURIComponent(id)}`}`} target="_blank" rel="noreferrer">查看截图</a>
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={kept ? "ghost" : "outline"}
                          className={kept ? "text-red-600 hover:bg-red-50 hover:text-red-700" : "text-[#0f5797]"}
                          onClick={() => setKeptScreenshotIds((current) => {
                            const next = new Set(current);
                            if (next.has(id)) next.delete(id); else next.add(id);
                            return next;
                          })}
                        >
                          {kept ? <><Trash2 className="mr-1 h-4 w-4" />删除此截图</> : "恢复保留"}
                        </Button>
                      </div>
                    </div>
                  );
                })}
                </div>
              ) : (
                <p className="mb-4 rounded-lg border border-dashed border-slate-300 bg-white p-3 text-sm text-slate-600">这条报名目前没有付款截图，可以在下方上传。</p>
              )}
            <label className="block cursor-pointer rounded-xl border-2 border-dashed border-blue-300 bg-white p-4 transition hover:border-blue-500 hover:bg-blue-50/50">
              <span className="flex items-center gap-2 font-semibold text-[#0f5797]"><Upload className="h-5 w-5" />继续上传付款截图（可多选）</span>
              <input className="mt-3 block max-w-full text-sm" type="file" name="registrationScreenshots" multiple accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => {
                const files = Array.from(event.currentTarget.files ?? []);
                if (keptCount + files.length > 5) {
                  event.currentTarget.value = "";
                  event.currentTarget.setCustomValidity("保留和新增的付款截图合计最多 5 张");
                  event.currentTarget.reportValidity();
                  setNewScreenshots([]);
                  return;
                }
                event.currentTarget.setCustomValidity("");
                setNewScreenshots(files);
              }} />
              <span className="mt-2 block text-xs text-slate-500">已保留 {keptCount} 张，新选择 {newScreenshots.length} 张；支持 JPG、PNG、WEBP 或 PDF，每张最大 10MB。</span>
              {newScreenshots.length > 0 && (
                <span className="mt-2 block text-sm text-slate-700">将新增：{newScreenshots.map((file) => file.name).join("、")}</span>
              )}
            </label>
            </div>
          </Field>
        </div>
        <div className="sm:col-span-2"><Field label="备注"><Textarea name="notes" rows={3} defaultValue={enrollment.notes} /></Field></div>
      </div>
      <Submit saving={saving} label="保存报名修改" sticky />
    </form>
  );
}
function AiImportForm({
  mode,
  connected,
  draft,
  catalog,
  working,
  onAnalyze,
  onUpdate,
  onConfirm,
  onReset,
}: {
  mode: "student" | "enrollment";
  connected: boolean;
  draft: {
    jobId: string;
    mode: "student" | "enrollment";
    records: Row[];
  } | null;
  catalog: Row;
  working: boolean;
  onAnalyze: React.FormEventHandler<HTMLFormElement>;
  onUpdate: (index: number, key: string, value: unknown) => void;
  onConfirm: () => void;
  onReset: () => void;
}) {
  const isStudent = mode === "student";
  if (!draft)
    return (
      <form onSubmit={onAnalyze}>
        <input type="hidden" name="mode" value={mode} />
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[#174f87]" />
            {isStudent ? "AI 登记学员" : "AI 智能录入报名"}
          </DialogTitle>
          <DialogDescription>
            上传截图、照片或 Excel，并在右侧告诉 AI 文件内容、简称含义、需要重点识别或纠正的信息。AI
            会同时理解文件与补充说明，先生成草稿，确认后才会写入数据库。单次最多识别 50 条，数据较多时优先上传 Excel。
          </DialogDescription>
        </DialogHeader>
        {!connected && (
          <div className="mt-5 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-medium">AI 识别尚未连接</p>
              <p className="mt-1">
                管理员配置 OpenAI API 密钥后即可使用，手动登记不受影响。
              </p>
            </div>
          </div>
        )}
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="grid min-h-44 cursor-pointer place-items-center rounded-2xl border-2 border-dashed bg-slate-50 p-5 text-center transition hover:border-[#174f87] hover:bg-blue-50/40">
            <div>
              <span className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-white text-[#174f87] shadow-sm">
                <Upload className="h-5 w-5" />
              </span>
              <p className="mt-3 font-medium">上传图片或 Excel</p>
              <p className="mt-1 text-sm text-slate-500">
                JPG、PNG、WEBP、CSV、XLS、XLSX · 最大 10MB
              </p>
              <input
                className="mt-4 block max-w-full text-sm"
                type="file"
                name="file"
                accept=".jpg,.jpeg,.png,.webp,.csv,.xls,.xlsx,image/jpeg,image/png,image/webp"
              />
            </div>
          </label>
          <div className="rounded-2xl border border-blue-200 bg-blue-50/40 p-4">
            <div className="mb-2 flex items-center gap-2 font-medium text-[#174f87]">
              <MessageSquarePlus className="h-4 w-4" />
              和 AI 补充说明
            </div>
            <p className="mb-3 text-xs leading-5 text-slate-600">
              可以补充背景、解释简称、指出重点字段，或纠正文件里的信息；文字会和文件一起提交识别。
            </p>
            <Textarea
              name="sourceText"
              rows={6}
              className="bg-white"
              placeholder={
                isStudent
                  ? "告诉 AI：这份表里“小明妈妈”是家长微信名；请重点识别学生姓名、年级、ClassIn 账号和课程顾问。如果文件里没有的信息请留空。也可以不上传文件，直接输入完整学员资料。"
                  : "告诉 AI：这是一份续报记录；“阅读12”指阅读课12节，金额为新币；请重点识别学生、课程、应收和实收。也可以不上传文件，直接输入完整报名资料。"
              }
            />
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 text-sm">
            <ImageIcon className="h-5 w-5 text-[#174f87]" />
            识别截图照片
          </div>
          <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 text-sm">
            <FileSpreadsheet className="h-5 w-5 text-[#174f87]" />
            批量读取 Excel
          </div>
          <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 text-sm">
            <CheckCircle2 className="h-5 w-5 text-[#174f87]" />
            重复记录先提示
          </div>
        </div>
        <div className="mt-6 flex justify-end">
          <Button type="submit" disabled={!connected || working}>
            {working
              ? "正在识别…"
              : isStudent
                ? "识别学员信息"
                : "识别报名信息"}
          </Button>
        </div>
      </form>
    );
  return (
    <div>
      <DialogHeader>
        <DialogTitle>核对识别结果 · {draft.records.length} 条</DialogTitle>
        <DialogDescription>
          {isStudent
            ? "请补全必填字段；疑似重复学员会被提示并在导入时跳过。"
            : "请检查课程、报名类型、币种、金额和日期。只有成功连接已有学员档案的记录才可以导入。"}
        </DialogDescription>
      </DialogHeader>
      <div className="mt-5 space-y-4">
        {draft.records.map((record, index) => (
          <section
            key={index}
            className={`rounded-2xl border p-4 ${record.existing_student_id ? isStudent ? "border-amber-300 bg-amber-50/60" : "border-emerald-300 bg-emerald-50/60" : "bg-slate-50/60"}`}
          >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold">
                  第 {index + 1} 条 ·{" "}
                  {String(record.student_full_name || "待补姓名")}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  识别可信度 {Math.round(Number(record.confidence || 0) * 100)}%
                </p>
                {record.existing_student_id && !isStudent && (
                  <p className="mt-1 text-xs font-medium text-emerald-700">
                    已连接学员档案 {String(record.existing_student_code || "")}
                  </p>
                )}
                {!record.existing_student_id && !isStudent && (
                  <p className="mt-1 text-xs font-medium text-red-700">
                    未找到学员档案，请先到“学员档案”创建，当前记录不能报名
                  </p>
                )}
              </div>
              {Array.isArray(record.warnings) && record.warnings.length ? (
                <div className="flex max-w-xl items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{record.warnings.join("；")}</span>
                </div>
              ) : (
                <Badge variant="secondary">已识别</Badge>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <AiField
                label="孩子姓名 *"
                value={record.student_full_name}
                onChange={(value) =>
                  onUpdate(index, "student_full_name", value)
                }
              />
              {isStudent && (
                <>
                  <AiField
                    label="英文名"
                    value={record.english_name}
                    onChange={(value) => onUpdate(index, "english_name", value)}
                  />
                  <AiField
                    label="年级 *"
                    value={record.grade}
                    onChange={(value) => onUpdate(index, "grade", value)}
                  />
                  <AiField
                    label="学校"
                    value={record.school}
                    onChange={(value) => onUpdate(index, "school", value)}
                  />
                  <AiField
                    label="ClassIn 账号"
                    value={record.classin_account}
                    onChange={(value) => onUpdate(index, "classin_account", value)}
                  />
                  <AiField
                    label="家长微信名 *"
                    value={record.guardian_wechat_name}
                    onChange={(value) =>
                      onUpdate(index, "guardian_wechat_name", value)
                    }
                  />
                  <AiField
                    label="首次登记日期 *"
                    type="date"
                    value={record.first_registered_at ?? today()}
                    onChange={(value) =>
                      onUpdate(index, "first_registered_at", value)
                    }
                  />
                </>
              )}
              {!isStudent && (
                <>
                  <div className="space-y-2">
                    <Label>报名课程 *</Label>
                    <select
                      className="h-10 w-full rounded-lg border bg-white px-3 text-sm"
                      value={String(record.course_id ?? "")}
                      onChange={(e) =>
                        onUpdate(index, "course_id", e.target.value)
                      }
                    >
                      <option value="">请选择课程</option>
                      {(catalog.courses ?? []).map((course: Row) => (
                        <option key={course.id} value={course.id}>
                          {course.name}
                        </option>
                      ))}
                    </select>
                    {!record.course_id && record.course_name_raw && (
                      <p className="text-xs text-amber-700">
                        原文：{String(record.course_name_raw)}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>报名类型 *</Label>
                    <select
                      className="h-10 w-full rounded-lg border bg-white px-3 text-sm"
                      value={String(record.registration_type ?? "new")}
                      onChange={(e) =>
                        onUpdate(index, "registration_type", e.target.value)
                      }
                    >
                      <option value="new">新报</option>
                      <option value="renewal">续报</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>币种 *</Label>
                    <select
                      className="h-10 w-full rounded-lg border bg-white px-3 text-sm"
                      value={String(record.currency ?? "SGD")}
                      onChange={(e) =>
                        onUpdate(index, "currency", e.target.value)
                      }
                    >
                      <option value="SGD">SGD</option>
                      <option value="CNY">CNY</option>
                    </select>
                  </div>
                  <AiNumber
                    label="课节数"
                    value={record.quantity ?? 1}
                    min="1"
                    onChange={(value) => onUpdate(index, "quantity", value)}
                  />
                  <AiNumber
                    label="课程原价 *"
                    value={record.list_amount}
                    min="0"
                    onChange={(value) => onUpdate(index, "list_amount", value)}
                  />
                  <AiNumber
                    label="已收金额"
                    value={record.payment_amount ?? 0}
                    min="0"
                    onChange={(value) =>
                      onUpdate(index, "payment_amount", value)
                    }
                  />
                </>
              )}
              {isStudent && (
                <>
                  <div className="space-y-2">
                    <Label>首次来源渠道</Label>
                    <select
                      className="h-10 w-full rounded-lg border bg-white px-3 text-sm"
                      value={String(record.agent_id ?? "")}
                      onChange={(e) => onUpdate(index, "agent_id", e.target.value)}
                    >
                      <option value="">无渠道 / 自然到访</option>
                      {(catalog.agents ?? []).map((agent: Row) => (
                        <option key={agent.id} value={agent.id}>
                          {agent.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  {(catalog.team ?? []).length ? (
                    <div className="space-y-2">
                      <Label>负责课程顾问</Label>
                      <select
                        className="h-10 w-full rounded-lg border bg-white px-3 text-sm"
                        value={String(record.salesperson_user_id ?? "")}
                        onChange={(e) =>
                          onUpdate(index, "salesperson_user_id", e.target.value)
                        }
                      >
                        <option value="">当前录入人</option>
                        {catalog.team.map((person: Row) => (
                          <option key={person.user_id} value={person.user_id}>
                            {person.display_name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                </>
              )}
              <div className="space-y-2 sm:col-span-2">
                <Label>备注</Label>
                <Input
                  value={String(record.notes ?? "")}
                  onChange={(e) => onUpdate(index, "notes", e.target.value)}
                />
              </div>
            </div>
          </section>
        ))}
      </div>
      <div className="sticky bottom-0 mt-5 flex flex-wrap justify-between gap-3 border-t bg-white/95 pt-4 backdrop-blur">
        <Button variant="ghost" onClick={onReset} disabled={working}>
          重新识别
        </Button>
        <Button
          onClick={onConfirm}
          disabled={
            working ||
            draft.records.some(
              (record) =>
                !record.student_full_name ||
                (isStudent &&
                  (!record.grade ||
                    !record.guardian_wechat_name ||
                    !record.first_registered_at)) ||
                (!isStudent &&
                  (!record.existing_student_id ||
                    !record.course_id ||
                    !Number(record.list_amount))),
            )
          }
        >
          {working ? "正在写入数据库…" : `确认导入 ${draft.records.length} 条`}
        </Button>
      </div>
    </div>
  );
}
function AiField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: unknown;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        type={type}
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
function AiNumber({
  label,
  value,
  onChange,
  min = "0",
}: {
  label: string;
  value: unknown;
  onChange: (value: string) => void;
  min?: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        type="number"
        min={min}
        step="0.01"
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
function InvoiceConfirmForm({
  draft,
  saving,
  onSubmit,
}: {
  draft: Row;
  saving: boolean;
  onSubmit: React.FormEventHandler<HTMLFormElement>;
}) {
  return (
    <form onSubmit={onSubmit}>
      <DialogHeader>
        <DialogTitle>确认并修改发票</DialogTitle>
        <DialogDescription>
          请先核对内容。只有点击“确认开具发票”后才会保存；生成后的发票为全英文，并可下载可编辑
          Word。
        </DialogDescription>
      </DialogHeader>
      <input type="hidden" name="enrollmentId" value={draft.enrollmentId} />
      <input type="hidden" name="paymentId" value={draft.paymentId} />
      <div className="mt-5 rounded-xl border border-blue-100 bg-blue-50/60 p-4 text-sm">
        <b>{platformConfig.organization.legalName}</b>
        <p className="mt-1 text-slate-600">
          Invoice preview fields — all fields below can be edited before
          creation.
        </p>
      </div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="Invoice No *">
          <Input
            name="invoiceNumber"
            defaultValue={draft.invoiceNumber}
            required
          />
        </Field>
        <Field label="Invoice Date *">
          <Input
            name="invoiceDate"
            type="date"
            defaultValue={draft.invoiceDate}
            required
          />
        </Field>
        <Field label="Bill To *">
          <Input name="billTo" defaultValue={draft.billTo} required />
        </Field>
        <Field label="Student">
          <Input value={draft.studentName} readOnly className="bg-slate-50" />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Description *">
            <Textarea
              name="description"
              rows={5}
              defaultValue={draft.description}
              required
            />
          </Field>
        </div>
        <Field label="Qty *">
          <Input
            name="quantity"
            type="number"
            min="0.01"
            step="0.01"
            defaultValue={draft.quantity}
            required
          />
        </Field>
        <Field label="Rate *">
          <Input
            name="rate"
            type="number"
            min="0"
            step="0.01"
            defaultValue={draft.rate}
            required
          />
        </Field>
        <Field label="Amount *">
          <Input
            name="amount"
            type="number"
            min="0.01"
            step="0.01"
            defaultValue={draft.amount}
            required
          />
        </Field>
        <Field label="Tax (%)">
          <Input
            name="taxPercent"
            type="number"
            min="0"
            max="100"
            step="0.01"
            defaultValue={draft.taxPercent}
          />
        </Field>
        <Field label="Currency">
          <select
            name="currency"
            defaultValue={draft.currency}
            className="h-10 w-full rounded-lg border bg-white px-3 text-sm"
          >
            <option>SGD</option>
            <option>CNY</option>
            <option>USD</option>
          </select>
        </Field>
        <Field label="Payment Terms">
          <Input name="paymentTerms" defaultValue={draft.paymentTerms} />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Notes">
            <Textarea
              name="notes"
              rows={3}
              defaultValue={draft.notes}
              placeholder="Optional note shown on the invoice"
            />
          </Field>
        </div>
      </div>
      <div className="mt-5 rounded-xl border bg-slate-50 p-3 text-sm text-slate-600">
        发票内容会以这里确认的数据快照保存，不会因之后修改学员或课程资料而变化。
      </div>
      <Submit saving={saving} label="确认开具发票" />
    </form>
  );
}
function PaymentForm({
  enrollment,
  saving,
  onSubmit,
}: {
  enrollment: Row;
  saving: boolean;
  onSubmit: React.FormEventHandler<HTMLFormElement>;
}) {
  const balance = enrollment.net_amount_cents - enrollment.paid_cents;
  return (
    <form onSubmit={onSubmit}>
      <DialogHeader>
        <DialogTitle>登记收款</DialogTitle>
        <DialogDescription>
          {enrollment.student_name} · {enrollment.course_name} · 未收{" "}
          {money(balance, enrollment.currency)}
        </DialogDescription>
      </DialogHeader>
      <input type="hidden" name="enrollmentId" value={enrollment.id} />
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="到账金额 *">
          <Input
            name="amount"
            type="number"
            min="0.01"
            max={(balance / 100).toFixed(2)}
            step="0.01"
            required
          />
        </Field>
        <Field label="到账日期 *">
          <Input name="paidAt" type="date" defaultValue={today()} required />
        </Field>
        <Field label="付款方式">
          <select
            name="method"
            className="h-10 w-full rounded-lg border bg-white px-3 text-sm"
          >
            <option>银行转账</option>
            <option>PayNow</option>
            <option>微店</option>
            <option>现金</option>
            <option>信用卡</option>
            <option>其他</option>
          </select>
        </Field>
        <Field label="交易编号">
          <Input name="reference" />
        </Field>
      </div>
      <Submit saving={saving} label="确认收款" />
    </form>
  );
}
function RefundForm({
  enrollment,
  refund,
  saving,
  onSubmit,
  onCancel,
  onDelete,
}: {
  enrollment: Row;
  refund?: Row | null;
  saving: boolean;
  onSubmit: React.FormEventHandler<HTMLFormElement>;
  onCancel: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [status, setStatus] = useState(
    refund?.status === "confirmed" ? "confirmed" : "pending",
  );
  const remaining = Math.max(
    0,
    Number(enrollment.paid_cents || 0) -
      Number(enrollment.refunded_cents || 0) +
      (refund?.status === "confirmed" ? Number(refund.amount_cents || 0) : 0),
  );
  return (
    <form onSubmit={onSubmit}>
      <DialogHeader>
        <DialogTitle>{refund ? "修改退费记录" : "登记学员退费"}</DialogTitle>
        <DialogDescription>
          {enrollment.student_name} · {enrollment.course_name} · 已收{" "}
          {money(enrollment.paid_cents, enrollment.currency)}。确认退款后，系统会按最后上课日期退班并保留历史记录。
        </DialogDescription>
      </DialogHeader>
      <input type="hidden" name="enrollmentId" value={enrollment.id} />
      {refund && <input type="hidden" name="id" value={refund.id} />}
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="退费金额 *">
          <Input
            name="amount"
            type="number"
            min="0.01"
            max={(remaining / 100).toFixed(2)}
            step="0.01"
            defaultValue={refund ? (Number(refund.amount_cents) / 100).toFixed(2) : ""}
            required
          />
          <p className="text-xs text-slate-500">当前最多可登记 {money(remaining, enrollment.currency)}</p>
        </Field>
        <Field label="退费状态 *">
          <select
            name="status"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="h-10 w-full rounded-lg border bg-white px-3 text-sm"
          >
            <option value="pending">退费申请中</option>
            <option value="confirmed">已确认退款到账</option>
          </select>
        </Field>
        <Field label="申请日期 *">
          <Input name="requestedAt" type="date" defaultValue={refund?.requested_at || today()} required />
        </Field>
        <Field label="最后上课日期 *">
          <Input
            name="lastLessonDate"
            type="date"
            defaultValue={refund?.last_lesson_date || enrollment.actual_end_date || today()}
            required
          />
          <p className="text-xs text-slate-500">确认退款后，学员将按此日期从当前班级退出。</p>
        </Field>
        {status === "confirmed" && (
          <Field label="实际退款日期 *">
            <Input name="refundedAt" type="date" defaultValue={refund?.refunded_at || today()} required />
          </Field>
        )}
        <Field label="退款方式">
          <select name="method" defaultValue={refund?.method || "银行转账"} className="h-10 w-full rounded-lg border bg-white px-3 text-sm">
            <option>银行转账</option><option>PayNow</option><option>微信</option><option>现金</option><option>信用卡原路退回</option><option>其他</option>
          </select>
        </Field>
        <Field label="退款交易编号">
          <Input name="reference" defaultValue={refund?.reference || ""} />
        </Field>
        <Field label="退款凭证（选填）">
          {refund?.proof_file_name && (
            <a className="block text-sm font-medium text-[#174f87] hover:underline" href={`/api/refund/${refund.id}/proof`} target="_blank" rel="noreferrer">
              查看现有凭证：{refund.proof_file_name}
            </a>
          )}
          <Input name="refundProof" type="file" accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf" />
          <p className="text-xs text-slate-500">支持 JPG、PNG、WEBP 或 PDF，最大 10MB；重新上传会替换原凭证。</p>
        </Field>
        <div className="sm:col-span-2">
          <Field label="退费原因 *">
            <Textarea name="reason" rows={3} defaultValue={refund?.reason || ""} required />
          </Field>
        </div>
      </div>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {refund && refund.status !== "cancelled" && (
            <Button type="button" variant="outline" disabled={saving} onClick={() => onCancel(String(refund.id))}>撤销退费</Button>
          )}
          {refund && (
            <Button type="button" variant="ghost" className="text-red-600 hover:bg-red-50 hover:text-red-700" disabled={saving} onClick={() => onDelete(String(refund.id))}>
              <Trash2 className="mr-1 h-4 w-4" />删除错误记录
            </Button>
          )}
        </div>
        <Button type="submit" disabled={saving}>{saving ? "保存中…" : status === "confirmed" ? "确认退款并处理退班" : "保存退费申请"}</Button>
      </div>
    </form>
  );
}
function FinishForm({
  enrollment,
  saving,
  onSubmit,
}: {
  enrollment: Row;
  saving: boolean;
  onSubmit: React.FormEventHandler<HTMLFormElement>;
}) {
  return (
    <form onSubmit={onSubmit}>
      <DialogHeader>
        <DialogTitle>登记课程结束</DialogTitle>
        <DialogDescription>
          {enrollment.student_name} · {enrollment.course_name}
          。保存后会从待跟进列表中移除。
        </DialogDescription>
      </DialogHeader>
      <input type="hidden" name="enrollmentId" value={enrollment.id} />
      <div className="mt-5">
        <Field label="实际结课日期 *">
          <Input
            name="actualEndDate"
            type="date"
            defaultValue={today()}
            required
          />
        </Field>
      </div>
      <Submit saving={saving} label="确认结课" />
    </form>
  );
}
function FollowupForm({
  student,
  saving,
  onSubmit,
}: {
  student: Row;
  saving: boolean;
  onSubmit: React.FormEventHandler<HTMLFormElement>;
}) {
  return (
    <form onSubmit={onSubmit}>
      <DialogHeader>
        <DialogTitle>记录客户跟进</DialogTitle>
        <DialogDescription>
          {student.full_name} · {student.code}
          。每次记录都会保留负责课程顾问和时间。
        </DialogDescription>
      </DialogHeader>
      <input type="hidden" name="studentId" value={student.id} />
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="跟进日期 *">
          <Input
            name="followedAt"
            type="date"
            defaultValue={today()}
            required
          />
        </Field>
        <Field label="跟进方式">
          <select
            name="method"
            className="h-10 w-full rounded-lg border bg-white px-3 text-sm"
          >
            <option>微信</option>
            <option>电话</option>
            <option>短信</option>
            <option>邮件</option>
            <option>面谈</option>
            <option>其他</option>
          </select>
        </Field>
        <Field label="下次跟进日期">
          <Input name="nextFollowUpAt" type="date" />
        </Field>
        <div className="sm:col-span-2">
          <Field label="本次跟进内容 *">
            <Textarea
              name="note"
              rows={5}
              required
              placeholder="记录家长需求、反馈、意向课程和下一步安排"
            />
          </Field>
        </div>
      </div>
      <Submit saving={saving} label="保存跟进记录" />
    </form>
  );
}
function CourseForm({
  course,
  saving,
  onSubmit,
}: {
  course?: Row;
  saving: boolean;
  onSubmit: React.FormEventHandler<HTMLFormElement>;
}) {
  return (
    <form onSubmit={onSubmit}>
      {course && <input type="hidden" name="id" value={course.id} />}
      <DialogHeader>
        <DialogTitle>{course ? "编辑课程" : "新增课程"}</DialogTitle>
        <DialogDescription>{course ? "修改后的名称和设置会同步显示在班级与报名记录中。" : "建立课程后即可直接开班。"}</DialogDescription>
      </DialogHeader>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="课程名称 *">
          <Input name="name" defaultValue={course?.name} required />
        </Field>
        <Field label="课程分类">
          <select
            name="category"
            defaultValue={
              displayCourseCategory(course?.category)
            }
            className="h-10 w-full rounded-lg border bg-white px-3 text-sm"
          >
            {courseCategories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Submit saving={saving} label={course ? "保存修改" : "保存课程"} />
    </form>
  );
}
function AgentForm({
  saving,
  onSubmit,
}: {
  saving: boolean;
  onSubmit: React.FormEventHandler<HTMLFormElement>;
}) {
  return (
    <form onSubmit={onSubmit}>
      <DialogHeader>
        <DialogTitle>新增渠道</DialogTitle>
        <DialogDescription>
          渠道用于记录客户报名来源；佣金规则会复制到每一笔报名，历史记录不会随规则变化。
        </DialogDescription>
      </DialogHeader>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="渠道名称 *">
          <Input name="name" required />
        </Field>
        <Field label="联系方式">
          <Input name="contact" />
        </Field>
        <Field label="佣金类型">
          <select
            name="commissionType"
            className="h-10 w-full rounded-lg border bg-white px-3 text-sm"
          >
            <option value="percent">百分比</option>
            <option value="fixed">固定金额</option>
          </select>
        </Field>
        <Field label="比例或固定金额">
          <Input
            name="commissionValue"
            type="number"
            min="0"
            step="0.01"
            defaultValue="0"
          />
        </Field>
        <div className="sm:col-span-2">
          <Field label="备注">
            <Textarea name="notes" rows={3} />
          </Field>
        </div>
      </div>
      <Submit saving={saving} label="保存渠道" />
    </form>
  );
}
function MemberForm({
  saving,
  onSubmit,
}: {
  saving: boolean;
  onSubmit: React.FormEventHandler<HTMLFormElement>;
}) {
  return (
    <form onSubmit={onSubmit}>
      <DialogHeader>
        <DialogTitle>添加员工账号</DialogTitle>
        <DialogDescription>
          员工必须使用这里填写的同一个邮箱登录。密码由 ChatGPT
          安全验证，工作台不会保存密码。
        </DialogDescription>
      </DialogHeader>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="员工姓名 *">
          <Input name="displayName" required autoComplete="name" />
        </Field>
        <Field label="登录邮箱 *">
          <Input name="email" type="email" required autoComplete="email" />
        </Field>
        <div className="sm:col-span-2">
          <Field label="员工角色 *">
            <select
              name="role"
              className="h-10 w-full rounded-lg border bg-white px-3 text-sm"
              required
            >
              <option value="sales">课程顾问</option>
              <option value="operations">教务运营</option>
              <option value="finance">财务</option>
              <option value="operations_finance">教务运营财务</option>
              <option value="admin">系统管理员</option>
            </select>
          </Field>
        </div>
      </div>
      <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/70 p-3 text-sm leading-6 text-slate-600">
        保存后，把正式平台链接发给员工。员工首次使用时选择“使用邮箱和密码登录”，系统会自动绑定该邮箱的账号。
      </div>
      <Submit saving={saving} label="添加员工" />
    </form>
  );
}
function MemberTransferForm({
  source,
  team,
  currentMember,
  saving,
  onSubmit,
}: {
  source: Row;
  team: Row[];
  currentMember: Row;
  saving: boolean;
  onSubmit: React.FormEventHandler<HTMLFormElement>;
}) {
  const targets = team.filter(
      (r: Row) =>
        r.id !== source.id &&
        r.status === "active" &&
        ["admin", "sales", "operations", "operations_finance"].includes(r.role),
    ),
    isSelf = source.id === currentMember.id;
  return (
    <form onSubmit={onSubmit}>
      <DialogHeader>
        <DialogTitle>交接 {source.display_name} 的客户</DialogTitle>
        <DialogDescription>
          将该员工负责的 {Number(source.customer_count || 0)}{" "}
          位客户批量转给另一位员工。
        </DialogDescription>
      </DialogHeader>
      <input type="hidden" name="fromMemberId" value={source.id} />
      <div className="mt-5 space-y-4">
        <Field label="接手员工 *">
          <select
            name="toMemberId"
            required
            className="h-10 w-full rounded-lg border bg-white px-3 text-sm"
          >
            <option value="">请选择接手员工</option>
            {targets.map((r: Row) => (
              <option key={r.id} value={r.id}>
                {r.display_name} · {roleName(r.role)} · 当前{" "}
                {Number(r.customer_count || 0)} 位客户
              </option>
            ))}
          </select>
        </Field>
        <label
          className={`flex items-start gap-3 rounded-xl border p-4 ${isSelf ? "cursor-not-allowed border-slate-200 bg-slate-50" : "cursor-pointer border-red-100 bg-red-50/60"}`}
        >
          <input
            type="checkbox"
            name="deleteSource"
            value="true"
            defaultChecked={!isSelf}
            disabled={isSelf}
            className="mt-1 h-4 w-4 accent-red-600"
          />
          <span>
            <b className="text-sm text-slate-800">交接完成后删除原员工账号</b>
            <span className="mt-1 block text-xs leading-5 text-slate-600">
              {isSelf
                ? "当前登录账号不能删除；本次只转移客户。"
                : "原员工将立即无法登录；客户的新负责人会更新，但历史报名、收款、业绩和跟进记录仍保留原经办人。"}
            </span>
          </span>
        </label>
        {!targets.length && (
          <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
            目前没有可接手客户的已启用员工，请先添加或启用管理员、课程顾问、教务运营或教务运营财务账号。
          </p>
        )}
      </div>
      <Submit saving={saving} label="确认交接" disabled={!targets.length} />
    </form>
  );
}

function scheduleText(row: Row) {
  if (row.schedule_type === "specific_dates")
    return `具体日期：${String(row.specific_dates || "待补")}`;
  return String(row.class_time || "上课时间待补");
}
function AiImportFormWithClasses(props: {
  mode: "student" | "enrollment";
  connected: boolean;
  draft: {
    jobId: string;
    mode: "student" | "enrollment";
    records: Row[];
  } | null;
  catalog: Row;
  working: boolean;
  onAnalyze: React.FormEventHandler<HTMLFormElement>;
  onUpdate: (index: number, key: string, value: unknown) => void;
  onConfirm: () => void;
  onReset: () => void;
}) {
  return <AiImportForm {...props} />;
}
function AiSchedulePanel({ onApply, context }: { onApply: (result: Row) => void; context?: Row }) {
  const [sourceText, setSourceText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const analyze = async () => {
    if (!sourceText.trim() && !file) {
      setError("请上传排课文件，或在 AI 补充说明中输入文字");
      return;
    }
    setWorking(true);
    setError("");
    setMessage("");
    try {
      const body = new FormData();
      body.set("sourceText", sourceText);
      body.set("context", JSON.stringify(context ?? {}));
      if (file) body.set("file", file);
      const response = await fetch("/api/ai-schedule", {
        method: "POST",
        body,
      });
      const result = (await response.json()) as Row;
      if (!response.ok) throw new Error(String(result.error ?? "识别失败"));
      onApply(result);
      const warnings =
        Array.isArray(result.warnings) && result.warnings.length
          ? `；请核对：${result.warnings.join("；")}`
          : "";
      setMessage(`已自动填入排课信息${warnings}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "识别失败");
    } finally {
      setWorking(false);
    }
  };
  return (
    <div className="mt-5 rounded-2xl border border-blue-200 bg-[linear-gradient(105deg,#eff6ff,#fff9df)] p-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <p className="flex items-center gap-2 font-semibold text-[#174f87]">
            <Sparkles className="h-5 w-5" />
            AI 识别排课
          </p>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            输入排课指令或上传文件。支持前几节指定日期、之后固定每周上课；识别后请核对课表再保存。所有时间按新加坡／北京时间（UTC+8）。
          </p>
        </div>
        <Button type="button" onClick={() => void analyze()} disabled={working}>
          {working ? "正在识别…" : "识别并填入"}
        </Button>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-[1.4fr_1fr]">
        <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-[#174f87]">
            <MessageSquarePlus className="h-4 w-4" />
            和 AI 补充说明
          </div>
          <p className="mb-2 text-xs leading-5 text-slate-600">
            可补充老师姓名、课程简称、日期格式，或指出文件中需要重点读取的位置。
          </p>
          <Textarea
            value={sourceText}
            onChange={(event) => setSourceText(event.target.value)}
            rows={4}
            className="bg-white"
            placeholder="例如：共12节，前两节在2026年10月19日和10月23日，18:00–19:00；第三节从10月28日起，固定每周三19:00–20:00。"
          />
        </div>
        <label className="grid cursor-pointer place-items-center rounded-xl border border-dashed border-blue-200 bg-white/80 p-4 text-center">
          <div>
            <Upload className="mx-auto h-5 w-5 text-[#174f87]" />
            <p className="mt-2 text-sm font-medium">上传截图或排课文件</p>
            <p className="mt-1 text-xs text-slate-500">
              JPG、PNG、PDF、CSV、XLS、XLSX · 最大10MB
            </p>
            <input
              type="file"
              className="mt-3 block max-w-full text-xs"
              accept=".jpg,.jpeg,.png,.webp,.pdf,.csv,.xls,.xlsx,image/*,application/pdf"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </div>
        </label>
      </div>
      {message && (
        <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {message}
        </p>
      )}
      {error && (
        <p className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4" />
          {error}
        </p>
      )}
    </div>
  );
}
function scheduleDateKeys(value: unknown) {
  return Array.from(
    new Set(String(value || "").match(/\d{4}-\d{2}-\d{2}/g) ?? []),
  ).sort();
}
function localDateFromKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}
function localDateKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}
function weeklyDateKeys(startDate: string, lessonCount: number) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || lessonCount < 1) return [];
  const first = localDateFromKey(startDate);
  return Array.from({ length: lessonCount }, (_, index) => {
    const date = new Date(first);
    date.setDate(first.getDate() + index * 7);
    return localDateKey(date);
  });
}
function initialLessonCount(classGroup?: Row) {
  const listed = parseLessonSlots(classGroup?.specific_dates).length;
  if (listed) return listed;
  const start = String(classGroup?.start_date || "");
  const end = String(classGroup?.end_date || "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(start) && /^\d{4}-\d{2}-\d{2}$/.test(end)) {
    const weeks = Math.round(
      (localDateFromKey(end).getTime() - localDateFromKey(start).getTime()) /
        604800000,
    );
    return Math.max(1, weeks + 1);
  }
  return 1;
}

function ClassGroupForm({
  courses,
  defaultCourseId,
  classGroup,
  saving,
  onSubmit,
}: {
  courses: Row[];
  defaultCourseId?: string;
  classGroup?: Row;
  saving: boolean;
  onSubmit: React.FormEventHandler<HTMLFormElement>;
}) {
  const [scheduleType, setScheduleType] = useState(classGroup?.schedule_type === "specific_dates" ? "specific_dates" : "weekly");
  const [startDate, setStartDate] = useState(String(classGroup?.start_date ?? ""));
  const [lessonCount, setLessonCount] = useState(() => initialLessonCount(classGroup));
  const [classTime, setClassTime] = useState(String(classGroup?.class_time ?? ""));
  const [manualSlots, setManualSlots] = useState<LessonSlot[]>(() =>
    parseLessonSlots(classGroup?.specific_dates, String(classGroup?.class_time || "")),
  );
  const [earlySlots, setEarlySlots] = useState<LessonSlot[]>([{ date: "", time: "" }, { date: "", time: "" }]);
  const [regularDate, setRegularDate] = useState("");
  const [regularWeekday, setRegularWeekday] = useState(3);
  const [regularTime, setRegularTime] = useState("");
  const formRef=useRef<HTMLFormElement>(null);
  const generatedWeeklyDates = useMemo(
    () => weeklyDateKeys(startDate, lessonCount),
    [startDate, lessonCount],
  );
  const selectedDateKeys = manualSlots.map((slot) => slot.date).filter(Boolean).sort();
  const lastEarlyDate = earlySlots.map((slot) => slot.date).sort().at(-1) || "";
  const regularFirstDate = regularDate
    ? nextWeekday(regularDate, regularWeekday)
    : nextWeekday(lastEarlyDate, regularWeekday, true);
  const mixedError = scheduleType === "mixed"
    ? validateLessonSlots(earlySlots) || (lessonCount <= earlySlots.length ? "总节数须大于单独安排的课次数" : "") ||
      (earlySlots.some((slot, index) => index > 0 && slot.date < earlySlots[index - 1].date) ? "前期课次请按日期先后安排" : "") ||
      (!regularFirstDate ? "请选择固定排课开始日期" : "") ||
      (regularFirstDate <= lastEarlyDate ? "固定排课须在前面单独安排的课次之后开始" : "")
    : "";
  const activeSlots = scheduleType === "weekly"
    ? weeklySlots(startDate, lessonCount, classTime)
    : scheduleType === "mixed"
      ? [...earlySlots, ...weeklySlots(regularFirstDate, Math.max(0, lessonCount - earlySlots.length), regularTime)]
      : manualSlots.map((slot) => ({ ...slot, time: slot.time || timeRange(classTime) }));
  const activeDateKeys = activeSlots.map((slot) => slot.date).filter(Boolean).sort();
  const fixedDay = classTime.match(/(?:每周|星期|周)([日天一二三四五六])/);
  const weeklyDayMismatch = scheduleType === "weekly" && fixedDay && startDate &&
    nextWeekday(startDate, "日一二三四五六".indexOf(fixedDay[1] === "天" ? "日" : fixedDay[1])) !== startDate;
  const scheduleError = mixedError ||
    (weeklyDayMismatch ? "第一次上课日期与固定星期不同，请选择“前几节单独安排 · 之后固定每周”" : "") ||
    validateLessonSlots(activeSlots);
  const derivedStartDate = activeDateKeys[0] ?? "";
  const derivedEndDate = activeDateKeys.at(-1) ?? "";
  const specificDates = serializeSlots(activeSlots);
  const editSlot = (index: number, changes: Partial<LessonSlot>) => {
    setManualSlots(activeSlots.map((slot, position) => position === index ? { ...slot, ...changes } : slot));
    setScheduleType("specific_dates");
  };
  const applyAiSchedule=(result:Row)=>{
    const nextType=result.schedule_type==="mixed"?"mixed":result.schedule_type==="specific_dates"?"specific_dates":"weekly";
    const parsedSlots=parseLessonSlots(result.specific_dates, String(result.class_time || ""));
    const parsedTime=String(result.specific_dates||"").match(/\b\d{1,2}:\d{2}\s*[–-]\s*\d{1,2}:\d{2}\b/)?.[0];
    setScheduleType(nextType);
    if(result.start_date)setStartDate(String(result.start_date));
    if(result.class_time||parsedTime)setClassTime(String(result.class_time||parsedTime));
    if (nextType === "mixed") {
      const prefix = Array.isArray(result.initial_lessons) ? result.initial_lessons.map((slot: Row) => ({ date: String(slot.date || ""), time: String(slot.time || "") })) : [];
      setEarlySlots(prefix.length ? prefix : [{ date: "", time: "" }]);
      setRegularDate(String(result.regular_start_date || ""));
      setRegularWeekday(typeof result.regular_weekday === "number" ? result.regular_weekday : 3);
      setRegularTime(String(result.regular_time || ""));
      setLessonCount(Number(result.lesson_count) || lessonCount);
    }
    else if(parsedSlots.length){setManualSlots(parsedSlots);setLessonCount(Number(result.lesson_count) || parsedSlots.length);}
    else if(result.lesson_count)setLessonCount(Number(result.lesson_count));
    else if(result.start_date&&result.end_date)setLessonCount(initialLessonCount({start_date:result.start_date,end_date:result.end_date}));
    window.setTimeout(()=>{const form=formRef.current;if(!form)return;const values:Record<string,unknown>={name:result.name,classinClassName:result.classin_class_name,teacherName:result.teacher_name,notes:result.notes};for(const[key,value]of Object.entries(values)){if(value===null||value===undefined||value==="")continue;const field=form.elements.namedItem(key) as HTMLInputElement|HTMLTextAreaElement|null;if(field)field.value=String(value);}},0);
  };
  return (
    <form ref={formRef} onSubmit={onSubmit}>
      {classGroup && <input type="hidden" name="id" value={classGroup.id} />}
      <input type="hidden" name="startDate" value={derivedStartDate} />
      <input type="hidden" name="endDate" value={derivedEndDate} />
      <input type="hidden" name="classTime" value={scheduleType === "mixed" ? `前 ${earlySlots.length} 节单独安排；每周${"日一二三四五六"[regularWeekday]} ${regularTime}` : classTime || "逐节上课时间见课表"} />
      <input type="hidden" name="scheduleType" value={scheduleType === "weekly" ? "weekly" : "specific_dates"} />
      <input type="hidden" name="specificDates" value={specificDates} />
      <DialogHeader>
        <DialogTitle>{classGroup ? "编辑课程班级" : "新建课程班级"}</DialogTitle>
        <DialogDescription>
          建立 ClassIn
          对应班级、老师和排课安排。支持固定每周、分阶段排课，以及逐节调整日期和时间。
        </DialogDescription>
      </DialogHeader>
      <AiSchedulePanel onApply={applyAiSchedule} context={{ lesson_count: lessonCount, start_date: startDate || derivedStartDate, class_time: classTime }} />
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="课程 *">
          <select
            name="courseId"
            defaultValue={classGroup?.course_id ?? defaultCourseId ?? ""}
            required
            className="h-10 w-full rounded-lg border bg-white px-3 text-sm"
          >
            <option value="">请选择课程</option>
            {courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
          </select>
        </Field>
        <Field label="内部班级名称 *">
          <Input name="name" defaultValue={classGroup?.name} required placeholder="例如：G5 阅读周六班" />
        </Field>
        <Field label="ClassIn 班级名称">
          <Input name="classinClassName" defaultValue={classGroup?.classin_class_name} placeholder="不填则沿用内部班级名称" />
        </Field>
        <Field label="授课老师 *">
          <select
            name="teacherName"
            defaultValue={teacherNames.includes(String(classGroup?.teacher_name || "")) ? String(classGroup?.teacher_name) : ""}
            required
            className="h-10 w-full rounded-lg border bg-white px-3 text-sm"
          >
            <option value="">请选择授课老师</option>
            {teacherNames.map((teacher) => <option key={teacher} value={teacher}>{teacher}</option>)}
          </select>
        </Field>
        <Field label="排课方式 *">
          <select
            value={scheduleType}
            onChange={(e) => { if (e.target.value === "specific_dates") setManualSlots(activeSlots); setScheduleType(e.target.value); }}
            className="h-10 w-full rounded-lg border bg-white px-3 text-sm"
            required
          >
            <option value="weekly">每周一次 · 自动排课</option>
            <option value="mixed">前几节单独安排 · 之后固定每周</option>
            <option value="specific_dates">逐节安排 · 日历选择日期</option>
          </select>
        </Field>
        {scheduleType === "weekly" ? (
          <>
            <Field label="第一次上课日期 *">
              <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} required />
            </Field>
            <Field label="每周上课时间 *">
              <Input value={classTime} onChange={(event) => setClassTime(event.target.value)} required placeholder="例如：每周六 10:00–11:30" />
            </Field>
            <Field label="总节数 *">
              <Input type="number" name="lessonCount" min={1} max={200} value={lessonCount} onChange={(event) => setLessonCount(Math.max(1, Math.min(200, Number(event.target.value) || 1)))} required />
            </Field>
            <Field label="预计结课日期（自动计算）">
              <Input type="date" value={derivedEndDate} readOnly />
            </Field>
            <div className="sm:col-span-2 rounded-xl border border-blue-100 bg-blue-50/60 p-4">
              <p className="text-sm font-medium text-[#174f87]">已自动生成 {generatedWeeklyDates.length} 节课</p>
              <div className="mt-3 flex max-h-28 flex-wrap gap-2 overflow-y-auto">
                {generatedWeeklyDates.map((date, index) => <span key={date} className="rounded-full border border-blue-200 bg-white px-3 py-1 text-xs text-slate-600">第 {index + 1} 节 · {date}</span>)}
              </div>
            </div>
          </>
        ) : scheduleType === "mixed" ? (
          <>
            <Field label="总节数（包含前面单独安排的课次） *">
              <Input type="number" min={1} max={200} value={lessonCount} onChange={(event) => setLessonCount(Math.max(1, Math.min(200, Number(event.target.value) || 1)))} required />
            </Field>
            <div className="sm:col-span-2 rounded-xl border border-blue-200 bg-blue-50/50 p-4">
              <p className="font-medium text-[#174f87]">前 {earlySlots.length} 节课单独安排</p>
              <div className="mt-3 space-y-3">
                {earlySlots.map((slot, index) => <div key={index} className="grid gap-2 sm:grid-cols-[70px_1fr_1fr_auto] sm:items-center">
                  <span className="text-sm">第 {index + 1} 节</span>
                  <Input type="date" aria-label={`前期第${index + 1}节日期`} value={slot.date} onChange={(event) => setEarlySlots(earlySlots.map((row, i) => i === index ? { ...row, date: event.target.value } : row))} required />
                  <Input aria-label={`前期第${index + 1}节时间`} placeholder="18:00–19:00" value={slot.time} onChange={(event) => setEarlySlots(earlySlots.map((row, i) => i === index ? { ...row, time: event.target.value } : row))} required />
                  <Button type="button" variant="outline" disabled={earlySlots.length === 1} onClick={() => setEarlySlots(earlySlots.filter((_, i) => i !== index))}>移除</Button>
                </div>)}
              </div>
              <Button type="button" variant="outline" className="mt-3" disabled={earlySlots.length >= 199} onClick={() => setEarlySlots([...earlySlots, { date: "", time: timeRange(classTime) }])}>增加单独课次</Button>
            </div>
            <Field label={`第 ${earlySlots.length + 1} 节起：固定星期 *`}>
              <select className="h-10 w-full rounded-lg border bg-white px-3" value={regularWeekday} onChange={(event) => setRegularWeekday(Number(event.target.value))}>
                {[1,2,3,4,5,6,0].map((day) => <option key={day} value={day}>每周{"日一二三四五六"[day]}</option>)}
              </select>
            </Field>
            <Field label="固定每周上课时间 *"><Input placeholder="19:00–20:00" value={regularTime} onChange={(event) => setRegularTime(event.target.value)} required /></Field>
            <Field label="固定排课从哪天开始（可选）"><Input type="date" value={regularDate} onChange={(event) => setRegularDate(event.target.value)} /><p className="mt-1 text-sm text-slate-500">不填则从前几节课之后的下一个指定星期开始。</p></Field>
            <Field label="固定部分首次上课日期"><Input type="date" value={regularFirstDate} readOnly /></Field>
          </>
        ) : (
          <>
            <Field label="新增课次默认时间（选填）">
              <Input value={classTime} onChange={(event) => setClassTime(event.target.value)} placeholder="例如：16:00–17:30；每节时间可在下方修改" />
            </Field>
            <Field label="已选课次">
              <Input value={selectedDateKeys.length ? `${selectedDateKeys.length} 节 · ${derivedStartDate} 至 ${derivedEndDate}` : "尚未选择日期"} readOnly />
            </Field>
            <div className="sm:col-span-2 grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 lg:grid-cols-[auto_1fr]">
              <Calendar
                mode="multiple"
                locale={zhCN}
                selected={selectedDateKeys.map(localDateFromKey)}
                onSelect={(dates) => setManualSlots([...(dates ?? [])].sort((a, b) => a.getTime() - b.getTime()).map((date) => ({ date: localDateKey(date), time: manualSlots.find((slot) => slot.date === localDateKey(date))?.time || timeRange(classTime) })))}
                className="mx-auto rounded-xl border"
              />
              <div>
                <p className="text-sm font-medium text-[#102f56]">点击日历日期可选择或取消</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">系统会按日期先后排列，并自动计算开课和结课日期。</p>
                <div className="mt-3 flex max-h-64 flex-wrap gap-2 overflow-y-auto">
                  {selectedDateKeys.length ? selectedDateKeys.map((date, index) => <span key={date} className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs text-slate-700">第 {index + 1} 节 · {date}</span>) : <span className="text-sm text-amber-700">请至少选择一个上课日期。</span>}
                </div>
              </div>
            </div>
          </>
        )}
        <div className="sm:col-span-2 rounded-xl border bg-white p-4">
          <p className="font-medium text-[#174f87]">核对课表 · 共 {activeSlots.length} 节 · 预计结课 {derivedEndDate || "待安排"}</p>
          <p className="mt-1 text-sm text-slate-500">每节课可直接改日期和时间；修改后保留为逐节课表，保存时按日期排序。时间为新加坡／北京时间。</p>
          <div className="mt-3 max-h-80 space-y-2 overflow-y-auto">
            {activeSlots.map((slot, index) => <div key={index} className="grid gap-2 rounded-lg bg-slate-50 p-2 sm:grid-cols-[70px_1fr_1fr_auto] sm:items-center">
              <span className="text-sm">第 {index + 1} 节</span>
              <Input aria-label={`第${index + 1}节上课日期`} type="date" value={slot.date} onChange={(event) => editSlot(index, { date: event.target.value })} required />
              <Input aria-label={`第${index + 1}节上课时间`} placeholder="18:00–19:00" value={slot.time} onChange={(event) => editSlot(index, { time: event.target.value })} required />
              <Button type="button" variant="outline" onClick={() => { setManualSlots(activeSlots.filter((_, i) => i !== index)); setScheduleType("specific_dates"); }}>移除</Button>
            </div>)}
          </div>
          <Button type="button" variant="outline" className="mt-3" disabled={activeSlots.length >= 200} onClick={() => { setManualSlots([...activeSlots, { date: "", time: timeRange(classTime) || timeRange(regularTime) }]); setScheduleType("specific_dates"); }}>增加一节课</Button>
          {scheduleError && <p role="alert" className="mt-3 text-sm text-amber-800">{scheduleError}</p>}
        </div>
        <div className="sm:col-span-2">
          <Field label="备注">
            <Textarea name="notes" rows={2} defaultValue={classGroup?.notes} />
          </Field>
        </div>
      </div>
      <Submit saving={saving} label={classGroup ? "确认课表并保存修改" : "确认课表并保存班级"} disabled={Boolean(scheduleError)} />
    </form>
  );
}
function AssignClassForm({
  enrollment,
  classes,
  saving,
  onSubmit,
}: {
  enrollment: Row;
  classes: Row[];
  saving: boolean;
  onSubmit: React.FormEventHandler<HTMLFormElement>;
}) {
  const sameCourse = classes.filter(
    (r) => String(r.course_id) === String(enrollment.course_id),
  );
  const otherCourses = classes.filter(
    (r) => String(r.course_id) !== String(enrollment.course_id),
  );
  const option = (r: Row) => (
    <option key={r.id} value={r.id}>
      {r.course_name} · {r.name} · {r.teacher_name} · {scheduleText(r)}
    </option>
  );
  return (
    <form onSubmit={onSubmit}>
      <DialogHeader>
        <DialogTitle>加入课程班级</DialogTitle>
        <DialogDescription>
          {enrollment.student_name} · 报名课程：{enrollment.course_name} ·{" "}
          {enrollment.number}
        </DialogDescription>
      </DialogHeader>
      <input
        type="hidden"
        name="enrollmentId"
        value={enrollment.enrollment_id}
      />
      <div className="mt-5">
        <Field label="未结课班级 *">
          <select
            name="classGroupId"
            required
            className="h-10 w-full rounded-lg border bg-white px-3 text-sm"
          >
            <option value="">请选择班级</option>
            {sameCourse.length > 0 && (
              <optgroup label="报名课程的班级">
                {sameCourse.map(option)}
              </optgroup>
            )}
            {otherCourses.length > 0 && (
              <optgroup label="其他课程的班级">
                {otherCourses.map(option)}
              </optgroup>
            )}
          </select>
        </Field>
        {classes.length > 0 && (
          <p className="mt-3 text-sm text-slate-500">
            加入这个班级不会离开已有班级；原报名课程、金额、发票和业绩归属也不会改变。
          </p>
        )}
        {!classes.length && (
          <p className="mt-3 text-sm text-amber-700">
            目前还没有未结课班级，请先新建班级。
          </p>
        )}
      </div>
      <Submit saving={saving} label="确认加入班级" disabled={!classes.length} />
    </form>
  );
}
function AddClassStudentForm({
  classGroup,
  rows,
  roster,
  saving,
  onSubmit,
}: {
  classGroup: Row;
  rows: Row[];
  roster: Row[];
  saving: boolean;
  onSubmit: React.FormEventHandler<HTMLFormElement>;
}) {
  const existingStudentIds = new Set(
    roster
      .filter((r) => r.class_group_id === classGroup.id)
      .map((r) => String(r.student_id)),
  );
  const options = rows.filter(
    (r) => !existingStudentIds.has(String(r.student_id)),
  );
  return (
    <form onSubmit={onSubmit}>
      <DialogHeader>
        <DialogTitle>向班级加入学员</DialogTitle>
        <DialogDescription>
          {classGroup.course_name} · {classGroup.name}。全部在读学员档案都可以搜索；尚未登记报名的学员也能直接加入班级，不会自动生成报名或影响招生金额。
        </DialogDescription>
      </DialogHeader>
      <input type="hidden" name="classGroupId" value={classGroup.id} />
      <div className="mt-5">
        <Field label="选择学员 *">
          <SearchableSelect
            name="selectionKey"
            options={options.map((r) => ({
              value: r.enrollment_id
                ? `enrollment:${r.enrollment_id}`
                : `student:${r.student_id}`,
              label: r.enrollment_id
                ? `${r.student_name} · 家长微信 ${r.guardian_wechat_name || "待补"} · ${r.course_name} · ${r.number}`
                : `${r.student_name} · 家长微信 ${r.guardian_wechat_name || "待补"} · ${r.student_code} · 尚未登记报名`,
              keywords: `${r.student_name} ${r.guardian_wechat_name || ""} ${r.student_code || ""} ${r.course_name || ""} ${r.number || ""} ${r.classin_account || ""}`,
            }))}
            placeholder="搜索姓名、学员编号、课程、报名编号或 ClassIn 账号"
            empty="没有找到匹配的学员"
            required
          />
        </Field>
        {!options.length && (
          <p className="mt-3 text-sm text-amber-700">
            暂无可加入的学员。请先建立学员档案。
          </p>
        )}
      </div>
      <Submit saving={saving} label="确认加入班级" disabled={!options.length} />
    </form>
  );
}
function RemoveClassStudentForm({
  row,
  saving,
  onSubmit,
}: {
  row: Row;
  saving: boolean;
  onSubmit: React.FormEventHandler<HTMLFormElement>;
}) {
  return (
    <form onSubmit={onSubmit}>
      <DialogHeader>
        <DialogTitle>移出班级</DialogTitle>
        <DialogDescription>
          确认将 {row.student_name} 从 {row.class_group_name} 移出？这不会删除学员档案、报名、收款，也不会影响该学员所在的其他班级。
        </DialogDescription>
      </DialogHeader>
      <input type="hidden" name="enrollmentId" value={row.enrollment_id || ""} />
      <input type="hidden" name="studentId" value={row.student_id || ""} />
      <input type="hidden" name="classGroupId" value={row.class_group_id} />
      <input type="hidden" name="membershipId" value={row.membership_id || ""} />
      <input type="hidden" name="studentMembershipId" value={row.student_membership_id || ""} />
      <Submit saving={saving} label="确认移出班级" />
    </form>
  );
}
function CompleteClassForm({
  classGroup,
  saving,
  onSubmit,
}: {
  classGroup: Row;
  saving: boolean;
  onSubmit: React.FormEventHandler<HTMLFormElement>;
}) {
  return (
    <form onSubmit={onSubmit}>
      <DialogHeader>
        <DialogTitle>确认班级结课</DialogTitle>
        <DialogDescription>
          {classGroup.course_name} · {classGroup.name}
          。结课后，班级和学员名单继续保留并标注“已结课”，可筛选查看和下载 ClassIn 名单。
        </DialogDescription>
      </DialogHeader>
      <input type="hidden" name="id" value={classGroup.id} />
      <div className="mt-5">
        <Field label="实际结课日期 *">
          <Input name="endDate" type="date" min={classGroup.start_date || undefined} defaultValue={today()} required />
        </Field>
      </div>
      <Submit saving={saving} label="确认整班结课" />
    </form>
  );
}
function EnhancedListFilters(props: {
  rows: Row[];
  year: string;
  month: string;
  agent: string;
  sales: string;
  type: string;
  currency: string;
  startDate: string;
  endDate: string;
  showRange: boolean;
  showType: boolean;
  showAgent: boolean;
  setYear: (v: string) => void;
  setMonth: (v: string) => void;
  setAgent: (v: string) => void;
  setSales: (v: string) => void;
  setType: (v: string) => void;
  setCurrency: (v: string) => void;
  setStartDate: (v: string) => void;
  setEndDate: (v: string) => void;
}) {
  return (
    <div className="space-y-3">
      {props.showRange && (
        <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-blue-100 bg-blue-50/50 p-4">
          <Field label="报名开始日期">
            <Input
              type="date"
              value={props.startDate}
              onChange={(e) => {
                props.setStartDate(e.target.value);
                props.setYear("");
                props.setMonth("");
              }}
            />
          </Field>
          <Field label="报名结束日期">
            <Input
              type="date"
              value={props.endDate}
              onChange={(e) => {
                props.setEndDate(e.target.value);
                props.setYear("");
                props.setMonth("");
              }}
            />
          </Field>
          <Button
            variant="outline"
            onClick={() => {
              props.setStartDate(today());
              props.setEndDate(today());
              props.setYear("");
              props.setMonth("");
            }}
          >
            只看今天报名
          </Button>
          {(props.startDate || props.endDate) && (
            <Button
              variant="ghost"
              onClick={() => {
                props.setStartDate("");
                props.setEndDate("");
              }}
            >
              清除日期范围
            </Button>
          )}
        </div>
      )}
      <ListFilters
        rows={props.rows}
        year={props.year}
        month={props.month}
        agent={props.agent}
        sales={props.sales}
        type={props.type}
        currency={props.currency}
        showType={props.showType}
        showAgent={props.showAgent}
        setYear={props.setYear}
        setMonth={props.setMonth}
        setAgent={props.setAgent}
        setSales={props.setSales}
        setType={props.setType}
        setCurrency={props.setCurrency}
      />
    </div>
  );
}
function Brand() {
  return (
    <div className="mb-7 rounded-2xl bg-white p-3 shadow-[0_8px_24px_rgba(0,0,0,.12)]">
      <Image
        src={platformConfig.organization.logoPath}
        alt={platformConfig.organization.displayName}
        width={156}
        height={70}
        className="h-auto w-full"
        priority
      />
      <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
        <p className="text-[11px] font-semibold tracking-[.16em] text-[#174f87]">
          OPERATIONS
        </p>
        <span className="h-2 w-8 rounded-full bg-[#e5b529]" />
      </div>
    </div>
  );
}
function ListFilters({
  rows,
  year,
  month,
  agent,
  sales,
  type,
  currency,
  showType,
  showAgent,
  setYear,
  setMonth,
  setAgent,
  setSales,
  setType,
  setCurrency,
}: {
  rows: Row[];
  year: string;
  month: string;
  agent: string;
  sales: string;
  type: string;
  currency: string;
  showType: boolean;
  showAgent: boolean;
  setYear: (value: string) => void;
  setMonth: (value: string) => void;
  setAgent: (value: string) => void;
  setSales: (value: string) => void;
  setType: (value: string) => void;
  setCurrency: (value: string) => void;
}) {
  const dates = rows
      .map((r) =>
        String(
          r.registered_at ??
            r.first_registered_at ??
            r.followed_at ??
            r.paid_at ??
            "",
        ),
      )
      .filter(Boolean),
    years = Array.from(
      new Set([
        new Date().getFullYear().toString(),
        ...dates
          .map((value) => value.slice(0, 4))
          .filter((value) => /^\d{4}$/.test(value)),
      ]),
    ).sort((a, b) => b.localeCompare(a));
  const agents = Array.from(
    new Map(
      rows
        .map((r) => [
          r.agent_id ?? r.source_agent_id,
          r.agent_name ?? r.source_agent_name,
        ] as [string, string])
        .filter(([id]) => id),
    ).entries(),
  );
  const sellers = Array.from(
    new Map(
      rows
        .filter((r) => r.salesperson_user_id || r.owner_user_id)
        .map((r) => [
          r.salesperson_user_id ?? r.owner_user_id,
          r.salesperson_name ?? r.owner_name,
        ]),
    ).entries(),
  );
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-white p-4 shadow-[0_8px_30px_rgba(20,55,75,.04)]">
      <span className="text-sm font-medium text-slate-600">筛选</span>
      <select
        value={year}
        onChange={(e) => setYear(e.target.value)}
        className="h-10 rounded-lg border bg-white px-3 text-sm"
      >
        <option value="">全部年份</option>
        {years.map((value) => (
          <option key={value} value={value}>
            {value}年
          </option>
        ))}
      </select>
      <select
        value={month}
        onChange={(e) => setMonth(e.target.value)}
        className="h-10 rounded-lg border bg-white px-3 text-sm"
      >
        <option value="">全部月份</option>
        {Array.from({ length: 12 }, (_, index) =>
          String(index + 1).padStart(2, "0"),
        ).map((value) => (
          <option key={value} value={value}>
            {Number(value)}月
          </option>
        ))}
      </select>
      {showAgent && (
        <select
          value={agent}
          onChange={(e) => setAgent(e.target.value)}
          className="h-10 rounded-lg border bg-white px-3 text-sm"
        >
          <option value="">全部渠道</option>
          {agents.map(([id, name]) => (
            <option key={String(id)} value={String(id)}>
              {String(name)}
            </option>
          ))}
        </select>
      )}
      <select
        value={sales}
        onChange={(e) => setSales(e.target.value)}
        className="h-10 rounded-lg border bg-white px-3 text-sm"
      >
        <option value="">全部课程顾问</option>
        {sellers.map(([id, name]) => (
          <option key={String(id)} value={String(id)}>
            {String(name || "未命名")}
          </option>
        ))}
      </select>
      {showType && (
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="h-10 rounded-lg border bg-white px-3 text-sm"
        >
          <option value="">新报 + 续报</option>
          <option value="new">新报</option>
          <option value="renewal">续报</option>
        </select>
      )}
      {showType && (
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          className="h-10 rounded-lg border bg-white px-3 text-sm"
        >
          <option value="">全部币种</option>
          <option value="SGD">SGD</option>
          <option value="CNY">CNY</option>
        </select>
      )}
      {(year || month || agent || sales || type || currency) && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setYear("");
            setMonth("");
            setAgent("");
            setSales("");
            setType("");
            setCurrency("");
          }}
        >
          清除筛选
        </Button>
      )}
    </div>
  );
}
function PaymentSummary({ rows }: { rows: Row[] }) {
  const confirmed = rows.filter((row) => row.status === "confirmed");
  const totals = new Map<string, number>();
  const consultants = new Map<
    string,
    {
      id: string;
      name: string;
      currency: string;
      newTotal: number;
      renewalTotal: number;
      total: number;
    }
  >();
  const channels = new Map<
    string,
    { id: string; name: string; currency: string; total: number }
  >();
  for (const row of confirmed) {
    const currency = String(row.currency || "SGD"),
      amount = Number(row.amount_cents || 0);
    totals.set(currency, (totals.get(currency) || 0) + amount);
    const consultantId = String(row.salesperson_user_id || "unassigned"),
      consultantKey = `${consultantId}|${currency}`,
      consultant = consultants.get(consultantKey) ?? {
        id: consultantId,
        name: String(row.salesperson_name || "未分配"),
        currency,
        newTotal: 0,
        renewalTotal: 0,
        total: 0,
      };
    if (row.registration_type === "renewal") consultant.renewalTotal += amount;
    else consultant.newTotal += amount;
    consultant.total += amount;
    consultants.set(consultantKey, consultant);
    const channelId = String(row.agent_id || "direct"),
      channelKey = `${channelId}|${currency}`,
      channel = channels.get(channelKey) ?? {
        id: channelId,
        name: String(row.agent_name || "自然到访"),
        currency,
        total: 0,
      };
    channel.total += amount;
    channels.set(channelKey, channel);
  }
  const totalItems = [...totals.entries()].sort(([a], [b]) =>
      a.localeCompare(b),
    ),
    consultantItems = [...consultants.values()].sort(
      (a, b) =>
        a.name.localeCompare(b.name) || a.currency.localeCompare(b.currency),
    ),
    channelItems = [...channels.values()].sort(
      (a, b) =>
        a.name.localeCompare(b.name) || a.currency.localeCompare(b.currency),
    );
  return (
    <section className="space-y-5" aria-label="收款汇总">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {totalItems.length ? (
          totalItems.map(([currency, total]) => (
            <Metric
              key={currency}
              label={`总收入 · ${currency}`}
              value={money(total, currency)}
            />
          ))
        ) : (
          <Metric label="总收入" value="—" />
        )}
        <Metric label="已确认收款笔数" value={String(confirmed.length)} />
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="课程顾问收入汇总" subtitle="按币种拆分新报、续报与总收入">
          {consultantItems.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>课程顾问</th>
                    <th>币种</th>
                    <th>新报收入</th>
                    <th>续报收入</th>
                    <th>总收入</th>
                  </tr>
                </thead>
                <tbody>
                  {consultantItems.map((item) => (
                    <tr key={`${item.id}-${item.currency}`}>
                      <td>
                        <b>{item.name}</b>
                      </td>
                      <td className="whitespace-nowrap">{item.currency}</td>
                      <td className="whitespace-nowrap text-right tabular-nums">{money(item.newTotal, item.currency)}</td>
                      <td className="whitespace-nowrap text-right tabular-nums">{money(item.renewalTotal, item.currency)}</td>
                      <td className="whitespace-nowrap text-right tabular-nums">
                        <b>{money(item.total, item.currency)}</b>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              当前筛选范围内暂无已确认收款。
            </p>
          )}
        </Panel>
        <Panel title="渠道收入汇总" subtitle="按来源渠道和币种统计实际到账">
          {channelItems.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>渠道</th>
                    <th>币种</th>
                    <th>总收入</th>
                  </tr>
                </thead>
                <tbody>
                  {channelItems.map((item) => (
                    <tr key={`${item.id}-${item.currency}`}>
                      <td>
                        <b>{item.name}</b>
                      </td>
                      <td className="whitespace-nowrap">{item.currency}</td>
                      <td className="whitespace-nowrap text-right tabular-nums">
                        <b>{money(item.total, item.currency)}</b>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              当前筛选范围内暂无已确认收款。
            </p>
          )}
        </Panel>
      </div>
    </section>
  );
}
function ConsultantSummary({ rows, period }: { rows: Row[]; period: string }) {
  const summary = new Map<
    string,
    {
      id: string;
      name: string;
      currency: string;
      newCount: number;
      newTotal: number;
      renewalCount: number;
      renewalTotal: number;
    }
  >();
  for (const row of rows) {
    const id = String(row.salesperson_user_id || "");
    const currency = String(row.currency || "SGD");
    const key = `${id}|${currency}`;
    const item = summary.get(key) ?? {
      id,
      name: String(row.salesperson_name || "未分配"),
      currency,
      newCount: 0,
      newTotal: 0,
      renewalCount: 0,
      renewalTotal: 0,
    };
    if (row.registration_type === "renewal") {
      item.renewalCount += 1;
      item.renewalTotal += Number(row.net_amount_cents || 0) - Number(row.refunded_cents || 0);
    } else {
      item.newCount += 1;
      item.newTotal += Number(row.net_amount_cents || 0) - Number(row.refunded_cents || 0);
    }
    summary.set(key, item);
  }
  const items = [...summary.values()].sort(
    (a, b) =>
      a.name.localeCompare(b.name) || a.currency.localeCompare(b.currency),
  );
  return (
    <Panel
      title="课程顾问成单汇总"
      subtitle={`${period || "全部期间"} · 课程顾问按工资管理，本表只统计业绩，不计算佣金。`}
    >
      {items.length ? (
        <div className="table-scroll">
          <table className="consultant-summary-table">
            <thead>
              <tr>
                <th>课程顾问</th>
                <th>币种</th>
                <th className="text-right">新报</th>
                <th className="text-right">续报</th>
                <th className="text-right">总成单</th>
                <th className="text-right">总金额</th>
                <th>导出</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const own = rows.filter(
                  (row) =>
                    String(row.salesperson_user_id || "") === item.id &&
                    String(row.currency || "SGD") === item.currency,
                );
                return (
                  <tr key={`${item.id}-${item.currency}`}>
                    <td>
                      <b>{item.name}</b>
                    </td>
                    <td className="whitespace-nowrap font-medium">{item.currency}</td>
                    <td className="whitespace-nowrap text-right tabular-nums">
                      <b>{item.newCount} 单</b>
                      <small>{money(item.newTotal, item.currency)}</small>
                    </td>
                    <td className="whitespace-nowrap text-right tabular-nums">
                      <b>{item.renewalCount} 单</b>
                      <small>{money(item.renewalTotal, item.currency)}</small>
                    </td>
                    <td className="whitespace-nowrap text-right font-semibold tabular-nums">{item.newCount + item.renewalCount} 单</td>
                    <td className="whitespace-nowrap text-right font-semibold tabular-nums">
                      {money(item.newTotal + item.renewalTotal, item.currency)}
                    </td>
                    <td>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          exportEnrollments(
                            own,
                            `${period || "全部期间"}-${item.name}-${item.currency}-成单`,
                          )
                        }
                      >
                        导出该顾问
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-slate-500">当前筛选范围内暂无成单。</p>
      )}
    </Panel>
  );
}
function parseAuditDetail(value: unknown): Row {
  try { return JSON.parse(String(value || "{}")) as Row; } catch { return { raw: String(value || "") }; }
}
function parseScreenshotFiles(value: unknown): Row[] {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed)
      ? parsed.filter((item) => item && typeof item.id === "string")
      : [];
  } catch {
    return [];
  }
}
function auditActionName(value: string) {
  return ({ create: "新增", invite: "邀请", activate: "激活", restore: "恢复", update: "修改", assign: "分配", transfer: "交接", complete: "结课", cancel: "撤销", delete: "删除", ai_import: "AI 导入" } as Record<string, string>)[value] ?? value;
}
function auditEntityName(value: string) {
  return ({ student: "学员档案", enrollment: "报名记录", payment: "收款记录", refund: "退费记录", student_followup: "客户跟进", course: "课程", class_group: "班级", enrollment_class: "报名班级", enrollment_roster: "在读名单", agent: "渠道", member: "员工账号", member_customers: "客户交接", invoice: "客户发票", agent_statement: "渠道结算单" } as Record<string, string>)[value] ?? value;
}
function formatAuditTime(value: unknown) {
  const raw = String(value || "");
  const date = new Date(raw.includes("T") ? raw : `${raw.replace(" ", "T")}Z`);
  return Number.isNaN(date.getTime()) ? raw : date.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
}
function auditDetailText(detail: Row) {
  if (detail.before && detail.after) {
    const before = detail.before as Row, after = detail.after as Row;
    const changed = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).filter((key) => String(before[key] ?? "") !== String(after[key] ?? ""));
    return changed.length ? changed.map((key) => `${auditFieldName(key)}：${auditValue(before[key])} → ${auditValue(after[key])}`).join("；") : "已保存，内容无变化";
  }
  if (detail.after) {
    return Object.entries(detail.after as Row).map(([key, value]) => `${auditFieldName(key)}：${auditValue(value)}`).join("；");
  }
  const hidden = new Set(["label", "before", "after", "raw"]);
  const items = Object.entries(detail).filter(([key]) => !hidden.has(key)).slice(0, 10);
  return items.length ? items.map(([key, value]) => `${auditFieldName(key)}：${auditValue(value)}`).join("；") : String(detail.raw || "已记录操作");
}
function auditValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "空";
  if (Array.isArray(value)) return `${value.length} 项`;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
function auditFieldName(value: string) {
  return ({ role: "角色", status: "状态", number: "编号", code: "编号", name: "名称", fullName: "姓名", displayName: "姓名", email: "邮箱", amount: "金额", amountCents: "金额（分）", net: "应收（分）", total: "合计（分）", currency: "币种", paidAt: "到账日期", method: "方式", reference: "交易编号", enrollmentId: "报名ID", enrollmentNumber: "报名编号", studentId: "学员ID", classGroupId: "班级ID", classGroupName: "班级", classCourseName: "班级课程", enrollmentCourseName: "报名课程", enrollmentIds: "报名记录", lessonCount: "总节数", exportedAt: "导出时间", followedAt: "跟进日期", salesperson: "课程顾问", period: "期间", agentId: "渠道ID", agentName: "渠道", invoiceDate: "发票日期", paymentId: "收款ID", source: "来源", jobId: "导入任务", endDate: "结课日期", customerCount: "客户数", fromName: "原负责人", toName: "接手人", deleteSource: "删除原账号", hasRegistrationScreenshot: "报名凭证", paymentScreenshotCount: "付款截图数量", paymentScreenshotNames: "付款截图文件" } as Record<string, string>)[value] ?? value;
}
function formatTotals(rows: Row[] | undefined) {
  if (!rows?.length) return "—";
  return rows
    .map((row) => money(Number(row.total || 0), String(row.currency || "SGD")))
    .join(" · ");
}
function formatCommissionTotals(value: unknown) {
  try {
    const rows = JSON.parse(String(value || "[]")) as Row[];
    if (!Array.isArray(rows) || !rows.length) return money(0, "CNY");
    return rows
      .map((row) => money(Number(row.amount_cents || 0), String(row.currency || "CNY")))
      .join(" · ");
  } catch {
    return money(0, "CNY");
  }
}
function exportStudents(rows: Row[]) {
  exportCsv(
    `学员名单-${today()}.csv`,
    [
      "学员编号",
      "孩子姓名",
      "英文名",
      "年级",
      "学校",
      "ClassIn账号",
      "首次登记日期",
      "家长姓名",
      "家长微信名",
      "电话",
      "负责课程顾问",
      "首次来源渠道",
      "转介绍家长微信",
      "报名次数",
    ],
    rows.map((r) => [
      r.code,
      r.full_name,
      r.english_name,
      r.grade,
      r.school,
      r.classin_account,
      r.first_registered_at,
      r.guardian_name,
      r.guardian_wechat_name,
      r.guardian_phone,
      r.owner_name,
      r.source_agent_name || "自然到访",
      r.referral_parent_wechat,
      r.enrollment_count,
    ]),
  );
}
function exportEnrollments(rows: Row[], label = "成单记录") {
  exportCsv(
    `${safeFilename(label)}-${today()}.csv`,
    [
      "报名日期",
      "报名编号",
      "学员",
      "家长微信",
      "课程",
      "新报/续报",
      "币种",
      "课节数",
      "课程原价",
      "实际收款金额",
      "已确认退费",
      "实际净收入",
      "课程顾问",
      "报名渠道",
      "预计结课",
      "状态",
    ],
    rows.map((r) => [
      r.registered_at,
      r.number,
      r.student_name,
      r.guardian_wechat_name,
      r.course_name,
      registrationName(r.registration_type),
      r.currency,
      Number(r.quantity || 0),
      Number(r.list_amount_cents || 0) / 100,
      Number(r.paid_cents || 0) / 100,
      Number(r.refunded_cents || 0) / 100,
      (Number(r.paid_cents || 0) - Number(r.refunded_cents || 0)) / 100,
      r.salesperson_name,
      r.agent_name,
      r.expected_end_date,
      r.status,
    ]),
  );
}
function exportFollowups(rows: Row[]) {
  exportCsv(
    `客户跟进-${today()}.csv`,
    [
      "跟进日期",
      "学员编号",
      "学员姓名",
      "家长微信",
      "年级",
      "方式",
      "跟进内容",
      "负责课程顾问",
      "下次跟进日期",
    ],
    rows.map((r) => [
      r.followed_at,
      r.student_code,
      r.student_name,
      r.guardian_wechat_name,
      r.grade,
      r.method,
      r.note,
      r.salesperson_name,
      r.next_follow_up_at,
    ]),
  );
}
function safeFilename(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "-").slice(0, 100) || "导出";
}
function exportCsv(filename: string, headers: string[], rows: unknown[][]) {
  const cell = (value: unknown) => {
    let text = String(value ?? "");
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  const csv = `\uFEFF${[headers, ...rows].map((row) => row.map(cell).join(",")).join("\r\n")}`;
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card className="border-0 shadow-[0_8px_30px_rgba(20,55,75,.06)]">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-500">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tracking-tight">{value}</p>
      </CardContent>
    </Card>
  );
}
function Panel({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="border-0 shadow-[0_8px_30px_rgba(20,55,75,.06)]">
      <CardHeader className="flex-col items-stretch justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          {subtitle && (
            <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
          )}
        </div>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
function Empty({
  icon: Icon,
  text,
}: {
  icon: typeof UsersRound;
  text: string;
}) {
  return (
    <div className="grid min-h-52 place-items-center rounded-xl border border-dashed border-[#cdd9e7] bg-slate-50/70 p-8 text-center">
      <div>
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#fff3c4] text-[#174f87]">
          <Icon className="h-6 w-6" />
        </span>
        <p className="mt-4 text-sm text-slate-500">{text}</p>
      </div>
    </div>
  );
}
function ListPagination({
  page,
  totalPages,
  totalItems,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  totalItems: number;
  onPageChange: (page: number) => void;
}) {
  const pageNumbers = Array.from(
    new Set([1, page - 1, page, page + 1, totalPages]),
  )
    .filter((value) => value >= 1 && value <= totalPages)
    .sort((a, b) => a - b);

  const goToPage = (nextPage: number) => {
    onPageChange(Math.min(Math.max(nextPage, 1), totalPages));
  };

  return (
    <div className="mt-5 flex flex-col items-center gap-3 border-t border-slate-200 pt-4">
      <p className="text-sm text-slate-500">
        共 {totalItems} 条 · 第 {page} / {totalPages} 页 · 每页最多 {PAGE_SIZE} 条
      </p>
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationLink
              href="#"
              size="default"
              aria-label="上一页"
              aria-disabled={page === 1}
              className={page === 1 ? "pointer-events-none opacity-50" : ""}
              onClick={(event) => {
                event.preventDefault();
                goToPage(page - 1);
              }}
            >
              上一页
            </PaginationLink>
          </PaginationItem>
          {pageNumbers.map((pageNumber, index) => (
            <span key={pageNumber} className="contents">
              {index > 0 && pageNumber - pageNumbers[index - 1] > 1 && (
                <PaginationItem>
                  <PaginationEllipsis />
                </PaginationItem>
              )}
              <PaginationItem>
                <PaginationLink
                  href="#"
                  isActive={pageNumber === page}
                  aria-label={`第 ${pageNumber} 页`}
                  onClick={(event) => {
                    event.preventDefault();
                    goToPage(pageNumber);
                  }}
                >
                  {pageNumber}
                </PaginationLink>
              </PaginationItem>
            </span>
          ))}
          <PaginationItem>
            <PaginationLink
              href="#"
              size="default"
              aria-label="下一页"
              aria-disabled={page === totalPages}
              className={
                page === totalPages ? "pointer-events-none opacity-50" : ""
              }
              onClick={(event) => {
                event.preventDefault();
                goToPage(page + 1);
              }}
            >
              下一页
            </PaginationLink>
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}
function Status({ value }: { value: string }) {
  const label: Record<string, string> = {
    active: "进行中",
    completed: "已结课",
    confirmed: "已确认",
    void: "已作废",
    disabled: "已停用",
    pending: "待确认",
    partial_refund: "部分退费",
    refunded: "已全额退费",
    cancelled: "已撤销",
  };
  return (
    <Badge
      variant={
        value === "void" || value === "disabled" ? "destructive" : "secondary"
      }
    >
      {label[value] ?? value}
    </Badge>
  );
}
function Loading() {
  return (
    <div className="grid min-h-96 place-items-center text-sm text-slate-500">
      正在读取工作台…
    </div>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
function SearchableSelect({
  name,
  options,
  placeholder,
  empty,
  required = false,
  disabled = false,
  value,
  onValueChange,
}: {
  name: string;
  options: SearchOption[];
  placeholder: string;
  empty: string;
  required?: boolean;
  disabled?: boolean;
  value?: string;
  onValueChange?: (value: string) => void;
}) {
  const portalContainer = useRef<HTMLDivElement>(null);
  const selectedOption = options.find((option) => option.value === value) ?? null;
  return (
    <div ref={portalContainer}>
      <Combobox<SearchOption>
        name={name}
        items={options}
        {...(value !== undefined
          ? {
              value: selectedOption,
              onValueChange: (option: SearchOption | null) =>
                onValueChange?.(option?.value ?? ""),
            }
          : {})}
        required={required}
        autoHighlight
        itemToStringLabel={(option) => option.label}
        itemToStringValue={(option) => option.value}
        isItemEqualToValue={(option, value) => option.value === value.value}
        filter={(option, query) =>
          `${option.label} ${option.keywords}`
            .toLocaleLowerCase()
            .includes(query.trim().toLocaleLowerCase())
        }
      >
        <ComboboxInput
          className="h-10 w-full bg-white"
          placeholder={placeholder}
          showClear
          disabled={disabled}
        />
        <ComboboxContent container={portalContainer}>
          <ComboboxEmpty>{empty}</ComboboxEmpty>
          <ComboboxList>
            {(option: SearchOption) => (
              <ComboboxItem key={option.value} value={option}>
                {option.label}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  );
}
function Submit({
  saving,
  label,
  disabled = false,
  sticky = false,
}: {
  saving: boolean;
  label: string;
  disabled?: boolean;
  sticky?: boolean;
}) {
  return (
    <div className={`mt-6 flex justify-end ${sticky ? "sticky bottom-0 z-10 -mx-6 border-t bg-white/95 px-6 py-4 shadow-[0_-8px_24px_rgba(15,23,42,.08)] backdrop-blur" : ""}`}>
      <Button type="submit" disabled={saving || disabled}>
        {saving ? "保存中…" : label}
      </Button>
    </div>
  );
}
function PendingAccess({ user }: { user: ChatGPTUser }) {
  return (
    <main className="grid min-h-screen place-items-center bg-[#f5f7fb] p-6">
      <Card className="w-full max-w-lg overflow-hidden border-0 shadow-xl">
        <div className="h-2 bg-[linear-gradient(90deg,#174f87_0_70%,#e5b529_70%)]" />
        <CardHeader>
          <Image
            src={platformConfig.organization.logoPath}
            alt={platformConfig.organization.displayName}
            width={156}
            height={70}
            className="mb-4 h-auto w-36"
          />
          <CardTitle>账号等待授权</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="leading-7 text-slate-600">
            {user.email}{" "}
            已完成登录。请让系统管理员在“课程与权限”中分配课程顾问、财务、教务运营、教务运营财务或管理员权限。
          </p>
          <a
            className="mt-6 inline-flex text-sm font-medium text-[#174f87] hover:underline"
            href="/signout-with-chatgpt?return_to=/"
          >
            退出并更换账号
          </a>
        </CardContent>
      </Card>
    </main>
  );
}
