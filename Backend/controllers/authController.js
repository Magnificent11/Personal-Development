const User = require("../models/user");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

// Register new user
exports.register = async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create new user in database
    const newUser = await User.create({
      username,
      password: hashedPassword,
    });
    
    res.json({ 
      message: "User registered", 
      user: { id: newUser._id, username: newUser.username } 
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ error: "Registration failed", details: error });
  }
};

// Login user
exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Find user
    const existingUser = await User.findOne({ username });
    if (!existingUser) {
      return res.status(404).json({ error: "User not found" });
    }
    
    // Compare password
    const validPassword = await bcrypt.compare(password, existingUser.password);
    if (!validPassword) {
      return res.status(400).json({ error: "Invalid password" });
    }
    
    // Create access token (short-lived: 15 minutes)
    const accessToken = jwt.sign(
      { id: existingUser._id, username: existingUser.username },
      process.env.JWT_SECRET,
      { expiresIn: "15m" }
    );
    
    // Create refresh token (long-lived: 7 days)
    const refreshToken = jwt.sign(
      { id: existingUser._id, username: existingUser.username },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: "7d" }
    );
    
    // Save refresh token to database
    existingUser.refreshToken = refreshToken;
    await existingUser.save();
    
    res.json({
      message: "Login successful",
      accessToken: accessToken,
      refreshToken: refreshToken,
      user: {
        id: existingUser._id,
        username: existingUser.username,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Login failed", details: error });
  }
};

// Refresh access token
exports.refresh = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(401).json({ error: "Refresh token required" });
    }
    
    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    
    // Find user and check if refresh token matches
    const user = await User.findById(decoded.id);
    if (!user || user.refreshToken !== refreshToken) {
      return res.status(403).json({ error: "Invalid refresh token" });
    }
    
    // Create new access token
    const newAccessToken = jwt.sign(
      { id: user._id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: "15m" }
    );
    
    res.json({
      accessToken: newAccessToken,
    });
  } catch (error) {
    console.error("Refresh token error:", error);
    res.status(403).json({ error: "Invalid or expired refresh token" });
  }
};

// Logout user
exports.logout = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({ error: "Refresh token required" });
    }
    
    // Find user and remove refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const user = await User.findById(decoded.id);
    
    if (user) {
      user.refreshToken = null;
      await user.save();
    }
    
    res.json({ message: "Logged out successfully" });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({ error: "Logout failed" });
  }
};