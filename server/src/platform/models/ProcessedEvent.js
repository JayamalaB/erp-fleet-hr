const mongoose = require('mongoose');

// Dedupe ledger: one row per (event, consumer) pair. The unique index is
// the actual guarantee behind "the same trip must never be paid twice" /
// "prevent duplicate trip processing" - a consumer that is handed the same
// event twice (at-least-once delivery) will fail this insert the second
// time and skip re-applying the handler.
const processedEventSchema = new mongoose.Schema(
  {
    eventId: { type: mongoose.Schema.Types.ObjectId, required: true },
    consumer: { type: String, required: true },
    processedAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);
processedEventSchema.index({ eventId: 1, consumer: 1 }, { unique: true });

module.exports = mongoose.model('ProcessedEvent', processedEventSchema);
