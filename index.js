// Import necessary packages
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg'); // Import the pg library

// Create the Express app
const app = express();

// --- Database Connection ---
// The Pool will use the DATABASE_URL environment variable automatically
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false // Required for Render's database connections
  }
});

// Function to create the table if it doesn't exist
async function setupDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS scheduled_pins (
        id SERIAL PRIMARY KEY,
        pinterest_token TEXT NOT NULL,
        board_id TEXT NOT NULL,
        image_url TEXT NOT NULL,
        description TEXT,
        link TEXT,
        post_at TIMESTAMP NOT NULL,
        is_posted BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Database table is ready.');
  } catch (err) {
    console.error('Error setting up the database table:', err);
  } finally {
    client.release();
  }
}


// Use middleware
app.use(cors()); // Allows our frontend to talk to this backend
app.use(express.json()); // Allows the server to understand JSON data

// A simple route to check if the server is running
app.get('/', (req, res) => {
  res.send('Hello! The Pinterest Automation Server is running and connected to the database.');
});

// --- API Endpoint to schedule a pin ---
app.post('/schedule-pin', async (req, res) => {
  // We get the data from the request body
  const { accessToken, boardId, imageUrl, description, link, scheduleTime } = req.body;

  // Basic validation
  if (!accessToken || !boardId || !imageUrl || !scheduleTime) {
    return res.status(400).json({ error: 'Missing required fields for scheduling.' });
  }

  try {
    const client = await pool.connect();
    // Insert the pin data into our database
    await client.query(
      `INSERT INTO scheduled_pins (pinterest_token, board_id, image_url, description, link, post_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [accessToken, boardId, imageUrl, description, link, scheduleTime]
    );
    client.release();
    console.log('Successfully saved a pin to the database.');
    res.status(201).json({ message: 'Pin scheduled successfully!' });
  } catch (err) {
    console.error('Error saving pin to database:', err);
    res.status(500).json({ error: 'Failed to schedule pin.' });
  }
});


// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
  // Setup the database table when the server starts
  setupDatabase();
});
