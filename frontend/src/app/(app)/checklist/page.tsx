"use client";

import { TaskItem } from "@/components/task-item";
import {
  Card,
  EmptyState,
  ErrorState,
  Loading,
  PageHeader,
  ProgressBar,
  SectionTitle,
} from "@/components/ui";
import { humanize } from "@/lib/labels";
import type { ReadinessTask } from "@/lib/types";
import { useApi } from "@/lib/use-api";

export default function ChecklistPage() {
  const tasks = useApi<ReadinessTask[]>("/v1/readiness/tasks");

  if (tasks.loading) return <Loading />;
  if (tasks.error) return <ErrorState error={tasks.error} onRetry={tasks.reload} />;
  const list = tasks.data ?? [];

  const replace = (updated: ReadinessTask) =>
    tasks.setData(list.map((t) => (t.id === updated.id ? updated : t)));

  const done = list.filter((t) => t.completedAt).length;
  const categories = [...new Set(list.map((t) => t.category))];

  return (
    <div>
      <PageHeader
        title="Checklist"
        subtitle="Practical steps for a healthy pregnancy, one tick at a time."
      />
      {list.length === 0 ? (
        <EmptyState title="Your checklist is on its way">
          Our clinical team is preparing it. Check back soon.
        </EmptyState>
      ) : (
        <div className="grid gap-8">
          <Card>
            <div className="mb-3 flex items-baseline justify-between">
              <span className="font-semibold">
                {done} of {list.length} done
              </span>
              <span className="text-sm text-muted">
                {Math.round((done / list.length) * 100)}%
              </span>
            </div>
            <ProgressBar value={(done / list.length) * 100} />
          </Card>
          {categories.map((category) => (
            <section key={category}>
              <SectionTitle>{humanize(category)}</SectionTitle>
              <ul className="grid gap-3">
                {list
                  .filter((t) => t.category === category)
                  .map((task) => (
                    <TaskItem key={task.id} task={task} onChange={replace} />
                  ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
