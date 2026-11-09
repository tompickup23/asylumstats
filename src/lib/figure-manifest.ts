/** Metadata for rendered headlines. Values always come from the rendering caller. */
import { loadLocalRouteLatest, loadRouteDashboard } from "./route-data";
import { initialGrantRate, smallBoats } from "./headline-figures";
import { buildPlacePath } from "./site-identity";
import type { Explainer } from "./explainers/types";
import manifest from "../../data/raw/manifests/uk_routes.json";

type Metric = "initial-grant-rate" | "supported-asylum" | "people-in-hotels" | "small-boats-ytd" | "place-supported" | "place-rate";
const dashboard = loadRouteDashboard();
const local = loadLocalRouteLatest();
const placesByPath = new Map(local.areas.map((area) => [buildPlacePath(area), area]));
function source(id: string): string {
  const url = manifest.files.find((file) => file.sourceId === id)?.sourceUrl;
  if (!url) throw new Error(`Missing figure source: ${id}`);
  return url;
}

export function figureAttrs(metric: Metric, value: number | null, areaCode?: string, decimals?: number) {
  let key: string = metric;
  let basis: string;
  let sourceUrl: string;
  if (metric === "initial-grant-rate") {
    const rate = initialGrantRate();
    if (!rate) throw new Error("Missing initial grant rate window");
    basis = `derived: main applicant grants / (grants + refusals); ${rate.windowLabel}`;
    sourceUrl = source("asylum_claims");
  } else if (metric === "small-boats-ytd") {
    const boats = smallBoats();
    basis = `published_statistic: small boat arrivals; ${boats.year}-01-01 to ${boats.asAt}`;
    sourceUrl = boats.sourceUrl;
  } else if (metric === "place-supported" || metric === "place-rate") {
    const area = local.areas.find((area) => area.areaCode === areaCode);
    if (!area) throw new Error(`Unknown figure area: ${areaCode}`);
    key = `${metric}:${area.areaCode}`;
    basis = metric === "place-supported"
      ? `published_statistic: people on asylum support including subsistence only; ${area.snapshotDate}`
      : `derived: people on asylum support / resident population * 10000; ${area.snapshotDate}`;
    sourceUrl = source("local_immigration_groups");
  } else {
    const series = metric === "supported-asylum" ? "supportedAsylum" : "hotelAccommodation";
    const period = dashboard.nationalSystemDynamics.stockSeries[series].at(-1)?.periodEnd;
    if (!period) throw new Error(`Missing figure period: ${metric}`);
    basis = `published_statistic: ${metric === "supported-asylum" ? "people on asylum support including subsistence only" : "people in asylum hotels"}; ${period}`;
    sourceUrl = source("asylum_support");
  }
  if (value !== null && !Number.isFinite(value)) throw new Error(`Invalid figure: ${key}`);
  return {
    "data-figure-key": key,
    "data-figure-value": JSON.stringify(value),
    "data-figure-basis": basis,
    "data-figure-source": sourceUrl,
    "data-figure-decimals": decimals ?? (metric === "place-rate" ? 1 : 0)
  };
}

const numberFrom = (text: string) => Number(text.replace(/[,\s%]/g, ""));
export function explainerFigureAttrs(explainer: Explainer) {
  const metric = {
    "how-many-asylum-seekers-are-in-the-uk": "supported-asylum",
    "how-many-small-boats-have-crossed-this-year": "small-boats-ytd",
    "uk-asylum-grant-rate": "initial-grant-rate"
  }[explainer.slug] as Metric | undefined;
  if (!metric) return {};
  const value = metric === "initial-grant-rate" ? initialGrantRate()!.pct : numberFrom(explainer.figure);
  return figureAttrs(metric, value);
}

export function explainerKeyAttrs(explainer: Explainer, row: { label: string; value: string }) {
  if (/^People in (asylum )?hotels$/.test(row.label) || (explainer.slug === "how-many-asylum-seekers-are-in-the-uk" && /hotel/i.test(row.label))) {
    return figureAttrs("people-in-hotels", numberFrom(row.value));
  }
  if (explainer.slug === "uk-asylum-grant-rate" && row.label === "Grant rate, initial decision") {
    return figureAttrs("initial-grant-rate", numberFrom(row.value), undefined, 1);
  }
  return {};
}

export function explainerAreaAttrs(explainer: Explainer, href: string, displayed: string, rate = false) {
  if (explainer.slug !== "how-many-asylum-seekers-are-in-the-uk") return {};
  const area = placesByPath.get(href);
  if (!area) throw new Error(`Unknown explainer area: ${href}`);
  return figureAttrs(rate ? "place-rate" : "place-supported", rate ? area.supportedAsylumRate : numberFrom(displayed), area.areaCode);
}
