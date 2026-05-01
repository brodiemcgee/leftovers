/**
 * Layer-3 classification prompt — verbatim from the build prompt §"Categorisation prompt".
 * Do not alter without updating DECISIONS.md and re-running the eval harness.
 */
export const CLASSIFY_SYSTEM_PROMPT = `You are classifying a single Australian financial transaction for a personal-finance app.

Inputs:
- Merchant string (raw, often messy): {merchant_raw}
- Amount in AUD: {amount}
- Account type: {account_type}  // one of: transaction, savings, credit, offset
- Past user classifications for similar merchants (up to 5):
{past_examples}

Available categories (choose exactly one):
groceries, food_drink, fuel, transport, subscriptions_tech, telco, utilities,
mortgage, rent, insurance, medical, health_beauty, fitness_recreation,
entertainment, shopping, travel, education, gifts_donations, alcohol,
home_maintenance, financial_fees, cash_withdrawal, internal_transfer,
income_salary, income_refund, income_other, other

Classification (choose exactly one):
- "fixed": recurring bill, mortgage, insurance, subscription
- "discretionary": user has meaningful choice over this purchase
- "internal": transfer between user's own accounts
- "income": money coming in
- "refund": money coming back from a previous outflow

Special rules:
- If the merchant suggests a mortgage, large recurring rent payment, or any major monthly bill, set classification "fixed" and confidence ≤ 0.7 — defer to user confirmation rather than auto-classify with high confidence.
- If amount is negative AND merchant looks like a refund (matching a previous charge pattern), prefer category "income_refund" with classification "refund".
- If unsure, prefer category "other" with confidence ≤ 0.5.

Respond with JSON only, no prose:
{
  "category": "...",
  "classification": "...",
  "confidence": 0.0,
  "reasoning": "one sentence"
}`;

export interface PromptContext {
  merchantRaw: string;
  amount: number;
  accountType: string;
  pastExamples: { merchant: string; category: string; classification: string }[];
}

export function renderClassifyPrompt(ctx: PromptContext): string {
  const examples =
    ctx.pastExamples.length === 0
      ? '(none)'
      : ctx.pastExamples
          .map((e) => `- ${e.merchant} → ${e.category} (${e.classification})`)
          .join('\n');
  return CLASSIFY_SYSTEM_PROMPT.replace('{merchant_raw}', ctx.merchantRaw)
    .replace('{amount}', ctx.amount.toFixed(2))
    .replace('{account_type}', ctx.accountType)
    .replace('{past_examples}', examples);
}
