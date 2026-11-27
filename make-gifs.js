const fs = require('fs');
const http = require('http');
const path = require('path');
const puppeteer = require('puppeteer');
const GIFEncoder = require('gif-encoder-2');
const { PNG } = require('pngjs');

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml'
};

function startStaticServer(baseDir) {
    return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
            const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
            let filePath = path.join(baseDir, urlPath);
            if (!filePath.startsWith(baseDir)) {
                res.statusCode = 403;
                res.end('Forbidden');
                return;
            }
            if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
                filePath = path.join(filePath, 'index.html');
            }
            if (!fs.existsSync(filePath)) {
                res.statusCode = 404;
                res.end('Not Found');
                return;
            }
            const ext = path.extname(filePath).toLowerCase();
            res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
            fs.createReadStream(filePath).pipe(res);
        });
        server.listen(0, '127.0.0.1', () => {
            resolve({ server, port: server.address().port });
        });
    });
}

const rootDir = __dirname;
const ignoreDirs = ['.git', '.vercel', 'node_modules', 'gas', 'shared'];

const VIEWPORT_W = 1000;
const VIEWPORT_H = 600;
const GIF_W = 500;
const GIF_H = 300;

const args = process.argv.slice(2);
const forceRegenerate = args.includes('--force') || args.includes('-f');
const debugPngFlag = args.find(a => a.startsWith('--debug-dir='));
const debugDir = debugPngFlag ? debugPngFlag.slice('--debug-dir='.length) : '';
const filterTerms = args.filter(a => !a.startsWith('-')).map(s => s.toLowerCase());

async function launchBrowser() {
    return await puppeteer.launch({
        headless: 'new',
        timeout: 90000,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--use-gl=angle',
            '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader',
            '--ignore-gpu-blocklist'
        ]
    });
}

// 注入視覺化虛擬滑鼠游標（使用 fixed 避免捲動偏移）
async function injectCursor(page) {
    await page.evaluate(() => {
        const existing = document.getElementById('puppeteer-cursor');
        if (existing) existing.remove();

        const cursor = document.createElement('div');
        cursor.id = 'puppeteer-cursor';
        cursor.style.cssText = `
            position: fixed; top: -30px; left: -30px; width: 14px; height: 14px;
            background: rgba(255, 59, 48, 0.85); border: 2px solid #ffffff;
            border-radius: 50%; pointer-events: none; z-index: 2147483647;
            transition: transform 0.08s ease; box-shadow: 0 0 8px rgba(0,0,0,0.65);
        `;
        document.body.appendChild(cursor);

        window.addEventListener('mousemove', e => {
            cursor.style.left = (e.clientX - 7) + 'px';
            cursor.style.top = (e.clientY - 7) + 'px';
        }, { passive: true });
        window.addEventListener('mousedown', () => {
            cursor.style.transform = 'scale(0.72)';
            cursor.style.background = 'rgba(250, 204, 21, 0.95)';
        }, { passive: true });
        window.addEventListener('mouseup', () => {
            cursor.style.transform = 'scale(1)';
            cursor.style.background = 'rgba(255, 59, 48, 0.85)';
        }, { passive: true });
    });
}

