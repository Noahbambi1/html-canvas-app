// Keep track of prompt history and generated images
let promptHistory = [];
let generatedImages = new Map(); // Store image prompts and their paths

// Add toggle state management
let useDallE = true;

document.getElementById("imageSourceToggle").addEventListener("change", function(e) {
    useDallE = e.target.checked;
    // Update the toggle label
    document.querySelector('.toggle-label').textContent = useDallE ? 'DALL-E Images' : 'Google Images';
});

// Copy to clipboard functionality
document.getElementById("copyToClipboard").addEventListener("click", async function() {
    const codeInput = document.getElementById("codeInput");
    try {
        await navigator.clipboard.writeText(codeInput.value);
        const originalText = this.textContent;
        this.textContent = "Copied!";
        setTimeout(() => {
            this.textContent = originalText;
        }, 2000);
    } catch (err) {
        console.error('Failed to copy text: ', err);
    }
});

// Add prompt to history
function addToHistory(prompt) {
    if (!promptHistory.includes(prompt)) {
        promptHistory.unshift(prompt);
        updateHistoryDisplay();
    }
}

// Update the history display
function updateHistoryDisplay() {
    const historyContainer = document.getElementById("promptHistory");
    historyContainer.innerHTML = promptHistory
        .map(prompt => `<div class="history-item">${prompt}</div>`)
        .join('');
}

// Handle history item clicks
document.getElementById("promptHistory").addEventListener("click", function(e) {
    if (e.target.classList.contains("history-item")) {
        document.getElementById("promptInput").value = e.target.textContent;
    }
});

// Modified generate button click handler
document.getElementById("generateButton").addEventListener("click", async function () {
    const promptInput = document.getElementById("promptInput");
    const prompt = promptInput.value;
    const model = document.getElementById("modelSelect").value;
    const codeSpinner = document.getElementById("codeSpinner");
    const renderSpinner = document.getElementById("renderSpinner");
    const generateButton = document.getElementById("generateButton");
    const iframe = document.getElementById("iframe");
    const currentCode = document.getElementById("codeInput").value;

    if (prompt) {
        try {
            // Show loading state
            codeSpinner.style.display = "block";
            renderSpinner.style.display = "block";
            generateButton.disabled = true;
            iframe.style.backgroundColor = "#121212";

            // Add to history before clearing
            addToHistory(prompt);
            
            // Clear prompt for next input
            promptInput.value = "";

            // Request the server to generate HTML code
            const response = await fetch(`/generate?prompt=${encodeURIComponent(prompt)}&model=${encodeURIComponent(model)}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    currentCode,
                    generatedImages: Object.fromEntries(generatedImages),
                    useDallE
                })
            });

            const data = await response.json();
            
            // Display the generated code with loading placeholders
            document.getElementById("codeInput").value = data.code.trim();
            
            // Update the iframe with loading states
            updateIframeContent(data.code);
            iframe.style.backgroundColor = "white";
            
            // Set up image loading handling
            if (data.pendingImages > 0) {
                updateLoadingImages(data.code);
            }

        } catch (error) {
            console.error('Error:', error);
            alert('Failed to generate HTML. Please try again.');
        } finally {
            // Hide loading state
            codeSpinner.style.display = "none";
            renderSpinner.style.display = "none";
            generateButton.disabled = false;
        }
    }
});

// Make the code section editable and update the iframe
document.getElementById("codeInput").addEventListener("input", function () {
    const updatedCode = document.getElementById("codeInput").value;
    const iframe = document.getElementById("iframe");
    if (updatedCode.trim()) {
        updateIframeContent(updatedCode);
        iframe.style.backgroundColor = "white";
    } else {
        iframe.srcdoc = "<html><body></body></html>";
        iframe.style.backgroundColor = "#121212";
    }
});

// Clear button functionality
document.getElementById("clearButton").addEventListener("click", function() {
    // Clear all inputs
    document.getElementById("promptInput").value = "";
    document.getElementById("codeInput").value = "";
    document.getElementById("iframe").srcdoc = "<html><body></body></html>";
    document.getElementById("iframe").style.backgroundColor = "#121212";
    
    // Clear history
    promptHistory = [];
    generatedImages.clear();
    updateHistoryDisplay();
});

// Open in new tab functionality
document.getElementById("openInNewTab").addEventListener("click", function() {
    const iframeContent = document.getElementById("codeInput").value;
    if (iframeContent.trim()) {
        const newWindow = window.open();
        newWindow.document.write(iframeContent);
        newWindow.document.close();
    }
});

// Clear text button functionality
document.getElementById("clearText").addEventListener("click", function() {
    document.getElementById("promptInput").value = "";
});

// Fix iframe routing by setting base URL and target for links
function updateIframeContent(htmlContent) {
    const iframe = document.getElementById("iframe");
    const baseUrl = window.location.origin;
    
    const modifiedHtml = `
        <html>
            <head>
                <base href="${baseUrl}/">
                <style>
                    .image-loading {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        min-height: 256px;
                        background-color: #2a2a2a;
                        border-radius: 8px;
                        padding: 20px;
                        margin: 10px 0;
                    }
                    .image-loading .spinner {
                        width: 40px;
                        height: 40px;
                        border: 4px solid #f3f3f3;
                        border-top: 4px solid #4CAF50;
                        border-radius: 50%;
                        animation: spin 1s linear infinite;
                        margin-bottom: 10px;
                    }
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                </style>
            </head>
            <body>
                ${htmlContent}
                <script>
                    document.addEventListener('click', function(e) {
                        if (e.target.tagName === 'A') {
                            e.preventDefault();
                            window.open(e.target.href, '_blank');
                        }
                    });
                </script>
            </body>
        </html>
    `;
    
    iframe.srcdoc = modifiedHtml;
}

// Update the image loading handling
function updateLoadingImages(code) {
    const iframe = document.getElementById("iframe");
    let iframeDoc;
    let ws;

    function connectWebSocket() {
        ws = new WebSocket(`ws://${window.location.host}`);
        
        ws.onopen = function() {
            console.log('WebSocket connected');
        };
        
        ws.onmessage = function(event) {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'imageGenerated') {
                    // Get the current iframe document
                    iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                    const loadingElement = iframeDoc.getElementById(data.loadingId);
                    if (loadingElement) {
                        const img = new Image();
                        img.onload = function() {
                            img.style.maxWidth = '100%';
                            img.style.height = 'auto';
                            img.style.borderRadius = '8px';
                            loadingElement.parentNode.replaceChild(img, loadingElement);
                        };
                        img.src = data.imagePath;
                    }
                }
            } catch (error) {
                console.error('Error processing WebSocket message:', error);
            }
        };
        
        ws.onclose = function() {
            console.log('WebSocket disconnected, attempting to reconnect...');
            setTimeout(connectWebSocket, 1000);
        };
        
        ws.onerror = function(error) {
            console.error('WebSocket error:', error);
        };
    }

    // Start the WebSocket connection
    connectWebSocket();

    // Clean up when navigating away
    window.addEventListener('beforeunload', () => {
        if (ws) {
            ws.close();
        }
    });
}
