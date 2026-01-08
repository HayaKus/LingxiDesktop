import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Message } from '../../types';
import { formatTimestamp, copyToClipboard } from '../utils/helpers';

interface MessageItemProps {
  message: Message;
}

export function MessageItem({ message }: MessageItemProps) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    const success = await copyToClipboard(message.content);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div className={`max-w-[80%] ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
        {/* 消息气泡 */}
        <div
          className={`rounded-lg px-4 py-3 ${
            isUser
              ? 'bg-primary-500 text-white'
              : 'bg-white border border-gray-200 text-gray-800'
          }`}
        >
          {/* 用户消息 */}
          {isUser ? (
            <div>
              <p className="whitespace-pre-wrap break-words">{message.content}</p>
              {/* 显示多张图片 */}
              {(() => {
                const images = message.imageUrls || (message.imageUrl ? [message.imageUrl] : []);
                if (images.length > 0) {
                  return (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {images.map((url, index) => (
                        <img
                          key={index}
                          src={url}
                          alt={`截图 ${index + 1}`}
                          className="max-w-full rounded border border-white/20"
                          style={{ maxHeight: '200px' }}
                        />
                      ))}
                    </div>
                  );
                }
                return null;
              })()}
            </div>
          ) : (
            /* AI 消息 - Markdown 渲染 */
            <div className="prose prose-sm max-w-none">
              <ReactMarkdown
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
                      <code className={className} {...props}>
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
}