// 等比例雙線性縮放並置中填入目標畫框（保留長寬比且不裁切主體）
function resizeAndCenterPng(srcPng, targetW, targetH) {
    const srcW = srcPng.width;
    const srcH = srcPng.height;
    const srcData = srcPng.data;

    if (srcW === targetW && srcH === targetH) {
        return srcData;
    }

    // 從上下邊緣中央內部一點的位置取樣，避開 border-radius 圓角外的底色
    const midX = Math.floor(srcW / 2);
    const sampleCoords = [
        [midX, Math.min(srcH - 1, 6)],
        [midX, Math.max(0, srcH - 7)],
        [Math.min(srcW - 1, 14), Math.min(srcH - 1, 14)],
        [Math.max(0, srcW - 15), Math.min(srcH - 1, 14)]
    ];
    let bgR = 0, bgG = 0, bgB = 0;
    for (const [sx, sy] of sampleCoords) {
        const idx = (sy * srcW + sx) * 4;
        bgR += srcData[idx];
        bgG += srcData[idx + 1];
        bgB += srcData[idx + 2];
    }
    bgR = Math.round(bgR / sampleCoords.length);
    bgG = Math.round(bgG / sampleCoords.length);
    bgB = Math.round(bgB / sampleCoords.length);

    const out = Buffer.alloc(targetW * targetH * 4);
    for (let i = 0; i < out.length; i += 4) {
        out[i] = bgR;
        out[i + 1] = bgG;
        out[i + 2] = bgB;
        out[i + 3] = 255;
    }

    const scale = Math.min(targetW / srcW, targetH / srcH);
    const dstW = Math.max(1, Math.round(srcW * scale));
    const dstH = Math.max(1, Math.round(srcH * scale));
    const offsetX = Math.floor((targetW - dstW) / 2);
    const offsetY = Math.floor((targetH - dstH) / 2);

    for (let dy = 0; dy < dstH; dy++) {
        const syFloat = ((dy + 0.5) / dstH) * srcH - 0.5;
        const y0 = Math.max(0, Math.min(srcH - 1, Math.floor(syFloat)));
        const y1 = Math.max(0, Math.min(srcH - 1, y0 + 1));
        const wy = Math.max(0, Math.min(1, syFloat - y0));

        for (let dx = 0; dx < dstW; dx++) {
            const sxFloat = ((dx + 0.5) / dstW) * srcW - 0.5;
            const x0 = Math.max(0, Math.min(srcW - 1, Math.floor(sxFloat)));
            const x1 = Math.max(0, Math.min(srcW - 1, x0 + 1));
            const wx = Math.max(0, Math.min(1, sxFloat - x0));

            const i00 = (y0 * srcW + x0) * 4;
            const i10 = (y0 * srcW + x1) * 4;
            const i01 = (y1 * srcW + x0) * 4;
            const i11 = (y1 * srcW + x1) * 4;

            const w00 = (1 - wx) * (1 - wy);
            const w10 = wx * (1 - wy);
            const w01 = (1 - wx) * wy;
            const w11 = wx * wy;

            const di = ((offsetY + dy) * targetW + (offsetX + dx)) * 4;
            out[di] = Math.round(srcData[i00] * w00 + srcData[i10] * w10 + srcData[i01] * w01 + srcData[i11] * w11);
            out[di + 1] = Math.round(srcData[i00 + 1] * w00 + srcData[i10 + 1] * w10 + srcData[i01 + 1] * w01 + srcData[i11 + 1] * w11);
            out[di + 2] = Math.round(srcData[i00 + 2] * w00 + srcData[i10 + 2] * w10 + srcData[i01 + 2] * w01 + srcData[i11 + 2] * w11);
            out[di + 3] = 255;
        }
    }

    return out;
}

