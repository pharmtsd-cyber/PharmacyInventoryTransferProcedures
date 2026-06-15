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

    // ✨ 解除 HTML 的唯讀限制，讓「交班人」可以手動修改
    const handoverEmpInput = document.getElementById('handoverEmpOutput');
    if (handoverEmpInput) {
        handoverEmpInput.removeAttribute('readonly');
        handoverEmpInput.placeholder = "請輸入交班人員編或姓名...";
        handoverEmpInput.classList.remove('bg-white'); // 移除純白背景樣式讓它看起來像一般輸入框
    }

    // 監聽點擊交接班頁籤，自動向後端刷新資料
    document.querySelectorAll('#mainTabs .nav-link[data-tab^="ctrl-handover"]').forEach(tab => {
        tab.addEventListener('click', () => {
            if (typeof window.fetchHandoverHistoryFromDB === 'function') {
                window.fetchHandoverHistoryFromDB();
            }
        });
    });
});

// ==========================================
// 1. 初始化與讀取歷史紀錄 (API GET)
// ==========================================
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
        // ✨ GET 歷史交班紀錄
        const response = await fetch(GET_API_URL + "&action=getHandover", { method: 'GET' });
        if (response.ok) {
            const rawFlatData = await response.json();
            
            // 🚀 核心魔法：將 SharePoint 的「扁平化單行資料」轉換為前端需要的「單據巢狀結構」
            const groupedData = {};
            
            rawFlatData.forEach(row => {
                // 應對 Power Automate 回傳的大小寫不一問題
                const id = row.Title || row.標題 || row.id; 
                
                if (!groupedData[id]) {
                    // 若尚未建立該單號，則初始化單據表頭
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
                        snapshot: [] // 初始化藥品快照陣列
                    };
                }
                
                // 把該列的藥品細節塞進 snapshot 陣列中
                if (row.DrugCode || row.drugCode) {
                    groupedData[id].snapshot.push({
                        drugCode: row.DrugCode || row.drugCode,
                        drugName: row.DrugName || row.drugName,
                        theoreticalQty: parseInt(row.TheoreticalQty || row.theoreticalQty || 0, 10),
                        actualQty: parseInt(row.ActualQty || row.actualQty || 0, 10)
                    });
                }
            });
            
            // 將物件轉回陣列，並依照建立時間由新到舊排序
            window.handoverList = Object.values(groupedData).sort((a, b) => new Date(b.createTime) - new Date(a.createTime));
        }
    } catch (error) {
        console.warn("⚠️ 交班紀錄 API 尚未建置或連線失敗，目前使用本地暫存模式運行。");
    } finally {
        checkSystemLockStatus(); // 自動檢查首尾班狀態並上/解鎖
        renderHandoverHistory();
        autoFillHandoverPersonnel(); // 智慧帶入交班人與接班人
    }
};

// ==========================================
// 2. 智慧帶入人員邏輯
// ==========================================
function autoFillHandoverPersonnel() {
    const handoverEmpInput = document.getElementById('handoverEmpOutput');
    const receiverEmpInput = document.getElementById('receiverEmpInput');
    if (!handoverEmpInput || !receiverEmpInput || !window.currentUser) return;

    // ✨ 邏輯 1：接班人預設為當前登入者 (允許修改)
    if (!receiverEmpInput.value) {
        receiverEmpInput.value = window.currentUser.empId;
    }

    // ✨ 邏輯 2：交班人預設為本單位最近一次「已完成」的【接班人】 (允許修改)
    const completedRecords = window.handoverList.filter(r => r.station === window.currentUser.station && r.checkStatus === '已完成');
    
    if (completedRecords.length > 0) {
        // 陣列已照時間排序，第一筆就是最新
        handoverEmpInput.value = completedRecords[0].receiverEmpID || "";
    } else {
        // 若查無紀錄，留空讓藥師自己填
        if (!handoverEmpInput.value) handoverEmpInput.value = ""; 
    }
}

