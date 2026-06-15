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

    bindUserAutocomplete('handoverEmpOutput', 'handover-emp-autocomplete-list');
    bindUserAutocomplete('receiverEmpInput', 'receiver-emp-autocomplete-list');
});

function bindUserAutocomplete(inputId, listId) {
    const input = document.getElementById(inputId);
    if (!input) return;
    
    input.addEventListener('input', function(e) {
        const val = e.target.value.toUpperCase().trim();
        const list = document.getElementById(listId);
        list.innerHTML = '';
        if (!val || !window.realUserDB) return;

        const matches = window.realUserDB.filter(u => u.empId.includes(val) || u.name.includes(val)).slice(0, 10);
        matches.forEach(user => {
            const item = document.createElement('div');
            item.innerHTML = `<strong>${user.empId}</strong> - ${user.name}`;
            item.className = "p-2 border-bottom text-dark bg-white cursor-pointer autocomplete-hover";
            item.style.cursor = "pointer";
            item.addEventListener('click', () => {
                input.value = `${user.name} (${user.empId})`; 
                list.innerHTML = '';
            });
            list.appendChild(item);
        });
    });

    document.addEventListener("click", function (e) {
        if (e.target !== input) {
            const list = document.getElementById(listId);
            if (list) list.innerHTML = '';
        }
    });
}

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
                        handoverName: row.HandoverName || row.handoverName || '', 
                        receiverEmpID: row.ReceiverEmpID || row.receiverEmpID || '',
                        receiverName: row.ReceiverName || row.receiverName || '', 
                        remark: row.Remark || row.remark || '',
                        checkStatus: row.CheckStatus || row.checkStatus || '正常',
                        createTime: row.CreateTime || row.createTime || '',
                        rawTime: row.RawTime || row.rawTime || new Date(row.CreateTime || row.createTime).getTime() || Date.now(),
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
        autoSelectNextShift();
        window.renderCurrentInventory();// ✨ 自動選取下一個班別
    }
};

function parseUserInfo(inputStr) {
    if (!inputStr) return { id: "", name: "未知" };
    let val = inputStr.trim().toUpperCase();
    
    if (window.realUserDB) {
        let match = window.realUserDB.find(u => u.empId.toUpperCase() === val || u.name === val || val.includes(u.empId.toUpperCase()));
        if (match) return { id: match.empId, name: match.name };
    }
    
    let comboMatch = inputStr.match(/(.*?)\s*\((.+?)\)/);
    if (comboMatch) {
        return { name: comboMatch[1].trim(), id: comboMatch[2].trim() };
    }
    
    return { id: val, name: "未知" };
}

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

// ==========================================
// ✨ 新增：自動選取今日「下一個」交接班工作
// ==========================================
function autoSelectNextShift() {
    const shiftSelect = document.getElementById('handoverShiftSelect');
    if (!shiftSelect || !window.handoverShiftConfigs) return;

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const endOfDay = startOfDay + 24 * 60 * 60 * 1000 - 1;

    // 找出今天已完成的排序
    const todayCompletedOrders = window.handoverList
        .filter(r => r.station === window.currentUser.station && r.checkStatus === '已完成' && r.rawTime >= startOfDay && r.rawTime <= endOfDay)
        .map(r => parseInt(r.shiftOrder, 10));

    // 找出下一個該做的班別
    const nextShift = window.handoverShiftConfigs.find(s => !todayCompletedOrders.includes(parseInt(s.sortOrder || 999, 10)));

    // 遍歷所有選項，將非下一個班別的選項全部 Disable (防呆強制)
    Array.from(shiftSelect.options).forEach(opt => {
        if (opt.value === "") return; // 保留預設空選項
        if (nextShift && opt.value === nextShift.itemName) {
            opt.disabled = false;
            shiftSelect.value = opt.value;
        } else {
            opt.disabled = true; // 鎖死不給選
        }
    });

    if (!nextShift) {
        shiftSelect.value = ""; // 如果全做完了，就清空
    }
}

