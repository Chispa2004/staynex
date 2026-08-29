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

Existing `guest_memory` rows are retained pending a separate privacy/legal decision. They are not deleted or migrated by this pilot change.

`GUEST_MEMORY_ENABLED=true` is not approved for pilot. Reactivation requires a separate privacy review.
