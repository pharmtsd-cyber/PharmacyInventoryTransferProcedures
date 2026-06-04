/**
 * ====================================================================
 * 💊 一到三級管制藥作業專屬獨立模組 (js/ctrl_drug.js)
 * 完美移植一般調撥雙模式，全面支援病歷號、領藥號與原始條碼稽核軌跡
 * 內建今日/近兩日地端秒切開關、即時編輯數量與作廢/復原紀錄功能
 * 支援公用機台/個人鎖定模式之智慧游標路由
 * ====================================================================
 */

// ✨ 1. 明確宣告專屬 API 網址，徹底消滅 404
const CTRL_API_URL = "https://defaultf611cf53b6864814b03558908d4900.be.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/f58bcf2b5f93404bba33ea0e0b5f188b/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=JNv9I2NOeY6j-DXiQhRMP3kaBTuWQcprSMWBRtnOStQ"; 

// ✨ 2. 建立背景上傳安全計數器
let pendingUploads = 0; 

// ✨ 3. 全域變數 (只能有一組！)
let ctrlTransferList = [];
window.ctrlCurrentOperator = {}; 
let tempManualCtrlDrug = null;
let ctrlTimeFilter = 'today';
let ctrlCurrentFocus = -1; // ✨ 鍵盤游標焦點

// ==========================================
// 1. DOM 載入完成與事件綁定
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    loadCtrlListFromLocal();

    // 網頁關閉防護網：如果有資料還在飛，強制跳出警告！
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

    // 紀錄時間切換按鈕事件
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
            if (ctrlOpSearch) { ctrlOpSearch.value = ''; focusCorrectCtrlInput(); }
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

    // ✨ 加入這段：連動大表的選單與鎖定單位初始化
    if (typeof window.initCtrlHistorySection === 'function') {
        window.initCtrlHistorySection();
    }
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
            const ctrlDrug = window.ctrlDrugDB.find(d => (d.drugCode && d.drugCode.toUpperCase() === scannedDrugCode) || (d.code && d.code.toUpperCase() === scannedDrugCode));
            
            if (!ctrlDrug) {
                alert(`❌ 代碼 ${scannedDrugCode} 非一到三級管制藥！`);
                this.value = ''; return;
            }

            // ✨ 解析處方日期 (第5段，例如 I202602050917239608592)
            let parsedDate = "";
            if (parts.length >= 5 && parts[4].length >= 9) {
                const dStr = parts[4].substring(1, 9); 
                if (!isNaN(dStr)) parsedDate = `${dStr.substring(0,4)}-${dStr.substring(4,6)}-${dStr.substring(6,8)}`;
            }

            const actionSelect = document.getElementById('ctrlActionType');
            const sign = parseInt(actionSelect.options[actionSelect.selectedIndex].dataset.sign, 10);
            const inputQty = parseInt(parts[3], 10) || 0;

            await processCtrlEntry({
                mode: "條碼", raw: raw, 
                patientNo: parts[0], prescribeNo: parts[2], prescribeDate: parsedDate, returnNo: "",
                drugCode: ctrlDrug.drugCode || ctrlDrug.code, drugName: ctrlDrug.drugName || ctrlDrug.name,
                sapCode: ctrlDrug.sapCode || ctrlDrug.sap || "未知", quantity: inputQty * sign
            });
        } else { alert("❌ 管藥條碼格式錯誤！"); }
        this.value = ''; setTimeout(() => this.focus(), 10);
    }
}

// ==========================================
// 4. 手動模糊搜尋模組
// ==========================================
// ✨ 鍵盤控制邏輯
document.addEventListener('DOMContentLoaded', () => {
    const ctrlSearchInput = document.getElementById('ctrlDrugSearchInput');
    if (ctrlSearchInput) {
        ctrlSearchInput.addEventListener('keydown', function(e) {
            let list = document.getElementById('ctrl-autocomplete-list');
            if (list) list = list.getElementsByTagName('div');
            if (e.key === 'ArrowDown') {
                ctrlCurrentFocus++; addCtrlActive(list);
            } else if (e.key === 'ArrowUp') {
                ctrlCurrentFocus--; addCtrlActive(list);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (ctrlCurrentFocus > -1 && list) list[ctrlCurrentFocus].click();
            }
        });
    }
});

