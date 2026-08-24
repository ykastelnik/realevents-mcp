import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatDirectory,
  formatEvent,
  formatManageEvent,
  formatRegistrations,
  stripHtml
} from "../../src/lib/formatters.js";
import type { ApiEvent, ApiRegistration, ApiDirectoryResponse } from "../../src/types.js";

const PUBLIC_BASE = "https://realevents.co";

function makeEvent(overrides: Partial<ApiEvent> = {}): ApiEvent {
  return {
    id: 1,
    title: "Bordeaux Tech Meetup",
    slug: "bordeaux-tech-meetup",
    format: "in_person",
    status: "published",
    start_datetime: "2026-06-15T19:00:00Z",
    end_datetime: null,
    description: null,
    location: null,
    virtual_link: null,
    max_attendees: null,
    registrations_count: 0,
    ...overrides
  };
}

function makeRegistration(overrides: Partial<ApiRegistration> = {}): ApiRegistration {
  return {
    id: 1,
    email: "marie@example.com",
    first_name: "Marie",
    last_name: "Dupont",
    status: "confirmed",
    created_at: "2026-03-15T10:00:00Z",
    ...overrides
  };
}

describe("stripHtml", () => {
  it("removes simple tags", () => {
    expect(stripHtml("<p>hello</p>")).toBe("hello");
  });

  it("removes nested tags", () => {
    expect(stripHtml("<div><strong>hello</strong> <em>world</em></div>")).toBe("hello world");
  });

  it("decodes common HTML entities", () => {
    expect(stripHtml("Tom &amp; Jerry &lt;3 &quot;cheese&quot;")).toBe('Tom & Jerry <3 "cheese"');
  });

  it("removes script tags entirely including their content", () => {
    expect(stripHtml('safe<script>alert("xss")</script>still safe')).toBe("safestill safe");
  });

  it("removes style tags entirely including their content", () => {
    expect(stripHtml("text<style>body{color:red}</style>more")).toBe("textmore");
  });

  it("converts <br> and </p> to newlines", () => {
    expect(stripHtml("line one<br>line two")).toBe("line one\nline two");
    expect(stripHtml("<p>para one</p><p>para two</p>")).toBe("para one\npara two");
  });

  it("returns empty string for null or undefined", () => {
    expect(stripHtml(null)).toBe("");
    expect(stripHtml(undefined)).toBe("");
  });
});

describe("formatDate", () => {
  it("formats ISO 8601 UTC into a human readable string", () => {
    expect(formatDate("2026-06-15T19:00:00Z")).toMatch(/2026/);
  });

  it("returns the raw string when the date is malformed", () => {
    expect(formatDate("not-a-date")).toBe("not-a-date");
  });

  it("returns empty string for null or undefined", () => {
    expect(formatDate(null)).toBe("");
    expect(formatDate(undefined)).toBe("");
  });

  // Without an explicit zone the time was rendered in the HOST's timezone, so an
  // organizer running the MCP from New York saw a Paris event at its Eastern hour.
  // The event's own zone is the only correct frame of reference.
  it("renders the time in the event's timezone, not the host's", () => {
    // 17:00 UTC is 19:00 in Paris and 13:00 in New York.
    expect(formatDate("2026-06-15T17:00:00Z", "Europe/Paris")).toContain("7:00 PM");
    expect(formatDate("2026-06-15T17:00:00Z", "America/New_York")).toContain("1:00 PM");
  });

  it("labels the zone so the reader can tell which clock the time is on", () => {
    expect(formatDate("2026-06-15T17:00:00Z", "America/New_York")).toMatch(/EDT|GMT-4/);
  });

  it("falls back to the host timezone when the event has no zone", () => {
    expect(formatDate("2026-06-15T17:00:00Z", null)).toMatch(/2026/);
  });

  it("ignores an unusable timezone rather than throwing", () => {
    expect(() => formatDate("2026-06-15T17:00:00Z", "Not/AZone")).not.toThrow();
    expect(formatDate("2026-06-15T17:00:00Z", "Not/AZone")).toMatch(/2026/);
  });
});

