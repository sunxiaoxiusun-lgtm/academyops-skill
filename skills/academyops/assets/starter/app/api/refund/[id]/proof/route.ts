import { getBucket, getD1 } from "@/db";
import { allow, apiFailure, ApiError, requireMember } from "@/app/lib/authz";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const member = await requireMember();
    allow(member, ["admin", "finance", "sales", "operations", "operations_finance"]);
    const { id } = await params;
    const refund = await getD1()
      .prepare(
        `SELECT r.proof_object_key,r.proof_file_name,r.proof_content_type,e.salesperson_user_id,e.created_by
        FROM refunds r JOIN enrollments e ON e.id=r.enrollment_id WHERE r.id=?`,
      )
      .bind(id)
      .first<Record<string, string>>();
    if (!refund) throw new ApiError(404, "退费记录不存在");
    if (member.role === "sales" && refund.salesperson_user_id !== member.userId && refund.created_by !== member.userId)
      throw new ApiError(403, "你不能查看其他课程顾问的退款凭证");
    if (!refund.proof_object_key) throw new ApiError(404, "这条退费没有上传退款凭证");
    const object = await getBucket().get(refund.proof_object_key);
    if (!object) throw new ApiError(404, "退款凭证文件不存在");
    return new Response(object.body, {
      headers: {
        "Content-Type": refund.proof_content_type || object.httpMetadata?.contentType || "application/octet-stream",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(refund.proof_file_name || "refund-proof")}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return apiFailure(error);
  }
}
