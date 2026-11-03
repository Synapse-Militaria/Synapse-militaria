const mongoose = require('mongoose');

async function conectarDB() {
  mongoose.set('bufferCommands', false);
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/synapse-militaria', {
    serverSelectionTimeoutMS: 5000,
  });
  console.log('Conexión a MongoDB lista.');
}

module.exports = conectarDB;
