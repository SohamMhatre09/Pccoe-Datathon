require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const MongoStore = require('connect-mongo');
const mongoose = require('mongoose');
const multer = require('multer');
const csv = require('csv-parser');
const { Readable } = require('stream');
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
const MAX_FILE_SIZE = process.env.MAX_FILE_SIZE || 5 * 1024 * 1024;
const allowedEmails = process.env.ALLOWED_EMAILS ? process.env.ALLOWED_EMAILS.split(',') : [];

// Configure middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: MONGODB_URI,
    ttl: 14 * 24 * 60 * 60 // 14 days
  }),
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 14 * 24 * 60 * 60 * 1000 // 14 days
  }
}));

// Passport configuration
app.use(passport.initialize());
app.use(passport.session());

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:8000/auth/google/callback',
  userProfileURL: 'https://www.googleapis.com/oauth2/v3/userinfo'
}, (accessToken, refreshToken, profile, done) => {
  const email = profile.emails[0].value;
  
  if (!allowedEmails.includes(email)) {
    return done(null, false, { message: 'Unauthorized email address' });
  }
  
  return done(null, {
    id: profile.id,
    email: email,
    name: profile.displayName
  });
}));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

// Authentication middleware
const isAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: 'Unauthorized - Please log in first' });
};

// Configure multer
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'text/csv' && !file.originalname.endsWith('.csv')) {
      return cb(new Error('Only CSV files are allowed'), false);
    }
    cb(null, true);
  },
  limits: { fileSize: MAX_FILE_SIZE }
}).single('file');

const handleUpload = (req, res, next) => {
  upload(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(413).json({ error: `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB` });
    } else if (err) {
      return res.status(400).json({ error: err.message });
    }
    next();
  });
};

// MongoDB connection
const connectToMongoDB = async (retries = 5, delay = 5000) => {
  for (let i = 0; i < retries; i++) {
    try {
      await mongoose.connect(MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 5000,
      });
      console.log('Connected to MongoDB');
      return;
    } catch (err) {
      console.error(`MongoDB connection attempt ${i + 1} failed:`, err);
      if (i < retries - 1) await new Promise(resolve => setTimeout(resolve, delay));
      else process.exit(1);
    }
  }
};

// Schemas
const scoreSchema = new mongoose.Schema({
  email: { type: String, required: true, index: true },
  f1: { type: Number, required: true },
  accuracy: { type: Number, required: true },
  timestamp: { type: Date, default: Date.now }
}, { timestamps: true });

const uploadCountSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  count: { type: Number, default: 0 },
  date: { type: Date, default: Date.now }
}, { timestamps: true });

const Score = mongoose.model('Score', scoreSchema);
const UploadCount = mongoose.model('UploadCount', uploadCountSchema);

// Ideal test data and CSV parsing
let IDEAL_DF = [];

const loadIdealTestData = async () => {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(path.join(__dirname, 'ideal_test.csv'))
      .pipe(csv())
      .on('data', (row) => results.push(row))
      .on('end', () => {
        if (!results.length || !results[0].hasOwnProperty('isFraud')) {
          reject(new Error("Ideal CSV missing 'isFraud' column"));
        }
        console.log('Ideal test data loaded');
        resolve(results);
      })
      .on('error', reject);
  });
};

// Daily reset logic
async function resetDailyCounts() {
  try {
    await UploadCount.updateMany({}, { $set: { count: 0, date: new Date() } });
    console.log('Daily upload counts reset');
  } catch (err) {
    console.error('Error resetting counts:', err);
  }
}

function scheduleReset() {
  const now = new Date();
  const msToMidnight = new Date(now).setHours(24,0,0,0) - now;
  setTimeout(() => {
    resetDailyCounts();
    scheduleReset();
  }, msToMidnight);
}

// Auth routes
app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/auth/google/callback', 
  passport.authenticate('google', { 
    failureRedirect: '/login-failed',
    session: true 
  }),
  (req, res) => {
    res.redirect(process.env.FRONTEND_URL || '/');
  }
);

app.get('/logout', (req, res) => {
  req.logout((err) => {
    if (err) return res.status(500).json({ error: 'Logout failed' });
    res.redirect(process.env.FRONTEND_URL || '/');
  });
});

app.get('/current-user', isAuthenticated, (req, res) => {
  res.json({
    email: req.user.email,
    name: req.user.name,
    uploadsRemaining: MAX_DAILY_UPLOADS - req.user.uploadsToday
  });
});

