import React, { useState } from 'react';
import Auth from './Auth';
import GlobalChat from './GlobalChat';

const App = () => {
  const getValidToken = () => {
    const t = sessionStorage.getItem('token');
    if (t === "undefined" || t === "null" || !t) return null;
    return t;
  };

  const [token, setToken] = useState(getValidToken());

  return (
    <div className="app-container">
      {token ? (
        <GlobalChat token={token} setToken={setToken} />
      ) : (
        <Auth setToken={setToken} />
      )}
    </div>
  );
};

export default App;