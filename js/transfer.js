// 注意：請將這裡的 URL 換成你在 Power Automate 拿到的網址
const API_URL = "https://prod-XX.region.logic.azure.com:443/workflows/..."; 

let recentTransferList = []; // 存放近日清單
let tempManualDrug = null;

document.addEventListener('DOMContentLoaded', () => {
    // 綁定操作藥師搜尋與重置
    document.getElementById('operatorSearchInput').addEventListener('input', handleOperatorSearch);
    document.getElementById('resetOperatorBtn').addEventListener('click', resetOperator);
    
    // 綁定模式切換
    document.getElementById('modeBarcode').addEventListener('change', toggleInputMode);
    document.getElementById('modeManual').addEventListener('change', toggleInputMode);
    
    // 綁定條碼與手動輸入 Enter
    document.getElementById('barcodeInput').addEventListener('keypress', handleBarcodeScan);
    document.getElementById('drugSearchInput').addEventListener('input', handleFuzzySearch);
    document.getElementById('manualQtyInput').addEventListener('keypress', handleManualQtyEnter);
    
    // 點擊空白處關閉選單
    document.addEventListener("click", function (e) {
        if (e.target !== document.getElementById('operatorSearchInput')) {
            document.getElementById('operator-autocomplete-list').innerHTML = '';
        }
    });
});

// ==========================================
// A. 操作藥師 (模糊搜尋與借位)
// ==========================================
window.initOperatorAndDept = function() {
    setOperator(window.currentUser.empId, window.currentUser.name);
    // 預設單位邏輯維持不變...
    const outDeptSelect = document.getElementById('outDept');
    for(let i = 0; i < outDeptSelect.options.length; i++) {
        if(outDeptSelect.options[i].value === window.currentUser.dept) {
            outDeptSelect.selectedIndex = i; break;
        }
    }
};

function setOperator(id, name) {
    window.currentOperator = { empId: id, name: name };
    document.getElementById('operatorSearchInput').value = ''; // 清空搜尋框
    document.getElementById('operatorNameDisplay').innerText = `${name} (${id})`;
}

function resetOperator() {
    setOperator(window.currentUser.empId, window.currentUser.name);
    focusCorrectInput();
}

function handleOperatorSearch(e) {
    const val = e.target.value.toUpperCase();
    const list = document.getElementById('operator-autocomplete-list');
    list.innerHTML = '';
    if (!val) return; 

    // 搜尋 mockUserDB (姓名或員編)
    const matches = window.mockUserDB.filter(u => u.empId.includes(val) || u.name.includes(val));
    matches.forEach(user => {
        const item = document.createElement('div');
        item.innerHTML = `<strong>${user.empId}</strong> - ${user.name}`;
        item.addEventListener('click', () => {
            setOperator(user.empId, user.name);
            list.innerHTML = '';
            focusCorrectInput(); // 鎖定後自動跳轉去刷條碼
        });
        list.appendChild(item);
    });
}

