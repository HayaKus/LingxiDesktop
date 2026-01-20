import { useState, useEffect } from 'react';

interface McpServer {
  id: string;
  name: string;
  url: string;
  type: 'http' | 'sse';
  enabled: boolean;
  headers?: Record<string, string>;
  oauth?: {
    authUrl: string;
    tokenUrl: string;
    clientId: string;
    clientSecret?: string;
    scopes: string[];
    redirectUri: string;
  };
  tokens?: {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    expires_at?: number;
    token_type: string;
  };
}

interface McpConfigProps {
  onClose: () => void;
}

export function McpConfig({ onClose }: McpConfigProps) {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [editing, setEditing] = useState<McpServer | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [headersText, setHeadersText] = useState('');
  const [showOAuthConfig, setShowOAuthConfig] = useState(false);
  const [oauthScopes, setOauthScopes] = useState('');

  useEffect(() => {
    loadServers();
  }, []);

  const loadServers = async () => {
    const list = await window.electronAPI.mcpGetServers();
    setServers(list);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除该服务器？')) return;
    try {
      await window.electronAPI.mcpRemoveServer(id);
      await loadServers();
    } catch (error) {
      alert('删除失败：' + error);
    }
  };

  const handleTest = async (server: McpServer) => {
    setTesting(server.id);
    try {
      const result = await window.electronAPI.mcpTestConnection(server);
      alert(result.success ? '✅ 连接成功！' : '❌ 连接失败：' + result.error);
    } catch (error) {
      alert('❌ 测试失败：' + error);
    }
    setTesting(null);
  };

  const newServer = () => {
    setEditing({
      id: `mcp-${Date.now()}`,
      name: '',
      url: '',
      type: 'http',
      enabled: true,
    });
    setHeadersText('');
  };
  
  const handleEdit = (server: McpServer) => {
    setEditing(server);
    
    // 将headers对象转换为文本格式
    if (server.headers) {
      const text = Object.entries(server.headers)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n');
      setHeadersText(text);
    } else {
      setHeadersText('');
    }
    
    // 初始化OAuth scopes
    if (server.oauth?.scopes) {
      setOauthScopes(server.oauth.scopes.join(' '));
    } else {
      setOauthScopes('');
    }
    
    // 如果有OAuth配置，展开OAuth区域
    if (server.oauth) {
      setShowOAuthConfig(true);
    }
  };
  
  const parseHeaders = (text: string): Record<string, string> | undefined => {
    if (!text.trim()) return undefined;
    
    const headers: Record<string, string> = {};
    const lines = text.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      const colonIndex = trimmed.indexOf(':');
      if (colonIndex > 0) {
        const key = trimmed.substring(0, colonIndex).trim();
        const value = trimmed.substring(colonIndex + 1).trim();
        if (key && value) {
          headers[key] = value;
        }
      }
    }
    
    return Object.keys(headers).length > 0 ? headers : undefined;
  };
  
  const handleSaveWithHeaders = async () => {
    if (!editing) return;
    
    const headers = parseHeaders(headersText);
    const serverToSave = { ...editing, headers };
    
    try {
      await window.electronAPI.mcpAddServer(serverToSave);
      await loadServers();
      setEditing(null);
      setHeadersText('');
    } catch (error) {
      alert('保存失败：' + error);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-800">📡 MCP 服务器管理</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {editing ? (
            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <h3 className="font-semibold text-gray-700 mb-3">
                {editing.id.includes('mcp-') ? '添加' : '编辑'}服务器
              </h3>
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="服务器名称"
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="text"
                  placeholder="URL (例如: http://localhost:3000)"
                  value={editing.url}
                  onChange={(e) => setEditing({ ...editing, url: e.target.value })}
                  className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500"
                />
                <select
                  value={editing.type}
                  onChange={(e) => setEditing({ ...editing, type: e.target.value as 'http' | 'sse' })}
                  className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-blue-500"
                >
                  <option value="http">HTTP</option>
                  <option value="sse">SSE (Server-Sent Events)</option>
                </select>
                
                {/* OAuth 2.1 配置 */}
                <div className="border rounded-lg p-3 bg-white">
                  <button
                    type="button"
                    onClick={() => setShowOAuthConfig(!showOAuthConfig)}
                    className="w-full flex items-center justify-between text-left"
                  >
                    <span className="text-sm font-medium text-gray-700">
                      🔐 OAuth 2.1 配置（动态授权）
                    </span>
                    <span className="text-gray-400">{showOAuthConfig ? '▼' : '▶'}</span>
                  </button>
                  
                  {showOAuthConfig && (
                    <div className="mt-3 space-y-3 pt-3 border-t">
                      <input
                        type="text"
                        placeholder="授权端点 URL"
                        value={editing.oauth?.authUrl || ''}
                        onChange={(e) => setEditing({
                          ...editing,
                          oauth: {
                            authUrl: e.target.value,
                            tokenUrl: editing.oauth?.tokenUrl || '',
                            clientId: editing.oauth?.clientId || '',
                            clientSecret: editing.oauth?.clientSecret,
                            scopes: editing.oauth?.scopes || [],
                            redirectUri: editing.oauth?.redirectUri || ''
                          }
                        })}
                        className="w-full px-3 py-2 border rounded text-sm focus:ring-2 focus:ring-blue-500"
                      />
                      <input
                        type="text"
                        placeholder="Token 端点 URL"
                        value={editing.oauth?.tokenUrl || ''}
                        onChange={(e) => setEditing({
                          ...editing,
                          oauth: {
                            authUrl: editing.oauth?.authUrl || '',
                            tokenUrl: e.target.value,
                            clientId: editing.oauth?.clientId || '',
                            clientSecret: editing.oauth?.clientSecret,
                            scopes: editing.oauth?.scopes || [],
                            redirectUri: editing.oauth?.redirectUri || ''
                          }
                        })}
                        className="w-full px-3 py-2 border rounded text-sm focus:ring-2 focus:ring-blue-500"
                      />
                      <input
                        type="text"
                        placeholder="Client ID"
                        value={editing.oauth?.clientId || ''}
                        onChange={(e) => setEditing({
                          ...editing,
                          oauth: {
                            authUrl: editing.oauth?.authUrl || '',
                            tokenUrl: editing.oauth?.tokenUrl || '',
                            clientId: e.target.value,
                            clientSecret: editing.oauth?.clientSecret,
                            scopes: editing.oauth?.scopes || [],
                            redirectUri: editing.oauth?.redirectUri || ''
                          }
                        })}
                        className="w-full px-3 py-2 border rounded text-sm focus:ring-2 focus:ring-blue-500"
                      />
                      <input
                        type="password"
                        placeholder="Client Secret（可选，公开客户端无需填写）"
                        value={editing.oauth?.clientSecret || ''}
                        onChange={(e) => setEditing({
                          ...editing,
                          oauth: {
                            authUrl: editing.oauth?.authUrl || '',
                            tokenUrl: editing.oauth?.tokenUrl || '',
                            clientId: editing.oauth?.clientId || '',
                            clientSecret: e.target.value || undefined,
                            scopes: editing.oauth?.scopes || [],
                            redirectUri: editing.oauth?.redirectUri || ''
                          }
                        })}
                        className="w-full px-3 py-2 border rounded text-sm focus:ring-2 focus:ring-blue-500"
                      />
                      <input
                        type="text"
                        placeholder="Scopes（用空格分隔，例如：read write）"
                        value={oauthScopes}
                        onChange={(e) => {
                          setOauthScopes(e.target.value);
                          setEditing({
                            ...editing,
                            oauth: {
                              authUrl: editing.oauth?.authUrl || '',
                              tokenUrl: editing.oauth?.tokenUrl || '',
                              clientId: editing.oauth?.clientId || '',
                              clientSecret: editing.oauth?.clientSecret,
                              scopes: e.target.value.split(/\s+/).filter(s => s),
                              redirectUri: editing.oauth?.redirectUri || ''
                            }
                          });
                        }}
                        className="w-full px-3 py-2 border rounded text-sm focus:ring-2 focus:ring-blue-500"
                      />
                      <input
                        type="text"
                        placeholder="Redirect URI（例如：myapp://oauth/callback）"
                        value={editing.oauth?.redirectUri || ''}
                        onChange={(e) => setEditing({
                          ...editing,
                          oauth: {
                            authUrl: editing.oauth?.authUrl || '',
                            tokenUrl: editing.oauth?.tokenUrl || '',
                            clientId: editing.oauth?.clientId || '',
                            clientSecret: editing.oauth?.clientSecret,
                            scopes: editing.oauth?.scopes || [],
                            redirectUri: e.target.value
                          }
                        })}
                        className="w-full px-3 py-2 border rounded text-sm focus:ring-2 focus:ring-blue-500"
                      />
                      <p className="text-xs text-gray-500">
                        💡 配置OAuth后，首次连接时会自动弹出授权窗口
                      </p>
                      {editing.tokens && (
                        <div className="bg-green-50 border border-green-200 rounded p-2">
                          <p className="text-xs text-green-700">
                            ✅ 已授权 - Token有效期至：
                            {editing.tokens.expires_at 
                              ? new Date(editing.tokens.expires_at).toLocaleString('zh-CN')
                              : '未知'}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveWithHeaders}
                    disabled={!editing.name || !editing.url}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    保存
                  </button>
                  <button
                    onClick={() => setEditing(null)}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                  >
                    取消
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <button
              onClick={newServer}
              className="w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-blue-400 hover:text-blue-600 mb-4"
            >
              + 添加 MCP 服务器
            </button>
          )}

          <div className="space-y-3">
            {servers.map((server) => (
              <div key={server.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-800">{server.name}</h4>
                    <p className="text-sm text-gray-600 mt-1">{server.url}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs px-2 py-1 bg-gray-100 rounded">{server.type.toUpperCase()}</span>
                      <span className={`text-xs px-2 py-1 rounded ${server.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                        {server.enabled ? '已启用' : '已禁用'}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleTest(server)}
                      disabled={testing === server.id}
                      className="text-sm px-3 py-1 text-blue-600 hover:bg-blue-50 rounded disabled:opacity-50"
                    >
                      {testing === server.id ? '测试中...' : '测试'}
                    </button>
                    <button
                      onClick={() => handleEdit(server)}
                      className="text-sm px-3 py-1 text-gray-600 hover:bg-gray-100 rounded"
                    >
                      编辑
                    </button>
                    <button
                      onClick={() => handleDelete(server.id)}
                      className="text-sm px-3 py-1 text-red-600 hover:bg-red-50 rounded"
                    >
                      删除
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {servers.length === 0 && !editing && (
            <div className="text-center py-12 text-gray-500">
              <p className="text-lg mb-2">暂无MCP服务器</p>
              <p className="text-sm">点击上方按钮添加您的第一个服务器</p>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t bg-gray-50">
          <button onClick={onClose} className="w-full px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300">
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}
