"use client";

import React, { useEffect, useMemo, useState } from "react";

/** ===== Typen ===== */
type YesNo = "ja" | "nein" | undefined;
type HeizkesselTyp = "Easyfire2" | "MF2/PFP";
type HeizZone = "1" | "2";
type Steuerung = "C3" | "C4" | "Sonstige";

type WechselrichterHersteller = "Fronius" | "Huawei" | "SolarEdge" | "Sonnenkraft" | "Sonstige";

type KwpBereich = "4-10" | "10-15" | "15-20" | ">20";

interface PVNutzungFlags {
  heizstab: boolean;
  batteriespeicher: boolean;
  waermepumpe: boolean;
  klimaanlage: boolean;
  sonstige: string;
}

interface LeitfadenState {
  sessionId: string;
  timestampISO: string;
  mitarbeiterin: string;
  serviceartikel: string; // interne Nummer

  solar: {
    vorhanden: YesNo; // thermische Solar-Anlage
    interesse: YesNo; // Interesse an thermischer Solar-Anlage, falls keine vorhanden
  };

  heizkessel: {
    typ?: HeizkesselTyp;
    zone?: HeizZone;
    wartungsvertrag: YesNo;
    steuerung?: Steuerung;
  };

  angebot: {
    variante?: "nur-heizkessel" | "nur-solar" | "kombi" | undefined;
  };

  pv: {
    vorhanden: YesNo;
    interessePV: YesNo; // Interesse an PV, falls keine vorhanden
    interesseOptimaleNutzung: YesNo; // Interesse, PV-Energie optimal zu nutzen (Batterie etc.)

    wechselrichterHersteller?: WechselrichterHersteller;
    wechselrichterSonstige?: string;

    kwpBekannt: YesNo;
    kwpBereich?: KwpBereich;

    ueberschussNutzung: PVNutzungFlags;

    emsInteresse: YesNo; // Interesse an Energiemanagement (nur bei C4)
    emsWuensche: PVNutzungFlags;
  };

  followUp: { noetig: boolean; grund?: string; notizen?: string };
}

/** ===== Preis-Tabelle (netto) ===== */

const SOLAR_EINZELPREIS = 330; // immer
const SOLAR_KOMBIANTEIL = 169; // zusätzlicher Anteil im Kombipaket

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
    "2": { mitVertrag: 589.2, ohneVertrag: 486 },
  },
};

/** ===== Initialzustand ===== */

const EMPTY_PV_FLAGS: PVNutzungFlags = {
  heizstab: false,
  batteriespeicher: false,
  waermepumpe: false,
  klimaanlage: false,
  sonstige: "",
};

const EMPTY_STATE: LeitfadenState = {
  sessionId:
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2),
  timestampISO: new Date().toISOString(),
  mitarbeiterin: "",
  serviceartikel: "",
  solar: { vorhanden: undefined, interesse: undefined },
  heizkessel: { wartungsvertrag: undefined, steuerung: undefined },
  angebot: { variante: undefined },
  pv: {
    vorhanden: undefined,
    interessePV: undefined,
    interesseOptimaleNutzung: undefined,
    wechselrichterHersteller: undefined,
    wechselrichterSonstige: "",
    kwpBekannt: undefined,
    kwpBereich: undefined,
    ueberschussNutzung: { ...EMPTY_PV_FLAGS },
    emsInteresse: undefined,
    emsWuensche: { ...EMPTY_PV_FLAGS },
  },
  followUp: { noetig: false, grund: "", notizen: "" },
};

const LS_KEY = "leitfaden-bestandskunde-v4";

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

/** ===== CSV/Preis-Helper ===== */

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
  const ersparnisKombi = heizpreis !== null ? solarEinzel - solarKombi : null;

  return {
    heizpreis,
    solarEinzel,
    solarKombi,
    kombiGesamt,
    ersparnisKombi,
  };
}

