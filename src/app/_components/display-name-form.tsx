"use client";

import { useSession } from "@/client/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DISPLAY_NAME_MAX, displayNameSchema } from "@/lib/display-name";
import { api } from "@/trpc/react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

/**
 * Sets the signed-in user's display name. Validated client-side for quick
 * feedback; the server validates again (account.setName).
 */
export function DisplayNameForm({
  initialName,
  callbackUrl,
  submitLabel = "Save",
  id = "display-name",
}: Readonly<{
  initialName: string;
  /** Navigate here after saving (e.g. back to where sign-in started). */
  callbackUrl?: string;
  submitLabel?: string;
  id?: string;
}>) {
  const router = useRouter();
  const { refetch: refetchSession } = useSession();
  const utils = api.useUtils();
  const [name, setName] = useState(initialName);
  const [clientError, setClientError] = useState<string | null>(null);

  const setNameMutation = api.account.setName.useMutation({
    onSuccess: async () => {
      await Promise.all([refetchSession(), utils.score.top.invalidate()]);
      if (callbackUrl) {
        router.push(callbackUrl);
      } else {
        router.refresh();
      }
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = displayNameSchema.safeParse(name);
    if (!parsed.success) {
      setClientError(parsed.error.issues[0]?.message ?? "Invalid name");
      return;
    }
    setClientError(null);
    setName(parsed.data);
    setNameMutation.mutate({ name: parsed.data });
  }

  const error =
    clientError ??
    (setNameMutation.isError
      ? setNameMutation.error.data?.code === "BAD_REQUEST"
        ? "That name isn't allowed."
        : "Couldn't save your name, try again."
      : null);

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <Label htmlFor={id}>Display name</Label>
      <div className="flex gap-2">
        <Input
          id={id}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setClientError(null);
          }}
          required
          maxLength={DISPLAY_NAME_MAX + 8}
          autoComplete="nickname"
          placeholder="Shown on leaderboards"
        />
        <Button type="submit" disabled={setNameMutation.isPending}>
          {setNameMutation.isPending ? "Saving…" : submitLabel}
        </Button>
      </div>
      {error ? (
        <p className="text-sm text-red-400">{error}</p>
      ) : setNameMutation.isSuccess && !callbackUrl ? (
        <p className="text-sm text-emerald-400">Saved.</p>
      ) : (
        <p className="text-muted-foreground text-xs">
          Public on leaderboards, 1–{DISPLAY_NAME_MAX} characters.
        </p>
      )}
    </form>
  );
}
