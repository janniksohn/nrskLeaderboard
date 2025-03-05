export interface Player {
  id: string;
  head: string | null;
  name: string;
  index: number;
}

export interface FFAPlayer extends Player {
  xp: number;
  kills: number;
  deaths: number;
  highestKillStreak: number;
  currentKillStreak: number;
  bounty: number;
  heroes: Character[];
}

type PlayerInfoApiCacheProperties = {
  HIT: boolean;
  cache_time: number;
  cache_time_left: number;
  cached_at: number;
  cached_until: number;
};

export type PlayerInfo = {
  cache: PlayerInfoApiCacheProperties;
  id: string | null;
  name: string;
  status: "OK" | "ERR";
};

interface ExperiencePoints {
  experiencePoints: number;
}

// Generic ability property interface
interface AbilityProperty {
  experiencePoints: number;
}

// Generic ability interface
interface Ability {
  [propertyName: string]: AbilityProperty;
}

// Character abilities interface
interface CharacterAbilities {
  [abilityName: string]: Ability;
}

// Characters interface
interface Character {
  [characterName: string]: CharacterAbilities;
}
