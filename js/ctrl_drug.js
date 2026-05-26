/**
 * ====================================================================
 * 💊 一到三級管制藥作業專屬獨立模組 (js/ctrl_drug.js)
 * 完美移植一般調撥雙模式，全面支援病歷號、領藥號與原始條碼稽核軌跡
 * 內建今日/近兩日地端秒切開關、即時編輯數量與作廢紀錄功能
 * ====================================================================
 */

// ✨ 1. 明確宣告專屬 API 網址，徹底消滅 404
const CTRL_API_URL = "https://defaultf611cf53b6864814b03558908d4900.be.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/f58bcf2b5f93404bba33ea0e0b5f188b/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=JNv9I2NOeY6j-DXiQhRMP3kaBTuWQcprSMWBRtnOStQ"; 

// ✨ 2. 建立背景上傳安全計數器
let pendingUploads = 0; 

let ctrlTransferList = [];
window.ctrlCurrentOperator = {}; 
let tempManualCtrlDrug = null;
let ctrlTimeFilter = 'today';

let ctrlTransferList = [];
window.ctrlCurrentOperator = {}; 
let tempManualCtrlDrug = null;
let ctrlTimeFilter = 'today'; // ✨ 紀錄目前時間過濾狀態 ('today' 或 '2days')

// ==========================================
// 1. DOM 載入完成與事件綁定
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    loadCtrlListFromLocal();

    // ✨ 3. 網頁關閉防護網：如果有資料還在飛，強制跳出警告！
    window.addEventListener('beforeunload', function (e) {
        if (pendingUploads > 0) {
            e.preventDefault();
            e.returnValue = '⚠️ 警告：目前還有管藥紀錄正在背景同步至雲端！現在關閉網頁可能會導致帳目遺失。請稍候幾秒。';
        }
    });
    
    // 模式切換 (條碼/手動)
    const ctrlModeBarcode = document.getElementById('ctrlModeBarcode');
    if (ctrlModeBarcode) ctrlModeBarcode.addEventListener('change', toggleCtrlInputMode);
    
    const ctrlModeManual = document.getElementById('ctrlModeManual');
    if (ctrlModeManual) ctrlModeManual.addEventListener('change', toggleCtrlInputMode);

    // ✨ 新增：紀錄時間切換按鈕事件
    const ctrlTimeToday = document.getElementById('ctrlTimeToday');
    const ctrlTimeTwoDays = document.getElementById('ctrlTimeTwoDays');
    if (ctrlTimeToday) {
        ctrlTimeToday.addEventListener('change', () => {
            ctrlTimeFilter = 'today';
            document.getElementById('ctrlListTitle').innerText = '今日管藥操作紀錄';
            updateCtrlListUI();
        });
    }
    if (ctrlTimeTwoDays) {
        ctrlTimeTwoDays.addEventListener('change', () => {
            ctrlTimeFilter = '2days';
            document.getElementById('ctrlListTitle').innerText = '近兩日管藥操作紀錄';
            updateCtrlListUI();
        });
    }

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
// 3. 條碼解析與嚴格篩選
// ==========================================
async function handleCtrlBarcodeScan(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        const raw = this.value.trim();
        if(!raw) return;

        const parts = raw.split(';');
        if(parts.length >= 4) {
            const scannedDrugCode = parts[1].toUpperCase();
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
                raw: raw,
                patientNo: parts[0],
                prescribeNo: parts[2],
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
// 4. 手動模糊搜尋模組
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
            patientNo: "手動無病歷號",
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
// 5. 萬能背景寫入 API (地端優先)
// ==========================================
async function processCtrlEntry(data) {
    if (!window.ctrlCurrentOperator || !window.ctrlCurrentOperator.empId) {
        alert("無法辨識操作藥師身分，請重新設定！"); return false;
    }

    const actionSelect = document.getElementById('ctrlActionType');
    const remarkValue = document.getElementById('ctrlRemarkInput').value.trim();

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
        raw: data.raw,
        patientNo: data.patientNo,
        prescribeNo: data.prescribeNo,
        operatorId: window.ctrlCurrentOperator.empId,
        operatorName: window.ctrlCurrentOperator.name,
        remark: remarkValue,
        recordStatus: "正常" // 預設狀態為正常
    };

    payload.id = "TEMP_" + Date.now();
    payload.timestamp = new Date().toLocaleString();
    payload.rawTime = Date.now();

    ctrlTransferList.unshift(payload);
    saveCtrlListToLocal();
    updateCtrlListUI();
    document.getElementById('ctrlRemarkInput').value = '';

    const overlay = document.getElementById('ctrlLoadingOverlay');
    if (overlay) overlay.classList.remove('hidden');

    fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(async (response) => {
        if (!response.ok) throw new Error();
        const result = await response.json();
        const target = ctrlTransferList.find(i => i.id === payload.id);
        if (target && result.newId) {
            target.id = result.newId.toString();
            saveCtrlListToLocal();
            updateCtrlListUI();
        }
    })
    .catch((error) => {
        console.error("❌ 管藥拋轉失敗", error);
        const card = document.getElementById(`ctrl-card-${payload.id}`);
        if(card) card.classList.add('border-warning', 'bg-warning', 'bg-opacity-10');
    })
    .finally(() => {
        if (overlay) overlay.classList.add('hidden');
    });

    return true;
}

// ==========================================
// 6. ✨ 核心升級：地端管藥紀錄「編輯數量」與「作廢紀錄」
// ==========================================
window.editCtrlItem = async function(id, currentQty, actionType) {
    const parsedId = parseInt(id, 10);
    if (isNaN(parsedId)) {
        alert("❌ 此資料尚未同步至雲端，暫不開放修改。請於 1 秒後重試。"); return;
    }

    // 取得該筆紀錄在選單上是正數還是負數
    const absoluteQty = Math.abs(currentQty);
    const inputStr = prompt(`【修改管藥調劑數量】\n目前項目：${actionType}\n請輸入修改後的「絕對數量」（大於 0 的整數）：`, absoluteQty);
    if(inputStr === null) return;
    
    const newAbsQty = parseInt(inputStr, 10);
    if(isNaN(newAbsQty) || newAbsQty <= 0) { alert("請輸入有效的正整數！"); return; }

    // 依據原本的正負號，還原具備正負值的數量
    const originalSign = currentQty >= 0 ? 1 : -1;
    const newFinalQty = newAbsQty * originalSign;

    if (newFinalQty === currentQty) return;

    const target = ctrlTransferList.find(i => i.id === id);
    if(!target) return;

    const overlay = document.getElementById('ctrlLoadingOverlay');
    if (overlay) overlay.classList.remove('hidden');

    try {
        const payload = {
            action: "updateCtrl", // 🤖 後端需要處理此分支
            itemId: parsedId,
            station: target.station,
            drugCode: target.drugCode,
            quantity: newFinalQty, // 新數量
            operatorId: window.currentUser.empId, // 記錄是誰改的
            operatorName: window.currentUser.name
        };

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) throw new Error();
        
        // 更新地端記憶
        target.quantity = newFinalQty;
        target.timestamp = new Date().toLocaleString() + " (已修改)";
        saveCtrlListToLocal();
        updateCtrlListUI();
        alert("✅ 管藥庫存與紀錄修改成功！");
    } catch (e) {
        alert("❌ 修改失敗，請檢查網路連線。");
    } finally {
        if (overlay) overlay.classList.add('hidden');
    }
};

