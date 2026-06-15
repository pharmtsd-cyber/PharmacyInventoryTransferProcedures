// ==========================================
// 1. 全域變數與 API 網址
// ==========================================
const GET_API_URL = "https://defaultf611cf53b6864814b03558908d4900.be.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/222b3b63e0244b6ea7e8f1768594ab45/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=nT2eDEqXKh7eeKPmywbAvbPE_WWLXxX98Hm93OCvCio";

window.realUserDB = []; 
window.realDrugDB = []; 
window.ctrlDrugDB = [];
window.sysParamsDB = [];
window.currentUser = {};
window.currentOperator = {}; 
window.workMode = 'personal';

// ✨ 新增：系統鎖定狀態全域變數 (預設首班交接前鎖定)
window.ctrlSystemStatus = window.ctrlSystemStatus || 'LOCKED_PRE'; 

document.addEventListener('DOMContentLoaded', () => {
    fetchSystemData();

    // ✨ 綁定側邊欄收合按鈕
    const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
    const sidebarMenu = document.getElementById('sidebarMenu');
    if (sidebarToggleBtn && sidebarMenu) {
        sidebarToggleBtn.addEventListener('click', () => {
            sidebarMenu.classList.toggle('sidebar-collapsed');
        });
    }

    // ✨ 網頁載入時，自動讀取上次記憶的工作站單位，並套用對應主題
    const savedStation = localStorage.getItem('workStation') || '門診藥局';
    const stationSelect = document.getElementById('stationSelect');
    if (stationSelect) {
        stationSelect.value = savedStation;
        applyTheme(savedStation);
        
        // 當下拉選單改變時，立刻存入硬碟記憶並變色
        stationSelect.addEventListener('change', (e) => {
            localStorage.setItem('workStation', e.target.value);
            applyTheme(e.target.value);
        });
    }

    // ✨ 監聽：公用/個人 工作模式切換
    const modeSwitch = document.getElementById('workModeSwitch');
    if (modeSwitch) {
        modeSwitch.addEventListener('change', (e) => {
            window.workMode = e.target.checked ? 'public' : 'personal';
            document.body.classList.toggle('mode-public', e.target.checked);
            document.getElementById('workModeLabel').innerText = e.target.checked ? '🌍 公用機台模式' : '🔒 個人鎖定模式';
            
            // 通知各模組因應模式改變游標與狀態
            if(typeof window.applyTransWorkModeChange === 'function') window.applyTransWorkModeChange(); 
            if(typeof window.applyCtrlWorkModeChange === 'function') window.applyCtrlWorkModeChange();  
            if(typeof window.applyCtrlRetWorkModeChange === 'function') window.applyCtrlRetWorkModeChange(); 
        });
    }    
    
    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) loginBtn.addEventListener('click', handleLogin);
    
    const empIdInput = document.getElementById('empIdInput');
    if (empIdInput) {
        empIdInput.addEventListener('keypress', (e) => {
            if(e.key === 'Enter') handleLogin();
        });
    }
    
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', () => location.reload());
    
    // ✨ 修正：改為綁定新的左側選單 (#mainTabs)
    document.querySelectorAll('#mainTabs .nav-link').forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.preventDefault();
            switchTab(e.currentTarget.dataset.tab);
        });
    });
});

// ✨ 主題色彩切換引擎
function applyTheme(station) {
    document.body.className = ''; 
    if (station.includes('門診')) document.body.classList.add('theme-opd');
    else if (station.includes('急診')) document.body.classList.add('theme-er');
    else if (station.includes('住院')) document.body.classList.add('theme-ipd');
    else if (station.includes('調配')) document.body.classList.add('theme-prep'); 
    else document.body.classList.add('theme-store');
}

