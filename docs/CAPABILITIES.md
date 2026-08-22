# dsh-daoing-memory — Capabilities & Signature Features

This document describes the full capability surface of this plugin: the top-level design features, the agent tool surface and how to use each tool, and the memory data structure. For the rationale behind the design, see [DESIGN.md](./DESIGN.md).

## 1. Top-level design features (how each one is implemented)

### 1. The four-word loop: create · use · revise · record
This system does not treat memory as a "warehouse"; it treats it as a **knowledge-governance process with a lifecycle**. Any piece of knowledge must fully walk through four phases — "created → used → revised → recorded" — where each phase has its own mechanism and entry point. This guarantees that a memory is not "written and done", but is continuously verified, revised, and pruned around real usage, leaving only knowledge that survives scrutiny. Tools map one-to-one to phases, so an agent that calls the right tool at the right time naturally completes the loop.

### 2. Memory is earned, never decreed
A new experience is not "trusted" at birth; it is a **candidate / pending confirmation**. Whether it can be promoted to "live/trusted" and enter recall depends on **whether it is actually used and reported back as successful**: each success counts as a positive sample, each failure as a negative sample, and trust is computed from these samples by a Bayesian rule — the longer it is used, the more trustworthy. **No source (not even its author) can stamp a "high-trust" badge on an experience without passing verification.** Thus "what is trusted has been verified", which mechanically prevents fabricated memory from being treated as a basis for action.

### 3. Two kinds of memory, deliberately separated
The system stores two fundamentally different kinds of memory.
- **Stable knowledge about "this user"** — who they are, how they prefer to work, what they care about that is still open. Its purpose is "to understand this person", and its only source is the user's own words.
- **Knowledge about "what to do in a given situation"** — e.g. an operation path that works, or a path that is a dead end. It describes "situation → correct action", so it can be reused in similar situations. Its purpose is "to get the job done right", and its source is any success or failure experience.

The two are separated in source, write path, recall timing, and governance: the former is derived only from the user, the latter from experience. Separation prevents project details/task context from leaking into the stable user model, and prevents personal traits from being mistaken for general practice.

### 4. A human always stays in the loop
By default the system does not trust any "auto-written" knowledge to evolve on its own; key control remains with the human. Two mechanisms: ① a browser workbench lets a human view, correct, promote, delete, or archive any memory at any time; ② **only experiences explicitly approved by a human may self-grow** (absorb new evidence to become stronger), while machine-derived experiences have no privilege to modify themselves. Together these ensure memory is a "shared, human-gated" asset rather than a self-talking, runaway black box.

### 5. Append-only audit ledger
Every operation that changes memory does not edit the old record; instead it "**appends a new record to the ledger**", and each record **carries the fingerprint of the previous one**, linking head to tail into an immutable chain. Thus any given "what came from where, what changed, who changed it, why" can be fully traced; to roll back, walk the chain to restore an old node. Because old records are never deleted, when memory is polluted or drifts you can locate, attribute, and recover — instead of it silently going bad.

### 6. Scope isolation against pollution
Each experience declares which domain/context it belongs to; recall only takes experiences "in the same domain" or "explicitly marked cross-domain". Thus a "Windows build" lesson is not applied elsewhere. Cross-domain sharing is a **privilege that is off by default**, avoiding a single local experience from accidentally polluting all scenarios.

### 7. Economic injection budget
The system sets a budget for "how many memories can be injected per turn" (measured in estimated tokens) and sorts experiences by value (trust × relevance), injecting only the most worthwhile and omitting the rest. Recall must also clearly tell the agent "is there relevant experience" — **if there is none, say so explicitly**, which is itself valuable (letting the agent know this is a fresh exploration, not a forced fit). Budget plus the "negative channel" together avoid the two extremes of "stuffing the context with memory" and "making things up when there is none".

### 8. Anti-poisoning boundary
The system draws a hard line on "who memory may come from": what shapes "stable knowledge about the user" is **only the user's own words**; external content (books/documents/other people's words/assistant suggestions), however brilliant, can only settle as "general practice (experience)" and is never allowed to be written as "facts about the user". For content that is uncertain, the system does not guess; it **defers to human adjudication**. Thus even if injected, misleading noise enters the context, it will not pollute the model of the user, nor drive inferences that harm the user.

