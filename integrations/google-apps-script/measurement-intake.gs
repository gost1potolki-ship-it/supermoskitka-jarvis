/**
 * Measurement Intake V1 — dedicated Google Apps Script Web App.
 *
 * Deploy this file separately from the production-order webhook. Configure
 * optional SPREADSHEET_ID and MEASUREMENT_SHEET_NAME Script Properties.
 * The default sheet name is "Замеры".
 *
 * Actions:
 *   upsert_measurement       = Firestore upcoming_measurements + Sheet
 *   upsert_measurement_sheet = Sheet only (Jarvis already wrote Firestore)
 *
 * Request:
 *   { action, submissionId, address, name, phone, itemSummary,
 *     amount_rub, payer_text, apt, time, customerComment, source }
 *
 * The stable submission_id column is created at the end of the header row
 * when absent. Existing A–F headers are never renamed or reordered.
 */

var FULL_MEASUREMENT_ACTION_ = 'upsert_measurement';
var SHEET_ONLY_MEASUREMENT_ACTION_ = 'upsert_measurement_sheet';
var DEFAULT_MEASUREMENT_SHEET_NAME_ = 'Замеры';
var FIRESTORE_PROJECT_PROPERTY_ = 'MEASUREMENT_FIREBASE_PROJECT_ID';
var FIRESTORE_COLLECTION_ = 'upcoming_measurements';
var REQUIRED_FIELDS_ = ['submissionId', 'address', 'phone', 'itemSummary'];

var VISIBLE_COLUMNS_ = [
  { field: 'name', aliases: ['имя', 'name'] },
  { field: 'phone', aliases: ['телефон', 'phone'] },
  { field: 'address', aliases: ['адрес', 'address'] },
  { field: 'itemSummary', aliases: ['изделия', 'items', 'itemsummary'] },
  { field: 'payer_text', aliases: ['заказчик', 'платит', 'плательщик', 'payer', 'payer_text'] },
  { field: 'amount_rub', aliases: ['сумма', 'amount', 'amount_rub'] },
];

var TECHNICAL_FIELD_ALIASES_ = {
  apt: ['apt', 'flat', 'кв', 'квартира'],
  time: ['time', 'время', 'замер на'],
  customerComment: ['customer_comment', 'customercomment'],
  source: ['source', 'источник'],
  submission_id: ['submission_id', 'submissionid'],
};

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    var request = parseRequest_(e);
    validateRequest_(request);
    if (request.action === SHEET_ONLY_MEASUREMENT_ACTION_) {
      return jsonResponse_(sheetOnlyResult_(request));
    }
    return jsonResponse_(fullIntakeResult_(request));
  } catch (error) {
    return jsonResponse_(safeError_(error));
  } finally {
    try {
      lock.releaseLock();
    } catch (_ignored) {
      // Lock may not have been acquired.
    }
  }
}

function parseRequest_(e) {
  var raw = e && e.postData && e.postData.contents;
  if (!raw) {
    throw intakeError_('VALIDATION_ERROR', 'Request body is required');
  }
  try {
    return JSON.parse(raw);
  } catch (_error) {
    throw intakeError_('VALIDATION_ERROR', 'Request body must be valid JSON');
  }
}

function validateRequest_(request) {
  if (
    !request ||
    (request.action !== FULL_MEASUREMENT_ACTION_ &&
      request.action !== SHEET_ONLY_MEASUREMENT_ACTION_)
  ) {
    throw intakeError_('INVALID_ACTION', 'Unsupported action');
  }
  for (var i = 0; i < REQUIRED_FIELDS_.length; i += 1) {
    var field = REQUIRED_FIELDS_[i];
    if (typeof request[field] !== 'string' || request[field].trim() === '') {
      throw intakeError_('VALIDATION_ERROR', field + ' is required');
    }
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(request.submissionId)) {
    throw intakeError_('VALIDATION_ERROR', 'submissionId is invalid');
  }
  validateFinancialRequest_(request);
}

