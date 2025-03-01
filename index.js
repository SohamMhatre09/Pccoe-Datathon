const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const { Readable } = require('stream');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const moment = require('moment');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 8000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://pccoe-datathon:pccoe-datathon@pccoe-datathon.7yuc7.mongodb.net/?retryWrites=true&w=majority&appName=pccoe-datathon';
const MAX_DAILY_UPLOADS = process.env.MAX_DAILY_UPLOADS || 5;
const MAX_FILE_SIZE = process.env.MAX_FILE_SIZE || 5 * 1024 * 1024; // 5MB default

// Apply middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(helmet()); // Security headers
app.use(cors()); // Enable CORS for all routes

// Configure error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'production' ? undefined : err.message
  });
});

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    // Validate file type
    if (file.mimetype !== 'text/csv' && !file.originalname.endsWith('.csv')) {
      return cb(new Error('Only CSV files are allowed'), false);
    }
    cb(null, true);
  },
  limits: {
    fileSize: MAX_FILE_SIZE
  }
}).single('file');

// Custom multer error handling
const handleUpload = (req, res, next) => {
  upload(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB` });
      }
      return res.status(400).json({ error: err.message });
    } else if (err) {
      return res.status(400).json({ error: err.message });
    }
    next();
  });
};

// Connect to MongoDB with retry logic
const connectToMongoDB = async (retries = 5, delay = 5000) => {
  for (let i = 0; i < retries; i++) {
    try {
      await mongoose.connect(MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
      });
      console.log('Connected to MongoDB Atlas');
      return;
    } catch (err) {
      console.error(`MongoDB connection attempt ${i + 1} failed:`, err);
      if (i < retries - 1) {
        console.log(`Retrying in ${delay / 1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        console.error('Max retries reached. Exiting application...');
        process.exit(1);
      }
    }
  }
};

// Define Schemas
const scoreSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  f1: { type: Number, required: true },
  accuracy: { type: Number, required: true },
  timestamp: { type: Date, default: Date.now }
}, { timestamps: true });

const uploadCountSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  count: { type: Number, default: 0 },
  date: { type: Date, default: Date.now }
}, { timestamps: true });

// Create models
const Score = mongoose.model('Score', scoreSchema);
const UploadCount = mongoose.model('UploadCount', uploadCountSchema);

// Global variable for ideal test data
let IDEAL_DF = [];

// Implementation of F1Score and Accuracy since ml-evaluate doesn't exist
// Calculate F1 Score
function F1Score(actual, predicted) {
  let truePositives = 0;
  let falsePositives = 0;
  let falseNegatives = 0;
  
  for (let i = 0; i < actual.length; i++) {
    if (actual[i] === 1 && predicted[i] === 1) {
      truePositives++;
    } else if (predicted[i] === 1 && actual[i] === 0) {
      falsePositives++;
    } else if (actual[i] === 1 && predicted[i] === 0) {
      falseNegatives++;
    }
  }
  
  const precision = truePositives / (truePositives + falsePositives) || 0;
  const recall = truePositives / (truePositives + falseNegatives) || 0;
  
  return (precision === 0 || recall === 0) ? 0 : 2 * (precision * recall) / (precision + recall);
}

// Calculate Accuracy
function Accuracy(actual, predicted) {
  let correct = 0;
  for (let i = 0; i < actual.length; i++) {
    if (actual[i] === predicted[i]) {
      correct++;
    }
  }
  return correct / actual.length;
}

// Load ideal test data
const loadIdealTestData = async () => {
  return new Promise((resolve, reject) => {
    try {
      const results = [];
      fs.createReadStream(path.join(__dirname, 'ideal_test.csv'))
        .pipe(csv())
        .on('data', (row) => {
          results.push(row);
        })
        .on('end', () => {
          if (!results.length || !results[0].hasOwnProperty('isFraud')) {
            reject(new Error("Ideal CSV missing 'isFraud' column"));
            return;
          }
          console.log('Ideal test data loaded successfully');
          resolve(results);
        })
        .on('error', (error) => {
          reject(error);
        });
    } catch (error) {
      reject(error);
    }
  });
};

// Scheduled task to reset daily counts
async function resetDailyCounts() {
  try {
    await UploadCount.updateMany({}, { $set: { count: 0, date: new Date() } });
    console.log('Daily upload counts reset');
  } catch (err) {
    console.error('Error resetting counts:', err);
  }
}

// Set up daily reset at midnight
function scheduleReset() {
  const now = new Date();
  const night = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1, // tomorrow
    0, 0, 0 // midnight
  );
  const msToMidnight = night.getTime() - now.getTime();
 
  setTimeout(() => {
    resetDailyCounts();
    scheduleReset(); // Schedule next reset
  }, msToMidnight);
}

// Helper function to parse CSV from buffer
async function parseCSV(buffer) {
  return new Promise((resolve, reject) => {
    const results = [];
    const stream = Readable.from(buffer);
   
    stream
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', (error) => reject(error));
  });
}

