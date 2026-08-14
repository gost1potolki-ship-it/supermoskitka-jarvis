/**
 * CRM "Супермоскитка"
 * Google Apps Script → Firestore (замеры, монтажи, GET API).
 *
 * Деплой: Extensions → Apps Script → вставить этот файл целиком.
 * Откат: scripts/google-apps-script/firebase-crm.backup.js
 *
 * Синхронизация «Замеры» (2026-05-29):
 * - стабильный docId m_<sha256(phone|address)>
 * - diff по source_hash, без wipe коллекции
 * - 0 валидных строк → коллекция не трогается
 * - batchWrite с проверкой ответа
 * - LockService + rate limit 2 мин
 * - dry run: planSyncMeasurements_ без записи в Firestore
 *
 * Синхронизация «Монтажи» (2026-05-31):
 * - stable docId = orderId
 * - diff по source_hash, без wipe ready_orders
 * - measurements обновляется только если workStatus !== ready
 * - batchWriteChecked пачками по 450
 * - dry run: planSyncReadyOrders_ без записи в Firestore
 * - safety: FORCE_DELETE_* / IMPORT_MISSING_ACTIVE_MEASUREMENTS flags
 * - пустой статус = historical_ignored; unknown = blocked + ABORT
 * - группировка строк по orderId (колонка W), агрегатный статус заказа
 * - doPost webhook: строки в таблицу со статусом "В работе" и orderId=archiveId
 *
 * Rebuild архива (отдельный режим):
 * - rebuildArchiveFromActiveSheetOrdersDryRun / rebuildArchiveFromActiveSheetOrders
 * - FORCE_REBUILD_ARCHIVE_FROM_SHEETS; counts из таблицы, без hardcoded expected totals
 */
var FIREBASE_PROJECT_ID = 'supermoskitka-587fb';
var FIRESTORE_DB = '(default)';
var COLLECTION_MEASUREMENTS = 'upcoming_measurements';
var COLLECTION_ARCHIVE = 'measurements';
var COLLECTION_READY = 'ready_orders';
var SHEET_MEASUREMENTS = 'Замеры';
var FORCE_DELETE_READY_ORDERS = false;
var FORCE_DELETE_COMPLETED_MEASUREMENTS = false;
var IMPORT_MISSING_ACTIVE_MEASUREMENTS = false;
var FORCE_REBUILD_ARCHIVE_FROM_SHEETS = false;
var REBUILD_FLAG_PROP = 'FORCE_REBUILD_ARCHIVE_FROM_SHEETS';
var ORDER_ID_COL = 22; // W
var SHEET_STATUS_IN_WORK = 'В работе';

var SYNC_LOCK_NAME = 'syncToFirestore_measurements';
var SYNC_RATE_LIMIT_PROP = 'syncMeasurementsLastRunMs';
var SYNC_RATE_LIMIT_MS = 2 * 60 * 1000;
var MEASUREMENT_DOC_ID_PREFIX = 'm_';
var MEASUREMENT_DOC_ID_HEX_LEN = 32;

// ===== Для GET "Заказы в работе" =====
var SHEET_RAMOCHNIE = 'Рамочные';
var SHEET_PLISSE = 'Плиссе';
var SHEET_SHTORI = 'Шторы';

var STATUS_COL_RAMOCHNIE = 15; // P
var STATUS_COL_PLISSE = 19;    // T
var STATUS_COL_SHTORI = 16;    // Q
var ORDERS_COLS_AW = 23;

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Firebase Sync')
    .addItem('Обновить список замерщику', 'syncToFirestore')
    .addItem('Замеры — dry run (без записи)', 'syncToFirestoreDryRun')
    .addItem('Синхронизировать монтажи', 'syncReadyOrders')
    .addItem('Монтажи — dry run (без записи)', 'syncReadyOrdersDryRun')
    .addSeparator()
    .addItem('Rebuild архива — dry run', 'rebuildArchiveFromActiveSheetOrdersDryRun')
    .addItem('Rebuild архива (ОПАСНО)', 'rebuildArchiveFromActiveSheetOrders')
    .addToUi();
}

/**
 * Старая syncToFirestore (до 2026-05-29) — для справки:
 * - listAllDocumentNames_ + batchDeleteDocuments_ всей коллекции
 * - docId = Utilities.getUuid()
 * - batchWrite_ без проверки HTTP
 * См. firebase-crm.backup.js
 */

/** ===== 1. СИНХРОНИЗАЦИЯ ЗАМЕРОВ (incremental) ===== */
function syncToFirestore() {
  runSyncToFirestore_(false);
}

function syncToFirestoreDryRun() {
  runSyncToFirestore_(true);
}

function runSyncToFirestore_(dryRun) {
  var ui = SpreadsheetApp.getUi();
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(0)) {
    ui.alert('Синхронизация', 'Синхронизация уже выполняется. Подождите завершения.', ui.ButtonSet.OK);
    return;
  }
  try {
    if (!dryRun && !checkSyncRateLimit_()) {
      ui.alert('Синхронизация', 'Слишком частый запуск. Повторите не раньше чем через 2 минуты.', ui.ButtonSet.OK);
      return;
    }
    var plan = planSyncMeasurements_();
    if (!dryRun && plan.validRows.length === 0) {
      ui.alert(
        'Синхронизация остановлена',
        'В листе нет валидных строк с адресом. Синхронизация остановлена, коллекция не изменялась.',
        ui.ButtonSet.OK
      );
      return;
    }
    var totalCompleted = 0;
    var report = buildSyncMeasurementsReport_(plan, dryRun, totalCompleted);
    Logger.log(report);
    if (!dryRun && plan.writes.length > 0) {
      batchWrite_(plan.writes);
      totalCompleted = plan.writes.length;
      report = buildSyncMeasurementsReport_(plan, dryRun, totalCompleted);
      Logger.log(report);
    }
    if (!dryRun && plan.validRows.length > 0) {
      PropertiesService.getScriptProperties().setProperty(SYNC_RATE_LIMIT_PROP, String(Date.now()));
    }
    ui.alert(dryRun ? 'Замеры — dry run' : 'Синхронизация завершена', report, ui.ButtonSet.OK);
  } catch (e) {
    Logger.log('syncToFirestore error: ' + errorText_(e));
    ui.alert('Ошибка синхронизации', errorText_(e), ui.ButtonSet.OK);
  } finally {
    lock.releaseLock();
  }
}

function planSyncMeasurements_() {
  var sheetResult = readMeasurementsSheetWithStats_();
  var validRows = sheetResult.rows;
  var tableByDocId = {};
  if (validRows.length > 0) {
    tableByDocId = buildTableDocMap_(validRows, sheetResult.duplicateCount);
  }
  var firestoreDocs = listMeasurementDocuments_();
  var firestoreByDocId = {};
  for (var i = 0; i < firestoreDocs.length; i++) {
    firestoreByDocId[firestoreDocs[i].docId] = firestoreDocs[i];
  }
  var writes = [];
  var stats = { added: 0, updated: 0, unchanged: 0, deleted: 0 };
  var deletedDocIds = [];
  for (var docId in tableByDocId) {
    if (!tableByDocId.hasOwnProperty(docId)) continue;
    var row = tableByDocId[docId];
    var existing = firestoreByDocId[docId];
    if (!existing || existing.source_hash !== row.source_hash) {
      writes.push(buildMeasurementWrite_(docId, row));
      if (!existing) stats.added++;
      else stats.updated++;
    } else {
      stats.unchanged++;
    }
  }
  for (var fId in firestoreByDocId) {
    if (!firestoreByDocId.hasOwnProperty(fId)) continue;
    if (!tableByDocId[fId] && isLegacyMeasurementDocId_(fId)) {
      deletedDocIds.push(fId);
      writes.push({ delete: firestoreByDocId[fId].docName });
      stats.deleted++;
    }
  }
  deletedDocIds.sort();
  return {
    validRows: validRows,
    duplicateCount: sheetResult.duplicateCount,
    skippedNoAddress: sheetResult.skippedNoAddress,
    stats: stats,
    writes: writes,
    deletedDocIds: deletedDocIds
  };
}

function buildSyncMeasurementsReport_(plan, dryRun, totalCompleted) {
  var stats = plan.stats;
  var lines = [
    dryRun ? 'syncToFirestore DRY RUN report:' : 'syncToFirestore incremental report:',
    '- valid rows: ' + plan.validRows.length,
    '- skipped (no address): ' + plan.skippedNoAddress,
    '- added: ' + stats.added,
    '- updated: ' + stats.updated,
    '- deleted: ' + stats.deleted,
    '- unchanged: ' + stats.unchanged,
    '- total writes planned: ' + plan.writes.length
  ];
  if (plan.duplicateCount > 0) {
    lines.push('- duplicates phone+address (last row kept): ' + plan.duplicateCount);
  }
  if (plan.deletedDocIds.length > 0) {
    lines.push('- deleted docIds: ' + plan.deletedDocIds.join(', '));
  } else {
    lines.push('- deleted docIds: (none)');
  }
  if (dryRun) {
    lines.push('- total writes completed: 0 (dry run, no Firestore writes)');
    if (plan.validRows.length === 0) {
      lines.push('- NOTE: real sync would stop without changing Firestore (0 valid rows)');
    }
  } else {
    lines.push('- total writes completed: ' + totalCompleted);
  }
  return lines.join('\n');
}

function sha256Hex_(input) {
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, input, Utilities.Charset.UTF_8);
  var hex = '';
  for (var i = 0; i < digest.length; i++) {
    var b = digest[i];
    if (b < 0) b += 256;
    hex += ('0' + b.toString(16)).slice(-2);
  }
  return hex;
}

function buildMeasurementSourceKey_(phone, address) {
  return normalizePhone_(phone) + '|' + safeString_(address).toLowerCase();
}

function buildMeasurementDocId_(phone, address) {
  return MEASUREMENT_DOC_ID_PREFIX + sha256Hex_(buildMeasurementSourceKey_(phone, address)).substring(0, MEASUREMENT_DOC_ID_HEX_LEN);
}

function isLegacyMeasurementDocId_(docId) {
  return safeString_(docId).indexOf(MEASUREMENT_DOC_ID_PREFIX) === 0;
}

function buildMeasurementSourceHash_(row) {
  var payload = [
    safeString_(row.name),
    normalizePhone_(row.phone),
    safeString_(row.address).toLowerCase(),
    safeString_(row.comment),
    safeString_(row.payer_text),
    String(parseAmountToInt_(row.amount_rub)),
    safeString_(row.submission_id)
  ].join('|');
  return sha256Hex_(payload);
}

function buildTableDocMap_(rows, duplicateCount) {
  var map = {};
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    r.source_key = buildMeasurementSourceKey_(r.phone, r.address);
    r.source_hash = buildMeasurementSourceHash_(r);
    r.docId = safeString_(r.submission_id) || buildMeasurementDocId_(r.phone, r.address);
    map[r.docId] = r;
  }
  return map;
}

