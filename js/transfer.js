// ==========================================
// 1. 全域變數與 API 網址
// ==========================================
// 👉 調撥寫入 API 網址 (與管藥不同，請確認正確)
const API_URL = "https://defaultf611cf53b6864814b03558908d4900.be.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/f58bcf2b5f93404bba33ea0e0b5f188b/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=JNv9I2NOeY6j-DXiQhRMP3kaBTuWQcprSMWBRtnOStQ"; 

let transferList = []; 
let tempManualDrug = null;
window.transferTimeFilter = 'today'; // 預設顯示今日紀錄
let transCurrentFocus = -1; //

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
// 寫入核心 (連動 API)
// ==========================================
async function processDirectEntry(data) {
    const outDept = document.getElementById('outDept').value;
    const inDept = document.getElementById('inDept').value;
    if (outDept === inDept) { alert("❌ 撥出與撥入單位不能相同！"); return false; }

    // ✨ 這裡就是 Payload (要傳給 Power Automate 的資料包裹)
    const payload = {
        action: "createTransfer", 
        itemId: 0,
        mode: data.mode,
        raw: data.raw,
        patientNo: data.patientNo,
        prescribeNo: data.prescribeNo,
        prescribeDate: data.prescribeDate || "", // ✨ 已經幫你把處方日期放進包裹了
        drugCode: data.drugCode,
        sap: data.sap,
        drugName: data.drugName,
        quantity: data.quantity,
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
            if (!window.realDrugDB || window.realDrugDB.length === 0) return;
            const drug = window.realDrugDB.find(d => d.code === drugCode) || { name: "未知藥品", sap: "未知" };
            
            // ✨ 解析處方日期
            let parsedDate = "";
            if (parts.length >= 5 && parts[4].length >= 9) {
                const dStr = parts[4].substring(1, 9); 
                if (!isNaN(dStr)) parsedDate = `${dStr.substring(0,4)}-${dStr.substring(4,6)}-${dStr.substring(6,8)}`;
            }
            
            await processDirectEntry({
                mode: "條碼", raw: raw, patientNo: parts[0], prescribeNo: parts[2], prescribeDate: parsedDate,
                drugCode: drugCode, sap: drug.sap, drugName: drug.name, quantity: parseInt(parts[3]) || 0
            });
        } else { alert("❌ 條碼格式錯誤"); }
        this.value = ''; setTimeout(() => this.focus(), 10);
    }
}

// ✨ 鍵盤控制邏輯
document.addEventListener('DOMContentLoaded', () => {
    const drugSearchInput = document.getElementById('drugSearchInput');
    if (drugSearchInput) {
        drugSearchInput.addEventListener('keydown', function(e) {
            let list = document.getElementById('autocomplete-list');
            if (list) list = list.getElementsByTagName('div');
            if (e.key === 'ArrowDown') {
                transCurrentFocus++; addTransActive(list);
            } else if (e.key === 'ArrowUp') {
                transCurrentFocus--; addTransActive(list);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (transCurrentFocus > -1 && list) list[transCurrentFocus].click();
            }
        });
    }
});

function addTransActive(x) {
    if (!x) return false;
    for (let i = 0; i < x.length; i++) x[i].classList.remove("autocomplete-active");
    if (transCurrentFocus >= x.length) transCurrentFocus = 0;
    if (transCurrentFocus < 0) transCurrentFocus = (x.length - 1);
    x[transCurrentFocus].classList.add("autocomplete-active");
}

function handleFuzzySearch(e) {
    const val = e.target.value.toUpperCase();
    const list = document.getElementById('autocomplete-list');
    list.innerHTML = ''; transCurrentFocus = -1;
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
            if (qtyInput) { qtyInput.value = ''; qtyInput.focus(); } // ✨ 游標自動跳轉
        });
        list.appendChild(item);
    });
}

async function handleManualQtyEnter(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        const qty = parseInt(this.value, 10);
        if(isNaN(qty) || qty <= 0) { alert("請輸入正確數量"); return; }
        
        // ✨ 優化：一般調撥手動輸入不再需要處方日期，直接傳送空字串
        const success = await processDirectEntry({
            mode: "手動", raw: "手動輸入", patientNo: "無", prescribeNo: "無",
            prescribeDate: "", 
            drugCode: tempManualDrug.code, sap: tempManualDrug.sap,
            drugName: tempManualDrug.name, quantity: qty
        });
        
        if(success) {
            document.getElementById('manualQtySection').classList.add('hidden');
            tempManualDrug = null; 
            focusCorrectInput(); 
        }
    }
}

