const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const noteSchema = new mongoose.Schema({
  content: {
    type: String,
    required: true,  // Encrypted note content
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  expiryDate: {
    type: Date,  // For time-based expiration
  },
  readOnce: {
    type: Boolean,
    default: true,  // Self-destruct after being read once
  },
  password: {
    type: String, // Optional encrypted password
  },
  readStatus: {
    type: Boolean,
    default: false,  // Has the note been read?
  },
  shortlink: {
    type: String,
    unique: true,
    default: uuidv4,  // Generates a random unique shortlink
  }
});

module.exports = mongoose.model('Note', noteSchema);