function flagsToList(flags: PVNutzungFlags): string {
  const list: string[] = [];
  if (flags.heizstab) list.push("Heizstab");
  if (flags.batteriespeicher) list.push("Batteriespeicher");
  if (flags.waermepumpe) list.push("Wärmepumpe");
  if (flags.klimaanlage) list.push("Klimaanlage");
  if (flags.sonstige.trim()) list.push(`Sonstige: ${flags.sonstige.trim()}`);
  return list.join(", ");
}

function buildCsvFromState(state: LeitfadenState): string {
  const prices = calcPrices(state);

  const headers = [
    "SessionId",
    "Timestamp",
    "Mitarbeiterin",
    "Serviceartikel",
    "SolarThermischVorhanden",
    "SolarThermischInteresse",
    "HeizkesselTyp",
    "HeizkesselZone",
    "Wartungsvertrag",
    "Steuerung",
    "Angebotsvariante",
    "HeizkesselPreis",
    "SolarEinzelpreis",
    "SolarKombiAnteil",
    "KombiGesamtpreis",
    "KombiErsparnisSolar",
    "PV_Vorhanden",
    "PV_Interesse",
    "PV_InteresseOptimaleNutzung",
    "PV_WechselrichterHersteller",
    "PV_WechselrichterSonstige",
    "PV_kWpBekannt",
    "PV_kWpBereich",
    "PV_UeberschussNutzung",
    "EMS_Interesse",
    "EMS_Wuensche",
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
    state.solar.interesse ?? "",
    state.heizkessel.typ ?? "",
    state.heizkessel.zone ?? "",
    state.heizkessel.wartungsvertrag ?? "",
    state.heizkessel.steuerung ?? "",
    state.angebot.variante ?? "",
    prices.heizpreis ?? "",
    prices.solarEinzel ?? "",
    prices.solarKombi ?? "",
    prices.kombiGesamt ?? "",
    prices.ersparnisKombi ?? "",
    state.pv.vorhanden ?? "",
    state.pv.interessePV ?? "",
    state.pv.interesseOptimaleNutzung ?? "",
    state.pv.wechselrichterHersteller ?? "",
    state.pv.wechselrichterSonstige ?? "",
    state.pv.kwpBekannt ?? "",
    state.pv.kwpBereich ?? "",
    flagsToList(state.pv.ueberschussNutzung),
    state.pv.emsInteresse ?? "",
    flagsToList(state.pv.emsWuensche),
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
      <span className="font-medium text-right">{children}</span>
    </div>
  );
}

/** ===== Steps definieren ===== */

type StepCtx = {
  state: LeitfadenState;
  setState: React.Dispatch<React.SetStateAction<LeitfadenState>>;
  goNext: () => void;
};

type Step = {
  id: string;
  title: string;
  render: (ctx: StepCtx) => React.ReactNode;
};

