/**
 * Google Apps Script Web App 後端 (Code.gs)
 * -------------------------------------------------------------
 * 用途：作為 GitHub Pages 前端與兩張共享 Google 試算表之間的橋樑
 *   1. 排行榜總表 (LEADERBOARD_SHEET_ID): 17izy_vJCd539R4V5VZIKdfsUMJ8DofpnyL9TL1KBdXo
 *      分頁：週期表搶答、連線迷宮、challenge30、challengeFull、光學反射迷宮
 *   2. 光學關卡表 (LEVELS_SHEET_ID): 18SjUr3EBKQxNu6GyNoPkZR5SIp-uJzjAWF-W-xMsXHU
 *      分頁：Levels
 *
 * 部署方式：
 *   1. 開啟任一試算表 -> 擴充功能 -> Apps Script -> 貼上此檔案全部內容
 *   2. 部署 -> 新增部署 -> 類型選「網頁應用程式」
 *   3. 執行身分：「我」；誰可以存取：「所有人」
 *   4. 複製部署產生的 Web App 網址 (/exec)，貼入 shared/cloud-config.js 的 GAS_WEB_APP_URL
 */

const LEADERBOARD_SHEET_ID = "17izy_vJCd539R4V5VZIKdfsUMJ8DofpnyL9TL1KBdXo";
const LEVELS_SHEET_ID = "18SjUr3EBKQxNu6GyNoPkZR5SIp-uJzjAWF-W-xMsXHU";

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function sheetToObjects(sheet) {
  const values = sheet.getDataRange().getValues();
  if (!values || values.length < 2) return [];
  const headers = values[0].map(h => String(h).trim());
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (row.every(cell => cell === "" || cell === null)) continue;
    const obj = {};
    headers.forEach((h, idx) => {
      if (h) obj[h] = row[idx];
    });
    rows.push(obj);
  }
  return rows;
}

function doGet(e) {
  const params = (e && e.parameter) ? e.parameter : {};
  const action = params.action || "";

  // 1. 讀取光學反射遊戲關卡設定
  if (action === "levels") {
    const ss = SpreadsheetApp.openById(LEVELS_SHEET_ID);
    const sheet = ss.getSheetByName("Levels");
    if (!sheet) return jsonResponse([]);

    const includeDisabled = params.includeDisabled === "1" || params.includeDisabled === "true";
    const rows = sheetToObjects(sheet)
      .filter(r => {
        if (includeDisabled) return true;
        const flag = String(r.enabled).toUpperCase();
        return flag !== "FALSE" && flag !== "0";
      })
      .sort((a, b) => (Number(a.order) || 999) - (Number(b.order) || 999));

    return jsonResponse(rows);
  }

  // 2. 讀取排行榜 (支援 mode 或 sheet 參數)
  const tabName = params.mode || params.sheet || "週期表搶答";
  const ss = SpreadsheetApp.openById(LEADERBOARD_SHEET_ID);
  const sheet = ss.getSheetByName(tabName);
  if (!sheet) return jsonResponse([]);

  const rows = sheetToObjects(sheet);

  if (tabName === "光學反射迷宮") {
    rows.sort((a, b) => {
      const scoreDiff = (Number(b.score) || 0) - (Number(a.score) || 0);
      if (scoreDiff !== 0) return scoreDiff;
      return (Number(a.rawTime) || 999999) - (Number(b.rawTime) || 999999);
    });
  } else {
    rows.sort((a, b) => {
      const tDiff = (Number(a.rawTime) || 99999999) - (Number(b.rawTime) || 99999999);
      if (tDiff !== 0) return tDiff;
      return (Number(a.wrongClicks) || 0) - (Number(b.wrongClicks) || 0);
    });
  }

  return jsonResponse(rows.slice(0, 50));
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const raw = (e && e.postData && e.postData.contents) ? e.postData.contents : "{}";
    const data = JSON.parse(raw);
    const action = data.action || "submitScore";

    // A. 教師編輯器：新增 / 更新光學關卡
    if (action === "saveLevel") {
      const ss = SpreadsheetApp.openById(LEVELS_SHEET_ID);
      let sheet = ss.getSheetByName("Levels");
      if (!sheet) {
        sheet = ss.insertSheet("Levels");
        sheet.appendRow(["id", "order", "title", "desc", "hint", "physics", "enabled", "levelJson", "updatedAt"]);
      }

      const values = sheet.getDataRange().getValues();
      const nowStr = Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy-MM-dd HH:mm:ss");
      const id = data.id || ("lvl_" + Date.now());
      const order = Number(data.order) || Math.max(1, values.length);
      const enabled = data.enabled === false || data.enabled === "FALSE" ? "FALSE" : "TRUE";
      const rowData = [
        id,
        order,
        data.title || "未命名關卡",
        data.desc || "",
        data.hint || "",
        data.physics || "",
        enabled,
        typeof data.levelJson === "string" ? data.levelJson : JSON.stringify(data.levelJson || {}),
        nowStr
      ];

      let targetRow = -1;
      for (let i = 1; i < values.length; i++) {
        if (String(values[i][0]) === String(id)) {
          targetRow = i + 1;
          break;
        }
      }

      if (targetRow > 0) {
        sheet.getRange(targetRow, 1, 1, rowData.length).setValues([rowData]);
      } else {
        sheet.appendRow(rowData);
      }

      return jsonResponse({ ok: true, id: id, updatedAt: nowStr });
    }

    // B. 教師編輯器：刪除光學關卡
    if (action === "deleteLevel") {
      const ss = SpreadsheetApp.openById(LEVELS_SHEET_ID);
      const sheet = ss.getSheetByName("Levels");
      if (!sheet) return jsonResponse({ ok: false, error: "Levels sheet not found" });

      const values = sheet.getDataRange().getValues();
      for (let i = 1; i < values.length; i++) {
        if (String(values[i][0]) === String(data.id)) {
          sheet.deleteRow(i + 1);
          return jsonResponse({ ok: true, id: data.id });
        }
      }
      return jsonResponse({ ok: false, error: "Level ID not found" });
    }

    // C. 所有遊戲共用：寫入排行榜成績
    const tabName = data.mode || data.sheet || "週期表搶答";
    const ss = SpreadsheetApp.openById(LEADERBOARD_SHEET_ID);
    let sheet = ss.getSheetByName(tabName);

    if (!sheet) {
      sheet = ss.insertSheet(tabName);
      if (tabName === "光學反射迷宮") {
        sheet.appendRow(["name", "time", "rawTime", "score", "levelIdx", "levelTitle", "date", "mode"]);
      } else {
        sheet.appendRow(["name", "time", "rawTime", "wrongClicks", "date", "mode"]);
      }
    }

    const headers = sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getValues()[0].map(h => String(h).trim());
    const dateStr = data.date || Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy/MM/dd");

    const record = {
      name: data.name || "匿名玩家",
      time: data.time || "",
      rawTime: data.rawTime !== undefined ? data.rawTime : "",
      wrongClicks: data.wrongClicks !== undefined ? data.wrongClicks : 0,
      score: data.score !== undefined ? data.score : 0,
      levelIdx: data.levelIdx !== undefined ? data.levelIdx : "",
      levelTitle: data.levelTitle || "",
      date: dateStr,
      mode: tabName
    };

    const newRow = headers.map(h => record[h] !== undefined ? record[h] : "");
    sheet.appendRow(newRow);

    return jsonResponse({ ok: true, tab: tabName });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.toString() });
  } finally {
    lock.releaseLock();
  }
}
