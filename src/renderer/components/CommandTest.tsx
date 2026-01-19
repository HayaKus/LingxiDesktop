/**
 * 命令测试组件
 * 用于测试 CLI 命令执行功能
 */
import { useState } from 'react';

interface CommandTestProps {
  onBack?: () => void;
}

export const CommandTest: React.FC<CommandTestProps> = ({ onBack }) => {
  const [command, setCommand] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [security, setSecurity] = useState<any>(null);

  // 检查命令安全性
  const checkSecurity = async () => {
    if (!command.trim()) return;
    
    try {
      const check = await window.electronAPI.commandCheckSecurity(command);
      setSecurity(check);
    } catch (error) {
      console.error('Security check failed:', error);
    }
  };

  // 执行命令
  const executeCommand = async () => {
    if (!command.trim()) return;
    
    setLoading(true);
    setResult(null);
    
    try {
      const res = await window.electronAPI.commandExecute(command);
      setResult(res);
    } catch (error: any) {
      setResult({
        error: error.message || String(error),
        exitCode: 1,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 bg-white rounded-lg shadow-lg max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold">🧪 命令测试</h2>
        {onBack && (
          <button
            onClick={onBack}
            className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800 bg-gray-100 rounded hover:bg-gray-200"
          >
            ← 返回
          </button>
        )}
      </div>
      
      {/* 命令输入 */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          输入命令：
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={command}
            onChange={(e) => {
              setCommand(e.target.value);
              setSecurity(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                executeCommand();
              }
            }}
            placeholder="例如: ls -la"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={checkSecurity}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
          >
            🔍 检查
          </button>
          <button
            onClick={executeCommand}
            disabled={loading || !command.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {loading ? '⏳ 执行中...' : '▶️ 执行'}
          </button>
        </div>
      </div>

      {/* 安全检查结果 */}
      {security && (
        <div className={`mb-4 p-3 rounded-lg ${
          security.level === 'danger' ? 'bg-red-50 border border-red-200' :
          security.level === 'warning' ? 'bg-yellow-50 border border-yellow-200' :
          'bg-green-50 border border-green-200'
        }`}>
          <div className="flex items-center gap-2">
            <span className="text-lg">
              {security.level === 'danger' ? '🚨' :
               security.level === 'warning' ? '⚠️' : '✅'}
            </span>
            <span className="font-medium">
              {security.level === 'danger' ? '危险命令' :
               security.level === 'warning' ? '需要确认' : '安全命令'}
            </span>
          </div>
          {security.reason && (
            <div className="mt-2 text-sm">{security.reason}</div>
          )}
        </div>
      )}

      {/* 执行结果 */}
      {result && (
        <div className="border rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">
                {result.error ? '❌' : result.exitCode === 0 ? '✅' : '⚠️'}
              </span>
              <span className="font-medium">
                {result.error ? '执行失败' : result.exitCode === 0 ? '执行成功' : '执行完成'}
              </span>
            </div>
            {result.duration !== undefined && (
              <span className="text-sm text-gray-500">
                耗时: {(result.duration / 1000).toFixed(2)}s
              </span>
            )}
          </div>

          {/* 标准输出 */}
          {result.stdout && (
            <div className="mb-3">
              <div className="text-sm font-medium text-gray-700 mb-1">标准输出：</div>
              <div className="bg-gray-900 text-gray-100 p-3 rounded font-mono text-sm max-h-96 overflow-y-auto whitespace-pre-wrap">
                {result.stdout}
              </div>
            </div>
          )}

          {/* 错误输出 */}
          {result.stderr && (
            <div className="mb-3">
              <div className="text-sm font-medium text-gray-700 mb-1">错误输出：</div>
              <div className="bg-gray-900 text-red-400 p-3 rounded font-mono text-sm max-h-96 overflow-y-auto whitespace-pre-wrap">
                {result.stderr}
              </div>
            </div>
          )}

          {/* 错误信息 */}
          {result.error && (
            <div className="mb-3">
              <div className="text-sm font-medium text-gray-700 mb-1">错误信息：</div>
              <div className="bg-red-50 text-red-700 p-3 rounded text-sm">
                {result.error}
              </div>
            </div>
          )}

          {/* 退出码 */}
          {result.exitCode !== undefined && (
            <div className="text-sm text-gray-500">
              退出码: {result.exitCode}
            </div>
          )}
        </div>
      )}

      {/* 示例命令 */}
      <div className="mt-4 p-3 bg-gray-50 rounded-lg">
        <div className="text-sm font-medium text-gray-700 mb-2">💡 示例命令：</div>
        <div className="flex flex-wrap gap-2">
          {[
            'ls -la',
            'pwd',
            'echo "Hello World"',
            'date',
            'whoami',
            'node --version',
            'npm --version',
          ].map((cmd) => (
            <button
              key={cmd}
              onClick={() => setCommand(cmd)}
              className="px-3 py-1 text-sm bg-white border border-gray-300 rounded hover:bg-gray-50"
            >
              {cmd}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
