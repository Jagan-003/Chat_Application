from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_jwt_extended import JWTManager, create_access_token, decode_token, jwt_required, get_jwt_identity
from jwt.exceptions import ExpiredSignatureError, InvalidTokenError
from flask_socketio import SocketIO, emit, join_room, leave_room
import mysql.connector
import bcrypt
import os
from dotenv import load_dotenv
from datetime import datetime

load_dotenv()

app = Flask(__name__)
CORS(app)
app.config['JWT_SECRET_KEY'] = os.getenv('JWT_SECRET_KEY')
jwt = JWTManager(app)

socketio = SocketIO(app, cors_allowed_origins="*")

# connection code to connect to the database

def get_db_connection():
    return mysql.connector.connect(
        host=os.getenv('DB_HOST'),
        user=os.getenv('DB_USER'),
        password=os.getenv('DB_PASSWORD'),
        database=os.getenv('DB_NAME')
    )

def verify_socket_token(token):
    try:
        if not token:
            return None
        decoded = decode_token(token)
        return decoded['sub']
    except Exception as e:
        print(f"Socket token error: {e}")
        return None

# for registration of new user 

@app.route('/api/register', methods=['POST'])
def register():
    data = request.json
    username = data.get('username')
    password = data.get('password')

    if not username or not password:
        return jsonify({"msg": "Username and password required"}), 400

    # Hash password securely
    hashed_password = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt())

    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO users (username, password_hash) VALUES (%s, %s)",
            (username, hashed_password.decode('utf-8'))
        )
        conn.commit()
        return jsonify({"msg": "User registered successfully"}), 201
    except mysql.connector.IntegrityError:
        return jsonify({"msg": "Username already exists"}), 409
    finally:
        cursor.close()
        conn.close()


# for login of the user 

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    username = data.get('username')
    password = data.get('password')

    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("SELECT * FROM users WHERE username = %s", (username,))
    user = cursor.fetchone()

# Verify user exists and password matches

    if user and bcrypt.checkpw(password.encode('utf-8'), user['password_hash'].encode('utf-8')):


        cursor.execute("UPDATE users SET is_online = True WHERE id = %s", (user['id'],))
        conn.commit()
        
# Generate the JWT badge

        access_token = create_access_token(identity=str(user['id']))
        cursor.close()
        conn.close()
        return jsonify({"token": access_token, "username": user['username'], "id": user['id']}), 200
    
    cursor.close()
    conn.close()
    return jsonify({"msg": "Invalid credentials"}), 401


# Fetch global chat history

@app.route('/api/global-history', methods=['GET'])
def get_global_history():
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    cursor.execute("""
        SELECT m.id, m.content, m.timestamp, u.username, u.id as user_id 
        FROM global_messages m
        JOIN users u ON m.user_id = u.id
        ORDER BY m.timestamp DESC LIMIT 50
    """)
    messages = cursor.fetchall()
    cursor.close()
    conn.close()
    return jsonify(messages[::-1]), 200



@app.route('/api/requests/send', methods=['POST'])
@jwt_required()
def send_request():
    sender_id = int(get_jwt_identity())
    receiver_id = request.json.get('receiver_id')

    if not receiver_id or sender_id == receiver_id:
        return jsonify({"msg": "Invalid target user"}), 400

    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    try:
        
        cursor.execute("""
            INSERT INTO chat_requests (sender_id, receiver_id, status) 
            VALUES (%s, %s, 'pending')
            ON DUPLICATE KEY UPDATE status = 'pending', timestamp = CURRENT_TIMESTAMP
        """, (sender_id, receiver_id))
        conn.commit()
        
        cursor.execute("SELECT username FROM users WHERE id = %s", (sender_id,))
        sender_username = cursor.fetchone()['username']
        
        socketio.emit('new_chat_request', {
            'sender_id': sender_id,
            'sender_username': sender_username
        }, room=f"user_{receiver_id}")
        
        return jsonify({"msg": "Request sent successfully"}), 200
    finally:
        cursor.close()
        conn.close()


