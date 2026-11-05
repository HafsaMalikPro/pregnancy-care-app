"use client";

import { useState } from "react";
import { useSession } from "@/components/session-provider";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  Loading,
  Select,
} from "@/components/ui";
import { api, errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/dates";
import { STAFF_ROLES } from "@/lib/labels";
import type { AdminUser, AuditEvent, Page, StaffRole } from "@/lib/types";
import { useApi } from "@/lib/use-api";

const PAGE_SIZE = 25;

export function UsersTab() {
  const [email, setEmail] = useState("");
  const [query, setQuery] = useState({ email: "", staffOnly: false });
  const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
  if (query.email) params.set("email", query.email);
  if (query.staffOnly) params.set("staffOnly", "true");
  const users = useApi<Page<AdminUser>>(`/v1/admin/users?${params}`);

  return (
    <div>
      <form
        className="mb-4 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery({ ...query, email: email.trim() });
        }}
      >
        <Input
          type="search"
          placeholder="Search by email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="max-w-xs"
        />
        <Button type="submit" variant="secondary">
          Search
        </Button>
        <Button
          type="button"
          variant={query.staffOnly ? "primary" : "ghost"}
          onClick={() => setQuery({ ...query, staffOnly: !query.staffOnly })}
        >
          Staff only
        </Button>
      </form>
      {users.loading && !users.data ? (
        <Loading />
      ) : users.error ? (
        <ErrorState error={users.error} onRetry={users.reload} />
      ) : users.data?.items.length === 0 ? (
        <EmptyState title="No matching accounts" />
      ) : (
        <ul className="grid gap-2">
          {users.data?.items.map((u) => <UserRow key={u.id} user={u} onSaved={users.reload} />)}
        </ul>
      )}
    </div>
  );
}

function UserRow({ user, onSaved }: { user: AdminUser; onSaved: () => void }) {
  const { me } = useSession();
  const [role, setRole] = useState<StaffRole | "">(user.staffRole ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = role !== (user.staffRole ?? "");

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api(`/v1/admin/users/${user.id}/staff-role`, {
        method: "PATCH",
        body: { staffRole: role || null },
      });
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li>
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="truncate font-semibold">
            {user.name ?? user.email}
            {user.status !== "active" && (
              <span className="ml-2">
                <Badge tone="warn">{user.status.replace("_", " ")}</Badge>
              </span>
            )}
          </p>
          <p className="truncate text-sm text-muted">
            {user.email} · joined {formatDate(user.createdAt)}
            {user.twoFactorEnabled && " · 2FA on"}
          </p>
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
        <div className="flex gap-2">
          <Select
            value={role}
            disabled={me?.kind === "user" && me.id === user.id}
            onChange={(e) => setRole(e.target.value as StaffRole | "")}
            className="w-auto"
          >
            <option value="">No staff role</option>
            {Object.entries(STAFF_ROLES).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </Select>
          {changed && (
            <Button busy={busy} onClick={save}>
              Save
            </Button>
          )}
        </div>
      </Card>
    </li>
  );
}

export function AuditTab() {
  const [offset, setOffset] = useState(0);
  const events = useApi<Page<AuditEvent>>(
    `/v1/admin/audit-events?limit=${PAGE_SIZE}&offset=${offset}`,
  );
  const page = events.data?.page;

  if (events.loading && !events.data) return <Loading />;
  if (events.error) return <ErrorState error={events.error} onRetry={events.reload} />;
  if (!events.data?.items.length) return <EmptyState title="No audit events" />;

  return (
    <div>
      <div className="overflow-x-auto rounded-3xl border border-line bg-card">
        <table className="w-full text-left text-sm">
          <thead className="bg-sunk text-muted">
            <tr>
              <th className="px-4 py-3 font-semibold">When</th>
              <th className="px-4 py-3 font-semibold">Action</th>
              <th className="px-4 py-3 font-semibold">Actor</th>
              <th className="px-4 py-3 font-semibold">Target</th>
            </tr>
          </thead>
          <tbody>
            {events.data.items.map((e) => (
              <tr key={e.id} className="border-t border-line">
                <td className="whitespace-nowrap px-4 py-3">
                  {new Date(e.createdAt).toLocaleString()}
                </td>
                <td className="px-4 py-3 font-mono text-xs">{e.action}</td>
                <td className="px-4 py-3 text-muted">
                  {e.actorRole ?? "—"}
                  {e.actorUserId && <span className="block font-mono text-xs">{e.actorUserId.slice(0, 8)}</span>}
                </td>
                <td className="px-4 py-3 text-muted">
                  {e.targetType ?? "—"}
                  {e.targetId && <span className="block font-mono text-xs">{e.targetId.slice(0, 8)}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {page && page.total > PAGE_SIZE && (
        <div className="mt-4 flex items-center justify-center gap-4">
          <Button variant="secondary" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
            Newer
          </Button>
          <span className="text-sm text-muted">
            {offset + 1}–{Math.min(offset + PAGE_SIZE, page.total)} of {page.total}
          </span>
          <Button variant="secondary" disabled={offset + PAGE_SIZE >= page.total} onClick={() => setOffset(offset + PAGE_SIZE)}>
            Older
          </Button>
        </div>
      )}
    </div>
  );
}