### 9. Meta-experience: turn "the human's judgment about what to delete" into a rule for future behavior
When a human decides a memory is no good and deletes it, the deletion is **tagged with a reason**. The system accumulates these deletion reasons and, once enough have gathered, produces one summary as a "meta-experience". This meta-experience in turn guides future extraction to **avoid producing the same kind of thing that would be deleted**. It is machine-generated, cross-domain, and protected (cannot be deleted, only archived) because it is the basis for the whole system's self-correction — **feeding "which memories the human thinks should not exist" back into the system's future behavioral rules**.

---

## 2. Agent tool surface (how to use each tool, and the flow)

### Overall flow (one task's memory loop)
1. Before a task → ① `memory_recall` (use)
2. During a task → if recall offered an unverified "candidate trial", you may really try one
3. After a task → ② `memory_refine` (create) settle it as a candidate
4. After use → ③ `memory_report` (use/verify) — **using is verification**
5. Experience challenged/failed → ④ `memory_revise` + ⑤ `memory_verify` (revise)
6. Important interaction → ⑥ `memory_fact` → (when cadence due) ⑦ `memory_extract` (record)
7. Read an external source → ⑧ `memory_ingest` (ingest)
8. Experiences piling up → ⑪ `memory_consolidate` (consolidate)
9. Inspect history → ⑩ `memory_ledger` (ledger)

### Dedup rule: mechanical pre-filter, then LLM semantic verdict
- **Why two levels**: the same lesson may be deposited repeatedly in the library — different sessions, different wording, different paths actually pointing to one reusable lesson. Word-level dedup misses "different wording but same meaning"; handing everything to the model is costly and can wrongly merge. So: **fast mechanical filter, precise semantic verdict**.
- **Trigger**: when `refine` / `ingest` submits a new experience, the system first quickly filters by **similarity / token overlap** for a batch of suspicious "near-duplicate" candidates (lightweight, cheap, full-coverage).
- **Semantic verdict (delegated to the model)**: the model judges "new experience + these candidates" and returns one of three conclusions:
  - **`different`** (a distinct lesson) → settle as a new candidate normally, **and skip the mechanical gate** — so it is not blocked for looking similar, preserving "subtle differences in different situations".
  - **`merge`** (should merge into an existing experience) → only when the target experience is "**human-approved + live**" does it trigger **self-growth**, absorbing the new wording/evidence and becoming stronger; otherwise it degrades to corroboration.
  - **`duplicate`** (pure repetition, no information gain) → **reject** the submission, but **add one corroboration count** to the existing experience, so the submission yields one free verification.
- **Model routing**: the dedup model comes from the current session's request-header config (same source as the main dialog); if that config cannot be obtained, it **conservatively returns `different`** — rather store one more candidate than risk wrongly merging two distinct experiences.
- **In-batch dedup too**: within a single `ingest`, the multiple new experiences also dedup against each other by token overlap.
- **Mapping to tool returns**: `corroboratedId` returned by `memory_refine` / `memory_ingest` is the id of the experience "merged into / corroborated" after a merge/duplicate verdict; `accepted=false` with that id means this submission added nothing but one corroboration to an existing experience.
- **Purpose**: avoid both "the same lesson repeatedly piled into the library" and "semantically close but genuinely different experiences wrongly merged". Dedup looks at "whether it points to the same reusable lesson", not whether the wording is identical.

