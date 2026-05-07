export type EventFormat = "in_person" | "virtual" | "hybrid";
export type EventStatus = "draft" | "published" | "cancelled";

export interface ApiEvent {
  id: number;
  title: string;
  slug: string;
  format: EventFormat;
  status: EventStatus;
  start_datetime: string;
  end_datetime: string | null;
  description: string | null;
  location: string | null;
  virtual_link: string | null;
  max_attendees: number | null;
  registrations_count: number;
  page_views?: number;
  cover_image?: string | null;
  theme?: string | null;
  organizer_email?: string | null;
}

export interface ApiRegistration {
  id: number;
  email: string;
  first_name: string | null;
  last_name: string | null;
  status: string;
  created_at: string;
}

export interface ApiDirectoryEvent {
  id: number;
  title: string;
  slug: string;
  format: EventFormat;
  start_datetime: string;
  location: string | null;
  cover_image?: string | null;
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
