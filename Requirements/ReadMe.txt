1. Frontend Setup:

npx create-react-app frontend
cd frontend
npm install socket.io-client axios react-router-dom
npm install axios

2.Backend Setup:

mkdir backend
cd backend
python -m venv venv

-> Activate Virtual Environment using : venv\Scripts\activate

3.install python dependencies  using -> pip install requirements.txt

4. install MySql and configure in vs code to connect and test it.

5. Registration & Login: Develop frontend forms and Flask APIs for user registration and authentication, storing user details in MySQL.

6. JWT & Status: Verify login credentials, update online status and generate a JWT for secure frontend authentication.

7.Secure Connection: React opens a persistent, live connection to Flask, using your JWT to verify your identity.

8.Live Status: The server automatically signals to all other connected users that you are now online.

9.Chat History: Upon joining, the app pulls the last 50 messages from the MySQL database so you can catch up on the conversation.

10.Instant Messaging: When you type a message, it is sent over the live connection, securely saved to the database, and immediately broadcasted to everyone's screen.

11.User List API: Create a Flask API to get all registered users and their online/offline status.

12.Frontend Interface: Create a React component to display all users.

13.Search & Filter: Add a search bar to find users and a filter to show only online users.

14.Live Status Updates: Use WebSockets to update user status automatically when they come online or go offline.

15.Send Request: Allow users to send chat requests to other users through the frontend.

16.Pending Requests: Store incoming chat requests with a pending status in the MySQL database.

17.Real-time Notifications: Notify the receiver instantly using WebSocket events.

18.Accept Request: Allow users to accept requests and update the relationship status to accepted in the database.

19.Private Chat Access: Unlock the private chat window once a chat request is accepted.

20.Send Messages: Allow users to send private messages through the chat interface.

21.Message Security & Storage: Verify the accepted relationship before saving messages in the MySQL private_messages table.

22.Real-time Delivery: Deliver messages instantly to the intended recipient through a private WebSocket room.

