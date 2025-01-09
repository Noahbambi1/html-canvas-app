document.getElementById("generateButton").addEventListener("click", async function () {
    const prompt = document.getElementById("promptInput").value;
    const model = document.getElementById("modelSelect").value;
    const codeSpinner = document.getElementById("codeSpinner");
    const renderSpinner = document.getElementById("renderSpinner");
    const generateButton = document.getElementById("generateButton");
    const iframe = document.getElementById("iframe");

    if (prompt) {
        try {
            // Show loading state
            codeSpinner.style.display = "block";
            renderSpinner.style.display = "block";
            generateButton.disabled = true;
            iframe.style.backgroundColor = "#121212"; // Reset to dark background while loading

            // Request the server to generate HTML code
            const response = await fetch(`/generate?prompt=${encodeURIComponent(prompt)}&model=${encodeURIComponent(model)}`, {
                method: 'POST',
            });

            const data = await response.json();
            const generatedCode = data.code.trim();

            // Display the generated code in the code editor
            document.getElementById("codeInput").value = generatedCode;

            // Render the code in the iframe
            iframe.srcdoc = generatedCode;
            iframe.style.backgroundColor = "white"; // Change to white background when content is loaded

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
    iframe.srcdoc = updatedCode;
    iframe.style.backgroundColor = updatedCode.trim() ? "white" : "#121212";
});
