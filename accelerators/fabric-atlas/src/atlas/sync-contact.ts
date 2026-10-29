export function syncContactMessage(email: string | undefined): string {
  const normalized = email?.trim();
  const contact =
    !normalized || normalized === "undefined" || normalized === "null"
      ? "the configured synchronization administrator"
      : normalized;
  return `Ask ${contact} to run this synchronization.`;
}
