/**
 * ====================================================================
 * 🔙 1-3級管藥 退藥作業專屬模組 (js/ctrl_return.js)
 * 特色：刷入原始處方條碼後，自動解析帶出病歷號與領藥號，修改數量後以「退藥」屬性送出
 * 建立同領藥號之負數關聯紀錄，完美對接原有管藥庫存系統
 * ====================================================================
 */

window.ctrlRetCurrentOperator = {}; 
let tempRetManualDrug = null;
let tempRetBarcodeData = null; // 暫存條碼解析出來的原始調劑資料
let ctrlRetCurrentFocus = -1;

document.addEventListener('DOMContentLoaded', () => {
    
    // 模式切換
    document.getElementById('ctrlRetModeBarcode').addEventListener('change', toggleCtrlRetMode);
    document.getElementById('ctrlRetModeManual').addEventListener('change', toggleCtrlRetMode);

    // 條碼刷入與確認
    document.getElementById('ctrlRetBarcodeInput').addEventListener('keypress', handleCtrlRetBarcodeScan);
    document.getElementById('ctrlRetBarcodeQty').addEventListener('keypress', handleCtrlRetBarcodeQtyEnter);
    document.getElementById('ctrlRetCancelBarcodeBtn').addEventListener('click', resetCtrlRetBarcodeUI);

    // 手動模糊搜尋與數量輸入
    document.getElementById('ctrlRetDrugSearchInput').addEventListener('input', handleCtrlRetFuzzySearch);
    document.getElementById('ctrlRetManualQtyInput').addEventListener('keypress', handleCtrlRetManualQtyEnter);

    // 操作藥師搜尋
    document.getElementById('ctrlRetOperatorSearchInput').addEventListener('input', handleCtrlRetOpSearch);
    document.getElementById('ctrlRetResetOperatorBtn').addEventListener('click', () => {
        if (window.currentUser) setCtrlRetOperator(window.currentUser.empId, window.currentUser.name);
        focusCorrectCtrlRetInput();
    });

    // 鍵盤上下選擇 (手動模式)
    document.getElementById('ctrlRetDrugSearchInput').addEventListener('keydown', function(e) {
        let list = document.getElementById('ctrl-ret-autocomplete-list');
        if (list) list = list.getElementsByTagName('div');
        if (e.key === 'ArrowDown') { ctrlRetCurrentFocus++; addCtrlRetActive(list); } 
        else if (e.key === 'ArrowUp') { ctrlRetCurrentFocus--; addCtrlRetActive(list); } 
        else if (e.key === 'Enter') {
            e.preventDefault();
            if (ctrlRetCurrentFocus > -1 && list) list[ctrlRetCurrentFocus].click();
        }
    });

    document.addEventListener("click", function (e) {
        if (e.target !== document.getElementById('ctrlRetOperatorSearchInput')) {
            const list = document.getElementById('ctrl-ret-operator-autocomplete-list');
            if (list) list.innerHTML = '';
        }
        if (e.target !== document.getElementById('ctrlRetDrugSearchInput')) {
            const list = document.getElementById('ctrl-ret-autocomplete-list');
            if (list) list.innerHTML = '';
        }
    });
    // ==========================================
    // ✨ 住院藥局專屬：動態插入「無原藥袋」勾選框與 Enter 跳轉
    // ==========================================
    const remarkInput = document.getElementById('ctrlRetRemarkInput');
    if (remarkInput && remarkInput.parentElement) {
        const checkWrapper = document.createElement('div');
        checkWrapper.className = 'form-check mt-2 mb-1';
        checkWrapper.innerHTML = `
            <input class="form-check-input border-danger" type="checkbox" id="ctrlRetNoBagCheck">
            <label class="form-check-label text-danger fw-bold" for="ctrlRetNoBagCheck">
                🚫 無原藥袋 (勾選後自動填寫備註，且病歷號/領藥號轉為非必填)
            </label>
        `;
        // 將勾選框插在備註欄位的正下方/旁邊
        remarkInput.parentElement.appendChild(checkWrapper);

        // 監聽勾選動作：自動加上或移除「無原藥袋」字眼
        document.getElementById('ctrlRetNoBagCheck').addEventListener('change', function() {
            if (this.checked) {
                remarkInput.value = remarkInput.value ? remarkInput.value + " 無原藥袋" : "無原藥袋";
            } else {
                remarkInput.value = remarkInput.value.replace("無原藥袋", "").trim();
            }
        });
    }

    // ✨ 退藥單號 Enter 鍵跳轉至「數量」欄位
    const returnNoInput = document.getElementById('ctrlRetReturnNoInput') || document.getElementById('ctrlRetReturnNo');
    if (returnNoInput) {
        returnNoInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                const barcodeQty = document.getElementById('ctrlRetBarcodeQty');
                const manualQty = document.getElementById('ctrlRetManualQtyInput');
                
                // 智慧判斷目前在哪個模式，就把游標跳去對應的數量框
                if (barcodeQty && barcodeQty.offsetParent !== null) {
                    barcodeQty.focus();
                    barcodeQty.select();
                } else if (manualQty && manualQty.offsetParent !== null) {
                    manualQty.focus();
                    manualQty.select();
                }
            }
        });
    }
});