// ==========================================
// 2. 系統初始化 (平行載入三大主檔)
// ==========================================
async function fetchSystemData() {
    const loginBtn = document.getElementById('loginBtn');
    if(loginBtn) {
        loginBtn.disabled = true;
        loginBtn.innerText = "載入系統主檔中，請稍候...";
    }

    try {
        const [userRes, drugRes, ctrlDrugRes, sysParamsRes] = await Promise.all([
            fetch(GET_API_URL + "&action=getUsers", { method: 'GET' }),
            fetch(GET_API_URL + "&action=getDrugs", { method: 'GET' }),
            fetch(GET_API_URL + "&action=getCtrlDrugs", { method: 'GET' }),
            fetch(GET_API_URL + "&action=getSysParams", { method: 'GET' }) 
        ]);

        if(!userRes.ok || !drugRes.ok || !ctrlDrugRes.ok || !sysParamsRes.ok) throw new Error("主檔 API 連線失敗");
        
        window.realUserDB = await userRes.json();
        window.realDrugDB = await drugRes.json();
        window.ctrlDrugDB = await ctrlDrugRes.json(); 
        window.sysParamsDB = await sysParamsRes.json(); 
        
        window.sysParamsDB.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
        window.ctrlDrugDB = window.ctrlDrugDB.filter(d => d.status === '啟用');
        
        if(loginBtn) {
            loginBtn.disabled = false;
            loginBtn.innerText = "登入驗證";
        }
    } catch (error) {
        alert("系統資料載入失敗，請檢查網路或 GET API 設定！");
        console.error(error);
        if(loginBtn) loginBtn.innerText = "載入失敗";
    }
}

// ==========================================
// 3. 真實登入與權限驗證邏輯
// ==========================================
function handleLogin() {
    const empIdInput = document.getElementById('empIdInput');
    if (!empIdInput) return;
    
    const empId = empIdInput.value.trim().toUpperCase();
    if (!empId) { alert("請輸入員工編號"); return; }

    const user = window.realUserDB.find(u => u.empId === empId);
    
    if(!user) { 
        alert("❌ 找不到此員工編號，請重新輸入"); 
        empIdInput.value = '';
        return; 
    }

    const isSpecial = (user.isSupervisor === true || user.isSmartMgmt === true);
    
    const station = document.getElementById('stationSelect').value;
    localStorage.setItem('workStation', station); 

    window.currentUser = {
        empId: user.empId,
        name: user.name,
        dept: user.isSmartMgmt ? "智能運管組" : "藥學部", 
        station: station, 
        isSpecial: isSpecial
    };
    
    document.getElementById('userNameDisplay').innerText = window.currentUser.name;
    document.getElementById('userDeptDisplay').innerText = window.currentUser.dept;
    document.getElementById('userRoleBadge').innerText = isSpecial ? "管理員" : "藥師";
    document.getElementById('userStationBadge').innerText = `📍 ${station}`; 
    
    document.getElementById('headerUserInfo').classList.remove('hidden');
    document.getElementById('loginSection').classList.add('hidden');

    if(typeof window.initOperatorAndDept === 'function') window.initOperatorAndDept();
    if(typeof window.initCtrlDrugSection === 'function') window.initCtrlDrugSection();
    if(typeof window.initCtrlReturnSection === 'function') window.initCtrlReturnSection();
    if(typeof window.initCtrlHandoverSection === 'function') window.initCtrlHandoverSection();

    // ==========================================
    // ✨ 全新畫面分流：一律直接進入系統工作區，並開啟滿版模式
    // ==========================================
    if (isSpecial) {
        const receiveTab = document.getElementById('tab-receive-li');
        const storageTab = document.getElementById('tab-storage-li');
        if (receiveTab) receiveTab.classList.remove('hidden');
        if (storageTab) storageTab.classList.remove('hidden');
    }

    const wrapper = document.querySelector('.wrapper-container');
    if (wrapper) {
        wrapper.classList.remove('pt-4');
        wrapper.classList.add('p-0'); 
    }
    
    const toggleBtn = document.getElementById('sidebarToggleBtn');
    if (toggleBtn) toggleBtn.classList.remove('hidden');

    enterSystem('transfer');
}

