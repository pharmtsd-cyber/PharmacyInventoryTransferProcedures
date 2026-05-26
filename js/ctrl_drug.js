// 全域變數與暫存貯列
let ctrlTransferList = [];
window.ctrlCurrentOperator = {}; // ✨ 專屬管藥的操作藥師變數

document.addEventListener('DOMContentLoaded', () => {
    loadCtrlListFromLocal();

    const ctrlBarcode = document.getElementById('ctrlBarcodeInput');
    if (ctrlBarcode) ctrlBarcode.addEventListener('keypress', handleCtrlBarcodeScan);

    const ctrlAction = document.getElementById('ctrlActionType');
    if (ctrlAction) {
        ctrlAction.addEventListener('change', () => {
            const remarkInput = document.getElementById('ctrlRemarkInput');
            if (ctrlAction.value.includes('退藥') || ctrlAction.value.includes('報銷') || ctrlAction.value.includes('盤盈虧')) {
                remarkInput.placeholder = "🚨 必須填寫：病歷號、原因或見證人！";
            } else {
                remarkInput.placeholder = "填寫病歷號或備註說明...";
            }
            if(ctrlBarcode) ctrlBarcode.focus();
        });
    }

    // ✨ 綁定操作藥師搜尋事件
    const ctrlOpSearch = document.getElementById('ctrlOperatorSearchInput');
    if (ctrlOpSearch) {
        ctrlOpSearch.addEventListener('input', handleCtrlOperatorSearch);
        ctrlOpSearch.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const val = e.target.value.trim().toUpperCase();
                if (!val || !window.realUserDB) return;
                const user = window.realUserDB.find(u => u.empId.toUpperCase() === val || u.name === val);
                if (user) {
                    setCtrlOperator(user.empId, user.name);
                    document.getElementById('ctrl-operator-autocomplete-list').innerHTML = ''; 
                    if(ctrlBarcode) ctrlBarcode.focus();
                } else {
                    alert("❌ 找不到此員編或姓名"); e.target.select();
                }
            }
        });
    }

    const resetCtrlOpBtn = document.getElementById('ctrlResetOperatorBtn');
    if (resetCtrlOpBtn) {
        resetCtrlOpBtn.addEventListener('click', () => {
            if (window.currentUser) setCtrlOperator(window.currentUser.empId, window.currentUser.name);
            if (ctrlOpSearch) { ctrlOpSearch.value = ''; ctrlOpSearch.focus(); }
        });
    }
});

window.initCtrlDrugSection = function() {
    if (!window.currentUser || !window.currentUser.station) return;
    
    // 1. 顯示工作站
    const stationDisplay = document.getElementById('ctrlStationDisplay');
    if (stationDisplay) stationDisplay.innerText = `📍 目前工作站：${window.currentUser.station}`;

    // 2. ✨ 從系統參數資料庫，動態篩選並組裝該單位的專屬選單
    const actionSelect = document.getElementById('ctrlActionType');
    if (actionSelect && window.sysParamsDB) {
        actionSelect.innerHTML = ''; // 清空舊選項
        
        // 核心邏輯：找「管藥作業項目」且單位符合當前機台（或全院通用）
        const stationOptions = window.sysParamsDB.filter(p => 
            p.title === '管藥作業項目' && 
            (p.station === window.currentUser.station || p.station === '全院通用')
        );

        if (stationOptions.length === 0) {
            actionSelect.innerHTML = '<option value="">請先至後台維護作業項目</option>';
        } else {
            stationOptions.forEach(opt => {
                const el = document.createElement('option');
                el.value = opt.itemName; // 寫入資料庫的名稱
                el.dataset.sign = parseInt(opt.itemValue, 10) || -1; // 將資料庫的 itemValue 轉為正負號運算值
                el.innerText = opt.itemName; // 前端顯示的字
                actionSelect.appendChild(el);
            });
        }
    }

    // 3. 預設操作藥師為登入者
    setCtrlOperator(window.currentUser.empId, window.currentUser.name);

    loadCtrlListFromLocal();
};

// ✨ 設定管藥專屬操作藥師
function setCtrlOperator(id, name) {
    window.ctrlCurrentOperator = { empId: id, name: name };
    const searchInput = document.getElementById('ctrlOperatorSearchInput');
    if (searchInput) searchInput.value = '';
    const display = document.getElementById('ctrlOperatorDisplay');
    if (display) display.innerText = `${name} (${id})`;
}

