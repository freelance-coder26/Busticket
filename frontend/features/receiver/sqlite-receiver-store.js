import { Capacitor } from "@capacitor/core";
import { CapacitorSQLite, SQLiteConnection } from "@capacitor-community/sqlite";
import { MemoryReceiverStore } from "./memory-receiver-store.js";

const DATABASE_NAME = "gorohitech_receiver";
let storePromise;

export class SqliteReceiverStore {
  constructor(database) {
    this.database = database;
  }

  static async open() {
    const connection = new SQLiteConnection(CapacitorSQLite);
    const database = await connection.createConnection(DATABASE_NAME, false, "no-encryption", 1, false);
    await database.open();
    await database.execute(`
      CREATE TABLE IF NOT EXISTS service_configs (
        service_id TEXT PRIMARY KEY NOT NULL,
        payload_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS receiver_sales (
        client_id TEXT PRIMARY KEY NOT NULL,
        ticket_number TEXT UNIQUE NOT NULL,
        service_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('PENDING', 'SYNCED', 'REJECTED')),
        message TEXT,
        server_result_json TEXT
      );
      CREATE INDEX IF NOT EXISTS receiver_sales_service_idx
        ON receiver_sales(service_id, ticket_number);
      CREATE TABLE IF NOT EXISTS ticket_reprints (
        client_id TEXT PRIMARY KEY NOT NULL,
        duplicate_count INTEGER NOT NULL DEFAULT 0 CHECK (duplicate_count >= 0)
      );
      CREATE TABLE IF NOT EXISTS ticket_counters (
        device_id TEXT PRIMARY KEY NOT NULL,
        current_value INTEGER NOT NULL
      );
    `);
    return new SqliteReceiverStore(database);
  }

  async saveConfiguration(configuration) {
    await this.database.run(
      `INSERT INTO service_configs(service_id, payload_json) VALUES(?, ?)
       ON CONFLICT(service_id) DO UPDATE SET payload_json = excluded.payload_json`,
      [configuration.service.id, JSON.stringify(configuration)],
    );
  }

  async getConfiguration(serviceId) {
    const result = await this.database.query(
      "SELECT payload_json FROM service_configs WHERE service_id = ?",
      [serviceId],
    );
    return result.values?.[0] ? JSON.parse(result.values[0].payload_json) : null;
  }

  async listConfigurations() {
    const result = await this.database.query("SELECT payload_json FROM service_configs");
    return (result.values ?? []).map(({ payload_json }) => JSON.parse(payload_json));
  }

  async createSale(input) {
    await this.database.beginTransaction();
    try {
      const result = await this.database.query(
        "SELECT current_value FROM ticket_counters WHERE device_id = ?",
        [input.appareilId],
      );
      const counter = (result.values?.[0]?.current_value ?? 0) + 1;
      const ticket = {
        clientVenteId: input.clientVenteId,
        numeroTicket: `${input.prefixeTicket}-${String(counter).padStart(6, "0")}`,
        serviceId: input.serviceId,
        appareilId: input.appareilId,
        monteeRepereId: input.monteeRepereId,
        destinationRepereId: input.destinationRepereId,
        troncons: input.troncons,
        prixUnitaireGnf: input.prixUnitaireGnf,
        montantGnf: input.montantGnf,
        vendueAtClient: input.vendueAtClient,
      };
      await this.database.run(
        `INSERT INTO ticket_counters(device_id, current_value) VALUES(?, ?)
         ON CONFLICT(device_id) DO UPDATE SET current_value = excluded.current_value`,
        [input.appareilId, counter],
      );
      await this.database.run(
        `INSERT INTO receiver_sales
          (client_id, ticket_number, service_id, device_id, payload_json, status)
         VALUES(?, ?, ?, ?, ?, 'PENDING')`,
        [input.clientVenteId, ticket.numeroTicket, input.serviceId, input.appareilId, JSON.stringify(ticket)],
      );
      await this.database.commitTransaction();
      return { data: ticket, status: "PENDING", message: null };
    } catch (error) {
      await this.database.rollbackTransaction();
      throw error;
    }
  }

  async getSales(serviceId) {
    const result = serviceId
      ? await this.database.query(
        `SELECT sales.*, COALESCE(reprints.duplicate_count, 0) AS duplicate_count
         FROM receiver_sales AS sales
         LEFT JOIN ticket_reprints AS reprints ON reprints.client_id = sales.client_id
         WHERE sales.service_id = ? ORDER BY sales.rowid DESC`,
        [serviceId],
      )
      : await this.database.query(
        `SELECT sales.*, COALESCE(reprints.duplicate_count, 0) AS duplicate_count
         FROM receiver_sales AS sales
         LEFT JOIN ticket_reprints AS reprints ON reprints.client_id = sales.client_id
         ORDER BY sales.rowid DESC`,
      );
    return (result.values ?? []).map((row) => ({
      data: JSON.parse(row.payload_json),
      status: row.status,
      message: row.message,
      serverResult: row.server_result_json ? JSON.parse(row.server_result_json) : null,
      duplicateCount: row.duplicate_count,
    }));
  }

  async getPendingSales() {
    const result = await this.database.query(
      "SELECT payload_json FROM receiver_sales WHERE status = 'PENDING' ORDER BY rowid",
    );
    return (result.values ?? []).map((row) => ({ data: JSON.parse(row.payload_json), status: "PENDING" }));
  }

  async countUnsyncedSales(serviceId) {
    const result = await this.database.query(
      "SELECT COUNT(*) AS count FROM receiver_sales WHERE service_id = ? AND status != 'SYNCED'",
      [serviceId],
    );
    return result.values?.[0]?.count ?? 0;
  }

  async markSaleSynced(clientVenteId, result) {
    const update = await this.database.run(
      `UPDATE receiver_sales SET status = 'SYNCED', message = NULL, server_result_json = ?
       WHERE client_id = ?`,
      [JSON.stringify(result), clientVenteId],
    );
    if (!update.changes?.changes) throw new Error(`Vente locale introuvable : ${clientVenteId}`);
  }

  async markSaleRejected(clientVenteId, message) {
    const update = await this.database.run(
      "UPDATE receiver_sales SET status = 'REJECTED', message = ? WHERE client_id = ?",
      [message, clientVenteId],
    );
    if (!update.changes?.changes) throw new Error(`Vente locale introuvable : ${clientVenteId}`);
  }

  async retrySale(clientVenteId) {
    await this.database.run(
      "UPDATE receiver_sales SET status = 'PENDING', message = NULL WHERE client_id = ? AND status = 'REJECTED'",
      [clientVenteId],
    );
  }

  async recordDuplicatePrint(clientVenteId) {
    const result = await this.database.run(
      `INSERT INTO ticket_reprints(client_id, duplicate_count)
       SELECT client_id, 1 FROM receiver_sales WHERE client_id = ?
       ON CONFLICT(client_id) DO UPDATE SET duplicate_count = duplicate_count + 1`,
      [clientVenteId],
    );
    if (!result.changes?.changes) throw new Error(`Vente locale introuvable : ${clientVenteId}`);
    const count = await this.database.query(
      "SELECT duplicate_count FROM ticket_reprints WHERE client_id = ?",
      [clientVenteId],
    );
    return count.values?.[0]?.duplicate_count;
  }
}

export function getReceiverStore() {
  if (!storePromise) {
    storePromise = Capacitor.isNativePlatform()
      ? SqliteReceiverStore.open()
      : Promise.resolve(new MemoryReceiverStore());
  }
  return storePromise;
}
