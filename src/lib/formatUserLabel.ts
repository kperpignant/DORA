export function formatUserLabel(user: {
  name?: string | null;
  email?: string | null;
}): string {
  const name = user.name?.trim();
  const email = user.email?.trim();
  if (name && email) return `${name} — ${email}`;
  return name || email || "Unknown User";
}
