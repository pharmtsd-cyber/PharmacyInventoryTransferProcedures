/**
 * ====================================================================
 * 💊 一到三級管制藥作業專屬獨立模組 (js/ctrl_drug.js)
 * 完美移植一般調撥雙模式，全面支援病歷號、領藥號與原始條碼稽核軌跡
 * ====================================================================
 */

let ctrlTransferList = [];
window.ctrlCurrentOperator = {}; 
let tempManualCtrlDrug = null;

// ==========================================
// 1. DOM 載入完成與事件綁定
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    loadCtrlListFromLocal();

    // 綁定模式切換
    const ctrlModeBarcode = document.getElementById('ctrlModeBarcode');
    if (ctrlModeBarcode) ctrlModeBarcode.addEventListener('change', toggleCtrlInputMode);
    
    const ctrlModeManual = document.getElementById('ctrlModeManual');
    if (ctrlModeManual) ctrlModeManual.addEventListener('change', toggleCtrlInputMode);

    // 條碼刷入事件
    const ctrlBarcode = document.getElementById('ctrlBarcodeInput');
    if (ctrlBarcode) ctrlBarcode.addEventListener('keypress', handleCtrlBarcodeScan);

    // 手動模糊搜尋與數量輸入
    const ctrlDrugSearch = document.getElementById('ctrlDrugSearchInput');
    if (ctrlDrugSearch) ctrlDrugSearch.addEventListener('input', handleCtrlFuzzySearch);
    
    const ctrlManualQty = document.getElementById('ctrlManualQtyInput');
    if (ctrlManualQty) ctrlManualQty.addEventListener('keypress', handleCtrlManualQtyEnter);

    // 操作藥師搜尋
    const ctrlOpSearch = document.getElementById('ctrlOperatorSearchInput');
    if (ctrlOpSearch) {
        ctrlOpSearch.addEventListener('input', handleCtrlOperatorSearch);
        ctrlOpSearch.addEventListener('keypress', handleCtrlOperatorEnter); 
    }

    const resetCtrlOpBtn = document.getElementById('ctrlResetOperatorBtn');
    if (resetCtrlOpBtn) {
        resetCtrlOpBtn.addEventListener('click', () => {
            if (window.currentUser) setCtrlOperator(window.currentUser.empId, window.currentUser.name);
            if (ctrlOpSearch) { ctrlOpSearch.value = ''; ctrlOpSearch.focus(); }
        });
    }

    // 點擊空白處關閉下拉選單
    document.addEventListener("click", function (e) {
        if (e.target !== document.getElementById('ctrlOperatorSearchInput')) {
            const list = document.getElementById('ctrl-operator-autocomplete-list');
            if (list) list.innerHTML = '';
        }
        if (e.target !== document.getElementById('ctrlDrugSearchInput')) {
            const list = document.getElementById('ctrl-autocomplete-list');
            if (list) list.innerHTML = '';
        }
    });
});

// ==========================================
// 2. 系統初始化與動態選單 (由登入連動)
// ==========================================
window.initCtrlDrugSection = function() {
    if (!window.currentUser || !window.currentUser.station) return;
    
    const stationDisplay = document.getElementById('ctrlStationDisplay');
    if (stationDisplay) stationDisplay.innerText = `📍 目前工作站：${window.currentUser.station}`;

    // 動態加載 SharePoint 參數選單
    const actionSelect = document.getElementById('ctrlActionType');
    if (actionSelect && window.sysParamsDB) {
        actionSelect.innerHTML = '';
        const stationOptions = window.sysParamsDB.filter(p => 
            p.title === '管藥作業項目' && 
            (p.station === window.currentUser.station || p.station === '全院通用')
        );

        if (stationOptions.length === 0) {
            actionSelect.innerHTML = '<option value="">請先至後台維護作業項目</option>';
        } else {
            stationOptions.forEach(opt => {
                const el = document.createElement('option');
                el.value = opt.itemName;
                el.dataset.sign = parseInt(opt.itemValue, 10) || -1;
                el.innerText = opt.itemName;
                actionSelect.appendChild(el);
            });
        }
    }

    setCtrlOperator(window.currentUser.empId, window.currentUser.name);
    loadCtrlListFromLocal();
};

