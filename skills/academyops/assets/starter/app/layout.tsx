import platformConfig from "@/platform.config.json";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: platformConfig.organization.displayName,
  description: "统一管理学员、报名、收款、课程顾问、渠道来源和课程跟进。",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
