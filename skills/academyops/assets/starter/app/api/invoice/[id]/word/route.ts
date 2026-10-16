import platformConfig from "@/platform.config.json";
import { getD1 } from "@/db";
import { allow, apiFailure, ApiError, requireMember } from "@/app/lib/authz";
import { buildAgentStatementDocx, buildInvoiceDocx } from "@/app/lib/invoice-docx";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const member=await requireMember(),{id}=await params;
    const invoice=await getD1().prepare(`SELECT i.*,e.salesperson_user_id,e.created_by enrollment_created_by FROM invoices i LEFT JOIN enrollments e ON e.id=i.enrollment_id WHERE i.id=?`).bind(id).first<Row>();
    if(!invoice)throw new ApiError(404,"发票不存在");
    if(member.role==="sales"&&invoice.salesperson_user_id!==member.userId&&invoice.enrollment_created_by!==member.userId)throw new ApiError(403,"你不能下载其他课程顾问的发票");
    allow(member,["admin","finance","sales","operations_finance"]);
    const snapshot=JSON.parse(String(invoice.snapshot_json||"{}")) as Row;
    let seal:Uint8Array|undefined;
    try{if(platformConfig.organization.sealPath){const response=await fetch(new URL(platformConfig.organization.sealPath,request.url));if(response.ok)seal=new Uint8Array(await response.arrayBuffer());}}catch{/* The invoice remains valid if the seal asset is temporarily unavailable. */}
    const bytes=invoice.type==="agent_statement"?buildAgentStatementDocx(invoice,snapshot,seal):buildInvoiceDocx(invoice,snapshot,seal),body=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) as ArrayBuffer;
    const filename=String(invoice.number||"invoice").replace(/[^A-Za-z0-9._-]/g,"-");
    return new Response(body,{headers:{"Content-Type":"application/vnd.openxmlformats-officedocument.wordprocessingml.document","Content-Disposition":`attachment; filename="${filename}.docx"`,"Cache-Control":"private, no-store"}});
  }catch(error){return apiFailure(error);}
}
