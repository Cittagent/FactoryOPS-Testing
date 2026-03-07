const SETTINGS_BASE = "/backend/reporting/api/v1/settings";

export type CurrencyCode = "INR" | "USD" | "EUR";

export interface NotificationEmail {
  id: number;
  value: string;
  is_active: boolean;
}

export interface NotificationChannelsResponse {
  email: NotificationEmail[];
  whatsapp: NotificationEmail[];
  sms: NotificationEmail[];
}

export interface TariffConfigResponse {
  rate: number | null;
  currency: CurrencyCode;
  updated_at: string | null;
}

export async function getNotificationChannels(): Promise<NotificationChannelsResponse> {
  const res = await fetch(`${SETTINGS_BASE}/notifications`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function addNotificationEmail(email: string): Promise<NotificationEmail> {
  const res = await fetch(`${SETTINGS_BASE}/notifications/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error?.message || error?.detail?.message || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function removeNotificationEmail(id: number): Promise<void> {
  const res = await fetch(`${SETTINGS_BASE}/notifications/email/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export async function getTariffConfig(): Promise<TariffConfigResponse> {
  const res = await fetch(`${SETTINGS_BASE}/tariff`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function saveTariffConfig(payload: {
  rate: number;
  currency: CurrencyCode;
  updated_by?: string;
}): Promise<TariffConfigResponse> {
  const res = await fetch(`${SETTINGS_BASE}/tariff`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error?.message || error?.detail?.message || `HTTP ${res.status}`);
  }
  return res.json();
}
