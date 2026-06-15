// ==========================================
// 🔄 1-3級管藥：交接班與點交紀錄專屬模組
// ==========================================

const HANDOVER_API_URL = "https://defaultf611cf53b6864814b03558908d4900.be.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/f58bcf2b5f93404bba33ea0e0b5f188b/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=JNv9I2NOeY6j-DXiQhRMP3kaBTuWQcprSMWBRtnOStQ";

window.handoverList = window.handoverList || []; 
window.handoverShiftConfigs = []; 

document.addEventListener('DOMContentLoaded', () => {
    const generateBtn = document.getElementById('generateHandoverBtn');
    if (generateBtn) generateBtn.addEventListener('click', generateHandoverRecord);

    const searchBtn = document.getElementById('handoverHistSearchBtn');
    if (searchBtn) searchBtn.addEventListener('click', renderHandoverHistory);

    const todayIso = new Date().toISOString().split('T')[0];
    if (document.getElementById('handoverHistDate')) document.getElementById('handoverHistDate').value = todayIso;

    const handoverEmpInput = document.getElementById('handoverEmpOutput');
    if (handoverEmpInput) {
        handoverEmpInput.removeAttribute('readonly');
        handoverEmpInput.placeholder = "請輸入交班人員編或姓名...";
        handoverEmpInput.classList.remove('bg-white'); 
    }

    document.querySelectorAll('#mainTabs .nav-link[data-tab^="ctrl-handover"]').forEach(tab => {
        tab.addEventListener('click', () => {
            if (typeof window.fetchHandoverHistoryFromDB === 'function') {
                window.fetchHandoverHistoryFromDB();
            }
        });
    });
});

window.initCtrlHandoverSection = function() {
    if (!window.currentUser || !window.sysParamsDB) return;

    const shiftSelect = document.getElementById('handoverShiftSelect');
    if (shiftSelect) {
        shiftSelect.innerHTML = '<option value="">請選擇班別工作...</option>';
        
        let shifts = window.sysParamsDB.filter(p => 
            p.title === '管藥交班項目' && 
            p.status === '啟用' &&
            (p.station === window.currentUser.station || p.station === '全院通用')
        );

        shifts.sort((a, b) => parseInt(a.sortOrder || 999) - parseInt(b.sortOrder || 999));
        window.handoverShiftConfigs = shifts; 

        shifts.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.itemName;
            opt.dataset.order = s.sortOrder || 999;
            opt.innerText = s.itemName;
            shiftSelect.appendChild(opt);
        });
    }
};

window.fetchHandoverHistoryFromDB = async function() {
    try {
        const response = await fetch(GET_API_URL + "&action=getHandover", { method: 'GET' });
        if (response.ok) {
            const rawFlatData = await response.json();
            const groupedData = {};
            
            rawFlatData.forEach(row => {
                const id = row.Title || row.標題 || row.id; 
                if (!groupedData[id]) {
                    groupedData[id] = {
                        id: id,
                        station: row.Station || row.station || '',
                        shiftName: row.ShiftName || row.shiftName || '',
                        shiftOrder: parseInt(row.ShiftOrder || row.shiftOrder || 999, 10),
                        handoverEmpID: row.HandoverEmpID || row.handoverEmpID || '',
                        handoverName: row.HandoverName || row.handoverName || '', // ✨ 接住 API 回傳的姓名
                        receiverEmpID: row.ReceiverEmpID || row.receiverEmpID || '',
                        receiverName: row.ReceiverName || row.receiverName || '', // ✨ 接住 API 回傳的姓名
                        remark: row.Remark || row.remark || '',
                        checkStatus: row.CheckStatus || row.checkStatus || '正常',
                        createTime: row.CreateTime || row.createTime || '',
                        snapshot: [] 
                    };
                }
                
                if (row.DrugCode || row.drugCode) {
                    groupedData[id].snapshot.push({
                        drugCode: row.DrugCode || row.drugCode,
                        drugName: row.DrugName || row.drugName,
                        theoreticalQty: parseInt(row.TheoreticalQty || row.theoreticalQty || 0, 10),
                        actualQty: parseInt(row.ActualQty || row.actualQty || 0, 10)
                    });
                }
            });
            
            window.handoverList = Object.values(groupedData).sort((a, b) => new Date(b.createTime) - new Date(a.createTime));
        }
    } catch (error) {
        console.warn("⚠️ 交班紀錄 API 尚未建置或連線失敗，目前使用本地暫存模式運行。");
    } finally {
        checkSystemLockStatus(); 
        renderHandoverHistory();
        autoFillHandoverPersonnel(); 
    }
};

