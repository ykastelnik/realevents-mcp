export class ManageTokenMissingError extends Error {
  constructor() {
    super(
      "Provide manage_token or set REALEVENTS_MANAGE_TOKEN in your MCP server config."
    );
    this.name = "ManageTokenMissingError";
  }
}

function pick(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function resolveManageToken(input?: string): string {
  const fromInput = pick(input);
  if (fromInput) return fromInput;

  const fromEnv = pick(process.env.REALEVENTS_MANAGE_TOKEN);
  if (fromEnv) return fromEnv;

  throw new ManageTokenMissingError();
}
