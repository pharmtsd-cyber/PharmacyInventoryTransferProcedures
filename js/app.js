// ==========================================
// 1. 全域變數與 API 網址
// ==========================================
// 👉 請將下方引號內的網址替換為你剛才建立的「讀取藥師名冊 API」網址
const GET_API_URL = "https://defaultf611cf53b6864814b03558908d4900.be.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/222b3b63e0244b6ea7e8f1768594ab45/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=nT2eDEqXKh7eeKPmywbAvbPE_WWLXxX98Hm93OCvCio";

window.realUserDB = []; 
window.realDrugDB = []; 
window.currentUser = {};
window.currentOperator = {}; 

document.addEventListener('DOMContentLoaded', () => {
    // 網頁載入時，透過不同的 action 參數平行抓取藥師與藥品主檔
    fetchSystemData();

    // 綁定全域事件 (登入、登出等邏輯維持不變)
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

// ==========================================
// 2. 系統初始化 (利用單一網址 + 不同 action 參數平行載入)
// ==========================================
async function fetchSystemData() {
    const loginBtn = document.getElementById('loginBtn');
    if(loginBtn) {
        loginBtn.disabled = true;
        loginBtn.innerText = "載入系統主檔中，請稍候...";
    }

    try {
        // ✨ 用同一個 GET_API_URL 網址，後面利用 &action= 分流
        const [userRes, drugRes] = await Promise.all([
            fetch(GET_API_URL + "&action=getUsers", { method: 'GET' }),
            fetch(GET_API_URL + "&action=getDrugs", { method: 'GET' })
        ]);

        if(!userRes.ok || !drugRes.ok) throw new Error("主檔 API 連線失敗");
        
        window.realUserDB = await userRes.json();
        window.realDrugDB = await drugRes.json();
        
        if(loginBtn) {
            loginBtn.disabled = false;
            loginBtn.innerText = "登入驗證";
        }
        console.log(`✅ 萬能 GET API 載入成功：藥師名冊 ${window.realUserDB.length} 筆，藥品主檔 ${window.realDrugDB.length} 筆`);
    } catch (error) {
        alert("系統資料載入失敗，請檢查網路或萬能 GET API 設定！");
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

    // 在真實的資料庫中尋找該員編
    const user = window.realUserDB.find(u => u.empId === empId);
    
    if(!user) { 
        alert("❌ 找不到此員工編號，請重新輸入"); 
        empIdInput.value = '';
        return; 
    }

    // 透過 API 回傳的布林值，直接精準判斷是否擁有特殊權限
    const isSpecial = (user.isSupervisor === true || user.isSmartMgmt === true);

    window.currentUser = {
        empId: user.empId,
        name: user.name,
        // 因為 API 沒傳 dept，這裡直接給定一個預設字串，或依需求留空
        dept: user.isSmartMgmt ? "智能運管組" : "藥學部", 
        isSpecial: isSpecial
    };
    
    // 更新介面顯示
    document.getElementById('userNameDisplay').innerText = window.currentUser.name;
    document.getElementById('userDeptDisplay').innerText = window.currentUser.dept;
    document.getElementById('userRoleBadge').innerText = isSpecial ? "管理員" : "藥師";
    document.getElementById('headerUserInfo').classList.remove('hidden');
    document.getElementById('loginSection').classList.add('hidden');

    // 觸發 transfer.js 中的借位與單位初始化函數
    if(typeof window.initOperatorAndDept === 'function') {
        window.initOperatorAndDept();
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
