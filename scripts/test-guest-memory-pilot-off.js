import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  GUEST_MEMORY_ENV_VAR,
  getGuestMemoryPilotStatus,
  isGuestMemoryEnabled
} from '../shared/guest-memory/feature-flag.js';
import {
  detectGuestMemoryFromMessage,
  formatGuestMemoryForPrompt,
  getGuestMemory,
  upsertDetectedGuestMemories,
  upsertGuestMemory
} from '../src/services/guest-memory.service.js';
import { detectRevenueOpportunity } from '../src/services/concierge-ai.service.js';
import { buildProviderExperienceInterestMemories } from '../src/services/experience-booking.service.js';
import { buildStaynexUserPrompt } from '../src/prompts/staynex.prompt.js';
import { buildConversationCopilot } from '../dashboard/lib/ai-copilot.js';

const repoRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const read = (path) => readFileSync(join(repoRoot, path), 'utf8');

const originalGuestMemoryFlag = process.env.GUEST_MEMORY_ENABLED;
const originalSupabaseUrl = process.env.SUPABASE_URL;
const originalSupabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const originalOpenAiKey = process.env.OPENAI_API_KEY;

const setGuestMemoryFlag = (value) => {
  if (value === undefined) {
    delete process.env.GUEST_MEMORY_ENABLED;
  } else {
    process.env.GUEST_MEMORY_ENABLED = value;
  }
};

