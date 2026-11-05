"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge, Card, Textarea, cx } from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import type { ReadinessTask } from "@/lib/types";

/** One checklist task: tick it off and keep a private note. */
export function TaskItem({
  task,
  onChange,
}: {
  task: ReadinessTask;
  onChange: (t: ReadinessTask) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingNote, setEditingNote] = useState(false);
  const [note, setNote] = useState(task.note ?? "");
  const done = Boolean(task.completedAt);

  async function save(completed: boolean, nextNote: string | null = task.note) {
    setBusy(true);
    setError(null);
    try {
      onChange(
        await api<ReadinessTask>(`/v1/readiness/tasks/${task.id}/progress`, {
          method: "PUT",
          body: { completed, note: nextNote },
        }),
      );
      setEditingNote(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li>
      <Card className={cx("p-4 sm:p-5", done && "bg-sage-soft/60")}>
        <div className="flex gap-4">
          <button
            type="button"
            role="checkbox"
            aria-checked={done}
            aria-label={done ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`}
            disabled={busy || task.locked}
            onClick={() => save(!done)}
            className={cx(
              "mt-0.5 grid size-7 shrink-0 place-items-center rounded-full border-2 transition disabled:opacity-50",
              done ? "border-sage bg-sage text-white" : "border-line hover:border-clay",
            )}
          >
            {done && (
              <svg viewBox="0 0 20 20" className="size-4" fill="currentColor" aria-hidden>
                <path d="M7.6 14.2 3.4 10l1.4-1.4 2.8 2.8 7-7 1.4 1.4z" />
              </svg>
            )}
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className={cx("font-semibold", done && "text-muted line-through")}>{task.title}</p>
              {task.premium && <Badge tone="warn">Premium</Badge>}
            </div>
            {task.locked ? (
              <p className="mt-1 text-sm text-muted">Available with premium.</p>
            ) : (
              task.description && <p className="mt-1 text-sm text-muted">{task.description}</p>
            )}
            <div className="mt-2 flex flex-wrap gap-4 text-sm">
              {task.articleSlug && (
                <Link href={`/articles/${task.articleSlug}`} className="font-semibold text-clay underline">
                  Learn more
                </Link>
              )}
              {!task.locked && !editingNote && (
                <button
                  type="button"
                  className="font-semibold text-muted underline"
                  onClick={() => setEditingNote(true)}
                >
                  {task.note ? "Edit note" : "Add note"}
                </button>
              )}
            </div>
            {task.note && !editingNote && (
              <p className="mt-2 rounded-xl bg-sunk px-3 py-2 text-sm">{task.note}</p>
            )}
            {editingNote && (
              <div className="mt-3 grid gap-2">
                <Textarea
                  rows={2}
                  maxLength={2000}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="A private note"
                />
                <div className="flex gap-3 text-sm">
                  <button
                    type="button"
                    disabled={busy}
                    className="font-semibold text-clay underline"
                    onClick={() => save(done, note.trim() || null)}
                  >
                    Save note
                  </button>
                  <button
                    type="button"
                    className="text-muted underline"
                    onClick={() => {
                      setNote(task.note ?? "");
                      setEditingNote(false);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {error && <p className="mt-2 text-sm text-danger">{error}</p>}
          </div>
        </div>
      </Card>
    </li>
  );
}
