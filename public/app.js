// Keep track of prompt history and generated images
let promptHistory = [];
let generatedImages = new Map(); // Store image prompts and their paths

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
                    generatedImages: Object.fromEntries(generatedImages)
                })
            });

            const data = await response.json();
            
            // Update generated images map with any new images
            if (data.newImages) {
                Object.entries(data.newImages).forEach(([prompt, path]) => {
                    generatedImages.set(prompt, path);
                });
            }

            // Display the generated code in the code editor
            document.getElementById("codeInput").value = data.code.trim();

            // Render the code in the iframe
            if (data.code) {
                updateIframeContent(data.code);
                iframe.style.backgroundColor = "white";
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
    
    // Add base tag and target="_blank" to all links
    const modifiedHtml = `
        <html>
            <head>
                <base href="${baseUrl}/">
            </head>
            <body>
                ${htmlContent}
                <script>
                    // Make all links open in new tab
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