function toggleCtrlInputMode() {
    document.getElementById('ctrlManualQtySection').classList.add('hidden');
    tempManualCtrlDrug = null;
    
    if(document.getElementById('ctrlModeBarcode').checked) {
        document.getElementById('ctrlBarcodeSection').classList.remove('hidden');
        document.getElementById('ctrlManualSection').classList.add('hidden');
        document.getElementById('ctrlBarcodeInput').focus();
    } else {
        document.getElementById('ctrlBarcodeSection').classList.add('hidden');
        document.getElementById('ctrlManualSection').classList.remove('hidden');
        document.getElementById('ctrlDrugSearchInput').value = '';
        document.getElementById('ctrlDrugSearchInput').focus();
    }
}

// ==========================================
// 3. 核心 1：條碼解析與嚴格篩選 (相容多重欄位拼字)
// ==========================================
async function handleCtrlBarcodeScan(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        const raw = this.value.trim();
        if(!raw) return;

        const parts = raw.split(';');
        if(parts.length >= 4) {
            const scannedDrugCode = parts[1].toUpperCase();
            
            // 🛡️ 智慧相容：部分機台回傳可能因 API 映射導致大腦變數欄位拼字不同，同時比對 drugCode 與 code
            const ctrlDrug = window.ctrlDrugDB.find(d => 
                (d.drugCode && d.drugCode.toUpperCase() === scannedDrugCode) || 
                (d.code && d.code.toUpperCase() === scannedDrugCode)
            );
            
            if (!ctrlDrug) {
                alert(`❌ 【管藥防護阻斷】\n代碼 ${scannedDrugCode} 非核定之一到三級管制藥品！\n一般調撥品項請切換至「調撥作業」分頁。`);
                this.value = ''; return;
            }

            const actionSelect = document.getElementById('ctrlActionType');
            const sign = parseInt(actionSelect.options[actionSelect.selectedIndex].dataset.sign, 10);
            const inputQty = parseInt(parts[3], 10) || 0;

            await processCtrlEntry({
                mode: "條碼",
                raw: raw, // 原始條碼存檔
                patientNo: parts[0], // 提取病歷號
                prescribeNo: parts[2], // 提取領藥號
                drugCode: ctrlDrug.drugCode || ctrlDrug.code,
                drugName: ctrlDrug.drugName || ctrlDrug.name,
                sapCode: ctrlDrug.sapCode || ctrlDrug.sap || "未知",
                quantity: inputQty * sign
            });

        } else {
            alert("❌ 管藥條碼格式不符 (未包含病歷號、藥碼或數量)！");
        }
        this.value = '';
        setTimeout(() => this.focus(), 10);
    }
}

// ==========================================
// 4. 核心 2：完美移植手動模糊搜尋模組
// ==========================================
function handleCtrlFuzzySearch(e) {
    const val = e.target.value.toUpperCase();
    const list = document.getElementById('ctrl-autocomplete-list');
    list.innerHTML = '';
    if (!val || !window.ctrlDrugDB) return;

    const matches = window.ctrlDrugDB.filter(d => {
        const c = d.drugCode || d.code || "";
        const n = d.drugName || d.name || "";
        const s = d.sapCode || d.sap || "";
        return c.toUpperCase().includes(val) || n.toUpperCase().includes(val) || s.toUpperCase().includes(val);
    }).slice(0, 15);

    matches.forEach(drug => {
        const item = document.createElement('div');
        const code = drug.drugCode || drug.code;
        const name = drug.drugName || drug.name;
        const sap = drug.sapCode || drug.sap || "無";
        item.innerHTML = `<strong>${code}</strong> - ${name} <small class="text-muted">(${sap})</small>`;
        item.addEventListener('click', () => {
            e.target.value = '';
            list.innerHTML = '';
            tempManualCtrlDrug = drug;
            document.getElementById('ctrlManualSelectedDrug').value = `${code} - ${name}`;
            document.getElementById('ctrlManualQtySection').classList.remove('hidden');
            const qtyInput = document.getElementById('ctrlManualQtyInput');
            if (qtyInput) { qtyInput.value = ''; qtyInput.focus(); }
        });
        list.appendChild(item);
    });
}

