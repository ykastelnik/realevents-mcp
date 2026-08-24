import type { ApiDirectoryResponse, ApiEvent, ApiRegistration } from "../types.js";

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
  out = out.replace(/&[a-zA-Z#0-9]+;/g, (match) => {
    // eslint-disable-next-line security/detect-object-injection -- ENTITY_MAP is a closed lookup table, fallback is the raw match
    return ENTITY_MAP[match] ?? match;
  });
  return out
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\n+$/g, "")
    .trim();
}

/**
 * Renders a timestamp in the EVENT's timezone, not the host's.
 *
 * Without the zone, the time was formatted against whatever clock the machine
 * running the MCP happened to be on, so an organizer in New York saw a Paris
 * event at its Eastern hour. An unusable zone degrades to the host default
 * rather than throwing - a mis-set timezone must not break a whole tool call.
 */
export function formatDate(input: string | null | undefined, timezone?: string | null): string {
  if (!input) return "";
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return input;

  const options: Intl.DateTimeFormatOptions = {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  };

  if (timezone) {
    try {
      return date.toLocaleString("en-US", { ...options, timeZone: timezone });
    } catch {
      // Invalid IANA name: fall through to the host zone below.
    }
  }
  return date.toLocaleString("en-US", options);
}

function humanFormat(format: string): string {
  return format.replace(/_/g, " ");
}

/**
 * Attendance line. `registrations_count` is a HEAD-count (confirmed rows plus their
 * plus-ones), so it is deliberately labelled "going" rather than "registrations":
 * calling it a row count made it disagree with the guest list.
 */
function attendanceLine(event: ApiEvent): string {
  const parts = [`${event.registrations_count} going`];
  if (event.places_remaining != null) {
    parts.push(`${event.places_remaining} spots left`);
  }
  if (event.allow_maybe && event.maybe_registrations_count) {
    parts.push(`${event.maybe_registrations_count} maybe`);
  }
  return `Attendance: ${parts.join(" | ")}`;
}

export function formatEvent(event: ApiEvent, publicBase: string): string {
  const lines: string[] = [
    event.title,
    `Format: ${humanFormat(event.format)}`,
    `Date: ${formatDate(event.start_datetime, event.timezone)}`
  ];
  if (event.end_datetime) lines.push(`End: ${formatDate(event.end_datetime, event.timezone)}`);
  if (event.location) lines.push(`Location: ${event.location}`);
  if (event.virtual_link) lines.push(`Virtual link: ${event.virtual_link}`);
  if (event.max_attendees != null) lines.push(`Max attendees: ${event.max_attendees}`);
  lines.push(attendanceLine(event));
  // Tell the caller what a register_for_event call may legitimately ask for, so it
  // can size a plus-ones request instead of discovering the limit through a 422.
  if (event.plus_ones_limit) {
    const detail = event.plus_ones_detail === "names" ? "names required" : "count only";
    lines.push(`Plus-ones: up to ${event.plus_ones_limit} per guest (${detail})`);
  }
  // The deadline, and whether it has already passed. Without this an assistant
  // cannot know registrations are closed: it calls register_for_event, gets a
  // 422, and reports a failure it could have predicted from the event it just
  // read. "Closed" wins over the cap for the same reason it does on the page:
  // it is the organizer's decision, not a computed condition.
  if (event.registrations_closed) {
    lines.push(
      event.rsvp_deadline_at
        ? `Registrations closed (RSVP deadline was ${formatDate(event.rsvp_deadline_at, event.timezone)})`
        : "Registrations closed"
    );
  } else if (event.rsvp_deadline_at) {
    lines.push(`RSVP by ${formatDate(event.rsvp_deadline_at, event.timezone)}`);
  }
  // The guest list, exactly as the server chose to disclose it. Never re-derive
  // entitlement from the two settings here: the server already applied them, so
  // an empty list means "nothing to show", never "hidden by us". Plus-ones are a
  // count and never names, because a plus-one's name was typed by the guest
  // bringing them and they never agreed to it being published.
  if (event.guest_list?.length) {
    const plusOnes = event.guest_list_plus_ones ?? 0;
    const extra = plusOnes > 0 ? ` (+${plusOnes} unnamed plus-${plusOnes === 1 ? "one" : "ones"})` : "";
    lines.push(`Attending: ${event.guest_list.join(", ")}${extra}`);
  }
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
      const identity = namePart.length > 0 ? `${namePart} (${r.email})` : r.email;

      const bits = [`${i + 1}. ${identity}`, r.status];
      if (r.plus_ones_count) {
        const names = (r.plus_one_names ?? []).filter(Boolean);
        // Names are optional: under count_only the organizer collects a number only,
        // so render the bare "+N" rather than an empty parenthesis.
        bits.push(
          names.length > 0 ? `+${r.plus_ones_count} (${names.join(", ")})` : `+${r.plus_ones_count}`
        );
      }
      if (r.bounced) bits.push("email bounced");
      bits.push(formatDate(r.created_at));

      const line = bits.join(" - ");
      // The note goes on its own indented line: it is free text and can be long
      // enough to make the row unreadable inline.
      return r.response_note ? `${line}\n   Note: ${r.response_note}` : line;
    })
    .join("\n");
}

