import { classifyByLlm, type LlmClassifyDeps, type PastExample } from './layers/llm.js';
import { classifyByRecurrence, type PriorTransaction } from './layers/recurrence.js';
import { classifyByRules } from './layers/rules.js';
import type {
  ClassificationOutput,
  RecurringGroupCandidate,
  SystemRule,
  TransactionInput,
  UserRule,
} from './types.js';

export interface PipelineContext {
  rules: readonly (SystemRule | UserRule)[];
  priorByMerchant: readonly PriorTransaction[];
  pastExamples: readonly PastExample[];
  llmEnabled: boolean;
}

export interface PipelineResult extends ClassificationOutput {
  layer: 1 | 2 | 3 | 4;
  recurringGroup?: RecurringGroupCandidate;
}

/**
 * Run the full 4-layer pipeline. Layers in priority order:
 *   1. User rules / system rules (rules.ts handles both via priority)
 *   2. Recurrence detection
 *   3. LLM fallback (if enabled)
 *   4. "Other" with confidence 0.3
 *
 * Layer 4 (user feedback loop) writes a new rule on every user correction —
 * that lives in the API layer. The pipeline only reads rules that already exist.
 */
export async function classify(
  tx: TransactionInput,
  ctx: PipelineContext,
  llmDeps: LlmClassifyDeps = {},
): Promise<PipelineResult> {
  // Layer 1 (rules — system + user corrections by priority)
  const ruleResult = classifyByRules(tx, ctx.rules);
  if (ruleResult) {
    return { ...ruleResult, layer: ruleResult.classifiedBy === 'user' ? 4 : 1 };
  }

  // Layer 2 (recurrence)
  const { result: recResult, group } = classifyByRecurrence(tx, ctx.priorByMerchant);
  if (recResult) {
    const out: PipelineResult = { ...recResult, layer: 2 };
    if (group) out.recurringGroup = group;
    return out;
  }

  // Layer 3 (LLM)
  if (ctx.llmEnabled) {
    try {
      const { result } = await classifyByLlm(tx, [...ctx.pastExamples], llmDeps);
      return { ...result, layer: 3 };
    } catch {
      // Fall through to 'other'
    }
  }

  // Layer 4 fallback — never confident
  return {
    categorySlug: 'other',
    classification: 'discretionary',
    confidence: 0.3,
    classifiedBy: 'system',
    reasoning: 'No rule, no recurrence, LLM unavailable or failed.',
    requiresConfirmation: true,
    layer: 3,
  };
}
