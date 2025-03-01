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
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 8000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://pccoe-datathon:pccoe-datathon@pccoe-datathon.7yuc7.mongodb.net/?retryWrites=true&w=majority&appName=pccoe-datathon';
const MAX_DAILY_UPLOADS = process.env.MAX_DAILY_UPLOADS || 5;
const MAX_FILE_SIZE = process.env.MAX_FILE_SIZE || 5 * 1024 * 1024; // 5MB default
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-should-be-in-env-variable';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '24h';

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

// User schema for authentication
const userSchema = new mongoose.Schema({
  username: { 
    type: String, 
    required: true, 
    unique: true, 
    trim: true 
  },
  password: { 
    type: String, 
    required: true 
  },
  isAdmin: {
    type: Boolean,
    default: false
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
});

// Create models
const Score = mongoose.model('Score', scoreSchema);
const UploadCount = mongoose.model('UploadCount', uploadCountSchema);
const User = mongoose.model('User', userSchema);

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
          // Check if we have any valid fraud label column
          const firstRow = results[0] || {};
          const hasValidColumn = Object.keys(firstRow).some(key => 
            ['fraudlabel', 'isfraud', 'fraud'].includes(key.toLowerCase())
          );
          
          if (!results.length || !hasValidColumn) {
            reject(new Error("Ideal CSV missing fraud label column"));
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

// JWT Authentication middleware
const authenticateJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  const token = authHeader.split(' ')[1];

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Forbidden: Invalid token' });
    }

    req.user = user;
    next();
  });
};

// Create initial admin user
const createInitialUser = async () => {
  try {
    const existingUser = await User.findOne({ username: 'SohamMhatre123' });
    
    if (!existingUser) {
      const hashedPassword = await bcrypt.hash('Mahos@420!', 10);
      await User.create({
        username: 'SohamMhatre123',
        password: hashedPassword,
        isAdmin: true
      });
      console.log('Initial admin user created');
    }
  } catch (error) {
    console.error('Error creating initial user:', error);
  }
};

// Authentication routes

// Register route (Admin only)
app.post('/register', authenticateJWT, async (req, res) => {
  try {
    // Check if requester is admin
    if (!req.user.isAdmin) {
      return res.status(403).json({ error: 'Only admins can register new users' });
    }

    const { username, password, isAdmin } = req.body;

    // Validate input
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user
    const newUser = await User.create({
      username,
      password: hashedPassword,
      isAdmin: isAdmin || false
    });

    res.status(201).json({
      message: 'User created successfully',
      user: {
        id: newUser._id,
        username: newUser.username,
        isAdmin: newUser.isAdmin
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      error: 'Server error during registration',
      message: process.env.NODE_ENV === 'production' ? undefined : error.message
    });
  }
});

// Login route
app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validate input
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // Find user
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user._id, username: user.username, isAdmin: user.isAdmin },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        username: user.username,
        isAdmin: user.isAdmin
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: 'Server error during login',
      message: process.env.NODE_ENV === 'production' ? undefined : error.message
    });
  }
});

// Change password route
app.post('/change-password', authenticateJWT, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const userId = req.user.id;

    // Validate input
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: 'Old password and new password are required' });
    }

    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify old password
    const isPasswordValid = await bcrypt.compare(oldPassword, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    user.password = hashedPassword;
    await user.save();

    res.status(200).json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({
      error: 'Server error during password change',
      message: process.env.NODE_ENV === 'production' ? undefined : error.message
    });
  }
});

