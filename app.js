/**
 * Engineering Quotation System - Main Application Logic
 */

const App = {
    data: {
        items: [],
        vendor: null,
        photos: []
    },

    config: {
        apiKey: localStorage.getItem('qs_api_key') || '',
        clientId: localStorage.getItem('qs_client_id') || '',
        sheetId: localStorage.getItem('qs_sheet_id') || '13_BUmVGUIbjEVNLouu2nn9fBRj92nlsHhnICMJp0cZI',
        discoveryDocs: ["https://sheets.googleapis.com/$discovery/rest?version=v4"],
        scopes: "https://www.googleapis.com/auth/spreadsheets"
    },

    tokenClient: null,
    isGapiLoaded: false,
    isGisLoaded: false,

    init() {
        this.cacheDOM();
        this.bindEvents();
        this.initTable();
        this.loadSettings();

        // Load Google APIs
        this.loadGapi();
        this.loadGis();

        // Set Default Date to Today
        document.getElementById('quote-date').valueAsDate = new Date();

        // Add one empty row by default
        this.addItemRow();

        // Explicitly force "Fit" mode on init (overriding browser form cache)
        const fitRadio = document.querySelector('input[name="print-scale"][value="fit"]');
        if (fitRadio) {
            fitRadio.checked = true;
            this.handleScaleChange('fit');
        }

        // Initial auto-fit calculation if selected
        if (document.querySelector('input[name="print-scale"][value="fit"]').checked) {
            setTimeout(() => this.calculateFitScale(), 500); // Delay for render
        }



        console.log('App Initialized');
    },



    cacheDOM() {
        this.dom = {
            // Buttons
            btnAddItem: document.getElementById('btn-add-item'),
            btnSave: document.getElementById('btn-save'),
            btnSettings: document.getElementById('btn-settings'),
            btnCloseSettings: document.querySelector('.close-modal'),
            btnSaveConfig: document.getElementById('btn-save-config'),
            btnBrowsePhoto: document.getElementById('btn-browse-photo'),

            // Inputs
            fileInput: document.getElementById('file-input'),
            itemsBody: document.getElementById('items-body'),
            vendorSelect: document.getElementById('vendor-select'),

            // Displays
            valSubtotal: document.getElementById('val-subtotal'),
            valTax: document.getElementById('val-tax'),
            valTotal: document.getElementById('val-total'),
            valTotalChinese: document.getElementById('val-total-chinese'),
            photoContainer: document.getElementById('photo-container'),

            // Config
            modal: document.getElementById('settings-modal'),
            inputApiKey: document.getElementById('config-api-key'),
            inputClientId: document.getElementById('config-client-id'), // New
            inputSheetId: document.getElementById('config-sheet-id'),

            // Print Scale
            radioScales: document.querySelectorAll('input[name="print-scale"]'),
            inputCustomScale: document.getElementById('custom-scale-input'),

            // Title Font Size
            inputTitleSize: document.getElementById('title-size-input'),
            valTitleSize: document.getElementById('title-size-val'),
            formTitle: document.querySelector('.form-title'),

        };
    },

    bindEvents() {
        this.dom.btnAddItem.addEventListener('click', () => this.addItemRow());
        this.dom.btnSave.addEventListener('click', () => this.saveToSheet());
        this.dom.btnSettings.addEventListener('click', () => this.dom.modal.classList.remove('hidden'));
        this.dom.btnCloseSettings.addEventListener('click', () => this.dom.modal.classList.add('hidden'));
        this.dom.btnSaveConfig.addEventListener('click', () => this.saveConfig());
        this.dom.btnBrowsePhoto.addEventListener('click', () => this.dom.fileInput.click());
        this.dom.fileInput.addEventListener('change', (e) => this.handlePhotoUpload(e));

        // Vendor Selection Logic
        this.dom.vendorSelect.addEventListener('change', (e) => {
            const index = e.target.value;
            if (index !== '' && this.data.vendors && this.data.vendors[index]) {
                const v = this.data.vendors[index];
                document.getElementById('v-name').textContent = v.name || '';
                document.getElementById('v-contact').textContent = v.contact || '';
                document.getElementById('v-mobile').textContent = v.mobile || '';
                document.getElementById('v-phone').textContent = v.phone || '';
                document.getElementById('v-fax').textContent = v.fax || '';
                document.getElementById('v-address').textContent = v.address || '';
                document.getElementById('v-email').textContent = v.email || '';

                const stampImg = document.getElementById('vendor-stamp');
                if (v.stamp) {
                    stampImg.src = v.stamp;
                    stampImg.classList.remove('hidden');
                    document.querySelector('.stamp-placeholder').classList.add('hidden');
                } else {
                    stampImg.classList.add('hidden');
                    document.querySelector('.stamp-placeholder').classList.remove('hidden');
                }
            } else {
                // Clear fields if no vendor selected
                // ... clearing logic ...
            }
        });

        // Print Scale Logic
        this.dom.radioScales.forEach(radio => {
            radio.addEventListener('change', (e) => this.handleScaleChange(e.target.value));
        });
        this.dom.inputCustomScale.addEventListener('input', (e) => this.updatePrintScale(e.target.value / 100));

        // Title Font Size Logic
        this.dom.inputTitleSize.addEventListener('input', (e) => {
            const size = e.target.value;
            this.dom.valTitleSize.textContent = size + 'px';
            this.dom.formTitle.style.fontSize = size + 'px';
        });



        // Recalculate Fit on resize
        window.addEventListener('resize', () => {
            if (this.isFitMode()) this.calculateFitScale();
        });

        // Delegate events for table inputs to recalculate
        this.dom.itemsBody.addEventListener('input', (e) => {
            if (e.target.matches('.calc-trigger')) {
                this.recalculate();
            }
        });

        // Delegate delete row
        this.dom.itemsBody.addEventListener('click', (e) => {
            if (e.target.closest('.btn-delete')) {
                const row = e.target.closest('tr');
                row.remove();
                this.reinitRowIndices();
                this.recalculate();
            }
        });

        // Delegate delete photo
        this.dom.photoContainer.addEventListener('click', (e) => {
            if (e.target.closest('.btn-delete-photo')) {
                e.target.closest('.photo-card').remove();
                this.updatePhotoVisibility();
            }
        });
    },

    initTable() {
        // Any initial table setup
    },

    addItemRow() {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="index-cell"></td>
            <td><input type="text" class="input-item" placeholder="品項名稱"></td>
            <td><input type="text" class="input-unit" placeholder="式"></td>
            <td><input type="number" class="input-qty calc-trigger" value="0"></td>
            <td><input type="number" class="input-price calc-trigger" value="0"></td>
            <td><input type="text" class="input-row-total" readonly value="0"></td>
            <td><input type="text" class="input-note"></td>
            <td class="no-print">
                <button class="btn btn-sm btn-outline" style="border-color: #e74c3c; color: #e74c3c">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        this.dom.itemsBody.appendChild(row);
        this.reinitRowIndices();
    },

    reinitRowIndices() {
        const rows = this.dom.itemsBody.querySelectorAll('tr');
        rows.forEach((row, index) => {
            row.querySelector('.index-cell').textContent = index + 1;
        });
    },

    recalculate() {
        let subtotal = 0;
        const rows = this.dom.itemsBody.querySelectorAll('tr');

        rows.forEach(row => {
            const qty = parseFloat(row.querySelector('.input-qty').value) || 0;
            const price = parseFloat(row.querySelector('.input-price').value) || 0;
            const total = Math.round(qty * price);

            row.querySelector('.input-row-total').value = total;
            subtotal += total;
        });

        const tax = Math.round(subtotal * 0.05);
        const total = subtotal + tax;

        this.dom.valSubtotal.textContent = subtotal.toLocaleString();
        this.dom.valTax.textContent = tax.toLocaleString();
        this.dom.valTotal.textContent = total.toLocaleString();
        this.dom.valTotalChinese.textContent = this.numberToChinese(total) + '整';

        if (this.isFitMode()) this.calculateFitScale();
    },

    isFitMode() {
        const fitRadio = document.querySelector('input[name="print-scale"][value="fit"]');
        return fitRadio && fitRadio.checked;
    },

    numberToChinese(n) {
        if (n === 0) return '零元';
        const fraction = ['角', '分'];
        const digit = ['零', '壹', '貳', '參', '肆', '伍', '陸', '柒', '捌', '玖'];
        const unit = [['元', '萬', '億'], ['', '拾', '佰', '仟']];
        const head = n < 0 ? '負' : '';
        n = Math.abs(n);
        let s = '';
        for (let i = 0; i < unit[0].length && n > 0; i++) {
            let p = '';
            for (let j = 0; j < unit[1].length && n > 0; j++) {
                p = digit[n % 10] + unit[1][j] + p;
                n = Math.floor(n / 10);
            }
            s = p.replace(/(零.)*零$/, '').replace(/^$/, '零') + unit[0][i] + s;
        }
        return head + s.replace(/(零.)*零元/, '元').replace(/(零.)+/g, '零').replace(/^整$/, '零元');
    },

    handlePhotoUpload(e) {
        const files = Array.from(e.target.files);
        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = (readerEvent) => {
                this.addPhotoCard(readerEvent.target.result);
            };
            reader.readAsDataURL(file);
        });
        // Reset input
        e.target.value = '';
    },

    addPhotoCard(imgSrc) {
        const card = document.createElement('div');
        card.className = 'photo-card';

        const img = document.createElement('img');
        img.src = imgSrc;
        // Ensure we calculate fit AFTER image loads and takes up space
        img.onload = () => {
            if (this.isFitMode()) this.calculateFitScale();
        };

        const btn = document.createElement('button');
        btn.className = 'no-print btn btn-sm btn-outline btn-delete-photo';
        btn.style.marginTop = '5px';
        btn.style.color = '#e74c3c';
        btn.style.borderColor = '#e74c3c';
        btn.textContent = '移除照片';

        card.appendChild(img);
        card.appendChild(btn);

        this.dom.photoContainer.appendChild(card);
        this.updatePhotoVisibility();

        // Fallback calculation just in case (e.g. cached images)
        setTimeout(() => {
            if (this.isFitMode()) this.calculateFitScale();
        }, 100);
    },

    updatePhotoVisibility() {
        // Toggle class on the section parent
        const section = document.querySelector('.photos-section');
        const count = this.dom.photoContainer.children.length;

        this.dom.photoContainer.dataset.count = count;

        if (count > 0) {
            section.classList.add('has-photos');
        } else {
            section.classList.remove('has-photos');
        }

        if (this.isFitMode()) this.calculateFitScale();
    },

    loadSettings() {
        this.dom.inputApiKey.value = this.config.apiKey;
        this.dom.inputClientId.value = this.config.clientId; // New
        this.dom.inputSheetId.value = this.config.sheetId;
    },

    saveConfig() {
        const key = this.dom.inputApiKey.value.trim();
        const client = this.dom.inputClientId.value.trim();
        const id = this.dom.inputSheetId.value.trim();

        if (!id) {
            alert('Spreadsheet ID 為必填');
            return;
        }

        localStorage.setItem('qs_api_key', key);
        localStorage.setItem('qs_client_id', client);
        localStorage.setItem('qs_sheet_id', id);

        this.config.apiKey = key;
        this.config.clientId = client;
        this.config.sheetId = id;

        this.dom.modal.classList.add('hidden');
        alert('設定已儲存');

        // Init GIS with new client ID
        this.loadGis();

        // Try initial auth/fetch
        if (client) {
            this.handleAuthClick();
        }
    },

    handleScaleChange(mode) {
        this.dom.inputCustomScale.style.display = (mode === 'custom') ? 'inline-block' : 'none';

        if (mode === '100') {
            this.updatePrintScale(1);
        } else if (mode === 'fit') {
            this.calculateFitScale();
        } else if (mode === 'custom') {
            this.updatePrintScale(this.dom.inputCustomScale.value / 100);
        }
    },

    calculateFitScale() {
        // A4 Height approx 1123px at 96dpi. Safe area about 1050px.
        // We calculate ratio based on Total Content Height vs Page Height
        const pageContainer = document.querySelector('.page-container');
        const contentHeight = pageContainer.scrollHeight; // Full height
        const a4Height = 1080; // Leaving some margin

        let scale = 1;
        if (contentHeight > a4Height) {
            scale = a4Height / contentHeight;
        }
        // Lower bound 0.5 to avoid too small
        scale = Math.max(0.4, scale);

        this.updatePrintScale(scale);
        console.log('Auto Fit Scale:', scale);
    },

    updatePrintScale(scale) {
        document.body.style.setProperty('--print-zoom', scale);
    },

    // --- Google Sheets Integration ---

    loadGapi() {
        gapi.load('client', async () => {
            try {
                await gapi.client.init({
                    discoveryDocs: this.config.discoveryDocs,
                });
                this.isGapiLoaded = true;
                console.log('GAPI Client Initialized (Discovery Docs Loaded)');
            } catch (err) {
                console.error('Error initializing GAPI client:', err);
                alert('GAPI 初始化失敗，請檢查網路連線');
            }
        });
    },

    loadGis() {
        try {
            this.tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: this.config.clientId,
                scope: this.config.scopes,
                callback: '', // defined at request time
            });
            this.isGisLoaded = true;
            console.log('GIS loaded');
        } catch (e) {
            console.warn('GIS init failed (maybe missing Client ID)');
        }
    },

    async handleAuthClick() {
        if (!this.config.clientId) {
            alert('請先在設定中輸入 Google Client ID');
            this.dom.modal.classList.remove('hidden');
            return;
        }

        // Re-init if needed (in case config changed)
        if (!this.tokenClient) this.loadGis();

        return new Promise((resolve, reject) => {
            this.tokenClient.callback = async (resp) => {
                if (resp.error) {
                    reject(resp);
                }
                resolve(resp);
                // Load data after auth
                await this.fetchSheetData();
            };

            if (gapi.client.getToken() === null) {
                // Prompt the user to select a Google Account and ask for consent to share their data
                this.tokenClient.requestAccessToken({ prompt: 'consent' });
            } else {
                // Skip display of account chooser and consent dialog for an existing session
                this.tokenClient.requestAccessToken({ prompt: '' });
                resolve(); // Already has token
            }
        });
    },

    async fetchSheetData() {
        if (!this.config.sheetId) return;

        try {
            // Load Vendors
            const vParams = {
                spreadsheetId: this.config.sheetId,
                range: 'Vendors!A2:H',
            };
            const vResp = await gapi.client.sheets.spreadsheets.values.get(vParams);
            this.populateVendors(vResp.result.values);

            // Load Customers
            const cParams = {
                spreadsheetId: this.config.sheetId,
                range: 'Customers!A2:D',
            };
            const cResp = await gapi.client.sheets.spreadsheets.values.get(cParams);
            this.populateCustomers(cResp.result.values);

            alert('Google Sheets 資料已同步！');

        } catch (err) {
            console.error('Fetch Error:', err);
            alert('讀取 Google Sheets 失敗: ' + (err.result?.error?.message || err.message));
        }
    },

    populateVendors(rows) {
        if (!rows || rows.length === 0) return;
        this.dom.vendorSelect.innerHTML = '<option value="">-- 請選擇廠商 --</option>';

        // Cache vendor data
        this.data.vendors = rows.map(r => ({
            name: r[0],
            contact: r[1],
            mobile: r[2],
            phone: r[3],
            fax: r[4],
            address: r[5],
            email: r[6],
            stamp: r[7]
        }));

        this.data.vendors.forEach((v, index) => {
            const opt = document.createElement('option');
            opt.value = index;
            opt.textContent = v.name;
            this.dom.vendorSelect.appendChild(opt);
        });
    },

    populateCustomers(rows) {
        if (!rows || rows.length === 0) return;
        const datalist = document.getElementById('customer-list');
        datalist.innerHTML = '';

        rows.forEach(r => {
            const opt = document.createElement('option');
            opt.value = r[0]; // Name
            datalist.appendChild(opt);
        });
        // We could also cache full customer details if needed
    },

    async ensureGapiClient() {
        if (this.isGapiLoaded && gapi.client.sheets) return true;
        console.log('Waiting for sheets api...');
        for (let i = 0; i < 20; i++) {
            if (this.isGapiLoaded && gapi.client.sheets) return true;
            await new Promise(r => setTimeout(r, 500));
        }
        throw new Error('Google API Client 初始化失敗');
    },

    async saveToSheet() {
        if (!this.config.sheetId) return;

        try {
            await this.ensureGapiClient();

            // Check Auth
            if (gapi.client.getToken() === null) {
                await this.handleAuthClick();
            }

            const custName = document.getElementById('cust-name').value.trim();
            const custContact = document.getElementById('cust-contact').value.trim();
            const custPhone = document.getElementById('cust-phone').value.trim();

            if (!custName) {
                alert('請輸入客戶名稱');
                return;
            }

            // 1. Check & Save New Customer
            if (this.data.customers && !this.data.customers.includes(custName)) {
                // Append Object: Name, Contact, Phone, Address(Empty)
                const newCustRow = [custName, custContact, custPhone, ''];
                await gapi.client.sheets.spreadsheets.values.append({
                    spreadsheetId: this.config.sheetId,
                    range: 'Customers!A:A',
                    valueInputOption: 'USER_ENTERED',
                    resource: { values: [newCustRow] }
                });
                console.log('New customer saved:', custName);
                // Update Cache
                this.data.customers.push(custName);
                const dl = document.getElementById('customer-list');
                const opt = document.createElement('option');
                opt.value = custName;
                dl.appendChild(opt);
            }

            // 2. Prepare Quotation Data
            const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const qId = 'Q' + dateStr + '-' + Math.floor(Math.random() * 1000).toString().padStart(3, '0');

            const qRow = [
                qId,
                document.getElementById('quote-date').value,
                custName,
                document.getElementById('project-name').value,
                custContact,
                custPhone,
                this.dom.valTotal.textContent.replace(/,/g, ''),
                this.dom.vendorSelect.options[this.dom.vendorSelect.selectedIndex]?.text || '',
                document.getElementById('quote-notes').value
            ];

            const itemRows = [];
            const itemTrs = this.dom.itemsBody.querySelectorAll('tr');
            itemTrs.forEach(tr => {
                // Skip empty rows
                if (!tr.querySelector('.input-item').value.trim()) return;

                itemRows.push([
                    qId,
                    tr.querySelector('.input-item').value,
                    tr.querySelector('.input-unit').value,
                    tr.querySelector('.input-qty').value,
                    tr.querySelector('.input-price').value,
                    tr.querySelector('.input-row-total').value,
                    tr.querySelector('.input-note').value
                ]);
            });

            // Append to Quotations
            await gapi.client.sheets.spreadsheets.values.append({
                spreadsheetId: this.config.sheetId,
                range: 'Quotations!A:A',
                valueInputOption: 'USER_ENTERED',
                resource: { values: [qRow] }
            });

            // Append to Quotation_Items
            if (itemRows.length > 0) {
                await gapi.client.sheets.spreadsheets.values.append({
                    spreadsheetId: this.config.sheetId,
                    range: 'Quotation_Items!A:A',
                    valueInputOption: 'USER_ENTERED',
                    resource: { values: itemRows }
                });
            }

            alert(`報價單已儲存！單號：${qId}\n(若為新客戶已自動新增至資料庫)`);

        } catch (err) {
            console.error('Save Error:', err);
            alert('儲存失敗: ' + (err.result?.error?.message || err.message));
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