describe("formatEvent", () => {
  // The RSVP deadline shipped to the API on 2026-08-21 and the MCP never learned
  // about it. Without it an assistant cannot know registrations are closed: it
  // calls register_for_event, gets a 422, and reports a failure it could have
  // predicted. Reading state is exactly what these tools are for.
  it("says when RSVPs close, so an assistant can see it coming", () => {
    const out = formatEvent(
      makeEvent({ rsvp_deadline_at: "2026-09-01T17:00:00Z", registrations_closed: false }),
      PUBLIC_BASE
    );
    expect(out).toContain("RSVP by");
  });

  it("says plainly when registrations are already closed", () => {
    const out = formatEvent(
      makeEvent({ rsvp_deadline_at: "2026-08-01T17:00:00Z", registrations_closed: true }),
      PUBLIC_BASE
    );
    expect(out).toContain("Registrations closed");
    // The deadline that caused it stays visible, so the assistant can tell the
    // user WHEN it closed rather than only that it did.
    expect(out).toMatch(/closed/i);
  });

  it("says nothing about a deadline on an event that has none", () => {
    const out = formatEvent(makeEvent(), PUBLIC_BASE);
    expect(out).not.toMatch(/RSVP by|Registrations closed/);
  });

  it("renders all populated fields", () => {
    const event = makeEvent({
      location: "Palais de la Bourse, Bordeaux",
      virtual_link: "https://meet.example/abc",
      registrations_count: 12,
      end_datetime: "2026-06-15T22:00:00Z",
      description: "<p>Join us for tech talks</p>"
    });

    const out = formatEvent(event, PUBLIC_BASE);

    expect(out).toContain("Bordeaux Tech Meetup");
    expect(out).toContain("Format: in person");
    expect(out).toContain("Location: Palais de la Bourse, Bordeaux");
    expect(out).toContain("Virtual link: https://meet.example/abc");
    expect(out).toContain("12 going");
    expect(out).toContain("Status: published");
    expect(out).toContain("Join us for tech talks");
    expect(out).toContain("https://realevents.co/e/bordeaux-tech-meetup");
  });

  it("omits absent fields", () => {
    const out = formatEvent(makeEvent(), PUBLIC_BASE);

    expect(out).not.toContain("Location:");
    expect(out).not.toContain("Virtual link:");
    expect(out).not.toContain("Description:");
    expect(out).toContain("0 going");
  });

  it("renders the date in the event's own timezone", () => {
    const out = formatEvent(
      makeEvent({ start_datetime: "2026-06-15T17:00:00Z", timezone: "America/New_York" }),
      PUBLIC_BASE
    );
    expect(out).toContain("1:00 PM");
  });

  it("reports remaining places when the event is capped", () => {
    const out = formatEvent(
      makeEvent({ max_attendees: 50, registrations_count: 12, places_remaining: 38 }),
      PUBLIC_BASE
    );
    expect(out).toContain("12 going");
    expect(out).toContain("38 spots left");
  });

  it("does not invent a spots-left figure for an uncapped event", () => {
    const out = formatEvent(
      makeEvent({ registrations_count: 12, places_remaining: null }),
      PUBLIC_BASE
    );
    expect(out).toContain("12 going");
    expect(out).not.toContain("spots left");
  });

  it("shows the maybe count only when maybe responses are enabled", () => {
    const withMaybe = formatEvent(
      makeEvent({ allow_maybe: true, maybe_registrations_count: 4 }),
      PUBLIC_BASE
    );
    expect(withMaybe).toContain("4 maybe");

    const withoutMaybe = formatEvent(
      makeEvent({ allow_maybe: false, maybe_registrations_count: 0 }),
      PUBLIC_BASE
    );
    expect(withoutMaybe).not.toContain("maybe");
  });

  it("advertises the plus-ones allowance so a caller knows what it may request", () => {
    const out = formatEvent(
      makeEvent({ plus_ones_limit: 3, plus_ones_detail: "names" }),
      PUBLIC_BASE
    );
    expect(out).toContain("Plus-ones: up to 3");
    expect(out).toContain("names");
  });

  it("says nothing about plus-ones when the event disallows them", () => {
    const out = formatEvent(makeEvent({ plus_ones_limit: 0 }), PUBLIC_BASE);
    expect(out).not.toContain("Plus-ones");
  });
});

