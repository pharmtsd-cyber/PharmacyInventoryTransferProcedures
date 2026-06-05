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
});

window.initCtrlReturnSection = function() {
    if (!window.currentUser || !window.currentUser.station) return;
    document.getElementById('ctrlRetStationDisplay').innerText = `📍 目前工作站：${window.currentUser.station}`;
    setCtrlRetOperator(window.currentUser.empId, window.currentUser.name);
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

function focusCorrectCtrlRetInput() {
    if (document.getElementById('ctrlRetModeBarcode').checked) {
        document.getElementById('ctrlRetBarcodeInput').focus();
    } else {
        document.getElementById('ctrlRetDrugSearchInput').focus();
    }
}

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
            
            // 抓取原本調劑的數量作為預設值
            const originalQty = parseInt(parts[3], 10) || 0;

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
            document.getElementById('ctrlRetBarcodeQty').focus(); // 自動跳到數量欄位等待確認
            document.getElementById('ctrlRetBarcodeQty').select();

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

        const pDate = document.getElementById('ctrlRetManualPrescribeDate').value || "無";
        const pPatient = document.getElementById('ctrlRetManualPatientNo').value.trim() || "手動無病歷號";
        const pPresNo = document.getElementById('ctrlRetManualPrescribeNo').value.trim() || "手動無領藥號";
        const pRetNo = document.getElementById('ctrlRetManualReturnNo').value.trim();

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
            document.getElementById('ctrlRetManualReturnNo').value = '';
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
// 🚀 專屬退藥寫入 API (強制作業屬性為 "退藥")
// ==========================================
async function processCtrlRetEntry(data) {
    if (!window.ctrlRetCurrentOperator || !window.ctrlRetCurrentOperator.empId) {
        alert("無法辨識退藥藥師身分，請重新設定！"); return false;
    }

    const remarkValue = document.getElementById('ctrlRetRemarkInput').value.trim();
    // 退藥一律為負數庫存扣帳 (-1)
    const finalQty = data.quantity * -1; 

    const payload = {
        action: "createCtrl",
        itemId: 0,
        station: window.currentUser.station,
        drugCode: data.drugCode,
        drugName: data.drugName,
        sap: data.sapCode,
        quantity: finalQty, // ✨ 負數退庫
        actionType: "退藥", // ✨ 強制作業屬性
        mode: data.mode,
        raw: data.raw,
        patientNo: data.patientNo,
        prescribeNo: data.prescribeNo,
        prescribeDate: data.prescribeDate,
        returnNo: data.returnNo || "",
        operatorId: window.ctrlRetCurrentOperator.empId,
        operatorName: window.ctrlRetCurrentOperator.name,
        remark: remarkValue,
        recordStatus: "正常"
    };

    payload.id = "TEMP_RET_" + Date.now();
    payload.timestamp = new Date().toLocaleString();
    payload.rawTime = Date.now();

    // ✨ 完美連動：將退藥紀錄寫入共用的 window.ctrlTransferList！
    if(window.ctrlTransferList) window.ctrlTransferList.unshift(payload);
    
    // 更新本地暫存與共用的大表UI
    if(typeof window.saveCtrlListToLocal === 'function') window.saveCtrlListToLocal();
    if(typeof window.updateCtrlListUI === 'function') window.updateCtrlListUI();
    document.getElementById('ctrlRetRemarkInput').value = '';

    const overlay = document.getElementById('ctrlRetLoadingOverlay');
    if (overlay) overlay.classList.remove('hidden');

    // 呼叫原有的 CTRL_API_URL 寫入 SharePoint
    // (注意：此處因作用域需重宣告 API URL，或確保其為全域)
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