// ==========================================
// ✨ 新增：智慧解析使用者輸入的字串，提取員編與姓名
// ==========================================
function parseUserInfo(inputStr) {
    if (!inputStr) return { id: "", name: "未知" };
    let val = inputStr.trim().toUpperCase();
    
    // 1. 去員工主檔裡面反查 (比對員編或姓名)
    if (window.realUserDB) {
        let match = window.realUserDB.find(u => u.empId.toUpperCase() === val || u.name === val || val.includes(u.empId.toUpperCase()));
        if (match) return { id: match.empId, name: match.name };
    }
    
    // 2. 如果主檔查不到，但格式是 "姓名 (員編)"，則用正則表達式硬拆
    let comboMatch = inputStr.match(/(.*?)\s*\((.+?)\)/);
    if (comboMatch) {
        return { name: comboMatch[1].trim(), id: comboMatch[2].trim() };
    }
    
    // 3. 都找不到，就把輸入的值當人員編，姓名標示未知
    return { id: val, name: "未知" };
}

// ==========================================
// ✨ 自動填入交班與接班人 (優化為 姓名+員編 格式)
// ==========================================
function autoFillHandoverPersonnel() {
    const handoverEmpInput = document.getElementById('handoverEmpOutput');
    const receiverEmpInput = document.getElementById('receiverEmpInput');
    if (!handoverEmpInput || !receiverEmpInput || !window.currentUser) return;

    if (!receiverEmpInput.value) {
        receiverEmpInput.value = `${window.currentUser.name} (${window.currentUser.empId})`;
    }

    const completedRecords = window.handoverList.filter(r => r.station === window.currentUser.station && r.checkStatus === '已完成');
    if (completedRecords.length > 0) {
        const lastRecId = completedRecords[0].receiverEmpID || "";
        const lastRecName = completedRecords[0].receiverName || "未知";
        handoverEmpInput.value = `${lastRecName} (${lastRecId})`;
    } else {
        if (!handoverEmpInput.value) handoverEmpInput.value = ""; 
    }
}

window.checkSystemLockStatus = function() {
    if (!window.handoverShiftConfigs || window.handoverShiftConfigs.length === 0) return;
    
    const minOrder = Math.min(...window.handoverShiftConfigs.map(s => parseInt(s.sortOrder || 999)));
    const maxOrder = Math.max(...window.handoverShiftConfigs.map(s => parseInt(s.sortOrder || 999)));
    const todayStr = new Date().toLocaleDateString();
    
    const todayCompleted = window.handoverList.filter(r => 
        r.station === window.currentUser.station && 
        r.checkStatus === '已完成' && 
        new Date(r.createTime).toLocaleDateString() === todayStr
    );
    
    const hasFirstShift = todayCompleted.some(r => r.shiftOrder === minOrder);
    const hasLastShift = todayCompleted.some(r => r.shiftOrder === maxOrder);
    
    if (hasLastShift) window.ctrlSystemStatus = 'LOCKED_POST';
    else if (hasFirstShift) window.ctrlSystemStatus = 'OPEN';
    else window.ctrlSystemStatus = 'LOCKED_PRE';
};

