// Import necessary packages
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg'); // For PostgreSQL
const fetch = require('node-fetch'); // To make API calls to Pinterest

// Create the Express app
const app = express();

// --- Database Connection ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// --- CORE FUNCTIONS ---

/**
 * Posts a single pin to the Pinterest API.
 * @param {object} pin - The pin object from our database.
 */
async function postToPinterestAPI(pin) {
    console.log(`Attempting to post pin ID: ${pin.id} to board: ${pin.board_id}`);
    try {
        const response = await fetch('https://api.pinterest.com/v5/pins', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${pin.pinterest_token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                board_id: pin.board_id,
                media_source: {
                    source_type: 'image_url',
                    url: pin.image_url
                },
                link: pin.link || null,
                note: pin.description || ' '
            })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.message || `Pinterest API error: ${response.status}`);
        }

        console.log(`✅ Successfully posted pin ID: ${pin.id}. Pinterest Pin ID: ${result.id}`);
        return true;

    } catch (error) {
        console.error(`❌ Failed to post pin ID: ${pin.id}. Reason:`, error.message);
        return false;
    }
}


/**
 * Checks the database for pins that are due to be posted.
 */
async function checkAndPostDuePins() {
  console.log('Scheduler checking for due pins...');
  const client = await pool.connect();
  try {
    // Find pins that are due and not yet posted
    const result = await client.query(
      `SELECT * FROM scheduled_pins WHERE post_at <= NOW() AND is_posted = FALSE`
    );

    const duePins = result.rows;
    if (duePins.length === 0) {
      console.log('No pins are due for posting.');
      return;
    }

    console.log(`Found ${duePins.length} pin(s) to post.`);

    for (const pin of duePins) {
      const success = await postToPinterestAPI(pin);
      if (success) {
        // Mark the pin as posted in the database
        await client.query(
          `UPDATE scheduled_pins SET is_posted = TRUE WHERE id = $1`,
          [pin.id]
        );
        console.log(`Updated pin ID: ${pin.id} to is_posted = TRUE.`);
      }
    }
  } catch (err) {
    console.error('Error during the scheduling check:', err);
  } finally {
    client.release();
  }
}


// --- DATABASE SETUP ---
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

// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json());

// --- API ENDPOINTS ---

// Health check route
app.get('/', (req, res) => {
  res.send('Hello! The Pinterest Automation Server is running and ready.');
});

// Endpoint to schedule a new pin
app.post('/schedule-pin', async (req, res) => {
  const { accessToken, boardId, imageUrl, description, link, scheduleTime } = req.body;

  if (!accessToken || !boardId || !imageUrl || !scheduleTime) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  try {
    const client = await pool.connect();
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

// Endpoint that the Cron Job will call
app.get('/trigger-scheduler', (req, res) => {
  console.log('Received request from Cron Job.');
  checkAndPostDuePins(); // Start the process
  // Respond immediately so the cron job doesn't wait
  res.status(200).send('Scheduler triggered successfully.');
});


// --- START SERVER ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
  setupDatabase();
});
