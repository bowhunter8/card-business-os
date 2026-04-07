"use client";

import { FormEvent, useEffect, useState } from "react";

type ShippingProfile = {
  id: string;
  name: string;
  shipping_charged_default: number | null;
  supplies_cost_default: number | null;
};

export default function ShippingSettingsPage() {
  const [profiles, setProfiles] = useState<ShippingProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [shippingChargedDefault, setShippingChargedDefault] = useState("");
  const [suppliesCostDefault, setSuppliesCostDefault] = useState("");

  async function loadProfiles() {
    try {
      setLoading(true);

      const response = await fetch("/api/shipping-profiles", {
        method: "GET",
        cache: "no-store",
      });

      const json = await response.json();

      if (!response.ok) {
        throw new Error(json?.error || "Failed to load shipping profiles");
      }

      setProfiles(Array.isArray(json) ? json : []);
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Failed to load shipping profiles");
      setProfiles([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProfiles();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!name.trim()) {
      alert("Profile name is required.");
      return;
    }

    try {
      setSaving(true);

      const response = await fetch("/api/shipping-profiles", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: name.trim(),
          shipping_charged_default: shippingChargedDefault === "" ? 0 : Number(shippingChargedDefault),
          supplies_cost_default: suppliesCostDefault === "" ? 0 : Number(suppliesCostDefault),
        }),
      });

      const json = await response.json();

      if (!response.ok) {
        throw new Error(json?.error || "Failed to save shipping profile");
      }

      setName("");
      setShippingChargedDefault("");
      setSuppliesCostDefault("");

      await loadProfiles();
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Failed to save shipping profile");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    const confirmed = window.confirm("Delete this shipping profile?");
    if (!confirmed) return;

    try {
      const response = await fetch(`/api/shipping-profiles/${id}`, {
        method: "DELETE",
      });

      const json = await response.json();

      if (!response.ok) {
        throw new Error(json?.error || "Failed to delete shipping profile");
      }

      await loadProfiles();
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Failed to delete shipping profile");
    }
  }

  function money(value: number | null | undefined) {
    return Number(value ?? 0).toFixed(2);
  }

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Shipping Profiles</h1>
        <p className="text-sm text-gray-600 mt-1">
          Profiles store defaults for shipping charged and supplies cost only. Actual postage is entered on each sale.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="border rounded-lg bg-white p-4 space-y-4">
        <h2 className="text-lg font-semibold">Add Shipping Profile</h2>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1">
            <label className="block text-sm font-medium">Profile Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="PWE, BMWT, etc."
              className="border rounded px-3 py-2 w-full"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-sm font-medium">Shipping Charged Default</label>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={shippingChargedDefault}
              onChange={(e) => setShippingChargedDefault(e.target.value)}
              placeholder="0.00"
              className="border rounded px-3 py-2 w-full"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-sm font-medium">Supplies Cost Default</label>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={suppliesCostDefault}
              onChange={(e) => setSuppliesCostDefault(e.target.value)}
              placeholder="0.00"
              className="border rounded px-3 py-2 w-full"
            />
          </div>
        </div>

        <div>
          <button
            type="submit"
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded"
          >
            {saving ? "Saving..." : "Save Profile"}
          </button>
        </div>
      </form>

      <div className="border rounded-lg bg-white">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold">Existing Profiles</h2>
        </div>

        {loading ? (
          <div className="p-4 text-sm text-gray-600">Loading profiles...</div>
        ) : profiles.length === 0 ? (
          <div className="p-4 text-sm text-gray-600">No shipping profiles found.</div>
        ) : (
          <div className="divide-y">
            {profiles.map((profile) => (
              <div
                key={profile.id}
                className="p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <div className="font-semibold">{profile.name}</div>
                  <div className="text-sm text-gray-600">
                    Shipping Charged Default: ${money(profile.shipping_charged_default)}
                    <span className="mx-2">|</span>
                    Supplies Cost Default: ${money(profile.supplies_cost_default)}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleDelete(profile.id)}
                  className="bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}