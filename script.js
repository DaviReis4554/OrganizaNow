// Importações do Firebase SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-auth.js";

// Configuração do Firebase
import { getFirestore, doc, onSnapshot, setDoc } from "https://www.gstatic.com/firebasejs/13.2.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyC_SoKuf074CM_rSlps7mkKNSQprdohGtA",
    authDomain: "organiza-now.firebaseapp.com",
    projectId: "organiza-now",
    storageBucket: "organiza-now.firebasestorage.app",
    messagingSenderId: "464056147054",
    appId: "1:464056147054:web:237e8b4272706b06d05a7f",
    measurementId: "G-CM8C9Y99DN"
};

// Inicializa Firebase e Auth
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Sincronização em nuvem (Firestore)
let unsubscribeData = null;

function emptyState() {
    return { tasks: [], studies: [], exams: [], collegeDays: [], events: [], bills: [], cards: [], purchases: [] };
}

function normalizeState(s) {
    return { ...emptyState(), ...(s || {}) };
}

function cacheKey() {
    return `organizananow_data_${currentUser.uid}`;
}

function pushToCloud() {
    if (!currentUser) return;
    // O estado vai como texto JSON: evita erros do Firestore com valores undefined/arrays aninhados
    setDoc(doc(db, 'users', currentUser.uid), {
        data: JSON.stringify(state),
        updatedAt: Date.now()
    }).catch(err => console.error('Erro ao salvar na nuvem:', err));
}

function startCloudSync() {
    stopCloudSync();
    const ref = doc(db, 'users', currentUser.uid);
    unsubscribeData = onSnapshot(ref, (snap) => {
        // Ignora o "eco" das minhas próprias escritas ainda pendentes
        if (snap.metadata.hasPendingWrites) return;

        if (snap.exists() && snap.data().data) {
            const remote = normalizeState(JSON.parse(snap.data().data));
            if (JSON.stringify(remote) !== JSON.stringify(state)) {
                state = remote;
                localStorage.setItem(cacheKey(), JSON.stringify(state));
                renderAll();
            }
        } else if (!snap.metadata.fromCache) {
            // Primeiro acesso com a nuvem vazia: sobe o que já existe neste aparelho
            pushToCloud();
        }
    }, (err) => {
        console.error('Erro ao sincronizar com a nuvem:', err);
    });
}

function stopCloudSync() {
    if (unsubscribeData) {
        unsubscribeData();
        unsubscribeData = null;
    }
}

let currentUser = null;
let state = { tasks: [], studies: [], exams: [], collegeDays: [], events: [], bills: [], cards: [], purchases: [] };
let selectedTaskDate = new Date().toISOString().split('T')[0];
let selectedPurchaseDate = new Date().toISOString().split('T')[0];

document.addEventListener('DOMContentLoaded', () => {
    // Observa o estado de autenticação do Firebase em tempo real
    onAuthStateChanged(auth, (user) => {
        if (user) {
            loadUserSession(user);
        } else {
            stopCloudSync();
            currentUser = null;
            document.getElementById('app-screen').style.display = 'none';
            document.getElementById('auth-screen').style.display = 'flex';
        }
    });

    initAuthListeners();
    initThemeToggle();
    
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const todayStr = new Date().toLocaleDateString('pt-BR', options);
    document.getElementById('current-date').textContent = todayStr.charAt(0).toUpperCase() + todayStr.slice(1);
    
    document.getElementById('task-filter-date').value = selectedTaskDate;
    document.getElementById('purchase-filter-date').value = selectedPurchaseDate;
    document.getElementById('purchase-date').value = selectedPurchaseDate;

    initNavigation();
    initForms();
    handleCategoryChange();
});

function loadUserSession(firebaseUser) {
    currentUser = {
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        name: firebaseUser.displayName || firebaseUser.email.split('@')[0]
    };

    // Mostra rápido o cache local deste aparelho; logo em seguida a nuvem assume
    const savedData = localStorage.getItem(cacheKey());
    state = savedData ? normalizeState(JSON.parse(savedData)) : emptyState();

    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('app-screen').style.display = 'flex';
    document.getElementById('welcome-user').textContent = `Olá, ${currentUser.name}! Vamos organizar o dia? 💜`;

    renderAll();
    startCloudSync();
}

window.switchAuthTab = function(tab) {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const loginBtn = document.getElementById('tab-login-btn');
    const registerBtn = document.getElementById('tab-register-btn');
    const msg = document.getElementById('auth-msg');
    if (msg) msg.textContent = '';

    if (tab === 'login') {
        loginForm.style.display = 'flex';
        registerForm.style.display = 'none';
        loginBtn.classList.add('active');
        registerBtn.classList.remove('active');
    } else {
        loginForm.style.display = 'none';
        registerForm.style.display = 'flex';
        registerBtn.classList.add('active');
        loginBtn.classList.remove('active');
    }
}

