const express = require('express');
const { AzureOpenAI } = require('openai');
require('dotenv/config');
const path = require('path');

// Use the port provided by Azure or default to 3000
const port = process.env.PORT || 3000;
const app = express();
app.use(express.json());

// Serve the static files from the React app
app.use(express.static(path.join(__dirname, 'public')));

const client = new AzureOpenAI({
    endpoint: process.env.AZURE_OPENAI_ENDPOINT,
    apiKey: process.env.AZURE_OPENAI_API_KEY,
    apiVersion: "2024-05-01-preview"
});

const assistantId = 'asst_rr4YP8tMjfRHK8Ql1pntyKMp';

const formatResponse = (prompt, assistantResponse) => {
    // Extract citations and their sources
    const citations = [];
    const sourcePattern = /\[([^\]]+)†source\]/g;
    let match;
    
    while ((match = sourcePattern.exec(assistantResponse)) !== null) {
        citations.push(match[1]);
    }

    // Replace citation markers with proper references
    let formattedResponse = assistantResponse.replace(/\[([^\]]+)†source\]/g, (match, p1) => {
        return `[${p1}]`;
    });

    // Add sources section if there are citations
    if (citations.length > 0) {
        formattedResponse += '\n\nSources:\n';
        citations.forEach((citation, index) => {
            formattedResponse += `[${citation}] Document ${citation}\n`;
        });
    }

    if (prompt.toLowerCase().includes("flow") || prompt.toLowerCase().includes("diagram")) {
        // Check if assistant response already contains a Mermaid diagram
        if (formattedResponse.includes("```mermaid")) {
            return `You asked: "${prompt}"\n\n${formattedResponse}`;
        }
        
        // If no diagram in response, wrap it in one
        return `
You asked: "${prompt}"

### Response
${formattedResponse}

### Flowchart
\`\`\`mermaid
${formattedResponse.includes("graph") ? formattedResponse : 
`graph TD
    A[Set to In Development] --> B[Create Transport Request]
    B --> C[Include Changes in Transports]
    C --> D[Release Subtask]
    D --> E[Change Status to TO BE TESTED]
    E --> F[Confirm Successful Test]
    F --> G[Import Change to Production]`}
\`\`\``;
    }

    return `You asked: "${prompt}"\n\n${formattedResponse}`;
};

app.get('/api/init', (req, res) => {
    res.json({
        message: `Olá! Hello!\n\nI'm your Yara ChaRM Assistant. How can I help you today?\nEu sou seu assistente Yara ChaRM. Como posso ajudar você hoje?`
    });
});

app.post('/api/chat', async (req, res) => {
    try {
        console.log("Incoming user message:", req.body.message);

        const thread = await client.beta.threads.create();
        console.log("Thread created with ID:", thread.id);

        await client.beta.threads.messages.create(thread.id, {
            role: 'user',
            content: req.body.message
        });

        const run = await client.beta.threads.runs.create(thread.id, {
            assistant_id: assistantId
        });

        let runStatus;
        do {
            await new Promise(resolve => setTimeout(resolve, 1000));
            runStatus = await client.beta.threads.runs.retrieve(thread.id, run.id);
            console.log("Run status:", runStatus.status);
        } while (runStatus.status === 'in_progress' || runStatus.status === 'queued');

        const messages = await client.beta.threads.messages.list(thread.id);
        console.log("Full thread messages:", JSON.stringify(messages, null, 2));

        const assistantMessage = messages.data.find(msg => msg.role === 'assistant');
        const assistantResponse = assistantMessage?.content[0]?.text?.value || "No response provided.";
        console.log("Assistant generated response:", assistantResponse);

        const finalResponse = formatResponse(req.body.message, assistantResponse);

        res.json({ response: finalResponse });
    } catch (error) {
        console.error('Error during processing:', error);
        res.status(500).json({ error: error.message });
    }
});

// Serve index.html for all other routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => console.log(`Server running on port ${port}`));