// Two settings gate one outcome, so report the OUTCOME. Echoing a single column
// misleads in the case that matters most: an organizer who chose a format but
// left the audience at "nobody" is publishing nothing, and an assistant telling
// them "initials" would be describing a list no guest can see.
function guestListLine(event: ApiEvent): string {
  const mode = event.guest_list_display_mode ?? "none";
  const audience = event.guest_list_audience ?? "nobody";
  if (mode === "none" || audience !== "everyone") {
    return "Guest list: only you (guests do not see who is coming)";
  }
  const shown = mode === "initials" ? "initials" : "first names";
  return `Guest list: anyone with the link sees ${shown} of confirmed guests`;
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
    `Date: ${formatDate(event.start_datetime, event.timezone)}`
  ];
  if (event.end_datetime) lines.push(`End: ${formatDate(event.end_datetime, event.timezone)}`);
  if (event.timezone) lines.push(`Timezone: ${event.timezone}`);
  if (event.location) lines.push(`Location: ${event.location}`);
  if (event.virtual_link) lines.push(`Virtual link: ${event.virtual_link}`);
  if (event.max_attendees != null) lines.push(`Max attendees: ${event.max_attendees}`);
  // Organizer-only, both of them. The goal is a private target, not something a
  // guest reading the public page should see, and the deadline is repeated here
  // so the organizer's own view answers "is it still open?" without a second call.
  if (event.attendee_goal != null) lines.push(`Attendee goal: ${event.attendee_goal}`);
  if (event.registrations_closed) {
    lines.push(
      event.rsvp_deadline_at
        ? `Registrations closed (RSVP deadline was ${formatDate(event.rsvp_deadline_at, event.timezone)})`
        : "Registrations closed"
    );
  } else if (event.rsvp_deadline_at) {
    lines.push(`RSVP by ${formatDate(event.rsvp_deadline_at, event.timezone)}`);
  }
  lines.push(guestListLine(event));
  if (event.organizer_email) lines.push(`Organizer email: ${event.organizer_email}`);
  lines.push(attendanceLine(event));

  // Row count, not head-count: this labels the list below, which has one line per
  // registration. The head-count lives in the attendance line above.
  const rowLabel = registrations.length === 1 ? "row" : "rows";
  lines.push(
    "",
    `Guest list (${registrations.length} ${rowLabel}):`,
    formatRegistrations(registrations)
  );

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
    const when = formatDate(event.start_datetime, event.timezone);
    return [
      `${i + 1}. ${event.title} - ${when} - ${humanFormat(event.format)} - ${where}`,
      `   ${publicBase}/e/${event.slug}`
    ].join("\n");
  });

  const lines = [header, "", ...items];
  if (page < total_pages) {
    lines.push("", `Use page: ${page + 1} to see more.`);
  }
  return lines.join("\n");
}