// ==========================================
// 4. 分頁與介面切換 (含智慧游標預設與鎖定阻擋)
// ==========================================
function enterSystem(tabName) {
    document.getElementById('mainSection').classList.remove('hidden');
    switchTab(tabName);
}

window.switchTab = function(tabName) {
    document.querySelectorAll('#mainTabs .nav-link').forEach(t => t.classList.remove('active'));
    const activeTab = document.querySelector(`#mainTabs .nav-link[data-tab="${tabName}"]`);
    if (activeTab) activeTab.classList.add('active');
    
    ['transfer', 'ctrl-handover', 'ctrl-handover-history', 'ctrl-drug', 'ctrl-return', 'ctrl-history', 'receive', 'storage', 'history', 'transfer-history'].forEach(t => {
        const contentDiv = document.getElementById(`content-${t}`);
        if (contentDiv) contentDiv.classList.add('hidden');
    });
    
    const targetContent = document.getElementById(`content-${tabName}`);
    if (targetContent) targetContent.classList.remove('hidden');

    if (tabName === 'ctrl-drug' || tabName === 'ctrl-return') {
        const lock1 = document.getElementById('ctrlSystemLockOverlay1');
        const lock2 = document.getElementById('ctrlSystemLockOverlay2');
        const msg1 = document.getElementById('ctrlLockMessage1');
        const msg2 = document.getElementById('ctrlLockMessage2');

        if (window.ctrlSystemStatus === 'LOCKED_PRE') {
            if(lock1) lock1.classList.remove('hidden');
            if(lock2) lock2.classList.remove('hidden');
            const text = "⚠️ 今日尚未完成「首班」交接，請先進行開班點交。";
            if(msg1) msg1.innerText = text; if(msg2) msg2.innerText = text;
        } else if (window.ctrlSystemStatus === 'LOCKED_POST') {
            if(lock1) lock1.classList.remove('hidden');
            if(lock2) lock2.classList.remove('hidden');
            const text = "⛔ 今日「尾班」交接已完成，帳目已結算，禁止執行任何管藥異動。";
            if(msg1) msg1.innerText = text; if(msg2) msg2.innerText = text;
        } else {
            if(lock1) lock1.classList.add('hidden');
            if(lock2) lock2.classList.add('hidden');
        }
    }

    setTimeout(() => {
        if (tabName === 'transfer') {
            const modeBarcode = document.getElementById('modeBarcode');
            if (modeBarcode) modeBarcode.checked = true;
            if (typeof toggleInputMode === 'function') toggleInputMode(); 
            if (window.workMode === 'public' && typeof setOperator === 'function') setOperator('', '');
            if (typeof focusCorrectInput === 'function') focusCorrectInput();
            
        } else if (tabName === 'ctrl-drug') {
            const ctrlModeBarcode = document.getElementById('ctrlModeBarcode');
            if (ctrlModeBarcode) ctrlModeBarcode.checked = true;
            if (typeof toggleCtrlInputMode === 'function') toggleCtrlInputMode();
            if (window.workMode === 'public' && typeof setCtrlOperator === 'function') setCtrlOperator('', '');
            if (typeof focusCorrectCtrlInput === 'function') focusCorrectCtrlInput();
            
        } else if (tabName === 'ctrl-return') {
            const ctrlRetModeBarcode = document.getElementById('ctrlRetModeBarcode');
            if (ctrlRetModeBarcode) ctrlRetModeBarcode.checked = true;
            if (typeof toggleCtrlRetMode === 'function') toggleCtrlRetMode();
            if (window.workMode === 'public' && typeof setCtrlRetOperator === 'function') setCtrlRetOperator('', '');
            if (typeof focusCorrectCtrlRetInput === 'function') focusCorrectCtrlRetInput();
            
        } else if (tabName === 'ctrl-handover') {
            const empOutput = document.getElementById('handoverEmpOutput');
            if (empOutput && window.currentUser) empOutput.value = `${window.currentUser.name} (${window.currentUser.empId})`;
        }
    }, 50);
};
