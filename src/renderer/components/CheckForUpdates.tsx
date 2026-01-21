/**
 * 检测更新组件
 */
import { useState } from 'react';

interface UpdateCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion?: string;
  versionInfo?: {
    version: string;
    releaseDate: string;
    downloadUrl: string;
    changeLog: string[];
    minVersion?: string;
  };
  error?: string;
}

export function CheckForUpdates() {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<UpdateCheckResult | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const handleCheckUpdate = async () => {
    setChecking(true);
    setResult(null);
    
    try {
      const updateResult = await window.electronAPI.updateCheck();
      setResult(updateResult);
      
      // 如果有更新，自动展开详情
      if (updateResult.hasUpdate) {
        setShowDetails(true);
      }
    } catch (error) {
      console.error('检测更新失败:', error);
      setResult({
        hasUpdate: false,
        currentVersion: '',
        error: error instanceof Error ? error.message : '检测更新失败',
      });
    } finally {
      setChecking(false);
    }
  };

  const handleDownload = () => {
    if (result?.versionInfo?.downloadUrl) {
      // 打开下载链接
      window.open(result.versionInfo.downloadUrl, '_blank');
    }
  };

  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">🔄</span>
          <span className="text-sm font-medium text-gray-700">检测更新</span>
        </div>
        <button
          onClick={handleCheckUpdate}
          disabled={checking}
          className={`px-3 py-1 text-xs rounded ${
            checking
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-blue-500 text-white hover:bg-blue-600'
          }`}
        >
          {checking ? '检测中...' : '检测更新'}
        </button>
      </div>

      {/* 当前版本信息 */}
      {result && (
        <div className="text-xs text-gray-600 mb-2">
          当前版本: <span className="font-mono">{result.currentVersion}</span>
        </div>
      )}

      {/* 检测结果 */}
      {result && !result.error && (
        <div className={`p-3 rounded text-sm ${
          result.hasUpdate 
            ? 'bg-green-50 border border-green-200' 
            : 'bg-blue-50 border border-blue-200'
        }`}>
          {result.hasUpdate ? (
            <>
              <div className="flex items-center gap-2 mb-2">
                <span>🎉</span>
                <span className="font-semibold text-green-800">
                  发现新版本 v{result.latestVersion}
                </span>
              </div>
              
              {showDetails && result.versionInfo && (
                <div className="mt-3 space-y-2">
                  <div className="text-xs text-gray-600">
                    发布日期: {result.versionInfo.releaseDate}
                  </div>
                  
                  {result.versionInfo.changeLog && result.versionInfo.changeLog.length > 0 && (
                    <div className="text-xs">
                      <div className="font-medium text-gray-700 mb-1">更新内容:</div>
                      <ul className="list-disc list-inside space-y-1 text-gray-600 pl-2">
                        {result.versionInfo.changeLog.map((change, index) => (
                          <li key={index}>{change}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={handleDownload}
                      className="flex-1 px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-xs font-medium"
                    >
                      立即下载
                    </button>
                    <button
                      onClick={() => setShowDetails(false)}
                      className="px-3 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 text-xs"
                    >
                      稍后提醒
                    </button>
                  </div>
                </div>
              )}
              
              {!showDetails && (
                <button
                  onClick={() => setShowDetails(true)}
                  className="text-xs text-green-700 hover:text-green-800 underline mt-2"
                >
                  查看详情 →
                </button>
              )}
            </>
          ) : (
            <div className="flex items-center gap-2 text-blue-800">
              <span>✅</span>
              <span>已是最新版本</span>
            </div>
          )}
        </div>
      )}

      {/* 错误信息 */}
      {result?.error && (
        <div className="p-3 rounded text-sm bg-red-50 border border-red-200">
          <div className="flex items-center gap-2 text-red-800">
            <span>❌</span>
            <span className="font-semibold">检测失败</span>
          </div>
          <div className="text-xs text-red-600 mt-1">
            {result.error}
          </div>
        </div>
      )}

      {/* 提示信息 */}
      {!result && !checking && (
        <p className="text-xs text-gray-500">
          点击"检测更新"按钮查询最新版本
        </p>
      )}
    </div>
  );
}
