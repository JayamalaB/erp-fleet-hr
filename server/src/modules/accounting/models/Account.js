const mongoose = require('mongoose');
const { tenantScoped } = require('../../../platform/tenantPlugin');
const { auditable } = require('../../../platform/auditPlugin');

const ACCOUNT_TYPES = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'];

const accountSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ACCOUNT_TYPES, required: true },
    parentAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'Account', default: null },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, versionKey: false }
);

accountSchema.index({ companyId: 1, code: 1 }, { unique: true });
accountSchema.plugin(tenantScoped);
accountSchema.plugin(auditable, { entity: 'Account' });

module.exports = mongoose.model('Account', accountSchema);
module.exports.ACCOUNT_TYPES = ACCOUNT_TYPES;
