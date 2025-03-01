export interface Player {
  id: string;
  head: string | null;
  name: string;
}

export interface FFAPlayer extends Player {
  xp: number;
  kills: number;
  deaths: number;
  highestKillStreak: number;
  currentKillStreak: number;
  bounty: number;
  heroes: any[];
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