window.initCtrlReturnSection = function() {
    if (!window.currentUser || !window.currentUser.station) return;
    document.getElementById('ctrlRetStationDisplay').innerText = `📍 目前工作站：${window.currentUser.station}`;
    setCtrlRetOperator(window.currentUser.empId, window.currentUser.name);

    // ✨ 動態加載退藥選單 (條件：登入單位、值為正 1、啟用狀態、依 SortOrder 排序)
    const actionSelect = document.getElementById('ctrlRetActionType');
    if (actionSelect && window.sysParamsDB) {
        actionSelect.innerHTML = '';
        
        const stationOptions = window.sysParamsDB.filter(p => {
            const title = p.title || p.Title || '';
            const st = p.station || p.Station || '';
            const val = p.itemValue || p.ItemValue || '';
            const status = p.status || p.Status || '';
            
            return title === '管藥作業項目' && 
                   (st === window.currentUser.station || st === '全院通用') &&
                   (val === '1' || val === '+1' || val === 1) &&
                   status === '啟用';
        });

        // 依 SortOrder 排序
        stationOptions.sort((a, b) => {
            const orderA = parseInt(a.sortOrder || a.SortOrder || 999, 10);
            const orderB = parseInt(b.sortOrder || b.SortOrder || 999, 10);
            return orderA - orderB;
        });

        if (stationOptions.length === 0) {
            actionSelect.innerHTML = '<option value="">無適用的退藥作業項目</option>';
        } else {
            stationOptions.forEach(opt => {
                const el = document.createElement('option');
                el.value = opt.itemName || opt.ItemName;
                el.dataset.sign = 1; // 強制入帳正整數
                el.innerText = opt.itemName || opt.ItemName;
                actionSelect.appendChild(el);
            });

            // ✨ 記憶功能：切換分頁回來時，自動恢復上次選定的項目
            if (window.savedCtrlRetActionType) {
                const exists = Array.from(actionSelect.options).some(opt => opt.value === window.savedCtrlRetActionType);
                if (exists) actionSelect.value = window.savedCtrlRetActionType;
            }
        }

        actionSelect.addEventListener('change', (e) => {
            window.savedCtrlRetActionType = e.target.value;
        });
        if (actionSelect.value) window.savedCtrlRetActionType = actionSelect.value;
    }
};

function setCtrlRetOperator(id, name) {
    window.ctrlRetCurrentOperator = { empId: id, name: name };
    const searchInput = document.getElementById('ctrlRetOperatorSearchInput');
    if (searchInput) searchInput.value = '';
    document.getElementById('ctrlRetOperatorDisplay').innerText = `${name} (${id})`;
}

