/**
 * BACKUP: исходный Google Apps Script до incremental sync (2026-05-29).
 * Скопируйте содержимое в Apps Script Editor для отката.
 *
 * Проблемы старой версии:
 * - syncToFirestore удаляет всю коллекцию перед записью
 * - docId = Utilities.getUuid() на каждый запуск
 * - batchWrite_ не проверяет HTTP-ответ
 */
/**
 * CRM "Супермоскитка"
 * ПОЛНЫЙ КОД (БЕЗ ОБРЫВОВ) - С МЕТАДАННЫМИ И ОТПРАВКОЙ SMS
 */
var FIREBASE_PROJECT_ID = 'supermoskitka-587fb';
var FIRESTORE_DB = '(default)';
var COLLECTION_MEASUREMENTS = 'upcoming_measurements';
var COLLECTION_ARCHIVE = 'measurements';
var COLLECTION_READY = 'ready_orders';
var SHEET_MEASUREMENTS = 'Замеры';

// ===== Для GET "Заказы в работе" =====
var SHEET_RAMOCHNIE = 'Рамочные';
var SHEET_PLISSE = 'Плиссе';
var SHEET_SHTORI = 'Шторы';

// Индексы колонок статуса (A=0)
var STATUS_COL_RAMOCHNIE = 15; // P
var STATUS_COL_PLISSE = 19;    // T
var STATUS_COL_SHTORI = 16;    // Q
// Диапазон A:W = 23 колонки
var ORDERS_COLS_AW = 23;

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Firebase Sync')
    .addItem('Обновить список замерщику', 'syncToFirestore')
    .addItem('Синхронизировать монтажи', 'syncReadyOrders')
    .addToUi();
}

/** ===== 1. СИНХРОНИЗАЦИЯ ЗАМЕРОВ (старая версия) ===== */
function syncToFirestore() {
  var ui = SpreadsheetApp.getUi();
  try {
    var docNames = listAllDocumentNames_(COLLECTION_MEASUREMENTS);
    if (docNames.length > 0) {
      batchDeleteDocuments_(docNames);
    }
    var rows = readMeasurementsSheet_();
    var writes = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!r.address) continue;
      var docId = Utilities.getUuid();
      var docName = 'projects/' + FIREBASE_PROJECT_ID + '/databases/' + FIRESTORE_DB + '/documents/' + COLLECTION_MEASUREMENTS + '/' + docId;
      writes.push({
        update: {
          name: docName,
          fields: {
            name: { stringValue: r.name || '' },
            phone: { stringValue: normalizePhone_(r.phone || '') },
            address: { stringValue: r.address || '' },
            comment: { stringValue: r.comment || '' },
            payer_text: { stringValue: r.payer_text || '' },
            amount_rub: { integerValue: String(r.amount_rub || 0) }
          }
        }
      });
    }
    if (writes.length > 0) batchWrite_(writes);
    ui.alert('Готово', 'Замеры обновлены. Удалено: ' + docNames.length + ', Добавлено: ' + writes.length, ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('Ошибка', errorText_(e), ui.ButtonSet.OK);
  }
}

