// ==========================================
// 1. 全域變數與 API 網址
// ==========================================
// 👉 調撥寫入 API 網址 (與管藥不同，請確認正確)
const API_URL = "https://defaultf611cf53b6864814b03558908d4900.be.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/f58bcf2b5f93404bba33ea0e0b5f188b/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=JNv9I2NOeY6j-DXiQhRMP3kaBTuWQcprSMWBRtnOStQ"; 

let transferList = []; 
let tempManualDrug = null;
window.transferTimeFilter = 'today'; // 預設顯示今日紀錄

// ==========================================
// 2. 綁定網頁事件 (DOM 載入完成後執行)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    loadTransferListFromLocal();

    const opSearch = document.getElementById('operatorSearchInput');
    if (opSearch) {
        opSearch.addEventListener('input', handleOperatorSearch);
        opSearch.addEventListener('keypress', handleOperatorEnter); 
    }
    const resetOpBtn = document.getElementById('resetOperatorBtn');
    if (resetOpBtn) resetOpBtn.addEventListener('click', resetOperator);
    
    const modeBarcode = document.getElementById('modeBarcode');
    if (modeBarcode) modeBarcode.addEventListener('change', toggleInputMode);
    
    const modeManual = document.getElementById('modeManual');
    if (modeManual) modeManual.addEventListener('change', toggleInputMode);
    
    const barcodeInput = document.getElementById('barcodeInput');
    if (barcodeInput) barcodeInput.addEventListener('keypress', handleBarcodeScan);
    
    const drugSearchInput = document.getElementById('drugSearchInput');
    if (drugSearchInput) drugSearchInput.addEventListener('input', handleFuzzySearch);
    
    const manualQtyInput = document.getElementById('manualQtyInput');
    if (manualQtyInput) manualQtyInput.addEventListener('keypress', handleManualQtyEnter);

    const outDeptSelect = document.getElementById('outDept');
    if (outDeptSelect) outDeptSelect.addEventListener('change', (e) => localStorage.setItem('savedOutDept', e.target.value));
    
    const inDeptSelect = document.getElementById('inDept');
    if (inDeptSelect) inDeptSelect.addEventListener('change', (e) => localStorage.setItem('savedInDept', e.target.value));
    
    // ✨ 綁定今日/近兩日切換按鈕
    const timeToday = document.getElementById('transferTimeToday');
    if (timeToday) {
        timeToday.addEventListener('change', () => {
            window.transferTimeFilter = 'today';
            document.getElementById('transferListTitle').innerText = '今日調撥操作紀錄';
            updateTransferListUI();
        });
    }
    const timeTwoDays = document.getElementById('transferTimeTwoDays');
    if (timeTwoDays) {
        timeTwoDays.addEventListener('change', () => {
            window.transferTimeFilter = '2days';
            document.getElementById('transferListTitle').innerText = '近兩日調撥操作紀錄';
            updateTransferListUI();
        });
    }

    document.addEventListener("click", function (e) {
        if (e.target !== document.getElementById('operatorSearchInput')) {
            const list = document.getElementById('operator-autocomplete-list');
            if (list) list.innerHTML = '';
        }
    });
});

// ==========================================
// 3. 本地記憶保存機制 (Local Storage)
// ==========================================
function saveTransferListToLocal() {
    localStorage.setItem('transferData', JSON.stringify(transferList));
}

function loadTransferListFromLocal() {
    const savedData = localStorage.getItem('transferData');
    if (savedData) {
        try {
            const parsed = JSON.parse(savedData);
            const now = Date.now();
            // 只保留 rawTime 在 48 小時內的紀錄
            transferList = parsed.filter(item => item.rawTime && (now - item.rawTime) <= 172800000);
            saveTransferListToLocal(); 
        } catch(e) { transferList = []; }
    } else {
        transferList = [];
    }
    updateTransferListUI(); // ✨ 這裡正確呼叫新的 UI 渲染函數
}

