/** Client-side checks that mirror the API's rules, so people see problems before submitting. */

// Mirrors PASSWORD_MIN_LENGTH / maxPasswordLength in the API's Better Auth config.
export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function signupProblems(input: { name: string; email: string; password: string }) {
  const problems: string[] = [];
  if (!input.name.trim()) problems.push("Enter your name.");
  if (!EMAIL.test(input.email.trim())) problems.push("Enter a valid email address.");
  if (input.password.length < PASSWORD_MIN_LENGTH) {
    problems.push(`Use at least ${PASSWORD_MIN_LENGTH} characters for your password.`);
  } else if (input.password.length > PASSWORD_MAX_LENGTH) {
    problems.push(`Use at most ${PASSWORD_MAX_LENGTH} characters for your password.`);
  }
  return problems;
}
