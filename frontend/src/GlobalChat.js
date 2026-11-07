import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import axios from 'axios';
import './Css Files/GlobalChat.css';
import UserDirectory from './UserDirectory';
import PrivateChat from './PrivateChat';

const GlobalChat = ({ token, setToken }) => {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [socket, setSocket] = useState(null);
  const messagesEndRef = useRef(null);
  
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [rejections, setRejections] = useState([]); 
  
  const [showNotifications, setShowNotifications] = useState(false);
  const [notificationHistory, setNotificationHistory] = useState([]);

  const [activePrivateChat, setActivePrivateChat] = useState(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const emojiList = ['😀','😂','🥰','😎','🤔','👍','🙌','🔥','✨','🎉'];

  const myUsername = sessionStorage.getItem('username') || 'U';

  const getMyUserId = () => {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
      return String(JSON.parse(jsonPayload).sub); 
    } catch (e) { return null; }
  };
  const myUserId = getMyUserId();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const response = await axios.get('http://localhost:5000/api/global-history', { headers: { Authorization: `Bearer ${token}` }});
        setMessages(response.data);
        scrollToBottom();
      } catch (error) {}
    };

    const fetchPendingRequests = async () => {
      try {
        const response = await axios.get('http://localhost:5000/api/requests/pending', { headers: { Authorization: `Bearer ${token}` }});
        setIncomingRequests(response.data); 
      } catch (error) {}
    };

    fetchHistory();
    fetchPendingRequests(); 

    const newSocket = io('http://localhost:5000', { auth: { token } });

    newSocket.on('receive_global_message', (message) => {
      setMessages((prevMessages) => [...prevMessages, message]);
      scrollToBottom();
    });

    newSocket.on('new_chat_request', (data) => {
      const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
      audio.play().catch(() => {});
      setIncomingRequests(prev => [...prev, data]);
    });

    newSocket.on('request_accepted', (data) => {
      setActivePrivateChat({ id: data.receiver_id, username: data.receiver_username });
    });

    newSocket.on('request_rejected', (data) => {
      const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
      audio.play().catch(() => {});
      
      const rejId = Date.now();
      setRejections(prev => [...prev, { id: rejId, username: data.receiver_username }]);
      
      setTimeout(() => {
        setRejections(prev => prev.filter(req => req.id !== rejId));
      }, 4000); 
    });

    newSocket.on('private_chat_ended', (data) => {
      setActivePrivateChat((prevActiveChat) => {
        if (prevActiveChat && String(prevActiveChat.id) === String(data.partner_id)) {
          return null; 
        }
        return prevActiveChat;
      });
    });

    newSocket.on('connect', () => {
      setTimeout(() => { newSocket.emit('user_connected', { token }); }, 500);
    });

    setSocket(newSocket);

    return () => {
      newSocket.emit('client_disconnecting', { token });
      newSocket.disconnect();
    };
  }, [token]);

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (newMessage.trim() && socket) {
      socket.emit('send_global_message', { token, content: newMessage });
      setNewMessage('');
      setShowEmojiPicker(false);
    }
  };

  const handleLogout = () => {
    if (socket) {
      socket.emit('client_disconnecting', { token });
      socket.disconnect();
    }
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('username');
    setToken(null);
  };

  const handleRequestResponse = async (senderId, senderUsername, action) => {
    try {
      await axios.post('http://localhost:5000/api/requests/respond', 
        { sender_id: senderId, action: action },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setIncomingRequests(prev => prev.filter(req => req.sender_id !== senderId));
      if (action === 'accepted') {
        setActivePrivateChat({ id: senderId, username: senderUsername });
      }
    } catch (error) {
      console.error("Failed to respond", error);
    }
  };

  const handleClosePrivateChat = async () => {
    try {
      await axios.post('http://localhost:5000/api/requests/end', 
        { other_user_id: activePrivateChat.id },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setActivePrivateChat(null); 
    } catch (error) {
      console.error("Failed to end chat", error);
    }
  };

  const toggleNotifications = async () => {
    if (!showNotifications) {
      try {
        const response = await axios.get('http://localhost:5000/api/notifications/history', {
          headers: { Authorization: `Bearer ${token}` }
        });
        setNotificationHistory(response.data);
      } catch (error) {
        console.error("Failed to fetch notification history:", error);
      }
    }
    setShowNotifications(!showNotifications);
  };

  return (
    <div className="chat-layout">
      
      <div className="toast-container">
        {incomingRequests.map((req) => (
          <div key={`req-${req.sender_id}`} className="toast dark-invite">
            <div className="toast-header">Notification</div>
            <p className="toast-body"><strong>{req.sender_username.toUpperCase()}</strong> wants to chat with You.</p>
            <div className="toast-actions-dark">
              <button onClick={() => handleRequestResponse(req.sender_id, req.sender_username, 'accepted')} className="accept-btn-dark">Accept</button>
              <div className="btn-divider"></div>
              <button onClick={() => handleRequestResponse(req.sender_id, req.sender_username, 'rejected')} className="reject-btn-dark">Decline</button>
            </div>
          </div>
        ))}

        {rejections.map((rej) => (
          <div key={rej.id} className="ios-banner">
            <div className="ios-banner-header">
              <span className="ios-title">MESSAGE</span>
              <span className="ios-time">NOW</span>
            </div>
            <div className="ios-banner-body">
              {rej.username} declined your chat request.
            </div>
          </div>
        ))}
      </div>
      
      <UserDirectory 
        token={token} 
        socket={socket} 
        setActivePrivateChat={setActivePrivateChat} 
      />

      <div className="main-content">
        <header className="chat-header">
          <h2 style={{ display: 'flex', alignItems: 'center' }}>
            {activePrivateChat ? (
              <>
                Chatting with {activePrivateChat.username}
                <span style={{ display: 'inline-block', width: '10px', height: '10px', backgroundColor: '#00d68f', borderRadius: '50%', marginLeft: '10px' }}></span>
              </>
            ) : "Main DashBoard"}
          </h2>
          
          <div className="header-right" style={{ position: 'relative' }}>
            {activePrivateChat && (
              <button onClick={handleClosePrivateChat} className="logout-btn" style={{marginRight: '10px'}}>
                Back to Global
              </button>
            )}

            {/* Notification Bell Button */}
            <button onClick={toggleNotifications} className="icon-btn" style={{marginRight: '15px', position: 'relative'}}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7b809a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
              </svg>
            </button>

            
            {showNotifications && (
              <div className="notifications-dropdown">
                <div className="dropdown-header">Today & Yesterday History</div>
                <div className="dropdown-body">
                  {notificationHistory.length === 0 ? (
                    <p className="no-notifs">No recent requests.</p>
                  ) : (
                    notificationHistory.map((notif, index) => {
                      
                      const isMyRequest = String(notif.sender_id) === String(myUserId);
                      
                      let displayText = "";
                      if (isMyRequest) {
                        displayText = `You sent a request to ${notif.receiver_username}.`;
                      } else {
                        displayText = `${notif.sender_username} sent you a request.`;
                      }

                      return (
                        <div key={index} className="notif-history-item">
                          <div className="notif-details">
                            <strong>{isMyRequest ? `To: ${notif.receiver_username}` : notif.sender_username}</strong> 
                            <div style={{ fontSize: '0.82rem', color: '#7b809a', marginTop: '2px' }}>
                              {displayText}
                            </div>
                          </div>
                          <div className="notif-meta">
                            <span className={`notif-status ${notif.status}`}>{notif.status}</span>
                            <span className="notif-time">
                              {new Date(notif.timestamp).toLocaleString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            <button onClick={handleLogout} className="logout-btn">Log Out</button>
            <img src={`https://ui-avatars.com/api/?name=${myUsername}&background=2e3a59&color=fff&bold=true`} alt="Profile" className="profile-pic" />
          </div>
        </header>

        {activePrivateChat ? (
          <PrivateChat 
            token={token} 
            socket={socket} 
            targetUser={activePrivateChat} 
            myUserId={myUserId}
          />
        ) : (
          <div className="chat-window">
            <div className="messages-container">
              {messages.map((msg) => {
                const isSentByMe = String(msg.user_id) === String(myUserId);
                return (
                  <div key={msg.id} className={`message-row ${isSentByMe ? 'sent' : 'received'}`}>
                    <div className={`message-wrapper ${isSentByMe ? 'sent' : 'received'}`}>
                      <span className="message-username">{msg.username}: </span>
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
                    <button key={emoji} type="button" className="emoji-btn" onClick={() => { setNewMessage(prev => prev + emoji); setShowEmojiPicker(false); }}>
                      {emoji}
                    </button>
                  ))}
                </div>
              )}

              <form onSubmit={handleSendMessage} className="message-form">
                <button type="button" className="icon-btn" onClick={() => setShowEmojiPicker(!showEmojiPicker)}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M8 14s1.5 2 4 2 4-2 4-2"></path><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line></svg>
                </button>
                <input type="text" value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder="Type a message here..." className="message-input" />
                <button type="button" className="icon-btn" onClick={() => alert("File attachment ready.")}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
                </button>
                <button type="submit" className="send-btn-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginLeft: '-2px'}}><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default GlobalChat;