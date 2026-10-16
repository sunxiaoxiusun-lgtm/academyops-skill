"use client";

import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function InvoiceActions({invoiceId}:{invoiceId:string}) {
  return <div className="flex flex-wrap items-center justify-end gap-2"><a className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50" href={`/api/invoice/${invoiceId}/word`}><Download className="mr-2 h-4 w-4"/>Download Editable Word</a><Button onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" />Print / Save PDF</Button></div>;
}
