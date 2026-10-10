// Constantes de la base de pruebas de la API. La base se llama SIEMPRE agua_tapi: el globalSetup
// se niega a borrar cualquier otra (agua_zmg es la base de desarrollo).
export const DB_NOMBRE = "agua_tapi";
const BASE = process.env.TAPI_PG_BASE ?? "postgres://agua:agua@localhost:5433";
export const DB_URL = `${BASE}/${DB_NOMBRE}`;
export const DB_ADMIN_URL = `${BASE}/postgres`;
