export type NetworkAccountStatus = "disconnected" | "connected" | "error";

export type NetworkStatus = {
  networkKey: string;
  status: NetworkAccountStatus;
  displayName: string | null;
  connectedAt: string | null;
};

export type LinkedInTokenMetadata = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  scope: string | null;
  memberId: string | null;
};

export type InstanceConfig = {
  linkedinClientIdSecretRef?: string;
  linkedinClientSecretSecretRef?: string;
};

export type LinkedInCredentials = {
  clientId: string;
  clientSecret: string;
};

/** @deprecated use LinkedInTokenMetadata — kept for metrics/account helpers */
export type LinkedInAccountMetadata = LinkedInTokenMetadata & {
  accessToken?: string;
};

export type NormalizedPostMetrics = {
  likes: number;
  comments: number;
  shares: number;
  impressions: number | null;
  raw: unknown;
};

export type PostHistoryItem = {
  id: string;
  body: string;
  status: string;
  publishedAt: string | null;
  externalPostId: string | null;
  createdAt: string;
  metrics: {
    likes: number;
    comments: number;
    shares: number;
    impressions: number | null;
    fetchedAt: string | null;
  } | null;
};

export type SyncMetricsResult = {
  companyId: string;
  synced: number;
  skipped: number;
  errors: number;
  reason?: "not_connected" | "no_posts";
};
