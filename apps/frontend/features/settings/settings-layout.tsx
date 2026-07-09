"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { TopNav } from "@/components/top-nav";

const settingsNavItems = [
  { href: "/settings", label: "Workspace Settings" },
  { href: "/settings/projects", label: "Projects" },
  { href: "/settings/users", label: "Users" },
  { href: "/settings/slack", label: "Slack Lists" },
];

export default function SettingsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <main className="home">
      <TopNav />

      <section className="settings-view" aria-labelledby="settings-title">
        <div className="settings-heading">
          <div>
            <div className="m-stripe" aria-hidden="true" />
            <p className="eyebrow">Settings</p>
            <h1 id="settings-title">Settings</h1>
          </div>
        </div>

        <div className="settings-shell">
          <aside className="settings-sidebar" aria-label="설정 섹션">
            {settingsNavItems.map((item) => {
              const isActive = item.href === "/settings" ? pathname === item.href : pathname.startsWith(item.href);

              return (
                <Link aria-current={isActive ? "page" : undefined} href={item.href} key={item.href}>
                  {item.label}
                </Link>
              );
            })}
          </aside>
          <div className="settings-content">{children}</div>
        </div>
      </section>
    </main>
  );
}
