import type {
  ApiDirectoryResponse,
  ApiEvent,
  ApiRegistration
} from "../types.js";

const ENTITY_MAP: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " "
};

export function stripHtml(input: string | null | undefined): string {
  if (!input) return "";
  let out = input;
  out = out.replace(/<script[\s\S]*?<\/script>/gi, "");
  out = out.replace(/<style[\s\S]*?<\/style>/gi, "");
  out = out.replace(/<\s*br\s*\/?\s*>/gi, "\n");
  out = out.replace(/<\/p>/gi, "\n");
  out = out.replace(/<[^>]+>/g, "");
  out = out.replace(/&[a-zA-Z#0-9]+;/g, (match) => ENTITY_MAP[match] ?? match);
  return out.replace(/\n{3,}/g, "\n\n").replace(/\n+$/g, "").trim();
}

export function formatDate(input: string | null | undefined): string {
  if (!input) return "";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return input;
  return date.toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  });
}

function humanFormat(format: string): string {
  return format.replace(/_/g, " ");
}

export function formatEvent(event: ApiEvent, publicBase: string): string {
  const lines: string[] = [
    event.title,
    `Format: ${humanFormat(event.format)}`,
    `Date: ${formatDate(event.start_datetime)}`
  ];
  if (event.end_datetime) lines.push(`End: ${formatDate(event.end_datetime)}`);
  if (event.location) lines.push(`Location: ${event.location}`);
  if (event.virtual_link) lines.push(`Virtual link: ${event.virtual_link}`);
  if (event.max_attendees != null) lines.push(`Max attendees: ${event.max_attendees}`);
  lines.push(`Registrations: ${event.registrations_count} people`);
  lines.push(`Status: ${event.status}`);

  if (event.description) {
    const stripped = stripHtml(event.description);
    if (stripped) lines.push("", "Description:", stripped);
  }

  lines.push("", `Public link: ${publicBase}/e/${event.slug}`);
  return lines.join("\n");
}

export function formatRegistrations(registrations: ApiRegistration[]): string {
  if (registrations.length === 0) return "No registrations yet.";

  return registrations
    .map((r, i) => {
      const namePart = [r.first_name, r.last_name].filter(Boolean).join(" ").trim();
      const prefix = `${i + 1}.`;
      const identity = namePart.length > 0 ? `${namePart} (${r.email})` : r.email;
      return `${prefix} ${identity} - ${r.status} - ${formatDate(r.created_at)}`;
    })
    .join("\n");
}

export function formatManageEvent(
  event: ApiEvent,
  registrations: ApiRegistration[],
  manageToken: string,
  publicBase: string
): string {
  const headerBits: string[] = [`Status: ${event.status}`, `Format: ${humanFormat(event.format)}`];
  if (event.page_views != null) headerBits.push(`Page views: ${event.page_views}`);

  const lines: string[] = [
    `${event.title} (manage view)`,
    headerBits.join(" | "),
    `Date: ${formatDate(event.start_datetime)}`
  ];
  if (event.end_datetime) lines.push(`End: ${formatDate(event.end_datetime)}`);
  if (event.location) lines.push(`Location: ${event.location}`);
  if (event.virtual_link) lines.push(`Virtual link: ${event.virtual_link}`);
  if (event.max_attendees != null) lines.push(`Max attendees: ${event.max_attendees}`);
  if (event.organizer_email) lines.push(`Organizer email: ${event.organizer_email}`);

  lines.push("", `Registrations (${registrations.length}):`, formatRegistrations(registrations));

  lines.push(
    "",
    `Public link: ${publicBase}/e/${event.slug}`,
    `Manage link: ${publicBase}/manage/${manageToken}`
  );

  return lines.join("\n");
}

export function formatDirectory(response: ApiDirectoryResponse, publicBase: string): string {
  if (response.events.length === 0) {
    return "No events found matching your filters.";
  }

  const { page, total_pages, total } = response.meta;
  const header = `Upcoming events (${total} total, page ${page}/${total_pages}):`;

  const items = response.events.map((event, i) => {
    const where = event.location ?? (event.format === "virtual" ? "virtual" : "TBD");
    return [
      `${i + 1}. ${event.title} - ${formatDate(event.start_datetime)} - ${humanFormat(event.format)} - ${where}`,
      `   ${publicBase}/e/${event.slug}`
    ].join("\n");
  });

  const lines = [header, "", ...items];
  if (page < total_pages) {
    lines.push("", `Use page: ${page + 1} to see more.`);
  }
  return lines.join("\n");
}
