const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

let replSet;

// A replica set (not a standalone) is required because the app uses
// multi-document ACID transactions (session.withTransaction) throughout
// the accounting posting flow - a standalone mongod does not support them.
async function startTestDb() {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  const uri = replSet.getUri();
  await mongoose.connect(uri);
}

async function stopTestDb() {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  if (replSet) await replSet.stop();
}

async function clearTestDb() {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
}

module.exports = { startTestDb, stopTestDb, clearTestDb };
