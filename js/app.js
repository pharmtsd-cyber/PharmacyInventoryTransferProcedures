// --- 模擬資料庫 (未來由 API 提供) ---
window.mockUserDB = [
    { empId: "F0601", name: "陳泓瑞", dept: "智能運管組", isSpecial: true },
    { empId: "F0598", name: "蔡宜均", dept: "門診藥局", isSpecial: false }
];

window.currentUser = {};
window.currentOperator = {}; // 供借位操作使用

document.addEventListener('DOMContentLoaded', () => {
    // 綁定全域事件 (加入防呆檢查，確保元素存在才綁定)
    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) loginBtn.addEventListener('click', handleLogin);
    
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) logoutBtn.addEventListener('click', () => location.reload());
    
    const backToHubBtn = document.getElementById('backToHubBtn');
    if (backToHubBtn) backToHubBtn.addEventListener('click', backToHub);
    
    // 綁定 Hub 與頁籤切換
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

function handleLogin() {
    const empIdInput = document.getElementById('empIdInput');
    if (!empIdInput) return;
    
    const empId = empIdInput.value.trim().toUpperCase();
    const user = window.mockUserDB.find(u => u.empId === empId);
    
    if(!user) { 
        alert("找不到此員工編號，請重新輸入"); 
        return; 
    }

    window.currentUser = user;
    
    // 初始化 UI (加入防呆檢查)
    const userNameDisplay = document.getElementById('userNameDisplay');
    if (userNameDisplay) userNameDisplay.innerText = user.name;
    
    const userDeptDisplay = document.getElementById('userDeptDisplay');
    if (userDeptDisplay) userDeptDisplay.innerText = user.dept;
    
    const userRoleBadge = document.getElementById('userRoleBadge');
    if (userRoleBadge) userRoleBadge.innerText = user.isSpecial ? "管理員" : "藥師";
    
    const headerUserInfo = document.getElementById('headerUserInfo');
    if (headerUserInfo) headerUserInfo.classList.remove('hidden');
    
    const loginSection = document.getElementById('loginSection');
    if (loginSection) loginSection.classList.add('hidden');

    // 觸發 transfer.js 中的借位與單位初始化函數
    if(typeof window.initOperatorAndDept === 'function') {
        window.initOperatorAndDept();
    }

    // 權限分流判斷
    if(user.isSpecial) {
        const hubUserName = document.getElementById('hubUserName');
        if (hubUserName) hubUserName.innerText = user.name;
        
        const hubSection = document.getElementById('hubSection');
        if (hubSection) hubSection.classList.remove('hidden');
        
        const backToHubBtn = document.getElementById('backToHubBtn');
        if (backToHubBtn) backToHubBtn.classList.remove('hidden');
        
        const tabReceiveLi = document.getElementById('tab-receive-li');
        if (tabReceiveLi) tabReceiveLi.classList.remove('hidden');
        
        const tabStorageLi = document.getElementById('tab-storage-li');
        if (tabStorageLi) tabStorageLi.classList.remove('hidden');
    } else {
        enterSystem('transfer');
    }
}

function enterSystem(tabName) {
    const hubSection = document.getElementById('hubSection');
    if (hubSection) hubSection.classList.add('hidden');
    
    const mainSection = document.getElementById('mainSection');
    if (mainSection) mainSection.classList.remove('hidden');
    
    switchTab(tabName);
}

function switchTab(tabName) {
    // 樣式切換
    document.querySelectorAll('.academic-tabs .nav-link').forEach(t => t.classList.remove('active'));
    const activeTab = document.querySelector(`.academic-tabs .nav-link[data-tab="${tabName}"]`);
    if (activeTab) activeTab.classList.add('active');
    
    // 內容切換
    ['transfer', 'receive', 'storage', 'history'].forEach(t => {
        const contentDiv = document.getElementById(`content-${t}`);
        if (contentDiv) contentDiv.classList.add('hidden');
    });
    
    const targetContent = document.getElementById(`content-${tabName}`);
    if (targetContent) targetContent.classList.remove('hidden');
}

function backToHub() {
    const mainSection = document.getElementById('mainSection');
    if (mainSection) mainSection.classList.add('hidden');
    
    const hubSection = document.getElementById('hubSection');
    if (hubSection) hubSection.classList.remove('hidden');
}