// ==========================================
// 4. 操作藥師與單位初始化
// ==========================================
window.initOperatorAndDept = function() {
    if (!window.currentUser) return;
    setOperator(window.currentUser.empId, window.currentUser.name);
    
    const outDeptSelect = document.getElementById('outDept');
    const inDeptSelect = document.getElementById('inDept');
    
    const savedOutDept = localStorage.getItem('savedOutDept');
    const savedInDept = localStorage.getItem('savedInDept');

    if (outDeptSelect) {
        if (savedOutDept) {
            outDeptSelect.value = savedOutDept; 
        } else {
            for(let i = 0; i < outDeptSelect.options.length; i++) {
                if(outDeptSelect.options[i].value === window.currentUser.dept) {
                    outDeptSelect.selectedIndex = i; break;
                }
            }
        }
    }
    if (inDeptSelect && savedInDept) inDeptSelect.value = savedInDept; 
};

function setOperator(id, name) {
    window.currentOperator = { empId: id, name: name };
    const opSearch = document.getElementById('operatorSearchInput');
    if (opSearch) opSearch.value = '';
    const opDisplay = document.getElementById('operatorNameDisplay');
    if (opDisplay) opDisplay.innerText = `${name} (${id})`;
}

function resetOperator() {
    if (window.currentUser) setOperator(window.currentUser.empId, window.currentUser.name);
    const opSearch = document.getElementById('operatorSearchInput');
    if (opSearch) { opSearch.value = ''; opSearch.focus(); }
}

function handleOperatorSearch(e) {
    const val = e.target.value.toUpperCase();
    const list = document.getElementById('operator-autocomplete-list');
    list.innerHTML = '';
    if (!val || !window.realUserDB) return; 

    const matches = window.realUserDB.filter(u => u.empId.includes(val) || u.name.includes(val)).slice(0,10);
    matches.forEach(user => {
        const item = document.createElement('div');
        item.innerHTML = `<strong>${user.empId}</strong> - ${user.name}`;
        item.addEventListener('click', () => {
            setOperator(user.empId, user.name);
            list.innerHTML = '';
            focusCorrectInput(); 
        });
        list.appendChild(item);
    });
}

function handleOperatorEnter(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        const val = this.value.trim().toUpperCase();
        if (!val || !window.realUserDB) return;
        const user = window.realUserDB.find(u => u.empId.toUpperCase() === val || u.name === val);
        if (user) {
            setOperator(user.empId, user.name);
            document.getElementById('operator-autocomplete-list').innerHTML = ''; 
            focusCorrectInput(); 
        } else {
            alert("❌ 找不到此員編或姓名"); this.select(); 
        }
    }
}

function focusCorrectInput() {
    const modeBarcode = document.getElementById('modeBarcode');
    if(modeBarcode && modeBarcode.checked) {
        const barcodeInput = document.getElementById('barcodeInput');
        if (barcodeInput) barcodeInput.focus();
    } else {
        const searchInput = document.getElementById('drugSearchInput');
        if (searchInput) searchInput.focus();
    }
}

function toggleInputMode() {
    document.getElementById('manualQtySection').classList.add('hidden');
    tempManualDrug = null;
    if(document.getElementById('modeBarcode').checked) {
        document.getElementById('barcodeSection').classList.remove('hidden');
        document.getElementById('manualSection').classList.add('hidden');
        document.getElementById('barcodeInput').focus();
    } else {
        document.getElementById('barcodeSection').classList.add('hidden');
        document.getElementById('manualSection').classList.remove('hidden');
        document.getElementById('drugSearchInput').value = '';
        document.getElementById('drugSearchInput').focus();
    }
}

