require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { CosmosClient } = require("@azure/cosmos");

const app = express();
app.use(cors());
app.use(express.json());

const endpoint = process.env.COSMOS_DB_ENDPOINT;
const key = process.env.COSMOS_DB_KEY;
const databaseId = process.env.COSMOS_DB_DATABASE;

const callflowsContainerId = process.env.COSMOS_DB_CONTAINER_CALLFLOWS || process.env.COSMOS_DB_CONTAINER;
const messageGroupContainerId = process.env.COSMOS_DB_CONTAINER_MESSAGEGROUP || "messagegroup";

const client = new CosmosClient({ endpoint, key });
const database = client.database(databaseId);
const callflowsContainer = database.container(callflowsContainerId);
const messageGroupContainer = database.container(messageGroupContainerId);
const { getCosmosClient } = require('./managedata/db_switcher');

const categoriesMenuLinkContainerId =
  process.env.COSMOS_DB_CONTAINER_CATEGORIES_MENU_LINK || "categories_menu_link";
const categoriesMenuLinkContainer =
  database.container(categoriesMenuLinkContainerId);

const apiPrefix = process.env.API_PREFIX || "/editcallflow"; // ✅ configurable

// =================== Callflows API ===================

app.get(`${apiPrefix}/api/callflows`, async (req, res) => {
  try {
    const { resources } = await callflowsContainer.items.query("SELECT * FROM c ORDER BY c._ts DESC").fetchAll();
    res.json(resources);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch callflows", details: error.message });
  }
});

app.get(`${apiPrefix}/api/callflows/:id`, async (req, res) => {
  try {
    const { resource } = await callflowsContainer.item(req.params.id, req.params.id).read();
    res.json(resource);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch callflow" });
  }
});

app.get(`${apiPrefix}/api/callflows/intent/:intent`, async (req, res) => {
  try {
    const querySpec = {
      query: "SELECT * FROM c WHERE c.intent = @intent",
      parameters: [{ name: "@intent", value: req.params.intent }]
    };
    const { resources } = await callflowsContainer.items.query(querySpec).fetchAll();
    if (!resources.length) return res.status(404).json({ error: "Callflow not found" });
    res.json(resources[0]);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch callflow", details: error.message });
  }
});

