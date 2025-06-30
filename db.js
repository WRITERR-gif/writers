const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./gigs.db');

// Create gigs table if not exists
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS gigs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      file TEXT
    )
  `);
});

module.exports = db;
