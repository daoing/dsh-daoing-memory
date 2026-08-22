/**
 * Model-facing tools over the memory library: the agent drives its own
 * 生·用·修·记 loop through these tools.
 *
 * - memory_recall:  用 — before a task: recall + adjudication + budget.
 * - memory_refine:  生 — after a complex task: refine into a candidate.
 * - memory_report:  用·验 — report one outcome with attribution.
 * - memory_revise:  修 — propose a revision for a challenged experience.
 * - memory_verify:  修 — shadow-replay verification of a draft (V1).
 * - memory_fact:    记 — append a diary entry (event layer).
 * - memory_extract: 记 — propose extracted profile facts (upward channel).
 * - memory_human_inject: 特殊通道 — direct human experience injection (source=human, ledger-audited).
 * - memory_ledger:  账本 — query the audit ledger.
 *
 * @module dsh-daoing-memory/tools
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GenericCallView, ToolRunContext } from '@deepseek-ai/dsh-tools'
import type {
  DiaryAppendResult,
  ExperienceSnapshot,
  ExtractFactsResult,
  RecallExperiencesResult,
} from './types.ts'

export const name = 'memory-tools'
export const inject = ['memory', 'tools', 'systemPrompt']

/** Generic, args-only pending presentation shared by the memory tools. */
function present(title: string, kind: 'read' | 'other', rawInput?: unknown): GenericCallView {
  return { card: 'generic', title, kind, ...rawInput === undefined ? {} : { rawInput } }
}

/** Resolve the live calling agent; memory tools mutate shared state, so an owner is required. */
function callingAgent(exec: ToolRunContext): Agent {
  if (exec.agent === undefined) {
    throw new Error('memory tools require a calling agent')
  }
  return exec.agent
}

/** Format the Beta-posterior triple (trust, samples, last verified). */
function trustTriple(e: ExperienceSnapshot): string {
  const last = e.lastVerifiedAt === undefined
    ? '从未验证'
    : new Date(e.lastVerifiedAt).toISOString().slice(0, 10)
  return `置信${e.trust.toFixed(2)}(样本${String(e.samples)}, 最近验证${last})`
}

/** Compact text rendering of one recalled experience. */
function renderRecalled(result: RecallExperiencesResult): string {
  if (result.none) return `【负向通道】无相关经验：${result.reason ?? '经验库中没有匹配项'}（这是一次全新探索）`
  const blocks = result.items.map((item) => {
    const e = item.experience
    const steps = e.path.map(p => `${String(p.order)}. ${p.action}`).join(' → ')
    const head = e.kind === 'negative'
      ? `⚠️ 负经验 ${e.id} [v${String(e.revision)} ${e.status}] ${trustTriple(e)}`
      : `经验 ${e.id} [v${String(e.revision)} ${e.status}] ${trustTriple(e)}`
    const lines = [
      `${head}（相关度 ${item.score.toFixed(2)}，裁决：${item.verdict}）`,
      `  摘要: ${e.gist}`,
      e.kind === 'negative' && e.failureReason !== undefined ? `  失败原因: ${e.failureReason}` : '',
      `  情境: ${e.situation.join(', ')}`,
      `  路径: ${steps}`,
      `  判断背景: ${e.reasoning}`,
      e.limits.length > 0 ? `  限制: ${e.limits.join('; ')}` : '',
      item.conflicts.length > 0 ? `  ⚠️ 与当前情境可能冲突的边界: ${item.conflicts.join('; ')}` : '',
    ]
    return lines.filter(Boolean).join('\n')
  })
  const tail = result.omitted > 0 ? `\n（注入预算内省略 ${String(result.omitted)} 条）` : ''
  return blocks.join('\n\n') + tail
}

const RECALL_DESCRIPTION =
  'Recall earned experiences for a similar situation. Call this BEFORE starting a complex task. '
  + 'Returns verified paths with judgment context, an adjudication verdict (direct/reference/clue), '
  + 'limit-conflict warnings, and an explicit "no relevant experience" negative channel. '
  + 'Follow a direct verdict instead of re-exploring; treat reference verdicts as adaptation material.'

const RECALL_PARAMETERS = {
  situation: {
    type: 'string',
    required: true,
    description: 'The new task situation, described freely (task type, domain, symptoms, constraints).',
  },
  topK: {
    type: 'integer',
    description: 'Max candidates before adjudication (default 6).',
  },
  deep: {
    type: 'boolean',
    description: 'Also search archived experiences (deep lookup) when the normal set is thin.',
  },
  context: {
    type: 'string',
    description: 'Active context/domain scope (e.g. "coding-windows-build"). Only same-context or globally-shared experiences are recalled.',
  },
} as const

interface RecallToolValue {
  none: boolean
  reason?: string
  omitted: number
  estimatedTokens: number
  items: {
    id: string
    revision: number
    kind: string
    status: string
    gist: string
    failureReason?: string
    situation: string[]
    path: { action: string; order: number }[]
    reasoning: string
    limits: string[]
    trust: number
    samples: number
    lastVerifiedAt?: number
    score: number
    verdict: string
    conflicts: string[]
    context: string
    verifiedCount: number
    rejectCount: number
    globalFlag: boolean
  }[]
  candidateTrials: {
    id: string
    revision: number
    gist: string
    situation: string[]
    score: number
  }[]
  /** Consolidation cadence nudge (008 §1). */
  consolidationDue: boolean
}

/** memory_ingest tool result. */
interface IngestToolValue {
  accepted: number
  acceptedIds: string[]
  rejected: { gist: string; reason: string }[]
}

