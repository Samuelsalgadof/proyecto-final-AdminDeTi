const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 3000;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, '..', 'public')));

async function initDb() {
  await pool.query(`CREATE TABLE IF NOT EXISTS programas (
    id SERIAL PRIMARY KEY,
    nombre TEXT NOT NULL,
    nivel TEXT NOT NULL,
    duracion TEXT NOT NULL)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS inscripciones (
    id SERIAL PRIMARY KEY,
    nombre TEXT NOT NULL,
    correo TEXT NOT NULL,
    programa_id INT REFERENCES programas(id),
    fecha TIMESTAMP DEFAULT NOW())`);
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM programas');
  if (rows[0].n === 0) {
    await pool.query(`INSERT INTO programas (nombre, nivel, duracion) VALUES
      ('Análisis y Desarrollo de Software', 'Tecnólogo', '27 meses'),
      ('Gestión de Redes de Datos', 'Tecnólogo', '27 meses'),
      ('Sistemas', 'Técnico', '15 meses'),
      ('Gestión Contable y de Información Financiera', 'Tecnólogo', '24 meses')`);
  }
}

app.get('/api/programas', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM programas ORDER BY id');
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/inscripciones', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT i.id, i.nombre, p.nombre AS programa, i.fecha
       FROM inscripciones i LEFT JOIN programas p ON p.id = i.programa_id
       ORDER BY i.id DESC LIMIT 20`);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/inscripciones', async (req, res) => {
  const { nombre, correo, programa_id } = req.body;
  if (!nombre || !correo || !programa_id) return res.status(400).send('Faltan datos');
  try {
    await pool.query(
      'INSERT INTO inscripciones (nombre, correo, programa_id) VALUES ($1, $2, $3)',
      [nombre, correo, programa_id]);
    res.redirect('/?ok=1#inscripcion');
  } catch (e) {
    res.status(400).send('Error: ' + e.message);
  }
});

app.get('/health', async (req, res) => {
  try {
    const r = await pool.query('SELECT NOW() AS hora, current_database() AS db');
    res.json({ estado: 'ok', base_de_datos: r.rows[0].db, hora_db: r.rows[0].hora });
  } catch (e) {
    res.status(500).json({ estado: 'error', detalle: e.message });
  }
});

initDb()
  .then(() => app.listen(port, '0.0.0.0', () => console.log(`Sitio SENA en puerto ${port}`)))
  .catch((e) => { console.error('No se pudo conectar a la base de datos:', e.message); process.exit(1); });