function buildMeasurementWrite_(docId, row) {
  var docName = 'projects/' + FIREBASE_PROJECT_ID + '/databases/' + FIRESTORE_DB + '/documents/' + COLLECTION_MEASUREMENTS + '/' + docId;
  return {
    update: {
      name: docName,
      fields: {
        name: { stringValue: row.name || '' },
        phone: { stringValue: normalizePhone_(row.phone || '') },
        address: { stringValue: row.address || '' },
        comment: { stringValue: row.comment || '' },
        payer_text: { stringValue: row.payer_text || '' },
        amount_rub: { integerValue: String(parseAmountToInt_(row.amount_rub) || 0) },
        source_hash: { stringValue: row.source_hash },
        source_key: { stringValue: row.source_key },
        updated_at: { stringValue: new Date().toISOString() }
      }
    },
    updateMask: {
      fieldPaths: [
        'name',
        'phone',
        'address',
        'comment',
        'payer_text',
        'amount_rub',
        'source_hash',
        'source_key',
        'updated_at'
      ]
    }
  };
}

function findMeasurementSubmissionIdColumn_(sheet) {
  var lastColumn = sheet.getLastColumn();
  if (lastColumn <= 6) return -1;
  var headers = sheet.getRange(1, 7, 1, lastColumn - 6).getValues()[0];
  for (var i = 0; i < headers.length; i++) {
    if (safeString_(headers[i]).toLowerCase() === 'submission_id') return i + 6;
  }
  return -1;
}

function readMeasurementsSheetWithStats_() {
  var rows = [];
  var duplicateCount = 0;
  var skippedNoAddress = 0;
  var seenKeys = {};
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_MEASUREMENTS);
  if (!sh) return { rows: [], duplicateCount: 0, skippedNoAddress: 0 };
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return { rows: [], duplicateCount: 0, skippedNoAddress: 0 };
  var submissionIdColumn = findMeasurementSubmissionIdColumn_(sh);
  var columnCount = submissionIdColumn >= 0 ? submissionIdColumn + 1 : 6;
  var values = sh.getRange(2, 1, lastRow - 1, columnCount).getValues();
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var address = safeString_(row[2]);
    if (!address) {
      skippedNoAddress++;
      continue;
    }
    var item = {
      name: safeString_(row[0]),
      phone: safeString_(row[1]),
      address: address,
      comment: safeString_(row[3]),
      payer_text: safeString_(row[4]),
      amount_rub: parseAmountToInt_(row[5]),
      submission_id: submissionIdColumn >= 0 ? safeString_(row[submissionIdColumn]) : ''
    };
    var key = buildMeasurementSourceKey_(item.phone, item.address);
    if (seenKeys[key]) duplicateCount++;
    seenKeys[key] = true;
    rows.push(item);
  }
  return { rows: rows, duplicateCount: duplicateCount, skippedNoAddress: skippedNoAddress };
}

function listMeasurementDocuments_() {
  var result = [];
  var pageToken = '';
  do {
    var url = firestoreBaseUrl_() + '/' + encodeURIComponent(COLLECTION_MEASUREMENTS) + '?pageSize=1000';
    if (pageToken) url += '&pageToken=' + encodeURIComponent(pageToken);
    var res = UrlFetchApp.fetch(url, { method: 'get', headers: authHeaders_(), muteHttpExceptions: true });
    if (res.getResponseCode() === 404) return [];
    var text = res.getContentText();
    if (!text) break;
    var json = JSON.parse(text);
    var docs = json.documents || [];
    for (var i = 0; i < docs.length; i++) {
      var d = docs[i];
      var docName = d.name;
      var docId = docName.substring(docName.lastIndexOf('/') + 1);
      var fields = d.fields || {};
      result.push({
        docId: docId,
        docName: docName,
        source_hash: getFirestoreStringField_(fields, 'source_hash')
      });
    }
    pageToken = json.nextPageToken || '';
  } while (pageToken);
  return result;
}

function getFirestoreStringField_(fields, key) {
  if (!fields[key]) return '';
  if (fields[key].stringValue !== undefined) return fields[key].stringValue;
  return '';
}

function checkSyncRateLimit_() {
  var raw = PropertiesService.getScriptProperties().getProperty(SYNC_RATE_LIMIT_PROP);
  if (!raw) return true;
  var last = Number(raw);
  if (!isFinite(last)) return true;
  return (Date.now() - last) >= SYNC_RATE_LIMIT_MS;
}

/** ===== 2. СИНХРОНИЗАЦИЯ МОНТАЖЕЙ (incremental) ===== */
function syncReadyOrders(dryRun) {
  runSyncReadyOrders_(dryRun === true);
}

function syncReadyOrdersDryRun() {
  runSyncReadyOrders_(true);
}

function runSyncReadyOrders_(dryRun) {
  try {
    var plan = planSyncReadyOrders_();
    var totalCompleted = 0;
    var report = buildSyncReadyOrdersReport_(plan, dryRun, totalCompleted);
    Logger.log(report);
    validateSyncReadyOrdersPlan_(plan, dryRun);
    if (!dryRun && plan.writes.length > 0) {
      totalCompleted = batchWriteChecked(plan.writes);
      report = buildSyncReadyOrdersReport_(plan, dryRun, totalCompleted);
      Logger.log(report);
    }
    safeAlert_((dryRun ? 'Монтажи — dry run' : 'Монтажи') + '\n\n' + report);
  } catch (e) {
    Logger.log('syncReadyOrders error: ' + errorText_(e));
    safeAlert_('Ошибка монтажей\n\n' + errorText_(e));
  }
}

function validateSyncReadyOrdersPlan_(plan, dryRun) {
  if (dryRun) return;
  if (plan.stats.skippedNoOrderId > 0) {
    throw new Error('ABORTED: skipped rows without orderId > 0. Fix orderId before real sync.');
  }
  if (plan.stats.blockedUnknownStatusGroups > 0) {
    throw new Error(
      'ABORTED: blocked_unknown_status groups > 0 (' + plan.stats.blockedUnknownStatusGroups +
      '). Fix unknown statuses in sheet before real sync.'
    );
  }
  if (plan.stats.readyOrdersDeletedDangerous > 0 && !FORCE_DELETE_READY_ORDERS) {
    throw new Error(
      'ABORTED: dangerous ready_orders deletes > 0 (' + plan.stats.readyOrdersDeletedDangerous +
      '). Set FORCE_DELETE_READY_ORDERS = true to allow deletes not caused by completed sheet status, or fix source data.'
    );
  }
  if (plan.stats.measurementsDeletedDangerous > 0 && !FORCE_DELETE_COMPLETED_MEASUREMENTS) {
    throw new Error(
      'ABORTED: dangerous measurements deletes > 0 (' + plan.stats.measurementsDeletedDangerous +
      '). Set FORCE_DELETE_COMPLETED_MEASUREMENTS = true to allow deletes not caused by completed sheet status.'
    );
  }
}

function planSyncReadyOrders_() {
  var sheetResult = readGroupedOrdersFromSheets_();
  var groups = sheetResult.groups;
  var stats = {
    readyOrdersAdded: 0,
    readyOrdersUpdated: 0,
    readyOrdersDeleted: 0,
    readyOrdersDeletedCompleted: 0,
    readyOrdersDeletedDangerous: 0,
    readyOrdersUnchanged: 0,
    measurementsInProductionUpdated: 0,
    measurementsReadyUpdated: 0,
    measurementsImported: 0,
    measurementsDeleted: 0,
    measurementsDeletedCompleted: 0,
    measurementsDeletedDangerous: 0,
    measurementsUnchanged: 0,
    historicalIgnoredGroups: 0,
    blockedUnknownStatusGroups: 0,
    activeMissingMeasurements: 0,
    completedOrdersToRemove: 0,
    skippedNoOrderId: sheetResult.skippedNoOrderId
  };
  var readyOrdersDeletedDocIds = [];
  var readyOrdersDeleteReasons = [];
  var measurementsDeleteReasons = [];
  var completedOrderIds = {};
  var groupReports = [];
  var activeMissingList = [];
  var blockedUnknownList = [];
  var activeTableOrderIds = {};

  var existingReadyOrders = getCollectionDocs(COLLECTION_READY);
  var existingReadyByDocId = {};
  for (var i = 0; i < existingReadyOrders.length; i++) {
    existingReadyByDocId[existingReadyOrders[i].docId] = existingReadyOrders[i];
  }

  var desiredReadyOrders = {};
  var writes = [];

  for (var orderId in groups) {
    if (!groups.hasOwnProperty(orderId)) continue;
    var group = groups[orderId];
    var aggregateStatus = calculateOrderAggregateStatus_(group.rows);
    var statusCounts = countOrderStatusBuckets_(group.rows);
    var activeRows = getActiveOrderRows_(group.rows);
    var report = {
      orderId: orderId,
      rowCount: group.rows.length,
      activeRowCount: activeRows.length,
      statusCounts: statusCounts,
      calculatedWorkStatus: aggregateStatus,
      readyOrdersAction: 'none',
      measurementsAction: 'none',
      rowDetails: group.rows.map(function(r) {
        return {
          sheet: r.sheet,
          row: r.row,
          statusColumn: r.statusColumn,
          rawStatus: r.rawStatus,
          normalizedStatus: r.normalizedStatus,
          orderId: r.orderId
        };
      })
    };

    if (aggregateStatus === 'historical_ignored') {
      stats.historicalIgnoredGroups++;
      report.readyOrdersAction = 'none';
      report.measurementsAction = 'none';
      groupReports.push(report);
      continue;
    }

    if (aggregateStatus === 'blocked_unknown_status') {
      stats.blockedUnknownStatusGroups++;
      report.readyOrdersAction = 'none';
      report.measurementsAction = 'none';
      blockedUnknownList.push({
        orderId: orderId,
        name: group.name,
        phone: group.phone,
        address: group.address,
        rowDetails: report.rowDetails
      });
      groupReports.push(report);
      continue;
    }

    if (aggregateStatus === 'ready') {
      var readyData = buildReadyOrderDataFromGroup_(group);
      desiredReadyOrders[orderId] = {
        data: readyData,
        source_hash: calculateSourceHash(readyData)
      };
      report.readyOrdersAction = 'upsert';
      activeTableOrderIds[orderId] = true;
    } else if (aggregateStatus === 'completed') {
      report.readyOrdersAction = 'delete (completed_from_sheet)';
    } else {
      report.readyOrdersAction = 'delete/none';
    }

    if (aggregateStatus === 'in_production') {
      activeTableOrderIds[orderId] = true;
    }

    var archiveDoc = getDocument(COLLECTION_ARCHIVE, orderId);
    if (aggregateStatus === 'completed') {
      completedOrderIds[orderId] = true;
      stats.completedOrdersToRemove++;
      if (archiveDoc) {
        writes.push({ delete: archiveDoc.docName });
        stats.measurementsDeleted++;
        stats.measurementsDeletedCompleted++;
        measurementsDeleteReasons.push({ orderId: orderId, reason: 'completed_from_sheet' });
        report.measurementsAction = 'delete (completed_from_sheet)';
      } else {
        report.measurementsAction = 'none (missing doc)';
      }
    } else if (aggregateStatus === 'in_production') {
      if (!archiveDoc) {
        stats.activeMissingMeasurements++;
        var missingEntry = buildActiveMissingEntry_(group, aggregateStatus, report.rowDetails);
        activeMissingList.push(missingEntry);
        if (IMPORT_MISSING_ACTIVE_MEASUREMENTS) {
          writes.push(buildImportedMeasurementWrite_(group, 'in_production', 'В производстве'));
          stats.measurementsImported++;
          report.measurementsAction = 'import in_production';
        } else {
          report.measurementsAction = 'active missing measurement';
        }
      } else {
        var currentProduction = getFirestoreStringField_(archiveDoc.fields, 'workStatus');
        if (currentProduction !== 'in_production') {
          writes.push(buildMeasurementWorkStatusWrite_(orderId, 'in_production', 'В производстве', false));
          stats.measurementsInProductionUpdated++;
          report.measurementsAction = 'update in_production';
        } else {
          stats.measurementsUnchanged++;
          report.measurementsAction = 'none (already in_production)';
        }
      }
    } else if (aggregateStatus === 'ready') {
      if (!archiveDoc) {
        stats.activeMissingMeasurements++;
        var missingReadyEntry = buildActiveMissingEntry_(group, aggregateStatus, report.rowDetails);
        activeMissingList.push(missingReadyEntry);
        if (IMPORT_MISSING_ACTIVE_MEASUREMENTS) {
          writes.push(buildImportedMeasurementWrite_(group, 'ready', 'Готов'));
          stats.measurementsImported++;
          report.measurementsAction = 'import ready';
        } else {
          report.measurementsAction = 'active missing measurement';
        }
      } else {
        var currentReady = getFirestoreStringField_(archiveDoc.fields, 'workStatus');
        if (currentReady !== 'ready') {
          writes.push(buildMeasurementWorkStatusWrite_(orderId, 'ready', 'Готов', true));
          stats.measurementsReadyUpdated++;
          report.measurementsAction = 'update ready';
        } else {
          stats.measurementsUnchanged++;
          report.measurementsAction = 'none (already ready)';
        }
      }
    }

    groupReports.push(report);
  }

  for (var readyDocId in desiredReadyOrders) {
    if (!desiredReadyOrders.hasOwnProperty(readyDocId)) continue;
    var desired = desiredReadyOrders[readyDocId];
    var existingReady = existingReadyByDocId[readyDocId];
    if (!existingReady) {
      writes.push(buildReadyOrderWrite_(readyDocId, desired.data, desired.source_hash));
      stats.readyOrdersAdded++;
    } else if (existingReady.source_hash !== desired.source_hash) {
      writes.push(buildReadyOrderWrite_(readyDocId, desired.data, desired.source_hash));
      stats.readyOrdersUpdated++;
    } else {
      stats.readyOrdersUnchanged++;
    }
  }

  for (var existingReadyDocId in existingReadyByDocId) {
    if (!existingReadyByDocId.hasOwnProperty(existingReadyDocId)) continue;
    if (!desiredReadyOrders[existingReadyDocId]) {
      var readyDeleteReason = completedOrderIds[existingReadyDocId]
        ? 'completed_from_sheet'
        : 'missing_from_active_or_completed_groups';
      readyOrdersDeletedDocIds.push(existingReadyDocId);
      readyOrdersDeleteReasons.push({ orderId: existingReadyDocId, reason: readyDeleteReason });
      writes.push({ delete: existingReadyByDocId[existingReadyDocId].docName });
      stats.readyOrdersDeleted++;
      if (readyDeleteReason === 'completed_from_sheet') {
        stats.readyOrdersDeletedCompleted++;
      } else {
        stats.readyOrdersDeletedDangerous++;
      }
    }
  }

  var staleArchiveCandidates = findStaleArchiveCandidates_(activeTableOrderIds);

  readyOrdersDeletedDocIds.sort();
  var completedOrderIdList = Object.keys(completedOrderIds).sort();
  groupReports.sort(function(a, b) {
    return String(a.orderId).localeCompare(String(b.orderId));
  });

  return {
    stats: stats,
    writes: writes,
    readyOrdersDeletedDocIds: readyOrdersDeletedDocIds,
    readyOrdersDeleteReasons: readyOrdersDeleteReasons,
    measurementsDeleteReasons: measurementsDeleteReasons,
    completedOrderIds: completedOrderIdList,
    groupReports: groupReports,
    skippedRows: sheetResult.skippedRows,
    activeMissingList: activeMissingList,
    blockedUnknownList: blockedUnknownList,
    staleArchiveCandidates: staleArchiveCandidates
  };
}

