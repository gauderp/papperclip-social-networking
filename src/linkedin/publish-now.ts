import { getLinkedInPublishCredentials } from "./accounts.js";
import { publishLinkedInTextPost, type HttpFetch } from "./publish.js";
import {
  createScheduledPost,
  markScheduledPostFailed,
  markScheduledPostPublished,
  type PluginDb,
} from "../scheduled-posts/store.js";
import { validatePublishNowInput } from "../scheduled-posts/validation.js";

export type PublishLinkedInNowDeps = {
  db: PluginDb;
  httpFetch: HttpFetch;
  companyId: string;
  body: string;
  createdByAgentId?: string | null;
  createdByRunId?: string | null;
  now?: () => Date;
};

export type PublishLinkedInNowResult =
  | {
      ok: true;
      postId: string;
      externalPostId: string;
      publishedAt: string;
    }
  | { ok: false; error: string };

/**
 * Publica imediatamente no LinkedIn e grava em scheduled_posts como published
 * (mesmo histórico/métricas do fluxo agendado).
 */
export async function publishLinkedInPostNow(
  deps: PublishLinkedInNowDeps,
): Promise<PublishLinkedInNowResult> {
  const validated = validatePublishNowInput({ body: deps.body });
  if (!validated.ok) {
    return { ok: false, error: validated.error };
  }

  const credentials = await getLinkedInPublishCredentials({ db: deps.db }, deps.companyId);
  if (!credentials) {
    return { ok: false, error: "linkedin_not_connected" };
  }

  const now = (deps.now ?? (() => new Date()))();
  const nowIso = now.toISOString();

  const post = await createScheduledPost(deps.db, {
    companyId: deps.companyId,
    networkKey: "linkedin",
    body: validated.body,
    scheduledAt: nowIso,
    createdByAgentId: deps.createdByAgentId ?? null,
    createdByRunId: deps.createdByRunId ?? null,
  });

  const result = await publishLinkedInTextPost(deps.httpFetch, {
    accessToken: credentials.accessToken,
    authorUrn: credentials.authorUrn,
    body: validated.body,
  });

  if (!result.ok) {
    await markScheduledPostFailed(deps.db, post.id, result.error);
    return { ok: false, error: result.error };
  }

  await markScheduledPostPublished(deps.db, post.id, result.externalPostId, nowIso);

  return {
    ok: true,
    postId: post.id,
    externalPostId: result.externalPostId,
    publishedAt: nowIso,
  };
}
