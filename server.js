require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const twilio = require('twilio');
const multer = require('multer');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
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

// sqlite3 db
const db = new sqlite3.Database('./writers.db', (err) => {
    if (err) {
        console.error(err.message);
    } else {
        console.log('Connected to SQLite database');
    }
});

// create gigs table if not exists
db.run(`
    CREATE TABLE IF NOT EXISTS gigs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        description TEXT,
        file TEXT
    )
`);

// session
app.use(session({
    secret: 'supersecretbrokey',
    resave: false,
    saveUninitialized: false
}));

// multer for uploads
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

// middleware to protect admin routes
function checkAdminAuth(req, res, next) {
    if (req.session && req.session.adminLoggedIn) {
        next();
    } else {
        res.redirect('/admin/login');
    }
}

// homepage gigs
app.get("/", (req, res) => {
    db.all(`SELECT * FROM gigs`, [], (err, rows) => {
        if (err) {
            console.error(err.message);
            res.send("Error loading gigs.");
        } else {
            res.render("index", { gigs: rows });
        }
    });
});

// bid page
app.get("/bid/:id", (req, res) => {
    db.get(`SELECT * FROM gigs WHERE id = ?`, [req.params.id], (err, row) => {
        if (err) {
            console.error(err.message);
            return res.status(500).send("Error fetching gig.");
        }
        if (!row) {
            return res.status(404).send("Gig not found");
        }
        res.render("bid", { gig: row });
    });
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
app.get("/admin/dashboard", checkAdminAuth, (req, res) => {
    db.all(`SELECT * FROM gigs`, [], (err, rows) => {
        if (err) {
            console.error(err.message);
            res.send("Error loading gigs.");
        } else {
            res.render("admin_dashboard", { gigs: rows });
        }
    });
});

// add new gig
app.get("/admin/new-gig", checkAdminAuth, (req, res) => {
    res.render("admin_newgig");
});
app.post("/admin/new-gig", checkAdminAuth, upload.single('file'), (req, res) => {
    const { title, description } = req.body;
    let filePath = null;
    if (req.file) {
        filePath = "/uploads/" + req.file.filename;
    }
    db.run(`INSERT INTO gigs (title, description, file) VALUES (?, ?, ?)`,
        [title, description, filePath],
        function (err) {
            if (err) {
                console.error(err.message);
                res.send("Error adding gig.");
            } else {
                res.redirect("/admin/dashboard");
            }
        }
    );
});

// delete gig
app.post("/admin/delete-gig/:id", checkAdminAuth, (req, res) => {
    db.run(`DELETE FROM gigs WHERE id = ?`, [req.params.id], function (err) {
        if (err) {
            console.error(err.message);
        }
        res.redirect('/admin/dashboard');
    });
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
