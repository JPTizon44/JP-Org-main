const app = {
    currentDate: new Date(),
    data: {}, // { 'YYYY-MM-DD': { lembretes: [], notas: [], avisos: [] } }
    user: { xp: 0, dreams: [] }, // User Profile settings for Gamification

    init() {
        this.loadData();
        this.setupCalendar();
        this.setupSidebar();
        this.checkNotificationStatus();
        this.renderAll();
        this.renderDreams();
        
        // Setup local alarm checking every 30 seconds
        setInterval(() => this.checkAlarms(), 30000);
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
                registration.showNotification(`${iconHtml} JP SENTINEL`, options);
            });
        } else {
            new Notification(`${iconHtml} JP SENTINEL`, options);
        }
    },

    // --- Sidebar (Menu Hambúrguer) ---
    setupSidebar() {
        const btnMenu = document.getElementById('btn-menu');
        const btnClose = document.getElementById('btn-close-menu');
        const sidebar = document.getElementById('sidebar-menu');
        const backdrop = document.getElementById('sidebar-backdrop');
        
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
        if (level < 10) return { title: 'Recruta Sentinel', icon: 'ph-shield' };
        if (level < 20) return { title: 'Agente Operacional', icon: 'ph-shield-check' };
        if (level < 30) return { title: 'Especialista Tático', icon: 'ph-target' };
        if (level < 50) return { title: 'Comandante', icon: 'ph-shield-star' };
        if (level < 75) return { title: 'Elite Sentinel', icon: 'ph-lightning' };
        if (level < 100) return { title: 'Mestre Guardião', icon: 'ph-crown' };
        return { title: 'Lenda Sentinel', icon: 'ph-shooting-star' };
    },

    updateProfileUI() {
        const xp = this.user.xp || 0;
        const level = Math.floor(xp / 100) + 1; // 1 level per 100 XP
        const currentLevelXp = xp % 100;
        const xpRequired = 100; // Target to next level
        
        const rank = this.getRankConfig(level);
        document.querySelector('.user-title').innerHTML = `<i class="ph ${rank.icon}"></i> ${rank.title}`;

        const progressPercent = (currentLevelXp / xpRequired) * 100;

        document.getElementById('user-level').textContent = level;
        document.getElementById('user-xp').textContent = xp;
        document.getElementById('xp-target').textContent = xpRequired * level;
        document.getElementById('level-progress-fill').style.width = `${progressPercent}%`;

        // Optional: Update text occasionally
        const msgEl = document.getElementById('level-msg');
        msgEl.textContent = `Patente: ${rank.title}`;
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
        const text = prompt('Qual é o seu Grande Objetivo de Vida? (Ex: Comprar Casa, Viajar o Mundo, Carro dos Sonhos)');
        if (text && text.trim()) {
            if (!this.user.dreams) this.user.dreams = [];
            const newId = Date.now().toString(36) + Math.random().toString(36).substr(2);
            this.user.dreams.push({ id: newId, text: text.trim() });
            this.saveData();
            this.renderDreams();
            this.showToast('Objetivo salvo! Mantenha o foco.');
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
        
        const dreams = this.user.dreams || [];
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

    // --- Persistência (localStorage) ---
    loadData() {
        const stored = localStorage.getItem('daySyncData');
        if (stored) {
            this.data = JSON.parse(stored);
        }
        
        const storedUser = localStorage.getItem('userSentinel');
        if (storedUser) {
            this.user = JSON.parse(storedUser);
        }
    },

    saveData() {
        localStorage.setItem('daySyncData', JSON.stringify(this.data));
        localStorage.setItem('userSentinel', JSON.stringify(this.user));
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
        } else if (done === total) {
            progressEl.textContent = '🎉 Todas as tarefas concluídas!';
        } else {
            progressEl.textContent = `${done} de ${total} tarefas concluídas`;
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

    renderList(category) {
        const container = document.getElementById(`list-${category}`);
        const items = this.getDailyData()[category];
        
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

            div.innerHTML = `
                <div class="item-content">
                    <div class="item-text">${this.escapeHTML(item.text)}</div>
                    <div class="item-badge">${item.priority}</div>
                    ${timeBadge}
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

        if (itemId) {
            const item = this.getDailyData()[category].find(i => i.id === itemId);
            if (item) {
                document.getElementById('item-id').value = item.id;
                document.getElementById('item-text').value = item.text;
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
                
                dailyData[category][itemIndex] = { ...oldItem, text, priority, time, notified: resetNotified };
                this.showToast('Item atualizado');
            }
        } else {
            // Add (Generate simple unique ID)
            const newId = Date.now().toString(36) + Math.random().toString(36).substr(2);
            dailyData[category].push({ id: newId, text, priority, isDone: false, time, notified: false });
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