// ==========================================
// 7. ✨ 右側清單渲染 (加入智慧單位流向顯示)
// ==========================================
function updateTransferListUI() {
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
        const isVoided = item.recordStatus === '已作廢' || item.recordStatus === '已作废';
        const cardStyle = isVoided ? 'border-secondary bg-light opacity-75' : 'border-primary';
        const badgeColor = isVoided ? 'bg-secondary' : 'bg-primary';
        const qtyClass = isVoided ? 'text-secondary' : 'text-primary';
        const statusText = isVoided ? ' (已作廢)' : '';
        
        // ✨ 新增：智慧判斷調撥流向 (相對於登入者的單位)
        const myStation = window.currentUser ? window.currentUser.station : '';
        let directionText = '';
        if (item.outDept === myStation) {
            // 如果我們是撥出方
            directionText = `撥至 ${item.inDept}`;
        } else if (item.inDept === myStation) {
            // 如果我們是接收方
            directionText = `自 ${item.outDept} 撥入`;
        } else {
            // 例外情況 (如管理員看到其他單位的互調)
            directionText = `${item.outDept} ➔ ${item.inDept}`;
        }
        
        html += `
            <div class="card mb-2 p-3 shadow-sm border-0 border-start border-4 ${cardStyle}" id="transfer-card-${item.id}">
                <div class="d-flex justify-content-between align-items-start mb-1">
                    <div>
                        <span class="badge ${badgeColor} me-2">${directionText}${statusText}</span>
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

    if (typeof window.updateTransHistoryTableUI === 'function') window.updateTransHistoryTableUI();
}

// ==========================================
// 8. 修改 / 作廢 / 復原 / 通報 API 串接 (支援本地與雲端資料雙向查找)
// ==========================================
window.editTransferItem = async function(id, currentQty) {
    const parsedId = parseInt(id, 10);
    if (isNaN(parsedId)) { Swal.fire('錯誤', '資料未同步。', 'error'); return; }
    
    // ✨ 同時在本地記憶和 API 暫存中尋找這筆資料
    let target = transferList.find(i => String(i.id) === String(id));
    if (!target && window.transApiDataCache) target = window.transApiDataCache.find(i => String(i.id) === String(id));
    if(!target) return;

    const recordInfo = `<div class="text-start p-3 bg-light rounded border mb-3"><strong>📦 藥品：</strong>${target.drugName}<br><strong>🔄 單位：</strong>${target.outDept} ➔ ${target.inDept}</div>`;

    const { value: newQty } = await Swal.fire({
        title: '✏️ 修改調撥數量',
        html: recordInfo + `請輸入修改後的數量：`,
        input: 'number',
        inputValue: currentQty,
        showCancelButton: true,
        confirmButtonColor: '#0d6efd',
        cancelButtonText: '取消',
        confirmButtonText: '確認修改',
        inputValidator: (value) => { if (!value || value <= 0) return '請輸入有效的正整數！'; }
    });

    if (!newQty || parseInt(newQty, 10) === currentQty) return;

    try {
        const payload = { action: "updateTransfer", itemId: parsedId, quantity: parseInt(newQty, 10), operatorId: window.currentUser.empId, operatorName: window.currentUser.name };
        const response = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!response.ok) throw new Error();
        
        target.quantity = parseInt(newQty, 10); target.timestamp = new Date().toLocaleString() + " (已修改)";
        
        if (transferList.find(i => String(i.id) === String(id))) { saveTransferListToLocal(); updateTransferListUI(); }
        if (typeof window.fetchTransHistoryFromDB === 'function') window.fetchTransHistoryFromDB();
        
        Swal.fire({ title: '修改成功', icon: 'success', timer: 1500, showConfirmButton: false });
    } catch (e) { Swal.fire('錯誤', '修改失敗。', 'error'); }
};

window.voidTransferItem = async function(id) {
    const parsedId = parseInt(id, 10);
    if (isNaN(parsedId)) { Swal.fire('錯誤', '資料未同步。', 'error'); return; }
    
    let target = transferList.find(i => String(i.id) === String(id));
    if (!target && window.transApiDataCache) target = window.transApiDataCache.find(i => String(i.id) === String(id));
    if(!target) return;

    const recordInfo = `<div class="text-start p-3 bg-danger bg-opacity-10 rounded border border-danger mb-3"><strong>📦 藥品：</strong>${target.drugName}<br><strong>🔢 數量：</strong>${target.quantity}<br><strong>🔄 流向：</strong>${target.outDept} ➔ ${target.inDept}</div>`;

    const { value: voidReason } = await Swal.fire({
        title: '🚨 調撥作廢',
        html: recordInfo + '請輸入作廢/退回理由：',
        input: 'text',
        showCancelButton: true,
        confirmButtonColor: '#dc3545',
        cancelButtonText: '取消',
        confirmButtonText: '確定作廢',
        inputValidator: (value) => { if (!value || !value.trim()) return '必須輸入理由！'; }
    });

    if (!voidReason) return;

    try {
        const payload = { action: "voidTransfer", itemId: parsedId, voidReason: voidReason, operatorId: window.currentUser.empId, operatorName: window.currentUser.name };
        const response = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!response.ok) throw new Error();
        const result = await response.json();

        target.recordStatus = "已作廢";
        if (result.newVoidReason) target.voidReason = result.newVoidReason; else target.voidReason = voidReason;
        
        if (transferList.find(i => String(i.id) === String(id))) { saveTransferListToLocal(); updateTransferListUI(); }
        if (typeof window.fetchTransHistoryFromDB === 'function') window.fetchTransHistoryFromDB();
        
        Swal.fire({ title: '已作廢', icon: 'success', timer: 1500, showConfirmButton: false });
    } catch (e) { Swal.fire('錯誤', '作廢失敗。', 'error'); }
};

window.restoreTransferItem = async function(id) {
    const parsedId = parseInt(id, 10);
    let target = transferList.find(i => String(i.id) === String(id));
    if (!target && window.transApiDataCache) target = window.transApiDataCache.find(i => String(i.id) === String(id));
    if(!target) return;

    const recordInfo = `<div class="text-start p-3 bg-light rounded border border-success mb-3"><strong>📦 藥品：</strong>${target.drugName}<br><strong>🗑️ 原作廢理由：</strong>${target.voidReason}</div>`;

    const { value: restoreReason } = await Swal.fire({
        title: '♻️ 取消作廢',
        html: recordInfo + '請輸入取消作廢的理由：',
        input: 'text',
        showCancelButton: true,
        confirmButtonColor: '#198754',
        cancelButtonText: '取消',
        confirmButtonText: '確認復原',
        inputValidator: (value) => { if (!value) return '請輸入取消作廢理由！'; }
    });

    if(!restoreReason) return; 

    try {
        const payload = { action: "restoreTransfer", itemId: parsedId, voidReason: restoreReason, operatorId: window.currentUser.empId, operatorName: window.currentUser.name };
        const response = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!response.ok) throw new Error();
        const result = await response.json();

        target.recordStatus = "正常";
        if (result.newVoidReason) target.voidReason = result.newVoidReason;
        
        if (transferList.find(i => String(i.id) === String(id))) { saveTransferListToLocal(); updateTransferListUI(); }
        if (typeof window.fetchTransHistoryFromDB === 'function') window.fetchTransHistoryFromDB();
        
        Swal.fire({ title: '復原成功', icon: 'success', timer: 1500, showConfirmButton: false });
    } catch (e) { Swal.fire('錯誤', '復原失敗。', 'error'); }
};

window.reportAnomalyTransferItem = async function(id) {
    const parsedId = parseInt(id, 10);
    if (isNaN(parsedId)) { Swal.fire('錯誤', '資料未同步。', 'error'); return; }
    
    let target = transferList.find(i => String(i.id) === String(id));
    if (!target && window.transApiDataCache) target = window.transApiDataCache.find(i => String(i.id) === String(id));
    if(!target) return;

    if (target.reportStatus === '未處理' || target.reportStatus === '處理中' || target.reportStatus === '已結案') {
        Swal.fire({ title: '⚠️ 通報狀態', html: `<div class="text-start"><strong>【狀態】：</strong>${target.reportStatus}<br><br><strong>【內容】：</strong><br>${target.reportReason}<br><br><strong>【批示】：</strong><br>${target.managerResult || '尚未批示'}</div>`, icon: 'info' });
        return;
    }

    const recordInfo = `<div class="text-start p-3 bg-warning bg-opacity-10 rounded border border-warning mb-3"><strong>📦 藥品：</strong>${target.drugName}<br><strong>🔄 單位：</strong>${target.outDept} ➔ ${target.inDept}</div>`;

    const { value: reportReason } = await Swal.fire({
        title: '⚠️ 異常通報',
        html: recordInfo + '請描述調撥異常狀況：',
        input: 'textarea',
        showCancelButton: true,
        confirmButtonColor: '#ffc107',
        cancelButtonText: '取消',
        confirmButtonText: '送出通報',
        inputValidator: (value) => { if (!value || !value.trim()) return '請輸入異常狀況！'; }
    });

    if (!reportReason) return;

    try {
        const payload = { action: "reportAnomalyTransfer", itemId: parsedId, reportReason: reportReason, operatorId: window.currentUser.empId, operatorName: window.currentUser.name };
        const response = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!response.ok) throw new Error();
        const result = await response.json();

        target.reportStatus = "未處理";
        if (result.newReportReason) target.reportReason = result.newReportReason; else target.reportReason = reportReason;

        if (transferList.find(i => String(i.id) === String(id))) { saveTransferListToLocal(); updateTransferListUI(); }
        if (typeof window.fetchTransHistoryFromDB === 'function') window.fetchTransHistoryFromDB();
        
        Swal.fire({ title: '通報已送出', icon: 'success', timer: 1500, showConfirmButton: false });
    } catch (e) { Swal.fire('錯誤', '通報失敗。', 'error'); }
};
