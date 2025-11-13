"use client";

import React, { useEffect, useMemo, useState } from "react";

/** ===== Typen ===== */
type YesNo = "ja" | "nein" | undefined;
type HeizkesselTyp = "Easyfire2" | "MF2/PFP";
type HeizZone = "1" | "2";

interface LeitfadenState {
  sessionId: string;
  timestampISO: string;
  mitarbeiterin: string;
  serviceartikel: string; // interne Nummer oder Text

  solar: {
    vorhanden: YesNo;
  };

  heizkessel: {
    typ?: HeizkesselTyp;
    zone?: HeizZone;
    wartungsvertrag: YesNo;
  };

  angebot: {
    variante?: "nur-heizkessel" | "nur-solar" | "kombi" | undefined;
  };

  followUp: { noetig: boolean; grund?: string; notizen?: string };
}

/** ===== Preis-Tabelle (netto) ===== */

const SOLAR_EINZELPREIS = 330; // immer
const SOLAR_KOMBIANTEIL = 169; // zusätzlicher Anteil im Kombi-Paket

const HEIZKessel_PREISE: Record<
  HeizkesselTyp,
  Record<
    HeizZone,
    {
      mitVertrag: number;
      ohneVertrag: number;
    }
  >
> = {
  Easyfire2: {
    "1": { mitVertrag: 316.8, ohneVertrag: 416.4 },
    "2": { mitVertrag: 363.6, ohneVertrag: 464.4 },
  },
  "MF2/PFP": {
    "1": { mitVertrag: 471.6, ohneVertrag: 558 },
    // Zahlen wie von dir angegeben: Zone 2 mit 589,20 – ohne 486,00
    "2": { mitVertrag: 589.2, ohneVertrag: 486 },
  },
};

/** ===== Initialzustand ===== */

const EMPTY_STATE: LeitfadenState = {
  sessionId:
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2),
  timestampISO: new Date().toISOString(),
  mitarbeiterin: "",
  serviceartikel: "",
  solar: { vorhanden: undefined },
  heizkessel: { wartungsvertrag: undefined },
  angebot: { variante: undefined },
  followUp: { noetig: false, grund: "", notizen: "" },
};

const LS_KEY = "leitfaden-bestandskunde-v2";

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

/** ===== CSV-Helper ===== */

function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(";") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Preise aus State berechnen */
function calcPrices(state: LeitfadenState) {
  const { heizkessel } = state;
  const typ = heizkessel.typ;
  const zone = heizkessel.zone;
  const vw = heizkessel.wartungsvertrag;

  let heizpreis: number | null = null;

  if (typ && zone && vw) {
    const t = HEIZKessel_PREISE[typ][zone];
    heizpreis = vw === "ja" ? t.mitVertrag : t.ohneVertrag;
  }

  const solarEinzel = SOLAR_EINZELPREIS;
  const solarKombi = SOLAR_KOMBIANTEIL;

  const kombiGesamt = heizpreis !== null ? heizpreis + solarKombi : null;
  const ersparnisKombi =
    heizpreis !== null ? solarEinzel - solarKombi : null; // Einsparung nur beim Solar-Anteil

  return {
    heizpreis,
    solarEinzel,
    solarKombi,
    kombiGesamt,
    ersparnisKombi,
  };
}