// ✨ 管藥專屬的模糊搜尋 UI
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
            document.getElementById('ctrlBarcodeInput').focus(); 
        });
        list.appendChild(item);
    });
}

// ==========================================
// 3. 本地硬碟單機暫存機制 (Local Storage)
// ==========================================
function saveCtrlListToLocal() {
    // 儲存時加上工作站註記，確保門診電腦不會讀到急診電腦的暫存
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
            // 智慧防呆：只保留 24 小時內的管藥操作清單，避免畫面過於肥大
            ctrlTransferList = parsed.filter(item => {
                if (!item.rawTime) return false;
                return (now - item.rawTime) <= 86400000;
            });
            saveCtrlListToLocal();
        } catch(e) {
            ctrlTransferList = [];
        }
    } else {
        ctrlTransferList = [];
    }
    updateCtrlListUI();
}

// ==========================================
// 4. 條碼解析與「一到三級管藥主檔」嚴格防呆
// ==========================================
async function handleCtrlBarcodeScan(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        const raw = this.value.trim();
        if(!raw) return;

        // 亞東標準條碼格式解析 (病歷號;藥品代碼;領藥號;調劑數量)
        const parts = raw.split(';');
        if(parts.length >= 4) {
            const scannedDrugCode = parts[1].toUpperCase();
            
            // 🛡️ 核心防呆：去 window.ctrlDrugDB (大腦記憶) 進行嚴格篩選比對
            if (!window.ctrlDrugDB || window.ctrlDrugDB.length === 0) {
                alert("❌ 管制藥品主檔尚未載入，請重新整理網頁！");
                this.value = ''; return;
            }

            const ctrlDrug = window.ctrlDrugDB.find(d => d.drugCode === scannedDrugCode);
            
            if (!ctrlDrug) {
                // 💥 震撼阻斷彈窗：防止非管藥混入，或刷錯條碼
                alert(`❌ 【嚴格阻斷】\n代碼 ${scannedDrugCode} 非本院核定之一到三級管制藥品！\n如果是普通藥品調撥，請切換至「一般調撥」分頁作業。`);
                this.value = ''; this.focus(); return;
            }

            // 讀取前端作業項目的正負號設定
            const actionSelect = document.getElementById('ctrlActionType');
            const sign = parseInt(actionSelect.options[actionSelect.selectedIndex].dataset.sign, 10);
            const inputQty = parseInt(parts[3], 10) || 0;

            // 臨床必填欄位防呆
            const remarkValue = document.getElementById('ctrlRemarkInput').value.trim();
            if ((actionSelect.value === '住院退藥' || actionSelect.value === '毀損報銷') && !remarkValue) {
                alert(`❌ 執行【${actionSelect.value}】作業時，必須填寫備註說明理由（如病歷號或破損原因）！`);
                this.value = ''; document.getElementById('ctrlRemarkInput').focus(); return;
            }

            // 建立準備送往後端的完美 JSON 資料結構
            await processCtrlEntry({
                mode: "條碼",
                raw: raw,
                patientNo: parts[0],
                prescribeNo: parts[2],
                drugCode: ctrlDrug.drugCode,
                drugName: ctrlDrug.drugName,
                sapCode: ctrlDrug.sapCode || "未知", // 影子載入 SAP 碼供藥庫介接
                quantity: inputQty * sign, // ✨ 前端直接依據項目計算好正負異動量，Power Automate 庫存直接相加即可！
                actionType: actionSelect.value
            });

        } else {
            alert("❌ 條碼格式不符 (必須包含病歷號、藥碼、領藥號、數量)！");
        }
        
        this.value = '';
        setTimeout(() => this.focus(), 10);
    }
}