function addCtrlActive(x) {
    if (!x) return false;
    for (let i = 0; i < x.length; i++) x[i].classList.remove("autocomplete-active");
    if (ctrlCurrentFocus >= x.length) ctrlCurrentFocus = 0;
    if (ctrlCurrentFocus < 0) ctrlCurrentFocus = (x.length - 1);
    x[ctrlCurrentFocus].classList.add("autocomplete-active");
}

function handleCtrlFuzzySearch(e) {
    const val = e.target.value.toUpperCase();
    const list = document.getElementById('ctrl-autocomplete-list');
    list.innerHTML = ''; ctrlCurrentFocus = -1; // 初始化
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
            e.target.value = ''; list.innerHTML = ''; tempManualCtrlDrug = drug;
            document.getElementById('ctrlManualSelectedDrug').innerText = `${code} - ${name}`;
            document.getElementById('ctrlManualQtySection').classList.remove('hidden');
            const qtyInput = document.getElementById('ctrlManualQtyInput');
            if (qtyInput) { qtyInput.value = ''; qtyInput.focus(); } // ✨ 游標自動跳轉
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
        const actionText = actionSelect.options[actionSelect.selectedIndex].text;
        const sign = parseInt(actionSelect.options[actionSelect.selectedIndex].dataset.sign, 10);

        // ✨ 防呆：處方類必須填寫欄位
        let pDate = document.getElementById('ctrlManualPrescribeDate').value;
        let pPatient = document.getElementById('ctrlManualPatientNo').value.trim();
        let pPresNo = document.getElementById('ctrlManualPrescribeNo').value.trim();
        let pRetNo = document.getElementById('ctrlManualReturnNo').value.trim();

        if (actionText.includes('處方調劑') || actionText.includes('處方刪除')) {
            if (!pDate || !pPatient || !pPresNo) {
                alert("❌ 【處方作業防呆】\n使用手動輸入時，必須填寫：處方日期、病歷號、領藥號！");
                return;
            }
        } else {
            // 如果不是處方作業，填補預設字眼
            pDate = pDate || "無"; pPatient = pPatient || "手動無病歷號"; pPresNo = pPresNo || "手動無領藥號";
        }

        const success = await processCtrlEntry({
            mode: "手動", raw: "手動輸入無條碼", 
            patientNo: pPatient, prescribeNo: pPresNo, prescribeDate: pDate, returnNo: pRetNo,
            drugCode: tempManualCtrlDrug.drugCode || tempManualCtrlDrug.code,
            drugName: tempManualCtrlDrug.drugName || tempManualCtrlDrug.name,
            sapCode: tempManualCtrlDrug.sapCode || tempManualCtrlDrug.sap || "未知",
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
// 萬能背景寫入 API (地端優先)
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

    // ✨ 這裡就是 Payload (要傳給 Power Automate 的資料包裹)
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
        prescribeDate: data.prescribeDate || "", // ✨ 已經幫你把處方日期放進包裹了
        returnNo: data.returnNo || "",           // ✨ 已經幫你把退藥號放進包裹了
        operatorId: window.ctrlCurrentOperator.empId,
        operatorName: window.ctrlCurrentOperator.name,
        remark: remarkValue,
        recordStatus: "正常"
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
    pendingUploads++; 

    fetch(CTRL_API_URL, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
        const result = await response.json();
        const target = ctrlTransferList.find(i => i.id === payload.id);
        if (target && result.newId) {
            target.id = result.newId.toString();
            saveCtrlListToLocal();
            updateCtrlListUI(); 
            if (typeof window.updateCtrlHistoryTableUI === 'function') window.updateCtrlHistoryTableUI();
        }
    })
    .catch((error) => {
        console.error("❌ 管藥拋轉失敗", error);
        alert("⚠️ 雲端同步失敗！請檢查網路，此筆資料暫存於本機。");
    })
    .finally(() => {
        pendingUploads--; 
        if (overlay) overlay.classList.add('hidden');
        if (window.workMode === 'public') {
            setCtrlOperator('', ''); 
            setTimeout(() => {
                const opInput = document.getElementById('ctrlOperatorSearchInput');
                if(opInput) opInput.focus();
            }, 100);
        } else {
            focusCorrectCtrlInput(); 
        }
    });

    return true;
}

// ==========================================
// 6. ✨ 核心升級：地端管藥紀錄「編輯數量」、「作廢」與「復原」
// ==========================================
window.editCtrlItem = async function(id, currentQty, actionType) {
    const parsedId = parseInt(id, 10);
    if (isNaN(parsedId)) { Swal.fire('錯誤', '資料未同步，請稍後。', 'error'); return; }
    
    const target = ctrlTransferList.find(i => i.id === id);
    if(!target) return;

    const absoluteQty = Math.abs(currentQty);
    
    // ✨ 精美的明細卡片
    const recordInfo = `
        <div class="text-start p-3 bg-light rounded border border-secondary mb-3 shadow-sm" style="font-size: 0.95rem;">
            <strong>💊 藥品：</strong>${target.drugCode} - ${target.drugName}<br>
            <strong>🏥 病歷：</strong>${target.patientNo} <br>
            <strong>🔢 原數量：</strong><span class="text-danger fw-bold">${currentQty}</span> 支
        </div>
    `;

    const { value: newAbsQty } = await Swal.fire({
        title: '✏️ 修改管藥數量',
        html: recordInfo + `請輸入修改後的「絕對數量」：`,
        input: 'number',
        inputValue: absoluteQty,
        showCancelButton: true,
        confirmButtonColor: '#0d6efd',
        cancelButtonText: '取消',
        confirmButtonText: '確認修改',
        inputValidator: (value) => {
            if (!value || value <= 0) return '請輸入有效的正整數！';
        }
    });

    if (!newAbsQty) return;
    const newFinalQty = parseInt(newAbsQty, 10) * (currentQty >= 0 ? 1 : -1);
    if (newFinalQty === currentQty) return;

    const overlay = document.getElementById('ctrlLoadingOverlay');
    if (overlay) overlay.classList.remove('hidden');
    pendingUploads++; 

    try {
        const payload = { action: "updateCtrl", itemId: parsedId, station: target.station, drugCode: target.drugCode, quantity: newFinalQty, operatorId: window.currentUser.empId, operatorName: window.currentUser.name };
        const response = await fetch(CTRL_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!response.ok) throw new Error();
        target.quantity = newFinalQty; target.timestamp = new Date().toLocaleString() + " (已修改)";
        saveCtrlListToLocal(); updateCtrlListUI(); if (typeof window.updateCtrlHistoryTableUI === 'function') window.updateCtrlHistoryTableUI();
        Swal.fire({ title: '修改成功', text: '庫存已更新！', icon: 'success', timer: 1500, showConfirmButton: false });
    } catch (e) { Swal.fire('錯誤', '修改失敗，請檢查網路連線。', 'error'); } 
    finally { pendingUploads--; if (overlay) overlay.classList.add('hidden'); }
};

// ==========================================
// 管藥作廢 (對齊 VoidReason 欄位)
// ==========================================
window.voidCtrlItem = async function(id) {
    const parsedId = parseInt(id, 10);
    if (isNaN(parsedId)) { Swal.fire('錯誤', '資料未同步。', 'error'); return; }
    
    const target = ctrlTransferList.find(i => i.id === id);
    if(!target) return;

    const recordInfo = `
        <div class="text-start p-3 bg-danger bg-opacity-10 rounded border border-danger mb-3" style="font-size: 0.95rem;">
            <strong>💊 藥品：</strong>${target.drugCode} - ${target.drugName}<br>
            <strong>🔢 數量：</strong><span class="text-danger fw-bold">${target.quantity}</span><br>
            <strong>👤 經辦：</strong>${target.operatorName}
        </div>
    `;

    const { value: voidReason } = await Swal.fire({
        title: '🚨 作廢管藥紀錄',
        html: recordInfo + '<div class="text-danger fw-bold mb-2">管制藥品一經登記不得刪除，只能作廢。</div>請輸入嚴格的「作廢理由」：',
        input: 'text',
        inputPlaceholder: '例如：點錯病人、包裝破損...',
        showCancelButton: true,
        confirmButtonColor: '#dc3545',
        cancelButtonText: '取消',
        confirmButtonText: '確定作廢',
        inputValidator: (value) => { if (!value || !value.trim()) return '必須輸入作廢理由！'; }
    });

    if (!voidReason) return;

    const overlay = document.getElementById('ctrlLoadingOverlay');
    if (overlay) overlay.classList.remove('hidden');
    pendingUploads++; 

    try {
        const payload = { action: "voidCtrl", itemId: parsedId, station: target.station, drugCode: target.drugCode, quantity: target.quantity, voidReason: voidReason, operatorId: window.currentUser.empId, operatorName: window.currentUser.name };
        const response = await fetch(CTRL_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!response.ok) throw new Error();
        const result = await response.json();

        target.recordStatus = "已作廢"; target.timestamp = new Date().toLocaleString() + " (已作廢)";
        if (result.newVoidReason) target.voidReason = result.newVoidReason; else target.voidReason = voidReason; 
        target.voidEmpID = window.currentUser.empId; target.voidName = window.currentUser.name;

        saveCtrlListToLocal(); updateCtrlListUI(); if (typeof window.updateCtrlHistoryTableUI === 'function') window.updateCtrlHistoryTableUI();
        Swal.fire({ title: '已作廢', text: '紀錄已作廢，庫存自動回沖！', icon: 'success', timer: 1500, showConfirmButton: false });
    } catch (e) { Swal.fire('錯誤', '作廢失敗，請檢查網路連線。', 'error'); } 
    finally { pendingUploads--; if (overlay) overlay.classList.add('hidden'); }
};

// ==========================================
// 管藥復原 (對齊 VoidReason 欄位)
// ==========================================
window.restoreCtrlItem = async function(id) {
    const parsedId = parseInt(id, 10);
    const target = ctrlTransferList.find(i => i.id === id);
    if(!target) return;

    const recordInfo = `<div class="text-start p-3 bg-light rounded border border-success mb-3"><strong>💊 藥品：</strong>${target.drugName}<br><strong>🗑️ 原作廢理由：</strong>${target.voidReason}</div>`;

    const { value: restoreReason } = await Swal.fire({
        title: '♻️ 取消作廢',
        html: recordInfo + '確定要將此紀錄「取消作廢」並恢復庫存嗎？<br>請輸入取消作廢的理由：',
        input: 'text',
        showCancelButton: true,
        confirmButtonColor: '#198754',
        cancelButtonText: '放棄',
        confirmButtonText: '確認復原',
        inputValidator: (value) => { if (!value) return '請輸入取消作廢的理由！'; }
    });

    if(!restoreReason) return; 

    const overlay = document.getElementById('ctrlLoadingOverlay');
    if (overlay) overlay.classList.remove('hidden');
    pendingUploads++;

    try {
        const payload = { action: "restoreCtrl", itemId: parsedId, station: target.station, drugCode: target.drugCode, quantity: target.quantity, voidReason: restoreReason, operatorId: window.currentUser.empId, operatorName: window.currentUser.name };
        const response = await fetch(CTRL_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!response.ok) throw new Error();
        const result = await response.json();
        
        target.recordStatus = "正常"; target.timestamp = new Date().toLocaleString() + " (已復原)";
        if (result.newVoidReason) target.voidReason = result.newVoidReason;
        target.voidEmpID = window.currentUser.empId; target.voidName = window.currentUser.name;
        
        saveCtrlListToLocal(); updateCtrlListUI(); if (typeof window.updateCtrlHistoryTableUI === 'function') window.updateCtrlHistoryTableUI();
        Swal.fire({ title: '復原成功', text: '帳目已重新恢復！', icon: 'success', timer: 1500, showConfirmButton: false });
    } catch (e) { Swal.fire('錯誤', '復原失敗，請檢查網路連線。', 'error'); } 
    finally { pendingUploads--; if (overlay) overlay.classList.add('hidden'); }
};

// ==========================================
// ✨ 新增：管藥異常通報功能
// ==========================================
window.reportAnomalyItem = async function(id) {
    const parsedId = parseInt(id, 10);
    if (isNaN(parsedId)) { Swal.fire('錯誤', '資料未同步。', 'error'); return; }
    const target = ctrlTransferList.find(i => i.id === id);
    if(!target) return;

    if (target.reportStatus === '未處理' || target.reportStatus === '處理中' || target.reportStatus === '已結案') {
        Swal.fire({
            title: '⚠️ 通報狀態',
            html: `<div class="text-start"><strong>【目前狀態】：</strong>${target.reportStatus}<br><br><strong>【通報內容】：</strong><br>${target.reportReason || '無'}<br><br><strong>【主管批示】：</strong><br>${target.managerResult || '主管尚未批示'}</div>`,
            icon: 'info'
        });
        return;
    }

    const recordInfo = `<div class="text-start p-3 bg-warning bg-opacity-10 rounded border border-warning mb-3"><strong>💊 藥品：</strong>${target.drugName}<br><strong>👤 經辦：</strong>${target.operatorName}</div>`;

    const { value: reportReason } = await Swal.fire({
        title: '⚠️ 異常通報',
        html: recordInfo + '請詳細描述此筆調劑的異常狀況：',
        input: 'textarea',
        inputPlaceholder: '例如：包裝破損、數量不符、效期異常...',
        showCancelButton: true,
        confirmButtonColor: '#ffc107',
        cancelButtonText: '取消',
        confirmButtonText: '送出通報',
        inputValidator: (value) => { if (!value || !value.trim()) return '請填寫通報內容！'; }
    });

    if (!reportReason) return;
    const overlay = document.getElementById('ctrlLoadingOverlay');
    if (overlay) overlay.classList.remove('hidden');

    try {
        const payload = { action: "reportAnomaly", itemId: parsedId, reportReason: reportReason, operatorId: window.currentUser.empId, operatorName: window.currentUser.name };
        const response = await fetch(CTRL_API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (!response.ok) throw new Error();
        const result = await response.json();

        target.reportStatus = "未處理";
        if (result.newReportReason) target.reportReason = result.newReportReason; else target.reportReason = reportReason;
        target.reportEmpID = window.currentUser.empId; target.reportName = window.currentUser.name;

        saveCtrlListToLocal(); updateCtrlListUI(); if (typeof window.updateCtrlHistoryTableUI === 'function') window.updateCtrlHistoryTableUI();
        Swal.fire({ title: '通報已送出', text: '主管已收到您的異常通報！', icon: 'success', timer: 1500, showConfirmButton: false });
    } catch (e) { Swal.fire('錯誤', '通報失敗。', 'error'); } 
    finally { if (overlay) overlay.classList.add('hidden'); }
};

// ==========================================
// 7. 右側管藥操作紀錄 UI 渲染
// ==========================================
function updateCtrlListUI() {
    const listDiv = document.getElementById('ctrlRecentList');
    if(!listDiv) return;

    const todayStr = new Date().toLocaleDateString();
    const filteredList = ctrlTransferList.filter(item => {
        if (ctrlTimeFilter === 'today') {
            return new Date(item.rawTime).toLocaleDateString() === todayStr;
        }
        return true; 
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
        const qtyDisplay = isQtyNegative ? `${item.quantity}` : `+${item.quantity}`;
        
        const isVoided = item.recordStatus === '已作廢';
        const cardStyle = isVoided ? 'border-secondary bg-light opacity-75' : (isQtyNegative ? 'border-danger':'border-success');
        const finalBadgeColor = isVoided ? 'bg-secondary' : (isQtyNegative ? 'bg-danger' : 'bg-success');
        const statusText = isVoided ? ' (已作廢)' : '';
        
        html += `
            <div class="card mb-2 p-3 shadow-sm border-0 border-start border-4 ${cardStyle}" id="ctrl-card-${item.id}">
                <div class="d-flex justify-content-between align-items-start mb-1">
                    <div>
                        <span class="badge ${finalBadgeColor} me-2">${item.actionType}${statusText}</span>
                        <strong class="${isVoided ? 'text-muted text-decoration-line-through' : 'text-dark'}">${item.drugCode}</strong>
                        ${item.prescribeNo && !item.prescribeNo.includes('手動') ? `<span class="badge bg-light text-dark border ms-1">領藥號:${item.prescribeNo}</span>` : ''}
                    </div>
                    <small class="text-muted" style="font-size: 0.7rem;">${item.timestamp.split(' ')[1] || item.timestamp}</small>
                </div>
                <div class="fw-bold ${isVoided ? 'text-muted' : 'text-dark'} small my-1 text-truncate" style="max-width:280px;">${item.drugName}</div>
                ${item.remark ? `<div class="small text-secondary font-monospace" style="font-size:0.8rem;">📝 備註: ${item.remark}</div>` : ''}
                
                <div class="d-flex justify-content-between align-items-center mt-2 pt-1 border-top border-light">
                    <span class="text-muted" style="font-size:0.75rem;">👤 經辦: ${item.operatorName}</span>
                    <div class="col-5 text-end d-flex align-items-center justify-content-end">
                        <strong class="fs-5 ${isVoided ? 'text-secondary' : (isQtyNegative ? 'text-danger':'text-success')} me-2">${qtyDisplay} 支</strong>
                        <div class="btn-group">
                            <button class="btn btn-sm btn-outline-secondary py-0 px-1" style="font-size:0.7rem;" onclick="window.editCtrlItem('${item.id}', ${item.quantity}, '${item.actionType}')" ${isVoided ? 'disabled' : ''}>✏️</button>
                            ${isVoided 
                                ? `<button class="btn btn-sm btn-outline-success py-0 px-1" style="font-size:0.7rem;" onclick="window.restoreCtrlItem('${item.id}')">♻️</button>`
                                : `<button class="btn btn-sm btn-outline-danger py-0 px-1" style="font-size:0.7rem;" onclick="window.voidCtrlItem('${item.id}')">🗑️</button>`
                            }
                        </div>
                    </div>
                </div>
            </div>`;
    });
    listDiv.innerHTML = html;

    // ✨ 雙向連動：更新側邊欄後，一併通知全頁大表重新渲染
    if (typeof window.updateCtrlHistoryTableUI === 'function') window.updateCtrlHistoryTableUI();
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
// 9. 本地硬碟暫存與游標輔助機制
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
            ctrlTransferList = parsed.filter(item => item.rawTime && (now - item.rawTime) <= 172800000);
            saveCtrlListToLocal();
        } catch(e) { 
            ctrlTransferList = []; 
        }
    } else { 
        ctrlTransferList = []; 
    }
    
    updateCtrlListUI();
}

