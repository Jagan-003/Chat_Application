import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import './Css Files/UserDirectory.css';

const UserDirectory = ({ token, socket, setActivePrivateChat }) => {
  const [users, setUsers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [onlineOnly, setOnlineOnly] = useState(false);

  // fetch the users 

  const fetchUsers = useCallback(async () => {
    try {
      const response = await axios.get('http://localhost:5000/api/users', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUsers(response.data);
    } catch (error) {
      console.error("Failed to fetch users", error);
    }
  }, [token]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    if (!socket) return;
    
    socket.on('user_status_change', fetchUsers);
    socket.on('request_accepted', fetchUsers);
    socket.on('request_rejected', fetchUsers);
    socket.on('private_chat_ended', fetchUsers);
    socket.on('new_chat_request', fetchUsers);

    return () => {
      socket.off('user_status_change', fetchUsers);
      socket.off('request_accepted', fetchUsers);
      socket.off('request_rejected', fetchUsers);
      socket.off('private_chat_ended', fetchUsers);
      socket.off('new_chat_request', fetchUsers);
    };
  }, [socket, fetchUsers]);

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.username.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesOnline = onlineOnly ? user.is_online : true;
    return matchesSearch && matchesOnline;
  });

  const handleSendRequest = async (targetId) => {
    try {
      await axios.post('http://localhost:5000/api/requests/send', 
        { receiver_id: targetId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      fetchUsers(); 
    } catch (error) {
      console.error("Failed to send request:", error);
    }
  };

  return (
    <div className="directory-sidebar">
      <div className="sidebar-brand">
        <h2>Signal</h2>
      </div>

      <h3>Team Directory</h3>
      <div className="filters">
        <input 
          type="text" 
          placeholder="Search team..." 
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="search-input"
        />
        <label className="online-toggle">
          <input 
            type="checkbox" 
            checked={onlineOnly}
            onChange={(e) => setOnlineOnly(e.target.checked)}
          />
          Online Only
        </label>
      </div>
      
      <ul className="user-list">
        {filteredUsers.map(user => (
          <li key={user.id} className="user-item">
            <div className="user-info">
              <span className={`status-dot ${user.is_online ? 'online' : 'offline'}`}></span>
              <span className="username">{user.username}</span>
            </div>
            

            {user.is_online ? (
              user.chat_status === 'accepted' ? (
                <button className="request-btn accepted" onClick={() => setActivePrivateChat(user)}>
                  Message
                </button>
              ) : user.chat_status === 'pending' ? (
                <span className="pending-text">Pending</span>
              ) : (
                <button className="request-btn" onClick={() => handleSendRequest(user.id)}>
                  Ask to Chat
                </button>
              )
            ) : (
              <span style={{ fontSize: '0.75rem', color: '#8f9bb3' }}>Unavailable</span>
            )}
          </li>
        ))}
        {filteredUsers.length === 0 && <p className="no-users" style={{color: '#8f9bb3'}}>No users found.</p>}
      </ul>
    </div>
  );
};

export default UserDirectory;