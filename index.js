// Import necessary packages
const express = require('express');
const cors = require('cors');

// Create the Express app
const app = express();

// Use middleware
app.use(cors()); // Allows our frontend to talk to this backend
app.use(express.json()); // Allows the server to understand JSON data

// A simple route to check if the server is running
app.get('/', (req, res) => {
  res.send('Hello! The Pinterest Automation Server is running.');
});

// --- We will add the scheduling logic here later ---


// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});
