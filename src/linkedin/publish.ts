export type LinkedInPublishInput = {
  accessToken: string;
  authorUrn: string;
  body: string;
};

export type LinkedInPublishResult =
  | { ok: true; externalPostId: string }
  | { ok: false; error: string };

export type HttpFetch = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * Publica um post de texto no LinkedIn via UGC Posts API v2.
 */
export async function publishLinkedInTextPost(
  fetchFn: HttpFetch,
  input: LinkedInPublishInput,
): Promise<LinkedInPublishResult> {
  const payload = {
    author: input.authorUrn,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text: input.body },
        shareMediaCategory: "NONE",
      },
    },
    visibility: {
      "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
    },
  };

  let response: Response;
  try {
    response = await fetchFn("https://api.linkedin.com/v2/ugcPosts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "network_error";
    return { ok: false, error: message };
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return {
      ok: false,
      error: `linkedin_http_${response.status}${text ? `:${text.slice(0, 200)}` : ""}`,
    };
  }

  const restliId = response.headers.get("x-restli-id");
  if (restliId) {
    return { ok: true, externalPostId: restliId };
  }

  try {
    const body = (await response.json()) as { id?: string };
    if (body.id) {
      return { ok: true, externalPostId: body.id };
    }
  } catch {
    // fall through
  }

  return { ok: false, error: "linkedin_missing_post_id" };
}
