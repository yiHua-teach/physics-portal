const fs = require('fs');
const path = require('path');

// 🌟 請將您的 API Key 貼在此處（或設為環境變數）
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "貼上你的_GEMINI_API_KEY";
const MODEL_NAME = "gemini-2.5-flash"; // 使用最新且快速的 Flash 模型

const rootDir = __dirname;
const ignoreDirs = ['.git', '.vercel', 'node_modules'];

// 呼叫 Gemini API 分析 HTML 程式碼
async function analyzeCodeWithGemini(htmlContent) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${GEMINI_API_KEY}`;
    
    // 截取前 4000 字元（已足夠包含關鍵的 Canvas 邏輯與物理公式）
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

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { 
                responseMimeType: "application/json" // 🌟 強制 Gemini 直接輸出標準 JSON
            }
        })
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`API 請求失敗 [${response.status}]: ${errText}`);
    }

    const data = await response.json();
    const jsonString = data.candidates[0].content.parts[0].text;
    return JSON.parse(jsonString);
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

                // 只針對尚未包含完整標題或說明的 HTML 檔案進行分析
                if (!hasTitle || !hasDesc) {
                    console.log(`🤖 正在傳送 ${file} 給 Gemini 分析物理內容...`);
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