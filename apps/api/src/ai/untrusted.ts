/**
 * Untrusted operator text (spec v7 sec. 17, "Prompt injection defense").
 *
 * Check reasons, incident reasons, device labels, site labels and free-text notes
 * are typed by people and may contain anything - including text written to look
 * like instructions to the model. They reach the model only:
 *
 *   - inside tool RESULTS (never the system prompt or the task instruction);
 *   - wrapped in an object that marks them as data;
 *   - stripped of control characters and bounded in length.
 *
 * The system prompt tells the model that any `untrusted` value is quoted data to
 * describe, never an instruction to follow. That alone is not a guarantee, which
 * is why the agent also has no tool that can change anything (see tools.ts).
 */

export interface UntrustedText {
  untrusted: true;
  text: string;
}

const MAX_LENGTH = 300;

export function untrusted(value: string | null | undefined): UntrustedText | null {
  if (value === null || value === undefined) return null;
  const cleaned = value
    // Control characters (except tab/newline) can hide text or break framing.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, '')
    // Zero-width and bidi-override characters can disguise what a reader sees.
    .replace(/[​-‏‪-‮⁦-⁩﻿]/g, '')
    .trim();
  const text = cleaned.length > MAX_LENGTH ? `${cleaned.slice(0, MAX_LENGTH)}… [truncated]` : cleaned;
  return { untrusted: true, text };
}