const restoreEnv = () => {
  if (originalGuestMemoryFlag === undefined) delete process.env.GUEST_MEMORY_ENABLED;
  else process.env.GUEST_MEMORY_ENABLED = originalGuestMemoryFlag;

  if (originalSupabaseUrl === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = originalSupabaseUrl;

  if (originalSupabaseKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = originalSupabaseKey;

  if (originalOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalOpenAiKey;
};

const assertIncludes = (source, expected, message) => {
  assert.ok(source.includes(expected), message);
};

const assertBefore = (source, first, second, message) => {
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);

  assert.notEqual(firstIndex, -1, `${message}: missing ${first}`);
  assert.notEqual(secondIndex, -1, `${message}: missing ${second}`);
  assert.ok(firstIndex < secondIndex, message);
};

const assertBeforeFrom = (source, anchor, first, second, message) => {
  const anchorIndex = source.indexOf(anchor);
  assert.notEqual(anchorIndex, -1, `${message}: missing ${anchor}`);

  const firstIndex = source.indexOf(first, anchorIndex);
  const secondIndex = source.indexOf(second, anchorIndex);

  assert.notEqual(firstIndex, -1, `${message}: missing ${first}`);
  assert.notEqual(secondIndex, -1, `${message}: missing ${second}`);
  assert.ok(firstIndex < secondIndex, message);
};

try {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.OPENAI_API_KEY;

  assert.equal(isGuestMemoryEnabled({}), false, 'Missing env must disable Guest Memory');
  assert.equal(isGuestMemoryEnabled({ GUEST_MEMORY_ENABLED: 'false' }), false, 'false must disable Guest Memory');
  assert.equal(isGuestMemoryEnabled({ GUEST_MEMORY_ENABLED: 'TRUE' }), false, 'Only lowercase string true enables Guest Memory');
  assert.equal(isGuestMemoryEnabled({ GUEST_MEMORY_ENABLED: '1' }), false, 'Numeric-like truthy values must not enable Guest Memory');
  assert.equal(isGuestMemoryEnabled({ GUEST_MEMORY_ENABLED: 'true' }), true, 'Explicit true must enable Guest Memory');
  assert.deepEqual(getGuestMemoryPilotStatus({}), {
    enabled: false,
    envVar: GUEST_MEMORY_ENV_VAR,
    defaultBehavior: 'disabled',
    status: 'disabled'
  });

  setGuestMemoryFlag(undefined);

  const legacyMemory = [{
    id: 'legacy-memory-1',
    memory_type: 'dietary',
    memory_key: 'dietary_peanut_allergy',
    memory_value: 'peanut allergy',
    confidence: 0.98
  }];

  const readResult = await getGuestMemory('hotel-1', 'guest-1');
  assert.deepEqual(readResult, [], 'OFF must return empty guest memory context without Supabase config');

  const writeResult = await upsertGuestMemory({
    hotelId: 'hotel-1',
    guestId: 'guest-1',
    memoryType: 'dietary',
    memoryKey: 'dietary_peanut_allergy',
    memoryValue: 'peanut allergy'
  });
  assert.equal(writeResult.status, 'feature_disabled', 'OFF must skip memory insert/upsert safely');
  assert.equal(writeResult.disabled, true, 'OFF write result must be explicit');

  const updateLikeResult = await upsertGuestMemory({
    hotelId: 'hotel-1',
    guestId: 'guest-1',
    memoryType: 'preference',
    memoryKey: 'preferred_pillow',
    memoryValue: 'extra pillow'
  });
  assert.equal(updateLikeResult.status, 'feature_disabled', 'OFF must skip memory update/upsert safely');

  const extractionResult = detectGuestMemoryFromMessage({
    message: 'Soy celiaco, viajo con mi pareja y es nuestro aniversario.',
    context: { language: 'es' },
    aiResult: { intent: 'romantic_package_interest', upsell_opportunity: true }
  });
  assert.deepEqual(extractionResult, [], 'OFF must prevent memory extraction');

  const savedDetected = await upsertDetectedGuestMemories({
    hotelId: 'hotel-1',
    guestId: 'guest-1',
    memories: [{
      memoryType: 'personal_context',
      memoryKey: 'anniversary_trip',
      memoryValue: 'true'
    }]
  });
  assert.deepEqual(savedDetected, [], 'OFF must not persist detected memory candidates');

  const promptMemoryText = formatGuestMemoryForPrompt(legacyMemory);
  assert.equal(promptMemoryText, 'No hay memoria previa del huesped.', 'OFF prompt formatter must return empty memory text');
  assert.ok(!promptMemoryText.includes('peanut allergy'), 'OFF prompt formatter must not expose legacy values');

  const prompt = buildStaynexUserPrompt({
    hotel: { name: 'Hotel Pilot', default_language: 'es' },
    guest: { preferred_language: 'es' },
    message: 'Hola',
    hotelKnowledge: [],
    conversationContext: {
      guestMemory: legacyMemory,
      recentMessages: [],
      openTickets: []
    }
  });
  assert.ok(!prompt.includes('dietary_peanut_allergy'), 'OFF Staynex prompt must not include legacy memory keys');
  assert.ok(!prompt.includes('peanut allergy'), 'OFF Staynex prompt must not include legacy memory values');

  const revenueOpportunity = detectRevenueOpportunity({
    intentResult: { intent: 'late_checkout_interest', confidence: 0.5 },
    context: {
      guestMemory: [{ memory_key: 'interested_late_checkout', memory_value: 'true' }]
    }
  });
  assert.equal(revenueOpportunity.confidence, 0.5, 'OFF must prevent memory from boosting revenue reasoning');

  const providerMemory = buildProviderExperienceInterestMemories({
    intent: {
      intentType: 'interest',
      confidence: 0.9,
      matchedExperience: {
        slug: 'private-tour',
        title: 'Private Tour',
        provider_experience_id: 'exp-1'
      }
    }
  });
  assert.deepEqual(providerMemory, [], 'OFF must prevent provider experience memory extraction');

  const copilot = buildConversationCopilot({
    guestMemory: legacyMemory,
    messages: [],
    guest: {}
  });
  assert.equal(copilot.guestSnapshot.memoryCount, 0, 'OFF dashboard copilot must ignore legacy memory arrays by default');
  assert.ok(!copilot.summary.text.includes('dietary_peanut_allergy'), 'OFF dashboard copilot summary must not include memory keys');

  setGuestMemoryFlag('false');
  assert.equal(isGuestMemoryEnabled(), false, 'process.env false must disable Guest Memory');

  setGuestMemoryFlag('true');
  assert.equal(isGuestMemoryEnabled(), true, 'process.env true must enable Guest Memory');

  setGuestMemoryFlag(undefined);

  const featureFlag = read('shared/guest-memory/feature-flag.js');
  const guestMemoryService = read('src/services/guest-memory.service.js');
  const staynexService = read('src/services/staynex.service.js');
  const openAiConcierge = read('src/services/openai-concierge.service.js');
  const conciergeAi = read('src/services/concierge-ai.service.js');
  const experienceBooking = read('src/services/experience-booking.service.js');
  const guestMemoryAi = read('src/services/guest-memory-ai.service.js');
  const automationService = read('src/services/automation.service.js');
  const postStayReview = read('src/services/post-stay-review-intelligence.service.js');
  const demoData = read('src/services/demo-data.service.js');
  const guestMemoryApi = read('dashboard/app/api/guest-memory/route.js');
  const guestMemoryDetailApi = read('dashboard/app/api/guest-memory/[guestId]/route.js');
  const receptionApi = read('dashboard/app/api/reception/route.js');
  const inboxLib = read('dashboard/lib/inbox.js');
  const receptionLib = read('dashboard/lib/reception.js');
  const executiveDashboardApi = read('dashboard/app/api/executive-dashboard/route.js');
  const appShell = read('dashboard/components/AppShell.js');
  const inboxCopilotPanel = read('dashboard/components/InboxAiCopilotPanel.js');
  const guestMemoryPage = read('dashboard/app/dashboard/guest-memory/page.js');
  const guestMemoryDetailPage = read('dashboard/app/dashboard/guest-memory/[guestId]/page.js');
  const doc = read('docs/guest-memory-pilot-off.md');

  assertIncludes(featureFlag, "process.env", 'Feature flag must be server-side');
  assertIncludes(guestMemoryService, 'isGuestMemoryEnabled()', 'Guest memory service must use the central feature gate');
  assertBefore(guestMemoryService, 'if (!isGuestMemoryEnabled())', ".from('guest_memory')", 'Read/write helpers must gate before guest_memory DB access');
  assertIncludes(staynexService, 'conversationContext.guestMemory = guestMemoryEnabled ? conversationContext.guestMemory || [] : []', 'Conversation context must blank memory while OFF');
  assertIncludes(staynexService, 'const detectedMemories = guestMemoryEnabled', 'Runtime extraction must be gated');
  assertIncludes(staynexService, 'const savedMemories = guestMemoryEnabled', 'Runtime persistence must be gated');
  assertIncludes(staynexService, 'const memoryKeysUsed = guestMemoryEnabled', 'AI logs must not claim memory use while OFF');
  assertIncludes(openAiConcierge, 'const guestMemory = isGuestMemoryEnabled() ? conversationContext.guestMemory || [] : []', 'OpenAI concierge payload must gate guest_memory');
  assertIncludes(conciergeAi, 'const guestMemory = isGuestMemoryEnabled() ? context.guestMemory || [] : []', 'Concierge revenue reasoning must gate memory input');
  assertIncludes(experienceBooking, 'if (!isGuestMemoryEnabled())', 'Provider experience memory extraction must be gated');
  assertIncludes(guestMemoryAi, 'guestMemoryEnabled', 'Guest memory AI profile reads must be gated');
  assertIncludes(automationService, 'getGuestMemory(hotel.id, reservation.guest_id)', 'Automation context must route memory reads through central helper');
  assertIncludes(postStayReview, 'guestMemoryEnabled && guestIds.length', 'Post-stay review memory reads must be gated');
  assertIncludes(demoData, "if (isGuestMemoryEnabled())", 'Demo memory writes and deletes must be gated');

  assertBefore(guestMemoryApi, 'if (!isGuestMemoryEnabled())', ".from('guest_memory')", 'Guest Memory GET API must gate before legacy row read');
  assertBeforeFrom(guestMemoryApi, 'export async function PATCH', 'if (!isGuestMemoryEnabled())', ".from('guest_memory')", 'Guest Memory PATCH API must gate before update');
  assertBeforeFrom(guestMemoryApi, 'export async function DELETE', 'if (!isGuestMemoryEnabled())', ".from('guest_memory')", 'Guest Memory DELETE API must gate before delete');
  assertIncludes(guestMemoryApi, "status: 'feature_disabled'", 'Guest Memory API must return explicit disabled status');
  assertBefore(guestMemoryDetailApi, 'if (!isGuestMemoryEnabled())', "supabase.from('guest_memory')", 'Guest Memory detail API must gate before legacy row read');
  assertIncludes(guestMemoryDetailApi, 'raw: {', 'Guest Memory detail API must return stable empty data shape');
  assertIncludes(guestMemoryDetailApi, 'memories: []', 'Guest Memory detail API must not expose legacy memories while OFF');
  assertIncludes(receptionApi, 'missingNotesColumn && reservation.guest_id && isGuestMemoryEnabled()', 'Reception fallback memory insert must require ON');
  assertIncludes(receptionApi, "status: 'feature_disabled'", 'Reception memory fallback must return disabled status while OFF');
  assertIncludes(inboxLib, 'guestMemoryEnabled', 'Inbox memory read must use server flag');
  assertIncludes(receptionLib, 'guestMemoryEnabled && guestIds.length', 'Reception memory read must use server flag');
  assertIncludes(executiveDashboardApi, 'guestMemoryEnabled ? safeRows', 'Executive dashboard memory feed must use server flag');
  assertIncludes(appShell, 'filterPilotNavigation', 'App navigation must hide Guest Memory while OFF');
  assertIncludes(appShell, "item.href !== '/dashboard/guest-memory' || guestMemoryEnabled === true", 'Guest Memory nav item must require explicit ON');
  assertIncludes(inboxCopilotPanel, 'guestMemoryEnabled ? conversation?.guestMemory || [] : []', 'Inbox copilot UI must hide memory data while OFF');
  assertIncludes(guestMemoryPage, 'Guest Memory is disabled for this pilot.', 'Direct Guest Memory page must show disabled pilot state');
  assertIncludes(guestMemoryDetailPage, 'Guest Memory is disabled for this pilot.', 'Direct Guest Memory detail page must show disabled pilot state');

  assertIncludes(doc, 'Guest Memory is OFF for the pilot.', 'Pilot OFF doc must state status');
  assertIncludes(doc, '`GUEST_MEMORY_ENABLED=true` is the only value that enables Guest Memory.', 'Pilot OFF doc must state default-off contract');
  assertIncludes(doc, 'Existing `guest_memory` rows are retained', 'Pilot OFF doc must state existing data retention');
  assertIncludes(doc, '`GUEST_MEMORY_ENABLED=true` is not approved for pilot.', 'Pilot OFF doc must require review for reactivation');

  const thisTest = read('scripts/test-guest-memory-pilot-off.js');
  const forbiddenRuntimeCalls = [
    'create' + 'Client(',
    'new ' + 'OpenAI(',
    'fetch' + '('
  ];
  for (const forbiddenCall of forbiddenRuntimeCalls) {
    assert.ok(!thisTest.includes(forbiddenCall), `Test must not call ${forbiddenCall}`);
  }

  console.log('Guest Memory pilot OFF checks passed');
} finally {
  restoreEnv();
}
