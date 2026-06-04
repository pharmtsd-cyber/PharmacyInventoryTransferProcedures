// ==========================================
// 📊 調撥紀錄專屬獨立 JS (js/transfer_history.js)
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    const transHistSearchBtn = document.getElementById('transHistSearchBtn');
    if (transHistSearchBtn) transHistSearchBtn.addEventListener('click', window.updateTransHistoryTableUI);

    const todayIso = new Date().toISOString().split('T')[0];
    if(document.getElementById('transHistStartDate')) document.getElementById('transHistStartDate').value = todayIso;
    if(document.getElementById('transHistEndDate')) document.getElementById('transHistEndDate').value = todayIso;

    // 藥品自動完成
    const drugSearchInput = document.getElementById('transHistDrugSearch');
    if (drugSearchInput) {
        drugSearchInput.addEventListener('input', function(e) {
            const val = e.target.value.toUpperCase().trim();
            const list = document.getElementById('trans-hist-drug-autocomplete-list');
            list.innerHTML = '';
            if (!val || !window.realDrugDB) return;
            const matches = window.realDrugDB.filter(d => (d.code || "").toUpperCase().includes(val) || (d.name || "").toUpperCase().includes(val)).slice(0, 10);
            matches.forEach(drug => {
                const item = document.createElement('div');
                item.innerHTML = `<strong>${drug.code}</strong> - ${drug.name}`;
                item.className = "p-2 border-bottom text-dark bg-white autocomplete-hover";
                item.style.cursor = "pointer";
                item.addEventListener('click', () => {
                    drugSearchInput.value = drug.code; list.innerHTML = ''; window.updateTransHistoryTableUI(); 
                });
                list.appendChild(item);
            });
        });
    }

    // 藥師自動完成
    const opSearchInput = document.getElementById('transHistOpSearch');
    if (opSearchInput) {
        opSearchInput.addEventListener('input', function(e) {
            const val = e.target.value.toUpperCase().trim();
            const list = document.getElementById('trans-hist-op-autocomplete-list');
            list.innerHTML = '';
            if (!val || !window.realUserDB) return;
            const matches = window.realUserDB.filter(u => u.empId.includes(val) || u.name.includes(val)).slice(0, 10);
            matches.forEach(user => {
                const item = document.createElement('div');
                item.innerHTML = `<strong>${user.empId}</strong> - ${user.name}`;
                item.className = "p-2 border-bottom text-dark bg-white autocomplete-hover";
                item.style.cursor = "pointer";
                item.addEventListener('click', () => {
                    opSearchInput.value = user.name; list.innerHTML = ''; window.updateTransHistoryTableUI();
                });
                list.appendChild(item);
            });
        });
    }

    document.addEventListener("click", function (e) {
        if (e.target !== document.getElementById('transHistDrugSearch')) {
            const list = document.getElementById('trans-hist-drug-autocomplete-list');
            if (list) list.innerHTML = '';
        }
        if (e.target !== document.getElementById('transHistOpSearch')) {
            const list = document.getElementById('trans-hist-op-autocomplete-list');
            if (list) list.innerHTML = '';
        }
    });
});

window.initTransHistorySection = function() {
    const stationDisplay = document.getElementById('transHistStationDisplay');
    if (stationDisplay && window.currentUser) stationDisplay.value = window.currentUser.station;
};

// ✨ 新增：共用精美明細彈窗函數
// ✨ 建立一個全域字典，用來暫存明細 HTML
window.transDetailCache = {};

window.showTransDetailPopup = function(id) {
    // 透過 ID 從字典中取出字串，完全不需要 decode 或 replace
    const htmlContent = window.transDetailCache[id] || "<div class='text-muted'>無法讀取明細</div>";
    
    Swal.fire({
        title: '📋 調撥紀錄明細',
        html: `<div class="text-start p-3 bg-light rounded border shadow-sm" style="font-size:0.95rem; line-height: 1.6;">${htmlContent}</div>`,
        icon: 'info',
        confirmButtonColor: '#0d6efd',
        confirmButtonText: '關閉'
    });
};

