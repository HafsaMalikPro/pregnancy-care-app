"use client";

import { useState } from "react";
import { useSession } from "@/components/session-provider";
import { Alert, ButtonLink, EmptyState, PageHeader, cx } from "@/components/ui";
import { STAFF_ROLES } from "@/lib/labels";
import { ContentTab } from "./content-tab";
import { TasksTab } from "./tasks-tab";
import { AuditTab, UsersTab } from "./users-tab";

const TABS = {
  content: { label: "Articles & week guides", Tab: ContentTab },
  tasks: { label: "Checklist tasks", Tab: TasksTab },
  users: { label: "Users", Tab: UsersTab },
  audit: { label: "Audit log", Tab: AuditTab },
} as const;

type TabKey = keyof typeof TABS;

export default function AdminPage() {
  const { me } = useSession();
  const [tab, setTab] = useState<TabKey>("content");

  if (me?.kind !== "user" || !me.staffRole) {
    return <EmptyState title="Staff only">This area is for the clinical and content team.</EmptyState>;
  }
  const { Tab } = TABS[tab];

  return (
    <div>
      <PageHeader title="Admin" subtitle={`Signed in as ${STAFF_ROLES[me.staffRole]}`} />
      {!me.twoFactorEnabled && (
        <div className="mb-6">
          <Alert tone="warn">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>Staff actions need two-step verification turned on.</span>
              <ButtonLink href="/settings" variant="secondary" className="min-h-9">
                Set it up
              </ButtonLink>
            </div>
          </Alert>
        </div>
      )}
      <div role="tablist" className="-mx-4 mb-6 flex gap-1 overflow-x-auto px-4">
        {(Object.keys(TABS) as TabKey[]).map((key) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cx(
              "shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition",
              tab === key ? "bg-ink text-paper" : "text-muted hover:bg-sunk",
            )}
          >
            {TABS[key].label}
          </button>
        ))}
      </div>
      <Tab />
    </div>
  );
}
