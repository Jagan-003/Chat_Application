import React, { useState } from 'react';
import axios from 'axios';
import './Css Files/Auth.css'; 

const Auth = ({ setToken }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  // Checks with the form submission 
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const endpoint = isLogin ? '/api/login' : '/api/register';
    
    try {
      const response = await axios.post(`http://localhost:5000${endpoint}`, {
        username,
        password
      });
      
      if (isLogin) {
        const token = response.data.token;
        sessionStorage.setItem('token', token);
        sessionStorage.setItem('username', response.data.username);
        setToken(token);
        window.location.reload();
        console.log("Token received:", token);
      } else {
        setIsLogin(true);
        setUsername('');
        setPassword('');
        alert('Registration successful! Please log in.');
      }
    } catch (error) {
      if (error.response) {
        setError(error.response.data.msg);
      } else {
        setError("Network error. Is the server running?");
      }
    }
  };

  return (
    <div className="modernize-auth-wrapper">
      <div className="modernize-auth-card">
        <div className="auth-brand">
          <h2>SIGNAL</h2>
          <p>Your secure team workspace</p>
        </div>

        <h3 className="auth-title">{isLogin ? 'Sign In' : 'Create Account'}</h3>
        
        {error && <div className="auth-alert">{error}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="input-group">
            <label>Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              placeholder="Enter username"
            />
          </div>

          <div className="input-group">
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="Enter password"
            />
          </div>

          <button type="submit" className="auth-submit-btn">
            {isLogin ? 'Sign In' : 'Sign Up'}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            {isLogin ? "New to Signal?" : "Already have an account?"}
          </p>
          <button 
            type="button" 
            className="auth-toggle-btn"
            onClick={() => {
              setIsLogin(!isLogin);
              setError('');
            }}
          >
            {isLogin ? 'Create an account' : 'Sign in'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Auth;