function initAuthListeners() {
    // CADASTRO NO FIREBASE
    document.getElementById('register-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('register-name').value.trim();
        const email = document.getElementById('register-email').value.trim();
        const password = document.getElementById('register-password').value;
        const msg = document.getElementById('auth-msg');

        try {
            msg.style.color = 'var(--text-muted)';
            msg.textContent = 'Criando conta no Firebase...';
            
            const cred = await createUserWithEmailAndPassword(auth, email, password);
            // Salva o nome no perfil do Firebase
            if (name) {
                await updateProfile(cred.user, { displayName: name });
                // onAuthStateChanged já disparou antes do nome ser salvo; atualiza o painel
                if (currentUser) {
                    currentUser.name = name;
                    document.getElementById('welcome-user').textContent = `Olá, ${name}! Vamos organizar o dia? 💜`;
                }
            }
            
            msg.style.color = '#10b981';
            msg.textContent = 'Conta criada com sucesso!';
        } catch (error) {
            console.error("Erro detalhado do Firebase:", error);
            msg.style.color = '#ef4444';
            
            if (error.code === 'auth/operation-not-allowed') {
                msg.textContent = 'Erro: O provedor de E-mail/Senha não está ativado no painel do Firebase.';
            } else if (error.code === 'auth/email-already-in-use') {
                msg.textContent = 'Este e-mail já está cadastrado!';
            } else if (error.code === 'auth/weak-password') {
                msg.textContent = 'A senha precisa ter pelo menos 6 caracteres.';
            } else {
                msg.textContent = 'Erro ao cadastrar: ' + error.message;
            }
        }
    });

    // LOGIN NO FIREBASE
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;
        const msg = document.getElementById('auth-msg');

        try {
            msg.style.color = 'var(--text-muted)';
            msg.textContent = 'Entrando...';

            await signInWithEmailAndPassword(auth, email, password);
        } catch (error) {
            msg.style.color = '#ef4444';
            if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
                msg.textContent = 'E-mail ou senha incorretos!';
            } else {
                msg.textContent = 'Erro ao entrar: ' + error.message;
            }
        }
    });
}

// LOGOUT NO FIREBASE
window.logout = async function() {
    try {
        stopCloudSync();
        await signOut(auth);
        currentUser = null;
        document.getElementById('app-screen').style.display = 'none';
        document.getElementById('auth-screen').style.display = 'flex';
        document.getElementById('login-email').value = '';
        document.getElementById('login-password').value = '';
        document.getElementById('auth-msg').textContent = '';
    } catch (error) {
        console.error('Erro ao sair:', error);
    }
}

function saveState() {
    if (!currentUser) return;
    localStorage.setItem(cacheKey(), JSON.stringify(state));
    pushToCloud();
    updateDashboard();
}

function initNavigation() {
    const navBtns = document.querySelectorAll('.nav-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');

    navBtns.forEach(btn => {
        btn.replaceWith(btn.cloneNode(true));
    });

    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const targetTab = btn.getAttribute('data-tab');
            if (!targetTab) return;

            document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));

            btn.classList.add('active');
            const targetPane = document.getElementById(targetTab);
            if (targetPane) {
                targetPane.classList.add('active');
            }
        });
    });
}

function initThemeToggle() {
    const themeBtn = document.getElementById('theme-toggle');
    const html = document.documentElement;
    
    const savedTheme = localStorage.getItem('organizananow_theme') || 'dark';
    html.setAttribute('data-theme', savedTheme);
    updateThemeButtonText(savedTheme);

    themeBtn.addEventListener('click', () => {
        const currentTheme = html.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        html.setAttribute('data-theme', newTheme);
        localStorage.setItem('organizananow_theme', newTheme);
        updateThemeButtonText(newTheme);
    });
}

function updateThemeButtonText(theme) {
    const themeBtn = document.getElementById('theme-toggle');
    if (theme === 'dark') {
        themeBtn.innerHTML = `<i class="fa-solid fa-sun"></i> <span>Modo Claro</span>`;
    } else {
        themeBtn.innerHTML = `<i class="fa-solid fa-moon"></i> <span>Modo Escuro</span>`;
    }
}

window.handleCategoryChange = function() {
    const category = document.getElementById('bill-category').value;
    const nameInput = document.getElementById('bill-name-input');
    const nameSelect = document.getElementById('bill-name-select');

    if (category === 'Streaming') {
        nameInput.style.display = 'none';
        nameInput.removeAttribute('required');
        nameSelect.style.display = 'block';
        nameSelect.setAttribute('required', 'true');
    } else {
        nameSelect.style.display = 'none';
        nameSelect.removeAttribute('required');
        nameInput.style.display = 'block';
        nameInput.setAttribute('required', 'true');
        
        if (category === 'Saude') nameInput.placeholder = 'Ex: Plano de Saúde, Farmácia...';
        else if (category === 'Contas') nameInput.placeholder = 'Ex: Luz, Água, Internet...';
        else if (category === 'Boletos') nameInput.placeholder = 'Ex: Seguro, Escola...';
        else if (category === 'Parcelas') nameInput.placeholder = 'Ex: Celular (3/10)...';
    }
}

