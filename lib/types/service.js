/**
 * Memory library Typert Remote service: the wire face over MemoryCore.
 * Every method takes the calling Agent first (Typert wire identity); the
 * library itself is process-global — one memory shared by every session.
 * Human operations carry an audited reason and land in the ledger.
 * @module daoing-dsh-memory/service
 */
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
/** Derive the ledger actor label from the wire identity. */
function actorOf(agent) {
    const sessionId = agent.session?.id;
    return sessionId === undefined ? 'agent' : `agent:${sessionId}`;
}
/**
 * Remote face of the memory library. All methods delegate to the core; the
 * core carries the 生·用·修·记 mechanism semantics.
 */
let MemoryService = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _refine_decorators;
    let _recall_decorators;
    let _report_decorators;
    let _ingest_decorators;
    let _revise_decorators;
    let _verifyShadow_decorators;
    let _rollback_decorators;
    let _get_decorators;
    let _list_decorators;
    let _family_decorators;
    let _appendDiary_decorators;
    let _extract_decorators;
    let _listDiary_decorators;
    let _getDiaryByIds_decorators;
    let _listFacts_decorators;
    let _listFactsCount_decorators;
    let _listConcerns_decorators;
    let _listConcernsCount_decorators;
    let _extractionLog_decorators;
    let _extractionLogCount_decorators;
    let _consolidate_decorators;
    let _consolidationDue_decorators;
    let _ledgerQuery_decorators;
    let _ledgerQueryCount_decorators;
    let _verifyLedger_decorators;
    let _stats_decorators;
    let _workbenchInfo_decorators;
    let _exportLibrary_decorators;
    let _humanPin_decorators;
    let _humanDeleteExperience_decorators;
    let _humanEditExperience_decorators;
    let _humanAddExperience_decorators;
    let _humanPromote_decorators;
    let _humanReleaseCold_decorators;
    let _humanRollback_decorators;
    let _humanAddFact_decorators;
    let _humanEditFact_decorators;
    let _humanDeleteFact_decorators;
    let _humanConfirmFact_decorators;
    let _humanAckDiary_decorators;
    let _humanSetConcernStatus_decorators;
    let _humanDeleteConcern_decorators;
    return class MemoryService extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _refine_decorators = [Remote('refine')];
            _recall_decorators = [Remote('recall')];
            _report_decorators = [Remote('report')];
            _ingest_decorators = [Remote('ingest')];
            _revise_decorators = [Remote('revise')];
            _verifyShadow_decorators = [Remote('verifyShadow')];
            _rollback_decorators = [Remote('rollback')];
            _get_decorators = [Remote('get')];
            _list_decorators = [Remote('list')];
            _family_decorators = [Remote('family')];
            _appendDiary_decorators = [Remote('appendDiary')];
            _extract_decorators = [Remote('extract')];
            _listDiary_decorators = [Remote('listDiary')];
            _getDiaryByIds_decorators = [Remote('getDiaryByIds')];
            _listFacts_decorators = [Remote('listFacts')];
            _listFactsCount_decorators = [Remote('listFactsCount')];
            _listConcerns_decorators = [Remote('listConcerns')];
            _listConcernsCount_decorators = [Remote('listConcernsCount')];
            _extractionLog_decorators = [Remote('extractionLog')];
            _extractionLogCount_decorators = [Remote('extractionLogCount')];
            _consolidate_decorators = [Remote('consolidate')];
            _consolidationDue_decorators = [Remote('consolidationDue')];
            _ledgerQuery_decorators = [Remote('ledgerQuery')];
            _ledgerQueryCount_decorators = [Remote('ledgerQueryCount')];
            _verifyLedger_decorators = [Remote('verifyLedger')];
            _stats_decorators = [Remote('stats')];
            _workbenchInfo_decorators = [Remote('workbenchInfo')];
            _exportLibrary_decorators = [Remote('exportLibrary')];
            _humanPin_decorators = [Remote('humanPin')];
            _humanDeleteExperience_decorators = [Remote('humanDeleteExperience')];
            _humanEditExperience_decorators = [Remote('humanEditExperience')];
            _humanAddExperience_decorators = [Remote('humanAddExperience')];
            _humanPromote_decorators = [Remote('humanPromote')];
            _humanReleaseCold_decorators = [Remote('humanReleaseCold')];
            _humanRollback_decorators = [Remote('humanRollback')];
            _humanAddFact_decorators = [Remote('humanAddFact')];
            _humanEditFact_decorators = [Remote('humanEditFact')];
            _humanDeleteFact_decorators = [Remote('humanDeleteFact')];
            _humanConfirmFact_decorators = [Remote('humanConfirmFact')];
            _humanAckDiary_decorators = [Remote('humanAckDiary')];
            _humanSetConcernStatus_decorators = [Remote('humanSetConcernStatus')];
            _humanDeleteConcern_decorators = [Remote('humanDeleteConcern')];
            __esDecorate(this, null, _refine_decorators, { kind: "method", name: "refine", static: false, private: false, access: { has: obj => "refine" in obj, get: obj => obj.refine }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _recall_decorators, { kind: "method", name: "recall", static: false, private: false, access: { has: obj => "recall" in obj, get: obj => obj.recall }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _report_decorators, { kind: "method", name: "report", static: false, private: false, access: { has: obj => "report" in obj, get: obj => obj.report }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _ingest_decorators, { kind: "method", name: "ingest", static: false, private: false, access: { has: obj => "ingest" in obj, get: obj => obj.ingest }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _revise_decorators, { kind: "method", name: "revise", static: false, private: false, access: { has: obj => "revise" in obj, get: obj => obj.revise }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _verifyShadow_decorators, { kind: "method", name: "verifyShadow", static: false, private: false, access: { has: obj => "verifyShadow" in obj, get: obj => obj.verifyShadow }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _rollback_decorators, { kind: "method", name: "rollback", static: false, private: false, access: { has: obj => "rollback" in obj, get: obj => obj.rollback }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _get_decorators, { kind: "method", name: "get", static: false, private: false, access: { has: obj => "get" in obj, get: obj => obj.get }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _list_decorators, { kind: "method", name: "list", static: false, private: false, access: { has: obj => "list" in obj, get: obj => obj.list }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _family_decorators, { kind: "method", name: "family", static: false, private: false, access: { has: obj => "family" in obj, get: obj => obj.family }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _appendDiary_decorators, { kind: "method", name: "appendDiary", static: false, private: false, access: { has: obj => "appendDiary" in obj, get: obj => obj.appendDiary }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _extract_decorators, { kind: "method", name: "extract", static: false, private: false, access: { has: obj => "extract" in obj, get: obj => obj.extract }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _listDiary_decorators, { kind: "method", name: "listDiary", static: false, private: false, access: { has: obj => "listDiary" in obj, get: obj => obj.listDiary }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _getDiaryByIds_decorators, { kind: "method", name: "getDiaryByIds", static: false, private: false, access: { has: obj => "getDiaryByIds" in obj, get: obj => obj.getDiaryByIds }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _listFacts_decorators, { kind: "method", name: "listFacts", static: false, private: false, access: { has: obj => "listFacts" in obj, get: obj => obj.listFacts }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _listFactsCount_decorators, { kind: "method", name: "listFactsCount", static: false, private: false, access: { has: obj => "listFactsCount" in obj, get: obj => obj.listFactsCount }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _listConcerns_decorators, { kind: "method", name: "listConcerns", static: false, private: false, access: { has: obj => "listConcerns" in obj, get: obj => obj.listConcerns }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _listConcernsCount_decorators, { kind: "method", name: "listConcernsCount", static: false, private: false, access: { has: obj => "listConcernsCount" in obj, get: obj => obj.listConcernsCount }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _extractionLog_decorators, { kind: "method", name: "extractionLog", static: false, private: false, access: { has: obj => "extractionLog" in obj, get: obj => obj.extractionLog }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _extractionLogCount_decorators, { kind: "method", name: "extractionLogCount", static: false, private: false, access: { has: obj => "extractionLogCount" in obj, get: obj => obj.extractionLogCount }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _consolidate_decorators, { kind: "method", name: "consolidate", static: false, private: false, access: { has: obj => "consolidate" in obj, get: obj => obj.consolidate }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _consolidationDue_decorators, { kind: "method", name: "consolidationDue", static: false, private: false, access: { has: obj => "consolidationDue" in obj, get: obj => obj.consolidationDue }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _ledgerQuery_decorators, { kind: "method", name: "ledgerQuery", static: false, private: false, access: { has: obj => "ledgerQuery" in obj, get: obj => obj.ledgerQuery }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _ledgerQueryCount_decorators, { kind: "method", name: "ledgerQueryCount", static: false, private: false, access: { has: obj => "ledgerQueryCount" in obj, get: obj => obj.ledgerQueryCount }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _verifyLedger_decorators, { kind: "method", name: "verifyLedger", static: false, private: false, access: { has: obj => "verifyLedger" in obj, get: obj => obj.verifyLedger }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _stats_decorators, { kind: "method", name: "stats", static: false, private: false, access: { has: obj => "stats" in obj, get: obj => obj.stats }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _workbenchInfo_decorators, { kind: "method", name: "workbenchInfo", static: false, private: false, access: { has: obj => "workbenchInfo" in obj, get: obj => obj.workbenchInfo }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _exportLibrary_decorators, { kind: "method", name: "exportLibrary", static: false, private: false, access: { has: obj => "exportLibrary" in obj, get: obj => obj.exportLibrary }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _humanPin_decorators, { kind: "method", name: "humanPin", static: false, private: false, access: { has: obj => "humanPin" in obj, get: obj => obj.humanPin }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _humanDeleteExperience_decorators, { kind: "method", name: "humanDeleteExperience", static: false, private: false, access: { has: obj => "humanDeleteExperience" in obj, get: obj => obj.humanDeleteExperience }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _humanEditExperience_decorators, { kind: "method", name: "humanEditExperience", static: false, private: false, access: { has: obj => "humanEditExperience" in obj, get: obj => obj.humanEditExperience }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _humanAddExperience_decorators, { kind: "method", name: "humanAddExperience", static: false, private: false, access: { has: obj => "humanAddExperience" in obj, get: obj => obj.humanAddExperience }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _humanPromote_decorators, { kind: "method", name: "humanPromote", static: false, private: false, access: { has: obj => "humanPromote" in obj, get: obj => obj.humanPromote }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _humanReleaseCold_decorators, { kind: "method", name: "humanReleaseCold", static: false, private: false, access: { has: obj => "humanReleaseCold" in obj, get: obj => obj.humanReleaseCold }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _humanRollback_decorators, { kind: "method", name: "humanRollback", static: false, private: false, access: { has: obj => "humanRollback" in obj, get: obj => obj.humanRollback }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _humanAddFact_decorators, { kind: "method", name: "humanAddFact", static: false, private: false, access: { has: obj => "humanAddFact" in obj, get: obj => obj.humanAddFact }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _humanEditFact_decorators, { kind: "method", name: "humanEditFact", static: false, private: false, access: { has: obj => "humanEditFact" in obj, get: obj => obj.humanEditFact }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _humanDeleteFact_decorators, { kind: "method", name: "humanDeleteFact", static: false, private: false, access: { has: obj => "humanDeleteFact" in obj, get: obj => obj.humanDeleteFact }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _humanConfirmFact_decorators, { kind: "method", name: "humanConfirmFact", static: false, private: false, access: { has: obj => "humanConfirmFact" in obj, get: obj => obj.humanConfirmFact }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _humanAckDiary_decorators, { kind: "method", name: "humanAckDiary", static: false, private: false, access: { has: obj => "humanAckDiary" in obj, get: obj => obj.humanAckDiary }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _humanSetConcernStatus_decorators, { kind: "method", name: "humanSetConcernStatus", static: false, private: false, access: { has: obj => "humanSetConcernStatus" in obj, get: obj => obj.humanSetConcernStatus }, metadata: _metadata }, null, _instanceExtraInitializers);
            __esDecorate(this, null, _humanDeleteConcern_decorators, { kind: "method", name: "humanDeleteConcern", static: false, private: false, access: { has: obj => "humanDeleteConcern" in obj, get: obj => obj.humanDeleteConcern }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        core = __runInitializers(this, _instanceExtraInitializers);
        workbench;
        /** @param ctx - host context. */
        /** @param core - the ctx-free memory core. */
        /** @param workbench - descriptor the browser half matches workspaces against. */
        constructor(ctx, core, workbench) {
            super(ctx, 'memory');
            this.core = core;
            this.workbench = workbench;
        }
        /** 生: refine a completed trajectory into an experience candidate. */
        refine(agent, request) {
            return this.core.refine(request, actorOf(agent));
        }
        /** 用: recall + adjudication + injection budget + negative channel. */
        recall(agent, request) {
            return this.core.recall(request, actorOf(agent));
        }
        /** 用·验: report one use outcome with attribution (V0 verification). */
        report(agent, request) {
            return this.core.report(request, actorOf(agent));
        }
        /** 摄取归一: source-agnostic intake; drafts become earned candidates (006 §1). */
        ingest(agent, request) {
            return this.core.ingest(request, actorOf(agent));
        }
        /** 修: propose a revised draft for a challenged experience. */
        revise(agent, request) {
            return this.core.revise(request, actorOf(agent));
        }
        /** V1 controlled re-enactment: shadow replay verification for a draft. */
        verifyShadow(agent, request) {
            return this.core.verifyShadow(request, actorOf(agent));
        }
        /** Restore a superseded revision to live (rollback). */
        rollback(agent, request) {
            return this.core.rollback(request, actorOf(agent));
        }
        /** Read one experience revision (active when revision omitted). */
        get(agent, id, revision) {
            void agent;
            return this.core.get(id, revision);
        }
        /** List experience revisions by filter. */
        list(agent, filter) {
            void agent;
            return this.core.list(filter);
        }
        /** Every revision of one family (superseded index for rollback). */
        family(agent, id) {
            void agent;
            return this.core.family(id);
        }
        /** 记: append one diary entry; signals the extraction duty when due. */
        appendDiary(agent, request) {
            return this.core.appendDiary(request, actorOf(agent));
        }
        /** 上升通道: apply extracted facts over the pending diary window. */
        extract(agent, request) {
            return this.core.extract(request, actorOf(agent), 'manual');
        }
        /** Diary timeline for the workbench (007 §2: server-side pagination, newest first). */
        listDiary(agent, limit, offset, onlyUnextracted) {
            void agent;
            return this.core.listDiary(limit, offset, onlyUnextracted);
        }
        /** Several diary entries by id (008 Path A: fact→diary provenance). */
        getDiaryByIds(agent, ids) {
            void agent;
            return this.core.getDiaryByIds(ids);
        }
        /** Fact versions for the workbench (008 §3: server-side pagination). */
        listFacts(agent, category, includeHistory, limit, offset) {
            void agent;
            return this.core.listFacts(category === '' ? undefined : category, includeHistory, limit, offset);
        }
        /** Count facts matching the workbench filter (008 §3: pagination total). */
        listFactsCount(agent, category, includeHistory) {
            void agent;
            return this.core.listFactsCount(category === '' ? undefined : category, includeHistory);
        }
        /** 关心事项 trees (top-level + discussion loop) for the workbench (010 §D: filter + pagination). */
        listConcerns(agent, kind, status, limit, offset) {
            void agent;
            return this.core.listConcerns(kind === '' ? undefined : kind, status === '' ? undefined : status, limit, offset);
        }
        /** Count of top-level concerns matching the workbench filter (010 §D: pagination total). */
        listConcernsCount(agent, kind, status) {
            void agent;
            return this.core.listConcernsCount(kind === '' ? undefined : kind, status === '' ? undefined : status);
        }
        /** 010 §F: compact profile + open-concern snapshot for the AI's context (host-side). */
        profileSnapshot() {
            return this.core.profileSnapshot();
        }
        /** Extraction runs for the workbench (008 §3: server-side pagination). */
        extractionLog(agent, limit, offset) {
            void agent;
            return this.core.extractionLog(limit, offset);
        }
        /** Total extraction runs (008 §3: pagination total). */
        extractionLogCount(agent) {
            void agent;
            return this.core.extractionLogCount();
        }
        /** Apply a consolidation run: merge related experiences (008 §1). */
        consolidate(agent, request) {
            void agent;
            return this.core.consolidate(request, 'agent');
        }
        /** Whether a consolidation run is due (interval cadence; 008 §1). */
        consolidationDue(agent) {
            void agent;
            return this.core.consolidationDue();
        }
        /** Ledger query (newest first, filtered). */
        ledgerQuery(agent, request) {
            void agent;
            return this.core.ledgerQuery(request);
        }
        /** Count ledger blocks matching a filter (007 §2 pagination). */
        ledgerQueryCount(agent, request) {
            void agent;
            return this.core.ledgerQueryCount(request);
        }
        /** Verify the ledger hash chain end to end. */
        verifyLedger(agent) {
            void agent;
            return this.core.verifyLedger();
        }
        /** Aggregated library statistics. */
        stats(agent) {
            void agent;
            return this.core.stats();
        }
        /** Workbench descriptor (workspace matching + config view). */
        workbenchInfo(agent) {
            void agent;
            return this.workbench();
        }
        /** Full library export for experiments and migration. */
        exportLibrary(agent) {
            void agent;
            return this.core.exportLibrary();
        }
        /**
         * Host-only ledger integrity check (no wire identity needed): the package
         * invariant companion asserts the hash chain through this accessor.
         * @returns the chain verification outcome.
         */
        verifyLedgerIntegrity() {
            return this.core.verifyLedger();
        }
        // ── human operations (all ledgered with the audited reason) ───────────────
        /** Human pin/unpin. */
        humanPin(agent, request) {
            void agent;
            return this.core.humanPin(request, 'human');
        }
        /** Human delete (tombstone + ledger fingerprint). */
        humanDeleteExperience(agent, request) {
            void agent;
            this.core.humanDeleteExperience(request, 'human');
            return { deleted: true };
        }
        /** Human edit of the active revision. */
        humanEditExperience(agent, request) {
            void agent;
            return this.core.humanEditExperience(request, 'human');
        }
        /** Human injection in the fixed experience format. */
        humanAddExperience(agent, request) {
            void agent;
            return this.core.humanAddExperience(request, 'human');
        }
        /** Human authority (V2): promote a candidate straight to live. */
        humanPromote(agent, id, reason) {
            void agent;
            return this.core.humanPromote(id, reason, 'human');
        }
        /** Human re-release of a cold-palace revision back to candidate (006 §3.2). */
        humanReleaseCold(agent, request) {
            void agent;
            return this.core.humanReleaseCold(request, 'human');
        }
        /** Human rollback. */
        humanRollback(agent, request) {
            void agent;
            return this.core.humanRollback(request, 'human');
        }
        /** Human fact add. */
        humanAddFact(agent, request) {
            void agent;
            return this.core.humanAddFact(request, 'human');
        }
        /** Human fact edit. */
        humanEditFact(agent, request) {
            void agent;
            return this.core.humanEditFact(request, 'human');
        }
        /** Human fact delete (tombstone). */
        humanDeleteFact(agent, request) {
            void agent;
            this.core.humanDeleteFact(request, 'human');
            return { deleted: true };
        }
        /** Human fact confirmation (lock/unlock). */
        humanConfirmFact(agent, request) {
            void agent;
            return this.core.humanConfirmFact(request, 'human');
        }
        /** Human acknowledgement of a pending diary entry (reviewed, no fact extracted). */
        humanAckDiary(agent, request) {
            void agent;
            return this.core.humanAckDiary(request, 'human');
        }
        /** Human lifecycle change of a top-level concern (007 §2.4). */
        humanSetConcernStatus(agent, request) {
            void agent;
            this.core.humanSetConcernStatus(request, 'human');
            return { ok: true };
        }
        /** Human delete of a concern subtree (007 §2.4). */
        humanDeleteConcern(agent, request) {
            void agent;
            this.core.humanDeleteConcern(request, 'human');
            return { deleted: true };
        }
    };
})();
export { MemoryService };
//# sourceMappingURL=service.js.map