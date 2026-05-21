window.mockDrugDB = [
    { code: "BAMIN0", name: "Amino Acid 7% 250ml/bot (Nephrosteril)", sap: "PBAMIN0" },
    { code: "IDARA1", name: "Daratumumab (Darzalex) 100mg/5ml/vial", sap: "PIDARA1" },
    { code: "OEDOX1", name: "Edoxaban Tosilate (Lixiana) 15mg/tab", sap: "POEDOX1" }
];

let transferQueue = [];
let tempManualDrug = null;

document.addEventListener('DOMContentLoaded', () => {
    // 1. 操作藥師綁定：Enter 鍵查詢與自動 Focus，以及重置按鈕
    document.getElementById('operatorIdInput').addEventListener('keypress', function(e) {
        if(e.key === 'Enter') {
            e.preventDefault();
            handleOperatorOverride(this.value);
        }
    });
    document.getElementById('resetOperatorBtn').addEventListener('click', resetOperator);
    
    // 2. 模式切換
    document.getElementById('modeBarcode').addEventListener('change', toggleInputMode);
    document.getElementById('modeManual').addEventListener('change', toggleInputMode);
    
    // 3. 條碼輸入：Enter 鍵直接建檔
    document.getElementById('barcodeInput').addEventListener('keypress', handleBarcodeScan);
    
    // 4. 手動搜尋與數量輸入：Enter 鍵直接建檔
    document.getElementById('drugSearchInput').addEventListener('input', handleFuzzySearch);
    document.getElementById('manualQtyInput').addEventListener('keypress', handleManualQtyEnter);
    
    // 5. 送出按鈕
    document.getElementById('submitAllBtn').addEventListener('click', submitQueue);
});

// ==========================================
// A. 借位操作與游標控制
// ==========================================
window.initOperatorAndDept = function() {
    setOperator(window.currentUser.empId, window.currentUser.name);
    const outDeptSelect = document.getElementById('outDept');
    for(let i = 0; i < outDeptSelect.options.length; i++) {
        if(outDeptSelect.options[i].value === window.currentUser.dept) {
            outDeptSelect.selectedIndex = i; break;
        }
    }
};

function setOperator(id, name) {
    window.currentOperator = { empId: id, name: name };
    document.getElementById('operatorIdInput').value = id;
    document.getElementById('operatorNameDisplay').innerText = name;
}

function resetOperator() {
    // 重置為登入者，並將游標鎖定在輸入框讓藥師可以直接刷入新員編
    document.getElementById('operatorIdInput').value = '';
    setOperator(window.currentUser.empId, window.currentUser.name);
    document.getElementById('operatorIdInput').focus();
}

