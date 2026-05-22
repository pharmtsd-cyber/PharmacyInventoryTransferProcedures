// 👉 請填入你剛剛建立的「讀取調撥紀錄 API」網址
const GET_RECORDS_API_URL = "https://prod-XX.region.logic.azure.com:443/workflows/你的讀取API..."; 

document.addEventListener('DOMContentLoaded', () => {
    // 預設日期為今天
    const today = new Date().toISOString().split('T')[0];
    ['histStartDate', 'histEndDate', 'sapStartDate', 'sapEndDate'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.value = today;
    });

    document.getElementById('histSearchBtn')?.addEventListener('click', () => loadRecords('history'));
    document.getElementById('sapSearchBtn')?.addEventListener('click', () => loadRecords('sap'));
});

// ==========================================
// 1. 共用讀取與篩選邏輯
// ==========================================
async function loadRecords(mode) {
    const isHist = (mode === 'history');
    const prefix = isHist ? 'hist' : 'sap';
    const startDate = document.getElementById(`${prefix}StartDate`).value;
    const endDate = document.getElementById(`${prefix}EndDate`).value;
    
    if(!startDate || !endDate) { alert("請選擇完整的日期區間"); return; }

    document.getElementById(`${prefix}Loading`).classList.remove('hidden');
    document.getElementById(`${prefix}ResultList`).innerHTML = '';

    try {
        const response = await fetch(GET_RECORDS_API_URL, { method: 'GET' });
        if(!response.ok) throw new Error("讀取失敗");
        let records = await response.json();

        // 前端精準過濾日期區間 (將 API 回傳的 UTC 時間轉為本地比較)
        const start = new Date(startDate + "T00:00:00").getTime();
        const end = new Date(endDate + "T23:59:59").getTime();

        records = records.filter(item => {
            const t = new Date(item.timestamp).getTime();
            return t >= start && t <= end;
        });

        // 排序：新到舊
        records.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        if (isHist) {
            renderHistoryUI(records);
        } else {
            renderSapUI(records);
        }

    } catch(e) {
        alert("資料庫連線異常");
        console.error(e);
    } finally {
        document.getElementById(`${prefix}Loading`).classList.add('hidden');
    }
}

// ==========================================
// 2. 歷史查詢分頁渲染與通報邏輯
// ==========================================
function renderHistoryUI(records) {
    const listDiv = document.getElementById('histResultList');
    if(records.length === 0) {
        listDiv.innerHTML = '<div class="text-center text-muted">查無紀錄</div>'; return;
    }

    let html = '';
    records.forEach(item => {
        const timeStr = new Date(item.timestamp).toLocaleString();
        const hasNote = item.note && item.note.trim() !== '';
        // UI 渲染
        html += `
            <div class="card mb-2 p-3 shadow-sm border-start border-4 ${hasNote ? 'border-danger' : 'border-secondary'}">
                <div class="d-flex justify-content-between align-items-center mb-1">
                    <div>
                        <strong class="text-dark me-2">${item.drugCode}</strong>
                        <span class="text-muted small">${item.drugName}</span>
                    </div>
                    <span class="badge bg-light text-dark">${timeStr}</span>
                </div>
                <div class="row align-items-center mt-2">
                    <div class="col-8 small text-muted">
                        <div>🔄 ${item.outDept} ➔ ${item.inDept} | Qty: <strong class="text-dark fs-6">${item.quantity}</strong></div>
                        <div>👤 發起人：${item.operatorName} (${item.operatorId})</div>
                        ${hasNote ? `<div class="text-danger mt-1 fw-bold">⚠️ 異常備註：${item.note}</div>` : ''}
                        ${item.status === '異常通報' ? `<span class="badge bg-danger mt-1">已通報異常</span>` : ''}
                    </div>
                    <div class="col-4 text-end">
                        <button class="btn btn-sm btn-outline-danger" onclick="reportAnomaly(${item.id})">🚨 通報異常</button>
                    </div>
                </div>
            </div>`;
    });
    listDiv.innerHTML = html;
}

