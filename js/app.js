// ==========================================
// 1. 全域變數與 API 網址
// ==========================================
const GET_API_URL = "https://defaultf611cf53b6864814b03558908d4900.be.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/222b3b63e0244b6ea7e8f1768594ab45/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=nT2eDEqXKh7eeKPmywbAvbPE_WWLXxX98Hm93OCvCio";

window.realUserDB = []; 
window.realDrugDB = []; 
window.ctrlDrugDB = [];
window.currentUser = {};
window.currentOperator = {}; 

document.addEventListener('DOMContentLoaded', () => {
    fetchSystemData();

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
    
    const backToHubBtn = document.getElementById('backToHubBtn');
    if (backToHubBtn) backToHubBtn.addEventListener('click', backToHub);
    
    document.querySelectorAll('.academic-hub-btn').forEach(btn => {
        btn.addEventListener('click', (e) => enterSystem(e.currentTarget.dataset.target));
    });
    
    document.querySelectorAll('.academic-tabs .nav-link').forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.preventDefault();
            switchTab(e.currentTarget.dataset.tab);
        });
    });
});

// ✨ 主題色彩切換引擎
function applyTheme(station) {
    document.body.className = ''; // 清除舊主題
    if (station.includes('門診')) document.body.classList.add('theme-opd');
    else if (station.includes('急診')) document.body.classList.add('theme-er');
    else if (station.includes('住院')) document.body.classList.add('theme-ipd');
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
        // ✨ 一次平行發送三個請求，極大化載入速度
        const [userRes, drugRes, ctrlDrugRes] = await Promise.all([
            fetch(GET_API_URL + "&action=getUsers", { method: 'GET' }),
            fetch(GET_API_URL + "&action=getDrugs", { method: 'GET' }),
            fetch(GET_API_URL + "&action=getCtrlDrugs", { method: 'GET' })
        ]);

        if(!userRes.ok || !drugRes.ok || !ctrlDrugRes.ok) throw new Error("主檔 API 連線失敗");
        
        window.realUserDB = await userRes.json();
        window.realDrugDB = await drugRes.json();
        window.ctrlDrugDB = await ctrlDrugRes.json(); // ✨ 存入全域變數
        
        // 可選：只保留狀態為「啟用」的管制藥
        window.ctrlDrugDB = window.ctrlDrugDB.filter(d => d.status === '啟用');
        
        if(loginBtn) {
            loginBtn.disabled = false;
            loginBtn.innerText = "登入驗證";
        }
        console.log(`✅ 系統載入成功：藥師 ${window.realUserDB.length} 筆，一般藥品 ${window.realDrugDB.length} 筆，管制藥品 ${window.ctrlDrugDB.length} 筆`);
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
    
    // ✨ 抓取當下介面選擇的「物理工作站」並綁定在使用者身上
    const station = document.getElementById('stationSelect').value;
    localStorage.setItem('workStation', station); // 二次確認寫入記憶

    window.currentUser = {
        empId: user.empId,
        name: user.name,
        dept: user.isSmartMgmt ? "智能運管組" : "藥學部", 
        station: station, // 綁定物理機台位置
        isSpecial: isSpecial
    };
    
    // 更新介面顯示
    document.getElementById('userNameDisplay').innerText = window.currentUser.name;
    document.getElementById('userDeptDisplay').innerText = window.currentUser.dept;
    document.getElementById('userRoleBadge').innerText = isSpecial ? "管理員" : "藥師";
    document.getElementById('userStationBadge').innerText = `📍 ${station}`; // 顯示機台位置
    
    document.getElementById('headerUserInfo').classList.remove('hidden');
    document.getElementById('loginSection').classList.add('hidden');

    // 觸發 transfer.js 中的借位與單位初始化函數
    if(typeof window.initOperatorAndDept === 'function') {
        window.initOperatorAndDept();
    }

    // ✨ 新增：完美銜接！觸發管制藥專屬的跨檔案初始化函數
    if(typeof window.initCtrlDrugSection === 'function') {
        window.initCtrlDrugSection();
    }

    // 分流畫面
    if(isSpecial) {
        document.getElementById('hubUserName').innerText = window.currentUser.name;
        document.getElementById('hubSection').classList.remove('hidden');
        document.getElementById('backToHubBtn').classList.remove('hidden');
        document.getElementById('tab-receive-li').classList.remove('hidden');
        document.getElementById('tab-storage-li').classList.remove('hidden');
    } else {
        enterSystem('transfer');
    }
}

// ==========================================
// 4. 分頁與介面切換
// ==========================================
function enterSystem(tabName) {
    document.getElementById('hubSection').classList.add('hidden');
    document.getElementById('mainSection').classList.remove('hidden');
    switchTab(tabName);
}

function switchTab(tabName) {
    document.querySelectorAll('.academic-tabs .nav-link').forEach(t => t.classList.remove('active'));
    const activeTab = document.querySelector(`.academic-tabs .nav-link[data-tab="${tabName}"]`);
    if (activeTab) activeTab.classList.add('active');
    
    ['transfer', 'receive', 'storage', 'history'].forEach(t => {
        const contentDiv = document.getElementById(`content-${t}`);
        if (contentDiv) contentDiv.classList.add('hidden');
    });
    
    const targetContent = document.getElementById(`content-${tabName}`);
    if (targetContent) targetContent.classList.remove('hidden');
}

function backToHub() {
    document.getElementById('mainSection').classList.add('hidden');
    document.getElementById('hubSection').classList.remove('hidden');
}
