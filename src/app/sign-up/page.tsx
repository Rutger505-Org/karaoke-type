"use client";

import { signUp, useSession } from "@/client/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { postSignInUrl } from "@/lib/callback-url";
import { DISPLAY_NAME_MAX, displayNameSchema } from "@/lib/display-name";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";

export default function SignUpPage() {
  const { data: session } = useSession();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const parsedName = displayNameSchema.safeParse(name);
      if (!parsedName.success) {
        throw new Error(
          `Name: ${parsedName.error.issues[0]?.message ?? "invalid"}`,
        );
      }
      const response = await signUp.email({
        email,
        name: parsedName.data,
        password,
      });
      if (response.error) {
        throw new Error(response.error.message ?? "Sign up failed");
      }

      router.push(postSignInUrl("/"));
    },
  });

  useEffect(() => {
    if (session) {
      router.push(postSignInUrl("/"));
    }
  }, [router, session]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    mutation.mutate();
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sign up</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="name">Display name</Label>
              <Input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={DISPLAY_NAME_MAX + 8}
                placeholder="Shown on leaderboards"
              />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
              />
            </div>

            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Your password"
              />
            </div>

            {mutation.isError && (
              <div className="text-sm text-red-600">
                {mutation.error?.message ?? "Sign up failed"}
              </div>
            )}

            <Button
              type="submit"
              disabled={mutation.isPending}
              className="w-full"
            >
              {mutation.isPending ? "Signing up..." : "Sign up"}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-gray-600">
            Already have an account?{" "}
            <Link href="/sign-in" className="text-blue-600 hover:underline">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