describe("formatRegistrations", () => {
  it("returns the empty message when there are no registrations", () => {
    expect(formatRegistrations([])).toBe("No registrations yet.");
  });

  it("renders each registration on its own line with index", () => {
    const regs: ApiRegistration[] = [
      {
        id: 1,
        email: "marie@example.com",
        first_name: "Marie",
        last_name: "Dupont",
        status: "confirmed",
        created_at: "2026-03-15T10:00:00Z"
      },
      {
        id: 2,
        email: "jean@example.com",
        first_name: null,
        last_name: null,
        status: "confirmed",
        created_at: "2026-03-16T10:00:00Z"
      }
    ];

    const out = formatRegistrations(regs);
    const lines = out.split("\n");
    expect(lines[0]).toContain("Marie Dupont");
    expect(lines[0]).toContain("marie@example.com");
    expect(lines[0]).toContain("confirmed");
    expect(lines[1]).toContain("jean@example.com");
    expect(lines[1]).not.toMatch(/^\s*2\.\s+\(/); // no leading orphan parenthesis when no name
  });

  // The head-count includes plus-ones, so a list that shows only rows silently
  // disagrees with the "N going" total the organizer sees everywhere else.
  it("shows plus-ones so the list reconciles with the head-count", () => {
    const out = formatRegistrations([
      makeRegistration({ plus_ones_count: 2, plus_one_names: ["Ana", "Luc"] })
    ]);
    expect(out).toContain("+2");
    expect(out).toContain("Ana");
    expect(out).toContain("Luc");
  });

  it("shows the count alone when the organizer collects no names", () => {
    const out = formatRegistrations([makeRegistration({ plus_ones_count: 3, plus_one_names: [] })]);
    expect(out).toContain("+3");
  });

  it("omits the plus-ones marker for a guest coming alone", () => {
    const out = formatRegistrations([makeRegistration({ plus_ones_count: 0 })]);
    expect(out).not.toContain("+0");
  });

  it("flags a bounced invitation so the organizer can chase another address", () => {
    const out = formatRegistrations([makeRegistration({ bounced: true })]);
    expect(out.toLowerCase()).toContain("bounced");
  });

  it("includes the guest's note when they left one", () => {
    const out = formatRegistrations([makeRegistration({ response_note: "Arriving late" })]);
    expect(out).toContain("Arriving late");
  });
});

describe("formatManageEvent", () => {
  // The organizer's own view. attendee_goal has been settable through
  // update_event since 1.4.0 but was never READ back, so an assistant could set
  // a goal and then not see it - it had no way to report progress against the
  // number it had just written.
  it("shows the attendee goal it can already set", () => {
    const out = formatManageEvent(makeEvent({ attendee_goal: 80 }), [], "tok123", PUBLIC_BASE);
    expect(out).toContain("80");
    expect(out).toMatch(/goal/i);
  });

  it("shows the RSVP deadline to the organizer too", () => {
    const out = formatManageEvent(
      makeEvent({ rsvp_deadline_at: "2026-09-01T17:00:00Z", registrations_closed: false }),
      [],
      "tok123",
      PUBLIC_BASE
    );
    expect(out).toMatch(/RSVP by/);
  });

  it("renders the manage view with registrations and links", () => {
    const event = makeEvent({
      location: "Bordeaux",
      registrations_count: 1,
      page_views: 42
    });
    const regs: ApiRegistration[] = [
      {
        id: 1,
        email: "x@y.com",
        first_name: "X",
        last_name: "Y",
        status: "confirmed",
        created_at: "2026-03-15T10:00:00Z"
      }
    ];

    const out = formatManageEvent(event, regs, "tok123", PUBLIC_BASE);

    expect(out).toContain("Bordeaux Tech Meetup (manage view)");
    expect(out).toContain("Page views: 42");
    expect(out).toContain("Guest list (1 row)");
    expect(out).toContain("x@y.com");
    expect(out).toContain("https://realevents.co/e/bordeaux-tech-meetup");
    expect(out).toContain("https://realevents.co/manage/tok123");
  });
});

describe("formatDirectory", () => {
  it("renders the empty state when there are no events", () => {
    const response: ApiDirectoryResponse = {
      events: [],
      meta: { page: 1, per_page: 12, total: 0, total_pages: 0 }
    };
    expect(formatDirectory(response, PUBLIC_BASE)).toContain("No events found");
  });

  it("renders events with pagination hint when more pages exist", () => {
    const response: ApiDirectoryResponse = {
      events: [
        {
          id: 1,
          title: "Event A",
          slug: "event-a",
          format: "in_person",
          start_datetime: "2026-06-15T19:00:00Z",
          location: "Bordeaux"
        }
      ],
      meta: { page: 1, per_page: 1, total: 5, total_pages: 5 }
    };

    const out = formatDirectory(response, PUBLIC_BASE);
    expect(out).toContain("Event A");
    expect(out).toContain("https://realevents.co/e/event-a");
    expect(out).toContain("page 1/5");
    expect(out).toMatch(/page: 2/);
  });

  it("does not show pagination hint on the last page", () => {
    const response: ApiDirectoryResponse = {
      events: [
        {
          id: 1,
          title: "Event A",
          slug: "event-a",
          format: "virtual",
          start_datetime: "2026-06-15T19:00:00Z",
          location: null
        }
      ],
      meta: { page: 1, per_page: 12, total: 1, total_pages: 1 }
    };

    const out = formatDirectory(response, PUBLIC_BASE);
    expect(out).not.toMatch(/page: 2/);
  });
});
