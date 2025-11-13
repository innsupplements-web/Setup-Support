"use client";

import React, { useEffect, useMemo, useState } from "react";

/** ===== Typen (ohne BC) ===== */
type YesNo = "ja" | "nein" | undefined;

interface LeitfadenState {
  sessionId: string;
  timestampISO: string;
  mitarbeiterin: string;
  kunde: { name?: string; kundennummer?: string; telefon?: string };
  solar: {
    vorhanden: YesNo;
    groesseBekannt: YesNo;
    groesseM2?: number | null;
    groesseRange?: "<20" | "20-40" | "40-60" | ">60" | undefined;
  };
  angebotKombiWartung: {
    kommuniziert: boolean;
    interesse: YesNo;
    preisModus?: "fest" | "auswahl" | undefined;
    preisEUR?: number | null;
    preisstufe?: "Basis" | "Plus" | "Premium" | undefined;
  };
  pv: {
    vorhanden: YesNo;
    batterie: YesNo;
    heizstabUeberschuss: YesNo;
    upgradeInteresse: YesNo;
  };
  followUp: { noetig: boolean; grund?: string; notizen?: string };
}

/** ===== Initialzustand ===== */
const EMPTY_STATE: LeitfadenState = {
  sessionId:
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2),
  timestampISO: new Date().toISOString(),
  mitarbeiterin: "",
  kunde: { name: "", kundennummer: "", telefon: "" },
  solar: { vorhanden: undefined, groesseBekannt: undefined, groesseM2: null, groesseRange: undefined },
  angebotKombiWartung: {
    kommuniziert: false,
    interesse: undefined,
    preisModus: undefined,
    preisEUR: null,
    preisstufe: undefined,
  },
  pv: { vorhanden: undefined, batterie: undefined, heizstabUeberschuss: undefined, upgradeInteresse: undefined },
  followUp: { noetig: false, grund: "", notizen: "" },
};

const LS_KEY = "leitfaden-bestandskunde-v1";

/** ===== Helpers (SSR-sicher) ===== */
function saveToLocalStorage(data: LeitfadenState) {
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LS_KEY, JSON.stringify(data));
    }
  } catch {}
}

function loadFromLocalStorage(): LeitfadenState | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as LeitfadenState) : null;
  } catch {
    return null;
  }
}

function downloadJSON(filename: string, data: unknown) {
  if (typeof window === "undefined") return;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function copyToClipboard(text: string) {
  try {
    if (typeof navigator === "undefined" || !navigator.clipboard) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** ===== CSV-Helper ===== */
function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(";") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCsvFromState(state: LeitfadenState): string {
  const headers = [
    "SessionId",
    "Timestamp",
    "Mitarbeiterin",
    "Kundenname",
    "Kundennummer",
    "Telefon",
    "SolarVorhanden",
    "SolarGroesseBekannt",
    "SolarGroesseM2",
    "SolarGroesseRange",
    "KombiKommuniziert",
    "KombiInteresse",
    "KombiPreisModus",
    "KombiPreisEUR",
    "KombiPreisstufe",
    "PVVorhanden",
    "PVBatterie",
    "PVHeizstab",
    "PVUpgradeInteresse",
    "FollowUpNoetig",
    "FollowUpGrund",
    "FollowUpNotizen",
  ];

  const values = [
    state.sessionId,
    state.timestampISO,
    state.mitarbeiterin,
    state.kunde.name,
    state.kunde.kundennummer,
    state.kunde.telefon,
    state.solar.vorhanden ?? "",
    state.solar.groesseBekannt ?? "",
    state.solar.groesseM2 ?? "",
    state.solar.groesseRange ?? "",
    state.angebotKombiWartung.kommuniziert ? "ja" : "nein",
    state.angebotKombiWartung.interesse ?? "",
    state.angebotKombiWartung.preisModus ?? "",
    state.angebotKombiWartung.preisEUR ?? "",
    state.angebotKombiWartung.preisstufe ?? "",
    state.pv.vorhanden ?? "",
    state.pv.batterie ?? "",
    state.pv.heizstabUeberschuss ?? "",
    state.pv.upgradeInteresse ?? "",
    state.followUp.noetig ? "ja" : "nein",
    state.followUp.grund ?? "",
    state.followUp.notizen ?? "",
  ];

  const headerRow = headers.join(";");
  const valueRow = values.map(escapeCsvValue).join(";");
  return `${headerRow}\n${valueRow}`;
}

function downloadCSV(filename: string, csv: string) {
  if (typeof window === "undefined") return;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** ===== Kleine UI-Helfer (pure Tailwind) ===== */
function YesNo({
  name,
  value,
  onChange,
}: {
  name: string;
  value: YesNo;
  onChange: (v: YesNo) => void;
}) {
  return (
    <div className="flex gap-6">
      <label className="inline-flex items-center gap-2 cursor-pointer select-none">
        <input
          type="radio"
          name={name}
          value="ja"
          checked={value === "ja"}
          onChange={() => onChange("ja")}
          className="h-4 w-4"
        />
        <span>Ja</span>
      </label>
      <label className="inline-flex items-center gap-2 cursor-pointer select-none">
        <input
          type="radio"
          name={name}
          value="nein"
          checked={value === "nein"}
          onChange={() => onChange("nein")}
          className="h-4 w-4"
        />
        <span>Nein</span>
      </label>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold mb-4">{title}</h2>
      {children}
    </section>
  );
}

function FieldRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="py-2">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
        <label className="font-medium">{label}</label>
        <div className="md:col-span-2">{children}</div>
      </div>
      {hint ? <p className="text-xs text-gray-500 mt-1">{hint}</p> : null}
    </div>
  );
}

function SummaryRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <span className="text-gray-600">{label}</span>
      <span className="font-medium">{children}</span>
    </div>
  );
}

