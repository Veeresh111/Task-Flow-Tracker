# FLOWTRACKER HRMS — $0 / ₹0 COST GOVERNANCE POLICY

## 1. Absolute Operating Mandate
FlowTracker is engineered to operate at **strictly $0 / ₹0 operational cost**. Under no circumstances may any dependency, service call, or workflow incur charges, require a credit card, or silently switch to a billable plan.

---

## 2. Infrastructure & Free-Tier Quota Boundaries

| Provider | Service / Resource | Documented Free-Tier Limit | Hard Safeguard / Quota Behavior |
| :--- | :--- | :--- | :--- |
| **Supabase** | PostgreSQL Database | 500 MB database storage | Bounded queries, indexing, and selective column projection. No mass data dumps. |
| **Supabase** | Auth (MAU) | 50,000 Monthly Active Users | Native Supabase GoTrue authentication. Zero paid identity services. |
| **Supabase** | Edge Functions | 500,000 invocations / month | Invocations restricted to critical operations (`hire`, `activate`, `ats`, `email`). |
| **Supabase** | Storage | 1 GB bucket storage | Resumes & documents bounded to $\le 5$ MB per upload. |
| **Resend** | Transactional Email | 3,000 emails / month (100 / day) | Durable PostgreSQL queue (`pending_emails`). When daily limit is reached, jobs enter `quota_exhausted`. Retries halt until reset. Zero auto-billing. |
| **HuggingFace** | LLM Inference API | Serverless Free Inference Rate Limits | Dedicated fine-grained serverless token. If rate limited ($429$) or cold start timeout occurs, system fails over to `deterministic_rule_based` matching. Zero paid tokens consumed. |
| **Hosting** | Web Client | Vercel / Netlify Free Tier | Static Single Page App (`dist/`). Zero server-side compute charges. |

---

## 3. Quota Exhaustion & Failover Behavior

1. **Email Quota Saturation:**
   - When Resend returns HTTP 429 or quota limit errors, the worker marks the email row status as `quota_exhausted`.
   - The worker stops hammering the API to prevent account suspension.
   - The queue remains durable in PostgreSQL. Emails are retried only after the quota window resets.
   - The system NEVER presents un-sent emails as sent.
2. **AI Provider Outage or Rate Limit:**
   - If HuggingFace inference fails, times out, or exhausts free quota, the system engages the built-in pure mathematical rule engine.
   - The screening report explicitly outputs `method: "deterministic_rule_based"`.
   - The system NEVER misrepresents deterministic text matching as AI output.
3. **No Automatic Upgrades:**
   - No payment methods or billing profiles are linked. Any request from a provider to upgrade must result in graceful degradation, never financial liability.