function normalizePayerText_(value) {
  return String(value || '').trim().toLowerCase();
}

function parseMeasurerPayer_(request) {
  if (request.measurerPayer === 'CUSTOMER' || request.measurerPayer === 'COMPANY') {
    return request.measurerPayer;
  }
  var payerText = normalizePayerText_(request.payer_text);
  if (!payerText) {
    return '';
  }
  if (payerText.indexOf('фирм') !== -1 || payerText.indexOf('офис') !== -1) {
    return 'COMPANY';
  }
  if (
    payerText.indexOf('заказчик') !== -1 ||
    payerText.indexOf('клиент') !== -1 ||
    payerText.indexOf('customer') !== -1
  ) {
    return 'CUSTOMER';
  }
  return '';
}

function payerTextMatches_(value, measurerPayer) {
  var parsed = parseMeasurerPayer_({ payer_text: value });
  return parsed === measurerPayer;
}

function validateFinancialRequest_(request) {
  var preliminaryTotalRub = Number(request.preliminaryTotalRub);
  var measurerPayoutRub =
    request.measurerPayoutRub !== undefined ? Number(request.measurerPayoutRub) : Number(request.amount_rub);
  var measurerPayer = parseMeasurerPayer_(request);

  if (!isFinite(preliminaryTotalRub) || preliminaryTotalRub < 0) {
    throw intakeError_('VALIDATION_ERROR', 'preliminaryTotalRub is invalid');
  }
  if (!isFinite(measurerPayoutRub) || measurerPayoutRub < 0) {
    throw intakeError_('VALIDATION_ERROR', 'measurerPayoutRub is invalid');
  }
  if (!measurerPayer) {
    throw intakeError_('VALIDATION_ERROR', 'measurerPayer is invalid');
  }

  var expectedDeposit = measurerPayer === 'CUSTOMER' ? measurerPayoutRub : 0;
  var expectedBalance = preliminaryTotalRub - expectedDeposit;
  if (expectedBalance < 0) {
    throw intakeError_('VALIDATION_ERROR', 'remainingBalanceRub would be negative');
  }

  if (request.customerDepositRub !== undefined && Number(request.customerDepositRub) !== expectedDeposit) {
    throw intakeError_('VALIDATION_ERROR', 'customerDepositRub is inconsistent');
  }
  if (
    request.remainingBalanceRub !== undefined &&
    Number(request.remainingBalanceRub) !== expectedBalance
  ) {
    throw intakeError_('VALIDATION_ERROR', 'remainingBalanceRub is inconsistent');
  }
  if (request.amount_rub !== undefined && Number(request.amount_rub) !== measurerPayoutRub) {
    throw intakeError_('VALIDATION_ERROR', 'amount_rub must equal measurerPayoutRub');
  }
  if (request.payer_text && !payerTextMatches_(request.payer_text, measurerPayer)) {
    throw intakeError_('VALIDATION_ERROR', 'payer_text is inconsistent with measurerPayer');
  }

  request.preliminaryTotalRub = preliminaryTotalRub;
  request.measurerPayoutRub = measurerPayoutRub;
  request.measurerPayer = measurerPayer;
  request.customerDepositRub = expectedDeposit;
  request.remainingBalanceRub = expectedBalance;
  request.amount_rub = measurerPayoutRub;
  request.payer_text = measurerPayer === 'COMPANY' ? 'фирма' : 'Заказчик';
}

