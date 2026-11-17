const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const ignoreDirs = ['.git', '.vercel', 'node_modules', 'gas', 'shared'];

// 單元分類中文對照（可自由增修資料夾名稱）
const categoryNames = {
    'mechanics': '📘 基礎力學',
    'electromagnetism': '🧲 電磁學',
    'optics': '💡 光學',
    'waves': '🌊 波動與聲學',
    'thermodynamics': '🔥 熱學與分子動力',
    'modern-physics': '⚛️ 近代物理',
    'games': '🧪 化學週期表遊戲'
};

const simGroups = {};
const gameGroups = {};
let simTotal = 0;
let gameTotal = 0;

const items = fs.readdirSync(rootDir);

items.forEach(item => {
    const itemPath = path.join(rootDir, item);
    if (!fs.statSync(itemPath).isDirectory() || ignoreDirs.includes(item)) return;

    const files = fs.readdirSync(itemPath).filter(f => f.endsWith('.html'));
    if (files.length === 0) return;

    files.forEach(file => {
        const filePath = path.join(itemPath, file);
        const content = fs.readFileSync(filePath, 'utf-8');

        const titleMatch = content.match(/<title>(.*?)<\/title>/i);
        const descMatch = content.match(/<meta\s+name=["']description["']\s+content=["'](.*?)["']/i);
        const typeMatch = content.match(/<meta\s+name=["']portal-type["']\s+content=["'](.*?)["']/i);

        const title = titleMatch ? titleMatch[1] : file.replace('.html', '');
        const desc = descMatch ? descMatch[1] : '點擊開始互動動畫';
        const portalType = typeMatch ? typeMatch[1].trim().toLowerCase() : '';
        const relPath = `${item}/${file}`;

        // 自動尋找同名預覽圖檔
        const baseName = file.replace('.html', '');
        const extTypes = ['.gif', '.png', '.jpg', '.jpeg', '.webp'];
        let imgPath = '';

        for (const ext of extTypes) {
            if (fs.existsSync(path.join(itemPath, baseName + ext))) {
                imgPath = `${item}/${baseName}${ext}`;
                break;
            }
        }

        const entry = { item, file, title, desc, relPath, imgPath };
        if (portalType === 'editor' || portalType === 'tool') {
            return;
        }
        const isGame = portalType === 'game' || item.toLowerCase() === 'games';

        if (isGame) {
            if (!gameGroups[item]) gameGroups[item] = [];
            gameGroups[item].push(entry);
            gameTotal++;
        } else {
            if (!simGroups[item]) simGroups[item] = [];
            simGroups[item].push(entry);
            simTotal++;
        }
    });
});

function buildSectionContent(groups, ctaLabel, placeholderIcon) {
    let categoriesHtml = '';
    let filterButtonsHtml = `<button class="filter-btn active" onclick="filterCategory('all', this)">全部顯示</button>`;

    Object.keys(groups).forEach(catKey => {
        const entries = groups[catKey];
        if (!entries || entries.length === 0) return;

        const categoryTitle = categoryNames[catKey] || `📂 ${catKey}`;
        filterButtonsHtml += `<button class="filter-btn" onclick="filterCategory('${catKey}', this)">${categoryTitle}</button>`;

        let cardsHtml = '';
        entries.forEach(entry => {
            const imgHtml = entry.imgPath
                ? `<img src="${entry.imgPath}" alt="${entry.title}" class="card-img">`
                : `<div class="card-img-placeholder">${placeholderIcon} ${entry.title}</div>`;

            cardsHtml += `
            <a href="${entry.relPath}" class="card" data-category="${entry.item}" data-keywords="${entry.title} ${entry.desc}" target="_blank">
                ${imgHtml}
                <div class="card-body">
                    <h3>${entry.title}</h3>
                    <p>${entry.desc}</p>
                    <span class="btn-tag">${ctaLabel}</span>
                </div>
            </a>`;
        });

        categoriesHtml += `
        <div class="category-block" id="cat-${catKey}">
            <div class="category-title">${categoryTitle}</div>
            <div class="grid">${cardsHtml}</div>
        </div>`;
    });

    return { categoriesHtml, filterButtonsHtml };
}

function renderPortalPage({
    pageTitle,
    heading,
    subtitle,
    activeMode,
    groups,
    ctaLabel,
    placeholderIcon,
    accentColor,
    headingColor,
    extraHeaderHtml = ''
}) {
    const { categoriesHtml, filterButtonsHtml } = buildSectionContent(groups, ctaLabel, placeholderIcon);
    const emptyStateHtml = !categoriesHtml
        ? `<div class="empty-state">目前尚無項目，敬請期待！</div>`
        : categoriesHtml;

    return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${pageTitle}</title>
    <style>
        * { box-sizing: border-box; }
        :root {
            --accent: ${accentColor};
            --heading-color: ${headingColor};
        }
        body { font-family: system-ui, -apple-system, sans-serif; background-color: #f4f6f9; margin: 0; padding: 20px; color: #2d3748; }
        .header-container { max-width: 1200px; margin: 0 auto 28px; text-align: center; }
        h1 { color: var(--heading-color); font-size: 2.2rem; margin: 0 0 8px; }
        .subtitle { color: #64748b; font-size: 0.98rem; margin: 0 0 20px; }

        .portal-nav {
            display: inline-flex;
            background: #e2e8f0;
            padding: 5px;
            border-radius: 999px;
            gap: 6px;
            margin-bottom: 22px;
            box-shadow: inset 0 1px 3px rgba(0,0,0,0.08);
        }
        .portal-tab {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 10px 22px;
            border-radius: 999px;
            text-decoration: none;
            font-weight: 700;
            font-size: 1rem;
            color: #475569;
            transition: all 0.2s ease;
        }
        .portal-tab:hover { color: #1e293b; background: rgba(255,255,255,0.6); }
        .portal-tab.active {
            background: var(--accent);
            color: #ffffff;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }
        .count-badge {
            font-size: 0.8rem;
            padding: 2px 8px;
            border-radius: 999px;
            background: rgba(15, 23, 42, 0.12);
        }
        .portal-tab.active .count-badge {
            background: rgba(255, 255, 255, 0.25);
            color: #ffffff;
        }

        .controls { display: flex; flex-direction: column; align-items: center; gap: 15px; margin-bottom: 26px; }
        .search-input { width: 100%; max-width: 500px; padding: 12px 20px; font-size: 1.05rem; border: 2px solid #cbd5e0; border-radius: 25px; outline: none; transition: border 0.2s; }
        .search-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(49,130,206,0.18); }
        .filter-group { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; }
        .filter-btn { padding: 8px 18px; border: none; background: #e2e8f0; color: #4a5568; border-radius: 20px; font-size: 0.95rem; cursor: pointer; transition: all 0.2s; font-weight: 600; }
        .filter-btn.active, .filter-btn:hover { background: var(--accent); color: white; }

        .main-container { max-width: 1200px; margin: 0 auto; }
        .category-block { margin-bottom: 40px; }
        .category-title { font-size: 1.45rem; color: var(--heading-color); border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 20px; font-weight: bold; }

        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 20px; }
        .card { background: white; border-radius: 12px; overflow: hidden; text-decoration: none; color: inherit; box-shadow: 0 4px 6px rgba(0,0,0,0.05); transition: transform 0.2s, box-shadow 0.2s; display: flex; flex-direction: column; border: 1px solid rgba(226,232,240,0.8); }
        .card:hover { transform: translateY(-5px); box-shadow: 0 10px 20px rgba(0,0,0,0.12); }

        .card-img { width: 100%; height: 150px; object-fit: cover; background-color: #edf2f7; }
        .card-img-placeholder { width: 100%; height: 150px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; font-weight: bold; padding: 10px; text-align: center; }

        .card-body { padding: 15px; display: flex; flex-direction: column; flex-grow: 1; justify-content: space-between; }
        .card h3 { margin: 0 0 8px 0; font-size: 1.15rem; color: #1a202c; }
        .card p { margin: 0 0 15px 0; color: #718096; font-size: 0.9rem; line-height: 1.45; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .btn-tag { align-self: flex-end; font-size: 0.85rem; color: var(--accent); font-weight: bold; }
        .empty-state { text-align: center; padding: 60px 20px; color: #64748b; font-size: 1.1rem; background: white; border-radius: 12px; }

        @media (max-width: 640px) {
            body { padding: 14px 10px; }
            h1 { font-size: 1.65rem; }
            .portal-tab { padding: 8px 16px; font-size: 0.92rem; }
            .search-input { font-size: 0.95rem; padding: 10px 16px; }
            .filter-btn { padding: 6px 14px; font-size: 0.88rem; }
            .category-title { font-size: 1.25rem; }
        }
    </style>
</head>
<body>

    <div class="header-container">
        <nav class="portal-nav" aria-label="頁面模式切換">
            <a href="index.html" class="portal-tab ${activeMode === 'sim' ? 'active' : ''}">
                🔬 教學模擬 <span class="count-badge">${simTotal}</span>
            </a>
            <a href="games.html" class="portal-tab ${activeMode === 'game' ? 'active' : ''}">
                🎮 物理遊戲 <span class="count-badge">${gameTotal}</span>
            </a>
        </nav>

        <h1>${heading}</h1>
        <p class="subtitle">${subtitle}</p>
        ${extraHeaderHtml}

        <div class="controls">
            <input type="text" id="searchInput" class="search-input" placeholder="🔍 搜尋名稱或關鍵字..." oninput="handleSearch()">
            <div class="filter-group">
                ${filterButtonsHtml}
            </div>
        </div>
    </div>

    <div class="main-container">
        ${emptyStateHtml}
    </div>

    <script>
        let currentCategory = 'all';

        function filterCategory(cat, btn) {
            currentCategory = cat;
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            applyFilters();
        }

        function handleSearch() {
            applyFilters();
        }

        function applyFilters() {
            const query = document.getElementById('searchInput').value.toLowerCase();
            const blocks = document.querySelectorAll('.category-block');

            blocks.forEach(block => {
                const blockCat = block.id.replace('cat-', '');
                const cards = block.querySelectorAll('.card');
                let hasVisibleCard = false;

                cards.forEach(card => {
                    const matchesCategory = (currentCategory === 'all' || blockCat === currentCategory);
                    const keywords = card.getAttribute('data-keywords').toLowerCase();
                    const matchesSearch = keywords.includes(query);

                    if (matchesCategory && matchesSearch) {
                        card.style.display = 'flex';
                        hasVisibleCard = true;
                    } else {
                        card.style.display = 'none';
                    }
                });

                block.style.display = hasVisibleCard ? 'block' : 'none';
            });
        }
    </script>
</body>
</html>`;
}

const simHtml = renderPortalPage({
    pageTitle: '物理互動動畫教學大廳',
    heading: '⚡ 物理互動動畫教學大廳',
    subtitle: '互動式物理模擬教具，支援大屏白板、電腦、平板與手機操作',
    activeMode: 'sim',
    groups: simGroups,
    ctaLabel: '開啟動畫 ↗',
    placeholderIcon: '⚡',
    accentColor: '#3182ce',
    headingColor: '#1a365d'
});

const gameHtml = renderPortalPage({
    pageTitle: '物理與化學互動遊戲大廳',
    heading: '🎮 理化互動挑戰遊戲大廳',
    subtitle: '結合物理光學與化學週期表的趣味闖關與共享排行榜遊戲',
    activeMode: 'game',
    groups: gameGroups,
    ctaLabel: '開始挑戰 🎮',
    placeholderIcon: '🎮',
    accentColor: '#7c3aed',
    headingColor: '#4c1d95',
    extraHeaderHtml: `
        <div style="display:flex;flex-wrap:wrap;justify-content:center;gap:10px;margin:0 auto 20px;">
            <a href="optics/reflection editor.html" target="_blank" style="display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:10px;background:#f3e8ff;color:#6b21a8;text-decoration:none;font-size:0.86rem;font-weight:700;border:1px solid #d8b4fe;">
                🛠️ 光學關卡編輯器（教師出題端） ↗
            </a>
            <a href="https://docs.google.com/spreadsheets/d/17izy_vJCd539R4V5VZIKdfsUMJ8DofpnyL9TL1KBdXo/edit" target="_blank" style="display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:10px;background:#ecfdf5;color:#065f46;text-decoration:none;font-size:0.86rem;font-weight:700;border:1px solid #6ee7b7;">
                🏆 共享排行榜 Google 試算表 ↗
            </a>
            <a href="https://docs.google.com/spreadsheets/d/18SjUr3EBKQxNu6GyNoPkZR5SIp-uJzjAWF-W-xMsXHU/edit" target="_blank" style="display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:10px;background:#eff6ff;color:#1e40af;text-decoration:none;font-size:0.86rem;font-weight:700;border:1px solid #93c5fd;">
                🗂️ 光學關卡 Google 試算表 ↗
            </a>
        </div>`
});

fs.writeFileSync(path.join(rootDir, 'index.html'), simHtml, 'utf-8');
fs.writeFileSync(path.join(rootDir, 'games.html'), gameHtml, 'utf-8');
console.log(`✅ index.html (教學模擬: ${simTotal} 項) 與 games.html (物理遊戲: ${gameTotal} 項) 已成功自動生成！`);
