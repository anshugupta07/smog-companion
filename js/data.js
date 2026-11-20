/**
 * Smog Companion - static data: AQI bands, option lists, advice rules and the world board places.
 * Pure data only (no logic beyond tiny predicates) so it is easy to review, translate and test.
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SmogData = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Typical peak-winter AQI per city. Rough defaults used only when no live AQI is known. */
  const CITIES = Object.freeze({
    delhi: { label: 'Delhi NCR', aqi: 320 },
    ahmedabad: { label: 'Ahmedabad', aqi: 180 },
    lahore: { label: 'Lahore', aqi: 300 },
    kathmandu: { label: 'Kathmandu', aqi: 190 },
    beijing: { label: 'Beijing', aqi: 170 },
    other: { label: 'Other city', aqi: 120 },
  });

  /** Allowed values for each profile choice. Anything else falls back to a safe default. */
  const ENUMS = Object.freeze({
    commute: ['car', 'twowheeler', 'transit', 'active', 'wfh'],
    cooking: ['lpg', 'electric', 'biomass'],
    heating: ['none', 'electric', 'gas', 'solid'],
    purifier: ['yes', 'no'],
  });

  /** US-EPA style bands. Each band carries a text label so meaning never depends on colour alone. */
  // US-EPA style bands. Each band always carries a text label (never colour alone).
  const BANDS = Object.freeze([
    { max: 50, level: 0, name: 'Good', advice: 'Air is clean. Normal routines are fine.' },
    { max: 100, level: 1, name: 'Moderate', advice: 'Very sensitive people should limit long outdoor effort.' },
    { max: 150, level: 2, name: 'Unhealthy for sensitive groups', advice: 'Children, elders and people with asthma should cut outdoor time.' },
    { max: 200, level: 3, name: 'Unhealthy', advice: 'Everyone should reduce outdoor exertion and wear a fitted mask outside.' },
    { max: 300, level: 4, name: 'Very unhealthy', advice: 'Stay indoors where possible and run air cleaning.' },
    { max: 500, level: 5, name: 'Hazardous', advice: 'Avoid going out. Treat this as a health emergency day.' },
  ]);

  /** Numeric weight of each impact label, used to rank actions. */
  const IMPACT_WEIGHT = Object.freeze({ High: 3, Medium: 2, Low: 1 });

  const isSensitive = (profile) => Boolean(profile.children || profile.elderly || profile.respiratory || profile.pregnant);

  /**
   * Advice rules. `applies(profile, band)` decides whether a rule is shown.
   * Impact figures are approximate and labelled as estimates in the text.
   */
  const RULES = [
    {
      id: 'mask', area: 'Outdoors', title: 'Wear a fitted N95 / FFP2 mask outside', impact: 'High', effort: 'Low',
      applies: (p, b) => b.level >= 3 || (isSensitive(p) && b.level >= 2),
      steps: 'Pick a valved-free N95/FFP2, press the nose clip, and check there is no gap at the cheeks. Cloth and surgical masks block little PM2.5.',
      why: 'A well-fitted N95 filters at least 95% of fine particles, so it directly cuts the dose reaching your lungs. A loose mask can lose most of that benefit.',
    },
    {
      id: 'timing', area: 'Outdoors', title: 'Move walks and errands to the afternoon', impact: 'Medium', effort: 'Low',
      applies: (p, b) => b.level >= 2,
      steps: 'Avoid early morning and late evening. Check a live AQI app before leaving and pick the cleanest window.',
      why: 'In winter, cold air traps pollution near the ground overnight and in the early morning. Midday heating usually lifts the layer and lowers readings.',
    },
    {
      id: 'sensitive', area: 'Family health', title: 'Keep children, elders and asthma patients indoors on bad days', impact: 'High', effort: 'Low',
      applies: (p, b) => isSensitive(p) && b.level >= 2,
      steps: 'Swap outdoor games for indoor play. Keep prescribed inhalers within reach and ask your doctor for an asthma action plan.',
      why: 'Children breathe faster for their size and elders and asthma patients have less reserve, so the same air does more harm to them. Cutting exposure is the most protective step.',
    },
    {
      id: 'purifier-diy', area: 'Indoor air', title: 'Build a low-cost air cleaner', impact: 'High', effort: 'Medium',
      applies: (p, b) => p.purifier === 'no' && b.level >= 2,
      steps: 'Tape four MERV-13 or better furnace filters into a cube and fix a box fan on top (a Corsi-Rosenthal box). Run it in the room where you spend the most time.',
      why: 'Indoor PM2.5 usually follows outdoor levels. A filtered room can often cut indoor particles by well over half (estimate), which matters most while sleeping.',
    },
    {
      id: 'purifier-use', area: 'Indoor air', title: 'Use your purifier well', impact: 'Medium', effort: 'Low',
      applies: (p, b) => p.purifier === 'yes' && b.level >= 2,
      steps: 'Keep doors and windows closed, run it in the bedroom at night, place it away from walls, and replace filters on schedule.',
      why: 'A purifier only helps when the room is reasonably sealed and the filter is not clogged. Good placement and upkeep keep the clean-air rate high.',
    },
    {
      id: 'ventilate', area: 'Indoor air', title: 'Ventilate only at the cleanest hour', impact: 'Medium', effort: 'Low',
      applies: (p, b) => b.level >= 2,
      steps: 'Open windows for 10 minutes around midday, then close them. Seal door and window gaps with weather strips.',
      why: 'Opening windows during a smog peak lets polluted air in. A short midday burst refreshes the air at the lowest outdoor level of the day.',
    },
    {
      id: 'cook-biomass', area: 'Cooking', title: 'Move from wood or dung cooking to LPG or induction', impact: 'High', effort: 'High',
      applies: (p) => p.cooking === 'biomass',
      steps: 'Look into subsidised LPG or induction schemes in your area. Until you switch, cook outdoors or under a hood and keep children away from the stove.',
      why: 'Burning biomass is a major source of household PM2.5 and can push indoor levels several times above WHO guidance, harming the cook and the family.',
    },
    {
      id: 'cook-vent', area: 'Cooking', title: 'Run the exhaust and cook with lids on', impact: 'Medium', effort: 'Low',
      applies: (p) => p.cooking !== 'biomass',
      steps: 'Switch on the chimney or exhaust fan before you start and keep it on 10 minutes after. Use lids and avoid very high-heat frying.',
      why: 'Frying and burning gas release fine particles and NO2 into your kitchen. Capturing them at the source is cheaper than cleaning the whole house later.',
    },
    {
      id: 'heat-solid', area: 'Heating', title: 'Replace wood, coal or waste fires with electric heat', impact: 'High', effort: 'Medium',
      applies: (p) => p.heating === 'solid',
      steps: 'Use an electric heater, heat pump or insulated blankets and rugs. Never burn plastic, leaves or rubbish for warmth.',
      why: 'Burning solid fuel and trash is a big winter source of PM2.5. A neighbourhood that stops this sees cleaner air for everyone.',
    },
    {
      id: 'commute-car', area: 'Getting around', title: 'Share rides or take metro / bus for part of the week', impact: 'High', effort: 'Medium',
      applies: (p) => p.commute === 'car' || p.commute === 'twowheeler',
      steps: 'Start with two car-free days a week. Form a carpool with colleagues or neighbours, and keep tyres inflated and the engine serviced.',
      why: 'Vehicles are a leading urban source of NOx and PM2.5. Swapping 10 km of petrol car driving for metro saves about 1.3 kg CO2 per day (estimate) and removes tailpipe emissions from your street.',
    },
    {
      id: 'commute-active', area: 'Getting around', title: 'Walk or cycle on lower-pollution streets, not on peak days', impact: 'Medium', effort: 'Low',
      applies: (p, b) => p.commute === 'active' && b.level >= 3,
      steps: 'On Unhealthy days or worse, switch to transit with a mask. Pick back streets away from heavy traffic on better days.',
      why: 'Hard exercise raises breathing rate several fold, so you inhale far more particles. Active travel is great when the air is acceptable and costly when it is not.',
    },
    {
      id: 'commute-wfh', area: 'Getting around', title: 'Keep working from home on smog peaks', impact: 'Medium', effort: 'Low',
      applies: (p, b) => p.commute === 'wfh' || b.level >= 4,
      steps: 'Ask your employer or school for remote options on Very Unhealthy or Hazardous days.',
      why: 'Avoiding the commute removes both your exposure and your share of road emissions.',
    },
    {
      id: 'clean-home', area: 'Indoor air', title: 'Damp-mop instead of sweeping and skip smoke at home', impact: 'Low', effort: 'Low',
      applies: () => true,
      steps: 'Use a damp cloth or HEPA vacuum. Avoid incense, mosquito coils, aerosol sprays and indoor smoking.',
      why: 'Sweeping lifts settled dust back into the air, and incense and coils add their own fine particles to what you already breathe.',
    },
    {
      id: 'community', area: 'Community', title: 'Organise a lane-level clean-air pact', impact: 'Medium', effort: 'Medium',
      applies: () => true,
      steps: 'Agree with neighbours: no open burning, shared carpool group, heaters for the watchman instead of fires. Report garbage burning to your municipal helpline.',
      why: 'Smog is a shared problem. When a whole lane acts together, the local air changes more than any one home can manage alone.',
    },
  ];
  Object.freeze(RULES);

  const worldPlace = (name, country, lat, lon) => Object.freeze({ name, country, lat, lon });

  /** Thirty major cities shown on the live world board. */
  const WORLD = Object.freeze([
    worldPlace('Delhi', 'India', 28.61, 77.21), worldPlace('Mumbai', 'India', 19.08, 72.88), worldPlace('Ahmedabad', 'India', 23.02, 72.57),
    worldPlace('Kolkata', 'India', 22.57, 88.36), worldPlace('Lucknow', 'India', 26.85, 80.95), worldPlace('Patna', 'India', 25.59, 85.14),
    worldPlace('Chennai', 'India', 13.08, 80.27), worldPlace('Bengaluru', 'India', 12.97, 77.59), worldPlace('Lahore', 'Pakistan', 31.55, 74.34),
    worldPlace('Karachi', 'Pakistan', 24.86, 67.01), worldPlace('Dhaka', 'Bangladesh', 23.81, 90.41), worldPlace('Kathmandu', 'Nepal', 27.72, 85.32),
    worldPlace('Beijing', 'China', 39.9, 116.4), worldPlace('Shanghai', 'China', 31.23, 121.47), worldPlace('Seoul', 'South Korea', 37.57, 126.98),
    worldPlace('Tokyo', 'Japan', 35.68, 139.69), worldPlace('Bangkok', 'Thailand', 13.76, 100.5), worldPlace('Jakarta', 'Indonesia', -6.21, 106.85),
    worldPlace('Dubai', 'UAE', 25.2, 55.27), worldPlace('Cairo', 'Egypt', 30.04, 31.24), worldPlace('Lagos', 'Nigeria', 6.52, 3.38),
    worldPlace('London', 'United Kingdom', 51.51, -0.13), worldPlace('Paris', 'France', 48.86, 2.35), worldPlace('Berlin', 'Germany', 52.52, 13.41),
    worldPlace('Moscow', 'Russia', 55.76, 37.62), worldPlace('New York', 'USA', 40.71, -74.01), worldPlace('Los Angeles', 'USA', 34.05, -118.24),
    worldPlace('Mexico City', 'Mexico', 19.43, -99.13), worldPlace('Sao Paulo', 'Brazil', -23.55, -46.63), worldPlace('Sydney', 'Australia', -33.87, 151.21),
  ]);

  return { CITIES, ENUMS, BANDS, IMPACT_WEIGHT, RULES, WORLD, isSensitive };
});
