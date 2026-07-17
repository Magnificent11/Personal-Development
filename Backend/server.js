require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();
app.set('trust proxy', 1);

// 1. Production-Safe CORS Configuration
const allowedOrigins = [
  "http://localhost:3000", // Your local frontend dev port (change if different)
  process.env.FRONTEND_URL // Your live production frontend URL
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      const msg = 'The CORS policy for this site does not allow access from the specified Origin.';
      return callback(new Error(msg), false);
    }
    return callback(null, true);
  },
  credentials: true
}));

// Middleware
app.use(express.json());

// Auth routes
const authRoutes = require('./routes/authRoutes');
app.use('/api/auth', authRoutes);

// Protected routes
const protectedRoutes = require('./routes/protectedRoutes');
app.use('/api/protected', protectedRoutes);

// Habit routes
const habitRoutes = require('./routes/habitRoutes');
app.use('/api/habits', habitRoutes);

// Admin routes
const adminRoutes = require('./routes/adminRoutes');
app.use('/api/admin', adminRoutes);

// Test route
app.get("/", (req, res) => {
  res.send("Server is running and connected.");
});

// 2. Dynamic Port Assignment with Fallback
const PORT = process.env.PORT || 5000;

// Connect to MongoDB + Start Server
mongoose
  .connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 10000, // fail fast if Atlas is unreachable, instead of hanging
  })
  .then(() => {
    console.log("MongoDB connected successfully");
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Database connection error during startup:", err);
    process.exit(1); // Exit process if we can't establish initial DB connection
  });

// 3. Global Safeguards for Unhandled Node Errors
process.on("unhandledRejection", (err) => {
  console.error("Unhandled Promise Rejection:", err);
  // Keep server alive, but log the error so you can debug it via server logs
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
  // Keep server alive, but log the error so you can debug it via server logs
});