// ==========================================
// 5. 寫入核心 (連動 API)
// ==========================================
async function processDirectEntry(data) {
    const outDept = document.getElementById('outDept').value;
    const inDept = document.getElementById('inDept').value;
    if (outDept === inDept) { alert("❌ 撥出與撥入單位不能相同！"); return false; }

    const payload = {
        action: "createTransfer", // ✨ 建立調撥
        itemId: 0,
        ...data,
        actionType: "調出",
        outDept: outDept,
        inDept: inDept,
        operatorId: window.currentOperator.empId,
        operatorName: window.currentOperator.name,
        remark: document.getElementById('remarkInput').value.trim(),
        recordStatus: "正常"
    };

    const overlay = document.getElementById('loadingOverlay');
    if(overlay) overlay.classList.remove('hidden');

    try {
        const response = await fetch(API_URL, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error();
        const result = await response.json();
        
        payload.id = result.newId.toString(); 
        payload.timestamp = new Date().toLocaleString();
        payload.rawTime = Date.now(); 
        
        transferList.unshift(payload);
        saveTransferListToLocal();
        updateTransferListUI();
        
        document.getElementById('remarkInput').value = ''; 
        return true;
    } catch (error) {
        alert("❌ 寫入失敗，請檢查網路連線。"); return false;
    } finally {
        if(overlay) overlay.classList.add('hidden');
    }
}

// ==========================================
// 6. 條碼解析與手動搜尋
// ==========================================
async function handleBarcodeScan(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        const raw = this.value.trim();
        if(!raw) return;

        const parts = raw.split(';');
        if(parts.length >= 4) {
            const drugCode = parts[1].toUpperCase();
            if (!window.realDrugDB || window.realDrugDB.length === 0) { alert("藥品庫未載入"); return; }
            const drug = window.realDrugDB.find(d => d.code === drugCode) || { name: "未知藥品", sap: "未知" };
            
            await processDirectEntry({
                mode: "條碼", raw: raw, patientNo: parts[0],
                drugCode: drugCode, sap: drug.sap, drugName: drug.name,
                prescribeNo: parts[2], quantity: parseInt(parts[3]) || 0
            });
        } else { alert("❌ 條碼格式錯誤"); }
        this.value = ''; setTimeout(() => this.focus(), 10);
    }
}

function handleFuzzySearch(e) {
    const val = e.target.value.toUpperCase();
    const list = document.getElementById('autocomplete-list');
    list.innerHTML = '';
    if (!val || !window.realDrugDB) return; 

    const matches = window.realDrugDB.filter(d => 
        (d.code && d.code.includes(val)) || (d.name && d.name.toUpperCase().includes(val)) || (d.sap && d.sap.includes(val))
    ).slice(0, 15); 

    matches.forEach(drug => {
        const item = document.createElement('div');
        item.innerHTML = `<strong>${drug.code}</strong> - ${drug.name} <small class="text-muted">(${drug.sap})</small>`;
        item.addEventListener('click', () => {
            e.target.value = ''; list.innerHTML = ''; tempManualDrug = drug;
            document.getElementById('manualSelectedDrug').value = `${drug.code} - ${drug.name}`;
            document.getElementById('manualQtySection').classList.remove('hidden');
            const qtyInput = document.getElementById('manualQtyInput');
            if (qtyInput) { qtyInput.value = ''; qtyInput.focus(); }
        });
        list.appendChild(item);
    });
}

async function handleManualQtyEnter(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        const qty = parseInt(this.value);
        if(isNaN(qty) || qty <= 0) { alert("請輸入正確數量"); return; }
        const success = await processDirectEntry({
            mode: "手動", raw: "手動輸入", patientNo: "無", prescribeNo: "無",
            drugCode: tempManualDrug.code, sap: tempManualDrug.sap,
            drugName: tempManualDrug.name, quantity: qty
        });
        if(success) {
            document.getElementById('manualQtySection').classList.add('hidden');
            tempManualDrug = null; focusCorrectInput(); 
        }
    }
}

