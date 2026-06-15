// ==========================================
// 🔄 1-3級管藥：交接班與點交紀錄專屬模組
// ==========================================

window.handoverList = window.handoverList || []; 
window.handoverShiftConfigs = []; // 儲存該單位的交班設定，用來判斷首班與尾班

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

// ==========================================
// 1. 初始化交接班選單 (動態讀取參數並判定開關班)
// ==========================================
window.initCtrlHandoverSection = function() {
    if (!window.currentUser || !window.sysParamsDB) return;

    const shiftSelect = document.getElementById('handoverShiftSelect');
    if (shiftSelect) {
        shiftSelect.innerHTML = '<option value="">請選擇班別工作...</option>';
        
        // 篩選出目前單位的啟用交班項目
        let shifts = window.sysParamsDB.filter(p => 
            p.title === '管藥交班項目' && 
            p.status === '啟用' &&
            (p.station === window.currentUser.station || p.station === '全院通用')
        );

        // 依照 SortOrder 排序
        shifts.sort((a, b) => parseInt(a.sortOrder || 999) - parseInt(b.sortOrder || 999));
        window.handoverShiftConfigs = shifts; // 存入全域供後續判斷首尾班使用

        shifts.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.itemName;
            opt.dataset.order = s.sortOrder || 999;
            opt.innerText = s.itemName;
            shiftSelect.appendChild(opt);
        });
    }
};

// ==========================================
// 2. 產生當下結存點班單 (快照結存)
// ==========================================
async function generateHandoverRecord() {
    const shiftSelect = document.getElementById('handoverShiftSelect');
    const shiftName = shiftSelect.value;
    const shiftOrder = shiftSelect.options[shiftSelect.selectedIndex]?.dataset?.order;
    const receiver = document.getElementById('receiverEmpInput').value.trim();
    const remark = document.getElementById('handoverRemark').value.trim();

    if (!shiftName) { alert("❌ 請選擇交班班別工作！"); return; }
    if (!receiver) { alert("❌ 請輸入或刷入接班人識別證！"); return; }

    // ✨ 快照當下系統庫存 (作為點交基準)
    // 實務上這裡會抓取管制藥主檔的當下數量 (TheoreticalQty)
    const snapshot = window.ctrlDrugDB.map(d => ({
        drugCode: d.code || d.drugCode,
        drugName: d.name || d.drugName,
        theoreticalQty: parseInt(d.quantity || 0, 10), // 系統應有量
        actualQty: parseInt(d.quantity || 0, 10)       // 實體量預設帶入應有量供藥師調整
    }));

    // ✨ 對齊 CSV 欄位結構
    const record = {
        id: "HO_" + Date.now(),
        station: window.currentUser.station,
        shiftName: shiftName,
        shiftOrder: parseInt(shiftOrder, 10),
        handoverEmpID: window.currentUser.empId,
        handoverName: window.currentUser.name,
        receiverEmpID: receiver, // 實務上可在此做接班人員編驗證
        receiverName: receiver,  // 若有驗證可帶出姓名，目前暫存輸入值
        keyTransferred: shiftName.includes('鑰匙') ? 'Y' : 'N', // 若下拉選項包含鑰匙字眼自動標記
        createTime: new Date().toLocaleString(),
        rawTime: Date.now(),
        remark: remark,
        checkStatus: "待核對", // 狀態：待核對 -> 已完成 / 已作廢
        checkTime: "",
        cancelEmpID: "",
        cancelName: "",
        cancelTime: "",
        snapshot: snapshot
    };

    window.handoverList.unshift(record);
    
    // 清空表單
    document.getElementById('receiverEmpInput').value = '';
    document.getElementById('handoverRemark').value = '';

    // 跳轉至紀錄分頁並渲染
    alert("✅ 點班單已產生！請至「交接班點交紀錄」核對實體數量。");
    window.switchTab('ctrl-handover-history');
    renderHandoverHistory();
}

// ==========================================
// 3. 渲染交班歷史紀錄大表
// ==========================================
function renderHandoverHistory() {
    const tbody = document.getElementById('handoverHistTableBody');
    if (!tbody) return;

    // 簡單本地過濾器
    const filterDate = document.getElementById('handoverHistDate').value;
    const filterStatus = document.getElementById('handoverHistStatus').value;
    
    let html = '';
    window.handoverList.forEach(item => {
        // 過濾邏輯 (示範)
        if (filterDate && !item.createTime.includes(filterDate.replace(/-/g, '/'))) return; // 簡易日期比對
        if (filterStatus !== '全部' && item.checkStatus !== filterStatus) return;

        const isPending = item.checkStatus === '待核對';
        const isVoided = item.checkStatus === '已作廢';
        
        let statusBadge = `<span class="badge bg-success">已完成</span>`;
        if (isPending) statusBadge = `<span class="badge bg-warning text-dark border border-warning shadow-sm">待核對 (點交中)</span>`;
        if (isVoided) statusBadge = `<span class="badge bg-secondary">已作廢</span>`;

        let actionBtn = '';
        if (isPending) {
            actionBtn = `
                <button class="btn btn-sm btn-primary fw-bold px-3 py-1 shadow-sm" onclick="openHandoverCheckPopup('${item.id}')">🔍 執行核對</button>
                <button class="btn btn-sm btn-outline-danger px-2 py-1 mt-1" onclick="voidHandover('${item.id}')">🗑️ 數量有誤作廢</button>
            `;
        } else {
            actionBtn = `<button class="btn btn-sm btn-outline-secondary py-1" onclick="openHandoverCheckPopup('${item.id}', true)">📄 查看明細</button>`;
        }

        html += `
            <tr class="${isVoided ? 'table-secondary text-muted' : (isPending ? 'table-warning' : '')}">
                <td class="font-monospace small">
                    <div>${item.createTime.split(' ')[0]}</div>
                    <div class="text-secondary">${item.createTime.split(' ')[1] || ''}</div>
                </td>
                <td class="fw-bold text-danger">${item.shiftName}</td>
                <td><div class="fw-bold">${item.handoverName}</div><small class="text-muted">${item.handoverEmpID}</small></td>
                <td><div class="fw-bold">${item.receiverName}</div><small class="text-muted">${item.receiverEmpID}</small></td>
                <td class="text-start small text-secondary">${item.remark || '無'}</td>
                <td>${statusBadge}</td>
                <td><div class="d-flex flex-column align-items-center">${actionBtn}</div></td>
            </tr>
        `;
    });

    if (!html) html = `<tr><td colspan="7" class="text-muted py-4">🔍 查無交接班紀錄</td></tr>`;
    tbody.innerHTML = html;
}

