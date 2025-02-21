type MinecraftSkinMetadata = {
  model: "slim" | "default";
};

type MinecraftTexture = {
  url: string;
  metadata: MinecraftSkinMetadata;
};

type MinecraftTextures = {
  SKIN: MinecraftTexture;
};

type DecodedProfile = {
  profileId: string;
  profileName: string;
  signatureRequired: boolean;
  textures: MinecraftTextures;
  timestamp: number;
};

type ProfileCache = {
  HIT: boolean;
  cache_time: number;
  cached_at: number;
  cached_until: number;
};

type ProfileProperty = {
  name: string;
  signature: string;
  value: string;
};

type RawProfile = {
  cache: ProfileCache;
  id: string;
  name: string;
  profileActions: unknown[];
  properties: ProfileProperty[];
  status: "OK" | "ERR";
};

export type MinecraftProfileResponse = {
  decoded: DecodedProfile;
  raw: RawProfile;
};
