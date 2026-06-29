require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();

// Middleware
app.use(express.json());
app.use(cors());

// Auth routes
const authRoutes = require('./routes/authRoutes');
app.use('/api/auth', authRoutes);

// Protected routes
const protectedRoutes = require('./routes/protectedRoutes');
app.use('/api/protected', protectedRoutes);

// Goal routes
const goalRoutes = require('./routes/goalRoutes');
app.use('/api/goals', goalRoutes);

// Habit routes
const habitRoutes = require('./routes/habitRoutes');
app.use('/api/habits', habitRoutes);

// Journal routes
const journalRoutes = require('./routes/journalRoutes');
app.use('/api/journals', journalRoutes);

// Test route
app.get("/", (req, res) => {
  res.send("Server is running and connected.");
});

// Connect to MongoDB + Start Server
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB connected successfully");
    app.listen(process.env.PORT, () => {
      console.log(`Server running on port ${process.env.PORT}`);
    });
  })
  .catch((err) => console.log("Database connection error:", err));