async function handleCtrlManualQtyEnter(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        const qty = parseInt(this.value, 10);
        if(isNaN(qty) || qty <= 0) { alert("請輸入正確數量"); return; }

        const actionSelect = document.getElementById('ctrlActionType');
        const sign = parseInt(actionSelect.options[actionSelect.selectedIndex].dataset.sign, 10);

        const code = tempManualCtrlDrug.drugCode || tempManualCtrlDrug.code;
        const name = tempManualCtrlDrug.drugName || tempManualCtrlDrug.name;
        const sap = tempManualCtrlDrug.sapCode || tempManualCtrlDrug.sap || "未知";

        const success = await processCtrlEntry({
            mode: "手動",
            raw: "手動輸入無條碼",
            patientNo: "手動無病歷號", // 手動模式預設填寫值
            prescribeNo: "手動無領藥號",
            drugCode: code,
            drugName: name,
            sapCode: sap,
            quantity: qty * sign
        });

        if(success) {
            document.getElementById('ctrlManualQtySection').classList.add('hidden');
            tempManualCtrlDrug = null;
            document.getElementById('ctrlDrugSearchInput').focus();
        }
    }
}

// ==========================================
// 5. 萬能背景寫入 API (地端優先，同步儲存病歷號/領藥號)
// ==========================================
async function processCtrlEntry(data) {
    if (!window.ctrlCurrentOperator || !window.ctrlCurrentOperator.empId) {
        alert("無法辨識操作藥師身分，請重新設定！"); return false;
    }

    const actionSelect = document.getElementById('ctrlActionType');
    const remarkValue = document.getElementById('ctrlRemarkInput').value.trim();

    // 臨床特定項目強制備註檢查
    if ((actionSelect.value.includes('退藥') || actionSelect.value.includes('報銷') || actionSelect.value.includes('盤盈虧')) && !remarkValue) {
        alert(`❌ 執行【${actionSelect.value}】作業時，必須在上方備註欄位填寫說明原因！`);
        return false;
    }

    const payload = {
        action: "createCtrl",
        itemId: 0,
        station: window.currentUser.station,
        drugCode: data.drugCode,
        drugName: data.drugName,
        sap: data.sapCode,
        quantity: parseInt(data.quantity, 10),
        actionType: actionSelect.value,
        mode: data.mode,
        raw: data.raw, // 傳送原始條碼
        patientNo: data.patientNo, // 傳送病歷號
        prescribeNo: data.prescribeNo, // 傳送領藥號
        operatorId: window.ctrlCurrentOperator.empId,
        operatorName: window.ctrlCurrentOperator.name,
        remark: remarkValue
    };

    // 🚀 地端優先 (Local First) 機制：生成臨時虛擬 ID，0 延遲渲染介面
    payload.id = "TEMP_" + Date.now();
    payload.timestamp = new Date().toLocaleString();
    payload.rawTime = Date.now();

    ctrlTransferList.unshift(payload);
    saveCtrlListToLocal();
    updateCtrlListUI();
    document.getElementById('ctrlRemarkInput').value = '';

    const overlay = document.getElementById('ctrlLoadingOverlay');
    if (overlay) overlay.classList.remove('hidden');

    // 背景非同步拋轉
    fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(async (response) => {
        if (!response.ok) throw new Error();
        const result = await response.json();
        
        // 雲端拋轉成功：靜默將地端臨時單號替換為真實 SharePoint ID
        const target = ctrlTransferList.find(i => i.id === payload.id);
        if (target && result.newId) {
            target.id = result.newId.toString();
            saveCtrlListToLocal();
        }
    })
    .catch((error) => {
        console.error("❌ 管藥拋轉失敗，資料已安全鎖定於地端暫存中。", error);
        const card = document.getElementById(`ctrl-card-${payload.id}`);
        if(card) card.classList.add('border-warning', 'bg-warning', 'bg-opacity-10');
    })
    .finally(() => {
        if (overlay) overlay.classList.add('hidden');
    });

    return true;
}

// ==========================================
// 6. 輔助工具：操作藥師模糊搜尋與本地硬碟記憶
// ==========================================
function setCtrlOperator(id, name) {
    window.ctrlCurrentOperator = { empId: id, name: name };
    const searchInput = document.getElementById('ctrlOperatorSearchInput');
    if (searchInput) searchInput.value = '';
    const display = document.getElementById('ctrlOperatorDisplay');
    if (display) display.innerText = `${name} (${id})`;
}

