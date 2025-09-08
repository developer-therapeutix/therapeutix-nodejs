const mongoose = require('mongoose');

const AttachmentSchema = new mongoose.Schema(
  {
    filename: { type: String },
    key: { type: String }, // S3 key or storage identifier
    mimeType: { type: String },
    size: { type: Number },
  },
  { _id: false }
);

// Generate a short, readable ticket id like SR-20250908-ABC123
function generateTicketId() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const date = `${yyyy}${mm}${dd}`;
  const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `SR-${date}-${rand}`;
}

const SupportRequestSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    ticketId: { type: String, unique: true, index: true },
    subject: { type: String, required: true, trim: true },
    message: { type: String, required: true },
    attachments: { type: [AttachmentSchema], default: [] },
    status: { type: String, enum: ['open', 'in_progress', 'closed'], default: 'open' },
    metadata: { type: mongoose.Schema.Types.Mixed },
    closed: { type: Boolean, default: false },
    closedAt: { type: Date },
    closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }

  },
  { timestamps: true }
);

// Ensure a unique ticketId is set before validation
SupportRequestSchema.pre('validate', async function (next) {
  if (this.ticketId) return next();
  try {
    const Model = this.constructor;
    for (let i = 0; i < 5; i++) {
      const candidate = generateTicketId();
      // Check uniqueness
      const exists = await Model.findOne({ ticketId: candidate }).lean();
      if (!exists) {
        this.ticketId = candidate;
        return next();
      }
    }
    // Fallback if collisions persist
    this.ticketId = `SR-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    next();
  } catch (err) {
    next(err);
  }
});

module.exports =
  mongoose.models.SupportRequest ||
  mongoose.model('SupportRequest', SupportRequestSchema);
