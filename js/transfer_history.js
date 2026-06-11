// ==========================================
// 📊 調撥紀錄專屬獨立 JS (js/transfer_history.js) - 雲端連線版
// ==========================================

window.transDetailCache = {};
window.transApiDataCache = []; // ✨ 暫存從資料庫撈回來的真實資料

document.addEventListener('DOMContentLoaded', () => {

    // ✨ 點擊頁籤時，動態生成「檢視範圍」的切換按鈕，並發送請求
    const transHistTab = document.querySelector('.academic-tabs .nav-link[data-tab="transfer-history"]');
    if (transHistTab) {
        transHistTab.addEventListener('click', () => {
            const inDept = document.getElementById('transHistInDept');
            const outDept = document.getElementById('transHistOutDept');
            
            // ✨ 動態插入「檢視範圍」切換按鈕 (若尚未產生)
            const titleContainer = document.querySelector('#content-transfer-history .border-bottom.pb-2.mb-3');
            if (titleContainer && !document.getElementById('transHistScopeGroup')) {
                titleContainer.classList.remove('d-flex'); 
                titleContainer.innerHTML = `
                    <div class="d-flex justify-content-between align-items-center w-100">
                        <div class="d-flex align-items-center gap-3">
                            <h5 class="text-theme fw-bold mb-0">📊 一般藥品調撥紀錄表</h5>
                            <div class="btn-group btn-group-sm shadow-sm" role="group" id="transHistScopeGroup">
                                <input type="radio" class="btn-check" name="transHistScope" id="scopeMyStation" value="myStation" checked>
                                <label class="btn btn-outline-theme fw-bold px-3" for="scopeMyStation">🏥 登入單位紀錄</label>
                                <input type="radio" class="btn-check" name="transHistScope" id="scopeAll" value="all">
                                <label class="btn btn-outline-theme fw-bold px-3" for="scopeAll">🌍 全藥局紀錄</label>
                            </div>
                        </div>
                    </div>
                `;
                
                // 綁定切換事件
                document.getElementById('scopeMyStation').addEventListener('change', window.renderTransHistoryTableUI);
                document.getElementById('scopeAll').addEventListener('change', window.renderTransHistoryTableUI);
            }

            // 預設帶入初始過濾值
            if (window.currentUser && window.currentUser.station) {
                if (window.currentUser.station === '藥品管理組') {
                    if (inDept) inDept.value = '全部';
                    if (outDept) outDept.value = '藥品管理組';
                } else {
                    if (inDept) inDept.value = window.currentUser.station;
                    if (outDept) outDept.value = '藥品管理組';
                }
            }
            
            window.fetchTransHistoryFromDB(); 
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
                    window.renderTransHistoryTableUI(); 
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
                    window.renderTransHistoryTableUI(); 
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

    tbody.innerHTML = `<tr><td colspan="8" class="text-center py-5"><div class="spinner-border text-theme me-2" role="status"></div><b class="text-theme fs-5">連線至 SharePoint 讀取即時資料中...</b></td></tr>`;

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

    const scopeMyStation = document.getElementById('scopeMyStation');
    const isScopeMyStation = scopeMyStation ? scopeMyStation.checked : true; 

    const outDeptSelect = document.getElementById('transHistOutDept');
    const inDeptSelect = document.getElementById('transHistInDept');

    // ✨ 優化 1：完美隱藏/顯示邏輯！如果是登入單位紀錄，連同外層 div 一起隱藏，避免使用者誤會
    if (outDeptSelect && outDeptSelect.parentElement) {
        if (isScopeMyStation) outDeptSelect.parentElement.classList.add('hidden');
        else outDeptSelect.parentElement.classList.remove('hidden');
    }
    if (inDeptSelect && inDeptSelect.parentElement) {
        if (isScopeMyStation) inDeptSelect.parentElement.classList.add('hidden');
        else inDeptSelect.parentElement.classList.remove('hidden');
    }

    const startDate = document.getElementById('transHistStartDate').value;
    const endDate = document.getElementById('transHistEndDate').value;
    const drugSearch = document.getElementById('transHistDrugSearch').value.toUpperCase().trim();
    const opSearch = document.getElementById('transHistOpSearch').value.toUpperCase().trim();
    const statusSelect = document.getElementById('transHistStatusSelect').value;

    const filterOutDept = outDeptSelect ? outDeptSelect.value : '全部';
    const filterInDept = inDeptSelect ? inDeptSelect.value : '全部';

    const startTimestamp = startDate ? new Date(startDate + "T00:00:00").getTime() : 0;
    const endTimestamp = endDate ? new Date(endDate + "T23:59:59").getTime() : Infinity;

    const myStation = window.currentUser ? window.currentUser.station : '';

    const filtered = window.transApiDataCache.filter(item => {
        const outD = item.outDept || item.outdept || '';
        const inD = item.inDept || item.indept || '';
        const dCode = item.drugCode || item.drugcode || '';
        const dName = item.drugName || item.drugname || '';
        const opId = item.operatorId || item.operatorid || '';
        const opName = item.operatorName || item.operatorname || '';

        // ✨ SAP 反查：如果資料庫沒有 SAP，從本地藥檔反查拿來給搜尋功能用
        let sap = item.sap || item.sapCode || '';
        if (!sap && window.realDrugDB) {
            const match = window.realDrugDB.find(d => d.code === dCode);
            if (match && match.sap) sap = match.sap;
        }

        if (isScopeMyStation && myStation) {
            if (outD !== myStation && inD !== myStation) return false;
        } else {
            if (filterOutDept !== '全部' && outD !== filterOutDept) return false;
            if (filterInDept !== '全部' && inD !== filterInDept) return false;
        }
        
        let itemTimeMs = 0;
        if (item.timestamp) itemTimeMs = new Date(item.timestamp).getTime();
        if (itemTimeMs > 0 && (itemTimeMs < startTimestamp || itemTimeMs > endTimestamp)) return false;
        
        if (drugSearch) {
            if (!dCode.toUpperCase().includes(drugSearch) && !dName.toUpperCase().includes(drugSearch) && !sap.toUpperCase().includes(drugSearch)) return false;
        }
        if (opSearch) {
            if (!opId.toUpperCase().includes(opSearch) && !opName.toUpperCase().includes(opSearch)) return false;
        }
        
        const currentStatus = item.recordStatus || item.RecordStatus || "正常";
        if (statusSelect !== '全部' && currentStatus !== statusSelect) return false;
        
        return true;
    });

    filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-muted py-4">🔍 在此篩選區間內，查無任何符合條件的紀錄</td></tr>`;
        return;
    }

    let html = '';

    filtered.forEach(item => {
        const outD = item.outDept || item.outdept || '未知';
        const inD = item.inDept || item.indept || '未知';
        const dCode = item.drugCode || item.drugcode || '無院內碼';
        const dName = item.drugName || item.drugname || '未知藥品';
        const opId = item.operatorId || item.operatorid || '';
        const opName = item.operatorName || item.operatorname || '';

        // ✨ SAP 碼神救援：資料庫沒存，我們直接拿 drugCode 去問本地藥檔！
        let sapValue = item.sap || item.sapCode || '';
        if (!sapValue && window.realDrugDB) {
            const matchDrug = window.realDrugDB.find(d => d.code === dCode);
            if (matchDrug && matchDrug.sap) sapValue = matchDrug.sap;
        }
        const sapDisplay = sapValue ? sapValue : '無SAP碼';
        
        // ✨ 對齊後端欄位：從 F12 得知後端把條碼/手動存在 actionType
        const modeValue = item.actionType || item.mode || item.inputMode || '未知';

        const currentStatus = item.recordStatus || item.RecordStatus || "正常";
        const isVoided = (currentStatus === '已作废' || currentStatus === '已作廢');
        
        const rawQty = Math.abs(parseInt(item.quantity, 10)) || 0; 

        // 動態判定主題色
        let themeColorClass = 'primary'; 
        if (inD.includes('急診')) themeColorClass = 'danger'; 
        else if (inD.includes('住院')) themeColorClass = 'success'; 
        else if (inD.includes('調配')) themeColorClass = 'brown'; 
        else if (inD.includes('管理組') || inD.includes('藥庫')) themeColorClass = 'secondary'; 
        
        const qtyClass = isVoided ? 'text-muted' : `text-${themeColorClass} fw-bold`;
        const flowBadgeClass = isVoided ? 'bg-secondary' : `bg-${themeColorClass}`;
        const statusBadge = isVoided ? '<span class="badge bg-secondary">已作廢</span>' : '<span class="badge bg-primary">正常</span>';
        
        let modeBadgeClass = 'bg-info text-dark'; 
        if (modeValue === '手動') modeBadgeClass = 'bg-warning text-dark'; 
        
        const isReported = item.reportStatus === '未處理' || item.reportStatus === '處理中';
        const isResolved = item.reportStatus === '已結案';
        let rowStyle = isVoided ? 'table-secondary text-muted' : '';
        if (!isVoided && isReported) rowStyle = 'table-warning';
        if (!isVoided && isResolved) rowStyle = 'table-info';

        const reportBtnClass = (isReported || isResolved) ? 'btn-outline-warning text-dark fw-bold' : 'btn-outline-secondary';
        const reportBtnText = (isReported || isResolved) ? '查看通報' : '異常通報';

        let detailHtml = ``;
        if (item.remark) detailHtml += `<div class="mb-3 border-bottom pb-2"><strong>📍【作業備註】</strong> (👤 ${opName})<br><span class="text-secondary">${item.remark}</span></div>`;
        const voidReason = item.voidReason || item.voidreason || '';
        const voidName = item.voidName || item.voidname || '';
        const voidEmpID = item.voidEmpID || item.voidempid || '';
        if (voidReason) detailHtml += `<div class="mb-3 border-bottom pb-2"><strong>🗑️【作廢軌跡】</strong> (👤 ${voidName} - ${voidEmpID})<br><span class="text-danger">${voidReason}</span></div>`;
        if (item.reportReason) detailHtml += `<div class="mb-3 border-bottom pb-2"><strong>⚠️【異常通報】</strong><br>狀態：<span class="badge bg-warning text-dark">${item.reportStatus}</span><br><span class="text-dark">${item.reportReason}</span></div>`;
        if (item.managerResult) detailHtml += `<div class="mb-1"><strong>🛡️【主管批示】</strong><br><span class="text-success fw-bold">${item.managerResult}</span></div>`;
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
                <td>
                    <span class="badge ${modeBadgeClass} mb-1 shadow-sm">${modeValue}</span><br>
                    <span class="badge ${flowBadgeClass} text-white shadow-sm" style="font-size: 0.75rem;">${outD} ➔ ${inD}</span>
                </td>
                <td class="font-monospace text-start">
                    <div class="fw-bold fs-6 text-dark">${sapDisplay}</div>
                    <div class="text-secondary small">院內碼: ${dCode}</div>
                </td>
                <td class="text-start">
                    <div class="${isVoided ? 'text-decoration-line-through text-muted' : 'fw-bold text-dark'}" style="font-size:0.85rem;">${dName}</div>
                </td>
                <td><span class="${qtyClass} fs-5">${rawQty}</span></td>
                <td>
                    <div class="fw-bold">${opName}</div>
                    <small class="text-muted font-monospace">${opId}</small>
                </td>
                <td>
                    <div class="mb-1">${statusBadge}</div>
                    <button class="btn btn-sm btn-info py-0 px-2 mt-1 text-white shadow-sm" style="font-size:0.7rem;" onclick="window.showTransDetailPopup('${item.id}')">展開紀錄</button>
                </td>
                <td>
                    <div class="d-flex flex-column gap-1 align-items-center">
                        <div class="btn-group btn-group-sm w-100">
                            <button class="btn btn-outline-secondary py-0 px-2" style="font-size:0.75rem;" onclick="window.editTransferItem('${item.id}', ${rawQty})" ${isVoided ? 'disabled' : ''}>✏️</button>
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
