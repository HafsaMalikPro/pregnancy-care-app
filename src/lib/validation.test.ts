import { describe, expect, it } from "vitest";
import { signupProblems } from "./validation";

describe("signupProblems", () => {
  it("passes valid input", () => {
    expect(signupProblems({ name: "Amira", email: "a@example.com", password: "twelve chars!" })).toEqual([]);
  });
  it("reports each problem in plain language", () => {
    expect(signupProblems({ name: " ", email: "nope", password: "short" })).toEqual([
      "Enter your name.",
      "Enter a valid email address.",
      "Use at least 8 characters for your password.",
    ]);
  });
});
