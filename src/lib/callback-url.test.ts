import { postSignInUrl, safeCallbackUrl } from "@/lib/callback-url";
import { describe, expect, test } from "bun:test";

describe("safeCallbackUrl", () => {
  test("keeps same-origin paths", () => {
    expect(safeCallbackUrl("/play/x?a=1")).toBe("/play/x?a=1");
  });

  test("rejects off-site and non-strings", () => {
    expect(safeCallbackUrl("https://evil.example")).toBe("/");
    expect(safeCallbackUrl("//evil.example")).toBe("/");
    expect(safeCallbackUrl("/\\evil.example")).toBe("/");
    expect(safeCallbackUrl(["/a"])).toBe("/");
    expect(safeCallbackUrl(undefined)).toBe("/");
  });
});

test("postSignInUrl encodes the callback", () => {
  expect(postSignInUrl("/play/a b")).toBe(
    "/auth/continue?callbackUrl=%2Fplay%2Fa%20b",
  );
  expect(postSignInUrl("https://evil.example")).toBe(
    "/auth/continue?callbackUrl=%2F",
  );
});
