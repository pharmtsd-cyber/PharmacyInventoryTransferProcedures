// ==========================================
// 🔄 1-3級管藥：交接班與點交紀錄專屬模組
// ==========================================

// 本地暫存交班紀錄 (實際應用可接 SharePoint)
window.handoverList = window.handoverList || []; 

document.addEventListener('DOMContentLoaded', () => {
    // 綁定產生點班單按鈕
    const generateBtn = document.getElementById('generateHandoverBtn');
    if (generateBtn) generateBtn.addEventListener('click', generateHandoverRecord);

    // 綁定歷史紀錄篩選按鈕
    const searchBtn = document.getElementById('handoverHistSearchBtn');
    if (searchBtn) searchBtn.addEventListener('click', renderHandoverHistory);

    // 預設日期為今日
    const todayIso = new Date().toISOString().split('T')[0];
    if (document.getElementById('handoverHistDate')) document.getElementById('handoverHistDate').value = todayIso;
});

// 初始化交接班選單 (由 app.js 或 index 呼叫)
window.initCtrlHandoverSection = function() {
    const shiftSelect = document.getElementById('handoverShiftSelect');
    if (shiftSelect && window.sysParamsDB) {
        shiftSelect.innerHTML = '<option value="">請選擇班別工作...</option>';
        const shifts = window.sysParamsDB.filter(p => p.title === '管藥交班項目' && p.status === '啟用');
        shifts.sort((a, b) => parseInt(a.sortOrder || 999) - parseInt(b.sortOrder || 999));
        
        shifts.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.itemName;
            opt.innerText = s.itemName;
            shiftSelect.appendChild(opt);
        });
    }
};

// ==========================================
// ✨ 核心流程 1：產生當下結存點班單
// ==========================================
async function generateHandoverRecord() {
    const shift = document.getElementById('handoverShiftSelect').value;
    const receiver = document.getElementById('receiverEmpInput').value.trim();
    const remark = document.getElementById('handoverRemark').value.trim();

    if (!shift) { alert("❌ 請選擇交班班別工作！"); return; }
    if (!receiver) { alert("❌ 請輸入或刷入接班人識別證！"); return; }

    // 產生快照 (此處模擬抓取資料庫目前的數量，實務上可向後端請求即時庫存)
    const snapshot = window.ctrlDrugDB.map(d => ({
        drugCode: d.code || d.drugCode,
        drugName: d.name || d.drugName,
        expectedQty: Math.floor(Math.random() * 50) + 10 // ⚠️ 測試用：產生隨機庫存，請替換為你的真實抓取邏輯
    }));

    const record = {
        id: "HO_" + Date.now(),
        timestamp: new Date().toLocaleString(),
        rawTime: Date.now(),
        shiftName: shift,
        handoverEmp: `${window.currentUser.name} (${window.currentUser.empId})`,
        receiverEmp: receiver,
        remark: remark,
        status: "待核對",
        snapshot: snapshot
    };

    window.handoverList.unshift(record);
    
    // 清空表單
    document.getElementById('receiverEmpInput').value = '';
    document.getElementById('handoverRemark').value = '';

    // 跳轉至紀錄分頁並渲染
    alert("✅ 點班單已產生！請至交班紀錄核對實體數量。");
    window.switchTab('ctrl-handover-history');
    renderHandoverHistory();
}

