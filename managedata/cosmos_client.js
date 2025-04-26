const { CosmosClient } = require("@azure/cosmos");

class CosmosClientWrapper {
  constructor(endpoint, key, dbName) {
    this.endpoint = endpoint;
    this.key = key;
    this.dbName = dbName;
    this.client = new CosmosClient({ endpoint, key });
    this.database = this.client.database(dbName);
    this.container = this.database.container("Callflows"); // ⚠️ ปรับชื่อตามของจริง
  }

  async getCallflow(intent) {
    try {
      const { resource } = await this.container.item(intent, intent).read();
      return resource;
    } catch (err) {
      console.error(`[CosmosError] Cannot load callflow for intent: ${intent} =>`, err.message);
      return null;
    }
  }

  // เพิ่มอื่น ๆ เช่น saveCallflow(intent, data) ได้ภายหลัง
}

module.exports = { CosmosClientWrapper };