function handleCtrlOperatorSearch(e) {
    const val = e.target.value.toUpperCase();
    const list = document.getElementById('ctrl-operator-autocomplete-list');
    list.innerHTML = '';
    if (!val || !window.realUserDB) return;

    const matches = window.realUserDB.filter(u => u.empId.includes(val) || u.name.includes(val)).slice(0, 10);
    matches.forEach(user => {
        const item = document.createElement('div');
        item.innerHTML = `<strong>${user.empId}</strong> - ${user.name}`;
        item.addEventListener('click', () => {
            setCtrlOperator(user.empId, user.name);
            list.innerHTML = '';
            focusCorrectCtrlInput();
        });
        list.appendChild(item);
    });
}

function handleCtrlOperatorEnter(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        const val = this.value.trim().toUpperCase();
        if (!val || !window.realUserDB) return;
        const user = window.realUserDB.find(u => u.empId.toUpperCase() === val || u.name === val);
        if (user) {
            setCtrlOperator(user.empId, user.name);
            document.getElementById('ctrl-operator-autocomplete-list').innerHTML = '';
            focusCorrectCtrlInput();
        } else {
            alert("❌ 找不到此藥師身分"); this.select();
        }
    }
}

function focusCorrectCtrlInput() {
    if(document.getElementById('ctrlModeBarcode').checked) {
        document.getElementById('ctrlBarcodeInput').focus();
    } else {
        document.getElementById('ctrlDrugSearchInput').focus();
    }
}

function saveCtrlListToLocal() {
    const key = `ctrlData_${window.currentUser.station || 'default'}`;
    localStorage.setItem(key, JSON.stringify(ctrlTransferList));
}

function loadCtrlListFromLocal() {
    const key = `ctrlData_${window.currentUser.station || 'default'}`;
    const savedData = localStorage.getItem(key);
    if (savedData) {
        try {
            const parsed = JSON.parse(savedData);
            const now = Date.now();
            ctrlTransferList = parsed.filter(item => item.rawTime && (now - item.rawTime) <= 86400000);
            saveCtrlListToLocal();
        } catch(e) { ctrlTransferList = []; }
    } else { ctrlTransferList = []; }
    updateCtrlListUI();
}

function updateCtrlListUI() {
    const listDiv = document.getElementById('ctrlRecentList');
    if(document.getElementById('ctrlQueueCount')) document.getElementById('ctrlQueueCount').innerText = `${ctrlTransferList.length} 筆`;
    
    if(!listDiv) return;
    if(ctrlTransferList.length === 0) {
        listDiv.innerHTML = '<div class="text-center text-muted mt-5 py-4">今日尚無管制藥操作紀錄</div>'; return;
    }

    let html = '';
    ctrlTransferList.forEach(item => {
        const isQtyNegative = item.quantity < 0;
        const badgeColor = isQtyNegative ? 'bg-danger' : 'bg-success';
        const qtyDisplay = isQtyNegative ? `${item.quantity}` : `+${item.quantity}`;
        
        html += `
            <div class="card mb-2 p-3 shadow-sm border-0 border-start border-4 ${isQtyNegative ? 'border-danger':'border-success'}" id="ctrl-card-${item.id}">
                <div class="d-flex justify-content-between align-items-start mb-1">
                    <div>
                        <span class="badge ${badgeColor} me-2">${item.actionType}</span>
                        <strong class="text-dark">${item.drugCode}</strong>
                        ${item.prescribeNo && !item.prescribeNo.includes('手動') ? `<span class="badge bg-light text-dark border ms-1">領藥號:${item.prescribeNo}</span>` : ''}
                    </div>
                    <small class="text-muted" style="font-size: 0.7rem;">${item.timestamp.split(' ')[1] || item.timestamp}</small>
                </div>
                <div class="fw-bold text-dark small my-1 text-truncate" style="max-width:280px;">${item.drugName}</div>
                ${item.patientNo && !item.patientNo.includes('手動') ? `<div class="small text-muted" style="font-size:0.75rem;">🏥 病歷號: ${item.patientNo}</div>` : ''}
                ${item.remark ? `<div class="small text-secondary font-monospace" style="font-size:0.8rem;">📝 備註: ${item.remark}</div>` : ''}
                <div class="d-flex justify-content-between align-items-center mt-2 pt-1 border-top border-light">
                    <span class="text-muted" style="font-size:0.75rem;">👤 經辦: ${item.operatorName}</span>
                    <strong class="fs-5 ${isQtyNegative ? 'text-danger':'text-success'}">${qtyDisplay} 支</strong>
                </div>
            </div>`;
    });
    listDiv.innerHTML = html;
}