function fullIntakeResult_(request) {
  var firestoreResult;
  try {
    firestoreResult = upsertFirestoreMeasurement_(request);
  } catch (_firestoreError) {
    return {
      ok: false,
      submissionId: request.submissionId,
      status: 'FAILED',
      firestore: 'ERROR',
      sheet: 'NOT_ATTEMPTED',
      error: { code: 'FIRESTORE_UPSERT_FAILED', message: 'Measurement persistence failed' },
    };
  }

  try {
    var sheetResult = upsertMeasurementSheet_(request);
    updateFirestoreSheetStatus_(request.submissionId, 'sent', '');
    return successResult_(request, sheetResult, 'UPSERTED', firestoreResult.created);
  } catch (sheetError) {
    var sheetCode = safeSheetErrorCode_(sheetError);
    try {
      updateFirestoreSheetStatus_(request.submissionId, 'error', sheetCode);
    } catch (_statusError) {
      // The primary Firestore document still exists and the response remains retryable.
    }
    return {
      ok: false,
      submissionId: request.submissionId,
      status: 'PARTIAL',
      firestore: 'UPSERTED',
      sheet: 'ERROR',
      created: firestoreResult.created,
      updated: !firestoreResult.created,
      error: { code: sheetCode, message: 'Measurement Sheet synchronization failed' },
    };
  }
}

function sheetOnlyResult_(request) {
  var result = upsertMeasurementSheet_(request);
  return successResult_(request, result, 'NOT_REQUESTED');
}

function successResult_(request, sheetResult, firestoreStatus, firestoreCreated) {
  return {
    ok: true,
    submissionId: request.submissionId,
    status: 'SUBMITTED',
    firestore: firestoreStatus,
    sheet: 'SENT',
    created: sheetResult.created,
    updated: sheetResult.updated,
    row: sheetResult.row,
    firestoreCreated: firestoreCreated === true,
  };
}

function upsertMeasurementSheet_(request) {
  var sheet = resolveMeasurementSheet_();
  var headerMap = resolveHeaderMap_(sheet);
  var submissionColumn = ensureSubmissionIdColumn_(sheet, headerMap);
  headerMap.submission_id = submissionColumn;

  var existingRow = findSubmissionRow_(sheet, submissionColumn, request.submissionId);
  var row = existingRow || Math.max(sheet.getLastRow() + 1, 2);
  writeKnownFields_(sheet, row, headerMap, request);

  return {
    created: !existingRow,
    updated: Boolean(existingRow),
    row: row,
  };
}

function resolveMeasurementSheet_() {
  var properties = PropertiesService.getScriptProperties();
  var spreadsheetId = String(properties.getProperty('SPREADSHEET_ID') || '').trim();
  var spreadsheet = spreadsheetId
    ? SpreadsheetApp.openById(spreadsheetId)
    : SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) {
    throw intakeError_('SHEET_NOT_FOUND', 'Spreadsheet is not configured');
  }

  var sheetName =
    String(properties.getProperty('MEASUREMENT_SHEET_NAME') || '').trim() ||
    DEFAULT_MEASUREMENT_SHEET_NAME_;
  var sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    throw intakeError_('SHEET_NOT_FOUND', 'Measurement sheet was not found');
  }
  return sheet;
}

function resolveHeaderMap_(sheet) {
  var lastColumn = Math.max(sheet.getLastColumn(), 6);
  var headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  var normalizedVisible = headers.slice(0, 6).map(normalizeHeader_);
  var allVisibleBlank = normalizedVisible.every(function (header) {
    return header === '';
  });

  if (!allVisibleBlank) {
    for (var visibleIndex = 0; visibleIndex < VISIBLE_COLUMNS_.length; visibleIndex += 1) {
      var definition = VISIBLE_COLUMNS_[visibleIndex];
      var header = normalizedVisible[visibleIndex];
      if (definition.aliases.indexOf(header) === -1) {
        throw intakeError_(
          'SHEET_SCHEMA_MISMATCH',
          'Visible measurement columns A:F do not match the supported schema',
        );
      }
    }
  }

  var map = {
    name: 1,
    phone: 2,
    address: 3,
    itemSummary: 4,
    payer_text: 5,
    amount_rub: 6,
  };
  Object.keys(TECHNICAL_FIELD_ALIASES_).forEach(function (field) {
    var matches = [];
    for (var index = 6; index < headers.length; index += 1) {
      if (TECHNICAL_FIELD_ALIASES_[field].indexOf(normalizeHeader_(headers[index])) !== -1) {
        matches.push(index + 1);
      }
    }
    if (matches.length > 1) {
      throw intakeError_('SHEET_SCHEMA_MISMATCH', 'Duplicate technical column: ' + field);
    }
    if (matches.length === 1) {
      map[field] = matches[0];
    }
  });
  return map;
}