function toggleCtrlRetMode() {
    document.getElementById('ctrlRetManualQtySection').classList.add('hidden');
    resetCtrlRetBarcodeUI();
    tempRetManualDrug = null;
    
    if(document.getElementById('ctrlRetModeBarcode').checked) {
        document.getElementById('ctrlRetBarcodeSection').classList.remove('hidden');
        document.getElementById('ctrlRetManualSection').classList.add('hidden');
        document.getElementById('ctrlRetBarcodeInput').focus();
    } else {
        document.getElementById('ctrlRetBarcodeSection').classList.add('hidden');
        document.getElementById('ctrlRetManualSection').classList.remove('hidden');
        document.getElementById('ctrlRetDrugSearchInput').value = '';
        document.getElementById('ctrlRetDrugSearchInput').focus();
    }
}

// ==========================================
// ✨ 補齊退藥分頁的智慧游標與模式切換連動
// ==========================================
function focusCorrectCtrlRetInput() {
    // 1. 若為公用機台且無操作藥師，強制對焦藥師搜尋框
    if (window.workMode === 'public' && (!window.ctrlRetCurrentOperator || !window.ctrlRetCurrentOperator.empId)) {
        const opInput = document.getElementById('ctrlRetOperatorSearchInput');
        if(opInput) opInput.focus();
        return;
    }

    // 2. 否則依據目前的作業模式(條碼/手動)給予對應的游標
    if (document.getElementById('ctrlRetModeBarcode').checked) {
        const barcodeInput = document.getElementById('ctrlRetBarcodeInput');
        if (barcodeInput) barcodeInput.focus();
    } else {
        const searchInput = document.getElementById('ctrlRetDrugSearchInput');
        if (searchInput) searchInput.focus();
    }
}

// ✨ 處理畫面右上角模式切換時的 UI 變動 (對齊其他兩頁)
window.applyCtrlRetWorkModeChange = function() {
    if (window.workMode === 'public') {
        setCtrlRetOperator('', '');
        const opInput = document.getElementById('ctrlRetOperatorSearchInput');
        if(opInput) opInput.focus();
    } else {
        if(window.currentUser) setCtrlRetOperator(window.currentUser.empId, window.currentUser.name);
        focusCorrectCtrlRetInput();
    }
};

function resetCtrlRetBarcodeUI() {
    tempRetBarcodeData = null;
    document.getElementById('ctrlRetBarcodeConfirmSection').classList.add('hidden');
    document.getElementById('ctrlRetBarcodeInput').value = '';
    document.getElementById('ctrlRetBarcodeReturnNo').value = '';
    document.getElementById('ctrlRetBarcodeQty').value = '';
    document.getElementById('ctrlRetBarcodeInput').focus();
}