function buildCsvFromState(state: LeitfadenState): string {
  const prices = calcPrices(state);

  const headers = [
    "SessionId",
    "Timestamp",
    "Mitarbeiterin",
    "Serviceartikel",
    "SolarVorhanden",
    "HeizkesselTyp",
    "Zone",
    "Wartungsvertrag",
    "Angebotsvariante",
    "HeizkesselPreis",
    "SolarEinzelpreis",
    "SolarKombiAnteil",
    "KombiGesamtpreis",
    "KombiErsparnisSolar",
    "FollowUpNoetig",
    "FollowUpGrund",
    "FollowUpNotizen",
  ];

  const values = [
    state.sessionId,
    state.timestampISO,
    state.mitarbeiterin,
    state.serviceartikel,
    state.solar.vorhanden ?? "",
    state.heizkessel.typ ?? "",
    state.heizkessel.zone ?? "",
    state.heizkessel.wartungsvertrag ?? "",
    state.angebot.variante ?? "",
    prices.heizpreis ?? "",
    prices.solarEinzel ?? "",
    prices.solarKombi ?? "",
    prices.kombiGesamt ?? "",
    prices.ersparnisKombi ?? "",
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

/** ===== Kleine UI-Helfer (Tailwind) ===== */

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
    <section className="rounded-2xl border border-gray-200 bg-white/90 p-5 shadow-sm">
      <h2 className="text-lg font-semibold mb-3">{title}</h2>
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

  // 1) Solar vorhanden? + Gesprächstext
  steps.push({
    id: "solar-vorhanden",
    title: "Solar-Anlage & Gesprächseinstieg",
    render: ({ state, setState }) => (
      <Section title="Solar-Anlage">
        <p className="text-sm text-gray-600 mb-3">
          <b>Formulierungsvorschlag:</b> „Haben Sie eine Solaranlage bei sich am Haus? Wir bieten eine
          Solar-Wartung in Kombination mit der Heizkessel-Wartung zum Kombipreis an – dadurch sparen Sie beim
          Gesamtpaket.“
        </p>
        <FieldRow label="Haben Sie eine Solaranlage?">
          <YesNo
            name="solar-vorhanden"
            value={state.solar.vorhanden}
            onChange={(v) => setState((s) => ({ ...s, solar: { ...s.solar, vorhanden: v } }))}
          />
        </FieldRow>
      </Section>
    ),
  });

  // 2) Heizkessel-Auswahl & Preise
  steps.push({
    id: "heizkessel",
    title: "Heizkessel & Wartungspreise",
    render: ({ state, setState }) => {
      const prices = calcPrices(state);

      return (
        <Section title="Heizkessel – Serviceartikel & Preise">
          <FieldRow
            label="Serviceartikel (interne Nummer)"
            hint="Z. B. Easyfire2, MF2/PFP oder firmeninterne Artikelnummer. Dient später zur Verknüpfung mit BC."
          >
            <input
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
              placeholder="z. B. EASYFIRE2-123"
              value={state.serviceartikel}
              onChange={(e) => setState((s) => ({ ...s, serviceartikel: e.target.value }))}
            />
          </FieldRow>

          <FieldRow label="Kesseltyp">
            <select
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
              value={state.heizkessel.typ ?? ""}
              onChange={(e) =>
                setState((s) => ({
                  ...s,
                  heizkessel: { ...s.heizkessel, typ: (e.target.value || undefined) as HeizkesselTyp | undefined },
                }))
              }
            >
              <option value="" disabled>
                Bitte wählen
              </option>
              <option value="Easyfire2">Easyfire2</option>
              <option value="MF2/PFP">MF2/PFP</option>
            </select>
          </FieldRow>

          <FieldRow label="Zone">
            <select
              className="w-full rounded-lg border border-gray-300 px-3 py-2 max-w-xs"
              value={state.heizkessel.zone ?? ""}
              onChange={(e) =>
                setState((s) => ({
                  ...s,
                  heizkessel: { ...s.heizkessel, zone: (e.target.value || undefined) as HeizZone | undefined },
                }))
              }
            >
              <option value="" disabled>
                Bitte wählen
              </option>
              <option value="1">Zone 1</option>
              <option value="2">Zone 2</option>
            </select>
          </FieldRow>

          <FieldRow label="Wartungsvertrag vorhanden?">
            <YesNo
              name="wartungsvertrag"
              value={state.heizkessel.wartungsvertrag}
              onChange={(v) => setState((s) => ({ ...s, heizkessel: { ...s.heizkessel, wartungsvertrag: v } }))}
            />
          </FieldRow>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-4 text-sm">
              <p className="font-semibold mb-2">Ermittelte Preise (netto)</p>
              <SummaryRow label="Heizkessel-Wartung">
                {prices.heizpreis !== null ? `${prices.heizpreis.toFixed(2)} €` : "Bitte Typ/Zone/Vertrag wählen"}
              </SummaryRow>
              <SummaryRow label="Solarwartung einzeln">{`${prices.solarEinzel.toFixed(2)} €`}</SummaryRow>
              <SummaryRow label="Solarwartung im Kombipaket">{`${prices.solarKombi.toFixed(2)} €`}</SummaryRow>
              <SummaryRow label="Kombi-Gesamtpreis">
                {prices.kombiGesamt !== null ? `${prices.kombiGesamt.toFixed(2)} €` : "—"}
              </SummaryRow>
              <SummaryRow label="Ersparnis beim Solaranteil">
                {prices.ersparnisKombi !== null ? `${prices.ersparnisKombi.toFixed(2)} €` : "—"}
              </SummaryRow>
            </div>

            <div className="rounded-xl border border-amber-100 bg-amber-50/70 p-4 text-sm">
              <p className="font-semibold mb-2">Angebotsvariante (für Dokumentation)</p>
              <FieldRow label="Welche Variante wählt der Kunde?">
                <select
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  value={state.angebot.variante ?? ""}
                  onChange={(e) =>
                    setState((s) => ({
                      ...s,
                      angebot: { ...s.angebot, variante: (e.target.value || undefined) as any },
                    }))
                  }
                >
                  <option value="" disabled>
                    Bitte wählen
                  </option>
                  <option value="nur-heizkessel">Nur Heizkessel-Wartung</option>
                  <option value="nur-solar">Nur Solarwartung</option>
                  <option value="kombi">Kombi: Heizkessel + Solar</option>
                </select>
              </FieldRow>
              <p className="text-xs text-gray-600 mt-2">
                <b>Hinweis zur Formulierung:</b> „Mit der Kombi-Variante zahlen Sie für die Solarwartung statt{" "}
                {prices.solarEinzel.toFixed(2)} € nur {prices.solarKombi.toFixed(2)} €. Das Gesamtpaket liegt dann bei{" "}
                {prices.kombiGesamt !== null ? prices.kombiGesamt.toFixed(2) : "…"} € netto.“
              </p>
            </div>
          </div>
        </Section>
      );
    },
  });

  // 3) Follow-up / Rückruf
  steps.push({
    id: "followup",
    title: "Follow-up & Notizen",
    render: ({ state, setState }) => (
      <Section title="Follow-up & interne Notizen">
        <SummaryRow label="Solar-Anlage">
          {state.solar.vorhanden === undefined ? "—" : state.solar.vorhanden === "ja" ? "Ja" : "Nein"}
        </SummaryRow>
        <SummaryRow label="Heizkessel">
          {state.heizkessel.typ ? `${state.heizkessel.typ} (Zone ${state.heizkessel.zone ?? "?"})` : "—"}
        </SummaryRow>
        <SummaryRow label="Wartungsvertrag">
          {state.heizkessel.wartungsvertrag === undefined
            ? "—"
            : state.heizkessel.wartungsvertrag === "ja"
            ? "Ja"
            : "Nein"}
        </SummaryRow>
        <SummaryRow label="Variante">
          {state.angebot.variante
            ? state.angebot.variante === "kombi"
              ? "Kombi"
              : state.angebot.variante === "nur-heizkessel"
              ? "Nur Heizkessel"
              : "Nur Solar"
            : "—"}
        </SummaryRow>

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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
            <div>
              <label className="block text-sm font-medium mb-1">Grund/Betreff</label>
              <input
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
                placeholder="z. B. Angebot Kombi-Wartung nachfassen"
                value={state.followUp.grund || ""}
                onChange={(e) => setState((s) => ({ ...s, followUp: { ...s.followUp, grund: e.target.value } }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Notizen</label>
              <textarea
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
                rows={3}
                placeholder="Freitext für interne Hinweise"
                value={state.followUp.notizen || ""}
                onChange={(e) => setState((s) => ({ ...s, followUp: { ...s.followUp, notizen: e.target.value } }))}
              />
            </div>
          </div>
        )}
      </Section>
    ),
  });

  return steps;
}

/** ===== Hauptkomponente ===== */

export default function KundendienstLeitfaden() {
  const [state, setState] = useState<LeitfadenState>(() => loadFromLocalStorage() ?? { ...EMPTY_STATE });
  const [stepIndex, setStepIndex] = useState(0);

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

  function handleDownloadCSV() {
    const csv = buildCsvFromState(state);
    downloadCSV(`leitfaden_${state.sessionId}.csv`, csv);
  }

  return (
    <div className="mx-auto max-w-4xl px-4">
      <div className="rounded-3xl border bg-white/95 shadow-xl backdrop-blur">
        {/* Header */}
        <div className="border-b px-5 py-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Leitfaden Kundendienst – Bestandskunde</h1>
            <p className="text-xs text-gray-500">
              Geführter Klickablauf mit Datenerfassung (Speicherung lokal, Export als CSV).
            </p>
          </div>
          <span className="text-xs rounded-lg bg-emerald-50 px-2 py-1 border border-emerald-100">
            Session: {state.sessionId.slice(0, 8)}
          </span>
        </div>

        <div className="p-5 space-y-6">
          {/* Progress */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Schritt {stepIndex + 1} / {steps.length}
              </span>
              <span className="text-xs text-gray-500">{progress}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-gray-200 overflow-hidden">
              <div className="h-2 rounded-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>

          {/* Kopfbereich */}
          <div className="rounded-2xl border bg-slate-50/80 p-4">
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
                <label className="block text-sm font-medium mb-1">Serviceartikel</label>
                <input
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  placeholder="z. B. EASYFIRE2-Z2"
                  value={state.serviceartikel}
                  onChange={(e) => setState((s) => ({ ...s, serviceartikel: e.target.value }))}
                />
              </div>
              <div className="flex items-center justify-center">
                {/* Platz für kleines Logo-Bild – du lädst /public/images/kwb-logo.png hoch */}
                <img
                  src="/images/kwb-logo.png"
                  alt="KWB Logo"
                  className="h-10 object-contain opacity-80"
                  onError={(e) => {
                    // Wenn das Bild noch nicht existiert, einfach verstecken
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
              </div>
            </div>
          </div>

          {/* Step-Inhalt */}
          <div key={stepIndex}>{steps[stepIndex]?.render({ state, setState })}</div>

          {/* Step Buttons */}
          <div className="mt-2 flex justify-between">
            <button
              onClick={prev}
              disabled={stepIndex === 0}
              className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm disabled:opacity-40"
            >
              Zurück
            </button>
            {stepIndex < steps.length - 1 ? (
              <button
                onClick={next}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white shadow hover:bg-emerald-700"
              >
                Weiter
              </button>
            ) : (
              <button
                disabled
                className="inline-flex items-center gap-2 rounded-lg bg-gray-300 px-4 py-2 text-sm text-white"
              >
                Fertig
              </button>
            )}
          </div>

          {/* Aktionen */}
          <div className="my-4 h-px bg-gray-200" />
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleDownloadCSV}
              className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm"
            >
              CSV herunterladen
            </button>

            <button
              onClick={resetSession}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm hover:bg-gray-100"
            >
              Neue Session
            </button>
          </div>

          {/* Gesprächsleitfaden-Hilfetext bleibt als Überblick */}
          <div className="mt-4 rounded-2xl border bg-gray-50 p-4">
            <p className="text-sm font-medium mb-2">Gesprächsleitfaden (Formulierungen)</p>
            <ul className="list-disc ml-5 space-y-1 text-sm text-gray-600">
              <li>
                <b>Solar-Anlage:</b> „Haben Sie eine Solaranlage bei sich am Haus?“
              </li>
              <li>
                <b>Kombi-Vorteil:</b> „Wir bieten eine Solar-Wartung in Kombination mit der Heizkessel-Wartung zum
                Kombipreis an – so sparen Sie beim Gesamtpaket.“
              </li>
              <li>
                <b>Preis-Argument:</b> „Statt {SOLAR_EINZELPREIS.toFixed(2)} € für die Solarwartung einzeln zahlen Sie im
                Kombipaket nur {SOLAR_KOMBIANTEIL.toFixed(2)} € zusätzlich.“
              </li>
              <li>
                <b>Abschlussfrage:</b> „Sollen wir das gleich als Kombi-Wartung vormerken oder lieber nur die
                Kessel-Wartung durchführen?“
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
