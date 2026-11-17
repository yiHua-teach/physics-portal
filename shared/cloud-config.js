/**
 * 物理與化學互動遊戲平台 - 共用雲端試算表連線模組
 * -------------------------------------------------------------
 * 1. 排行榜共享試算表 ID: 17izy_vJCd539R4V5VZIKdfsUMJ8DofpnyL9TL1KBdXo
 * 2. 光學反射關卡資料庫 ID: 18SjUr3EBKQxNu6GyNoPkZR5SIp-uJzjAWF-W-xMsXHU
 */
(function (global) {
    const LEADERBOARD_SHEET_ID = '17izy_vJCd539R4V5VZIKdfsUMJ8DofpnyL9TL1KBdXo';
    const LEVELS_SHEET_ID = '18SjUr3EBKQxNu6GyNoPkZR5SIp-uJzjAWF-W-xMsXHU';

    // 部署 gas/Code.gs 後，將 /exec 網址填入此處即可讓所有學生裝置直接讀寫上述兩張 Google 試算表
    const DEFAULT_GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycby8KD7Vr8xsnSBgR0BiCBmNuC3uAYFrtu0FnP0LAp0hTGEQo6J0XhczloxZadw2y2BA/exec';

    const STORAGE_GAS_KEY = 'PHYSICS_PORTAL_GAS_URL';
    const STORAGE_LB_PREFIX = 'PHYSICS_PORTAL_LB_';
    const STORAGE_CUSTOM_LEVELS_KEY = 'PHYSICS_PORTAL_CUSTOM_LEVELS';

    // 若網址列帶有 ?gas=xxx，自動記住供本機使用
    try {
        const params = new URLSearchParams(global.location.search);
        const gasParam = params.get('gas');
        if (gasParam && gasParam.startsWith('https://script.google.com/')) {
            localStorage.setItem(STORAGE_GAS_KEY, gasParam.trim());
        }
    } catch (e) {}

    function getGasUrl() {
        try {
            const saved = localStorage.getItem(STORAGE_GAS_KEY);
            if (saved && saved.trim()) return saved.trim();
        } catch (e) {}
        return DEFAULT_GAS_WEB_APP_URL.trim();
    }

    function setGasUrl(url) {
        try {
            if (!url || !url.trim()) localStorage.removeItem(STORAGE_GAS_KEY);
            else localStorage.setItem(STORAGE_GAS_KEY, url.trim());
        } catch (e) {}
    }

    function parseGvizResponse(text) {
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');
        if (start === -1 || end === -1) return [];
        const json = JSON.parse(text.slice(start, end + 1));
        if (!json.table || !json.table.rows) return [];

        const cols = (json.table.cols || []).map((c, i) => (c.label || c.id || ('col' + i)).trim());
        return json.table.rows.map(row => {
            const obj = {};
            cols.forEach((col, i) => {
                const cell = row.c ? row.c[i] : null;
                if (!cell) {
                    obj[col] = '';
                } else if (cell.v !== undefined && cell.v !== null) {
                    obj[col] = cell.f && typeof cell.v === 'string' && cell.v.startsWith('Date(') ? cell.f : cell.v;
                } else {
                    obj[col] = '';
                }
            });
            return obj;
        }).filter(r => Object.values(r).some(v => v !== '' && v !== null));
    }

    async function fetchGviz(sheetId, tabName) {
        const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(tabName)}&_t=${Date.now()}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const txt = await res.text();
        if (!txt.includes('google.visualization.Query.setResponse')) {
            throw new Error('試算表尚未設定為「知道連結的使用者可檢視」或未部署 GAS');
        }
        return parseGvizResponse(txt);
    }

    function readLocalLeaderboard(tabName) {
        try {
            const raw = localStorage.getItem(STORAGE_LB_PREFIX + tabName);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            return [];
        }
    }

    function saveLocalLeaderboard(tabName, entry) {
        try {
            const list = readLocalLeaderboard(tabName);
            list.push(entry);
            localStorage.setItem(STORAGE_LB_PREFIX + tabName, JSON.stringify(list.slice(-50)));
        } catch (e) {}
    }

    async function fetchLeaderboard(tabName) {
        const gasUrl = getGasUrl();
        let cloudRows = null;

        if (gasUrl) {
            try {
                const res = await fetch(`${gasUrl}?mode=${encodeURIComponent(tabName)}&t=${Date.now()}`);
                if (res.ok) {
                    const data = await res.json();
                    if (Array.isArray(data)) cloudRows = data;
                }
            } catch (e) {
                console.warn('GAS leaderboard fetch failed, trying fallback:', e.message);
            }
        }

        if (cloudRows === null) {
            try {
                cloudRows = await fetchGviz(LEADERBOARD_SHEET_ID, tabName);
            } catch (e) {
                console.warn('GViz leaderboard fetch skipped:', e.message);
            }
        }

        const localRows = readLocalLeaderboard(tabName);
        if (cloudRows !== null) {
            return { rows: cloudRows, source: gasUrl ? 'gas' : 'gviz' };
        }
        return { rows: localRows, source: 'local' };
    }

    async function submitLeaderboard(tabName, payload) {
        const record = { ...payload, mode: tabName };
        saveLocalLeaderboard(tabName, record);

        const gasUrl = getGasUrl();
        if (!gasUrl) {
            return { ok: true, cloudSynced: false, reason: 'GAS_URL_NOT_SET' };
        }

        try {
            await fetch(gasUrl, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(record)
            });
            return { ok: true, cloudSynced: true };
        } catch (err) {
            return { ok: false, cloudSynced: false, error: err.message };
        }
    }

    function readLocalLevels() {
        try {
            const raw = localStorage.getItem(STORAGE_CUSTOM_LEVELS_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            return [];
        }
    }

    function writeLocalLevels(levels) {
        try {
            localStorage.setItem(STORAGE_CUSTOM_LEVELS_KEY, JSON.stringify(levels));
        } catch (e) {}
    }

    function normalizeLevelRows(rows, includeDisabled) {
        return rows
            .filter(r => {
                if (includeDisabled) return true;
                const en = String(r.enabled === undefined ? 'TRUE' : r.enabled).toUpperCase();
                return en !== 'FALSE' && en !== '0';
            })
            .map((r, idx) => {
                let parsed = {};
                try {
                    parsed = typeof r.levelJson === 'string' && r.levelJson.trim()
                        ? JSON.parse(r.levelJson)
                        : (r.levelJson || {});
                } catch (e) {
                    parsed = {};
                }
                return {
                    id: r.id || ('lvl_' + (idx + 1)),
                    order: Number(r.order) || (idx + 1),
                    title: r.title || parsed.title || `關卡 ${idx + 1}`,
                    desc: r.desc || parsed.desc || '',
                    hint: r.hint || parsed.hint || '',
                    physics: r.physics || parsed.physics || '',
                    enabled: String(r.enabled === undefined ? 'TRUE' : r.enabled).toUpperCase() !== 'FALSE',
                    emitters: Array.isArray(parsed.emitters) ? parsed.emitters : [],
                    targets: Array.isArray(parsed.targets) ? parsed.targets : [],
                    fixedObjects: Array.isArray(parsed.fixedObjects) ? parsed.fixedObjects : [],
                    updatedAt: r.updatedAt || ''
                };
            })
            .filter(l => l.emitters.length > 0 && l.targets.length > 0)
            .sort((a, b) => a.order - b.order);
    }

    async function fetchReflectionLevels({ includeDisabled = false } = {}) {
        const gasUrl = getGasUrl();

        if (gasUrl) {
            try {
                const res = await fetch(`${gasUrl}?action=levels&includeDisabled=${includeDisabled ? '1' : '0'}&t=${Date.now()}`);
                if (res.ok) {
                    const raw = await res.json();
                    if (Array.isArray(raw)) {
                        const levels = normalizeLevelRows(raw, includeDisabled);
                        if (levels.length > 0) return { levels, source: 'gas' };
                    }
                }
            } catch (e) {
                console.warn('GAS levels fetch failed:', e.message);
            }
        }

        try {
            const rawGviz = await fetchGviz(LEVELS_SHEET_ID, 'Levels');
            const levels = normalizeLevelRows(rawGviz, includeDisabled);
            if (levels.length > 0) return { levels, source: 'gviz' };
        } catch (e) {
            console.warn('GViz levels fetch skipped:', e.message);
        }

        const local = readLocalLevels();
        if (local.length > 0) {
            return { levels: local, source: 'local' };
        }
        return { levels: null, source: 'builtin' };
    }

    async function saveReflectionLevel(levelRecord) {
        const local = readLocalLevels();
        const existingIdx = local.findIndex(l => l.id === levelRecord.id);
        const normalized = {
            ...levelRecord,
            enabled: levelRecord.enabled !== false,
            updatedAt: new Date().toLocaleString()
        };
        if (existingIdx >= 0) local[existingIdx] = normalized;
        else local.push(normalized);
        writeLocalLevels(local);

        const gasUrl = getGasUrl();
        if (!gasUrl) {
            return { ok: true, cloudSynced: false, reason: 'GAS_URL_NOT_SET' };
        }

        try {
            await fetch(gasUrl, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({
                    action: 'saveLevel',
                    id: normalized.id,
                    order: normalized.order,
                    title: normalized.title,
                    desc: normalized.desc,
                    hint: normalized.hint,
                    physics: normalized.physics,
                    enabled: normalized.enabled ? 'TRUE' : 'FALSE',
                    levelJson: JSON.stringify({
                        title: normalized.title,
                        desc: normalized.desc,
                        hint: normalized.hint,
                        physics: normalized.physics,
                        emitters: normalized.emitters,
                        targets: normalized.targets,
                        fixedObjects: normalized.fixedObjects
                    })
                })
            });
            return { ok: true, cloudSynced: true };
        } catch (err) {
            return { ok: false, cloudSynced: false, error: err.message };
        }
    }

    async function deleteReflectionLevel(levelId) {
        const local = readLocalLevels().filter(l => l.id !== levelId);
        writeLocalLevels(local);

        const gasUrl = getGasUrl();
        if (!gasUrl) {
            return { ok: true, cloudSynced: false };
        }
        try {
            await fetch(gasUrl, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({ action: 'deleteLevel', id: levelId })
            });
            return { ok: true, cloudSynced: true };
        } catch (err) {
            return { ok: false, cloudSynced: false, error: err.message };
        }
    }

    global.PhysicsPortalCloud = {
        LEADERBOARD_SHEET_ID,
        LEVELS_SHEET_ID,
        LEADERBOARD_SHEET_URL: `https://docs.google.com/spreadsheets/d/${LEADERBOARD_SHEET_ID}/edit`,
        LEVELS_SHEET_URL: `https://docs.google.com/spreadsheets/d/${LEVELS_SHEET_ID}/edit`,
        getGasUrl,
        setGasUrl,
        fetchLeaderboard,
        submitLeaderboard,
        fetchReflectionLevels,
        saveReflectionLevel,
        deleteReflectionLevel
    };
})(window);
