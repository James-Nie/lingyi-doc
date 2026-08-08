export default () => ({
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 5432),
    username: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'lingyi_doc_db',
    connectionLimit: Number(process.env.DB_CONN_LIMIT || 10),
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
    consumerAccessTtl: Number(process.env.JWT_CONSUMER_ACCESS_TTL || 7200),
    consumerRefreshTtl: Number(process.env.JWT_CONSUMER_REFRESH_TTL || 2592000),
    adminAccessTtl: Number(process.env.JWT_ADMIN_ACCESS_TTL || 1800),
    adminRefreshTtl: Number(process.env.JWT_ADMIN_REFRESH_TTL || 604800),
  },
  auth: {
    rsaPrivateKeyB64: process.env.AUTH_RSA_PRIVATE_KEY_B64 || '',
    /** HTTP 等非安全上下文无法使用 Web Crypto 时，允许明文密码（仅 dev 建议开启） */
    allowPlainPassword: process.env.AUTH_PASSWORD_ALLOW_PLAIN === '1',
  },
  deploy: {
    type: Number(process.env.DEPLOY_TYPE || 1),
    accountMode: Number(process.env.ACCOUNT_MODE || 1),
    defaultTenantId: process.env.DEFAULT_TENANT_ID || '',
    defaultTenantName: process.env.DEFAULT_TENANT_NAME || '默认企业',
    allowMultiTenantSwitch: process.env.ALLOW_MULTI_TENANT_SWITCH !== '0',
    enforceTenantFilter: process.env.ENFORCE_TENANT_FILTER !== '0',
    /**
     * 产品模块白名单（逗号分隔 MembershipModuleKey）。
     * 空或 * = 不收窄（默认全开，兼容现网）；私有化裁剪示例：
     * ENABLED_MODULES=mod.doc,mod.sheet,mod.collab,mod.knowledge
     */
    enabledModules: process.env.ENABLED_MODULES || '',
    /**
     * 发行版策略源：saas（默认，Entitlement 全开）| community（静态 COMMUNITY_MODULES）。
     * 与 SaaS 会员矩阵并存，互不覆盖对方默认行为。
     */
    edition: (process.env.EDITION || 'saas').toLowerCase() === 'community' ? 'community' : 'saas',
    /** 私有化 License 文件路径（JSON）；优先于 LICENSE_PAYLOAD */
    licenseFile: process.env.LICENSE_FILE || '',
    /** 私有化 License 内联 JSON：{ modules[], expireAt?, tenantId?, seats?, aiQuota?, signature? } */
    licensePayload: process.env.LICENSE_PAYLOAD || '',
    // 验签公钥为编译期内置常量（EMBEDDED_PUBLIC_KEY），不从环境变量读取，
    // 以防对外镜像被替换公钥后自签绕过。
  },
  api: {
    port: Number(process.env.API_PORT || 3000),
    corsOrigin: process.env.CORS_ORIGIN || '*',
  },
  oss: {
    enabled: process.env.OSS_ENABLED !== '0',
    region: process.env.OSS_REGION || 'cn-hangzhou',
    bucket: process.env.OSS_BUCKET || '',
    endpoint: process.env.OSS_ENDPOINT || 'oss-cn-hangzhou.aliyuncs.com',
    accessKeyId: process.env.OSS_ACCESS_KEY_ID || '',
    accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET || '',
    publicBaseUrl: process.env.OSS_PUBLIC_BASE_URL || '',
    prefix: process.env.OSS_PREFIX || 'dev',
    objectAcl: process.env.OSS_OBJECT_ACL || '',
    accessMode: (process.env.OSS_ACCESS_MODE || 'private') as 'private' | 'public',
    accessUrlTtl: Number(process.env.OSS_ACCESS_URL_TTL || 10 * 365 * 24 * 3600),
    accessSignSecret: process.env.OSS_ACCESS_SIGN_SECRET || '',
  },
  sms: {
    mock: process.env.SMS_MOCK === '1',
    endpoint: process.env.ALIYUN_SMS_ENDPOINT || 'dypnsapi.aliyuncs.com',
    accessKeyId: process.env.ALIYUN_SMS_ACCESS_KEY_ID || process.env.OSS_ACCESS_KEY_ID || '',
    accessKeySecret: process.env.ALIYUN_SMS_ACCESS_KEY_SECRET || process.env.OSS_ACCESS_KEY_SECRET || '',
    signName: process.env.ALIYUN_SMS_SIGN_NAME || '速通互联验证码',
    templateCode: process.env.ALIYUN_SMS_TEMPLATE_CODE || '100001',
    sendIntervalSec: Number(process.env.SMS_SEND_INTERVAL_SEC || 60),
    codeTtlMinutes: Number(process.env.SMS_CODE_TTL_MINUTES || 5),
    verifiedTtlMinutes: Number(process.env.SMS_VERIFIED_TTL_MINUTES || 10),
    phoneMaxPerDay: Number(process.env.SMS_PHONE_MAX_PER_DAY || 10),
    ipMaxPerHour: Number(process.env.SMS_IP_MAX_PER_HOUR || 20),
    verifyMaxFails: Number(process.env.SMS_VERIFY_MAX_FAILS || 5),
  },
  rateLimit: {
    loginIpMaxPerHour: Number(process.env.LOGIN_IP_MAX_PER_HOUR || 60),
    loginAccountMaxPerHour: Number(process.env.LOGIN_ACCOUNT_MAX_PER_HOUR || 30),
  },
  log: {
    level: process.env.LOG_LEVEL || 'log',
    json: process.env.LOG_JSON === '1' || process.env.NODE_ENV === 'production',
    http: process.env.LOG_HTTP !== '0',
    slowRequestMs: Number(process.env.LOG_SLOW_REQUEST_MS || 1000),
    file: process.env.LOG_FILE || '',
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
    keyPrefix: process.env.REDIS_KEY_PREFIX || 'lingyi_doc:',
    connectTimeoutMs: Number(process.env.REDIS_CONNECT_TIMEOUT_MS || 5000),
  },
  collab: {
    enabled: process.env.FEATURE_COLLAB_ENABLED === 'true',
    wsPath: process.env.WS_PATH || '/api/v1/collab/ws',
    roomMaxUsers: Number(process.env.COLLAB_ROOM_MAX_USERS || 50),
    heartbeatIntervalMs: Number(process.env.COLLAB_HEARTBEAT_INTERVAL_MS || 30000),
    presenceTtlSec: Number(process.env.COLLAB_PRESENCE_TTL_SEC || 90),
    opsPerSecondLimit: Number(process.env.COLLAB_OPS_PER_SECOND_LIMIT || 100),
  },
  comments: {
    enabled: process.env.FEATURE_COMMENTS_ENABLED === 'true',
  },
  ai: {
    enabled: process.env.AI_MODULE_ENABLED !== '0',
    defaultProvider: process.env.DEFAULT_LLM_PROVIDER || 'openai',
    defaultModel: process.env.DEFAULT_LLM_MODEL || 'deepseek-v4-flash',
    models: (process.env.AI_LLM_MODELS || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
    openai: {
      apiKey: process.env.OPENAI_API_KEY || '',
      baseUrl: process.env.OPENAI_BASE_URL || 'https://llm.dtzhejiang.com/v1',
    },
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY || '',
      baseUrl: process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1',
    },
    alibaba: {
      apiKey: process.env.DASHSCOPE_API_KEY || '',
      baseUrl: process.env.DASHSCOPE_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    },
    embedding: {
      provider: process.env.EMBEDDING_PROVIDER || 'openai',
      model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
      alibabaModel: process.env.DASHSCOPE_EMBEDDING_MODEL || 'text-embedding-v2',
    },
    /** USD / 1k tokens；可用 `*` 作默认。可按模型覆盖 */
    pricing: {
      '*': { inputPer1k: 0.00015, outputPer1k: 0.0006, per1k: 0.00002 },
    },
  },
  mcp: {
    enabled: process.env.MCP_MODULE_ENABLED !== '0',
    tokenPrefix: process.env.MCP_TOKEN_PREFIX || 'mcp_',
    defaultExpiresDays: Number(process.env.MCP_DEFAULT_EXPIRES_DAYS || 90),
    rateLimitPerToken: Number(process.env.MCP_RATE_LIMIT_PER_TOKEN || 60),
    embedRateLimit: Number(process.env.MCP_EMBED_RATE_LIMIT || 5),
    maxTokensPerUser: Number(process.env.MCP_MAX_TOKENS_PER_USER || 10),
  },
});
