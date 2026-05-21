"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

import { AppTopNav } from "@/components/layout/app-top-nav";
import { type NavigationToolSlug, navigationTools } from "@/constant/navigation-tools";
import { useConfigStore } from "@/stores/use-config-store";

export default function UserLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const config = useConfigStore((state) => state.config);
  const updateConfig = useConfigStore((state) => state.updateConfig);
  const slug = pathname.split("/").filter(Boolean)[0];
  const activeToolSlug = navigationTools.some((tool) => tool.slug === slug) ? (slug as NavigationToolSlug) : undefined;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <AppTopNav activeToolSlug={activeToolSlug} config={config} onConfigChange={updateConfig} hideHeader={/^\/canvas\/[^/]+/.test(pathname)} />
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </div>
  );
}
