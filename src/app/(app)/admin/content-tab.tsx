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
  Select,
  Textarea,
  cx,
} from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/dates";
import type { AdminArticle, ContentStatus, Page, WeekGuideSections } from "@/lib/types";
import { useApi } from "@/lib/use-api";
import { StatusBadge, formatReferences, lines, parseReferences } from "./shared";

type Kind = "article" | "week_guide";
type Editing = { mode: "new"; kind: Kind } | { mode: "existing"; item: AdminArticle };

export function ContentTab() {
  const [kind, setKind] = useState<Kind | "">("");
  const [status, setStatus] = useState<ContentStatus | "">("");
  const query = new URLSearchParams({ limit: "100" });
  if (kind) query.set("kind", kind);
  if (status) query.set("status", status);
  const list = useApi<Page<AdminArticle>>(`/v1/admin/articles?${query}`);
  const [editing, setEditing] = useState<Editing | null>(null);

  const onSaved = (item: AdminArticle) => {
    setEditing({ mode: "existing", item });
    void list.reload();
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <div>
        <div className="mb-4 flex flex-wrap gap-2">
          <Select value={kind} onChange={(e) => setKind(e.target.value as Kind | "")} className="w-auto">
            <option value="">All types</option>
            <option value="article">Articles</option>
            <option value="week_guide">Week guides</option>
          </Select>
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as ContentStatus | "")}
            className="w-auto"
          >
            <option value="">Any status</option>
            {["draft", "in_review", "approved", "published", "archived"].map((s) => (
              <option key={s} value={s}>
                {s.replace("_", " ")}
              </option>
            ))}
          </Select>
        </div>
        <div className="mb-4 flex flex-wrap gap-2">
          <Button onClick={() => setEditing({ mode: "new", kind: "article" })}>New article</Button>
          <Button variant="secondary" onClick={() => setEditing({ mode: "new", kind: "week_guide" })}>
            New week guide
          </Button>
        </div>
        {list.loading && !list.data ? (
          <Loading />
        ) : list.error ? (
          <ErrorState error={list.error} onRetry={list.reload} />
        ) : list.data?.items.length === 0 ? (
          <EmptyState title="Nothing here yet" />
        ) : (
          <ul className="grid gap-2">
            {list.data?.items.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => setEditing({ mode: "existing", item })}
                  className={cx(
                    "w-full rounded-2xl border px-4 py-3 text-left transition hover:border-clay",
                    editing?.mode === "existing" && editing.item.id === item.id
                      ? "border-clay bg-clay-soft"
                      : "border-line bg-card",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-semibold">{item.title}</span>
                    <StatusBadge status={item.status} />
                  </div>
                  <span className="text-xs text-muted">
                    {item.kind === "week_guide" ? `Week ${item.week}` : item.slug} · v{item.version} ·
                    updated {formatDate(item.updatedAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        {editing ? (
          <Editor key={editing.mode === "new" ? `new-${editing.kind}` : editing.item.id + editing.item.status + editing.item.updatedAt} editing={editing} onSaved={onSaved} />
        ) : (
          <EmptyState title="Select an item or create a new one" />
        )}
      </div>
    </div>
  );
}

const emptySections = (): WeekGuideSections => ({
  baby: "",
  body: "",
  symptoms: [],
  eat: "",
  move: "",
  visits: "",
  askAtVisit: [],
  prepare: [],
  avoid: [],
  whenToGetHelp: [],
  checklist: [],
  message: "",
  firstPregnancyNote: null,
  subsequentPregnancyNote: null,
});

const TEXT_SECTIONS = ["baby", "body", "eat", "move", "visits", "message"] as const;
const LIST_SECTIONS = ["symptoms", "askAtVisit", "prepare", "avoid", "whenToGetHelp", "checklist"] as const;
const SECTION_LABELS: Record<string, string> = {
  baby: "Your baby",
  body: "Your body",
  eat: "Eat well",
  move: "Move",
  visits: "Appointments",
  message: "Encouraging message",
  symptoms: "Common symptoms",
  askAtVisit: "Questions to ask",
  prepare: "Get ready",
  avoid: "Best avoided",
  whenToGetHelp: "When to get help (required)",
  checklist: "To-dos",
};

function Editor({ editing, onSaved }: { editing: Editing; onSaved: (a: AdminArticle) => void }) {
  const item = editing.mode === "existing" ? editing.item : null;
  const kind = item?.kind ?? (editing.mode === "new" ? editing.kind : "article");
  const editable = !item || item.status === "draft";

  const [slug, setSlug] = useState(item?.slug ?? "");
  const [week, setWeek] = useState(String(item?.week ?? 1));
  const [title, setTitle] = useState(item?.title ?? "");
  const [summary, setSummary] = useState(item?.summary ?? "");
  const [body, setBody] = useState(item?.body ?? "");
  const [premium, setPremium] = useState(item?.premium ?? false);
  const [references, setReferences] = useState(formatReferences(item?.references ?? []));
  const [sections, setSections] = useState<WeekGuideSections>(item?.sections ?? emptySections());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  async function run(action: () => Promise<AdminArticle>, success: string) {
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

  const content = () => ({
    title,
    summary,
    references: parseReferences(references),
    ...(kind === "article" ? { body, premium } : { sections }),
  });

  const createDraft = () =>
    run(
      () =>
        kind === "article"
          ? api<AdminArticle>("/v1/admin/articles", {
              method: "POST",
              body: { slug, locale: "en", ...content() },
            })
          : api<AdminArticle>("/v1/admin/week-guides", {
              method: "POST",
              body: { week: Number(week), locale: "en", ...content() },
            }),
      "Draft created.",
    );

  const action = (path: string, success: string) =>
    run(() => api<AdminArticle>(`/v1/admin/articles/${item!.id}/${path}`, { method: "POST" }), success);

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between gap-3">
        <SectionTitle>
          {item ? `${kind === "week_guide" ? "Week guide" : "Article"} v${item.version}` : `New ${kind === "week_guide" ? "week guide" : "article"}`}
        </SectionTitle>
        {item && <StatusBadge status={item.status} />}
      </div>

      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!item) return void createDraft();
          void run(
            () => api<AdminArticle>(`/v1/admin/articles/${item.id}`, { method: "PATCH", body: content() }),
            "Draft saved.",
          );
        }}
      >
        <fieldset disabled={!editable || busy} className="grid gap-4">
          {kind === "article" ? (
            <Field label="Slug" hint="Lowercase words joined by hyphens, e.g. iron-in-pregnancy">
              <Input required value={slug} disabled={Boolean(item)} onChange={(e) => setSlug(e.target.value)} />
            </Field>
          ) : (
            <Field label="Week">
              <Input type="number" min={1} max={42} required value={week} disabled={Boolean(item)} onChange={(e) => setWeek(e.target.value)} />
            </Field>
          )}
          <Field label="Title">
            <Input required value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Summary">
            <Textarea rows={2} required value={summary} onChange={(e) => setSummary(e.target.value)} />
          </Field>
          {kind === "article" ? (
            <>
              <Field label="Body (Markdown)">
                <Textarea rows={12} required value={body} onChange={(e) => setBody(e.target.value)} className="font-mono text-sm" />
              </Field>
              <Checkbox label="Premium article" checked={premium} onChange={(e) => setPremium(e.target.checked)} />
            </>
          ) : (
            <>
              {TEXT_SECTIONS.map((key) => (
                <Field key={key} label={SECTION_LABELS[key]}>
                  <Textarea rows={3} value={sections[key]} onChange={(e) => setSections({ ...sections, [key]: e.target.value })} />
                </Field>
              ))}
              {LIST_SECTIONS.map((key) => (
                <Field key={key} label={SECTION_LABELS[key]} hint="One per line">
                  <Textarea
                    rows={3}
                    defaultValue={sections[key].join("\n")}
                    onChange={(e) => setSections({ ...sections, [key]: lines(e.target.value) })}
                  />
                </Field>
              ))}
              <Field label="Note for a first pregnancy (optional)">
                <Textarea rows={2} value={sections.firstPregnancyNote ?? ""} onChange={(e) => setSections({ ...sections, firstPregnancyNote: e.target.value || null })} />
              </Field>
              <Field label="Note for a later pregnancy (optional)">
                <Textarea rows={2} value={sections.subsequentPregnancyNote ?? ""} onChange={(e) => setSections({ ...sections, subsequentPregnancyNote: e.target.value || null })} />
              </Field>
            </>
          )}
          <Field label="References" hint='One per line: "Title | https://link"'>
            <Textarea rows={3} value={references} onChange={(e) => setReferences(e.target.value)} />
          </Field>
        </fieldset>

        {message && <Alert tone={message.tone}>{message.text}</Alert>}

        <div className="flex flex-wrap gap-2">
          {editable && (
            <Button type="submit" busy={busy}>
              {item ? "Save draft" : "Create draft"}
            </Button>
          )}
          {item?.status === "draft" && (
            <Button type="button" variant="secondary" disabled={busy} onClick={() => action("submit", "Submitted for clinical review.")}>
              Submit for review
            </Button>
          )}
          {item?.status === "approved" && (
            <Button type="button" disabled={busy} onClick={() => action("publish", "Published.")}>
              Publish
            </Button>
          )}
          {item && item.status !== "archived" && (
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => window.confirm("Archive this version? Published content is taken down.") && action("archive", "Archived.")}
            >
              Archive
            </Button>
          )}
          {item && (item.status === "published" || item.status === "archived") && (
            <Button type="button" variant="secondary" disabled={busy} onClick={createDraft}>
              Start a new version
            </Button>
          )}
        </div>
      </form>

      {item?.status === "in_review" && <ReviewForm item={item} onSaved={onSaved} />}
    </Card>
  );
}

