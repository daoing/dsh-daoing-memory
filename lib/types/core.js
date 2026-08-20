/**
 * Memory core: the 生·用·修·记 mechanisms over the durable store. Pure and
 * ctx-free. Implements 005's P0/P1 semantics:
 *
 * - 生 refine: complexity gate + information-gain gate + mandatory evidence
 *   pointers; positive and negative candidates symmetric.
 * - 用 recall: recall → adjudication (limits vs situation conflicts,
 *   direct/reference/clue/not-applicable) → injection budget → explicit
 *   negative channel.
 * - 用·验 report: Beta posterior (alpha+1)/(alpha+beta+2) with recency
 *   weighting; four-way attribution with objective-evidence priority and
 *   no-count on insufficient signal; idempotent reports.
 * - 修 revise: challenged quarantine (immediately out of recall), draft
 *   proposal, adoption only after one successful use or shadow replay,
 *   superseded read-only index with rollback.
 * - 记 diary/facts: append-only diary, cadence-driven extraction with source
 *   pointers, bi-temporal facts with conflict arbitration and human gates.
 * - Ledger: append-only hash-chained event sourcing for every mutation,
 *   including every human operation.
 *
 * @module dsh-daoing-memory/core
 */
import { randomUUID } from 'node:crypto';
import { blockHash, estimateTokens, tokenize } from "./store.js";
/** The mechanism defaults (005 mapping documented in the README). */
export const DEFAULT_CORE_CONFIG = {
    diaryExtractEvery: 8,
    diaryExtractIntervalHours: 12,
    recallTopK: 6,
    injectionBudgetTokens: 1200,
    challengeConsecutiveFails: 2,
    challengeWindow: 6,
    challengeWindowFailRate: 0.6,
    familyLiveCap: 12,
    complexityTokenGate: 4000,
    complexityStepGate: 6,
    duplicateOverlapGate: 0.85,
    recallFloorScore: 0.1,
    shadowPassRate: 0.8,
    humanFloorAlpha: 5,
    humanFloorBeta: 2,
    pinnedTrustFloor: 0.67,
    candidateTrialTopK: 3,
    candidateTrialFloorScore: 0.18,
    consolidateEveryNew: 6,
    consolidateIntervalHours: 24,
};
/** Objective-evidence markers overriding a claimed experience-attributed failure. */
const ENVIRONMENT_EVIDENCE_PATTERN = /network|timeout|timed out|EPERM|EACCES|ECONNREFUSED|ENOTFOUND|429|503|quota|rate.?limit|unauthorized|dns|proxy|网络|超时|断网|权限|配额|限流|服务不可用|服务繁忙/i;
/**
 * Source-authority priors for the ingest channel (006 §1.3): a vetted skill or
 * document starts a candidate with more trust than an unreviewed note. The prior
 * only affects trust once the candidate is verified — candidates never recall.
 */
