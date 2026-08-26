import 'dotenv/config';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSupabase } from '../src/services/supabase.service.js';
import { encryptSecret } from '../src/utils/encryption.js';

export const parseBackfillOptions = ({
  args = process.argv.slice(2),
  env = process.env
} = {}) => {
  const hasFlag = (flag) => args.includes(flag);
  const argValue = (name, fallback = null) => {
    const prefix = `${name}=`;
    const value = args.find((item) => item.startsWith(prefix));
    return value ? value.slice(prefix.length) : fallback;
  };
  const parsedLimit = Number(argValue('--limit', 1000));
  const limit = Math.max(1, Math.min(5000, Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 1000));
  const mutateRequested = hasFlag('--mutate');
  const mutateEnabled = env.BACKFILL_ENCRYPTED_WEBHOOK_SECRETS === 'true';

  if (mutateRequested && !mutateEnabled) {
    throw new Error('Mutating mode requires BACKFILL_ENCRYPTED_WEBHOOK_SECRETS=true and --mutate.');
  }

  return {
    limit,
    mutateRequested,
    mutateEnabled,
    dryRun: !(mutateRequested && mutateEnabled),
    showIds: hasFlag('--show-ids')
  };
};

export const runBackfillEncryptedWebhookSecrets = async ({
  supabase = getSupabase(),
  encrypt = encryptSecret,
  options = parseBackfillOptions()
} = {}) => {
  let result;

  try {
    result = await supabase
      .from('hotel_pms_connections')
      .select('id, webhook_secret, encrypted_webhook_secret')
      .order('updated_at', { ascending: false })
      .limit(options.limit);
  } catch {
    throw new Error('Backfill failed to load PMS connection candidates.');
  }

  if (result.error) {
    throw new Error('Backfill failed to load PMS connection candidates.');
  }

  const rows = result.data || [];
  const candidates = rows.filter((row) => row.webhook_secret && !row.encrypted_webhook_secret);
  const summary = {
    script: 'backfill-encrypted-webhook-secrets',
    mode: options.dryRun ? 'dry_run' : 'mutating',
    limit: options.limit,
    scanned: rows.length,
    candidates: candidates.length,
    skippedAlreadyEncrypted: rows.filter((row) => row.webhook_secret && row.encrypted_webhook_secret).length,
    skippedMissingPlaintext: rows.filter((row) => !row.webhook_secret).length,
    skippedConcurrentUpdate: 0,
    updated: 0,
    failed: 0
  };

  if (options.showIds) {
    summary.candidateIds = candidates.map((row) => row.id);
  }

  if (options.dryRun) {
    return summary;
  }

  for (const row of candidates) {
    let encryptedWebhookSecret;

    try {
      encryptedWebhookSecret = encrypt(row.webhook_secret);
    } catch {
      summary.failed += 1;
      continue;
    }

    try {
      const { data: updatedRow, error: updateError } = await supabase
        .from('hotel_pms_connections')
        .update({
          encrypted_webhook_secret: encryptedWebhookSecret,
          updated_at: new Date().toISOString()
        })
        .eq('id', row.id)
        .is('encrypted_webhook_secret', null)
        .select('id')
        .maybeSingle();

      if (updateError) {
        summary.failed += 1;
      } else if (updatedRow?.id) {
        summary.updated += 1;
      } else {
        summary.skippedConcurrentUpdate += 1;
      }
    } catch {
      summary.failed += 1;
    }
  }

  return summary;
};

export const main = async () => {
  const summary = await runBackfillEncryptedWebhookSecrets();
  console.log(JSON.stringify(summary, null, 2));
  return summary;
};

const isDirectCliRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectCliRun) {
  main().catch((error) => {
    console.error(error.message || 'Backfill failed.');
    process.exitCode = 1;
  });
}