/** ===== Steps definieren ===== */
type Step = {
  id: string;
  title: string;
  render: (ctx: {
    state: LeitfadenState;
    setState: React.Dispatch<React.SetStateAction<LeitfadenState>>;
  }) => React.ReactNode;
};

function buildSteps(state: LeitfadenState): Step[] {
  const steps: Step[] = [];

  // 1) Solar vorhanden?
  steps.push({
    id: "solar-vorhanden",
    title: "Solar-Anlage vorhanden?",
    render: ({ state, setState }) => (
      <Section title="Solar-Anlage">
        <FieldRow label="Haben Sie eine Solar-Anlage?">
          <YesNo
            name="solar-vorhanden"
            value={state.solar.vorhanden}
            onChange={(v) => setState((s) => ({ ...s, solar: { ...s.solar, vorhanden: v } }))}
          />
        </FieldRow>
      </Section>
    ),
  });

  // 1a) Größe (nur bei Ja)
  if (state.solar.vorhanden === "ja") {
    steps.push({
      id: "solar-groesse",
      title: "Solar-Größe",
      render: ({ state, setState }) => (
        <Section title="Solar-Anlage – Größe">
          <FieldRow label="Ist die Größe der Anlage bekannt?">
            <YesNo
              name="solar-groesse-bekannt"
              value={state.solar.groesseBekannt}
              onChange={(v) => setState((s) => ({ ...s, solar: { ...s.solar, groesseBekannt: v } }))}
            />
          </FieldRow>

          {state.solar.groesseBekannt === "ja" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Größe (m²) – frei</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  placeholder="z. B. 35"
                  value={state.solar.groesseM2 ?? ""}
                  onChange={(e) =>
                    setState((s) => ({
                      ...s,
                      solar: { ...s.solar, groesseM2: e.target.value === "" ? null : Number(e.target.value) },
                    }))
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">oder Bereich wählen</label>
                <select
                  value={state.solar.groesseRange ?? ""}
                  onChange={(e) =>
                    setState((s) => ({
                      ...s,
                      solar: { ...s.solar, groesseRange: ((e.target.value || undefined) as any) },
                    }))
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                >
                  <option value="" disabled>
                    Bitte wählen
                  </option>
                  <option value="<20">Kleiner als 20 m²</option>
                  <option value="20-40">20–40 m²</option>
                  <option value="40-60">40–60 m²</option>
                  <option value=">60">Größer als 60 m²</option>
                </select>
              </div>
            </div>
          )}
        </Section>
      ),
    });
  }

  // 2) Kombi-Wartung
  steps.push({
    id: "angebot-kombi",
    title: "Angebot Kombi-Wartung",
    render: ({ state, setState }) => (
      <Section title="Kombi-Wartung: Solar + Heizkessel">
        <p className="text-sm text-gray-600 mb-2">
          Wir bieten eine <b>Solar-Wartung</b> in Kombination mit der <b>Heizkessel-Wartung</b> zum Kombipreis an – das
          bringt einen klaren Vorteil.
        </p>

        <FieldRow label="Interesse am Kombi-Angebot?">
          <YesNo
            name="kombi-interesse"
            value={state.angebotKombiWartung.interesse}
            onChange={(v) =>
              setState((s) => ({ ...s, angebotKombiWartung: { ...s.angebotKombiWartung, interesse: v } }))
            }
          />
        </FieldRow>

        {state.angebotKombiWartung.interesse === "ja" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
            <div>
              <label className="block text-sm font-medium mb-1">Preis-Modus</label>
              <select
                value={state.angebotKombiWartung.preisModus ?? ""}
                onChange={(e) =>
                  setState((s) => ({
                    ...s,
                    angebotKombiWartung: {
                      ...s.angebotKombiWartung,
                      preisModus: ((e.target.value || undefined) as any),
                    },
                  }))
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
              >
                <option value="" disabled>
                  Bitte wählen
                </option>
                <option value="fest">Fester Preis (EUR)</option>
                <option value="auswahl">Preis-Stufe</option>
              </select>
            </div>

            {state.angebotKombiWartung.preisModus === "fest" && (
              <div>
                <label className="block text-sm font-medium mb-1">Preis (EUR)</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  placeholder="z. B. 199"
                  value={state.angebotKombiWartung.preisEUR ?? ""}
                  onChange={(e) =>
                    setState((s) => ({
                      ...s,
                      angebotKombiWartung: {
                        ...s.angebotKombiWartung,
                        preisEUR: e.target.value === "" ? null : Number(e.target.value),
                      },
                    }))
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                />
              </div>
            )}

            {state.angebotKombiWartung.preisModus === "auswahl" && (
              <div>
                <label className="block text-sm font-medium mb-1">Preis-Stufe</label>
                <select
                  value={state.angebotKombiWartung.preisstufe ?? ""}
                  onChange={(e) =>
                    setState((s) => ({
                      ...s,
                      angebotKombiWartung: {
                        ...s.angebotKombiWartung,
                        preisstufe: ((e.target.value || undefined) as any),
                      },
                    }))
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                >
                  <option value="" disabled>
                    Bitte wählen
                  </option>
                  <option value="Basis">Basis</option>
                  <option value="Plus">Plus</option>
                  <option value="Premium">Premium</option>
                </select>
              </div>
            )}
          </div>
        )}
      </Section>
    ),
  });

  // 3) PV vorhanden?
  steps.push({
    id: "pv-vorhanden",
    title: "PV-Anlage vorhanden?",
    render: ({ state, setState }) => (
      <Section title