const INGEST_SOURCE_PRIOR = {
    skill: { alpha: 5, beta: 2 },
    document: { alpha: 4, beta: 2 },
    book: { alpha: 4, beta: 2 },
    conversation: { alpha: 2, beta: 2 },
    note: { alpha: 1, beta: 2 },
    other: { alpha: 1, beta: 2 },
};
/** Cosine-ish overlap of two token sets (for intra-batch dedup, 007). */
function tokenOverlap(a, b) {
    if (a.size === 0 || b.size === 0)
        return 0;
    let hits = 0;
    for (const t of a)
        if (b.has(t))
            hits += 1;
    return hits / Math.sqrt(a.size * b.size);
}
/** The memory core: stateless over the injected store. */
export class MemoryCore {
    store;
    config;
    /** @param store - the durable SQLite store. */
    /** @param config - resolved mechanism parameters. */
    constructor(store, config) {
        this.store = store;
        this.config = config;
    }
    // ── ledger helper ─────────────────────────────────────────────────────────
    ledger(op, objectType, objectId, actor, payload, reason) {
        this.store.appendLedger({
            ts: Date.now(),
            op,
            objectType,
            objectId,
            actor,
            payload: JSON.stringify(payload),
            prevHash: this.store.ledgerHead(),
            ...(reason === undefined ? {} : { reason }),
        });
    }
    // ── 生: refine ────────────────────────────────────────────────────────────
    /** 生: refine one completed trajectory into a candidate (dual gate). */
    refine(request, actor) {
        const evidenceOk = (request.evidence.traceRef ?? '').trim() !== ''
            || (request.evidence.sessionRef ?? '').trim() !== ''
            || (request.evidence.note ?? '').trim() !== '';
        if (!evidenceOk) {
            return { accepted: false, reason: 'rejected-evidence: every assertion needs an episodic evidence pointer (traceRef/sessionRef/note)' };
        }
        if (request.kind === 'negative' && (request.failureReason ?? '').trim() === '') {
            return { accepted: false, reason: 'rejected-schema: negative experiences must carry the confirmed failureReason' };
        }
        const c = request.complexity;
        const complex = request.humanMarked === true
            || c.hadFailure === true
            || (c.tokens ?? 0) >= this.config.complexityTokenGate
            || (c.steps ?? 0) >= this.config.complexityStepGate;
        if (!complex) {
            return { accepted: false, reason: `rejected-complexity: trajectory below both gates (tokens < ${String(this.config.complexityTokenGate)}, steps < ${String(this.config.complexityStepGate)}, no failure, not human-marked)` };
        }
        // Information-gain gate (007 flow-log fix): match on the lesson identity
        // (gist + situation) across the whole library; a near-duplicate corroborates
        // instead of inflating the library into a running log.
        const dedupTokens = new Set(tokenize([request.gist, ...request.situation].join(' ')));
        const near = this.store.findNearDuplicate(dedupTokens, ['candidate', 'live', 'challenged', 'archived', 'cold']);
        if (near !== undefined && near.score >= this.config.duplicateOverlapGate) {
            this.ledger('corroborate', 'experience', near.snapshot.id, actor, {
                family: request.family,
                gist: request.gist,
                score: near.score,
            });
            return { accepted: false, reason: 'rejected-information-gain: near-duplicate of an existing experience; corroborated it instead', corroboratedId: near.snapshot.id };
        }
        const now = Date.now();
        const snapshot = {
            id: randomUUID(),
            revision: 1,
            kind: request.kind,
            source: 'agent',
            family: request.family,
            gist: request.gist,
            situation: [...request.situation],
            path: [...request.path],
            reasoning: request.reasoning,
            limits: [...request.limits],
            status: 'candidate',
            alpha: 0,
            beta: 0,
            samples: 0,
            trust: 0.5,
            weightedTrust: 0.5,
            pinned: false,
            tokensSaved: 0,
            tokensSpent: (request.complexity.tokens ?? 0) / 10,
            context: request.context ?? '',
            verifiedCount: 0,
            rejectCount: 0,
            globalFlag: false,
            evidence: request.evidence,
            createdAt: now,
            updatedAt: now,
        };
        if (request.failureReason !== undefined)
            snapshot.failureReason = request.failureReason;
        this.store.upsertExperience(snapshot);
        this.ledger('refine', 'experience', snapshot.id, actor, {
            kind: snapshot.kind,
            family: snapshot.family,
            revision: 1,
        });
        return { accepted: true, experience: snapshot };
    }
    // ── 摄取归一: ingest (006 §1) ──────────────────────────────────────────────
    /**
     * 摄取归一: source-agnostic intake. Every extracted draft becomes an earned
     * candidate carrying provenance (sourceType + sourceRef), the source-authority
     * prior, and the declared context scope. Candidates never recall until verified.
     */
    ingest(request, actor) {
        if ((request.sourceRef ?? '').trim() === '') {
            throw new Error('memory: ingest requires a non-empty sourceRef provenance');
        }
        const prior = INGEST_SOURCE_PRIOR[request.sourceType] ?? INGEST_SOURCE_PRIOR.other;
        const context = request.context ?? '';
        const accepted = [];
        const rejected = [];
        const acceptedDedup = [];
        for (const item of request.experiences) {
            if (item.kind === 'negative' && (item.failureReason ?? '').trim() === '') {
                rejected.push({ gist: item.gist, reason: 'rejected-schema: negative experiences must carry the confirmed failureReason' });
                continue;
            }
            // Information-gain gate (007 flow-log fix): dedup on lesson identity
            // (gist + situation), first across the whole library, then against items
            // already accepted in this same batch. A near-duplicate corroborates
            // instead of inflating the library into a running log.
            const dedupTokens = new Set(tokenize([item.gist, ...item.situation].join(' ')));
            const cross = this.store.findNearDuplicate(dedupTokens, ['candidate', 'live', 'challenged', 'archived', 'cold']);
            if (cross !== undefined && cross.score >= this.config.duplicateOverlapGate) {
                this.ledger('corroborate', 'experience', cross.snapshot.id, actor, {
                    family: item.family, gist: item.gist, score: cross.score, via: 'ingest',
                });
                rejected.push({ gist: item.gist, reason: 'rejected-information-gain: near-duplicate of an existing experience; corroborated it instead' });
                continue;
            }
            if (acceptedDedup.some(prev => tokenOverlap(dedupTokens, prev) >= this.config.duplicateOverlapGate)) {
                rejected.push({ gist: item.gist, reason: 'rejected-information-gain: near-duplicate of another item in this same ingest batch' });
                continue;
            }
            const now = Date.now();
            const snapshot = {
                id: randomUUID(),
                revision: 1,
                kind: item.kind,
                source: 'agent',
                family: item.family,
                gist: item.gist,
                situation: [...item.situation],
                path: [...item.path],
                reasoning: item.reasoning,
                limits: [...item.limits],
                status: 'candidate',
                alpha: prior.alpha,
                beta: prior.beta,
                samples: prior.alpha + prior.beta,
                trust: (prior.alpha + 1) / (prior.alpha + prior.beta + 2),
                weightedTrust: (prior.alpha + 1) / (prior.alpha + prior.beta + 2),
                pinned: false,
                tokensSaved: 0,
                tokensSpent: 0,
                context,
                verifiedCount: 0,
                rejectCount: 0,
                globalFlag: false,
                evidence: { note: `${request.sourceType}:${request.sourceRef}` },
                createdAt: now,
                updatedAt: now,
            };
            if (item.failureReason !== undefined)
                snapshot.failureReason = item.failureReason;
            this.store.upsertExperience(snapshot);
            this.ledger('ingest', 'experience', snapshot.id, actor, {
                kind: snapshot.kind,
                family: snapshot.family,
                sourceType: request.sourceType,
                sourceRef: request.sourceRef,
                ...(context === '' ? {} : { context }),
                ...(request.note === undefined ? {} : { note: request.note }),
            });
            accepted.push(snapshot);
            acceptedDedup.push(dedupTokens);
        }
        return { accepted, rejected, sourcePrior: prior };
    }
    // ── 用: recall + adjudication ─────────────────────────────────────────────
    /** 用: recall → scope → adjudicate → budget → inject, plus the candidate probe channel. */
    recall(request, actor) {
        void actor;
        const topK = request.topK ?? this.config.recallTopK;
        const budget = request.budgetTokens ?? this.config.injectionBudgetTokens;
        const context = request.context ?? '';
        const queryTokens = new Set(tokenize(request.situation));
        // Candidate probe channel (006 §3.1): matching unverified candidates offered
        // for a one-shot trial, never injected as trusted knowledge.
        let candidateTrials = [];
        if (request.includeTrials !== false && queryTokens.size > 0) {
            const matches = this.store.recallCandidates(queryTokens, this.config.candidateTrialTopK * 2, {
                statuses: ['candidate'],
                context,
            });
            candidateTrials = matches
                .filter(m => m.score >= this.config.candidateTrialFloorScore)
                .slice(0, this.config.candidateTrialTopK)
                .map(m => ({ experience: m.snapshot, score: m.score }));
        }
        // Trusted channel: live (or archived when deep) revisions, context-scoped.
        const candidates = queryTokens.size === 0
            ? []
            : this.store.recallCandidates(queryTokens, topK * 3, {
                statuses: request.deep === true ? ['live', 'archived'] : ['live'],
                context,
            });
        const adjudicated = [];
        for (const { snapshot, score } of candidates) {
            if (score < this.config.recallFloorScore)
                continue;
            const conflicts = [];
            for (const limit of snapshot.limits) {
                const limitTokens = tokenize(limit);
                if (limitTokens.length === 0)
                    continue;
                const hits = limitTokens.filter(token => queryTokens.has(token)).length;
                if (hits / limitTokens.length >= 0.5)
                    conflicts.push(limit);
            }
            const verdict = conflicts.length > 0 ? 'reference' : score >= 0.45 ? 'direct' : score >= 0.22 ? 'reference' : 'clue';
            adjudicated.push({ experience: snapshot, score, verdict, conflicts });
        }
        if (adjudicated.length === 0) {
            const none = {
                items: [],
                none: true,
                reason: 'no relevant experience in the library for this situation',
                omitted: 0,
                estimatedTokens: 0,
                candidateTrials,
                consolidationDue: this.consolidationDue().due,
            };
            this.store.insertRecallEvent({ id: randomUUID(), ts: Date.now(), situation: request.situation, injectedIds: [], none: true, context });
            return none;
        }
        // Injection budget: best expected value first (relevance x trust).
        const ranked = [...adjudicated].sort((a, b) => {
            const value = (item) => {
                const trust = item.experience.pinned
                    ? Math.max(item.experience.weightedTrust, this.config.pinnedTrustFloor)
                    : item.experience.weightedTrust;
                return item.score * trust;
            };
            return value(b) - value(a);
        });
        const items = [];
        let usedTokens = 0;
        let omitted = 0;
        for (const item of ranked) {
            const cost = estimateTokens(JSON.stringify(item.experience));
            if (usedTokens + cost > budget && items.length > 0) {
                omitted += 1;
                continue;
            }
            items.push(item);
            usedTokens += cost;
        }
        this.store.insertRecallEvent({
            id: randomUUID(),
            ts: Date.now(),
            situation: request.situation,
            injectedIds: items.map(item => `${item.experience.id}@${String(item.experience.revision)}`),
            none: false,
            context,
        });
        return { items, none: false, omitted, estimatedTokens: usedTokens, candidateTrials, consolidationDue: this.consolidationDue().due };
    }
    // ── 用·验: report with attribution ────────────────────────────────────────
    /** 用·验: one use outcome → Beta update, attribution, quarantine, gates. */
    report(request, actor) {
        const target = request.revision === undefined
            ? this.store.getActiveRevision(request.id)
            : this.store.getExperience(request.id, request.revision);
        if (target === undefined)
            throw new Error(`memory: experience not found: ${request.id}`);
        const base = {
            snapshot: target,
            counted: 'none',
            attributionApplied: 'unknown',
            challenged: false,
            promoted: false,
            adopted: false,
        };
        // Attribution: objective evidence takes priority over the claim;
        // insufficient signal never counts.
        let attribution;
        let overrideNote;
        if (request.outcome === 'success') {
            attribution = 'experience';
        }
        else {
            const claimed = request.attribution ?? 'unknown';
            const evidenceNote = request.evidence?.note ?? '';
            if (evidenceNote !== '' && ENVIRONMENT_EVIDENCE_PATTERN.test(evidenceNote)) {
                attribution = 'environment';
                if (claimed !== 'environment')
                    overrideNote = 'objective evidence indicates an environment failure; claim overridden';
            }
            else {
                attribution = claimed;
            }
            if (attribution === 'experience' && evidenceNote.trim() === '') {
                // For an unverified candidate the trial failure itself is the signal —
                // do not demand extra evidence to record a trial-fail and cold it (006 §3.2).
                if (target.status !== 'candidate') {
                    attribution = 'unknown';
                    overrideNote = 'experience-attributed failure without evidence note: insufficient signal, not counted';
                }
            }
        }
        const counted = request.outcome === 'success'
            ? 'alpha'
            : attribution === 'experience' ? 'beta' : 'none';
        // Idempotency: a repeated (family, revision, dedupeKey) never counts twice.
        const inserted = this.store.insertReport({
            id: randomUUID(),
            experienceId: target.id,
            revision: target.revision,
            outcome: request.outcome,
            attribution,
            counted,
            evidence: request.evidence,
            dedupeKey: request.dedupeKey,
            ts: Date.now(),
        });
        if (!inserted) {
            if (overrideNote !== undefined)
                base.overrideNote = overrideNote;
            return base;
        }
        let next = { ...target, updatedAt: Date.now() };
        if (counted === 'alpha') {
            next = { ...next, alpha: next.alpha + 1, verifiedCount: next.verifiedCount + 1, lastVerifiedAt: Date.now() };
        }
        else if (counted === 'beta') {
            const isCandidateTrial = next.status === 'candidate';
            next = {
                ...next,
                beta: next.beta + 1,
                rejectCount: isCandidateTrial ? next.rejectCount + 1 : next.rejectCount,
                lastVerifiedAt: Date.now(),
            };
        }
        next = {
            ...next,
            tokensSaved: next.tokensSaved + (request.tokensSaved ?? 0),
            tokensSpent: next.tokensSpent + (request.tokensUsed ?? 0),
            samples: next.alpha + next.beta,
            trust: (next.alpha + 1) / (next.alpha + next.beta + 2),
        };
        next = { ...next, weightedTrust: this.store.weightedTrust(next.id, next.revision, Date.now()) };
        // Verification gates.
        if (request.outcome === 'success' && attribution === 'experience') {
            if (next.status === 'candidate' && next.parentRevision !== undefined) {
                // Revised draft passed its one successful use: adopt it.
                const adopted = { ...next, status: 'live' };
                delete adopted.challengeReason;
                next = adopted;
                this.store.upsertExperience(next);
                this.supersedeParent(next, actor);
                this.ledger('adopt', 'experience', next.id, actor, { revision: next.revision, via: 'use' });
                this.enforceFamilyCap(next.family, actor);
                base.adopted = true;
                base.promoted = true;
            }
            else if (next.status === 'candidate') {
                next = { ...next, status: 'live' };
                this.ledger('promote', 'experience', next.id, actor, { revision: next.revision, via: 'use' });
                base.promoted = true;
            }
            else if (next.status === 'archived') {
                // Found via deep recall and used successfully once: back to live.
                next = { ...next, status: 'live' };
                this.ledger('restore', 'experience', next.id, actor, { revision: next.revision });
                base.promoted = true;
            }
        }
        // Cold palace (006 §3.2): a candidate that fails its trial is quarantined to
        // `cold`; it stops being probed and only a human can re-release or delete it.
        if (next.status === 'candidate' && counted === 'beta') {
            const reason = 'candidate trial failed; human re-release required';
            next = { ...next, status: 'cold', challengeReason: reason };
            this.ledger('trial-fail', 'experience', next.id, actor, { revision: next.revision }, reason);
            base.cooled = true;
        }
        // Quarantine: windowed failure pressure challenges a live experience.
        if (next.status === 'live' && counted === 'beta' && this.shouldChallenge(next)) {
            const reason = 'posterior pressure: repeated experience-attributed failures';
            next = { ...next, status: 'challenged', challengeReason: reason };
            this.ledger('challenge', 'experience', next.id, actor, { revision: next.revision }, reason);
            base.challenged = true;
        }
        this.store.upsertExperience(next);
        this.ledger('use', 'experience', next.id, actor, {
            revision: next.revision,
            outcome: request.outcome,
            attribution,
            counted,
            ...(request.dedupeKey === undefined ? {} : { dedupeKey: request.dedupeKey }),
        });
        base.snapshot = next;
        base.counted = counted;
        base.attributionApplied = attribution;
        if (overrideNote !== undefined)
            base.overrideNote = overrideNote;
        return base;
    }
    /** Windowed challenge rule: consecutive fails or window failure rate. */
    shouldChallenge(exp) {
        const reports = this.store.reportsFor(exp.id, exp.revision, this.config.challengeWindow);
        let consecutive = 0;
        for (const report of reports) {
            if (report.outcome === 'fail' && report.attribution === 'experience')
                consecutive += 1;
            else
                break;
        }
        if (consecutive >= this.config.challengeConsecutiveFails)
            return true;
        if (reports.length >= 3) {
            const fails = reports.filter(r => r.outcome === 'fail' && r.attribution === 'experience').length;
            if (fails / reports.length >= this.config.challengeWindowFailRate)
                return true;
        }
        return false;
    }
    /** Close the parent revision as superseded after a draft adoption. */
    supersedeParent(draft, actor) {
        if (draft.parentRevision === undefined)
            return;
        const parent = this.store.getExperience(draft.id, draft.parentRevision);
        if (parent === undefined)
            return;
        this.store.upsertExperience({ ...parent, status: 'superseded', updatedAt: Date.now() });
        this.ledger('supersede', 'experience', parent.id, actor, {
            revision: parent.revision,
            by: draft.revision,
        });
        void this.enforceFamilyCap(draft.family, actor);
    }
    /** Capacity budget: archive the lowest economic value when a family overflows. */
    enforceFamilyCap(familyTag, actor) {
        const overflow = this.store.countFamilyActive(familyTag) - this.config.familyLiveCap;
        if (overflow <= 0)
            return;
        const live = this.store.listExperiences({ status: 'live', family: familyTag })
            .filter(exp => !exp.pinned)
            .sort((a, b) => (a.tokensSaved - a.tokensSpent) - (b.tokensSaved - b.tokensSpent));
        for (const exp of live.slice(0, overflow)) {
            this.store.upsertExperience({ ...exp, status: 'archived', updatedAt: Date.now() });
            this.ledger('archive', 'experience', exp.id, actor, {
                revision: exp.revision,
                reason: 'family capacity budget',
            });
        }
    }
    // ── 修: revise / shadow / rollback ────────────────────────────────────────
    /** 修: propose a revised draft for a challenged experience. */
    revise(request, actor) {
        const current = this.store.getActiveRevision(request.id);
        if (current === undefined)
            throw new Error(`memory: experience not found: ${request.id}`);
        if (current.status !== 'challenged') {
            throw new Error(`memory: only challenged experiences accept revisions (status=${current.status})`);
        }
        const now = Date.now();
        const draft = {
            ...current,
            revision: current.revision + 1,
            status: 'candidate',
            gist: request.gist ?? current.gist,
            situation: request.situation ?? current.situation,
            path: request.path ?? current.path,
            reasoning: request.reasoning ?? current.reasoning,
            limits: request.limits ?? current.limits,
            alpha: 0,
            beta: 0,
            samples: 0,
            trust: 0.5,
            weightedTrust: 0.5,
            verifiedCount: 0,
            rejectCount: 0,
            parentRevision: current.revision,
            createdAt: now,
            updatedAt: now,
        };
        // A fresh draft carries no verification history and no quarantine reason.
        delete draft.lastVerifiedAt;
        delete draft.challengeReason;
        this.store.upsertExperience(draft);
        this.ledger('propose', 'experience', draft.id, actor, { revision: draft.revision }, request.reason);
        return draft;
    }
    /** V1 controlled re-enactment: replay historical samples against a draft. */
    verifyShadow(request, actor) {
        const draft = this.store.getExperience(request.id, request.revision);
        if (draft === undefined)
            throw new Error(`memory: draft not found: ${request.id} v${String(request.revision)}`);
        if (draft.status !== 'candidate') {
            throw new Error(`memory: shadow replay verifies candidate drafts (status=${draft.status})`);
        }
        if (request.samples.length === 0)
            return { passed: false, agreement: 0, reason: 'no samples supplied' };
        const draftTokens = new Set(tokenize([draft.gist, ...draft.situation, ...draft.limits].join(' ')));
        let matched = 0;
        for (const sample of request.samples) {
            const sampleTokens = new Set(tokenize(sample.situation));
            let hits = 0;
            for (const token of sampleTokens)
                if (draftTokens.has(token))
                    hits += 1;
            const relevance = sampleTokens.size === 0 ? 0 : hits / sampleTokens.size;
            const predictsSuccess = relevance >= this.config.recallFloorScore * 2;
            if (predictsSuccess === (sample.expected === 'success'))
                matched += 1;
        }
        const agreement = matched / request.samples.length;
        if (agreement < this.config.shadowPassRate) {
            this.ledger('shadow-fail', 'experience', draft.id, actor, { revision: draft.revision, agreement });
            return { passed: false, agreement, reason: `agreement ${agreement.toFixed(2)} below pass rate ${String(this.config.shadowPassRate)}` };
        }
        const adopted = { ...draft, status: 'live', lastVerifiedAt: Date.now(), updatedAt: Date.now() };
        this.store.upsertExperience(adopted);
        this.supersedeParent(adopted, actor);
        this.ledger('shadow-pass', 'experience', adopted.id, actor, { revision: adopted.revision, agreement });
        return { passed: true, agreement, snapshot: adopted };
    }
    /** Roll the family back to a superseded revision. */
    rollback(request, actor) {
        const target = this.store.getExperience(request.id, request.toRevision);
        if (target === undefined)
            throw new Error(`memory: revision not found: ${request.id} v${String(request.toRevision)}`);
        if (target.status !== 'superseded') {
            throw new Error(`memory: only superseded revisions can be restored (status=${target.status})`);
        }
        const current = this.store.getActiveRevision(request.id);
        if (current !== undefined) {
            this.store.upsertExperience({ ...current, status: 'superseded', updatedAt: Date.now() });
            this.ledger('supersede', 'experience', current.id, actor, {
                revision: current.revision,
                by: request.toRevision,
            });
        }
        const restored = { ...target, status: 'live', updatedAt: Date.now() };
        this.store.upsertExperience(restored);
        this.ledger('rollback', 'experience', restored.id, actor, { revision: restored.revision }, request.reason);
        return restored;
    }
    // ── queries ───────────────────────────────────────────────────────────────
    /** One experience revision. */
    get(id, revision) {
        return revision === undefined ? this.store.getActiveRevision(id) : this.store.getExperience(id, revision);
    }
    /** Experience revisions by filter. */
    list(filter) {
        return this.store.listExperiences(filter);
    }
    /** Every revision of one family (the rollback picker's data). */
    family(id) {
        return this.store.getFamily(id);
    }
    // ── 记: diary + extraction ────────────────────────────────────────────────
    /** 记: append one diary entry; signals when the extraction cadence is due. */
    appendDiary(request, actor) {
        const entry = {
            id: randomUUID(),
            ts: Date.now(),
            kind: request.kind,
            content: request.content,
            tags: request.tags ?? [],
            extracted: false,
        };
        if (request.sessionRef !== undefined)
            entry.sessionRef = request.sessionRef;
        this.store.insertDiary(entry);
        this.ledger('diary', 'diary', entry.id, actor, { kind: entry.kind });
        const pending = this.store.unextractedDiary();
        const intervalOk = Date.now() - this.store.lastExtractionTs()
            >= this.config.diaryExtractIntervalHours * 60 * 60 * 1000;
        const extractionDue = pending.length >= this.config.diaryExtractEvery && intervalOk;
        if (!extractionDue)
            return { entry, extractionDue: false };
        return { entry, extractionDue: true, pendingDiary: pending };
    }
    /** 上升通道: apply extracted facts over the pending diary window. */
    extract(request, actor, trigger = 'manual') {
        const result = { applied: [], conflicts: [], rejected: [], appliedConcerns: 0 };
        const now = Date.now();
        const consumedDiary = new Set();
        for (const proposal of request.proposals) {
            const rejection = this.validateProposal(proposal);
            if (rejection !== undefined) {
                result.rejected.push({ proposal, reason: rejection });
                continue;
            }
            for (const id of proposal.sourceDiaryIds)
                consumedDiary.add(id);
            const current = this.store.currentFact(proposal.category, proposal.factKey);
            if (current !== undefined && current.value === proposal.value) {
                // Same fact stays ONE entry; the new diary pointers join as extra citations.
                const merged = [...new Set([...current.sourceDiaryIds, ...proposal.sourceDiaryIds])];
                const corroborated = { ...current, corroboration: current.corroboration + 1, sourceDiaryIds: merged };
                this.store.updateFact(corroborated);
                this.ledger('fact-corroborate', 'fact', corroborated.id, actor, {
                    category: proposal.category,
                    factKey: proposal.factKey,
                });
                result.applied.push(corroborated);
                continue;
            }
            if (current !== undefined && current.locked) {
                // A locked fact is never auto-superseded: park the conflict for a human.
                const conflict = {
                    id: randomUUID(),
                    category: proposal.category,
                    factKey: proposal.factKey,
                    value: proposal.value,
                    origin: 'extraction',
                    sourceDiaryIds: [...proposal.sourceDiaryIds],
                    corroboration: 1,
                    validFrom: now,
                    validTo: now,
                    recordedAt: now,
                    locked: false,
                    deleted: false,
                    conflictPending: true,
                };
                this.store.insertFact(conflict);
                this.ledger('fact-conflict', 'fact', conflict.id, actor, {
                    category: proposal.category,
                    factKey: proposal.factKey,
                    against: current.id,
                });
                result.conflicts.push(conflict);
                continue;
            }
            const version = {
                id: randomUUID(),
                category: proposal.category,
                factKey: proposal.factKey,
                value: proposal.value,
                origin: current === undefined ? 'extraction' : 'supersede',
                sourceDiaryIds: [...proposal.sourceDiaryIds],
                corroboration: 1,
                validFrom: now,
                recordedAt: now,
                locked: false,
                deleted: false,
                conflictPending: false,
            };
            if (current !== undefined) {
                this.store.updateFact({ ...current, validTo: now, supersededBy: version.id });
                this.ledger('fact-supersede', 'fact', current.id, actor, {
                    category: proposal.category,
                    factKey: proposal.factKey,
                    by: version.id,
                });
            }
            this.store.insertFact(version);
            this.ledger('fact-extract', 'fact', version.id, actor, {
                category: proposal.category,
                factKey: proposal.factKey,
            });
            result.applied.push(version);
        }
        // 关心事项 (007 §2.3): new top-level / discussion mention / lifecycle change.
        for (const cp of request.concerns ?? []) {
            for (const id of cp.sourceDiaryIds)
                consumedDiary.add(id);
            if (cp.action === 'new') {
                if ((cp.title ?? '').trim() === '')
                    continue;
                const top = {
                    id: randomUUID(),
                    title: (cp.title ?? '').trim(),
                    ...(cp.background === undefined || cp.background.trim() === '' ? {} : { background: cp.background.trim() }),
                    kind: cp.kind ?? 'other',
                    status: 'ongoing',
                    ts: now,
                    sourceDiaryIds: [...cp.sourceDiaryIds],
                    ...(cp.context === undefined ? {} : { context: cp.context }),
                    deleted: false,
                };
                this.store.insertConcern(top);
                this.ledger('concern-new', 'concern', top.id, actor, { kind: top.kind }, top.title);
                result.appliedConcerns += 1;
            }
            else if (cp.action === 'mention') {
                if (cp.concernId === undefined || (cp.title ?? '').trim() === '')
                    continue;
                const mention = {
                    id: randomUUID(),
                    parentId: cp.concernId,
                    title: (cp.title ?? '').trim(),
                    ts: now,
                    sourceDiaryIds: [...cp.sourceDiaryIds],
                    deleted: false,
                };
                this.store.insertConcern(mention);
                this.ledger('concern-mention', 'concern', cp.concernId, actor, {}, mention.title);
                result.appliedConcerns += 1;
            }
            else if (cp.action === 'status') {
                if (cp.concernId === undefined || cp.status === undefined)
                    continue;
                this.store.setConcernStatus(cp.concernId, cp.status);
                this.ledger('concern-status', 'concern', cp.concernId, actor, { status: cp.status });
                result.appliedConcerns += 1;
            }
        }
        if (consumedDiary.size > 0)
            this.store.markDiaryExtracted([...consumedDiary]);
        const producedIds = [...result.applied, ...result.conflicts].map(fact => fact.id);
        this.store.insertExtraction({
            id: randomUUID(),
            ts: now,
            trigger,
            summary: request.summary,
            producedFactIds: producedIds,
            diaryCount: consumedDiary.size,
        });
        this.ledger('extract', 'library', 'diary-window', actor, {
            proposals: request.proposals.length,
            applied: result.applied.length,
            conflicts: result.conflicts.length,
            rejected: result.rejected.length,
        }, request.summary);
        return result;
    }
    /** Validate one proposal's shape and source pointers. */
    validateProposal(proposal) {
        if (proposal.category.trim() === '' || proposal.factKey.trim() === '' || proposal.value.trim() === '') {
            return 'category, factKey and value are required';
        }
        if (proposal.sourceDiaryIds.length === 0)
            return 'sourceDiaryIds must point to at least one diary entry';
        for (const id of proposal.sourceDiaryIds) {
            const entry = this.store.getDiary(id);
            if (entry === undefined)
                return `unknown diary entry: ${id}`;
            if (entry.extracted)
                return `diary entry already extracted: ${id}`;
        }
        return undefined;
    }
    /** Diary entries for the workbench timeline. */
    listDiary(limit, offset, onlyUnextracted) {
        return this.store.listDiary(limit, offset, onlyUnextracted);
    }
    /** Several diary entries by id (008 Path A: fact→diary provenance). */
    getDiaryByIds(ids) {
        return this.store.getDiaryByIds(ids);
    }
    /** Fact versions for the workbench (008 §3: server-side pagination). */
    listFacts(category, includeHistory, limit, offset) {
        return this.store.listFacts(category === undefined ? { includeHistory } : { category, includeHistory }, limit, offset);
    }
    /** Count of facts matching the workbench filter (008 §3: pagination total). */
    listFactsCount(category, includeHistory) {
        return this.store.factFilteredCount(category === undefined ? { includeHistory } : { category, includeHistory });
    }
    /** 关心事项 (007 §2 / 010 §D): top-level concerns + loop, kind/status filter + pagination. */
    listConcerns(kind, status, limit, offset) {
        const filter = {};
        if (kind !== undefined)
            filter.kind = kind;
        if (status !== undefined)
            filter.status = status;
        return this.store.listConcernTrees(filter, limit, offset);
    }
    /** Count of top-level concerns matching the workbench filter (010 §D: pagination total). */
    listConcernsCount(kind, status) {
        const filter = {};
        if (kind !== undefined)
            filter.kind = kind;
        if (status !== undefined)
            filter.status = status;
        return this.store.listConcernsCount(filter);
    }
    /**
     * 010 §F: a compact runtime snapshot for the AI's context — the profile (the
     * AI's perception of the user) plus still-open concern memos it may remind
     * the user about. Empty string when there is nothing yet.
     */
    profileSnapshot() {
        const facts = this.store.listFacts({ includeHistory: false }, 60, 0);
        const openConcerns = this.store.listConcernTrees({ status: 'ongoing' }, 12, 0);
        if (facts.length === 0 && openConcerns.length === 0)
            return '';
        const lines = [];
        if (facts.length > 0) {
            lines.push('User profile (your perception of this user — collaborate accordingly):');
            for (const f of facts)
                lines.push(`- [${f.category}] ${f.factKey}: ${f.value}`);
        }
        if (openConcerns.length > 0) {
            lines.push('Open concern memos (the user\'s unclosed loops — remind when relevant, never fabricate closure):');
            for (const t of openConcerns)
                lines.push(`- (${t.concern.kind ?? 'other'}) ${t.concern.title}`);
        }
        return lines.join('\n');
    }
    /** Extraction runs, newest first (008 §3: server-side pagination). */
    extractionLog(limit, offset) {
        return this.store.listExtractions(limit, offset);
    }
    /** Total extraction runs (008 §3: pagination total). */
    extractionLogCount() {
        return this.store.extractionCount();
    }
    // ── periodic consolidation (008 §1, interval-based cadence) ───────────────
    /**
     * Whether a consolidation run is due. The period is measured as a DURATION
     * since the last consolidation (interval), not a fixed clock time: a run is
     * due once (a) enough NEW experiences have accumulated since the last run
     * AND (b) enough hours have elapsed since it.
     */
    consolidationDue() {
        const lastTs = this.store.lastConsolidationTs();
        const newSince = this.store.countExperiencesSince(lastTs);
        const hoursSince = lastTs === 0 ? Number.POSITIVE_INFINITY : (Date.now() - lastTs) / 3600e3;
        const enoughNew = newSince >= this.config.consolidateEveryNew;
        const intervalPassed = hoursSince >= this.config.consolidateIntervalHours;
        return { due: enoughNew && intervalPassed, lastTs, newSince, hoursSince };
    }
    /**
     * Apply a consolidation run: for each merge, create one consolidated
     * experience and archive the sources (they leave recall but stay recoverable
     * — consolidation never hard-deletes). Every step is ledgered.
     */
    consolidate(request, actor) {
        const now = Date.now();
        const result = { consolidated: 0, archived: 0, skipped: [] };
        for (const merge of request.merges) {
            const sources = merge.sourceIds
                .map(id => this.store.getActiveRevision(id))
                .filter((s) => s !== undefined);
            if (sources.length < 2) {
                result.skipped.push({ sourceIds: merge.sourceIds, reason: '至少需要 2 条仍有效的来源经验' });
                continue;
            }
            if (merge.gist.trim() === '' || merge.reasoning.trim() === '') {
                result.skipped.push({ sourceIds: merge.sourceIds, reason: '合并后的 gist/reasoning 不能为空' });
                continue;
            }
            // Preserve earned trust: carry forward the Beta posteriors and counters.
            const allLive = sources.every(s => s.status === 'live');
            const alpha = sources.reduce((sum, s) => sum + s.alpha, 0);
            const beta = sources.reduce((sum, s) => sum + s.beta, 0);
            const verifiedCount = sources.reduce((sum, s) => sum + (s.verifiedCount ?? 0), 0);
            const rejectCount = sources.reduce((sum, s) => sum + (s.rejectCount ?? 0), 0);
            const lastVerifiedAt = sources.reduce((max, s) => (s.lastVerifiedAt !== undefined && (max === undefined || s.lastVerifiedAt > max) ? s.lastVerifiedAt : max), undefined);
            const consolidated = {
                id: randomUUID(),
                revision: 1,
                kind: merge.kind,
                source: 'agent',
                family: merge.family,
                gist: merge.gist.trim(),
                situation: merge.situation,
                path: merge.path.map((action, index) => ({ action, order: index + 1 })),
                reasoning: merge.reasoning.trim(),
                limits: merge.limits,
                status: allLive ? 'live' : 'candidate',
                alpha,
                beta,
                samples: alpha + beta,
                trust: (alpha + 1) / (alpha + beta + 2),
                weightedTrust: (alpha + 1) / (alpha + beta + 2),
                ...(lastVerifiedAt === undefined ? {} : { lastVerifiedAt }),
                pinned: false,
                tokensSaved: 0,
                tokensSpent: 0,
                evidence: { note: `consolidated from ${String(sources.length)} experiences: ${sources.map(s => s.id.slice(0, 8)).join(',')}` },
                context: '',
                verifiedCount,
                rejectCount,
                globalFlag: false,
                createdAt: now,
                updatedAt: now,
            };
            this.store.upsertExperience(consolidated);
            this.store.archiveExperienceIds(merge.sourceIds, now);
            this.store.recordConsolidation({
                id: randomUUID(),
                ts: now,
                mergedIds: merge.sourceIds,
                producedId: consolidated.id,
                note: merge.note ?? request.note ?? '',
            });
            this.ledger('consolidate', 'experience', consolidated.id, actor, {
                mergedFrom: merge.sourceIds,
                gist: merge.gist.trim(),
                status: consolidated.status,
            });
            result.consolidated += 1;
            result.archived += sources.length;
        }
        return result;
    }
    // ── human operations (all ledgered) ───────────────────────────────────────
    /** Human pin/unpin: pinned cards keep the trust floor and escape budgets. */
    humanPin(request, actor) {
        const current = this.store.getActiveRevision(request.id);
        if (current === undefined)
            throw new Error(`memory: experience not found: ${request.id}`);
        const next = { ...current, pinned: request.pinned, updatedAt: Date.now() };
        this.store.upsertExperience(next);
        this.ledger(request.pinned ? 'pin' : 'unpin', 'experience', next.id, actor, { revision: next.revision }, request.reason);
        return next;
    }
    /** Human delete: tombstone the family; the ledger keeps the fingerprint. */
    humanDeleteExperience(request, actor) {
        const familyRows = this.store.getFamily(request.id);
        if (familyRows.length === 0)
            throw new Error(`memory: experience not found: ${request.id}`);
        const head = familyRows[familyRows.length - 1];
        this.store.deleteFamily(request.id);
        this.ledger('delete', 'experience', request.id, actor, {
            gist: head.gist,
            family: head.family,
            revisions: familyRows.length,
        }, request.reason);
    }
    /** Human edit: rewrite fields of the active revision in place. */
    humanEditExperience(request, actor) {
        const current = this.store.getActiveRevision(request.id);
        if (current === undefined)
            throw new Error(`memory: experience not found: ${request.id}`);
        const next = {
            ...current,
            gist: request.gist ?? current.gist,
            situation: request.situation ?? current.situation,
            path: request.path ?? current.path,
            reasoning: request.reasoning ?? current.reasoning,
            limits: request.limits ?? current.limits,
            family: request.family ?? current.family,
            context: request.context ?? current.context,
            globalFlag: request.globalFlag ?? current.globalFlag,
            updatedAt: Date.now(),
        };
        this.store.upsertExperience(next);
        this.ledger('edit', 'experience', next.id, actor, { revision: next.revision }, request.reason);
        return next;
    }
    /** Human injection: fixed format, source=human, trust floor, directly live. */
    humanAddExperience(request, actor) {
        const now = Date.now();
        const snapshot = {
            id: randomUUID(),
            revision: 1,
            kind: request.kind,
            source: 'human',
            family: request.family,
            gist: request.gist,
            situation: [...request.situation],
            path: [...request.path],
            reasoning: request.reasoning,
            limits: [...request.limits],
            status: 'live',
            alpha: this.config.humanFloorAlpha,
            beta: this.config.humanFloorBeta,
            samples: this.config.humanFloorAlpha + this.config.humanFloorBeta,
            trust: (this.config.humanFloorAlpha + 1) / (this.config.humanFloorAlpha + this.config.humanFloorBeta + 2),
            weightedTrust: (this.config.humanFloorAlpha + 1) / (this.config.humanFloorAlpha + this.config.humanFloorBeta + 2),
            lastVerifiedAt: now,
            pinned: false,
            tokensSaved: 0,
            tokensSpent: 0,
            context: request.context ?? '',
            verifiedCount: 0,
            rejectCount: 0,
            globalFlag: false,
            createdAt: now,
            updatedAt: now,
        };
        if (request.failureReason !== undefined)
            snapshot.failureReason = request.failureReason;
        this.store.upsertExperience(snapshot);
        this.ledger('add', 'experience', snapshot.id, actor, {
            kind: snapshot.kind,
            family: snapshot.family,
            trustFloor: snapshot.trust,
        }, request.reason);
        return snapshot;
    }
    /** Human authority (V2): promote a candidate straight to live. */
    humanPromote(id, reason, actor) {
        const current = this.store.getActiveRevision(id);
        if (current === undefined)
            throw new Error(`memory: experience not found: ${id}`);
        if (current.status !== 'candidate') {
            throw new Error(`memory: only candidates accept human promotion (status=${current.status})`);
        }
        const next = { ...current, status: 'live', lastVerifiedAt: Date.now(), updatedAt: Date.now() };
        this.store.upsertExperience(next);
        if (next.parentRevision !== undefined)
            this.supersedeParent(next, actor);
        this.ledger('human-promote', 'experience', next.id, actor, { revision: next.revision }, reason);
        return next;
    }
    /** Human re-release (006 §3.2): move a cold-palace revision back to candidate. */
    humanReleaseCold(request, actor) {
        // Cold is a terminal status, so it is not the "active" revision; scan the family.
        const cold = [...this.store.getFamily(request.id)].reverse().find(rev => rev.status === 'cold');
        if (cold === undefined) {
            throw new Error(`memory: no cold revision to re-release for ${request.id}`);
        }
        const next = { ...cold, status: 'candidate', updatedAt: Date.now() };
        delete next.challengeReason;
        this.store.upsertExperience(next);
        this.ledger('release-cold', 'experience', next.id, actor, { revision: next.revision }, request.reason);
        return next;
    }
    /** Human acknowledgement of a pending diary entry: reviewed, no fact extracted. */
    humanAckDiary(request, actor) {
        const entry = this.store.getDiary(request.diaryId);
        if (entry === undefined)
            throw new Error(`memory: unknown diary entry: ${request.diaryId}`);
        if (entry.extracted)
            throw new Error(`memory: diary entry already extracted: ${request.diaryId}`);
        this.store.markDiaryExtracted([request.diaryId]);
        this.ledger('diary-ack', 'diary', request.diaryId, actor, {}, request.reason);
        return { ...entry, extracted: true };
    }
    /** Human lifecycle change of a top-level concern (007 §2.4, audited). */
    humanSetConcernStatus(request, actor) {
        this.store.setConcernStatus(request.id, request.status);
        this.ledger('concern-status', 'concern', request.id, actor, { status: request.status, via: 'human' }, request.reason);
    }
    /** Human delete of a concern subtree (007 §2.4, tombstone, audited). */
    humanDeleteConcern(request, actor) {
        this.store.deleteConcernSubtree(request.id);
        this.ledger('concern-delete', 'concern', request.id, actor, { via: 'human' }, request.reason);
    }
    /** Human fact add: origin=human, locked by default. */
    humanAddFact(request, actor) {
        const now = Date.now();
        const current = this.store.currentFact(request.category, request.factKey);
        const version = {
            id: randomUUID(),
            category: request.category,
            factKey: request.factKey,
            value: request.value,
            origin: 'human',
            sourceDiaryIds: [],
            corroboration: 1,
            validFrom: now,
            recordedAt: now,
            locked: request.locked ?? true,
            deleted: false,
            conflictPending: false,
        };
        if (current !== undefined) {
            this.store.updateFact({ ...current, validTo: now, supersededBy: version.id });
            this.ledger('fact-supersede', 'fact', current.id, actor, { by: version.id }, request.reason);
        }
        this.store.insertFact(version);
        this.ledger('fact-add', 'fact', version.id, actor, {
            category: request.category,
            factKey: request.factKey,
        }, request.reason);
        return version;
    }
    /** Human fact edit: supersedes the current version with a locked one. */
    humanEditFact(request, actor) {
        const current = this.store.getFact(request.factId);
        if (current === undefined)
            throw new Error(`memory: fact not found: ${request.factId}`);
        if (current.validTo !== undefined || current.deleted)
            throw new Error('memory: only the current fact version can be edited');
        const now = Date.now();
        const version = {
            ...current,
            id: randomUUID(),
            value: request.value,
            origin: 'human',
            validFrom: now,
            recordedAt: now,
            locked: true,
            conflictPending: false,
            corroboration: current.corroboration,
        };
        // The replacement reopens the valid-time window of the edited slot.
        delete version.validTo;
        delete version.supersededBy;
        this.store.updateFact({ ...current, validTo: now, supersededBy: version.id });
        this.store.insertFact(version);
        this.ledger('fact-edit', 'fact', version.id, actor, {
            category: version.category,
            factKey: version.factKey,
            previous: current.id,
        }, request.reason);
        return version;
    }
    /** Human fact delete: tombstone the current version. */
    humanDeleteFact(request, actor) {
        const current = this.store.getFact(request.factId);
        if (current === undefined)
            throw new Error(`memory: fact not found: ${request.factId}`);
        if (current.validTo !== undefined || current.deleted)
            throw new Error('memory: only the current fact version can be deleted');
        this.store.updateFact({ ...current, validTo: Date.now(), deleted: true });
        this.ledger('fact-delete', 'fact', current.id, actor, {
            category: current.category,
            factKey: current.factKey,
            value: current.value,
        }, request.reason);
    }
    /** Human fact confirmation: lock or unlock the current version. */
    humanConfirmFact(request, actor) {
        const current = this.store.getFact(request.factId);
        if (current === undefined)
            throw new Error(`memory: fact not found: ${request.factId}`);
        const next = { ...current, locked: request.locked, conflictPending: false };
        this.store.updateFact(next);
        this.ledger(request.locked ? 'fact-lock' : 'fact-unlock', 'fact', next.id, actor, {
            category: next.category,
            factKey: next.factKey,
        }, request.reason);
        return next;
    }
    /** Human rollback (same gate, human actor). */
    humanRollback(request, actor) {
        return this.rollback(request, actor);
    }
    // ── stats / integrity / export ────────────────────────────────────────────
    /** Aggregated library statistics. */
    stats() {
        const all = this.store.listExperiences({});
        const byStatus = {
            candidate: 0, live: 0, challenged: 0, superseded: 0, archived: 0, cold: 0,
        };
        const byKind = { positive: 0, negative: 0 };
        let trustSum = 0;
        let pinned = 0;
        for (const exp of all) {
            byStatus[exp.status] += 1;
            byKind[exp.kind] += 1;
            trustSum += exp.trust;
            if (exp.pinned)
                pinned += 1;
        }
        const diary = this.store.diaryCounts();
        const recall = this.store.recallCounts();
        const reports = this.store.allReports().filter(r => r.counted !== 'none').length;
        return {
            experiences: {
                total: all.length,
                byStatus,
                byKind,
                pinned,
                avgTrust: all.length === 0 ? 0 : trustSum / all.length,
            },
            facts: this.store.factCounts(),
            diary: { total: diary.total, unextracted: diary.unextracted, extractions: this.store.extractionCount() },
            ledgerBlocks: this.store.ledgerCount(),
            recall: { events: recall.events, negative: recall.negative, reportsAfterRecall: reports },
            consolidation: {
                lastTs: this.store.lastConsolidationTs(),
                due: this.consolidationDue().due,
                newSince: this.store.countExperiencesSince(this.store.lastConsolidationTs()),
            },
        };
    }
    /** Verify the ledger hash chain end to end. */
    verifyLedger() {
        const blocks = this.store.ledgerAll();
        let prev = '';
        for (const block of blocks) {
            const expected = blockHash(block.ts, block.op, block.objectType, block.objectId, block.actor, block.payload, prev);
            if (block.prevHash !== prev || block.hash !== expected) {
                return { ok: false, checked: blocks.length, brokenAt: block.seq };
            }
            prev = block.hash;
        }
        return { ok: true, checked: blocks.length };
    }
    /** Ledger query for the workbench and the model tool. */
    ledgerQuery(request) {
        return this.store.ledgerQuery({
            ...(request.objectType === undefined ? {} : { objectType: request.objectType }),
            ...(request.objectId === undefined ? {} : { objectId: request.objectId }),
            ...(request.op === undefined ? {} : { op: request.op }),
            ...(request.offset === undefined ? {} : { offset: request.offset }),
            ...(request.seqFrom === undefined ? {} : { seqFrom: request.seqFrom }),
            ...(request.seqTo === undefined ? {} : { seqTo: request.seqTo }),
            limit: request.limit ?? 50,
        });
    }
    /** Count ledger blocks matching a filter (007 §2 pagination). */
    ledgerQueryCount(request) {
        return this.store.ledgerQueryCount({
            ...(request.objectType === undefined ? {} : { objectType: request.objectType }),
            ...(request.objectId === undefined ? {} : { objectId: request.objectId }),
            ...(request.op === undefined ? {} : { op: request.op }),
            ...(request.seqFrom === undefined ? {} : { seqFrom: request.seqFrom }),
            ...(request.seqTo === undefined ? {} : { seqTo: request.seqTo }),
        });
    }
    /** Full library export (experiments + migration). */
    exportLibrary() {
        const diaryEntries = this.store.listDiary(1_000_000, 0, false);
        return {
            exportedAt: Date.now(),
            schemaVersion: 1,
            experiences: this.store.listExperiences({}),
            reports: this.store.allReports().map(report => ({
                id: report.id,
                experienceId: report.experienceId,
                revision: report.revision,
                outcome: report.outcome,
                attribution: report.attribution,
                counted: report.counted,
                ...(report.evidence === undefined ? {} : { evidence: report.evidence }),
                ...(report.dedupeKey === undefined ? {} : { dedupeKey: report.dedupeKey }),
                ts: report.ts,
            })),
            diary: diaryEntries,
            facts: this.store.allFacts(),
            extractions: this.store.listExtractions(1_000_000, 0),
            recalls: this.store.allRecallEvents().map(event => ({
                id: event.id,
                ts: event.ts,
                situation: event.situation,
                injectedIds: event.injectedIds,
                none: event.none,
            })),
            ledger: this.store.ledgerAll(),
        };
    }
}
//# sourceMappingURL=core.js.map