// Upload endpoint
app.post('/upload', isAuthenticated, handleUpload, async (req, res) => {
  try {
    const userEmail = req.user.email;
    const today = new Date().setHours(0,0,0,0);

    let userCount = await UploadCount.findOne({
      email: userEmail,
      date: { $gte: new Date(today) }
    });

    if (userCount?.count >= MAX_DAILY_UPLOADS) {
      return res.status(429).json({
        error: `Daily upload limit (${MAX_DAILY_UPLOADS}) exceeded`,
        resetTime: moment().endOf('day').toISOString()
      });
    }

    const csvData = await parseCSV(req.file.buffer);
    const predictions = csvData.map(row => {
      const prediction = parseInt(row.predictions, 10);
      if (isNaN(prediction)) throw new Error(`Invalid prediction: ${row.predictions}`);
      return prediction;
    });

    if (predictions.length !== IDEAL_DF.length) {
      return res.status(422).json({
        error: `Expected ${IDEAL_DF.length} predictions, got ${predictions.length}`
      });
    }

    const actuals = IDEAL_DF.map(row => parseInt(row.isFraud, 10));
    const f1 = F1Score(actuals, predictions);
    const accuracy = Accuracy(actuals, predictions);

    await Score.create({ email: userEmail, f1, accuracy });
    
    if (userCount) {
      userCount.count += 1;
      await userCount.save();
    } else {
      await UploadCount.create({ email: userEmail, count: 1 });
    }

    res.json({
      f1_score: f1,
      accuracy,
      uploadsRemaining: MAX_DAILY_UPLOADS - (userCount?.count || 0) - 1,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      error: 'Server error processing upload',
      message: process.env.NODE_ENV === 'production' ? undefined : error.message
    });
  }
});

// Data routes
app.get('/leaderboard', isAuthenticated, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 5;
    const leaderboard = await Score.aggregate([
      { $group: {
          _id: '$email',
          f1: { $max: '$f1' },
          accuracy: { $max: '$accuracy' },
          lastSubmission: { $max: '$timestamp' }
        }
      },
      { $sort: { f1: -1, lastSubmission: 1 } },
      { $limit: limit },
      { $project: {
          email: '$_id',
          f1: 1,
          accuracy: 1,
          lastSubmission: 1,
          _id: 0
        }
      }
    ]);
    res.json({ leaderboard });
  } catch (error) {
    res.status(500).json({ error: 'Error fetching leaderboard' });
  }
});

app.get('/scores', isAuthenticated, async (req, res) => {
  try {
    const userEmail = req.user.email;
    const limit = parseInt(req.query.limit, 10) || 0;
    
    const scores = await Score.find({ email: userEmail })
      .sort({ timestamp: -1 })
      .limit(limit)
      .select('-_id f1 accuracy timestamp');

    const today = new Date().setHours(0,0,0,0);
    const uploadCount = await UploadCount.findOne({
      email: userEmail,
      date: { $gte: new Date(today) }
    });

    res.json({
      scores,
      stats: {
        totalSubmissions: await Score.countDocuments({ email: userEmail }),
        bestF1: await Score.findOne({ email: userEmail }).sort({ f1: -1 }),
        uploadsToday: uploadCount?.count || 0,
        uploadsRemaining: MAX_DAILY_UPLOADS - (uploadCount?.count || 0)
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Error fetching scores' });
  }
});

// Helper functions
async function parseCSV(buffer) {
  return new Promise((resolve, reject) => {
    const results = [];
    Readable.from(buffer)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', reject);
  });
}

function F1Score(actual, predicted) {
  let [tp, fp, fn] = [0, 0, 0];
  actual.forEach((a, i) => {
    if (a === 1 && predicted[i] === 1) tp++;
    if (predicted[i] === 1 && a === 0) fp++;
    if (a === 1 && predicted[i] === 0) fn++;
  });
  const precision = tp / (tp + fp) || 0;
  const recall = tp / (tp + fn) || 0;
  return precision + recall === 0 ? 0 : 2 * (precision * recall) / (precision + recall);
}

function Accuracy(actual, predicted) {
  let correct = 0;
  actual.forEach((a, i) => correct += a === predicted[i] ? 1 : 0);
  return correct / actual.length;
}

// Server initialization
async function startServer() {
  try {
    await connectToMongoDB();
    IDEAL_DF = await loadIdealTestData();
    scheduleReset();
    
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Allowed emails: ${allowedEmails.join(', ')}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  mongoose.connection.close(false, () => {
    console.log('MongoDB connection closed');
    process.exit(0);
  });
});

startServer();

module.exports = app;
