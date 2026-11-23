// Shared types for the JSDoc annotations in js/, lib/ and server.js (checked by `npm run typecheck`).

type Impact = "High" | "Medium" | "Low";

/** The whitelisted answers that drive the plan. */
interface Profile {
  cityName: string;
  aqi: number;
  aqiIsLive: boolean;
  children: boolean;
  elderly: boolean;
  respiratory: boolean;
  pregnant: boolean;
  commute: string;
  cooking: string;
  heating: string;
  purifier: string;
}

/** One piece of advice, ranked by impact. */
interface Action {
  id: string;
  area: string;
  title: string;
  impact: Impact;
  effort: Impact;
  steps: string;
  why: string;
}

interface Band {
  max: number;
  level: number;
  name: string;
  advice: string;
}

interface Place {
  name: string;
  region?: string;
  country?: string;
  lat: number;
  lon: number;
}

interface Reading {
  aqi: number;
  pm25: number | null;
  pm10: number | null;
  time: string;
  source: "model" | "station";
  station: string;
}

interface PlaceWithReading extends Place {
  reading: Reading | null;
}

interface Plan {
  profile: Profile;
  band: Band;
  actions: Action[];
  totalImpact: number;
}

interface RoutinePart {
  when: string;
  items: string[];
}

interface AppState {
  place: Place | null;
  plan: Plan | null;
}

/** Finds an element by id. With a tag name the result is typed (and checked) as that element. */
interface ElementLookup {
  (id: string): HTMLElement;
  <K extends keyof HTMLElementTagNameMap>(id: string, tag: K): HTMLElementTagNameMap[K];
}

interface PlaceSearch {
  findPlaces: () => Promise<void>;
  selectPlace: (place: Place) => Promise<Reading | null>;
}

/** Everything a feature module needs, injected so tests can supply a fake page and network. */
interface AppDependencies {
  document: Document;
  window: Window & typeof globalThis;
  fetchImpl: typeof fetch;
  $: ElementLookup;
  Core: typeof import("../js/app.js");
  Api: typeof import("../js/air-api.js");
  UI: typeof import("../js/ui.js");
  Views: typeof import("../js/views.js");
  worldPlaces: readonly Place[];
  state: AppState;
  placeSearch?: PlaceSearch;
}
