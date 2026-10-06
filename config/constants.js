/**
 * Application Constants
 * Single source of truth for deities, roles, tempos, and limits
 */

const ROLES = {
  SUPER_ADMIN: "super_admin",
  ADMIN: "admin",
  SINGER: "singer",
  GUEST: "guest"
};

const VALID_DEITIES = [
  "Ganesha",
  "Guru",
  "Mata",
  "SarvaDharma",
  "Sai",
  "Shiva",
  "Krishna",
  "Rama",
  "Narayana",
  "Vitthala",
  "Hanuman"
];

const DEITY_ORDER = [
  "Ganesha",
  "Guru",
  "Mata",
  "SarvaDharma",
  "Sai",
  "Shiva",
  "Krishna",
  "Rama",
  "Narayana",
  "Vitthala",
  "Hanuman"
];

const DEITY_ALIASES = {
  Vitthala: ["Vitthala", "Vittala", "Vithhala", "Vithala"],
  Vittala: ["Vitthala", "Vittala", "Vithhala", "Vithala"],
  Vithhala: ["Vitthala", "Vittala", "Vithhala", "Vithala"],
  Vithala: ["Vitthala", "Vittala", "Vithhala", "Vithala"],
  Mata: ["Mata", "Devi"],
  Devi: ["Devi", "Mata"],
  Hanuman: ["Hanuman", "Anjaneya"],
  Anjaneya: ["Hanuman", "Anjaneya"],
  SarvaDharma: ["SarvaDharma", "Sarva Dharma"],
  "Sarva Dharma": ["SarvaDharma", "Sarva Dharma"]
};

const DEITY_TITLE_MATCHERS = {
  Vitthala: /vitt?h?ala|vithoba|pandurang/i,
  Vittala: /vitt?h?ala|vithoba|pandurang/i,
  Vithhala: /vitt?h?ala|vithoba|pandurang/i,
  Vithala: /vitt?h?ala|vithoba|pandurang/i,
  Hanuman: /hanuman|anjaneya|maruthi|maruti|pavana suta|bajrang/i,
  Anjaneya: /hanuman|anjaneya|maruthi|maruti|pavana suta|bajrang/i
};

const SPEED_VALUES = ["Slow", "Medium", "Fast"];

const DEFAULT_DEITY_LIMITS = {
  min_required: 0,
  max_allowed: 2
};

const PIN_LOCKOUT_CONFIG = {
  MAX_FAILURES: 5,
  LOCKOUT_MS: 15 * 60 * 1000 // 15 minutes
};

module.exports = {
  ROLES,
  VALID_DEITIES,
  DEITY_ORDER,
  DEITY_ALIASES,
  DEITY_TITLE_MATCHERS,
  SPEED_VALUES,
  DEFAULT_DEITY_LIMITS,
  PIN_LOCKOUT_CONFIG
};