function handleOperatorOverride(inputId) {
    const id = inputId.trim().toUpperCase();
    if(!id) { resetOperator(); return; }
    
    const user = window.mockUserDB.find(u => u.empId === id);
    if(user) { 
        setOperator(user.empId, user.name); 
        focusCorrectInput(); // 成功後，游標自動跳到條碼或搜尋框
    } else {
        alert("找不到該員編，請重新輸入");
        resetOperator();
    }
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
// B. 直接建檔核心邏輯 (Direct Save)
// ==========================================
function processDirectEntry(data) {
    const outDept = document.getElementById('outDept').value;
    const inDept = document.getElementById('inDept').value;
    
    if (outDept === inDept) {
        alert("❌ 撥出單位與撥入單位不能相同！"); 
        return false;
    }

    // 封裝完整資料
    data.outDept = outDept;
    data.inDept = inDept;
    data.operatorId = window.currentOperator.empId;
    data.operatorName = window.currentOperator.name;
    data.timestamp = new Date().toLocaleString();
    data.id = Date.now().toString(); // 唯一識別碼，供刪除用

    // 將資料推入貯列最前方 (由新到舊排列)
    transferQueue.unshift(data);
    updateQueueUI();
    return true;
}

// ==========================================
// C. 條碼解析與觸發
// ==========================================
function handleBarcodeScan(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        const raw = this.value.trim();
        const parts = raw.split(';');
        
        if(parts.length >= 4) {
            const drugCode = parts[1].toUpperCase();
            const drug = window.mockDrugDB.find(d => d.code === drugCode) || { name: "未知藥品", sap: "未知" };
            
            const success = processDirectEntry({
                mode: "條碼", raw: raw, patientNo: parts[0],
                drugCode: drugCode, sap: drug.sap, drugName: drug.name,
                prescribeNo: parts[2], quantity: parts[3]
            });

        } else { 
            alert("❌ 條碼格式錯誤，請確認藥袋條碼"); 
        }
        
        // 無論成功失敗，清空輸入框並保持游標，準備刷下一筆
        this.value = '';
        this.focus();
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
            // 選取藥品後，清空搜尋框、顯示數量框，並自動 Focus 數量
            e.target.value = ''; 
            list.innerHTML = '';
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

function handleManualQtyEnter(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        const qty = this.value;
        if(!qty || qty <= 0) { alert("請輸入正確數量"); return; }
        
        const success = processDirectEntry({
            mode: "手動", raw: "", patientNo: "", prescribeNo: "",
            drugCode: tempManualDrug.code, sap: tempManualDrug.sap,
            drugName: tempManualDrug.name, quantity: qty
        });
        
        if(success) {
            // 成功建檔後，隱藏數量框，游標自動跳回搜尋框準備下一筆
            document.getElementById('manualQtySection').classList.add('hidden');
            tempManualDrug = null;
            document.getElementById('drugSearchInput').focus();
        }
    }
}

// ==========================================
// E. 貯列渲染與送出 (包含刪除修改功能)
// ==========================================
function updateQueueUI() {
    const listDiv = document.getElementById('queueList');
    document.getElementById('queueCount').innerText = `${transferQueue.length} 筆`;
    
    if(transferQueue.length === 0) {
        listDiv.innerHTML = '<div class="text-center text-muted mt-5">目前無待送出資料</div>';
        document.getElementById('submitAllBtn').disabled = true;
        return;
    }

    document.getElementById('submitAllBtn').disabled = false;
    listDiv.innerHTML = '';

    // 由新到舊渲染卡片
    transferQueue.forEach(item => {
        const html = `
            <div class="card queue-card mb-2 p-3 shadow-sm border-0 border-start border-4 border-primary">
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <div>
                        <span class="badge bg-secondary me-2">${item.mode}</span>
                        <strong class="text-dark">${item.drugCode}</strong>
                    </div>
                    <small class="text-muted" style="font-size: 0.8rem;">${item.timestamp}</small>
                </div>
                <div class="fw-bold text-dark mb-1">${item.drugName}</div>
                
                <div class="row align-items-end mt-2">
                    <div class="col-8 small text-muted">
                        <div class="mb-1">👤 ${item.operatorName} (${item.operatorId})</div>
                        <div>🔄 ${item.outDept} ➔ ${item.inDept}</div>
                    </div>
                    <div class="col-4 text-end">
                        <div class="fs-4 fw-bold text-danger mb-1">Qty: ${item.quantity}</div>
                        <button class="btn btn-sm btn-outline-danger w-100" onclick="window.removeFromQueue('${item.id}')">刪除</button>
                    </div>
                </div>
            </div>
        `;
        listDiv.insertAdjacentHTML('beforeend', html);
    });
}

window.removeFromQueue = function(id) {
    transferQueue = transferQueue.filter(item => item.id !== id);
    updateQueueUI();
    focusCorrectInput(); // 刪除後游標依然幫你帶回輸入框
};

function submitQueue() {
    if(transferQueue.length === 0) return;
    const remark = document.getElementById('batchRemark').value;
    
    console.log("🚀 批次寫入資料準備：", transferQueue, "備註：", remark);
    
    // 這裡未來會接 fetch() 發送給 Power Automate
    alert(`✅ 成功將 ${transferQueue.length} 筆調撥資料送至資料庫！`);
    
    // 註：送出後如果想要保留在「近兩日清單」中，這裡可以只改變卡片狀態而不清空陣列
    // 目前先以清空作為「已送出」的展示
    transferQueue = [];
    document.getElementById('batchRemark').value = '';
    updateQueueUI();
}
