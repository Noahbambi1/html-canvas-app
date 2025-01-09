import fetch from 'node-fetch';  // Import fetch dynamically
import dotenv from 'dotenv';  // Import dotenv module
import express from 'express';  // Import express
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Ensure images directory exists
const imagesDir = path.join(process.cwd(), 'public', 'generated-images');
try {
    await fs.mkdir(imagesDir, { recursive: true });
} catch (err) {
    console.error('Error creating images directory:', err);
}

app.use(express.static('public'));
app.use(express.json()); // Add this near the top with other middleware

// Add new endpoint for image generation
async function generateAndSaveImage(prompt) {
    try {
        const response = await fetch('https://api.openai.com/v1/images/generations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: "dall-e-3",
                prompt: prompt,
                n: 1,
                size: "1024x1024"
            })
        });

        const data = await response.json();
        
        if (data.data && data.data[0].url) {
            // Download the image
            const imageResponse = await fetch(data.data[0].url);
            const arrayBuffer = await imageResponse.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            
            // Generate unique filename
            const filename = `${crypto.randomBytes(16).toString('hex')}.png`;
            const filepath = path.join(imagesDir, filename);
            
            // Save the image
            await fs.writeFile(filepath, buffer);
            
            // Return the path relative to public directory
            return `/generated-images/${filename}`;
        } else {
            throw new Error('No image URL in response');
        }
    } catch (error) {
        console.error('Error generating image:', error);
        throw error;
    }
}

app.post('/generate', async (req, res) => {
    const prompt = req.query.prompt;
    const model = req.query.model || 'gpt-4';
    const { currentCode, generatedImages } = req.body;

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
                messages: [{ 
                    role: 'user', 
                    content: `Update or create HTML with the following prompt: ${prompt}. 
                    Current HTML: ${currentCode || 'None'}
                    You can include images by using the syntax {{generate_image: image description}}.
                    Just return the HTML and nothing else.` 
                }],
                max_tokens: 4096
            })
        });

        const data = await response.json();
        console.log("API Response:", data);

        if (data && data.choices && data.choices.length > 0) {
            let generatedCode = data.choices[0].message.content.trim();
            generatedCode = generatedCode.replace(/^```html\n?/, '');
            generatedCode = generatedCode.replace(/\n?```$/, '');

            // Process any image generation requests in the HTML
            const imageRegex = /{{generate_image:\s*(.*?)}}/g;
            let match;
            const newImages = {};

            while ((match = imageRegex.exec(generatedCode)) !== null) {
                const imagePrompt = match[1];
                try {
                    // Check if image was already generated
                    if (generatedImages && generatedImages[imagePrompt]) {
                        generatedCode = generatedCode.replace(match[0], generatedImages[imagePrompt]);
                    } else {
                        const imagePath = await generateAndSaveImage(imagePrompt);
                        generatedCode = generatedCode.replace(match[0], imagePath);
                        newImages[imagePrompt] = imagePath;
                    }
                } catch (error) {
                    console.error('Error generating image:', error);
                    generatedCode = generatedCode.replace(match[0], '/path/to/error-image.png');
                }
            }
            
            res.json({ 
                code: generatedCode,
                newImages
            });
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
