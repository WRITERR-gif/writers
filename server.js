require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const twilio = require('twilio');
const multer = require('multer');
const session = require('express-session');
const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

const app = express();
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: false }));
app.use(express.static('public'));

// ensure uploads folder exists
const uploadsPath = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}

// Postgres pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,  // load from .env
  ssl: {
    rejectUnauthorized: false
  }
});

// create gigs table if not exists
pool.query(`
  CREATE TABLE IF NOT EXISTS gigs (
    id SERIAL PRIMARY KEY,
    title TEXT,
    description TEXT,
    file TEXT
  )
`).then(() => console.log('Connected to Postgres, gigs table ready'))
  .catch((err) => console.error('Error initializing Postgres:', err));

// session
app.use(session({
  secret: 'supersecretbrokey',
  resave: false,
  saveUninitialized: false
}));

// multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsPath);
  },
  filename: function (req, file, cb) {
    const uniqueName = Date.now() + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});
const upload = multer({ storage });

// middleware
function checkAdminAuth(req, res, next) {
  if (req.session && req.session.adminLoggedIn) {
    next();
  } else {
    res.redirect('/admin/login');
  }
}

// homepage gigs
app.get("/", async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM gigs`);
    res.render("index", { gigs: result.rows });
  } catch (err) {
    console.error(err);
    res.send("Error loading gigs.");
  }
});

// bid page
app.get("/bid/:id", async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM gigs WHERE id = $1`, [req.params.id]);
    const gig = result.rows[0];
    if (!gig) {
      return res.status(404).send("Gig not found");
    }
    res.render("bid", { gig });
  } catch (err) {
    console.error(err);
    res.send("Error fetching gig.");
  }
});

// submit bid via WhatsApp
app.post("/submit-bid", async (req, res) => {
  const { name, bidMessage, gigTitle, whatsapp, mpesaMessage } = req.body;
  const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH);
  try {
    await client.messages.create({
      from: process.env.TWILIO_NUMBER,
      to: process.env.MY_NUMBER,
      body: `New Bid on ${gigTitle}
Name: ${name}
WhatsApp: ${whatsapp}
M-PESA: ${mpesaMessage}

Bid Message:
${bidMessage}`
    });
    res.send("Your bid has been submitted successfully!");
  } catch (err) {
    console.log(err);
    res.send("Error sending your bid, try again.");
  }
});

// admin login
app.get("/admin/login", (req, res) => {
  res.render("admin_login");
});
app.post("/admin/login", (req, res) => {
  const { username, password } = req.body;
  if (username === process.env.ADMIN_USER && password === "admin") {
    req.session.adminLoggedIn = true;
    res.redirect("/admin/dashboard");
  } else {
    res.send("Invalid credentials.");
  }
});

// admin dashboard
app.get("/admin/dashboard", checkAdminAuth, async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM gigs`);
    res.render("admin_dashboard", { gigs: result.rows });
  } catch (err) {
    console.error(err);
    res.send("Error loading gigs.");
  }
});

// add new gig
app.get("/admin/new-gig", checkAdminAuth, (req, res) => {
  res.render("admin_newgig");
});
app.post("/admin/new-gig", checkAdminAuth, upload.single('file'), async (req, res) => {
  const { title, description } = req.body;
  let filePath = null;
  if (req.file) {
    filePath = "/uploads/" + req.file.filename;
  }
  try {
    await pool.query(
      `INSERT INTO gigs (title, description, file) VALUES ($1, $2, $3)`,
      [title, description, filePath]
    );
    res.redirect("/admin/dashboard");
  } catch (err) {
    console.error(err);
    res.send("Error adding gig.");
  }
});

// delete gig
app.post("/admin/delete-gig/:id", checkAdminAuth, async (req, res) => {
  try {
    await pool.query(`DELETE FROM gigs WHERE id = $1`, [req.params.id]);
    res.redirect('/admin/dashboard');
  } catch (err) {
    console.error(err);
    res.send("Error deleting gig.");
  }
});

// admin logout
app.get("/admin/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/admin/login");
  });
});

// port
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
