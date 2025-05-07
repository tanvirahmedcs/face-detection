from flask import Flask, request, jsonify, send_from_directory
import face_recognition
import numpy as np
import sqlite3
import os
from datetime import datetime
import io
import pandas as pd
from flask import session
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)
app.secret_key = 'your_secret_key_here'  # Change this to a secure random key

DATABASE = 'attendance.db'

def init_db():
    conn = sqlite3.connect(DATABASE)
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS students (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id TEXT UNIQUE,
            name TEXT NOT NULL,
            department TEXT,
            encoding BLOB NOT NULL
        )
    ''')
    c.execute('''
        CREATE TABLE IF NOT EXISTS attendance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER,
            timestamp TEXT,
            FOREIGN KEY(student_id) REFERENCES students(id)
        )
    ''')
    c.execute('''
        CREATE TABLE IF NOT EXISTS teachers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL
        )
    ''')
    conn.commit()
    conn.close()

def get_db_connection():
    conn = sqlite3.connect(DATABASE)
    return conn

@app.route('/register', methods=['POST'])
def register_student():
    data = request.json
    name = data.get('name')
    student_id = data.get('student_id')
    department = data.get('department')
    image_data = data.get('image')  # Expect base64 encoded image string

    if not name or not image_data or not student_id:
        return jsonify({'error': 'Student ID, name, and image are required'}), 400

    # Decode image and get face encoding
    import base64
    from io import BytesIO
    from PIL import Image

    try:
        img_bytes = base64.b64decode(image_data)
        img = Image.open(BytesIO(img_bytes))
        img = np.array(img)
        face_encodings = face_recognition.face_encodings(img)
        if len(face_encodings) == 0:
            return jsonify({'error': 'No face found in the image'}), 400
        encoding = face_encodings[0]
    except Exception as e:
        return jsonify({'error': 'Invalid image data or processing error', 'details': str(e)}), 400

    # Store student in DB
    conn = get_db_connection()
    c = conn.cursor()
    try:
        c.execute('INSERT INTO students (student_id, name, department, encoding) VALUES (?, ?, ?, ?)', (student_id, name, department, encoding.tobytes()))
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({'error': 'Student ID already exists'}), 400
    conn.close()

    return jsonify({'message': f'Student {name} registered successfully'})

@app.route('/attendance', methods=['POST'])
def mark_attendance():
    data = request.json
    image_data = data.get('image')  # Expect base64 encoded image string

    if not image_data:
        return jsonify({'error': 'Image is required'}), 400

    import base64
    from io import BytesIO
    from PIL import Image

    try:
        img_bytes = base64.b64decode(image_data)
        img = Image.open(BytesIO(img_bytes))
        img = np.array(img)
        face_encodings = face_recognition.face_encodings(img)
        if len(face_encodings) == 0:
            return jsonify({'error': 'No face found in the image'}), 400
        unknown_encoding = face_encodings[0]
    except Exception as e:
        return jsonify({'error': 'Invalid image data or processing error', 'details': str(e)}), 400

    # Load all student encodings from DB
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('SELECT id, name, encoding FROM students')
    students = c.fetchall()

    known_encodings = []
    student_ids = []
    student_names = []
    for s in students:
        student_ids.append(s[0])
        student_names.append(s[1])
        known_encodings.append(np.frombuffer(s[2], dtype=np.float64))

    matches = face_recognition.compare_faces(known_encodings, unknown_encoding)
    if True in matches:
        match_index = matches.index(True)
        student_id = student_ids[match_index]
        student_name = student_names[match_index]

        # Record attendance
        timestamp = datetime.now().isoformat()
        c.execute('INSERT INTO attendance (student_id, timestamp) VALUES (?, ?)', (student_id, timestamp))
        conn.commit()
        conn.close()

        return jsonify({'message': f'Attendance marked for {student_name}', 'timestamp': timestamp})
    else:
        conn.close()
        return jsonify({'error': 'Face not recognized'}), 404

@app.route('/attendance_records', methods=['GET'])
def get_attendance_records():
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('''
        SELECT students.student_id, students.name, students.department, attendance.timestamp
        FROM attendance
        JOIN students ON attendance.student_id = students.id
        ORDER BY attendance.timestamp DESC
    ''')
    records = c.fetchall()
    conn.close()

    result = [{'student_id': r[0], 'name': r[1], 'department': r[2], 'timestamp': r[3]} for r in records]
    return jsonify(result)

@app.route('/export_attendance', methods=['GET'])
def export_attendance():
    if 'teacher_logged_in' not in session:
        return jsonify({'error': 'Unauthorized'}), 401

    conn = get_db_connection()
    c = conn.cursor()
    c.execute('''
        SELECT students.student_id, students.name, students.department, attendance.timestamp
        FROM attendance
        JOIN students ON attendance.student_id = students.id
        ORDER BY attendance.timestamp DESC
    ''')
    records = c.fetchall()
    conn.close()

    df = pd.DataFrame(records, columns=['Student ID', 'Name', 'Department', 'Timestamp'])
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
        df.to_excel(writer, index=False, sheet_name='Attendance')
    output.seek(0)

    from flask import send_file
    return send_file(output, attachment_filename='attendance_records.xlsx', as_attachment=True)

@app.route('/teacher_login', methods=['POST'])
def teacher_login():
    data = request.json
    username = data.get('username')
    password = data.get('password')

    if not username or not password:
        return jsonify({'error': 'Username and password are required'}), 400

    conn = get_db_connection()
    c = conn.cursor()
    c.execute('SELECT password FROM teachers WHERE username = ?', (username,))
    row = c.fetchone()
    conn.close()

    if row and check_password_hash(row[0], password):
        session['teacher_logged_in'] = True
        session['teacher_username'] = username
        return jsonify({'message': 'Login successful'})
    else:
        return jsonify({'error': 'Invalid username or password'}), 401

@app.route('/teacher_logout', methods=['POST'])
def teacher_logout():
    session.pop('teacher_logged_in', None)
    session.pop('teacher_username', None)
    return jsonify({'message': 'Logged out'})

@app.route('/')
def serve_frontend():
    return send_from_directory('../frontend', 'index.html')

@app.route('/<path:path>')
def serve_static_files(path):
    return send_from_directory('../frontend', path)

if __name__ == '__main__':
    if not os.path.exists(DATABASE):
        init_db()
    app.run(host='0.0.0.0', port=5000, debug=True)