// Upload endpoint
app.post('/upload', handleUpload, async (req, res) => {
  try {
    const userId = req.query.user_id;
   
    if (!userId) {
      return res.status(400).json({ error: 'Missing user_id parameter' });
    }
   
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Check daily upload limit
    const today = new Date();
    today.setHours(0, 0, 0, 0);
   
    let userCount = await UploadCount.findOne({
      userId,
      date: { $gte: today }
    });
   
    if (userCount && userCount.count >= MAX_DAILY_UPLOADS) {
      return res.status(429).json({
        error: `Daily upload limit (${MAX_DAILY_UPLOADS}) exceeded`,
        nextReset: moment().endOf('day').format()
      });
    }
   
    // Parse CSV file
    const csvData = await parseCSV(req.file.buffer);
   
    // Validate predictions column
    if (!csvData.length || !csvData[0].hasOwnProperty('predictions')) {
      return res.status(422).json({ error: "Missing 'predictions' column" });
    }
   
    // Extract and validate predictions
    const predictions = [];
    for (let i = 0; i < csvData.length; i++) {
      const predVal = csvData[i].predictions;
      const prediction = parseInt(predVal, 10);
     
      if (isNaN(prediction)) {
        return res.status(422).json({
          error: `Invalid prediction at row ${i+1}: '${predVal}' is not a number`
        });
      }
     
      predictions.push(prediction);
    }
   
    // Validate prediction length
    if (predictions.length !== IDEAL_DF.length) {
      return res.status(422).json({
        error: `Mismatched number of predictions. Expected ${IDEAL_DF.length}, got ${predictions.length}`
      });
    }
   
    // Calculate metrics
    const actuals = IDEAL_DF.map(row => parseInt(row.isFraud, 10));
    const f1 = F1Score(actuals, predictions);
    const accuracy = Accuracy(actuals, predictions);
   
    // Store results in MongoDB
    const timestamp = new Date();
    const score = new Score({
      userId,
      f1,
      accuracy,
      timestamp
    });
   
    await score.save();
   
    // Update upload count
    if (userCount) {
      userCount.count += 1;
      await userCount.save();
    } else {
      await UploadCount.create({
        userId,
        count: 1,
        date: today
      });
    }
   
    return res.status(200).json({
      f1_score: f1,
      accuracy,
      timestamp: timestamp.toISOString(),
      uploadsRemaining: MAX_DAILY_UPLOADS - (userCount ? userCount.count + 1 : 1)
    });
   
  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).json({
      error: 'Server error processing upload',
      message: process.env.NODE_ENV === 'production' ? undefined : error.message
    });
  }
});

// Leaderboard endpoint
app.get('/leaderboard', async (req, res) => {
  try {
    // Get limit parameter or default to 5
    const limit = parseInt(req.query.limit, 10) || 5;
   
    // Aggregate to get best scores per user
    const leaderboard = await Score.aggregate([
      { $group: {
          _id: '$userId',
          f1_score: { $max: '$f1' },
          accuracy: { $max: '$accuracy' },
          latestSubmission: { $max: '$timestamp' }
        }
      },
      { $sort: { f1_score: -1, latestSubmission: 1 } }, // Sort by f1 and then by earliest submission
      { $limit: limit },
      { $project: {
          _id: 0,
          user_id: '$_id',
          f1_score: 1,
          accuracy: 1,
          last_submission: '$latestSubmission'
        }
      }
    ]);
   
    return res.status(200).json({
      leaderboard,
      updated_at: new Date().toISOString()
    });
   
  } catch (error) {
    console.error('Leaderboard error:', error);
    return res.status(500).json({
      error: 'Server error retrieving leaderboard',
      message: process.env.NODE_ENV === 'production' ? undefined : error.message
    });
  }
});

// User scores endpoint
app.get('/scores', async (req, res) => {
  try {
    const userId = req.query.user_id;
   
    if (!userId) {
      return res.status(400).json({ error: 'Missing user_id parameter' });
    }
   
    // Get limit parameter or default to all
    const limit = parseInt(req.query.limit, 10) || 0;
   
    const userScores = await Score.find({ userId }, {
      _id: 0,
      f1: 1,
      accuracy: 1,
      timestamp: 1
    }).sort({ timestamp: -1 }).limit(limit);
   
    // Get daily upload count
    const today = new Date();
    today.setHours(0, 0, 0, 0);
   
    const userCount = await UploadCount.findOne({
      userId,
      date: { $gte: today }
    });
   
    const uploadsToday = userCount ? userCount.count : 0;
   
    return res.status(200).json({
      scores: userScores,
      stats: {
        total_submissions: await Score.countDocuments({ userId }),
        best_f1: await Score.findOne({ userId }).sort({ f1: -1 }).then(doc => doc ? doc.f1 : null),
        uploads_today: uploadsToday,
        uploads_remaining: MAX_DAILY_UPLOADS - uploadsToday
      }
    });
   
  } catch (error) {
    console.error('User scores error:', error);
    return res.status(500).json({
      error: 'Server error retrieving user scores',
      message: process.env.NODE_ENV === 'production' ? undefined : error.message
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    version: process.env.npm_package_version || '1.0.0',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// Initialization and start server
async function startServer() {
  try {
    // Connect to MongoDB
    await connectToMongoDB();
   
    // Load ideal test data
    IDEAL_DF = await loadIdealTestData();
   
    // Schedule daily reset
    scheduleReset();
   
    // Start server
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully');
  mongoose.connection.close(false, () => {
    console.log('MongoDB connection closed');
    process.exit(0);
  });
});

// Start the application
startServer();

module.exports = app;