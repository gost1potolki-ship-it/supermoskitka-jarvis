/**
 * Measurement Intake V1 — dedicated Google Apps Script Web App.
 *
 * Deploy this file separately from the production-order webhook. Configure
 * optional SPREADSHEET_ID and MEASUREMENT_SHEET_NAME Script Properties.
 * The default sheet name is "Замеры".
 *
 * Request:
 *   { action: "upsert_measurement", submissionId, address, name, phone,
 *     comment, amount_rub, payer_text, apt, time, source }
 *
 * The stable submission_id column is created at the end of the header row
 * when absent. Existing A–F headers are never renamed or reordered.
 */

var MEASUREMENT_ACTION_ = 'upsert_measurement';
var DEFAULT_MEASUREMENT_SHEET_NAME_ = 'Замеры';
var REQUIRED_FIELDS_ = ['submissionId', 'address', 'phone'];

var FIELD_ALIASES_ = {
  address: ['address', 'адрес', 'объект', 'a'],
  name: ['name', 'имя', 'клиент', 'customer', 'b'],
  phone: ['phone', 'телефон', 'tel', 'c'],
  comment: ['comment', 'комментарий', 'заметка', 'managercomment', 'd'],
  amount_rub: ['amount_rub', 'цена', 'сумма', 'e'],
  payer_text: ['payer_text', 'платит', 'кто платит', 'f'],
  apt: ['apt', 'flat', 'кв', 'квартира'],
  time: ['time', 'время', 'замер на'],
  source: ['source', 'источник'],
  submission_id: ['submission_id', 'submissionid'],
};

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
    var request = parseRequest_(e);
    validateRequest_(request);
    var result = upsertMeasurement_(request);
    return jsonResponse_({
      ok: true,
      submissionId: request.submissionId,
      created: result.created,
      updated: result.updated,
      row: result.row,
    });
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
  if (!request || request.action !== MEASUREMENT_ACTION_) {
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
  if (
    request.amount_rub !== undefined &&
    (!isFinite(Number(request.amount_rub)) || Number(request.amount_rub) < 0)
  ) {
    throw intakeError_('VALIDATION_ERROR', 'amount_rub is invalid');
  }
}

function upsertMeasurement_(request) {
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
  var map = {};

  Object.keys(FIELD_ALIASES_).forEach(function (field) {
    var aliases = FIELD_ALIASES_[field];
    for (var i = 0; i < headers.length; i += 1) {
      var normalized = normalizeHeader_(headers[i]);
      if (aliases.indexOf(normalized) !== -1) {
        map[field] = i + 1;
        break;
      }
    }
  });

  // Legacy A–F fallback; only used for fields whose headers were not recognized.
  map.address = map.address || 1;
  map.name = map.name || 2;
  map.phone = map.phone || 3;
  map.comment = map.comment || 4;
  map.amount_rub = map.amount_rub || 5;
  map.payer_text = map.payer_text || 6;
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
  var values = {
    address: request.address,
    name: request.name || '',
    phone: request.phone,
    comment: request.comment || '',
    amount_rub: request.amount_rub === undefined ? '' : Number(request.amount_rub),
    payer_text: request.payer_text || '',
    apt: request.apt || '',
    time: request.time || '',
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
    DUPLICATE_CONFLICT: true,
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

function jsonResponse_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