@app.route('/api/requests/respond', methods=['POST'])
@jwt_required()
def respond_request():
    receiver_id = int(get_jwt_identity())
    sender_id = request.json.get('sender_id')
    action = request.json.get('action') 

    if action not in ['accepted', 'rejected']:
        return jsonify({"msg": "Invalid action"}), 400

    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute(
        "UPDATE chat_requests SET status = %s WHERE sender_id = %s AND receiver_id = %s",
        (action, sender_id, receiver_id)
    )
    conn.commit()
    
    cursor.execute("SELECT username FROM users WHERE id = %s", (receiver_id,))
    receiver_username = cursor.fetchone()[0]

    
    if action == 'accepted':
        socketio.emit('request_accepted', {
            'receiver_id': receiver_id,
            'receiver_username': receiver_username
        }, room=f"user_{sender_id}")
    elif action == 'rejected':
        socketio.emit('request_rejected', {
            'receiver_username': receiver_username
        }, room=f"user_{sender_id}")

    cursor.close()
    conn.close()
    return jsonify({"msg": f"Request {action}"}), 200

# Fetch all users except the current user, prioritizing online users first

@app.route('/api/users', methods=['GET'])
@jwt_required()
def get_users():
    current_user_id = int(get_jwt_identity())
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    
    cursor.execute("""
        SELECT u.id, u.username, u.is_online, u.last_seen, MAX(c.status) as chat_status 
        FROM users u
        LEFT JOIN chat_requests c 
          ON (u.id = c.receiver_id AND c.sender_id = %s) 
          OR (u.id = c.sender_id AND c.receiver_id = %s)
        WHERE u.id != %s 
        GROUP BY u.id, u.username, u.is_online, u.last_seen
        ORDER BY u.is_online DESC, u.username ASC
    """, (current_user_id, current_user_id, current_user_id))
    
    users = cursor.fetchall()
    cursor.close()
    conn.close()
    return jsonify(users), 200

@app.route('/api/private-history/<int:other_user_id>', methods=['GET'])
@jwt_required()
def get_private_history(other_user_id):
    current_user_id = int(get_jwt_identity())
    conn = get_db_connection()
    
   
    cursor = conn.cursor(dictionary=True, buffered=True) 
    
    cursor.execute("""
        SELECT status FROM chat_requests 
        WHERE (sender_id = %s AND receiver_id = %s) OR (sender_id = %s AND receiver_id = %s)
    """, (current_user_id, other_user_id, other_user_id, current_user_id))
    rel = cursor.fetchone()
    
    if not rel or rel['status'] != 'accepted':
        cursor.close()
        conn.close()
        return jsonify({"msg": "Unauthorized"}), 403

    cursor.execute("""
        SELECT m.id, m.content, m.timestamp, m.sender_id, u.username as sender_name
        FROM private_messages m
        JOIN users u ON m.sender_id = u.id
        WHERE (m.sender_id = %s AND m.receiver_id = %s) OR (m.sender_id = %s AND m.receiver_id = %s)
        ORDER BY m.timestamp DESC LIMIT 50
    """, (current_user_id, other_user_id, other_user_id, current_user_id))
    
    messages = cursor.fetchall()
    cursor.close()
    conn.close()
    return jsonify(messages[::-1]), 200


@app.route('/api/requests/end', methods=['POST'])
@jwt_required()
def end_private_chat():
    current_user_id = int(get_jwt_identity())
    other_user_id = request.json.get('other_user_id')

    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("""
        DELETE FROM chat_requests 
        WHERE (sender_id = %s AND receiver_id = %s) 
           OR (sender_id = %s AND receiver_id = %s)
    """, (current_user_id, other_user_id, other_user_id, current_user_id))
    conn.commit()
    cursor.close()
    conn.close()

   
    socketio.emit('private_chat_ended', {'partner_id': current_user_id}, room=f"user_{other_user_id}")
    socketio.emit('private_chat_ended', {'partner_id': other_user_id}, room=f"user_{current_user_id}")

    return jsonify({"msg": "Chat ended"}), 200

@app.route('/api/requests/pending', methods=['GET'])
@jwt_required()
def get_pending_requests():
    current_user_id = int(get_jwt_identity())
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    cursor.execute("""
        SELECT c.sender_id, u.username as sender_username
        FROM chat_requests c
        JOIN users u ON c.sender_id = u.id
        WHERE c.receiver_id = %s AND c.status = 'pending'
    """, (current_user_id,))
    
    pending_requests = cursor.fetchall()
    cursor.close()
    conn.close()
    
    return jsonify(pending_requests), 200


