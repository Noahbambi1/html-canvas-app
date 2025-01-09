let projectFiles = new Map();
let promptHistory = [];
let generatedImages = new Map();
let currentFile = null;
let useDallE = false; // Default to Google Images
let enhancePrompt = true;

// Initialize the application
function init() {
    attachEventListeners();
    // Set default values
    document.getElementById("imageSourceToggle").checked = useDallE;
    document.querySelector('.toggle-label').textContent = useDallE ? 'DALL-E Images' : 'Google Images';
    document.getElementById("modelSelect").value = "gpt-4"; // Default to GPT-4
}

function attachEventListeners() {
    document.getElementById("generateButton").addEventListener("click", generateProject);
    document.getElementById("clearButton").addEventListener("click", clearAll);
    document.getElementById("clearText").addEventListener("click", clearPrompt);
    document.getElementById("downloadProject").addEventListener("click", downloadProject);
    document.getElementById("copyToClipboard").addEventListener("click", copySelectedFile);
    document.getElementById("pageSelect").addEventListener("change", changePage);
    document.getElementById("fileTree").addEventListener("click", handleFileSelect);
    document.getElementById("promptHistory").addEventListener("click", handleHistoryClick);
    document.getElementById("codeInput").addEventListener("input", handleCodeEdit);
    
    document.getElementById("imageSourceToggle").addEventListener("change", function(e) {
        useDallE = e.target.checked;
        document.querySelector('.toggle-label').textContent = useDallE ? 'DALL-E Images' : 'Google Images';
    });

    document.getElementById("enhancePromptToggle").addEventListener("change", function(e) {
        enhancePrompt = e.target.checked;
    });
}

function showLoading(isLoading) {
    const generateButton = document.getElementById("generateButton");
    const loadingSpinner = document.getElementById("loadingSpinner");
    generateButton.disabled = isLoading;
    loadingSpinner.style.display = isLoading ? "block" : "none";
}

async function generateProject() {
    const promptInput = document.getElementById("promptInput");
    const prompt = promptInput.value;
    const model = document.getElementById("modelSelect").value;

    if (!prompt) return;

    try {
        showLoading(true);
        promptInput.value = "";

        let projectPlan;
        if (enhancePrompt) {
            // Step 1: Get enhanced project plan
            const planResponse = await fetch(`/plan-project?prompt=${encodeURIComponent(prompt)}&model=${encodeURIComponent(model)}`, {
                method: 'POST'
            });

            if (!planResponse.ok) {
                throw new Error(`Failed to enhance prompt: ${planResponse.statusText}`);
            }

            const planData = await planResponse.json();
            projectPlan = planData.enhancedPrompt;
            addToHistory(prompt, projectPlan);
        } else {
            // Use original prompt without enhancement
            projectPlan = prompt;
            addToHistory(prompt, "Direct generation without enhancement");
        }

        // Log the project plan being sent
        console.log('Sending project plan:', projectPlan);

        // Step 2: Generate project files using the enhanced prompt
        const response = await fetch(`/generate-project`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                prompt: projectPlan,
                currentFiles: Object.fromEntries(projectFiles),
                model,
                useDallE,
                generatedImages: Object.fromEntries(generatedImages)
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Error response from server:', errorText);
            throw new Error(`Failed to generate project: ${response.statusText}`);
        }

        const data = await response.json();

        // Update project files
        projectFiles.clear();
        Object.entries(data.files).forEach(([path, content]) => {
            projectFiles.set(path, content);
        });

        // Update generated images
        if (data.newImages) {
            Object.entries(data.newImages).forEach(([prompt, path]) => {
                generatedImages.set(prompt, path);
            });
        }

        updateFileTree();
        updatePageSelect();
        
        // Select index.html by default
        if (projectFiles.has('index.html')) {
            selectFile('index.html');
        }

    } catch (error) {
        console.error('Error:', error);
        alert(`Failed to generate project: ${error.message}`);
    } finally {
        showLoading(false);
    }
}

// History management with enhanced prompts
function addToHistory(originalPrompt, enhancedPrompt) {
    const historyItem = {
        original: originalPrompt,
        enhanced: enhancedPrompt,
        timestamp: new Date()
    };
    promptHistory.unshift(historyItem);
    updateHistoryDisplay();
}

function updateHistoryDisplay() {
    const historyContainer = document.getElementById("promptHistory");
    historyContainer.innerHTML = promptHistory
        .map(item => `
            <div class="history-item-container">
                <div class="history-item original" title="Click to use this prompt">
                    <div class="prompt-label">Original:</div>
                    ${item.original}
                </div>
                <div class="history-item enhanced" title="Enhanced prompt by AI">
                    <div class="prompt-label">Enhanced:</div>
                    ${item.enhanced}
                </div>
            </div>
        `)
        .join('');
}

function updateFileTree() {
    const fileTree = document.getElementById("fileTree");
    fileTree.innerHTML = ''; // Clear existing file tree

    projectFiles.forEach((content, path) => {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        fileItem.textContent = path;
        fileItem.addEventListener('click', () => selectFile(path));
        fileTree.appendChild(fileItem);
    });
}

function selectFile(filePath) {
    currentFile = filePath;
    const codeInput = document.getElementById("codeInput");
    codeInput.value = projectFiles.get(filePath) || '';

    // Update the iframe to render the selected file
    const iframe = document.getElementById("iframe");
    if (filePath.endsWith('.html')) {
        iframe.srcdoc = projectFiles.get(filePath) || '<html><body></body></html>';
    } else {
        iframe.srcdoc = '<html><body><h1>Preview not available for this file type</h1></body></html>';
    }
}

function updatePageSelect() {
    const pageSelect = document.getElementById("pageSelect");
    pageSelect.innerHTML = ''; // Clear existing options

    projectFiles.forEach((content, path) => {
        const option = document.createElement('option');
        option.value = path;
        option.textContent = path;
        pageSelect.appendChild(option);
    });

    // Automatically select the first page if available
    if (pageSelect.options.length > 0) {
        pageSelect.selectedIndex = 0;
        selectFile(pageSelect.value);
    }
}

// ... (rest of the existing functions from project.js)

// Initialize the application
init();