function ensureSubmissionIdColumn_(sheet, headerMap) {
  if (headerMap.submission_id) {
    return headerMap.submission_id;
  }
  var column = Math.max(sheet.getLastColumn(), 6) + 1;
  sheet.getRange(1, column).setValue('submission_id');
  return column;
}

function findSubmissionRow_(sheet, column, submissionId) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return 0;
  }
  var values = sheet.getRange(2, column, lastRow - 1, 1).getDisplayValues();
  var found = 0;
  for (var i = 0; i < values.length; i += 1) {
    if (String(values[i][0]).trim() === submissionId) {
      if (found) {
        throw intakeError_('DUPLICATE_CONFLICT', 'Multiple rows use the same submission_id');
      }
      found = i + 2;
    }
  }
  return found;
}

function writeKnownFields_(sheet, row, headerMap, request) {
  var itemSummary = resolveItemSummary_(request);
  var values = {
    name: request.name || '',
    phone: request.phone,
    address: request.address,
    itemSummary: itemSummary,
    payer_text: request.payer_text || '',
    amount_rub: request.amount_rub === undefined ? '' : Number(request.amount_rub),
    apt: request.apt || '',
    time: request.time || '',
    customerComment: request.customerComment || '',
    source: request.source || '',
    submission_id: request.submissionId,
  };

  Object.keys(values).forEach(function (field) {
    var column = headerMap[field];
    if (column) {
      sheet.getRange(row, column).setValue(values[field]);
    }
  });
}

function resolveItemSummary_(request) {
  return String(request.itemSummary);
}

function upsertFirestoreMeasurement_(request) {
  var documentUrl = firestoreDocumentUrl_(request.submissionId);
  var existing = firestoreFetch_(documentUrl, 'get');
  var now = new Date().toISOString();
  var fields = firestoreProjectionFields_(request, now);
  var fieldPaths = Object.keys(fields);
  var created = existing.status === 404;

  if (created) {
    fields.createdAt = { timestampValue: now };
    fieldPaths.push('createdAt');
  } else if (existing.status < 200 || existing.status >= 300) {
    throw new Error('Firestore read failed');
  }

  firestorePatch_(documentUrl, fields, fieldPaths);
  return { created: created };
}

function firestoreProjectionFields_(request, now) {
  var itemSummary = resolveItemSummary_(request);
  var fields = {
    submissionId: firestoreString_(request.submissionId),
    source: firestoreString_(request.source || ''),
    name: firestoreString_(request.name || ''),
    phone: firestoreString_(request.phone),
    address: firestoreString_(request.address),
    comment: firestoreString_(itemSummary),
    payer_text: firestoreString_(request.payer_text || ''),
    amount_rub: firestoreNumber_(request.amount_rub),
    preliminaryTotalRub: firestoreNumber_(request.preliminaryTotalRub),
    measurerPayoutRub: firestoreNumber_(request.measurerPayoutRub),
    measurerPayer: firestoreString_(request.measurerPayer),
    customerDepositRub: firestoreNumber_(request.customerDepositRub),
    remainingBalanceRub: firestoreNumber_(request.remainingBalanceRub),
    updatedAt: { timestampValue: now },
    sheetSyncStatus: firestoreString_('pending'),
    sheetSyncUpdatedAt: { timestampValue: now },
    sheetSyncErrorCode: { nullValue: null },
  };
  addOptionalFirestoreString_(fields, 'apt', request.apt);
  addOptionalFirestoreString_(fields, 'time', request.time);
  addOptionalFirestoreString_(fields, 'customerComment', request.customerComment);
  return fields;
}

