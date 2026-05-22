import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { PluginHttpClient } from "@paperclipai/plugin-sdk";
import type { LinkedInCredentials, LinkedInTokenMetadata } from "./types.js";

export const LINKEDIN_AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization";
export const LINKEDIN_TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
export const LINKEDIN_USERINFO_URL = "https://api.linkedin.com/v2/userinfo";
export const LINKEDIN_SCOPES = "openid profile email w_member_social";

const STATE_TTL_MS = 10 * 60 * 1000;

type OAuthStatePayload = {
  companyId: string;
  nonce: string;
  exp: number;
};

export function buildRedirectUri(publicOrigin: string, companyPrefix: string): string {
  const origin = publicOrigin.replace(/\/$/, "");
  const prefix = companyPrefix.replace(/^\//, "").replace(/\/$/, "");
  return `${origin}/${prefix}/social-linkedin`;
}

export function buildAuthorizeUrl(input: {
  credentials: LinkedInCredentials;
  redirectUri: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: input.credentials.clientId,
    redirect_uri: input.redirectUri,
    state: input.state,
    scope: LINKEDIN_SCOPES,
  });
  return `${LINKEDIN_AUTH_URL}?${params.toString()}`;
}

export function createOAuthState(companyId: string, clientSecret: string): string {
  const payload: OAuthStatePayload = {
    companyId,
    nonce: randomUUID(),
    exp: Date.now() + STATE_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", clientSecret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifyOAuthState(state: string, clientSecret: string): OAuthStatePayload {
  const [body, signature] = state.split(".");
  if (!body || !signature) {
    throw new Error("State OAuth invalido.");
  }

  const expected = createHmac("sha256", clientSecret).update(body).digest("base64url");
  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    throw new Error("Assinatura do state OAuth invalida.");
  }

  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as OAuthStatePayload;
  if (!payload.companyId || !payload.nonce || !payload.exp) {
    throw new Error("Payload do state OAuth incompleto.");
  }
  if (Date.now() > payload.exp) {
    throw new Error("State OAuth expirado. Tente conectar novamente.");
  }

  return payload;
}

export async function exchangeCodeForTokens(
  http: PluginHttpClient,
  input: {
    credentials: LinkedInCredentials;
    code: string;
    redirectUri: string;
  },
): Promise<LinkedInTokenMetadata> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
    client_id: input.credentials.clientId,
    client_secret: input.credentials.clientSecret,
  });

  const response = await http.fetch(LINKEDIN_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const json = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
    scope?: string;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !json.access_token) {
    const detail = json.error_description ?? json.error ?? response.statusText;
    throw new Error(`Falha ao trocar code por token LinkedIn: ${detail}`);
  }

  const expiresAt =
    typeof json.expires_in === "number"
      ? new Date(Date.now() + json.expires_in * 1000).toISOString()
      : null;

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    expiresAt,
    scope: json.scope ?? null,
    memberId: null,
  };
}

export async function fetchLinkedInProfile(
  http: PluginHttpClient,
  accessToken: string,
): Promise<{ memberId: string | null; displayName: string | null }> {
  const response = await http.fetch(LINKEDIN_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    return { memberId: null, displayName: null };
  }

  const json = (await response.json()) as {
    sub?: string;
    name?: string;
    given_name?: string;
    family_name?: string;
  };

  const displayName =
    json.name?.trim() ||
    [json.given_name, json.family_name].filter(Boolean).join(" ").trim() ||
    null;

  return {
    memberId: json.sub ?? null,
    displayName,
  };
}
