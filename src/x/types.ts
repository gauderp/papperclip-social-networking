export type { NetworkAccountStatus, NetworkStatus } from "../linkedin/types.js";

export type XTokenMetadata = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  scope: string | null;
  userId: string | null;
};

export type InstanceConfigX = {
  xClientIdSecretRef?: string;
  xClientSecretSecretRef?: string;
};

export type XCredentials = {
  clientId: string;
  clientSecret: string;
};
