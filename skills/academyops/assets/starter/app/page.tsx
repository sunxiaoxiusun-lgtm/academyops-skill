import platformConfig from "@/platform.config.json";
import { chatGPTSignInPath, getChatGPTUser } from "./chatgpt-auth";
import { WorkbenchShell } from "./workbench-shell";
import Image from "next/image";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getChatGPTUser();

  if (!user) {
    return (
      <main className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_top_left,#fff0ad_0,transparent_30%),linear-gradient(135deg,#f7f9fc,#e7eef8)] p-6">
        <section className="w-full max-w-md overflow-hidden rounded-3xl border border-[#d9e3ef] bg-white shadow-[0_30px_90px_rgba(16,47,86,.16)]">
          <div className="h-2 bg-[linear-gradient(90deg,#174f87_0_70%,#e5b529_70%)]"/>
          <div className="p-8">
          <div className="mb-8 flex items-center justify-between gap-4 border-b border-[#e8edf4] pb-6">
            <Image src={platformConfig.organization.logoPath} alt={platformConfig.organization.displayName} width={156} height={70} className="h-auto w-40" priority/>
            <span className="rounded-full bg-[#fff3c4] px-3 py-1 text-xs font-semibold tracking-wide text-[#715600]">OPERATIONS</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#102f56]">员工邮箱登录</h1>
          <p className="mt-3 leading-7 text-slate-600">请使用管理员已经添加的员工邮箱登录。邮箱和密码由 ChatGPT 安全验证，工作台不会保存或查看您的密码。</p>
          <a className="mt-8 flex h-12 items-center justify-center rounded-xl bg-[#174f87] px-5 font-medium text-white shadow-sm transition hover:bg-[#103d6c] focus:outline-none focus:ring-4 focus:ring-[#ffe58a]" href={chatGPTSignInPath("/")} target="_top">使用邮箱和密码登录</a>
          <p className="mt-4 text-center text-xs leading-5 text-slate-500">首次使用时，可以用获授权的邮箱免费创建 ChatGPT 账号。</p>
          </div>
        </section>
      </main>
    );
  }

  return <WorkbenchShell user={user} />;
}
