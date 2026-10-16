import platformConfig from "@/platform.config.json";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { getD1 } from "@/db";
import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { allow, requireMember } from "@/app/lib/authz";
import { InvoiceActions } from "./print-button";

export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

const money = (cents: unknown, currency: unknown) => {
  const code = String(currency || "SGD");
  const symbol = code === "CNY" ? "¥" : "$";
  return `${code} ${symbol}${(Number(cents || 0) / 100).toLocaleString("en-SG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const date = (value: unknown) => { const parsed=new Date(`${String(value??"").slice(0,10)}T00:00:00Z`);return Number.isNaN(parsed.valueOf())?String(value??""):parsed.toLocaleDateString("en-US",{year:"numeric",month:"long",day:"numeric",timeZone:"UTC"}); };

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireChatGPTUser(`/invoice/${id}`);
  const member = await requireMember();
  const invoice = await getD1().prepare(`SELECT i.*,e.salesperson_user_id,e.created_by enrollment_created_by,a.name agent_name
    FROM invoices i LEFT JOIN enrollments e ON e.id=i.enrollment_id LEFT JOIN agents a ON a.id=i.agent_id WHERE i.id=?`).bind(id).first<Row>();
  if (!invoice) notFound();
  if (member.role === "sales" && invoice.salesperson_user_id !== member.userId && invoice.enrollment_created_by !== member.userId) notFound();
  if (invoice.type === "agent_statement") allow(member, ["admin", "finance", "operations_finance"]);
  const snapshot = JSON.parse(String(invoice.snapshot_json || "{}")) as Row;
  const isAgent = invoice.type === "agent_statement";

  return <main className="min-h-screen bg-slate-100 p-4 print:bg-white print:p-0 sm:p-8">
    <div className="mx-auto mb-4 flex max-w-[850px] items-center justify-between gap-4 print:hidden"><Link className="text-sm font-medium text-[#1f4e78] hover:underline" href="/">← Back to Workbench</Link><InvoiceActions invoiceId={id}/></div>
    <article className="mx-auto min-h-[1100px] max-w-[850px] bg-white px-8 py-10 font-[Arial] text-slate-900 shadow-sm print:min-h-0 print:max-w-none print:px-0 print:py-0 print:shadow-none sm:px-14 sm:py-12">
      {isAgent ? <AgentStatement invoice={invoice} snapshot={snapshot}/> : <CustomerInvoice invoice={invoice} snapshot={snapshot}/>}
    </article>
  </main>;
}

function CustomerInvoice({invoice,snapshot}:{invoice:Row;snapshot:Row}){
  const details=(snapshot.invoice??{}) as Row;
  const quantity=Number(details.quantity??snapshot.quantity??1),currency=details.currency??invoice.currency??snapshot.currency??"SGD";
  const amount=Number(details.amountCents??invoice.total_cents??snapshot.invoice_amount_cents??0),tax=Number(details.taxCents??0),total=Number(details.totalCents??invoice.total_cents??amount+tax),rate=Number(details.rateCents??Math.round(amount/Math.max(quantity,1))),taxPercent=Number(details.taxPercent??0);
  const billTo=details.billTo??snapshot.guardian_name??snapshot.student_name??"—",description=details.description??snapshot.course_name??"Course Fee";
  const invoiceDate=details.invoiceDate??String(invoice.created_at??"").slice(0,10);
  return <>
    <header className="flex items-start justify-between gap-8"><h1 className="pt-2 text-xl font-bold text-[#1f4e78]">{platformConfig.organization.legalName}</h1><p className="text-right text-5xl font-bold tracking-[.08em] text-[#1f4e78]">INVOICE</p></header>
    <section className="mt-8 grid grid-cols-2 border border-slate-300 text-sm sm:grid-cols-4"><Meta label="Invoice Date" value={date(invoiceDate)}/><Meta label="Invoice No" value={invoice.number}/></section>
    <section className="mt-8 grid gap-8 sm:grid-cols-2"><InfoBlock title="BILL TO" lines={[billTo]}/><InfoBlock title="FROM" lines={[platformConfig.organization.legalName]}/></section>
    <table className="mt-8 w-full table-fixed border-collapse border border-slate-300 text-sm"><thead><tr className="bg-[#1f4e78] text-left text-white"><th className="w-[55%] px-3 py-3">Description</th><th className="w-[11%] px-3 py-3 text-center">Qty</th><th className="w-[17%] px-3 py-3 text-right">Rate</th><th className="w-[17%] px-3 py-3 text-right">Amount</th></tr></thead><tbody><tr className="align-top"><td className="min-h-28 whitespace-pre-line border-r border-slate-300 px-3 py-4 leading-6">{String(description)}</td><td className="border-r border-slate-300 px-3 py-4 text-center">{quantity.toLocaleString("en-SG")}</td><td className="border-r border-slate-300 px-3 py-4 text-right">{money(rate,currency)}</td><td className="px-3 py-4 text-right">{money(amount,currency)}</td></tr></tbody></table>
    <section className="ml-auto mt-6 w-full max-w-sm space-y-2 text-sm"><TotalLine label="Subtotal" value={money(amount,currency)}/><TotalLine label={`Tax (${taxPercent.toLocaleString("en-SG")}%)`} value={money(tax,currency)}/><div className="mt-2 flex items-center justify-between border-t-2 border-[#1f4e78] pt-3 text-lg font-bold text-[#1f4e78]"><span>TOTAL</span><span>{money(total,currency)}</span></div></section>
    <section className="mt-10 grid gap-6 sm:grid-cols-2"><InfoBlock title="Payment Terms" lines={[details.paymentTerms??"Due upon receipt"]}/><InfoBlock title="Currency" lines={[currency]}/></section>
    {details.notes?<section className="mt-6 text-sm"><p className="font-bold text-slate-600">Notes</p><p className="mt-1 whitespace-pre-line text-slate-700">{String(details.notes)}</p></section>:null}
    <section className="mt-10 flex items-end justify-between gap-8"><p className="pb-5 text-base font-bold text-[#1f4e78]">Thank you for your business!</p>{platformConfig.organization.sealPath ? <Image src={platformConfig.organization.sealPath} alt="Organization seal" width={122} height={122}/> : null}</section>
  </>;
}

function AgentStatement({invoice,snapshot}:{invoice:Row;snapshot:Row}){
  const agent=(snapshot.agent??{}) as Row,lines=(snapshot.lines??[]) as Row[];
  const exchangeRate=(snapshot.exchange_rate??{}) as Row;
  const tuitionTotal=lines.reduce((sum,line)=>sum+Number(line.converted_basis_cents??line.basis_cents??0),0),period=String(snapshot.period??invoice.period??"");
  const issueDate=String(invoice.created_at??"").slice(0,10),due=new Date(`${issueDate}T00:00:00Z`);due.setUTCDate(due.getUTCDate()+8);
  const periodLabel=new Date(`${period}-01T00:00:00Z`).toLocaleDateString("en-US",{year:"numeric",month:"long",timeZone:"UTC"});
  const rateText=exchangeRate.applied===false?"No SGD conversion required":`1 SGD = ${Number(exchangeRate.rate??1).toFixed(4)} CNY`;
  return <>
    <header className="flex items-start justify-between gap-8 border-b-2 border-[#c89b3c] pb-5"><div><h1 className="text-3xl font-bold uppercase text-[#17365d]">{String(agent.name||"Channel Partner")}</h1><p className="mt-1 text-sm text-slate-500">Education Referral Partner</p></div><p className="text-right text-5xl font-bold tracking-[.08em] text-[#c89b3c]">INVOICE</p></header>
    <section className="mt-8 grid gap-8 sm:grid-cols-2"><InfoBlock title="BILL TO" lines={[platformConfig.organization.legalName, platformConfig.organization.registrationNumber, ...platformConfig.organization.invoiceAddressLines]}/><div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm"><b>Invoice No.</b><span>{String(invoice.number)}</span><b>Invoice Date</b><span>{date(issueDate)}</span><b>Period</b><span>{periodLabel}</span><b>Due Date</b><span>{date(due.toISOString().slice(0,10))}</span></div></section>
    <section className="mt-8 flex items-center justify-between bg-[#17365d] px-5 py-4 font-bold text-white"><span>AMOUNT DUE (CNY)</span><span className="text-xl">{money(invoice.total_cents,"CNY")}</span></section>
    <section className="mt-5 rounded-lg border border-[#e8d39f] bg-[#fff9e8] px-4 py-3 text-sm text-slate-700"><b className="text-[#17365d]">Exchange rate:</b> {rateText}<span className="ml-2 text-slate-500">Rate date {String(exchangeRate.date||issueDate)} · {String(exchangeRate.source||"Daily reference rate")}</span></section>
    <section className="mt-7 flex items-start justify-between gap-8"><div><h2 className="font-bold text-[#17365d]">{periodLabel} referral commission</h2><p className="mt-1 text-sm text-slate-500">{lines.length} enrollment{lines.length===1?"":"s"} · settled in CNY</p></div><b className="text-[#17365d]">{money(invoice.total_cents,"CNY")}</b></section>
    <h2 className="mt-8 text-sm font-bold text-[#c89b3c]">SUPPORTING DETAILS</h2>
    <div className="overflow-x-auto"><table className="mt-3 w-full min-w-[760px] border-collapse text-sm"><thead><tr className="bg-[#17365d] text-left text-white"><th className="p-3">#</th><th className="p-3">Course / Class</th><th className="p-3">Student</th><th className="p-3 text-right">Original tuition</th><th className="p-3 text-right">Original commission</th><th className="p-3 text-center">Rate</th><th className="p-3 text-right">Commission CNY</th></tr></thead><tbody>{lines.map((line,index)=><tr key={String(line.commission_id)} className="border-b even:bg-slate-50"><td className="p-3 text-center">{index+1}</td><td className="p-3">{String(line.course_name)}<small className="block text-slate-500">{String(line.registered_at)}</small></td><td className="p-3">{String(line.student_name)}<small className="block text-slate-500">{String(line.enrollment_number)}</small></td><td className="p-3 text-right">{money(line.basis_cents,line.original_currency??line.currency)}</td><td className="p-3 text-right">{money(line.amount_cents,line.original_currency??line.currency)}</td><td className="p-3 text-center">{Number(line.exchange_rate_to_cny??1).toFixed(4)}</td><td className="p-3 text-right font-semibold text-[#17365d]">{money(line.converted_amount_cents??line.amount_cents,"CNY")}</td></tr>)}</tbody></table></div>
    <div className="ml-auto mt-6 max-w-sm space-y-2 text-sm"><TotalLine label="Eligible tuition after conversion" value={money(tuitionTotal,"CNY")}/><div className="flex justify-between border-t-2 border-[#17365d] pt-3 text-lg font-bold text-[#17365d]"><span>TOTAL AMOUNT DUE</span><span>{money(invoice.total_cents,"CNY")}</span></div></div>
    <section className="mt-12 break-before-page"><h2 className="text-sm font-bold text-[#c89b3c]">PAYMENT DETAILS</h2><div className="mt-3 grid grid-cols-[auto_1fr] gap-x-8 gap-y-2 text-sm"><b className="text-slate-500">Payee</b><span>{String(agent.name||"—")}</span><b className="text-slate-500">Contact</b><span>{String(agent.contact||"—")}</span><b className="text-slate-500">Settlement currency</b><span>CNY</span></div></section><p className="mt-16 font-bold text-[#17365d]">Thank you.</p>
  </>;
}

function Meta({label,value}:{label:string;value:unknown}){return <><div className="bg-[#eaf2f8] px-3 py-2 font-semibold text-slate-600">{label}</div><div className="px-3 py-2">{String(value??"—")}</div></>}
function InfoBlock({title,lines}:{title:string;lines:unknown[]}){return <div><h2 className="text-sm font-bold text-[#1f4e78]">{title}</h2>{lines.filter(Boolean).map((line,index)=><p className="mt-1 text-sm leading-6" key={index}>{String(line)}</p>)}</div>}
function TotalLine({label,value}:{label:string;value:string}){return <div className="flex items-center justify-between"><span>{label}</span><span>{value}</span></div>}