/** ===== 2. СИНХРОНИЗАЦИЯ МОНТАЖЕЙ ===== */
function syncReadyOrders() {
  var ui = SpreadsheetApp.getUi();
  try {
    var oldDocs = listAllDocumentNames_(COLLECTION_READY);
    if (oldDocs.length > 0) {
      batchDeleteDocuments_(oldDocs);
    }
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var ordersMap = {};
    var excludedOrders = {};

    var parseSheet = function(sheetName, colName, colPhone, colAddr, colTotal, colStatus, itemLabel) {
      var sh = ss.getSheetByName(sheetName);
      if (!sh) return;
      var lastRow = sh.getLastRow();
      if (lastRow < 2) return;
      var data = sh.getRange(2, 1, lastRow - 1, 23).getValues();
      for (var i = 0; i < data.length; i++) {
        var row = data[i];
        var status = safeString_(row[colStatus]).toUpperCase().trim();
        var phoneKey = normalizePhone_(row[colPhone]);
        var orderId = safeString_(row[22]) || phoneKey || ('ID_' + (i + 1));

        if (status === 'СДАН') {
          excludedOrders[orderId] = true;
          if (ordersMap[orderId]) delete ordersMap[orderId];
          continue;
        }
        if (excludedOrders[orderId]) continue;
        if (status === 'ГОТОВ К МОНТАЖУ') {
          if (!ordersMap[orderId]) {
            ordersMap[orderId] = {
              orderId: orderId,
              name: safeString_(row[colName]),
              phone: phoneKey,
              address: safeString_(row[colAddr]),
              total: parseAmountToInt_(row[colTotal]),
              itemCounts: {}
            };
          } else {
            var currentTotal = parseAmountToInt_(row[colTotal]);
            if (currentTotal > 0) ordersMap[orderId].total = currentTotal;
          }
          var count = ordersMap[orderId].itemCounts[itemLabel] || 0;
          ordersMap[orderId].itemCounts[itemLabel] = count + 1;
        }
      }
    };

    parseSheet('Рамочные', 3, 4, 2, 14, 15, 'Рамочные сетки');
    parseSheet('Плиссе', 5, 4, 2, 18, 19, 'Плиссе');
    parseSheet('Шторы', 3, 4, 2, 15, 16, 'Шторы');

    var writes = [];
    var countProcessed = 0;
    for (var key in ordersMap) {
      var o = ordersMap[key];
      countProcessed++;
      var itemsArr = [];
      for (var label in o.itemCounts) {
        itemsArr.push(label + ' - ' + o.itemCounts[label] + ' шт.');
      }
      var docName = 'projects/' + FIREBASE_PROJECT_ID + '/databases/' + FIRESTORE_DB + '/documents/' + COLLECTION_READY + '/' + o.orderId;
      writes.push({
        update: {
          name: docName,
          fields: {
            orderId: { stringValue: o.orderId },
            name: { stringValue: o.name },
            phone: { stringValue: o.phone },
            address: { stringValue: o.address },
            total: { integerValue: String(o.total || 0) },
            items_summary: { stringValue: itemsArr.join(', ') }
          }
        }
      });

      var archiveDocName = 'projects/' + FIREBASE_PROJECT_ID + '/databases/' + FIRESTORE_DB + '/documents/' + COLLECTION_ARCHIVE + '/' + o.orderId;
      writes.push({
        update: {
          name: archiveDocName,
          fields: {
            workStatus: { stringValue: 'ready' },
            workStatusLabel: { stringValue: 'Готов' },
            workStatusUpdatedAt: { stringValue: new Date().toISOString() }
          }
        },
        updateMask: {
          fieldPaths: [
            'workStatus',
            'workStatusLabel',
            'workStatusUpdatedAt'
          ]
        }
      });
    }
    if (writes.length > 0) batchWrite_(writes);
    ui.alert('Монтажи', 'Обновлено: ' + countProcessed + '. Удалено (сдано): ' + Object.keys(excludedOrders).length, ui.ButtonSet.OK);
  } catch (e) {
    ui.alert('Ошибка монтажей', errorText_(e), ui.ButtonSet.OK);
  }
}

/** ===== 3. GET API: "Заказы в работе" ===== */
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
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_MEASUREMENTS);
  if (!sh) return [];
  var lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  var values = sh.getRange(2, 1, lastRow - 1, 6).getValues();
  var results = [];
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    results.push({
      name: safeString_(row[0]),
      phone: safeString_(row[1]),
      address: safeString_(row[2]),
      comment: safeString_(row[3]),
      payer_text: safeString_(row[4]),
      amount_rub: parseAmountToInt_(row[5])
    });
  }
  return results;
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
  var url = firestoreBaseUrl_() + '/' + encodeURIComponent(collectionId) + '?pageSize=1000';
  var res = UrlFetchApp.fetch(url, { method: 'get', headers: authHeaders_(), muteHttpExceptions: true });
  if (res.getResponseCode() === 404) return [];
  var text = res.getContentText();
  if (!text || text === '{}') return [];
  var json = JSON.parse(text);
  var docs = json.documents || [];
  var names = [];
  for (var i = 0; i < docs.length; i++) {
    if (docs[i].name) names.push(docs[i].name);
  }
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
  if (!writes.length) return;
  var url = firestoreBaseUrl_() + ':batchWrite';
  var chunkSize = 500;
  for (var i = 0; i < writes.length; i += chunkSize) {
    var chunk = writes.slice(i, i + chunkSize);
    UrlFetchApp.fetch(url, {
      method: 'post',
      headers: authHeaders_(),
      payload: JSON.stringify({ writes: chunk }),
      muteHttpExceptions: true
    });
  }
}

function safeString_(v) {
  return (v === null || v === undefined) ? '' : String(v).trim();
}

function errorText_(e) {
  return e && e.message ? e.message : String(e);
}
