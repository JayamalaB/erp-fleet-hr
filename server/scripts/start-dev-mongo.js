// Dev-only convenience: spins up a local, ephemeral MongoDB replica set
// (via mongodb-memory-server, already a devDependency for the test suite)
// so `npm run dev` has something to connect to without installing MongoDB
// or Docker locally. Prints the connection URI to stdout and stays alive
// until killed. NOT for production - see README for the Atlas/Render/
// Vercel deployment path used there.
const { MongoMemoryReplSet } = require('mongodb-memory-server');

async function main() {
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const uri = replSet.getUri();
  // eslint-disable-next-line no-console
  console.log(`MONGODB_URI=${uri}`);

  process.on('SIGINT', async () => {
    await replSet.stop();
    process.exit(0);
  });
}

main();
