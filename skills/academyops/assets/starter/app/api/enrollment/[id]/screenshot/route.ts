import { getBucket, getD1 } from "@/db";
import { allow, apiFailure, ApiError, requireMember } from "@/app/lib/authz";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const member = await requireMember();
    allow(member, ["admin", "finance", "sales", "operations", "operations_finance"]);
    const { id } = await params;
    const enrollment = await getD1().prepare("SELECT salesperson_user_id,created_by,registration_screenshot_key,registration_screenshot_name,registration_screenshot_type FROM enrollments WHERE id=?")
      .bind(id).first<Record<string, string>>();
    if (!enrollment) throw new ApiError(404, "报名记录不存在");
    if (member.role === "sales" && enrollment.salesperson_user_id !== member.userId && enrollment.created_by !== member.userId) throw new ApiError(403, "你不能查看其他课程顾问的报名截图");
    const fileId = new URL(request.url).searchParams.get("fileId");
    const attachment = fileId
      ? await getD1().prepare("SELECT object_key,file_name,content_type FROM enrollment_screenshots WHERE id=? AND enrollment_id=?")
          .bind(fileId, id).first<Record<string, string>>()
      : null;
    if (fileId && !attachment) throw new ApiError(404, "付款截图不存在");
    const objectKey = attachment?.object_key || enrollment.registration_screenshot_key;
    if (!objectKey) throw new ApiError(404, "这条报名没有上传付款截图");
    const object = await getBucket().get(objectKey);
    if (!object) throw new ApiError(404, "付款截图文件不存在");
    const fileName = attachment?.file_name || enrollment.registration_screenshot_name || "payment-proof";
    return new Response(object.body, {
      headers: {
        "Content-Type": attachment?.content_type || enrollment.registration_screenshot_type || object.httpMetadata?.contentType || "application/octet-stream",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) { return apiFailure(error); }
}
