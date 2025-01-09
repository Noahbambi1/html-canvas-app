document.getElementById("generateButton").addEventListener("click", async function () {
    const prompt = document.getElementById("promptInput").value;

    if (prompt) {
        // Request the server to generate HTML code
        const response = await fetch(`/generate?prompt=${encodeURIComponent(prompt)}`, {
            method: 'POST',
        });

        const data = await response.json();
        const generatedCode = data.code.trim();

        // Display the generated code in the code editor
        document.getElementById("codeInput").value = generatedCode;

        // Render the code in the iframe
        document.getElementById("iframe").srcdoc = generatedCode;
    }
});

// Make the code section editable and update the iframe
document.getElementById("codeInput").addEventListener("input", function () {
    const updatedCode = document.getElementById("codeInput").value;
    document.getElementById("iframe").srcdoc = updatedCode;
});