function ReviewForm({ item, onSaved }: { item: AdminArticle; onSaved: (a: AdminArticle) => void }) {
  const [decision, setDecision] = useState<"approved" | "changes_requested">("approved");
  const [credentials, setCredentials] = useState("");
  const [sources, setSources] = useState(formatReferences(item.references));
  const [comments, setComments] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/v1/admin/articles/${item.id}/reviews`, {
        method: "POST",
        body: {
          decision,
          reviewerCredentials: credentials,
          sources: parseReferences(sources),
          ...(comments.trim() ? { comments } : {}),
        },
      });
      onSaved(await api<AdminArticle>(`/v1/admin/articles/${item.id}`));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 grid gap-4 border-t border-line pt-6">
      <SectionTitle>Clinical review</SectionTitle>
      {error && <Alert tone="danger">{error}</Alert>}
      <Field label="Decision">
        <Select value={decision} onChange={(e) => setDecision(e.target.value as typeof decision)}>
          <option value="approved">Approve</option>
          <option value="changes_requested">Request changes</option>
        </Select>
      </Field>
      <Field label="Your credentials" hint="Shown publicly, e.g. RM, Registered Midwife">
        <Input required value={credentials} onChange={(e) => setCredentials(e.target.value)} />
      </Field>
      <Field label="Sources checked" hint='One per line: "Title | https://link"'>
        <Textarea rows={3} required value={sources} onChange={(e) => setSources(e.target.value)} />
      </Field>
      <Field label="Comments (optional)">
        <Textarea rows={3} value={comments} onChange={(e) => setComments(e.target.value)} />
      </Field>
      <Button type="submit" busy={busy} className="justify-self-start">
        Record review
      </Button>
    </form>
  );
}
