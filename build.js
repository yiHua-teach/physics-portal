const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const ignoreDirs = ['.git', '.vercel', 'node_modules', 'gas', 'shared'];
const githubRepoBase = 'https://github.com/yiHua-teach/physics-portal/blob/main';

// 單元分類中文標籤與預設徽章（可自由擴充資料夾）
const categoryMetaDefaults = {
    'mechanics': { label: '基礎力學', badge: '力學模擬' },
    'waves': { label: '波動與聲學', badge: '波動模擬' },
    'optics': { label: '光學', badge: '光學模擬' },
    'thermodynamics': { label: '熱學與分子動力', badge: '熱學模擬' },
    'physics-tracker': { label: '滑車運動分析', badge: '實驗與感測' },
    'electromagnetism': { label: '電磁學', badge: '電磁模擬' },
    'chemistry': { label: '化學', badge: '化學模擬' },
    'modern-physics': { label: '近代物理', badge: '近代物理' },
    'games': { label: '理化遊戲', badge: '互動挑戰' }
};

function extractMetaContent(html, name) {
    const regex1 = new RegExp(`<meta\\s+[^>]*name=["']${name}["'][^>]*content=["']([^"']*)["'][^>]*>`, 'i');
    const regex2 = new RegExp(`<meta\\s+[^>]*content=["']([^"']*)["'][^>]*name=["']${name}["'][^>]*>`, 'i');
    const m = html.match(regex1) || html.match(regex2);
    return m ? m[1].trim() : '';
}

const projects = [];
const categoryCounts = {
    'mechanics': 0,
    'waves': 0,
    'optics': 0,
    'thermodynamics': 0,
    'physics-tracker': 0,
    'electromagnetism': 0,
    'chemistry': 0,
    'modern-physics': 0,
    'games': 0
};

// 依照固定顯示順序優先掃描，其他新資料夾接著掃描
const preferredOrder = Object.keys(categoryMetaDefaults);
const dirItems = fs.readdirSync(rootDir).filter(item => {
    const itemPath = path.join(rootDir, item);
    return fs.statSync(itemPath).isDirectory() && !ignoreDirs.includes(item);
});

dirItems.sort((a, b) => {
    const idxA = preferredOrder.indexOf(a);
    const idxB = preferredOrder.indexOf(b);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.localeCompare(b, 'zh-TW');
});

dirItems.forEach(item => {
    const itemPath = path.join(rootDir, item);
    const files = fs.readdirSync(itemPath).filter(f => f.endsWith('.html')).sort();
    if (files.length === 0) return;

    files.forEach(file => {
        const filePath = path.join(itemPath, file);
        const content = fs.readFileSync(filePath, 'utf-8');

        const titleMatch = content.match(/<title>(.*?)<\/title>/i);
        const title = titleMatch ? titleMatch[1].trim() : file.replace(/\.html$/i, '');
        const desc = extractMetaContent(content, 'description') || '點擊開啟互動教學實驗與即時視覺模擬';
        const portalType = extractMetaContent(content, 'portal-type').toLowerCase();
        const customBadge = extractMetaContent(content, 'portal-badge');
        const customTagsRaw = extractMetaContent(content, 'portal-tags');
        const featured = extractMetaContent(content, 'portal-featured').toLowerCase() === 'true';

        // 編輯器或教師輔助工具不列入學生探索卡片（集中放在教師工具彈窗）
        if (portalType === 'editor' || portalType === 'tool') {
            return;
        }

        const isGame = portalType === 'game' || item.toLowerCase() === 'games';
        const category = isGame ? 'games' : item;

        // 自動尋找同名預覽圖檔
        const baseName = file.replace(/\.html$/i, '');
        const extTypes = ['.gif', '.png', '.jpg', '.jpeg', '.webp'];
        let imgRelPath = '';
        for (const ext of extTypes) {
            if (fs.existsSync(path.join(itemPath, baseName + ext))) {
                imgRelPath = `${item}/${baseName}${ext}`;
                break;
            }
        }

        const relPath = `${item}/${file}`;
        const folderDefault = categoryMetaDefaults[item] || { label: item, badge: '互動教材' };
        const catDefault = categoryMetaDefaults[category] || folderDefault;

        // 組合標籤（優先讀取 <meta name="portal-tags">，否則自動依資料夾與遊戲分類補齊）
        const tagSet = new Set();
        if (customTagsRaw) {
            customTagsRaw.split(',').map(t => t.trim()).filter(Boolean).forEach(t => tagSet.add(t));
        } else {
            tagSet.add(folderDefault.label);
            if (isGame) {
                tagSet.add('理化遊戲');
                if (item === 'games') tagSet.add('化學週期表');
            } else {
                tagSet.add('互動模擬');
            }
            if (/3D/i.test(file) || /3D/i.test(title)) {
                tagSet.add('3D視覺');
            }
        }

        const badge = customBadge || (isGame ? '互動挑戰' : folderDefault.badge);

        projects.push({
            id: `${item}/${baseName}`,
            title,
            category,
            sourceFolder: item,
            badge,
            description: desc,
            tags: Array.from(tagSet),
            demoUrl: encodeURI(relPath),
            imgUrl: imgRelPath ? encodeURI(imgRelPath) : '',
            repoUrl: `${githubRepoBase}/${encodeURI(relPath)}`,
            featured: featured || isGame || /3D/i.test(title)
        });

        categoryCounts[category] = (categoryCounts[category] || 0) + 1;
    });
});

// 讀取 3D 實驗室樣板並注入掃描到的資料
const templatePath = path.join(rootDir, 'portal.template.html');
if (!fs.existsSync(templatePath)) {
    throw new Error('找不到 portal.template.html，無法生成 index.html');
}

let portalHtml = fs.readFileSync(templatePath, 'utf-8');
portalHtml = portalHtml
    .replace('/*__PROJECTS_DATA__*/[]', JSON.stringify(projects, null, 4))
    .replace('/*__CATEGORY_COUNTS__*/{}', JSON.stringify(categoryCounts, null, 4));

fs.writeFileSync(path.join(rootDir, 'index.html'), portalHtml, 'utf-8');

// 保留相容的 games.html 自動導向至 3D 實驗室遊戲區
const gamesRedirectHtml = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="refresh" content="0;url=index.html#games">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>前往華爸的物理園地 - 理化遊戲專區</title>
    <style>
        body { font-family: system-ui, sans-serif; background: #070a12; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; text-align: center; }
        a { color: #38bdf8; font-weight: 700; }
    </style>
</head>
<body>
    <div>
        <p>正在前往「華爸的物理園地」理化遊戲專區...</p>
        <p><a href="index.html#games">若未自動跳轉，請點擊這裡進入 ↗</a></p>
    </div>
    <script>window.location.replace('index.html#games');</script>
</body>
</html>
`;
fs.writeFileSync(path.join(rootDir, 'games.html'), gamesRedirectHtml, 'utf-8');

const summary = Object.entries(categoryCounts)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');
console.log(`✅ index.html 與 games.html 已成功自動生成！總計 ${projects.length} 項（${summary}）`);
