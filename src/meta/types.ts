export type MetaCredentials = {
  appId: string;
  appSecret: string;
};

export type MetaTokenMetadata = {
  userAccessToken: string;
  expiresAt: string | null;
  scope: string | null;
  pageId: string;
  pageName: string;
  pageAccessToken: string;
  igBusinessAccountId: string | null;
  igUsername: string | null;
};

export type MetaFacebookPage = {
  pageId: string;
  pageName: string;
  pageAccessToken: string;
  igBusinessAccountId: string | null;
  igUsername: string | null;
};
