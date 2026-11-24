"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/trpc/react";
import { useState, type FormEvent } from "react";

const empty = { title: "", artist: "", link: "", note: "" };

export function RequestForm() {
  const [form, setForm] = useState(empty);
  const create = api.songRequest.create.useMutation({
    onSuccess: () => setForm(empty),
  });

  function update(field: keyof typeof empty) {
    return (e: { target: { value: string } }) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    create.mutate({
      title: form.title,
      artist: form.artist,
      link: form.link || undefined,
      note: form.note || undefined,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="title">Song title</Label>
        <Input
          id="title"
          value={form.title}
          onChange={update("title")}
          required
          maxLength={200}
          placeholder="Never Gonna Give You Up"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="artist">Artist</Label>
        <Input
          id="artist"
          value={form.artist}
          onChange={update("artist")}
          required
          maxLength={200}
          placeholder="Rick Astley"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="link">Link (optional)</Label>
        <Input
          id="link"
          type="url"
          value={form.link}
          onChange={update("link")}
          maxLength={500}
          placeholder="YouTube or Spotify link"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="note">Note (optional)</Label>
        <textarea
          id="note"
          value={form.note}
          onChange={update("note")}
          maxLength={1000}
          rows={3}
          placeholder="Specific version, live recording, …"
          className="border-input placeholder:text-muted-foreground focus-visible:ring-ring rounded-md border bg-transparent px-3 py-2 text-base shadow-sm focus-visible:ring-1 focus-visible:outline-none md:text-sm"
        />
      </div>

      {create.isError && (
        <p className="text-sm text-red-500">
          {create.error.data?.zodError
            ? "Check the fields and try again."
            : "Sending the request failed, try again later."}
        </p>
      )}
      {create.isSuccess && (
        <p className="text-sm text-green-500">Thanks! Your request was sent.</p>
      )}

      <Button type="submit" disabled={create.isPending}>
        {create.isPending ? "Sending…" : "Send request"}
      </Button>
    </form>
  );
}
