export type SchedulePostInput = {
  body: string;
  scheduledAt: string;
};

export type PublishNowInput = {
  body: string;
};

export type ValidationResult =
  | { ok: true; body: string; scheduledAt: string }
  | { ok: false; error: string };

export type PublishNowValidationResult =
  | { ok: true; body: string }
  | { ok: false; error: string };

export function validateSchedulePostInput(input: SchedulePostInput): ValidationResult {
  const body = input.body?.trim() ?? "";
  if (!body) {
    return { ok: false, error: "body_required" };
  }
  if (body.length > 3000) {
    return { ok: false, error: "body_too_long" };
  }

  const scheduledAtRaw = input.scheduledAt?.trim() ?? "";
  if (!scheduledAtRaw) {
    return { ok: false, error: "scheduled_at_required" };
  }

  const scheduledAtMs = Date.parse(scheduledAtRaw);
  if (Number.isNaN(scheduledAtMs)) {
    return { ok: false, error: "scheduled_at_invalid" };
  }

  if (scheduledAtMs <= Date.now()) {
    return { ok: false, error: "scheduled_at_must_be_future" };
  }

  return {
    ok: true,
    body,
    scheduledAt: new Date(scheduledAtMs).toISOString(),
  };
}

export function validatePublishNowInput(input: PublishNowInput): PublishNowValidationResult {
  const body = input.body?.trim() ?? "";
  if (!body) {
    return { ok: false, error: "body_required" };
  }
  if (body.length > 3000) {
    return { ok: false, error: "body_too_long" };
  }
  return { ok: true, body };
}
