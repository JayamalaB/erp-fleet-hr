const mongoose = require('mongoose');

const companySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    baseCurrency: { type: String, default: 'SAR' },
    vatRegistrationNo: { type: String },
    vatRate: { type: Number, default: 0.15 }, // company-level tax rate, not hardcoded in business logic
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

module.exports = mongoose.model('Company', companySchema);
