import {
  displayNameSchema,
  hasDisplayName,
  publicDisplayName,
} from "@/lib/display-name";
import { describe, expect, test } from "bun:test";

describe("displayNameSchema", () => {
  test("trims and collapses whitespace", () => {
    expect(displayNameSchema.parse("  Rutger   P \t ")).toBe("Rutger P");
  });

  test("rejects empty and whitespace-only", () => {
    expect(displayNameSchema.safeParse("").success).toBe(false);
    expect(displayNameSchema.safeParse("   ").success).toBe(false);
  });

  test("length limit applies after trimming", () => {
    expect(displayNameSchema.safeParse(`  ${"a".repeat(32)}  `).success).toBe(
      true,
    );
    expect(displayNameSchema.safeParse("a".repeat(33)).success).toBe(false);
  });

  test("rejects control characters", () => {
    expect(displayNameSchema.safeParse("a\u0000b").success).toBe(false);
    expect(displayNameSchema.safeParse("a\u001bb").success).toBe(false);
  });

  test("allows unicode and emoji", () => {
    expect(displayNameSchema.parse("Zoë 🎤")).toBe("Zoë 🎤");
  });
});

describe("publicDisplayName", () => {
  test("uses the name when set", () => {
    expect(publicDisplayName(" Rutger ", "AbCdEfGh")).toBe("Rutger");
  });

  test("falls back to a short id, never empty", () => {
    expect(publicDisplayName("", "AbCdEfGh")).toBe("player-abcdef");
    expect(publicDisplayName("  ", "AbCdEfGh")).toBe("player-abcdef");
    expect(publicDisplayName(null, "AbCdEfGh")).toBe("player-abcdef");
  });
});

test("hasDisplayName", () => {
  expect(hasDisplayName("x")).toBe(true);
  expect(hasDisplayName(" ")).toBe(false);
  expect(hasDisplayName(undefined)).toBe(false);
});
