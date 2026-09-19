const mongoose = require('mongoose');

const outboxEventSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    type: { type: String, required: true, index: true }, // e.g. 'trip.completed'
    payload: { type: mongoose.Schema.Types.Mixed, required: true },
    status: { type: String, enum: ['pending', 'dispatched'], default: 'pending', index: true },
    attempts: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
    dispatchedAt: { type: Date },
  },
  { versionKey: false }
);

module.exports = mongoose.model('OutboxEvent', outboxEventSchema);