window.toggleCardForm = function() {
    const cardForm = document.getElementById('card-form');
    if (cardForm.style.display === 'none') {
        cardForm.style.display = 'grid';
        cardForm.scrollIntoView({ behavior: 'smooth' });
    } else {
        cardForm.style.display = 'none';
    }
}

window.toggleStudyForm = function(type) {
    const studyForm = document.getElementById('study-form');
    const examForm = document.getElementById('exam-form');
    const collegeForm = document.getElementById('college-form');

    studyForm.style.display = 'none';
    examForm.style.display = 'none';
    collegeForm.style.display = 'none';

    if (type === 'study') {
        document.getElementById('study-edit-id').value = '';
        document.getElementById('study-topic').value = '';
        document.getElementById('study-date').value = '';
        document.getElementById('study-status').value = 'Pendente';
        document.getElementById('study-submit-btn').innerHTML = `<i class="fa-solid fa-plus"></i> Salvar Estudo`;
        studyForm.style.display = 'grid';
        studyForm.scrollIntoView({ behavior: 'smooth' });
    } else if (type === 'exam') {
        examForm.style.display = 'grid';
        examForm.scrollIntoView({ behavior: 'smooth' });
    } else if (type === 'college') {
        collegeForm.style.display = 'grid';
        collegeForm.scrollIntoView({ behavior: 'smooth' });
    }
}

window.onTaskDateChanged = function() {
    selectedTaskDate = document.getElementById('task-filter-date').value;
    renderTasks();
}

window.setTaskDateToday = function() {
    selectedTaskDate = new Date().toISOString().split('T')[0];
    document.getElementById('task-filter-date').value = selectedTaskDate;
    renderTasks();
}

window.onPurchaseDateChanged = function() {
    selectedPurchaseDate = document.getElementById('purchase-filter-date').value;
    renderIsolatedPurchases();
}

window.setPurchaseDateToday = function() {
    selectedPurchaseDate = new Date().toISOString().split('T')[0];
    document.getElementById('purchase-filter-date').value = selectedPurchaseDate;
    renderIsolatedPurchases();
}

function initForms() {
    document.getElementById('task-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const title = document.getElementById('task-title').value;
        const category = document.getElementById('task-category').value;
        const priority = document.getElementById('task-priority').value;

        state.tasks.push({ 
            id: Date.now(), 
            title, 
            category, 
            priority, 
            date: selectedTaskDate, 
            completed: false 
        });

        document.getElementById('task-title').value = '';
        saveState();
        renderTasks();
    });

    document.querySelectorAll('.filter-chip').forEach(chip => {
        chip.addEventListener('click', (e) => {
            document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
            e.target.classList.add('active');
            renderTasks(e.target.getAttribute('data-filter'));
        });
    });

    document.getElementById('study-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const editId = document.getElementById('study-edit-id').value;
        const topic = document.getElementById('study-topic').value;
        const date = document.getElementById('study-date').value;
        const status = document.getElementById('study-status').value;

        if (editId) {
            const study = state.studies.find(s => s.id === parseInt(editId));
            if (study) {
                study.topic = topic;
                study.date = date;
                study.status = status;
            }
        } else {
            state.studies.push({ id: Date.now(), topic, date, status });
        }

        document.getElementById('study-edit-id').value = '';
        document.getElementById('study-topic').value = '';
        document.getElementById('study-date').value = '';
        document.getElementById('study-status').value = 'Pendente';
        document.getElementById('study-submit-btn').innerHTML = `<i class="fa-solid fa-plus"></i> Salvar Estudo`;
        document.getElementById('study-form').style.display = 'none';

        saveState();
        renderStudies();
    });

    document.getElementById('exam-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const title = document.getElementById('exam-title').value;
        const date = document.getElementById('exam-date').value;

        state.exams.push({ id: Date.now(), title, date });
        document.getElementById('exam-title').value = '';
        document.getElementById('exam-date').value = '';
        document.getElementById('exam-form').style.display = 'none';
        saveState();
        renderExams();
    });

    document.getElementById('college-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const day = document.getElementById('college-day').value;
        const subjects = document.getElementById('college-subjects').value;
        const jaleco = document.getElementById('college-jaleco').checked;

        state.collegeDays.push({ id: Date.now(), day, subjects, jaleco });
        document.getElementById('college-day').selectedIndex = 0;
        document.getElementById('college-subjects').value = '';
        document.getElementById('college-jaleco').checked = false;
        document.getElementById('college-form').style.display = 'none';
        saveState();
        renderCollegeDays();
    });

    document.getElementById('event-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const title = document.getElementById('event-title').value;
        const date = document.getElementById('event-date').value;
        const time = document.getElementById('event-time').value;

        state.events.push({ id: Date.now(), title, date, time });
        document.getElementById('event-title').value = '';
        document.getElementById('event-date').value = '';
        document.getElementById('event-time').value = '';

        saveState();
        renderEvents();
    });

    document.getElementById('bill-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const category = document.getElementById('bill-category').value;
        const name = category === 'Streaming' 
            ? document.getElementById('bill-name-select').value 
            : document.getElementById('bill-name-input').value;
            
        const value = parseFloat(document.getElementById('bill-value').value);
        const duedate = document.getElementById('bill-duedate').value;
        const cardId = document.getElementById('bill-card-id').value;

        const newBill = { 
            id: Date.now(), 
            category, 
            name, 
            value, 
            duedate, 
            cardId: cardId ? parseInt(cardId) : null, 
            paid: false 
        };

        state.bills.push(newBill);
        
        if (category !== 'Streaming') document.getElementById('bill-name-input').value = '';
        document.getElementById('bill-value').value = '';
        document.getElementById('bill-duedate').value = '';
        document.getElementById('bill-card-id').value = '';
        
        saveState();
        renderAll();
    });

    document.getElementById('card-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const editId = document.getElementById('card-edit-id').value;
        const name = document.getElementById('card-name').value.trim();
        const digits = document.getElementById('card-digits').value.trim();
        const closing = parseInt(document.getElementById('card-closing').value);
        const due = parseInt(document.getElementById('card-due').value);

        if (editId) {
            const card = state.cards.find(c => c.id === parseInt(editId));
            if (card) {
                card.name = name;
                card.digits = digits;
                card.closing = closing;
                card.due = due;
            }
            document.getElementById('card-edit-id').value = '';
            document.getElementById('card-submit-btn').innerHTML = `<i class="fa-solid fa-plus"></i> Novo Cartão`;
        } else {
            state.cards.push({ id: Date.now(), name, digits, closing, due });
        }

        document.getElementById('card-name').value = '';
        document.getElementById('card-digits').value = '';
        document.getElementById('card-closing').value = '';
        document.getElementById('card-due').value = '';
        document.getElementById('card-form').style.display = 'none';

        saveState();
        renderAll();
    });

    document.getElementById('purchase-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const paymentMethod = document.getElementById('purchase-payment-method').value;
        const title = document.getElementById('purchase-title').value.trim();
        const category = document.getElementById('purchase-category').value;
        const value = parseFloat(document.getElementById('purchase-value').value);
        const date = document.getElementById('purchase-date').value;

        let cardId = null;
        if (paymentMethod.startsWith('card_')) {
            cardId = parseInt(paymentMethod.split('_')[1]);
        }

        state.purchases.push({ 
            id: Date.now(), 
            paymentMethod, 
            cardId, 
            title, 
            category, 
            value, 
            date 
        });

        document.getElementById('purchase-title').value = '';
        document.getElementById('purchase-category').selectedIndex = 0;
        document.getElementById('purchase-value').value = '';
        document.getElementById('purchase-date').value = selectedPurchaseDate;

        saveState();
        renderAll();
    });
}