const RECALL_OUTPUT = {
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      none: { type: 'boolean', required: true },
      reason: { type: 'string' },
      omitted: { type: 'integer', required: true },
      estimatedTokens: { type: 'integer', required: true },
      items: {
        type: 'array',
        required: true,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string', required: true },
            revision: { type: 'integer', required: true },
            kind: { type: 'string', required: true },
            status: { type: 'string', required: true },
            gist: { type: 'string', required: true },
            failureReason: { type: 'string' },
            situation: { type: 'array', required: true, items: { type: 'string' } },
            path: {
              type: 'array',
              required: true,
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  action: { type: 'string', required: true },
                  order: { type: 'integer', required: true },
                },
              },
            },
            reasoning: { type: 'string', required: true },
            limits: { type: 'array', required: true, items: { type: 'string' } },
            trust: { type: 'number', required: true },
            samples: { type: 'integer', required: true },
            lastVerifiedAt: { type: 'integer' },
            score: { type: 'number', required: true },
            verdict: { type: 'string', required: true },
            conflicts: { type: 'array', required: true, items: { type: 'string' } },
          },
        },
      },
      candidateTrials: {
        type: 'array',
        required: true,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string', required: true },
            revision: { type: 'integer', required: true },
            gist: { type: 'string', required: true },
            situation: { type: 'array', required: true, items: { type: 'string' } },
            score: { type: 'number', required: true },
          },
        },
      },
      consolidationDue: { type: 'boolean', required: true },
    },
  } as const,
  render: (_args: unknown, value: RecallToolValue) => [{
    type: 'text' as const,
    text: renderRecalled({
      none: value.none,
      omitted: value.omitted,
      estimatedTokens: value.estimatedTokens,
      candidateTrials: [],
      consolidationDue: value.consolidationDue,
      ...(value.reason === undefined ? {} : { reason: value.reason }),
      items: value.items.map(item => ({
        score: item.score,
        verdict: item.verdict as 'direct' | 'reference' | 'clue',
        conflicts: item.conflicts,
        experience: {
          id: item.id,
          revision: item.revision,
          kind: item.kind as ExperienceSnapshot['kind'],
          source: 'agent' as const,
          family: '',
          gist: item.gist,
          situation: item.situation,
          path: item.path,
          reasoning: item.reasoning,
          limits: item.limits,
          status: item.status as ExperienceSnapshot['status'],
          alpha: 0,
          beta: 0,
          samples: item.samples,
          trust: item.trust,
          weightedTrust: item.trust,
          pinned: false,
          tokensSaved: 0,
          tokensSpent: 0,
          context: item.context,
          verifiedCount: item.verifiedCount,
          rejectCount: item.rejectCount,
          globalFlag: item.globalFlag,
          createdAt: 0,
          updatedAt: 0,
          ...(item.failureReason === undefined ? {} : { failureReason: item.failureReason }),
          ...(item.lastVerifiedAt === undefined ? {} : { lastVerifiedAt: item.lastVerifiedAt }),
        },
      })),
    }) + (value.candidateTrials.length === 0
      ? ''
      : '\n\n候选试探（未验证，可匹配则试一次，成功后 report 转正，失败会进冷宫）：\n'
        + value.candidateTrials.map(t => `- [${t.id}] ${t.gist}（相关度 ${t.score.toFixed(2)}）`).join('\n'))
      + (value.consolidationDue
        ? '\n\n🧹 巩固周期已到：经验库积累了较多相关条目，建议在合适时机调用 memory_consolidate，把相关经验合并提炼为更精炼的一条。'
        : ''),
  }],
}

const REFINE_DESCRIPTION =
  '生: refine a completed complex task into a durable experience candidate (unverified; it must '
  + 'earn live status through verification). Call this AFTER a task with meaningful judgment '
  + '(wrong paths tried, course corrected, limits hit, or a confirmed dead end). Do NOT refine '
  + 'trivial single-tool calls. ONE experience = ONE reusable lesson: if the task taught several '
  + 'distinct lessons, submit separate refine calls instead of one blob. Write every field '
  + 'GENERALIZED for future reuse — never a session chronicle ("本会话/本次/用户当场…"): the session is '
  + 'only the evidence pointer. Supply the episodic evidence pointer (trace/session/note) — '
  + 'assertions without evidence are rejected. kind=negative records a confirmed dead end with failureReason.'

const REFINE_PARAMETERS = {
  kind: {
    type: 'string',
    required: true,
    enum: ['positive', 'negative'],
    description: 'positive = a path that works; negative = a confirmed dead end (requires failureReason).',
  },
  family: {
    type: 'string',
    required: true,
    description: 'Task-family tag for capacity budgeting and consolidation (e.g. "windows-build", "pnpm-install").',
  },
  gist: {
    type: 'string',
    required: true,
    description: 'ONE crisp reusable lesson in one sentence (the path or the dead end). Not a multi-clause event report; if you need "；" to cram several lessons, split them.',
  },
  situation: {
    type: 'array',
    required: true,
    items: { type: 'string' },
    description: 'The CLASS of situation that should trigger recall later (task type, domain, symptoms) — generalizable, not "this specific task I just did".',
  },
  path: {
    type: 'array',
    required: true,
    items: {
      type: 'object',
      additionalProperties: false,
      properties: {
        action: { type: 'string', required: true, description: 'What was done (tool call, action, decision).' },
        order: { type: 'integer', required: true, description: 'Order matters.' },
      },
    },
    description: 'The actual steps in order (the dead-end steps for negative experiences).',
  },
  reasoning: {
    type: 'string',
    required: true,
    description: 'TRANSFERABLE judgment background, de-contextualized: "under <situation>, this path holds BECAUSE <cause>; the boundary is <limits>." Explain the why/what-was-corrected so a stranger could reuse it. NEVER narrate the session ("本会话/本次/用户当场纠正…") — cite the session only via the evidence pointer.',
  },
  limits: {
    type: 'array',
    items: { type: 'string' },
    description: 'When this path does NOT apply (pitfalls, anti-patterns, boundary conditions).',
  },
  failureReason: {
    type: 'string',
    description: 'Required for kind=negative: the confirmed reason the path fails.',
  },
  evidence: {
    type: 'object',
    required: true,
    additionalProperties: false,
    properties: {
      traceRef: { type: 'string', description: 'Pointer to the original execution trace.' },
      sessionRef: { type: 'string', description: 'Pointer to the originating session.' },
      note: { type: 'string', description: 'Free-text evidence note.' },
    },
    description: 'Episodic evidence pointer — at least one field must be non-empty.',
  },
  complexity: {
    type: 'object',
    required: true,
    additionalProperties: false,
    properties: {
      tokens: { type: 'integer', description: 'Approximate token cost of the trajectory.' },
      steps: { type: 'integer', description: 'Step count of the trajectory.' },
      hadFailure: { type: 'boolean', description: 'Whether the trajectory contained failures.' },
    },
    description: 'Complexity gate input; below both gates (and no failure) the refine is rejected.',
  },
  humanMarked: {
    type: 'boolean',
    description: 'True when a human asked to remember this — bypasses the complexity gate.',
  },
  context: {
    type: 'string',
    description: 'Context/domain scope this experience belongs to (e.g. "coding-windows-build").',
  },
} as const

interface RefineToolValue {
  accepted: boolean
  reason?: string
  id?: string
  revision?: number
  status?: string
  corroboratedId?: string
}

