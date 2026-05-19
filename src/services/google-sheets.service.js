import { google } from 'googleapis';
import { logger } from '../utils/logger.js';

const sheetsScope = 'https://www.googleapis.com/auth/spreadsheets';

const normalizePrivateKey = (privateKey = '') => String(privateKey || '').replace(/\\n/g, '\n');

export const getGoogleSheetsConfig = () => {
  const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
  const privateKey = normalizePrivateKey(process.env.GOOGLE_SHEETS_PRIVATE_KEY);
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

  if (!clientEmail || !privateKey || !spreadsheetId) {
    throw new Error('Google Sheets service account environment variables are not configured');
  }

  return {
    clientEmail,
    privateKey,
    spreadsheetId
  };
};

export const getGoogleSheetsClient = () => {
  const config = getGoogleSheetsConfig();
  const auth = new google.auth.JWT({
    email: config.clientEmail,
    key: config.privateKey,
    scopes: [sheetsScope]
  });

  logger.info('google_sheets_connected', {
    spreadsheetId: config.spreadsheetId,
    clientEmail: config.clientEmail
  });

  return google.sheets({ version: 'v4', auth });
};

const quoteTab = (tabName) => `'${String(tabName).replace(/'/g, "''")}'`;

export const getSpreadsheet = async ({ sheets = getGoogleSheetsClient(), spreadsheetId = getGoogleSheetsConfig().spreadsheetId } = {}) => {
  const response = await sheets.spreadsheets.get({ spreadsheetId });
  return response.data;
};

const ensureSheet = async ({ sheets, spreadsheetId, tabName }) => {
  const spreadsheet = await getSpreadsheet({ sheets, spreadsheetId });
  const exists = (spreadsheet.sheets || []).some((sheet) => sheet.properties?.title === tabName);

  if (exists) {
    return;
  }

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          addSheet: {
            properties: {
              title: tabName
            }
          }
        }
      ]
    }
  });
};

export const clearSheet = async (
  tabName,
  { sheets = getGoogleSheetsClient(), spreadsheetId = getGoogleSheetsConfig().spreadsheetId } = {}
) => {
  await ensureSheet({ sheets, spreadsheetId, tabName });
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: quoteTab(tabName)
  });
};

export const writeSheet = async (
  tabName,
  rows = [],
  { sheets = getGoogleSheetsClient(), spreadsheetId = getGoogleSheetsConfig().spreadsheetId } = {}
) => {
  await ensureSheet({ sheets, spreadsheetId, tabName });
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: quoteTab(tabName)
  });
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${quoteTab(tabName)}!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: rows
    }
  });

  logger.info('google_sheets_tab_synced', {
    tabName,
    rows: Math.max(0, rows.length - 1)
  });

  return {
    tabName,
    rowsSynced: Math.max(0, rows.length - 1)
  };
};

export const appendSheet = async (
  tabName,
  rows = [],
  { sheets = getGoogleSheetsClient(), spreadsheetId = getGoogleSheetsConfig().spreadsheetId } = {}
) => {
  await ensureSheet({ sheets, spreadsheetId, tabName });
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${quoteTab(tabName)}!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: rows
    }
  });

  return {
    tabName,
    rowsSynced: rows.length
  };
};

const syncTab = (tabName, rows, options) => writeSheet(tabName, rows, options);

export const syncHotelsSheet = (rows, options) => syncTab('Hotels', rows, options);
export const syncReservationsSheet = (rows, options) => syncTab('Reservations', rows, options);
export const syncExperienceBookingsSheet = (rows, options) => syncTab('Experience Bookings', rows, options);
export const syncPartnerRevenueSheet = (rows, options) => syncTab('Partner Revenue', rows, options);
export const syncAutomationsSheet = (rows, options) => syncTab('Automations', rows, options);
export const syncPmsStatusSheet = (rows, options) => syncTab('PMS Status', rows, options);
export const syncWhatsAppStatusSheet = (rows, options) => syncTab('WhatsApp Status', rows, options);
export const syncAlertsSheet = (rows, options) => syncTab('Alerts', rows, options);

export const syncAllSheets = async (rowsByTab, options = {}) => {
  const config = options.spreadsheetId ? { spreadsheetId: options.spreadsheetId } : getGoogleSheetsConfig();
  const sheets = options.sheets || getGoogleSheetsClient();
  const writeOptions = {
    sheets,
    spreadsheetId: config.spreadsheetId
  };

  const results = [];
  results.push(await syncHotelsSheet(rowsByTab.hotels, writeOptions));
  results.push(await syncReservationsSheet(rowsByTab.reservations, writeOptions));
  results.push(await syncExperienceBookingsSheet(rowsByTab.experienceBookings, writeOptions));
  results.push(await syncPartnerRevenueSheet(rowsByTab.partnerRevenue, writeOptions));
  results.push(await syncAutomationsSheet(rowsByTab.automations, writeOptions));
  results.push(await syncPmsStatusSheet(rowsByTab.pmsStatus, writeOptions));
  results.push(await syncWhatsAppStatusSheet(rowsByTab.whatsAppStatus, writeOptions));
  results.push(await syncAlertsSheet(rowsByTab.alerts, writeOptions));

  return results;
};

export const __googleSheetsInternals = {
  normalizePrivateKey,
  quoteTab,
  ensureSheet
};
