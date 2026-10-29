const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const GIFEncoder = require('gif-encoder-2');
const { PNG } = require('pngjs');

const rootDir = __dirname;
const ignoreDirs = ['.git', '.vercel', 'node_modules'];

// 注入視覺化虛擬滑鼠游標
async function injectCursor(page) {
    await page.evaluate(() => {
        const cursor = document.createElement('div');
        cursor.id = 'puppeteer-cursor';
        cursor.style.cssText = `
            position: absolute; top: 0; left: 0; width: 16px; height: 16px;
            background: rgba(255, 0, 0, 0.7); border: 2px solid white;
            border-radius: 50%; pointer-events: none; z-index: 99999;
            transition: transform 0.1s; box-shadow: 0 0 5px rgba(0,0,0,0.5);
        `;
        document.body.appendChild(cursor);

        window.addEventListener('mousemove', e => {
            cursor.style.left = e.clientX - 8 + 'px';
            cursor.style.top = e.clientY - 8 + 'px';
        });
        window.addEventListener('mousedown', () => {
            cursor.style.transform = 'scale(0.7)';
            cursor.style.background = 'rgba(255, 255, 0, 0.9)';
        });
        window.addEventListener('mouseup', () => {
            cursor.style.transform = 'scale(1)';
            cursor.style.background = 'rgba(255, 0, 0, 0.7)';
        });
    });
}

async function createGifForHtml(htmlPath, gifPath) {
    console.log(`🎬 正在自動錄製 GIF: ${path.basename(htmlPath)}...`);
    
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    await page.setViewport({ width: 500, height: 300 });

    await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0' });

    // 🌟【新增】自動將畫面滾動對焦至中央（優先對準 <canvas> 物理主體）
    await page.evaluate(() => {
        const target = document.querySelector('canvas') || document.body;
        target.scrollIntoView({ block: 'center', inline: 'center' });
    });

    await injectCursor(page);

    // 初始化 gif-encoder-2
    const encoder = new GIFEncoder(500, 300);
    encoder.start();
    encoder.setRepeat(0);   // 無限循環
    encoder.setDelay(100);  // 10 fps
    encoder.setQuality(10);

    await new Promise(r => setTimeout(r, 500));

    // 自動模擬滑鼠操作
    await page.mouse.move(50, 50);
    await page.mouse.move(250, 150, { steps: 10 });
    await page.mouse.down();
    await page.mouse.move(380, 100, { steps: 15 });
    await page.mouse.up();

    // 擷取 25 幀畫面
    for (let i = 0; i < 25; i++) {
        const buffer = await page.screenshot({ type: 'png' });
        const png = PNG.sync.read(buffer);
        encoder.addFrame(png.data);
        await new Promise(r => setTimeout(r, 100));
    }

    encoder.finish();
    
    const gifBuffer = encoder.out.getData();
    fs.writeFileSync(gifPath, gifBuffer);

    await browser.close();
    console.log(`✅ 成功產生對焦版 GIF: ${path.basename(gifPath)}`);
}

async function processAllFiles() {
    const items = fs.readdirSync(rootDir);

    for (const item of items) {
        const itemPath = path.join(rootDir, item);
        if (fs.statSync(itemPath).isDirectory() && !ignoreDirs.includes(item)) {
            const files = fs.readdirSync(itemPath).filter(f => f.endsWith('.html'));

            for (const file of files) {
                const htmlPath = path.join(itemPath, file);
                const gifPath = path.join(itemPath, file.replace('.html', '.gif'));

                // 若尚未有對應 GIF 則進行錄製
                if (!fs.existsSync(gifPath)) {
                    try {
                        await createGifForHtml(htmlPath, gifPath);
                    } catch (err) {
                        console.error(`❌ 錄製 ${file} 失敗:`, err);
                    }
                } else {
                    console.log(`⏩ ${file} 已有 GIF 預覽，自動跳過。`);
                }
            }
        }
    }
    console.log('🎉 所有動畫操作 GIF 生成完畢！');
}

processAllFiles();