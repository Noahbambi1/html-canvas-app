import fetch from 'node-fetch';  // Import fetch dynamically
import dotenv from 'dotenv';  // Import dotenv module
import express from 'express';  // Import express
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import archiver from 'archiver';
import { setTimeout } from 'timers/promises';
import { WebSocketServer } from 'ws';
import http from 'http';

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

// Replace the Google Custom Search configuration
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const SEARCH_ENGINE_ID = process.env.SEARCH_ENGINE_ID;

// Modified image generation function
async function generateImage(prompt, useDallE = true) {
    if (!prompt) {
        console.error('Empty prompt received in generateImage');
        return generatePlaceholder('Invalid Image Prompt');
    }

    try {
        const imagePath = useDallE ? 
            await generateAndSaveImage(prompt) : 
            await searchAndSaveImage(prompt);
        
        // Return just the path if it's already a complete img tag
        if (imagePath.startsWith('<img')) {
            return imagePath;
        }
        
        // Otherwise, wrap it in an img tag
        return `<img src="${imagePath}" alt="${prompt}" style="max-width: 100%; height: auto; border-radius: 8px;">`;
    } catch (error) {
        console.error('Error in generateImage:', error);
        return `<img src="${generatePlaceholder('Image Generation Failed')}" alt="Error generating image" style="max-width: 100%; height: auto; border-radius: 8px;">`;
    }
}

// Add Google image search function
async function searchAndSaveImage(prompt) {
    try {
        if (!GOOGLE_API_KEY || !SEARCH_ENGINE_ID) {
            console.error('Missing Google API credentials');
            return generatePlaceholder('Missing Google API Configuration');
        }

        const searchUrl = `https://customsearch.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${SEARCH_ENGINE_ID}&q=${encodeURIComponent(prompt)}&searchType=image&num=1&safe=active&imgSize=MEDIUM`;
        
        const response = await fetch(searchUrl);
        const data = await response.json();

        // Log the response for debugging
        console.log('Google Search API Response:', JSON.stringify(data, null, 2));

        if (data.error) {
            console.error('Google API Error:', data.error);
            return generatePlaceholder(data.error.message);
        }

        if (!data.items || data.items.length === 0) {
            console.error('No images found for prompt:', prompt);
            return generatePlaceholder('No Images Found');
        }

        const imageUrl = data.items[0].link;
        console.log('Found image URL:', imageUrl);

        try {
            // Download and save the image
            const imageResponse = await fetch(imageUrl);
            if (!imageResponse.ok) {
                throw new Error(`Failed to download image: ${imageResponse.status}`);
            }

            const arrayBuffer = await imageResponse.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            
            const filename = `${crypto.randomBytes(16).toString('hex')}.png`;
            const filepath = path.join(imagesDir, filename);
            
            await fs.writeFile(filepath, buffer);
            console.log('Image saved successfully to:', filepath);
            
            return `/generated-images/${filename}`;
        } catch (downloadError) {
            console.error('Error downloading image:', downloadError);
            // If download fails, return the direct URL instead
            return imageUrl;
        }
    } catch (error) {
        console.error('Error in searchAndSaveImage:', error);
        return generatePlaceholder('Image Search Failed');
    }
}

// Helper function to generate placeholder images
function generatePlaceholder(message) {
    const encodedMessage = encodeURIComponent(message);
    return `https://placehold.co/512x512/333/fff/png?text=${encodedMessage}`;
}

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
                return 'https://placehold.co/512x512/333/fff/png?text=Rate+Limit+Reached';
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
                n: 1,
                size: "256x256",
                style: "natural",
                quality: "standard"
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`DALL-E API Error: ${errorData.error?.message || response.statusText}`);
        }

        const data = await response.json();
        console.log('DALL-E API Response:', JSON.stringify(data, null, 2));

        // Validate response structure
        if (!data?.data?.[0]?.url) {
            console.error('Invalid DALL-E response structure:', data);
            return 'https://placehold.co/512x512/333/fff/png?text=Invalid+Response';
        }

        const imageUrl = data.data[0].url;
        console.log('Downloading image from:', imageUrl);

        // Download the image
        const imageResponse = await fetch(imageUrl);
        if (!imageResponse.ok) {
            throw new Error(`Failed to download image: ${imageResponse.status}`);
        }

        const arrayBuffer = await imageResponse.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        const filename = `${crypto.randomBytes(16).toString('hex')}.png`;
        const filepath = path.join(imagesDir, filename);
        
        await fs.writeFile(filepath, buffer);
        console.log('Image saved successfully to:', filepath);
        
        return `/generated-images/${filename}`;

    } catch (error) {
        console.error('Error in generateAndSaveImage:', {
            message: error.message,
            prompt: prompt,
            retryCount: retryCount
        });
        
        // Handle rate limit errors
        if (error.message.includes('Rate limit exceeded') && retryCount < maxRetries) {
            console.log(`Rate limit error, waiting ${retryDelay/1000} seconds before retry ${retryCount + 1}...`);
            await setTimeout(retryDelay);
            return generateAndSaveImage(prompt, retryCount + 1);
        }

        // For other errors, return a placeholder with the error message
        const errorMessage = error.message.replace(/[^a-zA-Z0-9]/g, '+');
        return `https://placehold.co/512x512/333/fff/png?text=${errorMessage}`;
    }
}

