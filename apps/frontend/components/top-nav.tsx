"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const topNavItems = [
  { href: "/", label: "Dashboard" },
  { href: "/projects", label: "Projects" },
  { href: "/notes", label: "Note" },
  { href: "/settings", label: "Settings" },
];

export function TopNav({ actions }: { actions?: ReactNode }) {
  const pathname = usePathname();

  return (
    <header className="top-nav">
      <nav className="menu" aria-label="주요 메뉴">
        {topNavItems.map((item) => {
          const isActive = item.href === "/" ? pathname === item.href : pathname.startsWith(item.href);

          return (
            <Link aria-current={isActive ? "page" : undefined} href={item.href} key={item.href}>
              {item.label}
            </Link>
          );
        })}
      </nav>
      {actions ? <div className="top-nav-actions">{actions}</div> : null}
    </header>
  );
}