const REFINE_OUTPUT = {
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      accepted: { type: 'boolean', required: true },
      reason: { type: 'string' },
      id: { type: 'string' },
      revision: { type: 'integer' },
      status: { type: 'string' },
      corroboratedId: { type: 'string' },
    },
  } as const,
  render: (_args: unknown, value: RefineToolValue) => [{
    type: 'text' as const,
    text: value.accepted
      ? `已沉淀候选经验 [${value.id ?? ''}] v${String(value.revision ?? 1)}（candidate，等待验证转正）`
      : `提炼被门控拒绝：${value.reason ?? 'unknown'}${value.corroboratedId !== undefined ? `（已佐证既有经验 ${value.corroboratedId}）` : ''}`,
  }],
}

const REPORT_DESCRIPTION =
  '用·验: report one use outcome for an experience — using it IS verifying it (V0). Call this AFTER '
  + 'you followed a recalled experience (or after confirming a negative experience predicted a dead end: '
  + 'for negatives, outcome=success means the prediction held). Attribution for failures: '
  + 'experience (path defect), environment (infra/network/permission — never counts against the experience), '
  + 'unrelated, or unknown (insufficient signal — not counted). Objective evidence notes take priority '
  + 'over the claim. Repeated reports with the same dedupeKey count once. Reporting success on a '
  + 'candidate/draft revision promotes or adopts it.'

const REPORT_PARAMETERS = {
  id: {
    type: 'string',
    required: true,
    description: 'Experience family id (from memory_recall).',
  },
  revision: {
    type: 'integer',
    description: 'Target revision: omit for the active one; pass a draft revision to verify it.',
  },
  outcome: {
    type: 'string',
    required: true,
    enum: ['success', 'fail'],
    description: 'Did following the experience succeed (for negatives: did the prediction hold)?',
  },
  attribution: {
    type: 'string',
    enum: ['experience', 'environment', 'unrelated', 'unknown'],
    description: 'On fail: why it failed. experience-attributed failures need an evidence note.',
  },
  evidence: {
    type: 'object',
    additionalProperties: false,
    properties: {
      traceRef: { type: 'string' },
      sessionRef: { type: 'string' },
      note: { type: 'string', description: 'Objective failure evidence (error text, symptom).' },
    },
    description: 'Objective evidence; its note can override the claimed attribution.',
  },
  tokensUsed: { type: 'integer', description: 'Tokens this execution spent.' },
  tokensSaved: { type: 'integer', description: 'Tokens saved versus re-exploring.' },
  dedupeKey: { type: 'string', description: 'Idempotency key: one execution reports once.' },
} as const

interface ReportToolValue {
  id: string
  status: string
  trust: number
  samples: number
  counted: string
  attributionApplied: string
  overrideNote?: string
  challenged: boolean
  promoted: boolean
  adopted: boolean
}

const REPORT_OUTPUT = {
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      id: { type: 'string', required: true },
      status: { type: 'string', required: true },
      trust: { type: 'number', required: true },
      samples: { type: 'integer', required: true },
      counted: { type: 'string', required: true },
      attributionApplied: { type: 'string', required: true },
      overrideNote: { type: 'string' },
      challenged: { type: 'boolean', required: true },
      promoted: { type: 'boolean', required: true },
      adopted: { type: 'boolean', required: true },
    },
  } as const,
  render: (_args: unknown, value: ReportToolValue) => {
    const notes: string[] = []
    if (value.counted === 'alpha') notes.push('计入成功样本 α+1')
    else if (value.counted === 'beta') notes.push('计入失败样本 β+1')
    else notes.push('未计入（环境失败/信号不足/幂等去重）')
    if (value.overrideNote !== undefined) notes.push(value.overrideNote)
    if (value.challenged) notes.push('⚠️ 已隔离（challenged，移出召回集，需修订）')
    if (value.adopted) notes.push('修订版通过验证转正（旧版转 superseded 可回滚）')
    else if (value.promoted) notes.push('通过验证转正为 live')
    return [{ type: 'text' as const, text: `经验 [${value.id}] ${value.status} ${trustTripleShort(value)} — ${notes.join('；')}` }]
  },
}

/** Short trust triple for the report render. */
function trustTripleShort(value: ReportToolValue): string {
  return `置信${value.trust.toFixed(2)}(样本${String(value.samples)})`
}

const REVISE_DESCRIPTION =
  '修: propose a revised draft (v+1) for a CHALLENGED experience. The challenged original is already '
  + 'quarantined (out of recall). The draft stays a candidate until verified: report one successful '
  + 'use against the draft revision (or use memory_verify shadow replay) to adopt it; adoption turns '
  + 'the old version into a superseded read-only index (rollback-able). Supply the diagnosis as reason.'

const REVISE_PARAMETERS = {
  id: {
    type: 'string',
    required: true,
    description: 'Experience family id (must be challenged).',
  },
  reason: {
    type: 'string',
    required: true,
    description: 'Diagnosis: root cause of the failures and what this revision changes.',
  },
  gist: { type: 'string', description: 'Replacement gist (kept when omitted).' },
  situation: { type: 'array', items: { type: 'string' }, description: 'Replacement situations.' },
  path: {
    type: 'array',
    items: {
      type: 'object',
      additionalProperties: false,
      properties: {
        action: { type: 'string', required: true },
        order: { type: 'integer', required: true },
      },
    },
    description: 'Replacement path.',
  },
  reasoning: { type: 'string', description: 'Replacement reasoning.' },
  limits: { type: 'array', items: { type: 'string' }, description: 'Replacement limits.' },
} as const

interface ReviseToolValue {
  id: string
  revision: number
  status: string
  parentRevision?: number
}

const REVISE_OUTPUT = {
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      id: { type: 'string', required: true },
      revision: { type: 'integer', required: true },
      status: { type: 'string', required: true },
      parentRevision: { type: 'integer' },
    },
  } as const,
  render: (_args: unknown, value: ReviseToolValue) => [{
    type: 'text' as const,
    text: `已提出修订草案 [${value.id}] v${String(value.revision)}（candidate，验证通过才转正；父版 v${String(value.parentRevision ?? 0)}）`,
  }],
}

const VERIFY_DESCRIPTION =
  '修·V1: controlled re-enactment (shadow replay) for a revised draft: replay historical situations '
  + 'with known outcomes against the draft. Passing adopts the draft without spending a real attempt. '
  + 'Use when a real retry is expensive or risky.'

const VERIFY_PARAMETERS = {
  id: { type: 'string', required: true, description: 'Experience family id.' },
  revision: { type: 'integer', required: true, description: 'The draft revision to verify.' },
  samples: {
    type: 'array',
    required: true,
    items: {
      type: 'object',
      additionalProperties: false,
      properties: {
        situation: { type: 'string', required: true, description: 'A historical situation.' },
        expected: { type: 'string', required: true, enum: ['success', 'fail'], description: 'Its known outcome.' },
      },
    },
    description: 'Historical situations with known outcomes.',
  },
} as const