### ① memory_recall (use · before a task)
- Purpose: before starting a complex task, recall experiences relevant to the current situation to avoid repeating mistakes or reusing a viable path directly.
- Timing: **before complex tasks** (ones with judgment cost, potential detours, walls, or known dead ends); no need for trivial calls.
- Key params: `situation` (new task situation: type/domain/symptom/constraint); `context` (optional, domain scope; only same-domain or cross-domain shared experiences are recalled); `topK` (candidate cap before adjudication); `deep` (when the normal set is too thin, also search archived experiences).
- Read the return: `items` (each with **relevance score + verdict: adopt directly / use as reference / use only as a clue** + "may conflict with current situation" boundary warnings); `none=true` (**no relevant experience — this is normal**: a fresh exploration, don't force a fit); `candidateTrials` (unverified candidates, optionally truly try one, must report after); `omitted/estimatedTokens` (omissions and estimate under budget); `consolidationDue` (hint that consolidation is due).
- Flow: call → act by verdict (direct: follow it; reference: adapt it; clue: use as a clue only) → respect conflict warnings, don't cross boundaries → if `none`, explore freely → if you tried a candidate, report success via `memory_report`.

### ② memory_refine (create · after a task)
- Purpose: distill a multi-step, judgment-heavy complex task into one experience candidate.
- Timing: after a task where the process had "reusable judgment" — detours, corrected direction, hitting a boundary, or confirming a dead end. Do not refine trivial single-tool calls.
- Key params: `kind` (positive = viable path / negative = confirmed dead end; negative needs `failureReason`); `family` (task-family tag); `gist` (**one** reusable lesson; if semicolons are needed for multiple lessons, split into multiple calls); `situation` (the **situation category** that triggers recall — generalized, not "this task"); `path` (ordered action steps); `reasoning` (transferable judgment context — "under what situation this path holds, why, and where the boundary is"; **must not say "this session / this time / the user on the spot…"**); `limits` (applicable boundary); `evidence` (evidence pointer: at least one of trace/session/note non-empty, else rejected); `complexity` (complexity gate: trajectory token count/steps/whether failed; below threshold and no failure → rejected; `humanMarked` bypasses the gate); `context` (scope).
- Principle: one experience = one lesson; write the generalized lesson for future reuse; one call = one experience. If `accepted=false`, read `reason`; `corroboratedId` means "this duplicates an existing one, already corroborated".

### ③ memory_report (use/verify · after using)
- Purpose: report the result of "using an experience" — **using is verification**.
- Timing: after acting on a recalled experience.
- Key params: `id` (+optional `revision`, defaults to current live revision; pass a draft revision to test it); `outcome` (success/fail; for a negative experience, success = the prediction hit, the dead end really is dead, also a positive result); `attribution` (on fail: experience = the experience itself / environment = environment/network/permission, **never penalize the experience** / unrelated = unrelated / unknown = insufficient signal, not counted); `evidence` (objective evidence text, **can override subjective attribution**); `dedupeKey` (idempotency key, only one report per execution); `tokensUsed/Saved`.
- Flow/effect: success on candidate → **promoted to live**; success on draft revision → **adopted** (old revision superseded, rollback possible); fail attributed to experience → **challenged** (quarantined from recall, needs revision); candidate trial fail → **sent to cold palace**.
- Note: environment failure does not penalize the experience; **evidence beats claims**.

### ④ memory_revise (revise · propose a revision draft)
- Purpose: propose a revision draft (revision +1) for an experience that is **challenged**.
- Timing: after an experience is quarantined due to failure and you have diagnosed the root cause.
- Key params: `id` (must be challenged), `reason` (diagnosis: root cause of failure + what changed this time), and optionally replacement gist/situation/path/reasoning/limits.
- After: the draft is still a candidate; it needs a successful `memory_report` (targeting that revision) or a passing `memory_verify` shadow replay to be promoted; the old revision becomes superseded (rollback possible).

### ⑤ memory_verify (revise · shadow replay)
- Purpose: when a real retry is expensive/dangerous, replay the draft against "known-result historical samples"; if it passes, promote directly.
- Timing: there is a revision draft and real verification is costly.
- Key params: `id`, `revision` (the draft version to verify), `samples` (array: historical situation + known result success/fail).
- Returns: `passed` + `agreement` (agreement rate).

### ⑥ memory_fact (record · diary)
- Purpose: append an important interaction record with the user (event layer, **permanent, never auto-deleted**).
- Timing: promptly after an important interaction.
- Key params: `kind` (said/delegated/promised/happened/preference/other), `content` (one paragraph covering who/what/when), `sessionRef` (trace), `tags` (optional).
- Returns: `extractionDue` true → **extraction cadence is due, call `memory_extract`**; `pending` gives the diary entries awaiting extraction.
- Meaning: diary is the raw material for extraction; it also keeps the conversation bidirectionally traceable.

### ⑦ memory_extract (record · upward channel)
- Purpose: distill the pending diary window into two kinds: ① **profile facts** (the AI's stable model of the user) ② **concerns** (open items the agent remembers for the user).
- **Timing (when to extract)**: memory is **cadence-triggered**, not "extract after each entry". **Conditions (both must hold)**: ① accumulated **unextracted diary entries reach a threshold** (default 8); ② **minimum interval since the last extraction** (default 12 hours). When due, the next `memory_fact` explicitly returns "extraction cadence due" and gives the **pending diary window**. Trigger is either **automatic cadence** or **manual**. **Extraction first folds in the "deletion-feedback" meta-experience**: if many experiences were recently deleted by a human, the system first summarizes those deletion reasons into a meta-experience and returns it with this extraction, so this time's proposals avoid being the same kind that would be deleted. Each extraction is archived (trigger/summary/produced facts/diary count consumed).
- Key params: `proposals[]` (profile proposals: category=identity/preference/communication/habit/thinking/value/delegation/background/other + factKey + value + sourceDiaryIds[], **only from the user's own words**; identical profile stays one entry, uncertain ones go to other for human); `concerns[]` (concerns: action=new must carry `background` / mention / status=ongoing/concluded/recurring/paused; **recurring habit → profile; reusable practice → experience; neither is a concern; not a session title tag**); `summary` (one-line summary of the extraction window).
- Principle: **project content/goals/decisions/environment config are not profile** — unclosed ones go to concerns, the rest is dropped.

### ⑧ memory_ingest (ingest · external source)
- Purpose: batch-extract experience candidates from any external source (books/skills/documents/articles/other people's words).
- Timing: after reading/extracting an external source you want the library to learn.
- Key params: `sourceType` (conversation/document/skill/book/note/other, determines confidence prior), `sourceRef` (trace), `context` (scope), `note`; `experiences[]` (each one a lesson: kind/family/gist/situation/path/reasoning/limits; negative adds failureReason).
- Principle: **never** generate profile facts or concerns from external sources; one experience = one reusable lesson, many lessons split into many; write the generalized lesson (sourceRef is the evidence pointer). Returns: `accepted` (candidates that pass dedup and gates), `rejected` (reason).

### ⑨ memory_human_inject (special channel · human injection)
- Purpose: inject **general experiences already confirmed by a human (author/expert)** directly into the library, immediately "live/trusted" and available for recall; used when it is inconvenient to operate in the page, or to quickly bring in settled knowledge.
- Timing: a human-provided, certain, reliable general lesson.
- Key params: kind/family/gist/situation/path/reasoning/limits (negative adds failureReason)/context/reason (injection reason, for audit). **One at a time**; write as a transferable general lesson.
- Properties: on write it is `source=human / status=live / trust floor`, appended to the audit ledger (actor=human), ledger verifiable.
- Note: by default it produces a **local-scope** experience; for cross-domain sharing, a human must add a cross-domain marker in the library and re-verify ledger integrity.

### ⑩ memory_ledger (ledger · query)
- Purpose: query the audit ledger to see which operations happened on which memory, by whom, when, and why.
- Key params: filter by objectType (experience/fact/diary/library/concern), objectId, op; page with limit / seqFrom / seqTo.
- Uses: inspect a memory's full history, trace drift, make rollback decisions.

### ⑪ memory_consolidate (consolidate · merge)
- Purpose: merge multiple sets of closely related experiences that re-express the same underlying lesson into one more refined experience.
- Timing: `memory_recall` gave `consolidationDue`, or you notice several experiences repeating the same lesson.
- Key params: `merges[]`, each merge group with family/kind/gist/situation/path/reasoning/limits/sourceIds(≥2)/note; `note` summarizes this run.
- Principle: **distill commonalities, drop session specifics** — not a simple concatenation; the sources are archived (leave recall but recoverable); the merged product **inherits the original trust**; **never hard-deleted**.

---

## 3. Memory structure (tables / front-end rendering / relationships)

### Data structure overview (11 tables)
| Table | What it records |
|---|---|
| `memory_meta` | key-value metadata (e.g. schema version) for migrations and version control |
| `experiences` | an experience's **family + revision**: reusable lesson(gist), situation, path, reasoning, limits, status, trust counters, scope, cross-domain flag, approver, plus **evidence (basis), source, parent_revision** |
| `use_reports` | each **use report**: which experience's which revision, success/failure, attribution (experience/environment/unrelated/unknown), whether counted, evidence, idempotency key |
| `ledger` | **append-only audit ledger**: who, when, on which object, what op, why, plus the hash chain |
| `diary` | important **interaction diary** (event layer, never auto-deleted): kind/content/session/extracted |
| `facts` | **profile facts**: stable knowledge about the user (category, key, value, source diaries, corroboration count, validity window, superseded by, locked/conflict-pending) |
| `extractions` | each **extraction run**: trigger, summary, produced fact ids, diary count consumed |
| `recall_events` | each **recall telemetry**: the situation, which experiences were injected, whether none, scope |
| `concerns` | **concerns** (open items remembered for the user): title, background, kind, status, source diaries, scope, tree parent/child |
| `consolidations` | each **consolidation log**: which experiences were merged into which, note |
| `skill_artifacts` | **experience→skill** products: source experience, form(script/knowledge/checklist/prompt), draft/published path, version, use/optimize counts, last feedback |

### Relationships between data
- **Experience revision is a chain**: `experiences` is keyed by "family + revision", `parent_revision` points to the previous revision, forming a revision line; the "live revision" = latest non-deleted revision of the family. Revision, merging, and challenge all show up on this chain.
- **Use reports feed back into the experience**: `use_reports`' "experience id + revision" points to a specific revision; these reports are aggregated into the experience's **trust counters and success/failure ratio**, which is exactly how an experience is "earned" and promoted.
- **The ledger links everything**: `ledger` uses "object type + object id" to point to any table (experience/diary/fact/skill…), and the hash chain (each record carrying the previous fingerprint) makes it immutable; so any record can be traced "what came from where, what changed, who changed it, why".
- **Evidence basis & traceability**: every experience carries an `evidence` pointer (trace/session/note, rejected without one), plus `source` (who created it), `parent_revision` (revision line to look back at its predecessor), and `ledger` (full audit + hash chain) — four layers of traceability; while facts(`facts`) and concerns(`concerns`) additionally anchor back to their source diaries via `sourceDiaryIds`.
- **Diary is the upstream raw material**: `facts` and `concerns` both reference `diary` through "source diary id arrays" (many-to-many), showing "from which diary entries this profile/concern was distilled" and allowing reverse tracing.
- **A profile has its own lifecycle**: `facts` uses "validity start/end timestamps" to define when it holds and when it expires; `superseded_by` points to the newer profile, forming a **profile supersession chain**; `conflict_pending` marks a conflict awaiting human adjudication; `locked` means human-confirmed.
- **Concerns form a tree**: `concerns.parent_id` self-references to form parent/child structure, one big item may carry several children; status (ongoing/concluded/recurring/paused) updates as the user progresses.
- **Merge is "summarize, not delete"**: `consolidations.merged_ids` (the merged experience ids) → `produced_id` (the newly produced experience); the source experiences are archived (leave recall but recoverable) and **never physically deleted**.
- **Skill artifacts hang on the source experience**: `skill_artifacts.parent_experience_id` points to the experience family it was converted from; one experience can map to one skill panel.
- **Recall has telemetry**: `recall_events` records "who was recalled this time, who was injected, whether none", enabling later drill-down into why a recall yielded nothing / what was injected.

### How the front-end renders it
The front-end (memory management card / workbench) is essentially rendering these tables into readable, operable panels:
- **Experience library panel**: grouped by family, showing the revision line; each item is color-coded by status (candidate/live/challenged/superseded/archived/cold palace); shows trust decimal, success/failure counters, scope, cross-domain flag, approver; expanded shows gist / situation / path / reasoning / limits / evidence / failure or challenge reason.
- **Usage statistics**: aggregated from `use_reports`, showing how often an experience was **used successfully/failed and what the failure was due to** (environment/unrelated/experience-itself/unknown), so you can see at a glance "is this one reliable, or does it need revision".
- **Audit timeline**: filter `ledger` by an object to show who, when, what, and why — for drift tracing and rollback decisions.
- **Profile snapshot**: `facts` grouped by category, showing source diaries, corroboration count, validity range, conflict-pending, supersession chain; crucially, it can **inject the profile snapshot** (stable model of the user) to the agent so the agent understands the user better.
- **Diary feed**: `diary` list + extracted flag + **extraction cadence countdown** (how many entries remain, how long since last), directly corresponding to "extraction timing".
- **Concerns**: `concerns` rendered as a tree + status labels (ongoing/concluded/recurring/paused) + source diaries, forming "the open items/agenda the agent remembers for the user".
- **Skill panel**: `skill_artifacts` shows draft/pending-review/published status, use & optimize counts, last feedback, corresponding to "experience→skill" conversion.
- **Extraction records**: `extractions` list shows each trigger, summary, produced fact count, diary count consumed — answering "extraction timing" and "cadence".
