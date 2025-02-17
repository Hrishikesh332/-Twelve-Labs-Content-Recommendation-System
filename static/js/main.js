document.addEventListener('DOMContentLoaded', function() {
    const elements = {

        searchInput: document.getElementById('searchInput'),
        searchButton: document.getElementById('searchButton'),
        searchTypeButtons: document.querySelectorAll('.search-type-btn'),
        searchBoxes: {
            text: document.getElementById('textSearch'),
            image: document.getElementById('imageSearch')
        },
        
        uploadZone: document.getElementById('uploadZone'),
        fileInput: document.getElementById('fileInput'),
        uploadProgress: document.getElementById('uploadProgress'),

        resultsSection: document.getElementById('resultsSection'),
        resultsGrid: document.getElementById('resultsGrid'),
        loadingState: document.getElementById('loadingState'),

        imageInput: document.getElementById('imageInput')
    };


    function initializeEventListeners() {
     
        elements.searchButton.addEventListener('click', handleSearch);
        elements.searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleSearch();
        });

        elements.uploadZone.addEventListener('click', () => elements.fileInput.click());
        elements.fileInput.addEventListener('change', handleFileSelect);

        elements.searchTypeButtons.forEach(button => {
            button.addEventListener('click', () => switchSearchType(button.dataset.type));
        });

        elements.imageInput.addEventListener('change', handleSearchFileInput);
    }

    function switchSearchType(type) {
        elements.searchTypeButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.type === type);
        });

        Object.entries(elements.searchBoxes).forEach(([key, element]) => {
            element.classList.toggle('hidden', key !== type);
        });
    }

    async function handleSearch() {
        const activeType = document.querySelector('.search-type-btn.active').dataset.type;
        showLoading(true);

        try {
            let response;
            switch (activeType) {
                case 'text':
                    response = await performTextSearch();
                    break;
                case 'image':
                    response = await performImageSearch();
                    break;
                default:
                    throw new Error('Invalid search type');
            }

            const results = await handleSearchResponse(response);
            displayResults(results);
        } catch (error) {
            console.error('Search error:', error);
            showError(error.message || 'Search failed');
        } finally {
            showLoading(false);
        }
    }

    async function performTextSearch() {
        const query = elements.searchInput.value.trim();
        if (!query) throw new Error('Please enter a search query');

        return fetch('/search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ query, type: 'text' })
        });
    }


    async function performImageSearch() {
        const imageFile = elements.imageInput.files[0];
        if (!imageFile) throw new Error('Please select an image');

        const formData = new FormData();
        formData.append('image', imageFile);
        formData.append('type', 'image');

        return fetch('/search', {
            method: 'POST',
            body: formData
        });
    }

    async function handleSearchResponse(response) {
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Search failed');
        }

        const data = await response.json();
        if (!Array.isArray(data)) {
            throw new Error('Invalid response format');
        }

        return data;
    }

    function handleSearchFileInput(event) {
        const file = event.target.files[0];
        if (!file) return;

        const container = event.target.closest('.file-input-container');
        const label = container.querySelector('.file-input-label');
        label.textContent = file.name;

        if (file.type.startsWith('image/')) {
            updateImagePreview(container, file);
        }
    }

    function handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;
        uploadFile(file);
    }

    async function uploadFile(file) {
        const formData = new FormData();
        formData.append('video', file);

        showUploadProgress(true);
        try {
            const response = await fetch('/upload_video', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error('Upload failed');
            }

            const result = await response.json();
            showSuccess(`Successfully processed video with ${result.segments} segments`);
        } catch (error) {
            console.error('Upload error:', error);
            showError('Failed to upload video. Please try again.');
        } finally {
            showUploadProgress(false);
            elements.fileInput.value = '';
        }
    }

    function displayResults(results) {
        elements.resultsSection.classList.remove('hidden');
        elements.resultsGrid.innerHTML = '';

        if (!results || results.length === 0) {
            elements.resultsGrid.innerHTML = createNoResultsHtml();
            return;
        }

        results.forEach(result => {
            const card = createResultCard(result);
            elements.resultsGrid.appendChild(card);
        });
    }

    
    function createResultCard(result) {
        const card = document.createElement('div');
        card.className = 'result-card';
        
        const confidenceClass = result.confidence === 'high' ? 'confidence-high' : 'confidence-medium';
        const score = (result.score * 100).toFixed(1);
    
        card.innerHTML = `
            <div class="card-media">
                <span class="confidence-badge ${confidenceClass}">
                    <i class="fas fa-check-circle"></i>
                    ${result.confidence}
                </span>
                <div class="timestamp">${formatTime(result.start_time)} - ${formatTime(result.end_time)}</div>
            </div>
            <div class="card-content">
                <div class="card-header">
                    <h3 class="card-title">${result.filename}</h3>
                    <span class="score">${score}% Match</span>
                </div>
                <div class="card-actions">
                    <button class="action-button">
                        <i class="fas fa-play"></i> Preview
                    </button>
                </div>
            </div>
        `;
    
        return card;
    }

    function createNoResultsHtml() {
        return `
            <div class="no-results">
                <i class="fas fa-search"></i>
                <h3>No Results Found</h3>
                <p>Try adjusting your search terms or upload more content</p>
            </div>
        `;
    }

    function showLoading(show) {
        loadingState.classList.toggle('hidden', !show);
    }

    function showUploadProgress(show) {
        uploadProgress.classList.toggle('hidden', !show);
    }

    function showError(message) {
        const errorAlert = document.createElement('div');
        errorAlert.className = 'error-alert';
        errorAlert.innerHTML = `
            <i class="fas fa-exclamation-circle"></i>
            <span>${message}</span>
        `;

        document.body.appendChild(errorAlert);
        setTimeout(() => errorAlert.remove(), 5000);
    }

    function showSuccess(message) {
        const successAlert = document.createElement('div');
        successAlert.className = 'success-alert';
        successAlert.innerHTML = `
            <i class="fas fa-check-circle"></i>
            <span>${message}</span>
        `;

        document.body.appendChild(successAlert);
        setTimeout(() => successAlert.remove(), 5000);
    }

    function formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    initializeEventListeners();
    setupDragAndDrop();
});

window.previewContent = function(filename, startTime) {
    console.log(`Preview requested for ${filename} at ${startTime}s`);

};