// 尋找頁面上「最主要且可見」的模擬畫布或主要視覺容器
async function findPrimaryVisualRegion(page) {
    return await page.evaluate(() => {
        function isVisible(el) {
            let cur = el;
            while (cur && cur.nodeType === 1) {
                const st = window.getComputedStyle(cur);
                if (st.display === 'none' || st.visibility === 'hidden' || parseFloat(st.opacity) === 0) {
                    return false;
                }
                cur = cur.parentElement;
            }
            return true;
        }

        // 若覆蓋層入口（如 Physics Tracker 的待機掃碼頁 #standbyOverlay）正處於顯示狀態，直接聚焦待機入口卡片或全螢幕
        const standbyOverlay = document.getElementById('standbyOverlay');
        if (standbyOverlay && isVisible(standbyOverlay)) {
            return {
                kind: 'viewport',
                id: 'standbyOverlay',
                clip: { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight },
                mouseBox: { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight }
            };
        }

        // 若是完整物理實驗台（如 Physics Tracker 主舞台），優先錄製完整主舞台包含影像、軌跡與圖表
        const stage = document.querySelector('.stage-container');
        if (stage && isVisible(stage)) {
            const sr = stage.getBoundingClientRect();
            if (sr.width >= 600 && sr.height >= 400) {
                return {
                    kind: 'dom',
                    id: 'stage-container',
                    clip: { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight },
                    mouseBox: { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight }
                };
            }
        }

        const preferredCanvas = document.getElementById('canvas7aTank');
        const canvases = Array.from(document.querySelectorAll('canvas'));
        let bestCanvas = null;
        let bestScore = 0;

        if (preferredCanvas && isVisible(preferredCanvas)) {
            const pr = preferredCanvas.getBoundingClientRect();
            if (pr.width >= 180 && pr.height >= 120) {
                bestCanvas = preferredCanvas;
                bestScore = Infinity;
            }
        }

        for (const cv of canvases) {
            if (!isVisible(cv)) continue;
            if (cv.id === 'textureCanvas') continue;
            const r = cv.getBoundingClientRect();
            if (r.width < 180 || r.height < 120) continue;

            const score = r.width * r.height;
            if (score > bestScore) {
                bestScore = score;
                bestCanvas = cv;
            }
        }

        if (bestCanvas) {
            bestCanvas.scrollIntoView({ block: 'center', inline: 'center' });
            const r = bestCanvas.getBoundingClientRect();
            const vw = window.innerWidth;
            const vh = window.innerHeight;

            // 若全螢幕 3D/模擬畫布上覆蓋著浮動控制欄或毛玻璃 HUD，隱藏控制欄以純淨呈現主體
            if (r.width >= vw * 0.85 && r.height >= vh * 0.85) {
                const overlaySelectors = [
                    '#controls-sidebar',
                    'aside.glass-panel',
                    '#left-panel',
                    '#right-panel',
                    '#bottom-scale-badge',
                    'header',
                    '.floating-controls',
                    '#hud-panel',
                    '#toolbar',
                    '.toolbar',
                    '.glass-panel',
                    '.lab-panel'
                ];
                overlaySelectors.forEach(sel => {
                    document.querySelectorAll(sel).forEach(el => {
                        const er = el.getBoundingClientRect();
                        if ((er.width < vw * 0.65 || er.height < vh * 0.3) && !el.querySelector('canvas')) {
                            el.style.visibility = 'hidden';
                            el.style.backdropFilter = 'none';
                            el.style.webkitBackdropFilter = 'none';
                            el.style.pointerEvents = 'none';
                        }
                    });
                });
            }

            const viewX = Math.max(0, Math.floor(r.left));
            const viewY = Math.max(0, Math.floor(r.top));
            const viewRight = Math.min(vw, Math.ceil(r.right));
            const viewBottom = Math.min(vh, Math.ceil(r.bottom));
            const width = Math.min(Math.round(r.width), vw);
            const height = Math.min(Math.round(r.height), vh);
            const docX = Math.max(0, Math.round(window.scrollX + Math.max(0, r.left)));
            const docY = Math.max(0, Math.round(window.scrollY + Math.max(0, r.top)));

            if (width >= 150 && height >= 100) {
                return {
                    kind: 'canvas',
                    id: bestCanvas.id || '(canvas)',
                    clip: { x: docX, y: docY, width: Math.max(1, viewRight - viewX), height: Math.max(1, viewBottom - viewY) },
                    mouseBox: { x: viewX, y: viewY, width: Math.max(1, viewRight - viewX), height: Math.max(1, viewBottom - viewY) }
                };
            }
        }

        // 無大型 <canvas>（例如 DOM 式週期表遊戲）時，優先聚焦於主要視覺容器
        const domCandidates = [
            document.querySelector('.game-arena'),
            document.querySelector('#board-container'),
            document.querySelector('#view-home'),
            document.querySelector('main')
        ].filter(el => el && isVisible(el));

        for (const el of domCandidates) {
            el.scrollIntoView({ block: 'center', inline: 'center' });
            const r = el.getBoundingClientRect();
            if (r.width >= 300 && r.height >= 200) {
                const vw = window.innerWidth;
                const vh = window.innerHeight;
                const pad = 12;
                const viewX = Math.max(0, Math.floor(r.left - pad));
                const viewY = Math.max(0, Math.floor(r.top - pad));
                const viewRight = Math.min(vw, Math.ceil(r.right + pad));
                const viewBottom = Math.min(vh, Math.ceil(r.bottom + pad));
                const docX = Math.max(0, Math.round(window.scrollX + viewX));
                const docY = Math.max(0, Math.round(window.scrollY + viewY));
                return {
                    kind: 'dom',
                    id: el.id || el.className || 'container',
                    clip: { x: docX, y: docY, width: viewRight - viewX, height: viewBottom - viewY },
                    mouseBox: { x: viewX, y: viewY, width: viewRight - viewX, height: viewBottom - viewY }
                };
            }
        }

        return {
            kind: 'viewport',
            id: 'viewport',
            clip: { x: Math.round(window.scrollX), y: Math.round(window.scrollY), width: window.innerWidth, height: window.innerHeight },
            mouseBox: { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight }
        };
    });
}