// ==========================================
// ✨ 核心：條碼退藥解析模組
// ==========================================
async function handleCtrlRetBarcodeScan(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        const raw = this.value.trim();
        if(!raw) return;

        const parts = raw.split(';');
        if(parts.length >= 4) {
            const scannedDrugCode = parts[1].toUpperCase();
            const drug = window.ctrlDrugDB.find(d => (d.drugCode && d.drugCode.toUpperCase() === scannedDrugCode) || (d.code && d.code.toUpperCase() === scannedDrugCode));
            
            if (!drug) {
                alert(`❌ 代碼 ${scannedDrugCode} 非一到三級管制藥！`);
                this.value = ''; return;
            }

            // 解析處方日期
            let parsedDate = "";
            if (parts.length >= 5 && parts[4].length >= 9) {
                const dStr = parts[4].substring(1, 9); 
                if (!isNaN(dStr)) parsedDate = `${dStr.substring(0,4)}-${dStr.substring(4,6)}-${dStr.substring(6,8)}`;
            }
            
            // ✨ 加上 Math.abs，確保即使條碼帶有負號，畫面預設也會顯示正數的絕對值
            const originalQty = Math.abs(parseInt(parts[3], 10) || 0);

            // 暫存解析結果
            tempRetBarcodeData = {
                mode: "條碼", raw: raw, 
                patientNo: parts[0], prescribeNo: parts[2], prescribeDate: parsedDate,
                drugCode: drug.drugCode || drug.code, drugName: drug.drugName || drug.name,
                sapCode: drug.sapCode || drug.sap || "未知"
            };

            // 帶入畫面讓藥師確認與修改
            document.getElementById('ctrlRetParsedDrug').innerText = `${tempRetBarcodeData.drugCode} - ${tempRetBarcodeData.drugName}`;
            document.getElementById('ctrlRetParsedPatient').innerText = tempRetBarcodeData.patientNo;
            document.getElementById('ctrlRetParsedPrescribe').innerText = tempRetBarcodeData.prescribeNo;
            document.getElementById('ctrlRetParsedDate').innerText = tempRetBarcodeData.prescribeDate;
            
            document.getElementById('ctrlRetBarcodeQty').value = originalQty;
            document.getElementById('ctrlRetBarcodeConfirmSection').classList.remove('hidden');

            // ✨ 智慧判定：住院藥局游標先到退藥單號，其他單位直達數量
            const isIPD = window.currentUser && window.currentUser.station === '住院藥局';
            const returnNoInput = document.getElementById('ctrlRetReturnNoInput') || document.getElementById('ctrlRetReturnNo');
            
            if (isIPD && returnNoInput) {
                returnNoInput.focus();
            } else {
                document.getElementById('ctrlRetBarcodeQty').focus(); 
                document.getElementById('ctrlRetBarcodeQty').select();
            }
            // 🗑️ 此處原本多出的 document.getElementById('ctrlRetBarcodeQty').select(); 已經移除

        } else { alert("❌ 管藥條碼格式錯誤！"); }
        this.value = ''; 
    }
}

// 條碼退藥確認送出
async function handleCtrlRetBarcodeQtyEnter(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        const qty = parseInt(this.value, 10);
        if(isNaN(qty) || qty <= 0) { alert("請輸入正確退藥數量"); return; }

        const returnNo = document.getElementById('ctrlRetBarcodeReturnNo').value.trim();

        // 呼叫獨立退藥 API 拋轉
        const success = await processCtrlRetEntry({
            ...tempRetBarcodeData,
            quantity: qty, // 拋轉函數內會自動轉負數
            returnNo: returnNo
        });

        if (success) resetCtrlRetBarcodeUI();
    }
}

// ==========================================
// 手動退藥模組
// ==========================================
function handleCtrlRetFuzzySearch(e) {
    const val = e.target.value.toUpperCase();
    const list = document.getElementById('ctrl-ret-autocomplete-list');
    list.innerHTML = ''; ctrlRetCurrentFocus = -1;
    if (!val || !window.ctrlDrugDB) return;

    const matches = window.ctrlDrugDB.filter(d => {
        const c = d.drugCode || d.code || "";
        const n = d.drugName || d.name || "";
        return c.toUpperCase().includes(val) || n.toUpperCase().includes(val);
    }).slice(0, 15);

    matches.forEach(drug => {
        const item = document.createElement('div');
        const code = drug.drugCode || drug.code;
        const name = drug.drugName || drug.name;
        item.innerHTML = `<strong>${code}</strong> - ${name}`;
        item.className = "p-2 border-bottom text-dark bg-white autocomplete-hover cursor-pointer";
        item.addEventListener('click', () => {
            e.target.value = ''; list.innerHTML = ''; tempRetManualDrug = drug;
            document.getElementById('ctrlRetManualSelectedDrug').innerText = `${code} - ${name}`;
            document.getElementById('ctrlRetManualQtySection').classList.remove('hidden');
            document.getElementById('ctrlRetManualQtyInput').value = ''; 
            document.getElementById('ctrlRetManualQtyInput').focus();
        });
        list.appendChild(item);
    });
}

function addCtrlRetActive(x) {
    if (!x) return false;
    for (let i = 0; i < x.length; i++) x[i].classList.remove("autocomplete-active");
    if (ctrlRetCurrentFocus >= x.length) ctrlRetCurrentFocus = 0;
    if (ctrlRetCurrentFocus < 0) ctrlRetCurrentFocus = (x.length - 1);
    x[ctrlRetCurrentFocus].classList.add("autocomplete-active");
}