function buildActiveMissingEntry_(group, aggregateStatus, rowDetails) {
  return {
    orderId: group.orderId,
    calculatedWorkStatus: aggregateStatus,
    name: group.name,
    phone: group.phone,
    address: group.address,
    rowDetails: rowDetails
  };
}

function findStaleArchiveCandidates_(activeTableOrderIds) {
  var candidates = [];
  var allMeasurements = getCollectionDocs(COLLECTION_ARCHIVE);
  for (var i = 0; i < allMeasurements.length; i++) {
    var mdoc = allMeasurements[i];
    if (activeTableOrderIds[mdoc.docId]) continue;
    var workStatus = getFirestoreStringField_(mdoc.fields, 'workStatus');
    if (!workStatus || workStatus === 'waiting') continue;
    var archiveIdField = getFirestoreStringField_(mdoc.fields, 'archiveId') || mdoc.docId;
    candidates.push({
      docId: mdoc.docId,
      archiveId: archiveIdField,
      workStatus: workStatus,
      workStatusLabel: getFirestoreStringField_(mdoc.fields, 'workStatusLabel'),
      name: getFirestoreStringField_(mdoc.fields, 'name'),
      phone: getFirestoreStringField_(mdoc.fields, 'phone'),
      address: getFirestoreStringField_(mdoc.fields, 'address')
    });
  }
  candidates.sort(function(a, b) {
    return String(a.docId).localeCompare(String(b.docId));
  });
  return candidates;
}

function formatSkippedReadyOrderRow_(entry, index) {
  return (
    '  [' + (index + 1) + '] sheet=' + entry.sheet +
    ' row=' + entry.row +
    ' phone=' + entry.phone +
    ' name=' + entry.name +
    ' address=' + entry.address +
    ' total=' + entry.total +
    ' legacyFallbackId=' + entry.legacyFallbackId +
    ' reason=' + entry.reason
  );
}

function formatOrderGroupDryRunReport_(groupReport) {
  var lines = [
    'orderId=' + groupReport.orderId,
    'rows=' + groupReport.rowCount + ' (active=' + (groupReport.activeRowCount || 0) + ')',
    'statuses:',
    '  - empty (historical): ' + (groupReport.statusCounts.empty || 0),
    '  - unknown: ' + (groupReport.statusCounts.unknown || 0),
    '  - В работе: ' + (groupReport.statusCounts.in_work || 0),
    '  - Готов к монтажу: ' + (groupReport.statusCounts.ready_for_install || 0),
    '  - Готов/Сдан: ' + (groupReport.statusCounts.completed || 0),
    'result=' + groupReport.calculatedWorkStatus,
    'ready_orders action=' + groupReport.readyOrdersAction,
    'measurements action=' + groupReport.measurementsAction,
    'row details:'
  ];
  if (groupReport.rowDetails && groupReport.rowDetails.length) {
    for (var i = 0; i < groupReport.rowDetails.length; i++) {
      var r = groupReport.rowDetails[i];
      lines.push(
        '  ' + r.sheet +
        ' row=' + r.row +
        ' statusColumn=' + r.statusColumn +
        ' rawStatus=' + (r.rawStatus || '(empty)') +
        ' normalizedStatus=' + r.normalizedStatus +
        ' orderId=' + r.orderId
      );
    }
  } else {
    lines.push('  (none)');
  }
  return lines.join('\n');
}

function buildSyncReadyOrdersReport_(plan, dryRun, totalCompleted) {
  var stats = plan.stats;
  var lines = [
    dryRun ? 'syncReadyOrders DRY RUN report:' : 'syncReadyOrders incremental report:',
    '- ready_orders added: ' + stats.readyOrdersAdded,
    '- ready_orders updated: ' + stats.readyOrdersUpdated,
    '- ready_orders deleted: ' + stats.readyOrdersDeleted,
    '- ready_orders deleted (completed_from_sheet): ' + stats.readyOrdersDeletedCompleted,
    '- ready_orders deleted (dangerous): ' + stats.readyOrdersDeletedDangerous,
    '- ready_orders unchanged: ' + stats.readyOrdersUnchanged,
    '- measurements in_production updated: ' + stats.measurementsInProductionUpdated,
    '- measurements ready updated: ' + stats.measurementsReadyUpdated,
    '- measurements imported from sheet: ' + stats.measurementsImported,
    '- measurements deleted (completed): ' + stats.measurementsDeleted,
    '- measurements deleted (completed_from_sheet): ' + stats.measurementsDeletedCompleted,
    '- measurements deleted (dangerous): ' + stats.measurementsDeletedDangerous,
    '- measurements unchanged: ' + stats.measurementsUnchanged,
    '- completed orders to remove: ' + stats.completedOrdersToRemove,
    '- historical ignored groups: ' + stats.historicalIgnoredGroups,
    '- blocked unknown status groups: ' + stats.blockedUnknownStatusGroups,
    '- active missing measurements: ' + stats.activeMissingMeasurements,
    '- skipped rows without orderId: ' + stats.skippedNoOrderId,
    '- total writes planned: ' + plan.writes.length
  ];
  if (plan.skippedRows && plan.skippedRows.length > 0) {
    lines.push('- skipped rows detail:');
    for (var s = 0; s < plan.skippedRows.length; s++) {
      lines.push(formatSkippedReadyOrderRow_(plan.skippedRows[s], s));
    }
  } else {
    lines.push('- skipped rows detail: (none)');
  }
  if (plan.completedOrderIds && plan.completedOrderIds.length > 0) {
    lines.push('- completed orderIds: ' + plan.completedOrderIds.join(', '));
  } else {
    lines.push('- completed orderIds: (none)');
  }
  if (plan.readyOrdersDeleteReasons && plan.readyOrdersDeleteReasons.length > 0) {
    lines.push('- ready_orders delete reasons:');
    for (var rd = 0; rd < plan.readyOrdersDeleteReasons.length; rd++) {
      var readyDelete = plan.readyOrdersDeleteReasons[rd];
      lines.push('  orderId=' + readyDelete.orderId + ' reason=' + readyDelete.reason);
    }
  } else {
    lines.push('- ready_orders delete reasons: (none)');
  }
  if (plan.measurementsDeleteReasons && plan.measurementsDeleteReasons.length > 0) {
    lines.push('- measurements delete reasons:');
    for (var md = 0; md < plan.measurementsDeleteReasons.length; md++) {
      var measDelete = plan.measurementsDeleteReasons[md];
      lines.push('  orderId=' + measDelete.orderId + ' reason=' + measDelete.reason);
    }
  } else {
    lines.push('- measurements delete reasons: (none)');
  }
  if (plan.readyOrdersDeletedDocIds.length > 0) {
    lines.push('- ready_orders deleted docIds: ' + plan.readyOrdersDeletedDocIds.join(', '));
  } else {
    lines.push('- ready_orders deleted docIds: (none)');
  }
  if (plan.groupReports && plan.groupReports.length > 0) {
    lines.push('- order groups (excluding historical_ignored):');
    var actionableCount = 0;
    for (var g = 0; g < plan.groupReports.length; g++) {
      if (plan.groupReports[g].calculatedWorkStatus === 'historical_ignored') continue;
      actionableCount++;
      lines.push(formatOrderGroupDryRunReport_(plan.groupReports[g]));
      lines.push('---');
    }
    if (actionableCount === 0) {
      lines.push('  (none — only historical_ignored groups in table)');
    } else {
      lines.pop();
    }
  } else {
    lines.push('- order groups: (none with orderId)');
  }
  if (plan.activeMissingList && plan.activeMissingList.length > 0) {
    lines.push('- active missing measurements detail:');
    for (var m = 0; m < plan.activeMissingList.length; m++) {
      var missing = plan.activeMissingList[m];
      lines.push(
        '  orderId=' + missing.orderId +
        ' result=' + missing.calculatedWorkStatus +
        ' name=' + missing.name +
        ' phone=' + missing.phone +
        ' address=' + missing.address
      );
      for (var mr = 0; mr < missing.rowDetails.length; mr++) {
        var rd = missing.rowDetails[mr];
        lines.push(
          '    ' + rd.sheet + ' row=' + rd.row +
          ' statusColumn=' + rd.statusColumn +
          ' rawStatus=' + (rd.rawStatus || '(empty)') +
          ' normalizedStatus=' + rd.normalizedStatus
        );
      }
    }
  } else {
    lines.push('- active missing measurements detail: (none)');
  }
  if (plan.blockedUnknownList && plan.blockedUnknownList.length > 0) {
    lines.push('- blocked unknown status groups detail:');
    for (var b = 0; b < plan.blockedUnknownList.length; b++) {
      var blocked = plan.blockedUnknownList[b];
      lines.push('  orderId=' + blocked.orderId + ' name=' + blocked.name + ' address=' + blocked.address);
      for (var br = 0; br < blocked.rowDetails.length; br++) {
        var bd = blocked.rowDetails[br];
        if (bd.normalizedStatus !== 'unknown') continue;
        lines.push(
          '    ' + bd.sheet + ' row=' + bd.row +
          ' statusColumn=' + bd.statusColumn +
          ' rawStatus=' + bd.rawStatus +
          ' normalizedStatus=' + bd.normalizedStatus
        );
      }
    }
  } else {
    lines.push('- blocked unknown status groups detail: (none)');
  }
  if (plan.staleArchiveCandidates && plan.staleArchiveCandidates.length > 0) {
    lines.push('- stale archive candidates (not active in table, workStatus != waiting): ' + plan.staleArchiveCandidates.length);
    for (var st = 0; st < plan.staleArchiveCandidates.length; st++) {
      var stale = plan.staleArchiveCandidates[st];
      lines.push(
        '  docId=' + stale.docId +
        ' workStatus=' + stale.workStatus +
        ' name=' + stale.name +
        ' phone=' + stale.phone +
        ' address=' + stale.address
      );
    }
    if (!FORCE_DELETE_COMPLETED_MEASUREMENTS) {
      lines.push('- NOTE: stale archive candidates are NOT deleted automatically (FORCE_DELETE_COMPLETED_MEASUREMENTS=false)');
    }
  } else {
    lines.push('- stale archive candidates: (none)');
  }
  if (dryRun) {
    lines.push('- total writes completed: 0 (dry run, no Firestore writes)');
    if (stats.skippedNoOrderId > 0) {
      lines.push('- NOTE: real sync would ABORT (skipped rows without orderId > 0)');
    }
    if (stats.blockedUnknownStatusGroups > 0) {
      lines.push('- NOTE: real sync would ABORT (blocked_unknown_status groups > 0)');
    }
    if (stats.readyOrdersDeletedDangerous > 0 && !FORCE_DELETE_READY_ORDERS) {
      lines.push('- NOTE: real sync would ABORT (dangerous ready_orders deletes > 0, FORCE_DELETE_READY_ORDERS=false)');
    }
    if (stats.measurementsDeletedDangerous > 0 && !FORCE_DELETE_COMPLETED_MEASUREMENTS) {
      lines.push('- NOTE: real sync would ABORT (dangerous measurements deletes > 0, FORCE_DELETE_COMPLETED_MEASUREMENTS=false)');
    }
    if (stats.activeMissingMeasurements > 0 && !IMPORT_MISSING_ACTIVE_MEASUREMENTS) {
      lines.push('- NOTE: active missing measurements will NOT be imported (IMPORT_MISSING_ACTIVE_MEASUREMENTS=false)');
    }
  } else {
    lines.push('- total writes completed: ' + totalCompleted);
  }
  return lines.join('\n');
}