interface VerifyToolValue {
  passed: boolean
  agreement: number
  reason?: string
  status?: string
}

const VERIFY_OUTPUT = {
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      passed: { type: 'boolean', required: true },
      agreement: { type: 'number', required: true },
      reason: { type: 'string' },
      status: { type: 'string' },
    },
  } as const,
  render: (_args: unknown, value: VerifyToolValue) => [{
    type: 'text' as const,
    text: value.passed
      ? `影子重放通过（一致率 ${(value.agreement * 100).toFixed(0)}%），修订版已转正 live`
      : `影子重放未通过（一致率 ${(value.agreement * 100).toFixed(0)}%）：${value.reason ?? ''}`,
  }],
}

const FACT_DESCRIPTION =
  '记: append one diary entry about an important interaction with the user (event layer — permanent, '
  + 'never auto-deleted). Record: what the user SAID, what they DELEGATED, what you PROMISED, what '
  + 'HAPPENED, PREFERENCE changes, and how you RESPONDED to the user (so the exchange is traceable '
  + 'both ways). Call this promptly after the interaction. When the response says extractionDue, call '
  + 'memory_extract to distill profile facts (the AI\'s perception of the user) AND open-loop concern '
  + 'memos from the pending diary window.'

const FACT_PARAMETERS = {
  kind: {
    type: 'string',
    required: true,
    enum: ['said', 'delegated', 'promised', 'happened', 'preference', 'other'],
    description: 'What kind of interaction this records.',
  },
  content: {
    type: 'string',
    required: true,
    description: 'The diary content: who/what/when in one durable paragraph.',
  },
  sessionRef: { type: 'string', description: 'Pointer to the session this happened in.' },
  tags: { type: 'array', items: { type: 'string' }, description: 'Free tags for retrieval.' },
} as const

interface FactToolValue {
  id: string
  extractionDue: boolean
  pendingCount: number
  pending: { id: string; kind: string; content: string; ts: number }[]
}

const FACT_OUTPUT = {
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      id: { type: 'string', required: true },
      extractionDue: { type: 'boolean', required: true },
      pendingCount: { type: 'integer', required: true },
      pending: {
        type: 'array',
        required: true,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            id: { type: 'string', required: true },
            kind: { type: 'string', required: true },
            content: { type: 'string', required: true },
            ts: { type: 'integer', required: true },
          },
        },
      },
    },
  } as const,
  render: (_args: unknown, value: FactToolValue) => [{
    type: 'text' as const,
    text: value.extractionDue
      ? `日记已记录 [${value.id}]。⏰ 提取周期已到：请阅读 ${String(value.pendingCount)} 条待提取日记，调用 memory_extract 提交稳定画像条目（带来源指针）。`
      : `日记已记录 [${value.id}]（待提取 ${String(value.pendingCount)} 条，未到提取周期）`,
  }],
}

const EXTRACT_DESCRIPTION =
  '记·上升通道: distill the pending diary window into (a) profile facts and (b) concern memos. '
  + 'Facts = the AI\'s perception of the USER — durable traits/preferences/communication/values/thinking '
  + 'that help collaborate with THIS person (category per its enum definition). Project content, goals, '
  + 'decisions and task context are NOT profile: route open ones to concerns, drop the rest. ONLY the '
  + 'user\'s own statements may produce facts; when unsure use category=other with a note (parked for '
  + 'human ruling, never force-fit). A fact identical to an existing one (same category+factKey+value) '
  + 'stays ONE entry — re-propose it to add citations/corroboration, never a duplicate. Concerns = '
  + 'OPEN-LOOP MEMOS kept for the USER to be reminded of — something raised but NOT yet closed (todo / '
  + 'thinking / idea / open question / decision / one-off commitment). Every NEW memo MUST carry background '
  + '(the scene: when/why it came up) so the user can recall it; if a question was already answered, record '
  + 'the answer and close it; use mention to summarize each later round of discussion. Recurring HABITS go '
  + 'to profile and reusable HOW-TOs go to experience — neither is a concern. NOT topic/project labels. '
  + 'action=new once per memo, then action=mention under the same concernId; action=status when it closes. '
  + 'Each proposal/mention needs source diary ids. Conflicting values supersede unlocked facts (old value '
  + 'kept as history); locked facts are parked for human ruling.'

const EXTRACT_PARAMETERS = {
  proposals: {
    type: 'array',
    required: true,
    items: {
      type: 'object',
      additionalProperties: false,
      properties: {
        category: {
          type: 'string',
          required: true,
          enum: ['identity', 'preference', 'communication', 'habit', 'thinking', 'value', 'delegation', 'background', 'other'],
          description: 'Profile facet = the AI\'s perception of the USER (NOT project content): identity=who/role; preference=non-business likes/style/taste; communication=how to talk and collaborate with them; habit=recurring behavior; thinking=reasoning/methodology style; value=values/beliefs/principles; delegation=how they delegate/authorize autonomy; background=durable context, environment, resources and accounts they own; other=uncertain (park for human ruling). Project goals/decisions/ideas are NOT profile — send open ones to concerns.',
        },
        factKey: { type: 'string', required: true, description: 'Stable slot key inside the category (e.g. "timezone").' },
        value: { type: 'string', required: true, description: 'The fact value.' },
        sourceDiaryIds: {
          type: 'array',
          required: true,
          items: { type: 'string' },
          description: 'Diary entries this fact was extracted from (source pointers).',
        },
        note: { type: 'string', description: 'Optional extraction note; required-ish for other (why uncertain).' },
      },
    },
    description: 'Proposed stable profile facts (only from the user\'s own statements).',
  },
  concerns: {
    type: 'array',
    items: {
      type: 'object',
      additionalProperties: false,
      properties: {
        action: { type: 'string', required: true, enum: ['new', 'mention', 'status'] },
        title: { type: 'string', description: 'new: the memo headline — what the user raised that is still open; mention: one-line SUMMARY of that round of discussion (this is how the sub-level is used).' },
        background: { type: 'string', description: 'new (REQUIRED for new): the background scene — when/why it came up and enough context that reading this memo alone lets the user recall it. Omit for mention/status.' },
        kind: { type: 'string', enum: ['todo', 'thinking', 'idea', 'question', 'decision', 'commitment', 'other'], description: 'new: the memo type — todo=raised but not done yet; thinking=something the user is mulling over/reflecting on; idea=a notion/aspiration; question=an open question (if it was already answered in the talk, record the answer and close it); decision=a pending or made decision (note the why); commitment=a ONE-OFF promise/appointment; other=uncertain. A RECURRING habit goes to profile, a REUSABLE how-to goes to experience — neither is a concern.' },
        status: { type: 'string', enum: ['ongoing', 'concluded', 'recurring', 'paused'], description: 'status: lifecycle for an existing memo — ongoing=still open; concluded=closed/done; recurring=keeps coming back; paused=parked.' },
        concernId: { type: 'string', description: 'mention/status: the target top-level concern id.' },
        sourceDiaryIds: { type: 'array', required: true, items: { type: 'string' } },
      },
    },
    description: 'Open-loop memos kept FOR THE USER to be reminded of: new = a raised-but-unclosed item (todo / thinking / idea / open question / decision / one-off commitment) WITH its background scene; mention = the same item touched again (summarize the discussion); status = it closed or changed. A question whose answer is already known must carry the answer. NOT topic/project labels; NOT recurring habits (those are profile); NOT reusable how-tos (those are experiences).',
  },
  summary: { type: 'string', required: true, description: 'One-line summary of the extraction window.' },
} as const