async function handleCtrlRetManualQtyEnter(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        const qty = parseInt(this.value, 10);
        if(isNaN(qty) || qty <= 0) { alert("請輸入正確退藥數量"); return; }

        // ✨ 移除預設的字串，保留真實的空白，以便後續進行防呆驗證
        const pDate = document.getElementById('ctrlRetManualPrescribeDate') ? document.getElementById('ctrlRetManualPrescribeDate').value : "";
        const pPatient = document.getElementById('ctrlRetManualPatientNo') ? document.getElementById('ctrlRetManualPatientNo').value.trim() : "";
        const pPresNo = document.getElementById('ctrlRetManualPrescribeNo') ? document.getElementById('ctrlRetManualPrescribeNo').value.trim() : "";
        const pRetNo = document.getElementById('ctrlRetManualReturnNo') ? document.getElementById('ctrlRetManualReturnNo').value.trim() : "";

        const success = await processCtrlRetEntry({
            mode: "手動", raw: "手動退藥輸入", 
            patientNo: pPatient, prescribeNo: pPresNo, prescribeDate: pDate, returnNo: pRetNo,
            drugCode: tempRetManualDrug.drugCode || tempRetManualDrug.code,
            drugName: tempRetManualDrug.drugName || tempRetManualDrug.name,
            sapCode: tempRetManualDrug.sapCode || tempRetManualDrug.sap || "未知",
            quantity: qty
        });

        if(success) {
            document.getElementById('ctrlRetManualQtySection').classList.add('hidden');
            tempRetManualDrug = null;
            // 清空手動輸入框的內容
            if (document.getElementById('ctrlRetManualReturnNo')) document.getElementById('ctrlRetManualReturnNo').value = '';
            if (document.getElementById('ctrlRetManualPatientNo')) document.getElementById('ctrlRetManualPatientNo').value = '';
            if (document.getElementById('ctrlRetManualPrescribeNo')) document.getElementById('ctrlRetManualPrescribeNo').value = '';
            if (document.getElementById('ctrlRetManualPrescribeDate')) document.getElementById('ctrlRetManualPrescribeDate').value = '';
            document.getElementById('ctrlRetDrugSearchInput').focus();
        }
    }
}

function handleCtrlRetOpSearch(e) {
    const val = e.target.value.toUpperCase();
    const list = document.getElementById('ctrl-ret-operator-autocomplete-list');
    list.innerHTML = '';
    if (!val || !window.realUserDB) return;
    const matches = window.realUserDB.filter(u => u.empId.includes(val) || u.name.includes(val)).slice(0, 10);
    matches.forEach(user => {
        const item = document.createElement('div');
        item.innerHTML = `<strong>${user.empId}</strong> - ${user.name}`;
        item.className = "p-2 border-bottom text-dark bg-white autocomplete-hover cursor-pointer";
        item.addEventListener('click', () => {
            setCtrlRetOperator(user.empId, user.name);
            list.innerHTML = '';
            focusCorrectCtrlRetInput();
        });
        list.appendChild(item);
    });
}