// Update the processImages function to handle image tags properly
async function processImages(content, generatedImages, useDallE) {
    if (!content) {
        console.error('Empty content received in processImages');
        return { content: '', newImages: {} };
    }

    const imageRegex = /{{generate_image:\s*(.*?)}}/g;
    let match;
    const newImages = {};
    let processedContent = content;

    const imagePromises = [];
    while ((match = imageRegex.exec(content)) !== null) {
        const imagePrompt = match?.[1]?.trim();
        const fullMatch = match?.[0];
        
        if (!imagePrompt || !fullMatch) {
            console.warn('Invalid image prompt match:', match);
            continue;
        }
        
        if (generatedImages && generatedImages[imagePrompt]) {
            const cachedImage = generatedImages[imagePrompt];
            // Use cached image as-is if it's already an img tag
            const imgTag = cachedImage.startsWith('<img') ? 
                cachedImage : 
                `<img src="${cachedImage}" alt="${imagePrompt}" style="max-width: 100%; height: auto; border-radius: 8px;">`;
            processedContent = processedContent.replace(fullMatch, imgTag);
        } else {
            imagePromises.push(
                generateImage(imagePrompt, useDallE)
                    .then(imagePath => ({
                        prompt: imagePrompt,
                        imagePath: imagePath || generatePlaceholder('Generation Failed'),
                        match: fullMatch
                    }))
                    .catch(error => {
                        console.error(`Error generating image for prompt "${imagePrompt}":`, error);
                        return {
                            prompt: imagePrompt,
                            imagePath: generatePlaceholder('Generation Error'),
                            match: fullMatch,
                            error
                        };
                    })
            );
        }
    }

    if (imagePromises.length > 0) {
        try {
            const results = await Promise.all(imagePromises);
            
            for (const result of results) {
                if (!result || !result.match || !result.imagePath) {
                    console.warn('Invalid result from image generation:', result);
                    continue;
                }
                
                processedContent = processedContent.replace(result.match, result.imagePath);
                if (result.prompt) {
                    // Store the complete img tag in newImages
                    newImages[result.prompt] = result.imagePath;
                }
            }
        } catch (error) {
            console.error('Error processing image promises:', error);
        }
    }

    return {
        content: processedContent,
        newImages
    };
}

// Update the /generate endpoint to handle initial and subsequent prompts differently
app.post('/generate', async (req, res) => {
    const prompt = req.query.prompt;
    const model = req.query.model || 'gpt-3.5-turbo';
    const { currentCode, generatedImages, useDallE = true, isInitialPrompt = true } = req.body;

    if (!prompt) {
        return res.status(400).send('Prompt is required');
    }

    try {
        const promptContent = isInitialPrompt ? 
            `Create a web page with the following prompt: ${prompt}. 
            Include product images using the syntax {{generate_image: description of product}}.
            The HTML should render the image link in an image tag like this:
            <img src="{{generate_image: professional photo of product}}" alt="Product description">
            
            Make sure to:
            1. Generate unique images for each product
            2. Include proper image descriptions in the generate_image tags
            3. Use descriptive alt text for accessibility
            4. Keep image sizes reasonable
            5. Always wrap image placeholders in proper <img> tags
            
            Current HTML: ${currentCode || 'None'}
            Just return the HTML and nothing else.` 
            : 
            `Update the current HTML with the following changes: ${prompt}
            
            Keep all existing image tags and their structure.
            If new images are needed, use the same format: {{generate_image: description}}
            
            Current HTML:
            ${currentCode}
            
            Just return the complete updated HTML and nothing else.`;

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
                    content: promptContent
                }],
                max_tokens: 4096
            })
        });

        const data = await response.json();

        if (data && data.choices && data.choices.length > 0) {
            let generatedCode = data.choices[0].message.content.trim();
            
            // Process and wait for all images
            const { content: processedContent, newImages } = 
                await processImages(generatedCode, generatedImages, useDallE);

            // Send final response with all images processed
            res.json({ 
                code: processedContent,
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
    const { currentFiles, generatedImages, useDallE = true } = req.body;

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
                    
                    For images, use the syntax {{generate_image: description}} inside img tags like this:
                    <img src="{{generate_image: description of image}}" alt="Description">
                    
                    The HTML should render the image link in an image tag.
                    Make sure all image placeholders are properly wrapped in <img> tags.
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
                            const imagePath = await generateImage(imagePrompt, useDallE);
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

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Handle WebSocket connections
wss.on('connection', function connection(ws) {
    ws.on('error', console.error);
    
    // Send a ping every 30 seconds to keep connection alive
    const interval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.ping();
        }
    }, 30000);

    ws.on('close', () => {
        clearInterval(interval);
    });
});

// Update image generation to notify clients
function notifyImageGenerated(loadingId, imagePath) {
    try {
        const message = JSON.stringify({
            type: 'imageGenerated',
            loadingId,
            imagePath
        });

        wss.clients.forEach(function each(client) {
            if (client.readyState === WebSocket.OPEN) {
                try {
                    client.send(message);
                } catch (err) {
                    console.error('Error sending to client:', err);
                }
            }
        });
    } catch (error) {
        console.error('Error in notifyImageGenerated:', error);
    }
}

// Start the server with WebSocket support
server.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
