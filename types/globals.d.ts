declare function getRequiredElement<T extends HTMLElement>(id: string): T;

interface AppDependencies {
  document: Document;
  window: Window;
  fetchImpl: typeof fetch;
  Core: Record<string, unknown>;
  Api: Record<string, unknown>;
  UI: Record<string, unknown>;
  Views: Record<string, unknown>;
  worldPlaces: Place[];
  state: { place: Place | null; plan: Plan | null };
  placeSearch?: {
    findPlaces: () => Promise<void>;
    selectPlace: (place: Place) => Promise<Reading | null>;
  };
}

/** Profile values supplied to plan generation. */
interface Profile {
  city: string;
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

interface Action {
  id: string;
  area: string;
  title: string;
  impact: "High" | "Medium" | "Low";
  effort: "High" | "Medium" | "Low";
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

interface Plan {
  profile: Profile;
  band: Band;
  actions: Action[];
  totalImpact: number;
}
