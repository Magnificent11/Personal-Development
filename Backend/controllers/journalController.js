const Journal = require("../models/journal");

// Get all journal entries for user
exports.getJournals = async (req, res) => {
  try {
    const journals = await Journal.find({ userId: req.user.id }).sort({ date: -1 });
    res.json({ journals });
  } catch (error) {
    console.error("Get journals error:", error);
    res.status(500).json({ error: "Failed to fetch journal entries" });
  }
};

// Create new journal entry
exports.createJournal = async (req, res) => {
  try {
    const { title, content } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: "Title and content are required" });
    }

    const journal = await Journal.create({
      userId: req.user.id,
      title,
      content,
      date: new Date()
    });

    res.status(201).json({ journal });
  } catch (error) {
    console.error("Create journal error:", error);
    res.status(500).json({ error: "Failed to create journal entry" });
  }
};

// Update journal entry
exports.updateJournal = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content } = req.body;

    const journal = await Journal.findOne({ _id: id, userId: req.user.id });

    if (!journal) {
      return res.status(404).json({ error: "Journal entry not found" });
    }

    if (title) journal.title = title;
    if (content) journal.content = content;

    await journal.save();

    res.json({ journal });
  } catch (error) {
    console.error("Update journal error:", error);
    res.status(500).json({ error: "Failed to update journal entry" });
  }
};

// Delete journal entry
exports.deleteJournal = async (req, res) => {
  try {
    const { id } = req.params;

    const journal = await Journal.findOneAndDelete({ _id: id, userId: req.user.id });

    if (!journal) {
      return res.status(404).json({ error: "Journal entry not found" });
    }

    res.json({ message: "Journal entry deleted successfully" });
  } catch (error) {
    console.error("Delete journal error:", error);
    res.status(500).json({ error: "Failed to delete journal entry" });
  }
};