window.reportAnomaly = async function(id) {
    const note = prompt("請輸入通報異常原因 (將通知藥庫)：");
    if(!note) return;

    try {
        const payload = { action: "report", itemId: id, remark: note };
        const res = await fetch(API_URL, { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
        if(!res.ok) throw new Error();
        alert("✅ 通報成功！");
        document.getElementById('histSearchBtn').click(); // 自動重整清單
    } catch(e) { alert("通報失敗，請檢查網路"); }
};

// ==========================================
// 3. SAP 作業分頁渲染與註記邏輯
// ==========================================
function renderSapUI(records) {
    const listDiv = document.getElementById('sapResultList');
    
    // 只保留未被處理過的資料
    const pendingRecords = records.filter(r => !r.processStatus || r.processStatus === '未處理');
    
    if(pendingRecords.length === 0) {
        listDiv.innerHTML = '<div class="text-center text-muted">目前查無未處理之調撥項目</div>'; return;
    }

    // 依據調撥流向分群
    const grouped = pendingRecords.reduce((acc, item) => {
        const key = `${item.outDept} ➔ ${item.inDept}`;
        if(!acc[key]) acc[key] = [];
        acc[key].push(item);
        return acc;
    }, {});

    let html = '';
    for (const [direction, items] of Object.entries(grouped)) {
        html += `
            <div class="mb-4 bg-white border rounded shadow-sm">
                <div class="bg-dark text-white p-2 px-3 rounded-top d-flex justify-content-between align-items-center">
                    <h6 class="mb-0 fw-bold">流向：${direction} <span class="badge bg-light text-dark ms-2">${items.length} 筆</span></h6>
                </div>
                <div class="p-3">
        `;
        
        items.forEach(item => {
            const timeStr = new Date(item.timestamp).toLocaleString();
            // 檢查是否無 SAP 碼
            const isMissingSap = !item.sap || item.sap === '未知';
            
            html += `
                <div class="row align-items-center border-bottom py-2" id="sap-row-${item.id}">
                    <div class="col-6">
                        <strong class="${isMissingSap ? 'text-danger' : 'text-primary'}">${item.drugCode}</strong>
                        ${isMissingSap ? `<span class="badge bg-danger ms-2 blink">缺 SAP 碼！請更新藥品清單</span>` : `<small class="text-muted ms-1">(${item.sap})</small>`}
                        <div class="small text-muted text-truncate" title="${item.drugName}">${item.drugName}</div>
                        <div class="small text-secondary">${timeStr} | 👤 ${item.operatorName}</div>
                    </div>
                    <div class="col-2 text-center fs-5 fw-bold text-dark">${item.quantity}</div>
                    <div class="col-4 text-end">
                        <button class="btn btn-sm btn-outline-success me-1" onclick="markSap(${item.id}, '入SAP', this)" ${isMissingSap ? 'disabled' : ''}>入 SAP</button>
                        <button class="btn btn-sm btn-outline-secondary" onclick="markSap(${item.id}, '不入SAP', this)">不入 SAP</button>
                    </div>
                </div>`;
        });
        html += `</div></div>`;
    }
    listDiv.innerHTML = html;
}

window.markSap = async function(id, status, btnElement) {
    // 權限二次防呆 (確保只有主管/藥庫人員能操作)
    if(!window.currentUser.isSpecial) {
        alert("權限不足，僅限藥庫與管理員操作"); return;
    }

    btnElement.disabled = true;
    const originalText = btnElement.innerText;
    btnElement.innerText = "寫入中...";

    try {
        const payload = { 
            action: "updateSap", 
            itemId: id, 
            mode: status, 
            operatorId: window.currentUser.empId, 
            operatorName: window.currentUser.name 
        };
        const res = await fetch(API_URL, { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
        if(!res.ok) throw new Error();
        
        // 單筆資料更新完成後，外觀變綠/變灰，但不立刻重整畫面 (符合你的需求 5)
        const row = document.getElementById(`sap-row-${id}`);
        row.classList.add('bg-light', 'opacity-50');
        row.querySelectorAll('button').forEach(b => b.classList.add('hidden'));
        
        const badge = document.createElement('span');
        badge.className = `badge ${status === '入SAP' ? 'bg-success' : 'bg-secondary'} ms-auto`;
        badge.innerText = `已標記：${status}`;
        row.querySelector('.col-4').appendChild(badge);

    } catch(e) { 
        alert("標記失敗，請檢查網路"); 
        btnElement.disabled = false;
        btnElement.innerText = originalText;
    }
};
