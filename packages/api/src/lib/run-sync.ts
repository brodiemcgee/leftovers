import { createServiceClient, env } from '@leftovers/shared';
import { createBasiqClient, createUpClient, decryptToken, runSync, type SyncResult } from '@leftovers/sync';

interface RunArgs {
  userId: string;
  connectionId: string;
  source: 'up' | 'basiq';
}

/**
 * Boundary helper used by the manual /sync trigger, the cron handler, and
 * webhook receivers. Loads the connection's encrypted token, instantiates
 * the right source client, runs the orchestrator. Returns the SyncResult.
 */
export async function runConnectionSync(args: RunArgs): Promise<SyncResult & { connectionId: string }> {
  const supabase = createServiceClient();

  const { data: conn, error } = await supabase
    .from('connections')
    .select('id, source, source_connection_id, access_token_encrypted')
    .eq('id', args.connectionId)
    .single();
  if (error || !conn) throw error ?? new Error('connection not found');
  if (!conn.access_token_encrypted) throw new Error('connection missing access token');

  const accessToken = decryptToken(conn.access_token_encrypted);

  const { data: userRow } = await supabase
    .from('users')
    .select('llm_categorisation_enabled')
    .eq('id', args.userId)
    .single();

  const llmEnabled = userRow?.llm_categorisation_enabled ?? true;

  if (args.source === 'up') {
    const up = createUpClient(accessToken);
    const result = await runSync(
      { supabase, userId: args.userId, connectionId: conn.id, source: 'up', llmEnabled },
      {
        fetchAccounts: () => up.listAccounts(),
        fetchTransactionsSince: (since) => up.listTransactionsSince(since),
      },
    );
    return { ...result, connectionId: conn.id };
  }

  const basiq = createBasiqClient(env.basiqApiKey);
  const basiqUserId = conn.source_connection_id;
  const result = await runSync(
    { supabase, userId: args.userId, connectionId: conn.id, source: 'basiq', llmEnabled },
    {
      fetchAccounts: () => basiq.listAccounts(basiqUserId),
      fetchTransactionsSince: (since) => basiq.listTransactionsSince(basiqUserId, since),
    },
  );
  return { ...result, connectionId: conn.id };
}
