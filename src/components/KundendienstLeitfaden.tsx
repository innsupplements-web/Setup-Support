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
 function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  // Ggf. Semikolon oder Anführungszeichen maskieren
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
          Wir bieten eine <b>Solar-Wartung</b> in Kombination mit der <b>Heizkessel-Wartung</b> zum Kombipreis an – das bringt
          einen klaren Vorteil.
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
      <Section title="Photovoltaik (PV)">
        <FieldRow label="Haben Sie eine PV-Anlage?">
          <YesNo
            name="pv-vorhanden"
            value={state.pv.vorhanden}
            onChange={(v) => setState((s) => ({ ...s, pv: { ...s.pv, vorhanden: v } }))}
          />
        </FieldRow>
      </Section>
    ),
  });

  // 3a) PV-Details (nur bei Ja)
  if (state.pv.vorhanden === "ja") {
    steps.push({
      id: "pv-details",
      title: "PV-Details",
      render: ({ state, setState }) => (
        <Section title="PV – Details">
          <FieldRow label="Batteriespeicher vorhanden?">
            <YesNo
              name="pv-batterie"
              value={state.pv.batterie}
              onChange={(v) => setState((s) => ({ ...s, pv: { ...s.pv, batterie: v } }))}
            />
          </FieldRow>
          <FieldRow label="Überschuss-Nutzung mit Heizstab?">
            <YesNo
              name="pv-heizstab"
              value={state.pv.heizstabUeberschuss}
              onChange={(v) => setState((s) => ({ ...s, pv: { ...s.pv, heizstabUeberschuss: v } }))}
            />
          </FieldRow>

          {(state.pv.batterie === "nein" || state.pv.heizstabUeberschuss === "nein") && (
            <FieldRow
              label="Interesse an Nachrüstung/Optimierung?"
              hint="Bei Interesse: Rückruf durch Beratungsteam veranlassen."
            >
              <YesNo
                name="pv-upgrade"
                value={state.pv.upgradeInteresse}
                onChange={(v) =>
                  setState((s) => ({
                    ...s,
                    pv: { ...s.pv, upgradeInteresse: v },
                    followUp: {
                      ...s.followUp,
                      noetig: v === "ja" ? true : s.followUp.noetig,
                      grund: v === "ja" ? "Beratung Speicher/Optimierung PV" : s.followUp.grund,
                    },
                  }))
                }
              />
            </FieldRow>
          )}
        </Section>
      ),
    });
  }

  // 4) Zusammenfassung
  steps.push({
    id: "summary",
    title: "Zusammenfassung",
    render: ({ state, setState }) => (
      <Section title="Zusammenfassung & Nächste Schritte">
        <div className="space-y-2">
          <SummaryRow label="Solar-Anlage">
            {state.solar.vorhanden === undefined ? "—" : state.solar.vorhanden === "ja" ? "Ja" : "Nein"}
          </SummaryRow>

          {state.solar.vorhanden === "ja" && (
            <SummaryRow label="Solar-Größe">
              {state.solar.groesseBekannt === "ja"
                ? state.solar.groesseM2
                  ? `${state.solar.groesseM2} m²`
                  : state.solar.groesseRange || "(bekannt, aber nicht angegeben)"
                : state.solar.groesseBekannt === "nein"
                ? "Unbekannt"
                : "—"}
            </SummaryRow>
          )}

          <SummaryRow label="Kombi-Wartung Interesse">
            {state.angebotKombiWartung.interesse === undefined
              ? "—"
              : state.angebotKombiWartung.interesse === "ja"
              ? "Ja"
              : "Nein"}
          </SummaryRow>

          {state.angebotKombiWartung.interesse === "ja" && (
            <SummaryRow label="Kombi-Wartung Preis">
              {state.angebotKombiWartung.preisModus === "fest"
                ? state.angebotKombiWartung.preisEUR
                  ? `${state.angebotKombiWartung.preisEUR} €`
                  : "(Preis offen)"
                : state.angebotKombiWartung.preisModus === "auswahl"
                ? state.angebotKombiWartung.preisstufe || "(Stufe offen)"
                : "(nicht gewählt)"}
            </SummaryRow>
          )}

          <SummaryRow label="PV-Anlage">
            {state.pv.vorhanden === undefined ? "—" : state.pv.vorhanden === "ja" ? "Ja" : "Nein"}
          </SummaryRow>

          {state.pv.vorhanden === "ja" && (
            <>
              <SummaryRow label="Batteriespeicher">
                {state.pv.batterie === undefined ? "—" : state.pv.batterie === "ja" ? "Ja" : "Nein"}
              </SummaryRow>
              <SummaryRow label="Heizstab-Nutzung">
                {state.pv.heizstabUeberschuss === undefined
                  ? "—"
                  : state.pv.heizstabUeberschuss === "ja"
                  ? "Ja"
                  : "Nein"}
              </SummaryRow>
              {(state.pv.batterie === "nein" || state.pv.heizstabUeberschuss === "nein") && (
                <SummaryRow label="Interesse Nachrüstung/Optimierung">
                  {state.pv.upgradeInteresse === undefined
                    ? "—"
                    : state.pv.upgradeInteresse === "ja"
                    ? "Ja (Rückruf einleiten)"
                    : "Nein"}
                </SummaryRow>
              )}
            </>
          )}

          <div className="my-3 h-px bg-gray-200" />

          <FieldRow label="Follow-up nötig?">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={state.followUp.noetig}
                onChange={(e) => setState((s) => ({ ...s, followUp: { ...s.followUp, noetig: e.target.checked } }))}
              />
              <span className="text-sm text-gray-700">{state.followUp.noetig ? "Ja" : "Nein"}</span>
            </label>
          </FieldRow>

          {state.followUp.noetig && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Grund/Betreff</label>
                <input
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  placeholder="z. B. Beratung Speicher"
                  value={state.followUp.grund || ""}
                  onChange={(e) => setState((s) => ({ ...s, followUp: { ...s.followUp, grund: e.target.value } }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Notizen</label>
                <textarea
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  placeholder="Freitext für interne Hinweise"
                  rows={3}
                  value={state.followUp.notizen || ""}
                  onChange={(e) => setState((s) => ({ ...s, followUp: { ...s.followUp, notizen: e.target.value } }))}
                />
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 inline-flex items-center gap-2 rounded-xl bg-green-50 p-3 text-green-800">
          <span className="text-sm">Daten sind bereit für Export.</span>
        </div>
      </Section>
    ),
  });

  return steps;
}

/** ===== Hauptkomponente ===== */
export default function KundendienstLeitfaden() {
  const [state, setState] = useState<LeitfadenState>(() => loadFromLocalStorage() ?? { ...EMPTY_STATE });
  const [stepIndex, setStepIndex] = useState(0);
  const [copied, setCopied] = useState(false);

  const steps = useMemo(() => buildSteps(state), [state]);
  const progress = steps.length > 0 ? Math.round(((stepIndex + 1) / steps.length) * 100) : 0;

  useEffect(() => {
    saveToLocalStorage(state);
  }, [state]);

  function resetSession() {
    const fresh: LeitfadenState = {
      ...EMPTY_STATE,
      sessionId:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2),
      timestampISO: new Date().toISOString(),
    };
    setState(fresh);
    setStepIndex(0);
  }
  function next() {
    setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  }
  function prev() {
    setStepIndex((i) => Math.max(i - 1, 0));
  }

  async function handleCopyJSON() {
    const ok = await copyToClipboard(JSON.stringify(state, null, 2));
    setCopied(ok);
    setTimeout(() => setCopied(false), 1500);
  }
  function handleDownloadJSON() {
    downloadJSON(`leitfaden_${state.sessionId}.json`, state);
  }
function handleDownloadCSV() {
  const csv = buildCsvFromState(state);
  downloadCSV(`leitfaden_${state.sessionId}.csv`, csv);
}

  return (
    <div className="mx-auto max-w-3xl p-4 md:p-8">
      <div className="rounded-2xl border bg-white shadow">
        {/* Header */}
        <div className="border-b px-5 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Leitfaden Kundendienst – Bestandskunde</h1>
            <p className="text-xs text-gray-500">
              Geführter Klickablauf mit Datenerfassung (Speicherung lokal, Export/Copy als JSON).
            </p>
          </div>
          <span className="text-xs rounded-lg bg-gray-100 px-2 py-1">Session: {state.sessionId.slice(0, 8)}</span>
        </div>

        <div className="p-5">
          {/* Progress */}
          <div className="mb-4 flex items-center gap-3">
            <div className="h-2 w-full rounded bg-gray-200">
              <div className="h-2 rounded bg-blue-600" style={{ width: `${progress}%` }} />
            </div>
            <span className="text-sm text-gray-600">{progress}%</span>
          </div>

          {/* Kopfbereich */}
          <div className="rounded-xl border p-4 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Mitarbeiterin</label>
                <input
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  placeholder="Name"
                  value={state.mitarbeiterin}
                  onChange={(e) => setState((s) => ({ ...s, mitarbeiterin: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Kundenname</label>
                <input
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  placeholder="Max Mustermann"
                  value={state.kunde.name}
                  onChange={(e) => setState((s) => ({ ...s, kunde: { ...s.kunde, name: e.target.value } }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Kundennummer</label>
                <input
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  placeholder="z. B. 4711"
                  value={state.kunde.kundennummer || ""}
                  onChange={(e) =>
                    setState((s) => ({ ...s, kunde: { ...s.kunde, kundennummer: e.target.value } }))
                  }
                />
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Telefon</label>
                <input
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  placeholder="z. B. +43 ..."
                  value={state.kunde.telefon}
                  onChange={(e) => setState((s) => ({ ...s, kunde: { ...s.kunde, telefon: e.target.value } }))}
                />
              </div>
              <label className="flex items-center gap-2 mt-6 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={state.angebotKombiWartung.kommuniziert}
                  onChange={(e) =>
                    setState((s) => ({
                      ...s,
                      angebotKombiWartung: { ...s.angebotKombiWartung, kommuniziert: e.target.checked },
                    }))
                  }
                />
                <span className="text-sm">Angebot Kombi-Wartung erwähnt</span>
              </label>
            </div>
          </div>

          {/* Step-Inhalt */}
          <div key={stepIndex}>{steps[stepIndex]?.render({ state, setState })}</div>

          {/* Step Buttons */}
          <div className="mt-6 flex justify-between">
            <button
              onClick={prev}
              disabled={stepIndex === 0}
              className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 disabled:opacity-50"
            >
              Zurück
            </button>
            {stepIndex < steps.length - 1 ? (
              <button
                onClick={next}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white"
              >
                Weiter
              </button>
            ) : (
              <button disabled className="inline-flex items-center gap-2 rounded-lg bg-gray-300 px-4 py-2 text-white">
                Fertig
              </button>
            )}
          </div>

          {/* Aktionen */}
         <div className="my-6 h-px bg-gray-200" />
<div className="flex flex-wrap items-center gap-3">
  <button
    onClick={async () => {
      await handleCopyJSON();
    }}
    className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 ${
      copied ? "bg-green-50 border-green-300 text-green-800" : ""
    }`}
  >
    {copied ? "Kopiert!" : "JSON in Zwischenablage"}
  </button>

  <button
    onClick={handleDownloadJSON}
    className="inline-flex items-center gap-2 rounded-lg border px-4 py-2"
  >
    JSON herunterladen
  </button>

  <button
    onClick={handleDownloadCSV}
    className="inline-flex items-center gap-2 rounded-lg border px-4 py-2"
  >
    CSV herunterladen
  </button>

  <button
    onClick={resetSession}
    className="inline-flex items-center gap-2 rounded-lg px-4 py-2 hover:bg-gray-100"
  >
    Neue Session
  </button>
</div>

          {/* Leitfaden-Hilfetext */}
          <div className="mt-8 rounded-2xl border bg-gray-50 p-4">
            <p className="text-sm font-medium mb-2">Gesprächsleitfaden (Formulierungshilfe)</p>
            <ul className="list-disc ml-5 space-y-1 text-sm text-gray-600">
              <li><b>Solar-Anlage:</b> „Haben Sie eine Solar-Anlage bei sich am Haus?“</li>
              <li><b>Größe:</b> „Wissen Sie, wie groß die Anlage ist (in m²)?“</li>
              <li><b>Kombi-Wartung:</b> „Wir bieten eine Solar-Wartung in Kombination mit der Heizkessel-Wartung zum Kombipreis an. Hätten Sie Interesse?“</li>
              <li><b>PV:</b> „Haben Sie zusätzlich eine PV-Anlage?“</li>
              <li><b>Batterie/Heizstab:</b> „Nutzen Sie einen Batteriespeicher oder verwenden Sie den Überschuss mit einem Heizstab?“</li>
              <li><b>Optimierung:</b> „Wenn kein Speicher da ist: Möchten Sie den Eigenbedarf optimal ausnutzen oder einen Speicher nachrüsten? Dann meldet sich ein Kollege.“</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
