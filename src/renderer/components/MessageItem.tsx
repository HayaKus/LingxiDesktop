import React, { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Message } from '../../types';
import { formatTimestamp, copyToClipboard } from '../utils/helpers';

interface MessageItemProps {
  message: Message;
}

// 使用 memo 避免不必要的重渲染
export const MessageItem = memo(function MessageItem({ message }: MessageItemProps) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    const success = await copyToClipboard(message.content || '');
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div className={`max-w-[80%] ${isUser ? 'items-end' : 'items-start'} flex flex-col overflow-hidden`}>
        {/* 消息气泡 */}
        <div
          className={`rounded-lg px-4 py-3 break-words ${
            isUser
              ? 'bg-primary-500 text-white'
              : 'bg-white border border-gray-200 text-gray-800'
          }`}
        >
          {/* 用户消息 - 只展示文字 */}
          {isUser ? (
            <div>
              <p className="whitespace-pre-wrap break-words">{message.content}</p>
            </div>
          ) : message.role === 'tool' ? (
            /* 工具调用结果 */
            <div className="bg-gray-50 border border-gray-200 rounded overflow-hidden">
              <div className="px-3 py-2 bg-gray-100 border-b border-gray-300">
                <div className="text-xs text-gray-600 font-medium">🔧 命令执行结果</div>
              </div>
              <details className="px-3 py-2">
                <summary className="cursor-pointer text-xs text-blue-600 hover:text-blue-800 select-none mb-2">
                  点击查看完整输出
                </summary>
                <pre className="text-sm text-gray-700 overflow-x-auto whitespace-pre-wrap font-mono bg-white p-2 rounded border border-gray-200 max-h-96 overflow-y-auto">
                  {message.content}
                </pre>
              </details>
            </div>
          ) : (
            /* AI 消息 - Markdown 渲染 */
            <div className="w-full min-w-0">
              {/* Markdown 内容 - 先显示文字 */}
              {message.content && (
                <div className="prose prose-sm max-w-none w-full overflow-hidden">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      code({ node, inline, className, children, ...props }: any) {
                        const match = /language-(\w+)/.exec(className || '');
                        return !inline && match ? (
                          <SyntaxHighlighter
                            style={vscDarkPlus as any}
                            language={match[1]}
                            PreTag="div"
                          >
                            {String(children).replace(/\n$/, '')}
                          </SyntaxHighlighter>
                        ) : (
                          <code 
                            className={`${className || ''} whitespace-pre-wrap`} 
                            style={{ wordBreak: 'break-word', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }}
                            {...props}
                          >
                            {children}
                          </code>
                        );
                      },
                    }}
                  >
                    {message.content}
                  </ReactMarkdown>
                </div>
              )}
              
              {/* AI消息显示窗口截图 - 放在文字后面 */}
              {(() => {
                const images = message.imageUrls || [];
                if (images.length > 0) {
                  return (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {images.map((url, index) => (
                        <img
                          key={index}
                          src={url}
                          alt={`屏幕截图 ${index + 1}`}
                          className="max-w-full rounded border border-gray-200"
                          style={{ maxHeight: '300px' }}
                        />
                      ))}
                    </div>
                  );
                }
                return null;
              })()}
              
              {/* AI消息显示粘贴板截图 - 放在文字后面 */}
              {(() => {
                const images = message.clipboardImageUrls || [];
                if (images.length > 0) {
                  return (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {images.map((url, index) => (
                        <img
                          key={index}
                          src={url}
                          alt={`粘贴板截图 ${index + 1}`}
                          className="max-w-full rounded border border-gray-200"
                          style={{ maxHeight: '300px' }}
                        />
                      ))}
                    </div>
                  );
                }
                return null;
              })()}
              
              {/* 显示工具调用及其结果 */}
              {(message as any).toolExecutions && (message as any).toolExecutions.length > 0 && (
                <div className="mt-3 space-y-3">
                  {(message as any).toolExecutions.map((exec: any, i: number) => (
                    <div key={i} className="border border-gray-300 rounded-lg overflow-hidden bg-white shadow-sm">
                      {/* 头部：命令标题 */}
                      <div className="px-3 py-2 bg-gray-100 border-b border-gray-300 flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-700">
                          {exec.status === 'executing' && '⏳ 正在执行命令...'}
                          {exec.status === 'completed' && '✅ 命令执行完成'}
                          {exec.status === 'failed' && '❌ 命令执行失败'}
                        </span>
                      </div>
                      
                      {/* 命令行显示 */}
                      <div className="px-3 py-2 bg-gray-900 text-gray-100 font-mono text-sm overflow-x-auto">
                        <div className="flex items-start gap-2">
                          <span className="text-green-400 select-none">&gt;_</span>
                          <span className="flex-1 whitespace-pre-wrap break-all">{exec.command}</span>
                        </div>
                      </div>
                      
                      {/* 查看输入参数 */}
                      {exec.args && (
                        <details className="border-t border-gray-300">
                          <summary className="px-3 py-2 bg-gray-50 cursor-pointer text-sm text-gray-600 hover:bg-gray-100 select-none">
                            📥 查看输入
                          </summary>
                          <div className="px-3 py-2 bg-white">
                            <pre className="text-xs text-gray-700 font-mono overflow-x-auto whitespace-pre-wrap max-h-96 overflow-y-auto">
                              {JSON.stringify(exec.args, null, 2)}
                            </pre>
                          </div>
                        </details>
                      )}
                      
                      {/* 命令输出结果 */}
                      {exec.result && (
                        <details open={exec.status === 'completed' || exec.status === 'failed'} className="border-t border-gray-300">
                          <summary className="px-3 py-2 bg-gray-50 cursor-pointer text-sm text-gray-600 hover:bg-gray-100 select-none">
                            {exec.status === 'completed' ? '📄 查看输出' : '⚠️ 查看错误'}
                          </summary>
                          <div className="px-3 py-2 bg-white">
                            <pre className="text-xs text-gray-700 font-mono overflow-x-auto whitespace-pre-wrap max-h-96 overflow-y-auto">
                              {exec.result}
                            </pre>
                          </div>
                        </details>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 时间戳和复制按钮 */}
        <div className="flex items-center gap-2 mt-1 px-1">
          <span className="text-xs text-gray-400">
            {formatTimestamp(message.timestamp)}
          </span>
          {!isUser && (
            <button
              onClick={handleCopy}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
              title="复制"
            >
              {copied ? '✓ 已复制' : '📋 复制'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
});
