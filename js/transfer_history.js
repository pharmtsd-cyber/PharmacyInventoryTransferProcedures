// ==========================================
// 📊 調撥紀錄專屬獨立 JS (js/transfer_history.js) - 雲端連線版
// ==========================================

window.transDetailCache = {};
window.transApiDataCache = []; // ✨ 暫存從資料庫撈回來的真實資料

document.addEventListener('DOMContentLoaded', () => {

    // ✨ 點擊頁籤時，帶入預設值並自動向 SharePoint 發送請求
    const transHistTab = document.querySelector('.academic-tabs .nav-link[data-tab="transfer-history"]');
    if (transHistTab) {
        transHistTab.addEventListener('click', () => {
            const inDept = document.getElementById('transHistInDept');
            const outDept = document.getElementById('transHistOutDept');
            if (inDept && window.currentUser && window.currentUser.station) inDept.value = window.currentUser.station;
            if (outDept) outDept.value = '藥品管理組';
            
            window.fetchTransHistoryFromDB(); // ⚡ 連線抓資料
        });
    }

    const transHistSearchBtn = document.getElementById('transHistSearchBtn');
    if (transHistSearchBtn) transHistSearchBtn.addEventListener('click', window.fetchTransHistoryFromDB);

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
                    drugSearchInput.value = drug.code; list.innerHTML = ''; 
                    window.renderTransHistoryTableUI(); // 本地過濾
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
                    opSearchInput.value = user.name; list.innerHTML = ''; 
                    window.renderTransHistoryTableUI(); // 本地過濾
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

window.showTransDetailPopup = function(id) {
    const htmlContent = window.transDetailCache[id] || "<div class='text-muted'>無法讀取明細</div>";
    Swal.fire({
        title: '📋 調撥紀錄明細',
        html: `<div class="text-start p-3 bg-light rounded border shadow-sm" style="font-size:0.95rem; line-height: 1.6;">${htmlContent}</div>`,
        icon: 'info',
        confirmButtonColor: '#0d6efd',
        confirmButtonText: '關閉'
    });
};

// ==========================================
// ⚡ 核心 1：向資料庫抓取真實資料
// ==========================================
window.fetchTransHistoryFromDB = async function() {
    const tbody = document.getElementById('transHistTableBody');
    if (!tbody) return;

    // 顯示載入動畫
    tbody.innerHTML = `<tr><td colspan="8" class="text-center py-5"><div class="spinner-border text-primary me-2" role="status"></div><b class="text-primary fs-5">連線至 SharePoint 讀取即時資料中...</b></td></tr>`;

    try {
        const response = await fetch(GET_API_URL + "&action=getHistory", { method: 'GET' });
        if (!response.ok) throw new Error("API 連線失敗");
        
        const records = await response.json();
        window.transApiDataCache = records; 
        
        window.renderTransHistoryTableUI(); 
    } catch (error) {
        console.error(error);
        tbody.innerHTML = `<tr><td colspan="8" class="text-danger py-4">❌ 讀取資料庫失敗，請檢查網路連線</td></tr>`;
    }
};

// ==========================================
// ⚡ 核心 2：將抓回來的資料進行畫面過濾與渲染
// ==========================================
window.renderTransHistoryTableUI = function() {
    const tbody = document.getElementById('transHistTableBody');
    if (!tbody) return;

    const startDate = document.getElementById('transHistStartDate').value;
    const endDate = document.getElementById('transHistEndDate').value;
    const drugSearch = document.getElementById('transHistDrugSearch').value.toUpperCase().trim();
    const opSearch = document.getElementById('transHistOpSearch').value.toUpperCase().trim();
    const statusSelect = document.getElementById('transHistStatusSelect').value;

    const filterOutDept = document.getElementById('transHistOutDept').value;
    const filterInDept = document.getElementById('transHistInDept').value;

    const startTimestamp = startDate ? new Date(startDate + "T00:00:00").getTime() : 0;
    const endTimestamp = endDate ? new Date(endDate + "T23:59:59").getTime() : Infinity;

    const filtered = window.transApiDataCache.filter(item => {
        if (filterOutDept !== '全部' && item.outDept !== filterOutDept) return false;
        if (filterInDept !== '全部' && item.inDept !== filterInDept) return false;
        
        let itemTimeMs = 0;
        if (item.timestamp) itemTimeMs = new Date(item.timestamp).getTime();
        if (itemTimeMs > 0 && (itemTimeMs < startTimestamp || itemTimeMs > endTimestamp)) return false;
        
        if (drugSearch) {
            const code = (item.drugCode || "").toUpperCase();
            const name = (item.drugName || "").toUpperCase();
            if (!code.includes(drugSearch) && !name.includes(drugSearch)) return false;
        }
        if (opSearch) {
            const uid = (item.operatorId || "").toUpperCase();
            const uname = (item.operatorName || "").toUpperCase();
            if (!uid.includes(opSearch) && !uname.includes(opSearch)) return false;
        }
        
        const isVoided = !!(item.voidReason && item.voidReason.trim() !== '');
        const currentStatus = isVoided ? "已作廢" : "正常";
        if (statusSelect !== '全部' && currentStatus !== statusSelect) return false;
        
        return true;
    });

    // 排序：從新到舊
    filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-muted py-4">🔍 在此篩選區間內，查無任何符合條件的紀錄</td></tr>`;
        return;
    }

    let html = '';
    filtered.forEach(item => {
        const isVoided = !!(item.voidReason && item.voidReason.trim() !== '');
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

        let detailHtml = ``;
        if (item.remark) detailHtml += `<div class="mb-3 border-bottom pb-2"><strong>📍【作業備註】</strong> (👤 ${item.operatorName || '未知'})<br><span class="text-secondary">${item.remark}</span></div>`;
        if (item.voidReason) detailHtml += `<div class="mb-3 border-bottom pb-2"><strong>🗑️【作廢軌跡】</strong> (👤 ${item.voidName || '未知'} - ${item.voidEmpID || ''})<br><span class="text-danger">${item.voidReason}</span></div>`;
        if (item.reportReason) detailHtml += `<div class="mb-3 border-bottom pb-2"><strong>⚠️【異常通報】</strong> (👤 ${item.reportName || '未知'} - ${item.reportEmpID || ''})<br>狀態：<span class="badge bg-warning text-dark">${item.reportStatus || '未處理'}</span><br><span class="text-dark">${item.reportReason}</span></div>`;
        if (item.managerResult) detailHtml += `<div class="mb-1"><strong>🛡️【主管批示】</strong> (👤 ${item.managerName || '未知'} - ${item.managerEmpID || ''})<br><span class="text-success fw-bold">${item.managerResult}</span></div>`;
        if (!detailHtml) detailHtml = "<div class='text-muted text-center py-3'>目前無任何備註或通報紀錄。</div>";

        window.transDetailCache[item.id] = detailHtml;

        const dispDate = item.timestamp ? item.timestamp.split('T')[0] : '';
        const dispTime = item.timestamp && item.timestamp.includes('T') ? item.timestamp.split('T')[1].substring(0,8) : '';

        html += `
            <tr class="${rowStyle}">
                <td style="font-size: 0.8rem;" class="text-start font-monospace">
                    <div>${dispDate}</div>
                    <div class="text-secondary">${dispTime}</div>
                </td>
                <td><span class="badge ${isVoided ? 'bg-secondary' : 'bg-primary'}">${item.actionType || '調出'}</span></td>
                <td class="font-monospace text-start fw-bold fs-6">${item.drugCode || ''}</td>
                <td class="text-start">
                    <div class="${isVoided ? 'text-decoration-line-through text-muted' : 'fw-bold text-dark'}" style="font-size:0.85rem;">${item.drugName || ''}</div>
                </td>
                <td><span class="${qtyClass} fs-5">${qtyDisplay}</span></td>
                <td>
                    <div class="fw-bold">${item.operatorName || ''}</div>
                    <small class="text-muted font-monospace">${item.operatorId || ''}</small>
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
