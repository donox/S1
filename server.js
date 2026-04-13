require('dotenv').config();

const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/projects',      require('./routes/projects'));
app.use('/api/settings',      require('./routes/settings'));
app.use('/api/usage',         require('./routes/usage'));
app.use('/api/observations',  require('./routes/observations'));
app.use('/api/docs',          require('./routes/docs'));
app.use('/api/notes',         require('./routes/notes'));
app.use('/api/files',         require('./routes/files'));

app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`xTool guide running at http://localhost:${PORT}`));