async function createGifForHtml(browser, pageUrl, htmlPath, gifPath) {
    const baseName = path.basename(htmlPath);
    const startTs = Date.now();
    console.log(`🎬 正在錄製對焦 GIF: ${baseName}...`);

    const page = await browser.newPage();
    page.setDefaultTimeout(30000);
    try {
        await page.setViewport({ width: VIEWPORT_W, height: VIEWPORT_H, deviceScaleFactor: 1 });

        await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await new Promise(r => setTimeout(r, 1200));

        // 若是起始設定彈窗蓋住主遊戲（如週期表排排看）或待機入口頁（Physics Tracker），自動點擊示範進入主場景
        const clickedAction = await page.evaluate(() => {
            const activeModal = document.querySelector('#settings-modal.active');
            const startBtn = activeModal && activeModal.querySelector('#start-game-btn');
            if (startBtn) { startBtn.click(); return 'modal'; }

            const demoBtn = document.getElementById('btnLoadDemoDirectly');
            if (demoBtn) { demoBtn.click(); return 'demo'; }

            const rxnTab = document.querySelector('.tab-btn[data-tab="mod7a"]');
            if (rxnTab && document.getElementById('canvas7aTank')) {
                rxnTab.click();
                const mod7a = document.getElementById('mod7a');
                if (mod7a) mod7a.style.animation = 'none';
                return 'tab';
            }

            const playRearrangeBtn = document.getElementById('btnPlayRearrange');
            if (playRearrangeBtn && document.getElementById('canvas1a')) {
                const mod1 = document.getElementById('mod1');
                if (mod1) mod1.style.animation = 'none';
                document.querySelector('.step-btn[data-cidx="0"][data-delta="1"]')?.click();
                document.querySelector('.step-btn[data-cidx="2"][data-delta="1"]')?.click();
                if (!playRearrangeBtn.disabled) playRearrangeBtn.click();
                return 'rearrange';
            }

            const thomsonPreset = document.getElementById('preset-e-only');
            if (thomsonPreset && document.getElementById('btn-mode-1')) {
                thomsonPreset.click();
                return 'thomson';
            }
            return '';
        });

        if (clickedAction === 'demo') {
            await page.waitForFunction(
                () => document.getElementById('standbyOverlay')?.classList.contains('hidden'),
                { timeout: 25000 }
            ).catch(() => { });
            await new Promise(r => setTimeout(r, 800));
        } else if (clickedAction === 'tab') {
            await new Promise(r => setTimeout(r, 900));
        } else if (clickedAction === 'rearrange') {
            await new Promise(r => setTimeout(r, 250));
        } else {
            await new Promise(r => setTimeout(r, 350));
        }

        const target = await findPrimaryVisualRegion(page);
        const { clip, mouseBox } = target;
        console.log(`   🎯 對焦區域 [${target.kind}: ${target.id}] => (${clip.x}, ${clip.y}) ${clip.width}x${clip.height}`);

        await injectCursor(page);

        const encoder = new GIFEncoder(GIF_W, GIF_H);
        encoder.start();
        encoder.setRepeat(0);
        encoder.setDelay(110);
        encoder.setQuality(12);

        const cx = mouseBox.x + mouseBox.width / 2;
        const cy = mouseBox.y + mouseBox.height / 2;
        const dx = Math.min(110, mouseBox.width * 0.22);
        const dy = Math.min(60, mouseBox.height * 0.16);

        if (clickedAction === 'thomson') {
            await page.mouse.move(cx - dx * 0.45, cy);
            await page.mouse.down();
            await page.mouse.move(cx + dx * 0.45, cy + dy * 0.3, { steps: 8 });
            await page.mouse.up();
        } else {
            await page.mouse.move(cx - dx, cy + dy);
            await page.mouse.move(cx, cy, { steps: 5 });
            await page.mouse.down();
            await page.mouse.move(cx + dx, cy - dy, { steps: 8 });
            await page.mouse.up();
        }

        const framesCount = 15;
        for (let i = 0; i < framesCount; i++) {
            const buffer = await page.screenshot({ type: 'png', clip });
            const srcPng = PNG.sync.read(buffer);
            const frameRgba = resizeAndCenterPng(srcPng, GIF_W, GIF_H);
            if (debugDir && i === 7) {
                const outPng = new PNG({ width: GIF_W, height: GIF_H });
                outPng.data = frameRgba;
                fs.mkdirSync(debugDir, { recursive: true });
                fs.writeFileSync(path.join(debugDir, baseName.replace(/\.html$/i, '.png')), PNG.sync.write(outPng));
            }
            encoder.addFrame(frameRgba);
            await new Promise(r => setTimeout(r, 85));
        }

        encoder.finish();
        const gifBuffer = encoder.out.getData();
        fs.writeFileSync(gifPath, gifBuffer);

        const elapsed = ((Date.now() - startTs) / 1000).toFixed(1);
        console.log(`✅ 完成置中 GIF: ${path.basename(gifPath)} (${Math.round(gifBuffer.length / 1024)} KB, ${elapsed}s)`);
    } finally {
        await page.close().catch(() => { });
    }
}

