const fs = require('fs');
const path = require('path');

// 🌟 請將您的 API Key 貼在此處（或設為環境變數 GEMINI_API_KEY）
// 🌟 保持這樣即可，絕對不要將明文金鑰貼在這裡
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

const rootDir = __dirname;
const ignoreDirs = ['.git', '.vercel', 'node_modules'];

// 💡 動態偵測線上最新的 Flash 模型名稱 (Node.js 版)
async function getLatestFlashModelName() {
    const defaultModel = "gemini-flash-lite-latest";
    if (!GEMINI_API_KEY || GEMINI_API_KEY === "貼上你的_GEMINI_API_KEY") return defaultModel;

    const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`;
    
    try {
        const response = await fetch(listUrl);
        if (!response.ok) {
            console.warn(`⚠️ 取得模型清單失敗 [HTTP ${response.status}]，改用預設值: ${defaultModel}`);
            return defaultModel;
        }
        
        const result = await response.json();
        
        if (result.models && Array.isArray(result.models)) {
            const flashModels = result.models
                .filter(m => {
                    const name = m.name.toLowerCase();
                    const hasGen = m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent");
                    const isFlash = name.includes("flash");
                    
                    // 排除非純文字/代碼分析的模型
                    const isExcluded = name.includes("tts") || name.includes("image") || name.includes("computer-use") || name.includes("omni") || name.includes("exp");
                    return hasGen && isFlash && !isExcluded;
                })
                .map(m => m.name.replace("models/", ""));

            if (flashModels.length > 0) {
                // 自然排序：版號新、數字大的排在最前面
                flashModels.sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' }));
                console.log(`🤖 動態偵測到的最新 Flash 模型: [${flashModels[0]}]`);
                return flashModels[0];
            }
        }
    } catch (err) {
        console.warn(`⚠️ 取得模型清單發生錯誤: ${err.message}，使用預設值`);
    }

    return defaultModel;
}

// 💡 呼叫 Gemini API 分析程式碼（支援多模型輪詢備援）
async function analyzeCodeWithGemini(htmlContent) {
    const dynamicModel = await getLatestFlashModelName();
    
    // 建立候選模型清單（優先 Lite 節省額度，失敗則自動降級備援）
    const candidateModels = Array.from(new Set([
        "gemini-flash-lite-latest",  // 1. 強制優先選用 Lite（速度快、省額度）
        dynamicModel,                // 2. 動態偵測到的最新版 Flash 模型
        "gemini-flash-latest",       // 3. Standard Flash 最新版 (高辨識率)
        "gemini-3.6-flash",          // 4. 新世代強大模型備援
        "gemini-2.5-flash"           // 5. 保底備援
    ].filter(Boolean)));

    // 截取前 4000 字元（包含關鍵 Canvas 邏輯與物理公式）
    const codeSnippet = htmlContent.slice(0, 4000);

    const prompt = `你是一位專業的高中與大學物理老師。
請閱讀下方這段 HTML/JavaScript 物理互動動畫程式碼，分析它的物理學觀念與互動功能。

請嚴格輸出 JSON 格式，不要包含任何 markdown 標籤或多餘字串，格式規範如下：
{
  "title": "精簡中文標題 (10字以內)",
  "desc": "簡短說明與操作提示 (30字以內)"
}

程式碼內容：
${codeSnippet}`;

    let lastError = null;

    // 逐一嘗試候選模型（Fallback 機制）
    for (const modelName of candidateModels) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`;
        
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { 
                        responseMimeType: "application/json" // 強制回傳 JSON
                    }
                })
            });

            if (response.ok) {
                const data = await response.json();
                const jsonString = data.candidates[0].content.parts[0].text;
                return JSON.parse(jsonString);
            } else {
                const errText = await response.text();
                lastError = new Error(`[${modelName}] HTTP ${response.status}: ${errText}`);
                console.warn(`⚠️ 模型 [${modelName}] 呼叫失敗，嘗試下一順位備援模型...`);
            }
        } catch (err) {
            lastError = err;
            console.warn(`⚠️ 模型 [${modelName}] 發生網路或解析錯誤，嘗試下一順位備援模型...`);
        }
    }

    throw new Error(`所有備援模型皆嘗試失敗。最後一次錯誤: ${lastError?.message}`);
}

async function processHtmlFiles() {
    if (!GEMINI_API_KEY || GEMINI_API_KEY === "貼上你的_GEMINI_API_KEY") {
        console.error("❌ 請先在 auto-label-gemini.js 中填入有效的 GEMINI_API_KEY！");
        return;
    }

    const items = fs.readdirSync(rootDir);

    for (const item of items) {
        const itemPath = path.join(rootDir, item);
        if (fs.statSync(itemPath).isDirectory() && !ignoreDirs.includes(item)) {
            const files = fs.readdirSync(itemPath).filter(f => f.endsWith('.html'));

            for (const file of files) {
                const filePath = path.join(itemPath, file);
                let content = fs.readFileSync(filePath, 'utf-8');

                const hasTitle = /<title>(.*?)<\/title>/i.test(content);
                const hasDesc = /<meta\s+name=["']description["']/i.test(content);

                if (!hasTitle || !hasDesc) {
                    console.log(`🤖 正在分析 ${file} 的物理內容...`);
                    try {
                        const { title, desc } = await analyzeCodeWithGemini(content);

                        const newTags = `\n    <title>${title}</title>\n    <meta name="description" content="${desc}">`;

                        if (content.includes('<head>')) {
                            content = content.replace('<head>', '<head>' + newTags);
                        } else {
                            content = newTags + '\n' + content;
                        }

                        fs.writeFileSync(filePath, content, 'utf-8');
                        console.log(`✅ ${file} 自動標記成功 ➔ 標題: [${title}] | 說明: [${desc}]`);
                    } catch (err) {
                        console.error(`❌ ${file} 分析失敗:`, err.message);
                    }
                } else {
                    console.log(`⏩ ${file} 已有標題與說明，自動跳過。`);
                }
            }
        }
    }
    console.log("🎉 所有動畫檔案 AI 自動標記完成！");
}

processHtmlFiles();