import fetch from 'node-fetch';  // Import fetch dynamically
import dotenv from 'dotenv';  // Import dotenv module
import express from 'express';  // Import express

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.static('public'));

app.post('/generate', async (req, res) => {
    const prompt = req.query.prompt;
    const model = req.query.model || 'gpt-4'; // Default to gpt-4 if no model specified

    if (!prompt) {
        return res.status(400).send('Prompt is required');
    }

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: model,
                messages: [{ role: 'user', content: `in html ${prompt}, just return the html and nothing else` }],
                max_tokens: 4096
            })
        });

        const data = await response.json();
        console.log("API Response:", data);

        if (data && data.choices && data.choices.length > 0) {
            let generatedCode = data.choices[0].message.content.trim();
            
            // Remove markdown code block markers if they exist
            generatedCode = generatedCode.replace(/^```html\n?/, '');
            generatedCode = generatedCode.replace(/\n?```$/, '');
            
            res.json({ code: generatedCode });
        } else {
            res.status(500).send('Error: No choices found in the response');
        }

    } catch (error) {
        console.error('Error generating code:', error);
        res.status(500).send('Failed to generate code');
    }
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