// ==========================================
// 7. ✨ 右側清單渲染 (加入時間過濾與最新 UI)
// ==========================================
function updateTransferListUI() {
    // 支援新版 HTML 的 ID，若無則降級找舊版
    const listDiv = document.getElementById('transferRecentList') || document.getElementById('recentList');
    if(!listDiv) return;

    const todayStr = new Date().toLocaleDateString();
    const filteredList = transferList.filter(item => {
        if (window.transferTimeFilter === 'today') {
            return new Date(item.rawTime).toLocaleDateString() === todayStr;
        }
        return true; 
    });

    const queueCount = document.getElementById('transferQueueCount') || document.getElementById('queueCount');
    if(queueCount) queueCount.innerText = `${filteredList.length} 筆`;
    
    if(filteredList.length === 0) {
        listDiv.innerHTML = `<div class="text-center text-muted mt-5 py-4">此區間尚無調撥紀錄</div>`; return;
    }

    let html = '';
    filteredList.forEach(item => {
        const isVoided = item.recordStatus === '已作廢';
        const cardStyle = isVoided ? 'border-secondary bg-light opacity-75' : 'border-primary';
        const badgeColor = isVoided ? 'bg-secondary' : 'bg-primary';
        const qtyClass = isVoided ? 'text-secondary' : 'text-primary';
        const statusText = isVoided ? ' (已作廢)' : '';
        
        html += `
            <div class="card mb-2 p-3 shadow-sm border-0 border-start border-4 ${cardStyle}" id="transfer-card-${item.id}">
                <div class="d-flex justify-content-between align-items-start mb-1">
                    <div>
                        <span class="badge ${badgeColor} me-2">${item.actionType || '調出'}${statusText}</span>
                        <strong class="${isVoided ? 'text-muted text-decoration-line-through' : 'text-dark'}">${item.drugCode}</strong>
                        ${item.prescribeNo && !item.prescribeNo.includes('手動') && item.prescribeNo !== '無' ? `<span class="badge bg-light text-dark border ms-1">領藥號:${item.prescribeNo}</span>` : ''}
                    </div>
                    <small class="text-muted" style="font-size: 0.7rem;">${item.timestamp.split(' ')[1] || item.timestamp}</small>
                </div>
                <div class="fw-bold ${isVoided ? 'text-muted' : 'text-dark'} small my-1 text-truncate" style="max-width:280px;">${item.drugName}</div>
                ${item.remark ? `<div class="small text-secondary font-monospace" style="font-size:0.8rem;">📝 備註: ${item.remark}</div>` : ''}
                
                <div class="d-flex justify-content-between align-items-center mt-2 pt-1 border-top border-light">
                    <span class="text-muted" style="font-size:0.75rem;">👤 經辦: ${item.operatorName}</span>
                    <div class="col-6 text-end d-flex align-items-center justify-content-end">
                        <strong class="fs-5 ${qtyClass} me-2">${item.quantity}</strong>
                        <div class="btn-group">
                            <button class="btn btn-sm btn-outline-secondary py-0 px-1" style="font-size:0.7rem;" onclick="window.editTransferItem('${item.id}', ${item.quantity})" ${isVoided ? 'disabled' : ''}>✏️</button>
                            ${isVoided 
                                ? `<button class="btn btn-sm btn-outline-success py-0 px-1" style="font-size:0.7rem;" onclick="window.restoreTransferItem('${item.id}')">♻️</button>`
                                : `<button class="btn btn-sm btn-outline-danger py-0 px-1" style="font-size:0.7rem;" onclick="window.voidTransferItem('${item.id}')">🗑️</button>`
                            }
                        </div>
                    </div>
                </div>
            </div>`;
    });
    listDiv.innerHTML = html;

    // ✨ 連動更新全頁大表
    if (typeof window.updateTransHistoryTableUI === 'function') window.updateTransHistoryTableUI();
}

// ==========================================
// 8. 修改 / 作廢 / 復原 / 通報 API 串接
// ==========================================
window.editTransferItem = async function(id, currentQty) {
    const parsedId = parseInt(id, 10);
    if (isNaN(parsedId)) { alert("❌ 資料尚未同步。"); return; }
    const inputStr = prompt(`請輸入修改後的數量：`, currentQty);
    if(inputStr === null) return;
    const newQty = parseInt(inputStr, 10);
    if(isNaN(newQty) || newQty <= 0) return;

    const target = transferList.find(i => i.id === id);
    if(!target) return;

    try {
        const payload = {
            action: "updateTransfer",
            itemId: parsedId,
            quantity: newQty,
            operatorId: window.currentUser.empId,
            operatorName: window.currentUser.name
        };
        const response = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!response.ok) throw new Error();
        
        target.quantity = newQty;
        target.timestamp = new Date().toLocaleString() + " (已修改)";
        saveTransferListToLocal(); updateTransferListUI();
    } catch (e) { alert("❌ 修改失敗。"); }
};

