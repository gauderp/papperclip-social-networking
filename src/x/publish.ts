export type XPublishInput = {
  accessToken: string;
  body: string;
};

export type XPublishResult =
  | { ok: true; externalPostId: string }
  | { ok: false; error: string; retryable?: boolean };

export type HttpFetch = (url: string, init?: RequestInit) => Promise<Response>;

const X_TWEETS_URL = "https://api.twitter.com/2/tweets";

/**
 * Publica um post de texto no X via API v2.
 * Em 429 (rate limit), retorna retryable para o job reprocessar no proximo ciclo.
 */
export async function publishXTextPost(
  fetchFn: HttpFetch,
  input: XPublishInput,
): Promise<XPublishResult> {
  let response: Response;
  try {
    response = await fetchFn(X_TWEETS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: input.body }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "network_error";
    return { ok: false, error: message };
  }

  if (response.status === 429) {
    return { ok: false, error: "x_rate_limited", retryable: true };
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return {
      ok: false,
      error: `x_http_${response.status}${text ? `:${text.slice(0, 200)}` : ""}`,
    };
  }

  try {
    const body = (await response.json()) as { data?: { id?: string } };
    if (body.data?.id) {
      return { ok: true, externalPostId: body.data.id };
    }
  } catch {
    // fall through
  }

  return { ok: false, error: "x_missing_tweet_id" };
}