function renderAll() {
    renderTasks();
    renderStudies();
    renderExams();
    renderCollegeDays();
    renderEvents();
    renderBills();
    renderCards();
    renderIsolatedPurchases();
    updatePaymentMethodOptions();
    updateCardSelectOptions();
    updateDashboard();
}

function renderTasks(filter = 'all') {
    const container = document.getElementById('tasks-list');
    container.innerHTML = '';
    
    const tasksForDate = state.tasks.filter(t => (!t.date && selectedTaskDate === new Date().toISOString().split('T')[0]) || t.date === selectedTaskDate);
    const filteredTasks = tasksForDate.filter(t => filter === 'all' || t.category === filter);

    if (filteredTasks.length === 0) {
        container.innerHTML = `<p style="color:var(--text-muted); text-align:center; padding: 20px;">Nenhuma tarefa encontrada para este dia.</p>`;
        return;
    }

    filteredTasks.forEach(task => {
        const item = document.createElement('div');
        item.className = 'list-item';
        item.innerHTML = `
            <div class="item-left">
                <input type="checkbox" ${task.completed ? 'checked' : ''} onchange="toggleTask(${task.id})">
                <div class="item-info ${task.completed ? 'completed' : ''}">
                    <h4>${task.title}</h4>
                    <div class="badges">
                        <span class="badge">${task.category}</span>
                        <span class="badge" style="background:var(--border-color); color:var(--text-main);">${task.priority}</span>
                        ${!task.completed && new Date(selectedTaskDate) < new Date(new Date().toDateString()) ? '<span class="badge" style="background:rgba(239,68,68,0.15); color:#ef4444;">Não cumprida ⚠️</span>' : ''}
                    </div>
                </div>
            </div>
            <button class="btn-delete" onclick="deleteTask(${task.id})"><i class="fa-solid fa-trash"></i></button>
        `;
        container.appendChild(item);
    });
}

window.toggleTask = function(id) {
    const task = state.tasks.find(t => t.id === id);
    if (task) {
        task.completed = !task.completed;
        saveState();
        renderTasks();
    }
}

window.deleteTask = function(id) {
    state.tasks = state.tasks.filter(t => t.id !== id);
    saveState();
    renderTasks();
}

