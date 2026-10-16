import { getChatGPTUser } from "../chatgpt-auth";
import { getD1 } from "@/db";

export type Role = "admin" | "finance" | "sales" | "operations" | "operations_finance" | "pending";
export type Member = { id: string; userId: string; email: string; displayName: string; role: Role; status: string };

export async function requireMember(): Promise<Member> {
  const user = await getChatGPTUser();
  if (!user) throw new ApiError(401, "请先登录");
  const db = getD1();
  const existing = await db.prepare("SELECT id, user_id, email, display_name, role, status FROM members WHERE user_id = ?").bind(user.userId).first<Record<string, string>>();
  if (existing) {
    if (existing.status !== "active") throw new ApiError(403, "此账号已停用");
    return mapMember(existing);
  }

  const invited = await db.prepare("SELECT id, user_id, email, display_name, role, status FROM members WHERE lower(email) = lower(?) AND status!='deleted' ORDER BY created_at LIMIT 1")
    .bind(user.email.trim()).first<Record<string, string>>();
  if (invited) {
    if (invited.status === "disabled") throw new ApiError(403, "此账号已停用，请联系系统管理员");
    if (!invited.user_id.startsWith("invite:")) throw new ApiError(403, "该邮箱已绑定其他登录账号，请联系系统管理员");
    await db.batch([
      db.prepare("UPDATE members SET user_id=?,status='active',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(user.userId, invited.id),
      db.prepare("INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,detail_json) VALUES (?,?,?,?,?,?)").bind(crypto.randomUUID(),user.userId,"activate","member",invited.id,JSON.stringify({label:`${invited.display_name} ${invited.email}`,before:{status:invited.status},after:{status:"active"}})),
    ]);
    return mapMember({ ...invited, user_id: user.userId, status: "active" });
  }

  const count = await db.prepare("SELECT COUNT(*) AS total FROM members").first<{ total: number }>();
  if (Number(count?.total ?? 0) > 0) throw new ApiError(403, "你的邮箱尚未获得访问权限，请联系系统管理员添加账号");
  const role: Role = "admin";
  const id = crypto.randomUUID();
  await db.batch([
    db.prepare("INSERT INTO members (id, user_id, email, display_name, role, status) VALUES (?, ?, ?, ?, ?, 'active')").bind(id, user.userId, user.email.trim().toLowerCase(), user.displayName, role),
    db.prepare("INSERT INTO audit_logs (id,user_id,action,entity_type,entity_id,detail_json) VALUES (?,?,?,?,?,?)").bind(crypto.randomUUID(),user.userId,"create","member",id,JSON.stringify({label:`${user.displayName} ${user.email}`,role,status:"active",source:"initial_admin"})),
  ]);
  return { id, userId: user.userId, email: user.email, displayName: user.displayName, role, status: "active" };
}

export function allow(member: Member, roles: Role[]) {
  if (!roles.includes(member.role)) throw new ApiError(403, "你没有执行此操作的权限");
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) { super(message); }
}

export function apiFailure(error: unknown) {
  if (error instanceof ApiError) return Response.json({ error: error.message, details: error.details }, { status: error.status });
  console.error(error);
  return Response.json({ error: "暂时无法完成操作，请稍后重试" }, { status: 500 });
}

function mapMember(row: Record<string, string>): Member {
  return { id: row.id, userId: row.user_id, email: row.email, displayName: row.display_name, role: row.role as Role, status: row.status };
}
