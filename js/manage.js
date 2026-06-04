// 👉 請填入你的「讀取調撥紀錄 API」網址
const GET_RECORDS_API_URL = "https://defaultf611cf53b6864814b03558908d4900.be.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/222b3b63e0244b6ea7e8f1768594ab45/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=nT2eDEqXKh7eeKPmywbAvbPE_WWLXxX98Hm93OCvCio"; 

document.addEventListener('DOMContentLoaded', () => {
    // 預設日期為今天
    const today = new Date().toISOString().split('T')[0];
    const startInput = document.getElementById('histStartDate');
    const endInput = document.getElementById('histEndDate');
    if (startInput) startInput.value = today;
    if (endInput) endInput.value = today;

    const searchBtn = document.getElementById('histSearchBtn');
    if (searchBtn) searchBtn.addEventListener('click', () => loadHistoryRecords());
});

async function loadHistoryRecords() {
    const startDate = document.getElementById('histStartDate').value;
    const endDate = document.getElementById('histEndDate').value;
    
    if(!startDate || !endDate) { alert("請選擇完整的日期區間"); return; }

    document.getElementById('histLoading').classList.remove('hidden');
    const listDiv = document.getElementById('histResultList');
    listDiv.innerHTML = '';

    try {
        const response = await fetch(GET_API_URL + "&action=getHistory", { method: 'GET' });
        if(!response.ok) throw new Error("讀取失敗");
        let records = await response.json();

        // 前端精準過濾日期區間
        const start = new Date(startDate + "T00:00:00").getTime();
        const end = new Date(endDate + "T23:59:59").getTime();

        records = records.filter(item => {
            const t = new Date(item.timestamp).getTime();
            return t >= start && t <= end;
        });

        // 排序：由新至舊
        records.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        renderHistoryUI(records);

    } catch(e) {
        alert("資料庫連線異常，無法讀取紀錄");
        console.error(e);
    } finally {
        document.getElementById('histLoading').classList.add('hidden');
    }
}

function renderHistoryUI(records) {
    const listDiv = document.getElementById('histResultList');
    if(records.length === 0) {
        listDiv.innerHTML = '<div class="text-center text-muted mt-4">此區間查無調撥紀錄</div>'; return;
    }

    let html = '';
    records.forEach(item => {
        const timeStr = new Date(item.timestamp).toLocaleString();
        const hasRemark = item.remark && item.remark.trim() !== '';
        
        // ✨ 修改：完全改用獨立的 reportStatus 欄位進行前端狀態判定
        const isReported = item.reportStatus === '已通報';
        const hasReportReason = item.reportReason && item.reportReason.trim() !== '';
        
        html += `
            <div class="card mb-3 p-3 shadow-sm border-start border-4 ${isReported ? 'border-danger bg-light' : 'border-secondary'}">
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
                        <div>👤 登記藥师：${item.operatorName} (${item.operatorId})</div>
                        
                        ${hasRemark ? `<div class="text-primary mt-1">📝 原始備註：${item.remark}</div>` : ''}
                        
                        ${isReported ? `
                            <div class="mt-2 p-2 border border-danger rounded bg-white">
                                <div class="text-danger fw-bold">⚠️ 異常狀態：[已通報] - 原因: ${hasReportReason ? item.reportReason : '未載明'}</div>
                                <div class="text-muted mt-1" style="font-size: 0.7rem;">
                                    通報藥師：${item.reportName || '未知'} (${item.reportEmpId || '未知'}) | 時間：${item.reportTime ? new Date(item.reportTime).toLocaleString() : ''}
                                </div>
                            </div>
                        ` : ''}
                    </div>
                        <div class="col-4 text-end">
                        <button class="btn btn-sm btn-outline-danger" onclick="window.reportAnomaly('${item.id}')" ${isReported ? 'disabled' : ''}>
                            ${isReported ? '🚨 已通報' : '🚨 通報異常'}
                        </button>
                    </div>
                </div>
            </div>`;
    });
    listDiv.innerHTML = html;
}

window.reportAnomaly = async function(id) {
    if (!window.currentUser || !window.currentUser.empId) {
        alert("無法辨識登入身分，請重新登入！");
        return;
    }

    const reason = prompt("請輸入通報異常原因 (將寫入專屬欄位並通知藥庫)：");
    if(!reason) return;

    try {
        // ✨ 修改：精準將通報狀態、原因與通報藥師身分打包
        const payload = { 
            action: "report", 
            itemId: parseInt(id, 10), 
            reportReason: reason,
            reportEmpId: window.currentUser.empId,
            reportName: window.currentUser.name,
            reportStatus: "已通報"
        };
        
        const res = await fetch(API_URL, { 
            method: 'POST', 
            headers: {'Content-Type':'application/json'}, 
            body: JSON.stringify(payload) 
        });
        
        if(!res.ok) throw new Error();
        
        alert("✅ 異常紀錄通報成功！");
        document.getElementById('histSearchBtn').click(); // 自動刷新
        
    } catch(e) { 
        alert("通報失敗，請檢查網路狀態"); 
    }
};
