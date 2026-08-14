export type EventFormat = "in_person" | "virtual" | "hybrid";
export type EventStatus = "draft" | "published" | "cancelled";

/** The three answers a guest can give. `cancelled`/`pending` exist in the DB but
 *  are not reachable through a public RSVP, so they are not offered here. */
export type RsvpStatus = "confirmed" | "maybe" | "declined";

/** Whether the organizer collects a headcount or each guest's name for plus-ones. */
export type PlusOnesDetail = "count_only" | "names";

export interface ApiEvent {
  id: number;
  title: string;
  slug: string;
  format: EventFormat;
  status: EventStatus;
  start_datetime: string;
  /** IANA name. The API parses start_datetime in this zone, defaulting to UTC. */
  timezone?: string | null;
  end_datetime: string | null;
  description: string | null;
  location: string | null;
  virtual_link: string | null;
  max_attendees: number | null;
  /** HEAD-count (confirmed rows + their plus-ones), not a row count. */
  registrations_count: number;
  /** Remaining places in people, or null when the event is uncapped. */
  places_remaining?: number | null;
  maybe_registrations_count?: number;
  allow_maybe?: boolean;
  allow_notes?: boolean;
  allow_comments?: boolean;
  /** 0 disables plus-ones entirely. */
  plus_ones_limit?: number;
  plus_ones_detail?: PlusOnesDetail;
  page_views?: number;
  cover_image?: string | null;
  theme?: string | null;
  listed?: boolean;
  organizer_email?: string | null;
}

export interface ApiRegistration {
  id: number;
  email: string;
  first_name: string | null;
  last_name: string | null;
  status: string;
  created_at: string;
  response_note?: string | null;
  plus_ones_count?: number;
  plus_one_names?: string[];
  invited_at?: string | null;
  /** True when the invitation email to this address hard-bounced. */
  bounced?: boolean;
}

export interface ApiDirectoryEvent {
  id: number;
  title: string;
  slug: string;
  format: EventFormat;
  start_datetime: string;
  timezone?: string | null;
  location: string | null;
  cover_image?: string | null;
  /** HEAD-count, matching the "N going" shown on the event card. */
  registrations_count?: number;
}

export interface ApiDirectoryMeta {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

export interface ApiDirectoryResponse {
  events: ApiDirectoryEvent[];
  meta: ApiDirectoryMeta;
}

export interface ApiCreateEventResponse {
  event: ApiEvent;
  manage_url: string;
  public_url: string;
}

export interface ApiManageEventResponse {
  event: ApiEvent;
  registrations: ApiRegistration[];
  public_url: string;
  manage_url: string;
}

export interface ApiRegisterResponse {
  registration: ApiRegistration;
  event: ApiEvent;
  virtual_link?: string | null;
}

export interface ApiCommentReaction {
  emoji: string;
  count: number;
  mine: boolean;
}

/** A row in the thread. A removed comment keeps its place but carries no body or
 *  author, so every content field is optional. */
export interface ApiThreadComment {
  id: number;
  removed?: boolean;
  body?: string | null;
  /** "guest" or "host". Host posts are the organizer and carry no author name. */
  author_role?: string;
  author?: string | null;
  author_hue?: number | null;
  mine?: boolean;
  reactions?: ApiCommentReaction[];
  created_at: string;
}

export interface ApiCommentThread {
  comments: ApiThreadComment[];
  total: number;
  has_more: boolean;
}

/** The create response is a narrower shape than a thread row. */
export interface ApiHostComment {
  id: number;
  body: string;
  author_role: string;
  created_at: string;
}

/** A retired slug resolves with HTTP 200 and this shape (not an { event }), so the
 *  public show endpoint can tell a client to move to the event's current address. */
export interface ApiSlugRedirect {
  redirect: true;
  slug: string;
}

export type ApiPublicEventResponse = { event: ApiEvent } | ApiSlugRedirect;

export function isSlugRedirect(body: ApiPublicEventResponse): body is ApiSlugRedirect {
  return (body as ApiSlugRedirect).redirect === true;
}
