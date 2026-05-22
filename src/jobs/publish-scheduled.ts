import type { PluginLogger } from "@paperclipai/plugin-sdk";
import { getLinkedInPublishCredentials } from "../linkedin/accounts.js";
import { publishLinkedInTextPost, type HttpFetch } from "../linkedin/publish.js";
import {
  listDuePendingPosts,
  markScheduledPostFailed,
  markScheduledPostPublished,
  type PluginDb,
} from "../scheduled-posts/store.js";

export type PublishScheduledDeps = {
  db: PluginDb;
  httpFetch: HttpFetch;
  logger: PluginLogger;
  now?: () => Date;
};

export type PublishScheduledSummary = {
  processed: number;
  published: number;
  failed: number;
  skippedNotConnected: number;
};

export async function runPublishScheduledJob(deps: PublishScheduledDeps): Promise<PublishScheduledSummary> {
  const now = (deps.now ?? (() => new Date()))();
  const nowIso = now.toISOString();
  const due = await listDuePendingPosts(deps.db, nowIso);

  const summary: PublishScheduledSummary = {
    processed: due.length,
    published: 0,
    failed: 0,
    skippedNotConnected: 0,
  };

  for (const post of due) {
    if (post.networkKey !== "linkedin") {
      await markScheduledPostFailed(deps.db, post.id, "unsupported_network");
      summary.failed += 1;
      continue;
    }

    const credentials = await getLinkedInPublishCredentials({ db: deps.db }, post.companyId);
    if (!credentials) {
      await markScheduledPostFailed(
        deps.db,
        post.id,
        "linkedin_not_connected",
      );
      summary.skippedNotConnected += 1;
      summary.failed += 1;
      deps.logger.warn("publish-scheduled: conta LinkedIn nao conectada", {
        companyId: post.companyId,
        postId: post.id,
      });
      continue;
    }

    const result = await publishLinkedInTextPost(deps.httpFetch, {
      accessToken: credentials.accessToken,
      authorUrn: credentials.authorUrn,
      body: post.body,
    });

    if (!result.ok) {
      await markScheduledPostFailed(deps.db, post.id, result.error);
      summary.failed += 1;
      deps.logger.error("publish-scheduled: falha ao publicar", {
        postId: post.id,
        error: result.error,
      });
      continue;
    }

    await markScheduledPostPublished(deps.db, post.id, result.externalPostId, nowIso);
    summary.published += 1;
    deps.logger.info("publish-scheduled: post publicado", {
      postId: post.id,
      externalPostId: result.externalPostId,
    });
  }

  return summary;
}