function renderStudies() {
    const container = document.getElementById('studies-list');
    container.innerHTML = '';

    if (state.studies.length === 0) {
        container.innerHTML = `<p style="color:var(--text-muted); text-align:center; padding: 15px;">Nenhum estudo cadastrado.</p>`;
        return;
    }

    state.studies.forEach(study => {
        let statusBadgeColor = 'var(--border-color)';
        let statusTextColor = 'var(--text-main)';
        if (study.status === 'Concluído') {
            statusBadgeColor = 'rgba(16, 185, 129, 0.15)';
            statusTextColor = '#10b981';
        } else if (study.status === 'Em Andamento') {
            statusBadgeColor = 'rgba(245, 158, 11, 0.15)';
            statusTextColor = '#f59e0b';
        }

        const item = document.createElement('div');
        item.className = 'list-item';
        item.innerHTML = `
            <div class="item-left">
                <div class="item-info">
                    <h4>${study.topic}</h4>
                    <div class="badges">
                        <span class="badge">📅 ${study.date.split('-').reverse().join('/')}</span>
                        <span class="badge" style="background:${statusBadgeColor}; color:${statusTextColor}; font-weight:600;">${study.status}</span>
                    </div>
                </div>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
                <button class="btn-edit" onclick="editStudy(${study.id})" title="Editar Status / Estudo"><i class="fa-solid fa-pen-to-square"></i></button>
                <button class="btn-delete" onclick="deleteStudy(${study.id})" title="Excluir"><i class="fa-solid fa-trash"></i></button>
            </div>
        `;
        container.appendChild(item);
    });
}

window.editStudy = function(id) {
    const study = state.studies.find(s => s.id === id);
    if (!study) return;

    document.getElementById('study-edit-id').value = study.id;
    document.getElementById('study-topic').value = study.topic;
    document.getElementById('study-date').value = study.date;
    document.getElementById('study-status').value = study.status;
    document.getElementById('study-submit-btn').innerHTML = `<i class="fa-solid fa-check"></i> Salvar Edição`;
    
    document.getElementById('study-form').style.display = 'grid';
    document.getElementById('study-form').scrollIntoView({ behavior: 'smooth' });
}

window.deleteStudy = function(id) {
    state.studies = state.studies.filter(s => s.id !== id);
    saveState();
    renderStudies();
}

function renderExams() {
    const container = document.getElementById('exams-list');
    container.innerHTML = '';

    if (state.exams.length === 0) {
        container.innerHTML = `<p style="color:var(--text-muted); text-align:center; padding: 15px;">Nenhuma prova agendada.</p>`;
        return;
    }

    state.exams.forEach(exam => {
        const item = document.createElement('div');
        item.className = 'list-item';
        item.innerHTML = `
            <div class="item-left">
                <div class="brand-badge" style="background:#ef4444;"><i class="fa-solid fa-file-pen"></i></div>
                <div class="item-info">
                    <h4>${exam.title}</h4>
                    <div class="badges">
                        <span class="badge" style="background:rgba(239, 68, 68, 0.1); color:#ef4444;">🚨 Data da Prova: ${exam.date.split('-').reverse().join('/')}</span>
                    </div>
                </div>
            </div>
            <button class="btn-delete" onclick="deleteExam(${exam.id})"><i class="fa-solid fa-trash"></i></button>
        `;
        container.appendChild(item);
    });
}

window.deleteExam = function(id) {
    state.exams = state.exams.filter(e => e.id !== id);
    saveState();
    renderExams();
}

function renderCollegeDays() {
    const container = document.getElementById('college-days-list');
    container.innerHTML = '';

    if (state.collegeDays.length === 0) {
        container.innerHTML = `<p style="color:var(--text-muted); text-align:center; padding: 15px;">Nenhum dia de faculdade cadastrado.</p>`;
        return;
    }

    state.collegeDays.forEach(col => {
        const jalecoBadge = col.jaleco 
            ? `<span class="badge" style="background:rgba(16, 185, 129, 0.15); color:#10b981;"><i class="fa-solid fa-user-doctor"></i> Jaleco Obrigatório 🥼</span>` 
            : '';

        const item = document.createElement('div');
        item.className = 'list-item';
        item.innerHTML = `
            <div class="item-left">
                <div class="brand-badge" style="background:#3b82f6;"><i class="fa-solid fa-calendar-days"></i></div>
                <div class="item-info">
                    <h4>${col.day}</h4>
                    <div class="badges">
                        <span class="badge">📚 ${col.subjects}</span>
                        ${jalecoBadge}
                    </div>
                </div>
            </div>
            <button class="btn-delete" onclick="deleteCollegeDay(${col.id})"><i class="fa-solid fa-trash"></i></button>
        `;
        container.appendChild(item);
    });
}

window.deleteCollegeDay = function(id) {
    state.collegeDays = state.collegeDays.filter(c => c.id !== id);
    saveState();
    renderCollegeDays();
}