function buildSteps(state: LeitfadenState): Step[] {
  const steps: Step[] = [];

  // 1) Solar thermisch vorhanden? + Interesse
  steps.push({
    id: "solar-vorhanden",
    title: "Solar-Anlage (thermisch) & Einstieg",
    render: ({ state, setState, goNext }) => (
      <Section title="Solar-Anlage (für Kombi mit Heizkessel)">
        <p className="text-sm text-gray-600 mb-3">
          „Haben Sie eine thermische Solaranlage am Dach? Wir können die Solarwartung mit der Kesselwartung kombinieren –
          das spart Termine und bringt einen Preisvorteil.“
        </p>
        <FieldRow label="Haben Sie eine thermische Solaranlage?">
          <YesNo
            name="solar-vorhanden"
            value={state.solar.vorhanden}
            onChange={(v) => {
              setState((s) => ({ ...s, solar: { ...s.solar, vorhanden: v } }));
              if (v === "ja") {
                // automatisch weiter
                goNext();
              }
            }}
          />
        </FieldRow>

        {state.solar.vorhanden === "nein" && (
          <FieldRow label="Hätten Sie Interesse an einer thermischen Solaranlage?">
            <YesNo
              name="solar-interesse"
              value={state.solar.interesse}
              onChange={(v) =>
                setState((s) => ({
                  ...s,
                  solar: { ...s.solar, interesse: v },
                  followUp: {
                    ...s.followUp,
                    noetig: v === "ja" ? true : s.followUp.noetig,
                    grund: v === "ja" ? "Interesse thermische Solar-Anlage" : s.followUp.grund,
                  },
                }))
              }
            />
          </FieldRow>
        )}
      </Section>
    ),
  });

  // 2) Heizkessel-Auswahl & Preise
  steps.push({
    id: "heizkessel",
    title: "Heizkessel & Wartungspreise",
    render: ({ state, setState }) => {
      const prices = calcPrices(state);

      const steuerung = state.heizkessel.steuerung;

      return (
        <Section title="Heizkessel – Preise & Steuerung">
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

          <FieldRow label="Steuerung">
            <select
              className="w-full rounded-lg border border-gray-300 px-3 py-2 max-w-xs"
              value={state.heizkessel.steuerung ?? ""}
              onChange={(e) =>
                setState((s) => ({
                  ...s,
                  heizkessel: { ...s.heizkessel, steuerung: (e.target.value || undefined) as Steuerung | undefined },
                  pv: {
                    ...s.pv,
                    emsInteresse:
                      (e.target.value as Steuerung) === "C4" ? s.pv.emsInteresse : undefined,
                    emsWuensche:
                      (e.target.value as Steuerung) === "C4" ? s.pv.emsWuensche : { ...EMPTY_PV_FLAGS },
                  },
                }))
              }
            >
              <option value="" disabled>
                Bitte wählen
              </option>
              <option value="C3">C3</option>
              <option value="C4">C4</option>
              <option value="Sonstige">Sonstige</option>
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
              <p className="font-semibold mb-2">Wartungspreise (netto)</p>
              <SummaryRow label="Heizkessel-Wartung">
                {prices.heizpreis !== null ? `${prices.heizpreis.toFixed(2)} €` : "Bitte Typ, Zone und Vertrag wählen"}
              </SummaryRow>
              <SummaryRow label="Solarwartung einzeln">{`${prices.solarEinzel.toFixed(2)} €`}</SummaryRow>
              <SummaryRow label="Solarwartung im Kombipaket">{`${prices.solarKombi.toFixed(2)} €`}</SummaryRow>
              <SummaryRow label="Kombi-Gesamtpreis">
                {prices.kombiGesamt !== null ? `${prices.kombiGesamt.toFixed(2)} €` : "—"}
              </SummaryRow>
            </div>

            <div className="rounded-xl border border-amber-100 bg-amber-50/70 p-4 text-sm">
              <p className="font-semibold mb-2">Angebotsvariante (für Dokumentation)</p>
              <FieldRow label="Was entscheidet der Kunde?">
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
                Kurz: „Mit der Kombi zahlen Sie für die Solarwartung statt {SOLAR_EINZELPREIS.toFixed(2)} € nur{" "}
                {SOLAR_KOMBIANTEIL.toFixed(2)} € zusätzlich.“
              </p>
              {steuerung === "C3" && (
                <p className="text-xs text-red-500 mt-2">
                  Hinweis: Mit Steuerung C3 ist kein Energiemanagement-System möglich.
                </p>
              )}
            </div>
          </div>
        </Section>
      );
    },
  });

  // 3) PV-Anlage & Energiemanagement
  steps.push({
    id: "pv",
    title: "PV-Anlage & Energiemanagement",
    render: ({ state, setState }) => {
      const pv = state.pv;
      const steuerung = state.heizkessel.steuerung;

      const updatePVFlags = (
        key: "ueberschussNutzung" | "emsWuensche",
        field: keyof PVNutzungFlags,
        value: boolean | string
      ) => {
        setState((s) => ({
          ...s,
          pv: {
            ...s.pv,
            [key]: {
              ...(s.pv[key] as PVNutzungFlags),
              [field]: value,
            },
          },
        }));
      };

      const canShowEMS = steuerung === "C4";

      return (
        <Section title="Photovoltaik (PV)">
          <p className="text-sm text-gray-600 mb-3">
            „Nutzen Sie auch eine PV-Anlage? Dann schauen wir kurz, wie Sie Ihren eigenen Strom heute nutzen und ob sich
            etwas verbessern lässt.“
          </p>

          <FieldRow label="Haben Sie eine PV-Anlage?">
            <YesNo
              name="pv-vorhanden"
              value={pv.vorhanden}
              onChange={(v) =>
                setState((s) => ({
                  ...s,
                  pv: { ...s.pv, vorhanden: v, interessePV: v === "ja" ? undefined : s.pv.interessePV },
                }))
              }
            />
          </FieldRow>

          {pv.vorhanden === "nein" && (
            <>
              <FieldRow label="Hätten Sie grundsätzlich Interesse an einer PV-Anlage?">
                <YesNo
                  name="pv-interesse"
                  value={pv.interessePV}
                  onChange={(v) =>
                    setState((s) => ({
                      ...s,
                      pv: { ...s.pv, interessePV: v },
                      followUp: {
                        ...s.followUp,
                        noetig: v === "ja" ? true : s.followUp.noetig,
                        grund: v === "ja" ? "Interesse PV-Anlage" : s.followUp.grund,
                      },
                    }))
                  }
                />
              </FieldRow>

              <FieldRow label="Hätten Sie Interesse, eine zukünftige PV optimal zu nutzen (Speicher, Heizstab, etc.)?">
                <YesNo
                  name="pv-optimal"
                  value={pv.interesseOptimaleNutzung}
                  onChange={(v) =>
                    setState((s) => ({
                      ...s,
                      pv: { ...s.pv, interesseOptimaleNutzung: v },
                      followUp: {
                        ...s.followUp,
                        noetig: v === "ja" ? true : s.followUp.noetig,
                        grund:
                          v === "ja"
                            ? "Interesse PV-Optimierung (Batteriespeicher/Heizstab/Klima/Wärmepumpe)"
                            : s.followUp.grund,
                      },
                    }))
                  }
                />
              </FieldRow>
            </>
          )}

          {pv.vorhanden === "ja" && (
            <>
              <FieldRow label="Wechselrichter-Hersteller">
                <div className="space-y-2">
                  <select
                    className="w-full rounded-lg border border-gray-300 px-3 py-2"
                    value={pv.wechselrichterHersteller ?? ""}
                    onChange={(e) =>
                      setState((s) => ({
                        ...s,
                        pv: {
                          ...s.pv,
                          wechselrichterHersteller: (e.target.value ||
                            undefined) as WechselrichterHersteller | undefined,
                          wechselrichterSonstige:
                            (e.target.value as WechselrichterHersteller) === "Sonstige"
                              ? s.pv.wechselrichterSonstige
                              : "",
                        },
                      }))
                    }
                  >
                    <option value="" disabled>
                      Bitte wählen
                    </option>
                    <option value="Fronius">Fronius</option>
                    <option value="Huawei">Huawei</option>
                    <option value="SolarEdge">SolarEdge</option>
                    <option value="Sonnenkraft">Sonnenkraft</option>
                    <option value="Sonstige">Sonstige</option>
                  </select>
                  {pv.wechselrichterHersteller === "Sonstige" && (
                    <input
                      className="w-full rounded-lg border border-gray-300 px-3 py-2"
                      placeholder="Herstellername"
                      value={pv.wechselrichterSonstige || ""}
                      onChange={(e) =>
                        setState((s) => ({
                          ...s,
                          pv: { ...s.pv, wechselrichterSonstige: e.target.value },
                        }))
                      }
                    />
                  )}
                </div>
              </FieldRow>

              <FieldRow label="Wissen Sie ungefähr die Anlagenleistung in kWp?">
                <YesNo
                  name="pv-kwp-bekannt"
                  value={pv.kwpBekannt}
                  onChange={(v) =>
                    setState((s) => ({
                      ...s,
                      pv: { ...s.pv, kwpBekannt: v, kwpBereich: v === "ja" ? s.pv.kwpBereich : undefined },
                    }))
                  }
                />
              </FieldRow>

              {pv.kwpBekannt === "ja" && (
                <FieldRow label="Bereich der Anlagenleistung">
                  <select
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 max-w-xs"
                    value={pv.kwpBereich ?? ""}
                    onChange={(e) =>
                      setState((s) => ({
                        ...s,
                        pv: { ...s.pv, kwpBereich: (e.target.value || undefined) as KwpBereich | undefined },
                      }))
                    }
                  >
                    <option value="" disabled>
                      Bitte wählen
                    </option>
                    <option value="4-10">4–10 kWp</option>
                    <option value="10-15">10–15 kWp</option>
                    <option value="15-20">15–20 kWp</option>
                    <option value=">20">&gt; 20 kWp</option>
                  </select>
                </FieldRow>
              )}

              <FieldRow label="Wie nutzen Sie aktuell den Überschuss-Strom?">
                <div className="space-y-1 text-sm">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={pv.ueberschussNutzung.heizstab}
                      onChange={(e) => updatePVFlags("ueberschussNutzung", "heizstab", e.target.checked)}
                    />
                    <span>Heizstab</span>
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={pv.ueberschussNutzung.batteriespeicher}
                      onChange={(e) => updatePVFlags("ueberschussNutzung", "batteriespeicher", e.target.checked)}
                    />
                    <span>Batteriespeicher</span>
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={pv.ueberschussNutzung.waermepumpe}
                      onChange={(e) => updatePVFlags("ueberschussNutzung", "waermepumpe", e.target.checked)}
                    />
                    <span>Wärmepumpe</span>
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={pv.ueberschussNutzung.klimaanlage}
                      onChange={(e) => updatePVFlags("ueberschussNutzung", "klimaanlage", e.target.checked)}
                    />
                    <span>Klimaanlage</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <span>Sonstiges:</span>
                    <input
                      className="flex-1 rounded-lg border border-gray-300 px-2 py-1"
                      placeholder="z. B. E-Auto"
                      value={pv.ueberschussNutzung.sonstige}
                      onChange={(e) => updatePVFlags("ueberschussNutzung", "sonstige", e.target.value)}
                    />
                  </div>
                </div>
              </FieldRow>

              {canShowEMS && (
                <>
                  <FieldRow label="Hätten Sie Interesse an einem Energiemanagement-System?">
                    <YesNo
                      name="ems-interesse"
                      value={pv.emsInteresse}
                      onChange={(v) =>
                        setState((s) => ({
                          ...s,
                          pv: { ...s.pv, emsInteresse: v },
                          followUp: {
                            ...s.followUp,
                            noetig: v === "ja" ? true : s.followUp.noetig,
                            grund:
                              v === "ja"
                                ? "Interesse Energiemanagement-System (C4-Steuerung)"
                                : s.followUp.grund,
                          },
                        }))
                      }
                    />
                  </FieldRow>

                  {pv.emsInteresse === "ja" && (
                    <FieldRow label="Welche Verbraucher sollen bevorzugt optimiert werden?">
                      <div className="space-y-1 text-sm">
                        <label className="inline-flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={pv.emsWuensche.heizstab}
                            onChange={(e) => updatePVFlags("emsWuensche", "heizstab", e.target.checked)}
                          />
                          <span>Heizstab</span>
                        </label>
                        <label className="inline-flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={pv.emsWuensche.batteriespeicher}
                            onChange={(e) =>
                              updatePVFlags("emsWuensche", "batteriespeicher", e.target.checked)
                            }
                          />
                          <span>Batteriespeicher</span>
                        </label>
                        <label className="inline-flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={pv.emsWuensche.waermepumpe}
                            onChange={(e) => updatePVFlags("emsWuensche", "waermepumpe", e.target.checked)}
                          />
                          <span>Wärmepumpe</span>
                        </label>
                        <label className="inline-flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={pv.emsWuensche.klimaanlage}
                            onChange={(e) =>
                              updatePVFlags("emsWuensche", "klimaanlage", e.target.checked)
                            }
                          />
                          <span>Klimaanlage</span>
                        </label>
                        <div className="flex items-center gap-2">
                          <span>Sonstiges:</span>
                          <input
                            className="flex-1 rounded-lg border border-gray-300 px-2 py-1"
                            placeholder="z. B. E-Auto, Poolpumpe"
                            value={pv.emsWuensche.sonstige}
                            onChange={(e) => updatePVFlags("emsWuensche", "sonstige", e.target.value)}
                          />
                        </div>
                      </div>
                    </FieldRow>
                  )}
                </>
              )}

              {!canShowEMS && (
                <p className="text-xs text-gray-500 mt-2">
                  Hinweis: Energiemanagement-System nur mit C4-Steuerung möglich.
                </p>
              )}
            </>
          )}
        </Section>
      );
    },
  });

  // 4) Follow-up / Zusammenfassung
  steps.push({
    id: "followup",
    title: "Zusammenfassung & Follow-up",
    render: ({ state, setState }) => {
      const prices = calcPrices(state);

      const solarText =
        state.solar.vorhanden === "ja"
          ? "Kunde hat eine thermische Solaranlage."
          : state.solar.vorhanden === "nein" && state.solar.interesse === "ja"
          ? "Keine thermische Solaranlage, aber Interesse daran."
          : "Keine thermische Solaranlage, kein Interesse angegeben.";

      const pvText =
        state.pv.vorhanden === "ja"
          ? "Kunde hat eine PV-Anlage."
          : state.pv.vorhanden === "nein" && state.pv.interessePV === "ja"
          ? "Keine PV-Anlage, aber Interesse daran."
          : "Keine PV-Anlage, kein Interesse angegeben.";

      return (
        <Section title="Zusammenfassung & nächste Schritte">
          <div className="space-y-2 text-sm mb-4">
            <p>{solarText}</p>
            <p>
              Heizkessel:{" "}
              {state.heizkessel.typ
                ? `${state.heizkessel.typ} (Zone ${state.heizkessel.zone ?? "?"}, Steuerung ${
                    state.heizkessel.steuerung ?? "?"
                  })`
                : "Kein Kesseltyp ausgewählt."}
            </p>
            <p>
              Wartungsvertrag:{" "}
              {state.heizkessel.wartungsvertrag === "ja"
                ? "Ja"
                : state.heizkessel.wartungsvertrag === "nein"
                ? "Nein"
                : "nicht angegeben"}
              .
            </p>
            <p>
              Wartungspreise: Heizkessel{" "}
              {prices.heizpreis !== null ? `${prices.heizpreis.toFixed(2)} €` : "—"}; Solar einzeln{" "}
              {prices.solarEinzel.toFixed(2)} €, im Kombipaket {prices.solarKombi.toFixed(2)} €.
            </p>
            <p>
              Angebotsvariante:{" "}
              {state.angebot.variante === "kombi"
                ? "Kombi-Wartung (Kessel + Solar)."
                : state.angebot.variante === "nur-heizkessel"
                ? "Nur Heizkessel-Wartung."
                : state.angebot.variante === "nur-solar"
                ? "Nur Solar-Wartung."
                : "Noch nicht festgelegt."}
            </p>
            <p>{pvText}</p>
          </div>

          <div className="rounded-2xl border bg-gray-50 p-4 mb-4">
            <SummaryRow label="Solar (thermisch)">
              {state.solar.vorhanden === undefined
                ? "—"
                : state.solar.vorhanden === "ja"
                ? "Ja"
                : "Nein"}
            </SummaryRow>
            <SummaryRow label="Solar-Interesse">
              {state.solar.interesse === undefined ? "—" : state.solar.interesse === "ja" ? "Ja" : "Nein"}
            </SummaryRow>
            <SummaryRow label="Heizkessel">
              {state.heizkessel.typ ? `${state.heizkessel.typ} (Zone ${state.heizkessel.zone ?? "?"})` : "—"}
            </SummaryRow>
            <SummaryRow label="Steuerung">
              {state.heizkessel.steuerung ?? "—"}
            </SummaryRow>
            <SummaryRow label="PV-Anlage">
              {state.pv.vorhanden === undefined ? "—" : state.pv.vorhanden === "ja" ? "Ja" : "Nein"}
            </SummaryRow>
            <SummaryRow label="PV-Interesse">
              {state.pv.interessePV === undefined ? "—" : state.pv.interessePV === "ja" ? "Ja" : "Nein"}
            </SummaryRow>
            <SummaryRow label="EMS-Interesse">
              {state.pv.emsInteresse === undefined ? "—" : state.pv.emsInteresse === "ja" ? "Ja" : "Nein"}
            </SummaryRow>
          </div>

          <div className="my-3 h-px bg-gray-200" />

          <FieldRow label="Follow-up nötig?">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={state.followUp.noetig}
                onChange={(e) => setState((s) => ({ ...s, followUp: { ...s.followUp, noetig: e.target.checked } }))}
              />
              <span className="text-sm text-gray-700">
                {state.followUp.noetig ? "Ja, Vertrieb soll sich melden" : "Nein, kein Rückruf nötig"}
              </span>
            </label>
          </FieldRow>

          {state.followUp.noetig && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
              <div>
                <label className="block text-sm font-medium mb-1">Grund/Betreff</label>
                <input
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  placeholder="z. B. Kombi-Wartung, PV, Energiemanagement"
                  value={state.followUp.grund || ""}
                  onChange={(e) => setState((s) => ({ ...s, followUp: { ...s.followUp, grund: e.target.value } }))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Notizen</label>
                <textarea
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  rows={3}
                  placeholder="Kurz notieren, was dem Kunden wichtig war"
                  value={state.followUp.notizen || ""}
                  onChange={(e) => setState((s) => ({ ...s, followUp: { ...s.followUp, notizen: e.target.value } }))}
                />
              </div>
            </div>
          )}

          <p className="mt-4 text-sm text-gray-700">
            Vielen Dank für Ihre Zeit – unser zuständiger Mitarbeiter meldet sich bei Ihnen mit einem passenden Angebot.
          </p>
        </Section>
      );
    },
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
              Geführter Klickablauf mit Datenerfassung (lokal gespeichert, Export als CSV).
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
                <label className="block text-sm font-medium mb-1">Mitarbeiter</label>
                <select
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  value={state.mitarbeiterin}
                  onChange={(e) => setState((s) => ({ ...s, mitarbeiterin: e.target.value }))}
                >
                  <option value="">Bitte wählen</option>
                  <option value="Bernhard Oelhafen">Bernhard Oelhafen</option>
                  <option value="Hannes Hierzer">Hannes Hierzer</option>
                  <option value="Christian Luttenberger">Christian Luttenberger</option>
                  <option value="Stefan Treul">Stefan Treul</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Serviceartikel</label>
                <input
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  placeholder=""
                  value={state.serviceartikel}
                  onChange={(e) => setState((s) => ({ ...s, serviceartikel: e.target.value }))}
                />
              </div>
              <div className="flex items-center justify-center">
                {/* Logo – aus /public/kwb-logo.png.png */}
                <img
                  src="/kwb-logo.png.png"
                  alt="KWB Logo"
                  className="h-10 object-contain opacity-80"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
              </div>
            </div>
          </div>

          {/* Step-Inhalt */}
          <div key={stepIndex}>{steps[stepIndex]?.render({ state, setState, goNext: next })}</div>

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
                className="inline-flex items-center gap-2 rounded-lg bg-gray-400 px-4 py-2 text-sm text-white"
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
        </div>
      </div>
    </div>
  );
}
