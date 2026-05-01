import Anthropic from '@anthropic-ai/sdk';
import { ClassificationResult, REQUIRES_USER_CONFIRMATION } from '@leftovers/shared';
import { CategorisationError, UpstreamApiError, env } from '@leftovers/shared';
import type { AccountTypeEnum } from '@leftovers/shared/database';
import { renderClassifyPrompt } from '../prompts/classify.js';
import type { ClassificationOutput, TransactionInput } from '../types.js';

export interface LlmClassifyDeps {
  client?: Anthropic;
  model?: string;
}

export interface PastExample {
  merchant: string;
  category: string;
  classification: string;
}

/**
 * Layer 3 — LLM classification fallback.
 * Account numbers and PII must be stripped before this is called (PRD §Privacy).
 * The caller is responsible for `merchantNormalised` containing only merchant + amount context.
 */
export async function classifyByLlm(
  tx: TransactionInput,
  pastExamples: PastExample[],
  deps: LlmClassifyDeps = {},
): Promise<{ result: ClassificationOutput; usage: { inputTokens: number; outputTokens: number } }> {
  const client = deps.client ?? new Anthropic({ apiKey: env.anthropicApiKey });
  const model = deps.model ?? env.anthropicModel;

  const prompt = renderClassifyPrompt({
    merchantRaw: stripPii(tx.merchantRaw ?? tx.merchantNormalised ?? ''),
    amount: tx.amountCents / 100,
    accountType: mapAccountType(tx.accountType),
    pastExamples,
  });

  let response: Anthropic.Messages.Message;
  try {
    response = await client.messages.create({
      model,
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }],
    });
  } catch (e) {
    const status = e instanceof Anthropic.APIError ? e.status ?? 0 : 0;
    throw new UpstreamApiError('anthropic', status, e instanceof Error ? e.message : String(e));
  }

  const textBlock = response.content.find((b): b is Anthropic.Messages.TextBlock => b.type === 'text');
  if (!textBlock) throw new CategorisationError('LLM response had no text block');
  const json = extractJson(textBlock.text);
  const parsed = ClassificationResult.safeParse(json);
  if (!parsed.success) {
    throw new CategorisationError(`LLM returned invalid JSON: ${parsed.error.message}`);
  }

  const requiresConfirmation = REQUIRES_USER_CONFIRMATION.includes(parsed.data.category);
  // Per build-prompt §Sprint 3 step 20: cap confidence at 0.7 for mortgage/rent.
  const confidence = requiresConfirmation ? Math.min(parsed.data.confidence, 0.7) : parsed.data.confidence;

  return {
    result: {
      categorySlug: parsed.data.category,
      classification: parsed.data.classification,
      confidence,
      classifiedBy: 'llm',
      ...(parsed.data.reasoning !== undefined && { reasoning: parsed.data.reasoning }),
      requiresConfirmation,
    },
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    },
  };
}

function stripPii(s: string): string {
  return s
    .replace(/\b\d{4,}\b/g, '####')
    .replace(/[A-Z]{2}\d{2,}\s?\d+/g, '####')
    .slice(0, 200);
}

function mapAccountType(t: AccountTypeEnum): string {
  switch (t) {
    case 'transaction':
    case 'savings':
    case 'credit':
    case 'offset':
      return t;
    case 'saver_bucket':
      return 'savings';
  }
}

function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new CategorisationError(`LLM response had no JSON object: ${text.slice(0, 200)}`);
  }
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch (e) {
    throw new CategorisationError(`LLM JSON parse failed: ${(e as Error).message}`);
  }
}
