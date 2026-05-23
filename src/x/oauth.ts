import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { PluginHttpClient } from "@paperclipai/plugin-sdk";
import type { XCredentials, XTokenMetadata } from "./types.js";

export const X_AUTH_URL = "https://twitter.com/i/oauth2/authorize";
export const X_TOKEN_URL = "https://api.twitter.com/2/oauth2/token";
export const X_USERS_ME_URL = "https://api.twitter.com/2/users/me";
export const X_SCOPES = "tweet.write users.read offline.access";

const STATE_TTL_MS = 10 * 60 * 1000;

type OAuthStatePayload = {
  companyId: string;
  nonce: string;
  exp: number;
  codeVerifier: string;
};

function generateCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}

function generateCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function buildRedirectUri(publicOrigin: string, companyPrefix: string): string {
  const origin = publicOrigin.replace(/\/$/, "");
  const prefix = companyPrefix.replace(/^\//, "").replace(/\/$/, "");
  return `${origin}/${prefix}/social-x`;
}

export function buildAuthorizeUrl(input: {
  credentials: XCredentials;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: input.credentials.clientId,
    redirect_uri: input.redirectUri,
    scope: X_SCOPES,
    state: input.state,
    code_challenge: input.codeChallenge,
    code_challenge_method: "S256",
  });
  return `${X_AUTH_URL}?${params.toString()}`;
}

export function createOAuthState(companyId: string, clientSecret: string): {
  state: string;
  codeVerifier: string;
} {
  const codeVerifier = generateCodeVerifier();
  const payload: OAuthStatePayload = {
    companyId,
    nonce: randomUUID(),
    exp: Date.now() + STATE_TTL_MS,
    codeVerifier,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", clientSecret).update(body).digest("base64url");
  return { state: `${body}.${signature}`, codeVerifier };
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
  if (!payload.companyId || !payload.nonce || !payload.exp || !payload.codeVerifier) {
    throw new Error("Payload do state OAuth incompleto.");
  }
  if (Date.now() > payload.exp) {
    throw new Error("State OAuth expirado. Tente conectar novamente.");
  }

  return payload;
}

export function codeChallengeFromVerifier(codeVerifier: string): string {
  return generateCodeChallenge(codeVerifier);
}

export async function exchangeCodeForTokens(
  http: PluginHttpClient,
  input: {
    credentials: XCredentials;
    code: string;
    redirectUri: string;
    codeVerifier: string;
  },
): Promise<XTokenMetadata> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
    code_verifier: input.codeVerifier,
    client_id: input.credentials.clientId,
  });

  const basicAuth = Buffer.from(
    `${input.credentials.clientId}:${input.credentials.clientSecret}`,
  ).toString("base64");

  const response = await http.fetch(X_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basicAuth}`,
    },
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
    throw new Error(`Falha ao trocar code por token X: ${detail}`);
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
    userId: null,
  };
}

export async function fetchXProfile(
  http: PluginHttpClient,
  accessToken: string,
): Promise<{ userId: string | null; displayName: string | null }> {
  const response = await http.fetch(`${X_USERS_ME_URL}?user.fields=name,username`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    return { userId: null, displayName: null };
  }

  const json = (await response.json()) as {
    data?: { id?: string; name?: string; username?: string };
  };

  const user = json.data;
  const displayName =
    user?.name?.trim() ||
    (user?.username ? `@${user.username}` : null) ||
    null;

  return {
    userId: user?.id ?? null,
    displayName,
  };
}