function getOrderSheetSpecs_() {
  // statusCol — 0-based индекс; statusColLetter — буква колонки статуса; ORDER_ID_COL=22 (W) общая для всех листов
  return [
    { sheetName: SHEET_RAMOCHNIE, nameCol: 3, phoneCol: 4, addrCol: 2, totalCol: 14, statusCol: STATUS_COL_RAMOCHNIE, statusColLetter: 'P', itemLabel: 'Рамочные сетки' },
    { sheetName: SHEET_PLISSE, nameCol: 5, phoneCol: 4, addrCol: 2, totalCol: 18, statusCol: STATUS_COL_PLISSE, statusColLetter: 'T', itemLabel: 'Плиссе' },
    { sheetName: SHEET_SHTORI, nameCol: 3, phoneCol: 4, addrCol: 2, totalCol: 15, statusCol: STATUS_COL_SHTORI, statusColLetter: 'Q', itemLabel: 'Шторы' }
  ];
}

function getOrderSheetSpecByName_(sheetName) {
  var specs = getOrderSheetSpecs_();
  for (var i = 0; i < specs.length; i++) {
    if (specs[i].sheetName === sheetName) return specs[i];
  }
  return null;
}

function normalizeSheetOrderStatus_(raw) {
  var s = safeString_(raw).replace(/ё/gi, 'е').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!s) return 'empty';
  if (s === 'в работе') return 'in_work';
  if (s === 'готов к монтажу') return 'ready_for_install';
  if (s === 'готов' || s === 'сдан') return 'completed';
  return 'unknown';
}

function getActiveOrderRows_(rows) {
  var active = [];
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].statusBucket !== 'empty') active.push(rows[i]);
  }
  return active;
}

function countOrderStatusBuckets_(rows) {
  var counts = { empty: 0, unknown: 0, in_work: 0, ready_for_install: 0, completed: 0 };
  for (var i = 0; i < rows.length; i++) {
    var bucket = rows[i].statusBucket;
    if (counts[bucket] !== undefined) counts[bucket]++;
    else counts.unknown++;
  }
  return counts;
}

function calculateOrderAggregateStatus_(rows) {
  if (!rows || !rows.length) return 'unknown';
  var allEmpty = true;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].statusBucket !== 'empty') {
      allEmpty = false;
      break;
    }
  }
  if (allEmpty) return 'historical_ignored';

  var activeRows = getActiveOrderRows_(rows);
  for (var j = 0; j < activeRows.length; j++) {
    if (activeRows[j].statusBucket === 'unknown') return 'blocked_unknown_status';
  }

  var counts = countOrderStatusBuckets_(activeRows);
  var activeTotal = activeRows.length;
  if (counts.in_work > 0) return 'in_production';
  if (counts.completed === activeTotal) return 'completed';
  if (counts.ready_for_install === activeTotal) return 'ready';
  return 'in_production';
}

function isPickupAddress_(address) {
  return safeString_(address).replace(/ё/gi, 'е').toLowerCase().replace(/\s+/g, ' ').trim() === 'самовывоз';
}

function calculateOrderTotalFromGroup_(group) {
  var activeRows = getActiveOrderRows_(group.rows);
  var nonZeroTotals = [];
  for (var i = 0; i < activeRows.length; i++) {
    var t = parseAmountToInt_(activeRows[i].total);
    if (t > 0) nonZeroTotals.push(t);
  }
  if (!nonZeroTotals.length) {
    return parseAmountToInt_(group.total) || 0;
  }
  if (nonZeroTotals.length === 1) {
    return nonZeroTotals[0];
  }
  var first = nonZeroTotals[0];
  var allSame = true;
  for (var j = 1; j < nonZeroTotals.length; j++) {
    if (nonZeroTotals[j] !== first) {
      allSame = false;
      break;
    }
  }
  if (allSame) return first;
  var sum = 0;
  for (var k = 0; k < nonZeroTotals.length; k++) {
    sum += nonZeroTotals[k];
  }
  return sum;
}

function buildGroupItemsFromActiveRows_(group, calculatedTotal) {
  var activeRows = getActiveOrderRows_(group.rows);
  if (!activeRows.length) return [];
  var nonZeroTotals = [];
  for (var i = 0; i < activeRows.length; i++) {
    var t = parseAmountToInt_(activeRows[i].total);
    if (t > 0) nonZeroTotals.push(t);
  }
  var allSame = nonZeroTotals.length > 1;
  if (allSame) {
    for (var a = 1; a < nonZeroTotals.length; a++) {
      if (nonZeroTotals[a] !== nonZeroTotals[0]) {
        allSame = false;
        break;
      }
    }
  }
  var itemsSummary = buildGroupItemsSummaryFromActiveRows_(group);
  if (allSame || nonZeroTotals.length <= 1) {
    return [{
      type: activeRows[0].itemLabel || 'Позиция',
      quantity: 1,
      price: calculatedTotal,
      details: itemsSummary || (activeRows[0].sheet + ' строка ' + activeRows[0].row)
    }];
  }
  var items = [];
  for (var r = 0; r < activeRows.length; r++) {
    var row = activeRows[r];
    var rowPrice = parseAmountToInt_(row.total);
    if (rowPrice <= 0) continue;
    items.push({
      type: row.itemLabel || 'Позиция',
      quantity: 1,
      price: rowPrice,
      details: row.sheet + ' строка ' + row.row
    });
  }
  if (!items.length && calculatedTotal > 0) {
    items.push({
      type: 'Заказ',
      quantity: 1,
      price: calculatedTotal,
      details: itemsSummary
    });
  }
  return items;
}

function firestoreStringField_(val) {
  return { stringValue: safeString_(val) };
}

function firestoreIntField_(val) {
  return { integerValue: String(parseAmountToInt_(val) || 0) };
}

function firestoreMapField_(obj) {
  var fields = {};
  for (var key in obj) {
    if (!obj.hasOwnProperty(key)) continue;
    var val = obj[key];
    if (typeof val === 'number') {
      fields[key] = firestoreIntField_(val);
    } else {
      fields[key] = firestoreStringField_(val);
    }
  }
  return { mapValue: { fields: fields } };
}

function firestoreArrayOfMapsField_(arr) {
  var values = [];
  for (var i = 0; i < (arr || []).length; i++) {
    values.push(firestoreMapField_(arr[i]));
  }
  return { arrayValue: { values: values } };
}

