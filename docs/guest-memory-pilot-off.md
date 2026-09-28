# Guest Memory Pilot OFF

Guest Memory is OFF for the pilot.

Reason: privacy and data minimization while the full legal and privacy design is still pending.

The server-side contract is default-off:

- `GUEST_MEMORY_ENABLED=true` is the only value that enables Guest Memory.
- Missing, empty, `false`, or any other value keeps Guest Memory disabled.
- Production pilot should set `GUEST_MEMORY_ENABLED=false`.

While disabled:

- no Guest Memory reads are used for product behavior;
- no Guest Memory writes, updates, extraction, enrichment, or AI memory persistence runs;
- no Guest Memory rows are included in OpenAI prompt or context payloads;
- Guest Memory APIs return explicit disabled responses with empty data;
- Guest Memory navigation is hidden, and direct pages show a disabled pilot state.

Existing `guest_memory` rows are retained by the feature flag itself. They are not deleted or migrated by switching OFF. The separate, explicitly invoked retention job can sanitize rows already eligible under the hotel's existing checkout policy, including their semantic keys and copied AI-log references. OFF does not disable that administrative cleanup; no production schedule or execution is introduced here.

The flag also gates reusable personal profiles: Guest Intelligence, affinities, behavior signals, longitudinal sentiment and revenue predictions. Main generation, Concierge, Inbox, the independent profile builder, automation evaluation, post-stay consumers and the optional demo seed honor it. OFF also removes personal PMS scores and interests from new operational snapshots and prompt projections. Existing rows are not erased. Concierge does not request `guest_insights` extraction with OFF; a dedicated insight-only request returns disabled without calling the provider.

OFF is **not** a promise that no guest information is persisted or sent to a provider. Current messages, authorized reservation/room/phone, hotel Knowledge and current incident context remain operational inputs. Conversation sentiment, summaries, reasoning, takeover, escalation, tickets and tracking remain operational records. Historic personal summaries/profiles are not supplied as personalization; the normal message history is not deleted or suppressed. Independent operational text and external logs still need explicit retention decisions.

See [the OFF boundary review](guest-memory-off-boundary-review.md) for the field-level classification, behavioral evidence and historical-data proposal.

See [the local retention review](guest-memory-retention-review.md) for tested boundaries, remaining decisions, execution safeguards and production verification still pending.

`GUEST_MEMORY_ENABLED=true` is not approved for pilot. Reactivation requires a separate privacy review.
