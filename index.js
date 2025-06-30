const express = require('express');
const app = express();
const path = require('path');

// set view engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// serve static assets
app.use(express.static(path.join(__dirname, 'public')));

// routes
app.get("/", (req, res) => {
  res.render("index", { title: "Welcome to WritersHub" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});
