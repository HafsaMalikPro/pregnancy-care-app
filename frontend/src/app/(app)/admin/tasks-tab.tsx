"use client";

import { useState } from "react";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Loading,
  SectionTitle,
  Textarea,
} from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import type { AdminTask } from "@/lib/types";
import { useApi } from "@/lib/use-api";
import { StatusBadge } from "./shared";

export function TasksTab() {
  const tasks = useApi<AdminTask[]>("/v1/admin/readiness-tasks");
  const [editing, setEditing] = useState<AdminTask | "new" | null>(null);

  const onSaved = (task: AdminTask) => {
    setEditing(task);
    void tasks.reload();
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <div>
        <Button className="mb-4" onClick={() => setEditing("new")}>
          New task
        </Button>
        {tasks.loading && !tasks.data ? (
          <Loading />
        ) : tasks.error ? (
          <ErrorState error={tasks.error} onRetry={tasks.reload} />
        ) : tasks.data?.length === 0 ? (
          <EmptyState title="No tasks yet" />
        ) : (
          <ul className="grid gap-2">
            {[...(tasks.data ?? [])]
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => setEditing(t)}
                    className="w-full rounded-2xl border border-line bg-card px-4 py-3 text-left transition hover:border-clay"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-semibold">{t.title}</span>
                      <StatusBadge status={t.status} />
                    </div>
                    <span className="text-xs text-muted">
                      {t.category} · #{t.sortOrder} · {t.key}
                    </span>
                  </button>
                </li>
              ))}
          </ul>
        )}
      </div>
      <div>
        {editing ? (
          <TaskEditor
            key={editing === "new" ? "new" : editing.id + editing.status}
            task={editing === "new" ? null : editing}
            onSaved={onSaved}
          />
        ) : (
          <EmptyState title="Select a task or create a new one" />
        )}
      </div>
    </div>
  );
}

function TaskEditor({ task, onSaved }: { task: AdminTask | null; onSaved: (t: AdminTask) => void }) {
  const [key, setKey] = useState(task?.key ?? "");
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [category, setCategory] = useState(task?.category ?? "");
  const [sortOrder, setSortOrder] = useState(String(task?.sortOrder ?? 0));
  const [premium, setPremium] = useState(task?.premium ?? false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  async function run(action: () => Promise<AdminTask>, success: string) {
    setBusy(true);
    setMessage(null);
    try {
      onSaved(await action());
      setMessage({ tone: "success", text: success });
    } catch (err) {
      setMessage({ tone: "danger", text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  const fields = { title, description, category, sortOrder: Number(sortOrder), premium };

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <SectionTitle>{task ? "Edit task" : "New task"}</SectionTitle>
        {task && <StatusBadge status={task.status} />}
      </div>
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void run(
            () =>
              task
                ? api<AdminTask>(`/v1/admin/readiness-tasks/${task.id}`, { method: "PATCH", body: fields })
                : api<AdminTask>("/v1/admin/readiness-tasks", {
                    method: "POST",
                    body: { key, locale: "en", ...fields },
                  }),
            task ? "Saved." : "Draft task created.",
          );
        }}
      >
        <Field label="Key" hint="Stable identifier, e.g. book-glucose-test">
          <Input required value={key} disabled={Boolean(task)} onChange={(e) => setKey(e.target.value)} />
        </Field>
        <Field label="Title">
          <Input required value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Description">
          <Textarea rows={4} required value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category" hint="e.g. nutrition, appointments">
            <Input required value={category} onChange={(e) => setCategory(e.target.value)} />
          </Field>
          <Field label="Sort order">
            <Input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
          </Field>
        </div>
        <Checkbox label="Premium task" checked={premium} onChange={(e) => setPremium(e.target.checked)} />
        {message && <Alert tone={message.tone}>{message.text}</Alert>}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" busy={busy}>
            {task ? "Save" : "Create draft"}
          </Button>
          {task && task.status !== "published" && task.status !== "archived" && (
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() =>
                run(() => api<AdminTask>(`/v1/admin/readiness-tasks/${task.id}/publish`, { method: "POST" }), "Published.")
              }
            >
              Publish (clinical reviewer)
            </Button>
          )}
          {task && task.status !== "archived" && (
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() =>
                run(() => api<AdminTask>(`/v1/admin/readiness-tasks/${task.id}/archive`, { method: "POST" }), "Archived.")
              }
            >
              Archive
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}