function updateFirestoreSheetStatus_(submissionId, status, errorCode) {
  var now = new Date().toISOString();
  var fields = {
    updatedAt: { timestampValue: now },
    sheetSyncStatus: firestoreString_(status),
    sheetSyncUpdatedAt: { timestampValue: now },
    sheetSyncErrorCode: errorCode ? firestoreString_(errorCode) : { nullValue: null },
  };
  firestorePatch_(firestoreDocumentUrl_(submissionId), fields, Object.keys(fields));
}

function firestorePatch_(url, fields, fieldPaths) {
  var query = fieldPaths
    .map(function (field) {
      return 'updateMask.fieldPaths=' + encodeURIComponent(field);
    })
    .join('&');
  var response = firestoreFetch_(url + '?' + query, 'patch', { fields: fields });
  if (response.status < 200 || response.status >= 300) {
    throw new Error('Firestore patch failed');
  }
}

function firestoreFetch_(url, method, payload) {
  var options = {
    method: method,
    headers: {
      Authorization: 'Bearer ' + ScriptApp.getOAuthToken(),
      'Content-Type': 'application/json',
    },
    muteHttpExceptions: true,
  };
  if (payload !== undefined) {
    options.payload = JSON.stringify(payload);
  }
  var response = UrlFetchApp.fetch(url, options);
  return {
    status: response.getResponseCode(),
    text: response.getContentText() || '',
  };
}

function firestoreDocumentUrl_(submissionId) {
  var projectId = String(
    PropertiesService.getScriptProperties().getProperty(FIRESTORE_PROJECT_PROPERTY_) || '',
  ).trim();
  if (!projectId) {
    throw intakeError_('FIRESTORE_NOT_CONFIGURED', 'Firebase project is not configured');
  }
  return (
    'https://firestore.googleapis.com/v1/projects/' +
    encodeURIComponent(projectId) +
    '/databases/(default)/documents/' +
    FIRESTORE_COLLECTION_ +
    '/' +
    encodeURIComponent(submissionId)
  );
}

function firestoreString_(value) {
  return { stringValue: String(value === undefined || value === null ? '' : value) };
}

function firestoreNumber_(value) {
  var number = value === undefined || value === null || value === '' ? 0 : Number(value);
  return Number(number) === Math.round(number)
    ? { integerValue: String(Math.round(number)) }
    : { doubleValue: number };
}

function addOptionalFirestoreString_(fields, field, value) {
  if (value !== undefined && value !== null && String(value).trim() !== '') {
    fields[field] = firestoreString_(value);
  }
}

function normalizeHeader_(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function intakeError_(code, message) {
  var error = new Error(message);
  error.intakeCode = code;
  return error;
}

function safeError_(error) {
  var code = error && error.intakeCode ? error.intakeCode : 'INTERNAL_ERROR';
  var allowed = {
    INVALID_ACTION: true,
    VALIDATION_ERROR: true,
    SHEET_NOT_FOUND: true,
    SHEET_SCHEMA_MISMATCH: true,
    DUPLICATE_CONFLICT: true,
    FIRESTORE_NOT_CONFIGURED: true,
    INTERNAL_ERROR: true,
  };
  if (!allowed[code]) {
    code = 'INTERNAL_ERROR';
  }
  return {
    ok: false,
    error: {
      code: code,
      message: code === 'INTERNAL_ERROR' ? 'Internal error' : String(error.message || code),
    },
  };
}

function safeSheetErrorCode_(error) {
  var code = error && error.intakeCode ? error.intakeCode : 'SHEET_WRITE_FAILED';
  var allowed = {
    SHEET_NOT_FOUND: true,
    SHEET_SCHEMA_MISMATCH: true,
    DUPLICATE_CONFLICT: true,
    SHEET_WRITE_FAILED: true,
  };
  return allowed[code] ? code : 'SHEET_WRITE_FAILED';
}

function jsonResponse_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
