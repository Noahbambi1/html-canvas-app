let projectFiles = new Map();
let promptHistory = [];
let generatedImages = new Map();
let currentFile = null;
let useDallE = false;
let isFirstPrompt = true;

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
}

async function generateProject() {
    const promptInput = document.getElementById("promptInput");
    const prompt = promptInput.value;
    const model = document.getElementById("modelSelect").value;

    if (!prompt) return;

    try {
        showLoading(true);
        addToHistory(prompt);
        promptInput.value = "";

        const response = await fetch(`/generate-project?prompt=${encodeURIComponent(prompt)}&model=${encodeURIComponent(model)}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                currentFiles: Object.fromEntries(projectFiles),
                generatedImages: Object.fromEntries(generatedImages),
                useDallE,
                isInitialPrompt: isFirstPrompt
            })
        });

        const data = await response.json();
        
        // Update the flag after first prompt
        isFirstPrompt = false;
        
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

function updateFileTree() {
    const fileTree = document.getElementById("fileTree");
    const files = Array.from(projectFiles.keys()).sort();
    
    fileTree.innerHTML = files
        .map(file => `
            <div class="file-item${currentFile === file ? ' selected' : ''}" 
                 data-file="${file}">
                ${file}
            </div>
        `)
        .join('');
}

function updatePageSelect() {
    const pageSelect = document.getElementById("pageSelect");
    const htmlFiles = Array.from(projectFiles.keys()).filter(file => file.endsWith('.html'));
    
    pageSelect.innerHTML = '<option value="">Select Page...</option>' +
        htmlFiles.map(file => `<option value="${file}">${file}</option>`).join('');
}

function selectFile(filename) {
    currentFile = filename;
    
    // Update file tree selection
    document.querySelectorAll('.file-item').forEach(item => {
        item.classList.toggle('selected', item.dataset.file === filename);
    });

    // Update code display
    const codeInput = document.getElementById("codeInput");
    codeInput.value = projectFiles.get(filename) || '';

    // If it's an HTML file, update the preview
    if (filename.endsWith('.html')) {
        updatePreview(filename);
        document.getElementById("pageSelect").value = filename;
    }
}

function updatePreview(filename) {
    const content = projectFiles.get(filename);
    const iframe = document.getElementById("iframe");
    if (content && content.trim()) {
        iframe.srcdoc = content;
        iframe.classList.add('has-content');
    } else {
        iframe.srcdoc = "<html><body></body></html>";
        iframe.classList.remove('has-content');
    }
}

function handleFileSelect(e) {
    const fileItem = e.target.closest('.file-item');
    if (fileItem) {
        const filename = fileItem.dataset.file;
        if (filename) {
            selectFile(filename);
        }
    }
}

function changePage(e) {
    const filename = e.target.value;
    if (filename) {
        selectFile(filename);
    }
}

async function downloadProject() {
    if (projectFiles.size === 0) return;

    try {
        const response = await fetch('/download-project', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(Object.fromEntries(projectFiles))
        });

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'project.zip';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Error downloading project:', error);
        alert('Failed to download project');
    }
}

// History management
function addToHistory(prompt) {
    if (!promptHistory.includes(prompt)) {
        promptHistory.unshift(prompt);
        updateHistoryDisplay();
    }
}

function updateHistoryDisplay() {
    const historyContainer = document.getElementById("promptHistory");
    historyContainer.innerHTML = promptHistory
        .map(prompt => `<div class="history-item">${prompt}</div>`)
        .join('');
}

function handleHistoryClick(e) {
    if (e.target.classList.contains("history-item")) {
        document.getElementById("promptInput").value = e.target.textContent;
    }
}

function clearPrompt() {
    document.getElementById("promptInput").value = "";
}

function clearAll() {
    document.getElementById("promptInput").value = "";
    document.getElementById("codeInput").value = "";
    document.getElementById("iframe").srcdoc = "<html><body></body></html>";
    document.getElementById("fileTree").innerHTML = "";
    document.getElementById("pageSelect").innerHTML = '<option value="">Select Page...</option>';
    projectFiles.clear();
    promptHistory = [];
    generatedImages.clear();
    updateHistoryDisplay();
    isFirstPrompt = true;
    const iframe = document.getElementById("iframe");
    iframe.srcdoc = "<html><body></body></html>";
    iframe.classList.remove('has-content');
    iframe.style.backgroundColor = "#121212";
}

function showLoading(show) {
    document.getElementById("generateButton").disabled = show;
    document.querySelectorAll(".spinner").forEach(spinner => {
        spinner.style.display = show ? "block" : "none";
    });
}

// Handle messages from iframe
window.addEventListener('message', function(event) {
    if (event.data.type === 'changePage') {
        selectFile(event.data.page);
    }
});

// Add new function to handle code editing
function handleCodeEdit() {
    if (currentFile) {
        const content = document.getElementById("codeInput").value;
        projectFiles.set(currentFile, content);
        
        // If editing an HTML file, update the preview
        if (currentFile.endsWith('.html')) {
            updatePreview(currentFile);
        }
        // If editing a CSS file, update all HTML previews to reflect new styles
        else if (currentFile.endsWith('.css')) {
            const currentPage = document.getElementById("pageSelect").value;
            if (currentPage) {
                updatePreview(currentPage);
            }
        }
    }
}

// Add this function to handle copying the selected file
async function copySelectedFile() {
    if (!currentFile) {
        alert('Please select a file first');
        return;
    }

    try {
        const content = projectFiles.get(currentFile);
        await navigator.clipboard.writeText(content);
        
        // Show feedback
        const copyButton = document.getElementById("copyToClipboard");
        const originalText = copyButton.textContent;
        copyButton.textContent = "Copied!";
        setTimeout(() => {
            copyButton.textContent = originalText;
        }, 2000);
    } catch (err) {
        console.error('Failed to copy text: ', err);
        alert('Failed to copy to clipboard');
    }
}

// Initialize the application
init(); 