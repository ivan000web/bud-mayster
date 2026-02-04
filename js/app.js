document.addEventListener('DOMContentLoaded', () => {
    const app = {
        repairRows: [], buildRows: [],
        isEditMode: false, isDarkMode: false,
        collapsedGroups: {},
        STORAGE_KEY: 'bud_app_v5',

        // Init
        init() {
            this.loadState();
            this.applyTheme();
            this.renderAll();
            this.bindEvents();
        },

        // --- Data ---
        allRows() { return [...this.repairRows, ...this.buildRows]; },
        getDoneRows() { return this.allRows().filter(r => r.done); },
        getNewId() { return (this.allRows().reduce((m, r) => Math.max(m, r.id || 0), 0)) + 1; },

        // --- State ---
        saveState() {
            const state = {
                repairRows: this.repairRows,
                buildRows: this.buildRows,
                collapsedGroups: this.collapsedGroups,
                isDarkMode: this.isDarkMode,
                lastSaved: new Date().toISOString()
            };
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(state));
        },

        loadState() {
            try {
                const data = JSON.parse(localStorage.getItem(this.STORAGE_KEY));
                if (data) {
                    this.repairRows = data.repairRows || [];
                    this.buildRows = data.buildRows || [];
                    this.collapsedGroups = data.collapsedGroups || {};
                    this.isDarkMode = !!data.isDarkMode;
                }
            } catch (e) { console.error(e); }
        },

        // --- Render ---
        renderAll() {
            const searchVal = document.getElementById('searchBox').value.toLowerCase();
            const filterType = document.getElementById('filterType').value;

            const filterFn = (r) => {
                const matchSearch = !searchVal || r.work.toLowerCase().includes(searchVal) || r.type.toLowerCase().includes(searchVal);
                const matchType = !filterType || r.type === filterType;
                return matchSearch && matchType;
            };

            this.renderTable('tableDone', this.getDoneRows(), true);
            this.renderTable('tableRepair', this.repairRows.filter(r => !r.done && filterFn(r)));
            this.renderTable('tableBuild', this.buildRows.filter(r => !r.done && filterFn(r)));

            this.updateTotals();
            this.updateUI();
            this.updateFilterOptions();
        },

        renderTable(tableId, data, isDoneTable = false) {
            const tbody = document.querySelector(`#${tableId} tbody`);
            tbody.innerHTML = '';

            if (isDoneTable) {
                if (data.length === 0) tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; opacity:0.5; padding:20px">Немає виконаних робіт</td></tr>`;
                else data.forEach(row => tbody.appendChild(this.createRow(row, true)));
            } else {
                // Grouping
                const groups = data.reduce((acc, row) => {
                    const t = row.type || 'Інше';
                    if (!acc[t]) acc[t] = [];
                    acc[t].push(row);
                    return acc;
                }, {});

                const sortedTypes = Object.keys(groups).sort();
                
                if (sortedTypes.length === 0) {
                     tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; opacity:0.5; padding:20px">Список порожній</td></tr>`;
                }

                sortedTypes.forEach(type => {
                    // Header
                    const trHeader = document.createElement('tr');
                    trHeader.className = 'group-header';
                    const isCollapsed = this.collapsedGroups[type];
                    trHeader.innerHTML = `<td colspan="6">${isCollapsed ? '▶' : '▼'} ${type} <span style="font-weight:400; opacity:0.6">(${groups[type].length})</span></td>`;
                    trHeader.onclick = () => {
                        this.collapsedGroups[type] = !this.collapsedGroups[type];
                        this.saveState();
                        this.renderAll();
                    };
                    tbody.appendChild(trHeader);

                    if (!isCollapsed) {
                        groups[type].forEach(row => tbody.appendChild(this.createRow(row, false)));
                    }
                });
            }
        },

        createRow(row, isDone) {
            const tr = document.createElement('tr');
            tr.dataset.id = row.id;
            tr.dataset.source = row.source;
            
            const editable = (this.isEditMode && !isDone) ? 'contenteditable="true"' : '';
            const sum = (row.price * row.qty).toFixed(2);

            tr.innerHTML = `
                <td><input type="checkbox" onchange="app.toggleDone(${row.id}, '${row.source}')" ${row.done ? 'checked' : ''}></td>
                <td ${editable} onblur="app.updateRow(${row.id}, 'work', this.innerText)">${row.work}</td>
                <td ${editable} onblur="app.updateRow(${row.id}, 'price', this.innerText)">${row.price}</td>
                <td><input type="number" value="${row.qty}" step="0.1" oninput="app.updateRow(${row.id}, 'qty', this.value)"></td>
                <td style="font-weight:bold">${sum}</td>
                <td class="col-del ${this.isEditMode && !isDone ? '' : 'hidden'}"><button class="delete-btn" onclick="app.deleteRow(${row.id}, '${row.source}')">×</button></td>
            `;
            return tr;
        },

        // --- Actions ---
        addNewRow(source) {
            const newRow = { id: this.getNewId(), work: 'Нова робота', type: 'Різне', unit: 'шт', price: 0, qty: 0, done: false, source };
            (source === 'repair' ? this.repairRows : this.buildRows).unshift(newRow);
            this.saveState();
            this.renderAll();
        },

        deleteRow(id, source) {
            if(!confirm('Видалити цей рядок?')) return;
            const arr = source === 'repair' ? this.repairRows : this.buildRows;
            const idx = arr.findIndex(r => r.id === id);
            if(idx > -1) { arr.splice(idx, 1); this.saveState(); this.renderAll(); }
        },

        updateRow(id, field, val) {
            const row = this.allRows().find(r => r.id === id);
            if (row) {
                row[field] = (field === 'price' || field === 'qty') ? (parseFloat(val) || 0) : val.trim();
                this.saveState();
                this.updateTotals();
                // Update sum visually without re-render entire table
                // Note: simplified, full render is safer
                this.renderAll(); 
            }
        },

        toggleDone(id, source) {
            const row = (source === 'repair' ? this.repairRows : this.buildRows).find(r => r.id === id);
            if (row) {
                row.done = !row.done;
                this.saveState();
                this.renderAll();
            }
        },

        importBase(overwrite) {
            if (!overwrite && !confirm('Додати 400+ позицій до вашого списку?')) return;
            if (overwrite && !confirm('УВАГА: Всі ваші дані будуть видалені і замінені базою. Продовжити?')) return;

            const baseData = typeof CATALOG_2026 !== 'undefined' ? CATALOG_2026 : [];
            let startId = this.getNewId();
            
            const prep = (arr) => arr.map(r => ({...r, id: startId++, done: false, qty: 0}));

            const newRepair = prep(baseData.filter(r => r.source !== 'build'));
            const newBuild = prep(baseData.filter(r => r.source === 'build'));

            if (overwrite) {
                this.repairRows = newRepair;
                this.buildRows = newBuild;
            } else {
                this.repairRows.push(...newRepair);
                this.buildRows.push(...newBuild);
            }

            document.getElementById('modalImport').style.display = 'none';
            this.saveState();
            this.renderAll();
            alert('Імпорт завершено!');
        },

        // --- UI Updates ---
        updateTotals() {
            const doneSum = this.getDoneRows().reduce((s, r) => s + (r.price * r.qty), 0);
            const planSum = this.allRows().filter(r => !r.done && r.qty > 0).reduce((s, r) => s + (r.price * r.qty), 0);
            
            document.getElementById('valDone').textContent = doneSum.toFixed(2) + ' ₴';
            document.getElementById('valPlan').textContent = planSum.toFixed(2) + ' ₴';
            document.getElementById('countDone').textContent = this.getDoneRows().length;
        },

        updateUI() {
            // Edit Mode
            const btnEdit = document.getElementById('btnEditMode');
            btnEdit.classList.toggle('active', this.isEditMode);
            
            // Show/Hide buttons
            const display = this.isEditMode ? 'inline-block' : 'none';
            document.getElementById('btnImportMenu').style.display = display;
            document.querySelectorAll('.add-btn').forEach(b => b.style.display = this.isEditMode ? 'block' : 'none');
            
            // Theme
            document.body.className = this.isDarkMode ? 'dark' : '';
        },

        updateFilterOptions() {
            const types = new Set(this.allRows().map(r => r.type).filter(Boolean));
            const select = document.getElementById('filterType');
            const current = select.value;
            select.innerHTML = '<option value="">Всі розділи</option>' + [...types].sort().map(t => `<option value="${t}">${t}</option>`).join('');
            select.value = current;
        },

        applyTheme() { document.body.className = this.isDarkMode ? 'dark' : ''; },

        // --- Events ---
        bindEvents() {
            // Edit Toggle
            document.getElementById('btnEditMode').onclick = () => {
                this.isEditMode = !this.isEditMode;
                this.renderAll();
            };

            // Theme Toggle
            document.getElementById('btnTheme').onclick = () => {
                this.isDarkMode = !this.isDarkMode;
                this.applyTheme();
                this.saveState();
            };

            // Import Menu
            document.getElementById('btnImportMenu').onclick = () => {
                document.getElementById('modalImport').style.display = 'flex';
            };

            // File Import
            document.getElementById('fileInput').onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (res) => {
                    try {
                        const data = JSON.parse(res.target.result);
                        if (data.repairRows) {
                            // Full restore
                            this.repairRows = data.repairRows;
                            this.buildRows = data.buildRows;
                            this.collapsedGroups = data.collapsedGroups || {};
                            this.saveState();
                            this.renderAll();
                            document.getElementById('modalImport').style.display = 'none';
                            alert('Дані відновлено!');
                        } else {
                            alert('Невірний формат файлу');
                        }
                    } catch(err) { alert('Помилка читання JSON'); }
                };
                reader.readAsText(file);
            };

            // Backup
            document.getElementById('btnBackup').onclick = () => {
                const data = { repairRows: this.repairRows, buildRows: this.buildRows, collapsedGroups: this.collapsedGroups };
                const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `bud_backup_${new Date().toISOString().slice(0,10)}.json`;
                a.click();
            };

            // Export CSV
            document.getElementById('btnExport').onclick = () => {
                const done = this.getDoneRows();
                if (!done.length) return alert('Немає виконаних робіт');
                let csv = "\uFEFFРозділ;Робота;Тип;Од.;Ціна;К-сть;Сума\n";
                done.forEach(r => {
                    const sec = r.source === 'repair' ? 'Ремонт' : 'Буд';
                    csv += `${sec};"${r.work}";"${r.type}";${r.unit};${r.price};${r.qty};${(r.price * r.qty).toFixed(2)}\n`;
                });
                const blob = new Blob([csv], {type: 'text/csv;charset=utf-8'});
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = 'koshtorys.csv';
                a.click();
            };

            // Search Live
            document.getElementById('searchBox').addEventListener('input', () => {
                this.renderAll();
            });
        }
    };

    // Global access for onclick handlers
    window.app = app;
    app.init();
});
