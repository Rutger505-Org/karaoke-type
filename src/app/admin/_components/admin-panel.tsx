"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { api } from "@/trpc/react";
import { useState, type FormEvent } from "react";

const filters = ["open", "added", "rejected", "all"] as const;
type Filter = (typeof filters)[number];
type Status = Exclude<Filter, "all">;

const statusActions: { status: Status; label: string }[] = [
  { status: "added", label: "Mark added" },
  { status: "rejected", label: "Reject" },
  { status: "open", label: "Reopen" },
];

export function AdminPanel({ currentEmail }: { currentEmail: string }) {
  return (
    <div className="flex flex-col gap-12">
      <Requests />
      <Admins currentEmail={currentEmail} />
    </div>
  );
}

function Requests() {
  const [filter, setFilter] = useState<Filter>("open");
  const utils = api.useUtils();
  const requests = api.songRequest.list.useQuery({
    status: filter === "all" ? undefined : filter,
  });
  const onSuccess = () => utils.songRequest.list.invalidate();
  const setStatus = api.songRequest.setStatus.useMutation({ onSuccess });
  const remove = api.songRequest.delete.useMutation({ onSuccess });
  const busy = setStatus.isPending || remove.isPending;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-muted-foreground text-sm tracking-wider uppercase">
          Song requests
        </h2>
        <div className="flex gap-1">
          {filters.map((f) => (
            <Button
              key={f}
              size="sm"
              variant={f === filter ? "default" : "ghost"}
              onClick={() => setFilter(f)}
              className="capitalize"
            >
              {f}
            </Button>
          ))}
        </div>
      </div>

      {requests.isPending ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : requests.isError ? (
        <p className="text-red-500">Loading requests failed.</p>
      ) : requests.data.length === 0 ? (
        <p className="text-muted-foreground">No requests here.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {requests.data.map((r) => (
            <li key={r.id}>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-3">
                    <span>
                      {r.title}{" "}
                      <span className="text-muted-foreground font-normal">
                        by {r.artist}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded px-2 py-0.5 text-xs font-normal",
                        r.status === "open" && "bg-blue-500/20 text-blue-300",
                        r.status === "added" &&
                          "bg-green-500/20 text-green-300",
                        r.status === "rejected" && "bg-red-500/20 text-red-300",
                      )}
                    >
                      {r.status}
                    </span>
                  </CardTitle>
                  <CardDescription>
                    #{r.id} · {r.createdAt.toLocaleString()} ·{" "}
                    {!r.requesterEmail
                      ? "anonymous"
                      : r.requester
                        ? `${r.requester} (${r.requesterEmail})`
                        : r.requesterEmail}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  {r.link && (
                    <a
                      href={r.link}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="text-sm break-all underline"
                    >
                      {r.link}
                    </a>
                  )}
                  {r.note && (
                    <p className="text-muted-foreground text-sm whitespace-pre-wrap">
                      {r.note}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {statusActions
                      .filter((a) => a.status !== r.status)
                      .map((a) => (
                        <Button
                          key={a.status}
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() =>
                            setStatus.mutate({ id: r.id, status: a.status })
                          }
                        >
                          {a.label}
                        </Button>
                      ))}
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => {
                        if (confirm(`Delete request #${r.id}?`)) {
                          remove.mutate({ id: r.id });
                        }
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Admins({ currentEmail }: { currentEmail: string }) {
  const [email, setEmail] = useState("");
  const utils = api.useUtils();
  const admins = api.songRequest.admins.useQuery();
  const onSuccess = () => utils.songRequest.admins.invalidate();
  const add = api.songRequest.addAdmin.useMutation({
    onSuccess: async () => {
      setEmail("");
      await onSuccess();
    },
  });
  const remove = api.songRequest.removeAdmin.useMutation({ onSuccess });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    add.mutate({ email });
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-muted-foreground text-sm tracking-wider uppercase">
        Admins
      </h2>
      <p className="text-muted-foreground text-sm">
        Whitelisted addresses can sign in with a magic link (an account is
        created on first sign-in) and get access to this page.
      </p>
      <ul className="flex flex-col gap-2">
        {admins.data?.map((a) => (
          <li
            key={a.email}
            className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
          >
            <span className="break-all">
              {a.email}
              {a.email === currentEmail && (
                <span className="text-muted-foreground"> (you)</span>
              )}
            </span>
            {a.email !== currentEmail && (
              <Button
                size="sm"
                variant="ghost"
                disabled={remove.isPending}
                onClick={() => {
                  if (confirm(`Remove admin ${a.email}?`)) {
                    remove.mutate({ email: a.email });
                  }
                }}
              >
                Remove
              </Button>
            )}
          </li>
        ))}
      </ul>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="new-admin@example.com"
        />
        <Button type="submit" disabled={add.isPending}>
          Add admin
        </Button>
      </form>
      {(add.isError || remove.isError) && (
        <p className="text-sm text-red-500">
          {add.error?.message ?? remove.error?.message}
        </p>
      )}
    </section>
  );
}