app.get(`${apiPrefix}/api/clear-duplicates/:intent`, async (req, res) => {
  try {
    const intent = req.params.intent;
    const querySpec = {
      query: "SELECT * FROM c WHERE c.intent = @intent",
      parameters: [{ name: "@intent", value: intent }]
    };
    const { resources } = await callflowsContainer.items.query(querySpec).fetchAll();
    if (!resources.length) return res.json({ message: "No records found" });

    const firstItem = resources[0];
    const itemsToDelete = resources.slice(1);
    const deletePromises = itemsToDelete.map(item =>
      callflowsContainer.item(item.id).delete().catch(() => null)
    );
    await Promise.allSettled(deletePromises);
    res.json({ success: true, message: `Kept ID ${firstItem.id}, deleted ${itemsToDelete.length}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post(`${apiPrefix}/api/callflows`, async (req, res) => {
  try {
    const callflowData = req.body;
    if (callflowData.intent) {
      const querySpec = {
        query: "SELECT * FROM c WHERE c.intent = @intent",
        parameters: [{ name: "@intent", value: callflowData.intent }]
      };
      const { resources } = await callflowsContainer.items.query(querySpec).fetchAll();
      if (resources.length > 0) {
        callflowData.id = resources[0].id;
        const response = await callflowsContainer.items.upsert(callflowData);
        return res.json({ ...response.resource, message: "Updated existing callflow" });
      }
    }

    callflowData.id = callflowData.id || `cf-${Date.now()}-${callflowData.intent || 'unknown'}`;
    const response = await callflowsContainer.items.create(callflowData);
    res.json(response.resource);
  } catch (error) {
    res.status(500).json({ error: "Failed to create callflow", details: error.message });
  }
});

app.put(`${apiPrefix}/api/callflows/intent/:intent`, async (req, res) => {
  try {
    const intent = req.params.intent;
    const callflowData = req.body;

    const querySpec = {
      query: "SELECT * FROM c WHERE c.intent = @intent",
      parameters: [{ name: "@intent", value: intent }]
    };
    const { resources } = await callflowsContainer.items.query(querySpec).fetchAll();

    let response;
    if (resources.length > 0) {
      const existingItem = resources[0];
      const itemsToDelete = resources.slice(1);
      await Promise.allSettled(
        itemsToDelete.map(item => callflowsContainer.item(item.id).delete().catch(() => null))
      );
      callflowData.id = existingItem.id;
      response = await callflowsContainer.items.upsert(callflowData);
    } else {
      callflowData.id = callflowData.id || `cf-${Date.now()}-${intent}`;
      response = await callflowsContainer.items.create(callflowData);
    }

    res.json(response.resource);
  } catch (error) {
    res.status(500).json({ error: "Failed to save callflow", details: error.message });
  }
});

app.delete(`${apiPrefix}/api/callflows/intent/:intent`, async (req, res) => {
  try {
    const querySpec = {
      query: "SELECT c.id FROM c WHERE c.intent = @intent",
      parameters: [{ name: "@intent", value: req.params.intent }]
    };
    const { resources } = await callflowsContainer.items.query(querySpec).fetchAll();
    if (!resources.length) return res.status(404).json({ error: "Callflow not found" });

    // แก้ตรงนี้:
    const deletePromises = resources.map(item =>
      // ถ้า PK path คือ /intent ให้ใส่ req.params.intent เป็น partitionKey
      callflowsContainer.item(item.id, req.params.intent).delete()
    );
    await Promise.all(deletePromises);

    res.json({ success: true, message: `Deleted ${resources.length} callflow(s)` });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete callflow", details: error.message });
  }
});


// =================== MessageGroups API ===================
app.get(`${apiPrefix}/api/messagegroups`, async (req, res) => {
  try {
    const { resources } = await messageGroupContainer.items
      .query("SELECT * FROM c ORDER BY c._ts DESC")
      .fetchAll();
    res.json(resources);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch message groups", details: error.message });
  }
});

app.get(`${apiPrefix}/api/messagegroups/:id`, async (req, res) => {
  try {
    const { resource } = await messageGroupContainer
      .item(req.params.id, req.params.id)
      .read();
    res.json(resource);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch message group", details: error.message });
  }
});

app.post(`${apiPrefix}/api/messagegroups`, async (req, res) => {
  try {
    const mg = req.body;
    mg.id = mg.id || `mg-${Date.now()}`;
    const response = await messageGroupContainer.items.upsert(mg);
    res.json(response.resource);
  } catch (error) {
    res.status(500).json({ error: "Failed to create message group", details: error.message });
  }
});

app.put(`${apiPrefix}/api/messagegroups/:id`, async (req, res) => {
  try {
    const id = req.params.id;
    const mg = { ...req.body, id };
    const response = await messageGroupContainer.items.upsert(mg);
    res.json(response.resource);
  } catch (error) {
    res.status(500).json({ error: "Failed to update message group", details: error.message });
  }
});

app.delete(`${apiPrefix}/api/messagegroups/:id`, async (req, res) => {
  try {
    await messageGroupContainer.item(req.params.id, req.params.id).delete();
    res.json({ success: true, message: "Message group deleted" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete message group", details: error.message });
  }
});


// =================== TagList API ===================
const taglistContainerId = process.env.COSMOS_DB_CONTAINER_TAGLIST || "Taglist";
const taglistContainer = database.container(taglistContainerId);

// ดึงทั้งหมด
app.get(`${apiPrefix}/api/taglist`, async (req, res) => {
  try {
    const querySpec = {
      query: "SELECT * FROM c ORDER BY c._ts DESC"
    };
    const { resources } = await taglistContainer.items
      .query(querySpec)
      .fetchAll();
    res.json(resources);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch tag list", details: error.message });
  }
});

// ดึงทีละอัน
app.get(`${apiPrefix}/api/taglist/:id`, async (req, res) => {
  try {
    const { resource } = await taglistContainer
      .item(req.params.id, req.params.id)
      .read();
    res.json(resource);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch tag", details: error.message });
  }
});

// สร้างใหม่
app.post(`${apiPrefix}/api/taglist`, async (req, res) => {
  try {
    const tag = req.body;
    tag.id = tag.id || `tag-${Date.now()}`;
    const response = await taglistContainer.items.create(tag);
    res.json(response.resource);
  } catch (error) {
    res.status(500).json({ error: "Failed to create tag", details: error.message });
  }
});

// อัปเดต
app.put(`${apiPrefix}/api/taglist/:id`, async (req, res) => {
  try {
    const id = req.params.id;
    const tag = { ...req.body, id };
    const response = await taglistContainer.items.upsert(tag);
    res.json(response.resource);
  } catch (error) {
    res.status(500).json({ error: "Failed to update tag", details: error.message });
  }
});

// ลบ
app.delete(`${apiPrefix}/api/taglist/:id`, async (req, res) => {
  try {
    await taglistContainer
      .item(req.params.id, req.params.id)
      .delete();
    res.json({ success: true, message: "Tag deleted" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete tag", details: error.message });
  }
});


// =================== Callflows API (for VA) ===================
app.get('/api/callflows/:intent', async (req, res) => {
  try {
    const { env = 'DEV', va = 'internalVA', user = 'anonymous', command = 'view' } = req.query;
    const intent = req.params.intent;

    console.log(`[INFO] [${new Date().toISOString()}] GET callflow for intent: ${intent}`);
    console.log(`  env=${env}, va=${va}, user=${user}, command=${command}`);

    // 🔁 1. สร้าง Cosmos Client ตาม env + va
    const cosmosClient = getCosmosClient(env, va);

    // 📄 2. โหลด flow จาก CosmosDB
    const flowData = await cosmosClient.getCallflow(intent);

    if (!flowData) {
      return res.status(404).json({ error: `Callflow for ${intent} not found` });
    }

    // ✅ 3. ส่ง response กลับ
    res.json({
      intent,
      env,
      va,
      user,
      command,
      callflow: flowData,
    });
  } catch (err) {
    console.error(`[ERROR] ${err.message}`);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});


// =================== categories_menu_link ===================

// GET เอกสารตัวแรกที่ c.tag = :tag
app.get(`${apiPrefix}/api/categories_menu_link/tag/:tag`, async (req, res) => {
  const tag = req.params.tag;
  try {
    const { resources } = await categoriesMenuLinkContainer.items
      .query({
        query: "SELECT * FROM c WHERE c.tag = @tag",
        parameters: [{ name: "@tag", value: tag }]
      })
      .fetchAll();

    if (!resources.length) {
      return res.status(404).json({ error: "Not Found" });
    }
    res.json(resources[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// PUT อัปเดตตัวที่ระบุ id พร้อมส่ง partitionKey (สมมติ PK คือ intent)
app.put(`${apiPrefix}/api/categories_menu_link/:id`, async (req, res) => {
  try {
    const updated = req.body;
    // upsert จะอัปเดตหรือสร้างใหม่ให้โดยไม่ต้องระบุ partitionKey
    const { resource } = await categoriesMenuLinkContainer
      .items
      .upsert(updated);
    res.json(resource);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});







// =================== Start Server ===================

const PORT = process.env.PORT || 5678;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