function readGroupedOrdersFromSheets_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var groups = {};
  var skippedNoOrderId = 0;
  var skippedRows = [];
  var specs = getOrderSheetSpecs_();

  for (var s = 0; s < specs.length; s++) {
    var spec = specs[s];
    var sh = ss.getSheetByName(spec.sheetName);
    if (!sh) continue;
    var lastRow = sh.getLastRow();
    if (lastRow < 2) continue;
    var data = sh.getRange(2, 1, lastRow - 1, ORDERS_COLS_AW).getValues();
    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      var rawStatus = safeString_(row[spec.statusCol]);
      var orderId = safeString_(row[ORDER_ID_COL]);
      var phoneKey = normalizePhone_(row[spec.phoneCol]);
      var statusBucket = normalizeSheetOrderStatus_(rawStatus);
      if (!orderId) {
        if (statusBucket === 'ready_for_install' || statusBucket === 'in_work' || statusBucket === 'unknown') {
          skippedNoOrderId++;
          skippedRows.push({
            sheet: spec.sheetName,
            row: i + 2,
            phone: phoneKey,
            name: safeString_(row[spec.nameCol]),
            address: safeString_(row[spec.addrCol]),
            total: parseAmountToInt_(row[spec.totalCol]),
            legacyFallbackId: phoneKey || ('ID_' + (i + 1)),
            reason: 'empty orderId'
          });
        }
        continue;
      }
      if (!groups[orderId]) {
        groups[orderId] = {
          orderId: orderId,
          name: safeString_(row[spec.nameCol]),
          phone: phoneKey,
          address: safeString_(row[spec.addrCol]),
          total: 0,
          itemCounts: {},
          rows: []
        };
      }
      var group = groups[orderId];
      if (!group.name) group.name = safeString_(row[spec.nameCol]);
      if (!group.phone) group.phone = phoneKey;
      if (!group.address) group.address = safeString_(row[spec.addrCol]);
      var rowTotal = parseAmountToInt_(row[spec.totalCol]);
      if (statusBucket === 'ready_for_install') {
        var count = group.itemCounts[spec.itemLabel] || 0;
        group.itemCounts[spec.itemLabel] = count + 1;
      }
      group.rows.push({
        sheet: spec.sheetName,
        row: i + 2,
        statusColumn: spec.statusColLetter,
        rawStatus: rawStatus,
        normalizedStatus: statusBucket,
        statusBucket: statusBucket,
        orderId: orderId,
        itemLabel: spec.itemLabel,
        total: rowTotal
      });
    }
  }
  for (var groupOrderId in groups) {
    if (!groups.hasOwnProperty(groupOrderId)) continue;
    groups[groupOrderId].total = calculateOrderTotalFromGroup_(groups[groupOrderId]);
    groups[groupOrderId].isPickup = isPickupAddress_(groups[groupOrderId].address);
  }
  return { groups: groups, skippedNoOrderId: skippedNoOrderId, skippedRows: skippedRows };
}

function buildReadyOrderDataFromGroup_(group) {
  var itemsArr = [];
  for (var label in group.itemCounts) {
    if (!group.itemCounts.hasOwnProperty(label)) continue;
    itemsArr.push(label + ' - ' + group.itemCounts[label] + ' шт.');
  }
  itemsArr.sort();
  return {
    orderId: group.orderId,
    name: group.name,
    phone: group.phone,
    address: group.address,
    total: group.total,
    items_summary: itemsArr.join(', ')
  };
}

/** ===== 2b. REBUILD АРХИВА ИЗ ТАБЛИЦЫ (полная пересборка) ===== */
function safeAlert_(message) {
  Logger.log(message);
  try {
    SpreadsheetApp.getUi().alert(message);
  } catch (e) {
    Logger.log('UI alert skipped: ' + e.message);
  }
}

function rebuildArchiveFromActiveSheetOrdersDryRun() {
  runRebuildArchiveFromActiveSheetOrders_(true);
}

function rebuildArchiveFromActiveSheetOrders() {
  runRebuildArchiveFromActiveSheetOrders_(false);
}

function runRebuildArchiveFromActiveSheetOrders_(dryRun) {
  try {
    var plan = planRebuildArchiveFromSheets_();
    var totalCompleted = 0;
    var report = buildRebuildArchiveReport_(plan, dryRun, totalCompleted);
    Logger.log(report);
    validateRebuildArchivePlan_(plan, dryRun);
    if (!dryRun && plan.writes.length > 0) {
      totalCompleted = batchWriteChecked(plan.writes);
      disableRebuildArchiveFlag_();
      report = buildRebuildArchiveReport_(plan, dryRun, totalCompleted);
      Logger.log(report);
      Logger.log('Rebuild complete. FORCE_REBUILD_ARCHIVE_FROM_SHEETS reset (const=false, property cleared).');
    }
    safeAlert_((dryRun ? 'Rebuild архива — dry run' : 'Rebuild архива') + '\n\n' + report);
  } catch (e) {
    Logger.log('rebuildArchive error: ' + errorText_(e));
    safeAlert_('Ошибка rebuild архива\n\n' + errorText_(e));
  }
}

function isRebuildArchiveEnabled_() {
  if (FORCE_REBUILD_ARCHIVE_FROM_SHEETS === true) return true;
  return PropertiesService.getScriptProperties().getProperty(REBUILD_FLAG_PROP) === 'true';
}

function disableRebuildArchiveFlag_() {
  PropertiesService.getScriptProperties().deleteProperty(REBUILD_FLAG_PROP);
}

function validateRebuildArchivePlan_(plan, dryRun) {
  if (dryRun) return;
  if (!isRebuildArchiveEnabled_()) {
    throw new Error('ABORTED: FORCE_REBUILD_ARCHIVE_FROM_SHEETS !== true. Enable flag before real rebuild.');
  }
  if (plan.stats.unknownStatusGroups > 0) {
    throw new Error('ABORTED: unknown status groups > 0 (' + plan.stats.unknownStatusGroups + '). Fix sheet statuses first.');
  }
  if (plan.stats.activeRowsWithoutOrderId > 0) {
    throw new Error(
      'ABORTED: active rows without orderId > 0 (' + plan.stats.activeRowsWithoutOrderId +
      '). Fix column W before real rebuild.'
    );
  }
  if (plan.stats.desiredActiveArchive === 0) {
    throw new Error(
      'ABORTED: desired active archive is empty. Refusing to wipe measurements — check sheet read or active statuses.'
    );
  }
}

function formatGroupActiveRowsForReport_(group) {
  var activeRows = getActiveOrderRows_(group.rows);
  var lines = [];
  for (var i = 0; i < activeRows.length; i++) {
    var r = activeRows[i];
    lines.push(
      r.sheet + ' row=' + r.row +
      ' total=' + parseAmountToInt_(r.total) +
      ' statusColumn=' + r.statusColumn +
      ' rawStatus=' + (r.rawStatus || '(empty)') +
      ' normalizedStatus=' + r.normalizedStatus
    );
  }
  return lines;
}

function formatGroupUnknownRowsForReport_(group) {
  var lines = [];
  for (var i = 0; i < group.rows.length; i++) {
    var r = group.rows[i];
    if (r.statusBucket !== 'unknown') continue;
    lines.push(
      r.sheet + ' row=' + r.row +
      ' statusColumn=' + r.statusColumn +
      ' rawStatus=' + r.rawStatus +
      ' normalizedStatus=unknown'
    );
  }
  return lines;
}

function planRebuildArchiveFromSheets_() {
  var sheetResult = readGroupedOrdersFromSheets_();
  var groups = sheetResult.groups;
  var desiredArchive = {};
  var desiredReadyOrders = {};
  var stats = {
    desiredActiveArchive: 0,
    inProductionGroups: 0,
    readyGroups: 0,
    completedExcluded: 0,
    historicalEmptyIgnored: 0,
    unknownStatusGroups: 0,
    activeRowsWithoutOrderId: sheetResult.skippedNoOrderId,
    measurementsCreate: 0,
    measurementsUpdate: 0,
    measurementsUnchanged: 0,
    measurementsDelete: 0,
    readyOrdersCreate: 0,
    readyOrdersUpdate: 0,
    readyOrdersDelete: 0
  };
  var activeArchiveSummaries = [];
  var unknownGroupSummaries = [];
  var measurementsUpdateReasons = [];

  for (var orderId in groups) {
    if (!groups.hasOwnProperty(orderId)) continue;
    var group = groups[orderId];
    var aggregateStatus = calculateOrderAggregateStatus_(group.rows);
    if (aggregateStatus === 'blocked_unknown_status') {
      stats.unknownStatusGroups++;
      unknownGroupSummaries.push({
        orderId: orderId,
        name: group.name,
        address: group.address,
        sheetRows: formatGroupUnknownRowsForReport_(group)
      });
      continue;
    }
    if (aggregateStatus === 'historical_ignored') {
      stats.historicalEmptyIgnored++;
      continue;
    }
    if (aggregateStatus === 'completed') {
      stats.completedExcluded++;
      continue;
    }
    if (aggregateStatus === 'in_production') {
      stats.inProductionGroups++;
      desiredArchive[orderId] = {
        group: group,
        workStatus: 'in_production',
        workStatusLabel: 'В производстве',
        rebuild_source_hash: buildRebuildMeasurementSourceHash_(group, 'in_production', 'В производстве')
      };
      activeArchiveSummaries.push({
        orderId: orderId,
        workStatus: 'in_production',
        name: group.name,
        address: group.address,
        phone: group.phone,
        total: calculateOrderTotalFromGroup_(group),
        sheetRows: formatGroupActiveRowsForReport_(group)
      });
    } else if (aggregateStatus === 'ready') {
      stats.readyGroups++;
      desiredArchive[orderId] = {
        group: group,
        workStatus: 'ready',
        workStatusLabel: 'Готов',
        rebuild_source_hash: buildRebuildMeasurementSourceHash_(group, 'ready', 'Готов')
      };
      var readyData = buildReadyOrderDataFromGroup_(group);
      desiredReadyOrders[orderId] = {
        data: readyData,
        source_hash: calculateSourceHash(readyData)
      };
      activeArchiveSummaries.push({
        orderId: orderId,
        workStatus: 'ready',
        name: group.name,
        address: group.address,
        phone: group.phone,
        total: calculateOrderTotalFromGroup_(group),
        sheetRows: formatGroupActiveRowsForReport_(group)
      });
    }
  }
  stats.desiredActiveArchive = stats.inProductionGroups + stats.readyGroups;

  var existingMeasurements = getCollectionDocs(COLLECTION_ARCHIVE);
  var existingMeasByDocId = {};
  for (var m = 0; m < existingMeasurements.length; m++) {
    existingMeasByDocId[existingMeasurements[m].docId] = existingMeasurements[m];
  }

  var existingReadyOrders = getCollectionDocs(COLLECTION_READY);
  var existingReadyByDocId = {};
  for (var r = 0; r < existingReadyOrders.length; r++) {
    existingReadyByDocId[existingReadyOrders[r].docId] = existingReadyOrders[r];
  }

  var writes = [];
  var measurementsDeleteDocIds = [];
  var readyOrdersDeleteDocIds = [];

  for (var existingDocId in existingMeasByDocId) {
    if (!existingMeasByDocId.hasOwnProperty(existingDocId)) continue;
    if (!desiredArchive[existingDocId]) {
      measurementsDeleteDocIds.push(existingDocId);
      writes.push({ delete: existingMeasByDocId[existingDocId].docName });
      stats.measurementsDelete++;
    }
  }

  for (var archiveOrderId in desiredArchive) {
    if (!desiredArchive.hasOwnProperty(archiveOrderId)) continue;
    var archiveEntry = desiredArchive[archiveOrderId];
    var existingMeas = existingMeasByDocId[archiveOrderId];
    var measCmp = compareRebuildMeasurementPlan_(existingMeas, archiveEntry.rebuild_source_hash);
    if (measCmp.action === 'create') {
      stats.measurementsCreate++;
      writes.push(buildRebuildMeasurementWrite_(archiveEntry));
    } else if (measCmp.action === 'update') {
      stats.measurementsUpdate++;
      measurementsUpdateReasons.push({ orderId: archiveOrderId, reason: measCmp.reason });
      writes.push(buildRebuildMeasurementWrite_(archiveEntry));
    } else {
      stats.measurementsUnchanged++;
    }
  }

  for (var readyDocId in desiredReadyOrders) {
    if (!desiredReadyOrders.hasOwnProperty(readyDocId)) continue;
    var desiredReady = desiredReadyOrders[readyDocId];
    var existingReady = existingReadyByDocId[readyDocId];
    if (!existingReady) {
      writes.push(buildReadyOrderWrite_(readyDocId, desiredReady.data, desiredReady.source_hash));
      stats.readyOrdersCreate++;
    } else if (existingReady.source_hash !== desiredReady.source_hash) {
      writes.push(buildReadyOrderWrite_(readyDocId, desiredReady.data, desiredReady.source_hash));
      stats.readyOrdersUpdate++;
    }
  }

  for (var existingReadyDocId in existingReadyByDocId) {
    if (!existingReadyByDocId.hasOwnProperty(existingReadyDocId)) continue;
    if (!desiredReadyOrders[existingReadyDocId]) {
      readyOrdersDeleteDocIds.push(existingReadyDocId);
      writes.push({ delete: existingReadyByDocId[existingReadyDocId].docName });
      stats.readyOrdersDelete++;
    }
  }

  measurementsDeleteDocIds.sort();
  readyOrdersDeleteDocIds.sort();
  activeArchiveSummaries.sort(function(a, b) {
    return String(a.orderId).localeCompare(String(b.orderId));
  });

  return {
    stats: stats,
    writes: writes,
    desiredArchive: desiredArchive,
    activeArchiveSummaries: activeArchiveSummaries,
    unknownGroupSummaries: unknownGroupSummaries,
    measurementsDeleteDocIds: measurementsDeleteDocIds,
    readyOrdersDeleteDocIds: readyOrdersDeleteDocIds,
    skippedRows: sheetResult.skippedRows,
    measurementsUpdateReasons: measurementsUpdateReasons
  };
}

