/**
 * ====================================================================
 * 📊 管藥全頁審計紀錄大表專屬模組 (js/ctrl_history.js)
 * 負責處理大表的 UI 渲染、交叉篩選、模糊搜尋與日期初始化
 * ====================================================================
 */

document.addEventListener('DOMContentLoaded', () => {
    const ctrlHistSearchBtn = document.getElementById('ctrlHistSearchBtn');
    if (ctrlHistSearchBtn) {
        ctrlHistSearchBtn.addEventListener('click', window.updateCtrlHistoryTableUI);
    }

    const todayIso = new Date().toISOString().split('T')[0];
    if(document.getElementById('ctrlHistStartDate')) document.getElementById('ctrlHistStartDate').value = todayIso;
    if(document.getElementById('ctrlHistEndDate')) document.getElementById('ctrlHistEndDate').value = todayIso;

    // ✨ 1. 藥品篩選自動完成 (Autocomplete)
    const drugSearchInput = document.getElementById('ctrlHistDrugSearch');
    if (drugSearchInput) {
        drugSearchInput.addEventListener('input', function(e) {
            const val = e.target.value.toUpperCase().trim();
            const list = document.getElementById('ctrl-hist-drug-autocomplete-list');
            list.innerHTML = '';
            if (!val || !window.ctrlDrugDB) return;

            const matches = window.ctrlDrugDB.filter(d => {
                const c = (d.drugCode || d.code || "").toUpperCase();
                const n = (d.drugName || d.name || "").toUpperCase();
                const s = (d.sapCode || d.sap || "").toUpperCase();
                return c.includes(val) || n.includes(val) || s.includes(val);
            }).slice(0, 10); // 最多顯示10筆

            matches.forEach(drug => {
                const item = document.createElement('div');
                const code = drug.drugCode || drug.code;
                const name = drug.drugName || drug.name;
                item.innerHTML = `<strong>${code}</strong> - ${name}`;
                item.className = "p-2 border-bottom text-dark bg-white cursor-pointer autocomplete-hover";
                item.style.cursor = "pointer";
                item.addEventListener('click', () => {
                    drugSearchInput.value = code; // 填入精準代碼
                    list.innerHTML = '';
                    window.updateCtrlHistoryTableUI(); // 點選後自動觸發篩選
                });
                list.appendChild(item);
            });
        });
    }

    // ✨ 2. 藥師篩選自動完成 (Autocomplete)
    const opSearchInput = document.getElementById('ctrlHistOpSearch');
    if (opSearchInput) {
        opSearchInput.addEventListener('input', function(e) {
            const val = e.target.value.toUpperCase().trim();
            const list = document.getElementById('ctrl-hist-op-autocomplete-list');
            list.innerHTML = '';
            if (!val || !window.realUserDB) return;

            const matches = window.realUserDB.filter(u => u.empId.includes(val) || u.name.includes(val)).slice(0, 10);
            matches.forEach(user => {
                const item = document.createElement('div');
                item.innerHTML = `<strong>${user.empId}</strong> - ${user.name}`;
                item.className = "p-2 border-bottom text-dark bg-white cursor-pointer autocomplete-hover";
                item.style.cursor = "pointer";
                item.addEventListener('click', () => {
                    opSearchInput.value = user.name; // 填入精準姓名
                    list.innerHTML = '';
                    window.updateCtrlHistoryTableUI(); // 點選後自動觸發篩選
                });
                list.appendChild(item);
            });
        });
    }

    // 點擊空白處關閉選單
    document.addEventListener("click", function (e) {
        if (e.target !== document.getElementById('ctrlHistDrugSearch')) {
            const list = document.getElementById('ctrl-hist-drug-autocomplete-list');
            if (list) list.innerHTML = '';
        }
        if (e.target !== document.getElementById('ctrlHistOpSearch')) {
            const list = document.getElementById('ctrl-hist-op-autocomplete-list');
            if (list) list.innerHTML = '';
        }
    });
});

// ✨ 3. 大表專屬初始化 (由 app.js 登入後或 ctrl_drug.js 觸發)
window.initCtrlHistorySection = function() {
    // 鎖定調劑單位
    const stationDisplay = document.getElementById('ctrlHistStationDisplay');
    if (stationDisplay && window.currentUser) {
        stationDisplay.value = window.currentUser.station;
    }

    // 動態載入作業方式 (從 SharePoint 系統參數維護檔)
    const actionSelect = document.getElementById('ctrlHistActionSelect');
    if (actionSelect && window.sysParamsDB && window.currentUser) {
        actionSelect.innerHTML = '<option value="全部">全部項目</option>';
        const stationOptions = window.sysParamsDB.filter(p => 
            p.title === '管藥作業項目' && 
            (p.station === window.currentUser.station || p.station === '全院通用')
        );
        stationOptions.forEach(opt => {
            const el = document.createElement('option');
            el.value = opt.itemName;
            el.innerText = opt.itemName;
            actionSelect.appendChild(el);
        });
    }
};

