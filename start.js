// Simple script to start the server with the OpenAI API key
// Usage: node start.js YOUR_OPENAI_API_KEY

const { spawn } = require('child_process');

// Get API key from command line argument
const apiKey = process.argv[2];

if (!apiKey) {
  console.log('Usage: node start.js YOUR_OPENAI_API_KEY');
  console.log('Starting without API key (will use fallback random selection)...');
}

// Start the server with the API key as an environment variable
const server = spawn('node', ['index.js'], {
  env: {
    ...process.env,
    OPENAI_API_KEY: apiKey || ''
  }
});

server.stdout.on('data', (data) => {
  console.log(`${data}`);
});

server.stderr.on('data', (data) => {
  console.error(`${data}`);
});

server.on('close', (code) => {
  console.log(`Server process exited with code ${code}`);
}); 