interface ExtractToolValue {
  applied: number
  conflicts: number
  rejected: { reason: string }[]
  appliedConcerns: number
}

const EXTRACT_OUTPUT = {
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      applied: { type: 'integer', required: true },
      conflicts: { type: 'integer', required: true },
      rejected: {
        type: 'array',
        required: true,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            reason: { type: 'string', required: true },
          },
        },
      },
      appliedConcerns: { type: 'integer', required: true },
    },
  } as const,
  render: (_args: unknown, value: ExtractToolValue) => [{
    type: 'text' as const,
    text: `画像提取完成：生效 ${String(value.applied)} 条，关心事项更新 ${String(value.appliedConcerns)} 项，待人工裁决冲突 ${String(value.conflicts)} 条，拒绝 ${String(value.rejected.length)} 条`
      + (value.rejected.length > 0 ? `（${value.rejected.map(r => r.reason).join('；')}）` : ''),
  }],
}

const LEDGER_DESCRIPTION =
  'Query the memory audit ledger (append-only event sourcing: every refine/use/challenge/revision/'
  + 'rollback/human operation). Filter by object or operation. Human operations are always audited.'

const LEDGER_PARAMETERS = {
  objectType: {
    type: 'string',
    enum: ['experience', 'fact', 'diary', 'library'],
    description: 'Filter by object type.',
  },
  objectId: { type: 'string', description: 'Filter by object id (e.g. an experience id).' },
  op: { type: 'string', description: 'Filter by operation name (refine/use/challenge/propose/adopt/rollback/...).' },
  limit: { type: 'integer', description: 'Max blocks, newest first (default 20).' },
} as const

interface LedgerToolValue {
  blocks: { seq: number; ts: number; op: string; objectType: string; objectId: string; actor: string; reason?: string }[]
}

const LEDGER_OUTPUT = {
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      blocks: {
        type: 'array',
        required: true,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            seq: { type: 'integer', required: true },
            ts: { type: 'integer', required: true },
            op: { type: 'string', required: true },
            objectType: { type: 'string', required: true },
            objectId: { type: 'string', required: true },
            actor: { type: 'string', required: true },
            reason: { type: 'string' },
          },
        },
      },
    },
  } as const,
  render: (_args: unknown, value: LedgerToolValue) => [{
    type: 'text' as const,
    text: value.blocks.length === 0
      ? '账本中没有匹配的记录。'
      : value.blocks.map(b =>
        `#${String(b.seq)} ${new Date(b.ts).toISOString().slice(0, 16).replace('T', ' ')} ${b.op} ${b.objectType}:${b.objectId} by ${b.actor}${b.reason !== undefined ? `（${b.reason}）` : ''}`,
      ).join('\n'),
  }],
}

// ── memory_consolidate (008 §1): periodic merge of related experiences ──────

const CONSOLIDATE_DESCRIPTION =
  '记·巩固: merge a set of closely related experiences into ONE more distilled experience. Use when '
  + 'the recall output flags consolidation due, or when you notice several experiences that restate the '
  + 'same underlying lesson from different sessions. For each merge: list the source experience ids '
  + '(≥2, from memory_recall / the library) and write the consolidated gist/situation/path/reasoning/limits '
  + 'as a single transferable lesson — do not just concatenate; distill what is common and drop what is '
  + 'session-specific. The sources are archived (they leave recall but stay recoverable); the consolidated '
  + 'experience inherits their earned trust. Consolidation never hard-deletes anything.'

const CONSOLIDATE_PARAMETERS = {
  merges: {
    type: 'array',
    required: true,
    description: 'One entry per group of experiences to merge into one.',
    items: {
      type: 'object',
      additionalProperties: false,
      properties: {
        family: { type: 'string', required: true, description: 'Family tag of the consolidated experience.' },
        kind: { type: 'string', required: true, enum: ['positive', 'negative'], description: 'Kind of the consolidated experience.' },
        gist: { type: 'string', required: true, description: 'The single distilled, transferable lesson (one sentence).' },
        situation: { type: 'array', required: true, items: { type: 'string' }, description: 'When it applies (generalized).' },
        path: { type: 'array', required: true, items: { type: 'string' }, description: 'The reusable success path as ordered actions.' },
        reasoning: { type: 'string', required: true, description: 'Why it works — transferable, never a session chronicle.' },
        limits: { type: 'array', required: true, items: { type: 'string' }, description: 'Applicability limits/boundaries.' },
        sourceIds: { type: 'array', required: true, items: { type: 'string' }, description: 'Family ids of the experiences being merged (≥2).' },
        note: { type: 'string', description: 'Optional: why these belong together.' },
      },
    },
  },
  note: { type: 'string', description: 'Optional free-form summary of this consolidation run.' },
} as const

interface ConsolidateToolValue {
  consolidated: number
  archived: number
  skipped: { sourceIds: string[]; reason: string }[]
}

const CONSOLIDATE_OUTPUT = {
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      consolidated: { type: 'integer', required: true },
      archived: { type: 'integer', required: true },
      skipped: {
        type: 'array',
        required: true,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            sourceIds: { type: 'array', required: true, items: { type: 'string' } },
            reason: { type: 'string', required: true },
          },
        },
      },
    },
  } as const,
  render: (_args: unknown, value: ConsolidateToolValue) => [{
    type: 'text' as const,
    text: `巩固完成：合并出 ${String(value.consolidated)} 条精炼经验，归档 ${String(value.archived)} 条来源。`
      + (value.skipped.length === 0
        ? ''
        : `\n跳过 ${String(value.skipped.length)} 组：\n`
          + value.skipped.map(s => `- ${s.sourceIds.join(',')}：${s.reason}`).join('\n')),
  }],
}