function focusCorrectInput() {
    if(document.getElementById('modeBarcode').checked) {
        document.getElementById('barcodeInput').focus();
    } else {
        document.getElementById('drugSearchInput').focus();
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
// B. 即時寫入核心 (連動 API)
// ==========================================
async function processDirectEntry(data) {
    const outDept = document.getElementById('outDept').value;
    const inDept = document.getElementById('inDept').value;
    
    if (outDept === inDept) {
        alert("❌ 撥出單位與撥入單位不能相同！"); return false;
    }

    // 封裝 API 所需資料
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

    // UI 顯示 Loading 狀態
    const overlay = document.getElementById('loadingOverlay');
    if(overlay) overlay.classList.remove('hidden');

    try {
        /*
        // 實戰中請解開這段註解來發送真實 API 請求
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await response.json();
        payload.id = result.newId; // 取得 SharePoint 回傳的真實 ID
        */

        // 模擬網路延遲與回傳 ID (供測試用)
        await new Promise(r => setTimeout(r, 600)); 
        payload.id = "SP_" + Date.now(); // 模擬 SharePoint ID
        payload.timestamp = new Date().toLocaleString();

        // 寫入成功，推入本地端近日清單最上方
        recentTransferList.unshift(payload);
        updateRecentListUI();
        
        // 清空備註欄位
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
// C. 條碼解析與觸發
// ==========================================
async function handleBarcodeScan(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        const raw = this.value.trim();
        const parts = raw.split(';');
        
        if(parts.length >= 4) {
            const drugCode = parts[1].toUpperCase();
            const drug = window.mockDrugDB.find(d => d.code === drugCode) || { name: "未知藥品", sap: "未知" };
            
            // 等待 API 寫入完成
            await processDirectEntry({
                mode: "條碼", raw: raw, patientNo: parts[0],
                drugCode: drugCode, sap: drug.sap, drugName: drug.name,
                prescribeNo: parts[2], quantity: parts[3]
            });
        } else { 
            alert("❌ 條碼格式錯誤"); 
        }
        
        this.value = '';
        this.focus(); // 強制游標歸位，準備刷下一袋
    }
}

// ==========================================
// D. 手動搜尋與觸發
// ==========================================
function handleFuzzySearch(e) {
    const val = e.target.value.toUpperCase();
    const list = document.getElementById('autocomplete-list');
    list.innerHTML = '';
    if (!val) return; 

    const matches = window.mockDrugDB.filter(d => d.code.includes(val) || d.name.toUpperCase().includes(val) || d.sap.includes(val));
    matches.forEach(drug => {
        const item = document.createElement('div');
        item.innerHTML = `<strong>${drug.code}</strong> - ${drug.name}`;
        item.addEventListener('click', () => {
            e.target.value = ''; list.innerHTML = '';
            tempManualDrug = drug;
            document.getElementById('manualSelectedDrug').value = `${drug.code} - ${drug.name}`;
            document.getElementById('manualQtySection').classList.remove('hidden');
            const qtyInput = document.getElementById('manualQtyInput');
            qtyInput.value = '';
            qtyInput.focus();
        });
        list.appendChild(item);
    });
}

async function handleManualQtyEnter(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        const qty = this.value;
        if(!qty || qty <= 0) { alert("請輸入正確數量"); return; }
        
        const success = await processDirectEntry({
            mode: "手動", raw: "", patientNo: "", prescribeNo: "",
            drugCode: tempManualDrug.code, sap: tempManualDrug.sap,
            drugName: tempManualDrug.name, quantity: qty
        });
        
        if(success) {
            document.getElementById('manualQtySection').classList.add('hidden');
            tempManualDrug = null;
            document.getElementById('drugSearchInput').focus();
        }
    }
}

// ==========================================
// E. 右側清單渲染與 (修改/刪除) API 串接
// ==========================================
function updateRecentListUI() {
    const listDiv = document.getElementById('recentList');
    document.getElementById('queueCount').innerText = `${recentTransferList.length} 筆`;
    
    if(recentTransferList.length === 0) {
        listDiv.innerHTML = '<div class="text-center text-muted mt-5">目前無資料</div>';
        return;
    }

    listDiv.innerHTML = '';

    recentTransferList.forEach(item => {
        // 卡片 UI (加入領藥號、修改與刪除按鈕)
        const html = `
            <div class="card queue-card mb-2 p-3 shadow-sm border-0 border-start border-4 border-primary">
                <div class="d-flex justify-content-between align-items-start mb-2">
                    <div>
                        <span class="badge bg-secondary me-2">${item.mode}</span>
                        <strong class="text-dark">${item.drugCode}</strong>
                        ${item.prescribeNo ? `<span class="badge bg-info text-dark ms-2">領藥號: ${item.prescribeNo}</span>` : ''}
                    </div>
                    <small class="text-muted" style="font-size: 0.75rem;">${item.timestamp}</small>
                </div>
                <div class="fw-bold text-dark mb-2">${item.drugName}</div>
                ${item.remark ? `<div class="small text-danger mb-2">備註：${item.remark}</div>` : ''}
                
                <div class="row align-items-end mt-1">
                    <div class="col-7 small text-muted">
                        <div>👤 ${item.operatorName}</div>
                        <div>🔄 ${item.outDept} ➔ ${item.inDept}</div>
                    </div>
                    <div class="col-5 text-end d-flex align-items-center justify-content-end">
                        <strong class="fs-5 text-primary me-3">Qty: ${item.quantity}</strong>
                        <div class="btn-group">
                            <button class="btn btn-sm btn-outline-secondary" onclick="window.editItem('${item.id}', '${item.quantity}')">✏️</button>
                            <button class="btn btn-sm btn-outline-danger" onclick="window.deleteItem('${item.id}')">🗑️</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        listDiv.insertAdjacentHTML('beforeend', html);
    });
}

// 觸發修改數量 API
window.editItem = async function(id, currentQty) {
    const newQty = prompt("請輸入修改後的數量：", currentQty);
    if(newQty === null || newQty === currentQty || isNaN(newQty) || newQty <= 0) return;

    /*
    // 呼叫 API 執行 Update
    await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: "update", itemId: id, quantity: newQty })
    });
    */
    
    // 更新本地畫面
    const target = recentTransferList.find(i => i.id === id);
    if(target) target.quantity = newQty;
    updateRecentListUI();
    alert("✅ 數量已更新並寫入資料庫");
    focusCorrectInput();
};

// 觸發刪除 API
window.deleteItem = async function(id) {
    if(!confirm("確定要將此筆紀錄從資料庫刪除嗎？")) return;

    /*
    // 呼叫 API 執行 Delete
    await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: "delete", itemId: id })
    });
    */

    // 更新本地畫面
    recentTransferList = recentTransferList.filter(item => item.id !== id);
    updateRecentListUI();
    focusCorrectInput();
};