// ==========================================
// 3. 系統鎖定動態判定
// ==========================================
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
// 4. 產生點班單與快照 (API POST - Create)
// ==========================================
async function generateHandoverRecord() {
    const shiftSelect = document.getElementById('handoverShiftSelect');
    const shiftName = shiftSelect.value;
    const shiftOrder = shiftSelect.options[shiftSelect.selectedIndex]?.dataset?.order;
    const handoverEmp = document.getElementById('handoverEmpOutput').value.trim();
    const receiverEmp = document.getElementById('receiverEmpInput').value.trim();
    const remark = document.getElementById('handoverRemark').value.trim();

    if (!shiftName) { alert("❌ 請選擇交班班別工作！"); return; }
    if (!handoverEmp) { alert("❌ 請輸入交班人！"); return; }
    if (!receiverEmp) { alert("❌ 請輸入接班人！"); return; }

    // ✨ 瞬間快照結存數量 (這裡會去讀取你的管藥主檔目前的數量)
    const snapshot = window.ctrlDrugDB.map(d => ({
        drugCode: d.code || d.drugCode,
        drugName: d.name || d.drugName,
        theoreticalQty: parseInt(d.quantity || 0, 10), // 系統應有量
        actualQty: parseInt(d.quantity || 0, 10)       // 實體量預設與應有量一致
    }));

    const payload = {
        action: "createHandover",
        id: "HO_" + Date.now(),
        station: window.currentUser.station,
        shiftName: shiftName,
        shiftOrder: parseInt(shiftOrder, 10),
        handoverEmpID: handoverEmp,
        receiverEmpID: receiverEmp,
        keyTransferred: shiftName.includes('鑰匙') ? 'Y' : 'N',
        createTime: new Date().toLocaleString(),
        remark: remark,
        checkStatus: "待核對", 
        snapshot: snapshot
    };

    // 先存入本地讓畫面秒切換
    window.handoverList.unshift(payload);
    
    document.getElementById('handoverRemark').value = '';
    alert("✅ 點班單已產生！請至「交接班點交紀錄」核對實體數量。");
    window.switchTab('ctrl-handover-history');
    renderHandoverHistory();

    // ⚡ 非同步拋轉 API
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
// 5. 渲染紀錄大表
// ==========================================
function renderHandoverHistory() {
    const tbody = document.getElementById('handoverHistTableBody');
    if (!tbody) return;

    const filterDate = document.getElementById('handoverHistDate').value;
    const filterStatus = document.getElementById('handoverHistStatus').value;
    const filterOp = document.getElementById('handoverHistOpSearch').value.toUpperCase().trim();
    
    let html = '';
    window.handoverList.forEach(item => {
        // 過濾邏輯
        if (item.station !== window.currentUser.station) return;
        if (filterDate && !item.createTime.includes(filterDate.replace(/-/g, '/'))) return; 
        if (filterStatus !== '全部' && item.checkStatus !== filterStatus) return;
        if (filterOp) {
            const hOp = (item.handoverEmpID || "").toUpperCase();
            const rOp = (item.receiverEmpID || "").toUpperCase();
            if (!hOp.includes(filterOp) && !rOp.includes(filterOp)) return;
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

        html += `
            <tr class="${isVoided ? 'table-secondary text-muted' : (isPending ? 'table-warning' : '')}">
                <td class="font-monospace small">
                    <div>${item.createTime.split(' ')[0]}</div>
                    <div class="text-secondary">${item.createTime.split(' ')[1] || ''}</div>
                </td>
                <td class="fw-bold text-danger">${item.shiftName}</td>
                <td><div class="fw-bold">${item.handoverEmpID}</div></td>
                <td><div class="fw-bold">${item.receiverEmpID}</div></td>
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
// 6. 開啟核對視窗與更新狀態 (API POST - Update)
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
            
            checkSystemLockStatus(); // 自動重新判定鎖定狀態
            renderHandoverHistory();
            updateHandoverStatusAPI(record.id, '已完成'); // API拋轉更新
            
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
            record.cancelTime = new Date().toLocaleString();
            
            renderHandoverHistory();
            updateHandoverStatusAPI(record.id, '已作廢'); // API拋轉更新
            
            Swal.fire('已作廢', '單據已作廢，請盡速修正系統庫存。', 'info');
        }
    });
};

// ==========================================
// 7. 更新狀態 API (API POST - Update)
// ==========================================
async function updateHandoverStatusAPI(id, status) {
    const payload = {
        action: "updateHandoverStatus",
        id: id,
        checkStatus: status,
        updateTime: new Date().toLocaleString(),
        operatorEmpID: window.currentUser.empId
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
