/**
 * AI 工具定义
 * 定义 AI 可以调用的工具（Function Calling）
 */

import { mcpManager } from './mcpManager';

// 本地工具列表
export const LOCAL_TOOLS = [
  {
    type: "function" as const,
    function: {
      name: "find_file",
      description: "根据文件名、类名或内容快速查找文件位置。返回匹配的文件路径列表。适用于：1) 不知道文件完整路径时 2) 需要查找包含特定类名/方法名的文件 3) 模糊搜索文件。",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "搜索关键词。可以是：1) 文件名（如 'PVLogWrapper.java'）2) 类名（如 'PVLogWrapper'）3) 方法名（如 'logPipeline'）4) 部分路径（如 'hermes/service'）"
          },
          file_type: {
            type: "string",
            description: "文件扩展名过滤（可选）。例如：'.java', '.ts', '.py', '.js' 等。不填则搜索所有类型"
          },
          base_path: {
            type: "string",
            description: "搜索的基础路径（可选）。默认为 ~/Code。可以指定更精确的路径以加快搜索速度"
          },
          max_results: {
            type: "number",
            description: "最多返回的结果数量（可选）。默认 10，最大 50"
          }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "smart_read",
      description: "智能查找并读取文件内容。这是一个组合工具，会自动完成：1) 查找文件位置 2) 读取文件内容。如果找到多个匹配文件，会列出所有文件让用户选择；如果只找到一个，直接返回内容。适用于：当你知道文件名/类名但不知道完整路径时。",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "文件名、类名或路径关键词。例如：'PVLogWrapper.java', 'PVLogWrapper', 'hermes/service/PVLog'"
          },
          file_type: {
            type: "string",
            description: "文件扩展名过滤（可选）。例如：'.java', '.ts', '.py' 等"
          },
          base_path: {
            type: "string",
            description: "搜索的基础路径（可选）。默认为 ~/Code"
          }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "read_file",
      description: "读取文件的完整内容。适用于查看代码文件、配置文件、文档等。支持相对路径和绝对路径。注意：如果你不知道文件的完整路径，应该先使用 find_file 或 smart_read 工具。",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "文件的完整路径（相对路径或绝对路径）。例如：'package.json' 或 '/Users/user/project/src/index.ts'"
          }
        },
        required: ["path"]
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "list_directory",
      description: "列出目录中的文件和子目录。可以查看项目结构、查找文件等。",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "目录的路径（相对路径或绝对路径）。例如：'.' 表示当前目录，'src' 表示 src 目录"
          },
          recursive: {
            type: "boolean",
            description: "是否递归列出所有子目录的内容（默认 false）。注意：递归模式可能返回大量内容"
          }
        },
        required: ["path"]
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "execute_command",
      description: "执行系统命令。可以运行各种命令行工具，如 git、npm、grep 等。注意：危险命令会被自动拦截。",
      parameters: {
        type: "object",
        properties: {
          command: {
            type: "string",
            description: "要执行的完整命令。例如：'git status' 或 'npm list'"
          },
          cwd: {
            type: "string",
            description: "工作目录（可选）。命令将在此目录下执行"
          }
        },
        required: ["command"]
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "search_files",
      description: "在文件中搜索文本内容。使用 grep 命令进行搜索，支持正则表达式。",
      parameters: {
        type: "object",
        properties: {
          pattern: {
            type: "string",
            description: "要搜索的文本或正则表达式模式"
          },
          path: {
            type: "string",
            description: "搜索的目录或文件路径"
          },
          recursive: {
            type: "boolean",
            description: "是否递归搜索子目录（默认 true）"
          }
        },
        required: ["pattern", "path"]
      }
    }
  }
];

export type AITool = typeof LOCAL_TOOLS[number];

// 动态获取所有工具（本地工具 + MCP工具）
export async function getAllTools(): Promise<any[]> {
  try {
    console.log('🔧 [aiTools] 开始获取MCP工具...');
    const mcpTools = await mcpManager.getAllTools();
    console.log(`📦 [aiTools] 获取到 ${mcpTools.length} 个MCP工具`);
    if (mcpTools.length > 0) {
      console.log('🔧 [aiTools] MCP工具列表:', mcpTools.map(t => t.function?.name).join(', '));
    }
    const allTools = [...LOCAL_TOOLS, ...mcpTools];
    console.log(`✅ [aiTools] 总计 ${allTools.length} 个工具 (${LOCAL_TOOLS.length} 本地 + ${mcpTools.length} MCP)`);
    return allTools;
  } catch (error) {
    console.error('❌ [aiTools] 获取MCP工具失败:', error);
    // 如果MCP工具获取失败，至少返回本地工具
    console.log(`⚠️ [aiTools] 回退到只使用本地工具: ${LOCAL_TOOLS.length} 个`);
    return LOCAL_TOOLS;
  }
}

// 兼容性：保持 AI_TOOLS 导出（指向本地工具）
export const AI_TOOLS = LOCAL_TOOLS;
