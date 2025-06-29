require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const twilio = require('twilio');
const multer = require('multer');
const session = require('express-session');
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

// session
app.use(session({
    secret: 'supersecretbrokey',
    resave: false,
    saveUninitialized: false
}));

// configure multer
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

// gigs store
let gigs = [
    { id: 1, title: "Write 1000 word article on AI", description: "Write a detailed AI article for a blog post.", file: null },
    { id: 2, title: "Proofread 5 essays", description: "Check grammar, punctuation, and flow.", file: null },
];

// middleware for admin routes
function checkAdminAuth(req, res, next) {
    if (req.session && req.session.adminLoggedIn) {
        next();
    } else {
        res.redirect('/admin/login');
    }
}

// homepage gigs
app.get("/", (req, res) => {
    res.render("index", { gigs });
});

// bid page
app.get("/bid/:id", (req, res) => {
    const gig = gigs.find(g => g.id == req.params.id);
    if (!gig) {
        return res.status(404).send("Gig not found");
    }
    res.render("bid", { gig });
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
    res.render("admin_dashboard", { gigs });
});

// post new gig with description
app.get("/admin/new-gig", checkAdminAuth, (req, res) => {
    res.render("admin_newgig");
});

app.post("/admin/new-gig", checkAdminAuth, upload.single('file'), (req, res) => {
    const { title, description } = req.body;
    let filePath = null;
    if (req.file) {
        filePath = "/uploads/" + req.file.filename;
    }
    const newGig = {
        id: gigs.length + 1,
        title,
        description,
        file: filePath
    };
    gigs.push(newGig);
    res.redirect("/admin/dashboard");
});

// delete gig
app.post("/admin/delete-gig/:id", checkAdminAuth, (req, res) => {
    const id = parseInt(req.params.id);
    gigs = gigs.filter(g => g.id !== id);
    res.redirect('/admin/dashboard');
});

// admin logout
app.get("/admin/logout", (req, res) => {
    req.session.destroy(() => {
        res.redirect("/admin/login");
    });
});

// Render + local compatible:
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