// ==========================================
// 🚀 專屬退藥寫入 API (動態依據下拉選單)
// ==========================================
async function processCtrlRetEntry(data) {
    if (!window.ctrlRetCurrentOperator || !window.ctrlRetCurrentOperator.empId) {
        alert("無法辨識退藥藥師身分，請重新設定！"); return false;
    }

    // ✨ 抓取動態選單的值與正負號
    const actionSelect = document.getElementById('ctrlRetActionType');
    if (!actionSelect || !actionSelect.value) {
        alert("❌ 請先選擇退藥作業項目！"); return false;
    }
    const selectedActionText = actionSelect.value;
    const sign = parseInt(actionSelect.options[actionSelect.selectedIndex].dataset.sign, 10) || 1;

    // ==========================================
    // ✨ 住院藥局專屬防呆與必填驗證邏輯
    // ==========================================
    const isIPD = window.currentUser && window.currentUser.station === '住院藥局';
    const remarkValue = document.getElementById('ctrlRetRemarkInput') ? document.getElementById('ctrlRetRemarkInput').value.trim() : '';
    const hasRemark = remarkValue.length > 0;
    const returnNoValue = data.returnNo || "";

    if (isIPD && !returnNoValue.trim()) {
        alert("⚠️ 住院藥局退藥，【退藥單號】為必填項目！");
        if (data.mode === '條碼' && document.getElementById('ctrlRetBarcodeReturnNo')) {
            document.getElementById('ctrlRetBarcodeReturnNo').focus();
        } else if (data.mode === '手動' && document.getElementById('ctrlRetManualReturnNo')) {
            document.getElementById('ctrlRetManualReturnNo').focus();
        }
        return false; 
    }

    if (isIPD && data.mode === '手動') {
        if (hasRemark) {
            if (!data.patientNo) data.patientNo = "無原藥袋";
            if (!data.prescribeNo) data.prescribeNo = "無原藥袋";
            if (!data.prescribeDate) data.prescribeDate = "無";
        } else {
            if (!data.patientNo || !data.prescribeNo) {
                alert("⚠️ 缺少原病歷號或領藥號！\n若無原藥袋，請勾選下方「無原藥袋」或於備註說明填寫原因。");
                return false; 
            }
        }
    }
    // ==========================================

    // ✨ 退藥依據系統參數動態決定正負號入庫 (原先寫死 * -1)
    const finalQty = Math.abs(data.quantity) * sign; 

    const payload = {
        action: "createCtrl",
        itemId: 0,
        station: window.currentUser.station,
        drugCode: data.drugCode,
        drugName: data.drugName,
        sap: data.sapCode,
        quantity: finalQty, 
        actionType: selectedActionText, // ✨ 動態寫入選擇的作業項目
        mode: data.mode,
        raw: data.raw,
        patientNo: data.patientNo || "未知",
        prescribeNo: data.prescribeNo || "未知",
        prescribeDate: data.prescribeDate || "無",
        returnNo: data.returnNo || "",
        operatorId: window.ctrlRetCurrentOperator.empId,
        operatorName: window.ctrlRetCurrentOperator.name,
        remark: remarkValue,
        recordStatus: "正常"
    };

    payload.id = "TEMP_RET_" + Date.now();
    payload.timestamp = new Date().toLocaleString();
    payload.rawTime = Date.now();

    if(window.ctrlTransferList) window.ctrlTransferList.unshift(payload);
    if(typeof window.saveCtrlListToLocal === 'function') window.saveCtrlListToLocal();
    if(typeof window.updateCtrlListUI === 'function') window.updateCtrlListUI();
    
    if(document.getElementById('ctrlRetRemarkInput')) document.getElementById('ctrlRetRemarkInput').value = '';
    const noBagCheck = document.getElementById('ctrlRetNoBagCheck');
    if(noBagCheck) noBagCheck.checked = false;

    const overlay = document.getElementById('ctrlRetLoadingOverlay');
    if (overlay) overlay.classList.remove('hidden');

    const CTRL_API_URL = "https://defaultf611cf53b6864814b03558908d4900.be.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/f58bcf2b5f93404bba33ea0e0b5f188b/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=JNv9I2NOeY6j-DXiQhRMP3kaBTuWQcprSMWBRtnOStQ"; 

    try {
        const response = await fetch(CTRL_API_URL, { 
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error();
        const result = await response.json();
        
        const target = window.ctrlTransferList.find(i => i.id === payload.id);
        if (target && result.newId) {
            target.id = result.newId.toString();
            window.saveCtrlListToLocal();
            window.updateCtrlListUI(); 
            if (typeof window.updateCtrlHistoryTableUI === 'function') window.updateCtrlHistoryTableUI();
        }
    } catch (error) {
        alert("⚠️ 退藥拋轉失敗！請檢查網路連線，資料暫存於本機。");
    } finally {
        if (overlay) overlay.classList.add('hidden');
    }

    return true;
}