function renderEvents() {
    const container = document.getElementById('events-list');
    container.innerHTML = '';
    
    state.events.sort((a, b) => new Date(a.date) - new Date(b.date));

    if (state.events.length === 0) {
        container.innerHTML = `<p style="color:var(--text-muted); text-align:center; padding: 20px;">Nenhum evento ou compromisso cadastrado. 📅</p>`;
        document.getElementById('total-events-count').textContent = '0';
        return;
    }

    state.events.forEach(ev => {
        const timeDisplay = ev.time ? ` às ${ev.time}` : '';
        const item = document.createElement('div');
        item.className = 'list-item';
        item.innerHTML = `
            <div class="item-left">
                <div class="brand-badge" style="background:#7c3aed;"><i class="fa-solid fa-calendar-check"></i></div>
                <div class="item-info">
                    <h4>${ev.title}</h4>
                    <div class="badges">
                        <span class="badge" style="color:#10b981; background:rgba(16,185,129,0.1)">📅 ${ev.date.split('-').reverse().join('/')}${timeDisplay}</span>
                    </div>
                </div>
            </div>
            <button class="btn-delete" onclick="deleteEvent(${ev.id})"><i class="fa-solid fa-trash"></i></button>
        `;
        container.appendChild(item);
    });

    document.getElementById('total-events-count').textContent = state.events.length;
}

window.deleteEvent = function(id) {
    state.events = state.events.filter(e => e.id !== id);
    saveState();
    renderEvents();
}

function getStreamingBadge(name) {
    const styles = {
        'Netflix': { bg: '#E50914', icon: 'N' },
        'Spotify': { bg: '#1DB954', icon: '<i class="fa-brands fa-spotify"></i>' },
        'Amazon Prime': { bg: '#00A8E1', icon: '<i class="fa-brands fa-amazon"></i>' },
        'Disney+': { bg: '#113CCF', icon: 'D+' },
        'HBO Max': { bg: '#7854F7', icon: 'HBO' },
        'YouTube Premium': { bg: '#FF0000', icon: '<i class="fa-brands fa-youtube"></i>' },
        'Globoplay': { bg: '#FF6600', icon: 'GP' },
        'Crunchyroll': { bg: '#F47521', icon: 'CR' },
        'Apple TV+': { bg: '#333333', icon: '<i class="fa-brands fa-apple"></i>' }
    };
    const brand = styles[name] || { bg: '#7c3aed', icon: '<i class="fa-solid fa-tv"></i>' };
    return `<div class="brand-badge" style="background:${brand.bg};">${brand.icon}</div>`;
}

function getCategoryIcon(category) {
    const icons = {
        'Saude': '<div class="brand-badge" style="background:#10b981;"><i class="fa-solid fa-notes-medical"></i></div>',
        'Contas': '<div class="brand-badge" style="background:#f59e0b;"><i class="fa-solid fa-lightbulb"></i></div>',
        'Boletos': '<div class="brand-badge" style="background:#3b82f6;"><i class="fa-solid fa-file-invoice-dollar"></i></div>',
        'Parcelas': '<div class="brand-badge" style="background:#a855f7;"><i class="fa-solid fa-credit-card"></i></div>'
    };
    return icons[category] || '<div class="brand-badge" style="background:#7c3aed;"><i class="fa-solid fa-wallet"></i></div>';
}

function renderBills() {
    const container = document.getElementById('bills-list');
    container.innerHTML = '';
    let total = 0;

    if (state.bills.length === 0) {
        container.innerHTML = `<p style="color:var(--text-muted); text-align:center; padding: 20px;">Nenhum gasto mensal registrado. 💳</p>`;
        document.getElementById('total-bills-value').textContent = 'R$ 0,00';
        updateDashboard();
        return;
    }

    state.bills.forEach(bill => {
        if (!bill.paid) total += bill.value;
        const visualBadge = bill.category === 'Streaming' ? getStreamingBadge(bill.name) : getCategoryIcon(bill.category);
        
        let cardBadge = '';
        if (bill.cardId) {
            const cardObj = state.cards.find(c => c.id === bill.cardId);
            if (cardObj) {
                cardBadge = `<span class="badge" style="background:var(--primary-light); color:var(--primary);">💳 Cartão: ${cardObj.name} (...${cardObj.digits})</span>`;
            }
        }

        const item = document.createElement('div');
        item.className = 'list-item';
        item.innerHTML = `
            <div class="item-left">
                <input type="checkbox" ${bill.paid ? 'checked' : ''} onchange="toggleBillPaid(${bill.id})" title="Marcar como pago">
                <div class="item-info ${bill.paid ? 'completed' : ''}">
                    <h4>${visualBadge} ${bill.name}</h4>
                    <div class="badges">
                        <span class="badge" style="color:#10b981; background:rgba(16,185,129,0.1)">R$ ${bill.value.toFixed(2)}</span>
                        <span class="badge">Cobrança: Todo dia ${bill.duedate}</span>
                        <span class="badge" style="background:var(--border-color); color:var(--text-main);">${bill.category}</span>
                        ${cardBadge}
                        ${bill.paid ? '<span class="badge" style="background:#10b981; color:#fff;">Pago ✅</span>' : '<span class="badge" style="background:#f59e0b; color:#fff;">Pendente ⏳</span>'}
                    </div>
                </div>
            </div>
            <button class="btn-delete" onclick="deleteBill(${bill.id})"><i class="fa-solid fa-trash"></i></button>
        `;
        container.appendChild(item);
    });

    const formattedTotal = `R$ ${total.toFixed(2)}`;
    document.getElementById('total-bills-value').textContent = formattedTotal;
    updateDashboard();
}

