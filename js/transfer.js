// ==========================================
// 1. 全域變數與 API 網址
// ==========================================
// 👉 這裡請貼上你的「調撥單筆處理 API」網址
const API_URL = "https://defaultf611cf53b6864814b03558908d4900.be.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/f58bcf2b5f93404bba33ea0e0b5f188b/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=JNv9I2NOeY6j-DXiQhRMP3kaBTuWQcprSMWBRtnOStQ"; 

let recentTransferList = []; 
let tempManualDrug = null;

// ==========================================
// 2. 綁定網頁事件 (DOM 載入完成後執行)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const opSearch = document.getElementById('operatorSearchInput');
    if (opSearch) {
        opSearch.addEventListener('input', handleOperatorSearch);
        // ✨ 新增：監聽操作藥師輸入框的 Enter 鍵
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
    
    // 點擊空白處關閉藥師模糊搜尋選單
    document.addEventListener("click", function (e) {
        if (e.target !== document.getElementById('operatorSearchInput')) {
            const list = document.getElementById('operator-autocomplete-list');
            if (list) list.innerHTML = '';
        }
    });
});

// ==========================================
// 3. 操作藥師 (模糊搜尋、Enter確認與游標跳轉)
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

// ✨ 優化：點擊重置後，游標自動鎖定在操作藥師輸入框
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
            focusCorrectInput(); // 點擊選單後自動跳轉去刷條碼
        });
        list.appendChild(item);
    });
}

// ✨ 優化：在操作藥師框按下 Enter 的邏輯
function handleOperatorEnter(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        const val = this.value.trim().toUpperCase();
        if (!val || !window.realUserDB) return;

        // 精準尋找員編或姓名完全符合的藥師
        const user = window.realUserDB.find(u => u.empId.toUpperCase() === val || u.name === val);
        
        if (user) {
            setOperator(user.empId, user.name);
            document.getElementById('operator-autocomplete-list').innerHTML = ''; // 關閉下拉選單
            focusCorrectInput(); // ✨ 自動將游標跳轉到條碼框
        } else {
            alert("❌ 找不到此員編或姓名，請重新輸入");
            this.select(); // 選取錯誤文字方便藥師直接重打
        }
    }
}

// 根據當前模式決定游標要去哪裡
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
// 4. 即時寫入核心 (連動 API)
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
        // 🚀 正式呼叫 Power Automate API 
        // (如果你的 API 已經準備好，請確認網址正確，這裡會真實寫入資料庫)
        /*
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error("API 請求失敗");
        const result = await response.json();
        payload.id = result.newId; // 取得 SharePoint 回傳的真實 ID
        */

        // 👉 測試用延遲 (確認 API 可用後，可將上方註解解開，並刪除以下兩行)
        await new Promise(r => setTimeout(r, 400)); 
        payload.id = "SP_" + Date.now(); 
        
        // 寫入成功，推入清單
        payload.timestamp = new Date().toLocaleString();
        recentTransferList.unshift(payload);
        updateRecentListUI();
        
        document.getElementById('remarkInput').value = ''; // 清空備註
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
// 5. 條碼解析與觸發
// ==========================================
async function handleBarcodeScan(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        const raw = this.value.trim();
        if(!raw) return;

        const parts = raw.split(';');
        
        if(parts.length >= 4) {
            const drugCode = parts[1].toUpperCase();
            
            if (!window.mockDrugDB) {
                alert("藥品資料庫未載入！"); return;
            }

            const drug = window.mockDrugDB.find(d => d.code === drugCode) || { name: "未知藥品", sap: "未知" };
            
            await processDirectEntry({
                mode: "條碼", raw: raw, patientNo: parts[0],
                drugCode: drugCode, sap: drug.sap, drugName: drug.name,
                prescribeNo: parts[2], quantity: parseInt(parts[3]) || 0
            });
        } else { 
            alert("❌ 條碼格式錯誤"); 
        }
        
        this.value = '';
        // ✨ 優化：使用 setTimeout 確保游標絕對歸位，不被載入動畫(Overlay)干擾
        setTimeout(() => this.focus(), 10);
    }
}

// ==========================================
// 6. 手動搜尋與觸發
// ==========================================
function handleFuzzySearch(e) {
    const val = e.target.value.toUpperCase();
    const list = document.getElementById('autocomplete-list');
    list.innerHTML = '';
    if (!val || !window.mockDrugDB) return; 

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
            focusCorrectInput(); // 手動輸入完畢後，游標跳回搜尋框
        }
    }
}

// ==========================================
// 7. 右側清單渲染與 (修改/刪除) API 串接
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
                        <strong class="text-dark">${item.drugCode}</strong>
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
    const inputStr = prompt("請輸入修改後的數量：", currentQty);
    if(inputStr === null) return;
    
    const newQty = parseInt(inputStr);
    if(isNaN(newQty) || newQty <= 0 || newQty === currentQty) return;

    /*
    try {
        await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: "update", itemId: id, quantity: newQty })
        });
    } catch (e) {
        alert("更新失敗，請檢查網路"); return;
    }
    */
    
    const target = recentTransferList.find(i => i.id === id);
    if(target) target.quantity = newQty;
    updateRecentListUI();
    focusCorrectInput(); // 操作完成，游標歸位
};

window.deleteItem = async function(id) {
    if(!confirm("確定要將此筆紀錄從資料庫刪除嗎？")) return;

    /*
    try {
        await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: "delete", itemId: id })
        });
    } catch (e) {
        alert("刪除失敗，請檢查網路"); return;
    }
    */

    recentTransferList = recentTransferList.filter(item => item.id !== id);
    updateRecentListUI();
    focusCorrectInput(); // 操作完成，游標歸位
};
