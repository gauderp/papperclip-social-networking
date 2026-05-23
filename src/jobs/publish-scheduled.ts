import type { PluginLogger } from "@paperclipai/plugin-sdk";
import { getLinkedInPublishCredentials } from "../linkedin/accounts.js";
import { publishLinkedInTextPost, type HttpFetch } from "../linkedin/publish.js";
import {
  listDuePendingPosts,
  markScheduledPostFailed,
  markScheduledPostPublished,
  type PluginDb,
} from "../scheduled-posts/store.js";
import { getMetaPublishCredentials } from "../meta/accounts.js";
import { publishMetaFacebookFeedPost } from "../meta/publish.js";
import { getXPublishCredentials } from "../x/accounts.js";
import { publishXTextPost } from "../x/publish.js";

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
  rateLimited: number;
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
    rateLimited: 0,
  };

  for (const post of due) {
    if (post.networkKey === "linkedin") {
      await publishLinkedInPost(deps, post, nowIso, summary);
      continue;
    }

    if (post.networkKey === "x") {
      await publishXPost(deps, post, nowIso, summary);
      continue;
    }

    if (post.networkKey === "meta") {
      await publishMetaPost(deps, post, nowIso, summary);
      continue;
    }

    await markScheduledPostFailed(deps.db, post.id, "unsupported_network");
    summary.failed += 1;
  }

  return summary;
}

type DuePost = Awaited<ReturnType<typeof listDuePendingPosts>>[number];

async function publishLinkedInPost(
  deps: PublishScheduledDeps,
  post: DuePost,
  nowIso: string,
  summary: PublishScheduledSummary,
): Promise<void> {
  const credentials = await getLinkedInPublishCredentials({ db: deps.db }, post.companyId);
  if (!credentials) {
    await markScheduledPostFailed(deps.db, post.id, "linkedin_not_connected");
    summary.skippedNotConnected += 1;
    summary.failed += 1;
    deps.logger.warn("publish-scheduled: conta LinkedIn nao conectada", {
      companyId: post.companyId,
      postId: post.id,
    });
    return;
  }

  const result = await publishLinkedInTextPost(deps.httpFetch, {
    accessToken: credentials.accessToken,
    authorUrn: credentials.authorUrn,
    body: post.body,
  });

  if (!result.ok) {
    await markScheduledPostFailed(deps.db, post.id, result.error);
    summary.failed += 1;
    deps.logger.error("publish-scheduled: falha LinkedIn", {
      postId: post.id,
      error: result.error,
    });
    return;
  }

  await markScheduledPostPublished(deps.db, post.id, result.externalPostId, nowIso);
  summary.published += 1;
  deps.logger.info("publish-scheduled: LinkedIn publicado", {
    postId: post.id,
    externalPostId: result.externalPostId,
  });
}

async function publishXPost(
  deps: PublishScheduledDeps,
  post: DuePost,
  nowIso: string,
  summary: PublishScheduledSummary,
): Promise<void> {
  const credentials = await getXPublishCredentials({ db: deps.db }, post.companyId);
  if (!credentials) {
    await markScheduledPostFailed(deps.db, post.id, "x_not_connected");
    summary.skippedNotConnected += 1;
    summary.failed += 1;
    deps.logger.warn("publish-scheduled: conta X nao conectada", {
      companyId: post.companyId,
      postId: post.id,
    });
    return;
  }

  const result = await publishXTextPost(deps.httpFetch, {
    accessToken: credentials.accessToken,
    body: post.body,
  });

  if (!result.ok) {
    if (result.retryable) {
      summary.rateLimited += 1;
      deps.logger.warn("publish-scheduled: X rate limited — retry no proximo ciclo", {
        postId: post.id,
        companyId: post.companyId,
      });
      return;
    }

    await markScheduledPostFailed(deps.db, post.id, result.error);
    summary.failed += 1;
    deps.logger.error("publish-scheduled: falha X", {
      postId: post.id,
      error: result.error,
    });
    return;
  }

  await markScheduledPostPublished(deps.db, post.id, result.externalPostId, nowIso);
  summary.published += 1;
  deps.logger.info("publish-scheduled: X publicado", {
    postId: post.id,
    externalPostId: result.externalPostId,
  });
}

async function publishMetaPost(
  deps: PublishScheduledDeps,
  post: DuePost,
  nowIso: string,
  summary: PublishScheduledSummary,
): Promise<void> {
  const credentials = await getMetaPublishCredentials({ db: deps.db }, post.companyId);
  if (!credentials) {
    await markScheduledPostFailed(deps.db, post.id, "meta_not_connected");
    summary.skippedNotConnected += 1;
    summary.failed += 1;
    deps.logger.warn("publish-scheduled: conta Meta nao conectada", {
      companyId: post.companyId,
      postId: post.id,
    });
    return;
  }

  const result = await publishMetaFacebookFeedPost(deps.httpFetch, {
    pageId: credentials.pageId,
    pageAccessToken: credentials.pageAccessToken,
    body: post.body,
  });

  if (!result.ok) {
    await markScheduledPostFailed(deps.db, post.id, result.error);
    summary.failed += 1;
    deps.logger.error("publish-scheduled: falha Meta", {
      postId: post.id,
      error: result.error,
    });
    return;
  }

  await markScheduledPostPublished(deps.db, post.id, result.externalPostId, nowIso);
  summary.published += 1;
  deps.logger.info("publish-scheduled: Meta (Facebook Page) publicado", {
    postId: post.id,
    externalPostId: result.externalPostId,
  });
}
