// ==========================================
// 1. 全域變數與 API 網址
// ==========================================
// 👉 🚨 這是正式版！請務必貼上你在 Power Automate 拿到的「調撥寫入 API」網址
const API_URL = "https://defaultf611cf53b6864814b03558908d4900.be.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/f58bcf2b5f93404bba33ea0e0b5f188b/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=JNv9I2NOeY6j-DXiQhRMP3kaBTuWQcprSMWBRtnOStQ"; 

let recentTransferList = []; 
let tempManualDrug = null;

// ==========================================
// 2. 綁定網頁事件 (DOM 載入完成後執行)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // ✨ 網頁一載入，先從本地硬碟讀取近兩日的紀錄
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
    localStorage.setItem('recentTransferData', JSON.stringify(recentTransferList));
}

function loadTransferListFromLocal() {
    const savedData = localStorage.getItem('recentTransferData');
    if (savedData) {
        try {
            const parsed = JSON.parse(savedData);
            const now = Date.now();
            // ✨ 只保留 rawTime 在 48 小時 (172800000 毫秒) 內的紀錄
            recentTransferList = parsed.filter(item => {
                if (!item.rawTime) return false;
                return (now - item.rawTime) <= 172800000;
            });
            saveTransferListToLocal(); // 把過期的清掉後重新存檔
        } catch(e) {
            recentTransferList = [];
        }
    }
    updateRecentListUI();
}

// ==========================================
// 4. 操作藥師 (模糊搜尋、Enter確認與游標跳轉)
// ==========================================
window.initOperatorAndDept = function() {
    if (!window.currentUser) return;
    setOperator(window.currentUser.empId, window.currentUser.name);
    
    const outDeptSelect = document.getElementById('outDept');
    if (!outDeptSelect) return;
    for(let i = 0; i < outDeptSelect.options.length; i++) {
        if(outDeptSelect.options[i].value === window.currentUser.dept) {
            outDeptSelect.selectedIndex = i; break;
        }
    }
};

function setOperator(id, name) {
    window.currentOperator = { empId: id, name: name };
    const opSearch = document.getElementById('operatorSearchInput');
    if (opSearch) opSearch.value = '';
    
    const opDisplay = document.getElementById('operatorNameDisplay');
    if (opDisplay) opDisplay.innerText = `${name} (${id})`;
}

function resetOperator() {
    if (window.currentUser) {
        setOperator(window.currentUser.empId, window.currentUser.name);
    }
    const opSearch = document.getElementById('operatorSearchInput');
    if (opSearch) {
        opSearch.value = '';
        opSearch.focus(); 
    }
}

function handleOperatorSearch(e) {
    const val = e.target.value.toUpperCase();
    const list = document.getElementById('operator-autocomplete-list');
    list.innerHTML = '';
    if (!val || !window.realUserDB) return; 

    const matches = window.realUserDB.filter(u => u.empId.includes(val) || u.name.includes(val));
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
            alert("❌ 找不到此員編或姓名，請重新輸入");
            this.select(); 
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
// 5. 即時寫入核心 (連動 API)
// ==========================================
async function processDirectEntry(data) {
    const outDept = document.getElementById('outDept').value;
    const inDept = document.getElementById('inDept').value;
    
    if (outDept === inDept) {
        alert("❌ 撥出單位與撥入單位不能相同！"); return false;
    }

    const payload = {
        action: "create",
        itemId: 0,
        ...data,
        outDept: outDept,
        inDept: inDept,
        operatorId: window.currentOperator.empId,
        operatorName: window.currentOperator.name,
        remark: document.getElementById('remarkInput').value.trim()
    };

    const overlay = document.getElementById('loadingOverlay');
    if(overlay) overlay.classList.remove('hidden');

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) throw new Error("API 請求失敗");
        const result = await response.json();
        
        // 賦予 SharePoint ID 與時間戳記
        payload.id = result.newId; 
        payload.timestamp = new Date().toLocaleString();
        payload.rawTime = Date.now(); // ✨ 存入純數字時間，供過濾過期資料使用
        
        // 寫入成功，推入清單最上方並存檔
        recentTransferList.unshift(payload);
        saveTransferListToLocal();
        updateRecentListUI();
        
        document.getElementById('remarkInput').value = ''; 
        return true;
        
    } catch (error) {
        alert("❌ 寫入資料庫失敗，請檢查網路連線。");
        console.error(error);
        return false;
    } finally {
        if(overlay) overlay.classList.add('hidden');
    }
}

