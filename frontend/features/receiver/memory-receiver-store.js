export class MemoryReceiverStore {
  configurations = new Map();
  sales = new Map();
  counters = new Map();
  duplicatePrints = new Map();

  async saveConfiguration(configuration) {
    this.configurations.set(configuration.service.id, structuredClone(configuration));
  }

  async getConfiguration(serviceId) {
    const configuration = this.configurations.get(serviceId);
    return configuration ? structuredClone(configuration) : null;
  }

  async listConfigurations() {
    return [...this.configurations.values()].map((configuration) => structuredClone(configuration));
  }

  async createSale(input) {
    if (this.sales.has(input.clientVenteId)) {
      throw new Error(`Identifiant de vente déjà utilisé : ${input.clientVenteId}`);
    }
    const previousCount = this.counters.get(input.appareilId) ?? 0;
    const counter = previousCount + 1;
    this.counters.set(input.appareilId, counter);
    const sale = {
      data: {
        ...input,
        numeroTicket: `${input.prefixeTicket}-${String(counter).padStart(6, "0")}`,
      },
      status: "PENDING",
      message: null,
      duplicateCount: 0,
    };
    this.sales.set(input.clientVenteId, sale);
    return structuredClone(sale);
  }

  async getSales(serviceId) {
    return [...this.sales.values()]
      .filter(({ data }) => !serviceId || data.serviceId === serviceId)
      .sort((left, right) => right.data.vendueAtClient.localeCompare(left.data.vendueAtClient))
      .map((sale) => ({
        ...structuredClone(sale),
        duplicateCount: this.duplicatePrints.get(sale.data.clientVenteId) ?? 0,
      }));
  }

  async getPendingSales() {
    return [...this.sales.values()]
      .filter((sale) => sale.status === "PENDING")
      .map((sale) => structuredClone(sale));
  }

  async countUnsyncedSales(serviceId) {
    return [...this.sales.values()].filter(
      (sale) => sale.data.serviceId === serviceId && sale.status !== "SYNCED",
    ).length;
  }

  async markSaleSynced(clientVenteId, result) {
    const sale = this.sales.get(clientVenteId);
    if (!sale) throw new Error(`Vente locale introuvable : ${clientVenteId}`);
    this.sales.set(clientVenteId, { ...sale, status: "SYNCED", serverResult: result, message: null });
  }

  async markSaleRejected(clientVenteId, message) {
    const sale = this.sales.get(clientVenteId);
    if (!sale) throw new Error(`Vente locale introuvable : ${clientVenteId}`);
    this.sales.set(clientVenteId, { ...sale, status: "REJECTED", message });
  }

  async retrySale(clientVenteId) {
    const sale = this.sales.get(clientVenteId);
    if (!sale || sale.status !== "REJECTED") return;
    this.sales.set(clientVenteId, { ...sale, status: "PENDING", message: null });
  }

  async recordDuplicatePrint(clientVenteId) {
    if (!this.sales.has(clientVenteId)) throw new Error(`Vente locale introuvable : ${clientVenteId}`);
    const count = (this.duplicatePrints.get(clientVenteId) ?? 0) + 1;
    this.duplicatePrints.set(clientVenteId, count);
    return count;
  }
}