window.updateTransHistoryTableUI = function() {
    const tbody = document.getElementById('transHistTableBody');
    if (!tbody) return;

    const startDate = document.getElementById('transHistStartDate').value;
    const endDate = document.getElementById('transHistEndDate').value;
    const drugSearch = document.getElementById('transHistDrugSearch').value.toUpperCase().trim();
    const opSearch = document.getElementById('transHistOpSearch').value.toUpperCase().trim();
    const actionSelect = document.getElementById('transHistActionSelect').value;
    const statusSelect = document.getElementById('transHistStatusSelect').value;

    const startTimestamp = startDate ? new Date(startDate + "T00:00:00").getTime() : 0;
    const endTimestamp = endDate ? new Date(endDate + "T23:59:59").getTime() : Infinity;

    if (typeof transferList === 'undefined') return;

    const filtered = transferList.filter(item => {
        if (item.station && window.currentUser && item.station !== window.currentUser.station) return false;
        if (item.rawTime < startTimestamp || item.rawTime > endTimestamp) return false;
        if (drugSearch) {
            const code = (item.drugCode || item.code || "").toUpperCase();
            const name = (item.drugName || item.name || "").toUpperCase();
            if (!code.includes(drugSearch) && !name.includes(drugSearch)) return false;
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
        tbody.innerHTML = `<tr><td colspan="8" class="text-muted py-4">🔍 在此篩選區間內，查無任何符合條件的紀錄</td></tr>`;
        return;
    }

    let html = '';
    filtered.forEach(item => {
        const isVoided = item.recordStatus === '已作废' || item.recordStatus === '已作廢';
        const isQtyNegative = item.quantity < 0;
        const qtyDisplay = isQtyNegative ? `${item.quantity}` : `+${item.quantity}`;
        
        const qtyClass = isVoided ? 'text-muted' : (isQtyNegative ? 'text-danger fw-bold' : 'text-success fw-bold');
        const statusBadge = isVoided ? '<span class="badge bg-secondary">已作廢</span>' : '<span class="badge bg-primary">正常</span>';
        
        const isReported = item.reportStatus === '未處理' || item.reportStatus === '處理中';
        const isResolved = item.reportStatus === '已結案';
        let rowStyle = isVoided ? 'table-secondary text-muted' : '';
        if (!isVoided && isReported) rowStyle = 'table-warning';
        if (!isVoided && isResolved) rowStyle = 'table-info';

        const reportBtnClass = (isReported || isResolved) ? 'btn-outline-warning text-dark fw-bold' : 'btn-outline-secondary';
        const reportBtnText = (isReported || isResolved) ? '查看通報' : '異常通報';

        // ✨ 組合「四大類別」並轉換為 HTML 格式，徹底美化排版
        let detailHtml = ``;
        if (item.remark) detailHtml += `<div class="mb-3 border-bottom pb-2"><strong>📍【作業備註】</strong> (👤 ${item.operatorName || '未知'})<br><span class="text-secondary">${item.remark}</span></div>`;
        if (item.voidReason) detailHtml += `<div class="mb-3 border-bottom pb-2"><strong>🗑️【作廢軌跡】</strong> (👤 ${item.voidName || '未知'} - ${item.voidEmpID || ''})<br><span class="text-danger">${item.voidReason}</span></div>`;
        if (item.reportReason) detailHtml += `<div class="mb-3 border-bottom pb-2"><strong>⚠️【異常通報】</strong> (👤 ${item.reportName || '未知'} - ${item.reportEmpID || ''})<br>狀態：<span class="badge bg-warning text-dark">${item.reportStatus || '未處理'}</span><br><span class="text-dark">${item.reportReason}</span></div>`;
        if (item.managerResult) detailHtml += `<div class="mb-1"><strong>🛡️【主管批示】</strong> (👤 ${item.managerName || '未知'} - ${item.managerEmpID || ''})<br><span class="text-success fw-bold">${item.managerResult}</span></div>`;
        if (!detailHtml) detailHtml = "<div class='text-muted text-center py-3'>目前無任何備註或通報紀錄。</div>";

        // 使用 encodeURIComponent 避免引號造成的報錯
        window.transDetailCache[item.id] = detailHtml;

        html += `
            <tr class="${rowStyle}">
                <td style="font-size: 0.8rem;" class="text-start font-monospace">
                    <div>${item.timestamp.split(' ')[0]}</div>
                    <div class="text-secondary">${item.timestamp.split(' ')[1] || ''}</div>
                </td>
                <td><span class="badge ${isVoided ? 'bg-secondary' : 'bg-primary'}">${item.actionType || '調出'}</span></td>
                <td class="font-monospace text-start fw-bold fs-6">${item.drugCode || item.code}</td>
                <td class="text-start">
                    <div class="${isVoided ? 'text-decoration-line-through text-muted' : 'fw-bold text-dark'}" style="font-size:0.85rem;">${item.drugName || item.name}</div>
                </td>
                <td><span class="${qtyClass} fs-5">${qtyDisplay}</span></td>
                <td>
                    <div class="fw-bold">${item.operatorName}</div>
                    <small class="text-muted font-monospace">${item.operatorId}</small>
                </td>
                <td>
                    <div class="mb-1">${statusBadge}</div>
                    <button class="btn btn-sm btn-info py-0 px-2 mt-1 text-white shadow-sm" style="font-size:0.7rem;" onclick="window.showTransDetailPopup('${item.id}')">展開紀錄</button>
                </td>
                <td>
                    <div class="d-flex flex-column gap-1 align-items-center">
                        <div class="btn-group btn-group-sm w-100">
                            <button class="btn btn-outline-secondary py-0 px-2" style="font-size:0.75rem;" onclick="window.editTransferItem('${item.id}', ${item.quantity})" ${isVoided ? 'disabled' : ''}>✏️</button>
                            ${isVoided 
                                ? `<button class="btn btn-outline-success py-0 px-2" style="font-size:0.75rem;" onclick="window.restoreTransferItem('${item.id}')">♻️</button>`
                                : `<button class="btn btn-outline-danger py-0 px-2" style="font-size:0.75rem;" onclick="window.voidTransferItem('${item.id}')">🗑️</button>`
                            }
                        </div>
                        <button class="btn btn-sm ${reportBtnClass} py-0 w-100 mt-1" style="font-size:0.7rem;" onclick="window.reportAnomalyTransferItem('${item.id}')" ${isVoided ? 'disabled' : ''}>⚠️ ${reportBtnText}</button>
                    </div>
                </td>
            </tr>`;
    });
    tbody.innerHTML = html;
};
