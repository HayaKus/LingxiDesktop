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
              
              {/* 显示工具调用 */}
              {(message as any).tool_calls && (message as any).tool_calls.length > 0 && (
                <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded">
                  <div className="flex items-center gap-2 text-sm text-blue-700 font-medium mb-3">
                    <span>🔧</span>
                    <span>执行了 {(message as any).tool_calls.length} 个命令</span>
                  </div>
                  <div className="space-y-3">
                    {(message as any).tool_calls.map((call: any, i: number) => {
                      let args;
                      let commandDisplay = '';
                      try {
                        args = JSON.parse(call.function.arguments);
                        // 根据不同的工具类型显示不同的命令
                        if (call.function.name === 'execute_command') {
                          commandDisplay = `$ ${args.command}`;
                        } else if (call.function.name === 'read_file') {
                          commandDisplay = `$ cat ${args.path}`;
                        } else if (call.function.name === 'list_directory') {
                          commandDisplay = `$ ls ${args.path || '.'}`;
                        } else if (call.function.name === 'search_files') {
                          commandDisplay = `$ grep -r "${args.pattern}" ${args.path || '.'}`;
                        } else if (call.function.name === 'find_file') {
                          commandDisplay = `$ find ${args.base_path || '~'} -name "*${args.query}*"`;
                        } else if (call.function.name === 'smart_read') {
                          commandDisplay = `$ smart_read "${args.query}"`;
                        }
                      } catch {
                        args = call.function.arguments;
                      }
                      return (
                        <div key={i} className="bg-white rounded border border-blue-100 overflow-hidden">
                          {/* 命令显示 */}
                          <div className="px-3 py-2 bg-gray-800 text-green-400 font-mono text-sm">
                            {commandDisplay || call.function.name}
                          </div>
                          {/* 参数详情（可折叠）*/}
                          <details className="px-3 py-2">
                            <summary className="cursor-pointer text-xs text-blue-600 hover:text-blue-800 select-none">
                              查看参数详情
                            </summary>
                            <pre className="mt-2 text-gray-600 overflow-x-auto text-xs bg-gray-50 p-2 rounded">
                              {typeof args === 'object' 
                                ? JSON.stringify(args, null, 2)
                                : args}
                            </pre>
                          </details>
                        </div>
                      );
                    })}
                  </div>
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