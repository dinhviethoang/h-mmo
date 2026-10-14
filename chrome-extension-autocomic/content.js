console.log("=== Auto Comic GPT Grabber v5 ĐÃ LOAD ===");

async function getBase64(url) {
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
        });
    } catch(e) {
        return url;
    }
}

const extractDataAndSend = async () => {
    const btn = document.getElementById('autocomic-btn');
    btn.innerText = '⏳ v5 quét...';

    // ========== THU THẬP DỮ LIỆU THÔ ==========
    // Tìm TẤT CẢ ảnh lớn trên trang
    const allImgs = Array.from(document.querySelectorAll('img')).filter(img => {
        const r = img.getBoundingClientRect();
        return (r.width > 100 || img.naturalWidth > 200) && !img.src.includes('avatar');
    });

    if (allImgs.length === 0) {
        alert('Không tìm thấy ảnh nào!');
        btn.innerText = '🚀 Gửi (v5)';
        return;
    }

    // ========== CHIẾN THUẬT MỚI: Với mỗi ảnh, leo lên tìm thẻ CHA ĐỜI CAO NHẤT có chứa text ==========
    const scenes = [];
    let debugText = `=== v5 DEBUG === Tìm thấy ${allImgs.length} ảnh lớn\n`;

    for (let imgIdx = 0; imgIdx < allImgs.length; imgIdx++) {
        const img = allImgs[imgIdx];
        let bestText = '';
        let bestLevel = -1;
        
        // Leo lên tối đa 20 bậc, ghi nhận MỌI tầng có text
        let node = img.parentElement;
        for (let level = 0; level < 20 && node && node !== document.body; level++) {
            const raw = node.innerText;
            if (raw && raw.trim().length > 20) {
                bestText = raw.trim();
                bestLevel = level;
                
                // Nếu text dài trên 50 ký tự, đây chắc chắn là khung tin nhắn
                if (raw.trim().length > 50) break;
            }
            node = node.parentElement;
        }
        
        // Dọn dẹp text
        let cleanText = bestText
            .replace(/Here('s| is) (the|your) (image|illustration|picture)[^\n]*/gi, '')
            .replace(/I('ve| have) (created|generated|drawn|illustrated)[^\n]*/gi, '')
            .replace(/Image Prompt:[^\n]*/gi, '')
            .replace(/Cảnh \d+:/gi, '')
            .replace(/Scene \d+:/gi, '')
            .replace(/Text:/gi, '')
            .replace(/\*\*/g, '').replace(/\*/g, '')
            .replace(/^Edit$/gm, '')
            .replace(/^\d+\s*\/\s*\d+$/gm, '') // Bỏ "1 / 2" pagination
            .split('\n')
            .map(l => l.trim())
            .filter(l => l.length > 5)
            .join(' ')
            .trim();
        
        const preview = cleanText.substring(0, 80) || '⚠️ TRỐNG';
        debugText += `\nẢnh ${imgIdx + 1} (leo ${bestLevel} tầng): "${preview}..."`;
        
        scenes.push({ img, text: cleanText });
    }

    // ========== HIỆN DEBUG VÀ HỎI SỐ LƯỢNG ==========
    console.log(debugText);
    
    let confirmMsg = `🔍 v6 DEBUG - Đã tìm được CHỮ thành công!\n`;
    for (let i = 0; i < scenes.length; i++) {
        const t = scenes[i].text.substring(0, 50) || '⚠️ TRỐNG';
        confirmMsg += `\nCảnh ${i + 1}: "${t}..."`;
    }
    confirmMsg += `\n\n✅ Tổng cộng có ${scenes.length} cảnh trên trang.\n👉 Bạn muốn lấy bao nhiêu cảnh MỚI NHẤT ở dưới cùng? (Nhập số và bấm OK):`;
    
    const userInp = prompt(confirmMsg, scenes.length);
    
    if (userInp === null) {
        btn.innerText = '🚀 Gửi (v6)';
        return;
    }

    let numToTake = parseInt(userInp);
    if (isNaN(numToTake) || numToTake <= 0) numToTake = scenes.length;
    
    // Cắt lấy N cảnh cuối cùng
    const finalScenes = scenes.slice(-numToTake);

    // ========== CHUYỂN ĐỔI & GỬI ==========
    const storyScenes = [];
    for (let i = 0; i < finalScenes.length; i++) {
        btn.innerText = `⏳ Ảnh ${i + 1}/${finalScenes.length}...`;
        const base64 = await getBase64(finalScenes[i].img.src);
        
        let dialogues = [];
        if (finalScenes[i].text.length > 10) {
            dialogues = finalScenes[i].text.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s.length > 5);
        }
        if (dialogues.length === 0) dialogues = ['Cảnh này không có lời thoại.'];
        
        storyScenes.push({ id: i + 1, dialogues, image_url: base64 });
    }

    try {
        const res = await fetch('http://localhost:8888/api/create-comic', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ story: storyScenes })
        });
        const json = await res.json();
        if (json.success) {
            alert(`✅ Gửi ${storyScenes.length} cảnh thành công!`);
        } else {
            alert('Lỗi: ' + json.error);
        }
    } catch (e) {
        alert('❌ Không kết nối được App: ' + e.message);
    }
    btn.innerText = '🚀 Gửi (v6)';
};

const createFloatingButton = () => {
    if (document.getElementById('autocomic-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'autocomic-btn';
    btn.innerText = '🚀 Gửi (v6)';
    btn.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:999999;padding:15px 25px;background:#ec4899;color:white;border:none;border-radius:12px;cursor:pointer;font-weight:bold;font-size:16px;box-shadow:0 10px 15px -3px rgba(0,0,0,0.5);transition:all 0.2s';
    btn.onmouseover = () => btn.style.transform = 'scale(1.05)';
    btn.onmouseout = () => btn.style.transform = 'scale(1)';
    btn.onclick = extractDataAndSend;
    document.body.appendChild(btn);
};

const observer = new MutationObserver(() => createFloatingButton());
observer.observe(document.body, { childList: true, subtree: true });
createFloatingButton();
