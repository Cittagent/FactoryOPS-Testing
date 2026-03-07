"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import {
  addNotificationEmail,
  CurrencyCode,
  getNotificationChannels,
  getTariffConfig,
  NotificationEmail,
  removeNotificationEmail,
  saveTariffConfig,
} from "@/lib/settingsApi";
import { formatIST } from "@/lib/utils";

const PAGE_SIZE = 5;

function formatTariff(rate: number | null, currency: CurrencyCode) {
  if (rate == null) return "Not configured";
  const symbol = currency === "INR" ? "₹" : currency === "USD" ? "$" : "€";
  return `${symbol}${rate.toFixed(2)} / kWh`;
}

function formatDate(value: string | null) {
  return formatIST(value, "Never");
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [savingTariff, setSavingTariff] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [emails, setEmails] = useState<NotificationEmail[]>([]);
  const [emailInput, setEmailInput] = useState("");
  const [emailPage, setEmailPage] = useState(1);

  const [rateInput, setRateInput] = useState<string>("");
  const [currency, setCurrency] = useState<CurrencyCode>("INR");
  const [currentTariff, setCurrentTariff] = useState<{ rate: number | null; currency: CurrencyCode; updated_at: string | null }>({
    rate: null,
    currency: "INR",
    updated_at: null,
  });

  const totalPages = Math.max(1, Math.ceil(emails.length / PAGE_SIZE));
  const pagedEmails = useMemo(
    () => emails.slice((emailPage - 1) * PAGE_SIZE, emailPage * PAGE_SIZE),
    [emails, emailPage]
  );

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [channels, tariff] = await Promise.all([
        getNotificationChannels(),
        getTariffConfig(),
      ]);
      setEmails(channels.email || []);
      setCurrentTariff({
        rate: tariff.rate,
        currency: tariff.currency,
        updated_at: tariff.updated_at,
      });
      setCurrency(tariff.currency || "INR");
      setRateInput(tariff.rate == null ? "" : String(tariff.rate));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (emailPage > totalPages) setEmailPage(totalPages);
  }, [emailPage, totalPages]);

  async function handleAddEmail(e: FormEvent) {
    e.preventDefault();
    if (!emailInput.trim()) return;
    setSavingEmail(true);
    setError(null);
    try {
      await addNotificationEmail(emailInput.trim());
      setEmailInput("");
      await loadAll();
      setToast("Email recipient added");
      setTimeout(() => setToast(null), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add email");
    } finally {
      setSavingEmail(false);
    }
  }

  async function handleRemoveEmail(id: number) {
    setError(null);
    try {
      await removeNotificationEmail(id);
      await loadAll();
      setToast("Email recipient removed");
      setTimeout(() => setToast(null), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove email");
    }
  }

  async function handleApplyTariff(e: FormEvent) {
    e.preventDefault();
    const parsed = Number(rateInput);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError("Rate must be a valid positive number");
      return;
    }
    setSavingTariff(true);
    setError(null);
    try {
      const saved = await saveTariffConfig({ rate: parsed, currency, updated_by: "settings-ui" });
      setCurrentTariff(saved);
      setToast("Tariff updated");
      setTimeout(() => setToast(null), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update tariff");
    } finally {
      setSavingTariff(false);
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
          <p className="text-slate-500 mt-1">Configure alert recipients and platform tariff</p>
        </div>

        {toast && (
          <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
            {toast}
          </div>
        )}
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Alert Notifications</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <form className="flex gap-2" onSubmit={handleAddEmail}>
              <div className="flex-1">
                <Input
                  type="email"
                  label="Add email address"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="alerts@company.com"
                />
              </div>
              <div className="pt-6">
                <Button type="submit" disabled={savingEmail}>
                  {savingEmail ? "Adding..." : "Add"}
                </Button>
              </div>
            </form>

            <div className="rounded-lg border border-slate-200">
              {pagedEmails.length === 0 ? (
                <div className="p-4 text-sm text-slate-500">No recipients configured.</div>
              ) : (
                <ul>
                  {pagedEmails.map((entry) => (
                    <li key={entry.id} className="flex items-center justify-between border-b border-slate-100 px-4 py-3 last:border-b-0">
                      <span className="text-sm text-slate-800">{entry.value}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveEmail(entry.id)}
                        className="rounded-md px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                        aria-label={`Remove ${entry.value}`}
                      >
                        X
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex items-center justify-between">
              <div className="text-xs text-slate-500">
                Page {emailPage} of {totalPages}
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" disabled={emailPage <= 1} onClick={() => setEmailPage((p) => p - 1)}>
                  Prev
                </Button>
                <Button type="button" variant="secondary" disabled={emailPage >= totalPages} onClick={() => setEmailPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            </div>

            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              When a rule fires with channel &quot;email&quot;, alerts are sent to all active recipients listed here.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tariff Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <form className="grid grid-cols-1 gap-3 md:grid-cols-3" onSubmit={handleApplyTariff}>
              <Input
                label="Energy Rate (per kWh)"
                type="number"
                min="0"
                step="0.01"
                value={rateInput}
                onChange={(e) => setRateInput(e.target.value)}
                placeholder="8.50"
              />
              <Select
                label="Currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
                options={[
                  { value: "INR", label: "INR" },
                  { value: "USD", label: "USD" },
                  { value: "EUR", label: "EUR" },
                ]}
              />
              <div className="pt-6">
                <Button type="submit" disabled={savingTariff}>
                  {savingTariff ? "Applying..." : "Apply"}
                </Button>
              </div>
            </form>

            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              Current tariff: {formatTariff(currentTariff.rate, currentTariff.currency)}<br />
              Last updated: {formatDate(currentTariff.updated_at)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>WhatsApp & SMS</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-md border border-slate-200 bg-slate-100 p-3 opacity-70">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700">WhatsApp</span>
                  <span className="rounded bg-slate-300 px-2 py-0.5 text-[10px] font-semibold text-slate-700">Coming Soon</span>
                </div>
                <input className="w-full rounded border border-slate-300 bg-slate-200 px-2 py-1 text-sm" disabled placeholder="Disabled" />
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-100 p-3 opacity-70">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700">SMS</span>
                  <span className="rounded bg-slate-300 px-2 py-0.5 text-[10px] font-semibold text-slate-700">Coming Soon</span>
                </div>
                <input className="w-full rounded border border-slate-300 bg-slate-200 px-2 py-1 text-sm" disabled placeholder="Disabled" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