window.toggleBillPaid = function(id) {
    const bill = state.bills.find(b => b.id === id);
    if (bill) {
        bill.paid = !bill.paid;
        saveState();
        renderBills();
    }
}

window.deleteBill = function(id) {
    state.bills = state.bills.filter(b => b.id !== id);
    state.purchases = state.purchases.filter(p => p.billId !== id);
    saveState();
    renderAll();
}

function updatePaymentMethodOptions() {
    const group = document.getElementById('purchase-cards-group');
    if (!group) return;
    
    const currentVal = document.getElementById('purchase-payment-method').value;
    group.innerHTML = '';
    
    state.cards.forEach(card => {
        group.innerHTML += `<option value="card_${card.id}">💳 ${card.name} (...${card.digits})</option>`;
    });

    if (document.querySelector(`#purchase-payment-method option[value="${currentVal}"]`)) {
        document.getElementById('purchase-payment-method').value = currentVal;
    }
}

function updateCardSelectOptions() {
    const billSelect = document.getElementById('bill-card-id');
    if (billSelect) {
        const currentValBill = billSelect.value;
        billSelect.innerHTML = '<option value="">Sem cartão vinculado (Dinheiro/Pix)</option>';
        state.cards.forEach(card => {
            billSelect.innerHTML += `<option value="${card.id}">${card.name} (...${card.digits}) [Fecha: ${card.closing} / Vence: ${card.due}]</option>`;
        });
        billSelect.value = currentValBill;
    }
}