/**
 * Host plugin body: register the memory tools and the 生·用·修·记 protocol
 * section. Mounted by each agent preset that should see the tools.
 * @param ctx - host context inside the agent realm.
 */
export function apply(ctx: Context): void {
  const memory = ctx.memory

  ctx.systemPrompt.section({
    name: 'tool:memory',
    order: 115,
    text: 'Self-evolving memory (生·用·修·记): one shared library of VERIFIED procedural '
      + 'experiences (paths that worked, with judgment context and limits) plus permanent '
      + 'user facts. Unverified candidates never enter trusted recall — knowledge is earned. '
      + 'Experiences are scoped by a context/domain: pass context to recall so unrelated domains '
      + 'do not bleed in. '
      + '1) BEFORE a complex task, call memory_recall with the current context; follow direct '
      + 'verdicts, adapt reference verdicts, respect limit-conflict warnings; an explicit '
      + '"no relevant experience" means explore fresh. If candidateTrials are returned, they are '
      + 'UNVERIFIED matches: you may trial one, then memory_report the outcome (success promotes it; '
      + 'failure sends it to the cold palace). '
      + '2) AFTER a complex task (wrong paths, corrections, limits hit, or a confirmed dead end), '
      + 'call memory_refine with the episodic evidence pointer and the context; never refine trivial calls. '
      + 'One lesson per call, written generalized: reasoning states the transferable why/boundary, NEVER a '
      + 'session chronicle ("本会话/本次…"); the session is only the evidence pointer. '
      + '3) AFTER acting on a recalled experience, call memory_report with the outcome and honest '
      + 'attribution (environment failures never count; insufficient signal is not counted); one '
      + 'execution reports once (dedupeKey). '
      + '4) A challenged experience is quarantined: call memory_revise with a diagnosis, then '
      + 'verify the draft (one successful use via memory_report with the draft revision) before it goes live. '
      + '5) Diary discipline: after important user interactions call memory_fact (what the user '
      + 'said/delegated, what you promised, what happened, preference changes, and how you RESPONDED); '
      + 'when the response says extractionDue, call memory_extract to distill BOTH stable profile facts '
      + '(choose the facet by its definition; only the user\'s own statements qualify; unsure = category '
      + '"other" with a note, never force-fit) AND evolving concerns (a one-off cared-about thing, or a '
      + 'big category discussed repeatedly: new once, then mention per round). '
      + '6) To learn from an external source (a book, a skill, a document, a transcript), extract its '
      + 'lessons and call memory_ingest with sourceType, sourceRef provenance and context; each draft '
      + 'becomes an earned candidate. External sources NEVER produce profile facts or concerns — only '
      + 'the user\'s own words may. '
      + '7) Consolidation: when memory_recall flags consolidationDue (or you notice several experiences '
      + 'restating the same lesson), call memory_consolidate to merge the related ones into a single '
      + 'distilled experience — list the source ids and write one transferable lesson, not a concatenation. '
      + 'This keeps the library lean; sources are archived, never hard-deleted.',
  })

  // 010 §F: the profile (AI's perception of the user) + open concern memos are
  // injected into the AI's context at assembly time, so "profile is for the AI,
  // concerns remind the user" is realized at runtime — not just stored.
  ctx.systemPrompt.section({
    name: 'tool:memory-profile',
    order: 116,
    text: () => {
      try {
        const snapshot = memory.profileSnapshot()
        return snapshot === '' ? '' : `Long-term memory of this user:\n${snapshot}`
      } catch {
        return ''
      }
    },
  })

  ctx.tools.register(defineTool({
    name: 'memory_recall',
    description: RECALL_DESCRIPTION,
    parameters: RECALL_PARAMETERS,
    output: RECALL_OUTPUT,
    execute: async (args, exec) => {
      const result = await memory.recall(callingAgent(exec), {
        situation: args.situation,
        topK: args.topK ?? 6,
        deep: args.deep === true,
        ...(args.context === undefined ? {} : { context: args.context }),
      })
      const value: RecallToolValue = {
        none: result.none,
        omitted: result.omitted,
        estimatedTokens: result.estimatedTokens,
        ...(result.reason === undefined ? {} : { reason: result.reason }),
        items: result.items.map(item => ({
          id: item.experience.id,
          revision: item.experience.revision,
          kind: item.experience.kind,
          status: item.experience.status,
          gist: item.experience.gist,
          ...(item.experience.failureReason === undefined ? {} : { failureReason: item.experience.failureReason }),
          situation: [...item.experience.situation],
          path: item.experience.path.map(step => ({ action: step.action, order: step.order })),
          reasoning: item.experience.reasoning,
          limits: [...item.experience.limits],
          trust: item.experience.trust,
          samples: item.experience.samples,
          ...(item.experience.lastVerifiedAt === undefined ? {} : { lastVerifiedAt: item.experience.lastVerifiedAt }),
          score: item.score,
          verdict: item.verdict,
          conflicts: [...item.conflicts],
          context: item.experience.context,
          verifiedCount: item.experience.verifiedCount,
          rejectCount: item.experience.rejectCount,
          globalFlag: item.experience.globalFlag,
        })),
        candidateTrials: result.candidateTrials.map(trial => ({
          id: trial.experience.id,
          revision: trial.experience.revision,
          gist: trial.experience.gist,
          situation: [...trial.experience.situation],
          score: trial.score,
        })),
        consolidationDue: result.consolidationDue,
      }
      return value
    },
    presentCall: args => present('召回经验', 'read', args.situation),
  }))

  ctx.tools.register(defineTool({
    name: 'memory_refine',
    description: REFINE_DESCRIPTION,
    parameters: REFINE_PARAMETERS,
    output: REFINE_OUTPUT,
    execute: async (args, exec) => {
      const result = await memory.refine(callingAgent(exec), {
        kind: args.kind,
        family: args.family,
        gist: args.gist,
        situation: args.situation,
        path: args.path,
        reasoning: args.reasoning,
        limits: args.limits ?? [],
        ...(args.failureReason === undefined ? {} : { failureReason: args.failureReason }),
        evidence: args.evidence,
        complexity: args.complexity,
        humanMarked: args.humanMarked === true,
        ...(args.context === undefined ? {} : { context: args.context }),
      })
      const value: RefineToolValue = {
        accepted: result.accepted,
        ...(result.reason === undefined ? {} : { reason: result.reason }),
        ...(result.corroboratedId === undefined ? {} : { corroboratedId: result.corroboratedId }),
        ...(result.experience === undefined ? {} : {
          id: result.experience.id,
          revision: result.experience.revision,
          status: result.experience.status,
        }),
      }
      return value
    },
    presentCall: () => present('提炼经验', 'other'),
  }))

  ctx.tools.register(defineTool({
    name: 'memory_report',
    description: REPORT_DESCRIPTION,
    parameters: REPORT_PARAMETERS,
    output: REPORT_OUTPUT,
    execute: async (args, exec) => {
      const result = await memory.report(callingAgent(exec), {
        id: args.id,
        ...(args.revision === undefined ? {} : { revision: args.revision }),
        outcome: args.outcome,
        ...(args.attribution === undefined ? {} : { attribution: args.attribution }),
        ...(args.evidence === undefined ? {} : { evidence: args.evidence }),
        ...(args.tokensUsed === undefined ? {} : { tokensUsed: args.tokensUsed }),
        ...(args.tokensSaved === undefined ? {} : { tokensSaved: args.tokensSaved }),
        ...(args.dedupeKey === undefined ? {} : { dedupeKey: args.dedupeKey }),
      })
      const value: ReportToolValue = {
        id: result.snapshot.id,
        status: result.snapshot.status,
        trust: result.snapshot.trust,
        samples: result.snapshot.samples,
        counted: result.counted,
        attributionApplied: result.attributionApplied,
        ...(result.overrideNote === undefined ? {} : { overrideNote: result.overrideNote }),
        challenged: result.challenged,
        promoted: result.promoted,
        adopted: result.adopted,
      }
      return value
    },
    presentCall: args => present('汇报使用结果', 'other', args.id),
  }))

  ctx.tools.register(defineTool({
    name: 'memory_revise',
    description: REVISE_DESCRIPTION,
    parameters: REVISE_PARAMETERS,
    output: REVISE_OUTPUT,
    execute: async (args, exec) => {
      const snapshot = await memory.revise(callingAgent(exec), {
        id: args.id,
        reason: args.reason,
        ...(args.gist === undefined ? {} : { gist: args.gist }),
        ...(args.situation === undefined ? {} : { situation: args.situation }),
        ...(args.path === undefined ? {} : { path: args.path }),
        ...(args.reasoning === undefined ? {} : { reasoning: args.reasoning }),
        ...(args.limits === undefined ? {} : { limits: args.limits }),
      })
      const value: ReviseToolValue = {
        id: snapshot.id,
        revision: snapshot.revision,
        status: snapshot.status,
        ...(snapshot.parentRevision === undefined ? {} : { parentRevision: snapshot.parentRevision }),
      }
      return value
    },
    presentCall: args => present('提出修订草案', 'other', args.id),
  }))

  ctx.tools.register(defineTool({
    name: 'memory_verify',
    description: VERIFY_DESCRIPTION,
    parameters: VERIFY_PARAMETERS,
    output: VERIFY_OUTPUT,
    execute: async (args, exec) => {
      const result = await memory.verifyShadow(callingAgent(exec), {
        id: args.id,
        revision: args.revision,
        samples: args.samples,
      })
      const value: VerifyToolValue = {
        passed: result.passed,
        agreement: result.agreement,
        ...(result.reason === undefined ? {} : { reason: result.reason }),
        ...(result.snapshot === undefined ? {} : { status: result.snapshot.status }),
      }
      return value
    },
    presentCall: args => present('影子重放验证', 'other', args.id),
  }))

  ctx.tools.register(defineTool({
    name: 'memory_fact',
    description: FACT_DESCRIPTION,
    parameters: FACT_PARAMETERS,
    output: FACT_OUTPUT,
    execute: async (args, exec) => {
      const result: DiaryAppendResult = await memory.appendDiary(callingAgent(exec), {
        kind: args.kind,
        content: args.content,
        ...(args.sessionRef === undefined ? {} : { sessionRef: args.sessionRef }),
        ...(args.tags === undefined ? {} : { tags: args.tags }),
      })
      const value: FactToolValue = {
        id: result.entry.id,
        extractionDue: result.extractionDue,
        pendingCount: result.pendingDiary?.length ?? 0,
        pending: (result.pendingDiary ?? []).map(entry => ({
          id: entry.id,
          kind: entry.kind,
          content: entry.content,
          ts: entry.ts,
        })),
      }
      return value
    },
    presentCall: args => present('记日记', 'other', args.kind),
  }))

  ctx.tools.register(defineTool({
    name: 'memory_extract',
    description: EXTRACT_DESCRIPTION,
    parameters: EXTRACT_PARAMETERS,
    output: EXTRACT_OUTPUT,
    execute: async (args, exec) => {
      const result: ExtractFactsResult = await memory.extract(callingAgent(exec), {
        proposals: args.proposals,
        ...(args.concerns === undefined ? {} : { concerns: args.concerns }),
        summary: args.summary,
      })
      const value: ExtractToolValue = {
        applied: result.applied.length,
        conflicts: result.conflicts.length,
        rejected: result.rejected.map(entry => ({ reason: entry.reason })),
        appliedConcerns: result.appliedConcerns,
      }
      return value
    },
    presentCall: () => present('提取画像', 'other'),
  }))

  ctx.tools.register(defineTool({
    name: 'memory_ingest',
    description: '摄取归一: batch-submit experiences extracted from ANY source (a book, a skill, a document, '
      + 'a transcript). Each item becomes an earned candidate carrying provenance (sourceType + sourceRef) and the '
      + 'declared context scope; candidates never recall until verified. ONE item = ONE reusable lesson, written '
      + 'GENERALIZED (transferable reasoning, never a session/source chronicle; the sourceRef is the evidence '
      + 'pointer). Near-duplicates of existing experiences are corroborated, not re-added. Call this after '
      + 'reading/extracting from an external source you want the library to learn from.',
    parameters: {
      sourceType: {
        type: 'string',
        required: true,
        enum: ['conversation', 'document', 'skill', 'book', 'note', 'other'],
        description: 'What kind of source was read (sets the confidence prior).',
      },
      sourceRef: {
        type: 'string',
        required: true,
        description: 'Provenance pointer: which book / skill / session / document (audited).',
      },
      context: {
        type: 'string',
        description: 'Context/domain scope assigned to the produced candidates (e.g. "coding-windows-build").',
      },
      note: {
        type: 'string',
        description: 'Optional note about the ingest run (audited).',
      },
      experiences: {
        type: 'array',
        required: true,
        description: 'Extracted experience drafts; each becomes a candidate.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            kind: { type: 'string', required: true, enum: ['positive', 'negative'] },
            family: { type: 'string', required: true },
            gist: { type: 'string', required: true, description: 'ONE crisp reusable lesson; split several lessons into several items.' },
            situation: { type: 'array', required: true, items: { type: 'string' }, description: 'Generalizable situation class that triggers recall, not "this task".' },
            path: {
              type: 'array',
              required: true,
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  order: { type: 'integer', required: true },
                  action: { type: 'string', required: true },
                },
              },
            },
            reasoning: { type: 'string', required: true, description: 'Transferable why (under <situation> this holds because <cause>); never session narration.' },
            limits: { type: 'array', required: true, items: { type: 'string' } },
            failureReason: { type: 'string' },
          },
        },
      },
    } as const,
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          accepted: { type: 'integer', required: true },
          acceptedIds: { type: 'array', required: true, items: { type: 'string' } },
          rejected: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                gist: { type: 'string', required: true },
                reason: { type: 'string', required: true },
              },
            },
          },
        },
      } as const,
      render: (_args: unknown, value: IngestToolValue) => [{
        type: 'text' as const,
        text: `摄取完成：接受 ${String(value.accepted)} 条候选，拒收 ${String(value.rejected.length)} 条。`
          + (value.rejected.length === 0 ? '' : `\n拒收：\n${value.rejected.map(r => `- ${r.gist}：${r.reason}`).join('\n')}`),
      }],
    },
    execute: async (args, exec) => {
      const result = await memory.ingest(callingAgent(exec), {
        sourceType: args.sourceType,
        sourceRef: args.sourceRef,
        ...(args.context === undefined ? {} : { context: args.context }),
        ...(args.note === undefined ? {} : { note: args.note }),
        experiences: args.experiences,
      })
      const value: IngestToolValue = {
        accepted: result.accepted.length,
        acceptedIds: result.accepted.map(exp => exp.id),
        rejected: result.rejected,
      }
      return value
    },
    presentCall: args => present('摄取记忆', 'other', args.sourceRef),
  }))

  ctx.tools.register(defineTool({
    name: 'memory_ledger',
    description: LEDGER_DESCRIPTION,
    parameters: LEDGER_PARAMETERS,
    output: LEDGER_OUTPUT,
    execute: async (args, exec) => {
      const blocks = await memory.ledgerQuery(callingAgent(exec), {
        ...(args.objectType === undefined ? {} : { objectType: args.objectType }),
        ...(args.objectId === undefined ? {} : { objectId: args.objectId }),
        ...(args.op === undefined ? {} : { op: args.op }),
        limit: args.limit ?? 20,
      })
      const value: LedgerToolValue = {
        blocks: blocks.map(block => ({
          seq: block.seq,
          ts: block.ts,
          op: block.op,
          objectType: block.objectType,
          objectId: block.objectId,
          actor: block.actor,
          ...(block.reason === undefined ? {} : { reason: block.reason }),
        })),
      }
      return value
    },
    presentCall: () => present('查询账本', 'read'),
  }))


  // 特殊通道: direct human experience injection. Bypasses the UI 人工管理 form while
  // still landing in the append-only ledger (actor=human), so the hash chain stays
  // verifiable. The plugin's own shape is unchanged — this is just an extra entry point.
  ctx.tools.register(defineTool({
    name: 'memory_human_inject',
    description: '特殊通道：把一条通用经验直接注入经验库（source=human、status=live、信任地板，立即可被召回）。'
      + '在 UI 人工管理页不便操作时使用；写入会 append 到审计账本（actor=human），账本可校验，不破坏 hash 链。'
      + '一次调用注入一条，须写成可迁移的通用教训（reasoning 讲 why 与边界，勿写「本会话/本次」流水账）。',
    parameters: {
      kind: { type: 'string', required: true, enum: ['positive', 'negative'], description: 'positive=可用路径; negative=确认的路径.' },
      family: { type: 'string', required: true, description: '任务族标签.' },
      gist: { type: 'string', required: true, description: '一条可复用的通用教训.' },
      situation: { type: 'array', required: true, items: { type: 'string' }, description: '触发召回的情境类别(可迁移), 非「本任务」.' },
      path: {
        type: 'array',
        required: true,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            order: { type: 'integer', required: true },
            action: { type: 'string', required: true },
          },
        },
      },
      reasoning: { type: 'string', required: true, description: '可迁移的 why (在<situation>下成立因<cause>); 非会话叙述.' },
      limits: { type: 'array', required: true, items: { type: 'string' }, description: '此经验不适用的边界.' },
      failureReason: { type: 'string', description: 'negative 注入的失败原因.' },
      context: { type: 'string', description: '上下文/域作用域.' },
      reason: { type: 'string', required: true, description: '注入原因(审计).' },
    } as const,
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          id: { type: 'string', required: true },
          revision: { type: 'integer', required: true },
          status: { type: 'string', required: true },
          trust: { type: 'number', required: true },
          samples: { type: 'integer', required: true },
        },
      } as const,
      render: (_args: unknown, value: { id: string; revision: number; status: string; trust: number; samples: number }) => [{
        type: 'text' as const,
        text: '已注入经验(特殊通道) [' + value.id + '] v' + String(value.revision) + ' ' + value.status + ' · 置信' + value.trust.toFixed(2) + '(样本' + String(value.samples) + ') —— source=human，已追加到审计账本，账本可校验。',
      }],
    },
    execute: async (args, exec) => {
      const snapshot = await memory.humanAddExperience(callingAgent(exec), {
        kind: args.kind,
        family: args.family,
        gist: args.gist,
        situation: args.situation,
        path: args.path,
        reasoning: args.reasoning,
        limits: args.limits,
        ...(args.failureReason === undefined ? {} : { failureReason: args.failureReason }),
        ...(args.context === undefined ? {} : { context: args.context }),
        reason: args.reason,
      })
      return {
        id: snapshot.id,
        revision: snapshot.revision,
        status: snapshot.status,
        trust: snapshot.trust,
        samples: snapshot.samples,
      }
    },
    presentCall: args => present('人工经验注入(特殊通道)', 'other', args.gist),
  })),

  ctx.tools.register(defineTool({
    name: 'memory_consolidate',
    description: CONSOLIDATE_DESCRIPTION,
    parameters: CONSOLIDATE_PARAMETERS,
    output: CONSOLIDATE_OUTPUT,
    execute: async (args, exec) => {
      const result = await memory.consolidate(callingAgent(exec), {
        merges: args.merges,
        ...(args.note === undefined ? {} : { note: args.note }),
      })
      const value: ConsolidateToolValue = {
        consolidated: result.consolidated,
        archived: result.archived,
        skipped: result.skipped,
      }
      return value
    },
    presentCall: () => present('巩固记忆', 'other'),
  }))
}
