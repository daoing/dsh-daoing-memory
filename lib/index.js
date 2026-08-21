import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createHash, randomUUID } from "node:crypto";
import { Remote, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
//#region lib/types/store.js
/**
* Memory store: durable SQLite persistence for the experience lifecycle,
* use reports, diary, facts, extractions, recall telemetry, and the
* append-only hash-chained ledger. Uses node:sqlite (DatabaseSync) so the
* library runs with zero external services.
* @module dsh-daoing-memory/store
*/
/** Monotone store schema version. v1→v2 is an additive ALTER migration (see open()). */
const MEMORY_SCHEMA_VERSION = 5;
/** Half-life (ms) of the recency weighting applied to verification samples. */
const TRUST_HALF_LIFE_MS = 4320 * 60 * 60 * 1e3;
/** Hash one ledger block's content, chained to the previous hash. */
function blockHash(ts, op, objectType, objectId, actor, payload, prevHash) {
	const body = JSON.stringify({
		ts,
		op,
		objectType,
		objectId,
		actor,
		payload,
		prevHash
	});
	return createHash("sha256").update(body).digest("hex").slice(0, 24);
}
/** Tokenize into latin words + CJK bigrams so Chinese situations match. */
function tokenize(text) {
	const lower = text.toLowerCase();
	const latin = lower.match(/[a-z0-9_]+/g) ?? [];
	const cjk = lower.match(/[\u4e00-\u9fff]+/g) ?? [];
	const bigrams = [];
	for (const seg of cjk) {
		if (seg.length === 1) bigrams.push(seg);
		for (let i = 0; i < seg.length - 1; i++) bigrams.push(seg.slice(i, i + 2));
	}
	return [...latin, ...bigrams];
}
/** Rough token estimate for injection budgeting (CJK-heavy text). */
function estimateTokens(text) {
	const cjk = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
	const rest = text.length - cjk;
	return Math.ceil(cjk * .6 + rest / 4);
}
/** The durable store behind the memory core. */
var MemoryStore = class {
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
		const row = db.prepare("SELECT value FROM memory_meta WHERE key = ?").get("schema_version");
		if (row === void 0) db.prepare("INSERT INTO memory_meta (key, value) VALUES (?, ?)").run("schema_version", String(5));
		else {
			let v = Number(row.value);
			if (v === 1) {
				db.exec(`
          ALTER TABLE experiences ADD COLUMN context TEXT NOT NULL DEFAULT '';
          ALTER TABLE experiences ADD COLUMN verified_count INTEGER NOT NULL DEFAULT 0;
          ALTER TABLE experiences ADD COLUMN reject_count INTEGER NOT NULL DEFAULT 0;
          ALTER TABLE experiences ADD COLUMN global_flag INTEGER NOT NULL DEFAULT 0;
          ALTER TABLE recall_events ADD COLUMN context TEXT NOT NULL DEFAULT '';
        `);
				v = 2;
			}
			if (v === 2 && true) v = 3;
			if (v === 3 && true) v = 4;
			if (v === 4 && true) {
				db.exec(`ALTER TABLE concerns ADD COLUMN background TEXT NOT NULL DEFAULT '';`);
				v = 5;
			}
			if (v !== 5) throw new Error(`memory store schema version ${row.value} does not match 5; refusing to open`);
			db.prepare("UPDATE memory_meta SET value = ? WHERE key = ?").run(String(5), "schema_version");
		}
		db.exec("CREATE INDEX IF NOT EXISTS idx_exp_context ON experiences (context);");
		db.exec("CREATE INDEX IF NOT EXISTS idx_concern_parent ON concerns (parent_id);");
	}
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
    `).run(s.id, s.revision, s.kind, s.source, s.family, s.gist, JSON.stringify(s.situation), JSON.stringify(s.path), s.reasoning, JSON.stringify(s.limits), s.status, s.alpha, s.beta, s.lastVerifiedAt ?? null, s.pinned ? 1 : 0, s.tokensSaved, s.tokensSpent, s.parentRevision ?? null, s.failureReason ?? null, s.evidence === void 0 ? null : JSON.stringify(s.evidence), s.challengeReason ?? null, s.context ?? "", s.verifiedCount ?? 0, s.rejectCount ?? 0, s.globalFlag === true ? 1 : 0, s.createdAt, s.updatedAt);
	}
	/** Read one experience revision. */
	getExperience(familyId, revision) {
		const row = this.db.prepare("SELECT * FROM experiences WHERE family_id = ? AND revision = ? AND deleted = 0").get(familyId, revision);
		return row === void 0 ? void 0 : this.rowToExperience(row);
	}
	/** The active (non-superseded, non-deleted) revision of a family, if any. */
	getActiveRevision(familyId) {
		const row = this.db.prepare(`
      SELECT * FROM experiences
      WHERE family_id = ? AND deleted = 0 AND status IN ('candidate', 'live', 'challenged')
      ORDER BY revision DESC LIMIT 1
    `).get(familyId);
		return row === void 0 ? void 0 : this.rowToExperience(row);
	}
	/** All revisions of one family, oldest first. */
	getFamily(familyId) {
		return this.db.prepare("SELECT * FROM experiences WHERE family_id = ? AND deleted = 0 ORDER BY revision ASC").all(familyId).map((row) => this.rowToExperience(row));
	}
	/** List experience revisions by filter; live-ish first, best trust first. */
	listExperiences(filter) {
		const clauses = ["deleted = 0"];
		const params = [];
		if (filter.status !== void 0) {
			clauses.push("status = ?");
			params.push(filter.status);
		}
		if (filter.kind !== void 0) {
			clauses.push("kind = ?");
			params.push(filter.kind);
		}
		if (filter.family !== void 0) {
			clauses.push("family = ?");
			params.push(filter.family);
		}
		if (filter.context !== void 0) {
			clauses.push("context = ?");
			params.push(filter.context);
		}
		return this.db.prepare(`
      SELECT * FROM experiences WHERE ${clauses.join(" AND ")}
      ORDER BY CASE status WHEN 'live' THEN 0 WHEN 'candidate' THEN 1 WHEN 'challenged' THEN 2
                           WHEN 'cold' THEN 3 WHEN 'archived' THEN 4 ELSE 5 END,
               (alpha + 1.0) / (alpha + beta + 2.0) DESC,
               updated_at DESC
    `).all(...params).map((row) => this.rowToExperience(row));
	}
	/**
	* Recall candidates: token overlap against situation+gist+limits of the given
	* statuses, best overlap first. An optional context scopes the pool: only
	* same-context or globally-shared (global_flag) revisions qualify (006 §2).
	*/
	recallCandidates(queryTokens, topK, opts = {}) {
		const statuses = opts.statuses ?? ["live"];
		let sql = `
      SELECT * FROM experiences
      WHERE deleted = 0 AND status IN (${statuses.map(() => "?").join(", ")})
    `;
		const params = [...statuses];
		if (opts.context !== void 0 && opts.context !== "") {
			sql += " AND (context = ? OR global_flag = 1)";
			params.push(opts.context);
		}
		const rows = this.db.prepare(sql).all(...params);
		const scored = [];
		for (const row of rows) {
			const snapshot = this.rowToExperience(row);
			const hay = new Set(tokenize([
				snapshot.gist,
				...snapshot.situation,
				...snapshot.limits
			].join(" ")));
			if (hay.size === 0) continue;
			let hits = 0;
			for (const token of queryTokens) if (hay.has(token)) hits += 1;
			const score = hits / Math.sqrt(queryTokens.size * hay.size);
			if (score > 0) scored.push({
				snapshot,
				score
			});
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
		if (queryTokens.size === 0) return void 0;
		const sql = `
      SELECT * FROM experiences
      WHERE deleted = 0 AND status IN (${statuses.map(() => "?").join(", ")})
    `;
		const rows = this.db.prepare(sql).all(...statuses);
		let best;
		for (const row of rows) {
			const snapshot = this.rowToExperience(row);
			const hay = new Set(tokenize([snapshot.gist, ...snapshot.situation].join(" ")));
			if (hay.size === 0) continue;
			let hits = 0;
			for (const token of queryTokens) if (hay.has(token)) hits += 1;
			const score = hits / Math.sqrt(queryTokens.size * hay.size);
			if (best === void 0 || score > best.score) best = {
				snapshot,
				score
			};
		}
		return best;
	}
	/** Count live revisions in one family (capacity budget). */
	countFamilyActive(familyTag) {
		return this.db.prepare("SELECT COUNT(*) AS n FROM experiences WHERE family = ? AND status = 'live' AND deleted = 0").get(familyTag).n;
	}
	/** Mark one revision deleted (human delete tombstone). */
	deleteFamily(familyId) {
		this.db.prepare("UPDATE experiences SET deleted = 1, updated_at = ? WHERE family_id = ?").run(Date.now(), familyId);
	}
	/**
	* Insert one counted report; a repeated (family, revision, dedupeKey)
	* returns false instead of double-counting (idempotent use).
	*/
	insertReport(report) {
		try {
			this.db.prepare(`
        INSERT INTO use_reports (id, experience_id, revision, outcome, attribution, counted, evidence, dedupe_key, ts)
        VALUES (?,?,?,?,?,?,?,?,?)
      `).run(report.id, report.experienceId, report.revision, report.outcome, report.attribution, report.counted, report.evidence === void 0 ? null : JSON.stringify(report.evidence), report.dedupeKey ?? null, report.ts);
			return true;
		} catch (error) {
			if (error instanceof Error && error.message.includes("UNIQUE")) return false;
			throw error;
		}
	}
	/** Recent counted reports of one revision, newest first. */
	reportsFor(familyId, revision, limit) {
		return this.db.prepare(`
      SELECT * FROM use_reports WHERE experience_id = ? AND revision = ? AND counted != 'none'
      ORDER BY ts DESC LIMIT ?
    `).all(familyId, revision, limit).map((row) => this.rowToReport(row));
	}
	/** Every report row (export). */
	allReports() {
		return this.db.prepare("SELECT * FROM use_reports ORDER BY ts ASC").all().map((row) => this.rowToReport(row));
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
			const weight = Math.pow(.5, (now - row.ts) / TRUST_HALF_LIFE_MS);
			if (row.counted === "alpha") alpha += weight;
			else beta += weight;
		}
		return (alpha + 1) / (alpha + beta + 2);
	}
	/** Append one block, chaining the hash; returns the stored block. */
	appendLedger(block) {
		const hash = blockHash(block.ts, block.op, block.objectType, block.objectId, block.actor, block.payload, block.prevHash);
		const info = this.db.prepare(`
      INSERT INTO ledger (ts, op, object_type, object_id, actor, reason, payload, prev_hash, hash)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).run(block.ts, block.op, block.objectType, block.objectId, block.actor, block.reason ?? null, block.payload, block.prevHash, hash);
		return {
			...block,
			seq: Number(info.lastInsertRowid),
			hash
		};
	}
	/** The newest block's hash ('' when the ledger is empty). */
	ledgerHead() {
		return this.db.prepare("SELECT hash FROM ledger ORDER BY seq DESC LIMIT 1").get()?.hash ?? "";
	}
	/** Ledger blocks, newest first, optionally filtered. */
	ledgerQuery(filter) {
		const { clauses, params } = this.ledgerFilterClauses(filter);
		params.push(filter.limit);
		let sql = `SELECT * FROM ledger WHERE ${clauses.join(" AND ")} ORDER BY seq DESC LIMIT ?`;
		if (filter.offset !== void 0 && filter.offset > 0) {
			sql += " OFFSET ?";
			params.push(filter.offset);
		}
		return this.db.prepare(sql).all(...params).map((row) => this.rowToLedger(row));
	}
	/** Shared WHERE-builder for the ledger query and its filtered count. */
	ledgerFilterClauses(filter) {
		const clauses = ["1 = 1"];
		const params = [];
		if (filter.objectType !== void 0) {
			clauses.push("object_type = ?");
			params.push(filter.objectType);
		}
		if (filter.objectId !== void 0) {
			clauses.push("object_id = ?");
			params.push(filter.objectId);
		}
		if (filter.op !== void 0) {
			clauses.push("op = ?");
			params.push(filter.op);
		}
		if (filter.seqFrom !== void 0) {
			clauses.push("seq >= ?");
			params.push(filter.seqFrom);
		}
		if (filter.seqTo !== void 0) {
			clauses.push("seq <= ?");
			params.push(filter.seqTo);
		}
		return {
			clauses,
			params
		};
	}
	/** Count ledger blocks matching a filter (for pagination, 007 §2). */
	ledgerQueryCount(filter) {
		const { clauses, params } = this.ledgerFilterClauses(filter);
		return this.db.prepare(`SELECT COUNT(*) AS n FROM ledger WHERE ${clauses.join(" AND ")}`).get(...params).n;
	}
	/** The complete ledger, oldest first (integrity checks + export). */
	ledgerAll() {
		return this.db.prepare("SELECT * FROM ledger ORDER BY seq ASC").all().map((row) => this.rowToLedger(row));
	}
	/** Total ledger block count. */
	ledgerCount() {
		return this.db.prepare("SELECT COUNT(*) AS n FROM ledger").get().n;
	}
	/** Append one diary entry (append-only layer). */
	insertDiary(entry) {
		this.db.prepare(`
      INSERT INTO diary (id, ts, kind, content, session_ref, tags, extracted)
      VALUES (?,?,?,?,?,?,?)
    `).run(entry.id, entry.ts, entry.kind, entry.content, entry.sessionRef ?? null, JSON.stringify(entry.tags), entry.extracted ? 1 : 0);
	}
	/** Diary entries, newest first. */
	listDiary(limit, offset, onlyUnextracted) {
		const where = onlyUnextracted ? "WHERE extracted = 0" : "";
		return this.db.prepare(`SELECT * FROM diary ${where} ORDER BY ts DESC, rowid DESC LIMIT ? OFFSET ?`).all(limit, offset).map((row) => this.rowToDiary(row));
	}
	/** Unextracted entries, oldest first (the extraction window). */
	unextractedDiary() {
		return this.db.prepare("SELECT * FROM diary WHERE extracted = 0 ORDER BY ts ASC").all().map((row) => this.rowToDiary(row));
	}
	/** Mark diary entries extracted. */
	markDiaryExtracted(ids) {
		const stmt = this.db.prepare("UPDATE diary SET extracted = 1 WHERE id = ?");
		for (const id of ids) stmt.run(id);
	}
	/** One diary entry by id. */
	getDiary(id) {
		const row = this.db.prepare("SELECT * FROM diary WHERE id = ?").get(id);
		return row === void 0 ? void 0 : this.rowToDiary(row);
	}
	/** Several diary entries by id, preserving the requested order (008 Path A: fact→diary provenance). */
	getDiaryByIds(ids) {
		const out = [];
		const stmt = this.db.prepare("SELECT * FROM diary WHERE id = ?");
		for (const id of ids) {
			const row = stmt.get(id);
			if (row !== void 0) out.push(this.rowToDiary(row));
		}
		return out;
	}
	/** Diary counters. */
	diaryCounts() {
		const total = this.db.prepare("SELECT COUNT(*) AS n FROM diary").get();
		const unextracted = this.db.prepare("SELECT COUNT(*) AS n FROM diary WHERE extracted = 0").get();
		return {
			total: total.n,
			unextracted: unextracted.n
		};
	}
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
		const row = this.db.prepare("SELECT * FROM facts WHERE category = ? AND fact_key = ? AND valid_to IS NULL AND deleted = 0 ORDER BY recorded_at DESC LIMIT 1").get(category, factKey);
		return row === void 0 ? void 0 : this.rowToFact(row);
	}
	/** One fact version by id. */
	getFact(id) {
		const row = this.db.prepare("SELECT * FROM facts WHERE id = ?").get(id);
		return row === void 0 ? void 0 : this.rowToFact(row);
	}
	/** Shared WHERE for fact filters (008 §3: reused by list + count). */
	factFilterClauses(filter) {
		const clauses = ["deleted = 0"];
		const params = [];
		if (!filter.includeHistory) clauses.push("valid_to IS NULL");
		if (filter.category !== void 0) {
			clauses.push("category = ?");
			params.push(filter.category);
		}
		return {
			where: clauses.join(" AND "),
			params
		};
	}
	/** Fact versions by filter (008 §3: server-side pagination). */
	listFacts(filter, limit, offset) {
		const { where, params } = this.factFilterClauses(filter);
		return this.db.prepare(`SELECT * FROM facts WHERE ${where} ORDER BY category, fact_key, recorded_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset).map((row) => this.rowToFact(row));
	}
	/** Count of facts matching the filter (008 §3: pagination total). */
	factFilteredCount(filter) {
		const { where, params } = this.factFilterClauses(filter);
		return this.db.prepare(`SELECT COUNT(*) AS n FROM facts WHERE ${where}`).get(...params).n;
	}
	/** All fact versions including tombstones (export). */
	allFacts() {
		return this.db.prepare("SELECT * FROM facts ORDER BY recorded_at ASC").all().map((row) => this.rowToFact(row));
	}
	/** Fact counters. */
	factCounts() {
		const q = (where) => this.db.prepare(`SELECT COUNT(*) AS n FROM facts WHERE ${where}`).get().n;
		return {
			total: q("deleted = 0"),
			current: q("valid_to IS NULL AND deleted = 0"),
			locked: q("valid_to IS NULL AND deleted = 0 AND locked = 1"),
			conflictPending: q("valid_to IS NULL AND deleted = 0 AND conflict_pending = 1")
		};
	}
	rowToConcern(row) {
		return {
			id: row.id,
			...row.parent_id === null ? {} : { parentId: row.parent_id },
			title: row.title,
			...row.background === "" ? {} : { background: row.background },
			...row.kind === null ? {} : { kind: row.kind },
			...row.status === null ? {} : { status: row.status },
			ts: row.ts,
			sourceDiaryIds: JSON.parse(row.source_diary_ids),
			...row.context === "" ? {} : { context: row.context },
			deleted: row.deleted === 1
		};
	}
	/** Insert one concerns row (top-level or a discussion mention). */
	insertConcern(c) {
		this.db.prepare(`
      INSERT INTO concerns (id, parent_id, title, background, kind, status, ts, source_diary_ids, context, deleted)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `).run(c.id, c.parentId ?? null, c.title, c.background ?? "", c.kind ?? null, c.status ?? null, c.ts, JSON.stringify(c.sourceDiaryIds), c.context ?? "", c.deleted ? 1 : 0);
	}
	/**
	* Top-level concerns (newest first) each with its discussion loop (oldest
	* first). Optional kind/status filter + limit/offset pagination over the
	* top-level rows; a mention set is attached for every returned top-level.
	*/
	listConcernTrees(filter, limit, offset) {
		const where = ["parent_id IS NULL", "deleted = 0"];
		const params = [];
		if (filter.kind !== void 0 && filter.kind !== "") {
			where.push("kind = ?");
			params.push(filter.kind);
		}
		if (filter.status !== void 0 && filter.status !== "") {
			where.push("status = ?");
			params.push(filter.status);
		}
		let sql = `SELECT * FROM concerns WHERE ${where.join(" AND ")} ORDER BY ts DESC`;
		if (limit !== void 0) {
			sql += " LIMIT ? OFFSET ?";
			params.push(limit, offset ?? 0);
		}
		const tops = this.db.prepare(sql).all(...params);
		const mentions = this.db.prepare("SELECT * FROM concerns WHERE parent_id IS NOT NULL AND deleted = 0 ORDER BY ts ASC").all();
		const byParent = /* @__PURE__ */ new Map();
		for (const m of mentions) {
			const list = byParent.get(m.parent_id) ?? [];
			list.push(this.rowToConcern(m));
			byParent.set(m.parent_id, list);
		}
		return tops.map((t) => ({
			concern: this.rowToConcern(t),
			mentions: byParent.get(t.id) ?? []
		}));
	}
	/** Count top-level (non-deleted) concerns matching the optional kind/status filter. */
	listConcernsCount(filter) {
		const where = ["parent_id IS NULL", "deleted = 0"];
		const params = [];
		if (filter.kind !== void 0 && filter.kind !== "") {
			where.push("kind = ?");
			params.push(filter.kind);
		}
		if (filter.status !== void 0 && filter.status !== "") {
			where.push("status = ?");
			params.push(filter.status);
		}
		return this.db.prepare(`SELECT COUNT(*) AS n FROM concerns WHERE ${where.join(" AND ")}`).get(...params).n;
	}
	/** Update a top-level concern's lifecycle status. */
	setConcernStatus(id, status) {
		this.db.prepare("UPDATE concerns SET status = ? WHERE id = ? AND parent_id IS NULL").run(status, id);
	}
	/** Tombstone a concern and its whole discussion loop (human-only cleanup). */
	deleteConcernSubtree(id) {
		this.db.prepare("UPDATE concerns SET deleted = 1 WHERE id = ? OR parent_id = ?").run(id, id);
	}
	/** Record one extraction run. */
	insertExtraction(record) {
		this.db.prepare(`
      INSERT INTO extractions (id, ts, trigger, summary, produced_fact_ids, diary_count)
      VALUES (?,?,?,?,?,?)
    `).run(record.id, record.ts, record.trigger, record.summary, JSON.stringify(record.producedFactIds), record.diaryCount);
	}
	/** Extraction runs, newest first (008 §3: server-side pagination). */
	listExtractions(limit, offset) {
		return this.db.prepare("SELECT * FROM extractions ORDER BY ts DESC, rowid DESC LIMIT ? OFFSET ?").all(limit, offset).map((row) => ({
			id: row.id,
			ts: row.ts,
			trigger: row.trigger,
			summary: row.summary,
			producedFactIds: JSON.parse(row.produced_fact_ids),
			diaryCount: row.diary_count
		}));
	}
	/** Total extraction runs (008 §3: pagination count). */
	extractionCount() {
		return this.db.prepare("SELECT COUNT(*) AS n FROM extractions").get().n;
	}
	/** Last extraction ts (cadence gate). */
	lastExtractionTs() {
		return this.db.prepare("SELECT MAX(ts) AS ts FROM extractions").get().ts ?? 0;
	}
	/** Record one consolidation run (which experiences merged into which). */
	recordConsolidation(record) {
		this.db.prepare("INSERT INTO consolidations (id, ts, merged_ids, produced_id, note) VALUES (?,?,?,?,?)").run(record.id, record.ts, JSON.stringify(record.mergedIds), record.producedId, record.note);
	}
	/** Last consolidation ts (interval cadence gate; 0 = never consolidated). */
	lastConsolidationTs() {
		return this.db.prepare("SELECT MAX(ts) AS ts FROM consolidations").get().ts ?? 0;
	}
	/** Non-deleted experiences created strictly after `ts` (new material since last consolidation). */
	countExperiencesSince(ts) {
		return this.db.prepare("SELECT COUNT(*) AS n FROM experiences WHERE deleted = 0 AND created_at > ?").get(ts).n;
	}
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
		return this.db.prepare("SELECT COUNT(*) AS n FROM ledger WHERE op = 'delete' AND object_type = 'experience' AND ts > ?").get(ts).n;
	}
	/** Get the deletion ledger blocks since a given ts (for LLM summarization input). */
	getDeletionRecordsSince(ts, limit = 50) {
		return this.db.prepare("SELECT seq, ts, object_id, reason, payload FROM ledger WHERE op = 'delete' AND object_type = 'experience' AND ts > ? ORDER BY ts DESC LIMIT ?").all(ts, limit).map((r) => {
			let gist = "";
			try {
				gist = JSON.parse(r.payload).gist ?? "";
			} catch {}
			return {
				seq: r.seq,
				ts: r.ts,
				objectId: r.object_id,
				reason: r.reason ?? "",
				gist
			};
		});
	}
	/** Find the active (non-deleted) experience by family name. Returns the latest revision. */
	findExperienceByFamily(family) {
		const row = this.db.prepare("SELECT * FROM experiences WHERE family = ? AND deleted = 0 ORDER BY revision DESC LIMIT 1").get(family);
		return row ? this.rowToExperience(row) : void 0;
	}
	/** Archive a set of experiences by family_id (leave recall; recoverable — never hard-deleted autonomously). */
	archiveExperienceIds(ids, ts) {
		const stmt = this.db.prepare(`UPDATE experiences SET status = ?, updated_at = ? WHERE family_id = ? AND deleted = 0 AND status IN ('candidate','live','challenged')`);
		for (const id of ids) stmt.run("archived", ts, id);
	}
	/** Record one recall event. */
	insertRecallEvent(event) {
		this.db.prepare("INSERT INTO recall_events (id, ts, situation, injected_ids, none, context) VALUES (?,?,?,?,?,?)").run(event.id, event.ts, event.situation, JSON.stringify(event.injectedIds), event.none ? 1 : 0, event.context ?? "");
	}
	/** Recall telemetry counters. */
	recallCounts() {
		const events = this.db.prepare("SELECT COUNT(*) AS n FROM recall_events").get();
		const negative = this.db.prepare("SELECT COUNT(*) AS n FROM recall_events WHERE none = 1").get();
		return {
			events: events.n,
			negative: negative.n
		};
	}
	/** All recall events (export). */
	allRecallEvents() {
		return this.db.prepare("SELECT * FROM recall_events ORDER BY ts ASC").all().map((row) => ({
			id: row.id,
			ts: row.ts,
			situation: row.situation,
			injectedIds: JSON.parse(row.injected_ids),
			none: row.none === 1,
			context: row.context ?? ""
		}));
	}
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
			updatedAt: row.updated_at
		};
		if (row.last_verified_at !== null) snapshot.lastVerifiedAt = row.last_verified_at;
		if (row.parent_revision !== null) snapshot.parentRevision = row.parent_revision;
		if (row.failure_reason !== null) snapshot.failureReason = row.failure_reason;
		if (row.evidence !== null) snapshot.evidence = JSON.parse(row.evidence);
		if (row.challenge_reason !== null) snapshot.challengeReason = row.challenge_reason;
		return snapshot;
	}
	rowToReport(row) {
		return {
			id: row.id,
			experienceId: row.experience_id,
			revision: row.revision,
			outcome: row.outcome,
			attribution: row.attribution,
			counted: row.counted,
			evidence: row.evidence === null ? void 0 : JSON.parse(row.evidence),
			dedupeKey: row.dedupe_key === null ? void 0 : row.dedupe_key,
			ts: row.ts
		};
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
			hash: row.hash
		};
		if (row.reason !== null) block.reason = row.reason;
		return block;
	}
	rowToDiary(row) {
		const entry = {
			id: row.id,
			ts: row.ts,
			kind: row.kind,
			content: row.content,
			tags: JSON.parse(row.tags),
			extracted: row.extracted === 1
		};
		if (row.session_ref !== null) entry.sessionRef = row.session_ref;
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
			conflictPending: row.conflict_pending === 1
		};
		if (row.valid_to !== null) fact.validTo = row.valid_to;
		if (row.superseded_by !== null) fact.supersededBy = row.superseded_by;
		return fact;
	}
};
//#endregion
//#region lib/types/types.js
/**
* Memory system wire vocabulary: experience lifecycle, recall adjudication,
* use reports with attribution, the diary/fact semantic layer, and the
* append-only ledger. Types only — no runtime code.
* @module dsh-daoing-memory/types
*/
/**
* System-managed experience families that cannot be deleted by human operators
* (only archived). The extraction-feedback family is auto-generated by the
* daily deletion-reason summarizer and serves as negative guidance for future
* memory extraction.
*/
const SYSTEM_EXPERIENCE_FAMILIES = new Set(["extraction-feedback"]);
/** Check whether an experience family is system-managed (delete-protected). */
function isSystemExperienceFamily(family) {
	return SYSTEM_EXPERIENCE_FAMILIES.has(family);
}
//#endregion
//#region lib/types/core.js
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
/** The mechanism defaults (005 mapping documented in the README). */
const DEFAULT_CORE_CONFIG = {
	diaryExtractEvery: 8,
	diaryExtractIntervalHours: 12,
	recallTopK: 6,
	injectionBudgetTokens: 1200,
	challengeConsecutiveFails: 2,
	challengeWindow: 6,
	challengeWindowFailRate: .6,
	familyLiveCap: 12,
	complexityTokenGate: 4e3,
	complexityStepGate: 6,
	duplicateOverlapGate: .85,
	recallFloorScore: .1,
	shadowPassRate: .8,
	humanFloorAlpha: 5,
	humanFloorBeta: 2,
	pinnedTrustFloor: .67,
	candidateTrialTopK: 3,
	candidateTrialFloorScore: .18,
	consolidateEveryNew: 6,
	consolidateIntervalHours: 24,
	deletionFeedbackIntervalHours: 24,
	deletionFeedbackMinDeletions: 3
};
/** Objective-evidence markers overriding a claimed experience-attributed failure. */
const ENVIRONMENT_EVIDENCE_PATTERN = /network|timeout|timed out|EPERM|EACCES|ECONNREFUSED|ENOTFOUND|429|503|quota|rate.?limit|unauthorized|dns|proxy|网络|超时|断网|权限|配额|限流|服务不可用|服务繁忙/i;
/**
* Source-authority priors for the ingest channel (006 §1.3): a vetted skill or
* document starts a candidate with more trust than an unreviewed note. The prior
* only affects trust once the candidate is verified — candidates never recall.
*/
const INGEST_SOURCE_PRIOR = {
	skill: {
		alpha: 5,
		beta: 2
	},
	document: {
		alpha: 4,
		beta: 2
	},
	book: {
		alpha: 4,
		beta: 2
	},
	conversation: {
		alpha: 2,
		beta: 2
	},
	note: {
		alpha: 1,
		beta: 2
	},
	other: {
		alpha: 1,
		beta: 2
	}
};
/** Cosine-ish overlap of two token sets (for intra-batch dedup, 007). */
function tokenOverlap(a, b) {
	if (a.size === 0 || b.size === 0) return 0;
	let hits = 0;
	for (const t of a) if (b.has(t)) hits += 1;
	return hits / Math.sqrt(a.size * b.size);
}
/** The memory core: stateless over the injected store. */
var MemoryCore = class MemoryCore {
	store;
	config;
	/** @param store - the durable SQLite store. */
	/** @param config - resolved mechanism parameters. */
	constructor(store, config) {
		this.store = store;
		this.config = config;
	}
	ledger(op, objectType, objectId, actor, payload, reason) {
		this.store.appendLedger({
			ts: Date.now(),
			op,
			objectType,
			objectId,
			actor,
			payload: JSON.stringify(payload),
			prevHash: this.store.ledgerHead(),
			...reason === void 0 ? {} : { reason }
		});
	}
	/** 生: refine one completed trajectory into a candidate (dual gate). */
	refine(request, actor) {
		if (!((request.evidence.traceRef ?? "").trim() !== "" || (request.evidence.sessionRef ?? "").trim() !== "" || (request.evidence.note ?? "").trim() !== "")) return {
			accepted: false,
			reason: "rejected-evidence: every assertion needs an episodic evidence pointer (traceRef/sessionRef/note)"
		};
		if (request.kind === "negative" && (request.failureReason ?? "").trim() === "") return {
			accepted: false,
			reason: "rejected-schema: negative experiences must carry the confirmed failureReason"
		};
		const c = request.complexity;
		if (!(request.humanMarked === true || c.hadFailure === true || (c.tokens ?? 0) >= this.config.complexityTokenGate || (c.steps ?? 0) >= this.config.complexityStepGate)) return {
			accepted: false,
			reason: `rejected-complexity: trajectory below both gates (tokens < ${String(this.config.complexityTokenGate)}, steps < ${String(this.config.complexityStepGate)}, no failure, not human-marked)`
		};
		const dedupTokens = new Set(tokenize([request.gist, ...request.situation].join(" ")));
		const near = this.store.findNearDuplicate(dedupTokens, [
			"candidate",
			"live",
			"challenged",
			"archived",
			"cold"
		]);
		if (near !== void 0 && near.score >= this.config.duplicateOverlapGate) {
			this.ledger("corroborate", "experience", near.snapshot.id, actor, {
				family: request.family,
				gist: request.gist,
				score: near.score
			});
			return {
				accepted: false,
				reason: "rejected-information-gain: near-duplicate of an existing experience; corroborated it instead",
				corroboratedId: near.snapshot.id
			};
		}
		const now = Date.now();
		const snapshot = {
			id: randomUUID(),
			revision: 1,
			kind: request.kind,
			source: "agent",
			family: request.family,
			gist: request.gist,
			situation: [...request.situation],
			path: [...request.path],
			reasoning: request.reasoning,
			limits: [...request.limits],
			status: "candidate",
			alpha: 0,
			beta: 0,
			samples: 0,
			trust: .5,
			weightedTrust: .5,
			pinned: false,
			tokensSaved: 0,
			tokensSpent: (request.complexity.tokens ?? 0) / 10,
			context: request.context ?? "",
			verifiedCount: 0,
			rejectCount: 0,
			globalFlag: false,
			evidence: request.evidence,
			createdAt: now,
			updatedAt: now
		};
		if (request.failureReason !== void 0) snapshot.failureReason = request.failureReason;
		this.store.upsertExperience(snapshot);
		this.ledger("refine", "experience", snapshot.id, actor, {
			kind: snapshot.kind,
			family: snapshot.family,
			revision: 1
		});
		return {
			accepted: true,
			experience: snapshot
		};
	}
	/**
	* 摄取归一: source-agnostic intake. Every extracted draft becomes an earned
	* candidate carrying provenance (sourceType + sourceRef), the source-authority
	* prior, and the declared context scope. Candidates never recall until verified.
	*/
	ingest(request, actor) {
		if ((request.sourceRef ?? "").trim() === "") throw new Error("memory: ingest requires a non-empty sourceRef provenance");
		const prior = INGEST_SOURCE_PRIOR[request.sourceType] ?? INGEST_SOURCE_PRIOR.other;
		const context = request.context ?? "";
		const accepted = [];
		const rejected = [];
		const acceptedDedup = [];
		for (const item of request.experiences) {
			if (item.kind === "negative" && (item.failureReason ?? "").trim() === "") {
				rejected.push({
					gist: item.gist,
					reason: "rejected-schema: negative experiences must carry the confirmed failureReason"
				});
				continue;
			}
			const dedupTokens = new Set(tokenize([item.gist, ...item.situation].join(" ")));
			const cross = this.store.findNearDuplicate(dedupTokens, [
				"candidate",
				"live",
				"challenged",
				"archived",
				"cold"
			]);
			if (cross !== void 0 && cross.score >= this.config.duplicateOverlapGate) {
				this.ledger("corroborate", "experience", cross.snapshot.id, actor, {
					family: item.family,
					gist: item.gist,
					score: cross.score,
					via: "ingest"
				});
				rejected.push({
					gist: item.gist,
					reason: "rejected-information-gain: near-duplicate of an existing experience; corroborated it instead"
				});
				continue;
			}
			if (acceptedDedup.some((prev) => tokenOverlap(dedupTokens, prev) >= this.config.duplicateOverlapGate)) {
				rejected.push({
					gist: item.gist,
					reason: "rejected-information-gain: near-duplicate of another item in this same ingest batch"
				});
				continue;
			}
			const now = Date.now();
			const snapshot = {
				id: randomUUID(),
				revision: 1,
				kind: item.kind,
				source: "agent",
				family: item.family,
				gist: item.gist,
				situation: [...item.situation],
				path: [...item.path],
				reasoning: item.reasoning,
				limits: [...item.limits],
				status: "candidate",
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
				updatedAt: now
			};
			if (item.failureReason !== void 0) snapshot.failureReason = item.failureReason;
			this.store.upsertExperience(snapshot);
			this.ledger("ingest", "experience", snapshot.id, actor, {
				kind: snapshot.kind,
				family: snapshot.family,
				sourceType: request.sourceType,
				sourceRef: request.sourceRef,
				...context === "" ? {} : { context },
				...request.note === void 0 ? {} : { note: request.note }
			});
			accepted.push(snapshot);
			acceptedDedup.push(dedupTokens);
		}
		return {
			accepted,
			rejected,
			sourcePrior: prior
		};
	}
	/** 用: recall → scope → adjudicate → budget → inject, plus the candidate probe channel. */
	recall(request, actor) {
		const topK = request.topK ?? this.config.recallTopK;
		const budget = request.budgetTokens ?? this.config.injectionBudgetTokens;
		const context = request.context ?? "";
		const queryTokens = new Set(tokenize(request.situation));
		let candidateTrials = [];
		if (request.includeTrials !== false && queryTokens.size > 0) candidateTrials = this.store.recallCandidates(queryTokens, this.config.candidateTrialTopK * 2, {
			statuses: ["candidate"],
			context
		}).filter((m) => m.score >= this.config.candidateTrialFloorScore).slice(0, this.config.candidateTrialTopK).map((m) => ({
			experience: m.snapshot,
			score: m.score
		}));
		const candidates = queryTokens.size === 0 ? [] : this.store.recallCandidates(queryTokens, topK * 3, {
			statuses: request.deep === true ? ["live", "archived"] : ["live"],
			context
		});
		const adjudicated = [];
		for (const { snapshot, score } of candidates) {
			if (score < this.config.recallFloorScore) continue;
			const conflicts = [];
			for (const limit of snapshot.limits) {
				const limitTokens = tokenize(limit);
				if (limitTokens.length === 0) continue;
				if (limitTokens.filter((token) => queryTokens.has(token)).length / limitTokens.length >= .5) conflicts.push(limit);
			}
			const verdict = conflicts.length > 0 ? "reference" : score >= .45 ? "direct" : score >= .22 ? "reference" : "clue";
			adjudicated.push({
				experience: snapshot,
				score,
				verdict,
				conflicts
			});
		}
		if (adjudicated.length === 0) {
			const none = {
				items: [],
				none: true,
				reason: "no relevant experience in the library for this situation",
				omitted: 0,
				estimatedTokens: 0,
				candidateTrials,
				consolidationDue: this.consolidationDue().due
			};
			this.store.insertRecallEvent({
				id: randomUUID(),
				ts: Date.now(),
				situation: request.situation,
				injectedIds: [],
				none: true,
				context
			});
			return none;
		}
		const ranked = [...adjudicated].sort((a, b) => {
			const value = (item) => {
				const trust = item.experience.pinned ? Math.max(item.experience.weightedTrust, this.config.pinnedTrustFloor) : item.experience.weightedTrust;
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
			injectedIds: items.map((item) => `${item.experience.id}@${String(item.experience.revision)}`),
			none: false,
			context
		});
		return {
			items,
			none: false,
			omitted,
			estimatedTokens: usedTokens,
			candidateTrials,
			consolidationDue: this.consolidationDue().due
		};
	}
	/** 用·验: one use outcome → Beta update, attribution, quarantine, gates. */
	report(request, actor) {
		const target = request.revision === void 0 ? this.store.getActiveRevision(request.id) : this.store.getExperience(request.id, request.revision);
		if (target === void 0) throw new Error(`memory: experience not found: ${request.id}`);
		const base = {
			snapshot: target,
			counted: "none",
			attributionApplied: "unknown",
			challenged: false,
			promoted: false,
			adopted: false
		};
		let attribution;
		let overrideNote;
		if (request.outcome === "success") attribution = "experience";
		else {
			const claimed = request.attribution ?? "unknown";
			const evidenceNote = request.evidence?.note ?? "";
			if (evidenceNote !== "" && ENVIRONMENT_EVIDENCE_PATTERN.test(evidenceNote)) {
				attribution = "environment";
				if (claimed !== "environment") overrideNote = "objective evidence indicates an environment failure; claim overridden";
			} else attribution = claimed;
			if (attribution === "experience" && evidenceNote.trim() === "") {
				if (target.status !== "candidate") {
					attribution = "unknown";
					overrideNote = "experience-attributed failure without evidence note: insufficient signal, not counted";
				}
			}
		}
		const counted = request.outcome === "success" ? "alpha" : attribution === "experience" ? "beta" : "none";
		if (!this.store.insertReport({
			id: randomUUID(),
			experienceId: target.id,
			revision: target.revision,
			outcome: request.outcome,
			attribution,
			counted,
			evidence: request.evidence,
			dedupeKey: request.dedupeKey,
			ts: Date.now()
		})) {
			if (overrideNote !== void 0) base.overrideNote = overrideNote;
			return base;
		}
		let next = {
			...target,
			updatedAt: Date.now()
		};
		if (counted === "alpha") next = {
			...next,
			alpha: next.alpha + 1,
			verifiedCount: next.verifiedCount + 1,
			lastVerifiedAt: Date.now()
		};
		else if (counted === "beta") {
			const isCandidateTrial = next.status === "candidate";
			next = {
				...next,
				beta: next.beta + 1,
				rejectCount: isCandidateTrial ? next.rejectCount + 1 : next.rejectCount,
				lastVerifiedAt: Date.now()
			};
		}
		next = {
			...next,
			tokensSaved: next.tokensSaved + (request.tokensSaved ?? 0),
			tokensSpent: next.tokensSpent + (request.tokensUsed ?? 0),
			samples: next.alpha + next.beta,
			trust: (next.alpha + 1) / (next.alpha + next.beta + 2)
		};
		next = {
			...next,
			weightedTrust: this.store.weightedTrust(next.id, next.revision, Date.now())
		};
		if (request.outcome === "success" && attribution === "experience") {
			if (next.status === "candidate" && next.parentRevision !== void 0) {
				const adopted = {
					...next,
					status: "live"
				};
				delete adopted.challengeReason;
				next = adopted;
				this.store.upsertExperience(next);
				this.supersedeParent(next, actor);
				this.ledger("adopt", "experience", next.id, actor, {
					revision: next.revision,
					via: "use"
				});
				this.enforceFamilyCap(next.family, actor);
				base.adopted = true;
				base.promoted = true;
			} else if (next.status === "candidate") {
				next = {
					...next,
					status: "live"
				};
				this.ledger("promote", "experience", next.id, actor, {
					revision: next.revision,
					via: "use"
				});
				base.promoted = true;
			} else if (next.status === "archived") {
				next = {
					...next,
					status: "live"
				};
				this.ledger("restore", "experience", next.id, actor, { revision: next.revision });
				base.promoted = true;
			}
		}
		if (next.status === "candidate" && counted === "beta") {
			const reason = "candidate trial failed; human re-release required";
			next = {
				...next,
				status: "cold",
				challengeReason: reason
			};
			this.ledger("trial-fail", "experience", next.id, actor, { revision: next.revision }, reason);
			base.cooled = true;
		}
		if (next.status === "live" && counted === "beta" && this.shouldChallenge(next)) {
			const reason = "posterior pressure: repeated experience-attributed failures";
			next = {
				...next,
				status: "challenged",
				challengeReason: reason
			};
			this.ledger("challenge", "experience", next.id, actor, { revision: next.revision }, reason);
			base.challenged = true;
		}
		this.store.upsertExperience(next);
		this.ledger("use", "experience", next.id, actor, {
			revision: next.revision,
			outcome: request.outcome,
			attribution,
			counted,
			...request.dedupeKey === void 0 ? {} : { dedupeKey: request.dedupeKey }
		});
		base.snapshot = next;
		base.counted = counted;
		base.attributionApplied = attribution;
		if (overrideNote !== void 0) base.overrideNote = overrideNote;
		return base;
	}
	/** Windowed challenge rule: consecutive fails or window failure rate. */
	shouldChallenge(exp) {
		const reports = this.store.reportsFor(exp.id, exp.revision, this.config.challengeWindow);
		let consecutive = 0;
		for (const report of reports) if (report.outcome === "fail" && report.attribution === "experience") consecutive += 1;
		else break;
		if (consecutive >= this.config.challengeConsecutiveFails) return true;
		if (reports.length >= 3) {
			if (reports.filter((r) => r.outcome === "fail" && r.attribution === "experience").length / reports.length >= this.config.challengeWindowFailRate) return true;
		}
		return false;
	}
	/** Close the parent revision as superseded after a draft adoption. */
	supersedeParent(draft, actor) {
		if (draft.parentRevision === void 0) return;
		const parent = this.store.getExperience(draft.id, draft.parentRevision);
		if (parent === void 0) return;
		this.store.upsertExperience({
			...parent,
			status: "superseded",
			updatedAt: Date.now()
		});
		this.ledger("supersede", "experience", parent.id, actor, {
			revision: parent.revision,
			by: draft.revision
		});
		this.enforceFamilyCap(draft.family, actor);
	}
	/** Capacity budget: archive the lowest economic value when a family overflows. */
	enforceFamilyCap(familyTag, actor) {
		const overflow = this.store.countFamilyActive(familyTag) - this.config.familyLiveCap;
		if (overflow <= 0) return;
		const live = this.store.listExperiences({
			status: "live",
			family: familyTag
		}).filter((exp) => !exp.pinned).sort((a, b) => a.tokensSaved - a.tokensSpent - (b.tokensSaved - b.tokensSpent));
		for (const exp of live.slice(0, overflow)) {
			this.store.upsertExperience({
				...exp,
				status: "archived",
				updatedAt: Date.now()
			});
			this.ledger("archive", "experience", exp.id, actor, {
				revision: exp.revision,
				reason: "family capacity budget"
			});
		}
	}
	/** 修: propose a revised draft for a challenged experience. */
	revise(request, actor) {
		const current = this.store.getActiveRevision(request.id);
		if (current === void 0) throw new Error(`memory: experience not found: ${request.id}`);
		if (current.status !== "challenged") throw new Error(`memory: only challenged experiences accept revisions (status=${current.status})`);
		const now = Date.now();
		const draft = {
			...current,
			revision: current.revision + 1,
			status: "candidate",
			gist: request.gist ?? current.gist,
			situation: request.situation ?? current.situation,
			path: request.path ?? current.path,
			reasoning: request.reasoning ?? current.reasoning,
			limits: request.limits ?? current.limits,
			alpha: 0,
			beta: 0,
			samples: 0,
			trust: .5,
			weightedTrust: .5,
			verifiedCount: 0,
			rejectCount: 0,
			parentRevision: current.revision,
			createdAt: now,
			updatedAt: now
		};
		delete draft.lastVerifiedAt;
		delete draft.challengeReason;
		this.store.upsertExperience(draft);
		this.ledger("propose", "experience", draft.id, actor, { revision: draft.revision }, request.reason);
		return draft;
	}
	/** V1 controlled re-enactment: replay historical samples against a draft. */
	verifyShadow(request, actor) {
		const draft = this.store.getExperience(request.id, request.revision);
		if (draft === void 0) throw new Error(`memory: draft not found: ${request.id} v${String(request.revision)}`);
		if (draft.status !== "candidate") throw new Error(`memory: shadow replay verifies candidate drafts (status=${draft.status})`);
		if (request.samples.length === 0) return {
			passed: false,
			agreement: 0,
			reason: "no samples supplied"
		};
		const draftTokens = new Set(tokenize([
			draft.gist,
			...draft.situation,
			...draft.limits
		].join(" ")));
		let matched = 0;
		for (const sample of request.samples) {
			const sampleTokens = new Set(tokenize(sample.situation));
			let hits = 0;
			for (const token of sampleTokens) if (draftTokens.has(token)) hits += 1;
			if ((sampleTokens.size === 0 ? 0 : hits / sampleTokens.size) >= this.config.recallFloorScore * 2 === (sample.expected === "success")) matched += 1;
		}
		const agreement = matched / request.samples.length;
		if (agreement < this.config.shadowPassRate) {
			this.ledger("shadow-fail", "experience", draft.id, actor, {
				revision: draft.revision,
				agreement
			});
			return {
				passed: false,
				agreement,
				reason: `agreement ${agreement.toFixed(2)} below pass rate ${String(this.config.shadowPassRate)}`
			};
		}
		const adopted = {
			...draft,
			status: "live",
			lastVerifiedAt: Date.now(),
			updatedAt: Date.now()
		};
		this.store.upsertExperience(adopted);
		this.supersedeParent(adopted, actor);
		this.ledger("shadow-pass", "experience", adopted.id, actor, {
			revision: adopted.revision,
			agreement
		});
		return {
			passed: true,
			agreement,
			snapshot: adopted
		};
	}
	/** Roll the family back to a superseded revision. */
	rollback(request, actor) {
		const target = this.store.getExperience(request.id, request.toRevision);
		if (target === void 0) throw new Error(`memory: revision not found: ${request.id} v${String(request.toRevision)}`);
		if (target.status !== "superseded") throw new Error(`memory: only superseded revisions can be restored (status=${target.status})`);
		const current = this.store.getActiveRevision(request.id);
		if (current !== void 0) {
			this.store.upsertExperience({
				...current,
				status: "superseded",
				updatedAt: Date.now()
			});
			this.ledger("supersede", "experience", current.id, actor, {
				revision: current.revision,
				by: request.toRevision
			});
		}
		const restored = {
			...target,
			status: "live",
			updatedAt: Date.now()
		};
		this.store.upsertExperience(restored);
		this.ledger("rollback", "experience", restored.id, actor, { revision: restored.revision }, request.reason);
		return restored;
	}
	/** One experience revision. */
	get(id, revision) {
		return revision === void 0 ? this.store.getActiveRevision(id) : this.store.getExperience(id, revision);
	}
	/** Experience revisions by filter. */
	list(filter) {
		return this.store.listExperiences(filter);
	}
	/** Every revision of one family (the rollback picker's data). */
	family(id) {
		return this.store.getFamily(id);
	}
	/** 记: append one diary entry; signals when the extraction cadence is due. */
	appendDiary(request, actor) {
		const entry = {
			id: randomUUID(),
			ts: Date.now(),
			kind: request.kind,
			content: request.content,
			tags: request.tags ?? [],
			extracted: false
		};
		if (request.sessionRef !== void 0) entry.sessionRef = request.sessionRef;
		this.store.insertDiary(entry);
		this.ledger("diary", "diary", entry.id, actor, { kind: entry.kind });
		const pending = this.store.unextractedDiary();
		const intervalOk = Date.now() - this.store.lastExtractionTs() >= this.config.diaryExtractIntervalHours * 60 * 60 * 1e3;
		if (!(pending.length >= this.config.diaryExtractEvery && intervalOk)) return {
			entry,
			extractionDue: false
		};
		return {
			entry,
			extractionDue: true,
			pendingDiary: pending
		};
	}
	/** 上升通道: apply extracted facts over the pending diary window. */
	extract(request, actor, trigger = "manual") {
		const result = {
			applied: [],
			conflicts: [],
			rejected: [],
			appliedConcerns: 0
		};
		const feedback = this.getDeletionFeedback();
		if (feedback !== void 0) result.deletionFeedback = feedback.reasoning;
		const now = Date.now();
		const consumedDiary = /* @__PURE__ */ new Set();
		for (const proposal of request.proposals) {
			const rejection = this.validateProposal(proposal);
			if (rejection !== void 0) {
				result.rejected.push({
					proposal,
					reason: rejection
				});
				continue;
			}
			for (const id of proposal.sourceDiaryIds) consumedDiary.add(id);
			const current = this.store.currentFact(proposal.category, proposal.factKey);
			if (current !== void 0 && current.value === proposal.value) {
				const merged = [...new Set([...current.sourceDiaryIds, ...proposal.sourceDiaryIds])];
				const corroborated = {
					...current,
					corroboration: current.corroboration + 1,
					sourceDiaryIds: merged
				};
				this.store.updateFact(corroborated);
				this.ledger("fact-corroborate", "fact", corroborated.id, actor, {
					category: proposal.category,
					factKey: proposal.factKey
				});
				result.applied.push(corroborated);
				continue;
			}
			if (current !== void 0 && current.locked) {
				const conflict = {
					id: randomUUID(),
					category: proposal.category,
					factKey: proposal.factKey,
					value: proposal.value,
					origin: "extraction",
					sourceDiaryIds: [...proposal.sourceDiaryIds],
					corroboration: 1,
					validFrom: now,
					validTo: now,
					recordedAt: now,
					locked: false,
					deleted: false,
					conflictPending: true
				};
				this.store.insertFact(conflict);
				this.ledger("fact-conflict", "fact", conflict.id, actor, {
					category: proposal.category,
					factKey: proposal.factKey,
					against: current.id
				});
				result.conflicts.push(conflict);
				continue;
			}
			const version = {
				id: randomUUID(),
				category: proposal.category,
				factKey: proposal.factKey,
				value: proposal.value,
				origin: current === void 0 ? "extraction" : "supersede",
				sourceDiaryIds: [...proposal.sourceDiaryIds],
				corroboration: 1,
				validFrom: now,
				recordedAt: now,
				locked: false,
				deleted: false,
				conflictPending: false
			};
			if (current !== void 0) {
				this.store.updateFact({
					...current,
					validTo: now,
					supersededBy: version.id
				});
				this.ledger("fact-supersede", "fact", current.id, actor, {
					category: proposal.category,
					factKey: proposal.factKey,
					by: version.id
				});
			}
			this.store.insertFact(version);
			this.ledger("fact-extract", "fact", version.id, actor, {
				category: proposal.category,
				factKey: proposal.factKey
			});
			result.applied.push(version);
		}
		for (const cp of request.concerns ?? []) {
			for (const id of cp.sourceDiaryIds) consumedDiary.add(id);
			if (cp.action === "new") {
				if ((cp.title ?? "").trim() === "") continue;
				const top = {
					id: randomUUID(),
					title: (cp.title ?? "").trim(),
					...cp.background === void 0 || cp.background.trim() === "" ? {} : { background: cp.background.trim() },
					kind: cp.kind ?? "other",
					status: "ongoing",
					ts: now,
					sourceDiaryIds: [...cp.sourceDiaryIds],
					...cp.context === void 0 ? {} : { context: cp.context },
					deleted: false
				};
				this.store.insertConcern(top);
				this.ledger("concern-new", "concern", top.id, actor, { kind: top.kind }, top.title);
				result.appliedConcerns += 1;
			} else if (cp.action === "mention") {
				if (cp.concernId === void 0 || (cp.title ?? "").trim() === "") continue;
				const mention = {
					id: randomUUID(),
					parentId: cp.concernId,
					title: (cp.title ?? "").trim(),
					ts: now,
					sourceDiaryIds: [...cp.sourceDiaryIds],
					deleted: false
				};
				this.store.insertConcern(mention);
				this.ledger("concern-mention", "concern", cp.concernId, actor, {}, mention.title);
				result.appliedConcerns += 1;
			} else if (cp.action === "status") {
				if (cp.concernId === void 0 || cp.status === void 0) continue;
				this.store.setConcernStatus(cp.concernId, cp.status);
				this.ledger("concern-status", "concern", cp.concernId, actor, { status: cp.status });
				result.appliedConcerns += 1;
			}
		}
		if (consumedDiary.size > 0) this.store.markDiaryExtracted([...consumedDiary]);
		const producedIds = [...result.applied, ...result.conflicts].map((fact) => fact.id);
		this.store.insertExtraction({
			id: randomUUID(),
			ts: now,
			trigger,
			summary: request.summary,
			producedFactIds: producedIds,
			diaryCount: consumedDiary.size
		});
		this.ledger("extract", "library", "diary-window", actor, {
			proposals: request.proposals.length,
			applied: result.applied.length,
			conflicts: result.conflicts.length,
			rejected: result.rejected.length
		}, request.summary);
		return result;
	}
	/** Validate one proposal's shape and source pointers. */
	validateProposal(proposal) {
		if (proposal.category.trim() === "" || proposal.factKey.trim() === "" || proposal.value.trim() === "") return "category, factKey and value are required";
		if (proposal.sourceDiaryIds.length === 0) return "sourceDiaryIds must point to at least one diary entry";
		for (const id of proposal.sourceDiaryIds) {
			const entry = this.store.getDiary(id);
			if (entry === void 0) return `unknown diary entry: ${id}`;
			if (entry.extracted) return `diary entry already extracted: ${id}`;
		}
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
		return this.store.listFacts(category === void 0 ? { includeHistory } : {
			category,
			includeHistory
		}, limit, offset);
	}
	/** Count of facts matching the workbench filter (008 §3: pagination total). */
	listFactsCount(category, includeHistory) {
		return this.store.factFilteredCount(category === void 0 ? { includeHistory } : {
			category,
			includeHistory
		});
	}
	/** 关心事项 (007 §2 / 010 §D): top-level concerns + loop, kind/status filter + pagination. */
	listConcerns(kind, status, limit, offset) {
		const filter = {};
		if (kind !== void 0) filter.kind = kind;
		if (status !== void 0) filter.status = status;
		return this.store.listConcernTrees(filter, limit, offset);
	}
	/** Count of top-level concerns matching the workbench filter (010 §D: pagination total). */
	listConcernsCount(kind, status) {
		const filter = {};
		if (kind !== void 0) filter.kind = kind;
		if (status !== void 0) filter.status = status;
		return this.store.listConcernsCount(filter);
	}
	/**
	* 010 §F: a compact runtime snapshot for the AI's context — the profile (the
	* AI's perception of the user) plus still-open concern memos it may remind
	* the user about. Empty string when there is nothing yet.
	*/
	profileSnapshot() {
		const facts = this.store.listFacts({ includeHistory: false }, 60, 0);
		const openConcerns = this.store.listConcernTrees({ status: "ongoing" }, 12, 0);
		if (facts.length === 0 && openConcerns.length === 0) return "";
		const lines = [];
		if (facts.length > 0) {
			lines.push("User profile (your perception of this user — collaborate accordingly):");
			for (const f of facts) lines.push(`- [${f.category}] ${f.factKey}: ${f.value}`);
		}
		if (openConcerns.length > 0) {
			lines.push("Open concern memos (the user's unclosed loops — remind when relevant, never fabricate closure):");
			for (const t of openConcerns) lines.push(`- (${t.concern.kind ?? "other"}) ${t.concern.title}`);
		}
		return lines.join("\n");
	}
	/** Extraction runs, newest first (008 §3: server-side pagination). */
	extractionLog(limit, offset) {
		return this.store.listExtractions(limit, offset);
	}
	/** Total extraction runs (008 §3: pagination total). */
	extractionLogCount() {
		return this.store.extractionCount();
	}
	/**
	* Whether a consolidation run is due. The period is measured as a DURATION
	* since the last consolidation (interval), not a fixed clock time: a run is
	* due once (a) enough NEW experiences have accumulated since the last run
	* AND (b) enough hours have elapsed since it.
	*/
	consolidationDue() {
		const lastTs = this.store.lastConsolidationTs();
		const newSince = this.store.countExperiencesSince(lastTs);
		const hoursSince = lastTs === 0 ? Number.POSITIVE_INFINITY : (Date.now() - lastTs) / 36e5;
		const enoughNew = newSince >= this.config.consolidateEveryNew;
		const intervalPassed = hoursSince >= this.config.consolidateIntervalHours;
		return {
			due: enoughNew && intervalPassed,
			lastTs,
			newSince,
			hoursSince
		};
	}
	/**
	* Apply a consolidation run: for each merge, create one consolidated
	* experience and archive the sources (they leave recall but stay recoverable
	* — consolidation never hard-deletes). Every step is ledgered.
	*/
	consolidate(request, actor) {
		const now = Date.now();
		const result = {
			consolidated: 0,
			archived: 0,
			skipped: []
		};
		for (const merge of request.merges) {
			const sources = merge.sourceIds.map((id) => this.store.getActiveRevision(id)).filter((s) => s !== void 0);
			if (sources.length < 2) {
				result.skipped.push({
					sourceIds: merge.sourceIds,
					reason: "至少需要 2 条仍有效的来源经验"
				});
				continue;
			}
			if (merge.gist.trim() === "" || merge.reasoning.trim() === "") {
				result.skipped.push({
					sourceIds: merge.sourceIds,
					reason: "合并后的 gist/reasoning 不能为空"
				});
				continue;
			}
			const allLive = sources.every((s) => s.status === "live");
			const alpha = sources.reduce((sum, s) => sum + s.alpha, 0);
			const beta = sources.reduce((sum, s) => sum + s.beta, 0);
			const verifiedCount = sources.reduce((sum, s) => sum + (s.verifiedCount ?? 0), 0);
			const rejectCount = sources.reduce((sum, s) => sum + (s.rejectCount ?? 0), 0);
			const lastVerifiedAt = sources.reduce((max, s) => s.lastVerifiedAt !== void 0 && (max === void 0 || s.lastVerifiedAt > max) ? s.lastVerifiedAt : max, void 0);
			const consolidated = {
				id: randomUUID(),
				revision: 1,
				kind: merge.kind,
				source: "agent",
				family: merge.family,
				gist: merge.gist.trim(),
				situation: merge.situation,
				path: merge.path.map((action, index) => ({
					action,
					order: index + 1
				})),
				reasoning: merge.reasoning.trim(),
				limits: merge.limits,
				status: allLive ? "live" : "candidate",
				alpha,
				beta,
				samples: alpha + beta,
				trust: (alpha + 1) / (alpha + beta + 2),
				weightedTrust: (alpha + 1) / (alpha + beta + 2),
				...lastVerifiedAt === void 0 ? {} : { lastVerifiedAt },
				pinned: false,
				tokensSaved: 0,
				tokensSpent: 0,
				evidence: { note: `consolidated from ${String(sources.length)} experiences: ${sources.map((s) => s.id.slice(0, 8)).join(",")}` },
				context: "",
				verifiedCount,
				rejectCount,
				globalFlag: false,
				createdAt: now,
				updatedAt: now
			};
			this.store.upsertExperience(consolidated);
			this.store.archiveExperienceIds(merge.sourceIds, now);
			this.store.recordConsolidation({
				id: randomUUID(),
				ts: now,
				mergedIds: merge.sourceIds,
				producedId: consolidated.id,
				note: merge.note ?? request.note ?? ""
			});
			this.ledger("consolidate", "experience", consolidated.id, actor, {
				mergedFrom: merge.sourceIds,
				gist: merge.gist.trim(),
				status: consolidated.status
			});
			result.consolidated += 1;
			result.archived += sources.length;
		}
		return result;
	}
	/** Family id for the auto-generated extraction-feedback experience. */
	static DELETION_FEEDBACK_FAMILY = "extraction-feedback";
	/**
	* Check whether a deletion-feedback summarization run is due.
	* Conditions: enough new deletions since last run AND enough time elapsed.
	* @returns { due, lastTs, newDeletions, hoursSince }
	*/
	deletionFeedbackDue() {
		const lastTs = this.store.lastDeletionFeedbackTs();
		const hoursSince = lastTs === 0 ? Infinity : (Date.now() - lastTs) / (3600 * 1e3);
		const newDeletions = this.store.countDeletionsSince(lastTs);
		const enoughDeletions = newDeletions >= this.config.deletionFeedbackMinDeletions;
		const intervalPassed = hoursSince >= this.config.deletionFeedbackIntervalHours;
		return {
			due: enoughDeletions && intervalPassed,
			lastTs,
			newDeletions,
			hoursSince
		};
	}
	/**
	* Apply an LLM-generated deletion-feedback summary as an extraction-feedback
	* experience. If one already exists, it is revised in place (new revision);
	* otherwise a new candidate experience is created.
	* @param summary - the LLM-generated summary text (gist + reasoning).
	* @param actor - who triggered the summarization ('system').
	* @returns the upserted experience snapshot.
	*/
	applyDeletionFeedback(summary, actor) {
		const now = Date.now();
		const existing = this.store.findExperienceByFamily(MemoryCore.DELETION_FEEDBACK_FAMILY);
		if (existing !== void 0) {
			const next = {
				...existing,
				revision: existing.revision + 1,
				gist: summary.slice(0, 200),
				reasoning: summary,
				status: "live",
				updatedAt: now
			};
			this.store.upsertExperience(next);
			this.ledger("revise", "experience", next.id, actor, {
				revision: next.revision,
				previousRevision: existing.revision
			}, "deletion-feedback summarization");
			return next;
		}
		const id = crypto.randomUUID();
		const exp = {
			id,
			familyId: id,
			revision: 1,
			kind: "positive",
			source: "system",
			family: MemoryCore.DELETION_FEEDBACK_FAMILY,
			gist: summary.slice(0, 200),
			situation: ["memory_extract 提炼新记忆时，参考此经验避免重复提取已被用户否定的类型"],
			path: [{
				order: 1,
				action: "读取此经验的 reasoning 字段，了解哪些类型的记忆曾被用户删除及原因"
			}, {
				order: 2,
				action: "提炼时避开这些类型，优先提取用户认可的记忆模式"
			}],
			reasoning: summary,
			limits: ["此经验由系统自动生成，禁止人工删除（只能归档）", "内容会随删除记录增多而定期更新"],
			status: "live",
			alpha: 5,
			beta: 2,
			pinned: false,
			tokensSaved: 0,
			tokensSpent: 0,
			context: "",
			globalFlag: true,
			verifiedCount: 0,
			rejectCount: 0,
			createdAt: now,
			updatedAt: now
		};
		this.store.upsertExperience(exp);
		this.ledger("refine", "experience", exp.id, actor, {
			family: exp.family,
			status: exp.status
		}, "deletion-feedback summarization (initial)");
		this.store.setLastDeletionFeedbackTs(now);
		return exp;
	}
	/**
	* Get the current extraction-feedback experience (if any) for injection into
	* the extraction prompt.
	*/
	getDeletionFeedback() {
		return this.store.findExperienceByFamily(MemoryCore.DELETION_FEEDBACK_FAMILY);
	}
	/** Human pin/unpin: pinned cards keep the trust floor and escape budgets. */
	humanPin(request, actor) {
		const current = this.store.getActiveRevision(request.id);
		if (current === void 0) throw new Error(`memory: experience not found: ${request.id}`);
		const next = {
			...current,
			pinned: request.pinned,
			updatedAt: Date.now()
		};
		this.store.upsertExperience(next);
		this.ledger(request.pinned ? "pin" : "unpin", "experience", next.id, actor, { revision: next.revision }, request.reason);
		return next;
	}
	/** Human delete: tombstone the family; the ledger keeps the fingerprint. */
	humanDeleteExperience(request, actor) {
		const familyRows = this.store.getFamily(request.id);
		if (familyRows.length === 0) throw new Error(`memory: experience not found: ${request.id}`);
		const head = familyRows[familyRows.length - 1];
		if (isSystemExperienceFamily(head.family)) throw new Error(`memory: system experience "${head.family}" cannot be deleted (only archived). Use the archive action to remove it from active recall while preserving the audit trail.`);
		this.store.deleteFamily(request.id);
		this.ledger("delete", "experience", request.id, actor, {
			gist: head.gist,
			family: head.family,
			revisions: familyRows.length
		}, request.reason);
	}
	/**
	* Human archive: move an experience to archived status. Unlike delete, the
	* data is preserved (recoverable via deep lookup) but removed from active
	* recall. This is the only way to retire system-managed experiences
	* (e.g. extraction-feedback).
	*/
	humanArchiveExperience(request, actor) {
		const current = this.store.getActiveRevision(request.id);
		if (current === void 0) throw new Error(`memory: experience not found: ${request.id}`);
		if (current.status === "archived") return;
		this.store.upsertExperience({
			...current,
			status: "archived",
			updatedAt: Date.now()
		});
		this.ledger("archive", "experience", request.id, actor, {
			gist: current.gist,
			family: current.family,
			previousStatus: current.status
		}, request.reason);
	}
	/** Human edit: rewrite fields of the active revision in place. */
	humanEditExperience(request, actor) {
		const current = this.store.getActiveRevision(request.id);
		if (current === void 0) throw new Error(`memory: experience not found: ${request.id}`);
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
			updatedAt: Date.now()
		};
		this.store.upsertExperience(next);
		this.ledger("edit", "experience", next.id, actor, { revision: next.revision }, request.reason);
		return next;
	}
	/** Human injection: fixed format, source=human, trust floor, directly live. */
	humanAddExperience(request, actor) {
		const now = Date.now();
		const snapshot = {
			id: randomUUID(),
			revision: 1,
			kind: request.kind,
			source: "human",
			family: request.family,
			gist: request.gist,
			situation: [...request.situation],
			path: [...request.path],
			reasoning: request.reasoning,
			limits: [...request.limits],
			status: "live",
			alpha: this.config.humanFloorAlpha,
			beta: this.config.humanFloorBeta,
			samples: this.config.humanFloorAlpha + this.config.humanFloorBeta,
			trust: (this.config.humanFloorAlpha + 1) / (this.config.humanFloorAlpha + this.config.humanFloorBeta + 2),
			weightedTrust: (this.config.humanFloorAlpha + 1) / (this.config.humanFloorAlpha + this.config.humanFloorBeta + 2),
			lastVerifiedAt: now,
			pinned: false,
			tokensSaved: 0,
			tokensSpent: 0,
			context: request.context ?? "",
			verifiedCount: 0,
			rejectCount: 0,
			globalFlag: false,
			createdAt: now,
			updatedAt: now
		};
		if (request.failureReason !== void 0) snapshot.failureReason = request.failureReason;
		this.store.upsertExperience(snapshot);
		this.ledger("add", "experience", snapshot.id, actor, {
			kind: snapshot.kind,
			family: snapshot.family,
			trustFloor: snapshot.trust
		}, request.reason);
		return snapshot;
	}
	/** Human authority (V2): promote a candidate straight to live. */
	humanPromote(id, reason, actor) {
		const current = this.store.getActiveRevision(id);
		if (current === void 0) throw new Error(`memory: experience not found: ${id}`);
		if (current.status !== "candidate") throw new Error(`memory: only candidates accept human promotion (status=${current.status})`);
		const next = {
			...current,
			status: "live",
			lastVerifiedAt: Date.now(),
			updatedAt: Date.now()
		};
		this.store.upsertExperience(next);
		if (next.parentRevision !== void 0) this.supersedeParent(next, actor);
		this.ledger("human-promote", "experience", next.id, actor, { revision: next.revision }, reason);
		return next;
	}
	/** Human re-release (006 §3.2): move a cold-palace revision back to candidate. */
	humanReleaseCold(request, actor) {
		const cold = [...this.store.getFamily(request.id)].reverse().find((rev) => rev.status === "cold");
		if (cold === void 0) throw new Error(`memory: no cold revision to re-release for ${request.id}`);
		const next = {
			...cold,
			status: "candidate",
			updatedAt: Date.now()
		};
		delete next.challengeReason;
		this.store.upsertExperience(next);
		this.ledger("release-cold", "experience", next.id, actor, { revision: next.revision }, request.reason);
		return next;
	}
	/** Human acknowledgement of a pending diary entry: reviewed, no fact extracted. */
	humanAckDiary(request, actor) {
		const entry = this.store.getDiary(request.diaryId);
		if (entry === void 0) throw new Error(`memory: unknown diary entry: ${request.diaryId}`);
		if (entry.extracted) throw new Error(`memory: diary entry already extracted: ${request.diaryId}`);
		this.store.markDiaryExtracted([request.diaryId]);
		this.ledger("diary-ack", "diary", request.diaryId, actor, {}, request.reason);
		return {
			...entry,
			extracted: true
		};
	}
	/** Human lifecycle change of a top-level concern (007 §2.4, audited). */
	humanSetConcernStatus(request, actor) {
		this.store.setConcernStatus(request.id, request.status);
		this.ledger("concern-status", "concern", request.id, actor, {
			status: request.status,
			via: "human"
		}, request.reason);
	}
	/** Human delete of a concern subtree (007 §2.4, tombstone, audited). */
	humanDeleteConcern(request, actor) {
		this.store.deleteConcernSubtree(request.id);
		this.ledger("concern-delete", "concern", request.id, actor, { via: "human" }, request.reason);
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
			origin: "human",
			sourceDiaryIds: [],
			corroboration: 1,
			validFrom: now,
			recordedAt: now,
			locked: request.locked ?? true,
			deleted: false,
			conflictPending: false
		};
		if (current !== void 0) {
			this.store.updateFact({
				...current,
				validTo: now,
				supersededBy: version.id
			});
			this.ledger("fact-supersede", "fact", current.id, actor, { by: version.id }, request.reason);
		}
		this.store.insertFact(version);
		this.ledger("fact-add", "fact", version.id, actor, {
			category: request.category,
			factKey: request.factKey
		}, request.reason);
		return version;
	}
	/** Human fact edit: supersedes the current version with a locked one. */
	humanEditFact(request, actor) {
		const current = this.store.getFact(request.factId);
		if (current === void 0) throw new Error(`memory: fact not found: ${request.factId}`);
		if (current.validTo !== void 0 || current.deleted) throw new Error("memory: only the current fact version can be edited");
		const now = Date.now();
		const version = {
			...current,
			id: randomUUID(),
			value: request.value,
			origin: "human",
			validFrom: now,
			recordedAt: now,
			locked: true,
			conflictPending: false,
			corroboration: current.corroboration
		};
		delete version.validTo;
		delete version.supersededBy;
		this.store.updateFact({
			...current,
			validTo: now,
			supersededBy: version.id
		});
		this.store.insertFact(version);
		this.ledger("fact-edit", "fact", version.id, actor, {
			category: version.category,
			factKey: version.factKey,
			previous: current.id
		}, request.reason);
		return version;
	}
	/** Human fact delete: tombstone the current version. */
	humanDeleteFact(request, actor) {
		const current = this.store.getFact(request.factId);
		if (current === void 0) throw new Error(`memory: fact not found: ${request.factId}`);
		if (current.validTo !== void 0 || current.deleted) throw new Error("memory: only the current fact version can be deleted");
		this.store.updateFact({
			...current,
			validTo: Date.now(),
			deleted: true
		});
		this.ledger("fact-delete", "fact", current.id, actor, {
			category: current.category,
			factKey: current.factKey,
			value: current.value
		}, request.reason);
	}
	/** Human fact confirmation: lock or unlock the current version. */
	humanConfirmFact(request, actor) {
		const current = this.store.getFact(request.factId);
		if (current === void 0) throw new Error(`memory: fact not found: ${request.factId}`);
		const next = {
			...current,
			locked: request.locked,
			conflictPending: false
		};
		this.store.updateFact(next);
		this.ledger(request.locked ? "fact-lock" : "fact-unlock", "fact", next.id, actor, {
			category: next.category,
			factKey: next.factKey
		}, request.reason);
		return next;
	}
	/** Human rollback (same gate, human actor). */
	humanRollback(request, actor) {
		return this.rollback(request, actor);
	}
	/** Aggregated library statistics. */
	stats() {
		const all = this.store.listExperiences({});
		const byStatus = {
			candidate: 0,
			live: 0,
			challenged: 0,
			superseded: 0,
			archived: 0,
			cold: 0
		};
		const byKind = {
			positive: 0,
			negative: 0
		};
		let trustSum = 0;
		let pinned = 0;
		for (const exp of all) {
			byStatus[exp.status] += 1;
			byKind[exp.kind] += 1;
			trustSum += exp.trust;
			if (exp.pinned) pinned += 1;
		}
		const diary = this.store.diaryCounts();
		const recall = this.store.recallCounts();
		const reports = this.store.allReports().filter((r) => r.counted !== "none").length;
		return {
			experiences: {
				total: all.length,
				byStatus,
				byKind,
				pinned,
				avgTrust: all.length === 0 ? 0 : trustSum / all.length
			},
			facts: this.store.factCounts(),
			diary: {
				total: diary.total,
				unextracted: diary.unextracted,
				extractions: this.store.extractionCount()
			},
			ledgerBlocks: this.store.ledgerCount(),
			recall: {
				events: recall.events,
				negative: recall.negative,
				reportsAfterRecall: reports
			},
			consolidation: {
				lastTs: this.store.lastConsolidationTs(),
				due: this.consolidationDue().due,
				newSince: this.store.countExperiencesSince(this.store.lastConsolidationTs())
			}
		};
	}
	/** Verify the ledger hash chain end to end. */
	verifyLedger() {
		const blocks = this.store.ledgerAll();
		let prev = "";
		for (const block of blocks) {
			const expected = blockHash(block.ts, block.op, block.objectType, block.objectId, block.actor, block.payload, prev);
			if (block.prevHash !== prev || block.hash !== expected) return {
				ok: false,
				checked: blocks.length,
				brokenAt: block.seq
			};
			prev = block.hash;
		}
		return {
			ok: true,
			checked: blocks.length
		};
	}
	/** Ledger query for the workbench and the model tool. */
	ledgerQuery(request) {
		return this.store.ledgerQuery({
			...request.objectType === void 0 ? {} : { objectType: request.objectType },
			...request.objectId === void 0 ? {} : { objectId: request.objectId },
			...request.op === void 0 ? {} : { op: request.op },
			...request.offset === void 0 ? {} : { offset: request.offset },
			...request.seqFrom === void 0 ? {} : { seqFrom: request.seqFrom },
			...request.seqTo === void 0 ? {} : { seqTo: request.seqTo },
			limit: request.limit ?? 50
		});
	}
	/** Count ledger blocks matching a filter (007 §2 pagination). */
	ledgerQueryCount(request) {
		return this.store.ledgerQueryCount({
			...request.objectType === void 0 ? {} : { objectType: request.objectType },
			...request.objectId === void 0 ? {} : { objectId: request.objectId },
			...request.op === void 0 ? {} : { op: request.op },
			...request.seqFrom === void 0 ? {} : { seqFrom: request.seqFrom },
			...request.seqTo === void 0 ? {} : { seqTo: request.seqTo }
		});
	}
	/** Full library export (experiments + migration). */
	exportLibrary() {
		const diaryEntries = this.store.listDiary(1e6, 0, false);
		return {
			exportedAt: Date.now(),
			schemaVersion: 1,
			experiences: this.store.listExperiences({}),
			reports: this.store.allReports().map((report) => ({
				id: report.id,
				experienceId: report.experienceId,
				revision: report.revision,
				outcome: report.outcome,
				attribution: report.attribution,
				counted: report.counted,
				...report.evidence === void 0 ? {} : { evidence: report.evidence },
				...report.dedupeKey === void 0 ? {} : { dedupeKey: report.dedupeKey },
				ts: report.ts
			})),
			diary: diaryEntries,
			facts: this.store.allFacts(),
			extractions: this.store.listExtractions(1e6, 0),
			recalls: this.store.allRecallEvents().map((event) => ({
				id: event.id,
				ts: event.ts,
				situation: event.situation,
				injectedIds: event.injectedIds,
				none: event.none
			})),
			ledger: this.store.ledgerAll()
		};
	}
};
//#endregion
//#region lib/types/service.js
/**
* Memory library Typert Remote service: the wire face over MemoryCore.
* Every method takes the calling Agent first (Typert wire identity); the
* library itself is process-global — one memory shared by every session.
* Human operations carry an audited reason and land in the ledger.
* @module dsh-daoing-memory/service
*/
var __runInitializers = function(thisArg, initializers, value) {
	var useValue = arguments.length > 2;
	for (var i = 0; i < initializers.length; i++) value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
	return useValue ? value : void 0;
};
var __esDecorate = function(ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
	function accept(f) {
		if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected");
		return f;
	}
	var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
	var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
	var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
	var _, done = false;
	for (var i = decorators.length - 1; i >= 0; i--) {
		var context = {};
		for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
		for (var p in contextIn.access) context.access[p] = contextIn.access[p];
		context.addInitializer = function(f) {
			if (done) throw new TypeError("Cannot add initializers after decoration has completed");
			extraInitializers.push(accept(f || null));
		};
		var result = (0, decorators[i])(kind === "accessor" ? {
			get: descriptor.get,
			set: descriptor.set
		} : descriptor[key], context);
		if (kind === "accessor") {
			if (result === void 0) continue;
			if (result === null || typeof result !== "object") throw new TypeError("Object expected");
			if (_ = accept(result.get)) descriptor.get = _;
			if (_ = accept(result.set)) descriptor.set = _;
			if (_ = accept(result.init)) initializers.unshift(_);
		} else if (_ = accept(result)) if (kind === "field") initializers.unshift(_);
		else descriptor[key] = _;
	}
	if (target) Object.defineProperty(target, contextIn.name, descriptor);
	done = true;
};
/** Derive the ledger actor label from the wire identity. */
function actorOf(agent) {
	const sessionId = agent.session?.id;
	return sessionId === void 0 ? "agent" : `agent:${sessionId}`;
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
	let _runDeletionFeedback_decorators;
	let _getDeletionFeedback_decorators;
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
	let _humanArchiveExperience_decorators;
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
			_refine_decorators = [Remote("refine")];
			_recall_decorators = [Remote("recall")];
			_report_decorators = [Remote("report")];
			_ingest_decorators = [Remote("ingest")];
			_revise_decorators = [Remote("revise")];
			_verifyShadow_decorators = [Remote("verifyShadow")];
			_rollback_decorators = [Remote("rollback")];
			_get_decorators = [Remote("get")];
			_list_decorators = [Remote("list")];
			_family_decorators = [Remote("family")];
			_appendDiary_decorators = [Remote("appendDiary")];
			_extract_decorators = [Remote("extract")];
			_runDeletionFeedback_decorators = [Remote("runDeletionFeedback")];
			_getDeletionFeedback_decorators = [Remote("getDeletionFeedback")];
			_listDiary_decorators = [Remote("listDiary")];
			_getDiaryByIds_decorators = [Remote("getDiaryByIds")];
			_listFacts_decorators = [Remote("listFacts")];
			_listFactsCount_decorators = [Remote("listFactsCount")];
			_listConcerns_decorators = [Remote("listConcerns")];
			_listConcernsCount_decorators = [Remote("listConcernsCount")];
			_extractionLog_decorators = [Remote("extractionLog")];
			_extractionLogCount_decorators = [Remote("extractionLogCount")];
			_consolidate_decorators = [Remote("consolidate")];
			_consolidationDue_decorators = [Remote("consolidationDue")];
			_ledgerQuery_decorators = [Remote("ledgerQuery")];
			_ledgerQueryCount_decorators = [Remote("ledgerQueryCount")];
			_verifyLedger_decorators = [Remote("verifyLedger")];
			_stats_decorators = [Remote("stats")];
			_workbenchInfo_decorators = [Remote("workbenchInfo")];
			_exportLibrary_decorators = [Remote("exportLibrary")];
			_humanPin_decorators = [Remote("humanPin")];
			_humanDeleteExperience_decorators = [Remote("humanDeleteExperience")];
			_humanArchiveExperience_decorators = [Remote("humanArchiveExperience")];
			_humanEditExperience_decorators = [Remote("humanEditExperience")];
			_humanAddExperience_decorators = [Remote("humanAddExperience")];
			_humanPromote_decorators = [Remote("humanPromote")];
			_humanReleaseCold_decorators = [Remote("humanReleaseCold")];
			_humanRollback_decorators = [Remote("humanRollback")];
			_humanAddFact_decorators = [Remote("humanAddFact")];
			_humanEditFact_decorators = [Remote("humanEditFact")];
			_humanDeleteFact_decorators = [Remote("humanDeleteFact")];
			_humanConfirmFact_decorators = [Remote("humanConfirmFact")];
			_humanAckDiary_decorators = [Remote("humanAckDiary")];
			_humanSetConcernStatus_decorators = [Remote("humanSetConcernStatus")];
			_humanDeleteConcern_decorators = [Remote("humanDeleteConcern")];
			__esDecorate(this, null, _refine_decorators, {
				kind: "method",
				name: "refine",
				static: false,
				private: false,
				access: {
					has: (obj) => "refine" in obj,
					get: (obj) => obj.refine
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _recall_decorators, {
				kind: "method",
				name: "recall",
				static: false,
				private: false,
				access: {
					has: (obj) => "recall" in obj,
					get: (obj) => obj.recall
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _report_decorators, {
				kind: "method",
				name: "report",
				static: false,
				private: false,
				access: {
					has: (obj) => "report" in obj,
					get: (obj) => obj.report
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _ingest_decorators, {
				kind: "method",
				name: "ingest",
				static: false,
				private: false,
				access: {
					has: (obj) => "ingest" in obj,
					get: (obj) => obj.ingest
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _revise_decorators, {
				kind: "method",
				name: "revise",
				static: false,
				private: false,
				access: {
					has: (obj) => "revise" in obj,
					get: (obj) => obj.revise
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _verifyShadow_decorators, {
				kind: "method",
				name: "verifyShadow",
				static: false,
				private: false,
				access: {
					has: (obj) => "verifyShadow" in obj,
					get: (obj) => obj.verifyShadow
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _rollback_decorators, {
				kind: "method",
				name: "rollback",
				static: false,
				private: false,
				access: {
					has: (obj) => "rollback" in obj,
					get: (obj) => obj.rollback
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _get_decorators, {
				kind: "method",
				name: "get",
				static: false,
				private: false,
				access: {
					has: (obj) => "get" in obj,
					get: (obj) => obj.get
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _list_decorators, {
				kind: "method",
				name: "list",
				static: false,
				private: false,
				access: {
					has: (obj) => "list" in obj,
					get: (obj) => obj.list
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _family_decorators, {
				kind: "method",
				name: "family",
				static: false,
				private: false,
				access: {
					has: (obj) => "family" in obj,
					get: (obj) => obj.family
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _appendDiary_decorators, {
				kind: "method",
				name: "appendDiary",
				static: false,
				private: false,
				access: {
					has: (obj) => "appendDiary" in obj,
					get: (obj) => obj.appendDiary
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _extract_decorators, {
				kind: "method",
				name: "extract",
				static: false,
				private: false,
				access: {
					has: (obj) => "extract" in obj,
					get: (obj) => obj.extract
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _runDeletionFeedback_decorators, {
				kind: "method",
				name: "runDeletionFeedback",
				static: false,
				private: false,
				access: {
					has: (obj) => "runDeletionFeedback" in obj,
					get: (obj) => obj.runDeletionFeedback
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _getDeletionFeedback_decorators, {
				kind: "method",
				name: "getDeletionFeedback",
				static: false,
				private: false,
				access: {
					has: (obj) => "getDeletionFeedback" in obj,
					get: (obj) => obj.getDeletionFeedback
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _listDiary_decorators, {
				kind: "method",
				name: "listDiary",
				static: false,
				private: false,
				access: {
					has: (obj) => "listDiary" in obj,
					get: (obj) => obj.listDiary
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _getDiaryByIds_decorators, {
				kind: "method",
				name: "getDiaryByIds",
				static: false,
				private: false,
				access: {
					has: (obj) => "getDiaryByIds" in obj,
					get: (obj) => obj.getDiaryByIds
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _listFacts_decorators, {
				kind: "method",
				name: "listFacts",
				static: false,
				private: false,
				access: {
					has: (obj) => "listFacts" in obj,
					get: (obj) => obj.listFacts
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _listFactsCount_decorators, {
				kind: "method",
				name: "listFactsCount",
				static: false,
				private: false,
				access: {
					has: (obj) => "listFactsCount" in obj,
					get: (obj) => obj.listFactsCount
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _listConcerns_decorators, {
				kind: "method",
				name: "listConcerns",
				static: false,
				private: false,
				access: {
					has: (obj) => "listConcerns" in obj,
					get: (obj) => obj.listConcerns
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _listConcernsCount_decorators, {
				kind: "method",
				name: "listConcernsCount",
				static: false,
				private: false,
				access: {
					has: (obj) => "listConcernsCount" in obj,
					get: (obj) => obj.listConcernsCount
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _extractionLog_decorators, {
				kind: "method",
				name: "extractionLog",
				static: false,
				private: false,
				access: {
					has: (obj) => "extractionLog" in obj,
					get: (obj) => obj.extractionLog
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _extractionLogCount_decorators, {
				kind: "method",
				name: "extractionLogCount",
				static: false,
				private: false,
				access: {
					has: (obj) => "extractionLogCount" in obj,
					get: (obj) => obj.extractionLogCount
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _consolidate_decorators, {
				kind: "method",
				name: "consolidate",
				static: false,
				private: false,
				access: {
					has: (obj) => "consolidate" in obj,
					get: (obj) => obj.consolidate
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _consolidationDue_decorators, {
				kind: "method",
				name: "consolidationDue",
				static: false,
				private: false,
				access: {
					has: (obj) => "consolidationDue" in obj,
					get: (obj) => obj.consolidationDue
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _ledgerQuery_decorators, {
				kind: "method",
				name: "ledgerQuery",
				static: false,
				private: false,
				access: {
					has: (obj) => "ledgerQuery" in obj,
					get: (obj) => obj.ledgerQuery
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _ledgerQueryCount_decorators, {
				kind: "method",
				name: "ledgerQueryCount",
				static: false,
				private: false,
				access: {
					has: (obj) => "ledgerQueryCount" in obj,
					get: (obj) => obj.ledgerQueryCount
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _verifyLedger_decorators, {
				kind: "method",
				name: "verifyLedger",
				static: false,
				private: false,
				access: {
					has: (obj) => "verifyLedger" in obj,
					get: (obj) => obj.verifyLedger
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _stats_decorators, {
				kind: "method",
				name: "stats",
				static: false,
				private: false,
				access: {
					has: (obj) => "stats" in obj,
					get: (obj) => obj.stats
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _workbenchInfo_decorators, {
				kind: "method",
				name: "workbenchInfo",
				static: false,
				private: false,
				access: {
					has: (obj) => "workbenchInfo" in obj,
					get: (obj) => obj.workbenchInfo
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _exportLibrary_decorators, {
				kind: "method",
				name: "exportLibrary",
				static: false,
				private: false,
				access: {
					has: (obj) => "exportLibrary" in obj,
					get: (obj) => obj.exportLibrary
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _humanPin_decorators, {
				kind: "method",
				name: "humanPin",
				static: false,
				private: false,
				access: {
					has: (obj) => "humanPin" in obj,
					get: (obj) => obj.humanPin
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _humanDeleteExperience_decorators, {
				kind: "method",
				name: "humanDeleteExperience",
				static: false,
				private: false,
				access: {
					has: (obj) => "humanDeleteExperience" in obj,
					get: (obj) => obj.humanDeleteExperience
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _humanArchiveExperience_decorators, {
				kind: "method",
				name: "humanArchiveExperience",
				static: false,
				private: false,
				access: {
					has: (obj) => "humanArchiveExperience" in obj,
					get: (obj) => obj.humanArchiveExperience
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _humanEditExperience_decorators, {
				kind: "method",
				name: "humanEditExperience",
				static: false,
				private: false,
				access: {
					has: (obj) => "humanEditExperience" in obj,
					get: (obj) => obj.humanEditExperience
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _humanAddExperience_decorators, {
				kind: "method",
				name: "humanAddExperience",
				static: false,
				private: false,
				access: {
					has: (obj) => "humanAddExperience" in obj,
					get: (obj) => obj.humanAddExperience
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _humanPromote_decorators, {
				kind: "method",
				name: "humanPromote",
				static: false,
				private: false,
				access: {
					has: (obj) => "humanPromote" in obj,
					get: (obj) => obj.humanPromote
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _humanReleaseCold_decorators, {
				kind: "method",
				name: "humanReleaseCold",
				static: false,
				private: false,
				access: {
					has: (obj) => "humanReleaseCold" in obj,
					get: (obj) => obj.humanReleaseCold
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _humanRollback_decorators, {
				kind: "method",
				name: "humanRollback",
				static: false,
				private: false,
				access: {
					has: (obj) => "humanRollback" in obj,
					get: (obj) => obj.humanRollback
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _humanAddFact_decorators, {
				kind: "method",
				name: "humanAddFact",
				static: false,
				private: false,
				access: {
					has: (obj) => "humanAddFact" in obj,
					get: (obj) => obj.humanAddFact
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _humanEditFact_decorators, {
				kind: "method",
				name: "humanEditFact",
				static: false,
				private: false,
				access: {
					has: (obj) => "humanEditFact" in obj,
					get: (obj) => obj.humanEditFact
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _humanDeleteFact_decorators, {
				kind: "method",
				name: "humanDeleteFact",
				static: false,
				private: false,
				access: {
					has: (obj) => "humanDeleteFact" in obj,
					get: (obj) => obj.humanDeleteFact
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _humanConfirmFact_decorators, {
				kind: "method",
				name: "humanConfirmFact",
				static: false,
				private: false,
				access: {
					has: (obj) => "humanConfirmFact" in obj,
					get: (obj) => obj.humanConfirmFact
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _humanAckDiary_decorators, {
				kind: "method",
				name: "humanAckDiary",
				static: false,
				private: false,
				access: {
					has: (obj) => "humanAckDiary" in obj,
					get: (obj) => obj.humanAckDiary
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _humanSetConcernStatus_decorators, {
				kind: "method",
				name: "humanSetConcernStatus",
				static: false,
				private: false,
				access: {
					has: (obj) => "humanSetConcernStatus" in obj,
					get: (obj) => obj.humanSetConcernStatus
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			__esDecorate(this, null, _humanDeleteConcern_decorators, {
				kind: "method",
				name: "humanDeleteConcern",
				static: false,
				private: false,
				access: {
					has: (obj) => "humanDeleteConcern" in obj,
					get: (obj) => obj.humanDeleteConcern
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			if (_metadata) Object.defineProperty(this, Symbol.metadata, {
				enumerable: true,
				configurable: true,
				writable: true,
				value: _metadata
			});
		}
		core = __runInitializers(this, _instanceExtraInitializers);
		workbench;
		/** @param ctx - host context. */
		/** @param core - the ctx-free memory core. */
		/** @param workbench - descriptor the browser half matches workspaces against. */
		constructor(ctx, core, workbench) {
			super(ctx, "memory");
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
			return this.core.get(id, revision);
		}
		/** List experience revisions by filter. */
		list(agent, filter) {
			return this.core.list(filter);
		}
		/** Every revision of one family (superseded index for rollback). */
		family(agent, id) {
			return this.core.family(id);
		}
		/** 记: append one diary entry; signals the extraction duty when due. */
		appendDiary(agent, request) {
			return this.core.appendDiary(request, actorOf(agent));
		}
		/** 上升通道: apply extracted facts over the pending diary window. */
		async extract(agent, request) {
			await this.maybeRunDeletionFeedbackSummarization(agent);
			return this.core.extract(request, actorOf(agent), "manual");
		}
		/**
		* Check if deletion-feedback summarization is due and run it if so.
		* Uses the agent's current model route for the LLM call.
		*/
		async maybeRunDeletionFeedbackSummarization(agent) {
			const check = this.core.deletionFeedbackDue();
			if (!check.due) return;
			try {
				const records = this.core["store"].getDeletionRecordsSince(check.lastTs, 50);
				if (records.length === 0) return;
				const summary = await this.summarizeDeletionsWithLlm(agent, records);
				if (summary.length > 0) this.core.applyDeletionFeedback(summary, "system");
			} catch {}
		}
		/**
		* Call the LLM to summarize deletion records into extraction feedback rules.
		* Uses ctx.llm.stream() with the agent's current model route.
		*/
		async summarizeDeletionsWithLlm(agent, records) {
			const header = agent.session.requestHeader()?.config;
			if (header === void 0) return "";
			const provider = header.provider;
			const model = header.model;
			if (provider === void 0 || model === void 0) return "";
			const deletionList = records.map((r, i) => `${i + 1}. [${new Date(r.ts).toLocaleDateString("zh-CN")}] 删除的经验：「${r.gist.slice(0, 80)}」\n   原因：${r.reason || "（未填写）"}`).join("\n\n");
			const systemPrompt = `你是一个记忆系统的反馈分析器。你的任务是分析用户删除记忆时填写的原因，总结出"什么类型的记忆不值得提取"的规则。

输出要求：
1. 用简洁的中文列出 3-5 条规则
2. 每条规则说明：什么类型的记忆应该避免提取，以及为什么
3. 规则要具体可操作，不要泛泛而谈
4. 如果删除原因都很相似，合并为更精炼的规则`;
			const messages = [{
				role: "user",
				content: [{
					type: "text",
					text: `以下是近期被用户删除的记忆及其删除原因：

${deletionList}

请总结成提取反馈规则。`
				}]
			}];
			let text = "";
			const options = {
				provider,
				model,
				messages,
				system: systemPrompt,
				maxTokens: 1500,
				sessionId: agent.session.id
			};
			for await (const chunk of this.ctx.llm.stream(options)) if (chunk.type === "text-delta") text += chunk.text;
			return text.trim();
		}
		/**
		* Remote: manually trigger deletion-feedback summarization (for testing/debugging).
		*/
		async runDeletionFeedback(agent) {
			const check = this.core.deletionFeedbackDue();
			const records = this.core["store"].getDeletionRecordsSince(check.lastTs, 50);
			if (records.length === 0) return { ran: false };
			try {
				const summary = await this.summarizeDeletionsWithLlm(agent, records);
				if (summary.length > 0) {
					this.core.applyDeletionFeedback(summary, "system");
					return {
						ran: true,
						summary
					};
				}
				return { ran: false };
			} catch (e) {
				return {
					ran: false,
					summary: String(e)
				};
			}
		}
		/**
		* Remote: get the current deletion-feedback experience (for debugging).
		*/
		getDeletionFeedback(agent) {
			return this.core.getDeletionFeedback() ?? null;
		}
		/** Diary timeline for the workbench (007 §2: server-side pagination, newest first). */
		listDiary(agent, limit, offset, onlyUnextracted) {
			return this.core.listDiary(limit, offset, onlyUnextracted);
		}
		/** Several diary entries by id (008 Path A: fact→diary provenance). */
		getDiaryByIds(agent, ids) {
			return this.core.getDiaryByIds(ids);
		}
		/** Fact versions for the workbench (008 §3: server-side pagination). */
		listFacts(agent, category, includeHistory, limit, offset) {
			return this.core.listFacts(category === "" ? void 0 : category, includeHistory, limit, offset);
		}
		/** Count facts matching the workbench filter (008 §3: pagination total). */
		listFactsCount(agent, category, includeHistory) {
			return this.core.listFactsCount(category === "" ? void 0 : category, includeHistory);
		}
		/** 关心事项 trees (top-level + discussion loop) for the workbench (010 §D: filter + pagination). */
		listConcerns(agent, kind, status, limit, offset) {
			return this.core.listConcerns(kind === "" ? void 0 : kind, status === "" ? void 0 : status, limit, offset);
		}
		/** Count of top-level concerns matching the workbench filter (010 §D: pagination total). */
		listConcernsCount(agent, kind, status) {
			return this.core.listConcernsCount(kind === "" ? void 0 : kind, status === "" ? void 0 : status);
		}
		/** 010 §F: compact profile + open-concern snapshot for the AI's context (host-side). */
		profileSnapshot() {
			return this.core.profileSnapshot();
		}
		/** Extraction runs for the workbench (008 §3: server-side pagination). */
		extractionLog(agent, limit, offset) {
			return this.core.extractionLog(limit, offset);
		}
		/** Total extraction runs (008 §3: pagination total). */
		extractionLogCount(agent) {
			return this.core.extractionLogCount();
		}
		/** Apply a consolidation run: merge related experiences (008 §1). */
		consolidate(agent, request) {
			return this.core.consolidate(request, "agent");
		}
		/** Whether a consolidation run is due (interval cadence; 008 §1). */
		consolidationDue(agent) {
			return this.core.consolidationDue();
		}
		/** Ledger query (newest first, filtered). */
		ledgerQuery(agent, request) {
			return this.core.ledgerQuery(request);
		}
		/** Count ledger blocks matching a filter (007 §2 pagination). */
		ledgerQueryCount(agent, request) {
			return this.core.ledgerQueryCount(request);
		}
		/** Verify the ledger hash chain end to end. */
		verifyLedger(agent) {
			return this.core.verifyLedger();
		}
		/** Aggregated library statistics. */
		stats(agent) {
			return this.core.stats();
		}
		/** Workbench descriptor (workspace matching + config view). */
		workbenchInfo(agent) {
			return this.workbench();
		}
		/** Full library export for experiments and migration. */
		exportLibrary(agent) {
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
		/** Human pin/unpin. */
		humanPin(agent, request) {
			return this.core.humanPin(request, "human");
		}
		/** Human delete (tombstone + ledger fingerprint). */
		humanDeleteExperience(agent, request) {
			this.core.humanDeleteExperience(request, "human");
			return { deleted: true };
		}
		/** Human archive (move to archived status; preserves data, removes from recall). */
		humanArchiveExperience(agent, request) {
			this.core.humanArchiveExperience(request, "human");
			return { archived: true };
		}
		/** Human edit of the active revision. */
		humanEditExperience(agent, request) {
			return this.core.humanEditExperience(request, "human");
		}
		/** Human injection in the fixed experience format. */
		humanAddExperience(agent, request) {
			return this.core.humanAddExperience(request, "human");
		}
		/** Human authority (V2): promote a candidate straight to live. */
		humanPromote(agent, id, reason) {
			return this.core.humanPromote(id, reason, "human");
		}
		/** Human re-release of a cold-palace revision back to candidate (006 §3.2). */
		humanReleaseCold(agent, request) {
			return this.core.humanReleaseCold(request, "human");
		}
		/** Human rollback. */
		humanRollback(agent, request) {
			return this.core.humanRollback(request, "human");
		}
		/** Human fact add. */
		humanAddFact(agent, request) {
			return this.core.humanAddFact(request, "human");
		}
		/** Human fact edit. */
		humanEditFact(agent, request) {
			return this.core.humanEditFact(request, "human");
		}
		/** Human fact delete (tombstone). */
		humanDeleteFact(agent, request) {
			this.core.humanDeleteFact(request, "human");
			return { deleted: true };
		}
		/** Human fact confirmation (lock/unlock). */
		humanConfirmFact(agent, request) {
			return this.core.humanConfirmFact(request, "human");
		}
		/** Human acknowledgement of a pending diary entry (reviewed, no fact extracted). */
		humanAckDiary(agent, request) {
			return this.core.humanAckDiary(request, "human");
		}
		/** Human lifecycle change of a top-level concern (007 §2.4). */
		humanSetConcernStatus(agent, request) {
			this.core.humanSetConcernStatus(request, "human");
			return { ok: true };
		}
		/** Human delete of a concern subtree (007 §2.4). */
		humanDeleteConcern(agent, request) {
			this.core.humanDeleteConcern(request, "human");
			return { deleted: true };
		}
	};
})();
//#endregion
//#region lib/types/index.js
/**
* Memory library host plugin: the self-evolving memory layer (生·用·修·记 +
* diary/fact semantic memory). One process-global library shared by every
* session, backed by a local SQLite file. Registers `ctx.memory`
* (MemoryService). The monitoring UI is an independent left-sidebar nav group
* (browser half), not a workspace; this host half performs no workspace
* adoption.
* @module dsh-daoing-memory
*/
/** Resolve the plugin config with explicit defaults; unknown keys fail loud. */
function resolveConfig(config) {
	const home = process.env.DSH_HOME ?? join(process.cwd(), ".dsh");
	const known = [
		"databasePath",
		"workspacePath",
		"workspaceTitle",
		"diaryExtractEvery",
		"diaryExtractIntervalHours",
		"recallTopK",
		"injectionBudgetTokens",
		"challengeConsecutiveFails",
		"challengeWindow",
		"challengeWindowFailRate",
		"familyLiveCap",
		"complexityTokenGate",
		"complexityStepGate",
		"duplicateOverlapGate",
		"recallFloorScore",
		"shadowPassRate",
		"deletionFeedbackIntervalHours",
		"deletionFeedbackMinDeletions"
	];
	const unknown = Object.keys(config).filter((key) => !known.includes(key));
	if (unknown.length > 0) throw new Error(`memory: unknown config key(s) ${unknown.join(", ")}`);
	return {
		databasePath: resolve(config.databasePath ?? join(home, "storages", "memory.db")),
		workspacePath: resolve(config.workspacePath ?? join(home, "memory-workbench")),
		workspaceTitle: config.workspaceTitle ?? "记忆监控",
		diaryExtractEvery: config.diaryExtractEvery ?? DEFAULT_CORE_CONFIG.diaryExtractEvery,
		diaryExtractIntervalHours: config.diaryExtractIntervalHours ?? DEFAULT_CORE_CONFIG.diaryExtractIntervalHours,
		recallTopK: config.recallTopK ?? DEFAULT_CORE_CONFIG.recallTopK,
		injectionBudgetTokens: config.injectionBudgetTokens ?? DEFAULT_CORE_CONFIG.injectionBudgetTokens,
		challengeConsecutiveFails: config.challengeConsecutiveFails ?? DEFAULT_CORE_CONFIG.challengeConsecutiveFails,
		challengeWindow: config.challengeWindow ?? DEFAULT_CORE_CONFIG.challengeWindow,
		challengeWindowFailRate: config.challengeWindowFailRate ?? DEFAULT_CORE_CONFIG.challengeWindowFailRate,
		familyLiveCap: config.familyLiveCap ?? DEFAULT_CORE_CONFIG.familyLiveCap,
		complexityTokenGate: config.complexityTokenGate ?? DEFAULT_CORE_CONFIG.complexityTokenGate,
		complexityStepGate: config.complexityStepGate ?? DEFAULT_CORE_CONFIG.complexityStepGate,
		duplicateOverlapGate: config.duplicateOverlapGate ?? DEFAULT_CORE_CONFIG.duplicateOverlapGate,
		recallFloorScore: config.recallFloorScore ?? DEFAULT_CORE_CONFIG.recallFloorScore,
		shadowPassRate: config.shadowPassRate ?? DEFAULT_CORE_CONFIG.shadowPassRate,
		deletionFeedbackIntervalHours: config.deletionFeedbackIntervalHours ?? DEFAULT_CORE_CONFIG.deletionFeedbackIntervalHours,
		deletionFeedbackMinDeletions: config.deletionFeedbackMinDeletions ?? DEFAULT_CORE_CONFIG.deletionFeedbackMinDeletions
	};
}
/**
* Host plugin body: open the SQLite store, provide `ctx.memory`, and adopt
* the monitoring workspace directory once a workspace registry is available.
* @param ctx - host context.
* @param config - plugin config (see {@link Config}).
*/
function apply(ctx, config = {}) {
	const resolved = resolveConfig(config);
	const coreConfig = {
		...DEFAULT_CORE_CONFIG,
		diaryExtractEvery: resolved.diaryExtractEvery,
		diaryExtractIntervalHours: resolved.diaryExtractIntervalHours,
		recallTopK: resolved.recallTopK,
		injectionBudgetTokens: resolved.injectionBudgetTokens,
		challengeConsecutiveFails: resolved.challengeConsecutiveFails,
		challengeWindow: resolved.challengeWindow,
		challengeWindowFailRate: resolved.challengeWindowFailRate,
		familyLiveCap: resolved.familyLiveCap,
		complexityTokenGate: resolved.complexityTokenGate,
		complexityStepGate: resolved.complexityStepGate,
		duplicateOverlapGate: resolved.duplicateOverlapGate,
		recallFloorScore: resolved.recallFloorScore,
		shadowPassRate: resolved.shadowPassRate,
		deletionFeedbackIntervalHours: resolved.deletionFeedbackIntervalHours,
		deletionFeedbackMinDeletions: resolved.deletionFeedbackMinDeletions
	};
	mkdirSync(join(resolved.databasePath, ".."), { recursive: true });
	const db = new DatabaseSync(resolved.databasePath);
	const core = new MemoryCore(new MemoryStore(db), coreConfig);
	const workbenchInfo = () => ({
		workspacePath: resolved.workspacePath,
		workspaceTitle: resolved.workspaceTitle,
		databasePath: resolved.databasePath,
		diaryExtractEvery: resolved.diaryExtractEvery,
		injectionBudgetTokens: resolved.injectionBudgetTokens
	});
	new MemoryService(ctx, core, workbenchInfo);
	ctx.effect(() => () => {
		try {
			db.close();
		} catch {}
	}, "memory: SQLite store lifetime");
}
//#endregion
export { DEFAULT_CORE_CONFIG, MEMORY_SCHEMA_VERSION, MemoryCore, MemoryService, MemoryStore, apply, resolveConfig };
