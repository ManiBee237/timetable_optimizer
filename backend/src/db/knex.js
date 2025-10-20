import knexLib from 'knex'
import cfg from '../../knexfile.js'
export const knex = knexLib(cfg)
