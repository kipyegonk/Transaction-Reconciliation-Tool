class ReconciliationTool {
    constructor() {
        this.currentResults = null; 
        this.initializeEventListeners();
    }

    initializeEventListeners() {
        
        document.getElementById('internalFile').addEventListener('change', (e) => {
            this.handleFileSelect(e, 'internalFileName');
        });

        document.getElementById('providerFile').addEventListener('change', (e) => {
            this.handleFileSelect(e, 'providerFileName');
        });

        
        document.getElementById('reconcileForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.processReconciliation();
        });
    }

    handleFileSelect(event, fileNameElementId) {
        const file = event.target.files[0];
        const fileNameElement = document.getElementById(fileNameElementId);
        
        if (file) {
            fileNameElement.textContent = `Selected: ${file.name}`;
            fileNameElement.style.color = '#27ae60';
        } else {
            fileNameElement.textContent = '';
        }
    }

    async parseCSV(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const text = e.target.result;
                    const lines = text.split('\n').filter(line => line.trim());
                    
                    if (lines.length < 2) {
                        reject(new Error('CSV file must have at least a header and one data row'));
                        return;
                    }

                    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
                    const data = [];

                    for (let i = 1; i < lines.length; i++) {
                        const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
                        if (values.length === headers.length) {
                            const row = {};
                            headers.forEach((header, index) => {
                                row[header] = values[index];
                            });
                            data.push(row);
                        }
                    }

                    resolve(data);
                } catch (error) {
                    reject(new Error('Failed to parse CSV file: ' + error.message));
                }
            };
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }

    reconcileTransactions(internalData, providerData) {
        const results = {
            matched: [],
            mismatched: [],
            internal_only: [],
            provider_only: [],
            summary: {}
        };

        const internalMap = new Map();
        const providerMap = new Map();

        // Process internal data
        internalData.forEach(row => {
            const ref = (row.transaction_reference || row.reference || row.id || '').toString().trim();
            if (ref) {
                internalMap.set(ref, row);
            }
        });

        // Process provider data
        providerData.forEach(row => {
            const ref = (row.transaction_reference || row.reference || row.id || '').toString().trim();
            if (ref) {
                providerMap.set(ref, row);
            }
        });

        // Find matches and categorize
        for (const [ref, internalTxn] of internalMap) {
            if (providerMap.has(ref)) {
                const providerTxn = providerMap.get(ref);
                
                const internalAmount = parseFloat(internalTxn.amount || 0);
                const providerAmount = parseFloat(providerTxn.amount || 0);
                const amountMatch = Math.abs(internalAmount - providerAmount) < 0.01;
                
                const internalStatus = (internalTxn.status || '').toLowerCase().trim();
                const providerStatus = (providerTxn.status || '').toLowerCase().trim();
                const statusMatch = internalStatus === providerStatus;

                const matchData = {
                    transaction_reference: ref,
                    internal: internalTxn,
                    provider: providerTxn,
                    amount_match: amountMatch,
                    status_match: statusMatch,
                    fully_matched: amountMatch && statusMatch
                };

                if (matchData.fully_matched) {
                    results.matched.push(matchData);
                } else {
                    results.mismatched.push(matchData);
                }
            } else {
                results.internal_only.push(internalTxn);
            }
        }

        // Find provider-only transactions
        for (const [ref, providerTxn] of providerMap) {
            if (!internalMap.has(ref)) {
                results.provider_only.push(providerTxn);
            }
        }

        // Calculate summary
        results.summary = {
            total_internal: internalData.length,
            total_provider: providerData.length,
            matched_count: results.matched.length,
            mismatched_count: results.mismatched.length,
            internal_only_count: results.internal_only.length,
            provider_only_count: results.provider_only.length
        };

        return results;
    }

    async processReconciliation() {
        const internalFile = document.getElementById('internalFile').files[0];
        const providerFile = document.getElementById('providerFile').files[0];

        if (!internalFile || !providerFile) {
            this.showError('Please select both CSV files');
            return;
        }

        try {
            this.showLoading(true);
            this.hideError();
            this.hideResults();

            // Parse CSV files
            const internalData = await this.parseCSV(internalFile);
            const providerData = await this.parseCSV(providerFile);

            if (internalData.length === 0 || providerData.length === 0) {
                throw new Error('One or both CSV files are empty');
            }

            // Perform reconciliation
            const results = this.reconcileTransactions(internalData, providerData);
            
            // Store results for export functionality
            this.currentResults = results;

            // Display results
            this.displayResults(results);

        } catch (error) {
            this.showError(error.message);
        } finally {
            this.showLoading(false);
        }
    }

    showLoading(show) {
        const loadingSection = document.getElementById('loadingSection');
        const reconcileBtn = document.getElementById('reconcileBtn');
        
        loadingSection.style.display = show ? 'block' : 'none';
        reconcileBtn.disabled = show;
        reconcileBtn.textContent = show ? '🔄 Processing...' : '🚀 Start Reconciliation';
    }

    showError(message) {
        const errorSection = document.getElementById('errorSection');
        const errorMessage = document.getElementById('errorMessage');
        
        errorMessage.textContent = message;
        errorSection.style.display = 'block';
    }

    hideError() {
        document.getElementById('errorSection').style.display = 'none';
    }

    hideResults() {
        document.getElementById('resultsSection').style.display = 'none';
    }

    getStatusBadge(status) {
        const statusLower = status.toLowerCase();
        let badgeClass = 'status-badge ';
        
        if (statusLower.includes('complete') || statusLower.includes('success')) {
            badgeClass += 'status-completed';
        } else if (statusLower.includes('pending') || statusLower.includes('processing')) {
            badgeClass += 'status-pending';
        } else if (statusLower.includes('failed') || statusLower.includes('error')) {
            badgeClass += 'status-failed';
        } else {
            badgeClass += 'status-pending';
        }
        
        return `<span class="${badgeClass}">${status}</span>`;
    }

    // CSV Export Functions
    convertToCSV(data, type) {
        if (!data || data.length === 0) {
            return 'No data available for export';
        }

        let headers = [];
        let rows = [];

        switch (type) {
            case 'matched':
                headers = ['Transaction Reference', 'Amount', 'Status', 'Date', 'Match Type'];
                rows = data.map(match => [
                    match.transaction_reference || '',
                    parseFloat(match.internal.amount || 0).toFixed(2),
                    match.internal.status || '',
                    match.internal.date || '',
                    'Perfect Match'
                ]);
                break;

            case 'mismatched':
                headers = ['Transaction Reference', 'Internal Amount', 'Provider Amount', 'Internal Status', 'Provider Status', 'Amount Match', 'Status Match'];
                rows = data.map(match => [
                    match.transaction_reference || '',
                    parseFloat(match.internal.amount || 0).toFixed(2),
                    parseFloat(match.provider.amount || 0).toFixed(2),
                    match.internal.status || '',
                    match.provider.status || '',
                    match.amount_match ? 'Yes' : 'No',
                    match.status_match ? 'Yes' : 'No'
                ]);
                break;

            case 'internal_only':
                headers = ['Transaction Reference', 'Amount', 'Status', 'Date', 'Source'];
                rows = data.map(txn => [
                    txn.transaction_reference || txn.reference || txn.id || '',
                    parseFloat(txn.amount || 0).toFixed(2),
                    txn.status || '',
                    txn.date || '',
                    'Internal System Only'
                ]);
                break;

            case 'provider_only':
                headers = ['Transaction Reference', 'Amount', 'Status', 'Date', 'Source'];
                rows = data.map(txn => [
                    txn.transaction_reference || txn.reference || txn.id || '',
                    parseFloat(txn.amount || 0).toFixed(2),
                    txn.status || '',
                    txn.date || '',
                    'Provider Statement Only'
                ]);
                break;

            default:
                return 'Invalid export type';
        }

        // Escape values that contain commas or quotes
        const escapeCSVValue = (value) => {
            const stringValue = value.toString();
            if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
                return `"${stringValue.replace(/"/g, '""')}"`;
            }
            return stringValue;
        };

        const csvContent = [
            headers.map(escapeCSVValue).join(','),
            ...rows.map(row => row.map(escapeCSVValue).join(','))
        ].join('\n');

        return csvContent;
    }

    downloadCSV(csvContent, filename) {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        
        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', filename);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }
    }

    exportCategory(category) {
        if (!this.currentResults) {
            alert('No results available for export. Please run reconciliation first.');
            return;
        }

        const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
        let data, filename, displayName;

        switch (category) {
            case 'matched':
                data = this.currentResults.matched;
                filename = `perfect-matches-${timestamp}.csv`;
                displayName = 'Perfect Matches';
                break;
            case 'mismatched':
                data = this.currentResults.mismatched;
                filename = `mismatched-transactions-${timestamp}.csv`;
                displayName = 'Mismatched Transactions';
                break;
            case 'internal_only':
                data = this.currentResults.internal_only;
                filename = `internal-only-${timestamp}.csv`;
                displayName = 'Internal Only Transactions';
                break;
            case 'provider_only':
                data = this.currentResults.provider_only;
                filename = `provider-only-${timestamp}.csv`;
                displayName = 'Provider Only Transactions';
                break;
            default:
                alert('Invalid category for export');
                return;
        }

        if (data.length === 0) {
            alert(`No ${displayName.toLowerCase()} found to export.`);
            return;
        }

        const csvContent = this.convertToCSV(data, category);
        this.downloadCSV(csvContent, filename);
        
        // Show success message
        this.showExportSuccess(displayName, data.length);
    }

    showExportSuccess(categoryName, recordCount) {
        // Create a temporary success message
        const successDiv = document.createElement('div');
        successDiv.className = 'export-success';
        successDiv.innerHTML = `
            <div style="
                background: linear-gradient(135deg, #27ae60, #2ecc71);
                color: white;
                padding: 15px 20px;
                border-radius: 10px;
                margin: 10px 0;
                text-align: center;
                box-shadow: 0 5px 15px rgba(39, 174, 96, 0.3);
                animation: slideIn 0.3s ease;
            ">
                ✅ Successfully exported ${recordCount} ${categoryName.toLowerCase()} records!
            </div>
        `;

       
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateY(-20px); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);

       
        const resultsSection = document.getElementById('resultsSection');
        resultsSection.insertBefore(successDiv, resultsSection.firstChild);

        // Remove the message after 3 seconds
        setTimeout(() => {
            if (successDiv.parentNode) {
                successDiv.parentNode.removeChild(successDiv);
            }
        }, 3000);
    }

    displayResults(results) {
        const resultsSection = document.getElementById('resultsSection');
        
        const html = `
            <div class="results-section">
                <h2>📊 Reconciliation Results</h2>
                
                <!-- Summary Cards -->
                <div class="summary-cards">
                    <div class="summary-card matched">
                        <h3>✅ Perfect Matches</h3>
                        <div class="count">${results.summary.matched_count}</div>
                    </div>
                    <div class="summary-card mismatched">
                        <h3>⚠️ Mismatched</h3>
                        <div class="count">${results.summary.mismatched_count}</div>
                    </div>
                    <div class="summary-card discrepancy">
                        <h3>📋 Internal Only</h3>
                        <div class="count">${results.summary.internal_only_count}</div>
                    </div>
                    <div class="summary-card discrepancy">
                        <h3>🏦 Provider Only</h3>
                        <div class="count">${results.summary.provider_only_count}</div>
                    </div>
                </div>

                <!-- Perfect Matches -->
                <div class="table-section">
                    <div class="table-header">
                        <h3>✅ Perfect Matches</h3>
                        ${results.matched.length > 0 ? `
                            <button class="export-btn" onclick="reconciliationTool.exportCategory('matched')">
                                📥 Export as CSV
                            </button>
                        ` : ''}
                    </div>
                    <div class="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Transaction Reference</th>
                                    <th>Amount</th>
                                    <th>Status</th>
                                    <th>Date</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${results.matched.length === 0 ? 
                                    '<tr><td colspan="4" style="text-align: center; color: #666;">No perfect matches found</td></tr>' :
                                    results.matched.map(match => `
                                        <tr>
                                            <td><strong>${match.transaction_reference}</strong></td>
                                            <td>$${parseFloat(match.internal.amount || 0).toFixed(2)}</td>
                                            <td>${this.getStatusBadge(match.internal.status || 'N/A')}</td>
                                            <td>${match.internal.date || 'N/A'}</td>
                                        </tr>
                                    `).join('')
                                }
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Mismatched Transactions -->
                ${results.mismatched.length > 0 ? `
                <div class="table-section">
                    <div class="table-header">
                        <h3>⚠️ Mismatched Transactions</h3>
                        <button class="export-btn" onclick="reconciliationTool.exportCategory('mismatched')">
                            📥 Export as CSV
                        </button>
                    </div>
                    <div class="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Reference</th>
                                    <th>Internal Amount</th>
                                    <th>Provider Amount</th>
                                    <th>Internal Status</th>
                                    <th>Provider Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${results.mismatched.map(match => `
                                    <tr>
                                        <td><strong>${match.transaction_reference}</strong></td>
                                        <td>$${parseFloat(match.internal.amount || 0).toFixed(2)}</td>
                                        <td>$${parseFloat(match.provider.amount || 0).toFixed(2)}</td>
                                        <td>${this.getStatusBadge(match.internal.status || 'N/A')}</td>
                                        <td>${this.getStatusBadge(match.provider.status || 'N/A')}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
                ` : ''}

                <!-- Internal Only -->
                ${results.internal_only.length > 0 ? `
                <div class="table-section">
                    <div class="table-header">
                        <h3>📋 Internal System Only</h3>
                        <button class="export-btn" onclick="reconciliationTool.exportCategory('internal_only')">
                            📥 Export as CSV
                        </button>
                    </div>
                    <div class="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Transaction Reference</th>
                                    <th>Amount</th>
                                    <th>Status</th>
                                    <th>Date</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${results.internal_only.map(txn => `
                                    <tr>
                                        <td><strong>${txn.transaction_reference || txn.reference || txn.id || 'N/A'}</strong></td>
                                        <td>$${parseFloat(txn.amount || 0).toFixed(2)}</td>
                                        <td>${this.getStatusBadge(txn.status || 'N/A')}</td>
                                        <td>${txn.date || 'N/A'}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
                ` : ''}

                <!-- Provider Only -->
                ${results.provider_only.length > 0 ? `
                <div class="table-section">
                    <div class="table-header">
                        <h3>🏦 Provider Statement Only</h3>
                        <button class="export-btn" onclick="reconciliationTool.exportCategory('provider_only')">
                            📥 Export as CSV
                        </button>
                    </div>
                    <div class="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Transaction Reference</th>
                                    <th>Amount</th>
                                    <th>Status</th>
                                    <th>Date</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${results.provider_only.map(txn => `
                                    <tr>
                                        <td><strong>${txn.transaction_reference || txn.reference || txn.id || 'N/A'}</strong></td>
                                        <td>$${parseFloat(txn.amount || 0).toFixed(2)}</td>
                                        <td>${this.getStatusBadge(txn.status || 'N/A')}</td>
                                        <td>${txn.date || 'N/A'}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
                ` : ''}
            </div>
        `;

        resultsSection.innerHTML = html;
        resultsSection.style.display = 'block';
        
       
        resultsSection.scrollIntoView({ behavior: 'smooth' });
    }
}

// Initialize the application and make it globally accessible
let reconciliationTool;
document.addEventListener('DOMContentLoaded', () => {
    reconciliationTool = new ReconciliationTool();
});