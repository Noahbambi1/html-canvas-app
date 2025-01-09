import fetch from 'node-fetch';  // Import fetch dynamically
import dotenv from 'dotenv';  // Import dotenv module
import express from 'express';  // Import express
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import archiver from 'archiver';
import { setTimeout } from 'timers/promises';

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

// Add rate limiting tracking
const imageRateLimit = {
    limit: 5,
    interval: 60000, // 1 minute in milliseconds
    queue: [],
    lastReset: Date.now()
};

// Add retry logic to image generation
async function generateAndSaveImage(prompt, retryCount = 0) {
    const maxRetries = 3;
    const retryDelay = 65000; // 65 seconds to be safe

    try {
        // Check and update rate limit
        const now = Date.now();
        if (now - imageRateLimit.lastReset > imageRateLimit.interval) {
            imageRateLimit.queue = [];
            imageRateLimit.lastReset = now;
        }

        // If we're at the limit, wait or retry
        if (imageRateLimit.queue.length >= imageRateLimit.limit) {
            if (retryCount >= maxRetries) {
                throw new Error('Max retries reached for image generation');
            }
            console.log(`Rate limit reached, waiting ${retryDelay/1000} seconds before retry ${retryCount + 1}...`);
            await setTimeout(retryDelay);
            return generateAndSaveImage(prompt, retryCount + 1);
        }

        // Add to queue
        imageRateLimit.queue.push(now);

        const response = await fetch('https://api.openai.com/v1/images/generations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: "dall-e-2",
                prompt: prompt,
                n: 2,
                size: "256x256",
                style: "natural",
                quality: "standard"
            })
        });

        const data = await response.json();
        
        // Log the full response for debugging
        console.log('DALL-E API Response:', JSON.stringify(data, null, 2));

        // Check if there's an error in the response
        if (data.error) {
            // If it's a rate limit error, retry
            if (data.error.message.includes('Rate limit exceeded') && retryCount < maxRetries) {
                console.log(`Rate limit error, waiting ${retryDelay/1000} seconds before retry ${retryCount + 1}...`);
                await setTimeout(retryDelay);
                return generateAndSaveImage(prompt, retryCount + 1);
            }
            throw new Error(`DALL-E API Error: ${data.error.message}`);
        }
        
        if (!data.data || !data.data[0] || !data.data[0].url) {
            throw new Error(`Invalid response structure: ${JSON.stringify(data)}`);
        }

        // Download the image
        const imageUrl = data.data[0].url;
        console.log('Attempting to download image from:', imageUrl);
        
        const imageResponse = await fetch(imageUrl);
        if (!imageResponse.ok) {
            throw new Error(`Failed to download image: ${imageResponse.status} ${imageResponse.statusText}`);
        }

        const arrayBuffer = await imageResponse.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        // Generate unique filename
        const filename = `${crypto.randomBytes(16).toString('hex')}.png`;
        const filepath = path.join(imagesDir, filename);
        
        // Save the image
        await fs.writeFile(filepath, buffer);
        console.log('Image saved successfully to:', filepath);
        
        // Return the path relative to public directory
        return `/generated-images/${filename}`;
    } catch (error) {
        console.error('Error in generateAndSaveImage:', error);
        console.error('Error details:', {
            message: error.message,
            stack: error.stack,
            prompt: prompt,
            retryCount
        });

        // If we haven't hit max retries and it's a rate limit error, retry
        if (error.message.includes('Rate limit exceeded') && retryCount < maxRetries) {
            console.log(`Rate limit error, waiting ${retryDelay/1000} seconds before retry ${retryCount + 1}...`);
            await setTimeout(retryDelay);
            return generateAndSaveImage(prompt, retryCount + 1);
        }

        throw error;
    }
}

app.post('/generate', async (req, res) => {
    const prompt = req.query.prompt;
    const model = req.query.model || 'gpt-3.5-turbo';
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
                        try {
                            const imagePath = await generateAndSaveImage(imagePrompt);
                            generatedCode = generatedCode.replace(match[0], imagePath);
                            newImages[imagePrompt] = imagePath;
                        } catch (imageError) {
                            console.error('Failed to generate image:', imageError);
                            // Use a placeholder image instead of failing completely
                            generatedCode = generatedCode.replace(
                                match[0], 
                                'https://placehold.co/512x512/333/fff/png?text=Image+Generation+Failed'
                            );
                        }
                    }
                } catch (error) {
                    console.error('Error processing image:', error);
                    generatedCode = generatedCode.replace(
                        match[0], 
                        'https://placehold.co/512x512/333/fff/png?text=Image+Generation+Failed'
                    );
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

// Add this new endpoint for project generation
app.post('/generate-project', async (req, res) => {
    const prompt = req.query.prompt;
    const model = req.query.model || 'gpt-3.5-turbo';
    const { currentFiles, generatedImages } = req.body;

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
                    content: `Create a multi-page HTML project with the following prompt: ${prompt}. 
                    Current project files: ${JSON.stringify(currentFiles || {}, null, 2)}
                    
                    Return a JSON object with the following structure:
                    {
                        "files": {
                            "index.html": "content",
                            "style.css": "content",
                            "other-pages.html": "content"
                        }
                    }
                    
                    You can include images using {{generate_image: image description}}.
                    Include proper navigation between pages.
                    Just return the JSON and nothing else.` 
                }],
                max_tokens: 4096
            })
        });

        const data = await response.json();
        
        if (data.choices && data.choices[0]) {
            let projectData;
            try {
                projectData = JSON.parse(data.choices[0].message.content);
            } catch (e) {
                throw new Error('Invalid JSON response from AI');
            }

            const newImages = {};
            
            // Process images in all files
            for (const [filename, content] of Object.entries(projectData.files)) {
                let processedContent = content;
                const imageRegex = /{{generate_image:\s*(.*?)}}/g;
                let match;

                while ((match = imageRegex.exec(content)) !== null) {
                    const imagePrompt = match[1];
                    try {
                        if (generatedImages && generatedImages[imagePrompt]) {
                            processedContent = processedContent.replace(match[0], generatedImages[imagePrompt]);
                        } else {
                            const imagePath = await generateAndSaveImage(imagePrompt);
                            processedContent = processedContent.replace(match[0], imagePath);
                            newImages[imagePrompt] = imagePath;
                        }
                    } catch (error) {
                        console.error('Error generating image:', error);
                        processedContent = processedContent.replace(
                            match[0],
                            'https://placehold.co/512x512/333/fff/png?text=Image+Generation+Failed'
                        );
                    }
                }
                projectData.files[filename] = processedContent;
            }

            res.json({
                files: projectData.files,
                newImages
            });
        } else {
            res.status(500).send('Error: No valid response from AI');
        }

    } catch (error) {
        console.error('Error generating project:', error);
        res.status(500).send('Failed to generate project');
    }
});

// Add endpoint for project download
app.post('/download-project', (req, res) => {
    const files = req.body;
    
    res.writeHead(200, {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename=project.zip'
    });

    const archive = archiver('zip', {
        zlib: { level: 9 }
    });

    archive.pipe(res);

    // Add each file to the zip
    Object.entries(files).forEach(([filename, content]) => {
        archive.append(content, { name: filename });
    });

    archive.finalize();
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