// ==========================================
// 6. 條碼解析與觸發
// ==========================================
async function handleBarcodeScan(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        const raw = this.value.trim();
        if(!raw) return;

        const parts = raw.split(';');
        if(parts.length >= 4) {
            const drugCode = parts[1].toUpperCase();
            if (!window.realDrugDB || window.realDrugDB.length === 0) {
                alert("藥品資料庫未載入或為空！"); return;
            }

            const drug = window.realDrugDB.find(d => d.code === drugCode) || { name: "未知藥品", sap: "未知" };
            
            await processDirectEntry({
                mode: "條碼", raw: raw, patientNo: parts[0],
                drugCode: drugCode, sap: drug.sap, drugName: drug.name,
                prescribeNo: parts[2], quantity: parseInt(parts[3]) || 0
            });
        } else { 
            alert("❌ 條碼格式錯誤"); 
        }
        
        this.value = '';
        setTimeout(() => this.focus(), 10);
    }
}

// ==========================================
// 7. 手動搜尋與觸發
// ==========================================
function handleFuzzySearch(e) {
    const val = e.target.value.toUpperCase();
    const list = document.getElementById('autocomplete-list');
    list.innerHTML = '';
    if (!val || !window.realDrugDB) return; 

    const matches = window.realDrugDB.filter(d => 
        (d.code && d.code.includes(val)) || 
        (d.name && d.name.toUpperCase().includes(val)) || 
        (d.sap && d.sap.includes(val))
    ).slice(0, 15); 

    matches.forEach(drug => {
        const item = document.createElement('div');
        item.innerHTML = `<strong>${drug.code}</strong> - ${drug.name} <small class="text-muted">(${drug.sap})</small>`;
        item.addEventListener('click', () => {
            e.target.value = ''; 
            list.innerHTML = '';
            tempManualDrug = drug;
            document.getElementById('manualSelectedDrug').value = `${drug.code} - ${drug.name}`;
            document.getElementById('manualQtySection').classList.remove('hidden');
            const qtyInput = document.getElementById('manualQtyInput');
            if (qtyInput) {
                qtyInput.value = '';
                qtyInput.focus();
            }
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
            mode: "手動", raw: "", patientNo: "", prescribeNo: "",
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
// 8. 右側清單渲染與 (修改/刪除) API 串接
// ==========================================
function updateRecentListUI() {
    const listDiv = document.getElementById('recentList');
    const queueCount = document.getElementById('queueCount');
    if (queueCount) queueCount.innerText = `${recentTransferList.length} 筆`;
    
    if(recentTransferList.length === 0) {
        listDiv.innerHTML = '<div class="text-center text-muted mt-5">目前無資料</div>';
        return;
    }

    listDiv.innerHTML = '';

    recentTransferList.forEach(item => {
        const html = `
            <div class="card queue-card mb-2 p-3 shadow-sm border-0 border-start border-4 border-primary">
                <div class="d-flex justify-content-between align-items-start mb-2">
                    <div>
                        <span class="badge bg-secondary me-2">${item.mode}</span>
                        <strong class="text-dark">${item.drugCode} <small class="text-muted fw-normal ms-1">(${item.sap})</small></strong>
                        ${item.prescribeNo ? `<span class="badge bg-info text-dark ms-2">領藥號: ${item.prescribeNo}</span>` : ''}
                    </div>
                    <small class="text-muted" style="font-size: 0.75rem;">${item.timestamp}</small>
                </div>
                <div class="fw-bold text-dark mb-2">${item.drugName}</div>
                ${item.remark ? `<div class="small text-danger mb-2">備註：${item.remark}</div>` : ''}
                
                <div class="row align-items-end mt-1">
                    <div class="col-7 small text-muted">
                        <div>👤 ${item.operatorName} (${item.operatorId})</div>
                        <div>🔄 ${item.outDept} ➔ ${item.inDept}</div>
                    </div>
                    <div class="col-5 text-end d-flex align-items-center justify-content-end">
                        <strong class="fs-5 text-primary me-3">Qty: ${item.quantity}</strong>
                        <div class="btn-group">
                            <button class="btn btn-sm btn-outline-secondary" onclick="window.editItem('${item.id}', ${item.quantity})">✏️</button>
                            <button class="btn btn-sm btn-outline-danger" onclick="window.deleteItem('${item.id}')">🗑️</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        listDiv.insertAdjacentHTML('beforeend', html);
    });
}

window.editItem = async function(id, currentQty) {
    // 🛡️ 防呆 1：檢查 ID 是否為有效數字
    const parsedId = parseInt(id, 10);
    if (isNaN(parsedId)) {
        alert("❌ 無效的資料庫 ID！這可能是測試模式殘留的資料，請重新刷入一筆新資料進行測試。");
        return;
    }

    const inputStr = prompt("請輸入修改後的數量：", currentQty);
    if(inputStr === null) return;
    
    const newQty = parseInt(inputStr);
    if(isNaN(newQty) || newQty <= 0 || newQty === currentQty) return;

    const target = recentTransferList.find(i => i.id === id);
    if(!target) return;

    try {
        // ✨ 完美對齊 Power Automate 結構，過濾掉前端專用的時間戳記
        const payload = {
            action: "update",
            itemId: parsedId,
            mode: target.mode || "",
            raw: target.raw || "",
            patientNo: target.patientNo || "",
            prescribeNo: target.prescribeNo || "",
            drugCode: target.drugCode || "",
            sap: target.sap || "",
            drugName: target.drugName || "",
            quantity: newQty,
            outDept: target.outDept || "",
            inDept: target.inDept || "",
            operatorId: target.operatorId || "",
            operatorName: target.operatorName || "",
            remark: target.remark || ""
        };

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) throw new Error(`伺服器回傳 ${response.status}`);
        
        // 更新成功，修改本地記憶並存檔
        target.quantity = newQty;
        saveTransferListToLocal();
        updateRecentListUI();
        
    } catch (e) {
        alert("❌ 更新失敗，請檢查網路狀態。\n(錯誤原因: " + e.message + ")");
        console.error(e);
    } finally {
        focusCorrectInput(); 
    }
};

window.deleteItem = async function(id) {
    // 🛡️ 防呆 1：檢查 ID 是否為有效數字
    const parsedId = parseInt(id, 10);
    if (isNaN(parsedId)) {
        alert("❌ 無效的資料庫 ID！這可能是測試模式殘留的資料，請重新刷入一筆新資料進行測試。");
        return;
    }

    if(!confirm("確定要將此筆紀錄從資料庫刪除嗎？")) return;

    const target = recentTransferList.find(i => i.id === id);
    if(!target) return;

    try {
        // ✨ 完美對齊 Power Automate 結構
        const payload = {
            action: "delete",
            itemId: parsedId,
            mode: target.mode || "",
            raw: target.raw || "",
            patientNo: target.patientNo || "",
            prescribeNo: target.prescribeNo || "",
            drugCode: target.drugCode || "",
            sap: target.sap || "",
            drugName: target.drugName || "",
            quantity: target.quantity || 0,
            outDept: target.outDept || "",
            inDept: target.inDept || "",
            operatorId: target.operatorId || "",
            operatorName: target.operatorName || "",
            remark: target.remark || ""
        };

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) throw new Error(`伺服器回傳 ${response.status}`);
        
        // 刪除成功，從陣列剔除並存檔
        recentTransferList = recentTransferList.filter(item => item.id !== id);
        saveTransferListToLocal();
        updateRecentListUI();
        
    } catch (e) {
        alert("❌ 刪除失敗，請檢查網路狀態。\n(錯誤原因: " + e.message + ")");
        console.error(e);
    } finally {
        focusCorrectInput(); 
    }
};