// ==========================================
// ✨ 產生交班單 API (加入姓名解析寫入)
// ==========================================
async function generateHandoverRecord() {
    const shiftSelect = document.getElementById('handoverShiftSelect');
    const shiftName = shiftSelect.value;
    const shiftOrder = shiftSelect.options[shiftSelect.selectedIndex]?.dataset?.order;
    const remark = document.getElementById('handoverRemark').value.trim();

    const handoverStr = document.getElementById('handoverEmpOutput').value;
    const receiverStr = document.getElementById('receiverEmpInput').value;

    const handoverUser = parseUserInfo(handoverStr);
    const receiverUser = parseUserInfo(receiverStr);

    if (!shiftName) { alert("❌ 請選擇交班班別工作！"); return; }
    if (!handoverUser.id) { alert("❌ 請輸入交班人！"); return; }
    if (!receiverUser.id) { alert("❌ 請輸入接班人！"); return; }

    const snapshot = window.ctrlDrugDB.map(d => ({
        drugCode: d.code || d.drugCode,
        drugName: d.name || d.drugName,
        theoreticalQty: parseInt(d.quantity || 0, 10), 
        actualQty: parseInt(d.quantity || 0, 10)       
    }));

    const payload = {
        action: "createHandover",
        id: "HO_" + Date.now(),
        station: window.currentUser.station,
        shiftName: shiftName,
        shiftOrder: parseInt(shiftOrder, 10),
        handoverEmpID: handoverUser.id,
        handoverName: handoverUser.name,     // ✨ 新增欄位
        receiverEmpID: receiverUser.id,
        receiverName: receiverUser.name,     // ✨ 新增欄位
        keyTransferred: shiftName.includes('鑰匙') ? 'Y' : 'N',
        createTime: new Date().toLocaleString(),
        remark: remark,
        checkStatus: "待核對", 
        snapshot: snapshot
    };

    window.handoverList.unshift(payload);
    
    document.getElementById('handoverRemark').value = '';
    alert("✅ 點班單已產生！請至「交接班點交紀錄」核對實體數量。");
    window.switchTab('ctrl-handover-history');
    renderHandoverHistory();

    console.log("🚀 [API 拋轉測試] 準備建立交班單，Payload:", payload);
    try {
        await fetch(HANDOVER_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    } catch(e) {
        console.warn("⚠️ API 拋轉失敗，目前紀錄暫存於本地。");
    }
}

// ==========================================
// ✨ 渲染交班紀錄 (UI 優化顯示姓名)
// ==========================================
function renderHandoverHistory() {
    const tbody = document.getElementById('handoverHistTableBody');
    if (!tbody) return;

    const filterDate = document.getElementById('handoverHistDate').value;
    const filterStatus = document.getElementById('handoverHistStatus').value;
    const filterOp = document.getElementById('handoverHistOpSearch').value.toUpperCase().trim();
    
    let html = '';
    window.handoverList.forEach(item => {
        if (item.station !== window.currentUser.station) return;
        if (filterDate && !item.createTime.includes(filterDate.replace(/-/g, '/'))) return; 
        if (filterStatus !== '全部' && item.checkStatus !== filterStatus) return;
        if (filterOp) {
            const hId = (item.handoverEmpID || "").toUpperCase();
            const hName = (item.handoverName || "").toUpperCase();
            const rId = (item.receiverEmpID || "").toUpperCase();
            const rName = (item.receiverName || "").toUpperCase();
            if (!hId.includes(filterOp) && !hName.includes(filterOp) && !rId.includes(filterOp) && !rName.includes(filterOp)) return;
        }

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

        // ✨ 表格完美顯示 姓名與員編
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
            </tr>
        `;
    });

    const actionHtml = isViewOnly ? '' : `
        <div class="alert alert-info text-start mt-3 mb-0" style="font-size: 0.9rem;">
            <strong>📌 點交指引：</strong>請根據上方「系統結存」清點金庫實體管藥。<br>
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
                        <tr><th>藥碼</th><th>藥品名稱</th><th>系統結存</th></tr>
                    </thead>
                    <tbody>${tableRows}</tbody>
                </table>
            </div>
            ${actionHtml}
        `,
        width: '650px',
        showCancelButton: !isViewOnly,
        showConfirmButton: !isViewOnly,
        confirmButtonColor: '#198754',
        cancelButtonColor: '#dc3545',
        confirmButtonText: '✅ 數量無誤，完成交班',
        cancelButtonText: '🗑️ 數量有誤，作廢此單',
        closeOnConfirm: false
    }).then((result) => {
        if (result.isConfirmed && !isViewOnly) {
            record.checkStatus = '已完成';
            record.checkTime = new Date().toLocaleString();
            
            checkSystemLockStatus(); 
            renderHandoverHistory();
            updateHandoverStatusAPI(record.id, '已完成'); 
            
            if(window.ctrlSystemStatus === 'OPEN') Swal.fire('開班完成！', '首班交接已確認，管藥調劑系統已【解鎖】。', 'success');
            else if(window.ctrlSystemStatus === 'LOCKED_POST') Swal.fire('關班結算完成！', '今日帳目已結算，管藥調劑系統已【鎖定】。', 'warning');
            else Swal.fire('交班完成！', '中班交接已確認。', 'success');

        } else if (result.dismiss === Swal.DismissReason.cancel && !isViewOnly) {
            voidHandover(id);
        }
    });
};

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
            record.cancelName = window.currentUser.name; // ✨ 新增作廢人姓名
            record.cancelTime = new Date().toLocaleString();
            
            renderHandoverHistory();
            updateHandoverStatusAPI(record.id, '已作廢'); 
            
            Swal.fire('已作廢', '單據已作廢，請盡速修正系統庫存。', 'info');
        }
    });
};

async function updateHandoverStatusAPI(id, status) {
    const record = window.handoverList.find(r => r.id === id);
    const payload = {
        action: "updateHandoverStatus",
        id: id,
        checkStatus: status,
        updateTime: new Date().toLocaleString(),
        operatorEmpID: window.currentUser.empId,
        cancelEmpID: status === '已作廢' ? record.cancelEmpID : "",
        cancelName: status === '已作廢' ? record.cancelName : "" // ✨ 新增作廢拋轉姓名
    };
    
    console.log(`🚀 [API 拋轉測試] 更新狀態為 ${status}，Payload:`, payload);
    try {
        await fetch(HANDOVER_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    } catch(e) {
        console.warn("⚠️ API 狀態更新拋轉失敗，目前紀錄暫存於本地。");
    }
}