function buildRebuildMeasurementSourceHash_(group, workStatus, workStatusLabel) {
  var calculatedTotal = calculateOrderTotalFromGroup_(group);
  var sourceRows = getActiveOrderRows_(group.rows).map(function(r) {
    return r.sheet + ':' + r.row;
  });
  sourceRows.sort();
  var hashPayload = {
    address: safeString_(group.address),
    amount: String(calculatedTotal),
    amount_rub: String(calculatedTotal),
    archiveId: safeString_(group.orderId),
    deliveryType: group.isPickup ? 'pickup' : 'delivery',
    isPickup: group.isPickup ? 'true' : 'false',
    items_summary: buildGroupItemsSummaryFromActiveRows_(group),
    name: safeString_(group.name),
    orderId: safeString_(group.orderId),
    orderTotal: String(calculatedTotal),
    phone: normalizePhone_(group.phone),
    sourceSheetsRows: sourceRows.join(','),
    total: String(calculatedTotal),
    workStatus: safeString_(workStatus),
    workStatusLabel: safeString_(workStatusLabel)
  };
  return sha256Hex_(canonicalJson_(hashPayload));
}

function getExistingMeasurementContentHash_(existingDoc) {
  if (!existingDoc) return '';
  var rebuildHash = existingDoc.rebuild_source_hash || getFirestoreStringField_(existingDoc.fields, 'rebuild_source_hash');
  if (rebuildHash) return rebuildHash;
  return existingDoc.source_hash || getFirestoreStringField_(existingDoc.fields, 'source_hash') || '';
}

function compareRebuildMeasurementPlan_(existingDoc, desiredHash) {
  if (!existingDoc) {
    return { action: 'create', reason: 'missing document' };
  }
  var existingHash = getExistingMeasurementContentHash_(existingDoc);
  if (!existingHash) {
    return { action: 'update', reason: 'missing hash' };
  }
  if (existingHash === desiredHash) {
    return { action: 'unchanged', reason: '' };
  }
  return { action: 'update', reason: 'hash changed' };
}

function buildRebuildMeasurementWrite_(entry) {
  var rebuildHash = entry.rebuild_source_hash;
  var write = buildImportedMeasurementWrite_(entry.group, entry.workStatus, entry.workStatusLabel);
  write.update.fields.rebuild_source_hash = { stringValue: rebuildHash };
  write.update.fields.source_hash = { stringValue: rebuildHash };
  var nowIso = new Date().toISOString();
  write.update.fields.rebuiltFromSheets = { booleanValue: true };
  write.update.fields.rebuiltAt = { stringValue: nowIso };
  return write;
}

var REBUILD_REPORT_MAX_DELETE_DOCIDS = 20;

function appendCompactDeleteDocIdsLines_(lines, collectionLabel, docIds) {
  if (!docIds || docIds.length === 0) {
    lines.push('- ' + collectionLabel + ' delete docIds: (none)');
    return;
  }
  if (docIds.length <= REBUILD_REPORT_MAX_DELETE_DOCIDS) {
    lines.push('- ' + collectionLabel + ' delete docIds (' + docIds.length + '): ' + docIds.join(', '));
    return;
  }
  lines.push('- ' + collectionLabel + ' to delete: ' + docIds.length);
  lines.push(
    '- first ' + REBUILD_REPORT_MAX_DELETE_DOCIDS + ' ' + collectionLabel + ' delete docIds: ' +
    docIds.slice(0, REBUILD_REPORT_MAX_DELETE_DOCIDS).join(', ')
  );
  lines.push('- full ' + collectionLabel + ' delete list omitted');
}

function buildRebuildArchiveReport_(plan, dryRun, totalCompleted) {
  var stats = plan.stats;
  var lines = [
    dryRun ? 'rebuildArchive DRY RUN report:' : 'rebuildArchive report:',
    '- desired active archive orders: ' + stats.desiredActiveArchive,
    '- in_production orders: ' + stats.inProductionGroups,
    '- ready orders: ' + stats.readyGroups,
    '- completed excluded: ' + stats.completedExcluded,
    '- historical empty ignored: ' + stats.historicalEmptyIgnored,
    '- unknown status groups: ' + stats.unknownStatusGroups,
    '- active rows without orderId: ' + stats.activeRowsWithoutOrderId,
    '- measurements to create: ' + stats.measurementsCreate,
    '- measurements to update: ' + stats.measurementsUpdate,
    '- measurements unchanged: ' + stats.measurementsUnchanged,
    '- measurements to delete: ' + stats.measurementsDelete,
    '- ready_orders to create: ' + stats.readyOrdersCreate,
    '- ready_orders to update: ' + stats.readyOrdersUpdate,
    '- ready_orders to delete: ' + stats.readyOrdersDelete,
    '- total writes planned: ' + plan.writes.length
  ];
  if (plan.activeArchiveSummaries && plan.activeArchiveSummaries.length > 0) {
    lines.push('- desired active archive list:');
    for (var i = 0; i < plan.activeArchiveSummaries.length; i++) {
      var a = plan.activeArchiveSummaries[i];
      lines.push(
        '  orderId=' + a.orderId +
        ' workStatus=' + a.workStatus +
        ' total=' + (a.total || 0) +
        ' name=' + a.name +
        ' phone=' + a.phone +
        ' address=' + a.address
      );
      for (var sr = 0; sr < a.sheetRows.length; sr++) {
        lines.push('    ' + a.sheetRows[sr]);
      }
    }
  } else {
    lines.push('- desired active archive list: (none)');
  }
  appendCompactDeleteDocIdsLines_(lines, 'measurements', plan.measurementsDeleteDocIds);
  appendCompactDeleteDocIdsLines_(lines, 'ready_orders', plan.readyOrdersDeleteDocIds);
  if (plan.measurementsUpdateReasons && plan.measurementsUpdateReasons.length > 0) {
    lines.push('- measurements update reasons:');
    for (var ur = 0; ur < plan.measurementsUpdateReasons.length; ur++) {
      var mr = plan.measurementsUpdateReasons[ur];
      lines.push('  orderId=' + mr.orderId + ' reason=' + mr.reason);
    }
  } else {
    lines.push('- measurements update reasons: (none)');
  }
  if (plan.unknownGroupSummaries.length > 0) {
    lines.push('- unknown status groups detail:');
    for (var u = 0; u < plan.unknownGroupSummaries.length; u++) {
      var ug = plan.unknownGroupSummaries[u];
      lines.push('  orderId=' + ug.orderId + ' name=' + ug.name + ' address=' + ug.address);
      for (var ur = 0; ur < ug.sheetRows.length; ur++) {
        lines.push('    ' + ug.sheetRows[ur]);
      }
    }
  }
  if (plan.skippedRows && plan.skippedRows.length > 0) {
    lines.push('- active rows without orderId detail:');
    for (var sk = 0; sk < plan.skippedRows.length; sk++) {
      lines.push(formatSkippedReadyOrderRow_(plan.skippedRows[sk], sk));
    }
  }
  if (dryRun) {
    lines.push('- total writes completed: 0 (dry run, no Firestore writes)');
    if (!isRebuildArchiveEnabled_()) {
      lines.push('- NOTE: real rebuild would ABORT (FORCE_REBUILD_ARCHIVE_FROM_SHEETS !== true)');
    }
    if (stats.unknownStatusGroups > 0) {
      lines.push('- NOTE: real rebuild would ABORT (unknown status groups > 0)');
    }
    if (stats.activeRowsWithoutOrderId > 0) {
      lines.push('- NOTE: real rebuild would ABORT (active rows without orderId > 0)');
    }
    if (stats.desiredActiveArchive === 0) {
      lines.push('- NOTE: real rebuild would ABORT (desired active archive is empty)');
    }
  } else {
    lines.push('- total writes completed: ' + totalCompleted);
    lines.push('- FORCE_REBUILD_ARCHIVE_FROM_SHEETS: reset after success');
  }
  return lines.join('\n');
}

function stableReadyOrderDocId(orderId) {
  var id = safeString_(orderId);
  return id || '';
}

function calculateSourceHash(obj) {
  var hashPayload = {
    address: safeString_(obj.address),
    items_summary: safeString_(obj.items_summary),
    name: safeString_(obj.name),
    orderId: safeString_(obj.orderId),
    phone: normalizePhone_(obj.phone),
    total: String(parseAmountToInt_(obj.total))
  };
  return sha256Hex_(canonicalJson_(hashPayload));
}

function canonicalJson_(obj) {
  var keys = Object.keys(obj).sort();
  var sorted = {};
  for (var i = 0; i < keys.length; i++) {
    sorted[keys[i]] = obj[keys[i]];
  }
  return JSON.stringify(sorted);
}

function getCollectionDocs(collectionName) {
  var result = [];
  var pageToken = '';
  do {
    var url = firestoreBaseUrl_() + '/' + encodeURIComponent(collectionName) + '?pageSize=1000';
    if (pageToken) url += '&pageToken=' + encodeURIComponent(pageToken);
    var res = UrlFetchApp.fetch(url, { method: 'get', headers: authHeaders_(), muteHttpExceptions: true });
    var code = res.getResponseCode();
    if (code === 404) return [];
    if (code < 200 || code >= 300) {
      throw new Error('Firestore list HTTP ' + code + ': ' + (res.getContentText() || '').substring(0, 800));
    }
    var text = res.getContentText();
    if (!text) break;
    var json = JSON.parse(text);
    if (json.error) {
      throw new Error('Firestore list error: ' + JSON.stringify(json.error));
    }
    var docs = json.documents || [];
    for (var i = 0; i < docs.length; i++) {
      var d = docs[i];
      var docName = d.name;
      var docId = docName.substring(docName.lastIndexOf('/') + 1);
      var fields = d.fields || {};
      result.push({
        docId: docId,
        docName: docName,
        fields: fields,
        source_hash: getFirestoreStringField_(fields, 'source_hash'),
        rebuild_source_hash: getFirestoreStringField_(fields, 'rebuild_source_hash')
      });
    }
    pageToken = json.nextPageToken || '';
  } while (pageToken);
  return result;
}

