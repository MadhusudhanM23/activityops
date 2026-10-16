# T9 - Bedrock access

**Status:** FAILED (account restriction, not an integration defect) - AWS access now exists;
model invocation is refused by a zero account quota on a 2-day-old Free plan account (R-009).

## Hypothesis
A specific model id is invocable in a specific region from the project AWS account, subject to
FTU/Marketplace prerequisites and an observable quota.

## Date / time
2026-10-10, ~20:30 IST (UTC+05:30).

## Environment
AWS account: Free plan "project" account, `AccountFullAccessRole` via `aws login` (same-device
browser flow). CLI: aws-cli/2.37.12, Windows 11. Region: **ap-southeast-2 (Sydney)** - chosen by
the account owner; the Bedrock console and Playground were already operating there.
No Ring involvement in this test.

## Request
1. `sts get-caller-identity` - confirm local credentials.
2. `bedrock list-inference-profiles --region ap-southeast-2` - control-plane reachability.
3. `bedrock-runtime converse` with `--inference-config '{"maxTokens":10}'` and the single user
   message `"Say OK"`, repeated against three model ids:
   - `global.anthropic.claude-sonnet-4-5-20250929-v1:0`
   - `au.anthropic.claude-sonnet-4-5-20250929-v1:0`
   - `global.anthropic.claude-haiku-4-5-20251001-v1:0`
4. `service-quotas list-service-quotas --service-code bedrock --region ap-southeast-2` - read the
   actual quota values rather than infer them from the error text.

## Result
- Credentials: **OK**. Caller is an assumed role; account id withheld from this record.
- Control plane: **OK** - 50 system-defined inference profiles returned.
- Invocation: **ThrottlingException** on all three model ids, including a 10-token request:
  `Too many tokens per day, please wait before trying again.`
- Quotas (the decisive observation):

```
Model invocation max tokens per day for Anthropic Claude Sonnet 4.5 V1 1M Context Length
(doubled for cross-region calls)                              Value 0.0   Adjustable False
Global cross-region model inference tokens per day for
Anthropic Claude Sonnet 4.5 V1 1M Context Length              Value 0.0   Adjustable False
```

  A sweep of every Bedrock quota whose name contains `tokens per day` and whose value is greater
  than zero returned **`None`**: no model on this account has a non-zero daily token allowance.

## Interpretation
The error message is misleading. "Too many tokens per day" reads as a transient rate limit that a
caller should retry after, but the quota API shows the daily allowance is **0.0** and
**`Adjustable: False`**. Nothing was consumed, so this is not a daily allowance that will reset overnight.

This establishes:
- AWS authentication, IAM role, region selection and the Bedrock **control plane** all work.
- The correct inference-profile id for this region is known and was used.
- The failure is an **account-level restriction**, not a defect in our Strands/Converse adapters,
  not a credential problem, and not a model-id error.

**Follow-up the same evening (corrects an earlier conclusion).** We first read `Adjustable: False`
as a permanent Free-plan ceiling. Further checks point to account state instead:
- The account was created on 2026-10-08, two days before the test.
- In us-east-1 the same call first returned `AccessDeniedException: Your account is currently being
  verified. Verification normally takes less than 2 hours`, then, minutes later, the zero-quota
  throttle - so verification was still progressing during the test.
- The account is on the Free plan with promotional credits and no payment method. Third-party
  reports describe new accounts with zero Bedrock quotas, and Claude on Bedrock is billed through
  AWS Marketplace, which the Free plan restricts. We could not confirm this on an AWS page.
- One quota row was non-zero (`10000000.0` input tokens/minute for `openai.gpt-5.6-sol`), but
  invoking that model returned "not available for this account". A quota row is not an entitlement.

So the cause is most likely new-account verification plus the Free plan tier. It may clear on its
own, or may need a paid plan; we cannot tell which.

This does **not** establish anything about whether our Bedrock integration works. T9 remains
unproven in substance: no model has ever returned a completion to this project.

## Evidence
Commands and verbatim output are recorded above; no artifact file is produced because no model
response was ever received. The quota values are reproducible with:

```
aws service-quotas list-service-quotas --service-code bedrock --region ap-southeast-2 \
  --max-items 400 --query "Quotas[?contains(QuotaName,'tokens per day') && Value>\`0\`]"
```

## Decision
Treat real-Bedrock verification as **blocked by account state**, cause not fully determined (see
follow-up above). Retrying later is reasonable; it is not a plan we can depend on. The account owner
has chosen not to upgrade to a paid plan, which AWS does not allow to be reversed.

The hackathon rules list the **Strands SDK** as a qualifying AWS service in its own right, so the
copilot keeps running through the real Strands agent loop, with a locally hosted model during
development, labelled as not being Bedrock (decision record D-061).

T10 (tool use under Strands) is unreachable while T9 fails, and stays BLOCKED.

The README's existing statement - that the Bedrock integration is implemented and tested offline
but never run against real Bedrock - remains accurate and must not be upgraded.

## Impact on product
No code change. The AI copilot continues to run with AI off by default; `Why are we not ready?`
and `What should I do next?` are deterministic and unaffected. Review Mode still has no AI
handover artifact.

Phase 6b (EC2 + encrypted EBS) is likely to meet the same class of restriction on this account
tier; that is now the first thing to test there rather than a late discovery.

## Retest 2026-10-16
Fresh `aws login` (same role). `converse` with `maxTokens: 10` against
`global.anthropic.claude-sonnet-4-5-20250929-v1:0` in us-east-1 and ap-southeast-2: both still
`ThrottlingException: Too many tokens per day`. No Bedrock quota named "tokens per day" has a
non-zero value. Account age 8 days. Unchanged; the submission uses the Gemini path.

## Next action
Retry `converse` occasionally. If a model ever returns a completion, run
`npm run ai:smoke --workspace apps/api` with `AWS_REGION` and `BEDROCK_MODEL_ID` set and update
T9/T10. Friction log entries F-08 and F-09 record the misleading errors.