// ==========================================
// 5. 萬能背景寫入 API (連動 POST API)
// ==========================================
async function processCtrlEntry(data) {
    // 🛡️ 權限與登入狀態二次確認
    if (!window.currentUser || !window.currentUser.empId) {
        alert("無法辨識藥師登入身分，請重新登入系統"); return false;
    }

    // 建立完整的管藥流水帳欄位結構
    const payload = {
        action: "createCtrl", 
        itemId: 0,
        station: window.currentUser.station, 
        drugCode: data.drugCode,
        drugName: data.drugName,
        sap: data.sapCode, // ✨ 修正：嚴格對齊 API 結構的 sap 欄位
        quantity: parseInt(data.quantity, 10), 
        actionType: data.actionType,
        patientNo: data.patientNo || "",
        prescribeNo: data.prescribeNo || "",
        operatorId: window.ctrlCurrentOperator.empId,
        operatorName: window.ctrlCurrentOperator.name,
        remark: document.getElementById('ctrlRemarkInput').value.trim()
    };

    // 執行單機暫存：不管網路多卡，先推入前端畫面，達到尖峰時刻「零延遲」操作手感
    payload.id = "TEMP_" + Date.now(); // 暫時 ID
    payload.timestamp = new Date().toLocaleString();
    payload.rawTime = Date.now();

    // 塞入佇列最前方並渲染
    ctrlTransferList.unshift(payload);
    saveCtrlListToLocal();
    updateCtrlListUI();
    
    // 清空備註欄
    document.getElementById('ctrlRemarkInput').value = '';

    // 🌐 在背景悄悄發送給 Power Automate，不卡死網頁畫面
    fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(async (response) => {
        if (!response.ok) throw new Error();
        const result = await response.json();
        
        // 雲端同步成功：將原本的 TEMP 假單號，替換為 SharePoint 真正的數字 ID
        const target = ctrlTransferList.find(i => i.id === payload.id);
        if (target && result.newId) {
            target.id = result.newId.toString();
            saveCtrlListToLocal();
            console.log(`✅ 管藥交易成功同步至雲端，SharePoint ID: ${result.newId}`);
        }
    })
    .catch((error) => {
        // 網路斷線或後端出錯時的提示 (但資料仍留在網頁暫存裡，按重新整理也不會遺失)
        console.error("❌ 管藥背景同步失敗，資料已安全留存在單機暫存中。", error);
        const card = document.getElementById(`ctrl-card-${payload.id}`);
        if(card) card.classList.add('border-warning', 'bg-warning', 'bg-opacity-10');
    });

    return true;
}

// ==========================================
// 6. 右側管藥操作紀錄 UI 渲染
// ==========================================
function updateCtrlListUI() {
    const listDiv = document.getElementById('ctrlRecentList');
    const queueCount = document.getElementById('ctrlQueueCount');
    if (queueCount) queueCount.innerText = `${ctrlTransferList.length} 筆`;
    
    if(!listDiv) return;
    if(ctrlTransferList.length === 0) {
        listDiv.innerHTML = '<div class="text-center text-muted mt-5 py-4">今日尚無管制藥操作紀錄</div>';
        return;
    }

    listDiv.innerHTML = '';
    ctrlTransferList.forEach(item => {
        const isQtyNegative = item.quantity < 0;
        
        // 視覺化分流：扣帳顯示紅色/負數；入帳顯示綠色/正數
        const badgeColor = isQtyNegative ? 'bg-danger' : 'bg-success';
        const qtyDisplay = isQtyNegative ? `${item.quantity}` : `+${item.quantity}`;
        
        const html = `
            <div class="card mb-2 p-3 shadow-sm border-0 border-start border-4 ${isQtyNegative ? 'border-danger':'border-success'}" id="ctrl-card-${item.id}">
                <div class="d-flex justify-content-between align-items-start mb-1">
                    <div>
                        <span class="badge ${badgeColor} me-2">${item.actionType}</span>
                        <strong class="text-dark">${item.drugCode}</strong>
                        ${item.prescribeNo ? `<span class="badge bg-light text-dark border ms-1">領藥:${item.prescribeNo}</span>` : ''}
                    </div>
                    <small class="text-muted" style="font-size: 0.7rem;">${item.timestamp.split(' ')[1] || item.timestamp}</small>
                </div>
                <div class="fw-bold text-dark small my-1 text-truncate" style="max-width:280px;">${item.drugName}</div>
                ${item.remark ? `<div class="small text-secondary font-monospace" style="font-size:0.8rem;">📝 備註: ${item.remark}</div>` : ''}
                
                <div class="d-flex justify-content-between align-items-center mt-2 pt-1 border-top border-light">
                    <span class="text-muted" style="font-size:0.75rem;">👤 ${item.operatorName}</span>
                    <strong class="fs-5 ${isQtyNegative ? 'text-danger':'text-success'}">${qtyDisplay} 支</strong>
                </div>
            </div>
        `;
        listDiv.insertAdjacentHTML('beforeend', html);
    });
}
