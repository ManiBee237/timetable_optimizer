import 'dotenv/config'

const client = process.env.DB_CLIENT || (process.env.SQLITE_PATH ? 'sqlite' : 'mysql2')

const cfgs = {
  sqlite: {
    client: 'sqlite3',
    connection: { filename: process.env.SQLITE_PATH || './data/timeweave.db' },
    useNullAsDefault: true, // sqlite
    pool: { min: 1, max: 1 }
  },
  mysql2: {
    client: 'mysql2',
    connection: {
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD ?? process.env.DB_PASS,
      database: process.env.DB_NAME || 'timeweave'
    },
    pool: { min: 0, max: 10 }
  }
}

export default cfgs[client]
