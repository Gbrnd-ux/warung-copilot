'use client';

import { useChat } from 'ai/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, Bot, User, AlertCircle, RotateCcw } from 'lucide-react';
import { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function ChatInterface() {
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { messages, input, handleInputChange, handleSubmit, isLoading, error, setMessages } = useChat({
    api: '/api/chat',
    onError: (err) => {
      console.error('Chat error:', err);
    },
  });

  // Fokus otomatis ke input saat halaman pertama kali dibuka
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Fokus otomatis kembali ke input saat bot selesai merespon
  useEffect(() => {
    if (!isLoading) {
      inputRef.current?.focus();
    }
  }, [isLoading]);

  // Otomatis scroll ke pesan terbaru
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const onClearChat = () => {
    setMessages([]);
    setTimeout(() => {
      inputRef.current?.focus();
    }, 10);
  };

  const onSubmitForm = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const cleanInput = input.trim().toLowerCase();

    // Jika pengguna mengetik perintah pembersihan chat, langsung bersihkan seketika
    if (
      cleanInput === 'hapus chat' ||
      cleanInput === 'clear chat' ||
      cleanInput === 'bersihkan chat' ||
      cleanInput === 'reset chat'
    ) {
      onClearChat();
      handleInputChange({ target: { value: '' } } as any);
      return;
    }

    handleSubmit(e);
    // Kembalikan fokus ke input segera setelah tombol kirim / enter ditekan
    setTimeout(() => {
      inputRef.current?.focus();
    }, 10);
  };

  return (
    <Card className="flex flex-col h-full shadow-sm">
      <div className="p-4 border-b flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Bot className="h-5 w-5" />
            AI Copilot
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Chat dengan AI untuk mengelola produk toko Anda
          </p>
        </div>
        {messages.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearChat}
            className="text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex items-center gap-1.5 h-8 px-2.5 rounded-lg border border-dashed border-border/80"
            title="Bersihkan riwayat percakapan"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Bersihkan Chat</span>
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-muted-foreground py-8">
              <Bot className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Mulai chat untuk mengelola produk Anda</p>
              <p className="text-xs mt-2">
                Contoh: &quot;Tambahkan produk kopi latte harga 18000 stok 25&quot;
              </p>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-3 ${
                message.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              <div
                className={`flex gap-3 max-w-[85%] ${
                  message.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                }`}
              >
                <div
                  className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  }`}
                >
                  {message.role === 'user' ? (
                    <User className="h-4 w-4" />
                  ) : (
                    <Bot className="h-4 w-4" />
                  )}
                </div>

                <div
                  className={`rounded-xl px-4 py-3 text-sm leading-relaxed ${
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted/70 text-foreground border border-border/50'
                  }`}
                >
                  {message.role === 'user' ? (
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  ) : (
                    <div className="space-y-2">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          table: ({ ...props }) => (
                            <div className="overflow-x-auto my-3 rounded-lg border border-border shadow-xs bg-background">
                              <table className="w-full text-xs text-left border-collapse" {...props} />
                            </div>
                          ),
                          thead: ({ ...props }) => (
                            <thead className="bg-muted border-b border-border text-foreground font-semibold" {...props} />
                          ),
                          th: ({ ...props }) => (
                            <th className="px-3 py-2 border-r border-border/40 last:border-r-0" {...props} />
                          ),
                          td: ({ ...props }) => (
                            <td className="px-3 py-2 border-t border-border/40 border-r border-border/40 last:border-r-0" {...props} />
                          ),
                          tr: ({ ...props }) => (
                            <tr className="hover:bg-muted/40 transition-colors" {...props} />
                          ),
                          p: ({ ...props }) => (
                            <p className="mb-2 last:mb-0 leading-relaxed" {...props} />
                          ),
                          ul: ({ ...props }) => (
                            <ul className="list-disc pl-5 my-2 space-y-1" {...props} />
                          ),
                          ol: ({ ...props }) => (
                            <ol className="list-decimal pl-5 my-2 space-y-1" {...props} />
                          ),
                          li: ({ ...props }) => (
                            <li className="leading-relaxed" {...props} />
                          ),
                          strong: ({ ...props }) => (
                            <strong className="font-semibold text-foreground" {...props} />
                          ),
                          code: ({ ...props }) => (
                            <code
                              className="bg-background/80 text-foreground border border-border px-1.5 py-0.5 rounded text-[11px] font-mono"
                              {...props}
                            />
                          ),
                          blockquote: ({ ...props }) => (
                            <blockquote className="border-l-2 border-primary/50 pl-3 italic text-muted-foreground my-2" {...props} />
                          ),
                        }}
                      >
                        {message.content}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-3 justify-start">
              <div className="flex gap-3 max-w-[85%]">
                <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-muted">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="rounded-xl px-4 py-3 bg-muted/70 border border-border/50">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 rounded-full bg-foreground/40 animate-bounce" />
                    <div className="w-2 h-2 rounded-full bg-foreground/40 animate-bounce [animation-delay:0.2s]" />
                    <div className="w-2 h-2 rounded-full bg-foreground/40 animate-bounce [animation-delay:0.4s]" />
                  </div>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg dark:bg-red-950/40 dark:border-red-900 dark:text-red-400">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>Gagal mengirim pesan: {error.message || 'Cek koneksi atau API key.'}</span>
            </div>
          )}

          {/* Anchor untuk auto-scroll ke paling bawah */}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      <form onSubmit={onSubmitForm} className="p-4 border-t">
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            placeholder="Ketik pesan Anda..."
            disabled={isLoading}
            className="flex-1"
            autoFocus
          />
          <Button type="submit" disabled={isLoading || !input.trim()} size="icon">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </form>
    </Card>
  );
}