function getDocument(collectionName, docId) {
  var url = firestoreBaseUrl_() + '/' + encodeURIComponent(collectionName) + '/' + encodeURIComponent(docId);
  var res = UrlFetchApp.fetch(url, { method: 'get', headers: authHeaders_(), muteHttpExceptions: true });
  var code = res.getResponseCode();
  if (code === 404) return null;
  var text = res.getContentText() || '';
  if (code < 200 || code >= 300) {
    throw new Error('Firestore getDocument HTTP ' + code + ': ' + text.substring(0, 800));
  }
  var json = JSON.parse(text);
  if (json.error) {
    throw new Error('Firestore getDocument error: ' + JSON.stringify(json.error));
  }
  return {
    docId: docId,
    docName: json.name,
    fields: json.fields || {}
  };
}

function buildReadyOrderWrite_(docId, data, sourceHash) {
  var docName = 'projects/' + FIREBASE_PROJECT_ID + '/databases/' + FIRESTORE_DB + '/documents/' + COLLECTION_READY + '/' + docId;
  return {
    update: {
      name: docName,
      fields: {
        orderId: { stringValue: data.orderId },
        name: { stringValue: data.name || '' },
        phone: { stringValue: data.phone || '' },
        address: { stringValue: data.address || '' },
        total: { integerValue: String(data.total || 0) },
        items_summary: { stringValue: data.items_summary || '' },
        source_hash: { stringValue: sourceHash },
        updated_at: { stringValue: new Date().toISOString() }
      }
    }
  };
}

function buildMeasurementWorkStatusWrite_(orderId, workStatus, workStatusLabel, includeReadyMeta) {
  var archiveDocName = 'projects/' + FIREBASE_PROJECT_ID + '/databases/' + FIRESTORE_DB + '/documents/' + COLLECTION_ARCHIVE + '/' + orderId;
  var fields = {
    workStatus: { stringValue: workStatus },
    workStatusLabel: { stringValue: workStatusLabel },
    workStatusUpdatedAt: { stringValue: new Date().toISOString() }
  };
  var fieldPaths = ['workStatus', 'workStatusLabel', 'workStatusUpdatedAt'];
  if (includeReadyMeta) {
    fields.ready_order_id = { stringValue: orderId };
    fields.ready_synced_at = { stringValue: new Date().toISOString() };
    fieldPaths.push('ready_order_id');
    fieldPaths.push('ready_synced_at');
  }
  return {
    update: {
      name: archiveDocName,
      fields: fields
    },
    updateMask: { fieldPaths: fieldPaths }
  };
}

function buildGroupItemsSummaryFromActiveRows_(group) {
  var counts = {};
  var activeRows = getActiveOrderRows_(group.rows);
  for (var i = 0; i < activeRows.length; i++) {
    var label = activeRows[i].itemLabel || 'Позиция';
    counts[label] = (counts[label] || 0) + 1;
  }
  var itemsArr = [];
  for (var key in counts) {
    if (!counts.hasOwnProperty(key)) continue;
    itemsArr.push(key + ' - ' + counts[key] + ' шт.');
  }
  itemsArr.sort();
  return itemsArr.join(', ');
}

function buildImportedMeasurementWrite_(group, workStatus, workStatusLabel) {
  var orderId = group.orderId;
  var archiveDocName = 'projects/' + FIREBASE_PROJECT_ID + '/databases/' + FIRESTORE_DB + '/documents/' + COLLECTION_ARCHIVE + '/' + orderId;
  var sourceRows = getActiveOrderRows_(group.rows).map(function(r) {
    return r.sheet + ':' + r.row;
  });
  var nowIso = new Date().toISOString();
  var itemsSummary = buildGroupItemsSummaryFromActiveRows_(group);
  var calculatedTotal = calculateOrderTotalFromGroup_(group);
  var items = buildGroupItemsFromActiveRows_(group, calculatedTotal);
  var isPickup = group.isPickup === true || isPickupAddress_(group.address);
  var deliveryType = isPickup ? 'pickup' : 'delivery';
  return {
    update: {
      name: archiveDocName,
      fields: {
        archiveId: { stringValue: orderId },
        workStatus: { stringValue: workStatus },
        workStatusLabel: { stringValue: workStatusLabel },
        workStatusUpdatedAt: { stringValue: nowIso },
        importedFromSheet: { booleanValue: true },
        importedAt: { stringValue: nowIso },
        sourceSheetsRows: { stringValue: sourceRows.join(', ') },
        name: { stringValue: group.name || '' },
        phone: { stringValue: group.phone || '' },
        address: { stringValue: group.address || '' },
        isPickup: { booleanValue: isPickup },
        deliveryType: { stringValue: deliveryType },
        total: firestoreIntField_(calculatedTotal),
        amount: firestoreIntField_(calculatedTotal),
        amount_rub: firestoreIntField_(calculatedTotal),
        orderTotal: firestoreIntField_(calculatedTotal),
        items_summary: { stringValue: itemsSummary },
        items: firestoreArrayOfMapsField_(items),
        customer: {
          mapValue: {
            fields: {
              name: { stringValue: group.name || '' },
              phone: { stringValue: group.phone || '' },
              address: { stringValue: group.address || '' }
            }
          }
        }
      }
    }
  };
}

