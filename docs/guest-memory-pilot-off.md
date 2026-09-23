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

These guarantees refer specifically to the `guest_memory` circuit. OFF is **not** a promise that no guest information is persisted elsewhere or sent to a provider. Operational messages, reservation/PMS context, phone/room, independent Guest Intelligence profiles, affinities, behavior signals, sentiment and conversation summaries follow separate paths. With its own feature/key configuration, OpenAI Concierge still receives operational and independent profile context; its optional debug logger can also record that payload. Mixed-purpose profiles and external logs need explicit retention decisions, rather than silently inheriting the memory policy.

See [the local retention review](guest-memory-retention-review.md) for tested boundaries, remaining decisions, execution safeguards and production verification still pending.

`GUEST_MEMORY_ENABLED=true` is not approved for pilot. Reactivation requires a separate privacy review.
