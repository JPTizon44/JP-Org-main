const app = {
    currentDate: new Date(),
    data: {}, // { 'YYYY-MM-DD': { lembretes: [], notas: [], avisos: [] } }

    init() {
        this.loadData();
        this.setupCalendar();
        this.checkNotificationStatus();
        this.renderAll();
        
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
        const currentTimeString = now.toTimeString().slice(0, 5); // HH:MM
        
        // Only trigger alarms for 'today' based on the system date
        if (!this.data[currentDateString]) return;
        const todayData = this.data[currentDateString];
        
        ['lembretes', 'notas', 'avisos'].forEach(cat => {
            const items = todayData[cat];
            items.forEach(item => {
                // If it has a time, is not done, and the time matches now, and hasn't been notified yet
                if (item.time && !item.isDone && item.time === currentTimeString && !item.notified) {
                    this.triggerNotification(cat, item);
                    item.notified = true; // mark as notified so it doesn't ring every 30 secs
                    this.saveData();
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

    // --- Persistência (localStorage) ---
    loadData() {
        const stored = localStorage.getItem('daySyncData');
        if (stored) {
            this.data = JSON.parse(stored);
        }
    },

    saveData() {
        localStorage.setItem('daySyncData', JSON.stringify(this.data));
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