function batchWriteChecked(writes) {
  if (!writes || !writes.length) return 0;
  var url = firestoreBaseUrl_() + ':batchWrite';
  var chunkSize = 450;
  var totalCompleted = 0;
  for (var i = 0; i < writes.length; i += chunkSize) {
    var chunk = writes.slice(i, i + chunkSize);
    var chunkIndex = Math.floor(i / chunkSize) + 1;
    Logger.log('batchWriteChecked: chunk ' + chunkIndex + ', operations ' + chunk.length);
    var res = UrlFetchApp.fetch(url, {
      method: 'post',
      headers: authHeaders_(),
      payload: JSON.stringify({ writes: chunk }),
      muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    var text = res.getContentText() || '';
    if (code < 200 || code >= 300) {
      Logger.log('batchWriteChecked HTTP error chunk ' + chunkIndex + ': ' + text.substring(0, 1200));
      throw new Error('Firestore batchWrite HTTP ' + code + ' (chunk ' + chunkIndex + '): ' + text.substring(0, 800));
    }
    var json;
    try {
      json = JSON.parse(text);
    } catch (parseErr) {
      Logger.log('batchWriteChecked JSON parse error chunk ' + chunkIndex + ': ' + text.substring(0, 1200));
      throw new Error('Firestore batchWrite invalid JSON (chunk ' + chunkIndex + '): ' + errorText_(parseErr));
    }
    if (json.error) {
      Logger.log('batchWriteChecked API error chunk ' + chunkIndex + ': ' + JSON.stringify(json.error));
      throw new Error('Firestore batchWrite error (chunk ' + chunkIndex + '): ' + JSON.stringify(json.error));
    }
    var statuses = json.status || [];
    if (statuses.length !== chunk.length) {
      Logger.log(
        'batchWriteChecked status mismatch chunk ' + chunkIndex +
        ': expected ' + chunk.length + ', got ' + statuses.length +
        ', body=' + text.substring(0, 1200)
      );
      throw new Error(
        'Firestore batchWrite: status count ' + statuses.length + ' !== writes ' + chunk.length + ' (chunk ' + chunkIndex + ')'
      );
    }
    for (var j = 0; j < statuses.length; j++) {
      var st = statuses[j];
      if (st && st.code !== undefined && st.code !== 0) {
        Logger.log('batchWriteChecked write failed chunk ' + chunkIndex + ' op ' + (j + 1) + ': ' + JSON.stringify(st));
        throw new Error('Firestore write failed (chunk ' + chunkIndex + ', op ' + (j + 1) + '): ' + JSON.stringify(st));
      }
    }
    totalCompleted += chunk.length;
  }
  return totalCompleted;
}

/** ===== 3. WEBHOOK: заказ из архива → Google Sheets ===== */
function findExistingWebhookOrderRows_(orderId) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var specs = getOrderSheetSpecs_();
  var existingRows = [];
  var targetOrderId = safeString_(orderId);
  if (!targetOrderId) return existingRows;

  for (var s = 0; s < specs.length; s++) {
    var spec = specs[s];
    var sh = ss.getSheetByName(spec.sheetName);
    if (!sh) continue;
    var lastRow = sh.getLastRow();
    if (lastRow < 2) continue;
    var data = sh.getRange(2, 1, lastRow, ORDERS_COLS_AW).getValues();
    for (var i = 0; i < data.length; i++) {
      if (safeString_(data[i][ORDER_ID_COL]) !== targetOrderId) continue;
      existingRows.push({
        sheet: spec.sheetName,
        row: i + 2,
        orderId: targetOrderId,
        status: 'already_exists'
      });
    }
  }
  return existingRows;
}

function mapWebhookResponseRows_(rows, statusOverride) {
  if (!rows || !rows.length) return [];
  var mapped = [];
  for (var i = 0; i < rows.length; i++) {
    mapped.push({
      sheet: rows[i].sheet,
      row: rows[i].row,
      orderId: rows[i].orderId,
      status: statusOverride || rows[i].status
    });
  }
  return mapped;
}

function doPost(e) {
  try {
    var body = (e && e.postData && e.postData.contents) ? e.postData.contents : '';
    if (!body) {
      throw new Error('Empty POST body');
    }
    var payload = JSON.parse(body);
    var result = handleIncomingOrderWebhook_(payload);
    var response;

    if (result && result.duplicate === true) {
      var existingRows = result.existingRows || [];
      var dupOrderId = safeString_(result.orderId);
      response = {
        ok: true,
        success: true,
        duplicate: true,
        orderId: dupOrderId,
        rowsCreated: 0,
        existingRows: existingRows,
        result: {
          duplicate: true,
          orderId: dupOrderId,
          rowsCreated: 0,
          existingRows: existingRows
        }
      };
      Logger.log('[WEBHOOK_RESPONSE] ' + JSON.stringify(response));
      return ContentService
        .createTextOutput(JSON.stringify(response))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var orderId = safeString_(result && result.orderId);
    var rowsCreated = Number(result && result.rowsCreated) || 0;
    var rows = mapWebhookResponseRows_(result && result.rows, 'created');

    if (rowsCreated > 0) {
      response = {
        ok: true,
        success: true,
        orderId: orderId,
        rowsCreated: rowsCreated,
        rows: rows,
        result: {
          orderId: orderId,
          rowsCreated: rowsCreated,
          rows: rows
        }
      };
      Logger.log('[WEBHOOK_RESPONSE] ' + JSON.stringify(response));
      return ContentService
        .createTextOutput(JSON.stringify(response))
        .setMimeType(ContentService.MimeType.JSON);
    }

    response = {
      ok: false,
      success: false,
      error: 'Rows were not created'
    };
    Logger.log('[WEBHOOK_RESPONSE] ' + JSON.stringify(response));
    return ContentService
      .createTextOutput(JSON.stringify(response))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    Logger.log('doPost error: ' + errorText_(err));
    var errResponse = {
      ok: false,
      success: false,
      error: errorText_(err)
    };
    Logger.log('[WEBHOOK_RESPONSE] ' + JSON.stringify(errResponse));
    return ContentService
      .createTextOutput(JSON.stringify(errResponse))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function handleIncomingOrderWebhook_(payload) {
  var orderId = safeString_(payload.orderID || payload.orderId || payload.archiveId);
  if (!orderId) {
    throw new Error('orderID (archiveId) is required in webhook payload');
  }
  var customer = payload.customer || {};
  var items = Array.isArray(payload.items) ? payload.items : [];
  if (!items.length) {
    throw new Error('items array is required in webhook payload');
  }

  var existingRows = findExistingWebhookOrderRows_(orderId);
  if (existingRows.length > 0) {
    return {
      duplicate: true,
      orderId: orderId,
      rowsCreated: 0,
      existingRows: existingRows
    };
  }

  var expandedItems = expandWebhookItemsByQuantity_(items);
  var rowsBySheet = {};
  var createdRows = [];

  for (var i = 0; i < expandedItems.length; i++) {
    var item = expandedItems[i];
    var sheetName = resolveOrderSheetForItemType_(item.type);
    var spec = getOrderSheetSpecByName_(sheetName);
    if (!spec) continue;
    if (!rowsBySheet[sheetName]) rowsBySheet[sheetName] = [];
    var lineTotal = parseAmountToInt_(item.lineTotal);
    rowsBySheet[sheetName].push(buildSheetOrderRow_(spec, customer, lineTotal, orderId));
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  for (var sheetKey in rowsBySheet) {
    if (!rowsBySheet.hasOwnProperty(sheetKey)) continue;
    var sheetRows = rowsBySheet[sheetKey];
    var sh = ss.getSheetByName(sheetKey);
    if (!sh) {
      throw new Error('Sheet not found: ' + sheetKey);
    }
    var startRow = sh.getLastRow() + 1;
    if (startRow < 2) startRow = 2;
    var values = [];
    for (var r = 0; r < sheetRows.length; r++) {
      values.push(sheetRows[r]);
    }
    sh.getRange(startRow, 1, startRow + values.length - 1, ORDERS_COLS_AW).setValues(values);
    for (var rr = 0; rr < values.length; rr++) {
      createdRows.push({ sheet: sheetKey, row: startRow + rr, orderId: orderId, status: SHEET_STATUS_IN_WORK });
    }
  }

  return {
    orderId: orderId,
    rowsCreated: createdRows.length,
    rows: createdRows
  };
}

function expandWebhookItemsByQuantity_(items) {
  var expanded = [];
  for (var i = 0; i < items.length; i++) {
    var item = items[i] || {};
    var qty = Math.max(1, parseAmountToInt_(item.quantity) || 1);
    var totalPrice = parseAmountToInt_(item.price);
    var lineTotal = qty > 0 ? Math.round(totalPrice / qty) : totalPrice;
    var isWindowService = isWindowServiceItemType_(item.type);
    var loops = isWindowService ? 1 : qty;
    for (var q = 0; q < loops; q++) {
      expanded.push({
        type: safeString_(item.type),
        lineTotal: isWindowService ? totalPrice : lineTotal
      });
    }
  }
  return expanded;
}

function isWindowServiceItemType_(type) {
  var t = safeString_(type);
  return t === 'Уплотнительная резинка' ||
    t === 'Гребенка' ||
    t === 'Детский замок' ||
    t === 'Регулировка';
}

function resolveOrderSheetForItemType_(type) {
  var t = safeString_(type);
  if (t.indexOf('ШТОРЫ') >= 0) return SHEET_SHTORI;
  if (t.indexOf('Плиссе') >= 0) return SHEET_PLISSE;
  return SHEET_RAMOCHNIE;
}

function buildSheetOrderRow_(spec, customer, lineTotal, orderId) {
  var row = [];
  for (var c = 0; c < ORDERS_COLS_AW; c++) row.push('');
  row[spec.addrCol] = safeString_(customer.address);
  row[spec.nameCol] = safeString_(customer.name);
  row[spec.phoneCol] = normalizePhone_(customer.phone);
  row[spec.totalCol] = lineTotal || 0;
  row[spec.statusCol] = SHEET_STATUS_IN_WORK;
  row[ORDER_ID_COL] = orderId;
  return row;
}

/** ===== 4. GET API: "Заказы в работе" ===== */
function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var ramochieData = buildWorkOrdersSheetPayload_(ss, SHEET_RAMOCHNIE, STATUS_COL_RAMOCHNIE);
    var plisseData = buildWorkOrdersSheetPayload_(ss, SHEET_PLISSE, STATUS_COL_PLISSE);
    var shtoriData = buildWorkOrdersSheetPayload_(ss, SHEET_SHTORI, STATUS_COL_SHTORI);
    var moscowTime = Utilities.formatDate(new Date(), 'Europe/Moscow', 'HH:mm:ss');
    var metaData = {
      timestamp: moscowTime,
      counts: {
        ramochie: ramochieData.rows.length,
        plisse: plisseData.rows.length,
        shtori: shtoriData.rows.length
      }
    };
    var payload = {
      meta: metaData,
      ramochie: ramochieData,
      plisse: plisseData,
      shtori: shtoriData
    };
    return ContentService
      .createTextOutput(JSON.stringify(payload))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({
        error: true,
        message: errorText_(err)
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function buildWorkOrdersSheetPayload_(ss, sheetName, statusColIndex) {
  var sh = ss.getSheetByName(sheetName);
  if (!sh) return { headers: [], rows: [] };
  var lastRow = sh.getLastRow();
  if (lastRow < 1) return { headers: [], rows: [] };
  var values = sh.getRange(1, 1, lastRow, ORDERS_COLS_AW).getValues();
  var headers = values[0] || [];
  var dataRows = values.slice(1);
  var rowsInWork = [];
  for (var i = 0; i < dataRows.length; i++) {
    var row = dataRows[i];
    var status = normalizeStatus_(row[statusColIndex]);
    if (status === 'В РАБОТЕ') {
      rowsInWork.push(row);
    }
  }
  return {
    headers: headers,
    rows: rowsInWork
  };
}

function normalizeStatus_(val) {
  var s = safeString_(val).replace(/ё/gi, 'е').toUpperCase();
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/** ===== 4. ОТПРАВКА SMS (API SMS.RU) ===== */
function sendStatusSms_(phone, orderId) {
  var API_KEY = '5E749765-0F36-4A3D-9D26-F9750E0DFBF4';
  var cleanPhone = String(phone || '').replace(/[^\d]/g, '');
  if (cleanPhone.indexOf('8') === 0 && cleanPhone.length === 11) {
    cleanPhone = '7' + cleanPhone.substring(1);
  }
  if (cleanPhone.length === 10 && cleanPhone.indexOf('9') === 0) {
    cleanPhone = '7' + cleanPhone;
  }
  if (!cleanPhone || cleanPhone.length < 11) {
    return { status: 'ERROR', message: 'Некорректный номер телефона' };
  }
  var text = 'Ваш заказ № ' + orderId + ' поступил в работу. Срок 3-5дн. Супермоскитка';
  var url = 'https://sms.ru/sms/send?api_id=' + encodeURIComponent(API_KEY) +
            '&to=' + encodeURIComponent(cleanPhone) +
            '&msg=' + encodeURIComponent(text) +
            '&json=1';
  try {
    var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    var body = response.getContentText();
    var parsed;
    try {
      parsed = JSON.parse(body);
    } catch (_) {
      parsed = { raw: body };
    }
    return {
      httpStatus: response.getResponseCode(),
      smsRu: parsed
    };
  } catch (e) {
    return { status: 'ERROR', message: errorText_(e) };
  }
}

/** ===== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===== */
function readMeasurementsSheet_() {
  return readMeasurementsSheetWithStats_().rows;
}

function normalizePhone_(phoneRaw) {
  var raw = safeString_(phoneRaw);
  if (!raw) return '';
  var cleaned = raw.replace(/[^\d+]/g, '');
  if (cleaned.indexOf('8') === 0) return '+7' + cleaned.substring(1);
  if (cleaned.indexOf('7') === 0 && raw.indexOf('+') !== 0) return '+7' + cleaned.substring(1);
  return cleaned;
}

function parseAmountToInt_(val) {
  if (!val) return 0;
  if (typeof val === 'number') return Math.round(val);
  var n = Number(String(val).replace(/\s/g, '').replace(',', '.'));
  return isFinite(n) ? Math.round(n) : 0;
}

function firestoreBaseUrl_() {
  return 'https://firestore.googleapis.com/v1/projects/' + FIREBASE_PROJECT_ID + '/databases/' + FIRESTORE_DB + '/documents';
}

function authHeaders_() {
  return {
    Authorization: 'Bearer ' + ScriptApp.getOAuthToken(),
    'Content-Type': 'application/json'
  };
}

function listAllDocumentNames_(collectionId) {
  var names = [];
  var pageToken = '';
  do {
    var url = firestoreBaseUrl_() + '/' + encodeURIComponent(collectionId) + '?pageSize=1000';
    if (pageToken) url += '&pageToken=' + encodeURIComponent(pageToken);
    var res = UrlFetchApp.fetch(url, { method: 'get', headers: authHeaders_(), muteHttpExceptions: true });
    if (res.getResponseCode() === 404) return [];
    var text = res.getContentText();
    if (!text || text === '{}') break;
    var json = JSON.parse(text);
    var docs = json.documents || [];
    for (var i = 0; i < docs.length; i++) {
      if (docs[i].name) names.push(docs[i].name);
    }
    pageToken = json.nextPageToken || '';
  } while (pageToken);
  return names;
}

function batchDeleteDocuments_(docNames) {
  var writes = [];
  for (var i = 0; i < docNames.length; i++) {
    writes.push({ delete: docNames[i] });
  }
  batchWrite_(writes);
}

function batchWrite_(writes) {
  if (!writes || !writes.length) return;
  var url = firestoreBaseUrl_() + ':batchWrite';
  var chunkSize = 500;
  for (var i = 0; i < writes.length; i += chunkSize) {
    var chunk = writes.slice(i, i + chunkSize);
    var res = UrlFetchApp.fetch(url, {
      method: 'post',
      headers: authHeaders_(),
      payload: JSON.stringify({ writes: chunk }),
      muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    var text = res.getContentText() || '';
    if (code < 200 || code >= 300) {
      throw new Error('Firestore batchWrite HTTP ' + code + ': ' + text.substring(0, 800));
    }
    var json = JSON.parse(text);
    if (json.error) {
      throw new Error('Firestore batchWrite error: ' + JSON.stringify(json.error));
    }
    var statuses = json.status || [];
    if (statuses.length !== chunk.length) {
      throw new Error(
        'Firestore batchWrite: status count ' + statuses.length + ' !== writes ' + chunk.length
      );
    }
    for (var j = 0; j < statuses.length; j++) {
      var st = statuses[j];
      if (st && st.code !== undefined && st.code !== 0) {
        throw new Error('Firestore write failed: ' + JSON.stringify(st));
      }
    }
  }
}

function safeString_(v) {
  return (v === null || v === undefined) ? '' : String(v).trim();
}

function errorText_(e) {
  return e && e.message ? e.message : String(e);
}
