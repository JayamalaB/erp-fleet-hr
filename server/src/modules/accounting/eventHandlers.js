// Registers this module's domain-event subscribers (docs 2.5). Currently
// empty: Accounting's optional "auto-draft a SalesInvoice from a completed
// trip" subscription (docs Section 6) is added here once the Fleet module
// (which publishes trip.completed) exists in a later phase of this build.
// Imported for its side effect only - see server.js.
