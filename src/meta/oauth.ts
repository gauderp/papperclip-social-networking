import type { PluginHttpClient } from "@paperclipai/plugin-sdk";
import { createOAuthState, verifyOAuthState } from "../linkedin/oauth.js";
import type { MetaCredentials, MetaFacebookPage, MetaTokenMetadata } from "./types.js";

export const META_GRAPH_VERSION = "v21.0";
export const META_GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;
export const META_AUTH_URL = `https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth`;
export const META_SCOPES =
  "pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish,business_management";

export { createOAuthState, verifyOAuthState };

export function buildRedirectUri(publicOrigin: string, companyPrefix: string): string {
  const origin = publicOrigin.replace(/\/$/, "");
  const prefix = companyPrefix.replace(/^\//, "").replace(/\/$/, "");
  return `${origin}/${prefix}/social-meta`;
}

export function buildAuthorizeUrl(input: {
  credentials: MetaCredentials;
  redirectUri: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    client_id: input.credentials.appId,
    redirect_uri: input.redirectUri,
    state: input.state,
    scope: META_SCOPES,
    response_type: "code",
  });
  return `${META_AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForShortLivedToken(
  http: PluginHttpClient,
  input: {
    credentials: MetaCredentials;
    code: string;
    redirectUri: string;
  },
): Promise<{ accessToken: string; expiresIn: number | null }> {
  const params = new URLSearchParams({
    client_id: input.credentials.appId,
    client_secret: input.credentials.appSecret,
    redirect_uri: input.redirectUri,
    code: input.code,
  });

  const response = await http.fetch(`${META_GRAPH_BASE}/oauth/access_token?${params.toString()}`);
  const json = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: { message?: string; type?: string };
  };

  if (!response.ok || !json.access_token) {
    const detail = json.error?.message ?? response.statusText;
    throw new Error(`Falha ao trocar code por token Meta: ${detail}`);
  }

  return {
    accessToken: json.access_token,
    expiresIn: typeof json.expires_in === "number" ? json.expires_in : null,
  };
}

export async function exchangeForLongLivedUserToken(
  http: PluginHttpClient,
  input: {
    credentials: MetaCredentials;
    shortLivedToken: string;
  },
): Promise<{ accessToken: string; expiresIn: number | null }> {
  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: input.credentials.appId,
    client_secret: input.credentials.appSecret,
    fb_exchange_token: input.shortLivedToken,
  });

  const response = await http.fetch(`${META_GRAPH_BASE}/oauth/access_token?${params.toString()}`);
  const json = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: { message?: string };
  };

  if (!response.ok || !json.access_token) {
    const detail = json.error?.message ?? response.statusText;
    throw new Error(`Falha ao obter token long-lived Meta: ${detail}`);
  }

  return {
    accessToken: json.access_token,
    expiresIn: typeof json.expires_in === "number" ? json.expires_in : null,
  };
}

export async function fetchFacebookPages(
  http: PluginHttpClient,
  userAccessToken: string,
): Promise<MetaFacebookPage[]> {
  const fields = "id,name,access_token,instagram_business_account{id,username}";
  const params = new URLSearchParams({
    fields,
    access_token: userAccessToken,
  });

  const response = await http.fetch(`${META_GRAPH_BASE}/me/accounts?${params.toString()}`);
  const json = (await response.json()) as {
    data?: Array<{
      id?: string;
      name?: string;
      access_token?: string;
      instagram_business_account?: { id?: string; username?: string };
    }>;
    error?: { message?: string };
  };

  if (!response.ok) {
    const detail = json.error?.message ?? response.statusText;
    throw new Error(`Falha ao listar paginas Facebook: ${detail}`);
  }

  const pages: MetaFacebookPage[] = [];
  for (const row of json.data ?? []) {
    if (!row.id || !row.access_token) continue;
    pages.push({
      pageId: row.id,
      pageName: row.name?.trim() || row.id,
      pageAccessToken: row.access_token,
      igBusinessAccountId: row.instagram_business_account?.id ?? null,
      igUsername: row.instagram_business_account?.username ?? null,
    });
  }

  return pages;
}

export function selectPrimaryPage(pages: MetaFacebookPage[]): MetaFacebookPage | null {
  if (pages.length === 0) return null;
  const withIg = pages.find((page) => page.igBusinessAccountId);
  return withIg ?? pages[0] ?? null;
}

export function metaDisplayName(page: MetaFacebookPage): string {
  if (page.igUsername) {
    return `${page.pageName} / @${page.igUsername}`;
  }
  return page.pageName;
}

export async function completeMetaOAuth(
  http: PluginHttpClient,
  input: {
    credentials: MetaCredentials;
    code: string;
    redirectUri: string;
  },
): Promise<MetaTokenMetadata> {
  const short = await exchangeCodeForShortLivedToken(http, input);
  const long = await exchangeForLongLivedUserToken(http, {
    credentials: input.credentials,
    shortLivedToken: short.accessToken,
  });

  const pages = await fetchFacebookPages(http, long.accessToken);
  const primary = selectPrimaryPage(pages);
  if (!primary) {
    throw new Error(
      "Nenhuma pagina Facebook encontrada. Conceda pages_show_list e vincule uma Pagina ao app Meta.",
    );
  }

  const expiresAt =
    long.expiresIn != null
      ? new Date(Date.now() + long.expiresIn * 1000).toISOString()
      : null;

  return {
    userAccessToken: long.accessToken,
    expiresAt,
    scope: META_SCOPES,
    pageId: primary.pageId,
    pageName: primary.pageName,
    pageAccessToken: primary.pageAccessToken,
    igBusinessAccountId: primary.igBusinessAccountId,
    igUsername: primary.igUsername,
  };
}