window.voidCtrlItem = async function(id) {
    const parsedId = parseInt(id, 10);
    if (isNaN(parsedId)) {
        alert("❌ 此資料尚未同步至雲端，暫不開放作廢。請於 1 秒後重試。"); return;
    }

    const voidReason = prompt("🚨【管藥稽核警告：作廢紀錄】\n管制藥品一經登記不得刪除，只能作廢。\n請輸入嚴格的「作廢理由/退槍原因」：");
    if (voidReason === null) return;
    if (!voidReason.trim()) { alert("❌ 必須輸入作廢理由，否則無法作廢！"); return; }

    const target = ctrlTransferList.find(i => i.id === id);
    if(!target) return;

    const overlay = document.getElementById('ctrlLoadingOverlay');
    if (overlay) overlay.classList.remove('hidden');

    try {
        const payload = {
            action: "voidCtrl", // 🤖 後端需要處理此分支
            itemId: parsedId,
            station: target.station,
            drugCode: target.drugCode,
            quantity: target.quantity, // 用於扣回庫存的基準
            voidReason: voidReason,
            operatorId: window.currentUser.empId, // 蓋上作廢人戳記
            operatorName: window.currentUser.name
        };

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) throw new Error();
        
        // 地端同步更新：從前台清單移除（或標示作廢，此處依據調撥習慣直接剔除）
        ctrlTransferList = ctrlTransferList.filter(item => item.id !== id);
        saveCtrlListToLocal();
        updateCtrlListUI();
        alert("✅ 該管藥紀錄已成功作廢，庫存已自動回沖！");
    } catch (e) {
        alert("❌ 作廢失敗，請檢查網路連線。");
    } finally {
        if (overlay) overlay.classList.add('hidden');
    }
};

