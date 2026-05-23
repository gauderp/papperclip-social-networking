import { META_GRAPH_BASE } from "./oauth.js";

export type MetaPublishInput = {
  pageId: string;
  pageAccessToken: string;
  body: string;
};

export type MetaPublishResult =
  | { ok: true; externalPostId: string }
  | { ok: false; error: string };

export type HttpFetch = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * Publica texto no feed da Pagina Facebook via Graph API.
 * Instagram Business fica vinculado em metadata para publicacao futura.
 */
export async function publishMetaFacebookFeedPost(
  fetchFn: HttpFetch,
  input: MetaPublishInput,
): Promise<MetaPublishResult> {
  const params = new URLSearchParams({
    message: input.body,
    access_token: input.pageAccessToken,
  });

  let response: Response;
  try {
    response = await fetchFn(`${META_GRAPH_BASE}/${input.pageId}/feed`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "network_error";
    return { ok: false, error: message };
  }

  const json = (await response.json().catch(() => ({}))) as {
    id?: string;
    error?: { message?: string; code?: number };
  };

  if (!response.ok || !json.id) {
    const detail = json.error?.message ?? response.statusText;
    return {
      ok: false,
      error: `meta_http_${response.status}${detail ? `:${detail}` : ""}`,
    };
  }

  return { ok: true, externalPostId: json.id };
}