window.updateCtrlHistoryTableUI = function() {
    const tbody = document.getElementById('ctrlHistTableBody');
    if (!tbody) return;

    const startDate = document.getElementById('ctrlHistStartDate').value;
    const endDate = document.getElementById('ctrlHistEndDate').value;
    const drugSearch = document.getElementById('ctrlHistDrugSearch').value.toUpperCase().trim();
    const opSearch = document.getElementById('ctrlHistOpSearch').value.toUpperCase().trim();
    const actionSelect = document.getElementById('ctrlHistActionSelect').value;
    const statusSelect = document.getElementById('ctrlHistStatusSelect').value;

    const startTimestamp = startDate ? new Date(startDate + "T00:00:00").getTime() : 0;
    const endTimestamp = endDate ? new Date(endDate + "T23:59:59").getTime() : Infinity;

    if (typeof ctrlTransferList === 'undefined') return;

    const filtered = ctrlTransferList.filter(item => {
        // ✨ 新增防呆：確保只顯示當前單位的紀錄
        if (item.station && window.currentUser && item.station !== window.currentUser.station) return false;

        if (item.rawTime < startTimestamp || item.rawTime > endTimestamp) return false;
        if (drugSearch) {
            const code = (item.drugCode || "").toUpperCase();
            const name = (item.drugName || "").toUpperCase();
            const sap = (item.sap || "").toUpperCase();
            if (!code.includes(drugSearch) && !name.includes(drugSearch) && !sap.includes(drugSearch)) return false;
        }
        if (opSearch) {
            const uid = (item.operatorId || "").toUpperCase();
            const uname = (item.operatorName || "").toUpperCase();
            if (!uid.includes(opSearch) && !uname.includes(opSearch)) return false;
        }
        if (actionSelect !== '全部' && item.actionType !== actionSelect) return false;
        const currentStatus = item.recordStatus || "正常";
        if (statusSelect !== '全部' && currentStatus !== statusSelect) return false;
        return true;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="text-muted py-4">🔍 在此篩選區間內，查無任何符合條件的管制藥紀錄</td></tr>`;
        return;
    }

    let html = '';
    filtered.forEach(item => {
        const isVoided = item.recordStatus === '已作廢';
        const isQtyNegative = item.quantity < 0;
        const qtyDisplay = isQtyNegative ? `${item.quantity}` : `+${item.quantity}`;
        
        const qtyClass = isVoided ? 'text-muted' : (isQtyNegative ? 'text-danger fw-bold' : 'text-success fw-bold');
        const statusBadge = isVoided ? '<span class="badge bg-secondary">已作廢</span>' : '<span class="badge bg-success">正常</span>';
        const safeRemark = (item.remark || '無備註').replace(/'/g, "\\'").replace(/"/g, "&quot;").replace(/\n/g, "\\n");

        html += `
            <tr class="${isVoided ? 'table-secondary text-muted' : ''}">
                <td style="font-size: 0.8rem;" class="text-start font-monospace">
                    <div>${item.timestamp.split(' ')[0]}</div>
                    <div class="text-secondary">${item.timestamp.split(' ')[1] || ''}</div>
                </td>
                <td><span class="badge ${isVoided ? 'bg-secondary' : (isQtyNegative ? 'bg-danger' : 'bg-success')}">${item.actionType}</span></td>
                <td class="font-monospace text-start">
                    <div class="fw-bold fs-6">${item.drugCode}</div>
                    ${item.sap ? `<div class="small text-muted">${item.sap}</div>` : ''}
                </td>
                <td class="text-start">
                    <div class="${isVoided ? 'text-decoration-line-through text-muted' : 'fw-bold text-dark'}" style="font-size:0.85rem;">${item.drugName}</div>
                </td>
                <td class="text-start font-monospace" style="font-size: 0.8rem;">
                    <div>🏥 ${item.patientNo && !item.patientNo.includes('手動') ? item.patientNo : '<span class="text-muted">-</span>'}</div>
                    <div>🧾 ${item.prescribeNo && !item.prescribeNo.includes('手動') ? item.prescribeNo : '<span class="text-muted">-</span>'}</div>
                </td>
                <td><span class="${qtyClass} fs-5">${qtyDisplay} 支</span></td>
                <td>
                    <div class="fw-bold">${item.operatorName}</div>
                    <small class="text-muted font-monospace">${item.operatorId}</small>
                </td>
                <td>
                    <div class="mb-1">${statusBadge}</div>
                    <button class="btn btn-sm btn-outline-info py-0 px-2 mt-1" style="font-size:0.7rem;" onclick="alert('【詳細備註紀錄】\\n\\n' + '${safeRemark}')">詳細</button>
                </td>
                <td>
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-secondary py-0 px-2" style="font-size:0.75rem;" onclick="window.editCtrlItem('${item.id}', ${item.quantity}, '${item.actionType}')" ${isVoided ? 'disabled' : ''}>✏️</button>
                        ${isVoided 
                            ? `<button class="btn btn-outline-success py-0 px-2" style="font-size:0.75rem;" onclick="window.restoreCtrlItem('${item.id}')">♻️</button>`
                            : `<button class="btn btn-outline-danger py-0 px-2" style="font-size:0.75rem;" onclick="window.voidCtrlItem('${item.id}')">🗑️</button>`
                        }
                    </div>
                </td>
            </tr>`;
    });
    tbody.innerHTML = html;
};
