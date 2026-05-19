import assert from 'node:assert/strict';
import {
  __googleSheetsInternals,
  getSpreadsheet,
  syncAllSheets,
  writeSheet
} from '../src/services/google-sheets.service.js';
import {
  buildAutomationRows,
  buildHotelsSheetRows,
  buildPartnerRevenueRows,
  buildPlatformSheetsRows
} from '../src/services/platform-sheets-sync.service.js';

const createMockSheets = ({ failUpdate = false } = {}) => {
  const state = {
    tabs: new Set(['Hotels']),
    cleared: [],
    updated: [],
    appended: [],
    added: []
  };

  return {
    state,
    client: {
      spreadsheets: {
        get: async () => ({
          data: {
            sheets: [...state.tabs].map((title) => ({
              properties: { title }
            }))
          }
        }),
        batchUpdate: async ({ requestBody }) => {
          (requestBody.requests || []).forEach((request) => {
            const title = request.addSheet?.properties?.title;
            if (title) {
              state.tabs.add(title);
              state.added.push(title);
            }
          });
          return { data: {} };
        },
        values: {
          clear: async ({ range }) => {
            state.cleared.push(range);
            return { data: {} };
          },
          update: async ({ range, requestBody }) => {
            if (failUpdate) {
              throw new Error('mock_google_update_failed');
            }
            state.updated.push({ range, rows: requestBody.values });
            return { data: {} };
          },
          append: async ({ range, requestBody }) => {
            state.appended.push({ range, rows: requestBody.values });
            return { data: {} };
          }
        }
      }
    }
  };
};

const sampleData = {
  hotels: [
    {
      id: 'hotel-1',
      name: 'Riad Staynex Marrakech',
      country: 'MA',
      subscription_plan: 'enterprise',
      whatsapp_number: '+212600000000',
      created_at: '2026-05-01T10:00:00.000Z',
      updated_at: '2026-05-18T10:00:00.000Z'
    }
  ],
  reservations: [
    {
      id: 'res-1',
      hotel_id: 'hotel-1',
      guest_name: 'Guest Example',
      room_number: '101',
      arrival_date: '2026-05-18',
      departure_date: '2026-05-21',
      status: 'in_house',
      language: 'es',
      country: 'ES',
      created_at: '2026-05-18T10:00:00.000Z'
    }
  ],
  experienceBookings: [
    {
      id: 'booking-1',
      hotel_id: 'hotel-1',
      guest_name: 'Guest Example',
      experience_title: 'Agafay Desert Dinner',
      provider_source: 'Luxotour Morocco',
      provider_id: 'provider-1',
      status: 'pending',
      estimated_revenue: 190,
      revenue_owner: 'staynex',
      revenue_type: 'partner_marketplace',
      platform_commission_amount: 38,
      provider_payout_amount: 152,
      lead_status: 'sent',
      created_at: '2026-05-18T11:00:00.000Z',
      metadata: {}
    }
  ],
  automations: [
    {
      id: 'auto-1',
      hotel_id: 'hotel-1',
      name: 'Late checkout offer',
      type: 'late_checkout_offer',
      trigger_type: 'checkout_tomorrow',
      active: true,
      audience_type: 'pre_checkout',
      cooldown_minutes: 1440
    }
  ],
  automationRuns: [
    {
      automation_id: 'auto-1',
      hotel_id: 'hotel-1',
      automation_type: 'late_checkout_offer',
      converted: true,
      revenue_generated: 45,
      created_at: '2026-05-18T12:00:00.000Z'
    }
  ],
  pmsConnections: [
    {
      hotel_id: 'hotel-1',
      enabled: true,
      provider: 'apaleo',
      last_sync_at: '2026-05-18T12:00:00.000Z',
      updated_at: '2026-05-18T12:00:00.000Z'
    }
  ],
  conversations: [
    {
      hotel_id: 'hotel-1',
      last_message_at: '2026-05-18T13:00:00.000Z',
      created_at: '2026-05-18T13:00:00.000Z'
    }
  ],
  aiLogs: [
    {
      hotel_id: 'hotel-1',
      openai_concierge_used: true,
      created_at: new Date().toISOString()
    }
  ],
  tickets: [],
  hotelUsers: [
    {
      hotel_id: 'hotel-1',
      role: 'admin',
      status: 'active'
    }
  ],
  roomStatusRows: [
    {
      hotel_id: 'hotel-1',
      room_number: '101',
      housekeeping_status: 'clean'
    }
  ],
  occupancyRows: [
    {
      hotel_id: 'hotel-1',
      occupancy_percent: 72,
      created_at: '2026-05-18T12:00:00.000Z'
    }
  ],
  guestStayContexts: [
    {
      hotel_id: 'hotel-1',
      reservation_id: 'res-1',
      vip_score: 80,
      revenue_potential: 'high',
      stay_phase: 'in_house'
    }
  ],
  scheduledMessages: []
};

const run = async () => {
  const cases = [];

  assert.equal(__googleSheetsInternals.normalizePrivateKey('line1\\nline2'), 'line1\nline2');
  cases.push('private key parsing converts escaped newlines');

  const spreadsheetMock = createMockSheets();
  const spreadsheet = await getSpreadsheet({
    sheets: spreadsheetMock.client,
    spreadsheetId: 'spreadsheet-test'
  });
  assert.equal(spreadsheet.sheets.length, 1);
  cases.push('connection spreadsheet metadata works with sheets client');

  const hotelsRows = buildHotelsSheetRows(sampleData);
  assert.equal(hotelsRows[0][0], 'Hotel ID');
  assert.equal(hotelsRows[1][1], 'Riad Staynex Marrakech');
  cases.push('Hotels rows are prepared');

  const partnerRows = buildPartnerRevenueRows(sampleData);
  assert.equal(partnerRows[1][0], 'Luxotour Morocco');
  assert.equal(partnerRows[1][4], 38);
  cases.push('Partner Revenue rows are prepared');

  const automationRows = buildAutomationRows(sampleData);
  assert.equal(automationRows[1][0], 'Late checkout offer');
  assert.equal(automationRows[1][5], 45);
  cases.push('Automations rows are prepared');

  const writeMock = createMockSheets();
  const writeResult = await writeSheet('Partner Revenue', partnerRows, {
    sheets: writeMock.client,
    spreadsheetId: 'spreadsheet-test'
  });
  assert.equal(writeResult.tabName, 'Partner Revenue');
  assert.equal(writeResult.rowsSynced, 1);
  assert.ok(writeMock.state.added.includes('Partner Revenue'));
  cases.push('tabs auto-created and Partner Revenue written');

  const allRows = buildPlatformSheetsRows(sampleData);
  const syncMock = createMockSheets();
  const syncResult = await syncAllSheets(allRows, {
    sheets: syncMock.client,
    spreadsheetId: 'spreadsheet-test'
  });
  assert.equal(syncResult.length, 8);
  assert.ok(syncMock.state.updated.some((item) => item.range.includes('Automations')));
  cases.push('full sync writes all tabs');

  const failingMock = createMockSheets({ failUpdate: true });
  await assert.rejects(
    () => writeSheet('Hotels', hotelsRows, {
      sheets: failingMock.client,
      spreadsheetId: 'spreadsheet-test'
    }),
    /mock_google_update_failed/
  );
  cases.push('fallback Google error surfaces clearly');

  console.log(JSON.stringify({ ok: true, cases }, null, 2));
};

run().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error.message,
    stack: error.stack
  }, null, 2));
  process.exit(1);
});
