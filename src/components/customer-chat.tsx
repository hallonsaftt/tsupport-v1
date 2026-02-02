'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { saveSubscription, sendPushNotification, validateCustomerId } from '@/app/actions'
import { urlBase64ToUint8Array } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Bell, Send, User, Bot, Loader2, Star, Paperclip, X, XCircle, Download, FileText, File } from 'lucide-react'
import { toast } from 'sonner'
import { Textarea } from '@/components/ui/textarea'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

type Message = {
  id: string
  content: string
  sender_role: 'agent' | 'customer' | 'system'
  created_at: string
  attachment_url?: string
  attachment_type?: string
  attachment_name?: string
}

type ChatState = 'login' | 'chat'

export default function CustomerChat() {
  const [view, setView] = useState<ChatState>('login')
  const [customerId, setCustomerId] = useState('')
  const [subject, setSubject] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [chatId, setChatId] = useState<string | null>(null)
  
  // Rating state
  const [rating, setRating] = useState(0)
  const [review, setReview] = useState('')
  const [ratingSubmitted, setRatingSubmitted] = useState(false)
  const [previewImage, setPreviewImage] = useState<string | null>(null)

  const supabase = createClient()
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [agentName, setAgentName] = useState<string | null>(null)
  const [isTyping, setIsTyping] = useState(false)
  const [chatStatus, setChatStatus] = useState<'active' | 'closed'>('active')
  const [uploading, setUploading] = useState(false)
  
  const scrollRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, isTyping])

  useEffect(() => {
      const session = localStorage.getItem('tsupport_session')
      if (session) {
          try {
              const { chatId, customerId, subject, name } = JSON.parse(session)
              setChatId(chatId)
              setCustomerId(customerId)
              setSubject(subject)
              setName(name)
              setView('chat')
          } catch (e) {
              console.error('Failed to parse session', e)
          }
      }
  }, [])

  const handleStartNewChat = () => {
      localStorage.removeItem('tsupport_session')
      setChatId(null)
      setMessages([])
      setChatStatus('active')
      setRatingSubmitted(false)
      setRating(0)
      setReview('')
      setView('login')
  }

  const handleSubmitRating = async (e: React.FormEvent) => {
      e.preventDefault()
      if (!chatId || rating === 0) return

      const { error } = await supabase
          .from('chats')
          .update({ 
              rating: rating,
              review_comment: review
          })
          .eq('id', chatId)

      if (error) {
          toast.error('Failed to submit review')
      } else {
          toast.success('Thank you for your feedback!')
          setRatingSubmitted(true)
      }
  }

  useEffect(() => {
    if (!chatId) return

    // Load initial messages
    const fetchMessages = async () => {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('chat_id', chatId)
        .order('created_at', { ascending: true })
      
      if (data) setMessages(data)
    }

    const fetchChatStatus = async () => {
        const { data } = await supabase
            .from('chats')
            .select('status, agent_name, rating')
            .eq('id', chatId)
            .single()
        
        if (data) {
            // If chat is already rated, don't show it again, go to new chat
            if (data.rating && data.rating > 0) {
                handleStartNewChat()
                return
            }

            setChatStatus(data.status)
            if (data.agent_name) setAgentName(data.agent_name)
        }
    }

    fetchMessages()
    fetchChatStatus()

    // Subscribe to new messages and changes
    const channel = supabase
      .channel(`chat:${chatId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `chat_id=eq.${chatId}`,
      }, (payload) => {
        setMessages((prev) => [...prev, payload.new as Message])
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'chats',
        filter: `id=eq.${chatId}`,
      }, (payload) => {
         if (payload.new.agent_name) {
             setAgentName(payload.new.agent_name)
         }
         if (payload.new.status) {
             setChatStatus(payload.new.status)
         }
      })
      .on('broadcast', { event: 'typing' }, (payload) => {
          if (payload.payload.sender !== 'customer') {
              setIsTyping(true)
              if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
              typingTimeoutRef.current = setTimeout(() => setIsTyping(false), 3000)
          }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [chatId, supabase])

  const handleTyping = async () => {
      if (!chatId) return
      await supabase.channel(`chat:${chatId}`).send({
          type: 'broadcast',
          event: 'typing',
          payload: { sender: 'customer' }
      })
  }

  const handleEndChat = async () => {
    if (!chatId) return
    const { error } = await supabase.from('chats').update({ status: 'closed' }).eq('id', chatId)
    
    if (error) toast.error('Failed to end chat')
    else {
        toast.success('Chat ended')
        setChatStatus('closed')
        
        await supabase.from('messages').insert({
          chat_id: chatId,
          content: 'Chat ended by customer',
          sender_role: 'system'
      })
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files || !e.target.files[0] || !chatId) return
      
      const file = e.target.files[0]
      if (file.size > 25 * 1024 * 1024) {
          toast.error('File size must be less than 25MB')
          return
      }

      setUploading(true)
      const fileExt = file.name.split('.').pop()
      const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`
      const filePath = `${chatId}/${fileName}`

      const { error: uploadError } = await supabase.storage
          .from('chat-attachments')
          .upload(filePath, file)

      if (uploadError) {
          toast.error('Failed to upload file')
          setUploading(false)
          return
      }

      const { data: { publicUrl } } = await supabase.storage
          .from('chat-attachments')
          .getPublicUrl(filePath)

      const { error } = await supabase.from('messages').insert({
          chat_id: chatId,
          content: `Sent a file: ${file.name}`,
          sender_role: 'customer',
          attachment_url: publicUrl,
          attachment_type: file.type.startsWith('image/') ? 'image' : 'file',
          attachment_name: file.name
      })

      if (error) toast.error('Failed to send file')
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleDownloadTranscript = () => {
      if (!messages.length) return
      
      const doc = new jsPDF()
      
      doc.setFontSize(16)
      doc.text(`Chat Transcript: ${subject}`, 10, 10)
      doc.setFontSize(10)
      doc.text(`ID: ${customerId} | Date: ${new Date().toLocaleDateString()}`, 10, 15)
      
      const tableData = messages.map(msg => [
          new Date(msg.created_at).toLocaleTimeString(),
          msg.sender_role.toUpperCase(),
          msg.content
      ])

      autoTable(doc, {
          head: [['Time', 'Role', 'Message']],
          body: tableData,
          startY: 20,
          styles: { fontSize: 8 },
          columnStyles: {
              0: { cellWidth: 30 },
              1: { cellWidth: 30 },
              2: { cellWidth: 'auto' }
          }
      })

      doc.save(`chat-transcript-${customerId}.pdf`)
  }

  const handleStartChat = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const isValid = await validateCustomerId(customerId)
      if (!isValid) {
        toast.error('Invalid Customer ID')
        setLoading(false)
        return
      }

      // Create Chat
      const { data, error } = await supabase
        .from('chats')
        .insert({
          customer_id: customerId,
          subject: subject,
          customer_email: name, // Using name field for email/name per req
          status: 'active'
        })
        .select()
        .single()

      if (error) throw error

      setChatId(data.id)
      setView('chat')
      localStorage.setItem('tsupport_session', JSON.stringify({
          chatId: data.id,
          customerId,
          subject,
          name
      }))
      toast.success('Chat started')
    } catch (error) {
      console.error(error)
      toast.error('Failed to start chat')
    } finally {
      setLoading(false)
    }
  }

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMessage.trim() || !chatId) return

    const content = newMessage
    setNewMessage('')

    // Optimistic update? No, let's rely on realtime for now to keep it simple and consistent
    // Actually, optimistic update feels better.
    // But realtime is fast enough usually.

    try {
      const { error } = await supabase
        .from('messages')
        .insert({
          chat_id: chatId,
          content: content,
          sender_role: 'customer'
        })

      if (error) throw error
    } catch (error) {
      console.error(error)
      toast.error('Failed to send message')
    }
  }

  if (view === 'login') {
    return (
      <Card className="w-full max-w-md mx-auto mt-10">
        <CardHeader>
          <CardTitle>Support Chat</CardTitle>
          <CardDescription>Enter your details to connect with an agent.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleStartChat} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Customer ID</label>
              <Input 
                placeholder="Enter your ID (e.g. 123456)" 
                value={customerId} 
                onChange={(e) => setCustomerId(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Subject</label>
              <Input 
                placeholder="What do you need help with?" 
                value={subject} 
                onChange={(e) => setSubject(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Name / Email</label>
              <Input 
                placeholder="Your Name" 
                value={name} 
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Start Chat'}
            </Button>
          </form>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex flex-col h-[100dvh] max-w-md mx-auto bg-background border-x relative">
        {previewImage && (
            <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setPreviewImage(null)}>
                <div className="relative max-w-4xl w-full h-full flex items-center justify-center">
                    <button 
                        className="absolute top-4 right-4 text-white hover:text-gray-300 transition-colors"
                        onClick={(e) => {
                            e.stopPropagation()
                            setPreviewImage(null)
                        }}
                    >
                        <XCircle className="h-8 w-8" />
                    </button>
                    <img 
                        src={previewImage} 
                        alt="Full preview" 
                        className="max-h-full max-w-full object-contain"
                        onClick={(e) => e.stopPropagation()} 
                    />
                </div>
            </div>
        )}
      <header className="p-4 border-b flex items-center justify-between bg-card">
        <div>
          <h2 className="font-semibold">Support Chat</h2>
          <p className="text-xs text-muted-foreground">ID: {customerId}</p>
        </div>
        <div className="flex items-center gap-2">
            {agentName && (
            <Badge variant="secondary" className="bg-green-100 text-green-800">
                {agentName} joined
            </Badge>
            )}
            {chatStatus === 'active' && (
                <Button variant="destructive" size="sm" onClick={handleEndChat}>
                    End Chat
                </Button>
            )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4" ref={scrollRef}>
        <div className="space-y-4 pb-4">
           {messages.length === 0 && (
               <div className="text-center text-muted-foreground text-sm py-10">
                   Waiting for an agent to join...
               </div>
           )}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${
                msg.sender_role === 'customer' ? 'justify-end' : 
                msg.sender_role === 'system' ? 'justify-center' : 'justify-start'
              }`}
            >
              {msg.sender_role === 'system' ? (
                  <span className="text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded-full">
                      {msg.content}
                  </span>
              ) : (
              <div
                className={`flex gap-2 max-w-[80%] ${
                  msg.sender_role === 'customer' 
                    ? 'flex-row-reverse' 
                    : 'flex-row'
                }`}
              >
                <Avatar className="h-8 w-8">
                  {msg.sender_role === 'customer' ? (
                    <AvatarFallback><User className="h-4 w-4" /></AvatarFallback>
                  ) : (
                    <AvatarFallback><Bot className="h-4 w-4" /></AvatarFallback>
                  )}
                </Avatar>
                <div
                  className={`rounded-lg p-3 text-sm ${
                    msg.sender_role === 'customer'
                      ? 'bg-blue-600 text-white'
                      : 'bg-muted'
                  }`}
                >
                  {msg.content}
                  {msg.attachment_url && (
                    <div className="mt-2">
                        {msg.attachment_type === 'image' ? (
                            <img 
                                src={msg.attachment_url} 
                                alt="Attachment" 
                                className="max-w-[200px] max-h-[150px] rounded-md cursor-pointer hover:opacity-90 object-cover border"
                                onClick={() => setPreviewImage(msg.attachment_url || null)}
                            />
                        ) : (
                            <a 
                                href={msg.attachment_url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 text-sm underline text-blue-500 hover:text-blue-600 bg-background/50 p-2 rounded"
                            >
                                <Paperclip className="h-4 w-4" />
                                {msg.attachment_name || 'Attachment'}
                            </a>
                        )}
                    </div>
                  )}
                </div>
              </div>
              )}
            </div>
          ))}
          {isTyping && (
               <div className="flex justify-start">
                   <div className="flex gap-2 max-w-[80%] flex-row">
                       <Avatar className="h-8 w-8">
                           <AvatarFallback><Bot className="h-4 w-4" /></AvatarFallback>
                       </Avatar>
                       <div className="bg-muted rounded-lg p-3 text-sm flex items-center gap-1">
                           <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                           <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                           <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></span>
                       </div>
                   </div>
               </div>
           )}
           
        </div>
      </div>

      <div className="p-4 border-t bg-card">
        {chatStatus === 'closed' ? (
            !ratingSubmitted ? (
                <div className="space-y-4">
                    <div className="text-center font-semibold">How was your support experience?</div>
                    <div className="flex justify-center gap-2">
                        {[1, 2, 3, 4, 5].map((star) => (
                            <button 
                                key={star}
                                onClick={() => setRating(star)}
                                className={`p-1 rounded-full hover:bg-muted transition-colors ${rating >= star ? 'text-yellow-500' : 'text-gray-300'}`}
                            >
                                <Star className="h-8 w-8 fill-current" />
                            </button>
                        ))}
                    </div>
                    <Textarea 
                        placeholder="Leave a comment (optional)..."
                        value={review}
                        onChange={(e) => setReview(e.target.value)}
                    />
                    <Button className="w-full" onClick={handleSubmitRating} disabled={rating === 0}>
                        Submit Review
                    </Button>
                </div>
            ) : (
                <div className="text-center py-4 space-y-4">
                    <div className="text-green-600 font-medium">
                        Thank you for your feedback!
                    </div>
                    <div className="text-sm text-muted-foreground">
                        You can request a transcript of this chat at any time.
                    </div>
                    <Button variant="outline" onClick={handleDownloadTranscript} className="gap-2">
                        <FileText className="h-4 w-4" />
                        Download Transcript
                    </Button>
                    <div className="pt-4 border-t">
                        <Button variant="ghost" onClick={handleStartNewChat} className="text-muted-foreground hover:text-foreground">
                            Start New Chat
                        </Button>
                    </div>
                </div>
            )
        ) : (
        <form onSubmit={handleSendMessage} className="flex gap-2 items-center">
          <input 
              type="file" 
              ref={fileInputRef}
              className="hidden" 
              onChange={handleFileUpload}
          />
          <Button 
              type="button" 
              variant="ghost" 
              size="icon"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
          >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
          </Button>
          <Input 
            value={newMessage}
            onChange={(e) => {
                setNewMessage(e.target.value)
                handleTyping()
            }}
            placeholder="Type a message..."
            className="flex-1"
          />
          <Button type="submit" size="icon" disabled={!newMessage.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
        )}
      </div>
    </div>
  )
}
