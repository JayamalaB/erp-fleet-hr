const mongoose = require('mongoose');
const { tenantScoped } = require('../../../platform/tenantPlugin');
const { auditable } = require('../../../platform/auditPlugin');

// One row per document instance (per renewal), never a mutable
// "insuranceExpiry" field on Vehicle - keeps prior renewals queryable
// (docs 4.7).
const vehicleDocumentSchema = new mongoose.Schema(
  {
    vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', required: true, index: true },
    type: { type: String, enum: ['registration', 'insurance', 'inspection', 'permit'], required: true },
    documentNo: { type: String },
    issueDate: { type: Date, required: true },
    expiryDate: { type: Date, required: true, index: true },
    fileRef: { type: String },
  },
  { timestamps: true, versionKey: false }
);

vehicleDocumentSchema.plugin(tenantScoped);
vehicleDocumentSchema.plugin(auditable, { entity: 'VehicleDocument' });

module.exports = mongoose.model('VehicleDocument', vehicleDocumentSchema);
