// Initialize Firebase (Compat)
if (!firebase.apps.length) {
    firebase.initializeApp({
      apiKey: "AIzaSyAYYZF7RDi1qcH9y4i47bsNVCpjvPgXlsE",
      authDomain: "sentinel-22ad5.firebaseapp.com",
      projectId: "sentinel-22ad5",
      storageBucket: "sentinel-22ad5.firebasestorage.app",
      messagingSenderId: "910901030196",
      appId: "1:910901030196:web:67b3ec4470ac0302fc8961"
    });
}
const db = firebase.database();
const auth = firebase.auth();

const app = {
    userId: null,
    currentDate: new Date(),
    data: {}, // { 'YYYY-MM-DD': { lembretes: [], notas: [], avisos: [] } }
    user: { xp: 0, dreams: [], avatar: null, history: {}, achievements: [] }, // User Profile settings for Gamification
    cropperInfo: { instance: null }, // Stores Cropper instance
    searchTerm: '', // Termo de busca global

    achievementsList: [
        { id: 'first_task', title: 'Recruta Sentinel', desc: 'Concluiu sua primeira tarefa.', icon: '🎯', goal: 1, type: 'task_count' },
        { id: 'xp_100', title: 'Agente Nível 1', desc: 'Alcançou 100 XP.', icon: '⭐', goal: 100, type: 'xp' },
        { id: 'task_10', title: 'Operador Eficiente', desc: 'Concluiu 10 tarefas no total.', icon: '⚡', goal: 10, type: 'task_count' },
        { id: 'dream_first', title: 'Sonhador', desc: 'Adicionou seu primeiro Objetivo de Vida.', icon: '🏷️', goal: 1, type: 'dream_count' },
        { id: 'night_owl', title: 'Agente Noturno', desc: 'Concluiu uma tarefa entre 00:00 e 05:00.', icon: '🦉', goal: 1, type: 'night_task', hidden: true },
        { id: 'perfect_day', title: 'Foco Total', desc: 'Concluiu 100% das tarefas de um dia (mín. 3).', icon: '🔥', goal: 1, type: 'perfect_day', hidden: true }
    ],

    init() {
        this.setupAuthListener();
        this.setupCalendar();
        this.setupSidebar();
        this.checkNotificationStatus();
        
        // Setup local alarm checking every 30 seconds
        setInterval(() => this.checkAlarms(), 30000);
    },

    setupAuthListener() {
        // Escuta ativamente no background se o token da Google Cloud está logado
        auth.onAuthStateChanged((user) => {
            const loginOverlay = document.getElementById('login-overlay');
            if (user) {
                this.userId = user.uid;
                if(loginOverlay) loginOverlay.classList.remove('active');
                
                // Mágica: Puxa os dados direto da nuvem ao logar
                // No iOS PWA, o WebSocket do Banco de Dados pode demorar 1 segundinho pra receber o Token
                // Esse delay evita que o Firebase expulse o PWA dando erro de conexão!
                setTimeout(() => {
                    this.loadData();
                }, 1500);
            } else {
                this.userId = null;
                if(loginOverlay) loginOverlay.classList.add('active');
                
                // Limpa a tela se for deslogado
                this.data = {};
                this.user = { xp: 0, dreams: [], avatar: null };
                this.renderAll();
                this.renderDreams();
                this.updateProfileUI();
            }
        });
    },

    handleAuth(event) {
        event.preventDefault();
        const email = document.getElementById('auth-email').value;
        const password = document.getElementById('auth-password').value;
        const errorMsg = document.getElementById('auth-error-msg');
        
        errorMsg.style.display = 'none';
        const submitBtn = document.getElementById('btn-login-submit');
        submitBtn.textContent = 'Autenticando...';
        submitBtn.disabled = true;
        
        auth.signInWithEmailAndPassword(email, password)
            .then((userCredential) => {
                submitBtn.textContent = 'Entrar no Sistema';
                submitBtn.disabled = false;
                // onAuthStateChanged faz o resto
            })
            .catch((error) => {
                submitBtn.textContent = 'Entrar no Sistema';
                submitBtn.disabled = false;
                errorMsg.textContent = 'Conta não existe ou senha incorreta!';
                errorMsg.style.display = 'block';
            });
    },

    handleCreateAccount() {
        const email = document.getElementById('auth-email').value;
        const password = document.getElementById('auth-password').value;
        const errorMsg = document.getElementById('auth-error-msg');
        
        if (!email || !password) {
            errorMsg.textContent = 'Preencha E-mail e Senha no painel para criar uma conta.';
            errorMsg.style.display = 'block';
            return;
        }
        
        errorMsg.style.display = 'none';
        const submitBtn = document.getElementById('btn-login-submit');
        submitBtn.textContent = 'Criando Arquivo...';
        
        auth.createUserWithEmailAndPassword(email, password)
            .then((userCredential) => {
                submitBtn.textContent = 'Entrar no Sistema';
                // Criação do Documento zerado no Banco de Dados
                db.ref('users/' + userCredential.user.uid).set({
                    data: {},
                    profile: { xp: 0, dreams: [], avatar: null }
                }).then(() => {
                    this.showToast('Conta Criada com Sucesso no Firebase!');
                });
            })
            .catch((error) => {
                submitBtn.textContent = 'Entrar no Sistema';
                if(error.code === 'auth/weak-password') {
                    errorMsg.textContent = 'A Senha deve ter no mínimo 6 letras.';
                } else if(error.code === 'auth/email-already-in-use') {
                    errorMsg.textContent = 'E-mail Ocupado. Tente clicar em Entrar ou use outro.';
                } else {
                    errorMsg.textContent = 'Erro ao Criar: ' + error.message;
                }
                errorMsg.style.display = 'block';
            });
    },

    signOut() {
        auth.signOut().then(() => {
            const sidebar = document.getElementById('sidebar-menu');
            const backdrop = document.getElementById('sidebar-backdrop');
            if(sidebar) sidebar.classList.remove('active');
            if(backdrop) backdrop.classList.remove('active');
        });
    },

    // --- Notificações ---
    checkNotificationStatus() {
        const btn = document.getElementById('btn-request-notify');
        if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
            btn.style.display = 'flex';
        } else {
            btn.style.display = 'none';
        }
    },

    requestNotificationPermission() {
        if (!('Notification' in window)) {
            alert('Seu navegador não suporta notificações.');
            return;
        }
        
        Notification.requestPermission().then(permission => {
            this.checkNotificationStatus();
            if (permission === 'granted') {
                this.showToast('Notificações ativadas com sucesso!');
            }
        });
    },

    checkAlarms() {
        if (!('Notification' in window) || Notification.permission !== 'granted') return;
        
        const now = new Date();
        const currentDateString = this.getDateString(now);
        
        // Only trigger alarms for 'today' based on the system date
        if (!this.data[currentDateString]) return;
        const todayData = this.data[currentDateString];
        
        // Current time in minutes since 00:00 to avoid skipping
        const currentMins = now.getHours() * 60 + now.getMinutes();
        
        ['lembretes', 'notas', 'avisos'].forEach(cat => {
            const items = todayData[cat];
            items.forEach(item => {
                if (item.time && !item.isDone && !item.notified) {
                    const [h, m] = item.time.split(':').map(Number);
                    const itemMins = h * 60 + m;
                    
                    // Se for hora de tocar (ou já passou a hora hoje) e ainda não tocou
                    if (currentMins >= itemMins) {
                        this.triggerNotification(cat, item);
                        item.notified = true; 
                        this.saveData();
                    }
                }
            });
        });
    },

    triggerNotification(category, item) {
        let iconHtml = category === 'lembretes' ? '🔔' : category === 'avisos' ? '⚠️' : '📝';
        
        const options = {
            body: item.text,
            icon: './icon.svg',
            badge: './icon.svg',
            vibrate: [200, 100, 200],
            tag: item.id, // prevent duplicate notifications
            data: { url: window.location.href }
        };

        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            navigator.serviceWorker.ready.then(registration => {
                registration.showNotification(`${iconHtml} SENTINEL`, options);
            });
        } else {
            new Notification(`${iconHtml} SENTINEL`, options);
        }

        this.playBeep();
    },

    playBeep() {
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            const audioCtx = new AudioContext();
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
            gainNode.gain.setValueAtTime(0.04, audioCtx.currentTime);
            oscillator.start();
            oscillator.stop(audioCtx.currentTime + 0.15);
        } catch(e) {}
    },

    // --- Sidebar (Menu Hambúrguer) ---
    setupSidebar() {
        const btnMenu = document.getElementById('btn-menu');
        const btnClose = document.getElementById('btn-close-menu');
        const sidebar = document.getElementById('sidebar-menu');
        const backdrop = document.getElementById('sidebar-backdrop');
        
        // Anti-crash Guard for corrupted cached HTMLs
        if (!btnMenu || !btnClose || !sidebar || !backdrop) return;
        
        const openSidebar = () => {
            sidebar.classList.add('active');
            backdrop.classList.add('active');
        };
        
        const closeSidebar = () => {
            sidebar.classList.remove('active');
            backdrop.classList.remove('active');
        };

        btnMenu.addEventListener('click', openSidebar);
        btnClose.addEventListener('click', closeSidebar);
        backdrop.addEventListener('click', closeSidebar);
        
        // Touch Swipe to close (mobile friendly)
        let touchStartX = 0;
        let touchEndX = 0;
        
        sidebar.addEventListener('touchstart', e => {
            touchStartX = e.changedTouches[0].screenX;
        }, {passive: true});
        
        sidebar.addEventListener('touchend', e => {
            touchEndX = e.changedTouches[0].screenX;
            if (touchEndX < touchStartX - 50) closeSidebar(); // Swiped left
        }, {passive: true});
        
        this.updateProfileUI();
    },

    // --- Gamification & Ranks ---
    getRankConfig(level) {
        if (level < 10) return { title: 'Recruta Sentinel', icon: 'ph-shield', color: 'rank-bronze' };
        if (level < 20) return { title: 'Agente Operacional', icon: 'ph-shield-check', color: 'rank-silver' };
        if (level < 30) return { title: 'Especialista Tático', icon: 'ph-target', color: 'rank-gold' };
        if (level < 50) return { title: 'Comandante', icon: 'ph-shield-star', color: 'rank-platinum' };
        if (level < 75) return { title: 'Elite Sentinel', icon: 'ph-lightning', color: 'rank-diamond' };
        if (level < 100) return { title: 'Mestre Guardião', icon: 'ph-crown', color: 'rank-diamond' };
        return { title: 'Lenda Sentinel', icon: 'ph-shooting-star', color: 'rank-diamond' };
    },

    getRank() {
        const xp = this.user.xp || 0;
        const level = Math.floor(xp / 100) + 1;
        return { ...this.getRankConfig(level), level };
    },

    updateProfileUI() {
        const xp = this.user.xp || 0;
        const level = Math.floor(xp / 100) + 1; // 1 level per 100 XP
        const currentLevelXp = xp % 100;
        const xpRequired = 100; // Target to next level
        
        const rank = this.getRankConfig(level);
        
        const userTitleEl = document.querySelector('.user-title');
        if (userTitleEl) userTitleEl.innerHTML = `<i class="ph ${rank.icon}"></i> ${rank.title}`;
        
        // Update Small Badge
        const badge = document.getElementById('rank-badge');
        if (badge) {
            badge.className = `rank-badge ${rank.color}`;
            badge.innerHTML = `<i class="ph ${rank.icon}"></i> Lv${level}`;
        }

        // Update Avatar Image if exists
        const avatarContainer = document.getElementById('user-avatar-base');
        if (avatarContainer) {
            if (this.user.avatar) {
                avatarContainer.innerHTML = `<img src="${this.user.avatar}" alt="Avatar">`;
            } else {
                avatarContainer.innerHTML = `<i class="ph ph-user"></i>`;
            }
        }

        const progressPercent = (currentLevelXp / xpRequired) * 100;

        const levelEl = document.getElementById('user-level');
        const xpEl = document.getElementById('user-xp');
        const targetEl = document.getElementById('xp-target');
        const progressEl = document.getElementById('level-progress-fill');
        
        if (levelEl) levelEl.textContent = level;
        if (xpEl) xpEl.textContent = xp;
        if (targetEl) targetEl.textContent = xpRequired * level;
        if (progressEl) progressEl.style.width = `${progressPercent}%`;

        // Optional: Update text occasionally
        const msgEl = document.getElementById('level-msg');
        if (msgEl) msgEl.textContent = `Patente: ${rank.title}`;
    },

    changeAvatar(event) {
        const file = event.target.files[0];
        if (!file) return;

        // Não há mais limite de tamanho rígido no input inicial (já que será comprimido a seguir)
        const reader = new FileReader();
        reader.onload = (e) => {
            app.openCropModal(e.target.result);
        };
        reader.readAsDataURL(file);
        
        // Reset file input para permitir pegar a mesma foto denovo se cancelado
        event.target.value = '';
    },

    openCropModal(imageSrc) {
        const cropModal = document.getElementById('crop-modal');
        const imageObj = document.getElementById('crop-image');
        
        if (!cropModal || !imageObj) return; // Guard against broken HTML
        
        cropModal.classList.add('active');
        imageObj.src = imageSrc;
        
        // If an old instance exists, destroy it.
        if (this.cropperInfo.instance) {
            this.cropperInfo.instance.destroy();
        }
        
        // Initialize Cropper API
        this.cropperInfo.instance = new Cropper(imageObj, {
            aspectRatio: 1, // Fixa para corte 1:1 quadrado (perfeito pra avatar)
            viewMode: 1,
            dragMode: 'move', // Puxar na tela movimenta a foto
            autoCropArea: 0.9,
            restore: false,
            guides: false,
            center: true,
            highlight: false,
            cropBoxMovable: false,
            cropBoxResizable: false, // Caixa fixa no centro
            toggleDragModeOnDblclick: false
        });
    },

    closeCropModal() {
        const cropModal = document.getElementById('crop-modal');
        if (cropModal) cropModal.classList.remove('active');
        
        if (this.cropperInfo.instance) {
            this.cropperInfo.instance.destroy();
            this.cropperInfo.instance = null;
        }
    },

    applyCrop() {
        if (!this.cropperInfo.instance) return;

        // Extrai a imagem final formatada e comprimida pra 150x150 JPEG (reduz o 2MB pra meros ~15KBs)
        const canvas = this.cropperInfo.instance.getCroppedCanvas({
            width: 200,
            height: 200,
            imageSmoothingEnabled: true,
            imageSmoothingQuality: 'high',
        });

        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.85); // Compressão Jpeg de 85%

        this.user.avatar = compressedBase64;
        this.saveData();
        this.updateProfileUI();
        this.showToast('Foto do perfil linda salva!');
        
        this.closeCropModal();
    },

    addXP(amount) {
        // Increment avoiding negatives
        this.user.xp = Math.max(0, this.user.xp + amount);
        this.saveData();
        this.updateProfileUI();
        
        if (amount > 0) this.showToast(`+${amount} XP ganho!`);
    },

    // --- Grandes Objetivos de Vida (Mural dos Sonhos) ---
    promptNewDream() {
        const dreamText = document.getElementById('dream-text');
        const dreamModal = document.getElementById('dream-modal');
        
        if (!dreamText || !dreamModal) return; // Guard clause
        
        dreamText.value = '';
        dreamModal.classList.add('active');
        setTimeout(() => dreamText.focus(), 100);
    },

    closeDreamModal() {
        const dreamModal = document.getElementById('dream-modal');
        if (dreamModal) dreamModal.classList.remove('active');
    },

    saveDream() {
        const textObj = document.getElementById('dream-text');
        if (!textObj) return;
        
        const text = textObj.value;
        if (text && text.trim()) {
            if (!this.user.dreams) this.user.dreams = [];
            const newId = Date.now().toString(36) + Math.random().toString(36).substr(2);
            this.user.dreams.push({ id: newId, text: text.trim() });
            this.saveData();
            this.renderDreams();
            this.showToast('Objetivo salvo! Mantenha o foco.');
            this.closeDreamModal();
        }
    },

    deleteDream(id) {
        if (confirm('Tem certeza que deseja apagar este grande objetivo?')) {
            this.user.dreams = this.user.dreams.filter(d => d.id !== id);
            this.saveData();
            this.renderDreams();
        }
    },

    renderDreams() {
        const container = document.getElementById('dreams-list');
        if (!container) return; // fail-safe depending on HTML
        
        const dreams = Array.isArray(this.user.dreams) ? this.user.dreams : [];
        container.innerHTML = '';
        
        if (dreams.length === 0) {
            container.innerHTML = `<li style="opacity:0.5; font-size:0.8rem; justify-content:center;">Sem objetivos listados</li>`;
            return;
        }

        dreams.forEach(dream => {
            const li = document.createElement('li');
            li.className = 'dream-item';
            li.innerHTML = `
                <i class="ph ph-star"></i>
                <div class="dream-content">
                    <div class="dream-text">${this.escapeHTML(dream.text)}</div>
                </div>
                <div class="dream-actions">
                    <button class="icon-btn" style="width:24px;height:24px;font-size:1rem;" onclick="app.deleteDream('${dream.id}')" aria-label="Remover">
                        <i class="ph ph-trash"></i>
                    </button>
                </div>
            `;
            container.appendChild(li);
        });
    },



    // --- Persistência (FIREBASE SAAS) ---
    loadData() {
        if (!this.userId) return; // Segurança
        
        this.showToast('Sincronizando Banco de Dados...');
        
        // Tenta puxar cache local instantâneo para não deixar a tela vazia offline
        try {
            const local = localStorage.getItem('sentinel_offline_data');
            if (local) {
                const parsed = JSON.parse(local);
                this.data = parsed.data || {};
                this.user = { 
                    xp: parsed.profile?.xp || 0, 
                    dreams: parsed.profile?.dreams ? (Array.isArray(parsed.profile.dreams) ? parsed.profile.dreams : Object.values(parsed.profile.dreams)) : [], 
                    avatar: parsed.profile?.avatar || null,
                    history: parsed.profile?.history || {},
                    achievements: parsed.profile?.achievements ? (Array.isArray(parsed.profile.achievements) ? parsed.profile.achievements : Object.values(parsed.profile.achievements)) : []
                };
                this.renderAll();
                this.renderDreams();
                this.updateProfileUI();
            }
        } catch(e) {}
        
        db.ref('users/' + this.userId).once('value').then((snapshot) => {
            if (snapshot.exists()) {
                const dbData = snapshot.val();
                this.data = dbData.data || {};
                
                const profile = dbData.profile || {};
                this.user = { 
                    xp: profile.xp || 0, 
                    dreams: profile.dreams ? (Array.isArray(profile.dreams) ? profile.dreams : Object.values(profile.dreams)) : [], 
                    avatar: profile.avatar || null,
                    history: profile.history || {},
                    achievements: profile.achievements ? (Array.isArray(profile.achievements) ? profile.achievements : Object.values(profile.achievements)) : []
                };
            } else {
                // Se a conta for nova na nuvem, mas tiver dados locais (migração)
                if (Object.keys(this.data).length === 0) {
                    this.data = {};
                    this.user = { xp: 0, dreams: [], avatar: null, history: {}, achievements: [] };
                }
            }
            
            // Backup dos dados mais recentes da nuvem no local storage
            try {
                localStorage.setItem('sentinel_offline_data', JSON.stringify({
                    data: this.data,
                    profile: this.user
                }));
            } catch(e) {}
            
            // Pinta a tela com os dados atualizados
            this.renderAll();
            this.renderDreams();
            this.updateProfileUI();
        }).catch((error) => {
            console.error("Erro carregando dados do Firebase:", error);
            this.showToast('Offline ativo. Usando os últimos dados salvos no celular.');
        });
    },

    saveData() {
        if (!this.userId) return;
        
        // Backup Local imediato para proteção contra quedas de internet
        try {
            localStorage.setItem('sentinel_offline_data', JSON.stringify({
                data: this.data,
                profile: this.user
            }));
        } catch(e) {}
        
        db.ref('users/' + this.userId).update({
            data: this.data,
            profile: this.user
        }).catch((error) => {
            // Conta nova sem arquivo? Força criação set()
            db.ref('users/' + this.userId).set({
                data: this.data,
                profile: this.user
            });
        });
    },

    // --- Calendário e Datas ---
    getDateString(date) {
        return date.toISOString().split('T')[0];
    },

    setupCalendar() {
        const prevBtn = document.getElementById('prev-day-btn');
        const nextBtn = document.getElementById('next-day-btn');
        const datePicker = document.getElementById('date-picker');
        
        prevBtn.addEventListener('click', () => {
            this.currentDate.setDate(this.currentDate.getDate() - 1);
            this.updateCalendarUI();
        });

        nextBtn.addEventListener('click', () => {
            this.currentDate.setDate(this.currentDate.getDate() + 1);
            this.updateCalendarUI();
        });

        datePicker.addEventListener('change', (e) => {
            if (e.target.value) {
                // Adjust for timezone offset to prevent date shifting
                const selected = new Date(e.target.value + 'T00:00:00');
                this.currentDate = selected;
                this.updateCalendarUI();
            }
        });

        this.updateCalendarUI();
    },

    updateCalendarUI() {
        const display = document.getElementById('current-date-display');
        const picker = document.getElementById('date-picker');
        
        const options = { weekday: 'short', day: '2-digit', month: 'short' };
        let formatted = this.currentDate.toLocaleDateString('pt-BR', options);
        // Capitalize first letter
        formatted = formatted.charAt(0).toUpperCase() + formatted.slice(1);
        
        // Check if it's today
        const today = new Date();
        if (this.getDateString(today) === this.getDateString(this.currentDate)) {
            formatted = "Hoje, " + formatted;
        }

        display.textContent = formatted;
        picker.value = this.getDateString(this.currentDate);
        
        this.renderAll();
    },

    updateProgress() {
        const dailyData = this.getDailyData();
        let total = 0;
        let done = 0;

        ['lembretes', 'notas', 'avisos'].forEach(cat => {
            total += dailyData[cat].length;
            done += dailyData[cat].filter(i => i.isDone).length;
        });

        const progressEl = document.getElementById('daily-progress');
        if (total === 0) {
            progressEl.textContent = 'Nenhuma tarefa para hoje';
        } else if (done === total && total > 0) {
            progressEl.textContent = '🎉 Todas as tarefas concluídas!';
        } else {
            progressEl.textContent = `${done} de ${total} tarefas concluídas`;
        }

        // Salvar Histórico para o Gráfico
        const dateStr = this.getDateString(this.currentDate);
        if (!this.user.history) this.user.history = {};
        this.user.history[dateStr] = { done, total };

        this.renderProductivityChart();
        this.checkAchievements();
    },

    renderProductivityChart() {
        const container = document.getElementById('productivity-chart');
        if (!container) return;

        // Pegar últimos 7 dias
        const days = [];
        const today = new Date();
        for (let i = 6; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            days.push(this.getDateString(d));
        }

        container.innerHTML = '';
        days.forEach(date => {
            const stat = this.user.history ? this.user.history[date] : null;
            const percent = (stat && stat.total > 0) ? (stat.done / stat.total) * 100 : 0;
            
            const barBg = document.createElement('div');
            barBg.className = 'chart-bar-bg';
            barBg.title = stat ? `${stat.done}/${stat.total} em ${date}` : 'Sem dados';
            
            const barFill = document.createElement('div');
            barFill.className = 'chart-bar-fill';
            barFill.style.height = `${Math.max(5, percent)}%`;
            if (percent === 100) barFill.style.background = '#22c55e';
            
            barBg.appendChild(barFill);
            container.appendChild(barBg);
        });
    },

    checkAchievements() {
        let changed = false;
        if (!this.user.achievements) this.user.achievements = [];

        const historyValues = Object.entries(this.user.history || {});
        const totalTasksDone = historyValues.reduce((acc, [key, curr]) => acc + (curr.done || 0), 0);
        const dreamCount = (this.user.dreams || []).length;
        const currentXP = this.user.xp || 0;
        
        // Hora atual para medalha noturna
        const now = new Date();
        const hour = now.getHours();

        this.achievementsList.forEach(ach => {
            if (this.user.achievements.includes(ach.id)) return;

            let unlocked = false;
            if (ach.id === 'night_owl' && (hour >= 0 && hour < 5)) unlocked = true;
            if (ach.id === 'perfect_day') {
                const hadPerfectDay = historyValues.some(([date, stat]) => stat.total >= 3 && stat.done === stat.total);
                if (hadPerfectDay) unlocked = true;
            }
            if (ach.type === 'task_count' && totalTasksDone >= ach.goal) unlocked = true;
            if (ach.type === 'xp' && currentXP >= ach.goal) unlocked = true;
            if (ach.type === 'dream_count' && dreamCount >= ach.goal) unlocked = true;

            if (unlocked) {
                this.user.achievements.push(ach.id);
                this.showToast(`🏆 Conquista: ${ach.title}!`);
                changed = true;
            }
        });

        if (changed) this.saveData();
    },

    openAchievements() {
        this.renderAchievements();
        document.getElementById('achievements-modal').classList.add('active');
        this.closeSidebar();
    },

    closeAchievements() {
        document.getElementById('achievements-modal').classList.remove('active');
    },

    renderAchievements() {
        const list = document.getElementById('achievements-list');
        if (!list) return;

        list.innerHTML = '';
        this.achievementsList.forEach(ach => {
            const isUnlocked = this.user.achievements && this.user.achievements.includes(ach.id);
            
            // Se for secreta e não estiver desbloqueada, mostra como "Bloqueada"
            if (ach.hidden && !isUnlocked) {
                const card = document.createElement('div');
                card.className = `achievement-card locked-secret`;
                card.innerHTML = `
                    <div class="achievement-icon" style="filter: blur(4px);">🔒</div>
                    <div class="achievement-info">
                        <h4>???</h4>
                        <p>Segredo do Sentinel</p>
                    </div>
                `;
                list.appendChild(card);
                return;
            }

            const card = document.createElement('div');
            card.className = `achievement-card ${isUnlocked ? 'unlocked' : ''}`;
            
            card.innerHTML = `
                <div class="achievement-icon">${ach.icon}</div>
                <div class="achievement-info">
                    <h4>${ach.title}</h4>
                    <p>${ach.desc}</p>
                </div>
            `;
            list.appendChild(card);
        });
    },

    openStats() {
        this.renderStats();
        document.getElementById('stats-modal').classList.add('active');
        this.closeSidebar();
    },

    closeStats() {
        document.getElementById('stats-modal').classList.remove('active');
    },

    renderStats() {
        const content = document.getElementById('stats-content');
        if (!content) return;

        try {
            const historyObj = this.user.history || {};
            const history = Object.values(historyObj);
            
            const totalDone = history.reduce((acc, curr) => acc + (curr.done || 0), 0);
            const totalCreated = history.reduce((acc, curr) => acc + (curr.total || 0), 0);
            const successRate = totalCreated > 0 ? Math.round((totalDone / totalCreated) * 100) : 0;
            const daysActive = history.length;
            
            const rank = this.getRank() || { title: 'Agente', icon: 'ph-shield' };

            content.innerHTML = `
                <div class="stat-item">
                    <div class="stat-value">${totalDone}</div>
                    <div class="stat-label">Tarefas Concluídas</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${successRate}%</div>
                    <div class="stat-label">Sucesso Geral</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value">${daysActive}</div>
                    <div class="stat-label">Dias Ativos</div>
                </div>
                <div class="stat-item" style="grid-column: span 2; background: rgba(34, 197, 94, 0.1);">
                    <div class="stat-value" style="color: var(--primary); font-size: 1.1rem;">${rank.title || 'Agente'}</div>
                    <div class="stat-label">Patente Sentinel</div>
                </div>
            `;
        } catch (err) {
            console.error("Erro ao renderizar estatísticas:", err);
            content.innerHTML = `<div style="grid-column: span 2; padding: 20px; text-align: center; opacity: 0.7;">
                Relatório em andamento... complete mais tarefas para gerar dados!
            </div>`;
        }
    },

    // --- Core Logic ---
    getDailyData() {
        const dateStr = this.getDateString(this.currentDate);
        if (!this.data[dateStr]) {
            this.data[dateStr] = { lembretes: [], notas: [], avisos: [] };
        }
        return this.data[dateStr];
    },

    renderAll() {
        this.renderList('lembretes');
        this.renderList('notas');
        this.renderList('avisos');
        this.updateProgress();
    },

    filterItems(query) {
        this.searchTerm = query.toLowerCase().trim();
        this.renderAll();
    },

    renderList(category) {
        const container = document.getElementById(`list-${category}`);
        let items = this.getDailyData()[category];
        
        // Aplicar Filtro de Busca se houver
        if (this.searchTerm) {
            items = items.filter(item => 
                item.text.toLowerCase().includes(this.searchTerm)
            );
        }
        
        container.innerHTML = '';
        
        if (items.length === 0) {
            container.innerHTML = `<div class="empty-state">Nenhum item adicionado</div>`;
            return;
        }

        // Sort by 'isDone' (done items at bottom), then by priority
        const priorityOrder = { 'emergencia': 1, 'neutro': 2, 'tranquilo': 3 };
        const sortedItems = [...items].sort((a, b) => {
            if (a.isDone !== b.isDone) return a.isDone ? 1 : -1;
            return priorityOrder[a.priority] - priorityOrder[b.priority];
        });

        sortedItems.forEach(item => {
            const div = document.createElement('div');
            div.className = `item p-${item.priority} ${item.isDone ? 'done' : ''}`;
            
            const checkIcon = item.isDone ? 'ph-check-circle-fill' : 'ph-circle';
            const checkColor = item.isDone ? 'var(--color-tranquilo)' : 'currentColor';

            const timeBadge = item.time ? `<span class="item-time-badge"><i class="ph ph-clock"></i> ${item.time}</span>` : '';
            const tagBadge = item.tag ? `<span class="item-tag-badge">#${this.escapeHTML(item.tag)}</span>` : '';

            div.innerHTML = `
                <div class="item-content">
                    <div class="item-text">${this.escapeHTML(item.text)}</div>
                    <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:4px;">
                        <div class="item-badge">${item.priority}</div>
                        ${tagBadge}
                        ${timeBadge}
                    </div>
                </div>
                <div class="item-actions">
                    <button class="action-btn check" onclick="app.toggleDone('${category}', '${item.id}')" aria-label="Concluir" style="color: ${checkColor};">
                        <i class="ph ${checkIcon}"></i>
                    </button>
                    <button class="action-btn edit" onclick="app.editItem('${category}', '${item.id}')" aria-label="Editar">
                        <i class="ph ph-pencil-simple"></i>
                    </button>
                    <button class="action-btn delete" onclick="app.deleteItem('${category}', '${item.id}')" aria-label="Excluir">
                        <i class="ph ph-trash"></i>
                    </button>
                </div>
            `;
            container.appendChild(div);
        });
    },

    // --- Modal e Formulário ---
    openModal(category, itemId = null) {
        const modal = document.getElementById('item-modal');
        const form = document.getElementById('item-form');
        const title = document.getElementById('modal-title');
        
        form.reset();
        document.getElementById('item-category').value = category;
        document.getElementById('item-id').value = '';

        // Default priority based on category hints (optional UX improvement)
        if (!itemId) {
            if (category === 'lembretes') document.querySelector('input[value="neutro"]').checked = true;
            if (category === 'notas') document.querySelector('input[value="tranquilo"]').checked = true;
            if (category === 'avisos') document.querySelector('input[value="emergencia"]').checked = true;
        }

        title.textContent = itemId ? 'Editar Item' : `Novo(a) ${category.slice(0,-1)}`;

        document.getElementById('item-tag').value = '';

        if (itemId) {
            const item = this.getDailyData()[category].find(i => i.id === itemId);
            if (item) {
                document.getElementById('item-id').value = item.id;
                document.getElementById('item-text').value = item.text;
                document.getElementById('item-tag').value = item.tag || '';
                document.getElementById('item-time').value = item.time || '';
                document.querySelector(`input[name="priority"][value="${item.priority}"]`).checked = true;
            }
        }

        modal.classList.add('active');
        // Small delay for focus for better UX on mobile
        setTimeout(() => document.getElementById('item-text').focus(), 100);
    },

    closeModal() {
        const modal = document.getElementById('item-modal');
        modal.classList.remove('active');
    },

    saveItem(event) {
        event.preventDefault();
        
        const category = document.getElementById('item-category').value;
        const id = document.getElementById('item-id').value;
        const text = document.getElementById('item-text').value.trim();
        const tag = document.getElementById('item-tag').value.trim();
        const priority = document.querySelector('input[name="priority"]:checked').value;
        const time = document.getElementById('item-time').value;

        if (!text) return;

        const dailyData = this.getDailyData();

        if (id) {
            // Edit
            const itemIndex = dailyData[category].findIndex(i => i.id === id);
            if (itemIndex > -1) {
                // If time changed, reset the notified flag so it can ring again
                const oldItem = dailyData[category][itemIndex];
                const resetNotified = oldItem.time !== time ? false : oldItem.notified;
                
                dailyData[category][itemIndex] = { ...oldItem, text, tag, priority, time, notified: resetNotified };
                this.showToast('Item atualizado');
            }
        } else {
            // Add (Generate simple unique ID)
            const newId = Date.now().toString(36) + Math.random().toString(36).substr(2);
            dailyData[category].push({ id: newId, text, tag, priority, isDone: false, time, notified: false });
            this.showToast('Item adicionado');
        }

        this.saveData();
        this.renderAll();
        this.closeModal();
    },

    toggleDone(category, id) {
        const dailyData = this.getDailyData();
        const item = dailyData[category].find(i => i.id === id);
        if (item) {
            item.isDone = !item.isDone;
            
            // Gamification Rewards
            if (item.isDone) {
                const reward = item.priority === 'emergencia' ? 15 : item.priority === 'neutro' ? 10 : 5;
                this.addXP(reward);
            } else {
                const penalty = item.priority === 'emergencia' ? -15 : item.priority === 'neutro' ? -10 : -5;
                this.addXP(penalty); // Penalty for undoing
            }
            
            this.saveData();
            this.renderAll();
        }
    },

    deleteItem(category, id) {
        if (confirm('Tem certeza que deseja excluir este item?')) {
            const dailyData = this.getDailyData();
            dailyData[category] = dailyData[category].filter(i => i.id !== id);
            this.saveData();
            this.renderAll();
            this.showToast('Item excluído');
        }
    },

    // --- Utilidades ---
    escapeHTML(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },

    showToast(msg) {
        const toast = document.getElementById('toast');
        toast.textContent = msg;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    }
};

// Start app on load
document.addEventListener('DOMContentLoaded', () => app.init());