// ✨ 處理模式切換時的 UI 變動
window.applyWorkModeChange = function() {
    if (window.workMode === 'public') {
        // 切換到公用模式：清空操作藥師，游標跳至藥師輸入框
        setCtrlOperator('', '');
        const opInput = document.getElementById('ctrlOperatorSearchInput');
        if(opInput) opInput.focus();
    } else {
        // 切換到個人模式：鎖定為登入者，游標跳至條碼
        if(window.currentUser) setCtrlOperator(window.currentUser.empId, window.currentUser.name);
        focusCorrectCtrlInput();
    }
};

// ✨ 智慧游標路由
function focusCorrectCtrlInput() {
    if (window.workMode === 'public' && (!window.ctrlCurrentOperator || !window.ctrlCurrentOperator.empId)) {
        const opInput = document.getElementById('ctrlOperatorSearchInput');
        if(opInput) opInput.focus();
        return;
    }

    const modeBarcode = document.getElementById('ctrlModeBarcode');
    if (modeBarcode && modeBarcode.checked) {
        const barcodeInput = document.getElementById('ctrlBarcodeInput');
        if (barcodeInput) barcodeInput.focus();
    } else {
        const searchInput = document.getElementById('ctrlDrugSearchInput');
        if (searchInput) searchInput.focus();
    }
}