// ==========================================
// 4. 開啟核對彈窗與系統解鎖/鎖死判定邏輯
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
                <td class="fs-5 fw-bold text-primary">${d.theoreticalQty}</td>
                <td class="fs-5 fw-bold ${d.theoreticalQty === d.actualQty ? 'text-success' : 'text-danger'}">${d.actualQty}</td>
            </tr>
        `;
    });

    const actionHtml = isViewOnly ? '' : `
        <div class="alert alert-info text-start mt-3 mb-0" style="font-size: 0.9rem;">
            <strong>📌 點交指引：</strong>請根據上方「系統應有結存」清點金庫實體管藥。<br>
            ✅ 若數量一致，請點擊「數量無誤完成交班」。<br>
            ❌ 若有盤盈虧，請「作廢此單」，前往調劑頁面將帳目做平後，再重新開單。
        </div>
    `;

    Swal.fire({
        title: `📋 ${record.shiftName} - 結存核對單`,
        html: `
            <div class="table-responsive mt-3" style="max-height: 400px; overflow-y: auto;">
                <table class="table table-bordered table-hover align-middle text-center mb-0">
                    <thead class="table-danger sticky-top">
                        <tr><th>藥碼</th><th>藥品名稱</th><th>系統結存</th><th>實體點交</th></tr>
                    </thead>
                    <tbody>${tableRows}</tbody>
                </table>
            </div>
            ${actionHtml}
        `,
        width: '700px',
        showCancelButton: !isViewOnly,
        showConfirmButton: !isViewOnly,
        confirmButtonColor: '#198754',
        cancelButtonColor: '#dc3545',
        confirmButtonText: '✅ 數量無誤，完成交班',
        cancelButtonText: '🗑️ 數量有誤，作廢此單',
        closeOnConfirm: false
    }).then((result) => {
        if (result.isConfirmed && !isViewOnly) {
            
            // 標記完成
            record.checkStatus = '已完成';
            record.checkTime = new Date().toLocaleString();
            
            // ✨ 核心判定：判斷該班別是否為「排序最小(首班)」或「排序最大(尾班)」
            if (window.handoverShiftConfigs.length > 0) {
                const minOrder = Math.min(...window.handoverShiftConfigs.map(s => parseInt(s.sortOrder || 999)));
                const maxOrder = Math.max(...window.handoverShiftConfigs.map(s => parseInt(s.sortOrder || 999)));
                
                if (record.shiftOrder === minOrder) {
                    window.ctrlSystemStatus = 'OPEN'; // 首班完成，解鎖系統！
                    Swal.fire('開班完成！', '首班交接已確認，管藥調劑系統已【解鎖】。', 'success');
                } else if (record.shiftOrder === maxOrder) {
                    window.ctrlSystemStatus = 'LOCKED_POST'; // 尾班完成，鎖死系統！
                    Swal.fire('關班結算完成！', '今日帳目已結算，管藥調劑系統已【鎖定】。', 'warning');
                } else {
                    Swal.fire('交班完成！', '中班交接已確認。', 'success');
                }
            } else {
                Swal.fire('交班完成！', '紀錄已儲存。', 'success');
            }

            renderHandoverHistory();
            
        } else if (result.dismiss === Swal.DismissReason.cancel && !isViewOnly) {
            voidHandover(id);
        }
    });
};

// 作廢點班單
window.voidHandover = function(id) {
    const record = window.handoverList.find(r => r.id === id);
    if (!record) return;
    
    Swal.fire({
        title: '確認作廢？',
        text: '作廢後請前往「1-3級管藥調劑」進行盤盈/盤虧操作修正帳目，修正完畢後再重新產生交班單。',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc3545',
        cancelButtonColor: '#6c757d',
        confirmButtonText: '確定作廢'
    }).then((result) => {
        if (result.isConfirmed) {
            record.checkStatus = '已作廢';
            record.cancelEmpID = window.currentUser.empId;
            record.cancelName = window.currentUser.name;
            record.cancelTime = new Date().toLocaleString();
            renderHandoverHistory();
            Swal.fire('已作廢', '單據已作廢，請盡速修正系統庫存。', 'info');
        }
    });
};