window.voidTransferItem = async function(id) {
    const parsedId = parseInt(id, 10);
    if (isNaN(parsedId)) { alert("❌ 資料尚未同步。"); return; }
    const voidReason = prompt("🚨【調撥作廢】\n請輸入作廢理由：");
    if (!voidReason || !voidReason.trim()) return;

    const target = transferList.find(i => i.id === id);
    if(!target) return;

    try {
        const payload = {
            action: "voidTransfer", 
            itemId: parsedId,
            voidReason: voidReason,
            operatorId: window.currentUser.empId,
            operatorName: window.currentUser.name
        };
        const response = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!response.ok) throw new Error();
        const responseText = await response.text();
        let result = {};
        try { result = JSON.parse(responseText); } catch (e) {}

        target.recordStatus = "已作廢";
        if (result.newVoidReason) target.voidReason = result.newVoidReason;
        else target.voidReason = voidReason;
        
        saveTransferListToLocal(); updateTransferListUI();
        alert("✅ 紀錄已作廢！");
    } catch (e) { alert("❌ 作廢失敗。"); }
};

window.restoreTransferItem = async function(id) {
    const parsedId = parseInt(id, 10);
    const restoreReason = prompt("♻️ 請輸入取消作廢的理由：");
    if(!restoreReason) return; 

    const target = transferList.find(i => i.id === id);
    if(!target) return;

    try {
        const payload = {
            action: "restoreTransfer", 
            itemId: parsedId,
            voidReason: restoreReason,
            operatorId: window.currentUser.empId,
            operatorName: window.currentUser.name
        };
        const response = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!response.ok) throw new Error();
        const responseText = await response.text();
        let result = {};
        try { result = JSON.parse(responseText); } catch (e) {}

        target.recordStatus = "正常";
        if (result.newVoidReason) target.voidReason = result.newVoidReason;
        
        saveTransferListToLocal(); updateTransferListUI();
        alert("✅ 取消作廢成功！");
    } catch (e) { alert("❌ 復原失敗。"); }
};

window.reportAnomalyTransferItem = async function(id) {
    const parsedId = parseInt(id, 10);
    if (isNaN(parsedId)) { alert("❌ 資料未同步。"); return; }
    const target = transferList.find(i => i.id === id);
    if(!target) return;

    if (target.reportStatus === '未處理' || target.reportStatus === '處理中' || target.reportStatus === '已結案') {
        alert(`【通報狀態】：${target.reportStatus}\n【內容】：\n${target.reportReason || '無'}\n【批示】：\n${target.managerResult || '尚未批示'}`);
        return;
    }

    const reportReason = prompt("⚠️ 【異常通報】\n請描述調撥異常狀況：");
    if (!reportReason || !reportReason.trim()) return;

    try {
        const payload = {
            action: "reportAnomalyTransfer", // ✨ 注意這裡的 action 名稱
            itemId: parsedId,
            reportReason: reportReason,
            operatorId: window.currentUser.empId,
            operatorName: window.currentUser.name
        };
        const response = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!response.ok) throw new Error();
        const responseText = await response.text();
        let result = {};
        try { result = JSON.parse(responseText); } catch (e) {}

        target.reportStatus = "未處理";
        if (result.newReportReason) target.reportReason = result.newReportReason;
        else target.reportReason = reportReason;

        saveTransferListToLocal(); updateTransferListUI();
        alert("✅ 異常通報已送出！");
    } catch (e) { alert("❌ 通報失敗。"); }
};
