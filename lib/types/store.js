/**
 * Memory store: durable SQLite persistence for the experience lifecycle,
 * use reports, diary, facts, extractions, recall telemetry, and the
 * append-only hash-chained ledger. Uses node:sqlite (DatabaseSync) so the
 * library runs with zero external services.
 * @module dsh-daoing-memory/store
 */
import { createHash } from 'node:crypto';
/** Monotone store schema version. v1→v2 is an additive ALTER migration (see open()). */
export const MEMORY_SCHEMA_VERSION = 6;
/** Half-life (ms) of the recency weighting applied to verification samples. */
export const TRUST_HALF_LIFE_MS = 180 * 24 * 60 * 60 * 1000;
/** Hash one ledger block's content, chained to the previous hash. */
export function blockHash(ts, op, objectType, objectId, actor, payload, prevHash) {
    const body = JSON.stringify({ ts, op, objectType, objectId, actor, payload, prevHash });
    return createHash('sha256').update(body).digest('hex').slice(0, 24);
}
/** Tokenize into latin words + CJK bigrams so Chinese situations match. */
export function tokenize(text) {
    const lower = text.toLowerCase();
    const latin = lower.match(/[a-z0-9_]+/g) ?? [];
    const cjk = lower.match(/[\u4e00-\u9fff]+/g) ?? [];
    const bigrams = [];
    for (const seg of cjk) {
        if (seg.length === 1)
            bigrams.push(seg);
        for (let i = 0; i < seg.length - 1; i++)
            bigrams.push(seg.slice(i, i + 2));
    }
    return [...latin, ...bigrams];
}
/** Rough token estimate for injection budgeting (CJK-heavy text). */
export function estimateTokens(text) {
    const cjk = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
    const rest = text.length - cjk;
    return Math.ceil(cjk * 0.6 + rest / 4);
}
/** The durable store behind the memory core. */
export class MemoryStore {
    db;
    /** @param db - an open node:sqlite DatabaseSync handle. */
    constructor(db) {
        this.db = db;
        db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS memory_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS experiences (
        family_id TEXT NOT NULL,
        revision INTEGER NOT NULL,
        kind TEXT NOT NULL,
        source TEXT NOT NULL,
        family TEXT NOT NULL,
        gist TEXT NOT NULL,
        situation TEXT NOT NULL,
        path TEXT NOT NULL,
        reasoning TEXT NOT NULL,
        limits TEXT NOT NULL,
        status TEXT NOT NULL,
        alpha REAL NOT NULL,
        beta REAL NOT NULL,
        last_verified_at INTEGER,
        pinned INTEGER NOT NULL DEFAULT 0,
        tokens_saved REAL NOT NULL DEFAULT 0,
        tokens_spent REAL NOT NULL DEFAULT 0,
        parent_revision INTEGER,
        failure_reason TEXT,
        evidence TEXT,
        challenge_reason TEXT,
        deleted INTEGER NOT NULL DEFAULT 0,
        context TEXT NOT NULL DEFAULT '',
        verified_count INTEGER NOT NULL DEFAULT 0,
        reject_count INTEGER NOT NULL DEFAULT 0,
        global_flag INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (family_id, revision)
      );
      CREATE INDEX IF NOT EXISTS idx_exp_status ON experiences (status, deleted);
      CREATE INDEX IF NOT EXISTS idx_exp_family ON experiences (family);
      CREATE TABLE IF NOT EXISTS use_reports (
        id TEXT PRIMARY KEY,
        experience_id TEXT NOT NULL,
        revision INTEGER NOT NULL,
        outcome TEXT NOT NULL,
        attribution TEXT NOT NULL,
        counted TEXT NOT NULL,
        evidence TEXT,
        dedupe_key TEXT,
        ts INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_reports_exp ON use_reports (experience_id, revision, ts);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_dedupe
        ON use_reports (experience_id, revision, dedupe_key)
        WHERE dedupe_key IS NOT NULL;
      CREATE TABLE IF NOT EXISTS ledger (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER NOT NULL,
        op TEXT NOT NULL,
        object_type TEXT NOT NULL,
        object_id TEXT NOT NULL,
        actor TEXT NOT NULL,
        reason TEXT,
        payload TEXT NOT NULL,
        prev_hash TEXT NOT NULL,
        hash TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_ledger_object ON ledger (object_type, object_id, seq DESC);
      CREATE TABLE IF NOT EXISTS diary (
        id TEXT PRIMARY KEY,
        ts INTEGER NOT NULL,
        kind TEXT NOT NULL,
        content TEXT NOT NULL,
        session_ref TEXT,
        tags TEXT NOT NULL,
        extracted INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS facts (
        id TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        fact_key TEXT NOT NULL,
        value TEXT NOT NULL,
        origin TEXT NOT NULL,
        source_diary_ids TEXT NOT NULL,
        corroboration INTEGER NOT NULL DEFAULT 1,
        valid_from INTEGER NOT NULL,
        valid_to INTEGER,
        recorded_at INTEGER NOT NULL,
        superseded_by TEXT,
        locked INTEGER NOT NULL DEFAULT 0,
        deleted INTEGER NOT NULL DEFAULT 0,
        conflict_pending INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_facts_slot ON facts (category, fact_key, valid_to);
      CREATE TABLE IF NOT EXISTS extractions (
        id TEXT PRIMARY KEY,
        ts INTEGER NOT NULL,
        trigger TEXT NOT NULL,
        summary TEXT NOT NULL,
        produced_fact_ids TEXT NOT NULL,
        diary_count INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS recall_events (
        id TEXT PRIMARY KEY,
        ts INTEGER NOT NULL,
        situation TEXT NOT NULL,
        injected_ids TEXT NOT NULL,
        none INTEGER NOT NULL DEFAULT 0,
        context TEXT NOT NULL DEFAULT ''
      );
      CREATE TABLE IF NOT EXISTS concerns (
        id TEXT PRIMARY KEY,
        parent_id TEXT,
        title TEXT NOT NULL,
        background TEXT NOT NULL DEFAULT '',
        kind TEXT,
        status TEXT,
        ts INTEGER NOT NULL,
        source_diary_ids TEXT NOT NULL,
        context TEXT NOT NULL DEFAULT '',
        deleted INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS consolidations (
        id TEXT PRIMARY KEY,
        ts INTEGER NOT NULL,
        merged_ids TEXT NOT NULL,
        produced_id TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT ''
      );
    `);
        const row = db.prepare('SELECT value FROM memory_meta WHERE key = ?').get('schema_version');
        if (row === undefined) {
            db.prepare('INSERT INTO memory_meta (key, value) VALUES (?, ?)').run('schema_version', String(MEMORY_SCHEMA_VERSION));
        }
        else {
            // Sequential additive migrations; the concerns table is created by the
            // bootstrap exec above for every older version (IF NOT EXISTS).
            let v = Number(row.value);
            if (v === 1) {
                // v1 → v2 (006): context scope, dual counters, global flag.
                db.exec(`
          ALTER TABLE experiences ADD COLUMN context TEXT NOT NULL DEFAULT '';
          ALTER TABLE experiences ADD COLUMN verified_count INTEGER NOT NULL DEFAULT 0;
          ALTER TABLE experiences ADD COLUMN reject_count INTEGER NOT NULL DEFAULT 0;
          ALTER TABLE experiences ADD COLUMN global_flag INTEGER NOT NULL DEFAULT 0;
          ALTER TABLE recall_events ADD COLUMN context TEXT NOT NULL DEFAULT '';
        `);
                v = 2;
            }
            if (v === 2 && MEMORY_SCHEMA_VERSION >= 3) {
                // v2 → v3 (007): concerns layer (table already created by bootstrap).
                v = 3;
            }
            if (v === 3 && MEMORY_SCHEMA_VERSION >= 4) {
                // v3 → v4 (008): consolidation log (table already created by bootstrap).
                v = 4;
            }
            if (v === 4 && MEMORY_SCHEMA_VERSION >= 5) {
                // v4 → v5 (010): concerns gain a background scene column.
                db.exec(`ALTER TABLE concerns ADD COLUMN background TEXT NOT NULL DEFAULT '';`);
                v = 5;
            }
            if (v === 5 && MEMORY_SCHEMA_VERSION >= 6) {
                // v5 → v6 (P2): skill_artifacts table for experience→skill conversion.
                db.exec(`
          CREATE TABLE IF NOT EXISTS skill_artifacts (
            id TEXT PRIMARY KEY,
            parent_experience_id TEXT NOT NULL,
            form TEXT NOT NULL,
            status TEXT NOT NULL,
            draft_path TEXT,
            published_path TEXT,
            version INTEGER NOT NULL DEFAULT 1,
            use_count INTEGER NOT NULL DEFAULT 0,
            optimize_count INTEGER NOT NULL DEFAULT 0,
            last_feedback TEXT,
            content_hash TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_skill_parent ON skill_artifacts (parent_experience_id);
          CREATE INDEX IF NOT EXISTS idx_skill_status ON skill_artifacts (status);
        `);
                v = 6;
            }
            if (v !== MEMORY_SCHEMA_VERSION) {
                throw new Error(`memory store schema version ${row.value} does not match ${MEMORY_SCHEMA_VERSION}; refusing to open`);
            }
            db.prepare('UPDATE memory_meta SET value = ? WHERE key = ?').run(String(MEMORY_SCHEMA_VERSION), 'schema_version');
        }
        // Context index lives outside the bootstrap exec so a v1 table (no `context`
        // column yet) never breaks index creation; safe once the columns exist.
        db.exec('CREATE INDEX IF NOT EXISTS idx_exp_context ON experiences (context);');
        db.exec('CREATE INDEX IF NOT EXISTS idx_concern_parent ON concerns (parent_id);');
    }
    // ── experiences ───────────────────────────────────────────────────────────
    /** Insert or update one experience revision row. */
    upsertExperience(s) {
        this.db.prepare(`
      INSERT INTO experiences (
        family_id, revision, kind, source, family, gist, situation, path, reasoning, limits,
        status, alpha, beta, last_verified_at, pinned, tokens_saved, tokens_spent,
        parent_revision, failure_reason, evidence, challenge_reason, deleted,
        context, verified_count, reject_count, global_flag, created_at, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,?,?,?,?)
      ON CONFLICT (family_id, revision) DO UPDATE SET
        kind = excluded.kind,
        source = excluded.source,
        family = excluded.family,
        gist = excluded.gist,
        situation = excluded.situation,
        path = excluded.path,
        reasoning = excluded.reasoning,
        limits = excluded.limits,
        status = excluded.status,
        alpha = excluded.alpha,
        beta = excluded.beta,
        last_verified_at = excluded.last_verified_at,
        pinned = excluded.pinned,
        tokens_saved = excluded.tokens_saved,
        tokens_spent = excluded.tokens_spent,
        parent_revision = excluded.parent_revision,
        failure_reason = excluded.failure_reason,
        evidence = excluded.evidence,
        challenge_reason = excluded.challenge_reason,
        context = excluded.context,
        verified_count = excluded.verified_count,
        reject_count = excluded.reject_count,
        global_flag = excluded.global_flag,
        updated_at = excluded.updated_at
    `).run(s.id, s.revision, s.kind, s.source, s.family, s.gist, JSON.stringify(s.situation), JSON.stringify(s.path), s.reasoning, JSON.stringify(s.limits), s.status, s.alpha, s.beta, s.lastVerifiedAt ?? null, s.pinned ? 1 : 0, s.tokensSaved, s.tokensSpent, s.parentRevision ?? null, s.failureReason ?? null, s.evidence === undefined ? null : JSON.stringify(s.evidence), s.challengeReason ?? null, s.context ?? '', s.verifiedCount ?? 0, s.rejectCount ?? 0, s.globalFlag === true ? 1 : 0, s.createdAt, s.updatedAt);
    }
    /** Read one experience revision. */
    getExperience(familyId, revision) {
        const row = this.db.prepare('SELECT * FROM experiences WHERE family_id = ? AND revision = ? AND deleted = 0').get(familyId, revision);
        return row === undefined ? undefined : this.rowToExperience(row);
    }
    /** The active (non-superseded, non-deleted) revision of a family, if any. */
    getActiveRevision(familyId) {
        const row = this.db.prepare(`
      SELECT * FROM experiences
      WHERE family_id = ? AND deleted = 0 AND status IN ('candidate', 'live', 'challenged')
      ORDER BY revision DESC LIMIT 1
    `).get(familyId);
        return row === undefined ? undefined : this.rowToExperience(row);
    }
    /** All revisions of one family, oldest first. */
    getFamily(familyId) {
        const rows = this.db.prepare('SELECT * FROM experiences WHERE family_id = ? AND deleted = 0 ORDER BY revision ASC').all(familyId);
        return rows.map(row => this.rowToExperience(row));
    }
    /** List experience revisions by filter; live-ish first, best trust first. */
    listExperiences(filter) {
        const clauses = ['deleted = 0'];
        const params = [];
        if (filter.status !== undefined) {
            clauses.push('status = ?');
            params.push(filter.status);
        }
        if (filter.kind !== undefined) {
            clauses.push('kind = ?');
            params.push(filter.kind);
        }
        if (filter.family !== undefined) {
            clauses.push('family = ?');
            params.push(filter.family);
        }
        if (filter.context !== undefined) {
            clauses.push('context = ?');
            params.push(filter.context);
        }
        const rows = this.db.prepare(`
      SELECT * FROM experiences WHERE ${clauses.join(' AND ')}
      ORDER BY CASE status WHEN 'live' THEN 0 WHEN 'candidate' THEN 1 WHEN 'challenged' THEN 2
                           WHEN 'cold' THEN 3 WHEN 'archived' THEN 4 ELSE 5 END,
               (alpha + 1.0) / (alpha + beta + 2.0) DESC,
               updated_at DESC
    `).all(...params);
        return rows.map(row => this.rowToExperience(row));
    }
    /**
     * Recall candidates: token overlap against situation+gist+limits of the given
     * statuses, best overlap first. An optional context scopes the pool: only
     * same-context or globally-shared (global_flag) revisions qualify (006 §2).
     */
    recallCandidates(queryTokens, topK, opts = {}) {
        const statuses = opts.statuses ?? ['live'];
        let sql = `
      SELECT * FROM experiences
      WHERE deleted = 0 AND status IN (${statuses.map(() => '?').join(', ')})
    `;
        const params = [...statuses];
        if (opts.context !== undefined && opts.context !== '') {
            sql += ' AND (context = ? OR global_flag = 1)';
            params.push(opts.context);
        }
        const rows = this.db.prepare(sql).all(...params);
        const scored = [];
        for (const row of rows) {
            const snapshot = this.rowToExperience(row);
            const hay = new Set(tokenize([snapshot.gist, ...snapshot.situation, ...snapshot.limits].join(' ')));
            if (hay.size === 0)
                continue;
            let hits = 0;
            for (const token of queryTokens)
                if (hay.has(token))
                    hits += 1;
            const score = hits / Math.sqrt(queryTokens.size * hay.size);
            if (score > 0)
                scored.push({ snapshot, score });
        }
        scored.sort((a, b) => b.score - a.score);
        return scored.slice(0, topK);
    }
    /**
     * Near-duplicate detection for the information-gain gate (007 flow-log fix).
     * Unlike recallCandidates it scores on gist+situation only (the lesson's
     * identity), so identical lessons with divergent limits/paths still match.
     * Returns the single best match across the requested statuses, or undefined.
     */
    findNearDuplicate(queryTokens, statuses) {
        if (queryTokens.size === 0)
            return undefined;
        const sql = `
      SELECT * FROM experiences
      WHERE deleted = 0 AND status IN (${statuses.map(() => '?').join(', ')})
    `;
        const rows = this.db.prepare(sql).all(...statuses);
        let best;
        for (const row of rows) {
            const snapshot = this.rowToExperience(row);
            const hay = new Set(tokenize([snapshot.gist, ...snapshot.situation].join(' ')));
            if (hay.size === 0)
                continue;
            let hits = 0;
            for (const token of queryTokens)
                if (hay.has(token))
                    hits += 1;
            const score = hits / Math.sqrt(queryTokens.size * hay.size);
            if (best === undefined || score > best.score)
                best = { snapshot, score };
        }
        return best;
    }
    /** Count live revisions in one family (capacity budget). */
    countFamilyActive(familyTag) {
        const row = this.db.prepare("SELECT COUNT(*) AS n FROM experiences WHERE family = ? AND status = 'live' AND deleted = 0").get(familyTag);
        return row.n;
    }
    /** Mark one revision deleted (human delete tombstone). */
    deleteFamily(familyId) {
        this.db.prepare('UPDATE experiences SET deleted = 1, updated_at = ? WHERE family_id = ?')
            .run(Date.now(), familyId);
    }
    // ── use reports ───────────────────────────────────────────────────────────
    /**
     * Insert one counted report; a repeated (family, revision, dedupeKey)
     * returns false instead of double-counting (idempotent use).
     */
    insertReport(report) {
        try {
            this.db.prepare(`
        INSERT INTO use_reports (id, experience_id, revision, outcome, attribution, counted, evidence, dedupe_key, ts)
        VALUES (?,?,?,?,?,?,?,?,?)
      `).run(report.id, report.experienceId, report.revision, report.outcome, report.attribution, report.counted, report.evidence === undefined ? null : JSON.stringify(report.evidence), report.dedupeKey ?? null, report.ts);
            return true;
        }
        catch (error) {
            if (error instanceof Error && error.message.includes('UNIQUE'))
                return false;
            throw error;
        }
    }
    /** Recent counted reports of one revision, newest first. */
    reportsFor(familyId, revision, limit) {
        const rows = this.db.prepare(`
      SELECT * FROM use_reports WHERE experience_id = ? AND revision = ? AND counted != 'none'
      ORDER BY ts DESC LIMIT ?
    `).all(familyId, revision, limit);
        return rows.map(row => this.rowToReport(row));
    }
    /** Every report row (export). */
    allReports() {
        const rows = this.db.prepare('SELECT * FROM use_reports ORDER BY ts ASC').all();
        return rows.map(row => this.rowToReport(row));
    }
    /** Recency-weighted alpha/beta over counted reports. */
    weightedTrust(familyId, revision, now) {
        const rows = this.db.prepare(`
      SELECT ts, counted FROM use_reports
      WHERE experience_id = ? AND revision = ? AND counted IN ('alpha', 'beta')
    `).all(familyId, revision);
        let alpha = 0;
        let beta = 0;
        for (const row of rows) {
            const weight = Math.pow(0.5, (now - row.ts) / TRUST_HALF_LIFE_MS);
            if (row.counted === 'alpha')
                alpha += weight;
            else
                beta += weight;
        }
        return (alpha + 1) / (alpha + beta + 2);
    }
    // ── ledger ────────────────────────────────────────────────────────────────
    /** Append one block, chaining the hash; returns the stored block. */
    appendLedger(block) {
        const hash = blockHash(block.ts, block.op, block.objectType, block.objectId, block.actor, block.payload, block.prevHash);
        const info = this.db.prepare(`
      INSERT INTO ledger (ts, op, object_type, object_id, actor, reason, payload, prev_hash, hash)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).run(block.ts, block.op, block.objectType, block.objectId, block.actor, block.reason ?? null, block.payload, block.prevHash, hash);
        return { ...block, seq: Number(info.lastInsertRowid), hash };
    }
    /** The newest block's hash ('' when the ledger is empty). */
    ledgerHead() {
        const row = this.db.prepare('SELECT hash FROM ledger ORDER BY seq DESC LIMIT 1').get();
        return row?.hash ?? '';
    }
    /** Ledger blocks, newest first, optionally filtered. */
    ledgerQuery(filter) {
        const { clauses, params } = this.ledgerFilterClauses(filter);
        params.push(filter.limit);
        let sql = `SELECT * FROM ledger WHERE ${clauses.join(' AND ')} ORDER BY seq DESC LIMIT ?`;
        if (filter.offset !== undefined && filter.offset > 0) {
            sql += ' OFFSET ?';
            params.push(filter.offset);
        }
        const rows = this.db.prepare(sql).all(...params);
        return rows.map(row => this.rowToLedger(row));
    }
    /** Shared WHERE-builder for the ledger query and its filtered count. */
    ledgerFilterClauses(filter) {
        const clauses = ['1 = 1'];
        const params = [];
        if (filter.objectType !== undefined) {
            clauses.push('object_type = ?');
            params.push(filter.objectType);
        }
        if (filter.objectId !== undefined) {
            clauses.push('object_id = ?');
            params.push(filter.objectId);
        }
        if (filter.op !== undefined) {
            clauses.push('op = ?');
            params.push(filter.op);
        }
        if (filter.seqFrom !== undefined) {
            clauses.push('seq >= ?');
            params.push(filter.seqFrom);
        }
        if (filter.seqTo !== undefined) {
            clauses.push('seq <= ?');
            params.push(filter.seqTo);
        }
        return { clauses, params };
    }
    /** Count ledger blocks matching a filter (for pagination, 007 §2). */
    ledgerQueryCount(filter) {
        const { clauses, params } = this.ledgerFilterClauses(filter);
        const row = this.db.prepare(`SELECT COUNT(*) AS n FROM ledger WHERE ${clauses.join(' AND ')}`).get(...params);
        return row.n;
    }
    /** The complete ledger, oldest first (integrity checks + export). */
    ledgerAll() {
        const rows = this.db.prepare('SELECT * FROM ledger ORDER BY seq ASC').all();
        return rows.map(row => this.rowToLedger(row));
    }
    /** Total ledger block count. */
    ledgerCount() {
        const row = this.db.prepare('SELECT COUNT(*) AS n FROM ledger').get();
        return row.n;
    }
    // ── diary ─────────────────────────────────────────────────────────────────
    /** Append one diary entry (append-only layer). */
    insertDiary(entry) {
        this.db.prepare(`
      INSERT INTO diary (id, ts, kind, content, session_ref, tags, extracted)
      VALUES (?,?,?,?,?,?,?)
    `).run(entry.id, entry.ts, entry.kind, entry.content, entry.sessionRef ?? null, JSON.stringify(entry.tags), entry.extracted ? 1 : 0);
    }
    /** Diary entries, newest first. */
    listDiary(limit, offset, onlyUnextracted) {
        const where = onlyUnextracted ? 'WHERE extracted = 0' : '';
        const rows = this.db.prepare(`SELECT * FROM diary ${where} ORDER BY ts DESC, rowid DESC LIMIT ? OFFSET ?`).all(limit, offset);
        return rows.map(row => this.rowToDiary(row));
    }
    /** Unextracted entries, oldest first (the extraction window). */
    unextractedDiary() {
        const rows = this.db.prepare('SELECT * FROM diary WHERE extracted = 0 ORDER BY ts ASC').all();
        return rows.map(row => this.rowToDiary(row));
    }
    /** Mark diary entries extracted. */
    markDiaryExtracted(ids) {
        const stmt = this.db.prepare('UPDATE diary SET extracted = 1 WHERE id = ?');
        for (const id of ids)
            stmt.run(id);
    }
    /** One diary entry by id. */
    getDiary(id) {
        const row = this.db.prepare('SELECT * FROM diary WHERE id = ?').get(id);
        return row === undefined ? undefined : this.rowToDiary(row);
    }
    /** Several diary entries by id, preserving the requested order (008 Path A: fact→diary provenance). */
    getDiaryByIds(ids) {
        const out = [];
        const stmt = this.db.prepare('SELECT * FROM diary WHERE id = ?');
        for (const id of ids) {
            const row = stmt.get(id);
            if (row !== undefined)
                out.push(this.rowToDiary(row));
        }
        return out;
    }
    /** Diary counters. */
    diaryCounts() {
        const total = this.db.prepare('SELECT COUNT(*) AS n FROM diary').get();
        const unextracted = this.db.prepare('SELECT COUNT(*) AS n FROM diary WHERE extracted = 0').get();
        return { total: total.n, unextracted: unextracted.n };
    }
    // ── facts ─────────────────────────────────────────────────────────────────
    /** Insert one fact version. */
    insertFact(fact) {
        this.db.prepare(`
      INSERT INTO facts (
        id, category, fact_key, value, origin, source_diary_ids, corroboration,
        valid_from, valid_to, recorded_at, superseded_by, locked, deleted, conflict_pending
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(fact.id, fact.category, fact.factKey, fact.value, fact.origin, JSON.stringify(fact.sourceDiaryIds), fact.corroboration, fact.validFrom, fact.validTo ?? null, fact.recordedAt, fact.supersededBy ?? null, fact.locked ? 1 : 0, fact.deleted ? 1 : 0, fact.conflictPending ? 1 : 0);
    }
    /** Update one fact version in place (locking, tombstones, supersede links). */
    updateFact(fact) {
        this.db.prepare(`
      UPDATE facts SET value = ?, valid_to = ?, superseded_by = ?, locked = ?, deleted = ?, conflict_pending = ?
      WHERE id = ?
    `).run(fact.value, fact.validTo ?? null, fact.supersededBy ?? null, fact.locked ? 1 : 0, fact.deleted ? 1 : 0, fact.conflictPending ? 1 : 0, fact.id);
    }
    /** The current (open valid-time window, not deleted) version of one slot. */
    currentFact(category, factKey) {
        const row = this.db.prepare('SELECT * FROM facts WHERE category = ? AND fact_key = ? AND valid_to IS NULL AND deleted = 0 ORDER BY recorded_at DESC LIMIT 1').get(category, factKey);
        return row === undefined ? undefined : this.rowToFact(row);
    }
    /** One fact version by id. */
    getFact(id) {
        const row = this.db.prepare('SELECT * FROM facts WHERE id = ?').get(id);
        return row === undefined ? undefined : this.rowToFact(row);
    }
    /** Shared WHERE for fact filters (008 §3: reused by list + count). */
    factFilterClauses(filter) {
        const clauses = ['deleted = 0'];
        const params = [];
        if (!filter.includeHistory)
            clauses.push('valid_to IS NULL');
        if (filter.category !== undefined) {
            clauses.push('category = ?');
            params.push(filter.category);
        }
        return { where: clauses.join(' AND '), params };
    }
    /** Fact versions by filter (008 §3: server-side pagination). */
    listFacts(filter, limit, offset) {
        const { where, params } = this.factFilterClauses(filter);
        const rows = this.db.prepare(`SELECT * FROM facts WHERE ${where} ORDER BY category, fact_key, recorded_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
        return rows.map(row => this.rowToFact(row));
    }
    /** Count of facts matching the filter (008 §3: pagination total). */
    factFilteredCount(filter) {
        const { where, params } = this.factFilterClauses(filter);
        const row = this.db.prepare(`SELECT COUNT(*) AS n FROM facts WHERE ${where}`).get(...params);
        return row.n;
    }
    /** All fact versions including tombstones (export). */
    allFacts() {
        const rows = this.db.prepare('SELECT * FROM facts ORDER BY recorded_at ASC').all();
        return rows.map(row => this.rowToFact(row));
    }
    /** Fact counters. */
    factCounts() {
        const q = (where) => this.db.prepare(`SELECT COUNT(*) AS n FROM facts WHERE ${where}`).get().n;
        return {
            total: q('deleted = 0'),
            current: q('valid_to IS NULL AND deleted = 0'),
            locked: q('valid_to IS NULL AND deleted = 0 AND locked = 1'),
            conflictPending: q('valid_to IS NULL AND deleted = 0 AND conflict_pending = 1'),
        };
    }
    // ── concerns (007 §2, evolving user concerns with parent/child loop) ──────
    rowToConcern(row) {
        return {
            id: row.id,
            ...(row.parent_id === null ? {} : { parentId: row.parent_id }),
            title: row.title,
            ...(row.background === '' ? {} : { background: row.background }),
            ...(row.kind === null ? {} : { kind: row.kind }),
            ...(row.status === null ? {} : { status: row.status }),
            ts: row.ts,
            sourceDiaryIds: JSON.parse(row.source_diary_ids),
            ...(row.context === '' ? {} : { context: row.context }),
            deleted: row.deleted === 1,
        };
    }
    /** Insert one concerns row (top-level or a discussion mention). */
    insertConcern(c) {
        this.db.prepare(`
      INSERT INTO concerns (id, parent_id, title, background, kind, status, ts, source_diary_ids, context, deleted)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `).run(c.id, c.parentId ?? null, c.title, c.background ?? '', c.kind ?? null, c.status ?? null, c.ts, JSON.stringify(c.sourceDiaryIds), c.context ?? '', c.deleted ? 1 : 0);
    }
    /**
     * Top-level concerns (newest first) each with its discussion loop (oldest
     * first). Optional kind/status filter + limit/offset pagination over the
     * top-level rows; a mention set is attached for every returned top-level.
     */
    listConcernTrees(filter, limit, offset) {
        const where = ['parent_id IS NULL', 'deleted = 0'];
        const params = [];
        if (filter.kind !== undefined && filter.kind !== '') {
            where.push('kind = ?');
            params.push(filter.kind);
        }
        if (filter.status !== undefined && filter.status !== '') {
            where.push('status = ?');
            params.push(filter.status);
        }
        let sql = `SELECT * FROM concerns WHERE ${where.join(' AND ')} ORDER BY ts DESC`;
        if (limit !== undefined) {
            sql += ' LIMIT ? OFFSET ?';
            params.push(limit, offset ?? 0);
        }
        const tops = this.db.prepare(sql).all(...params);
        const mentions = this.db.prepare('SELECT * FROM concerns WHERE parent_id IS NOT NULL AND deleted = 0 ORDER BY ts ASC').all();
        const byParent = new Map();
        for (const m of mentions) {
            const list = byParent.get(m.parent_id) ?? [];
            list.push(this.rowToConcern(m));
            byParent.set(m.parent_id, list);
        }
        return tops.map(t => ({ concern: this.rowToConcern(t), mentions: byParent.get(t.id) ?? [] }));
    }
    /** Count top-level (non-deleted) concerns matching the optional kind/status filter. */
    listConcernsCount(filter) {
        const where = ['parent_id IS NULL', 'deleted = 0'];
        const params = [];
        if (filter.kind !== undefined && filter.kind !== '') {
            where.push('kind = ?');
            params.push(filter.kind);
        }
        if (filter.status !== undefined && filter.status !== '') {
            where.push('status = ?');
            params.push(filter.status);
        }
        const row = this.db.prepare(`SELECT COUNT(*) AS n FROM concerns WHERE ${where.join(' AND ')}`).get(...params);
        return row.n;
    }
    /** Update a top-level concern's lifecycle status. */
    setConcernStatus(id, status) {
        this.db.prepare('UPDATE concerns SET status = ? WHERE id = ? AND parent_id IS NULL').run(status, id);
    }
    /** Tombstone a concern and its whole discussion loop (human-only cleanup). */
    deleteConcernSubtree(id) {
        this.db.prepare('UPDATE concerns SET deleted = 1 WHERE id = ? OR parent_id = ?').run(id, id);
    }
    // ── extractions + recall telemetry ────────────────────────────────────────
    /** Record one extraction run. */
    insertExtraction(record) {
        this.db.prepare(`
      INSERT INTO extractions (id, ts, trigger, summary, produced_fact_ids, diary_count)
      VALUES (?,?,?,?,?,?)
    `).run(record.id, record.ts, record.trigger, record.summary, JSON.stringify(record.producedFactIds), record.diaryCount);
    }
    /** Extraction runs, newest first (008 §3: server-side pagination). */
    listExtractions(limit, offset) {
        const rows = this.db.prepare('SELECT * FROM extractions ORDER BY ts DESC, rowid DESC LIMIT ? OFFSET ?').all(limit, offset);
        return rows.map(row => ({
            id: row.id,
            ts: row.ts,
            trigger: row.trigger,
            summary: row.summary,
            producedFactIds: JSON.parse(row.produced_fact_ids),
            diaryCount: row.diary_count,
        }));
    }
    /** Total extraction runs (008 §3: pagination count). */
    extractionCount() {
        const row = this.db.prepare('SELECT COUNT(*) AS n FROM extractions').get();
        return row.n;
    }
    /** Last extraction ts (cadence gate). */
    lastExtractionTs() {
        const row = this.db.prepare('SELECT MAX(ts) AS ts FROM extractions').get();
        return row.ts ?? 0;
    }
    // ── consolidation log (008 §1) ────────────────────────────────────────────
    /** Record one consolidation run (which experiences merged into which). */
    recordConsolidation(record) {
        this.db.prepare('INSERT INTO consolidations (id, ts, merged_ids, produced_id, note) VALUES (?,?,?,?,?)')
            .run(record.id, record.ts, JSON.stringify(record.mergedIds), record.producedId, record.note);
    }
    /** Last consolidation ts (interval cadence gate; 0 = never consolidated). */
    lastConsolidationTs() {
        const row = this.db.prepare('SELECT MAX(ts) AS ts FROM consolidations').get();
        return row.ts ?? 0;
    }
    /** Non-deleted experiences created strictly after `ts` (new material since last consolidation). */
    countExperiencesSince(ts) {
        const row = this.db.prepare('SELECT COUNT(*) AS n FROM experiences WHERE deleted = 0 AND created_at > ?').get(ts);
        return row.n;
    }
    // ── deletion-feedback summarization (P1-2) ────────────────────────────────
    /** Last deletion-feedback summarization ts (0 = never). Stored in memory_meta. */
    lastDeletionFeedbackTs() {
        const row = this.db.prepare("SELECT value FROM memory_meta WHERE key = 'last_deletion_feedback_ts'").get();
        return row ? Number(row.value) : 0;
    }
    /** Record the timestamp of a deletion-feedback summarization run. */
    setLastDeletionFeedbackTs(ts) {
        this.db.prepare("INSERT OR REPLACE INTO memory_meta (key, value) VALUES ('last_deletion_feedback_ts', ?)").run(String(ts));
    }
    /** Count experience deletions (ledger op='delete', objectType='experience') since a given ts. */
    countDeletionsSince(ts) {
        const row = this.db.prepare("SELECT COUNT(*) AS n FROM ledger WHERE op = 'delete' AND object_type = 'experience' AND ts > ?").get(ts);
        return row.n;
    }
    /** Get the deletion ledger blocks since a given ts (for LLM summarization input). */
    getDeletionRecordsSince(ts, limit = 50) {
        const rows = this.db.prepare("SELECT seq, ts, object_id, reason, payload FROM ledger WHERE op = 'delete' AND object_type = 'experience' AND ts > ? ORDER BY ts DESC LIMIT ?").all(ts, limit);
        return rows.map(r => {
            let gist = '';
            try {
                const p = JSON.parse(r.payload);
                gist = p.gist ?? '';
            }
            catch { /* ignore parse errors */ }
            return { seq: r.seq, ts: r.ts, objectId: r.object_id, reason: r.reason ?? '', gist };
        });
    }
    /** Find the active (non-deleted) experience by family name. Returns the latest revision. */
    findExperienceByFamily(family) {
        const row = this.db.prepare("SELECT * FROM experiences WHERE family = ? AND deleted = 0 ORDER BY revision DESC LIMIT 1").get(family);
        return row ? this.rowToExperience(row) : undefined;
    }
    /** Archive a set of experiences by family_id (leave recall; recoverable — never hard-deleted autonomously). */
    archiveExperienceIds(ids, ts) {
        const stmt = this.db.prepare(`UPDATE experiences SET status = ?, updated_at = ? WHERE family_id = ? AND deleted = 0 AND status IN ('candidate','live','challenged')`);
        for (const id of ids)
            stmt.run('archived', ts, id);
    }
    /** Record one recall event. */
    insertRecallEvent(event) {
        this.db.prepare('INSERT INTO recall_events (id, ts, situation, injected_ids, none, context) VALUES (?,?,?,?,?,?)')
            .run(event.id, event.ts, event.situation, JSON.stringify(event.injectedIds), event.none ? 1 : 0, event.context ?? '');
    }
    /** Recall telemetry counters. */
    recallCounts() {
        const events = this.db.prepare('SELECT COUNT(*) AS n FROM recall_events').get();
        const negative = this.db.prepare('SELECT COUNT(*) AS n FROM recall_events WHERE none = 1').get();
        return { events: events.n, negative: negative.n };
    }
    /** All recall events (export). */
    allRecallEvents() {
        const rows = this.db.prepare('SELECT * FROM recall_events ORDER BY ts ASC').all();
        return rows.map(row => ({
            id: row.id,
            ts: row.ts,
            situation: row.situation,
            injectedIds: JSON.parse(row.injected_ids),
            none: row.none === 1,
            context: row.context ?? '',
        }));
    }
    // ── row mapping ───────────────────────────────────────────────────────────
    rowToExperience(row) {
        const alpha = row.alpha;
        const beta = row.beta;
        const snapshot = {
            id: row.family_id,
            revision: row.revision,
            kind: row.kind,
            source: row.source,
            family: row.family,
            gist: row.gist,
            situation: JSON.parse(row.situation),
            path: JSON.parse(row.path),
            reasoning: row.reasoning,
            limits: JSON.parse(row.limits),
            status: row.status,
            alpha,
            beta,
            samples: alpha + beta,
            trust: (alpha + 1) / (alpha + beta + 2),
            weightedTrust: this.weightedTrust(row.family_id, row.revision, Date.now()),
            pinned: row.pinned === 1,
            tokensSaved: row.tokens_saved,
            tokensSpent: row.tokens_spent,
            context: row.context,
            verifiedCount: row.verified_count,
            rejectCount: row.reject_count,
            globalFlag: row.global_flag === 1,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
        if (row.last_verified_at !== null)
            snapshot.lastVerifiedAt = row.last_verified_at;
        if (row.parent_revision !== null)
            snapshot.parentRevision = row.parent_revision;
        if (row.failure_reason !== null)
            snapshot.failureReason = row.failure_reason;
        if (row.evidence !== null)
            snapshot.evidence = JSON.parse(row.evidence);
        if (row.challenge_reason !== null)
            snapshot.challengeReason = row.challenge_reason;
        return snapshot;
    }
    rowToReport(row) {
        const report = {
            id: row.id,
            experienceId: row.experience_id,
            revision: row.revision,
            outcome: row.outcome,
            attribution: row.attribution,
            counted: row.counted,
            evidence: row.evidence === null ? undefined : JSON.parse(row.evidence),
            dedupeKey: row.dedupe_key === null ? undefined : row.dedupe_key,
            ts: row.ts,
        };
        return report;
    }
    rowToLedger(row) {
        const block = {
            seq: row.seq,
            ts: row.ts,
            op: row.op,
            objectType: row.object_type,
            objectId: row.object_id,
            actor: row.actor,
            payload: row.payload,
            prevHash: row.prev_hash,
            hash: row.hash,
        };
        if (row.reason !== null)
            block.reason = row.reason;
        return block;
    }
    rowToDiary(row) {
        const entry = {
            id: row.id,
            ts: row.ts,
            kind: row.kind,
            content: row.content,
            tags: JSON.parse(row.tags),
            extracted: row.extracted === 1,
        };
        if (row.session_ref !== null)
            entry.sessionRef = row.session_ref;
        return entry;
    }
    rowToFact(row) {
        const fact = {
            id: row.id,
            category: row.category,
            factKey: row.fact_key,
            value: row.value,
            origin: row.origin,
            sourceDiaryIds: JSON.parse(row.source_diary_ids),
            corroboration: row.corroboration,
            validFrom: row.valid_from,
            recordedAt: row.recorded_at,
            locked: row.locked === 1,
            deleted: row.deleted === 1,
            conflictPending: row.conflict_pending === 1,
        };
        if (row.valid_to !== null)
            fact.validTo = row.valid_to;
        if (row.superseded_by !== null)
            fact.supersededBy = row.superseded_by;
        return fact;
    }
    // ── skill artifacts (P2) ──────────────────────────────────────────────────
    /** Insert or update a skill artifact. */
    upsertSkillArtifact(artifact) {
        this.db.prepare(`
      INSERT INTO skill_artifacts (id, parent_experience_id, form, status, draft_path, published_path,
        version, use_count, optimize_count, last_feedback, content_hash, created_at, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET
        status=excluded.status, draft_path=excluded.draft_path, published_path=excluded.published_path,
        version=excluded.version, use_count=excluded.use_count, optimize_count=excluded.optimize_count,
        last_feedback=excluded.last_feedback, content_hash=excluded.content_hash, updated_at=excluded.updated_at
    `).run(artifact.id, artifact.parentExperienceId, artifact.form, artifact.status, artifact.draftPath ?? null, artifact.publishedPath ?? null, artifact.version, artifact.useCount, artifact.optimizeCount, artifact.lastFeedback ?? null, artifact.contentHash ?? null, artifact.createdAt, artifact.updatedAt);
    }
    /** Get a skill artifact by id. */
    getSkillArtifact(id) {
        const row = this.db.prepare('SELECT * FROM skill_artifacts WHERE id = ?').get(id);
        return row ? this.rowToSkillArtifact(row) : undefined;
    }
    /** List skill artifacts, optionally filtered by parent experience or status. */
    listSkillArtifacts(filter) {
        const clauses = ['1 = 1'];
        const params = [];
        if (filter?.parentExperienceId !== undefined) {
            clauses.push('parent_experience_id = ?');
            params.push(filter.parentExperienceId);
        }
        if (filter?.status !== undefined) {
            clauses.push('status = ?');
            params.push(filter.status);
        }
        const rows = this.db.prepare(`SELECT * FROM skill_artifacts WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC`).all(...params);
        return rows.map(r => this.rowToSkillArtifact(r));
    }
    /** Count skill artifacts by status. */
    countSkillArtifacts(status) {
        if (status === undefined) {
            const row = this.db.prepare('SELECT COUNT(*) AS n FROM skill_artifacts').get();
            return row.n;
        }
        const row = this.db.prepare('SELECT COUNT(*) AS n FROM skill_artifacts WHERE status = ?').get(status);
        return row.n;
    }
    rowToSkillArtifact(row) {
        const artifact = {
            id: row.id,
            parentExperienceId: row.parent_experience_id,
            form: row.form,
            status: row.status,
            version: row.version,
            useCount: row.use_count,
            optimizeCount: row.optimize_count,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
        if (row.draft_path !== null)
            artifact.draftPath = row.draft_path;
        if (row.published_path !== null)
            artifact.publishedPath = row.published_path;
        if (row.last_feedback !== null)
            artifact.lastFeedback = row.last_feedback;
        if (row.content_hash !== null)
            artifact.contentHash = row.content_hash;
        return artifact;
    }
}
//# sourceMappingURL=store.js.map