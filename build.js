const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const ignoreDirs = ['.git', '.vercel', 'node_modules'];

// 單元分類中文對照（可自由增修資料夾名稱）
const categoryNames = {
    'mechanics': '📘 基礎力學',
    'electromagnetism': '🧲 電磁學',
    'optics': '💡 光學',
    'waves': '🌊 波動與聲學',
    'thermodynamics': '🔥 熱學與分子動力',
    'modern-physics': '⚛️ 近代物理'
};

let categoriesHtml = '';
let filterButtonsHtml = `<button class="filter-btn active" onclick="filterCategory('all', this)">全部動畫</button>`;

const items = fs.readdirSync(rootDir);

items.forEach(item => {
    const itemPath = path.join(rootDir, item);
    if (fs.statSync(itemPath).isDirectory() && !ignoreDirs.includes(item)) {
        const files = fs.readdirSync(itemPath).filter(f => f.endsWith('.html'));
        if (files.length === 0) return;

        const categoryTitle = categoryNames[item] || `📂 ${item}`;
        filterButtonsHtml += `<button class="filter-btn" onclick="filterCategory('${item}', this)">${categoryTitle}</button>`;

        let cardsHtml = '';

        files.forEach(file => {
            const filePath = path.join(itemPath, file);
            const content = fs.readFileSync(filePath, 'utf-8');
            
            const titleMatch = content.match(/<title>(.*?)<\/title>/i);
            const descMatch = content.match(/<meta\s+name=["']description["']\s+content=["'](.*?)["']/i);

            const title = titleMatch ? titleMatch[1] : file.replace('.html', '');
            const desc = descMatch ? descMatch[1] : '點擊開始互動動畫';
            const relPath = `${item}/${file}`;

            // 自動尋找同名預覽圖檔
            const baseName = file.replace('.html', '');
            const extTypes = ['.gif', '.png', '.jpg', '.jpeg', '.webp'];
            let imgPath = '';

            for (let ext of extTypes) {
                if (fs.existsSync(path.join(itemPath, baseName + ext))) {
                    imgPath = `${item}/${baseName}${ext}`;
                    break;
                }
            }

            const imgHtml = imgPath 
                ? `<img src="${imgPath}" alt="${title}" class="card-img">`
                : `<div class="card-img-placeholder">⚡ ${title}</div>`;

            cardsHtml += `
            <a href="${relPath}" class="card" data-category="${item}" data-keywords="${title} ${desc}" target="_blank">
                ${imgHtml}
                <div class="card-body">
                    <h3>${title}</h3>
                    <p>${desc}</p>
                    <span class="btn-tag">開啟動畫 ↗</span>
                </div>
            </a>`;
        });

        categoriesHtml += `
        <div class="category-block" id="cat-${item}">
            <div class="category-title">${categoryTitle}</div>
            <div class="grid">${cardsHtml}</div>
        </div>`;
    }
});

const fullHtml = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>物理互動動畫教學大廳</title>
    <style>
        * { box-sizing: border-box; }
        body { font-family: system-ui, -apple-system, sans-serif; background-color: #f4f6f9; margin: 0; padding: 20px; color: #2d3748; }
        .header-container { max-width: 1200px; margin: 0 auto 30px; text-align: center; }
        h1 { color: #1a365d; font-size: 2.2rem; margin-bottom: 20px; }
        
        .controls { display: flex; flex-direction: column; align-items: center; gap: 15px; margin-bottom: 30px; }
        .search-input { width: 100%; max-width: 500px; padding: 12px 20px; font-size: 1.1rem; border: 2px solid #cbd5e0; border-radius: 25px; outline: none; transition: border 0.2s; }
        .search-input:focus { border-color: #3182ce; box-shadow: 0 0 0 3px rgba(49,130,206,0.2); }
        .filter-group { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; }
        .filter-btn { padding: 8px 18px; border: none; background: #e2e8f0; color: #4a5568; border-radius: 20px; font-size: 1rem; cursor: pointer; transition: all 0.2s; }
        .filter-btn.active, .filter-btn:hover { background: #3182ce; color: white; }

        .main-container { max-width: 1200px; margin: 0 auto; }
        .category-block { margin-bottom: 40px; }
        .category-title { font-size: 1.5rem; color: #2b6cb0; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; margin-bottom: 20px; font-weight: bold; }
        
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 20px; }
        .card { background: white; border-radius: 12px; overflow: hidden; text-decoration: none; color: inherit; box-shadow: 0 4px 6px rgba(0,0,0,0.05); transition: transform 0.2s, box-shadow 0.2s; display: flex; flex-direction: column; }
        .card:hover { transform: translateY(-5px); box-shadow: 0 10px 20px rgba(0,0,0,0.12); }
        
        .card-img { width: 100%; height: 150px; object-fit: cover; background-color: #edf2f7; }
        .card-img-placeholder { width: 100%; height: 150px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; font-weight: bold; padding: 10px; text-align: center; }
        
        .card-body { padding: 15px; display: flex; flex-direction: column; flex-grow: 1; justify-content: space-between; }
        .card h3 { margin: 0 0 8px 0; font-size: 1.2rem; color: #1a202c; }
        .card p { margin: 0 0 15px 0; color: #718096; font-size: 0.9rem; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .btn-tag { align-self: flex-end; font-size: 0.85rem; color: #3182ce; font-weight: bold; }
    </style>
</head>
<body>

    <div class="header-container">
        <h1>⚡ 物理互動動畫大廳</h1>
        <div class="controls">
            <input type="text" id="searchInput" class="search-input" placeholder="🔍 搜尋動畫名稱或關鍵字..." oninput="handleSearch()">
            <div class="filter-group">
                ${filterButtonsHtml}
            </div>
        </div>
    </div>

    <div class="main-container">
        ${categoriesHtml}
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

fs.writeFileSync(path.join(rootDir, 'index.html'), fullHtml, 'utf-8');
console.log('✅ index.html 已成功自動生成！');