// FIXED Upload endpoint
app.post('/upload', authenticateJWT, handleUpload, async (req, res) => {
  try {
    const userId = req.user.username;
   
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
    
    if (!csvData.length) {
      return res.status(422).json({
        error: "Empty CSV file",
        details: "The uploaded file contains no data"
      });
    }

    // Check for required columns (case-insensitive)
    const firstRow = csvData[0];
    const columnKeys = Object.keys(firstRow);
    
    // Look for isFraud column (might be named differently)
    const fraudColKey = columnKeys.find(k => k.toLowerCase() === 'isfraud' || k.toLowerCase() === 'fraudlabel');
    
    if (!fraudColKey) {
      return res.status(422).json({
        error: "Missing required column",
        details: "CSV must contain a column named 'isFraud' or 'FraudLabel'"
      });
    }

    // Extract transaction IDs if present (for ordering)
    const transactionIdKey = columnKeys.find(k => k.toLowerCase() === 'transactionid');
    const hasTransactionId = !!transactionIdKey;

    // Prepare to extract predictions
    const predictions = [];
    const predictionMap = {};
    
    // Process predictions
    for (let i = 0; i < csvData.length; i++) {
      const row = csvData[i];
      const predVal = row[fraudColKey];
      const prediction = parseInt(predVal, 10);
      
      // Validate prediction values
      if (isNaN(prediction) || ![0, 1].includes(prediction)) {
        return res.status(422).json({
          error: `Invalid value at row ${i+1}`,
          details: `Value '${predVal}' in column '${fraudColKey}' must be 0 or 1`
        });
      }
      
      // If we have transaction IDs, store with mapping
      if (hasTransactionId) {
        const transactionId = row[transactionIdKey];
        predictionMap[transactionId] = prediction;
      } else {
        // Otherwise just collect in order
        predictions.push(prediction);
      }
    }
    
    // Determine ideal data fraud label column
    const idealFraudColumn = Object.keys(IDEAL_DF[0]).find(k => 
      ['fraudlabel', 'isfraud', 'fraud'].includes(k.toLowerCase())
    );
    
    if (!idealFraudColumn) {
      return res.status(500).json({
        error: 'Server configuration error',
        details: 'Could not find fraud label column in reference data'
      });
    }
    
    // If we have transaction IDs, order predictions to match ideal data
    const idealTransactionIdColumn = Object.keys(IDEAL_DF[0]).find(k => 
      k.toLowerCase() === 'transactionid'
    );
    
    let orderedPredictions = [];
    
    if (hasTransactionId && idealTransactionIdColumn) {
      // Match by transaction ID
      for (const idealRow of IDEAL_DF) {
        const transactionId = idealRow[idealTransactionIdColumn];
        if (!predictionMap.hasOwnProperty(transactionId)) {
          return res.status(422).json({
            error: `Missing prediction`,
            details: `No prediction provided for TransactionID: ${transactionId}`
          });
        }
        orderedPredictions.push(predictionMap[transactionId]);
      }
    } else {
      // Use the predictions as-is, but check length
      orderedPredictions = predictions;
    }
    
    // Validate prediction count matches ideal dataset
    if (orderedPredictions.length !== IDEAL_DF.length) {
      return res.status(422).json({
        error: `Row count mismatch`,
        details: `File contains ${orderedPredictions.length} predictions. Required exactly ${IDEAL_DF.length} predictions matching the test set.`
      });
    }
    
    // Calculate metrics using ideal data actuals
    const actuals = IDEAL_DF.map(row => parseInt(row[idealFraudColumn], 10));
    const f1 = F1Score(actuals, orderedPredictions);
    const accuracy = Accuracy(actuals, orderedPredictions);
   
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

// FIXED Leaderboard endpoint - publicly accessible
app.get('/leaderboard', async (req, res) => {
  try {
    // Get limit parameter or default to 5
    const limit = parseInt(req.query.limit, 10) || 5;
   
    // First find the best f1 score for each user
    const bestScores = await Score.aggregate([
      // Group by userId to find max f1 score
      { $group: {
          _id: '$userId',
          maxF1: { $max: '$f1' },
          entries: { $push: { f1: '$f1', accuracy: '$accuracy', timestamp: '$timestamp', _id: '$_id' } }
        }
      },
      // For each user, find entry with max f1 (in case of ties, take earliest)
      { $addFields: {
          bestEntry: {
            $filter: {
              input: '$entries',
              as: 'entry',
              cond: { $eq: ['$$entry.f1', '$maxF1'] }
            }
          }
        }
      },
      { $addFields: {
          // Sort entries with same F1 by timestamp (ascending)
          sortedBestEntries: { $sortArray: { input: '$bestEntry', sortBy: { timestamp: 1 } } }
        }
      },
      // Extract first entry (earliest with highest F1)
      { $addFields: {
          bestEntry: { $arrayElemAt: ['$sortedBestEntries', 0] }
        }
      },
      // Format output
      { $project: {
          _id: 0,
          user_id: '$_id',
          f1_score: '$bestEntry.f1',
          accuracy: '$bestEntry.accuracy',
          last_submission: '$bestEntry.timestamp'
        }
      },
      // Sort by f1 score descending
      { $sort: { f1_score: -1, last_submission: 1 } },
      { $limit: limit }
    ]);
   
    return res.status(200).json({
      leaderboard: bestScores,
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

// FIXED User scores endpoint - protected
app.get('/scores', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.username;
   
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
    
    // Fixed best F1 query
    const bestScore = await Score.findOne({ userId }, {}, { sort: { f1: -1 } });
   
    return res.status(200).json({
      scores: userScores,
      stats: {
        total_submissions: await Score.countDocuments({ userId }),
        best_f1: bestScore ? bestScore.f1 : null,
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

// Admin route to get all users
app.get('/users', authenticateJWT, async (req, res) => {
  try {
    // Check if requester is admin
    if (!req.user.isAdmin) {
      return res.status(403).json({ error: 'Only admins can access user list' });
    }

    const users = await User.find({}, { password: 0 });
    
    res.status(200).json({ users });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      error: 'Server error retrieving users',
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

// Verifying authentication status
app.get('/verify-token', authenticateJWT, (req, res) => {
  res.status(200).json({
    authenticated: true,
    user: {
      username: req.user.username,
      isAdmin: req.user.isAdmin
    }
  });
});

// Row count endpoint for client information
app.get('/row-count', async (req, res) => {
  try {
    res.status(200).json({ 
      rowCount: IDEAL_DF.length,
      expectedColumns: {
        prediction: Object.keys(IDEAL_DF[0]).find(k => ['fraudlabel', 'isfraud'].includes(k.toLowerCase())),
        transactionId: Object.keys(IDEAL_DF[0]).find(k => k.toLowerCase() === 'transactionid')
      }
    });
  } catch (error) {
    console.error('Error getting row count:', error);
    res.status(500).json({ error: 'Failed to get row count' });
  }
});

// Endpoint to check expected format for uploads
app.get('/upload-format', async (req, res) => {
  try {
    // Determine required columns from ideal dataset
    const idealColumns = Object.keys(IDEAL_DF[0]);
    const fraudColumn = idealColumns.find(k => ['fraudlabel', 'isfraud'].includes(k.toLowerCase()));
    const transactionColumn = idealColumns.find(k => k.toLowerCase() === 'transactionid');
    
    res.status(200).json({
      expectedFormat: {
        required: fraudColumn || 'isFraud',
        recommendedColumns: transactionColumn ? [transactionColumn, fraudColumn || 'isFraud'] : [fraudColumn || 'isFraud'],
        validValues: [0, 1],
        rowCount: IDEAL_DF.length,
        example: {
          [transactionColumn || 'TransactionID']: 'TX123456',
          [fraudColumn || 'isFraud']: 1
        }
      }
    });
  } catch (error) {
    console.error('Error getting upload format:', error);
    res.status(500).json({ error: 'Failed to get upload format information' });
  }
});

// Initialization and start server
async function startServer() {
  try {
    // Connect to MongoDB
    await connectToMongoDB();
   
    // Create initial admin user
    await createInitialUser();
    
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