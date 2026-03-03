/**
 * APP.JS - Punto de entrada principal
 * Requiere: shared.js, imageFinder.js, stockGenerator.js
 */

function initializeEventListeners() {
    // Upload area click
    elements.uploadArea.addEventListener('click', () => {
        elements.fileInput.click();
    });

    // File input change
    elements.fileInput.addEventListener('change', handleFileSelect);

    // Drag and drop
    elements.uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        elements.uploadArea.classList.add('drag-over');
    });

    elements.uploadArea.addEventListener('dragleave', () => {
        elements.uploadArea.classList.remove('drag-over');
    });

    elements.uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        elements.uploadArea.classList.remove('drag-over');
        if (e.dataTransfer.files.length > 0) {
            handleFile(e.dataTransfer.files[0]);
        }
    });

    // Remove file
    elements.removeFile.addEventListener('click', (e) => {
        e.stopPropagation();
        resetFileUpload();
    });

    // New file button
    elements.newFileBtn.addEventListener('click', resetApp);

    // Processing control buttons
    if (elements.cancelProcessBtn) {
        elements.cancelProcessBtn.addEventListener('click', () => {
            if (confirm('¿Seguro que deseas cancelar el proceso?')) {
                appState.isCancelled = true;
                appState.isPaused = false; // Unpause specifically so loop can exit
                addLog('⏹️ Cancelando procesamiento...', 'error');
            }
        });
    }

    if (elements.pauseProcessBtn) {
        elements.pauseProcessBtn.addEventListener('click', () => {
            appState.isPaused = !appState.isPaused;

            if (appState.isPaused) {
                elements.pauseProcessBtn.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polygon points="5 3 19 12 5 21 5 3"></polygon>
                    </svg>
                    Reanudar
                `;
                elements.pauseProcessBtn.classList.add('paused');
                addLog('⏸️ Procesamiento PAUSADO', 'warning');
            } else {
                elements.pauseProcessBtn.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="6" y="4" width="4" height="16"></rect>
                        <rect x="14" y="4" width="4" height="16"></rect>
                    </svg>
                    Pausar
                `;
                elements.pauseProcessBtn.classList.remove('paused');
                addLog('▶️ Procesamiento REANUDADO', 'success');
            }
        });
    }

    if (elements.skipToResultsBtn) {
        elements.skipToResultsBtn.addEventListener('click', () => {
            appState.skipToResults = true;
            addLog('⏭️ Saltando a resultados...', 'info');
        });
    }

    // Module-specific listeners
    initializeImageFinderListeners();
    initializeStockGeneratorListeners();
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    // Cargar API keys desde el backend antes de inicializar
    await loadAPIKeys();
    initializeEventListeners();
    addLog('Aplicación iniciada. Listo para procesar archivos.', 'success');
});
