# Phase 1 Reliability Implementation Plan

> Execute the supplied 13 October 2026 Phase 1 specification; no new audit or improvement programme. Native and web work are independent; one final review and grouped validation before publication.

Goal: session-isolated native GPS and durable, recoverable photo/history operations.

Architecture: native generation-bound requests with scoped stops; a minimal photo operation store in the existing photo database coordinates staged bytes and canonical metadata; canonical AppData remains authoritative. Historical repair returns an awaited persistence outcome.

Protections: preserve existing records, pay, 35m Real fence, carryout boundaries, return repair, offline operation, signing/package identity and Wear compatibility.

## Tasks

- [x] Recover current remote heads and compare recent work; clean baseline.
- [x] N1: native agent adds scoped active/pending start-stop policy, generation-bound callbacks/replay, tests; one signed CI validation cycle.
- [x] N2/N3: write failing attachment/deletion/restart/quota tests. Add atomic staging and cleanup transactions with durable operation intents, await metadata commit, retry via idempotent proof identity; reconcile pending operations on app load/resume. Existing photos are untouched by the additive operation-store upgrade.
- [x] N5: write failing pending/failure/conflict tests; make historical repair async, keep editor open and disable duplicate submits, preserve Save Protection.
- [ ] Run strict TypeScript/lint/full Europe-London tests/build/artifact checks. Review native and web changes. Group source/release metadata updates and publish only verified artifacts.
- [ ] Final report exact versions, hashes, test counts, signing status and physical NOT TESTED.

Review focus: optimistic failed metadata in memory; crash after either store commit; task deletion during processing; duplicate/resumed operations; late native callbacks/queued starts; historical stale-tab conflicts.

Ruling: user expressly authorized continuous implementation/publication and no routine confirmations; proceed within supplied scope. Runtime/device evidence remains separate from automated tests.

## Validation evidence

- Web final Europe/London suite: 542 TypeScript tests passed, 0 failed/skipped/cancelled; rendered production HTML test: 1 passed, 0 failed. Total 543 passed.
- 13 photo operation tests and 10 historical repair tests; capability-aware native stop-all test added. Existing 11 return-recovery tests passed.
- Strict TypeScript, production build and artifact verification passed. Lint: 0 errors, 33 existing warnings.
- Focused web/native reviews: reported blockers resolved; no remaining confirmed blocker.
- Native main 36bb1a1420483ff67cf88710a52729826e1bad45; Android/Wear 2.2.71/code76. Signed workflow 38467502718 succeeded and public release v2.2.71 published. App/Wear JVM tasks passed: 38 app + 34 Wear test methods declared (13 new N1); executed XML/counts not exported by existing workflow. Wear lint, debug/signed release builds and package/signature guards passed. Existing certificate retained.
- Physical acceptance NOT TESTED: no physical Android/Wear device available. Screen-off/background, real process kill/recovery and weak-signal driving still require physical acceptance. Automated session-ordering evidence is separate from runtime acceptance.
