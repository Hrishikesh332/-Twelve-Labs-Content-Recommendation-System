document.addEventListener('DOMContentLoaded', function() {
    const elements = {
        searchInput: document.getElementById('searchInput'),
        searchButton: document.getElementById('searchButton'),
        imageSearchButton: document.getElementById('imageSearchButton'),
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
        imageInput: document.getElementById('imageInput'),
    
        uploadButtons: document.querySelectorAll('.upload-options .search-type-btn'),
        fileUpload: document.getElementById('fileUpload'),
        urlUpload: document.getElementById('urlUpload'),
        fileInput: document.getElementById('fileInput'),
        videoUrlInput: document.getElementById('videoUrl'),
        urlSubmitButton: document.getElementById('urlSubmitButton'),
        uploadZone: document.getElementById('uploadZone'),
        uploadProgress: document.getElementById('uploadProgress')
    };


    function initializeEventListeners() {
        elements.searchTypeButtons.forEach(button => {
            button.addEventListener('click', () => {
                switchSearchType(button.dataset.type);
            });
        });

        elements.searchButton.addEventListener('click', () => handleSearch('text'));
        elements.searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleSearch('text');
        });

        elements.imageSearchButton.addEventListener('click', () => handleSearch('image'));
        elements.imageInput.addEventListener('change', handleImageInput);

        elements.uploadZone.addEventListener('click', () => elements.fileInput.click());
        elements.fileInput.addEventListener('change', handleFileSelect);

        setupDragAndDrop();
    }


    function initializeUploadEvents() {
        // Upload type switching
        elements.uploadButtons.forEach(button => {
            button.addEventListener('click', function(e) {
                console.log('Upload button clicked:', this.dataset.uploadType);
                switchUploadType(this.dataset.uploadType);
            });
        });

        // URL submission
        elements.urlSubmitButton.addEventListener('click', handleUrlUpload);
        elements.videoUrlInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleUrlUpload();
            }
        });

        // File upload handling
        elements.uploadZone.addEventListener('click', () => elements.fileInput.click());
        elements.fileInput.addEventListener('change', handleFileSelect);

        // Drag and drop
        setupDragAndDrop();
    }

    function switchUploadType(type) {
        console.log('Switching to upload type:', type);
        
        // Update button states
        elements.uploadButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.uploadType === type);
        });

        // Show/hide appropriate upload sections
        elements.fileUpload.classList.toggle('hidden', type !== 'file');
        elements.urlUpload.classList.toggle('hidden', type !== 'url');
    }


    function validateVideoUrl() {
        const url = elements.videoUrlInput.value.trim();
        const isValid = url.length > 0 && isValidUrl(url);
        elements.urlSubmitButton.disabled = !isValid;
        return isValid;
    }

    function isValidUrl(url) {
        try {
            new URL(url);
            return url.match(/\.(mp4|webm|ogg)$/i) !== null;
        } catch {
            return false;
        }
    }


    async function handleUrlUpload() {
        const videoUrl = elements.videoUrlInput.value.trim();
        
        if (!videoUrl) {
            showError('Please enter a video URL');
            return;
        }

        showUploadProgress(true);

        try {
            const formData = new FormData();
            formData.append('video_url', videoUrl);

            const response = await fetch('/upload_video', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Upload failed');
            }

            showSuccess(`Successfully processed video with ${result.segments} segments`);
            elements.videoUrlInput.value = '';

        } catch (error) {
            console.error('Upload error:', error);
            showError('Failed to process video URL. Please try again.');
        } finally {
            showUploadProgress(false);
        }
    }



    function switchSearchType(type) {
        elements.searchTypeButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.type === type);
        });

        Object.entries(elements.searchBoxes).forEach(([key, element]) => {
            element.classList.toggle('hidden', key !== type);
        });

        console.log('Switched to search type:', type);
    }

    async function handleSearch(type) {
        console.log('Starting search with type:', type);
        showLoading(true);
    
        try {
            let response;
            if (type === 'text') {
                const query = elements.searchInput.value.trim();
                if (!query) {
                    throw new Error('Please enter a search query');
                }
                console.log('Performing text search with query:', query);
                response = await performTextSearch(query);
            } else if (type === 'image') {
                const imageFile = elements.imageInput.files[0];
                if (!imageFile) {
                    throw new Error('Please select an image');
                }
                console.log('Performing image search with file:', imageFile.name);
                response = await performImageSearch(imageFile);
            }
    
            console.log('Response status:', response.status);
            const contentType = response.headers.get('content-type');
            console.log('Response content type:', contentType);
    
            const responseText = await response.text();
            console.log('Raw response:', responseText);
    
            let responseData;
            if (contentType && contentType.includes('application/json')) {
                try {
                    responseData = JSON.parse(responseText);
                } catch (parseError) {
                    console.error('JSON parse error:', parseError);
                    throw new Error('Invalid JSON response from server');
                }
            } else {
                console.error('Received non-JSON response');
                throw new Error('Server returned an invalid response format');
            }
    
            if (!response.ok) {
                throw new Error(responseData.error || 'Search failed');
            }
    
            displayResults(responseData);
        } catch (error) {
            console.error('Search error:', error);
            showError(error.message);
        } finally {
            showLoading(false);
        }
    }
    
        
    async function performImageSearch(imageFile) {
        console.log('Preparing image search request for:', imageFile.name);
        const formData = new FormData();
        formData.append('image', imageFile);

        // Log the FormData contents
        for (let [key, value] of formData.entries()) {
            console.log('FormData entry:', key, value instanceof File ? value.name : value);
        }

        try {
            const response = await fetch('/image_search', {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            return response;
        } catch (error) {
            console.error('Network error during image search:', error);
            throw new Error('Failed to connect to the server');
        }
    }
        async function performTextSearch(query) {
            console.log('Performing text search for:', query);
            return fetch('/search', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ query })
            });
        }

    // Perform image-based search

    async function handleSearch(type) {
        console.log('Starting search with type:', type);
        showLoading(true);
    
        try {
            let response;
            if (type === 'text') {
                const query = elements.searchInput.value.trim();
                if (!query) {
                    throw new Error('Please enter a search query');
                }
                console.log('Performing text search with query:', query);
                response = await performTextSearch(query);
            } else if (type === 'image') {
                const imageFile = elements.imageInput.files[0];
                if (!imageFile) {
                    throw new Error('Please select an image');
                }
                console.log('Performing image search with file:', imageFile.name);
                response = await performImageSearch(imageFile);
            }
    
            console.log('Response status:', response.status);
            const contentType = response.headers.get('content-type');
            console.log('Response content type:', contentType);
    
            const responseText = await response.text();
            console.log('Raw response:', responseText);
    
            let responseData;
            if (contentType && contentType.includes('application/json')) {
                try {
                    responseData = JSON.parse(responseText);
                } catch (parseError) {
                    console.error('JSON parse error:', parseError);
                    throw new Error('Invalid JSON response from server');
                }
            } else {
                console.error('Received non-JSON response');
                throw new Error('Server returned an invalid response format');
            }
    
            if (!response.ok) {
                throw new Error(responseData.error || 'Search failed');
            }
    
            displayResults(responseData);
        } catch (error) {
            console.error('Search error:', error);
            showError(error.message);
        } finally {
            showLoading(false);
        }
    }
    

    // Handle image input and preview
    function handleImageInput(event) {
        const file = event.target.files[0];
        if (!file) return;

        console.log('Image selected:', file.name, 'Type:', file.type);
        
        if (!file.type.startsWith('image/')) {
            showError('Please select a valid image file');
            event.target.value = '';
            return;
        }

        const container = event.target.closest('.file-input-container');
        const label = container.querySelector('.file-input-label');
        label.textContent = file.name;

        createImagePreview(file, container);
    }

    function createImagePreview(file, container) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const preview = document.createElement('div');
            preview.className = 'image-preview';
            preview.innerHTML = `
                <img src="${e.target.result}" alt="Selected image">
                <button class="remove-image">×</button>
            `;
            
            const existingPreview = container.querySelector('.image-preview');
            if (existingPreview) {
                existingPreview.remove();
            }
            
            container.appendChild(preview);

            
            preview.querySelector('.remove-image').addEventListener('click', (e) => {
                e.preventDefault();
                preview.remove();
                elements.imageInput.value = '';
                label.textContent = 'Choose image file or drag & drop';
            });
        };
        reader.readAsDataURL(file);
    }

    function handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;
        uploadFile(file);
    }

    // Upload file to server
    async function uploadFile(file) {
        if (!file.type.startsWith('video/')) {
            showError('Please upload a video file');
            return;
        }

        const formData = new FormData();
        formData.append('video', file);

        showUploadProgress(true);
        try {
            const response = await fetch('/upload_video', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || 'Upload failed');
            }

            showSuccess(`Successfully processed video with ${result.segments} segments`);
        } catch (error) {
            console.error('Upload error:', error);
            showError('Failed to upload video. Please try again.');
        } finally {
            showUploadProgress(false);
            elements.fileInput.value = '';
        }
    }

    function createResultCard(result) {
        const card = document.createElement('div');
        card.className = 'result-card';
        
        const confidenceClass = result.confidence === 'high' ? 'confidence-high' : 'confidence-medium';
        const score = (result.score * 100).toFixed(1);
        
        // Use video_url if it exists (for URL-based videos), otherwise use the /video endpoint
        const videoSource = result.video_url || `/video/${result.video_id}`;
    
        card.innerHTML = `
            <div class="card-media">
                <video class="video-preview" controls>
                    <source src="${videoSource}#t=${result.start_time}" type="video/mp4">
                    Your browser does not support the video tag.
                </video>
                <span class="confidence-badge ${confidenceClass}">
                    <i class="fas fa-check-circle"></i>
                    ${result.confidence}
                </span>
                <div class="timestamp">${formatTime(result.start_time)} - ${formatTime(result.end_time)}</div>
            </div>
            <div class="card-content">
                <div class="card-header">
                    <h3 class="card-title">${result.original_filename}</h3>
                    <span class="score">${score}% Match</span>
                </div>
                <div class="card-actions">
                    <button class="action-button preview-button" data-video-source="${videoSource}" data-start-time="${result.start_time}">
                        <i class="fas fa-play"></i> Preview
                    </button>
                </div>
            </div>
        `;
    
        // Add preview button handler
        const previewButton = card.querySelector('.preview-button');
        previewButton.addEventListener('click', () => {
            const video = card.querySelector('.video-preview');
            if (video) {
                video.currentTime = result.start_time;
                video.play();
            }
        });
    
        return card;
    }

    // Display search results
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

    // Create result card
    function createResultCard(result) {
        const card = document.createElement('div');
        card.className = 'result-card';
        
        const confidenceClass = result.confidence === 'high' ? 'confidence-high' : 'confidence-medium';
        const score = (result.score * 100).toFixed(1);
        
        // Use video_url if it exists (for URL-based videos), otherwise use the /video endpoint
        const videoSource = result.video_url || `/video/${result.video_id}`;
    
        card.innerHTML = `
            <div class="card-media">
                <video class="video-preview" controls>
                    <source src="${videoSource}#t=${result.start_time}" type="video/mp4">
                    Your browser does not support the video tag.
                </video>
                <span class="confidence-badge ${confidenceClass}">
                    <i class="fas fa-check-circle"></i>
                    ${result.confidence}
                </span>
                <div class="timestamp">${formatTime(result.start_time)} - ${formatTime(result.end_time)}</div>
            </div>
            <div class="card-content">
                <div class="card-header">
                    <h3 class="card-title">${result.original_filename}</h3>
                    <span class="score">${score}% Match</span>
                </div>
                <div class="card-actions">
                    <button class="action-button preview-button" data-video-source="${videoSource}" data-start-time="${result.start_time}">
                        <i class="fas fa-play"></i> Preview
                    </button>
                </div>
            </div>
        `;
    
        // Add preview button handler
        const previewButton = card.querySelector('.preview-button');
        previewButton.addEventListener('click', () => {
            const video = card.querySelector('.video-preview');
            if (video) {
                video.currentTime = result.start_time;
                video.play();
            }
        });
    
        return card;
    }


    // Create no results HTML
    function createNoResultsHtml() {
        return `
            <div class="no-results">
                <i class="fas fa-search"></i>
                <h3>No Results Found</h3>
                <p>Try adjusting your search terms or upload more content</p>
            </div>
        `;
    }

    // Show/hide loading state
    function showLoading(show) {
        elements.loadingState.classList.toggle('hidden', !show);
    }

    // Show/hide upload progress
    function showUploadProgress(show) {
        elements.uploadProgress.classList.toggle('hidden', !show);
    }

    // Show error message
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

    // Show success message
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

    // Format time display
    function formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
    
    
    document.querySelectorAll('input[name="uploadType"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            document.getElementById('fileUploadSection').style.display = 
                e.target.value === 'file' ? 'block' : 'none';
            document.getElementById('urlUploadSection').style.display = 
                e.target.value === 'url' ? 'block' : 'none';
        });
    });
    // Setup drag and drop functionality
    function setupDragAndDrop() {
        const dropZone = elements.uploadZone;
        
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, preventDefaults, false);
        });

        function preventDefaults(e) {
            e.preventDefault();
            e.stopPropagation();
        }

        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => {
                dropZone.classList.add('drag-over');
            });
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => {
                dropZone.classList.remove('drag-over');
            });
        });

        dropZone.addEventListener('drop', (e) => {
            const file = e.dataTransfer.files[0];
            if (file) {
                uploadFile(file);
            }
        });
    }

    // Initialize the application
    initializeEventListeners();
    initializeUploadEvents();
});