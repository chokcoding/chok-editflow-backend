const { CosmosClientWrapper } = require('./cosmos_client');

// 🔁 Config แต่ละ environment + VA
const configMap = {
  DEV: {
    internalVA: { endpoint: 'https://dev-cosmos.documents.azure.com', key: 'DEV_KEY', dbName: 'Dev_InternalVA' },
    aunjaiVA: { endpoint: 'https://dev-cosmos.documents.azure.com', key: 'DEV_KEY', dbName: 'Dev_AunjaiVA' },
    promoVA: { endpoint: 'https://dev-cosmos.documents.azure.com', key: 'DEV_KEY', dbName: 'Dev_PromoVA' },
    hrVA: { endpoint: 'https://dev-cosmos.documents.azure.com', key: 'DEV_KEY', dbName: 'Dev_HrVA' },
  },
  Staging: {
    internalVA: { endpoint: 'https://stg-cosmos.documents.azure.com', key: 'STG_KEY', dbName: 'Stg_InternalVA' },
    aunjaiVA: { endpoint: 'https://stg-cosmos.documents.azure.com', key: 'STG_KEY', dbName: 'Stg_AunjaiVA' },
    promoVA: { endpoint: 'https://stg-cosmos.documents.azure.com', key: 'STG_KEY', dbName: 'Stg_PromoVA' },
    hrVA: { endpoint: 'https://stg-cosmos.documents.azure.com', key: 'STG_KEY', dbName: 'Stg_HrVA' },
  },
  PROD: {
    internalVA: { endpoint: 'https://prod-cosmos.documents.azure.com', key: 'PROD_KEY', dbName: 'Prod_InternalVA' },
    aunjaiVA: { endpoint: 'https://prod-cosmos.documents.azure.com', key: 'PROD_KEY', dbName: 'Prod_AunjaiVA' },
    promoVA: { endpoint: 'https://prod-cosmos.documents.azure.com', key: 'PROD_KEY', dbName: 'Prod_PromoVA' },
    hrVA: { endpoint: 'https://prod-cosmos.documents.azure.com', key: 'PROD_KEY', dbName: 'Prod_HrVA' },
  }
};

function getCosmosClient(env = 'DEV', va = 'internalVA') {
  const vaConfig = configMap?.[env]?.[va];
  if (!vaConfig) throw new Error(`Invalid env (${env}) or va (${va})`);
  return new CosmosClientWrapper(vaConfig.endpoint, vaConfig.key, vaConfig.dbName);
}

module.exports = { getCosmosClient };
