const path = require('node:path');
const express = require('express');
const { openDb } = require('./db.js');
const { createItemsRouter } = require('./routes/items.js');

const PORT = 4100;
const dbPath = path.join(__dirname, 'tracker.db');
const db = openDb(dbPath);

const app = express();
app.use(express.json());
app.use('/api/items', createItemsRouter(db));
app.use(express.static(path.join(__dirname, 'public')));

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Tracker running at http://localhost:${PORT}`);
  });
}

module.exports = { app };