function renderCards() {
    const container = document.getElementById('cards-list');
    container.innerHTML = '';
    let totalAllPurchases = 0;

    if (state.cards.length === 0) {
        container.innerHTML = `<p style="color:var(--text-muted); text-align:center; padding: 20px;">Nenhum cartão cadastrado ainda. 💳</p>`;
        document.getElementById('total-cards-value').textContent = 'R$ 0,00';
        updateDashboard();
        return;
    }

    state.cards.forEach(card => {
        const cardPurchases = state.purchases.filter(p => p.cardId === card.id);
        const cardTotal = cardPurchases.reduce((acc, p) => acc + p.value, 0);
        totalAllPurchases += cardTotal;

        let purchasesHtml = '';
        if (cardPurchases.length === 0) {
            purchasesHtml = `<li style="border:none; color:var(--text-muted); font-size:0.85rem;">Nenhum gasto registrado neste cartão.</li>`;
        } else {
            cardPurchases.forEach(p => {
                purchasesHtml += `
                    <li style="display:flex; justify-content:space-between; align-items:center; padding: 6px 0;">
                        <span>🛒 <b>${p.title}</b> <span class="badge" style="margin-left:6px;">${p.category || 'Outros'}</span> <small style="color:var(--text-muted);">(${p.date.split('-').reverse().join('/')})</small></span>
                        <div style="display:flex; align-items:center; gap:12px;">
                            <span style="color:#10b981; font-weight:600;">R$ ${p.value.toFixed(2)}</span>
                            <button onclick="deletePurchase(${p.id})" style="background:none; border:none; color:#ef4444; cursor:pointer;" title="Excluir"><i class="fa-solid fa-xmark"></i></button>
                        </div>
                    </li>
                `;
            });
        }

        const cardItem = document.createElement('div');
        cardItem.className = 'list-item';
        cardItem.style.flexDirection = 'column';
        cardItem.style.alignItems = 'stretch';
        cardItem.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 10px;">
                <div class="item-left">
                    <div class="brand-badge" style="background:var(--primary);"><i class="fa-solid fa-credit-card"></i></div>
                    <div class="item-info">
                        <h4>${card.name} <span style="font-size:0.85rem; color:var(--text-muted);">(...${card.digits})</span></h4>
                        <div class="badges">
                            <span class="badge">Fechamento: Dia ${card.closing}</span>
                            <span class="badge">Vencimento: Dia ${card.due}</span>
                        </div>
                    </div>
                </div>
                <div style="display:flex; align-items:center; gap:8px;">
                    <h3 style="color:var(--primary); margin-right: 8px;">R$ ${cardTotal.toFixed(2)}</h3>
                    <button class="btn-edit" onclick="editCard(${card.id})" title="Editar Cartão"><i class="fa-solid fa-pen-to-square"></i></button>
                    <button class="btn-delete" onclick="deleteCard(${card.id})" title="Excluir Cartão"><i class="fa-solid fa-trash"></i></button>
                </div>
            </div>
            <div style="background:var(--bg-main); padding: 12px; border-radius: 10px; border: 1px solid var(--border-color);">
                <p style="font-size:0.8rem; font-weight:600; color:var(--text-muted); margin-bottom:6px;">Gastos na Fatura:</p>
                <ul class="styled-list">${purchasesHtml}</ul>
            </div>
        `;
        container.appendChild(cardItem);
    });

    document.getElementById('total-cards-value').textContent = `R$ ${totalAllPurchases.toFixed(2)}`;
    updateDashboard();
}

function renderIsolatedPurchases() {
    const container = document.getElementById('isolated-purchases-list');
    container.innerHTML = '';
    let totalIsolated = 0;

    const purchasesForDate = state.purchases.filter(p => p.date === selectedPurchaseDate);

    if (purchasesForDate.length === 0) {
        container.innerHTML = `<p style="color:var(--text-muted); text-align:center; padding: 20px;">Nenhum gasto isolado registrado para este dia. 🛒</p>`;
        document.getElementById('total-isolated-value').textContent = 'R$ 0,00';
        updateDashboard();
        return;
    }

    purchasesForDate.forEach(p => {
        totalIsolated += p.value;
        
        let paymentBadge = '';
        if (p.paymentMethod === 'pix') {
            paymentBadge = `<span class="badge" style="background:rgba(16, 185, 129, 0.15); color:#10b981;">⚡ Pix</span>`;
        } else if (p.paymentMethod === 'dinheiro') {
            paymentBadge = `<span class="badge" style="background:rgba(245, 158, 11, 0.15); color:#f59e0b;">💵 Dinheiro</span>`;
        } else {
            const cardObj = state.cards.find(c => c.id === p.cardId);
            const cardName = cardObj ? `${cardObj.name} (...${cardObj.digits})` : 'Cartão';
            paymentBadge = `<span class="badge">💳 ${cardName}</span>`;
        }

        const item = document.createElement('div');
        item.className = 'list-item';
        item.innerHTML = `
            <div class="item-left">
                <div class="brand-badge" style="background:#7c3aed;"><i class="fa-solid fa-cart-shopping"></i></div>
                <div class="item-info">
                    <h4>${p.title}</h4>
                    <div class="badges">
                        <span class="badge" style="color:#10b981; background:rgba(16,185,129,0.1)">R$ ${p.value.toFixed(2)}</span>
                        ${paymentBadge}
                        <span class="badge" style="background:var(--border-color); color:var(--text-main);">${p.category || 'Outros'}</span>
                    </div>
                </div>
            </div>
            <button class="btn-delete" onclick="deletePurchase(${p.id})"><i class="fa-solid fa-trash"></i></button>
        `;
        container.appendChild(item);
    });

    document.getElementById('total-isolated-value').textContent = `R$ ${totalIsolated.toFixed(2)}`;
    updateDashboard();
}

window.editCard = function(id) {
    const card = state.cards.find(c => c.id === id);
    if (!card) return;

    document.getElementById('card-edit-id').value = card.id;
    document.getElementById('card-name').value = card.name;
    document.getElementById('card-digits').value = card.digits;
    document.getElementById('card-closing').value = card.closing;
    document.getElementById('card-due').value = card.due;
    document.getElementById('card-submit-btn').innerHTML = `<i class="fa-solid fa-check"></i> Salvar Edição`;
    
    document.getElementById('card-form').style.display = 'grid';
    document.getElementById('card-form').scrollIntoView({ behavior: 'smooth' });
}

window.deletePurchase = function(id) {
    state.purchases = state.purchases.filter(p => p.id !== id);
    saveState();
    renderAll();
}

window.deleteCard = function(id) {
    state.cards = state.cards.filter(c => c.id !== id);
    state.purchases = state.purchases.filter(p => p.cardId !== id);
    state.bills.forEach(b => {
        if (b.cardId === id) b.cardId = null;
    });
    saveState();
    renderAll();
}

function updateDashboard() {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const currentDayOfMonth = today.getDate();
    const currentMonthPrefix = todayStr.substring(0, 7);

    const todayTasks = state.tasks.filter(t => (!t.date && todayStr === new Date().toISOString().split('T')[0]) || t.date === todayStr);
    const pendingTasks = todayTasks.filter(t => !t.completed).length;

    document.getElementById('stat-tasks').textContent = `${todayTasks.filter(t => t.completed).length} concluídas hoje`;
    document.getElementById('dash-tasks-count').textContent = pendingTasks;

    const totalMonthlyBills = state.bills.reduce((acc, b) => acc + b.value, 0);
    document.getElementById('dash-total-bills').textContent = `R$ ${totalMonthlyBills.toFixed(2)}`;

    const todayPurchases = state.purchases.filter(p => p.date === todayStr && !p.isBill);
    const totalToday = todayPurchases.reduce((acc, p) => acc + p.value, 0);
    document.getElementById('dash-total-today').textContent = `R$ ${totalToday.toFixed(2)}`;

    const billsUntilToday = state.bills
        .filter(b => parseInt(b.duedate) <= currentDayOfMonth)
        .reduce((acc, b) => acc + b.value, 0);

    const monthPurchases = state.purchases.filter(p => p.date && p.date.startsWith(currentMonthPrefix) && !p.isBill);
    const totalMonthPurchases = monthPurchases.reduce((acc, p) => acc + p.value, 0);

    const grandTotalMonth = billsUntilToday + totalMonthPurchases;
    document.getElementById('dash-total-month').textContent = `R$ ${grandTotalMonth.toFixed(2)}`;
}