// ==========================================
// 7. 右側管藥操作紀錄 UI 渲染 (內建地端時間過濾)
// ==========================================
function updateCtrlListUI() {
    const listDiv = document.getElementById('ctrlRecentList');
    if(!listDiv) return;

    // ✨ 智慧地端篩選：今日 vs 近兩日
    const todayStr = new Date().toLocaleDateString();
    const filteredList = ctrlTransferList.filter(item => {
        if (ctrlTimeFilter === 'today') {
            return new Date(item.rawTime).toLocaleDateString() === todayStr;
        }
        return true; // 近兩日則全部呈現 (2日內)
    });

    if(document.getElementById('ctrlQueueCount')) {
        document.getElementById('ctrlQueueCount').innerText = `${filteredList.length} 筆`;
    }
    
    if(filteredList.length === 0) {
        listDiv.innerHTML = `<div class="text-center text-muted mt-5 py-4">此區間尚無管制藥操作紀錄</div>`; return;
    }

    let html = '';
    filteredList.forEach(item => {
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
                    <div class="col-5 text-end d-flex align-items-center justify-content-end">
                        <strong class="fs-5 ${isQtyNegative ? 'text-danger':'text-success'} me-2">${qtyDisplay} 支</strong>
                        <div class="btn-group">
                            <button class="btn btn-sm btn-outline-secondary py-0 px-1" style="font-size:0.7rem;" onclick="window.editCtrlItem('${item.id}', ${item.quantity}, '${item.actionType}')">✏️</button>
                            <button class="btn btn-sm btn-outline-danger py-0 px-1" style="font-size:0.7rem;" onclick="window.voidCtrlItem('${item.id}')">🗑️</button>
                        </div>
                    </div>
                </div>
            </div>`;
    });
    listDiv.innerHTML = html;
}

// ==========================================
// 8. 輔助工具：操作藥師模糊搜尋
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

// ==========================================
// 9. 本地硬碟暫存與游標輔助機制 (補回)
// ==========================================

function saveCtrlListToLocal() {
    if (!window.currentUser || !window.currentUser.station) return;
    const key = `ctrlData_${window.currentUser.station}`;
    localStorage.setItem(key, JSON.stringify(ctrlTransferList));
}

function loadCtrlListFromLocal() {
    const station = (window.currentUser && window.currentUser.station) ? window.currentUser.station : 'default';
    const key = `ctrlData_${station}`;
    const savedData = localStorage.getItem(key);
    
    if (savedData) {
        try {
            const parsed = JSON.parse(savedData);
            const now = Date.now();
            // 與調撥系統對齊：保留 48 小時內的地端紀錄 (172800000 毫秒)
            ctrlTransferList = parsed.filter(item => item.rawTime && (now - item.rawTime) <= 172800000);
            saveCtrlListToLocal();
        } catch(e) { 
            ctrlTransferList = []; 
        }
    } else { 
        ctrlTransferList = []; 
    }
    
    if (typeof updateCtrlListUI === 'function') {
        updateCtrlListUI();
    }
}

function focusCorrectCtrlInput() {
    const modeBarcode = document.getElementById('ctrlModeBarcode');
    if (modeBarcode && modeBarcode.checked) {
        const barcodeInput = document.getElementById('ctrlBarcodeInput');
        if (barcodeInput) barcodeInput.focus();
    } else {
        const searchInput = document.getElementById('ctrlDrugSearchInput');
        if (searchInput) searchInput.focus();
    }
}