// ==========================================
// ✨ 修正：鎖定狀態判斷改用精準的時間戳 (TimeStamp) 比較
// ==========================================
window.checkSystemLockStatus = function() {
    if (!window.handoverShiftConfigs || window.handoverShiftConfigs.length === 0) return;
    
    const minOrder = Math.min(...window.handoverShiftConfigs.map(s => parseInt(s.sortOrder || 999)));
    const maxOrder = Math.max(...window.handoverShiftConfigs.map(s => parseInt(s.sortOrder || 999)));
    
    // 取得今日 00:00:00 與 23:59:59 的精準時間戳
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const endOfDay = startOfDay + 24 * 60 * 60 * 1000 - 1;
    
    const todayCompleted = window.handoverList.filter(r => 
        r.station === window.currentUser.station && 
        r.checkStatus === '已完成' && 
        r.rawTime >= startOfDay && 
        r.rawTime <= endOfDay
    );
    
    const hasFirstShift = todayCompleted.some(r => r.shiftOrder === minOrder);
    const hasLastShift = todayCompleted.some(r => r.shiftOrder === maxOrder);
    
    if (hasLastShift) window.ctrlSystemStatus = 'LOCKED_POST';
    else if (hasFirstShift) window.ctrlSystemStatus = 'OPEN';
    else window.ctrlSystemStatus = 'LOCKED_PRE';
};

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
        handoverName: handoverUser.name,     
        receiverEmpID: receiverUser.id,
        receiverName: receiverUser.name,     
        keyTransferred: shiftName.includes('鑰匙') ? 'Y' : 'N',
        createTime: new Date().toLocaleString(),
        rawTime: Date.now(),
        remark: remark,
        checkStatus: "待核對", 
        snapshot: snapshot
    };

    window.handoverList.unshift(payload);
    
    document.getElementById('handoverRemark').value = '';
    alert("✅ 點班單已產生！請至「交接班點交紀錄」核對實體數量。");
    window.switchTab('ctrl-handover-history');
    renderHandoverHistory();

    try {
        await fetch(HANDOVER_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    } catch(e) {}
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
        cancelButtonText: '🗑️ 數量有誤，作廢此單'
    }).then((result) => {
        if (result.isConfirmed && !isViewOnly) {
            record.checkStatus = '已完成';
            record.checkTime = new Date().toLocaleString();
            
            checkSystemLockStatus(); 
            renderHandoverHistory();
            updateHandoverStatusAPI(record.id, '已完成'); 
            autoSelectNextShift(); // ✨ 核對完成後，自動更新下拉選單為下一個班別
            
            if(window.ctrlSystemStatus === 'OPEN') Swal.fire('開班完成！', '首班交接已確認，管藥調劑系統已【解鎖】。', 'success');
            else if(window.ctrlSystemStatus === 'LOCKED_POST') Swal.fire('關班結算完成！', '今日帳目已結算，管藥調劑系統已【鎖定】。', 'warning');
            else Swal.fire('交班完成！', '中班交接已確認。', 'success');

        } else if (result.dismiss === Swal.DismissReason.cancel && !isViewOnly) {
            voidHandover(id);
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
        cancelName: status === '已作廢' ? record.cancelName : "" 
    };
    
    try {
        await fetch(HANDOVER_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    } catch(e) {}
}

// ==========================================
// ✨ 修正 2：歷史紀錄加入操作按鈕與作廢防呆限制
// ==========================================
function renderHandoverHistory() {
    const tbody = document.getElementById('handoverHistTableBody');
    if (!tbody) return;

    const filterDateStr = document.getElementById('handoverHistDate').value;
    const filterStatus = document.getElementById('handoverHistStatus').value;
    const filterOp = document.getElementById('handoverHistOpSearch').value.toUpperCase().trim();
    
    const startOfDay = filterDateStr ? new Date(filterDateStr + "T00:00:00").getTime() : 0;
    const endOfDay = filterDateStr ? new Date(filterDateStr + "T23:59:59").getTime() : Infinity;

    // ✨ 找出「最新的一筆」已完成紀錄，用來判定作廢權限
    const completedRecords = window.handoverList.filter(r => r.station === window.currentUser.station && r.checkStatus === '已完成');
    const latestCompletedId = completedRecords.length > 0 ? completedRecords[0].id : null;

    let html = '';
    window.handoverList.forEach(item => {
        if (item.station !== window.currentUser.station) return;
        if (filterDateStr && item.rawTime && (item.rawTime < startOfDay || item.rawTime > endOfDay)) return;
        if (filterStatus !== '全部' && item.checkStatus !== filterStatus) return;
        if (filterOp) {
            const matchStr = `${item.handoverEmpID} ${item.handoverName} ${item.receiverEmpID} ${item.receiverName}`.toUpperCase();
            if (!matchStr.includes(filterOp)) return;
        }

        const isPending = item.checkStatus === '待核對';
        const isVoided = item.checkStatus === '已作廢';
        const isCompleted = item.checkStatus === '已完成';
        
        let statusBadge = `<span class="badge bg-success">已完成</span>`;
        if (isPending) statusBadge = `<span class="badge bg-warning text-dark border border-warning shadow-sm">待核對</span>`;
        if (isVoided) statusBadge = `<span class="badge bg-secondary">已作廢</span>`;

        let actionBtn = '';
        if (isPending) {
            actionBtn = `
                <button class="btn btn-sm btn-primary fw-bold px-3 py-1 shadow-sm w-100 mb-1" onclick="openHandoverCheckPopup('${item.id}')">🔍 執行核對</button>
                <button class="btn btn-sm btn-outline-danger px-2 py-1 w-100" onclick="voidHandover('${item.id}', true)">🗑️ 數量有誤作廢</button>
            `;
        } else {
            // ✨ 防呆：只有已完成的「最新那一筆」才可以被作廢
            const canVoid = (isCompleted && item.id === latestCompletedId);
            const voidAttr = canVoid ? '' : 'disabled title="只能作廢最新的一筆交班紀錄"';
            const editAttr = isVoided ? 'disabled' : ''; 

            actionBtn = `
                <button class="btn btn-sm btn-outline-info py-0 px-2 mb-1 w-100" style="font-size:0.8rem;" onclick="openHandoverCheckPopup('${item.id}', true)">📄 點交明細</button>
                <div class="btn-group btn-group-sm w-100 mb-1">
                    <button class="btn btn-outline-secondary py-0 px-2" style="font-size:0.75rem;" onclick="editHandover('${item.id}')" ${editAttr}>✏️</button>
                    <button class="btn btn-outline-danger py-0 px-2" style="font-size:0.75rem;" onclick="voidHandover('${item.id}', false)" ${voidAttr}>🗑️</button>
                </div>
                <button class="btn btn-sm btn-outline-warning text-dark fw-bold py-0 w-100" style="font-size:0.7rem;" onclick="reportHandover('${item.id}')" ${editAttr}>⚠️ 通報</button>
            `;
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
                <td style="width: 14%;"><div class="d-flex flex-column align-items-center">${actionBtn}</div></td>
            </tr>
        `;
    });

    if (!html) html = `<tr><td colspan="7" class="text-muted py-4">🔍 查無交接班紀錄</td></tr>`;
    tbody.innerHTML = html;
}

// ✨ 加入原因填寫的作廢邏輯
window.voidHandover = function(id, isPending = false) {
    const record = window.handoverList.find(r => r.id === id);
    if (!record) return;
    
    let textStr = isPending ? '發現數量不符作廢，請前往盤盈虧修正。' : '作廢已完成紀錄將可能解除系統鎖定。';
    
    Swal.fire({
        title: '確認作廢？',
        text: textStr + '請填寫作廢原因：',
        input: 'text',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc3545',
        cancelButtonColor: '#6c757d',
        confirmButtonText: '確定作廢',
        inputValidator: (value) => { if (!value) return '作廢理由為必填！'; }
    }).then((result) => {
        if (result.isConfirmed) {
            record.checkStatus = '已作廢';
            record.cancelEmpID = window.currentUser.empId;
            record.cancelName = window.currentUser.name; 
            record.cancelTime = new Date().toLocaleString();
            record.cancelReason = result.value;
            
            checkSystemLockStatus(); // 重新驗證鎖定狀態
            renderHandoverHistory();
            autoSelectNextShift(); // 釋放選單
            updateHandoverActionAPI(record.id, '已作廢', result.value, 'cancel'); 
            Swal.fire('已作廢', '單據已作廢。', 'info');
        }
    });
};

// ✨ 編輯邏輯 (修改備註)
window.editHandover = function(id) {
    const record = window.handoverList.find(r => r.id === id);
    if (!record) return;

    Swal.fire({
        title: '✏️ 編輯交班備註',
        input: 'textarea',
        inputValue: record.remark,
        inputPlaceholder: '請輸入修正後的備註說明...',
        showCancelButton: true,
        confirmButtonText: '儲存修改',
        cancelButtonText: '取消'
    }).then(result => {
        if (result.isConfirmed) {
            record.remark = result.value;
            record.editEmpID = window.currentUser.empId;
            record.editName = window.currentUser.name;
            record.editTime = new Date().toLocaleString();
            record.editReason = "手動編輯備註"; // 或再開一個輸入框給理由

            renderHandoverHistory();
            updateHandoverActionAPI(record.id, record.checkStatus, result.value, 'edit');
            Swal.fire('成功', '備註已更新！', 'success');
        }
    });
};

// ✨ 通報邏輯
window.reportHandover = function(id) {
    const record = window.handoverList.find(r => r.id === id);
    if (!record) return;

    Swal.fire({
        title: '⚠️ 異常通報',
        input: 'textarea',
        inputPlaceholder: '請詳細描述異常狀況...',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ffc107',
        cancelButtonColor: '#6c757d',
        confirmButtonText: '送出通報'
    }).then(result => {
        if (result.isConfirmed && result.value) {
            record.reportReason = result.value;
            record.reportEmpID = window.currentUser.empId;
            record.reportName = window.currentUser.name;
            record.reportTime = new Date().toLocaleString();
            record.reportStatus = '未處理';

            renderHandoverHistory();
            updateHandoverActionAPI(record.id, record.checkStatus, result.value, 'report');
            Swal.fire('通報成功', '已送出異常通報給管理員。', 'success');
        }
    });
};

// ==========================================
// ✨ 修正：將不同操作分流為獨立的 API Action，避免資料互相覆蓋
// ==========================================
async function updateHandoverActionAPI(id, status, reason, actionType) {
    const record = window.handoverList.find(r => r.id === id);
    if (!record) return;

    // 基礎共同欄位
    let payload = {
        id: id,
        updateTime: new Date().toLocaleString(),
        operatorEmpID: window.currentUser.empId
    };

    // 依據不同動作，賦予專屬的 action 名稱與對應欄位
    if (actionType === 'complete') {
        payload.action = "completeHandover";
        payload.checkStatus = "已完成";
    } 
    else if (actionType === 'cancel') {
        payload.action = "cancelHandover";
        payload.checkStatus = "已作廢";
        payload.cancelEmpID = record.cancelEmpID;
        payload.cancelName = record.cancelName;
        payload.cancelTime = record.cancelTime;
        payload.cancelReason = reason;
    } 
    else if (actionType === 'edit') {
        payload.action = "editHandover";
        payload.remark = record.remark; // 前端已經在 Swal 確認時更新了
        payload.editEmpID = record.editEmpID;
        payload.editName = record.editName;
        payload.editTime = record.editTime;
        payload.editReason = "手動編輯備註";
    } 
    else if (actionType === 'report') {
        payload.action = "reportHandover";
        payload.reportStatus = "未處理";
        payload.reportEmpID = record.reportEmpID;
        payload.reportName = record.reportName;
        payload.reportTime = record.reportTime;
        payload.reportReason = reason;
    }

    console.log(`🚀 [API 拋轉] 執行動作: ${payload.action}`, payload);

    try {
        await fetch(HANDOVER_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    } catch(e) {
        console.warn(`⚠️ API ${payload.action} 拋轉失敗，目前紀錄暫存於本地。`);
    }
}

// ==========================================
// ✨ 新增：在交班畫面右側顯示當前啟用的管藥結存
// ==========================================
window.renderCurrentInventory = function() {
    const tbody = document.getElementById('handoverInventoryBody');
    if (!tbody || !window.ctrlDrugDB) return;

    // 只篩選出啟用的品項 (雖然 app.js 已經濾過，再加強防呆)
    const activeDrugs = window.ctrlDrugDB.filter(d => d.status !== '停用');

    let html = '';
    activeDrugs.forEach(d => {
        const code = d.code || d.drugCode;
        const name = d.name || d.drugName;
        const qty = d.quantity || 0;
        
        html += `
            <tr>
                <td class="fw-bold">${code}</td>
                <td class="text-start text-truncate" style="max-width:200px;">${name}</td>
                <td class="fs-5 fw-bold text-primary">${qty}</td>
                <td class="text-muted">-</td>
            </tr>
        `;
    });

    if(!html) html = '<tr><td colspan="4" class="text-muted py-5">目前無任何啟用的管藥品項</td></tr>';
    tbody.innerHTML = html;
};
