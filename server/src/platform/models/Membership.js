const mongoose = require('mongoose');

// Deliberately NOT tenant-scoped via the plugin: a user's own membership
// list must be readable before any company is selected (login flow), and
// this is the join table that makes company selection possible at all.
// Every query against it filters explicitly by userId or companyId by hand.
const membershipSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    roles: { type: [String], default: [] },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);
membershipSchema.index({ userId: 1, companyId: 1 }, { unique: true });

module.exports = mongoose.model('Membership', membershipSchema);
