window.mockDrugDB = [
    { code: "BAMIN0", name: "Amino Acid 7% 250ml/bot (Nephrosteril)", sap: "PBAMIN0" },
    { code: "IDARA1", name: "Daratumumab (Darzalex) 100mg/5ml/vial", sap: "PIDARA1" },
    { code: "OEDOX1", name: "Edoxaban Tosilate (Lixiana) 15mg/tab", sap: "POEDOX1" }
];

let transferQueue = [];
let pendingItem = null;
let tempManualDrug = null;

document.addEventListener('DOMContentLoaded', () => {
    // 綁定借位操作
    document.getElementById('operatorIdInput').addEventListener('blur', handleOperatorOverride);
    
    // 綁定輸入模式切換
    document.getElementById('modeBarcode').addEventListener('change', toggleInputMode);
    document.getElementById('modeManual').addEventListener('change', toggleInputMode);
    
    // 綁定條碼解析 (Enter鍵)
    document.getElementById('barcodeInput').addEventListener('keypress', handleBarcodeScan);
    
    // 綁定模糊搜尋
    document.getElementById('drugSearchInput').addEventListener('input', handleFuzzySearch);
    document.getElementById('confirmManualBtn').addEventListener('click', confirmManualInput);
    
    // 綁定卡片按鈕
    document.getElementById('cancelPreviewBtn').addEventListener('click', cancelPreview);
    document.getElementById('addToQueueBtn').addEventListener('click', addToQueue);
    document.getElementById('submitAllBtn').addEventListener('click', submitQueue);
});

// --- 借位與單位初始化 (由 app.js 登入成功時呼叫) ---
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

function handleOperatorOverride() {
    const id = this.value.trim().toUpperCase();
    if(!id) { setOperator(window.currentUser.empId, window.currentUser.name); return; }
    
    const user = window.mockUserDB.find(u => u.empId === id);
    if(user) { setOperator(user.empId, user.name); } 
    else {
        alert("找不到該員編，請重新輸入");
        setOperator(window.currentUser.empId, window.currentUser.name);
    }
}

// --- 模式切換與條碼解析 ---
function toggleInputMode() {
    cancelPreview();
    if(document.getElementById('modeBarcode').checked) {
        document.getElementById('barcodeSection').classList.remove('hidden');
        document.getElementById('manualSection').classList.add('hidden');
        document.getElementById('barcodeInput').focus();
    } else {
        document.getElementById('barcodeSection').classList.add('hidden');
        document.getElementById('manualSection').classList.remove('hidden');
        document.getElementById('drugSearchInput').focus();
    }
}

function handleBarcodeScan(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        const raw = this.value.trim();
        const parts = raw.split(';'); // 完整保留你要求的切割邏輯
        
        if(parts.length >= 4) {
            const drugCode = parts[1].toUpperCase();
            const drug = window.mockDrugDB.find(d => d.code === drugCode) || { name: "未知藥品", sap: "未知" };
            
            renderPreviewCard({
                mode: "條碼", raw: raw, patientNo: parts[0],
                drugCode: drugCode, sap: drug.sap, drugName: drug.name,
                prescribeNo: parts[2], quantity: parts[3]
            });
        } else { alert("❌ 條碼格式錯誤"); }
        this.value = '';
    }
}

// --- 手動模糊搜尋 ---
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
            document.getElementById('manualQtyInput').value = '';
            document.getElementById('manualQtyInput').focus();
        });
        list.appendChild(item);
    });
}

function confirmManualInput() {
    const qty = document.getElementById('manualQtyInput').value;
    if(!qty || qty <= 0) { alert("請輸入正確數量"); return; }
    
    renderPreviewCard({
        mode: "手動", raw: "", patientNo: "", prescribeNo: "",
        drugCode: tempManualDrug.code, sap: tempManualDrug.sap,
        drugName: tempManualDrug.name, quantity: qty
    });
    
    document.getElementById('manualQtySection').classList.add('hidden');
    tempManualDrug = null;
}

// --- 預覽與貯列管理 ---
function renderPreviewCard(data) {
    pendingItem = data;
    document.getElementById('previewDrugName').innerText = data.drugName;
    document.getElementById('previewDrugCode').innerText = data.drugCode;
    document.getElementById('previewSap').innerText = data.sap;
    document.getElementById('previewQty').innerText = data.quantity;
    
    document.getElementById('previewPatientInfo').innerHTML = data.patientNo ? 
        `病歷號：${data.patientNo} | 領藥號：${data.prescribeNo}` : "手動建檔 (無病歷號)";

    document.getElementById('unifiedPreviewCard').classList.remove('hidden');
}

function cancelPreview() {
    pendingItem = null;
    document.getElementById('unifiedPreviewCard').classList.add('hidden');
    document.getElementById('barcodeInput').value = '';
    document.getElementById('drugSearchInput').value = '';
    document.getElementById('manualQtySection').classList.add('hidden');
}

function addToQueue() {
    if(!pendingItem) return;
    pendingItem.outDept = document.getElementById('outDept').value;
    pendingItem.inDept = document.getElementById('inDept').value;
    
    if (pendingItem.outDept === pendingItem.inDept) {
        alert("❌ 撥出單位與撥入單位不能相同！"); return;
    }

    pendingItem.operatorId = window.currentOperator.empId;
    pendingItem.operatorName = window.currentOperator.name;
    pendingItem.timestamp = new Date().toLocaleString();
    pendingItem.id = Date.now().toString();

    transferQueue.unshift(pendingItem); // 加入貯列
    updateQueueUI();
    cancelPreview();
}

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

    transferQueue.forEach(item => {
        const html = `
            <div class="card queue-card mb-2 p-2 shadow-sm">
                <div class="d-flex justify-content-between align-items-center mb-1">
                    <small class="badge bg-secondary">${item.mode}</small>
                    <small class="text-muted" style="font-size: 0.8rem;">${item.timestamp}</small>
                </div>
                <div class="fw-bold text-dark">${item.drugName}</div>
                <div class="d-flex justify-content-between align-items-end mt-1">
                    <div class="small text-muted">
                        ${item.drugCode} | ${item.operatorName}(${item.operatorId})<br>
                        ${item.outDept} ➔ ${item.inDept}
                    </div>
                    <div class="text-end">
                        <span class="fs-5 fw-bold text-primary me-2">Qty: ${item.quantity}</span>
                        <button class="btn btn-sm btn-outline-danger" onclick="window.removeFromQueue('${item.id}')">刪除</button>
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
};

function submitQueue() {
    if(transferQueue.length === 0) return;
    const remark = document.getElementById('batchRemark').value;
    
    console.log("🚀 批次寫入資料準備：", transferQueue, "備註：", remark);
    alert(`✅ 成功送出 ${transferQueue.length} 筆調撥資料！`);
    
    transferQueue = [];
    document.getElementById('batchRemark').value = '';
    updateQueueUI();
}
