/**
 * The injected business face of the memory workbench entry: plain data
 * callbacks over the memory Remote namespace. Live framework data (sessions,
 * workspaces) arrives through the standard props shares instead.
 *
 * Two contracts live here. `MemoryWorkbenchActions` is the page-facing face:
 * every callback is already bound to the current session. `MemoryRemoteActions`
 * is the slot-injected face: the generated memory Remote requires the session
 * id as the first wire argument (the host resolves it back to the Agent), so
 * each callback takes it explicitly and `bindMemoryActions` curries it away
 * once the workbench knows the current session.
 */
/** Curry the session id away so the pages keep calling the bound face. */
export function bindMemoryActions(remote, session) {
    return {
        workbenchInfo: () => remote.workbenchInfo(session),
        stats: () => remote.stats(session),
        listExperiences: (filter) => remote.listExperiences(session, filter),
        family: (id) => remote.family(session, id),
        listDiary: (limit, offset, onlyUnextracted) => remote.listDiary(session, limit, offset, onlyUnextracted),
        getDiaryByIds: (ids) => remote.getDiaryByIds(session, ids),
        listFacts: (category, includeHistory, limit, offset) => remote.listFacts(session, category, includeHistory, limit, offset),
        listFactsCount: (category, includeHistory) => remote.listFactsCount(session, category, includeHistory),
        listConcerns: (kind, status, limit, offset) => remote.listConcerns(session, kind, status, limit, offset),
        listConcernsCount: (kind, status) => remote.listConcernsCount(session, kind, status),
        extractionLog: (limit, offset) => remote.extractionLog(session, limit, offset),
        extractionLogCount: () => remote.extractionLogCount(session),
        consolidate: (request) => remote.consolidate(session, request),
        consolidationDue: () => remote.consolidationDue(session),
        ledgerQuery: (request) => remote.ledgerQuery(session, request),
        ledgerQueryCount: (request) => remote.ledgerQueryCount(session, request),
        verifyLedger: () => remote.verifyLedger(session),
        exportLibrary: () => remote.exportLibrary(session),
        humanPin: (request) => remote.humanPin(session, request),
        humanDeleteExperience: (request) => remote.humanDeleteExperience(session, request),
        humanArchiveExperience: (request) => remote.humanArchiveExperience(session, request),
        humanEditExperience: (request) => remote.humanEditExperience(session, request),
        humanAddExperience: (request) => remote.humanAddExperience(session, request),
        humanPromote: (id, reason) => remote.humanPromote(session, id, reason),
        humanRollback: (request) => remote.humanRollback(session, request),
        humanAddFact: (request) => remote.humanAddFact(session, request),
        humanEditFact: (request) => remote.humanEditFact(session, request),
        humanDeleteFact: (request) => remote.humanDeleteFact(session, request),
        humanConfirmFact: (request) => remote.humanConfirmFact(session, request),
        humanAckDiary: (request) => remote.humanAckDiary(session, request),
        humanSetConcernStatus: (request) => remote.humanSetConcernStatus(session, request),
        humanDeleteConcern: (request) => remote.humanDeleteConcern(session, request),
        humanReleaseCold: (request) => remote.humanReleaseCold(session, request),
        ingest: (request) => remote.ingest(session, request),
        generateSkillDraft: (request) => remote.generateSkillDraft(session, request),
        reviewSkill: (request) => remote.reviewSkill(session, request),
        publishSkill: (request) => remote.publishSkill(session, request),
        listSkillArtifacts: (parentExperienceId, status) => remote.listSkillArtifacts(session, parentExperienceId, status),
        isSkillCandidate: (experienceId) => remote.isSkillCandidate(session, experienceId),
    };
}
//# sourceMappingURL=actions.js.map