async function processAllFiles() {
    const items = fs.readdirSync(rootDir);
    const jobs = [];

    for (const item of items) {
        const itemPath = path.join(rootDir, item);
        if (!fs.statSync(itemPath).isDirectory() || ignoreDirs.includes(item)) continue;

        const files = fs.readdirSync(itemPath).filter(f => f.endsWith('.html')).sort();
        for (const file of files) {
            const relPath = `${item}/${file}`;
            if (filterTerms.length > 0 && !filterTerms.some(t => relPath.toLowerCase().includes(t))) {
                continue;
            }
            const htmlPath = path.join(itemPath, file);
            const htmlContent = fs.readFileSync(htmlPath, 'utf8');
            if (/<meta[^>]*name=["']portal-type["'][^>]*content=["']tool["']/i.test(htmlContent)) {
                continue;
            }
            const gifPath = path.join(itemPath, file.replace(/\.html$/i, '.gif'));
            if (forceRegenerate || !fs.existsSync(gifPath)) {
                jobs.push({ relPath, htmlPath, gifPath });
            } else {
                console.log(`⏩ ${relPath} 已有 GIF 預覽（可加 --force 重錄），跳過。`);
            }
        }
    }

    if (jobs.length === 0) {
        console.log('🎉 沒有需要錄製的 GIF！');
        return;
    }

    console.log(`🚀 準備錄製 ${jobs.length} 個動畫 GIF（共重用單一瀏覽器並透過本機 HTTP 支援 ES 模組）...`);
    const { server, port } = await startStaticServer(rootDir);
    let browser = await launchBrowser();

    try {
        for (const job of jobs) {
            if (!browser || !browser.connected) {
                console.log('🔄 偵測到瀏覽器實體中斷，正在重新啟動 Chrome...');
                browser = await launchBrowser();
            }
            const pageUrl = `http://127.0.0.1:${port}/${encodeURI(job.relPath)}`;
            try {
                await createGifForHtml(browser, pageUrl, job.htmlPath, job.gifPath);
            } catch (err) {
                console.error(`❌ 錄製 ${job.relPath} 失敗:`, err.message || err);
            }
        }
    } finally {
        if (browser) await browser.close().catch(() => { });
        server.close();
    }

    console.log('🎉 所有 GIF 處理完畢！');
}

processAllFiles();
