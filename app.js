/* ============================
   LENDVISTA — App Logic
   ============================ */

(function () {
    'use strict';

    // ===== STATE =====
    const state = {
        currentStep: 0,
        metadata: {},
        personal: {},
        financial: {},
        documents: { id: null, income: null },
        extractedData: { id: null, income: null },
        score: 0,
        loanAmount: 0,
    };

    const STEPS = ['step-landing', 'step-personal', 'step-financial', 'step-documents', 'step-processing', 'step-results'];
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    const ALLOWED_TYPES_ID = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
    const ALLOWED_TYPES_INCOME = ['application/pdf', 'image/jpeg', 'image/png'];
    const MAX_SCORE = 850;
    const MIN_SCORE = 300;
    const BASE_MAX_LOAN = 50000;

    // ===== DOM REFS =====
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    // ===== INIT =====
    document.addEventListener('DOMContentLoaded', () => {
        collectMetadata();
        createParticles();
        bindEvents();
    });

    // ========================================
    //  METADATA COLLECTION
    // ========================================
    function collectMetadata() {
        const nav = navigator;
        const screen = window.screen;
        const conn = nav.connection || nav.mozConnection || nav.webkitConnection;

        state.metadata = {
            // Browser & OS
            userAgent: nav.userAgent,
            platform: nav.platform || 'unknown',
            language: nav.language || 'unknown',
            languages: nav.languages ? [...nav.languages] : [],
            cookiesEnabled: nav.cookieEnabled,
            doNotTrack: nav.doNotTrack,

            // Screen
            screenWidth: screen.width,
            screenHeight: screen.height,
            screenColorDepth: screen.colorDepth,
            devicePixelRatio: window.devicePixelRatio || 1,

            // Timezone
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            timezoneOffset: new Date().getTimezoneOffset(),

            // Hardware
            hardwareConcurrency: nav.hardwareConcurrency || 'unknown',
            deviceMemory: nav.deviceMemory || 'unknown',
            maxTouchPoints: nav.maxTouchPoints || 0,

            // Connection
            connectionType: conn ? conn.effectiveType : 'unknown',
            connectionDownlink: conn ? conn.downlink : 'unknown',

            // Referrer
            referrer: document.referrer || 'direct',

            // Timestamp
            visitTimestamp: new Date().toISOString(),
            visitTimestampLocal: new Date().toLocaleString(),

            // Window
            windowWidth: window.innerWidth,
            windowHeight: window.innerHeight,

            // Feature detection
            hasWebGL: !!document.createElement('canvas').getContext('webgl'),
            hasServiceWorker: 'serviceWorker' in nav,
            hasNotifications: 'Notification' in window,
        };

        console.log('[LendVista] Metadata collected:', state.metadata);
    }

    // ========================================
    //  PARTICLES
    // ========================================
    function createParticles() {
        const container = $('#bgParticles');
        if (!container) return;
        for (let i = 0; i < 6; i++) {
            const p = document.createElement('div');
            p.classList.add('particle');
            const size = 200 + Math.random() * 400;
            p.style.width = size + 'px';
            p.style.height = size + 'px';
            p.style.left = Math.random() * 100 + '%';
            p.style.top = Math.random() * 100 + '%';
            p.style.animationDelay = (Math.random() * 10) + 's';
            p.style.animationDuration = (15 + Math.random() * 15) + 's';
            container.appendChild(p);
        }
    }

    // ========================================
    //  NAVIGATION
    // ========================================
    function goToStep(index) {
        if (index < 0 || index >= STEPS.length) return;

        $$('.step').forEach(s => s.classList.remove('active'));
        const target = $(`#${STEPS[index]}`);
        target.classList.add('active');
        state.currentStep = index;

        // Progress bar
        const navProgress = $('#navProgress');
        const fill = $('#progressFill');
        const label = $('#progressLabel');

        if (index === 0) {
            navProgress.classList.remove('visible');
        } else if (index < 5) {
            navProgress.classList.add('visible');
            fill.style.width = `${(index / 4) * 100}%`;
            label.textContent = `Step ${index} of 4`;
        } else {
            navProgress.classList.remove('visible');
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // ========================================
    //  EVENT BINDINGS
    // ========================================
    function bindEvents() {
        // Landing → Personal
        $('#btnGetStarted').addEventListener('click', () => goToStep(1));

        // Personal → Landing
        $('#btnBackToLanding').addEventListener('click', () => goToStep(0));

        // Personal form submit
        $('#formPersonal').addEventListener('submit', (e) => {
            e.preventDefault();
            if (validatePersonalForm()) {
                capturePersonalData();
                goToStep(2);
            }
        });

        // Financial → Personal
        $('#btnBackToPersonal').addEventListener('click', () => goToStep(1));

        // Financial form submit → go to Documents (step 3)
        $('#formFinancial').addEventListener('submit', (e) => {
            e.preventDefault();
            if (validateFinancialForm()) {
                captureFinancialData();
                goToStep(3);
            }
        });

        // Documents → Financial
        $('#btnBackToFinancial').addEventListener('click', () => goToStep(2));

        // Documents → Processing
        $('#btnToProcessing').addEventListener('click', () => {
            goToStep(4);
            runProcessingAnimation();
        });

        // Upload zone bindings
        setupUploadZone('Id');
        setupUploadZone('Income');

        // Start over
        $('#btnStartOver').addEventListener('click', () => {
            resetApp();
        });

        // Apply now (mock)
        $('#btnApplyNow').addEventListener('click', () => {
            alert('Thank you for your interest! In a production environment, this would redirect you to the full application flow.');
        });

        // Real-time validation — clear errors on input
        $$('.form-input').forEach(input => {
            input.addEventListener('input', () => {
                const group = input.closest('.form-group');
                if (group) group.classList.remove('has-error');
            });
        });

        // Radio cards — clear error
        $$('.radio-card input').forEach(radio => {
            radio.addEventListener('change', () => {
                const group = radio.closest('.form-group');
                if (group) group.classList.remove('has-error');
            });
        });
    }

    // ========================================
    //  FILE UPLOAD HANDLING
    // ========================================
    function setupUploadZone(type) {
        const zone = $(`#uploadZone${type}`);
        const fileInput = $(`#fileInput${type}`);
        const removeBtn = $(`#removeFile${type}`);

        // Click on zone triggers file input
        zone.addEventListener('click', (e) => {
            if (e.target.closest('.upload-remove-btn')) return;
            // The native file input handles clicks because it overlays the zone
        });

        // Drag and drop
        zone.addEventListener('dragover', (e) => {
            e.preventDefault();
            zone.classList.add('dragover');
        });

        zone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            zone.classList.remove('dragover');
        });

        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            zone.classList.remove('dragover');
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                handleFileSelect(files[0], type);
            }
        });

        // File input change
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleFileSelect(e.target.files[0], type);
            }
        });

        // Remove button
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            removeFile(type);
        });
    }

    function handleFileSelect(file, type) {
        const allowedTypes = type === 'Id' ? ALLOWED_TYPES_ID : ALLOWED_TYPES_INCOME;
        const errorEl = $(`#uploadError${type}`);

        // Clear previous error
        errorEl.classList.remove('visible');
        errorEl.textContent = '';

        // Validate file type
        if (!allowedTypes.includes(file.type)) {
            errorEl.textContent = `Invalid file type. Accepted: ${type === 'Id' ? 'PDF, JPG, PNG' : 'PDF, JPG, PNG'}`;
            errorEl.classList.add('visible');
            return;
        }

        // Validate file size
        if (file.size > MAX_FILE_SIZE) {
            errorEl.textContent = `File too large. Maximum size is 10MB.`;
            errorEl.classList.add('visible');
            return;
        }

        // Process the file
        processUploadedFile(file, type);
    }

    function processUploadedFile(file, type) {
        const zone = $(`#uploadZone${type}`);
        const content = $(`#uploadContent${type}`);
        const fileInfo = $(`#fileInfo${type}`);
        const fileName = $(`#fileName${type}`);
        const fileSize = $(`#fileSize${type}`);
        const fileTypeTag = $(`#fileTypeTag${type}`);
        const fileSizeTag = $(`#fileSizeTag${type}`);

        // Store in state
        const docKey = type === 'Id' ? 'id' : 'income';
        state.documents[docKey] = {
            name: file.name,
            size: file.size,
            type: file.type,
            lastModified: new Date(file.lastModified).toISOString(),
        };

        // Update UI
        content.style.display = 'none';
        fileInfo.style.display = 'flex';
        zone.classList.add('has-file');

        fileName.textContent = file.name;
        fileSize.textContent = formatFileSize(file.size);

        // File type tag
        const ext = file.name.split('.').pop().toUpperCase();
        fileTypeTag.textContent = ext;
        fileSizeTag.textContent = formatFileSize(file.size);

        // Extract data from the file
        extractFileData(file, type);

        // Check if both documents are uploaded
        updateContinueButton();

        console.log(`[LendVista] ${type} document uploaded:`, state.documents[docKey]);
    }

    function removeFile(type) {
        const zone = $(`#uploadZone${type}`);
        const content = $(`#uploadContent${type}`);
        const fileInfo = $(`#fileInfo${type}`);
        const fileInput = $(`#fileInput${type}`);
        const errorEl = $(`#uploadError${type}`);

        // Clear state
        const docKey = type === 'Id' ? 'id' : 'income';
        state.documents[docKey] = null;

        // Reset UI
        content.style.display = 'flex';
        fileInfo.style.display = 'none';
        zone.classList.remove('has-file');
        fileInput.value = '';
        errorEl.classList.remove('visible');
        errorEl.textContent = '';

        updateContinueButton();
    }

    function updateContinueButton() {
        const btn = $('#btnToProcessing');
        const bothUploaded = state.documents.id !== null && state.documents.income !== null;
        btn.disabled = !bothUploaded;
    }

    function formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    // ========================================
    //  FILE DATA EXTRACTION
    // ========================================
    async function extractFileData(file, type) {
        const docKey = type === 'Id' ? 'id' : 'income';
        const extracted = {
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
            lastModified: new Date(file.lastModified).toLocaleDateString(),
            textContent: '',
            parsedData: {},
        };

        try {
            if (file.type === 'application/pdf') {
                extracted.textContent = await extractPdfText(file);
            } else if (file.type.startsWith('image/')) {
                const imgMeta = await extractImageMetadata(file);
                extracted.imageWidth = imgMeta.width;
                extracted.imageHeight = imgMeta.height;
                extracted.textContent = ''; // No text from images without OCR
            }

            // Parse the text for relevant data
            if (extracted.textContent) {
                extracted.parsedData = parseDocumentText(extracted.textContent, type);
            }

            // Add file metadata to parsed data
            extracted.parsedData.fileName = file.name;
            extracted.parsedData.fileFormat = file.name.split('.').pop().toUpperCase();
            extracted.parsedData.fileSize = formatFileSize(file.size);
            extracted.parsedData.lastModified = extracted.lastModified;
            if (extracted.imageWidth) {
                extracted.parsedData.dimensions = `${extracted.imageWidth} × ${extracted.imageHeight}px`;
            }

        } catch (err) {
            console.warn(`[LendVista] Extraction error for ${type}:`, err);
            extracted.parsedData.fileName = file.name;
            extracted.parsedData.fileFormat = file.name.split('.').pop().toUpperCase();
            extracted.parsedData.fileSize = formatFileSize(file.size);
        }

        state.extractedData[docKey] = extracted;
        console.log(`[LendVista] Extracted data for ${type}:`, extracted);
    }

    function extractPdfText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async function (e) {
                try {
                    const typedArray = new Uint8Array(e.target.result);
                    const pdfjsLib = window['pdfjs-dist/build/pdf'] || window.pdfjsLib;

                    if (!pdfjsLib) {
                        resolve('');
                        return;
                    }

                    // Set worker source
                    pdfjsLib.GlobalWorkerOptions.workerSrc =
                        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

                    const pdf = await pdfjsLib.getDocument({ data: typedArray }).promise;
                    let fullText = '';

                    const maxPages = Math.min(pdf.numPages, 5); // Limit to 5 pages
                    for (let i = 1; i <= maxPages; i++) {
                        const page = await pdf.getPage(i);
                        const textContent = await page.getTextContent();
                        const pageText = textContent.items.map(item => item.str).join(' ');
                        fullText += pageText + '\n';
                    }

                    resolve(fullText.trim());
                } catch (err) {
                    console.warn('[LendVista] PDF parsing error:', err);
                    resolve('');
                }
            };
            reader.onerror = () => resolve('');
            reader.readAsArrayBuffer(file);
        });
    }

    function extractImageMetadata(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = function (e) {
                const img = new Image();
                img.onload = () => {
                    resolve({ width: img.width, height: img.height });
                };
                img.onerror = () => resolve({ width: 0, height: 0 });
                img.src = e.target.result;
            };
            reader.onerror = () => resolve({ width: 0, height: 0 });
            reader.readAsDataURL(file);
        });
    }

    function parseDocumentText(text, type) {
        const data = {};
        if (!text || text.length < 5) return data;

        // Normalize whitespace
        const normalized = text.replace(/\s+/g, ' ').trim();

        // --- Common extractions ---

        // Full names (capitalized words, 2-4 parts)
        const namePatterns = [
            /(?:name|nombre|nom)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/i,
            /(?:issued to|applicant|holder)[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})/i,
        ];
        for (const pat of namePatterns) {
            const match = normalized.match(pat);
            if (match) { data.name = match[1].trim(); break; }
        }

        // Dates (various formats)
        const datePatterns = [
            /(?:date of birth|dob|birth date|fecha)[:\s]+(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,
            /(?:issue date|issued|date)[:\s]+(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,
            /(?:expir(?:y|ation)|exp\.? date|valid until|vencimiento)[:\s]+(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i,
            /(\d{2}[\/-]\d{2}[\/-]\d{4})/,
        ];

        const dates = [];
        for (const pat of datePatterns) {
            const match = normalized.match(pat);
            if (match) dates.push(match[1]);
        }
        if (dates.length > 0) data.dates = [...new Set(dates)];

        // Expiry date specifically
        const expiryMatch = normalized.match(/(?:expir(?:y|ation)|exp\.? date|valid until|vencimiento)[:\s]+(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})/i);
        if (expiryMatch) data.expiryDate = expiryMatch[1];

        // Document / ID numbers
        const idPatterns = [
            /(?:document|license|id|passport|no\.?|number|num\.?|#)[:\s]*([A-Z0-9]{5,20})/i,
            /\b([A-Z]{1,3}\d{5,12})\b/,
        ];
        for (const pat of idPatterns) {
            const match = normalized.match(pat);
            if (match) { data.documentNumber = match[1]; break; }
        }

        // Address
        const addressMatch = normalized.match(/(?:address|domicilio|direcci[oó]n)[:\s]+(.{10,80}?)(?=\.|,\s*[A-Z]|$)/i);
        if (addressMatch) data.address = addressMatch[1].trim();

        // --- Type-specific extractions ---
        if (type === 'Id') {
            // Nationality / country
            const nationalityMatch = normalized.match(/(?:nationality|country|nation|pa[ií]s)[:\s]+([A-Za-z\s]{2,30})/i);
            if (nationalityMatch) data.nationality = nationalityMatch[1].trim();

            // Gender
            const genderMatch = normalized.match(/(?:sex|gender|sexo)[:\s]+(male|female|m|f|masculino|femenino)/i);
            if (genderMatch) data.gender = genderMatch[1];

        } else if (type === 'Income') {
            // Dollar amounts
            const amounts = [];
            const amountRegex = /\$[\s]?([\d,]+(?:\.\d{2})?)/g;
            let amtMatch;
            while ((amtMatch = amountRegex.exec(normalized)) !== null) {
                const val = parseFloat(amtMatch[1].replace(/,/g, ''));
                if (!isNaN(val) && val > 0) amounts.push(val);
            }

            // Also try plain number amounts near keywords
            const incomeKeywords = /(?:gross|net|total|salary|income|earnings|pay|compensation|wages)[:\s]*\$?([\d,]+(?:\.\d{2})?)/gi;
            let kwMatch;
            while ((kwMatch = incomeKeywords.exec(normalized)) !== null) {
                const val = parseFloat(kwMatch[1].replace(/,/g, ''));
                if (!isNaN(val) && val > 0) amounts.push(val);
            }

            if (amounts.length > 0) {
                const unique = [...new Set(amounts)].sort((a, b) => b - a);
                data.amounts = unique.slice(0, 5);
                data.largestAmount = unique[0];
            }

            // Employer name
            const employerMatch = normalized.match(/(?:employer|company|organization|empresa|from)[:\s]+([A-Z][\w\s&.,]{2,40})/i);
            if (employerMatch) data.employer = employerMatch[1].trim();

            // Pay period
            const periodMatch = normalized.match(/(?:pay period|period|per[ií]odo)[:\s]+(.{5,40}?)(?=\s*\||$|\n)/i);
            if (periodMatch) data.payPeriod = periodMatch[1].trim();
        }

        // Count total text characters as data quality indicator
        data.textLength = text.length;
        data.wordCount = text.split(/\s+/).filter(w => w.length > 1).length;

        return data;
    }

    // ========================================
    //  RENDER DOCUMENT DATA
    // ========================================
    function renderDocumentData() {
        const card = $('#documentDataCard');
        const grid = $('#docDataGrid');
        grid.innerHTML = '';

        const idData = state.extractedData.id;
        const incomeData = state.extractedData.income;

        if (!idData && !incomeData) {
            card.style.display = 'none';
            return;
        }

        card.style.display = 'block';

        // ID Document Section
        const idSection = document.createElement('div');
        idSection.className = 'doc-data-section';
        idSection.innerHTML = `<div class="doc-data-section-header"><span class="doc-header-dot id-dot"></span>Government ID</div>`;

        if (idData) {
            const idRows = buildDataRows(idData.parsedData, 'id');
            idRows.forEach(row => idSection.appendChild(row));
        } else {
            idSection.innerHTML += '<div class="doc-data-empty">No ID document uploaded</div>';
        }

        // Income Section
        const incomeSection = document.createElement('div');
        incomeSection.className = 'doc-data-section';
        incomeSection.innerHTML = `<div class="doc-data-section-header"><span class="doc-header-dot income-dot"></span>Income Statement</div>`;

        if (incomeData) {
            const incomeRows = buildDataRows(incomeData.parsedData, 'income');
            incomeRows.forEach(row => incomeSection.appendChild(row));
        } else {
            incomeSection.innerHTML += '<div class="doc-data-empty">No income document uploaded</div>';
        }

        grid.appendChild(idSection);
        grid.appendChild(incomeSection);
    }

    function buildDataRows(parsed, docType) {
        const rows = [];

        const createRow = (icon, label, value, valueClass = '') => {
            const div = document.createElement('div');
            div.className = 'doc-data-row';
            div.innerHTML = `
                <span class="doc-data-label"><span class="data-icon">${icon}</span>${label}</span>
                <span class="doc-data-value${valueClass ? ' ' + valueClass : ''}">${value}</span>
            `;
            return div;
        };

        // File metadata (always shown)
        if (parsed.fileName) rows.push(createRow('📄', 'File Name', parsed.fileName));
        if (parsed.fileFormat) rows.push(createRow('📋', 'Format', parsed.fileFormat));
        if (parsed.fileSize) rows.push(createRow('💾', 'File Size', parsed.fileSize));
        if (parsed.lastModified) rows.push(createRow('📅', 'Last Modified', parsed.lastModified));
        if (parsed.dimensions) rows.push(createRow('📐', 'Dimensions', parsed.dimensions));

        // Extracted text data
        if (parsed.name) rows.push(createRow('👤', 'Name Detected', parsed.name, 'highlight'));
        if (parsed.documentNumber) rows.push(createRow('🔑', 'Document No.', parsed.documentNumber, 'highlight'));
        if (parsed.nationality) rows.push(createRow('🌍', 'Nationality', parsed.nationality));
        if (parsed.gender) rows.push(createRow('👤', 'Gender', parsed.gender));
        if (parsed.address) rows.push(createRow('📍', 'Address', parsed.address));

        if (parsed.dates && parsed.dates.length > 0) {
            rows.push(createRow('📅', 'Date(s) Found', parsed.dates.join(', ')));
        }
        if (parsed.expiryDate) rows.push(createRow('⏳', 'Expiry Date', parsed.expiryDate));

        // Income-specific
        if (parsed.employer) rows.push(createRow('🏢', 'Employer', parsed.employer, 'highlight'));
        if (parsed.payPeriod) rows.push(createRow('📆', 'Pay Period', parsed.payPeriod));
        if (parsed.largestAmount) {
            rows.push(createRow('💰', 'Largest Amount', '$' + parsed.largestAmount.toLocaleString(), 'amount'));
        }
        if (parsed.amounts && parsed.amounts.length > 1) {
            const otherAmounts = parsed.amounts.slice(1, 4).map(a => '$' + a.toLocaleString()).join(', ');
            rows.push(createRow('💵', 'Other Amounts', otherAmounts));
        }

        // Data quality
        if (parsed.wordCount && parsed.wordCount > 0) {
            rows.push(createRow('📊', 'Words Extracted', parsed.wordCount.toLocaleString()));
        } else if (docType === 'id' || docType === 'income') {
            rows.push(createRow('ℹ️', 'Text Extraction', 'No text found (image-based)'));
        }

        return rows;
    }

    // ========================================
    //  FORM VALIDATION
    // ========================================
    function showError(inputId) {
        const group = $(`#${inputId}`).closest('.form-group');
        if (group) group.classList.add('has-error');
    }

    function clearErrors(formId) {
        $$(`#${formId} .form-group`).forEach(g => g.classList.remove('has-error'));
    }

    function validatePersonalForm() {
        clearErrors('formPersonal');
        let valid = true;

        const fullName = $('#fullName').value.trim();
        if (!fullName || fullName.length < 2) { showError('fullName'); valid = false; }

        const age = parseInt($('#age').value);
        if (!age || age < 18 || age > 100) { showError('age'); valid = false; }

        const phone = $('#phone').value.trim();
        if (!phone || phone.length < 7) { showError('phone'); valid = false; }

        const email = $('#email').value.trim();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!email || !emailRegex.test(email)) { showError('email'); valid = false; }

        const employment = $('#employment').value;
        if (!employment) { showError('employment'); valid = false; }

        const education = $('#education').value;
        if (!education) { showError('education'); valid = false; }

        return valid;
    }

    function validateFinancialForm() {
        clearErrors('formFinancial');
        let valid = true;

        const income = parseFloat($('#income').value);
        if (isNaN(income) || income < 0) { showError('income'); valid = false; }

        const expenses = parseFloat($('#expenses').value);
        if (isNaN(expenses) || expenses < 0) { showError('expenses'); valid = false; }

        const debt = parseFloat($('#existingDebt').value);
        if (isNaN(debt) || debt < 0) { showError('existingDebt'); valid = false; }

        const creditHistory = document.querySelector('input[name="creditHistory"]:checked');
        if (!creditHistory) {
            const group = $('#creditHistory').closest('.form-group');
            if (group) group.classList.add('has-error');
            valid = false;
        }

        const purpose = $('#loanPurpose').value;
        if (!purpose) { showError('loanPurpose'); valid = false; }

        return valid;
    }

    // ========================================
    //  DATA CAPTURE
    // ========================================
    function capturePersonalData() {
        state.personal = {
            fullName: $('#fullName').value.trim(),
            age: parseInt($('#age').value),
            phone: $('#phone').value.trim(),
            email: $('#email').value.trim(),
            employment: $('#employment').value,
            education: $('#education').value,
        };
    }

    function captureFinancialData() {
        state.financial = {
            income: parseFloat($('#income').value),
            expenses: parseFloat($('#expenses').value),
            existingDebt: parseFloat($('#existingDebt').value),
            creditHistory: document.querySelector('input[name="creditHistory"]:checked').value,
            loanPurpose: $('#loanPurpose').value,
        };
    }

    // ========================================
    //  CREDIT SCORING ENGINE
    // ========================================
    function calculateCreditScore() {
        const p = state.personal;
        const f = state.financial;
        const m = state.metadata;

        // --- 1) Income-to-Debt Ratio (30%) ---
        let incomeDebtScore = 0;
        const monthlyNet = f.income - f.expenses;
        const debtToIncomeRatio = f.income > 0 ? f.existingDebt / (f.income * 12) : 999;

        if (monthlyNet > 2000 && debtToIncomeRatio < 0.2) incomeDebtScore = 100;
        else if (monthlyNet > 1000 && debtToIncomeRatio < 0.35) incomeDebtScore = 80;
        else if (monthlyNet > 500 && debtToIncomeRatio < 0.5) incomeDebtScore = 60;
        else if (monthlyNet > 0 && debtToIncomeRatio < 0.7) incomeDebtScore = 40;
        else if (monthlyNet > 0) incomeDebtScore = 25;
        else incomeDebtScore = 10;

        // --- 2) Employment Stability (20%) ---
        const employmentScores = {
            'full-time': 100,
            'self-employed': 80,
            'part-time': 60,
            'freelancer': 55,
            'retired': 70,
            'student': 35,
            'unemployed': 15,
        };
        const employmentScore = employmentScores[p.employment] || 30;

        // --- 3) Credit History (25%) ---
        const creditHistoryScores = {
            'excellent': 100,
            'good': 80,
            'fair': 55,
            'poor': 25,
            'none': 40,
        };
        const creditHistoryScore = creditHistoryScores[f.creditHistory] || 40;

        // --- 4) Demographics (10%) ---
        let demoScore = 50;

        // Age factor
        if (p.age >= 30 && p.age <= 55) demoScore += 20;
        else if (p.age >= 25 && p.age <= 65) demoScore += 10;
        else if (p.age >= 18 && p.age < 25) demoScore += 0;
        else demoScore -= 5;

        // Education factor
        const eduScores = {
            'doctorate': 30,
            'master': 25,
            'bachelor': 20,
            'associate': 15,
            'high-school': 5,
            'other': 10,
        };
        demoScore += eduScores[p.education] || 5;
        demoScore = Math.min(100, Math.max(0, demoScore));

        // --- 5) Digital Footprint (10%) ---
        let digitalScore = 50;

        // Modern browser
        if (m.hasWebGL) digitalScore += 10;
        if (m.hasServiceWorker) digitalScore += 5;

        // Good hardware
        if (m.hardwareConcurrency !== 'unknown' && m.hardwareConcurrency >= 4) digitalScore += 10;
        if (m.deviceMemory !== 'unknown' && m.deviceMemory >= 4) digitalScore += 5;

        // Connection quality
        const connScores = { '4g': 15, '3g': 8, '2g': 2, 'slow-2g': 0, 'unknown': 5 };
        digitalScore += connScores[m.connectionType] || 5;

        // Screen resolution
        if (m.screenWidth >= 1920) digitalScore += 5;
        else if (m.screenWidth >= 1280) digitalScore += 3;

        digitalScore = Math.min(100, Math.max(0, digitalScore));

        // --- 6) Document Verification (5%) ---
        let documentScore = 0;
        if (state.documents.id && state.documents.income) {
            documentScore = 100; // Both documents uploaded
        } else if (state.documents.id || state.documents.income) {
            documentScore = 50; // Only one document
        }

        // --- WEIGHTED TOTAL ---
        const weightedTotal =
            (incomeDebtScore * 0.30) +
            (employmentScore * 0.20) +
            (creditHistoryScore * 0.25) +
            (demoScore * 0.10) +
            (digitalScore * 0.10) +
            (documentScore * 0.05);

        // Map 0–100 to 300–850
        const score = Math.round(MIN_SCORE + (weightedTotal / 100) * (MAX_SCORE - MIN_SCORE));

        state.score = Math.min(MAX_SCORE, Math.max(MIN_SCORE, score));

        // Loan amount
        const scorePct = (state.score - MIN_SCORE) / (MAX_SCORE - MIN_SCORE);
        state.loanAmount = Math.round(scorePct * BASE_MAX_LOAN / 100) * 100;

        // Save breakdown for display
        state.breakdown = {
            incomeDebt: incomeDebtScore,
            employment: employmentScore,
            creditHistory: creditHistoryScore,
            demographics: demoScore,
            digitalFootprint: digitalScore,
            documentVerification: documentScore,
        };

        console.log('[LendVista] Score calculated:', {
            score: state.score,
            loan: state.loanAmount,
            breakdown: state.breakdown,
        });
    }

    // ========================================
    //  PROCESSING ANIMATION
    // ========================================
    function runProcessingAnimation() {
        const steps = ['proc1', 'proc2', 'proc3', 'proc4', 'proc5', 'proc6'];
        let i = 0;

        function activateStep() {
            if (i > 0) {
                $(`#${steps[i - 1]}`).classList.remove('active');
                $(`#${steps[i - 1]}`).classList.add('done');
            }
            if (i < steps.length) {
                $(`#${steps[i]}`).classList.add('active');
                i++;
                setTimeout(activateStep, 700 + Math.random() * 500);
            } else {
                // All done — calculate score & show results
                calculateCreditScore();
                setTimeout(() => {
                    goToStep(5);
                    renderResults();
                    // Reset processing state for potential re-run
                    steps.forEach(s => {
                        $(`#${s}`).classList.remove('active', 'done');
                    });
                }, 600);
            }
        }

        activateStep();
    }

    // ========================================
    //  RENDER RESULTS
    // ========================================
    function renderResults() {
        animateGauge();
        animateOffer();
        renderBreakdown();
        renderDocumentData();
        renderMetaTags();
        spawnConfetti();
    }

    function animateGauge() {
        const scorePct = (state.score - MIN_SCORE) / (MAX_SCORE - MIN_SCORE);
        const totalArc = 251.2; // arc length of the gauge path
        const offset = totalArc * (1 - scorePct);

        const gaugeFill = $('#gaugeFill');
        const gaugeScore = $('#gaugeScore');
        const scoreRating = $('#scoreRating');

        // Animate the arc
        requestAnimationFrame(() => {
            gaugeFill.style.strokeDashoffset = offset;
        });

        // Animate the number
        animateNumber(gaugeScore, 0, state.score, 2000);

        // Rating label
        let rating = '';
        let ratingClass = '';
        if (state.score >= 750) { rating = 'Excellent'; ratingClass = 'excellent'; }
        else if (state.score >= 670) { rating = 'Good'; ratingClass = 'good'; }
        else if (state.score >= 580) { rating = 'Fair'; ratingClass = 'fair'; }
        else if (state.score >= 450) { rating = 'Poor'; ratingClass = 'poor'; }
        else { rating = 'Needs Work'; ratingClass = 'very-poor'; }

        setTimeout(() => {
            scoreRating.textContent = rating;
            scoreRating.className = 'score-rating ' + ratingClass;
        }, 1000);
    }

    function animateOffer() {
        const offerEl = $('#offerAmount');
        animateNumber(offerEl, 0, state.loanAmount, 2000, true);

        // APR based on score
        const scorePct = (state.score - MIN_SCORE) / (MAX_SCORE - MIN_SCORE);
        const apr = (18 - scorePct * 13).toFixed(1); // 5% to 18%
        const term = state.loanAmount > 25000 ? '60 mo' : state.loanAmount > 10000 ? '48 mo' : '36 mo';
        const termMonths = parseInt(term);
        const monthlyRate = parseFloat(apr) / 100 / 12;
        const monthly = monthlyRate > 0
            ? (state.loanAmount * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -termMonths))
            : state.loanAmount / termMonths;

        setTimeout(() => {
            $('#offerAPR').textContent = apr + '%';
            $('#offerTerm').textContent = term;
            $('#offerMonthly').textContent = '$' + Math.round(monthly).toLocaleString();
        }, 1200);
    }

    function animateNumber(el, start, end, duration, comma = false) {
        const startTime = performance.now();

        function tick(now) {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // Ease out cubic
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = Math.round(start + (end - start) * eased);
            el.textContent = comma ? current.toLocaleString() : current;
            if (progress < 1) requestAnimationFrame(tick);
        }

        requestAnimationFrame(tick);
    }

    function renderBreakdown() {
        const grid = $('#breakdownGrid');
        grid.innerHTML = '';

        const items = [
            { name: 'Income & Debt Ratio', score: state.breakdown.incomeDebt, weight: '30%', color: '#6366f1' },
            { name: 'Employment Stability', score: state.breakdown.employment, weight: '20%', color: '#8b5cf6' },
            { name: 'Credit History', score: state.breakdown.creditHistory, weight: '25%', color: '#a855f7' },
            { name: 'Demographics', score: state.breakdown.demographics, weight: '10%', color: '#d946ef' },
            { name: 'Digital Footprint', score: state.breakdown.digitalFootprint, weight: '10%', color: '#ec4899' },
            { name: 'Document Verification', score: state.breakdown.documentVerification, weight: '5%', color: '#14b8a6' },
        ];

        items.forEach((item, i) => {
            const div = document.createElement('div');
            div.className = 'breakdown-item';
            div.innerHTML = `
                <div class="breakdown-label">
                    <span class="breakdown-name">${item.name} (${item.weight})</span>
                    <span class="breakdown-score">${item.score}/100</span>
                </div>
                <div class="breakdown-bar">
                    <div class="breakdown-bar-fill" style="background: ${item.color};" data-width="${item.score}"></div>
                </div>
            `;
            grid.appendChild(div);

            // Animate bar with delay
            setTimeout(() => {
                div.querySelector('.breakdown-bar-fill').style.width = item.score + '%';
            }, 400 + i * 200);
        });
    }

    function renderMetaTags() {
        const container = $('#metaTags');
        container.innerHTML = '';

        const m = state.metadata;
        const tags = [
            { icon: '🌐', text: `Browser: ${getBrowserName(m.userAgent)}` },
            { icon: '🖥️', text: `Screen: ${m.screenWidth}×${m.screenHeight}` },
            { icon: '🕐', text: `Timezone: ${m.timezone}` },
            { icon: '🌍', text: `Language: ${m.language}` },
            { icon: '📡', text: `Connection: ${m.connectionType}` },
            { icon: '⚙️', text: `CPU Cores: ${m.hardwareConcurrency}` },
            { icon: '💾', text: `Memory: ${m.deviceMemory !== 'unknown' ? m.deviceMemory + 'GB' : 'N/A'}` },
            { icon: '👆', text: `Touch: ${m.maxTouchPoints > 0 ? 'Yes' : 'No'}` },
            { icon: '🔗', text: `Referrer: ${m.referrer === '' || m.referrer === 'direct' ? 'Direct' : new URL(m.referrer).hostname}` },
            { icon: '🍪', text: `Cookies: ${m.cookiesEnabled ? 'Enabled' : 'Disabled'}` },
            { icon: '🎨', text: `Color: ${m.screenColorDepth}-bit` },
            { icon: '📐', text: `DPR: ${m.devicePixelRatio}` },
        ];

        // Add document verification tags
        if (state.documents.id) {
            tags.push({ icon: '🪪', text: `ID: ${state.documents.id.name}` });
        }
        if (state.documents.income) {
            tags.push({ icon: '📄', text: `Income: ${state.documents.income.name}` });
        }
        if (state.extractedData.id?.parsedData?.wordCount > 0) {
            tags.push({ icon: '🔍', text: `ID Words: ${state.extractedData.id.parsedData.wordCount}` });
        }
        if (state.extractedData.income?.parsedData?.wordCount > 0) {
            tags.push({ icon: '🔍', text: `Income Words: ${state.extractedData.income.parsedData.wordCount}` });
        }
        if (state.extractedData.income?.parsedData?.largestAmount) {
            tags.push({ icon: '💰', text: `Detected: $${state.extractedData.income.parsedData.largestAmount.toLocaleString()}` });
        }

        tags.forEach(tag => {
            const el = document.createElement('span');
            el.className = 'meta-tag';
            el.innerHTML = `<span class="meta-tag-icon">${tag.icon}</span>${tag.text}`;
            container.appendChild(el);
        });
    }

    function getBrowserName(ua) {
        if (ua.includes('Firefox')) return 'Firefox';
        if (ua.includes('Edg')) return 'Edge';
        if (ua.includes('Chrome')) return 'Chrome';
        if (ua.includes('Safari')) return 'Safari';
        if (ua.includes('Opera') || ua.includes('OPR')) return 'Opera';
        return 'Unknown';
    }

    // ========================================
    //  CONFETTI
    // ========================================
    function spawnConfetti() {
        const container = $('#confetti');
        if (!container) return;
        container.innerHTML = '';

        const colors = ['#6366f1', '#a855f7', '#ec4899', '#10b981', '#f59e0b', '#ef4444'];

        for (let i = 0; i < 50; i++) {
            const piece = document.createElement('div');
            piece.className = 'confetti-piece';
            piece.style.background = colors[Math.floor(Math.random() * colors.length)];
            piece.style.left = Math.random() * 100 + '%';
            piece.style.top = '-10px';
            piece.style.animationDelay = (Math.random() * 1) + 's';
            piece.style.animationDuration = (2 + Math.random() * 2) + 's';
            piece.style.width = (6 + Math.random() * 6) + 'px';
            piece.style.height = (6 + Math.random() * 6) + 'px';
            piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
            container.appendChild(piece);
        }

        // Clean up confetti after animation
        setTimeout(() => { container.innerHTML = ''; }, 5000);
    }

    // ========================================
    //  RESET
    // ========================================
    function resetApp() {
        // Clear forms
        $('#formPersonal').reset();
        $('#formFinancial').reset();

        // Clear errors
        $$('.form-group').forEach(g => g.classList.remove('has-error'));

        // Reset upload zones
        removeFile('Id');
        removeFile('Income');

        // Reset extracted data
        state.extractedData = { id: null, income: null };
        $('#documentDataCard').style.display = 'none';
        $('#docDataGrid').innerHTML = '';

        // Reset gauge
        $('#gaugeFill').style.strokeDashoffset = '251.2';
        $('#gaugeScore').textContent = '0';
        $('#scoreRating').textContent = '—';
        $('#scoreRating').className = 'score-rating';
        $('#offerAmount').textContent = '0';
        $('#offerAPR').textContent = '—';
        $('#offerTerm').textContent = '—';
        $('#offerMonthly').textContent = '—';

        // Reset state
        state.personal = {};
        state.financial = {};
        state.documents = { id: null, income: null };
        state.score = 0;
        state.loanAmount = 0;
        state.breakdown = {};

        goToStep(0);
    }

})();