@app.route('/api/notifications/history', methods=['GET'])
@jwt_required()
def get_notification_history():
    current_user_id = int(get_jwt_identity())
    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True, buffered=True)
    
    
    cursor.execute("""
        SELECT 
            c.sender_id, 
            c.receiver_id,
            s.username as sender_username, 
            r.username as receiver_username,
            c.status, 
            c.timestamp 
        FROM chat_requests c
        JOIN users s ON c.sender_id = s.id
        JOIN users r ON c.receiver_id = r.id
        WHERE (c.receiver_id = %s OR c.sender_id = %s)
          AND c.timestamp >= DATE_SUB(NOW(), INTERVAL 2 DAY)
        ORDER BY c.timestamp DESC
    """, (current_user_id, current_user_id))
    
    history = cursor.fetchall()
    cursor.close()
    conn.close()
    
    for n in history:
        n['timestamp'] = str(n['timestamp'])
        
    return jsonify(history), 200




# WebSocket Events for Real-Time Chat

active_sessions = {}

@socketio.on('connect')
def handle_connect(auth):
    token = auth.get('token') if auth else None
    user_id = verify_socket_token(token)
    
    if not user_id:
        print("Connection rejected: Invalid or missing token")
        return False 

    active_sessions[request.sid] = user_id

    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    cursor.execute("UPDATE users SET is_online = True WHERE id = %s", (user_id,))
    conn.commit()
    cursor.close()
    conn.close()

    join_room(f"user_{user_id}")
    
    print(f"User {user_id} connected successfully to SocketIO.")


@socketio.on('user_connected')
def handle_user_connected(data):
    user_id = verify_socket_token(data.get('token'))
    if user_id:
        emit('user_status_change', {'userId': user_id, 'status': 'online'}, broadcast=True, include_self=False)



@socketio.on('client_disconnecting')
def handle_client_disconnecting(data):
    user_id = verify_socket_token(data.get('token'))
    if user_id:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE users SET is_online = False, last_seen = NOW() WHERE id = %s", (user_id,))
        conn.commit()
        cursor.close()
        conn.close()
        emit('user_status_change', {'userId': user_id, 'status': 'offline'}, broadcast=True)


@socketio.on('disconnect')
def handle_disconnect():
    user_id = active_sessions.pop(request.sid, None)
    
    if user_id:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE users SET is_online = False, last_seen = NOW() WHERE id = %s", (user_id,))
        conn.commit()
        cursor.close()
        conn.close()
        
        emit('user_status_change', {'userId': user_id, 'status': 'offline'}, broadcast=True)
        leave_room(f"user_{user_id}")


@socketio.on('send_global_message')
def handle_global_message(data):
    user_id = verify_socket_token(data.get('token'))
    content = data.get('content')
    
    if not user_id or not content or not content.strip():
        return

    conn = get_db_connection()
    cursor = conn.cursor(dictionary=True)
    
    cursor.execute(
        "INSERT INTO global_messages (user_id, content) VALUES (%s, %s)",
        (user_id, content)
    )
    message_id = cursor.lastrowid
    
    cursor.execute("SELECT username FROM users WHERE id = %s", (user_id,))
    username = cursor.fetchone()['username']
    conn.commit()
    cursor.close()
    conn.close()

    message_data = {
        'id': message_id,
        'user_id': user_id,
        'username': username,
        'content': content,
        'timestamp': datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }
    
    emit('receive_global_message', message_data, broadcast=True)

@socketio.on('send_private_message')
def handle_private_message(data):
    sender_id = verify_socket_token(data.get('token'))
    receiver_id = data.get('receiver_id')
    content = data.get('content')
    
    if not sender_id or not receiver_id or not content.strip():
        return
        
    conn = get_db_connection()
    
    cursor = conn.cursor(dictionary=True, buffered=True) 
    
    cursor.execute("""
        SELECT status FROM chat_requests 
        WHERE (sender_id = %s AND receiver_id = %s) OR (sender_id = %s AND receiver_id = %s)
    """, (sender_id, receiver_id, receiver_id, sender_id))
    rel = cursor.fetchone()
    
    if rel and rel['status'] == 'accepted':
        cursor.execute(
            "INSERT INTO private_messages (sender_id, receiver_id, content) VALUES (%s, %s, %s)",
            (sender_id, receiver_id, content)
        )
        message_id = cursor.lastrowid
        cursor.execute("SELECT username FROM users WHERE id = %s", (sender_id,))
        sender_name = cursor.fetchone()['username']
        conn.commit()
        
        message_data = {
            'id': message_id,
            'sender_id': sender_id,
            'receiver_id': receiver_id,
            'sender_name': sender_name,
            'content': content,
            'timestamp': datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }
        
        emit('receive_private_message', message_data, room=f"user_{receiver_id}")
        emit('receive_private_message', message_data, room=f"user_{sender_id}")
        
    cursor.close()
    conn.close()


if __name__ == '__main__':
    socketio.run(app, port=5000, debug=True)