'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { saveSubscription, sendPushNotification } from '@/app/actions'
import { urlBase64ToUint8Array } from '@/lib/utils'
import { Send, User, Bot, Loader2, Settings, LogOut, Menu, XCircle, Search, Paperclip, Download, Users, FileText, Star, Bell } from 'lucide-react'
import { toast } from 'sonner'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

type Chat = {
  id: string
  customer_id: string
  subject: string
  customer_email: string
  status: 'active' | 'closed'
  agent_name: string | null
  created_at: string
}

type Message = {
  id: string
  content: string
  sender_role: 'agent' | 'customer' | 'system'
  created_at: string
  attachment_url?: string
  attachment_type?: string
  attachment_name?: string
}

type Agent = {
  id: string
  name: string
  avatar_url?: string
}

type AllowedUser = {
  id: string
  customer_id: string
  created_at: string
}

export default function AdminDashboard() {
  const [session, setSession] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [chats, setChats] = useState<Chat[]>([])
  const [activeChat, setActiveChat] = useState<Chat | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [agents, setAgents] = useState<Agent[]>([])
  const [search, setSearch] = useState('')
  const [view, setView] = useState<'active' | 'closed' | 'settings' | 'users' | 'reviews'>('active')
  const [reviews, setReviews] = useState<Chat[]>([])
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [agentAvatar, setAgentAvatar] = useState('')
  const [avatarLoading, setAvatarLoading] = useState(false)
  const [isTyping, setIsTyping] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  
  // Login State
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)

  const supabase = createClient()
  const scrollRef = useRef<HTMLDivElement>(null)
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setSession(session)
      setLoading(false)
      if (session?.user) {
        const { data } = await supabase.from('agents').select('avatar_url').eq('id', session.user.id).single()
        if (data?.avatar_url) setAgentAvatar(data.avatar_url)
      }
    }

    checkSession()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session?.user) {
        supabase.from('agents').select('avatar_url').eq('id', session.user.id).single().then(({ data }) => {
          if (data?.avatar_url) setAgentAvatar(data.avatar_url)
        })
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) return

    fetchChats()
    fetchAgents()

    const channel = supabase
      .channel('admin_chats')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chats' }, () => {
        fetchChats()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [session])

  useEffect(() => {
    if (!activeChat) return

    const fetchMessages = async () => {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('chat_id', activeChat.id)
        .order('created_at', { ascending: true })
      
      if (data) setMessages(data)
    }

    fetchMessages()

    const channel = supabase
      .channel(`chat:${activeChat.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${activeChat.id}` }, (payload) => {
        setMessages(prev => {
            // Prevent duplicate messages
            if (prev.some(msg => msg.id === payload.new.id)) return prev
            return [...prev, payload.new as Message]
        })
      })
      .on('broadcast', { event: 'typing' }, (payload) => {
          if (payload.payload.sender === 'customer') {
              setIsTyping(true)
              if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
              typingTimeoutRef.current = setTimeout(() => setIsTyping(false), 3000)
          }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [activeChat])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isTyping])

  const fetchChats = async () => {
    const { data } = await supabase
      .from('chats')
      .select('*')
      .order('created_at', { ascending: false })
    
    if (data) setChats(data)
  }

  const fetchAgents = async () => {
    const { data } = await supabase.from('agents').select('*')
    if (data) setAgents(data)
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoginLoading(true)
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      toast.error(error.message)
    }
    setLoginLoading(false)
  }

  const handleLogout = async () => {
      await supabase.auth.signOut()
      setSession(null)
  }

  const handleTyping = async () => {
      if (!activeChat) return
      await supabase.channel(`chat:${activeChat.id}`).send({
          type: 'broadcast',
          event: 'typing',
          payload: { sender: 'agent' }
      })
  }

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMessage.trim() || !activeChat) return

    const { error } = await supabase.from('messages').insert({
      chat_id: activeChat.id,
      content: newMessage,
      sender_role: 'agent'
    })

    if (error) {
      toast.error('Failed to send message')
    } else {
      // Send push notification to customer
      await sendPushNotification(activeChat.customer_id, newMessage)
      setNewMessage('')
    }
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files || !e.target.files[0] || !activeChat) return
      
      const file = e.target.files[0]
      if (file.size > 25 * 1024 * 1024) {
          toast.error('File size must be less than 25MB')
          return
      }

      setUploading(true)
      const fileExt = file.name.split('.').pop()
      const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`
      const filePath = `${activeChat.id}/${fileName}`

      const { error: uploadError } = await supabase.storage
          .from('chat-attachments')
          .upload(filePath, file)

      if (uploadError) {
          toast.error('Failed to upload file')
          setUploading(false)
          return
      }

      const { data: { publicUrl } } = supabase.storage
          .from('chat-attachments')
          .getPublicUrl(filePath)

      const { error } = await supabase.from('messages').insert({
          chat_id: activeChat.id,
          content: `Sent a file: ${file.name}`,
          sender_role: 'agent',
          attachment_url: publicUrl,
          attachment_type: file.type.startsWith('image/') ? 'image' : 'file',
          attachment_name: file.name
      })

      if (error) toast.error('Failed to send file')
      setUploading(false)
  }

  const handleAssignAgent = async (agentName: string) => {
      if (!activeChat) return
      const { error } = await supabase.from('chats').update({ agent_name: agentName }).eq('id', activeChat.id)
      
      if (error) toast.error('Failed to assign agent')
      else {
          toast.success(`Assigned to ${agentName}`)
          setActiveChat(prev => prev ? { ...prev, agent_name: agentName } : null)
          
          // Add system message
          await supabase.from('messages').insert({
              chat_id: activeChat.id,
              content: `${agentName} has joined the chat`,
              sender_role: 'system'
          })
      }
  }

  const handleCloseChat = async () => {
      if (!activeChat) return
      const { error } = await supabase.from('chats').update({ status: 'closed' }).eq('id', activeChat.id)
      
      if (error) toast.error('Failed to close chat')
      else {
          toast.success('Chat closed')
          setActiveChat(prev => prev ? { ...prev, status: 'closed' } : null)

          // Add system message
          await supabase.from('messages').insert({
            chat_id: activeChat.id,
            content: 'Chat closed by agent',
            sender_role: 'system'
        })
      }
  }

  const handleLeaveChat = async () => {
      if (!activeChat) return
      // Clear agent name but keep status active
      const { error } = await supabase.from('chats').update({ agent_name: null }).eq('id', activeChat.id)

      if (error) toast.error('Failed to leave chat')
      else {
          toast.success('Left chat')
          const agentName = agents.find(a => a.id === session?.user?.id)?.name || 'Agent'
          
          await supabase.from('messages').insert({
              chat_id: activeChat.id,
              content: `${agentName} has left the chat. Waiting for an agent...`,
              sender_role: 'system'
          })
          
          setActiveChat(null)
      }
  }

  const handleExportPDF = () => {
      if (!activeChat || messages.length === 0) return
      
      const doc = new jsPDF()
      
      doc.setFontSize(16)
      doc.text(`Chat Transcript: ${activeChat.subject}`, 10, 10)
      doc.setFontSize(10)
      doc.text(`ID: ${activeChat.customer_id} | Date: ${new Date(activeChat.created_at).toLocaleDateString()}`, 10, 15)
      
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

      doc.save(`chat-${activeChat.id}.pdf`)
  }

  const handleUpdateAvatar = async () => {
       if (agentAvatar && !agentAvatar.startsWith('http')) {
           toast.error('Avatar URL must start with http or https')
           return
       }
 
       setAvatarLoading(true)
       const { data: { user } } = await supabase.auth.getUser()
       
       if (user) {
           const { error } = await supabase
             .from('agents')
             .upsert({ 
                 id: user.id, 
                 avatar_url: agentAvatar,
                 name: user.email?.split('@')[0] || 'Agent'
             })
             .select()
           
           if (error) {
               console.error(error)
               toast.error('Failed to update avatar')
           } else {
               toast.success('Avatar updated')
           }
       }
       setAvatarLoading(false)
   }

  if (loading) {
      return <div className="flex items-center justify-center h-screen">Loading...</div>
  }

  if (!session) {
    return (
      <div className="flex items-center justify-center h-screen bg-muted/20">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Admin Login</CardTitle>
            <CardDescription>Sign in to manage support chats</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Email</label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Password</label>
                <Input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
              </div>
              <Button type="submit" className="w-full" disabled={loginLoading}>
                {loginLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Sign In
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    )
  }

  const filteredChats = chats.filter(chat => {
      if (view === 'active') return chat.status === 'active'
      if (view === 'closed') return chat.status === 'closed'
      return true
  }).filter(chat => 
      chat.subject.toLowerCase().includes(search.toLowerCase()) || 
      chat.customer_id.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="flex h-screen bg-background relative">
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
      {/* Sidebar */}
      <div className={`
        fixed inset-0 z-50 bg-background/80 backdrop-blur-sm md:hidden
        ${isMobileMenuOpen ? 'block' : 'hidden'}
      `} onClick={() => setIsMobileMenuOpen(false)} />

      <div className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-card border-r transform transition-transform duration-200 ease-in-out md:relative md:translate-x-0
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="p-4 border-b flex justify-between items-center">
          <span className="font-bold text-xl">TSupport</span>
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setIsMobileMenuOpen(false)}>
            <XCircle className="h-5 w-5" />
          </Button>
        </div>
        <nav className="p-4 space-y-2">
          <Button 
            variant={view === 'active' ? 'secondary' : 'ghost'} 
            className="w-full justify-start" 
            onClick={() => { setView('active'); setIsMobileMenuOpen(false) }}
          >
            Active Chats
            <Badge className="ml-auto" variant="secondary">{chats.filter(c => c.status === 'active').length}</Badge>
          </Button>
          <Button 
            variant={view === 'closed' ? 'secondary' : 'ghost'} 
            className="w-full justify-start" 
            onClick={() => { setView('closed'); setIsMobileMenuOpen(false) }}
          >
            Closed History
          </Button>
          <Button 
            variant={view === 'users' ? 'secondary' : 'ghost'} 
            className="w-full justify-start gap-2" 
            onClick={() => { setView('users'); setIsMobileMenuOpen(false) }}
          >
            <Users className="h-4 w-4" />
            User Access
          </Button>
          <Button 
            variant={view === 'reviews' ? 'secondary' : 'ghost'} 
            className="w-full justify-start gap-2" 
            onClick={() => { setView('reviews'); setIsMobileMenuOpen(false) }}
          >
            <Star className="h-4 w-4" />
            Reviews
          </Button>
        </nav>
        <div className="absolute bottom-4 left-4 right-4 space-y-2">
           <Button variant="ghost" className="w-full justify-start gap-2" onClick={() => setView('settings')}>
             <Settings className="h-4 w-4" />
             Settings
           </Button>
           <Button variant="ghost" className="w-full justify-start gap-2 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={handleLogout}>
             <LogOut className="h-4 w-4" />
             Sign Out
           </Button>
         </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 border-b flex items-center px-4 justify-between bg-card">
          <div className="flex items-center">
             <Button variant="ghost" size="icon" className="md:hidden mr-2" onClick={() => setIsMobileMenuOpen(true)}>
                <Menu className="h-5 w-5" />
             </Button>
             <h2 className="font-semibold capitalize">{view}</h2>
          </div>
          {view !== 'settings' && view !== 'users' && (
             <div className="relative w-full max-w-xs">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Search chats..." 
                  className="pl-8" 
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
             </div>
          )}
        </header>

        <div className="flex-1 overflow-hidden flex">
          {view === 'settings' ? (
             <SettingsView agents={agents} onAddAgent={fetchAgents} 
                agentAvatar={agentAvatar} 
                setAgentAvatar={setAgentAvatar} 
                handleUpdateAvatar={handleUpdateAvatar} 
                avatarLoading={avatarLoading} 
             />
          ) : view === 'users' ? (
             <UsersView />
          ) : (
            <>
              {/* Chat List */}
              <div className={`
                w-full md:w-80 border-r flex flex-col bg-muted/20
                ${activeChat ? 'hidden md:flex' : 'flex'}
              `}>
                <ScrollArea className="flex-1">
                  <div className="p-2 space-y-2">
                    {filteredChats.map(chat => (
                      <div 
                        key={chat.id}
                        onClick={() => setActiveChat(chat)}
                        className={`
                          p-3 rounded-lg cursor-pointer border hover:bg-accent transition-colors
                          ${activeChat?.id === chat.id ? 'bg-accent border-primary' : 'bg-card'}
                        `}
                      >
                        <div className="flex justify-between items-start mb-1">
                          <span className="font-semibold truncate">{chat.subject}</span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(chat.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                          </span>
                        </div>
                        <div className="flex justify-between items-center text-xs text-muted-foreground">
                           <span>ID: {chat.customer_id}</span>
                           {chat.agent_name && (
                               <Badge variant="outline" className="text-[10px] h-4 px-1">{chat.agent_name}</Badge>
                           )}
                        </div>
                      </div>
                    ))}
                    {filteredChats.length === 0 && (
                        <div className="text-center p-4 text-muted-foreground text-sm">No chats found</div>
                    )}
                  </div>
                </ScrollArea>
              </div>

              {/* Chat Detail */}
              <div className={`
                flex-1 flex flex-col bg-background
                ${!activeChat ? 'hidden md:flex' : 'flex'}
              `}>
                {activeChat ? (
                  <>
                    <div className="p-4 border-b flex justify-between items-center">
                      <div className="flex items-center">
                        <Button variant="ghost" size="icon" className="md:hidden mr-2" onClick={() => setActiveChat(null)}>
                           <XCircle className="h-5 w-5" />
                        </Button>
                        <div>
                          <h3 className="font-bold">{activeChat.subject}</h3>
                          <p className="text-xs text-muted-foreground">Customer: {activeChat.customer_email} ({activeChat.customer_id})</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                         <Button variant="outline" size="sm" onClick={handleExportPDF}>
                             <FileText className="h-4 w-4 mr-2" />
                             PDF
                         </Button>
                         <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm">
                                    {activeChat.agent_name || 'Unassigned'}
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                                {agents.map(agent => (
                                    <DropdownMenuItem key={agent.id} onClick={() => handleAssignAgent(agent.name)}>
                                        {agent.name}
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                         </DropdownMenu>
                         {activeChat.status === 'active' && (
                             <>
                                <Button variant="outline" size="sm" onClick={handleLeaveChat}>Leave</Button>
                                <Button variant="destructive" size="sm" onClick={handleCloseChat}>Close</Button>
                             </>
                         )}
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={scrollRef}>
                      {messages.map((msg) => (
                        <div
                          key={msg.id}
                          className={`flex ${
                            msg.sender_role === 'agent' ? 'justify-end' : 
                            msg.sender_role === 'system' ? 'justify-center' : 'justify-start'
                          }`}
                        >
                          {msg.sender_role === 'system' ? (
                             <span className="text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded-full">
                                 {msg.content}
                             </span>
                          ) : (
                            <div
                              className={`
                                max-w-[80%] rounded-lg p-3
                                ${
                                  msg.sender_role === 'agent'
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-muted'
                                }
                              `}
                            >
                              <div className="text-xs opacity-70 mb-1 flex justify-between gap-4">
                                  <span>{msg.sender_role === 'agent' ? 'You' : 'Customer'}</span>
                                  <span>{new Date(msg.created_at).toLocaleTimeString()}</span>
                              </div>
                              <p className="whitespace-pre-wrap break-words text-sm">{msg.content}</p>
                              {msg.attachment_url && (
                                <div className="mt-2">
                                    {msg.attachment_type === 'image' ? (
                                        <img 
                                            src={msg.attachment_url} 
                                            alt="Attachment" 
                                            className="max-w-[200px] max-h-[150px] rounded-md cursor-pointer hover:opacity-90 object-cover border bg-background"
                                            onClick={() => setPreviewImage(msg.attachment_url || null)}
                                        />
                                    ) : (
                                        <a 
                                            href={msg.attachment_url} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-2 text-sm underline bg-background/20 p-2 rounded hover:bg-background/30 transition-colors"
                                        >
                                            <Paperclip className="h-4 w-4" />
                                            {msg.attachment_name || 'Attachment'}
                                        </a>
                                    )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                      {isTyping && (
                          <div className="flex justify-start">
                              <div className="bg-muted rounded-lg p-3 text-xs text-muted-foreground animate-pulse">
                                  Customer is typing...
                              </div>
                          </div>
                      )}
                    </div>

                    <div className="p-4 border-t">
                      <form onSubmit={handleSendMessage} className="flex gap-2 items-center">
                        <input 
                            type="file" 
                            ref={fileInputRef} 
                            className="hidden" 
                            onChange={handleFileUpload}
                            accept="image/*,.pdf,.doc,.docx"
                        />
                        <Button 
                            type="button" 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => fileInputRef.current?.click()}
                            disabled={activeChat.status === 'closed' || uploading}
                        >
                            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                        </Button>
                        <Input 
                          value={newMessage} 
                          onChange={e => {
                              setNewMessage(e.target.value)
                              handleTyping()
                          }} 
                          placeholder="Type reply..." 
                          disabled={activeChat.status === 'closed'}
                        />
                        <Button type="submit" disabled={activeChat.status === 'closed' || !newMessage.trim()}>
                           <Send className="h-4 w-4" />
                        </Button>
                      </form>
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-muted-foreground">
                    Select a chat to view details
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function SettingsView({ 
    agents, 
    onAddAgent, 
    agentAvatar, 
    setAgentAvatar, 
    handleUpdateAvatar, 
    avatarLoading 
}: { 
    agents: Agent[], 
    onAddAgent: () => void,
    agentAvatar: string,
    setAgentAvatar: (url: string) => void,
    handleUpdateAvatar: () => void,
    avatarLoading: boolean
}) {
    const [name, setName] = useState('')
    const supabase = createClient()

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!name.trim()) return
        const { error } = await supabase.from('agents').insert({ name })
        if (error) toast.error('Failed to add agent')
        else {
            toast.success('Agent added')
            setName('')
            onAddAgent()
        }
    }

    return (
        <div className="p-6 w-full max-w-2xl overflow-y-auto">
            <h3 className="text-lg font-bold mb-4">Settings</h3>
            
            {/* Avatar Settings */}
            <Card className="mb-6">
               <CardHeader>
                   <CardTitle>Your Avatar</CardTitle>
                   <CardDescription>Set your agent avatar URL</CardDescription>
               </CardHeader>
               <CardContent className="space-y-4">
                  <div className="flex gap-4 items-center">
                      <Avatar className="h-16 w-16">
                          <AvatarImage src={agentAvatar} />
                          <AvatarFallback><User className="h-8 w-8" /></AvatarFallback>
                      </Avatar>
                      <Input 
                          value={agentAvatar} 
                          onChange={(e) => setAgentAvatar(e.target.value)}
                          placeholder="https://example.com/avatar.png" 
                      />
                  </div>
                  <Button onClick={handleUpdateAvatar} disabled={avatarLoading}>
                      {avatarLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Save Avatar
                  </Button>
               </CardContent>
            </Card>

            <h3 className="text-lg font-bold mb-4">Manage Agents</h3>
            <Card className="mb-6">
                <CardContent className="pt-6">
                    <form onSubmit={handleAdd} className="flex gap-2">
                        <Input value={name} onChange={e => setName(e.target.value)} placeholder="Agent Name" />
                        <Button type="submit">Add</Button>
                    </form>
                </CardContent>
            </Card>
            <div className="grid gap-2">
                {agents.map(agent => (
                    <Card key={agent.id}>
                        <CardContent className="p-4 flex justify-between items-center">
                            <span>{agent.name}</span>
                            <Badge variant="secondary">Agent</Badge>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    )
}

function UsersView() {
    const [users, setUsers] = useState<AllowedUser[]>([])
    const [newId, setNewId] = useState('')
    const supabase = createClient()
    const fileInputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        fetchUsers()
    }, [])

    const fetchUsers = async () => {
        const { data } = await supabase.from('allowed_users').select('*').order('created_at', { ascending: false })
        if (data) setUsers(data)
    }

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!newId.trim()) return

        const { error } = await supabase.from('allowed_users').insert({ customer_id: newId.trim() })
        if (error) {
            toast.error('Failed to add user (might be duplicate)')
        } else {
            toast.success('User added')
            setNewId('')
            fetchUsers()
        }
    }

    const handleDelete = async (id: string) => {
        const { error } = await supabase.from('allowed_users').delete().eq('id', id)
        if (error) toast.error('Failed to delete user')
        else {
            toast.success('User deleted')
            fetchUsers()
        }
    }

    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || !e.target.files[0]) return
        
        const file = e.target.files[0]
        const reader = new FileReader()
        
        reader.onload = async (event) => {
            try {
                const json = JSON.parse(event.target?.result as string)
                if (!Array.isArray(json)) {
                    toast.error('Invalid JSON format. Expected an array of IDs.')
                    return
                }

                // Insert in batches
                const records = json.map(id => ({ customer_id: String(id) }))
                const { error } = await supabase.from('allowed_users').upsert(records, { onConflict: 'customer_id' })
                
                if (error) throw error
                toast.success(`Imported ${records.length} users`)
                fetchUsers()
            } catch (error) {
                console.error(error)
                toast.error('Failed to import users')
            }
        }
        
        reader.readAsText(file)
    }

    return (
        <div className="p-6 w-full max-w-2xl overflow-y-auto">
            <h3 className="text-lg font-bold mb-4">Manage Allowed Users</h3>
            
            <Card className="mb-6">
                <CardHeader>
                    <CardTitle>Add User</CardTitle>
                    <CardDescription>Add a single user ID or import from JSON</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <form onSubmit={handleAdd} className="flex gap-2">
                        <Input value={newId} onChange={e => setNewId(e.target.value)} placeholder="Customer ID" />
                        <Button type="submit">Add</Button>
                    </form>
                    
                    <div className="flex items-center gap-4 border-t pt-4">
                        <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                            <Users className="h-4 w-4 mr-2" />
                            Import JSON
                        </Button>
                        <input 
                            type="file" 
                            ref={fileInputRef} 
                            className="hidden" 
                            accept=".json"
                            onChange={handleImport}
                        />
                        <span className="text-xs text-muted-foreground">JSON format: ["id1", "id2", ...]</span>
                    </div>
                </CardContent>
            </Card>

            <div className="space-y-2">
                {users.map(user => (
                    <div key={user.id} className="flex justify-between items-center p-3 border rounded-lg bg-card">
                        <span className="font-mono">{user.customer_id}</span>
                        <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600" onClick={() => handleDelete(user.id)}>
                            Remove
                        </Button>
                    </div>
                ))}
                {users.length === 0 && <div className="text-center text-muted-foreground">No users found</div>}
            </div>
        </div>
    )
}
