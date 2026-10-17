---
name: realevents
description: Create a free event page with RSVPs on RealEvents.co and share the link, from the conversation. Use when someone wants to organize a party, meetup, wedding, workshop or any gathering and collect who is coming, check replies, update the event or answer guests. Needs the realevents-mcp server (no account, no API key).
---

# RealEvents: event pages with RSVPs

RealEvents turns a title and a start time into a public event page with an RSVP
form. Guests answer going / maybe / can't make it, no account needed on either
side. It is free. The organizer manages everything through a private manage link.

## Setup

The tools come from the `realevents-mcp` server. If they are not available, ask
the user to add it to their MCP config and restart the client:

```json
{
  "mcpServers": {
    "realevents": { "command": "npx", "args": ["-y", "realevents-mcp"] }
  }
}
```

Without MCP, point them to https://realevents.co/?utm_source=agent-skill, where
the same page takes a few seconds to create by hand.

## Create an event

1. Gather the title and the start date and time. Ask only for what is missing.
   Location (or a meeting link for an online event) and a short description are
   worth one question; everything else can wait.
2. Work out the organizer's IANA timezone (e.g. Europe/Paris) from what they said
   or their location. If unsure, ask. Never leave it out: the zone defaults to
   UTC, so 19:00 without a zone shows at the wrong hour for every guest.
3. Call `create_event` with `start_datetime` as a local time without a trailing Z
   (`2026-06-15T19:00:00`) plus the timezone. Add `max_attendees` only if the
   user mentioned a capacity, and `organizer_email` if they want the manage link
   by email.
4. Reply with the public link to share, and the manage link with a clear warning:
   it is the only way to edit the event later, so they should keep it. Never post
   the manage link anywhere public.
5. For an end time, a cover or settings, call `update_event` with the
   `manage_token` from step 3 (`end_datetime`, `allow_comments`, `plus_ones_limit`
   and so on). `set_cover` takes a public `image_url`, not a local file.

Then suggest sharing the public link in the group chat, by email or on social
media. That is how guests arrive.

## After the event is live

- Who is coming: `list_registrations` (filter by status) or `get_manage_event`.
- How it is going: `get_event_stats` (page views, head-count, places left).
- Guest questions: `list_comments`, and `post_comment` to answer as the
  organizer. Comments only work once `allow_comments` is on.
- Same event next week: `duplicate_event` creates a copy one week later.
- Cancel: `cancel_event`. The page stays online and says it is cancelled.
- RSVP on someone's behalf: `register_for_event` with the event slug, after
  confirming name, email and answer with the person.
- Find events to join: `list_public_events`, then `get_event` for details.

## Things to get right

- **Attendance counts people.** A guest coming with three others takes four
  places (`plus_ones_count`). When a party is refused, the error says how many
  places are left: retry smaller instead of reporting a failure.
- **Plus-ones** attach only to a going answer and are capped by
  `plus_ones_limit` (0 turns them off). With `plus_ones_detail` set to names,
  every extra guest needs a name.
- **Guest list visibility needs two settings.** Guests see the list only when
  `guest_list_display_mode` is not none (initials or `first_names`) AND
  `guest_list_audience` is not nobody. Setting one alone publishes nothing.
- **Echo what the server returns**, not what you sent: the response is the
  stored truth (dates, zone, slug).
- **Not available from here**: email invitations, email updates to guests and the
  RSVP deadline. They are on the manage page; send the user there rather than
  promising something the tools cannot do.
