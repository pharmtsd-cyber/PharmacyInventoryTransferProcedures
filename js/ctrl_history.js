/**
 * ====================================================================
 * 📊 管藥全頁審計紀錄大表專屬模組 (js/ctrl_history.js)
 * 負責處理大表的 UI 渲染、交叉篩選與日期初始化
 * 依賴：ctrlTransferList (來自 ctrl_drug.js)
 * ====================================================================
 */

document.addEventListener('DOMContentLoaded', () => {
    // 1. 綁定大表篩選按鈕
    const ctrlHistSearchBtn = document.getElementById('ctrlHistSearchBtn');
    if (ctrlHistSearchBtn) {
        // ✨ 注意：這裡呼叫掛載在 window 上的全域函數
        ctrlHistSearchBtn.addEventListener('click', window.updateCtrlHistoryTableUI);
    }

    // 2. 初始化全頁大表的預設搜尋日期（近兩天）
    const todayIso = new Date().toISOString().split('T')[0];
    const twoDaysAgoIso = new Date(Date.now() - 172800000).toISOString().split('T')[0];
    if(document.getElementById('ctrlHistStartDate')) document.getElementById('ctrlHistStartDate').value = twoDaysAgoIso;
    if(document.getElementById('ctrlHistEndDate')) document.getElementById('ctrlHistEndDate').value = todayIso;
});

// ✨ 將大表渲染引擎掛載到 window，讓 ctrl_drug.js 也能呼叫它來觸發連動更新
window.updateCtrlHistoryTableUI = function() {
    const tbody = document.getElementById('ctrlHistTableBody');
    if (!tbody) return;

    // 抓取篩選面板的所有條件
    const startDate = document.getElementById('ctrlHistStartDate').value;
    const endDate = document.getElementById('ctrlHistEndDate').value;
    const drugSearch = document.getElementById('ctrlHistDrugSearch').value.toUpperCase().trim();
    const opSearch = document.getElementById('ctrlHistOpSearch').value.toUpperCase().trim();
    const actionSelect = document.getElementById('ctrlHistActionSelect').value;
    const statusSelect = document.getElementById('ctrlHistStatusSelect').value;

    const startTimestamp = startDate ? new Date(startDate + "T00:00:00").getTime() : 0;
    const endTimestamp = endDate ? new Date(endDate + "T23:59:59").getTime() : Infinity;

    // 進行地端高階多條件交叉篩選 (讀取 ctrl_drug.js 中的 ctrlTransferList)
    if (typeof ctrlTransferList === 'undefined') return;

    const filtered = ctrlTransferList.filter(item => {
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
        tbody.innerHTML = `<tr><td colspan="9" class="text-muted py-4">🔍 在此篩選區間內，查無任何符合條件的管制藥審計紀錄</td></tr>`;
        return;
    }

    let html = '';
    filtered.forEach(item => {
        const isVoided = item.recordStatus === '已作廢';
        const isQtyNegative = item.quantity < 0;
        const qtyDisplay = isQtyNegative ? `${item.quantity}` : `+${item.quantity}`;
        
        const rowClass = isVoided ? 'table-secondary text-muted opacity-75 text-decoration-line-through' : '';
        const qtyClass = isVoided ? 'text-muted' : (isQtyNegative ? 'text-danger fw-bold' : 'text-success fw-bold');
        const statusBadge = isVoided ? '<span class="badge bg-secondary">已作廢</span>' : '<span class="badge bg-success">正常</span>';

        html += `
            <tr class="${isVoided ? 'table-secondary text-muted' : ''}">
                <td style="font-size: 0.8rem;" class="text-start font-monospace">
                    <div>${item.timestamp.split(' ')[0]}</div>
                    <div class="text-secondary">${item.timestamp.split(' ')[1] || ''}</div>
                    <small class="text-muted d-block">ID: ${item.id}</small>
                </td>
                <td><span class="badge ${isVoided ? 'bg-secondary' : (isQtyNegative ? 'bg-danger' : 'bg-success')}">${item.actionType}</span></td>
                <td class="fw-bold font-monospace">${item.drugCode}</td>
                <td class="text-start">
                    <div class="${isVoided ? 'text-decoration-line-through text-muted' : 'fw-bold text-dark'}" style="font-size:0.85rem;">${item.drugName}</div>
                    <small class="text-muted font-monospace">SAP: ${item.sap || '未知'}</small>
                </td>
                <td class="text-start font-monospace" style="font-size: 0.8rem;">
                    <div>🏥 病歷: ${item.patientNo && !item.patientNo.includes('手動') ? item.patientNo : '<span class="text-muted">-</span>'}</div>
                    <div>🧾 領藥: ${item.prescribeNo && !item.prescribeNo.includes('手動') ? item.prescribeNo : '<span class="text-muted">-</span>'}</div>
                </td>
                <td><span class="${qtyClass} fs-5">${qtyDisplay} 支</span></td>
                <td>
                    <div class="fw-bold">${item.operatorName}</div>
                    <small class="text-muted font-monospace">${item.operatorId}</small>
                </td>
                <td class="text-start small" style="max-width: 180px; font-size:0.8rem;" title="${item.remark || ''}">
                    <div class="mb-1">${statusBadge}</div>
                    <div class="text-truncate text-secondary">${item.remark || '-'}</div>
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
