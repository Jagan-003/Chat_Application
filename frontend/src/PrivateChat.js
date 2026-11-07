import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';

const PrivateChat = ({ token, socket, targetUser, myUserId }) => {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef(null);

  
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const emojiList = ['😀','😂','🥰','😎','🤔','👍','🙌','🔥','✨','🎉'];

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  useEffect(() => {
    const fetchPrivateHistory = async () => {
      try {
        const response = await axios.get(`http://localhost:5000/api/private-history/${targetUser.id}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setMessages(response.data);
        scrollToBottom();
      } catch (error) {
        console.error("Failed to fetch private history:", error);
      }
    };
    fetchPrivateHistory();
  }, [token, targetUser.id]);

  useEffect(() => {
    if (!socket) return;
    const handleNewPrivateMessage = (message) => {
      if (String(message.sender_id) === String(targetUser.id) || String(message.receiver_id) === String(targetUser.id)) {
        setMessages(prev => [...prev, message]);
        scrollToBottom();
      }
    };
    socket.on('receive_private_message', handleNewPrivateMessage);
    return () => socket.off('receive_private_message', handleNewPrivateMessage);
  }, [socket, targetUser.id]);

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (newMessage.trim() && socket) {
      socket.emit('send_private_message', { 
        token, 
        receiver_id: targetUser.id,
        content: newMessage 
      });
      setNewMessage('');
      setShowEmojiPicker(false); 
    }
  };

  return (
    <div className="chat-window private-chat">
      <div className="messages-container">
        {messages.map((msg) => {
          // Alignment check
          const isSentByMe = String(msg.sender_id) === String(myUserId);
          return (
            <div key={msg.id} className={`message-row ${isSentByMe ? 'sent' : 'received'}`}>
              <div className={`message-wrapper ${isSentByMe ? 'sent' : 'received'}`}>
                <span className="message-username">{msg.sender_name}: </span>
                <span className="message-content">{msg.content}</span>
                <span className="message-timestamp">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>
      
      
      <div className="message-input-wrapper">
        {showEmojiPicker && (
          <div className="emoji-picker">
            {emojiList.map(emoji => (
              <button 
                key={emoji} 
                type="button" 
                className="emoji-btn" 
                onClick={() => { setNewMessage(prev => prev + emoji); setShowEmojiPicker(false); }}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}

        <form onSubmit={handleSendMessage} className="message-form">
          <button type="button" className="icon-btn" onClick={() => setShowEmojiPicker(!showEmojiPicker)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle><path d="M8 14s1.5 2 4 2 4-2 4-2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line>
            </svg>
          </button>
          
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder={`Message ${targetUser.username}...`}
            className="message-input"
          />
          
          <button type="button" className="icon-btn" onClick={() => alert("File attachment ready.")}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path>
            </svg>
          </button>
          
          <button type="submit" className="send-btn-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginLeft: '-2px'}}>
              <line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
};

export default PrivateChat;