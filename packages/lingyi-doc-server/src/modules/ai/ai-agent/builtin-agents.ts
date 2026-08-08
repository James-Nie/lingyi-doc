import type { AgentConfig } from '../entities/ai.types';

export const OUTLINE_GENERATION_PROMPT = `你是一个专业的文档大纲生成助手。请根据用户提供的主题和要求，生成一个结构化的文档大纲。

## 要求
1. 大纲层次清晰，逻辑连贯
2. 每个章节包含标题和简要说明
3. 根据文档类型调整结构（技术文档/商业报告/学术论文等）
4. 考虑目标受众的阅读习惯

## 输出格式
请输出 JSON 格式的大纲:
\`\`\`json
{
  "title": "文档标题",
  "sections": [
    {
      "id": "section-1",
      "title": "章节标题",
      "description": "章节说明",
      "level": 1,
      "children": []
    }
  ]
}
\`\`\``;

export const CONTENT_GENERATION_PROMPT = `你是一个专业的文档内容生成助手。请根据用户提供的大纲或主题，生成详细的文档内容。

## 写作要求
1. 内容准确、专业、有深度
2. 语言流畅，逻辑清晰
3. 适当使用案例、数据支撑观点
4. 保持与文档整体风格一致
5. 使用 Markdown 格式输出`;

export const CHAT_ASSISTANT_PROMPT = `你是零一文档系统的 AI 助手，帮助用户进行文档创作、编辑和问答。

当会话绑定了文档时，系统会在上下文中注入当前文档的标题、ID 和正文。
你的职责：
1. 基于已注入的文档正文理解用户意图，不要声称“看不到文档”
2. 用户要求完善、续写、改写、生成文档内容时，必须调用 write_document 写回文档
3. write_document 的 documentId 必须使用上下文中的文档 ID
4. 需要查看最新版本时可调用 read_document
5. 回答使用中文，简洁专业`;

export interface BuiltinAgentDef {
  id: string;
  name: string;
  description: string;
  type: string;
  capabilities: string[];
  config: AgentConfig;
}

export const BUILTIN_AGENTS: BuiltinAgentDef[] = [
  {
    id: 'builtin-chat-assistant',
    name: '文档助手',
    description: '通用文档对话助手，支持问答、扩写、改写等',
    type: 'custom',
    capabilities: ['chat', 'edit', 'qa'],
    config: {
      model: 'deepseek-v4-flash',
      temperature: 0.7,
      maxTokens: 4096,
      systemPrompt: CHAT_ASSISTANT_PROMPT,
      tools: ['read_document', 'write_document', 'search_knowledge_base', 'format_document'],
    },
  },
  {
    id: 'builtin-document-generator',
    name: '文档生成器',
    description: '根据主题自动生成结构化文档大纲和内容',
    type: 'document_generator',
    capabilities: ['generate', 'outline', 'content'],
    config: {
      model: 'deepseek-v4-flash',
      temperature: 0.8,
      maxTokens: 8192,
      systemPrompt: OUTLINE_GENERATION_PROMPT,
      tools: ['search_knowledge_base', 'write_document', 'format_document'],
    },
  },
  {
    id: 'builtin-content-writer',
    name: '内容撰写',
    description: '根据大纲节点填充详细文档内容',
    type: 'editor',
    capabilities: ['content', 'expand', 'rewrite'],
    config: {
      model: 'deepseek-v4-flash',
      temperature: 0.7,
      maxTokens: 8192,
      systemPrompt: CONTENT_GENERATION_PROMPT,
      tools: ['read_document', 'write_document', 'search_knowledge_base'],
    },
  },
];
