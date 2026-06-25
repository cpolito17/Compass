// Data layer (§11): bundles the versioned /data JSON files and exposes one
// `appData` object consumed by the engines and all three tabs.

import federal from '../../data/tax-federal-2026.json';
import state from '../../data/tax-state-2026.json';
import local from '../../data/tax-local-2026.json';
import col from '../../data/cost-of-living.json';
import citiesFile from '../../data/cities.json';
import spending from '../../data/spending-distributions.json';
import lifeEvents from '../../data/life-event-costs.json';
import retirement from '../../data/retirement-config.json';
import constantsDefaults from '../../data/constants-defaults.json';

const cityIndex = {};
for (const c of citiesFile.cities) cityIndex[c.key] = c;

export const appData = {
  federal,
  state,
  local,
  col,
  cities: citiesFile.cities,
  cityIndex,
  spending,
  lifeEvents,
  retirement,
  constantsDefaults,
};

export const DATA_VINTAGE = federal.vintage;