// ==========================================
// ✨ 核心流程 2：渲染歷史紀錄與核對視窗
// ==========================================
function renderHandoverHistory() {
    const tbody = document.getElementById('handoverHistTableBody');
    if (!tbody) return;

    let html = '';
    window.handoverList.forEach(item => {
        const isPending = item.status === '待核對';
        const isVoided = item.status === '已作廢';
        
        let statusBadge = `<span class="badge bg-success">已完成</span>`;
        if (isPending) statusBadge = `<span class="badge bg-warning text-dark blink">待核對</span>`;
        if (isVoided) statusBadge = `<span class="badge bg-secondary">已作廢</span>`;

        let actionBtn = '';
        if (isPending) {
            actionBtn = `
                <button class="btn btn-sm btn-primary fw-bold px-3 py-1" onclick="openHandoverCheckPopup('${item.id}')">🔍 執行核對</button>
                <button class="btn btn-sm btn-outline-danger px-2 py-1 mt-1" onclick="voidHandover('${item.id}')">作廢重來</button>
            `;
        } else {
            actionBtn = `<button class="btn btn-sm btn-outline-secondary py-1" onclick="openHandoverCheckPopup('${item.id}', true)">📄 查看明細</button>`;
        }

        html += `
            <tr class="${isVoided ? 'table-secondary text-muted' : (isPending ? 'table-warning' : '')}">
                <td class="font-monospace small">${item.timestamp}</td>
                <td class="fw-bold text-danger">${item.shiftName}</td>
                <td>${item.handoverEmp}</td>
                <td>${item.receiverEmp}</td>
                <td class="text-start small text-secondary">${item.remark || '無'}</td>
                <td>${statusBadge}</td>
                <td><div class="d-flex flex-column align-items-center">${actionBtn}</div></td>
            </tr>
        `;
    });

    if (!html) html = `<tr><td colspan="7" class="text-muted py-4">查無交接班紀錄</td></tr>`;
    tbody.innerHTML = html;
}

// ==========================================
// ✨ 核心流程 3：開啟核對彈窗 (清點實體數量)
// ==========================================
window.openHandoverCheckPopup = function(id, isViewOnly = false) {
    const record = window.handoverList.find(r => r.id === id);
    if (!record) return;

    let tableRows = '';
    record.snapshot.forEach(d => {
        tableRows += `
            <tr>
                <td class="fw-bold">${d.drugCode}</td>
                <td class="text-start text-truncate" style="max-width: 200px;">${d.drugName}</td>
                <td class="fs-5 fw-bold text-primary">${d.expectedQty}</td>
            </tr>
        `;
    });

    const actionHtml = isViewOnly ? '' : `
        <div class="alert alert-info text-start mt-3 mb-0">
            <strong>操作指引：</strong>請根據上表「應有結存」清點金庫實體管藥。
            <br>✅ 若數量一致，請點擊下方「數量無誤完成交班」。
            <br>❌ 若有盤盈/盤虧，請點擊「作廢此單」，並前往調劑作業把帳目做平後，再重新產生交班單。
        </div>
    `;

    Swal.fire({
        title: `📋 ${record.shiftName} - 結存核對單`,
        html: `
            <div class="table-responsive mt-3" style="max-height: 400px; overflow-y: auto;">
                <table class="table table-bordered table-striped align-middle text-center mb-0">
                    <thead class="table-danger sticky-top">
                        <tr><th>藥碼</th><th>藥品名稱</th><th>系統結存(應有)</th></tr>
                    </thead>
                    <tbody>${tableRows}</tbody>
                </table>
            </div>
            ${actionHtml}
        `,
        width: '600px',
        showCancelButton: !isViewOnly,
        showConfirmButton: !isViewOnly,
        confirmButtonColor: '#198754',
        cancelButtonColor: '#dc3545',
        confirmButtonText: '✅ 數量無誤，完成交班',
        cancelButtonText: '🗑️ 數量有誤，作廢此單',
        closeOnConfirm: false
    }).then((result) => {
        if (result.isConfirmed && !isViewOnly) {
            // 核對完成，解鎖系統
            record.status = '已完成';
            window.ctrlSystemStatus = 'OPEN'; // 🔓 解除系統鎖定狀態
            renderHandoverHistory();
            Swal.fire('交班完成！', '系統已解鎖，可進行後續管藥調劑與退藥。', 'success');
        } else if (result.dismiss === Swal.DismissReason.cancel && !isViewOnly) {
            // 核對失敗，直接作廢
            voidHandover(id);
        }
    });
};

window.voidHandover = function(id) {
    const record = window.handoverList.find(r => r.id === id);
    if (!record) return;
    record.status = '已作廢';
    renderHandoverHistory();
    Swal.fire('已作廢', '請前往「1-3級管藥/調劑」使用盤盈/虧修正數量後，再重新產生交班單。', 'info');
};
