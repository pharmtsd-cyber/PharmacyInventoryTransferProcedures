// --- 模擬資料庫 (未來由 API 提供) ---
window.mockUserDB = [
    { empId: "F0601", name: "陳泓瑞", dept: "智能運管組", isSpecial: true },
    { empId: "F0598", name: "蔡宜均", dept: "門診藥局", isSpecial: false }
];

window.currentUser = {};
window.currentOperator = {}; // 供借位操作使用

document.addEventListener('DOMContentLoaded', () => {
    // 綁定全域事件
    document.getElementById('loginBtn').addEventListener('click', handleLogin);
    document.getElementById('logoutBtn').addEventListener('click', () => location.reload());
    document.getElementById('backToHubBtn').addEventListener('click', backToHub);
    
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
    const empId = document.getElementById('empIdInput').value.trim().toUpperCase();
    const user = window.mockUserDB.find(u => u.empId === empId);
    
    if(!user) { alert("找不到此員工編號，請重新輸入"); return; }

    window.currentUser = user;
    
    // 初始化 UI
    document.getElementById('userNameDisplay').innerText = user.name;
    document.getElementById('userDeptDisplay').innerText = user.dept;
    document.getElementById('userRoleBadge').innerText = user.isSpecial ? "管理員" : "藥師";
    document.getElementById('headerUserInfo').classList.remove('hidden');
    document.getElementById('loginSection').classList.add('hidden');

    // 觸發 transfer.js 中的借位與單位初始化函數
    if(typeof window.initOperatorAndDept === 'function') {
        window.initOperatorAndDept();
    }

    if(user.isSpecial) {
        document.getElementById('hubUserName').innerText = user.name;
        document.getElementById('hubSection').classList.remove('hidden');
        document.getElementById('backToHubBtn').classList.remove('hidden');
        document.getElementById('tab-receive-li').classList.remove('hidden');
        document.getElementById('tab-storage-li').classList.remove('hidden');
    } else {
        enterSystem('transfer');
    }
}

function enterSystem(tabName) {
    document.getElementById('hubSection').classList.add('hidden');
    document.getElementById('mainSection').classList.remove('hidden');
    switchTab(tabName);
}

function switchTab(tabName) {
    // 樣式切換
    document.querySelectorAll('.academic-tabs .nav-link').forEach(t => t.classList.remove('active'));
    document.querySelector(`.academic-tabs .nav-link[data-tab="${tabName}"]`).classList.add('active');
    
    // 內容切換
    ['transfer', 'receive', 'storage', 'history'].forEach(t => {
        document.getElementById(`content-${t}`).classList.add('hidden');
    });
    document.getElementById(`content-${tabName}`).classList.remove('hidden');
}

function backToHub() {
    document.getElementById('mainSection').classList.add('hidden');
    document.getElementById('hubSection').classList.remove('hidden');
}
