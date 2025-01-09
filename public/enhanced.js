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

            projectPlan = await planResponse.json();
            addToHistory(prompt, projectPlan.enhancedPrompt);
        } else {
            // Use original prompt without enhancement
            addToHistory(prompt, "Direct generation without enhancement");
        }

        // Step 2: Generate project files
        const response = await fetch(`/generate-project`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                projectPlan: enhancePrompt ? projectPlan : {
                    enhancedPrompt: prompt,
                    files: Object.fromEntries(projectFiles)
                },
                currentFiles: Object.fromEntries(projectFiles),
                model,
                useDallE,
                generatedImages: Object.fromEntries(generatedImages)
            })
        });

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
        alert('Failed to generate project. Please try again.');
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

// ... (rest of the existing functions from project.js)

// Initialize the application
init(); 